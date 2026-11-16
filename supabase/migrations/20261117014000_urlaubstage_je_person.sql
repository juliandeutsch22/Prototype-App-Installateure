-- ===========================================================================
-- DIE URLAUBSTAGE DER MITARBEITERÜBERSICHT JE PERSON (Durchsicht 15.11.2026,
-- L5)
-- ===========================================================================
--
-- NACHGESTELLT (50 Personen, bis zu zehn Jahre): die Übersicht hielt für
-- Resturlaub und „Urlaub im Jahr“ jede Urlaubsbuchung seit dem frühesten
-- Saldo-Start der Belegschaft live — 9.795 ganze Zeilen, 8,2 MB in zwanzig
-- Seiten, mehr als zehnmal so viel wie die Buchungen des Monats selbst
-- (906 Zeilen, 769 KB). Gelesen wird davon je Zeile nur Person und Tag. Und
-- die Menge wächst mit jedem Jahr.
--
-- Jetzt: je Person EINE Zeile mit den Tagen als Liste — 50 Zeilen. Gerechnet
-- wird nichts: Resturlaub, Übertrag und Verjährung rechnet weiter die App
-- (`calcMonthStats`, `urlaubsStand`) aus genau denselben Tagen.
--
-- Gelesen wird, was `time_entries_lesen` für diese Ansicht erlaubt — wie
-- `arbeitszeit_vorlauf`: die eigenen Tage, das Büro (Buchhaltung, Spitze)
-- alle des Betriebs.
-- ===========================================================================

/*
  NUR DIE URLAUBSZEILEN — ein Teilindex: gemessen 100 ms ohne, 17 ms mit
  (119.000 Buchungen, 9.795 davon Urlaub). Angelegt ohne `concurrently`
  (`supabase db push` spielt in einer Transaktion ein): der Aufbau sperrt
  `time_entries` für Schreibende, solange er die Tabelle einmal liest — bei
  119.000 Zeilen unter einer Sekunde, beim Pilotbetrieb ein Bruchteil. Eine
  Buchung in dieser Zeit wartet, sie geht nicht verloren.
*/
create index if not exists time_entries_urlaubstage
  on public.time_entries (company_id, date, user_id) where status = 'Urlaub';

create or replace function public.urlaubstage_je_person(p_von date, p_bis date)
  returns table (user_id uuid, tage date[])
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select t.user_id, array_agg(t.date order by t.date)
    from public.time_entries t
   where t.company_id = (select app.lesebetrieb())
     and (t.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and t.status = 'Urlaub'
     and t.date between p_von and p_bis
   group by t.user_id
   order by t.user_id
$$;

revoke all on function public.urlaubstage_je_person(date, date) from public, anon;
grant execute on function public.urlaubstage_je_person(date, date) to authenticated;
