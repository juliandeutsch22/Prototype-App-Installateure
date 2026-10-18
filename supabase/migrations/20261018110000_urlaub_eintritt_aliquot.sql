-- ---------------------------------------------------------------------------
-- Urlaub im Eintrittsjahr: taggenau oder je begonnenem Monat ein Zwölftel
-- (18.10.2026)
--
-- Wer mitten im Urlaubsjahr eintritt, bekommt für das angebrochene Jahr einen
-- aliquoten Anspruch vorgeschlagen. Die App rechnete nur taggenau. Stellt eine
-- Vereinbarung das Urlaubsjahr auf das Kalenderjahr um, lässt § 2 Abs 4 Z 1
-- UrlG ihr „je begonnenem Monat ein Zwölftel“ — taggenau sieht das Gesetz
-- nicht vor (`docs/recherche-fragenkataloge.md`). Was gilt, steht in der
-- Vereinbarung des Betriebs: eine Wahl je Betrieb. Gerechnet wird in der App
-- (`aliquoterAnspruch`); der Wert bleibt ein änderbarer Vorschlag.
--
-- AB WERK `taggenau`, wie bisher: für bestehende Betriebe ändert sich nichts.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists urlaub_eintritt_aliquot text not null default 'taggenau';

alter table public.companies drop constraint if exists companies_urlaub_eintritt_aliquot;
alter table public.companies add constraint companies_urlaub_eintritt_aliquot
  check (urlaub_eintritt_aliquot in ('taggenau', 'zwoelftel'));

comment on column public.companies.urlaub_eintritt_aliquot is
  'Vorschlag für das angebrochene erste Urlaubsjahr: taggenau (Vorgabe) oder zwoelftel (je begonnenem Monat, § 2 Abs 4 Z 1 UrlG).';
