-- ===========================================================================
-- KATALOGSUCHE MIT INDEX (Durchsicht 15.11.2026, L3)
-- ===========================================================================
--
-- NACHGESTELLT (120.000 Artikel eines Betriebs, angemeldet wie die App, also
-- mit Zeilenschutz):
--
--   Suche, seltener Begriff, Seite zu 50        285 ms  + Zählung 253 ms
--   Suche, häufiger Begriff (17.000 Treffer)    250 ms  + Zählung 227 ms
--   Katalogseite ohne Suche, 50 nach Name        28 ms  + Zählung  10 ms
--   Lagerartikel (2.000 von 120.000)             10 ms
--   `katalogNachNamen`, 20 Namen               2.100 ms
--
-- ZWEI URSACHEN, nicht eine:
--
--   1. Die Abfrage sucht `name`, `article_number` und `category` je für sich;
--      der Trigramm-Index `materials_suche` liegt auf dem Ausdruck
--      `name || ' ' || article_number`. Den kann sie nicht nutzen. (Er bleibt:
--      `offene_lieferantenartikel` sucht ähnliche Bezeichnungen genau über
--      diesen Ausdruck.)
--   2. Selbst ein Index je Spalte hilft über PostgREST NICHT. Mit Zeilenschutz
--      darf Postgres eine Bedingung nur dann über einen Index auswerten, wenn
--      ihr Operator „leakproof“ ist — `ilike` (`texticlike`) ist es nicht. Die
--      Suche läuft dann als Durchlauf über alle Zeilen, egal welche Indizes
--      es gibt (gemessen: mit Index je Spalte unverändert 233 ms + 210 ms).
--
-- DESHALB: Index je durchsuchter Spalte UND die Suche als Datenbankfunktion
-- (`katalog_suchen`, `katalog_nach_namen`). Die Funktion prüft den Betrieb
-- selbst — dieselbe Regel wie `materials_lesen` (eigener Betrieb oder der im
-- Supportzugang) — und darf dann den Index nehmen. Gemessen danach: seltener
-- Begriff 0,8 ms, häufiger 12 ms + 18 ms Zählung (17.000 Treffer zu zählen
-- ist die Arbeit selbst), ohne Suche 1,3 ms, 20 Namen wenige ms.
--
-- DIE ZÄHLUNG NUR, WO SIE GEZEIGT WIRD (`p_zaehlen`): „und N weitere“ auf
-- „Material anfordern“ und im Katalog. Die Suchfelder (Suchfenster, Angebot,
-- Rückgabe, Einkauf) zählen nicht.
--
-- SPERREN BEIM ANLEGEN. `create index` ohne `concurrently` — `supabase db
-- push` spielt jede Migration in einer Transaktion ein, und `concurrently`
-- geht dort nicht. Der Aufbau sperrt `materials` für SCHREIBEN (Lesen läuft
-- weiter): gemessen 1,5 s für alle fünf bei 120.000 Artikeln, beim
-- Pilotbetrieb (wenige tausend) Bruchteile davon. Ein DATANORM-Import, der
-- genau dann läuft, wartet so lange; Anfordern und Suchen nicht.
-- ===========================================================================

create extension if not exists pg_trgm;

/*
  JE GESUCHTER SPALTE EIN TRIGRAMM-INDEX — dieselben drei wie in
  `oderUeberSpalten(['name', 'article_number', 'category'], …)`. Wächst die
  Liste dort, gehört sie hierher (wie in 20260914220000_suche.sql).
*/
create index if not exists materials_suche_name
  on public.materials using gin (name gin_trgm_ops);
create index if not exists materials_suche_artikelnummer
  on public.materials using gin (article_number gin_trgm_ops);
create index if not exists materials_suche_kategorie
  on public.materials using gin (category gin_trgm_ops);

/*
  DIE KATALOGSEITE NACH NAMEN: der Anfang des Katalogs (ohne Suche) und der
  Anfang eines häufigen Begriffs kommen in der Reihenfolge des Index, ohne
  120.000 Zeilen zu sortieren. Die Kennung als zweiter Schlüssel, wie in
  `katalogSeite`.
*/
create index if not exists materials_nach_name
  on public.materials (company_id, name, id);

/*
  DIE LAGERARTIKEL — ein Teilindex: es sind wenige, und die Lagerliste fragt
  live genau nach ihnen (`subscribeLagerartikel`). `lagerartikel = true` ist
  ein „leakproof“-Vergleich, der Index wirkt also auch über PostgREST.
*/
create index if not exists materials_lagerartikel
  on public.materials (company_id) where lagerartikel;

/* Der Betrieb, dessen Katalog gelesen wird — dieselbe Regel wie `materials_lesen`. */
create or replace function app.katalog_betrieb() returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.lesebetrieb();
begin
  if betrieb is null then
    betrieb := app.supportbetrieb();
  end if;
  if betrieb is null then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  return betrieb;
end;
$$;

revoke all on function app.katalog_betrieb() from public, anon, authenticated;

/*
  DIE KATALOGSUCHE — eine Zeile je Artikel (wie `select *`), nach Name und
  Kennung, höchstens `p_anzahl` (bis 1.000, die Obergrenze des Servers für
  eine Liste). Gesucht wird wie bisher: `%begriff%` ohne Rücksicht auf Groß-
  und Kleinschreibung in Name, Artikelnummer und (abschaltbar) Kategorie,
  dazu die Kennungen aus der Nummernsuche (`p_ids`, M03a). Leerer Begriff =
  alles.

  `p_filter`: 'alle'; 'anforderbar' = nicht ausgelaufen ODER noch im Lager
  (Material anfordern); 'aktiv' = nicht ausgelaufen (Einkaufsliste).

  ÜBER `execute … using`: so plant Postgres jede Suche mit ihrem Muster —
  ein einmal gespeicherter allgemeiner Plan wüsste nicht, ob der Begriff
  selten oder häufig ist, und könnte beim Durchlauf bleiben.
*/
create or replace function public.katalog_suchen(
  p_begriff text,
  p_anzahl integer,
  p_ids uuid[] default '{}',
  p_filter text default 'alle',
  p_kategorie boolean default true,
  p_zaehlen boolean default false
) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.katalog_betrieb();
  begriff text := btrim(coalesce(p_begriff, ''));
  muster text;
  bedingung text := 'm.company_id = $1';
  zeilen jsonb;
  gesamt bigint;
begin
  if p_anzahl is null or p_anzahl < 1 then
    raise exception 'Mindestens ein Treffer' using errcode = '22023';
  end if;
  if p_filter is null or p_filter not in ('alle', 'anforderbar', 'aktiv') then
    raise exception 'Unbekannter Filter: %', p_filter using errcode = '22023';
  end if;
  if p_filter = 'anforderbar' then
    bedingung := bedingung || ' and (not m.ausgelaufen or m.stock > 0)';
  elsif p_filter = 'aktiv' then
    bedingung := bedingung || ' and not m.ausgelaufen';
  end if;
  if begriff <> '' then
    -- Wie `ilikeMuster`: erst der Rückstrich, dann die Joker.
    muster := '%' || replace(replace(replace(begriff, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    bedingung := bedingung || ' and (m.name ilike $2 or m.article_number ilike $2'
      || case when coalesce(p_kategorie, true) then ' or m.category ilike $2' else '' end
      || ' or m.id = any($3))';
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.name, t.id), ''[]''::jsonb)
       from (select m.* from public.materials m where %s order by m.name, m.id limit $4) t', bedingung)
    into zeilen
    using betrieb, muster, coalesce(p_ids, '{}'::uuid[]), least(p_anzahl, 1000);

  if coalesce(p_zaehlen, false) then
    execute format('select count(*) from public.materials m where %s', bedingung)
      into gesamt
      using betrieb, muster, coalesce(p_ids, '{}'::uuid[]);
  end if;

  return jsonb_build_object('zeilen', zeilen, 'gesamt', gesamt);
end;
$$;

revoke all on function public.katalog_suchen(text, integer, uuid[], text, boolean, boolean) from public, anon;
grant execute on function public.katalog_suchen(text, integer, uuid[], text, boolean, boolean) to authenticated;

/*
  DIE ARTIKEL ZU GENANNTEN NAMEN (`katalogNachNamen`: Preise auf Rechnung und
  in der Nachkalkulation). `p_muster` sind fertige `ilike`-Muster aus der
  App (Joker entschärft, Leerräume als `%`). Je Muster eine Abfrage über den
  Index — ein `ilike any(…)` könnte ihn nicht nutzen.
*/
create or replace function public.katalog_nach_namen(p_muster text[]) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.katalog_betrieb();
  zeilen jsonb;
begin
  if coalesce(cardinality(p_muster), 0) > 200 then
    raise exception 'Höchstens 200 Namen je Anfrage' using errcode = '22023';
  end if;
  execute
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb)
       from (select distinct on (m.id) m.*
               from unnest($2) mu(muster)
               cross join lateral (
                 select x.* from public.materials x where x.company_id = $1 and x.name ilike mu.muster) m
              order by m.id) t'
    into zeilen
    using betrieb, coalesce(p_muster, '{}'::text[]);
  return zeilen;
end;
$$;

revoke all on function public.katalog_nach_namen(text[]) from public, anon;
grant execute on function public.katalog_nach_namen(text[]) to authenticated;
