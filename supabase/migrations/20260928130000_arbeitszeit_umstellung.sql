/*
  DIE NACHT DER ZEITUMSTELLUNG ZÄHLT RICHTIG (offene Punkte B6, Prüflauf P1-25).

  `app.arbeitsminuten` rechnete aus zwei Uhrzeiten ohne Tag. 22:00–06:00 waren
  immer acht Stunden — in der Nacht auf den letzten Sonntag im März sind es
  sieben, auf den letzten Sonntag im Oktober neun. Wer die Nacht durchgearbeitet
  hat, bekam im Herbst eine Stunde zu wenig gutgeschrieben.

  JETZT MIT DEM TAG: Beginn und Ende werden als Wiener Ortszeit gelesen, die
  Dauer ist die echte Differenz. Dieselbe Rechnung steht in der App
  (`shared/arbeitszeit.ts`, `wienVersatzMin`) — beide zählen die Stunde der
  Umstellung, die es im März nicht und im Oktober zweimal gibt, als
  Winterzeit, so wie Postgres sie liest; der Abgleich steht in
  `tests/unit/arbeitszeitUmstellung.test.ts`.

  Die Fassung ohne Tag bleibt, wie sie war (für Aufrufer, die keinen haben).
  Monatssicht und Schein-Vorbereitung rufen jetzt die mit Tag.
*/
create or replace function app.arbeitsminuten(
  p_status text, p_start time, p_end time, p_pause integer, p_hours numeric, p_datum date
) returns integer
  language sql stable
  set search_path = ''
as $$
  select case
    when p_datum is null or p_start is null or p_end is null
      then app.arbeitsminuten(p_status, p_start, p_end, p_pause, p_hours)
    when p_status <> 'Anwesend' then 0
    else greatest(0, (
      extract(epoch from (
        ((case when p_end < p_start then p_datum + 1 else p_datum end) + p_end)
          at time zone 'Europe/Vienna'
        - (p_datum + p_start) at time zone 'Europe/Vienna'
      )) / 60
    )::integer - coalesce(p_pause, 0))
  end
$$;

-- Wie die Fassung ohne Tag: ein Regelhelfer, den die Sicht mit den Rechten
-- des Fragenden ruft.
grant execute on function app.arbeitsminuten(text, time, time, integer, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Die Monatssicht — die Fassung aus 20260911160000, mit dem Tag
-- ---------------------------------------------------------------------------

create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                           t.break_duration, t.hours, t.date))   as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    -- Die Tage MIT Buchung, aufsteigend. Noetig fuer die Lueckenrechnung:
    -- „an welchen Werktagen fehlt eine Buchung?" laesst sich aus Summen nicht
    -- beantworten.
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage
    from public.time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

-- Die Sicht läuft weiter mit den Rechten des Fragenden (siehe 20260911160000).
alter view public.monthly_stats set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Die Vorbelegung des Scheins — die Fassung aus 20260926112500, mit dem Tag
-- ---------------------------------------------------------------------------

create or replace function public.schein_vorbereiten(
  p_baustelle text,
  p_datum date
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  nummer text := app.baustelle_wie_js(p_baustelle);
  zeilen jsonb;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if not (app.hat_rolle(array['Mitarbeiter']) or app.ist_fuehrung()) then
    raise exception 'Den Handwerksschein schreiben Monteur und Führung' using errcode = '42501';
  end if;
  if nummer = '' or p_datum is null then
    raise exception 'Baustelle und Datum sind nötig' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(z.zeile order by z.mitarbeiter collate "de-x-icu"), '[]'::jsonb)
    into zeilen
    from (
      select
        coalesce(t.user_name, 'Mitarbeiter') as mitarbeiter,
        jsonb_strip_nulls(jsonb_build_object(
          'datum',      to_char(t.date, 'YYYY-MM-DD'),
          'mitarbeiter', coalesce(t.user_name, 'Mitarbeiter'),
          'von',        to_char(t.start_time, 'HH24:MI'),
          'bis',        to_char(t.end_time, 'HH24:MI'),
          'pauseMin',   t.break_duration,
          'minuten',    app.arbeitsminuten(t.status, t.start_time, t.end_time,
                                           t.break_duration, t.hours, t.date),
          'taetigkeit', case when t.user_id = wer then t.comment end,
          'helfer',     t.is_helper
        )) as zeile
        from public.time_entries t
       where t.company_id = betrieb
         and t.date = p_datum
         and t.status = 'Anwesend'
         and app.baustelle_wie_js(t.project_number) = nummer
    ) z;

  return jsonb_build_object('zeiten', zeilen);
end;
$$;

revoke all on function public.schein_vorbereiten(text, date) from public;
grant execute on function public.schein_vorbereiten(text, date) to authenticated;
