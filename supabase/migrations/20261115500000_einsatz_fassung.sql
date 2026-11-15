-- DURCHSICHT 15.11.2026, P1 — SPEICHERN NUR AUF DEM STAND, DEN DAS FORMULAR KANNTE.
--
-- Einsatz und Rüstliste werden je Paar aus Tag und Baustelle als Ganzes
-- ersetzt („alles weg, alles neu“). Hatte inzwischen jemand anderes genau
-- dieses Paar gespeichert, überschrieb das Formular die Änderung, ohne dass
-- der Planer sie je gesehen hat. Das Formular erkennt fremde Änderungen
-- schon an den Live-Meldungen — aber nur die, die bereits angekommen sind.
-- Was in derselben Sekunde gespeichert wird, sieht nur die Datenbank.
--
-- WIE DIE FASSUNG ERMITTELT WIRD: als INHALT des Paares, nicht als Zähler
-- oder Zeitstempel. Gründe:
--   * Es gibt keine Zeile „Paar“, an der ein Zähler hängen könnte; eine
--     Rüstliste gibt es nur, wenn Material geplant ist, und die Einsätze
--     werden bei jedem Speichern neu angelegt (neue Kennungen, neue Zeiten).
--   * Andere Wege schreiben dasselbe Paar ohne Formular: Umplanen, Folgetage,
--     Einzeln-Löschen, der Support. Ein Zähler müsste an jedem davon
--     gepflegt werden; vergäße ihn einer, liefe die Prüfung still ins Leere.
--     Der Inhalt stimmt immer, egal, wer geschrieben hat.
--   * Das Formular vergleicht die Live-Daten bereits so (Person, Helfer,
--     Aufgabe, Uhrzeit; Position, Artikel, Name, Menge, Einheit). Datenbank
--     und Formular meinen damit dasselbe mit „geändert“: ein Speichern mit
--     unverändertem Inhalt ist keine Änderung, ein Umplanen auf eine andere
--     Person schon (dabei bliebe die Kennung der Zeile gleich).
-- Beide Seiten werden HIER in dieselbe Form gebracht (Uhrzeit auf Minuten,
-- leer statt null, Menge als Zahl) — keine Prüfsumme, die Browser und
-- Datenbank gleich rechnen müssten.
--
-- VERTRÄGLICH MIT DER ALTEN APP: der neue Parameter `p_grundlage` ist
-- optional, null heißt „keine Prüfung“ wie bisher. Die alte Signatur wird
-- entfernt statt überladen: PostgREST fände für einen Aufruf mit den alten
-- drei bzw. fünf Namen sonst zwei passende Funktionen und lehnte ab.
--
-- EINSATZ_SPEICHERN UND RUESTLISTE_SPEICHERN BLEIBEN „security invoker“, wie
-- seit 20260912160000: wer planen darf, entscheidet der Zeilenschutz der
-- Tabellen (`assignments_schreiben`, `einsatz_material_*`). Mit den Rechten
-- des Eigentümers liefen sie an ihm vorbei. Neu und nach den Regeln für neue
-- Funktionen gebaut ist nur die Prüfung.

-- ---------------------------------------------------------------------------
-- 0. Die Sperre je Paar
-- ---------------------------------------------------------------------------

/*
  EINE SPERRE JE PAAR AUS TAG UND BAUSTELLE, gehalten bis zum Ende des
  Aufrufs. Jeder Weg, der Einteilung oder Rüstliste eines Paares ändert,
  nimmt sie, BEVOR er liest: dann laufen Speichern, Umplanen, Folgetage und
  Löschen desselben Paares nacheinander, und die Prüfung der Fassung sieht,
  was der vorige geschrieben hat.

  FESTE REIHENFOLGE: wer mehrere Paare braucht (Umplanen: alt und neu,
  Folgetage: jeder Tag), sperrt nach Tag aufsteigend, dann nach Baustelle.
  Alle Wege tun das — so wartet nie einer auf den anderen im Kreis.

  Die Sperre sagt nichts über Daten und gibt nichts heraus; sie steht
  deshalb auch den Funktionen offen, die mit den Rechten des Aufrufers
  laufen (`einsatz_loeschen`).
*/
create or replace function app.einsatz_paar_sperren(p_betrieb text, p_datum date, p_baustelle text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('einsatz_paar:' || p_betrieb || ':' || p_datum::text || ':' || p_baustelle, 0));
end;
$$;

revoke all on function app.einsatz_paar_sperren(text, date, text) from public, anon;
grant execute on function app.einsatz_paar_sperren(text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Die Prüfung
-- ---------------------------------------------------------------------------

/*
  `p_grundlage`: {"einteilung": [[user_id, als_helfer, aufgabe, von, bis], …],
                  "liste": [[position_id, material_id, name, menge, einheit], …]}
  Fehlt ein Teil, wird er nicht geprüft. Die Einteilung als Menge (ohne
  Reihenfolge), die Rüstliste in der Reihenfolge der Positionen — die
  Reihenfolge ist dort Inhalt (so steht sie im Bus).

  DIE SPERRE JE PAAR kommt immer, auch ohne Grundlage: zwei Speichern
  desselben Paares laufen nacheinander. Erst dadurch sieht das zweite das
  erste — beide läsen sonst denselben alten Stand, bestünden die Prüfung und
  das spätere überschriebe das frühere. Die Sperre endet mit dem Aufruf.

  ABGELEHNT wird mit eigenem Code `SL409` („Senklot, Konflikt“). Im Detail
  steht, welcher Teil abweicht und wie er JETZT aussieht, in derselben Form
  wie die Grundlage: damit kann „Meine Eingabe behalten“ bewusst auf genau
  diesem Stand speichern, auch wenn seine Live-Meldung noch unterwegs ist.
  Lesen darf diesen Stand ohnehin jeder im Betrieb (`assignments_lesen`,
  `einsatz_material_lesen`); gelesen wird nur im eigenen Arbeitsbetrieb.
*/
create or replace function app.einsatz_grundlage_pruefen(p_datum date, p_baustelle text, p_grundlage jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  erwartet jsonb;
  jetzt jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  perform app.einsatz_paar_sperren(betrieb, p_datum, p_baustelle);

  if p_grundlage is null then
    return;
  end if;

  if p_grundlage ? 'einteilung' then
    select coalesce(jsonb_agg(z order by z::text), '[]'::jsonb) into erwartet
      from (
        select jsonb_build_array(
                 lower(coalesce(e ->> 0, '')),
                 coalesce((e ->> 1)::boolean, false),
                 coalesce(e ->> 2, ''),
                 coalesce(left(nullif(e ->> 3, ''), 5), ''),
                 coalesce(left(nullif(e ->> 4, ''), 5), '')) as z
          from jsonb_array_elements(p_grundlage -> 'einteilung') e
      ) s;
    select coalesce(jsonb_agg(z order by z::text), '[]'::jsonb) into jetzt
      from (
        select jsonb_build_array(
                 a.user_id::text,
                 coalesce(a.as_helper, false),
                 coalesce(a.comment, ''),
                 coalesce(left(a.zeit_von::text, 5), ''),
                 coalesce(left(a.zeit_bis::text, 5), '')) as z
          from public.assignments a
         where a.company_id = betrieb and a.date = p_datum and a.project_number = p_baustelle
      ) s;
    if erwartet is distinct from jetzt then
      raise exception 'Die Einteilung dieser Baustelle wurde für diesen Tag inzwischen geändert.'
        using errcode = 'SL409',
              detail = jsonb_build_object('teil', 'einteilung', 'stand', jetzt)::text;
    end if;
  end if;

  if p_grundlage ? 'liste' then
    select coalesce(jsonb_agg(z order by nr), '[]'::jsonb) into erwartet
      from (
        select nr, jsonb_build_array(
                 coalesce(e ->> 0, ''),
                 lower(coalesce(e ->> 1, '')),
                 coalesce(e ->> 2, ''),
                 coalesce((e ->> 3)::numeric, 0),
                 coalesce(e ->> 4, '')) as z
          from jsonb_array_elements(p_grundlage -> 'liste') with ordinality as t(e, nr)
      ) s;
    select coalesce(jsonb_agg(z order by pos, pid), '[]'::jsonb) into jetzt
      from (
        select p.position as pos, p.id as pid, jsonb_build_array(
                 p.id,
                 coalesce(p.material_id::text, ''),
                 coalesce(p.name, ''),
                 coalesce(p.menge, 0),
                 coalesce(p.einheit, '')) as z
          from public.einsatz_material k
          join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
         where k.company_id = betrieb and k.date = p_datum and k.project_number = p_baustelle
      ) s;
    -- jsonb vergleicht Zahlen als Zahlen: 2 und 2.000 sind dieselbe Menge.
    if erwartet is distinct from jetzt then
      raise exception 'Die Rüstliste dieser Baustelle wurde für diesen Tag inzwischen geändert.'
        using errcode = 'SL409',
              detail = jsonb_build_object('teil', 'liste', 'stand', jetzt)::text;
    end if;
  end if;
end;
$$;

revoke all on function app.einsatz_grundlage_pruefen(date, text, jsonb) from public, anon;
grant execute on function app.einsatz_grundlage_pruefen(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Einsatz speichern — unverändert aus 20260930280000_einsatz_uhrzeit.sql,
--    bis auf die Prüfung vor dem Schreiben
-- ---------------------------------------------------------------------------

drop function if exists public.einsatz_speichern(date, text, jsonb);

create function public.einsatz_speichern(
  p_datum date,
  p_baustelle text,
  p_zeilen jsonb,
  p_grundlage jsonb default null
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  zeile jsonb;
  anzahl integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  -- Vor dem ersten Schreiben, und mit der Rüstliste, falls mitgeschickt:
  -- weicht ein Teil ab, ist noch nichts angefasst.
  perform app.einsatz_grundlage_pruefen(p_datum, p_baustelle, p_grundlage);

  delete from public.assignments
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  for zeile in select * from jsonb_array_elements(p_zeilen) loop
    insert into public.assignments (
      company_id, date, project_number, user_id, user_name, as_helper, comment, created_by,
      zeit_von, zeit_bis
    ) values (
      betrieb, p_datum, p_baustelle,
      (zeile ->> 'user_id')::uuid, zeile ->> 'user_name',
      coalesce((zeile ->> 'as_helper')::boolean, false),
      zeile ->> 'comment', zeile ->> 'created_by',
      nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
    );
    anzahl := anzahl + 1;
  end loop;

  update public.einsatz_material
     set uids = coalesce(
           (select array_agg((z ->> 'user_id')::uuid) from jsonb_array_elements(p_zeilen) z),
           '{}'::uuid[])
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  return anzahl;
end;
$$;

revoke all on function public.einsatz_speichern(date, text, jsonb, jsonb) from public, anon;
grant execute on function public.einsatz_speichern(date, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rüstliste speichern — im Ablauf unverändert aus
--    20261027400000_r6_ruestliste_fehlmenge.sql, bis auf die Prüfung vor dem Schreiben
-- ---------------------------------------------------------------------------

drop function if exists public.ruestliste_speichern(date, text, jsonb, uuid[], text);

create function public.ruestliste_speichern(
  p_datum date,
  p_baustelle text,
  p_positionen jsonb,
  p_uids uuid[],
  p_von text,
  p_grundlage jsonb default null
)
  returns uuid
  language plpgsql
  set search_path = ''
AS $$
declare
  betrieb text := app.arbeitsbetrieb();
  kopf uuid;
  pos jsonb;
  behalten text[];
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  -- Die Liste allein: zwischen Einsatz und Liste kann jemand anderes speichern.
  perform app.einsatz_grundlage_pruefen(
    p_datum, p_baustelle,
    case when p_grundlage ? 'liste' then jsonb_build_object('liste', p_grundlage -> 'liste') end);

  select e.id into kopf from public.einsatz_material e
   where e.company_id = betrieb and e.date = p_datum and e.project_number = p_baustelle;

  if jsonb_array_length(p_positionen) = 0 then
    if kopf is not null then delete from public.einsatz_material where id = kopf; end if;
    return null;
  end if;

  if kopf is null then
    insert into public.einsatz_material (company_id, date, project_number, uids, geladen, updated_by)
         values (betrieb, p_datum, p_baustelle, coalesce(p_uids, '{}'), '{}'::jsonb, p_von)
      returning id into kopf;
  else
    update public.einsatz_material
       set uids = coalesce(p_uids, uids), updated_by = p_von
     where id = kopf;
  end if;

  select coalesce(array_agg(p ->> 'id'), '{}')
    into behalten
    from jsonb_array_elements(p_positionen) p;

  delete from public.einsatz_material_positionen
   where einsatz_material_id = kopf and not (id = any(behalten));

  for pos in select * from jsonb_array_elements(p_positionen) loop
    insert into public.einsatz_material_positionen (
      id, company_id, einsatz_material_id, position, material_id, name, menge, einheit
    ) values (
      pos ->> 'id', betrieb, kopf,
      coalesce((pos ->> 'position')::integer, 0),
      nullif(pos ->> 'material_id', '')::uuid,
      pos ->> 'name', (pos ->> 'menge')::numeric, pos ->> 'einheit'
    )
    -- Das PAAR aus Liste und Kennung, nicht die Kennung allein. Sonst
    -- aktualisiert dieselbe Kennung aus einer anderen Liste deren Zeile und
    -- diese Liste bleibt leer.
    on conflict (einsatz_material_id, id) do update
       set position = excluded.position, material_id = excluded.material_id,
           name = excluded.name, menge = excluded.menge, einheit = excluded.einheit;

    /*
      DIE ANFORDERUNG ÜBER DIE FEHLMENGE ENTSTEHT MIT DER LISTE (Runde 6, M5):
      im selben Zug, mit der Position verknüpft. Angelegt wird mit den Rechten
      dessen, der plant — dieselbe Regel wie bisher (`material_orders_anlegen`).
    */
    if coalesce((pos -> 'anfordern' ->> 'menge')::numeric, 0) > 0 then
      insert into public.material_orders (
        id, company_id, material_id, material_name, quantity, note, project_number,
        status, transaction_type, user_id, user_name, ruestliste_id, ruest_position
      ) values (
        gen_random_uuid(), betrieb, nullif(pos ->> 'material_id', '')::uuid, pos ->> 'name',
        (pos -> 'anfordern' ->> 'menge')::numeric, nullif(pos -> 'anfordern' ->> 'note', ''), p_baustelle,
        'Offen', 'order', (pos -> 'anfordern' ->> 'user_id')::uuid, pos -> 'anfordern' ->> 'user_name',
        kopf, pos ->> 'id'
      );
    end if;
  end loop;

  update public.einsatz_material
     set geladen = (
       select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
         from jsonb_each(geladen) as g(k, v)
        where k = any(behalten))
   where id = kopf;

  return kopf;
end;
$$;

revoke all on function public.ruestliste_speichern(date, text, jsonb, uuid[], text, jsonb) from public, anon;
grant execute on function public.ruestliste_speichern(date, text, jsonb, uuid[], text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die anderen Wege, die ein Paar ändern, nehmen dieselbe Sperre
-- ---------------------------------------------------------------------------
--
-- Ermittelt über alle Funktionen, die in `assignments`,
-- `einsatz_material` oder `einsatz_material_positionen` schreiben (Stand
-- dieser Migration):
--   einsatz_speichern, ruestliste_speichern  — oben, über die Prüfung
--   einsatz_umplanen, einsatz_entfernen     — hier, alt und neu
--   einsatz_folgetage                       — hier, jeder Tag
--   einsatz_loeschen (neu)                  — für „Einsatz löschen“ der App
-- Ohne Sperre, mit Grund:
--   laden_umschalten, app.ruestliste_mannschaft — schreiben nur `geladen`
--     bzw. `uids` am Kopf. Beides gehört nicht zur Fassung; zwei Schreiber
--     desselben Kopfes ordnet ohnehin die Zeilensperre.
--   person_loeschen, baustelle_umnummern — Massenvorgänge über alle Paare
--     einer Person bzw. Baustelle (bei einer langen Baustelle Hunderte Tage).
--     Je Paar eine Sperre zu halten, kann die gemeinsame Sperrtabelle der
--     Datenbank füllen und damit fremde Vorgänge scheitern lassen.

-- Unverändert aus 20261113200000_einsatz_umplanen.sql, bis auf die Sperre.
create or replace function public.einsatz_umplanen(
  p_id uuid,
  p_datum date,
  p_user uuid,
  p_kopieren boolean default false
) returns table (id uuid, anderswo boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_umplanen();
  a public.assignments;
  b public.assignments;
  name text;
  urlaub text;
  grund text;
  tag_text text := to_char(p_datum, 'DD.MM.YYYY');
begin
  if p_id is null or p_datum is null or p_user is null then
    raise exception 'Einsatz, Tag und Person fehlen' using errcode = '22023';
  end if;
  select * into a from public.assignments x where x.id = p_id and x.company_id = betrieb;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  /*
    BEIDE PAARE SPERREN (P1), das frühere Tag zuerst — wie überall. Erst
    dann die Zeile: stand sie inzwischen woanders, hat jemand anderes sie
    bewegt, und dieses Umplanen beruht auf einem überholten Plan.
  */
  perform app.einsatz_paar_sperren(betrieb, least(a.date, p_datum), a.project_number);
  perform app.einsatz_paar_sperren(betrieb, greatest(a.date, p_datum), a.project_number);
  select * into b from public.assignments x where x.id = p_id and x.company_id = betrieb for update;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  if b.date <> a.date or b.project_number <> a.project_number then
    raise exception 'Dieser Einsatz wurde inzwischen verschoben — der Plan wird neu geladen' using errcode = '40001';
  end if;
  a := b;
  if not p_kopieren and a.date = p_datum and a.user_id = p_user then
    id := a.id;
    anderswo := false;
    return next;
    return;
  end if;

  select u.name into name from public.users u
   where u.id = p_user and u.company_id = betrieb and u.active;
  if name is null then
    raise exception 'Diese Person ist im Betrieb nicht aktiv' using errcode = '22023';
  end if;

  if app.ist_feiertag(p_datum) then
    raise exception 'Am % ist Feiertag. Wer da arbeitet, wird über „Einsatz planen“ eingeteilt', tag_text using errcode = '23514';
  end if;
  select bu.bezeichnung into urlaub from public.betriebsurlaube bu
   where bu.company_id = betrieb and p_datum between bu.von and bu.bis limit 1;
  if urlaub is not null then
    raise exception 'Am % ist Betriebsurlaub (%)', tag_text, urlaub using errcode = '23514';
  end if;
  -- Den Grund nennt der Wochenplan der Führung (Urlaub, ZA, Ausgetreten …) — er steht in der Meldung.
  select coalesce(w.grund, 'abwesend') into grund from public.wochenplan_abwesend(p_datum, p_datum) w
   where w.user_id = p_user and w.zeiten is null limit 1;
  if grund = 'Ausgetreten' then
    raise exception '% ist am % nicht mehr im Betrieb (ausgetreten)', name, tag_text using errcode = '23514';
  elsif grund is not null then
    raise exception '% ist am % abwesend (%)', name, tag_text, grund using errcode = '23514';
  end if;
  if exists (select 1 from public.assignments x
              where x.company_id = betrieb and x.date = p_datum and x.project_number = a.project_number
                and x.user_id = p_user and (p_kopieren or x.id <> a.id)) then
    raise exception '% ist am % schon auf dieser Baustelle', name, tag_text using errcode = '23505';
  end if;

  anderswo := exists (select 1 from public.assignments x
                       where x.company_id = betrieb and x.date = p_datum and x.project_number <> a.project_number
                         and x.user_id = p_user);

  if p_kopieren then
    insert into public.assignments (
      company_id, date, project_number, project_id, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis
    ) values (
      betrieb, p_datum, a.project_number, a.project_id, p_user, name, a.as_helper, a.comment,
      (select auth.uid())::text, a.zeit_von, a.zeit_bis
    ) returning assignments.id into id;
  else
    update public.assignments x
       set date = p_datum, user_id = p_user, user_name = name
     where x.id = a.id;
    id := a.id;
    perform app.ruestliste_mannschaft(betrieb, a.date, a.project_number);
  end if;
  perform app.ruestliste_mannschaft(betrieb, p_datum, a.project_number);
  return next;
end;
$$;

revoke all on function public.einsatz_umplanen(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.einsatz_umplanen(uuid, date, uuid, boolean) to authenticated;

-- Unverändert aus 20261113200000_einsatz_umplanen.sql, bis auf die Sperre.
create or replace function public.einsatz_entfernen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_umplanen();
  vorher public.assignments;
  a public.assignments;
begin
  select * into vorher from public.assignments x where x.id = p_id and x.company_id = betrieb;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  -- Erst das Paar (P1), dann die Zeile — und nur, wenn sie noch dort steht.
  perform app.einsatz_paar_sperren(betrieb, vorher.date, vorher.project_number);
  delete from public.assignments x
   where x.id = p_id and x.company_id = betrieb and x.date = vorher.date and x.project_number = vorher.project_number
  returning * into a;
  if not found then
    raise exception 'Diesen Einsatz gibt es nicht mehr — der Plan wird neu geladen' using errcode = 'P0002';
  end if;
  perform app.ruestliste_mannschaft(betrieb, a.date, a.project_number);
end;
$$;

revoke all on function public.einsatz_entfernen(uuid) from public, anon;
grant execute on function public.einsatz_entfernen(uuid) to authenticated;

/*
  „EINSATZ LÖSCHEN“ AUS DER APP (Seitenfenster, Tag planen). Bisher löschte
  die App die Zeile direkt in der Tabelle. Ein Trigger, der dabei die
  Paarsperre nimmt, ist nicht sauber zu haben: Postgres sperrt die Zeile,
  BEVOR ein Zeilen-Trigger läuft. Hielte gleichzeitig ein Speichern die
  Paarsperre und wartete auf diese Zeile, warteten beide aufeinander — die
  Datenbank bräche einen der beiden ab. Deshalb ein eigener Weg mit der
  richtigen Reihenfolge: erst das Paar, dann die Zeile.

  MIT DEN RECHTEN DES AUFRUFERS (security invoker), genau wie das direkte
  Löschen bisher: ob gelöscht werden darf, entscheidet weiter der
  Zeilenschutz (`assignments_schreiben`: Führung, auch im Einblick des
  Supports). `einsatz_entfernen` ist dafür kein Ersatz — es lässt den
  Einblick nicht zu und schreibt die Rüstliste mit.

  Wie bisher: gibt es die Zeile nicht oder darf man sie nicht löschen, ist
  das ein Fehler, kein stilles Nichts. Wurde sie zwischen Lesen und Sperren
  verschoben, wird am neuen Paar noch einmal versucht.
*/
create or replace function public.einsatz_loeschen(p_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  a record;
  versuch integer := 0;
  weg integer;
begin
  if not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  loop
    select x.company_id, x.date, x.project_number into a from public.assignments x where x.id = p_id;
    exit when not found;
    perform app.einsatz_paar_sperren(a.company_id, a.date, a.project_number);
    delete from public.assignments x
     where x.id = p_id and x.date = a.date and x.project_number = a.project_number;
    get diagnostics weg = row_count;
    if weg > 0 then
      return;
    end if;
    versuch := versuch + 1;
    exit when versuch >= 3;
  end loop;
  raise exception 'Kein Datensatz in assignments geändert — es gibt ihn nicht, oder er gehört nicht zu diesem Betrieb.'
    using errcode = 'P0002';
end;
$$;

revoke all on function public.einsatz_loeschen(uuid) from public, anon;
grant execute on function public.einsatz_loeschen(uuid) to authenticated;

-- Unverändert aus 20261112120000_einsatz_folgetage.sql, bis auf die Sperre je Tag
-- (höchstens 62 — die Grenze der Funktion selbst).
create or replace function public.einsatz_folgetage(
  p_von date,
  p_bis date,
  p_baustelle text,
  p_zeilen jsonb,
  p_nur_werktage boolean default true
) returns table (
  datum date,
  ergebnis text,
  eingeteilt text[],
  abwesend text[],
  anderswo text[]
)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  tag date;
  urlaub text;
  zeile jsonb;
  uid uuid;
  name text;
  neu integer;
  vorher integer;
  rein text[];
  weg text[];
  dort text[];
begin
  if betrieb is null or not coalesce(app.ist_fuehrung(), false) then
    raise exception 'Einsätze plant die Führung' using errcode = '42501';
  end if;
  -- Im Einblick des Supports liefert die Abwesenheit nichts (sie liest nur
  -- für Mitglieder des Betriebs). Ohne sie würde hier still jemand im
  -- Urlaub eingeteilt — also nicht.
  if betrieb is distinct from app.betrieb() then
    raise exception 'Über mehrere Tage plant im Einblick nur der Betrieb selbst' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 61 then
    raise exception 'Der Zeitraum geht über höchstens 62 Tage' using errcode = '22023';
  end if;
  if coalesce(btrim(p_baustelle), '') = '' or jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) = 0 then
    raise exception 'Baustelle und Mannschaft fehlen' using errcode = '22023';
  end if;

  -- Jeden Tag des Zeitraums sperren (P1), aufsteigend wie überall — bevor gelesen wird.
  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d order by 1 loop
    perform app.einsatz_paar_sperren(betrieb, tag, p_baustelle);
  end loop;

  for tag in select d::date from generate_series(p_von, p_bis, interval '1 day') d loop
    datum := tag;
    eingeteilt := '{}';
    abwesend := '{}';
    anderswo := '{}';

    if p_nur_werktage and extract(isodow from tag) in (6, 7) then
      ergebnis := 'wochenende';
      return next;
      continue;
    end if;
    if app.ist_feiertag(tag) then
      ergebnis := 'feiertag';
      return next;
      continue;
    end if;
    select b.bezeichnung into urlaub from public.betriebsurlaube b
     where b.company_id = betrieb and tag between b.von and b.bis limit 1;
    if urlaub is not null then
      ergebnis := 'betriebsurlaub';
      abwesend := array[urlaub];
      urlaub := null;
      return next;
      continue;
    end if;

    select count(*) into vorher from public.assignments a
     where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle;
    neu := 0;
    rein := '{}';
    weg := '{}';
    dort := '{}';
    for zeile in select * from jsonb_array_elements(p_zeilen) loop
      uid := (zeile ->> 'user_id')::uuid;
      name := coalesce(nullif(btrim(zeile ->> 'user_name'), ''), 'Mitarbeiter');
      if exists (select 1 from public.wochenplan_abwesend(tag, tag) w where w.user_id = uid and w.zeiten is null) then
        weg := weg || name;
        continue;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number <> p_baustelle and a.user_id = uid) then
        dort := dort || name;
      end if;
      if exists (select 1 from public.assignments a
                  where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle and a.user_id = uid) then
        continue;
      end if;
      insert into public.assignments (
        company_id, date, project_number, user_id, user_name, as_helper, comment, created_by, zeit_von, zeit_bis
      ) values (
        betrieb, tag, p_baustelle, uid, zeile ->> 'user_name',
        coalesce((zeile ->> 'as_helper')::boolean, false),
        zeile ->> 'comment', zeile ->> 'created_by',
        nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
      );
      neu := neu + 1;
      rein := rein || name;
    end loop;

    if neu > 0 then
      update public.einsatz_material m
         set uids = (select coalesce(array_agg(distinct a.user_id), '{}'::uuid[]) from public.assignments a
                      where a.company_id = betrieb and a.date = tag and a.project_number = p_baustelle)
       where m.company_id = betrieb and m.date = tag and m.project_number = p_baustelle;
    end if;

    eingeteilt := rein;
    abwesend := weg;
    anderswo := dort;
    ergebnis := case
      when neu > 0 and vorher > 0 then 'ergaenzt'
      when neu > 0 then 'geplant'
      when array_length(weg, 1) = jsonb_array_length(p_zeilen) then 'alle_abwesend'
      else 'unveraendert'
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.einsatz_folgetage(date, date, text, jsonb, boolean) from public, anon;
grant execute on function public.einsatz_folgetage(date, date, text, jsonb, boolean) to authenticated;
