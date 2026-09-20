-- ---------------------------------------------------------------------------
-- Der Abzug muss aufgehen
-- ---------------------------------------------------------------------------
--
-- Stufe 10.2a hat die Felder angelegt und geprüft, WELCHE Rechnung abgezogen
-- werden darf. Was sie noch nicht geprüft hat, ist die Rechnung selbst:
--
--   Gesamtleistung − abgezogene Vorrechnungen = das, was diese Rechnung fordert
--
-- Geht sie nicht auf, steht auf dem Beleg eine Forderung, die zu den
-- ausgewiesenen Zahlen nicht passt. Der Kunde zahlt dann entweder zu wenig
-- (und der Betrieb merkt es beim Jahresabschluss) oder zu viel (und der
-- Betrieb weist Steuer aus, die er schuldet, § 11 Abs 12 UStG).
--
-- WARUM DAS IN DER DATENBANK STEHT UND NICHT NUR IM BROWSER: die Ansicht
-- rechnet einmal, beim Anlegen. Die Datenbank rechnet bei jedem Schreibweg
-- — auch beim Rücklauf einer Sicherung und bei allem, was noch kommt.

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
begin
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
