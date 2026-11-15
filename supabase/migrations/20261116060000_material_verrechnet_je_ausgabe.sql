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
  GEZIELT IN DIE GELTENDE FASSUNG EINGESETZT, nicht ersetzt: andere
  Migrationen derselben Welle ändern `rechnung_anlegen` ebenfalls (etwa
  Erstellungsversuch und Leistungsnachweis im Beleg). Ein vollständiger
  Ersatz löschte ihre Änderungen still, je nach Reihenfolge. Neu sind drei
  Stellen:
  - `material_je_ausgabe` aus dem Kopf (die neue App schickt es) — Spalte
    und Wert stehen je direkt hinter dem Rücklass;
  - der Zweig `ruest_position` vor dem Zweig für unbekannte Belegarten.
  Fehlt eine Einfügestelle oder ist sie nicht eindeutig, bricht die
  Migration ab, statt still eine halbe Änderung einzuspielen. Wiederholt
  eingespielt, ändert sie nichts mehr.
*/
do $migration$
declare
  quelle text;
  stellen text[][] := array[
    array[$m$    ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis$m$,
          $m$    ruecklass_art, ruecklass_prozent, ruecklass_betrag, ruecklass_bis, material_je_ausgabe$m$],
    array[$m$neu.ruecklass_art, neu.ruecklass_prozent, neu.ruecklass_betrag, neu.ruecklass_bis$m$,
          $m$neu.ruecklass_art, neu.ruecklass_prozent, neu.ruecklass_betrag, neu.ruecklass_bis,
    -- NEU (M2): fehlt der Schlüssel (alte App), gilt für diese Rechnung der Stichtag wie bisher.
    coalesce(neu.material_je_ausgabe, false)$m$],
    array[$m$    else
      -- Eine unbekannte Art weist der Check der Abdeckung ab.$m$,
          $m$    elsif belegart = 'ruest_position' then
      -- NEU (M2): eine eingeladene Rüstlistenposition über ihre feste
      -- Kennung (`beleg_id`); auch sie trägt keinen Verrechnungsstand, über
      -- sie wacht `app.beleg_nur_einmal`. Hier nur: sie gehört zum Betrieb.
      select count(*) into gesperrt
        from public.einsatz_material_positionen p
       where p.company_id = betrieb
         and p.beleg_id = any(kennungen);
    else
      -- Eine unbekannte Art weist der Check der Abdeckung ab.$m$]
  ];
  i integer;
begin
  quelle := pg_get_functiondef('public.rechnung_anlegen(jsonb,jsonb,jsonb)'::regprocedure);
  if position('material_je_ausgabe' in quelle) > 0 then
    return;
  end if;
  for i in 1 .. array_length(stellen, 1) loop
    if (length(quelle) - length(replace(quelle, stellen[i][1], ''))) / length(stellen[i][1]) <> 1 then
      raise exception 'rechnung_anlegen: Einfügestelle % fehlt oder ist nicht eindeutig', i;
    end if;
    quelle := replace(quelle, stellen[i][1], stellen[i][2]);
  end loop;
  execute quelle;
end;
$migration$;
