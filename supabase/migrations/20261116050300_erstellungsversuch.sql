-- Durchsicht 15.11.2026, G2: jeder Erstellungsversuch einer Rechnung trägt
-- eine Kennung, die die Datenbank mitschreibt. Nach einer unterbrochenen
-- Antwort lässt sich damit sicher feststellen, ob die Rechnung entstand —
-- und die Sperre der Ansicht löst sich von selbst.
--
-- WAS VORHER WAR: Brach die Antwort auf „Rechnung erstellen“ ab (Tablet ohne
-- Empfang, Zeitüberschreitung), blieb das Anlegen für JEDE weitere Vorschau
-- gesperrt, bis die Seite neu geladen wurde — und beim Neuladen gingen die
-- Angaben verloren. Das war Absicht und als Grenze benannt
-- (`docs/ui-umbau/premium-2026-10-28.md`, „Bewusste Grenzen“ 2): ein
-- sicherer Abgleich braucht eine nachweisbare Zuordnung zum konkreten
-- Versuch, ein Vergleich nach Name und Betrag genügt nicht, und
-- Datenbankänderungen waren damals ausgeschlossen. Diese Migration ist die
-- Zuordnung; die Grenze entfällt.
--
-- WIE ES GEHT:
--   - Die App erzeugt je Versuch eine Kennung (`p_versuch`). Die Rechnung
--     trägt sie (`invoices.erstellungsversuch`, je Betrieb eindeutig).
--   - Kommt derselbe Versuch zweimal an, entsteht keine zweite Rechnung:
--     `rechnung_ausstellen` gibt die schon angelegte zurück (`bereits`).
--   - `rechnung_versuch_klaeren` beantwortet nach einer unklaren Antwort, ob
--     die Rechnung entstand. Ist sie es nicht, hält die Funktion den Versuch
--     als „ohne Beleg geklärt“ fest; kommt der ursprüngliche Aufruf danach
--     doch noch an (verspätet im Netz), weist `rechnung_ausstellen` ihn ab.
--     So gilt die Antwort der Klärung endgültig — es entsteht nie eine
--     Rechnung, nachdem die App „nicht entstanden“ gehört hat.
--   - Beide Funktionen nehmen dieselbe Beratungssperre je Betrieb und
--     Versuch: läuft der ursprüngliche Aufruf noch, wartet die Klärung, bis
--     er fertig ist, und sieht dann sein Ergebnis.
--
-- VERTRÄGLICH MIT DER ALTEN APP: `p_versuch` hat einen Vorgabewert; ohne ihn
-- verhält sich `rechnung_ausstellen` wie bisher. Bestehende Rechnungen
-- tragen keine Kennung (null) und werden nicht angefasst.

alter table public.invoices
  add column if not exists erstellungsversuch uuid;

comment on column public.invoices.erstellungsversuch is
  'Kennung des Erstellungsversuchs aus der App (G2, 15.11.2026) — je Betrieb eindeutig. Damit klärt rechnung_versuch_klaeren nach einer unterbrochenen Antwort, ob die Rechnung entstand. Null bei Rechnungen davor und bei Übernahmen.';

create unique index if not exists invoices_erstellungsversuch_eindeutig
  on public.invoices (company_id, erstellungsversuch)
  where erstellungsversuch is not null;

/*
  VERSUCHE, DIE OHNE BELEG GEKLÄRT SIND. Nur die zwei Funktionen unten lesen
  und schreiben hier (beide `security definer`); der Zeilenschutz ist an und
  hat keine Regel, also sieht sonst niemand etwas. Kein Personenbezug: ein
  Betrieb, eine zufällige Kennung, ein Zeitpunkt.
*/
create table if not exists public.rechnungsversuche_ohne_beleg (
  company_id text not null references public.companies(id) on delete cascade,
  versuch uuid not null,
  geklaert_am timestamptz not null default now(),
  primary key (company_id, versuch)
);

comment on table public.rechnungsversuche_ohne_beleg is
  'Erstellungsversuche, für die rechnung_versuch_klaeren „keine Rechnung entstanden“ geantwortet hat (G2). rechnung_ausstellen weist einen solchen Versuch danach ab, damit die Antwort endgültig bleibt.';

alter table public.rechnungsversuche_ohne_beleg enable row level security;
revoke all on table public.rechnungsversuche_ohne_beleg from public, anon, authenticated;

/* Die gemeinsame Sperre beider Wege — je Betrieb und Versuch. */
create or replace function app.rechnungsversuch_sperren(p_betrieb text, p_versuch uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('rechnungsversuch:' || p_betrieb || ':' || p_versuch::text, 0));
$$;

revoke all on function app.rechnungsversuch_sperren(text, uuid) from public, anon;
grant execute on function app.rechnungsversuch_sperren(text, uuid) to authenticated, service_role;

/* Ist dieser Versuch schon als „ohne Beleg“ geklärt? Für `rechnung_ausstellen`, das als Aufrufer läuft. */
create or replace function app.rechnungsversuch_ohne_beleg(p_betrieb text, p_versuch uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.rechnungsversuche_ohne_beleg v
     where v.company_id = p_betrieb and v.versuch = p_versuch);
$$;

revoke all on function app.rechnungsversuch_ohne_beleg(text, uuid) from public, anon;
grant execute on function app.rechnungsversuch_ohne_beleg(text, uuid) to authenticated, service_role;

/*
  `rechnung_anlegen` — die Fassung aus `20261106300000_wartung_abdeckung.sql`;
  dazu schreibt es die Kennung des Versuchs mit.
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
    erstellungsversuch
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
    neu.erstellungsversuch
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
  `rechnung_ausstellen` — die Fassung aus
  `20261116050200_rechnungsdatum_vom_server.sql`; dazu der Versuch.
*/
drop function if exists public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean);

create function public.rechnung_ausstellen(
  p_kopf jsonb,
  p_positionen jsonb,
  p_belege jsonb,
  p_praefix text,
  p_jahr integer default null,
  p_wunsch integer default null,
  p_datum_ausdruecklich boolean default false,
  p_versuch uuid default null
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  datum date;
  jahr integer;
  lfd integer;
  nummer text;
  kennung uuid;
  schon record;
begin
  if p_versuch is not null then
    if betrieb is null or not app.angemeldet() then
      raise exception 'Nicht angemeldet' using errcode = '42501';
    end if;
    /*
      DERSELBE VERSUCH ENTSTEHT NUR EINMAL (G2). Die Sperre wartet auf einen
      gleichen Aufruf, der noch läuft, und auf eine laufende Klärung; danach
      wird mit deren Ergebnis entschieden.
    */
    perform app.rechnungsversuch_sperren(betrieb, p_versuch);
    select i.id, i.invoice_number, i.invoice_date into schon
      from public.invoices i
     where i.company_id = betrieb and i.erstellungsversuch = p_versuch;
    if found then
      return jsonb_build_object('id', schon.id, 'invoice_number', schon.invoice_number,
                                'invoice_date', schon.invoice_date, 'bereits', true);
    end if;
    if app.rechnungsversuch_ohne_beleg(betrieb, p_versuch) then
      raise exception 'Dieser Erstellungsversuch ist bereits als „nicht entstanden“ geklärt — es wurde keine Rechnung angelegt. Bitte neu erstellen.'
        using errcode = '22023';
    end if;
  end if;

  -- `p_jahr` zählt nicht mehr: das Jahr folgt dem Rechnungsdatum (G5).
  datum := coalesce(nullif(p_kopf ->> 'invoice_date', '')::date, heute);
  if datum <> heute and not coalesce(p_datum_ausdruecklich, false) then
    raise exception 'Das Datum dieses Geräts (%) ist nicht der heutige Tag (%). Die Rechnung ist nicht angelegt, keine Nummer verbraucht — bitte Datum und Uhrzeit des Geräts prüfen und neu laden.',
      to_char(datum, 'DD.MM.YYYY'), to_char(heute, 'DD.MM.YYYY')
      using errcode = '22023';
  end if;
  jahr := extract(year from datum)::integer;

  lfd := public.naechste_nummer('invoices', jahr, 0, p_wunsch);
  nummer := case when coalesce(p_praefix, '') = '' then '' else p_praefix || '-' end
         || jahr::text || '-'
         || case when lfd >= 10000 then lfd::text else lpad(lfd::text, 4, '0') end;

  kennung := public.rechnung_anlegen(
    coalesce(p_kopf, '{}'::jsonb)
      || jsonb_build_object('invoice_number', nummer, 'invoice_date', datum,
                            'erstellungsversuch', p_versuch),
    p_positionen,
    p_belege);

  return jsonb_build_object('id', kennung, 'invoice_number', nummer, 'invoice_date', datum, 'bereits', false);
end;
$$;

revoke all on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean, uuid) from public, anon;
grant execute on function public.rechnung_ausstellen(jsonb, jsonb, jsonb, text, integer, integer, boolean, uuid) to authenticated, service_role;

/*
  DIE KLÄRUNG nach einer unterbrochenen Antwort. Sie schreibt keine Rechnung
  — sie sagt, ob es die Rechnung dieses Versuchs gibt, und wenn nicht, macht
  sie diese Antwort endgültig.

  Wer klären darf, darf auch ausstellen: angemeldet, im eigenen Betrieb,
  Buchhaltung oder Leitung — dieselbe Bedingung wie `rechnung_anlegen`.
*/
create or replace function public.rechnung_versuch_klaeren(p_versuch uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  schon record;
begin
  if betrieb is null or not app.angemeldet() or not app.ist_buch_oder_spitze() then
    raise exception 'Klären darf, wer Rechnungen ausstellt.' using errcode = '42501';
  end if;
  if p_versuch is null then
    raise exception 'Ohne Kennung des Versuchs gibt es nichts zu klären.' using errcode = '22023';
  end if;

  perform app.rechnungsversuch_sperren(betrieb, p_versuch);
  select i.id, i.invoice_number, i.invoice_date into schon
    from public.invoices i
   where i.company_id = betrieb and i.erstellungsversuch = p_versuch;
  if found then
    return jsonb_build_object('entstanden', true, 'id', schon.id,
                              'invoice_number', schon.invoice_number, 'invoice_date', schon.invoice_date);
  end if;

  insert into public.rechnungsversuche_ohne_beleg (company_id, versuch)
  values (betrieb, p_versuch)
  on conflict do nothing;
  return jsonb_build_object('entstanden', false);
end;
$$;

revoke all on function public.rechnung_versuch_klaeren(uuid) from public, anon;
grant execute on function public.rechnung_versuch_klaeren(uuid) to authenticated, service_role;

/*
  Die Kennung gehört zum Beleg — die Fassung aus
  `20261115400000_geld_runden.sql`, dazu `erstellungsversuch`.
*/
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
     or new.erstellungsversuch is distinct from old.erstellungsversuch then
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
