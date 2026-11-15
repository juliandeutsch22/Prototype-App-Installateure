-- Durchsicht 15.11.2026, G6: der Leistungsnachweis wird beim Ausstellen als
-- Teil des Belegs festgehalten; Nachdruck und Belegarchiv geben ihn wieder aus.
--
-- WAS VORHER WAR: der Haken „Leistungsnachweis anhängen“ ist beim Anlegen
-- vorbelegt, der Kunde bekam die Seite mit Datum, Person, Tätigkeit und
-- Stunden. Ob sie angehängt war, stand nirgends; „PDF erneut“ und das
-- Belegarchiv druckten die Rechnung immer ohne sie (`nachdruck.ts`:
-- `entries: []`). Aus den Buchungen ließe sie sich nicht verlässlich
-- nachbauen — eine Buchung kann sich nach der Rechnung noch ändern (Stunden,
-- Notiz, Name der Person), der ausgestellte Beleg nicht.
--
-- DIE LÖSUNG: `invoices.leistungsnachweis` hält die gedruckten Zeilen fest
-- (Tag, Person, Typ, Tätigkeit, Minuten — dazu die Kennung der Person für die
-- Datenauskunft). Geschrieben nur beim Anlegen, danach eingefroren wie jede
-- Angabe des Belegs. Null heißt: keiner angehängt.
--
-- ALTDATEN: Rechnungen davor tragen keinen Nachweis (null); ihr Nachdruck
-- bleibt, wie er war. Nachgebaut aus den heutigen Buchungen wäre er ein
-- anderer Beleg als der, den der Kunde bekam.
--
-- DATENSCHUTZ: Die Zeilen nennen Personen der Belegschaft. Sie gehören zur
-- Rechnung und werden mit ihr aufbewahrt (§ 132 BAO). In der Datenauskunft
-- einer Person stehen ihre Zeilen (`person_auskunft`, „leistungsnachweise“),
-- und die Löschung nennt sie unter dem, was aufbewahrt bleibt
-- (`person_loeschen`). Die Auskunft über einen Kunden enthält die Rechnung
-- samt Nachweis — er hat ihn mit ihr bekommen.
--
-- Verträglich mit der alten App: sie kennt die Spalte nicht und schreibt sie
-- nicht; ihre Rechnungen tragen keinen Nachweis, wie bisher.

alter table public.invoices
  add column if not exists leistungsnachweis jsonb;

alter table public.invoices
  drop constraint if exists invoices_leistungsnachweis_liste;
alter table public.invoices
  add constraint invoices_leistungsnachweis_liste
  check (leistungsnachweis is null or jsonb_typeof(leistungsnachweis) = 'array');

comment on column public.invoices.leistungsnachweis is
  'Der Leistungsnachweis, wie er mit dem Beleg gedruckt wurde (G6, 15.11.2026): Liste aus {uid, datum, mitarbeiter, typ, taetigkeit, minuten}. Geschrieben beim Anlegen, danach eingefroren. Null: keiner angehängt, und bei Rechnungen davor.';

/*
  `rechnung_anlegen` — die Fassung aus `20261116050300_erstellungsversuch.sql`;
  dazu der Leistungsnachweis.
*/
CREATE OR REPLACE FUNCTION public.rechnung_anlegen(p_kopf jsonb, p_positionen jsonb, p_belege jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  betrieb text := app.betrieb();
  neu public.invoices;
  kennung uuid;
  zeile jsonb;
  belegart text;
  lauf integer := 0;
  kennungen uuid[];
  gesperrt integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  neu := jsonb_populate_record(null::public.invoices, p_kopf);

  if p_positionen is null or jsonb_typeof(p_positionen) <> 'array'
     or jsonb_array_length(p_positionen) = 0 then
    raise exception 'Eine Rechnung ohne Positionen ist eine Rechnung über nichts — sie wird nicht angelegt.'
      using errcode = '22023';
  end if;
  if coalesce(neu.gesamt_netto, neu.total_netto, 0) <= 0 then
    raise exception 'Eine Rechnung über null Euro wird nicht angelegt — bitte die Beträge der Positionen prüfen.'
      using errcode = '22023';
  end if;

  /*
    OHNE UMSATZSTEUER UND OHNE ÜBERGANG DER STEUERSCHULD braucht die Rechnung
    den Grund der Befreiung (§ 11 Abs 1 Z 3 lit e UStG) — sonst sieht sie
    aus wie eine, auf der die Steuer vergessen wurde.
  */
  if neu.vat_rate = 0 and not coalesce(neu.reverse_charge, false)
     and btrim(coalesce(neu.steuerbefreiung, '')) = '' then
    raise exception 'Eine Rechnung ohne Umsatzsteuer braucht den Grund der Befreiung — etwa „Kleinunternehmer, § 6 Abs 1 Z 27 UStG".'
      using errcode = '22023';
  end if;

  /*
    SKONTO NUR AUF EINER RECHNUNG, DIE ABGERECHNET WIRD — Einzel- oder
    Schlussrechnung. Auf einer Anzahlung zöge die Schlussrechnung später die
    volle Anzahlung ab, obwohl der Kunde weniger gezahlt hat. Die Frist liegt
    zwischen Rechnungsdatum und Zahlungsziel.
  */
  if neu.skonto_prozent is not null then
    if coalesce(neu.art, 'einzel') not in ('einzel', 'schluss') then
      raise exception 'Skonto gibt es nur auf einer Rechnung oder Schlussrechnung, nicht auf einer Anzahlungs- oder Teilrechnung.'
        using errcode = '22023';
    end if;
    if neu.skonto_bis is null or neu.skonto_bis < neu.invoice_date
       or (neu.due_date is not null and neu.skonto_bis > neu.due_date) then
      raise exception 'Die Skontofrist muss zwischen Rechnungsdatum und Zahlungsziel liegen.'
        using errcode = '22023';
    end if;
  end if;

  /*
    DER RÜCKLASS (Stand-Datei 11.1, Punkt 5). Ein Haftrücklass behält der
    Kunde von der Rechnung über die ganze Leistung ein, bis die Gewährleistung
    abläuft; ein Deckungsrücklass von einer Teilrechnung, bis abgerechnet
    ist. Beides mindert den Zahlbetrag, nicht das Entgelt — die Steuer steht
    voll auf der Rechnung.
  */
  if neu.ruecklass_prozent is not null or neu.ruecklass_art is not null or neu.ruecklass_bis is not null then
    if neu.ruecklass_prozent is null or neu.ruecklass_art is null or neu.ruecklass_bis is null then
      raise exception 'Ein Rücklass braucht Art, Prozentsatz und Fälligkeit.' using errcode = '22023';
    end if;
    if neu.ruecklass_art = 'haft' and coalesce(neu.art, 'einzel') not in ('einzel', 'schluss') then
      raise exception 'Einen Haftrücklass gibt es auf einer Rechnung oder Schlussrechnung.' using errcode = '22023';
    end if;
    if neu.ruecklass_art = 'deckung' and coalesce(neu.art, 'einzel') <> 'teil' then
      raise exception 'Einen Deckungsrücklass gibt es auf einer Teilrechnung.' using errcode = '22023';
    end if;
    if neu.ruecklass_prozent <= 0 or neu.ruecklass_prozent > 20 then
      raise exception 'Der Rücklass liegt zwischen 0 und 20 %%.' using errcode = '22023';
    end if;
    if neu.ruecklass_bis <= neu.invoice_date then
      raise exception 'Der Rücklass wird nach dem Rechnungsdatum fällig.' using errcode = '22023';
    end if;
    -- Skonto und Rücklass zusammen seit 10.10.2026: der Skonto gilt auf den Zahlbetrag (`app.skonto_passt`).
    /*
      DER BETRAG KOMMT VOM BELEG, die Datenbank rechnet nach. Gedruckt ist,
      was die App gerechnet hat; stimmt es mit dieser Rechnung nicht auf den
      Cent, wird nichts angelegt. So können Beleg und Datensatz nicht
      auseinanderlaufen — auch nicht an einer Rundungsgrenze.
    */
    if neu.ruecklass_betrag is null
       or abs(neu.ruecklass_betrag - least(
            round(coalesce(neu.gesamt_brutto, neu.total_brutto) * neu.ruecklass_prozent / 100, 2),
            neu.total_brutto)) > 0.01 then
      raise exception 'Der Rücklass ist falsch gerechnet — bitte die Rechnung neu zusammenstellen.'
        using errcode = '22023';
    end if;
  else
    neu.ruecklass_betrag := null;
  end if;

  perform set_config('app.rechnung_legt', 'ja', true);

  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, steuerbefreiung, customer_vat_id, address, leistungsort,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto,
    skonto_prozent, skonto_bis, bestellnummer,
    ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis,
    erstellungsversuch, leistungsnachweis
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false),
    nullif(btrim(coalesce(neu.steuerbefreiung, '')), ''), neu.customer_vat_id,
    neu.address, neu.leistungsort, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen'),
    coalesce(neu.art, 'einzel'), neu.vorrechnungen,
    neu.gesamt_netto, neu.gesamt_vat, neu.gesamt_brutto,
    neu.skonto_prozent, neu.skonto_bis,
    nullif(btrim(coalesce(neu.bestellnummer, '')), ''),
    neu.ruecklass_art, neu.ruecklass_prozent, neu.ruecklass_betrag, neu.ruecklass_bis,
    -- Die Kennung des Erstellungsversuchs (G2, `rechnung_ausstellen`).
    neu.erstellungsversuch,
    -- Der Leistungsnachweis, wie er gedruckt wurde (G6) — leer heißt: keiner angehängt.
    case when jsonb_typeof(neu.leistungsnachweis) = 'array' and jsonb_array_length(neu.leistungsnachweis) > 0
         then neu.leistungsnachweis end
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(p_positionen) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto,
      art, rabatt_prozent, material_id
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric,
      coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric,
      -- Runde 3, M12: der Katalogbezug aus dem Angebot — nur ein Artikel des eigenen Betriebs.
      (select m.id from public.materials m
        where m.company_id = betrieb
          and m.id::text = nullif(zeile ->> 'material_id', ''))
    );
    lauf := lauf + 1;
  end loop;

  for belegart in select * from jsonb_object_keys(coalesce(p_belege, '{}'::jsonb)) loop
    select coalesce(array_agg(distinct z::uuid), '{}'::uuid[]) into kennungen
      from jsonb_array_elements_text(p_belege -> belegart) z;
    if cardinality(kennungen) = 0 then
      continue;
    end if;

    if belegart = 'time_entry' then
      update public.time_entries t
         set is_billed = true, invoice_number = neu.invoice_number
       where t.company_id = betrieb
         and t.id = any(kennungen)
         and t.is_billed = false;
      get diagnostics gesperrt = row_count;
    elsif belegart = 'material_order' then
      update public.material_orders m
         set is_billed = true, invoice_number = neu.invoice_number
       where m.company_id = betrieb
         and m.id = any(kennungen)
         and m.is_billed = false;
      get diagnostics gesperrt = row_count;
    elsif belegart = 'work_sheet' then
      -- Scheine tragen keinen Verrechnungsstand; über sie wacht
      -- `app.beleg_nur_einmal` an der Abdeckung. Gezählt wird hier nur, ob
      -- jeder Schein zu diesem Betrieb gehört (M01e, siehe oben).
      select count(*) into gesperrt
        from public.work_sheets s
       where s.company_id = betrieb
         and s.id = any(kennungen);
    elsif belegart = 'wartung' then
      -- Wie beim Schein: kein Verrechnungsstand an der Wartung, der Wächter
      -- zählt die Durchgänge. Hier nur: die Wartung gehört zu diesem Betrieb.
      select count(*) into gesperrt
        from public.wartungen w
       where w.company_id = betrieb
         and w.id = any(kennungen);
    else
      -- Eine unbekannte Art weist der Check der Abdeckung ab.
      gesperrt := cardinality(kennungen);
    end if;

    if gesperrt <> cardinality(kennungen) then
      raise exception 'Ein Teil der Belege ist inzwischen verrechnet oder gehört nicht zu diesem Betrieb — die Rechnung ist nicht angelegt und nichts ist gesperrt. Bitte die Positionen neu zusammenstellen.'
        using errcode = '23505';
    end if;

    insert into public.invoice_coverage (company_id, invoice_id, art, ziel_id)
    select betrieb, kennung, belegart, k from unnest(kennungen) k;
  end loop;

  perform set_config('app.rechnung_legt', '', true);
  return kennung;
end;
$function$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated, service_role;

/*
  DATENAUSKUNFT UND LÖSCHBERICHT — eingesetzt an ihrer Stelle in der
  geltenden Fassung, wie in `20261115200000_meldung_nicht_an_gemeldete.sql`.
  So bleibt jede andere Änderung an diesen Funktionen erhalten, gleich in
  welcher Reihenfolge die Migrationen eingespielt werden.

  Auskunft: ihre Zeilen auf festgehaltenen Leistungsnachweisen — mit
  Rechnung und Tag, ohne die übrigen Personen. Löschung: ihr Name steht auf
  Rechnungen und bleibt mit ihnen aufbewahrt.
*/
do $migration$
declare quelle text; marke text; neu text;
begin
  marke := $m$      'fehlerprotokoll', ($m$;
  neu := $m$      -- G6: ihre Zeilen auf festgehaltenen Leistungsnachweisen — mit Rechnung und Tag, ohne die anderen Personen.
      'leistungsnachweise', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'rechnung', r.invoice_number, 'rechnungsdatum', r.invoice_date, 'baustelle', r.project_number,
                 'tag', z ->> 'datum', 'typ', z ->> 'typ', 'taetigkeit', z ->> 'taetigkeit',
                 'minuten', (z ->> 'minuten')::integer) order by r.invoice_date, z ->> 'datum'), '[]'::jsonb)
          from public.invoices r
          cross join lateral jsonb_array_elements(r.leistungsnachweis) z
         where r.company_id = betrieb and r.leistungsnachweis is not null
           and z ->> 'uid' = p_id::text),
      'fehlerprotokoll', ($m$;
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position($m$'leistungsnachweise'$m$ in quelle) = 0 then
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Leistungsnachweise fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, neu);
  end if;

  marke := $m$        union all
        select jsonb_build_object('was','Korrekturanträge zu Arbeitszeiten'$m$;
  neu := $m$        union all
        -- G6: ihr Name auf festgehaltenen Leistungsnachweisen — Teil der Rechnung, aufbewahrt wie sie.
        select jsonb_build_object('was', 'Leistungsnachweise auf Rechnungen', 'anzahl', count(distinct r.id),
                                  'bis', max(app.aufbewahrt_bis(r.invoice_date)),
                                  'grund', '§ 132 BAO — der Leistungsnachweis gehört zur Rechnung, die sieben Jahre aufbewahrt wird')
          from public.invoices r
         where r.company_id = betrieb and r.leistungsnachweis is not null
           and exists (select 1 from jsonb_array_elements(r.leistungsnachweis) z where z ->> 'uid' = p_id::text)
        union all
        select jsonb_build_object('was','Korrekturanträge zu Arbeitszeiten'$m$;
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position($m$'Leistungsnachweise auf Rechnungen'$m$ in quelle) = 0 then
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Leistungsnachweise fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, neu);
  end if;
end;
$migration$;

/* Der Nachweis gehört zum Beleg — die Fassung aus `20261116050300_erstellungsversuch.sql`. */
create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.due_date is distinct from old.due_date
     or new.total_netto is distinct from old.total_netto
     or new.total_vat is distinct from old.total_vat
     or new.total_brutto is distinct from old.total_brutto
     or new.subtotal_netto is distinct from old.subtotal_netto
     or new.discount_mode is distinct from old.discount_mode
     or new.discount_value is distinct from old.discount_value
     or new.discount_label is distinct from old.discount_label
     or new.discount_amount is distinct from old.discount_amount
     or new.vat_rate is distinct from old.vat_rate
     or new.reverse_charge is distinct from old.reverse_charge
     or new.steuerbefreiung is distinct from old.steuerbefreiung
     or new.customer_id is distinct from old.customer_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.address is distinct from old.address
     or new.leistungsort is distinct from old.leistungsort
     or new.bestellnummer is distinct from old.bestellnummer
     or new.ruecklass_art is distinct from old.ruecklass_art
     or new.ruecklass_prozent is distinct from old.ruecklass_prozent
     or new.ruecklass_betrag is distinct from old.ruecklass_betrag
     or new.ruecklass_bis is distinct from old.ruecklass_bis
     or new.project_number is distinct from old.project_number
     or new.leistung_von is distinct from old.leistung_von
     or new.leistung_bis is distinct from old.leistung_bis
     or new.art is distinct from old.art
     or new.vorrechnungen is distinct from old.vorrechnungen
     or new.gesamt_netto is distinct from old.gesamt_netto
     or new.gesamt_vat is distinct from old.gesamt_vat
     or new.gesamt_brutto is distinct from old.gesamt_brutto
     or new.skonto_prozent is distinct from old.skonto_prozent
     or new.skonto_bis is distinct from old.skonto_bis
     or new.skonto_zugesagt is distinct from old.skonto_zugesagt
     or new.erstellungsversuch is distinct from old.erstellungsversuch
     or new.leistungsnachweis is distinct from old.leistungsnachweis then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;

  if not app.zahlstand_laeuft() then
    if new.bezahlt_betrag is distinct from old.bezahlt_betrag
       or new.skonto_betrag is distinct from old.skonto_betrag
       or new.mahnkosten_betrag is distinct from old.mahnkosten_betrag then
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

    if not app.ist_dienst()
       and ((new.payment_status = 'Storniert') is distinct from (old.payment_status = 'Storniert')
            or new.cancelled_at is distinct from old.cancelled_at
            or new.cancellation_note is distinct from old.cancellation_note) then
      raise exception 'Stornieren und einen Storno aufheben geht nur über die dafür vorgesehenen Wege — dort werden die Belege freigegeben und die Regeln geprüft'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app.rechnung_eingefroren() from public, anon, authenticated;
