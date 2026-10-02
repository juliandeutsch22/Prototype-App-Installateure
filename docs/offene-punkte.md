# Offene Punkte

Stand 02.10.2026. Alles, was bewusst nicht umgesetzt ist, an einem Ort:
aus dem Design-Durchgang (`docs/design/fortschritt.md`), aus dem Prüflauf
mit vier unabhängigen Prüfern (`docs/pruefung-2026-09-25.md`), aus den
Lücken, die die Prüfer neben den Fehlern gemeldet haben, und aus dem
Testbericht vom 30.09. samt Nachtest vom 01.10.2026
(`docs/PLAN-TESTBERICHT-2026-09-30.md`; alle Pakete bis PR #215 gemergt).

Jeder Punkt hat einen Grund, warum er offen ist, und einen Vorschlag. Was
eine Entscheidung braucht, ist als solche markiert. Wird ein Punkt erledigt,
wandert er hier heraus und in die jeweilige Doku.

## A. Braucht eine fachliche Entscheidung

| # | Punkt | Warum offen | Vorschlag |
|---|---|---|---|
| A9 | **Was nach Ablauf der sieben Jahre geschieht** — mit Belegen und Zeitaufzeichnungen einer Person, die die Löschung verlangt hat (B8). Die Löschung entfernt heute, was nicht aufbewahrt werden muss, und nennt für den Rest das Fristende; nach Ablauf löscht sie noch nichts | Vor 2031 läuft in diesem Bestand keine Frist ab. Offen ist, ob danach gelöscht oder anonymisiert wird — und was mit dem Namen einer Person auf den Belegen **anderer** geschieht (Schein des Kunden, genehmigter Urlaub, erfasste Zahlung). Laufende Verfahren verlängern die Frist (§ 132 Abs. 1 BAO) | **Beim Betrieb** (29.09.2026: wie empfohlen): mit dem Steuerberater entscheiden; dann denselben Aufruf um den zweiten Schritt erweitern |

**Sicherheitsupdate der Bibliotheken (29.09.2026):** `npm audit --omit=dev`
meldet 0 Befunde (vorher 16, davon einer kritisch). jsPDF 2 → 4 und
jsPDF-AutoTable 3 → 5: alle sieben Belegarten — Rechnung, Storno, Mahnung,
Angebot, Schein, Bestellung, Stundennachweis — vorher und nachher im Browser
erzeugt und Seite für Seite gerendert, elf Seiten pixelgleich. React Router
6 → 7 (die Umleitungslücke ist nur in 7 behoben; alle Links der App sind
absolut, die geänderte Auflösung relativer Pfade trifft keinen), acht
Durchklick-Wege grün. `undici` über `overrides` angehoben, siehe
`UEBERGABE.md`. Die unbenutzte Abhängigkeit `@firebase/rules-unit-testing`
(aus der Firestore-Zeit) ist entfernt. **Nachgezogen am 30.09.2026:** Vite 7,
Vitest 4 und das React-Plugin 5 — `npm audit` meldet damit nichts mehr, auch
nicht für den Entwicklungsserver. Das Bauziel ist auf die Werte von Vite 5
festgeschrieben (`vite.config.ts`), damit ältere iPhones nicht still
herausfallen. Vite 8 mit dem neuen Bündler (Rolldown) ist bewusst nicht
genommen: er ändert das Bündeln selbst, und dafür gibt es keinen Befund.

**Entschieden und umgesetzt am 29.09.2026:** A3 (das DATANORM-Preiskennzeichen
folgt der Norm: 1 = Listenpreis, 2 = Nettopreis, alles andere unbekannt. Der
Leser nahm „1“ als Netto und übernahm damit Listenpreise als Einkaufspreise —
auch aus der Testdatei des Betriebs. Die Migration
`20260929170000_datanorm_preiskennzeichen.sql` rechnet so übernommene Preise
nach: Listenpreis abzüglich Rabattsatz, ohne Satz leer; von Hand geänderte
Einkaufspreise bleiben. `tests/supabase/datanormPreiskennzeichen.test.ts`,
`tests/unit/datanorm.test.ts`), A8 (die Datenschutzerklärung duzt wie die
ganze App und nennt Auskunft und Löschung über die App), und die
**Mahnspesen je Kundenart**: Firmenkunden (mit UID) und Privatkunden haben
eigene Sätze je Stufe — ohne eigene Sätze für Privatkunden gelten die
gemeinsamen weiter —, und an Firmenkunden lässt sich statt der Spesen die
Pauschale von 40 € nach § 458 UGB verrechnen, ab der Mahnung
(`mahnung.ts:mahnkosten`, `tests/unit/mahnung.test.ts`). Und: „Secure password
change" (B5) ist in der Produktion eingeschaltet.

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
| B10 | **„Pro Element genau eine Klasse“** gilt nur für die Bausteine; das übrige Markup ist Tailwind | Umschreiben wäre eine Formatierungswelle über rund 56 000 Zeilen | Ansicht für Ansicht, wenn sie ohnehin angefasst wird |

## C. Absicherungen und Tests, die fehlen

| # | Punkt | Vorschlag |
|---|---|---|
| C4 | BMD-Spaltennamen („Sollkonto;Habenkonto;…“) sind nicht gegen eine Importdefinition geprüft | **Dokumentiert** (28.09.2026) in `FUNKTIONEN.md` und am Kopf in `bmdExport.ts`; der Abgleich selbst braucht eine Beispieldatei der Kanzlei |
| C11 | Vorschau-Werkzeug: Stubs für Scheinentwurf, Rechnungssuche, Datanorm-Import und Ausgangsfach fehlten; `messen.mjs` und README nannten `section-label` | **Erledigt** (26.09.2026): Werkzeug eingecheckt (`tools/vorschau/`, `npm run vorschau`), feste Formen in `stubs-erzeugen.mjs` und `tools/vorschau/fest/`, Ausnahme auf `titel-karte` |
| C14 | **G8** abgeschnittene letzte Zeile der Angebotsliste (Windows, etwa 1.570 × 700 px) | In Chromium auch in Nachbargrößen nicht nachstellbar, nichts geändert; mit Fenstergröße, Browser und Bildschirmfoto wieder aufnehmen |
| C15 | Auf iOS sichert kein Test Push, Startbildschirm und Kamera ab | Seit 01.10. laufen die Monteurswege in WebKit (CI); der Rest bleibt Handprüfung am Gerät |
| C12 | `npm test` führt die Datenbanktests nicht aus; grün sagt nichts über Zeilenregeln und Trigger | Bleibt so (Stack nur in der CI); im Handbuch benannt |

## D. Bestätigungen von außen (Testbericht 30.09.2026)

Gebaut ist nach der eigenen Lesart bzw. vorgebaut; bestätigen muss jemand
anderer. Ändert sich dabei etwas, ist es eine Einstellung oder eine kleine
Anpassung, kein Umbau.

| # | Bei wem | Punkt | Stand im Code |
|---|---|---|---|
| D1 | WKO | **M3** aliquoter Urlaub taggenau, **M35** Nachtzuschlag nur für die Minuten in der Nachtzeit | umgesetzt nach Lesart, Urlaub bleibt änderbarer Vorschlag |
| D2 | WKO | **M22** Mahnspesen an Privatkunden: Warnung ab 40 € (§ 1333 Abs 2 ABGB) | an Unternehmer hart 40 € (§ 458 UGB), an Private nur Warnung |
| D3 | WKO | **KJBG** — Schutzregeln für Jugendliche (Lehrlinge) | nicht gebaut; Einstufung, Sätze und Berufsschule (Punkte 1–4) stehen |
| D4 | Steuerberatung | **H6** Buchung des Stornos: die Stornorechnung trägt das Ausstellungsdatum, gebucht wird der Storno weiter am Stornotag | wandert die Buchung mit, ist es eine Zeile im BMD-Stapel |
| D5 | Steuerberatung | **M26** der vorgeschlagene Kontenrahmen | Hinweis „Vorschlag – mit der Kanzlei abstimmen“ steht |
| D6 | Steuerberatung | **K3** die Lücke im Rechnungskreis des Pilotbetriebs aus der Zeit vor dem 25.09. festhalten | der Kreis läuft seit 25.09. lückenlos |
| D7 | Kanzlei | **H7 / C4** Spaltenköpfe und Steuercodes des BMD-Stapels, Kundennummer, Zahlungsstapel — Importtest an einer Beispieldatei | vorgebaut, unverändert bis zum Test |
| D8 | Anwalt | **K4** Datenschutzerklärung und Impressum freigeben, Angaben in eckigen Klammern ergänzen | Entwurf mit Band „Entwurf“ |

## E. Für später vermerkt (entschieden am 30.09.2026)

| # | Punkt |
|---|---|
| E1 | **M18** Angebote: Katalogartikel, Positionsrabatt, Titel- und Textpositionen |
| E2 | **M10** UID-Prüfung online über VIES (heute nur die Form je EU-Staat) |
| E3 | Paket 11: Personalnummer, Lohnarten, Fahrzeuglager, Prüfprotokoll, Kalender-Export, Mailversand aus der App (braucht SMTP-Zugang als Function-Geheimnis), ebInterface |
| E4 | Plattform: Stufe „nur lesen“ nach einer Kündigung (im Auftrag optional). Die Erinnerung bei nur einem Leitungskonto ohne E-Mail steht seit 02.10.2026 auf der Startseite des Betriebs |

## Erledigt seit dem Prüflauf

**Am 02.10.2026, auch:** E5 — ein Konto lässt sich zwischen E-Mail und
Benutzername umstellen (Edge Function `konto-umstellen`, Protokoll
`konto_umstellungen`). Dabei aufgefallen und behoben: die Datenauskunft je
Person zählte die seit 30.09.2026 erfassten Lagerbewegungen nicht mit.

**Am 02.10.2026:** A10 war keine offene Frage mehr — Angebote tragen nur
Verkaufspreise und kalkulierte Stunden; Kostensätze und Einkaufspreise lesen
seit 29.09.2026 nur Geschäftsführung und Administrator (siehe `FUNKTIONEN.md`,
„Eine Ungereimtheit, die keine mehr ist“). E6: das Ende der Lehrzeit steht ab
30 Tage vorher auf der Startseite der Leitung, bis die Einstufung geändert ist;
umgestuft wird weiter von Hand, weil nur der Betrieb weiß, ob die Prüfung
bestanden ist. Die Datenschutzerklärung nennt die Aufbewahrung der Sicherung
jetzt richtig: 30 Tage im eigenen Rechenzentrum, außer Haus nach der Ablauffrist
beim Anbieter (vorgesehen 90 Tage) — vorher stand für beide 30 Tage.

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
Zeit — es gilt der zuletzt begonnene Einblick; eine Rolle aus „Mitarbeiten“
in A öffnet in B nichts mehr; `tests/supabase/supportzugang.test.ts`), B2 (der Support mit „Mitarbeiten“ erledigt auch, was die App über den
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
`tests/supabase/datenauskunft.test.ts`, `tests/components/Datenauskunft.test.tsx`. Teil 2: die **Löschung je Person** (Art. 17), in derselben Karte
„Datenschutz“ und mit Probelauf (`public.person_loeschen`). Sofort geht, was
keiner Aufbewahrung unterliegt — bei der Belegschaft Einstellungen,
Push-Adressen, Fehlerprotokoll und die Einsatzplanung, beim Kunden Wartungen
und Kontaktdaten; ein Kunde ohne Belege geht ganz. Was § 132 BAO sieben Jahre
verlangt (Zeiten, Urlaube, Krankmeldungen, Monatsbilanzen, Rechnungen,
Scheine, Angebote, Baustellen), bleibt gesperrt, und der Probelauf nennt je
Art das Fristende. Eine Person der Belegschaft muss zuerst deaktiviert sein;
gelöscht wird nur über die Kennung, ein Beleg nur über den Namen hält den
Kunden aber gesperrt; `tests/supabase/personLoeschen.test.ts`. Was nach
Fristablauf geschieht, ist A9.
Und B7, Teil 1: die **Stornorechnung** — zu einer stornierten Rechnung stellt
die Buchhaltung einen Beleg für den Kunden aus, mit eigener Nummer aus dem
Rechnungskreis und dem Tag des Stornos als Datum
(`public.stornorechnung_ausstellen`). Die Nummer hängt an der stornierten
Rechnung, nicht an einer zweiten Rechnung mit negativen Beträgen — offene
Posten, Mahnlauf und Nachkalkulation bleiben unberührt; BMD-Stapel und
Ausgangsbuch führen die Gegenbuchung unter ihrer Nummer, die Lückenprüfung
zählt sie mit. Ist sie ausgestellt, lässt sich der Storno nicht mehr
aufheben. Eine Teilgutschrift gibt es bewusst nicht (so entschieden): ein
Nachlass geht über Storno und neue Rechnung;
`tests/supabase/stornorechnung.test.ts`, `tests/unit/stornoPdf.test.ts`.
Teil 2: **Verzugszinsen** — ab der Mahnung (nicht auf der
Zahlungserinnerung) stehen sie mit Satz, Tagen und Grundlage auf dem Beleg und
zählen zum offenen Betrag: an Verbraucher 4 % (§ 1000 ABGB), an Kunden mit UID
9,2 Punkte über dem Basiszinssatz (§ 456 UGB). Der Basiszinssatz steht mit
seinem Halbjahr in den Einstellungen und gilt nur für dieses; fehlt er, geht
die Mahnung an Unternehmer ohne Zinsen hinaus und der Dialog sagt es. Reicht
der Verzug ins Vorhalbjahr, wird erst ab dem eingetragenen gerechnet — nie zu
viel. Und **Skonto** — Prozent und Frist aus den Einstellungen (ab Werk keines),
eingefroren an der Rechnung, mit Betrag auf dem PDF; nur auf Rechnung und
Schlussrechnung. Zahlt der Kunde in der Frist abzüglich Skonto, gleicht ein
Haken beim Erfassen den Rest aus (ein Zahlungseingang der Art „Skonto“, in
einem Zug mit der Zahlung; nicht mehr als zugesagt, nicht mehr als offen). Das
Ausgangsbuch führt ihn getrennt vom Geld; ein Storno verlangt, dass der
Skonto-Eintrag vorher gelöscht wird. `tests/unit/mahnung.test.ts`,
`tests/unit/skonto.test.ts`, `tests/supabase/skonto.test.ts`.

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
Einlass je Spalte, damit „kein Anfangsurlaub“ als bewusstes Leeren ankommt;
`tests/supabase/zeitkontoAnfang.test.ts`). **Bewusst geblieben:**
`vacations.saldo_bei_antrag` steht an der Urlaubszeile, und die lesen ohnehin
nur dieselben Rollen; wer genehmigt, braucht den Stand. Eine Projektleitung
ohne Genehmigungsrecht sieht ihn mit — wie den Urlaub selbst, den sie zum
Planen braucht.

**Aus B, am 28.09.2026:** B5 (`secure_password_change` an: eine Sitzung,
die älter als ein Tag ist, meldet beim Passwortändern mit dem eben geprüften
Passwort frisch an; im örtlichen Stack an und gegen eine gealterte Sitzung
geprüft, `tests/supabase/anmeldung.test.ts`. **In der Produktion schaltet
ihn das Dashboard** — Schritt 1.4 in `docs/DEPLOYMENT.md`; eingeschaltet seit 29.09.2026), B4 (kein Einblick ohne Eintrag im Protokoll —
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
