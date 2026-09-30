-- TESTBERICHT 30.09.2026, G4 — EINE BAUSTELLE DARF EINEN NAMEN HABEN.
--
-- Der Titel einer Baustelle war nur der Kundenname. Eine Hausverwaltung mit
-- zwanzig Baustellen sah zwanzigmal denselben Titel. Die Bezeichnung
-- („Bad 2. OG“, „Heizungstausch“) ist freiwillig; ohne sie bleibt alles, wie
-- es war.

alter table public.projects
  add column if not exists bezeichnung text
    check (bezeichnung is null or char_length(bezeichnung) <= 120);

comment on column public.projects.bezeichnung is
  'Freiwillige Bezeichnung der Baustelle (Testbericht 30.09.2026, G4); steht im Titel vor dem Kundennamen.';
