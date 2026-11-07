/*
  LAGERORTE, FAHRZEUGE, UMLAGERUNG — UND DER SCHREIBBEFEHLS-VERTRAG
  (SHK-Ausbau M04a, Teil a1; E10, Fahrzeug-Entität für W06/W07)

  WAS FEHLTE. Es gab genau EINEN Bestand je Artikel (`materials.stock`).
  Was im Bus eines Monteurs liegt, stand nirgends; Fahrzeuge kannte die App
  nur als Freitext an der Zeitbuchung (`time_entries.vehicle_plate`).

  WAS JETZT GILT.
  - `lagerorte`: je Betrieb das Hauptlager (immer da, es ist der heutige
    Bestand), dazu weitere Lager bzw. Regale an einer Anschrift und je
    Fahrzeug ein Fahrzeuglager.
  - `fahrzeuge`: Kennzeichen, Bezeichnung, Standardfahrer (optional), aktiv.
    Die gemeinsame Kennung für Fristen (W06), Fahrtenbuch (W07) und das
    Fahrzeuglager. `vehicle_plate` bleibt, wie es ist (Altclients, Exporte);
    vorhandene Kennzeichen werden NICHT zugeordnet, sie stehen nur als
    Vorschlag da (`kennzeichen_aus_buchungen`).
  - `lagerbestaende`: der Bestand je weiterem Ort und Artikel, mit Revision.
    DAS HAUPTLAGER STEHT DORT NICHT. Sein Bestand ist und bleibt
    `materials.stock` — die Projektion des Hauptlagers ist die Spalte selbst.
    Grund: eine zweite Zeile für dieselbe Zahl müsste ein Auslöser
    nachführen, und jede Abweichung zwischen beiden wäre ein Fehler, den
    niemand bemerkt. So lesen alle bestehenden Wege, Anzeigen und Prüfungen
    des Hauptlagers weiter genau dieselbe Zahl, und der Rücklauf einer
    Sicherung bringt nichts doppelt.
  - `lagerbewegungen` bekommt den Ort (`lagerort_id`, leer = Hauptlager —
    so bleiben alle Altdaten, was sie sind, und jeder Weg ohne Ort schreibt
    wie bisher), bei einer Umlagerung den Gegenort (`gegenort_id`, leer =
    Hauptlager) und die Vorgangskennung des Befehls (`vorgang`). Neue Art
    `umlagerung`.
  - Bestand an einem weiteren Ort ändert sich nur über eine Bewegung: die
    Zeile schreibt ein Auslöser an `lagerbestaende`, so wie der an
    `materials` die des Hauptlagers. Kein Ort wird negativ (Prüfbedingung).
  - Eröffnungsbestände weiterer Orte entstehen nur durch eine bestätigte
    Zählung (Inventur am Ort, Teil a2) oder eine Umlagerung — nie aus einer
    Annahme. Es gibt keinen Anfangsbestand beim Anlegen eines Ortes.

  DER SCHREIBBEFEHLS-VERTRAG (Bauplanung 4.3), erster Verbraucher
  `umlagern`. Jeder Befehl trägt Zielkennung, erwarteten Stand, typisierte
  Aktion, Vorgangskennung, Einheit und (bei Korrekturen) einen Grund. Der
  Server prüft Sitzung und Mandant, sperrt in fester Reihenfolge, prüft den
  erwarteten Stand, validiert, schreibt atomar samt Bewegungen und gibt das
  bestätigte Ergebnis zurück. Vorgangskennung und Hash der Nutzlast sind je
  Betrieb eindeutig (`befehle_vorgaenge`): dieselben Daten liefern das
  bestehende Ergebnis, dieselbe Kennung mit anderem Inhalt ist ein Konflikt.
  `befehl_stand` beantwortet die Frage nach einem unklaren Ausgang.

  RECHTE. Lesen: Orte, Fahrzeuge und Ortsbestände jedes Betriebsmitglied
  (der Monteur sieht „Mein Fahrzeug“, wie er heute den Lagerbestand am
  Katalog sieht). Pflegen und Umlagern: Verwaltung und Leitung, wie heute
  Wareneingang und Inventur. Der Fahrer lagert aus SEINEM Fahrzeug ins
  Hauptlager zurück, wenn der Betrieb es erlaubt
  (`companies.lager_rueckgabe_fahrer`, Standard aus).

  ÜBERSTEUERUNG GILT NICHT FÜR ORTE. Die vorhandene, bestätigte
  Übersteuerung (Runde 7, `anforderung_status_setzen` mit
  `p_trotz_fehlbestand`) sagt Ware ZU, die nicht frei ist — sie bewegt
  nichts, und der Fehlbestand bleibt sichtbar. Eine Umlagerung bewegt Ware;
  was am Quellort nicht liegt, kann nicht umgelagert werden. Stimmt die Zahl
  nicht, ist die Antwort die Zählung am Ort (Inventur mit Grund), nicht ein
  negativer Bestand, der danach in keiner Liste mehr stimmt.

  NICHT PROTOKOLLIERT im Änderungsjournal (M01b): Fahrzeuge und Orte sind
  Stammdaten ohne Belegcharakter; die Bewegungen sind das Protokoll des
  Bestands.
*/

-- ---------------------------------------------------------------------------
-- 0. Was der Betrieb erlaubt
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists lager_rueckgabe_fahrer boolean not null default false;

comment on column public.companies.lager_rueckgabe_fahrer is
  'Der Standardfahrer lagert aus seinem Fahrzeug selbst ins Hauptlager zurück (M04a). Standard aus: heute bucht das Lager die Verwaltung oder die Leitung.';

-- ---------------------------------------------------------------------------
-- 1. Fahrzeuge
-- ---------------------------------------------------------------------------

create table if not exists public.fahrzeuge (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null references public.companies (id),
  kennzeichen        text not null,
  bezeichnung        text,
  -- Personenbezug: in Datenauskunft und Löschung einer Person (unten).
  standardfahrer_uid uuid references public.users (id) on delete set null,
  aktiv              boolean not null default true,
  angelegt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now(),
  constraint fahrzeuge_kennzeichen check (kennzeichen ~ '[[:alnum:]]' and length(kennzeichen) <= 20)
);

/*
  EIN KENNZEICHEN JE BETRIEB — verglichen ohne Leerzeichen, Bindestriche und
  Groß-/Kleinschreibung: „W-12345A“, „W 12345 A“ und „w12345a“ sind dasselbe
  Fahrzeug. Nur eingebaute Funktionen im Ausdruck, damit der Rücklauf mit dem
  Dienstschlüssel den Index ohne eigenes Ausführungsrecht pflegen kann.
*/
create unique index if not exists fahrzeuge_kennzeichen_eindeutig
  on public.fahrzeuge (company_id, upper(regexp_replace(kennzeichen, '[^[:alnum:]]', '', 'g')));
create index if not exists fahrzeuge_fahrer
  on public.fahrzeuge (standardfahrer_uid) where standardfahrer_uid is not null;

comment on table public.fahrzeuge is
  'Fahrzeuge des Betriebs (M04a): gemeinsame Kennung für Fahrzeuglager (E10), Fristen (W06) und Fahrtenbuch (W07). Geschrieben nur über fahrzeug_speichern.';

alter table public.fahrzeuge enable row level security;
revoke all on public.fahrzeuge from public, anon, authenticated;
grant select on public.fahrzeuge to authenticated;

drop policy if exists fahrzeuge_lesen on public.fahrzeuge;
create policy fahrzeuge_lesen on public.fahrzeuge for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

drop trigger if exists fahrzeuge_kein_support_schreiben on public.fahrzeuge;
create trigger fahrzeuge_kein_support_schreiben before insert or update or delete on public.fahrzeuge
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists fahrzeuge_betrieb_fest on public.fahrzeuge;
create trigger fahrzeuge_betrieb_fest before update on public.fahrzeuge
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 2. Lagerorte
-- ---------------------------------------------------------------------------

create table if not exists public.lagerorte (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.companies (id),
  art         text not null check (art in ('haupt', 'lager', 'fahrzeug')),
  bezeichnung text not null check (btrim(bezeichnung) <> ''),
  -- Ein Außenlager oder Regal an einer Anschrift; beim Fahrzeug leer.
  anschrift   text,
  fahrzeug_id uuid references public.fahrzeuge (id),
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now(),
  constraint lagerorte_fahrzeug check ((art = 'fahrzeug') = (fahrzeug_id is not null)),
  -- Das Hauptlager lässt sich nicht stilllegen: es ist der heutige Bestand.
  constraint lagerorte_haupt_aktiv check (art <> 'haupt' or aktiv)
);

create unique index if not exists lagerorte_ein_hauptlager on public.lagerorte (company_id) where art = 'haupt';
create unique index if not exists lagerorte_je_fahrzeug on public.lagerorte (fahrzeug_id) where fahrzeug_id is not null;
create index if not exists lagerorte_betrieb on public.lagerorte (company_id, art);

comment on table public.lagerorte is
  'Lagerorte (M04a, E10): das Hauptlager (Bestand in materials.stock), weitere Lager und je Fahrzeug ein Fahrzeuglager (Bestand in lagerbestaende). Geschrieben nur über lagerort_speichern und fahrzeug_speichern.';

alter table public.lagerorte enable row level security;
revoke all on public.lagerorte from public, anon, authenticated;
grant select on public.lagerorte to authenticated;

drop policy if exists lagerorte_lesen on public.lagerorte;
create policy lagerorte_lesen on public.lagerorte for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

drop trigger if exists lagerorte_kein_support_schreiben on public.lagerorte;
create trigger lagerorte_kein_support_schreiben before insert or update or delete on public.lagerorte
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists lagerorte_betrieb_fest on public.lagerorte;
create trigger lagerorte_betrieb_fest before update on public.lagerorte
  for each row execute function app.betrieb_unveraenderlich();

/* Das Hauptlager eines Betriebs — angelegt, wenn es fehlt. */
create or replace function app.hauptlager_anlegen(p_betrieb text) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ort uuid;
begin
  insert into public.lagerorte (company_id, art, bezeichnung)
  values (p_betrieb, 'haupt', 'Hauptlager')
  on conflict (company_id) where art = 'haupt' do nothing;
  select o.id into ort from public.lagerorte o where o.company_id = p_betrieb and o.art = 'haupt';
  return ort;
end;
$$;

revoke all on function app.hauptlager_anlegen(text) from public, anon, authenticated;

-- Jeder bestehende Betrieb bekommt sein Hauptlager. Bestände bleiben, wo sie sind.
select app.hauptlager_anlegen(c.id) from public.companies c;

/*
  NEUE BETRIEBE bekommen es beim Anlegen, in derselben Transaktion wie Firma
  und Administrator. Rumpf wie in 20260914120000_betrieb_anlegen.sql, neu nur
  die markierte Zeile. Kein Auslöser an `companies`: der Rücklauf einer
  Sicherung legt die Firma neu an und bringt ihr Hauptlager mit — ein
  Auslöser legte ein zweites an, und der Rücklauf scheiterte daran.
*/
create or replace function public.betrieb_anlegen(p_kennung text, p_name text, p_admin_uid uuid, p_admin_name text, p_admin_email text, p_angelegt_von uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Die Kennung ist der Mandantenschluessel. Ein zweiter Betrieb darauf
  -- vermischte seine Daten mit dem bestehenden, und zwar unbemerkt.
  if exists (select 1 from public.companies c where c.id = p_kennung) then
    raise exception 'Die Kennung „%" ist vergeben. Ein zweiter Betrieb darauf würde seine Daten mit dem bestehenden vermischen.', p_kennung
      using errcode = '23505';
  end if;

  /*
    DIE VORGABEWERTE STEHEN HIER UND NICHT IN DER FUNCTION.

    Stundensaetze, Zuschlaege, Steuersatz, Zahlungsziel: ein neuer Betrieb
    rechnet vom ersten Tag an, auch bevor jemand die Einstellungen oeffnet.
    Fehlten sie, stuende auf der ersten Rechnung eine Null — und niemand
    suchte den Fehler in einem leeren Feld.
  */
  insert into public.companies (id, name, rates)
  values (p_kennung, p_name, jsonb_build_object(
    'fach', 65, 'helper', 45,
    'nightSurcharge', 0.5, 'emergencySurcharge', 1,
    'vatRate', 0.2, 'dueDays', 14));

  insert into public.users (id, company_id, name, email, role, active)
  values (p_admin_uid, p_kennung, p_admin_name, p_admin_email, 'Administrator', true);

  insert into public.betriebsanlagen
    (betrieb_kennung, name, angelegt_von, erster_admin_uid)
  values (p_kennung, p_name, p_angelegt_von, p_admin_uid);

  -- M04a: das Hauptlager gibt es vom ersten Tag an (E10).
  perform app.hauptlager_anlegen(p_kennung);

  return jsonb_build_object('companyId', p_kennung, 'ersterAdminUid', p_admin_uid);
end;
$function$;

revoke all on function public.betrieb_anlegen(text, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.betrieb_anlegen(text, text, uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Bestand je weiterem Ort
-- ---------------------------------------------------------------------------

create table if not exists public.lagerbestaende (
  lagerort_id  uuid not null references public.lagerorte (id),
  material_id  uuid not null references public.materials (id) on delete cascade,
  company_id   text not null references public.companies (id),
  menge        numeric(12,3) not null default 0,
  -- Steigt mit jeder Änderung der Menge — der erwartete Stand eines Befehls.
  revision     bigint not null default 0,
  geaendert_am timestamptz not null default now(),
  primary key (lagerort_id, material_id),
  -- Kein Ort wird negativ (E10).
  constraint lagerbestaende_nicht_negativ check (menge >= 0)
);

create index if not exists lagerbestaende_artikel on public.lagerbestaende (material_id);
create index if not exists lagerbestaende_betrieb on public.lagerbestaende (company_id, lagerort_id);

comment on table public.lagerbestaende is
  'Bestand je weiterem Lagerort und Artikel (M04a). Das Hauptlager steht nicht hier — sein Bestand ist materials.stock. Ändert sich nur über Bewegungen.';

alter table public.lagerbestaende enable row level security;
revoke all on public.lagerbestaende from public, anon, authenticated;
grant select on public.lagerbestaende to authenticated;

drop policy if exists lagerbestaende_lesen on public.lagerbestaende;
create policy lagerbestaende_lesen on public.lagerbestaende for select
  using (company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()));

drop trigger if exists lagerbestaende_kein_support_schreiben on public.lagerbestaende;
create trigger lagerbestaende_kein_support_schreiben before insert or update or delete on public.lagerbestaende
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists lagerbestaende_betrieb_fest on public.lagerbestaende;
create trigger lagerbestaende_betrieb_fest before update on public.lagerbestaende
  for each row execute function app.betrieb_unveraenderlich();

-- Live: die Lageransicht und „Mein Fahrzeug“ gehen mit, wenn jemand bucht.
alter table public.lagerbestaende replica identity full;
do $pub$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lagerbestaende') then
    alter publication supabase_realtime add table public.lagerbestaende;
  end if;
end;
$pub$;

-- ---------------------------------------------------------------------------
-- 4. Bewegungen: Ort, Gegenort, Vorgang
-- ---------------------------------------------------------------------------

alter table public.lagerbewegungen
  add column if not exists lagerort_id uuid references public.lagerorte (id),
  add column if not exists gegenort_id uuid references public.lagerorte (id),
  add column if not exists vorgang uuid;

comment on column public.lagerbewegungen.lagerort_id is
  'Der Ort, dessen Bestand die Zeile ändert (M04a). Leer = Hauptlager — alle Altdaten und jeder Weg ohne Ort.';
comment on column public.lagerbewegungen.gegenort_id is
  'Bei einer Umlagerung der andere Ort (Ziel an der Zeile der Quelle, Quelle an der des Ziels). Leer = Hauptlager.';
comment on column public.lagerbewegungen.vorgang is
  'Vorgangskennung des Befehls (befehle_vorgaenge.vorgang) — verbindet die beiden Zeilen einer Umlagerung.';

create index if not exists lagerbewegungen_ort
  on public.lagerbewegungen (lagerort_id, created_at desc) where lagerort_id is not null;
create index if not exists lagerbewegungen_gegenort
  on public.lagerbewegungen (gegenort_id) where gegenort_id is not null;

alter table public.lagerbewegungen drop constraint if exists lagerbewegungen_art_check;
alter table public.lagerbewegungen add constraint lagerbewegungen_art_check check (art in (
  'anfangsbestand', 'eingang', 'entnahme', 'retoure', 'inventur', 'zugang', 'abgang', 'einladen_zurueck',
  'umlagerung'));

/* Gegenort und Vorgang der nächsten Buchung — neben `app.lager_kontext`, dessen Aufrufer unverändert bleiben. */
create or replace function app.lager_kontext_ort(p_gegenort uuid, p_vorgang uuid) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform set_config('app.lager_gegenort', coalesce(p_gegenort::text, ''), true);
  perform set_config('app.lager_vorgang', coalesce(p_vorgang::text, ''), true);
end;
$$;

revoke all on function app.lager_kontext_ort(uuid, uuid) from public, anon, authenticated;

/* Leert jetzt auch Gegenort und Vorgang. Rumpf sonst wie in 20260930380000_lagerbewegungen.sql. */
create or replace function app.lager_kontext_leeren() returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform app.lager_kontext(null, null, null, null, null, null);
  perform set_config('app.lager_gegenort', '', true);
  perform set_config('app.lager_vorgang', '', true);
end;
$$;

revoke all on function app.lager_kontext_leeren() from public, anon;
grant execute on function app.lager_kontext_leeren() to authenticated;

/*
  DAS PROTOKOLL DES HAUPTLAGERS — Rumpf wie in
  20260930380000_lagerbewegungen.sql. Neu nur Gegenort und Vorgang aus dem
  Kontext; ohne sie (jeder bestehende Weg) bleiben beide leer, die Zeile ist
  dieselbe wie bisher.
*/
create or replace function app.lagerbewegung_schreiben() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  delta numeric(12,3);
  art text;
  auftrag uuid;
begin
  if app.ist_dienst() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    delta := coalesce(new.stock, 0);
    art := 'anfangsbestand';
  else
    delta := coalesce(new.stock, 0) - coalesce(old.stock, 0);
    art := coalesce(app.lager_wert('app.lager_art'), case when delta > 0 then 'zugang' else 'abgang' end);
  end if;
  if delta = 0 then
    return null;
  end if;
  auftrag := nullif(app.lager_wert('app.lager_auftrag'), '')::uuid;
  if auftrag is not null and not exists (select 1 from public.material_orders o where o.id = auftrag) then
    auftrag := null; -- die Anforderung entsteht womöglich erst danach in derselben Buchung
  end if;
  insert into public.lagerbewegungen (
    company_id, material_id, art, menge, bestand_nachher,
    grund, lieferant, lieferschein, bezug, material_order_id, erfasst_von, erfasst_von_name,
    gegenort_id, vorgang
  ) values (
    new.company_id, new.id, art, delta, coalesce(new.stock, 0),
    app.lager_wert('app.lager_grund'), app.lager_wert('app.lager_lieferant'),
    app.lager_wert('app.lager_lieferschein'), app.lager_wert('app.lager_bezug'), auftrag,
    auth.uid(), (select u.name from public.users u where u.id = auth.uid()),
    app.lager_wert('app.lager_gegenort')::uuid, app.lager_wert('app.lager_vorgang')::uuid
  );
  return null;
end;
$$;

revoke all on function app.lagerbewegung_schreiben() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Der Wächter und das Protokoll der weiteren Orte
-- ---------------------------------------------------------------------------

/*
  WIE `bestand_nur_ueber_bewegung` AM HAUPTLAGER: eine Menge ändert sich nur
  unter einer Buchung (`app.lager_buchung`), dann schreibt der Auslöser
  darunter die Bewegung. Ort und Artikel gehören demselben Betrieb, und das
  Hauptlager steht hier nie (sein Bestand ist `materials.stock`). Der
  Dienstschlüssel (Rücklauf einer Sicherung) bringt Mengen und Revision mit,
  wie sie gesichert wurden.
*/
create or replace function app.ortsbestand_waechter() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.lagerorte o
                    where o.id = new.lagerort_id and o.company_id = new.company_id and o.art <> 'haupt')
       or not exists (select 1 from public.materials m
                       where m.id = new.material_id and m.company_id = new.company_id) then
      raise exception 'Ein Ortsbestand gehört zu einem weiteren Lagerort und einem Artikel desselben Betriebs — das Hauptlager führt der Artikel selbst'
        using errcode = '23514';
    end if;
    if new.menge <> 0 and not app.ist_dienst() and app.lager_wert('app.lager_buchung') is null then
      raise exception 'Ein Lagerort bekommt Bestand nur über eine Buchung — Umlagerung, Inventur am Ort, Wareneingang oder Retoure'
        using errcode = '42501';
    end if;
    if not app.ist_dienst() then
      new.revision := case when new.menge <> 0 then 1 else 0 end;
      new.geaendert_am := now();
    end if;
    return new;
  end if;

  if new.lagerort_id is distinct from old.lagerort_id or new.material_id is distinct from old.material_id then
    raise exception 'Ort und Artikel eines Ortsbestands stehen fest' using errcode = '42501';
  end if;
  if new.menge is distinct from old.menge then
    if not app.ist_dienst() and app.lager_wert('app.lager_buchung') is null then
      raise exception 'Der Bestand eines Lagerorts ändert sich nur über eine Buchung — so steht jede Änderung im Bewegungsprotokoll'
        using errcode = '42501';
    end if;
    new.revision := old.revision + 1;
    new.geaendert_am := now();
  elsif not app.ist_dienst() then
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

revoke all on function app.ortsbestand_waechter() from public, anon, authenticated;

drop trigger if exists lagerbestaende_waechter on public.lagerbestaende;
create trigger lagerbestaende_waechter before insert or update on public.lagerbestaende
  for each row execute function app.ortsbestand_waechter();

/* Das Protokoll eines weiteren Ortes — dieselben Felder wie am Hauptlager, dazu der Ort. */
create or replace function app.ortsbewegung_schreiben() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  delta numeric(12,3);
  art text;
  auftrag uuid;
begin
  if app.ist_dienst() then
    return null;
  end if;
  delta := new.menge - case when tg_op = 'INSERT' then 0 else old.menge end;
  if delta = 0 then
    return null;
  end if;
  art := coalesce(app.lager_wert('app.lager_art'), case when delta > 0 then 'zugang' else 'abgang' end);
  auftrag := nullif(app.lager_wert('app.lager_auftrag'), '')::uuid;
  if auftrag is not null and not exists (select 1 from public.material_orders o where o.id = auftrag) then
    auftrag := null;
  end if;
  insert into public.lagerbewegungen (
    company_id, material_id, art, menge, bestand_nachher,
    grund, lieferant, lieferschein, bezug, material_order_id, erfasst_von, erfasst_von_name,
    lagerort_id, gegenort_id, vorgang
  ) values (
    new.company_id, new.material_id, art, delta, new.menge,
    app.lager_wert('app.lager_grund'), app.lager_wert('app.lager_lieferant'),
    app.lager_wert('app.lager_lieferschein'), app.lager_wert('app.lager_bezug'), auftrag,
    auth.uid(), (select u.name from public.users u where u.id = auth.uid()),
    new.lagerort_id, app.lager_wert('app.lager_gegenort')::uuid, app.lager_wert('app.lager_vorgang')::uuid
  );
  return null;
end;
$$;

revoke all on function app.ortsbewegung_schreiben() from public, anon, authenticated;

drop trigger if exists lagerbestaende_bewegung on public.lagerbestaende;
create trigger lagerbestaende_bewegung after insert or update of menge on public.lagerbestaende
  for each row execute function app.ortsbewegung_schreiben();

-- ---------------------------------------------------------------------------
-- 6. „Wer Bestand hat, wird geführt“ — auch an weiteren Orten
-- ---------------------------------------------------------------------------

/*
  `materials_bestand_nur_im_lager` (lagerartikel or stock = 0) gilt für das
  Hauptlager. Für die weiteren Orte dasselbe in zwei Richtungen:
  - Entsteht Bestand an einem Ort, wird der Artikel zum Lagerartikel — über
    denselben Auslöser wie am Hauptlager (`app.lager_folgt_bestand`), den die
    Buchung dafür ausdrücklich anstößt. Rumpf wie in
    20260930410000_katalog_lager_aufschlag_wartung.sql, neu nur der zweite
    Zweig; ohne Anstoß rechnet er wie bisher.
  - „Im Lager führen“ lässt sich nicht abschalten, solange an einem Ort
    etwas liegt.
*/
create or replace function app.lager_folgt_bestand() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Nur wenn Bestand ENTSTEHT: wer bei Bestand abschalten will, soll den
  -- Grund hören (Prüfung unten), nicht still überstimmt werden.
  if new.stock <> 0 and (tg_op = 'INSERT' or new.stock is distinct from old.stock) then
    new.lagerartikel := true;
  end if;
  -- M04a: Bestand entsteht an einem weiteren Lagerort (angestoßen von `app.ort_anpassen`).
  if tg_op = 'UPDATE' and app.lager_wert('app.ort_bestand_entsteht') is not distinct from new.id::text then
    new.lagerartikel := true;
  end if;
  return new;
end;
$$;

revoke all on function app.lager_folgt_bestand() from public, anon, authenticated;

create or replace function app.lagerartikel_bleibt_bei_ortsbestand() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  orte text;
begin
  if old.lagerartikel and not new.lagerartikel and not app.ist_dienst() then
    select string_agg(o.bezeichnung, ', ' order by o.bezeichnung) into orte
      from public.lagerbestaende b
      join public.lagerorte o on o.id = b.lagerort_id
     where b.material_id = new.id and b.menge <> 0;
    if orte is not null then
      raise exception '„%“ liegt noch an einem weiteren Lagerort (%) — erst umlagern oder dort zählen, dann aus dem Lager nehmen', new.name, orte
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.lagerartikel_bleibt_bei_ortsbestand() from public, anon, authenticated;

drop trigger if exists materials_ortsbestand_im_lager on public.materials;
create trigger materials_ortsbestand_im_lager before update of lagerartikel on public.materials
  for each row execute function app.lagerartikel_bleibt_bei_ortsbestand();

-- ---------------------------------------------------------------------------
-- 7. Die Helfer der Buchungen an einem Ort
-- ---------------------------------------------------------------------------

/*
  Der Ort einer Buchung. LEER HEISST HAUPTLAGER, und die Kennung des
  Hauptlagers selbst auch — so wählt die Oberfläche jeden Ort gleich, und
  intern bleibt das Hauptlager `materials.stock`. Ein fremder oder
  unbekannter Ort wird abgewiesen, ein stillgelegter, wenn `p_nur_aktiv`.
*/
create or replace function app.ort_pruefen(p_betrieb text, p_ort uuid, p_nur_aktiv boolean default true)
  returns public.lagerorte
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  o public.lagerorte;
begin
  if p_ort is null then
    return null;
  end if;
  select * into o from public.lagerorte x where x.id = p_ort and x.company_id = p_betrieb;
  if o.id is null then
    raise exception 'Diesen Lagerort gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  if o.art = 'haupt' then
    return null;
  end if;
  if p_nur_aktiv and not o.aktiv then
    raise exception 'Der Lagerort „%“ ist stillgelegt', o.bezeichnung using errcode = '55000';
  end if;
  return o;
end;
$$;

revoke all on function app.ort_pruefen(text, uuid, boolean) from public, anon;
grant execute on function app.ort_pruefen(text, uuid, boolean) to authenticated;

/*
  DIE SPERRE IN FESTER REIHENFOLGE: zuerst die Zeile des Artikels, dann die
  Ortsbestände nach der Kennung des Ortes. Jeder Weg, der an einem Ort bucht,
  geht so vor — zwei Buchungen auf denselben Artikel warten aufeinander,
  statt sich gegenseitig festzuhalten. Fehlt die Zeile des Ortes, entsteht
  sie mit null, damit es etwas zu sperren gibt. Zurück: die Menge jetzt.
*/
create or replace function app.ort_sperren(p_ort uuid, p_material uuid) returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  menge numeric;
begin
  perform 1 from public.materials m where m.id = p_material for no key update;
  insert into public.lagerbestaende (lagerort_id, material_id, company_id)
  select p_ort, p_material, o.company_id from public.lagerorte o where o.id = p_ort
  on conflict (lagerort_id, material_id) do nothing;
  select b.menge into menge from public.lagerbestaende b
   where b.lagerort_id = p_ort and b.material_id = p_material
   for update;
  if menge is null then
    raise exception 'Diesen Lagerort gibt es nicht' using errcode = 'P0002';
  end if;
  return menge;
end;
$$;

revoke all on function app.ort_sperren(uuid, uuid) from public, anon;
grant execute on function app.ort_sperren(uuid, uuid) to authenticated;

/*
  `bestand_anpassen` FÜR EINEN WEITEREN ORT. Ein Abgang nur mit Ansage (wie
  dort). `p_klemmen`: bei null Schluss, wie `bestand_anpassen` am Hauptlager
  (Abholen, Abhaken buchen, was da ist); sonst weist ein Abgang über den
  Bestand hinaus ab (Umlagerung: was nicht liegt, wird nicht bewegt).
  Entsteht Bestand, wird der Artikel zum Lagerartikel. Zurück: die Menge
  danach. Mit den Rechten des Eigentümers, weil auch `einkauf_geliefert`
  (mit den Rechten des Aufrufers) hier bucht; prüft deshalb selbst, dass Ort
  und Artikel dem Betrieb des Aufrufers gehören.
*/
create or replace function app.ort_anpassen(p_ort uuid, p_material uuid, p_delta numeric, p_klemmen boolean)
  returns numeric
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ort public.lagerorte;
  alt numeric;
  neu numeric;
begin
  select * into ort from public.lagerorte o where o.id = p_ort;
  if ort.id is null or ort.art = 'haupt'
     or not (app.ist_dienst() or app.betriebsmitglied(ort.company_id) or app.support_schreibt(ort.company_id))
     or not exists (select 1 from public.materials m where m.id = p_material and m.company_id = ort.company_id) then
    raise exception 'Diesen Lagerort gibt es nicht' using errcode = '42501';
  end if;
  if coalesce(p_delta, 0) < 0 and app.lager_wert('app.lager_art') is null then
    raise exception 'Abgänge bucht das Lager über Abholung, Abhaken, Umlagerung oder Inventur — mit Grund im Bewegungsprotokoll'
      using errcode = '42501';
  end if;
  alt := app.ort_sperren(p_ort, p_material);
  neu := alt + coalesce(p_delta, 0);
  if neu < 0 then
    if p_klemmen then
      neu := 0;
    else
      raise exception 'Am Lagerort „%“ liegen nur % — gebucht werden sollten %', ort.bezeichnung,
        trim_scale(alt), trim_scale(-p_delta)
        using errcode = '23514';
    end if;
  end if;
  if neu = alt then
    return neu;
  end if;
  if neu > 0 then
    perform set_config('app.ort_bestand_entsteht', p_material::text, true);
    update public.materials m set lagerartikel = m.lagerartikel where m.id = p_material and not m.lagerartikel;
    perform set_config('app.ort_bestand_entsteht', '', true);
  end if;
  perform set_config('app.lager_buchung', 'ja', true);
  update public.lagerbestaende b set menge = neu where b.lagerort_id = p_ort and b.material_id = p_material;
  perform set_config('app.lager_buchung', '', true);
  return neu;
end;
$$;

revoke all on function app.ort_anpassen(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function app.ort_anpassen(uuid, uuid, numeric, boolean) to authenticated;

/* Wie ein Ort in Bezug und Meldung heißt. Leer = Hauptlager. */
create or replace function app.ort_name(p_betrieb text, p_ort uuid) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select case when o.art = 'fahrzeug' then 'Fahrzeug ' else '' end || o.bezeichnung
       from public.lagerorte o where o.id = p_ort and o.company_id = p_betrieb),
    (select o.bezeichnung from public.lagerorte o where o.company_id = p_betrieb and o.art = 'haupt'),
    'Hauptlager')
$$;

revoke all on function app.ort_name(text, uuid) from public, anon;
grant execute on function app.ort_name(text, uuid) to authenticated;

/*
  Darf diese Person aus bzw. in diesen Fahrzeug-Ort buchen, ohne Verwaltung
  oder Leitung zu sein? Ja, wenn sie dessen Standardfahrer ist.
*/
create or replace function app.eigenes_fahrzeug(p_ort uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.lagerorte o
      join public.fahrzeuge f on f.id = o.fahrzeug_id
     where o.id = p_ort and o.art = 'fahrzeug'
       and f.standardfahrer_uid = (select auth.uid()))
$$;

revoke all on function app.eigenes_fahrzeug(uuid) from public, anon;
grant execute on function app.eigenes_fahrzeug(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fahrzeuge und Orte pflegen
-- ---------------------------------------------------------------------------

/*
  EIN FAHRZEUG ANLEGEN ODER ÄNDERN — samt seinem Fahrzeuglager.

  Wer: Verwaltung und Leitung (wer das Lager führt). Kennzeichen Pflicht,
  einmal je Betrieb; Standardfahrer optional, nur aus dem eigenen Betrieb.
  Stilllegen legt das Fahrzeuglager mit still — aber nicht, solange darin
  etwas liegt: Ware in einem stillgelegten Fahrzeug stünde in keiner Liste.
*/
create or replace function public.fahrzeug_speichern(p_fahrzeug jsonb) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  kennung uuid := nullif(p_fahrzeug ->> 'id', '')::uuid;
  zeichen text := upper(btrim(regexp_replace(coalesce(p_fahrzeug ->> 'kennzeichen', ''), '\s+', ' ', 'g')));
  bez text := nullif(btrim(coalesce(p_fahrzeug ->> 'bezeichnung', '')), '');
  fahrer uuid := nullif(p_fahrzeug ->> 'standardfahrer_uid', '')::uuid;
  an boolean := coalesce((p_fahrzeug ->> 'aktiv')::boolean, true);
  alt public.fahrzeuge;
  ort public.lagerorte;
begin
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Fahrzeuge pflegt die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  if zeichen !~ '[[:alnum:]]' then
    raise exception 'Bitte das Kennzeichen eintragen' using errcode = '23514';
  end if;
  if length(zeichen) > 20 then
    raise exception 'Ein Kennzeichen hat höchstens 20 Zeichen' using errcode = '23514';
  end if;
  if fahrer is not null and not exists (
    select 1 from public.users u where u.id = fahrer and u.company_id = betrieb
  ) then
    raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = '23503';
  end if;

  begin
    if kennung is null then
      insert into public.fahrzeuge (company_id, kennzeichen, bezeichnung, standardfahrer_uid, aktiv)
      values (betrieb, zeichen, bez, fahrer, an)
      returning id into kennung;
      insert into public.lagerorte (company_id, art, bezeichnung, fahrzeug_id, aktiv)
      values (betrieb, 'fahrzeug', zeichen, kennung, an);
      return kennung;
    end if;

    select * into alt from public.fahrzeuge f where f.id = kennung and f.company_id = betrieb for update;
    if alt.id is null then
      raise exception 'Dieses Fahrzeug gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;
    select * into ort from public.lagerorte o where o.fahrzeug_id = kennung for update;
    if alt.aktiv and not an and ort.id is not null
       and exists (select 1 from public.lagerbestaende b where b.lagerort_id = ort.id and b.menge <> 0) then
      raise exception 'Im Fahrzeug % liegt noch Material — erst zurücklagern oder dort zählen, dann stilllegen', alt.kennzeichen
        using errcode = '55000';
    end if;
    update public.fahrzeuge
       set kennzeichen = zeichen, bezeichnung = bez, standardfahrer_uid = fahrer, aktiv = an, geaendert_am = now()
     where id = kennung;
    if ort.id is null then
      insert into public.lagerorte (company_id, art, bezeichnung, fahrzeug_id, aktiv)
      values (betrieb, 'fahrzeug', zeichen, kennung, an);
    else
      update public.lagerorte set bezeichnung = zeichen, aktiv = an where id = ort.id;
    end if;
    return kennung;
  exception when unique_violation then
    raise exception 'Das Kennzeichen % ist schon angelegt', zeichen using errcode = '23505';
  end;
end;
$$;

revoke all on function public.fahrzeug_speichern(jsonb) from public, anon;
grant execute on function public.fahrzeug_speichern(jsonb) to authenticated;

/*
  EIN WEITERES LAGER ODER REGAL anlegen oder ändern; beim Hauptlager nur die
  Bezeichnung. Ein Fahrzeuglager pflegt man über sein Fahrzeug. Stilllegen
  nur ohne Bestand, aus demselben Grund wie beim Fahrzeug.
*/
create or replace function public.lagerort_speichern(p_ort jsonb) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  kennung uuid := nullif(p_ort ->> 'id', '')::uuid;
  ortart text := coalesce(nullif(p_ort ->> 'art', ''), 'lager');
  bez text := nullif(btrim(coalesce(p_ort ->> 'bezeichnung', '')), '');
  adresse text := nullif(btrim(coalesce(p_ort ->> 'anschrift', '')), '');
  an boolean := coalesce((p_ort ->> 'aktiv')::boolean, true);
  alt public.lagerorte;
begin
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Lagerorte pflegt die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  if bez is null then
    raise exception 'Bitte eine Bezeichnung eintragen' using errcode = '23514';
  end if;

  if kennung is null then
    if ortart = 'haupt' then
      -- Ein Betrieb, der noch keines hat (vor dem Anlegen eingespielt): jetzt.
      kennung := app.hauptlager_anlegen(betrieb);
      update public.lagerorte set bezeichnung = bez where id = kennung;
      return kennung;
    end if;
    if ortart <> 'lager' then
      raise exception 'Ein Fahrzeuglager entsteht mit seinem Fahrzeug' using errcode = '22023';
    end if;
    insert into public.lagerorte (company_id, art, bezeichnung, anschrift, aktiv)
    values (betrieb, 'lager', bez, adresse, an)
    returning id into kennung;
    return kennung;
  end if;

  select * into alt from public.lagerorte o where o.id = kennung and o.company_id = betrieb for update;
  if alt.id is null then
    raise exception 'Diesen Lagerort gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  if alt.art = 'fahrzeug' then
    raise exception 'Ein Fahrzeuglager pflegt man über sein Fahrzeug' using errcode = '22023';
  end if;
  if alt.art = 'haupt' then
    if not an then
      raise exception 'Das Hauptlager bleibt — es ist der Bestand des Betriebs' using errcode = '22023';
    end if;
    update public.lagerorte set bezeichnung = bez where id = kennung;
    return kennung;
  end if;
  if alt.aktiv and not an
     and exists (select 1 from public.lagerbestaende b where b.lagerort_id = kennung and b.menge <> 0) then
    raise exception 'Im Lager % liegt noch Material — erst umlagern oder dort zählen, dann stilllegen', alt.bezeichnung
      using errcode = '55000';
  end if;
  update public.lagerorte set bezeichnung = bez, anschrift = adresse, aktiv = an where id = kennung;
  return kennung;
end;
$$;

revoke all on function public.lagerort_speichern(jsonb) from public, anon;
grant execute on function public.lagerort_speichern(jsonb) to authenticated;

/*
  KENNZEICHEN AUS BUCHUNGEN — als Vorschlag, nicht als Zuordnung. Je
  Kennzeichen (verglichen wie im eindeutigen Index), das noch kein Fahrzeug
  ist: die häufigste Schreibweise, wie oft und zuletzt wann gebucht. Ohne
  Namen: wer gefahren ist, braucht die Liste nicht. Für die, die Fahrzeuge
  pflegen; die Zeitbuchungen selbst lesen Verwaltung und Projektleitung
  nicht, deshalb mit den Rechten des Eigentümers.
*/
create or replace function public.kennzeichen_aus_buchungen()
  returns table (kennzeichen text, buchungen bigint, zuletzt date)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.arbeitsbetrieb();
begin
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Fahrzeuge pflegt die Verwaltung oder die Leitung' using errcode = '42501';
  end if;
  return query
  select mode() within group (order by upper(btrim(t.vehicle_plate))),
         count(*),
         max(t.date)
    from public.time_entries t
   where t.company_id = betrieb
     and upper(regexp_replace(coalesce(t.vehicle_plate, ''), '[^[:alnum:]]', '', 'g')) <> ''
     and not exists (
       select 1 from public.fahrzeuge f
        where f.company_id = betrieb
          and upper(regexp_replace(f.kennzeichen, '[^[:alnum:]]', '', 'g'))
            = upper(regexp_replace(t.vehicle_plate, '[^[:alnum:]]', '', 'g')))
   group by upper(regexp_replace(t.vehicle_plate, '[^[:alnum:]]', '', 'g'))
   order by count(*) desc, 1
   limit 200;
end;
$$;

revoke all on function public.kennzeichen_aus_buchungen() from public, anon;
grant execute on function public.kennzeichen_aus_buchungen() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Der Schreibbefehls-Vertrag
-- ---------------------------------------------------------------------------

create table if not exists public.befehle_vorgaenge (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references public.companies (id),
  -- Die Vorgangskennung des Aufrufers: erzeugt, bevor er sendet, und bei jeder Wiederholung dieselbe.
  vorgang       uuid not null,
  befehl        text not null,
  -- sha256 der Nutzlast ohne die Vorgangskennung, als Text der jsonb-Normalform.
  nutzlast_hash text not null,
  -- Das bestätigte Ergebnis. Leer nur innerhalb der eigenen Transaktion.
  ergebnis      jsonb,
  von_uid       uuid,
  von_name      text,
  am            timestamptz not null default now(),
  constraint befehle_vorgaenge_eindeutig unique (company_id, vorgang)
);

create index if not exists befehle_vorgaenge_von on public.befehle_vorgaenge (company_id, von_uid);

comment on table public.befehle_vorgaenge is
  'Schreibbefehle mit Vorgangskennung (M04a, Bauplanung 4.3): je Betrieb und Vorgang EIN Ausgang. Gleiche Nutzlast liefert das bestehende Ergebnis, andere ist ein Konflikt. Geschrieben nur von den Befehlen.';

alter table public.befehle_vorgaenge enable row level security;
revoke all on public.befehle_vorgaenge from public, anon, authenticated;
grant select on public.befehle_vorgaenge to authenticated;

/* Lesen wie das Bewegungsprotokoll, dazu jeder seine eigenen Befehle. */
drop policy if exists befehle_vorgaenge_lesen on public.befehle_vorgaenge;
create policy befehle_vorgaenge_lesen on public.befehle_vorgaenge for select
  using ((company_id = (select app.lesebetrieb()) or company_id = (select app.supportbetrieb()))
         and (von_uid = (select auth.uid())
              or (select app.hat_rolle(array['Verwaltung', 'Buchhaltung']))
              or (select app.ist_fuehrung())));

drop trigger if exists befehle_vorgaenge_kein_support_schreiben on public.befehle_vorgaenge;
create trigger befehle_vorgaenge_kein_support_schreiben before insert or update or delete on public.befehle_vorgaenge
  for each row execute function app.support_schreibt_nicht();
drop trigger if exists befehle_vorgaenge_betrieb_fest on public.befehle_vorgaenge;
create trigger befehle_vorgaenge_betrieb_fest before update on public.befehle_vorgaenge
  for each row execute function app.betrieb_unveraenderlich();

/* Die Vorgangskennung eines Befehls — Pflicht, eine echte Kennung. */
create or replace function app.befehl_vorgang(p_befehl jsonb) returns uuid
  language plpgsql
  immutable
  set search_path = ''
as $$
begin
  if p_befehl is null or jsonb_typeof(p_befehl) <> 'object'
     or coalesce(p_befehl ->> 'vorgang', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Ein Befehl braucht eine Vorgangskennung' using errcode = '22023';
  end if;
  return (p_befehl ->> 'vorgang')::uuid;
end;
$$;

revoke all on function app.befehl_vorgang(jsonb) from public, anon, authenticated;

/*
  EINEN VORGANG BEGINNEN. Neu: er wird vermerkt, zurück kommt null, und der
  Befehl läuft. Schon da mit derselben Nutzlast: zurück kommt das bestätigte
  Ergebnis von damals, nichts läuft noch einmal. Schon da mit anderer
  Nutzlast oder anderem Befehl: Konflikt.

  Zwei gleichzeitige Aufrufe mit derselben Kennung: der zweite wartet am
  eindeutigen Schlüssel, bis der erste fertig ist — dann sieht er dessen
  Ergebnis, oder, ist der erste gescheitert, läuft er selbst.
*/
create or replace function app.befehl_beginnen(p_betrieb text, p_vorgang uuid, p_befehl text, p_nutzlast jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  hash text := encode(sha256(convert_to((p_nutzlast - 'vorgang')::text, 'UTF8')), 'hex');
  alt public.befehle_vorgaenge;
begin
  insert into public.befehle_vorgaenge (company_id, vorgang, befehl, nutzlast_hash, von_uid, von_name)
  values (p_betrieb, p_vorgang, p_befehl, hash, auth.uid(),
          (select u.name from public.users u where u.id = auth.uid()))
  on conflict (company_id, vorgang) do nothing;
  if found then
    return null;
  end if;
  select * into alt from public.befehle_vorgaenge b where b.company_id = p_betrieb and b.vorgang = p_vorgang;
  if alt.befehl is distinct from p_befehl or alt.nutzlast_hash is distinct from hash then
    raise exception 'Diese Vorgangskennung gehört schon zu einem anderen Befehl — eine Wiederholung sendet dieselben Daten, ein neuer Befehl eine neue Kennung'
      using errcode = '23505';
  end if;
  if alt.ergebnis is null then
    raise exception 'Dieser Vorgang hat kein bestätigtes Ergebnis' using errcode = '55000';
  end if;
  return alt.ergebnis;
end;
$$;

revoke all on function app.befehl_beginnen(text, uuid, text, jsonb) from public, anon, authenticated;

create or replace function app.befehl_abschliessen(p_betrieb text, p_vorgang uuid, p_ergebnis jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.befehle_vorgaenge set ergebnis = p_ergebnis
   where company_id = p_betrieb and vorgang = p_vorgang;
  return p_ergebnis;
end;
$$;

revoke all on function app.befehl_abschliessen(text, uuid, jsonb) from public, anon, authenticated;

/*
  WAS AUS EINEM VORGANG WURDE — für einen unklaren Ausgang (Netz weg,
  Antwort verloren). `erledigt` mit dem bestätigten Ergebnis, oder
  `unbekannt`: dann ist nichts geschrieben, und der Befehl darf mit derselben
  Kennung noch einmal gesendet werden. Wer: der Aufrufer selbst, und wer das
  Bewegungsprotokoll liest.
*/
create or replace function public.befehl_stand(p_vorgang uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  b public.befehle_vorgaenge;
begin
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  select * into b from public.befehle_vorgaenge x
   where x.company_id = betrieb and x.vorgang = p_vorgang
     and (x.von_uid = auth.uid() or app.hat_rolle(array['Verwaltung', 'Buchhaltung']) or app.ist_fuehrung());
  if b.id is null or b.ergebnis is null then
    return jsonb_build_object('stand', 'unbekannt', 'vorgang', p_vorgang);
  end if;
  return jsonb_build_object('stand', 'erledigt', 'vorgang', p_vorgang, 'befehl', b.befehl,
                            'am', b.am, 'ergebnis', b.ergebnis);
end;
$$;

revoke all on function public.befehl_stand(uuid) from public, anon;
grant execute on function public.befehl_stand(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Umlagern — der erste Befehl nach dem Vertrag
-- ---------------------------------------------------------------------------

/*
  UMLAGERN: eine Menge eines Artikels von einem Ort an einen anderen
  (Hauptlager → Fahrzeug, Fahrzeug → Hauptlager, Fahrzeug → Fahrzeug, und
  ebenso mit weiteren Lagern). Mengenneutral und atomar: beide Buchungen oder
  keine, und beide Bewegungen in derselben Transaktion.

  DER BEFEHL (jsonb):
    vorgang   Vorgangskennung des Aufrufers (Pflicht)
    aktion    'umlagerung'
    ziel      { artikel, von, nach } — Artikel und die beiden Orte; leer oder
              die Kennung des Hauptlagers heißt Hauptlager
    erwartet  { bestand_von } — der Bestand am Quellort, den die Ansicht sah
    menge     > 0, ganz bei Stück (wie überall)
    einheit   die Einheit, in der die Ansicht die Menge meint
    grund     frei, für das Protokoll (eine Umlagerung ist keine Korrektur;
              Korrekturen gehen über die Inventur am Ort, mit Grund)

  DIE ANTWORT, gespeichert und bei Wiederholung dieselbe:
    ausgefuehrt  mit den Beständen danach und den Revisionen der Orte
    veraltet     nichts geschrieben: der Quellort stand nicht mehr auf dem
                 erwarteten Bestand, oder die Einheit des Artikels ist eine
                 andere — die Ansicht holt neu und fragt neu
    fehlbestand  nichts geschrieben: am Quellort liegt weniger als verlangt
  Form- und Rechtefehler sind Ausnahmen; dann ist nichts vermerkt, und
  dieselbe Kennung darf neu gesendet werden.

  REIHENFOLGE (Bauplanung 4.3): Sitzung und Mandant, Rechte, Wiederholung,
  Sperren (Artikel, dann Orte nach Kennung), erwarteter Stand, Prüfung,
  Schreiben samt Bewegungen, Ergebnis.
*/
create or replace function public.umlagern(p_befehl jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  vorgang uuid;
  frueher jsonb;
  von_ort public.lagerorte;
  nach_ort public.lagerorte;
  von_id uuid;
  nach_id uuid;
  artikel public.materials;
  artikel_id uuid;
  menge numeric;
  erwartet numeric;
  einheit text;
  bestand_von numeric;
  bestand_nach numeric;
  ort uuid;
  ergebnis jsonb;
  notiz text := nullif(btrim(coalesce(p_befehl ->> 'grund', '')), '');
begin
  -- 1. Sitzung und Mandant, Form
  if betrieb is null or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)) then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  vorgang := app.befehl_vorgang(p_befehl);
  if p_befehl ->> 'aktion' is distinct from 'umlagerung' then
    raise exception 'Unbekannte Aktion — erwartet „umlagerung“' using errcode = '22023';
  end if;
  begin
    artikel_id := (p_befehl #>> '{ziel,artikel}')::uuid;
    menge := (p_befehl ->> 'menge')::numeric;
    erwartet := (p_befehl #>> '{erwartet,bestand_von}')::numeric;
    von_id := nullif(p_befehl #>> '{ziel,von}', '')::uuid;
    nach_id := nullif(p_befehl #>> '{ziel,nach}', '')::uuid;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Der Befehl ist nicht vollständig: Artikel, Orte, Menge und erwarteter Bestand' using errcode = '22023';
  end;
  if artikel_id is null or erwartet is null or menge is null then
    raise exception 'Der Befehl ist nicht vollständig: Artikel, Menge und erwarteter Bestand am Quellort' using errcode = '22023';
  end if;
  von_ort := app.ort_pruefen(betrieb, von_id, true);
  nach_ort := app.ort_pruefen(betrieb, nach_id, true);
  von_id := von_ort.id;
  nach_id := nach_ort.id;
  if von_id is not distinct from nach_id then
    raise exception 'Quelle und Ziel sind derselbe Ort' using errcode = '22023';
  end if;

  -- Rechte: Verwaltung und Leitung; der Fahrer nur aus seinem Fahrzeug ins Hauptlager, wenn der Betrieb es erlaubt.
  if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    if not coalesce(von_ort.art = 'fahrzeug' and nach_id is null
                    and app.eigenes_fahrzeug(von_id)
                    and (select c.lager_rueckgabe_fahrer from public.companies c where c.id = betrieb), false) then
      raise exception 'Umlagern darf die Verwaltung oder die Leitung — der Fahrer gibt aus seinem Fahrzeug ins Hauptlager zurück, wenn der Betrieb es erlaubt'
        using errcode = '42501';
    end if;
  end if;

  -- Wiederholung?
  frueher := app.befehl_beginnen(betrieb, vorgang, 'umlagerung', p_befehl);
  if frueher is not null then
    return frueher;
  end if;

  -- 2. Sperren: der Artikel, dann die Orte nach ihrer Kennung
  select * into artikel from public.materials m
   where m.id = artikel_id and m.company_id = betrieb
   for no key update;
  if artikel.id is null then
    raise exception 'Diesen Artikel gibt es nicht' using errcode = 'P0002';
  end if;
  for ort in select x from unnest(array[von_id, nach_id]) x where x is not null order by x loop
    perform app.ort_sperren(ort, artikel.id);
  end loop;

  -- 3. Erwarteter Stand
  bestand_von := case when von_id is null then coalesce(artikel.stock, 0)
                      else (select b.menge from public.lagerbestaende b
                             where b.lagerort_id = von_id and b.material_id = artikel.id) end;
  einheit := coalesce(nullif(btrim(artikel.unit), ''), 'Stk');
  if bestand_von is distinct from erwartet
     or lower(einheit) is distinct from lower(coalesce(nullif(btrim(p_befehl ->> 'einheit'), ''), 'Stk')) then
    return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
      'ergebnis', 'veraltet', 'vorgang', vorgang, 'artikel', artikel.id,
      'bestand_von', bestand_von, 'einheit', einheit));
  end if;

  -- 4. Prüfen
  if app.menge_fehler(menge, artikel.unit) is not null then
    raise exception '%', app.menge_fehler(menge, artikel.unit) using errcode = '23514';
  end if;
  if bestand_von < menge then
    return app.befehl_abschliessen(betrieb, vorgang, jsonb_build_object(
      'ergebnis', 'fehlbestand', 'vorgang', vorgang, 'artikel', artikel.id,
      'bestand_von', bestand_von, 'menge', menge, 'einheit', einheit));
  end if;

  -- 5./6. Schreiben, die Bewegungen schreiben die Auslöser in derselben Transaktion
  perform app.lager_kontext('umlagerung', notiz, null, null,
    'Umlagerung ' || app.ort_name(betrieb, von_id) || ' → ' || app.ort_name(betrieb, nach_id), null);
  perform app.lager_kontext_ort(nach_id, vorgang);
  if von_id is null then
    perform set_config('app.lager_buchung', 'ja', true);
    update public.materials set stock = stock - menge where id = artikel.id;
    perform set_config('app.lager_buchung', '', true);
  else
    perform app.ort_anpassen(von_id, artikel.id, -menge, false);
  end if;
  perform app.lager_kontext_ort(von_id, vorgang);
  if nach_id is null then
    perform set_config('app.lager_buchung', 'ja', true);
    update public.materials set stock = stock + menge where id = artikel.id;
    perform set_config('app.lager_buchung', '', true);
  else
    perform app.ort_anpassen(nach_id, artikel.id, menge, false);
  end if;
  perform app.lager_kontext_leeren();

  -- 7. Das bestätigte Ergebnis
  select case when von_id is null then m.stock end, case when nach_id is null then m.stock end
    into bestand_von, bestand_nach
    from public.materials m where m.id = artikel.id;
  ergebnis := jsonb_build_object(
    'ergebnis', 'ausgefuehrt',
    'vorgang', vorgang,
    'artikel', artikel.id,
    'von', von_id,
    'nach', nach_id,
    'menge', menge,
    'einheit', einheit,
    'bestand_von', coalesce(bestand_von, (select b.menge from public.lagerbestaende b
                                           where b.lagerort_id = von_id and b.material_id = artikel.id)),
    'bestand_nach', coalesce(bestand_nach, (select b.menge from public.lagerbestaende b
                                             where b.lagerort_id = nach_id and b.material_id = artikel.id)),
    'revision_von', (select b.revision from public.lagerbestaende b where b.lagerort_id = von_id and b.material_id = artikel.id),
    'revision_nach', (select b.revision from public.lagerbestaende b where b.lagerort_id = nach_id and b.material_id = artikel.id),
    'am', now());
  return app.befehl_abschliessen(betrieb, vorgang, ergebnis);
end;
$$;

revoke all on function public.umlagern(jsonb) from public, anon;
grant execute on function public.umlagern(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Datenauskunft und Löschung einer Person
-- ---------------------------------------------------------------------------

/*
  Standardfahrer: welche Fahrzeuge auf die Person lauten (Daten der Person).
  Wer umlagerte: steht als `erfasst_von` an den Bewegungen (schon gezählt
  unter „als Bearbeiter“ › Lagerbewegungen); dazu die Zahl ihrer Befehle.
  Gezielt eingefügt wie in 20261031210000_r7_anforderung_status.sql:
  wiederholbar, und ohne Einfügestelle bricht die Migration ab. Bei der
  Löschung geht der Standardfahrer sofort (er dient nur dem Vorschlag);
  Bewegungen und Befehle bleiben wie die übrigen Lagerbewegungen.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('fahrzeuge_als_standardfahrer' in quelle) = 0 then
    marke := $m$      'ruestlisten', ($m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle (Daten) fehlt'; end if;
    quelle := replace(quelle, marke, $eintrag$      -- M04a: Fahrzeuge, deren Standardfahrer die Person ist.
      'fahrzeuge_als_standardfahrer', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'kennzeichen', f.kennzeichen, 'bezeichnung', f.bezeichnung, 'aktiv', f.aktiv)
                 order by f.kennzeichen), '[]'::jsonb)
          from public.fahrzeuge f where f.company_id = betrieb and f.standardfahrer_uid = p_id),
$eintrag$ || marke);
    marke := $m$      'lagerbewegungen_erfasst', ($m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle (Bearbeiter) fehlt'; end if;
    quelle := replace(quelle, marke, $eintrag$      -- M04a: Schreibbefehle mit Vorgangskennung, etwa Umlagerungen.
      'befehle_ausgefuehrt', (select count(*) from public.befehle_vorgaenge b
        where b.company_id = betrieb and b.von_uid = p_id),
$eintrag$ || marke);
    execute quelle;
  end if;

  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('public.fahrzeuge' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenlöschung: Einfügestelle (sofort) fehlt'; end if;
    quelle := replace(quelle, marke, $eintrag$      -- M04a: als Standardfahrer eingetragen.
      'standardfahrer', (select count(*) from public.fahrzeuge f
                          where f.company_id = betrieb and f.standardfahrer_uid = p_id),
$eintrag$ || marke);
    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenlöschung: Einfügestelle (löschen) fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      update public.fahrzeuge f set standardfahrer_uid = null, geaendert_am = now()
       where f.company_id = betrieb and f.standardfahrer_uid = p_id;$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
