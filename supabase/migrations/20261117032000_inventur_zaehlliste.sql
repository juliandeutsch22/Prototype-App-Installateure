/*
  INVENTUR ALS ZÄHLLISTE JE LAGER ODER FAHRZEUG (Durchsicht 15.11.2026, F14).

  WAS HEUTE IST (nachgestellt). Inventur geht nur Artikel für Artikel
  (`InventurDialog` → `lager_inventur`): Artikel suchen, gezählte Menge und
  Grund eintragen, buchen, nächster Artikel. Für ein Fahrzeug mit vierzig
  Artikeln sind das vierzig Dialoge; eine Liste zum Zählen, ein Stichtag und
  ein Protokoll der ganzen Zählung fehlen. Und zählt jemand am Regal, während
  der Betrieb weiterläuft, verbucht `lager_inventur` die Menge absolut: was
  zwischen Zählen und Eintragen entnommen wurde, ist danach still wieder da.

  WAS JETZT GILT.
    - `inventur_anlegen` erzeugt eine Zählliste für einen Ort (Hauptlager,
      weiteres Lager, Fahrzeug), gefiltert nach Umfang (was dort liegt / alle
      Lagerartikel), Warengruppe und Suchbegriff.
    - `inventur_zaehlen` trägt je Artikel die gezählte Menge ein — sofort
      gespeichert, von mehreren Geräten zugleich; wer gezählt hat und wann,
      steht an der Zeile.
    - `inventur_vorschau` zeigt je Artikel Soll, Gezählt, Abweichung und den
      Bestand danach; `inventur_buchen` bucht ALLE Abweichungen in einem Zug,
      jede als Bewegung „Inventur“ mit Grund und Bezug im Bewegungsprotokoll
      (auch die gestimmten, mit Menge null — wie `lager_inventur`).
    - Die gebuchte Liste ist das Protokoll: Soll, Gezählt, Abweichung,
      Bestand vorher und nachher, Grund, wer und wann.

  LAUFENDE BEWEGUNGEN UND STICHTAG. Verglichen wird mit dem Bestand im
  System ZUM ZEITPUNKT DER ZÄHLUNG — nicht beim Anlegen und nicht beim
  Buchen. Dieser Zeitpunkt ist der Stichtag der Liste, wenn sie einen hat
  (Zählung vor Arbeitsbeginn, Liste auf Papier), sonst der Augenblick, in dem
  die Zahl der Zeile eingetragen wurde (Zählen am Handy). Der Bestand zu
  diesem Zeitpunkt ergibt sich aus dem Bewegungsprotokoll: heute minus alles,
  was danach an diesem Ort gebucht wurde. Gebucht wird nur die Abweichung —
  was zwischen Zählung und Buchung hinein- oder hinausging, bleibt erhalten.
  Wurde ein Artikel nach der Zählung einzeln inventiert, ist seine Zeile
  überholt und wird nicht gebucht (die spätere Zählung gilt). Ein Artikel
  steht höchstens auf EINER offenen Liste je Ort — sonst zöge die zweite
  Liste die Abweichung der ersten ein zweites Mal ab.

  Wer: wie die Einzelinventur (`lager_inventur`) die Verwaltung und die
  Leitung; lesen dazu die Buchhaltung und der Support — wie das
  Bewegungsprotokoll. Geschrieben wird nur über die Funktionen.

  PERSONENBEZUG. Namen der Zählenden, Anlegenden und Buchenden. In der
  Datenauskunft stehen sie gezählt (`als_bearbeiter`); bei der Löschung
  einer Person gehen sie aus offenen Listen sofort, auf gebuchten Protokollen
  bleiben sie (Buchhaltungsunterlage, § 132 BAO) und stehen unter
  „aufbewahren“.

  BEWERTUNG: keine. Die Inventur zählt Mengen; den Wert zum Stichtag setzt
  die Steuerberatung an (Einkaufspreise sieht im Betrieb nur die Spitze).
*/

-- ---------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------

create table public.inventuren (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id),
  lagerort_id uuid not null references public.lagerorte (id),
  bezeichnung text check (bezeichnung is null or char_length(bezeichnung) <= 120),
  -- Wie die Liste entstand: Umfang, Warengruppe, Suchbegriff — für das Protokoll.
  auswahl jsonb not null default '{}'::jsonb,
  -- Leer: verglichen wird je Zeile mit dem Augenblick der Zählung.
  stichtag timestamptz,
  zustand text not null default 'offen' check (zustand in ('offen', 'gebucht')),
  grund text check (grund is null or char_length(grund) <= 300),
  angelegt_am timestamptz not null default now(),
  angelegt_von uuid,
  angelegt_von_name text,
  gebucht_am timestamptz,
  gebucht_von uuid,
  gebucht_von_name text,
  constraint inventuren_gebucht_mit_zeit check (zustand <> 'gebucht' or gebucht_am is not null)
);

create index inventuren_betrieb on public.inventuren (company_id, angelegt_am desc);
create index inventuren_ort on public.inventuren (lagerort_id);

create table public.inventur_zeilen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id),
  inventur_id uuid not null references public.inventuren (id) on delete cascade,
  lagerort_id uuid not null references public.lagerorte (id),
  material_id uuid not null references public.materials (id) on delete cascade,
  -- Solange die Liste offen ist. Trägt den eindeutigen Index unten.
  offen boolean not null default true,
  gezaehlt numeric(12,3) check (gezaehlt is null or gezaehlt >= 0),
  gezaehlt_am timestamptz,
  gezaehlt_von uuid,
  gezaehlt_von_name text,
  -- Beim Buchen festgehalten — das Protokoll.
  ergebnis text check (ergebnis in ('gebucht', 'ueberholt', 'nicht_gezaehlt')),
  soll numeric(12,3),
  abweichung numeric(12,3),
  bestand_vorher numeric(12,3),
  bestand_nachher numeric(12,3),
  grund text check (grund is null or char_length(grund) <= 300),
  unique (inventur_id, material_id)
);

-- Ein Artikel steht je Ort auf höchstens einer offenen Liste (siehe Kopf).
create unique index inventur_zeilen_offen_je_ort on public.inventur_zeilen (lagerort_id, material_id) where offen;
create index inventur_zeilen_artikel on public.inventur_zeilen (material_id);
create index inventur_zeilen_betrieb on public.inventur_zeilen (company_id, gezaehlt_von) where gezaehlt_von is not null;

alter table public.inventuren enable row level security;
alter table public.inventur_zeilen enable row level security;

-- Lesen wie das Bewegungsprotokoll (`lagerbewegungen_lesen`); geschrieben wird nur über die Funktionen.
create policy inventuren_lesen on public.inventuren for select using (
  (company_id = (select app.lesebetrieb())
   and ((select app.hat_rolle(array['Verwaltung', 'Buchhaltung'])) or (select app.ist_fuehrung())))
  or company_id = (select app.supportbetrieb()));
create policy inventur_zeilen_lesen on public.inventur_zeilen for select using (
  (company_id = (select app.lesebetrieb())
   and ((select app.hat_rolle(array['Verwaltung', 'Buchhaltung'])) or (select app.ist_fuehrung())))
  or company_id = (select app.supportbetrieb()));

revoke all on public.inventuren from anon;
revoke all on public.inventur_zeilen from anon;
grant select on public.inventuren to authenticated;
grant select on public.inventur_zeilen to authenticated;

create trigger inventuren_kein_support_schreiben before insert or update or delete on public.inventuren
  for each row execute function app.support_schreibt_nicht();
create trigger inventur_zeilen_kein_support_schreiben before insert or update or delete on public.inventur_zeilen
  for each row execute function app.support_schreibt_nicht();
create trigger inventuren_betrieb_fest before update on public.inventuren
  for each row execute function app.betrieb_unveraenderlich();
create trigger inventur_zeilen_betrieb_fest before update on public.inventur_zeilen
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 2. Hilfen ohne Rechteprüfung (nur die öffentlichen Funktionen rufen sie)
-- ---------------------------------------------------------------------------

/* Zählen und Buchen: wie `lager_inventur` die Verwaltung oder die Leitung. */
create or replace function app.inventur_recht(p_betrieb text) returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if p_betrieb is null or not app.betriebsmitglied(p_betrieb) then
    raise exception 'Diese Zählliste gibt es in diesem Betrieb nicht' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Die Inventur zählt und bucht die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
end;
$$;

/*
  DER BESTAND IM SYSTEM ZU EINEM ZEITPUNKT, an einem Ort: heute minus alles,
  was danach dort gebucht wurde. Jede Änderung des Bestands schreibt eine
  Bewegung (`app.lagerbewegung_schreiben`, `app.ortsbewegung_schreiben`); im
  Hauptlager stehen sie ohne Ort, an jedem weiteren Ort mit seiner Kennung.
*/
create or replace function app.inventur_soll(p_haupt boolean, p_ort uuid, p_material uuid, p_zeitpunkt timestamptz)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select (case when p_haupt
                 then (select m.stock from public.materials m where m.id = p_material)
                 else coalesce((select b.menge from public.lagerbestaende b
                                 where b.lagerort_id = p_ort and b.material_id = p_material), 0)
          end)
       - coalesce((select sum(l.menge) from public.lagerbewegungen l
                    where l.material_id = p_material
                      and (case when p_haupt then l.lagerort_id is null else l.lagerort_id = p_ort end)
                      and l.created_at > p_zeitpunkt), 0)
$$;

/*
  DIE LAGE EINER LISTE — für Vorschau und Buchung dieselbe Rechnung. Je
  Zeile: gezählt, Zeitpunkt, Soll, Abweichung, Bestand jetzt und danach,
  überholt (nach der Zählung einzeln inventiert) und ein Konflikt, der das
  Buchen verhindert. Dazu ein Stand über das, was gebucht würde.
*/
create or replace function app.inventur_lage(p_inventur uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  inv public.inventuren;
  ort public.lagerorte;
  haupt boolean;
  zeilen jsonb;
begin
  select * into inv from public.inventuren i where i.id = p_inventur;
  select * into ort from public.lagerorte o where o.id = inv.lagerort_id;
  haupt := ort.art = 'haupt';

  with z as (
    select z.id, z.material_id, z.gezaehlt, m.name, m.article_number, m.unit, m.lagerartikel,
           coalesce(inv.stichtag, z.gezaehlt_am) as zeitpunkt,
           case when haupt then m.stock
                else coalesce((select b.menge from public.lagerbestaende b
                                where b.lagerort_id = ort.id and b.material_id = z.material_id), 0) end as jetzt
      from public.inventur_zeilen z
      join public.materials m on m.id = z.material_id
     where z.inventur_id = p_inventur
  ), r as (
    select z.*,
           case when z.gezaehlt is null then null else app.inventur_soll(haupt, ort.id, z.material_id, z.zeitpunkt) end as soll,
           z.gezaehlt is not null and exists (
             select 1 from public.lagerbewegungen l
              where l.material_id = z.material_id and l.art = 'inventur'
                and (case when haupt then l.lagerort_id is null else l.lagerort_id = ort.id end)
                and l.created_at > z.zeitpunkt) as ueberholt
      from z
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'zeile', r.id, 'material', r.material_id, 'name', r.name, 'artikelnummer', r.article_number,
           'einheit', coalesce(nullif(btrim(r.unit), ''), 'Stk'),
           'gezaehlt', r.gezaehlt, 'zeitpunkt', r.zeitpunkt, 'soll', r.soll,
           'abweichung', r.gezaehlt - r.soll, 'jetzt', r.jetzt,
           'danach', case when r.gezaehlt is null or r.ueberholt then r.jetzt else r.jetzt + (r.gezaehlt - r.soll) end,
           'ueberholt', r.ueberholt,
           'konflikt', case
             when r.gezaehlt is null or r.ueberholt then null
             -- Am Handy wird neu gezählt; zum Stichtag (Papier) lässt sich nur die Zählung prüfen.
             when r.jetzt + (r.gezaehlt - r.soll) < 0 and inv.stichtag is null
               then 'Nach der Zählung wurde mehr entnommen, als gezählt war — bitte neu zählen.'
             when r.jetzt + (r.gezaehlt - r.soll) < 0
               then 'Nach dem Stichtag wurde mehr entnommen, als zum Stichtag gezählt war — bitte die Zählung prüfen.'
             when haupt and not r.lagerartikel and r.jetzt + (r.gezaehlt - r.soll) > 0
               then 'Ist kein Lagerartikel mehr — erst im Katalog wieder als Lagerartikel führen.'
           end)
         order by lower(r.name), r.id), '[]'::jsonb)
    into zeilen
    from r;

  return jsonb_build_object(
    'inventur', p_inventur,
    'zustand', inv.zustand,
    'stichtag', inv.stichtag,
    'ort', ort.id,
    'zeilen', zeilen,
    -- Der Stand dessen, was gebucht würde — nicht der Bestand, der sich laufend ändern darf.
    'stand', md5(coalesce((
      select string_agg(concat_ws('|', e ->> 'zeile', e ->> 'gezaehlt', e ->> 'zeitpunkt', e ->> 'soll', e ->> 'ueberholt'), ';'
                        order by e ->> 'zeile')
        from jsonb_array_elements(zeilen) e), '')));
end;
$$;

revoke all on function app.inventur_recht(text) from public, anon, authenticated;
revoke all on function app.inventur_soll(boolean, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.inventur_lage(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Anlegen, ergänzen, zählen, verwerfen
-- ---------------------------------------------------------------------------

/*
  `p`: `{ort, umfang, warengruppe, suche, bezeichnung, stichtag}`.
  `ort` leer heißt Hauptlager. `umfang`: `bestand` (was dort liegt) oder
  `lagerartikel` (alle Lagerartikel des Betriebs, ausgelaufene nur mit
  Bestand dort). Artikel, die am Ort schon auf einer offenen Liste stehen,
  kommen nicht dazu — gezählt als `uebersprungen`.
*/
create or replace function public.inventur_anlegen(p jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  ort public.lagerorte;
  haupt boolean;
  umfang text := coalesce(nullif(btrim(p ->> 'umfang'), ''), 'bestand');
  gruppe text := nullif(btrim(coalesce(p ->> 'warengruppe', '')), '');
  suche text := nullif(btrim(coalesce(p ->> 'suche', '')), '');
  stichtag timestamptz;
  kennung uuid;
  angelegt integer;
  uebersprungen integer;
  wer text;
begin
  perform app.inventur_recht(betrieb);
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Die Auswahl kam nicht als Liste von Angaben' using errcode = '22023';
  end if;
  if umfang not in ('bestand', 'lagerartikel') then
    raise exception 'Unbekannter Umfang „%“', umfang using errcode = '22023';
  end if;
  if nullif(p ->> 'ort', '') is null then
    -- Ein Betrieb, der noch keines hat (vor den Lagerorten eingespielt), bekommt es jetzt — wie `lagerort_speichern`.
    perform app.hauptlager_anlegen(betrieb);
    select * into ort from public.lagerorte o where o.company_id = betrieb and o.art = 'haupt';
  else
    select * into ort from public.lagerorte o where o.id = (p ->> 'ort')::uuid and o.company_id = betrieb;
  end if;
  if ort.id is null then
    raise exception 'Diesen Lagerort gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  haupt := ort.art = 'haupt';
  if not haupt then
    if not ort.aktiv then
      raise exception 'Der Lagerort „%“ ist stillgelegt', ort.bezeichnung using errcode = '55000';
    end if;
    perform app.lagerort_wahl_pruefen(betrieb);
  end if;
  if nullif(p ->> 'stichtag', '') is not null then
    stichtag := (p ->> 'stichtag')::timestamptz;
    /*
      Das Bewegungsprotokoll beginnt am 30.09.2026 — davor lässt sich der
      Bestand eines Zeitpunkts nicht nachrechnen. Und eine Liste für einen
      Stichtag in ferner Zukunft ist keine Zählung, sondern ein Vorrat.
    */
    if stichtag < timestamptz '2026-09-30 00:00:00+02' then
      raise exception 'Der Stichtag liegt vor dem Beginn des Bewegungsprotokolls (30.09.2026) — der Bestand von damals lässt sich nicht nachrechnen.'
        using errcode = '22023';
    end if;
    if stichtag > now() + interval '60 days' then
      raise exception 'Der Stichtag liegt mehr als 60 Tage in der Zukunft.' using errcode = '22023';
    end if;
  end if;
  if char_length(coalesce(p ->> 'bezeichnung', '')) > 120 then
    raise exception 'Die Bezeichnung ist länger als 120 Zeichen' using errcode = '22023';
  end if;

  wer := (select u.name from public.users u where u.id = auth.uid());
  insert into public.inventuren (company_id, lagerort_id, bezeichnung, auswahl, stichtag, angelegt_von, angelegt_von_name)
  values (betrieb, ort.id, nullif(btrim(coalesce(p ->> 'bezeichnung', '')), ''),
          jsonb_build_object('umfang', umfang, 'warengruppe', gruppe, 'suche', suche),
          stichtag, auth.uid(), wer)
  returning id into kennung;

  with kandidaten as (
    select m.id
      from public.materials m
      left join public.lagerbestaende b on not haupt and b.lagerort_id = ort.id and b.material_id = m.id
     where m.company_id = betrieb
       and (gruppe is null or lower(coalesce(m.warengruppe, '')) = lower(gruppe))
       and (suche is null
            or m.name ilike '%' || suche || '%'
            or coalesce(m.article_number, '') ilike '%' || suche || '%')
       and case
             when haupt and umfang = 'bestand' then m.lagerartikel and m.stock > 0
             when haupt then m.lagerartikel and (not m.ausgelaufen or m.stock > 0)
             when umfang = 'bestand' then coalesce(b.menge, 0) > 0
             else (m.lagerartikel and not m.ausgelaufen) or coalesce(b.menge, 0) > 0
           end
  ), neu as (
    -- Was am Ort schon auf einer offenen Liste steht, bleibt dort — auch wenn zwei Listen zugleich entstehen.
    insert into public.inventur_zeilen (company_id, inventur_id, lagerort_id, material_id)
    select betrieb, kennung, ort.id, k.id from kandidaten k
    on conflict (lagerort_id, material_id) where offen do nothing
    returning 1
  )
  select (select count(*) from neu), (select count(*) from kandidaten) - (select count(*) from neu)
    into angelegt, uebersprungen;

  if angelegt = 0 then
    raise exception '%', case when uebersprungen > 0
      then format('Alle %s Artikel dieser Auswahl stehen schon auf einer offenen Zählliste für diesen Ort.', uebersprungen)
      else 'Für diese Auswahl gibt es an diesem Ort keine Artikel.' end
      using errcode = '22023';
  end if;
  return jsonb_build_object('id', kennung, 'artikel', angelegt, 'uebersprungen', uebersprungen);
end;
$$;

/* Ein Artikel, der beim Zählen im Regal liegt, aber nicht auf der Liste steht. */
create or replace function public.inventur_artikel_hinzufuegen(p_inventur uuid, p_material uuid) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  inv public.inventuren;
  ort public.lagerorte;
  artikel public.materials;
  kennung uuid;
begin
  select * into inv from public.inventuren i where i.id = p_inventur for update;
  perform app.inventur_recht(inv.company_id);
  if inv.zustand <> 'offen' then
    raise exception 'Diese Zählliste ist schon gebucht' using errcode = '55000';
  end if;
  select * into ort from public.lagerorte o where o.id = inv.lagerort_id;
  select * into artikel from public.materials m where m.id = p_material and m.company_id = inv.company_id;
  if artikel.id is null then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
  end if;
  -- Im Hauptlager liegt nur, was als Lagerartikel geführt wird (M6, `materials_bestand_nur_im_lager`).
  if ort.art = 'haupt' and not artikel.lagerartikel then
    raise exception '„%“ ist kein Lagerartikel — erst im Katalog als Lagerartikel führen, dann zählen.', artikel.name
      using errcode = '55000';
  end if;
  if exists (select 1 from public.inventur_zeilen z where z.inventur_id = p_inventur and z.material_id = p_material) then
    raise exception '„%“ steht schon auf dieser Zählliste.', artikel.name using errcode = '23505';
  end if;
  if exists (select 1 from public.inventur_zeilen z where z.offen and z.lagerort_id = ort.id and z.material_id = p_material) then
    raise exception '„%“ steht schon auf einer anderen offenen Zählliste für diesen Ort.', artikel.name using errcode = '23505';
  end if;
  insert into public.inventur_zeilen (company_id, inventur_id, lagerort_id, material_id)
  values (inv.company_id, p_inventur, ort.id, p_material)
  returning id into kennung;
  return kennung;
end;
$$;

/*
  Die gezählte Menge einer Zeile — `null` nimmt die Zählung zurück. Jede
  Eingabe setzt den Zeitpunkt neu: wer korrigiert, hat neu hingesehen.
*/
create or replace function public.inventur_zaehlen(p_zeile uuid, p_menge numeric) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  zeile public.inventur_zeilen;
  inv public.inventuren;
  einheit text;
  fehler text;
begin
  select * into zeile from public.inventur_zeilen z where z.id = p_zeile for update;
  select * into inv from public.inventuren i where i.id = zeile.inventur_id;
  perform app.inventur_recht(inv.company_id);
  if inv.zustand <> 'offen' then
    raise exception 'Diese Zählliste ist schon gebucht — gezählt wird auf einer neuen.' using errcode = '55000';
  end if;
  if p_menge is not null then
    if p_menge < 0 then
      raise exception 'Gezählt ist null oder mehr' using errcode = '23514';
    end if;
    select m.unit into einheit from public.materials m where m.id = zeile.material_id;
    fehler := case when p_menge > 0 then app.menge_fehler(p_menge, einheit) end;
    if fehler is not null then
      raise exception '%', fehler using errcode = '23514';
    end if;
  end if;
  update public.inventur_zeilen z
     set gezaehlt = p_menge,
         gezaehlt_am = case when p_menge is null then null else now() end,
         gezaehlt_von = case when p_menge is null then null else auth.uid() end,
         gezaehlt_von_name = case when p_menge is null then null
                                  else (select u.name from public.users u where u.id = auth.uid()) end
   where z.id = p_zeile
  returning * into zeile;
  return jsonb_build_object('zeile', zeile.id, 'gezaehlt', zeile.gezaehlt, 'gezaehlt_am', zeile.gezaehlt_am,
                            'gezaehlt_von_name', zeile.gezaehlt_von_name);
end;
$$;

/* Eine offene Liste verwerfen — gebucht ist nichts, also bleibt nichts zu protokollieren. */
create or replace function public.inventur_verwerfen(p_inventur uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  inv public.inventuren;
begin
  select * into inv from public.inventuren i where i.id = p_inventur for update;
  perform app.inventur_recht(inv.company_id);
  if inv.zustand <> 'offen' then
    raise exception 'Eine gebuchte Zählliste ist das Protokoll der Inventur und bleibt.' using errcode = '55000';
  end if;
  delete from public.inventuren i where i.id = p_inventur;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lesen: Übersicht, eine Liste, Vorschau
-- ---------------------------------------------------------------------------

/* Die Zähllisten des Betriebs, jüngste zuerst — mit Fortschritt und Ergebnis. */
create or replace function public.inventur_listen(p_grenze integer default 50) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  -- Der eigene Betrieb — oder der, in den der Support gerade sieht (wie die Leseregel).
  betrieb text := coalesce(app.lesebetrieb(), app.supportbetrieb());
begin
  if betrieb is null
     or not (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()
             or betrieb is not distinct from app.supportbetrieb()) then
    raise exception 'Die Inventur sehen Verwaltung, Buchhaltung und Leitung' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.zeile order by x.offen desc, x.angelegt_am desc)
      from (
        select i.zustand = 'offen' as offen, i.angelegt_am,
               jsonb_build_object(
                 'id', i.id, 'ort', i.lagerort_id, 'ort_name', app.ort_name(i.company_id, i.lagerort_id),
                 'bezeichnung', i.bezeichnung, 'stichtag', i.stichtag,
                 'zustand', i.zustand, 'angelegt_am', i.angelegt_am, 'angelegt_von_name', i.angelegt_von_name,
                 'gebucht_am', i.gebucht_am, 'gebucht_von_name', i.gebucht_von_name,
                 'artikel', (select count(*) from public.inventur_zeilen z where z.inventur_id = i.id),
                 'gezaehlt', (select count(*) from public.inventur_zeilen z where z.inventur_id = i.id and z.gezaehlt is not null),
                 'abweichend', (select count(*) from public.inventur_zeilen z
                                 where z.inventur_id = i.id and z.ergebnis = 'gebucht' and z.abweichung <> 0)) as zeile
          from public.inventuren i
         where i.company_id = betrieb
         order by i.zustand = 'offen' desc, i.angelegt_am desc
         limit greatest(1, least(coalesce(p_grenze, 50), 500))
      ) x), '[]'::jsonb);
end;
$$;

/* Eine Liste mit allen Zeilen und den Angaben ihrer Artikel. */
create or replace function public.inventur_laden(p_inventur uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  inv public.inventuren;
begin
  select * into inv from public.inventuren i where i.id = p_inventur;
  if inv.id is null
     or not ((inv.company_id = app.lesebetrieb()
              and (app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung()))
             or inv.company_id is not distinct from app.supportbetrieb()) then
    raise exception 'Diese Zählliste gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  return to_jsonb(inv) - 'company_id' || jsonb_build_object(
    -- Der Name des Orts auch dann, wenn die Lagerorte ausgeschaltet sind (die App lädt sie dann nicht).
    'ort_name', app.ort_name(inv.company_id, inv.lagerort_id),
    'ort_art', (select o.art from public.lagerorte o where o.id = inv.lagerort_id),
    'zeilen', coalesce((
    select jsonb_agg(to_jsonb(z) - 'company_id' || jsonb_build_object(
             'name', m.name, 'artikelnummer', m.article_number,
             'einheit', coalesce(nullif(btrim(m.unit), ''), 'Stk'), 'warengruppe', m.warengruppe)
           order by lower(m.name), z.id)
      from public.inventur_zeilen z join public.materials m on m.id = z.material_id
     where z.inventur_id = p_inventur), '[]'::jsonb));
end;
$$;

/* Was gebucht würde — ohne zu buchen. */
create or replace function public.inventur_vorschau(p_inventur uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  select i.company_id into betrieb from public.inventuren i where i.id = p_inventur;
  perform app.inventur_recht(betrieb);
  return app.inventur_lage(p_inventur);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Buchen — alle Abweichungen in einem Zug
-- ---------------------------------------------------------------------------

/*
  `p_grund`: der Grund für alle Zeilen; `p_gruende`: je Zeile ein eigener
  (`{"<zeile>": "Bruch"}`). `p_stand` aus der Vorschau: hat sich seither
  eine Zählung geändert, wird nichts gebucht (`veraltet` mit neuer Vorschau).
  Ein Konflikt (mehr entnommen als gezählt, kein Lagerartikel mehr) bucht
  ebenfalls nichts. Nicht gezählte Zeilen bleiben, wie sie sind.
*/
create or replace function public.inventur_buchen(p_inventur uuid, p_grund text, p_gruende jsonb, p_stand text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  inv public.inventuren;
  ort public.lagerorte;
  haupt boolean;
  v_grund text := nullif(btrim(coalesce(p_grund, '')), '');
  gruende jsonb := coalesce(p_gruende, '{}'::jsonb);
  lage jsonb;
  e jsonb;
  konflikte text;
  bezug text;
  zeile_grund text;
  vorher numeric;
  delta numeric;
  wer text;
  gebucht integer := 0;
  abweichend integer := 0;
  ueberholt integer := 0;
  nicht_gezaehlt integer := 0;
begin
  select * into inv from public.inventuren i where i.id = p_inventur for update;
  perform app.inventur_recht(inv.company_id);
  if inv.zustand <> 'offen' then
    raise exception 'Diese Zählliste ist schon gebucht' using errcode = '55000';
  end if;
  if v_grund is null then
    raise exception 'Ohne Grund keine Korrektur — etwa „Inventur 31.12.“' using errcode = '23514';
  end if;
  if char_length(v_grund) > 300 then
    raise exception 'Der Grund ist länger als 300 Zeichen' using errcode = '23514';
  end if;
  if jsonb_typeof(gruende) <> 'object' then
    raise exception 'Die Gründe je Zeile kamen nicht als Liste' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventur_zeilen z where z.inventur_id = p_inventur and z.gezaehlt is not null) then
    raise exception 'Auf dieser Liste ist noch nichts gezählt — gebucht wird, was gezählt ist.' using errcode = '55000';
  end if;
  if inv.stichtag is not null and inv.stichtag > now() then
    raise exception 'Gezählt wird zum Stichtag % — gebucht werden kann erst danach.',
      to_char(inv.stichtag at time zone 'Europe/Vienna', 'DD.MM.YYYY HH24:MI') using errcode = '55000';
  end if;
  select * into ort from public.lagerorte o where o.id = inv.lagerort_id;
  haupt := ort.art = 'haupt';
  if not haupt then
    perform app.lagerort_wahl_pruefen(inv.company_id);
  end if;

  -- Erst alles sperren, was gebucht wird (immer in derselben Reihenfolge), dann rechnen.
  if haupt then
    perform 1 from public.materials m
     where m.id in (select z.material_id from public.inventur_zeilen z where z.inventur_id = p_inventur and z.gezaehlt is not null)
     order by m.id for update;
  else
    perform app.ort_sperren(ort.id, z.material_id)
       from (select z.material_id from public.inventur_zeilen z
              where z.inventur_id = p_inventur and z.gezaehlt is not null order by z.material_id) z;
  end if;

  lage := app.inventur_lage(p_inventur);
  if p_stand is distinct from lage ->> 'stand' then
    return jsonb_build_object('art', 'veraltet', 'vorschau', lage);
  end if;
  select string_agg(format('„%s“: %s', x ->> 'name', x ->> 'konflikt'), ' ' order by x ->> 'name') into konflikte
    from jsonb_array_elements(lage -> 'zeilen') x
   where x ->> 'konflikt' is not null;
  if konflikte is not null then
    raise exception 'Nichts gebucht. %', konflikte using errcode = '55000';
  end if;

  bezug := format('Inventur %s vom %s', app.ort_name(inv.company_id, case when haupt then null else ort.id end),
                  to_char(coalesce(inv.stichtag, now()) at time zone 'Europe/Vienna', 'DD.MM.YYYY'));
  wer := (select u.name from public.users u where u.id = auth.uid());

  for e in select * from jsonb_array_elements(lage -> 'zeilen') loop
    if e ->> 'gezaehlt' is null then
      update public.inventur_zeilen z set offen = false, ergebnis = 'nicht_gezaehlt'
       where z.id = (e ->> 'zeile')::uuid;
      nicht_gezaehlt := nicht_gezaehlt + 1;
      continue;
    end if;
    if (e ->> 'ueberholt')::boolean then
      update public.inventur_zeilen z set offen = false, ergebnis = 'ueberholt', soll = (e ->> 'soll')::numeric
       where z.id = (e ->> 'zeile')::uuid;
      ueberholt := ueberholt + 1;
      continue;
    end if;

    zeile_grund := coalesce(nullif(btrim(gruende ->> (e ->> 'zeile')), ''), v_grund);
    if char_length(zeile_grund) > 300 then
      raise exception 'Der Grund für „%“ ist länger als 300 Zeichen', e ->> 'name' using errcode = '23514';
    end if;
    delta := (e ->> 'abweichung')::numeric;
    vorher := (e ->> 'jetzt')::numeric;

    if delta = 0 then
      -- Gezählt und gestimmt: auch das gehört ins Protokoll (wie `lager_inventur`).
      insert into public.lagerbewegungen (
        company_id, material_id, art, menge, bestand_nachher, grund, bezug, erfasst_von, erfasst_von_name, lagerort_id
      ) values (
        inv.company_id, (e ->> 'material')::uuid, 'inventur', 0, vorher, zeile_grund, bezug, auth.uid(), wer,
        case when haupt then null else ort.id end
      );
    else
      perform app.lager_kontext('inventur', zeile_grund, null, null, bezug, null);
      if haupt then
        perform set_config('app.lager_buchung', 'ja', true);
        update public.materials m set stock = vorher + delta where m.id = (e ->> 'material')::uuid;
        perform set_config('app.lager_buchung', '', true);
      else
        perform app.ort_anpassen(ort.id, (e ->> 'material')::uuid, delta, false);
      end if;
      perform app.lager_kontext_leeren();
      abweichend := abweichend + 1;
    end if;

    update public.inventur_zeilen z
       set offen = false, ergebnis = 'gebucht', soll = (e ->> 'soll')::numeric, abweichung = delta,
           bestand_vorher = vorher, bestand_nachher = vorher + delta,
           grund = case when zeile_grund is distinct from v_grund then zeile_grund end
     where z.id = (e ->> 'zeile')::uuid;
    gebucht := gebucht + 1;
  end loop;

  update public.inventuren i
     set zustand = 'gebucht', grund = v_grund, gebucht_am = now(), gebucht_von = auth.uid(), gebucht_von_name = wer
   where i.id = p_inventur;

  return jsonb_build_object('art', 'gebucht', 'gebucht', gebucht, 'abweichend', abweichend,
                            'ueberholt', ueberholt, 'nicht_gezaehlt', nicht_gezaehlt);
end;
$$;

revoke all on function public.inventur_anlegen(jsonb) from public, anon;
revoke all on function public.inventur_artikel_hinzufuegen(uuid, uuid) from public, anon;
revoke all on function public.inventur_zaehlen(uuid, numeric) from public, anon;
revoke all on function public.inventur_verwerfen(uuid) from public, anon;
revoke all on function public.inventur_listen(integer) from public, anon;
revoke all on function public.inventur_laden(uuid) from public, anon;
revoke all on function public.inventur_vorschau(uuid) from public, anon;
revoke all on function public.inventur_buchen(uuid, text, jsonb, text) from public, anon;
grant execute on function public.inventur_anlegen(jsonb) to authenticated;
grant execute on function public.inventur_artikel_hinzufuegen(uuid, uuid) to authenticated;
grant execute on function public.inventur_zaehlen(uuid, numeric) to authenticated;
grant execute on function public.inventur_verwerfen(uuid) to authenticated;
grant execute on function public.inventur_listen(integer) to authenticated;
grant execute on function public.inventur_laden(uuid) to authenticated;
grant execute on function public.inventur_vorschau(uuid) to authenticated;
grant execute on function public.inventur_buchen(uuid, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Datenauskunft und Löschung einer Person
-- ---------------------------------------------------------------------------

do $migration$
declare
  quelle text;
  marke text;
  zahl integer;
begin
  -- Auskunft: als Bearbeiterin gezählt, wie die Bewegungen im Lager.
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('inventur_gezaehlt' in quelle) = 0 then
    marke := $m$      'lagerbewegungen_erfasst', (select count(*) from public.lagerbewegungen l
        where l.company_id = betrieb and l.erfasst_von = p_id),
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Datenauskunft: Einfügestelle % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, marke || $neu$      -- F14: Zählungen und Zähllisten der Inventur.
      'inventur_gezaehlt', (select count(*) from public.inventur_zeilen z
        where z.company_id = betrieb and z.gezaehlt_von = p_id),
      'inventuren_angelegt_oder_gebucht', (select count(*) from public.inventuren i
        where i.company_id = betrieb and (i.angelegt_von = p_id or i.gebucht_von = p_id)),
$neu$);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('inventur_zeilen' in quelle) = 0 then
    -- Was sofort geht: Zählungen in offenen Listen.
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Zählung) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F14: ihre Zählungen in offenen Zähllisten — noch kein Protokoll.
      'offene_zaehllisten', (select count(*) from public.inventur_zeilen z
                              where z.company_id = betrieb and z.offen and z.gezaehlt_von = p_id),
$neu$ || marke);

    -- Was bleibt: ihr Name auf gebuchten Inventurprotokollen.
    marke := $m$        -- M10/B09: Meldungen bleiben bei der Führung, bis sie sie als erledigt löscht.
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Aufbewahren) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$        -- F14: das Inventurprotokoll ist Buchhaltungsunterlage wie die Bewegungen im Lager.
        select jsonb_build_object('was', 'Inventurprotokolle', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((i.gebucht_am at time zone 'Europe/Vienna')::date)),
                                  'grund', rechtsgrund)
          from public.inventuren i
         where i.company_id = betrieb and i.zustand = 'gebucht'
           and (i.angelegt_von = p_id or i.gebucht_von = p_id
                or exists (select 1 from public.inventur_zeilen z where z.inventur_id = i.id and z.gezaehlt_von = p_id))
        union all
$neu$ || marke);

    -- Beim Löschen: aus offenen Listen gehen Name und Kennung sofort.
    marke := $m$      delete from public.zwei_faktor_codes z where z.user_id = p_id;
$m$;
    zahl := (length(quelle) - length(replace(quelle, marke, ''))) / length(marke);
    if zahl <> 1 then raise exception 'Personenlöschung: Einfügestelle (Löschen) % mal gefunden', zahl; end if;
    quelle := replace(quelle, marke, $neu$      -- F14: in offenen Zähllisten (noch kein Protokoll) gehen Name und Kennung.
      update public.inventur_zeilen z set gezaehlt_von = null, gezaehlt_von_name = null
       where z.company_id = betrieb and z.offen and z.gezaehlt_von = p_id;
      update public.inventuren i set angelegt_von = null, angelegt_von_name = null
       where i.company_id = betrieb and i.zustand = 'offen' and i.angelegt_von = p_id;
$neu$ || marke);
    execute quelle;
  end if;
end;
$migration$;
