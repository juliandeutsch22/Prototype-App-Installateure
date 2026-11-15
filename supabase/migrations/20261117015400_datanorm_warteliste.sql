-- ===========================================================================
-- NACH DER DATANORM-ÜBERNAHME IST DIE SUCHE SOFORT SCHNELL (Durchsicht
-- 15.11.2026, Befund 2 zu L3)
-- ===========================================================================
--
-- GEMESSEN (125.000 Artikel, 50.000 neue in einem Zug): Ein GIN-Index nimmt
-- neue Einträge zuerst in eine Warteliste (`fastupdate`, Vorgabe) und sortiert
-- sie erst beim nächsten `autovacuum` ein; bis dahin liest jede Suche die
-- Liste linear mit — 13–20 ms statt 1 ms. Die Warteliste abzuschalten hieße,
-- jeden Import zu verlangsamen: 28,6–32,2 s statt 4,7–5,2 s. Aufräumen
-- kostet einmal 74 ms.
--
-- ENTSCHIEDEN: `fastupdate` bleibt, die Übernahme räumt am Ende ihres
-- letzten Blocks die Warteliste der Trigramm-Indizes der Artikel auf — dort,
-- wo sie ohnehin läuft, und nur einmal je Lauf.
--
-- MIT DEN RECHTEN DES EIGENTÜMERS: `gin_clean_pending_list` darf nur, wem der
-- Index gehört. `datanorm_uebernehmen` läuft mit den Rechten des Aufrufers;
-- der Helfer tut nichts anderes als aufräumen — er liest und liefert keine
-- Daten, und ein zusätzlicher Aufruf schadet nicht (eine leere Liste bleibt
-- leer).
-- ===========================================================================

create or replace function app.katalog_warteliste_aufraeumen() returns bigint
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  select coalesce(sum(pg_catalog.gin_clean_pending_list(i.indexrelid::regclass)), 0)::bigint
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    join pg_catalog.pg_am a on a.oid = c.relam
   where i.indrelid = 'public.materials'::regclass
     and a.amname = 'gin'
     -- Nur die Trigramm-Indizes der Suche — dieselben, die sie nutzt.
     and pg_catalog.pg_get_indexdef(i.indexrelid) like '%gin_trgm_ops%'
$$;

-- Die Übernahme ruft ihn mit den Rechten des Aufrufers (wer Kataloge einspielt).
revoke all on function app.katalog_warteliste_aufraeumen() from public, anon;
grant execute on function app.katalog_warteliste_aufraeumen() to authenticated;

/*
  DIE ÜBERNAHME RÄUMT AM ENDE IHRES LETZTEN BLOCKS AUF — gezielter Textersatz
  vor dem Rücksprung mit `fertig: true`; Zwischenblöcke bleiben, wie sie sind.
*/
do $migration$
declare
  quelle text := pg_get_functiondef('public.datanorm_uebernehmen(uuid, integer)'::regprocedure);
  alt text := E'  return ergebnis || jsonb_build_object(''fertig'', true, ''offen'', 0);\n';
begin
  if position('app.katalog_warteliste_aufraeumen()' in quelle) > 0 then
    return;
  end if;
  if position(alt in quelle) = 0 then
    raise exception 'datanorm_uebernehmen: der Rücksprung mit fertig = true fehlt';
  end if;
  execute replace(quelle, alt,
    E'  -- Befund 2 zu L3: die Warteliste der Suchindizes einsortieren, damit die Suche gleich wieder schnell ist.\n'
    || E'  perform app.katalog_warteliste_aufraeumen();\n' || alt);
end;
$migration$;
