-- ===========================================================================
-- ANZAHLUNG UND TEILRECHNUNG NACH DER SCHLUSSRECHNUNG, STORNO AUFHEBEN MIT
-- DEN PRÜFUNGEN DES ANLEGENS (Durchsicht 09.11.2026)
-- ===========================================================================
--
-- BEFUND 1. Nach einer gültigen Schlussrechnung ließ sich auf derselben
-- Baustelle noch eine Anzahlungs- oder (auf Pauschale und Einheitspreis)
-- Teilrechnung stellen. Abgezogen hat sie niemand mehr: die Schlussrechnung
-- prüft nur beim eigenen Anlegen, was sie abziehen muss
-- (`app.vorrechnungen_pruefen`), und `app.eine_schlussrechnung` fragt nur
-- nach einer zweiten Schlussrechnung. Die Umsatzsteuer stand damit zweimal
-- auf Belegen desselben Betriebs (§ 11 Abs 12 UStG).
--
-- BEFUND 2. „Storno aufheben“ (`public.rechnung_storno_aufheben`) prüfte die
-- Vorrechnungen nicht; „storniert“ und „gleiche Steuerbehandlung“ galten nur
-- beim Anlegen.
--   (a) S zieht A ab; S storniert, A storniert, S-Storno aufgehoben → S zog
--       eine stornierte Anzahlung ab.
--   (b) A storniert, neue Schlussrechnung S2 ohne A, A-Storno aufgehoben →
--       A galt wieder und wurde nie abgezogen.
--
-- BEHEBUNG. Der Wechsel von „Storniert“ auf gültig prüft dasselbe wie das
-- Anlegen. Anzahlungs- und Teilrechnungen werden abgewiesen — beim Anlegen
-- und beim Aufheben des Stornos —, solange eine gültige Schlussrechnung der
-- Baustelle sie nicht abzieht (beide Schreibweisen der Nummer, dieselbe
-- Sperre wie `app.eine_schlussrechnung`). Bestehende Daten bleiben, wie sie
-- sind; der Dienstschlüssel (Rückspielen einer Sicherung) ist ausgenommen.
--
-- Die Funktion läuft jetzt mit den Rechten ihres Eigentümers: sie prüft
-- gegen ALLE Rechnungen des Betriebs, nicht nur die, die der Aufrufer lesen
-- darf — jede Abfrage darin ist auf `new.company_id` beschränkt.

/*
  Die Fassung aus `20261106300000_wartung_abdeckung.sql`; geändert sind der
  Kopf (Rechte des Eigentümers), die Sperre, die neue Prüfung oben und die
  beiden Stellen, die bisher nur beim Anlegen galten (`neu_gueltig`).
*/
create or replace function app.vorrechnungen_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  /*
    NEU (Durchsicht 09.11.2026): GILT DIE RECHNUNG AB JETZT? Beim Anlegen
    und beim Aufheben eines Stornos — dann gelten dieselben Prüfungen.
  */
  neu_gueltig boolean := tg_op = 'INSERT';
  -- Die Baustelle in beiden Schreibweisen der Nummer, wie `app.eine_schlussrechnung`.
  schluessel text := lower(regexp_replace(trim(coalesce(new.project_number, '')), '^PR-', '', 'i'));
  schluss text;
  eintrag jsonb;
  kennung uuid;
  bezogen public.invoices;
  belegt integer;
  doppelt integer;
  summe_netto numeric(12,2) := 0;
  summe_vat numeric(12,2) := 0;
  summe_brutto numeric(12,2) := 0;
  fehlend text;
begin
  if tg_op = 'UPDATE' then
    neu_gueltig := old.payment_status = 'Storniert' and new.payment_status is distinct from 'Storniert';
  end if;

  /*
    DIESELBE SPERRE WIE `app.eine_schlussrechnung`, aber VOR der Prüfung
    der Vorrechnungen. Sonst sähe eine Schlussrechnung die Anzahlung nicht,
    die im selben Augenblick angelegt wird, und die Anzahlung die
    Schlussrechnung nicht — beide gingen durch, keine zöge die andere ab.
  */
  if neu_gueltig and not app.ist_dienst() and coalesce(new.art, 'einzel') in ('schluss', 'anzahlung', 'teil') then
    perform pg_advisory_xact_lock(hashtext('schlussrechnung:' || new.company_id || ':' || schluessel));
  end if;

  /*
    NEU (Durchsicht 09.11.2026): NACH DER SCHLUSSRECHNUNG KEINE ANZAHLUNGS-
    ODER TEILRECHNUNG MEHR, die sie nicht abzieht — weder neu noch durch
    das Aufheben eines Stornos.

    Die Schlussrechnung prüft beim Anlegen, dass sie abzieht, was vor ihr
    kam (unten). Was danach als Anzahlung oder Teilbetrag hinausginge, zöge
    niemand mehr ab, und seine Umsatzsteuer stünde zweimal auf Belegen
    desselben Betriebs (§ 11 Abs 12 UStG). Ebenso eine stornierte Anzahlung,
    deren Storno aufgehoben wird, nachdem eine neue Schlussrechnung ohne sie
    ausgestellt ist. Was nach der Schlussrechnung geleistet wird, geht als
    Rechnung; soll sie die Anzahlung abziehen, wird sie storniert und neu
    ausgestellt. Bestehende Daten bleiben, der Dienstschlüssel ist
    ausgenommen.
  */
  if neu_gueltig and not app.ist_dienst() and new.art in ('anzahlung', 'teil')
     and new.payment_status is distinct from 'Storniert' then
    select string_agg(s.invoice_number, ', ' order by s.invoice_number) into schluss
      from public.invoices s
     where s.company_id = new.company_id
       and s.id is distinct from new.id
       and s.art = 'schluss'
       and s.payment_status is distinct from 'Storniert'
       and lower(regexp_replace(trim(coalesce(s.project_number, '')), '^PR-', '', 'i')) = schluessel
       and not coalesce(s.vorrechnungen, '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('invoiceId', new.id::text));
    if schluss is not null then
      raise exception 'Für diese Baustelle gibt es schon die Schlussrechnung %. Eine Anzahlungs- oder Teilrechnung danach zöge sie nicht mehr ab (§ 11 Abs 12 UStG) — was danach geleistet wurde, geht als Rechnung; sonst zuerst % stornieren.', schluss, schluss
        using errcode = '23514';
    end if;
  end if;

  /*
    NEU (Testbericht 30.09.2026, K2): EINE SCHLUSSRECHNUNG ZIEHT AB, WAS
    ABZUZIEHEN IST — und zwar ohne dass jemand daran denken muss.

    Bis hierher war der Abzug ein Häkchen, das niemand vorauswählte. Im
    Pilotbetrieb ging RE-2026-1502 ohne die Anzahlung RE-2026-1501 hinaus:
    der Kunde sollte 12.765,48 € für einen Auftrag über 9.819,60 € zahlen,
    und die Umsatzsteuer der Anzahlung stand zweimal auf Belegen desselben
    Betriebs (§ 11 Abs 12 UStG). Alles dahinter — PDF, offene Posten,
    Skonto, Mahnlauf, Nachkalkulation, BMD — rechnete richtig, aber mit dem,
    was es bekam.

    ABZUZIEHEN IST jede Anzahlungs- und Teilrechnung derselben Baustelle, die
    gültig ist, keine Belege verbraucht hat, noch auf keiner anderen
    Schlussrechnung steht und dieselbe Steuerbehandlung trägt — genau die,
    die die Maske zum Abzug anbietet. Eine mit anderer Steuerbehandlung
    lässt sich gar nicht abziehen (unten); sie gehört berichtigt, und die
    Maske sagt das.

    Nur beim Anlegen und beim Aufheben eines Stornos (seit 09.11.2026), nicht
    für den Dienstschlüssel: ein zurückgespielter Bestand ist, wie er war.
  */
  if neu_gueltig and not app.ist_dienst() and new.art = 'schluss' then
    select string_agg(i.invoice_number, ', ' order by i.invoice_number) into fehlend
      from public.invoices i
     where i.company_id = new.company_id
       and i.project_number = new.project_number
       and i.id is distinct from new.id
       and i.art in ('anzahlung', 'teil')
       and i.payment_status is distinct from 'Storniert'
       and coalesce(i.reverse_charge, false) = coalesce(new.reverse_charge, false)
       -- Eine Wartung verbraucht keinen Beleg im Sinn des Abzugs (M01e, siehe oben).
       and not exists (select 1 from public.invoice_coverage c
                        where c.invoice_id = i.id and c.art <> 'wartung')
       and not exists (
         select 1 from public.invoices a
          where a.company_id = i.company_id
            and a.payment_status is distinct from 'Storniert'
            and a.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text)))
       and not coalesce(new.vorrechnungen, '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text));
    if fehlend is not null then
      raise exception 'Die Schlussrechnung muss abziehen, was auf dieser Baustelle schon verrechnet ist: % (§ 11 Abs 12 UStG)', fehlend
        using errcode = '42501';
    end if;
  end if;

  if new.vorrechnungen is null or jsonb_array_length(new.vorrechnungen) = 0 then
    /*
      OHNE ABZUG KEINE GESAMTLEISTUNG. Stünde sie allein da, gäbe es zwei
      Zahlen für dieselbe Sache — und beim nächsten Rechenweg wäre offen,
      welche gilt.
    */
    if new.gesamt_netto is not null or new.gesamt_vat is not null
       or new.gesamt_brutto is not null then
      raise exception 'Eine Gesamtleistung ohne abgezogene Vorrechnung wäre dasselbe wie der Rechnungsbetrag'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.gesamt_netto is null or new.gesamt_vat is null or new.gesamt_brutto is null then
    raise exception 'Wer abzieht, muss sagen, wovon — die Gesamtleistung fehlt'
      using errcode = '42501';
  end if;

  for eintrag in select * from jsonb_array_elements(new.vorrechnungen) loop
    kennung := (eintrag ->> 'invoiceId')::uuid;

    select * into bezogen
      from public.invoices i
     where i.id = kennung
       and i.company_id = new.company_id
       and i.project_number = new.project_number;
    if not found then
      raise exception 'Abgezogen werden kann nur eine Rechnung desselben Betriebs auf derselben Baustelle'
        using errcode = '42501';
    end if;

    /*
      NEU (Prüflauf 25.09.2026, P2-08 und P2-15) — nur beim Anlegen und
      beim Aufheben eines Stornos (seit 09.11.2026: sonst zöge eine wieder
      gültige Schlussrechnung eine inzwischen stornierte Anzahlung ab), und
      nicht für den Dienstschlüssel: ein zurückgespielter Bestand ist, wie er
      war, und eine später stornierte Anzahlung auf einer längst stornierten
      Schlussrechnung ist dort kein Fehler, sondern Geschichte.

      EINE STORNIERTE RECHNUNG WIRD NICHT ABGEZOGEN. Sie fordert nichts
      mehr; ihr Betrag vom Rest abgezogen hiesse, dem Kunden eine Zahlung
      gutzuschreiben, die es nicht gibt.

      ANZAHLUNG UND SCHLUSSRECHNUNG TRAGEN DIESELBE STEUERBEHANDLUNG. Eine
      Anzahlung mit 20 % USt auf einer Schlussrechnung mit Übergang der
      Steuerschuld abzuziehen, zöge ihre Steuer von einem Betrag ohne Steuer
      ab — die Restforderung wäre um genau diese Steuer zu niedrig, und die
      ausgewiesene Steuer der Anzahlung bliebe unberichtigt stehen (§ 11
      Abs 12 UStG). Umgekehrt ebenso. Ein solcher Fall gehört berichtigt,
      nicht verrechnet.
    */
    if neu_gueltig and not app.ist_dienst() then
      if bezogen.payment_status = 'Storniert' then
        raise exception 'Die Rechnung % ist storniert — abgezogen werden kann nur eine gültige Rechnung', bezogen.invoice_number
          using errcode = '42501';
      end if;
      if bezogen.reverse_charge is distinct from coalesce(new.reverse_charge, false) then
        raise exception 'Die Rechnung % ist % ausgestellt, diese %. Anzahlung und Schlussrechnung brauchen dieselbe Steuerbehandlung — sonst stimmt die abgezogene Umsatzsteuer nicht.',
          bezogen.invoice_number,
          case when bezogen.reverse_charge then 'mit Übergang der Steuerschuld' else 'mit Umsatzsteuer' end,
          case when coalesce(new.reverse_charge, false) then 'mit Übergang der Steuerschuld' else 'mit Umsatzsteuer' end
          using errcode = '42501';
      end if;
    end if;

    /*
      NUR WAS KEINE BELEGE VERBRAUCHT HAT, WIRD ABGEZOGEN — und das ist die
      Falle, an der eine Schlussrechnung sonst doppelt kürzt.

      Eine Teilrechnung über einen abgeschlossenen Bauabschnitt hat die
      Zeiteinträge und Scheine dieses Abschnitts verbraucht: sie sind als
      verrechnet markiert und tauchen in der Schlussrechnung gar nicht mehr
      auf. Ihre Summe ist also schon heraussen. Zöge man sie zusätzlich ab,
      fehlte sie zweimal — und der Betrieb stellte seine eigene Leistung dem
      Kunden gut.

      Eine Anzahlung verbraucht nichts: sie ist Geld auf Rechnung einer
      Leistung, die noch kommt. Sie MUSS abgezogen werden, sonst steht ihre
      Steuer zweimal auf Belegen desselben Betriebs.
    */
    select count(*) into belegt
      from public.invoice_coverage c
     where c.invoice_id = kennung
       and c.art <> 'wartung';
    if belegt > 0 then
      raise exception 'Diese Rechnung hat Belege verbraucht — ihre Leistung steht in der Schlussrechnung gar nicht mehr, ein Abzug zöge sie doppelt ab'
        using errcode = '42501';
    end if;

    /*
      DIE KOPIE MUSS DIE ORIGINALBETRÄGE TRAGEN. Sie steht auf dem Beleg und
      wird nie wieder nachgerechnet — ein Zahlendreher hier wäre ein
      Zahlendreher für immer.
    */
    if (eintrag ->> 'netto')::numeric is distinct from bezogen.total_netto
       or (eintrag ->> 'vat')::numeric is distinct from bezogen.total_vat
       or (eintrag ->> 'brutto')::numeric is distinct from bezogen.total_brutto then
      raise exception 'Der abgezogene Betrag stimmt nicht mit der abgezogenen Rechnung überein'
        using errcode = '42501';
    end if;

    select count(*) into doppelt
      from public.invoices i
     where i.company_id = new.company_id
       and i.id is distinct from new.id
       and i.payment_status is distinct from 'Storniert'
       and i.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', kennung::text));
    if doppelt > 0 then
      raise exception 'Diese Rechnung ist bereits auf einer anderen Schlussrechnung abgezogen'
        using errcode = '42501';
    end if;

    summe_netto := summe_netto + bezogen.total_netto;
    summe_vat := summe_vat + bezogen.total_vat;
    summe_brutto := summe_brutto + bezogen.total_brutto;
  end loop;

  if new.total_netto is distinct from new.gesamt_netto - summe_netto
     or new.total_vat is distinct from new.gesamt_vat - summe_vat
     or new.total_brutto is distinct from new.gesamt_brutto - summe_brutto then
    raise exception 'Der Rechnungsbetrag ist nicht die Gesamtleistung abzüglich der Vorrechnungen'
      using errcode = '42501';
  end if;

  /*
    EINE NEGATIVE SCHLUSSRECHNUNG IST EINE GUTSCHRIFT, und die kann diese App
    noch nicht: der Zahlungsstand, die offenen Posten und der Mahnlauf rechnen
    alle mit einer Forderung, die man begleichen kann.

    Abgewiesen statt auf null gekappt. Gekappt verschwände der Betrag, den der
    Betrieb dem Kunden zurückschuldet — lautlos und zu seinen Gunsten.
  */
  if new.total_brutto < 0 then
    raise exception 'Die Vorrechnungen übersteigen die Gesamtleistung — das wäre eine Gutschrift, und die gibt es hier noch nicht'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app.vorrechnungen_pruefen() from public, anon, authenticated;
