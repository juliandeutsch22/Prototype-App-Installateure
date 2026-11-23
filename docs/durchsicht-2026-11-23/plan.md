# Durchsicht vom 23.11.2026 — Befunde und Umsetzungsplan (Fassung 2, nach der Gegenprüfung)

Stand des Codes: `main` fa6e740 (nach E99). Diese Datei fasst zwölf Arbeitspapiere (`analyse/`)
und dreizehn Berichte unabhängiger Prüfer (`pruefung/`) zusammen. Fassung 1 war die erste
Zusammenfassung der Papiere; **Fassung 2 arbeitet die Gegenprüfung vollständig ein**. Was sich
dabei geändert hat, steht Punkt für Punkt in `pruefung/aenderungen-fassung-2.md`.

**Was gilt:**

- **Gebaut ist nichts, und es gibt kein Startsignal** (Grundsatz 5 in `CLAUDE.md`). Der
  Auftraggeber hat am 23.11.2026 zu den fünfzehn Entscheidungen der Fassung 1 gesagt: „alles wie
  von dir empfohlen, aber noch nicht mit der umsetzung starten“, und eine unabhängige
  Gegenprüfung verlangt.
- **Die Gegenprüfung hat keinen Befund am Code widerlegt.** Sie hat aber fünf Befunde der
  Oberfläche widerlegt, viele Kurztexte, Vorschläge und Zuordnungen berichtigt, 36 neue Befunde
  geliefert — und bei **neun der fünfzehn Entscheidungen** gezeigt, dass die Empfehlung der
  Fassung 1 so nicht hält. Diese neun stehen in Abschnitt 10, Teil 2, mit einer neuen
  Empfehlung; die neu aufgekommenen Fragen stehen in Teil 3.
- **Der Auftraggeber hat nach den Berichten der Gegenprüfung am 23.11.2026 erklärt: „alle
  offenen und überdachten entscheidungen wie von dir neu empfohlen“.** Damit gilt in Abschnitt 10,
  Teil 2 und Teil 3, je Zeile die Spalte „Neue Empfehlung“ als entschieden, und die Pakete
  behandeln sie so. **Ein Startsignal ist das nicht.**
- **Nicht entschieden ist, was auf die Kanzlei wartet** (Abschnitt 10.4 und 11), und was
  „zurückgestellt — neue Entscheidung nötig“ heißt (Abschnitt 8.4). Vor Paket 1 ist außerdem ein
  Verdachtsfall zu klären (Verdacht S-4, Abschnitt 4.9).

Auftrag des Auftraggebers, in vier Teilen:

1. Code-Durchsicht des ganzen Repositorys: offene Lücken, Fehler und Grenzen in der Funktion.
2. Alle Bildschirme und Unterbildschirme: Fehler im Design und Unstimmigkeiten in der Linie, und
   was Bedienung und Zusammenspiel der Funktionen intuitiver, hochwertiger und näher an Apple
   machte.
3. Wo noch zu viel Text oder unnötige Auskunft steht, und was statt der vielen Trennpunkte „·“
   stehen kann.
4. **„Es darf nichts verschlimmbessert werden.“** — die Bedingung für alles Folgende
   (Abschnitt 2).

## Inhalt

| Abschnitt | Inhalt |
|---|---|
| 1 | Kurzfassung: was gilt, Ergebnis der Gegenprüfung in Zahlen, das Wichtigste, Stufen und Aufwand |
| 2 | „Nichts verschlimmbessern“ — die Regeln und was die Werkzeuge wirklich leisten |
| 3 | Kürzel, Urteile und Listen — Lesehilfe |
| 4 | Befunde zur Funktion (Papiere 1 bis 7), neue Befunde der Prüfer, Verdachtsfälle, Grenzen ohne gültigen Grund, Ideen zum Zusammenspiel |
| 5 | Befunde zur Oberfläche (Papiere 8 bis 12), jedes Kürzel mit Urteil und Paket |
| 6 | Zu viel Text — Befund und Regel in der Fassung nach der Gegenprüfung |
| 7 | Statt der Trennpunkte — Befund und Regel in der Fassung nach der Gegenprüfung |
| 8 | Die vier Listen: widerlegt · keine Handlung · bleibt, wie es ist · zurückgestellt |
| 9 | Der Plan in Paketen: Reihenfolge, Abhängigkeiten, Seite → Paket, Pakete 1 bis 29 |
| 10 | Entscheidungen des Auftraggebers in drei Teilen: nicht beanstandet · neu vorgelegt · neu offen; dazu, was auf die Kanzlei wartet |
| 11 | Fragen an Kanzlei und Steuerberatung |
| 12 | Was diese Durchsicht nicht geleistet hat |

---

## 1. Kurzfassung

### 1.1 Ergebnis der Gegenprüfung in Zahlen

Dreizehn Prüfer haben unabhängig voneinander gearbeitet: zwölf je ein Papier, Befund für Befund,
mit eigenen Wegwerf-Datenbanken, eigenen Skripten und eigenen Messungen im Browser; einer den
Plan als Ganzes. Die Urteile, aus den Berichten nachgezählt:

| Papier | bestätigt (nachgestellt) | bestätigt (am Code) | teilweise | widerlegt | nicht prüfbar | auf Risiko geprüft (Ideen) | Summe |
|---|---|---|---|---|---|---|---|
| 1 Zeit und Personal | 7 | 8 | 1 | 0 | 0 | 0 | 16 |
| 2 Auftragskette | 2 | 13 | 2 | 0 | 0 | 0 | 17 |
| 3 Planung, Startseite, Scheine | 3 | 9 | 0 | 0 | 0 | 0 | 12 |
| 4 Geld | 7 | 9 | 1 | 0 | 0 | 0 | 17 |
| 5 Material | 7 | 8 | 1 | 0 | 0 | 0 | 16 |
| 6 Grundlagen und Sicherheit | 4 | 8 | 1 | 0 | 0 | 0 | 13 |
| 7 Technik | 3 | 11 | 2 | 0 | 0 | 0 | 16 |
| 8 Vermessung | 21 | 3 | 9 | 0 | 0 | 0 | 33 |
| 9 Monteur und Hülle | 59 | 9 | 20 | 0 | 0 | 18 | 106 |
| 10 Büro — Aufträge | 51 | 13 | 21 | 2 | 0 | 0 | 87 |
| 11 Büro — Geld und Material | 59 | 5 | 29 | 1 | 1 | 0 | 95 |
| 12 Planung, Team, Einstellungen | 58 | 8 | 19 | 2 | 0 | 0 | 87 |
| **Summe** | **281** | **104** | **106** | **5** | **1** | **18** | **515** |

Lesehilfe: gezählt sind die 500 Kürzel der Papiere, dazu sechs Abschnitte ohne Kürzel im Papier 8
(Messmethode, Soll-Werte, Gesamtbild, Trennpunkte, Textmenge, Wächter) und die neun
durchgespielten Aufgaben ohne Kürzel im Papier 11. Die 18 Ideen des Papiers 9 hat der Prüfer
nicht „bestätigt“, sondern auf Risiko geprüft.

**Was das heißt:**

- **Kein Befund am Code ist widerlegt** (107 von 107 bestätigt oder teilweise bestätigt; 33 an
  einer Datenbank oder per Skript nachgestellt). Acht sind „teilweise“: Umfang, Schwere oder Ursache
  waren zu berichtigen (Z-6, A-1, A-14, G-1, M-6, S-13, L-14, L-15).
- **Fünf Befunde der Oberfläche sind widerlegt** (D2-T7, D2-T15, D3-T4, D4-C11, D4-T9) und
  kommen in keinem Paket mehr vor (Abschnitt 8.1). Einer war nicht prüfbar (Inventur am Handy —
  die Vorschau stürzt ab).
- **„Bestätigt“ heißt: Messwert und Beleg stimmen — nicht, dass der Vorschlag so gebaut werden
  kann.** Bei vielen bestätigten Befunden nennt der Prüfer ein Risiko, ein fehlendes „bleibt
  gleich“ oder einen Widerspruch zu einer früheren Entscheidung. Jede solche Warnung steht als
  Vorgabe im Paket (Abschnitt 9, je Paket „Vorgaben aus der Gegenprüfung“).
- **39 Punkte bleiben, wie sie sind** (Abschnitt 8.3): Befunde, die keine Regel verletzen oder
  durch eine frühere Entscheidung ausdrücklich gewollt sind, und Vorschläge, die eine
  Entscheidung zurückdrehen, eine Funktion wegnehmen oder etwas einen Tipp weiter weg legen
  würden. 13 Punkte brauchen keine Handlung (8.2), 16 sind zurückgestellt und brauchen eine
  neue Entscheidung (8.4).
- **36 neue Befunde** haben die Prüfer beim Nachstellen gefunden (Abschnitt 4.8), darunter
  mehrere mit Schaden.

### 1.2 Was die Gegenprüfung am Plan geändert hat

| Thema | Fassung 1 | Fassung 2 |
|---|---|---|
| Entscheidungen | fünfzehn „entschieden wie empfohlen“ | sechs gelten unverändert; **neun sind mit neuer Empfehlung neu vorgelegt**, weil die alte nicht hielt (E-T, E-P, E-D, E-N, E-E, E-M, E-S, E-A13, E-Z14); dazu die neu offenen Fragen. Der Auftraggeber hat am 23.11.2026 alle neuen Empfehlungen übernommen (Abschnitt 10) |
| Absicherung „nichts verschlimmbessern“ | stützte sich auf Werkzeuge, die weniger leisten als behauptet | Abschnitt 2 sagt, was jedes Werkzeug leistet; das Funktionsinventar wird zuerst auf den Stand nach E99 gebracht, das Bildwerkzeug zuerst gebaut (Paket 8) |
| Zuordnung | rund 140 Punkte der Papiere in keinem Paket; 9 Kürzel doppelt | jedes der 500 Kürzel genau einmal in einem Paket oder in einer der vier Listen (per Skript geprüft); 45 Verdachtsfälle, 58 Ideen zum Zusammenspiel und die Grenzen ohne gültigen Grund je in einer eigenen Tabelle |
| Reihenfolge | vier Voraussetzungen kamen später als das Paket, das sie brauchte | Bau bei jedem PR und das Herauslösen der Rechnungsfenster vor Stufe B; Vorschau und Bildwerkzeug als erstes Paket der Stufe B; WebKit für die Büro-Geldwege vor Stufe C |
| Stufe B und C | dieselbe Liste bis zu fünfmal umgebaut | Stufe B liefert nur Regeln, Bausteine und Wächter; **jede Seite wird genau einmal umgebaut, in Stufe C** (Tabelle 9.3) |
| Vorschläge | mehrere hätten etwas verschlechtert oder eine Entscheidung zurückgedreht | je Punkt die Vorgabe des Prüfers; was eine Entscheidung zurückdrehen, eine Funktion wegnehmen oder einen Tipp kosten würde, bleibt, wie es ist (Liste 8.3) |
| Aufwand | keine Summe genannt (nachgerechnet 190 bis 235 Arbeitstage) | Summe je Stufe und gesamt (1.5) |

### 1.3 Was gefunden wurde

| Teil | Papiere | Befunde |
|---|---|---|
| Funktion (Code) | `analyse/1` bis `7` | **107 belegte Befunde** (26 Fehler, 34 Lücken, 25 Grenzen, 13 Unstimmigkeiten, 9 fehlende Prüfungen — rund zehn tragen im Papier zwei Arten, gezählt ist die erstgenannte); 45 Verdachtsfälle; 58 Ideen zum Zusammenspiel der Funktionen; 165 Zeilen „benannte Grenzen neu bewertet“ (die Zahl 158 der Fassung 1 ließ sich nicht herleiten, Abschnitt 4.10) |
| Neue Befunde der Prüfer | `pruefung/1` bis `12` | **36** (Abschnitt 4.8) |
| Oberfläche: Fehler gegen die Linie | `analyse/9` bis `12` | 73 gemeldet — davon sind laut Gegenprüfung etliche Unstimmigkeiten oder bewusste Entscheidungen, kein Regelverstoß (Abschnitt 5) |
| Oberfläche: Unstimmigkeiten zwischen Seiten | `analyse/9` bis `12` | 62 |
| Bedienung: Befunde aus rund 30 durchgespielten Aufgaben | `analyse/9` bis `12` | 45 |
| Ideen (intuitiver, hochwertiger, näher an Apple) | `analyse/9` bis `12` | 56 |
| Zu viel Text, unnötige Auskunft | `analyse/9` bis `12` | 88 gemeldet, davon 4 widerlegt und 25 nur teilweise bestätigt |
| Trennpunkte „·“ | `analyse/8` §4, `analyse/9` bis `12` | 51 Muster an rund 510 Zeilen im Quelltext (rund 160 Dateien) |
| Vermessung über alle Seiten, Rollen, Breiten (863 Zustände, 56.091 Textelemente) | `analyse/8` | 16 Befunde (V-1 bis V-16; V-16 betrifft das Messwerkzeug, nicht die App), 11 Unstimmigkeiten (V-B1 bis V-B11; vier davon nennt das Papier selbst „entschieden“ oder „gewollt“), 16 fehlende Wächter (17 Zeilen; die 17. ist ein Hinweis für die README) |

### 1.4 Das Wichtigste zuerst

**Ein Rückfall und zwei Nebenwirkungen der letzten Wellen** (alle drei jetzt an einer Datenbank
nachgestellt):

- **Z-2 (Rückfall):** „Urlaub genehmigen“ und „Urlaub kürzen“ rechnen wieder mit den heutigen
  Arbeitstagen der Person statt mit denen zum Datum — eine spätere Migration desselben Tages hat
  die Korrektur überschrieben.
- **Z-1 (Nebenwirkung des Monatsabschlusses vom 16.11., kein Rückfall):** Mit eingeschaltetem
  Monatsabschluss lässt sich über Stunden eines abgeschlossenen Monats keine Rechnung ausstellen
  oder stornieren. Neu dazu (N-Z-1): auch die Einstufung einer Person lässt sich dann nicht mehr
  ändern.
- **S-1 / M-1 (Rückfall):** Der Supportzugang sieht seit 18.11. Baustellen, Lager, Anforderungen,
  Wartungen und offene Forderungen nicht mehr. Der Vorschlag der Fassung 1 hätte dem Support ein
  leeres Lager gezeigt statt eines Fehlers — berichtigt (Paket 1).

**Falsche Zahlen und Datenverlust:**

- **L-1 / M-2 / N-L-1:** Die Nachkalkulation verliert Materialkosten ab 1.000 Ausgabezeilen;
  dieselbe Grenze trifft das ausgegebene Material beim Rechnungstellen.
- **G-1:** Der Kontoauszug-Abgleich hält ein Datum oder eine fremde Nummer aus Jahr und
  vierstelliger Zahl im Verwendungszweck für eine Rechnungsnummer und wählt die Rechnung eines
  fremden Kunden vor (nachgestellt; betrifft 92 Nummern je Jahr, nicht rund 230).
- **P-1:** Ein vorgemerkter Schein, den der Server endgültig ablehnt, wird samt
  Kundenunterschrift vom Gerät gelöscht. Neu dazu: eine leere 404-Antwort gilt als gesendet
  (N-P-1).
- **N-G-1:** `rechnung_anlegen` lässt sich an der Oberfläche vorbei mit frei gewählter Nummer
  rufen; danach kann der Betrieb unter Umständen keine Rechnung mehr ausstellen.
- **A-14:** Eine über den Link erklärte Annahme lässt sich ohne Rücknahme verlassen, sobald die
  Angebotsseite des Büros veraltet ist.
- **N-Z-2, N-Z-3, N-P-4:** zwei gleichzeitige Krankmeldungen; der Monatsabschluss sperrt Eintritt
  und Austritt nicht; „Wartung erledigt“ wird durch ein altes Formular zurückgesetzt.

Nicht mehr in dieser Liste: **A-1 / P-10** (der Abschluss einer Baustelle meldet nur in
gelegentlichen Fällen Verrechnetes als offen — nicht „jede Pauschalbaustelle“) und **D3-6** (der
Zahlungsdialog belegt „22104.6“ vor — ein Formfehler, keine falsche Zahl).

**Oberfläche, die größten Hebel:**

- Jedes Eingabefeld ändert bei jedem Fokus seine Form (12 → 8 px), auch nach einem Fingertipp;
  runde Knöpfe werden eckig (V-13).
- Fenster und Blätter, deren Hauptaktion beim Öffnen nicht im Bild ist: vier „Neu“- und
  „Bearbeiten“-Fenster im Bereich Aufträge und das Zeitblatt (D2-A20, D1-C1).
- „Rechnung stellen“ läuft am Handy und Tablet aus dem Blatt, Summen unsichtbar (D3-1).
- Am Handy: im Gespräch steht beim Öffnen nicht, mit wem man schreibt (D1-A17); im Korb liegt
  „Abschicken“ hinter der Kopfinsel (D1-C3); der Tipp auf einen Tag im Einsatzplan zeigt nichts
  (D1-C6).
- Text: die Untertitel der Seitenköpfe wiederholen ab Tablet nur den Titel; derselbe Betrag
  steht im Rechnungsfenster viermal.
- Trennpunkte: die Menge entsteht durch Wiederholung und durch Ketten mit drei bis fünf Punkten.
  Die Ersatzformen der Fassung 1 tragen am Handy mit langen Namen aber nicht überall
  (Abschnitt 7).

### 1.5 Stufen und Aufwand

Schätzung in Arbeitstagen, aus den Aufwänden der Papiere und den Berichtigungen der Prüfer
(Bericht 0, Abschnitt 9). Nicht enthalten: was bleibt, wie es ist (Liste 8.3), was
zurückgestellt ist (Liste 8.4 und die eigenen Ideen zum Zusammenspiel) und G-13 (wartet auf die
Kanzlei).

| Stufe | Inhalt | Pakete | Aufwand |
|---|---|---|---|
| Vorab | Verdacht S-4 (Realtime) klären | — | ½–1 |
| **A** | Rückfälle und Fehler mit Schaden, je mit einem Wächter | 1–6 | 25–34 |
| vor B | Rechnungsfenster verhaltensgleich herauslösen | 7 | 4–6 |
| **B** | Werkzeuge, Regeln, Bausteine, Wächter — keine Seite wird umgebaut | 8–12 | 31–42 |
| **C** | Seiten, jede genau einmal | 13–20 | 75–95 |
| **D** | Lücken in den Abläufen | 21–26 | 95–119 |
| **E** | Technik: Auslieferung, Prüfungen, Skalierung | 27–29 | 15–19 |
| | **gesamt** | | **rund 245 bis 315** |

Die Summe liegt über der vom Prüfer des Plans genannten (225 bis 280), weil die neuen Befunde,
die zweite Durchsicht der bisher nicht erreichbaren Bildschirme und die vollständigen Fassungen
von S-9 und M-9 mitgezählt sind. Die Zahlen sind geschätzt, nicht gemessen.

### 1.6 Was entschieden ist und was offen bleibt

Abschnitt 10 hat drei Teile. **Teil 1** (sechs Entscheidungen) gilt unverändert. **Teil 2** legt
neun Entscheidungen neu vor, je mit dem Befund der Gegenprüfung und einer neuen Empfehlung.
**Teil 3** enthält die neu aufgekommenen Fragen: fünf aus der Vermessung, 33 fachliche und
gestalterische Fragen, die Fassung 1 stillschweigend beantwortet hatte oder die die Prüfer
aufgeworfen haben, 18 Vorschläge, die eine frühere Entscheidung zurückdrehen würden, und zwölf
Fälle „ein Tipp mehr“. Der Auftraggeber hat am 23.11.2026 erklärt: „alle offenen und überdachten
entscheidungen wie von dir neu empfohlen“ — damit gilt in Teil 2 und Teil 3 je Zeile die neue
Empfehlung.

**Offen bleibt:** (1) das Startsignal; (2) der Verdacht S-4 vor Paket 1; (3) zehn Punkte, die auf
Kanzlei oder Steuerberatung warten (Abschnitt 10.4, neun Fragen in Abschnitt 11); (4) alles, was
„zurückgestellt — neue Entscheidung nötig“ heißt (Abschnitt 8.4 und die eigenen Ideen in 4.11);
(5) 22 offene Verdachtsfälle, je vor ihrem Paket zu klären; (6) die zweite Durchsicht der
Bildschirme, die die Vorschau heute nicht zeigt.

---

## 2. „Nichts verschlimmbessern“ — wie der Plan das absichert

Die Gegenprüfung hat gezeigt, dass die Absicherung der Fassung 1 auf Werkzeugen ruhte, die
weniger leisten, als dort stand (Bericht 0, Abschnitt 7). Dieser Abschnitt sagt deshalb zuerst,
was jedes Werkzeug heute wirklich leistet, und dann, welche Regeln für jedes Paket gelten.

### 2.1 Was die Werkzeuge heute leisten — und was nicht

| Werkzeug | Leistet | Leistet nicht | Folge für den Plan |
|---|---|---|---|
| Funktionsinventar (`tests/unit/funktionsinventar.test.ts`, `scripts/funktionsinventar.mjs`, `docs/ui-umbau/v10-entfernt.json` mit 107 Einträgen) | vergleicht Knöpfe, Verweise, Menüeinträge und Felder im Quelltext mit einer Vorher-Datei (1.941 Einträge) | (a) Die Vorher-Datei ist der Stand **vor V10** (13.11.): was seit E93 dazukam (Schublade „Noch einzuplanen“, `Card klappe`, Belegzeilen und Rechnungsfenster der Akten, Einsatz-Vorschau der Startseite …), kann unbemerkt verschwinden. (b) Der Schlüssel ist Art + Text + Ziel **ohne Datei**: 496 Einträge teilen ihren Schlüssel („Abbrechen“ 38-mal, „Speichern“ 16-mal) — fällt einer von 16 „Speichern“-Knöpfen weg, bleibt die Prüfung grün. (c) Gelesen wird Quelltext, nicht Erreichbarkeit: ein Knopf, der ins dritte Fenster wandert, gilt als „da“ | Regel 3 und Regel 11; Paket 8 bringt das Inventar zuerst auf den heutigen Stand |
| Bilder (`tools/vorschau/fotos.mjs`) | nimmt 35 fest eingetragene Routen im Grundzustand auf, hell, in Chromium; misst `scrollWidth` | die Vermessung fand 65 Routen (darin Modul- und Abfragevarianten); es fehlen u. a. `/eingaenge`, `/liegenschaften`, `/nachrichten`, `/sonderurlaub`, `/invoices/kontoauszug`, sieben Einstellungsseiten, `/plattform`; keine Fenster, Menüs, Blätter, Reiter; nicht dunkel; stellt nichts nebeneinander | Regel 5: das Werkzeug wird in Paket 8 erst gebaut |
| Messskripte der Vermessung (`lauf.mjs`, `inseite.mjs`, `text.mjs`) | haben Flucht, Tastfläche, Punkte je Zeile und Wörter über dem Falz gemessen | liegen nur im Arbeitsverzeichnis der Durchsicht, das nicht dauerhaft ist. Die Tastflächen-Messung taugt so nicht als Vorlage für einen Wächter: sie meldete zwei Stellen falsch (ein umgebendes `label` und das Klick-Ziel der Elternzeile zählen nicht mit) und zählt außerhalb geparkte Wischaktionen als sichtbaren Text (Bericht 8) | Paket 8 nimmt sie berichtigt ins Repo |
| Browserwege (`telefon-chromium`, `webkit-telefon`, `tablet-834`, Linkprüfungen) | prüfen die Wege des Monteurs; lokal läuft Chromium, WebKit prüft die CI (`CLAUDE.md`) | die Büroseiten laufen in diesen Projekten nicht (`testMatch: MONTEUR_WEGE`); die Geldwege des Büros laufen nie in WebKit, das Tablet nie in Safari (L-11) | Regel 7; Paket 12 vor Stufe C |
| Belegreferenz (`tests/unit/belegReferenz.test.ts`, `docs/ui-umbau/referenz.json`) | zehn Dateien Byte für Byte: Rechnung, Storno, Mahnung, Schein, Stundennachweis, drei CSV, Lohn, Archiv | nicht darin: Angebots-PDF, E-Rechnung (XML), Bestellung. Für G-16 untauglich — sie ruft `rechnung_anlegen` nicht | Pakete 3, 18, 22, 25 nennen eigene Prüfungen |
| Attrappen-Wächter (`tests/unit/vorschauErsatz.test.ts`) | prüft die Exportnamen der Ersatzmodule und je Attrappe das, was jemand als Zeichenkette einträgt | „verlangt die Form je Attrappe“ gilt nur, wenn jede neue Form dort von Hand ergänzt wird | Paket 8 |
| `tests/unit/schreibweise.test.ts` | prüft ß und Anführungszeichen | keine Wörterliste — die ist neu zu bauen | Paket 10 |
| `tests/unit/schalterRegel.test.ts` | hält E95 fest: jedes Ein/Aus einer Einstellung ist ein Schalter, ob es sofort wirkt oder mit „Speichern“ | — | bleibt bei jedem Vorschlag zu den Einstellungen grün (E-E) |
| `flucht.spec.ts`, `raster.spec.ts`, `schriftskala.spec.ts` | Flucht links vom Kartentitel; Raster auf 20 Seiten; Schriftstufen auf 46 Seiten | `flucht.spec.ts` überspringt Karten ohne Titel und nimmt Tabellen aus; `raster.spec.ts` kennt `/worksheet` und `/assignments/tag` nicht; `schriftskala.spec.ts` öffnet keine Fenster und nimmt `h1`–`h4` aus | Paket 9 erweitert sie, je mit Ausnahmeliste |

### 2.2 Die Regeln — sie gelten für jedes Paket

1. **Erst nachstellen, dann ändern.** Jeder Befund bekommt vor dem Bau eine Prüfung, die ihn
   zeigt (rot), und ist danach grün (Gegenprobe, `CLAUDE.md`). Was sich nicht nachstellen lässt,
   wird nicht „behoben“ (Grundsatz 2). Die Verdachtsfälle (Abschnitt 4.9) werden nicht gebaut,
   sondern geklärt — jeder nennt, vor welchem Paket.
2. **Zu jedem Punkt steht, was gleich bleiben muss** — im Papier je Befund, hier je Paket, mit
   den Ergänzungen der Prüfer. Dafür gibt es eine eigene Prüfung, nicht nur das Vertrauen in die
   bestehenden.
3. **Keine Bedienstelle geht verloren.** Vor Stufe B wird das Funktionsinventar auf den heutigen
   Stand gebracht (`node scripts/funktionsinventar.mjs` → neue Vorher-Datei nach E99), und der
   Vergleich zählt je Datei, wie oft ein Schlüssel vorkommt; sinkt eine Zahl, braucht es einen
   Eintrag mit Grund in `docs/ui-umbau/v10-entfernt.json`. Gegenprobe: einen von 16
   „Speichern“-Knöpfen entfernen → rot. Auch danach liest das Inventar nur Quelltext — ob ein
   Knopf noch erreichbar ist, zeigen die Browserwege und Regel 11.
4. **Kein Text verschwindet ohne Ziel.** Jeder gestrichene Satz steht danach in „Hilfe zu dieser
   Seite“, im Fenster der Zeile oder erscheint nur noch im abweichenden Fall. Sätze, die eine
   Entscheidung tragen oder vor Schaden schützen, bleiben (Liste in Abschnitt 6.4).
5. **Vorher/Nachher im Bild — sobald es das Werkzeug gibt.** Paket 8 baut es: Routenliste aus
   `navigation.ts`; je Seite Hilfe, ⋯, Hauptaktion, erste Zeile und deren ⋯; hell und dunkel;
   390, 834 und 1440 px (für Zeilenformen zusätzlich 375 px); Ablage der Vorher-Bilder; die
   Messungen der Vermessung als Skripte im Repo unter `tools/vorschau/`. Bis dahin behauptet kein
   Paket einen Bildvergleich.
6. **Ein Thema, ein PR — und jede Seite genau einmal.** Fehlerbehebung und Umgestaltung nie im
   selben PR. Stufe B liefert Regeln, Bausteine und Wächter; umgebaut wird jede Liste und jede
   Seite einmal, in Stufe C (Pfeil, Punkte, Text, Knöpfe, Fuß in einem PR je Seite; Tabelle 9.3).
7. **Browser vor dem Push, ehrlich benannt.** Lokal laufen die Chromium-Projekte und die
   Linkprüfungen (`CLAUDE.md`, Ablauf Schritt 3); WebKit prüft die CI. Die Büroseiten sind bis
   Paket 12 in WebKit gar nicht geprüft — deshalb kommt Paket 12 vor Stufe C.
8. **Entscheidung vor Bau.** Gebaut wird nach den Entscheidungen in Abschnitt 10. Was dort
   „bleibt, wie es ist“ heißt, wird nicht angefasst; was „zurückgestellt — neue Entscheidung
   nötig“ heißt oder auf die Kanzlei wartet, wird nicht gebaut, bevor es entschieden ist. Kommt
   beim Bau eine neue Frage auf, wird sie gestellt, nicht stillschweigend beantwortet.
9. **Wächter zuerst — mit Ausnahmeliste und Gegenprobe.** Ein neuer Wächter ist am heutigen
   Stand rot an den gemeldeten Fundstellen und grün an allem Gewollten. Mehrere der
   vorgeschlagenen Wächter schlügen heute an gewollten Stellen an (Tabelle in Paket 9); jede
   Ausnahme steht mit Grund in der Liste, sonst wird Gewolltes „behoben“.
10. **Altdaten bleiben.** Keine Migration rechnet ausgestellte Belege, genehmigte Anträge oder
    abgeschlossene Monate neu. Wo ein Paket bestehende Daten berührt, sagt es, was mit ihnen
    geschieht: Z-11 (laufende Ansprüche beim Einschalten), Z-14 („gilt ab“), Z-5 (schon
    überschriebene Eintritte lassen sich nicht wiederherstellen — benennen), A-5 (Altangebote
    ohne festgehaltenen Empfänger), M-4 (bestehende Posten mit abweichender Einheit), G-7
    (Mahnstufen vor dem 10.10.2026), G-14 (alte Anzahlungen ohne gespeicherten Steuersatz), S-7.
11. **Ein Tipp mehr wird benannt.** Ein Vorschlag, der eine Aktion oder Angabe einen Tipp weiter
    weg legt, steht mit „vorher n, nachher m Tipps“ im PR und im Paket; ohne Zustimmung des
    Auftraggebers wird er nicht gebaut. Für die bekannten Fälle gilt: sie bleiben, wie sie sind
    (E-W1).
12. **Sicherheit, Datenauskunft, `shared/`.** Jede neue Datenbankfunktion: `security definer`,
    `set search_path = ''`, `revoke … from public, anon`, nur der nötige `grant`. Jede neue
    Zeilenschutz-Regel prüft den Betrieb als `company_id = (select app.lesebetrieb())`. Jede neue
    Tabelle mit Personenbezug gehört in die Datenauskunft (`person_auskunft`,
    `auszug_ausgenommen`) und in die Löschung einer Person. Nach Änderungen an `shared/`
    `node scripts/edge-shared-uebernehmen.mjs`. Rollenprüfungen in Funktionen als `… is not true`
    oder mit `coalesce(…, false)` (N-S-4). Jede neue lesende Funktion steht in
    `LESENDE_FUNKTIONEN`, `netzFrist.ts` und im Support-Wächter aus Paket 1.
13. **Auf dem Endstand aufsetzen.** Wer eine Datenbankfunktion ändert, nimmt ihren Text aus der
    Datenbank (`\sf`, `pg_get_functiondef`), nicht aus der letzten Migrationsdatei: mehrere
    Funktionen (`rechnung_anlegen`, `person_auskunft`, `person_loeschen`, `urlaub_entscheiden`)
    gelten als „letzte Definition plus späterer Textersatz“. Wer aus der Datei abschreibt,
    wiederholt den Fehler von Z-2. Wird dieselbe Funktion in zwei Paketen angefasst
    (`app.baustelle_abschluss_zaehlen` in Paket 1 und 22), baut das spätere auf dem früheren auf.
14. **Eine ältere App-Fassung bleibt bedienbar.** Jede geänderte Signatur oder neue Abweisung
    einer Datenbankfunktion (G-5, G-6, G-16 in `rechnung_anlegen`; M-4; Z-4) funktioniert mit
    einer noch im Gerät liegenden Fassung weiter oder lehnt verständlich ab; Datenbank und Edge
    Function werden getrennt ausgeliefert (P-7). Eine Funktion wird erst entfernt, wenn keine
    ausgelieferte Fassung sie mehr ruft (L-14).
15. **Handbuch und Stand je Paket.** Jedes Paket zieht `docs/handbuch/handbuch.html` (Stempel
    mit der Zahl der Prüfungen) und `docs/stand-2026-10-03.md` nach; jede neu benannte oder
    geänderte Grenze kommt mit ihrem Grund in `docs/grenzen-durchsicht-2026-10-24.md`.

---

## 3. Kürzel, Urteile und Listen — Lesehilfe

**Kürzel der Befunde**

| Kürzel | Bedeutung | Quelle |
|---|---|---|
| Z-, A-, P-, G-, M-, S-, L- mit Nummer | belegter Befund zur Funktion: Zeit und Personal, Auftragskette, Planung und Scheine, Geld, Material, Grundlagen und Sicherheit, Technik | Papiere 1 bis 7, je Abschnitt 2 |
| `Verdacht <Gebiet>-n` (z. B. Verdacht S-4) | Verdachtsfall, im Papier nicht zu Ende geprüft. In den Papieren 2, 3, 4, 6, 7 heißen sie „V-1 …“, in den Papieren 1 und 5 haben sie keine Nummer (hier in der Reihenfolge des Papiers gezählt) | Papiere 1 bis 7, je Abschnitt 3 |
| `I-<Gebiet>n` (z. B. I-G2) | Idee zum Zusammenspiel der Funktionen. Im Papier 6 heißen sie „I-1 … I-7“, sonst sind sie nur nummeriert | Papiere 1 bis 7, je Abschnitt 5 |
| V-1 bis V-16 | Befund der Vermessung der Oberfläche | Papier 8, Abschnitt 2 |
| V-B1 bis V-B11 | Unstimmigkeit der Vermessung (im Papier 8 „B-1 … B-11“) | Papier 8, Abschnitt 3 |
| D1-, D2-, D3-, D4- | Oberfläche je Bereich: D1 Monteur und Hülle (Papier 9), D2 Büro — Aufträge (10), D3 Büro — Geld und Material (11), D4 Planung, Team, Einstellungen (12) | Papiere 9 bis 12 |
| … -A, -B, -C, -I, -T, -P | A Fehler gegen die Linie · B Unstimmigkeit zwischen Seiten · C Bedienung · I Idee · T zu viel Text · P statt der Punkte | |
| D3-1 bis D3-17 | Fehler gegen die Linie im Papier 11 (dort ohne Buchstaben) | Papier 11, Abschnitt 2 |
| D3-C0 bis D3-C13 | **Achtung:** im Papier 11 sind die „C“ die *Ideen*, nicht die Bedienung. Die neun durchgespielten Aufgaben des Papiers 11 haben kein Kürzel; sie heißen hier „Aufgabe 1 bis 9 (Papier 11)“ | Papier 11, Abschnitte 4 und 5 |
| `N-<Gebiet>-n` (z. B. N-G-1) | **neuer Befund aus der Gegenprüfung** — Nebenbefund oder geklärter Verdachtsfall eines Prüfers | Prüfberichte, Abschnitt 4.8 |
| E-… | Entscheidung oder Frage an den Auftraggeber (Abschnitt 10) | |
| K-… | Frage an Kanzlei oder Steuerberatung (Abschnitt 11) | |
| E mit Zahl (E74, E99 …), U1 bis U13, G22, G29 | frühere Entscheidungen und Regeln aus `docs/ui-umbau/entscheidungen.md`, `docs/design/v10/style.md` und dem Stand | |

**Urteile der Gegenprüfung** (Spalte „Gegenprüfung“ in jeder Befundtabelle, in den Worten der Prüfer)

| Urteil | Bedeutung |
|---|---|
| bestätigt (nachgestellt) | der Prüfer hat den Befund selbst nachgestellt: an einer Wegwerf-Datenbank, mit eigenem Skript oder mit eigener Messung im Browser |
| bestätigt (am Code) | der Prüfer hat den Beleg an Datei und Zeile nachgelesen; nachstellen ließ sich der Befund in seiner Umgebung nicht |
| teilweise | ein Teil stimmt, ein Teil nicht — Umfang, Ursache, Einordnung oder Vorschlag. Der Kurztext nennt den berichtigten Umfang |
| widerlegt | der Befund stimmt nicht (Abschnitt 8.1) |
| nicht prüfbar | der Prüfer konnte den Bildschirm nicht erreichen |
| auf Risiko geprüft | nur bei den 18 Ideen des Papiers 9: der Prüfer hat nicht bestätigt, sondern geprüft, woran die Idee stößt |

Wo Papier und Prüfbericht einander widersprechen, gilt der Prüfbericht — er hat nachgestellt. Wo
zwei Prüfberichte einander widersprechen oder ein Vorschlag gegen eine Regel oder Entscheidung
steht, entscheidet dieser Plan nicht stillschweigend, sondern führt den Punkt als Frage mit
Empfehlung (Abschnitt 10).

**Wohin ein Kürzel gehört** (Spalte „Paket“ bzw. „Paket oder Liste“): jedes Kürzel steht genau
einmal in einem Paket (Zahl 1 bis 29) oder in einer der vier Listen des Abschnitts 8 —
„widerlegt“ (8.1), „keine Handlung“ (8.2), „brauchte eine Entscheidung — bleibt, wie es ist“
(8.3, mit der Nummer der Entscheidung) oder „zurückgestellt — neue Entscheidung nötig“ (8.4).
Wo ein Befund an zwei Stellen gebaut werden muss, steht das Kürzel bei einem Paket und der andere Teil ausdrücklich als „Teil von …“ beim anderen.

Schwere: **h** hoch, **m** mittel, **n** niedrig. Aufwand: **k** bis ½ Tag, **m** bis 2 Tage,
**g** größer.

---

## 4. Befunde: Funktion

Einzelheiten, Belege, Vorschlag, Prüfung und „bleibt gleich“ je Befund stehen im jeweiligen
Papier; die Berichtigungen der Prüfer stehen als Vorgabe im Paket (Abschnitt 9). Art, Schwere und
Aufwand sind die des Papiers; wo ein Prüfer sie berichtigt hat, steht der berichtigte Wert.

### 4.1 Zeit und Personal (`analyse/1`, geprüft in `pruefung/1`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| Z-1 | Mit eingeschaltetem Monatsabschluss lässt sich über Stunden eines abgeschlossenen Monats keine Rechnung ausstellen, stornieren und keine Baustelle umnummern. Kein Rückfall, sondern Nebenwirkung des Monatsabschlusses vom 16.11. | Fehler | h | m | bestätigt (nachgestellt) | 1 |
| Z-2 | „Urlaub genehmigen“ und „Urlaub kürzen“ rechnen wieder mit den heutigen Arbeitstagen der Person statt mit denen zum Datum (Rückfall; an der Datenbank nachgestellt: ein Tag zu viel bzw. zwei zu wenig gebucht) | Fehler | h | k | bestätigt (nachgestellt) | 1 |
| Z-3 | Zeitkonto kennt keinen Abgang außer Zeitausgleich; ausbezahlte Überstunden bleiben im Saldo | Lücke | h | g | bestätigt (am Code) | 21 |
| Z-4 | 14-Tage-Grenze der rückwirkenden Krankmeldung über „Ende ändern“ umgehbar, Büro erfährt nichts | Fehler | m | k | bestätigt (nachgestellt) | 5 |
| Z-5 | Wiedereintritt überschreibt Eintritt und Saldo-Start; alte Monate verlieren ihr Soll | Fehler | m | m | bestätigt (nachgestellt) | 21 |
| Z-6 | Im abgeschlossenen Monat geht über den Korrekturantrag nur das Ändern einer eigenen bestehenden Buchung, nicht der vergessene Tag und nicht das Löschen. Die Meldung der Datenbank verweist beim Anlegen und Löschen auf einen Weg, den es nicht gibt; die zwei Texte der Oberfläche sind nur unscharf | Lücke | m | m | teilweise | 21 |
| Z-7 | „Monat abschließen“ prüft und zeigt nichts; offene Anträge hängen danach fest | Lücke | m | m | bestätigt (nachgestellt) | 21 |
| Z-8 | „Krank ab Mittag“ lässt sich nicht abbilden. Gebaut wird der Vorschlag des Papiers: am ersten Tag einer Krankmeldung darf „Krank“ neben „Anwesend“ stehen, gutgeschrieben wird der Rest zum Tagessoll — keine stundenweise Krankmeldung | Lücke | m | m | bestätigt (nachgestellt) | 21 |
| Z-9 | Sonderurlaub, Pflegefreistellung, unbezahlten Urlaub kann nur die Person selbst eintragen, nur neun Anlässe | Lücke | m | m | bestätigt (am Code) | 21 |
| Z-10 | Ändern sich die Arbeitstage je Woche, bleibt der Resturlaub in Tagen stehen | Lücke | m | m | bestätigt (am Code) | 21 |
| Z-11 | Urlaubsjahr für alle derselbe Tag; das Arbeitsjahr je Person fehlt | Grenze | m–h | g | bestätigt (am Code) | 21 |
| Z-12 | Urlaub verjährt ohne Vorwarnung | Lücke | m | m | bestätigt (am Code) | 21 |
| Z-13 | Lohn-Datei kennt Personen nur über den Namen, Zeitkontostand fehlt | Lücke | n–m | k | bestätigt (am Code) | 21 |
| Z-14 | „Wegzeit“ zählt nirgends als Arbeitszeit (unbenannte Annahme). Das Papier schlägt nur vor, die Grenze zu benennen | Grenze | n–m | k/m | bestätigt (am Code) | 21 |
| Z-15 | Nichts verhindert, dass eine neu definierte Funktion einen früheren Textersatz verwirft | f. Prüfung | m | k | bestätigt (nachgestellt) | 1 |
| Z-16 | Resturlaub des Monteurs hängt an einer Liste mit fester Obergrenze | Grenze | n | k | bestätigt (am Code) | 29 |

### 4.2 Auftragskette (`analyse/2`, geprüft in `pruefung/2`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| A-1 | Der Abschluss-Dialog zählt „nicht verrechnet“ nach anderer Regel als der Kern. Vor der ersten Rechnung und nach einer Schlussrechnung, die ihre Belege verknüpft, stimmt die Meldung; falsch wird sie für Scheine und Stunden, die nach der Schlussrechnung dazukommen, und auf Regiebaustellen für Scheine ohne Material an einem schon abgerechneten Tag (Altrechnungen vor dem 12.11.) | Unstimm. | n–m | k | teilweise | 1 |
| A-2 | Baustellen- und Kundenakte speichern den ganzen Entwurf über einen veralteten Stand | Fehler | m | m | bestätigt (am Code) | 22 |
| A-3 | Nachtrag behält seine Baustelle beim Kundenwechsel; Annahme-Link hängt ohne Kundenvergleich an | Fehler | m | k | bestätigt (nachgestellt) | 3 |
| A-4 | Pauschalrechnung und Akte lesen höchstens 20 Angebote je Baustelle — die 20 mit der kleinsten Kennung (fest, aber fachlich beliebig) | Grenze | m | k | bestätigt (am Code) | 3 |
| A-5 | Empfänger eines versendeten Angebots nicht festgehalten (Nachdruck, Mail-Kopie, Archiv zeigen den heutigen) | Unstimm. | m | m | bestätigt (am Code) | 22 |
| A-6 | Geführter Abschluss kennt offene Angebote und kommende Termine nicht | Lücke | m | k | bestätigt (nachgestellt) | 22 |
| A-7 | Nachlass auf die Angebotssumme lässt sich nicht eingeben, ein geerbter nicht ändern | Lücke | m | m | bestätigt (am Code) | 22 |
| A-8 | Angebots-PDF mit festen Texten, ohne Zahlungs- und Ausführungsbedingungen je Betrieb | Grenze | m | m | bestätigt (am Code) | 22 |
| A-9 | Annahmeseite ohne Platz für AGB und Rücktrittsbelehrung | Grenze | m | k | bestätigt (am Code) | 22 |
| A-10 | Positionen des Angebots erreichen den Monteur nicht | Lücke | m | m | bestätigt (am Code) | 22 |
| A-11 | Vorschläge aus der Liegenschaft nur in „Neue Baustelle“, nicht in Eingang und Angebot | Lücke | m | k | bestätigt (am Code) | 22 |
| A-12 | Nach „Angenommen“ kein nächster Schritt; Eingang → Angebot landet auf der Akte statt im Formular | Lücke | n–m | k | bestätigt (am Code) | 18 |
| A-13 | Angebote schreibt nur die Führung; die Verwaltung sieht sie nicht | Grenze | m | m | bestätigt (am Code) | 22 |
| A-14 | Die Datenbank lässt „Angenommen“ ohne Rücknahme verlassen und die Baustelle eines angenommenen Angebots umhängen. Aus der App erreichbar, sobald die Angebotsseite veraltet ist (Kunde nimmt über den Link an, das Büro tippt „Als abgelehnt markieren“). Das Umhängen eines versendeten Angebots ist gewollt | f. Prüfung | m | k | teilweise | 3 |
| A-15 | Dublettenfrage sucht nur in den ersten 50 Treffern | Fehler | n | k | bestätigt (am Code) | 22 |
| A-16 | Startseite kennt offene Angebote nicht (Bindefrist, liegen gebliebener Entwurf) | Lücke | n–m | m | bestätigt (am Code) | 22 |
| A-17 | Die Angebotsakte trägt zwei ⋯-Menüs. Das zweite ist am 15.11. bewusst so gebaut worden (U1/U4), steht aber gegen „⋯ nur im Seitenkopf“ | Unstimm. | n | k | bestätigt (am Code) | bleibt, wie es ist (8.3; E-R4) |

### 4.3 Planung, Startseite, Handwerksscheine (`analyse/3`, geprüft in `pruefung/3`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| P-1 | Vorgemerkter Schein, den der Server ablehnt, verschwindet samt Kundenunterschrift | Fehler | h | g | bestätigt (nachgestellt) | 5 |
| P-2 | „Mein Einsatzplan“ zeigt Einsätze an eigenen Urlaubs-/Krankentagen (über 62 Tage voraus oder „Wochenplan für alle“ aus) | Fehler | m | k | bestätigt (nachgestellt) | 5 |
| P-3 | Wochenplan, Tagesplanung, Startseite lesen höchstens 500 laufende Baustellen ohne Hinweis | Grenze | m | m | bestätigt (am Code) | 29 |
| P-4 | Offener Wochenplan zeigt Abwesenheiten, Termine, Baustellen wie beim Öffnen; Speichern prüft keine Abwesenheit | Lücke | m | m | bestätigt (am Code) | 23 |
| P-5 | Scheitert die Abfrage der Abwesenheiten, heißt es still „niemand fehlt“ | Fehler | n–m | k | bestätigt (am Code) | 5 |
| P-6 | Termine kennen keine Abwesenheit ihrer Teilnehmer | Lücke | m | k–m | bestätigt (am Code) | 23 |
| P-7 | Push bei geändertem Plan nur für heute und morgen; Freitag-für-Montag kommt nie an | Grenze | m | k–m | bestätigt (am Code) | 23 |
| P-8 | Ohne Netz zeigt die neu geöffnete App den Einsatz von heute nicht; kein Schein möglich | Grenze | m | m | bestätigt (am Code) | 23 |
| P-9 | „Stunden ohne Buchung“ prüft nur die 50 jüngsten Scheine (auf Knopfdruck 150); der Grund ist entfallen | Grenze | m | m | bestätigt (am Code) | 23 |
| P-10 | Der Abschluss zählt „unterschriebene Scheine nicht verrechnet“ nach anderer Regel als der Kern — nachgestellt in drei Fällen: Regie mit Stundenschein im abgerechneten Zeitraum, Regie mit Ersatzschein nach Storno, Pauschal mit gültiger Rechnung | Unstimm. | n–m | k | bestätigt (nachgestellt) | 1 |
| P-11 | Tagesübersicht, Baustellen-Sicht, Fenster „Tag“ zeigen nur die Uhrzeit der ersten Person | Unstimm. | n | k | bestätigt (am Code) | 17 |
| P-12 | Geführtes Abschließen sieht kommende Termine nicht (wie A-6) | Lücke | n | k | bestätigt (am Code) | 22 |

### 4.4 Geld (`analyse/4`, geprüft in `pruefung/4`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| G-1 | Der Kontoauszug-Abgleich hält ein Datum oder eine fremde Kennung aus Jahr und vierstelliger Zahl (Angebots-, Baustellen-, Auftragsnummer) im Zweck für eine Rechnungsnummer und wählt die Rechnung eines fremden Kunden vor. Betroffen sind 92 Nummern je Jahr (nicht rund 230), und nur, wenn eine Rechnung dieser Nummer desselben Jahres beteiligt ist | Fehler | m | k | teilweise | 3 |
| G-2 | Rabatt, „Bauleistung“, Rücklass, Steuerbefreiung, Rechnungsart bleiben beim Baustellenwechsel/Verwerfen stehen | Fehler | m | k | bestätigt (am Code) | 3 |
| G-3 | Haftrücklass rechnet nach Regie-Teilrechnungen nicht von der ganzen Leistung; Deckungsrücklass wird nicht fällig | Fehler/Lücke | m | m | bestätigt (am Code) | 24 |
| G-4 | BMD-Zahlungsstapel bucht Bar- und Kartenzahlungen auf das Bankkonto | Fehler | m | k | bestätigt (nachgestellt) | 4 |
| G-5 | Zeitbuchung zwischen Vorschau und Ausstellen geändert: neue Dauer gesperrt, alte verrechnet | Fehler | n–m | m | bestätigt (nachgestellt) | 3 |
| G-6 | Pauschale ohne offene Belege aus veralteter Vorschau zweimal verrechenbar | Fehler | n | k | bestätigt (nachgestellt) | 3 |
| G-7 | Mahnung lässt sich nicht zurücknehmen | Lücke | m | m | bestätigt (am Code) | 24 |
| G-8 | Offene Mahnspesen und Zinsen verschwinden, sobald die Hauptforderung bezahlt ist | Lücke | n–m | m | bestätigt (am Code) | 24 |
| G-9 | Exporte ohne Gedächtnis: übergebene Zeiträume still änderbar, Storno in zwei Exporten | Lücke | m | m–g | bestätigt (am Code) | 24 |
| G-10 | Kein Beleg für „weniger“. Der Weg über Anzahlung ersetzen, Guthaben umbuchen, Rest zurückzahlen funktioniert (nachgestellt), die Meldung nennt ihn nicht | Lücke | m | k/g | bestätigt (am Code) | 24 |
| G-11 | Zahlungsziel, Skonto, Nachlass nur je Betrieb oder Rechnung, nicht je Kunde | Lücke | m | m | bestätigt (am Code) | 24 |
| G-12 | Schema der Rechnungsnummer fest (Vorsatz, Jahr, ab 1001) | Grenze | n–m | m | bestätigt (nachgestellt) | 24 |
| G-13 | Übergabe an die Steuerberatung setzt doppelte Buchführung, Sollbesteuerung, BMD voraus | Grenze | m | m | bestätigt (am Code) | 24 |
| G-14 | Abzug einer Anzahlung prüft den Steuersatz nicht | Grenze | n | k | bestätigt (nachgestellt) | 3 |
| G-15 | Nachkalkulation sieht nur die 300 jüngsten Baustellen, rechnet alte Stunden mit dem heutigen Kostensatz | Grenze | n | m | bestätigt (am Code) | 29 |
| G-16 | Datenbank übernimmt die Summen einer Rechnung ungeprüft | f. Prüfung | n–m | k–m | bestätigt (nachgestellt) | 3 |
| G-17 | Prüfsumme des Mail-Anhangs nicht wiederherstellbar (Begründung einer Grenze trägt nicht) | Unstimm. | n | k | bestätigt (nachgestellt) | 24 |

### 4.5 Material (`analyse/5`, geprüft in `pruefung/5`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| M-1 | Support-Einblick: `lager_liste` und `anforderungen_laufend` enden im Fehler; `lager_frei` und `lager_knapp` antworten leer | Fehler | m | k | bestätigt (nachgestellt) | 1 |
| M-2 | Nachkalkulation verliert Lagerausgaben ab 1.000 Zeilen (wie L-1) | Fehler | m | k | bestätigt (am Code) | 1 |
| M-3 | Einheit eines Artikels änderbar, während Bestand, Anforderungen und Preise in der alten stehen. Der Import ändert sie still — aber nur bei Artikeln mit einem einzigen Großhändler; von Hand geht es ohne Warnung | Lücke | m | m | bestätigt (nachgestellt) | 6 |
| M-4 | Eigener Einkaufsposten mit anderer Einheit als der Katalogartikel; „Geliefert“ aus der Einkaufsliste bucht die Zahl roh. Der Wareneingang über die Bestellungen bucht richtig | Fehler | m | k | bestätigt (nachgestellt) | 6 |
| M-5 | Preisupdate des Großhändlers erreicht die Verkaufspreise nicht | Lücke | m | m | bestätigt (am Code) | 25 |
| M-6 | Nach dem Unterschreiben öffnet sich das Fenster des Scheins mit der Frage nach dem Verbrauch (gebaut, geprüft). Es fehlen: eine Erinnerung an offene Verbrauchsentscheidungen (Zähler, Liste) und die Frage nach einer Unterschrift ohne Netz | Lücke | n | k–m | teilweise | 25 |
| M-7 | Ein Fahrzeug hat genau einen Fahrer | Grenze | m | m | bestätigt (am Code) | 25 |
| M-8 | Wareneingang findet nur Lagerartikel und nicht über die Nummer am Lieferschein | Lücke | n–m | k | bestätigt (am Code) | 6 |
| M-9 | Bestellung hinterlässt keinen Beleg (Nummer, Stand, Lieferort); nur `mailto` | Lücke | m | g | bestätigt (am Code) | 25 |
| M-10 | Einheit einer frei getippten Zeile geht beim Teilen und auf der Bestellung verloren | Fehler | n | k | bestätigt (nachgestellt) | 6 |
| M-11 | Gelieferte Kommissionsware zählt als Zusage gegen den Bestand | Fehler | n | k | bestätigt (nachgestellt) | 6 |
| M-12 | Bewegungsprotokoll zeigt höchstens 200 Bewegungen, ohne Hinweis | Grenze | n–m | k | bestätigt (am Code) | 6 |
| M-13 | Kennzahl „Reserviert“ zählt Meter, Stück, Kilo zusammen | Unstimm. | n | k | bestätigt (nachgestellt) | 6 |
| M-14 | Verbuchte, zurückgesetzte Anforderung lässt sich ein zweites Mal bestellen | Fehler | n | k | bestätigt (nachgestellt) | 6 |
| M-15 | „Knapp“ ohne Mindestmenge heißt überall „höchstens 5 frei“ | Grenze | n | k | bestätigt (am Code) | 6 |
| M-16 | Kein Wächter prüft neue Lesefunktionen auf Support-Einblick und Zeilengrenze | f. Prüfung | n | k–m | bestätigt (am Code) | 1 |

### 4.6 Grundlagen und Sicherheit (`analyse/6`, geprüft in `pruefung/6`)

Kein belegter Befund, bei dem ein Konto Daten eines anderen Betriebs lesen oder schreiben kann.
Der Prüfer hat das an einer eigenen Stichprobe von 40 Funktionen nachgestellt (120 fremde Aufrufe,
Prüfsumme über alle 88 Tabellen mit `company_id` vorher und nachher gleich). **Offen bleibt der
Verdacht S-4** (Realtime: bei gelöschten Zeilen könnte der Primärschlüssel an Abonnenten anderer
Betriebe gehen) — er ist vor Paket 1 zu klären (Abschnitt 4.9). Neu ist N-G-2: eine Rechnung
nimmt die Kundenkennung eines fremden Betriebs an; lesbar wird der fremde Kunde dadurch nicht.

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| S-1 | Vier Listenfunktionen und `startseite-forderungen` weisen den Supportzugang ab (Rückfall K7b) | Fehler | m | k | bestätigt (nachgestellt) | 1 |
| S-2 | „Passwort ändern/vergessen“ meldet andere Geräte ab, lässt ihre Push-Anmeldungen stehen | Lücke | m | k | bestätigt (am Code) | 5 |
| S-3 | Bleiben beim Löschen eines Betriebs Anmeldekonten übrig, lässt sich die Löschung nicht abschließen | Fehler | m | m | bestätigt (nachgestellt) | 26 |
| S-4 | Notzugang/Support-Einblick: der Betrieb erfährt es nur auf der Einstellungsseite | Lücke | m | m | bestätigt (am Code) | 26 |
| S-5 | Ohne Netz vorgemerkte Anforderung/Nachricht, die der Server ablehnt, ist weg (bei der Anforderung ohne Grund) | Lücke | m | k | bestätigt (am Code) | 5 |
| S-6 | Von anderswo beendete Sitzung: offenes Fenster merkt es spät und nennt den falschen Grund | Fehler | n–m | k | bestätigt (am Code) | 5 |
| S-7 | Speicherregeln der Scheinfotos binden nicht an den Ersteller | Unstimm. | n | k | bestätigt (nachgestellt) | 26 |
| S-8 | Ein Mensch nur in einem Betrieb, Benutzername über alle Betriebe vergeben (unbenannt, kein Ausweg in der Maske) | Grenze | n | k | bestätigt (am Code) | 26 |
| S-9 | Auslieferung: Zugangsdaten mit vollem Zugriff in GitHub-Secrets, `npm ci` mit Skripten im selben Auftrag | Grenze | n–m | k | bestätigt (am Code) | 27 |
| S-10 | Kein Prüfnetz hält fest, dass lesende Funktionen im Einblick laufen | f. Prüfung | m | k | bestätigt (am Code) | 1 |
| S-11 | Inhaltsregel erlaubt jedes Supabase-Projekt; die Sicherheitsprüfung sagt „nur eigene Instanz“ | Unstimm. | n | k | bestätigt (am Code) | 26 |
| S-12 | Bericht nach „Person löschen“ nennt Scheine, Mahnungen, Pläne nicht, die Auskunft zählt sie | Lücke | n | k–m | bestätigt (nachgestellt) | 26 |
| S-13 | Übersicht der 122 Funktionen seit 15.11.: drei falsch für den Support, vier (nicht drei) Rückfälle für „Mitarbeiten“ — die drei Anforderungs-Rückfälle sind jetzt nachgestellt, der vierte ist N-S-2 | Unstimm. | n–m | k | teilweise | 1 |

### 4.7 Technik, Ladezeiten, Zustand (`analyse/7`, geprüft in `pruefung/7`)

| Kürzel | Befund — was nach der Gegenprüfung gilt | Art | Schw. | Aufw. | Gegenprüfung | Paket |
|---|---|---|---|---|---|---|
| L-1 | Nachkalkulation ruft zwei Funktionen ungeblättert; ab 1.000 Zeilen fehlen Kosten | Fehler | h | k | bestätigt (am Code) | 1 |
| L-2 | Kein Wächter für ungeblätterte Datenbankfunktionen (37 von 47 Aufrufen blättern nicht) | f. Prüfung | m | k | bestätigt (nachgestellt) | 1 |
| L-3 | Kunden- und Baustellenakte holen jede Rechnung ganz, um Köpfe zu zeigen; ab 500 fehlt der Rest | Grenze | m | m | bestätigt (am Code) | 29 |
| L-4 | Leistungswächter fast ohne Luft (254 von 260 Bausteinen, Rechnungen 131 von 135 KB): eine Datei mehr hält noch, die zweite bricht den Bau | Grenze | m | k/m | bestätigt (nachgestellt) | 2 |
| L-5 | Grenze „Belegschaft“ beruft sich wieder auf „bis etwa 30 Mitarbeiter“ | Unstimm. | n–m | k | bestätigt (am Code) | 28 |
| L-6 | Welche Seiten das Budget B3 (50 Zeilen) nicht halten, steht nirgends aktuell | Grenze | m | m je Seite | bestätigt (am Code) | 29 |
| L-7 | Schreiben über Datenbankfunktionen meldet den Live-Listen nichts. Elf Stellen in zehn Dateien halten einen Kanal direkt und hören nicht auf `beiEigenerAenderung` (nicht drei) | Lücke | m | m | bestätigt (am Code) | 23 |
| L-8 | Nach der Auslieferung prüft nichts, ob die neue Fassung live ist; Rücksprung dauert länger als beschrieben | Lücke | m–h | k/m | bestätigt (am Code) | 27 |
| L-9 | Gebaut wird vor dem Merge nur, wenn der Durchklick läuft | Lücke | m | k | bestätigt (am Code) | 2 |
| L-10 | Auslieferung auf Node 20 (ohne Pflege), Werkzeugfassungen uneinheitlich | Grenze | n–m | k | bestätigt (am Code) | 27 |
| L-11 | Wege des Büros laufen nie in WebKit, das Tablet nie in Safari | f. Prüfung | m | m | bestätigt (am Code) | 12 |
| L-12 | `InvoicesView` 6.574 Zeilen in einer Komponente | Grenze | m | g | bestätigt (am Code) | 7 |
| L-13 | L15: Ursache je träger Prüfung gemessen (viermal Rechenzeit in der Prüfung, einmal fehlende Frist) | f. Prüfung | n–m | k | bestätigt (nachgestellt) | 28 |
| L-14 | Toter Code in der Datenschicht, von Prüfungen am Leben gehalten. `anstehende` hat gar keinen Aufrufer; `ohneEinsatzListe` dient als Vergleichsregel einer Prüfung; die Sicht `monthly_stats` ist nicht tot | Unstimm. | n | k | teilweise | 28 |
| L-15 | Migrationen können im Projekt in anderer Reihenfolge landen als in der Prüfung. „Kein Fall in der Geschichte“ gilt nur für die sichtbare Geschichte seit 06.11.2026 (130 der 358 Migrationen) | f. Prüfung | n | k | teilweise | 27 |
| L-16 | Vier Texte beschreiben einen Stand, den es nicht mehr gibt | Unstimm. | n | k | bestätigt (am Code) | 28 |

### 4.8 Neue Befunde aus der Gegenprüfung

Nebenbefunde und geklärte Verdachtsfälle der Prüfer. Sie stehen in keinem Papier.

| Kürzel | Befund | Quelle | Urteil des Prüfers | Paket |
|---|---|---|---|---|
| N-Z-1 | Nach dem ersten Monatsabschluss lässt sich Einstufung, Lehrbeginn oder Lehrzeit einer Person nicht mehr ändern: `users_satz_nachziehen` setzt `satz = null` an allen unverrechneten Anwesend-Buchungen ohne Datumsgrenze und scheitert am abgeschlossenen Monat. Betroffen ist jede Person mit Stunden, die nie verrechnet werden | Bericht 1, Abschnitt 2a Nr. 1 | bestätigt (nachgestellt) | 1 |
| N-Z-2 | Zwei gleichzeitige Krankmeldungen derselben Person gehen beide durch: danach stehen zwei überschneidende Meldungen und an den gemeinsamen Tagen je zwei Zeilen „Krank“ | Bericht 1, Abschnitt 5 (Verdacht Z-1) | bestätigt (nachgestellt) | 5 |
| N-Z-3 | Der Monatsabschluss sperrt Eintritt und Austritt nicht: ein nachträglich geänderter Austritt oder Eintritt ändert das Soll eines abgeschlossenen Monats (168 → 96 Std.), ohne Spur am Abschluss | Bericht 1, Abschnitt 5 (Verdacht Z-4) | bestätigt (nachgestellt) | 21 |
| N-Z-4 | `users_betriebsurlaub_nachbuchen`: wird der Saldo-Start geändert und liegt Betriebsurlaub in einem abgeschlossenen Monat, scheitert das Speichern der Benutzerakte mit der Meldung „Monat abgeschlossen“ — fachlich richtig, die Meldung passt nicht (nur gelesen) | Bericht 1, Abschnitt 2a, Tabelle | bestätigt (am Code) | 21 |
| N-A-1 | Nach „Annahme zurücknehmen“ meldet der Link weiter „angenommen“; die Kundenseite zeigt bis zu 30 Tage „Vielen Dank. Sie haben das Angebot … verbindlich angenommen“ | Bericht 2, Abschnitt 5 (Verdacht A-2) | bestätigt (nachgestellt) | 22 |
| N-A-2 | Der Angebotsentwurf bekommt das neue Datum, bevor feststeht, dass die Mail hinausgeht: scheitert der Versand (auch an der 6-MB-Grenze), hat der Entwurf das Datum von heute | Bericht 2, Abschnitt 5 (Verdacht A-3) | bestätigt (am Code) | 22 |
| N-P-1 | Eine 404-Antwort ohne Inhalt gilt als angekommen: postgrest-js macht daraus Stand 204 ohne Fehler, das Fach räumt den Vorgang weg — ohne jede Meldung | Bericht 3, Abschnitt 5 (N-1) | bestätigt (nachgestellt) | 5 |
| N-P-2 | Eine Sperrseite (403, 404, 407 oder 200 mit HTML) kommt als Fehler ohne Code an, gilt als „unklar“ und wird nach fünf Läufen verworfen. Betroffen sind Geräte hinter einem Vorbau, der HTTPS aufbricht (Firmen-Firewall), nicht das gewöhnliche Gäste-WLAN | Bericht 3, Abschnitt 5 (Verdacht P-1) | bestätigt (nachgestellt) | 5 |
| N-P-3 | Sitzung nur mit Passwort (aal1) bei eingerichtetem zweitem Faktor, oder inzwischen deaktiviertes Konto: der Nachsender sendet, der Server lehnt mit 42501 ab, der einwandfreie Vorgang wird aufgegeben. In der Datenbank nachgestellt, der Weg durch die App nur gelesen | Bericht 3, Abschnitt 3.4 e) und f) | bestätigt (nachgestellt) | 5 |
| N-P-4 | „Wartung bearbeiten“ überschreibt das „Erledigt“ eines Kollegen: das Speichern eines davor geöffneten Formulars setzt die Fälligkeit zurück, die Wartung steht wieder als überfällig da (am Datenbankweg nachgestellt) | Bericht 3, Abschnitt 5 (Verdacht P-2) | bestätigt (nachgestellt) | 22 |
| N-P-5 | Auf einer abgeschlossenen Baustelle lässt sich ein neuer Einsatz anlegen: `einsatz_umplanen` (Kopieren), `einsatz_folgetage` und `einsatz_speichern` lesen `projects.status` nicht | Bericht 3, Abschnitt 5 (Verdacht P-4) | bestätigt (nachgestellt) | 23 |
| N-P-6 | Termin ändern ist „der Letzte gewinnt“: `terminAendern` schreibt die ganze Zeile ohne Vergleich mit dem gelesenen Stand (nicht nachgestellt) | Bericht 3, Abschnitt 5 (Verdacht P-3) | bestätigt (am Code) | 22 |
| N-P-7 | `schein_speichern` merkt nicht, wenn sein `update` am Zeilenschutz null Zeilen trifft: mit leeren Listen antwortet es mit der Kennung, ohne etwas gespeichert zu haben. Trifft nur Rollen ohne Schreibrecht am Schein | Bericht 3, Abschnitt 5 (N-2) | bestätigt (nachgestellt) | 5 |
| N-G-1 | `rechnung_anlegen` lässt sich direkt mit frei gewählter Nummer rufen (die App nutzt den Weg nicht): der Nummernkreis bekommt eine Lücke, oder der Betrieb kann keine Rechnung mehr ausstellen (`duplicate key`, der Zähler rollt jedes Mal zurück). Es braucht ein Bürokonto und einen Aufruf an der Oberfläche vorbei | Bericht 4, Abschnitt 5 (N-1) | bestätigt (nachgestellt) | 3 |
| N-G-2 | Eine Rechnung nimmt die Kundenkennung eines fremden Betriebs an (`rechnung_ausstellen`, `rechnung_ersetzen`): der Fremdschlüssel prüft den Betrieb nicht. Lesbar wird der fremde Kunde dadurch nicht | Bericht 4, Abschnitt 5 (N-2) | bestätigt (nachgestellt) | 3 |
| N-G-3 | Meldungstext: im neuen Jahr sagt die Abweisung einer Wunschnummer „die nächste ist 0001“, gezogen wird 1001 | Bericht 4, Abschnitt 5 (N-3) | bestätigt (nachgestellt) | 24 |
| N-G-4 | Menge und Preis werden beim Speichern gerundet (drei bzw. vier Nachkommastellen), der Betrag der Zeile nicht: die gespeicherte Zeile geht nicht mehr auf (0,333 × 68,00 = 22,66) | Bericht 4, Abschnitt 5 (N-4) | bestätigt (nachgestellt) | 3 |
| N-G-5 | „Leistungsnachweis anhängen“ und der Text der Steuerbefreiung bleiben auch nach dem Ausstellen stehen | Bericht 4, Abschnitt 5 (N-5) | bestätigt (am Code) | 3 |
| N-G-6 | „Überfällig“ entsteht nur, wenn jemand mit Schreibrecht die Rechnungsliste öffnet; bis dahin zeigt die Kundenakte „Offen“, während Startseite und Mahnlauf selbst rechnen | Bericht 7, Abschnitt 5 (Verdacht L-6) | bestätigt (am Code) | 24 |
| N-M-1 | „Geliefert“ bucht auch einen frei getippten Posten ohne Katalogartikel roh in den Bestand, wenn sein Name genau einem Artikel entspricht („3 Pkg Pressfitting 15“ → +3 Stk) | Bericht 5, M-4 | bestätigt (nachgestellt) | 6 |
| N-M-2 | Suche der Zählliste: `%` und `_` im Suchbegriff wirken als Platzhalter (`inventur_anlegen` sucht mit `ilike`), in der Lagerliste nicht. Auswirkung gering | Bericht 5, Abschnitt 5 | bestätigt (am Code) | 6 |
| N-M-3 | Die Lagerliste hört nicht auf Rüstlisten: „Reserviert“ bleibt nach einer geänderten Rüstliste auf einem anderen Gerät alt (nicht im Browser nachgestellt) | Bericht 5, Abschnitt 5 | bestätigt (am Code) | 23 |
| N-S-1 | `lager_frei` und `lager_knapp` antworten dem Support mit 0 Zeilen — still leer statt eines Fehlers; `lager_liste` verbindet mit `lager_frei` | Bericht 6, S-1 und Abschnitt 4; Bericht 5, M-1 | bestätigt (nachgestellt) | 1 |
| N-S-2 | Vierter Rückfall für „Mitarbeiten“: `baustelle_abschliessen` und `baustelle_abschluss_lage` scheitern im Supportzugang mit „Ausgegebenes Material sieht nur, wer Rechnungen schreibt“ (`ausgegebenes_material` nimmt den Betrieb nur aus dem Token) | Bericht 6, Abschnitt 3 Nr. 2 | bestätigt (nachgestellt) | 1 |
| N-S-3 | In den Ordner eines unterschriebenen Scheins lässt sich nachträglich eine Datei legen: `scheinfotos_anlegen` prüft den Stand des Scheins nicht (an der Regel nachgestellt). Ein Vergleich der geladenen Bytes mit dem Hash ist dem Prüfer im Code nicht begegnet | Bericht 6, Abschnitt 5 (Verdacht S-2) | bestätigt (nachgestellt) | 26 |
| N-S-4 | Bei sechs Funktionen hält die Rollenprüfung die Stufe „ansehen“ nicht auf (`app.hat_rolle`, `app.ist_fuehrung` u. a. geben für ein Plattformkonto ohne „mitarbeiten“ NULL zurück, `if not (…) then raise` lässt NULL durch); gehalten wird nur am Auslöser der Tabelle, den 34 Tabellen nicht haben. Heute schreibt dadurch nichts | Bericht 6, Abschnitt 2b und 4 | bestätigt (nachgestellt) | 26 |
| N-S-5 | `uid_pruefung_vorbereiten` zählt und begrenzt nichts; eine Obergrenze je Betrieb und Stunde fehlt | Bericht 6, Abschnitt 5 (Verdacht S-3) | bestätigt (am Code) | 26 |
| N-L-1 | `ausgegebenes_material` (eine Baustelle) wird ungeblättert gerufen — auch beim Rechnungstellen (`InvoicesView.tsx:1771`): über 1.000 Zeilen an einer Baustelle fehlte ausgegebenes Material im Vorschlag der Rechnung | Bericht 7, Abschnitt 3; Bericht 5, M-2 | bestätigt (am Code) | 1 |
| N-L-2 | Der Wert der Zeilengrenze im gehosteten Projekt (1.000) steht im Repo nur als Behauptung; gemessen ist überall der lokale Stapel, kein Workflow überträgt `config.toml` | Bericht 7, Abschnitt 3 | bestätigt (am Code) | 1 |
| N-L-3 | Die Monatsbuchungen der Mitarbeiterübersicht kommen mit allen Spalten (`timeEntries.ts:55–68`) | Bericht 7, Abschnitt 5 (Verdacht L-7) | bestätigt (am Code) | 29 |
| N-V-1 | Kalendertage der Monatsplanung am Handy 41 × 68 px (30 je Monat) — unter 44 px; im Papier nur für die Musterseite erwähnt | Bericht 8, V-5 | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-V5) |
| N-D1-1 | Lädt das Stammdatenblatt nicht, zeigt `/time` die Fehlermeldung und zusätzlich „Kein Startdatum konfiguriert“ (`TimeView.tsx:879–881`) | Bericht 9, Abschnitt 5 | bestätigt (am Code) | 14 |
| N-D-2 | Attrappen der Vorschau liefern falsche oder fehlende Daten: `mitarbeiterName` statt `mitarbeiter` (D1-A18), Stammdatenblatt lädt nicht (D1-T4), keine Kennung für „Nachricht“ am Einsatz, keine Zahl an den Segmenten der Kundenliste, „Material konnte nicht geladen werden“ in der Baustellenakte, Benutzerakte zeigt immer `u1` | Berichte 9, 10, 12 | bestätigt (nachgestellt) | 8 |
| N-D4-1 | Firmendaten am Schreibtisch: nach einer Änderung im ersten Feld ist bei 1440×900 keine Speicherleiste im Bild (sie steht 1.650 px unter dem Feld); ab 1.200 px ist jede Speicherleiste `position: static`, §112 nennt sie „klebend“ | Bericht 12, Abschnitte 3 und 5 | bestätigt (nachgestellt) | zurückgestellt (8.4; E-F30) |
| N-D4-2 | Zwei Baustellen desselben Kunden am Tablet: ohne Uhrzeit und bei gleichem Ort tragen die Kacheln denselben sichtbaren Text (die Nummer ist unter 1.200 px ausgeblendet) | Bericht 12, Abschnitte 3 und 5 | bestätigt (nachgestellt) | 17 |
| N-D4-3 | `style.md`, Absatz „Schalter und Kästchen“ (U6), ist noch der Stand vor E95 und widerspricht `schalterRegel.test.ts` | Bericht 12, Abschnitte 3 und 5 | bestätigt (am Code) | 11 |

### 4.9 Verdachtsfälle

Die 45 Verdachtsfälle der Papiere 1 bis 7. Sie werden nicht gebaut, sondern geklärt (Regel 1).
Die Prüfer haben elf geklärt, zehn am Code oder als Tatsache bestätigt (ohne sie ganz
nachzustellen) und zwei entkräftet; 22 sind offen.
**Vor Paket 1** stand in der Vorgabe: Verdacht S-4 (Realtime) und Verdacht G-4
(`rechnung_ersetzen`). Verdacht G-4 ist durch Bericht 4 entkräftet; **offen vor Paket 1 ist nur
noch Verdacht S-4**.

| Kürzel | Im Papier | Verdacht | Stand nach der Gegenprüfung | Zu klären vor / Folge |
|---|---|---|---|---|
| Verdacht Z-1 | Papier 1, §3 (1) | Zwei gleichzeitige Krankmeldungen derselben Person | geklärt: bestätigt (nachgestellt), Bericht 1 §5 | Befund N-Z-2, Paket 5 |
| Verdacht Z-2 | Papier 1, §3 (2) | Fenster der Wochenruhe eine bis zwei Stunden verschoben (Buchungen in UTC, Wochengrenzen nicht) | offen: am Code nachvollzogen, nicht nachgerechnet; es fehlt eine fachliche Festlegung | vor Paket 21 |
| Verdacht Z-3 | Papier 1, §3 (3) | Zeitpunkt eines Timer-Befehls kommt vom Gerät, wird nicht gegen die Serverzeit geprüft | offen (nicht geprüft) | vor Paket 21 |
| Verdacht Z-4 | Papier 1, §3 (4) | Monatsabschluss sperrt Eintritt und Austritt nicht | geklärt: bestätigt (nachgestellt), Bericht 1 §5 | Befund N-Z-3, Paket 21 |
| Verdacht Z-5 | Papier 1, §3 (5) | Deaktivieren mit Austritt in der Zukunft: Soll läuft weiter, für die Freistellung fehlt der Stand | offen (nicht geprüft) | vor Paket 21 (mit Z-9) |
| Verdacht Z-6 | Papier 1, §3 (6) | Einstellung „verfällt an einem festen Tag“ lässt Urlaub früher verfallen als das Gesetz | offen: Frage an die Kanzlei (K-9) | vor Paket 21 (mit Z-11, Z-12) |
| Verdacht Z-7 | Papier 1, §3 (7) | Summenzeile des Stundennachweis-PDF mit vielen Abwesenheitsarten | offen (nicht angesehen) | vor Paket 21 |
| Verdacht Z-8 | Papier 1, §3 (8) | `listOpenVacations` holt höchstens 100 offene Anträge | offen: ohne Reihenfolge in der Abfrage, kein Hinweis gefunden, wenn die Grenze greift; nicht weiter verfolgt | vor Paket 29 (mit Z-16) |
| Verdacht A-1 | Papier 2, V-1 | Kundenwechsel an einer Baustelle mit angenommenem Angebot oder Rechnungen | offen: der Code-Teil stimmt; die Folge für Rechnungen gehört zum Gebiet Geld (siehe N-G-2) | vor Paket 22 |
| Verdacht A-2 | Papier 2, V-2 | Kundenseite zeigt nach der Rücknahme weiter „angenommen“ | geklärt: bestätigt (nachgestellt), Bericht 2 §5 | Befund N-A-1, Paket 22, E-F20 |
| Verdacht A-3 | Papier 2, V-3 | Angebotsdatum wird beim Mailversand gesetzt, bevor die Mail hinausgeht | geklärt: bestätigt (am Code), Bericht 2 §5 | Befund N-A-2, Paket 22 |
| Verdacht A-4 | Papier 2, V-4 | Rücknahme löscht die Baustelle — Verweis der Wartung zeigt ins Leere | entkräftet (nachgestellt): `projects_wartung_freigeben` leert `wartungen.offene_baustelle` | keine Handlung |
| Verdacht A-5 | Papier 2, V-5 | Besichtigung nach dem Umwandeln in eine Baustelle | offen (nicht geprüft) | vor Paket 22 |
| Verdacht P-1 | Papier 3, V-1 | Sperrseite eines fremden Netzes kann einen vorgemerkten Vorgang verwerfen | geklärt: trifft zu (nachgestellt), mit Einschränkung; dazu die leere 404-Antwort | Befunde N-P-2 und N-P-1, Paket 5 |
| Verdacht P-2 | Papier 3, V-2 | „Wartung bearbeiten“ kann das „Erledigt“ eines Kollegen überschreiben | geklärt: trifft am Datenbankweg zu (nachgestellt) | Befund N-P-4, Paket 22 |
| Verdacht P-3 | Papier 3, V-3 | Termin ändern ist „der Letzte gewinnt“ | am Code bestätigt, nicht nachgestellt | Befund N-P-6, Paket 22 |
| Verdacht P-4 | Papier 3, V-4 | Kopieren und Folgetage prüfen den Zustand der Baustelle nicht | geklärt: trifft zu (nachgestellt) und geht weiter (`einsatz_speichern` ebenso) | Befund N-P-5, Paket 23, E-F19 |
| Verdacht P-5 | Papier 3, V-5 | Rückfälle durch E96/E98 im Browser nicht geprüft | offen (nicht geprüft) | vor Paket 17 (zweite Durchsicht nach Paket 8) |
| Verdacht G-1 | Papier 4, V-1 | Anzahlungsrechnung im Rechnungsstapel mit Steuercode am Rechnungsdatum | offen: Auskunft der Kanzlei (K-1) | vor Paket 24 (G-13) |
| Verdacht G-2 | Papier 4, V-2 | Entfernte Stundenposition sperrt ihre Buchungen trotzdem | als Tatsache bestätigt; ob gewollt, ist eine fachliche Entscheidung | E-F21, vor Paket 15 |
| Verdacht G-3 | Papier 4, V-3 | Kontoauszug lädt je gemahnter Rechnung eine eigene Abfrage | als Tatsache bestätigt, nicht gemessen | vor Paket 29 (messen) |
| Verdacht G-4 | Papier 4, V-4 | `rechnung_ersetzen` läuft mit den Rechten des Eigentümers | entkräftet (nachgestellt): fremde Zeitbuchung und Monteur werden abgewiesen. Dabei gefunden: N-G-1, N-G-2 | vor Paket 1 — erledigt |
| Verdacht G-5 | Papier 4, V-5 | E98: Summenzeile der zugeklappten Karten auf allen Breiten | offen (Browser) | vor Paket 15 (zweite Durchsicht nach Paket 8) |
| Verdacht G-6 | Papier 4, V-6 | Mahnspesen der Startseite rechnen „Unternehmer“ anders als die Rechnungsseite | offen (wird erst sichtbar, wenn die Startseite die Spesen zeigt) | vor Paket 24 (G-8) |
| Verdacht M-1 | Papier 5, §3 (1) | Last während eines Katalogimports (jede offene Lagerseite fragt rund tausendmal) | offen (nicht gemessen) | vor Paket 29 (messen) |
| Verdacht M-2 | Papier 5, §3 (2) | `lager_liste` bei sehr vielen Lagerartikeln | offen (nicht gemessen) | vor Paket 29 (messen) |
| Verdacht M-3 | Papier 5, §3 (3) | Die Lagerliste hört nicht auf Rüstlisten | am Code bestätigt, nicht im Browser nachgestellt | Befund N-M-3, Paket 23 |
| Verdacht M-4 | Papier 5, §3 (4) | Suche der Zählliste: Platzhalterzeichen | geklärt: trifft zu, Auswirkung gering | Befund N-M-2, Paket 6 |
| Verdacht M-5 | Papier 5, §3 (5) | Uhr des Geräts in „Laufend“ | die Angabe stimmt; der Vergleich mit der Startseite ist nicht gezogen | vor Paket 16 |
| Verdacht M-6 | Papier 5, §3 (6) | Wartende Retoure und Rechnung | offen (bräuchte die Rechnungsansicht) | vor Paket 15 (Idee I-M6) |
| Verdacht S-1 | Papier 6, V-1 | `betrieb-loeschen` bei vielen Konten (Zeitgrenze der Edge-Runtime) | offen (nicht angefasst) | vor Paket 26 (S-3) |
| Verdacht S-2 | Papier 6, V-2 | Scheinfoto nachträglich untergeschoben | geklärt: bestätigt (nachgestellt, an der Regel) | Befund N-S-3, Paket 26 |
| Verdacht S-3 | Papier 6, V-3 | `uid-pruefen` ohne Begrenzung | am Code bestätigt | Befund N-S-5, Paket 26 |
| Verdacht S-4 | Papier 6, V-4 | Realtime: bei gelöschten Zeilen könnte der Primärschlüssel an Abonnenten anderer Betriebe gehen | **offen** (nicht angefasst; braucht einen Realtime-Server). Papier 7 fand unter den Kanälen über `abonnieren` keinen ohne Filter auf den Betrieb | **vor Paket 1** |
| Verdacht S-5 | Papier 6, V-5 | Erster Administrator mit E-Mail: Rücksetzlink gilt einmal (Mail-Scanner) | offen (nicht angefasst; gehostetes Projekt) | vor Paket 26 |
| Verdacht S-6 | Papier 6, V-6 | Ältere Funktionen im Einblick (`kollegen`, `lager_knapp`) | geklärt: `lagerKnapp` hat im Client keinen Aufrufer mehr; `lager_frei` wird weiter gerufen (Folge unter S-1) | Befund N-S-1, Paket 1 |
| Verdacht S-7 | Papier 6, V-7 | Schlüssel des Altsystems in der Doku | offen (nicht angefasst) | vor Paket 26 |
| Verdacht S-8 | Papier 6, V-8 | Bitte „neues Passwort“ als Vorwand | offen (nicht angefasst); die Grenze von 200 je Stunde zählt über alle Betriebe (stimmt) | vor Paket 26 |
| Verdacht L-1 | Papier 7, V-1 | Zwei gleichzeitige Abgleiche einer Live-Liste entfernen eine eben gemeldete Zeile | am Code nachvollzogen, nicht nachgestellt; der Ablauf ist möglich | Voraussetzung für L-7: vor Paket 23 |
| Verdacht L-2 | Papier 7, V-2 | `scheine_verrechnet` ungeblättert | geklärt: heute kein Fehler (höchstens so viele Zeilen wie übergebene Kennungen; Aufrufer begrenzen) | Eintrag mit Grund im Wächter aus Paket 1 |
| Verdacht L-3 | Papier 7, V-3 | Zahl der Kanäle je Seite | offen (braucht das gehostete Projekt) | vor Paket 23 |
| Verdacht L-4 | Papier 7, V-4 | Indizes (Filter auf einen Ausdruck ohne Index) | die Aussage zum Lesen stimmt; gemessen ist nichts | vor Paket 29 (messen) |
| Verdacht L-5 | Papier 7, V-5 | Tippen in der Rechnungsansicht (Neuzeichnen je Taste) | offen (braucht die angemeldete App mit Profiler) | vor Paket 15 |
| Verdacht L-6 | Papier 7, V-6 | „Überfällig“ entsteht nur beim Öffnen der Rechnungsliste | am Code bestätigt | Befund N-G-6, Paket 24 |
| Verdacht L-7 | Papier 7, V-7 | Monatsbuchungen der Mitarbeiterübersicht mit allen Spalten | am Code bestätigt | Befund N-L-3, Paket 29 |

### 4.10 Benannte Grenzen ohne gültigen Grund

Die Papiere 1 bis 7 haben je in Abschnitt 4 die benannten Grenzen aus
`docs/grenzen-durchsicht-2026-10-24.md` neu bewertet. **Nachgezählt sind es 165 Tabellenzeilen**
(26 + 22 + 24 + 24 + 29 + 22 + 18); neun davon sind ausdrücklich „unbenannt/neu“, mindestens zehn
Einträge stehen in zwei Papieren, vier Zeilen des Papiers 7 stammen nicht aus dem
Grenzen-Dokument. Die Zahl „158“ der Fassung 1 ließ sich nicht herleiten (Bericht 0, Abschnitt 3).
Die Bewertungen selbst haben die Prüfer nur dort geprüft, wo ein Befund daran hängt.

Nach Grundsatz 6 bleibt eine Grenze nur stehen, wenn sie einen Grund hat (fachlich, rechtlich,
Datenschutz, Sicherheit, Altdaten, liegt bei jemand anderem). Die Tabelle führt jede Grenze, deren
Grund ein Papier oder ein Prüfer für nicht oder nur zum Teil gültig, für überholt oder für
unbenannt hält — mit Paket oder mit dem gültigen Grund.

| Nr. | Grenze | Quelle | Was am Grund nicht trägt | Paket oder gültiger Grund |
|---|---|---|---|---|
| 1 | Teilzeit: andere Kollektivverträge kennt Senklot nicht | Papier 1 | „Umfang“ ist kein Grund | Grund neu fassen (fachlich: Branchen-KV Metallgewerbe); für Angestellte mit der WKO klären — Paket 28 (Grenzen-Dokument) |
| 2 | M06: weitere Zeitmodelle, Durchrechnung, lohnwirksame Zulagen (E63) | Papier 1 | gültig (liegt bei WKO/Betreiber), aber seit 08.11. unbeantwortet | gültiger Grund: liegt bei jemand anderem — nachfassen |
| 3 | Der Monatsabschluss sperrt Saldo-Start, Startwerte, Urlaubsanspruch nicht | Papier 1; Bericht 1 | Eintritt und Austritt fehlen in der Aufzählung; eine Berichtigung hinterlässt keine Spur am Abschluss | N-Z-3, Paket 21 |
| 4 | Ohne Modul Korrekturanträge bleibt nur das Wiederöffnen | Papier 1 | auch mit Modul fehlen Nachtrag und Löschen | Z-6, Paket 21 |
| 5 | Die Vorschau beim Kürzen rechnet in Kalendertagen | Papier 1 | „einfacher“ ist kein Grund; die App hat die Rechnung schon | bauen, klein — Paket 21, nach Z-2 |
| 6 | Resturlaub beim Austritt steht nicht da | Papier 1 | gültig für den Betrag (Kanzlei), nicht für die Tatsachen, die nur die App kennt | Idee I-Z2 (Austrittsblatt) — zurückgestellt, neue Entscheidung nötig (E-F26); der Grund für den Betrag bleibt gültig (Kanzlei) |
| 7 | Aliquoter Urlaub, Arztbesuch im KV; Gleitzeit beim Arztbesuch | Papier 1 | gültig | gültiger Grund: liegt bei jemand anderem — nachfassen |
| 8 | Unbenannt: Urlaubsjahr nur als fester Tag | Papier 1 | kein gültiger Grund | Z-11, Paket 21 |
| 9 | Unbenannt: Wegzeit zählt nie als Arbeitszeit | Papier 1 | offen | Z-14: benennen in Paket 21; die Einstellung wartet auf die Kanzlei (K-5) |
| 10 | Unbenannt: Arbeitstage sind feste Wochentage (wechselnde Wochen nur gemittelt) | Papier 1 | offen | benennen (Paket 28); bauen erst, wenn ein Betrieb es braucht — Vorbehalt des Papiers: Nutzen unsicher |
| 11 | Unbenannt: die Rolle Administrator führt nie ein Zeitkonto | Papier 1 | für den Inhaber gültig, für eine angestellte Büroleitung nicht | Schalter je Person wie bei der Geschäftsführung, klein — Paket 21 |
| 12 | „E-Mail an …“ (Angebot) öffnet das Mailprogramm | Papier 2; Bericht 2 | überholt: seit F16 sendet die App Angebote | Zeile berichtigen — Paket 28 |
| 13 | Annahme per Link: Versand aus der App erst mit M14 | Papier 2; Bericht 2 | überholt: der Maildialog trägt den Link | Zeile streichen — Paket 28 |
| 14 | Annahme per Link: kein QR-Code | Papier 2 | „eine neue Bibliothek nur dafür“ ist „einfacher“, kein Grund | den Grund ehrlich als „kein Bedarf gemeldet“ benennen — Paket 28; der QR-Code selbst ist als Idee zurückgestellt |
| 15 | Liegenschaften: keine abweichende Rechnungsanschrift; „Sammelrechnung kommt mit M13“ | Papiere 2 und 4 | „kommt später“ ist kein Grund | E-F5: zurückgestellt — neue Entscheidung nötig; der Grund „kommt mit M13“ entfällt im Grenzen-Dokument; gebaut wird der Kundenvorschlag „Rechnungsempfänger“ (Paket 22) |
| 16 | Liegenschaftsakte zeigt je Liste höchstens 100 Baustellen bzw. Wartungen | Papier 2 | „die Akte ist ein Überblick“ trägt nicht; die Kundenakte lädt seit A12 vollständig nach | bauen wie in der Kundenakte, klein — Paket 18 |
| 17 | Die Verwaltung sieht beim Eingang nicht, dass sein Angebot im Papierkorb liegt | Papier 2 | Folge einer unbenannten Regel | mit A-13 (E-A13: Zusatzrecht je Person), Paket 22 |
| 18 | Unbenannt: feste Texte im Angebots-PDF, kein Rechtstext auf der Annahmeseite | Papier 2 | unbenannt | A-8, A-9 — Paket 22 |
| 19 | Unbenannt: Altangebote ohne festgehaltenen Empfänger | Papier 2 | unbenannt | mit A-5 benennen (Altdaten) — Paket 22 |
| 20 | Push bei geändertem Einsatzplan nur für heute und morgen | Papier 3 | gegen Meldungsflut gültig; für Freitag → Montag nicht | P-7, Paket 23 |
| 21 | Handwerksschein ohne jedes Netz neu beginnen | Papier 3 | für den ganzen Bestand gültig (Datenschutz); für die eigenen Einsätze von heute nicht | P-8, Paket 23 — wartet auf die Kanzlei (K-6); bis dahin bleibt die Grenze mit ihrem Grund (Datenschutz) |
| 22 | Ein vorgemerkter Schein, der anderswo unterschrieben oder verworfen wurde, kommt nicht mehr an | Papier 3 | für „unterschrieben“ gültig; für „verworfen“ und alle anderen Ablehnungen nicht — und nirgends steht, dass die Eingabe gelöscht wird | P-1, Paket 5; Grenze auf „überschreibt nicht“ einengen |
| 23 | Einsatz über mehrere Tage: höchstens 62 Tage je Speichern | Papier 3 | die 62 Tage sind eine Festlegung von `wochenplan_abwesend`, kein fachlicher Grund | Folgetage direkt gegen `app.abwesenheiten` prüfen (niedrige Dringlichkeit) — Paket 23 |
| 24 | Der Zwischenspeicher der Woche merkt sich auch einen Stand ohne Abwesenheiten | Papier 3 | „nicht Teil dieses Auftrags“ ist kein Grund | mit P-4, Paket 23 |
| 25 | Unbenannt: höchstens 500 laufende Baustellen in Planung und Startseite | Papier 3 | kein Grund vorhanden | P-3, Paket 29 |
| 26 | „Stunden ohne Buchung“ höchstens 50 bzw. 150 Scheine | Papier 3 | der Grund (Gewicht der Unterschriftsbilder) ist entfallen | P-9, Paket 23 |
| 27 | Scheine ohne eigene Nummer, auch in der Suche | Papier 3 | gültig (Entscheidung liegt beim Auftraggeber) — das Papier bittet, sie noch einmal vorzulegen | E-F27: bleibt, wie es ist — zurückgestellt, neue Entscheidung nötig |
| 28 | Die Push-Meldung zu einem Notfall nennt nur Nummer und Ort | Papier 3 | gültig; auffällig daneben: die Einsatzplan-Meldung nennt den Kundennamen am Sperrbildschirm | gültiger Grund (Datenschutz); die Einsatzmeldung der Kanzlei vorlegen (K-6) |
| 29 | Bestehende Schlussrechnungen mit Rest 0 bleiben „Offen“ | Papier 4; Bericht 4 | Altdaten gültig — aber der Betrieb kann sie selbst nicht schließen (ein Eingang über null ist verboten) | Handgriff „Zahlstand neu rechnen“ an der Rechnung, klein — Paket 24 |
| 30 | Kein abweichendes Rechnungsdatum in der Oberfläche | Papier 4; Bericht 4 | rechtlich gültig; die Folge ist unbenannt: ein Gerät mit falscher Uhr kann gar nicht ausstellen | die App schickt kein Datum mehr; Datum und Zahlungsziel kommen aus der Antwort der Datenbank — Paket 24 |
| 31 | BMD-Stapel vorgebaut bis zum Importtest; Umbuchungszeile | Papier 4 | gültig (Kanzlei), aber seit September offen — ohne den Test ist der Ablauf „Export an die Steuerberatung“ nicht von Anfang bis Ende belegt | gültiger Grund: liegt bei jemand anderem — Termin einfordern (K-1) |
| 32 | Eine Gutschrift an den Kunden ist ein Hinweis; keine negativen Positionen | Papiere 4 und 5; Bericht 4 | nur zum Teil; negative Zeilen gibt es technisch schon | G-10, Paket 24; Satz im Grenzen-Dokument berichtigen |
| 33 | Text und PDF einer Mail werden nicht gespeichert | Papier 4 | Datenschutz gültig; „das PDF entsteht jederzeit gleich“ stimmt nicht | G-17, Paket 24 |
| 34 | Vorgemerkte Umsätze und Rückbuchungen nur gezählt | Papier 4 | für Vorgemerktes gültig; eine Rücklastschrift zu einem verbuchten Eingang ist ein Rechnungsvorgang | Idee I-G5 — zurückgestellt, neue Entscheidung nötig (E-F26) |
| 35 | Nur die jüngste Mahnung per Mail | Papier 4 | gültig | nach G-7 gilt „jüngste nicht zurückgenommene“ — Paket 24 |
| 36 | Unverrechnete Stunden mit den Sätzen des Betriebs | Papier 4 | gültig; mit G-11 wären es die des Kunden | mit G-11 nachziehen — Paket 24 |
| 37 | Verbrauch am Schein nur einmal je Schein; Korrektur über die Inventur | Papier 5 | für den falsch gewählten Ort eine Abkürzung | „Buchung zurücknehmen“, solange der Schein nicht verrechnet ist — Paket 25, mit M-6 |
| 38 | Inventur bewertet den Bestand nicht | Papier 5 | die Bewertungsmethode liegt bei der Kanzlei; eine Spalte „Einkaufspreis“ im Protokoll nicht | CSV des Protokolls mit Einkaufspreis für die Spitze, klein — Paket 25 |
| 39 | Zählen und buchen nur Verwaltung und Leitung, nicht der Fahrer | Papier 5 | für das Buchen gültig; für das Zählen eine Annahme über den Betrieb | E-F28: zurückgestellt — neue Entscheidung nötig; für das Buchen bleibt der Grund gültig (fachlich: Kontrolle) |
| 40 | „E-Mail an …“: die App verschickt nichts an Großhändler; „bestellt“ ist bis M05a, was die Einkaufsliste führt | Papier 5 | seit F16 überholt; „kommt später“ ist kein Grund | M-9, Paket 25 |
| 41 | EAN und Preiseinheit nicht gegen echte Dateien geprüft | Papier 5 | gültig, der Nachweis steht weiter aus | gültiger Grund: liegt beim Pilotbetrieb — Dateien anfordern; bis dahin M-3 als Schutz |
| 42 | An weiteren Orten gibt es keine Reservierung | Papier 5 | gilt nur für Fahrzeuge; ein zweites Lager ist kein Fahrzeug | E-F28: zurückgestellt — neue Entscheidung nötig (groß; hängt daran, ob Betriebe mit zwei Standorten Zielgruppe sind) |
| 43 | Sollbestand am Artikel, nicht je Ort | Papier 5 | für die Bestellung gültig; die Bestückung eines Fahrzeugs deckt der Grund nicht | Idee I-M2 — zurückgestellt, neue Entscheidung nötig (E-F26) |
| 44 | „Zuletzt angefordert“ nur aus den letzten hundert eigenen Anforderungen | Papier 5 | „mehr lädt die Seite nicht“ ist „reicht“, kein Grund; Schaden gering | kleine Datenbankabfrage „zuletzt angeforderte Artikel“ — Paket 29 |
| 45 | Unbenannt: 500 offene eigene Posten, 200 Großhändler, 500 Vorschläge je Übernahme | Papier 5 | plausibel, aber unbenannt | ins Grenzen-Dokument — Paket 28 |
| 46 | Unbenannt: ein Fahrer je Fahrzeug; 200 Bewegungen; „knapp“ fest bei 5 | Papier 5 | unbenannt | M-7 (Paket 25), M-12, M-15 (Paket 6) |
| 47 | Sitzungsdauer und Ratenbegrenzung im gehosteten Projekt | Papier 6 | gültig (Betreiber) — aber `supabase/config.toml` lässt die Werte auch örtlich auskommentiert; es gibt keinen Stand, gegen den geprüft wird | Werte aus `DEPLOYMENT.md` in `config.toml` setzen und in einer Prüfung festhalten — Paket 26 |
| 48 | Handwerksschein ohne Netz: Vorgemerktes und Zeit-Entwürfe bleiben nach dem Abmelden auf dem Gerät | Papier 6 | gültig | ein Satz im Handbuch beim geteilten Tablet — Paket 28 |
| 49 | Alte App nutzt bis zum Neuladen den alten Auszug | Papier 6 | gültig, läuft von selbst aus | Zeile kann nach der nächsten Auslieferung entfallen — Paket 28 |
| 50 | Unbenannt: eine E-Mail-Adresse und ein Benutzername gelten über alle Betriebe | Papier 6 | gültig (der Anmeldedienst führt eine Adresse einmal), fehlt aber in der Übersicht | S-8, Paket 26 |
| 51 | Unbenannt: `passwort_hilfe_anfragen` nimmt höchstens 200 Bitten je Stunde über alle Betriebe zusammen | Papier 6; Bericht 6 | Schutz gültig; „über alle Betriebe“ ist bei vielen Betrieben eine Grenze ohne Grund | je Betrieb zählen, gesamt höher — Paket 26 |
| 52 | Unbenannt: Zugangstoken und Datenbankpasswort in GitHub-Secrets | Papier 6 | gültig (CI des Betreibers), aber nicht als Grenze geführt und gegen den Wortlaut von `CLAUDE.md` | S-9, Paket 27 — mit Grund benennen |
| 53 | Fassungswechsel am echten Telefon nicht geprüft; echtes iPhone: Lage der Inseln | Papier 7 | gültig (Gerät), seit 17.11. offen | gültiger Grund: Gerät — Termin mit dem Pilotbetrieb setzen |
| 54 | Belegschaft über 50 Zeilen, „Betriebe bis etwa 30 Mitarbeiter“ | Papier 7 | Annahme über den Betrieb | L-5, Paket 28 |
| 55 | Schreibwege über Datenbankfunktionen melden ihre Tabelle nicht; Abonnements ohne `abonnieren` | Papier 7; Bericht 7 | kein Grund (gebraucht wird nur der Tabellenname); es sind elf Stellen, nicht drei | L-7, Paket 23 |
| 56 | `KATALOG_GRENZE` 1.000, `KUNDEN_GRENZE` 500, `BAUSTELLEN_AUSWAHL_GRENZE` 500 | Papier 7 | die Begründung („greift bei einem Betrieb dieser Größe nirgends“) trägt nicht; die Grenzen selbst sind sichtbar und haben eine Suche | Begründung ersetzen — Paket 28; Baustellenauswahl mit L-6, Paket 29 |
| 57 | Kundenimport höchstens 5.000 Zeilen | Papier 7 | Annahme; die Grenze ist laut | als Schutz vor einer falschen Datei begründen und den Weg nennen, oder anheben — Paket 28 |
| 58 | L15 (träge Prüfungen) offen | Papier 7 | kein Grund | L-13, Paket 28 |

Unbenannt und neu zu benennen, weil nicht (ganz) gebaut: S-8, A-13, M-7 bis zum Bau, G-12 bis zum
Bau, G-13, Z-14, P-3 bis zum Bau; dazu die Grenzen, die dieser Plan neu benennt: `baustellen_budget_lage`
bleibt dem Support verschlossen (Grund: Datenschutz — Zeitbuchungen gehören nicht zum Support),
Push hängt am Gerät (E69; betrifft P-7 und S-4), „Umplanen geht im Einblick nicht“ (Grund:
Datenschutz — Abwesenheiten liest nur der Betrieb). A-4 wird gebaut (Paket 3) und nicht benannt.
Das Grenzen-Dokument wird in Paket 28 auf diesen Stand gebracht.

### 4.11 Ideen zum Zusammenspiel der Funktionen

Der Auftraggeber hat ausdrücklich nach dem Zusammenspiel gefragt. Die Papiere 1 bis 7 führen je in
Abschnitt 5 zusammen 58 Ideen; Fassung 1 hatte sie nicht erwähnt. Die Prüfer haben diese
Abschnitte nicht bewertet. Jede Idee ist hier eingeordnet: entweder sie deckt sich mit einem
Befund und wird in dessen Paket gebaut, oder sie ist eine eigene Idee. Für die eigenen Ideen
belegen weder Papier noch Prüfer einen Nutzen ohne Verlust — sie sind nach E-F26
**zurückgestellt und brauchen je eine neue Entscheidung. Keine eigene Idee ist eingeplant.**

| Kürzel | Im Papier | Idee | Einordnung |
|---|---|---|---|
| I-Z1 | Papier 1, §5 Nr. 1 | „Monat fertig machen“: Prüfliste, Auszahlung der Überstunden buchen, Monats-CSV, Abschließen in einem Zug | deckt sich mit Z-7, Z-3, Z-13, D4-C4 (Paket 21) |
| I-Z2 | Papier 1, §5 Nr. 2 | Austrittsblatt für die Lohnverrechnung (Zeitkonto zum Austrittstag, genommene und offene Urlaubstage) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (gehört zur Grenze „Resturlaub beim Austritt“, Abschnitt 4.10) |
| I-Z3 | Papier 1, §5 Nr. 3 | Zeitkonto in der Monats-CSV | deckt sich mit Z-13/Z-3 (Paket 21) |
| I-Z4 | Papier 1, §5 Nr. 4 | Krankmeldung mit Stand der Bestätigung („liegt vor / fehlt“) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-Z5 | Papier 1, §5 Nr. 5 | Hinweis vor der Verjährung | deckt sich mit Z-12 (Paket 21, nach K-3) |
| I-Z6 | Papier 1, §5 Nr. 6 | Berufsschule wiederkehrend („jeden Dienstag bis zum …“) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-Z7 | Papier 1, §5 Nr. 7 | „Für jemanden eintragen“ an einer Stelle (Krank, Urlaub, Sonderurlaub, Berufsschule) | deckt sich zum Teil mit Z-9 (Paket 21); der Rest ist eine eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-Z8 | Papier 1, §5 Nr. 8 | Vom abgewiesenen Buchen direkt zum Antrag (Knopf in der Meldung „Monat abgeschlossen“) | deckt sich mit Z-6 (Paket 21) |
| I-Z9 | Papier 1, §5 Nr. 9 | Vorschlag beim Wechsel der Arbeitszeit (Urlaub umrechnen) | deckt sich mit Z-10 (Paket 21, nach K-3) |
| I-Z10 | Papier 1, §5 Nr. 10 | Überstunden auszahlen / Zeitkonto berichtigen | deckt sich mit Z-3 (Paket 21) |
| I-Z11 | Papier 1, §5 Nr. 11 | Halber Urlaubstag | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-Z12 | Papier 1, §5 Nr. 12 | Sechste Urlaubswoche (angerechnete Vordienstzeiten) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (Kanzlei) |
| I-Z13 | Papier 1, §5 Nr. 13 | Lohnarten und Übergabe an die Lohnsoftware | eigene Idee — steht auf der Roadmap, wartet auf Dritte; als eigene Idee zurückgestellt (E-F26) |
| I-Z14 | Papier 1, §5 Nr. 14 | Ersatzruhe und Arbeit am Feiertag | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (Kanzlei) |
| I-A1 | Papier 2, §5 Nr. 1 | Auftragsbestätigung als PDF nach der Annahme | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-A2 | Papier 2, §5 Nr. 2 | Anzahlung als Schritt der Annahme | deckt sich zum Teil mit A-12 („Anzahlung stellen“ an der angenommenen Akte, Paket 18) |
| I-A3 | Papier 2, §5 Nr. 3 | Ablehnungsgrund auch im Büro | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-A4 | Papier 2, §5 Nr. 4 | Vorgang auf einen Blick (Eingang → Angebot → Baustelle → Rechnungen) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-A5 | Papier 2, §5 Nr. 5 | Angebot aus Leistungspaketen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-A6 | Papier 2, §5 Nr. 6 | Deckungsbeitrag im Angebot | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-A7 | Papier 2, §5 Nr. 7 | Dringlichkeit bis in die Planung | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (verwandt mit I-P5) |
| I-P1 | Papier 3, §5 Nr. 1 | Leistungszeit am Schein aus dem, was die App schon weiß | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-P2 | Papier 3, §5 Nr. 2 | Der Wartungseinsatz zeigt dem Monteur die Anlage | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-P3 | Papier 3, §5 Nr. 3 | Fällige Wartungen in „Noch einzuplanen“ | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (verwandt mit D2-C6) |
| I-P4 | Papier 3, §5 Nr. 4 | Den Kunden zur Wartung einladen und den Termin bestätigen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-P5 | Papier 3, §5 Nr. 5 | „Noch einzuplanen“ nach Dringlichkeit statt nur nach Name | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (berührt E96) |
| I-P6 | Papier 3, §5 Nr. 6 | Lieferung und Termin der eigenen Baustelle im Einsatz von heute | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-P7 | Papier 3, §5 Nr. 7 | Die Rüstliste gehört zum Plan der Person (Änderung am Abend melden) | deckt sich zum Teil mit P-7 (Paket 23); der Rest ist zurückgestellt (E-F26) |
| I-P8 | Papier 3, §5 Nr. 8 | Fahrzeug je Einsatz | deckt sich zum Teil mit M-7 (Paket 25); der Rest ist zurückgestellt (E-F26) |
| I-P9 | Papier 3, §5 Nr. 9 | Schein „im Büro geprüft“ | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-G1 | Papier 4, §5 Nr. 1 | Nach dem Ausstellen gleich senden | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (verwandt mit der Regel in Abschnitt 6.5) |
| I-G2 | Papier 4, §5 Nr. 2 | Zahlschein-Code (EPC-QR) auf Rechnung und Mahnung — entschärft G-1 an der Wurzel | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-G3 | Papier 4, §5 Nr. 3 | Konditionen je Kunde | deckt sich mit G-11 (Paket 24) |
| I-G4 | Papier 4, §5 Nr. 4 | Mahnen und senden in einem Zug | deckt sich mit D3-C4 — bleibt, wie es ist (E-R15) |
| I-G5 | Papier 4, §5 Nr. 5 | Rücklastschrift aus dem Kontoauszug als negativen Eingang vorschlagen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (gehört zur Grenze „Rückbuchungen nur gezählt“) |
| I-G6 | Papier 4, §5 Nr. 6 | Nach dem Verbuchen des Kontoauszugs der Anstoß zum Abschließen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-G7 | Papier 4, §5 Nr. 7 | Offene Posten je Kunde als Schreiben | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-G8 | Papier 4, §5 Nr. 8 | Abweichender Rechnungsempfänger und Sammelrechnung | zurückgestellt — neue Entscheidung nötig (E-F5) |
| I-G9 | Papier 4, §5 Nr. 9 | Ausgestelltes PDF ablegen statt neu erzeugen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (verwandt mit G-17, Paket 24) |
| I-M1 | Papier 5, §5 Nr. 1 | Material aus dem angenommenen Angebot bestellen oder anfordern | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-M2 | Papier 5, §5 Nr. 2 | „Fahrzeug auffüllen“ (Sollbestückung je Fahrzeug) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (gehört zur Grenze „Sollbestand am Artikel, nicht je Ort“) |
| I-M3 | Papier 5, §5 Nr. 3 | Rücksendung an den Großhändler | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-M4 | Papier 5, §5 Nr. 4 | Nächster Schritt nach „Geliefert“ | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-M5 | Papier 5, §5 Nr. 5 | Wareneingang mit der Kamera (EAN lesen) | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (baut auf M-8 auf) |
| I-M6 | Papier 5, §5 Nr. 6 | Wartende Retoure in der Rechnungsvorschau nennen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (Verdacht M-6 zuerst klären) |
| I-M7 | Papier 5, §5 Nr. 7 | Bestellwert | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (erst nach M-9) |
| I-S1 | Papier 6, §5 I-1 | Supportfall in einem Zug | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-S2 | Papier 6, §5 I-2 | „Wer sieht mit?“ sichtbar | ergänzt S-4 (Paket 26); als eigene Idee zurückgestellt (E-F26) |
| I-S3 | Papier 6, §5 I-3 | Verlorenes Telefon als ein Handgriff | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-S4 | Papier 6, §5 I-4 | Zwei-Faktor einladend statt nur als Pflicht | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-S5 | Papier 6, §5 I-5 | Angemeldete Geräte zeigen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) |
| I-S6 | Papier 6, §5 I-6 | Passkeys statt Passwort und Code | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (groß) |
| I-S7 | Papier 6, §5 I-7 | Nach dem Rollenwechsel weiterarbeiten statt neu anmelden | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (Vorbehalt im Papier) |
| I-L1 | Papier 7, §5 Nr. 1 | Zeitkonto je Monat zeigen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26); sie entscheidet über `zeitkontoMonate` (L-14) |
| I-L2 | Papier 7, §5 Nr. 2 | Die Messung als Auftrag in der CI | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (stützt L-6, Paket 29) |
| I-L3 | Papier 7, §5 Nr. 3 | Die Akten in die Messung aufnehmen | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (stützt L-3, Paket 29) |
| I-L4 | Papier 7, §5 Nr. 4 | Rauchprobe nach der Auslieferung | ergänzt L-8 (Paket 27); als eigene Idee zurückgestellt (E-F26) |
| I-L5 | Papier 7, §5 Nr. 5 | Ein Datumshelfer statt zwölf | eigene Idee — zurückgestellt, neue Entscheidung nötig (E-F26) (passt zu Paket 10) |

---

## 5. Befunde: Oberfläche

Jedes Kürzel der Papiere 8 bis 12 steht hier mit dem Urteil seines Prüfers und mit dem Paket
oder der Liste, in die es gehört. Messwerte, Ursache und Vorschlag stehen im Papier; die
Berichtigungen der Prüfer stehen als Vorgabe im Paket.

**Was die Gegenprüfung an der Einordnung geändert hat:** Die Messwerte stimmen fast überall auf
den Pixel. Was oft nicht stimmt, ist die Einordnung „Fehler gegen die Linie“: bei etlichen
Befunden trägt keine Regel und keine Entscheidung die Einordnung, oder der gemessene Zustand ist
durch eine Entscheidung ausdrücklich gewollt (im Papier 12 trägt eine Regelquelle nur vier der
vierzehn „Fehler“ ganz). Solche Punkte werden hier nicht als Fehler geführt: sie stehen in der
Liste „bleibt, wie es ist“ (8.3) oder „keine Handlung“ (8.2), oder sie sind im Kurztext als
Unstimmigkeit gekennzeichnet.

### 5.1 Vermessung über alle Seiten (`analyse/8`, geprüft in `pruefung/8`)

Gemessen wurden 65 Routen (darin Modul- und Abfragevarianten), 177 Paare Route × Rolle, 863
Zustände auf 390, 834 und 1440 px: 56.091 Textelemente, 1.933 Blätter, 13.479 Bedienelemente;
Kontrast im hellen und dunklen Satz an jedem Text. Der Prüfer hat die Summen gegen die Rohdaten
nachgezählt und jeden Befund an der genannten Stelle neu gemessen.

**Gesamtbild (bestätigt, nachgestellt an 16 Seiten × 3 Breiten):** Die Bausteine halten die Linie
fast lückenlos — Schriftstufen, Radien, Seitenrand 16/24/40 px, kein seitlicher Überlauf, keine
Pillen, keine Glas- oder halbtransparenten Flächen, Schatten nur an Schwebendem, im dunklen Satz
kein Kontrastbefund. Der Satz der Fassung 1, die Ausreißer säßen dort, „wo eine Seite eigene
Klassen an den Bausteinen vorbei schreibt“, stimmt nur zum Teil: sechs der sechzehn Befunde
liegen am Baustein oder an einer Grundregel (V-1, V-2, V-5, V-13, V-14, V-15).

| Kürzel | Befund — was nach der Gegenprüfung gilt | Gegenprüfung | Paket oder Liste |
|---|---|---|---|
| V-1 | Leer- und Fehlersatz der Klasse `leer` steht ab dem Tablet 8 px vor der Flucht (16 statt 24 px) | bestätigt (nachgestellt) | Paket 9 |
| V-2 | Arbeitszeile beginnt ab dem Tablet 4 px vor der Flucht (Kästchen bei 20 statt 24 px) | bestätigt (nachgestellt) | Paket 9 |
| V-3 | Blätter nebeneinander liegen neben dem Raster: `/invoices` 20 statt 24 px (auch zugeklappt, in jeder Rolle), `/assignments/tag` 36 px, `/worksheet` 8 px daneben | teilweise | Paket 9 |
| V-4 | Zweites ⋯ außerhalb des Seitenkopfs in der Angebotsakte (Administrator, Projektleitung, Geschäftsführung; die Buchhaltung hat gar kein ⋯) | teilweise | bleibt, wie es ist (8.3; E-R4) |
| V-5 | Tastflächen unter 44 px am Handy: drei echte Ausreißer (Suchfeld der Listenleiste 40 px, die Lupe nimmt den Tipp nicht; „alle ausblenden“ 20 px; „Im Plan ansehen“ 18 px). Zwei sind gedeckt (`label`, antippbare Zeile), einer unerheblich, der kleine Knopf gewollt | teilweise | Paket 9 |
| V-6 | Platzhalter der Personensuche in `/accounting` 2,54 : 1 | bestätigt (nachgestellt) | Paket 9 |
| V-7 | Fehlertafel der `ErrorBoundary` steht außerhalb der Linie (`ErrorBoundary.tsx:129–148`) — nicht dasselbe wie D4-A3 | bestätigt (nachgestellt) | Paket 20 |
| V-8 | Handgebaute Tabelle der Mitarbeiterübersicht: Kopf 15 px statt 12 versal, Stunden in DM Sans. Dieselbe Art Tabelle steht an zwei weiteren Stellen (Positionen in „Rechnung erstellen“, Beispielrechnung in den Sätzen) | bestätigt (nachgestellt) | Paket 19 |
| V-9 | Beschriftungen im Rechnungsfenster und in der Einsatz-Vorschau des Monats 15 statt 13 px | bestätigt (nachgestellt) | Paket 15 |
| V-10 | Blatttitel der Rechtsseiten 16 statt 18 px (`RechtInhalt.tsx:16`) | bestätigt (nachgestellt) | Paket 20 |
| V-11 | Handgebaute Feldbeschriftungen weichen vom Baustein ab: Kennzeichen (Zeit), „Notiz“ (Kunde bearbeiten), „Problem melden“, dazu `KatalogImport.tsx:439` | bestätigt (nachgestellt) | Paket 14 |
| V-12 | Titel im Wartungsfenster mit freier Tailwind-Stufe (18/25,6 px) | bestätigt (nachgestellt) | Paket 18 |
| V-13 | Tastaturfokus setzt jeden Radius auf 8 px: runde Knöpfe werden eckig, ein per Enter geöffnetes Fenster fällt von 24 auf 8 px — und jedes Eingabefeld wechselt bei jedem Fokus, auch nach einem Fingertipp, von 12 auf 8 px | bestätigt (nachgestellt) | Paket 9 |
| V-14 | Kleiner Knopf mit 8 px, Zeilenknopf mit 12 px Radius — kein Versehen: die kleinere Rundung ist am Baustein beschrieben (`knopf.ts:88–96`) und geprüft (`KnopfLink.test.tsx:27`); `style.md` sagt „einheitlich, etwa 12 px“ | teilweise | bleibt, wie es ist (8.3; E-V4) |
| V-15 | Kopf der Akte endet neben dem Raster: Benutzer- und Kundenakte 6 px (`.akten-identitaet`), Angebotsakte am Handy (Meta-Zeile 52 px), Baustellenakte 12 px in jeder Breite | teilweise | Paket 9 |
| V-16 | Vorhandene Messung `vorschau:messen`: 35 Ansichten mit Meldungen, keine neue echte; fünf Falschmeldungen fehlen in `HARMLOS` und in der README | bestätigt (nachgestellt) | Paket 8 |
| V-B1 | Zeilenhöhe: je Schriftstufe bis zu neun Werte | bestätigt (nachgestellt) | Paket 9 |
| V-B2 | Titel: zwölf Größen zwischen 16 und 30 px ohne Stufen | bestätigt (am Code) | Paket 10 |
| V-B3 | Gemessenes steht nicht überall in Plex Mono (Nummern, Zeiten in Begleitzeilen) | bestätigt (nachgestellt) | Paket 11 |
| V-B4 | Drei sichtbare Formen des Suchfelds; im Quelltext 17 Suchfelder (darunter Auswahlfelder für Baustelle, Kunde, Person, Katalog) | teilweise | Paket 9 |
| V-B5 | Abschnittskopf versal/400 und gemischt/500 nebeneinander — beides ist entschieden (E92) | bestätigt (nachgestellt) | keine Handlung (8.2) |
| V-B6 | Verweise in vier Formen (Gewicht nicht geregelt) | bestätigt (nachgestellt) | Paket 9 |
| V-B7 | Kleine Radien neben der Skala (2 bis 6 px) | bestätigt (am Code) | Paket 9 |
| V-B8 | Monatsbalken tragen den 3-px-Petrolstrich links — durch E96 entschieden („die Balken der Monatsansicht bleiben“) und eigens geprüft (`einsatzbalken.test.ts:115–118`) | bestätigt (nachgestellt) | keine Handlung (8.2) |
| V-B9 | Kennwerte im Seitenkopf: 17/400 ab Tablet, 15/500 am Handy — gewollt (E86) | bestätigt (nachgestellt) | keine Handlung (8.2) |
| V-B10 | Tabelle im Blatt: Text 16 px hinter der Flucht des Titels | bestätigt (nachgestellt) | Paket 9 |
| V-B11 | Reiter der Akte am Handy zwei- und dreizeilig — der Umbruch ist gewollt; der Dreizeiler entsteht bei vier Reitern mit langem Namen (mit fünf rollt die Leiste schon) | teilweise | keine Handlung (8.2) |

**Was die Tests heute nicht erzwingen** (Papier 8, Abschnitt 8: 17 Zeilen, die 17. ist ein Hinweis
für die README): Schrift außerhalb der Skala in Fenstern, Menüs und auf Routen außerhalb der 46
geprüften Seiten; freie Tailwind-Größen im Code; Rolle falsch trotz gültiger Stufe; handgebaute
Tabellen, Beschriftungen, Suchfelder; Text rechts der Flucht; Blätter neben dem Raster;
Tastflächen; Kontrast von Platzhaltern; Form unter Fokus; Radius außerhalb der Rollen; ⋯
außerhalb des Seitenkopfs; Trennpunkte; lange Texte offen. Keinen dieser Wächter gibt es schon
(vom Prüfer durchsucht). **Mehrere schlügen heute an gewollten Stellen an** — die Tabelle der
Ausnahmen steht in Paket 9.

### 5.2 Monteur und Hülle (`analyse/9`, geprüft in `pruefung/9`)

Geprüft bei 390×844, 390×1300, 375×667 und 1440×900; die vorgeschlagenen Zeilenformen wurden mit
den Schriften der App bei 375 px nachgebaut. Nicht geprüft: 834 px und der dunkle Satz.

| Kürzel | Befund — was nach der Gegenprüfung gilt | Gegenprüfung | Paket oder Liste |
|---|---|---|---|
| D1-A1 | Wisch-Aktion „Löschen“ bricht mitten im Wort um (`.wisch-knopf`; zwei Aufrufer: Zeit, Anforderungen) | bestätigt (nachgestellt) | Paket 9 |
| D1-A2 | „Eintrag löschen“ steht als Knopf direkt über dem Speichern (gegen U4) | bestätigt (nachgestellt) | Paket 14 |
| D1-A3 | Inhalt eines Blatts klebt an der Linie unter dem Titel — betroffen ist genau ein Blatt (`TimeView.tsx:1161`), nicht „jedes“ | bestätigt (nachgestellt) | Paket 9 |
| D1-A4 | „Fahrzeug (Kennzeichen)“ ist kein Feld aus dem Baustein (Beschriftung und Rand weichen ab; = V-11) | bestätigt (nachgestellt) | Paket 14 |
| D1-A5 | Zeilen mit Papierkorb (Berufsschule) und eine Zeitausgleichszeile tragen den Wert nicht auf der Flucht der übrigen (x 298 bzw. 242 statt 358) | teilweise | Paket 14 |
| D1-A6 | Schrittleiste des Scheins stößt an die Fußinsel (0 px; Timer-Leiste 8 px). Die Quelle ist schwach: nur der 8er-Rhythmus und der Vergleich tragen es | bestätigt (nachgestellt) | Paket 14 |
| D1-A7 | Erste Karte im Schein beginnt 8 px unter der Blattkante (übrige 24 px) | bestätigt (nachgestellt) | Paket 14 |
| D1-A8 | Zwischentitel im Schein ohne Abstand zum ersten Feld | bestätigt (nachgestellt) | Paket 14 |
| D1-A9 | Platzhalter abgeschnitten in „Nicht im Katalog?“ (Feld 94 px, Text braucht 202 px) | bestätigt (nachgestellt) | Paket 14 |
| D1-A10 | Hinweis „In den letzten 4 Wochen“ klebt unter der Kopflinie (Material) | bestätigt (nachgestellt) | Paket 14 |
| D1-A11 | Eckige Pfeilknöpfe in „Startseite anpassen“ (Radius 0) | bestätigt (nachgestellt) | Paket 13 |
| D1-A12 | Adresse in „Neue Nachricht“ steht in Plex Mono (ganze Unterzeile) | bestätigt (nachgestellt) | Paket 14 |
| D1-A13 | Hauptaktion des letzten Schein-Schritts ist zweizeilig — kein Fehler: der Umbruch zwischen zwei Wörtern ist Entscheidung E82 für genau diesen Knopf | teilweise | bleibt, wie es ist (8.3; E-R2) |
| D1-A14 | Zusammenfassung im Schein: Zeile nicht ganz antippbar, nur der Stift reagiert | bestätigt (nachgestellt) | Paket 14 |
| D1-A15 | Textpfeil „→“ statt des Zeichens „›“ — vier Stellen (Startseite dreimal, Rüstliste) | bestätigt (nachgestellt) | Paket 13 |
| D1-A16 | „Baustellen-Threads“ im Seitenkopf der Nachrichten — kein englischer Rest: „Thread“ ist an mindestens zehn sichtbaren Stellen, im Handbuch und in `style.md` das Wort der App | teilweise | bleibt, wie es ist (8.3; E-R5) |
| D1-A17 | Im Gespräch steht am Handy beim Öffnen nicht, mit wem man schreibt (6 von 7 Läufen). Ursache ist nicht eine fehlende Meldung, sondern der Beobachter in `KopfTitel.tsx`: er verpasst den Sprung ans Ende beim Öffnen | teilweise | Paket 9 |
| D1-A18 | Führender Trennpunkt „· 08:30 Std“ im Schein-Fenster — Folge der Beispieldaten (`mitarbeiterName` statt `mitarbeiter`), kein Fehler der App | teilweise | Paket 8 |
| D1-A19 | Seitenleiste am Schreibtisch läuft bei 1440×900 aus dem Bild — beim Monteur nur Rechtstexte und Marke, schon bei der Verwaltung „Problem melden“, Darstellung und „Abmelden“ | bestätigt (nachgestellt) | Paket 13 |
| D1-A20 | „Neue Fassung“-Leiste deckt am Handy die Fußinsel (nur im Code gelesen; in der Vorschau nicht auslösbar) | bestätigt (am Code) | Paket 13 |
| D1-A21 | Meldung liegt am Handy auf der Kopfinsel — keine Regel verletzt: oben ist Absicht (G29) | teilweise | bleibt, wie es ist (8.3; E-R12) |
| D1-A22 | Falsche Tastaturen: „Pause“, „Wegzeit“ ohne `inputmode`, Kennzeichen, Helfer, Suche ohne Angaben; `enterKeyHint` einmal im Code | bestätigt (am Code) | Paket 10 |
| D1-B1 | Derselbe Einsatz in zwei Anordnungen (Startseite: dreigeteilte Leiste; Einsatzplan: zwei Knöpfe plus Verweise) | bestätigt (nachgestellt) | Paket 14 |
| D1-B2 | Baustellennummer in drei Formen (`.zeile-nr` Mono 12 gerahmt, `.nr` DM Sans 13, `.neu-nr` Mono 13) | bestätigt (nachgestellt) | Paket 11 |
| D1-B3 | Fuß von Blatt und Fenster in vier Formen | bestätigt (nachgestellt) | Paket 9 |
| D1-B4 | „* Pflichtfeld“-Legende nur in 7 von 69 Formularen mit Pflichtfeldern | bestätigt (am Code) | bleibt, wie es ist (8.3; E-F23) |
| D1-B5 | Dauer in mehreren Schreibweisen („0:00:00“, „… h“, „08:30 Std“, „09:00“, „240 h kalkuliert“) | bestätigt (nachgestellt) | Paket 10 |
| D1-B6 | Wochentag mit und ohne Punkt, Datum in fünf Längen | bestätigt (nachgestellt) | Paket 10 |
| D1-B7 | Kalenderkopf zweimal verschieden (Monat im Einsatzplan, Team-Woche) | bestätigt (nachgestellt) | Paket 14 |
| D1-B8 | Gruppenüberschrift in Blättern und Listen in zwei Formen (12/400 versal, 12/500 normal) | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-F2) |
| D1-B9 | Zähler am Kartentitel in mehreren Formen („(10)“, „· 4 Einsätze“, „noch 1 von 2“) | bestätigt (nachgestellt) | Paket 11 |
| D1-B10 | Timer-Leiste auf weißem Grund, Inseln auf `--surface-2` | bestätigt (nachgestellt) | Paket 13 |
| D1-B11 | „Aufgabe“ am ersten Einsatz ohne, unter „Danach“ mit Strich | bestätigt (nachgestellt) | Paket 13 |
| D1-B12 | „Startseite anpassen“: zwei Kästchen neben sechs Schaltern — durch E95 so gewollt (`schalterRegel.test.ts:89`: Auswahl aus einer Liste) | teilweise | bleibt, wie es ist (8.3; E-R6) |
| D1-B13 | Darstellungsschalter in der Seitenleiste am Schreibtisch ohne sichtbares Wort | bestätigt (nachgestellt) | Paket 13 |
| D1-B14 | Drei Namen und zwei Zeichen für „Mein Konto“ | bestätigt (nachgestellt) | Paket 10 |
| D1-B15 | Fenster-Fuß klebt oder rollt: im Blatt wird die `Aktionsleiste` mit `erstNachDemRollen` (G22) nie frei, weil sie nur auf das Rollen des Fensters hört | bestätigt (nachgestellt) | Paket 9 |
| D1-C1 | „Zeit buchen“ ist beim Öffnen des Zeitblatts nicht zu sehen (Inhalt 1.249 px in 591 px) | bestätigt (nachgestellt) | Paket 9 |
| D1-C2 | „Aufteilen“ gibt es erst am gespeicherten Eintrag | bestätigt (nachgestellt) | zurückgestellt (8.4; E-F8) |
| D1-C3 | Im Korb ist „Abschicken“ aus dem Bild (hinter der Kopfinsel) | bestätigt (nachgestellt) | Paket 14 |
| D1-C4 | Gesperrte Hauptaktion des Scheins nennt keinen Grund | bestätigt (nachgestellt) | Paket 14 |
| D1-C5 | „Meine Baustellen“ ist eine Sackgasse (nur Karte und Telefon) | bestätigt (nachgestellt) | Paket 14 |
| D1-C6 | Tipp auf einen Tag im Einsatzplan zeigt nichts (Tagesliste beginnt unter dem Bildrand) | bestätigt (nachgestellt) | Paket 14 |
| D1-C7 | Kein „Büro“ als Empfänger; das Menü am Beitrag ist ein Zeichen ohne Wort | bestätigt (nachgestellt) | zurückgestellt (8.4; E-F7) |
| D1-C8 | „Suchen oder springen“ am Handy ohne sichtbaren Ausgang | bestätigt (nachgestellt) | Paket 13 |
| D1-C9 | Rückmeldungen in Technikersprache („Zeitsitzung verwerfen“, „Kein Startdatum konfiguriert“) | bestätigt (nachgestellt) | Paket 14 |
| D1-I1 | Timer-Leiste auch im Zustand „bereit“ auf den Seiten des Monteurs | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I2 | Kopfinsel mit Rückweg „‹“ in Akte, Schein und Gespräch | auf Risiko geprüft | bleibt, wie es ist (8.3; E-R10) |
| D1-I3 | Großer Titel schrumpft weich in die Kopfinsel | auf Risiko geprüft | Paket 13 |
| D1-I4 | Rückmeldung beim Antippen für Zeilen und Knöpfe | auf Risiko geprüft | Paket 9 |
| D1-I5 | `:hover` nur für Zeigegeräte (80 Regeln ohne `(hover: hover)`) | auf Risiko geprüft | Paket 9 |
| D1-I6 | Startbild für iOS | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I7 | Zahl am App-Zeichen | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I8 | Manifest sperrt die Hochkant-Lage, die Unterschrift sagt „Quer halten“ — ein falscher Hinweis in einer bestehenden Funktion | auf Risiko geprüft | Paket 14 |
| D1-I9 | Laufender Arbeitstag im dunklen Satz mit feiner heller Kontur | auf Risiko geprüft | Paket 13 |
| D1-I10 | Zustand nach Rückkehr aus dem Hintergrund behalten | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I11 | Ziehen zum Aktualisieren auch in Blättern mit Liste | auf Risiko geprüft | Paket 13 |
| D1-I12 | Blatt in zwei Höhen | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I13 | Kontextmenü an Zeilen (langes Drücken) | auf Risiko geprüft | zurückgestellt (8.4; E-F4) |
| D1-I14 | Postfach: Zeit kurz, der Titel bekommt die Breite | auf Risiko geprüft | Paket 14 |
| D1-I15 | Im Gespräch die Fußinsel ausblenden, solange die Tastatur offen ist | auf Risiko geprüft | Paket 14 |
| D1-I16 | Rüstliste: „Rückgängig“ in der Meldung statt des Dauersatzes | auf Risiko geprüft | Paket 14 |
| D1-I17 | Kennzahl „Resturlaub“ neben dem Arbeitstag statt als Band | auf Risiko geprüft | bleibt, wie es ist (8.3; E-R11) |
| D1-I18 | Profil: „Mein Konto“ mit Person statt Glocke; „App erneuern“ und Fassung hinter „Problem melden“ | auf Risiko geprüft | Paket 13 |
| D1-T1 | Untertitel der Seitenköpfe (zehn Seiten) wiederholen ab Tablet den Titel; am Handy sind sie schon ausgeblendet (E86) | bestätigt (am Code) | Paket 11 |
| D1-T2 | Startseite: „… · Rolle: Mitarbeiter“ im Seitenkopf | bestätigt (nachgestellt) | Paket 13 |
| D1-T3 | Erklärsatz unter jeder Rüstliste (Startseite zweimal, Einsatzplan je Rüstliste) | bestätigt (nachgestellt) | Paket 14 |
| D1-T4 | „Saldo — / Kein Startdatum konfiguriert“: in der Vorschau Folge der Attrappe; in der App steht der Satz nur bei einem Konto ohne Startdatum und ist dann die Auskunft | teilweise | Paket 14 |
| D1-T5 | Kennzahl „Zuschlag“ nennt auch den Wert null („Nacht 00:00 · …“) | bestätigt (nachgestellt) | Paket 14 |
| D1-T6 | Meldung „Timer-Schritt auf diesem Gerät vorgemerkt …“ | bestätigt (nachgestellt) | Paket 14 |
| D1-T7 | Blatt-Titel „Zeitsitzung verwerfen“ statt „Arbeitstag“ | bestätigt (am Code) | Paket 14 |
| D1-T8 | Zeitformular: Beschriftungen mit Klammerzusatz. Der Satz „Ohne Baustelle zählt …“ steht schon nur bei freier Baustelle | teilweise | Paket 14 |
| D1-T9 | Meine Baustellen: „B-2026-0147 · 03.08.2026 · 240 h kalkuliert“ | bestätigt (nachgestellt) | Paket 14 |
| D1-T10 | Material: zwei Zeilen Erklärung am Verweis „Material zurückgeben“ | bestätigt (nachgestellt) | Paket 14 |
| D1-T11 | Korb-Karte sagt zweimal „noch nicht abgeschickt“ | bestätigt (nachgestellt) | Paket 14 |
| D1-T12 | Schein, Schritt 1: Datum im Titel doppelt, langer Leersatz | bestätigt (nachgestellt) | Paket 14 |
| D1-T13 | Schein, Schritt 2: Leersatz und „Freie Zeile (nicht im Lager geführt)“ | bestätigt (am Code) | Paket 14 |
| D1-T14 | Schein, Schritt 3: Höchstzahl der Fotos doppelt, „am Gerät verkleinert“ | bestätigt (am Code) | Paket 14 |
| D1-T15 | Scheinliste, Fenster eines Entwurfs: „Prüfsumme — Entsteht mit der Unterschrift.“ | bestätigt (nachgestellt) | Paket 18 |
| D1-T16 | Urlaub, Zeile „Beantragt“: „… bitte noch nichts fix buchen.“ — der Satz schützt vor Schaden | teilweise | Paket 19 |
| D1-T17 | Urlaub, „Antrag stellen“: „Der Anspruch ist der Restanspruch beim Umstieg.“ — steht schon nur bei einem Umstiegsstand | teilweise | Paket 19 |
| D1-T18 | Mein Konto: Karte „Darstellung und Bewegung“ (zur Bewegung gibt es nichts zu wählen) | bestätigt (am Code) | Paket 20 |
| D1-T19 | Einsatzplan: zwei Zeitstempel des Kalender-Abos | bestätigt (nachgestellt) | Paket 14 |
| D1-T20 | Einsatzplan: Legende unter jedem Monat | bestätigt (nachgestellt) | Paket 14 |
| D1-T21 | Postfach: „09.11.2026 13:42“ je Gespräch | bestätigt (nachgestellt) | Paket 14 |
| D1-T22 | Verbindungsband: 155 Zeichen. Der vorgeschlagene Kurztext wäre falsch: vorgemerkt werden nur Zeitbuchung, Anforderung und Handwerksschein | teilweise | Paket 13 |
| D1-T23 | Rückfrage beim Abmelden: rund 300 Zeichen | bestätigt (am Code) | Paket 13 |
| D1-T24 | Profil-Blatt endet mit „Fassung · App erneuern · Datenschutz · Impressum“ | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-W1) |
| D1-T25 | Zeitliste, Zeile am Handy: fünf Angaben in drei Zeilen, der Name abgeschnitten | bestätigt (nachgestellt) | Paket 14 |
| D1-P1 | Zeitliste „Tag · Zeitspanne“: der Tag als Gruppenkopf. Mit langem Namen drei bis vier Textzeilen statt zwei; das Muster nennt keinen Platz für Zustand, Marken und Knöpfe; der Nutzen stützt sich auf die vierfach gebuchten Tage der Vorschau | teilweise | Paket 14 |
| D1-P2 | „Nächste Einsätze“: Tag · Zeit unter einem Namen | bestätigt (nachgestellt) | Paket 14 |
| D1-P3 | „Nächste Termine“: Tag · Art · Zeit — die Form trägt, aber im Muster fehlen Teilnehmer, Notiz und Kartenverweis | teilweise | Paket 14 |
| D1-P4 | Nummer · Zeit bzw. Nummer · Abrechnung (Startseite, Schein, Scheinliste): die vorgeschlagene Form trägt bei 375 px nicht (vier Zeilen statt drei) | teilweise | Paket 14 |
| D1-P5 | Dreierkette in „Meine Baustellen“ | bestätigt (nachgestellt) | Paket 14 |
| D1-P6 | Kennzahl-Zusatz „Nacht · Notdienst · letzte 3 Monate“ | bestätigt (nachgestellt) | Paket 14 |
| D1-P7 | Knopf-Unterzeile „Wie zuletzt buchen“ | bestätigt (nachgestellt) | Paket 14 |
| D1-P8 | Titel · Zähler im Kartenkopf: „eine Form für alle Karten“ stößt an E98 (Zahl im Titel der Klappkarten) und E99 („3 Rechnungen“ im Kopf) | teilweise | Paket 11 |
| D1-P9 | Seitenkopf der Startseite: „START · KW 48“ und „Datum · Rolle“ | teilweise | Paket 13 |
| D1-P10 | Artikel-Meta in der Materialliste: die vorgeschlagene Form wird bei 375 px bis zu vierzeilig | teilweise | Paket 14 |
| D1-P11 | „Meine Anforderungen“: Nummer · Notiz | bestätigt (nachgestellt) | Paket 14 |
| D1-P12 | Urlaub: „10 Urlaubstage · Anmerkung“ — „10 Tage“ verlöre die Art | teilweise | Paket 19 |
| D1-P13 | Postfach: Nummer · Kurzname als Titel — trägt; im Kopf des Gesprächs am Handy schon so gebaut (E86) | teilweise | Paket 14 |
| D1-P14 | Schein-Fenster: Meta-Zeilen als Angabenpaare | bestätigt (nachgestellt) | Paket 18 |
| D1-P15 | Zwei kurze gleichrangige Angaben („KW 48 · 23.11. – 29.11.“) — darf bleiben | bestätigt (nachgestellt) | keine Handlung (8.2) |
| D1-P16 | Team-Woche: „Montag 23.11. · heute“ | bestätigt (nachgestellt) | Paket 14 |
| D1-P17 | Einträge der Auswahlfelder des Geräts — bleibt (E91) | bestätigt (nachgestellt) | keine Handlung (8.2) |

### 5.3 Büro — Aufträge (`analyse/10`, geprüft in `pruefung/10`)

Geprüft bei 1440, 834, 390 und 375 px. Kein Fehler gegen die Linie ist eine bloße Folge der im
Browser eingespeisten Daten; drei Aussagen sind Folgen der Attrappen (D2-B11, D2-T20, D2-I10).

| Kürzel | Befund — was nach der Gegenprüfung gilt | Gegenprüfung | Paket oder Liste |
|---|---|---|---|
| D2-A1 | Baustellenakte → Scheine: „Handwerksschein schreiben“ liegt 10 px auf dem Kartentitel — am Handy und am Tablet (834 px), nicht nur am Handy | teilweise | Paket 9 |
| D2-A2 | Speicherleiste im Akten-Fenster lässt 20 px Inhalt darunter durchlaufen | bestätigt (nachgestellt) | Paket 9 |
| D2-A3 | Rechnungsfenster der Akte: die Aktionsreihe schrumpft auf 159 px und steht links. Ihre Lage über den Angaben ist gewollt (V10, Auftrag 11.5) | teilweise | Paket 9 |
| D2-A4 | „Wartung erledigt eintragen“: der bestätigende Knopf ist rot | bestätigt (nachgestellt) | Paket 18 |
| D2-A5 | Vier Stellen stehen ab Tablet 16 statt 24 px vom Blattrand (= V-1) | bestätigt (nachgestellt) | Paket 9 |
| D2-A6 | Ein Verweis als Wert macht die Angabe 26 px höher als ihre Nachbarn — Unstimmigkeit, kein Fehler gegen die Linie | teilweise | Paket 9 |
| D2-A7 | Reiter „Belege“ der Kundenakte nutzt nicht die Belegzeile aus E99 | bestätigt (nachgestellt) | Paket 18 |
| D2-A8 | Zeilen, die etwas öffnen, ohne Pfeil (Tops, Beteiligte, Wartungsliste, Scheinliste) | bestätigt (nachgestellt) | Paket 18 |
| D2-A9 | Runde gefüllte „+“-Knöpfe im Kartenkopf: (a) ist kein Fehler, sondern Entscheidung E76; (b) am Handy im Reiter „Termine“ der Baustellenakte zwei gleiche „+“ mit verschiedener Bedeutung | teilweise | bleibt, wie es ist (8.3; E-N) |
| D2-A10 | Angebotsakte: Hauptaktion ist in Entwurf und versendet „PDF herunterladen“; die echten Schritte und ein zweites ⋯ stehen im Verlauf; am Handy verdeckt die schwebende Aktion ein Viertel von „Annehmen → Baustelle“ | teilweise | Paket 18 |
| D2-A11 | Einheit „brutto“ in 15 px Mono; Summen im Angebotsformular in DM Sans | bestätigt (nachgestellt) | Paket 18 |
| D2-A12 | Angebotsliste: Stand und Betrag stehen in keiner festen Spalte | bestätigt (nachgestellt) | Paket 18 |
| D2-A13 | Tablet (834 px): Suchfeld eingerückt (fünf Listen), Baustellentitel in 289 px, Schriftfeld 3 + 1, Belegzeile bricht am Punkt | bestätigt (nachgestellt) | Paket 18 |
| D2-A14 | Abschlusslinie unter der letzten Zeile — mal ja, mal nein | bestätigt (nachgestellt) | Paket 9 |
| D2-A15 | Kundenseite der Annahme am Handy: „Als PDF“ schwebt über dem Unterschriftsfeld | bestätigt (nachgestellt) | Paket 18 |
| D2-A16 | Knöpfe „30 Tage / 90 Tage / 1 Jahr“ 36 px hoch — benannte Ausnahme (`knopf.ts`, `style.md`), kein Fehler | bestätigt (nachgestellt) | keine Handlung (8.2) |
| D2-A17 | Nummern brechen am Bindestrich um („Aus Eingang EG-“ / „2026-0030“) | bestätigt (nachgestellt) | Paket 18 |
| D2-A18 | Akten-Titel am Handy 24 px in drei Akten, 28 px in Liegenschaft, Eingang, Angebot — kein Regelverstoß, Folge von D2-B1 | teilweise | Paket 18 |
| D2-A19 | Knöpfe derselben Rolle in zwei Größen | bestätigt (nachgestellt) | Paket 18 |
| D2-A20 | „Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“ und „Kunde bearbeiten“ (aus der Liste) haben ihren Fuß nicht im Bild | bestätigt (nachgestellt) | Paket 18 |
| D2-B1 | Kunde, Baustelle, Benutzer sind gleich gebaut; die Liegenschaftsakte nicht; Eingang und Angebot nutzen `PageHeader` | bestätigt (nachgestellt) | Paket 18 |
| D2-B2 | Zwei verschiedene Formulare für „Kunde bearbeiten“ (Liste 440 px, Akte 480 px) | bestätigt (nachgestellt) | Paket 18 |
| D2-B3 | Ungespeicherte Eingaben in drei Verhalten: Akten fragen; „Neuer Kunde“, „Neue Baustelle“ behalten still; „Neuer Eingang“, „Neue Wartung“, „Neue Liegenschaft“, „Termin anlegen“, „Liegenschaft bearbeiten“, „Kunde bearbeiten“ (Liste) verwerfen ohne Frage | bestätigt (nachgestellt) | Paket 9 |
| D2-B4 | Neun Wörter für den Knopf, der speichert | bestätigt (am Code) | Paket 10 |
| D2-B5 | PDF in fünf Wörtern | bestätigt (am Code) | Paket 10 |
| D2-B6 | Dasselbe anlegen, andere Wörter | bestätigt (am Code) | Paket 10 |
| D2-B7 | Wo wird gelöscht? Kunde: Zeilen-⋯ und Karte „Datenschutz“; Baustellenakte-⋯ ohne Löschen; Termin: Stift und Tonne in der Zeile (E74); Wartung im ⋯ von „Wartung ändern“ | teilweise | Paket 18 |
| D2-B8 | Listenkarte mit und ohne Titel über den Segmenten | bestätigt (nachgestellt) | Paket 18 |
| D2-B9 | Die Rechnung öffnet im Fenster der Akte, der Schein springt auf die Scheinliste | bestätigt (nachgestellt) | Paket 18 |
| D2-B10 | Termine in zwei Darstellungen; in der Karte Stift und Tonne statt antippbarer Zeile | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R1) |
| D2-B11 | Kleinigkeiten (Schreibweisen, zwei „mehr“ am Listenende, Kontaktzeilen). Drei Zeilen stimmen nicht: „(optional)“ steht 20-mal in der App; die Kundenliste zählt an den Segmenten (nur die Attrappe nicht); die Reihenfolge in „Neue Baustelle“ hat einen Grund (M02c) | teilweise | Paket 18 |
| D2-C1 | „Therme tropft“ — vom Anruf bis zum geplanten Einsatz 14 Tipps; „Quelle“ ist Pflicht ohne Vorgabe, das Anliegen ist das neunte von elf Feldern | bestätigt (nachgestellt) | Paket 18 |
| D2-C2 | Angebot schreiben und verschicken: Formular als halbe Spalte über der Liste; Fokus nach dem Öffnen im Leeren; Senden über ein ⋯ im Verlauf | bestätigt (nachgestellt) | Paket 18 |
| D2-C3 | Angenommen → Team zuteilen: Abschnitt „Mannschaft“ am Ende eines Fensters von 1.919 px | bestätigt (nachgestellt) | Paket 18 |
| D2-C4 | „Was ist bei Familie Huber offen?“ — die Übersicht der Kundenakte zeigt keine Summe | bestätigt (nachgestellt) | Paket 18 |
| D2-C5 | Hausverwaltung, anderes Haus: die Baustellenadresse ist mit der Rechnungsanschrift vorbelegt; der Weg vom Kunden zu seinen Häusern fehlt | bestätigt (nachgestellt) | Paket 18 |
| D2-C6 | Wartung fällig → einplanen: das Wort „einplanen“ kommt nicht vor | bestätigt (nachgestellt) | Paket 18 |
| D2-C7 | Tastatur am Schreibtisch: gut — bis auf den Fokus nach dem Öffnen eines Fensters („Schließen“ zuerst) | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R13) |
| D2-C8 | Fenster übereinander: nie mehr als Fenster plus Rückfrage — nichts ändern | bestätigt (nachgestellt) | keine Handlung (8.2) |
| D2-C9 | Handy: lange Listenzeilen (Baustellen bis 282 px, Seiten bis 9.718 px) | bestätigt (nachgestellt) | Paket 18 |
| D2-C10 | Handy, Scheine: erste Zeile bei y 683, davor Kennzahl und Karte „Stunden ohne Buchung“ | bestätigt (nachgestellt) | Paket 18 |
| D2-C11 | Handy: Angebotsakte und Eingang zeigen die Positionen bzw. das Anliegen zuletzt | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R4) |
| D2-C12 | Knöpfe in Listenzeilen: Angebote bis zu zwei Knöpfe, Stift und ⋯; Wartungen zwei; Scheine einer | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R1) |
| D2-C13 | Kundenseite der Annahme: unterschreiben vor dem Lesen (Annahme vor Angaben und Positionen) | bestätigt (nachgestellt) | Paket 18 |
| D2-C14 | Papierkorb: kein Verweis aus Angebots- und Scheinliste. „Rückgängig“ steht in der Meldung schon (F15) | teilweise | Paket 18 |
| D2-I1 | Hauptaktion = nächster Schritt des Stands (Angebot, Eingang, Wartung) | bestätigt (am Code) | bleibt, wie es ist (8.3; E-R4) |
| D2-I2 | Kennwerte im Kopf der Kundenakte („offen € …“) — aus der geladenen Liste wäre die Summe ab 500 Rechnungen falsch | teilweise | Paket 18 |
| D2-I3 | Nach dem Anlegen dorthin, wo es weitergeht | bestätigt (am Code) | Paket 18 |
| D2-I4 | Angebot schreiben als Arbeitsbereich mit zwei Zonen am Schreibtisch | bestätigt (nachgestellt) | Paket 18 |
| D2-I5 | Enter legt die nächste Position an | bestätigt (nachgestellt) | Paket 18 |
| D2-I6 | Kontextmenü an der Zeile | bestätigt (am Code) | zurückgestellt (8.4; E-F4) |
| D2-I7 | Zeile bleibt markiert, solange ihr Fenster offen ist (fehlt an der Rechnungszeile der Akte) | bestätigt (nachgestellt) | Paket 18 |
| D2-I8 | Fenster der Zeile mit Pfeil auf/ab weiterblättern | bestätigt (am Code) | zurückgestellt (8.4; E-F4) |
| D2-I9 | Leerzustände, die den ersten Schritt tragen | bestätigt (am Code) | Paket 18 |
| D2-I10 | Übersicht der Baustellenakte am Handy 3.862 px; drei (nicht fünf) Karten mit einem Satz, eine davon durch die Attrappe | teilweise | Paket 18 |
| D2-I11 | Team direkt an der Akte ändern | bestätigt (nachgestellt) | Paket 18 |
| D2-I12 | Erster Fokus im ersten Feld bei „Neu“-Fenstern | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R13) |
| D2-I13 | „Baustelle bearbeiten“ in Abschnitten mit Sprungleiste | bestätigt (nachgestellt) | Paket 18 |
| D2-T1 | Baustellenliste am Handy: sieben Angaben, 282 px je Zeile. Die Begründung des Papiers stimmt nicht (keine Maßlinie mehr; „nichts gebucht“ unterscheidet „null“ von „unbekannt“) | teilweise | bleibt, wie es ist (8.3; E-W1) |
| D2-T2 | Wartungsliste: Kette mit fünf Angaben in der Zeile | bestätigt (nachgestellt) | Paket 18 |
| D2-T3 | Auftragseingang: Anliegen ungekürzt in der Zeile | bestätigt (nachgestellt) | Paket 18 |
| D2-T4 | Kartentitel „Aktive Liegenschaften“, „Offen“ über den Segmenten | bestätigt (nachgestellt) | Paket 18 |
| D2-T5 | Acht Untertitel der Listen-Seitenköpfe | bestätigt (nachgestellt) | Paket 11 |
| D2-T6 | Scheine, Karte „Stunden ohne Buchung (0)“ — „Geprüft über die 2 geladenen Scheine“ ist der Geltungsbereich, keine Technik | teilweise | Paket 18 |
| D2-T7 | „… von möglicherweise mehr geladen.“ | widerlegt | widerlegt (8.1) |
| D2-T8 | Kundenakte: VIES-Nachweis als offene Karte ohne Titel | bestätigt (nachgestellt) | Paket 18 |
| D2-T9 | Kundenakte, Kontextspalte: dreimal „Wartungen“ | bestätigt (nachgestellt) | Paket 18 |
| D2-T10 | Leere Angaben ausgeschrieben („ENDE GEPLANT —“, „nicht angegeben“) | bestätigt (nachgestellt) | Paket 18 |
| D2-T11 | Baustellenakte am Handy: Adresse und Telefon in Kopf und Kontext | teilweise | Paket 18 |
| D2-T12 | Name und Nummer der Baustelle unter jedem Termin der Akte | bestätigt (nachgestellt) | Paket 18 |
| D2-T13 | „geschrieben von …“ unter jedem Schein | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R3) |
| D2-T14 | Fenster „Annahme-Link“: vier Sätze. Drei davon sind wechselnde Feldhinweise mit den Gründen einer Ablehnung | teilweise | Paket 18 |
| D2-T15 | Zwei Hinweise in „Neue Baustelle“ | widerlegt | widerlegt (8.1) |
| D2-T16 | Papierkorb: Feldbeschriftung mit Klammerzusatz | bestätigt (nachgestellt) | Paket 20 |
| D2-T17 | Kundenseite der Annahme: Firma und Frist doppelt | bestätigt (nachgestellt) | Paket 18 |
| D2-T18 | Eingangsseite, Verlauf: „Offen — Wartet darauf, …“ | teilweise | Paket 18 |
| D2-T19 | Angebotsliste: Datum, Bindefrist, Stunden und „abgelaufen“ | bestätigt (nachgestellt) | Paket 18 |
| D2-T20 | Kundenliste: „Kundenart prüfen“ an jeder Zeile — die Zahl am Segment gibt es (fehlt nur in der Vorschau) | teilweise | keine Handlung (8.2) |
| D2-P1 | Wartung, Beteiligte, Eingang: Hierarchie und Spalten statt Kette — die Handyform ist mit langen Namen schlechter als heute (bis vier Zeilen), Spalten tragen erst am Schreibtisch | teilweise | Paket 18 |
| D2-P2 | Belegzeile als Raster: einzeilig braucht 467 px — passt nicht in die Hauptspalte der Akte am Tablet (360 px) und nicht am Handy | teilweise | bleibt, wie es ist (8.3; E-R3) |
| D2-P3 | Termin: Datumsspalte links, Zeit rechts — bei 375 px wird der Titel zwei- bis vierzeilig | teilweise | bleibt, wie es ist (8.3; E-R1) |
| D2-P4 | Schein: Datum als Spalte, Abrechnung als leise Angabe | bestätigt (am Code) | Paket 18 |
| D2-P5 | Angebotsliste in Spalten: acht Spalten gehen erst ab dem Schreibtisch; die Handyskizze nennt weder Zustand noch ⋯ | teilweise | Paket 18 |
| D2-P6 | Zwei Werte = zwei Angaben (Name, Telefon als Kontaktverweis) | bestätigt (am Code) | Paket 18 |
| D2-P7 | Summen als Summentabelle | bestätigt (am Code) | Paket 18 |
| D2-P8 | Zahl links, Rest weg bzw. rechts (Seitenkopf der Angebote, Aufklapper) | bestätigt (am Code) | Paket 18 |
| D2-P9 | Nummer als Stempel („EG-2026-0031“) | bestätigt (am Code) | Paket 18 |

### 5.4 Büro — Geld und Material (`analyse/11`, geprüft in `pruefung/11`)

Geprüft bei 375, 390, 834, 1200 und 1440 px, mit anderen eingespeisten Daten als der Autor.
D3-9 und D3-10 treten nur bei langen Großhändlernamen auf.

| Kürzel | Befund — was nach der Gegenprüfung gilt | Gegenprüfung | Paket oder Liste |
|---|---|---|---|
| D3-1 | Rechnung stellen: Positionstabelle 675 px breit in 326 px (Handy) bzw. 624 px (Tablet); Summen außerhalb des Bildes. Ursache sind die festen Feldbreiten, nicht die Mindestbreite | teilweise | Paket 15 |
| D3-2 | Positionsfelder 15 statt 16 px (iOS zoomt). 44 px Höhe und der Rand sind keine Fehler gegen die Linie | bestätigt (nachgestellt) | Paket 15 |
| D3-3 | Rechnung stellen: Beträge in DM Sans, Summen und Zahlbetrag auf zwei Fluchten, Tabellenkopf in Grundschrift | bestätigt (nachgestellt) | Paket 15 |
| D3-4 | Rechnungsfenster: Aktionsreihe 319 px lang in 438 px (119 px zu kurz), hängt links | bestätigt (nachgestellt) | Paket 9 |
| D3-5 | Lager-Artikelfenster: zwei Linien 20 px untereinander | bestätigt (nachgestellt) | Paket 9 |
| D3-6 | Zahlungsdialog belegt den Betrag als „22104.6“ vor — ein Formfehler (der Wert wird richtig gelesen), keine falsche Zahl | teilweise | Paket 3 |
| D3-7 | Kontoauszug: Zustand und Betrag fluchten nicht; am Handy steht der Betrag hinter dem Zustand. Ursache ist der Baustein `ListRow gestapelt` mit bloßem `wert`; U11 trägt den Befund nicht | teilweise | Paket 15 |
| D3-8 | Kontoauszug: „1 Abbuchung anzeigen“ sitzt auf der Blattkante | bestätigt (nachgestellt) | Paket 15 |
| D3-9 | Einkaufsliste am Handy: Auswahl „Großhändler wählen“ ragt links aus dem Blatt — nur bei Namen ab rund 32 Zeichen | bestätigt (nachgestellt) | Paket 9 |
| D3-10 | Anforderungen am Handy: Zustand läuft ohne Auslassung über die Blattkante — bei Großhändlernamen ab rund 36 Zeichen | bestätigt (nachgestellt) | Paket 16 |
| D3-11 | Arbeitszeile 4 bzw. 8 px neben der Blattflucht (= V-2) — Unstimmigkeit, kein Fehler gegen die Linie | teilweise | Paket 9 |
| D3-12 | Katalog einspielen: Abschluss frei auf dem Raster, Hauptaktion links; am Handy beide über die volle Breite gestapelt | bestätigt (nachgestellt) | Paket 16 |
| D3-13 | Mehr als eine gefüllte Hauptaktion (Rechnungen; Lager); am Handy verdeckt die schwebende „Neue Rechnung“ das offene Formular | bestätigt (nachgestellt) | Paket 15 |
| D3-14 | Katalogzeile: Warnzeichen ohne Wort, Menge nicht in Mono | bestätigt (nachgestellt) | Paket 16 |
| D3-15 | Kennwerte in Fenstern in drei Formen (Rechnung, Nachkalkulation, Lager) | bestätigt (nachgestellt) | Paket 9 |
| D3-16 | Überfälliger Liefertermin ohne Zeichen (Einkauf und „Laufend“) | bestätigt (nachgestellt) | Paket 16 |
| D3-17 | Maschinentext im Fehlerzustand: rund 20 Stellen zeigen `e.message` roh. „… is not a function“ fängt die Liste schon | teilweise | Paket 10 |
| D3-B1 | Betrag im Lauftext in DM Sans | bestätigt (nachgestellt) | Paket 10 |
| D3-B2 | Eurozeichen vor und hinter der Zahl | bestätigt (nachgestellt) | Paket 10 |
| D3-B3 | Tausendertrennung uneinheitlich | bestätigt (am Code) | Paket 10 |
| D3-B4 | Menge in vier Formen | bestätigt (nachgestellt) | Paket 10 |
| D3-B5 | Zustandswörter klein und groß („knapp“, „fehlt“, „zugeordnet“) | bestätigt (nachgestellt) | Paket 10 |
| D3-B6 | Name der Sache: „Offene Bestellungen“ auf der Seite „Anforderungen“ | bestätigt (nachgestellt) | Paket 10 |
| D3-B7 | „Inventur“ für zwei Dinge | bestätigt (nachgestellt) | Paket 10 |
| D3-B8 | Mahnen: „Mahnung erzeugen“ schließt mit „Erzeugen“ | bestätigt (nachgestellt) | Paket 10 |
| D3-B9 | „(freiwillig)“ neben „(optional)“ — an mehr Stellen als im Papier | bestätigt (am Code) | Paket 10 |
| D3-B10 | Verweis in die Einstellungen mit „→“ und „›“ | bestätigt (am Code) | Paket 10 |
| D3-B11 | Tabellenkopf 12 versal gegen 15 gemischt | bestätigt (nachgestellt) | Paket 9 |
| D3-B12 | Abschnitt im Fenster: `h3` 15/500 gegen `section-label` 12/500 | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-F2) |
| D3-B13 | Gruppe im Blatt: `section-label` nicht versal | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-F2) |
| D3-B14 | Filter und Suche über den Reitern statt im Blatt (Anforderungen) | bestätigt (nachgestellt) | Paket 16 |
| D3-B15 | „Neu in dieser Liste“: „+ Material“, „+ Steuersatz“, „Warengruppe hinzufügen“ neben dem Kreis | bestätigt (nachgestellt) | Paket 9 |
| D3-B16 | Pfeil fehlt an Zeilen, die ein Fenster öffnen (Anforderungen, Kontoauszug) | bestätigt (nachgestellt) | Paket 16 |
| D3-B17 | Stempel im Titel für Datum und Betrag statt nur für Nummern | bestätigt (nachgestellt) | Paket 15 |
| D3-B18 | Kennzahl im Blatt „Artikel erkannt“ in anderer Form als im Kopf | bestätigt (nachgestellt) | Paket 16 |
| D3-B19 | Formularbreite: Felder und Abschluss nur in der linken Hälfte | bestätigt (nachgestellt) | Paket 15 |
| D3-B20 | Zeilenaktion: drei kleine Knöpfe an der bestellten Einkaufszeile | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-W1) |
| D3-C0 | Vorschau liefert die drei dichten Bildschirme nicht (Rechnung stellen, Kontoauszug, Einkaufsliste) | bestätigt (nachgestellt) | Paket 8 |
| D3-C1 | Rechnung stellen als Arbeitsbereich in erkennbarer Folge — sieben Punkte hängen an der heutigen Anordnung, zwei widersprechen der vorgeschlagenen | teilweise | zurückgestellt (8.4; E-R14) |
| D3-C2 | „Verrechnen“ statt „Baustelle wählen“ | teilweise | zurückgestellt (8.4; E-R14) |
| D3-C3 | Kontoauszug: Datei per Ablegen; Einstieg als Zweitknopf im Seitenkopf; Zeile einzeilig | teilweise | Paket 15 |
| D3-C4 | Mahnen in einem Zug | teilweise | bleibt, wie es ist (8.3; E-R15) |
| D3-C5 | Export mit Segmenten „Vormonat · Dieser Monat · Quartal“ | bestätigt (nachgestellt) | Paket 15 |
| D3-C6 | Einkaufsliste: je Großhändler eine Hauptaktion „Bestellen …“; bestellte Zeile öffnet ein Fenster | teilweise | Paket 25 |
| D3-C7 | Anforderung: „4 Stk frei“ in Zeile und Fenster; „Auf die Einkaufsliste“ als Zweitknopf | teilweise | Paket 16 |
| D3-C8 | Katalog einspielen: feste Schrittzeile, Vorschau als Tabelle | bestätigt (nachgestellt) | Paket 16 |
| D3-C9 | Verkaufs- und Einkaufspreis in der Katalogzeile | teilweise | zurückgestellt (8.4; E-R17) |
| D3-C10 | Leerzustand mit erstem Schritt (Großhändler, Einkaufsliste) | bestätigt (nachgestellt) | Paket 25 |
| D3-C11 | Tastatur am Schreibtisch: Enter legt die nächste Position an, Strg+Enter löst die Hauptaktion aus | teilweise | Paket 15 |
| D3-C12 | Betragsfelder der Einstellungen mit Einheit im Feld | bestätigt (nachgestellt) | Paket 20 |
| D3-C13 | Querverweise: Lager-Artikel → „Nachbestellen“; Anforderungen → „Material anfordern“ | bestätigt (nachgestellt) | Paket 16 |
| D3-T1 | Zehn Untertitel der Seitenköpfe (ab Tablet) | bestätigt (nachgestellt) | Paket 11 |
| D3-T2 | Rechnung stellen: „Rechnungsnummer … — die App vergibt sie beim Erstellen, lückenlos.“ | teilweise | Paket 15 |
| D3-T3 | Rechnung stellen: Erklärsatz zum Übergang der Steuerschuld — der Satz schützt vor versehentlichem Einschalten | teilweise | keine Handlung (8.2) |
| D3-T4 | „Skonto keines“, „Rücklass keiner“, Zahlbetrag gleich Brutto | widerlegt | widerlegt (8.1) |
| D3-T5 | Rechnung stellen: zwei Sperrgründe und eine Warnung (Firmenbuch), ausgeschrieben | teilweise | Paket 15 |
| D3-T6 | Rechnungsfenster: Betrag viermal, Stand zweimal | bestätigt (nachgestellt) | Paket 15 |
| D3-T7 | Zahlungsdialog: Kopfzeile und „Auf diese Rechnung ist noch nichts eingegangen“ | teilweise | Paket 15 |
| D3-T8 | Mahn-Dialog: „Der Beleg wird als PDF erzeugt …; versendet wird er von dir.“ | teilweise | Paket 15 |
| D3-T9 | E-Rechnung: Erklärsätze im Dialog | bestätigt (nachgestellt) | Paket 15 |
| D3-T10 | Kontoauszug, Blatt „Datei“: Form und erkannte Spalten | teilweise | Paket 15 |
| D3-T11 | Kontoauszug-Zeile: „Kunde zweimal“ ist eine Folge der Beispieldaten — Auftraggeber laut Bank und Kunde der Rechnung sind zwei Angaben | teilweise | Paket 15 |
| D3-T12 | Lager: Kennzahlen in allen Reitern | bestätigt (nachgestellt) | Paket 16 |
| D3-T13 | Lager, Zeile und Fenster: Nullwerte ausgeschrieben („0 reserviert“, „Mindestmenge —“) | bestätigt (nachgestellt) | Paket 16 |
| D3-T14 | Material anlegen / bearbeiten: drei Erklärsätze | teilweise | Paket 16 |
| D3-T15 | Wareneingang / Bestand berichtigen: Erklärsätze | bestätigt (nachgestellt) | Paket 16 |
| D3-T16 | Einkauf: Blätter, die meist nichts tragen, stehen vor der Liste | bestätigt (nachgestellt) | Paket 25 |
| D3-T17 | Anforderungen: Notiz in der Zeile; „Angefordert von“ doppelt im Fenster | bestätigt (nachgestellt) | Paket 16 |
| D3-T18 | Material anfordern: drei kurze Sätze | teilweise | Paket 14 |
| D3-T19 | Nachkalkulation: Wiederholungen je Zeile | bestätigt (nachgestellt) | Paket 15 |
| D3-T20 | Katalog einspielen: „0 Änderungen · 0 Löschsätze“ | bestätigt (nachgestellt) | Paket 16 |
| D3-T21 | Einstellungen, Nummernkreise: drei Texte | teilweise | Paket 20 |
| D3-T22 | Anrede „Ihrer“ neben „dir“ (Kontoauszug, Mahn-Dialog, Absturzseite; dazu `InvoicesView.tsx:3640`) | bestätigt (nachgestellt) | Paket 10 |
| D3-P1 | Mahnlauf-Zeile als Spalten — passt nicht in die halbe Breite, die E98 dem Mahnlauf ab 1.200 px gibt (für Name und Stempel bleiben 82 px bzw. nichts) | teilweise | bleibt, wie es ist (8.3; E-R9) |
| D3-P2 | „Nicht verrechnet“-Zeile als Spalten — dieselbe halbe Breite (386 px bei 1.200) | teilweise | bleibt, wie es ist (8.3; E-R9) |
| D3-P3 | Rechnungszeile: Datum und Fälligkeit, Mahnzeile | bestätigt (nachgestellt) | Paket 15 |
| D3-P4 | Zahlungsdialog-Kopf als zwei Kennwerte | bestätigt (nachgestellt) | Paket 15 |
| D3-P5 | Export: „0 Rechnungen · Netto · Brutto“ | bestätigt (nachgestellt) | Paket 15 |
| D3-P6 | Lager: Artikelnummer als Stempel, Mengen rechts | bestätigt (nachgestellt) | Paket 16 |
| D3-P7 | Anforderungen: Person · Nummer, Liefertermin | bestätigt (nachgestellt) | Paket 16 |
| D3-P8 | Bestellte Einkaufszeile: Person · Nummer · „bestellt am“ | teilweise | Paket 25 |
| D3-P9 | Großhändler: „Kd.-Nr. · Mail“ | bestätigt (nachgestellt) | Paket 25 |
| D3-P10 | Material anfordern: „zuletzt 12 Stk · Datum“, „Lager: 4 Stk (knapp)“ | bestätigt (nachgestellt) | Paket 14 |
| D3-P11 | Katalog einspielen: Zählzeile und Probezeilen — eine Tabelle mit fünf Spalten passt am Handy nicht (derselbe Fehler wie D3-1) | teilweise | Paket 16 |
| D3-P12 | Einstellungen, Mahnspesen als Raster 3 × 2 | teilweise | Paket 20 |
| D3-P13 | Kontoauszug, Blatt „Datei“: Fließzeilen als Wertpaare | bestätigt (nachgestellt) | Paket 15 |

**Die neun durchgespielten Aufgaben des Papiers 11** (ohne Kürzel):

| Aufgabe | Gegenprüfung | Was gilt | Paket |
|---|---|---|---|
| 1 Monatsende: alle Scheine verrechnen | bestätigt (nachgestellt) | Seite 3.288 px hoch (1440) bzw. 4.318 px (390); das Formular steht unter den Arbeitskarten; kein „Nächste“ | 15 — der Vorschlag dazu (D3-C2) ist zurückgestellt |
| 2 Kontoauszug abgleichen | teilweise | Einstieg nur im ⋯; Zeilenhöhe bestätigt; „Kunde zweimal“ ist eine Folge der Daten (D3-T11) | 15 |
| 3 Mahnen | bestätigt (am Code) | ⋯ mit sechs Einträgen; die Tippzahl des Mail-Wegs ist nicht durchgespielt | 15 — der Vorschlag dazu (D3-C4) wird nicht gebaut (E-R15) |
| 4 Export an die Steuerberatung | bestätigt (nachgestellt) | letztes Blatt der Seite; vorbelegt ist der laufende Monat | 15 (D3-C5) |
| 5 Schlussrechnung mit zwei Anzahlungen | bestätigt (am Code) | die Abzüge stehen nach „Zahlung“ und „Position hinzufügen“; in der Vorschau nicht erreichbar | 15 — der Vorschlag dazu (D3-C1) ist zurückgestellt |
| 6 Aus Lager / bestellen | bestätigt (nachgestellt) | Fenster ohne Bestand; „Nicht auf Lager – auf die Einkaufsliste“ nur im ⋯ | 16 (D3-C7) |
| 7 Lieferung ist da | bestätigt (nachgestellt) | „Stornieren …“ steht neben „Geliefert …“ | 25 (D3-C6; „Geliefert …“ bleibt in der Zeile) |
| 8 Inventur am Handy | nicht prüfbar | die Vorschau stürzt ab; auch das Papier hat nur Code gelesen | zweite Durchsicht nach Paket 8 |
| 9 Preiskatalog einspielen | bestätigt (nachgestellt) | vierter Reiter „Einspielen“; Rabattfelder 1.080 px breit | 16 (D3-C8) |

### 5.5 Planung, Team, Einstellungen, Plattform, Anmeldung (`analyse/12`, geprüft in `pruefung/12`)

Geprüft bei 1440, 834, 390 und 375 px. Anmeldung, zweiter Faktor und Monatsabschluss waren nur
mit umgeschriebener Attrappe erreichbar; die Befunde dort betreffen Code der App. Die Vorschau
zeigt unter jeder Adresse der Benutzerakte die Akte von `u1` — daraus stammen die beiden
widerlegten Befunde D4-C11 und D4-T9.

| Kürzel | Befund — was nach der Gegenprüfung gilt | Gegenprüfung | Paket oder Liste |
|---|---|---|---|
| D4-A1 | Tag-Planung am Handy: das Neu-Formular steht offen vor dem Bestand (Einsätze erst ab y 2.310), gegen U2 | bestätigt (nachgestellt) | Paket 17 |
| D4-A2 | Fensterfuß „Einsatz bearbeiten“ bricht in zwei Zeilen (1440 und 834 px) | bestätigt (nachgestellt) | Paket 17 |
| D4-A3 | „Kein Zugriff“ und „… ist ausgeschaltet“ stehen außerhalb der Linie und enden in einer Sackgasse (`guards.tsx:24–31, 56–79`) | bestätigt (nachgestellt) | Paket 20 |
| D4-A4 | Drei Leersätze in 13 statt 15 px (Supportzugang, Meldungen, Mitarbeiterübersicht). „Sie läuft von selbst.“ ist ein Hinweis und steht richtig in 13 px | teilweise | Paket 20 |
| D4-A5 | Blatt-Titel „Noch einzuplanen“ in Serifenschrift — gewollt (E96, drei Wächter), kein Fehler gegen die Linie | teilweise | keine Handlung (8.2) |
| D4-A6 | Drei Formen des Tastaturfokus (3 px/2 px Versatz allgemein; 2 px an Zeilen; 17 Regeln mit `--focus-ring`). Das Soll ist nicht eindeutig: `style.md` nennt `--focus-ring`, E95 nennt Petrol | teilweise | zurückgestellt (8.4; E-F13) |
| D4-A7 | Felder einer Reihe fluchten nicht, wenn eine Beschriftung umbricht („Benutzer bearbeiten“, Rechnungsvorgaben) — Messung stimmt, keine Regel dazu | teilweise | Paket 19 |
| D4-A8 | Termin-Fenster: „Bis“ steht allein in der zweiten Reihe — keine Regelquelle, unkritisch | teilweise | Paket 17 |
| D4-A9 | Firmendaten: Hinweisblatt und Felder halten die Fluchten nicht — keine Regelquelle | teilweise | keine Handlung (8.2) |
| D4-A10 | Monatsansicht am Tablet: Tagesköpfe 18 × 51 px, Balken ab 16 × 26 px | bestätigt (nachgestellt) | Paket 17 |
| D4-A11 | Zeilen, die etwas öffnen, ohne Pfeil: Mitarbeiterübersicht und Tag-Fenster. Für die Plattform falsch: die Zeile öffnet schon und trägt „Verwalten ›“ | teilweise | Paket 19 |
| D4-A12 | Zwei-Faktor-Seite: Zeilenabstand springt im Absatz mit „Abmelden“ — keine Regelquelle | teilweise | Paket 20 |
| D4-A13 | Unschöne Umbrüche. (1) Namensspalte der Baustellen-Woche: nicht anfassen (Auftrag vom 25.10.2026: Namen nie automatisch trennen). (2) Personenkalender mit 4 px Radius. (3) Zuschlag-Kennzahl auf `/time` zweizeilig | teilweise | Paket 19 |
| D4-A14 | Rüstliste im Einsatz-Fenster: Zeilen fluchten nicht, Warnung doppelt (zu D4-T7) — keine Regel über das Fluchten | teilweise | Paket 17 |
| D4-B1 | Einstellungen: Schalter, die sofort wirken (Mein Konto, Module), und Schalter, die mit „Speichern“ gelten (Personal 8 von 8, Zeitfelder 7, Rechnungsvorgaben 2, Fahrzeuge 1, Firmendaten 1); Speicherleisten je Blatt | teilweise | Paket 20 |
| D4-B2 | Gruppenkopf in normaler Schrift 13/500 (Start, Planung) und in Versalien 12 px (Mitarbeiterübersicht, Benutzer) | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-F2) |
| D4-B3 | Verweiszeichen „→“ (13 Zeilen) neben „›“ (6) | bestätigt (am Code) | Paket 10 |
| D4-B4 | Vier Kalender in vier Umsetzungen | bestätigt (am Code) | bleibt, wie es ist (8.3; E-F9) |
| D4-B5 | Suche in drei sichtbaren Formen | bestätigt (am Code) | Paket 9 |
| D4-B6 | Ansichtswahl der Planung: zwei Segmentgruppen ohne erkennbare Trennung | bestätigt (nachgestellt) | Paket 17 |
| D4-B7 | Hauptknopf im Formular links (Supportzugang, Datensicherung, Mein Konto, Plattform, Zwei-Faktor) | bestätigt (nachgestellt) | Paket 20 |
| D4-B8 | Fensterfuß in mehreren Formen (Termin, Einsatz, Tag-Fenster; Plattform ohne Fuß) | bestätigt (nachgestellt) | Paket 9 |
| D4-B9 | „Zurück“ in zwei Formen (Dachzeile gegen gerahmten Knopf; Plattform, sechs Stellen) | bestätigt (nachgestellt) | Paket 20 |
| D4-B10 | Wörter und Formate („ganztags“/„ganzer Tag“, Stunden, „Sicherung“/„Datensicherung“). „Urlaubsanspruch ändern“ und „Anspruch anpassen“ sind zwei verschiedene Funktionen | teilweise | Paket 10 |
| D4-B11 | Kurzname: der Monat nennt die Baustelle kurz, die Woche schreibt den Kundennamen vierzeilig | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R8) |
| D4-B12 | Anmeldeweg in drei Gestalten (Anmeldung, zweiter Faktor; „Willkommen“ nicht gesehen) | bestätigt (nachgestellt) | Paket 20 |
| D4-B13 | Termin öffnet in Woche, Tag und Tag-Fenster je anders | bestätigt (nachgestellt) | Paket 17 |
| D4-B14 | Schalterzeile 1.080 px breit (Mein Konto) gegen 560 px (Personal) | bestätigt (nachgestellt) | Paket 20 |
| D4-B15 | Runder Kreis (`NeuKnopf`, E76) neben der gefüllten Hauptaktion im Tag-Fenster; in der Handy-Woche über der schwebenden Aktion | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-N) |
| D4-B16 | Mehrere gefüllte Knöpfe auf `/vacations` | bestätigt (nachgestellt) | Paket 19 |
| D4-C1 | Morgen früh, einer ist krank: die Krankmeldung liegt weit von der Planung; das Fenster „Einsatz bearbeiten“ ist 2.190 px hoch | bestätigt (am Code) | Paket 23 |
| D4-C2 | Einsatz auf Donnerstag schieben: das Feld „Tag“ im Fenster lädt einen anderen Tag, statt zu verschieben; 66 Tab-Halte im Raster | bestätigt (nachgestellt) | Paket 17 |
| D4-C3 | Neuer Mitarbeiter: nach dem Anlegen bleibt man ohne Verweis auf der Liste | bestätigt (am Code) | Paket 19 |
| D4-C4 | Monat abschließen: die Kennzahl führt nirgends hin, der Schritt steht nur im ⋯ | bestätigt (nachgestellt) | Paket 21 |
| D4-C5 | Urlaubsantrag entscheiden: das Wartende steht 1.150 px unter dem eigenen Formular | bestätigt (nachgestellt) | Paket 19 |
| D4-C6 | Briefkopf und Bankverbindung ändern: Formular in halber Breite, Farbe ohne Probe | bestätigt (nachgestellt) | Paket 20 |
| D4-C7 | Passwort vergessen: die Bestätigung steht zwischen Feldern und Knopf; kein „Passwort anzeigen“ | bestätigt (am Code) | Paket 20 |
| D4-C8 | Plattform, Betrieb anlegen: Platzhalter wiederholt die Beschriftung; Satz über dem Knopf | bestätigt (nachgestellt) | Paket 20 |
| D4-C9 | Eine Einstellung finden: 15 Reiter in zwei Zeilen; die Suche kennt „dunkel“, „Monatsabschluss“, „Mahnung“ nicht | bestätigt (nachgestellt) | Paket 20 |
| D4-C10 | Mitarbeiterübersicht am Handy: erste Zeile der Liste bei y 772 von 844 | bestätigt (nachgestellt) | Paket 19 |
| D4-C11 | „Benutzer deaktivieren“ fehle | widerlegt | widerlegt (8.1) |
| D4-C12 | Planung bei 1440×900: 2½ Personen sichtbar — mit den absichtlich langen Namen der Beispieldaten (131 px je Zeile); mit einzeiligem Namen 77 px | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R8) |
| D4-C13 | Unbekannte Adresse leitet still auf die Startseite (`App.tsx:657`) | bestätigt (nachgestellt) | Paket 20 |
| D4-I1 | Einsatzkachel zweizeilig: gemessen −27 % Höhe (nicht „70 statt 131 px“); zwölf Monteure passen auch dann nicht auf einen Bildschirm | teilweise | bleibt, wie es ist (8.3; E-R8) |
| D4-I2 | Einstellungen gegliedert statt 15 gleichrangiger Reiter | bestätigt (nachgestellt) | Paket 20 |
| D4-I3 | Eine Suche, die die Einstellungen kennt | bestätigt (nachgestellt) | Paket 20 |
| D4-I4 | Briefkopf-Vorschau neben den Firmendaten | bestätigt (nachgestellt) | Paket 20 |
| D4-I5 | Leerer Betrieb: Blatt „Einrichten“ auf der Startseite — die Startseite trägt die Einrichtung schon als Themen unter „Zu erledigen“ | teilweise | bleibt, wie es ist (8.3; E-R16) |
| D4-I6 | Person-Fenster: 15 Knöpfe „Zeit erfassen“ | bestätigt (nachgestellt) | Paket 19 |
| D4-I7 | Startseite anpassen: Reihenfolge per Griff ziehen | bestätigt (am Code) | zurückgestellt (8.4; E-F4) |
| D4-I8 | Module: Unterfähigkeiten eingerückt unter ihrem Modul | bestätigt (nachgestellt) | Paket 20 |
| D4-I9 | Mein Konto als Zeilenliste (drei Blätter mit je einem Knopf) | bestätigt (nachgestellt) | Paket 20 |
| D4-I10 | Start am Schreibtisch: „Dein Einsatz heute“ wird in der rechten Spalte 2.400 px lang | bestätigt (nachgestellt) | bleibt, wie es ist (8.3; E-R9) |
| D4-I11 | Benutzerakte: Blatt „Geburtsdatum“ mit nur einem Knopf | bestätigt (nachgestellt) | Paket 19 |
| D4-T1 | Zehn Untertitel wiederholen Titel oder Reiter (ab Tablet; am Handy schon ausgeblendet) | teilweise | Paket 11 |
| D4-T2 | Start: „… · Rolle: Geschäftsführung“ | teilweise | Paket 13 |
| D4-T3 | Start: „Nicht geladen: …“ mit drei Sätzen | bestätigt (am Code) | Paket 13 |
| D4-T4 | Einstellungen-Übersicht: Stichwortketten bis 164 Zeichen | bestätigt (nachgestellt) | Paket 20 |
| D4-T5 | Module: je Modul Zweck, „Teil von“, „Betrifft“ | bestätigt (nachgestellt) | Paket 20 |
| D4-T6 | Fenster „Einsatz bearbeiten/planen“: zwei Hinweissätze | bestätigt (nachgestellt) | Paket 17 |
| D4-T7 | Rüstliste im Fenster: „fehlt 2“ und „Im Lager fehlen 2.“ | bestätigt (nachgestellt) | Paket 17 |
| D4-T8 | Benutzerakte: Wochenstunden, Arbeitstage, Urlaubstage an drei Stellen | bestätigt (nachgestellt) | Paket 19 |
| D4-T9 | Satz „Das eigene Konto lässt sich nicht sperren …“ | widerlegt | widerlegt (8.1) |
| D4-T10 | Person-Fenster: „Soll 7:42“ in jeder Zeile | bestätigt (nachgestellt) | Paket 19 |
| D4-T11 | Mitarbeiterübersicht: Stand der Auswertung doppelt | bestätigt (nachgestellt) | Paket 19 |
| D4-T12 | Woche, Baustellensicht: Termin-Kachel wiederholt den Namen der Baustelle | bestätigt (nachgestellt) | Paket 17 |
| D4-T13 | Woche, Personensicht: Nummer in jeder Kachel — nur ab 1.200 px; am Tablet und Handy fehlt sie schon | teilweise | bleibt, wie es ist (8.3; E-R8) |
| D4-T14 | Tag-Planung: Datum in drei Blatt-Titeln | bestätigt (nachgestellt) | Paket 17 |
| D4-T15 | Firmendaten: Firmenbuch-Satz und „Hauptfarbe (#rrggbb)“. Der Hinweis „Bereit für den ersten Beleg?“ steht schon nur, solange der Briefkopf unvollständig ist | teilweise | Paket 20 |
| D4-T16 | Mein Konto: Blatt „Kommen die Meldungen an?“ mit einem Satz | bestätigt (nachgestellt) | Paket 20 |
| D4-T17 | Plattform: Anlegedatum und Kontenzahl in jeder Zeile; Absatz im Fenster | bestätigt (nachgestellt) | Paket 20 |
| D4-T18 | Zwei-Faktor-Seite: Hilfesatz | bestätigt (nachgestellt) | Paket 20 |
| D4-T19 | Anmeldung: Untersatz und Sternchen | bestätigt (nachgestellt) | Paket 20 |
| D4-T20 | `/time`, Kennzahl „Saldo“: „Kein Startdatum konfiguriert“ | bestätigt (nachgestellt) | Paket 14 |
| D4-T21 | Zeilen mit vier und mehr Angaben (Start, Tag-Fenster) | bestätigt (nachgestellt) | Paket 13 |
| D4-P1 | Dachzeile und Meta im Seitenkopf der Startseite | bestätigt (nachgestellt) | Paket 13 |
| D4-P2 | Unterzeile der Start-Zeilen: Zustand · Angabe · Angabe — die Form trägt nur bei kurzen Titeln | teilweise | Paket 13 |
| D4-P3 | Blatt-Titel mit Zähler in zwei Formen | bestätigt (nachgestellt) | Paket 11 |
| D4-P4 | Art · Uhrzeit am Termin | bestätigt (nachgestellt) | Paket 17 |
| D4-P5 | Kunde · Nummer (Tag-Planung, Start) | bestätigt (nachgestellt) | Paket 17 |
| D4-P6 | Zeitkette („07:00–16:30 · 30 min Pause · 09:00 Std“) | bestätigt (nachgestellt) | Paket 14 |
| D4-P7 | Rolle/Einstufung · Zustand in der Mitarbeiterübersicht | bestätigt (nachgestellt) | Paket 19 |
| D4-P8 | Zeitraum · Dauer und Art · Zeitraum (Urlaub) | bestätigt (nachgestellt) | Paket 19 |
| D4-P9 | Einsatz-Unterzeile im Fenster | bestätigt (nachgestellt) | Paket 17 |
| D4-P10 | Stand der Auswertung; Plattform-Zeile | bestätigt (nachgestellt) | Paket 19 |
| D4-P11 | Adresse im Briefkopf, Kontaktzeile — bleibt | bestätigt (nachgestellt) | keine Handlung (8.2) |
| D4-P12 | Text · Verweis („… · Im Plan ansehen“; „Lager: 4 · Rohrleitungen“) | bestätigt (nachgestellt) | Paket 19 |

### 5.6 Was gut ist und so bleiben soll

In allen vier Bereichen ohne Befund: seitlicher Überlauf im Grundzustand, Schatten an
Nicht-Schwebendem, Radien von Blättern und Kacheln, Blattabstände, der dunkle Satz (kein Text
unter 4,5 : 1 in den gemessenen Ansichten; von den Prüfern der Papiere 9 bis 12 nicht
nachgemessen, vom Prüfer der Vermessung an 18 Seiten bestätigt). Kurz und gut sind laut den
durchgespielten Aufgaben: Arbeitstag starten (1 Tipp), Urlaub beantragen (7), Urlaubsantrag
entscheiden (2, mit Resturlaub und Einteilung am Antrag), Passwort vergessen (2), Kunde finden
über Strg+K (0 Klicks). Die Tippzahlen sind gezählt, nicht am Gerät gestoppt; die Prüfer haben
sie zum Teil nur an den beteiligten Blättern nachvollzogen.

---

## 6. Zu viel Text — Befund und Regel

### 6.1 Befund

Die Papiere 9 bis 12 melden 88 Funde (D1-T1 bis T25, D2-T1 bis T20, D3-T1 bis T22, D4-T1 bis
T21), je mit Wortlaut, Grund und Ziel. Die Prüfer haben jeden Wortlaut im Bild oder im Quelltext
wiedergefunden. **Vier Funde sind widerlegt** (D2-T7, D2-T15, D3-T4, D4-T9: der Text ist nicht
entbehrlich oder schon bedingt), **25 sind nur teilweise bestätigt** — der Wortlaut stimmt, aber
ein Teil schützt vor Schaden, begründet eine Sperre oder steht schon nur im abweichenden Fall.
Diese Teile stehen in der Liste 6.4 „bleibt“.

Die Funde fallen in sieben Muster:

| Muster | Beispiele | Wohin | Was die Gegenprüfung dazu sagt |
|---|---|---|---|
| **1. Untertitel im Seitenkopf wiederholt den Titel** | „Deine gebuchten Zeiten und dein Saldo“, „Aus Baustellen erzeugen, Zahlung verfolgen, stornieren“ (D1-T1, D2-T5, D3-T1, D4-T1) | in „Hilfe zu dieser Seite“ | Am Handy ist das seit E86 so gebaut (`PageHeader.tsx:127–134`); der Schritt ist „Beschreibung auch ab dem Tablet ausblenden“, nicht 30 Seiten anfassen. Er ändert E86 und stößt an E25 (vier Seiten behalten den Untertitel als Grenze mit Grund). Falle: der Dateiname des Kontoauszugs ist auch ein bloßer Text und verschwände mit |
| **2. Dieselbe Angabe mehrfach auf einem Bildschirm** | Rechnungsfenster: Betrag viermal, Stand zweimal (D3-T6); Tag-Planung: Datum dreimal (D4-T14); „fehlt 2“ und „Im Lager fehlen 2.“ (D4-T7); Benutzerakte: Wochenstunden an drei Stellen (D4-T8) | einmal, an der Stelle mit dem höchsten Rang | „Kontoauszug-Zeile: Kunde zweimal“ aus Fassung 1 entfällt — Folge der Beispieldaten (D3-T11). Der Kopf des Rechnungsfensters ist jung und gewollt; fällt dort „Offen“, braucht die Fälligkeit einen Ort |
| **3. Erklärsatz, der beim ersten Mal nützt, steht dauernd offen** | Rüstliste (D1-T3); Kalenderlegende (D1-T20); Mahn-Dialog (D3-T8); Wareneingang (D3-T15) | „Hilfe zu dieser Seite“ bzw. `hint` am Feld | Rüstliste: der Satz sagt zweierlei, eine Meldung mit „Rückgängig“ ersetzt ihn nicht ganz (D1-I16). Legende: der gewählte Tag muss den Feiertag nennen. Mahn-Dialog: nur die erste Hälfte ist entbehrlich |
| **4. Der Normalfall wird ausgeschrieben** | „Nacht 00:00“ (D1-T5); „0 Änderungen · 0 Löschsätze“ (D3-T20); „Soll 7:42“ in jeder von 15 Zeilen (D4-T10); „Rolle: Mitarbeiter“ (D1-T2); „0 reserviert“ (D3-T13) | nur zeigen, wenn abweichend | **„Skonto keines“, „Rücklass keiner“, Zahlbetrag gleich Brutto bleiben** — D3-T4 ist widerlegt (Befund G1 vom 15.11.2026 verlangt die festen Zeilen). „Saldo —“: umformulieren, die Kennzahl nicht verstecken (D1-T4). Die Rolle bleibt im Supporteinblick |
| **5. Technik- und Bürosprache beim Monteur** | „Timer-Schritt auf diesem Gerät vorgemerkt“ (D1-T6), „Zeitsitzung verwerfen“ (D1-T7), „Prüfsumme — entsteht mit der Unterschrift“ (D1-T15), „am Gerät verkleinert“ (D1-T14), „andere Satzarten“ (D3-T20) | kurzes Wort der Aufgabe; Technik in die Hilfe | „Kein Startdatum konfiguriert“ wird umformuliert, nicht gestrichen. Der Satz mit „Rechnungsquelle“ steht schon nur bei freier Baustelle. Mehrere Wortlaute sind in Prüfungen festgehalten |
| **6. Zeilen mit vier und mehr Angaben** | Baustellenliste am Handy: sieben Angaben, 282 px (D2-T1); Wartung: fünf Angaben (D2-T2); Eingang: Anliegen ungekürzt (D2-T3); Plattform (D4-T17) | weniger Angaben in der Zeile, der Rest ins Fenster | „Das Fenster der Zeile, das es überall gibt“ stimmt nicht: die Baustellenzeile öffnet eine Akte. Team, Projektleitung, Telefon lägen einen Tipp weiter weg — die Baustellenzeile bleibt deshalb, wie sie ist (E-W1) |
| **7. Blätter, die meist nichts tragen, stehen vor dem Inhalt** | Einkauf: „Nichts vorzuschlagen …“ (D3-T16); Scheine: „Stunden ohne Buchung (0)“ (D2-T6); „Kommen die Meldungen an?“ (D4-T16); Blatt „Geburtsdatum“ (D4-I11) | zugeklappt, wenn leer; Einzelknöpfe als Zeile ins Nachbarblatt | Gegen E99, wo es Karten trifft, deren Leersatz den nächsten Schritt trägt (Nachrichten, Einsätze). Scheine: zugeklappt darf der Satz nicht mehr behaupten, als geprüft wurde |

**Gemessen (Papier 8, Abschnitt 5; vom Prüfer nachgezählt):** die Seiten mit den meisten Wörtern
sind `/time` (662 am Handy), `/settings/module` (630) und `/my-schedule/mein` (406). Papier 8
sagt dazu ausdrücklich: `/time` und `/my-schedule/mein` sind lang, „weil die Liste lang ist, nicht
weil erklärt wird“. Elf Fließtexte über 20 Wörter stehen offen auf der Seite — darunter ein
Rechtstext, ein Beispielzustand der Vorschau und die zwei Absätze des Supportzugangs, die bleiben.
Kein Untertitel hat über 12 Wörter; in den Einstellungen steht der Seitentitel zusätzlich als
aktiver Reiter.

### 6.2 Was mit der Entscheidung E-T ist

Der Auftraggeber hat am 23.11.2026 zuerst der Textregel der Fassung 1 zugestimmt. Die
Gegenprüfung zeigt, dass drei der sechs Regeln so nicht halten (Regel 1 ändert E86 und stößt an
E25, ohne es zu sagen; Regel 5 „höchstens zwei Textzeilen“ ist mit langen Namen nicht haltbar;
Regel 6 stößt an E99) und dass Muster 4 einen widerlegten Befund enthielt. Die Regel wurde
deshalb in der folgenden Fassung neu vorgelegt (Abschnitt 10, Teil 2, E-T); **mit der Erklärung
des Auftraggebers vom 23.11.2026 gilt diese Fassung.**

### 6.3 Regel für `docs/design/v10/style.md` — Fassung nach der Gegenprüfung

1. Der Seitenkopf trägt einen Untertitel nur, wenn er eine Auskunft ist, die sich ändert (Datum,
   Dateiname, Zahl) — nie eine Beschreibung der Seite. Die Beschreibung steht in „Hilfe zu dieser
   Seite“, **künftig auch ab dem Tablet (das ändert E86)**. Die Auskunft bekommt am Baustein ein
   eigenes Merkmal, damit sie nicht mit ausgeblendet wird. Die vier Seiten aus E25 (Urlaub,
   Nachkalkulation, Handwerksscheine, Sonderurlaub) behalten ihren Untertitel, solange der
   Auftraggeber diese Grenze nicht aufhebt.
2. Jede Angabe steht auf einem Bildschirm einmal. Ein Kennwert im Kopf einer Akte zählt nicht als
   Wiederholung der Angabe in einem Reiter.
3. Erklärung steht in „Hilfe zu dieser Seite“ oder als `hint` am Feld. Offen bleibt, was eine
   Entscheidung trägt, vor Schaden schützt oder eine Sperre begründet; wechselnde Feldhinweise
   bleiben am Feld.
4. Der Normalfall wird nicht ausgeschrieben; gezeigt wird die Abweichung. Ausgenommen sind feste
   Zeilen, die eine Entscheidung verlangt (Zahlungsziel, Skonto, Rücklass und Zahlbetrag der
   Rechnung), und Angaben, die „geladen und null“ von „Stand unbekannt“ unterscheiden.
5. Eine Listenzeile trägt am Handy den Namen (er darf umbrechen), darunter höchstens zwei
   Angaben, und einen Wert rechts.
6. Ein Blatt ohne Inhalt steht zugeklappt oder als ein Satz — ausgenommen Karten, deren Leersatz
   den nächsten Schritt trägt (E99: Nachrichten, Einsätze).

Nicht Teil der Regel: ob eine Zeile höchstens den einen nächsten Schritt als Knopf trägt und
alles Weitere im Fenster steht — das berührte E74 und bleibt, wie es ist (E-R1).

### 6.4 Ausdrücklich bleiben

Aus den Papieren und aus der Gegenprüfung. Diese Sätze und Angaben werden nicht gestrichen und
nicht in die Hilfe verschoben:

- „Für diesen Tag gibt es bereits 1 Schein.“ · „Kein Ansprechpartner hinterlegt.“ · „Lager: 4 Stk
  (knapp)“ — samt dem Wort „knapp“ · „Keine Angaben zur Gesundheit — den Schein sieht jeder im
  Betrieb.“ · „Aufgezeichnet: … Bitte tatsächliche Zeiten und Angaben prüfen.“ · die Zeile unter
  einem abgeschnittenen Auswahlfeld (E91).
- „Das ist der Wareneingang — im Lager nicht noch einmal einbuchen.“ · „Im System stehen 4 Stk.“
- Die beiden Absätze unter „Nur ansehen“/„Mitarbeiten“ im Supportzugang und der Text zur
  Verjährung (§ 4 Abs 5 UrlG).
- „Resturlaub: 24 Tage — nach Genehmigung 14 Tage“ und „An 9 Tagen eingeteilt …“ am
  Urlaubsantrag.
- Zahlungsblock der Rechnung: „Skonto keines“, „Rücklass keiner“, Zahlbetrag — als feste Zeilen
  (Befund G1 vom 15.11.2026).
- Die zwei Sperrgründe und die Warnung vor „Rechnung erstellen“ — gekürzt, nicht gestrichen;
  je nach Rolle verschieden (D3-T5).
- „(wird am Schein vorgeschlagen)“ als Hinweis am Feld (D1-T8).
- „… bitte noch nichts fix buchen.“ im Fenster des Urlaubsantrags (D1-T16).
- „Der Anspruch ist der Restanspruch beim Umstieg.“, wo es einen Umstiegsstand gibt (D1-T17).
- Der zweite Satz des Verbindungsbands dem Sinn nach — kein Versprechen „Eingaben werden
  vorgemerkt“ (D1-T22).
- Die Rückfrage beim Abmelden mit beiden Aussagen: was liegt noch da, und es geht erst nach
  Anmeldung auf diesem Gerät hinaus (D1-T23).
- „Datenschutz · Impressum“ in höchstens zwei Schritten erreichbar (D1-T24; rechtlich).
- Der Satz von `Nachladen` („… von möglicherweise mehr geladen“, in den Wartungen „Die Suche geht
  nur über diese.“) — höchstens kürzer (D2-T7).
- Die Hinweise „Vom Kunden übernommen …“ und zur fehlenden Projektleitung in „Neue Baustelle“
  (D2-T15).
- „Geprüft über die n geladenen Scheine dieser Liste“ als Geltungsbereich (D2-T6).
- „Ohne Kunden — bitte einen wählen, bevor er übernommen wird.“ (D2-T18) · „(ohne Baustelle)“
  am Termin (D2-T12).
- Die wechselnden Feldhinweise im Fenster „Annahme-Link“ (D2-T14) und die Fristangabe im
  Schriftfeld der Annahmeseite (D2-T17).
- Der Schutzsatz am Schalter „Bauleistung“ (D3-T3) · „versendet wird er von dir“ im Mahn-Dialog
  (D3-T8) · „Erkannt: Buchungstag, Valuta, …“ und die Warnung zu unlesbaren Zeilen im Kontoauszug
  (D3-T10) · Kunde der Rechnung, Aufteilung, Skonto und Mahnkosten in der Kontoauszug-Zeile
  (D3-T11) · „* Pflichtfeld“ (D3-T14, D4-T19) · „Dafür zuerst die Baustelle wählen.“ (D3-T18).
- Der zweite Hinweis im Fenster „Einsatz bearbeiten“ („… Speichern überschreibt sie“, D4-T6) ·
  der Kern von „Nicht geladen: …“ auf der Startseite (D4-T3) · die Stichwortketten der
  Einstellungsübersicht als Suchstoff (D4-T4) · der Hinweis „Bereit für den ersten Beleg?“,
  solange der Briefkopf unvollständig ist (D4-T15).

### 6.5 Der nächste Schritt wird angeboten (E-F29)

Fassung 1 hatte ein eigenes Paket „Der nächste Schritt wird angeboten“ mit der Regel „die App
führt dorthin, wo es weitergeht“. Der Prüfer des Plans hält dagegen: wer fünf Benutzer oder
Kunden hintereinander anlegt, würde fünfmal aus der Liste geworfen. Die Regel lautet deshalb: **Die Meldung trägt den nächsten Schritt als Verweis; die App
wechselt die Seite nur, wo sie es heute schon tut oder wo kein zweiter Vorgang derselben Art
folgt.** Die Meldung mit „Rückgängig“ (F15) überlebt den Seitenwechsel; wer abbricht, kommt
dorthin zurück, wo er herkam. Die einzelnen Übergänge stehen in den Seitenpaketen (D2-I3, D2-I9,
D2-C6, D4-C3, A-12).

---

## 7. Statt der Trennpunkte — Befund und Regel

### 7.1 Befund

Im Quelltext steht „ · “ an rund 510 Codezeilen in rund 160 Dateien (vom Prüfer der Vermessung
selbst gezählt: 169 Dateien, 555 Zeilen, davon 44 Kommentar), 113-mal über `join(' · ')` in 67
Dateien, ohne gemeinsamen Baustein. Am häufigsten: Startseite (48 Zeilen), Material (47 + 16),
Planung (46), Rechnungen (42). Das runde „•“ kommt weder im Quelltext noch im gerenderten Text
vor. 51 Muster sind gesammelt (D1-P1 bis P17, D2-P1 bis P9, D3-P1 bis P13, D4-P1 bis P12).

**Die Zahlen zum gerenderten Text sind nicht widerspruchsfrei.** Papier 8 nennt 736 Punkte auf
163 Seiten bei 390 px, davon 60 auf `/time`. Der Prüfer der Vermessung hat die Werte je Seite
nachgemessen und bestätigt (`/time` 60 bei 390 px, 58 bei 1440 px). Der Prüfer des Plans findet in
den Rohdaten andere Summen (1.072 bzw. 1.008 Punkte) und weist darauf hin, dass 60 der Wert einer
Rolle ist, 736 aber die Summe über alle Rollen. Auch die Verteilung hängt an der Zählweise:
gezählt je Listenzeile sind bei 390 px zwei Punkte der häufigste Fall (390 Zeilen mit zwei, 205
mit einem, eine mit drei, vier mit fünf); gezählt je Textzeile ist es „fast immer ein Punkt“
(Papier 9). **Für den Wächter gilt deshalb eine feste Zählweise: je sichtbarer Textzeile, ohne
`aria-label`, ohne `title`, ohne `<option>`.**

### 7.2 Was mit der Entscheidung E-P ist

Der Auftraggeber hat am 23.11.2026 der Punktregel der Fassung 1 zugestimmt („nie mehr als ein
Punkt je Zeile“, sieben Ersatzformen, Wächter). Die Prüfer der Papiere 9 bis 12 haben die
Ersatzformen mit den Schriften der App bei 375 px und mit langen Namen nachgebaut:

| Ersatzform der Fassung 1 | Ergebnis der Gegenprüfung |
|---|---|
| Gruppenkopf „Tag“ in der Zeitliste (D1-P1) | mit umbrechendem Namen drei, mit Zustand vier Textzeilen statt zwei; kein Platz für Zustand, Marken und Knöpfe der Zeile; der Nutzen stützt sich auf die vierfach gebuchten Tage der Vorschau (Bericht 9) |
| Zeit rechts in der Titelzeile, Nummer als Stempel am Namen (D1-P4) | trägt nicht: ein langer Name braucht vier Zeilen statt drei (Bericht 9) |
| Lagerstand als eigene Angabe vor dem Kreis (D1-P10) | bis zu vierzeilig; der nackte Bestand steht dort, wo nach dem Tipp die Mengensteuerung erscheint (Bericht 9) |
| Name und Zustand in Zeile 1 (Wartung, Beteiligte, Eingang; D2-P1) | am Handy schlechter als heute: drei bis fünf Zeilen (Bericht 10) |
| Belegzeile einzeilig (D2-P2) | braucht 467 px — passt nicht in die Hauptspalte der Akte am Tablet (360 px) und nicht am Handy (Bericht 10) |
| Datumsspalte links am Termin (D2-P3, D4-P4) | bei 375 px wird der Titel zwei- bis vierzeilig; in der Wochenkachel passt sie nicht (Berichte 10, 12) |
| Feste Spalten am Schreibtisch (Angebotsliste D2-P5) | acht Spalten gehen erst ab dem Schreibtisch; am Tablet blieben dem Kunden 23 px (Bericht 10) |
| Feste Spalten im Mahnlauf und in „Nicht verrechnet“ (D3-P1, D3-P2) | passen nicht in die halbe Breite, die E98 diesen Karten ab 1.200 px gibt (Bericht 11) |
| Tabelle im Probelauf des Katalogs (D3-P11) | fünf Spalten in 311 bis 326 px lassen der Bezeichnung nichts (Bericht 11) |
| Zustand · Angabe · Angabe auf der Startseite (D4-P2) | trägt nur bei kurzen Titeln; wo das Wort der Aktion am Handy bleibt, sagt der Vorschlag nicht (Bericht 12) |
| Zähler rechts im Kartenkopf (D1-P8, D4-P3) | stößt an E98 (Zahl im Titel der Klappkarten) und E99 („3 Rechnungen“ im Kopf); Papier 12 empfiehlt die häufigere Form „(n)“ am Titel (Berichte 9, 12) |

Dazu kommt: Papier 8 schlägt „höchstens zwei Punkte je Zeile“ vor, die Papiere 9, 11 und 12 „nie
mehr als einen“. Die Regel wurde deshalb in der folgenden Fassung neu vorgelegt (Abschnitt 10,
Teil 2, E-P); **mit der Erklärung des Auftraggebers vom 23.11.2026 gilt diese Fassung** — also
„ein Punkt“, nicht „zwei“.

### 7.3 Regel für `style.md` — Fassung nach der Gegenprüfung

1. Der Punkt trennt höchstens **zwei kurze, gleichrangige** Angaben in einer leisen Zeile — nie
   mehr als ein Punkt je sichtbarer Textzeile.
2. Gemessenes steht für sich und braucht kein Zeichen davor. Nummern und Zeiten stehen in
   Begleitzeilen in Mono, das Datum in Meta-Zeilen nicht (E-V3).
3. Ein Zustand ist ein Zustand (Zeichen und Wort), kein Glied einer Kette; eine Warnung steht nie
   im grauen Punktfluss (heute: „Kundenart fehlt“ im Mahnlauf, „Liefertermin … überschritten“ im
   Einkauf).
4. Was die Gruppe sagt, steht im Gruppenkopf — aber der Stand einer Zeile bleibt in der Zeile,
   wenn die Gruppe ihn nicht sagt.
5. **Je Breite eine Form, vor dem Bau gemessen:** am Handy steht der Name allein in der ersten
   Zeile (er darf umbrechen), Zustand, Stempel und höchstens zwei Angaben stehen darunter; feste
   Spalten gibt es erst ab dem Schreibtisch und nur, wo das Blatt die volle Breite hat. Keine
   Ersatzform wird gebaut, die bei 375 px oder 834 px mehr Zeilen braucht als die heutige Zeile
   — dann bleibt die Zeile und steht als benannte Ausnahme in der Liste des Wächters (so der
   Mahnlauf und „Nicht verrechnet“, deren halbe Breite E98 festlegt).
6. Eine Nummer steht gerahmt (Stempel, `.zeile-nr`) nur als die eine Nummer am Titel einer Zeile;
   in Begleitzeilen steht sie ungerahmt über einen eigenen Baustein „Nummer“ — nicht über die
   Klasse `.nr` (die liegt an 26 Stellen auch auf Telefonnummern, Mengen und Datum). Datum und
   Betrag tragen keinen Stempel.

**Der Punkt bleibt:** bei zwei kurzen gleichrangigen Angaben („KW 48 · 23.11. – 29.11.“, „Max
Mustermann · du“; D1-P15), in der Summenzeile einer zugeklappten Karte (E98), in der Zählzeile
der Schublade „Noch einzuplanen“ („15 Baustellen · auf Person und Tag ziehen“, E96), in der
Anschrift und in der Kontaktzeile, wie sie auf dem Beleg stehen („Musterstrasse 1 · 2700 Wiener
Neustadt“, „Tel … · office@… · www…“ — auf der Annahmeseite zwei Punkte; D4-P11), und in den
Auswahlfeldern des Geräts (D1-P17).

**Bausteine** (entstehen in Paket 11): `ListRow` mit Wert rechts und
Stempel am Titel (gibt es); Wertpaare für Fenster- und Dialogköpfe über `AktenAngaben` bzw.
`Metric` (gibt es — einen Baustein `Angaben`, wie Fassung 1 schrieb, gibt es nicht); neu: der
Baustein „Nummer“ und ein Verbinder für die Teile einer Zeile statt `join(' · ')`, der die
Höchstzahl kennt (sein Name wird vor dem Bau festgelegt — Papier 8 nennt ihn `Angaben`).

**Wächter** (Paket 11): im Browser je sichtbarer Textzeile höchstens ein Punkt; im Quelltext
keine Zeichenkette mit zwei „ · “. Er wird mit einer **Ausnahmeliste der heutigen Fundstellen**
eingeführt (darunter der Zuschlag-Zusatz mit bis zu vier Punkten und die Termin-Zeilen); jede
Seite der Stufe C streicht ihre Einträge aus der Liste. Gegenprobe: ohne Ausnahmeliste am
heutigen Stand rot an den gesammelten Fundstellen.

---

## 8. Die vier Listen — was nicht in einem Paket steht

Jedes der 500 Kürzel steht entweder in genau einem Paket (Abschnitt 9) oder in genau einer dieser
vier Listen.

### 8.1 Durch die Gegenprüfung widerlegt (5)

Diese Punkte kommen in keinem Paket vor. Es wird nichts gebaut.

| Kürzel | Was das Papier sagte | Warum widerlegt |
|---|---|---|
| D2-T7 | „… von möglicherweise mehr geladen.“ | Der Satz ist die bewusste Auskunft „diese Liste ist abgeschnitten“ samt der Reichweite der Suche (`Nachladen.tsx:3–20`: „Eine stillschweigend abgeschnittene Liste ist schlimmer als eine langsame“). Mit „weg“ bliebe die Auskunft nirgends. Zulässig wäre nur: kürzer fassen (Bericht 10). |
| D2-T15 | Zwei Hinweise in „Neue Baustelle“ | Beide vorgeschlagenen Bedingungen sind der heutige Stand (nachgestellt): Satz 1 steht nur, solange das Feld den übernommenen Wert trägt (`AdresseFeld.tsx:36`); Satz 2 nur ohne Projektleitung. Sonst würde etwas „behoben“, das in Ordnung ist (Bericht 10). |
| D3-T4 | „Skonto keines“, „Rücklass keiner“, Zahlbetrag gleich Brutto | Befund G1 der Durchsicht vom 15.11.2026 (hoch, erledigt §97) hat genau diese festen Zeilen verlangt: „Zahlungsziel, Skonto, Rücklass und Zahlbetrag als feste Zeile unter den Summen“; die Prüfung `InvoicesView.test.tsx:6298–6306` verlangt „keiner“ (Bericht 11). |
| D4-C11 | „Benutzer deaktivieren“ fehle | In einer fremden Akte steht „Konto deaktivieren“ im Blatt „Zugang“ (`BenutzerakteView.tsx:341–360`, nachgestellt). Der Autor sah nur die eigene Akte — die Vorschau zeigt immer `u1`. Offen bleibt allenfalls der Name des Reiters „Zugang und Rechte“ (Bericht 12). |
| D4-T9 | Satz „Das eigene Konto lässt sich nicht sperren …“ | Der Satz „Das eigene Konto lässt sich nicht sperren …“ steht schon nur in der eigenen Akte; in jeder fremden Akte erklärt der zweite Absatz den Knopf direkt darüber (Bericht 12). |

### 8.2 Keine Handlung (13)

Der Zustand ist gewollt, entschieden oder darf nach dem Papier selbst bleiben.

| Kürzel | Worum es geht | Anmerkung der Gegenprüfung |
|---|---|---|
| V-B5 | Abschnittskopf versal/400 und gemischt/500 nebeneinander — beides ist entschieden (E92) | Keine Änderung ohne neue Entscheidung (E-F2). |
| V-B8 | Monatsbalken tragen den 3-px-Petrolstrich links — durch E96 entschieden („die Balken der Monatsansicht bleiben“) und eigens geprüft (`einsatzbalken.test.ts:115–118`) | — |
| V-B9 | Kennwerte im Seitenkopf: 17/400 ab Tablet, 15/500 am Handy — gewollt (E86) | — |
| V-B11 | Reiter der Akte am Handy zwei- und dreizeilig — der Umbruch ist gewollt; der Dreizeiler entsteht bei vier Reitern mit langem Namen (mit fünf rollt die Leiste schon) | Der Vorschlag des Papiers („ab fünf Reitern rollen“) ist der heutige Stand; ein tragfähiger Vorschlag fehlt. Keine Änderung ohne neue Entscheidung. |
| D1-P15 | Zwei kurze gleichrangige Angaben („KW 48 · 23.11. – 29.11.“) — darf bleiben | — |
| D1-P17 | Einträge der Auswahlfelder des Geräts — bleibt (E91) | — |
| D2-A16 | Knöpfe „30 Tage / 90 Tage / 1 Jahr“ 36 px hoch — benannte Ausnahme (`knopf.ts`, `style.md`), kein Fehler | Die Randbemerkung des Papiers „Suchfeld … kein Befund“ ist widerlegt (das ist V-5). |
| D2-C8 | Fenster übereinander: nie mehr als Fenster plus Rückfrage — nichts ändern | — |
| D2-T20 | Kundenliste: „Kundenart prüfen“ an jeder Zeile — die Zahl am Segment gibt es (fehlt nur in der Vorschau) | Der erste Vorschlag ist gebaut; der Rest steht im Papier unter Vorbehalt — dabei belassen. Attrappe in Paket 8. |
| D3-T3 | Rechnung stellen: Erklärsatz zum Übergang der Steuerschuld — der Satz schützt vor versehentlichem Einschalten | Der Satz bleibt. Den Schalter bei „privat“ zu verbergen wäre eine Funktionsänderung — nicht gebaut. |
| D4-A5 | Blatt-Titel „Noch einzuplanen“ in Serifenschrift — gewollt (E96, drei Wächter), kein Fehler gegen die Linie | — |
| D4-A9 | Firmendaten: Hinweisblatt und Felder halten die Fluchten nicht — keine Regelquelle | Der Hinweis steht nur bis zum ersten vollständigen Speichern; der Aufwand für seine Breite lohnt kaum. |
| D4-P11 | Adresse im Briefkopf, Kontaktzeile — bleibt | — |

### 8.3 Brauchte eine Entscheidung — entschieden: bleibt, wie es ist (39)

Befunde, die keine Regel verletzen oder durch eine frühere Entscheidung gewollt sind, und
Vorschläge, die eine Entscheidung zurückdrehen, eine Funktion wegnehmen oder etwas einen Tipp
weiter weg legen würden. Sie standen in Abschnitt 10 als Frage; nach der Erklärung des
Auftraggebers vom 23.11.2026 („alle offenen und überdachten entscheidungen wie von dir neu
empfohlen“) gilt je Punkt die neue Empfehlung: **es bleibt, wie es ist.** Die Spalte
„Entscheidung“ nennt die Zeile in Abschnitt 10.

| Kürzel | Worum es geht | Entscheidung | Warum es bleibt, wie es ist |
|---|---|---|---|
| A-17 | Die Angebotsakte trägt zwei ⋯-Menüs. Das zweite ist am 15.11. bewusst so gebaut worden (U1/U4), steht aber gegen „⋯ nur im Seitenkopf“ | E-R4 | Bleibt, wie am 15.11. gebaut: der Umbau nähme eine frische Entscheidung zurück und legte „Annahme-Link“, „Per Mail senden“, „Neue Fassung“ einen Tipp weiter weg. Das zweite ⋯ wird im Wächter als benannte Ausnahme geführt. |
| V-4 | Zweites ⋯ außerhalb des Seitenkopfs in der Angebotsakte (Administrator, Projektleitung, Geschäftsführung; die Buchhaltung hat gar kein ⋯) | E-R4 | Bleibt, wie am 15.11. gebaut (siehe A-17). Die Buchhaltung hat in der Angebotsakte gar kein ⋯. |
| V-14 | Kleiner Knopf mit 8 px, Zeilenknopf mit 12 px Radius — kein Versehen: die kleinere Rundung ist am Baustein beschrieben (`knopf.ts:88–96`) und geprüft (`KnopfLink.test.tsx:27`); `style.md` sagt „einheitlich, etwa 12 px“ | E-V4 | Bleibt: die kleinere Rundung des kleinen Knopfs ist am Baustein beschrieben und geprüft; `style.md` wird um diese benannte Ausnahme ergänzt. |
| D1-A13 | Hauptaktion des letzten Schein-Schritts ist zweizeilig — kein Fehler: der Umbruch zwischen zwei Wörtern ist Entscheidung E82 für genau diesen Knopf | E-R2 | Bleibt: der Umbruch zwischen zwei Wörtern ist Entscheidung E82 für genau diesen Knopf. |
| D1-A16 | „Baustellen-Threads“ im Seitenkopf der Nachrichten — kein englischer Rest: „Thread“ ist an mindestens zehn sichtbaren Stellen, im Handbuch und in `style.md` das Wort der App | E-R5 | Bleibt: „Thread“ ist das Wort der App. Nur den Untertitel zu ändern schüfe eine neue Unstimmigkeit; er wandert mit D1-T1 ohnehin in die Hilfe. |
| D1-A21 | Meldung liegt am Handy auf der Kopfinsel — keine Regel verletzt: oben ist Absicht (G29) | E-R12 | Bleibt: oben ist Absicht (G29); unter der Insel läge die Meldung auf Seitentitel, „Hilfe“ und ⋯. |
| D1-B4 | „* Pflichtfeld“-Legende nur in 7 von 69 Formularen mit Pflichtfeldern | E-F23 | Bleibt: keine Regel verlangt die Legende (U5 nimmt nur den Stern vom Warnzeichen aus); der Stern ist der Baustein der Pflichtfelder. |
| D1-B8 | Gruppenüberschrift in Blättern und Listen in zwei Formen (12/400 versal, 12/500 normal) | E-F2 | Bleibt: die vorhandenen Formen sind entschieden (E92) bzw. durch Wächter gedeckt; `style.md` benennt sie als Rollen, umgestellt wird nichts. |
| D1-B12 | „Startseite anpassen“: zwei Kästchen neben sechs Schaltern — durch E95 so gewollt (`schalterRegel.test.ts:89`: Auswahl aus einer Liste) | E-R6 | Bleibt: E95 behält Kästchen für die Auswahl aus einer Liste (`schalterRegel.test.ts:89`). |
| D1-I2 | Kopfinsel mit Rückweg „‹“ in Akte, Schein und Gespräch | E-R10 | Bleibt: stößt an U3 („keine Aktion doppelt“); der Betrieb steht in der Kopfinsel mit Absicht. |
| D1-I17 | Kennzahl „Resturlaub“ neben dem Arbeitstag statt als Band | E-R11 | Bleibt: widerspricht `style.md` („kompakte Kennzahlenleiste“); die Leiste trägt bis zu vier wählbare Zahlen. |
| D1-T24 | Profil-Blatt endet mit „Fassung · App erneuern · Datenschutz · Impressum“ | E-W1 | Bleibt: „Datenschutz · Impressum“ nicht hinter mehr Schritte legen als heute (rechtlich, § 5 ECG); „App erneuern“ und Fassung bleiben im Profil-Blatt. |
| D2-A9 | Runde gefüllte „+“-Knöpfe im Kartenkopf: (a) ist kein Fehler, sondern Entscheidung E76; (b) am Handy im Reiter „Termine“ der Baustellenakte zwei gleiche „+“ mit verschiedener Bedeutung | E-N | Bleibt: (a) ist Entscheidung E76; (b) die zwei gleichen „+“ entstehen aus E76 und E95 — beide bleiben. |
| D2-B10 | Termine in zwei Darstellungen; in der Karte Stift und Tonne statt antippbarer Zeile | E-R1 | Bleibt: Stift und Papierkorb in der Zeile sind Entscheidung E74; der Vorschlag kostete beim Ändern einen Tipp mehr. |
| D2-C7 | Tastatur am Schreibtisch: gut — bis auf den Fokus nach dem Öffnen eines Fensters („Schließen“ zuerst) | E-R13 | Bleibt: der Fokus auf dem Fenster ist gewollt (`BottomSheet.tsx:65–71`, Prüflauf 25.09.2026). |
| D2-C11 | Handy: Angebotsakte und Eingang zeigen die Positionen bzw. das Anliegen zuletzt | E-R4 | Bleibt: solange die Schritte im Verlauf stehen (E-R4), schöbe „Positionen zuerst“ sie hinter die Positionen. |
| D2-C12 | Knöpfe in Listenzeilen: Angebote bis zu zwei Knöpfe, Stift und ⋯; Wartungen zwei; Scheine einer | E-R1 | Bleibt: der Stift in der Angebotszeile ist E74; ein neues Zeilen-⋯ darf nicht entstehen (Leitfaden Regel 3); die Aktionen lägen einen Tipp weiter weg. |
| D2-I1 | Hauptaktion = nächster Schritt des Stands (Angebot, Eingang, Wartung) | E-R4 | Bleibt: an der Angebotsakte berührt die Idee die Anordnung vom 15.11.; die Hauptaktion je Rolle ist nicht geprüft (die Verwaltung legt keine Baustelle an, die Buchhaltung sieht nur PDF). |
| D2-I12 | Erster Fokus im ersten Feld bei „Neu“-Fenstern | E-R13 | Bleibt: heutiges Verhalten ist gewollt (Prüflauf 25.09.2026). |
| D2-T1 | Baustellenliste am Handy: sieben Angaben, 282 px je Zeile. Die Begründung des Papiers stimmt nicht (keine Maßlinie mehr; „nichts gebucht“ unterscheidet „null“ von „unbekannt“) | E-W1 | Bleibt: Team, Projektleitung und Telefon lägen einen Tipp weiter weg, und die Zeile öffnet eine Akte, kein Fenster; die Straße ist bei einer Hausverwaltung das Unterscheidungsmerkmal. Die Begründung des Papiers stimmt nicht (keine Maßlinie mehr; „nichts gebucht“ unterscheidet „null“ von „unbekannt“). |
| D2-T13 | „geschrieben von …“ unter jedem Schein | E-R3 | Bleibt: E99 hat „geschrieben von“ ausdrücklich gelassen. |
| D2-P2 | Belegzeile als Raster: einzeilig braucht 467 px — passt nicht in die Hauptspalte der Akte am Tablet (360 px) und nicht am Handy | E-R3 | Bleibt: die Belegzeile ist die von E99 festgelegte; die einzeilige Form passte ohnehin nicht in die Hauptspalte der Akte am Tablet. |
| D2-P3 | Termin: Datumsspalte links, Zeit rechts — bei 375 px wird der Titel zwei- bis vierzeilig | E-R1 | Bleibt: Stift und Tonne am Termin sind E74; die Datumsspalte würde den Titel bei 375 px zwei- bis vierzeilig machen. |
| D3-B12 | Abschnitt im Fenster: `h3` 15/500 gegen `section-label` 12/500 | E-F2 | Bleibt: siehe E-F2. |
| D3-B13 | Gruppe im Blatt: `section-label` nicht versal | E-F2 | Bleibt: siehe E-F2. |
| D3-B20 | Zeilenaktion: drei kleine Knöpfe an der bestellten Einkaufszeile | E-W1 | Bleibt: die Knöpfe der bestellten Zeile bleiben in der Zeile („Geliefert …“ läge sonst einen Tipp weiter weg). |
| D3-C4 | Mahnen in einem Zug | E-R15 | Bleibt: drei Knöpfe in einer Rückfrage gingen gegen U4; „in einem Zug“ überspränge Empfänger und Text; eine Sammelmahnung vor dem Abgleich mahnte, wer schon gezahlt hat. |
| D3-P1 | Mahnlauf-Zeile als Spalten — passt nicht in die halbe Breite, die E98 dem Mahnlauf ab 1.200 px gibt (für Name und Stempel bleiben 82 px bzw. nichts) | E-R9 | Bleibt: die Spaltenform passt nicht in die halbe Breite, die E98 dem Mahnlauf ab 1.200 px gibt. Die Warnung „Kundenart fehlt“ wird trotzdem ein eigener Zustand (Regel 3 in Abschnitt 7.3) — in Paket 15. |
| D3-P2 | „Nicht verrechnet“-Zeile als Spalten — dieselbe halbe Breite (386 px bei 1.200) | E-R9 | Bleibt: dieselbe halbe Breite (E98); „Regie nur, wenn nicht Regie“ nähme Regie als Normalfall jedes Betriebs an. |
| D4-B2 | Gruppenkopf in normaler Schrift 13/500 (Start, Planung) und in Versalien 12 px (Mitarbeiterübersicht, Benutzer) | E-F2 | Bleibt: siehe E-F2 — die normale Form ist durch `v10Stil.test.ts:683` gedeckt, die versale durch E92. |
| D4-B4 | Vier Kalender in vier Umsetzungen | E-F9 | Bleibt: kein gemeinsamer Kalenderbaustein — groß, schadet keinem Ablauf; E76 hat drei der Kalender erst am 10.11. umgestellt. Gebaut wird nur der Radius des Personenkalenders (D4-A13). |
| D4-B11 | Kurzname: der Monat nennt die Baustelle kurz, die Woche schreibt den Kundennamen vierzeilig | E-R8 | Bleibt: folgt aus E-R8 (der Kundenname wird in der Woche nicht gekürzt). |
| D4-B15 | Runder Kreis (`NeuKnopf`, E76) neben der gefüllten Hauptaktion im Tag-Fenster; in der Handy-Woche über der schwebenden Aktion | E-N | Bleibt: E76 nennt genau diese Stellen (Tagesfenster, Handy-Woche) als Auftrag. |
| D4-C12 | Planung bei 1440×900: 2½ Personen sichtbar — mit den absichtlich langen Namen der Beispieldaten (131 px je Zeile); mit einzeiligem Namen 77 px | E-R8 | Bleibt: die 2½ Personen entstehen aus den absichtlich langen Namen der Beispieldaten (131 px je Zeile; mit einzeiligem Namen 77 px); die Hochrechnung „2,6 Bildschirme“ ist kein Messwert; die einzige vorgeschlagene Lösung (D4-I1) wird nicht gebaut. |
| D4-I1 | Einsatzkachel zweizeilig: gemessen −27 % Höhe (nicht „70 statt 131 px“); zwölf Monteure passen auch dann nicht auf einen Bildschirm | E-R8 | Bleibt: gegen „Kunde nie abgeschnitten“ (`WochenEintraege.tsx:45`, `style.md`) und E96; gemessen nur −27 % Höhe, zwölf Monteure passen auch dann nicht auf einen Bildschirm. |
| D4-I5 | Leerer Betrieb: Blatt „Einrichten“ auf der Startseite — die Startseite trägt die Einrichtung schon als Themen unter „Zu erledigen“ | E-R16 | Bleibt: die Startseite trägt die Einrichtung schon als Themen unter „Zu erledigen“; ein eigenes Blatt stünde neben denselben Angaben. |
| D4-I10 | Start am Schreibtisch: „Dein Einsatz heute“ wird in der rechten Spalte 2.400 px lang | E-R9 | Bleibt: E98 hat die Einsatz-Vorschau gerade gebaut. |
| D4-T13 | Woche, Personensicht: Nummer in jeder Kachel — nur ab 1.200 px; am Tablet und Handy fehlt sie schon | E-R8 | Bleibt: siehe D4-I1. |
| N-V-1 | Kalendertage der Monatsplanung am Handy 41 × 68 px (30 je Monat) — unter 44 px; im Papier nur für die Musterseite erwähnt | E-V5 | Bleibt: sieben Spalten bei 390 px, das Raster ist in `blattKanten.test.ts:78` festgehalten; die Höhe (68 px) reicht. Benannte Ausnahme im Tastflächen-Wächter. |

### 8.4 Zurückgestellt — neue Entscheidung nötig (16)

Ideen ohne Befund, deren Nutzen ohne Verlust weder Papier noch Prüfer belegen, und Punkte, bei
denen der Prüfer keine sichere Lösung nennt. Sie werden in diesem Plan nicht gebaut. Wer eine
davon will, entscheidet sie einzeln neu. Dazu gehören auch die eigenen Ideen zum Zusammenspiel
(Abschnitt 4.11).

| Kürzel | Worum es geht | Entscheidung | Warum zurückgestellt |
|---|---|---|---|
| D1-C2 | „Aufteilen“ gibt es erst am gespeicherten Eintrag | E-F8 | Zurückgestellt: fachlich offen (mehrere Buchungen ohne Netz im Ausgangsfach, Jugendschutz- und Abschlussprüfungen je Teil); das Papier nennt den Aufwand „mittel bis groß“ und selbst den Vorbehalt „fachlich abstimmen“. |
| D1-C7 | Kein „Büro“ als Empfänger; das Menü am Beitrag ist ein Zeichen ohne Wort | E-F7 | Zurückgestellt: die Runde „Büro“ ist eine neue Funktion (Mitgliedschaft folgt der Rolle, Rechte, Datenauskunft, wer ein Gespräch liest — E64); das Papier nennt selbst den Vorbehalt „fachlich“. Das Zeichen ohne Wort am Beitrag ist nach `style.md` mit `aria-label` erlaubt. |
| D1-I1 | Timer-Leiste auch im Zustand „bereit“ auf den Seiten des Monteurs | E-F4 | Stapelt sich mit Korbleiste, Aktionsleiste und dem mitfliegenden Knopf; auf `/material` drei schwebende Flächen übereinander. Nur mit Timer-Modul. |
| D1-I6 | Startbild für iOS | E-F4 | `index.html` trägt eine CSP-Prüfsumme und den Wächter `petrolFarben.test.ts`. |
| D1-I7 | Zahl am App-Zeichen | E-F4 | Die Zahl muss auch sinken, wenn auf einem anderen Gerät gelesen wird — braucht den Push-Weg; „klein“ ist knapp. |
| D1-I10 | Zustand nach Rückkehr aus dem Hintergrund behalten | E-F4 | Idee ohne Befund; Nutzen ohne Verlust ist nicht belegt. |
| D1-I12 | Blatt in zwei Höhen | E-F4 | Trifft alle 66 Blätter; volle Höhe mit offener Tastatur am iPhone am Gerät prüfen. |
| D1-I13 | Kontextmenü an Zeilen (langes Drücken) | E-F4 | Die Zeile ist ein Verweis — iOS zeigt sein eigenes Menü; dazu Textauswahl und Wischgeste (F15). |
| D2-I6 | Kontextmenü an der Zeile | E-F4 | Ein eigenes Rechtsklick-Menü nimmt „In neuem Tab öffnen“; sichtbare Aktionen dürfen dafür nicht entfallen. |
| D2-I8 | Fenster der Zeile mit Pfeil auf/ab weiterblättern | E-F4 | Pfeiltasten in Feldern und beim Rollen des Fensters. |
| D3-C1 | Rechnung stellen als Arbeitsbereich in erkennbarer Folge — sieben Punkte hängen an der heutigen Anordnung, zwei widersprechen der vorgeschlagenen | E-R14 | Zurückgestellt: sieben Punkte hängen an der heutigen Anordnung, zwei widersprechen der vorgeschlagenen (Leistungszeitraum und Konditionen stehen mit Absicht vor den Positionen). Wird später neu entschieden, dann als eine Seite in vier Abschnitten, nicht als geführter Ablauf; „Vorschau“ bleibt das Wort. |
| D3-C2 | „Verrechnen“ statt „Baustelle wählen“ | E-R14 | Zurückgestellt: Art und Konditionen stehen mit Absicht vor dem Zusammenstellen; der Weg `?neu=` stellt nicht zusammen (zwei Verhalten für dieselbe Absicht); 18 Prüfungen suchen „Baustelle wählen“. |
| D3-C9 | Verkaufs- und Einkaufspreis in der Katalogzeile | E-R17 | Zurückgestellt: ein Preisrecht gibt es nur für den Einkaufspreis (eigene Tabelle, nur die Geschäftsführung liest); in der Zeile hieße das eine Abfrage je Seite — nicht „klein“. |
| D4-A6 | Drei Formen des Tastaturfokus (3 px/2 px Versatz allgemein; 2 px an Zeilen; 17 Regeln mit `--focus-ring`). Das Soll ist nicht eindeutig: `style.md` nennt `--focus-ring`, E95 nennt Petrol | E-F13 | Zurückgestellt: `style.md` nennt `--focus-ring`, E95 nennt Petrol — welche Form gilt, ist nicht geklärt. Farbe, Breite und Versatz der drei Fokusformen bleiben; gebaut wird nur V-13. |
| D4-I7 | Startseite anpassen: Reihenfolge per Griff ziehen | E-F4 | Idee ohne Befund; Nutzen ohne Verlust ist nicht belegt. |
| N-D4-1 | Firmendaten am Schreibtisch: nach einer Änderung im ersten Feld ist bei 1440×900 keine Speicherleiste im Bild (sie steht 1.650 px unter dem Feld); ab 1.200 px ist jede Speicherleiste `position: static`, §112 nennt sie „klebend“ | E-F30 | Zurückgestellt: eine klebende Leiste ab 1.200 px änderte `Speicherleiste`/`Aktionsleiste` für alle Formulare (`raster.spec.ts`, `flucht.spec.ts`, Bewegungen B4); der Prüfer nennt keine sichere Lösung. |

---

## 9. Der Plan in Paketen

Je Paket: Ziel · Punkte · Voraussetzung · Schritte · Vorgaben aus der Gegenprüfung · Prüfungen
mit Gegenprobe · Bleibt gleich · Risiko · Aufwand. Die Regeln aus Abschnitt 2.2 gelten für jedes
Paket und stehen dort nur einmal. **Die Tabelle „Vorgaben aus der Gegenprüfung“ ist Teil des
Auftrags an den, der baut:** sie enthält jede Warnung eines Prüfers, dass ein Vorschlag so, wie er
im Papier oder in Fassung 1 stand, etwas verschlechtern würde. Für die Befunde am Code steht die
Bauanleitung im Papier; die Tabelle „Prüfung mit Gegenprobe / Bleibt gleich“ gibt den Wortlaut
des Papiers wieder, die Vorgaben berichtigen ihn.

### 9.1 Reihenfolge und Abhängigkeiten

| Schritt | Paket | Braucht vorher | Warum an dieser Stelle |
|---|---|---|---|
| Vorab | Verdacht S-4 klären | — | Sicherheit zwischen Betrieben geht vor |
| A | 1 Wächter und Rückfälle | Vorab | Schaden heute; die Wächter schützen jede weitere Datenbankarbeit |
| A | 2 Bau bei jedem PR, Leistungsbudget | — (kann parallel zu 1) | die nächste Erweiterung an Rechnungen, Startseite oder Baustellenakte bräche sonst den Bau erst auf `main` |
| A | 3 Geld | 1 (Wächter Textersatz: `rechnung_anlegen` gilt als Definition plus Textersatz), 2 | drei Änderungen an der Funktion, die jede Rechnung anlegt — in einer Migration |
| A | 4 Kassakonto (G-4) | Auskunft der Kanzlei (K-1) | wartet auf die Kanzlei und hält die Stufe nicht auf |
| A | 5 Ohne Netz, stille Fehlschläge | 1 | Datenverlust |
| A | 6 Material: Bestand | 1 (`lager_liste`, `anforderungen_laufend`) | falscher Bestand |
| vor B | 7 Rechnungsfenster herauslösen | 2, 3 | `InvoicesView` wird in vielen Paketen angefasst; bis dahin kein zweiter offener PR an der Datei |
| B | 8 Vorschau, Bildwerkzeug, Inventar | — | ohne Bilder und ohne aktuelles Inventar lässt sich Stufe C nicht absichern |
| B | 9 Bausteine und ihre Wächter | 8 | ein Baustein berichtigt viele Seiten |
| B | 10 Schreibweise | 8 | Formatierer und Wörterliste vor den Seiten |
| B | 11 Zeilen- und Textregel | 8, 10 | Regeln, Bausteine und Wächter mit Ausnahmeliste vor den Seiten |
| B | 12 WebKit für Büro und Tablet (L-11) | 2 | die Büroseiten sind in WebKit sonst ungeprüft, wenn Stufe C sie umbaut |
| C | 13 bis 20 Seiten | 7 bis 12; je Seite die zweite Durchsicht aus Paket 8 | jede Seite genau einmal |
| D | 21 Zeit · 22 Auftragskette · 23 Planung · 24 Geld · 25 Material · 26 Plattform | 1; im Einzelnen je Paket | größere Stücke; einzelne warten auf die Kanzlei |
| E | 27 Auslieferung · 28 Prüfungen und Ordnung · 29 Skalierung | 27 kann jederzeit vorgezogen werden | begleitend |

Abhängigkeiten, die Fassung 1 verletzt hatte, und wie sie jetzt gelöst sind:

| Abhängigkeit | Lösung |
|---|---|
| Monteur-Paket brauchte den Leistungsumfang aus A-10 | „Meine Baustellen“ wird nach dem Papier gebaut (Wegeleiste an der Karte, D1-C5); der Leistungsumfang kommt mit A-10 in Paket 22 und ist keine Voraussetzung mehr |
| „Nächster Schritt“ baute M-6 vor dem Material-Paket | M-6 steht ganz in Paket 25; der Teil „nach dem Unterschreiben fragen“ ist ohnehin schon gebaut |
| Einkaufsliste wurde vor M-9 umgebaut | die Einkaufsliste wird nur einmal umgebaut — in Paket 25, zusammen mit M-9 (D3-C6, D3-C10, D3-T16, D3-P8, D3-P9) |
| „Rechnung stellen“, Schritt ③, brauchte G-11 | der Schritt entfällt (D3-T4 ist widerlegt, D3-C1 zurückgestellt); G-11 fügt in Paket 24 die Vorgabe des Kunden in das bestehende Konditionen-Blatt ein |
| G-12 (Nummernschema) ändert, was G-1 als Rechnungsnummer erkennt | G-12 enthält den Schritt „der Abgleich folgt dem eingestellten Schema“ |
| Krankmeldung aus der Planung (D4-C1) brauchte P-4 | D4-C1 (a) und (b) stehen in Paket 23 nach P-4; nur das Fenster in Abschnitten (c) steht in Paket 17 |
| L-7 (mehr Abgleiche) verschärft Verdacht L-1 | die eine Warteschlange für `abgleichen` kommt in Paket 23 vor L-7 |
| A-6/P-12 und A-1/P-10 ändern dieselbe Funktion | Paket 22 baut auf der Fassung aus Paket 1 auf (Regel 13) |
| M-5 (Verkaufspreise nachziehen) zöge Preise in falscher Einheit nach | M-5 (Paket 25) setzt M-3 (Paket 6) voraus |
| D3-C7 („4 Stk frei“) hängt an `anforderungen_laufend` und an „frei“ | Paket 16 setzt Paket 1 und Paket 6 voraus |

### 9.2 Pakete der Fassung 1 → Pakete der Fassung 2

| Fassung 1 | Fassung 2 |
|---|---|
| 1 Rückfälle, drei Wächter | 1 (dazu fünf neue Befunde) |
| 2 Geld | 3; G-4 als eigenes Paket 4 (wartet auf die Kanzlei); A-14 kommt aus 18 dazu |
| 3 Ohne Netz und stille Fehlschläge | 5 |
| 4 Material: der Bestand stimmt | 6 |
| 5 Ein Fuß, eine Zeile, ein Kopf | 9 — nur Bausteine und Wächter; die Formulare und Seiten stehen in 13 bis 20 |
| 6 Eine Schreibweise | 10 — Formatierer, Wörterliste, Tastaturen als Regel und Wächter; E-V1 in 9, E-V2 in 10, E-V3 in 11 |
| 7 Statt der Punkte | 11 — Regel, Bausteine, Wächter; umgestellt wird je Liste in 13 bis 20 |
| 8 Weniger Text | 11 — Regel und `PageHeader`; die Texte je Seite in 13 bis 20 |
| 9 Vorschau zeigt jeden Bildschirm | 8 — vorgezogen, erweitert um Bildwerkzeug, Messskripte, Inventar und die zweite Durchsicht |
| 10 Der Monteur am Handy | 13 (Hülle und Startseite) und 14 (Seiten des Monteurs) |
| 11 Rechnung stellen, Kontoauszug, Einkauf | 7 (Herauslösen der Fenster), 15 (Rechnungen), 16 (Material im Büro), 25 (Einkaufsliste mit M-9) |
| 12 Planungstafel und Kalender | 17 |
| 13 Akten, Angebote, Scheine, Wartungen | 18 |
| 14 Der nächste Schritt wird angeboten | aufgelöst: die Regel steht in Abschnitt 6.5, die Übergänge in den Seitenpaketen 18 und 19; A-16 in 22, M-6 in 25 |
| 15 Erster Eindruck, Akten gleich, Sackgassen | 18 (Akten), 20 (Fehlerseiten, Anmeldung) |
| 16 Einstellungen | 20 |
| 17 Zeit und Personal | 21 |
| 18 Auftragskette | 22 (A-14 in 3; A-12 in 18; A-17 bleibt, wie es ist) |
| 19 Planung | 23 (P-11 in 17) |
| 20 Geld | 24 |
| 21 Material | 25 |
| 22 Plattform, Datenschutz, Härtung | 26 |
| 23 Auslieferung | 27 (L-9 vorgezogen in 2) |
| 24 Prüfungen und Ordnung | 28 (L-11 vorgezogen als 12) |
| 25 Skalierung | 29 (L-4 Schritt 1 in 2; das Herauslösen aus L-12 in 7) |
| „Später“ | Liste 8.4 (D1-I8 ist kein „Später“: Paket 14) |

### 9.3 Seite → Paket: jede Seite wird genau einmal umgebaut

Stufe B ändert Bausteine, die auf vielen Seiten wirken, und führt Wächter mit einer Ausnahmeliste
der heutigen Fundstellen ein. Alles, was eine einzelne Seite betrifft — Pfeil an der Zeile,
Punkte, Text, Knöpfe, Fuß des Formulars, Tastaturen der Felder, umbenannte Wörter — geschieht in
dem einen Paket der Seite, in einem PR je Seite. Jede Seite streicht dabei ihre Einträge aus den
Ausnahmelisten der Wächter.

| Seite oder Bereich | Paket | Was dort alles geschieht |
|---|---|---|
| Hülle: Seitenleiste, Kopf- und Fußinsel, Profil-Blatt, Verbindungsband, „Neue Fassung“-Leiste, Suche am Handy | 13 | Seitenleiste rollt in sich; Titel in der Kopfinsel; Ausgang der Suche; Texte von Verbindungsband und Abmelde-Rückfrage; Zeichen im Profil |
| Startseite (alle Rollen), „Startseite anpassen“ | 13 | Seitenkopf ohne Rolle; Zeilen der Themen; Verweiszeichen; Kartenkopf mit Zahl; Pfeilknöpfe |
| Zeit (`/time`): Liste, Zeitblatt und -formular | 14 | Löschen ins ⋯; Kennzeichen-Feld; Zeile der Zeitliste; Kennzahlen; Texte; Tastaturen |
| Mein Einsatzplan, Team-Woche, Meine Baustellen | 14 | Tagesliste; Aktionen am Einsatz; Kalenderkopf; Kalender-Abo; Rüstliste |
| Material des Monteurs (Katalog, Korb, Meine Anforderungen, Retoure) | 14 | Korb mit „Abschicken“ im Bild; Zeilen; Texte |
| Handwerksschein schreiben (`/worksheet`) | 14 | Karten und Abstände; gesperrte Hauptaktion nennt den Grund; Texte; Hinweis „Quer halten“ |
| Nachrichten (Postfach, Gespräch, Neue Nachricht) | 14 | Zeit kurz; Adresse nicht in Mono; Fußinsel bei offener Tastatur |
| Rechnungen: Liste, „Rechnung stellen“, Rechnungsfenster, Zahlungsdialog, Mahnlauf, Export, E-Rechnung | 15 | Positionen am Handy und Tablet gestapelt; Beträge in Mono auf einer Flucht; doppelte Angaben; eine gefüllte Hauptaktion; Tastatur |
| Kontoauszug | 15 | Flucht von Zustand und Betrag; Datei per Ablegen; Blatt „Datei“ |
| Nachkalkulation | 15 | Wiederholungen je Zeile |
| Lager, Katalog, Katalog einspielen, Anforderungen („Laufend“) | 16 | Zustand mit Auslassung; Warnzeichen mit Wort; Filter im Blatt; Pfeil; Texte; Querverweise |
| Einkaufsliste | 25 | zusammen mit M-9: Hauptaktion „Bestellen …“, Leerzustände, Blätter, Zeilen |
| Planung: Woche, Monat, Tag; Fenster Einsatz, Termin, Tag | 17 | Tag-Planung am Handy als Blatt; „Verschieben …“ im ⋯; Fuß des Einsatz-Fensters; Monat unter 1.200 px; Uhrzeit je Person |
| Kunden (Liste, Akte) | 18 | zwei Formulare zu einem; Kennwerte im Kopf; Reiter „Belege“ |
| Baustellen (Liste, Akte) | 18 | Fuß der „Neu“-Fenster; Team an der Akte; Bearbeiten in Abschnitten; Löschen im ⋯ der Akte |
| Liegenschaften | 18 | Akte wie die anderen (`AktenKopf`, Kontextspalte); vollständig nachladen |
| Auftragseingang | 18 | Zeile kürzen; Nummern ohne Umbruch |
| Angebote (Liste, Formular, Akte), Kundenseite der Annahme | 18 | Spalten der Liste; Formular in zwei Zonen; Überdeckung am Handy; Schritte an der angenommenen Akte (A-12) |
| Handwerksscheine (Liste, Fenster), Wartungen, Papierkorb-Verweis | 18 | Schein im Fenster der Akte; „Einplanen“ als Wort; „Wartung erledigt“ nicht rot |
| Mitarbeiterübersicht, Benutzer, Benutzerakte | 19 | Tabelle auf den Baustein; Pfeil; Handy-Steuerungen; Meldung mit „Akte öffnen“ |
| Urlaub (`/vacations`) | 19 | Reihenfolge; eine gefüllte Hauptaktion; Zeilen |
| Einstellungen (alle Unterseiten), Mein Konto | 20 | Gliederung; Suche; Zusatz „noch nicht gespeichert“; Briefkopf-Vorschau |
| Plattform, Anmeldung, zweiter Faktor, Fehlerseiten, Rechtsseiten | 20 | drei Gestalten des Anmeldewegs; „Kein Zugriff“ und Fehlertafel in der Linie; unbekannte Adresse |

Funktionen, die in Stufe D zu einer Seite dazukommen (etwa A-16 auf der Startseite, G-7 im
Rechnungsfenster), sind Ergänzungen, kein zweiter Umbau.

---

### Vorab — vor Paket 1

**Verdacht S-4 (Realtime, Löschereignisse) klären.** Papier 6: bei `REPLICA IDENTITY FULL`
liefert Supabase für gelöschte Zeilen den Primärschlüssel auch an Abonnenten anderer Betriebe,
wenn ohne Filter abonniert wird. Kein Prüfer hat den Verdacht angefasst (er braucht einen
Realtime-Server). Zu tun: gegen den lokalen Stapel mit zwei Betrieben prüfen, ob ein Konto des
Betriebs B ein Löschereignis aus Betrieb A bekommt — für die Kanäle über `abonnieren` und für die
elf Stellen, die einen Kanal direkt halten (Bericht 7). Bestätigt sich der Verdacht, wird er ein
eigener Befund mit eigenem Paket vor Paket 1; sonst steht das Ergebnis im Stand.
**Verdacht G-4** (`rechnung_ersetzen`) ist durch Bericht 4 entkräftet — nichts mehr zu klären.
**Aufwand:** ½ bis 1 Tag.

### Stufe A — Rückfälle und Fehler mit Schaden

#### Paket 1 — Wächter zuerst, Rückfälle beheben

**Ziel:** Der Rückfall beim Urlaub, die Nebenwirkung des Monatsabschlusses und der Rückfall im
Supportzugang sind behoben; die Nachkalkulation verliert keine Kosten mehr; dieselbe Art Fehler
kann nicht unbemerkt wiederkommen.
**Punkte:** Z-1, Z-2, Z-15, A-1, P-10, M-1, M-2, M-16, S-1, S-10, S-13, L-1, L-2, N-Z-1, N-S-1, N-S-2, N-L-1, N-L-2. **Dazu Teile von:** N-S-4 (Rollenprüfungen in den hier angefassten Funktionen als `… is not true`).
**Voraussetzung:** Verdacht S-4 geklärt (Vorab). Entscheidung E-F22 (entschieden).

| Schritt | Was | Prüfung und Gegenprobe | Bleibt gleich |
|---|---|---|---|
| 0 | **N-L-2:** Zeilengrenze des gehosteten Projekts ablesen und in `DEPLOYMENT.md` festhalten | — | — |
| 1 | **Wächter Textersatz (Z-15):** `tests/unit/migrationenTextersatz.test.ts` liest die Migrationen in Reihenfolge und schlägt an, wenn eine Funktion nach einem Textersatz noch einmal definiert wird (Ausnahmeliste mit Grund). Dazu in `tests/supabase/schema.test.ts` eine Tabelle „Funktion → muss enthalten“ für lohn- und geldrelevante Stellen (`urlaub_entscheiden`, `urlaub_kuerzen` → `urlaubstage_person`; `app.baustelle_abschluss_zaehlen` → `scheine_verrechnet_kern`) | Der Wächter ist am heutigen Stand rot wegen `urlaub_entscheiden`. **Grün wird er nach Schritt 2 nur mit dem Eintrag „behoben in <Migration>“ in der Ausnahmeliste.** Die Tabelle in `schema.test.ts` ist ohne die Migration aus Schritt 2 rot, mit ihr grün | keine Migration wird angefasst |
| 2 | **Z-2:** neue Migration als Textersatz am Endstand (Regel 13): `urlaub_entscheiden` und `urlaub_kuerzen` rechnen über `app.urlaubstage_person(…)`; ein Tag, an dem eine Zeile dieses Antrags steht, lässt sich weiter einzeln streichen. Dazu die lesende Abfrage für den Bestand seit 16.11. | `urlaubMitVerlauf.test.ts`: Antrag über den Tag einer vorgemerkten Änderung genehmigen, kürzen, zurücknehmen — Tage wie in der Vorschau der App; unter dem Fehler gebuchter Tag lässt sich streichen. Ohne Migration rot | Personen ohne Verlauf bekommen dieselben Tage (vom Prüfer für sieben Muster verglichen); genehmigte Anträge werden nicht neu gerechnet |
| 3 | **Z-1, N-Z-1:** `app.monat_abgeschlossen_sperre()` lässt ein UPDATE durch, wenn sich nur `is_billed`, `invoice_number`, `updated_at` ändern (Vergleich über `to_jsonb(new) - Spalten`, damit neue Spalten von selbst gesperrt bleiben); eigener Merker für `baustelle_umnummern`, gleich nach dem UPDATE zurückgesetzt; im abgeschlossenen Monat rechnen `nacht_setzen`, `satz_setzen` und `baustelle_aufloesen` nichts nach, wenn sich Zeiten, Stand und Abwahl nicht ändern; `app.satz_nachziehen` lässt abgeschlossene Monate aus | `monatsabschluss.test.ts`: Rechnung ausstellen, stornieren, Storno aufheben, Baustelle umnummern im abgeschlossenen Monat (ohne Migration rot, 23514); **„eine Rechnung über einen abgeschlossenen Monat lässt jede andere Spalte unverändert, auch wenn Nachtzeit oder Einstufung inzwischen geändert wurden“**; Einstufung ändern geht nach dem Abschluss; nach `baustelle_umnummern` geht in derselben Transaktion kein freies UPDATE durch | Büro ändert Ende, Kommentar, Baustelle, Notdienst oder löscht → weiter 23514; der Monteur setzt `is_billed` nicht (42501); Anlegen mit `is_billed = true` bleibt gesperrt; offene Monate rechnen wie heute; je eigene Prüfung |
| 4 | **Wächter Support-Einblick (S-10, M-16):** jede Funktion aus `LESENDE_FUNKTIONEN` steht in genau einer Liste: „läuft im Einblick“ oder „dem Support verschlossen“ mit Grund | Kriterium: mit angelegten Zeilen kommt mit der Freigabe „ansehen“ **dasselbe Ergebnis wie für den Administrator**. Am heutigen Stand rot für die vier Listenfunktionen und für `lager_frei`/`lager_knapp` | was dem Support verschlossen ist, bleibt es |
| 5 | **S-1, M-1, N-S-1, S-13:** eine Migration am Endstand. `baustellen_liste`, `lager_liste`, `anforderungen_laufend`, `wartungen_faellig_stand`, **`lager_frei`, `lager_knapp`** nehmen `coalesce(app.betrieb(), app.supportbetrieb())`; die Prüfung `app.darf(betrieb)` dahinter bleibt. `schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager` und die drei Anforderungs-Rückfälle je nach Vorgabe (Tabelle unten). `startseite-forderungen` bekommt den Betrieb aus dem Rumpf, gelesen wird weiter mit dem Token der Person; danach `node scripts/edge-shared-uebernehmen.mjs` | `supportAnsehenListen.test.ts`, `startseiteForderungen.test.ts`: im Einblick dieselben Zahlen wie der Administrator; `supportArbeitetMit.test.ts`: je Funktion ein Fall mit echter Zeile. Ohne Migration rot | die bestehenden Fälle der vier Prüfdateien; 35 Vergleiche Betriebskonto × Aufruf vorher/nachher gleich; die Gegenfälle aus Bericht 6 (Freigabe widerrufen, abgelaufen, `aal1`, fremder Betrieb …) je 42501 oder 0 Zeilen; **mit „ansehen“ ändert kein Aufruf eine Zeile des Betriebs** (mit echten Zeilen geprüft); Projektleiter, Verwaltung, Monteur in `schein_verrechnung` wie heute; `baustellen_budget_lage` bleibt verschlossen (Grund: Datenschutz); ohne Token weiter 401 |
| 6 | **Wächter Zeilengrenze (L-2, M-16):** `tests/unit/funktionsgrenzen.test.ts`: jeder `.rpc(` mit Zeilenmenge braucht `.range(`/`rpcAlle`, ein `limit` im Rumpf oder einen begründeten Eintrag; die sieben Hüllen mit veränderlichem Namen sind erfasst | mit rund 30 begründeten Einträgen rot für genau drei Funktionen, bis Schritt 7 gebaut ist | — |
| 7 | **L-1, M-2, N-L-1:** Helfer `rpcAlle` in `kern.ts`; `ausgegebenes_material_gesamt` und `schein_einkaufspreise` bekommen eine eindeutige Reihenfolge (`beleg_id` bzw. `wm.id`; neue Migration); `ausgegebenes_material` wird nur umgestellt; beim Zusammenführen über `beleg_id` entdoppeln | `ausgegebenesMaterialGesamt.test.ts` mit 1.200 Zeilen über zwei Baustellen: alle kommen an; mit dem heutigen Aufruf genau 1.000 | Zeilen, Vorzeichen der Retouren, Rechte, Bündeln, Ansicht (bestehende Prüfungen) |
| 8 | **A-1, P-10, N-S-2:** `app.baustelle_abschluss_zaehlen` zählt über `app.scheine_verrechnet_kern`; der Aufruf von `ausgegebenes_material` läuft auch im Supportzugang mit „Mitarbeiten“ | `baustelleAbschliessen.test.ts`: die drei Fälle aus P-10 (Regie mit Stundenschein im abgerechneten Zeitraum, Regie mit Ersatzschein nach Storno, Pauschal mit gültiger Rechnung) melden 0; Schein und Stunden **nach** der Schlussrechnung; Gegenprobe Regie mit Material ohne Rechnung meldet 1. Ohne Migration rot | eine Regiebaustelle mit wirklich offenem Schein zählt wie bisher; `null` für die Projektleitung fremder Baustellen bei allen vier Schlüsseln; Material nur für `ist_buch_oder_spitze`; Rückgabeform |

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| Z-1 | Die Ausnahme allein reicht nicht (Bericht 1, 2a). (1) Auch „Einstufung ändern“ scheitert (N-Z-1) und bleibt mit dem Vorschlag gesperrt. (2) Die Ausnahme vergleicht, bevor `nacht_setzen`, `satz_setzen`, `baustelle_aufloesen` an der Zeile weiterrechnen: nachgestellt kippt `is_night_work` beim Ausstellen im abgeschlossenen Monat. Nötig ist eine Stelle, die im abgeschlossenen Monat nichts nachrechnet, wenn sich Zeiten, Stand und Abwahl nicht ändern; offene Monate rechnen wie heute. (3) Der Merker für das Umnummern wird gleich nach dem `UPDATE` zurückgesetzt (`set_config(…, '', true)`). |
| Z-2 | Unter dem Fehler gebuchte Tage dürfen nicht unkürzbar werden: die Prüfung „gestrichener Tag ist Arbeitstag“ lässt einen Tag gelten, an dem eine Zeile dieses Antrags steht (nachgestellt: sonst „Der 08.01.2027 ist kein Urlaubstag“). Dazu eine lesende Abfrage „genehmigte Anträge seit 16.11., deren gebuchte Tage von `urlaubstage_person` abweichen“ — dem Betrieb nennen, nichts umschreiben (Altdaten). |
| Z-15 | Die Gegenprobe „nach Z-2 grün“ gilt für den Wächter ohne Datenbank nur mit einem begründeten Eintrag in der Ausnahmeliste („behoben in <Migration>“): die Neudefinition in `20261116030000` steht für immer in den Migrationen. Ohne Eintrag grün wird nur die Tabelle „Funktion → muss enthalten“ in `tests/supabase/schema.test.ts`. In diese Tabelle gehört auch `app.baustelle_abschluss_zaehlen` → `scheine_verrechnet_kern`. |
| A-1 | Die Prüfung „Pauschalbaustelle mit Schlussrechnung meldet 0“ ist ohne Migration grün; die Gegenprobe trägt nur mit Schein und Stunden nach der Rechnung. „Bleibt gleich“ gilt nicht für Regie-Scheine unter Regel 3 — der Fall bekommt einen eigenen Namen. `null` für die Projektleitung fremder Baustellen bei allen vier Schlüsseln; Material nur für `ist_buch_oder_spitze`. |
| P-10 | „Bleibt gleich: Regiebaustelle zählt wie bisher“ ist falsch. Richtig: „eine Regiebaustelle mit wirklich offenem Schein (Material, keine Rechnung) zählt wie bisher“. Alle drei Fälle und die Gegenprobe in die Prüfung. Bewusst sehen: auf einer Pauschalbaustelle warnt der Abschluss danach auch nicht mehr vor einem Schein, der nach der Schlussrechnung unterschrieben wurde. |
| M-1 | Alle vier Funktionen in dieselbe Migration: nur `lager_liste` umgestellt, sähe der Support ein leeres Lager statt eines Fehlers (nachgestellt) — schlechter als heute. Die Prüfung `app.darf(…)` hinter dem Betrieb bleibt stehen. |
| M-2 | Auch `ausgegebenes_material` (`materialOrders.ts:473`) blättern (N-L-1). Beim Zusammenführen über `beleg_id` entdoppeln. |
| M-16 | Der Wächter braucht beim ersten Lauf an die 30 begründete Einträge (36 Aufrufe ohne `.range()`); „rot für zwei“ gilt erst danach, und es sind drei. |
| S-1 | Unvollständig, wie er dasteht: mit `lager_frei` und `lager_knapp` in derselben Migration (N-S-1). `startseite-forderungen`: die Prüfung „ohne Anmeldung nichts“ liefert weiter 401. Nach der Änderung an der Edge Function `node scripts/edge-shared-uebernehmen.mjs`. |
| S-10 | Kriterium des Wächters: mit angelegten Zeilen dasselbe Ergebnis wie der Administrator — „kein 42501“ ließe leere Antworten durch. Rund 100 Einträge, je Funktion gültige Angaben: der Aufwand ist nicht klein. |
| S-13 | `schein_verrechnung` nicht auf `app.verrechnung_betrieb()` (sperrte den Projektleiter aus und ließe „ansehen“ weiter draußen): Betrieb `coalesce(app.arbeitsbetrieb(), app.lesebetrieb(), app.supportbetrieb())`, Rollenprüfung um `app.support_liest(betrieb)` ergänzen. `retoure_rahmen` und `kommissionsartikel_im_lager` gehören zum Schreiben (`app.arbeitsbetrieb()`/`app.support_schreibt`). Keine schreibende Funktion bekommt den Betrieb über `app.supportbetrieb()`. |
| L-1 | Der Wert der Zeilengrenze im gehosteten Projekt ist nur behauptet — einmal ablesen und in `DEPLOYMENT.md` festhalten (N-L-2). `nachkalkulationBuendel.test.ts` liegt unter `tests/supabase/`. |
| L-2 | Der Wächter erfasst die sieben Stellen mit veränderlichem Funktionsnamen (`kern.ts:422`, `plattform.ts:112`, `nachrichten.ts:165`, `inventur.ts:98`, `invoices.ts:807`, `zeitsitzungen.ts:93`, `supabaseSender.ts:227`). `scheine_verrechnet` darf mit Grund in die Ausnahmeliste, `ausgegebenes_material` nicht. |
| N-Z-1 | Entschieden (E-F22): `app.satz_nachziehen` lässt Buchungen abgeschlossener Monate aus (dieselbe Regel wie für das Nacht-Kennzeichen) — mit eigener Prüfung. |
| N-S-1 | In dieselbe Migration wie die vier Listenfunktionen. |
| N-S-2 | Im selben Schritt wie A-1/P-10 beheben, damit `app.baustelle_abschluss_zaehlen` einmal angefasst wird. |
| N-L-1 | Die Funktion sortiert schon eindeutig — die Umstellung kostet keine Migration. |
| N-L-2 | Einmal im Projekt ablesen und in `DEPLOYMENT.md` festhalten. |

Zu S-13 im Einzelnen (Papier 6, berichtigt durch Bericht 6): `retoure_rahmen` und
`kommissionsartikel_im_lager` prüfen `app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb)`;
`anforderung_aus_lager`, `anforderung_zurueckziehen`, `retoure_annehmen` prüfen die Zeile gegen
`coalesce(app.lesebetrieb(), app.arbeitsbetrieb())`. Der Vorschlag der Fassung 1 (alle drei auf
`coalesce(app.betrieb(), app.supportbetrieb())`) bewirkt nichts — der Prüfer hat ihn eingespielt.

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| Z-1 | Papier 1, Befund Z-1 (Aufwand dort: m) | im abgeschlossenen Monat ändert weiterhin niemand Tag, Uhrzeit, Pause, Stand, Baustelle, Kommentar, Nacht/Notdienst; Anlegen und Löschen bleiben gesperrt; ausgeschaltet ändert sich nichts. - Risiko des Umbaus: eine zu weite Ausnahme wäre ein Loch im Abschluss. Deshalb die Ausnahme als feste, kurze Spaltenliste und nicht als … (weiter im Papier) | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| Z-2 | Papier 1, Befund Z-2 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | Personen ohne Verlauf bekommen dieselben Tage wie heute (`app.urlaubstage_person` liefert ohne Verlauf dasselbe, Kommentar `20261116020000:674–677`); schon genehmigte Anträge werden nicht neu gerechnet (Altdaten). |
| Z-15 | Papier 1, Befund Z-15 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | keine Migration wird angefasst. |
| A-1 | Papier 2, Befund A-1 (Aufwand dort: k) | `baustelleAbschliessen.test.ts` + Fall „Pauschalbaustelle mit Schlussrechnung: 0 Scheine, 0 Minuten“ (Gegenprobe: ohne Migration rot), + | Regiebaustelle zählt wie bisher“ und „Pauschale nur mit Anzahlung zählt weiter“. Gleich bleiben muss: Rückgabeform (`AbschlussLage`), `null` statt 0 für Rollen ohne Einblick in Rechnungen, das Anhalten bei kommenden Einsätzen. Risiko des Umbaus: zu großzügig rechnen (eine Regiebaustelle gälte als … (weiter im Papier) |
| P-10 | Papier 3, Befund P-10 (Aufwand dort: k) | `tests/supabase/baustelleAbschliessen…` um drei Fälle erweitert (Pauschale mit Rechnung, Stundenschein im Zeitraum, Ersatzschein → je 0; Gegenprobe: heute je 1). | ein wirklich offener Schein mit Material zählt weiter, die Sicht ohne Leserecht bleibt `null`. |
| M-1 | Papier 5, Befund M-1 (Aufwand dort: k) | je eine neue Prüfung in `lagerListe.test.ts` und `anforderungenLaufend.test.ts` — Support mit Freigabe „ansehen“ bekommt dieselben Zahlen wie die Verwaltung, ohne Freigabe und nach Widerruf einen Fehler. Gegenprobe: ohne die Migration rot (42501). | alle 17 bestehenden Prüfungen beider Dateien, `mandantenTrennung`, und dass ein Betriebskonto nie einen anderen Betrieb erreicht (`app.supportbetrieb()` ist für Betriebskonten leer). Risiko des Umbaus: `lager_liste` ruft `lager_frei` — beide müssen in derselben Migration wechseln, sonst steht für … (weiter im Papier) |
| M-2 | Papier 5, Befund M-2 (Aufwand dort: k) | Datenbankprüfung mit 1.100 Ausgaben über zwei Baustellen — Summe je Baustelle stimmt. Gegenprobe: mit dem heutigen Aufruf fehlen 100 Zeilen (rot). | `materialkosten.test.ts`, `ausgegebenesMaterial.test.ts`, `rechnungMaterialJeAusgabe.test.ts` ohne Änderung. |
| M-16 | Papier 5, Befund M-16 (Aufwand dort: k–m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | nichts am Verhalten; nur Prüfungen. |
| S-1 | Papier 6, Befund S-1 (Aufwand dort: k) | `supportAnsehenListen.test.ts` um die vier Funktionen und `startseiteForderungen.test.ts` um den Einblick erweitern (je: gleiche Zahlen wie der Administrator des Betriebs). Gegenprobe: ohne die Migration bzw. mit der heutigen Function rot. Dazu der Wächter aus S-10. | Ergebnisse für jedes Konto des Betriebs (die bestehenden Prüfungen `baustellenListe`, `lagerListe`, `anforderungenLaufend`, `wartungenFaelligStand` — 34 Fälle — bleiben unverändert grün); ohne Einblick sieht die Plattform weiter nichts; der Monteur sieht in `anforderungen_laufend` weiter nur seine. |
| S-10 | Papier 6, Befund S-10 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| S-13 | Papier 6, Befund S-13 (Aufwand dort: k) | `supportArbeitetMit.test.ts` je Funktion ein Fall mit echter Zeile (Anforderung aus dem Lager ausgeben, Rückgabe annehmen, Lagerführung umstellen), `supportAnsehenListen.test.ts` für `schein_verrechnung`. Gegenprobe: ohne die Migration je rot. Der Wächter aus S-10 hält die Tabelle oben künftig fest (lesende Funktionen); für … (weiter im Papier) | jede Zeile „richtig“ der Tabelle — vor allem, dass der Support weder Zeiten, Urlaube und Krankenstände sieht noch Rechnungen ausstellt (`supportzugang.test.ts`, `supportArbeitetMit.test.ts:178`, `:200`, `mandantenTrennung`); für Konten des Betriebs ändert sich kein Ergebnis. |
| L-1 | Papier 7, Befund L-1 (Aufwand dort: k) | `tests/supabase/ausgegebenesMaterialGesamt.test.ts` um einen Fall mit 1.200 Zeilen über zwei Baustellen erweitern (alle kommen an, Summe je Baustelle stimmt); Gegenprobe: mit dem heutigen Aufruf kommen genau 1.000. | Zeilen, Vorzeichen der Retouren und Rechte (`ausgegebenesMaterialGesamt.test.ts`, `materialKleineLuecken.test.ts`), das Bündeln (`tests/unit/nachkalkulationBuendel.test.ts`) und die Ansicht (`NachkalkulationView.test.tsx`). Risiko des Umbaus: bei wechselnder Reihenfolge zwischen zwei Seiten kämen … (weiter im Papier) |
| L-2 | Papier 7, Befund L-2 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |

**Risiko:** Z-1: eine zu weite Ausnahme wäre ein Loch im Abschluss — deshalb feste, kurze
Spaltenliste und die Prüfung über alle anderen Spalten. S-1/S-13: eine Rollenprüfung, die für
„ansehen“ NULL ergibt, lässt durch — jede Rollenprüfung in den angefassten Funktionen als
`… is not true` (N-S-4).
**Aufwand:** 6–8 Tage (Fassung 1: 3–4; der Prüfer des Plans nennt 4–6, dazu kommen die neuen
Befunde und die größere Fassung von Z-1).

#### Paket 2 — Bau bei jedem PR, ehrliches Leistungsbudget

**Ziel:** Ein Pull Request, der den Bau bricht, wird vor dem Merge rot — nicht erst auf `main`.
**Punkte:** L-4, L-9.
**Voraussetzung:** keine.
**Schritte:** (1) **L-9:** Der Auftrag `test` (`deploy.yml:55–75`) baut bei jedem Pull Request
(`npm run build`), nur bei `pull_request`. (2) **L-4, Schritt 1:** `_warum` in `leistungsbudget.json` auf die
gemessenen Werte bringen und das Datum der Messung nennen (254 von 260 Bausteinen; Rechnungen
131 von 135 KB). Die Grenzen werden nicht angehoben.

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| L-4 | Hier nur Schritt 1 (`_warum` auf die gemessenen Werte). Die Grenzen nicht anheben. Schritt 3 (Messung der Kleinstbausteine) in Paket 29. |
| L-9 | Der Bau im Auftrag `test` nur bei Pull Requests (`if: github.event_name == 'pull_request'`), sonst läuft er auf `main` doppelt. |

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| L-4 | Papier 7, Befund L-4 (Aufwand dort: k/m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | `importierenEinstieg = 0`, der Start ohne Netz (`startBausteineFehlen`), alle Prüfungen in `leistungswaechter.test.ts`. |
| L-9 | Papier 7, Befund L-9 (Aufwand dort: k) | `auslieferungsKette.test.ts` „der Prüfauftrag baut“ (Gegenprobe ohne den Schritt rot). | der Deploy-Auftrag baut weiter selbst mit den Geheimnissen; die Reihenfolge Schema → Functions → App. |

**Prüfungen mit Gegenprobe:** Wächter über die Workflow-Datei „der Prüfauftrag baut“ (ohne den
Schritt rot). **Bleibt gleich:** `importierenEinstieg = 0`, der Start ohne Netz, alle Prüfungen
in `leistungswaechter.test.ts`; die Kette Schema → Functions → App.
**Risiko:** gering. **Aufwand:** 1 Tag.

#### Paket 3 — Geld: falsche Vorwahl, stehen gebliebene Werte, Wettläufe

**Ziel:** Keine falsche Vorwahl im Abgleich, keine stehen gebliebenen Werte in der Vorschau, keine
Rechnung über einen veralteten Stand, keine verlassene Annahme.
**Punkte:** A-3, A-4, A-14, G-1, G-2, G-5, G-6, G-14, G-16, D3-6, N-G-1, N-G-2, N-G-4, N-G-5.
**Voraussetzung:** Paket 1 (der Wächter Textersatz; die geltende Fassung von `rechnung_anlegen`
ist die Definition aus `20261116050400` plus der Textersatz aus `20261116060000:280` — wer aus
der Datei abschreibt, verliert die Belegart `ruest_position` und `material_je_ausgabe`), Paket 2.
**Schritte:**

1. **G-1:** Abgleich nach der Hauptregel der Vorgabe; neue Fälle in
   `kontoauszugAbgleich.test.ts`.
2. **G-2, N-G-5:** beim Wechsel der Baustelle und beim Verwerfen die abgeleiteten Werte aus der
   Vorgabe neu setzen (Rabatt, Bauleistung, Rücklass, Steuerbefreiung, Art, „Leistungsnachweis
   anhängen“).
3. **G-5, G-6, G-16, N-G-1, N-G-4 in einer Migration an `rechnung_anlegen`** (Ausgangstext aus
   `\sf`): Stand der Zeitbuchungen gegen die Vorschau; keine zweite Pauschale; Nachrechnen der
   Summen; die frei gewählte Nummer beim direkten Aufruf; die Eingabe von Menge und Preis auf die
   Stellen der Spalten begrenzen. **Zuerst messen**, ob jede Belegart die Nachrechnung besteht.
4. **G-14:** Steuersatz beim Abzug einer Anzahlung — an beiden Stellen des Auslösers und in der App.
5. **N-G-2:** die Kundenkennung einer Rechnung gehört zum Betrieb.
6. **D3-6:** Vorbelegung des Zahlungsdialogs über `preisAlsText(cent(vorschlag))`.
7. **A-3, A-14:** Kundenvergleich im Kern der Annahme; „Angenommen“ lässt sich nur über die
   Rücknahme verlassen; die Baustelle eines angenommenen Angebots lässt sich nicht umhängen.
8. **A-4:** zwei Abfragen statt einer (angenommene vollständig; die Akte geordnet).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| A-3 | Der Abgleich gehört an die Auswahl und an den Kundenwechsel (`BaustellenSuche.tsx:82` sucht über den ganzen Betrieb). Im Kern steht der Vergleich nach dem Zweig „schon angenommen → dieselbe Baustelle zurückgeben“, sonst scheitert der wiederholte Aufruf nach verlorener Antwort bei Altangeboten. Der Vergleich wandert in `app.angebot_annehmen_kern`, dazu `angebot_link_zustand` und `angebot_link_erzeugen`. Wird ein Link gegenstandslos, steht der Grund in der Akte. |
| A-4 | Die Akte braucht für `PauschalHinweis` und Hauptangebot/Herkunft die vollständige Liste der angenommenen — bei „jüngste zuerst, seitenweise“ fiele das Hauptangebot zuerst heraus. Zwei Abfragen wie im Papier; `listQuotesForProject` ist eine Tabellenabfrage, `abfragen` blättert ohne `grenze` selbst (kein `rpcAlle`). Die Gegenprobe ist verlässlich baubar (angenommenes Angebot mit der größten Kennung). |
| A-14 | „Bleibt gleich“: Papierkorb „Wiederherstellen“, „Ablehnung zurücknehmen“, das Ersetzen der übrigen Fassungen durch den Kern, `angebot_annehmen_mit_ziel` setzt `project_number` weiter. `angebot_speichern` weist das Umhängen eines angenommenen Angebots mit Meldung ab — still übergehen wäre ein stiller Fehlschlag. |
| G-1 | Hauptregel: jeder Treffer ohne Buchstaben-Vorsatz ist nur vorgewählt, wenn der Betrag passt, sonst höchstens „bitte prüfen“ — auch auf Stufe 2 eines Betriebs ohne Vorsatz. Die Datumsregel gilt nur für die zusammenhängende achtstellige Folge (ohne Trenner). Der Zweig „Mahnspesen zu bezahlter Rechnung“ zählt bei einem solchen Treffer nicht als „Betrag passt“. Die 32 bestehenden Fälle genügen nicht als „bleibt gleich“ (keiner prüft einen Abgleich ohne Vorsatz). |
| G-2 | `steuerbefreiung` steht nicht in `nachDemAusstellen`: zurücksetzen auf `company?.steuerbefreiungVorgabe ?? ''` (nicht leer). `appendDetail` ebenso zurücksetzen (N-G-5). `setStundenStand(n+1)` nicht mitnehmen. Benennen: die Art springt beim Baustellenwechsel auf „Einzelrechnung“. Die erste Wahl der Baustelle setzt weiter nichts zurück. |
| G-5 | Der Schlüssel `time_entry_minuten` in `p_belege` bricht gegen die heutige Funktion („cannot extract elements from an object“): trifft eine neue App auf die alte Datenbank, lässt sich keine Rechnung mit Stunden ausstellen. Die Minuten in `p_kopf` tragen oder die Datenbank zwingend vor der App ausliefern und das prüfen. Einfacher: Vergleich über `updated_at` der Buchung (weist auch bei einer Notizänderung ab — kostet nur ein neues Zusammenstellen). |
| G-6 | Der Auslöser greift auch beim Aufheben eines Stornos (`rechnung_storno_aufheben`), wie `app.vorrechnungen_pruefen`. Er läuft nach `invoices_baustelle` (Auslöser laufen nach Namen) oder sucht selbst über beide Schreibweisen der Nummer. Baustelle ohne Abrechnungsart (Altdaten) gilt als Regie. „Stornieren und neu ausstellen“ einer Pauschale bleibt möglich. |
| G-14 | Zwei Stellen in `app.vorrechnungen_pruefen` und `abziehbar`/`pflichtAbzug` in der App tragen dieselbe Regel — sonst verlangt die eine Stelle den Abzug und die andere verbietet ihn. `invoices.vat_rate` darf leer sein: leer wie in der App behandeln (`alt.vatRate ?? Satz des Betriebs`), eigene Prüfung. |
| G-16 | Wogegen geprüft werden darf: (1) bei Abzug von Anzahlungen Steuer und Brutto nur gegen `gesamt_*`, nie gegen `total_*`; (2) aus den übergebenen Werten rechnen, nicht aus den gespeicherten (gerundeten) Spalten; (3) negative Zeilen zulassen; (4) leeres `subtotal_netto` bestimmen (46 Prüfdateien legen Rechnungen an). Als Prüfung in der Funktion, nicht als Auslöser (Rückspielen einer Sicherung bleibt unberührt). Zuerst messen — über die Datenbankprüfungen, nicht über die Belegreferenz (sie ruft `rechnung_anlegen` nicht). |
| D3-6 | `preisAlsText(cent(vorschlag))` → „22104,60“, ohne Tausendertrenner (aus „22.104,60“ wird beim Kürzen „22.104“ → „nicht eindeutig“; `zahl.ts:98`). „22.104,60“ erzeugt kein Formatierer des Repos. Drei Prüfungen halten heute „100“ und „200“ fest (`InvoicesView.test.tsx:5538, 5037, 6526`) — bewusst ändern, für Eingang und Rückzahlung gleich. |
| N-G-1 | Zur selben Härtung wie G-16. |
| N-G-2 | Folge wäre ein Verweis über die Betriebsgrenze. Passt zu Verdacht A-1. |
| N-G-4 | Die Eingabe auf die Stellen der Spalten begrenzen. Folge für G-16: aus den übergebenen Werten prüfen. |
| N-G-5 | Mit G-2. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| A-3 | Papier 2, Befund A-3 (Aufwand dort: k) | `nachtrag.test.ts` + „fremder Kunde über Link und über `angebot_annehmen`: abgewiesen, Budget unverändert“ (Gegenprobe ohne Migration rot); `QuotesView.test.tsx` „Kundenwechsel löst den Nachtrag“ | derselbe Kunde hängt über Link und alten Weg an“ (bestehender Test `:78`). Gleich bleiben muss: Baustelle oder Angebot ohne Kundenkennung (Altdaten) hängen weiter an; Signaturen und Rechte der Funktionen. |
| A-4 | Papier 2, Befund A-4 (Aufwand dort: k) | neuer Datenbanktest „25 Angebote, das angenommene ist das älteste → Pauschale enthält es“ (Gegenprobe: mit `grenze: 20` ohne Sortierung nicht verlässlich — deshalb zusätzlich Unit-Test an der Datenschicht „kein `limit` in der Abfrage der angenommenen“, wie `abfragegrenzen.test.ts`) | ein Angebot + ein Nachtrag ergeben dieselben Positionen und Summen wie heute“ (`pauschale.test.ts`). Gleich bleiben muss: Reihenfolge Hauptangebot vor Nachträgen in der Rechnung, Rundung über `cent()`. |
| A-14 | Papier 2, Befund A-14 (Aufwand dort: k) | `angebotVersandPruefen.test.ts` + zwei Fälle (Gegenprobe rot) | Rücknahme, Dienstschlüssel (Rücklauf einer Sicherung), `baustelle_umnummern` zieht die Nummer weiter nach“. |
| G-1 | Papier 4, Befund G-1 (Aufwand dort: k) | neuer Fall in `tests/unit/kontoauszugAbgleich.test.ts` mit genau dem Beispiel oben (ohne Änderung `passt` auf die falsche Rechnung, mit Änderung `pruefen` auf Maier). | Treffer mit Vorsatz (Stufe 2) und Treffer ohne Vorsatz mit passendem Betrag — die 32 bestehenden Fälle halten das fest; dazu ein eigener Fall „2026-1015 mit Trenner und passendem Betrag bleibt vorgewählt“. |
| G-2 | Papier 4, Befund G-2 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | Neu zusammenstellen derselben Baustelle behält Rabatt und Steuersatz (`vorschauUebernehmen`, Prüflauf P2-01) — eigener Test „bleibt gleich“. |
| G-5 | Papier 4, Befund G-5 (Aufwand dort: m) | Datenbankprüfung mit geänderter Buchung (vorher angelegt, nachher abgewiesen), Gegenstück „unverändert geht durch“. | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| G-6 | Papier 4, Befund G-6 (Aufwand dort: k) | Datenbankprüfung mit zwei Aufrufen nacheinander (vorher zwei Rechnungen). | Regiebaustellen; eine Baustelle, die nach der Pauschale auf „Regie“ gestellt wurde (der Weg, den die Meldung nennt); der Dienstschlüssel. |
| G-14 | Papier 4, Befund G-14 (Aufwand dort: k) | `vorrechnungen.test.ts` und Datenbankprüfung (vorher angelegt, nachher abgewiesen), Gegenstück mit gleichem Satz. | alle Abzüge mit gleichem Satz. |
| G-16 | Papier 4, Befund G-16 (Aufwand dort: k–m) | Datenbankprüfung mit je einer verfälschten Größe (vorher angelegt, nachher abgewiesen) und ein Lauf über die Grenzfälle aus `geldRundung` (Halbcent), der zeigt, dass richtige Rechnungen der App durchgehen. | jede Rechnung, die die heutige App stellt; der Dienstschlüssel (Rücklauf einer Sicherung) ist ausgenommen. |

**Weitere Prüfungen aus der Gegenprüfung:** G-1: Betrieb ohne Vorsatz mit „2026-1112“ und
passendem Betrag bleibt vorgewählt; Betrieb mit Vorsatz mit „2026-1015“ und passendem Betrag
bleibt vorgewählt; Gegenproben mit „AN-2026-1112“ und Teilbetrag, mit „20261112-004711“, mit
40 € Mahnkosten auf eine fremde bezahlte Rechnung. G-5/G-6: eine unveränderte Vorschau wird nie
abgewiesen; eine ältere App-Fassung stellt weiter aus oder wird verständlich abgewiesen. A-3:
`tests/supabase/nachtrag.test.ts:78–96` und der Journal-Eintrag „Kunde über Link“ bleiben. D3-6:
kein Tausendertrenner im Feld; das Feld liest weiter Komma und Punkt.
**Bleibt gleich:** jede Rechnung, die die heutige App stellt; `InvoicesView.test.tsx` (die erste
Wahl der Baustelle setzt nichts zurück, Z. 6279); die Belegreferenz Byte für Byte.
**Risiko:** G-16 kann richtige Rechnungen abweisen, wenn die vier Festlegungen der Vorgabe fehlen.
G-1: wer bei einem Betrieb mit Vorsatz „20261015“ ohne Trenner schreibt, fällt von „vorgewählt“
auf „bitte prüfen“ (gewollt, benannt).
**Aufwand:** 6–8 Tage (Fassung 1: 4–5, laut Prüfer knapp; A-14 und vier neue Befunde kommen dazu).

#### Paket 4 — Kassakonto im Zahlungsstapel (wartet auf die Kanzlei)

**Ziel:** Bar- und Kartenzahlungen landen im BMD-Zahlungsstapel nicht mehr auf dem Bankkonto.
**Punkte:** G-4.
**Voraussetzung:** Auskunft der Kanzlei (K-1) zu G-4: Kontonummer und Buchungssatz für Bar, Karte
und „Sonstiges“. **Gilt nicht als entschieden; hält die übrigen Pakete der Stufe A nicht auf.**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| G-4 | Auch die Zahlungsart „Sonstiges“ (Gegenverrechnung, Scheck) geht heute auf die Bank. Für „Karte“ vor dem Bau festlegen, was ohne eigenes Konto gilt. „Bis zum Eintragen des Kassakontos keine Datei“ gehört ins Handbuch. Hängt an K-1 und hält Stufe A nicht auf. |

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| G-4 | Papier 4, Befund G-4 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | Überweisung, Skonto, Mahnkosten, Umbuchung — die bestehenden Fälle. |

**Risiko:** bis zum Eintragen des Kassakontos entsteht keine Datei — ins Handbuch.
**Aufwand:** 1–2 Tage nach der Auskunft.

#### Paket 5 — Ohne Netz und stille Fehlschläge

**Ziel:** Nichts, was jemand eingegeben hat, verschwindet ohne Spur; keine falsche Auskunft bei
einem Fehler.
**Punkte:** Z-4, P-1, P-2, P-5, S-2, S-5, S-6, N-Z-2, N-P-1, N-P-2, N-P-3, N-P-7. **Dazu Teile von:** Z-5 (nur der falsche Satz im Dialog „das alte Zeitkonto bleibt abgeschlossen“).
**Voraussetzung:** Paket 1. Das erneute Senden eines gesicherten Scheins mit den
vorhandenen Unterschriften wartet auf die Kanzlei (K-7) und gilt nicht als entschieden; bis dahin
wird der gesicherte Schein nur aufbewahrt, angezeigt und als PDF ausgegeben.
**Schritte:**

1. **P-1:** aufgegebener Schein wird zum Entwurf auf dem Gerät (IndexedDB wegen der
   Unterschriftsbilder) — erst sichern, dann räumen; Abschnitt „Nicht angekommen“ in der
   Scheinliste mit Grund und den Handgriffen; Hilfsfunktion „gibt es diese Kundenkennung im
   Betrieb“ mit Eigentümerrechten.
2. **N-P-1, N-P-2, N-P-3, N-P-7:** leere 404-Antwort gilt nicht als gesendet; `aal1` und
   Ähnliches bleiben im Fach liegen; `schein_speichern` meldet null getroffene Zeilen.
3. **S-5:** Anforderung und Nachricht nach dem Vorschlag des Papiers.
4. **P-5:** „Abwesenheiten nicht geladen“ mit „Erneut versuchen“ statt „niemand fehlt“.
5. **P-2:** eigene Abwesenheiten unabhängig von „Wochenplan für alle“ und über den ganzen
   gezeigten Zeitraum.
6. **Z-4, N-Z-2:** „Ende ändern“ prüft die 14-Tage-Grenze und meldet dem Büro; Sperre je Person
   gegen zwei gleichzeitige Krankmeldungen.
7. **S-2:** Passwortwechsel räumt die Push-Anmeldungen der anderen Geräte, nicht die des eigenen.
8. **S-6:** beendete Sitzung wird sofort und mit dem richtigen Grund gemeldet.
9. **Z-5 (Teil):** der falsche Satz im Dialog des Wiedereintritts wird berichtigt.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| Z-4 | Der neue Push braucht `WHEN (old.von is distinct from new.von or old.bis is distinct from new.bis)`, weil `krankmeldung_speichern` bei jedem Speichern `von` und `bis` schreibt — sonst meldet jede Notizänderung. Die Meldung sagt, dass nach 14 Tagen ohne Verlängerung nur noch das Büro verlängert. Das Büro ändert weiter ohne Grenze. |
| P-1 | So nicht bauen (Bericht 3, 3.1–3.4): (1) Die Prüfung „Kunde unbekannt“ braucht eine Hilfsfunktion mit Eigentümerrechten (`security definer`, `set search_path = ''`), weil der Monteur die Kundentabelle nicht liest — sonst setzte sie bei jedem Schein eines Monteurs den Kunden der Baustelle ein; sie gilt für Anlegen und Ändern. (2) Erst sichern, dann räumen: mit IndexedDB wird die Reihenfolge in `aufgeben`/`melden` umgedreht; scheitert das Sichern, bleibt der Vorgang im Fach. (3) Ob eine erneut gesendete Unterschrift als Beleg trägt, wartet auf die Kanzlei (K-7): bis dahin wird der gesicherte Schein nur aufbewahrt, angezeigt und als PDF ausgegeben. Vorschlag des Prüfers für danach: unverändert erneut senden ist erlaubt; wird etwas geändert, verfallen die Unterschriften. (4) Verworfener Entwurf: „Entwurf wieder aufnehmen“ unter der alten Kennung (Fotos liegen unter ihr). (5) Für zweiten Ersatzschein, Rollenwechsel und deaktiviertes Konto fehlt ein Weg — wenigstens ansehen und als PDF. (6) Die Sicherung kommt auch mit einem einzelnen `schein_unterschreiben` ohne Kopf zurecht (`begrenzt`). |
| P-2 | Schritt 3 des Papiers (Fehler statt leerer Menge über 62 Tage) ändert bewusst `tests/supabase/wochenplanFuerAlle.test.ts:122–126` — steht im Schritt, nicht unter „bleibt gleich“; `wochenplan_abwesend` ist `language sql`, ein Fehler braucht plpgsql. Zwei weitere Aufrufer in der Datenbank: `einsatz_umplanen`, `einsatz_folgetage`. Neue Funktion: `app.betriebsmitglied(app.betrieb())` beibehalten, Eintrag in `netzFrist.ts` und `mandantenTrennung.test.ts`. |
| P-5 | Bei „Mein Einsatzplan“ nur einen Hinweis ergänzen; die Einsätze bleiben sichtbar. |
| S-2 | Eine eigene Funktion, die die Marke dieses Geräts behält — `app.push_anmeldungen_entfernen` leert alle Marken des Kontos. „Bleibt gleich“: `getPushState` dieses Geräts bleibt „bereit“. |
| S-5 | Vorschlag des Papiers: Meldung mit Inhalt und Grund, „Erneut anfordern“ belegt den Warenkorb vor; die Nachricht kommt zurück ins Eingabefeld — kein Entwurf auf dem Gerät wie bei P-1. Die bestehenden Fälle stehen in `tests/components/PremiumRueckmeldung.test.tsx`. |
| S-6 | Abgemeldet wird nur, wenn `sitzungAnderswoBeendet` es bestätigt — 42501 ist auch jede fachliche Abweisung. Vorschlag des Papiers: Minutentakt für alle und Nachsehen nach abgewiesenem Aufruf, kein „Hörer am Anmeldezustand“. |
| N-Z-2 | Sperre je Person (wie `pg_advisory_xact_lock` in `zeit_korrektur_beantragen`) oder Ausschlussbedingung. |
| N-P-1 | Ein Aufruf aus `AUFRUFE_OHNE_EMPFANG` braucht eine Antwort mit Inhalt oder Stand 2xx vom Server selbst. |
| N-P-2 | Mit P-1 ist der Schaden begrenzt. Steht in der Sperrseite „network“, „fetch“ oder „failed to“, hält `istNetzfehler` sie für fehlendes Netz. |
| N-P-3 | Für aal1 „liegen lassen“, nicht „aufgeben und sichern“ — der Vorgang geht eine Minute später durch. Gilt ebenso für Zeitbuchung, Anforderung und Nachricht. Vor dem Bau im Stack nachstellen. |
| N-P-7 | Vom Prüfer als Verdacht für dieses Paket vermerkt — vor dem Bau über die App nachstellen. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| Z-4 | Papier 1, Befund Z-4 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| P-1 | Papier 3, Befund P-1 (Aufwand dort: g) | `tests/unit/ausgangsfachScheinAufgegeben.test.ts` (Fach mit `schein_speichern` + `schein_unterschreiben`, Sender lehnt ab → Entwurf liegt mit beiden Unterschriften; Gegenprobe: ohne die Sicherung ist nichts da — rot), Komponentenprüfung der Liste, Datenbankprüfung zu b) (zusammenführen, dann speichern mit alter Kennung → … (weiter im Papier) | ein anderswo UNTERSCHRIEBENER Schein wird nicht überschrieben (Grenze E49 bleibt, nur geht die Eingabe nicht mehr verloren); die Reihenfolge im Fach; die Zeitbuchung (bestehende Prüfungen zu Z4). Festgehalten durch die vorhandenen Ausgangsfach-Prüfungen und `scheinErsatz.test.ts`. |
| P-2 | Papier 3, Befund P-2 (Aufwand dort: k) | `tests/supabase/meineAbwesenheit.test.ts` (Monteur, Schalter aus, Urlaub in 90 Tagen → eine Zeile; fremde Person → keine; Gegenprobe: `wochenplan_abwesend` liefert in beiden Fällen nichts). Komponentenprüfung „Einsatz in 70 Tagen, Urlaub morgen → morgen ausgeblendet“ mit einer Attrappe, die sich wie die Datenbank verhält. | was Kollegen voneinander sehen (`wochenplanFuerAlle.test.ts`, `abwesenheiten.test.ts`), der Grund einer fremden Krankmeldung bleibt dem Büro. |
| P-5 | Papier 3, Befund P-5 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| S-2 | Papier 6, Befund S-2 (Aufwand dort: k) | Datenbank (zwei Marken, Aufruf mit einer → eine bleibt; fremdes Konto unberührt; ohne Anmeldung abgewiesen), Komponente `PasswortAendern` (ruft nach dem Wechsel). Gegenprobe: ohne den Aufruf bleiben beide Marken. | dieses Gerät bekommt weiter Meldungen (`getPushState` bleibt „bereit“); „Auf allen Geräten abmelden“, Deaktivieren, Startpasswort unverändert (`pushAnmeldungenAbraeumen.test.ts`, `abmeldenGeraete`). |
| S-5 | Papier 6, Befund S-5 (Aufwand dort: k) | `VerloreneBuchung.test.tsx` je Tabelle (Text enthält Artikel und Grund; Knopf belegt den Warenkorb vor). Gegenprobe: mit dem heutigen Zweig fehlen beide. | Zeitbuchungen (Z4), Reihenfolge und Wiederholen im Fach (`ausgangsfach*.test.ts`), keine Vormerkung geht mit fremder Sitzung hinaus. |
| S-6 | Papier 6, Befund S-6 (Aufwand dort: k) | `AuthAnderswoAbgemeldet.test.tsx` erweitern (Sitzung endet bei sichtbarem Fenster → spätestens nach einer Minute Anmeldemaske; nach abgewiesenem Aufruf sofort). Gegenprobe: heute bleibt die Ansicht stehen. | ohne Netz bleibt man angemeldet (kein Abmelden auf Verdacht — `sitzungAnderswoBeendet` unterscheidet das schon); K6 unverändert. |

**Bleibt gleich (aus Bericht 3 ergänzt):** `tests/supabase/scheinOhneEmpfang.test.ts:172–199`
(nach der Ablehnung `{gesendet 0, abgelehnt 1, offen 0}` und ein unveränderter Schein auf dem
Server), `tests/unit/zeitEntwuerfe.test.ts`, `ausgangsfach*.test.ts`,
`robustesAusgangsfach.test.ts`, `scheinVorgemerkt.test.ts`; ein Schein eines Monteurs mit
bestehendem Kunden behält genau diese Kennung; die Reihenfolge im Ausgangsfach; Entwürfe eines
Kontos sieht kein anderes. Bewusst geändert wird `tests/supabase/wochenplanFuerAlle.test.ts:122–126`
(P-2).
**Risiko:** P-1 legt Unterschriften und Kundendaten länger auf dem Gerät ab — dieselbe Schutzregel
wie für das Ausgangsfach (je Konto, beim Abmelden mit Rückfrage); die Frage an die Kanzlei (K-6)
betrifft auch dieses Paket.
**Aufwand:** 6–8 Tage (Fassung 1: 4–5; P-1 ist laut Prüfer „mittel bis groß“).

#### Paket 6 — Material: der Bestand stimmt

**Ziel:** Einheit, Bestand und Zusage eines Artikels widersprechen einander nicht.
**Punkte:** M-3, M-4, M-8, M-10, M-11, M-12, M-13, M-14, M-15, N-M-1, N-M-2.
**Voraussetzung:** Paket 1. Reihenfolge im Paket: M-11 vor M-8.
**Schritte:** M-4 und N-M-1 (ein Posten mit Katalogartikel trägt dessen Einheit; „Geliefert“ nimmt
die Menge in der Einheit des Artikels); M-10 (Einheit freier Zeilen geht beim Teilen und auf die
Bestellung mit); M-11 (Kommissionsware zählt nicht als Zusage); M-14 (verbuchte Anforderung nicht
erneut bestellbar); M-3 (Einheit ändern); M-13 („Reserviert“ zählt Artikel); M-12 (Protokoll
blättert, CSV); M-15 (Einstellung je Betrieb „Ohne Mindestmenge knapp ab … frei“, Vorgabe 5, mit eigenem Wert
„aus“ statt 0); M-8
(Wareneingang findet jeden Katalogartikel, auch über Großhändlernummer und EAN); N-M-2.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| M-3 | (1) Lässt der Import die Einheit stehen, hält er auch den Einkaufspreis dieser Zeile zurück — sonst steht der Preis je Meter an einem Artikel, der in Stangen zählt. (2) Auslöser und Import kommen in einer Migration (sonst bricht der Auslöser den ganzen Block ab). (3) Entschieden (E-F15, Rat des Prüfers): von Hand eine Rückfrage mit den Zahlen; harte Abweisung nur für den stillen Weg (Import, alte App). |
| M-4 | Abweisen nur, wenn sich `einheit` oder `material_id` wirklich ändert (Vergleich alt/neu); „Geliefert“ und Teillieferung von Altposten bleiben möglich und fragen die Menge in der Einheit des Artikels (auch in `einkauf_geliefert`, nicht nur im Dialog); der freie Posten mit Katalognamen wird mitbehandelt (N-M-1). |
| M-8 | Ausgelaufene Lagerartikel bleiben wählbar (Restlieferung einer alten Bestellung); ausgenommen werden nur ausgelaufene Artikel, die nicht im Lager geführt sind. M-11 vor oder mit M-8. |
| M-11 | Die Bedingung steht in fünf Funktionen; ändern in vier (`lager_frei`, `app.lager_zugesagt`, `app.bestellvorschlag_stand`, `app.deckung_frei_vor`), nicht in `materialdeckung` (dort ist abholbereite Kommissionsware zu Recht „bereit“). |
| M-12 | Auch die CSV-Ausgabe des Papiers. |
| M-13 | Der neue Filter „reserviert“ braucht die Erweiterung der erlaubten Werte in `lager_liste`. Die Kennzahl ändert ihre Bedeutung — Handbuch. |
| M-14 | Zeilen, die heute schon so hängen: die Anzeige (`aufEinkaufsliste(o)`, `einkauf.ts:85–89`) lässt verbuchte Zeilen ebenfalls aus. |
| M-15 | „0 = nur Artikel mit Mindestmenge warnen“ geht mit der heutigen Regel nicht — eigener Wert „aus“. Die Konstante steht an elf Stellen in fünf Dateien. |
| N-M-1 | Mit M-4 — sonst bleibt der Fehler über den Umweg. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| M-3 | Papier 5, Befund M-3 (Aufwand dort: m) | Datenbankprüfung „Einheit mit Bestand abgewiesen“, „Import lässt Einheit stehen und meldet“; Gegenprobe: ohne Auslöser grün durchlaufender Wechsel (rot). | Artikel ohne Bestand und Bezug ändern die Einheit wie heute; neue Artikel bekommen ihre Einheit aus der Datei; die Normalisierung („stk“ → „Stk“) geht weiter durch. |
| M-4 | Papier 5, Befund M-4 (Aufwand dort: k) | Datenbankprüfung „Posten übernimmt Einheit des Artikels“, Komponentenprüfung für das gesperrte Feld; Gegenprobe: heutiger Stand speichert „Pkg“ (rot). | freie Posten ohne Katalogartikel behalten ihre getippte Einheit; `einkauf.test.ts`, `Einkaufsliste.test.tsx`. |
| M-8 | Papier 5, Befund M-8 (Aufwand dort: k) | `StockView.test.tsx` (Wahl findet Katalogartikel und über Großhändlernummer), Datenbankprüfung „Eingang auf Katalogartikel führt ihn im Lager“; Gegenprobe: heutiger Stand zeigt „Kein Lagerartikel“ (rot). | die Zahlen der Lagerliste; Inventur und Umlagern nur für Lagerartikel. |
| M-10 | Papier 5, Befund M-10 (Aufwand dort: k) | `teilmengen.test.ts` (+1: freie Zeile mit Einheit, beide Teile tragen sie), `einkauf.test.ts` (+1); Gegenprobe: heutiger Stand rot. | Katalogartikel nehmen weiter die Einheit des Artikels. |
| M-11 | Papier 5, Befund M-11 (Aufwand dort: k) | `lagerfuehrungAmArtikel.test.ts` (+1); Gegenprobe: heutiger Stand frei 5 (rot). | eine in den Bestand gebuchte Lieferung reserviert weiter bis zur Abholung (`eingeladenReserviertNicht.test.ts`, `lagerListe.test.ts`). |
| M-12 | Papier 5, Befund M-12 (Aufwand dort: k) | Komponentenprüfung mit 450 Bewegungen; Gegenprobe: heute enden sie bei 200 (rot). | die ersten Zeilen und ihre Reihenfolge. |
| M-13 | Papier 5, Befund M-13 (Aufwand dort: k) | `lagerListe.test.ts` (+1), `StockView.test.tsx`; Gegenprobe rot. | Im Lager“, „Knapp“, „fehlt“. |
| M-14 | Papier 5, Befund M-14 (Aufwand dort: k) | `AdminOrdersView.test.tsx` und eine Datenbankprüfung; Gegenprobe rot. | Zurücksetzen selbst und „Abgeholt“ danach ohne zweiten Abzug. |
| M-15 | Papier 5, Befund M-15 (Aufwand dort: k) | `lagerKnapp.test.ts`, `lagerListe.test.ts` mit anderer Grenze; Gegenprobe rot. | mit Vorgabe 5 jede heutige Zahl. |

**Bleibt gleich (aus Bericht 5 ergänzt):** `lagerListe.test.ts`, `einkauf.test.ts`,
`Einkaufsliste.test.tsx`, `teilmengen.test.ts`, `eingeladenReserviertNicht.test.ts`,
`lagerfuehrungAmArtikel.test.ts`, `bestellungStornoTeillieferung.test.ts`,
`wareneingangBestellung.test.ts`, `AdminOrdersView.test.tsx`, `StockView.test.tsx`; der
Wareneingang gegen einen Posten, `einkauf_teillieferung`, `einkauf_stornieren`, Bestellvorschläge
übernehmen, Inventur; ein Importlauf mit abweichender Einheit läuft durch.
**Risiko:** M-3 und M-4 nehmen in der Fassung des Papiers bzw. der Fassung 1 je eine heutige
Möglichkeit weg — gebaut wird die Fassung der Vorgabe.
**Aufwand:** 5–7 Tage (Fassung 1: 4–5, laut Prüfer knapp).

### Vor Stufe B

#### Paket 7 — Die Fenster der Rechnungsansicht verhaltensgleich herauslösen

**Ziel:** `InvoicesView` (6.574 Zeilen in einer Komponente) wird entlang vorhandener Nähte kleiner,
bevor Stufe B und C die Ansicht anfassen — ohne dass sich ein Verhalten ändert.
**Punkte:** L-12.
**Voraussetzung:** Pakete 2 und 3. Bis zum Abschluss kein zweiter offener PR an der Datei.
**Schritte (L-12, erster Teil):** die vier schon abgegrenzten Fenster — Mahnlauf, Zahlung, Export/E-Rechnung,
Stornieren — je in eine eigene Datei, **ein Fenster je Pull Request**, fest eingebunden (kein
Nachladen). Kein Neuschreiben; „Liste“ und „Erstellen“ bleiben, wo sie sind.

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| L-12 | Kein Neuschreiben: die vier schon abgegrenzten Fenster (Mahnlauf, Zahlung, Export/E-Rechnung, Stornieren), ein Fenster je Pull Request. Zuerst nur in eigene Dateien ziehen (fest eingebunden); das Nachladen ist ein eigener Schritt (Paket 29) — jedes nachgeladene Fenster ist ein Baustein mehr (vier brächten 258 von 260). |

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| L-12 | Papier 7, Befund L-12 (Aufwand dort: g) | `tests/components/InvoicesView.test.tsx` (6.692 Zeilen) bleibt unverändert und grün — das ist die Aussage „es bleibt gleich“; dazu sinkt die Messung des Wächters für die Ansicht (Gegenprobe: die Zahl vor und nach dem Schnitt im Commit nennen). Ein Fenster je Pull Request. | im Papier nicht eigens benannt — vor dem Bau festzulegen |

**Prüfungen mit Gegenprobe:** `InvoicesView.test.tsx` (6.692 Zeilen, 371 Fälle) läuft je PR
**unverändert** grün; `rechnungStellen.spec.ts`, `eRechnung.spec.ts`, `bewegungen.spec.ts`; die
Belegreferenz Byte für Byte; der Bau aus Paket 2 (Zahl der Bausteine bleibt 254).
**Bleibt gleich:** jedes Verhalten. **Risiko:** die Ansicht mit dem meisten Geld — deshalb je
Fenster ein PR. **Aufwand:** 4–6 Tage.


### Stufe B — Werkzeuge, Regeln, Bausteine, Wächter

In dieser Stufe wird keine Seite umgebaut. Jeder Wächter kommt mit einer Ausnahmeliste der
heutigen Fundstellen; die Seitenpakete der Stufe C streichen ihre Einträge.

#### Paket 8 — Vorschau zeigt jeden Bildschirm; Bildwerkzeug, Messskripte, Inventar

**Ziel:** Die Absicherung aus Abschnitt 2 gibt es wirklich: jede Seite lässt sich im Bild prüfen,
die Messungen liegen im Repo, das Funktionsinventar kennt den heutigen Stand.
**Punkte:** V-16, D1-A18, D3-C0, N-D-2.
**Voraussetzung:** keine.
**Schritte:**

1. **Attrappen** (`tools/vorschau/fest/`): die acht Formen für „Rechnung stellen“, Kontoauszug und
   Einkaufsliste (D3-C0); dazu Auftragseingang, Liegenschaftsakte, Zählliste, zweiter Faktor,
   Anmeldung, „Mein Fahrzeug“, Annahmeseite in allen Ständen, Benutzerakte einer fremden Person,
   Monatsabschluss; ein leerer Bestand (`?bestand=leer`); die falschen Attrappen aus N-D-2 richten (darunter
   `mitarbeiter` statt `mitarbeiterName`, D1-A18).
2. **Bildwerkzeug** (Regel 5): Routenliste aus `navigation.ts`; je Seite Hilfe, ⋯, Hauptaktion,
   erste Zeile und deren ⋯; hell und dunkel; 375, 390, 834, 1440 px; Ablage der Vorher-Bilder;
   Vorher und Nachher nebeneinander.
3. **Messskripte ins Repo** (`tools/vorschau/`): Flucht, Tastfläche, Punkte je sichtbarer
   Textzeile, Wörter über dem Falz — berichtigt nach Bericht 8 (ein umgebendes `label` und das
   Klick-Ziel der Elternzeile zählen zur Tastfläche; Abgeschnittenes zählt nicht als sichtbar; die
   Messung wartet auf Ruhe und kürzt keine Übergänge).
4. **V-16:** die fünf Falschmeldungen in `HARMLOS` und in die README von `vorschau:messen`; die
   README nennt vier Breiten.
5. **Funktionsinventar** (Regel 3): neue Vorher-Datei nach E99; der Vergleich zählt je Datei.
6. **Belege sichern:** Bilder, Rohdaten und Skripte der Durchsicht und der Gegenprüfung an einen
   dauerhaften Ort (heute liegen sie in einem Arbeitsverzeichnis, das nicht dauerhaft ist).
7. **Zweite Durchsicht** der bisher nicht erreichbaren Bildschirme (Abschnitt 12.2), sobald die
   Vorschau sie zeigt — nach demselben Verfahren wie die Papiere 9 bis 12, mit Gegenprüfung. Ihre
   Befunde gehen in das Seitenpaket der jeweiligen Seite; eine Seite wird in Stufe C erst
   umgebaut, wenn ihre zweite Durchsicht vorliegt.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-16 | Die README nennt drei Breiten, `messen.mjs` misst vier (375 dazu). |
| D1-A18 | Attrappe richten. Die Teile zu filtern schadet nicht. |
| N-D-2 | In Paket 8 richten, damit die Stufe C an richtigen Daten geprüft wird. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D3-C0 | nichts an der App |

**Prüfungen mit Gegenprobe:** `vorschauErsatz.test.ts` verlangt je neuer Attrappe die Form (sie
muss dort von Hand eingetragen werden — der Wächter erzwingt sie nicht von selbst); Inventar:
einen von 16 „Speichern“-Knöpfen entfernen → rot; `vorschau:messen` läuft mit „0 Befunde“;
Tastflächen-Messung: `chat-suche` und `ue-person` gelten als gedeckt (heute falsch gemeldet).
**Bleibt gleich:** an der App ändert sich nichts — nur `tools/`, `tests/`, `docs/`.
**Risiko:** gering. **Aufwand:** 6–8 Tage für die Schritte 1 bis 6 (Fassung 1: 3–4, laut Prüfer
knapp), dazu 3–5 Tage für die zweite Durchsicht.

#### Paket 9 — Bausteine: Fokus, Fuß, Zeile, Flucht, Suche — und ihre Wächter

**Ziel:** Was am Baustein falsch ist, wird am Baustein einmal richtig; was die Tests heute nicht
erzwingen, erzwingt ein Wächter.
**Punkte:** V-1, V-2, V-3, V-5, V-6, V-13, V-15, V-B1, V-B4, V-B6, V-B7, V-B10, D1-A1, D1-A3, D1-A17, D1-B3, D1-B15, D1-C1, D1-I4, D1-I5, D2-A1, D2-A2, D2-A3, D2-A5, D2-A6, D2-A14, D2-B3, D3-4, D3-5, D3-9, D3-11, D3-15, D3-B11, D3-B15, D4-B5, D4-B8. **Dazu Teile von:** D2-A13 (nur das eingerückte Suchfeld der Listenleiste am Tablet, `lot.css:592`).
**Voraussetzung:** Paket 8 (Bilder, Messskripte). Entscheidungen E-V1, E-F11, E-N.
**Schritte:**

1. **Fokus (V-13):** die Regel `:focus-visible` (`index.css:401–405`) steht vor den Bausteinen
   oder wird zu `:where(:focus-visible)` — Elemente mit eigener Rundung behalten sie, Elemente
   ohne bekommen weiter 8 px. Farbe, Breite und Versatz des Rings bleiben.
2. **Fuß von Fenster und Blatt** (D1-B3, D1-B15, D1-C1, D4-B8, D2-A2, D2-A3, D3-4, D3-5): im
   Blatt hört die `Aktionsleiste` auf den Rollbehälter des Blatts (kleiner Eingriff, löst das
   Zeitblatt); die Speicherleiste im Akten-Fenster deckt bis zur Kante; die Aktionsreihe des
   Rechnungsfensters bekommt die volle Breite an ihrer heutigen Stelle (`flex: 1`); die doppelte
   Linie im Lager-Fenster entfällt. Regel: Hauptaktion am Handy kompakt rechts, Nebenweg links;
   volle Breite nur bei einem einzelnen Abschluss (`style.md` Z. 117).
3. **Ungespeichertes (D2-B3, E-F11):** „Neu“-Fenster behalten den Entwurf und sagen es; Rückfrage
   nur beim Bearbeiten; ein leeres Fenster schließt ohne Frage. Am Baustein; die betroffenen
   Fenster stellen ihre Seitenpakete um.
4. **Zeile und Flucht:** `p.leer` und `.arbeitszeile` auf die Blattflucht (V-1, V-2, D2-A5,
   D3-11); der Abstand nebeneinander liegender Blätter als Wächter (V-3 — die drei Stellen
   berichtigen die Seitenpakete 14, 15 und 17); Tabelle im Blatt (V-B10); Abschlusslinie am `li` (D2-A14); Knopf-Link im Kartenkopf
   (D2-A1); Verweis als Wert (D2-A6); Kopf der vier Akten im Raster (V-15); Wisch-Knopf ohne
   Umbruch im Wort (D1-A1); Polster im Blatt (D1-A3); Auswahl in einer Zeile (D3-9); Kennwerte in
   Fenstern in einer Form (D3-15); Tabellenkopf (D3-B11); `:hover` nur für Zeigegeräte und
   Rückmeldung beim Antippen (D1-I5, D1-I4).
5. **Suche** (V-5, V-6, V-B4, D4-B5): Rahmen der Listenleiste als `<label>`; eine Grundregel für
   `::placeholder`; die drei sichtbaren Formen des Suchfelds auf einen Baustein — die Auswahlfelder
   (Baustelle, Kunde, Person, Katalog …) sind nicht gemeint.
6. **Titel in der Kopfinsel (D1-A17):** der Beobachter in `KopfTitel.tsx` erkennt den Sprung ans
   Ende beim Öffnen.
7. **Nachbarstellen (V-B1, E-V1), Verweisgewicht (V-B6), kleine Radien als Token (V-B7).**
8. **„Neu in dieser Liste“ (D3-B15, E-N):** im Blattkopf der Kreis nach E76.
9. **Wächter** — je mit Ausnahmeliste und Gegenprobe (Regel 9):

| Wächter | Am heutigen Stand rot bei (Fundstelle) | Muss grün bleiben bei (gewollt — Ausnahme mit Grund) |
|---|---|---|
| Form unter Fokus gleich (`fokusRahmen.spec.ts`) | Knöpfe, Felder, runde Knöpfe, per Tastatur geöffnetes Fenster (V-13) | Elemente ohne eigene Rundung: 0 → 8 px ist gewollt |
| Tastfläche 44 px bei 390 px über jede Seite (neu: `tests/links/tastflaeche.spec.ts`) | Suchfeld der Listenleiste, „alle ausblenden“, „Im Plan ansehen“ (V-5) | `Button klein` (36 px), Reaktion (43,2 px breit), Kalendertage der Monatsplanung am Handy (E-V5), Monatsraster ab 1.200 px (E88), Verweis im Fließtext; `label` und Zeilenziel zählen mit |
| `raster.spec.ts` über die Seiten der Navigation, auch `/worksheet` und `/assignments/tag` | die drei Stellen aus V-3 (bis die Seitenpakete 14, 15, 17 sie berichtigen) | — |
| `flucht.spec.ts` mit erweiterter Bezugslinie (auch Karten ohne Titel; Liegenschaftsakten in `akten()`) | V-1, V-2, D2-A5 | Tabellen bleiben ausgenommen |
| Rollen im Browser: `th` = 12, `dt` = 13, `.titel-karte` = 18, auch in Fenstern | V-8, V-9, V-10 | `th` der Wochenraster 13 px (E97: dichte Raster), `.titel-karte` der Kontextspalten 12 px versal |
| `<table>`/`<th>` nur mit Klasse `tabelle` | `ProjectSummary.tsx`, Positionstabelle, Beispielrechnung (V-8) | `WochenRaster.tsx:297, 479` |
| `type="search"` nur im Suchbaustein | `input.ue-suche` (V-6) | die übrigen Auswahlfelder (Baustelle, Kunde, Person, Katalog, Rüstliste, Lager …) |
| `<label>` mit `text-meta` nur in `Field` | die Stellen aus V-11 | `KontoauszugView.tsx:421`, `AnnahmeLink.tsx:143`, `KalenderAboKarte.tsx:137` |
| `text-(lg\|xl\|2xl\|3xl)` nur in erlaubten Dateien | V-7, V-12 | `RowMenu.tsx:171`, `IconButton.tsx:44`, Startpasswort, Anmelde- und Willkommensseiten |
| `border-radius` nur aus Tokens | die Stellen aus V-B7 | 18 px und 1,125 rem (`v10Stil.test.ts`), 4 px am Monatsbalken, `klein` (E-V4) |
| ⋯ nur in `mehr`/`weitere`/Fenster/`ListRow` (`bedienregeln.test.ts`) | — | `AngebotView.tsx:516` (bleibt, E-R4); Zuweisungen über eine Variable verfolgen (`NachrichtenView.tsx:180`) |
| „Fuß im Bild“: die Hauptaktion eines Fensters liegt beim Öffnen im sichtbaren Bereich (390×844 und 1440×900) | „Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“, „Kunde bearbeiten“ (Liste) — bis Paket 18 sie berichtigt; das Zeitblatt bis Schritt 2 | — |

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-1 | Die betroffene Karte hat keinen Titel — `flucht.spec.ts` vergleicht nur mit dem Kartentitel und sähe den Fall auch mit Fehlerzustand nicht: die Bezugslinie der Prüfung erweitern. |
| V-2 | Nicht `--blatt-rand-einzug` (28 px, das Kästchen stünde bei 40 px): nötig sind 12 px Polster. Rückt das Kästchen, rückt der Zeilentext von 64 auf 68 px — die Textflucht der Zeile gehört in „bleibt gleich“. Schwere gering. |
| V-3 | `.formular` nicht auf 36 rem setzen (rund 70 Stellen; Leitfaden Regel 9: höchstens 560 px) — nur die örtliche Variante an `WorkSheetView`. `/assignments/tag`: der Abstand von 2,25 rem ist im Code begründet (E24) — vor dem Ändern prüfen, ob der Grund noch gilt. Die Stellen selbst werden in den Seitenpaketen 15, 17 und 14 berichtigt; hier entsteht der Wächter. |
| V-5 | Rahmen der Listenleiste als `<label>`; `Listenleiste.test.tsx:51` und `OrderView.test.tsx:1381` prüfen die Klasse am Element. „Im Plan ansehen“ steht im Satz: entweder Ausnahme „Verweis im Fließtext“ oder das Muster `-my-3 py-3` (`Tastflaechen.test.tsx`). Die Kalendertage am Handy fehlen im Papier (N-V-1). |
| V-6 | Eine allgemeine `::placeholder`-Grundregel behöbe die Ursache; der vorgeschlagene Quelltext-Wächter wäre dann überflüssig. |
| V-13 | Nur die zweite Variante trägt: die Regel vor die Bausteine stellen oder `:where(:focus-visible)`. „Radius streichen und einzeln nachsetzen“ macht den Ring an Verweisen eckig (nachgestellt: 6 von 70 Zielen). `#inhalt:focus-visible` bleibt. Farbe, Breite und Versatz des Rings bleiben, wie sie sind (D4-A6 ist zurückgestellt, E-F13). |
| V-15 | Der Vorschlag (Polster 6 px ändern) behebt die Angebotsakte nicht und die Baustellenakte nur halb — er muss alle vier Akten abdecken oder der Befund wird auf zwei begrenzt. Schwere gering (die Blätter darunter liegen auf der Linie). |
| V-B1 | Entschieden (E-V1): keine Regel über alle Stufen (bräche den Zeilentakt 48/72 px aus E33; rund 350 Regeln). Angeglichen werden nur die Stellen, an denen zwei Zeilenhöhen derselben Stufe sichtbar nebeneinander stehen (`/settings/module`: 13/24 über 13/18; Kundenakte). |
| V-B4 | Umfang benennen: sind die Auswahlfelder gemeint, ist „ein Baustein“ größer als „klein bis mittel“; sind sie nicht gemeint, nimmt der Wächter sie aus. |
| V-B7 | 4 px am Monatsbalken ist begründet (`lot-monat.css:108`); 18 px und 1,125 rem sind in `v10Stil.test.ts` festgehalten. „6 → 8“ nur nach Ansehen. |
| V-B10 | Die Regel auf Blätter begrenzen; `flucht.spec.ts` nimmt Tabellen ausdrücklich aus. |
| D1-A1 | Quelle E82. Bleibt: `Wischen.test.tsx`, Prüfung „echter Finger“. |
| D1-A3 | Am Baustein richtig (schützt künftige Blätter); „Mehr“ (ohne Titel) bleibt unberührt. |
| D1-A17 | Den Beobachter richten, nicht „Titel melden“. Das kann jede Seite treffen, die mit gemerkter Rollposition öffnet. Prüfung „Titel steht in der Insel, wenn die Seite gerollt öffnet“. Am echten Stand gegenprüfen (in der Vorschau kommen Daten sofort). |
| D1-B3 | Zwei der vier Formen sind entschieden: 2 : 3 in der Aktionsleiste ist E72 („Gespeichert“ lässt den Knopf sonst springen), ein einzelner Abschluss über die Breite ist in `style.md` erlaubt. Hauptaktion am Handy kompakt rechts, Nebenweg links (`style.md` Z. 117). |
| D1-B15 | Ursache genauer als im Papier (`Aktionsleiste.tsx:76`). Die Absicht steht in U1 Nr. 3. |
| D1-C1 | Der kleine Weg (im Blatt ohne `erstNachDemRollen`, oder auf den Rollbehälter hören) löst C1 und B15, ohne jedes Formular anzufassen. Bleibt: G22 für das Formular auf der Seite (Tablet, Schreibtisch). |
| D1-I4 | `--hover-flaeche` nehmen, nicht `--auswahl` (E92: „Zeigen ist nicht Wählen“). |
| D1-I5 | E96 („beim Darüberfahren voll Petrol“) am Tablet mit Maus bleibt. |
| D2-A1 | Selektor `a:not(.lot-knopf)` statt `a.akten-verweis, a.link-still` — sonst verlieren die `link-weiter`-Verweise im Kartenkopf („Im Auftragseingang“, „Mein Einsatzplan“) ihren Ausgleich (E31). |
| D2-A2 | Bleibt: Benutzerakte (dasselbe 480-px-Fenster) und `blattKontur.spec.ts` (§95). |
| D2-A3 | Volle Breite, Hauptaktion rechts, an der heutigen Stelle — oder ein klebender Fuß; nicht „am Ende des Fensters“. `RechnungDetail` steht auch auf `/invoices` — dort zuerst ansehen. |
| D2-A5 | Nicht „`flucht.spec.ts` um drei Seiten erweitern“ (sie stehen schon in der Liste): die Prüfung überspringt Karten ohne `.titel-karte` — zu erweitern ist die Bezugslinie; Liegenschaftsakten fehlen in `akten()`. |
| D2-A6 | Der Selektor muss `dl.beleg-angaben` einschließen (der Eingang nutzt sie). Tastfläche am Handy nachmessen (heute 48). |
| D2-A14 | `:last-child` gehört an das `li`. Folgt ein „Alle … zeigen“ unter der Liste, bleibt die Linie. |
| D2-B3 | Entschieden (E-F11, Empfehlung des Papiers): „Neu“-Fenster behalten den Entwurf und sagen es („Entwurf von vorhin — verwerfen“); eine Rückfrage gibt es nur beim Bearbeiten; ein leeres Fenster schließt ohne Frage. |
| D3-4 | `flex: 1` genügt (wie `lot.css:328`). Wird ein Fuß daraus, gehört „Lese-Fassung ohne Knöpfe“ (`aktionen.length > 0`) in „bleibt gleich“. Siehe D2-A3. |
| D3-5 | Vorbild `lot.css:328`. |
| D3-9 | `min-width: 0` an der Hülle von `SelectField`; jede Auswahl in einer `ListRow` mitmessen. |
| D3-11 | `Arbeitszeile` wird nur in `AdminOrdersView` verwendet. Die eigene Regel am Handy (`lot.css:207`) bleibt; `bewegungen.spec.ts:1041 ff.` misst die Zeile. |
| D3-B15 | Entschieden (E-N): „Neu in dieser Liste“ im Blattkopf ist der Kreis (E76) — die abweichenden Stellen stellen ihre Seitenpakete um. |
| D4-B5 | Die Schwelle „ab 9“ nicht auf Personenlisten übertragen (nähme einem Betrieb mit 7 Leuten die Suche). `?suche=` aus der globalen Suche kommt weiter an (E91). |
| D4-B8 | Plattform: der Grund ist Pflicht vor jedem Schritt — im ⋯ muss das Feld erreichbar bleiben. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-1 | der Satz selbst und wann er erscheint; am Handy 16 px; in Fenstern der bisherige Abstand. Rückschritt erkennbar an: Satz links vom Titel bei 390 px. |
| V-2 | 44 px Tastfläche des Kästchens, Sammelleiste, Reihenfolge; Handy unverändert. |
| V-3 | ab 1 200 px beide Rechnungskarten nebeneinander, darunter gestapelt (E98); Kalender links, Formular rechts in der Tagesplanung; einspaltiges Formular des Scheins höchstens ~560 px breit (Leitfaden Regel 9). Rückschritt erkennbar an: `raster.spec.ts` rot oder … (weiter im Papier) |
| V-5 | sichtbare Größe und Lage der Elemente (die Tastfläche wächst über Polster und Gegenrand wie bei `.link-kontakt`, `lot-blatt.css` letzte Regel), Zeilenhöhen. |
| V-6 | Suche nach Person, `?suche`-Verhalten, Breite 15 rem ab Tablet. |
| V-13 | der sichtbare Fokusring an jedem fokussierbaren Element (3 px, 2 px Abstand), Felder mit ihrer einen Linie (`fokusRahmen.spec.ts`), Zeilen mit dem Ring außen. Rückschritt erkennbar an: ein Element ohne Ring bei Tab. |
| V-15 | Stand neben der Nummer, Rückweg in der Ortszeile, `handyInhalt.spec.ts` („Titel endet auf einer Rasterlinie“). |
| V-B1 | Zeilen mindestens 48 px, Blattkanten auf dem Raster (`raster.spec.ts`), keine abgeschnittenen Unterlängen. |
| V-B4 | Platzhaltertexte, `?suche=` in der Adresse, Lage der Suche am Handy oben (E26). |
| V-B10 | rechtsbündige Beträge, Summenblock, waagrechtes Rollen der Tabelle am Handy. |
| D1-A1 | Breite der Aktion mindestens 88 px, Tipp darauf ruft dieselbe Rückfrage; Rückschritt wäre eine Aktion schmaler als 44 px. |
| D1-A3 | das „Mehr“-Blatt (ohne Titel) unverändert; Rückschritt wäre doppelte Luft in Blättern, deren Inhalt schon einen Rand mitbringt. |
| D1-A17 | Betrieb in der Kopfinsel auf allen anderen Seiten, Suche und Profil rechts. |
| D1-B3 | Reihenfolge Abbrechen links, Hauptaktion rechts; nichts hinter der Tastatur. |
| D1-C1 | alle Prüfungen und Pflichtfelder vor dem Buchen; nichts bucht ohne ausdrücklichen Tipp. |
| D1-I4 | kein Dauerpuls, kein Federn |
| D1-I5 | am Schreibtisch unverändert; am Gerät prüfen |
| D2-A1 | die 44-px-Tastfläche von „Alle Termine ›“ ohne höhere Zeile (E72, `kontextEinheitlich.spec.ts`), der Knopf im Kartenkopf am Tablet/Schreibtisch. Rückschritt merkt man an: Kartenköpfe mit Verweis werden höher als 72 px. |
| D2-A2 | Leiste erscheint erst bei Abweichung, „Verwerfen“ links, „Speichern“ rechts, Satz zum Stand darüber; am Handy über der Fußinsel. Rückschritt: Leiste verdeckt das letzte Feld oder springt beim Erscheinen. |
| D2-A3 | alle Einträge des ⋯, „In Rechnungen bearbeiten“ führt weiter auf die Rechnungsseite mit derselben Rechnung offen (E99). Rückschritt: ein Eintrag des ⋯ fehlt, oder die Aktionen stehen auf der Rechnungsseite anders als heute. |
| D2-A5 | am Handy 16 px (dort ist der Blattrand 16). Rückschritt: Handy bekommt 24 px. |
| D2-A6 | 44 px Tastfläche am Handy (messen), Linie und Symbol an Telefon/Mail/Adresse (E72). Rückschritt: Tastfläche unter 44 px. |
| D2-A14 | Blatthöhen im 24-px-Takt (`raster.spec.ts`). |
| D2-B3 | Escape schließt weiter jedes Fenster ohne zweite Taste, wenn nichts eingegeben ist. Rückschritt: eine Rückfrage erscheint bei leerem Formular. |
| D3-4 | Reihenfolge ⋯ · PDF laden · Zahlung erfassen, die Lese-Fassung ohne Knöpfe (Kundenakte, Baustellenakte). |
| D3-5 | Abstand zwischen Zahlen und Knöpfen (rund 36 px). |
| D3-9 | am Schreibtisch Auswahl rechts neben der Zeile (dort 445 px, x = 259–704 bei 834). |
| D3-11 | 44-px-Tastfläche des Kästchens, Mehrfachauswahl. |
| D3-15 | der eine große Deckungsbeitrag der Nachkalkulation darf größer bleiben (er ist die Auskunft des Fensters). |

**Prüfungen mit Gegenprobe:** je Wächter die Gegenprobe der Tabelle; Komponentenprüfungen der
Bausteine; Prüfung „Titel steht in der Insel, wenn die Seite gerollt öffnet“; Bilder vorher und
nachher für jede Seite, die einen geänderten Baustein trägt.
**Bleibt gleich:** `Wischen.test.tsx` und die Prüfung „echter Finger“; `blattKanten.test.ts`;
E72 (Anteile 2 : 3 in der Aktionsleiste, `premium.spec`); E82 (Umbruch nur zwischen Wörtern); G22
(das Zeitformular auf der Seite klebt erst nach dem Rollen); die sechs Namen der Hauptaktion des
Zeitformulars; die `Speicherleiste` nach U1 Muster 3 — sie wird nicht durch `Fensteraktionen`
ersetzt; Leitfaden Regel 9 (`.formular` höchstens 560 px, rund 70 Stellen); die Textflucht der
Arbeitszeile; `Listenleiste.test.tsx:51`, `OrderView.test.tsx:1381`; `handyInhalt.spec.ts`;
Platzhaltertexte, `?suche=` in der Adresse, Lage der Suche am Handy oben (E26); `blattKontur.spec.ts`.
**Risiko:** ein Baustein wirkt auf viele Seiten — deshalb je Schritt ein PR mit Bildern aller
betroffenen Seiten. **Aufwand:** 8–10 Tage.

#### Paket 10 — Eine Schreibweise: Zahlen, Zeiten, Wörter, Anrede, Tastaturen, Titel

**Ziel:** Für Zahl, Zeit, Wort und Anrede gibt es je eine Quelle und einen Wächter.
**Punkte:** V-B2, D1-A22, D1-B5, D1-B6, D1-B14, D2-B4, D2-B5, D2-B6, D3-17, D3-B1, D3-B2, D3-B3, D3-B4, D3-B5, D3-B6, D3-B7, D3-B8, D3-B9, D3-B10, D3-T22, D4-B3, D4-B10.
**Voraussetzung:** Paket 8. Entscheidungen E-D, E-F3, E-V2.
**Schritte:**

1. **Formatierer als einzige Quelle** (`src/lib/betrag.ts`, `src/lib/zahl.ts`, Zeit- und
   Datumshelfer): gebuchte Dauer „HH:MM Std“ (die Uhr des Arbeitstags ist ausgenommen;
   kalkulierte Stunden und Budget bleiben in Dezimalstunden); Datum kurz oder lang nach Rolle,
   das Jahr nur, wenn es nicht das laufende ist; Wochentag ohne Punkt (D1-B5, D1-B6); ein Betrag als
   eigener Wert steht in Mono rechts, im Satz darf DM Sans bleiben (D3-B1); das Eurozeichen steht
   wie in `euro()` vor der Zahl — die zwei Sätze der Einstellungen ziehen nach, „78,00 €/h“ aus
   `euroBetrag` bleibt (D3-B2); die Anzeige der Tausender bleibt beim Leerzeichen, das die Tests
   festhalten — angeglichen werden nur der Kommentar in `betrag.ts:33` und die Fehlertexte in
   `zahl.ts` (D3-B3); Menge als Zahl und Einheit in Mono, „12 Stk“ (D3-B4). Wächter: kein `toFixed`/`String(betrag)` in Ansichten.
2. **Wörterliste** (`docs/design/v10/woerter.md`, neu): ein Wort je Sache, wie in Fassung 1
   empfohlen und nicht beanstandet — „Speichern“ (D2-B4), „PDF laden“ (D2-B5), „Neu …“ für das leere
   Formular und „… anlegen“ für das Ableiten aus Vorhandenem (D2-B6; „Annehmen → Baustelle“
   bleibt), „Anforderung“ (D3-B6), „Zählliste“ und „Bestand berichtigen“ statt
   „Inventur“ für zwei Dinge (D3-B7), „ganztags“ (D4-B10), „(freiwillig)“ (D3-B9),
   „Firmendaten“, „Mein Konto“ (D1-B14); dazu „Mahnung erzeugen“ bis zum Abschluss (D3-B8) und
   die Zustandswörter in einer Schreibweise (D3-B5); Verweiszeichen „›“ über `.link-weiter`
   (D3-B10, D4-B3). Der Wächter über die Texte ist neu zu
   bauen (`schreibweise.test.ts` prüft heute nur ß und Anführungszeichen).
3. **Anrede (D3-T22, E-D):** „du“ in der Bedienoberfläche für angemeldete Nutzer (`KontoauszugView.tsx:254`,
   `InvoicesView.tsx:3640`, `ErrorBoundary.tsx:133`); unverändert „Sie“: Kundenseite der Annahme,
   Mailtexte, alle Belege.
4. **Tastaturen (D1-A22):** Eigenschaften an `InputField` und die Regel, welche Art Feld welche
   Tastatur bekommt; Wächter mit Ausnahmeliste.
5. **Fehlertexte (D3-17):** `grundAus` fängt auch „is not“, „iterable“, „properties“; Wächter
   „kein rohes `e.message` in einer Ansicht“ mit Ausnahmeliste der rund 20 Stellen.
6. **Titelskala (V-B2, E-V2)** als Rollen in `style.md`, je Abbildung im Bild gemessen.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-B2 | Entschieden (E-V2): Titelskala Seite 30/28, Fenster 20, Blatt 18, Gruppe 16 als Rollen in `style.md`. Jede Abbildung von 17, 19 und 22 px wird einzeln im Bild gemessen. Es bleiben: `start-einsatz-titel` 22/30 (`planlinieStil.test.ts:560`, Trennregel), der 17-px-Titel der Planung (`min-width: 9.5rem`), die Höhe von `arbeitstag-start` (E75), der Gesprächskopf in Serif. `EIGENE_GROESSE` und `EIGEN` der Schriftprüfungen gehen mit. |
| D1-A22 | `inputMode="numeric"` hat am iPhone weder Komma noch Minus: für Felder mit Nachkommastellen `decimal`; nicht pauschal aus `type="number"` ableiten. Das Kennzeichen ist heute kein `InputField` (D1-A4 zuerst). Wirkung am iPhone prüfen. |
| D1-B5 | Die Uhr des Arbeitstags (H:MM:SS) ist keine Dauerangabe im Sinn des Formatierers — ausnehmen. Kalkulierte Stunden und Budget bleiben in Dezimalstunden („240 h“, E-F3). |
| D1-B6 | „Jahr nur, wenn nicht das laufende“: in der Zeitliste (Vorjahre) und um den Jahreswechsel prüfen; Vorlesenamen behalten das volle Datum. |
| D1-B14 | Das Suchfenster listet beide Namen — mit umstellen. |
| D2-B4 | Browserwege stützen sich auf die Namen — Liste der Umbenennungen führen. |
| D2-B6 | „Annehmen → Baustelle“ bleibt als Wort. |
| D3-17 | Erweiterung von `grundAus` um `is not\|iterable\|properties`; deutsche Gründe bleiben. Schwere niedrig (entsteht nur aus einem Programmfehler). |
| D3-B5 | „knapp“ suchen Prüfungen. |
| D3-B7 | „Inventur“ steht in 60 Komponenten- und 45 Browserprüfungen. |
| D3-B9 | In `src/features` 20-mal „(optional)“ gegen 22-mal „(freiwillig)“. |
| D3-T22 | Nur die Bedienoberfläche (E-D, neu vorgelegt). |
| D4-B3 | Den Baustein gibt es: `.link-weiter` hängt „›“ selbst an — kein neuer Baustein. |
| D4-B10 | Die beiden Urlaubs-Knöpfe nicht auf ein Wort bringen. Beim Vereinheitlichen von „ganztags“ die Vorlesetexte mitziehen. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-B2 | Serif nur für den Seitentitel (und, wenn gewollt, den Gesprächskopf), Umbruch langer Namen, Kopfhöhen im Raster. |
| D1-A22 | `type="number"` mit `min`, wo der Browser prüft. ### Dunkler Satz Angesehen: Startseite (bereit, läuft), Zeitliste, Blatt „Neuer Eintrag“, Rückfrage, Material mit Auswahl und Korbleiste, Gespräch. Kein Kontrastfehler gefunden; eigene Blase `rgb(23,52,59)` mit … (weiter im Papier) |
| D1-B14 | Leitung und Buchhaltung sehen weiter „Einstellungen“. |
| D2-B4 | Namen, auf die sich die Browserwege stützen (Tests mitziehen). |
| D3-17 | deutsche Meldungen der Datenbank (`raise exception '…'`) kommen weiter wörtlich an. |

**Prüfungen mit Gegenprobe:** je Formatierer eine Unit-Prüfung; Wörter- und Anrede-Wächter am
heutigen Stand rot an den genannten Stellen; eigene Prüfung „Kundenseite, Mailtexte und Belege
sprechen den Kunden mit ‚Sie‘ an“; `schriftskala.test.ts` (`EIGENE_GROESSE`) und
`schriftskala.spec.ts` (`EIGEN`) gehen mit der Titelskala mit.
**Bleibt gleich:** Belege und Exporte (Belegreferenz Byte für Byte); gespeicherte Werte; jedes
Betragsfeld liest weiter Komma und Punkt; die Vorlesenamen behalten das volle Datum; „Annehmen →
Baustelle“ und „Thread“ bleiben als Wörter; „Urlaubsanspruch ändern“ und „Anspruch anpassen“
bleiben zwei Wörter für zwei Funktionen; „Sie läuft von selbst.“ bleibt in 13 px.
**Risiko:** viele Prüfungen suchen Knöpfe und Texte beim Namen („Inventur“ in 105, „knapp“,
„Positionen zusammenstellen“ in 28, „Neue Rechnung“ in 35) — jede Umbenennung steht mit altem und
neuem Namen in `v10-entfernt.json`, und das Inventar zählt je Datei (Paket 8).
**Aufwand:** 6–8 Tage (Fassung 1: 5–6 samt E-V1 bis E-V3; diese sind jetzt verteilt).

#### Paket 11 — Zeilen- und Textregel: `style.md`, `PageHeader`, Kartenkopf, „Nummer“, Wächter

**Ziel:** Die Regeln aus den Abschnitten 6.3, 6.5 und 7.3 stehen in `style.md`; die Bausteine und
Wächter dazu gibt es. Umgestellt wird in Stufe C.
**Punkte:** V-B3, D1-B2, D1-B9, D1-T1, D1-P8, D2-T5, D3-T1, D4-T1, D4-P3, N-D4-3.
**Voraussetzung:** Pakete 8 und 10. Entscheidungen E-T, E-P, E-F1, E-F2, E-F10, E-F29, E-V3, E-V4.
**Schritte:**

1. **`style.md`:** Textregel (6.3), Punktregel (7.3), Regel „der nächste Schritt wird angeboten“
   (6.5); die Rollen der Gruppenköpfe so, wie sie heute sind (E-F2); die Zahl in Klammern am
   Kartentitel (E-F1); der kleine Knopf mit 8 px als benannte Ausnahme (E-V4); die Rückfrage mit
   16 px (E-F10); den Absatz „Schalter und Kästchen“ auf den Stand von E95 (N-D4-3). In
   `entscheidungen.md` vermerken, dass Textregel 1 E86 ab dem Tablet ändert.
2. **`PageHeader`** (D1-T1, D2-T5, D3-T1, D4-T1): die Beschreibung steht auch ab dem Tablet in
   der Hilfe; eine Auskunft
   (Datum, Dateiname, Zahl) bekommt ein eigenes Merkmal und bleibt; die vier Seiten aus E25
   behalten ihren Untertitel. Im Test steht die Liste der erlaubten Untertitel.
3. **`Card`** (D1-B9, D1-P8, D4-P3): die Zahl in Klammern am Titel als eine Form.
4. **Baustein „Nummer“** (V-B3, D1-B2; ungerahmt, Mono, für Begleitzeilen) und der Verbinder für die Teile
   einer Zeile.
5. **Wächter:** Punkte je sichtbarer Textzeile (7.3); Liste der erlaubten Untertitel; lange Texte
   offen (`warntextKurz.test.ts` erweitert); jede Hilfe enthält die dorthin verschobenen Sätze.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-B3 | Entschieden (E-V3): Nummern und Zeiten in Begleitzeilen in Mono über den Baustein „Nummer“, in der Schriftgröße der Zeile; das Datum in Meta-Zeilen bleibt in DM Sans. Umgestellt wird nur, wo eine Zeile in Stufe C ohnehin umgebaut wird (194 Vorlagen und 113 `join` würden sonst zu Markup; `aria-label`, `title`, `<option>` tragen keinen Schriftwechsel; Prüfungen mit `getByText` über den ganzen Satz sind betroffen). |
| D1-B2 | Nicht über `.nr`: das ist die allgemeine Klasse „nicht am Bindestrich umbrechen“ und liegt an 26 Stellen auch auf Telefonnummern, Mengen, Prozentsätzen, Datum. Mono nur über den eigenen Baustein „Nummer“ (E-V3). |
| D1-B9 | Entschieden (E-F1): eine Form — die Zahl in Klammern am Titel („Zu erledigen (10)“), wie E98 sie für die Klappkarten festlegt. „noch 1 von 2“ an der Rüstliste und „3 Rechnungen“ im Kopf (E99) bleiben. |
| D1-T1 | Dehnt E86 auf Tablet und Schreibtisch aus (E-T, entschieden in der Fassung von Abschnitt 6.3). Drei Prüfungen hängen an Wortlauten. |
| D1-P8 | Entschieden (E-F1): die Zahl in Klammern am Titel, nicht rechts im Kopf (dort stehen Verweise, „i“ und der Neu-Knopf). |
| D2-T5 | Der Weg in die Hilfe ist seit E86 gebaut. „2 offene Angebote · kalkulieren …“ ist eine Zeichenkette — die Zahl beim Umbau trennen. |
| D3-T1 | Falle: der Dateiname des Kontoauszugs ist auch ein bloßer Text und verschwände mit — die Ausnahme braucht ein eigenes Merkmal. |
| D4-T1 | Entschieden (E-T, Abschnitt 6.3): die Beschreibung steht auch ab dem Tablet in der Hilfe (ändert E86 an dieser Stelle); Urlaub, Nachkalkulation, Handwerksscheine und Sonderurlaub behalten ihren Untertitel (E25). Je Untertitel hängen ein bis zwei Prüfungen daran. |
| D4-P3 | Entschieden (E-F1): die Zahl in Klammern am Titel — die häufigere Form, die das Papier empfiehlt. |
| N-D4-3 | Absatz berichtigen. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-B3 | kein Umbruch in der Nummer, Kopierbarkeit, Suche nach Nummern (E91). |

**Prüfungen mit Gegenprobe:** Punkt-Wächter ohne Ausnahmeliste am heutigen Stand rot an den
gesammelten Fundstellen; Untertitel: eine Beschreibung ab Tablet → rot; der Dateiname des
Kontoauszugs bleibt sichtbar (eigene Prüfung); die Prüfungen, die Untertitel beim Wort nehmen
(drei im Bereich Monteur, je ein bis zwei je Seite im Bereich Team), werden bewusst nachgezogen.
**Bleibt gleich:** der Inhalt jeder Hilfe; die Summenzeile der Klappkarten (E98); „3 Rechnungen“
im Kopf (E99); „noch 1 von 2“ an der Rüstliste; die zwei Absätze des Supportzugangs und der Text
zur Verjährung (Ausnahmen des Wächters „lange Texte“); `.nr` bleibt die Klasse gegen den Umbruch
am Bindestrich.
**Risiko:** gering, solange die Wächter mit vollständiger Ausnahmeliste kommen.
**Aufwand:** 6–8 Tage (der Umbau der Listen und Texte selbst steht in Stufe C).

#### Paket 12 — WebKit für die Geldwege des Büros und für das Tablet

**Ziel:** Bevor Stufe C die Büroseiten umbaut, laufen ihre wichtigsten Wege auch in WebKit.
**Punkte:** L-11.
**Voraussetzung:** Paket 2.
**Schritte:** nach Papier 7, Befund L-11: die dort genannten neun Prüfdateien der Geldwege in ein
WebKit-Projekt; ein Tablet-Projekt in WebKit (heute sind die Tablet-Projekte `Desktop Chrome`).

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| L-11 | In dieser Umgebung liegt nur Chromium; die neuen Projekte sieht lokal niemand, bis WebKit geladen ist — die CI prüft sie. |

**Bleibt gleich laut Papier, je Punkt:**

_Die Papiere nennen zu den Punkten dieses Pakets kein eigenes „bleibt gleich“ — es gelten die Angaben oben._

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| L-11 | Papier 7, Befund L-11 (Aufwand dort: m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | kein Weg wird aus Chromium entfernt, keine Wiederholung bei Rot. |

**Bleibt gleich:** die bestehenden Projekte (`telefon-chromium`, `webkit-telefon`, `tablet-834`)
und ihre Laufzeit im Rahmen. **Risiko:** die Laufzeit der CI steigt. **Aufwand:** 2–3 Tage.


### Stufe C — Seiten, jede genau einmal

Für jedes Paket dieser Stufe gilt zusätzlich: **ein PR je Seite**; Bilder vorher und nachher aus
dem Werkzeug von Paket 8 (375, 390, 834, 1440 px, hell und dunkel, mit Fenstern und Menüs); die
Seite streicht ihre Einträge aus den Ausnahmelisten der Wächter (Pakete 9 bis 11) — der PR ist
erst fertig, wenn die Wächter ohne diese Einträge grün sind; Tastaturen, Wörter, Anrede und
Formatierer der Seite werden im selben PR umgestellt; jede umbenannte Bedienstelle steht in
`v10-entfernt.json`; das Funktionsinventar (je Datei gezählt) bleibt grün; die Wege der Seite
laufen im Durchklick (Chromium lokal, WebKit in der CI). Zeilenformen werden nach Regel 5 in
Abschnitt 7.3 nur gebaut, wenn sie bei 375 px und 834 px nicht mehr Zeilen brauchen als heute.
Voraussetzung für alle: Pakete 7 bis 12 und die zweite Durchsicht der Seite (Paket 8, Schritt 7).

#### Paket 13 — Hülle und Startseite

**Ziel:** Kopf, Leisten und Startseite sind ruhig und sagen nichts doppelt.
**Punkte:** D1-A11, D1-A15, D1-A19, D1-A20, D1-B10, D1-B11, D1-B13, D1-C8, D1-I3, D1-I9, D1-I11, D1-I18, D1-T2, D1-T22, D1-T23, D1-P9, D4-T2, D4-T3, D4-T21, D4-P1, D4-P2. **Dazu Teile von:** D1-P4 und D4-P5 (Stellen der Startseite); V-11 (Beschriftung in „Problem melden“).
**Voraussetzung:** Pakete 8 bis 11. Entscheidungen E-T, E-F1, E-R7, E-W1.
**Schritte:**

- **Hülle** (`Layout.tsx`, `KopfTitel.tsx`): die Seitenleiste rollt in sich (D1-A19); der
  Darstellungsschalter bekommt sein Wort (D1-B13); der Titel schrumpft weich in die Kopfinsel
  (D1-I3); „Suchen oder springen“ am Handy mit sichtbarem Ausgang (D1-C8); die „Neue
  Fassung“-Leiste deckt die Fußinsel nicht mehr (D1-A20, am Gerät prüfen); Timer-Leiste und
  Inseln auf gleichem Grund (D1-B10); Kontur des laufenden Arbeitstags im dunklen Satz (D1-I9);
  Ziehen zum Aktualisieren auch in Blättern mit Liste (D1-I11); Zeichen „Person“ für „Mein Konto“
  (D1-I18); Verbindungsband und Abmelde-Rückfrage gekürzt (D1-T22, D1-T23).
- **Startseite** (`DashboardView.tsx`, `start/`): Meta-Zeile ohne Rolle, außer im
  Supporteinblick (D1-T2, D4-T2, D1-P9, D4-P1); „Nicht geladen“ gekürzt (D4-T3); Zeilen der Themen
  (D4-P2, D4-T21); Verweiszeichen (D1-A15); „Aufgabe“ einheitlich (D1-B11); Pfeilknöpfe in
  „Startseite anpassen“ mit Radius (D1-A11).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| D1-A15 | Zwei der vier (`Handlungsbedarf.tsx:98`, `RuestlisteAbhaken.tsx:227`) klappen an Ort und Stelle auf — dort kein „›“ (es heißt „öffnet etwas“). |
| D1-A19 | Gebaut wird nur „rollt in sich“. Schalter und Marke bleiben in der Leiste (E92, `style.md`; E-R7). Rechtstexte nicht tiefer legen. |
| D1-A20 | Bleibt: unter Rückfragen. Am Gerät prüfen. |
| D1-B10 | Vorbehalt des Papiers: Weiß kann gewollt sein, um die Leiste von der Navigation zu trennen — vor dem Bau im Bild zeigen. |
| D1-B11 | Der erste ist bewusst so (E90); „alle wie der erste“. |
| D1-B13 | Der Schalter bleibt in der Leiste (E92); gebaut wird die Beschriftung. |
| D1-I3 | Bewegung nur über `transform`/Deckkraft (§112); der Titel in der Insel bleibt `aria-hidden`. Mit D1-A17 am selben Baustein. |
| D1-I9 | Kontrast in `lotGrundwerte.test.ts` mitmessen. |
| D1-I11 | Wächter `aktualisierenRegel.test.ts`; nie in einem Formular. |
| D1-I18 | Gebaut wird nur das Zeichen (Person statt Glocke). „App erneuern“, Fassung und die Rechtstexte bleiben, wo sie sind (E-W1). |
| D1-T2 | Im Support-Einblick bleibt die Rolle (`rolleAnzeige.ts`, G21). |
| D1-T22 | Kürzen ja, aber ohne das Versprechen „Eingaben werden vorgemerkt“; der zweite Satz bleibt dem Sinn nach. |
| D1-T23 | U9 lässt den Text in einer Rückfrage offen; er schützt vor Datenverlust. Kürzen nur, wenn bleibt: was liegt da, und es geht erst nach Anmeldung auf diesem Gerät hinaus. |
| D1-P9 | Die Dachzeile bleibt (sie nennt auf jeder Seite den Bereich); gekürzt wird nur die Meta-Zeile (D1-T2). |
| D4-T2 | Im Supportzugang steht dort „Support (lesend)“ bzw. „Support (mitarbeiten)“; am Handy gibt es keine Seitenleiste — vor dem Streichen sicherstellen, dass der Einblick sichtbar bleibt. |
| D4-T3 | Kürzen, nicht streichen: der Kern schützt vor einem Fehlschluss. |
| D4-T21 | Teil Tag-Fenster in Paket 17. |
| D4-P1 | Die Dachzeile bleibt — „KW 48“ allein wäre die Ausnahme. |
| D4-P2 | Für lange Titel und für den Ort des Aktionsworts am Handy („verrechnen“, „entscheiden“) eine Fassung festlegen. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D1-A19 | jede dieser Aktionen mit höchstens zwei Klicks; Strg+K und Betriebsname oben. |
| D1-A20 | unter Rückfragen und Fenstern (z-Ebene). |
| D1-C8 | Strg+K, Gruppen, Aktionen, Pfeiltasten am Schreibtisch. |
| D1-I3 | bei „Bewegung reduzieren“ sofort |
| D1-I9 | Farbe der Fläche |
| D1-I11 | nie in einem Formular |
| D1-I18 | Fassung und Erneuern bleiben erreichbar (dort entsteht die Frage) |

**Prüfungen mit Gegenprobe:** Seitenleiste bei 1440×900 für jede Rolle: „Abmelden“ ist erreichbar
(heute für Verwaltung und Administrator unter dem Rand); Meta-Zeile im Supporteinblick zeigt
„Support (lesend)“; `lotGrundwerte.test.ts` misst die neue Kontur; `aktualisierenRegel.test.ts`.
**Bleibt gleich:** Darstellungsschalter und Marke in der Seitenleiste (E92, `style.md`);
„Datenschutz · Impressum“, „App erneuern“ und Fassung an ihrem Ort; die Dachzeile „START · KW 48“;
Strg+K, Gruppen, Aktionen und Pfeiltasten der Suche; die Meldung oben (G29); Bewegungen nur über
`transform` und Deckkraft; `petrolFarben.test.ts`.
**Risiko:** `KopfTitel` wirkt auf jede Seite. **Aufwand:** 6–8 Tage.

#### Paket 14 — Die Seiten des Monteurs

**Ziel:** Die sieben Wege des Monteurs am Handy stocken nicht mehr an den gemessenen Stellen.
**Punkte:** V-11, D1-A2, D1-A4, D1-A5, D1-A6, D1-A7, D1-A8, D1-A9, D1-A10, D1-A12, D1-A14, D1-B1, D1-B7, D1-C3, D1-C4, D1-C5, D1-C6, D1-C9, D1-I8, D1-I14, D1-I15, D1-I16, D1-T3, D1-T4, D1-T5, D1-T6, D1-T7, D1-T8, D1-T9, D1-T10, D1-T11, D1-T12, D1-T13, D1-T14, D1-T19, D1-T20, D1-T21, D1-T25, D1-P1, D1-P2, D1-P3, D1-P4, D1-P5, D1-P6, D1-P7, D1-P10, D1-P11, D1-P13, D1-P16, D3-T18, D3-P10, D4-T20, D4-P6, N-D1-1. **Dazu Teile von:** V-3 (Stelle `/worksheet`); V-5 („alle ausblenden“ im Änderungsprotokoll); D4-A13 (Zuschlag-Kennzahl auf `/time`); D1-A15 (Stelle Rüstliste).
**Voraussetzung:** Pakete 8 bis 11 (Zeitblatt-Fuß aus Paket 9). Entscheidungen E-P, E-T, E-W1.
**Schritte:**

- **Zeit** (`TimeView.tsx`, `TimeForm.tsx`): „Eintrag löschen“ ins ⋯ des Blatts (D1-A2); Kennzeichen
  als Feld aus dem Baustein (D1-A4, V-11); Wertspalte der Zeilen mit Papierkorb (D1-A5); Zeile der
  Zeitliste (D1-P1, D1-T25); Kennzahlen „Saldo“ und „Zuschlag“ (D1-T4, D4-T20, N-D1-1, D1-T5,
  D1-P6, D4-A13 Teil 3); „Wie zuletzt buchen“ (D1-P7, D4-P6); Texte (D1-T6, D1-T7, D1-T8, D1-C9).
- **Einsatzplan, Team-Woche, Meine Baustellen** (`MyScheduleView.tsx`, `MyProjectsView.tsx`):
  dieselben Aktionen am Einsatz wie auf der Startseite (D1-B1); Tipp auf einen Tag zeigt die
  Tagesliste, zusammen mit der eingeklappten Woche (D1-C6); Wegeleiste an der Baustellenkarte
  (D1-C5); ein Kalenderkopf (D1-B7); Kalender-Abo als Zeile (D1-T19); Legende (D1-T20); Rüstliste
  (D1-T3, D1-I16); Zeilen (D1-P2, D1-P3, D1-P5, D1-T9, D1-P16).
- **Material** (`OrderView.tsx`): Korb mit „Abschicken“ im Bild und dem Feld „bis wann“ neben der
  Notiz (D1-C3, D1-T11); Platzhalter (D1-A9); Hinweis im Kartenkopf (D1-A10); Zeilen und Texte
  (D1-P10, D1-P11, D1-T10, D3-T18, D3-P10).
- **Handwerksschein** (`WorkSheetView.tsx`): Abstände der Karten (D1-A6, D1-A7, D1-A8); Zeile
  ganz antippbar (D1-A14); die gesperrte Hauptaktion nennt ihren Grund (D1-C4); Hinweis „Quer
  halten“ nur, wo Drehen geht (D1-I8); Texte (D1-T12, D1-T13, D1-T14); Zeilen (D1-P4).
- **Nachrichten** (`NachrichtenView.tsx`, `Postfach.tsx`, `NeueNachricht.tsx`): Zeit kurz (D1-I14,
  D1-T21, D1-P13); Adresse nicht in Mono (D1-A12); Fußinsel bei offener Tastatur (D1-I15).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-11 | Teile Kunde (Paket 18), Hülle (Paket 13), Katalog einspielen (Paket 16). |
| D1-A2 | U7 hat das Löschen bewusst ins Blatt gelegt; `TimeView.test.tsx:1368` und `zeitVerlauf.spec.ts:59` klicken genau diesen Knopf — beide und das Funktionsinventar nachziehen. Der Wächter `bedienregeln.test.ts:193` sieht den Knopf heute nicht (als Eigenschaft durchgereicht). |
| D1-A4 | Der Vorsatz ist nicht fest „WN-“, sondern `kennzeichenVorsatz` je Betrieb; fehlt er, trägt das Feld das ganze Kennzeichen. Bleibt: `ohneKennzeichenVorsatz` beim Tippen, `datalist` der Fahrzeuge. |
| D1-A5 | Der Papierkorb an Berufsschulzeilen bleibt: sie öffnen kein Blatt, er ist dort der einzige Weg ohne Geste (die Wischaktion ist `inert`, für Tastatur und Vorlesehilfe weg). |
| D1-A6 | 8 px Luft unter der klebenden Leiste lassen den rollenden Inhalt der Karte im Spalt durchscheinen — vorher im Bild prüfen. `blattKanten.test.ts:23, 40, 205` halten die Leiste fest. Gilt ebenso für die Korbleiste. |
| D1-A7 | Bleibt (E90): Name, Nummer, Abrechnung, Adresse und „ändern“ einmal. Mit zweizeiligem Namen prüfen (Kartenkopf 72 px, zentriert). |
| D1-A9 | Der Kreis bleibt in der Reihe mit Menge und Einheit (E74). |
| D1-A10 | Der Zusatz kommt in den Kartentitel; Form des Kartenkopfs nach E-F1. |
| D1-A14 | „Baustelle und Tag“ öffnet zusätzlich die Auswahl — bleibt. Vorlesenamen „… ändern“ in Prüfungen nachziehen. |
| D1-B1 | Entschieden (E-F33): am Handy bekommt der Einsatz im Einsatzplan die dreigeteilte Leiste der Startseite („Anfordern \| Nachricht \| Schein“); „Zeit erfassen“ bleibt dort als eigener Knopf über der Leiste (im Einsatzplan gibt es die Arbeitstagkarte nicht). Bleibt: jede der fünf Aktionen an jedem Einsatz, die großzügige Form ab Tablet. |
| D1-C3 | Die Notiz für die Projektleitung bleibt — „bis wann“ kommt dazu, nicht statt. Das Feld ist ein neues Datenfeld (Datenbank, Sicht des Büros). Die Korbleiste stößt heute schon an die Fußinsel und läge mit der Timer-Leiste doppelt. |
| D1-C4 | Acht Bedingungen sperren den Knopf (`WorkSheetView.tsx:783–788, 1264`) — die Zeile muss jede nennen können. |
| D1-C5 | Gebaut wird der Vorschlag des Papiers: Wegeleiste am Fuß jeder Karte und Verweis auf den nächsten Einsatz — keine neue Baustellenansicht. Der Leistungsumfang kommt mit A-10 (Paket 22). |
| D1-C6 | Nur zusammen mit der eingeklappten Woche bauen (bloßes Rollen lässt den Kalender verschwinden). Für den Monteur gibt es kein Einsatz-Fenster; das Fenster der Leitung (E98) trägt „Bearbeiten“ und „Baustelle öffnen“, die er nicht haben darf. |
| D1-C9 | Siehe D1-T4, T6, T7. |
| D1-I8 | Nicht die Sperre aufheben (dann dreht sich die ganze App, ein Android-Handy zeigt quer die Tablet-Ansicht): den Hinweis nur zeigen, wo Drehen geht. |
| D1-I14 | Vorlesename mit vollem Datum. |
| D1-I15 | Am Gerät prüfen. |
| D1-I16 | Der Satz sagt zweierlei (der Haken bucht Bestand ab; Zurücknehmen geht nur heute). Die Meldung ersetzt das Zurücknehmen am selben Tag nicht und muss die Buchung nennen. |
| D1-T3 | Mit Vorbehalt: siehe D1-I16. |
| D1-T4 | Umformulieren ja („konfiguriert“), die Kennzahl nicht verstecken. `TimeView.test.tsx:444–449` prüft den Wortlaut. |
| D1-T5 | Der Zusatz kann zwei weitere Glieder tragen („beides“, „24./31.12. ab 12 Uhr“); der Wert ist die Vereinigung, nicht die Summe. |
| D1-T6 | `Arbeitstag.test.tsx:214–230` und `m06Zeit.spec.ts:86` prüfen den Wortlaut. |
| D1-T7 | `Arbeitstag.test.tsx:129`. |
| D1-T8 | „(wird am Schein vorgeschlagen)“ schützt (der Kommentar geht auf den Kundenbeleg) — bleibt als Hinweis am Feld sichtbar, nicht in die Sammelhilfe. |
| D1-T9 | Das Datum ist der Zeitraum (Beginn, ggf. „– Ende“). |
| D1-T11 | Erst nach D1-C3. |
| D1-T12 | Die Kurzfassung behält „ohne Stunden geht auch“. |
| D1-T14 | Der Gesundheitssatz bleibt. |
| D1-T19 | Beide bleiben im Fenster. |
| D1-T20 | Ohne Legende ist das Zeichen des Feiertags unerklärt — der gewählte Tag zeigt den Namen. |
| D1-T21 | Wie D1-I14. |
| D1-T25 | Siehe D1-P1. |
| D1-P1 | Nicht in der Form des Papiers. Gebaut wird nach Regel 5 in Abschnitt 7.3: nur eine Form mit Platz für Zustand („verrechnet“, „Monat abgeschlossen“), Marke „KI“, Nacht-/Notdienstzeichen und die Knöpfe der Zeile, die bei 375 px nicht mehr Zeilen braucht als heute — gemessen an echten Tagen (eine bis zwei Buchungen je Tag) nach Paket 8; sonst bleibt die Zeile und steht in der Ausnahmeliste des Wächters. |
| D1-P2 | 88 px, drei Textzeilen bei langem Namen — wie heute, nicht schlechter. |
| D1-P3 | Teilnehmer, Notiz und Kartenverweis (48 px Tastfläche) bleiben in der Zeile. |
| D1-P4 | In der beschriebenen Form nicht bauen. Nach Regel 5 in Abschnitt 7.3: Umbau nur mit einer Form, die bei 375 px nicht mehr Zeilen braucht als heute; sonst bleibt die Zeile. |
| D1-P5 | Mit D1-T9. |
| D1-P6 | Weitere Glieder beachten (D1-T5). |
| D1-P7 | Die Pause bleibt im Bild (E-W1): links „07:00–16:30 · 30 min Pause“, rechts „09:00 Std“. |
| D1-P10 | In der beschriebenen Form nicht bauen. „knapp“ bleibt als Wort. Kein nackter Bestand direkt vor dem Kreis (dort erscheint nach dem Tipp die Mengensteuerung, E89). |
| D1-P16 | Das Lot im Streifen bleibt; der Vorlesetext nennt weiter „heute“. |
| D3-T18 | „Dafür zuerst die Baustelle wählen.“ begründet einen gesperrten Schalter — bleibt. |
| D3-P10 | „Lager: 4 Stk (knapp)“ bleibt als Angabe. |
| D4-T20 | Wie D1-T4: umformulieren, nicht verstecken. |
| D4-P6 | Passt bei 375 px knapp (272 px). |
| N-D1-1 | Mit D1-T4. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-11 | `htmlFor`-Bindung, Pflichtstern, wachsendes Textfeld. |
| D1-A2 | Löschen im Blatt erreichbar, dieselbe Rückfrage, Papierkorb an der Zeile ab Tablet, Wischen am Handy. |
| D1-A4 | fester Bezirksvorsatz, Vorschlagsliste der Fahrzeuge. |
| D1-A5 | Löschen erreichbar über Wischen und im Blatt; ab Tablet der Papierkorb an der Zeile. |
| D1-A6 | die Leiste verdeckt kein Feld (Platz am Seitenende mitrechnen). |
| D1-A9 | der Kreis in derselben Flucht wie bei Katalogartikeln (E74). |
| D1-B1 | jede der fünf Aktionen (Zeit, Schein, Anfordern, Nachricht, Anruf/Route) an jedem Einsatz, die großzügige Form ab Tablet. |
| D1-C3 | ein Tipp „Abschicken“ ohne Zwischenschritt für den, der nichts dazuschreiben will; „Eilzustellung“ wie heute. |
| D1-C4 | kein Abschluss ohne Unterschrift. |
| D1-C5 | Lesen ohne Pflicht zum Tippen; Rechte wie am Einsatz. |
| D1-C6 | der Monat als erste Ansicht, Blättern, Zahl der Einsätze je Tag. |
| D1-I8 | am iPhone gilt das Manifest nicht; Vorbehalt: Wirkung auf dem Tablet prüfen |
| D1-I14 | volles Datum im Gespräch |
| D1-I15 | Fußinsel ohne Tastatur; Vorbehalt: am Gerät prüfen |
| D1-I16 | Zurücknehmen nur am selben Tag |
| D3-P10 | Ein-Tipp-Kreis (E89), Reihenfolge |

**Prüfungen mit Gegenprobe:** die sieben Wege des Monteurs im Durchklick (Chromium, WebKit,
Tablet); „Abschicken“ liegt nach dem Tipp auf den Korb im Bild (heute bei y −25 bis 23 hinter der
Kopfinsel); nach dem Tipp auf einen Tag steht „Einsätze am …“ im Bild (heute bei y 846 von 844);
der gesperrte Knopf des Scheins nennt jede der acht Bedingungen; Vorlesetext der Zeitzeile nennt
weiter alle Angaben in derselben Reihenfolge (Prüfung wie G3 in `TimeView.test.tsx`). Bewusst
nachgezogen: `TimeView.test.tsx:1368`, `zeitVerlauf.spec.ts:59` (Löschen), `TimeView.test.tsx:444–449`,
`Arbeitstag.test.tsx:129, 214–230`, `m06Zeit.spec.ts:86` (Wortlaute).
**Bleibt gleich:** der Papierkorb an Berufsschulzeilen; die Notiz für die Projektleitung im Korb;
die Pause in „Wie zuletzt buchen“; „knapp“ als Wort; der Gesundheitssatz im Schein; der Hinweis
„(wird am Schein vorgeschlagen)“ am Feld; Wischen, Ziehen zum Aktualisieren; kein Start-Balken im
Gespräch; `blattKanten.test.ts`; Aufteilen bleibt am gespeicherten Eintrag (D1-C2 ist
zurückgestellt), Empfänger bleiben Personen (D1-C7 ist zurückgestellt).
**Risiko:** „bis wann“ im Korb ist ein neues Datenfeld (Migration, Sicht des Büros in
„Anforderungen“) — eigener PR nach Regel 12 und 14. **Aufwand:** 12–15 Tage.

#### Paket 15 — Rechnungen, Kontoauszug, Nachkalkulation

**Ziel:** „Rechnung stellen“ ist am Handy und Tablet bedienbar; Zahlen fluchten; nichts steht
doppelt.
**Punkte:** V-9, D3-1, D3-2, D3-3, D3-7, D3-8, D3-13, D3-B17, D3-B19, D3-C3, D3-C5, D3-C11, D3-T2, D3-T5, D3-T6, D3-T7, D3-T8, D3-T9, D3-T10, D3-T11, D3-T19, D3-P3, D3-P4, D3-P5, D3-P13. **Dazu Teile von:** V-3 (Stelle `/invoices`); V-8 (Positionstabelle in „Rechnung erstellen“); D3-B16 (Pfeil an der Kontoauszug-Zeile); D3-C13 (Baustelle und Kunde als Verweis im Rechnungsfenster).
**Voraussetzung:** Pakete 3 und 7 bis 12. Verdacht G-5 und L-5 geklärt (zweite Durchsicht).
Entscheidungen E-P, E-R9, E-R14, E-R15, E-R18, E-F21.
**Schritte:**

- **Rechnung stellen** (`InvoicesView.tsx`, `lot-rechnungen.css`): Positionen bis 1.199 px als
  gestapelte Zeilen, Summen als Block (D3-1); Felder 16 px (D3-2); Beträge in Mono auf einer
  Flucht, Tabellenkopf in der Rolle (D3-3, V-8 Teil); eine gefüllte Hauptaktion, die schwebende
  „Neue Rechnung“ verdeckt das offene Formular nicht (D3-13); Formularbreite (D3-B19); Enter und
  Strg+Enter (D3-C11); Texte (D3-T2, D3-T5). **Die Anordnung der Seite bleibt** (D3-C1 und D3-C2
  sind zurückgestellt); der Zahlungsblock bleibt mit festen Zeilen (D3-T4 ist widerlegt). Wer eine
  Stundenposition aus der Vorschau entfernt, bekommt an der Stelle den Hinweis, dass die Stunden
  damit ohne Betrag verrechnet sind (E-F21).
- **Rechnungsliste, Rechnungsfenster, Zahlungsdialog, Mahnlauf, Export, E-Rechnung:**
  Beschriftungen 13 px (V-9); doppelte Angaben (D3-T6, D3-T7, D3-T8, D3-T9); Rechnungszeile
  (D3-P3); Kopf des Zahlungsdialogs als Kennwerte (D3-P4); Export mit Segmenten (D3-C5, D3-P5);
  im Mahnlauf wird „Kundenart fehlt“ ein eigener Zustand. Die Karten „Nicht verrechnet“ und
  „Mahnlauf“ behalten ihre Breite und Zeilenform (E98).
- **Kontoauszug** (`KontoauszugView.tsx`): Zustand und Betrag fluchten (D3-7); „Abbuchung
  anzeigen“ auf der Flucht (D3-8); Datei per Ablegen (D3-C3); Blatt „Datei“ (D3-T10, D3-P13);
  Zeile (D3-T11, D3-B17, D3-B16 Teil).
- **Nachkalkulation:** Wiederholungen je Zeile (D3-T19).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-9 | Teil Einsatz-Vorschau in Paket 17. |
| D3-1 | Handy: gestapelte Zeile, Summen als Block. Der Tablet-Vorschlag des Papiers reicht nicht (634,6 px in 624 px) — dieselbe gestapelte Form bis 1.199 px oder schmälere Felder nachmessen. `position-preis-fehlt` hält keine Prüfung fest — eigene Prüfung „bleibt gleich“. Fehlt im Papier: Titel-/Textzeilen (`colSpan 5`), Rabatthinweis „(aus dem Angebot)“. |
| D3-2 | Nur die Schriftgröße ändern. Wächter-Selektor um `.position-*` ergänzen (`schriftskala.test.ts:87`), sonst kommt es wieder. Die 15 px sind im Stil als Absicht beschrieben, ohne Entscheidung. |
| D3-3 | „Bleibt gleich“: alle Zeilen des `tfoot` (Zwischensumme, Rabatt, Netto, „Übergang der Steuerschuld“, „Gesamtleistung brutto“, „abzüglich …“, „Restforderung brutto“, „Rechnungsbetrag“); Prüfungen suchen diese Wörter (`InvoicesView.test.tsx:1206, 3698–3769`). |
| D3-7 | Einfacher und ohne Wirkung auf die fünf Verwender des Bausteins: `zeile-zahlen-betrag` wie in der Rechnungsliste und ein Platzhalter in Kästchenbreite. |
| D3-13 | Umbenennen nur mit Liste in `v10-entfernt.json`: „Positionen zusammenstellen“ suchen 28, „Neue Rechnung“ 35 Prüfungen. Teil Lager in Paket 16. |
| D3-C3 | Gebaut wird nur „Datei per Ablegen“. Der Einstieg bleibt im ⋯ (einen Zweitknopf im Seitenkopf einer Liste kennt `PageHeader` nicht; E-R18); die Zeile bleibt, wie D3-T11 sie verlangt. |
| D3-C5 | Drei Dateien sind nur mit Daten sichtbar. |
| D3-C11 | Enter fügt weiter keinen Zeilenwechsel ein (`WachsendesTextfeld.tsx:59`, geprüft). Strg+Enter stellt unumkehrbar aus — nur bei Fokus im Formular und mit denselben Sperren. |
| D3-T2 | Die Nummer ist noch nicht vergeben; als Stempel sähe sie vergeben aus. Bei der ersten Rechnung steht hier ein Eingabefeld. |
| D3-T5 | Kürzen, nicht streichen. Die Texte hängen an der Rolle: eine Zeile „Fehlt: … ›“ führte die Buchhaltung auf „Kein Zugriff“. |
| D3-T6 | Der Kopf ist jung und gewollt (V10, Auftrag 11.5). Fällt „Offen“ im Kopf weg, braucht „fällig …“ einen Ort. |
| D3-T7 | Nur eines von beiden streichen — sonst fehlt jede Aussage, dass nichts eingegangen ist. |
| D3-T8 | Nur die erste Hälfte ist entbehrlich; „versendet wird er von dir“ sagt, dass nichts hinausgeht. |
| D3-T9 | Hilfe im Dialog heißt `InfoHint` im Dialog. |
| D3-T10 | Konto, Zeitraum, „Nicht abgeglichen: …“ und die Warnung zu unlesbaren Zeilen bleiben offen; „Erkannt: …“ ist die einzige Kontrolle der Spaltenzuordnung. |
| D3-T11 | In der Zeile bleiben: Kunde der Rechnung (der sichtbare Schutz gegen G-1), die Aufteilung bei mehr als einem Teil, Skonto, Mahnkosten. |
| D3-T19 | „Zwischenstand“ bleibt an der Zahl im Fenster. |
| D3-P3 | Für das Tablet (gestapelte Zeile) eine Form nach Regel 5 in Abschnitt 7.3. Das Rechnungsdatum bleibt am Handy in der Zeile (E-W1). |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-9 | Zweispaltigkeit Beschriftung links, Wert rechts; Beträge in Mono. |
| D3-1 | alle sechs Spalten am Schreibtisch, Reihenfolge der Felder beim Tabben, die Preisfehler- Markierung (`position-preis-fehlt`). Rückschritt merkt man an: `document.scrollWidth` oder die Hülle breiter als ihr Inhalt; Summen auf 390 px nicht im Bild. |
| D3-2 | Zeilenhöhe der Tabelle am Schreibtisch (44 px je Feld darf bleiben), rechtsbündige Zahlen. Rückschritt: Zahl im Feld angeschnitten. |
| D3-3 | die Werte selbst, „USt. 20 %“, das Rot der Abzüge. Rückschritt: rechte Kanten der vier Beträge ungleich. |
| D3-7 | Kästchen nur, wo verbucht werden kann; Tipp auf die Zeile öffnet „Zuordnung“. |
| D3-8 | zugeklappt als Vorgabe. |
| D3-13 | der Weg `?neu=`, „Neue Rechnung“ bei geschlossenem Formular an derselben Stelle. |
| D3-C3 | Vorwahl nur bei „Zugeordnet“, Rückfrage vor dem Verbuchen, ⋯-Eintrag bleibt. Rückschritt: Grund der Zuordnung nicht mehr auffindbar |
| D3-C5 | freie Daten, die drei Dateien und ihre Namen |
| D3-C11 | Enter im mehrzeiligen Bezeichnungsfeld bleibt Zeilenumbruch |
| D3-P3 | Stempel, Zustand, Betrag rechts |
| D3-P4 | beide Beträge, wenn sie sich unterscheiden |
| D3-P5 | Zahlen und Reihenfolge |
| D3-P13 | – |

**Prüfungen mit Gegenprobe:** die Positionstabelle läuft bei 390 und 834 px nicht mehr aus dem
Blatt, die Summen sind im Bild (heute 674,6 px in 326 bzw. 624 px); eigene Prüfung für
`position-preis-fehlt`; `schriftskala.test.ts` erfasst `.position-*`; `InvoicesView.test.tsx`
(371 Fälle), `rechnungStellen.spec.ts`, `eRechnung.spec.ts`, `bewegungen.spec.ts`; die neuen
WebKit-Wege aus Paket 12.
**Bleibt gleich:** jede Rechnungsart, jeder Steuerfall, die zwölf Sperrgründe und fünf Warnungen;
alle Zeilen des `tfoot`; „Vorschau“ als Wort; Leistungszeitraum und Konditionen vor den
Positionen; `rechnung_anlegen` in der Fassung aus Paket 3; PDFs Byte für Byte; Kunde der Rechnung,
Aufteilung, Skonto und Mahnkosten in der Kontoauszug-Zeile; „Erkannt: …“ im Blatt „Datei“; der
Einstieg in den Kontoauszug im ⋯; „Mahnung erzeugen“ mit Blick auf Empfänger und Text; das
Rechnungsdatum in der Zeile am Handy; Enter fügt keinen Zeilenwechsel ein.
**Risiko:** die Ansicht mit dem meisten Geld und den meisten Prüfungen, die Knöpfe beim Namen
suchen. **Aufwand:** 12–15 Tage.

#### Paket 16 — Material im Büro: Lager, Katalog, Anforderungen

**Ziel:** Zustände sind lesbar, Zeilen öffnen erkennbar, nichts läuft über die Blattkante.
**Punkte:** D3-10, D3-12, D3-14, D3-16, D3-B14, D3-B16, D3-B18, D3-C7, D3-C8, D3-C13, D3-T12, D3-T13, D3-T14, D3-T15, D3-T17, D3-T20, D3-P6, D3-P7, D3-P11. **Dazu Teile von:** D3-13 (Lager: „Wareneingang“ neben „… Artikel übernehmen“); V-11 (`KatalogImport.tsx:439`).
**Voraussetzung:** Pakete 1, 6 und 8 bis 11. Entscheidung E-P.
**Schritte:**

- **Anforderungen** (`AdminOrdersView.tsx`): Zustand mit Auslassung, der volle Name im Fenster
  (D3-10); überfälliger Liefertermin mit Zeichen (D3-16); Filter und Suche im Blatt (D3-B14);
  Pfeil an der Zeile (D3-B16); „4 Stk frei“ in Zeile und Fenster, „Auf die Einkaufsliste“ als
  Zweitknopf (D3-C7); „Material anfordern“ im Seitenkopf (D3-C13); Zeilen und Texte (D3-P7,
  D3-T17).
- **Lager und Katalog** (`StockView.tsx`, `MaterialCatalog.tsx`): Warnzeichen mit Wort, Menge in
  Mono (D3-14); Kennzahlen nur im Reiter „Lager“ (D3-T12); Nullwerte (D3-T13); Erklärsätze
  (D3-T14, D3-T15); Zeile (D3-P6); „Nachbestellen“ im ⋯ (D3-C13).
- **Katalog einspielen** (`KatalogImport.tsx`): Abschluss im Blatt, Hauptaktion rechts (D3-12);
  feste Schrittzeile, Vorschau ab Tablet als Tabelle mit „Einheit weicht ab“ (D3-C8, D3-P11);
  Kennzahl (D3-B18); Zählzeile (D3-T20).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| D3-10 | Der volle Name steht im Fenster nicht — ohne diese Ergänzung wäre `truncate` ein Verlust. |
| D3-16 | Teil Einkaufsliste in Paket 25. |
| D3-B16 | Teil Kontoauszug in Paket 15. |
| D3-C7 | Bestand gibt es je Lagerort — „frei“ braucht den Ort. Erst nach Paket 1 (`anforderungen_laufend`) und Paket 6 (M-11, M-13). |
| D3-C8 | Die Vorschau nimmt M-3 auf („Einheit weicht ab“); nach Paket 6. Handyform siehe D3-P11. |
| D3-C13 | Entschieden (E-F32): „Material anfordern“ kommt in den Seitenkopf der Anforderungen. „Nachbestellen“ ins ⋯ (ein dritter Knopf ginge gegen U4). Die Verweise auf Baustelle und Kunde im Rechnungsfenster gehören zu Paket 15. Rechte je Rolle bleiben. |
| D3-T12 | Der Kopf springt beim Reiterwechsel in der Höhe. |
| D3-T14 | „* Pflichtfeld“ ist der Baustein `Pflichthinweis` — bleibt. |
| D3-T15 | Wie D3-T9. |
| D3-P6 | Der Stempel bleibt hinter einem langen Namen sichtbar (geprüft bei 375 px). |
| D3-P7 | Am Handy drei Zeilen. |
| D3-P11 | Am Handy keine Tabelle. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D3-12 | Fortschrittsanzeige darunter, „Weiter übernehmen“ nach Abbruch. |
| D3-C7 | Sammelleiste, Teilmenge, Rückfrage bei Fehlbestand |
| D3-C8 | Lauf verwerfen, Fortsetzen, „Offene zuordnen“ |
| D3-C13 | Rechte je Rolle |
| D3-P6 | Suche nach Nummer; Maßlinie im Bestand |
| D3-P7 | Kästchen, Schrittknopf, Gruppenachse |
| D3-P11 | Zahl der Vorschauzeilen |

**Prüfungen mit Gegenprobe:** Zustand bei einem Großhändlernamen mit 46 Zeichen bei 390 px: im
Blatt, mit Auslassung, voller Name im Fenster (heute 50 px abgeschnitten); `bewegungen.spec.ts:1041 ff.`;
`AdminOrdersView.test.tsx`, `StockView.test.tsx`.
**Bleibt gleich:** die Regel der Arbeitszeile am Handy (`lot.css:207`); „* Pflichtfeld“;
„Lager: 4 Stk (knapp)“; die Preise des Katalogs hinter „Weitere Angaben“ (D3-C9 ist
zurückgestellt). **Risiko:** gering bis mittel. **Aufwand:** 6–8 Tage.

#### Paket 17 — Planung: Woche, Monat, Tag und ihre Fenster

**Ziel:** Planen am Handy und Tablet zeigt zuerst den Bestand; Verschieben ist auffindbar; der
Monat ist unter 1.200 px mit dem Finger bedienbar.
**Punkte:** P-11, D4-A1, D4-A2, D4-A8, D4-A10, D4-A14, D4-B6, D4-B13, D4-C2, D4-T6, D4-T7, D4-T12, D4-T14, D4-P4, D4-P5, D4-P9, N-D4-2. **Dazu Teile von:** V-3 (Stelle `/assignments/tag`); V-9 (Einsatz-Vorschau im Monat); D4-A11 und D4-T21 (Tag-Fenster); D4-C1 (c) (Fenster „Einsatz bearbeiten“ in Abschnitten); D4-P12 (Rüstlistenzeile „Lager: 4 · Rohrleitungen“).
**Voraussetzung:** Pakete 8 bis 11 (Fuß und Ungespeichertes aus Paket 9). Verdacht P-5 geklärt.
Entscheidungen E-M, E-N, E-R8, E-F9, E-V5.
**Schritte:**

- **Tag-Planung am Handy** (`AssignmentsView.tsx`): Bestand zuerst, „Einsatz planen“ als Blatt
  (D4-A1); Datum nur einmal in den Titeln (D4-T14); Abstand der Blätter (V-3 Teil).
- **Fenster „Einsatz bearbeiten“** (`EinsatzFormular.tsx`, `EinsatzFenster.tsx`): Fuß in einer
  Zeile (D4-A2); „Verschieben …“, „Auf … kopieren“, „Entfernen …“ im ⋯, das Feld heißt „Tag
  ansehen“ (D4-C2); Fenster in Abschnitten (D4-C1 Teil c); Rüstliste (D4-A14, D4-T7, D4-P12
  Teil); Hinweise (D4-T6); Unterzeile (D4-P9).
- **Woche und Monat** (`WochenRaster.tsx`): Ansichtswahl als zwei erkennbare Gruppen (D4-B6);
  Pfeiltasten im Raster (D4-C2); Monat unter 1.200 px seitlich rollend mit Spalten ab 44 px
  (D4-A10); zwei Baustellen desselben Kunden am selben Tag bleiben unterscheidbar (N-D4-2);
  Uhrzeit je Person (P-11); Termin-Kachel (D4-T12); Beschriftungen der Einsatz-Vorschau (V-9 Teil).
- **Termine und Tag-Fenster** (`TerminFormular.tsx`): „Bis“ neben „Von“ (D4-A8); Termin öffnet
  überall auf dieselbe Art (D4-B13); Zeilen (D4-P4, D4-P5, D4-A11 Teil, D4-T21 Teil).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| P-11 | Breite am Handy im Bild prüfen. |
| D4-A1 | `EinsatzFenster` wählt den Tag nur unter den geladenen Tagen und trägt „Ganzen Tag ansehen“ (auf der Tag-Seite ein Kreis). Bleibt: jeder beliebige Tag aus dem Kalender der Tag-Seite planbar; die Sprünge „In ‚Tag‘ öffnen“ und „Bearbeiten“ aus der Einsatz-Vorschau öffnen am Handy das Blatt mit gewählter Baustelle; die Rüstliste im Blatt. Den Wächter erst nach Prüfung auf Falschtreffer um „planen“ erweitern (Tag-Fenster, Woche, Startseite laufen dann darüber). |
| D4-A2 | Der lange Name steht auch in „Einsatz planen“, sobald eine Baustelle gewählt ist. Die Meldung „Einsatz und Rüstliste gespeichert“ bleibt; Prüfungen und Funktionsinventar suchen den Knopf beim Namen. 390 px nicht gemessen. |
| D4-A10 | Entschieden (E-M): unter 1.200 px rollt der Monat seitlich mit Spalten ab 44 px. Bleibt: Monat als Personen × Tage, Vorschau je Tag und je Einsatz („Vorheriger/Nächster Tag“), ganzer Monat ohne Rollen ab 1.200 px. `rand.spec.ts` nimmt das Monatsraster heute aus (E88) — die Ausnahme gilt danach nur noch ab 1.200 px. |
| D4-A14 | Bleibt: der Zustand „frei“/„Bestand unbekannt“ an der Zeile und die Deutung „fehlt“ gegen offene Anforderungen. |
| D4-B6 | Gemerkte Ansicht und Unteradressen bleiben. |
| D4-C2 | Das Feld verschiebt nichts: „Verschieben …“, „Auf … kopieren“, „Entfernen …“ ins ⋯ des Fensters (öffnet `VerschiebenFenster`, das die Rüstliste mitnimmt); das Feld heißt „Tag ansehen“ oder entfällt — in „Einsatz planen“ bleibt es. Pfeiltasten im Raster nach dem Muster des Monatsrasters. |
| D4-T6 | Der zweite bleibt (er trägt das Überschreiben). |
| D4-T12 | Die dritte Zeile ist der Ort des Termins — nur weglassen, wenn er der Baustelle gleicht. |
| D4-P4 | Nicht für die Wochenkachel (86 + 57 px passen nicht in 120 px) — dort bleibt es gestapelt. |
| D4-P5 | Nicht für die Kachel. |
| D4-P9 | Der Titel bricht bei 375 px um — nicht schlechter als heute. |
| N-D4-2 | Steht derselbe Kundenname am selben Tag in einer Zeile zweimal, zeigt die Kachel auch unter 1.200 px die Kurzbezeichnung, sonst die Nummer. Sonst bleibt die Kachel, wie sie ist (E-R8). |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D4-A1 | ab 760 px das Formular neben dem Kalender; `?datum=`/`?baustelle=`-Adressen aus Woche und Startseite; Rüstliste im Formular. Rückschritt: wenn „In ‚Tag‘ öffnen“ aus dem Tag-Fenster am Handy nicht mehr mit vorgewählter Baustelle ankommt. |
| D4-A2 | Speichern schreibt Einsatz und Rüstliste wie bisher; „Ganzen Tag ansehen“ bleibt. Rückschritt: wenn der Fuß bei 390 px wieder umbricht (Prüfung: Fußhöhe ≤ 80 px auf drei Breiten). |
| D4-A8 | Uhrzeit entfernen“. Rückschritt: keiner. |
| D4-A10 | ab 1 200 px der ganze Monat ohne Rollen; Balken über mehrere Tage; Vorschau-Fenster. Rückschritt: wenn am Tablet nicht mehr der ganze Monat auf einen Blick steht — deshalb vor dem Bau entscheiden lassen. |
| D4-A14 | Menge direkt eingeben, Löschen, Bestand je Lagerort. Rückschritt: `RuestlistePlanen`-Tests (Menge, Deckung). |

**Prüfungen mit Gegenprobe:** Tag-Planung bei 390 px: die Einsätze des Tags stehen vor dem
Formular (heute ab y 2.310); `bedienregeln.test.ts` erkennt den Titel „Einsatz planen — …“ (erst
nach Prüfung auf Falschtreffer); Monat bei 834 px: jede Tastfläche mindestens 44 px breit (heute
18 px); zwei Kacheln desselben Kunden am selben Tag tragen bei 834 px verschiedenen Text.
**Bleibt gleich:** `einsatzbalken.test.ts` (E96: „Text an derselben Stelle“; Monatsbalken mit
Markierung); der Kundenname in der Kachel wird nicht gekürzt; der Vorlesetext mit Nummer
(`WochenEintraege.tsx:131`); Konfliktzeile, Material-Zustand, Zusatz „Lieferung 08:00–10:00“;
Ziehen mit Maus und Finger; „Noch einzuplanen“ (E96); Vorschau je Tag und je Einsatz im Monat;
ganzer Monat ohne Rollen ab 1.200 px; der runde Kreis im Tagesfenster und in der Handy-Woche
(E76); die vier Kalender bleiben vier Umsetzungen; die Kalendertage am Handy bleiben 41 px breit
(benannte Ausnahme); in „Einsatz planen“ wählt das Feld „Tag“ weiter den Tag.
**Risiko:** der Monat unter 1.200 px bekommt ein neues Rollverhalten — am Tablet im Bild und mit
dem Finger prüfen. **Aufwand:** 8–10 Tage.

#### Paket 18 — Aufträge: Kunden, Baustellen, Liegenschaften, Eingang, Angebote, Scheine, Wartungen

**Ziel:** Die Akten sind gleich gebaut, Formulare haben ihren Fuß im Bild, Listen sind am Handy
kürzer, der nächste Schritt steht in der Meldung.
**Punkte:** A-12, V-12, D1-T15, D1-P14, D2-A4, D2-A7, D2-A8, D2-A10, D2-A11, D2-A12, D2-A13, D2-A15, D2-A17, D2-A18, D2-A19, D2-A20, D2-B1, D2-B2, D2-B7, D2-B8, D2-B9, D2-B11, D2-C1, D2-C2, D2-C3, D2-C4, D2-C5, D2-C6, D2-C9, D2-C10, D2-C13, D2-C14, D2-I2, D2-I3, D2-I4, D2-I5, D2-I7, D2-I9, D2-I10, D2-I11, D2-I13, D2-T2, D2-T3, D2-T4, D2-T6, D2-T8, D2-T9, D2-T10, D2-T11, D2-T12, D2-T14, D2-T17, D2-T18, D2-T19, D2-P1, D2-P4, D2-P5, D2-P6, D2-P7, D2-P8, D2-P9. **Dazu Teile von:** D1-P4 (Stelle Scheinliste); V-11 („Notiz“ in „Kunde bearbeiten“).
**Voraussetzung:** Pakete 8 bis 11. Entscheidungen E-P, E-T, E-R1, E-R3, E-R4, E-R13, E-F24,
E-F25, E-F29, E-W1. D2-C13 wartet auf die Kanzlei (K-8).
**Schritte:**

- **Akten** (`KundenakteView.tsx`, `BaustellenakteView.tsx`, `LiegenschaftView.tsx`): die
  Liegenschaftsakte bekommt `AktenKopf` und Kontextspalte und lädt vollständig nach (D2-B1,
  D2-A18, Grenze 16 in 4.10); Kennwerte im Kopf der Kundenakte (D2-C4, D2-I2); Reiter „Belege“
  mit der Belegzeile aus E99 (D2-A7); der Schein öffnet lesend im Fenster der Akte (D2-B9); Team
  an der Akte ändern (D2-C3, D2-I11); „Bearbeiten“ in Abschnitten mit Sprungleiste (D2-I13);
  Baustelle im ⋯ der Akte löschen (D2-B7); Übersicht am Handy in anderer Reihenfolge (D2-I10);
  Texte der Akten (D2-T8, D2-T9, D2-T10, D2-T11, D2-T12); Name und Telefon als zwei Angaben
  (D2-P6, nach D2-A6); Zeile bleibt markiert, solange ihr Fenster offen ist (D2-I7).
- **Formulare:** „Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“, „Kunde bearbeiten“ mit Fuß im
  Bild (D2-A20); ein Formular für „Kunde bearbeiten“ (D2-B2); Vorschläge statt Vorbelegung der
  Baustellenadresse (D2-C5); Beschriftungen aus dem Baustein (V-11 Teil).
- **Listen** (Baustellen, Wartungen, Angebote, Eingang, Scheine): Pfeil bzw. Stift nach E-F25
  (D2-A8); kürzere Zeilen (D2-C9, D2-T2, D2-T3, D2-T19, D2-P1, D2-P4, D2-P5, D2-P8, D2-P9); feste
  Spalten der Angebotsliste ab dem Schreibtisch (D2-A12); Kartentitel über den Segmenten (D2-B8,
  D2-T4); Kleinigkeiten (D2-B11); Knöpfe in einer Größe (D2-A19); Nummern ohne Umbruch (D2-A17);
  Tablet (D2-A13); Scheinliste (D2-C10, D2-T6, D1-T15, D1-P14); Verweis zum Papierkorb (D2-C14).
- **Angebote** (`QuotesView.tsx`, `AngebotView.tsx`): Formular als Arbeitsbereich mit zwei Zonen
  am Schreibtisch, Enter legt die nächste Position an (D2-C2, D2-I4, D2-I5, D2-A11, D2-P7);
  Überdeckung am Handy (D2-A10); Schritte an der angenommenen Akte und Eingang → Formular (A-12);
  Fenster „Annahme-Link“ (D2-T14).
- **Kundenseite der Annahme** (`AngebotAnnahmeSeite.tsx`): „Als PDF“ schwebt nicht über dem
  Unterschriftsfeld (D2-A15); doppelte Angaben (D2-T17). Die Reihenfolge „lesen vor
  unterschreiben“ (D2-C13) wartet auf die Kanzlei.
- **Wartungen** (`WartungenView.tsx`): „Einplanen“ als Wort (D2-C6); „Eintragen“ nicht rot
  (D2-A4); Titel im Fenster (V-12).
- **Eingang** (`EingaengeView.tsx`, `EingangView.tsx`): Reihenfolge der Felder (D2-C1); Verlauf
  (D2-T18).
- **Der nächste Schritt** nach der Regel in 6.5 (D2-I3, D2-I9).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| A-12 | Ins Formular nur bei neuem Angebot bzw. Entwurf; meldet `eingangZuAngebot` „gab es schon“ und ist das Angebot kein Entwurf mehr, wie heute auf die Akte. Die Schritte an der angenommenen Akte („Zur Baustelle“, „Einsatz planen“, „Anzahlung stellen“) gehören dazu. Ein PR mit A-17 und D2-A10. |
| V-12 | `text-lg` an `RowMenu.tsx:171`, `IconButton.tsx:44` (Zeichengröße) und am Startpasswort ist gewollt — nicht in die Titelrolle zwingen. |
| D2-A4 | Im Wächter „Verwerfen“ nicht in die Liste der roten Wörter aufnehmen (trägt bewusst `primary`, der Papierkorb ist umkehrbar). |
| D2-A7 | Mit D2-P2 abstimmen (dieselbe Zeile) — einmal umbauen. |
| D2-A8 | Entschieden (E-F25): Zeilen, die ein Lesefenster oder eine Akte öffnen, bekommen den Pfeil (E99); die Top-Zeile öffnet das Änderungsformular und bekommt den Stift (E74). |
| D2-A10 | Gebaut wird nur die Überdeckung am Handy (die schwebende Aktion verdeckt ein Viertel von „Annehmen → Baustelle“). Hauptaktion, Verlauf und das zweite ⋯ bleiben, wie am 15.11. gebaut (E-R4). Bleibt: Meldung mit „Rückgängig“ (F15), `leerNichtAnnehmen`, „Wiederherstellen“ im Papierkorb-Stand. |
| D2-A11 | Vorbild ist die Belegzeile (`small` 12 px), nicht die Baustellenliste (13 px). |
| D2-A12 | Am Handy darf der Stand nicht entfallen. |
| D2-A13 | Teil „Suchfeld eingerückt“ ist eine Regel am Baustein (`lot.css:592`) und gehört zu Paket 9. Die Form D2-P2 löst den Umbruch am Tablet nicht in einer Zeile — dort die zweizeilige Handyform. |
| D2-A15 | Bleibt: die Stände „neuere Fassung“ und „ungültig“ haben keine Aktion. |
| D2-A17 | `OhneUmbruch` behebt es. |
| D2-A18 | Teil (b) ändert `PageHeader` für alle Seiten (E31) — nur zusammen mit dem Kopf-Baustein. |
| D2-A20 | Trägt nur sinngemäß U1 Muster 3. Die `Speicherleiste` der Akten bleibt. |
| D2-B1 | Die Liegenschaftsakte bekommt `AktenKopf` und Kontextspalte. Der Stempel der Baustellenakte bleibt, wo E99 ihn festgelegt hat (E-R3). Das Modul „Liegenschaften und Tops“ ist schaltbar; die Prüfung braucht die Attrappen aus Paket 8. |
| D2-B2 | Beide Feldlisten prüfen. |
| D2-B7 | U4 regelt den Fensterfuß, nicht die Zeile. Gebaut wird nur: Baustelle im ⋯ der Akte löschen, mit derselben Prüfung wie in der Liste (`loeschWegJetzt`). Die Tonne am Termin bleibt (E74, E-R1); die Karte „Datenschutz“ der Kundenakte bleibt, wo sie ist. |
| D2-B8 | Ohne Kartentitel fällt die Karte aus `flucht.spec.ts` — Prüfung mitziehen. |
| D2-B9 | In der Akte dieselbe Trennung wie bei der Rechnung: Lesen und PDF in der Akte, Schreiben auf der Fachseite. |
| D2-B11 | Die Reihenfolge in „Neue Baustelle“ nicht umdrehen. „Ein Weg“ am Listenende darf den Satz von `Nachladen` nicht verlieren (D2-T7). |
| D2-C1 | Entschieden (E-F24): „Quelle“ bleibt Pflicht ohne Vorgabe — eine Vorgabe machte aus jedem nicht umgestellten Mail-Eingang still „Telefon“. Nach „Baustelle anlegen“ führt die App schon in die Baustellenakte. |
| D2-C2 | Geklärt: die Rückfrage sperrt „Annehmen“ am leeren Entwurf, die Datenbank weist Versand und Link ohne Position ab. |
| D2-C3 | Der Schritt in der Meldung ist gewollt. |
| D2-C4 | Siehe D2-I2 (Grenze 500, Rechte). |
| D2-C5 | Die Regel „nach Kundenart“ greift nicht, solange die Kundenart fehlt (nach einem Import die Regel). `LiegenschaftVorschlaege` gibt es in „Neue Baustelle“ schon. |
| D2-C6 | Bleibt: `naechsterSchritt` prüft Rolle und Modul. |
| D2-C10 | Siehe D2-T6. |
| D2-C13 | Rechtlich berührt (Reihenfolge einer verbindlichen Erklärung): wartet auf die Kanzlei (K-8) und gilt nicht als entschieden. |
| D2-C14 | Offen ist nur der Verweis aus der Liste. |
| D2-I2 | Die Summe in der Datenbank rechnen; die Zelle weglassen, wo Recht oder Modul fehlen (nicht „€ 0“). |
| D2-I3 | Anbieten, nicht wegführen: aus der Liste angenommen wirft der Sprung aus der Arbeit; „Rückgängig“ (F15) muss den Seitenwechsel überleben. |
| D2-I4 | Das Tablet (760–1199 px) braucht eine eigene Aussage. |
| D2-I5 | Enter heißt in anderen Formularen „anlegen“ — im Handbuch nennen. |
| D2-I9 | „Einsatz planen ›“ im Leersatz der Baustellenakte wäre die Hauptaktion ein zweites Mal (U3). |
| D2-I10 | Nur als Reihenfolge am Handy, kein Zusammenlegen: E99 hat die leeren Karten „Nachrichten“ und „Einsätze“ bewusst gelassen (sie tragen den nächsten Schritt). Die vorgeschlagene Zeile mit zwei Punkten verstieße gegen die Punktregel. |
| D2-I11 | Denselben Formularabschnitt wiederverwenden (sonst zweites Formular wie D2-B2); Warnung „ohne Projektleitung“ mitnehmen. |
| D2-I13 | Die vier Abschnitte gibt es als Überschriften; D2-A2 zuerst. |
| D2-T4 | Wie D2-B8. |
| D2-T6 | Zugeklappt darf der Satz nicht mehr behaupten, als geprüft wurde — den Bereich in die Summenzeile nehmen. |
| D2-T8 | Aufklapper als `InfoHint`/`einzelheiten`, keine neue Form. |
| D2-T9 | Tastfläche des Verweises (E72). |
| D2-T11 | „Adresse und Kontakt ›“ springt auf den Kontext — fehlen sie dort, zeigt der Verweis ins Leere, und der Kartenverweis stünde am Handy nirgends mehr. Beides bleibt erreichbar. |
| D2-T12 | „(ohne Baustelle)“ bleibt. |
| D2-T14 | Hinter ein „i“ darf nur der Ruhetext; die Grundlage der Entscheidung bleibt offen (U9). |
| D2-T17 | Öffentliche Seite mit Rechtsfolge — die Fristangabe bleibt im Schriftfeld sichtbar, auch am Handy. |
| D2-T18 | Die zweite Fassung bleibt: „Ohne Kunden — bitte einen wählen, bevor er übernommen wird.“ |
| D2-T19 | „abgelaufen“ nur dort weglassen, wo die Liste wirklich gruppiert ist. |
| D2-P1 | Handy: Name allein in Zeile 1, Zustand und Stempel darunter. Spaltenform erst ab dem Schreibtisch. Messung auf 375 und 834 px ist Bedingung. |
| D2-P4 | Das Datum bleibt Schlüssel (E91). |
| D2-P5 | Zustand und ⋯ bleiben in der Zeile (die Gruppe sagt den Stand nicht). Für 760–1199 px fehlt eine Form — vor dem Bau festlegen. |
| D2-P6 | D2-A6 zuerst, sonst entsteht der Höhenfehler an neuen Stellen. |
| D2-P8 | Seitenkopf: siehe D2-T5. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D2-A4 | die Felder der Rückfrage, „Nächster Termin: …“, der Ablauf. Rückschritt: eine Lösch-Rückfrage wird versehentlich petrol. |
| D2-A7 | Sortierung, die Baustellennummer je Rechnung, Rechnung öffnet das Fenster, Angebot führt in die Angebotsakte. Rückschritt: die Baustellennummer fehlt. |
| D2-A8 | ganze Zeile bleibt das Ziel; „Erledigt“ und „Baustelle anlegen“ bleiben mit höchstens einem Tipp mehr erreichbar (sie stehen heute schon zusätzlich im Fenster). Rückschritt: eine Aktion ist nur noch über zwei Fenster erreichbar. |
| D2-A10 | jede heutige Aktion bleibt erreichbar, höchstens ein Tipp mehr für „Annahme-Link“; die Hinweise im Verlauf („Noch ohne Position …“, „Die Fassung … ist schon angenommen“); die Buchhaltung sieht weiter nur „PDF herunterladen“. Rückschritt: „PDF herunterladen“ … (weiter im Papier) |
| D2-A11 | netto und brutto bleiben in der Liste unterscheidbar. Rückschritt: Zeile wird höher. |
| D2-A12 | Annehmen → Baustelle“ aus der Liste in höchstens zwei Tipps (⋯ → Annehmen; am Handy ist es für den Entwurf heute schon so). Rückschritt: Annehmen braucht drei Tipps. |
| D2-A13 | Schreibtisch und Handy unverändert. Rückschritt: am Schreibtisch rutscht das Suchfeld unter die Segmente. |
| D2-A15 | PDF bleibt ohne Annahme ladbar, auch nach der Entscheidung. Rückschritt: der Knopf fehlt im Stand „angenommen“. |
| D2-A18 | drei feste Zeilen des Kopfs ab dem Tablet (E31), Tastflächen 44 px, die Insel oben zeigt beim Rollen weiter den Namen. Rückschritt: Hilfe oder ⋯ rutschen am Schreibtisch aus der Titelzeile. |
| D2-A20 | Enter im Namensfeld legt weiter an (gemessen: „Kunde angelegt“), „* Pflichtfeld“ bleibt sichtbar, am Handy verdeckt der Fuß kein Feld über der Tastatur. Rückschritt: letztes Feld hinter dem Fuß nicht erreichbar. |
| D2-B1 | Reiter-Adressen (`?bereich=`), alle Fenster der Tops und Beteiligten, das ⋯ mit „Neu …“. Rückschritt: ein Lesezeichen auf einen Reiter öffnet den falschen. |
| D2-B2 | Bearbeiten ohne Umweg aus der Liste; „Löschen“ im Zeilen-⋯. Rückschritt: Verlust eines Felds (beide Feldlisten sind gleich lang — 13 Felder — das prüfen). |
| D2-B7 | die Probe vor dem Löschen einer Person (Datenauskunft) und alle Sperrgründe; Löschen aus der Liste bleibt. Rückschritt: Löschen einer Baustelle ohne die heutige Prüfung. |
| D2-B8 | der Name der Liste für die Vorlesehilfe (`aria-label` an der Liste). |
| D2-B9 | die Adresse `/worksheets?…`, über die der Schein verlinkt ist; „Weiterbearbeiten“ führt weiter in den Schein. Rückschritt: der Rückweg aus dem Schein landet nicht mehr in der Scheinliste, wenn man von dort kam. |

**Prüfungen mit Gegenprobe:** „Fuß im Bild“ für die vier Fenster (heute Knopf bei y 1063 / 1852 /
994 / 1046 bei 785 px sichtbar); `akten.spec.ts`; Kennwert „offen € …“ stimmt bei mehr als 500
Rechnungen und fehlt ohne Recht oder Modul; Prüfung „jede Aktion der Angebots-, Wartungs- und
Scheinzeile bleibt in höchstens zwei Tipps erreichbar“; `flucht.spec.ts` mit den Karten ohne
Titel; beide Feldlisten von „Kunde bearbeiten“ sind im einen Formular enthalten.
**Bleibt gleich:** E99 (Zeitstrahl, Rechnungen im Fenster, Belegzeile, leere Karten „Nachrichten“
und „Einsätze“, „geschrieben von“, Stempel der Baustellenakte); E74 (Stift und Tonne in Zeilen);
das zweite ⋯ und die Schritte im Verlauf der Angebotsakte; Hauptaktion der Angebotsakte; „Quelle“
als Pflicht ohne Vorgabe; die Reihenfolge Liegenschaft vor Kunde in „Neue Baustelle“; der Satz
von `Nachladen`; Team, Projektleitung, Telefon und Straße in der Baustellenzeile; der Fokus auf
dem Fenster nach dem Öffnen; alle Annahme-Wege; die Meldung mit „Rückgängig“ (F15);
`naechsterSchritt` prüft Rolle und Modul; die `Speicherleiste` der Akten.
**Risiko:** das größte Seitenpaket — je Seite ein PR; die Liegenschaftsakte braucht die Attrappen
aus Paket 8. **Aufwand:** 14–18 Tage.

#### Paket 19 — Team: Mitarbeiterübersicht, Benutzer, Urlaub

**Ziel:** Die Übersicht nutzt die Bausteine; am Handy steht die Liste im Bild; nach dem Anlegen
geht es weiter.
**Punkte:** V-8, D1-T16, D1-T17, D1-P12, D4-A7, D4-A11, D4-A13, D4-B16, D4-C3, D4-C5, D4-C10, D4-I6, D4-I11, D4-T8, D4-T10, D4-T11, D4-P7, D4-P8, D4-P10, D4-P12. **Dazu Teile von:** D4-A4 (Leersatz der Mitarbeiterübersicht); V-5 („Im Plan ansehen“ am Urlaubsantrag).
**Voraussetzung:** Pakete 8 bis 11. Entscheidungen E-P, E-T.
**Schritte:**

- **Mitarbeiterübersicht** (`AccountingView.tsx`, `ProjectSummary.tsx`, `PersonKalender.tsx`):
  Tabelle auf den Baustein (V-8); Pfeil an der Zeile (D4-A11); Steuerungen am Handy verdichtet
  (D4-C10); Radius im Personenkalender (D4-A13 Teil 2); Person-Fenster (D4-I6, D4-T10); Stand der
  Auswertung einmal (D4-T11, D4-P10); Zeile (D4-P7); Leersatz 15 px (D4-A4 Teil).
- **Benutzer und Benutzerakte** (`UserMgmtView.tsx`, `BenutzerakteView.tsx`): Meldung mit „Akte
  öffnen“ (D4-C3); Klammerzusätze als `hint` (D4-A7); Wochenstunden nur an einer Stelle (D4-T8);
  „Geburtsdatum“ als Zeile (D4-I11).
- **Urlaub** (`VacationsView.tsx`): Wartendes vor dem eigenen Formular, eine gefüllte Hauptaktion
  (D4-C5, D4-B16); Zeilen (D4-P8, D1-P12, D4-P12); Hinweise (D1-T16, D1-T17); Tastfläche „Im Plan
  ansehen“ (V-5 Teil).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-8 | Die Positionstabelle hat eigene Spaltenregeln (Kopf und Feld bündig, G2) — nicht blind auf `.tabelle` umstellen; sie gehört zu Paket 15, die Beispielrechnung zu Paket 20. |
| D1-T16 | Vertretbar nur, weil er im Fenster des Antrags schon steht (`AntragFenster.tsx:101`); dort bleibt er. „In die Hilfe“ allein reicht nicht. |
| D1-T17 | Übrig bleibt nur: als Hinweis an der Maßlinie. Der Satz selbst bleibt. |
| D1-P12 | Die Art des Antrags bleibt („Urlaubstage“ heißt „verbraucht Urlaub“; Zeitausgleich zählt Stunden). |
| D4-A7 | Nicht über das allgemeine Formularraster in `lot.css` lösen (ändert jedes Formular). Örtlich: die zwei Klammerzusätze als `hint` unter das Feld, der Schalter als `feld-breit`. Teil Rechnungsvorgaben in Paket 20. |
| D4-A11 | „Notzugang“ nicht aus der Plattform-Zeile nehmen (der Notfallweg würde einen Tipp länger). `/accounting` bei 375 px: Platz für den Pfeil messen. Teil Tag-Fenster in Paket 17. |
| D4-A13 | Teil (1) wird nicht gebaut. Teil (3) mit D1-T5 in Paket 14. |
| D4-B16 | Mit D4-C5. |
| D4-C3 | Meldung mit „Akte öffnen“; die Liste bleibt nach dem Anlegen erreichbar. „Noch zu tun“ in der Akte nur, solange etwas offen ist. |
| D4-C5 | Adressen von der Startseite landen weiter beim Antrag. |
| D4-C10 | U13 legt die Handy-Zeile fest — nur die Steuerungen darüber verdichten. |
| D4-I6 | Bei Personen mit Buchungen stehen an der Zeile „bearbeiten“ und „löschen“ — die Zeile kann dann nicht nur „öffnen“. |
| D4-I11 | Das Datum bleibt verdeckt (Jugendschutz). |
| D4-T8 | „Urlaubsanspruch“ (Anpassung) ist ein eigenes Blatt mit eigener Funktion — bleibt. |
| D4-P7 | Die Zeile ist nach U13 fest; Einstufung links und „heute offen“ rechts in eine Zeile — keine dritte Zeile. |
| D4-P10 | Teil Plattform in Paket 20. |
| D4-P12 | Die Tastfläche des Verweises mitnehmen (V-5). Teil Rüstliste in Paket 17. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-8 | Spalten, Sortierung, Summen, Umbruch am Handy (der Kopf „Stunden“ bricht dort heute zweizeilig). |
| D4-A7 | Feldreihenfolge, Tab-Reihenfolge. Rückschritt: Formulare, die heute bewusst oben fluchten (Feld mit Fehlertext daneben) — vorher mit `messen.mjs` gegenprüfen. |
| D4-A11 | jede heutige Aktion, Tastaturweg (Enter auf dem Namen). Rückschritt: wenn am Handy der Pfeil die Spalte „Gesamtsaldo“ umbricht (bei 375 px prüfen). |
| D4-A13 | `kein-trennen`-Regeln, `aria-label` der Zellen. |
| D4-I6 | Bleibt: Tipp auf den Tag öffnet das Zeitformular mit Datum. Sammelaktion nur als Idee (fachlich heikel). |
| D4-I11 | Bleibt: das Datum bleibt verdeckt wie heute. |

**Prüfungen mit Gegenprobe:** Mitarbeiterübersicht bei 390 px: die erste Zeile der Liste liegt im
oberen Drittel (heute y 772 von 844); Rollenprüfung `th` = 12; `/vacations`: eine gefüllte
Hauptaktion.
**Bleibt gleich:** U13 (Handy-Zeile der Übersicht: Name, Stand, Gesamtsaldo); „Urlaubsanspruch“
als eigenes Blatt; das Geburtsdatum bleibt verdeckt; Adressen von der Startseite landen beim
Antrag; die Art des Antrags in der Urlaubszeile; „bearbeiten“ und „löschen“ an Zeilen des
Person-Fensters mit Buchungen; der Notzugang in der Plattform-Zeile.
**Risiko:** gering bis mittel. **Aufwand:** 7–9 Tage.

#### Paket 20 — Einstellungen, Mein Konto, Plattform, Anmeldung, Fehlerseiten

**Ziel:** Eine Einstellung ist auffindbar; Speichern ist erkennbar; Sackgassen haben einen Weg
weiter.
**Punkte:** V-7, V-10, D1-T18, D2-T16, D3-C12, D3-T21, D3-P12, D4-A3, D4-A4, D4-A12, D4-B1, D4-B7, D4-B9, D4-B12, D4-B14, D4-C6, D4-C7, D4-C8, D4-C9, D4-C13, D4-I2, D4-I3, D4-I4, D4-I8, D4-I9, D4-T4, D4-T5, D4-T15, D4-T16, D4-T17, D4-T18, D4-T19. **Dazu Teile von:** D4-A7 (Schalterzeile der Rechnungsvorgaben); D4-P10 (Plattform-Zeile); V-8 (Beispielrechnung in den Sätzen).
**Voraussetzung:** Pakete 8 bis 11. Entscheidungen E-E, E-T.
**Schritte:**

- **Einstellungen** (`SettingsView.tsx`, `FirmendatenView.tsx`, `ModulesView.tsx`): Zusatz „noch
  nicht gespeichert“ an der Schalterzeile; am Handy klebt nur die Leiste des zuletzt geänderten
  Blatts (D4-B1); Gliederung statt 15 gleichrangiger Reiter (D4-C9, D4-I2); die Suche kennt die
  Stichworte (D4-I3); Briefkopf-Vorschau (D4-C6, D4-I4); Module mit eingerückten Unterfähigkeiten
  und aufklappbarem „Betrifft“ (D4-I8, D4-T5); Betragsfelder mit Einheit, Mahnspesen-Raster
  (D3-C12, D3-P12); Texte (D4-T4, D4-T15, D3-T21, D2-T16); Schalterzeile (D4-B14, D4-A7 Teil);
  Leersätze 15 px (D4-A4); Beispielrechnung als Tabelle aus dem Baustein (V-8 Teil).
- **Mein Konto** (`NotificationSettings.tsx`): Zeilenliste statt dreier Blätter (D4-I9);
  „Darstellung“ (D1-T18); Blatt „Kommen die Meldungen an?“ (D4-T16).
- **Plattform** (`PlattformView.tsx`): „Zurück“ in einer Form (D4-B9); Hauptknopf rechts (D4-B7);
  Betrieb anlegen (D4-C8); Zeilen (D4-T17, D4-P10 Teil).
- **Anmeldung und zweiter Faktor** (`LoginPage.tsx`, `ZweiFaktorSeite.tsx`): eine Gestalt
  (D4-B12); „Passwort anzeigen“, Bestätigung an der richtigen Stelle (D4-C7); Absatz mit
  „Abmelden“ (D4-A12); Texte (D4-T18, D4-T19).
- **Fehlerseiten** (`guards.tsx`, `ErrorBoundary.tsx`, `App.tsx:657`, `RechtInhalt.tsx`): „Kein
  Zugriff“ und „… ist ausgeschaltet“ in der Linie mit Weg weiter (D4-A3); die Fehlertafel in der
  Linie (V-7); eine unbekannte Adresse zeigt eine Auskunft (D4-C13); Blatttitel der Rechtsseiten
  (V-10).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| V-7 | Bleibt: die Tafel hängt von nichts ab, was abstürzen kann (`Button` zieht nur `knopf.ts`). |
| V-10 | Nur die örtliche Variante: eine Regel auf `.inhalt .titel-karte` träfe auch `WorkSheetView.tsx:1351`, `Handlungsbedarf.tsx:132` und die Plattform-Kontextspalte. `RechtInhalt` steht auch in der Plattform-Vorschau der Rechtstexte. |
| D1-T18 | Der Name steht in `CLAUDE.md`, `style.md` (Dark Mode), E92 und im Handbuch — dort mitziehen. |
| D3-C12 | Einheit als Beigabe, nicht als Wert („78,00 €/h“ liest `leseZahl` nicht). |
| D3-T21 | Die 33 Halbjahre stehen in einer zugeklappten Auswahl, nicht als Text — kein zweites Bedienelement „Frühere anzeigen“ (Grundsatz 4). |
| D3-P12 | „Tabben zeilenweise“ wäre eine Änderung (heute erst alle Firmen-, dann alle Privatfelder). Mit „Pauschale 40 € nach § 458 UGB“ entfallen die drei Firmenfelder — das Raster verliert eine Spalte. |
| D4-A3 | „Zur Startseite“ muss für jede Rolle ein erlaubtes Ziel sein (Plattformkonto). Der Verweis auf „Module“ nur für die Administration bleibt. |
| D4-A4 | Den Satz der Datensicherung nicht mit umstellen; Zustände stehen laut E97 in 13 px. Teil Mitarbeiterübersicht in Paket 19. |
| D4-A12 | „Abmelden“ ohne Passwort erreichbar halten. |
| D4-B1 | Entschieden (E-E): der Schalter bleibt überall Schalter (E95); die Speicherleiste bleibt je Blatt (`style.md` U1, Muster 3); neu sind nur der Zusatz „noch nicht gespeichert“ an der Schalterzeile und dass am Handy nur die Leiste des zuletzt geänderten Blatts klebt. |
| D4-B12 | Bleibt: jeder Schritt, „Abmelden“ auf jeder Zwischenseite. |
| D4-C6 | Über D4-I4. |
| D4-C7 | Die gleiche Antwort für vorhandene und fehlende Konten bleibt. |
| D4-C13 | Die alten Weiterleitungen (`/admin-orders`, `/stock`, `/notifications`, `/modules`) bleiben. |
| D4-I2 | Jede Rolle sieht andere Reiter — Gruppen dürfen nicht leer stehen. Jede Adresse `/settings/…` bleibt; `UNTER`, `pruefen:links`, Strg+K-Einträge bleiben. |
| D4-I3 | Treffer nur für Seiten, die die Rolle sehen darf (E91). |
| D4-I4 | Nur aus `belegLayout.ts`. Von 760 bis 1.199 px ist daneben kein Platz. |
| D4-I9 | Das Zwei-Faktor-Blatt und die Pflicht für den Betrieb bleiben eigene Blätter. |
| D4-T4 | Die Liste bleibt Suchstoff — die Suche findet weiter (E9). |
| D4-T5 | Zwölf Schalter schalten ohne Rückfrage — für sie hat „Betrifft“ in der Rückfrage keinen Ort: aufklappbar an der Zeile. |
| D4-T15 | Den Hinweis nicht anfassen. |
| D4-T18 | Aufklappen ist in Ordnung, solange die Zeile ohne Anmeldung erreichbar bleibt. |
| D4-T19 | Das Sternchen ist der allgemeine Baustein der Pflichtfelder — bleibt. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| V-7 | die Tafel hängt von nichts ab, was selbst abstürzen kann (keine Datenschicht, kein Kontext); „Erneut versuchen“, „Zur Startseite“, „Problem melden“, technische Einzelheiten zugeklappt. |
| V-10 | der veröffentlichte Rechtstext wörtlich und in seiner Gliederung. |
| D3-C12 | gespeicherte Werte; Eingabe „78“ gilt weiter |
| D3-P12 | sechs Felder, Reihenfolge beim Tabben zeilenweise |
| D4-A3 | Texte, Rollenname im Satz, wer einschalten darf. Rückschritt: wenn die Linkprüfung (`pruefen:links`) die Tafel als toten Weg meldet. |
| D4-A4 | Wortlaut. Rückschritt: keiner zu erwarten (Blatt wird je Satz 4–5 px höher; `raster.spec.ts` läuft mit). |
| D4-A12 | Abmelden ohne Passwort erreichbar (Prüflauf L3). Rückschritt: Tastfläche unter 44 px. |
| D4-I2 | Bleibt: jede Adresse `/settings/…`, Rollenfilter, Strg+K-Einträge. Rückschritt: `pruefen:links`. |
| D4-I3 | Bleibt: Gruppen und Rechte der globalen Suche. |
| D4-I4 | Bleibt: Felder, Prüfungen (IBAN, UID). Vorbehalt: die Vorschau muss aus `belegLayout.ts` kommen, sonst zeigt sie etwas anderes als der Beleg. |
| D4-I8 | Bleibt: Rückfragen, Abhängigkeiten. |
| D4-I9 | Bleibt: jede Aktion, Zwei-Faktor-Blatt. |

**Prüfungen mit Gegenprobe:** `schalterRegel.test.ts` bleibt grün (E95); die Suche findet
„dunkel“, „Monatsabschluss“, „Mahnung“ (heute nichts); `/gibtsnicht` zeigt eine Auskunft statt
der Startseite; `pruefen:links`; „Zur Startseite“ ist für jede Rolle ein erlaubtes Ziel, auch
für das Plattformkonto.
**Bleibt gleich:** jede Einstellung und **jede Adresse `/settings/…`**; `UNTER` und die
Strg+K-Einträge; gespeichert wird weiter je Blatt, ein Blatt mit Fehler hält die übrigen nicht
auf; „Verwerfen“ je Blatt; Enter speichert das Blatt; die Rechte je Blatt (die Buchhaltung
speichert die Rechnungsvorgaben über ihre eigene Funktion); die Rückfragen der Module; die alten
Weiterleitungen (`/admin-orders`, `/stock`, `/notifications`, `/modules`); jeder Schritt des
Anmeldewegs und „Abmelden“ auf jeder Zwischenseite; die gleiche Antwort für vorhandene und
fehlende Konten bei „Passwort vergessen“; das Sternchen der Pflichtfelder; die Fehlertafel hängt
von nichts ab, was abstürzen kann; die Stichwortketten als Suchstoff; die Speicherleiste am
Schreibtisch bleibt, wie sie ist (N-D4-1 ist zurückgestellt).
**Risiko:** die Gliederung der Einstellungen berührt Navigation, Suche und Linkprüfung; jede Rolle
sieht andere Reiter. **Aufwand:** 10–12 Tage.


### Stufe D — Lücken in den Abläufen

Für die Pakete dieser Stufe und der Stufe E steht die Bauanleitung im Papier („Papier n, Befund
x“): Beleg, Vorschlag, Prüfung und „bleibt gleich“. **Gebaut wird nach dem Papier mit den
Berichtigungen der Tabelle „Vorgaben aus der Gegenprüfung“** — wo beide einander widersprechen,
gilt die Vorgabe. Die Tabelle danach gibt Prüfung und „bleibt gleich“ im Wortlaut des Papiers
wieder (gekürzt, wo sie lang sind). Für jede neue Tabelle und Funktion gelten die Regeln 12 bis 15
aus Abschnitt 2.2.

#### Paket 21 — Zeit und Personal

**Ziel:** Der Monatsabschluss ist vollständig; Abwesenheiten lassen sich abbilden, wie sie
vorkommen; das Zeitkonto kennt die Auszahlung.
**Punkte:** Z-3, Z-5, Z-6, Z-7, Z-8, Z-9, Z-10, Z-11, Z-12, Z-13, Z-14, D4-C4, N-Z-3, N-Z-4.
**Voraussetzung:** Paket 1 (Z-1, Z-2, Wächter Textersatz). Verdacht Z-2, Z-3, Z-5, Z-7 geklärt.
Entscheidungen E-Z3, E-Z11 (gelten), E-Z14, E-F6. Für (g) und (h) die Kanzlei.
**Schritte, in dieser Reihenfolge:**

- **(a) Monatsabschluss:** Z-6 — der Korrekturantrag kann nachtragen und löschen, mit den Grenzen
  in der Funktion; Z-7 mit D4-C4 — „Monat fertig machen“: die Liste des Offenen vor dem
  Abschluss, die Kennzahl führt dorthin; N-Z-3 — eine Änderung an Eintritt, Austritt oder
  Saldo-Start, die einen abgeschlossenen Monat trifft, steht im Verlauf des Abschlusses; N-Z-4 —
  passende Meldung; die Vorschau beim Kürzen rechnet in Arbeitstagen (Grenze 5 in 4.10);
  Schalter „führt ein Zeitkonto“ je Person auch für die Rolle Administrator (Grenze 11).
- **(b) Abwesenheiten:** Z-8 — am ersten Tag einer Krankmeldung darf „Krank“ neben „Anwesend“
  stehen; Z-9 — das Büro trägt Sonderurlaub, Pflegefreistellung und unbezahlten Urlaub für eine
  Person ein, Anlässe je Betrieb erweiterbar.
- **(c) Z-5:** Wiedereintritt als zweites Dienstverhältnis mit eigenem Beginn.
- **(d) Z-13, Teil 1:** Personalnummer in der Lohn-Datei.
- **(e) Z-3** (E-Z3): Auszahlung von Überstunden als Abgang im Zeitkonto; mit ihr entsteht die
  Spalte „Zeitkonto am Monatsende“ (Z-13, Teil 2).
- **(f) Z-11** (E-Z11): Arbeitsjahr je Person als Einstellung je Betrieb — der Bau beginnt nach
  der Auskunft der Kanzlei zu Fundstelle und Verfall (K-9); was mit laufenden Ansprüchen beim
  Einschalten geschieht, wird vor dem Bau festgelegt.
- **(g) Z-10, Z-12:** warten auf die Kanzlei (K-3) und gelten nicht als entschieden.
- **(h) Z-14:** die Grenze „Wegzeit zählt nicht als Arbeitszeit“ wird jetzt benannt; die
  Einstellung wartet auf die Kanzlei (K-5).
- **(i) E-F6:** das Formular der Benutzerakte füllt einen leeren Eintritt und Saldo-Start nicht
  mehr von selbst mit „heute“ und schreibt sie nicht mit, wenn sie nicht geändert wurden.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| Z-3 | `calcOverallSaldo` hat sechs Aufrufer (`zeitguthaben.ts`, `TimeView.tsx`, `eigeneKonten.ts`, `tagesbuchungen.ts`, `benutzerVorgaben.ts`, `zeitkonto.ts`): der neue Eingang ist Pflicht, oder die Prüfung „App = Datenbank“ läuft über jeden Aufrufer — sonst zeigt ein vergessener still den alten Saldo. `vacations.saldo_bei_antrag` bleibt, wie er war. Die Spalte „Zeitkonto am Monatsende(Std)“ entsteht einmal, hier (nicht schon mit Z-13). |
| Z-5 | Der falsche Satz im Dialog („das alte Zeitkonto bleibt abgeschlossen“, `BenutzerakteView.tsx:550`) wird schon in Paket 5 berichtigt (Teil von Z-5). Der Umbau kommt vor Z-11. Schon überschriebene Eintritte lassen sich nicht wiederherstellen — benennen (Altdaten). |
| Z-6 | Die Risikoaussage des Papiers ist falsch: sechs Wächter an `time_entries` greifen in der `security definer`-Funktion nicht (`krank_nur_ueber_meldung`, `urlaub_nur_ueber_antrag`, `zeitausgleich_vier_augen`, `jugendschutz_buerobuchung`, `freistellung_nur_ueber_antrag`, `berufsschule_nur_ueber_eintrag`). Nachtrag und Löschen brauchen die Grenzen ausdrücklich in der Funktion, mit einer Prüfung je Grenze: Nachtrag nur mit Stand „Anwesend“; Löschen nur von Zeilen ohne `vacation_id`/`krankmeldung_id`/`freistellung_id` und nicht verrechnet. „Krankmeldung nachtragen“ ist ein eigener Weg (`krankmeldung_speichern`) und scheitert im abgeschlossenen Monat ebenfalls — benennen. |
| Z-7 | Der Zähler „Fälle der Arbeitszeitgrenzen ohne Begründung“ kommt nicht in `zeit_monat_stand` (in SQL wäre es ein zweiter Rechenweg für AZG/ARG/KJBG, gegen die benannte Grenze L5), sondern aus den schon geladenen Daten der Mitarbeiterübersicht. Zusammen mit D4-C4 bauen. |
| Z-8 | Beide Reihenfolgen müssen gehen (zuerst krank gemeldet, Vormittag danach eingetragen — heute weist `ganzer_tag_allein` ab; auch `zeit_timer_buchen`). Eigene Prüfung über den gewachsenen Bestand: der Altbestand ergibt auf die Minute dieselben Zahlen. |
| Z-9 | „In einem Zug“ ruft `freistellung_entscheiden` (zehn Parameter: Nachweis, Teilung, Kürzung), baut sie nicht nach. |
| Z-10 | Kanzlei zuerst (K-3). Rechtsaussage vom Prüfer nicht geprüft. |
| Z-11 | Vor dem Bau mit der Kanzlei klären (K-9): Fundstelle (§ 2 UrlG) und wie die Einstellung „verfällt an einem festen Tag“ mit je Person verschiedenen Jahren zusammengeht. Was mit laufenden Ansprüchen beim Einschalten geschieht, steht nirgends — vor dem Bau festlegen (Altdaten). |
| Z-13 | Zwei Teile: die Personalnummer sofort; die Spalte „Zeitkonto am Monatsende“ erst mit Z-3 (sonst wechseln Bedeutung und Byte-Referenzen der CSV zweimal). |
| Z-14 | Entschieden (E-Z14): die Grenze wird jetzt benannt. Die Einstellung je Betrieb wird nicht gebaut, bis die Kanzlei geantwortet hat (K-5) — sie gilt nicht als entschieden: sie änderte Saldo, Überstunden, Arbeitszeitgrenzen und die Spalte „Gesamtzeit“ der Monats-CSV; ohne „gilt ab“ rechnete sie alle vergangenen und abgeschlossenen Monate um; sie berührt E63. |
| D4-C4 | Mit Z-7 zusammen bauen. |
| N-Z-3 | Papier 1, Grenze 1.10: nicht sperren, aber im Verlauf des Abschlusses festhalten und die Aufzählung der benannten Grenze vervollständigen. |
| N-Z-4 | Meldung berichtigen; vor dem Bau nachstellen. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| Z-3 | Papier 1, Befund Z-3 (Aufwand dort: g) | `zeitkontoBuchungen.test.ts` (Saldo App = Saldo Datenbank mit und ohne Buchungen über den Bestand `zeitkontoBestand.ts`; Monteur schreibt nicht; abgeschlossener Monat). Gegenprobe: ohne Migration rot. | ohne Buchung ist jeder Saldo auf die Minute der von heute (`gesamtsalden.test.ts`, `zeitkontoZwischenstand.test.ts` bleiben unverändert grün); die CSV-Spalten davor bleiben an ihrer Stelle (Byte-Referenzen). |
| Z-5 | Papier 1, Befund Z-5 (Aufwand dort: m) | `wiedereintritt.test.ts` (Monatsauswertung und CSV eines Monats vor dem Austritt sind nach dem Wiedereintritt zeichengleich; Rest im Jahr der Rückkehr ohne die Tage von vorher). Gegenprobe rot ohne Umbau. | Personen ohne Wiedereintritt rechnen unverändert (`arbeitszeitVerlauf.test.ts`, `austrittSaldo.test.ts`); die Lücke zwischen Austritt und Rückkehr bleibt ohne Soll (Z2). |
| Z-6 | Papier 1, Befund Z-6 (Aufwand dort: m) | `monatsabschluss.test.ts` (Nachtrag und Löschen im abgeschlossenen Monat über den Antrag; ohne Antrag weiter abgewiesen). Gegenprobe rot. | der bestehende Änderungsantrag samt seiner Sperren (verrechnet, Antrag, Meldung), Modul aus = kein Antrag. |
| Z-7 | Papier 1, Befund Z-7 (Aufwand dort: m) | Komponentenprüfung des Dialogs und eine Datenbankprüfung je Zähler. Gegenprobe: ohne Funktion keine Liste. | Abschließen und Öffnen wie heute, die CSV ohne Abschluss zeichengleich. |
| Z-8 | Papier 1, Befund Z-8 (Aufwand dort: m) | `krankAbMittag.test.ts` (App = Datenbank; Saldo des Tages 0 bei 4 Std. Arbeit; kein Plus, wenn die Arbeit das Soll schon erfüllt). Gegenprobe rot. | ein ganzer Krank-Tag rechnet wie heute (`gutschriftSolltag.test.ts`), an späteren Tagen der Meldung bleibt „Krank“ allein, Arbeitszeitgrenzen zählen nur die Arbeit. |
| Z-9 | Papier 1, Befund Z-9 (Aufwand dort: m) | `freistellungFuerJemanden.test.ts` (Büro trägt ein; Monteur nicht für andere; eigener Anlass zählt mit seinem Kontingent). Gegenprobe rot. | der eigene Antrag mit Nachweis und Bestätigung, die Warnungen, die Datenschutzregel „Projektleitung sieht den Anlass nie“. |
| Z-10 | Papier 1, Befund Z-10 (Aufwand dort: m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | wer den Vorschlag nicht übernimmt, hat genau den Stand von heute. |
| Z-11 | Papier 1, Befund Z-11 (Aufwand dort: g) | die bestehenden Urlaubsprüfungen einmal mit festem Tag (unverändert) und einmal je Person. Gegenprobe: ohne Umbau fällt der Anspruch am 1.1. an. | jeder Betrieb mit festem Tag behält jede Zahl (`urlaubsStand`-Prüfungen, Byte-Referenzen der CSV). |
| Z-12 | Papier 1, Befund Z-12 (Aufwand dort: m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | kein Resturlaub ändert sich. Ob ohne festgehaltenen Hinweis überhaupt abgezogen werden soll, ist eine Entscheidung des Auftraggebers mit der Kanzlei, kein Teil dieses Vorschlags. |
| Z-13 | Papier 1, Befund Z-13 (Aufwand dort: k) | Exportprüfung mit zwei gleichnamigen Personen; Gegenprobe: ohne Spalte nicht unterscheidbar. | alle Spalten davor an ihrer Stelle (Byte-Referenzen neu nur für die betroffenen Dateien). |
| Z-14 | Papier 1, Befund Z-14 (Aufwand dort: k/m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |

**Bleibt gleich (Paket):** abgeschlossene Monate und genehmigte Anträge werden nicht neu
gerechnet; `zeitkontoSaldo.test.ts`, `gesamtsalden.test.ts`, `zeitkontoZwischenstand.test.ts`;
die Monats-CSV ohne Abschluss zeichengleich; für Z-8 eine eigene Prüfung über den gewachsenen
Bestand (der Altbestand ergibt auf die Minute dieselben Zahlen); E-F6: `akten.spec.ts` (nur der
Name geändert → Eintritt bleibt leer; heute wird er „heute“).
**Risiko:** Z-3, Z-5 und Z-11 greifen in Saldo und Urlaub — je eigener PR, Z-5 vor Z-11.
**Aufwand:** (a)–(d) 9–11 Tage; (e) 5–7; (f) 6–8; (g) rund 3 nach der Auskunft; zusammen 23–29.

#### Paket 22 — Auftragskette

**Ziel:** Kein Speichern über einen veralteten Stand; das versendete Angebot bleibt, wie es war;
der Abschluss kennt Angebote und Termine.
**Punkte:** A-2, A-5, A-6, A-7, A-8, A-9, A-10, A-11, A-13, A-15, A-16, P-12, N-A-1, N-A-2, N-P-4, N-P-6.
**Voraussetzung:** Paket 1 (Wächter Textersatz für `person_auskunft`/`person_loeschen`; die
Fassung von `app.baustelle_abschluss_zaehlen`), Paket 3 (A-3, A-14). Verdacht A-1, A-5 geklärt.
Entscheidungen E-A13, E-F5, E-F14, E-F20. Der Inhalt der Rechtstexte (A-9) wartet auf die Kanzlei
(K-4); der Platz dafür nicht.
**Schritte:** (a) A-2, N-P-4, N-P-6: Baustellen- und Kundenakte, Wartung und Termin speichern nur
geänderte Felder und prüfen den Stand. (b) A-6, P-12: der Abschluss nennt offene Angebote und
kommende Termine. (c) A-5: Empfänger des versendeten Angebots festhalten. (d) A-7: Nachlass im
Angebotsformular. (e) A-8, A-9: Texte und Bedingungen des Angebots je Betrieb; Platz für AGB und
Rücktrittsbelehrung auf der Annahmeseite. (f) A-10: lesende Funktion „Leistungsumfang ohne
Preise“ für den Monteur. (g) A-11: Vorschläge aus der Liegenschaft in Eingang und Angebot, dazu
der Beteiligte „Rechnungsempfänger“ als Kundenvorschlag (E-F5). (h) A-13: Zusatzrecht je Person
„Angebote schreiben“. (i) A-15: Dublettenfrage über alle Treffer. (j) A-16: Startseite der
Leitung nennt Angebote mit ablaufender Bindefrist und liegen gebliebene Entwürfe. (k) N-A-1,
N-A-2: Kundenseite nach der Rücknahme; Datum erst nach geglücktem Versand.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| A-2 | „Nur geänderte Felder“ ist keine Fassungsprüfung: ändern beide dasselbe Feld, gewinnt weiter still der Letzte. Entschieden (E-F14): zusätzlich eine Standprüfung über `updated_at` mit Rückfrage wie im Einsatzformular (`EinsatzFormular.tsx:562–571`). Kundenakte: geht der Name nicht mehr mit, wechselt der Schreibweg von `kunde_umbenennen` auf die Tabelle (`null` leert dort) — deshalb geht der Name immer mit. |
| A-5 | Für Altangebote ist der Name schon eingefroren (`q.customerName`); es fehlen nur Anschrift und UID. Entschieden (E-F31): Altangebote drucken den eingefrorenen Namen mit der heutigen Anschrift und UID; das wird als Grenze (Altdaten) benannt. `person_auskunft`/`person_loeschen` leben von Textersatz über mehrere Migrationen: Ergänzung auf dem Endstand, nach dem Wächter aus Paket 1. Der Auslöser `app.aussteller_angebot` hat drei Zweige (Dienst, Rücknahme, Versand) — der Empfängerstand tut in allen dreien dasselbe. |
| A-6 | Die Migration setzt auf der Fassung von `app.baustelle_abschluss_zaehlen` aus Paket 1 auf; „bleibt gleich“ heißt „wie nach Paket 1“. |
| A-7 | Der Baustein entsteht neu am Angebot; die Rechnung wechselt erst mit ihrem Seitenpaket darauf (kein Herausziehen aus `InvoicesView`). Ein geänderter Nachlass meldet einen offenen Link wie bisher als „geändert“. |
| A-8 | Nach Änderungen an `shared/` `node scripts/edge-shared-uebernehmen.mjs`; Kundenseite und Edge Function lesen alte Schnappschüsse (`fassung: 1`) weiter. |
| A-9 | Der Platz für den Text hängt nicht an der Kanzlei, nur sein Inhalt (K-4) — der Bau wartet nicht. |
| A-10 | Preise können auch in der Bezeichnung einer Position stehen — die Grenze benennen. Die Sichtbarkeit über die Tabelle selbst prüfen (Zeilenschutz des Aufrufers), erst dann die Positionen holen. Die neue Funktion gehört in `LESENDE_FUNKTIONEN`, `netzFrist.ts` und in den Support-Wächter aus Paket 1. |
| A-11 | Im Eingang gibt es den Zweig „Neukunde“ (freier Name): „Übernehmen“ eines Kunden schaltet den Zweig um. |
| A-13 | Entschieden (E-A13): Zusatzrecht je Person (wie `kundenPflegen`), nicht Einstellung je Betrieb. `quotes_lesen` und `naechste_nummer('quotes')` gehen für die Verwaltung mit; Annehmen, Rücknahme und Link bleiben bei der Führung, je mit eigener Prüfung. |
| A-15 | „Bleibt gleich“ für alle drei Aufrufer (`CustomersView.tsx:372`, `LiegenschaftView.tsx:225`, `EingangView.tsx:260`). |
| A-16 | Die neue lesende Funktion gehört in dieselben drei Listen wie bei A-10. |
| P-12 | Wie A-6: auf der Fassung aus Paket 1 aufbauen. `baustelleAbschliessen.test.ts:61` nutzt `toMatchObject` — ein zusätzlicher Schlüssel bricht die Prüfung nicht. |
| N-A-1 | Entschieden (E-F20): die Kundenseite zeigt nach einer Rücknahme „inzwischen zurückgenommen“ mit Datum; der Nachweis der Annahme bleibt gespeichert. |
| N-A-2 | Datum erst nach geglücktem Versand setzen. |
| N-P-4 | Offen ist nur, ob die Oberfläche ein offenes Formular bei einer Live-Meldung zurücksetzt (nicht im Browser geprüft). Dieselbe Fehlerart wie A-2. |
| N-P-6 | Mit A-2 und N-P-4 nach derselben Regel. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| A-2 | Papier 2, Befund A-2 (Aufwand dort: m) | `BaustellenakteView.test.tsx` „schickt nur das geänderte Feld“ (Gegenprobe: heute steht `estimatedHours` im Aufruf — rot) und | ein geleertes Budget geht als `null`“, „Nummernwechsel plus Feld“; `KundenakteView.test.tsx` entsprechend, dort „bleibt gleich: Name geändert → `kunde_umbenennen` mit den übrigen geänderten Feldern“. Gleich bleiben muss: `null` für geleerte Felder, der Weg über `baustelle_umnummern`, die Meldung „n … (weiter im Papier) |
| A-5 | Papier 2, Befund A-5 (Aufwand dort: m) | Datenbanktest „Versand hält den Empfänger fest; Umbenennen/Zusammenführen ändert ihn nicht“ (Gegenprobe ohne Migration rot), `angebotPdf.test.ts` „versendet druckt den Stand, Entwurf den heutigen Kunden“, | Angebot ohne Stand druckt wie bisher“. |
| A-6 | Papier 2, Befund A-6 (Aufwand dort: k) | `baustelleAbschliessen.test.ts` + zwei Fälle (Gegenprobe ohne Migration: Schlüssel fehlen), `abschlussPunkte.test.ts` | ohne Angebote und Termine dieselbe Lage wie heute“. Gleich bleiben muss: Rollenregel (Angebote zählt nur, wer sie lesen darf — sonst `null`), Form der Lage. |
| A-7 | Papier 2, Befund A-7 (Aufwand dort: m) | `QuotesView.test.tsx` „3 % Nachlass: Summen wie `calcTotals`, gespeichert mit Bezeichnung“, „Nachlass einer Vorlage lässt sich entfernen“ (Gegenprobe: heute kein Feld — rot) | ohne Nachlass dieselben Summen; Rechnung nach Angebot übernimmt den Nachlass wie bisher“ (`pauschale.test.ts`). |
| A-8 | Papier 2, Befund A-8 (Aufwand dort: m) | `angebotPdf.test.ts` (Text aus der Einstellung; Gegenprobe rot), | ohne Einstellung druckt das PDF wortgleich wie heute“ (Textvergleich), Datenbanktest „Bedingungen eines versendeten Angebots ändern sich nicht mit der Einstellung“. |
| A-9 | Papier 2, Befund A-9 (Aufwand dort: k) | `angebotLink.test.ts` „Schnappschuss enthält den Text, Prüfsumme deckt ihn“ (Gegenprobe rot), `AngebotAnnahmeSeite.test.tsx` | ohne Text sieht die Seite aus wie heute, alte Links bleiben gültig“. |
| A-10 | Papier 2, Befund A-10 (Aufwand dort: m) | Datenbanktest „eingeteilter Monteur liest Positionen ohne Preis; fremder Monteur und fremder Betrieb nichts; Entwurf und abgelehnte Fassung nicht“ (Gegenprobe: ohne Migration fehlt die Funktion), | `quotes`/`quote_lines` bleiben für Monteure unlesbar“ (bestehende Rechteprüfung). |
| A-11 | Papier 2, Befund A-11 (Aufwand dort: k) | `EingangFormular.test.tsx`/`QuotesView.test.tsx` „Top gewählt → Vorschlag Mieter, Übernehmen füllt Ansprechpartner“ (Gegenprobe rot), | ohne Modul keine Vorschläge; nichts wird ohne ‚Übernehmen‘ überschrieben“. |
| A-13 | Papier 2, Befund A-13 (Aufwand dort: m) | `mandantenTrennung`/Rechtematrix + „Verwaltung mit Recht schreibt Entwurf, ohne Recht nicht, nimmt nie an“ (Gegenprobe ohne Migration rot) | Führung wie bisher, Monteur nichts“, `leseregelnGleichwertig.test.ts`. |
| A-15 | Papier 2, Befund A-15 (Aufwand dort: k) | Unit-Test mit 60 Treffern vor dem gleichnamigen (Gegenprobe rot) | Groß-/ Kleinschreibung und Leerraum wie `schluessel`“. |
| A-16 | Papier 2, Befund A-16 (Aufwand dort: m) | Datenbanktest gegen `listOffeneQuotes` ( | dieselbe Bedingung für ‚offen‘“), `startseite*.test.ts`; Gegenprobe ohne Funktion rot. |
| P-12 | Papier 3, Befund P-12 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |

**Bleibt gleich (Paket, aus Bericht 2 ergänzt):** `billingMode`, `dringlichkeit`, `wunschtermin`
leeren weiter mit `null`; Kunde gewechselt → `customerId` und `customerName` gehen zusammen;
Team-Listen ohne Rücksicht auf die Reihenfolge; `AngebotView` mit `listFassungen`; der
Annahme-Link meldet einen geänderten Nachlass als „geändert“; alte Schnappschüsse (`fassung: 1`)
bleiben lesbar; Annehmen, Rücknahme und Link bleiben bei der Führung. Das Angebots-PDF steht
nicht in der Belegreferenz — A-5, A-7 und A-8 brauchen eine eigene Prüfung des PDFs.
**Risiko:** A-2 ändert den Schreibweg zweier Akten. **Aufwand:** 13–16 Tage in vier PRs.

#### Paket 23 — Planung: aktuell, vollständig

**Ziel:** Der offene Plan ist aktuell; Termine und Einsätze kennen Abwesenheiten; wer umgeplant
wird, erfährt es.
**Punkte:** P-4, P-6, P-7, P-8, P-9, L-7, D4-C1, N-P-5, N-M-3.
**Voraussetzung:** Paket 1. Verdacht L-1 geklärt (Schritt a), Verdacht L-3. Entscheidungen E-F16,
E-F19. P-8 wartet auf die Kanzlei (K-6).
**Schritte:** (a) **zuerst** eine Warteschlange für alle Auslöser von `abgleichen`, mit der
Prüfung zweier überlappender Abgleiche; dann L-7: die Datenschicht ruft nach geglücktem
Funktionsaufruf `eigeneAenderung(tabelle)`, die elf direkten Kanäle hören auf
`beiEigenerAenderung` (dazu N-M-3). (b) P-4: der offene Plan hält Abwesenheiten, Termine und
Baustellen aktuell; der Zwischenspeicher merkt sich keinen Stand ohne Abwesenheiten. (c) D4-C1
(a) und (b): Krankmeldung aus der Planung, Ersatz anbieten. (d) P-6: Termine kennen
Abwesenheiten. (e) P-7: Push für den nächsten Arbeitstag der Person. (f) P-9: „Stunden ohne
Buchung“ über alle Scheine aus der Datenbank. (g) N-P-5: Hinweis „Baustelle ist abgeschlossen“.
(h) Folgetage direkt gegen `app.abwesenheiten` prüfen (Grenze 23 in 4.10). (i) P-8: die eigenen
Einsätze von heute und vom nächsten Arbeitstag auf dem Gerät — erst nach der Auskunft der Kanzlei.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| P-4 | Die Rückgabe von `einsatz_speichern` (`integer`) bleibt (sonst `drop function` und Verlust von `grant`/`revoke`); das Formular fragt nach dem Speichern die Abwesenheit des Tages neu. Einen Weg festlegen: der Aufruf im Browser nach geglücktem Schreiben (L-7), nicht „ein Kanal je Tabelle“. Kanäle auf `krankmeldungen` liefern der Projektleitung nichts (Zeilenschutz). |
| P-6 | Entschieden (E-F16): das Leserecht an Terminen bleibt, wie es ist — der Hinweis auf Termine erscheint nur für Rollen, die Termine lesen dürfen; die Buchhaltung bekommt den Satz wie heute, `termine_der_person` gibt ihr nichts. |
| P-7 | „Arbeitstage der Person“ gelten zum Datum (`arbeitszeit_verlauf`), nicht `users.work_days` von heute — sonst derselbe Fehler wie Z-2. Die Felder `heute`/`morgen`/`termine_morgen` des Ereignisses bleiben, bis die neue Edge Function läuft (nur ergänzen). Push hängt am Gerät (E69) — als benannte Grenze mitführen. |
| P-8 | Hebt eine mit Datenschutz begründete Grenze teilweise auf: wartet auf die Kanzlei (K-6) und gilt nicht als entschieden (E-F12). „Nächster Arbeitstag“: dieselbe Rechnung wie P-7. |
| P-9 | „Weiter zurück prüfen“ entfällt erst mit der neuen Funktion; Eintrag in `v10-entfernt.json`. Der Hilfetext `WorkSheetsListView.tsx:1117–1123` geht mit. |
| L-7 | Keine Meldung aus der Datenbank: die Datenschicht im Browser ruft nach geglücktem Funktionsaufruf `eigeneAenderung(tabelle)`. Zuerst die eine Warteschlange für alle Auslöser von `abgleichen` (Verdacht L-1), mit der Prüfung zweier überlappender Abgleiche. Nachgesendete Funktionsaufrufe (`supabaseSender.ts:222–227`) brauchen dieselbe Meldung. Der Wächter hält den Eintrag „Funktion → Tabellen“ gegen die im Rumpf beschriebenen Tabellen. |
| D4-C1 | (a) Krankmeldung aus der Planung: wer krank melden darf, entscheidet weiter die Urlaubsseite; ein Menü an der Namenszelle wäre ein Menü außerhalb des Seitenkopfs — Form vorher klären. (b) Ersatz anbieten: über den vorhandenen Umplan-Weg (`app.ruestliste_umziehen`), nicht als Löschen und Anlegen. (c) „Material zugeklappt“ darf die Meldung „fehlt“ nicht verstecken — Teil (c) in Paket 17. Nach P-4. |
| N-P-5 | Entschieden (E-F19): Einsätze auf abgeschlossenen Baustellen bleiben möglich (Nacharbeit) und werden benannt; das Einsatzformular und „Kopieren“ zeigen den Hinweis „Baustelle ist abgeschlossen“. |
| N-M-3 | Mit L-7. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| P-4 | Papier 3, Befund P-4 (Aufwand dort: m) | Komponentenprüfung „Aktualisieren holt Abwesenheiten und Termine neu“ (Gegenprobe: heute nur die Einsätze); Datenbankprüfung zu Punkt 3; der erweiterte Wächter ist am heutigen Stand rot. | ungespeicherte Eingaben im offenen Formular (P1 der letzten Durchsicht, `EinsatzFormularLive.test.tsx`) — das Formular übernimmt neue Abwesenheiten nur als Hinweis, nie als Zurücksetzen; „frei unklar“ bei Ladefehler. |
| P-6 | Papier 3, Befund P-6 (Aufwand dort: k–m) | `EingeteiltHinweis.test.tsx` (+ Termin), `startseite`-Regel (+ Termin mit fehlendem Teilnehmer; Gegenprobe: heute keine Zeile), Formularprüfung. | der Grund der Abwesenheit steht nirgends, wo er heute nicht steht; die Buchhaltung bekommt den Satz ohne Sprung. |
| P-7 | Papier 3, Befund P-7 (Aufwand dort: k–m) | `tests/supabase/einsatzMeldungArbeitstag.test.ts` (Freitag, Änderung für Montag → wartende Meldung; Gegenprobe ohne Migration: keine), Feiertag dazwischen, Person mit Samstag als Arbeitstag; `notifyLogic`-Einheitsprüfung für den Text. | gesammelt nach zwei Minuten Ruhe, nichts bei unverändertem Plan, nichts für den, der sich selbst einträgt, abschaltbar (`einsatzMehrtage`, `meldungTermineNotfall.test.ts`); spätere Tage melden sich weiter nicht. |
| P-8 | Papier 3, Befund P-8 (Aufwand dort: m) | Einheitsprüfung des Speichers (Konto A legt ab, Konto B liest nichts; zwei Tage alt → weg); Komponentenprüfung Startseite ohne Netz; Browserweg im Projekt `telefon-chromium` („offline neu laden → Einsatz steht, Schein lässt sich beginnen und vormerken“; Gegenprobe: heute Ladefehler). | kein Vorrat fremder Baustellen (Grenze E49 bleibt für alles außer den eigenen Einsätzen), mit Netz zählt nur der frische Stand; privates Fenster wie bisher ohne Vormerken. |
| P-9 | Papier 3, Befund P-9 (Aufwand dort: m) | Datenbankprüfung | die Regeln (ab zwei Tagen, nur Name und Tag, nicht die Minuten, „keine Buchung gefunden“ statt „nicht gebucht“), die Erinnerung des Monteurs. |
| L-7 | Papier 7, Befund L-7 (Aufwand dort: m) | `eigeneAenderung.test.ts` je umgestelltem Weg „gleicht ohne Kanal ab“; ein Wächter liest die Migrationen und verlangt für jede aus `src/` gerufene Funktion, die nicht `stable`/`immutable` ist, einen Eintrag (auch „schreibt keine Tabelle mit Live-Liste“ mit Grund). Gegenprobe: ohne Eintrag für `einsatz_speichern` rot. | fremde Änderungen kommen weiter über den Kanal; ein zusätzlicher Abgleich ändert kein Bild, wenn nichts anders ist (`kern.ts:1053–1054`). |

**Bleibt gleich (Paket):** ungespeicherte Eingaben im offenen Formular
(`EinsatzFormularLive.test.tsx`); die Rückgabe von `einsatz_speichern`; je Schreibvorgang gleicht
jede offene Live-Liste einmal ab (gebündelt über 50 ms); der Grund einer Abwesenheit steht
nirgends, wo er heute nicht steht; die Felder `heute`/`morgen`/`termine_morgen` des
Push-Ereignisses.
**Risiko:** L-7 ohne die Warteschlange macht Verdacht L-1 häufiger. **Aufwand:** 10–13 Tage ohne
P-8.

#### Paket 24 — Geld: Rücknahme, Gutschrift, Festschreiben, Konditionen

**Ziel:** Eine Mahnung lässt sich zurücknehmen; offene Mahnkosten bleiben sichtbar; der Export
merkt sich, was übergeben wurde.
**Punkte:** G-3, G-7, G-8, G-9, G-10, G-11, G-12, G-13, G-17, N-G-3, N-G-6.
**Voraussetzung:** Paket 3 (G-2 vor G-11; G-1 vor G-12). Verdacht G-1, G-6 geklärt.
Entscheidungen E-G12 (gilt), E-G13 (gilt: erst nach der Kanzlei). G-3 und G-13 warten auf die
Kanzlei (K-2, K-1).
**Schritte:** (a) G-7 und G-8 zusammen: Mahnung zurücknehmen; offene Mahnkosten bleiben sichtbar.
(b) G-11: Zahlungsziel, Skonto, Nachlass je Kunde als Vorgabe. (c) G-10, Teil 1: die Meldung
nennt den vorhandenen Weg, eine Rückgabe nach der Rechnung bleibt sichtbar; Teil 2: Gutschrift
als Beleg — beide Teile desselben Pakets. (d) G-9: der Export merkt sich den übergebenen
Zeitraum. (e) G-12 mit N-G-3: Nummernschema einstellbar, nur für künftige Nummern; der Abgleich
folgt dem Schema. (f) G-17: PDF mit festem Erstellungsdatum und fester Kennung. (g) Handgriff
„Zahlstand neu rechnen“; die App schickt kein Rechnungsdatum mehr (Grenzen 29 und 30 in 4.10).
(h) N-G-6: „Überfällig“ hängt nicht mehr am Öffnen der Rechnungsliste. (i) G-3: Rücklass — nach
der Auskunft der Kanzlei. (j) G-13: Einnahmen-Ausgaben-Rechner und Istbesteuerung — nach dem
Gespräch mit der Kanzlei.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| G-3 | Für die „Toleranz: beide Grundlagen zulässig“ eine Frist nennen. Eine durch Bankgarantie abgelöste Teilrechnung wird nicht noch einmal angefasst. Fachlich zuerst K-2. |
| G-7 | Rechnungen, die vor dem 10.10.2026 gemahnt wurden, tragen eine Stufe ohne Zeile in `mahnungen` — „zurück auf den Stand der vorigen Mahnung“ dort festlegen, mit eigener Prüfung. Zusammen mit G-8 bauen. |
| G-8 | Die neue Zahl „Mahnkosten offen“ nimmt zurückgenommene Mahnungen aus (mit G-7). |
| G-10 | Teil 1 nach dem Papier: die Meldung nennt den vorhandenen Weg, und eine Rückgabe nach der Rechnung bleibt als Zeile für Buchhaltung und Spitze sichtbar. Teil 2: Gutschrift als Beleg. Negative Zeilen gibt es technisch schon (`pauschale.ts:76–85`); den Satz im Grenzen-Dokument (Z. 644–648) berichtigen. |
| G-11 | Nach G-2 (Paket 3). |
| G-12 | Der Kontoauszug-Abgleich folgt dem eingestellten Nummernschema (G-1), Prüfung in `kontoauszugAbgleich.test.ts`. Den Meldungstext „die nächste ist 0001“ berichtigen (N-G-3). |
| G-17 | Die Stellen sind `pdf.ts:144`, `stornoPdf.ts:63`, `mahnungPdf.ts:227`, `angebotPdf.ts:61` (`setCreationDate`, `setFileId`). „Bitgleich“ gilt nur, solange Stammdaten und Gestaltung gleich bleiben — so in den Text der Grenze schreiben. |
| N-G-3 | Mit G-12. |
| N-G-6 | Keine Migration und kein Zeitauftrag setzt den Stand. Lösung vor dem Bau festlegen (im Papier nur als Hinweis geführt). |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| G-3 | Papier 4, Befund G-3 (Aufwand dort: m) | `ruecklass.test.ts` (Grundlage mit Teilrechnungen; ohne Änderung 1.000 €), Datenbankprüfung (falsche Grundlage wird abgewiesen; Fälligstellen nur nach vorn, nur bei offenem Rücklass). | Einzelrechnung und Schlussrechnung ohne Teilrechnungen rechnen wie bisher; bestehende Belege bleiben unverändert (Altdaten). |
| G-7 | Papier 4, Befund G-7 (Aufwand dort: m) | Datenbank (Stufe 2 → zurück auf 1 mit dessen Frist; ältere als die jüngste abgewiesen; nach Mahnkosten-Eingang abgewiesen), `mahnforderungEinModell` (zurückgenommene Kosten zählen nicht), `InvoicesView`. | jede Rechnung ohne zurückgenommene Mahnung rechnet und druckt wie heute. |
| G-8 | Papier 4, Befund G-8 (Aufwand dort: m) | `mahnkostenEinModell.test.ts` (nach Zahlung der Hauptforderung bleibt die Zahl), Listenprüfung. | der Mahnlauf selbst (keine neue Mahnung nur über Kosten) und die Kennzahlen „Offen/Überfällig“. |
| G-9 | Papier 4, Befund G-9 (Aufwand dort: m–g) | `buchhaltungExport.test.ts`/`bmdExport.test.ts` (Storno in zwei Zeiträumen → einmal gebucht, einmal Hinweis; Nachtrag erscheint), Datenbank (Rechte, Mandantentrennung). | ohne jeden Vermerk verhalten sich alle drei Exporte genau wie heute (eigener Test). |
| G-10 | Papier 4, Befund G-10 (Aufwand dort: k/g) | im Papier nicht eigens benannt — vor dem Bau festzulegen | der Hinweis in der Vorschau, die Abweisung der negativen Schlussrechnung. |
| G-11 | Papier 4, Befund G-11 (Aufwand dort: m) | `konditionen.test.ts` (Reihenfolge Rechnung > Kunde > Betrieb), Ansichtstest, Datenbankprüfung, die jedes neue Feld einmal schreibt und zurückliest (das Muster aus A2). | Kunden ohne Angaben rechnen wie heute; G-2 gilt weiter (Wechsel der Baustelle setzt auf Kunde bzw. Betrieb zurück). |
| G-12 | Papier 4, Befund G-12 (Aufwand dort: m) | `nummernkreisNurMitBeleg`/`regeln` (Beginn 1, durchlaufend über den Jahreswechsel), `buchhaltungExport` (keine falsche Lücke). | ohne Einstellung jede Nummer wie heute (eigener Test über den Jahreswechsel). |
| G-13 | Papier 4, Befund G-13 (Aufwand dort: m) | neue Einheitstests mit Teilzahlung, Skonto, Rückzahlung, Reverse Charge. | die drei bestehenden Exporte unverändert. |
| G-17 | Papier 4, Befund G-17 (Aufwand dort: k) | Einheitstest, der dieselbe Rechnung zweimal mit Abstand erzeugt und die Prüfsummen vergleicht (vorher verschieden). | Inhalt und Aussehen der Belege (bestehende PDF-Prüfungen). |

**Bleibt gleich (Paket):** jede Rechnung ohne zurückgenommene Mahnung rechnet und druckt wie
heute; ohne jeden Vermerk verhalten sich alle drei Exporte wie heute; ausgestellte Nummern
bleiben; die Belegreferenz. Zeilenschutz, Datenauskunft und Löschung der Tabellen
`bank_buchungen` und `beleg_versand` sind bisher nicht geprüft (Abschnitt 12) — vor diesem Paket
nachholen.
**Risiko:** G-7: fünf Lesestellen müssen denselben Filter tragen (Wächter über alle Abfragen auf
`mahnungen`). **Aufwand:** 23–28 Tage ohne G-3 und G-13.

#### Paket 25 — Material: Preise, Verbrauch, Fahrzeug, Bestellung

**Ziel:** Verkaufspreise folgen dem Einkauf; offene Verbrauchsentscheidungen gehen nicht unter;
die Bestellung ist ein Beleg; die Einkaufsliste wird einmal umgebaut.
**Punkte:** M-5, M-6, M-7, M-9, D3-C6, D3-C10, D3-T16, D3-P8, D3-P9. **Dazu Teile von:** D3-16 (überfälliger Liefertermin in der Einkaufsliste).
**Voraussetzung:** Paket 6 (M-3 vor M-5), Pakete 8 bis 11 für die Einkaufsliste. Verdacht M-6.
Entscheidungen E-M7 (gilt), E-P, E-W1.
**Schritte:** (a) M-5: nach einem Preisupdate schlägt der Laufbericht neue Verkaufspreise vor
(Merker „kalkuliert / fest“), übernommen wird nach Bestätigung. (b) M-6: Zähler und Liste
„Verbrauch offen“; die Frage nach einer Unterschrift ohne Netz; „Buchung zurücknehmen“, solange
der Schein nicht verrechnet ist (Grenze 37). (c) M-7: mehrere Personen je Fahrzeug. (d) M-9:
Bestellung als Beleg mit Nummer, Stand, Lieferort; Versand über „Belege per Mail“, das
Mailprogramm bleibt daneben. **Mit (d) die Einkaufsliste:** je Großhändler die eine Hauptaktion
„Bestellen …“ (D3-C6), Leerzustände mit erstem Schritt (D3-C10), Blätter, die meist nichts
tragen, zugeklappt (D3-T16), Zeilen (D3-P8, D3-P9), überfälliger Liefertermin mit Zeichen (D3-16
Teil). (e) CSV des Inventur-Protokolls mit Einkaufspreis für die Spitze (Grenze 38).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| M-5 | Der Merker „kalkuliert / fest“ ist der Schutz. Vorgeschlagen wird im Laufbericht nach der Übernahme, nicht im Probelauf. Voraussetzung M-3; Artikel mit abweichender Einheit werden nicht nachgezogen. Dem Auftraggeber sagen: Altpreise gelten als „fest“, die Funktion zieht im ersten Jahr fast nichts nach. |
| M-6 | Teil (1) des Vorschlags ist gebaut — nicht noch einmal bauen. Zu bauen bleiben Zähler und Liste „Verbrauch offen“ und der Fall ohne Netz. |
| M-7 | `app.eigenes_fahrzeug` allein reicht nicht: `schein_verbrauch_vorschlag`, `laden_umschalten`, `person_auskunft`, `person_loeschen`, `fahrzeug_speichern` fragen `standardfahrer_uid` direkt; in der App `eigeneFahrzeugOrte`, `abhakOrte`, `OrderView`, `MeinFahrzeug`. Die Regel von `laden_umschalten` für Poolfahrzeuge ohne Standardfahrer bleibt. |
| M-9 | Der Weg über das Mailprogramm bleibt daneben stehen — ein Betrieb ohne eingerichteten Versand muss weiter per Mail bestellen können. |
| D3-C6 | Gebaut wird je Großhändler die eine Hauptaktion „Bestellen …“, nach M-9. „Geliefert …“ bleibt in der Zeile (E-W1). Bleibt außerdem: „Alles geliefert …“, „Termin ändern“, „Liste für eine E-Mail zu lang“, „Keine Bestelladresse — unten eintragen“. |
| D3-C10 | Entschieden (E-F32): die Leerzustände tragen den ersten Schritt; „Material dazusetzen“ bleibt als Blatt im Reiter „Einkauf“ (die Hauptaktion der Seite gehört D3-C13). Das Formular „Material dazusetzen“ bleibt unverändert. |
| D3-P8 | Bei 375 px brechen die drei Zeilenknöpfe heute schon in zwei Reihen; Form nach Regel 5 in Abschnitt 7.3, die Knöpfe bleiben. |

**Bleibt gleich laut Papier, je Punkt:**

| Punkt | Bleibt gleich (Wortlaut des Papiers; die Vorgaben oben gehen vor) |
|---|---|
| D3-C6 | PDF ohne Bestellen bleibt möglich; Teillieferung; Storno mit Grund. Rückschritt: „Geliefert“ braucht mehr als zwei Tipps |
| D3-C10 | Formular „Material dazusetzen“ unverändert |
| D3-P8 | drei Zeilenaktionen bzw. D3-C6 |
| D3-P9 | – |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| M-5 | Papier 5, Befund M-5 (Aufwand dort: m) | Datenbankprüfung (kalkuliert folgt, fest bleibt, Vorschau ändert nichts); Gegenprobe: ohne Merker bleibt der alte Preis (rot). | `katalogLagerAufschlag.test.ts` („nur wo keiner steht“), ausgestellte Belege (Preise stehen in den Positionen fest). |
| M-6 | Papier 5, Befund M-6 (Aufwand dort: k–m) | Datenbankprüfung (Zahl sinkt nach Buchen und nach „nicht abbuchen“; Rechte), Komponentenprüfung für das Öffnen nach dem Unterschreiben. Gegenprobe: heutiger Stand öffnet nichts (rot). | nichts wird von selbst gebucht; `scheinVerbrauch.test.ts`; ohne Netz unterschreibt der Schein wie bisher (die Frage entfällt dann und steht später in der Zeile). |
| M-7 | Papier 5, Befund M-7 (Aufwand dort: m) | Datenbankprüfung (weiterer Fahrer liest, lagert zurück, bucht Verbrauch; ein Dritter nicht), `eigeneFahrzeugOrte` als Einheitenprüfung; Gegenprobe: ohne Tabelle abgewiesen (rot). | der Standardfahrer und seine Vorbelegungen (Zeiterfassung, Rüstliste); `lagerorte`-Prüfungen. |
| M-9 | Papier 5, Befund M-9 (Aufwand dort: g) | Datenbankprüfungen (Nummer lückenlos je Jahr, Stand eingefroren, Storno und Teillieferung je Zeile), `Einkaufsliste.test.tsx`; Gegenprobe: ohne Migration fehlt der Beleg. | Zeilen, die vor dem Umbau bestellt wurden (ohne `bestellung_id`), laufen wie heute bis „Geliefert“; `einkauf.test.ts`, `bestellungStornoTeillieferung.test.ts`, `wareneingangBestellung.test.ts`. |

**Bleibt gleich (Paket):** Zeilen, die vor dem Umbau bestellt wurden, laufen wie heute bis
„Geliefert“; „Geliefert …“, „Stornieren …“ und „Termin ändern“ bleiben in der bestellten Zeile;
`einkauf.test.ts`, `bestellungStornoTeillieferung.test.ts`, `wareneingangBestellung.test.ts`;
Rechnung und Angebot gehen über den Belegversand unverändert hinaus;
`WorkSheetsListView.test.tsx:1301` („öffnet den markierten Schein im Fenster“).
**Risiko:** M-9 berührt den Belegversand (Edge Function, Prüfregel der Art). **Aufwand:** (a) 3–4;
(b) 2–3; (c) 4–5; (d) 10–12 samt Einkaufsliste; zusammen 19–24.

#### Paket 26 — Plattform, Datenschutz, Härtung

**Ziel:** Der Betrieb erfährt von einem Notzugang; das Löschen eines Betriebs lässt sich
abschließen; Regeln und Berichte sind vollständig.
**Punkte:** S-3, S-4, S-7, S-8, S-11, S-12, N-S-3, N-S-4, N-S-5.
**Voraussetzung:** Paket 1. Verdacht S-1, S-5, S-7, S-8 geklärt. Entscheidungen E-S, E-F17.
**Schritte:** S-3 (Löschen eines Betriebs lässt sich fortsetzen); S-4 (Notzugang und Einblick auf
der Startseite der Leitung und als Push ohne Grund); S-7 mit N-S-3 (Speicherregel der Scheinfotos
an den Ersteller gebunden; Anlegen nur am offenen Schein); S-8 (Grenze benennen, die Maske nennt
den Ausweg); S-11 (Inhaltsregel auf die eigene Instanz); S-12 (Bericht nach „Person löschen“
vollständig); N-S-4 (Rollenprüfungen als `… is not true`); N-S-5 (Obergrenze für die
UID-Prüfung); `passwort_hilfe_anfragen` zählt je Betrieb (Grenze 51); Sitzungsdauer in
`config.toml` und in einer Prüfung (Grenze 47); E-S: der Supportzugang mit „Mitarbeiten“ schreibt
weiter keine Scheine und bearbeitet keine Eingänge — der Text in `SupportzugangView.tsx:207` und
`:230` und die Grenzen-Übersicht nennen das, ebenso „Umplanen geht im Einblick nicht“.

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| S-3 | Die übrig gebliebenen Kennungen stehen in `betrieb_zustand.konten_offen` und sind nach dem Entfernen wieder leer — nicht im Protokoll (dort blieben Kennungen gelöschter Personen auf Dauer). |
| S-4 | Entschieden (E-F17): der Push nennt den Grund nicht (er ist Freitext der Plattform und stünde am Sperrbildschirm); der Grund steht auf der Startseite der Leitung. Monteure und Büro ohne Leitungsrolle bekommen nichts. Push hängt am Gerät (E69) — benannte Grenze. |
| S-7 | Die Ausnahme „oder es gibt ihn noch nicht“ lässt weiter jedes Konto Dateien unter beliebiger Schein-Kennung ablegen — benennen. Die Regel fürs Anlegen braucht zusätzlich „Schein offen oder noch nicht da“ (N-S-3). |
| S-8 | Grund der Grenze: der Anmeldedienst führt eine Adresse einmal. |
| S-11 | `vite.config.ts:117` und `sicherheitsKopfzeilen.test.ts` lesen `firebase.json` direkt: wird die Datei erzeugt, prüft die Prüfung die erzeugte Fassung. Den vorhandenen Baustein `vorschauKopfzeilen` nehmen. |
| S-12 | „Als Ganzes neu schreiben“ ist richtig; der Vergleich „alle bisherigen Einträge unverändert“ als eigene Prüfung. |
| N-S-3 | Mit S-7: die Regel fürs Anlegen braucht „Schein offen oder noch nicht da“. |
| N-S-4 | Jede Rollenprüfung in angefassten Funktionen als `… is not true` oder mit `coalesce(…, false)`. Schon in Paket 1 für die dort angefassten Funktionen. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| S-3 | Papier 6, Befund S-3 (Aufwand dort: m) | Edge-Prüfung mit einem Konto, dessen Löschung beim ersten Lauf scheitert (Konto vorab im Anmeldedienst sperren ist kein Fehlschlag — stattdessen die Liste von Hand um eine unbekannte Kennung ergänzen und prüfen, dass 404 als erledigt zählt, sowie einen zweiten Aufruf nach abgebrochenem ersten). Gegenprobe: heute antwortet der … (weiter im Papier) | Reihenfolge Dateien → Zeilen → Konten; die Bestätigung durch Eintippen der Kennung; `betriebeDeaktivierenLoeschen.test.ts` unverändert grün. |
| S-4 | Papier 6, Befund S-4 (Aufwand dort: m) | Datenbank (Notzugang → Ereignis an `push-melden` mit den Kennungen der Spitze, nicht an Monteure), Startseite (Zeile erscheint, verschwindet nach Kenntnisnahme). Gegenprobe: ohne den Auslöser geht kein Ereignis hinaus. | Der Notzugang selbst (Grund, 1–24 h, nur lesend), Widerruf durch den Betrieb, `supportzugang.test.ts`, `supportArbeitetMit.test.ts`. |
| S-7 | Papier 6, Befund S-7 (Aufwand dort: k) | `mandantenTrennung`-artige Probe „Kollege überschreibt Foto im fremden Entwurf“ → 403; Gegenprobe heute 200. | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| S-8 | Papier 6, Befund S-8 (Aufwand dort: k) | `mitarbeiterAnlegen`-Edge-Prüfung (409 trägt `vorschlag`), Komponente (Knopf belegt vor). Gegenprobe: heute bleibt das Formular mit der Meldung stehen. | keine Auskunft über fremde Betriebe (Testbericht G12); Regeln für Benutzernamen in Browser und Function gleich. |
| S-11 | Papier 6, Befund S-11 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| S-12 | Papier 6, Befund S-12 (Aufwand dort: k–m) | im Papier nicht eigens benannt — vor dem Bau festzulegen | nichts Aufbewahrungspflichtiges wird gelöscht oder verändert (unterschriebene Scheine sind eingefroren — der Name dort bleibt); der Probelauf fasst weiter nichts an; `personLoeschen.test.ts`, `kontoUmstellungenLoeschen.test.ts`, `loeschBezeichnungen.test.ts`. |

**Bleibt gleich (Paket):** der Notzugang selbst (Grund, 1–24 Stunden, nur lesend), Widerruf durch
den Betrieb; `supportzugang.test.ts`, `supportArbeitetMit.test.ts`;
`betriebeDeaktivierenLoeschen.test.ts`; mit „ansehen“ ändert kein Aufruf eine Zeile.
**Risiko:** S-11: wird `firebase.json` zur erzeugten Datei, ist die ausgelieferte Kopfzeile
ungeprüft, solange die Prüfung die Quelle liest. **Aufwand:** 7–9 Tage (Fassung 1: 5–6, laut
Prüfer knapp).

### Stufe E — Technik

#### Paket 27 — Auslieferung

**Ziel:** Nach der Auslieferung steht fest, dass die neue Fassung läuft; die Kette ist gehärtet.
**Punkte:** S-9, L-8, L-10, L-15.
**Voraussetzung:** Paket 2. Kann jederzeit vorgezogen werden.
**Schritte:** L-8 (nach dem Deploy prüft ein Schritt `/fassung.txt` gegen den Commit; Rücksprung
beschrieben und einmal durchgeführt); L-10 (Node 22 und feste Werkzeugfassungen überall); L-15
(Wächter für die Reihenfolge der Migrationen); S-9 vollständig (im Auftrag `einspielen` entfällt
`npm ci`; fremde Actions auf Commit-Kennung; Secrets an eine GitHub-Umgebung; die Grenze mit Grund
in `CLAUDE.md` und `DEPLOYMENT.md`; Wächter über die Workflow-Dateien).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| S-9 | Im Auftrag `einspielen` kann `npm ci` ganz entfallen (`edge-shared-uebernehmen.mjs` importiert nur `node:`-Module). Dazu: fremde Actions auf Commit-Kennung, Secrets an eine GitHub-Umgebung, die Grenze in `CLAUDE.md` und `DEPLOYMENT.md` mit Grund benennen, Wächter über die Workflow-Dateien. `npm run gemeinsames` steht in Zeile 154. |
| L-8 | Der Prüfschritt nach dem Rücksprung braucht die erwartete Kennung als Eingabe. In den Text: der nächste Merge liefert den kaputten Stand wieder aus, solange er nicht zurückgenommen ist. |
| L-10 | `firebase-tools` als `devDependency` zieht mehrere hundert Pakete in jedes `npm ci`; die genaue Fassung am `npx`-Aufruf ist der kleinere Eingriff (Abwägung). |
| L-15 | Der Vergleich mit `origin/main` braucht im Auftrag die Geschichte des Zielzweigs. Dicht wird es erst mit „Zweig muss aktuell sein“ am Zielzweig oder derselben Prüfung auf `main` vor `db push`. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| S-9 | Papier 6, Befund S-9 (Aufwand dort: k) | ein Wächter in `tests/unit` liest die Workflow-Dateien (jedes `uses:` fremder Herkunft mit 40-stelliger Kennung; kein `npm ci` ohne `--ignore-scripts` in einem Auftrag, der `secrets.SUPABASE_` nennt). Gegenprobe: heutige Dateien rot. | Reihenfolge prüfen → einspielen → Functions → App; kein Pfadfilter auf `main` (begründet im Kopf der Datei). |
| L-8 | Papier 7, Befund L-8 (Aufwand dort: k/m) | `tests/unit/auslieferungsKette.test.ts` um „nach dem Deploy wird die Fassung geprüft“ erweitern (Gegenprobe: ohne den Schritt rot). | die Kette Schema → Functions → App, nur `main` liefert aus (bestehende Fälle derselben Datei). |
| L-10 | Papier 7, Befund L-10 (Aufwand dort: k) | `auslieferungsKette.test.ts` „alle Workflows nennen dieselbe Node-Fassung“ (Gegenprobe rot am heutigen Stand). | Bau und alle Prüfungen grün unter 22 — lokal ist das der heutige Zustand. |
| L-15 | Papier 7, Befund L-15 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | `--include-all` bleibt, damit ein übersprungener Lauf nichts liegen lässt. |

**Risiko:** gering. **Aufwand:** 3–4 Tage.

#### Paket 28 — Prüfungen und Ordnung

**Ziel:** Träge Prüfungen sind nach ihrer Ursache berichtigt; Texte und Grenzen-Dokument
beschreiben den heutigen Stand.
**Punkte:** L-5, L-13, L-14, L-16.
**Voraussetzung:** keine.
**Schritte:** L-13 (die fünf trägen Prüfungen nach der gemessenen Ursache berichtigen, nicht die
Frist erhöhen); L-14 (toter Code: je Fund entscheiden); L-16 und L-5 (Texte); das
Grenzen-Dokument auf den Stand von Abschnitt 4.10 bringen (überholte Zeilen streichen, unbenannte
Grenzen mit Grund nachtragen, Begründungen ersetzen); die Sätze fürs Handbuch (geteiltes Tablet).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| L-13 | Den Suchverzug nur im Helfer überbrücken, nicht in `setup.ts` für alle Ansichtsprüfungen: sechs Prüfungen bauen auf den Verzug. |
| L-14 | `monthly_stats` nicht entfernen (`person_auskunft` und `person_loeschen` lesen sie, die alte App auch). Je Fund entscheiden; `zeitkonto_monate` und `monatsbilanzen_alle` stehen in `LESENDE_FUNKTIONEN` — beim Entfernen mitnehmen. Über `zeitkontoMonate` entscheidet erst die Idee I-L1. Bedingung: eine noch im Gerät liegende App-Fassung ruft die Funktion nicht mehr. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| L-5 | Papier 7, Befund L-5 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| L-13 | Papier 7, Befund L-13 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |
| L-14 | Papier 7, Befund L-14 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | `datenschichtVertrag.test.ts` und `vorschauErsatz.test.ts` grün. |
| L-16 | Papier 7, Befund L-16 (Aufwand dort: k) | im Papier nicht eigens benannt — vor dem Bau festzulegen | im Papier nicht eigens benannt — vor dem Bau festzulegen |

**Bleibt gleich (Paket):** die Sicht `monthly_stats`; `tests/supabase/schmaleAbfragen.test.ts`
(Vergleichsregel `ohneEinsatzListe`); die sechs Prüfungen, die auf den Suchverzug bauen.
**Risiko:** gering. **Aufwand:** 4–5 Tage.

#### Paket 29 — Skalierung

**Ziel:** Keine stille Obergrenze mehr in Akten, Planung und Nachkalkulation.
**Punkte:** Z-16, P-3, G-15, L-3, L-6, N-L-3. **Dazu Teile von:** L-4 (Schritt 3: Messung der Kleinstbausteine); L-12 (Nachladen der herausgelösten Fenster).
**Voraussetzung:** Pakete 1 und 7. Verdacht Z-8, G-3, M-1, M-2, L-4 (messen). Entscheidung E-F18.
**Schritte:** L-3 (Akten holen Rechnungsköpfe, das Fenster holt die eine Rechnung); P-3 (Planung
und Startseite lesen Baustellen über eine Auswahlfunktion statt „höchstens 500“); G-15
(Nachkalkulation über alle Baustellen mit dem Kostensatz „gültig ab“); L-6 (Liste der Seiten über
dem Budget B3 aktuell, je Seite abgearbeitet); Z-16; N-L-3 (Spaltenliste der Monatsbuchungen);
„zuletzt angefordert“ als kleine Datenbankabfrage (Grenze 44); L-4, Schritt 3 (Messung der
Kleinstbausteine); L-12, zweiter Schritt (Nachladen der herausgelösten Fenster — nur nach
Messung; die Grenzen des Leistungsbudgets werden nicht angehoben).

**Vorgaben aus der Gegenprüfung:**

| Punkt | Vorgabe aus der Gegenprüfung (gilt beim Bau) |
|---|---|
| P-3 | „N am Budgetlimit“ rechnet heute über Aktiv und Pausiert, `baustellen_budget_lage` nur über Aktiv. Entschieden (E-F18): die Zahl zählt weiter aktive und pausierte Baustellen — die neue Auswahl rechnet beide. Voraussetzung: `baustellen_liste` läuft im Support-Einblick (Paket 1). |
| L-3 | `KOPF_SPALTEN` enthält `company_id` — bleibt. Die Gesamtzahl braucht eine eigene Zählung (das `limit` deckelt auch `count`). Die Baustellenakte braucht weiter alle Köpfe (`abschlussReif`). |
| L-6 | Die Baustellenauswahl zeigt heute alle laufenden Baustellen, fremde „wählbar“. „Bleibt gleich“: fremde Baustelle ohne Umweg wählbar, vorgegebene Baustelle aus dem Link, Ausweichweg bei keiner laufenden, „pausiert getrennt“. |
| N-L-3 | Welche Felder Streifen, Fenster, Tagesnachweis und Lohn-CSV lesen, ist nicht zusammengetragen — zuerst das. |

**Prüfung mit Gegenprobe und „bleibt gleich“ laut Papier:**

| Punkt | Bauanleitung | Prüfung mit Gegenprobe (Wortlaut des Papiers) | Bleibt gleich (Wortlaut des Papiers) |
|---|---|---|---|
| Z-16 | Papier 1, Befund Z-16 (Aufwand dort: k) | 600 Anträge, Rest stimmt; Gegenprobe: mit der Grenze falsch. | die Liste „Meine Anträge“ zeigt weiter die jüngsten. |
| P-3 | Papier 3, Befund P-3 (Aufwand dort: m) | Datenbankprüfung mit 520 aktiven Baustellen (Zahl 520, erste Seite 20, Suche findet die 519.; Gegenprobe mit dem alten Weg: 500). Startseite gegen Zielseite: dieselben Zahlen aus derselben Funktion. `planungAblage.spec.ts` (3.195 Baustellen) muss grün bleiben. | was „Noch einzuplanen“ bedeutet (laufend, nicht pausiert, kein Einsatz in der gezeigten Woche), Ziehen aus der Schublade, Einklappen, die Regeln der Startseite (`startseite*.test.ts`, `leitungEinsatzlage`). |
| G-15 | Papier 4, Befund G-15 (Aufwand dort: m) | `nachkalkulation.test.ts` (Stunden vor und nach dem Wechsel), Ansichtstest (Baustelle jenseits der 300 ist wählbar). | ein Betrieb mit einem einzigen Satz rechnet auf den Cent wie heute. |
| L-3 | Papier 7, Befund L-3 (Aufwand dort: m) | `KundenakteView.test.tsx` und `BaustellenakteView.test.tsx` je „holt nur Köpfe; das Fenster holt die eine Rechnung“; Gegenprobe: mit dem heutigen Stand wird `listInvoicesByIds` nie gerufen. | Reihenfolge und Inhalt der Zeilen, Öffnen und Schließen des Fensters (bestehende Fälle aus E99), die Regel „Rechnungen der Akte werden nicht gemerkt“. |
| L-6 | Papier 7, Befund L-6 (Aufwand dort: m je Seite) | im Papier nicht eigens benannt — vor dem Bau festzulegen | jede wählbare Baustelle bleibt erreichbar (`BaustellenSelectGanz.test.tsx`), die Angebotsliste zeigt dieselben Zeilen und Summen (`QuotesView.test.tsx`). |

**Bleibt gleich (Paket):** Reihenfolge und Inhalt der Zeilen der Akten; `importierenEinstieg = 0`;
`leistungswaechter.test.ts`; `InvoicesView.test.tsx` beim Nachladen der Fenster (die Prüfungen
dürfen das Fenster nicht im selben Zug erwarten — sonst bleibt es fest eingebunden).
**Risiko:** je Punkt eine Messung vorher und nachher. **Aufwand:** 8–10 Tage.

---

## 10. Entscheidungen des Auftraggebers

Drei getrennte Teile. **Teil 1:** am 23.11.2026 entschieden und von der Gegenprüfung nicht
beanstandet. **Teil 2:** am 23.11.2026 entschieden, aber die Empfehlung der Fassung 1 hielt der
Gegenprüfung nicht stand — neu vorgelegt. **Teil 3:** neu offen — Fragen, die Fassung 1
stillschweigend beantwortet hatte oder die die Prüfer aufgeworfen haben. Am Ende steht, was auf
die Kanzlei wartet und deshalb **nicht** als entschieden gilt.

Eine Empfehlung in Teil 2 und Teil 3 ist immer **eine** eindeutige, baubare Aussage. Wo ein
Vorschlag eine frühere Entscheidung zurückdrehen, eine Funktion wegnehmen oder etwas einen Tipp
weiter weg legen würde, lautet sie „bleibt, wie es ist“ — außer ein Prüfbericht nennt einen
klaren, belegten Gewinn ohne Verlust. Wo ein Prüfer eine Empfehlung der Fassung 1 widerlegt hat,
steht seine Fassung. Ideen ohne Befund, deren Nutzen ohne Verlust nicht belegt ist, sind
„zurückgestellt — neue Entscheidung nötig“.

### 10.1 Teil 1 — entschieden am 23.11.2026 und von der Gegenprüfung nicht beanstandet

Wortlaut des Auftraggebers: „alles wie von dir empfohlen, aber noch nicht mit der umsetzung
starten“. Diese sechs gelten.

| Nr. | Frage | Entschieden | Anmerkung aus der Gegenprüfung |
|---|---|---|---|
| E-R | Reihenfolge A → B → C → D, E begleitend? | ja | Die Stufen gelten; der Schnitt innerhalb der Stufen ist nach Bericht 0 berichtigt (Abschnitt 9.1 und 9.2). „Paket 1 sofort“ heißt: zuerst, sobald es ein Startsignal gibt |
| E-M7 | Mehrere Personen je Fahrzeug? | ja | Bericht 5: `app.eigenes_fahrzeug` allein reicht nicht — Vorgabe in Paket 25 |
| E-G12 | Nummernschema der Rechnung einstellbar (durchlaufend, Startwert)? | ja, nur für künftige Nummern | Bericht 0: der Kontoauszug-Abgleich muss dem Schema folgen — Schritt in Paket 24 |
| E-G13 | Einnahmen-Ausgaben-Rechner und Istbesteuerung unterstützen? | erst nach dem Gespräch mit der Kanzlei | bleibt so (K-1) |
| E-Z3 | Auszahlung von Überstunden als Abgang im Zeitkonto bauen? | ja | Bericht 1: Pflichteingang oder Prüfung über jeden Aufrufer; die Spalte der Lohn-Datei entsteht hier — Vorgabe in Paket 21 |
| E-Z11 | Arbeitsjahr je Person als Urlaubsjahr? | ja, als Einstellung je Betrieb | Bericht 1: vor dem Bau die Kanzlei zu Fundstelle und Verfall (K-9); der Umgang mit laufenden Ansprüchen wird vor dem Bau festgelegt |

### 10.2 Teil 2 — neu vorgelegt nach der Gegenprüfung

**Der Auftraggeber hat am 23.11.2026 erklärt: „alle offenen und überdachten entscheidungen wie
von dir neu empfohlen“. Damit gilt je Zeile die Spalte „Neue Empfehlung“ als entschieden. Ein
Startsignal ist das nicht.**

| Nr. | Zuerst entschieden (Empfehlung der Fassung 1) | Was die Gegenprüfung gefunden hat | Neue Empfehlung |
|---|---|---|---|
| E-T | „Textregel (Abschnitt 5) in `style.md` aufnehmen; Untertitel der Seitenköpfe in die Hilfe? — ja“ | Regel 1 ändert E86 („ab dem Tablet bleibt der Plankopf“) und stößt an E25, ohne es zu sagen (Bericht 12, Abschnitt 4 Nr. 7; Bericht 0, 6.2 Nr. 8 — dort: „in Ordnung; als ‚ändert E86‘ kennzeichnen“). Der Weg in die Hilfe ist am Handy seit E86 gebaut; der Dateiname des Kontoauszugs verschwände mit (Berichte 10 und 11). Regel 5 „höchstens zwei Textzeilen“ ist mit langen Namen nicht haltbar (Bericht 10, Abschnitt 4; Berichte 9, 11, 12). Regel 6 stößt an E99 (Bericht 0, 6.2 Nr. 3). Muster 4 enthielt das widerlegte D3-T4 (Bericht 11) | Die Textregel kommt in der Fassung von Abschnitt 6.3 in `style.md`: die Beschreibung steht auch ab dem Tablet in der Hilfe (das ändert E86 an dieser einen Stelle), die vier Seiten aus E25 behalten ihren Untertitel, eine Handy-Zeile trägt den Namen und höchstens zwei Angaben, Karten mit nächstem Schritt im Leersatz bleiben offen (E99), und der Zahlungsblock der Rechnung behält seine festen Zeilen |
| E-P | „Punktregel (Abschnitt 6) in `style.md` aufnehmen; Wächter ‚höchstens ein Punkt je Zeile‘? — ja“ | Mehrere Ersatzformen tragen bei 375 px mit langen Namen nicht (D1-P1, P4, P10: Bericht 9; D2-P1, P3, P5: Bericht 10; D4-P2: Bericht 12); feste Spalten passen nicht in die halbe Breite aus E98 (D3-P1, P2: Bericht 11); „Zähler rechts“ stößt an E98 und E99 (Berichte 9, 12); Papier 8 nennt „höchstens zwei“; die Zählweise war nicht festgelegt; `Angaben` gibt es nicht (Bericht 0, 4.3 Nr. 21; 6.1 Nr. 5, 6; 6.2 Nr. 9) | Die Punktregel kommt in der Fassung von Abschnitt 7.3 in `style.md`: höchstens ein Punkt je sichtbarer Textzeile, ein Wächter mit Ausnahmeliste der heutigen Fundstellen, und eine Ersatzform wird nur gebaut, wenn sie bei 375 und 834 px nicht mehr Zeilen braucht als die heutige Zeile — sonst bleibt die Zeile und steht als benannte Ausnahme in der Liste |
| E-D | „Anrede überall ‚du‘ (heute im Kontoauszug ‚Ihrer‘)? — ja“ | Wörtlich genommen eine Verschlimmbesserung: die Kundenseite der Annahme, Mailtexte und Belege sprechen den Kunden des Betriebs an (Bericht 0, 6.2 Nr. 10; Abschnitt 11 Nr. 13). D3-T22 meint nur die Bedienoberfläche; eine weitere Stelle ist `InvoicesView.tsx:3640` (Bericht 11) | „du“ gilt in der Bedienoberfläche für angemeldete Nutzer; die Kundenseite der Annahme, alle Mailtexte und alle Belege bleiben beim „Sie“ — mit einer eigenen Prüfung für beide Seiten |
| E-N | „‚Neu in dieser Liste‘: runder Kreis (E76) bleibt in Listen; im Fenster neben einer gefüllten Hauptaktion gerahmt (U4)? — ja“ | E76 nennt „Termin anlegen“ im Tagesfenster und in der Handy-Woche ausdrücklich als Auftrag; die Empfehlung nahm das im Fenster zurück, ohne es zu sagen, und regelte das Handy nicht (Bericht 12, D4-B15 und Abschnitt 4 Nr. 5; Bericht 0, 6.2 Nr. 1 und 7). Der Vorschlag D2-A9 (a) widerspricht E76 (Bericht 10) | E76 bleibt unverändert: der runde Kreis bleibt in Listen, in Kartenköpfen, im Tagesfenster und in der Handy-Woche; D2-A9 und D4-B15 werden nicht gebaut; die abweichenden Text-Knöpfe im Blattkopf einer Liste (D3-B15) werden nach E76 zum Kreis |
| E-E | „Einstellungen: ein Speichermodell (Speicherleiste je Seite; sofort nur Module und Mein Konto)? — ja“ | Die Trennung „sofort nur Module und Mein Konto“ ist schon der Stand; der Schalter, der mit „Speichern“ gilt, ist von E95 verlangt; die Leiste je Blatt ist die geschriebene Regel (`style.md` U1, Muster 3); eine Leiste je Seite stünde am Schreibtisch bis zu 1.650 px unter dem Feld und verlöre „Verwerfen je Blatt“, den Teilerfolg, die Rechte je Blatt (Bericht 12, Abschnitt 3; Bericht 0, 4.3 Nr. 16 und 6.2 Nr. 4) | Der Schalter bleibt überall Schalter (E95) und die Speicherleiste bleibt je Blatt (`style.md` U1); neu kommen nur der Zusatz „noch nicht gespeichert“ an der Schalterzeile und am Handy die Regel, dass nur die Leiste des zuletzt geänderten Blatts klebt; der Absatz „Schalter und Kästchen“ in `style.md` wird auf E95 berichtigt |
| E-M | „Monatsansicht am Tablet: Tag öffnet das Tag-Fenster statt Tastflächen unter 44 px? — ja“ | Die Fassung stand in keinem Papier, behebt die 18 px breiten Tagesköpfe nicht und ersetzt die Vorschau, die Paket 12 unter „bleibt gleich“ führte. Das Papier nennt zwei Wege: seitlich rollen mit Spalten ab 44 px, oder die Handyform bis 1.199 px (Bericht 12, Abschnitt 3; Bericht 0, 4.3 Nr. 14). Papier 8 und Bericht 8: das Monatsraster ist als dichtes Raster entschieden (E88) | Unter 1.200 px rollt der Monat seitlich mit Spalten ab 44 px; er bleibt Personen × Tage, die Vorschau je Tag und je Einsatz bleibt, und ab 1.200 px steht der ganze Monat ohne Rollen wie heute |
| E-S | „Supportzugang: sollen Scheine und Auftragseingänge im Einblick sichtbar sein? — ‚Nur ansehen‘: ja, wie Baustellen; sonst als Grenze benennen“ | Die Frage war falsch gestellt: sichtbar sind beide schon. Offen war, ob der Support mit „Mitarbeiten“ Scheine schreiben und Eingänge bearbeiten darf, und ob „Umplanen geht im Einblick nicht“ in die Grenzen-Übersicht kommt (Bericht 6, Abschnitt 4) | Es bleibt, wie es ist: der Support mit „Mitarbeiten“ schreibt keine Scheine und bearbeitet keine Eingänge; das und „Umplanen geht im Einblick nicht“ werden im Text des Supportzugangs und in der Grenzen-Übersicht benannt (Grund: ein Schein ist ein Beleg mit Unterschrift, über Aufträge entscheidet der Betrieb; Abwesenheiten liest nur der Betrieb) |
| E-A13 | „Darf die Verwaltung Angebote schreiben (Führung gibt frei)? — als Einstellung je Betrieb“ | Das Papier schlägt ein Zusatzrecht je Person vor (wie `kundenPflegen`), entschieden wurde „je Betrieb“ (Bericht 2, A-13) | Die Verwaltung schreibt Angebote über ein Zusatzrecht je Person (wie `kundenPflegen`); Annehmen, Rücknahme und Link bleiben bei der Führung |
| E-Z14 | „‚Wegzeit zählt als Arbeitszeit‘ als Einstellung je Betrieb? — ja“ | Geht weiter als das Papier (nur benennen; die Einstellung erst nach fachlicher Klärung); sie änderte Saldo, Überstunden, Arbeitszeitgrenzen und die Monats-CSV und berührt E63; die Frage an die Kanzlei fehlte (Bericht 1, Abschnitt 4 Nr. 6) | Die Grenze „Wegzeit zählt nicht als Arbeitszeit“ wird jetzt benannt; **die Einstellung wartet auf die Kanzlei (K-5) und gilt nicht als entschieden** |

### 10.3 Teil 3 — neu offen

**Der Auftraggeber hat am 23.11.2026 erklärt: „alle offenen und überdachten entscheidungen wie
von dir neu empfohlen“. Damit gilt je Zeile die Spalte „Neue Empfehlung“ als entschieden. Ein
Startsignal ist das nicht.**

**a) Aus der Vermessung**

| Nr. | Frage | Neue Empfehlung | Quelle |
|---|---|---|---|
| E-V1 | Je Schriftstufe eine feste Zeilenhöhe (V-B1)? | Nein — es werden nur die Stellen angeglichen, an denen zwei Zeilenhöhen derselben Stufe sichtbar nebeneinander stehen (`/settings/module`, Kundenakte); Paket 9 | Bericht 8, Abschnitt 4: als Regel nicht umsetzbar, bräche den Zeilentakt 48/72 px aus E33 |
| E-V2 | Titelskala nach Rollen (V-B2)? | Ja — Seite 30/28, Fenster 20, Blatt 18, Gruppe 16 als Rollen in `style.md`; jede Abbildung von 17, 19 und 22 px wird einzeln im Bild gemessen; `start-einsatz-titel` (22/30), der 17-px-Titel der Planung, die Höhe von `arbeitstag-start` und der Gesprächskopf in Serif bleiben; Paket 10 | Bericht 8, Abschnitt 4: „als Entscheidung tragfähig“, mit genau diesen Vorbehalten |
| E-V3 | Gemessenes in Begleitzeilen in Mono (V-B3)? | Ja für Nummern und Zeiten, über den Baustein „Nummer“ in der Schriftgröße der Zeile, umgestellt nur dort, wo eine Zeile in Stufe C ohnehin umgebaut wird; das Datum in Meta-Zeilen bleibt in DM Sans | Bericht 8, Abschnitt 4: nachgestellt fast ohne Verschiebung; das Risiko liegt im Umbau — „nur zusammen mit“ den Zeilenumbauten |
| E-V4 | Radius des kleinen Knopfs: 8 px (`knopf.ts`, geprüft) oder 12 px (`style.md`)? (V-14) | Bleibt bei 8 px; `style.md` nennt den kleinen Knopf als benannte Ausnahme | Bericht 8, V-14 |
| E-V5 | Kalendertage der Monatsplanung am Handy 41 px breit (N-V-1)? | Bleibt, wie es ist — benannte Ausnahme im Tastflächen-Wächter (sieben Spalten bei 390 px; die Höhe von 68 px reicht) | Bericht 8, V-5: `blattKanten.test.ts:78` hält das Raster fest |

**b) Fragen, die Fassung 1 stillschweigend beantwortet hatte oder die die Prüfer aufgeworfen haben**

| Nr. | Frage | Neue Empfehlung | Quelle |
|---|---|---|---|
| E-F1 | Zähler am Kartentitel: rechts im Kopf oder in Klammern am Titel? | Eine Form — die Zahl in Klammern am Titel („Zu erledigen (10)“); „noch 1 von 2“ an der Rüstliste und „3 Rechnungen“ im Kopf (E99) bleiben | Bericht 12, D4-P3 (das Papier empfiehlt die häufigere Form); Bericht 9, D1-P8 (E98, E99); Bericht 0, 6.1 Nr. 6 |
| E-F2 | Eine Form für Gruppen- und Abschnittsköpfe? | Bleibt, wie es ist — die vorhandenen Formen werden in `style.md` als Rollen benannt, umgestellt wird nichts | Bericht 8, V-B5 („beides ist entschieden“, E92); Bericht 12, D4-B2 (Wächter deckt die normale Form); Bericht 0, 6.1 Nr. 7 |
| E-F3 | Kalkulierte Stunden und Budget („240 h“) auf „HH:MM Std“ umstellen? | Bleibt, wie es ist — Kalkulation und Budget in Dezimalstunden, gebuchte Zeit in „HH:MM Std“ | Bericht 0, 7.3 (Paket 6): „eine Entscheidung, keine Formatierung“; Bericht 9, D1-B5 |
| E-F4 | Die Liste „Später“ (Kontextmenü, Blatt in zwei Höhen, Zahl am App-Zeichen, Startbild, Timer-Leiste „bereit“, Weiterblättern, Zustand nach Rückkehr, Kennzahlen ziehen) | Zurückgestellt — neue Entscheidung nötig; nur D1-I8 (falscher Hinweis „Quer halten“) wird in Paket 14 gebaut | Bericht 0, Abschnitt 8 Nr. 1 und 2; Bericht 9, 2.4; Bericht 10, D2-I6 |
| E-F5 | Abweichender Rechnungsempfänger und Sammelrechnung? | Zurückgestellt — neue Entscheidung nötig; gebaut wird nur der Beteiligte „Rechnungsempfänger“ als Kundenvorschlag (mit A-11, Paket 22), und im Grenzen-Dokument entfällt der Grund „kommt mit M13“ | Papiere 2 und 4, je Abschnitt 4; Bericht 4, Abschnitt 4 Nr. 8; Bericht 0, 2.5 |
| E-F6 | Benutzerakte: leerer Eintritt wird beim Speichern „heute“ (Stand §117/§118) | Das Formular füllt einen leeren Eintritt und Saldo-Start nicht mehr von selbst und schreibt sie nicht mit, wenn sie nicht geändert wurden; die Felder werden nicht Pflicht; Paket 21 | `docs/stand-2026-10-03.md` §117/§118 („Offen — Entscheidung nötig“); Bericht 0, 2.5 |
| E-F7 | Empfänger „Büro“ in den Nachrichten (D1-C7)? | Zurückgestellt — neue Entscheidung nötig | Bericht 9, D1-C7: neue Funktion, der Vorbehalt „fachlich“ des Papiers; Bericht 0, 4.2 Nr. 10 |
| E-F8 | „Aufteilen“ schon im neuen Zeiteintrag (D1-C2)? | Zurückgestellt — neue Entscheidung nötig | Bericht 9, D1-C2: fachlich offen (ohne Netz, Jugendschutz, Abschluss je Teil) |
| E-F9 | Ein gemeinsamer Kalenderbaustein für die vier Kalender (D4-B4)? | Nein — die vier Kalender bleiben; gebaut wird nur der Radius des Personenkalenders | Bericht 0, Abschnitt 8 Nr. 9; Bericht 12, D4-B4 |
| E-F10 | Radius der Rückfrage: 16 oder 24 px? | Bleibt bei 16 px; `style.md` nennt die Rückfrage bei „Blatt 16 px“ | Papier 8, Abschnitt 9; Bericht 0, Abschnitt 11 Nr. 24 |
| E-F11 | Ungespeichertes in Fenstern: fragen oder Entwurf behalten (D2-B3)? | „Neu“-Fenster behalten den Entwurf und sagen es; eine Rückfrage gibt es nur beim Bearbeiten; ein leeres Fenster schließt ohne Frage | Papier 10, D2-B3; Bericht 10, Abschnitt 4; Bericht 0, 4.3 Nr. 15 |
| E-F12 | Die eigenen Einsätze von heute und vom nächsten Arbeitstag auf dem Gerät (P-8)? | **Wartet auf die Kanzlei (K-6) und gilt nicht als entschieden** | Bericht 3, P-8 und Abschnitt 4 |
| E-F13 | Welche Form des Fokusrings gilt (D4-A6)? | Zurückgestellt — neue Entscheidung nötig; Farbe, Breite und Versatz der drei Fokusformen bleiben, gebaut wird nur V-13 | Bericht 12, D4-A6 (`style.md` und E95 nennen Verschiedenes); Bericht 8, Abschnitt 4 |
| E-F14 | A-2: nur geänderte Felder speichern — oder auch den Stand prüfen? | Beides: nur geänderte Felder, dazu eine Standprüfung über `updated_at` mit der Rückfrage des Einsatzformulars; in der Kundenakte geht der Name immer mit | Bericht 2, A-2 |
| E-F15 | M-3: harte Sperre oder Rückfrage beim Ändern der Einheit? | Von Hand eine Rückfrage mit den Zahlen; harte Abweisung nur für den stillen Weg (Import, alte App) | Bericht 5, M-3 (Rat des Prüfers) |
| E-F16 | P-6: soll die Buchhaltung Tag, Art und Uhrzeit von Terminen sehen? | Bleibt, wie es ist — der Hinweis auf Termine erscheint nur für Rollen, die Termine lesen dürfen | Bericht 3, P-6 |
| E-F17 | S-4: nennt der Push den Grund des Notzugangs? | Nein — der Push nennt den Grund nicht; er steht auf der Startseite der Leitung | Bericht 6, S-4 |
| E-F18 | P-3: zählt „am Budgetlimit“ auch pausierte Baustellen? | Bleibt, wie es ist — die Zahl zählt aktive und pausierte Baustellen | Bericht 3, P-3 |
| E-F19 | Einsätze auf abgeschlossenen Baustellen (N-P-5)? | Bleiben möglich und werden benannt; das Einsatzformular und „Kopieren“ zeigen den Hinweis „Baustelle ist abgeschlossen“ | Bericht 3, Abschnitt 5 (Verdacht P-4) |
| E-F20 | Was zeigt die Kundenseite nach einer zurückgenommenen Annahme (N-A-1)? | Sie zeigt „inzwischen zurückgenommen“ mit Datum; der Nachweis der Annahme bleibt gespeichert | Papier 2, Verdacht V-2; Bericht 2, Abschnitt 5 |
| E-F21 | Eine aus der Vorschau entfernte Stundenposition sperrt ihre Buchungen (Verdacht G-2) | Bleibt, wie es ist, und wird benannt; beim Entfernen zeigt die Vorschau den Hinweis, dass die Stunden damit ohne Betrag verrechnet sind | Bericht 4, Abschnitt 5 (als Tatsache bestätigt) |
| E-F22 | Z-1: `satz` in die Ausnahme aufnehmen oder abgeschlossene Monate nicht nachziehen? | `app.satz_nachziehen` lässt Buchungen abgeschlossener Monate aus | Bericht 1, Abschnitt 2a Nr. 1 |
| E-F23 | „* Pflichtfeld“-Legende in allen Formularen (D1-B4)? | Bleibt, wie es ist | Bericht 9, D1-B4 (keine Regel); Bericht 11, D3-T14 |
| E-F24 | Vorgabe „Telefon“ für die Quelle eines Eingangs (D2-C1)? | Nein — „Quelle“ bleibt Pflicht ohne Vorgabe | Bericht 10, D2-C1 |
| E-F25 | Welches Zeichen trägt die Top-Zeile (D2-A8)? | Zeilen, die ein Lesefenster oder eine Akte öffnen, tragen den Pfeil (E99); die Top-Zeile öffnet das Änderungsformular und trägt den Stift (E74) | Bericht 10, D2-A8 |
| E-F26 | Die 58 Ideen zum Zusammenspiel (Abschnitt 4.11) | Was sich mit einem Befund deckt, wird in dessen Paket gebaut; jede eigene Idee ist zurückgestellt — neue Entscheidung nötig | Papiere 1 bis 7, je Abschnitt 5 (von den Prüfern nicht bewertet); Bericht 0, 2.5 |
| E-F27 | Eigene Nummer für Handwerksscheine? | Bleibt, wie es ist (Scheine ohne eigene Nummer) — zurückgestellt, neue Entscheidung nötig | Papier 3, Abschnitt 4 (bittet, die Frage noch einmal vorzulegen) |
| E-F28 | Reservierung an einem zweiten Lager; Fahrer zählt sein Fahrzeug vor? | Zurückgestellt — neue Entscheidung nötig | Papier 5, Abschnitt 4 |
| E-F29 | Regel „der nächste Schritt wird angeboten“ in `style.md`? | Ja, in der Fassung von Abschnitt 6.5: die Meldung trägt den nächsten Schritt als Verweis; die App wechselt die Seite nur, wo sie es heute schon tut oder wo kein zweiter Vorgang derselben Art folgt | Bericht 0, 7.3 (Paket 14) und Abschnitt 11 Nr. 17 |
| E-F30 | Speicherleiste am Schreibtisch nicht im Bild (N-D4-1)? | Zurückgestellt — neue Entscheidung nötig; die Speicherleiste bleibt ab 1.200 px, wie sie ist | Bericht 12, Abschnitt 3 Nr. 4 (keine sichere Lösung genannt) |
| E-F31 | A-5: wie drucken Altangebote ohne festgehaltenen Empfänger? | Mit dem eingefrorenen Namen und der heutigen Anschrift und UID; das wird als Grenze (Altdaten) benannt | Bericht 2, A-5 |
| E-F32 | Hauptaktion der Seite „Anforderungen“ (D3-C10 gegen D3-C13)? | „Material anfordern“ kommt in den Seitenkopf; „Material dazusetzen“ bleibt als Blatt im Reiter „Einkauf“, die Leerzustände tragen den ersten Schritt | Bericht 11, D3-C10 (Widerspruch zu C13) |
| E-F33 | Derselbe Einsatz in einer Anordnung (D1-B1): drei oder vier Wege? | Am Handy bekommt der Einsatz im Einsatzplan die dreigeteilte Leiste der Startseite; „Zeit erfassen“ bleibt dort als eigener Knopf über der Leiste | Bericht 9, D1-B1 |

**c) Vorschläge, die eine frühere Entscheidung zurückdrehen würden**

| Nr. | Vorschlag | Betrifft | Neue Empfehlung | Quelle |
|---|---|---|---|---|
| E-R1 | Stift und Tonne aus Listenzeilen nehmen; Knöpfe aus der Zeile ins Fenster (D2-B7 Teil, D2-B10, D2-C12, D2-P3) | E74 | Bleibt, wie es ist | Bericht 10, D2-B7, B10, C12; Bericht 0, 6.1 Nr. 8 und 12 |
| E-R2 | Abschluss-Knopf des Scheins einzeilig (D1-A13) | E82 | Bleibt, wie es ist | Bericht 9, D1-A13 |
| E-R3 | Leere Karten der Akte zusammenlegen; „geschrieben von“ streichen; Belegzeile neu; Stempel der Akten einheitlich (D2-I10, D2-T13, D2-P2, D2-B1) | E99 | Bleibt, wie es ist — gebaut wird nur die andere Reihenfolge der Karten am Handy (D2-I10) | Bericht 10, D2-I10, T13, P2, B1; Bericht 0, 6.2 Nr. 3 |
| E-R4 | Zweites ⋯ der Angebotsakte in den Seitenkopf; Hauptaktion = nächster Schritt; Positionen vor dem Verlauf (A-17, V-4, D2-A10, D2-I1, D2-C11) | Anordnung vom 15.11.2026 (U1/U4) | Bleibt, wie am 15.11. gebaut — gebaut wird nur, dass die schwebende Aktion am Handy den Schritt nicht mehr verdeckt; das zweite ⋯ steht als benannte Ausnahme im Wächter | Bericht 2, A-17; Bericht 10, D2-A10, C11; Bericht 8, V-4 |
| E-R5 | „Thread“ ersetzen (D1-A16) | Wort der App (Handbuch, `style.md`) | Bleibt, wie es ist | Bericht 9, D1-A16 |
| E-R6 | Kästchen in „Startseite anpassen“ zu Schaltern (D1-B12) | E95 | Bleibt, wie es ist | Bericht 9, D1-B12 |
| E-R7 | Darstellungsschalter und Marke aus der Seitenleiste nehmen (D1-A19, weitergehender Teil) | E92, `style.md` | Bleibt, wie es ist — gebaut wird nur „die Seitenleiste rollt in sich“ und das Wort am Schalter | Bericht 9, D1-A19, B13 |
| E-R8 | Einsatzkachel zweizeilig, Nummer aus der Kachel (D4-I1, D4-T13, D4-B11, D4-C12) | E96, „Kunde nie abgeschnitten“ | Bleibt, wie es ist — gebaut wird nur N-D4-2: steht derselbe Kundenname am selben Tag in einer Zeile zweimal, zeigt die Kachel auch unter 1.200 px die Kurzbezeichnung, sonst die Nummer | Bericht 12, Abschnitt 3 |
| E-R9 | Mahnlauf und „Nicht verrechnet“ in voller Breite für Spalten; Einsatz-Vorschau der Startseite umstellen (D3-P1, D3-P2, D4-I10) | E98 | Bleibt, wie es ist | Bericht 11, D3-P1, P2; Bericht 12, D4-I10 |
| E-R10 | Kopfinsel mit Rückweg „‹“ (D1-I2) | U3 | Bleibt, wie es ist | Bericht 9, 2.4 |
| E-R11 | Kennzahl „Resturlaub“ neben dem Arbeitstag (D1-I17) | `style.md` (Kennzahlenleiste) | Bleibt, wie es ist | Bericht 9, 2.4 |
| E-R12 | Meldung am Handy unter die Kopfinsel (D1-A21) | G29 | Bleibt, wie es ist | Bericht 9, D1-A21 |
| E-R13 | Erster Fokus im ersten Feld eines Fensters (D2-C7, D2-I12) | Prüflauf vom 25.09.2026 | Bleibt, wie es ist | Bericht 10, D2-C7, I12 |
| E-R14 | „Rechnung stellen“ neu ordnen; „Verrechnen“ statt „Baustelle wählen“ (D3-C1, D3-C2) | im Code begründete Anordnung | Zurückgestellt — neue Entscheidung nötig; die Anordnung bleibt | Bericht 11, Abschnitt 3 |
| E-R15 | Mahnen in einem Zug (D3-C4, I-G4) | U4 | Bleibt, wie es ist | Bericht 11, D3-C4 |
| E-R16 | Blatt „Einrichten“ auf der Startseite (D4-I5) | Textregel 2 | Bleibt, wie es ist | Bericht 12, D4-I5 |
| E-R17 | Verkaufs- und Einkaufspreis in der Katalogzeile (D3-C9) | Preisrecht der Geschäftsführung | Zurückgestellt — neue Entscheidung nötig | Bericht 11, D3-C9 |
| E-R18 | Kontoauszug als Zweitknopf im Seitenkopf (D3-C3, Teil) | U1 | Bleibt, wie es ist — der Einstieg bleibt im ⋯ | Bericht 11, D3-C3 |

**d) „Ein Tipp mehr“ (E-W1)**

Vorschläge, die eine Aktion oder Angabe einen Tipp weiter weg legen oder aus dem Bild nehmen
würden. Neue Empfehlung für alle: **bleibt, wie es ist.**

| Vorschlag | Was weiter weg läge | Quelle |
|---|---|---|
| D2-B10 | Termin ändern: zwei Tipps statt einem | Bericht 10; Bericht 0, 7.2 |
| D3-C6, D3-B20 | „Geliefert …“ aus der bestellten Zeile ins Fenster | Bericht 11; Bericht 0, 7.2 |
| D2-C12 | „Neue Fassung“, „Annehmen → Baustelle“ aus der Angebotszeile | Bericht 10; Bericht 0, 7.2 |
| A-17, D2-A10 | „Annahme-Link“, „Per Mail senden“, „Neue Fassung“ | Bericht 2; Bericht 0, 7.2 |
| D1-A19, D1-I18, D1-T24 | „Problem melden“, Darstellung, „App erneuern“, Fassung, „Datenschutz · Impressum“ | Bericht 9; Bericht 0, 7.2 |
| D2-T1 | Team, Projektleitung, Telefon, Straße aus der Baustellenzeile | Bericht 10; Bericht 0, 7.2 |
| D4-I1 | Nummer nur noch im `title` (den es am Tablet nicht gibt) | Bericht 12; Bericht 0, 7.2 |
| D3-P3 | Rechnungsdatum am Handy nur im Fenster | Bericht 0, 7.2 |
| D1-P7 | die Pause in „Wie zuletzt buchen“ | Bericht 0, 7.3 |
| D4-A11 | „Notzugang“ aus der Plattform-Zeile | Bericht 12 |
| D3-T3 | Schalter „Bauleistung“ bei Kundenart „privat“ verborgen | Bericht 11 |
| D2-T11 | Kartenverweis und Sprungziel „Adresse und Kontakt ›“ am Handy | Bericht 10 |

Künftig gilt Regel 11 (Abschnitt 2.2): ein solcher Vorschlag steht mit „vorher n, nachher m
Tipps“ im PR und wird ohne Zustimmung des Auftraggebers nicht gebaut.

### 10.4 Was auf die Kanzlei wartet — gilt nicht als entschieden

| Punkt | Was wartet | Frage |
|---|---|---|
| G-4 | Kassakonto und Buchungssatz für Bar, Karte, „Sonstiges“ (Paket 4) | K-1 |
| G-13 | Einnahmen-Ausgaben-Rechner und Istbesteuerung | K-1 |
| G-3 | Haft- und Deckungsrücklass | K-2 |
| Z-10, Z-12 | Umrechnung des Resturlaubs; Hinweis vor der Verjährung | K-3 |
| A-9 | Inhalt von AGB und Rücktrittsbelehrung auf der Annahmeseite (der Platz dafür wird gebaut) | K-4 |
| Z-14 | Einstellung „Wegzeit zählt als Arbeitszeit“ (die Grenze wird benannt) | K-5 |
| P-8 | die eigenen Einsätze auf dem Gerät | K-6 |
| P-1 | ob eine erneut gesendete Unterschrift als Beleg trägt (der gesicherte Schein wird bis dahin nur aufbewahrt, angezeigt und als PDF ausgegeben) | K-7 |
| D2-C13 | Reihenfolge der Kundenseite der Annahme (lesen vor unterschreiben) | K-8 |
| Z-11 | Fundstelle und Verfall beim Arbeitsjahr je Person (die Entscheidung E-Z11 gilt; der Bau beginnt nach der Auskunft) | K-9 |

---

## 11. Fragen an Kanzlei und Steuerberatung

Was hier steht, gilt nicht als entschieden (Abschnitt 10.4). Die Rechtsaussagen der Papiere hat
kein Prüfer am Gesetzestext geprüft; die Fundstellen im Papier 1 stammen aus dem Gedächtnis.

| Nr. | Frage | Betrifft |
|---|---|---|
| K-1 | BMD-Importtest (seit September offen — Termin mit der Kanzlei des Pilotbetriebs einfordern): Kassakonto und Buchungssatz für Bar, Karte und „Sonstiges“ (Gegenverrechnung, Scheck); Umbuchungszeile Debitoren an Debitoren; Anzahlungsrechnung mit Steuercode am Rechnungsdatum; Einnahmen-Ausgaben-Rechner und Istbesteuerung | G-4, G-13, Verdacht G-1, Grenze 31 in 4.10 |
| K-2 | Haft- und Deckungsrücklass: Bemessung nach Teilrechnungen, Fälligkeit mit der Schlussrechnung; bis wann gilt die Toleranz „beide Grundlagen zulässig“ | G-3 |
| K-3 | Urlaub: Umrechnung bei Wechsel der Arbeitstage; Hinweispflicht vor der Verjährung | Z-10, Z-12 |
| K-4 | Annahme über den Link gegenüber Verbrauchern: Inhalt von AGB und Rücktrittsbelehrung | A-9 |
| K-5 | „Wegzeit zählt als Arbeitszeit“: gilt das fachlich für den Betrieb, ab wann, und wie verträgt es sich mit der festgelegten Abrechnungsbedeutung der Standardfelder (E63) | Z-14 |
| K-6 | Datenschutz: dürfen die eigenen Einsätze von heute und vom nächsten Arbeitstag und ein nicht angekommener Schein samt Unterschrift auf einem (geteilten) Gerät liegen; darf die Push-Meldung zum Einsatzplan den Kundennamen am Sperrbildschirm nennen | P-8, P-1, Grenze 28 in 4.10 |
| K-7 | Trägt eine Unterschrift des Kunden als Beleg, wenn der Schein unverändert erneut gesendet wird | P-1 |
| K-8 | Kundenseite der Annahme: Reihenfolge einer verbindlichen Erklärung (lesen vor unterschreiben) | D2-C13 |
| K-9 | Arbeitsjahr als Urlaubsjahr: Fundstelle (§ 2 UrlG) und wie die Einstellung „verfällt an einem festen Tag“ mit je Person verschiedenen Jahren zusammengeht; ob diese Einstellung so angeboten werden soll | Z-11, Verdacht Z-6 |

---

## 12. Was diese Durchsicht nicht geleistet hat

### 12.1 Code, den kein Papier oder nur an einzelnen Stellen angesehen hat

Gesammelt aus den Abschnitten „Nicht angesehen“ der Papiere 1 bis 7 (Bericht 0, Abschnitt 10):

- **Nachrichten** als Funktion (rund 3.600 Zeilen in `src/features/nachrichten`):
  Aufbewahrungslauf, Löschen, Export, Live-Kanal — nur Speicherregeln und Meldeweg. Kein
  Fachpapier.
- **Zeit:** `TimeForm.tsx` im Ganzen (1.944 Zeilen: Aufteilen, Einfügen, freie Zeitfelder),
  Betriebsurlaub, Arztbesuch, Nachweis-Upload, Stundennachweis-PDF; Zuschläge und Überstunden
  nicht gegen den Kollektivvertrag nachgerechnet.
- **Auftragskette:** Kunden zusammenführen (nur Struktur), Kundenimport, UID-Prüfung, Papierkorb,
  Liegenschaften (Ansicht, Tops, Beteiligte, Regeln), Pläne und Dokumente, Summenrechnung der
  Angebote, **Wartungen** (nur Laden und Speichern), Datenauskunft und Löschung für Angebote und
  Eingänge.
- **Planung und Scheine:** Rüstliste im Einzelnen, `scheinHash` App gegen Datenbank, Fotos und
  ihre Speicherregeln, Kalender-Abo, `push-melden` bis auf einen Zweig, Termine, Startseite
  (`regeln.ts`, `DashboardView.tsx`) nur stellenweise.
- **Geld:** PDF-Gestaltung und Pflichtangaben am gedruckten Blatt, XML der E-Rechnung,
  Belegarchiv, Bankgarantie- und E-Rechnungs-Dialog, SMTP, IBAN; **Zeilenschutz, Datenauskunft und
  Löschung der Tabellen `bank_buchungen` und `beleg_versand`** — ein Pflichtpunkt nach `CLAUDE.md`,
  der vor Paket 24 nachzuholen ist.
- **Material:** DATANORM-Leser im Einzelnen, Lieferantenvergleich, Retoure-, Zähllisten- und
  Lagerort-Oberflächen, Materialdeckung, Datenauskunft und Löschung der Materialtabellen.
- **Grundlagen:** Benutzerverwaltung und Benutzerakte, Module (Durchsetzung je Modul in der
  Datenbank), „Mein Konto“, Sicherung, Plattform nur an einzelnen Stellen; `public/sw.js` (829
  Zeilen) nicht; `daten-ausleitung`, `konto-umstellen`, `betrieb-anlegen`,
  `nachrichten-aufraeumen` nur am Eingang; `package-lock.json` nicht auf bekannte Schwächen.
- **Technik:** 149 Stellen mit verschlucktem Fehler nur zum Teil; 120 von 764 Quelldateien ohne
  Nennung in `tests/`; Handbuch und `docs/FUNKTIONEN.md` nicht gegen den Code; keine Messung von
  Ladezeiten, Indizes, Ausführungsplänen.

Der Prüfer des Plans schätzt: der Code-Audit deckt rund zwei Drittel des Repositorys.

### 12.2 Bildschirme und Unterbildschirme, die nicht im Bild geprüft sind

Die Vermessung hat 863 Zustände erfasst, je Seite aber höchstens Hilfe, ⋯, Hauptaktion und das
Fenster der ersten Zeile. Die Papiere 9 bis 12 nennen zusammen — vom Prüfer grob gezählt — 70 bis
80 Fenster, Dialoge und Zustände, die nur im Code gelesen oder gar nicht gesehen wurden:

- **Gar nicht erreichbar:** Anmeldung (leitet weiter), Zwei-Faktor-Seiten, erstes Passwort,
  Wiederherstellungscodes, Zählliste und Liegenschaftsakte (Absturz der Vorschau), leerer
  Betrieb, Supporteinblick und Supportband, Verbindungsband, „Neue Fassung“-Leiste, „Mein
  Fahrzeug“, Projektleiter mit `rechnungenLesen`. Die Prüfer haben Anmeldung, zweiten Faktor,
  Monatsabschluss und eine fremde Benutzerakte mit umgeschriebener Attrappe gesehen.
- **Fenster und Zustände:** Rückfragen und Meldungen, Fenster außer dem der ersten Zeile, Menüs
  je Zeile, zweite Ebene in Fenstern, Unterschriftsblatt, globale Suche, Wischaktionen, Ziehen
  bis zum Ablegen; Klärung, Bankgarantie, Stornorechnung, Rückzahlung, Mahnung per Mail;
  Rechnungsarten (Anzahlung, Teil-, Schlussrechnung) und Ersatz; Angebot bearbeiten und „Neue
  Fassung“, Katalogsuche mit Treffern, Annahme-Link mit bestehendem Link, Zustände der Kundenseite
  („abgelehnt“, „zu viele Versuche“), Kundenimport, zweiter Schritt des Zusammenführens,
  Papierkorb mit Inhalt, Baustelle abschließen, Pläne mit Dateien; Umlagern, Kommissionsware,
  Bestellvorschläge und Fahrzeuge mit Daten, Retoure, Sammelleiste, Lieferantenvergleich;
  Betriebsurlaub, „Ende ändern“, Datenauskunft und Löschen einer Person, Teile der Plattform,
  „Willkommen“, Fehlertafel.
- **Lade-, Fehler- und Leerzustände** nur, wo die Attrappe sie zufällig liefert; kein großer
  Bestand in der Vermessung.
- **Rollen** Projektleiter, Verwaltung, Buchhaltung im Bereich Aufträge nur für Menüs und Zugriff.
- **Breiten und Geräte:** Tablet fast überall nur Grundzustand und Reiter; 375 px von der
  Durchsicht nicht, von den Prüfern dort gemessen, wo es auf die Breite ankam; Querformat und
  Zwischenbreiten gar nicht; der dunkle Satz von den Bereichspapieren nur in Auswahl, von der
  Vermessung überall, aber nur auf Kontrast; WebKit, echte Geräte und die Sicherheitszonen des
  iPhone nicht.

**Schritt dazu (Paket 8, Schritt 7):** Sobald die Vorschau diese Bildschirme zeigt, folgt eine
**zweite Durchsicht** nach demselben Verfahren — mit Gegenprüfung. Ihre Befunde gehen in das
Seitenpaket der jeweiligen Seite; eine Seite der Stufe C wird erst umgebaut, wenn ihre zweite
Durchsicht vorliegt.

### 12.3 Grenzen der Gegenprüfung selbst

- **Nichts lief gegen den vollen Supabase-Stapel, gegen PostgREST, Realtime, den Anmeldedienst,
  die Edge-Runtime oder ein echtes Gerät.** Nachgestellt wurde an Wegwerf-Datenbanken (alle 358
  Migrationen am Endstand), mit eigenen Skripten und in der Vorschau mit Chromium. Der Schnitt bei
  1.000 Zeilen (L-1, M-2) ist deshalb an der Datenbankhälfte belegt, nicht an PostgREST; der Wert
  im gehosteten Projekt ist nur behauptet (N-L-2).
- **Die Abschnitte 4 (Grenzen), 5 (Ideen) und 6 (Stichprobe früherer Punkte) der Papiere 1 bis 7**
  haben die Prüfer nur dort geprüft, wo ein Befund daran hängt. Die Bewertungen der Grenzen
  (Abschnitt 4.10) und die 58 Ideen (4.11) sind also nicht gegengeprüft.
- **22 Verdachtsfälle sind weiter offen**, zehn weitere nur am Code oder als Tatsache bestätigt
  (Abschnitt 4.9); offen ist auch Verdacht S-4.
- **Rechtsaussagen** (Urlaub, Rücklass, Anzahlungssteuer, Verbraucherrecht) hat niemand am
  Gesetzestext geprüft — Abschnitt 11.
- **Aufwände** sind geschätzt; die Prüfer haben sie nur an einzelnen Stellen angemerkt.
- **Die Tippzahlen** der Aufgaben sind gezählt, nicht am Gerät gestoppt, und von den Prüfern nur
  zum Teil Tipp für Tipp nachgezählt.
- **Die Zahlen zu den Trennpunkten im gerenderten Text** sind nicht widerspruchsfrei
  (Abschnitt 7.1).
- **Zwei Prüfer widersprechen einander** an drei Stellen; dieser Plan nennt beide Seiten und
  folgt dort der vorsichtigeren: Monatsraster am Tablet (Bericht 12: Fehler gegen `style.md`;
  Bericht 8: als dichtes Raster entschieden, E88) — entschieden in E-M; Form des Gruppenkopfs
  (Bericht 12 gegen Bericht 8) — E-F2: bleibt; die Pause in „Wie zuletzt buchen“ (Bericht 9: ohne
  Einwand; Bericht 0: eine Angabe fiele weg) — bleibt.

### 12.4 Belege

Bilder, Messdaten und Skripte der Durchsicht und der Gegenprüfung liegen in einem
Arbeitsverzeichnis, das nicht dauerhaft ist. Paket 8, Schritt 6, sichert sie an einen dauerhaften
Ort. Die Zuordnung dieses Plans (jedes Kürzel genau einmal) ist mit einem Skript gegen die
Papiere geprüft; das Ergebnis steht im Änderungsprotokoll.
