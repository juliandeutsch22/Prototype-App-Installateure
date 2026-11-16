-- ===========================================================================
-- DIE MARKIERUNGEN IM KALENDER DER TAGESPLANUNG ALS ZÄHLUNG (Durchsicht
-- 15.11.2026, L9)
-- ===========================================================================
--
-- NACHGESTELLT (50 Personen, ein Einsatz je Person und Werktag): die
-- Tagesplanung lud für EINEN Tag den ganzen Monat aller Personen — 1.050
-- Zeilen, 405 KB, in drei Seiten —, gebraucht wurden davon die Einsätze des
-- Tages und für den Monatskalender „N Baustellen geplant“ je Tag. Jetzt lädt
-- sie die Woche des Tages (250 Zeilen, 96 KB: ein Tag weiter in derselben
-- Woche lädt nichts nach) und für den Kalender diese Zählung: 21 Zeilen,
-- 672 Bytes.
--
-- Gezählt werden BAUSTELLEN, nicht Personen — wie bisher in `marks`. Gelesen
-- wird, was `assignments_lesen` erlaubt: der eigene Betrieb oder der im
-- Supportzugang.
-- ===========================================================================

create or replace function public.einsatz_tage(p_von date, p_bis date)
  returns table (datum date, baustellen integer)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := coalesce(app.lesebetrieb(), app.supportbetrieb());
begin
  if betrieb is null then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  if p_von is null or p_bis is null or p_bis < p_von or p_bis - p_von > 62 then
    raise exception 'Höchstens zwei Monate am Stück' using errcode = '22023';
  end if;
  return query
    select a.date, count(distinct a.project_number)::integer
      from public.assignments a
     where a.company_id = betrieb and a.date between p_von and p_bis
     group by a.date
     order by a.date;
end;
$$;

revoke all on function public.einsatz_tage(date, date) from public, anon;
grant execute on function public.einsatz_tage(date, date) to authenticated;
