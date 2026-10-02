/*
  ANGEBOTE MIT KATALOGARTIKELN, POSITIONSRABATT, TITEL- UND TEXTZEILEN
  (Testbericht 30.09.2026, M18; entschieden am 02.10.2026).

  Eine Zeile auf Angebot und Rechnung ist jetzt eine von drei Arten:

    position  Menge × Einzelpreis, wie bisher — dazu wahlweise ein Rabatt in
              Prozent auf genau diese Zeile; das Netto steht nach Abzug da
    titel     eine Überschrift über die folgenden Positionen; der Beleg nennt
              ihre Summe
    text      ein Hinweis ohne Preis

  Titel und Text tragen weder Menge noch Preis noch Rabatt — die Datenbank
  hält das fest, damit eine Zeile ohne Preis nie heimlich in die Summe
  rutscht. Ältere Zeilen sind Positionen ohne Rabatt; keine ändert sich.

  Eine Position aus dem Katalog merkt sich ihren Artikel (`material_id`),
  nur zum Nachsehen: der Preis steht an der Zeile, und ein später geänderter
  Katalogpreis ändert kein verschicktes Angebot. Wird der Artikel gelöscht,
  bleibt die Zeile.

  Die Rechnung übernimmt Art und Rabatt aus dem Angebot (Pauschale und
  Einheitspreis), darum dieselben Spalten an `invoice_lines`.
  `angebot_speichern` und `rechnung_anlegen` sind unverändert bis auf die
  eingefügten Spalten (Rumpf aus 20260930260000 bzw. 20260929160000).
*/

-- ---------------------------------------------------------------------------
-- 1. Die Spalten
-- ---------------------------------------------------------------------------

alter table public.quote_lines
  add column if not exists art text not null default 'position',
  add column if not exists rabatt_prozent numeric(5,2),
  add column if not exists material_id uuid references public.materials(id) on delete set null;

alter table public.invoice_lines
  add column if not exists art text not null default 'position',
  add column if not exists rabatt_prozent numeric(5,2);

alter table public.quote_lines drop constraint if exists quote_lines_art;
alter table public.quote_lines add constraint quote_lines_art
  check (art in ('position', 'titel', 'text'));
alter table public.quote_lines drop constraint if exists quote_lines_rabatt;
alter table public.quote_lines add constraint quote_lines_rabatt
  check (rabatt_prozent is null or (rabatt_prozent > 0 and rabatt_prozent < 100));
alter table public.quote_lines drop constraint if exists quote_lines_ohne_preis;
alter table public.quote_lines add constraint quote_lines_ohne_preis
  check (art = 'position' or (qty = 0 and unit_price = 0 and netto = 0 and rabatt_prozent is null));

alter table public.invoice_lines drop constraint if exists invoice_lines_art;
alter table public.invoice_lines add constraint invoice_lines_art
  check (art in ('position', 'titel', 'text'));
alter table public.invoice_lines drop constraint if exists invoice_lines_rabatt;
alter table public.invoice_lines add constraint invoice_lines_rabatt
  check (rabatt_prozent is null or (rabatt_prozent > 0 and rabatt_prozent < 100));
alter table public.invoice_lines drop constraint if exists invoice_lines_ohne_preis;
alter table public.invoice_lines add constraint invoice_lines_ohne_preis
  check (art = 'position' or (qty = 0 and unit_price = 0 and netto = 0 and rabatt_prozent is null));

create index if not exists quote_lines_material on public.quote_lines (material_id) where material_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Angebot speichern — mit Art, Rabatt und Artikel
-- ---------------------------------------------------------------------------

create or replace function public.angebot_speichern(
  p_id uuid,
  p_kopf jsonb,
  p_positionen jsonb
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  alt public.quotes;
  neu public.quotes;
  kennung uuid;
  zeile jsonb;
  lauf integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into alt from public.quotes where id = p_id;
  end if;

  if alt.id is null then
    neu := jsonb_populate_record(null::public.quotes, p_kopf);
    -- Eine neue Fassung verweist nur auf ein Angebot DIESES Betriebs.
    if neu.vorgaenger_id is not null and not exists (
      select 1 from public.quotes v where v.id = neu.vorgaenger_id and v.company_id = betrieb
    ) then
      raise exception 'Das Angebot, das überarbeitet werden soll, gibt es in diesem Betrieb nicht'
        using errcode = '23503';
    end if;
    insert into public.quotes (
      company_id, quote_number, customer_id, customer_name, address,
      quote_date, valid_until, status, discount_mode, discount_value,
      discount_label, discount_amount, subtotal_netto, total_netto,
      total_vat, total_brutto, vat_rate, kalkulierte_stunden, notes,
      project_number, vorgaenger_id
    ) values (
      betrieb, neu.quote_number, neu.customer_id, neu.customer_name,
      neu.address, neu.quote_date, neu.valid_until,
      coalesce(neu.status, 'Entwurf'), neu.discount_mode, neu.discount_value,
      neu.discount_label, neu.discount_amount,
      coalesce(neu.subtotal_netto, 0), coalesce(neu.total_netto, 0),
      coalesce(neu.total_vat, 0), coalesce(neu.total_brutto, 0),
      neu.vat_rate, coalesce(neu.kalkulierte_stunden, 0), neu.notes,
      neu.project_number, neu.vorgaenger_id
    ) returning id into kennung;
  else
    kennung := alt.id;
    neu := jsonb_populate_record(alt, p_kopf);

    /*
      NUR DER ENTWURF ÄNDERT SEINEN INHALT. Verglichen wird Spalte für
      Spalte statt „wurde etwas mitgeschickt": die Ansicht schickt beim
      Annehmen den Status und die Baustelle, und das soll weiter gehen.
    */
    if alt.status <> 'Entwurf' and (
         p_positionen is not null
      or (neu.quote_number, neu.customer_id, neu.customer_name, neu.address,
          neu.quote_date, neu.valid_until, neu.discount_mode, neu.discount_value,
          neu.discount_label, neu.discount_amount, neu.subtotal_netto,
          neu.total_netto, neu.total_vat, neu.total_brutto, neu.vat_rate,
          neu.kalkulierte_stunden, neu.notes)
         is distinct from
         (alt.quote_number, alt.customer_id, alt.customer_name, alt.address,
          alt.quote_date, alt.valid_until, alt.discount_mode, alt.discount_value,
          alt.discount_label, alt.discount_amount, alt.subtotal_netto,
          alt.total_netto, alt.total_vat, alt.total_brutto, alt.vat_rate,
          alt.kalkulierte_stunden, alt.notes)
    ) then
      raise exception 'Nur ein Entwurf lässt sich ändern — dieses Angebot ist „%"', alt.status
        using errcode = '55000';
    end if;

    update public.quotes set
      quote_number        = neu.quote_number,
      customer_id         = neu.customer_id,
      customer_name       = neu.customer_name,
      address             = neu.address,
      quote_date          = neu.quote_date,
      valid_until         = neu.valid_until,
      status              = neu.status,
      discount_mode       = neu.discount_mode,
      discount_value      = neu.discount_value,
      discount_label      = neu.discount_label,
      discount_amount     = neu.discount_amount,
      subtotal_netto      = neu.subtotal_netto,
      total_netto         = neu.total_netto,
      total_vat           = neu.total_vat,
      total_brutto        = neu.total_brutto,
      vat_rate            = neu.vat_rate,
      kalkulierte_stunden = neu.kalkulierte_stunden,
      notes               = neu.notes,
      project_number      = neu.project_number
     where id = kennung;
  end if;

  if p_positionen is not null then
    delete from public.quote_lines where quote_id = kennung;
    for zeile in select * from jsonb_array_elements(p_positionen) loop
      insert into public.quote_lines (
        company_id, quote_id, position, label, qty, unit, unit_price, netto,
        ist_arbeitszeit, art, rabatt_prozent, material_id
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric, (zeile ->> 'ist_arbeitszeit')::boolean,
        coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric,
        -- Ein Artikel aus einem fremden Betrieb bleibt kein Verweis.
        (select m.id from public.materials m
          where m.id = nullif(zeile ->> 'material_id', '')::uuid and m.company_id = betrieb)
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rechnung anlegen — mit Art und Rabatt
-- ---------------------------------------------------------------------------

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

  perform set_config('app.rechnung_legt', 'ja', true);

  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, steuerbefreiung, customer_vat_id, address, leistungsort,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto,
    skonto_prozent, skonto_bis
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
    neu.skonto_prozent, neu.skonto_bis
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(p_positionen) loop
    insert into public.invoice_lines (
      company_id, invoice_id, position, label, qty, unit, unit_price, netto,
      art, rabatt_prozent
    ) values (
      betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
      coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
      (zeile ->> 'netto')::numeric,
      coalesce(zeile ->> 'art', 'position'), (zeile ->> 'rabatt_prozent')::numeric
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
    else
      -- Scheine tragen keinen Verrechnungsstand; über sie wacht
      -- `app.beleg_nur_einmal` an der Abdeckung.
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
$$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;
