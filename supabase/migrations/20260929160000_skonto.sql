/*
  SKONTO (offene Punkte B7, Teil 2).

  Die Rechnung nennt ihre Bedingung — „bei Zahlung bis … abzüglich 2 %" —, und
  wer sie nutzt, zahlt weniger. Bisher blieb dieser Rest offen: die Rechnung
  stand als „Teilbezahlt" da, der Mahnlauf bot die zwei Prozent zum Mahnen an.

  DIE BEDINGUNG STEHT AN DER RECHNUNG (`skonto_prozent`, `skonto_bis`) und ist
  mit ihr eingefroren: sie ist Teil des Belegs, den der Kunde hat. Ab Werk
  gibt es keine — der Betrieb stellt sie in den Einstellungen ein.

  DER ABZUG IST EIN ZAHLUNGSEINGANG DER ART „Skonto". So gleicht er den Rest
  aus, und alles, was mit dem Rest rechnet — Zahlungsstand, offene Posten,
  Mahnlauf, Startseite —, rechnet ohne Änderung richtig. Er ist aber kein
  Geld: `skonto_betrag` führt ihn getrennt, damit das Ausgangsbuch „bezahlt"
  und „Skonto" auseinanderhält. Die Umsatzsteuer darauf berichtigt die
  Kanzlei beim Buchen der Zahlung (§ 16 UStG) — sie sieht beides.

  EIN SKONTO KANN NICHT MEHR SEIN, ALS DIE RECHNUNG ZUSAGT, und nicht mehr als
  der Rest: er schliesst eine Forderung, er macht keine Überzahlung.

  UND ER GEHT NICHT MIT IN DEN STORNO. Das Guthaben einer stornierten
  Rechnung ist Geld, das zurückgeht — ein Skonto ist keines. Vor dem Storno
  ist der Skonto-Eintrag zu löschen; dann stimmt das Guthaben.
*/

alter table public.invoices
  add column if not exists skonto_prozent numeric(5,2),
  add column if not exists skonto_bis date,
  add column if not exists skonto_betrag numeric(12,2) not null default 0;

alter table public.invoices
  add constraint invoices_skonto_vollstaendig
  check ((skonto_prozent is null) = (skonto_bis is null)
         and (skonto_prozent is null or (skonto_prozent > 0 and skonto_prozent < 100)));

comment on column public.invoices.skonto_betrag is
  'Summe der Zahlungseingänge der Art Skonto — geschrieben nur von app.zahlstand_setzen.';

alter table public.zahlungseingaenge drop constraint if exists zahlungseingaenge_art_check;
alter table public.zahlungseingaenge
  add constraint zahlungseingaenge_art_check
  check (art in ('Überweisung', 'Bar', 'Karte', 'Sonstiges', 'Skonto'));

-- ---------------------------------------------------------------------------
-- 1. Anlegen schreibt die Bedingung — die Fassung aus 20260928120000, plus
--    die Prüfung und zwei Spalten
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
-- 2. Eingefroren wie alles auf dem Beleg; `skonto_betrag` wie `bezahlt_betrag`
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
     or new.steuerbefreiung is distinct from old.steuerbefreiung
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
     or new.gesamt_brutto is distinct from old.gesamt_brutto
     or new.skonto_prozent is distinct from old.skonto_prozent
     or new.skonto_bis is distinct from old.skonto_bis then
    raise exception 'Eine ausgestellte Rechnung lässt sich nicht mehr ändern — nur stornieren'
      using errcode = '42501';
  end if;

  if not app.zahlstand_laeuft() then
    if new.bezahlt_betrag is distinct from old.bezahlt_betrag
       or new.skonto_betrag is distinct from old.skonto_betrag then
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

-- ---------------------------------------------------------------------------
-- 3. Der Zahlungsstand führt den Skonto getrennt — die Fassung aus
--    20260919120000, plus `skonto_betrag`
-- ---------------------------------------------------------------------------

create or replace function app.zahlstand_setzen(p_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  summe   numeric(12,2);
  skonto  numeric(12,2);
  brutto  numeric(12,2);
  status  text;
  neu     text;
begin
  select coalesce(sum(z.betrag), 0),
         coalesce(sum(z.betrag) filter (where z.art = 'Skonto'), 0)
    into summe, skonto
    from public.zahlungseingaenge z where z.invoice_id = p_id;

  select i.total_brutto, i.payment_status into brutto, status
    from public.invoices i where i.id = p_id;

  if brutto is null then
    return; -- Die Rechnung gibt es nicht (mehr).
  end if;

  if status = 'Storniert' then
    neu := 'Storniert';
  elsif summe <= 0 then
    neu := case when status = 'Überfällig' then 'Überfällig' else 'Offen' end;
  elsif summe < brutto then
    neu := 'Teilbezahlt';
  elsif summe = brutto then
    neu := 'Bezahlt';
  else
    neu := 'Überzahlt';
  end if;

  perform set_config('app.zahlstand', 'ja', true);
  update public.invoices
     set bezahlt_betrag = summe,
         skonto_betrag = skonto,
         payment_status = neu
   where id = p_id
     and (bezahlt_betrag is distinct from summe
          or skonto_betrag is distinct from skonto
          or payment_status is distinct from neu);
  perform set_config('app.zahlstand', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Was ein Skonto-Eintrag darf
-- ---------------------------------------------------------------------------

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

  zugesagt := round(rechnung.total_brutto * rechnung.skonto_prozent / 100, 2);
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

revoke all on function app.skonto_passt() from public, anon, authenticated;

create trigger zahlungen_skonto_passt
  before insert or update on public.zahlungseingaenge
  for each row execute function app.skonto_passt();

create or replace function app.skonto_vor_storno() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.payment_status = 'Storniert' and old.payment_status is distinct from 'Storniert'
     and exists (select 1 from public.zahlungseingaenge z
                  where z.invoice_id = new.id and z.art = 'Skonto') then
    raise exception 'Auf diese Rechnung ist ein Skonto gebucht. Bitte den Skonto-Eintrag vor dem Storno löschen — er ist kein Geld, das zurückgeht.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.skonto_vor_storno() from public, anon, authenticated;

create trigger invoices_skonto_vor_storno
  before update on public.invoices
  for each row execute function app.skonto_vor_storno();
