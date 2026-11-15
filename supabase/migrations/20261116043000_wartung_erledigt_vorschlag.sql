/*
  „WARTUNG ERLEDIGT“ HÄNGT NICHT MEHR AN NIEMANDEM (Durchsicht 15.11.2026, A9).

  WAS DIE DURCHSICHT FAND. Eine eingeplante Wartung (mit offener Baustelle)
  verschwand von der Startseite — sie meldet nur Wartungen OHNE Baustelle.
  Schein, Baustelle und Rechnung stießen „Erledigt“ nicht an. Tippte danach
  niemand in der Wartungsliste „Erledigt“, stand die Wartung dort weiter als
  „überfällig, eingeplant“, und der Termin fürs nächste Jahr entstand nie.

  WAS JETZT GILT. `wartung_erledigt_vorschlaege()` nennt je eingeplanter
  Wartung, ob sie erledigt aussieht, und an welchem Tag:
  - ein unterschriebener Handwerksschein auf ihrer Baustelle, jünger als die
    letzte Ausführung → „erledigt am <Tag des Scheins>?“;
  - sonst eine abgeschlossene Baustelle → „erledigt am <Ende der Baustelle>?“
    (ohne eingetragenes Ende der Tag, an dem sie abgeschlossen wurde).
  Die Startseite der Führung führt eingeplante Wartungen, bis sie erledigt
  sind, und bietet den Vorschlag als Sprung in den Dialog „Erledigt“ — mit
  dem Tag vorbelegt. Eingetragen wird weiter nur von Hand: der Vorschlag ist
  ein Anstoß, keine stille Buchung (der Tag des Scheins muss nicht der Tag
  der Wartung sein, und das Intervall wird dabei oft geändert).

  RECHTE. Wie „Erledigt“ selbst: nur die Führung (`wartungen_schreiben`).
  Für alle anderen liefert die Funktion nichts — die Startseite lädt sie für
  sie gar nicht erst. Lesend (`stable`), steht in `LESENDE_FUNKTIONEN`.

  ALTDATEN. Nichts wird geschrieben.
*/
create or replace function public.wartung_erledigt_vorschlaege()
  returns table (wartung uuid, anlage text, kunde text, baustelle text, baustelle_id uuid, am date, grund text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select w.id, w.anlage, w.customer_name, p.project_number, p.id,
         coalesce(s.am, case when p.status = 'Abgeschlossen'
                             then coalesce(p.end_date, (p.updated_at at time zone 'Europe/Vienna')::date) end),
         case when s.am is not null then 'schein' else 'abgeschlossen' end
    from public.wartungen w
    join public.projects p on p.company_id = w.company_id and p.project_number = w.offene_baustelle
    left join lateral (
      select max(ws.datum) as am
        from public.work_sheets ws
       where ws.project_id = p.id
         and ws.status = 'Unterschrieben'
         and (w.zuletzt_am is null or ws.datum > w.zuletzt_am)
    ) s on true
   where (select app.ist_fuehrung())
     and w.company_id = (select app.lesebetrieb())
     and w.aktiv
     and (s.am is not null or p.status = 'Abgeschlossen')
   order by 6, w.id
$$;

revoke all on function public.wartung_erledigt_vorschlaege() from public, anon;
grant execute on function public.wartung_erledigt_vorschlaege() to authenticated;
