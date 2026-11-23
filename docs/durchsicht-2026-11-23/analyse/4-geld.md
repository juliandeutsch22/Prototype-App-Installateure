# Geld (Rechnungen, Zahlungen, Mahnungen, Exporte, Nachkalkulation) — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Nur gelesen. Dazu zwei Nachweise ohne Änderung am Repository:
ein Wegwerf-Skript im Scratchpad, das die echte Funktion `abgleichen` aus
`src/features/invoices/kontoauszugAbgleich.ts` mit einem Beispiel aufruft (Befund G-1), und ein
Lauf der bestehenden Prüfdatei `tests/unit/kontoauszugAbgleich.test.ts` (32 von 32 grün, keiner
der Fälle deckt G-1 ab). Kein Datenbankstapel, kein Browser, keine volle Testsuite.

„Belegt“ heißt: App-Seite und Datenbankseite gelesen, bei SQL jeweils die letzte Definition
(`create or replace function …`, Groß- und Kleinschreibung beachtet). Was ich nicht zu Ende
prüfen konnte, steht in Abschnitt 3.

## 1. Angesehen

Abläufe von Anfang bis Ende:

1. **Rechnung stellen:** `InvoicesView.buildPreview` (Z. 1648) → `vorschauUebernehmen` (Z. 2013) →
   `confirmInvoice` (Z. 2288) → `rechnung_ausstellen` (`20261116050900_rechnungsnummer_nur_mit_beleg.sql:112`)
   → `rechnung_anlegen` (`20261116050400_leistungsnachweis_im_beleg.sql:47`, danach gezielt ergänzt
   durch `20261116060000_material_verrechnet_je_ausgabe.sql`) mit Nummer aus
   `app.naechste_nummer_kern` (`20261106400000_angebot_annahme_link.sql`).
2. **Summen und Steuerfälle:** `totals.ts`, `shared/forderungen.ts` (`cent`, `aufStellen`),
   `reverseCharge.ts`, Steuerbefreiung, `vorrechnungen.ts` (Abzug in der Schlussrechnung) und
   `app.vorrechnungen_pruefen` (`20261110160000_vorrechnungen_nach_schluss.sql`), `ruecklass.ts`,
   `skonto.ts`, `konditionen.ts`.
3. **Zahlung:** Zahlungsdialog (`InvoicesView.tsx:1273–1494`), `app.zahlstand_setzen`
   (`20261116050100_schluss_ohne_rest.sql`), `app.skonto_passt`, `app.zahlung_nicht_unter_null`,
   `app.mahnkosten_passt` (`20261110160100_anzahlungskonten_mahnkosten.sql`), `guthaben_umbuchen`
   (`20261116050800`), Kontoauszug (`kontoauszugLesen.ts`, `kontoauszugAbgleich.ts`,
   `KontoauszugView.tsx`, `kontoauszug_verbuchen` in `20261117042000`).
4. **Mahnung:** `shared/forderungen.ts` (Mahnlauf, `darfMahnen`, `mahnbar`), `mahnung.ts`
   (`mahnforderungRechnen`, `verzugszinsen`), `mahnung_festhalten` (`20261116050600`), Mahnung per
   Mail (`beleg_versand_vorbereiten`, `20261117043000`).
5. **Storno und Korrektur:** `rechnung_stornieren` (`20260926101000`), `rechnung_ersetzen`
   (`20261116050700`), `stornorechnung_ausstellen` (`20261116050900`).
6. **Export:** `buchhaltungExport.ts` (Ausgangsbuch, Lückenprüfung), `bmdExport.ts` (Rechnungs- und
   Zahlungsstapel), `listInvoicesInRange` (`src/lib/db/pg/invoices.ts:332`), Kontenrahmen.
7. **Versand:** Edge Function `beleg-mail/index.ts`, `shared/belegMail.ts` in Auszügen.
8. **Startseite:** Edge Function `startseite-forderungen/index.ts`, `forderungsStand`.
9. **Nachkalkulation:** `costing/nachkalkulation.ts`, `NachkalkulationView.tsx`, `nachkalkulationLaden.ts`.
10. **Liste nach E98/E99:** `RechnungsListe.tsx`, `AkteRechnungFenster.tsx` — kein Rückfall gefunden
    (nur gelesen, nicht im Browser).

Gesamteindruck: Der Kern (lückenlose Nummer, Doppelverrechnung, Abzug, eingefrorener Beleg,
Zahlstand unter Gleichzeitigkeit) ist dicht. Die Befunde liegen im neuen Kontoauszug, an den
Rändern des Formulars, beim Rücklass, bei dem, was sich nicht zurücknehmen lässt, und bei
Annahmen über die Buchhaltung des Betriebs.

## 2. Befunde (belegt)

### G-1 Der Kontoauszug-Abgleich hält ein Datum im Verwendungszweck für eine Rechnungsnummer und wählt die falsche Rechnung vor
- Art: Fehler
- Schwere: mittel bis hoch — betrifft jeden Betrieb in jedem Jahr für seine ersten rund 230
  Rechnungen (laufende Nummern 1001 bis 1231 sehen aus wie Monat und Tag von Oktober bis
  Dezember). Geld landet auf der Rechnung eines anderen Kunden; die Zeile ist vorgewählt.
- Beleg: `src/features/invoices/kontoauszugAbgleich.ts:154–167` (`nummerImText`: ohne Vorsatz
  genügen Jahr und laufende Nummer, die Trenner dazwischen dürfen fehlen), `:332–334` (Treffer der
  Stufe 1 gelten, sobald es keinen der Stufe 2 gibt), `:248–263` (ein kleinerer Betrag ist
  „Teilzahlung“ mit Stufe `passt`), `KontoauszugView.tsx:130` (alles mit `passt` ist vorgewählt).
  Der Zweck enthält bei camt-Dateien auch die Auftraggeberreferenz und Banktexte:
  `kontoauszugLesen.ts:292–296`.
- Nachgestellt mit der echten Funktion: offene Rechnungen `RE-2026-1015` (Huber GmbH, 1.200 €) und
  `RE-2026-1100` (Maier Anna, 480 €). Eingang 480 € von „Anna Maier“, Zweck
  „Rechnung Bad 20261015-000123“ (Datum als Referenz ihrer Banksoftware). Ergebnis:
  Stufe `passt`, „Teilzahlung auf RE-2026-1015“, 480 € auf die Rechnung von Huber — obwohl Betrag
  und Name genau zu Maiers Rechnung passen.
- Auswirkung: Die Buchhaltung bestätigt den vorgewählten Block; Huber steht als „Teilbezahlt“ da,
  Maier wird gemahnt. Auffallen kann es erst im Mahnlauf.
- Vorschlag: In `nummerImText` zählt ein Treffer ohne Vorsatz nicht, wenn Jahr und Nummer ohne
  Trenner als achtstellige Ziffernfolge stehen und zusammen ein gültiges Datum ergeben. Zusätzlich
  in `abgleichen`: ein Treffer der Stufe 1 ist nur dann `passt`, wenn auch der Betrag passt
  (Rest, Zahlbetrag ohne Rücklass, Skonto, Rest plus Mahnkosten); sonst zuerst die Suche über
  Betrag und Name, und was dann bleibt, ist `pruefen`. Dasselbe in `abbuchung` (`:451–453`).
  Prüfung: neuer Fall in `tests/unit/kontoauszugAbgleich.test.ts` mit genau dem Beispiel oben
  (ohne Änderung `passt` auf die falsche Rechnung, mit Änderung `pruefen` auf Maier). Gleich
  bleiben müssen: Treffer mit Vorsatz (Stufe 2) und Treffer ohne Vorsatz mit passendem Betrag —
  die 32 bestehenden Fälle halten das fest; dazu ein eigener Fall „2026-1015 mit Trenner und
  passendem Betrag bleibt vorgewählt“. Risiko: Kunden, die ohne Vorsatz und mit Teilbetrag zahlen,
  stehen künftig unter „Bitte prüfen“ statt vorgewählt — ein Tipp mehr, kein falsches Ergebnis.
- Aufwand: klein

### G-2 Rabatt, „Bauleistung“ (Übergang der Steuerschuld), Rücklass, Steuerbefreiung und Rechnungsart bleiben stehen, wenn die Baustelle gewechselt oder die Vorschau verworfen wird
- Art: Fehler (Rest von G1 der letzten Durchsicht)
- Schwere: mittel — die Werte stehen in der Vorschau, aber nicht als „abweichend“ markiert; der
  Beleg ist danach eingefroren.
- Beleg: `InvoicesView.tsx:753–759` (`baustelleWaehlen` setzt nur die Sätze und den Ersatz
  zurück), `:761–765` (`vorschauVerwerfen` ebenso), `:772–777` (`erstellenSchliessen`); die
  übrigen Angaben setzt allein `nachDemAusstellen` zurück (`:2097–2114`). Gesetzt werden sie auch
  von „Stornieren und neu ausstellen“ (`:2131–2154`).
- Auswirkung: Für den Bauträger A „Bauleistung“ angehakt, 5 % Haftrücklass und 3 % Rabatt
  eingetragen, dann doch zuerst Baustelle B (Privatkunde mit UID im Stamm, etwa ein Vermieter)
  gewählt: B bekommt eine Rechnung ohne Umsatzsteuer mit Rücklass und Rabatt. Oder: „Stornieren
  und neu ausstellen“ begonnen und verworfen — die nächste neue Rechnung trägt Rabatt, Art
  „Schlussrechnung“ und Rücklass der alten.
- Vorschlag: Eine Funktion `rechnungsangabenZuruecksetzen()` mit genau den Zeilen aus
  `nachDemAusstellen` (ohne `setProjectNumber`), aufgerufen in `baustelleWaehlen` (bei Wechsel),
  `vorschauVerwerfen` und `nachDemAusstellen`. Die Regel aus G1 gilt dann für alles: eine andere
  Baustelle ist eine andere Rechnung. Prüfung in `tests/components/InvoicesView.test.tsx`:
  Rabatt und „Bauleistung“ setzen, Baustelle wechseln, Vorschau ohne beides (vorher rot). Gleich
  bleiben muss: Neu zusammenstellen derselben Baustelle behält Rabatt und Steuersatz
  (`vorschauUebernehmen`, Prüflauf P2-01) — eigener Test „bleibt gleich“. Risiko: Wer bewusst
  mehrere Baustellen mit demselben Rabatt abrechnet, tippt ihn je Rechnung neu.
- Aufwand: klein

### G-3 Der Haftrücklass rechnet nach Regie-Teilrechnungen nicht von der ganzen Leistung, und der Deckungsrücklass wird mit der Schlussrechnung nicht fällig
- Art: Fehler (gebrochene Zusage) und Lücke; stand im Vorgängerpapier als Verdacht V4 und unter
  „Nicht nahtlos“, kam nicht in den Plan.
- Schwere: mittel — betrifft Betriebe, die für Bauträger und Generalunternehmer mit Rücklass
  arbeiten; falscher Betrag auf einem eingefrorenen Beleg.
- Beleg: Zusage `docs/handbuch/handbuch.html:4453` („Grundlage ist die ganze Leistung“) und
  `ruecklass.ts:30–40`. Gerechnet wird mit `summen.gesamtBrutto` (`InvoicesView.tsx:3057–3069`),
  und das ist nur die Summe dieser Rechnung (`vorrechnungen.ts:186–202`); Teilrechnungen mit
  Belegen werden nicht abgezogen, sondern nur genannt (`vorrechnungen.ts:49–66`). Die Datenbank
  prüft dieselbe Formel und höchstens 20 % (`20261116050400…:124–142`). Die Fälligkeit des
  Deckungsrücklasses ist ein beim Ausstellen eingetragenes Datum; geändert wird sie nur über die
  Bankgarantie (kein anderes Schreiben auf `ruecklass_bis`).
- Auswirkung: Auftrag 100.000 € in Regie, 80.000 € in vier Teilrechnungen (je 10 %
  Deckungsrücklass, „fällig“ geschätzt in sechs Monaten), Schlussrechnung 20.000 €. 5 %
  Haftrücklass ergeben 1.000 € statt 5.000 €; die richtigen 25 % vom Rest lässt die Grenze nicht
  zu. Die 8.000 € Deckungsrücklass werden mit der Schlussrechnung nicht fällig, sondern am
  geschätzten Tag — der Mahnlauf fordert sie zu früh oder zu spät.
- Vorschlag: (a) Grundlage des Haftrücklasses = Summe dieser Rechnung plus die gültigen
  Teilrechnungen derselben Baustelle, die die Schlussrechnung nennt (`teilrechnungenText` kennt sie
  schon); die Vorschau zeigt „Grundlage: … € (ganze Leistung)“. Die Datenbank rechnet in
  `rechnung_anlegen` dieselbe Summe nach (Teilrechnungen der Baustelle über `project_number`,
  nicht storniert). (b) Neue Funktion `ruecklass_faellig_stellen(p_rechnung, p_tag)` (`security
  definer`, `set search_path = ''`, `revoke … from public, anon`, `grant` an `authenticated`,
  Rolle wie `ist_buch_oder_spitze`), die den Fälligkeitstag eines offenen Deckungsrücklasses auf
  einen früheren Tag setzt — über dieselbe schmale Tür wie die Bankgarantie in
  `app.rechnung_eingefroren`; nach dem Ausstellen der Schlussrechnung bietet die Meldung „Deckungs-
  rücklässe der Teilrechnungen fällig stellen“ an. Prüfungen: `ruecklass.test.ts` (Grundlage mit
  Teilrechnungen; ohne Änderung 1.000 €), Datenbankprüfung (falsche Grundlage wird abgewiesen;
  Fälligstellen nur nach vorn, nur bei offenem Rücklass). Gleich bleiben muss: Einzelrechnung und
  Schlussrechnung ohne Teilrechnungen rechnen wie bisher; bestehende Belege bleiben unverändert
  (Altdaten). Risiko: die Prüfung in `rechnung_anlegen` muss für Geräte mit altem App-Stand die
  alte Grundlage weiter annehmen (Toleranz: beide Ergebnisse zulässig, bis die alte App aus dem
  Umlauf ist).
- Aufwand: mittel

### G-4 Der BMD-Zahlungsstapel bucht Bar- und Kartenzahlungen auf das Bankkonto
- Art: Fehler im Export / Annahme über den Betrieb
- Schwere: mittel — jeder Betrieb mit Barzahlung (Notdienst, Kleinreparatur) übergibt der Kanzlei
  falsche Bankbuchungen; fällt beim Abstimmen des Bankkontos auf, nicht vorher.
- Beleg: `bmdExport.ts:508–541` — die Zahlungsart wird nur für Skonto, Mahnkosten und Umbuchung
  gelesen, alles andere geht „Bank an Debitoren“. Der Kontenrahmen kennt kein Kassakonto:
  `bmdExport.ts:33–34`, Check in `20261110160100_anzahlungskonten_mahnkosten.sql:36`.
- Auswirkung: 180 € bar beim Kunden kassiert, als „Bar“ erfasst; im Stapel steht eine
  Bankbewegung, die es nie gab.
- Vorschlag: Kontozweck `kassa` (und, wenn die Kanzlei es will, `karte` als Verrechnungskonto) in
  `buchungskonten` (Migration: Check erweitern), Feld in `KontenrahmenView.tsx`; `buildBmdZahlungenCsv`
  wählt das Geldkonto nach der Art, fehlt das Konto für eine vorkommende Art, entsteht wie bisher
  keine Datei und der Satz nennt es. Prüfung in `tests/unit/bmdExport.test.ts`: Barzahlung →
  Kassa an Debitoren (vorher Bank); ohne Kassakonto → `fehlend`. Gleich bleiben muss: Überweisung,
  Skonto, Mahnkosten, Umbuchung — die bestehenden Fälle. Risiko: Betriebe, die heute den Stapel
  nutzen und bar kassieren, bekommen bis zum Eintragen des Kontos keine Datei mehr; das ist
  gewollt (wie bei jedem fehlenden Konto), gehört aber ins Handbuch.
- Aufwand: klein

### G-5 Wird eine Zeitbuchung zwischen Vorschau und Ausstellen geändert, sperrt die Rechnung die neue Dauer, verrechnet aber die alte
- Art: Fehler (Wettlauf zweier Personen); Vorgängerpapier V6, nicht im Plan
- Schwere: niedrig bis mittel — selten, aber still: die Differenz wird nie verrechnet.
- Beleg: Die Vorschau hält Positionen und Kennungen (`assemble.ts:374`), `confirmInvoice` lädt
  nichts nach (`InvoicesView.tsx:2288–2494`), die Datenbank sperrt nach Kennung, ohne die Buchung
  anzusehen (`20261116050400…:205–211`).
- Auswirkung: Vorschau um 9 Uhr mit 8 Stunden; der Monteur berichtigt um 9.10 Uhr auf 10 Stunden;
  „Rechnung anlegen“ um 9.20 Uhr verrechnet 8 Stunden und markiert die Buchung mit 10 Stunden als
  verrechnet. Der Leistungsnachweis (aus der Vorschau) zeigt 8.
- Vorschlag: `p_belege` trägt je Zeitbuchung zusätzlich die verrechneten Minuten (neuer Schlüssel
  `time_entry_minuten` als Objekt Kennung → Minuten). `rechnung_anlegen` vergleicht sie mit der
  Zeile (gleiche Rechnung wie `calcWorkMin`: Ende − Beginn − Pause) und bricht bei Abweichung ab:
  „Eine Zeitbuchung wurde inzwischen geändert — bitte neu zusammenstellen“. Fehlt der Schlüssel
  (alte App), bleibt es wie bisher. Prüfung: Datenbankprüfung mit geänderter Buchung (vorher
  angelegt, nachher abgewiesen), Gegenstück „unverändert geht durch“. Gleich bleiben muss das
  Ausstellen ohne den Schlüssel und jeder Weg ohne Zeitbuchungen. Risiko: eine zweite
  Minutenrechnung in SQL — sie muss gegen `calcWorkMin` mit denselben Grenzfällen geprüft werden
  (über Mitternacht, Pause), sonst weist sie richtige Rechnungen ab.
- Aufwand: mittel

### G-6 Eine Pauschale ohne offene Belege lässt sich aus einer veralteten Vorschau ein zweites Mal verrechnen
- Art: Fehler (Wettlauf)
- Schwere: niedrig — braucht zwei Personen oder zwei Reiter und eine Pauschalbaustelle ohne
  offene Buchungen (Rechnung vor Arbeitsbeginn oder nach vollständiger Verknüpfung).
- Beleg: Die Sperre „Pauschale ist mit … bereits verrechnet“ gibt es nur beim Zusammenstellen
  (`InvoicesView.tsx:1885–1894`, `pauschale.ts:109–119`); `confirmInvoice` prüft nicht erneut, und
  die Datenbank kennt die Regel nicht (kein Auslöser; geschützt sind nur Zeitbuchungen, Scheine,
  Wartungen und die eine Schlussrechnung).
- Auswirkung: Zwei Rechnungen über dieselbe Pauschale; die zweite muss storniert werden und
  verbraucht zwei Nummern.
- Vorschlag: Die Regel in die Datenbank, als Auslöser vor dem Anlegen einer Rechnung der Art
  `einzel` oder `schluss` auf einer Baustelle mit Abrechnungsart Pauschal oder Einheitspreis: gibt
  es dort schon eine gültige Rechnung, die weder Anzahlung noch Teilrechnung ist, wird abgewiesen
  — mit derselben Sperre je Baustelle wie `app.vorrechnungen_pruefen`. Prüfung: Datenbankprüfung
  mit zwei Aufrufen nacheinander (vorher zwei Rechnungen). Gleich bleiben muss: Regiebaustellen;
  eine Baustelle, die nach der Pauschale auf „Regie“ gestellt wurde (der Weg, den die Meldung
  nennt); der Dienstschlüssel. Risiko: Betriebe, die bewusst zwei „Rechnungen“ auf einer
  Pauschalbaustelle stellen, ohne umzustellen — heute sperrt das schon die Oberfläche, es ändert
  sich nur der Umweg über die alte Vorschau.
- Aufwand: klein

### G-7 Eine Mahnung lässt sich nicht zurücknehmen
- Art: Lücke (anlegen geht, zurücknehmen nicht)
- Schwere: mittel — jeder Betrieb, der mahnt, erwischt irgendwann die falsche Rechnung oder mahnt
  am Tag, an dem die Zahlung schon auf dem Konto war.
- Beleg: Für `mahnungen` gibt es nur Lese- und Anlege-Regeln
  (`20261010700000_mahnungen_einzeln.sql:57–62`), keine Funktion zum Zurücknehmen, kein
  Zurücksetzen von `mahnstufe`; die Kosten früherer Mahnungen zählen in jeder späteren mit
  (`mahnung.ts:143`, `mahnung_festhalten` in `20261116050600`).
- Auswirkung: Zahlungserinnerung versehentlich erzeugt (5 € Spesen, eine Woche Frist). Die
  Rechnung steht dauerhaft auf Stufe 1; die nächste Mahnung ist „Mahnung“ statt
  „Zahlungserinnerung“ und fordert die 5 € mit; „Per Mail senden“ bietet das falsche Schreiben an.
- Vorschlag: Funktion `mahnung_zuruecknehmen(p_mahnung, p_grund)` (Sicherheitsregeln aus
  CLAUDE.md, Rolle wie beim Mahnen, nicht der Support): nur die jüngste Mahnung der Rechnung, nur
  solange kein Eingang der Art „Mahnkosten“ nach ihr gebucht ist; die Mahnung bleibt als Zeile
  erhalten (Spalten `zurueckgenommen_am`, `zurueckgenommen_grund`, `zurueckgenommen_von`), zählt
  aber nicht mehr; Stufe, Mahntag, Frist und Spesen der Rechnung gehen auf den Stand der vorigen
  Mahnung zurück. `mahnforderungRechnen`, `letzteMahnforderung`, `app.mahnforderung`,
  `mahnung_festhalten` (Summe der früheren Spesen) und `beleg_versand_vorbereiten` (jüngste
  Mahnung) lesen nur nicht zurückgenommene. Oberfläche: im Fenster der Rechnung an der Mahnung
  „Zurücknehmen …“ mit Grund; Verlauf „Mahnung zurückgenommen“. Die Spalte `zurueckgenommen_von`
  gehört in Datenauskunft und Personenlöschung. Prüfungen: Datenbank (Stufe 2 → zurück auf 1 mit
  dessen Frist; ältere als die jüngste abgewiesen; nach Mahnkosten-Eingang abgewiesen),
  `mahnforderungEinModell` (zurückgenommene Kosten zählen nicht), `InvoicesView`. Gleich bleiben
  muss: jede Rechnung ohne zurückgenommene Mahnung rechnet und druckt wie heute. Risiko: fünf
  Lesestellen müssen denselben Filter tragen — eine vergessene fordert die Kosten weiter; ein
  Wächtertest über alle Abfragen auf `mahnungen` hält das fest.
- Aufwand: mittel

### G-8 Offene Mahnspesen und Zinsen verschwinden aus allen Listen, sobald die Hauptforderung bezahlt ist
- Art: Lücke
- Schwere: niedrig bis mittel — Betriebe, die Mahnkosten wirklich einfordern, verlieren den
  Überblick; die Summe steht nur im Zahlungsdialog der einzelnen Rechnung.
- Beleg: Bezahlt heißt nicht mehr mahnbar und nicht im Arbeitsstand (`shared/forderungen.ts:307–312`,
  `RechnungsListe.tsx:47–50`); was von der Mahnforderung offen ist, rechnet nur der Dialog
  (`InvoicesView.tsx:1343–1350`, Text `:6178–6179`); das Fenster der Rechnung zeigt nur das Bezahlte
  (`RechnungDetail.tsx:290`).
- Auswirkung: Mahnung 2 fordert 1.000 € plus 13,16 € Spesen und Zinsen; der Kunde überweist
  1.000 €. Die Rechnung ist „Bezahlt“, die 13,16 € sieht niemand mehr.
- Vorschlag: Die offene Mahnforderung als Zahl an der Rechnung führen (`mahnforderung_offen`,
  gesetzt von `mahnung_festhalten` und `zahlstand_setzen` aus `app.mahnforderung` minus
  `mahnkosten_betrag`); Zeile im Fenster der Rechnung, Filter „Mahnkosten offen“ in der Liste und
  im Mahnlauf ein eigener Abschnitt „Hauptforderung bezahlt, Mahnkosten offen“ mit den zwei
  Handgriffen „Zahlung eintragen“ und „Verzichten“ (Verzicht = Vermerk mit Grund, kein Eingang).
  Prüfung: `mahnkostenEinModell.test.ts` (nach Zahlung der Hauptforderung bleibt die Zahl),
  Listenprüfung. Gleich bleiben muss: der Mahnlauf selbst (keine neue Mahnung nur über Kosten) und
  die Kennzahlen „Offen/Überfällig“. Risiko: eine zusätzliche Rechengröße an der Rechnung — sie
  muss in die Ausnahmeliste des Änderungsjournals wie `mahnkosten_betrag`.
- Aufwand: mittel

### G-9 Die Exporte an die Kanzlei haben kein Gedächtnis: übergebene Zeiträume lassen sich still ändern, und eine Stornobuchung kann in zwei Exporten stehen
- Art: Lücke; Vorgängerpapier „Festschreiben nach dem Export“, nicht im Plan
- Schwere: mittel — betrifft jeden Betrieb, der monatlich exportiert; Folge sind Abweichungen
  zwischen App und Buchhaltung, die erst beim Abstimmen auffallen.
- Beleg: Es gibt keine Tabelle und kein Feld über erfolgte Exporte (Migrationen durchsucht).
  Zahlungseingänge jedes Alters lassen sich ändern und löschen (`InvoicesView.tsx:6428`,
  Zeilenschutz in `20260919120000_zahlungseingaenge.sql`). Die Gegenbuchung eines Stornos steht am
  Tag des Stornos, nach dem Ausstellen der Stornorechnung aber an deren Tag
  (`buchhaltungExport.ts:166–172`, `stornoBelegTag.ts`); der Export warnt nur
  (`InvoicesView.tsx:5801–5808`).
- Auswirkung: September exportiert und übergeben (Storno vom 30.09. ohne Stornorechnung als
  Gegenbuchung enthalten). Am 05.10. wird die Stornorechnung ausgestellt: der Oktober-Export
  enthält die Gegenbuchung noch einmal. Oder: eine Zahlung vom 12.09. wird im Oktober gelöscht —
  der Zahlungsstapel September bei der Kanzlei stimmt nicht mehr, niemand erfährt es.
- Vorschlag: Tabelle `export_uebergaben` (Betrieb, Art des Exports, von, bis, wann, wer; lesbar
  für Buchhaltung und Spitze, geschrieben nur über `export_uebergeben(p_art, p_von, p_bis)`), ein
  Knopf „Als übergeben vermerken“ am Export. Danach: (1) der Export nennt beim Zusammenstellen
  „Dieser Zeitraum wurde am … schon übergeben“; (2) Ändern oder Löschen eines Eingangs in einem
  übergebenen Zeitraum verlangt eine Rückfrage mit Grund und erscheint im nächsten Export als
  Abschnitt „Nachträge zu übergebenen Zeiträumen“; (3) eine Gegenbuchung, die schon in einem
  übergebenen Zeitraum stand, wird im späteren Export nicht noch einmal gebucht, sondern als
  Hinweis geführt. Kein hartes Sperren — die Kanzlei ist die Buchhaltung, nicht Senklot. Die
  Tabelle trägt den Namen der Person: Datenauskunft und Personenlöschung nachziehen. Prüfungen:
  `buchhaltungExport.test.ts`/`bmdExport.test.ts` (Storno in zwei Zeiträumen → einmal gebucht,
  einmal Hinweis; Nachtrag erscheint), Datenbank (Rechte, Mandantentrennung). Gleich bleiben muss:
  ohne jeden Vermerk verhalten sich alle drei Exporte genau wie heute (eigener Test). Risiko: die
  Regel „schon gebucht“ darf keine Buchung verschlucken, wenn jemand den Vermerk versehentlich
  setzt — deshalb lässt sich ein Vermerk mit Grund zurücknehmen.
- Aufwand: mittel bis groß

### G-10 Es gibt keinen Beleg für „weniger“: keine Schlussrechnung mit Guthaben, keine Gutschrift nach Retoure oder Nachlass — und der Hinweis auf eine Retoure erreicht die Buchhaltung nach der Schlussrechnung nie
- Art: Lücke; die Texte nennen „noch nicht“ als Grund (kein Grund nach Grundsatz 6)
- Schwere: mittel — Reklamation mit Preisnachlass, Rückgabe nach der Rechnung und „Anzahlung
  höher als die Leistung“ kommen in jedem Betrieb vor.
- Beleg: `InvoicesView.tsx:2321–2333` und `:5050–5055` („die kann diese App noch nicht“),
  `vorrechnungen.ts:168–175`; Rechnungspositionen kennen kein Minus
  (`docs/grenzen-durchsicht-2026-10-24.md:644–648`); der Hinweis „Zurückgegeben, aber schon
  verrechnet“ steht nur in der Vorschau der nächsten Rechnung derselben Baustelle und ist danach
  weg (`InvoicesView.tsx:4955–4972`) — nach der Schlussrechnung gibt es keine nächste.
- Auswirkung: (1) Anzahlung 5.000 € bezahlt, Leistung am Ende 4.200 €: die Schlussrechnung lässt
  sich nicht anlegen, die Meldung nennt keinen Weg. Einen gibt es: Anzahlungsrechnung „stornieren
  und neu ausstellen“ über 4.200 €, Guthaben umbuchen, Rest zurückzahlen — das steht nirgends.
  (2) Nach bezahlter Rechnung über 30.000 € gibt der Monteur eine Pumpe um 400 € zurück: Storno
  und Neuausstellung der ganzen Rechnung samt Stornorechnung, zwei Nummern, Umbuchung — oder das
  Büro schreibt die Gutschrift außerhalb der App, dann fehlt sie in Ausgangsbuch und Stapel.
- Vorschlag in zwei Stufen. Sofort (klein): die Meldung bei „Abzüge übersteigen die
  Gesamtleistung“ nennt den Weg oben in drei Schritten mit Sprung zur Anzahlungsrechnung; eine
  angenommene Retoure auf schon verrechnete Ware erzeugt eine Zeile für Buchhaltung und Spitze
  („Rückgabe nach Rechnung … — Gutschrift klären“) auf der Startseite und im Fenster der Rechnung,
  bis sie als geklärt vermerkt ist. Danach (groß, Entscheidung nötig): die **Rechnungskorrektur**
  als eigener Beleg aus dem Rechnungskreis — Bezug auf die Rechnung, Positionen mit dem Betrag der
  Minderung, dieselbe Steuerbehandlung, mindert Forderung und Ausgangsbuch, im Stapel mit
  vertauschten Konten; entsteht daraus ein Guthaben, greifen Rückzahlung und Umbuchung, die es
  schon gibt. Vorbehalt: das ist ein neuer Belegtyp mit Folgen in Zahlstand, Mahnlauf, PDF,
  E-Rechnung, Nachkalkulation und beiden Exporten; Storno und Neuausstellung bleiben daneben
  bestehen. Prüfungen der ersten Stufe: Ansichtstest für die Meldung, Datenbankprüfung für die
  Zeile nach `retoure_annehmen`. Gleich bleiben muss: der Hinweis in der Vorschau, die Abweisung
  der negativen Schlussrechnung.
- Aufwand: klein (Stufe 1), groß (Stufe 2)

### G-11 Zahlungsziel, Skonto und Nachlass gibt es nur je Betrieb oder je Rechnung, nicht je Kunde
- Art: Lücke (Daten müssen bei jeder Rechnung neu eingegeben werden)
- Schwere: mittel — Hausverwaltung mit 30 Tagen, Bauträger mit 3 % Skonto und Stammkunde mit
  Nachlass sind in fast jedem Betrieb vereinbart; vergessen heißt falscher, eingefrorener Beleg.
- Beleg: Der Kunde trägt keine Konditionen (`src/types/index.ts`, `Customer`); die Rechnung
  beginnt immer mit `betriebsKonditionen(company.rates)` (`InvoicesView.tsx:750`), abweichen lässt
  sich nur von Hand unter „Konditionen für diese Rechnung“.
- Vorschlag: Am Kunden optional „Zahlungsziel (Tage)“, „Skonto (%/Tage)“ und „Nachlass (%, mit
  Bezeichnung)“ (Spalten in `customers`, in `kunde_umbenennen` und der Kundenakte, Felder der
  Kundenzusammenführung ergänzen). `vorschauUebernehmen` belegt Konditionen und Rabatt aus dem
  Kunden der Baustelle vor; die Zeile „Zahlung“ der Vorschau sagt „laut Kunde“ (wie heute
  „abweichend“). Das Angebot nimmt den Nachlass genauso. Prüfungen: `konditionen.test.ts`
  (Reihenfolge Rechnung > Kunde > Betrieb), Ansichtstest, Datenbankprüfung, die jedes neue Feld
  einmal schreibt und zurückliest (das Muster aus A2). Gleich bleiben muss: Kunden ohne Angaben
  rechnen wie heute; G-2 gilt weiter (Wechsel der Baustelle setzt auf Kunde bzw. Betrieb zurück).
  Risiko: die Vorbelegung überschreibt eine schon von Hand geänderte Angabe — deshalb nur beim
  Wechsel der Baustelle, nie beim Neu-Zusammenstellen.
- Aufwand: mittel

### G-12 Das Schema der Rechnungsnummer ist fest: Vorsatz, Jahr, laufende Nummer ab 1001 in jedem Jahr
- Art: Grenze (unbenannt); Vorgängerpapier „Jahreskreis ab 1001 fest“
- Schwere: niedrig bis mittel — trifft Betriebe beim Umstieg: wer bisher durchlaufend oder ab 1
  zählt, kann nur die allererste Nummer wählen, ab dem nächsten Jänner gilt 1001.
- Beleg: `20261106400000_angebot_annahme_link.sql:104–127` (eigene Nummer nur vor der ersten
  Rechnung, sonst 1001), `20261116050900…:163–166` und `src/lib/praefixe.ts:125–128` (Form fest),
  Einstellungen nur mit Vorsatz (`SettingsView.tsx:1240–1288`).
- Vorschlag: Zwei Einstellungen je Betrieb unter „Nummern“: „Beginn je Jahr“ (Vorgabe 1001) und
  „Jahr in der Nummer / durchlaufend über die Jahre“. `naechste_nummer_kern` liest den Beginn;
  bei „durchlaufend“ zählt ein Kreis ohne Jahr (Zähler mit Jahr 0), die Form der Nummer baut
  weiter die Datenbank. Lückenprüfung (`findeLuecken`) und Vorschlag (`nextInvoiceNumber`) lesen
  dieselbe Einstellung. Umgestellt werden darf nur zum Jahreswechsel bzw. solange im neuen Kreis
  noch keine Rechnung steht. Prüfungen: `nummernkreisNurMitBeleg`/`regeln` (Beginn 1, durchlaufend
  über den Jahreswechsel), `buchhaltungExport` (keine falsche Lücke). Gleich bleiben muss: ohne
  Einstellung jede Nummer wie heute (eigener Test über den Jahreswechsel). Risiko: der
  Rechnungskreis ist der empfindlichste Teil — nur bauen, wenn ein Betrieb es braucht; sonst die
  Grenze mit Grund benennen (fachlich: ein Schema für alle hält Export und Prüfung einfach).
- Aufwand: mittel

### G-13 Die Übergabe an die Steuerberatung setzt doppelte Buchführung mit Sollbesteuerung und BMD voraus
- Art: Grenze (unbenannt), Annahme über „den“ Betrieb
- Schwere: mittel für kleine Betriebe — Einzelunternehmen unter der Buchführungsgrenze sind in
  der Regel Einnahmen-Ausgaben-Rechner und versteuern nach vereinnahmten Entgelten; für sie ist
  der Rechnungsstapel „Debitoren an Erlös“ nicht verwendbar, und die Umsatzsteuer gehört zum
  Zahlungstag.
- Beleg: `bmdExport.ts` kennt nur Debitoren, Erlös, Anzahlung, Bank, Skonto, Mahnkosten; der
  Zahlungsstapel trägt keine Steuer je Eingang (`:532–541`); das Ausgangsbuch nennt „Bezahlt“ als
  Summe ohne Datum (`buchhaltungExport.ts:293`). Benannt ist nur, dass der Stapel bis zum
  Importtest vorgebaut ist (`grenzen-durchsicht…:109`).
- Vorschlag: Zuerst entscheiden lassen (Frage an Pilotbetrieb und Kanzlei: welche Betriebe sollen
  bedient werden?). Bauweise, falls ja: Einstellung „Gewinnermittlung: Bilanz / Einnahmen-
  Ausgaben“; für die zweite ein Export „Zahlungseingänge mit Steuer“ (je Eingang Datum, Rechnung,
  Kunde, Betrag, Steuersatz der Rechnung, Netto- und Steueranteil nach `cent`, Skonto als
  Minderung, Rückzahlung negativ, Umbuchung ohne Geldfluss) — aus den Daten, die es schon gibt.
  Prüfung: neue Einheitstests mit Teilzahlung, Skonto, Rückzahlung, Reverse Charge. Gleich bleiben
  muss: die drei bestehenden Exporte unverändert. Risiko: gering, weil zusätzlich; der Nutzen ist
  ohne Rückmeldung einer Kanzlei unsicher — deshalb als Entscheidung, nicht als Auftrag.
- Aufwand: mittel

### G-14 Eine Rechnung trägt genau einen Steuersatz, und der Abzug einer Anzahlung prüft nur „Übergang der Steuerschuld“, nicht den Satz
- Art: Grenze (unbenannt) und fehlende Prüfung
- Schwere: niedrig — beim Installateur ist fast alles 20 %; der Fall entsteht, wenn zwischen
  Anzahlung und Schlussrechnung der Satz wechselt (Kleinunternehmer überschreitet die Grenze;
  „USt-Satz für diese Rechnung“ nur auf einer der beiden gesetzt).
- Beleg: ein `vatRate` je Rechnung (`totals.ts:119–142`); `nachSteuer` vergleicht nur
  `reverseCharge` (`vorrechnungen.ts:117–126`), `app.vorrechnungen_pruefen` ebenso
  (`20261110160000…:138`).
- Auswirkung: Anzahlung mit 0 % (Kleinunternehmer), Schlussrechnung mit 20 %: abgezogen werden
  0 € Steuer, die Restforderung weist 20 % der ganzen Leistung auf 70 % des Netto aus; der
  Buchungsstapel bucht den Rest brutto mit Steuercode 20 % und rechnet daraus eine andere Steuer
  als der Beleg.
- Vorschlag: In `nachSteuer` und im Auslöser zusätzlich den Steuersatz vergleichen; eine Anzahlung
  mit anderem Satz wird wie heute bei anderer Steuerbehandlung benannt statt angeboten („gehört
  mit der Kanzlei berichtigt“). Prüfung: `vorrechnungen.test.ts` und Datenbankprüfung (vorher
  angelegt, nachher abgewiesen), Gegenstück mit gleichem Satz. Gleich bleiben muss: alle Abzüge
  mit gleichem Satz. Risiko: ein Betrieb mit genau diesem Fall kann die Schlussrechnung erst nach
  Berichtigung der Anzahlung stellen — das ist die richtige Folge, muss aber in der Meldung
  stehen. Mehrere Sätze auf einer Rechnung: nicht vorgeschlagen (kein belegter Bedarf); als Grenze
  mit Grund „fachlich“ in die Übersicht aufnehmen.
- Aufwand: klein

### G-15 Die Nachkalkulation sieht nur die 300 jüngsten Baustellen und rechnet alte Stunden mit dem heutigen Kostensatz
- Art: Grenze (die 300 sind unbenannt) und Unstimmigkeit
- Schwere: niedrig — ab etwa 300 Baustellen (ein Betrieb mit vielen Kleinaufträgen erreicht das in
  einem Jahr) fehlen ältere ohne Hinweis; nach jeder Lohnerhöhung ändert sich der Deckungsbeitrag
  abgeschlossener Baustellen rückwirkend.
- Beleg: `NachkalkulationView.tsx:78` (`listRecentProjects(companyId, 300)`; benannt sind nur die
  25 je Lauf, `:27`, `:277`); Kostensätze als eine Zeile je Betrieb ohne „gültig ab“
  (`src/lib/db/pg/kosten.ts:35–37`), angewandt auf alle Stunden (`nachkalkulation.ts:159–160`). Beim
  Material hält die Ausgabe den Einkaufspreis seit M8 fest — bei der Arbeit nicht.
- Vorschlag: (a) Baustellen der Nachkalkulation über die Suche und die Statusgruppen der
  Baustellenliste (`baustellen_liste`, seit Welle 4) statt über „die jüngsten 300“. (b)
  Kostensätze mit „gültig ab“ (Verlauf wie bei der Arbeitszeit aus Z3: bestehender Satz „gültig ab
  Beginn“, nichts wird umgeschrieben); jede Stunde rechnet mit dem Satz ihres Tages. Prüfungen:
  `nachkalkulation.test.ts` (Stunden vor und nach dem Wechsel), Ansichtstest (Baustelle jenseits
  der 300 ist wählbar). Gleich bleiben muss: ein Betrieb mit einem einzigen Satz rechnet auf den
  Cent wie heute. Risiko: die Nachkalkulation lädt Sätze je Tag — die Rechnung bleibt im Browser,
  die Menge ist klein.
- Aufwand: mittel

### G-16 Die Datenbank nimmt die Summen einer Rechnung, wie die App sie schickt — ohne sie gegen die Positionen zu rechnen
- Art: fehlende Prüfung an riskanter Stelle
- Schwere: niedrig bis mittel — heute stimmen App und Beleg; ein Rechenfehler in einer künftigen
  Fassung, ein Gerät mit altem Stand (alte Rundung vor G7) oder ein direkter Aufruf schreibt einen
  eingefrorenen Beleg, dessen Kopf nicht zu seinen Zeilen passt.
- Beleg: `rechnung_anlegen` prüft nur „mehr als null“, Steuerbefreiung, Skonto, Rücklass
  (`20261116050400…:68–145`) und übernimmt `subtotal_netto`, `discount_amount`, `total_netto`,
  `total_vat`, `total_brutto` sowie `netto` je Zeile ungeprüft (`:150–193`); der Abzug wird
  nachgerechnet (`app.vorrechnungen_pruefen`), die Grundsummen nicht. Kein Auslöser auf `invoices`
  oder `invoice_lines` rechnet nach (Liste der Auslöser durchgesehen).
- Vorschlag: Am Ende von `rechnung_anlegen` nachrechnen, je mit einem Cent Spielraum: Summe der
  Zeilen mit `art = 'position'` = `subtotal_netto`; je Zeile `netto` = gerundet(Menge × Preis ×
  (1 − Rabatt)); `subtotal_netto − discount_amount` = Gesamt-Netto (bei Abzug `gesamt_netto`,
  sonst `total_netto`); Steuer = gerundet(Netto × Satz), bei Übergang der Steuerschuld null;
  Brutto = Netto + Steuer. Abweichung → „Die Summen passen nicht zu den Positionen — bitte neu
  zusammenstellen“, nichts angelegt, keine Nummer verbraucht (dieselbe Transaktion). Prüfung:
  Datenbankprüfung mit je einer verfälschten Größe (vorher angelegt, nachher abgewiesen) und ein
  Lauf über die Grenzfälle aus `geldRundung` (Halbcent), der zeigt, dass richtige Rechnungen der
  App durchgehen. Gleich bleiben muss: jede Rechnung, die die heutige App stellt; der
  Dienstschlüssel (Rücklauf einer Sicherung) ist ausgenommen. Risiko: der eine Cent Spielraum muss
  die alte Rundung noch nicht neu geladener Geräte decken — vor dem Einbau mit `rundungBisher.ts`
  gegenrechnen; sonst weist die Prüfung richtige Rechnungen ab.
- Aufwand: klein bis mittel

### G-17 Die Prüfsumme des Mail-Anhangs lässt sich aus dem Beleg nie wieder herstellen
- Art: Unstimmigkeit (Begründung einer benannten Grenze trägt nicht)
- Schwere: niedrig — niemand rechnet heute nach; die Aussage steht aber als Grund dafür da, dass
  das versendete PDF nicht gespeichert wird.
- Beleg: `docs/grenzen-durchsicht-2026-10-24.md:850–854` („das PDF entsteht aus dem Beleg
  jederzeit gleich, die Prüfsumme belegt den Stand“). jsPDF setzt bei jedem Erzeugen das
  Erstellungsdatum auf jetzt und eine zufällige Dateikennung
  (`node_modules/jspdf/dist/jspdf.node.js:4113–4114`); die App setzt beides nirgends (`grep`
  über `src` nach `setCreationDate`, `setFileId`: kein Treffer). Zwei Abrufe derselben Rechnung
  haben also verschiedene Prüfsummen.
- Vorschlag: In den PDF-Erzeugern der Belege (`pdf.ts`, `nachdruck.ts`, `mahnungPdf.ts`,
  `stornoPdf.ts`, Angebot) Erstellungsdatum = Belegdatum und Dateikennung aus der Kennung des
  Belegs setzen. Dann ist das PDF eines Belegs bei gleicher App-Fassung bitgleich, und die
  Prüfsumme im Versandprotokoll lässt sich nachrechnen. Die Grenze wird ehrlich formuliert: gleich
  nur, solange sich die Gestaltung nicht ändert. Prüfung: Einheitstest, der dieselbe Rechnung
  zweimal mit Abstand erzeugt und die Prüfsummen vergleicht (vorher verschieden). Gleich bleiben
  muss: Inhalt und Aussehen der Belege (bestehende PDF-Prüfungen). Risiko: keines für den Ablauf.
- Aufwand: klein

## 3. Verdacht (nicht zu Ende geprüft)

- **V-1 Anzahlungsrechnung im Rechnungsstapel mit Steuercode am Rechnungsdatum**
  (`bmdExport.ts:314–331`, Konto in `:320`). Die Umsatzsteuer einer Anzahlung entsteht mit der Vereinnahmung, nicht
  mit der Rechnung; gebucht am Rechnungstag stünde sie zu früh in der Voranmeldung, bei nie
  bezahlter Anzahlung bis zum Storno zu Unrecht. Es fehlt: die Auskunft der Kanzlei, wie sie
  Anzahlungsrechnungen übernimmt (gehört zum offenen Importtest, `grenzen-durchsicht…:109`).
- **V-2 Entfernte Stundenposition sperrt ihre Buchungen trotzdem** (`InvoicesView.tsx:1601–1605`,
  `linkedEntries` bleibt; Vorgängerpapier V3). Ob das gewollt ist (Kulanz), steht nirgends; der
  Leistungsnachweis listet die Stunden weiter. Es fehlt: die fachliche Entscheidung.
- **V-3 Kontoauszug lädt je gemahnter Rechnung eine eigene Abfrage** (`KontoauszugView.tsx:118–121`).
  Bei vielen gemahnten offenen Rechnungen gehen entsprechend viele Anfragen gleichzeitig hinaus.
  Nicht gemessen.
- **V-4 `rechnung_ersetzen` läuft mit den Rechten des Eigentümers** (`security definer`,
  `20261116050700`) und ruft `rechnung_stornieren` und `rechnung_ausstellen`, die sonst mit den
  Rechten des Aufrufers laufen. Gelesen: Rolle wird vorab geprüft, und alle Schreibzugriffe darin
  filtern ausdrücklich auf den Betrieb. Nicht geprüft: ob eine Regel, die sonst der Zeilenschutz
  trägt (etwa beim Einfügen in `invoice_coverage` oder beim Kundenbezug), auf diesem Weg entfällt.
  Es fehlt: eine Datenbankprüfung „Ersetzen mit fremder Kunden- oder Belegkennung wird abgewiesen“.
- **V-5 E98 (zugeklappte Karten „Nicht verrechnet“ und „Mahnlauf“)**: im Code keine Auffälligkeit;
  nicht im Browser angesehen, ob die Summenzeile im zugeklappten Zustand „braucht eine
  Entscheidung“ auf allen drei Breiten zeigt.
- **V-6 Mahnspesen der Startseite**: die Edge Function rechnet „Unternehmer“ nur über die UID auf
  der Rechnung (`shared/forderungen.ts:525`), die Rechnungsseite auch über die Kundenart
  (`InvoicesView.tsx:2626–2628`). Die Startseite zeigt die Spesen derzeit nicht an; sobald sie es
  tut, weichen die Zahlen ab.

## 4. Benannte Grenzen, neu bewertet

| Grenze (Fundstelle im Grenzen-Dokument) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Bestehende Schlussrechnungen mit Rest 0 bleiben „Offen“ (Paket 6, G4) | Altdaten | Ja — aber der Betrieb kann sie selbst nicht schließen: ein Eingang über null ist verboten | Handgriff „Zahlstand neu rechnen“ an der Rechnung (ruft `app.zahlstand_setzen` für diese eine, vom Betrieb ausgelöst — keine Migration über Produktionsdaten); klein |
| Ältere Rechnungen ohne gespeicherten Leistungsnachweis (G6) | Altdaten | Ja | bleibt |
| Ältere Stornorechnungen ohne festgehaltenen bezahlten Betrag (G8) | Altdaten | Ja | bleibt |
| Mahnungen ohne festgehaltene Forderung werden wie bisher verbucht (G3) | Altdaten | Ja | bleibt |
| Kein abweichendes Rechnungsdatum in der Oberfläche (G5) | rechtlich | Ja. Die Folge ist aber unbenannt: ein Gerät mit anderer Zeitzone oder Uhr kann gar nicht ausstellen (`InvoicesView.tsx:2347`, Abweisung in `rechnung_ausstellen`) | Die App schickt kein Datum mehr; Rechnungsdatum und Zahlungsziel kommen aus der Antwort der Datenbank und gehen so aufs PDF; klein bis mittel |
| Umbuchungszeile Debitoren an Debitoren (V7) | liegt bei der Kanzlei | Ja, solange der Importtest aussteht | Im Importtest mitklären (siehe „BMD-Stapel vorgebaut“) |
| Altes Gerät schreibt Umbuchungen als Bankzeilen (V7) | liegt beim Gerät | Ja, erledigt sich mit dem Neuladen | bleibt |
| Angebots- und Baustellennummern ohne Lückenlosigkeit (G11) | fachlich | Ja | bleibt |
| Mahnkosten einer Mahnung vor dem 10.10.2026 nur bis zu den Mahnspesen (E70 Nachtrag) | Altdaten | Ja | bleibt |
| Anzahlungskonto ohne Steuersatz gilt für 20 % (E70 Nachtrag) | Altdaten | Ja | bleibt |
| BMD-Stapel vorgebaut bis zum Importtest; Spaltennamen ungeprüft (X, offene Punkte C4, D7; `bmdExport.ts:91–97`) | liegt bei der Kanzlei | Ja — aber seit September offen; ohne den Test ist der ganze Ablauf „Export an die Steuerberatung“ nicht von Anfang bis Ende belegt (Grundsatz 1) | Vom Auftraggeber einen Termin mit der Kanzlei des Pilotbetriebs einfordern; dabei G-4, G-13 und V-1 klären |
| Eine Gutschrift an den Kunden ist ein Hinweis; keine negativen Positionen (Paket 7, M7) | „fachlich und rechtlich: Berichtigung über Storno und neue Rechnung“ | Nur zum Teil: der Weg ist vollständig, aber der Hinweis verschwindet nach der Schlussrechnung, und der Text im Formular sagt „noch nicht“ | G-10 |
| Liegenschaften: keine abweichende Rechnungsanschrift; „Sammelrechnung kommt mit M13“ (B) | fachlich, mit Verweis auf ein späteres Paket | Der Verweis auf später ist kein Grund | Als offene Lücke führen und entscheiden lassen: Rechnungsempfänger abweichend vom Kunden der Baustelle (Hausverwaltung, Versicherung) und Sammelrechnung über mehrere Baustellen |
| Kundenakte und Baustellenakte: Zahlung, Mahnung, Storno nur über „In Rechnungen bearbeiten“ (B) | Sicherheit der Daten | Ja | bleibt |
| Senklot ist keine Registrierkasse (Stand 11.1) | eigenes Produkt, rechtlich | Ja | bleibt; siehe aber G-4 (Bar im Zahlungsstapel) |
| Secrets `SMTP_*`, gesperrte Ports, Rückläufer beim Betreiber (Paket 11b, F16) | liegt beim Betreiber bzw. bei Supabase | Ja | bleibt |
| Text und PDF einer Mail werden nicht gespeichert (F16) | Datenschutz und „das PDF entsteht jederzeit gleich“ | Datenschutz ja; die zweite Hälfte stimmt nicht (G-17) | G-17, Text der Grenze berichtigen |
| Ohne Antwortadresse keine Mail; Grenzen gegen Mailflut; Support sendet nicht (F16) | Datenschutz, Sicherheit | Ja | bleibt |
| Dieselbe Bewegung aus zwei Formaten wird nicht immer erkannt (F13) | fachlich, abgefangen über Rechnung/Tag/Betrag | Ja | bleibt |
| Fremdwährung wird nicht abgeglichen (F13) | fachlich | Ja | bleibt |
| Vorgemerkte Umsätze und Rückbuchungen nur gezählt (F13) | fachlich | Ja für Vorgemerktes. Eine Rücklastschrift zu einem schon verbuchten Eingang ist aber ein Rechnungsvorgang | Idee in Abschnitt 5 (Rücklastschrift als negativer Eingang vorschlagen) |
| Abbuchungen ohne Rechnungsbezug nur gezählt (F13) | fachlich, Steuerberatung | Ja | bleibt |
| Nur die jüngste Mahnung per Mail; keine nach Bezahlung oder Storno; Senden setzt die Stufe nicht (F16) | fachlich | Ja | bleibt; nach G-7 gilt „jüngste nicht zurückgenommene“ |
| Unverrechnete Stunden mit den Sätzen des Betriebs (T-20) | fachlich | Ja; mit G-11 wären es die des Kunden | mit G-11 nachziehen |

## 5. Zusammenspiel und Ideen

1. **Nach dem Ausstellen gleich senden.** Die Meldung „Rechnung … erstellt“
   (`InvoicesView.tsx:2545–2547`) trägt keinen nächsten Schritt, obwohl der Maildialog da ist; nach
   der Mahnung gibt es ihn (`:2761`). Handlung „Per Mail senden“ in der Meldung, Empfänger aus dem
   Kunden. Nutzen: ein Tipp statt Suche in der Liste. Aufwand klein. Gleich bleibt: das PDF lädt
   weiter von selbst.
2. **Zahlschein-Code auf Rechnung und Mahnung** (EPC-QR, „Zahlen mit Code“: IBAN, Empfänger,
   Betrag, Verwendungszweck = Rechnungsnummer). Der Kunde scannt in der Bank-App; der Zweck kommt
   fehlerfrei zurück, und der Kontoauszug-Abgleich trifft über den Vorsatz (Stufe 2) — das nimmt
   G-1 den Boden. Vorbehalt: braucht einen QR-Erzeuger (eigener kleiner Baustein oder
   Bibliothek; die Grenzen-Übersicht hat beim Annahme-Link deshalb verzichtet). Bei Rücklass und
   Skonto steht der Zahlbetrag ohne Skonto im Code. Aufwand mittel.
3. **Konditionen je Kunde** — siehe G-11.
4. **Mahnen und senden in einem Zug.** Im Mahnlauf je Zeile „Mahnung erzeugen und per Mail
   senden“ und danach „weiter zur nächsten“; heute sind es Erzeugen, Meldung, Maildialog, zurück
   zur Karte. Jede Mahnung bleibt ein bewusster Griff. Aufwand klein bis mittel.
5. **Rücklastschrift aus dem Kontoauszug.** Passt eine Rückbuchung (Betrag, Name, Tage danach) zu
   einem verbuchten Eingang, sie als negativen Eingang auf dieselbe Rechnung vorschlagen („Bitte
   prüfen“), statt sie nur zu zählen. Nutzen: die Rechnung wird wieder offen, der Mahnlauf sieht
   sie. Aufwand mittel. Vorbehalt: Formate kennzeichnen Rückbuchungen verschieden.
6. **Nach dem Verbuchen des Kontoauszugs der Anstoß zum Abschließen.** Der Zahlungsdialog bietet
   nach bezahlter Schlussrechnung „Baustelle abschließen“ an (`InvoicesView.tsx:1480–1492`), der
   Kontoauszug nicht. Eine Zeile „Damit bezahlt: … — Baustelle abschließen“ nach dem Verbuchen.
   Aufwand klein.
7. **Offene Posten je Kunde als Schreiben.** In der Kundenakte „Offene Posten senden“: Liste der
   offenen Rechnungen mit Rest und Fälligkeit als PDF und per Mail (Saldenabstimmung mit
   Hausverwaltungen). Daten und Maildialog sind da. Aufwand mittel.
8. **Abweichender Rechnungsempfänger und Sammelrechnung** (Hausverwaltung, Versicherung,
   Bauträger) — in Abschnitt 4 als offene Lücke; großer Nutzen für Betriebe mit Liegenschaften,
   Aufwand groß, Entscheidung nötig.
9. **Ausgestelltes PDF ablegen statt neu erzeugen.** Heute entsteht jede Kopie aus den Daten mit
   der aktuellen Gestaltung der App; nach einer Änderung der Gestaltung sieht die Kopie anders aus
   als das Original beim Kunden. Ablage des Originals im Speicher des Betriebs beim Ausstellen
   (mit Prüfsumme) machte Nachdruck, Belegarchiv und Mail bitgleich. Vorbehalt: Speicherbedarf,
   Aufbewahrung und Löschung; unsicherer Nutzen, solange die Daten vollständig eingefroren sind —
   als Idee. G-17 ist der kleine Schritt in dieselbe Richtung.

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| G1 Konditionen zurück auf den Betrieb; Zeile „Zahlung“ in der Vorschau | `InvoicesView.tsx:742–765`, `:2097–2101`, `:3077–3089` | hält für Sätze, Zahlungsziel, Skonto, USt-Satz; **nicht** für Rabatt, Bauleistung, Rücklass, Art (G-2) |
| G2 Erstellungsversuch mit Kennung | `rechnung_ausstellen` (`20261116050900…:130–150`), `confirmInvoice` `:2404`, `:2577–2580` | hält |
| G3 Mahnforderung als ein Modell | `mahnung.ts:136–150`, `mahnung_festhalten` (`20261116050600`) prüft Kosten und Summe | hält |
| G4 Schlussrechnung mit Rest 0 gilt als bezahlt | `app.zahlstand_setzen`, Auslöser `invoices_ohne_rest_beglichen` (`20261116050100`) | hält |
| G5 Datum und Jahr vom Server | `rechnung_ausstellen` (`:154–160`), `mahnung_festhalten` | hält |
| G7 eine Rundung für Geld | `shared/forderungen.ts:64–99`, `totals.ts:68–74`, `skonto.ts`, `ruecklass.ts` | hält |
| G8 Stornotext fest, Skonto kein Erlös, Lücke an der Zeitraumgrenze | `stornoPdf.ts:159`, `nachkalkulation.ts:205–219`, `buchhaltungExport.ts:386–405` | hält |
| G9 Zahlstand sperrt die Rechnung | `app.zahlstand_setzen` (`for update`), `kontoauszug_verbuchen`, `guthaben_umbuchen` | hält |
| G11 Rechnungsnummer nur mit Beleg | `naechste_nummer` weist `invoices` ab, `app.rechnungsnummer_ziehen` | hält |
| V7 Guthaben umbuchen | `guthaben_umbuchen`, Auslöser `umbuchung_zusammen`, `bmdExport.ts:483–494` | hält |

## 7. Nicht angesehen

- Gestaltung und Inhalt der PDFs im Einzelnen (`pdf.ts`, `mahnungPdf.ts`, `stornoPdf.ts`,
  `belegLayout.ts`, `pdfBriefkopf.ts`) — nur die Stellen, an denen Zahlen entstehen; die
  Pflichtangaben nach § 11 UStG nur über die Sperren im Formular und in der Datenbank
  (Empfänger, UID, Leistungszeitraum, Steuerbefreiung), nicht am gedruckten Blatt.
- E-Rechnung: nur die Prüfliste in `ebinterface.ts`, nicht der XML-Schreiber und nicht gegen
  e-Rechnung.gv.at.
- `belegArchiv.ts`, `scheinAbgleich.ts`, `scheinHinweise.ts`, `materialPositionen.ts`,
  `ausgegebenesMaterial.ts`, `wartungPosition.ts`, `assemble.ts` im Einzelnen; `RechnungDetail.tsx`,
  `RechnungenLesen.tsx`, `EbInterfaceDialog.tsx`, `BankgarantieDialog.tsx`.
- `shared/smtp.ts`, `shared/iban.ts`, `BelegMailDialog.tsx`, `beleg_versand_vorbereiten` im
  Einzelnen (Rate-Limits nur gelesen, nicht nachgerechnet).
- `src/features/settings`: nur Kontenrahmen (Zwecke), Nummern (Beispiel und Beginn) und die
  Rechnungsvorgaben, soweit sie in die Rechnung fließen; die Masken und ihre Prüfungen nicht
  einzeln.
- Zeilenschutz der neuen Tabellen `bank_buchungen` und `beleg_versand`, Datenauskunft und
  Personenlöschung dazu — nicht geprüft.
- Kein Lauf gegen einen Datenbankstapel, kein Browser, keine Gleichzeitigkeit nachgestellt: G-5
  und G-6 sind aus dem Code gelesen, nicht nachgestellt.
- Angebotsseite, Wartungen und Handwerksscheine nur, soweit sie in die Rechnung münden.
