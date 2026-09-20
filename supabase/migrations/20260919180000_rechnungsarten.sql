-- ---------------------------------------------------------------------------
-- Anzahlung, Teilrechnung, Schlussrechnung
-- ---------------------------------------------------------------------------
--
-- WARUM DAS KEINE KOMFORTFUNKTION IST. Ein Betrieb, der Baustellen abwickelt
-- und keine Teilrechnung stellen kann, kann die App für Baustellen nicht
-- verwenden: bei einer Sanierung über vier Monate auf die Schlussrechnung zu
-- warten, heisst vier Monate vorzufinanzieren.
--
-- UND EINE STEUERFALLE HÄNGT DARAN. § 11 Abs 12 UStG: wer eine Steuer
-- ausweist, schuldet sie. Stellt der Betrieb eine Anzahlungsrechnung über
-- 3.000 € mit 500 € USt und danach eine Schlussrechnung über die volle
-- Leistung mit der vollen Steuer, hat er dieselbe Steuer zweimal ausgewiesen
-- — und schuldet sie zweimal, bis er berichtigt. Deshalb MUSS die
-- Schlussrechnung die bereits verrechneten Teilentgelte samt Steuer abziehen
-- und einzeln ausweisen.

/*
  `art` — und ja, `invoice_coverage` hat auch eine Spalte dieses Namens. Das
  ist kein Versehen: dort steht die Art des BELEGS (Zeiteintrag oder
  Materialanforderung), hier die Art der RECHNUNG. In `rechnung_anlegen` wird
  die Schleifenvariable deshalb `belegart` genannt.
*/
alter table invoices add column art text not null default 'einzel'
  check (art in ('einzel', 'anzahlung', 'teil', 'schluss'));

/*
  DIE ABGEZOGENEN VORRECHNUNGEN ALS KOPIE, nicht als blosse Verweisliste.

  Dieselbe Überlegung wie bei den Positionen: eine Rechnung ist ein Dokument
  und kein Blick auf den aktuellen Datenbestand. Der Abzug steht mit Nummer,
  Datum und Beträgen so auf dem Beleg, wie er beim Kunden ankam — auch dann
  noch, wenn die abgezogene Rechnung später storniert wird.

  Die Kennung steht mit drin, damit sich prüfen lässt, ob dieselbe Anzahlung
  zweimal abgezogen wird. Genau das ist der teure Fehler: der Kunde zahlt zu
  wenig, und im Betrieb fällt es erst beim Jahresabschluss auf.

  DIE SCHLÜSSEL DARIN SIND `camelCase` und bleiben es. Spaltennamen rechnet
  `felder.ts` zwischen App und Datenbank um; in ein jsonb sieht sie nicht
  hinein. Was hier steht, kommt in der App genau so an — snake_case ergäbe
  ein Feld `invoice_id` mitten in einem Typ, der sonst durchgehend
  `invoiceId` schreibt.
*/
alter table invoices add column vorrechnungen jsonb;

/*
  DIE GESAMTLEISTUNG STEHT NEBEN DER FORDERUNG.

  `total_netto`/`total_vat`/`total_brutto` bleiben das, was DIESE Rechnung
  fordert — daran hängen die offenen Posten, der Mahnlauf und der
  Zahlungsstand, und die dürfen bei einer Schlussrechnung nicht die volle
  Leistung ansetzen, von der drei Viertel längst verrechnet sind.

  Die volle Leistung steht deshalb getrennt daneben. Sie gehört auf den Beleg
  (der Kunde will sehen, worüber abgerechnet wird) und in keine Summe der
  offenen Forderungen.
*/
alter table invoices add column gesamt_netto  numeric(12,2);
alter table invoices add column gesamt_vat    numeric(12,2);
alter table invoices add column gesamt_brutto numeric(12,2);

-- ---------------------------------------------------------------------------
-- Was `rechnung_anlegen` mitschreiben muss
-- ---------------------------------------------------------------------------

/*
  DIE SPALTENLISTE IST AUSDRÜCKLICH, und das ist gut so — eine neue Spalte
  fällt hier auf, statt still leer zu bleiben. Der Preis dafür ist genau
  diese Stelle: wer eine Spalte hinzufügt und sie hier vergisst, bekommt eine
  Rechnung ohne sie, ohne jede Fehlermeldung.
*/
create or replace function public.rechnung_anlegen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  neu public.invoices;
  kennung uuid;
  zeile jsonb;
  belegart text;
  lauf integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  neu := jsonb_populate_record(null::public.invoices, p_kopf);
  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, customer_vat_id, address,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false), neu.customer_vat_id,
    neu.address, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen'),
    coalesce(neu.art, 'einzel'), neu.vorrechnungen,
    neu.gesamt_netto, neu.gesamt_vat, neu.gesamt_brutto
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(coalesce(p_positionen, '[]'::jsonb)) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric
    );
    lauf := lauf + 1;
  end loop;

  for belegart in select * from jsonb_object_keys(coalesce(p_belege, '{}'::jsonb)) loop
    insert into public.invoice_coverage (company_id, invoice_id, art, ziel_id)
    select betrieb, kennung, belegart, z::uuid
      from jsonb_array_elements_text(p_belege -> belegart) z;
  end loop;

  return kennung;
end;
$$;
revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Zwei Wächter über den Abzug
-- ---------------------------------------------------------------------------

/*
  ERSTENS: ABGEZOGEN WIRD NUR, WAS ES GIBT — im selben Betrieb und auf
  derselben Baustelle.

  Eine Schlussrechnung, die eine fremde Anzahlung abzieht, fordert zu wenig
  und verschiebt den Erlös zwischen zwei Baustellen. Beides fällt in der
  Nachkalkulation auf, und zwar Monate später und ohne erkennbare Ursache.

  ZWEITENS: KEINE ANZAHLUNG ZWEIMAL. Wird dieselbe Anzahlung auf zwei
  Schlussrechnungen abgezogen, bekommt der Betrieb ihren Betrag nie —
  einmal ist er verrechnet, zweimal abgezogen.
*/
create or replace function app.vorrechnungen_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  eintrag jsonb;
  kennung uuid;
  fremd integer;
  doppelt integer;
begin
  if new.vorrechnungen is null or jsonb_array_length(new.vorrechnungen) = 0 then
    return new;
  end if;

  for eintrag in select * from jsonb_array_elements(new.vorrechnungen) loop
    kennung := (eintrag ->> 'invoiceId')::uuid;

    select count(*) into fremd
      from public.invoices i
     where i.id = kennung
       and i.company_id = new.company_id
       and i.project_number = new.project_number;
    if fremd = 0 then
      raise exception 'Abgezogen werden kann nur eine Rechnung desselben Betriebs auf derselben Baustelle'
        using errcode = '42501';
    end if;

    /*
      Die eigene Zeile zählt nicht mit: beim Ändern derselben Rechnung stünde
      sie sonst als ihr eigener Doppelabzug da.
    */
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
  end loop;

  return new;
end;
$$;

create trigger invoices_vorrechnungen before insert or update on invoices
  for each row execute function app.vorrechnungen_pruefen();

/*
  UND DAS DOKUMENT BLEIBT EIN DOKUMENT. Art, Abzüge und Gesamtleistung stehen
  auf dem Beleg, den der Kunde bekommen hat — sie gehören zu den Feldern, die
  sich nach dem Ausstellen nicht mehr bewegen.
*/
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.total_netto is distinct from old.total_netto
     or new.total_vat is distinct from old.total_vat
     or new.total_brutto is distinct from old.total_brutto
     or new.vat_rate is distinct from old.vat_rate
     or new.reverse_charge is distinct from old.reverse_charge
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis
     or new.art is distinct from old.art
     or new.vorrechnungen is distinct from old.vorrechnungen
     or new.gesamt_netto is distinct from old.gesamt_netto
     or new.gesamt_vat is distinct from old.gesamt_vat
     or new.gesamt_brutto is distinct from old.gesamt_brutto then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;

  if not app.zahlstand_laeuft() then
    if new.bezahlt_betrag is distinct from old.bezahlt_betrag then
      raise exception 'Der bezahlte Betrag ergibt sich aus den Zahlungseingängen'
        using errcode = '42501';
    end if;
    if new.payment_status is distinct from old.payment_status
       and (new.payment_status in ('Teilbezahlt', 'Bezahlt', 'Überzahlt')
            or (old.payment_status in ('Teilbezahlt', 'Bezahlt', 'Überzahlt')
                and new.payment_status <> 'Storniert')) then
      raise exception 'Der Zahlungsstand ergibt sich aus den Zahlungseingängen'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
