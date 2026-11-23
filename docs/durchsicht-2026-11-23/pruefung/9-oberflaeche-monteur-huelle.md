# Gegenprüfung: `analyse/9-oberflaeche-monteur-huelle.md` — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740.

**Womit geprüft:** Vorschau (`http://localhost:5199/tools/vorschau/`) mit eigenen
Playwright-Skripten (Chromium 1243, `hasTouch`, `de-AT`, Europe/Vienna) bei 390×844,
390×1300, 375×667 und 1440×900; Rollen Mitarbeiter, Verwaltung, Administrator;
`getBoundingClientRect`/`getComputedStyle` je Befund selbst gemessen, keine Zahl aus dem
Papier übernommen. Dazu Quelltext (`src/`), Prüfungen (`tests/`), Regelwerk
(`CLAUDE.md` „Oberfläche“, `docs/design/v10/style.md`, E82/E86/E90–E99 in
`docs/ui-umbau/entscheidungen.md`, `docs/stand-2026-10-03.md` §112–§118). Die
vorgeschlagenen Zeilenformen aus Abschnitt 7 des Papiers wurden mit den Schriften und
Klassen der App bei 375 px nachgebaut und vermessen (`psim.mjs`). Skripte und Bilder:
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-d1/`
(`r.mjs`, `mat.mjs`, `a17.mjs`, `huelle.mjs`, `psim.mjs`, Bilder in `b/`). Der Autor hat
keine Daten im Browser eingespeist (kein `page.route` in `audit/D1`); wo ein Befund trotzdem
an den Beispieldaten der Vorschau hängt, steht es dabei.

## 1. Ergebnis in Zahlen

88 Befunde (A 22, B 15, C 9, T 25, P 17) und 18 Ideen.

| Urteil | Anzahl | Welche |
|---|---:|---|
| bestätigt (nachgestellt) | 59 | A1–A4, A6–A12, A14, A15, A19 · B1–B3, B5–B11, B13–B15 · C1–C9 · T2, T3, T5, T6, T9–T12, T15, T19–T21, T24, T25 · P2, P5–P7, P11, P14–P17 |
| bestätigt (am Code) | 9 | A20, A22 · B4 · T1, T7, T13, T14, T18, T23 |
| teilweise | 20 | A5, A13, A16, A17, A18, A21 · B12 · T4, T8, T16, T17, T22 · P1, P3, P4, P8, P9, P10, P12, P13 |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

„Bestätigt“ heißt: Messwert und Beleg stimmen. Es heißt **nicht**, dass der Vorschlag
ohne Weiteres gebaut werden kann — bei etlichen bestätigten Befunden steht in der letzten
Spalte ein Risiko oder ein Widerspruch zu einer Entscheidung. Die 18 Ideen sind nicht
„bestätigt“, sondern auf Risiko geprüft (Abschnitt 2.4): bei 8 fehlt ein Vorbehalt oder
sie stoßen an eine Regel (I1, I2, I4, I8, I13, I16, I17, I18).

Tippzahlen der sieben Aufgaben: selbst durchgetippt und gezählt sind „Arbeitstag starten“
(1), „drei Artikel anfordern“ (7) und „morgen im Plan“ (2 plus Rollen); „Urlaub“ (7) an den
Bildschirmen Schritt für Schritt nachvollzogen; die übrigen drei („zwei Baustellen“ ~17,
„Schein“ ~12, „Foto ans Büro“ 6) nur an den beteiligten Blättern nachvollzogen — plausibel,
nicht Tipp für Tipp gezählt.

## 2. Je Befund

### 2.1 A — Fehler gegen die Linie

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko, fehlendes „bleibt gleich“, Widerspruch; Quelle der Regel |
|---|---|---|---|
| D1-A1 | bestätigt (nachgestellt) | `/time` 390: `.wisch-knopf` 88 px, `white-space: normal`, Polster 16+16, Rand 1 → 55 px; der Textknoten „Löschen“ liegt in **2 Zeilen**. `lot-bewegung.css:191`. Zwei Aufrufer: `TimeView.tsx:706` („Löschen“), `AdminOrdersView.tsx:1229` („Aus Lager“, „Abgeholt“) | **Quelle:** E82 („bricht … zwischen zwei Wörtern um … in einem Wort nie“) — dort nur für die Aktionsleiste umgesetzt. Vorschlag taugt; die Wischweite misst die Breite der Aktion (`useWischen.tsx:75`), wächst also mit. Bleibt: `Wischen.test.tsx`, B-Prüfung „echter Finger“ |
| D1-A2 | bestätigt (nachgestellt) | Blatt „Eintrag bearbeiten“, ans Ende gerollt: „Eintrag löschen“ 141×48 (y 693–741, Wort `rgb(180,35,24)`, 1 px Rand), darunter „Abbrechen“ / „Änderungen speichern“ ab y 768. `TimeView.tsx:1189–1193` (`variant="danger"` als Eigenschaft `loeschen`), gerendert `TimeForm.tsx:1846` | **Quelle:** U4 (style.md). Der Wächter `bedienregeln.test.ts:193` sieht den Knopf nicht, weil er als Eigenschaft durchgereicht wird. **Achtung:** U7 (§112) hat das Löschen bewusst ins Blatt gelegt; `TimeView.test.tsx:1368` klickt genau diesen Knopf, `zeitVerlauf.spec.ts:59` ebenso — beide und das Funktionsinventar nachziehen. Berufsschulzeilen haben kein Blatt (siehe A5) |
| D1-A3 | bestätigt (nachgestellt) | „Neuer Eintrag“: Kopflinie 237,2, erster Knopf 237,2 (0 px); „Eintrag bearbeiten“: „Datum“ 0 px. `.blatt-inhalt` `padding-top: 0` (`lot.css:78`), `.fenster-inhalt` 16 px (`lot.css:127`; gemessen in „Antrag stellen“ 247 → 263) | **Umfang:** von 66 `BottomSheet`-Aufrufen haben 64 einen Titel, **genau einer** davon kein `auchBreit`: `TimeView.tsx:1161`. Es ist also ein Blatt, nicht „jedes“. Der Vorschlag am Baustein ist trotzdem richtig (schützt künftige Blätter); „Mehr“ (ohne Titel) bleibt unberührt |
| D1-A4 | bestätigt (nachgestellt) | Beschriftung `rgb(19,38,44)` statt `rgb(90,109,114)`; Feldrand `rgb(223,231,233)` statt `rgb(194,210,213)`. `TimeForm.tsx:1159–1187`. Die 2 px Versatz nicht gemessen | **Quelle:** style.md Farbtabelle („Kräftige Linie … Feldränder“). Der Vorsatz ist **nicht** fest „WN-“, sondern `kennzeichenVorsatz` je Betrieb, und fehlt er, trägt das Feld das ganze Kennzeichen (`TimeForm.tsx:1163–1178`). Bleibt zusätzlich: `ohneKennzeichenVorsatz` beim Tippen, `datalist` der Fahrzeuge |
| D1-A5 | teilweise | Wertspalte gemessen an 58 Zeilen: 54 bei x 358, **3 bei x 298, 1 bei x 242**. Die Berufsschulzeile trägt Zustand, Wert und Papierkorb **rechtsbündig** in einer zweiten Reihe (Papierkorb x 310–358), nicht „links unter dem Titel“; x 210 ließ sich nicht nachstellen. Die vierte Zeile ist ein Zeitausgleich mit „vom Büro gebucht“ rechts — im Papier nicht genannt | **Vorschlag nimmt eine Funktion weg:** Berufsschulzeilen sind nicht bearbeitbar (`TimeView.tsx:651–657`), öffnen also kein Blatt; der Papierkorb ist dort der einzige Weg ohne Geste. Ohne ihn bliebe nur das Wischen — die Wischaktion ist `inert`, solange nicht gewischt wurde, für Tastatur und Vorlesehilfe also weg. „Bleibt: … im Blatt“ stimmt für diese Zeilen nicht |
| D1-A6 | bestätigt (nachgestellt) | `/worksheet` Schritt 1, 390×844: `.aktionsleiste` y 702–774, `nav.unten` y 774–836 → 0 px. Timer-Leiste auf `/material` y 716–766 → 8 px | **Quelle schwach:** E98 regelt den Abstand der Inseln zum Rand, nicht den der Leiste zur Insel; getragen nur vom 8er-Rhythmus und vom Vergleich mit der Timer-Leiste. **Risiko:** die Leiste klebt (`sticky`) in der Karte; 8 px Luft darunter lassen den rollenden Inhalt der Karte im Spalt durchscheinen. `blattKanten.test.ts:23, 40, 205` halten die Regeln der Leiste fest. Dasselbe gilt für die Korbleiste (y 709–774) |
| D1-A7 | bestätigt (nachgestellt) | Karte oben 270, `h2.titel-karte` 278 (8 px); die übrigen Karten 24 px. `WorkSheetView.tsx:1347–1355`: `Card` ohne `title`, Kopf von Hand im Körper (`pt-2`) | Bleibt (E90): Name, Nummer, Abrechnung, Adresse und „ändern“ einmal. Der Kartenkopf hat `min-height: 72px` und zentriert — mit zweizeiligem Namen prüfen |
| D1-A8 | bestätigt (nachgestellt) | Unterkante „Zeit beim Kunden eintragen“ 844,5 = Oberkante „Mitarbeiter“ 844,5 (bei 390×1300) | ohne Einwand |
| D1-A9 | bestätigt (nachgestellt) | Feld 94 px (innen 68), Platzhalter braucht 202 px; Raster `94px 72px 88px 48px`; bei 375: 79 px. `OrderView.tsx:736` | Kommentar dort (E74): „in jeder Breite in einer Reihe mit den Feldern“ — der Vorschlag hält den Kreis in der Reihe mit Menge und Einheit, das passt |
| D1-A10 | bestätigt (nachgestellt) | Kopf unten 438, Satz ab 439 (1 px), danach 0 px bis zur ersten Zeile (das `pb-2` liegt im Satz) | ohne Einwand; mit P8 abstimmen (rechte Seite des Kartenkopfs) |
| D1-A11 | bestätigt (nachgestellt) | vier `.anpassen-pfeil` 44×44, `border-radius: 0px`, Rand 1 px | **Quelle:** Radien nach Rolle (CLAUDE.md). ohne Einwand |
| D1-A12 | bestätigt (nachgestellt) | `.neu-nr` auf der ganzen Unterzeile: IBM Plex Mono 13 px samt Adresse. `lot-nachrichten.css:331`, `NeueNachricht.tsx:182` | **Quelle:** style.md Typografie. ohne Einwand |
| D1-A13 | teilweise | Knopf 196×60, gesperrt, zweizeilig — Messwert stimmt | **Kein Fehler gegen die Linie:** der Umbruch zwischen zwei Wörtern ist die Entscheidung E82 (12.11.2026) für genau diesen Knopf (`index.css:1327–1334`: „bricht … zwischen zwei Wörtern um … abgeschnitten wird nichts mehr“). Eine Regel „einzeilig“ gibt es nicht → Idee. „Abschließen“ sichtbar bei langem Vorlesenamen ist zulässig (Name enthält das sichtbare Wort); Handbuch und Texte der Prüfungen nachziehen |
| D1-A14 | bestätigt (nachgestellt) | vier `li.zeile` ohne Ziel, nur der Stift 48×48 reagiert | **Quelle:** CLAUDE.md „ganze Zeilen antippbar“, E99 (Pfeil). „Baustelle und Tag“ öffnet zusätzlich die Auswahl (`WorkSheetView.tsx:1891`) — bleibt. Vorlesenamen „… ändern“ in Prüfungen nachziehen |
| D1-A15 | bestätigt (nachgestellt) | „und 6 weitere →“ als `a.start-weiter`, 13 px. `start/Handlungsbedarf.tsx:93, 98`, `start/HeuteListe.tsx:29` | **Umfang unvollständig:** vierte Stelle `RuestlisteAbhaken.tsx:227`. Zwei der vier (`Handlungsbedarf.tsx:98`, `RuestlisteAbhaken.tsx:227`) klappen **an Ort und Stelle auf** — dort wäre „›“ falsch (es heißt „öffnet etwas“). Quelle nur sinngemäß (E97 „Verweis … ›“, E99) |
| D1-A16 | teilweise | Text steht: `NachrichtenView.tsx:224` | „Thread“ ist kein Rest, sondern **das Wort der App**: sichtbar an mindestens neun weiteren Stellen („Thread öffnen“ `BaustelleNachrichten.tsx:59`, „Zum Thread“ `NachrichtAktionen.tsx:148`, „Du folgst diesem Thread“, Fehlermeldungen, Hilfe, `module.ts:391`), sechsmal im Handbuch, in `style.md` selbst. Nur den Untertitel zu ändern schafft eine neue Unstimmigkeit — und T1 streicht diesen Untertitel ohnehin. Gehört als ein Eintrag in die Wörterliste (Paket 6): überall oder nirgends |
| D1-A17 | teilweise | Wirkung nachgestellt: nach dem Öffnen `scrollY` 224, `h1` bei y −122, „← Nachrichten“ bei −160, Kopfinsel „Perl Installationen GmbH“ — in 6 von 7 Läufen, auch nach 6 s | **Ursache im Papier falsch:** das Gespräch nutzt am Handy `PageHeader` (`NachrichtenView.tsx:211–219`), und der ruft `useKopfTitel` (`PageHeader.tsx:137`). Nach **eigenem Rollen** steht der Titel sofort in der Kopfinsel (gemessen: y 0 → 268 → „Max Mustermann“); in 1 von 7 Läufen kam er von selbst. Der Fehler liegt im Baustein `KopfTitel.tsx` (der Beobachter verpasst den Sprung ans Ende beim Öffnen), nicht in einer fehlenden Meldung. Folge für den Vorschlag: nicht „Titel melden“, sondern den Beobachter richten — das kann jede Seite treffen, die mit gemerkter Rollposition öffnet. In der Vorschau kommen Daten sofort; am echten Stand gegenprüfen |
| D1-A18 | teilweise | „Zeiten / · 08:30 Std“ steht so im Fenster | **Folge der Beispieldaten:** `tools/vorschau/daten.ts:147` liefert `mitarbeiterName`, die Ansicht liest `z.mitarbeiter` (`WorkSheetsListView.tsx:1763`). In der App ist der Name beim Eintragen Pflicht (`LeistungszeitErfassen.tsx:103`). Kein Fehler der App; die Attrappe gehört zu Paket 9. Die Teile zu filtern schadet nicht |
| D1-A19 | bestätigt (nachgestellt) | `aside.navi` 900 px hoch, Inhalt 949 (Mitarbeiter), 1.087 (Verwaltung), 1.449 (Administrator). Unter dem Rand: Mitarbeiter nur „Datenschutz · Impressum“ und die Marke; **schon bei Verwaltung** „Problem melden“ (872–916), Darstellung, „Abmelden“ | **Widerspruch im weitergehenden Teil des Vorschlags:** E92 hält fest „der Schalter in der Navigation bleibt der schnelle Weg“ (Darstellung), style.md „Markenzeichen und Navigation“: der Senklot „erscheint zusätzlich dezent am unteren Navigationsrand“. Beides aus der Leiste zu nehmen braucht eine Entscheidung. Der Plan nennt nur „Seitenleiste rollt in sich“ — das ist die sichere Fassung. Rechtstexte: siehe T24 |
| D1-A20 | bestätigt (am Code) | `NeueFassung.tsx:212`: `fixed inset-x-0 bottom-0 z-30`, schwebend erst ab `sm:` (640 px); `.unten` ebenfalls `z-index: 30` (`lot.css:502`). In der Vorschau nicht auslösbar | **Quelle:** Breiten 759/760 (CLAUDE.md). Der Kommentar dort („über der unteren Leiste, aber unterhalb von Dialogen“) zeigt die Absicht; Bleibt: unter Rückfragen |
| D1-A21 | teilweise | Meldung x 16–374, y 16–84, Radius 12; Kopfinsel x 8–382, y 8–62, Radius 24 — Messwert stimmt | **Keine Regel verletzt:** oben ist Absicht (G29, `lot.css:136–142`), das Papier nennt es selbst „Grenzfall“. Gehört zu den Ideen. Unter der Insel läge die Meldung auf Seitentitel, „Hilfe“ und ⋯ |
| D1-A22 | bestätigt (am Code) | Attribute im Bild ausgelesen: „Pause“, „Wegzeit“ `type=number` ohne `inputmode`; Kennzeichen, Helfer, „Suchen oder springen“ ohne jede Angabe. `enterKeyHint` einmal im Code (`ZaehllisteView.tsx:355`). Zeilen im Papier um 1–3 versetzt (z. B. `Postfach.tsx:133`, `BaustellenSuche.tsx:128`) | Die Wirkung am iPhone ist hier nicht prüfbar. **Risiko im Plan** („über `InputField` … Zahl, Dezimal“): `inputMode="numeric"` hat am iPhone weder Komma noch Minus — für jedes Zahlenfeld mit Nachkommastellen muss es `decimal` sein; nicht pauschal aus `type="number"` ableiten |

### 2.2 B — Unstimmigkeiten

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D1-B1 | bestätigt (nachgestellt) | Startseite: dreigeteilte Leiste „Anfordern / Nachricht / Schein“; Einsatzplan: „Zeit erfassen“, „Schein schreiben“, dann Adresse, Telefon, „Anfordern“, „Nachricht“ | **Quelle:** U3. Der Vorschlag widerspricht sich: „dieselbe Leiste wie auf der Startseite“ hat drei Wege, „bleibt: jede der fünf Aktionen“ verlangt „Zeit erfassen“ dazu — auf der Startseite trägt den Weg die Arbeitstagkarte (U3), im Einsatzplan gibt es sie nicht. Form für vier Wege vorher festlegen |
| D1-B2 | bestätigt (nachgestellt) | `.zeile-nr` Plex Mono 12 px mit Rahmen; `.nr` DM Sans 13 px; `.neu-nr` Plex Mono 13 px | **Vorschlag würde verschlimmbessern:** `.nr` ist die allgemeine Klasse „nicht am Bindestrich umbrechen“ (U8, `index.css:1423`) und liegt auch auf **Telefonnummern** (`Kontakt.tsx`), Mengen (`LagerDialoge.tsx`, `AdminOrdersView.tsx`), Prozentsätzen (`BasiszinsZentral.tsx`), Datum (`TerminListe.tsx`), dem Text „ohne Baustelle“ (`AufteilenDialog.tsx`) und jedem `OhneUmbruch` — 26 Stellen. Mono nur über einen eigenen Baustein „Nummer“ (so nennt es der Plan unter V-B3) |
| D1-B3 | bestätigt (nachgestellt) | Zeitblatt: „Abbrechen“ 16–156, „Zeit buchen“ 164–374, beim Öffnen bei y 1.426; Retoure: 104–215 / 223–374; „Antrag stellen“: ein Knopf 16–374; Schein-Fenster: ⋯ 16–64, … | Zwei der vier Formen sind entschieden: 2 : 3 in der Aktionsleiste ist E72 (Speichern-Knopf springt sonst in der Breite, `index.css:1310–1316`); ein einzelner Abschluss über die Breite erlaubt style.md ausdrücklich. Siehe Abschnitt 4 zum Fuß |
| D1-B4 | bestätigt (am Code) | `<Pflichthinweis` in 7 Dateien; `pflicht` in 69; `TimeForm.tsx` 11 Pflichtfelder ohne Legende | keine Regel dazu (U5 nimmt nur den Stern vom Warnzeichen aus) — Entscheidung nötig, nicht „Fehler“ |
| D1-B5 | bestätigt (nachgestellt) | „0:00:00“ (Uhr), „Arbeit bisher … h“ (`ArbeitstagKarte.tsx:209`), „08:30 Std“, „09:00“ ohne Einheit, „240 h kalkuliert“ | Die Uhr des Arbeitstags (H:MM:SS) ist keine Dauerangabe im Sinn des Formatierers — ausnehmen |
| D1-B6 | bestätigt (nachgestellt) | „Mo, 23.11.“, „Di., 24.11.2026“, „Di, 24.11.“, „Einsätze am Mo., 23.11.2026“, „Montag, 23.11.2026“, „Montag 23.11. · heute“, „09.11.2026 13:42“ | „Jahr nur, wenn nicht das laufende“: in der Zeitliste (Vorjahre) und um den Jahreswechsel prüfen; Vorlesenamen behalten das volle Datum |
| D1-B7 | bestätigt (nachgestellt) | Monat: Pfeile x 24–72 und 318–366, Titel 15/500; Team-Woche: Pfeile x 16–64 und 246–294 am Titel | ohne Einwand |
| D1-B8 | bestätigt (nachgestellt) | `.mehr-gruppe` 12/400/versal/1,68 px; `.neu-abschnitt` 12/500/normal. Suchfenster und „Danach“ nicht gemessen | E92 nennt „leise Versalmarken in 400“ |
| D1-B9 | bestätigt (nachgestellt) | „Zu erledigen (10)“, „Meine Anforderungen (2)“, „Dein Einsatz heute · 4 Einsätze“, „noch 1 von 2“ | siehe P8 |
| D1-B10 | bestätigt (nachgestellt) | Kopf- und Fußinsel `rgb(243,246,246)`, Timer-Leiste `rgb(255,255,255)`, alle mit `0 4px 12px -4px` | Vorbehalt des Papiers ist vollständig |
| D1-B11 | bestätigt (nachgestellt) | erste „Aufgabe“ `border-left: 0`, die unter „Danach“ 2 px `rgb(194,210,213)`, 16 px Einzug | Der erste ist bewusst so (E90, `lot-start.css:138–142`); „alle wie der erste“ passt dazu |
| D1-B12 | teilweise | zwei Kästchen („Zahlen oben“), sechs Schalter, ein „Speichern“ — stimmt | **Durch Entscheidung so gewollt:** E95 behält Kästchen für die „Auswahl aus einer Liste“; `schalterRegel.test.ts:89` führt genau diese zwei mit dem Grund „höchstens vier Kennzahlen aus der Liste wählen“. „Überall Schalter“ widerspräche E95 → Idee, braucht eine Entscheidung |
| D1-B13 | bestätigt (nachgestellt) | Schalter in `aside.navi` nur mit `aria-label="Dunkle Darstellung"`, kein sichtbares Wort | siehe A19 (E92) |
| D1-B14 | bestätigt (nachgestellt) | „Mehr“: „Einstellungen“; Profil: „Mein Konto“ mit `Icon name="bell"` (`Layout.tsx:754–757`) | Bleibt-Satz des Papiers reicht; Suchfenster listet beide Namen — mit umstellen |
| D1-B15 | bestätigt (nachgestellt) | Zeitblatt: Fuß bleibt auch nach Rollen im Blatt `position: static`; Retoure: Fuß y 786–834 bei Inhalt bis 828 (6 px angeschnitten) | **Ursache genauer als im Papier:** `Aktionsleiste` mit `erstNachDemRollen` (G22, `TimeForm.tsx:1856`) hört nur auf das Rollen des **Fensters** (`Aktionsleiste.tsx:76`); im Blatt rollt `.blatt-inhalt` — die Leiste wird nie frei. Die Absicht steht im Kommentar („Die Knöpfe kleben am Telefon unten“) und in U1 Nr. 3 |

### 2.3 C — Bedienung

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D1-C1 | bestätigt (nachgestellt) | „Neuer Eintrag“ 390×844: Inhalt 1.249 px in 591 px; „Zeit buchen“ bei y 1.426 | Ursache wie B15. Der kleine Weg (im Blatt ohne `erstNachDemRollen`, oder auf den Rollbehälter hören) löst C1 und B15, ohne jedes Formular anzufassen. Bleibt: G22 für das Formular auf der Seite (Tablet, Schreibtisch) |
| D1-C2 | bestätigt (nachgestellt) | „Auf mehrere Baustellen aufteilen …“ nur im Blatt „Eintrag bearbeiten“ | Vorbehalt „fachlich abstimmen“ fehlt im Plan (Paket 10). Offene Fragen: mehrere Buchungen ohne Netz (Ausgangsfach), Jugendschutz- und Abschlussprüfungen je Teil |
| D1-C3 | bestätigt (nachgestellt) | nach Tipp auf „3 Artikel für …“: `scrollY` 1.312, `.korb` y −34 bis 31, Knöpfe y −25 bis 23, Kopfinsel y 8–62; Notizfeld bei y 158 | „Fest über der Fußinsel“: die Korbleiste stößt heute schon an die Insel (wie A6) und läge mit der Timer-Leiste doppelt. „Bis wann“ ist ein neues Datenfeld (Datenbank, Sicht des Büros), keine reine Oberfläche. Siehe Abschnitt 4 („statt Notiz“) |
| D1-C4 | bestätigt (nachgestellt) | Knopf gesperrt, kein Grund am Knopf; `WorkSheetView.tsx:1264` (`!bereit …`) | Acht Bedingungen sperren den Knopf (`WorkSheetView.tsx:783–788, 1264`: Baustelle, Unterschrift Monteur, Unterschrift Kunde, Kundenname, Menge fehlt, Entwurf lädt, Foto läuft, Eingetipptes nicht übernommen) — die Zeile muss jede nennen können |
| D1-C5 | bestätigt (nachgestellt) | Verweise der Seite: nur Google Maps und `tel:` | Plan weicht vom Papier ab (Abschnitt 4) |
| D1-C6 | bestätigt (nachgestellt) | vor und nach dem Tipp auf „Dienstag, 24. November“: `scrollY` 0, Titel „Einsätze am …“ bei y 846, Fußinsel ab 774 | **Risiko beim bloßen Rollen:** nach jedem Tipp verschwindet der Kalender; wer zwei Tage vergleicht, muss jedes Mal zurückrollen. Nur zusammen mit der eingeklappten Woche bauen |
| D1-C7 | bestätigt (nachgestellt) | „Neue Nachricht“: Personen mit Rolle, kein „Büro“; Menü am Beitrag nur mit `aria-label` (`NachrichtLeiste.tsx:73`) | Zeichen ohne Wort erlaubt style.md („Alle Iconbuttons benötigen verständliche `aria-label`“) → Idee. Die Runde „Büro“ ist eine neue Funktion (Mitgliedschaft folgt der Rolle, Rechte, Datenauskunft); Vorbehalt „fachlich“ fehlt im Plan |
| D1-C8 | bestätigt (nachgestellt) | Fenster x 16–374, y **101**–622 (Papier: 156), Radius 16, kein Knopf, keine Lupe | ohne Einwand; Bleibt-Liste vollständig |
| D1-C9 | bestätigt (nachgestellt) | Meldung im Bild; „Zeitsitzung verwerfen“ `ArbeitstagKarte.tsx:288`; „Kein Startdatum konfiguriert“ `TimeView.tsx:881` | siehe T4, T6, T7 |

### 2.4 I — Ideen (auf Risiko geprüft, nicht bestätigt)

| Kürzel | Sachgrundlage | Risiko, Widerspruch, fehlender Vorbehalt |
|---|---|---|
| D1-I1 | Leiste heute nur bei laufendem Tag | Vorbehalt unvollständig: stapelt sich mit Korbleiste, Aktionsleiste und dem mitfliegenden Knopf (`lot-bewegung.css:111` schaltet dessen Form an der Timer-Leiste); auf `/material` drei schwebende Flächen übereinander. Nur mit Timer-Modul |
| D1-I2 | — | Stößt an U3 („keine Aktion doppelt“): „← Nachrichten“ im Seitenkopf und „‹“ in der Kopfinsel wären bis zum Rollen beide im Bild. Der Betrieb steht dort mit Absicht (`Layout.tsx:468–473`) |
| D1-I3 | — | Bewegungen nur über `transform`/Deckkraft (§112, B1–B12); der Titel in der Insel bleibt `aria-hidden` |
| D1-I4 | — | „Fläche `--auswahl`“ beim Drücken widerspricht E92 („Zeigen ist nicht Wählen“) — `--hover-flaeche` nehmen |
| D1-I5 | 80 `:hover`-Regeln in `src/styles`, keine mit `(hover: hover)`; Tailwind geschützt (`tailwind.config.js:65`) | E96 („beim Darüberfahren voll Petrol“) am Tablet mit Maus muss bleiben |
| D1-I6 | kein `apple-touch-startup-image` | `index.html` trägt eine CSP-Prüfsumme (§114) und den Wächter `petrolFarben.test.ts` — mitziehen |
| D1-I7 | kein `setAppBadge` | Die Zahl muss auch sinken, wenn auf einem anderen Gerät gelesen wird — braucht den Push-Weg; „klein“ ist knapp |
| D1-I8 | `manifest.webmanifest:8` `portrait`; Hinweis `SignaturePad.tsx:645–647` | Vorbehalt unvollständig: ohne Sperre dreht sich die **ganze** installierte App; ein Android-Handy ist quer breiter als 760 px und zeigt dann die Tablet-Ansicht mit Seitenleiste bei rund 400 px Höhe. Einfacher: den Hinweis nur zeigen, wo Drehen geht |
| D1-I9 | — | Kontrast in `lotGrundwerte.test.ts` mitmessen |
| D1-I10 | — | ohne Einwand |
| D1-I11 | — | Wächter `aktualisierenRegel.test.ts` |
| D1-I12 | — | trifft alle 66 Blätter; volle Höhe mit offener Tastatur am iPhone am Gerät prüfen |
| D1-I13 | `langDruck.ts` für Nachrichten | Vorbehalt fehlt: die Zeile ist ein Verweis — iOS zeigt bei langem Drücken sein eigenes Menü; dazu Textauswahl und die Wischgeste (F15) |
| D1-I14 | „09.11.2026 13:42“ je Gespräch | ohne Einwand; Vorlesename mit vollem Datum |
| D1-I15 | — | Vorbehalt vollständig |
| D1-I16 | Satz steht `RuestlisteAbhaken.tsx:232` | Der Satz sagt zweierlei: der Haken **bucht Bestand ab**, und Zurücknehmen geht **nur heute**. Ein „Rückgängig“ in der Meldung (3,5–7 s) ersetzt das Zurücknehmen am selben Tag nicht; die Meldung muss die Buchung nennen |
| D1-I17 | — | Widerspricht style.md („Der laufende Arbeitstag steht direkt unter den Kennzahlen“, „kompakte Kennzahlenleiste“); die Leiste trägt bis zu vier wählbare Zahlen, nicht immer eine |
| D1-I18 | Profil-Blatt: „… Fassung vorschau · App erneuern · Datenschutz · Impressum“ | Rechtstexte nicht tiefer legen als heute (siehe T24) |

### 2.5 T — Zu viel Text

„Steht so da“ ist bei allen 25 bestätigt (Vorschau oder Quelltext). Das Urteil gilt der
Frage, ob der Text entbehrlich ist.

| Kürzel | Urteil | Eigener Beleg | Entbehrlich? Wo bliebe die Auskunft? |
|---|---|---|---|
| D1-T1 | bestätigt (am Code) | alle zehn Untertitel wörtlich in `src`; `PageHeader.tsx:127–135` blendet Text-Untertitel am Handy schon aus (E86) | ja; es dehnt E86 auf Tablet und Schreibtisch aus (E-T entschieden). Drei Prüfungen hängen an Wortlauten |
| D1-T2 | bestätigt (nachgestellt) | „Montag, 23.11.2026 · Rolle: Mitarbeiter“; `DashboardView.tsx:356` | ja; im Support-Einblick bleibt es (`rolleAnzeige.ts`, G21) — das Papier sagt das |
| D1-T3 | bestätigt (nachgestellt) | Startseite 2×, Einsatzplan je Rüstliste | mit Vorbehalt: siehe I16 |
| D1-T4 | teilweise | steht in der Vorschau | **Dort Folge der Attrappe:** das Stammdatenblatt lädt nicht („konnte nicht geladen werden“ — im Papier selbst als Nicht-Befund geführt), also rechnet der Saldo nicht. In der App steht der Satz nur bei einem Konto ohne Startdatum — dann ist er die Auskunft („ehrliche Zustände“, E92; `TimeView.test.tsx:444`). Umformulieren ja („konfiguriert“), Kennzahl verstecken nein |
| D1-T5 | bestätigt (nachgestellt) | „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“ | ja; der Zusatz kann zwei weitere Glieder tragen („beides“, „24./31.12. ab 12 Uhr“, `TimeView.tsx:905–909`) — der Wert ist die Vereinigung, nicht die Summe |
| D1-T6 | bestätigt (nachgestellt) | Meldung im Bild; `zeitsitzungStand.ts:170` | ja; `Arbeitstag.test.tsx:214–230` und `m06Zeit.spec.ts:86` prüfen den Wortlaut |
| D1-T7 | bestätigt (am Code) | `ArbeitstagKarte.tsx:288` | ja; `Arbeitstag.test.tsx:129` |
| D1-T8 | teilweise | Beschriftungen stehen so | (1) Der Satz „Ohne Baustelle zählt …“ steht **schon nur** bei `baustelleFrei` (`TimeForm.tsx:1746`). (2) „(wird am Schein vorgeschlagen)“ schützt: der Kommentar geht auf den Kundenbeleg (`TimeForm.tsx:1792–1798`, offene Punkte A6) — als Hinweis **am Feld sichtbar** lassen, nicht in die Sammelhilfe |
| D1-T9 | bestätigt (nachgestellt) | „B-2026-0147 · 03.08.2026 · 240 h kalkuliert“ | ja; das Datum ist der Zeitraum (Beginn, ggf. „– Ende“) |
| D1-T10 | bestätigt (nachgestellt) | `OrderView.tsx:905`; im Blatt steht „Nur Neues wird gutgeschrieben …“ | ja |
| D1-T11 | bestätigt (nachgestellt) | Titel und Satz `OrderView.tsx:885` | ja, **erst nach** C3 |
| D1-T12 | bestätigt (nachgestellt) | „Zeiten am 23.11.2026 · 00:00 Std“ und Leersatz | ja; die Kurzfassung behält „ohne Stunden geht auch“ |
| D1-T13 | bestätigt (am Code) | `MaterialErfassen.tsx:185, 347` | ja |
| D1-T14 | bestätigt (am Code) | `WorkSheetView.tsx:1760`; Gesundheitssatz `:1696` | ja; der Gesundheitssatz bleibt |
| D1-T15 | bestätigt (nachgestellt) | „Prüfsumme / Entsteht mit der Unterschrift.“ am Entwurf | ja |
| D1-T16 | teilweise | `VacationsView.tsx:1782` | Der Satz **schützt vor Schaden** (Reise buchen vor der Entscheidung) — nach Regel 3 des Plans bliebe er offen. Vertretbar nur, weil er im Fenster des Antrags schon steht (`AntragFenster.tsx:101`); „in die Hilfe“ allein reicht nicht |
| D1-T17 | teilweise | steht im Blatt | **Schon bedingt:** nur bei `stand.ausAnfangsbestand` (`VacationsView.tsx:1649–1650`); der Kommentar begründet ihn („eine richtige Zahl mit falscher Erklärung ist auch eine falsche Auskunft“). In der Vorschau steht er, weil die Beispieldaten einen Umstiegsstand haben. Übrig bleibt nur „als Hinweis an der Maßlinie“ |
| D1-T18 | bestätigt (am Code) | `NotificationSettings.tsx:515`; nur Hell/Dunkel/System wählbar | ja — der Name steht aber in `CLAUDE.md`, `style.md` (Dark Mode) und E92; dort mitziehen |
| D1-T19 | bestätigt (nachgestellt) | „Eingerichtet am 01.10.2026, 08:00 / Zuletzt abgeholt am 02.10.2026, 22:15“ | ja, beide im Fenster |
| D1-T20 | bestätigt (nachgestellt) | „Einsätze geplant / Heute / Feiertag (AT)“ | mit Vorbehalt: ohne Legende ist das Zeichen des Feiertags für Sehende unerklärt — der gewählte Tag muss den Namen zeigen |
| D1-T21 | bestätigt (nachgestellt) | „09.11.2026 13:42“; Titel 149 px breit | ja (I14) |
| D1-T22 | teilweise | `Verbindungsband.tsx:76–77`, 155 Zeichen | **Vorgeschlagener Kurztext ist falsch:** „Eingaben werden vorgemerkt“ gilt nur für Zeitbuchung, Anforderung und Handwerksschein (`Layout.tsx:808–810`); Urlaub, Nachricht, Rüstliste werden nicht vorgemerkt. Der heutige zweite Satz sagt genau deshalb „zeigt die jeweilige Bestätigung, ob …“. Kürzen ja, aber ohne dieses Versprechen |
| D1-T23 | bestätigt (am Code) | `Layout.tsx:804–814`, rund 300 Zeichen | U9 lässt den Text in einer Rückfrage offen („Grundlage der Entscheidung“), und er schützt vor Datenverlust. Kürzen nur, wenn bleibt: was liegt da, es geht erst nach Anmeldung auf **diesem** Gerät hinaus |
| D1-T24 | bestätigt (nachgestellt) | Profil-Blatt endet mit „Fassung vorschau · App erneuern · Datenschutz · Impressum“ | „Datenschutz · Impressum“: Grenze mit Grund **rechtlich** (Impressum leicht und unmittelbar erreichbar, § 5 ECG) — nicht hinter mehr Schritte legen als heute (zwei) |
| D1-T25 | bestätigt (nachgestellt) | 375 px: Name der Baustelle 78 px sichtbar von 336 | siehe P1 |

### 2.6 P — Statt der Punkte

Nachbau bei 375 px (Zeile 343 px, innen 311 px), lange Namen aus den Beispieldaten.
Heute: Zeitzeile 72 px (zwei Textzeilen, Name gekürzt), mit Zustand 101,5 px (bei 390 px
gemessen); erster Einsatz der Startseite Titel 48 px (zwei Zeilen) plus Meta 18 px, zusammen
66 px Text; Katalogzeilen 95 / 96 / 72 px. Höhen der Zeilen samt ihrem Polster (24 px).

| Kürzel | Urteil | Beispiel stimmt? | Trägt die Form bei 375 px mit langen Namen? |
|---|---|---|---|
| D1-P1 | teilweise | ja | Mit umbrechendem Namen **drei Textzeilen** (88 px statt 72); mit Kürzung zwei (66 px). Das Muster nennt keinen Platz für das, was heute rechts steht: Zustand („verrechnet“, „Monat abgeschlossen“), Marke „KI“, Nacht-/Notdienstzeichen, die Knöpfe „Krankmeldung“, Antrag, „Korrektur anfragen“ — mit einem Zustand in der zweiten Zeile werden es vier Textzeilen (110 px). **Nutzen überschätzt:** die 55 Zeilen der Vorschau sind vier Buchungen je Tag („doppelt gebucht“ — im Papier selbst als Nicht-Befund geführt); bei einer Buchung je Tag bleibt je Tag ein Kopf **und** eine Zeile |
| D1-P2 | bestätigt (nachgestellt) | ja | 88 px, drei Textzeilen bei langem Namen — wie heute, nicht schlechter |
| D1-P3 | teilweise | ja | Form trägt (86 px). Es fehlen im Muster: „Teilnehmer: …“, die Notiz („Heizkörper, 2 Paletten“) und der Kartenverweis (48 px Tastfläche), die heute in der Zeile stehen |
| D1-P4 | teilweise | ja | **Trägt nicht:** Zeit rechts in der Titelzeile lässt dem Namen 200 px; „Wohnungseigentümergemeinschaft Hauptstraße 112–118“ samt Stempel braucht vier Zeilen (96 px Text), heute drei (66 px Text). Selbst „Familie Huber“ schiebt den Stempel in die zweite Zeile |
| D1-P5 | bestätigt (nachgestellt) | ja | nicht nachgebaut; Wertpaare gibt es in den Akten |
| D1-P6 | bestätigt (nachgestellt) | ja | weitere Glieder beachten (T5) |
| D1-P7 | bestätigt (nachgestellt) | ja („07:00–16:30 · 30 min P…“) | ohne Einwand |
| D1-P8 | teilweise | ja | „Eine Form für alle Karten“ stößt an E98: die Klappkarten tragen „die Zahl im Titel“ (und E99: „3 Rechnungen“ im Kopf, bewusst). Rechts im Kopf stehen schon Verweise („Mein Einsatzplan“), „i“ und der Neu-Knopf — bei 375 px wird es eng |
| D1-P9 | teilweise | ja | Die Dachzeile nennt auf jeder Seite den Bereich („AUFTRÄGE“, „TEAM“, „MATERIAL“); „START“ zu streichen bricht dieses Muster an einer Stelle |
| D1-P10 | teilweise | ja | 88 / **110** / 88 px gegen 95 / 96 / 72 heute — „Thermostatventil Heimeier Eclipse DN15“ wird vierzeilig. Das Wort „knapp“ muss bleiben (Zustände als Text; im Papier selbst als „nicht entbehrlich“ geführt). Ein nackter Bestand „4 Stk“ direkt vor dem Kreis steht dort, wo nach dem Tipp die **Mengensteuerung** erscheint (E89) — Verwechslung von Bestand und angeforderter Menge |
| D1-P11 | bestätigt (nachgestellt) | ja | Zeilenzahl wie heute (Name, Notiz, Zustände) |
| D1-P12 | teilweise | ja | „10 Tage“ verliert die Art: „Urlaubstage“ heißt „verbraucht Urlaub“ (`VacationsView.tsx:108–114`), Zeitausgleich zählt Stunden |
| D1-P13 | teilweise | ja (Postfach) | Trägt (66 px, zwei Zeilen). Im **Kopf des Gesprächs** ist es am Handy schon so gebaut (E86, `NachrichtenView.tsx:196–207`) |
| D1-P14 | bestätigt (nachgestellt) | ja | nicht nachgebaut |
| D1-P15 | bestätigt (nachgestellt) | ja | bleibt |
| D1-P16 | bestätigt (nachgestellt) | ja | ohne Einwand |
| D1-P17 | bestätigt (nachgestellt) | ja | bleibt (E91) |

## 3. Nicht bestätigt — im Einzelnen

**D1-A5.** Papier: Wert bei x 210, „links unter dem Titel“. Gefunden: x 298, rechtsbündig vor
dem Papierkorb; dazu eine vierte abweichende Zeile (Zeitausgleich, x 242). Zu ändern: im
Papier die Messwerte; der Vorschlag darf den Papierkorb an Berufsschulzeilen nur
entfernen, wenn diese Zeilen ein anderes sichtbares Ziel zum Löschen bekommen.

**D1-A13.** Papier: „Soll: Knopf einzeilig“. Gefunden: E82 hat den Umbruch für genau diesen
Knopf entschieden. Zu ändern: aus den Fehlern in die Ideen; im Plan aus der Reihe
„D1-A4 bis A14“ (Paket 10) herausnehmen oder als Entscheidung führen.

**D1-A16.** Papier: englischer Rest im Seitenkopf. Gefunden: „Thread“ ist an zehn sichtbaren
Stellen, im Handbuch und im Regelwerk das Wort für das Gespräch einer Baustelle. Zu
ändern: im Plan (4.2 und Paket 6) als Eintrag der Wörterliste — alle Stellen oder keine.

**D1-A17.** Papier und Plan: „Gespräch meldet seinen Titel nicht über `useKopfTitel`“.
Gefunden: es meldet ihn (über `PageHeader`); nach eigenem Rollen steht der Titel in der
Kopfinsel. Nur beim Öffnen, wenn die Seite ans Ende springt, bleibt die Insel in 6 von 7
Läufen beim Betrieb. Zu ändern: Ursache in Papier und Plan (Zeile D1-A17, Paket 10 erster
Punkt): Fehler im Beobachter von `KopfTitel.tsx`, als Baustein in Paket 5; Prüfung „Titel
steht in der Insel, wenn die Seite gerollt öffnet“.

**D1-A18.** Papier: Text beginnt mit „·“. Gefunden: Schlüssel der Beispieldaten
(`mitarbeiterName` statt `mitarbeiter`). Zu ändern: nach Paket 9 (Attrappe richten); in
Paket 7 höchstens als Absicherung.

**D1-A21.** Papier: Grenzfall. Gefunden: keine Regel, oben ist Absicht (G29). Zu ändern: zu
den Ideen.

**D1-B12.** Papier: „überall Schalter (E95)“. Gefunden: E95 und `schalterRegel.test.ts:89`
begründen genau diese Kästchen. Zu ändern: aus Paket 10 („D1-B10 bis B13“) nehmen oder
dem Auftraggeber als Frage vorlegen.

**D1-T4, T8, T16, T17, T22.** Je in der Tabelle. Zu ändern im Plan, Abschnitt 5:
„Kein Startdatum konfiguriert“ aus Muster 5 nicht streichen, sondern umformulieren;
„Rechnungsquelle“ ist schon bedingt; in die Liste „Ausdrücklich bleiben“ aufnehmen:
„(wird am Schein vorgeschlagen)“ als Hinweis am Feld, „bitte noch nichts fix buchen“ im
Fenster des Antrags, „Der Anspruch ist der Restanspruch beim Umstieg.“, der zweite Satz
des Verbindungsbands dem Sinn nach, die Rückfrage beim Abmelden, „Datenschutz · Impressum“
in zwei Schritten.

**D1-P1, P3, P4, P8, P9, P10, P12, P13.** Je in der Tabelle. Zu ändern im Plan, Abschnitt 6
und Paket 7: P4 und P10 in der beschriebenen Form nicht bauen (vierzeilig bei 375 px); P1
erst mit Platz für Zustand und Knöpfe und mit Messung an echten Tagen (eine bis zwei
Buchungen je Tag); P8 mit Ausnahme der Klappkarten (E98) oder neuer Entscheidung; P12 mit
der Art des Antrags.

## 4. Zum Plan

**Falsche oder unscharfe Kurztexte (4.2)**
- D1-A17: Ursache falsch (siehe oben).
- D1-A3: „Blättern ohne `auchBreit`“ — es ist ein Blatt (`TimeView.tsx:1161`).
- D1-A19: „(Abmelden unter dem Rand)“ gilt für Verwaltung und Administrator, nicht für den
  Monteur (dort nur Rechtstexte und Marke).
- D1-A16: siehe oben.

**Zuordnung**
- D1-A20 und A21 stehen in 4.2 unter Paket 10, fehlen aber in dessen Punkteliste; D1-I5
  steht im Text von Paket 10, nicht in den Punkten; D1-I16/I18 stehen in Paket 8, I17 und
  I9, I11 in keinem Paket und nicht unter „Später“.
- „D1-A4 bis A14“ in Paket 10 schließt A13 (entschieden durch E82) ein; „D1-B10 bis B13“
  schließt B12 (E95) ein.
- D1-C1 und C9 stehen in zwei Paketen (5 und 10 bzw. 6 und 10) — eines streichen.

**Paket 5, Schritt 1 („ein Fuß“) — vor dem Bauen klären**
- „am Handy über die Breite“ widerspricht style.md („kompakt und inhaltsabhängig rechts
  … volle Breite nur dort, wo ein einzelner klarer Abschluss dies verlangt“) und dem
  Papier (B3: „kompakt rechts“).
- „`Fensteraktionen` als einzige Form“ lässt offen, was aus der klebenden `Speicherleiste`
  wird, die U1 Nr. 3 für Formulare vorschreibt („in einem Blatt klebt sie am unteren Rand
  des Blatts“). Sonst entsteht eine fünfte Form.
- Was gleich bleiben muss und fehlt: E72 (feste Anteile 2 : 3, damit „Gespeichert“ den
  Knopf nicht springen lässt, `premium.spec`), E82 (Umbruch nur zwischen Wörtern), G22
  (das Zeitformular **auf der Seite** klebt erst nach dem Rollen), die sechs Namen der
  Hauptaktion des Zeitformulars, `blattKanten.test.ts`.
- Für C1/B15 genügt der kleine Eingriff an `Aktionsleiste`/`TimeForm` (Abschnitt 2.3).

**Paket 6**
- Tastaturen über `InputField`: `numeric` nur für ganze Zahlen ohne Vorzeichen, sonst
  `decimal`. Das Kennzeichen ist heute kein `InputField` (A4 zuerst).
- Formatierer „Dauer HH:MM Std“: die Uhr des Arbeitstags ausnehmen.

**Paket 7**
- D1-B2 nicht über `.nr` (26 Stellen, auch Telefonnummern), sondern über den Baustein
  „Nummer“ aus V-B3.
- „Zeitliste (D1-P1, der größte Hebel)“ stützt sich auf die vierfach gebuchten Tage der
  Vorschau. Voraussetzung ergänzen: Paket 9 (Bestand mit echten Tagen) vor der Messung.
- Regel 5 aus Abschnitt 5 („höchstens zwei Textzeilen“) und P1 („Name darf umbrechen“)
  schließen sich bei langen Namen aus — eines von beiden festlegen.
- „Zähler rechts im Kartenkopf … eine Form für alle Karten“ gegen E98/E99 (Zahl im Titel
  der Klappkarten, „3 Rechnungen“ im Kopf).
- Der Wächter „höchstens ein Punkt je Zeile“ trifft heute auch den Zuschlag-Zusatz (bis
  vier Punkte) und die Termin-Zeilen; Ausnahmeliste entsprechend.

**Paket 8**
- T22: der Kurztext wäre eine falsche Zusage. T4, T8, T16, T17, T23, T24: siehe Abschnitt 3.
- T18 zieht `CLAUDE.md`, `style.md` und Handbuch nach sich.
- Prüfungen mit festem Wortlaut: T1 (3 Dateien), T4 (`TimeView.test.tsx:444–449`), T6
  (`Arbeitstag.test.tsx`, `m06Zeit.spec.ts`), T7.

**Paket 10**
- D1-C3: „‚Brauche ich bis‘ als Feld … **statt Notiz**“ — das Papier behält die Notiz
  („die Notiz und ein Feld ‚bis wann‘“). Die „Notiz für die Projektleitung“ ist eine
  bestehende Funktion; „statt“ nähme sie weg. Das neue Feld braucht Datenbank und die Sicht
  des Büros — als Voraussetzung nennen.
- D1-C5: der Plan baut eine lesende Baustellenansicht für den Monteur („Leistungsumfang
  aus A-10, eigene Scheine“), das Papier nur die Wegeleiste und einen Verweis. Der Plan
  hängt damit an A-10 und an Leserechten des Monteurs — Voraussetzung fehlt.
- D1-C6: „Nächste Einsätze öffnen das Einsatz-Fenster“ — für den Monteur gibt es keines;
  das Fenster der Leitung (E98) trägt „Bearbeiten“ und „Baustelle öffnen“, die er nicht
  haben darf.
- D1-C2 und C7: die Vorbehalte „fachlich“ des Papiers fehlen.
- D1-I2 (zwei Rückwege, U3) und I4 (`--auswahl` beim Drücken, E92) wie in 2.4.
- D1-A5: Papierkorb der Berufsschulzeile.
- D1-B1: vier Wege, nicht drei.
- D1-A19 (Paket 5): nur „rollt in sich“ bauen; Schalter und Marke bleiben in der Leiste,
  solange E92 und style.md gelten.

**Vorschläge, die eine bestehende Funktion entfernen oder schwerer erreichbar machen
würden:** A5 (Löschen einer Berufsschulbuchung ohne Geste), C3 in der Fassung des Plans
(Notiz), T24/A19 (Rechtstexte tiefer), I18 („App erneuern“ eine Ebene tiefer — vertretbar),
T4 (Hinweis auf nicht eingerichteten Saldo), T22 (Auskunft, was vorgemerkt wird), P12 (Art
des Antrags), P3 (Teilnehmer, Notiz, Kartenverweis), P1 (Zustand und Knöpfe der Zeile).

## 5. Geklärte Verdachtsfälle

- **Kennzahl „Resturlaub“** (Papier: Ziel nicht ablesbar): führt nach `/vacations`
  (`start/aufbau.ts:219`; im Bild `href="/vacations"`).
- **„Nachricht“ am Einsatz führt ins Postfach** (Papier: am echten Stand prüfen): der Code
  öffnet das Gespräch der Baustelle (`Einsatzaktionen.tsx:246–249`, `kanalBaustelle`); in
  der Vorschau liefert die Attrappe keine Kennung. Kein Fehler der App.
- **D1-A18** leerer Name: Beispieldaten (siehe oben).
- **D1-T4** in der Vorschau: Folge des nicht ladenden Stammdatenblatts. Nebenbei gesehen,
  nicht Teil des Papiers: lädt das Stammdatenblatt nicht, zeigt die App die Fehlermeldung
  **und** weiter „Kein Startdatum konfiguriert“ (`TimeView.tsx:879–881`; die Prüfung
  `TimeView.test.tsx:491–504` verlangt nur die Meldung).
- **D1-A3** „die übrigen Aufrufe per Suche prüfen“: geprüft, es gibt keinen weiteren.

## 6. Nicht geprüft

- Breite 834 px und der dunkle Satz (Abschnitt „Dunkler Satz“ des Papiers) — nicht
  nachgemessen; Aussagen des Papiers dazu ungeprüft.
- A4: die 2 px Höhenversatz. A20: nicht im Bild (die Leiste lässt sich in der Vorschau
  nicht auslösen). A22: die tatsächliche Tastatur am iPhone.
- B8: Größen im Suchfenster und unter „Danach“. C7: das Menü am Beitrag nur im Code, das
  lange Drücken nicht ausgelöst.
- Tippzahlen der Aufgaben 2, 4 und 7 nicht Tipp für Tipp gezählt.
- P5, P6, P7, P11, P12, P14 nicht bei 375 px nachgebaut; der Vorlesetext der neuen Formen
  ist nicht prüfbar, solange sie nicht gebaut sind (heutiger Vorlesename der Zeitzeile
  gemessen: Datum, Zeit, Kunde, Nummer, „bearbeiten“).
- Die Liste „Was passt und so bleiben soll“ nur in Stichproben (Seitenrand 16 px,
  Blattradius 16 px ohne Schatten, Inseln 24 px mit `0 4px 12px -4px`, Blatt von unten
  24 px, Seitentitel 28/400 Serif, Kartentitel 18/500, Fenstertitel 20/500 — stimmen).
- Die Zahl im Plan „Fuß im Bild — heute rot an sieben Fenstern“; WebKit; echtes Gerät;
  `/_muster`.
- Die Ideen wurden nicht gebaut; geprüft ist nur, woran sie stoßen.
