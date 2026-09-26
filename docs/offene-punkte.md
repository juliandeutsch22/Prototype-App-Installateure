# Offene Punkte

Stand 26.09.2026. Alles, was bewusst nicht umgesetzt ist, an einem Ort:
aus dem Design-Durchgang (`docs/design/fortschritt.md`), aus dem Prüflauf
mit vier unabhängigen Prüfern (`docs/pruefung-2026-09-25.md`) und aus den
Lücken, die die Prüfer neben den Fehlern gemeldet haben.

Jeder Punkt hat einen Grund, warum er offen ist, und einen Vorschlag. Was
eine Entscheidung braucht, ist als solche markiert. Wird ein Punkt erledigt,
wandert er hier heraus und in die jeweilige Doku.

## A. Braucht eine fachliche Entscheidung

| # | Punkt | Warum offen | Vorschlag |
|---|---|---|---|
| A1 | **BMD-Stapel: Umbuchung der Anzahlung** wird brutto mit dem Erlös-Steuercode ausgegeben; die Umsatzsteuer erscheint damit doppelt (P2-06) | Buchungslogik; wie die Kanzlei es haben will, entscheidet die Kanzlei | Mit der Kanzlei klären, dann netto ohne Steuercode oder mit Gegenbuchung der Steuer |
| A2 | **0 % USt ohne Hinweis auf die Steuerbefreiung** (§ 11 Abs 1 Z 3 lit e UStG) (P2-11) | Der Befreiungsgrund ist je Fall verschieden (Kleinunternehmer, Ausfuhr …); ein pauschaler Satz wäre falsch. Braucht ein neues Feld | Feld „Steuerbefreiung“ an der Rechnung, Pflicht bei 0 % ohne Reverse Charge, wird gedruckt |
| A3 | **DATANORM-Preiskennzeichen** vermutlich vertauscht (0 = Liste, 1 = Netto; laut Norm eher 1 = Brutto, 2 = Netto) (P2-17) | Verdacht, nicht belegt | Mit einer echten Datei des Großhändlers prüfen; Abgleich außerdem je Lieferant statt nur über die Artikelnummer |
| A4 | **Rückwirkende Krankmeldung ohne Grenze** (bis 480 Arbeitstage) (P1-28) | Betriebsentscheidung | Grenze festlegen, z. B. über X Tage nur für das Büro |
| A5 | **„Wochenplan für alle“** wirkt nur in der Oberfläche; die Datenbank lässt jeden Mitarbeiter die ganze Einsatzplanung lesen (P3-25) | Möglicherweise gewollt | Entscheiden; wenn nicht gewollt, Leseregel an den Schalter koppeln |
| A6 | **Interne Kommentare** der eigenen Zeitbuchung werden als „Tätigkeit“ auf den Kundenbeleg vorbelegt (P1-27, Rest) | Seit dem Prüflauf nur noch eigene Buchungen; ob überhaupt, ist eine Frage an den Betrieb | Feld in der Zeitmaske als „erscheint auf dem Schein“ kennzeichnen oder nicht vorbelegen |
| A7 | **Abdunkler hinter Dialogen** sind halbtransparent (Gestaltungsverbot „keine Alpha-Flächen“) | Deckend würden sie den Kontext hinter dem Dialog verbergen | So lassen; als bewusste Ausnahme dokumentiert |
| A8 | **Datenschutzerklärung siezt** (12 Stellen) | Rechtstext, inhaltlich nicht verändert | So lassen oder vom Juristen umformulieren lassen |

## B. Größerer Umbau, eigener Auftrag

| # | Punkt | Warum offen | Vorschlag |
|---|---|---|---|
| B1 | **Kostensätze, Einkaufspreise, Zeitkonten für alle Rollen lesbar** (`companies.cost_rates`, `material_prices`, `users.initial_*`, `vacations.saldo_bei_antrag`) (P3-12) | Umbau auf Sichten oder Spaltenrechte; die Datenbank schützt nur das Schreiben | Kostensätze und Einkaufspreise in eigene Tabellen/Sichten mit Leseregel für die Spitze; `users` und `vacations` für andere Rollen über Sichten ohne Kontospalten |
| B2 | **Supportsitzung „mitarbeiten“**: alle Funktionen, die den Betrieb aus dem Token holen, scheitern für das Plattformkonto (P3-14) | Umbau aller betroffenen Funktionen (Einsatz, Rüstliste, Schein, Rechnung, Nummern, Angebot, Urlaub, Betriebsurlaub …) | Einblicksbetrieb als Parameter mit `support_schreibt(betrieb)`-Prüfung; bis dahin sagt die Supportleiste ehrlich, was nicht geht |
| B3 | **Support mit „mitarbeiten“ in Betrieb A** liest in Betrieb B (mit Lesefreigabe) auch, was dort nur die Spitze liest, z. B. Angebote (P3-02, Rest) | Die Rollenfunktionen kennen keinen Betrieb; Schreiben in B ist gesperrt | Rollenfunktionen betriebsbezogen machen |
| B4 | **Supportprotokoll** wird nur vom Browser des Supports geschrieben (P3-15) | Kein serverseitiger Einstiegspunkt; wer über die API liest, hinterlässt keinen Eintrag | RPC „Einblick starten“, die protokolliert; Grenze steht in `docs/DEPLOYMENT.md` |
| B5 | **`secure_password_change`** (P3-22, Teil) | Die Passwortänderung in der App (`updateUser` in laufender Sitzung) würde eine Reauthentifizierung verlangen | Mit Nonce/Reauthentifizierung umsetzen |
| B6 | **Nachtschicht über die Zeitumstellung** rechnet ±1 h falsch (Spannen auf dem 1.1.1970) (P1-25) | Rechnung in App (`shared/arbeitszeit.ts`) und Datenbank (`app.arbeitsminuten`) | Mit dem echten Datum in Europe/Vienna rechnen |
| B7 | **Gutschrift, Skonto, Verzugszinsen** fehlen; ein Storno ist nur eine Statusänderung ohne Beleg für den Kunden | Neue Funktionen | Eigener Auftrag |
| B8 | **DSGVO-Auskunft (Art. 15) und Löschung (Art. 17) je Person** fehlen; `betrieb_auszug` betrifft nur den ganzen Betrieb und ist auf 8 MB begrenzt | Neue Funktionen | Eigener Auftrag |
| B9 | **Betragsformatierer**: acht `fmtEUR`-Kopien | `tests/unit/eurozeichen.test.ts` setzt sie voraus und darf nicht abgeschwächt werden | Zusammenlegen und die Prüfung im selben Auftrag auf den einen Formatierer umstellen |
| B10 | **„Pro Element genau eine Klasse“** gilt nur für die Bausteine; das übrige Markup ist Tailwind | Umschreiben wäre eine Formatierungswelle über rund 56 000 Zeilen | Ansicht für Ansicht, wenn sie ohnehin angefasst wird |
| B11 | **Design-Phasen 2 und 3** (gemeinsame Bausteine, Tabellen am Desktop, Monteur-Start als drei Karten, zweispaltige Akten) | Verändern die Grundgestaltung; der erste Durchgang wurde zurückgenommen | Nur mit einem freigegebenen Entwurf |

## C. Absicherungen und Tests, die fehlen

| # | Punkt | Vorschlag |
|---|---|---|
| C1 | Kein Test prüft, dass Links und Knöpfe einer Ansicht nur auf Routen zeigen, die die Rolle betreten darf (drei solche Fehler kamen im Prüflauf) | Automatische Prüfung wie `links.mjs` des Prüfers in den Durchklick aufnehmen |
| C2 | Keine serverseitige Prüfung, dass `user_id`/`uuid[]`-Werte zum Betrieb gehören (`einsatz_speichern`, `projects.assigned_employees`, `project_managers`, Büro-Buchungen) | Fremdschlüssel prüfen nur die Existenz; Betriebsprüfung ergänzen |
| C3 | `listWorkSheetsForProject` holt höchstens 100 Scheine ohne Sortierung und nur zur exakten Nummer (keine Altschreibweise „PR-“) | Blättern wie bei den Zeiten, Nummern angleichen |
| C4 | BMD-Spaltennamen („Sollkonto;Habenkonto;…“) sind nicht gegen eine Importdefinition geprüft | Mit der Kanzlei eine Beispieldatei abgleichen |
| C5 | Gesamtsaldo (`calcOverallSaldo`) und Monatsauswertung (`calcMonthStats`) zählen Krank- und Urlaubstage unterschiedlich; folgenlos, solange nur die Datenbankfunktionen sie schreiben | Gleichheitsprüfung als Test |
| C6 | Kein Sprunglink „Zum Inhalt“; nach einem Seitenwechsel bleibt der Fokus nicht auf dem neuen Inhalt | Sprunglink und Fokus auf `<main>` |
| C7 | `WorkSheetView` stürzt als ganze Ansicht ab, wenn eine Entwurfszeile kein `mitarbeiter` trägt (Altdaten) | Absicherung mit leerem Namen |
| C8 | Vormerkungen des Ausgangsfachs mit alter Baustellennummer landen nach einer Umnummerierung verwaist | Beim Nachsenden über `angezeigteNummer`/Umnummerierungs-Tabelle auflösen |
| C9 | Offline-Buchung funktioniert nur, weil postgrest-js GET-Anfragen 7 s wiederholt und so die 3-s-Frist greift; bei `navigator.onLine === false` sollte die Vorprüfung direkt übersprungen werden | Kein Test auf Ansichtsebene mit echtem Offline |
| C10 | Fehlt der Hash eines Scheins (der AFTER-Trigger schluckt Fehler), wird die Prüfsumme nie nachgetragen; das PDF sagt dauerhaft „wird ergänzt“ | Nachtragen im Nachtlauf |
| C11 | Vorschau-Werkzeug: Stubs für Scheinentwurf, Rechnungssuche, Buchhaltungs-Export, Datanorm-Import und Zeit buchen fehlen oder sind falsch geformt; `messen.mjs` und README nennen noch `section-label` statt `titel-karte` | Stubs ergänzen, Ausnahmen aktualisieren |
| C12 | `npm test` führt die Datenbanktests nicht aus; grün sagt nichts über Zeilenregeln und Trigger | Bleibt so (Stack nur in der CI); im Handbuch benannt |

## Erledigt seit dem Prüflauf

Alle übrigen Befunde des Prüflaufs (P1–P4) sind behoben und in
`docs/pruefung-2026-09-25.md` beschrieben; die Commits tragen die
Befund-ID (`git log --grep "Prüflauf 25.09.2026"`).
