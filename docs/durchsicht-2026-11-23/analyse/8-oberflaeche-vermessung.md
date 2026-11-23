# Vermessung der ganzen App — Oberfläche, Arbeitspapier zur Durchsicht vom 23.11.2026

Stand: `main` fa6e740, Vorschau mit Beispieldaten (`tools/vorschau`, Port 5199). Breiten: 390 × 844 (mit Touch), 834 × 1112, 1440 × 900. Chromium 1243.
Bereich `V`: **nur maschinell vermessen** — jede Route je berechtigter Rolle, je Breite; kein Urteil nach Augenschein. Was das Auge braucht (Bedienwege, Wortwahl, Reihenfolge), steht in den Papieren der anderen Bereiche.

**Umfang der Zählung**

| | |
|---|---|
| Routen (mit Modulvarianten und den sechs Plattformseiten) | 65 |
| Route × Rolle | 177 |
| vermessene Zustände (Grundzustand je Rolle; für die Hauptrolle zusätzlich Reiter, Segmente, „Hilfe zu dieser Seite“, ⋯ des Seitenkopfs, Hauptaktion/„Neu …“, Fenster der ersten Zeile, ⋯ im Fenster) | 863 (390 px: 339 · 834 px: 188 · 1440 px: 336) |
| sichtbare Textelemente, je mit Größe, Zeilenhöhe, Gewicht, Familie, Kontrast hell und dunkel | 56 091 |
| Blätter (Lage, Radius, Kontur, Abstände, Raster, Flucht) | 1 933 |
| Knöpfe, Felder, Schalter, Reiter, Segmente (Höhe, Radius, Schrift, Tastfläche) | 13 479 |
| verschiedene sichtbare Textstücke (für Trennpunkte, englische Reste) | 2 385 |

Rohdaten und Skripte (nicht im Repo): `/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/V/` — `lauf.mjs` (Durchgang), `inseite.mjs` (Messung im Browser), `roh-390.ndjson`, `roh-834.ndjson`, `roh-1440.ndjson`, `roh-plattform.ndjson` (eine Zeile je Zustand), `auswerten.mjs` → `alle.txt`, `det.mjs`/`rollen.mjs` (Einzelabfragen), `text.mjs` → `text.ndjson` und `nachtrag.mjs` → `punktzeilen.ndjson` (Zusatzauftrag), `vorschau-messen.txt` (vorhandene Messung), Bilder der Hauptrolle je Zustand hell und dunkel in `bilder/` (1 047 Dateien, Name `<route>__<Rolle>__<Breite>[__reiterN|__segmentN|__hilfe|__menue|__neu|__fenster|__fenstermenue][__dunkel].png`). Im Folgenden heißt dieser Ordner kurz `V/`, die Grundbilder aller Rollen `fotos/` (`…/scratchpad/audit/fotos/`).

**Das Ergebnis in einem Absatz.** Die Bausteine halten die Linie fast ohne Ausnahme: 2 345 von 2 354 Zeilentiteln stehen in 15 px/500, alle 2 462 Zeilenuntertitel und alle 2 246 Zustände in 13 px/400, alle 1 652 Felder in 16 px, alle 160 Fenstertitel in 20 px/500, alle 1 395 Blätter (ohne Musterseite) mit 16 px Radius, feiner Kontur und ohne Schatten; Seitenrand 16 / 24 / 40 px ohne Ausnahme; kein seitlicher Überlauf in 863 Zuständen; kein halbtransparenter Grund, keine Glasfläche, keine Fläche oder Kante in Warn- oder Fehlerfarbe, keine Karte in einer Karte; Schatten nur an Fenstern, Menüs, mobilen Inseln und der schwebenden Hauptaktion; nie mehr als eine Hauptaktion im Seitenkopf. Im dunklen Satz liegt **kein** aktiver Text unter 4,5 : 1 (56 091 Elemente). Die Ausreißer sitzen dort, wo eine Seite **an den Bausteinen vorbei** eigene Klassen schreibt (16 Befunde in Abschnitt 2), und in Dingen, für die es noch **keine Regel** gibt — Zeilenhöhe je Schriftstufe, Größen der Titel, kleine Radien, Mono für Gemessenes in Begleitzeilen (11 Punkte in Abschnitt 3).

## 0. Soll-Werte mit Quelle

| Thema | Soll | Quelle |
|---|---|---|
| Schriftstufen | 12 px Dachzeile/Marke/Zähler/Nummer · 13 px Begleitung (Beschriftung über Wert und Feld, Meta-Zeile, Zustand, Verweis, Filter, kleine Knöpfe) · 15 px Inhalt (Grundschrift, Knöpfe, Menüs, Reiter, Tabellenzellen, Leersätze) · 16 px Feld und Nachrichtentext. Keine 14-px-Stufe. | E97 (`docs/ui-umbau/entscheidungen.md` Z. 4112 ff.), `docs/design/v10/style.md` „Schriftskala nach Rollen“, `src/index.css` Z. 96–102 (`--groesse-*`), `tailwind.config.js` (`fontSize`), `tests/unit/schriftskala.test.ts`, `tests/links/schriftskala.spec.ts` |
| Eigene Größen (nicht Teil der Skala) | Titel (Seite, Blatt, Fenster), große Kennwerte und Uhr, Zeichen, Namenskürzel, Navigation — die Liste `EIGENE_GROESSE` | `tests/unit/schriftskala.test.ts` Z. 47–66; E97 |
| Seitentitel | Source Serif 4, 400. Handy 28/36 px, in einer Akte 24/32; ab Tablet 30/36 | `src/styles/lot-planlinie.css` Z. 51, 71–74, 85 (D11/E86) |
| Blatttitel | 18/24 px, 500 (`.titel-karte` im Blatt); Kontextspalte: 12 px versal | `src/styles/lot-blatt.css` Z. 114; `src/index.css` Z. 1082; `src/styles/lot-akten.css` Z. 20, 59 |
| Fenstertitel | 20/24 px, 500 | `src/styles/lot-planlinie.css` Z. 215 |
| Gewichte, Familien | Text/Titel 400/500, 600 nur der Firmenname; DM Sans (Bedienung), Source Serif 4 (größere Titel), IBM Plex Mono (Gemessenes: Beträge, Zeiten, Datumswerte, Projektnummern, Mengen) | `CLAUDE.md` „Oberfläche“; `style.md` Z. 13–15; `tailwind.config.js` (`fontWeight`) |
| Radien nach Rolle | Arbeitszeile 8 · Feld/Knopf 12 · Blatt 16 · Sheet und mobile Kopf-/Fußinsel 24 px (`--radius-sm`, `--radius`, `--radius-lg`, `--radius-xl`) | `CLAUDE.md`; `style.md` „Radien und Bedienflächen“; `src/index.css` Z. 134–137, 170; `tests/unit/v10Stil.test.ts` Z. 58 |
| Schatten | nur für Schwebendes (Fenster, Sheets, Menüs, Meldung, mobile Inseln); `--shadow-sm`/`--shadow` = none | `CLAUDE.md`; `src/index.css` Z. 138–140, 193 |
| Seitenrand | Handy 16 px · Tablet 24 px · Schreibtisch 40 px (`.inhalt`) | `src/styles/lot.css` Z. 19–21 |
| Raster und Abstand der Blätter | Zelle 24 px; jede Kante eines Blatts auf einer Linie (am Handy die rechte ausgenommen); „unter dem Kopf und zwischen den Blöcken einer Seite 24 px, in jeder Breite“; zwei Blätter nebeneinander trennt eine Zelle | E33; `src/lib/takt.ts`; `src/index.css` Z. 1102–1105; `docs/ui-umbau/seiten-leitfaden.md` (Tabelle `Card`, Regel 1); `tests/durchklick/raster.spec.ts` |
| Flucht im Blatt | Text eine Zelle vom Rand: 24 px ab Tablet, 16 px am Handy (`--blatt-rand`); Blattkopf 72 px hoch, Zeile mindestens 48 px | `src/styles/lot-blatt.css` Z. 53–66, 113–121 (D4/E86, E98); `tests/durchklick/flucht.spec.ts` |
| Tastfläche | zentrale Ziele 44–48 px (`min-h-touch` = 48). Benannte Ausnahme: `Button groesse="klein"` 36 px für Nebenknöpfe in einer Zeile und Schalterreihen | `style.md` Z. 34, 117, 210; `tailwind.config.js` (`minHeight.touch`); `src/components/knopf.ts` Z. 10–22, 88–96 |
| Hauptaktion, ⋯ | eine Hauptaktion je Seite; ⋯ nur im Seitenkopf (Fenster: eigene Regel U4; ⋯ je Zeile nur, wo es schon stand) | `CLAUDE.md`; `style.md` „Hauptaktion, Neu und Fenster“; Leitfaden Regel 2 und 3 |
| Verboten | Pillen, Verläufe, Glasflächen, halbtransparente Farbflächen (außer Schleier/Schatten), Fläche oder Kante in Warn-/Fehlerfarbe, Karte in Karte | `CLAUDE.md`; `tests/unit/v10Stil.test.ts`, `lotGrundwerte.test.ts` |
| Kontrast | 4,5 : 1 (große Schrift ab 24 px oder 18,66 px fett: 3 : 1), hell und dunkel; gesperrte Elemente nimmt WCAG aus | `CLAUDE.md` („Kontraste gemessen“); `tests/unit/lotGrundwerte.test.ts`; `tests/durchklick/barrierefreiheit.spec.ts` |
| Breiten | Handy bis 759 · Tablet 760–1 199 · Schreibtisch ab 1 200 px | `CLAUDE.md`; `tailwind.config.js` (`screens`) |

**Wie gemessen wurde (kurz).** Je Zustand: `document.fonts.ready`, kein `aria-busy` mehr, alle `<details>` und alle `button[aria-expanded="false"]` ohne Menü geöffnet; dann jedes sichtbare Element mit eigenem Text (`getComputedStyle`: Größe, Zeilenhöhe, Gewicht, Familie, Sperrung; Rolle über Klasse/Tag des nächsten Bausteins), Blätter über denselben Selektor wie der Taktgeber (`BLATT_SELEKTOR`), Tastfläche samt absolut gesetzter Pseudo-Elemente und gestreckter Zeilenziele, Kontrast nach WCAG mit dem Hintergrund aus allen Vorfahren (Deckkraft und halbtransparente Flächen eingerechnet). Dunkel: `data-theme="dark"` am Dokument, wie `src/lib/darstellung.ts` es setzt.
**Ein Fehler der eigenen Messung, benannt:** Der erste Lauf kürzte alle Übergänge auf 1 ms. Damit las der Taktgeber seinen eigenen Ausgleich falsch zurück (`src/lib/takt.ts` warnt genau davor), und es standen Blätter mit 0 px Abstand und Texte mit der hellen Farbe im dunklen Satz in den Daten, die es in der App nicht gibt. Der Lauf wurde verworfen und ohne den Eingriff wiederholt; alle Zahlen hier stammen aus dem zweiten Lauf.

## 1. Angesehen

Rollen: MA Mitarbeiter · VW Verwaltung · BH Buchhaltung · PL Projektleiter · GF Geschäftsführung · AD Administrator · PA Plattformadministrator. Die erste Rolle ist die Hauptrolle: für sie wurden die genannten Unterzustände geöffnet (am Tablet nur Grundzustand und Reiter). Jede Rolle im Grundzustand (alles aufgeklappt), jeder Zustand hell und dunkel.

| Route | Rollen | Breiten | Geöffnete Unterzustände (Hauptrolle) |
|---|---|---|---|
| `/` | AD MA VW BH PL GF | 390 / 834 / 1440 | ⋯ Seitenkopf |
| `/ (+zeiterfassung.timer)` | MA AD | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf |
| `/time` | MA AD VW BH PL GF | 390 / 834 / 1440 | Hilfe · Hauptaktion: Neuer Eintrag · Fenster 1. Zeile |
| `/time (+zeiterfassung.timer)` | MA | 390 / 834 / 1440 | Hilfe · Hauptaktion: Neuer Eintrag · Fenster 1. Zeile |
| `/material` | MA VW PL GF AD | 390 / 834 / 1440 | Hilfe · Fenster 1. Zeile |
| `/anforderungen` | AD VW PL GF | 390 / 834 / 1440 | Segment: Einkauf · Segment: Retouren 3 · Segment: Erledigt · Hilfe · Fenster 1. Zeile · ⋯ im Fenster |
| `/lager` | AD VW PL GF | 390 / 834 / 1440 | Segment: Katalog · Segment: Inventur · Hilfe · ⋯ Seitenkopf · Hauptaktion: Wareneingang · Fenster 1. Zeile · ⋯ im Fenster |
| `/lager/inventur/i1` | AD | 390 / 834 / 1440 | — |
| `/my-schedule/mein` | MA | 390 / 834 / 1440 | Hilfe |
| `/my-schedule/team` | MA | 390 / 834 / 1440 | Hilfe |
| `/my-projects` | MA | 390 / 834 / 1440 | Hilfe |
| `/vacations` | AD MA VW BH PL GF | 390 / 834 / 1440 | Reiter: Krankenstände · Reiter: Betriebsurlaub · Hilfe · Hauptaktion: Antrag stellen · Fenster 1. Zeile |
| `/sonderurlaub` | AD MA VW BH PL GF | 390 / 834 / 1440 | Hilfe · Hauptaktion: Antrag stellen |
| `/worksheets` | AD MA BH VW PL GF | 390 / 834 / 1440 | Segment: Alle · Hilfe · Fenster 1. Zeile · ⋯ im Fenster |
| `/worksheet` | MA PL GF AD | 390 / 834 / 1440 | Hilfe |
| `/quotes` | AD BH PL GF | 390 / 834 / 1440 | Segment: Erledigt · Segment: Alle · Hilfe · Hauptaktion: Neues Angebot |
| `/quotes/q1` | AD BH PL GF | 390 / 834 / 1440 | ⋯ Seitenkopf · Hauptaktion: PDF herunterladen |
| `/eingaenge` | AD VW BH PL GF | 390 / 834 / 1440 | Segment: Übernommen · Segment: Abgelehnt · Hilfe · Hauptaktion: Neuer Eingang |
| `/eingaenge/e1` | AD | 390 / 834 / 1440 | — |
| `/nachrichten` | AD MA VW BH PL GF | 390 / 834 / 1440 | Segment: Direkt · Segment: Baustellen · Segment: Ungelesen · Hilfe · Hauptaktion: Neue Nachricht |
| `/nachrichten/k-direkt` | AD MA | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf · Segment: Direkt · Segment: Baustellen · Segment: Ungelesen · Hauptaktion: Neue Nachricht |
| `/liegenschaften (+kunden.liegenschaften)` | AD BH VW PL GF | 390 / 834 / 1440 | Segment: Alle · Hilfe · Hauptaktion: Neue Liegenschaft |
| `/liegenschaften/l1 (+kunden.liegenschaften)` | AD | 390 / 834 / 1440 | — |
| `/customers` | AD BH VW PL GF | 390 / 834 / 1440 | Segment: Anschrift prüfen · Segment: Ohne Kundenart · Hilfe · ⋯ Seitenkopf · Hauptaktion: Neuer Kunde |
| `/customers/k1` | AD BH VW PL GF | 390 / 834 / 1440 | Reiter: Baustellen · Reiter: Belege · Reiter: Termine und Wartungen · Reiter: Stammdaten · Hilfe · ⋯ Seitenkopf · Hauptaktion: Bearbeiten · Fenster 1. Zeile · ⋯ im Fenster |
| `/wartungen` | AD VW PL GF | 390 / 834 / 1440 | Segment: Alle · Hilfe · Hauptaktion: Neue Wartung · Fenster 1. Zeile · ⋯ im Fenster |
| `/admin-projects` | AD PL GF | 390 / 834 / 1440 | Segment: Erledigt · Segment: Alle · Hilfe · Hauptaktion: Neue Baustelle |
| `/admin-projects/p1` | AD PL GF | 390 / 834 / 1440 | Reiter: Scheine · Reiter: Termine · Reiter: Pläne · Hilfe · ⋯ Seitenkopf · Fenster 1. Zeile · ⋯ im Fenster |
| `/assignments/tag` | AD PL GF | 390 / 834 / 1440 | Segment: Monat · Hilfe · ⋯ Seitenkopf · Hauptaktion: Einsatz planen |
| `/assignments/woche` | AD PL GF | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf · Hauptaktion: Einsatz planen · Segment: Baustellen |
| `/assignments/woche?ansicht=monat` | AD | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf · Hauptaktion: Einsatz planen · Fenster 1. Zeile · ⋯ im Fenster · Segment: Baustellen |
| `/assignments/woche?sicht=baustellen` | AD | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf · Hauptaktion: Einsatz planen · Segment: Baustellen |
| `/user-mgmt` | AD GF | 390 / 834 / 1440 | Segment: Deaktivierte · Segment: Alle · Hilfe · Hauptaktion: Benutzer anlegen |
| `/user-mgmt/u1` | AD GF | 390 / 834 / 1440 | Reiter: Arbeitszeit und Urlaub · Reiter: Zugang und Rechte · Hilfe · Hauptaktion: Bearbeiten |
| `/settings/uebersicht` | AD BH GF | 390 / 834 / 1440 | Hilfe |
| `/settings/meldungen` | AD MA VW BH PL GF | 390 / 834 / 1440 | Hilfe |
| `/settings/firma` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/settings/saetze` | AD GF | 390 / 834 / 1440 | Hilfe · ⋯ Seitenkopf |
| `/settings/rechnung` | AD BH GF | 390 / 834 / 1440 | Hilfe |
| `/settings/nummern` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/settings/personal` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/settings/zeitfelder` | AD GF | 390 / 834 / 1440 | Hilfe · Hauptaktion: Feld anlegen |
| `/settings/fahrzeuge (+material.lagerorte_fahrzeuglager)` | AD VW PL GF | 390 / 834 / 1440 | Hilfe · Hauptaktion: Fahrzeug anlegen |
| `/settings/konten` | AD GF BH | 390 / 834 / 1440 | Hilfe |
| `/settings/support` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/settings/module` | AD | 390 / 834 / 1440 | Hilfe |
| `/settings/sicherung` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/settings/papierkorb` | AD PL GF | 390 / 834 / 1440 | Hilfe |
| `/settings/nachrichten` | AD GF | 390 / 834 / 1440 | Hilfe |
| `/costing` | AD GF | 390 / 834 / 1440 | Segment: Laufend · Hilfe |
| `/invoices` | AD BH GF | 390 / 834 / 1440 | Segment: Erledigt · Segment: Alle · Hilfe · ⋯ Seitenkopf · Hauptaktion: Neue Rechnung · Fenster 1. Zeile · ⋯ im Fenster |
| `/invoices/kontoauszug` | AD BH GF | 390 / 834 / 1440 | Hilfe · Hauptaktion: Datei wählen |
| `/accounting` | AD BH GF | 390 / 834 / 1440 | Segment: Woche · Hilfe · ⋯ Seitenkopf · Hauptaktion: Zeit erfassen |
| `/accounting?ansicht=woche` | AD | 390 / 834 / 1440 | Segment: Woche · Hilfe · ⋯ Seitenkopf · Hauptaktion: Zeit erfassen |
| `/_muster` | AD PA | 390 / 834 / 1440 | Segment: Woche · Segment: Monat · Hilfe · ⋯ Seitenkopf · Hauptaktion: Seitenfenster öffnen · Fenster 1. Zeile |
| `/plattform` | PA | 390 / 834 / 1440 | — |
| `/impressum` | AD | 390 / 834 / 1440 | Hilfe |
| `/datenschutz` | AD | 390 / 834 / 1440 | Hilfe |
| `/login` | AD | 390 / 834 / 1440 | ⋯ Seitenkopf |
| `/angebot/annehmen` | AD | 390 / 834 / 1440 | — |
| `/plattform → Support` | PA | 390 / 834 / 1440 | — |
| `/plattform → Fehler` | PA | 390 / 834 / 1440 | — |
| `/plattform → Basiszins` | PA | 390 / 834 / 1440 | — |
| `/plattform → Recht` | PA | 390 / 834 / 1440 | — |
| `/plattform → Konto` | PA | 834 / 1440 | — |
 
Ebenfalls gemessen und in der Tabelle als eigene Zeilen: die fünf weiteren Seiten der Plattform (`/plattform → Support`, `Fehler`, `Basiszins`, `Recht`, `Konto`; „Konto“ am Handy nicht, es liegt dort unter „Mehr“).

## 2. Fehler gegen die Linie

Jeder Befund nennt, was gleich bleiben muss. „× n“ zählt Fundstellen über alle vermessenen Zustände (dieselbe Stelle zählt je Rolle und Breite mit); „Routen“ zählt verschiedene Seiten.

### V-1 Leer- und Fehlersatz der Klasse `leer` steht ab dem Tablet 8 px vor der Flucht
- Ort: `/worksheets`, AD/GF/PL, 834 und 1440 px, Satz „Ob Scheine verrechnet sind, konnte nicht geladen werden …“ (`p.leer` in `.karte-buendig`). Bild: `V/bilder/worksheets__Administrator__1440.png`.
- Ist: erster Text 16 px von der linken Blattkante (gemessen × 6) — Soll: 24 px ab Tablet, wie Titel und Zeilen (`--blatt-rand`, `lot-blatt.css` Z. 61; E98 „Leersätze auf der Flucht“). Am Handy stimmt es (16 px).
- Ursache: am Baustein. `.leer { padding: 1.25rem 1rem }` (`src/styles/lot.css` Z. 184) kennt `--blatt-rand` nicht; die Regel von E98 gilt nur für `.leer-satz`, `.lade-liste`, `.hinweiszeile` (`src/index.css` Z. 1052 f.). `className="leer"` steht an 8 Stellen in 3 Dateien (u. a. `WorkSheetsListView.tsx` Z. 1406, 1436); in der Vorschau ist nur diese eine sichtbar. `flucht.spec.ts` läuft gegen die echte Datenbank, wo dieser Fehlerzustand nicht auftritt.
- Vorschlag: `.leer` in die Regel in `index.css` Z. 1052 aufnehmen (oder die 8 Stellen auf `leer-satz` umstellen). Aufwand: klein.
- Gleich bleiben muss: der Satz selbst und wann er erscheint; am Handy 16 px; in Fenstern der bisherige Abstand. Rückschritt erkennbar an: Satz links vom Titel bei 390 px.

### V-2 Arbeitszeile beginnt ab dem Tablet 4 px vor der Flucht
- Ort: `/anforderungen`, AD/VW/PL/GF, 834 und 1440 px, jede Zeile mit Kästchen (`li.arbeitszeile`). Bild: `V/bilder/anforderungen__Administrator__1440.png`.
- Ist: Kästchen 20 px von der Blattkante (× 16 im Grundzustand, mit den Segmenten × 26) — Soll: 24 px. Am Handy 16 px (stimmt).
- Ursache: am Baustein. `.arbeitszeile { padding: 0.5rem 1rem 0.5rem 0.5rem }` (`src/styles/lot.css` Z. 187): 8 px Polster + 12 px Luft der 44-px-Tastfläche des Kästchens = 20 px; nur für das Handy gibt es eine eigene Regel (Z. 207). `lot-blatt.css` setzt `--blatt-rand` für `.zeile`, nicht für `.arbeitszeile`.
- Vorschlag: im Blatt `padding-left: calc`-frei über einen eigenen Wert (`--blatt-rand-einzug` gibt es schon, Z. 61) setzen, so dass das Kästchen auf 24 px sitzt. Aufwand: klein.
- Gleich bleiben muss: 44 px Tastfläche des Kästchens, Sammelleiste, Reihenfolge; Handy unverändert.

### V-3 Blätter nebeneinander liegen neben dem Raster
- Orte und Ist (Soll jeweils: Kanten auf der Rasterlinie, eine Zelle = 24 px zwischen zwei Blättern, E33):
  - `/invoices`, AD/BH/GF, 1440 px, „Nicht verrechnete Leistung“ | „Mahnlauf“ aufgeklappt nebeneinander: Abstand **20 px**, rechte Kante des linken Blatts +2 px, linke Kante des rechten −2 px neben der Linie (× 6). Bild: `V/bilder/invoices__Administrator__1440.png`. Ursache: `.rechnungen-arbeit { gap: 1.25rem }` (`src/styles/lot-rechnungen.css` Z. 42 f., E98).
  - `/assignments/tag`, AD/PL/GF, 1440 px, Kalender | Formular: Abstand **36 px**, die drei rechten Blätter 9,6 px rechts der Linie, der Kalender 2,4 px links davon (× 3). Bild: `V/bilder/assignments_tag__Administrator__1440.png`. Ursache: `lg:grid-cols-5 lg:gap-x-9` (`src/features/assignments/AssignmentsView.tsx` Z. 374) — Fünftel der Spalte sind keine ganzen Zellen.
  - `/worksheet`, MA/PL/GF/AD, 834 und 1440 px: beide Blätter enden rechts **8 px** neben der Linie (× 8). Bild: `V/bilder/worksheet__Mitarbeiter__1440.png`. Ursache: `.formular { max-width: 35rem }` (`src/styles/lot.css` Z. 289) = 560 px = 23⅓ Zellen; `WorkSheetView.tsx` Z. 1315.
- Warum die Wächter es nicht sehen: `raster.spec.ts` prüft 20 Seiten, darunter `/invoices` (dort sind die Karten zugeklappt oder nur eine da), `/assignments` (Woche, nicht Tag) — `/worksheet` fehlt.
- Vorschlag: `gap: 1.5rem` für die Rechnungskarten; Tagesplanung auf Spalten in ganzen Zellen (z. B. feste Kalenderbreite in Zellen + Rest); `.formular` auf 36 rem (24 Zellen) oder das Blatt im Formular auf `--takt-breite` begrenzen. Aufwand: klein (je eine Zeile), Tagesplanung mittel.
- Gleich bleiben muss: ab 1 200 px beide Rechnungskarten nebeneinander, darunter gestapelt (E98); Kalender links, Formular rechts in der Tagesplanung; einspaltiges Formular des Scheins höchstens ~560 px breit (Leitfaden Regel 9). Rückschritt erkennbar an: `raster.spec.ts` rot oder Umbruch der Rechnungskarten bei 1 200 px.

### V-4 Zweites ⋯ außerhalb des Seitenkopfs in der Angebotsakte
- Ort: `/quotes/q1`, AD/BH/PL/GF, alle Breiten, Knopfreihe der nächsten Schritte im Blatt („Annehmen → Baustelle“, „Annahme-Link“, ⋯ „Weitere Aktionen für die nächsten Schritte am Angebot …“). Bild: `V/bilder/quotes_q1__Administrator__390.png`.
- Ist: zwei ⋯ auf einer Seite, eines im Seitenkopf, eines bei y ≈ 790 px im Blatt — Soll: „⋯ nur im Seitenkopf“ (`CLAUDE.md`; Akte: „alles Weitere im ⋯ des Seitenkopfs“, `style.md` U1 Nr. 2).
- Ursache: an der Seite. `src/features/quotes/AngebotView.tsx` Z. 516 (`RowMenu about="die nächsten Schritte …"`). Sonst stehen ⋯ nur im Seitenkopf (19 Routen), in Fenstern (U4) und je Zeile in `/quotes`, `/customers`, `/admin-projects` (37 Zeilen; vom Leitfaden Regel 3 gedeckt, „wo es heute schon steht“).
- Vorschlag: die Einträge in das ⋯ des Seitenkopfs (`AktenKopf.weitere`) legen. Aufwand: klein.
- Gleich bleiben muss: jeder Eintrag des zweiten Menüs bleibt erreichbar, höchstens einen Tipp weiter; die beiden sichtbaren Knöpfe bleiben. Prüfen gegen `funktionsinventar.test.ts`.

### V-5 Tastflächen unter 44 px am Handy (390 px)
Über alle 339 Zustände bei 390 px, ohne Musterseite: 7 Bausteine. Alles andere Antippbare misst mindestens 44 px (Knöpfe 48, Zeilenknöpfe 44, Segmente 44, Reiter 48, Schalter 44, Symbolknöpfe 44/48, Felder 48).

| Baustein | Ist (B × H) | × / Routen | Ursache | Einordnung |
|---|---|---|---|---|
| Suchfeld der Listenleiste (`.listenleiste-suche input`) | Feld 274–306 × **40**, im 44 px hohen Rahmen; die Lupe und der Rand (26 px links, je 2 px oben/unten) nehmen den Tipp nicht an | 71 / 13 | `src/styles/lot.css` Z. 603–607: Rahmen ist ein `div`, kein `label` (`LotBausteine.tsx` Z. 109) | echter Ausreißer, klein: Rahmen als `<label>` |
| Suchfeld der Nachrichten (`.chat-suche input`) | × **42** | 10 / 2 | `lot-nachrichten.css` Z. 38 (`min-height: 2.625rem`); hier ist der Rahmen ein `label` | knapp; 2 px |
| Person im Vergleich der Mitarbeiterübersicht (`button.ue-person`) | 230 × **32** | 21 / 1 (`/accounting`) | `lot-uebersicht.css` Z. 289 (`.ue-vergleich .ue-person { min-height: 2rem }`); die ganze Zeile trägt `cursor: pointer` | prüfen, ob die Zeile den Tipp annimmt — dann gedeckt; sonst Ausreißer |
| „alle ausblenden“ im Änderungsprotokoll (`button.link`) | 96 × **20** | 7 / 1 (`/time`) | `src/features/time/Aenderungsprotokoll.tsx` Z. 117–124: nackter `link` ohne `min-h-touch` | echter Ausreißer |
| „Im Plan ansehen“ (`a.link`) | 99 × **17** | 2 / 1 (`/vacations`) | `src/features/assignments/EingeteiltHinweis.tsx` Z. 47 | Verweis in einer Zeile für sich, kein Fließtext: Ausreißer |
| Reaktion an einer Nachricht (`button.reaktion`) | **43** × 44 | 6 / 1 | `lot-nachrichten.css` | 1 px, unerheblich |
| Zeitraum „30 Tage / 90 Tage“ (`Button groesse="klein"`) | 74 × **36** | 12 / 1 (`/worksheets`) | `knopf.ts` `klein` | **gewollt** (benannte Ausnahme, `knopf.ts` Z. 10–22) |

- Tablet (834 px, mit dem Finger bedient): zusätzlich die Tageszellen der Monatsplanung (`button.mo-hg`, `mo-kopf`: **18 × 34 bis 18 × 68 px**, 180 Zellen auf `/assignments/woche?ansicht=monat`) und die schmale Sonntagsspalte der Woche (43 px). Das Monatsraster ist als dichtes Raster entschieden (E88; `rand.spec.ts` nimmt es aus) — hier nur als Zahl festgehalten, kein Fehler gegen eine Regel.
- Vorschlag für die echten Ausreißer: Aufwand je klein. Gleich bleiben muss: sichtbare Größe und Lage der Elemente (die Tastfläche wächst über Polster und Gegenrand wie bei `.link-kontakt`, `lot-blatt.css` letzte Regel), Zeilenhöhen.

### V-6 Platzhalter der Personensuche unter dem Kontrast
- Ort: `/accounting` und `/accounting?ansicht=woche`, AD/BH/GF, alle Breiten, Feld „Person suchen“. Bild: `V/bilder/accounting__Administrator__390.png`.
- Ist: Platzhalter `#9CA3AF` auf `#FFFFFF` = **2,54 : 1** (× 16) — Soll 4,5 : 1 mit `--text-placeholder` `#66787D`.
- Ursache: an der Seite. Eigenes Feld `input.ue-suche` (`src/features/accounting/AccountingView.tsx` Z. 1182–1190; `lot-uebersicht.css` Z. 36) ohne `::placeholder`-Regel — es erbt das Grau des Tailwind-Grundstils. `Listenleiste` und `Field` setzen die Farbe.
- Vorschlag: `Listenleiste`-Suche verwenden (behebt zugleich B-5) oder `::placeholder { color: var(--text-placeholder) }` ergänzen. Aufwand: klein.
- Gleich bleiben muss: Suche nach Person, `?suche`-Verhalten, Breite 15 rem ab Tablet.
- Es ist der **einzige** Kontrastbefund an aktivem Text und Platzhaltern in beiden Sätzen. Gesperrte Knöpfe liegen darunter (Hauptknopf gesperrt hell 2,70 : 1, dunkel 3,12 : 1; Nebenknopf 3,16 / 4,41 : 1; × 82) — von WCAG ausgenommen, hier nur genannt.

### V-7 Fehlertafel steht außerhalb der Linie
- Ort: jede abgestürzte Ansicht (in der Vorschau `/lager/inventur/i1`, `/liegenschaften/l1`), alle Breiten.
- Ist: Titel „Da ist etwas schiefgelaufen“ in DM Sans **22/28,8 px, 500**; beide Knöpfe mit **8 px** Radius, von Hand gebaut — Soll: Titelrolle der Linie (Serif-Seitentitel oder Blatttitel 18/24), Knöpfe über `Button` mit 12 px.
- Ursache: `src/app/ErrorBoundary.tsx` Z. 129 (`text-xl font-semibold`), Z. 139 und 148 (`rounded-sm`, eigene Klassen statt `knopfKlassen`).
- Vorschlag: `Button`/`knopfKlassen` und `titel-karte` verwenden. Aufwand: klein.
- Gleich bleiben muss: die Tafel hängt von nichts ab, was selbst abstürzen kann (keine Datenschicht, kein Kontext); „Erneut versuchen“, „Zur Startseite“, „Problem melden“, technische Einzelheiten zugeklappt.

### V-8 Tabelle der Mitarbeiterübersicht: Kopf und Stunden nicht in der Rolle
- Ort: `/accounting` (Monat und Woche), AD/BH/GF, alle Breiten, Tabelle „Tag | Mitarbeiter | Stunden“ in der Projektauswertung.
- Ist: Tabellenkopf **15/22 px, 400, gemischt geschrieben** (× 64) — Soll: 12 px versal wie `.tabelle th` (`lot-planlinie.css` Z. 387; E97 „versale Köpfe … der Tabellen“; so gemessen auf `/quotes/q1` und im Rechnungsfenster, × 50). Stunden in den Zellen in **DM Sans 15 px** (× 308) — Soll: Plex Mono (Gemessenes).
- Ursache: an der Seite. Handgebaute Tabelle mit Tailwind-Klassen (`th.py-1.pr-3.font-normal`, `td.py-1.text-right`) statt `tabelle`.
- Vorschlag: Klasse `tabelle`/`tabelle-eng` und `.mono` für die Stundenspalte. Aufwand: klein.
- Gleich bleiben muss: Spalten, Sortierung, Summen, Umbruch am Handy (der Kopf „Stunden“ bricht dort heute zweizeilig).

### V-9 Beschriftungen im Rechnungsfenster und in der Einsatz-Vorschau in 15 statt 13 px
- Ort: Fenster einer Rechnung (`/invoices`, `/customers/k1`, `/admin-projects/p1`; 390 und 1440 px): „Rechnungsdatum“, „Fällig“, „Netto“, „Umsatzsteuer“ (`dt` in `.rechnung-detail-zeile`, × 50); Vorschau eines Einsatzes im Monat („Zeit“, „Adresse“, `dt.v-label`, × 4). Bild: `V/bilder/invoices__Administrator__390__fenster.png`.
- Ist: 15/22 px grau — Soll: Beschriftung über/neben einem Wert 13 px (E97; so in den Akten × 427, im Wartungs- und Anforderungsfenster × 16, und im selben Rechnungsfenster bei „Betrag/Offen“ × 18).
- Ursache: an der Seite. `dt.text-ink-muted` ohne Größe erbt die Grundschrift; `schriftskala.spec.ts` prüft `dl dt` nur in den vier Akten, nicht in Fenstern.
- Vorschlag: `text-meta` an diese `dt`. Aufwand: klein. Gleich bleiben muss: Zweispaltigkeit Beschriftung links, Wert rechts; Beträge in Mono.

### V-10 Blatttitel der Rechtsseiten 16 statt 18 px
- Ort: `/impressum`, `/datenschutz`, alle Breiten: „Medieninhaber und Diensteanbieter“ usw. (`h2.titel-karte` direkt in `section.space-y-2`, × 12).
- Ist: 16/24 px, 500 — Soll: 18/24 px wie 1 186 andere Blatttitel auf 43 Routen.
- Ursache: Der Titel steht nicht in einem `.karte-kopf`; die 18 px gelten nur dort (`index.css` Z. 1082, `lot-blatt.css` Z. 114). `src/features/recht/RechtSeite.tsx`.
- Vorschlag: `Card title=…` oder die Regel auf `.inhalt .titel-karte` ausdehnen. Aufwand: klein. Gleich bleiben muss: der veröffentlichte Rechtstext wörtlich und in seiner Gliederung.

### V-11 Drei handgebaute Feldbeschriftungen weichen vom Baustein ab
- Ort: „Fahrzeug (Kennzeichen)“ (`/time`, Formular und Fenster), „Notiz“ (Kunde bearbeiten), dazu „Problem melden“ (im Code).
- Ist: Farbe Tinte `#13262C`, Abstand zum Feld **4 px** (× 10) — Soll: grau `#5A6D72`, **6 px** wie 1 372 andere Beschriftungen aus `Field` (`src/components/Field.tsx` Z. 56).
- Ursache: `src/features/time/TimeForm.tsx` Z. 1160, `src/features/customers/KundenakteView.tsx` Z. 1015, `src/components/ProblemMelden.tsx` Z. 78 (`text-meta font-normal text-ink`, `gap-1`).
- Vorschlag: `Field`/`Beschriftung` verwenden. Aufwand: klein. Gleich bleiben muss: `htmlFor`-Bindung, Pflichtstern, wachsendes Textfeld.

### V-12 Titel im Wartungsfenster mit freier Tailwind-Stufe
- Ort: `/wartungen`, Fenster der ersten Zeile, 390 und 1440 px: Kundenname als `p.text-lg.font-semibold` (**18/25,6 px**). Bild: `V/bilder/wartungen__Administrator__390__fenster.png`.
- Soll: eine benannte Titelrolle; `text-lg` steht nicht in `EIGENE_GROESSE`, die Prüfung im Stil sieht Tailwind-Klassen im Code nicht, und `schriftskala.spec.ts` öffnet keine Fenster.
- Ursache: `src/features/maintenance/WartungenView.tsx` Z. 951; dieselbe Klasse in `UserMgmtView.tsx` Z. 380, `BenutzerakteView.tsx` Z. 378 (Startpasswort), `AngebotAnnahmeSeite.tsx` Z. 198.
- Vorschlag: `fenster-titel` bzw. `titel-karte`; Wächter siehe Abschnitt 8. Aufwand: klein.

### V-13 Tastaturfokus setzt jeden Radius auf 8 px — runde Knöpfe werden eckig, Fenster verlieren ihre 24 px
- Ort: jede Seite, sobald ein Element den sichtbaren Fokus trägt (Tab, Enter auf einer Zeile). Aufgefallen am Verwaltungsfenster der Plattform (in der Messung per Skript geöffnet: Radius **8 px** statt 24, × 3 — Bild `V/bilder/plattform__Plattformadministrator__1440.png`), dann nachgemessen (70 × Tab auf vier Seiten bei 1440 px, `V/probe3.mjs`): Knöpfe und Felder **12 → 8 px**, runder Warenkorb-Knopf **999 → 8 px**, Navigationspunkte 12 → 8, ein mit Enter geöffnetes Seitenfenster (`/wartungen`) **24 → 8 px**, solange der Fokus auf dem Fenster liegt. Bilder: `V/bilder/fokus__wartungen_fenster__1440.png`, `V/bilder/fokus__nachrichten__1440.png`.
- Soll: Radius nach Rolle, unabhängig vom Fokus; der Fokus zeigt sich als Ring (`--focus-ring`), nicht als andere Form.
- Ursache: eine Regel für alles. `src/index.css` Z. 401–405: `:focus-visible { outline: …; outline-offset: 2px; border-radius: var(--radius-sm); }` steht **außerhalb der Ebenen** und schlägt damit jede Rundung aus `@layer components` und jede Tailwind-Klasse. Gedacht ist sie offenbar für den Ring an Elementen ohne eigene Rundung (Verweise, Zeilenziele); der Ring folgt in heutigen Browsern ohnehin der Rundung des Elements.
- Vorschlag: `border-radius` aus der Regel nehmen und nur dort setzen, wo ein Element sonst keine Rundung hat (`a:focus-visible`, `.zeile-ziel` …), oder die Regel in eine Ebene unter den Bausteinen legen. Aufwand: klein; betrifft jede Seite — mit `fokusRahmen.spec.ts` und `barrierefreiheit.spec.ts` gegenprüfen.
- Gleich bleiben muss: der sichtbare Fokusring an **jedem** fokussierbaren Element (3 px, 2 px Abstand), Felder mit ihrer einen Linie (`fokusRahmen.spec.ts`), Zeilen mit dem Ring außen. Rückschritt erkennbar an: ein Element ohne Ring bei Tab.

### V-14 Kleiner Knopf mit 8 px, Zeilenknopf mit 12 px Radius
- Ort: `Button groesse="klein"`: `/worksheets` (Zeitraum, 36 px hoch), `/accounting` („Alle Tage vergleichen“, 44 px), `/admin-projects/p1` („Nachtrag anlegen“, „Handwerksschein schreiben“, 48 px), `/plattform` — × 81 mit **8 px**. Daneben der Knopf in `ListRow`-Zeilen („Abgeholt“, „Ablehnen“, „Genehmigen“; 44 px hoch, 13 px Schrift) × 144 mit **12 px**.
- Soll: „Feld/Knopf 12 px“. `knopf.ts` Z. 96 gibt `klein` `rounded-sm` (8 px, der Radius der Arbeitszeile).
- Vorschlag: `klein` auf `rounded` (12 px). Aufwand: klein — eine Stelle. Gleich bleiben muss: Höhe 36 px und 13 px Schrift von `klein`; `symbolknoepfe.test.ts`.

### V-15 Kopf der Akte endet 6 px neben dem Raster
- Ort: `/user-mgmt/u1` (alle Breiten), `/customers/k1` (1440 px): Seitenkopf **102 px** statt 96; am Handy 124 (`/quotes/q1`), 174/198 (`/customers/k1`), am Tablet 150.
- Soll: „Der Kopf schreibt in die Zellen des Rasters“ (`lot-planlinie.css` Z. 48; sonst 72 px am Handy auf 45 Routen, 96 px ab Tablet auf 52 Routen).
- Ursache: `.akten-identitaet { padding-top: 0.375rem }` (`src/styles/lot-akten.css` Z. 12). Die Blätter darunter liegen trotzdem auf der Linie (der Taktgeber gleicht aus) — sichtbar ist nur der um 6 bis 18 px ungleiche Abstand unter dem Kopf.
- Vorschlag: Polster auf eine halbe Zelle bringen oder in die Titel-Luft rechnen (`useKopfTitel`). Aufwand: klein. Gleich bleiben muss: Stand neben der Nummer, Rückweg in der Ortszeile, `handyInhalt.spec.ts` („Titel endet auf einer Rasterlinie“).

### V-16 Meldungen der vorhandenen Messung (`npm run vorschau:messen`)
Lauf vom 23.11.2026: 35 Ansichten mit Meldungen, 0 schwerwiegend (kein seitliches Rollen, kein JS-Fehler). Nach Abzug der Falschmeldungen bleibt **kein** Befund, der nicht oben steht. Die Meldungen im Einzelnen:

| Meldung | Urteil |
|---|---|
| `span.schalter-name` „ragt hinaus“ (62 ×, `/settings/module`) | **Falschmeldung, nicht in der README**: der Name steht dort als Vorlesetext in einem `.sr-only`-Elternteil; der Filter sucht `sr-only` nur am Element selbst (`messen.mjs` Z. 43) |
| `span.ue-zahl-name` „läuft über“ (8 ×, `/accounting` Tablet/Schreibtisch) | Falschmeldung, nicht in der README: ab 760 px bewusst auf 1 px beschnitten (`lot-uebersicht.css` Z. 384) |
| `masslinie-marke` +3 px (54 ×) samt Eltern (`masslinie`, `zeile-stand`, `akten-stunden` …) | Falschmeldung, nicht in der README: das 45°-Häkchen der Maßmarke ragt über ihre 1 px Breite |
| `li.zeile.zeile-ganz`/`li.arbeitszeile` +88 px, `wisch-aktionen` „ragt hinaus“ +72 px (`/time`, `/anforderungen`, Handy) | Falschmeldung, nicht in der README: die Wischaktionen parken rechts außerhalb, die Zeile schneidet ab |
| `form.space-y-4` / `div.lg:space-y-4` +24 px am Tablet (`/time`, `/assignments/tag`) | Falschmeldung: die Aktionsleiste reicht bis an die Blattkante; der Filter nimmt nur 16 px an (`messen.mjs` Z. 109), seit E86 sind es ab Tablet 24 |
| `input` „abgeschnitten“ (`/settings/firma`) | Falschmeldung laut README (Wert länger als das Feld) — der Filter greift nur bei „läuft über“ |
| `span.zeit-kurz-name` abgeschnitten (`/time`, Handy) | gewollt: Kurzbezeichnung mit Auslassungspunkten (E91) |
| `span.zeile-zustand` +38/53 px (`/admin-projects`, Handy) | kein sichtbarer Fehler (Bild `fotos/r_admin-projects__Administrator__390.png`): die feste Breite von 10,5 rem ist schmaler als der umbrechende Inhalt |
| `ol.lot` +12 px, `masskette-pause-text` +6/12 px (`/time`) | nicht sichtbar (innerhalb des Blatts); klein, nicht weiter verfolgt |

Vorschlag: die fünf neuen Falschmeldungen in `HARMLOS` und in die README aufnehmen — sonst liest niemand mehr die Liste. Aufwand: klein.

## 3. Unstimmigkeiten zwischen Seiten (dieselbe Rolle in mehreren Ausprägungen)

### B-1 Zeilenhöhe: je Schriftstufe bis zu neun Werte
Gemessen an DM Sans ohne Navigation, alle Breiten (× Elemente):

| Stufe | Zeilenhöhen |
|---|---|
| 15 px | **22** × 4 982 · 22,5 × 2 478 · 24 × 2 654 · 20 × 322 · 28 × 80 · 18 × 44 · 24,38 × 24 |
| 13 px | **18** × 4 182 · 19,5 × 3 259 · 24 × 3 245 · 20 × 940 · 22 × 417 · 16 × 123 · 15,6 × 27 · 21,45 × 12 · 26 × 9 |
| 12 px | 24 × 1 200 · 18 × 740 · **16** × 587 · 22 × 306 · 12 × 164 · 23 × 147 · 20 × 21 · 14,4 × 21 |
| 16 px | **24** × 1 734 · 22 × 1 |

- Fett: der Wert der Tailwind-Stufe (`tailwind.config.js`). 22,5 / 19,5 / 18 entstehen, wo eine Klasse im Stil keine Zeilenhöhe setzt und das 1,5-Fache erbt; 24 setzen die Blattregeln für Zeilentitel und Meta-Zeile (`lot-blatt.css` Z. 120 f.).
- Sichtbar wird es **in derselben Zeile**: auf `/settings/module` steht die Beschreibung eines Moduls mit 13/24 px, die Zeile „Betrifft: …“ darunter mit 13/18 px (Bild `fotos/r_settings_module__Administrator__390.png`); in der Kundenakte der Verweis im Blattkopf mit 13/19,5 und in der Kontextspalte mit 13/16.
- Einordnung: **von E97 ausdrücklich offen gelassen** („Die Zeilenhöhen selbst bleiben: sie auf ganze Pixel zu zwingen hieße, jede Regel ohne eigene Zeilenhöhe anzufassen“) — also kein Fehler gegen eine Entscheidung, aber die größte verbleibende Unruhe der Schrift. Vorschlag als eigene Entscheidung: je Stufe eine Zeilenhöhe im Fließtext (12 → 16, 13 → 18, 15 → 22, 16 → 24) als `line-height` an den `--groesse-*`-Klassen; 24 px nur für einzeilige Zeilen im Blatt. Aufwand: mittel bis groß (jede Regel ohne Zeilenhöhe; die Höhen vieler Blätter ändern sich um Bruchteile — der Taktgeber gleicht aus). Vorbehalt: Nutzen nur dort sichtbar, wo zwei Werte nebeneinander stehen; zuerst nur diese Stellen. Gleich bleiben muss: Zeilen mindestens 48 px, Blattkanten auf dem Raster (`raster.spec.ts`), keine abgeschnittenen Unterlängen.

### B-2 Titel: zwölf Größen zwischen 16 und 30 px, ohne Stufen
Die Überschriften waren nicht Teil von E97. Gemessen:

| Rolle | Größe/Zeile, Gewicht, Familie | Wo |
|---|---|---|
| Seitentitel | 30/36 400 Serif (ab Tablet) · 28/36 (Handy) · 24/32 (Akte am Handy) · 20/36 (Gespräch am Handy) | alle Seiten |
| Leerzustand mit Zeichnung (`.lot-erstnutzung h2`) | 22/30 500 (ab Tablet) · 19/26 (Handy) | `/admin-projects/p1` Pläne |
| Fehlertafel | 22/28,8 500 | V-7 |
| Start: Name des ersten Einsatzes | 22 (ab Tablet) · 17/24 (Handy) | `/` |
| Fenstertitel, Gesprächstitel | 20/24 500 Sans · 20/28 400 **Serif** (Gesprächskopf ab Tablet) | 51 Routen · `/nachrichten/k-direkt` |
| Blatttitel | 18/24 500 | 43 Routen |
| Titel im Wartungsfenster | 18/25,6 500 | V-12 |
| Planungstitel, Arbeitstag, Zeitraum im Antrag | 17/24 · 17/24 · 17/25,5, je 500 | Planung, Start/Zeit, Urlaub |
| Blatttitel der Rechtsseiten, Monatstitel der Übersicht, Vorschau im Monat | 16/24 · 16 · 16/22, je 500 | V-10, `/accounting`, Monatsplanung |
| Gruppentitel im Fenster (`h3`) | 15/22 und 15/20, 500 · 12/18 500 („Personen“, „Baustellen“ in „Neue Nachricht“) | Rechnungsfenster, „Kunde bearbeiten“, Nachrichten |
| Abschnittstitel der Startseite | 13/22 500 | `/` |

- Vorschlag: eine Titelskala mit Rollen wie bei E97 — z. B. 30/28 Seite, 20 Fenster, 18 Blatt, 16 Gruppe im Blatt/Fenster — und 17/19/22 darauf abbilden. Aufwand: mittel (rund 15 Regeln im Stil, `EIGENE_GROESSE` wird kürzer). Vorbehalt: 17 px der Planung und des Arbeitstags sind in engen Köpfen gesetzt; dort vor dem Ändern messen. Gleich bleiben muss: Serif nur für den Seitentitel (und, wenn gewollt, den Gesprächskopf), Umbruch langer Namen, Kopfhöhen im Raster.

### B-3 Gemessenes steht nicht überall in Plex Mono
Soll (`style.md` Z. 15): Beträge, Zeiten, Datumswerte, Projektnummern, Mengen in Plex Mono. Gezählt an Textstücken, die nur aus dem Wert bestehen (Stichprobe über die erste Probe je Baustein, daher gerundet):

| Wert | in Mono | in DM Sans | Wo in Sans |
|---|---|---|---|
| Baustellen-/Belegnummer („B-2026-0147“) | ~1 560 (`.zeile-nr`, `.stempel`: 12 px, gerahmt) | **~330** (13 px in Begleitzeilen über `span.nr`, das nur den Umbruch verhindert, `index.css` Z. 1423) | Startseite (~130), `/my-schedule/mein`, `/customers/k1`, `/assignments/tag` (42), `/anforderungen` (28), `/invoices` (15), `/my-projects` (9), Fenster |
| Uhrzeit, Stunden | ~1 790 | **~640** | Tabelle `/accounting` (308, V-8), Wochensumme in `/time` (105), Einsatzzeiten im Wochenraster (`.e-zeit`, 84), „08:30 Std“ in Summenzeilen |
| Datum | ~40 | **~190** | Rechnungszeilen („14.08.2026“, „fällig 13.09.2026“, 60), Tagestitel in `/time` ab Tablet (50), Verlauf (`.lot-zeit`, 48), Akten-Angaben |
| Betrag | ~330 | ~23 | Summenzeile über der Rechnungsliste (15), `/settings/saetze` |

- Einordnung: Nummern und Zeiten in Listenzeilen (Wertspalte, Stempel) sind einheitlich Mono; uneinheitlich sind **Begleitzeilen** („B-2026-0147 · Wird morgen gebraucht“) und Datumswerte. Ob ein Datum in einer Meta-Zeile Mono tragen soll, ist eine Entscheidung (E97 nennt „Begleitwert 13“ in Mono als Stufe, legt aber nicht fest, wo). Vorschlag: zuerst die Nummer — ein Baustein `Nummer` (Mono 12 ohne Rahmen für Begleitzeilen, mit Rahmen als Stempel) statt `span.nr`. Aufwand: mittel (rund 25 Stellen). Gleich bleiben muss: kein Umbruch in der Nummer, Kopierbarkeit, Suche nach Nummern (E91).

### B-4 Drei Suchfelder
`Listenleiste` (Rahmen 44, Feld 40 px, Lupe, 13 Routen) · Nachrichten (`.chat-suche`, Feld 42 px, Lupe, als `label`) · Mitarbeiterübersicht (`input.ue-suche`, 44 px, ohne Lupe, falsche Platzhalterfarbe, V-6). Vorschlag: ein Baustein; Aufwand klein bis mittel. Gleich bleiben muss: Platzhaltertexte, `?suche=` in der Adresse, Lage der Suche am Handy oben (E26).

### B-5 Abschnittskopf: versal/400 und gemischt/500 nebeneinander
`.abschnitt` in Listen (Zahl im Achskreis + Wort): 12 px **versal, 400, gesperrt** (× 296, 11 Routen) — `.section-label` in Formularen und Karten: 12 px **gemischt, 500** (× 369, 24 Routen); beide oft auf derselben Seite (`/time`, `/anforderungen`, `/worksheets`). Beides ist entschieden (Versalmarken in 400: E92; `section-label` ohne Versalien: `index.css` Z. 656 ff.) — die Unstimmigkeit ist, dass zwei Dachzeilen-Formen für „Überschrift einer Gruppe“ gelten. Vorschlag: Rollen festschreiben (Liste = versal, Formular = gemischt) und die 18 `h3`/`legend`, die frei gesetzt sind, zuordnen. Aufwand: klein. Vorbehalt: reine Festlegung, kaum sichtbarer Gewinn.

### B-6 Verweise in vier Formen
13/500 („Alle Baustellen ›“, „Erneut versuchen“, × 225) · 13/400 (Adresse als Verweis, × 126) · 15/400 (Kontakt, „Anfordern“, „Nachricht“, × 354) · 15/500 („Übriges zurückgeben“, Kunde in der Akte, × 149). E97 ordnet zu: Verweis 13, Link mit Handlung 15 — das Gewicht ist nicht geregelt (500 und 400 je Stufe). Vorschlag: Gewicht 500 für Verweise mit Pfeil/Handlung, 400 für Kontaktdaten festschreiben. Aufwand: klein.

### B-7 Kleine Radien neben der Skala
8/12/16/24 sind die Rollen. Daneben: **6 px** (Tageszellen der Wochenübersicht `.mw-zelle*`, × 238, `lot-uebersicht.css` Z. 169 ff.) · **5 px** (Kästchen `.checkbox`, × 303) · **4 px** (Tastenhinweis der Suche `.navi-taste`, × 213; Monatsbalken `.mo-balken*`, × 42) · **3 px** (Zähler im Kalendertag, × 138). Vorschlag: ein benannter Wert für „kleines Zeichen“ (4 px) als Token; 6 → 8 (Zeile). Aufwand: klein. Vorbehalt: rein kosmetisch.

### B-8 Monatsbalken tragen noch den 3-px-Petrolstrich links
`button.mo-balken`: `inset 3px 0 0 var(--petrol)` (`src/styles/lot-monat.css` Z. 119; × 96 in der Monatsplanung). In der Woche gilt seit E96 die 2-px-Kontur rundum („davor graue Linie mit 3 px Petrol links“). Ob E96 den Monat mitmeint, steht dort nicht — als Frage an die Entscheidung, nicht als Fehler. Aufwand: klein.

### B-9 Kennwerte im Seitenkopf: 17/400 ab Tablet, 15/500 am Handy
`.lage-wert` im Schriftfeld: Mono 17/24, 400 (× 283, 834/1440 px) — am Handy 15/500 (× 105), Name 12 px ab Tablet / 15 px am Handy, Zusatz 12 / 13 px. Gewollt als kompakte Liste am Handy (E86); genannt, weil Gewicht und Stufe zugleich wechseln.

### B-10 Tabelle im Blatt: Text 16 px hinter der Flucht des Titels
`/quotes/q1` „Positionen“ und die Stückliste im Rechnungsfenster: die Linien der Tabelle liegen auf der Flucht (16/24 px), der Text der ersten Spalte 16 px dahinter (32 px am Handy, 40 px ab Tablet; `.tabelle td { padding: 0.75rem 1rem }`, `index.css` Z. 1384). Bild: `fotos/r_quotes_q1__Administrator__390.png` (unten). `flucht.spec.ts` meldet nur Text **links** vom Titel. Vorschlag: erste und letzte Zelle ohne seitliches Polster im Blatt. Aufwand: klein. Gleich bleiben muss: rechtsbündige Beträge, Summenblock, waagrechtes Rollen der Tabelle am Handy.

### B-11 Reiter der Akte am Handy zwei- und dreizeilig
`button.akten-reiter` bei 390 px: 58 px hoch (zweizeilig, `/user-mgmt/u1` „Zugang und Rechte“), 76 px (dreizeilig, `/customers/k1` als VW „Termine und Wartungen“) statt 48 px. Gewollt ist der Umbruch (`lot-akten.css` Z. 177, vier Reiter gleich breit, `handyInhalt.spec.ts`); drei Zeilen entstehen erst mit fünf Reitern und langem Namen. Vorschlag: ab fünf Reitern rollen statt umbrechen (`data-viele` gibt es schon). Aufwand: klein. Gleich bleiben muss: Adressen `?bereich=`, Pfeiltasten, vier Reiter gleich breit.

## 4. Zusatzauftrag 1 — Trennpunkte „·“ und „•“

Gemessen im **gerenderten** Text jeder Route je Rolle im Grundzustand (nichts aufgeklappt), 390 und 1440 px: 163 Seiten (Route × Rolle) je Breite; dazu der Quelltext. „•“ kommt weder im gerenderten Text (2 385 verschiedene Textstücke aus allen 863 Zuständen) noch im Quelltext vor; Punkte aus CSS (`content`) gibt es keine.

**Vorbehalt, der die Zahlen nach unten zieht:** Die Vorschau hat wenige Beispieldaten (drei Baustellen, eine Handvoll Belege, viele Listen leer). Wie oft der Punkt in einem echten Betrieb auf dem Bildschirm steht, zeigt die Zahl **je Zeile** und der Quelltext, nicht die Summe je Seite.

### 4.1 Im gerenderten Text

| | 390 px | 1440 px |
|---|---|---|
| Punkte gesamt (163 Seiten) | 736 | 840 |
| Seiten mit mindestens einem Punkt | 85 | 163 (ab Tablet steht einer in der Navigation: Rolle · Betrieb) |
| Textzeilen mit Punkt / alle Textzeilen | 697 / 10 676 (6,5 %) | 827 / 15 316 (5,4 %) |
| Listenzeilen mit 1 Punkt · 2 · 3 · 5 Punkten | 205 · 390 · 1 · 4 | 489 · 61 · 1 · 4 |
| verschiedene Textstücke mit Punkt, alle Zustände samt Reitern und Fenstern | 247 von 2 385 (10 %) | |

**Wo sie stehen — Rolle des Textes** (390 px | 1440 px): Zeilentitel 365 | 335 · Zeilenuntertitel 145 | 144 · Navigation 0 | 160 · Verweis 61 | 25 · Absatz 46 | 42 · sonstige Zeile 23 | 23 · Feldbeschriftung/Auswahl 18 | 18 · Zusatz einer Kennzahl im Seitenkopf 16 | 16 · Blatttitel 15 | 15 · Knopf 14 | 24 · Zeilenwert 12 | 12 · Ortszeile im Seitenkopf 8 | 8 · Untertitel im Seitenkopf 8 | 12 · Nummer 3 | 3 · Wert (dd) 2 | 2 · Tabellenkopf 0 | 1. **Zustände tragen keinen Punkt.**

**Was sie trennen** (Paare links · rechts, 390 px; „Baustelle“ = Name oder Anschrift einer Baustelle):

| × | Paar | Beispiel |
|---|---|---|
| 318 | Datum · Zeitspanne | „Mo, 23.11. · 07:00–16:30“ |
| 246 | Zeitspanne · Baustelle | „07:00–16:30 · Wohnungseigentümergemeinschaft Hauptstraße 112–118“ |
| 72 | Zeitspanne · Wortgruppe | „07:00–15:30 · Gemeinde Neudorf bei Wiener Neustadt“ |
| 67 | Datum · Wort | „Mo, 16.11. · Berufsschule“, „23.11.2026 · Regie“ |
| 59 + 39 | Wort · Wortgruppe / Wort · Wort | „Baustelle · Lena Pichler: …“, „Erinnerung · Firmenkunden (€)“, „Montag 23.11. · heute“ |
| 27 + 23 | Wort · Zeitspanne / Wort · Datum | „Besichtigung · 14:00–15:00“, „Angebot · 10.09.2026“ |
| 24 | Name · Nummer | „Anton Berger-Steinmetz · B-2026-0147“ |
| 20 + 12 | Titel · Anzahl / Anzahl · Anzahl | „Dein Einsatz heute · 4 Einsätze“, „4 Stk frei · 0 reserviert“ |
| 18 | Wort · Betrag | „Netto € 0,00 · USt € 0,00“ |
| 13 + 8 | Wortgruppe · Datum / Nummer · Zeitraum | „zuletzt 12 Stk · 23.11.2026“, „B-2026-0148 · 23.11. – 28.11.“ |
| ~60 | übrige 20 Paare (Dauer, Uhrzeit, Anschrift, Prozent …) | „30 min Pause · 09:00 Std“ |

Bei 1440 px fällt „Datum · Zeitspanne · Baustelle“ der Zeiterfassung weg (dort stehen Spalten): größte Paare „Datum · Baustelle“ 246, „Wort · Wort“ 190 (Navigation), „Datum · Wortgruppe“ 80.

**Punkte je Route** (Rolle mit den meisten; 390 | 1440 px): `/time` 60 | 58 (jede Rolle gleich) · `/` 22 | 14 (BH 22, AD 19, GF 16, VW 13, PL 10, MA 8) · `/` mit Arbeitstag 17 | 12 · `/my-schedule/mein` 15 | 16 · `/admin-projects/p1` 8 | 9 · `/assignments/woche?ansicht=monat` 7 | 2 · `/material`, `/lager`, `/assignments/tag`, `/settings/rechnung`, `/accounting` je 6 | 7 · `/wartungen` 5 | 6 · `/my-projects`, `/vacations`, `/quotes`, `/accounting?ansicht=woche` je 4 | 5–6 · `/my-schedule/team`, `/customers/k1`, `/invoices`, `/plattform` je 3 | 3–4 · `/anforderungen`, `/worksheets`, `/assignments/woche` je 2 · `/nachrichten`, `/settings/firma`, `/impressum`, `/datenschutz` je 1. **25 Routen** tragen am Handy keinen Punkt (alle übrigen Einstellungen, `/customers`, `/admin-projects`, `/user-mgmt`, `/eingaenge`, `/quotes/q1`, `/worksheet`, `/costing`, `/sonderurlaub`, Kontoauszug, Liegenschaften — zum Teil, weil die Liste der Vorschau leer ist).

**Zeilen mit drei und mehr Punkten** (Listenzeile als Einheit; in den Beispieldaten nur zwei Muster, dazu drei Textstücke aus Reitern/Fenstern):

| Punkte | Fundstelle | Zeile |
|---|---|---|
| 5 | `/wartungen`, AD/VW/PL/GF, 390 und 1440 px, `li.zeile` Untertitel (`WartungenView.tsx` Z. 761) | „Gasbrennwertkessel Vaillant ecoTEC plus VC 206 · Hauptstraße 112–118, 2700 Wiener Neustadt · alle 12 Monate · Termin 20.09.2026 · zuletzt 20.09.2025 · Schlüssel bei der H…“ |
| 3 | `/wartungen` [Segment: Alle], Untertitel | „Wärmepumpe · alle 24 Monate · Termin 01.03.2027 · noch nie gewartet“ |
| 3 | `/invoices`, AD, Mahnlauf-Karte | „2026-0231 · € 22 104,60 · 71 Tage überfällig · Kundenart fehlt“ (ebenso 2026-0232) |
| 3 | `/my-schedule/mein`, MA, Terminzeile (zwei Textzeilen einer Listenzeile) | „Di, 24.11. · Lieferung (Aviso) · 08:00–10:00“ + „Wohnungseigentümergemeinschaft Hauptstraße 112–118 · B-2026-0147“ |
| 2 | 390 Listenzeilen bei 390 px, davon rund 320 in `/time` | „Mo, 23.11. · 07:00–16:30 · Wohnungseigentümergemeinschaft Hauptstraße 112–118“; ferner „01.09.2026 · gültig bis 01.10.2026 · 240 h kalkuliert“ (`/quotes`), „71 Tage · € 29 592,60 · 2 Mahnungen fällig“, „verrechnen · ‹Baustelle› · 27:02 Std seit 15.09.2026“, „heute · B-2026-0147 · Anton Berger-Steinmetz“ (Start), „Nacht 00:00 · Notdienst 09:00 · letzte 3 Monate“ (`/time`), „B-2026-0148 · 23.11. – 28.11. · 5 Einsatztage“ (Monat), „Wegzeit 45 Min. · Fahrzeug WN-123XY · Notdienst“ (Fenster Zeit) |

### 4.2 Im Quelltext (`src/`, ohne Tests)

| | |
|---|---|
| Dateien mit „·“ | 163 |
| Zeilen mit „·“ | 545, davon 39 Kommentarzeilen → **rund 506 Codezeilen** |
| Vorkommen „ · “ (mit Leerzeichen) | 581 |
| `.join(' · ')` (Teile, die je nach Daten wegfallen — die Zahl der Punkte je Zeile ist dort offen) | **113** in 67 Dateien; meiste: `dashboard/start/regeln.ts` 9, `orders/OrderView.tsx` 5, `liegenschaften/LiegenschaftView.tsx` 5, `orders/Einkaufsliste.tsx` 4, `invoices/InvoicesView.tsx` 4, `assignments/TagFenster.tsx` 4 |
| Zeichenketten-Vorlagen mit „ · “ (`${a} · ${b}`) | **195** Zeilen |
| JSX-Literal `{' · '}` oder `' · '` | 11 |
| Quellzeilen mit zwei und mehr „ · “ | 35; mit drei und mehr: 4 (`WartungenView.tsx` Z. 761, `QuotesView.tsx` Z. 1214, `ZeitsitzungPanel.tsx` Z. 148, `MusterBedienung.tsx` Z. 108) |
| „•“, `&middot;`, `&bull;`, `·`, CSS-`content` mit Punkt | 0 |

Je Bereich (Codezeilen): Startseite 48 · Material/Lager 47 + 16 · Planung 46 · Rechnungen 42 · Zeit 36 · Mitarbeiterübersicht 33 · Musterseite 30 · Scheine 28 · Baustellen 19 · Urlaub 17 · Plattform 17 · Einstellungen 14 · Benutzer, Angebote, Nachrichten je 13 · Kunden 12 · `lib` 11 · Liegenschaften 9 · Wartung 8 · Papierkorb 7 · **`components` nur 6** (`Abschnitt`, `BaustellenSelect`, `BaustellenSuche`, `DokumentAblage`, `RechtLinks`). Meiste je Datei: `InvoicesView.tsx` 28, `dashboard/start/regeln.ts` 28, `WorkSheetsListView.tsx` 15, `TimeView.tsx` 13, `PersonFenster.tsx` 11.

**Befund.** Es gibt **keinen Baustein und keine Hilfsfunktion** für die Trennung: der Punkt wird an rund 500 Stellen von Hand in Zeichenketten gesetzt, in 113 Fällen über `join`, so dass eine Zeile je nach Daten zwei bis sechs Teile trägt. Er trennt dabei Verschiedenartiges mit demselben Zeichen: Datum von Zeit, Zeit von Ort, Name von Nummer, Zahl von Zahl, Wort von Betrag — und in der Abschnittszeile früher Titel von Anzahl („Dringend · 2“, in `Abschnitt.tsx` schon durch den Achskreis ersetzt; auf der Startseite steht „Dein Einsatz heute · 4 Einsätze“ noch so).

**Vorschläge (Ideen, in der Linie; keine Funktion fällt weg):**
1. **Ein Baustein `Angaben`** (Liste von Teilen → eine Zeile) statt `join(' · ')`: eine Stelle, an der sich Zeichen, Abstand, Umbruch (nie am Punkt beginnen) und Höchstzahl regeln lassen. Aufwand: mittel (113 `join` zuerst, die 195 Vorlagen nach und nach). Gleich bleiben muss: jeder Teil bleibt lesbar (nichts kürzen, höchstens in eine zweite Zeile).
2. **Spalten statt Punkte, wo die Teile immer dieselben sind:** `/time` am Handy trägt 60 der 736 Punkte in einer Form, die am Schreibtisch schon Spalten ist („Datum · Zeit · Baustelle“). Tag als Gruppenkopf (wie die Kalenderwoche), Zeit in Mono als Wert rechts — zwei Punkte je Zeile weniger. Aufwand: mittel. Vorbehalt: die Zeile am Handy ist eng; erst mit dem Auge prüfen.
3. **Höchstens zwei Punkte je Zeile** als Regel mit Wächter (siehe Abschnitt 8): die Wartungszeile mit fünf Punkten in Angaben mit Beschriftung zerlegen (Anlage · Ort als Titel/Untertitel; Intervall, Termin, zuletzt als Zustände oder im Fenster).
4. **Typen unterscheiden:** Nummer als Stempel (Mono), Zeit/Betrag als Wertspalte, Zustand als Zustand — dann bleibt der Punkt für gleichartige Teile einer Begleitzeile.

## 5. Zusatzauftrag 2 — Textmenge

Gemessen im Grundzustand ohne Aufklappen, erste Rolle je Route (die mit dem meisten Text ist genannt), ohne Navigation. „Wort“ = Wort oder Zahl. „Über dem Falz“ = was bei 390 × 844 bzw. 1440 × 900 ohne Rollen im Fenster steht (am Handy samt dem Teil hinter der unteren Leiste).

### 5.1 Die 20 textlastigsten Seiten

| # | Route (Rolle) | Wörter gesamt 390 | über dem Falz 390 | gesamt 1440 | über dem Falz 1440 | Seitenhöhe 390 |
|---|---|---|---|---|---|---|
| 1 | `/time` (MA) | 662 | 65 | 670 | 107 | 7 198 px |
| 2 | `/settings/module` (AD) | 630 | 107 | 635 | 139 | 4 966 px |
| 3 | `/my-schedule/mein` (MA) | 406 | 57 | 409 | 139 | 5 470 px |
| 4 | `/` (AD) | 342 | 74 | 347 | 126 | 3 934 px |
| 5 | `/` mit Arbeitstag (AD) | 335 | 60 | 352 | 103 | 3 934 px |
| 6 | `/settings/personal` (AD) | 298 | 110 | 302 | 117 | 3 838 px |
| 7 | `/settings/uebersicht` (AD) | 217 | 73 | 224 | 91 | 2 686 px |
| 8 | `/assignments/tag` (AD) | 215 | 55 | 221 | 113 | 3 238 px |
| 9 | `/accounting?ansicht=woche` (AD) | 205 | 67 | 185 | 114 | 2 902 px |
| 10 | `/admin-projects/p1` (AD) | 194 | 36 | 190 | 83 | 3 862 px |
| 11 | `/accounting` (AD) | 167 | 61 | 194 | 115 | 2 302 px |
| 12 | `/vacations` (AD) | 158 | 64 | 187 | 112 | 2 158 px |
| 13 | `/settings/rechnung` (AD) | 135 | 39 | 140 | 67 | 3 310 px |
| 14 | `/settings/meldungen` (AD) | 134 | 65 | 138 | 72 | 2 230 px |
| 15 | `/settings/firma` (AD) | 134 | 52 | 140 | 70 | 2 896 px |
| 16 | `/settings/saetze` (AD) | 128 | 47 | 132 | 75 | 2 254 px |
| 17 | `/material` (MA) | 122 | 46 | 126 | 63 | 1 990 px |
| 18 | `/quotes/q1` (AD) | 103 | 43 | 100 | 84 | 2 134 px |
| 19 | `/settings/support` (AD) | 102 | 84 | 107 | 92 | 1 198 px |
| 20 | `/customers/k1` (AD) | 101 | 43 | 96 | 82 | 2 086 px |

Am meisten **über dem Falz**: Handy — `/settings/personal` 110, `/settings/module` 107, `/settings/support` 84, `/` 74, `/datenschutz` 74, `/settings/uebersicht` 73; Schreibtisch — `/settings/module` 139, `/my-schedule/mein` 139, `/` 126, Monatsplanung 124, `/assignments/woche` 122, `/settings/personal` 117. Die übrigen 33 Routen liegen unter 100 Wörtern gesamt. `/time` und `/my-schedule/mein` sind lang, weil die Liste lang ist (Daten), nicht weil erklärt wird; **Erklärtext** treibt `/settings/module`, `/settings/personal`, `/settings/support`, `/settings/uebersicht`.

### 5.2 Offen stehende Fließtexte über 20 Wörter
Regel: „Lange Texte nie offen auf die Seite“, Erklärungen in „Hilfe zu dieser Seite“ (`CLAUDE.md`). Über alle 326 Messungen: **11 verschiedene Texte** auf 8 Routen.

| Wörter | Route | Rolle des Textes | Anfang | Einordnung |
|---|---|---|---|---|
| 34 | `/settings/module` | Beschreibung in der Zeile (Untertitel) | „Private Gespräche zu zweit oder in einer kleinen Runde — lesen nur die Teilnehmer, auch nicht die Geschäftsfüh…“ | Erklärung offen |
| 32 | `/invoices/kontoauszug` | Leersatz | „Noch keine Datei gewählt. Senklot liest camt.053, MT940 und CSV der österreichischen Banken und schlägt zu jed…“ | Leerzustand als Anleitung — zweiter Satz in die Hilfe |
| 29 | `/settings/personal` | Text unter der Auswahl | „Der Rest wird übertragen und verjährt zwei Jahre nach dem Jahr, in dem er entstanden ist (§ 4 Abs 5 UrlG). Was…“ | Erklärung einer Option; trägt die Entscheidung — kürzen, Rechtsgrund in die Hilfe |
| 27 / 25 | `/settings/support` | Text unter der Auswahl (zwei Optionen) | „Er sieht den Betrieb wie ein Administrator und kann nichts ändern. Ausgenommen bleiben …“ / „Er kann auch ändern — wie ein Administrator. …“ | Grundlage einer heiklen Wahl — eher belassen |
| 25 | `/` | Hinweiszeile (Ladefehler) | „Nicht geladen: Baustellen und Einsätze. Was hier fehlt, heißt nicht, dass nichts ansteht — bitte die Seite neu…“ | Beispielzustand der Vorschau; Regel U9 (ein Satz + „Anzeigen“) prüfen |
| 23 | `/wartungen` | Untertitel der Zeile | „Gasbrennwertkessel … · … · alle 12 Monate · Termin … · zuletzt … · Schlüssel …“ | Angabenkette, siehe 4.1 |
| 23 | `/settings/personal` | Absatz | „So rechnet der Vorschlag beim Anlegen einer Person, die mitten im Urlaubsjahr eintritt. …“ | Erklärung offen |
| 22 | `/settings/rechnung` | Absatz im Formular | „Mahnspesen gelten je Kundenart; Skonto steht mit Betrag und Frist auf der Rechnung; ab der Mahnung …“ | Erklärung offen |
| 22 | `/datenschutz` | Rechtstext | „Verantwortlich für die Daten ist der Betrieb …“ | Inhalt, kein Befund |
| 21 | `/settings/module` | Beschreibung in der Zeile | „Häuser und Anlagen mit Wohnungen bzw. Einheiten und ihren Beteiligten …“ | Erklärung offen |

Unter der Schwelle, aber in Summe das Meiste: `/settings/module` trägt 25 Listenzeilen mit je einer Beschreibung und einer Zeile „Betrifft: …“ (630 Wörter, bis zu **12 Textzeilen je Listenzeile** am Handy).

### 5.3 Untertitel im Seitenkopf
52 verschiedene Untertitel gemessen; der längste hat **9 Wörter**, keiner über 12. Kein Befund.

### 5.4 Listenzeilen mit mehr als drei Textzeilen am Handy (390 px)

| Route | Baustein | Zeilen | bis … Textzeilen (Höhe) | Beispiel |
|---|---|---|---|---|
| `/settings/module` | `li.zeile` | 25 | 12 (298 px) | „Direktnachrichten und Runden / Teil von Nachrichten / Private Gespräche …“ |
| `/admin-projects` | `li.zeile-gestapelt` | 3 | 10 (282 px) | Name, Nummer, Adresse, Telefon, Projektleitung, Team, Budget |
| `/customers` | `li.zeile` | 2 | 9 (219 px) | Name, Adresse, Kontakt … |
| `/costing` | `li.zeile-gestapelt` | 3 | 8 (204 px) | Name, Nummer, Erlös, Kosten, Deckungsbeitrag |
| `/wartungen` | `li.zeile` | 1 | 8 (244 px) | Kunde, „Seit 64 Tagen überfällig.“, Angabenkette |
| `/my-schedule/mein`, `/assignments/tag` | `li.zeile` | 3 / 2 | 7 (187–191 px) | Termin mit Ort, Teilnehmern, Notiz |
| `/plattform` | `li.zeile` | 3 | 7 (235 px) | Betrieb mit Kennung, Konten, Hinweisen |
| `/vacations` | `li.zeile` | 2 | 7 / 5 | Antrag mit Resturlaub und Hinweis |
| `/quotes`, `/invoices` | `li.zeile` | 2 / 2 | 6 (191–205 px) | Beleg mit Daten, Stand, Betrag |
| `/settings/uebersicht` | `li.zeile` | 6 | 5 (144 px) | Unterseite mit Aufzählung dessen, was dort steht |
| `/lager`, `/worksheets`, `/anforderungen`, Belegzeilen der Akten (`akten-belegzeile`, 101 px) | | 3 / 1 / 1 / 8 | 5 | |
| `/`, `/material`, Baustellenzeile der Kundenakte | | 2 / 1 / 2 | 4 | |

Am Schreibtisch bleiben über drei Textzeilen: `/settings/module` 14, `/time` 6, je 3 in `/my-schedule/mein`, `/vacations`, `/admin-projects`, `/assignments/tag`. Einordnung: Namen der Beispieldaten sind absichtlich lang (README der Vorschau) — eine Zeile Titel kommt daher. Was bleibt, ist die **Zahl der Angaben je Zeile** (Baustellenliste 7, Kundenliste 5–6, Wartung 6).

### 5.5 Dieselbe Angabe mehrfach auf einer Seite
Gezählt: gleicher Text (ab 10 Zeichen oder zwei Wörtern) mehrfach sichtbar, bei 390 px. Wiederholungen, die aus den Daten kommen (dieselbe Baustelle in vielen Zeilen), sind weggelassen; übrig bleibt, was die **Seite** doppelt zeigt:

| Route | Doppelt | Wo |
|---|---|---|
| jede Unterseite der Einstellungen mit Reiterleiste (gezählt an 11; bei kurzen Namen wie „Module“ oder „Personal“ greift die Zählschwelle von 10 Zeichen nicht, der Aufbau ist derselbe) | der Seitentitel („Mein Konto“, „Firmendaten“, „Sätze und Kosten“ …) | als `h1` **und** als aktiver Reiter der Leiste direkt darunter; auf `/settings/rechnung` ein drittes Mal als Blatttitel |
| `/settings/uebersicht` | 11 Namen der Unterseiten | Reiterleiste + Zeilentitel der Übersicht (die Übersicht ist ein zweites Inhaltsverzeichnis) |
| `/user-mgmt/u1` | „Arbeitszeit und Urlaub“ | Reiter + Blatttitel im Reiter |
| `/quotes/q1` | „€ 18 400,00“ (4 ×), „€ 22 080,00“ (2 ×), „A-2026-0088“, Kundenname | Kennzahl im Seitenkopf + Tabelle „Positionen“; Stempel + Verlauf; Untertitel + Verweis |
| `/admin-projects/p1` | Anschrift, „€ 31 008,60“ | Untertitel im Seitenkopf + Angaben; zwei Angaben mit demselben Betrag |
| `/customers/k1` | Anschrift, Telefon, E-Mail | Kopf/Kontaktzeile + Blatt (am Handy stehen Kontextspalte und Kurzkontakt beide im Fluss) |
| `/vacations` | „24 Tage“, „10 Tage“ | Kennzahl im Seitenkopf + Zeile des Antrags |
| `/settings/support` | „Einblick gewähren“ | Blatttitel + Knopf |
| `/settings/module` | „Teil von …“ (14 ×), Modulnamen in „Betrifft: …“ | je Zeile; der Name des Moduls steht als Titel und wieder in „Teil von“/„Betrifft“ der Nachbarzeilen |
| `/nachrichten/k-direkt` | Name des Gegenübers | Seitentitel + über jedem Beitrag (Inhalt des Gesprächs, kein Befund) |

Vorschläge (Ideen): den aktiven Reiter der Einstellungen nicht als zweiten Titel lesen lassen (Titel der Seite bleibt der Bereich „Einstellungen“ **oder** die Leiste verliert am Handy den aktiven Namen) — Vorbehalt: die Adressen und die Suche über Unterseiten (E9) bleiben; Blatttitel, der den Reiter wiederholt, weglassen (`Card` ohne Titel gibt es); in der Angebotsakte die Summe einmal (Seitenkopf) und in der Tabelle nur die Positionen. Aufwand je klein; jeweils mit dem Auge gegenprüfen (Bereiche D1–D4).

### 5.6 Englische Reste, Platzhalterwerte
In 2 385 verschiedenen sichtbaren Textstücken: **kein englisches Wort** der Bedienung. „Invalid Date“ und „undefined“ stehen nur auf `/eingaenge/e1` (eine von mir erfundene Kennung, die Attrappe liefert leere Felder — kein Befund), die englischen Fehlermeldungen nur in den „Technischen Details“ der beiden abgestürzten Vorschauseiten.

## 6. Bedienung und 7. Ideen
Nicht Teil der Vermessung. Aus den Zahlen folgen drei Hinweise für die anderen Bereiche: (1) das Suchfeld nimmt den Tipp auf die Lupe nicht an (V-5); (2) `/time` am Handy ist mit 7 198 px die längste Seite der App — 41 Zeilen einer Baustelle untereinander, jede mit „Datum · Zeit · Baustelle“ (Gruppieren nach Tag oder Woche zuklappbar prüfen); (3) `/settings/module` zeigt 630 Wörter Erklärung offen — die Beschreibung je Modul gehört nach der eigenen Regel hinter „i“/Hilfe, sichtbar bliebe Name, „Teil von“ und Schalter.

## 8. Was die Tests heute nicht erzwingen

| Ausreißer-Art | Heute | Wächter, der es dauerhaft verhindert | Wo |
|---|---|---|---|
| Schrift außerhalb der Skala in **Fenstern, Menüs, Hilfe**, auf Routen außerhalb der 46 Seiten (Plattform, `/settings/rechnung`, `zeitfelder`, `fahrzeuge`, `papierkorb`, `uebersicht`, Liegenschaften, Team-Woche) | `schriftskala.spec.ts` misst `main *` und offene Dialoge, öffnet aber keine | je Seite Hilfe, ⋯, Hauptaktion und erste Zeile öffnen und dieselbe Messung laufen lassen; Routenliste aus `navigation.ts` ableiten statt von Hand | `tests/links/schriftskala.spec.ts` |
| Freie Tailwind-Größen im Code (`text-lg`, `text-xl`, `text-2xl`, `text-3xl`) außerhalb benannter Titel (V-7, V-12) | `schriftskala.test.ts` prüft nur CSS-Dateien und `text-sm` | Quelltextprüfung: `text-(lg|xl|2xl|3xl)` nur in einer Liste erlaubter Dateien/Bausteine | `tests/unit/schriftskala.test.ts` |
| Rolle falsch trotz gültiger Stufe (`dt` 15 statt 13 im Fenster, Tabellenkopf 15 statt 12, V-8/V-9) | Rollenprüfung nur für `dl dt/dd` in vier Akten | Rollen im Browser prüfen: `th` = 12, `dt` = 13 überall (auch im Fenster), `.titel-karte` = 18 | `tests/links/schriftskala.spec.ts` (zweiter Block) |
| Handgebaute Tabellen, Beschriftungen, Knöpfe, Suchfelder an den Bausteinen vorbei (V-6, V-7, V-8, V-11, B-4) | `einheitlicheBausteine.test.ts` deckt einzelne Muster | Quelltextprüfung: `<th`/`<table` nur mit Klasse `tabelle`; `<label` mit `text-meta` nur in `Field`; `type="search"` nur in `Listenleiste` und den Nachrichten | `tests/unit/einheitlicheBausteine.test.ts` |
| Text **rechts** der Flucht oder Baustein ohne `--blatt-rand` (V-1, V-2, B-10) | `flucht.spec.ts` meldet nur Text links vom Titel und läuft gegen Daten ohne Fehler-/Leerzustände dieser Art | (a) im Stil: jede Regel mit `padding` an `.leer`, `.arbeitszeile`, `.tabelle td` muss im Blatt `--blatt-rand` nehmen (Quelltextprüfung gegen die Liste in `lot-blatt.css`); (b) `flucht.spec.ts` zusätzlich über die Vorschau mit `?fehler=`-Zuständen | `tests/unit/blattKanten.test.ts`, `tests/durchklick/flucht.spec.ts` |
| Blätter nebeneinander neben dem Raster (V-3) | `raster.spec.ts`: 20 Seiten, Karten der Rechnungen zugeklappt, `/assignments/tag` und `/worksheet` fehlen | Seitenliste aus der Navigation, Karten aufklappen, jede Unterseite der Planung; zusätzlich Abstand zwischen zwei Blättern = 24 px prüfen | `tests/durchklick/raster.spec.ts` |
| Tastfläche unter 44 px (V-5) | kein allgemeiner Wächter (nur Einzelstellen: Arbeitstag, Reaktion, Kontext) | Browserprüfung bei 390 px über jede Seite: jedes `a, button, input, select, [role=…]` mindestens 44 px in beiden Richtungen (samt Pseudo-Elementen), mit benannter Ausnahmeliste (`Button klein`, Monatsraster, Verweis im Fließtext) — die Messung dafür liegt in `V/inseite.mjs` | neu: `tests/links/tastflaeche.spec.ts` |
| Kontrast von **Platzhaltern** (V-6) und von Seiten außerhalb der drei geprüften Rollen | `barrierefreiheit.spec.ts` (axe) für drei Rollen; axe prüft `::placeholder` nicht | Quelltextprüfung: jedes `<input>`/`<textarea>` außerhalb von `Field` braucht eine `::placeholder`-Regel mit `--text-placeholder`; oder die Kontrastmessung dieses Papiers als Browserprüfung | `tests/unit/lotGrundwerte.test.ts` bzw. neu |
| Form ändert sich mit dem Fokus (V-13) | `fokusRahmen.spec.ts` prüft den Ring, nicht die Form | Browserprüfung: `border-radius` eines Knopfs, Felds, runden Knopfs und eines per Tastatur geöffneten Fensters ist mit und ohne `:focus-visible` gleich | `tests/durchklick/fokusRahmen.spec.ts` |
| Radius außerhalb der Rollen (V-14, B-7) | `v10Stil.test.ts` prüft die vier Tokens, nicht die Verwendung | Quelltextprüfung im Stil: `border-radius` nur als `var(--radius*)`, `999px`/`50%` oder aus einer benannten Liste kleiner Zeichen; `rounded-sm` an Knöpfen verbieten | `tests/unit/v10Stil.test.ts` |
| ⋯ außerhalb des Seitenkopfs (V-4) | `bedienregeln.test.ts` hält die drei Muster der Hauptaktion | Quelltextprüfung: `RowMenu` in einer Ansicht nur in `PageHeader.mehr`, `AktenKopf.weitere`, `Fensteraktionen` oder in `ListRow` (Liste der drei erlaubten Listen) | `tests/unit/bedienregeln.test.ts` |
| Zeilenhöhe je Stufe (B-1), Titelgrößen (B-2) | nichts (E97 lässt es offen) | erst nach einer Entscheidung: im Stil je `--groesse-*` eine feste Zeilenhöhe; `EIGENE_GROESSE` auf eine Titelskala mit Werten statt Selektoren umstellen | `tests/unit/schriftskala.test.ts` |
| Mono für Gemessenes (B-3) | `v10Stil.test.ts` prüft Mono in den Akten | nach einer Entscheidung: Browserprüfung — ein Textstück, das nur aus Nummer/Betrag/Zeit besteht, steht in Mono | `tests/links/schriftskala.spec.ts` |
| Mehr als zwei Trennpunkte je Zeile (Abschnitt 4) | nichts | Quelltextprüfung: Zeichenkette mit drei „ · “ verboten; `join(' · ')` nur über den Baustein `Angaben`, der die Höchstzahl kennt; im Browser: Listenzeile mit mehr als zwei Punkten rot | `tests/unit/schreibweise.test.ts`, `tests/links/schreibweise.ts` |
| Lange Texte offen (Abschnitt 5.2) | `warntextKurz.test.ts` nur für Warntexte (über 160 Zeichen) | dieselbe Grenze für Beschreibungen in Zeilen und Absätze in Blättern (Quelltext: `<p>`/Untertitel-Literal über 160 Zeichen außerhalb von `InfoHint`/`hilfe`) | `tests/unit/warntextKurz.test.ts` |
| Falschmeldungen der vorhandenen Messung (V-16) | README nennt sechs | `HARMLOS` um die fünf neuen ergänzen; dann darf `vorschau:messen` in der CI mit „0 Befunde“ laufen | `tools/vorschau/messen.mjs` |
| Übergänge stören den Taktgeber | `taktOhneUebergang.test.ts` (Stil der App) | gilt auch für Prüfwerkzeuge: Hinweis in der README der Vorschau, dass Messskripte keine Übergänge kürzen dürfen (so geschehen im ersten Lauf dieser Vermessung) | `tools/vorschau/README.md` |

## 9. Nicht vermessen

- **Nicht erreichbar in der Vorschau:** Anmeldung (`/login` leitet mit der Attrappe auf die Startseite), Zwei-Faktor-Seiten, erstes Passwort, Wiederherstellungscodes; `/angebot/annehmen` nur im Zustand „Link nicht gültig“; die Zählliste (`/lager/inventur/:id`) und die Liegenschaftsakte (`/liegenschaften/:id`) stürzen mit den Attrappen ab — gemessen ist dort nur die Fehlertafel (V-7); `/eingaenge/:id` nur mit leeren Feldern; Supporteinblick, Supportband, Verbindungsband, „App erneuern“, Push-Anmeldung.
- **Nicht geöffnet:** Rückfragen (`ConfirmDialog`, Klasse `.dialog` mit 16 px Radius — im Code gelesen, `src/styles/lot.css` Z. 132; ob 16 oder 24 px gelten soll, ist bei „Sheets 24, Blatt 16“ nicht ausdrücklich geregelt), Meldungen (Toast), Fenster außer dem der **ersten** Zeile, Menüs je Zeile, zweite Ebene in Fenstern, Schritte 2–4 des Handwerksscheins, Unterschriftsblatt, globale Suche (Strg+K), „Mehr“-Liste der unteren Leiste, Wischaktionen, Ziehen in der Planung. Am Tablet nur Grundzustand und Reiter.
- **Zustände:** nur was die Beispieldaten zeigen — kaum Leerzustände bei gefüllten Listen, keine Ladezustände (Skelette), Fehlerzustände nur dort, wo die Attrappe sie liefert (Start, Zeit, Scheine, Baustellenakte). Kein großer Bestand (`?bestand=gewachsen`).
- **Messgrenzen:** Text aus Pseudo-Elementen (`content`) und in SVG, Kontrast von Symbolen, Linien und Fokusringen, Text auf Bildern; Schwebezustände (Zeigen, gedrückt; Fokus nur in der Stichprobe zu V-13); Bewegung; WebKit/Safari und echte Geräte (Sicherheitszonen); Breiten zwischen den drei Referenzen (320, 360, 430, 759/760, 1 199/1 200, 1 920) und Querformat; Zoom. Die Rolle eines Textes ist aus Klasse und Tag abgeleitet — wo eine Seite eigene Klassen hat, steht sie unter „Text: sonst“/„Knopf (ohne lot-knopf)“ und ist nur über die Stufen, nicht über die Rolle geprüft (rund 3 300 Elemente unter diesen beiden Rollen, überwiegend Raster der Planung und der Mitarbeiterübersicht; weitere rund 2 500 als „Absatz/Liste“).
- **Trennpunkte und Textmenge:** nur Grundzustand, 390 und 1440 px; Zahl je Seite hängt an den Beispieldaten (siehe Vorbehalt in 4).
- **Musterseite `/_muster`:** vermessen (AD und PA), aber aus den Verteilungen herausgenommen — sie zeigt Bausteine in Probe-Rastern (Abstände zwischen ihren Blättern: 30 von 524 kein Vielfaches von 24; Kalendertage 41 × 68 px im schmalen Probeblatt; Skelett-Balken mit vollem Radius). Schrift außerhalb der Skala nur an ihren Titelproben. Kontrast hell und dunkel ohne Befund.
