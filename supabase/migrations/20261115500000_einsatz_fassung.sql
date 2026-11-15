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

  perform pg_advisory_xact_lock(
    hashtextextended('einsatz_paar:' || betrieb || ':' || p_datum::text || ':' || p_baustelle, 0));

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
