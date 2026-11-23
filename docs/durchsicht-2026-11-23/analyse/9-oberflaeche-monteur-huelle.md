# Der Monteur am Handy (und Tablet) und die Hülle der App — Oberfläche, Arbeitspapier zur Durchsicht vom 23.11.2026

Stand: `main` fa6e740, Vorschau mit Beispieldaten (`tools/vorschau`, Rolle `Mitarbeiter`; für den Arbeitstag zusätzlich `&module=zeiterfassung.timer,zeiterfassung.korrekturantraege`). Breiten: 390×844 (Handy, mit Berührung; für lange Blätter zusätzlich 390×1300), 834×1112 (Tablet), 1440×900 (Schreibtisch). Dunkler Satz am Handy.

Bilder und Messprotokolle liegen unter
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/D1/` — Bilder in `b/` (unten nur der Dateiname), Messwerte in `s01.log` … `s10.log`, Skripte `s0x.mjs`, `ex.mjs`, `lib.mjs`.

Kürzel der Befunde: `D1-A…` Fehler gegen die Linie, `D1-B…` Unstimmigkeit, `D1-C…` Bedienung, `D1-I…` Idee, `D1-T…` zu viel Text, `D1-P…` Trennpunkte.

**Was nicht als Befund zählt** (Vorschau): Datumsfelder im US-Format („11/23/2026“, „07:00 AM“ — der Testbrowser zeichnet englisch, die App hält die Gerätesprache für deutsch), „Dein Stammdatenblatt konnte nicht geladen werden“, „doppelt gebucht“ an jeder Zeile, Gespräch „mit sich selbst“, doppelte Einsätze derselben Baustelle, „Timer-Schritt … vorgemerkt“ bei jedem Timerschritt (die Attrappe meldet „ohne Netz“), getönte Zeile nach einem Klick (Mauszeiger des Testbrowsers).

**Was passt und so bleiben soll** (gemessen, damit es beim Umbau nicht verloren geht): Seitenrand am Handy 16 px links und rechts auf allen 11 Seiten; Abstand zwischen Blättern überall 24 px; Blattradius 16 px, kein Schatten an Blättern, Zeilen, Feldern; Kopf- und Fußinsel 24 px Radius, derselbe Schatten (`0 4px 12px -4px`), je 8 px zum Rand; Blatt von unten 24 px oben, Rückfrage 16 px, Menü 12 px; Seitentitel 28 px Source Serif 4 / 400, Kartentitel 18 / 500, Fenstertitel 20 / 500; im Inhalt nur 12 / 13 / 15 / 16 px (E97), Felder 16 px; alle Knöpfe, Reiter, Kalendertage, Reaktionen ≥ 44 px (Zeilen über `::after` ganz antippbar); kein waagrechtes Schieben auf 390 / 834 / 1440; „Arbeitstag starten“ auf der Startseite ist **ein** Tipp mit vorbelegter Baustelle.

## 1. Angesehen

| Route | Rolle | Breiten | Geöffnet |
|---|---|---|---|
| `/` Startseite | Mitarbeiter | 390, 834, 1440, dunkel 390 | ohne und mit Timer-Modul; Arbeitstag bereit / läuft / Pause / Stopp → Prüfblatt; „Baustelle wechseln“; „Arbeitstag verwerfen …“; „Hilfe zu dieser Seite“; ⋯ → „Startseite anpassen …“; Sprünge „Anfordern / Nachricht / Schein“, „Wie zuletzt buchen“, „Resturlaub“, „Tag ohne Buchung“; alle Blöcke (Einsatz heute, Danach, Zu erledigen, Termine heute) |
| `/time` Zeiterfassung | Mitarbeiter | 390, 834, 1440, dunkel 390 | Liste, KW-Köpfe, Kennzahlen; „Neuer Eintrag“ (Blatt), „Weitere Angaben“; Eintrag bearbeiten (Blatt bis zum Ende); „Auf mehrere Baustellen aufteilen …“ (Rückfrage-Fenster); Löschen an der Zeile → Rückfrage; Wischen nach links; „Korrektur anfragen“ an der Zeile (nur gesehen), Karte „Korrekturanträge“; „Anzeigen“ der Warnung; „Änderungsprotokoll deiner Buchungen“; „Arbeitstag prüfen“; Timer-Leiste auf anderen Seiten; Hilfe |
| `/my-schedule/mein`, `/my-schedule/team` | Mitarbeiter | 390, 834, 1440, dunkel 390 (mein) | Monat, Tag wählen, Monat blättern, Tagesliste mit Terminen, Rüstliste, „Nächste Einsätze“, „Nächste Termine“, „Mein Urlaub“, „Im eigenen Kalender“; Team-Woche (Tagesstreifen, Stufen); Hilfe. Ein eigenes Einsatz-Fenster gibt es für den Monteur nicht (Zeilen und Kacheln öffnen nichts) |
| `/my-projects` | Mitarbeiter | 390, 834, 1440 | Karten; es öffnet sich nichts außer Karte/Telefon (siehe D1-C5) |
| `/material` | Mitarbeiter | 390, 834, 1440, dunkel 390 | Baustelle wählen, Katalog, Kreis → Mengensteuerung, Korbleiste, Korb-Karte, Abschicken (Meldung), „Material zurückgeben“ (Blatt), Fenster einer Anforderung (⋯, „Abgeholt“), freie Zeile. „Mein Fahrzeug“ erscheint in der Vorschau nicht (kein Fahrzeuglager) |
| `/worksheets` | Mitarbeiter | 390, 834, 1440 | Offen / Alle, Suche, Fenster eines Scheins, ⋯ (Verwerfen, Löschen) |
| `/worksheet` | Mitarbeiter | 390, 834, 1440, dunkel 390 | Auswahl, Schritte 1–4 (Zeiten, Material, Fotos, Unterschrift), Zusammenfassung, Unterschriftsfeld, „Groß unterschreiben“, „Entwurf“ |
| `/vacations`, `/sonderurlaub` | Mitarbeiter | 390, 834, 1440 | „Antrag stellen“ (Blatt) mit den Arten Urlaub, Arztbesuch, Sonderurlaub (Nachweis), Pflegefreistellung, Krankmeldung; Zeile → Verlauf; Hilfe |
| `/nachrichten` | Mitarbeiter | 390, 834, 1440, dunkel 390 | Postfach, Reiter, Suche (leer), Gespräch, langes Drücken (Reaktionen, Markieren, Kopieren, Melden), „Neue Nachricht“ (Blatt), Hilfe |
| `/settings/meldungen` | Mitarbeiter | 390, 834, 1440 | alle Karten, „Passwort ändern“ (aufgeklappt), Hilfe |
| Hülle | Mitarbeiter, Verwaltung, Administrator | 390, 834, 1440 | Kopf- und Fußinsel, „Mehr“-Blatt, Profil-Blatt, „Problem melden“, „Suchen oder springen“ (Handy, Tablet, Strg+K), Seitenleiste breit und schmal je Rolle, Meldung, Rückfrage, Blatt/Fenster (Kopf, Griff, ✕, Fuß), Timer-Leiste |
| `/_muster` | Administrator | 390 | 8 Teilbilder aufgenommen, nur der Abschnitt „Formular / Hauptaktion / Neu und Fenster“ als Vergleich gelesen |

## 2. Fehler gegen die Linie

### D1-A1 Wisch-Aktion „Löschen“ bricht mitten im Wort um
- Ort: `/time`, Mitarbeiter, 390, Zeile nach links gewischt.
- Ist: Fläche 88 px breit, Polster 16 + 16, bleibt 55 px für „Löschen“ in 15 px / 500 → „Lösche | n“ in zwei Zeilen (`zt_wisch.png`). Soll: kein unschöner Umbruch; Knopfbeschriftung einzeilig.
- Ursache: Baustein, `src/styles/lot-bewegung.css:191` (`.wisch-knopf`, `min-width: 5.5rem; padding: 0 1rem`, kein `white-space`). Trifft jede Wischzeile der App („Löschen“, „Aus Lager“).
- Vorschlag: `white-space: nowrap`, Polster 12 px. Aufwand: klein. Bleibt: Breite der Aktion mindestens 88 px, Tipp darauf ruft dieselbe Rückfrage; Rückschritt wäre eine Aktion schmaler als 44 px.

### D1-A2 „Eintrag löschen“ steht als Knopf direkt über dem Speichern
- Ort: `/time`, 390 (und Blattform am Tablet), Blatt „Eintrag bearbeiten“.
- Ist: gerahmter Knopf mit rotem Wort, 141×48, Unterkante 741, Fußzeile ab 757 — 16 px über „Abbrechen | Änderungen speichern“ (`ze_2.png`). Soll: „Unumkehrbares (Löschen, Stornieren) steht immer im ⋯, nie als Knopf neben dem nächsten Schritt“ (style.md, U4).
- Ursache: Seite; das Zeitformular im Blatt nutzt nicht `Fensteraktionen` (`src/features/time/TimeView.tsx` ab 1161, `TimeForm.tsx`).
- Vorschlag: Fuß des Blatts über `Fensteraktionen`: ⋯ ganz links mit „Eintrag löschen“ (und „Auf mehrere Baustellen aufteilen …“), rechts „Abbrechen“ und „Änderungen speichern“. Aufwand: mittel. Bleibt: Löschen im Blatt erreichbar, dieselbe Rückfrage, Papierkorb an der Zeile ab Tablet, Wischen am Handy.

### D1-A3 Inhalt eines Blatts klebt an der Linie unter dem Titel
- Ort: `/time`, 390, „Neuer Eintrag“ und „Eintrag bearbeiten“.
- Ist: Linie unter dem Kopf bei y 237, erster Knopf beginnt bei 237 (sein Text bei 246); im Bearbeiten-Blatt steht die Beschriftung „Datum“ 0 px unter der Linie (`zt_neu_844.png`, `zt_edit.png`). In den Blättern „Hilfe“, „Antrag stellen“, „Baustelle wechseln“, „Material zurückgeben“ sind es 16 px (Messung `s06.log`, Zeilen `BLATT`). Soll: gleicher Abstand in jedem Blatt (8er-Rhythmus).
- Ursache: Baustein. `.blatt-inhalt` hat kein Polster oben (`src/styles/lot.css:78`), `.fenster-inhalt` hat 16 px (`lot.css:127`). Betroffen ist jedes `BottomSheet` mit `titel`, aber ohne `auchBreit`; gemessen an `TimeView.tsx:1161`, die übrigen Aufrufe per Suche prüfen.
- Vorschlag: `.blatt-inhalt` bekommt 16 px oben, wenn ein `.fenster-kopf` davor steht. Aufwand: klein. Bleibt: das „Mehr“-Blatt (ohne Titel) unverändert; Rückschritt wäre doppelte Luft in Blättern, deren Inhalt schon einen Rand mitbringt.

### D1-A4 „Fahrzeug (Kennzeichen)“ ist kein Feld aus dem Baustein
- Ort: `/time`, Zeitformular → „Weitere Angaben“, alle Breiten (`834_zeit_edit.png`, `ze_2.png`).
- Ist: Beschriftung in Tinte `rgb(19,38,44)` statt gedämpft `rgb(90,109,114)`; Feldrand `rgb(223,231,233)` (`--border`) statt `rgb(194,210,213)` (`--border-strong`); Feld sitzt 2 px höher als „Wegzeit“ daneben. Soll: ein Feld sieht überall gleich aus (`InputField`).
- Ursache: Seite, handgebautes `<label>`/`<input>` in `src/features/time/TimeForm.tsx:1159–1187`.
- Vorschlag: `InputField` mit Vorsatz „WN-“ (Vorsatz als Eigenschaft des Bausteins). Aufwand: klein. Bleibt: fester Bezirksvorsatz, Vorschlagsliste der Fahrzeuge.

### D1-A5 Zeile mit Papierkorb verliert die rechte Spalte
- Ort: `/time`, 390, Abwesenheitszeilen („Mo, 16.11. · Berufsschule“).
- Ist: Zustand, Stunden und Papierkorb stehen links unter dem Titel; rechte Kante des Stundenwerts bei x 210, in den 29 anderen gemessenen Zeilen bei 358 (`zt_loeschen.png`, `s05.log` `WERTSPALTE`). Soll: Zahlen in einer Flucht.
- Ursache: Seite, `TimeView.tsx` um Zeile 760–780 (`zeile zeile-ganz flex-wrap gap-y-2`, der Löschknopf bricht die Zeile um).
- Vorschlag: am Handy keinen Papierkorb in der Zeile (Wischen und Blatt tragen das Löschen), Wert rechts wie überall. Aufwand: klein. Bleibt: Löschen erreichbar über Wischen und im Blatt; ab Tablet der Papierkorb an der Zeile.

### D1-A6 Schrittleiste des Scheins stößt an die Fußinsel
- Ort: `/worksheet`, 390×844, Leiste „Entwurf | Weiter: …“.
- Ist: Unterkante der Leiste 774 = Oberkante der Fußinsel 774, Abstand 0 px; zwei gerundete Flächen berühren sich (`ws_s1_844.png`). Die Timer-Leiste hält 8 px. Soll: gleiche Luft der Handy-Inseln (E98), 8 px.
- Ursache: Baustein `.aktionsleiste` (`src/index.css:1298`, `bottom: var(--reiter-hoehe)`), im Schein als gerundetes Blatt gezeichnet.
- Vorschlag: gerundete Aktionsleisten am Handy `bottom: calc(var(--reiter-hoehe) + 0.5rem)`. Aufwand: klein. Bleibt: die Leiste verdeckt kein Feld (Platz am Seitenende mitrechnen).

### D1-A7 Erste Karte im Schein beginnt 8 px unter der Blattkante
- Ort: `/worksheet` Schritt 1, 390, Karte mit Baustelle und „ändern“.
- Ist: Blattkante 270, Name 278 (8 px); unten 24 px; alle anderen Blätter haben oben 24 px bis zum Titel (`ws_2.png`). Soll: Blattrand.
- Ursache: Seite, Karte ohne Kopf in `WorkSheetView.tsx` (Körper mit `padding: 0 16px 24px`).
- Vorschlag: Karte mit Titelzeile (Baustelle als Kartentitel, „ändern“ als Verweis im Kopf). Aufwand: klein.

### D1-A8 Zwischentitel ohne Abstand zum ersten Feld
- Ort: `/worksheet` Schritt 1, 390, „Zeit beim Kunden eintragen“.
- Ist: Unterkante des Titels 844,5 = Oberkante der Beschriftung „Mitarbeiter“ 844,5 (0 px). Soll: 8 px.
- Ursache: `src/features/worksheets/LeistungszeitErfassen.tsx` (Absatz vor `FormGrid`, um Zeile 140–153). Aufwand: klein.

### D1-A9 Platzhalter abgeschnitten in „Nicht im Katalog?“
- Ort: `/material`, 390 (bei 375 enger).
- Ist: Feld „Bezeichnung“ 94 px breit, Platzhalter „z. B. Eckventil ½″ verchromt“ zeigt „z. B. Eck…“; auch der getippte Name ist nach elf Zeichen nicht mehr zu sehen (`390_mat_1.png`). Soll: Text nicht abgeschnitten.
- Ursache: Seite, Raster `minmax(0,1fr) 4.5rem 5.5rem auto` in `src/features/orders/OrderView.tsx:736`.
- Vorschlag: am Handy „Bezeichnung“ in eigener Zeile über die Breite, darunter Menge, Einheit, Kreis. Aufwand: klein. Bleibt: der Kreis in derselben Flucht wie bei Katalogartikeln (E74).

### D1-A10 Hinweis klebt unter der Kopflinie
- Ort: `/material`, 390, Karte „Zuletzt angefordert“, Satz „In den letzten 4 Wochen“.
- Ist: Linie 438, Text ab 439 (1 px), darunter 8 px. Soll: 8 px.
- Ursache: Seite, `blatt-einzug pb-2` ohne Abstand oben (`OrderView.tsx`). Vorschlag: als Zusatz in den Kartentitel („Zuletzt angefordert“, rechts leise „4 Wochen“) — dann entfällt die Zeile. Aufwand: klein.

### D1-A11 Eckige Pfeilknöpfe in „Startseite anpassen“
- Ort: `/` → ⋯ → „Startseite anpassen …“, 390.
- Ist: vier Knöpfe 44×44, Rand 1 px, Radius 0 px (`hu_start_anpassen.png`). Soll: Feld/Knopf 12 px (Radien nach Rolle).
- Ursache: `.anpassen-pfeil`, `src/features/dashboard/start/StartseiteAnpassen.tsx:140–143`. Vorschlag: `IconButton`. Aufwand: klein.

### D1-A12 Adresse in Plex Mono
- Ort: `/nachrichten` → „Neue Nachricht“, 390, Baustellenzeilen.
- Ist: ganze Unterzeile „B-2026-0148 · Rathausplatz 1, 2620 Neunkirchen“ in IBM Plex Mono 13 px (`na_neu.png`). Soll: Mono nur für Gemessenes und Nummern (style.md, Typografie).
- Ursache: `.neu-nr` liegt auf der ganzen Zeile (`src/styles/lot-nachrichten.css:331`). Vorschlag: nur die Nummer in Mono. Aufwand: klein.

### D1-A13 Hauptaktion des letzten Schritts zweizeilig
- Ort: `/worksheet` Schritt 4, 390.
- Ist: „Unterschreiben / und abschließen“, 196×60 statt 48 hoch (`ws_5.png`). Soll: Knopf einzeilig, kompakt.
- Vorschlag: sichtbar „Abschließen“ (der Name für die Vorlesehilfe bleibt lang). Aufwand: klein. Bleibt: gesperrt, solange Unterschrift oder Kundenname fehlen — und der Grund steht daneben.

### D1-A14 Zusammenfassung im Schein: Zeile nicht ganz antippbar
- Ort: `/worksheet` Schritt 4, 390, vier Zeilen „Baustelle und Tag / Zeiten / Material / Fotos und Notizen“.
- Ist: nur der Stift rechts (48×48) reagiert, die Zeile ist ein `div` (`s06.log` `ZUSAMMEN`). Soll: ganze Zeilen antippbar (CLAUDE.md, Oberfläche).
- Vorschlag: `ListRow` mit Pfeil; Tipp springt in den Schritt. Aufwand: klein bis mittel.

### D1-A15 Textpfeil „→“ statt des Zeichens
- Ort: `/`, alle Breiten, „und 6 weitere →“.
- Ist: Zeichen „→“ im Text, 13 px (`390_start_3.png`); daneben „Mein Einsatzplan ›“. Soll: dasselbe Zeichen wie überall (E99 hat „→“ in der Kundenakte ersetzt).
- Ursache: `Handlungsbedarf.tsx:93, 98`, `HeuteListe.tsx:29`. Aufwand: klein.

### D1-A16 Englischer Rest „Threads“
- Ort: `/nachrichten`, Seitenkopf ab Tablet und Hilfe: „Baustellen-Threads, Direktnachrichten und Runden“ / „Die Threads der Baustellen“.
- Ursache: `src/features/nachrichten/NachrichtenView.tsx:224`. Vorschlag: „Gespräche der Baustellen“ (das Postfach heißt für die Vorlesehilfe schon „Gespräche“). Aufwand: klein.

### D1-A17 Im Gespräch steht am Handy nicht mehr, mit wem man schreibt
- Ort: `/nachrichten` → Gespräch, 390×844.
- Ist: das Gespräch rollt beim Öffnen ans Ende (scrollY 224); der Titel liegt bei y −122, „← Nachrichten“ ebenso außer Sicht; die Kopfinsel zeigt weiter „Perl Installationen GmbH“ (`d_gespraech.png`, Messung `ex.mjs ch`). Soll: „Beim Rollen steht hier der Titel der Seite“ (D11/E86, `Layout.tsx:474–480`).
- Ursache: das Gespräch hat einen eigenen Kopf und meldet ihn nicht über `useKopfTitel` (`src/features/nachrichten/Gespraech.tsx`, `src/components/KopfTitel.tsx`).
- Vorschlag: Titel melden; dazu im Gespräch links in der Kopfinsel der Rückweg „‹“. Aufwand: mittel. Bleibt: Betrieb in der Kopfinsel auf allen anderen Seiten, Suche und Profil rechts.

### D1-A18 Führender Trennpunkt ohne ersten Teil
- Ort: `/worksheets` → Fenster eines Scheins, 390: „Zeiten: · 08:30 Std“ (`wl_zeile.png`).
- Ist: Punkt vor dem Wert, weil der Name davor leer ist (wahrscheinlich Beispieldaten ohne Namen — der Text darf trotzdem nicht mit „·“ beginnen). Vorschlag: Teile filtern, bevor sie verbunden werden. Aufwand: klein.

### D1-A19 Seitenleiste am Schreibtisch: Fuß läuft aus dem Bild
- Ort: Hülle, 1440×900, alle Rollen.
- Ist: Inhalt der Leiste 949 px (Mitarbeiter, 9 Einträge), 1.087 px (Verwaltung), 1.449 px (Administrator) bei 900 px Höhe; die Produktmarke ist am unteren Rand angeschnitten, „Datenschutz · Impressum“ erst nach Rollen sichtbar; beim Administrator liegen auch „Problem melden“, Darstellung und „Abmelden“ unter dem Rand (`1440_start.png`, `1440_navi_Administrator.png`, `s08.log`). Soll: nichts abgeschnitten.
- Ursache: Baustein `aside.navi` rollt als Ganzes (`Layout.tsx:507–570`).
- Vorschlag: nur die Navigation rollt, der Fuß (Person, Abmelden) steht fest; „Problem melden“, Darstellung, Marke und Rechtstexte wandern hinter den Namen ins Profil-Fenster — wie am Tablet, wo das Kürzel dasselbe Fenster öffnet. Aufwand: mittel. Bleibt: jede dieser Aktionen mit höchstens zwei Klicks; Strg+K und Betriebsname oben.

### D1-A20 „Neue Fassung“-Leiste deckt am Handy die Fußinsel (nur im Code gelesen)
- Ort: Hülle, `src/components/NeueFassung.tsx:212`.
- Ist: `fixed inset-x-0 bottom-0 z-30`, eckig über die volle Breite, dieselbe Ebene wie die Fußinsel (`lot.css:502`, `z-index: 30`) — sie liegt über Navigation und Hauptaktion. Als schwebende Karte erst ab `sm` (640 px) statt ab 760 px. Soll: Schwebendes am Handy mit dem Radius der Inseln, über der Fußinsel; Breiten 759/760.
- Vorschlag: `bottom: var(--reiter-hoehe)`, 8 px Rand, Radius 24, Grenze `md`. Aufwand: klein. Bleibt: unter Rückfragen und Fenstern (z-Ebene).

### D1-A21 Meldung liegt am Handy auf der Kopfinsel (Grenzfall)
- Ort: Hülle, 390, jede Meldung (`mb_5.png`, `st_1.png`).
- Ist: Meldung bei `top: 16px`, Radius 12, schmaler als die Kopfinsel (8–62 px, Radius 24): links schaut „Material a…“ heraus, rechts die halbe Lupe; Suche und Profil sind 3,5 bis 7 s verdeckt. Oben ist Absicht (G29, `lot.css:136–142`). Soll: zwei schwebende Flächen überlagern sich nicht halb.
- Vorschlag: Meldung unter die Kopfinsel (`top: calc(var(--kopf-oben) + 8px)`) oder sie ersetzt für ihre Dauer den Inhalt der Insel. Aufwand: klein. Bleibt: nie über Hauptaktion und Aktionsleiste (G29), „Rückgängig“ ≥ 44 px.

### D1-A22 Tastaturen der Felder (`inputmode`, `autocomplete`, `enterkeyhint`, Großschreibung)
Alle Felder haben 16 px (kein Zoom am iPhone) — das passt. Falsch oder unvollständig:

| Feld | Ort | Ist | Soll |
|---|---|---|---|
| „Pause (Min.)“ | `TimeForm.tsx:1562–1565` | `type="number"` ohne `inputMode` — iPhone zeigt Ziffern mit Satzzeichen | `inputMode="numeric"` (so im Schein, `LeistungszeitErfassen.tsx:174–180`) |
| „Wegzeit (Min.)“ | `TimeForm.tsx:1147–1150` | wie oben | `inputMode="numeric"` |
| „Fahrzeug (Kennzeichen)“ | `TimeForm.tsx:1179` | keine Angabe — iPhone korrigiert und schreibt klein | `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}` |
| „Suchen oder springen“ | `src/app/Suchfenster.tsx:307` | ohne `type`, `inputMode`, `enterKeyHint`, mit Autokorrektur und Großschreibung („B-2026“ wird korrigiert) | `inputMode="search"`, `enterKeyHint="go"`, `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`, `autoComplete="off"` |
| Suchfelder Postfach, „An:“, Katalog, Scheine, Baustellensuche | `Postfach.tsx:131`, `NeueNachricht.tsx:108`, `BaustellenSuche.tsx:125`, `MaterialErfassen.tsx:288`, `RetoureFenster.tsx:319` | `type="search"`, `autoComplete="off"`, kein `enterKeyHint`, Großschreibung an | `enterKeyHint="search"`, `autoCapitalize="none"` |
| „Name des Helfers“, „Mitarbeiter“ (Schein), „Kunde (Name in Druckbuchstaben)“ | `TimeForm.tsx:1198`, `LeistungszeitErfassen.tsx:154`, `WorkSheetView.tsx` | keine Angabe | `autoCapitalize="words"`, `autoComplete="off"` (fremder Name, kein eigener) |
| letztes Feld eines Blatts | alle Formulare | `enterKeyHint` gibt es im ganzen Code einmal (`ZaehllisteView.tsx:355`) | `enterKeyHint="done"` bzw. `"next"`, damit die blaue Taste sagt, was sie tut |

Richtig sind: Mengen (`numeric`/`decimal` je Einheit, `OrderView.tsx:1257`), Stunden beim Aufteilen (`decimal`), Passwort (`current-password`/`new-password`), Code des zweiten Faktors (`numeric`, `one-time-code`), Anmeldung (`inputMode="email"`, `username`). Aufwand: klein (eine Runde über die Felder, je Feld ein Test). Bleibt: `type="number"` mit `min`, wo der Browser prüft.

### Dunkler Satz
Angesehen: Startseite (bereit, läuft), Zeitliste, Blatt „Neuer Eintrag“, Rückfrage, Material mit Auswahl und Korbleiste, Gespräch. Kein Kontrastfehler gefunden; eigene Blase `rgb(23,52,59)` mit Kontur `rgb(47,90,100)`, Text `rgb(229,239,240)`. Auffällig, kein Regelverstoß: der laufende Arbeitstag (`#0A2F38`) hebt sich im dunklen Satz kaum von den Blättern (`#12262B`) ab (`d_start_laeuft.png`) — siehe D1-I9.

## 3. Unstimmigkeiten zwischen Seiten

### D1-B1 Derselbe Einsatz in zwei Anordnungen
- Startseite (390, `390_start_1.png`): Name, „Nummer · Zeit“ als Text, Adresse, Telefon, „Aufgabe:“, ein Knopf, Rüstliste, **dreigeteilte Leiste** „Anfordern | Nachricht | Schein“ (E90).
- Mein Einsatzplan (390, `390_plan_2.png`): Name mit Nummernstempel, Zustand „Heute“ und Stufe, Aufgabe ohne Wort, Rüstliste, **zwei Knöpfe über die Breite** („Zeit erfassen“, „Schein schreiben“), dann Adresse, Telefon und „Anfordern“ als unterstrichene Verweise in einer Zeile, „Nachricht“ allein darunter.
- Regel: „Je Einsatz eine Aktionszeile in einer Form“ (U3); E90 nennt die dreigeteilte Leiste.
- Ursache: `HeuteEigene.tsx` (`EinsatzWegeleiste`) gegen `MyScheduleView.tsx` (`EinsatzKnoepfe`, `EinsatzKontakt`), beide aus `Einsatzaktionen.tsx`.
- Vorschlag: am Handy im Einsatzplan dieselbe Reihenfolge und dieselbe Leiste wie auf der Startseite. Aufwand: mittel. Bleibt: jede der fünf Aktionen (Zeit, Schein, Anfordern, Nachricht, Anruf/Route) an jedem Einsatz, die großzügige Form ab Tablet.

### D1-B2 Baustellennummer in drei Formen
Stempel in Plex Mono 12 px mit Rahmen (`.zeile-nr`: Zeit, Einsatzplan, Scheine); Text in DM Sans 13 px (`.nr`: Startseite, Meine Baustellen — `.nr` setzt nur `white-space`, `index.css:1423`); Plex Mono 13 px ohne Rahmen (Neue Nachricht). Regel: Projektnummern in Mono. Vorschlag: `.nr` bekommt die Mono-Schrift (eine Zeile), Stempel nur am Namen einer Zeile. Aufwand: klein; vorher messen, ob lange Meta-Zeilen dadurch umbrechen.

### D1-B3 Fuß von Blatt und Fenster in vier Formen
| Wo (390) | Knöpfe (x von–bis) | Form |
|---|---|---|
| Zeitformular „Neuer Eintrag / bearbeiten“ | Abbrechen 16–156, Zeit buchen 164–374 | über die ganze Breite gestreckt, 40/60; rollt mit dem Inhalt (beim Öffnen auf 844 px nicht zu sehen) |
| „Baustelle wechseln“, „Zeitsitzung verwerfen“, „Material zurückgeben“, „Aufteilen“ | Abbrechen 89–200, Hauptaktion 208–374 | beide kompakt rechts |
| „Antrag stellen“ | Antrag einreichen 16–374 | ein Knopf über die Breite, kein „Abbrechen“ |
| Schein-Fenster, Anforderung, „Startseite anpassen“ | ⋯ 16–64, …, Hauptaktion bis 374 | `Fensteraktionen` (U4) |

Regel: Hauptaktion kompakt rechts, Nebenweg links (style.md, „Radien und Bedienflächen“; Musterseite „Formular“ zeigt kompakt rechts, `mu390_6.png`). Vorschlag: jedes Blatt mit Formular über `Fensteraktionen`; der Fuß klebt am unteren Rand des Blatts. Aufwand: mittel. Bleibt: Reihenfolge Abbrechen links, Hauptaktion rechts; nichts hinter der Tastatur.

### D1-B4 „* Pflichtfeld“ nur in manchen Formularen
`Pflichthinweis` steht in 7 Dateien (darunter Urlaub), Sterne tragen Felder in rund 60 Dateien; im Bereich ohne Legende: Zeitformular, Schein, Retoure, Korrekturantrag. Vorschlag: entweder überall am Ende des Formulars oder nirgends (der Stern ist gelernt; `aria-required` sagt es an). Aufwand: klein.

### D1-B5 Dauer in drei Schreibweisen
„Arbeit bisher 0:00 h“ und „23.11.2026 · Arbeit 0:00 h“ (`ArbeitstagKarte.tsx:209`, `ZeitsitzungPanel.tsx:129`); „09:00 Std“, „00:00 Std“, „08:30 Std“ (Formular, „Wie zuletzt buchen“, Scheine); „09:00“ ohne Einheit (Liste, Kennzahl); „240 h kalkuliert“ (dezimal). Vorschlag: Dauer immer `HH:MM Std`, dezimale Stunden nur mit „h“ für Budgets. Aufwand: klein.

### D1-B6 Wochentag mit und ohne Punkt, Datum in fünf Längen
„Mo, 23.11.“ (Zeitliste), „Di., 24.11.2026“ (Nächste Einsätze), „Di, 24.11.“ (Nächste Termine — dieselbe Seite), „Einsätze am Mo., 23.11.2026“, „Montag, 23.11.2026“ (Startseite), „Montag 23.11. · heute“ (Team-Woche, ohne Beistrich), „09.11.2026 13:42“ (Postfach). Vorschlag: zwei Formen — kurz „Mo 23.11.“ in Listen, lang „Montag, 23.11.2026“ in Titeln; das Jahr nur, wenn es nicht das laufende ist. Aufwand: klein bis mittel (eine Formatfunktion, Texte der Prüfungen nachziehen).

### D1-B7 Kalenderkopf zweimal verschieden
Monat: Pfeile an den Rändern des Blatts, Titel „November 2026“ 15 px / 500, im Blatt. Team-Woche: Pfeile direkt am Titel, auf dem Grund, Titel „Diese Woche“ mit Unterzeile in Mono (`pl_3.png`, `pl_4.png`). Vorschlag: ein Kopf (`PlanungsKopf`) für beide. Aufwand: klein bis mittel.

### D1-B8 Gruppenüberschrift in Blättern und Listen
„Mehr“: 12 px / 400, versal, 1,68 px gesperrt (`.mehr-gruppe`); „Neue Nachricht“ („Personen“) und Suchfenster („Aktionen“): 12 px / 500, normal; Startseite „Danach“: 13 px / 500 in Tinte; Einsatzplan „Termine“: 13 px. Vorschlag: eine Dachzeile (`section-label`) für alle Gruppen in Blättern und Karten. Aufwand: klein.

### D1-B9 Zähler am Kartentitel in drei Formen
„Zu erledigen (10)“, „Meine Anforderungen (2)“; „Dein Einsatz heute · 4 Einsätze“, „Deine Termine heute · 1 Termin“; „Material … noch 1 von 2“ rechtsbündig. Vorschlag in D1-P8.

### D1-B10 Timer-Leiste auf weißem Grund, Inseln auf `--surface-2`
Kopf- und Fußinsel `rgb(243,246,246)`, Timer-Leiste `rgb(255,255,255)`, alle drei schwebend mit demselben Schatten (`zt_leiste_material.png`). Vorschlag: gleicher Grund. Aufwand: klein. Vorbehalt: Weiß kann gewollt sein, um die Leiste von der Navigation zu trennen.

### D1-B11 „Aufgabe“ am ersten Einsatz ohne, bei „Danach“ mit Strich
Am Handy steht der erste Einsatz ohne die 2-px-Linie links (`lot-start.css:140`, E90), die folgenden mit (`lot-start.css:115`) — in derselben Karte (`390_start_1.png`). Vorschlag: am Handy alle wie der erste. Aufwand: klein.

### D1-B12 Ein- und Ausblenden einmal mit Kästchen, einmal mit Schalter
„Startseite anpassen“: „Zahlen oben“ mit Kästchen, „Bereiche“ und „Zu erledigen“ mit Schaltern, im selben Fenster mit „Speichern“ (`hu_start_anpassen.png`). Vorschlag: überall Schalter (E95), die Reihenfolge der Zahlen daneben. Aufwand: klein; `schalterRegel.test.ts` nachziehen.

### D1-B13 Darstellungsschalter: am Schreibtisch ohne Wort
Profil-Blatt: „Dunkle Darstellung“ mit Schalter (E72, N13). Seitenleiste am Schreibtisch: derselbe Schalter ohne sichtbares Wort (`1440_start.png`). Vorschlag: mit D1-A19 ins Profil-Fenster, sonst Beschriftung dazu. Aufwand: klein.

### D1-B14 Drei Namen und zwei Zeichen für „Mein Konto“
Im „Mehr“-Blatt heißt der Eintrag „Einstellungen“ (Regler), im Profil „Mein Konto“ (Glocke, `Layout.tsx:754`), die Seite heißt „Mein Konto“ unter der Dachzeile „EINSTELLUNGEN“. Für den Monteur ist es derselbe Ort. Vorschlag: für Rollen, die nur „Mein Konto“ haben, heißt der Eintrag überall „Mein Konto“ mit dem Personenzeichen. Aufwand: klein. Bleibt: Leitung und Buchhaltung sehen weiter „Einstellungen“.

### D1-B15 Fenster-Fuß klebt oder rollt
Im Zeitformular (Blatt) und in „Antrag stellen“, „Material zurückgeben“ rollt der Fuß mit; auf 844 px ist „Zeit buchen“ beim Öffnen nicht zu sehen, bei der Retoure ist der Fuß angeschnitten (`zt_neu_844.png`, `ma_retoure.png`). Im Schein-Fenster und in „Startseite anpassen“ steht er fest. Vorschlag mit D1-B3.

## 4. Bedienung: Befunde aus den durchgespielten Aufgaben

Ein Tipp ist eine Berührung; das Rad des Geräts für Datum oder Uhrzeit zählt als 3 (öffnen, wählen, fertig), ein natives Auswahlfeld als 2.

| Aufgabe (Handy) | Tipps heute | Wo es stockt | Vorschlag |
|---|---|---|---|
| „Ich komme auf der Baustelle an und starte die Zeit“ | **1** (Startseite, Baustelle des heutigen Einsatzes vorbelegt); andere Baustelle rund 5 (Wahl öffnen, Auswahlfeld, bestätigen, starten); auf den übrigen Seiten gibt es den Start nicht (2: „Start“ oder „Zeit“, dann starten) | Ohne Timer-Modul führt „Wie zuletzt buchen“ ins ganze Formular (Blatt, „Zeit buchen“ unter dem Rand: 2 Tipps und Rollen). | D1-C1, D1-I1 |
| „Ich buche den Tag nachträglich auf zwei Baustellen“ | rund **17**: Zeit (1), Neuer Eintrag (1), Datum (3), Baustelle (2), rollen, Zeit buchen (1); dann Eintrag antippen (1), „Auf mehrere Baustellen aufteilen …“ (1), weitere Baustelle (2), Stunden tippen (1 + Ziffern), Aufteilen (1) | „Aufteilen“ gibt es erst am gespeicherten Eintrag — man bucht zuerst falsch und teilt dann. | D1-C2 |
| „Ich brauche drei Artikel für morgen“ | **7**: Material (1), Baustelle (2), drei Kreise (3), Abschicken (1) | „Für morgen“ lässt sich nur als Notiz sagen, und das Notizfeld steht in der Korb-Karte weit unten; dort ist „Abschicken“ nicht im Bild. | D1-C3 |
| „Ich schreibe den Schein und lasse unterschreiben“ | rund **12** plus zwei Unterschriften und der Kundenname: Schein am Einsatz (1), „Bis“ (3), Weiter ×3 (3) oder direkt „4 Unterschrift“ (1), Material aus der Rüstliste (1), unterschreiben, Name, unterschreiben, Abschließen (1) | Gut geführt. Der letzte Knopf ist gesperrt, bis alles da ist; warum, steht nicht am Knopf. Zusammenfassung nur über den Stift (D1-A14). | D1-C4 |
| „Ich will nächsten Freitag frei“ | **7–8**: Mehr (1), Urlaub (1) — oder die Kennzahl „Resturlaub“ auf der Startseite (1; sie ist ein Verweis, das Ziel ließ sich in der Vorschau nicht ablesen) —, Antrag stellen (1), Von (3), „Bis“ zieht mit, Antrag einreichen (1) | Kein Stocken. „Antrag stellen“ ist in einem Blatt, der Knopf darunter aber nicht fest (bei Sonderurlaub unter dem Rand). | D1-B3 |
| „Wo muss ich morgen hin und wen rufe ich an?“ | **2 plus Rollen**: Plan (1), morgen im Kalender (1) | Nach dem Tipp auf den Tag ändert sich im Bild nichts: die Tagesliste beginnt bei y 846 von 844, unter Rand und Fußinsel. „Nächste Einsätze“ nennt Adresse und Telefon nicht und öffnet nichts. | D1-C6 |
| „Ich schreibe dem Büro ein Foto“ | **6**: Mehr (1), Nachrichten (1), Neue Nachricht (1), Person (1), Kamera (1), Senden (1); zur Baustelle vom Einsatz aus: „Nachricht“ (1) | „Das Büro“ gibt es als Empfänger nicht — man muss wissen, wer es ist. In der Vorschau führt „Nachricht“ am Einsatz ins Postfach statt ins Gespräch der Baustelle (am echten Stand prüfen). | D1-C7 |

### D1-C1 „Zeit buchen“ ist beim Öffnen des Blatts nicht zu sehen
- Ort: `/time`, `/` („Wie zuletzt buchen“, „Tag ohne Buchung“), 390×844 (`zt_neu_844.png`).
- Ist: das Blatt zeigt Datum bis Baustelle; Kommentar, Helfer, „Weitere Angaben“ und die Knöpfe liegen darunter. Für die häufigste Buchung („wie zuletzt“) braucht es Tipp, Rollen, Tipp.
- Vorschlag: Fuß des Blatts fest (D1-B3); „Wie zuletzt“ füllt und lässt den Knopf im Bild. Aufwand: mittel. Bleibt: alle Prüfungen und Pflichtfelder vor dem Buchen; nichts bucht ohne ausdrücklichen Tipp.

### D1-C2 „Aufteilen“ erst nach dem Speichern
- Ist: im Blatt „Neuer Eintrag“ fehlt „Auf mehrere Baustellen aufteilen …“, es steht nur im Blatt „Eintrag bearbeiten“ (`zt_edit.png`, `zt_aufteilen.png`).
- Vorschlag: derselbe Weg schon beim Anlegen, sobald Zeit und erste Baustelle stehen („Weitere Baustelle“ unter dem Feld Baustelle). Aufwand: mittel bis groß (Speichern mehrerer Buchungen in einem Zug). Vorbehalt: fachlich mit dem Bereich Zeit abstimmen. Bleibt: Aufteilen am gespeicherten Eintrag.

### D1-C3 Im Korb ist „Abschicken“ aus dem Bild
- Ort: `/material`, 390×844, nach Tipp auf „N Artikel für …“.
- Ist: die Seite rollt zur Karte „Anforderung (N) — noch nicht abgeschickt“ (scrollY 1.312); die Leiste mit „Leeren | Abschicken“ liegt dann bei y −25 bis 23 hinter der Kopfinsel (`mb_4.png`, Messung `ex.mjs mc`). Die Karte sagt „Erst mit ‚Anforderung abschicken‘ geht sie an die Verwaltung“ — der Knopf dazu ist nicht zu sehen. Die Leiste klebt nur, solange ihre Stelle im Fluss unter dem Bild liegt (`position: sticky`).
- Vorschlag: die Korbleiste am Handy fest über der Fußinsel, solange der Korb nicht leer ist; die Notiz („für morgen“) und ein Feld „bis wann“ in ein Blatt „Anforderung prüfen“, das der Tipp auf „N Artikel“ öffnet. Aufwand: mittel. Bleibt: ein Tipp „Abschicken“ ohne Zwischenschritt für den, der nichts dazuschreiben will; „Eilzustellung“ wie heute.

### D1-C4 Gesperrte Hauptaktion ohne Grund
- Ort: `/worksheet` Schritt 4. „Unterschreiben und abschließen“ ist grau, bis Unterschriften und Kundenname da sind; am Knopf steht nicht, was fehlt.
- Vorschlag: eine Zeile über der Leiste („Es fehlt: Unterschrift Kunde“), Tipp springt hin. Aufwand: klein. Bleibt: kein Abschluss ohne Unterschrift.

### D1-C5 „Meine Baustellen“ ist eine Sackgasse
- Ort: `/my-projects`, alle Breiten. Die Karten öffnen nichts außer Karte und Telefon (`MyProjectsView.tsx:137–224`). Von hier will man zum Schein, zum Material, zur Nachricht, zum nächsten Einsatz dieser Baustelle.
- Vorschlag: am Fuß jeder Karte dieselbe dreigeteilte Leiste wie am Einsatz („Anfordern | Nachricht | Schein“), „nächster Einsatz 23.11.“ als Verweis in den Plan auf diesen Tag. Aufwand: klein bis mittel. Bleibt: Lesen ohne Pflicht zum Tippen; Rechte wie am Einsatz.

### D1-C6 Tipp auf einen Tag zeigt nichts
- Ort: `/my-schedule/mein`, 390×844. Nach dem Tipp bleibt scrollY 0, der Titel „Einsätze am …“ liegt bei y 846 (Messung `ex.mjs pl844`).
- Vorschlag: nach der Wahl eines Tages die Tagesliste ins Bild rollen (ruhig, 160 ms; bei „Bewegung reduzieren“ sofort); am Handy der Monat einklappbar zur Woche des gewählten Tages. Aufwand: klein (rollen) bis mittel (Woche). Bleibt: der Monat als erste Ansicht, Blättern, Zahl der Einsätze je Tag.

### D1-C7 Kein „Büro“ als Empfänger, Bildzeichen ohne Wort
- „Neue Nachricht“ listet Personen mit Rolle; wer „das Büro“ ist, muss man wissen. Idee: je Betrieb eine benannte Runde („Büro“) oben in der Liste (Einstellung je Betrieb). Aufwand: mittel; Vorbehalt: fachlich.
- Das Menü am Beitrag zeigt „Text markieren“, „Kopieren“, „Melden“ nur als Zeichen (`na_lang.png`). Vorschlag: Zeichen mit Wort in einer kurzen Liste unter den Reaktionen. Aufwand: klein.

### D1-C8 „Suchen oder springen“ am Handy ohne sichtbaren Ausgang
- Ort: Hülle, 390 (`hu_suche.png`). Fenster bei y 156, 16 px Radius, kein ✕, kein „Abbrechen“, kein Lupenzeichen, kein „Leeren“; geschlossen wird durch Tipp daneben. Mit Tastatur bleiben rund fünf Zeilen.
- Vorschlag: am Handy als Blatt von oben an der Stelle der Kopfinsel: Lupe, Feld, „Abbrechen“ rechts; Liste bis zur Tastatur. Aufwand: mittel. Bleibt: Strg+K, Gruppen, Aktionen, Pfeiltasten am Schreibtisch.

### D1-C9 Rückmeldung in Technikersprache
„Timer-Schritt auf diesem Gerät vorgemerkt. Er wird bei Verbindung gesendet.“, „Zeitsitzung verwerfen“, „Kein Startdatum konfiguriert“. Vorschlag in Abschnitt 6 (D1-T6, T7).

## 5. Ideen: intuitiver, hochwertiger, näher an Apple

| Nr. | Idee | Nutzen | Ort | Aufwand | Was gleich bleiben muss |
|---|---|---|---|---|---|
| D1-I1 | Die Timer-Leiste auch im Zustand „bereit“ als schmale Zeile „Arbeitstag starten“ auf den anderen Seiten des Monteurs | Start mit einem Tipp von überall | `TimerLeiste` | mittel | keine Leiste im Gespräch (Eingabefeld); Vorbehalt: nimmt am Handy dauerhaft 58 px |
| D1-I2 | Kopfinsel mit Rückweg: in Akte, Schein und Gespräch links „‹“ statt des Betriebsnamens | Rückweg immer am selben Ort, auch nach dem Rollen | `Layout.tsx`, `KopfTitel` | mittel | Betrieb auf Listen- und Startseiten; „← Nachrichten“ im Seitenkopf bleibt |
| D1-I3 | Großer Titel schrumpft in die Kopfinsel (weich, 160 ms) statt hart zu wechseln | „eingebaut“ wirkender Kopf | `KopfTitel` | klein | bei „Bewegung reduzieren“ sofort |
| D1-I4 | Rückmeldung beim Antippen: Knopf und Zeile geben für 80–120 ms nach (Fläche `--auswahl`, Knopf 1 px tiefer gibt es schon) — als Ersatz für Haptik; zusätzlich beim Start/Stopp des Arbeitstags ein kurzes Zusammenziehen der Uhr | man spürt den Treffer mit Handschuh | `lot-feinschliff.css:159` (heute nur einige Klassen) | klein | kein Dauerpuls, kein Federn |
| D1-I5 | `:hover` nur für Zeigegeräte: rund 90 Regeln in `src/styles` stehen ohne `@media (hover: hover)`; am iPhone bleibt die zuletzt getippte Zeile getönt. Tailwind-Klassen sind schon geschützt (`tailwind.config`, `hoverOnlyWhenSupported`) | kein „hängender“ Zustand | `src/styles/*.css` | klein bis mittel | am Schreibtisch unverändert; am Gerät prüfen |
| D1-I6 | Startbild für iOS (`apple-touch-startup-image`, hell und dunkel) | kein weißer Blitz beim Öffnen vom Home-Bildschirm | `index.html` | klein | Farben `#FFFFFF` / `#0C1C20` |
| D1-I7 | Zahl am App-Zeichen (`navigator.setAppBadge`) für ungelesene Nachrichten und Abholbereites | man sieht es, ohne zu öffnen | `NachrichtenLive`, Push | klein bis mittel | nur für installierte App, nur mit Erlaubnis für Meldungen |
| D1-I8 | Manifest sperrt `orientation: portrait`, die große Unterschrift sagt „Quer halten, dann ist mehr Platz“ — auf Android als installierte App dreht sich nichts | Hinweis stimmt | `public/manifest.webmanifest`, `SignaturePad.tsx:646` | klein | am iPhone gilt das Manifest nicht; Vorbehalt: Wirkung auf dem Tablet prüfen |
| D1-I9 | Laufender Arbeitstag im dunklen Satz mit feiner heller Kontur (`--auswahl-kontur`) | hebt sich wie im hellen Satz ab | `lot-timer.css` | klein | Farbe der Fläche |
| D1-I10 | Zustand nach Rückkehr: beim Zurückkommen aus dem Hintergrund den gewählten Tag (Plan), den offenen Schritt (Schein) und den Korb behalten und leise aktualisieren | App fühlt sich „da“ an | `Seitenposition`, Seiten | mittel | Entwürfe und Vorgemerktes wie heute |
| D1-I11 | Ziehen zum Aktualisieren gibt es nur als installierte App (`ZiehenZumAktualisieren.tsx`); in Blättern mit Liste (Postfach am Tablet) fehlt es | einheitlich | — | klein | nie in einem Formular |
| D1-I12 | Blatt in zwei Höhen: Formulare öffnen in voller Höhe mit festem Fuß, Auskünfte in halber; der Griff zieht zwischen beiden | weniger Rollen im Blatt | `BottomSheet`, `useBlattGeste` | mittel bis groß | Ziehen zum Schließen, Esc, Fokusfalle |
| D1-I13 | Kontextmenü an Zeilen (langes Drücken): Zeitbuchung → Bearbeiten, Aufteilen, Löschen; Anforderung → Abgeholt; Einsatz → Route, Anruf, Schein | direkte Wege ohne Fenster | `ListRow`, `langDruck.ts` (gibt es für Nachrichten) | mittel | jede Aktion bleibt auch ohne langes Drücken erreichbar |
| D1-I14 | Postfach: Zeit kurz wie am iPhone („13:42“, „Mo“, „09.11.“), Titel bekommt die Breite | Baustellenname lesbar statt „B-2026-0147 · Hau…“ | `Postfach.tsx` | klein | volles Datum im Gespräch |
| D1-I15 | Im Gespräch am Handy die Fußinsel ausblenden, solange die Tastatur offen ist | mehr Platz für Text | `Layout`, `Gespraech` | klein | Fußinsel ohne Tastatur; Vorbehalt: am Gerät prüfen |
| D1-I16 | Rüstliste abhaken mit „Rückgängig“ in der Meldung statt des Dauersatzes darunter | weniger Text, direkte Korrektur | `RuestlisteAbhaken.tsx` | klein | Zurücknehmen nur am selben Tag |
| D1-I17 | Kennzahl „Resturlaub“ am Schreibtisch und Tablet nicht als Band über die ganze Breite mit einer Zahl, sondern neben dem Arbeitstag | ruhiger Kopf | `Kennzahlen.tsx` | klein | Verweis zur Urlaubsseite |
| D1-I18 | Profil-Zeichen: „Mein Konto“ mit Person statt Glocke; „App erneuern“ und Fassung hinter „Problem melden“ | Profil-Blatt kürzer | `Layout.tsx:737–800` | klein | Fassung und Erneuern bleiben erreichbar (dort entsteht die Frage) |

## 6. Wo zu viel Text oder unnötige Auskunft steht

Jeder Fund nennt, wo die Auskunft erreichbar bleibt. Ab Tablet stehen zusätzlich die Untertitel der Seitenköpfe (D1-T1); am Handy sind sie schon ausgeblendet.

| Nr. | Bildschirm | Text (gekürzt) | Warum entbehrlich | Wohin |
|---|---|---|---|---|
| D1-T1 | alle Seiten ab Tablet, Seitenkopf | „Deine gebuchten Zeiten und dein Saldo“, „Deine geplanten Einsätze“, „Wer ist diese Woche wo“, „Aus deinem Team und aus deiner Einteilung“, „Anfordern, Lieferung verfolgen, zurückgeben“, „Leistungsnachweise der Baustellen, auch Entwürfe“, „Zeiten, Material und Unterschrift vor Ort“, „Urlaub, Zeitausgleich, Sonderurlaub und Krankmeldung“, „Baustellen-Threads, Direktnachrichten und Runden“, „Benachrichtigungen, Anmeldung und Passwort“ | wiederholt Titel oder zählt die Blätter der Seite auf | in „Hilfe zu dieser Seite“ (dort steht der Satz am Handy schon) |
| D1-T2 | Startseite, Seitenkopf | „Montag, 23.11.2026 · Rolle: Mitarbeiter“ | die Rolle ist immer dieselbe | weg; steht im Profil-Blatt und in der Seitenleiste. Zeigen nur im Support-Einblick |
| D1-T3 | Startseite, Einsatzplan: unter jeder Rüstliste | „Der Haken bucht Lagermaterial vom Bestand ab. Zurücknehmen geht nur heute; was übrig bleibt, kommt über die Retoure zurück.“ (125 Zeichen, Startseite 2×, Einsatzplan 3×) | nützt beim ersten Mal | Hilfe zu dieser Seite; beim Abhaken eine Meldung mit „Rückgängig“ (D1-I16) |
| D1-T4 | Zeiterfassung, Kennzahlen | „Saldo — / Kein Startdatum konfiguriert“ | leerer Wert und ein Satz, mit dem der Monteur nichts tun kann | Kennzahl erst zeigen, wenn es einen Saldo gibt; sonst „Saldo: noch nicht eingerichtet“ in der Hilfe |
| D1-T5 | Zeiterfassung, Kennzahl „Zuschlag“ | „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“ | nennt auch den Wert null | nur Arten mit Stunden; Zeitraum in die Beschriftung („Zuschlag, 3 Monate“) |
| D1-T6 | Meldung beim Arbeitstag ohne Netz | „Timer-Schritt auf diesem Gerät vorgemerkt. Er wird bei Verbindung gesendet.“ | Technikwort, zwei Sätze | „Vorgemerkt — wird gesendet, sobald Netz da ist.“ |
| D1-T7 | Blatt „Zeitsitzung verwerfen“ | Titel „Zeitsitzung verwerfen“ | anderes Wort als „Arbeitstag“ auf der Karte | „Arbeitstag verwerfen“ |
| D1-T8 | Zeitformular | Beschriftungen mit Klammer: „Kommentar / Tätigkeiten (wird am Schein vorgeschlagen)“, „Einsatz als Helfer (zählt nicht zum Projekt-Budget)“, „Name des Helfers (optional)“; Satz „Ohne Baustelle zählt die Zeit zum Zeitkonto, ohne eine Auftragsleistung oder Rechnungsquelle zu erzeugen.“ | Erklärung in der Beschriftung; „Rechnungsquelle“ ist Bürosprache | kurze Beschriftung („Tätigkeit“, „Als Helfer“), Erklärung als `hint` am Feld; der Satz nur, wenn „ohne Baustelle“ gewählt ist |
| D1-T9 | Meine Baustellen, Karte | „B-2026-0147 · 03.08.2026 · 240 h kalkuliert“ | ein Datum ohne Wort (Beginn?) und die Kalkulation | Nummer als Stempel am Titel; „seit 03.08.“ nur vor dem Beginn als „beginnt …“; kalkulierte Stunden in eine Zeile „Einzelheiten“. Bleibt in der Baustellenakte der Leitung |
| D1-T10 | Material, Zeile „Material zurückgeben“ | „Übrig von der Baustelle? Zurück ans Lager — Neues wird gutgeschrieben.“ | zwei Zeilen Erklärung an einem Verweis | „Übriges zurück ans Lager“; Gutschrift steht im Blatt der Retoure |
| D1-T11 | Material, Korb-Karte | Titel „Anforderung (2) — noch nicht abgeschickt“ und darunter „Erst mit ‚Anforderung abschicken‘ geht sie an die Verwaltung.“ | zweimal dasselbe | Satz weg, wenn der Knopf im Bild ist (D1-C3) |
| D1-T12 | Schein, Schritt 1 | „Zeiten am 23.11.2026 · 00:00 Std“; „Noch keine Zeit gebucht. Unten eintragen — oder ohne Stunden lassen, wenn nur Material geliefert wurde.“ | das Datum steht im Feld darüber; 100 Zeichen Leersatz | Titel „Zeiten“, rechts die Summe; Leersatz „Noch keine Zeit. Ohne Stunden geht auch.“ |
| D1-T13 | Schein, Schritt 2 | „Noch kein Material eingetragen. Was verbaut wurde, kommt hier dazu — der Schein lässt sich auch ohne unterschreiben.“; „Freie Zeile (nicht im Lager geführt)“ | Erklärung dessen, was die Felder darunter zeigen | „Noch kein Material.“; Beschriftung „Freie Zeile“ |
| D1-T14 | Schein, Schritt 3 | „Fotos (0/8)“ und „Freiwillig. Höchstens 8 Stück, am Gerät verkleinert.“ | Höchstzahl doppelt, „am Gerät verkleinert“ ist Technik | „Freiwillig.“; Rest in die Hilfe. „Keine Angaben zur Gesundheit — den Schein sieht jeder im Betrieb.“ bleibt (schützt) |
| D1-T15 | Scheine, Fenster eines Entwurfs | „Prüfsumme — Entsteht mit der Unterschrift.“ | am Entwurf ohne Wert | nur am unterschriebenen Schein zeigen |
| D1-T16 | Urlaub, Zeile „Beantragt“ | „Noch nicht entschieden — bitte noch nichts fix buchen.“ | wiederholt den Zustand daneben | Zustand „Beantragt“ genügt; der Rat in die Hilfe und in die Bestätigung nach dem Einreichen |
| D1-T17 | Urlaub, Blatt „Antrag stellen“ | „Der Anspruch ist der Restanspruch beim Umstieg.“ | Bürowissen, nur im ersten Jahr wahr | nur wenn es einen Umstiegsstand gibt, und dann als `hint` an der Maßlinie |
| D1-T18 | Mein Konto | Karte „Darstellung und Bewegung“ | zur Bewegung gibt es nichts zu wählen (folgt dem Gerät, steht in der Hilfe) | Titel „Darstellung“ |
| D1-T19 | Einsatzplan | „Im eigenen Kalender: Eingerichtet am 01.10.2026, 08:00 / Zuletzt abgeholt am 02.10.2026, 22:15“ | zwei Zeitstempel, die nur bei einem Problem helfen | Zeile „Kalender-Abo eingerichtet“ mit Pfeil; Zeiten und die zwei Knöpfe im Fenster |
| D1-T20 | Einsatzplan, Legende | „Einsätze geplant · Heute · Feiertag (AT)“ unter jedem Monat | nützt beim ersten Mal | in die Hilfe; „Feiertag“ bleibt am Tag selbst benannt (Name für die Vorlesehilfe gibt es) |
| D1-T21 | Postfach | „09.11.2026 13:42“ je Gespräch | 16 Zeichen, der Titel wird zu „B-2026-0147 · Hau…“ — auch am Schreibtisch („… Hauptstr…“, `1440_nachr.png`) | kurz (D1-I14) |
| D1-T22 | Verbindungsband (Code) | „Keine Verbindung. Neue Daten können gerade nicht geladen werden. Bei einer Buchung zeigt die jeweilige Bestätigung, ob sie auf diesem Gerät vorgemerkt wurde.“ (155 Zeichen, am Handy vier Zeilen auf jeder Seite) | im Keller steht es dauernd da | „Keine Verbindung — Eingaben werden vorgemerkt.“; Rest hinter „Anzeigen“ (U9) |
| D1-T23 | Rückfrage beim Abmelden (Code, `Layout.tsx:806–814`) | rund 330 Zeichen mit „DIESEM“ in Versalien | zu lang für eine Rückfrage | zwei Sätze: was liegt noch da, was passiert beim Abmelden |
| D1-T24 | Profil-Blatt | „Fassung vorschau“, „App erneuern“, „Datenschutz · Impressum“ | selten gebraucht, steht bei jedem Öffnen da | hinter „Problem melden“ bzw. ans Ende von „Mein Konto“ (D1-I18) |
| D1-T25 | Zeitliste, Zeile am Handy | Datum · Zeit / Baustelle (abgeschnitten) + Nummernstempel / Zustand + Stunden — fünf Angaben in drei Zeilen | der Name ist abgeschnitten, die Nummer nicht | siehe D1-P1 |

Nicht entbehrlich und so zu lassen: „Für diesen Tag gibt es bereits 1 Schein.“, „Kein Ansprechpartner hinterlegt.“, „Lager: 4 Stk (knapp)“, die Zeile unter einem abgeschnittenen Auswahlfeld (E91), „Aufgezeichnet: … Bitte tatsächliche Zeiten und Angaben prüfen.“ im Prüfblatt.

## 7. Was statt der Trennpunkte

Gezählt im Inhalt der elf Seiten (`s10.log`): je Zeile fast immer ein Punkt, höchstens zwei; die Menge entsteht durch Wiederholung — in der Zeitliste 55 Zeilen „Tag · Zeit“ auf einer Seite.

| Nr. | Muster (Beispiel) | Wo, wie oft | Statt des Punkts |
|---|---|---|---|
| D1-P1 | Tag · Zeitspanne: „Mo, 23.11. · 07:00–16:30“, darunter Baustelle + Stempel, darunter Zustand + Stunden | Zeitliste, jede Zeile | Der Tag wird Gruppenkopf (wie der KW-Kopf, leise Dachzeile „MO 23.11.“ mit Tagessumme rechts in Mono). Die Zeile darunter: links der Name der Baustelle (15 px, darf umbrechen), zweite Zeile leise „07:00–16:30“ in Mono und die Nummer; rechts die Stunden in Mono. Das Datum steht je Tag einmal statt je Buchung |
| D1-P2 | Tag · Zeit unter einem Namen: „Di., 24.11.2026 · 07:00–15:30“ | „Nächste Einsätze“, 8 Zeilen | Datumsspalte links wie am Termin der Akten (Dachzeile „DI“, darunter „24.11.“ in Mono, 4,5 rem breit), rechts Name und darunter die Zeit in Mono. Kein Jahr |
| D1-P3 | Tag · Art · Zeit: „Di, 24.11. · Lieferung (Aviso) · 08:00–10:00“ | „Nächste Termine“, „Termine heute“ | dieselbe Datumsspalte; Titel „Lieferung (Aviso)“, Zeit rechtsbündig in Mono; Baustelle und Ort als zweite Zeile mit Ortszeichen |
| D1-P4 | Nummer · Zeit bzw. Nummer · Abrechnung: „B-2026-0147 · 07:00–15:30“, „B-2026-0147 · Regie“, „23.11.2026 · Regie“ | Startseite, Schein, Scheinliste | Nummer als Stempel hinter dem Namen (wie im Einsatzplan); die Zeit als eigene Angabe rechts in der Titelzeile in Mono; „Regie“/„Pauschal“ leise rechts neben dem Datum (unterschiedliche Tinte, 12 px Abstand) |
| D1-P5 | Dreierkette: „B-2026-0147 · 03.08.2026 · 240 h kalkuliert“ | Meine Baustellen | Stempel am Titel; der Rest als Angabenpaare mit Beschriftung („Beginn“, „Kalkuliert“) nebeneinander — oder weg (D1-T9) |
| D1-P6 | Kennzahl-Zusatz: „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“ | Zeiterfassung | zwei kleine Zeilen „Nacht 00:00“ / „Notdienst 09:00“ mit dem Wert rechts in Mono; Zeitraum in die Beschriftung |
| D1-P7 | Knopf-Unterzeile: „07:00–16:30 · 30 min Pause · 09:00 Std“ | „Wie zuletzt buchen“ | links „07:00–16:30“, rechts „09:00 Std“, beide Mono; die Pause weglassen (sie steht im Formular, das sich öffnet) |
| D1-P8 | Titel · Zähler: „Dein Einsatz heute · 4 Einsätze“, „Deine Termine heute · 1 Termin“, „Zeiten am 23.11.2026 · 00:00 Std“ | Startseite, Schein | Zähler rechtsbündig im Kartenkopf in leiser Tinte (wie „noch 1 von 2“ an der Rüstliste); eine Form für alle Karten statt „(10)“, „· 4 Einsätze“ (D1-B9) |
| D1-P9 | Dachzeile und Meta im Seitenkopf: „START · KW 48“, „Montag, 23.11.2026 · Rolle: Mitarbeiter“ | Startseite | Dachzeile „KW 48“ (den Ort sagt der Titel); Meta nur das Datum |
| D1-P10 | Artikel-Meta: „Rohrleitungen · Lager: 4 Stk (knapp)“, „zuletzt 12 Stk · 23.11.2026“ | Material, jede Zeile | Kategorie leise unter dem Namen; Lagerstand als eigene kurze Angabe in Mono mit dem Warnzeichen nur bei „knapp“/„0“, auf einer festen Flucht vor dem Kreis; bei „zuletzt“: Menge in Mono, Datum leise daneben mit Abstand |
| D1-P11 | Nummer · Notiz: „B-2026-0147 · Wird morgen früh auf der Baustelle gebraucht“ | Meine Anforderungen | Stempel am Artikelnamen oder eigene leise Zeile; die Notiz als eigener Satz darunter |
| D1-P12 | Wert · Anmerkung: „10 Urlaubstage · Herbsturlaub mit der Familie“ | Urlaub | „10 Tage“ rechts in Mono neben dem Zeitraum; Anmerkung als zweite Zeile |
| D1-P13 | Nummer · Kurzname als Titel: „B-2026-0147 · Hauptstraße 112–118“ | Postfach, Chatkopf | Titel = Kurzbezeichnung, Nummer als Stempel in der zweiten Zeile vor der Vorschau |
| D1-P14 | Fenster-Meta: „Entwurf 23.11.2026 · Regie“, „Baustelle B-2026-0147 · 08:30 Std“ | Schein-Fenster | Angabenpaare („Datum“, „Abrechnung“, „Baustelle“, „Stunden“) im Raster der Fenster, Werte in Mono |
| D1-P15 | zwei kurze gleichrangige Angaben: „KW 48 · 23.11. – 29.11.“, „Max Mustermann · du“, „6 Stk eingeladen · von Max Mustermann“ | Team-Woche, Rüstliste | **darf bleiben** |
| D1-P16 | „Montag 23.11. · heute“ | Team-Woche | „heute“ weglassen — der Tag trägt schon das Lot im Streifen |
| D1-P17 | Einträge nativer Auswahlfelder: „B-2026-0147 · Wohnungseigentümergemeinschaft …“ | Zeitformular, Schein, Material | **bleibt** — im Auswahlfeld des Geräts gibt es keine Spalten |

Regeln daraus für den Plan: (1) nie mehr als ein Punkt in einer Zeile; (2) Gemessenes (Zeit, Stunden, Menge, Nummer) steht für sich in Mono und braucht kein Zeichen davor; (3) was die Gruppe sagt (Tag, Baustelle), steht im Gruppenkopf; (4) am Schreibtisch feste Spalten statt Ketten; (5) der Punkt bleibt für zwei kurze gleichrangige Wörter und in nativen Auswahlfeldern. Aufwand je Muster klein bis mittel; P1 ist das größte (Zeitliste gruppieren) und braucht die Prüfungen der Liste, des Wischens und der Wochensummen. Bleiben muss: jede Angabe, die heute in der Zeile steht, ist danach in der Zeile oder im Gruppenkopf zu lesen; die Zeile bleibt ganz antippbar; Namen für die Vorlesehilfe behalten Datum und Zeit.

## 8. Nicht angesehen / nur im Code gelesen

- **Nur im Code:** Verbindungsband und Offline-Hinweis (`Verbindungsband.tsx`), „Neue Fassung“-Leiste (`NeueFassung.tsx`), `Speicherleiste` (im Bereich des Monteurs kommt sie nicht vor), „App erneuern“, Rückfrage beim Abmelden mit Ungesendetem, Meldung mit „Rückgängig“ (gesehen nur die Meldung ohne Knopf), Ziehen zum Aktualisieren (nur als installierte App aktiv), Fokusfalle und Ziehgeste der Blätter.
- **In der Vorschau nicht erreichbar:** „Mein Fahrzeug“ (kein Fahrzeuglager in den Beispieldaten), zweiter Faktor in „Mein Konto“ (die Attrappe verlangt keinen), Geburtsdatum (in „Mein Konto“ des Monteurs nicht gefunden), Antragsart „Zeitausgleich“ (die Attrappe wirft einen Fehler), Korrekturantrag als Blatt (nur der Knopf „Korrektur anfragen“ gesehen), Anhang wählen und Foto aufnehmen (Dateidialog des Geräts), PDF des Scheins, eingeklappte Seitenleiste (gibt es nicht — nur breit ab 1.200 px und schmal am Tablet), Lade- und Fehlerzustände der Seiten, Leerzustände außer der Filterleere im Postfach.
- **Nur gestreift:** `/_muster` (8 Teilbilder bei 390, nicht Baustein für Baustein geprüft), Team-Woche und „Meine Baustellen“ am Schreibtisch, dunkler Satz am Tablet und Schreibtisch, 375 px, Querformat, echte Sicherheitszonen des iPhones (Chromium kennt sie nicht), WebKit.
- **Am Gerät zu prüfen, bevor gebaut wird:** D1-A21 (Meldung über der Kopfinsel bei Notch), D1-I5 (hängender Hover), D1-I8 (Drehen als installierte App), D1-I15 (Fußinsel bei offener Tastatur), Statusleiste der installierten App im dunklen Satz.
