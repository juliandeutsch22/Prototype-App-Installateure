-- ---------------------------------------------------------------------------
-- Arbeitszeitgrenzen: Ruhepausen und der Durchschnitt von 48 Std. (10.10.2026)
--
-- Die App prüft seit heute auch die Ruhepause (§ 11 AZG, § 15 KJBG) und den
-- Schnitt von 48 Std. über 17 Wochen (§ 9 Abs 4 AZG). Auch diese Fälle
-- begründet das Büro — die Begründung muss also ihre Art annehmen. Sonst
-- änderte sich nichts: dieselbe Tabelle, dieselben Regeln.
-- ---------------------------------------------------------------------------

alter table public.arbeitszeit_begruendungen
  drop constraint if exists arbeitszeit_begruendungen_art;

alter table public.arbeitszeit_begruendungen
  add constraint arbeitszeit_begruendungen_art check (
    art in ('tag', 'woche', 'ruhezeit', 'wochenruhe', 'nacht', 'wochenfrei', 'pause', 'durchschnitt')
  );
