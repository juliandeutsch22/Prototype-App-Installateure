-- ===========================================================================
-- EINSATZPLANUNG: FEIERTAGE ALS MENGE (Durchsicht 15.11.2026, Nacharbeit L14)
-- ===========================================================================
--
-- `einsatz_folgetage` fragte für jeden Tag des Zeitraums (bis 62 Tage)
-- `app.ist_feiertag`, das jedes Mal Ostern neu rechnet (0,45 ms je Tag).
-- Jetzt einmal die Feiertage des Zeitraums als Liste (`app.feiertage`), je Tag
-- nur der Vergleich. `einsatz_umplanen` prüft einen einzigen Tag — dort ist
-- es keine Frage der Zeit, sondern derselben Quelle: beide Funktionen lesen
-- die Feiertage jetzt aus `app.feiertage` wie die Abwesenheiten und das
-- Zeitkonto.
--
-- GEZIELTER TEXTERSATZ (beide Funktionen haben spätere Migrationen schon
-- angefasst). Fehlt eine Stelle, bricht die Migration ab; ist sie schon
-- ersetzt, geschieht nichts.
-- ===========================================================================

do $migration$
declare
  quelle text;
  stelle text;
begin
  quelle := pg_get_functiondef('public.einsatz_folgetage(date, date, text, jsonb, boolean, boolean)'::regprocedure);
  if position('app.ist_feiertag(tag)' in quelle) > 0 then
    foreach stelle in array array[
      E'  personen uuid[];\nbegin',
      E'into personen from jsonb_array_elements(p_zeilen) z;\n',
      'if app.ist_feiertag(tag) then'] loop
      if position(stelle in quelle) = 0 then
        raise exception 'einsatz_folgetage: Stelle fehlt: %', stelle;
      end if;
    end loop;
    quelle := replace(quelle, E'  personen uuid[];\nbegin',
      E'  personen uuid[];\n  -- Die Feiertage des Zeitraums, einmal gerechnet (L14).\n  feiertage date[];\nbegin');
    quelle := replace(quelle, E'into personen from jsonb_array_elements(p_zeilen) z;\n',
      E'into personen from jsonb_array_elements(p_zeilen) z;\n  feiertage := array(select f.tag from app.feiertage(p_von, p_bis) f);\n');
    quelle := replace(quelle, 'if app.ist_feiertag(tag) then', 'if tag = any(feiertage) then');
    execute quelle;
  elsif position('app.feiertage(p_von, p_bis)' in quelle) = 0 then
    raise exception 'einsatz_folgetage: weder die alte noch die neue Feiertagsprüfung gefunden';
  end if;

  quelle := pg_get_functiondef('public.einsatz_umplanen(uuid, date, uuid, boolean)'::regprocedure);
  if position('if app.ist_feiertag(p_datum) then' in quelle) > 0 then
    execute replace(quelle, 'if app.ist_feiertag(p_datum) then',
      'if exists (select 1 from app.feiertage(p_datum, p_datum)) then');
  elsif position('app.feiertage(p_datum, p_datum)' in quelle) = 0 then
    raise exception 'einsatz_umplanen: weder die alte noch die neue Feiertagsprüfung gefunden';
  end if;
end;
$migration$;
