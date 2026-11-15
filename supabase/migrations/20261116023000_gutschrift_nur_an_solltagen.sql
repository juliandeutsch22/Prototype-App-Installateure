-- ===========================================================================
-- GUTSCHRIFT NUR AN EINEM TAG MIT SOLL (Durchsicht 15.11.2026, Z12)
-- ===========================================================================
--
-- Krank, Urlaub, Berufsschule und Freistellung ersetzen das Soll eines
-- Arbeitstags. An einem freien Tag (Wochenende, Feiertag, freier Wochentag
-- der Teilzeit) gibt es kein Soll und damit nichts zu ersetzen. So rechnete
-- die Monatsauswertung der App schon („ein Krank-Tag an einem freien Tag
-- zählt nicht“, `calcMonthStats`), der Saldo schrieb das Tagessoll trotzdem
-- gut — Monats- und Gesamtsaldo widersprachen sich. Krankmeldung, Urlaub und
-- Freistellung schreiben ohnehin nur Arbeitstage (`app.urlaubstage_person`);
-- betroffen sind Tage, die von Hand, durch einen Import oder vor einem
-- Wechsel der Arbeitstage gebucht wurden.
--
-- Keine Zeile wird umgeschrieben; nur die Rechnung folgt der Regel. App:
-- `calcOverallSaldo`.
-- ===========================================================================

/*
  WIE IN 20261116021000_austritt_in_einem_zug.sql — neu ist allein, dass die
  Gutschrift nur an Tagen mit Soll entsteht (Arbeitstag des Abschnitts, kein
  Feiertag).
*/
create or replace function app.zeitkonto_rechnung(p_personen uuid[], p_von date, p_bis date)
  returns table (user_id uuid, monat date, soll_min numeric, ist_min numeric, gutschrift_min numeric,
                 pflichttage numeric, ohne_buchung integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with heute as (select (now() at time zone 'Europe/Vienna')::date as d),
  personen as (
    select u.id, u.company_id, u.app_start_date, u.austritt,
           u.arbeitszeit_verlauf, u.weekly_target_hours, u.work_days, u.tagessoll,
           coalesce(c.dezember_halbtage, true) as halbe
      from public.users u
      join public.companies c on c.id = u.company_id
     where u.id = any(p_personen) and u.app_start_date is not null
  ),
  /*
    Je Abschnitt das Tagessoll aller sieben Wochentage, einmal gerechnet
    (`std[dow + 1]`, der 7.1.2024 ist ein Sonntag) — je Tag und Buchung eine
    Funktion zu rufen, die Postgres nicht einbetten kann, kostete das
    Zwanzigfache.
  */
  abschnitte as (
    select p.id as user_id, a.ab, a.bis,
           case when coalesce(cardinality(a.arbeitstage), 0) = 0 then array[1, 2, 3, 4, 5]::smallint[]
                else a.arbeitstage end as arbeitstage,
           array(select app.tagessoll_stunden(a.wochenstunden, a.arbeitstage, a.tagessoll, date '2024-01-07' + k)
                   from generate_series(0, 6) k order by k) as std
      from personen p,
           lateral app.arbeitszeit_abschnitte(p.arbeitszeit_verlauf, p.weekly_target_hours, p.work_days, p.tagessoll) a
  ),
  buchungen as (
    select e.user_id, e.company_id, e.date, e.status, e.start_time, e.end_time, e.unterricht_min, p.halbe,
           case
             when e.status <> 'Anwesend' then 0
             when e.start_time is null or e.end_time is null then
               case when e.hours is not null then greatest(0, round(e.hours * 60)::integer) else 0 end
             else greatest(0, (
               extract(epoch from (
                 ((case when e.end_time < e.start_time then e.date + 1 else e.date end) + e.end_time)
                   at time zone 'Europe/Vienna'
                 - (e.date + e.start_time) at time zone 'Europe/Vienna'
               )) / 60
             )::integer - coalesce(e.break_duration, 0))
           end as arbeit_min
      from public.time_entries e
      join personen p on p.id = e.user_id and p.company_id = e.company_id, heute h
     where e.date >= p.app_start_date and e.date <= least(h.d, coalesce(p.austritt, h.d))
       and e.date >= p_von and e.date <= p_bis
  ),
  ist as (
    select b.user_id, date_trunc('month', b.date)::date as monat, sum(b.arbeit_min) as ist_min
      from buchungen b
     where b.status = 'Anwesend'
     group by b.user_id, date_trunc('month', b.date)
  ),
  feiertage as (
    select f.tag from heute h,
           app.feiertage((select min(p.app_start_date) from personen p), h.d) f
  ),
  /*
    Gutschrift nur für die Buchungen, die keine Arbeit sind — erst, wenn ihr
    Tag vorbei ist. Die Arbeit des Schultags holt eine Unterabfrage über den
    Index, und nur für Schultage mit Unterrichtszeit.
  */
  gutschrift as (
    select b.user_id, date_trunc('month', b.date)::date as monat,
           sum(case
                 when b.status in ('Krank', 'Urlaub', 'Berufsschule', 'Unbezahlt')
                   or (b.status in ('Dienstverhinderung', 'Pflegefreistellung')
                       and (b.start_time is null or b.end_time is null)) then
                   case
                     when b.status = 'Berufsschule' and coalesce(b.unterricht_min, 0) > 0 then (
                       select case when x.arbeit > 0
                                   then greatest(least(b.unterricht_min, s.soll), s.soll - x.arbeit)
                                   else s.soll end
                         from (
                           select coalesce(sum(case
                                    when w.start_time is null or w.end_time is null then
                                      case when w.hours is not null then greatest(0, round(w.hours * 60)::integer) else 0 end
                                    else greatest(0, (
                                      extract(epoch from (
                                        ((case when w.end_time < w.start_time then w.date + 1 else w.date end) + w.end_time)
                                          at time zone 'Europe/Vienna'
                                        - (w.date + w.start_time) at time zone 'Europe/Vienna'
                                      )) / 60
                                    )::integer - coalesce(w.break_duration, 0))
                                  end), 0) as arbeit
                             from public.time_entries w
                            where w.company_id = b.company_id and w.user_id = b.user_id
                              and w.date = b.date and w.status = 'Anwesend'
                         ) x)
                     else s.soll
                   end
                 when b.status in ('Dienstverhinderung', 'Pflegefreistellung') and b.end_time > b.start_time then
                   extract(epoch from (b.end_time - b.start_time)) / 60
                 else 0
               end) as gutschrift_min
      from buchungen b
      join abschnitte a on a.user_id = b.user_id
                       and (a.ab is null or b.date >= a.ab) and (a.bis is null or b.date < a.bis)
      cross join lateral (
        select (case when b.halbe and to_char(b.date, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end)
               * a.std[extract(dow from b.date)::integer + 1] * 60 as soll
      ) s,
      heute h
     where b.status <> 'Anwesend' and b.date < h.d
       -- Nur an einem Tag mit Soll: an einem freien Tag gibt es nichts zu ersetzen (Z12).
       and extract(dow from b.date)::smallint = any(a.arbeitstage)
       and not exists (select 1 from feiertage f where f.tag = b.date)
     group by b.user_id, date_trunc('month', b.date)
  ),
  gebucht as (
    select distinct b.user_id, b.date from buchungen b
  ),
  tage as (
    select p.id as user_id, p.halbe, g.tag::date as tag
      from personen p, heute h,
           generate_series(greatest(p.app_start_date, p_von),
                           least(h.d - 1, p_bis, coalesce(p.austritt, h.d - 1)),
                           interval '1 day') g(tag)
  ),
  soll as (
    select t.user_id, date_trunc('month', t.tag)::date as monat,
           sum((case when t.halbe and to_char(t.tag, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end)
               * a.std[extract(dow from t.tag)::integer + 1] * 60) as soll_min,
           sum(case when t.halbe and to_char(t.tag, 'MM-DD') in ('12-24', '12-31') then 0.5 else 1 end) as pflichttage,
           count(*) filter (where g.date is null)::integer as ohne_buchung
      from tage t
      join abschnitte a on a.user_id = t.user_id
                       and (a.ab is null or t.tag >= a.ab) and (a.bis is null or t.tag < a.bis)
      left join gebucht g on g.user_id = t.user_id and g.date = t.tag
      left join feiertage f on f.tag = t.tag
     where f.tag is null
       and extract(dow from t.tag)::smallint = any(a.arbeitstage)
     group by t.user_id, date_trunc('month', t.tag)
  ),
  monate as (
    select x.user_id, x.monat from soll x
    union select x.user_id, x.monat from ist x
    union select x.user_id, x.monat from gutschrift x
  )
  select m.user_id, m.monat,
         coalesce(s.soll_min, 0), coalesce(i.ist_min, 0), coalesce(g.gutschrift_min, 0),
         coalesce(s.pflichttage, 0), coalesce(s.ohne_buchung, 0)
    from monate m
    left join soll s on s.user_id = m.user_id and s.monat = m.monat
    left join ist i on i.user_id = m.user_id and i.monat = m.monat
    left join gutschrift g on g.user_id = m.user_id and g.monat = m.monat
$$;

revoke all on function app.zeitkonto_rechnung(uuid[], date, date) from public, anon, authenticated;
