/*
  DIE STARTSEITE FRAGT NACH DER ANTWORT, NICHT NACH DEN ROHDATEN
  (Ladezeit, 19.10.2026).

  Zwei Fragen der Startseite holten bisher alles, um im Browser das Wenige
  herauszusuchen, das sie zeigen:

  „knapp“: alle Lagerartikel (800 im Testbestand, zwei Seiten), danach ihr
  Freies (`lager_frei`, zwei Portionen) — vier Wege durchs Netz hintereinander,
  um eine Handvoll Artikel zu zeigen. `lager_knapp` rechnet dasselbe in der
  Datenbank und gibt nur die knappen zurück. Die Regel ist die der Lagerliste
  (`istKnapp`): unter der Mindestmenge; ohne Mindestmenge, wenn höchstens
  `p_grenze` frei sind. Das Freie kommt aus `lager_frei`, Wort für Wort
  dieselbe Rechnung.

  „Tage ohne Buchung“: jede Buchung der letzten fünf Wochen, auch wenn nur
  zählt, AN WELCHEM TAG jemand gebucht hat (2.040 Zeilen im Testbestand,
  fünf Seiten). `buchungstage` gibt jeden Tag je Person einmal. Gelesen wird
  genau, was `time_entries_lesen` erlaubt: die eigenen Tage, mit
  Buchhaltung oder Spitze die aller.
*/

create or replace function public.lager_knapp(p_grenze numeric)
  returns table (id uuid, name text, unit text, mindestmenge numeric, frei numeric)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with artikel as (
    select m.id, m.name, m.unit, m.mindestmenge
      from public.materials m
     where m.company_id = (select app.betrieb())
       and (select app.darf(app.betrieb()))
       and m.lagerartikel
  )
  select a.id, a.name, a.unit, a.mindestmenge, f.frei
    from artikel a
    join public.lager_frei((select coalesce(array_agg(x.id), '{}'::uuid[]) from artikel x)) f
      on f.material_id = a.id
   where case when a.mindestmenge is not null then f.frei < a.mindestmenge
              else f.frei <= p_grenze end
   order by a.name, a.id
$$;

revoke all on function public.lager_knapp(numeric) from public, anon;
grant execute on function public.lager_knapp(numeric) to authenticated;

create or replace function public.buchungstage(p_von date, p_bis date)
  returns table (user_id uuid, date date)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select distinct t.user_id, t.date
    from public.time_entries t
   where t.company_id = (select app.lesebetrieb())
     and (t.user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze()))
     and t.date between p_von and p_bis
   order by t.user_id, t.date
$$;

revoke all on function public.buchungstage(date, date) from public, anon;
grant execute on function public.buchungstage(date, date) to authenticated;

/*
  „Baustellen ohne Einsatz“ holte jeden Einsatz der letzten 90 und der
  nächsten 14 Tage (1.500 Zeilen im Testbestand, drei Seiten; mit der
  Belegschaft mehr — und ab 3.000 still abgeschnitten). Gebraucht wird je
  Baustelle der letzte Einsatz davor und der nächste ab heute.
  `baustellen_einsatzlage` gibt genau das. Gelesen wird, was
  `assignments_lesen` erlaubt, im genannten Betrieb — wie die Abfrage davor.
*/
create or replace function public.baustellen_einsatzlage(p_company text, p_von date, p_heute date, p_bis date)
  returns table (project_number text, zuletzt date, naechster date)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select a.project_number,
         max(a.date) filter (where a.date < p_heute),
         min(a.date) filter (where a.date >= p_heute)
    from public.assignments a
   where a.company_id = p_company
     and (a.company_id = (select app.lesebetrieb()) or a.company_id = (select app.supportbetrieb()))
     and a.date between p_von and p_bis
   group by a.project_number
   order by a.project_number
$$;

revoke all on function public.baustellen_einsatzlage(text, date, date, date) from public, anon;
grant execute on function public.baustellen_einsatzlage(text, date, date, date) to authenticated;
