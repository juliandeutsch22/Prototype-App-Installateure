/*
  M2 (Durchsicht 15.11.2026): VERRECHNET IST, WAS EINE RECHNUNG TRÄGT — JE
  AUSGABE, NICHT JE DATUM.

  WAS FALSCH WAR. `ausgegebenes_material` zählte als abgerechnet, was bis zum
  Leistungsende der letzten gültigen Rechnung der Baustelle lag
  (`a.datum > grenze`, 20261027400000_r6_ruestliste_fehlmenge.sql). Drei
  Wege, auf denen Material so still aus jeder Rechnung fiel:
  a) Teilrechnung am Vormittag „Leistung bis heute“, Abholung am Nachmittag:
     ihr Tag liegt nicht nach der Grenze — nie vorgeschlagen;
  b) die Rüstliste vom 08.11. wird am 12.11. abgehakt, die Rechnung reicht bis
     10.11.: die Position zählt am Einsatztag — nie vorgeschlagen;
  c) „Leistung bis“ in der Zukunft (Monatsende): alles bis dahin galt als
     abgerechnet.
  Dazu meldete `app.material_abgerechnet` für diese Zeilen „Schon
  abgerechnet“ und sperrte Löschen und Zurücksetzen, obwohl sie auf keiner
  Rechnung standen.

  WIE ES JETZT IST. Die Rechnung hält fest, welche Ausgaben sie gesehen hat —
  in der Abdeckung, die es für Zeiten, Scheine und Wartungen schon gibt
  (`invoice_coverage`, Wächter `app.beleg_nur_einmal`, Storno und Aufheben
  wie dort): abgeholte Anforderungen und Retouren als `material_order` (sie
  bekommen dabei `is_billed` und die Rechnungsnummer, wie es die Spalten seit
  jeher vorsehen), eingeladene Rüstlistenpositionen als `ruest_position`
  über eine neue, feste Kennung je Position (`beleg_id`; die Kennung der
  Position ist Text und nur je Rüstliste eindeutig). Wie bisher gilt alles
  als abgerechnet, was die Vorschau dieser Rechnung zeigte — übernommen
  oder nicht; was danach ausgegeben wird, auch am selben Tag, steht auf der
  nächsten.

  ALTDATEN UND ALTE APP. Eine Rechnung trägt `material_je_ausgabe`. Die neue
  App setzt es; jede Rechnung davor und jede, die eine noch nicht neu
  geladene App anlegt, hat es nicht. Für sie gilt die bisherige Regel weiter,
  mit einer Einschränkung, die nichts Verrechnetes wieder öffnet: sie deckt
  eine Ausgabe, deren Tag bis zu ihrem Leistungsende reicht UND die es schon
  gab, als die Rechnung angelegt wurde. Was erst danach ausgegeben wurde,
  kann auf ihr nicht stehen — genau das ist Fall a. Ohne bekannten Zeitpunkt
  der Ausgabe (Anforderungen vor `erledigt_am`, Rüstlisten ohne „am“) bleibt
  es beim Datum allein, wie bisher. Folge, gewollt: Ausgaben, die nach einer
  älteren Rechnung entstanden und bisher still verschwanden, stehen jetzt im
  Vorschlag der nächsten — sie standen nie auf einer Rechnung.

  RECHTE unverändert: `ausgegebenes_material` nur für wer Rechnungen schreibt;
  `rechnung_anlegen` bleibt mit den Rechten des Aufrufers.
  DATENSCHUTZ: keine neue Tabelle, keine Personendaten.
*/

-- ---------------------------------------------------------------------------
-- 1. Spalten und Belegart
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists material_je_ausgabe boolean not null default false;

comment on column public.invoices.material_je_ausgabe is
  'M2: true = diese Rechnung verknüpft das gesehene Material je Ausgabe (invoice_coverage); false = Altregel über das Leistungsende.';

-- Eine feste, global eindeutige Kennung je Position — Anfangswert für jede bestehende Zeile.
alter table public.einsatz_material_positionen
  add column if not exists beleg_id uuid not null default gen_random_uuid();

create unique index if not exists einsatz_material_positionen_beleg
  on public.einsatz_material_positionen (beleg_id);

alter table public.invoice_coverage drop constraint invoice_coverage_art_check;
alter table public.invoice_coverage add constraint invoice_coverage_art_check
  check (art in ('time_entry', 'material_order', 'work_sheet', 'wartung', 'ruest_position'));

-- ---------------------------------------------------------------------------
-- 2. Deckt eine Rechnung nach der Altregel diese Ausgabe?
-- ---------------------------------------------------------------------------

/*
  EINE STELLE für Vorschlag und Löschsperre. Antwort: das Leistungsende der
  jüngsten deckenden Altrechnung — oder `null`. Die Baustellennummer gilt mit
  und ohne „PR-“, wie überall im Material.
*/
create or replace function app.ausgabe_alt_abgerechnet(
  p_betrieb text,
  p_baustelle text,
  p_datum date,
  p_zeitpunkt timestamptz
) returns date
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select max(coalesce(i.leistung_bis, i.invoice_date))
    from public.invoices i
   where i.company_id = p_betrieb
     and i.payment_status <> 'Storniert'
     and i.art <> 'anzahlung'
     and not i.material_je_ausgabe
     and regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i') <> ''
     and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i')
         = regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i')
     and p_datum <= coalesce(i.leistung_bis, i.invoice_date)
     and (p_zeitpunkt is null or p_zeitpunkt <= i.created_at)
$$;

revoke all on function app.ausgabe_alt_abgerechnet(text, text, date, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Der Vorschlag: was keine Rechnung trägt
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261027400000_r6_ruestliste_fehlmenge.sql. Neu:
  - `beleg_id` einer Rüstlistenposition ist ihre feste Kennung (siehe oben) —
    unter ihr verknüpft die Rechnung sie;
  - statt `a.datum > grenze`: nicht auf einer gültigen Rechnung verknüpft
    und nicht von einer Altrechnung gedeckt.
*/
create or replace function public.ausgegebenes_material(p_baustelle text, p_bis date default null)
  returns table(art text, beleg_id text, datum date, material_id uuid, name text, einheit text, menge numeric)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text := regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i');
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  if schluessel = '' then
    return;
  end if;

  return query
  with ausgaben as (
    select 'anforderung'::text as art, o.id::text as beleg_id, 'material_order'::text as abdeckung, o.id as ziel,
           (coalesce(o.erledigt_am, o.updated_at) at time zone 'Europe/Vienna')::date as datum,
           -- Ohne `erledigt_am` (Altdaten) ist der Zeitpunkt unbekannt: dann zählt der Tag allein.
           o.erledigt_am as zeitpunkt,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'retoure'::text, o.id::text, 'material_order'::text, o.id,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.created_at,
           o.material_id, o.material_name, m.unit, -o.quantity
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    -- Ohne den Teil, den eine Anforderung bringt — der steht oben als „anforderung“ (M5).
    select 'ruestliste'::text, p.beleg_id::text, 'ruest_position'::text, p.beleg_id, k.date,
           case when jsonb_typeof(k.geladen -> p.id -> 'am') = 'number'
                then to_timestamp((k.geladen -> p.id ->> 'am')::numeric / 1000) end,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit),
           greatest(p.menge - app.ruest_angefordert(k.id, p.id), 0)
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and regexp_replace(trim(k.project_number), '^PR-', '', 'i') = schluessel
       and k.geladen ? p.id::text
  )
  select a.art, a.beleg_id, a.datum, a.material_id, a.name, a.einheit, a.menge
    from ausgaben a
   where a.menge <> 0
     and not exists (
       select 1
         from public.invoice_coverage c
         join public.invoices i on i.id = c.invoice_id
        where c.company_id = betrieb
          and c.art = a.abdeckung
          and c.ziel_id = a.ziel
          and i.payment_status <> 'Storniert')
     and app.ausgabe_alt_abgerechnet(betrieb, schluessel, a.datum, a.zeitpunkt) is null
     and (p_bis is null or a.datum <= p_bis)
   order by a.datum, a.name, a.beleg_id;
end;
$$;

revoke all on function public.ausgegebenes_material(text, date) from public, anon;
grant execute on function public.ausgegebenes_material(text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Abgerechnet? — dieselbe Regel für Löschen und Zurücksetzen
-- ---------------------------------------------------------------------------

/*
  Rumpf wie in 20261110150000_material_ablauf_nachtrag.sql. Neu: statt der
  Datumsgrenze die Altregel mit Zeitpunkt (`app.ausgabe_alt_abgerechnet`);
  eine von einer neuen Rechnung verknüpfte Zeile trägt `is_billed` und fällt
  schon in die erste Abfrage.
*/
create or replace function app.material_abgerechnet(a public.material_orders)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  grenze date;
  datum date;
  zeitpunkt timestamptz;
begin
  if a.is_billed or coalesce(a.invoice_number, '') <> '' then
    return 'Steht schon auf einer Rechnung' || coalesce(' (' || nullif(a.invoice_number, '') || ')', '');
  end if;
  if not ((a.transaction_type = 'order' and (a.status = 'Erledigt' or a.processed))
          or a.transaction_type = 'return') then
    return null;
  end if;
  if a.transaction_type = 'order' then
    datum := (coalesce(a.erledigt_am, a.updated_at) at time zone 'Europe/Vienna')::date;
    zeitpunkt := a.erledigt_am;
  else
    datum := (a.created_at at time zone 'Europe/Vienna')::date;
    zeitpunkt := a.created_at;
  end if;
  grenze := app.ausgabe_alt_abgerechnet(a.company_id, a.project_number, datum, zeitpunkt);
  if grenze is not null then
    return 'Schon abgerechnet — die Rechnung der Baustelle ' || a.project_number || ' reicht bis '
           || to_char(grenze, 'DD.MM.YYYY');
  end if;
  return null;
end;
$$;

revoke all on function app.material_abgerechnet(public.material_orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Anlegen: die Rüstlistenposition als Beleg, und das Kennzeichen
-- ---------------------------------------------------------------------------

/*
  Die Fassung aus 20261106300000_wartung_abdeckung.sql. Neu:
  - `material_je_ausgabe` aus dem Kopf (die neue App schickt es);
  - der Zweig `ruest_position`.
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
    material_je_ausgabe
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
    -- NEU (M2): fehlt der Schlüssel (alte App), gilt für diese Rechnung der Stichtag wie bisher.
    coalesce(neu.material_je_ausgabe, false)
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
    elsif belegart = 'ruest_position' then
      -- NEU (M2): eine eingeladene Rüstlistenposition über ihre feste
      -- Kennung (`beleg_id`); auch sie trägt keinen Verrechnungsstand, über
      -- sie wacht `app.beleg_nur_einmal`. Hier nur: sie gehört zum Betrieb.
      select count(*) into gesperrt
        from public.einsatz_material_positionen p
       where p.company_id = betrieb
         and p.beleg_id = any(kennungen);
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
$$;

revoke all on function public.rechnung_anlegen(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.rechnung_anlegen(jsonb, jsonb, jsonb) to authenticated;
