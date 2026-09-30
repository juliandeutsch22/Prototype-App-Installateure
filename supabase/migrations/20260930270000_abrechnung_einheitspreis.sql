-- TESTBERICHT 30.09.2026, M16 — ABRECHNUNGSART BEIM ANNEHMEN WÄHLEN.
--
-- Ein angenommenes Angebot wurde immer eine Pauschalbaustelle. Jetzt wählt
-- man beim Annehmen: Pauschal (Vorgabe, wie bisher), Regie oder Einheitspreis
-- nach Aufmaß. Dafür kennen Baustelle und Handwerksschein den dritten Wert.
--
-- Bestehende Zeilen ändern sich nicht; die Prüfung wird nur weiter. Die
-- Prüfsumme der Scheine liest den Text der Abrechnung unverändert.

do $$
declare
  name text;
begin
  -- Die alten Prüfungen heissen, wie Postgres sie benannt hat; gesucht wird
  -- nach ihrem Inhalt, nicht nach einem geratenen Namen.
  for name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.projects'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%billing_mode%'
  loop
    execute format('alter table public.projects drop constraint %I', name);
  end loop;
  for name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.work_sheets'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%abrechnung%'
  loop
    execute format('alter table public.work_sheets drop constraint %I', name);
  end loop;
end;
$$;

alter table public.projects
  add constraint projects_billing_mode_check
    check (billing_mode in ('Regie', 'Pauschal', 'Einheitspreis'));

alter table public.work_sheets
  add constraint work_sheets_abrechnung_check
    check (abrechnung in ('Regie', 'Pauschal', 'Einheitspreis'));
