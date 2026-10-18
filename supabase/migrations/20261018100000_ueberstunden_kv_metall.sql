-- ---------------------------------------------------------------------------
-- Überstundenzuschläge nach dem Kollektivvertrag Metallgewerbe (18.10.2026)
--
-- Beim Modell „Tagesgrenze“ standen alle Überstunden eines Werktags bei 50 %.
-- Der KV Metallgewerbe (Arbeiter, Abschnitt XIV Pkt 8–11) verlangt 100 % ab
-- der dritten Überstunde am Tag, zwischen 20 und 6 Uhr, ab der 51. Stunde der
-- Woche, am arbeitsfreien Tag ab der 11. Stunde und an Sonn- und Feiertagen
-- (`docs/recherche-fragenkataloge.md`). Gerechnet wird in der App
-- (`accounting/ueberstunden.ts`); hier steht nur der Schalter.
--
-- AB WERK AN, wie die Regel für den 24./31.12.: Senklot ist für
-- Installationsbetriebe, und für deren Arbeiter gilt dieser KV. Ein Betrieb
-- mit anderem KV schaltet ab. Beim Zeitkonto ändert sich nichts.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists ueberstunden_kv_metall boolean not null default true;

comment on column public.companies.ueberstunden_kv_metall is
  'Bei tagesgrenze: 50/100 % nach dem KV Metallgewerbe für Personen mit Einstufung (Arbeiter). Ab Werk an.';
