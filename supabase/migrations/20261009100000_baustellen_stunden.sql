/*
  DIE STUNDEN EINER BAUSTELLE FÜR DIE LEITUNG (Testbericht Runde 5, M1)

  WAS DER BERICHT FAND. Als Projektleiter stand auf der Startseite „Aktive
  Baustellen 11 · alle im Budget“, als Administrator zur selben Zeit „3 über
  Budget, 1 ab 90 %“. Gerechnet wurde in der App aus den Zeitbuchungen der
  Baustelle — und von denen liest die Projektleitung nur die eigenen
  (`time_entries_lesen`: eigene Zeilen oder Buchhaltung/Spitze). Der
  Projektleiter sah also nur seine eigenen Stunden als Verbrauch: auf der
  Startseite, im Filter „über oder nahe Budget“ der Baustellenliste und im
  Überblick der Baustellenakte. Eine falsche Entwarnung.

  WARUM NICHT DIE LESEREGEL ÖFFNEN. Die Projektleitung sieht Zeitkonten
  bewusst nicht (`navigation.ts`, „Zeitkonten: bewusst OHNE
  Projektleitung“): Überstunden, Krankenstände und Urlaub eines Monteurs
  gehen sie nichts an, Krankenstände sind Gesundheitsdaten. Eine geöffnete
  Leseregel gäbe ihr jede Buchung mit Status und Kommentar.

  WAS DIESE FUNKTION GIBT. Je Baustelle, Person und Art (Fach, Helfer,
  Lehrling außerhalb des Budgets) nur die Summe der Arbeitsminuten und den
  letzten Tag mit Arbeitszeit — genau das, was Budget und Akte zeigen.
  Nur „Anwesend“ zählt, wie in `groupProjectHours`; Minuten mit derselben
  Rechnung wie Zeitkonto und Monatssicht (`app.arbeitsminuten` mit Tag).

  WER. Wer im Betrieb Mitglied ist und führt (Projektleitung,
  Geschäftsführung, Administration) oder abrechnet (Buchhaltung) — dieselben
  Rollen, die die Baustellen und ihre Akte sehen bzw. alle Buchungen ohnehin
  lesen. Allen anderen antwortet sie mit einem Fehler statt mit einer leeren
  Liste: leer hiesse „nichts gebucht“, und das wäre wieder eine Entwarnung.

  DIE NUMMERN. Eine Buchung auf „PR-2026-050“ zählt zur Baustelle
  „2026-050“ — wie `listEntriesForProjects`: gesucht wird nach der Nummer,
  wie sie ist, ohne und mit „PR-“; gruppiert nach der Nummer ohne „PR-“
  (`normProjectNumber`).
*/
create or replace function public.baustellen_stunden(p_nummern text[])
  returns table (projekt text, user_id uuid, user_name text, art text, minuten integer, zuletzt date)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (app.betriebsmitglied(app.betrieb())
          and (app.ist_fuehrung() or app.ist_buch_oder_spitze())) then
    raise exception 'Die Stunden der Baustellen sieht nur die Leitung' using errcode = '42501';
  end if;

  return query
  with nummern as (
    select trim(n) as roh, regexp_replace(trim(n), '^PR-', '', 'i') as blank
      from unnest(coalesce(p_nummern, '{}'::text[])) as n
     where n is not null
  ),
  formen as (
    select f
      from nummern,
           lateral (values (roh), (blank), ('PR-' || blank)) as v(f)
     where blank <> ''
  ),
  zeilen as (
    select regexp_replace(trim(t.project_number), '^PR-', '', 'i') as projekt,
           t.user_id,
           t.user_name,
           case when t.is_helper then 'helfer'
                when t.ins_budget = false then 'lehrling'
                else 'fach' end as art,
           app.arbeitsminuten(t.status, t.start_time, t.end_time,
                              t.break_duration, t.hours, t.date) as minuten,
           t.date
      from public.time_entries t
     where t.company_id = app.betrieb()
       and t.status = 'Anwesend'
       and t.project_number in (select f from formen)
  )
  select z.projekt, z.user_id, max(z.user_name), z.art,
         sum(z.minuten)::integer, max(z.date)
    from zeilen z
   where z.minuten > 0
   group by z.projekt, z.user_id, z.art;
end;
$$;

revoke all on function public.baustellen_stunden(text[]) from public, anon;
grant execute on function public.baustellen_stunden(text[]) to authenticated;
