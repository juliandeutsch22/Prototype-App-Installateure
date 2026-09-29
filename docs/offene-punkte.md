# Offene Punkte

Stand 29.09.2026. Alles, was bewusst nicht umgesetzt ist, an einem Ort:
aus dem Design-Durchgang (`docs/design/fortschritt.md`), aus dem Prüflauf
mit vier unabhängigen Prüfern (`docs/pruefung-2026-09-25.md`) und aus den
Lücken, die die Prüfer neben den Fehlern gemeldet haben.

Jeder Punkt hat einen Grund, warum er offen ist, und einen Vorschlag. Was
eine Entscheidung braucht, ist als solche markiert. Wird ein Punkt erledigt,
wandert er hier heraus und in die jeweilige Doku.

## A. Braucht eine fachliche Entscheidung

| # | Punkt | Warum offen | Vorschlag |
|---|---|---|---|
| A3 | **DATANORM-Preiskennzeichen** vermutlich vertauscht (0 = Liste, 1 = Netto; laut Norm eher 1 = Brutto, 2 = Netto) (P2-17) | Verdacht, nicht belegt — eine echte Datei des Großhändlers kommt vom Betrieb (28.09.2026) | Mit einer echten Datei des Großhändlers prüfen; Abgleich außerdem je Lieferant statt nur über die Artikelnummer |
| A8 | **Datenschutzerklärung siezt** (12 Stellen) | Rechtstext, inhaltlich nicht verändert — bleibt vorerst so, der Betrieb überarbeitet die Rechtstexte selbst (28.09.2026) | So lassen oder vom Juristen umformulieren lassen |

**Entschieden und umgesetzt am 28.09.2026:** A1 (die Umbuchung der Anzahlung
geht, wie sie gebucht wurde — netto ohne Steuercode, wenn das Anzahlungskonto
einen trägt; die Steuer steht nicht mehr doppelt in der Voranmeldung. Den
ersten Stapel trotzdem mit der Kanzlei abgleichen), A2 (Grund der
Steuerbefreiung bei 0 % ohne Reverse Charge: Pflicht, gedruckt, eingefroren),
A4 (eine eigene Krankmeldung reicht 14 Tage zurück, davor trägt das Büro
ein), A5 (Wochenplan für alle ab Werk an; der Schalter bleibt), A6 (das
Kommentarfeld sagt, dass es am Schein vorgeschlagen wird), A7 (bleibt als
bewusste Ausnahme, dokumentiert in `docs/design/linie.md`).

## B. Größerer Umbau, eigener Auftrag

| # | Punkt | Warum offen | Vorschlag |
|---|---|---|---|
| B7 | **Gutschrift, Skonto, Verzugszinsen** fehlen; ein Storno ist nur eine Statusänderung ohne Beleg für den Kunden | Neue Funktionen | Eigener Auftrag |
| B8 | **DSGVO-Löschung (Art. 17) je Person** fehlt. Die Auskunft (Art. 15) gibt es seit 29.09.2026 (siehe unten) | Aufbewahrungspflichten (§ 132 BAO, sieben Jahre) stehen gegen sofortiges Löschen; was wann gehen darf, muss je Tabelle entschieden sein | Löschen, was nicht aufbewahrt werden muss; der Rest gesperrt bis zum Fristende, danach anonymisiert — mit Probelauf |
| B10 | **„Pro Element genau eine Klasse“** gilt nur für die Bausteine; das übrige Markup ist Tailwind | Umschreiben wäre eine Formatierungswelle über rund 56 000 Zeilen | Ansicht für Ansicht, wenn sie ohnehin angefasst wird |

## C. Absicherungen und Tests, die fehlen

| # | Punkt | Vorschlag |
|---|---|---|
| C4 | BMD-Spaltennamen („Sollkonto;Habenkonto;…“) sind nicht gegen eine Importdefinition geprüft | **Dokumentiert** (28.09.2026) in `FUNKTIONEN.md` und am Kopf in `bmdExport.ts`; der Abgleich selbst braucht eine Beispieldatei der Kanzlei |
| C11 | Vorschau-Werkzeug: Stubs für Scheinentwurf, Rechnungssuche, Datanorm-Import und Ausgangsfach fehlten; `messen.mjs` und README nannten `section-label` | **Erledigt** (26.09.2026): Werkzeug eingecheckt (`tools/vorschau/`, `npm run vorschau`), feste Formen in `stubs-erzeugen.mjs` und `tools/vorschau/fest/`, Ausnahme auf `titel-karte` |
| C12 | `npm test` führt die Datenbanktests nicht aus; grün sagt nichts über Zeilenregeln und Trigger | Bleibt so (Stack nur in der CI); im Handbuch benannt |

## Erledigt seit dem Prüflauf

**C-Punkte, erledigt am 28.09.2026:** C5 (Gesamtsaldo = Summe der
Monatssalden, `tests/unit/saldoGleichMonate.test.ts`), C6 (Sprunglink „Zum
Inhalt“, Fokus nach Seitenwechsel auf dem Inhalt), C7 (Schein ohne Namen in
einer Zeile stürzt nicht mehr ab), C9 (offline keine Doppelbuchungsprüfung,
`tests/unit/zeitOhneEmpfang.test.ts`), C13 (Durchklick weckt die
Edge Functions vorab). Jeder mit Gegenprobe.

**Ebenfalls am 28.09.2026, in der Datenbank:** C2 (eingeteilt, zugeordnet
und gebucht werden nur Personen des eigenen Betriebs — Auslöser an
Einsätzen, Rüstlisten, Zeitbuchungen und Baustellen,
`tests/supabase/personenImBetrieb.test.ts`), C8 (eine alte Baustellennummer
findet nach dem Umnummern ihre Baustelle, `baustelle_alte_nummern`,
`tests/supabase/alteBaustellennummer.test.ts`), C10 (fehlende Prüfsummen
trägt ein Nachtlauf nach, `tests/supabase/pruefsummeNachtragen.test.ts`).
Jeder mit Gegenprobe.

**Und:** C1 (jeder Link führt dorthin, wo die Rolle hin darf — `npm run
pruefen:links` geht je Rolle durch die Vorschau und läuft in der CI; Regel
in `tests/links/linkziel.ts`, selbst geprüft in `tests/unit/linkziel.test.ts`.
Nicht erfasst: Knöpfe, die erst beim Klick weiterleiten), C3 (die Scheine
einer Baustelle kommen alle, neueste zuerst und in jeder Schreibweise der
Nummer, wie Rechnungen und Zeiten; `tests/supabase/scheineDerBaustelle.test.ts`).

**Ebenfalls am 29.09.2026:** B3 (der Support arbeitet in einem Betrieb zur
Zeit — es gilt der zuletzt begonnene Einblick; eine Rolle aus „Mitarbeiten"
in A öffnet in B nichts mehr; `tests/supabase/supportzugang.test.ts`), B2 (der Support mit „Mitarbeiten" erledigt auch, was die App über den
Server schickt: Einsatz, Rüstliste, Angebot, Angebots- und Baustellennummer,
Kunden- und Katalogübernahme — im Betrieb des aktuellen Einblicks,
`app.arbeitsbetrieb()`; `tests/supabase/supportArbeitetMit.test.ts`).
**Bewusst zu:** alles, was Zeitbuchungen, Urlaube oder Scheinfotos berührt —
Scheine, Rechnungen und Stornos, Baustellennummer ändern, Urlaub,
Krankmeldungen, Betriebsurlaub —, dazu eine Rechnungsnummer (sie würde nie
eine Rechnung und wäre ein Loch in der Folge) und die Datensicherung. Die
Supportleiste nennt genau diese. Und B8, Teil 1: die **Datenauskunft je
Person** (Art. 15) — in der Benutzer- und der Kundenakte lädt die
Geschäftsführung eine Datei mit allem, was zu dieser Person gespeichert ist
(`public.person_auskunft`). Daten anderer Personen bleiben draußen (bei der
Belegschaft steht, was sie für andere bearbeitet hat, nur als Anzahl; beim
Kunden fehlen Monteurkennungen und Monteurunterschrift), Push-Adressen nur
als Zahl; ältere Zeilen ohne Kundenkennung werden über den Namen gefunden,
und die Datei sagt das. Kein Support, keine Buchhaltung, nicht die Person
selbst — die Geschäftsführung gibt sie weiter;
`tests/supabase/datenauskunft.test.ts`, `tests/components/Datenauskunft.test.tsx`.

**Aus B, am 29.09.2026:** B1, Teil 1 (Kostensätze in `betrieb_kostensaetze`,
Einkaufspreise in `material_einkaufspreise` — lesen und schreiben nur
Geschäftsführung und Administration; `material_prices` liest nur, wer
einkauft, also Verwaltung und Führung. Die alten Spalten `companies.cost_rates`
und `materials.einkaufspreis` bleiben als **Einlass**: was dort ankommt — alte
App, Datanorm, alte Sicherung —, legt die Datenbank um, die Spalte bleibt
leer. Kein zweiter Deploy nötig; `tests/supabase/einkaufGeschuetzt.test.ts`)
und Teil 2 (die Anfangsstände der Zeitkonten, `initial_overtime` und
`initial_vacation_days`, in `zeitkonto_anfang` — lesen, wer die Urlaube der
Person liest: sie selbst, Führung, Buchhaltung und Spitze, wer Urlaub
entscheidet; die Kollegen sehen weiter die Namen, aber keine Kontostände.
Einlass je Spalte, damit „kein Anfangsurlaub" als bewusstes Leeren ankommt;
`tests/supabase/zeitkontoAnfang.test.ts`). **Bewusst geblieben:**
`vacations.saldo_bei_antrag` steht an der Urlaubszeile, und die lesen ohnehin
nur dieselben Rollen; wer genehmigt, braucht den Stand. Eine Projektleitung
ohne Genehmigungsrecht sieht ihn mit — wie den Urlaub selbst, den sie zum
Planen braucht.

**Aus B, am 28.09.2026:** B5 (`secure_password_change` an: eine Sitzung,
die älter als ein Tag ist, meldet beim Passwortändern mit dem eben geprüften
Passwort frisch an; im örtlichen Stack an und gegen eine gealterte Sitzung
geprüft, `tests/supabase/anmeldung.test.ts`. **In der Produktion schaltet
ihn das Dashboard** — Schritt 1.4 in `docs/DEPLOYMENT.md`), B4 (kein Einblick ohne Eintrag im Protokoll —
von der Datenbank erzwungen, auch an der App vorbei; die App meldet dazu
wieder jeden Bereich, bevor er lädt, was seit dem Umbau auf die echte App
(#136) entfallen war; `tests/supabase/supportzugang.test.ts`,
`tests/components/EinblickProtokoll.test.tsx`), B6 (die Nacht der Zeitumstellung zählt richtig —
App und Datenbank rechnen mit dem Tag in Wiener Zeit und kommen auf
dieselbe Minute; 17 Fälle in `tests/faelle/zeitumstellung.ts`, gegen beide
geprüft), B9 (ein Betragsformatierer, `src/lib/betrag.ts`, mit einem Namen
je Form; `tests/unit/eurozeichen.test.ts` hält fest, dass keine Kopie
zurückkommt und kein Aufruf ein zweites Zeichen setzt).

**Design „Fassung 3“ (früher B11)** ist in neun Schritten umgesetzt
(#160–#170); was mit Absicht anders als im Entwurf ist, steht mit Grund in
`docs/design/fortschritt.md`.

Alle übrigen Befunde des Prüflaufs (P1–P4) sind behoben und in
`docs/pruefung-2026-09-25.md` beschrieben; die Commits tragen die
Befund-ID (`git log --grep "Prüflauf 25.09.2026"`).
