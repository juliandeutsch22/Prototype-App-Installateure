/*
  DURCHSICHT 15.11.2026, P8 — „BAUSTELLEN OHNE EINSATZ“: ZÄHLER UND LISTE AUS
  EINER QUELLE.

  WAS DIE DURCHSICHT FAND (`analyse/3-planung-scheine.md`, M8). Die
  Startseite zählte über `baustellen_einsatzlage` (eine Zeile je Baustelle),
  die Liste dahinter (`/admin-projects?filter=ohne-einsatz`) holte jeden
  Einsatz der 104 Tage über `listAssignmentsInRange` — mit Grenze 3.000,
  aufsteigend nach Datum. Ab rund 3.000 Einsatzzeilen schnitt sie hinten ab,
  also genau die KOMMENDEN Einsätze, und zeigte fast alle aktiven Baustellen
  als „ohne Einsatz“, während die Startseite fünf zählte. Dazu rechneten
  beide nur über die Baustellen, die sie gerade geladen hatten.

  WAS JETZT GILT. Eine Funktion entscheidet in der Datenbank über ALLE
  aktiven Baustellen des Betriebs, mit der Regel aus `ohneEinsatzListe`
  (`src/features/projects/baustellenLage.ts`):
    - Zustand „Aktiv“,
    - kein Einsatz von heute bis heute + 14 Tage,
    - Beginn nicht erst nach diesem Fenster, Ende nicht schon vorbei;
    - `zuletzt`: der letzte Einsatz in den 90 Tagen davor (Anzeige).
  Startseite und Liste fragen beide sie. Die Nummer wird verglichen wie in
  der App bisher: genau, ohne Umschreiben.

  WER: wie `baustellen_einsatzlage` — der Betrieb, den man liest, und der
  Support im Einblick. Lesen dürfen Einsätze und Baustellen ohnehin alle im
  Betrieb; die Funktion gibt nur Nummer und Tag.
*/

create or replace function public.baustellen_ohne_einsatz(p_heute date)
  returns table (project_number text, zuletzt date)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.project_number,
         (select max(a.date) from public.assignments a
           where a.company_id = p.company_id and a.project_number = p.project_number
             and a.date < p_heute and a.date >= p_heute - 90) as zuletzt
    from public.projects p
   where p.company_id = coalesce((select app.lesebetrieb()), (select app.supportbetrieb()))
     and p.status = 'Aktiv'
     and not exists (select 1 from public.assignments a
                      where a.company_id = p.company_id and a.project_number = p.project_number
                        and a.date between p_heute and p_heute + 14)
     and not (p.start_date is not null and p.start_date > p_heute + 14)
     and not (p.end_date is not null and p.end_date < p_heute)
   order by p.project_number
$$;

revoke all on function public.baustellen_ohne_einsatz(date) from public, anon;
grant execute on function public.baustellen_ohne_einsatz(date) to authenticated;
