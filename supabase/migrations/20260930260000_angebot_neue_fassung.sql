-- TESTBERICHT 30.09.2026, M17 — EIN VERSENDETES ANGEBOT ÜBERARBEITEN.
--
-- Was beim Kunden liegt, ändert sich nicht (`angebot_speichern` weist das
-- seit dem 24.09. ab). Überarbeiten heisst deshalb: eine NEUE FASSUNG als
-- eigener Entwurf mit eigener Nummer, die auf ihren Vorgänger verweist. Der
-- Vorgänger bleibt, wie er versendet wurde.
--
-- Der Verweis wird nur beim Anlegen gesetzt; ändern lässt er sich nicht
-- (die Aktualisierung unten fasst die Spalte nicht an). Wird der Vorgänger
-- gelöscht (nur ein Entwurf kann das), bleibt die Fassung ohne Verweis.

alter table public.quotes
  add column if not exists vorgaenger_id uuid references public.quotes(id) on delete set null;

create index if not exists quotes_vorgaenger on public.quotes (vorgaenger_id)
  where vorgaenger_id is not null;

-- Unverändert aus 20260929120000_support_arbeitet_mit.sql, bis auf den
-- Verweis auf den Vorgänger beim Anlegen.
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
        ist_arbeitszeit
      ) values (
        betrieb, kennung, lauf, zeile ->> 'label', (zeile ->> 'qty')::numeric,
        coalesce(zeile ->> 'unit', ''), (zeile ->> 'unit_price')::numeric,
        (zeile ->> 'netto')::numeric, (zeile ->> 'ist_arbeitszeit')::boolean
      );
      lauf := lauf + 1;
    end loop;
  end if;

  return kennung;
end;
$$;
