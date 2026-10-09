/*
  DER ZEILENSCHUTZ PRÜFT EINMAL JE ABFRAGE, NICHT JE ZEILE (Analyse vom
  09.10.2026, „Senklot schneller machen“).

  WAS GEMESSEN WURDE. Ein Betrieb mit 30 Personen und 5 Jahren Buchungen: eine
  Seite (500) der Jahresbuchungen dauerte für die Buchhaltung 12 s — ohne
  Zeilenschutz 5 ms. Die Datenbank fand die 7.830 Zeilen des Jahres über den
  Index in 0,4 ms und rief danach für JEDE Zeile `app.darf(company_id)` auf:
  angemeldet, aktiv, Betrieb ruht, zweiter Faktor, Rolle — rund 1 ms je Zeile.
  Die Hilfsfunktionen sind `security definer` mit festem `search_path`
  (CLAUDE.md); Postgres kann sie deshalb nicht in die Regel einbauen und ruft
  sie je Zeile. Mit dieser Migration: 16 ms (letzte Seite 21 ms).

  WAS SICH ÄNDERT: NUR DIE SCHREIBWEISE. Drei mechanische Ersetzungen, jede
  für sich gleichwertig (erzeugt mit `scripts/leseregeln-umbauen.py` aus den
  geltenden Regeln; was kein Muster trifft, steht Wort für Wort wie vorher):

    app.betriebsmitglied(X)  →  X = (select app.lesebetrieb())
    app.support_liest(X)     →  X = (select app.supportbetrieb())
    app.darf(X)              →  beides mit OR, wie `app.darf` selbst
    Rolle, Anmeldung, auth.uid() ohne Bezug zur Zeile  →  (select …)

  Ein `(select …)` ohne Bezug zur Zeile rechnet Postgres einmal je Abfrage
  (InitPlan). Der Vergleich `company_id = …` wird zudem eine Indexbedingung.

  WARUM GLEICHWERTIG. `app.lesebetrieb()` ist der eigene Betrieb, wenn
  `app.betriebsmitglied` für ihn wahr wäre — angemeldet, aktiv, nicht ruhend,
  mit zweitem Faktor, wo verlangt —, sonst leer. `app.supportbetrieb()` ist der
  Betrieb des laufenden Einblicks, wenn `app.support_liest` für ihn wahr wäre,
  sonst leer. Wo die alten Funktionen „falsch“ sagten, ergibt der Vergleich
  mit „leer“ NULL; eine Regel behandelt beides als „kein Zugriff“. Verschieden
  wäre es nur unter einem NOT — keine Regel verneint einen dieser Aufrufe.
  Geprüft wird das Ergebnis Regel für Regel, Zeile für Zeile und in jeder Lage
  (Rollen, Support, ruhend, deaktiviert, ohne zweiten Faktor, fremder Betrieb,
  nicht angemeldet) gegen die eingefrorene alte Fassung:
  `tests/supabase/leseregelnGleichwertig.test.ts`.

  WAS BLEIBT. Fünf Prüfungen hängen fachlich an der Zeile und bleiben je Zeile
  (`darf_urlaub_entscheiden`, `schein_bearbeitbar`, `schein_schreibt`,
  `baustelle_einsehbar`, `freigabe_gilt`); sie stehen auf kleinen Tabellen.
  Die Regeln im Schema `storage` bleiben unverändert. Die alten Funktionen
  bleiben bestehen — Datenbankfunktionen und Speicherregeln nutzen sie.

  KÜNFTIGE REGELN schreiben den Betrieb als `company_id = (select
  app.lesebetrieb())` usw. — eine Prüfung in `leseregelnGleichwertig.test.ts`
  lässt keine Regel mit einem Aufruf je Zeile mehr durch.
*/

create or replace function app.lesebetrieb() returns text
  language sql stable
  security definer
  set search_path = ''
as $$
  select case when app.angemeldet() and app.betrieb() is not null then app.betrieb() end
$$;

create or replace function app.supportbetrieb() returns text
  language sql stable
  security definer
  set search_path = ''
as $$
  select f.company_id
    from public.support_freigaben f
   where app.ist_plattform()
     and f.id = app.einblick_aktuell()
     and not app.betrieb_ruht(f.company_id)
$$;

-- Ausgewertet werden die Regeln nur für angemeldete Konten: `anon` hat auf
-- keiner Tabelle ein Recht (`schema.test.ts`) und kommt nie bis zur Regel.
revoke all on function app.lesebetrieb() from public, anon;
revoke all on function app.supportbetrieb() from public, anon;
grant execute on function app.lesebetrieb() to authenticated;
grant execute on function app.supportbetrieb() to authenticated;

alter policy arbeitszeit_begruendungen_aendern on public.arbeitszeit_begruendungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_buch_oder_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy arbeitszeit_begruendungen_anlegen on public.arbeitszeit_begruendungen
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy arbeitszeit_begruendungen_lesen on public.arbeitszeit_begruendungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy arbeitszeit_begruendungen_loeschen on public.arbeitszeit_begruendungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy assignments_lesen on public.assignments
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy assignments_schreiben on public.assignments
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy baustelle_alte_nummern_lesen on public.baustelle_alte_nummern
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy betrieb_kostensaetze_lesen on public.betrieb_kostensaetze
  using (((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy betrieb_kostensaetze_schreiben on public.betrieb_kostensaetze
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy betriebsurlaube_lesen on public.betriebsurlaube
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy buchungskonten_lesen on public.buchungskonten
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy buchungskonten_schreiben on public.buchungskonten
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_spitze()) OR ( SELECT app.hat_rolle(ARRAY['Buchhaltung'::text])))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_spitze()) OR ( SELECT app.hat_rolle(ARRAY['Buchhaltung'::text])))));

alter policy companies_aendern on public.companies
  using ((((id) = ( SELECT app.lesebetrieb()) OR (id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((id) = ( SELECT app.lesebetrieb()) OR (id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy companies_lesen on public.companies
  using (((id) = ( SELECT app.lesebetrieb()) OR (id) = ( SELECT app.supportbetrieb())));

alter policy customers_aendern on public.customers
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_kunden_pflegen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_kunden_pflegen())));

alter policy customers_anlegen on public.customers
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_kunden_pflegen())));

alter policy customers_lesen on public.customers
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.rolle()) IS DISTINCT FROM 'Mitarbeiter'::text)));

alter policy customers_loeschen on public.customers
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_kunden_pflegen())));

alter policy datanorm_laeufe_lesen on public.datanorm_laeufe
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy datanorm_laeufe_schreiben on public.datanorm_laeufe
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())));

alter policy datanorm_zeilen_lesen on public.datanorm_zeilen
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy datanorm_zeilen_schreiben on public.datanorm_zeilen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())));

alter policy einkauf_posten_aendern on public.einkauf_posten
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung())) AND (geliefert_am IS NULL)))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy einkauf_posten_anlegen on public.einkauf_posten
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung())) AND (geliefert_am IS NULL)));

alter policy einkauf_posten_lesen on public.einkauf_posten
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy einkauf_posten_loeschen on public.einkauf_posten
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung())) AND (geliefert_am IS NULL)));

alter policy einsatz_material_aendern on public.einsatz_material
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())))
  with check (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy einsatz_material_anlegen on public.einsatz_material
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy einsatz_material_lesen on public.einsatz_material
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy einsatz_material_loeschen on public.einsatz_material
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy einsatz_material_positionen_lesen on public.einsatz_material_positionen
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy einsatz_material_positionen_schreiben on public.einsatz_material_positionen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy fehlerprotokoll_schreiben on public.fehlerprotokoll
  with check (((company_id) = ( SELECT app.lesebetrieb())));

alter policy freistellungen_lesen on public.freistellungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy geburtsdaten_aendern on public.geburtsdaten
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())));

alter policy geburtsdaten_anlegen on public.geburtsdaten
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())));

alter policy geburtsdaten_lesen on public.geburtsdaten
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy geburtsdaten_loeschen on public.geburtsdaten
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())));

alter policy invoice_coverage_anlegen on public.invoice_coverage
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy invoice_coverage_lesen on public.invoice_coverage
  using (((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy invoice_lines_anlegen on public.invoice_lines
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy invoice_lines_lesen on public.invoice_lines
  using (((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())) OR ((company_id) = ( SELECT app.supportbetrieb())) OR (( SELECT app.darf_rechnungen_lesen()) AND (EXISTS ( SELECT 1
   FROM invoices i
  WHERE (i.id = invoice_lines.invoice_id))))));

alter policy invoices_aendern on public.invoices
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy invoices_anlegen on public.invoices
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy invoices_lesen on public.invoices
  using (((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())) OR ((company_id) = ( SELECT app.supportbetrieb())) OR (((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_rechnungen_lesen()) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = invoices.project_id) AND (p.company_id = invoices.company_id) AND (( SELECT auth.uid()) = ANY (p.project_managers))))))));

alter policy kalender_abos_lesen on public.kalender_abos
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND (user_id = ( SELECT auth.uid()))));

alter policy konto_umstellungen_lesen on public.konto_umstellungen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy krankmeldungen_lesen on public.krankmeldungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy lagerbewegungen_lesen on public.lagerbewegungen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text, 'Buchhaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy material_einkaufspreise_lesen on public.material_einkaufspreise
  using (((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.darf_einkauf_sehen())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy material_einkaufspreise_schreiben on public.material_einkaufspreise
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.darf_katalog_einspielen())));

alter policy material_orders_aendern on public.material_orders
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text, 'Buchhaltung'::text])) OR ( SELECT app.ist_fuehrung()) OR (user_id = ( SELECT auth.uid())))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text, 'Buchhaltung'::text])) OR ( SELECT app.ist_fuehrung()) OR (user_id = ( SELECT auth.uid())))));

alter policy material_orders_anlegen on public.material_orders
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ((user_id = ( SELECT auth.uid())) OR (( SELECT app.ist_fuehrung()) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = material_orders.user_id) AND (u.company_id = material_orders.company_id)))))) AND (is_billed = false) AND (COALESCE(invoice_number, ''::text) = ''::text)));

alter policy material_orders_lesen on public.material_orders
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text, 'Buchhaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy material_orders_loeschen on public.material_orders
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy material_prices_lesen on public.material_prices
  using (((((company_id) = ( SELECT app.lesebetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy material_prices_schreiben on public.material_prices
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy materials_aendern on public.materials
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())))
  with check (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy materials_anlegen on public.materials
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy materials_lesen on public.materials
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy materials_loeschen on public.materials
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy project_documents_anlegen on public.project_documents
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_fuehrung()) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_documents.project_id) AND (p.company_id = project_documents.company_id))))));

alter policy project_documents_lesen on public.project_documents
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND app.baustelle_einsehbar(project_id)));

alter policy project_documents_loeschen on public.project_documents
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy projects_aendern on public.projects
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy projects_anlegen on public.projects
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy projects_lesen on public.projects
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy projects_loeschen on public.projects
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy quote_lines_lesen on public.quote_lines
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy quote_lines_schreiben on public.quote_lines
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy quotes_lesen on public.quotes
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy quotes_schreiben on public.quotes
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy rabattsaetze_lesen on public.rabattsaetze
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy rabattsaetze_schreiben on public.rabattsaetze
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy suppliers_lesen on public.suppliers
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy suppliers_schreiben on public.suppliers
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR ( SELECT app.ist_fuehrung()))));

alter policy support_freigaben_gewaehren on public.support_freigaben
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze()) AND (gewaehrt_von = ( SELECT auth.uid())) AND (NOT notzugang)));

alter policy support_freigaben_lesen on public.support_freigaben
  using ((((company_id) = ( SELECT app.lesebetrieb())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy support_freigaben_widerrufen on public.support_freigaben
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ( SELECT app.ist_spitze())));

alter policy support_zugriffe_lesen on public.support_zugriffe
  using ((((company_id) = ( SELECT app.lesebetrieb())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy support_zugriffe_melden on public.support_zugriffe
  with check ((( SELECT app.ist_plattform()) AND (admin_uid = ( SELECT auth.uid())) AND app.freigabe_gilt(freigabe_id, company_id)));

alter policy system_laeufe_lesen on public.system_laeufe
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy termine_aendern on public.termine
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])))));

alter policy termine_lesen on public.termine
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])) OR (( SELECT auth.uid()) = ANY (teilnehmer)) OR ((project_number IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.company_id = termine.company_id) AND (a.date = termine.datum) AND (a.project_number = termine.project_number) AND (a.user_id = ( SELECT auth.uid())))))))));

alter policy termine_loeschen on public.termine
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])))));

alter policy termine_schreiben on public.termine
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.ist_fuehrung()) OR ( SELECT app.hat_rolle(ARRAY['Verwaltung'::text])))));

alter policy time_entries_aendern on public.time_entries
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy time_entries_anlegen on public.time_entries
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND (( SELECT app.ist_buch_oder_spitze()) OR ((user_id = ( SELECT auth.uid())) AND (is_billed = false) AND (COALESCE(invoice_number, ''::text) = ''::text)))));

alter policy time_entries_lesen on public.time_entries
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy time_entries_loeschen on public.time_entries
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy uid_pruefungen_lesen on public.uid_pruefungen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (( SELECT app.rolle()) IS DISTINCT FROM 'Mitarbeiter'::text)));

alter policy urlaubsanspruch_anpassungen_lesen on public.urlaubsanspruch_anpassungen
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_buch_oder_spitze()) OR app.darf_urlaub_entscheiden(company_id))));

alter policy user_prefs_aendern on public.user_prefs
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (user_id = ( SELECT auth.uid()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (user_id = ( SELECT auth.uid()))));

alter policy user_prefs_anlegen on public.user_prefs
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (user_id = ( SELECT auth.uid()))));

alter policy user_prefs_lesen on public.user_prefs
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (user_id = ( SELECT auth.uid()))));

alter policy users_aendern on public.users
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy users_anlegen on public.users
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy users_lesen on public.users
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ((id = ( SELECT auth.uid())) OR (( SELECT app.rolle()) IS DISTINCT FROM 'Mitarbeiter'::text))));

alter policy users_loeschen on public.users
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

alter policy vacations_aendern on public.vacations
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()))))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()))));

alter policy vacations_anlegen on public.vacations
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND (user_id = ( SELECT auth.uid())) AND (status = 'Beantragt'::text) AND (betriebsurlaub_id IS NULL)));

alter policy vacations_lesen on public.vacations
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()) OR app.darf_urlaub_entscheiden(company_id))));

alter policy vacations_loeschen on public.vacations
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND (user_id = ( SELECT auth.uid())) AND (status = 'Beantragt'::text)));

alter policy wartungen_lesen on public.wartungen
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy wartungen_schreiben on public.wartungen
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_fuehrung())));

alter policy work_sheet_hours_lesen on public.work_sheet_hours
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy work_sheet_hours_schreiben on public.work_sheet_hours
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_bearbeitbar(work_sheet_id)))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_bearbeitbar(work_sheet_id)));

alter policy work_sheet_material_lesen on public.work_sheet_material
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy work_sheet_material_schreiben on public.work_sheet_material
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_bearbeitbar(work_sheet_id)))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_bearbeitbar(work_sheet_id)));

alter policy work_sheet_photos_lesen on public.work_sheet_photos
  using (((company_id) = ( SELECT app.lesebetrieb())));

alter policy work_sheet_photos_schreiben on public.work_sheet_photos
  using ((((company_id) = ( SELECT app.lesebetrieb())) AND app.schein_bearbeitbar(work_sheet_id)))
  with check ((((company_id) = ( SELECT app.lesebetrieb())) AND app.schein_bearbeitbar(work_sheet_id)));

alter policy work_sheets_aendern on public.work_sheets
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_schreibt(erstellt_von_uid)))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND app.schein_schreibt(erstellt_von_uid)));

alter policy work_sheets_anlegen on public.work_sheets
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND (status = 'Entwurf'::text) AND (erstellt_von_uid = ( SELECT auth.uid())) AND app.schein_schreibt(erstellt_von_uid)));

alter policy work_sheets_lesen on public.work_sheets
  using (((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())));

alter policy zahlungen_aendern on public.zahlungseingaenge
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy zahlungen_anlegen on public.zahlungseingaenge
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy zahlungen_lesen on public.zahlungseingaenge
  using (((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy zahlungen_loeschen on public.zahlungseingaenge
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_buch_oder_spitze())));

alter policy zeitkonto_anfang_lesen on public.zeitkonto_anfang
  using (((((company_id) = ( SELECT app.lesebetrieb())) AND ((user_id = ( SELECT auth.uid())) OR ( SELECT app.ist_fuehrung()) OR ( SELECT app.ist_buch_oder_spitze()) OR app.darf_urlaub_entscheiden(company_id))) OR ((company_id) = ( SELECT app.supportbetrieb()))));

alter policy zeitkonto_anfang_schreiben on public.zeitkonto_anfang
  using ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())))
  with check ((((company_id) = ( SELECT app.lesebetrieb()) OR (company_id) = ( SELECT app.supportbetrieb())) AND ( SELECT app.ist_spitze())));

