-- ===========================================================================
-- KATALOGSUCHE: DIE PRÜFUNG DES AUFRUFERS STEHT IM RUMPF (Nacharbeit L3)
-- ===========================================================================
--
-- `mandantenTrennung.test.ts` verlangt von jeder Funktion mit den Rechten
-- ihres Eigentümers, die angemeldete Konten aufrufen, dass sie den Aufrufer
-- SELBST prüft (Anmeldung, Betrieb, Rolle) — sichtbar im Rumpf. Die beiden
-- Suchfunktionen aus 20261117010000 prüften über den Helfer
-- `app.katalog_betrieb()`; dieselbe Regel steht jetzt im Rumpf (eigener
-- Betrieb, sonst der im Supportzugang — wie `materials_lesen`), der Helfer
-- entfällt. Verhalten unverändert.
-- ===========================================================================

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
  betrieb text := coalesce(app.lesebetrieb(), app.supportbetrieb());
  begriff text := btrim(coalesce(p_begriff, ''));
  muster text;
  bedingung text := 'm.company_id = $1';
  zeilen jsonb;
  gesamt bigint;
begin
  if betrieb is null then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
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

create or replace function public.katalog_nach_namen(p_muster text[]) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  betrieb text := coalesce(app.lesebetrieb(), app.supportbetrieb());
  zeilen jsonb;
begin
  if betrieb is null then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
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

drop function if exists app.katalog_betrieb();
