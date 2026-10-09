# Senklot – Arbeitsauftrag Runde 4: Mitarbeiterübersicht, Wochenplan, Monat

**Für:** Claude Code
**Stand:** 08.10.2026
**Bezug:**
- `Senklot_Umbauprotokoll_Designlinie.md` gilt vollständig, vor allem 0.1 bis 0.3 (Grundsätze, Gestaltung, Haltepunkte), 7 (viele Daten), 8 (Definition of Done) und die Anhänge 12.1 bis 12.4.
- Entwurf: `senklot-runde4-planung-uebersicht.html`. Er dient als Bild und Verhalten, nicht als Code-Vorlage. Seine Testdaten sind erfunden.
- Handbuch, Stand 07.10.: die Abschnitte „Planung: der Wochenplan ist die Planungsseite“, „Mitarbeiterübersicht und Nachkalkulation“, „Termine und Aviso“, „Arbeitszeitgrenzen“ und „Was noch offen ist“.

> KI-Vorschlag. Fehler sind möglich. Wo dieser Auftrag dem Code oder dem Handbuch widerspricht, gilt Haltepunkt 0.3: anhalten und nachfragen. Rechtliche Angaben (AZG, KJBG) werden hier nur zitiert, wie die App sie heute rechnet. Sie sind keine Rechtsberatung, im Zweifel WKO oder Fachleute fragen.

---

## Inhalt

0. Worum es geht – Befund
1. Was gilt (zusätzlich zum Umbauprotokoll)
2. Voraussetzungen
3. Paket R4-A – Mitarbeiterübersicht
4. Paket R4-B – Wochenplan
5. Paket R4-C – Monat mit Vorschau
6. Neue und geänderte Bausteine
7. Mengengerüst und Messwerte
8. Abnahme
9. Zuordnung alt → neu (vollständig)
10. Bewusst nicht in diesem Auftrag
11. Entscheidungen des Betreibers vor dem Start

---

## 0. Worum es geht – Befund

Die Designlinie „Lot“ ist umgesetzt. An drei Stellen ist das Ergebnis noch nicht gut. Der Befund stammt aus den Bildschirmfotos des Betreibers und der Live-Ansicht am 08.10. (Administrator, Windows, 1.920 px):

**Mitarbeiterübersicht (`/accounting`)**
- Die 31 Tagesspalten scrollen schon am Schreibtisch seitlich.
- Jeder Arbeitstag ohne Buchung ist ein großer leerer Kasten mit Bernstein-Rand. Bei sechs Personen ergibt das eine Wand aus Rahmen.
- Die Stunden brechen in den schmalen Zellen um („10:4 / 5“).
- Abwesenheiten stehen als Kürzel (K, U, ZA, BS, SU, PF, UU) und brauchen eine Legende.
- Salden und fehlende Tage stehen erst in einer zweiten Liste unter dem Raster, also doppelt und getrennt vom Raster.

**Wochenplan (`/assignments/woche`)**
- Die eigene Zeile „Termine“ zeigt winzige, abgeschnittene Kärtchen („Lieferun… CT Bau Gm…“). Sie sind **nicht anklickbar**, sie tragen nur einen `title`.
- Die Inhaltsbreite endet bei etwa 1.170 px, obwohl der Bildschirm 1.920 px breit ist. Die Ablage „Noch einzuplanen“ nimmt davon weitere 280 px. Deshalb werden die Einsätze abgeschnitten („Anna B…“, „PR-202…“).
- In jeder leeren Zelle steht ein Kasten „frei“, auch am Samstag und Sonntag.
- „Berufsschule“ bricht mitten im Wort um („Berufsschul / e“).
- Über dem Titel „Wochenplan“ stehen noch die Reiter „Wochenplan | Tag planen“, der Titel ist also doppelt.
- Ein Klick auf den Tageskopf springt nach `/assignments/tag`.

**Monat (`/assignments/woche?ansicht=monat`)**
- Jeder Tag ist nur ein farbiges Feld.
- Ein Klick springt in die Woche. Was an diesem Tag geplant ist, sieht man erst dort.

---

## 1. Was gilt (zusätzlich zum Umbauprotokoll)

1. **Reine Darstellung.** Datenbank, RLS, Serverfunktionen, Berechnungen (Stunden, Salden, Grenzen, Urlaub), Belege und Exporte (Monats-CSV, CSV je Person, „Bericht für Zeitraum“, Kalender-Abo) bleiben unverändert.
   - Alle Zahlen kommen aus denselben Funktionen wie heute.
   - Gerechnet wird nichts neu. Die Oberfläche ordnet nur anders an.
2. **Nichts geht verloren.** Jedes heutige Element der drei Bereiche steht nach dem Umbau in `zuordnung.json` und ist höchstens einen Klick weiter entfernt (Abschnitt 9).
3. **Adressen bleiben:** `/accounting`, `/assignments/woche`, `/assignments/tag`, `?ansicht=monat`.
   - Neue Parameter kommen nur zusätzlich dazu (z. B. `?woche=2026-W41&tag=2026-10-07`, `?ansicht=woche` in der Mitarbeiterübersicht, `?nur=offen`).
   - Lesezeichen funktionieren weiter.
4. **Keine neuen Funktionen nebenbei.** Was im Entwurf darüber hinausgeht, ist in Abschnitt 10 als „optional, nur mit Freigabe“ markiert. Das betrifft den Filter „Zeigen“, das Ziehen und ein Feld „Kurzname“.
5. **Rechte unverändert.**
   - Wer heute einen Termin nur sieht, sieht ihn danach auch nur. Ändern und Löschen erscheinen nur bei dem, der es heute darf.
   - Die Art einer Abwesenheit zeigt sich genau wie heute: Grund für die Leitung, Krankenstand nur für das Büro, „abwesend“ für Kollegen.
6. **Gestaltung:**
   - Designlinie „Lot“ v2, heller Modus als Standard.
   - Pro Element eine Klasse, keine `clamp()`/`calc()`, keine Container-Queries, Media-Queries nur auf die Breite, kein `nth-child()`.
   - Keine Emojis, keine halbtransparenten Farbflächen, keine strichlierten Linien.
   - Zwei Signalfarben: Bernstein für „braucht Aufmerksamkeit“, Rot nur für einen Verstoß oder Fehler.
7. **Breiten:**
   - Handy bis 759 px
   - Tablet 760–1.199 px, hoch und quer
   - Schreibtisch ab 1.200 px
   - Geprüft wird bei 390, 834 (hoch und quer) und 1.440 px, zusätzlich bei 1.920 px wegen der Inhaltsbreite.

---

## 2. Voraussetzungen

| Nr. | Schritt | Nachweis |
|---|---|---|
| V1 | Zweig `ui-lot-r4` vom aktuellen Stand, Markierung `vor-r4` | Git-Log |
| V2 | Bestandsliste nach Anhang 12.1 für die drei Bereiche erweitern. Erfasst werden alle Rollen mit Zugang (Buchhaltung, Geschäftsführung, Administrator, Projektleiter, Supportzugang, Team-Woche für Mitarbeiter), drei Breiten, je Person die aufgeklappte Karte, das Seitenfenster „Einsatz bearbeiten“ und der Bereich „Termine am …“ in Tag planen | `docs/ui-umbau/r4/bestand.json` |
| V3 | Bildschirmfotos vorher, je Rolle und Breite | `docs/ui-umbau/r4/vorher/` |
| V4 | Referenzdateien aus dem Testbestand erzeugen und ihre Prüfsummen festhalten: Monats-CSV, „Monat als CSV“ einer Person, „Bericht für Zeitraum“, Kalender-Abo (ICS) des Gesamtplans | `docs/ui-umbau/r4/referenz.json` |
| V5 | Testbestand nach Abschnitt 7 (Mengengerüst) laden | Messprotokoll |
| V6 | Heutige Browser-Wege dieser Bereiche laufen grün (Chromium und WebKit) | Prüflauf |

Erst danach wird Code geändert.

---

## 3. Paket R4-A – Mitarbeiterübersicht

### 3.1 Ziel

Eine Zeile je Person. Darin stehen der Monat als ruhiger Streifen und die Summen direkt daneben. Oben steht, wer Tage ohne Buchung hat. Die Stunden einzelner Tage stehen lesbar in einer Ansicht „Woche“. Alles, was heute in der aufgeklappten Karte steht, wandert in ein Seitenfenster je Person.

### 3.2 Aufbau der Seite (von oben)

1. **Seitenkopf** wie heute:
   - Titel „Mitarbeiterübersicht“, Unterzeile „Monatsauswertung, Vollständigkeit und Salden“
   - „Hilfe zu dieser Seite“
   - „⋯“ mit „Monats-CSV“
   - Hauptaktion „Zeit erfassen“, sie öffnet das Formular im Seitenfenster wie heute
2. **Kennzahlenleiste mit drei Kennzahlen**, alle aus vorhandenen Werten:
   - **„Tage ohne Buchung“**: Summe und „bei N Personen“. Ein Klick filtert die Liste auf Personen mit offenen Tagen (`?nur=offen`), ein zweiter hebt den Filter auf.
   - **„Arbeitszeitgrenzen“**: Zahl der Fälle der Karte „Arbeitszeitgrenzen“. Ein Klick scrollt zur Karte.
   - **„Gebucht bisher“**: Summe Ist und Summe Soll aller Personen bis gestern. Nur Anzeige.
3. **Steuerung:**
   - Links: ‹ Titel › mit Titel „Oktober 2026“ und Unterzeile „Dieser Monat · Stand Do 08.10.“ bzw. „Letzter Monat“.
   - **Ein Klick auf den Titel öffnet die bisherige Auswahl Monat und Jahr** (Jänner bis Dezember, Jahre wie heute). Diese Auswahl darf nicht wegfallen.
   - Rechts: Suche „Person suchen“ und der Umschalter „Monat | Woche“.
4. **Liste** (3.3 bzw. 3.4)
5. **Karte „Arbeitszeitgrenzen“** unverändert im Inhalt:
   - Fall, Paragraph, „Verstoß – Buchung korrigieren“, „Begründen“, „Notiz hinzufügen“, „Ändern“, „Entfernen“
   - Gestaltung als Arbeitsliste: eine Zeile je Fall, ein Knopf für den nächsten Schritt, die übrigen Handgriffe in der Zeile.
6. **„Projektauswertung“** unverändert (Inhalt, Reihenfolge, Budgetanzeige).

Im **Supportzugang** gibt es wie heute keinen Streifen und keine Woche. Die Liste zeigt dort nur Namen und Summen, soweit der Supportzugang sie heute sieht. Die Karte „Arbeitszeitgrenzen“ fehlt dort wie heute.

### 3.3 Ansicht „Monat“ (Standard)

**Gruppen und Reihenfolge:**
- „Mit Tagen ohne Buchung · N“ zuerst, absteigend nach der Zahl offener Tage, dann „Vollständig · N“.
- Je Gruppe höchstens 20 Zeilen, danach „und N weitere anzeigen“ (Umbauprotokoll 7).
- Die Suche wirkt über alle Personen.

**Zeile (Schreibtisch):** Raster `230px | Streifen | 76px | 76px | 84px` mit 16 px Abstand.

| Spalte | Inhalt |
|---|---|
| Person | Name (600). Darunter entweder „N Tage ohne Buchung“ in Bernstein (600) oder „Einstufung bzw. Rolle · vollständig“ in Grau |
| Streifen | ein Feld je Kalendertag (3.3.1) |
| Gebucht | Ist bis gestern, `h:mm` |
| Soll bisher | Soll bis gestern, `h:mm` |
| Saldo Monat | `+h:mm` / `−h:mm`, 600, ohne Signalfarbe |

**Kopfzeile:** bleibt beim Rollen oben stehen und trägt dieselben Spalten. Über dem Streifen stehen die Tageszahlen (12 px, Grau). Wochenenden sind heller, der heutige Tag ist Petrol, 600, mit 2 px Unterstrich.

#### 3.3.1 Streifen

- `display: grid`, eine Spalte je Tag, `repeat(N, minmax(0, 1fr))`, 2 px Abstand.
- Feldhöhe 24 px, am Handy 22 px, Radius 3 px.
- Ein Feld kennt genau einen Zustand. Er kommt aus der **vorhandenen** Tagesauswertung, aus der heute auch das Raster und „N Tage fehlen“ gespeist werden.

| Zustand (heute) | Feld | Klasse |
|---|---|---|
| gebucht | Petrol voll | `.st-ok` |
| gebucht, mit Fall der Arbeitszeitgrenzen | Petrol mit 4 px roter Unterkante | `.st-grenze` |
| Arbeitstag ohne Buchung (heute: Bernstein-Rand) | Bernstein voll, **kein** Rahmen | `.st-fehlt` |
| abwesend (Krank, Urlaub, ZA, BS, SU, PF, UU) | Grau `--linie-stark` | `.st-weg` |
| Wochenende, Feiertag | Papier, nicht klickbar | `.st-frei` |
| heute und Zukunft | Weiß mit 1 px Linie | `.st-zukunft` |

Regeln für den Streifen:
- Die Kürzel entfallen im Streifen. Die Art steht im Tooltip, in der Woche und im Seitenfenster **als Wort**: Krank, Urlaub, Zeitausgleich, Berufsschule, Sonderurlaub, Pflegefreistellung, Unbezahlt.
- **Tooltip am Schreibtisch:** „Mi 07.10. · 07:00–11:30, 12:00–15:30 · 8:00 Std. · Soll 8:00“. Bei einem Grenzfall wird der Text des Falls angehängt.
  - Das heutige Verhalten „nennt beim Darüberfahren auch das Soll“ bleibt erhalten.
  - Der Tooltip ist kein `title`, sondern ein eigenes Element. Für den Screenreader trägt jedes Feld dasselbe als `aria-label`.
- **Klick auf ein Feld** öffnet das Seitenfenster der Person (3.5). Der Tag ist dort markiert und ins Bild gerollt. Bei einem Tag ohne Buchung steht „Zeit erfassen“ direkt am Tag.
- **Klick auf die Zeile** (außerhalb eines Felds) öffnet das Seitenfenster ohne Markierung.
- **Legende** unter der Liste mit den fünf Zuständen als Wort und dem Satz „Darüberfahren zeigt Stunden und Soll · Tag antippen öffnet ihn“. Sie ersetzt die heutige Kürzel-Legende.

#### 3.3.2 Tablet und Handy

- **Tablet:** Raster `170px | Streifen | 62px | 62px | 70px`. Über dem Streifen stehen nur die Zahlen der Montage und von heute; die übrigen bleiben im DOM, sind aber unsichtbar (`color: transparent`), damit die Spalten gleich bleiben.
- **Handy:** eine Karte je Person. Erste Zeile Name und Status, darunter der Streifen in voller Breite (31 Felder passen auf 358 px), darunter drei Zahlen nebeneinander mit eigener kleiner Beschriftung („Gebucht“, „Soll bisher“, „Saldo Monat“). Die Kopfzeile entfällt.

### 3.4 Ansicht „Woche“

- Der Umschalter „Monat | Woche“ wechselt die Ansicht. Die Woche beginnt in der aktuellen Woche, falls der gewählte Monat der laufende ist, sonst in der ersten Woche des Monats.
- **Titel** relativ wie im Wochenplan: groß „Diese Woche“ / „Letzte Woche“ / „Nächste Woche“, sonst der Zeitraum. Klein darunter „KW 41 · 05.10.–11.10.“.
- **Zeile (Schreibtisch):** `230px | 7 × Tag | 76px | 76px | 84px`.
- **Tageszelle:**

| Zustand | Inhalt |
|---|---|
| gebucht | Stunden groß (600, `h:mm`, `white-space: nowrap`), darunter „07:00–15:30“ bzw. „2 Buchungen“ |
| Grenzfall | wie gebucht, 3 px rote Unterkante |
| ohne Buchung | „fehlt“ in Bernstein auf Bernstein-hell, 1 px Bernstein-Innenlinie |
| abwesend | Art als Wort (Grau auf `--abwesend`), Silbentrennung erlaubt (`hyphens: auto`) |
| Wochenende, Feiertag | „–“ bzw. „Feiertag“, nicht klickbar |
| heute, Zukunft | leer bzw. „heute“ |

- **Summen:** Gebucht, Soll bisher, Saldo jeweils für diese Woche.
- **Gruppen:** „Mit Tagen ohne Buchung in dieser Woche“, dann „Vollständig“.
- **Klick auf eine Zelle** öffnet das Seitenfenster mit dem markierten Tag.
- **Tablet:** Von–Bis entfällt in der Zelle; es steht im Tooltip und im Seitenfenster.
- **Handy:** eine Karte je Person, darin Name, 7 Zellen (je 51 px, Stunden 13 px) und darunter die drei Summen.

### 3.5 Seitenfenster „Person im Monat“ (ersetzt die aufgeklappte Karte)

Der Inhalt wird **1:1** aus der heutigen Karte übernommen. Nur die Anordnung ändert sich.

| Heute (aufgeklappte Karte) | Neu im Seitenfenster |
|---|---|
| Name, „N Tage fehlen“ | Kopf: Name, darüber „Einstufung/Rolle · Lehrjahr · Monat Jahr“ |
| „Saldo im Monat“ | Kennzahl 1 |
| „hh:mm von hh:mm Soll bisher“ | Kennzahl 2 „Gebucht von Soll bisher“ |
| „Gesamtsaldo seit TT.MM.JJJJ: …“ (samt Start-Saldo) | Kennzahl 3 „Gesamtsaldo seit …“ |
| „… Tage Resturlaub (Anspruch angepasst: …)“ | Kennzahl 4 „Resturlaub“. Der Zusatz „Anspruch angepasst“ steht darunter, wenn vorhanden |
| „N Tage krank · N Tage Urlaub · N Tage Sonderurlaub · N Tage Berufsschule“ | Textzeile, Wortlaut wie heute |
| „Tagessoll … · Wochenstunden … · N Solltage · laufend“ | Textzeile, Wortlaut wie heute |
| Aufklapper „N Arbeitstage ohne Buchung“ mit Datumsliste | Abschnitt „N Arbeitstage ohne Buchung“: je Tag eine Zeile mit „Soll h:mm“ und dem Knopf **„Zeit erfassen“**, vorbelegt mit Person und Tag. Bisher stand dort nur die Datumsliste. Der Knopf öffnet dasselbe Formular wie die Hauptaktion und ist keine neue Funktion |
| Fälle „Arbeitszeitgrenzen“ dieser Person | Abschnitt „Arbeitszeitgrenzen“ mit denselben Knöpfen wie in der Karte (nur wenn Fälle bestehen) |
| Aufklapper „Tagesnachweis · N Einträge“, Tabelle Tag, Status, Zeit, Baustelle, Stunden, Aktionen | Abschnitt „Tagesnachweis · N Einträge“ als Liste in **aufsteigender** Reihenfolge wie heute. Je Zeile Tag, Status/Marke (z. B. „Nacht“), Zeit, Baustelle, Stunden und die **heutigen Aktionen je Art**: „Bearbeiten“ und „Löschen“ bei Buchungen und Berufsschule, „Krankmeldung“ bei Krank, „Antrag“ bei Urlaub und Sonderurlaub; Feiertage ohne Aktion. Die Summenzeile „N Einträge · hh:mm“ bleibt |
| „Monat als CSV“ | Fußleiste, Nebenknopf |
| „Bericht für Zeitraum“ | Fußleiste, Nebenknopf |
| – | Fußleiste, Hauptknopf „Zeit erfassen“ für diese Person |

Verhalten des Seitenfensters:
- Ist es über einen Tag geöffnet worden, ist die Zeile dieses Tages markiert (Petrol-hell mit 3 px Petrol links) und ins Bild gerollt.
- Wurde ein Tag der Zukunft gewählt, steht oben eine markierte Zeile „noch nichts gebucht · Soll h:mm“ mit „Zeit erfassen“.
- Jede Bearbeitung öffnet das **bisherige** Formular im selben Seitenfenster. Gespeichert wird mit denselben Prüfungen: KJBG-Rückfrage mit „Trotzdem buchen“, „bereits gebucht“, Eintritt und Saldo-Start.
- Nach dem Speichern werden die Liste und das Seitenfenster neu geladen.
- Das Fenster ist 480 px breit, am Handy ein Blatt von unten (90 vh).
- Der Fokus geht beim Öffnen auf „Schließen“ und beim Schließen zurück auf das auslösende Element. Esc schließt.

### 3.6 Was entfällt und wohin es geht

- Die **zweite Liste** der Personenkarten unter dem Raster entfällt. Ihr Kopf („N Tage fehlen“, Ist von Soll, Saldo) steht jetzt in der Zeile, ihr Inhalt im Seitenfenster.
- Die **Kürzel-Legende** entfällt, die Wörter stehen im Tooltip, in der Woche und im Seitenfenster.
- „Der Name springt in die Zeile der Person“ wird zu: Name bzw. Zeile öffnet das Seitenfenster.

### 3.7 Abnahme R4-A (zusätzlich zu Abschnitt 8)

- [ ] Für jede Person und jeden Tag des Testmonats stimmt der Zustand des Streifens mit dem heutigen Raster überein (Skript vergleicht alt gegen neu).
- [ ] Gebucht, Soll bisher, Saldo, Gesamtsaldo und Resturlaub sind je Person **zeichengleich** mit der heutigen Karte (Skript).
- [ ] Monats-CSV, CSV je Person und „Bericht für Zeitraum“ haben dieselbe Prüfsumme wie die Referenz V4.
- [ ] Monat und Jahr lassen sich über den Titel wählen, auch 2022.
- [ ] 25 Personen × 31 Tage: Seite fertig ≤ 1,5 s, Seitenfenster ≤ 300 ms (Abschnitt 7).
- [ ] Bei 390, 834 und 1.440 px gibt es kein seitliches Scrollen der Seite.
- [ ] Supportzugang: kein Streifen, keine Karte „Arbeitszeitgrenzen“.

---

## 4. Paket R4-B – Wochenplan

### 4.1 Seite und Breite

- **Titel der Seite: „Einsatzplanung“**, Unterzeile „Wer ist wann wo – und wer ist noch frei“.
  - Die Reiter „Wochenplan | Tag planen“ entfallen. Stattdessen gibt es in der Steuerung den Umschalter **„Woche | Monat | Tag“**.
  - „Tag“ zeigt die bisherige Seite „Tag planen“ (`/assignments/tag`) ohne eigene Reiter und ohne doppelten Titel. Ihr Inhalt bleibt unverändert: Kalender, „Einsatz planen — …“, „Termine am …“, „Einsätze am …“, „Noch nicht eingeteilt“.
- **Die Planung nutzt die volle Inhaltsbreite** (`.inhalt` ohne `max-width`). Das ist die wichtigste Einzelmaßnahme gegen abgeschnittene Einsätze.
- **„Noch einzuplanen“** wird eine schlanke Hinweiszeile über dem Raster:
  - Text: „N laufende Baustellen ohne Einsatz in dieser Woche: A, B, C und N weitere“, rechts der Textknopf „Noch einzuplanen …“.
  - Der Textknopf öffnet ein Seitenfenster mit derselben Liste wie heute (Kunde, Nummer). Ein Tipp öffnet „Einsatz planen“ mit dieser Baustelle und dem nächsten Arbeitstag der Woche (ab heute).
  - Datenquelle und Inhalt bleiben gleich, die Ablage rechts entfällt.
  - Sind alle eingeplant, entfällt die Zeile.
- **„Im eigenen Kalender“** bleibt als Karte unter dem Raster, unverändert.

### 4.2 Raster

- **Spalten am Schreibtisch:** Namensspalte 200 px, Tage `minmax(128px, 1fr)`.
- **Spalten am Tablet:** Namensspalte 132 px, Tage `minmax(96px, 1fr)`.
- **Samstag, Sonntag, Feiertag:** schmal (56 px bzw. 44 px), **solange an dem Tag weder ein Einsatz noch ein Termin steht**, sonst normal breit.
  - Kopf der schmalen Spalte: „Sa“ und „10.“, den Feiertag als `title`.
  - Auch eine schmale Zelle ist anklickbar und plant.
- **Kopfzeile und Namensspalte bleiben stehen** wie heute. Das Raster scrollt in sich (`max-height: 74vh`), die Seite nicht seitlich.
- **Gruppen nach Einstufung**, einklappbar, wie heute.
- **Leere Zelle: leer.** Der Kasten „frei“ entfällt.
  - Am Schreibtisch erscheint beim Darüberfahren „+ Einsatz planen“ in Petrol.
  - Ein Klick öffnet „Einsatz planen“ mit Tag und Person vorbelegt (wie heute).
  - Die Zahl der Freien steht weiter im Tageskopf („2 frei“).
- **Abwesend:** grauer Block mit der Art als Wort, nach den Rechten von heute. Er bricht nur zwischen Wörtern um, Silbentrennung ist erlaubt. Ein Klick auf die Zelle plant trotzdem; das Fenster warnt wie heute.
- **Eingeteilt, aber abwesend:** Block in Bernstein-hell mit 2 px Bernstein-Rand, darin die Baustelle und „fehlt: Krank“ bzw. „fehlt“. Er bleibt anklickbar.
- **Einsatzblock** (Petrol, weiße Schrift, 13 px), in dieser Reihenfolge:
  1. Kunde der Baustelle (600). **Nicht abschneiden:** umbrechen mit `overflow-wrap: break-word; hyphens: auto` bei `lang="de-AT"`.
  2. Uhrzeit „07:00–15:30“ bzw. „ab 07:00“. Ohne Uhrzeit der Ort der Baustelle.
  3. Baustellennummer, nur am Schreibtisch. Am Tablet steht sie im `title` und im Seitenfenster.
  4. Zusatzzeilen für Termine derselben Baustelle am selben Tag, siehe 4.4.

  Das `title` des Blocks enthält den vollen Text: Kunde, Bezeichnung, Nummer, Zeit, Eingeteilte.
- **Zwei Einsätze an einem Tag:** beide Blöcke untereinander, die Zelle wird höher.

### 4.3 Tageskopf

Inhalt untereinander:
1. „Mo 05.10.“ (600)
2. „N frei“ bzw. den Namen des Feiertags
3. **„Lieferung ohne Annahme“** in Bernstein, nur wenn 4.4 Regel 3 zutrifft (bei mehreren „N Lieferungen ohne Annahme“). Nur zwischen Wörtern umbrechen.
4. **„N Termine“** in Petrol, unterstrichen, wenn an dem Tag Termine bestehen.

Heute ist Petrol-hell mit 3 px Petrol unten.

**Klick auf den Tageskopf** öffnet das Seitenfenster **„Tag“** (Titel „Mittwoch, 07.10.“, darüber „KW 41“). Es enthält:
- **„Termine am …“** mit „Termin anlegen“. Jede Zeile zeigt Art, Zeit, Baustelle oder Kunde und die Teilnehmer und öffnet „Termin ändern“. Bei einer Lieferung ohne Annahme steht der Zusatz „niemand dort“.
- **„Einsätze“** je Baustelle: Kunde, Bezeichnung, Nummer, Zeit, Eingeteilte, „Am selben Tag: …“, fehlende Personen in Bernstein, je Baustelle der Knopf „Bearbeiten“.
- **„Frei“**: Personen ohne Einsatz, je Zeile „Einsatz planen“. Darunter die Abwesenden mit Art.
- **Fußleiste:** „In ‚Tag‘ öffnen“ (bisheriges Ziel des Klicks, jetzt einen Klick weiter) und die Hauptaktion „Einsatz planen“ mit dem Tag vorbelegt.

> Hinweis zur Entscheidung (Abschnitt 11, Frage 1): Heute springt der Tageskopf direkt nach „Tag planen“. Das Seitenfenster hält den Planer in der Woche. Lehnt der Betreiber das ab, bleibt der Sprung, und die Termine erreicht man über „N Termine“, das dann allein das Seitenfenster öffnet.

### 4.4 Termine – keine eigene Zeile mehr

Die Zeile „Termine“ entfällt. Jeder Termin erscheint nach diesen Regeln (ein Termin kann mehrfach erscheinen):

1. **Teilnehmer, die im Raster stehen:** In der Zelle der Person steht ein **Termin-Eintrag**.
   - Gestaltung: weiß, 1 px Linie, 3 px Petrol links.
   - Inhalt: Art (600, umbrechend), Zeit („14:00–15:00“ bzw. „ganzer Tag“), Baustelle bzw. Kunde.
   - Ein Klick öffnet **„Termin ändern“** im Seitenfenster. Das ist dasselbe Formular wie unter „Termine am …“ in Tag planen (Art, Tag, Von, Bis bzw. Zeitfenster, „Uhrzeit entfernen“, Baustelle oder Kunde, Teilnehmer, Notiz) samt „Löschen“ mit Rückfrage.
   - Wer Termine nur sehen darf, bekommt dasselbe Fenster schreibgeschützt.
2. **Termin an einer Baustelle, auf der an dem Tag ein Einsatz liegt:** Im Einsatzblock dieser Baustelle steht eine Zusatzzeile, z. B. „Lieferung 08:00–10:00“, abgetrennt durch eine Linie.
   - Sie entfällt bei der Person, die selbst Teilnehmer ist, denn bei ihr steht schon Regel 1.
   - Das entspricht dem heutigen Hinweis „Am selben Tag auf dieser Baustelle: …“.
3. **Lieferung (Aviso) an einer Baustelle, auf der an dem Tag niemand eingeteilt ist:** „Lieferung ohne Annahme“ im Tageskopf (Bernstein).
   - Das ist der einzige neue Signalhinweis. Er beruht auf der vorhandenen Frage „Steht jemand zur Annahme da?“ und nutzt nur vorhandene Daten.
4. **Alle Termine** zählen in „N Termine“ im Tageskopf und stehen im Seitenfenster „Tag“. Dazu gehören Termine ohne Baustelle (z. B. Besichtigung nur am Kunden) und Termine, deren Teilnehmer nicht im Raster stehen (Büro, Leitung).

Damit ist jeder Termin anklickbar und hat einen Ort, der ihn erklärt. Die Rechte bleiben wie im Handbuch: anlegen, ändern und löschen dürfen Leitung und Verwaltung; „Termine anderer Baustellen erscheinen dort nicht“ gilt weiter für den Monteur.

### 4.5 Sicht „Baustellen“ (ab Tablet)

- **Zeilen:** Baustellen mit Einsatz oder Termin in dieser Woche, mit Kunde und darunter „Nummer · Ort“.
- **Zelle:** ein Block mit den Eingeteilten (Kurzform „Max T., Lena P.“) und der Zeit. Fehlt jemand, Bernstein mit „Max T. fehlt“. Dazu die Termin-Einträge dieser Baustelle.
- **Leere Zelle:** „Einsatz planen“ mit Baustelle und Tag.

### 4.6 Seitenfenster „Einsatz planen / bearbeiten“

**Inhalt und Verhalten bleiben wie heute:**
- Tag
- Baustelle
- Hinweis „Am selben Tag auf dieser Baustelle: … Steht jemand zur Annahme da?“
- „Für diese Baustelle ist der Tag bereits geplant …“
- Mitarbeiter mit „frei“ / „schon eingeteilt: …“ / abwesend grau, „Nur freie anzeigen“, Einstufung je Person („als Helfer“), „Alle entfernen“
- Kommentar / Aufgabe
- Beginn, Ende, „Uhrzeit entfernen“
- Rüstliste: Artikel aus dem Lager, freie Zeile, Fehlmenge, „Anforderung über … anlegen“
- „Einsatz und Rüstliste speichern“
- „Gespeichert eingeteilt“ mit „Einsatz löschen“ je Person und Rückfrage
- „Ganzen Tag in ‚Tag planen‘ öffnen“

**Nur die Anordnung ändert sich:**
- Einspaltig.
- Der Hinweis zum Termin steht direkt unter der Baustelle.
- In der Fußleiste stehen „Ganzen Tag ansehen“ (öffnet das Seitenfenster „Tag“; „In ‚Tag‘ öffnen“ steht dort) und „Speichern“.

### 4.7 Handy (bis 759 px)

- **Tageswahl** Mo–So als Leiste. Unter dem Datum ein Punkt: Petrol bei Terminen, Bernstein bei einer Lieferung ohne Annahme.
- **Darunter die Tagesliste:**
  - zuerst „N Termine“ mit „Termin anlegen“, jeder Termin anklickbar;
  - dann je Einstufung die Personen mit ihren Blöcken nach 4.2 und 4.4;
  - eine freie Person trägt den Textknopf „frei – Einsatz planen“.
- **Ausgeblendet:** „Personen | Baustellen“ (heute schon erst ab Tablet) und der optionale Filter.
- **Hauptaktion „Einsatz planen“** im Daumenbereich, vorbelegt mit dem gewählten Tag.

### 4.8 Team-Woche und „Mein Einsatzplan“

Nicht Teil dieses Auftrags.
- Nutzt die Team-Woche dieselben Bausteine wie der Wochenplan, dann muss sie danach **genau** wie vorher bleiben: ohne Knöpfe, ohne „frei“, ohne Monat, mit „abwesend“ ohne Grund und ohne Termine anderer Baustellen.
- Lässt sich das nicht sauber trennen: Haltepunkt.

### 4.9 Abnahme R4-B (zusätzlich zu Abschnitt 8)

- [ ] Jeder Termin des Testbestands ist im Raster oder im Tageskopf erreichbar und öffnet „Termin ändern“ bzw. die Leseansicht (Skript: alle Termin-IDs der Woche gegen klickbare Elemente).
- [ ] Bei 1.440 und 1.920 px ist kein Kundenname im Block abgeschnitten (Prüfung: `scrollWidth <= clientWidth` je `.e-titel`).
- [ ] „Noch einzuplanen“ liefert dieselbe Menge wie vorher.
- [ ] „Tag“ zeigt die bisherige Seite vollständig. `/assignments/tag` funktioniert direkt.
- [ ] Wochenende und Feiertag sind schmal, wenn leer, und breit, sobald ein Einsatz oder Termin daliegt (Notdienst am Samstag im Testbestand).
- [ ] Kalender-Abo (ICS) unverändert (Prüfsumme V4).
- [ ] Rechte: Projektleiter, Geschäftsführung und Administrator wie heute. Die Verwaltung sieht die Einsatzplanung weiterhin nicht; Termine pflegt sie wie bisher in der Baustellen- und Kundenakte.

---

## 5. Paket R4-C – Monat mit Vorschau

### 5.1 Sicht „Personen“

- **Spalten:** Namensspalte 190 px am Schreibtisch, 120 px am Tablet. Am Tablet steht der Name kurz („Max T.“), der volle Name im `title`. Die Tage sind `repeat(N, minmax(0, 1fr))`.
- **Kopf je Tag:**
  - Wochentag: zwei Buchstaben am Schreibtisch, einer am Tablet.
  - Tageszahl.
  - Darunter ein 6-px-Punkt: Petrol, wenn Termine bestehen; Bernstein bei einer Lieferung ohne Annahme.
  - Wochenende und Feiertag sind hinterlegt. Heute ist Petrol-hell mit 3 px Unterstrich, und der heutige Tag ist durch zwei feine Petrol-Linien über die ganze Höhe markiert.
- **Balken statt Felder:**
  - Aufeinanderfolgende Kalendertage, an denen die Person auf **derselben Baustelle** eingeteilt ist, werden **ein Balken** (`grid-column: start / span n`). Ein Tag ohne Einsatz, das Wochenende eingeschlossen, beendet den Balken.
  - **Beschriftung** mit der **Kurzform des Kunden**. Diese erzeugt eine reine Anzeigefunktion `kurzname(kunde)`:
    - Firmen ohne Rechtsform („CT Bau GmbH“ → „CT Bau“, „Gemeinde Ansfelden“ → „Ansfelden“)
    - Privatkunden mit dem Nachnamen („Familie Huber“ → „Huber“, „Anna Beispiel“ → „Beispiel“)
  - Es gibt **kein neues Datenfeld** (siehe Abschnitt 10). Das `title` und die Vorschau tragen den vollen Namen.
  - Die Beschriftung erscheint nur, wenn der Balken mindestens 46 px breit ist; sonst bleibt er ohne Text.
  - Gibt es an einem Tag zwei Einsätze, bekommt die Zeile eine zweite Bahn (Bahnen gierig vergeben).
  - **Abwesenheit** ist ein grauer Balken mit der Art als Wort (Rechte wie heute).
  - **Eingeteilt, aber abwesend** ist ein Bernstein-heller Balken mit 2 px Bernstein-Innenrand und dem Text „Kurzname – fehlt“.
- **Hintergrund:** Jeder Tag ist eine eigene Schaltfläche über die ganze Zeilenhöhe. Sie zeigt die Vorschau auch an freien Tagen; dort steht „Einsatz planen“.
- **Gruppen** nach Einstufung, einklappbar.
- **Legende** unter dem Raster: eingeplant, eingeteilt aber abwesend, abwesend, Wochenende/Feiertag sowie der Satz „Punkt im Kopf: Termine an diesem Tag · Tag antippen zeigt die Vorschau“.

### 5.2 Sicht „Baustellen“

- **Zeilen:** Baustellen mit Einsatz im Monat. Am Tablet steht der Kurzname.
- **Balken:** aufeinanderfolgende Tage **mit derselben Besetzung**. Wechselt die Besetzung, beginnt ein neuer Balken.
- **Beschriftung:** die Kurzform der Personen („Max M.“) bzw. „N Pers.“. Fehlt jemand: Bernstein.
- Diese Sicht ersetzt die Liste „Baustellen diesen Monat“, die das Handbuch unter „Was noch offen ist“ ausdrücklich als Balken vorsieht. Die Zuordnung steht in Abschnitt 9.

### 5.3 Vorschau (neu)

**Auslöser:** Klick bzw. Tipp auf einen Balken oder einen Tag.
- Bei einem Balken bestimmt die Klickposition den Tag: `start + floor((x − links) / breite × span)`.
- Bei einer Bedienung über die Tastatur gilt der erste Tag des Balkens.

**Form:**
- **Schreibtisch und Tablet:** ein schwebendes Feld (380 px breit, höchstens 80 vh hoch, Radius 12 px, Schatten).
  - Es steht unter dem angeklickten Balken und ist zur Klickstelle zentriert. Reicht der Platz nicht, steht es darüber.
  - Es bleibt immer 12 px vom Rand entfernt.
  - Es gibt keinen Schleier, das Raster bleibt sichtbar. Der angeklickte Balken ist markiert (Petrol-tief mit Ring).
- **Handy:** ein Blatt von unten (höchstens 82 vh) mit Schleier.

**Kopf:**
- Oben klein „Dienstag, 13.10.2026“, bei Feiertagen mit Namen.
- Darunter fett die Person bzw. die Baustelle.
- Rechts ‹ › (vorheriger/nächster Tag, gleiche Person bzw. Baustelle) und ×.

**Inhalt je Einsatz** (Sicht Personen: der angeklickte Einsatz zuerst):

| Zeile | Inhalt (alles vorhandene Daten) |
|---|---|
| Titel | Kunde · Bezeichnung der Baustelle |
| Unterzeile | Baustellennummer |
| Zeit | „07:00–15:30“ bzw. „ganzer Tag, ohne Uhrzeit“ |
| Adresse | Adresse der Baustelle |
| Mit dabei | die übrigen Eingeteilten (Sicht Baustellen: „Eingeteilt“, alle); Abwesende mit „(fehlt)“ |
| Aufgabe | Kommentar/Aufgabe des Einsatzes |
| Rüstliste | „N Positionen · N mit Fehlmenge“ bzw. „keine“ |
| Hinweis Petrol-hell | „Am selben Tag: Lieferung (Aviso) · 08:00–10:00“ je Termin der Baustelle |
| Hinweis Bernstein | „Max Testermann ist an diesem Tag abwesend (Krank) – neu einteilen?“ |
| Textknopf | „Baustelle öffnen“ (zur Baustellenakte) |

Weitere Fälle:
- **Abwesenheit** der Person: ein eigener Abschnitt mit Art und Zeitraum (Rechte wie heute).
- **Termine der Person:** je ein Abschnitt mit „Termin ändern“.
- **Frei:** „Frei – noch kein Einsatz an diesem Tag.“, am Wochenende bzw. Feiertag dessen Name.

**Fußleiste:**
- **Ein Einsatz:** „Zur Woche“ (Nebenknopf) und **„Bearbeiten“** (Hauptknopf). „Bearbeiten“ öffnet **dasselbe Seitenfenster „Einsatz bearbeiten“ wie in der Woche** (Baustelle und Tag), die Vorschau schließt sich.
- **Mehrere Einsätze:** je Abschnitt ein Knopf „Bearbeiten“, in der Fußleiste nur „Zur Woche“.
- **Kein Einsatz:** „Zur Woche“ und „Einsatz planen“, vorbelegt mit Person bzw. Baustelle und Tag.
- **„Zur Woche“** wechselt in die Woche dieses Tages und markiert den Tageskopf mit 2 px Petrol-Ring. Die Adresse lautet `?woche=JJJJ-Www&tag=JJJJ-MM-TT`, damit Lesezeichen und „Zurück“ funktionieren.

**Bedienung:**
- Esc schließt die Vorschau, ebenso ein Klick außerhalb (Mausklick auf das Raster öffnet die nächste).
- ← und → blättern tageweise, solange der Fokus nicht in einem Eingabefeld liegt.
- Beim Öffnen geht der Fokus auf ×, beim Schließen zurück auf den Balken.
- `role="dialog"` mit `aria-labelledby` auf den Titel.
- Es ist immer nur eine Vorschau offen. Öffnet sich das Seitenfenster, schließt sich die Vorschau.

**Daten:**
- Was der Monat schon geladen hat (Einsätze mit Personen, Zeiten, Aufgabe, Abwesenheiten, Termine), zeigt die Vorschau ohne neue Abfrage.
- Rüstliste und Adresse werden, falls nicht geladen, **beim Öffnen** über die **bestehende** Abfrage nachgeladen. Bis dahin steht „…“.
- Braucht es dafür eine neue Abfrage oder Serverfunktion: Haltepunkt.

### 5.4 Handy: Monatskalender

- **Oben** die Auswahl „Alle Personen | Person …“, darunter ein Satz zur Lesart.
- **Kalender** 7 Spalten (Mo–So), Tage 58 px hoch.
  - **Alle Personen:** Zahl der Baustellen mit Einsatz und Punkt für Termine. Bernstein, wenn jemand Eingeteiltes fehlt.
  - **Eine Person:** Balken eingeplant/abwesend und „fehlt“ in Bernstein.
- **Tipp auf einen Tag** öffnet die Vorschau als Blatt:
  - bei „Alle Personen“ mit allen Einsätzen des Tages, je Baustelle mit „Bearbeiten“, dazu Termine und Hinweise;
  - bei einer Person wie in 5.3.
- **Darunter** „Diesen Monat abwesend“ wie heute: je Abwesenheit eine Zeile mit Art und Zeitraum, **nicht** zusammengelegt über verschiedene Arten.

### 5.5 Abnahme R4-C (zusätzlich zu Abschnitt 8)

- [ ] Jeder Einsatz des Testmonats ist über genau einen Balkentag erreichbar. Die Vorschau zeigt dieselben Daten wie das Seitenfenster (Skript).
- [ ] „Bearbeiten“ aus der Vorschau und der Klick auf denselben Einsatz in der Woche öffnen ein identisches Seitenfenster (DOM-Vergleich der Felder).
- [ ] ← → in der Vorschau blättern auch über Monatsgrenzen. Das Raster bleibt dabei stehen.
- [ ] Bei 1.440 px liegt die Vorschau vollständig im Bild, auch am rechten Rand und in der untersten Zeile.
- [ ] Vorschau öffnen ≤ 150 ms (ohne Nachladen), mit Nachladen ≤ 500 ms.
- [ ] Das Handy-Blatt verdeckt die untere Leiste, und die Hauptaktion bleibt danach erreichbar.

---

## 6. Neue und geänderte Bausteine

Jeder Baustein kommt zuerst nach `/_muster` (Umbauprotokoll, Phase C), mit allen Zuständen in drei Breiten.

| Baustein | Klassen (je Element eine) | Neu/geändert |
|---|---|---|
| Streifen | `.streifen`, `.st-ok`, `.st-grenze`, `.st-fehlt`, `.st-weg`, `.st-frei`, `.st-zukunft`, Kopf `.st-kopf`, `.st-kopf-mo`, `.st-kopf-we`, `.st-kopf-heute` | neu |
| Wochenzelle der Übersicht | `.mw-zelle`, `.mw-zelle-grenze`, `.mw-zelle-fehlt`, `.mw-zelle-weg`, `.mw-zelle-frei`, `.mw-zelle-zukunft`, `.mw-std`, `.mw-von` | neu |
| Tooltip | `.tipp` (nur ab 1.200 px; darunter öffnet der Tipp das Fenster) | neu |
| Einsatzblock | `.eintrag`, `.eintrag-konflikt`, `.eintrag-weg`, `.e-titel`, `.e-zeile`, `.e-nr`, `.e-zusatz` | geändert (umbrechen statt abschneiden, Zusatzzeile) |
| Termin-Eintrag | `.eintrag-termin` | neu |
| Tageskopf | `.wp-kopf`, `.wp-kopf-heute`, `.wp-kopf-schmal`, `.wp-kopf-markiert`, `.kopf-tag`, `.kopf-info`, `.kopf-warnung`, `.kopf-termine` | geändert |
| Hinweiszeile | `.hinweiszeile`, `.hinweis-text` | neu (ersetzt die Ablage) |
| Monatsbalken | `.mo-balken`, `.mo-balken-gewaehlt`, `.mo-balken-weg`, `.mo-balken-konflikt`, `.mo-hg`, `.mo-hg-we`, `.mo-hg-heute` | neu |
| Vorschau | `.vorschau`, `.vorschau-blatt`, `.vorschau-kopf`, `.vorschau-inhalt`, `.vorschau-fuss`, `.v-abschnitt`, `.v-reihe`, `.v-hinweis`, `.v-info` | neu |
| Kalender (Handy) | `.kal-raster`, `.kal-tag`, `.kal-tag-we`, `.kal-tag-heute`, `.kal-tag-gewaehlt`, `.kal-info`, `.kal-balken` | neu |

Die Zustände unterscheiden sich durch **eigene Klassen**, nicht durch Kombinationen. Farben kommen nur aus den Tokens der Designlinie. Neue Farben gibt es nicht; `#F4F8F9` für die Spalte „heute“ wird als Token `--heute` angelegt.

---

## 7. Mengengerüst und Messwerte

Testbestand nach Umbauprotokoll Phase B, ergänzt um:
- 25 Personen mit Zeitkonto, davon 3 Lehrlinge
- 40 laufende Baustellen
- 120 Einsätze je Woche, 2 Personen mit zwei Einsätzen am selben Tag
- 60 Termine je Monat, davon 6 Lieferungen ohne Annahme und 10 mit Teilnehmern aus dem Büro
- ein Feiertag (26.10.) und ein Notdienst am Samstag

| Messung | Budget |
|---|---|
| Mitarbeiterübersicht Monat, 25 Personen, fertig gezeichnet | ≤ 1,5 s (Schreibtisch), ≤ 2,5 s (Handy, gedrosselt) |
| Seitenfenster Person öffnen | ≤ 300 ms |
| Wochenplan, 25 Personen | ≤ 1,5 s / ≤ 2,5 s |
| Monat, 25 Personen × 31 Tage | ≤ 1,5 s / ≤ 2,5 s, höchstens 2.500 DOM-Elemente im Raster |
| Vorschau öffnen | ≤ 150 ms ohne, ≤ 500 ms mit Nachladen |
| Abfragen je Seitenaufruf | nicht mehr als heute (kein N+1 je Person oder Tag) |

---

## 8. Abnahme

Je Paket gilt das Umbauprotokoll, Abschnitt 8, Punkte 1–12, dazu die Listen 3.7, 4.9 und 5.5. Außerdem:

- **Browser-Wege** (Chromium und WebKit, drei Breiten). Jeder Weg einmal als Administrator und einmal als Projektleiter:
  1. Übersicht → Streifenfeld „ohne Buchung“ → Seitenfenster → „Zeit erfassen“ → speichern → Feld wird Petrol, Zähler sinkt.
  2. Lehrling: Buchung über 8 Std. → Rückfrage → „Trotzdem buchen“ → Fall erscheint in „Arbeitszeitgrenzen“.
  3. Woche → Termin-Eintrag → „Termin ändern“ → Zeit ändern → speichern → Eintrag und Zusatzzeile zeigen die neue Zeit.
  4. Woche → Tageskopf mit „Lieferung ohne Annahme“ → Seitenfenster „Tag“ → „Einsatz planen“ auf dieser Baustelle → speichern → der Hinweis verschwindet, die Zusatzzeile erscheint.
  5. Monat → Balken → Vorschau → → → „Bearbeiten“ → Person ergänzen → speichern → Balken aktualisiert.
  6. Monat → Vorschau → „Zur Woche“ → richtige Woche, Tag markiert, „Zurück“ führt in den Monat.
  7. Handy: Monat → Tag → Blatt → „Bearbeiten“ → speichern.
- **Bedienbarkeit:**
  - Alle Felder, Balken und Einträge sind mit der Tastatur erreichbar und haben ein `aria-label` mit Person, Tag und Zustand.
  - Kontrast: Bernstein auf Bernstein-hell und Grau auf `--abwesend` mindestens 4,5:1.
  - axe ohne neue Fehler.
- **Vorher-Nachher-Fotos** je Rolle und Breite für den Betreiber, im Abnahmeblatt verlinkt.

---

## 9. Zuordnung alt → neu (vollständig)

Diese Tabelle kommt als Einträge nach `zuordnung.json`. Jedes Element, das die Bestandsliste V2 zusätzlich findet, wird ergänzt; fehlt eine Zuordnung: Haltepunkt.

| Alt | Neu | Klicks mehr |
|---|---|---|
| Mitarbeiterübersicht: Auswahl Monat, Auswahl Jahr | Klick auf den Titel öffnet beide; dazu ‹ › | +1 (‹ › 0) |
| Raster: Zelle mit Stunden | Streifenfeld (Tooltip) bzw. Wochenzelle (Text) | 0 |
| Raster: Bernstein-Rand | Streifenfeld Bernstein / „fehlt“ | 0 |
| Raster: Kürzel K/U/ZA/BS/SU/PF/UU | Wort im Tooltip, in der Woche und im Seitenfenster | 0 |
| Raster: Soll beim Darüberfahren | Tooltip | 0 |
| Raster: Name springt in die Zeile | Name/Zeile öffnet das Seitenfenster | 0 |
| Kürzel-Legende | Legende in Wörtern | 0 |
| Karte je Person: Kopf (fehlt, Ist von Soll, Saldo) | Zeile der Liste | 0 |
| Karte: Saldo, Gesamtsaldo, Urlaub, Tagessoll | Seitenfenster: Kennzahlen und Textzeilen | 0 (statt Aufklappen) |
| Karte: „N Arbeitstage ohne Buchung“ | Seitenfenster: Abschnitt mit „Zeit erfassen“ je Tag | 0 |
| Karte: Tagesnachweis mit Bearbeiten, Löschen, Krankmeldung, Antrag | Seitenfenster: Tagesnachweis, gleiche Aktionen | 0 |
| Karte: „Monat als CSV“, „Bericht für Zeitraum“ | Seitenfenster: Fußleiste | 0 |
| „⋯“ → Monats-CSV | unverändert | 0 |
| Karte „Arbeitszeitgrenzen“ (alle Knöpfe) | unverändert, als Arbeitsliste; dazu im Seitenfenster | 0 |
| Projektauswertung | unverändert | 0 |
| Reiter „Wochenplan“ | Umschalter „Woche“ | 0 |
| Reiter „Tag planen“ | Umschalter „Tag“ (gleiche Adresse) | 0 |
| Seitentitel „Wochenplan“ | „Einsatzplanung“ | – |
| Zeile „Termine“ (Kärtchen mit `title`) | Termin-Eintrag in der Zelle, Zusatzzeile im Einsatz, „N Termine“ im Kopf → Seitenfenster „Tag“ | 0 bzw. +1 |
| Tageskopf → Sprung nach „Tag planen“ | Tageskopf → Seitenfenster „Tag“ → „In ‚Tag‘ öffnen“ | +1 |
| „N frei“ im Kopf | unverändert | 0 |
| Kasten „frei“ in Zellen | leere Zelle; „+ Einsatz planen“ beim Darüberfahren | 0 |
| Ablage „Noch einzuplanen“ | Hinweiszeile → Seitenfenster | +1 |
| Umschalter „Personen / Baustellen“ | unverändert (ab Tablet) | 0 |
| Seitenfenster „Einsatz bearbeiten“ (alle Felder, „Einsatz löschen“ je Person, „Ganzen Tag in ‚Tag planen‘ öffnen“) | unverändert im Inhalt; „Ganzen Tag ansehen“ → Seitenfenster „Tag“ → „In ‚Tag‘ öffnen“ | 0 bzw. +1 |
| „Im eigenen Kalender“ (Neuen Link, Abo beenden) | unverändert | 0 |
| Monat: Feld je Tag, Klick springt in die Woche | Balken bzw. Tag → Vorschau → „Zur Woche“ | +1 |
| Monat: „Baustellen diesen Monat“ (Liste) | Sicht „Baustellen“ im Monat | +1 |
| Monat (Handy): „Diesen Monat abwesend“ | unverändert unter dem Kalender | 0 |

---

## 10. Bewusst nicht in diesem Auftrag

Diese Punkte kommen nur mit ausdrücklicher Freigabe als eigene, getrennte Aufträge:

- **Filter „Zeigen: Alle · Nur mit Einsätzen · Nur mit freien Tagen“** im Wochenplan (steht im Handbuch als offen). Der Entwurf zeigt ihn; ohne Freigabe wird er nicht gebaut.
- **Ziehen** von „Noch einzuplanen“ oder von Blöcken auf einen Tag.
- **Datenfeld „Kurzname“ an der Baustelle.** Bis dahin genügt die Anzeigefunktion `kurzname()`.
- **Monatsansicht für Genehmigende** unter Urlaub (eigener offener Punkt).
- **„Lieferung ohne Annahme“ auf der Startseite der Leitung.** Hier steht sie nur im Wochenplan, Monat und Tag.
- Jede Änderung an Berechnungen, Exporten, Rechten oder dem Kalender-Abo.

---

## 11. Entscheidungen des Betreibers vor dem Start

Bitte im Abnahmeblatt R4-0 festhalten:

1. **Tageskopf:** Er öffnet das Seitenfenster „Tag“ statt direkt nach „Tag planen“ zu springen, also einen Klick mehr bis „Tag planen“. **Empfehlung (KI): ja.**
2. **Mitarbeiterübersicht:** Standard ist „Monat“, „Woche“ ist die zweite Ansicht. **Empfehlung: ja.**
3. **„Zeit erfassen“ direkt an jedem Tag ohne Buchung** im Seitenfenster. Es nutzt die vorhandene Funktion mit Vorbelegung. **Empfehlung: ja.**
4. **Filter „Zeigen“** im Wochenplan jetzt mitbauen? **Empfehlung: nach dem Pilot**, wenn sich der Bedarf zeigt.

---

*Erstellt mit KI-Unterstützung (KI-Vorschlag). Fehler sind möglich, keine Rechtsberatung. Im Zweifel an einem Haltepunkt anhalten und nachfragen; rechtliche Fragen zu AZG und KJBG mit der WKO bzw. Fachleuten klären.*
