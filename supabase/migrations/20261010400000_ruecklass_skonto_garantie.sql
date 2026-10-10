/*
  RÜCKLASS MIT SKONTO, UND DIE ABLÖSE DURCH BANKGARANTIE (10.10.2026)

  Benannte Grenzen aus Stand 11.1, Punkt 5: Skonto und Rücklass auf derselben
  Rechnung wies `rechnung_anlegen` ab; eine Bankgarantie, die den Rücklass
  ablöst, kannte Senklot nicht.

  SKONTO AUF DEN ZAHLBETRAG. Der Kunde zahlt in der Skontofrist, was die
  Rechnung als Zahlbetrag nennt — Rechnungsbetrag ohne Rücklass — und zieht
  davon den Skonto ab. Der Rücklass selbst wird Jahre später ausgezahlt, ohne
  Skonto. Zugesagt sind also `(Rechnungsbetrag − Rücklass) × Satz`. Ohne
  Rücklass ist das genau die bisherige Zahl.

  BANKGARANTIE. Der Betrieb übergibt eine Garantie, der Kunde zahlt den
  Rücklass sofort aus. Der Rücklass wird damit ab dem Tag der Ablöse fällig
  (früher als vereinbart); Bank, Nummer und Ablauf der Garantie stehen an der
  Rechnung, damit die Urkunde wieder auffindbar ist. Die Rechnung selbst
  bleibt, wie sie ausgestellt wurde — die Felder sind nicht eingefroren.
*/

alter table public.invoices
  add column if not exists ruecklass_garantie_am date,
  add column if not exists ruecklass_garantie_bank text,
  add column if not exists ruecklass_garantie_nr text,
  add column if not exists ruecklass_garantie_bis date;

alter table public.invoices drop constraint if exists invoices_garantie_nur_mit_ruecklass;
alter table public.invoices add constraint invoices_garantie_nur_mit_ruecklass check (
  (ruecklass_garantie_am is null and ruecklass_garantie_bank is null
     and ruecklass_garantie_nr is null and ruecklass_garantie_bis is null)
  or (ruecklass_art is not null and ruecklass_garantie_am is not null)
);

comment on column public.invoices.ruecklass_garantie_am is
  'Tag, an dem der Rücklass durch eine Bankgarantie abgelöst wurde — ab dann ist er fällig.';

/*
  WANN DER RÜCKLASS FÄLLIG IST: der vereinbarte Tag, oder der Tag der Ablöse,
  wenn er früher liegt. Dieselbe Regel steht in `zahlstand.ts`
  (`ruecklassFaelligAm`).
*/
create or replace function app.mahnbar_ab(i public.invoices, p_heute date) returns date
  language sql stable
  security definer
  set search_path = ''
as $$
  select case
    when coalesce(i.ruecklass_betrag, 0) <= 0 then i.due_date
    when i.total_brutto - i.bezahlt_betrag > i.ruecklass_betrag then i.due_date
    else least(i.ruecklass_bis, coalesce(i.ruecklass_garantie_am, i.ruecklass_bis))
  end
$$;

create or replace function app.skonto_passt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  zugesagt numeric(12,2);
  andere_skonto numeric(12,2);
  andere numeric(12,2);
begin
  if new.art is distinct from 'Skonto' then
    return new;
  end if;

  select * into rechnung from public.invoices i where i.id = new.invoice_id;
  if rechnung.skonto_prozent is null then
    raise exception 'Diese Rechnung sagt keinen Skonto zu.' using errcode = '22023';
  end if;
  if rechnung.payment_status = 'Storniert' then
    raise exception 'Auf eine stornierte Rechnung gibt es keinen Skonto.' using errcode = '22023';
  end if;
  if new.betrag <= 0 then
    raise exception 'Ein Skonto ist ein Abzug über null Euro.' using errcode = '22023';
  end if;

  -- Auf den Zahlbetrag: ohne den Rücklass (seit 10.10.2026; ohne Rücklass wie bisher).
  zugesagt := round((rechnung.total_brutto - coalesce(rechnung.ruecklass_betrag, 0)) * rechnung.skonto_prozent / 100, 2);
  select coalesce(sum(z.betrag) filter (where z.art = 'Skonto'), 0), coalesce(sum(z.betrag), 0)
    into andere_skonto, andere
    from public.zahlungseingaenge z
   where z.invoice_id = new.invoice_id and z.id is distinct from new.id;

  if andere_skonto + new.betrag > zugesagt then
    raise exception 'Zugesagt sind % %% Skonto, also höchstens % €.',
      replace(trim(to_char(rechnung.skonto_prozent, 'FM990.99')), '.', ','),
      replace(zugesagt::text, '.', ',')
      using errcode = '22023';
  end if;
  if andere + new.betrag > rechnung.total_brutto then
    raise exception 'Der Skonto gleicht einen Rest aus — er ist höher als das, was noch offen ist.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

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
    ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis
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
    neu.ruecklass_art, neu.ruecklass_prozent, neu.ruecklass_betrag, neu.ruecklass_bis
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
