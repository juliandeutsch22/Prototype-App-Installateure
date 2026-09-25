-- DIE RECHNUNG GEHT AN DEN KUNDEN, NICHT AN DIE BAUSTELLE.
--
-- Aus dem Prüflauf (25.09.2026, P2-02): Rechnung und Mahnung trugen als
-- Empfänger die Anschrift der BAUSTELLE. Eine Hausverwaltung mit zwanzig
-- Heizungen bekam ihre Rechnungen an zwanzig Mietwohnungen, die Tochter die
-- Rechnung für die Wohnung der Mutter an die Wohnung der Mutter. Richtig ist
-- die Anschrift aus dem Kundenstamm — so, wie das Angebot es seit jeher tut
-- (`angebotPdf.ts`) — und der Ort der Leistung als eigene Zeile.
--
-- `address` bleibt, was auf dem Beleg als Empfänger steht: bei neuen
-- Rechnungen die Anschrift des Kunden, bei Altbestand die der Baustelle.
-- Ein Nachdruck liest sie weiter von dort und ergibt damit denselben Beleg
-- wie beim ersten Mal. Neu ist `leistungsort` — die Anschrift der Baustelle,
-- wo sie von der des Kunden abweicht. Altbestand hat sie nicht und bekommt
-- beim Nachdruck deshalb auch keine neue Zeile.

alter table invoices add column if not exists leistungsort text;

comment on column invoices.address is
  'Anschrift des Empfängers, wie sie auf dem Beleg steht (seit 26.09.2026 aus dem Kundenstamm; Altbestand: die der Baustelle).';
comment on column invoices.leistungsort is
  'Ort der Leistung (Anschrift der Baustelle), wenn er von der Empfängeranschrift abweicht. Steht als eigene Zeile auf dem Beleg.';

-- ---------------------------------------------------------------------------
-- Anlegen schreibt ihn mit — die Fassung aus 20260926100000, plus eine Spalte
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

  perform set_config('app.rechnung_legt', 'ja', true);

  insert into public.invoices (
    company_id, invoice_number, project_number, customer_id, customer_name,
    invoice_date, due_date, subtotal_netto, discount_mode, discount_value,
    discount_label, discount_amount, total_netto, total_vat, total_brutto,
    vat_rate, reverse_charge, customer_vat_id, address, leistungsort,
    leistung_von, leistung_bis, payment_status,
    art, vorrechnungen, gesamt_netto, gesamt_vat, gesamt_brutto
  ) values (
    betrieb, neu.invoice_number, neu.project_number, neu.customer_id,
    neu.customer_name, neu.invoice_date, neu.due_date, neu.subtotal_netto,
    neu.discount_mode, neu.discount_value, neu.discount_label,
    neu.discount_amount, neu.total_netto, neu.total_vat, neu.total_brutto,
    neu.vat_rate, coalesce(neu.reverse_charge, false), neu.customer_vat_id,
    neu.address, neu.leistungsort, neu.leistung_von, neu.leistung_bis,
    coalesce(neu.payment_status, 'Offen'),
    coalesce(neu.art, 'einzel'), neu.vorrechnungen,
    neu.gesamt_netto, neu.gesamt_vat, neu.gesamt_brutto
  ) returning id into kennung;

  for zeile in select * from jsonb_array_elements(p_positionen) loop
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

-- ---------------------------------------------------------------------------
-- Und er ist eingefroren wie alles auf dem Beleg — die Fassung aus
-- 20260926101000, plus eine Zeile
-- ---------------------------------------------------------------------------

create or replace function app.rechnung_eingefroren() returns trigger
  language plpgsql
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
     or new.customer_id is distinct from old.customer_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_vat_id is distinct from old.customer_vat_id
     or new.address is distinct from old.address
     or new.leistungsort is distinct from old.leistungsort
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
