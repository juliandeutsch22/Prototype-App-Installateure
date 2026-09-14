-- Serverseitig suchen — mit Treffern in der WORTMITTE.
--
-- DIE NARBE, DIE HIER FAELLT. Firestore kennt keine Volltextsuche. Die
-- Ansichten luden deshalb die ersten paar hundert Zeilen und filterten im
-- Browser: wer den 301. Kunden suchte, fand ihn nicht — und bekam darueber
-- keine Auskunft, sondern eine leere Liste. Genau dafuer stand ueber jeder
-- Liste ein Nachladeknopf, den niemand verstand.
--
-- `ilike '%begriff%'` kann kein gewoehnlicher Index bedienen: er ist nach
-- Anfaengen sortiert, und hier wird mitten im Wort gesucht. Ein Trigram-Index
-- zerlegt jeden Text in Dreierfolgen und findet damit auch „uber" in „Huber".
--
-- OHNE DIESE INDIZES LIEFE DIE SUCHE TROTZDEM — als vollstaendiger
-- Tabellendurchlauf. Bei zweihundert Kunden faellt das nicht auf, bei
-- fuenfzehntausend Zeiteintraegen schon; und es faellt dann an dem Tag auf,
-- an dem niemand damit rechnet.
create extension if not exists pg_trgm;

/*
  JE SPALTE EIN INDEX, und nur fuer die, nach denen wirklich gesucht wird.

  Ein Index kostet bei jedem Schreibvorgang. Die Spalten hier sind die, die in
  `pg/customers.ts`, `pg/projects.ts` und `pg/wartungen.ts` in der
  `or`-Bedingung stehen — waechst die Liste dort, gehoert sie auch hierher.
*/
create index if not exists customers_suche_name
  on public.customers using gin (name gin_trgm_ops);
create index if not exists customers_suche_adresse
  on public.customers using gin (address gin_trgm_ops);
create index if not exists customers_suche_kontakt
  on public.customers using gin (contact_name gin_trgm_ops);

create index if not exists projects_suche_nummer
  on public.projects using gin (project_number gin_trgm_ops);
create index if not exists projects_suche_kunde
  on public.projects using gin (customer_name gin_trgm_ops);
create index if not exists projects_suche_adresse
  on public.projects using gin (address gin_trgm_ops);

create index if not exists wartungen_suche_kunde
  on public.wartungen using gin (customer_name gin_trgm_ops);
create index if not exists wartungen_suche_anlage
  on public.wartungen using gin (anlage gin_trgm_ops);
create index if not exists wartungen_suche_adresse
  on public.wartungen using gin (address gin_trgm_ops);
