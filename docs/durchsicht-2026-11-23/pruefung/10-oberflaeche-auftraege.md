# Gegenprüfung: `analyse/10-oberflaeche-auftraege.md` (Büro — Aufträge, Oberfläche) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand main fa6e740 (Arbeitsstand 663b684, danach nur Dokumente).

**Womit geprüft:** Vorschau `http://localhost:5199/tools/vorschau/` mit eigenen Playwright-Skripten
(Chromium 1243; 1440 × 900, 834 × 1112, 390 × 844 mit Touch, zusätzlich 375 × 812), gemessen mit
`getBoundingClientRect` / `getComputedStyle`; Quelltext gelesen; Regelwerk: `CLAUDE.md` „Oberfläche“,
`docs/design/v10/style.md`, E74/E76 und E92–E99 in `docs/ui-umbau/entscheidungen.md`,
`docs/stand-2026-10-03.md` §112–§118. Skripte und Bilder:
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/pruef-d2/`
(`a1.mjs` … `such.mjs`, Bilder unter `b/`). Keine Zahl ist aus dem Papier übernommen.

**Eingespeiste Daten:** Auftragseingang, Liegenschaften, Annahmeseite und der Angebotsentwurf zeigen in
der Vorschau nur mit den im Browser eingespeisten Beispieldaten etwas (übernommen wurde nur die
Einspeisung aus `D2/lib.mjs`, keine Messung). Bei jedem Befund aus diesen Bildschirmen steht unten, ob
er am Code hängt (dann ist er ein Befund der App) oder an den eingespeisten Werten. Ergebnis: **kein
A-Befund ist eine bloße Folge der eingespeisten Daten**; drei Aussagen sind dagegen Folgen der
Attrappen (Zähler an den Segmenten der Kundenliste fehlt nur in der Vorschau — D2-B11, D2-T20;
„Material konnte nicht geladen werden“ zählt bei D2-I10 als leere Karte mit).

## 1. Ergebnis in Zahlen

| Urteil | Anzahl |
|---|---|
| bestätigt (nachgestellt) | 51 |
| bestätigt (am Code) | 13 |
| teilweise | 21 |
| widerlegt | 2 |
| nicht prüfbar | 0 |
| **Summe** (A 20, B 11, C 14, I 13, T 20, P 9) | **87** |

Je Gruppe: A 14 bestätigt / 6 teilweise · B 9 / 2 · C 13 / 1 · I 11 / 2 · T 12 / 6 / 2 widerlegt · P 5 / 4.

## 2. Je Befund

### 2.1 Fehler gegen die Linie (D2-A)

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| D2-A1 | **teilweise** | 390 px: Titel y 498–522, Knopf (`a.lot-knopf`, 194,5 × 48) y 512–560 → 10 px Überdeckung, Kartenkopf 72 px; Regel `index.css:1134` wirkt (`margin-block −14px`). **Umfang größer als im Papier:** dieselbe Überdeckung am Tablet 834 px (Titel y 584–608, Knopf y 598–646; Zeile 360 px < 366,5). Bei 1440 in Ordnung. | „Gleich bleiben muss … der Knopf im Kartenkopf am Tablet“ stimmt nicht — dort ist er heute kaputt. Der vorgeschlagene Selektor (`a.akten-verweis, a.link-still`) lässt `a.link-weiter` im Kartenkopf fallen („Im Auftragseingang“ in der Kundenakte, „Mein Einsatzplan“ auf der Startseite, gemessen `a1b.mjs`) → deren Kopf würde höher (E31). Sicherer: `a:not(.lot-knopf)`. Quelle: E99 („Handwerksschein schreiben“ als Zweitknopf im Kopf der Karte) + style.md „Nichts wird verdeckt“. |
| D2-A2 | bestätigt (nachgestellt) | Kunden- und Baustellenakte, 1440: `.aktionsleiste` unten 855, `.fenster-inhalt` unten 875 (Polster 20 px), `bottom: 0px`, im Streifen liegt ein `INPUT`; Bild `b/a2_customers_1440.png`. `index.css:1306` überstimmt `lot-akten.css:103`. | Quelle U1 Muster 3 trägt. Bleibt gleich ergänzen: Benutzerakte (`/user-mgmt/u1`, dasselbe 480-px-Fenster, anderer Bereich) und die Prüfung zur Blattkontur (`blattKontur.spec.ts`, §95). |
| D2-A3 | **teilweise** | `div.fuss-aktionen.fensteraktionen` 159 × 65 bei y 274 (1440) bzw. y 475 (390), Elternteil `display: flex`; Knöpfe „⋯“ und „PDF laden“ (gerahmt), keine gefüllte. Messwert stimmt. | **Die Lage über den Angaben ist gewollt:** `RechnungDetail.tsx:113–152` („Stand am Beleg … oben, direkt über den Handlungen, statt erst unter Positionen und Summen“, V10 Auftrag 11.5; style.md „Rechnungen: … die nächste Aktion stehen direkt am Beleg“). U4 sagt „Hauptaktion rechts, zweite links, Rest im ⋯“ — **nicht „als Fuß“** (der Zusatz steht im Papier außerhalb des Zitats). Fehler ist die geschrumpfte Breite und die Linksstellung. „Aktionen als Fuß am Ende“ dreht die gewollte Lage zurück, außer der Fuß klebt sichtbar. `RechnungDetail` steht auch auf `/invoices` (dort hat `haupt` einen Wert) — dort zuerst ansehen. |
| D2-A4 | bestätigt (nachgestellt) | „Eintragen“: Farbe `rgb(180,35,24)`, Grund weiß; daneben „Anlegen“ gefüllt petrol. Über den ganzen Bereich gezählt (36 `ConfirmDialog`): 13 ohne Ton, 12 davon löschen/entfernen, einzig `WartungenView.tsx:1148` nicht. | Wächter: „Verwerfen“ trägt heute bewusst `primary` (Papierkorb ist umkehrbar) — nicht in die Liste der roten Wörter aufnehmen. |
| D2-A5 | bestätigt (nachgestellt) | 1440: `p.leer` Text ab x 288 (Titel/Zeilen 296); Auswahl „Top“ x 288–1384 in `div.px-4.pb-2` (`LiegenschaftView.tsx:317`); „Weitere Kunden laden“ / „Weitere Vereinbarungen laden“ ab x 288. Handy bleibt 16 px (32/32 gemessen). Deckt sich mit V-1 der Vermessung. | „`flucht.spec.ts` um die drei Seiten erweitern“ trifft es nicht: `/worksheets`, `/customers`, `/wartungen` **stehen schon in der Liste** — die Prüfung überspringt Karten ohne `.titel-karte` (`flucht.spec.ts:30–31`); zu erweitern ist die Bezugslinie, und Liegenschaftsakten fehlen in `akten()`. Der `.leer`-Satz der Vorschau ist ein Ladefehler der Attrappe; die Klasse steht aber auch am echten Leersatz (`WorkSheetsListView.tsx:1406–1444`). |
| D2-A6 | **teilweise** | `dd` mit Verweis 48 px, daneben 22 px (Eingang) bzw. 24 px (Akten); Kontextspalte gleicht aus (Verweis 64 in `dd` 40). Messwert stimmt. | **Keine der Quellen trägt es als Fehler** — nur die Analogie zur Kontextspalte (E72) und zum Kartenkopf (E31); es ist eine Unstimmigkeit. Der Vorschlag `.akten-angaben dd > …` **erreicht die erste genannte Stelle nicht**: der Eingang nutzt `dl.beleg-angaben`. Tastfläche am Handy nachmessen (heute 48). |
| D2-A7 | bestätigt (nachgestellt) | Reiter „Belege“: Nummer DM Sans 15/500 petrol, „€ 22 104,60 brutto · Überfällig“ DM Sans 13 grau, kein Zeichen, kein Pfeil, Zeile 48–49 px; Übersicht und Baustellenakte: `akten-belegzeile` 74,5 px, Betrag Plex Mono 15/500, Pfeil. Code `KundenakteView.tsx:578–600`. | Mit D2-P2 abstimmen (P2 ändert dieselbe Zeile), sonst wird zweimal umgebaut. |
| D2-A8 | bestätigt (nachgestellt) | Tops, Beteiligte, Wartungs- und Scheinliste: Zeile mit innerem Knopf, kein `svg.zeile-pfeil`, kein ⋯. Quelle E99 trägt; Ausnahme „Nie ⋯ und ›“ steht in `entscheidungen.md:336`. | Die Top-Zeile öffnet das **Änderungsformular** („Top 7 ändern“), kein Lesefenster — nach E74 wäre dort auch der Stift zulässig; entscheiden, welches Zeichen. |
| D2-A9 | **teilweise** | Messwerte stimmen: runder gefüllter Knopf 48 × 48 (sichtbar 40), `rgb(15,69,82)`, an „Termine“, „Tops“, „Beteiligte“; Handy, Reiter „Termine“ der Baustellenakte, gerollt: `data-eingezogen`, zwei gleiche „+“ (Bild `b/a9_bt_390_gerollt.png`). | **(a) ist kein Fehler, sondern Entscheidung E76 (10.11.2026):** „Etwas Neues in einer Liste ist der Petrol-Kreis … Umgestellt: ‚Termin anlegen‘ (Karte ‚Termine‘), ‚Top anlegen‘ und ‚Beteiligten eintragen‘“. Der Plan hält das mit E-N fest („runder Kreis bleibt in Listen“). Vorschlag (a) widerspricht beidem. **(b):** das Plus für „… planen / … anlegen“ ist E95 (`useEinziehen.ts:66–76`); ein anderes Zeichen darf nicht zurücknehmen, dass „Einsatz planen“ sich in der Einsatzplanung einzieht. |
| D2-A10 | **teilweise** | Hauptaktion in Entwurf und versendet „PDF herunterladen“ (gefüllt); zwei ⋯ (Kopf: abgelehnt/Entwurf/Kopie bzw. Verwerfen; Verlauf: „Per Mail senden“, „Neue Fassung“ — beim Entwurf „Annehmen → Baustelle“, „Annahme-Link“, „Per Mail senden“). Buchhaltung: nur PDF. Handy: schwebende Aktion x 211–374 / y 718–766 über „Annehmen → Baustelle“ x 64–258 / y 736–784 (47 px, ein Viertel, nicht die Hälfte). „8 px eingerückt“ nicht nachvollzogen (Knopf bei x 1167 wie die anderen). | Das zweite ⋯ ist **eine Woche alt und gewollt** (`AngebotView.tsx:471–478`, U1/U4 der Durchsicht 15.11.: „alles Weitere im ⋯ am selben Punkt“), steht aber gegen `CLAUDE.md` „⋯ nur im Seitenkopf“ — das trägt. „Hauptaktion = nächster Schritt“ trägt keine Quelle (U1 Muster 2 verlangt eine Aktion, nicht welche). **Plan und Papier nennen verschiedene Reihen** (siehe 4). Bleibt gleich ergänzen: die Meldung mit „Rückgängig“ (F15), `leerNichtAnnehmen`, der Papierkorb-Stand („Wiederherstellen“ als Hauptaktion). |
| D2-A11 | bestätigt (nachgestellt) | `/quotes`: „€ 22 080,00 brutto“ ein Textknoten, Plex Mono 15/400. „Neues Angebot“: Summen DM Sans 15, Positionswert DM Sans **13** (Papier: 15). Angebotsakte: Summen Mono, rechtsbündig (r = 1064). | Das genannte Vorbild (Baustellenliste, `<small>`) misst 13 px, nicht die 12 px für die Einheit nach E97 — Vorbild ist die Belegzeile (`small` 12). |
| D2-A12 | bestätigt (nachgestellt) | 1440: Zustand beginnt bei x 665/786 (Text 685/806), Betrag endet 1018/1080; 834: Zeile 1 mit zwei Knopfreihen (176 px), Zeile 2 mit einer (128 px); 390: Betrag in Zeile 1 links unter dem Stand, in Zeile 2 rechts daneben. Quelle „Zahlen bleiben tabellarisch“ trägt. | Siehe D2-C12/P5: am Handy darf der Stand nicht entfallen. |
| D2-A13 | bestätigt (nachgestellt) | Suchfeld x 284 (Segmente 140) auf `/customers`, `/quotes`, `/admin-projects`, `/wartungen` **und `/eingaenge`**; Regel `lot.css:592`. Baustellenakte: `h1` 288,8 × 168 px, Knöpfe x 429–788; Schriftfeld 170 px (3 + 1, Bild `b/a13_baustelle_834.png`); „Angebot ·“ / „01.09.2026“ und „€ 31 008,60 brutto · 3 Rechnungen“ zweizeilig. | Die Form P2 löst den Umbruch am Tablet **nicht** in einer Zeile (braucht 467 px, Spalte hat 360) — dort die zweizeilige Handyform. |
| D2-A14 | bestätigt (nachgestellt) | Letzte Zeile mit 1 px Linie und 37,5–43 px Luft („Aktive Baustellen“, „Jüngste Belege“, „Angebote“, „Rechnungen“); „Jüngste Handwerksscheine“ ohne Linie, 25 px; bündige Karten 0–1 px. | Die Zeile liegt in einem `li` — `:last-child` gehört an das `li`. Folgt ein „Alle … zeigen“ unter der Liste, trennt die Linie; dann bleibt sie. |
| D2-A15 | bestätigt (nachgestellt) | 390: „Als PDF“ `position: fixed` x 288–374 / y 788–836 über der Unterschriftsfläche x 32–358 / y 676–836; bei 375 × 812 mitten im Feld (y 756–804). App, nicht Daten (`PageHeader.action`). | Bleibt gleich ergänzen: Stand „neuere Fassung“ und „ungültig“ haben keine Aktion; im Stand „angenommen“ schwebt der Knopf heute über den Angaben. |
| D2-A16 | bestätigt (nachgestellt) | 74 × 36, 74 × 36, 59 × 36 auf 390, 834 **und** 1440. | **Die Randbemerkung „Suchfeld … kein Befund“ ist widerlegt:** die Hülle `.listenleiste-suche` ist ein `div`; ein Tipp auf ihre obere/untere Kante oder auf die Lupe (x 45–63) setzt keinen Fokus (`such.mjs`). Wirksam sind 274 × 40 px — das ist V-5 der Vermessung. |
| D2-A17 | bestätigt (nachgestellt) | 390 und 834: „Aus Eingang EG-“ / „2026-0030“. Nummer ist eingespeist, das Format ist das echte (`20261107300000_auftragseingang.sql:15`). | Ursache ist der Umbruch nach dem Bindestrich an sich, nicht `overflow-wrap`; `OhneUmbruch` behebt es. |
| D2-A18 | **teilweise** | 390: `h1` 24/32 in Kunden-, Baustellen-, Benutzerakte; 28/36 in Liegenschaft, Eingang, Angebot; Titel 246 px breit, 144 px hoch, erstes Blatt y 486. | **Keine Quelle trägt es als Fehler:** E97 nimmt Titel aus (das Papier sagt es selbst), die 24 px sind eine eigene Regel für `.akten-kopf` (`lot-planlinie.css:73`). Es ist die Folge von D2-B1. (b) ändert `PageHeader` für alle Seiten (E31: drei feste Zeilen) — nur zusammen mit D1. |
| D2-A19 | bestätigt (nachgestellt) | Kartenkopf 13 px / 48; „Nachricht schreiben“ 15 px / 48 (nicht im Kopf); Zeilenknöpfe 13 px / 44; „Weiterbearbeiten“ 15 px / 48. E97 trägt. | — |
| D2-A20 | bestätigt (nachgestellt) | 1440: Inhalt 1041 / 1830 / 972 px bei 785 sichtbar, Knopf y 1063 / 1852 / 994, `fuss-aktionen` `position: static`; „Neuer Eingang“, „Neue Liegenschaft“: `planung-fuss` klebend, im Bild. Am Handy ebenso. **Dazu:** „Kunde bearbeiten“ aus der Liste (Fuß y 1046). | Trägt nur sinngemäß U1 Muster 3 („klebend“). Bleibt gleich: siehe 4 zu Paket 5 (Speicherleiste der Akten). |

### 2.2 Unstimmigkeiten (D2-B)

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D2-B1 | bestätigt (nachgestellt) | Jede Zeile der Tabelle nachgemessen (`b1.mjs`): `AktenKopf` bei Kunde/Baustelle/Benutzer, `PageHeader` bei Liegenschaft/Angebot/Eingang; Reiter y 150/350/150/144; 816 + 288 gegen 1128 ohne Kontext; Zeilen 296–1064 gegen 272–1400; Stempel unter (y 148) bzw. neben dem Titel (x 404); `h1` am Handy 24/24/24/28/28; Fenster 480 mit Speicherleiste gegen 440 mit festem Fuß. Klein: der **Eingang hat kein Schriftfeld** (die Spalte „Angebot / Eingang“ sagt 3–4 Zellen). Struktur steht im Code (`LiegenschaftView.tsx:396`), nicht in den eingespeisten Daten. | „Stempel einheitlich“ würde die Baustellenakte verschieben, die E99 gerade festgelegt hat — nur mit eigener Entscheidung. Das Modul „Liegenschaften und Tops“ ist je Betrieb schaltbar; Prüfung braucht Attrappen (Paket 9 vor Paket 15). |
| D2-B2 | bestätigt (nachgestellt) | Liste: 440 px, 13 Felder, Fuß statisch „Abbrechen / Änderungen speichern“, Notiz `input`, Telefon `type=text`; Akte: 480 px, 13 Felder, Abschnitte, `textarea`, `type=tel`, VIES. Feldlisten gleich bis auf die Beschriftung „Name oder Firma“ / „Name“. **Dazu:** das Listenformular schließt nach einer Änderung mit Escape ohne Frage. | — |
| D2-B3 | bestätigt (nachgestellt) | Alle Fenster mit Escape, Schleier und ✕ durchgespielt (`b3.mjs`): Akte Kunde/Baustelle → Rückfrage; „Neuer Kunde“, „Neue Baustelle“ → schließt, Eingabe steht noch da, kein Hinweis im Fenster (und nach Neuladen der Seite weg); „Neuer Eingang“ → weg. **Die offene Zeile des Papiers ist geklärt:** „Neue Wartung“, „Neue Liegenschaft“, „Termin anlegen“ → Eingabe weg. **Dazu:** „Liegenschaft bearbeiten“ (Akte) und „Kunde bearbeiten“ (Liste) verwerfen ebenfalls ohne Frage. Unberührt schließt jedes Fenster ohne Frage. | Der stille Entwurf ist kein gewolltes Verhalten (kein Kommentar, keine Entscheidung) — er entsteht, weil der Zustand in der Liste liegt. Plan und Papier empfehlen Verschiedenes (siehe 4). |
| D2-B4 | bestätigt (am Code) | Wörter im Quelltext und in den Fenstern gefunden („Anlegen“, „Speichern“, „Eingang erfassen“, „Änderung speichern“, „Änderungen speichern“, „Eintragen“ …). | Browserwege stützen sich auf die Namen — Liste der Umbenennungen führen (der Plan sagt es). |
| D2-B5 | bestätigt (am Code) | „PDF herunterladen“ (`AngebotView`), „PDF laden“ (`AkteRechnungFenster`), „PDF“ (`WorkSheetsListView.tsx:1604`), „Als PDF“ (`AngebotAnnahmeSeite`), „PDF erstellen“ (`StundennachweisDialog`). | — |
| D2-B6 | bestätigt (am Code) | Wörter gefunden wie genannt. | Der Vorbehalt des Papiers zu „Annehmen → Baustelle“ gilt; nicht ohne Entscheidung. |
| D2-B7 | **teilweise** | Orte stimmen: Kunde Zeilen-⋯ und Karte „Datenschutz“ („Auskunft herunterladen“, „Löschen …“); Baustellenakte-⋯ nur „Abschließen“, „Stundennachweis“; Liegenschaft und Eingang im ⋯ der Akte; Termin: Stift und Tonne je 48 × 48. Ungenau: Wartung löscht man **nicht im Lesefenster** (⋯ dort: nur „Baustelle anlegen“), sondern im ⋯ von „Wartung ändern“. | **Das Soll trägt nicht:** U4 steht unter „Fenster“ und regelt den Fensterfuß. Stift und Papierkorb in der Zeile sind Entscheidung **E74** (10.11.2026, „Umgestellt: … Termine, … Wartungen, Angebote, Scheine“). Die Tonne am Termin zu entfernen dreht E74 zurück — nur mit Entscheidung. Baustelle im ⋯ der Akte löschen: dieselbe Prüfung wie in der Liste (`loeschWegJetzt`, `AdminProjectsView.tsx:1199`). |
| D2-B8 | bestätigt (nachgestellt) | Kartentitel „Aktive Liegenschaften“ / „Offen“, Segmente y 229 gegen 156. | Ohne Kartentitel fällt die Karte aus `flucht.spec.ts` (Bezug ist `.titel-karte`) — Prüfung mitziehen. |
| D2-B9 | bestätigt (nachgestellt) | Scheinzeile ist ein Verweis `/worksheets?markiert=s1`; `h1` wird „Handwerksscheine“, nach Escape bleibt man dort. „Neue Baustelle“ aus der Kundenakte → `h1` „Baustellen“, nach „Abbrechen“ bleibt man dort. | Das Scheinfenster hat schreibende Aktionen (⋯: Verwerfen, Löschen). In der Akte dieselbe Trennung wie bei der Rechnung halten (`AkteRechnungFenster`: Lesen und PDF in der Akte, Schreiben auf der Fachseite), sonst entstehen zwei Wege zu denselben Ständen. |
| D2-B10 | bestätigt (nachgestellt) | „Nächster Termin“: Tag Plex Mono 24, Zeit Plex Mono 15; Karte „Termine“: ein Satz DM Sans 15/500, Stift und Tonne, Zeile selbst ohne Ziel. | Vorschlag widerspricht **E74** (Stift nur, „wo die Zeile selbst etwas anderes öffnet oder gar nichts“; Papierkorb in der Zeile). Ändern kostet einen Tipp mehr (das Papier sagt es). Nur mit Entscheidung. |
| D2-B11 | **teilweise** | Bestätigt: „aktiv“/„Aktiv“; „Wartungsliste: Zustand mit Punkt“; zwei „mehr“ am Listenende (`/customers`, `/wartungen`), `/quotes` 42 Zeilen, 7.798 px am Handy; „Kontakt ›“ eigene Zeile gegen „Adresse und Kontakt ›“ in der Telefonzeile; Kontaktleiste im Fenster; Fenstertitel „Anlage“; Hilfe-Titel. **Nicht richtig:** (1) „(optional)“ steht nicht nur bei der Wartung — im Bereich auch `QuotesView.tsx:1250` und `LeistungszeitErfassen.tsx:187`, in `src/features` 20-mal gegen 22-mal „(freiwillig)“. (2) Zähler im Segment: die Kundenliste zählt ebenfalls an den Reitern (`CustomersView.tsx:289–305`, vom Server) — in der Vorschau fehlt die Zahl nur, weil die Attrappe keine liefert. (3) Reihenfolge in „Neue Baustelle“: die Liegenschaft steht **absichtlich vor** dem Kunden — sie schlägt den Kunden vor (`LiegenschaftVorschlaege.tsx`, M02c). | „Ein Weg“ am Listenende darf den Satz von `Nachladen` nicht verlieren (siehe D2-T7). Reihenfolge in „Neue Baustelle“ nicht umdrehen. |

### 2.3 Bedienung (D2-C)

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag |
|---|---|---|---|
| D2-C1 | bestätigt (nachgestellt) | Fenster: Quelle „Bitte wählen“, Pflicht; Anliegen 9. von 11 Feldern; leer abgeschickt: „Bitte angeben, woher der Eingang kam.“; ⋯: Angebot anlegen, Besichtigung vereinbaren, Bearbeiten, Ablehnen, Löschen; Verwaltung: nur „Bearbeiten“. Wege nach dem Speichern am Code: `EingaengeView.tsx:237` → Eingang, `EingangView.tsx:526` → Baustellenakte. 14 Tipps stimmen. | **Vorgabe „Telefon“:** die Quelle ist bewusst Pflicht ohne Vorgabe (`eingangText.ts:78`, Spalte `not null` mit Prüfung). Eine Vorgabe macht aus jedem nicht umgestellten Mail-/Hausverwaltungs-Eingang still „Telefon“. Wenn, dann als Einstellung je Betrieb oder „zuletzt gewählt“ — eigene Entscheidung. |
| D2-C2 | bestätigt (nachgestellt) | Formular bis x 856 in einem Blatt 272–1400 über der Liste; Fokus nach dem Öffnen `BODY`; Enter in der Position legt keine an; „Annehmen → Baustelle“ am Entwurf mit € 0,00 am Schreibtisch sichtbar. | Verdacht geklärt, siehe 5. |
| D2-C3 | bestätigt (nachgestellt) | Rückfrage „Angebot annehmen?“; danach Meldung mit „Zur Baustelle“/„Einsatz planen“ (`AngebotView.tsx:316–359`); „Baustelle bearbeiten“ 1.919 px, Abschnitt „Mannschaft“ zuletzt; Kontext „TEAM UND LEITUNG“ ohne Ziel. „19 Felder“ = 13 Felder + 6 Kästchen der Mannschaft. | Der Schritt in der Meldung ist gewollt (`WartungenView.tsx:632` „V4: der Satz führt jetzt auch hin“). |
| D2-C4 | bestätigt (nachgestellt) | Übersicht: „Aktive Baustellen“, „Nächster Termin“, „Jüngste Belege“, keine Summe; Kontext „2 Wartungsvereinbarungen“. Strg+K setzt den Fokus ins Feld; die Suche filtert in der Vorschau nicht. | Siehe D2-I2 (Grenze 500, Rechte). |
| D2-C5 | bestätigt (nachgestellt) | ⋯ → „Neue Baustelle“: Adresse mit der Anschrift des Kunden vorbelegt, Hinweis „Vom Kunden übernommen …“; Seite wechselt. | Die Regel „nach Kundenart“ greift nicht, solange die Kundenart fehlt („Kundenart prüfen“ an jeder Beispielzeile, nach einem Import die Regel). Verdacht geklärt, siehe 5. **Im Plan keinem Paket zugeordnet.** |
| D2-C6 | bestätigt (nachgestellt) | Rückfrage „Baustelle für diese Wartung anlegen?“ mit Projektnummer; „einplanen“ kommt auf der Seite nicht vor; intern heißt der Weg `wartungEinplanen`. | Bleibt gleich ergänzen: `naechsterSchritt` prüft Rolle und Modul (ohne Einsatzplanung führt er zur Baustelle). |
| D2-C7 | bestätigt (nachgestellt) | Strg+K → Fokus im Feld; Fenster: Fokus auf dem Fenster, dann „Schließen“, dann erstes Feld; Enter im Namen → „Kunde angelegt“; Escape → Fokus auf der Zeile; Tab-Folge: 24 Halte vor dem Inhalt. | Der Fokus auf dem Fenster ist gewollt (`BottomSheet.tsx:65–71`). **Im Plan nur über D2-I12 erfasst.** |
| D2-C8 | bestätigt (nachgestellt) | „Top 7 ändern“ → „Beteiligten an diesem Top eintragen“ ersetzt das Fenster; „Wartung ändern“ ersetzt das Lesefenster; nie mehr als Fenster + Rückfrage. | — |
| D2-C9 | bestätigt (nachgestellt) | 390, großer Bestand: Baustellen 60 Zeilen, Seite 9.718 px, erste Zeile 282 px; Wartungen 7.318 px / 40; Angebote 7.798 px / 42; Eingang bis 240 px. | — |
| D2-C10 | bestätigt (nachgestellt) | Erste Zeile bei y 683 (Papier: ≈ 730), davor Kennzahl und Karte. | Siehe D2-T6. |
| D2-C11 | bestätigt (nachgestellt) | Angebot 390: Sprungleiste 447, Verlauf 558, Angaben 1158, Positionen 1590; Eingang: Stand 222, Anliegen 582, Angaben 774. | Hängt an D2-A10: solange die Schritte im Verlauf stehen, schiebt „Positionen zuerst“ sie hinter die Positionen. Reihenfolge der PRs. |
| D2-C12 | bestätigt (nachgestellt) | Angebote: bis zu zwei Knöpfe + Stift + ⋯; Wartungen zwei Knöpfe; Scheine einer. | Der Stift in der Angebotszeile ist E74. „Jede Aktion in höchstens zwei Tipps“ als Prüfung festhalten. |
| D2-C13 | bestätigt (nachgestellt) | „Angebot annehmen“ y 424 vor „Angaben“ 1120 und „Positionen“ 1456 (390). App, nicht Daten. | Rechtlich berührt (Reihenfolge einer verbindlichen Erklärung) — gehört in die Fragen an die Kanzlei, zumindest als Hinweis. |
| D2-C14 | **teilweise** | Papierkorb nur unter Einstellungen (14 Reiter in **zwei** Zeilen bei 1440, nicht „dritte“). **Der Vorschlag ist halb gebaut:** die Meldung nach „Verwerfen“ trägt schon „Rückgängig“ (`QuotesView.tsx:1698–1705`, `AngebotView.tsx:1004`, `WorkSheetsListView.tsx:1664–1674`, F15). | Offen bleibt nur der Verweis aus der Liste. **Im Plan keinem Paket zugeordnet.** |

### 2.4 Ideen (D2-I) — auf Risiko geprüft

| Kürzel | Urteil | Ausgangslage geprüft | Risiko |
|---|---|---|---|
| D2-I1 | bestätigt (am Code) | `PageHeader.nebenAktion` und `AktenKopf.zweit` gibt es. | Rollen: Verwaltung legt keine Baustelle an, Buchhaltung sieht nur PDF — Hauptaktion je Rolle prüfen. |
| D2-I2 | **teilweise** | Die Akte lädt Rechnungen über `rechnungen_des_kunden` mit **Grenze 500** und nur mit Modul „Rechnungen“ und `canInvoice` (`KundenakteView.tsx:366–370`, `pg/invoices.ts:647`). | „Offen € …“ aus der geladenen Liste wäre bei großen Kunden eine **Falschzahl**; ohne Recht/Modul darf die Zelle nicht „€ 0“ zeigen. Summe in der Datenbank rechnen, Zelle weglassen, wo das Recht fehlt. |
| D2-I3 | bestätigt (am Code) | Heute Meldung mit Schritt (`naechsterSchritt.ts`). | Aus der **Liste** angenommen wirft der Sprung in die Akte aus der Arbeit an der Liste; „Rückgängig“ (F15) muss den Seitenwechsel überleben. |
| D2-I4 | bestätigt (nachgestellt) | Halbes Blatt leer (Felder bis x 856 von 1400). | Zwei Zonen sind nach style.md zulässig; Tablet (760–1199) braucht eine eigene Aussage. |
| D2-I5 | bestätigt (nachgestellt) | Enter legt heute keine Position an. | Enter heißt in anderen Formularen „anlegen“ (Kunde) — hier eine andere Bedeutung; im Handbuch nennen. |
| D2-I6 | bestätigt (am Code) | Kein `onContextMenu` im Quelltext. | Zeilen sind Verweise: ein eigenes Rechtsklick-Menü nimmt „In neuem Tab öffnen“; langes Drücken stößt an Textauswahl und Wischen (F15). Sichtbare Aktionen dürfen dafür nicht entfallen. Der Plan stellt es unter „Später“ — richtig. |
| D2-I7 | bestätigt (nachgestellt) | Scheinzeile bei offenem Fenster: `--auswahl` `rgb(228,238,240)` + Kontur; Rechnungszeile der Akte: keine. | gering. |
| D2-I8 | bestätigt (am Code) | `MonatsVorschau.tsx:157–177` blättert mit ← →. | Pfeiltasten in Feldern und beim Rollen des Fensters. |
| D2-I9 | bestätigt (am Code) | Leersätze wie genannt; „Pläne“ mit Zeichnung und Knopf. | „Einsatz planen ›“ im Leersatz der Baustellenakte wäre die Hauptaktion der Seite ein zweites Mal (U3). |
| D2-I10 | **teilweise** | Übersicht am Handy 3.862 px ✔. Karten mit einem Satz: **drei** (Nachrichten, Einsätze, Material), nicht fünf — und „Material“ ist der Ladefehler der Attrappe. | E99: „die leeren Karten Nachrichten und Einsätze (sie tragen den nächsten Schritt)“ sind bewusst geblieben. Der Plan schreibt „zusammengelegt“ — das geht über den Vorbehalt des Papiers hinaus (siehe 4). |
| D2-I11 | bestätigt (nachgestellt) | Kontext „TEAM UND LEITUNG“ ohne Ziel. | Ein zweites Formular für dieselben Felder ist genau D2-B2; denselben Abschnitt wiederverwenden, Warnung „ohne Projektleitung“ mitnehmen. |
| D2-I12 | bestätigt (nachgestellt) | Zwei Tab bis zum ersten Feld. | Gewollt seit Prüflauf 25.09.2026 (`BottomSheet.tsx:65–71`). Unterscheiden nach Eingabegerät, nicht nach Breite — ein Touch-Tablet hat 834 px und bekäme die Tastatur. |
| D2-I13 | bestätigt (nachgestellt) | Formular 1.919 px; die vier Abschnitte gibt es schon als Überschriften („Kunde und Ort“, „Auftrag“, „Zeitraum“, „Mannschaft“). | Sprungleiste klebt oben, Speicherleiste unten (D2-A2 zuerst). |

### 2.5 „Zu viel Text“ (D2-T)

„Wörtlich“ heißt: so im gezeichneten Bild gelesen.

| Kürzel | Urteil | Wörtlich? Entbehrlich? Wo bleibt die Auskunft? | Risiko |
|---|---|---|---|
| D2-T1 | **teilweise** | Wörtlich ✔ (282 px, sieben Angaben). | Begründung falsch: in der Liste gibt es **keine Maßlinie** mehr (`AdminProjectsView.tsx:1127–1140`, seit 14.11.); „nichts gebucht“ unterscheidet „geladen und null“ von „Stand unbekannt“. „Ort ohne Straße“ am Handy nimmt bei einer Hausverwaltung mit mehreren Häusern im selben Ort das Unterscheidungsmerkmal (der Fall D2-C5). U11 (Zustände links, Budget rechts) bleibt. |
| D2-T2 | bestätigt (nachgestellt) | Wörtlich ✔. Im Fenster stehen Anlage, Standort, Intervall, Hinweis, „Zuletzt gewartet“, „Nächste Wartung“ — alles erreichbar. | — |
| D2-T3 | bestätigt (nachgestellt) | Wörtlich ✔ (Text ist eingespeist; dass die Liste das Anliegen ungekürzt zeichnet, steht im Code). Quelle und Anliegen stehen auf der Eingangsseite. | — |
| D2-T4 | bestätigt (nachgestellt) | ✔ | wie D2-B8 (Fluchtprüfung). |
| D2-T5 | bestätigt (nachgestellt) | Alle acht Untertitel wörtlich ✔. **Der Weg in die Hilfe ist schon gebaut:** ein Untertitel als Text gilt als Beschreibung, ist am Handy ausgeblendet und steht in „Hilfe zu dieser Seite“ (`PageHeader.tsx:128–134`, `lot-planlinie.css:209`, E86). | „2 offene Angebote · kalkulieren …“ ist **eine** Zeichenkette — die Zahl verschwindet heute am Handy mit; beim Umbau trennen. |
| D2-T6 | **teilweise** | Wörtlich ✔. | „Geprüft über die 2 geladenen Scheine dieser Liste“ ist nicht Technik, sondern der **Geltungsbereich** von „Alle Stunden gebucht“. Zugeklappt darf der Satz nicht mehr behaupten als geprüft wurde — den Bereich in die Summenzeile nehmen. |
| D2-T7 | **widerlegt** | Wörtlich ✔ — aber **nicht entbehrlich**. `Nachladen.tsx:3–20`: „Eine stillschweigend abgeschnittene Liste ist schlimmer als eine langsame“; in den Wartungen lautet der Satz weiter „Die Suche geht nur über diese.“ Die Zeile „und 1983 weitere anzeigen“ meint Geladenes, das nicht gezeichnet ist; „von möglicherweise mehr“ meint, was **nicht geladen** ist. Mit „weg“ bliebe die Auskunft nirgends. | Streichen wäre ein Rückschritt hinter den 08.09.2026. Zulässig: kürzer fassen. |
| D2-T8 | bestätigt (nachgestellt) | Wörtlich ✔, Karte ohne Titel ✔. Nachweis bleibt einen Tipp entfernt. | Aufklapper als `InfoHint`/`einzelheiten`, nicht als neue Form. |
| D2-T9 | bestätigt (nachgestellt) | „WARTUNGEN / Wartungen öffnen / 2 Wartungsvereinbarungen“ ✔ | Tastfläche des Verweises (E72). |
| D2-T10 | bestätigt (nachgestellt) | „ENDE GEPLANT —“ ✔, „nicht angegeben“ ✔ („nicht hinterlegt“ nicht im Bild gesucht). | — |
| D2-T11 | **teilweise** | Adresse im Kopf und im Kontext, Telefon zweimal ✔. | „Adresse und Kontakt ›“ im Kopf springt auf `#baustelle-kontext` (`BaustellenakteView.tsx:717`). Fehlen Adresse und Telefon dort am Handy, zeigt der Verweis ins Leere, und der Kartenverweis („in Google Maps öffnen“) steht am Handy nirgends mehr. |
| D2-T12 | bestätigt (nachgestellt) | „Wohnungseigentümergemeinschaft … · B-2026-0147“ unter jedem Termin der Kundenakte ✔ | Termin ohne Baustelle zeigt „Familie Huber (ohne Baustelle)“ — dort bleibt „(ohne Baustelle)“. |
| D2-T13 | bestätigt (nachgestellt) | „geschrieben von Max Mustermann“ ✔ | E99 hat „geschrieben von“ ausdrücklich gelassen. „Regie · Max Mustermann“ sagt nicht mehr, **was** die Person getan hat — als Änderung an E99 benennen. |
| D2-T14 | **teilweise** | Alle vier Sätze wörtlich ✔, drei Felder ✔. | Drei der vier Sätze sind **wechselnde Feldhinweise**: `abrechnungHinweis(…)` (Folge der gewählten Abrechnung), `praefixGrund ?? …`, `datumGrund ?? …` (`AnnahmeLink.tsx:238–270`) — dort stehen auch die Gründe einer Ablehnung. Hinter ein „i“ darf nur der Ruhetext. U9: im Fenster bleibt die Grundlage der Entscheidung offen. |
| D2-T15 | **widerlegt** | Beide Sätze wörtlich ✔ — aber **beide Bedingungen gibt es schon:** Satz 1 steht nur, solange das Feld den übernommenen Wert trägt (`AdresseFeld.tsx:36`, `value === vorschlag`; nachgestellt: nach dem Überschreiben weg). Satz 2 steht nur ohne Projektleitung (`AdminProjectsView.tsx:880`, `BaustellenakteView.tsx:1104`; nachgestellt: nach der Wahl weg). „Dauerhaft …, auch wenn die Adresse längst geändert wurde“ stimmt nicht. | Übrig bleibt allenfalls, Satz 1 zu kürzen. Sonst wird etwas „behoben“, das in Ordnung ist. |
| D2-T16 | bestätigt (nachgestellt) | ✔ | — |
| D2-T17 | bestätigt (nachgestellt) | Briefkopf + Ortszeile „PERL INSTALLATIONEN GMBH“; „Angebot gültig bis“ + „Gültig bis“; Satz zur Speicherung; Prüfsumme (`AngebotAnnahmeSeite.tsx:264, 372`). | Öffentliche Seite mit Rechtsfolge — Fristangabe bleibt im Schriftfeld sichtbar, auch am Handy. |
| D2-T18 | **teilweise** | ✔ | Der Platz trägt eine zweite Fassung, die bleiben muss: „Ohne Kunden — bitte einen wählen, bevor er übernommen wird.“ (`EingangView.tsx:344`). |
| D2-T19 | bestätigt (nachgestellt) | „… · gültig bis 01.10.2026 · 240 h kalkuliert“, „abgelaufen“, Gruppe „BINDEFRIST ABGELAUFEN“, „0 h kalkuliert“ ✔ | „abgelaufen“ nur dort weglassen, wo die Liste wirklich gruppiert ist. |
| D2-T20 | **teilweise** | „Kundenart prüfen“ an jeder Beispielzeile ✔ (Attrappe). | Der erste Vorschlag ist **schon gebaut**: die Zahl am Segment zählt der Server (`CustomersView.tsx:289–305`); die Vorschau zeigt sie nicht. Der Rest steht im Papier unter Vorbehalt — dabei belassen. |

### 2.6 „Statt der Punkte“ (D2-P) — Formen als Prototyp gemessen

Gebaut im Blatt der echten Seite mit den Schriften der App, Namen „Wohnungseigentümergemeinschaft
Hauptstraße 112–118“ (396 px in 15/500) und „Dr. Annemarie Oberhauser-Lindner“ (248 px); Innenbreite
311 px (375), 326 px (390), 624 px (834, volles Blatt), 360 px (834, Hauptspalte der Akte), 1080 px (1440). Skript `p1.mjs`.

| Kürzel | Urteil | Messung | Folgerung |
|---|---|---|---|
| D2-P1 | **teilweise** | Wartung am Handy „Zeile 1 Name + Zustand rechts“: neben „Seit 64 Tagen überfällig“ (160 px) bleiben dem Namen 139 px → **vier Zeilen** bei 375, drei bei 390 (heute zwei, weil der Zustand darunter steht). Beteiligte „Rolle rechts in fester Spalte“: Name drei Zeilen bei 375. Eingang „Kunde + Stempel, rechts Dringlichkeit“: Name 112 px → drei Zeilen („Dr. Annemarie …“) bzw. fünf. Fünf Spalten am Tablet (624 px): Name, Anlage und Ort je vier Zeilen; bei 1440 je zwei. | Die Handyform ist mit langen Namen **schlechter als heute**. Brauchbar: Name allein in Zeile 1, Zustand und Stempel darunter; die Spaltenform erst ab dem Schreibtisch. |
| D2-P2 | **teilweise** | Einzeilig braucht 467 px (Art 59 + Stempel 79 + Datum 78 + Stand 76 + Betrag 99 + Pfeil + Abstände): passt bei 1440 (768 px) und im vollen Blatt am Tablet, **nicht in der Hauptspalte der Akte am Tablet (360 px)** und nicht am Handy. Zweizeilig am Handy passt auch mit siebenstelligem Betrag (93 + 126 + 16). | Am Tablet in der Akte die zweizeilige Form. Die Zeile ist die von E99 festgelegte („Art und Datum, Nummer als Stempel, Stand, Betrag, Pfeil“) — als Änderung an E99 benennen. „3 Rechnungen“ bleibt (E99). |
| D2-P3 | **teilweise** | 375: Titel hat 88 px → „Lieferung (Aviso)“ (118 px) zweizeilig, ein längerer Titel vierzeilig; 390: 103 px. Ab 360 px Innenbreite einzeilig. | „Genau wie ‚Nächster Termin‘ es heute zeichnet“ stimmt am Handy nicht: dort steht die Zeit **unter** dem Titel (gemessen bei 375: Zeit y 1032 unter Titel y 974). Diese Handyform übernehmen. Stift/Tonne: E74 (siehe D2-B10). |
| D2-P4 | bestätigt (am Code) | Datum Mono 13 = 78 px + „Regie“: passt überall. Scheine werden über Baustelle und Tag gefunden (E91) — das Datum bleibt Schlüssel. | „geschrieben von“ siehe D2-T13. |
| D2-P5 | **teilweise** | Tabelle mit acht Spalten: bei 1440 bleiben dem Kunden 479 px; am **Tablet 23 px** (22 Zeilen) — geht erst ab dem Schreibtisch. Handyzeile 2 mit Stempel + Zustand + Betrag: 298 px, passt bei 375. | Die Handyskizze nennt **weder Zustand noch ⋯**. Die Gruppe sagt den Stand nicht (in der Vorschau stehen „Versendet“ und „Entwurf“ in derselben Gruppe „Bindefrist abgelaufen“) — er muss in der Zeile bleiben. Für 760–1199 px fehlt eine Form. |
| D2-P6 | bestätigt (am Code) | Bausteine vorhanden (`TelefonLink`, Kontaktverweis). | Ein Verweis als Wert macht die Angabe 48 px hoch — **D2-A6 zuerst**, sonst entsteht der Fehler an neuen Stellen. |
| D2-P7 | bestätigt (am Code) | Die Angebotsakte trägt die Summentabelle schon (Mono, rechtsbündig). | — |
| D2-P8 | bestätigt (am Code) | „Weitere Angaben“ + „gültig bis 23.12.2026“ (164 px Mono) passen bei 375. | Seitenkopf: siehe D2-T5 (eine Zeichenkette). |
| D2-P9 | bestätigt (am Code) | Stempel „EG-2026-0031“ 100 px; Text daneben oder darunter. | — |

## 3. Nicht bestätigt — im Einzelnen

**D2-A1 (teilweise).** Papier: nur am Handy; am Tablet müsse der Knopf „gleich bleiben“. Gefunden: bei
834 px liegt er genauso 10 px auf dem Titel. Zu ändern: Ort „390 **und** 834 px“ in Papier und Plan
(§4.2 „am Handy“); der Selektor des Vorschlags auf `a:not(.lot-knopf)`, sonst verlieren die
`link-weiter`-Verweise ihren Ausgleich.

**D2-A3 (teilweise).** Papier: Soll sei ein Fuß (U4). Gefunden: U4 verlangt keinen Fuß; die Lage über
den Rechnungsangaben ist im Code als Absicht begründet. Zu ändern: Befund auf „Aktionsreihe schrumpft
auf 159 px und steht links“ kürzen; Vorschlag „volle Breite, Hauptaktion rechts, an der heutigen
Stelle“ oder ein klebender Fuß — nicht „am Ende des Fensters“. Plan, Paket 5 Schritt 4
(„Rechnungsfenster-Aktionen im Fuß“) entsprechend.

**D2-A6 (teilweise).** Messwert stimmt, aber keine Quelle macht es zum Fehler gegen die Linie; in §3
(Unstimmigkeiten) einordnen. Der Selektor muss `dl.beleg-angaben` einschließen.

**D2-A9 (teilweise).** Der runde gefüllte Knopf an genau diesen drei Karten ist Entscheidung E76 und
durch E-N im Plan bestätigt. Vorschlag (a) streichen. (b) bleibt als Beobachtung (zwei gleiche „+“ im
Reiter „Termine“ der Baustellenakte am Handy), Ursache E76 + E95; lösbar ohne beide zurückzunehmen,
etwa indem sich die Hauptaktion in einer Akte nicht einzieht — das braucht eine Entscheidung.

**D2-A10 (teilweise).** Die Messung stimmt bis auf zwei Einzelheiten („8 px eingerückt“, „rechte
Hälfte“). Das zweite ⋯ ist gewollt gebaut worden (U1/U4, 15.11.) und steht trotzdem gegen `CLAUDE.md`
— das Papier sollte sagen, dass hier eine frische Entscheidung geändert wird. „Hauptaktion = nächster
Schritt“ ist ein Vorschlag, kein Regelverstoß.

**D2-A18 (teilweise).** Kein Regelverstoß (E97 nimmt Titel aus; 24 px sind eine Regel für `.akten-kopf`).
Als Folge von D2-B1 führen, nicht als eigener Fehler.

**D2-B7 (teilweise).** U4 gilt für den Fensterfuß. Stift und Papierkorb in Zeilen sind E74. Im Papier
das Soll streichen und die drei Teile trennen: Baustelle im ⋯ der Akte (ergänzen, mit der heutigen
Prüfung), Kunde (Ort der Karte „Datenschutz“, Entscheidung), Termin (E74, Entscheidung). Wartung:
gelöscht wird im ⋯ von „Wartung ändern“.

**D2-B11 (teilweise).** Drei der zehn Zeilen stimmen so nicht: „(optional)“ steht im Bereich dreimal
und in der App 20-mal; die Kundenliste zählt an den Segmenten (Attrappe ohne Zahl); die Reihenfolge in
„Neue Baustelle“ hat einen Grund (M02c). Die Zeile zur Reihenfolge streichen.

**D2-C14 (teilweise).** „Rückgängig“ steht schon in der Meldung (F15). Im Papier bleibt nur der Verweis
aus der Liste; „dritte Reiterzeile“ → zweite.

**D2-I2 (teilweise).** „Aus Abfragen, die die Akte schon stellt“ ergäbe ab 500 Rechnungen eine falsche
Summe und für Rollen ohne Rechnungsrecht eine leere. In Papier und Plan (Paket 15) als Bedingung
aufnehmen: Summe in der Datenbank, Zelle nur mit Recht und Modul.

**D2-I10 (teilweise).** Drei leere Karten, nicht fünf, eine davon durch die Attrappe. E99 hat sie
bewusst gelassen.

**D2-T1, T6, T11, T14, T18, T20 (teilweise).** Der Wortlaut stimmt jeweils; die Begründung oder das Ziel
nicht ganz — Einzelheiten in 2.5. Im Papier und in Paket 8 je die Bedingung nachtragen.

**D2-T7 (widerlegt).** Der Satz ist die bewusste Auskunft „diese Liste ist abgeschnitten“ samt Reichweite
der Suche. Aus Paket 8 herausnehmen; ebenso aus D2-B11 („ein Weg“) die Folge, dass der Satz entfällt.

**D2-T15 (widerlegt).** Beide vorgeschlagenen Bedingungen sind der heutige Stand (nachgestellt). Aus
Paket 8 herausnehmen.

**D2-P1, P2, P3, P5 (teilweise).** Die Formen tragen am Schreibtisch; am Handy mit langen Namen (P1,
P3) und am Tablet (P1, P2 in der Akte, P5) nicht wie skizziert. Im Papier je Breite die Form nennen;
in Paket 7 die Messung auf 375 **und** 834 px zur Bedingung machen.

## 4. Zum Plan

**Kurztexte**
- §4.2 D2-A1: „am Handy“ → Handy und Tablet (834 px).
- §4.2 D2-A8 / D4-A11 / D3-B16: der Kurztext nennt nur Stellen aus D3/D4; die vier Stellen aus D2 (Tops,
  Beteiligte, Wartungsliste, Scheinliste) fehlen.
- §4.3 „Neu in dieser Liste“ führt D2-A9 mit „5 (entschieden)“: nach E-N **bleibt** der Kreis in Listen —
  damit ist Vorschlag (a) des Papiers erledigt; das sollte dort stehen, sonst liest Paket 5 Schritt 5
  es als Auftrag zum Umbau.
- §4.4 D2-C1: „der Weg in die Planung steht nur in der flüchtigen Meldung“ stammt aus D2-C6/C3. Bei C1
  führt die App nach „Baustelle anlegen“ in die Baustellenakte (`EingangView.tsx:526`), „Einsatz planen“
  ist dort die Hauptaktion.
- §5 Muster 6 und §6: decken sich mit dem Papier.

**Pakete**
- **Doppelt zugeordnet:** D2-A5 (Paket 5 und über „A4 bis A7“ Paket 13), D2-A11 und D2-A17 (Paket 6 und
  über „A10 bis A13“ / „A15 bis A18“ Paket 13).
- **Keinem Paket zugeordnet:** D2-C5, D2-C14; D2-C7 nur mittelbar über D2-I12; D2-I10 steht im Text von
  Paket 13, aber nicht unter „Punkte“.
- **Paket 5, Schritt 1** („`Fensteraktionen` als einzige Form“): die Akten-Fenster tragen die
  `Speicherleiste` nach U1 Muster 3 (erscheint erst bei Abweichung). „Einzige Form“ darf sie nicht
  ersetzen — als „bleibt gleich“ aufnehmen. Der Durchklick braucht die Liste der Fenster; im Bereich D2
  sind es vier ohne Fuß im Bild (drei „Neu“-Fenster und „Kunde bearbeiten“ aus der Liste).
- **Paket 5, Schritt 2** („Schließen mit Änderungen fragt“) widerspricht der Empfehlung des Papiers
  („Entwurf behalten für alle ‚Neu‘-Fenster plus ein Satz; Rückfrage nur beim Bearbeiten“) und dem
  eigenen „bleibt gleich“ („‚Neuer Kunde‘ verliert nichts, was es heute behält“): wer in der Rückfrage
  „Verwerfen“ wählt, verliert es. Eine der beiden Fassungen wählen. Umfang ist größer als im Plan
  genannt: auch „Neue Wartung“, „Neue Liegenschaft“, „Termin anlegen“, „Liegenschaft bearbeiten“, „Kunde
  bearbeiten“ (Liste) verwerfen still.
- **Paket 5, Schritt 4** („Rechnungsfenster-Aktionen im Fuß“): siehe D2-A3 — nur als klebender Fuß.
- **Paket 8:** D2-T7 und D2-T15 herausnehmen; bei T5 ist der Weg schon gebaut (E86) — der Schritt ist
  „Beschreibung auch ab dem Tablet ausblenden“, nicht 30 Seiten anfassen. **Regel 5** („am Handy
  höchstens zwei Textzeilen“) ist mit den Namen der Beispieldaten nicht haltbar (der Name allein braucht
  bei 375 px zwei Zeilen) und widerspricht den dreizeiligen Handyformen aus D2-P1/P5 — als „zwei
  Angaben unter dem Namen“ fassen.
- **Paket 13, Angebotsakte:** der Plan nennt „Versenden → Annehmen → Baustelle öffnen“, das Papier
  „Entwurf: Bearbeiten; versendet: Annehmen → Baustelle; sonst PDF herunterladen“. „Versenden“ hat zwei
  Wege („Als versendet markieren“, „Per Mail senden“) und ist am leeren Entwurf gesperrt — eine Reihe
  festlegen. Reihenfolge: D2-A10 vor D2-C11.
- **Paket 13, „leere Karten der Übersicht zusammengelegt (D2-I10, Vorbehalt E99)“:** das Papier erlaubt
  nur eine andere Reihenfolge am Handy. „Zusammengelegt“ nähme E99 zurück („bewusst geblieben“).
- **Paket 13, D2-B7/B10 (Termin ohne Stift und Tonne) und D2-C12 (Angebotszeile ohne Knopf):** stehen
  gegen E74. Unter Abschnitt 8 als Entscheidung führen, nicht als Punkt eines Pakets.
- **Paket 7 vor Paket 13:** D2-A7 (Reiter „Belege“ auf `AktenBelegZeile`) und D2-A13 (Umbruch am Punkt)
  hängen an D2-P2 — einmal umbauen. D2-P6 erst nach D2-A6.
- **Paket 15 (Kennwerte der Kundenakte):** Bedingungen aus D2-I2 (Grenze 500, Recht, Modul) fehlen.
- **Paket 9 vor Paket 15:** die Liegenschaftsakte ist in der Vorschau leer; ohne Attrappen lässt sich
  D2-B1 nicht im Bild prüfen.

**Vorschläge, die eine bestehende Funktion entfernen oder schwerer erreichbar machen würden**
- D2-T7: Auskunft über die abgeschnittene Liste und die Reichweite der Suche.
- D2-T11: Kartenverweis und Sprungziel „Adresse und Kontakt ›“ am Handy.
- D2-B10/B7: Termin ändern zwei Tipps statt einem; Tonne weg (E74).
- D2-C1: Vorgabe „Telefon“ entwertet die Pflichtangabe „Quelle“.
- D2-I6 + C12: sichtbare Aktionen nur noch im Kontextmenü; „In neuem Tab öffnen“ an Zeilen.
- D2-P5 (Handyskizze): Zustand und ⋯ der Angebotszeile.
- D2-T1 (Handy): Straße in der Baustellenliste.

**Widerspruch zwischen Papier und Vermessung:** D2-A16 nennt das Suchfeld „kein Befund“, V-5 nennt es
als Befund. Nachgemessen: V-5 stimmt.

## 5. Geklärte Verdachtsfälle

- **D2-B3, offene Zeile** („Neue Wartung“, „Neue Liegenschaft“, „Termin anlegen“ — „nicht
  nachgemessen“): Eingabe ist nach Escape, Schleier oder ✕ weg.
- **D2-C2** („ob er dann ablehnt, regelt `leerNichtAnnehmen` — nicht ausgelöst“): die Rückfrage nennt
  den Grund und sperrt „Annehmen“ (`QuotesView.tsx:1629–1636`); die Datenbank weist Versand und Link
  ohne Position ab (`20261116041500_angebot_versand_pruefen.sql`).
- **D2-C5** (Vorbehalt zu `useBaustellenVorschlag.ts` und `LiegenschaftVorschlaege.tsx`):
  `useBaustellenVorschlag` schlägt die nächste **Baustellennummer** vor, keine Adresse.
  `LiegenschaftVorschlaege` ist in „Neue Baustelle“ eingebaut (`AdminProjectsView.tsx:786`): mit
  eingeschaltetem Modul schlägt die gewählte Liegenschaft Kunde, Adresse und Ansprechpartner vor, je
  mit „Übernehmen“. Der umgekehrte Weg (vom Kunden zu seinen Häusern) fehlt.
- **D2-T15** („prüfen, ob das heute schon so ist“): ja, beide Sätze.
- **D2-T20:** die Zahl am Segment gibt es; sie fehlt nur in der Vorschau.

## 6. Nicht geprüft

- Dunkler Satz (Aussage „kein Wert unter 4,5 : 1 in zwölf Ansichten“) — nicht nachgemessen.
- „Was stimmt und so bleiben soll“ (§1 des Papiers): nur Stichproben (Blatt 16 px, 24 px Abstand,
  Kartentitel 18/500, Reiter 15 px, Kontext 288 px mit 12-px-Dachzeilen stimmen); Fensterschatten,
  Menüs, Feldhöhen nicht.
- Rollen Projektleiter, Verwaltung, Buchhaltung: nur Angebotsakte (PL, Buchhaltung) und Eingang
  (Verwaltung).
- Wege, die in der Vorschau nichts schreiben (nach „Eingang erfassen“, „Annehmen“, „Anlegen“): Ziel
  aus dem Code gelesen, nicht im Browser erreicht. Die Suche über Strg+K filtert in der Vorschau nicht.
- D2-B4 bis B6: Wörter im Quelltext gesucht, nicht jedes Fenster dazu geöffnet.
- D2-P4, P6 bis P9: aus gemessenen Textbreiten gerechnet, nicht als Prototyp gebaut.
- Die Prototypen der P-Formen prüfen Breite und Zeilenzahl, nicht Wischen, Vorlesetext oder
  Tastflächen.
- §8 des Papiers („nicht angesehen“) bleibt nicht angesehen; echte Geräte und WebKit ebenso.
