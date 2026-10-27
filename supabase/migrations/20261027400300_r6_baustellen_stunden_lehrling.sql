/*
  „FACHZEIT“ ENTHIELT DIE LEHRLINGSSTUNDEN (Testbericht Runde 6, G18)

  WAS DER BERICHT FAND. Die Baustelle zeigte „45,0 h Fachzeit von 16 h
  Budget“ — darin steckten 16 h eines Lehrlings. Dass Lehrlingsstunden ab
  Werk ins Budget zählen (`users.stunden_ins_budget`, Stand 03.10.2026), ist
  gewollt; die Beschriftung „Fachzeit“ war es nicht, besonders wenn die
  Rechnung dieselben Stunden als „Lehrlingsstunden“ führt.

  WAS SICH ÄNDERT. `baustellen_stunden` nennt zu jeder Zeile zusätzlich, wie
  viele Minuten davon ein Lehrling gebucht hat, dessen Stunden ins Budget
  zählen (`ins_budget = true`; gesetzt wird das nur beim Lehrling). Die
  Zeilen, ihre Arten und ihre Summen bleiben Wort für Wort dieselben — wer
  die neue Spalte nicht liest (Startseite, Liste, Auswertung), rechnet wie
  bisher. Die Akte schreibt damit „45,0 h von 16 h Budget (davon 16,0 h
  Lehrling)“.

  Die Rückgabe bekommt eine Spalte; dafür wird die Funktion neu angelegt.
  Rumpf sonst wie in 20261009100000_baustellen_stunden.sql.
*/

drop function if exists public.baustellen_stunden(text[]);

create function public.baustellen_stunden(p_nummern text[])
  returns table (projekt text, user_id uuid, user_name text, art text, minuten integer, zuletzt date,
                 lehrling_minuten integer)
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
           -- Nur beim Lehrling gesetzt: wahr heißt „zählt ins Budget“.
           coalesce(t.ins_budget, false) and not coalesce(t.is_helper, false) as lehrling_im_budget,
           t.date
      from public.time_entries t
     where t.company_id = app.betrieb()
       and t.status = 'Anwesend'
       and t.project_number in (select f from formen)
  )
  select z.projekt, z.user_id, max(z.user_name), z.art,
         sum(z.minuten)::integer, max(z.date),
         coalesce(sum(z.minuten) filter (where z.lehrling_im_budget), 0)::integer
    from zeilen z
   where z.minuten > 0
   group by z.projekt, z.user_id, z.art
   -- Feste Reihenfolge: die App holt seitenweise (PostgREST deckelt bei 1000 Zeilen).
   order by z.projekt, z.user_id, z.art;
end;
$$;

revoke all on function public.baustellen_stunden(text[]) from public, anon;
grant execute on function public.baustellen_stunden(text[]) to authenticated;
