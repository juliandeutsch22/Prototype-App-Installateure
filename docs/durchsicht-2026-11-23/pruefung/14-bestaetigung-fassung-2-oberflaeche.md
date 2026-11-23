# Bestätigung der Fassung 2 — Teil Oberfläche (23.11.2026)

Geprüft von einem unabhängigen Prüfer, der weder Papiere noch Plan noch Prüfberichte geschrieben hat.
Stand `main` fa6e740. Gegenstand: `plan.md` (Fassung 2), Abschnitte 1 (Oberfläche), 2, 3, 5, 6, 7, 8,
9.3, Pakete 8 bis 20, Abschnitt 10 (Oberfläche), 12.2 — gegen `pruefung/8` bis `12` und `0`.

**Womit geprüft:** alle fünf Prüfberichte und Bericht 0 (§5 bis §11) Zeile für Zeile gegen den Plan
gelesen; das Änderungsprotokoll A.0, A.8 bis A.12, B, C je Zeile an der genannten Stelle des Plans
nachgeschlagen; Regelwerk gelesen (`CLAUDE.md`, `style.md` U1–U6, E25, E31, E76, E86, E88, E95, E97,
E98, E99 in `entscheidungen.md`); Werkzeuge am Code (`funktionsinventar.test.ts`,
`v10-funktionsinventar-vorher.json`, `fotos.mjs`, `messen.mjs`, `schriftskala.spec.ts`,
`raster.spec.ts`, `flucht.spec.ts`, `playwright.config.ts`); eigene Messungen in der Vorschau
(Chromium 1243, 375 / 390 / 760 / 834 / 1024 / 1194 / 1199 / 1200 / 1440 px) mit eigenen Skripten
unter `…/scratchpad/audit/bestaetigung-o/` (`monat.mjs`, `punkte.mjs`, `punkte2.mjs`, `formen.mjs`,
`formen2.mjs`, `kopf.mjs`, `kopf2.mjs`, `nav.mjs`, `dump.mjs`). Keine Zahl aus Plan oder Berichten
übernommen, wo „gemessen“ steht.

## 1. Urteil: bestätigt mit Auflagen

Die Prüfberichte 8 bis 12 sind in der Sache vollständig und richtig eingearbeitet: jedes der 408
Urteile steht richtig in der Spalte „Gegenprüfung“ (nachgezählt), die fünf widerlegten Punkte kommen
in keinem Paket, keiner Regel und keinem Beispiel mehr vor, jede von mir nachgeschlagene Warnung
„würde verschlechtern“ steht als Vorgabe im Paket, und die Angaben zu den Werkzeugen in Abschnitt 2.1
stimmen am Code. Kein Paket verlangt Pillen, Farbflächen, Karte in Karte, Schatten an
Nicht-Schwebendem oder Radien gegen die Rollen. Nicht in Ordnung sind zwölf Stellen: zwei Regeln
(Text- und Punktregel) sind so, wie sie dastehen, nicht eindeutig baubar bzw. ihr Wächter leistet
nicht, was der Plan von ihm sagt; eine frühere Entscheidung (E31) wird berührt, ohne dass es
dasteht; „jede Seite genau einmal“ stimmt für Paket 9 nicht; in Paket 18 erlaubt der Wortlaut
weiter, was E-R1/E-W1 ausschließen; und einige Entscheidungen lassen einen Zustand gegen das
Regelwerk stehen, ohne das in Abschnitt 10 zu sagen. Die Auflagen ändern die Gliederung des Plans
nicht; sie sind vor einem Startsignal für die Stufen B und C einzuarbeiten. Stufe A ist von keiner
Auflage berührt.

**Auflagen**

1. **Textregel 1 und E31.** *Stelle:* 6.3 Regel 1; Paket 11 Schritt 2; 10.2 E-T. *Steht dort:* die
   Beschreibung steht „künftig auch ab dem Tablet“ in der Hilfe (ändert E86); Auskunft und die vier
   Seiten aus E25 behalten ihren Untertitel. *Muss dort stehen:* (a) was mit der dritten Zeile des
   Seitenkopfs geschieht — E31 (31.10.2026, Wunsch des Auftraggebers) legt „Seitenkopf in drei
   festen Zeilen“ und „alle Seiten und Unterreiter beginnen auf derselben Höhe“ fest; E-T ändert
   also auch E31 oder die Zeile bleibt leer stehen — eines von beiden, als Satz in 10.2 und als
   Prüfung „erster Inhalt beginnt auf jeder Seite gleich hoch“; (b) die vier Seiten aus E25
   behalten den Untertitel **ab dem Tablet**; am Handy ist er heute schon ausgeblendet (bloßer Text,
   `VacationsView.tsx:1316`, `NachkalkulationView.tsx:176`, `WorkSheetsListView.tsx:1014`) und
   bleibt es — sonst baut jemand über das Merkmal „Auskunft“ eine Zeile am Handy dazu (gegen E86).
   *Beleg:* gemessen (`kopf2.mjs`): blendet man `.seitenkopf-meta-beschreibung` bei 834 und 1440 px
   aus, schrumpft der Kopf von 96 auf 72 px und der Inhalt beginnt 24 px höher (`/invoices`,
   `/customers`, `/lager`: 140 → 116 px bzw. 144 → 120 px). Eine Seite mit Beschreibung begänne
   danach 24 px höher als eine Seite aus E25 oder eine mit Auskunft im Untertitel.
2. **Punktregel: Wächter und Gegenprobe.** *Stelle:* 7.3 Regeln 1, 2, 6 und „Wächter“; Paket 11
   Schritt 5 und „Prüfungen“. *Steht dort:* „je sichtbarer Textzeile höchstens ein Punkt“,
   „Gegenprobe: ohne Ausnahmeliste am heutigen Stand rot an den gesammelten Fundstellen“.
   *Muss dort stehen:* (a) die Gegenprobe so, wie sie stimmt: rot nur an Ketten mit zwei und mehr
   Punkten in einer Textzeile; (b) für das häufigste Muster — genau ein Punkt zwischen Tag und
   Zeit, Kunde und Nummer, Art und Uhrzeit — eine eindeutige Aussage, ob Regel 1 es erlaubt („zwei
   kurze, gleichrangige Angaben“) oder Regel 2/6 es ändert („Gemessenes braucht kein Zeichen
   davor“, Nummer als Stempel); heute sagt die Regel beides; (c) der Quelltext-Teil verbietet auch
   `join(' · ')` außerhalb des neuen Verbinders (113 Stellen) — „keine Zeichenkette mit zwei ‚ · ‘“
   fängt sie nicht; (d) in 7.2 ein Satz, was sich für den Auftraggeber ändert und was nicht.
   *Beleg:* gemessen (`punkte.mjs`, `punkte2.mjs`): auf 15 Seiten bei 375 px tragen 126 Textblöcke
   einen Punkt, davon 7 zwei oder mehr in einer Textzeile; `/time` (Mitarbeiter): 58 von 59 Zeilen
   mit genau einem sichtbaren Punkt (der zweite Punkt der Rohdaten steht im unsichtbaren
   Vorlesetext, `span.sr-only`). Der Wächter wäre heute an rund 94 % der Fundstellen grün.
3. **Regel 5 zweimal, verschieden.** *Stelle:* 6.3 Regel 5 und 7.3 Regel 5. *Steht dort:* 6.3:
   „Name (darf umbrechen), darunter höchstens zwei Angaben, und einen Wert rechts“; 7.3: „Name
   allein in der ersten Zeile, Zustand, Stempel und höchstens zwei Angaben darunter“. *Muss dort
   stehen:* ein Wortlaut für beide: wo der Wert steht (rechts neben dem Namen nimmt er ihm die
   Breite — genau der Fall D1-P4), ob Zustand und Stempel zu den „zwei Angaben“ zählen, welche Form
   das Tablet (760–1.199 px) bekommt, und dass „nicht mehr Zeilen als heute“ je **Zeilenart** mit
   den langen Namen der Beispieldaten gemessen wird (nicht je Datensatz); die Baustellenzeile
   (bleibt, E-W1) als benannte Ausnahme. *Beleg:* eigener Nachbau (`formen.mjs`, `formen2.mjs`),
   Abschnitt 6 unten: Zeitliste 44 von 53 Zeilen mit mehr Textzeilen; Startseite 8 von 9
   Zeilenarten tragen, eine nicht.
4. **Paket 9 und „jede Seite genau einmal“.** *Stelle:* Vorspann Stufe B („keine Seite wird
   umgebaut“), Paket 9 Schritte 2, 3, 4, 8; Tabelle 9.3; Pakete 14 bis 20. *Steht dort:* Paket 9
   berichtigt die Aktionsreihe des Rechnungsfensters (D3-4, D2-A3), die Linie im Lager-Fenster
   (D3-5), die Kennwerte in drei Fenstern (D3-15), den Kopf der vier Akten (V-15), die Arbeitszeile
   (V-2/D3-11 — sie gibt es nur in `AdminOrdersView`), den Fuß des Zeitblatts; für D2-B3, D3-B15,
   D4-B8 und D1-B3 heißt es „die betroffenen Fenster stellen ihre Seitenpakete um“. *Muss dort
   stehen:* (a) in 9.3 eine Zeile „in Paket 9 vorab berührt“ mit genau diesen Fenstern — oder die
   Punkte wandern in die Seitenpakete 15, 16, 18/19; (b) in den Schritten der Seitenpakete je
   Fenster und Stelle, was aus Paket 9 nachzuziehen ist: D2-B3 (acht Fenster: Pakete 17, 18),
   D3-B15 („+ Material“ 16; „+ Steuersatz“, „+ Anzahlungskonto“, „Warengruppe hinzufügen“ 20),
   D4-B8 (Termin, Tag-Fenster, Einsatz 17; Plattform 20), V-3 (die Stelle steht in 14 und 15 nur
   unter „Dazu Teile von“). *Beleg:* `plan.md`: D2-B3, D3-B15, D4-B8, D1-B3 kommen nach Zeile 2405
   (Stufe C) in keinem Schritt mehr vor; Papier 12, D4-B8: „`Fensteraktionen` überall;
   Löschen/Deaktivieren ins ⋯“ — das sind Umbauten an vier Fenstern.
5. **Paket 18 erlaubt, was E-R1 und E-W1 ausschließen.** *Stelle:* Paket 18, Schritt „Listen“
   (D2-A8, D2-A12), „Bleibt gleich laut Papier“ D2-A8, D2-A10, D2-A12, „Prüfungen“; Schritt
   „Formulare“ (D2-C5); Vorgabe A-12. *Steht dort:* „‚Erledigt‘ und ‚Baustelle anlegen‘ bleiben mit
   höchstens einem Tipp mehr erreichbar“; „Annehmen … in höchstens zwei Tipps (⋯ → Annehmen)“;
   „höchstens ein Tipp mehr für ‚Annahme-Link‘“; Prüfung „in höchstens zwei Tipps erreichbar“;
   „Vorschläge statt Vorbelegung der Baustellenadresse“; „Ein PR mit A-17 und D2-A10“. *Muss dort
   stehen:* Vorgabe zu D2-A8 und D2-A12: „die Knöpfe der Angebots-, Wartungs- und Scheinzeile
   bleiben in der Zeile (E-R1, E-W1); die Sätze des Papiers gelten nicht“; Prüfung „mit derselben
   Tippzahl wie heute“; ob die festen Spalten der Angebotsliste (D2-A12) mit den Knöpfen in der
   Zeile überhaupt gehen, hat niemand gemessen — als Bedingung nennen; D2-C5: „nur bei Kundenart
   Hausverwaltung/Unternehmen; Privatkunden und Kunden ohne Kundenart behalten die Vorbelegung“;
   A-17 aus der Vorgabe A-12 streichen (bleibt, 8.3). *Beleg:* Papier 10, Z. 95 („Knöpfe ins
   Fenster, Pfeil in die Zeile“), Z. 126 („Die Zeilenknöpfe wandern ins ⋯ der Zeile“), Z. 275
   („Gleich bleiben: Privatkunden behalten die Vorbelegung“); Plan Z. 2817–2819, 2839, 2897–2900,
   2913.
6. **Regel 11 („ein Tipp mehr wird benannt“) ist an zwei Stellen nicht angewandt.** *Stelle:*
   Paket 14, D1-A2; Paket 9/20, D4-B8. *Steht dort:* „‚Eintrag löschen‘ ins ⋯ des Blatts“;
   Plattform: „im ⋯ muss das Feld erreichbar bleiben“. *Muss dort stehen:* „vorher n, nachher m
   Tipps“ und der Satz, dass U4 („Unumkehrbares steht immer im ⋯“) die Regel ist, die das trägt —
   als Zeile in 10.3 d) oder als benannte Ausnahme von Regel 11. *Beleg:* Bericht 9, D1-A2 („U7 hat
   das Löschen bewusst ins Blatt gelegt“); Papier 12, D4-B8.
7. **E-M genauer fassen.** *Stelle:* 10.2 E-M; Paket 17 Schritt „Woche und Monat“, Vorgabe D4-A10,
   „Bleibt gleich laut Papier“ D4-A10. *Steht dort:* „Unter 1.200 px rollt der Monat seitlich mit
   Spalten ab 44 px“; daneben weiter der Satz des Papiers „Rückschritt: wenn am Tablet nicht mehr
   der ganze Monat auf einen Blick steht“. *Muss dort stehen:* „von 760 bis 1.199 px“ (am Handy ist
   der Monat ein eigener Kalender mit „Für wen“ und bleibt); die Namensspalte klebt, beim Öffnen
   steht „heute“ im Bild, Pfeiltasten und Ziehen (E96, Mitrollen) wie heute; in 10.2 der Verlust im
   Klartext: am Tablet steht nicht mehr der ganze Monat im Bild; der Satz des Papiers in Paket 17
   gestrichen oder als „durch E-M entschieden“ gekennzeichnet. *Beleg:* gemessen (`monat.mjs`):
   834 px — 30 Tagesspalten zu 18,4 px, Namensspalte 120 px, Raster 672 px: mit 44 px sind rund
   12½ von 30 Tagen im Bild; 1.194 px (iPad quer) — heute 30,4 px, danach rund 20 Tage; bei
   1.200 px sind die Spalten 23,3 px breit (schmäler als bei 1.199 px mit 31,2 px, weil die
   Seitenleiste breit wird) und bleiben nach E-M so.
8. **Entscheidungen, die einen Zustand gegen das Regelwerk stehen lassen, sagen das nicht.**
   *Stelle:* 10.3 c) E-R4; 10.2 E-N; Paket 11 Schritt 1. *Steht dort:* E-R4 „Betrifft: Anordnung vom
   15.11.2026“; E-N „E76 bleibt unverändert“. *Muss dort stehen:* E-R4: „damit bleibt ein ⋯
   außerhalb des Seitenkopfs stehen (`CLAUDE.md`, Oberfläche)“ — und die Ausnahme kommt in
   `style.md`/`CLAUDE.md`, nicht nur in die Liste des Wächters; E-N: „die Berichte 0 und 12 haben
   die erste Entscheidung (Kreis im Fenster gerahmt) nicht beanstandet, sondern nur den Satz ‚ändert
   E76‘ verlangt; mit der neuen Empfehlung bleiben im Tagesfenster zwei gefüllte Aktionen (U4:
   höchstens eine) und im Reiter ‚Termine‘ der Baustellenakte am Handy zwei gleiche ‚+‘ (D2-A9 b)“.
   *Beleg:* `AngebotView.tsx:516` (`RowMenu` im Verlauf); Bericht 10, D2-A10 („steht gegen
   `CLAUDE.md` — das trägt“); Bericht 0, 6.2 Nr. 7 („in Ordnung; im Plan fehlt nur der Satz“);
   Bericht 12, D4-B15 (gemessen: „Termin anlegen“ 48 × 48 gefüllt neben „Einsatz planen“ gefüllt).
9. **„Bleibt gleich laut Papier“ enthält Sätze, die die Vorgabe daneben widerlegt.** *Stelle:*
   Paket 15 D3-C11 („Enter … bleibt Zeilenumbruch“ — sachlich falsch, Bericht 11); Paket 14 D1-A4
   („fester Bezirksvorsatz“), D1-A5 („Löschen … im Blatt“ — Berufsschulzeilen haben keines);
   Paket 9 D2-A1 („der Knopf im Kartenkopf am Tablet“ — dort heute kaputt); Paket 20 D3-P12
   („Tabben zeilenweise“); Paket 10 D1-A22 (Z. 2308: hineingerutschter Text „### Dunkler Satz
   Angesehen: …“); Paket 10 Schritt 3 nennt `ErrorBoundary.tsx:133` als Stelle für „du“ — dort
   steht schon „Deine gespeicherten Daten“. *Muss dort stehen:* diese Zeilen gestrichen oder mit
   „gilt nicht, siehe Vorgabe“ gekennzeichnet; „die Vorgaben gehen vor“ im Tabellenkopf reicht für
   jemanden, der nur die Zeile liest, nicht. *Beleg:* die genannten Zeilen; `ErrorBoundary.tsx:132–133`.
10. **Offene Wahl in einer Vorgabe ist keine „eine baubare Aussage“.** *Stelle:* Vorgaben V-5 („Im
    Plan ansehen“: Ausnahme oder Muster), V-15 (vier Akten oder auf zwei begrenzen), D2-A3 (an der
    heutigen Stelle oder klebender Fuß — Schritt 2 sagt schon `flex: 1`), D3-1 (gestapelt bis
    1.199 px oder schmälere Felder), D4-C2 („heißt ‚Tag ansehen‘ oder entfällt“), D4-P2 („eine
    Fassung festlegen“), D2-P5 und D2-I4 (Form für 760–1.199 px fehlt), D2-A18 (b) („nur zusammen
    mit dem Kopf-Baustein“ — in welchem Paket?), D3-P12 (Reihenfolge beim Tabben), D1-B10 („im Bild
    zeigen“), D4-I2 (Form am Tablet). *Muss dort stehen:* je Punkt die eine Fassung — oder eine
    Liste „vor dem PR dem Auftraggeber im Bild vorzulegen“ (Regel 8), damit beim Bau niemand
    stillschweigend wählt.
11. **12.2 und Paket 8 decken nicht, was Stufe C umbaut.** *Stelle:* 12.2; Paket 8 Schritte 1
    und 7. *Steht dort:* „eine Seite wird erst umgebaut, wenn ihre zweite Durchsicht vorliegt“; die
    Attrappenliste nennt zehn Bildschirme. *Muss dort stehen:* Attrappe oder anderer Weg für jeden
    Bildschirm, den ein Paket umbaut und bisher niemand im Bild sah: Verbindungsband und „Neue
    Fassung“-Leiste (Paket 13), Supporteinblick mit Rolle in der Meta-Zeile (13), „Willkommen“,
    erstes Passwort, Wiederherstellungscodes (20), Fehlertafel (20), Papierkorb mit Inhalt,
    Projektleiter mit `rechnungenLesen`; und in 12.2 die fehlenden Einträge aus den Papieren:
    PDF-Ausgaben (Angebot, Schein, Stundennachweis), Mailversand bis „Gesendet“, Antragsart
    Zeitausgleich, Korrekturantrag als Blatt, Anhang/Foto, Überstunden-Ausleitung,
    Arbeitszeitgrenzen mit Fällen, „Im Dienst“, Sonderurlaub bestätigen, Zeitfelder/Fahrzeuge
    anlegen, „Storno aufheben“, Belegarchiv, „Belege per Mail“, offene Lieferantenartikel,
    Liegenschaft-Vorschläge, Stunden nach Person, „Mehr“-Liste, Push-Anmeldung, `/_muster`,
    Schwebe- und Druckzustände, Bewegung, dunkler Satz in Menüs und Rückfragen. *Beleg:* Papier 8
    §9, Papier 9 §8, Papier 10 §8, Papier 11 §6, Papier 12 §6.
12. **Kleine Berichtigungen.** (a) `CLAUDE.md`: „alles zum Ansehen auf `/_muster`“ — die neuen und
    geänderten Bausteine (Nummer, Verbinder, Suchbaustein, Zusatz „noch nicht gespeichert“, Fuß)
    stehen im Plan nirgends bei der Musterseite; als Schritt in die Pakete 9 und 11. (b) N-D4-2:
    Bericht 12 verlangt Kurzbezeichnung oder Nummer, „wenn derselbe Kundenname in der Zeile **oder**
    am Tag zweimal steht“; der Plan schreibt „am selben Tag in einer Zeile“ — enger. (c) Wächter
    `raster.spec.ts`: die Testdaten des Durchklicks brauchen beide Arbeitskarten der Rechnungen,
    sonst bleibt V-3 dort unsichtbar (Bericht 8, V-3). (d) D1-A17 (Paket 9) und D1-I3 (Paket 13)
    ändern beide `KopfTitel.tsx`; die Vorgabe sagt „am selben Baustein“ — dann auch im selben PR,
    oder die Reihenfolge nennen.

## 2. Prüfberichte 8–12

Vollständig für „teilweise“, „widerlegt“ und Warnungen; die übrigen als Stichprobe. „✔“ heißt: an
der genannten Stelle nachgeschlagen, Urteil und Inhalt stimmen.

### Bericht 8 (Vermessung): 21 / 3 / 9 — im Plan 21 / 3 / 9 ✔

| Punkt | im Plan (Stelle) | richtig? | Anmerkung |
|---|---|---|---|
| Messmethode (teilweise) | 2.1; Paket 8 Schritt 3 | ✔ | `label`, Zeilenziel, Abgeschnittenes genannt |
| V-3 (teilweise) | 5.1; Paket 9 Vorgabe und Wächter; Stellen in 14, 15, 17 | ✔ | Testdaten mit beiden Karten fehlen (Auflage 12 c) |
| V-4 (teilweise) | 8.3, E-R4 | ✔ wiedergegeben | bleibt gegen `CLAUDE.md` stehen — Auflage 8 |
| V-5 (teilweise) | 5.1; Paket 9 (Listenleiste), 14 („alle ausblenden“), 19 („Im Plan ansehen“); N-V-1/E-V5 | ✔ | „entweder … oder“ offen (Auflage 10) |
| V-14 (teilweise) | 8.3, E-V4; Paket 11 Schritt 1 | ✔ | — |
| V-15 (teilweise) | Paket 9 Schritt 4, Vorgabe | ✔ | „oder“ offen; berührt vier Akten vor Stufe C (Auflage 4) |
| V-B4 (teilweise) | Paket 9 Schritt 5: Auswahlfelder nicht gemeint | ✔ | — |
| V-B11 (teilweise) | 8.2 | ✔ | — |
| Abschnitt 8 Wächter (teilweise) | Paket 9 Schritt 9, elf Zeilen des Berichts + „Fuß im Bild“; lange Texte in Paket 11 | ✔ | alle elf Ausnahmen gefunden |
| Warnung V-1, V-2, V-6, V-10, V-11, V-12, V-16, V-B7, V-B10 | je Vorgabe in 9, 20, 14, 18, 8 | ✔ | — |
| Warnung V-7 („≠ D4-A3“) | 5.1; Paket 20 getrennt | ✔ | — |
| Warnung V-8 (drei Tabellen) | 19, Teile in 15 und 20 | ✔ | — |
| Warnung V-13 (nur zweite Variante; mit D4-A6) | Paket 9 Schritt 1 und Vorgabe | ✔ Variante; D4-A6 nicht im selben Schritt | D4-A6 ist zurückgestellt (E-F13); der Widerspruch der Fassung 1 ist damit weg, dieselbe Regel wird aber später noch einmal angefasst |
| E-V1, E-V2, E-V3 | 10.3 a), Vorgaben V-B1, V-B2, V-B3 | ✔ | E-V3: siehe Abschnitt 7 |
| V-B5, V-B8, V-B9 | 8.2 | ✔ | — |
| „Zum Plan“ (Kurztexte, Angaben, Punktregel 1 gegen 2) | 5.1, 7.2, 7.3 | ✔ | — |

### Bericht 9 (Monteur und Hülle): 59 / 9 / 20 / 18 — im Plan gleich ✔

| Punkt | im Plan (Stelle) | richtig? | Anmerkung |
|---|---|---|---|
| D1-A5 | 14, Vorgabe und „Bleibt gleich“ | ✔ | Papierkorb der Berufsschulzeile bleibt |
| D1-A13, A16, A21, B12 | 8.3 (E-R2, E-R5, E-R12, E-R6) | ✔ | — |
| D1-A17 | 9 Schritt 6 (Beobachter) | ✔ | Auflage 12 d |
| D1-A18 | 8 (Attrappe) | ✔ | — |
| D1-T4, T8, T16, T17, T22 | 14, 19, 13; Liste 6.4 | ✔ | alle fünf „bleibt“-Sätze in 6.4 |
| D1-P1, P4, P10 | 14, „nicht in der Form des Papiers“; 7.2 | ✔ | Folge für `/time`: Abschnitt 6 |
| D1-P3, P12, P13 | 14, 19 | ✔ | P13 nur im Kurztext, genügt |
| D1-P8 | 11, E-F1 | ✔ | deckt sich mit E86 (D12) und E98 |
| D1-P9 | 13 (Dachzeile bleibt) | ✔ | — |
| Warnung D1-A2 | 14 | ✔ Tests genannt | Tippzahl fehlt — Auflage 6 |
| Warnung D1-A19, I18, T24 (Rechtstexte nicht tiefer) | 13, 8.3, 6.4, E-W1 | ✔ | — |
| Warnung D1-A22 (`inputMode`) | 10 | ✔ | Zeile 2308 bereinigen (Auflage 9) |
| Warnung D1-B1 | 14, E-F33 | ✔ | — |
| Warnung D1-B2 (`.nr`) | 11, 7.3 Regel 6 | ✔ | — |
| Warnung D1-B3, B15, C1 (Fuß) | 9 Schritt 2, „Bleibt gleich“ | ✔ | Seitenschritte fehlen (Auflage 4) |
| Warnung D1-C3 (Notiz bleibt) | 14 | ✔ | „bis wann“ als neues Datenfeld benannt |
| Warnung D1-C5, C6 | 14 | ✔ | — |
| D1-C2, C7 | 8.4 (E-F8, E-F7) | ✔ | — |
| Ideen I1, I2, I4, I8, I13, I16, I17 | 8.4 / 8.3 / Vorgaben in 9, 14 | ✔ | — |

### Bericht 10 (Aufträge): 51 / 13 / 21 / 2 — im Plan gleich ✔

| Punkt | im Plan (Stelle) | richtig? | Anmerkung |
|---|---|---|---|
| D2-T7, D2-T15 (widerlegt) | 8.1; 6.4; Vorgabe D2-B11 | ✔ | in keinem Paket mehr |
| D2-A1 | 9, Selektor `a:not(.lot-knopf)` | ✔ | „bleibt gleich laut Papier“ nennt noch das Tablet (Auflage 9) |
| D2-A3 | 9 Schritt 2 (an der heutigen Stelle) | ✔ | — |
| D2-A6 | 9 (`dl.beleg-angaben`) | ✔ | — |
| D2-A9 | 8.3, E-N | ✔ wiedergegeben | (b) bleibt ungelöst — Auflage 8, Abschnitt 7 |
| D2-A10 | 18: nur die Überdeckung | ✔ | Auflagen 5, 8 |
| D2-A18 | 18 | teils | Teil (b) ohne Paket (Auflage 10) |
| D2-B7, B10, C12, P3 | 18 / 8.3 (E-R1) | ✔ | — |
| D2-B11 | 18 | ✔ | — |
| D2-C14, I2, I10 | 18 | ✔ | Summe in der Datenbank, Zelle fehlt ohne Recht |
| D2-T1 | 8.3 (E-W1) | ✔ | — |
| D2-T6, T11, T14, T18 | 18; 6.4 | ✔ | — |
| D2-T20 | 8.2 | ✔ | — |
| D2-P1, P5 | 18 | ✔ | 760–1.199 px offen (Auflage 10) |
| D2-P2 | 8.3 (E-R3) | ✔ | — |
| Warnung D2-A8, A12 | 18 | **nein** | Vorschläge des Papiers (Knöpfe ins ⋯) nicht ausgeschlossen — Auflage 5 |
| Warnung D2-B3 | 9, E-F11 | ✔ | Fenster stehen in keinem Seitenpaket (Auflage 4) |
| Warnung D2-C1 | 18, E-F24 | ✔ | — |
| Warnung D2-C5 | 18 | teils | Bedingung „Privatkunden behalten“ fehlt — Auflage 5 |
| Warnung D2-C13 | K-8, wartet | ✔ | — |
| Warnung D2-B9, I3, I9, I12, T13 | 18 / 8.3 | ✔ | — |

### Bericht 11 (Geld und Material): 59 / 5 / 29 / 1 / 1 — im Plan gleich ✔

| Punkt | im Plan (Stelle) | richtig? | Anmerkung |
|---|---|---|---|
| D3-T4 (widerlegt) | 8.1; 6.1 Muster 4; 6.3 Regel 4; 6.4; Paket 15 | ✔ | — |
| Aufgabe 8 (nicht prüfbar) | 5.4; zweite Durchsicht | ✔ | — |
| D3-1 | 15 (gestapelt, Summen als Block) | ✔ | Tablet „oder“ (Auflage 10) |
| D3-6 | 3: „22104,60“, drei Prüfungen | ✔ | — |
| D3-7 | 15, örtlich, fünf Verwender geschont | ✔ | — |
| D3-11 | 9 | ✔ | Auflage 4 |
| D3-17 | 10 Schritt 5 | ✔ | — |
| D3-C1, C2, C9 | 8.4 (E-R14, E-R17) | ✔ | sieben Punkte in „Bleibt gleich“ von 15 |
| D3-C3 | 15: nur „Datei per Ablegen“; E-R18 | ✔ | — |
| D3-C4 | 8.3 (E-R15) | ✔ | — |
| D3-C6, P8 | 25, „Geliefert …“ bleibt | ✔ | — |
| D3-C7 | 16, nach 1 und 6 | ✔ | — |
| D3-C11 | 15 Vorgabe | ✔ | falscher Satz daneben (Auflage 9) |
| D3-T2, T5, T7, T8, T10, T11, T14, T18, T21 | 15, 16, 14, 20; 6.4 | ✔ | Kundenname bleibt in der Kontoauszug-Zeile |
| D3-T3 | 8.2 | ✔ | — |
| D3-P1, P2 | 8.3 (E-R9); 7.3 Regel 5 | ✔ | — |
| D3-P11 | 16 (am Handy keine Tabelle) | ✔ | — |
| D3-P12 | 20 | teils | Tatsachen genannt, keine Fassung (Auflage 10) |
| Warnung D3-2, D3-3, D3-4, D3-9, D3-10, D3-13 | 15, 9, 16 | ✔ | — |
| Warnung D3-T1 (Dateiname) | 11 Schritt 2 und eigene Prüfung | ✔ | — |
| Warnung D3-C10 gegen C13 | E-F32 | ✔ | — |
| „dreimal angefasst“ (Kontoauszug-Zeile, Rechnung stellen, Einkaufszeile) | 9.3: je ein Paket | ✔ | — |

### Bericht 12 (Planung, Team, Einstellungen): 58 / 8 / 19 / 2 — im Plan gleich ✔

| Punkt | im Plan (Stelle) | richtig? | Anmerkung |
|---|---|---|---|
| D4-C11, D4-T9 (widerlegt) | 8.1 | ✔ | — |
| D4-A4 | 20, 19; „Sie läuft von selbst.“ bleibt | ✔ | — |
| D4-A5, A9 | 8.2 | ✔ | — |
| D4-A6 | 8.4 (E-F13) | ✔ | Abschnitt 7 |
| D4-A7 | 19/20 örtlich | ✔ | — |
| D4-A8, A12, A14 | 17, 20 | ✔ | — |
| D4-A11 | 19; „Notzugang“ bleibt | ✔ | — |
| D4-A13 | 19 (nur Radius), 14 (Zuschlag) | ✔ | — |
| D4-B1 | 20, E-E in der Fassung des Berichts | ✔ | — |
| D4-B10 | 10 | ✔ | — |
| D4-I1, T13, C12, B11 | 8.3 (E-R8) | ✔ | — |
| D4-I5 | 8.3 (E-R16) | ✔ | — |
| D4-T1 | 11; 6.3 Regel 1 | teils | E25 und E86 genannt, E31 nicht — Auflage 1 |
| D4-T2 | 13 | ✔ | — |
| D4-T15 | 20; 6.4 | ✔ | — |
| D4-P2 | 13 | ✔ | Fassung offen (Auflage 10) |
| Warnung D4-A1 | 17 | ✔ | — |
| Warnung D4-A10 / E-M | 17; 10.2 | ✔ einer der zwei Wege | Auflage 7 |
| Warnung D4-B8 | 9 | teils | Seitenschritt fehlt (Auflage 4), Tippzahl (Auflage 6) |
| Warnung D4-B15 / E-N | 8.3 | wiedergegeben | geht über beide Berichte hinaus — Auflage 8 |
| Warnung D4-C2 | 17 | ✔ | — |
| Nebenbefunde | N-D4-1 (8.4), N-D4-2 (17), N-D4-3 (11) | ✔ | N-D4-2 enger als der Bericht (Auflage 12 b) |

**Stichprobe weiterer bestätigter Befunde (46, Paket und — wo vorhanden — Vorgabe an der genannten
Stelle ✔):** V-9, V-B6;
D1-A8, A11, A12, B7, B10, B11, B13, C4, C8, T10, T13, T15, P11, P14; D2-A2, A4, A14, A15, A17, A19,
A20, B2, B5, B8, C9, I7, T2, T3, T10, T16, P7, P9; D3-8, 12, 14, 15, B6, B14, B17, T13, P4; D4-B7,
B9, T10.

## 3. Die 32 Änderungen aus Bericht 0 §11 (Teil Oberfläche)

| Nr. | Ergebnis |
|---|---|
| 1, 2, 3 | ✔ Regeln 3, 5, 11; Paket 8 als erstes der Stufe B. Regel 11 nicht überall angewandt (Auflage 6) |
| 6 | **zum Teil.** Für die von Bericht 0 genannten Listen stimmt es: Zeitliste nur in 14, Kontoauszug-Zeile nur in 15, „Rechnung stellen“ nur in 15, Einkaufsliste nur in 25, Planungstafel nur in 17, Angebotsakte in 18. Nicht für Paket 9: Rechnungsfenster (7 herausgelöst, 9 Aktionsreihe und Kennwerte, 15), Lager-Artikelfenster (9, 16), Kopf der vier Akten (9, 18/19), Arbeitszeile der Anforderungen (9, 16), Zeitblatt-Fuß (9, 14 mit D1-A2). `PageHeader`/`KopfTitel`: 9 (D1-A17), 11 (Untertitel), 13 (D1-I3). Auflage 4 |
| 7 | ✔ 8.2 |
| 8 | abweichend: D2-A9 (b) wird nicht gebaut, E-N lässt E76 auch im Fenster — im Protokoll als „nicht übernommen“ benannt; Auflage 8 |
| 9, 10 | ✔ Paket 9 Schritt 2 und Wächter-Tabelle; D2-A16 in 8.2 |
| 11 | ✔ Regel 6; Vorgabe D2-I10 |
| 12 | nicht übernommen, mit tragendem Grund (Bericht 12, Abschnitt 3: Leiste je Seite stünde bei 1440 px 1.650 px unter dem Feld) ✔ |
| 13 | ✔ E-D, eigene Prüfung |
| 14, 15, 16, 17, 18 | ✔ Pakete 13/14, 17, 9 (E-F11), 6.5, 20 |
| 24 | ✔ E-F1 bis E-F10 |
| 25 | ✔ jedes Kürzel einmal (Stichprobe über alle fünf Tabellen; Summen 27 + 106 + 86 + 87 + 87 = 393) |
| 28 | entfällt begründet (Spalte „Gegenprüfung“) ✔ |
| 29 | ✔ Zählweise, Ausnahmen, `Angaben`, gerahmt/ungerahmt — die Zählweise trägt aber nicht (Auflage 2) |
| 30 | ✔ benannte Liste statt „sieben Fenster“ |
| 31 | ✔ dem Grunde nach; Liste unvollständig (Auflage 11) |

## 4. Zurückgedrehte Entscheidungen und Regelverstöße

- **Ausdrücklich als Änderung geführt:** E-T ändert E86 ab dem Tablet — steht in 10.2, 6.3, Paket 11
  Schritt 1, getragen von Bericht 0 (6.2 Nr. 8) ✔. E-M ändert die Ausnahme des Monatsrasters unter
  1.200 px — steht in der Vorgabe D4-A10 ✔.
- **Berührt, aber nicht genannt:** E31 durch E-T (Auflage 1).
- **Bleibt gegen eine Regel stehen, als Entscheidung geführt, aber ohne den Satz dazu:** zweites ⋯
  der Angebotsakte (`CLAUDE.md`), zwei gefüllte Aktionen im Tagesfenster (U4) — Auflage 8.
- **Ohne Befund:** Pillen, Verläufe, Glas, Farbflächen für Warnung, Karte in Karte, Schatten, mehr
  als eine Hauptaktion im Seitenkopf (D3-C13/E-F32 belegt genau eine; D3-C3 bleibt im ⋯). Radien:
  V-B7 („kleine Radien als Token“) braucht in `style.md` eine Rolle neben den vier aus `CLAUDE.md`
  — im Paket 11 Schritt 1 ergänzen. E74, E76, E82, E91, E95, E96, E98, E99, U1, U4, U9, G22, G29:
  kein Paket verlangt etwas dagegen; wo ein Papier es tat, steht der Punkt in 8.3.

## 5. „Nichts verschlimmbessern“ je Paket; Werkzeuge

**Werkzeuge (Abschnitt 2.1) am Code:** Vorher-Datei 1.941 Einträge ✔; Schlüssel Art + Text + Ziel
ohne Datei ✔ (`funktionsinventar.test.ts`, `kern`); 496 Einträge teilen ihren Schlüssel ✔
(nachgerechnet), „Abbrechen“ 38, „Speichern“ 16 ✔; `v10-entfernt.json` 107 ✔; `fotos.mjs` 35
Routen, nur Chromium, `scrollWidth` ✔ (nimmt 375/390/834/1440 auf); `messen.mjs` vier Breiten,
README drei ✔; `schriftskala.spec.ts` 46 Seiten, `EIGEN` mit `h1`–`h4` ✔; `raster.spec.ts` 20
Seiten ohne `/worksheet` und `/assignments/tag` ✔; `flucht.spec.ts` überspringt Karten ohne
`.titel-karte`, nimmt `table` aus ✔; `MONTEUR_WEGE` für alle Handy- und Tablet-Projekte ✔.
`raster.spec.ts` und `flucht.spec.ts` liegen unter `tests/durchklick/`, nicht `tests/links/`.

| Paket | „bleibt gleich“ mit Prüfdateien | Prüfung mit Gegenprobe | Nimmt etwas weg oder legt es weiter weg? |
|---|---|---|---|
| 8 | ✔ („nur `tools/`, `tests/`, `docs/`“) | ✔ Inventar, `chat-suche`/`ue-person` | nein |
| 9 | ✔ 14 Dateien/Regeln genannt | ✔ je Wächter; der ⋯-Wächter hat keine rote Fundstelle (die eine ist Ausnahme) | D4-B8 „Deaktivieren ins ⋯“ unbenannt (Auflage 6) |
| 10 | ✔ Belegreferenz, „Sie“-Prüfung | ✔ | nein; Umbenennungen über `v10-entfernt.json` |
| 11 | ✔ | Punkt-Wächter: Gegenprobe stimmt nicht (Auflage 2) | Kopfhöhe ab Tablet (Auflage 1) |
| 12 | ✔ | „im Papier nicht eigens benannt — vor dem Bau festzulegen“ — ehrlich, aber offen | nein |
| 13 | ✔ | ✔ „Abmelden“ je Rolle, Supporteinblick | nein |
| 14 | ✔ | ✔ fünf bewusst nachgezogene Prüfungen genannt | D1-A2 (+1 Tipp, U4) unbenannt |
| 15 | ✔ sehr genau (tfoot, zwölf Sperrgründe, „Vorschau“) | ✔ | nein |
| 16 | knapp, aber benannt | ✔ 46-Zeichen-Name | nein |
| 17 | ✔ (`einsatzbalken.test.ts`, Vorlesetext) | ✔ | Monat am Tablet nicht mehr auf einen Blick (Auflage 7) |
| 18 | ✔ lang | „höchstens zwei Tipps“ zu weich (Auflage 5) | D2-A8/A12, D2-C5 (Auflage 5) |
| 19 | ✔ | ✔ | nein |
| 20 | ✔ (jede Adresse, Rechte je Blatt) | ✔ | D4-I2 am Handy: Wechsel zwischen Einstellungsseiten über die Übersicht — Tippzahl nennen |

## 6. Text- und Punktregel: eigene Messung

**Punkte je Textzeile heute** (15 Seiten, je 375 / 834 / 1440 px): zwei oder mehr Punkte in einer
sichtbaren Textzeile haben bei 375 px 7 von 126 punkttragenden Textblöcken (`/time` 1 von 59,
Startseite Mitarbeiter 1, `/wartungen` 1, Einsatzplan 1, Meine Baustellen 1, `/quotes` 2). Bei
834 px rutscht „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“ durch den Umbruch auf je einen
Punkt je Zeile — die Zählweise „je sichtbarer Textzeile“ hängt an Breite und Namenslänge.

**Drei Ersatzformen nach Regel 5 (7.3), in der echten Seite nachgebaut:**

| Seite, Rolle | Form | 375 px | 834 px | Ergebnis |
|---|---|---|---|---|
| `/time`, Mitarbeiter (D1-P1) | Name allein in Zeile 1 (bricht um), darunter Stempel, Tag, Zeit in Mono, Wert rechts | 44 von 53 Zeilen mehr Textzeilen (2 → 3 bis 5), 41 höher (103 → 127 px). Mit gekürztem Namen: 44 gleich, 9 mehr | andere Zeilenform am Tablet (Datum · Name als Titel, Zeit · Kommentar darunter); die Regel nennt dafür keine Form | wird nach Regel 5 **nicht** gebaut; `/time` behält seine 60 Punkte |
| `/`, Geschäftsführung (D4-P2) | Titel allein, darunter Zustand und höchstens zwei Angaben, Wert rechts | 8 von 9 Zeilen gleich hoch, Punkte 13 → 3; „1 Baustelle mit Stunden nicht verrechnet“ 4 → 5 Zeilen (115 → 138 px) | dieselbe Zeile 2 → 3 Zeilen (75 → 96 px), die übrigen gleich | trägt nur, wenn die eine Zeile eine eigene Fassung bekommt — im Plan „festlegen“ (Auflagen 3, 10) |
| `/wartungen`, Administrator (D2-P1, Form des Prüfers) | Name, Zustand darunter, zwei Angaben | 7 → 5 Textzeilen, 244 → 198 px | 7 → 5, 192 → 146 px | trägt |

Die Regel erzeugt also nicht mehr Zeilen — sie verbietet es sich selbst. Die Folge steht im Plan
aber nicht: auf der Seite mit den meisten Punkten ändert sich nichts.

**Ausnahmeliste (7.3 „Der Punkt bleibt“):** Summenzeile E98 („… € offen · … € Mahnspesen“, ein
Punkt) ✔, Anschrift und Kontaktzeile ✔, Auswahlfelder ✔, Zählzeile der Schublade E96 ✔, zwei kurze
gleichrangige Angaben ✔. „Rolle · Betrieb“ in der Navigation gibt es weder im Plan noch im Bild:
außerhalb von `main` steht bei 1440 px nur „Datenschutz · Impressum“ (ein Punkt, von Regel 1
gedeckt), bei 834 px nichts; im Profil-Blatt am Handy ebenso nur „Datenschutz · Impressum“. Es
fehlt die Legendenzeile des Monats („Punkt im Kopf: Termine an diesem Tag · Tag antippen zeigt die
Vorschau“ — kein Paar kurzer Angaben) und die Belegzeile aus E99, die bleibt.

**Textregel 6.4 „bleibt“ gegen die Berichte 9–12:** alle in den Berichten genannten Sätze stehen
darin (D1-T8, T16, T17, T22, T23, T24; D2-T6, T7, T12, T14, T15, T17, T18; D3-T3, T4, T5, T8, T10,
T11, T14, T18; D4-T3, T4, T6, T15, T19). Es fehlen zwei, die die Berichte ebenfalls schützen: der
Satz der Rüstliste mit seinen zwei Aussagen (D1-I16/T3 — steht nur als Vorgabe in Paket 14) und
„Zwischenstand“ an der Zahl der Nachkalkulation (D3-T19).

## 7. Entscheidungen: Trennung, Eindeutigkeit, was der Auftraggeber sich ansehen sollte

Teil 1, 2 und 3 sind sauber getrennt; jede Zeile nennt ihre Quelle. Eindeutig und vom Bericht
getragen sind E-D, E-E, E-V1, E-V2, E-V4, E-V5, E-F1 (deckt sich zusätzlich mit E86 D12 und E98),
E-F2, E-F3, E-F9, E-F10, E-F11, E-F23, E-F24, E-F25, E-F29, E-F32, E-F33, E-R1 bis E-R3, E-R5 bis
E-R18. **E-V3** trägt: E97 legt 12 px für den „Nummernstempel“ fest und 13 px für die Meta-Zeile —
ein ungerahmter Baustein in Zeilengröße widerspricht dem nicht (nicht selbst im Bild nachgestellt).

**Vor dem Bau noch einmal ansehen — im Bild:**

1. **E-M (Monat am Tablet).** Zwischen 760 und 1.199 px sind danach 12 bis 20 von 30 Tagen im
   Bild; der andere Weg des Papiers (Kalenderform des Handys bis 1.199 px) behält den ganzen Monat,
   verliert aber Personen × Tage. Ab 1.200 px bleiben Spalten von 23 bis 31 px.
2. **E-T, Regel 1 (Untertitel ab Tablet in die Hilfe).** Ändert E86 und berührt E31: entweder
   beginnen die Seiten ungleich hoch, oder rund 30 Seitenköpfe tragen eine leere dritte Zeile.
3. **E-P (Punktregel).** Sie verhindert Ketten, nimmt aber die vielen einzelnen Punkte nicht weg;
   auf `/time` bleibt alles, wie es ist. Wenn „weniger Punkte“ gemeint war, braucht es Auflage 2.
4. **E-N.** Die erste Entscheidung (Kreis im Fenster gerahmt) war von keinem Bericht beanstandet;
   die neue lässt zwei gefüllte Aktionen im Tagesfenster und zwei gleiche „+“ in der Baustellenakte.
5. **E-R4.** Das zweite ⋯ der Angebotsakte bleibt gegen `CLAUDE.md` stehen.
6. **E-F13 und E-F30 (zurückgestellt).** Beides sind bestätigte Widersprüche im Regelwerk, keine
   Ideen: `style.md` nennt für den Fokus `--focus-ring`, E95 Petrol; U1 nennt die Speicherleiste
   „klebend“, ab 1.200 px ist sie es nicht (Firmendaten: 1.650 px unter dem Feld). „Der Prüfer nennt
   keine sichere Lösung“ ist nach Grundsatz 6 kein Grund für eine Grenze.
7. **D4-I2 (Einstellungen gegliedert).** Der größte Umbau der Navigation in Stufe C; für das Tablet
   ist keine Form genannt.
8. **E-F6, E-F19 bis E-F21** (Teil Funktion, hier nur am Rand): E-F6 beantwortet die Hälfte der im
   Stand gestellten Frage; die Wortlaute der drei Hinweise stehen in keinem Bericht — vorlegen.

## 8. Abdeckung

12.2 nennt die Gruppen richtig und ordnet die zweite Durchsicht einem Schritt zu (Paket 8 Schritt 7;
Voraussetzung im Vorspann der Stufe C) ✔. Unvollständig gegen die Abschnitte „Nicht angesehen“ der
Papiere — die fehlenden Einträge stehen in Auflage 11. Die Zusage „erst umbauen, wenn die zweite
Durchsicht vorliegt“ ist für Verbindungsband, „Neue Fassung“-Leiste, Supporteinblick, „Willkommen“
und Fehlertafel nicht einlösbar, solange Paket 8 dafür keine Attrappe oder keinen anderen Weg nennt.

## 9. Erfundenes oder Falsches; Zahlen

**Stichprobe (rund 120 Angaben der Pakete 8 bis 20):** 30 Datei- und Zeilenangaben geöffnet, 30
Bezeichner und Klassen gesucht, rund 60 Dateinamen der Schritte aufgelöst. Alles gibt es; Zeilen
stimmen (u. a. `index.css:401–405`, `Aktionsleiste.tsx:76`, `TimeView.tsx:1161`, `Field.tsx:205`,
`lot.css:207/328/592`, `WachsendesTextfeld.tsx:59`, `App.tsx:657`, `blattKanten.test.ts:78`,
`schalterRegel.test.ts:89`, `KnopfLink.test.tsx:27`, `einsatzbalken.test.ts:115–118`,
`AntragFenster.tsx:101`, `KatalogImport.tsx:439`). `Listenleiste`, `AktenAngaben`, `NeuKnopf` sind
Bausteine in `LotBausteine.tsx`, `AktenBereiche.tsx`, `Symbolknoepfe.tsx`. Falsch ist eine Angabe:
`ErrorBoundary.tsx:133` als Stelle mit „Sie“ (Auflage 9). `InvoicesView.test.tsx` hat nach meiner
Zählung 365 `it(`-Zeilen, der Plan nennt 371 Fälle (aus Bericht 11) — unerheblich.

**Zahlen:** 1.1 Zeilen 8 bis 12 und Summen (281 / 104 / 106 / 5 / 1 / 18 = 515; 500 Kürzel + 6 + 9)
nachgerechnet ✔. 1.3: 73 / 62 / 45 / 56 / 88 / 51 ✔; „4 widerlegt, 25 teilweise“ bei den Texten ✔
(5 + 6 + 10 + 4). 8.1 bis 8.4: 5 / 13 / 39 / 16 ✔ (Zeilen gezählt). 5.1 und 7.1: Werte wie in
Bericht 8 ✔; `/time` 60 sichtbare Punkte bei 375 px selbst gezählt ✔.

## 10. Nicht geprüft

- Abschnitt 4, Stufen A, D, E und die Berichte 1 bis 7 (anderer Prüfer); aus Stufe D nur die
  Oberflächenpunkte in den Paketen 21, 23, 25 an ihrer Vorgabe.
- Kein Testlauf, kein Durchklick, kein WebKit, kein Gerät, kein dunkler Satz.
- Die Vorgaben der bestätigten Befunde nur in der Stichprobe (46) Wort für Wort; die übrigen beim
  Lesen der Pakete gegen den Bericht gehalten, nicht einzeln protokolliert.
- Die Nachbauten in Abschnitt 6 sind Eingriffe im Browser an den Beispieldaten, kein Umbau: sie
  zeigen Zeilenzahl und Höhe, nicht Wischen, Vorlesetext oder Tastflächen. E-V3 und die Tippzahlen
  nicht selbst nachgestellt.
- Die Messwerte der Berichte (außer den hier genannten) habe ich nicht wiederholt; die Zählungen der
  Vermessung über 863 Zustände nicht.
- Aufwände der Pakete.
