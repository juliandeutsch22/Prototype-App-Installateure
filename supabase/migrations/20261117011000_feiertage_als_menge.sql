-- ===========================================================================
-- FEIERTAGE ALS MENGE IN DEN ARBEITSTAGEN EINES ZEITRAUMS (Durchsicht
-- 15.11.2026, L14)
-- ===========================================================================
--
-- NACHGESTELLT: `app.ist_feiertag` rechnet je Tag Ostern neu — 0,45 ms je
-- Tag (4.018 Tage: 1,8 s). `app.urlaubstage` und `app.urlaubstage_person`
-- fragen es für jeden Tag des Zeitraums: elf Jahre 1,2 s bzw. 1,1 s, zwei
-- Wochen 6 ms bzw. 5 ms. Über sie zählen ALLE Datenbankfunktionen, die
-- Abwesenheitstage schreiben oder zählen (Urlaub eintragen, entscheiden,
-- kürzen; Krankmeldung; Freistellung; Berufsschule über ein Schuljahr;
-- Betriebsurlaub je Person; Dezember-Halbtage für den ganzen Betrieb;
-- Arztbesuch).
--
-- DIE LÖSUNG: dieselbe Liste als Menge (`app.feiertage`, Paket 4a), einmal je
-- Aufruf gerechnet — Ostern einmal je Jahr. Der Wochentag bleibt die Regel
-- von `app.ist_arbeitstag` (leer = Montag bis Freitag). Ergebnis gleich:
-- `tests/supabase/feiertageAlsMenge.test.ts` vergleicht über vierzig Jahre
-- mit der Rechnung je Tag.
--
-- GEZIELTER TEXTERSATZ statt neuer Fassung: beide Funktionen haben spätere
-- Migrationen schon angefasst (20261116020000). Fehlt die Stelle, bricht die
-- Migration ab, statt still eine andere Fassung zu überschreiben; ist sie
-- schon ersetzt, geschieht nichts.
-- ===========================================================================

do $migration$
declare
  quelle text;
  alt text;
begin
  quelle := pg_get_functiondef('app.urlaubstage(smallint[], date, date)'::regprocedure);
  alt := 'and not app.ist_feiertag(s.t::date)';
  if position(alt in quelle) > 0 then
    execute replace(quelle, alt,
      'and s.t::date not in (select f.tag from app.feiertage(p_von, p_bis) f)');
  elsif position('app.feiertage(p_von, p_bis)' in quelle) = 0 then
    raise exception 'app.urlaubstage: die Stelle mit app.ist_feiertag fehlt';
  end if;

  quelle := pg_get_functiondef('app.urlaubstage_person(public.users, date, date)'::regprocedure);
  alt := 'and app.ist_arbeitstag(a.arbeitstage, s.t::date)';
  if position(alt in quelle) > 0 then
    execute replace(quelle, alt,
      -- Wie `app.ist_arbeitstag`: der Wochentag nach dem Abschnitt, der Feiertag aus der Menge.
      'and extract(dow from s.t)::smallint = any(
           case when coalesce(cardinality(a.arbeitstage), 0) = 0 then array[1, 2, 3, 4, 5]::smallint[]
                else a.arbeitstage end)
     and s.t::date not in (select f.tag from app.feiertage(p_von, p_bis) f)');
  elsif position('app.feiertage(p_von, p_bis)' in quelle) = 0 then
    raise exception 'app.urlaubstage_person: die Stelle mit app.ist_arbeitstag fehlt';
  end if;
end;
$migration$;

/*
  `create or replace` behält Eigentümer und Rechte. Aber `app.urlaubstage`
  läuft mit den Rechten des Aufrufers (über `public.urlaubstage` auch für
  angemeldete Konten) und fragt jetzt `app.feiertage` statt
  `app.ist_feiertag`. Dieselben Rechte wie die Funktion, die es ersetzt —
  die Liste der gesetzlichen Feiertage ist kein Geheimnis. Ohne diese Zeile
  schlüge `public.urlaubstage` für jedes Konto mit „permission denied“ fehl.
*/
grant execute on function app.feiertage(date, date) to anon, authenticated;
