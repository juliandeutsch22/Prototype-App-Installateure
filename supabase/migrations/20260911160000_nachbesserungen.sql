-- Was der strukturelle Waechter gefunden hat — und die Monatsbilanz als Sicht.

-- ---------------------------------------------------------------------------
-- 1. Die Plattformtabelle hiess wie eine Mandantentabelle
-- ---------------------------------------------------------------------------

/*
  `betriebsanlagen.company_id` war missverstaendlich: die Spalte NENNT einen
  Betrieb, aber die Zeile GEHOERT zu keinem. Genau das ist der Unterschied
  zwischen der Plattform und einem Mandanten, und eine Spalte, die in jeder
  anderen Tabelle „mein Betrieb" heisst, verwischt ihn.

  Aufgefallen ist das dem Waechter, nicht mir.
*/
alter table betriebsanlagen rename column company_id to betrieb_kennung;

-- ---------------------------------------------------------------------------
-- 2. Sieben Tabellen ohne Riegel gegen den Betriebswechsel
-- ---------------------------------------------------------------------------

/*
  Die Kindtabellen und drei weitere hatten zwar eine Aenderungsrichtlinie,
  aber keinen Trigger, der den Betrieb festhaelt. Die Richtlinie prueft beim
  Aendern nur, dass die Zeile mir gehoert — nicht, dass sie mir weiterhin
  gehoert. Ein Betrieb haette seine eigene Zeile also einem anderen
  unterschieben koennen.

  Bei den Positionstabellen waere das besonders unangenehm: eine
  Rechnungsposition in einem fremden Betrieb ist eine fremde Rechnung.
*/
create trigger quote_lines_betrieb_fest before update on quote_lines
  for each row execute function app.betrieb_unveraenderlich();
create trigger einsatz_material_positionen_betrieb_fest before update on einsatz_material_positionen
  for each row execute function app.betrieb_unveraenderlich();
create trigger work_sheet_photos_betrieb_fest before update on work_sheet_photos
  for each row execute function app.betrieb_unveraenderlich();
create trigger user_prefs_betrieb_fest before update on user_prefs
  for each row execute function app.betrieb_unveraenderlich();
create trigger work_sheet_hours_betrieb_fest before update on work_sheet_hours
  for each row execute function app.betrieb_unveraenderlich();
create trigger invoice_coverage_betrieb_fest before update on invoice_coverage
  for each row execute function app.betrieb_unveraenderlich();
create trigger work_sheet_material_betrieb_fest before update on work_sheet_material
  for each row execute function app.betrieb_unveraenderlich();

-- ---------------------------------------------------------------------------
-- 3. Die Monatsbilanz — eine Sicht statt zweier Cloud Functions
-- ---------------------------------------------------------------------------

/*
  DER ERTRAG DIESES UMZUGS, AN EINEM STUECK SICHTBAR.

  In Firestore brauchte die Monatsbilanz eine eigene Sammlung
  (`monthlyStats`), einen Trigger, der sie bei jeder Buchung nachzieht
  (`bilanzNachziehen`), einen naechtlichen Lauf, der sie neu rechnet
  (`bilanzenNachtlauf`), und eine zweite Sammlung fuer den Stand des Laufs
  (`monthlyStatsMeta`) — alles nur, weil Firestore nicht summieren kann. Die
  Bilanz war dadurch immer nur IRGENDWANN richtig.

  Hier ist sie eine Sicht. Sie ist immer richtig, weil es nichts gibt, was
  nachhinken koennte.

  Die Minutenrechnung folgt Zeile fuer Zeile calcWorkMin aus
  shared/arbeitszeit.ts — inklusive der Nacht ueber Mitternacht, die dort
  eigens behandelt wird (22:00-06:00 ergab frueher glatt null Stunden).
*/
create or replace function app.arbeitsminuten(
  p_status text, p_start time, p_end time, p_pause integer, p_hours numeric
) returns integer
  language sql immutable
  set search_path = ''
as $$
  select case
    when p_status <> 'Anwesend' then 0
    when p_start is not null and p_end is not null then
      greatest(0, (
        case
          when extract(epoch from (p_end - p_start)) < 0
            -- Endzeit vor Startzeit heisst: der Einsatz ging ueber Mitternacht
            -- (Bereitschaft, Notdienst).
            then extract(epoch from (p_end - p_start)) / 60 + 24 * 60
          else extract(epoch from (p_end - p_start)) / 60
        end
      )::integer - coalesce(p_pause, 0))
    when p_hours is not null then greatest(0, round(p_hours * 60)::integer)
    else 0
  end
$$;

create view monthly_stats as
  select
    t.company_id,
    t.user_id,
    to_char(t.date, 'YYYY-MM')                                   as monat,
    sum(app.arbeitsminuten(t.status, t.start_time, t.end_time,
                           t.break_duration, t.hours))           as anwesend_min,
    count(*) filter (where t.status = 'Krank')                   as krank_tage,
    count(*) filter (where t.status = 'Urlaub')                  as urlaub_tage,
    -- Die Tage MIT Buchung, aufsteigend. Noetig fuer die Lueckenrechnung:
    -- „an welchen Werktagen fehlt eine Buchung?" laesst sich aus Summen nicht
    -- beantworten.
    array_agg(distinct to_char(t.date, 'YYYY-MM-DD') order by to_char(t.date, 'YYYY-MM-DD'))
                                                                 as tage
    from time_entries t
   group by t.company_id, t.user_id, to_char(t.date, 'YYYY-MM');

/*
  Eine Sicht erbt den Zeilenschutz ihrer Tabellen NICHT von selbst —
  es sei denn, sie laeuft mit den Rechten des Aufrufers. Genau das stellt
  security_invoker sicher: die Sicht sieht, was der Fragende sehen darf, und
  keine Zeile mehr. Ohne diese eine Zeile waere die Monatsbilanz ein Fenster
  in alle Betriebe.
*/
alter view monthly_stats set (security_invoker = on);

grant select on monthly_stats to authenticated;
