# Gegenprüfung: der Plan als Ganzes — 23.11.2026

Geprüft: `docs/durchsicht-2026-11-23/plan.md` (1.062 Zeilen, Stand ad1e9fb) gegen die zwölf
Arbeitspapiere in `analyse/`, gegen `CLAUDE.md`, `docs/ui-umbau/entscheidungen.md` (E76, E92–E99),
`docs/stand-2026-10-03.md` §112–§118, `docs/design/v10/style.md` und gegen den Code der Werkzeuge,
auf die sich der Plan beruft. Nur gelesen; kein Test, kein Browser, keine Datenbank. Die Zuordnung
ist maschinell nachgezählt (Skripte `ids.py`, `plan.py`, `meta.py` unter
`…/scratchpad/audit/pruef-plan/`, nicht im Repo): 500 Kürzel aus den Papieren, jedes gegen jede
Zeile des Plans, Bereiche („D1-T1 bis T25“) aufgelöst. Die einzelnen Befunde habe ich nicht
nachgeprüft (das tun die zwölf anderen Prüfer); nachgelesen im Code sind nur die Stellen, die ich
unten nenne.

## 1. Ergebnis in einem Absatz

**Der Plan taugt als Grundlage für Stufe A (Pakete 1 bis 4) und als Gliederung für alles Weitere —
aber nicht als freigabefähiger „genauer Implementierungsplan“ für die Stufen B bis E.** Die Zahlen
stimmen fast durchweg (107 / 73 / 62 / 45 / 56 / 88 / 51 / 45 nachgezählt und bestätigt), Art,
Schwere und Aufwand aller 107 Code-Befunde sind treu übernommen, und kein Kürzel im Plan ist
erfunden. Dagegen stehen fünf Dinge, die vor einem Startsignal berichtigt sein müssen:
(1) **Die Absicherung „nichts verschlimmbessern“ ruht auf Werkzeugen, die weniger leisten, als
Abschnitt 2 sagt** — das Funktionsinventar prüft gegen den Stand *vor V10* und erkennt weder
Bedienstellen, die seit E93 dazukamen, noch den Wegfall eines von mehreren gleichnamigen Knöpfen;
`fotos.mjs` kennt 35 von 65 Routen, keine Fenster, keinen Vergleich; die Messskripte der Vermessung
liegen nur im Scratchpad. (2) **Sieben Vorschläge drehen eine Entscheidung zurück oder widersprechen
dem Regelwerk**, ohne dass der Plan es sagt (E76, E96, E99, E95-Wortlaut, `style.md` zum Fuß am
Handy, 36-px-Ausnahme, Anrede auf der Kundenseite). (3) **Die Reihenfolge hat vier
Voraussetzungen, die später kommen** (Paket 10 braucht A-10 aus 18; 14 braucht M-6 aus 21; 5 bis 8
brauchen die Aufnahmen aus 9; das Leistungsbudget L-4 und der Bau vor dem Merge L-9 liegen in E,
werden aber ab Paket 2 gebraucht). (4) **Rund 140 Punkte der Papiere stehen in keinem Paket**: 26
Kürzel, die 45 Verdachtsfälle ohne Zuordnung, mindestens 14 Grenzen, die die Papiere für nicht
begründet halten, und alle 58 Ideen „Zusammenspiel“ der Papiere 1 bis 7 — der Auftraggeber hat
nach genau diesen Ideen gefragt. (5) **Die Pakete 15 und 18 bis 25 nennen weder Prüfung mit
Gegenprobe noch „bleibt gleich“**; acht Pakete (5, 6, 10, 11, 12, 13, 15, 16) kann ein Entwickler
ohne Rückfrage nicht beginnen. Bedingungen für die Freigabe: die 32 Änderungen in Abschnitt 11.
Stufe A kann beginnen, sobald die Nummern 4, 5, 22, 26 und 27 eingearbeitet sind; Stufe B erst
nach 1 bis 3 und 6 bis 21.

## 2. Zuordnung: fehlende, doppelte, falsche Kürzel

Gezählt: 500 Kürzel in den Papieren (107 Code, 16 + 11 Vermessung, 366 Oberfläche). Im Plan
genannt: 485. In einem Paket (Punkte-Zeile oder Pakettext): 474. **Kein Kürzel im Plan, das es im
Papier nicht gibt (0).**

### 2.1 Im Plan gar nicht genannt (15)

| Kürzel | Inhalt (Papier) | Vorschlag des Papiers | Was fehlt |
|---|---|---|---|
| D1-I9 | laufender Arbeitstag im dunklen Satz ohne Kontur | klein | Paket oder begründete Ablehnung |
| D1-I11 | Ziehen zum Aktualisieren nur als installierte App, fehlt in Blättern mit Liste | klein | wie oben |
| D1-I17 | Kennzahl „Resturlaub“ als Band über die ganze Breite | klein | wie oben |
| D2-C5 | Hausverwaltung, anderes Haus: Baustellenadresse mit der Rechnungsanschrift vorbelegt | Vorschläge statt Vorbelegung | fachlicher Befund, kein Paket |
| D2-C7 | Fokus nach dem Öffnen eines Fensters, „Schließen“ zuerst in der Tab-Folge | Fokus ins erste Feld | D2-I12 steht in Paket 13, der Befund selbst nicht |
| D2-C8 | Fenster übereinander: „nichts ändern“ | — | als „ohne Handlung“ vermerken |
| D2-C14 | Papierkorb: kein Verweis, Meldung ohne Sprung | „Rückgängig“/„Zum Papierkorb“ | Paket 14 (nächster Schritt) |
| D4-B9 | „Zurück“ in zwei Formen (Dachzeile gegen gerahmten Knopf, Plattform, 5 Stellen) | klein | Paket 5 oder 15 |
| D4-B16 | mehrere gefüllte Knöpfe auf `/vacations` | mit D4-C5 | Verstoß gegen „eine Hauptaktion“ — kein Paket |
| D4-C4 | Monat abschließen: Kennzahl führt nirgends hin, Schritt nur im ⋯ | Hinweiszeile, Kennzahl öffnet Rückfrage | gehört zu Paket 17 (a) Z-7 |
| D4-C5 | Urlaubsantrag entscheiden: Wartendes steht 1.150 px unter dem eigenen Formular | Reihenfolge | kein Paket |
| D4-C6 | Briefkopf ohne Vorschau | D4-I4 | D4-I4 steht in Paket 16, der Befund nicht |
| D4-C10 | Mitarbeiterübersicht am Handy: erste Zeile bei y 772 von 844 | Steuerungen in eine Zeile | kein Paket |
| D4-I6 | Person-Fenster: 15 Knöpfe „Zeit erfassen“ | Zeilen mit Pfeil | kein Paket |
| D4-I10 | Start am Schreibtisch: rechte Spalte 2.400 px lang | — | kein Paket |

### 2.2 Im Plan genannt, aber in keinem Paket (11)

| Kürzel | Wo es steht | Befund |
|---|---|---|
| V-4 | Tabelle 4.1, Spalte „13“ | fehlt in der Punkte-Zeile von Paket 13 (inhaltlich über A-17 / D2-A10 gedeckt) |
| V-7 | Tabelle 4.1, Spalte „15“, „= D4-A3“ | **nicht dasselbe:** V-7 ist die Fehlertafel der `ErrorBoundary` (`ErrorBoundary.tsx:129–148`), D4-A3 die Tafel „Kein Zugriff“ (`guards.tsx:24–31`). Paket 15 nennt die Fehlertafel nicht |
| V-16 | Tabelle 4.1, Spalte „9“ | Paket 9 nennt die fünf Falschmeldungen und `HARMLOS` nicht |
| V-B8 | Satz Zeile 333–337 („Paket 5 bzw. 12“) | in keiner Punkte-Zeile — und siehe 6.2 Nr. 2: der Punkt ist durch E96 entschieden |
| V-B11 | wie oben | in keiner Punkte-Zeile |
| D1-A20, D1-A21 | Tabelle 4.2, „10 (am Gerät prüfen)“ | fehlen in Paket 10 (dort „D1-A4 bis A14“) |
| D4-A5 | nur über die Überschrift „D4-A1 bis A14“ | Blatt-Titel in Serifenschrift — kein Paket |
| D4-A8 | wie oben | Termin-Fenster: „Bis“ steht allein — kein Paket |
| D4-A12 | wie oben | Zeilenabstand springt im Absatz mit „Abmelden“ — kein Paket |
| D4-A13 | wie oben | unschöne Umbrüche — kein Paket |

Der Satz in 4.2 „die übrigen sind dem Paket in Abschnitt 7 zugeordnet“ stimmt für diese vier
D4-A-Befunde also nicht.

### 2.3 Nur im Fließtext eines Pakets, nicht in der Punkte-Zeile (13)

V-B1, V-B2, V-B3 (Paket 6, Entscheidung offen), D1-I5 (Paket 10), D2-I10 (Paket 13); D1-I6, I7,
I8, I12, I13, D2-I6, I8, D4-I7 (nur „Später“).

### 2.4 Doppelt oder widersprüchlich zugeordnet (9, die stören)

| Kürzel | Zuordnung | Was daran falsch ist |
|---|---|---|
| D1-I1, D1-I10 | Punkte-Zeile Paket 10 **und** Liste „Später“ | ein Punkt kann nicht zugleich gebaut und zurückgestellt sein |
| P-11 | Tabelle 3.3: 19; Punkte: 10 **und** 19 | wer baut es? |
| M-6 | Tabelle 3.5: 21; Punkte: 14 („Anzeige“) und 21 | 14 liegt vor 21, der Schnitt zwischen „Anzeige“ und Funktion ist nicht beschrieben |
| D3-B20 | Tabelle 4.3: „7/13“; Punkte: 11 | drei verschiedene Angaben |
| D2-C12 | Tabelle 4.3: „7/13“; Punkte: nur 13 | Paket 7 nennt es nicht |
| D2-A10, D2-C2 | Tabelle: „13/14“; Punkte: nur 13 | Paket 14 nennt sie nicht |
| D3-4 | Tabelle: 5; Punkte: 5 und 11 | Fuß des Rechnungsfensters zweimal |
| D2-A5, D2-A11, D1-C1, D1-C9 | je zwei Punkte-Zeilen (5/13, 6/13, 5/10, 6/10) | ohne Angabe, welcher Teil wohin gehört |

Bewusste Doppelnennungen ohne Schaden (T-Funde in 8 und im Seitenpaket, L-12 in 11/25, D3-C in
11/14/16) sind nicht mitgezählt, brauchen aber je einen Halbsatz „Teil … hier, Teil … dort“.

### 2.5 Was die Papiere führen und der Plan keinem Paket zuordnet (ohne Kürzel)

| Gruppe | Anzahl | Stand im Plan |
|---|---|---|
| Verdachtsfälle (Papiere 1–7, je §3) | 45 (8 + 5 + 5 + 6 + 6 + 8 + 7) | Regel 1: „werden geklärt, wenn ihr Paket ansteht“ — **es gibt keine Zuordnung Verdacht → Paket**. Darunter Gewichtiges: Papier 6 V-4 (Realtime liefert bei gelöschten Zeilen den Primärschlüssel womöglich an fremde Betriebe), Papier 4 V-4 (`rechnung_ersetzen` als `security definer`), Papier 7 V-1 (zwei Abgleiche entfernen eine neue Zeile; wird mit L-7 häufiger), Papier 3 V-4 (Kopieren legt Einsatz an abgeschlossener Baustelle an) |
| Grenzen, deren Grund die Papiere für nicht oder nur teilweise gültig halten, ohne eigenes Kürzel (je §4) | mindestens 14 | 3.8 nennt neun und sagt „oben als Befund geführt“. Nicht geführt und in keinem Paket: Liegenschaftsakte höchstens 100 (steht in 3.8, aber in keinem Paket); Vorschau beim Kürzen in Kalendertagen („bauen, klein“); Rolle Administrator führt nie ein Zeitkonto („Schalter je Person, klein“); Monatsabschluss hält Eintritt/Austritt nicht fest; 62 Tage je Speichern; Zwischenspeicher der Woche ohne Abwesenheiten („mit P-4 erledigen“ — Paket 19 nennt es nicht); die drei Abonnements ohne `abonnieren` („mit L-7“ — Paket 19 nennt sie nicht); Verbrauch am Schein nur einmal; Inventur ohne Einkaufspreis; keine Reservierung an weiteren Lagern; „zuletzt angefordert“ nur aus 100; QR-Code („einfacher“ ist kein Grund); abweichender Rechnungsempfänger / Sammelrechnung „kommt mit M13“ (Papiere 2 und 4: „entscheiden lassen“ — fehlt in Abschnitt 8); Begründungen von `KATALOG_GRENZE`, `KUNDEN_GRENZE`, Kundenimport 5.000 |
| Ideen „Zusammenspiel“ der Papiere 1–7 (je §5) | 58 (14 + 7 + 9 + 9 + 7 + 7 + 5) | **im Plan nicht erwähnt**, auch nicht unter „Später“. Die 56 Ideen in 1.1 stammen nur aus den Papieren 9–12 |
| Offene Punkte aus dem Stand | 1 | Stand §117/§118: „Benutzerakte: leerer Eintritt wird beim Speichern ‚heute‘ — **Offen, Entscheidung nötig**“ — in keinem Papier, nicht im Plan, nicht in Abschnitt 8 |

### 2.6 Mehrdeutige Kürzel

- **„V-n“** heißt in Papier 8 ein Vermessungsbefund, in den Papieren 2, 3, 4, 6, 7 ein Verdacht
  („V-1 … V-8“). Der Plan benutzt nur die erste Bedeutung; wer im Plan „V-4“ liest und in Papier 6
  nachschlägt, landet beim Realtime-Verdacht.
- **„D3-C“** sind in Papier 11 die *Ideen* (C0 bis C13), in den Papieren 9, 10, 12 ist „C“ die
  *Bedienung*. Die neun durchgespielten Aufgaben in Papier 11 §4 haben kein Kürzel. Die Zahlen 45
  und 56 gehen nur auf, wenn man das weiß; Abschnitt 4.4 führt D3-C1 und D3-C2 als Bedienbefund.
- **„I-1 … I-7“** in Papier 6 (Ideen) neben „D1-I…“; **„B-n“** in Papier 8 neben „V-Bn“ im Plan.

## 3. Zahlen: nachgerechnet

| Angabe im Plan | Plan | nachgerechnet | Abweichung |
|---|---|---|---|
| Code-Befunde | 107 | 16 + 17 + 12 + 17 + 16 + 13 + 16 = 107 | keine |
| davon Fehler / Lücken / Grenzen / Unstimmigkeiten / fehlende Prüfungen | 26 / 34 / 25 / 13 / 9 | 25 + 1 („Fehler/Lücke“, G-3) / 34 / 25 / 13 / 9 | keine (rund zehn Befunde tragen im Papier zwei Arten; gezählt ist die erstgenannte) |
| Verdachtsfälle | 45 | 45 | keine |
| benannte Grenzen neu bewertet | 158 „Einträge aus `grenzen-durchsicht-2026-10-24.md`“ | 165 Tabellenzeilen (26 + 22 + 24 + 24 + 29 + 22 + 18); davon 9 ausdrücklich „unbenannt/neu“ → 156; mindestens 10 Einträge stehen in zwei Papieren (E49 ohne Netz, privates Fenster, Monatswerte, Monatsstände, Gutschrift als Hinweis, Rechnungsanschrift Liegenschaft, Nummern ohne Lückenlosigkeit, „Wartung erledigt?“, Rate-Limit je Link, „E-Mail an …“); vier Zeilen in Papier 7 stammen nicht aus dem Grenzen-Dokument | **158 lässt sich nicht herleiten** (165 / 156 / rund 146 ohne Doppelte) |
| Fehler gegen die Linie | 73 | 22 + 20 + 17 + 14 = 73 | keine; „(mit Messwert)“ gilt nicht für D1-A20 (nur Code), D1-A22 (Code) |
| Unstimmigkeiten | 62 | 15 + 11 + 20 + 16 = 62 | keine |
| Bedienung | 45 | 9 + 14 + 9 (Aufgabenzeilen Papier 11 ohne Kürzel) + 13 = 45 | keine; D2-C8 lautet „nichts ändern“, D2-C7 beginnt mit „Gut“ |
| Ideen | 56 | 18 + 13 + 14 (D3-C0 bis C13) + 11 = 56 | keine — aber ohne die 58 Ideen der Papiere 1–7 |
| zu viel Text | 88 | 25 + 20 + 22 + 21 = 88 | keine |
| Trennpunkt-Muster | 51 | 17 + 9 + 13 + 12 = 51 | keine |
| durchgespielte Aufgaben | „rund 30“ / „30“ | 7 + 8 + 9 + 13 = 37 Zeilen, davon rund 30 mit gezählten Tipps | unerheblich; einheitlich „rund 30“ schreiben |
| Vermessung: Routen / Paare / Zustände / Texte / Blätter / Bedienelemente | 65 / 177 / 863 / 56.091 / 1.933 / 13.479 | wie Papier 8 | keine |
| Vermessung: Fehler, Unstimmigkeiten | 16, 11 | V-1 bis V-16, B-1 bis B-11 | Zahl stimmt; V-16 ist kein Fehler der App (Falschmeldungen des Werkzeugs), B-5, B-8, B-9, B-11 nennt das Papier selbst „entschieden“ bzw. „gewollt“ |
| fehlende Wächter | 16 | 17 Zeilen in Papier 8 §8 (die 17. ist ein Hinweis für die README) | 1, erklärbar |
| „19 Routen außerhalb der geprüften 46“ | 19 | steht so nicht im Papier (dort acht Routengruppen); 65 − 46 = 19 ist abgeleitet | als Ableitung kennzeichnen |
| Punkte im Quelltext | rund 510 Zeilen, rund 160 Dateien, 113 `join` | 545 Zeilen (506 ohne Kommentare), 163 Dateien, 113 | keine. „am häufigsten Material, Planung, Zeit, Rechnungen“ lässt die Startseite aus (48 Zeilen — mehr als Planung, Rechnungen und Zeit) |
| Punkte gerendert | 736 auf 163 Seiten bei 390 px, „davon 60 allein auf `/time`“ | 736 und 60 stehen so im Papier. **Die Rohdaten widersprechen sich** (`V/text.ndjson`, `V/punktzeilen.ndjson`, von mir nachgerechnet): die Summe der Paare ist 1.072, die Listenzeilen tragen 205 × 1 + 390 × 2 + 1 × 3 + 4 × 5 = 1.008 Punkte, `/time` allein 54 Zeilen mit zwei Punkten je Rolle. Außerdem ist 60 der Wert *einer* Rolle, 736 die Summe über *alle* Rollen (auf `/time` sechsmal 60) | **Zahl nicht belastbar**; vom Prüfer des Papiers 8 klären lassen |
| „Meist steht ein oder zwei Punkte je Zeile“ | — | bei 390 px sind zwei Punkte der häufigste Fall (390 gegen 205 Listenzeilen); Papier 9 sagt für dieselbe Zeitliste „fast immer ein Punkt“ (es zählt Textzeilen, Papier 8 Listenzeilen) | Zählweise festlegen — sie bestimmt den Wächter in Abschnitt 6 |
| Textmenge | 662 / 630 / 406; elf Fließtexte; kein Untertitel über 12 Wörter | wie Papier 8 (längster Untertitel 9 Wörter) | keine. Papier 8 sagt aber ausdrücklich: `/time` und `/my-schedule/mein` sind lang „weil die Liste lang ist, nicht weil erklärt wird“ — im Plan stehen sie unter „Zu viel Text“ |
| Funktionsinventar | 1.941 | 1.941 Einträge in `v10-funktionsinventar-vorher.json` | keine |
| „die 32 bestehenden Fälle“ (G-1) | 32 | 32 `it` in `tests/unit/kontoauszugAbgleich.test.ts` | keine |
| „`lagerListe.test.ts` (9)“ | 9 | 9 | keine |
| „die 34 bestehenden Fälle der vier Funktionen“ (Paket 1, Schritt 5) | 34 | `supportAnsehenListen.test.ts` hat 5 `it`-Blöcke | nicht nachvollzogen — Quelle nennen |
| „heute rot an sieben Fenstern“ (Paket 5) | 7 | belegt sind vier (drei „Neu“-Fenster D2-A20, Zeitblatt D1-C1), dazu „Antrag stellen“ bei Sonderurlaub (D1-B3) | **nicht herleitbar** |
| Summe der Aufwände | — (nicht genannt) | 190 bis 235 Arbeitstage, ohne G-3, G-13, E-V1 bis E-V3 | fehlt im Plan |

## 4. Kurztexte und Kennzeichen: Abweichungen

Stichprobe: alle 107 Code-Befunde auf Art, Schwere, Aufwand (maschinell, **0 Abweichungen**), dazu
58 Befunde im Wortlaut (Z-1, Z-2, A-1, A-4, P-1, G-1, G-10, M-6, S-1, S-9, S-13, L-1, L-4, L-12,
V-3, V-5, V-6, V-13, V-B1 bis B3, B5, B8, B9, B11, D1-A2, A17, A19, A22, B3, C2, C3, C5, C6, C7,
D2-A1, A9, A10, A16, A20, B3, B10, I10, D3-1, 6, 9, 13, C1, C6, D4-A1, A3, A10, B1, B15, C2, C3,
C12, I1, I2). 37 sagen dasselbe wie das Papier. Abweichungen:

### 4.1 Zugespitzt

1. **D3-6** steht in 1.2 unter „Stille Falschzahlen und Datenverlust“. Das Papier führt es als
   Formfehler (Dezimalpunkt, eine Nachkommastelle); „gleich bleibt: der Wert“. Es ist keine
   falsche Zahl.
2. **V-5** „Sieben Bausteine unter 44 px“: laut Papier ist einer davon *gewollt* (`Button klein`,
   36 px, benannte Ausnahme in `knopf.ts` und `style.md`), einer „1 px, unerheblich“, einer
   „knapp, 2 px“, einer „prüfen“. Echte Ausreißer nennt das Papier drei.
3. **V-B8** (Monatsbalken mit 3-px-Petrolstrich) führt der Plan als Unstimmigkeit. Das Papier nennt
   es „Frage, kein Fehler“ — und E96 beantwortet sie (siehe 6.2 Nr. 2).
4. **V-B5, V-B9, V-B11** führt der Plan als Unstimmigkeiten (V-B5 und V-B9 in Paket 5, V-B11
   „Paket 5 bzw. 12“); das Papier: „beides ist entschieden“ (E92), „gewollt (E86)“, „gewollt ist
   der Umbruch“.
5. **3.6:** „Kein Befund, bei dem ein Konto Daten eines anderen Betriebs lesen oder schreiben
   kann.“ Für die belegten Befunde richtig; Papier 6 führt aber den offenen Verdacht V-4
   (Löschereignisse in Realtime). Der Satz braucht den Zusatz.
6. **1.2:** „alle drei im Code nachgelesen, zwei davon an einer Wegwerf-Datenbank bzw. per Skript
   nachgestellt“. Z-1: nur gelesen (Papier 1: „Nichts lief gegen eine Datenbank“). Z-2: das Skript
   liest die Migrationen der Reihe nach — ein statischer Fund, kein Lauf. Nachgestellt im
   eigentlichen Sinn ist nur S-1 (Papier 6: 358 Migrationen in einem Wegwerf-Postgres).

### 4.2 Abgeschwächt oder verkürzt

7. **S-9 / Paket 23:** vom Vorschlag bleibt nur `npm ci --ignore-scripts`. Es fehlen: fremde
   Actions auf Commit-Kennung, Secrets an eine GitHub-Umgebung binden, die Grenze in `CLAUDE.md`
   und `DEPLOYMENT.md` ehrlich benennen, der Wächter über die Workflow-Dateien.
8. **L-12 / Paket 11:** das Papier will „ein Fenster je Pull Request“ entlang vorhandener Nähte
   (Mahnlauf, Zahlung, Export/E-Rechnung, Stornieren), „kein Neuschreiben“. Der Plan macht daraus
   einen PR mit sechs Teilen, darunter „Liste“ und „Erstellen“, die das Papier nicht nennt.
9. **D4-C1 / Paket 12:** übernommen ist nur (a) „Krankmeldung aus der Planung“; (b) Ersatz
   anbieten und (c) Fenster in drei Abschnitten fehlen ohne Vermerk.
10. **D1-C2, D1-C7 / Paket 10:** die Vorbehalte „fachlich mit dem Bereich Zeit abstimmen“ und
    „Vorbehalt: fachlich“ (Empfänger „Büro“) sind weggefallen; beides steht ohne Entscheidung im
    Paket.
11. **D4-I1 / Paket 12:** der Vorbehalt „zwei Baustellen desselben Kunden am selben Tag müssen
    unterscheidbar bleiben“ fehlt.

### 4.3 Anders als das Papier

12. **D1-C5 / Paket 10:** Papier: dreigeteilte Leiste am Fuß jeder Karte und Verweis auf den
    nächsten Einsatz (klein bis mittel). Plan: eine neue lesende Baustellenansicht für den Monteur
    mit Leistungsumfang aus A-10 — steht in keinem Papier, ist größer und hängt an Paket 18.
13. **D4-C2 / Paket 12:** Papier: „Verschieben …“ ins ⋯ des Fensters; das Feld „Tag“ heißt „Tag
    ansehen“ oder entfällt. Plan: „verschiebt das Feld ‚Tag‘ den Einsatz — oder ein eigener
    Eintrag“. Die erste Variante ändert die Bedeutung eines bestehenden Felds und steht nicht im
    Papier; das „oder“ ist kein Plan.
14. **D4-A10 / E-M:** Papier: Monat am Tablet rollt seitlich mit Spalten ab 44 px *oder* Handyform
    bis 1.199 px. E-M: „Tag öffnet das Tag-Fenster“ — eine dritte Lösung, die den gemessenen
    18 px breiten Tageskopf nicht breiter macht.
15. **D2-B3 / Paket 5, Schritt 2:** Papier empfiehlt: Entwurf behalten für alle „Neu“-Fenster und
    es sagen; Rückfrage nur beim Bearbeiten; Escape schließt ein leeres Fenster ohne zweite Taste.
    Plan: „Schließen mit Änderungen fragt (wie die Akte)“ — das Gegenteil für die „Neu“-Fenster.
16. **D4-B1 / Paket 16:** Papier: „E95 will den Schalter auch im Formular — das bleibt“; eine
    Speicherleiste je Seite, Zusatz „noch nicht gespeichert“, Teilerfolg benennen. Plan: „wird der
    Schalter zum Kästchen-Ersatz ‚gilt mit Speichern‘ …“ — der Satz ist unverständlich und liest
    sich wie ein Rückbau von E95.
17. **D2-I10 / Paket 13:** Papier: „nur als Reihenfolge am Handy, nicht als Entfernen“ (E99). Plan:
    „leere Karten der Übersicht zusammengelegt“.
18. **D1-B3 / Paket 5, Schritt 1:** Papier und `style.md` Z. 117: Hauptaktion am Handy „kompakt
    rechts“. Plan: „am Handy über die Breite“.
19. **D4-A3 (4.2):** als Ursache steht `App.tsx:657`. Das ist die Stelle von D4-C13 (unbekannte
    Adresse); D4-A3 liegt in `guards.tsx:24–31, 52–79`.
20. **D4-C3 / Paket 14:** Papier: Meldung *mit* „Akte öffnen“, „Liste nach dem Anlegen
    erreichbar“. Plan: „führt die App dorthin“.
21. **Abschnitt 6, Baustein:** „`Angaben`/`Metric` (gibt es im Rechnungsfenster)“. Einen Baustein
    `Angaben` gibt es nicht (nur `AktenAngaben`); Papier 8 benutzt den Namen für etwas anderes
    (ein Verbinder statt `join(' · ')`).

### 4.4 Kennzeichen ✔ und ◆

- **◆ ist getragen** bei G-1 (Wegwerf-Skript mit der echten Funktion), S-1 (gemessen), D1-A17,
  D1-C3, D1-C6, D2-A1, D2-A20, D3-1, D3-9, D4-A1, D4-C12 (je mit Messwert), D4-C2 (beobachtet).
  **S-13 nur zum Teil:** die drei „Mitarbeiten“-Rückfälle sind „nach Code“ — der Plan sagt das in
  Paket 1 Schritt 5 richtig („erst nach Nachstellen“), die Tabelle nicht.
- **◆ ist uneinheitlich gesetzt:** kein einziger V-Befund trägt es, obwohl alle gemessen sind;
  Z-5 (zwei Wegwerf-Prüfungen in Papier 1), L-4 und L-13 (gemessen) tragen es nicht; von den 73
  A-Befunden mit Messwert tragen es sechs. Nach der Legende hieße „ohne Zeichen“ dort „vor dem
  Bau nachzustellen“ — für Gemessenes irreführend.
- **✔** (Z-1, Z-2, A-4, P-1, M-1, M-2, L-1, D3-6): fünf davon habe ich am Code gegengelesen und
  bestätigt — `InvoicesView.tsx:1306` `String(vorschlag)`; `20261116030000…sql:74–75` liest
  `users.work_days`, danach fasst nur `20261116031000` die Funktion an; `quotes.ts:266`
  `grenze: 20`; `materialOrders.ts:506` und `workSheets.ts:881` rufen ohne `.range`. Ebenfalls
  bestätigt: 6.574 Zeilen in `InvoicesView.tsx` (L-12), 358 Migrationen.
- **Abschnitt 10** sagt „alle anderen sind aus dem Code gelesen bzw. in der Vorschau gemessen“ —
  das ist ehrlich und deckt sich mit den Papieren.

## 5. Reihenfolge und Abhängigkeiten

Kein Zyklus. Aber neun Stellen, an denen ein Paket etwas braucht, das später kommt, oder an denen
dieselbe Stelle mehrfach umgebaut wird.

| Nr. | Befund | Beleg | Vorschlag |
|---|---|---|---|
| 1 | **Paket 10 setzt A-10 voraus** („Leistungsumfang aus A-10“), A-10 kommt in Paket 18 (f). Paket 10 hat keine Zeile „Voraussetzung“ | Plan Z. 770 gegen Z. 921 | A-10 (lesende Funktion) vor Paket 10 ziehen oder den Leistungsumfang aus 10 streichen (siehe 4.3 Nr. 12) |
| 2 | **Paket 14 baut „Schein unterschrieben → Verbrauch buchen?“ (M-6)**, Paket 21 (b) baut dasselbe als Funktion | Plan Z. 860 gegen Z. 950 | M-6 ganz nach 21 (b); 14 nennt es nur als Anschluss |
| 3 | **Pakete 5 bis 8 verlangen „Vorher/Nachher-Bilder aller Fenster“ und Messungen**; das Werkzeug dafür entsteht erst in Paket 9 | Regel 5; `fotos.mjs` (siehe 7.1) | **Paket 9 an den Anfang von Stufe B** |
| 4 | **L-4 und L-9 liegen in E, werden ab Paket 2 gebraucht.** Papier 7: „die nächste Erweiterung an Rechnungen, Startseite oder Baustellenakte macht den Bau rot, unter Umständen erst auf `main`“ (254 von 260 Bausteinen, Rechnungen 131 von 135 KB). Pakete 2, 5, 6, 7, 8, 11 erweitern genau diese Ansichten; das Zerlegen in 11 erzeugt zusätzliche Bausteine | Papier 7 L-4, L-9, L-12 | L-9 (Bau bei jedem PR) und L-4 Schritt 1 **vor Paket 2**; das verhaltensgleiche Zerlegen von `InvoicesView` (erste Fenster) **vor Stufe B**, nicht in Paket 11 |
| 5 | **`InvoicesView` wird in sieben Paketen angefasst** (2: D3-6, G-2; 5: D3-4; 6: Formatierer; 7: D3-P1 bis P5; 8: D3-T4 bis T7; 11: Zerlegen und Umbau; 14; 25) — sechs davon vor dem Zerlegen | Punkte-Zeilen | wie Nr. 4; bis zum Zerlegen kein zweiter offener PR an der Datei |
| 6 | **Dieselben Listenzeilen werden bis zu fünfmal umgebaut:** Paket 5 (Pfeil), 7 (Punkte, Spalten in `ListRow`), 8 Schritt 7 (kürzen), 11 bzw. 13 (Knöpfe aus der Zeile), 12. Papier 10 sagt zur Spaltenform von `ListRow` selbst: „mit den anderen Bereichen gemeinsam bauen“ | Plan Z. 665, 707, 737, 845 | Stufe B liefert **Bausteine, Regeln und Wächter mit Ausnahmeliste** (heutige Verstöße); umgestellt wird **je Liste einmal** in Stufe C (Pfeil, Punkte, Text und Knöpfe in einem PR). Das entspricht auch 1.3 („B: Bausteine und Regeln, C: Seiten“), dem die Pakete 7 und 8 heute widersprechen |
| 7 | **`PageHeader`/Kopf** in 8 (Untertitel), 10 (Kopfinsel, Rückweg, Titel schrumpft), 13 (D2-A18: Hilfe und ⋯ in die Ortszeile), 15 (Liegenschaft auf `AktenKopf`), 16 | Punkte-Zeilen | nacheinander, nicht parallel; D2-A18 und D1-I2/I3 in einen PR am Baustein |
| 8 | **Paket 11 baut „Bestellen …“ in der Einkaufsliste (D3-C6, „PDF laden oder Mail senden“), Paket 21 (d) baut die Bestellung als Beleg mit Nummer und Versand (M-9)** — dieselbe Oberfläche zweimal; „Mail senden“ gibt es bis M-9 nur als `mailto` | Plan Z. 800 gegen Z. 952 | M-9 vor den Einkaufsteil von 11, oder D3-C6 nach 21 (d) |
| 9 | **Paket 2 (G-1) und Paket 20 (g) G-12:** der Abgleich erkennt Rechnungsnummern am heutigen festen Schema (Jahr und laufende Nummer ab 1001); wird das Schema einstellbar, muss die Erkennung dem Schema folgen | Papier 4 G-1, G-12 | in 20 (g) als Punkt aufnehmen, Prüfung in `kontoauszugAbgleich.test.ts` |

Weitere Hinweise:

- **Paket 11 Schritt ③ (Zahlungsziel, Skonto, Rücklass „nur Abweichungen offen“) und Paket 20 (c)
  G-11 (Konditionen je Kunde):** „Abweichung“ bedeutet nach G-11 etwas anderes (gegen die Vorgabe
  des Kunden). G-11 vor oder mit Paket 11 planen.
- **Paket 17:** (d) Z-13 schreibt den Zeitkontostand in die Lohn-Datei, (f) Z-3 berichtigt ihn erst
  um ausbezahlte Überstunden. Reihenfolge umdrehen oder Z-13 in zwei Teile (Personalnummer jetzt,
  Stand nach Z-3).
- **Paket 12 „Paket 19 (P-4) kann parallel“:** beide bauen an Wochenplan und Einsatzfenster, D4-C1
  (Krankmeldung aus der Planung) hängt an P-4 (Abwesenheit im offenen Plan). Nacheinander: 19 (a)
  vor 12.
- **L-11 (Büro-Geldwege und Tablet in WebKit) liegt in Paket 24, nach dem größten Umbau dieser
  Wege (Paket 11).** Regel 7 des Plans („`webkit-telefon`, `tablet-834` vor jedem PR der Stufen B
  und C“) schützt die Büroseiten nicht: beide Projekte laufen nur über `MONTEUR_WEGE`
  (`playwright.config.ts:58, 108–131`). L-11 vor Stufe C.
- **Paket 1:** Schritt 1 (Wächter) vor Schritt 2 und Schritt 4 vor 5, 6 vor 7 — richtig so
  („Wächter zuerst“, mit Gegenprobe am heutigen Stand).
- **Paket 7 nach 6** steht da. **Paket 15 nach 9** steht im Text, nicht als „Voraussetzung“.
  **Paket 11 nach 2** steht da; es fehlt „nach 9“ (Vorschau für Rechnung stellen, Kontoauszug,
  Einkauf).

## 6. Widersprüche zwischen Vorschlägen und gegen Regeln/Entscheidungen

### 6.1 Zwischen den Papieren (im Plan beide übernommen)

| Nr. | Vorschlag A | Vorschlag B | Im Plan |
|---|---|---|---|
| 1 | D2-A9 (Papier 10): der runde gefüllte „+“-Knopf im Kartenkopf ist ein Fehler → gerahmter Textknopf „Termin anlegen“, „Top anlegen“ | D3-B15 (Papier 11): „im Blattkopf immer `NeuKnopf`“; E-N: „runder Kreis bleibt in Listen“ | beide in Paket 5 Schritt 5. D2-A9 (a) ist damit abgelehnt — das steht nirgends |
| 2 | D2-A16 (Papier 10): Knöpfe „30 Tage / 90 Tage / 1 Jahr“ mit 36 px sind ein Fehler → Segment mit 44 px | V-5 (Papier 8): dieselben Knöpfe sind „gewollt (benannte Ausnahme)“ | D2-A16 in Paket 13, V-5 in Paket 5 mit Wächter „44 px über jede Seite“ — ohne Ausnahmeliste im Plan (Papier 8 verlangt sie) |
| 3 | D2-A16 (Papier 10): Suchfeld der Listen 40 px in 44-px-Hülle — „kein Befund“ | V-5 (Papier 8): dasselbe Feld ist der erste „echte Ausreißer“ (Lupe und Rand nehmen den Tipp nicht an) | Paket 5 Schritt 6 folgt Papier 8; Papier 10 ist zu berichtigen |
| 4 | D4-A10 (Papier 12): Tastflächen im Monat am Tablet sind ein Fehler | V-5 (Papier 8): „als dichtes Raster entschieden (E88; `rand.spec.ts` nimmt es aus) — kein Fehler gegen eine Regel“ | E-M entscheidet — aber mit einer Lösung, die keines der Papiere vorschlägt (4.3 Nr. 14) |
| 5 | Papier 8 §4/§8: Regel „höchstens **zwei** Punkte je Zeile“, Wächter „mehr als zwei rot“ | Papiere 9, 11, 12: „nie mehr als **ein** Punkt“ | E-P folgt 9/11/12; 4.1 sagt „je ein Wächter ist vorgeschlagen“, ohne die abweichende Schwelle zu nennen |
| 6 | D1-P8 / D1-B9 (Papier 9): Zähler **rechts** im Kartenkopf | D4-P3 (Papier 12): „Zahl in Klammern am Titel (ist die häufigere) — oder rechts“; E98: „der Zahl im Titel“ (`Card klappe`); E99: „bewusst geblieben: die Nummer der Rechnungen im Kopf der Karte“ | Plan: „eine Form für alle Karten: rechts“ — ohne Entscheidung, berührt E98/E99 |
| 7 | D4-B2 (Papier 12): Gruppenkopf in **normaler** Schrift 13/500 | V-B5 (Papier 8): Rollen festschreiben, beides ist entschieden (E92); D3-B12 (Papier 11): Abschnitt 15/500, Dachzeile 12 | Paket 5 Schritt 5: „eine Form je Rolle“ — welche, steht nicht da |
| 8 | D2-C12, D3-C6, D2-B10: Knöpfe **aus** der Zeile ins Fenster (ein Tipp mehr für „Geliefert“, „Ändern“, „Annehmen“) | D1-C5: drei Aktionen **an** jede Karte; D3-C7: „Auf die Einkaufsliste“ aus dem ⋯ heraus als Knopf; D3-C9: zwei Preise zusätzlich in die Katalogzeile | Plan übernimmt beide Richtungen; eine Regel („eine Zeile trägt höchstens den einen nächsten Schritt“) fehlt in Abschnitt 5/6 |
| 9 | Textregel 6 und Paket 8 Schritt 6: leere Blätter zuklappen; D2-I10: leere Karten zusammenlegen | D2-I9 und Paket 14: „Leerzustände tragen den ersten Schritt“ („jede leere Karte ist ein Angebot, kein Loch“) | beide im Plan; und gegen E99 (6.2 Nr. 3) |
| 10 | Textregel 2: jede Angabe einmal; Papier 8 §5.5: Summe der Angebotsakte einmal | D2-I2 / Paket 15: Kennwerte „offen € …“ zusätzlich in den Kopf der Kundenakte; D3-C7: „4 Stk frei“ zusätzlich in Zeile **und** Fenster | hinnehmbar (anderer Reiter), braucht aber den Satz „Kennwert im Kopf zählt nicht als Wiederholung“ in der Regel |
| 11 | D2-I10 schlägt die Zeile „Noch nichts: Nachrichten · Einsätze · Material“ vor | Punktregel 1: nie mehr als ein Punkt | der Vorschlag verstößt gegen die neue Regel |
| 12 | D2-A12/D2-C12: Zeilenknöpfe „ins ⋯ der Zeile“ (auch Wartungen, Scheine) | Leitfaden Regel 3 (zitiert in Papier 8): ⋯ je Zeile nur, wo es schon stand (`/quotes`, `/customers`, `/admin-projects`) | Paket 13 lässt offen, ob ein neues Zeilen-⋯ entsteht — es darf nicht |

### 6.2 Gegen Entscheidungen und Regelwerk

| Nr. | Stelle im Plan | Widerspricht | Beleg |
|---|---|---|---|
| 1 | Paket 5: D2-A9 (a) — Kartenkopf „Termin anlegen“, „Top anlegen“, „Beteiligten eintragen“ als gerahmter Textknopf | **E76** — ausdrücklicher Wunsch des Auftraggebers: „‚Termin anlegen‘ … durch das runde Petrol mit weißem Plus ersetzen“; umgestellt wurden genau diese drei | `entscheidungen.md` Z. 2908–2913, 2956–2960 |
| 2 | 4.1: V-B8 Monatsbalken „gehört zu Paket 5 bzw. 12“ | **E96:** „Die Balken der Monatsansicht bleiben, wie sie sind: es sind einzeilige Balken auf getönter Fläche, keine Kacheln“ | `entscheidungen.md` Z. 4084–4087. Das Papier irrt („ob E96 den Monat mitmeint, steht dort nicht“) |
| 3 | Textregel 6; Paket 8 Schritt 6; Paket 13 „leere Karten zusammengelegt“ | **E99:** „Bewusst geblieben: … die leeren Karten Nachrichten und Einsätze (sie tragen den nächsten Schritt)“ | `entscheidungen.md` Z. 4427–4431 |
| 4 | Paket 16, E-E: „wird der Schalter zum Kästchen-Ersatz …“ | **E95** und `schalterRegel.test.ts`: „jede Einstellung, die etwas ein- oder ausschaltet, ist ein `Schalter`“ | `entscheidungen.md` Z. 4047–4056. Gemeint ist laut Papier 12 das Gegenteil; der Wortlaut muss das sagen |
| 5 | Paket 5 Schritt 1: Fuß „am Handy über die Breite“ | **`style.md` Z. 117:** „Mobile Primäraktionen liegen kompakt und inhaltsabhängig rechts in der Abschlusszone … Volle Breite ist nur dort sinnvoll, wo ein einzelner klarer Abschluss …“ | auch D1-B3, D4-B7 |
| 6 | Paket 5 Schritte 6 und 7: „Tastflächen ≥ 44 px“, Wächter „über jede Seite“ | **`style.md`/`knopf.ts`:** `Button groesse="klein"` 36 px ist benannte Ausnahme; **E88:** Monatsraster dicht | Papier 8 V-5 und §8 (verlangt die Ausnahmeliste) |
| 7 | E-N: im Fenster der Kreis gerahmt statt gefüllt | **E76** nennt das „Tagesfenster“ ausdrücklich als umgestellt | offen gelegt und entschieden — in Ordnung; im Plan fehlt nur der Satz „ändert E76 für Fenster“ |
| 8 | E-T: Untertitel auch ab Tablet in die Hilfe | **E86/D1** (`PageHeader.tsx:128–134`): Beschreibung steht ab Tablet, am Handy in der Hilfe | entschieden — in Ordnung; als „ändert E86“ kennzeichnen |
| 9 | Punktregel 1 und Wächter „zwei und mehr rot“ | **E96** legt fest: „15 Baustellen · auf Person und Tag ziehen“ (ein Punkt, in Ordnung); **E98:** Summenzeile (ein Punkt, als Ausnahme genannt). Die Ausnahme „Anschrift, wie sie auf dem Beleg steht“ deckt auch „Tel … · office@… · www…“ (zwei Punkte, Annahmeseite) — das muss in der Ausnahmeliste stehen | Papier 10 §7 Muster g |
| 10 | Paket 6, E-D: „Anrede ‚du‘ überall“ | kein Regelverstoß, aber eine **Verschlimmbesserung, wenn wörtlich genommen**: die Kundenseite der Annahme, Mailtexte und Belege sprechen den Kunden des Betriebs an („Sie haben angenommen“) | D3-T22 meint nur die Bedienoberfläche (Kontoauszug „Ihrer“) |
| 11 | Paket 23, S-9: Zugangstoken und Datenbankpasswort bleiben in GitHub-Secrets | **`CLAUDE.md`:** „nie in GitHub-Secrets“ — Papier 6 verlangt deshalb, die Grenze mit Grund zu benennen | im Plan weggefallen (4.2 Nr. 7) |
| 12 | Abschnitt 2 und alle Pakete mit neuen Tabellen oder Funktionen (Z-3, Z-5, Z-9, Z-11, G-9, G-11, M-7, M-9, S-4, D1-C7, P-1/S-5/P-8 am Gerät) | **`CLAUDE.md`, Sicherheit und Daten:** `security definer`, `search_path = ''`, `revoke`; Zeilenschutz über `(select app.lesebetrieb())`; **Datenauskunft und Löschung** für jede Tabelle mit Personenbezug; `edge-shared-uebernehmen.mjs` nach Änderungen an `shared/` (Paket 1 Schritt 5 ändert `startseite-forderungen`) | der Plan nennt die Funktionsregeln einmal (Paket 1 Schritt 7), Datenauskunft/Löschung und `shared/` nie. Papier 4 hält zudem fest: Zeilenschutz, Auskunft und Löschung der Tabellen `bank_buchungen` und `beleg_versand` sind **nicht geprüft** |
| 13 | Abschnitt 2 und alle Pakete | **`CLAUDE.md`, Ablauf Schritt 5:** Handbuch (Stempel mit Zahl der Prüfungen) und `stand-2026-10-03.md` nachziehen | nirgends im Plan; nur Paket 24 nennt das Grenzen-Dokument |
| 14 | Paket 24: „toter Code entfernt“ (L-14, auch Datenbank) | Regel 10 / „Produktion wird nicht umgeschrieben“ ist nicht verletzt, solange nur Funktionen fallen — aber eine alte, im Gerät liegende App-Fassung kann sie noch rufen (die Grenzen-Übersicht führt „altes Gerät“ mehrfach) | Bedingung fehlt im Plan |

Ohne Befund gegen `CLAUDE.md` blieben: Pillen, Verläufe, Glasflächen, Farbflächen für Warnung,
Karte in Karte, Schatten, Radien — kein Vorschlag des Plans verlangt so etwas. Hinweis: die Regel
„Nummer als Stempel am Namen“ (Abschnitt 6) vermehrt gerahmte Marken je Zeile (Artikelnummer,
Rechnungsnummer im Kontoauszug, Eingangsnummer); V-B3 schlägt dafür einen Baustein `Nummer` *ohne*
Rahmen für Begleitzeilen vor. Der Plan sollte sagen, wo gerahmt und wo nicht.

## 7. „Nichts verschlimmbessern“: Lücken je Paket

### 7.1 Die Werkzeuge aus Abschnitt 2 — was sie wirklich leisten

| Regel | Werkzeug | Gibt es | Leistet, was der Plan sagt? |
|---|---|---|---|
| 3 „Keine Bedienstelle geht verloren“ | `tests/unit/funktionsinventar.test.ts`, `scripts/funktionsinventar.mjs`, `v10-entfernt.json` (107 Einträge) | ja | **nur zum Teil.** (a) Verglichen wird gegen `v10-funktionsinventar-vorher.json`, den Stand **vor V10** (Commit 0f56106, 13.11.). Was seit E93 dazukam (Schublade „Noch einzuplanen“, `Card klappe`, Belegzeilen und Rechnungsfenster der Akten, Einsatz-Vorschau der Startseite …), steht nicht darin und kann unbemerkt verschwinden. (b) Der Schlüssel ist Art + Text + Ziel **ohne Datei**: 496 der 1.941 Einträge teilen ihren Schlüssel mit anderen („Abbrechen“ 38-mal, „Speichern“ 16-mal). Fällt einer von 16 „Speichern“-Knöpfen weg, bleibt die Prüfung grün. Paket 6 (ein Wort je Sache) macht diese Schwäche größer. (c) Gelesen wird Quelltext, nicht Erreichbarkeit: ein Knopf, der ins dritte Fenster wandert, gilt als „da“ |
| 5 „Vorher/Nachher im Bild“ | `tools/vorschau/fotos.mjs` | ja | **nein.** 35 fest eingetragene Routen (die Vermessung fand 65; es fehlen u. a. `/eingaenge`, `/liegenschaften`, `/nachrichten`, `/sonderurlaub`, `/invoices/kontoauszug`, sieben Einstellungsseiten, `/plattform`); nur Grundzustand, keine Fenster, Menüs, Blätter, Reiter; nur hell; nur Chromium; misst nur `scrollWidth`; stellt nichts nebeneinander. „Fluchten und Tastflächen neu messen“: die Skripte dafür (`lauf.mjs`, `inseite.mjs`, `text.mjs`) liegen nur im Scratchpad der Durchsicht, das „bei Neustart oder Aufräumen“ verloren geht |
| 7 „Alle Browser vor dem Push“ | `webkit-telefon`, `telefon-chromium`, `tablet-834`, Linkprüfungen | ja (Stand §113) | für die Wege des Monteurs ja; **für Büroseiten nein** (`testMatch: MONTEUR_WEGE`). Siehe 5, Hinweis zu L-11 |
| Paket 9 | `tests/unit/vorschauErsatz.test.ts` | ja | prüft Exportnamen der handgeschriebenen Ersatzmodule und je Attrappe das, was jemand als Zeichenkette einträgt — „verlangt die Form je Attrappe“ gilt nur, wenn jede neue Form dort von Hand ergänzt wird |
| Paket 2, 6, 11 | Belegreferenz (`tests/unit/belegReferenz.test.ts`, `docs/ui-umbau/referenz.json`) | ja | zehn Dateien Byte für Byte (Rechnung, Storno, Mahnung, Schein, Stundennachweis, drei CSV, Lohn, Archiv). **Nicht darin:** Angebots-PDF (Pakete 13 und 18 ändern es), E-Rechnung (XML), Bestellung. **Für G-16 untauglich:** die Referenz ruft `rechnung_anlegen` nicht; „zuerst messen, ob alle Belegarten die Prüfung bestehen“ geht nur über die Datenbankprüfungen |
| Paket 6 | `tests/unit/schreibweise.test.ts` | ja | prüft heute ß und Anführungszeichen; die Wörterliste ist neu zu bauen (in Ordnung, aber kein „Erweitern“ um eine Zeile) |
| Paket 16 | `tests/unit/schalterRegel.test.ts` | ja | hält E95 fest — bleibt grün nur, wenn 6.2 Nr. 4 berichtigt ist |

### 7.2 Die zehn Regeln

Ausreichend im Ansatz; es fehlen vier:

- **Regel „ein Tipp mehr wird benannt“.** Regel 3 schützt die Existenz, nicht den Weg. Mindestens
  acht Vorschläge legen eine Aktion oder Angabe einen Tipp weiter weg: D2-B10 (Termin ändern: 1 →
  2), D3-C6 („Geliefert“ aus der Zeile ins Fenster), D2-C12 („Neue Fassung“, „Annehmen →
  Baustelle“ aus der Angebotszeile), D2-A10 (Annahme-Link), D1-A19 („Problem melden“, Darstellung
  ins Profil-Fenster), D2-T1 (Team, Projektleitung, Telefon aus der Baustellenzeile — die Zeile
  öffnet dort eine Akte, kein Fenster; „das es überall gibt“ in Muster 6 stimmt nicht), D4-I1
  (Nummer nur noch im `title` — das gibt es am Tablet nicht), D3-P3 (Rechnungsdatum am Handy nur
  im Fenster).
- **Regel zu alten App-Fassungen.** Jede geänderte Signatur oder neue Abweisung einer
  Datenbankfunktion (G-5, G-6, G-16 in `rechnung_anlegen`; M-4; Z-4) muss mit einer noch im Gerät
  liegenden Fassung weiter funktionieren oder verständlich ablehnen.
- **Regel zu Sicherheit und Datenauskunft** (6.2 Nr. 12) und **zu Handbuch und Stand** (6.2 Nr. 13).
- **Regel 10 (Altdaten) ist in den Paketen nicht durchgezogen:** Z-11 (Arbeitsjahr als Urlaubsjahr
  einschalten — was geschieht mit laufenden Ansprüchen?), Z-14 (Wegzeit zählt — ab wann? sonst
  ändern sich alte Salden), Z-5 (schon überschriebene Eintritte lassen sich nicht wiederherstellen
  — benennen), A-5 (Altangebote ohne festgehaltenen Empfänger; Papier 2 verlangt die Benennung),
  M-4 (bestehende Posten mit abweichender Einheit), S-7.

### 7.3 Je Paket

| Paket | „Bleibt gleich“ genannt? | Eigene Prüfung dafür? | Was fehlt oder zu allgemein ist; Vorschläge, die etwas wegnehmen oder erschweren |
|---|---|---|---|
| 1 | je Schritt, genau | ja | `edge-shared-uebernehmen.mjs` für Schritt 5; „34 Fälle“ belegen |
| 2 | nur G-1, D3-6, G-2 | zum Teil | G-5, G-6, G-14, G-16, A-3, A-4, G-4 ohne „bleibt gleich“. Fehlt: unveränderte Vorschau wird nie abgewiesen; alte App-Fassung; A-4: `listQuotesForProject` ist eine Tabellenabfrage, „über `rpcAlle`“ passt nicht |
| 3 | allgemein | P-1 ja | Z-4: das Büro ändert weiter ohne Grenze? P-1 setzt serverseitig einen Kunden um — als Verhalten beschreiben |
| 4 | „`lagerListe.test.ts` (9), Bestellvorschläge, Inventur“ | „je Punkt eine Datenbankprüfung“ | M-13 ändert die Bedeutung einer Kennzahl (Handbuch); M-4 Altbestand |
| 5 | je Schritt, knapp | „Fuß im Bild“; sonst Bilder | Schritt 2 gegen D2-B3; Schritt 5 „E97“ ist zu allgemein; sieben Wächter ohne Gegenprobe benannt |
| 6 | Belege, Exporte, gespeicherte Werte | Belegreferenz | fehlt: Eingabe liest weiter beide Schreibweisen (Komma/Punkt); Kundenseite und Belege bleiben beim „Sie“; „240,0 h“ (Budget in Dezimalstunden) auf „HH:MM Std“ ist eine Entscheidung, keine Formatierung |
| 7 | gut (jede Angabe, Reihenfolge, `kein-trennen`, vier Ausnahmen) | `aria-label`-Prüfung, Messung 375 px | „oder einen Tipp entfernt“ erlaubt das Wegnehmen — die Fälle aufzählen (D1-P7 Pause, D1-P16 „heute“, D3-P2 „Regie“, D3-P3 Datum). Der Wächter muss sichtbare Textzeilen zählen, nicht `aria-label` und nicht die ganze Listenzeile |
| 8 | Regel 4, „bleibt“-Liste | Liste erlaubter Untertitel, Hilfetexte | D4-T4: die Stichwortketten der Einstellungsübersicht sind Suchstoff (E9) — „bleibt: die Suche findet weiter“; der Wächter „lange Texte offen“ (`warntextKurz`) aus Papier 8 fehlt |
| 9 | — (nur Werkzeug) | — | „an der App ändert sich nichts“ als Zusage |
| 10 | „alle sieben Wege im Durchklick; Wischen; Ziehen“ | — | zu allgemein für acht Umbauten; „Büro“-Empfänger berührt, wer ein Gespräch liest (E64) |
| 11 | gut (jede Rechnungsart, Sperrgründe, PDFs) | Belegreferenz, Rechnungsprüfungen | „`rechnung_anlegen` unverändert“ gilt erst nach Paket 2; WebKit fehlt (L-11) |
| 12 | Ziehen, „Noch einzuplanen“, Konflikte, Monatsvorschau | — | `einsatzbalken.test.ts` (E96: „Text an derselben Stelle“) muss mit; Nummer verschwindet aus der Kachel; Feld „Tag“ (4.3 Nr. 13) |
| 13 | „`akten.spec.ts`, E99, alle Annahme-Wege“ | — | D2-B2 (zwei Formulare zu einem: „beide Feldlisten prüfen“), D2-B10, D2-C12, D2-I10 gegen E99 |
| 14 | Meldung mit „Rückgängig“; Abbrechen führt zurück | — | „führt die App dorthin“: wer fünf Benutzer oder Kunden hintereinander anlegt, wird fünfmal aus der Liste geworfen. Regel: anbieten, nicht wegführen — außer wo es heute schon so ist |
| 15 | **nichts** | **nichts** | Liegenschaftsakte neu gebaut; unbekannte Adresse zeigt Auskunft — „alte Weiterleitungen (`/order` …) bleiben“ (D4-C13) fehlt; Anmeldeweg: „jeder Schritt, ‚Abmelden‘ auf jeder Zwischenseite“ (D4-B12) fehlt |
| 16 | jede Einstellung, Adressen, Rückfragen | — | Papier: „jede Adresse `/settings/…` bleibt“; Plan: „alte Adressen leiten weiter“ — das ist schwächer; „Speichern je Blatt als Datenbankaufruf“, „ein Blatt mit Fehler blockiert die übrigen nicht“ fehlen |
| 17 | abgeschlossene Monate, genehmigte Anträge, `zeitkontoSaldo.test.ts` | — | Altdaten zu Z-11, Z-14, Z-5 (7.2) |
| 18–25 | **nichts** | **nichts** | je Paket nur die Aufzählung; „bleibt gleich“ und Prüfungen stehen allein in den Papieren |

## 8. Grundsatz 4 und 6

**Grundsatz 6 („keine erste Fassung“, jede Grenze mit Grund):**

1. **„Später: wie eine eingebaute App“** stellt neun Ideen zurück. Das ist keine halbe Funktion
   (es sind neue Ideen), aber es ist **nicht als Entscheidung des Auftraggebers kenntlich**:
   Abschnitt 8 enthält keinen Punkt dazu, E-R deckt nur die Reihenfolge A bis E. Als E-Punkt
   vorlegen („zurückgestellt bis nach Stufe C: ja/nein, je Idee“).
2. **D1-I8 gehört nicht unter „Später“:** das Manifest sperrt die Hochkant-Lage, die Unterschrift
   sagt „Quer halten“ — ein falscher Hinweis in einer bestehenden Funktion (klein). In Paket 10.
3. **Mindestens 14 Grenzen ohne gültigen Grund** stehen in keinem Paket (2.5). Nach Grundsatz 6
   („Benennen ersetzt nicht das Bauen“) braucht jede ein Paket oder einen Grund aus der Liste
   (fachlich, rechtlich, Datenschutz, Sicherheit, Altdaten, liegt bei jemand anderem).
4. **Grenzen, die der Plan neu benennt, ohne den Grund zu nennen:** S-8 (Paket 22: „als Grenze
   benennen“ — Grund laut Papier: der Anmeldedienst führt eine Adresse einmal), E-S („sonst als
   Grenze benennen“ — Grund fehlt), `baustellen_budget_lage` (Paket 1: „benannte Grenze“ — Grund
   Datenschutz, steht im Papier), A-13 als Einstellung (in Ordnung).
5. **G-10 „Stufe 1 / Stufe 2“** (Paket 20 d): beide Stufen stehen mit Aufwand im Paket — in
   Ordnung, solange Stufe 2 nicht „später“ wird. Als „Teil 1 / Teil 2 desselben Pakets“ schreiben.
6. **G-13 „erst nach der Kanzlei“, Z-10, Z-12, G-3, G-4, A-9:** gültiger Grund (liegt bei jemand
   anderem). In Ordnung.
7. **Pakete 20 (f) bis (h) „nach Entscheidung“, 17 (f), (g) „je eigene Entscheidung“, Paket 1
   „offene Entscheidung nur zu S-13“, Paket 16 „Empfehlung — …“:** veralteter Wortlaut — E-G12,
   E-Z3, E-Z11, E-S, E-E sind laut Abschnitt 8 entschieden. Dadurch fehlen dort Aufwand und Inhalt.
8. **Paket 22 S-4 „als Push“**, Paket 19 P-7: Push hängt am Gerät („Google hat angenommen heißt
   nicht erschienen“, E69) — als benannte Grenze mitführen.

**Grundsatz 4 („nicht überkomplizieren“):**

9. **Paket 12 „ein Kalenderbaustein für die vier Kalender“** (D4-B4, laut Papier „groß: vier
   Ansichten, Tastatur“): der größte Umbau des Pakets für eine Unstimmigkeit, die keinem Ablauf
   schadet; E76 hat drei der Kalender erst am 10.11. auf ganze Zellen gebracht. Einfacher: „heute“,
   Wochenende, Feiertag, Auswahl als gemeinsame Stilregel; Baustein nur, wenn die Messung danach
   noch Abweichungen zeigt.
10. **Paket 10 „Meine Baustellen öffnet die Baustelle des Monteurs“** (4.3 Nr. 12): größer als der
    Befund; der Vorschlag des Papiers (Aktionsleiste an der Karte) deckt den Ablauf.
11. **Paket 11 „Rechnung stellen in vier Schritten“:** ob vier Schritte (geführt, je Schritt eine
    Ansicht) oder eine Seite in vier erkennbaren Abschnitten gemeint ist, steht nicht da. Papier 11
    sagt „in erkennbarer Folge“ mit stehendem Summenblatt — das ist die einfachere Lösung und
    lässt „jede Rechnungsart, jeder Steuerfall“ unberührt.
12. **E-V1 (eine Zeilenhöhe je Schriftstufe):** berührt nach Papier 8 „jede Regel ohne eigene
    Zeilenhöhe“ (mittel bis groß) für eine Unruhe, die E97 bewusst gelassen hat. Empfehlung: nur
    die Fälle „in derselben Zeile“ (Module, Kundenakte) berichtigen; die ganze Skala erst nach
    Bildvergleich entscheiden.
13. **Umgekehrt zu knapp gefasst** (wäre „halb“): Paket 23 zu S-9 (4.2 Nr. 7); Paket 12 zu D4-C1;
    Paket 5 ohne die Ausnahmelisten der Wächter.

## 9. Genauigkeit und Aufwand je Paket

Maßstab: Kann ein Entwickler ohne Rückfrage anfangen (Dateien, Funktionen, Prüfung mit Gegenprobe,
„bleibt gleich“)? Aufwand: Plan gegen meine Einschätzung aus den Aufwänden der Papiere (k bis ½,
m bis 2 Tage, g mehr).

| Paket | Startklar? | Was fehlt | Aufwand Plan | plausibel? |
|---|---|---|---|---|
| 1 | **ja** | Quelle „34 Fälle“; `shared/` | 3–4 | knapp (13 Punkte, vier Migrationen, vier Wächter): eher 4–6 |
| 2 | weitgehend | G-5/G-6: wie der Stand der Vorschau übergeben wird (Parameter, alte Fassung); G-16: womit gemessen wird; A-4 | 4–5 | ja, wenn G-4 auf die Kanzlei wartet |
| 3 | weitgehend | S-6 („Hörer am Anmeldezustand“ — wo); Z-4 (wie das Büro es erfährt); Prüfungen außer P-1 | 4–5 | ja |
| 4 | zum Teil | Dateien und Funktionen je Punkt; M-15: wo die Einstellung steht | 4–5 | ja |
| 5 | **nein** | Liste der Formulare je PR; welche Form je Rolle (6.1 Nr. 7); Ausnahmelisten; Gegenproben der sieben Wächter; die „vier gemessenen Stellen“; Schritt 2 (6.2/4.3) | 6–8 | **zu knapp** — der Fuß berührt jedes Formular (drei PRs mit vollem Durchklick), dazu 13 V-Punkte und sieben Wächter: eher 12–15 |
| 6 | **nein** | Formatierer: welche Funktionen, welche Aufrufer; Wörterliste (die Wörter selbst); Geltung der Anrede; E-V1 bis V3 offen | 5–6 | **zu knapp** — allein E-V1 bis V3 sind laut Papier 8 „mittel bis groß“, „mittel“, „mittel“, je als eigener PR mit Bildvergleich aller Seiten: eher 10–14 |
| 7 | zum Teil | Zählweise des Wächters; Ausnahmeliste; Spaltenform von `ListRow`; Schnitt zu 8, 11, 13 | 8–10 | ja, wenn je Liste einmal umgebaut wird (5 Nr. 6) |
| 8 | zum Teil | die Liste der erlaubten Untertitel; je Fund das Ziel steht nur im Papier | 5–6 | knapp für 88 Funde mit je einer Zielprüfung: eher 8–10 |
| 9 | zum Teil | welche Attrappen (Papier 11: acht), Form des leeren Bestands, Übernahme der Messskripte ins Repo | 3–4 | knapp: eher 5–7 |
| 10 | **nein** | „Büro“ (Datenmodell, Rechte, Einstellung); Aufteilen beim Anlegen (Speichern mehrerer Buchungen — Papier: „mittel bis groß“); Baustellenansicht (4.3 Nr. 12); Prüfungen | 8–10 | zu knapp mit diesen drei Punkten |
| 11 | **nein** | Schnitt des Zerlegens (4.2 Nr. 8); „vier Schritte“ (8 Nr. 11); Mahnen in einem Zug (Sammelschritt ja/nein); Prüfungen je Punkt | 12–15 | ja für den Umbau, ohne das Zerlegen |
| 12 | **nein** | Feld „Tag“ (4.3 Nr. 13); E-M (4.3 Nr. 14); Kalenderbaustein (8 Nr. 9); Form der Krankmeldung (Menü an der Namenszelle wäre ein Menü außerhalb des Seitenkopfs — klären) | 7–9 | **zu knapp** mit Kalenderbaustein: eher 12–15 |
| 13 | **nein** | 28 Punkte in sieben Zeilen; welche Knöpfe aus welcher Zeile; D2-B2; Prüfungen | 8–10 | knapp |
| 14 | zum Teil | je Übergang: Ziel, Auslöser, anbieten oder führen; M-6 | 5–6 | ja |
| 15 | **nein** | alles außer der Aufzählung; V-7 | 5–6 | ja |
| 16 | **nein** | Speichermodell im Wortlaut (4.3 Nr. 16); Gliederung: Adressen, Navigation, Suche | 6–7 | knapp (D4-I2 allein „mittel–groß“) |
| 17 | zum Teil | je Teil: Tabellen, Funktionen, Prüfungen; Altdaten | 22–28 gesamt | ja |
| 18 | zum Teil | wie oben; A-8/A-9 hängen an K-4 | 12–14 | ja (Summe der Papiere: bis 15) |
| 19 | zum Teil | L-7: welche Funktionen melden; P-8: was auf dem Gerät liegt und wie es gelöscht wird | 8–10 | ja |
| 20 | zum Teil | (f) bis (h) ohne Aufwand und Inhalt | 18–21 + ? | offen |
| 21 | zum Teil | M-9: Belegart, Nummernkreis, Versand, Auskunft | 18–22 | ja |
| 22 | zum Teil | je Punkt Prüfung | 5–6 | knapp (S-3 und S-4 je „mittel“) |
| 23 | zum Teil | S-9 vollständig; was „geprobt“ heißt | 2–3 | ja |
| 24 | zum Teil | welche Stellen „toter Code“; welche Wege in WebKit | 4–5 | ja |
| 25 | zum Teil | je Punkt Messung vorher/nachher | 8–10 | ja |

**Summe:** 190 bis 235 Arbeitstage nach dem Plan (A 15–19, B 27–34, C 51–63, D 83–101 ohne G-3
und G-13, E 14–18); mit den Berichtigungen oben rund 225 bis 280. Der Plan nennt keine Summe; der
Auftraggeber sollte sie sehen.

**Startklar ohne Rückfrage:** Paket 1; mit kleinen Ergänzungen 2, 3, 4, 23. **Nicht startklar:**
5, 6, 10, 11, 12, 13, 15, 16. Für die Stufen D und E verweist der Plan auf die Papiere — dort
stehen Schritte, Prüfung und „bleibt gleich“ je Befund tatsächlich; dann muss der Plan das je
Paket ausdrücklich sagen („Bauanleitung: Papier n, Befund x; Abweichungen davon: …“) und die
Abweichungen aus 4.3 berichtigen, sonst gelten zwei Fassungen.

## 10. Abdeckung des Auftrags

| Teil des Auftrags | Abgedeckt? | Lücke |
|---|---|---|
| Code-Audit über das ganze Repo | zu rund zwei Dritteln | siehe unten |
| alle Bildschirme und Unterbildschirme | Grundzustände fast alle; Unterbildschirme lückenhaft | siehe unten |
| Ideen: intuitiver, hochwertiger, näher an Apple | ja (56) | — |
| Ideen zum **Zusammenspiel der Funktionen** | in den Papieren ja (58), **im Plan nein** | 2.5 |
| zu viel Text | ja (88, Regel, Wächter) | gemessen nur Grundzustand, 390 und 1440 px |
| statt der Trennpunkte | ja (51, Regel, Wächter) | Zahlen der Vermessung nicht belastbar (Abschnitt 3) |
| „mit einem genauen Implementierungsplan“ | für Stufe A ja, sonst Gliederung | Abschnitt 9 |

**Code, den kein Papier oder nur an einzelnen Stellen angesehen hat** (gesammelt aus den Abschnitten
„Nicht angesehen“ der Papiere 1 bis 7; Abschnitt 10 des Plans nennt davon neun):

- **Nachrichten** als Funktion (rund 3.600 Zeilen in `src/features/nachrichten`): Aufbewahrungslauf,
  Löschen, Export, Live-Kanal — nur Speicherregeln und Meldeweg (Papier 6). Kein Fachpapier.
- **Zeit:** `TimeForm.tsx` im Ganzen (1.944 Zeilen: Aufteilen, Einfügen, freie Zeitfelder),
  Betriebsurlaub, Arztbesuch, Nachweis-Upload, Stundennachweis-PDF, Zuschläge nicht nachgerechnet.
- **Auftragskette:** Kunden zusammenführen (nur Struktur), Kundenimport, UID-Prüfung, Papierkorb,
  Liegenschaften (Ansicht, Tops, Beteiligte, Regeln), Pläne und Dokumente, Summenrechnung der
  Angebote nicht nachgerechnet, **Wartungen** („diesmal nicht“ in Papier 2, in Papier 3 nur Laden
  und Speichern), Datenauskunft und Löschung für Angebote und Eingänge.
- **Planung und Scheine:** Rüstliste im Einzelnen, `scheinHash` App gegen Datenbank, Fotos und ihre
  Speicherregeln, Kalender-Abo, `push-melden` bis auf einen Zweig, Termine, Startseite
  (`regeln.ts`, `DashboardView.tsx`) nur stellenweise.
- **Geld:** PDF-Gestaltung und Pflichtangaben am gedruckten Blatt, XML der E-Rechnung,
  Belegarchiv, Bankgarantie- und E-Rechnungs-Dialog, SMTP, IBAN, **Zeilenschutz, Datenauskunft und
  Löschung der Tabellen `bank_buchungen` und `beleg_versand`** (ein Pflichtpunkt nach `CLAUDE.md`).
- **Material:** DATANORM-Leser, Lieferantenvergleich, Retoure-, Zähllisten-, Lagerort-Oberflächen,
  Materialdeckung, Datenauskunft und Löschung der Materialtabellen.
- **Grundlagen:** Benutzerverwaltung und Benutzerakte, Module (Durchsetzung je Modul in der
  Datenbank), „Mein Konto“, Sicherung, Plattform nur an einzelnen Stellen; `public/sw.js` (829
  Zeilen) nicht; `daten-ausleitung`, `konto-umstellen`, `betrieb-anlegen`, `nachrichten-aufraeumen`
  nur am Eingang; `package-lock.json` nicht.
- **Technik:** 149 Stellen mit verschlucktem Fehler nur zum Teil; 120 von 764 Quelldateien ohne
  Nennung in `tests/`; Handbuch und `docs/FUNKTIONEN.md` nicht gegen den Code; keine Messung von
  Ladezeiten, Indizes, Ausführungsplänen.
- Nichts lief: keine bestehende Prüfung, kein Stapel, kein Durchklick (Ausnahme: Papier 6 mit dem
  Wegwerf-Postgres, Papier 4 mit einer Prüfdatei).

**Bildschirme und Unterbildschirme, die nicht im Bild geprüft sind** (aus den Papieren 8 bis 12;
Abschnitt 10 des Plans nennt rund ein Drittel):

- gar nicht erreichbar: Anmeldung (leitet weiter), Zwei-Faktor-Seiten, erstes Passwort,
  Wiederherstellungscodes, Zählliste und Liegenschaftsakte in der Vermessung (Absturz), leerer
  Betrieb, Supporteinblick und Supportband, Verbindungsband, „Neue Fassung“, „Mein Fahrzeug“,
  Projektleiter mit `rechnungenLesen`;
- Fenster und Zustände: Rückfragen und Meldungen, Fenster außer dem der ersten Zeile, Menüs je
  Zeile, zweite Ebene in Fenstern, Schritte 2 bis 4 des Scheins (Papier 9 hat sie, die Vermessung
  nicht), Unterschriftsblatt, globale Suche, Wischaktionen, Ziehen bis zum Ablegen; Klärung,
  Bankgarantie, Stornorechnung, Rückzahlung, Mahnung per Mail; Angebot bearbeiten und „Neue
  Fassung“, Katalogsuche mit Treffern, Annahme-Link mit bestehendem Link, Zustände der Kundenseite
  („abgelehnt“, „zu viele Versuche“), Kundenimport, zweiter Schritt des Zusammenführens, Papierkorb
  mit Inhalt, Baustelle abschließen, Pläne mit Dateien; Umlagern, Kommissionsware,
  Bestellvorschläge und Fahrzeuge mit Daten, Retoure, Sammelleiste; Monat abschließen (Rückfrage),
  Betriebsurlaub, „Ende ändern“, Datenauskunft und Löschen einer Person, Teile der Plattform;
- Lade-, Fehler- und Leerzustände nur, wo die Attrappe sie zufällig liefert;
- Rollen Projektleiter, Verwaltung, Buchhaltung im Bereich Aufträge nur für Menüs und Zugriff;
- Tablet: fast überall nur Grundzustand und Reiter; 375 px, Querformat, Zwischenbreiten gar nicht;
  dunkel nur in Auswahl (Vermessung: überall, aber nur Kontrast); WebKit und echte Geräte nicht.

Größe der Lücke, grob: die Vermessung hat 863 Zustände erfasst, je Seite aber höchstens Hilfe,
⋯, Hauptaktion und das Fenster der ersten Zeile; die Papiere 9 bis 12 nennen zusammen — von mir
grob gezählt — 70 bis 80 Fenster, Dialoge und Zustände, die nur im Code gelesen oder gar nicht
gesehen wurden. Paket 9 schließt den Teil „nicht erreichbar“, **aber erst danach
kann der zweite Teil der Durchsicht dieser Bildschirme stattfinden** — der Plan sieht dafür
keinen Schritt vor.

**Ist das in Abschnitt 10 ehrlich und vollständig benannt?** Ehrlich ja, vollständig nein. Es
fehlen: Nachrichten, Wartungen, Liegenschaften, Benutzerverwaltung, Module, Zeilenschutz und
Auskunft der zwei neuen Geld-Tabellen, `TimeForm`, die verschluckten Fehler, das Handbuch, die
Rollen, das Tablet, WebKit, die 58 Ideen, die 45 Verdachtsfälle ohne Paket, der offene Punkt aus
Stand §117 — und der Satz, dass die Belege der Papiere (Bilder, Messdaten, Skripte) in einem
Arbeitsverzeichnis liegen, das nicht dauerhaft ist.

## 11. Was im Plan zu ändern ist

Vor Paket 1 einzuarbeiten: 4, 5, 22, 26, 27. Vor Stufe B: 1 bis 3, 6 bis 21, 23 bis 25. Die
übrigen (28 bis 32) bei der Überarbeitung des Plans.

1. **Abschnitt 2, Regel 3** ersetzen durch: „Vor Stufe B wird das Funktionsinventar auf den
   heutigen Stand gebracht (`node scripts/funktionsinventar.mjs` → neue Vorher-Datei nach E99) und
   der Vergleich zählt je Datei, wie oft ein Schlüssel vorkommt; sinkt eine Zahl, braucht es einen
   Eintrag mit Grund. Gegenprobe: einen von 16 ‚Speichern‘-Knöpfen entfernen → rot.“
2. **Abschnitt 2, Regel 5** ersetzen durch: „Paket 9 (vorgezogen) baut das Werkzeug: Routenliste
   aus `navigation.ts`, je Seite Hilfe, ⋯, Hauptaktion, erste Zeile und deren ⋯, hell und dunkel,
   390/834/1440; Ablage der Vorher-Bilder; die Messungen der Vermessung (Flucht, Tastfläche,
   Punkte je Zeile, Wörter über dem Falz) als Skripte im Repo unter `tools/vorschau/`.“ Und in
   1.3 sowie Abschnitt 7: **Paket 9 ist das erste Paket der Stufe B.**
3. **Abschnitt 2, neue Regel 11:** „Ein Vorschlag, der eine Aktion oder Angabe einen Tipp weiter
   weg legt, steht mit ‚vorher n, nachher m Tipps‘ im PR und im Paket; ohne Zustimmung des
   Auftraggebers wird er nicht gebaut.“ Dazu die Liste aus 7.2 in die Pakete 5, 7, 11, 12, 13.
4. **Abschnitt 2, neue Regel 12:** „Jede neue Tabelle oder Funktion folgt `CLAUDE.md`, Sicherheit
   und Daten (Funktionsrechte, Zeilenschutz über `(select app.lesebetrieb())`, Datenauskunft und
   Löschung, `edge-shared-uebernehmen.mjs`); jede geänderte Datenbankfunktion verträgt eine ältere
   App-Fassung; jedes Paket zieht Handbuch (Stempel) und Stand nach.“
5. **1.3 und Abschnitt 7, Reihenfolge:** „L-9 (Bau bei jedem PR) und L-4 Schritt 1 vor Paket 2;
   das verhaltensgleiche Herauslösen der Fenster aus `InvoicesView` (L-12: Mahnlauf, Zahlung,
   Export/E-Rechnung, Stornieren — je ein PR, `InvoicesView.test.tsx` unverändert grün) vor Stufe
   B; L-11 (Büro-Geldwege und Tablet in WebKit) vor Stufe C.“ Paket 11: den Satz „Dazu zuerst
   `InvoicesView` in Teile zerlegen (Liste, Erstellen, …)“ durch den Verweis darauf ersetzen.
6. **Stufe B umschneiden:** Pakete 7 und 8 liefern Regel, Bausteine und Wächter mit Ausnahmeliste
   der heutigen Fundstellen; umgestellt wird je Liste bzw. Seite einmal in Stufe C (Pfeil, Punkte,
   Text, Knöpfe in einem PR). Die Zeilen „mit Paket 7“ in den Paketen 8 und 13 entfallen.
7. **4.1, Satz zu V-B4 bis V-B11:** V-B8 streichen mit dem Vermerk „durch E96 entschieden: die
   Balken der Monatsansicht bleiben“; V-B5, V-B9, V-B11 als „entschieden bzw. gewollt, keine
   Änderung ohne neue Entscheidung“ führen.
8. **Paket 5, Schritt 5 und Punkte-Zeile:** „D2-A9 (a) wird nicht gebaut (E76, bestätigt durch
   E-N); gebaut wird D2-A9 (b) — das eingezogene Zeichen folgt der Aktion.“ Abschnitt 8, E-N um
   „ändert E76 für das Tagesfenster“ ergänzen.
9. **Paket 5, Schritt 1:** „am Handy über die Breite“ ersetzen durch „am Handy kompakt rechts,
   Nebenweg links (`style.md` Z. 117); volle Breite nur bei einem einzelnen Abschluss
   (Anmeldung, ‚Antrag einreichen‘)“.
10. **Paket 5, Schritte 6 und 7:** ergänzen „Ausnahmen des Tastflächen-Wächters: `Button klein`
    (36 px), Monatsraster (E88, bis E-M gebaut ist), Verweis im Fließtext; D2-A16 entfällt als
    Fehler oder wird als Entscheidung vorgelegt“.
11. **Abschnitt 5, Regel 6 und Pakete 8/13:** „Ein Blatt ohne Inhalt steht zugeklappt oder als ein
    Satz — ausgenommen Karten, deren Leersatz den nächsten Schritt trägt (E99: Nachrichten,
    Einsätze; D2-I9).“ Paket 13: „D2-I10 nur als Reihenfolge am Handy, kein Zusammenlegen“.
12. **Paket 16, E-E, Wortlaut:** „Der Schalter bleibt überall Schalter (E95). Einstellungsseiten
    tragen **eine** Speicherleiste je Seite, die die geänderten Blätter nennt; ein Schalter in
    einem solchen Blatt zeigt bis zum Speichern ‚noch nicht gespeichert‘. Sofort wirken Schalter
    nur auf Seiten ohne weitere Felder (Module, Mein Konto). Gespeichert wird weiter je Blatt; ein
    Blatt mit Fehler hält die übrigen nicht auf.“
13. **Paket 6, E-D:** „Anrede ‚du‘ in der Bedienoberfläche für angemeldete Nutzer. Unverändert
    ‚Sie‘: Kundenseite der Annahme, Mailtexte, alle Belege.“ Mit eigener Prüfung.
14. **Paket 10:** Zeile „Voraussetzung“ ergänzen; „Meine Baustellen“ nach D1-C5 (Aktionsleiste an
    der Karte, Verweis auf den nächsten Einsatz); der Leistungsumfang kommt mit A-10 in Paket 18.
    D1-I1 und D1-I10 entweder aus der Punkte-Zeile oder aus „Später“ streichen. D1-A20, D1-A21,
    D1-I8 aufnehmen. Für D1-C2 und D1-C7 je eine Entscheidung in Abschnitt 8.
15. **Paket 12:** „Im Fenster ‚Einsatz bearbeiten‘ stehen ‚Verschieben …‘, ‚Auf … kopieren‘,
    ‚Entfernen …‘ im ⋯ (U4); das Feld ‚Tag‘ heißt ‚Tag ansehen‘ oder entfällt. Das Feld verschiebt
    nichts.“ E-M neu fassen (seitlich rollende Spalten ab 44 px oder Handyform bis 1.199 px) und
    neu vorlegen. Kalenderbaustein als eigene Entscheidung (8 Nr. 9). D4-A14 ist drin; D4-A5, A8,
    A12, A13 einem Paket zuordnen. `einsatzbalken.test.ts` unter „bleibt gleich“.
16. **Paket 5, Schritt 2:** nach D2-B3: „‚Neu‘-Fenster behalten den Entwurf und sagen es (‚Entwurf
    von vorhin — verwerfen‘); Rückfrage nur beim Bearbeiten; ein leeres Fenster schließt ohne
    Frage.“ Oder als Entscheidung in Abschnitt 8.
17. **Paket 14:** Regel umformulieren: „Die Meldung trägt den nächsten Schritt als Verweis; die
    App wechselt die Seite nur, wo sie es heute schon tut oder wo kein zweiter Vorgang derselben
    Art folgt.“ M-6 ganz nach Paket 21 (b). D2-C14 aufnehmen.
18. **Paket 15:** „Bleibt gleich“ und Prüfungen ergänzen (alte Weiterleitungen, jeder
    Anmeldeschritt, „Abmelden“ auf jeder Zwischenseite, `pruefen:links`); V-7 (`ErrorBoundary`)
    ausdrücklich aufnehmen; 4.1: „= D4-A3“ streichen; 4.2: Ursache von D4-A3 auf `guards.tsx`.
19. **Paket 23:** S-9 vollständig (Actions auf Commit-Kennung, GitHub-Umgebung, Grenze mit Grund
    in `CLAUDE.md`/`DEPLOYMENT.md`, Wächter über die Workflow-Dateien).
20. **Paket 11 / 21:** D3-C6 „Bestellen …“ nach M-9 oder M-9 vorziehen; Paket 11 Schritt ③ nach
    G-11; „vier Schritte“ durch „eine Seite in vier Abschnitten mit stehendem Summenblatt
    (D3-C1)“ ersetzen oder die geführte Form begründen. Paket 20 (g): „der Kontoauszug-Abgleich
    folgt dem eingestellten Nummernschema (G-1)“.
21. **Abschnitt 3.8** ersetzen durch eine Tabelle aller Grenzen, die ein Papier für nicht (mehr)
    begründet hält, je mit Paket oder gültigem Grund — einschließlich der 14 aus 2.5; „158“ durch
    die nachgezählte Zahl ersetzen.
22. **Neuer Abschnitt „Verdachtsfälle“:** die 45 mit Papier, Kurztext, Paket, „geklärt vor Beginn
    von Paket n“. Papier 6 V-4 (Realtime) und Papier 4 V-4 (`rechnung_ersetzen`) vor Paket 1
    klären; den Satz in 3.6 um den offenen Verdacht ergänzen.
23. **Neuer Abschnitt „Ideen zum Zusammenspiel“** (Papiere 1 bis 7, je §5, 58 Ideen): je Idee
    „deckt sich mit Befund x / Paket n“, „später“, „nicht“ — und als Entscheidung vorlegen.
24. **Abschnitt 8 ergänzen** um die Fragen, die der Plan heute stillschweigend beantwortet:
    Zähler am Kartentitel (rechts oder in Klammern; E98/E99), Form des Gruppenkopfs (6.1 Nr. 7),
    Dauer („240,0 h“ gegen „HH:MM Std“), Liste „Später“, abweichender Rechnungsempfänger /
    Sammelrechnung, „leerer Eintritt wird heute“ (Stand §117), Empfänger „Büro“, Aufteilen beim
    Anlegen, Kalenderbaustein, Radius der Rückfrage (Papier 8 §9: 16 oder 24 px ungeregelt).
25. **Zuordnung berichtigen:** die 15 Kürzel aus 2.1 einem Paket zuordnen oder mit Grund ablehnen;
    die Doppelnennungen aus 2.4 auflösen (je „Teil … hier“); V-4, V-16, V-B11 in die Punkte-Zeilen.
26. **Veralteten Wortlaut bereinigen:** Kopf Z. 6 und Abschnitt 8 („Abschnitt 11“ gibt es nicht);
    Paket 1 („offene Entscheidung nur zu S-13“); Paket 16 („Empfehlung — …“); Paket 17 (f), (g)
    und Paket 20 (f) bis (h) („nach Entscheidung“ — mit Inhalt und Aufwand füllen).
27. **1.2:** D3-6 aus „Stille Falschzahlen“ nach „Oberfläche“ verschieben; „zwei davon …
    nachgestellt“ ersetzen durch „S-1 an einer Wegwerf-Datenbank gemessen, Z-2 durch ein Skript
    über die Migrationsreihenfolge gefunden, Z-1 gelesen“.
28. **Legende der Kennzeichen:** ◆ an alle gemessenen V-Befunde, an Z-5, L-4, L-13; bei S-13
    „◆ zum Teil“. Oder für die Oberfläche ein eigenes Zeichen „gemessen“.
29. **Abschnitt 6:** Zählweise festlegen („je sichtbarer Textzeile, ohne `aria-label`“); die
    Zahlen 736 und 60 bis zur Klärung als „nicht widerspruchsfrei“ kennzeichnen; „Meist ein oder
    zwei“ durch die Verteilung ersetzen; in die Ausnahmeliste die Kontaktzeile der Annahmeseite
    und die Zählzeile der Schublade (E96) aufnehmen; `Angaben` als neuen Baustein führen, nicht
    als vorhandenen; sagen, wo eine Nummer gerahmt (Stempel) und wo ungerahmt (Baustein `Nummer`,
    V-B3) steht.
30. **Paket 5, Prüfungen:** „heute rot an sieben Fenstern“ durch die benannte Liste ersetzen;
    je Wächter die Gegenprobe nennen.
31. **Abschnitt 10** vervollständigen nach Abschnitt 10 dieses Berichts; dazu ein Schritt „zweite
    Durchsicht der bisher nicht erreichbaren Bildschirme nach Paket 9“ und die Sicherung der
    Belege (Bilder, Rohdaten, Skripte) an einem dauerhaften Ort.
32. **Summe und Stufen** der Aufwände in 1.3 nennen; die Aufwände der Pakete 5, 6, 8, 9, 10, 12
    nach Abschnitt 9 berichtigen; je Paket der Stufen D und E den Satz „Bauanleitung: Papier n,
    Befunde …; ‚bleibt gleich‘ und Prüfungen wie dort“ und die Voraussetzungen als eigene Zeile.
