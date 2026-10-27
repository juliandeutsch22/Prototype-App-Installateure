-- ---------------------------------------------------------------------------
-- ARBEIT AM BERUFSSCHULTAG (Testbericht Runde 6, M1)
--
-- Am Berufsschultag ließ sich keine Arbeit buchen: „Berufsschule gilt für
-- den ganzen Tag“. Lehrlinge kommen nach dem Unterricht aber oft noch in den
-- Betrieb. Diese Zeit fehlte im Zeitkonto, im Lohn und in der
-- Nachkalkulation, und die Prüfung „Unterricht + Weg + Arbeit“ (§ 11 Abs 7
-- KJBG) schlug nie an.
--
-- WAS JETZT GILT:
--   1. Neben einem Berufsschultag steht gearbeitete Zeit („Anwesend“). Ein
--      zweiter Schultag, Urlaub, Krankenstand, unbezahlter Urlaub, ganztägige
--      Freistellung oder ganztägiger Zeitausgleich bleiben daneben gesperrt,
--      ebenso stundenweise Freistellung (sie steht nur neben Arbeit).
--   2. `berufsschule_eintragen` legt den Schultag auch an einem Tag an, an
--      dem schon gearbeitet wurde — wer die Arbeit zuerst gebucht hat, soll
--      die Schule nachtragen können. Tage mit anderen Einträgen bleiben, wie
--      sie sind.
--   3. `monthly_stats` liefert je Schultag mit Unterrichtszeit den Unterricht
--      und die Arbeit des Tages (`schultage`). Damit rechnet die App das Ist
--      des Tages als max(Tagessoll, Unterricht + Arbeit)
--      (`shared/arbeitszeit.ts`, `schultagGutschriftMin`) — sonst zählte die
--      Arbeit, die das Tagessoll schon abdeckt, ein zweites Mal.
--
-- `app.ist_ganztags` bleibt, wie es ist: der Schultag erfüllt weiter den
-- ganzen Tag (Sonderurlaub überspringt ihn wie bisher).
--
-- Wiederholbar: `create or replace` für Funktionen und Sicht.
-- ---------------------------------------------------------------------------

create or replace function app.ganzer_tag_allein() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  anderer text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.status is not distinct from old.status
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time then
    return new;
  end if;

  if app.ist_ganztags(new.status, new.start_time, new.end_time) then
    -- Ganztägig: daneben steht an diesem Tag nichts — neben dem Schultag nur Arbeit.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
       and not (new.status = 'Berufsschule' and t.status = 'Anwesend')
     limit 1;
    if found then
      raise exception 'Für den % sind schon Einträge („%") gebucht. „%" gilt für den ganzen Tag — dafür müssen sie zuerst weg.',
        to_char(new.date, 'DD.MM.YYYY'), anderer, new.status
        using errcode = '23P01';
    end if;
  elsif new.status = 'Anwesend' then
    -- Arbeit: nicht an einem Tag, der schon ganz belegt ist — der Schultag ausgenommen.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
       and app.ist_ganztags(t.status, t.start_time, t.end_time)
       and t.status <> 'Berufsschule'
     limit 1;
    if found then
      raise exception 'Für den % ist schon „%" eingetragen. Das gilt für den ganzen Tag — daneben lässt sich keine Arbeitszeit buchen.',
        to_char(new.date, 'DD.MM.YYYY'), anderer
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

/*
  Rumpf wie in 20261024700000_kjbg_wegzeit_verteilung.sql; geändert ist nur,
  welche Tage übersprungen werden: an einem Tag, an dem nur gearbeitet
  wurde, kommt der Schultag dazu.
*/
create or replace function public.berufsschule_eintragen(
  p_user uuid,
  p_von date,
  p_bis date,
  p_notiz text default null,
  p_unterricht_min integer default null,
  p_wegzeit_min integer default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  wer uuid := auth.uid();
  person public.users;
  tage date[];
  angelegt integer := 0;
  grenze date := (now() at time zone 'Europe/Vienna')::date - 14;
begin
  if betrieb is null or wer is null or not app.angemeldet()
     or not app.betriebsmitglied(betrieb) then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null then
    raise exception 'Beginn und Ende angeben' using errcode = '22023';
  end if;
  if p_bis < p_von then
    raise exception 'Das Ende liegt vor dem Beginn' using errcode = '22023';
  end if;
  if p_unterricht_min is not null and (p_unterricht_min < 1 or p_unterricht_min > 720) then
    raise exception 'Die Unterrichtszeit liegt zwischen einer Minute und 12 Stunden' using errcode = '22023';
  end if;
  if p_wegzeit_min is not null and (p_wegzeit_min < 1 or p_wegzeit_min > 240) then
    raise exception 'Die Wegzeit liegt zwischen einer Minute und 4 Stunden' using errcode = '22023';
  end if;

  select * into person from public.users
   where id = coalesce(p_user, wer) and company_id = betrieb;
  if person.id is null then
    raise exception 'Diesen Mitarbeiter gibt es nicht' using errcode = 'P0002';
  end if;
  if person.id <> wer and not app.ist_buch_oder_spitze() then
    raise exception 'Berufsschule für jemand anderen trägt das Büro ein'
      using errcode = '42501';
  end if;
  if person.einstufung is distinct from 'lehrling' then
    raise exception 'Berufsschule gibt es nur bei Lehrlingen — die Einstufung steht in der Benutzerakte'
      using errcode = '22023';
  end if;
  if not app.ist_buch_oder_spitze() and p_von < grenze then
    raise exception 'Selbst eintragen geht bis 14 Tage zurück (ab %). Was davor liegt, trägt das Büro ein.',
      to_char(grenze, 'DD.MM.YYYY')
      using errcode = '42501';
  end if;

  tage := app.urlaubstage(person.work_days, p_von, p_bis);
  if coalesce(array_length(tage, 1), 0) = 0 then
    raise exception 'Im Zeitraum liegt kein Arbeitstag' using errcode = '55000';
  end if;
  if array_length(tage, 1) > 120 then
    raise exception 'Der Zeitraum ist zu lang' using errcode = '22023';
  end if;

  insert into public.time_entries (
    id, company_id, user_id, date, status, break_duration, user_name, comment, unterricht_min, wegzeit_min)
  select gen_random_uuid(), betrieb, person.id, t, 'Berufsschule', 0, person.name,
         coalesce(nullif(btrim(coalesce(p_notiz, '')), ''), 'Berufsschule'),
         p_unterricht_min, p_wegzeit_min
    from unnest(tage) t
   where not exists (
     select 1 from public.time_entries e
      where e.company_id = betrieb and e.user_id = person.id and e.date = t
        and e.status <> 'Anwesend');
  get diagnostics angelegt = row_count;

  return jsonb_build_object(
    'tage', array_length(tage, 1),
    'angelegt', angelegt,
    'uebersprungen', array_length(tage, 1) - angelegt);
end;
$$;

revoke all on function public.berufsschule_eintragen(uuid, date, date, text, integer, integer) from public, anon;
grant execute on function public.berufsschule_eintragen(uuid, date, date, text, integer, integer) to authenticated;

/*
  DIE MONATSBILANZ MIT DEN SCHULTAGEN. Spalten wie in
  20261019400000_skalierung.sql; neu ist `schultage` am Ende (`create or
  replace view` erlaubt nur angehängte Spalten). Je Schultag mit
  Unterrichtszeit: Tag, Unterricht und die Arbeit des Tages, in Minuten
  gerechnet wie `anwesend_min`. Die Unterabfrage läuft nur für diese Zeilen
  (FILTER) — wenige je Monat, die übrige Sicht bleibt, wie sie war.
*/
create or replace view public.monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(case
          when t.status <> 'Anwesend' then 0
          when t.start_time is null or t.end_time is null then
            case when t.hours is not null then greatest(0, round(t.hours * 60)::integer) else 0 end
          else greatest(0, (
            extract(epoch from (
              ((case when t.end_time < t.start_time then t.date + 1 else t.date end) + t.end_time)
                at time zone 'Europe/Vienna'
              - (t.date + t.start_time) at time zone 'Europe/Vienna'
            )) / 60
          )::integer - coalesce(t.break_duration, 0))
        end)                                                     as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage,
    count(*) filter (where (t.status in ('Krank', 'Urlaub', 'Berufsschule', 'Unbezahlt')
                            or (t.status in ('Dienstverhinderung', 'Pflegefreistellung') and t.start_time is null))
                       and to_char(t.date, 'MM-DD') in ('12-24', '12-31'))
                                                                 as abwesend_halbtage,
    count(*) filter (where t.status = 'Berufsschule')            as berufsschule_tage,
    count(*) filter (where t.status = 'Unbezahlt'
                        or (t.status in ('Dienstverhinderung', 'Pflegefreistellung') and t.start_time is null))
                                                                 as freistellung_tage,
    coalesce(sum(case when t.status in ('Dienstverhinderung', 'Pflegefreistellung')
                           and t.start_time is not null and t.end_time > t.start_time
                      then extract(epoch from (t.end_time - t.start_time)) / 60 end), 0)
                                                                 as freigestellt_min,
    coalesce(jsonb_agg(jsonb_build_object(
        'tag', to_char(t.date, 'YYYY-MM-DD'),
        'unterrichtMin', t.unterricht_min,
        'arbeitMin', (
          select coalesce(sum(case
                   when a.start_time is null or a.end_time is null then
                     case when a.hours is not null then greatest(0, round(a.hours * 60)::integer) else 0 end
                   else greatest(0, (
                     extract(epoch from (
                       ((case when a.end_time < a.start_time then a.date + 1 else a.date end) + a.end_time)
                         at time zone 'Europe/Vienna'
                       - (a.date + a.start_time) at time zone 'Europe/Vienna'
                     )) / 60
                   )::integer - coalesce(a.break_duration, 0))
                 end), 0)
            from public.time_entries a
           where a.company_id = t.company_id
             and a.user_id = t.user_id
             and a.date = t.date
             and a.status = 'Anwesend'))
        order by t.date)
      filter (where t.status = 'Berufsschule' and t.unterricht_min is not null), '[]'::jsonb)
                                                                 as schultage
    from public.time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

alter view public.monthly_stats set (security_invoker = on);
