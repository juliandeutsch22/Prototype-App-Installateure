-- PAKET 1 DES TESTBERICHTS VOM 30.09.2026 — GELD UND BELEGE.
--
--   K2  Eine Schlussrechnung muss die offenen Anzahlungs- und Teilrechnungen
--       ihrer Baustelle abziehen. Bisher war der Abzug freiwillig.
--   H4  Ein Storno braucht einen Grund, in der Datenbank und nicht nur in
--       der Maske. Die Maske setzte „Storno ohne Angabe“ ein.
--   H5  „Überfällig“ hängt am Zahlungsziel. Es liess sich von Hand setzen,
--       auch zwei Wochen vor der Fälligkeit — und dann mahnen.
--   H6  Die Stornorechnung zieht ihre Nummer aus dem Jahr, in dem sie
--       ausgestellt wird; ihr Datum auf dem Beleg ist das Ausstellungsdatum.
--
-- Bestehende Belege bleiben, wie sie sind. Einzige Ausnahme ist ein
-- „Überfällig“ vor der Fälligkeit: das ist kein Beleg, sondern ein falscher
-- abgeleiteter Stand, und er wird zurückgesetzt.

-- ---------------------------------------------------------------------------
-- K2 — die Fassung aus `20260926102000_abzug_gleiche_steuer.sql`, dazu der
-- markierte Absatz am Anfang.
-- ---------------------------------------------------------------------------

create or replace function app.vorrechnungen_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
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

    Nur beim Anlegen und nicht für den Dienstschlüssel: ein zurückgespielter
    Bestand ist, wie er war.
  */
  if tg_op = 'INSERT' and not app.ist_dienst() and new.art = 'schluss' then
    select string_agg(i.invoice_number, ', ' order by i.invoice_number) into fehlend
      from public.invoices i
     where i.company_id = new.company_id
       and i.project_number = new.project_number
       and i.id is distinct from new.id
       and i.art in ('anzahlung', 'teil')
       and i.payment_status is distinct from 'Storniert'
       and coalesce(i.reverse_charge, false) = coalesce(new.reverse_charge, false)
       and not exists (select 1 from public.invoice_coverage c where c.invoice_id = i.id)
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
      NEU (Prüflauf 25.09.2026, P2-08 und P2-15) — nur beim Anlegen, und
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
    if tg_op = 'INSERT' and not app.ist_dienst() then
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
     where c.invoice_id = kennung;
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

/*
  WAS SCHON DRAUSSEN IST, bleibt draussen — aber es wird sichtbar. Diese
  Abfrage listet gültige Schlussrechnungen, neben denen eine Anzahlungs- oder
  Teilrechnung derselben Baustelle steht, die nirgends abgezogen ist. Die
  Buchhaltung sieht sie vor dem Export; berichtigt wird über Storno und eine
  neue Schlussrechnung, nicht durch Umschreiben.

  Mit den Rechten des Aufrufers: wer die Rechnungen nicht lesen darf, bekommt
  nichts.
*/
create or replace function public.schlussrechnungen_ohne_abzug()
  returns table (invoice_number text, fehlend text)
  language sql
  stable
  set search_path = ''
as $$
  select s.invoice_number,
         string_agg(i.invoice_number, ', ' order by i.invoice_number)
    from public.invoices s
    join public.invoices i
      on i.company_id = s.company_id
     and i.project_number = s.project_number
     and i.id <> s.id
     and i.art in ('anzahlung', 'teil')
     and i.payment_status is distinct from 'Storniert'
     and coalesce(i.reverse_charge, false) = coalesce(s.reverse_charge, false)
   where s.company_id = app.betrieb()
     and s.art = 'schluss'
     and s.payment_status is distinct from 'Storniert'
     and not exists (select 1 from public.invoice_coverage c where c.invoice_id = i.id)
     and not exists (
       select 1 from public.invoices a
        where a.company_id = i.company_id
          and a.payment_status is distinct from 'Storniert'
          and a.vorrechnungen @> jsonb_build_array(jsonb_build_object('invoiceId', i.id::text)))
   group by s.invoice_number
   order by s.invoice_number
$$;

revoke all on function public.schlussrechnungen_ohne_abzug() from public, anon;
grant execute on function public.schlussrechnungen_ohne_abzug() to authenticated;

-- ---------------------------------------------------------------------------
-- H4 — kein Storno ohne Grund
-- ---------------------------------------------------------------------------

/*
  AN DER ZEILE, NICHT AN DER FUNKTION. Storniert wird heute über
  `rechnung_stornieren`; eine Regel dort hielte nur, solange es der einzige
  Weg bleibt. Hier greift sie bei jedem.

  Der Grund steht in der Rechnungsliste, im Ausgangsbuch und im BMD-Stapel —
  bei einer Betriebsprüfung ist er die Antwort auf „warum fehlt dieser
  Umsatz?“. „Storno ohne Angabe“ beantwortet das nicht.

  Nur für neue Stornos: bestehende bleiben, wie sie ausgestellt wurden.
*/
create or replace function app.storno_braucht_grund() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.payment_status = 'Storniert'
     and old.payment_status is distinct from 'Storniert'
     and btrim(coalesce(new.cancellation_note, '')) = '' then
    raise exception 'Ein Storno braucht einen Grund — er steht in der Liste, im Ausgangsbuch und im Buchungsstapel'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_storno_braucht_grund on public.invoices;
create trigger invoices_storno_braucht_grund
  before update of payment_status on public.invoices
  for each row execute function app.storno_braucht_grund();

-- ---------------------------------------------------------------------------
-- H5 — „Überfällig“ nur nach dem Zahlungsziel
-- ---------------------------------------------------------------------------

/*
  „ÜBERFÄLLIG“ IST KEINE MEINUNG, sondern ein Datum. Die App setzt den Stand
  beim Laden selbst, sobald das Zahlungsziel vorbei ist; von Hand liess er
  sich bisher jederzeit setzen — und schlug dann auf Startseite, Mahnlauf,
  Ausgangsbuch und Export durch, bevor der Kunde im Verzug war.

  Jetzt gilt in beide Richtungen: „Überfällig“ nur nach dem Zahlungsziel,
  „Offen“ nur davor. Der Zahlungsstand, den die Datenbank aus den Eingängen
  rechnet, bleibt davon unberührt (`app.zahlstand_laeuft`), ebenso der
  Dienstschlüssel beim Zurückspielen.
*/
create or replace function app.ueberfaellig_nach_frist() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if app.zahlstand_laeuft() or app.ist_dienst() then
    return new;
  end if;
  if new.payment_status = 'Überfällig' and old.payment_status = 'Offen'
     and new.due_date >= heute then
    raise exception 'Überfällig ist eine Rechnung erst nach ihrem Zahlungsziel (%)', to_char(new.due_date, 'DD.MM.YYYY')
      using errcode = '23514';
  end if;
  if new.payment_status = 'Offen' and old.payment_status = 'Überfällig'
     and new.due_date < heute then
    raise exception 'Das Zahlungsziel (%) ist vorbei — die Rechnung ist überfällig', to_char(new.due_date, 'DD.MM.YYYY')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_ueberfaellig_nach_frist on public.invoices;
create trigger invoices_ueberfaellig_nach_frist
  before update of payment_status on public.invoices
  for each row execute function app.ueberfaellig_nach_frist();

-- Was bisher zu früh auf „Überfällig“ stand, ist wieder „Offen“.
update public.invoices
   set payment_status = 'Offen'
 where payment_status = 'Überfällig'
   and due_date >= (now() at time zone 'Europe/Vienna')::date;

-- ---------------------------------------------------------------------------
-- H6 — die Stornorechnung zählt im Jahr ihrer Ausstellung
-- ---------------------------------------------------------------------------

/*
  Fassung aus `20260929150000_stornorechnung.sql`; geändert ist nur das Jahr.

  BISHER trug die Stornorechnung den Tag des Stornos. Wurde sie Tage später
  ausgestellt, stand eine höhere Nummer mit einem älteren Datum im Kreis —
  RE-2026-1503 vom 25.09. hinter RE-2026-1502 vom 30.09. Das fällt bei jeder
  Prüfung auf. Jetzt trägt sie das Ausstellungsdatum (`storno_am`), der Tag
  des Stornos steht im Text, und die Nummer kommt aus dem Jahr der
  Ausstellung. Die Buchung im Export bleibt am Tag des Stornos; ob sie
  ebenfalls wandern soll, klärt die Steuerberatung.
*/
create or replace function public.stornorechnung_ausstellen(
  p_id uuid,
  p_praefix text
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  jahr integer;
  lfd integer;
  nummer text;
begin
  select * into rechnung from public.invoices i
   where i.id = p_id and i.company_id = app.betrieb();
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es nicht' using errcode = 'P0002';
  end if;
  if rechnung.payment_status is distinct from 'Storniert' then
    raise exception 'Eine Stornorechnung gibt es nur zu einer stornierten Rechnung'
      using errcode = '22023';
  end if;
  if rechnung.storno_nummer is not null then
    return jsonb_build_object('storno_nummer', rechnung.storno_nummer, 'storno_am', rechnung.storno_am);
  end if;

  jahr := extract(year from (now() at time zone 'Europe/Vienna'))::integer;
  lfd := public.naechste_nummer('invoices', jahr);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  perform set_config('senklot.stornorechnung', p_id::text, true);
  update public.invoices
     set storno_nummer = nummer, storno_am = now()
   where id = p_id;
  perform set_config('senklot.stornorechnung', '', true);

  return jsonb_build_object('storno_nummer', nummer, 'storno_am', now());
end;
$$;

revoke all on function public.stornorechnung_ausstellen(uuid, text) from public, anon;
grant execute on function public.stornorechnung_ausstellen(uuid, text) to authenticated;
