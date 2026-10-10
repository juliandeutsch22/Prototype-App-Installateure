-- ---------------------------------------------------------------------------
-- Durchrechnungszeitraum je Betrieb (10.10.2026)
--
-- Der Schnitt von 48 Std. je Woche gilt nach § 9 Abs 4 AZG über 17 Wochen;
-- ein Kollektivvertrag kann den Zeitraum auf bis zu 52 Wochen verlängern.
-- Welcher gilt, weiss nur der Betrieb — also eine Einstellung je Betrieb,
-- ab Werk das Gesetz. Gerechnet wird in der App (`arbeitszeitGrenzen.ts`).
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists durchrechnung_wochen integer not null default 17;

alter table public.companies drop constraint if exists companies_durchrechnung_wochen;
alter table public.companies add constraint companies_durchrechnung_wochen
  check (durchrechnung_wochen between 17 and 52);

comment on column public.companies.durchrechnung_wochen is
  'Wochen, über die der Schnitt von 48 Std. gilt (§ 9 Abs 4 AZG: 17, laut Kollektivvertrag bis 52).';
