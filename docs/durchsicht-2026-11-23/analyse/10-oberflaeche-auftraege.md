# Büro — Aufträge (Kunden, Liegenschaften, Auftragseingang, Angebote, Baustellen, Scheine, Wartungen, Termine) — Oberfläche, Arbeitspapier zur Durchsicht vom 23.11.2026

Stand: main fa6e740, Vorschau mit Beispieldaten (`tools/vorschau`). Breiten: 1440 × 900, 390 × 844 (Touch), 834 × 1112; dunkler Satz auf 390 und 1440.
Rollen: Geschäftsführung durchgehend; Projektleiter, Verwaltung, Buchhaltung für Menüs und Hauptaktionen je Route.
Gebaut wurde nichts. Bilder und Messskripte liegen unter
`/tmp/claude-0/-workspace-Prototype-App-Installateure/d2c6c62f-de1f-5d7d-8a7e-91e7b4244a5a/scratchpad/audit/D2/` — im Folgenden kurz **`D2/`**, die Bilder **`D2/b/`**.

Zwei Dinge vorweg, damit die Befunde richtig gelesen werden:

- **Auftragseingang und Liegenschaften sind in der Vorschau leer** (die Attrappen liefern `[]`, das Modul „Liegenschaften und Tops“ ist aus). Für beide wurden Beispieldaten **nur im Browser** eingespeist (Playwright `page.route` auf die Attrappen-Module, `D2/lib.mjs`), das Modul über `&module=kunden.liegenschaften` eingeschaltet. Am Repo wurde dafür nichts geändert. Ebenso die Kundenseite der Angebotsannahme (`/angebot/annehmen#…`) und ein Angebotsentwurf mit Positionen.
- **Kein Befund sind** (Attrappen): „Aus Eingang“ ohne Nummer; „das Material konnte nicht geladen werden.“ als Zustand; „Daten von  löschen?“ ohne Namen; die Zeile „· 08:30 Std“ ohne Namen im Scheinfenster; die Suche, die nicht filtert; das Datumsfeld „11/23/2026“ (Chromium ohne deutsche Oberfläche); die rohe Meldung nach „Auskunft herunterladen“.

---

## 1. Angesehen

| Route | Rollen | Breiten | Unterseiten, Fenster, Menüs, Zustände, die geöffnet wurden |
|---|---|---|---|
| `/customers` | GF, PL, Verw., Buchh. | 1440, 834, 390, dunkel | Segmente „Alle / Anschrift prüfen / Ohne Kundenart“; Suche; Seiten-⋯ (Datei einlesen, Vorlage, Bestehende Baustellen übernehmen → Fenster); Zeilen-⋯ (Bearbeiten → Fenster, Löschen → Rückfrage); „Neuer Kunde“ (Fenster/Blatt, bis zum Fuß); Hilfe; großer Bestand (`?bestand=gewachsen`: „und 1983 weitere anzeigen“, „Weitere Kunden laden“) |
| `/customers/k1` | GF, PL, Verw., Buchh. | 1440, 834, 390, dunkel | alle fünf Reiter; „Bearbeiten“ (Fenster, Speicherleiste, Rückfrage „Ungespeicherte Änderungen verwerfen?“); ⋯: Neuer Eingang, Neues Angebot, Neue Baustelle, Neue Wartung, Stundennachweis, zusammenführen; Belegzeile → Rechnungsfenster; Angebotszeile; Baustellenzeile; Termin anlegen/ändern/löschen; Stammdaten: Änderungsverlauf, VIES, Auskunft, Löschen; „Kontakt ›“ am Handy; Hilfe |
| `/liegenschaften`, `/liegenschaften/l1` | GF, PL, Verw., Buchh. | 1440, 834, 390, dunkel (Akte) | Liste, Segmente, „Neue Liegenschaft“; Akte: drei Reiter; „Bearbeiten“; Top anlegen/ändern; Beteiligten eintragen/ändern (Kunde, freie Angaben); ⋯ mit „Neu …“ und „Liegenschaft löschen“ (Rückfrage); Hilfe |
| `/eingaenge`, `/eingaenge/e1`, `/eingaenge/e3` | GF, PL, Verw., Buchh. | 1440, 834, 390, dunkel (Liste) | Segmente (Offen/Übernommen/Abgelehnt, leer); „Neuer Eingang“ (vorhandener/neuer Kunde); Eingang: „Baustelle anlegen“ (Rückfrage mit Abrechnung), ⋯: Angebot anlegen (Rückfrage), Besichtigung vereinbaren (Terminfenster), Bearbeiten, Ablehnen (mit Grund), Löschen; Änderungsverlauf; Eingang mit Neukunde |
| `/quotes`, `/quotes/q1` (versendet), `/quotes/q2` (Entwurf) | GF, PL, Buchh. (Verw.: kein Zugriff) | 1440, 834, 390, dunkel | Segmente; Gruppen; „Neues Angebot“ (Formular, „Weitere Angaben“, „Aus dem Katalog …“-Fenster); Zeile: Neue Fassung, Annehmen → Baustelle (Rückfrage), Stift, ⋯ (versendet/abgelehnt markieren, Verwerfen); Akte: PDF herunterladen, ⋯ (abgelehnt, zurück in den Entwurf, Kopie), Verlauf mit „Annehmen → Baustelle“, „Annahme-Link“ (Fenster), ⋯ (Per Mail senden → Fenster, Neue Fassung), Änderungsverlauf, Sprungleiste am Handy; großer Bestand (42 Zeilen) |
| `/angebot/annehmen#…` (Kundenseite) | ohne Anmeldung | 1440, 390 | offen, angenommen, neuere Fassung, ungültig |
| `/admin-projects`, `/admin-projects/p1` | GF, PL (Verw., Buchh.: kein Zugriff) | 1440, 834, 390, dunkel | Kennzahlen (Filter über Kennzahl), Segmente, Gruppen, „Neue Baustelle“; Zeilen-⋯ (Schein nachtragen, Abschließen, Löschen); Akte: vier Reiter; „Bearbeiten“ (Fenster); „Einsatz planen“; ⋯ (Abschließen, Stundennachweis); Rechnungszeile → Fenster (+ ⋯); Angebotszeile; „Nachtrag anlegen“; „Nachricht schreiben“; Änderungsverlauf; Scheinzeile; „Handwerksschein schreiben“; Termin anlegen; „Dokumente hinzufügen“; „Alle …“-Verweise; „Adresse und Kontakt ›“ am Handy; großer Bestand (3 Gruppen, „und N weitere anzeigen“) |
| `/worksheets` (Büro-Sicht) | GF, PL, Verw., Buchh. | 1440, 834, 390, dunkel | Kennzahlen, „Stunden ohne Buchung“ (30/90 Tage, 1 Jahr), Segmente „Offen/Alle“, Gruppen, Zeile → Fenster (⋯, PDF, Weiterbearbeiten), unterschriebener Schein im Fenster, „Neuer Schein“ |
| `/wartungen` | GF, PL, Verw. (Buchh.: kein Zugriff) | 1440, 834, 390, dunkel | Segmente, Gruppen, Zeile → Fenster (⋯, Bearbeiten, Erledigt), „Erledigt“ (Rückfrage mit Feldern), „Baustelle anlegen“ (Rückfrage), „Neue Wartung“; großer Bestand |
| Termine | GF | 1440, 390 | Karte „Termine“ in Kunden- und Baustellenakte, „Nächster Termin“ in beiden Übersichten, Terminfenster (anlegen, ändern), Rückfrage Löschen, „Besichtigung vereinbaren“ am Eingang |
| `/settings/papierkorb` | GF, PL | 1440, 834, 390 | leerer Zustand, Frist, Hilfe |
| Vergleich | GF | 1440 | Benutzerakte `/user-mgmt/u1` (drei Reiter) als dritte Akte |

Tastatur am Schreibtisch: Tab-Folge, Strg+K, Enter in Formularen, Escape, Fokus beim Öffnen und Schließen (`D2/mess2.mjs`, `D2/letzte.mjs`).
Dunkler Satz: je Liste, Akte, Fenster, Formular fotografiert (`D2/b/m_d_0*.png`, `D2/b/dd_*_1440_d.png`), alle Textfarben gegen ihren Grund gemessen: **kein Wert unter 4,5 : 1** in den zwölf geprüften Ansichten. Im dunklen Satz gibt es in diesem Bereich keinen eigenen Befund.

**Was stimmt und so bleiben soll** (gemessen, damit es beim Umbau nicht verloren geht): Blätter 16 px Radius, 24 px Abstand zwischen den Blättern an allen vier Akten und allen Reitern; Kartentitel 18 px/500, Reiter 15 px, Kontextspalte 288 px mit 12-px-Dachzeilen; Fenster 24 px Radius, Schatten `0 7px 20px -6px`, Menüs 12 px mit demselben Schatten; Zeilen ohne Schatten; alle Felder 16 px und 48 px hoch; keine seitliche Überbreite auf 390/834/1440 in irgendeiner Ansicht; Fokus kehrt nach Escape auf die Zeile zurück; Strg+K öffnet die Suche mit dem Fokus im Feld.

---

## 2. Fehler gegen die Linie

### D2-A1 Scheine-Reiter der Baustellenakte am Handy: der Knopf liegt auf dem Kartentitel
- Ort: `/admin-projects/p1` → Reiter „Scheine“, Geschäftsführung, 390 px, Kopf der Karte „Handwerksscheine“. Bild `D2/b/m_h_12_390.png` (links), `D2/b/x_scheine_kopf_390.png`.
- Ist: Titel bei y 498–522, Knopf „Handwerksschein schreiben“ (194 × 48) bei y 512–560 — **10 px Überlappung**, der Titel ist angeschnitten; der Knopf ragt aus dem 72 px hohen Kartenkopf. Soll: nichts überdeckt Text (Brief A „Dinge, die nicht fluchten / Text abgeschnitten“).
- Ursache: Titel (160) + Abstand (12) + Knopf (194) = 366 px passen nicht in 326 px, die Zeile bricht um. Die Regel `src/index.css:1134` (`.karte-kopf > div > a { min-height: 0; padding-block: 0.875rem; margin-block: -0.875rem; }`) ist für den Textverweis „Alle Termine ›“ gedacht, trifft hier aber einen als Knopf gestalteten Link und zieht ihn 14 px nach oben. Einzelfall heute (der einzige `a`-Knopf im Kartenkopf, der am Handy umbricht); „Nachtrag anlegen“ passt gerade noch (131 px).
- Vorschlag: die Regel auf Textverweise begrenzen (`a.akten-verweis, a.link-still`), und der Kartenkopf darf wachsen, wenn er umbricht (kein fester 72-px-Kopf bei zwei Zeilen); der Knopf kürzer („Schein schreiben“, siehe D2-B7). — Aufwand: klein.
- Gleich bleiben muss: die 44-px-Tastfläche von „Alle Termine ›“ ohne höhere Zeile (E72, `kontextEinheitlich.spec.ts`), der Knopf im Kartenkopf am Tablet/Schreibtisch. Rückschritt merkt man an: Kartenköpfe mit Verweis werden höher als 72 px.

### D2-A2 Speicherleiste im Akten-Fenster: 20 px Streifen darunter, in dem der Inhalt durchläuft
- Ort: `/customers/k1` → „Bearbeiten“ (ebenso `/admin-projects/p1` → „Bearbeiten“), 1440 px, nach der ersten Änderung. Bild `D2/b/ka_bearbeiten_unten_1440.png`, Ausschnitt `D2/b/x_speicherleiste_1440.png`.
- Ist: `.aktionsleiste` klebt mit `bottom: 0` und endet bei y 855; der Rollbereich `.fenster-inhalt` endet bei y 875 (20 px Polster). In diesen 20 px sieht man das Feld darunter weiterrollen (angeschnittener Feldrand und Text unter „Verwerfen / Speichern“). Soll: „In einem Blatt klebt sie am unteren Rand des Blatts“ (style.md, U1 Muster 3).
- Ursache: `src/index.css:1306` (`:is(.blatt, .fenster, .fenster-breit, [role='dialog']) .aktionsleiste { bottom: 0; }`) überstimmt den für Akten gedachten Ausgleich in `src/styles/lot-akten.css` (`.akten-editor .aktionsleiste { bottom: -1.25rem; margin: 1rem -1.25rem -1.25rem }`). Betrifft beide Akten-Fenster mit Speicherleiste.
- Vorschlag: im Fenster `bottom: -1.25rem` (= Polster des Rollbereichs) samt Gegenrand gelten lassen, wie es `planung-fuss` schon tut (`bottom: -20px`, gemessen in „Neuer Eingang“). — Aufwand: klein.
- Gleich bleiben muss: Leiste erscheint erst bei Abweichung, „Verwerfen“ links, „Speichern“ rechts, Satz zum Stand darüber; am Handy über der Fußinsel. Rückschritt: Leiste verdeckt das letzte Feld oder springt beim Erscheinen.

### D2-A3 Rechnungsfenster der Akte: Aktionen mitten im Inhalt, links, mit 159 px kurzer Linie
- Ort: `/customers/k1` und `/admin-projects/p1` → Tipp auf eine Rechnungszeile, alle Breiten. Bild `D2/b/ka_beleg_rechnung_1440.png`, `D2/b/m_h_03_390.png` (links), `D2/b/m_h_12_390.png` (rechts).
- Ist: `div.fuss-aktionen.fensteraktionen` ist **159 × 65 px** breit (statt 438), steht bei y 274 zwischen Kennwerten und „Rechnungsangaben“, linksbündig; seine obere Linie ist deshalb nur 159 px lang und hängt frei. Knöpfe: „⋯“ und „PDF laden“ (gerahmt), keine gefüllte Hauptaktion. Soll (U4): Fenster hat „eine gefüllte Hauptaktion rechts, höchstens eine zweite links daneben, alles Weitere im ⋯ ganz links“, als Fuß.
- Ursache: `RechnungDetail.tsx:151` legt `Fensteraktionen` in `.rechnung-detail-aktionen` (`display: flex`, `lot-rechnungen.css:51`); das Flex-Kind schrumpft auf seinen Inhalt. Im Scheinfenster und Wartungsfenster steht derselbe Baustein in einem Block und ist 398 px breit — dort stimmt es.
- Vorschlag: in der Leseansicht der Akte (`AkteRechnungFenster`) die Aktionen als Fuß am Ende des Fensters, volle Breite; „PDF laden“ als die eine Hauptaktion (gefüllt), „In Rechnungen bearbeiten“ als zweite, Rest im ⋯. Mit D5 (Geld) abstimmen, weil `RechnungDetail` auch auf der Rechnungsseite steht. — Aufwand: klein.
- Gleich bleiben muss: alle Einträge des ⋯, „In Rechnungen bearbeiten“ führt weiter auf die Rechnungsseite mit derselben Rechnung offen (E99). Rückschritt: ein Eintrag des ⋯ fehlt, oder die Aktionen stehen auf der Rechnungsseite anders als heute.

### D2-A4 „Wartung erledigt eintragen“: der bestätigende Knopf ist rot
- Ort: `/wartungen` → „Erledigt“ (Zeile oder Fenster), alle Breiten. Bild `D2/b/wa_erledigt_1440.png`, `D2/b/m_h_14_390.png`.
- Ist: „Eintragen“ gerahmt mit roter Schrift (Ton `danger`). Soll: Rot ist Fehler und Unumkehrbares (style.md „Warnung und Fehler“, U4); „erledigt eintragen“ ist der gewöhnliche gute Abschluss. Alle anderen Rückfragen mit normalem Schritt sind gefüllt petrol („Annehmen“, „Baustelle anlegen“, „PDF erstellen“).
- Ursache: `WartungenView.tsx:1148` ruft `ConfirmDialog` ohne `confirmTone`; die Vorgabe ist `'danger'` (`ConfirmDialog.tsx:29`). Im Bereich die einzige nicht-löschende Rückfrage ohne Ton (13 Rückfragen geprüft, die übrigen zwölf löschen wirklich).
- Vorschlag: `confirmTone="primary"`. Zusätzlich als Wächter: eine Rückfrage, deren Beschriftung nicht „Löschen/Entfernen/Verwerfen/Stornieren“ enthält, muss den Ton nennen. — Aufwand: klein.
- Gleich bleiben muss: die Felder der Rückfrage, „Nächster Termin: …“, der Ablauf. Rückschritt: eine Lösch-Rückfrage wird versehentlich petrol.

### D2-A5 Vier Stellen stehen 16 px statt 24 px vom Blattrand (Flucht)
- Ist (1440, Blattrand 272, Flucht der Titel und Zeilen bei x 296):
  1. `/worksheets`, Gruppe „Nicht verrechnet“: `p.leer` mit `padding: 20px 16px` — Text beginnt bei **x 288**. Bild `D2/b/g__worksheets__Geschäftsführung__1440.png`. Ursache `src/styles/lot.css:184`; die Regel aus E98 (`index.css:1052`) kennt `.leer-satz`, nicht `.leer` (im Bereich viermal, alle in `WorkSheetsListView.tsx:1406–1444`).
  2. `/liegenschaften/l1` → „Baustellen und Wartungen“: Auswahl „Top“ in `div.px-4.pb-2` — Feld von **x 288 bis 1384**, Zeilen darunter ab 296. Bild `D2/b/la_reiter_baust_1440.png`.
  3. `/customers` und `/wartungen` am Listenende: Trennlinie und Knopf „Weitere Kunden laden“ / „Weitere Vereinbarungen laden“ ab **x 288**. Bild `D2/b/gew_customers_1440.png`. Ursache: Baustein `Nachladen`.
- Soll: „Leersätze stehen auf der Flucht des Kartentitels“ (E98), 24 px im Blatt.
- Vorschlag: `.leer` in die E98-Regel aufnehmen (oder die vier Stellen auf `leer-satz` umstellen); die beiden Rahmen mit `--blatt-rand` statt `px-4`; `flucht.spec.ts` um die drei Seiten erweitern (heute grün, obwohl daneben). — Aufwand: klein.
- Gleich bleiben muss: am Handy 16 px (dort ist der Blattrand 16). Rückschritt: Handy bekommt 24 px.

### D2-A6 Ein Verweis als Wert macht die Angabe 26 px höher als ihre Nachbarn
- Ort: `/eingaenge/e1` „Angaben“ → Kunde; `/admin-projects/p1` „Auftrag“ → Herkunft; `/liegenschaften/l1` „Stammdaten“ → Anschrift; alle Breiten. Bild `D2/b/l__eingaenge_e1__Geschäftsführung__1440.png`, `D2/b/la_reiter_stamm_1440.png`.
- Ist: `dd` mit Verweis **48 px** hoch (Klasse `link inline-flex min-h-touch`), `dd` mit Text **22 px**. Zwischen Beschriftung und Wert stehen dadurch 35 statt 22 px, die zweite Spalte derselben Zeile steht 13 px höher. Soll: gleicher Takt der Angaben; die Tastfläche über Polster und Gegenrand, „ohne die Zeile höher zu machen“ — so schon für die Kontextspalte gelöst (`lot-akten.css`, `.akten-kontext :is(.link-kontakt, .akten-verweis)`).
- Ursache: die Ausgleichsregel gilt nur in `.akten-kontext`, nicht in `.akten-angaben` der Hauptspalte.
- Vorschlag: dieselbe Regel für `.akten-angaben dd > :is(a, .link-kontakt)`. — Aufwand: klein.
- Gleich bleiben muss: 44 px Tastfläche am Handy (messen), Linie und Symbol an Telefon/Mail/Adresse (E72). Rückschritt: Tastfläche unter 44 px.

### D2-A7 Reiter „Belege“ der Kundenakte nutzt nicht die Belegzeile (E99)
- Ort: `/customers/k1` → „Belege“, Karten „Rechnungen“ und „Angebote“, alle Breiten. Bild `D2/b/akte_kunde_2_1440.png`, `D2/b/m_h_02_390.png`.
- Ist: Nummer als Petrol-Verweis in DM Sans 15/500; Betrag und Stand als ein grauer Satz „€ 22 104,60 brutto · Überfällig“ in **DM Sans 13 px**; kein Zustandszeichen (auch nicht bei „Überfällig“); **kein Pfeil**, obwohl die Zeile ein Fenster öffnet; Zeile 48 px. Auf derselben Akte in der Übersicht („Jüngste Belege“) und in der Baustellenakte: Art · Datum 13 px, Nummer als Stempel (Plex Mono 12), Stand mit Zeichen, Betrag **Plex Mono 15/500**, Pfeil; Zeile 74,5 px.
- Soll: „Eine Belegzeile (`AktenBelegZeile`) für Kunden- und Baustellenakte“ und „Pfeil an jeder Zeile, die etwas öffnet“ (E99); Beträge in Plex Mono (style.md).
- Ursache: `KundenakteView.tsx:585–600` zeichnet die Zeilen von Hand; `AktenBelegZeile` wird nur in Zeile 873 (Übersicht) benutzt.
- Vorschlag: beide Karten auf `AktenBelegZeile` umstellen; die Baustellennummer, die nur hier steht, als zweite Angabe der Kopfzeile („Rechnung · 14.08.2026 · B-2026-0147“ bzw. nach Abschnitt 7 in eigener Spalte). — Aufwand: klein.
- Gleich bleiben muss: Sortierung, die Baustellennummer je Rechnung, Rechnung öffnet das Fenster, Angebot führt in die Angebotsakte. Rückschritt: die Baustellennummer fehlt.

### D2-A8 Zeilen, die etwas öffnen, ohne Pfeil
- Ist: Tops und Beteiligte in der Liegenschaftsakte (`/liegenschaften/l1`, Zeile öffnet ein Fenster, weder Pfeil noch ⋯; Bild `D2/b/l__liegenschaften_l1__Geschäftsführung__1440.png`); Zeilen der Wartungsliste (`/wartungen`, Zeile öffnet das Fenster, rechts stehen nur zwei Knöpfe; Bild `D2/b/g__wartungen__Geschäftsführung__1440.png`); Zeilen der Scheinliste (`/worksheets`, Zeile öffnet das Fenster, rechts „Weiterbearbeiten“). Soll: „Pfeil an jeder Zeile, die etwas öffnet — dasselbe Zeichen wie in jeder Liste“ (E99); Ausnahme nur, wo ein ⋯ steht (Entscheidung „Nie ⋯ und › nebeneinander“).
- Vorschlag: `ListRow pfeil` an den drei Listen. Wo rechts Knöpfe stehen, siehe D2-C12 (Knöpfe ins Fenster, Pfeil in die Zeile). — Aufwand: klein.
- Gleich bleiben muss: ganze Zeile bleibt das Ziel; „Erledigt“ und „Baustelle anlegen“ bleiben mit höchstens einem Tipp mehr erreichbar (sie stehen heute schon zusätzlich im Fenster). Rückschritt: eine Aktion ist nur noch über zwei Fenster erreichbar.

### D2-A9 Runde gefüllte „+“-Knöpfe im Blatt — und am Handy zwei gleiche „+“ mit verschiedener Bedeutung
- Ort: Karte „Termine“ in Kunden- und Baustellenakte; „Tops“ und „Beteiligte“ in der Liegenschaftsakte. Bild `D2/b/akte_kunde_3_1440.png`, `D2/b/l__liegenschaften_l1__Geschäftsführung__1440.png`, am Handy gerollt `D2/b/m_h_12_390.png` (zweites Bild).
- Ist: Knopf 48 × 48, Radius 999 px, Fläche `rgb(15,69,82)` — gefüllt wie die Hauptaktion; in der Liegenschaftsakte **drei** gefüllte Aktionen auf einer Seite („Bearbeiten“ + zwei „+“). Am Handy zieht sich die schwebende Hauptaktion beim Rollen zu genau so einem runden „+“ zusammen (`useEinziehen`): im Reiter „Termine“ der Baustellenakte stehen dann **zwei gleiche „+“** übereinander — oben „Termin anlegen“, unten „Einsatz planen“. Auf der Eingangsseite heißt das eingezogene „+“ „Baustelle anlegen“.
- Soll: „Eine Primäraktion bleibt je Kontext sichtbar; sekundäre Aktionen sind Text- oder Linienaktionen“ (style.md); „Keine Aktion doppelt“ im Sinn von U3. Die übrigen Karten der Akte lösen es richtig: gerahmter Zweitknopf im Kartenkopf („Nachtrag anlegen“, „Handwerksschein schreiben“).
- Ursache: `TermineKarte.tsx`, `LiegenschaftView.tsx` (Kartenkopf mit `IconButton` gefüllt); `PageHeader`/`useEinziehen` (Symbol „plus“ für jede Hauptaktion mit Symbol).
- Vorschlag: (a) im Kartenkopf gerahmter Textknopf „Termin anlegen“, „Top anlegen“, „Beteiligten eintragen“ wie bei Angeboten und Scheinen; (b) das eingezogene Zeichen folgt der Aktion (Kalender für „Einsatz planen“, Haus/Baustelle für „Baustelle anlegen“, Plus nur für „Neu …“) oder die Aktion zieht sich in Akten nicht ein. — Aufwand: klein (a), klein–mittel (b, Baustein, mit den anderen Bereichen abstimmen).
- Gleich bleiben muss: ein Tipp bis zum Terminfenster; der Name der schwebenden Aktion für die Vorlesehilfe (bleibt heute richtig „Einsatz planen“). Rückschritt: der Kartenkopf bricht am Handy um (dann greift D2-A1).

### D2-A10 Angebotsakte: die Hauptaktion ist nicht der nächste Schritt, das zweite ⋯ steht im Verlauf, am Handy verdeckt sie die Schritte
- Ort: `/quotes/q1` (versendet), `/quotes/q2` (Entwurf), alle Breiten. Bild `D2/b/akte_angebot_0_1440.png`, `D2/b/ae_entwurf_1440.png`, `D2/b/m_h_07_390.png` (drittes Bild).
- Ist: Hauptaktion in jedem Stand „PDF herunterladen“ (gefüllt). Die eigentlichen Schritte — Entwurf: „Bearbeiten“, „Als versendet markieren“; versendet: „Annehmen → Baustelle“, „Annahme-Link“ — stehen als gerahmte Knöpfe **in der Kontextspalte im Verlauf**, daneben ein **zweites ⋯** („Per Mail senden“, „Neue Fassung“); beim Entwurf steht das ⋯ allein in einer dritten Zeile, 8 px eingerückt (x 1175 statt 1167). Am Handy liegt die schwebende „PDF herunterladen“ bei y 744–792 über „Annehmen → Baustelle“ (verdeckt die rechte Hälfte des Knopfs im ersten Bild).
- Soll: „⋯ nur im Seitenkopf“ (CLAUDE.md), „Eine Primäraktion bleibt je Kontext sichtbar“, U3 „Was ein Blatt schon trägt, steht nicht schwebend darüber“ / „Nichts wird verdeckt“.
- Ursache: `AngebotView.tsx:505–520` (Schritte im Verlauf, bewusst seit „Verlauf als Lot“) und `:767–781` (Hauptaktion fest „PDF herunterladen“).
- Vorschlag: Hauptaktion nach Stand, wie die Baustellenakte es mit `akteHauptaktion.ts` schon tut — Entwurf: „Bearbeiten“; versendet: „Annehmen → Baustelle“; angenommen/abgelehnt und Rolle ohne Schreibrecht (Buchhaltung): „PDF herunterladen“. Zweitknopf (`nebenAktion`): „Per Mail senden“ bzw. „PDF herunterladen“. Alles Weitere in das **eine** ⋯ des Seitenkopfs (Annahme-Link, Neue Fassung, versendet/abgelehnt markieren, Entwurf, Kopie). Der Verlauf bleibt als Lesefläche und sagt den Stand in einem Satz. — Aufwand: mittel.
- Gleich bleiben muss: jede heutige Aktion bleibt erreichbar, höchstens ein Tipp mehr für „Annahme-Link“; die Hinweise im Verlauf („Noch ohne Position …“, „Die Fassung … ist schon angenommen“); die Buchhaltung sieht weiter nur „PDF herunterladen“. Rückschritt: „PDF herunterladen“ braucht mehr als zwei Tipps, oder ein Schritt fehlt für den Projektleiter.

### D2-A11 Einheit „brutto“ in 15 px Mono; Summen im Angebotsformular in DM Sans
- Ort: `/quotes`, Zeile, `.zeile-wert`: „€ 22 080,00 brutto“ ganz in **IBM Plex Mono 15 px**. Soll (E97): Einheit („brutto“) 12 px; in der Belegzeile der Akten steht sie richtig als `small` 12 px DM Sans unter dem Betrag.
- Ort: „Neues Angebot“, Summenzeile „Netto € 0,00 · USt € 0,00 · Brutto € 0,00“ und der Positionswert „€ 0,00“: **DM Sans 15 px**. Soll: Beträge in Plex Mono (style.md). Bild `D2/b/ka_neu_angebot_1440.png`.
- Ursache: `QuotesView.tsx` (Wert als ein Textknoten; Summen als Fließtext).
- Vorschlag: `zeile-wert` mit `<small>brutto</small>` wie Baustellenliste (`240 h` / „Budget“); Summen als kleine rechtsbündige Summentabelle wie in der Angebotsakte (dort stimmt es). — Aufwand: klein.
- Gleich bleiben muss: netto und brutto bleiben in der Liste unterscheidbar. Rückschritt: Zeile wird höher.

### D2-A12 Angebotsliste: Stand und Betrag stehen in keiner festen Spalte
- Ort: `/quotes`, 1440/834/390. Bild `D2/b/g__quotes__Geschäftsführung__1440.png`, `D2/b/h__quotes_0__Geschäftsführung__834.png`, `D2/b/m_h_06_390.png`.
- Ist (1440): „Versendet“ beginnt in Zeile 1 bei x 665, „Entwurf“ in Zeile 2 bei x 787; die Beträge enden bei x 1018 und 1080 — je nachdem, wie breit die Knöpfe der Zeile sind („Neue Fassung“ + „Annehmen → Baustelle“ gegen Stift + „Annehmen → Baustelle“). Am Tablet bricht Zeile 1 in zwei Knopfzeilen, Zeile 2 nicht; am Handy steht der Betrag in Zeile 1 links unter dem Stand, in Zeile 2 rechts daneben.
- Soll: „Zahlen bleiben tabellarisch ausgerichtet“ (style.md), feste Ordnung der Zeile (U11 für die Baustellenliste).
- Ursache: `ListRow` legt Stand, Wert und Knöpfe in eine umbrechende Flex-Reihe; die Knöpfe sind je Stand verschieden.
- Vorschlag: Raster wie `.akten-belegzeile`: Name | Stand (feste Spalte) | Betrag (feste Spalte, rechtsbündig) | ⋯. Die Zeilenknöpfe wandern ins ⋯ der Zeile und in die Akte (die Zeile öffnet sie ohnehin), siehe D2-C12. — Aufwand: mittel.
- Gleich bleiben muss: „Annehmen → Baustelle“ aus der Liste in höchstens zwei Tipps (⋯ → Annehmen; am Handy ist es für den Entwurf heute schon so). Rückschritt: Annehmen braucht drei Tipps.

### D2-A13 Tablet (834 px): Suchfeld eingerückt, Baustellentitel in 289 px, Schriftfeld 3 + 1, Belegzeile bricht am Punkt
- Suchfeld aller Listen (`/customers`, `/quotes`, `/admin-projects`, `/wartungen`): Segmente ab x 140, das Suchfeld bricht in die zweite Zeile und steht **ab x 284** (480 px breit, rechtsbündig), links 144 px Loch. Ursache `lot.css:593` (`.listenleiste-werkzeug { flex: 0 1 30rem; margin-left: auto }`). Soll: Flucht am Blattrand. Vorschlag: bricht die Leiste um, nimmt das Suchfeld die ganze Breite. Bild `D2/b/h__quotes_0__Geschäftsführung__834.png`.
- Baustellenakte: `h1` nur **288,8 px** breit, 168 px hoch (vier Zeilen), weil Hilfe, ⋯, „Bearbeiten“, „Einsatz planen“ 359 px nehmen; das erste Blatt beginnt bei y 572 von 1112. Kundenakte: 431 px. Vorschlag: am Tablet stehen Zweitknopf und Hauptaktion unter dem Titel in der Zeile des Stempels, oder der Zweitknopf wandert bis 1.199 px ins ⋯ wie am Handy. Bild `D2/b/h__admin-projects_p1_0__Geschäftsführung__834.png`.
- Schriftfeld der Baustellenakte: drei Zellen (je 168 px) und „STAND Aktiv“ allein in einer zweiten Reihe (170 px hoch statt 98). Vorschlag: vier Zellen zu je 25 % wie am Schreibtisch (die Werte sind kurz), oder 2 × 2.
- Belegzeile in der 408-px-Spalte: „Angebot ·“ / „01.09.2026“ und „Rechnung ·“ / „14.08.2026“ brechen am Trennpunkt; „€ 31 008,60 brutto · 3“ / „Rechnungen“. Vorschlag: `white-space: nowrap` für Art und Datum zusammen bzw. Form aus Abschnitt 7 (P2).
- Aufwand zusammen: klein–mittel. Gleich bleiben muss: Schreibtisch und Handy unverändert. Rückschritt: am Schreibtisch rutscht das Suchfeld unter die Segmente.

### D2-A14 Abschlusslinie unter der letzten Zeile — mal ja, mal nein
- Ort: Karten der Akten, 1440. Ist: „Angebote“, „Rechnungen“ (Baustellenakte), „Aktive Baustellen“, „Jüngste Belege“ (Kundenakte): letzte Zeile mit 1 px Linie, darunter **40–43 px** leer. „Jüngste Handwerksscheine“: keine Linie, 25 px. Scheine-Reiter und Liegenschaftsakte (bündige Karten): Linien bis an die Blattkante, letzte Zeile ohne Luft.
- Soll: „Linien trennen nur dort, wo sie Lesen oder Bedienung unterstützen“ (style.md) — eine Linie unter der letzten Zeile trennt nichts.
- Ursache: `.akten-belegzeile`/`.akten-baustellenzeile` tragen `border-bottom` an jeder Zeile (`lot-akten.css`); der Taktgeber füllt danach auf.
- Vorschlag: `:last-child { border-bottom: 0 }` an beiden Zeilenarten. — Aufwand: klein. Gleich bleiben muss: Blatthöhen im 24-px-Takt (`raster.spec.ts`).

### D2-A15 Kundenseite der Annahme am Handy: „Als PDF“ schwebt über dem Unterschriftsfeld
- Ort: `/angebot/annehmen#…`, 390 px, Stand „offen“. Bild `D2/b/annahme_offen_390.png`.
- Ist: die Hauptaktion des Seitenkopfs („Als PDF“, 86 × 48) schwebt im ersten Bildschirm über der rechten unteren Ecke des Unterschriftsfelds und vor „Groß unterschreiben“. Der Kunde hat hier aber eine andere Hauptaktion: „Verbindlich annehmen“ im Blatt. Soll: U3 („Was ein Blatt auf dem Bildschirm schon trägt, steht nicht noch einmal schwebend darüber“), „Nichts wird verdeckt“.
- Ursache: `AngebotAnnahmeSeite.tsx` übergibt „Als PDF“ als `PageHeader.action`.
- Vorschlag: auf dieser Seite keine schwebende Aktion; „Als PDF“ als gerahmter Knopf im Kopf (wie am Schreibtisch) bzw. als Verweis über den Positionen. — Aufwand: klein.
- Gleich bleiben muss: PDF bleibt ohne Annahme ladbar, auch nach der Entscheidung. Rückschritt: der Knopf fehlt im Stand „angenommen“.

### D2-A16 Knöpfe „30 Tage / 90 Tage / 1 Jahr“ 36 px hoch
- Ort: `/worksheets`, Karte „Stunden ohne Buchung“, 390 und 834 px. Ist: 74 × 36, 74 × 36, 59 × 36. Soll: 44 px Tastfläche am Handy. Vorschlag: Segment (`segment`) mit 44 px wie die Filter darunter. — Aufwand: klein.
- (Das Suchfeld der Listen misst 40 px, seine Hülle `.listenleiste-suche` aber 44 px — kein Befund.)

### D2-A17 Nummern brechen am Bindestrich um
- Ort: Baustellenakte „Herkunft“ am Handy und Tablet: „Aus Eingang EG-“ / „2026-0030“ (Bild `D2/b/m_h_10_390.png`, zweites Bild). Ursache: `overflow-wrap: anywhere` am `dd`, Nummer ohne `OhneUmbruch`. Vorschlag: Nummern in `OhneUmbruch` (Baustein vorhanden) bzw. als Stempel. — Aufwand: klein.

### D2-A18 Akten-Titel am Handy: 24 px in zwei Akten, 28 px in der dritten; vier Zeilen Titel
- Ist (390): `h1` Kunden- und Baustellenakte **24 px/32** (`lot-planlinie.css:73`, `.akten-kopf .seitenkopf h1`), Liegenschaftsakte, Eingang, Angebot **28 px/36**. Der Titel hat nur **246 px**, weil Hilfe und ⋯ (100 px) in seiner Zeile stehen: „Wohnungs-/eigentümergemein-/schaft Hauptstraße/112–118“ — 144 px hoch. Das erste Blatt beginnt bei **y 486** (58 % des ersten Bildschirms sind Kopf). Bild `D2/b/m_h_01_390.png`.
- Soll: gleiche Größe für dieselbe Rolle (E97 nimmt Titel aus, aber gleich sollten die Akten untereinander sein); „Inhalt vor Bedienung“ (Brief C).
- Vorschlag: (a) die Liegenschaftsakte über `AktenKopf` (siehe D2-B1), damit alle Akten 24 px tragen; (b) am Handy Hilfe und ⋯ in die Ortszeile („← ZUR KUNDENLISTE“ hat rechts 220 px frei) — der Titel bekommt 358 px und braucht bei diesem Namen drei statt vier Zeilen; (c) „Kontakt ›“ in die Zeile von Telefon/Mail wie in der Baustellenakte (D2-B16). Zusammen beginnt das erste Blatt rund 90 px höher. — Aufwand: klein–mittel (Baustein `PageHeader`, mit den anderen Bereichen abstimmen).
- Gleich bleiben muss: drei feste Zeilen des Kopfs ab dem Tablet (E31), Tastflächen 44 px, die Insel oben zeigt beim Rollen weiter den Namen. Rückschritt: Hilfe oder ⋯ rutschen am Schreibtisch aus der Titelzeile.

### D2-A19 Knöpfe derselben Rolle in zwei Größen
- Kartenkopf: „Nachtrag anlegen“, „Handwerksschein schreiben“ **13 px / 48 px hoch**; in der Karte „Nachrichten“: „Nachricht schreiben“ **15 px / 48 px**. Zeilenknöpfe: „Neue Fassung“, „Annehmen → Baustelle“, „Erledigt“, „Baustelle anlegen“ **13 px / 44 px**; „Weiterbearbeiten“ (`/worksheets`) **15 px / 48 px**. Soll (E97): „kleine Knöpfe in der Zeile“ 13 px. Vorschlag: „Weiterbearbeiten“ klein wie die anderen Zeilenknöpfe; „Nachricht schreiben“ als Zweitknopf in den Kartenkopf (wie „Nachtrag anlegen“), dann steht der Leersatz allein. — Aufwand: klein.

### D2-A20 Drei „Neu“-Fenster haben ihren Fuß nicht im Bild
- Ort: „Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“ (Fenster 440 px, sichtbarer Rollbereich 785 px), 1440; am Handy dasselbe im Blatt. Bild `D2/b/ku_neu_1440.png`, `D2/b/m_h_00_390.png`.
- Ist: Inhalt **1041 / 1830 / 972 px** hoch; „Abbrechen / Kunde anlegen“ steht als `div.fuss-aktionen` (`position: static`) am Ende des Inhalts, beim Öffnen **nicht sichtbar** (Kunde y 1063, Baustelle y 1852, Wartung y 994 bei 900 px Fensterhöhe). „Neuer Eingang“, „Neue Liegenschaft“, „Termin anlegen“, „Top anlegen“ nutzen `planung-fuss` (`position: sticky; bottom: -20px`) — Knopf immer im Bild.
- Soll: ein Muster für Formulare (U1 Muster 3 / U4); „Fortschritt und Rückmeldung“.
- Ursache: zwei Fuß-Bausteine nebeneinander (`fuss-aktionen` in `CustomersView`, `AdminProjectsView`, `WartungenView`; `planung-fuss` in den jüngeren Formularen).
- Vorschlag: der klebende Fuß für alle „Neu“-Fenster (`NeuFormular` gibt ihn vor, statt dass jede Ansicht ihn baut); Wächter: ein Fenster mit Formular hat seinen Fuß im Bild. — Aufwand: mittel.
- Gleich bleiben muss: Enter im Namensfeld legt weiter an (gemessen: „Kunde angelegt“), „* Pflichtfeld“ bleibt sichtbar, am Handy verdeckt der Fuß kein Feld über der Tastatur. Rückschritt: letztes Feld hinter dem Fuß nicht erreichbar.

---

## 3. Unstimmigkeiten zwischen Seiten

### D2-B1 „Sind die Akten wirklich gleich gebaut?“ — Kunde, Baustelle, Benutzer ja; die Liegenschaftsakte nicht; die Köpfe unterscheiden sich
Gemessen bei 1440 (`D2/akten_1440.txt`, Bilder `D2/b/akte_*_1440.png`):

| | Kunde | Baustelle | Benutzer | Liegenschaft | Angebot / Eingang (Beleg) |
|---|---|---|---|---|---|
| Kopf-Baustein | `AktenKopf` | `AktenKopf` | `AktenKopf` | `PageHeader` | `PageHeader` |
| Titel | Name | Kundenname | Name | Bezeichnung | Gattung („Angebot“, „Eingang“) |
| Nummernstempel | — | unter dem Titel | — | — | neben dem Titel |
| Meta-Zeile | „aktiv“ | Adresse | Rolle | Adresse + „aktiv“ | Kunde + Stand |
| Schriftfeld (Kennwerte) | **keines** | 4 Zellen | keines | keines | 3–4 Zellen |
| ⋯ / Zweitknopf / Hauptaktion | ⋯ / — / Bearbeiten | ⋯ / Bearbeiten / Einsatz planen | — / — / Bearbeiten | ⋯ / — / Bearbeiten | ⋯ / — / je Beleg |
| Reiterleiste y | 150 | 350 | 150 | **144** | keine |
| Rahmen | 816 + 288 px Kontext | 816 + 288 | 816 + 288 | **1128, keine Kontextspalte** | 816 + 288 (`beleg-spalten`) |
| Zeilen im Blatt | eingerückt 296–1064 | eingerückt | — | **bündig bis zur Blattkante**, Kartenkopf mit Linie | Tabelle |
| „Neu im Blatt“ | rundes „+“ (Termine) | gerahmter Textknopf (Angebote, Scheine), rundes „+“ (Termine) | gerahmter Knopf | rundes „+“ (Tops, Beteiligte) | — |
| h1 am Handy | 24 px | 24 px | 24 px | **28 px** | 28 px |
| Bearbeiten-Fenster | 480 px, Speicherleiste | 480 px, Speicherleiste | (anderer Bereich) | **440 px, fester Fuß** | — |

- Kunden-, Baustellen- und Benutzerakte sind in Rahmen, Abständen, Schrift und Kontextspalte deckungsgleich — das Ziel von E99 ist dort erreicht.
- Die **Liegenschaftsakte** ist die Ausnahme: anderer Kopf, keine Kontextspalte (Anschrift, Notiz, Hausverwaltung stünden dort gut), bündige Listen, anderes Fenster.
- Die **Kundenakte hat als einzige keine Kennwerte**. Genau die fehlen für „Was ist offen?“ (siehe D2-C4).
- Vorschlag: Liegenschaftsakte auf `AktenKopf` + `kontext` (Anschrift mit Karte, Notiz, Beteiligte der ganzen Liegenschaft als Kontakt), Zeilen wie in den anderen Akten; Stempel einheitlich neben dem Titel oder einheitlich darunter (heute zwei Lagen). — Aufwand: mittel.
- Gleich bleiben muss: Reiter-Adressen (`?bereich=`), alle Fenster der Tops und Beteiligten, das ⋯ mit „Neu …“. Rückschritt: ein Lesezeichen auf einen Reiter öffnet den falschen.

### D2-B2 Zwei verschiedene Formulare für „Kunde bearbeiten“
- Aus der Liste (Zeilen-⋯ → „Bearbeiten“): Fenster „„Familie Huber“ bearbeiten“, 440 px, fester Fuß „Abbrechen / Änderungen speichern“, Notiz einzeilig, Telefon `type=text`, keine VIES-Prüfung. Bild `D2/b/ku_zeile_bearbeiten_1440.png`.
- Aus der Akte („Bearbeiten“): Fenster „Kunde bearbeiten“, 480 px, Kontaktleiste oben, Abschnitte, Notiz mehrzeilig, Telefon `type=tel`, VIES, Speicherleiste „Verwerfen / Speichern“, Rückfrage bei Escape. Bild `D2/b/ka_bearbeiten_unten_1440.png`.
- Vorschlag: ein Formular; „Bearbeiten“ in der Liste öffnet das Akten-Formular (oder die Akte mit offenem Fenster). — Aufwand: mittel. Gleich bleiben muss: Bearbeiten ohne Umweg aus der Liste; „Löschen“ im Zeilen-⋯. Rückschritt: Verlust eines Felds (beide Feldlisten sind gleich lang — 13 Felder — das prüfen).

### D2-B3 Ungespeicherte Eingaben: drei Verhalten
Gemessen (`D2/letzte.mjs`): Feld füllen, Escape bzw. Klick auf den Schleier.

| Fenster | Escape / Schleier | danach |
|---|---|---|
| „Kunde bearbeiten“, „Baustelle bearbeiten“ (Akte) | Rückfrage „Ungespeicherte Änderungen verwerfen?“ | bleibt offen |
| „Neuer Kunde“, „Neue Baustelle“ | schließt ohne Frage | Eingabe steht beim erneuten Öffnen **noch da** (stiller Entwurf, nirgends gesagt) |
| „Neuer Eingang“ | schließt ohne Frage | Eingabe **weg** |
| „Neue Wartung“, „Neue Liegenschaft“, „Termin anlegen“ | schließt ohne Frage (gemessen) | ob die Eingabe bleibt, nicht nachgemessen |

- Der Eingang ist das Formular, das während eines Telefonats ausgefüllt wird; ein versehentlicher Klick neben das Fenster löscht das Anliegen.
- Vorschlag: eine Regel für alle Fenster mit Formular — entweder Rückfrage (wie die Akte) oder Entwurf behalten **und es sagen** („Entwurf von vorhin — verwerfen“). Empfohlen: Entwurf behalten für alle „Neu“-Fenster (so wie Kunde/Baustelle es schon tun) plus ein Satz im Fenster; Rückfrage nur beim Bearbeiten. — Aufwand: mittel.
- Gleich bleiben muss: Escape schließt weiter jedes Fenster ohne zweite Taste, wenn nichts eingegeben ist. Rückschritt: eine Rückfrage erscheint bei leerem Formular.

### D2-B4 Beschriftung des Knopfs, der speichert — neun Wörter
„Kunde anlegen“, „Liegenschaft anlegen“, „Top anlegen“, „Termin anlegen“, „Angebot anlegen“ | „Anlegen“ (Baustelle; Wartung → Baustelle) | „Eingang erfassen“ | „Beteiligten eintragen“ | „Speichern“ (neue Wartung; Speicherleiste) | „Änderung speichern“ (Liegenschaft, Top, Beteiligter, Eingang, Termin) | „Änderungen speichern“ (Kunde aus der Liste) | „Link erzeugen“, „Senden“, „Hochladen“, „Eintragen“.
- Vorschlag (Regel für `NeuFormular`): neu = „⟨Ding⟩ anlegen“ (auch „Baustelle anlegen“, „Wartung anlegen“, „Eingang anlegen“), ändern = „Speichern“; Sonderwörter nur, wo der Schritt etwas anderes ist (Senden, Hochladen, Link erzeugen). — Aufwand: klein. Gleich bleiben muss: Namen, auf die sich die Browserwege stützen (Tests mitziehen).

### D2-B5 PDF in fünf Wörtern
„PDF herunterladen“ (Angebotsakte), „PDF laden“ (Rechnungsfenster), „PDF“ (Scheinfenster), „Als PDF“ (Annahmeseite), „PDF erstellen“ (Stundennachweis). Vorschlag: „PDF laden“ für ein vorhandenes Dokument, „PDF erstellen“ nur, wo erst gerechnet wird. — Aufwand: klein.

### D2-B6 Dasselbe anlegen, andere Wörter
- Baustelle: „Neue Baustelle“ (Liste, Kundenakte, Liegenschaftsakte), „Baustelle anlegen“ (Eingang, Wartung), „Annehmen → Baustelle“ (Angebot; Pfeilzeichen im Knopf), „Anlegen“ (Rückfrage).
- Schein: „Neuer Schein“ (Liste), „Handwerksschein schreiben“ (Akte), „Schein nachtragen“ (Zeilen-⋯ der Baustellenliste), „Weiterbearbeiten“.
- Angebot: „Neues Angebot“ (Liste, Kundenakte), „Angebot anlegen“ (Eingang), „Nachtrag anlegen“ (Baustellenakte), „Neue Fassung“.
- Vorschlag: „Neu …“ nur für das leere Formular; „… anlegen“ für das Ableiten aus etwas Vorhandenem (das ist heute schon fast die Regel — dann aber „Schein schreiben“ überall und „Angebot annehmen“ ohne Pfeil; die Folge „Baustelle entsteht“ sagt die Rückfrage). — Aufwand: klein. Vorbehalt: „Annehmen → Baustelle“ ist deutlich; nur ändern, wenn der Auftraggeber das Pfeilzeichen im Knopf auch als Unruhe sieht.

### D2-B7 Wo wird gelöscht?
Kunde: Zeilen-⋯ der Liste **und** Karte „Datenschutz“ im Reiter Stammdaten („Löschen …“ als Knopf neben „Auskunft herunterladen“), nicht im ⋯ der Akte. Baustelle: **nur** Zeilen-⋯ der Liste, in der Akte gar nicht. Liegenschaft, Eingang: ⋯ der Akte. Wartung: ⋯ im Fenster. Termin: Tonne als Symbol in jeder Zeile neben dem Stift.
- Soll (U4): „Unumkehrbares steht immer im ⋯, nie als Knopf neben dem nächsten Schritt“.
- Vorschlag: Löschen steht im ⋯ der Akte (Baustelle ergänzen; Kunde: der Eintrag im ⋯ führt in den Löschablauf der Karte „Datenschutz“), Termin: Zeile öffnet das Terminfenster, „Löschen“ dort im ⋯ (das Fenster `TerminFenster` hat die Rückfrage schon). — Aufwand: klein–mittel.
- Gleich bleiben muss: die Probe vor dem Löschen einer Person (Datenauskunft) und alle Sperrgründe; Löschen aus der Liste bleibt. Rückschritt: Löschen einer Baustelle ohne die heutige Prüfung.

### D2-B8 Listenkarte mit und ohne Titel über den Segmenten
`/liegenschaften` („Aktive Liegenschaften“) und `/eingaenge` („Offen“) tragen einen Kartentitel über Suchfeld und Segmenten, der das gewählte Segment wiederholt; die Segmente beginnen dadurch bei y 229 statt 156. `/customers`, `/quotes`, `/admin-projects`, `/wartungen`, `/worksheets` haben keinen. Bild `D2/b/l__eingaenge__Geschäftsführung__1440.png` gegen `D2/b/g__customers__Geschäftsführung__1440.png`.
- Vorschlag: Titel weg (das Segment sagt es), siehe auch D2-T4. — Aufwand: klein. Gleich bleiben muss: der Name der Liste für die Vorlesehilfe (`aria-label` an der Liste).

### D2-B9 Rechnung öffnet im Fenster der Akte — der Schein springt auf die Scheinliste
`/admin-projects/p1` → Scheinzeile: die Seite wechselt zu „Handwerksscheine“ und öffnet dort das Fenster (h1 wechselt, Bild `D2/b/bk_schein_zeile_1440.png`); nach dem Schließen steht man in der Scheinliste, nicht in der Akte. Die Rechnung daneben öffnet seit E99 im Fenster der Akte. Ebenso führen „Neu …“ aus der Kundenakte auf die jeweilige Liste (Baustellen, Wartungen, Auftragseingang) mit offenem Fenster; nach „Abbrechen“ steht man dort.
- Vorschlag: das Scheinfenster (Lesen, PDF, Weiterbearbeiten) in der Akte öffnen wie die Rechnung; nach Abbrechen eines „Neu …“ aus der Akte zurück in die Akte. — Aufwand: mittel. Gleich bleiben muss: die Adresse `/worksheets?…`, über die der Schein verlinkt ist; „Weiterbearbeiten“ führt weiter in den Schein. Rückschritt: der Rückweg aus dem Schein landet nicht mehr in der Scheinliste, wenn man von dort kam.

### D2-B10 Termine: zwei Darstellungen, Symbole statt Zeile
„Nächster Termin“ (Übersicht): Tag groß in Plex Mono, Zeit in Plex Mono rechts. Karte „Termine“ (Reiter): „Di, 24.11. · Lieferung (Aviso) · 08:00–10:00“ als ein Satz in DM Sans 15/500, rechts Stift und Tonne (je 48 × 48) in jeder Zeile; die Zeile selbst öffnet nichts. Bild `D2/b/akte_kunde_3_1440.png`.
- Vorschlag: eine Terminzeile wie „Nächster Termin“ (Datumsspalte, Art, Zeit rechts in Mono, Pfeil), Tipp öffnet das Terminfenster mit „Ändern“ als Hauptaktion und „Löschen“ im ⋯ (Form siehe Abschnitt 7, P3). — Aufwand: mittel. Gleich bleiben muss: Ändern in zwei Tipps (heute einer), Teilnehmer und Notiz sichtbar. Vorbehalt: ein Tipp mehr fürs Ändern — dafür keine Tonne neben dem Stift.

### D2-B11 Kleinigkeiten, je eine Zeile
- **„aktiv“ / „Aktiv“:** Kundenkopf und Liegenschaftskopf klein („aktiv“), Baustelle groß („Aktiv“, „Pausiert“). Vorschlag: groß wie alle Zustände.
- **Zähler im Segment:** nur „Steht an 1“ (Wartungen) und „Offen 3“ (Eingang) tragen eine Zahl hinter dem Wort; die anderen Listen nennen die Zahl im Gruppenkopf (Kreis). Vorschlag: überall gleich — Zahl im Segment nur, wo es keine Gruppen gibt.
- **Wartungsliste:** der Zustand („Seit 64 Tagen überfällig.“) steht hinter dem Namen (x 700), in allen anderen Listen rechts in der Zustandsspalte; er endet als einziger Zustand mit Punkt.
- **Reihenfolge Kunde/Liegenschaft:** „Neue Baustelle“: Projektnummer, Liegenschaft (freiwillig), **dann** Kunde (Pflicht). Angebot, Eingang, Wartung: Kunde vor Liegenschaft.
- **„(optional)“ / „(freiwillig)“:** „Baustelle (optional)“ in „Wartung erledigt eintragen“, sonst überall „(freiwillig)“; dort ist die Baustelle zudem ein Freitextfeld („z. B. 2026-014“) statt der Baustellenauswahl.
- **Zwei „mehr“ am Listenende:** `/customers`, `/wartungen`: „und 1983 weitere anzeigen“ (Zeile) und direkt darunter „Weitere Kunden laden“ (Knopf) mit „2003 von möglicherweise mehr geladen.“; `/admin-projects` nur die Zeile je Gruppe; `/quotes` keines (42 Zeilen offen, am Handy 7.798 px). Vorschlag: ein Weg — die Zeile „und N weitere anzeigen“ lädt nach, wenn sie das Geladene erschöpft hat.
- **Handy-Kopf:** Kundenakte „Kontakt ›“ in eigener Zeile unter Telefon/Mail; Baustellenakte „Adresse und Kontakt ›“ in der Zeile des Telefons.
- **Kontaktleiste im Bearbeiten-Fenster:** „Kunde bearbeiten“ und „Baustelle bearbeiten“ beginnen mit Adresse/Telefon/Mail als gerahmten Knöpfen (am Handy 180 px), bevor das erste Feld kommt; dieselben Verweise stehen in Kopf und Kontextspalte. Im Liegenschafts-Fenster fehlt die Leiste.
- **Fenstertitel:** Wartungsfenster heißt „Anlage“ (darunter Kundenname groß, dann die Angabe „Anlage“); Scheinfenster trägt den Kundennamen; Rechnungsfenster „Rechnung + Stempel“. Vorschlag: Gattung + Stempel/Name wie bei der Rechnung („Wartung · Gasbrennwertkessel …“).
- **Hilfe-Titel einer Akte:** „Hilfe: Wohnungseigentümergemeinschaft Hauptstraße 112–118“ — besser „Hilfe: Kundenakte“.

---

## 4. Bedienung: Befunde aus den durchgespielten Aufgaben

Gezählt sind Tipps/Klicks ohne Tippen von Text; „Fenster“ = wie viele Flächen übereinander.

| Aufgabe | Tipps heute | wo es stockt | Vorschlag |
|---|---|---|---|
| **D2-C1 „Therme tropft“ — vom Anruf bis zum geplanten Einsatz** | 14: Auftragseingang (1) → Neuer Eingang (1) → Quelle (2) → Dringlichkeit (2) → Kunde wählen (1) → Eingang erfassen (1) → Baustelle anlegen (1) → Rückfrage (1) → Einsatz planen (1) → Einsatzplanung ≥ 3. Fenster: 1 + Rückfrage. | „Quelle“ ist Pflicht ohne Vorgabe („Bitte wählen“), obwohl der Anruf der häufigste Fall ist; das Anliegen steht als neuntes von elf Feldern; ein Klick neben das Fenster verwirft alles (D2-B3); „Angebot anlegen“, der zweite Hauptweg, steckt im ⋯; am Handy steht auf der Eingangsseite „Stand“ vor „Anliegen“. | Vorgabe „Telefon“; Reihenfolge Kunde → Anliegen → Dringlichkeit → Rest („Weitere Angaben“ zugeklappt); `nebenAktion` „Angebot anlegen“ neben „Baustelle anlegen“; am Handy Anliegen zuerst. Spart 2 Tipps. Gleich bleiben: alle Felder, Pflichtprüfung der Quelle (Vorgabe ist überschreibbar), Rollenrechte (Verwaltung erfasst, legt keine Baustelle an). |
| **D2-C2 Angebot Badsanierung schreiben und verschicken** | ≥ 9 + Positionen: Angebote (1) → Neues Angebot (1) → Kunde (1) → je Position „Position hinzufügen“ (1) → Angebot anlegen (1) → Angebot öffnen (1) → ⋯ im Verlauf (1) → Per Mail senden (1) → Senden (1). Fenster: 1. | Das Formular steht als 560 px breite Spalte in einem 1.128 px breiten Blatt über der Liste (Schreibtisch: halbes Blatt leer); nach dem Öffnen liegt der Fokus auf `body` (Tastatur muss durch 14 Navigationspunkte); Enter in einer Position legt keine nächste an; Summen ohne Mono (D2-A11); „Per Mail senden“ liegt im zweiten ⋯ der Kontextspalte (D2-A10); der Knopf „Annehmen → Baustelle“ steht am Schreibtisch auch an einem Entwurf mit 0 € (ob er dann ablehnt, regelt `leerNichtAnnehmen` — nicht ausgelöst). | Fokus ins Kundenfeld; Enter im letzten Feld der Position = nächste Position; am Schreibtisch rechts neben dem Formular die Summe und Vorschau der Positionen (Platz ist da); Hauptaktion nach Stand (D2-A10). Gleich bleiben: „Aus dem Katalog …“, Titel/Text-Zeilen, „Weitere Angaben“, die Adresse `/quotes?bearbeiten=`. |
| **D2-C3 Kunde hat angenommen — Baustelle steht, Team zugeteilt** | 5 + n: Annehmen → Baustelle (1) → Rückfrage (1) → „Zur Baustelle“ in der Meldung (1) → Bearbeiten (1) → rund 1.800 px rollen → n Kästchen → Speichern (1). | Der nächste Schritt steht nur in der flüchtigen Meldung; das Team steht am Ende eines Fensters mit 19 Feldern; die Kontextspalte „TEAM UND LEITUNG“ zeigt das Team, lässt sich aber nicht antippen. | Dachzeile „TEAM UND LEITUNG“ mit Verweis „ändern“ (wie „Wartungen öffnen ›“), der das Fenster am Abschnitt Team öffnet — oder ein kleines Fenster nur für Team und Leitung. Nach dem Annehmen direkt in die neue Baustellenakte führen (die Meldung bleibt als Bestätigung). Gleich bleiben: das volle Bearbeiten-Fenster, die Warnung „ohne Projektleitung“. |
| **D2-C4 „Was ist bei Familie Huber offen?“** | Hinweg 0 Klicks (Strg+K, „Huber“, Enter) bzw. 2; dann **3 Reiter** (Baustellen → Auftragseingänge; Belege → offene Rechnungen/Angebote; Termine und Wartungen) und Kopfrechnen. | Die Übersicht zeigt aktive Baustellen, den nächsten Termin und die drei jüngsten Belege, aber keine Summe: nicht „€ offen“, nicht „1 Eingang offen“, nicht „1 Wartung überfällig“ (nur „2 Wartungsvereinbarungen“ grau in der Kontextspalte). Die Kundenakte ist die einzige Akte ohne Schriftfeld (D2-B1). | Schriftfeld im Kopf der Kundenakte: „Offen € …“ (Rechnungen), „Baustellen aktiv“, „Angebote offen“, „Wartung fällig“, je Zelle ein Verweis auf den Reiter — die Bausteine (`MetricRow`, `stand`) gibt es. Gleich bleiben: Reiter und Karten unverändert; die Zahlen kommen aus Abfragen, die die Akte schon stellt (Leistungsprüfung L11 beachten). Aufwand: mittel. |
| **D2-C5 Dieselbe Hausverwaltung, anderes Haus** | 3 + Tippen: ⋯ (1) → Neue Baustelle (1) → Adresse überschreiben → rollen → Anlegen (1). | Die Baustellenadresse ist mit der Rechnungsanschrift der Hausverwaltung vorbelegt — für eine Hausverwaltung genau die falsche („Vom Kunden übernommen … einfach überschreiben“); die Seite wechselt zur Baustellenliste, nach Abbrechen ist die Kundenakte weg (D2-B9); „Anlegen“ steht 1.830 px tief (D2-A20). | Bei Kundenart Hausverwaltung/Unternehmen die Adresse **nicht** vorbelegen, sondern die bisherigen Baustellenadressen und Liegenschaften dieses Kunden als Vorschläge unter dem Feld zeigen (ein Tipp). Gleich bleiben: Privatkunden behalten die Vorbelegung. Vorbehalt: `useBaustellenVorschlag.ts` und `LiegenschaftVorschlaege.tsx` gibt es schon — nur im Code gelesen, in der Vorschau ohne Daten; erst prüfen, was davon schon greift. |
| **D2-C6 Wartung ist fällig — einplanen** | 4 + Planung: Wartungen (1) → „Baustelle anlegen“ (1) → Rückfrage mit Projektnummer (1) → „Einsatz planen“ in der Meldung (1) → Einsatzplanung ≥ 3. | Das Wort „einplanen“ kommt nicht vor; wer einen Termin sucht, erwartet keinen Knopf „Baustelle anlegen“. Der Weg in die Planung steht nur in der flüchtigen Meldung. Der rote „Eintragen“ (D2-A4). | Knopf „Einplanen“ (Rückfrage erklärt: „Dafür entsteht die Baustelle …“), danach direkt in die Einsatzplanung mit der Baustelle gewählt. Gleich bleiben: die Projektnummer bleibt änderbar, der Weg ohne Planung („nur Baustelle“) bleibt über das Fenster der Wartung. |
| **D2-C7 Tastatur am Schreibtisch** | — | Gut: Strg+K mit Fokus im Feld; Enter im Namensfeld legt den Kunden an; Escape schließt jedes Fenster; der Fokus kehrt auf die Zeile zurück; Reiter mit Pfeiltasten. Stockt: nach dem Öffnen eines Fensters liegt der Fokus auf dem Fenster, das erste Feld braucht zwei Tab („Schließen“ kommt zuerst); „Neues Angebot“ setzt keinen Fokus; die Tab-Folge einer Liste geht durch „Zum Inhalt“, Suche und alle Navigationspunkte, bevor der Inhalt kommt (der Sprungverweis hilft, wenn man ihn kennt). | Am Schreibtisch (nicht am Handy, dort käme die Tastatur hoch) Fokus ins erste Feld eines „Neu“-Fensters; „Schließen“ ans Ende der Tab-Folge. Gleich bleiben: Fokusfalle im Fenster, Escape. |
| **D2-C8 Fenster übereinander** | höchstens 2 | Nie mehr als Fenster + Rückfrage gesehen. „Beteiligten an diesem Top eintragen“ aus dem Top-Fenster und „Bearbeiten“ aus dem Wartungsfenster ersetzen das Fenster, statt ein zweites zu öffnen — richtig so. | Nichts ändern. |

Weitere Befunde aus dem Durchspielen:

- **D2-C9 Handy: lange Zeilen.** Gemessen bei 390 px mit dem großen Bestand: Baustellenliste 60 Zeilen = 9.718 px (≈ 160 px je Zeile, die erste Beispielzeile 282 px: Name, Nummer, Adresse zweizeilig, Telefon, Projektleitung, Team zweizeilig, Budget), Wartungen ≈ 180 px, Angebote ≈ 185 px, Eingang bis 230 px (Anliegen ungekürzt in fünf Zeilen). Auf einen Bildschirm passen 1,5 bis 3 Einträge. Vorschlag in Abschnitt 6 (T1–T3) und 7 (P1, P4, P5).
- **D2-C10 Handy: Scheine.** Vor der Liste stehen Kennzahlen und die Karte „Stunden ohne Buchung (0) — Alle Stunden gebucht.“; die erste Zeile beginnt bei y ≈ 730. E98 hat dasselbe Muster bei den Rechnungen zugeklappt. Vorschlag: die Karte beginnt zugeklappt, wenn die Zahl 0 ist (`Card klappe`), und zeigt dann nur „Alle Stunden gebucht“. Gleich bleiben: bei Zahl > 0 offen wie heute.
- **D2-C11 Handy: Angebotsakte und Eingang.** Reihenfolge am Handy: Kennwerte → Sprungleiste → Verlauf → Angaben → **Positionen zuletzt**; beim Eingang Stand → Anliegen → Angaben. Der Inhalt, wegen dem man die Seite öffnet, steht am Ende. Vorschlag: Positionen bzw. Anliegen zuerst, Verlauf danach (die Schritte wandern mit D2-A10 in den Kopf). Gleich bleiben: Sprungleiste, Anker.
- **D2-C12 Knöpfe in Listenzeilen.** Angebote (bis zu zwei Knöpfe + Stift + ⋯), Wartungen (zwei Knöpfe), Scheine (ein Knopf). Sie sind der Grund für D2-A12 und dafür, dass diese Zeilen keinen Pfeil tragen. Apple-Muster: die Zeile öffnet, die Aktionen stehen im Fenster/in der Akte und im Kontextmenü. Vorschlag: höchstens **ein** kleiner Knopf je Zeile für den einen nächsten Schritt (Wartung: „Erledigt“; Schein: „Weiterbearbeiten“; Angebot: keiner, weil die Akte ihn trägt), der Rest ins ⋯ bzw. Fenster. Gleich bleiben: jede Aktion in höchstens zwei Tipps.
- **D2-C13 Kundenseite der Annahme: unterschreiben vor dem Lesen.** Reihenfolge: Kennwerte → **„Angebot annehmen“ (Name, Kästchen, Unterschrift, „Verbindlich annehmen“)** → Angaben → Positionen. Der Kunde soll verbindlich annehmen, bevor er die Positionen gesehen hat (am Handy stehen sie 1.000 px tiefer). Vorschlag: Angaben und Positionen zuerst, das Annahme-Blatt danach; oben ein Verweis „Zur Annahme ↓“ in der Zeile der Kennwerte. Gleich bleiben: PDF, Ablehnen, Prüfsumme, alle Pflichtangaben. Aufwand: klein. Bilder `D2/b/annahme_offen_1440.png`, `D2/b/annahme_offen_390.png`.
- **D2-C14 Papierkorb.** Nur unter Einstellungen → Papierkorb (dritte Reiterzeile), von der Angebots- und Scheinliste aus kein Verweis; die Meldung nach „Verwerfen“ sagt „In den Papierkorb gelegt“ ohne Sprung. Vorschlag: die Meldung trägt „Rückgängig“ (Wiederherstellen ist fachlich erlaubt) oder „Zum Papierkorb“; am Ende der Angebotsliste (Segment „Erledigt“/„Alle“) ein leiser Verweis „Verworfene (n) im Papierkorb“. Gleich bleiben: endgültiges Löschen nur im Papierkorb.

---

## 5. Ideen: intuitiver, hochwertiger, näher an Apple

| Kürzel | Idee | Nutzen | Ort | Aufwand |
|---|---|---|---|---|
| D2-I1 | **Hauptaktion = nächster Schritt des Stands**, überall nach demselben Muster wie `akteHauptaktion.ts`: Angebot (D2-A10), Eingang („Baustelle anlegen“ + Zweitknopf „Angebot anlegen“), Wartung im Fenster („Einplanen“ wenn fällig, sonst „Erledigt“). | Man muss nicht suchen, was jetzt dran ist; ein Knopf, der sich mit dem Stand ändert, wirkt „mitdenkend“. | Angebotsakte, Eingang, Wartungsfenster | mittel |
| D2-I2 | **Kennwerte im Kopf der Kundenakte** (D2-C4), jede Zelle ein Verweis auf den Reiter. | „Alles zu einem Kunden auf einen Blick“ ohne Reiterwechsel. | `KundenakteView`, `AktenKopf.stand` | mittel |
| D2-I3 | **Nach dem Anlegen dorthin, wo es weitergeht** statt in die Meldung: Angebot angenommen → Baustellenakte; Wartung eingeplant → Einsatzplanung mit Baustelle gewählt; Neu aus der Kundenakte abgebrochen → zurück in die Akte. Die Meldung bestätigt nur noch. | Kein „wo ist es jetzt?“; die Meldung verschwindet nach wenigen Sekunden, der Weg nicht. | `angebotAnnehmen.ts`, `WartungenView`, `neuFuer.ts` | klein–mittel |
| D2-I4 | **Angebot schreiben als Arbeitsbereich mit zwei Zonen** am Schreibtisch: links Formular (560 px wie heute), rechts die laufende Summe und die Positionen so, wie der Kunde sie sieht (`PositionenTabelle` gibt es). Am Handy unverändert einspaltig, Summe als klebende Zeile über dem Fuß. | Die leere rechte Hälfte des Blatts wird zum Beleg; Tippfehler in Preisen fallen sofort auf. | `QuotesView` (Formular) | mittel–groß. Vorbehalt: U2 sagt, der Neu-Ablauf des Angebots „bleibt eine Seite“ — das bleibt er. |
| D2-I5 | **Schnellerfassung in Positionen:** Enter im letzten Feld legt die nächste Position an und setzt den Fokus in „Bezeichnung“; Strg+Enter speichert. | Zehn Positionen ohne Maus. | Angebotsformular | klein |
| D2-I6 | **Kontextmenü an der Zeile** (Rechtsklick am Schreibtisch, langes Drücken am Handy) mit denselben Einträgen wie das ⋯. | Vertraut von macOS/iOS, kostet keinen Platz; die sichtbaren Zeilenknöpfe können entfallen (D2-C12). | `ListRow`, `RowMenu` | mittel. Vorbehalt: langes Drücken ist in der Einsatzplanung schon „Ziehen“ — nur in Listen. |
| D2-I7 | **Zeile bleibt markiert, solange ihr Fenster offen ist** — gibt es bei Scheinen und Wartungen schon (`--auswahl` + Kontur, schön zu sehen in `D2/b/sc_zeile_1440.png`). Auf Rechnung, Top, Beteiligte, Termin in den Akten ausdehnen. | Man weiß, was man offen hat; der Rückweg des Auges ist kurz. | Akten-Zeilen | klein |
| D2-I8 | **Am Schreibtisch: Fenster der Zeile mit Pfeil auf/ab weiterblättern** (nächster Schein, nächste Wartung), wie es die Monatsvorschau der Planung kann. | Durchsehen einer Liste ohne Schließen/Öffnen. | Schein-, Wartungs-, Rechnungsfenster | mittel. Vorbehalt: Nutzen nur bei Betrieben mit vielen Scheinen am Tag. |
| D2-I9 | **Leerzustände, die den ersten Schritt tragen** — heute nur „Pläne“ (mit Zeichnung und Knopf). „Noch kein Einsatz geplant.“, „Noch kein Eingang.“, „Keine Wartung in dieser Liegenschaft.“ könnten den Schritt als leisen Verweis im Satz tragen („Einsatz planen ›“). | Jede leere Karte ist ein Angebot, kein Loch. | Akten-Karten | klein. Gleich bleiben: keine zweite gefüllte Aktion, keine Zeichnung in dichten Akten (style.md). |
| D2-I10 | **Karten ohne Inhalt in der Übersicht der Baustellenakte zusammenlegen:** am Handy ist die Übersicht 3.862 px lang, davon fünf Karten mit je einem Satz. Leere Karten als eine Zeile „Noch nichts: Nachrichten · Einsätze · Material“ mit den drei Verweisen — oder am Handy erst die gefüllten, dann die leeren. | Kürzerer Weg zu Rechnungen und Scheinen. | `BaustellenUebersicht` | mittel. Vorbehalt: E99 hat die leeren Karten bewusst gelassen („sie tragen den nächsten Schritt“) — nur als Reihenfolge am Handy, nicht als Entfernen. |
| D2-I11 | **Team direkt an der Akte ändern** (D2-C3): Verweis „ändern“ an der Dachzeile der Kontextspalte, kleines Fenster mit `PersonPicker`. | Der häufigste Griff nach dem Anlegen ohne 19-Felder-Formular. | `BaustellenakteView` | klein–mittel |
| D2-I12 | **Erster Fokus im ersten Feld** bei „Neu“-Fenstern am Schreibtisch (D2-C7). | Fenster auf, sofort tippen. | `BottomSheet`/`NeuFormular` | klein |
| D2-I13 | **Bearbeiten-Fenster in Abschnitten mit Sprungleiste** (wie die Angebotsakte am Handy): „Kunde und Ort · Auftrag · Zeitraum · Team“. | 2.000 px Formular werden vier kurze Wege. | „Baustelle bearbeiten“, „Neue Baustelle“ | mittel |

---

## 6. Wo wird noch zu viel Text bzw. unnötige Info angezeigt?

Durchgegangen: jeder Bildschirm und Reiter des Bereichs, die Fenster und Formulare (`D2/texte.mjs`, Ausgabe `D2/texte_1440.txt`, dazu die Bilder). Grundsatz bei jedem Vorschlag: die Auskunft bleibt erreichbar — es steht dabei, wo.

| Kürzel | Bildschirm | Text (wörtlich, gekürzt) | warum entbehrlich | wohin damit |
|---|---|---|---|---|
| D2-T1 | Baustellenliste, jede Zeile (390: 282 px) | „Hauptstraße 112–118, 2700 Wiener Neustadt“ + „0664 1234567“ + „Projektleitung: Franz Hinterleitner“ + „Team: Max Mustermann, Anton Berger-Steinmetz“ + „240 h / Budget, nichts gebucht“ | Sieben Angaben je Zeile. Zum Finden reichen Kunde, Nummer, Ort; Team und Projektleitung braucht man in der Akte (Kontextspalte „TEAM UND LEITUNG“), Telefon und Adresse ebenso (Kopf, Kontextspalte). | **Am Handy:** Name, Nummer, Ort (ohne Straße), Zustand, Budget; alles andere in der Akte. **Am Schreibtisch:** Team und Projektleitung nur zeigen, wenn sie fehlen („ohne Projektleitung“ — das steht schon als Zustand da); Telefon bleibt (Anruf aus der Liste ist ein echter Griff). „Budget, nichts gebucht“ → „Budget“ (dass nichts gebucht ist, sagt die fehlende Maßlinie). |
| D2-T2 | Wartungsliste, Zeile | „Gasbrennwertkessel Vaillant ecoTEC plus VC 206 · Hauptstraße 112–118, 2700 Wiener Neustadt · alle 12 Monate · Termin 20.09.2026 · zuletzt 20.09.2025 · Schlüssel bei der Hausverwaltung abholen“ | Sechs Angaben in einem grauen Satz über zwei bis fünf Zeilen. „Termin 20.09.2026“ sagt dasselbe wie „Seit 64 Tagen überfällig“; „zuletzt“ und „alle 12 Monate“ ergeben den Termin; der Hinweis ist für den Monteur. | Zeile: Kunde, Anlage, Ort — rechts der Zustand. Intervall, zuletzt, Termin, Hinweis stehen vollständig **im Fenster der Zeile** (dort heute schon: Anlage, Standort, Intervall, Hinweis, Verlauf). |
| D2-T3 | Auftragseingang, Zeile | „Ringstraße 3, 2700 Wiener Neustadt · Therme tropft seit gestern Abend, Wasser steht im Heizraum. Bitte rasch jemanden schicken. · Telefon · 23.11.2026, 20:35“ | Das ganze Anliegen ungekürzt in der Liste (am Handy fünf Zeilen); die Quelle („Telefon“) entscheidet nichts in der Liste. | Anliegen auf **eine Zeile gekürzt** (zwei am Handy), ganz auf der Eingangsseite; Quelle nur dort; Uhrzeit nur am selben Tag, sonst Datum („heute 20:35“ / „21.11.“). |
| D2-T4 | Liegenschaften, Auftragseingang | Kartentitel „Aktive Liegenschaften“, „Offen“ | wiederholt das gewählte Segment direkt darunter (D2-B8). | weg. |
| D2-T5 | Seitenköpfe der Listen | „Ansprechpartner, Baustellen und Belege“ (Kunden) · „Häuser und Anlagen mit ihren Tops und Beteiligten“ · „Anfragen und Aufträge, bevor sie Baustelle oder Angebot werden“ · „Wiederkehrende Wartungen“ · „Leistungsnachweise der Baustellen, auch Entwürfe“ · „Anlegen und suchen — geändert wird in der Akte“ · „Verworfene Entwürfe wiederherstellen oder löschen“ · „2 offene Angebote · kalkulieren, versenden, in einen Auftrag überführen“ | Erklären, was die Seite ist — nützt beim ersten Besuch. „Wiederkehrende Wartungen“ unter „Wartungen“ wiederholt den Titel. Am Handy sind sie schon ausgeblendet; am Schreibtisch stehen sie auf jeder Seite dauerhaft. | In „Hilfe zu dieser Seite“ als erster Satz (`PageHeader.hilfe` gibt es dafür). Bleiben darf, was eine **Zahl** ist: „2 offene Angebote“. |
| D2-T6 | Scheine, Karte „Stunden ohne Buchung (0)“ | „Alle Stunden gebucht.“ / „Geprüft über die 2 geladenen Scheine dieser Liste.“ / „Weiter zurück prüfen: 30 Tage, 90 Tage, 1 Jahr“ | Bei 0 ist nichts zu tun; die Kennzahl „OHNE BUCHUNG 0“ steht direkt darüber noch einmal. „geladenen Scheine dieser Liste“ ist Technik. | Zugeklappt bei 0 (D2-C10); der Prüfzeitraum erscheint beim Aufklappen. Die Auskunft „über welchen Zeitraum geprüft“ bleibt dort. |
| D2-T7 | Kunden- und Wartungsliste, Fuß | „2003 von möglicherweise mehr geladen.“ | Technischer Zustand des Nachladens. | weg; die Zeile „und 1983 weitere anzeigen“ sagt, dass es weitergeht (D2-B11). Wo die Gesamtzahl bekannt ist, bleibt „100 von 143“. |
| D2-T8 | Kundenakte, Stammdaten, Karte ohne Titel | „Prüfung bei VIES / gültig laut VIES am 02.10.2026, 10:15 / Abfrage-ID WAPIAAAAZ8Cq1x2b · gefragt von Erna Buchhalter / WOHNUNGSEIGENTÜMERGEMEINSCHAFT HAUPTSTRASSE 112–118 / Hauptstraße 112 / AT-2700 Wiener Neustadt“ | Für die tägliche Arbeit zählt „UID gültig, geprüft am …“. Abfrage-ID, Fragender und die von VIES gemeldete Anschrift sind Nachweis für die Prüfung durch das Finanzamt. Die Karte hat keinen Titel und beginnt mit einer Linie. | Eine Zeile an der Angabe „UID-Nummer“: „ATU87654321 — gültig, geprüft 02.10.2026“, darunter „Nachweis anzeigen“ (aufklappbar) mit Abfrage-ID, Fragendem und gemeldeter Anschrift. **Nichts geht verloren** — der Nachweis ist steuerlich nötig und bleibt einen Tipp entfernt. |
| D2-T9 | Kundenakte, Kontextspalte | „WARTUNGEN / 2 Wartungsvereinbarungen / Wartungen öffnen ›“ | Dachzeile, Satz und Verweis sagen dreimal „Wartungen“. | „WARTUNGEN 2 ›“ als eine Zeile (Dachzeile ist der Verweis) — oder mit D2-I2 in die Kennwerte. |
| D2-T10 | Baustellenakte, Schriftfeld | „ENDE GEPLANT —“; ebenso „nicht hinterlegt“ (Angebot → Baustelle), „nicht angegeben“ (Eingang → Nummer des Auftraggebers), „nicht festgelegt“ | Leere Felder als Zelle bzw. Angabe. | Im **Schriftfeld** bleibt die Zelle (vier feste Zellen, sonst springt der Kopf), aber mit dem Schritt statt dem Strich: „Ende festlegen“ als leiser Verweis ins Bearbeiten-Fenster. In **Angaben-Listen** die leere freiwillige Angabe weglassen (Nummer des Auftraggebers, Baustelle am Angebot). Bleiben muss „nicht hinterlegt“ dort, wo das Fehlen eine Folge hat (Kundenart, UID, Projektleitung). |
| D2-T11 | Baustellenakte am Handy | Karte „Angaben“ (Abrechnung, Beginn „Montag“, Ende geplant) + Kopf („B-2026-0147 Aktiv“, Adresse) + Kontext „KUNDE UND ORT“ (Adresse, Telefon noch einmal) | Die Adresse steht dreimal (Kopf, „Adresse und Kontakt ›“, Kontextspalte unten), das Telefon zweimal. | Adresse im Kopf weg, wenn sie dem Titel der Liste schon entspricht — nein: sie bleibt im Kopf (Orientierung), aber die Kontextspalte unten wiederholt am Handy nur noch, was oben **nicht** steht (Kunde, Ansprechpartner, Team). |
| D2-T12 | Kunden- und Baustellenakte, Karten „Termine“ | „Wohnungseigentümergemeinschaft Hauptstraße 112–118 · B-2026-0147“ unter jedem Termin | In der **Baustellenakte** fehlt die Zeile schon (richtig). In der **Kundenakte** wiederholt sie den Kunden, dessen Akte offen ist. | In der Kundenakte nur die Baustellennummer (sie unterscheidet), nicht den Kundennamen. Hinweis: dass dort Termine anderer Kunden erscheinen, liegt an der Attrappe. |
| D2-T13 | Baustellenakte, „Jüngste Handwerksscheine“ / Reiter Scheine | „geschrieben von Max Mustermann“ unter jedem Schein | E99 hat es bewusst gelassen („wer ihn verantwortet“). Als Satz mit zwei Füllwörtern je Zeile. | Bleibt als Auskunft, kürzer: nur der Name, in der Meta-Zeile („Regie · Max Mustermann“). |
| D2-T14 | Fenster „Annahme-Link“ | „Der Kunde sieht das Angebot unter dem Link, kann es als PDF speichern und mit seiner Unterschrift annehmen oder ablehnen. Nimmt er an, entsteht die Baustelle wie beim Annehmen hier.“ + „Ohne Abrechnungsart gibt es keinen Link — der Kunde nimmt an, ohne dass jemand nachfragen kann.“ + „Die Baustelle bekommt eine Nummer wie B-2026-0001.“ + „Vorgabe: die Bindefrist des Angebots, liegt sie zurück 30 Tage. Höchstens ein Jahr.“ | Vier Erklärungen in einem Fenster mit drei Feldern; beim zweiten Link kennt man sie. In einem Fenster darf der Text offen bleiben (U9) — aber nur der, der die Entscheidung trägt. | Offen bleibt **ein** Satz („Nimmt der Kunde an, entsteht die Baustelle — ohne Rückfrage.“). Die anderen drei als `hint` an den Feldern (hinter „i“) bzw. in „Hilfe“. |
| D2-T15 | Fenster „Neue Baustelle“ / „Baustelle bearbeiten“ | „Vom Kunden übernommen. Stimmt die Baustelle nicht damit überein, einfach überschreiben.“ · „Ohne zugeteilte Projektleitung erreicht eine Eilzustellung für diese Baustelle niemanden. Die Verwaltung wird weiterhin verständigt.“ | Der erste Satz steht dauerhaft unter dem Feld, auch wenn die Adresse längst geändert wurde. Der zweite ist eine Folge-Warnung — die soll bleiben, aber nur wenn es zutrifft. | Erster Satz: nur solange das Feld noch den übernommenen Wert trägt, kürzer („Vom Kunden übernommen“). Zweiter: nur wenn keine Projektleitung gewählt ist (prüfen, ob das heute schon so ist — im Bild stand er bei leerer Auswahl). |
| D2-T16 | Papierkorb, Karte „Frist“ | Feldbeschriftung „Papierkorb: Hinweis nach … Tagen (leer = kein Hinweis)“ | „Papierkorb:“ steht auf der Seite Papierkorb in der Karte „Frist“. | „Hinweis nach … Tagen“, Hinweis „leer = kein Hinweis“ als Feldhinweis. |
| D2-T17 | Kundenseite der Annahme | „Perl Installationen GmbH“ als Briefkopf und direkt darunter „PERL INSTALLATIONEN GMBH“ als Ortszeile; „Angebot gültig bis“ im Schriftfeld und „Gültig bis“ in „Angaben“; „Gespeichert werden Name, Unterschrift und Zeitpunkt — keine IP-Adresse, kein Gerät.“; „Prüfsumme dieses Stands: a3f9…“ (64 Zeichen, am Handy zweizeilig) | Firmenname und Frist doppelt. Der Satz zur Speicherung und die Prüfsumme sind bewusst da (Vertrauen, Nachweis) — bleiben. | Ortszeile weg (der Briefkopf sagt es); „Gültig bis“ nur im Schriftfeld. Prüfsumme bleibt am Seitenende, leise — dort stört sie nicht. |
| D2-T18 | Eingangsseite, Verlauf | „Offen — Wartet darauf, Baustelle oder Angebot zu werden.“ | Erklärt den Zustand jedes offenen Eingangs gleich. | In „Hilfe zu dieser Seite“; im Verlauf bleibt „Offen“ mit dem Datum. |
| D2-T19 | Angebotsliste, Zeile | „01.09.2026 · gültig bis 01.10.2026 · 240 h kalkuliert“ und rechts zusätzlich „abgelaufen“ | „gültig bis 01.10.2026“ und „abgelaufen“ sagen dasselbe; unter der Gruppe „BINDEFRIST ABGELAUFEN“ ein drittes Mal. „0 h kalkuliert“ beim Entwurf ohne Position sagt nichts. | Unter der Gruppe „Bindefrist abgelaufen“ entfällt der Zustand „abgelaufen“ in der Zeile (die Gruppe sagt es; die Frist bleibt als Datum). „h kalkuliert“ nur, wenn > 0. |
| D2-T20 | Kundenliste, Zustand | „Kundenart prüfen“ an **jeder** Zeile der Beispieldaten | Wenn (fast) alle Zeilen denselben Zustand tragen, trägt er nichts. In echten Daten nach einem Import genauso. | Der Zustand bleibt an der Zeile (er verlangt Handeln), aber das Segment „Ohne Kundenart“ zeigt die Zahl („Ohne Kundenart 3“), damit man sieht, wie viele es sind; ab z. B. zehn ein einzelner Hinweis über der Liste „12 Kunden ohne Kundenart — der Reihe nach prüfen“ statt 12 Zeichen. Vorbehalt: Nutzen unsicher, erst mit echtem Bestand ansehen. |

---

## 7. Was kann man statt der Punkte machen?

**Bestand.** Trennpunkte „·“ (kein „•“ gefunden) stehen im Bereich in rund 60 sichtbaren Textstellen je Durchgang; die Muster wiederholen sich. Gezählt je Zeile (`D2/texte_1440.txt`):

| Muster | Beispiel | Punkte je Zeile | wo |
|---|---|---|---|
| a Meta-Kette einer Listenzeile | „Gasbrennwertkessel … · Hauptstraße … · alle 12 Monate · Termin 20.09.2026 · zuletzt 20.09.2025 · Schlüssel …“ | **5** | Wartungen |
| | „Nutzer bzw. Mieter · Top 7 · 0676 1112223 · seit 01.04.2025 · nur nachmittags erreichbar“ | **4** | Beteiligte |
| | „Ringstraße 3, … · Therme tropft … · Telefon · 23.11.2026, 20:35“ | 3 | Auftragseingang |
| | „01.09.2026 · gültig bis 01.10.2026 · 240 h kalkuliert“ | 2 | Angebote |
| b Art · Datum (Beleg) | „Angebot · 10.09.2026“, „Rechnung · 01.09.2026“ | 1 | Belegzeile beider Akten |
| c Betrag · Stand | „€ 22 104,60 brutto · Überfällig“; „€ 31 008,60 brutto · 3 Rechnungen“ | 1 | Reiter Belege; Rechnungen der Baustellenakte |
| d Termin als Satz | „Di, 24.11. · Lieferung (Aviso) · 08:00–10:00“ | 2 | Karten „Termine“ |
| e Datum · Abrechnung | „23.11.2026 · Regie“ | 1 | Scheine (Liste, Akte, Fenster) |
| f Zwei Angaben in einem Wert | „Frau Huber · 0699 9876543“; „Telefon · erfasst von Michaela Wagner“; „Abfrage-ID … · gefragt von …“ | 1 | Eingang, VIES |
| g Seitenkopf | „2 offene Angebote · kalkulieren, versenden, …“; „Musterstrasse 1 · 2700 Wiener Neustadt“ / „Tel … · office@… · www…“ (Annahmeseite) | 1–2 | Angebote; Annahme |
| h Summenzeile | „Netto € 0,00 · USt € 0,00 · Brutto € 0,00“ | 2 | Angebotsformular |
| i Aufklapper | „Weitere Angaben · gültig bis 23.12.2026“ | 1 | Angebotsformular |
| j Nummer · Text | „EG-2026-0031 · Therme tropft …“ | 1 | Kundenakte, Auftragseingänge |
| k Fußzeile | „Datenschutz · Impressum“ | 1 | Annahmeseite |

Warum die Kette stört: der Punkt macht alle Angaben gleich wichtig, die Kette bricht irgendwo um (am Tablet und Handy gemessen am Punkt: „Angebot ·“ / „01.09.2026“; am Handy beginnt eine Zeile mit „· Therme tropft“), und Zahlen stehen nie untereinander.

**Vorschläge je Muster — alle in der Linie V10 (keine Pillen, keine Farbflächen, Bausteine vorhanden):**

- **D2-P1 (Muster a) Zwei Zeilen mit Hierarchie + feste Spalten statt Kette.** Skizze Wartungszeile am Schreibtisch:
  `Kunde (15/500)                         | Anlage (15) | Ort (13 leise) | Zustand mit Zeichen | Datum in Mono rechts`
  `Anlage als zweite Zeile nur am Handy`
  Also: Name links (Tinte), darunter **eine** leise Angabe (die Anlage), rechts eine feste Spalte für den Zustand und eine für den Messwert (Datum der Fälligkeit, Plex Mono 13, rechtsbündig). Intervall, zuletzt, Hinweis → Fenster (D2-T2). Am Handy: Zeile 1 Name + Zustand rechts, Zeile 2 Anlage, Zeile 3 Ort leise. Kein Punkt mehr nötig.
  Beteiligte: Zeile 1 Name, rechts die Rolle als leise Angabe in fester Spalte; Zeile 2 „Top 7“ bzw. „ganze Liegenschaft“; Telefon/E-Mail als Kontaktverweis mit Symbol (Baustein `Kontakt`, Linie und Symbol wie überall, E72) statt als Text in der Kette; „seit …“ und Hinweis ins Fenster.
  Eingang: Zeile 1 Kunde + Nummernstempel, rechts Dringlichkeit; Zeile 2 das Anliegen (eine Zeile, Tinte — es ist der Inhalt, nicht Meta); Zeile 3 Ort leise, rechts Eingangszeit in Mono.
- **D2-P2 (Muster b, c) Die Belegzeile als Raster, wie sie fast schon ist.** Heute: „Angebot · 01.09.2026“ über dem Stempel. Besser: die Art entfällt, wo die Karte sie sagt (Karte „Angebote“, Karte „Rechnungen“ — dort steht in jeder Zeile wieder „Angebot ·“ / „Rechnung ·“); in gemischten Karten („Jüngste Belege“) steht die Art als Wort **vor dem Stempel in derselben Zeile** und das Datum als eigene Spalte in Mono:
  `Rechnung  [2026-0232]      01.09.2026      ○ Offen      € 7 488,00 ›`
  `                                                         brutto`
  Am Handy zweizeilig: Zeile 1 Stempel + Betrag rechts, Zeile 2 Datum (Mono, leise) + Stand. „€ 31 008,60 brutto · 3 Rechnungen“ wird zu zwei Angaben nebeneinander („Gestellt € 31 008,60“ / „Rechnungen 3“) — die Karte hat das Gitter schon (`akten-angaben`).
- **D2-P3 (Muster d) Termin: Datumsspalte links, Zeit rechts in Mono** — genau wie „Nächster Termin“ es heute schon zeichnet:
  `DI      Lieferung (Aviso)                         08:00–10:00 ›`
  `24.11.  Heizkörper, 2 Paletten · Stefan Gruber`
  Der Tag steht in einer festen schmalen Spalte (Wochentag als Dachzeile 12 px, Datum Mono), die Art in Tinte, die Zeit rechtsbündig in Mono; mehrere Termine am selben Tag teilen sich den Tageskopf (Datum nur einmal). Ein Punkt bleibt höchstens zwischen Notiz und Teilnehmern.
- **D2-P4 (Muster e) Schein: Datum als Spalte, Abrechnung als leise Angabe.** „23.11.2026 · Regie“ → links Datum in Mono (es ist der Schlüssel, nach dem Scheine gesucht werden, E91), daneben „Regie“ in Tinte; in der Scheinliste, wo der Kunde Titel ist, Datum rechts in fester Spalte vor der Dauer. In der Akte könnten Scheine unter einem Monatskopf stehen („NOVEMBER 2026“), dann genügt „23.“.
- **D2-P5 (Muster a, Angebote) Weglassen, was die Gruppe sagt; Rest in Spalten.** „01.09.2026 · gültig bis 01.10.2026 · 240 h kalkuliert“ → Schreibtisch: Spalten „Datum“ (Mono), „gültig bis“ (Mono, mit Warnzeichen wenn abgelaufen — ersetzt das Wort „abgelaufen“), „Stunden“ (Mono, rechtsbündig), „Betrag“. Das ist die eine Liste des Bereichs, bei der am Schreibtisch eine **Tabelle mit Spaltenköpfen** (12 px versal, wie die Positionen-Tabelle) besser liest als die Zeile. Handy: Zeile 1 Kunde, Zeile 2 Stempel + Betrag rechts, Zeile 3 „gültig bis 01.10.“ leise.
- **D2-P6 (Muster f) Zwei Werte = zwei Angaben.** „Frau Huber · 0699 9876543“ → Name als Wert, Telefon darunter als Kontaktverweis mit Hörer-Symbol (antippbar — heute ist die Nummer dort bloßer Text). „Telefon · erfasst von Michaela Wagner“ → „Telefon“ in Tinte, „Michaela Wagner“ leise in der nächsten Zeile. Abfrage-ID/Fragender → in den aufklappbaren Nachweis (D2-T8).
- **D2-P7 (Muster h) Summen als Summentabelle,** rechtsbündig in Mono mit Doppellinie über Brutto — wie in der Angebotsakte: drei Zeilen statt einer Kette (D2-A11).
- **D2-P8 (Muster g, i) Zahl links, Rest weg bzw. rechts.** Seitenkopf der Angebote: „2 offene Angebote“ (der Rest in die Hilfe, D2-T5). Aufklapper: „Weitere Angaben“ links, „gültig bis 23.12.2026“ rechts leise in Mono — Abstand statt Punkt.
- **D2-P9 (Muster j) Nummer als Stempel.** „EG-2026-0031 · Therme tropft …“ → Nummernstempel (`stempel`) + Text; der Stempel trennt durch seine Kontur.

**Wo der Punkt bleiben darf:** zwischen **zwei kurzen gleichrangigen Angaben in einer Meta-Zeile**, wenn keine davon ein Messwert ist, der in eine Spalte gehört — „Regie · Max Mustermann“, „Top 7 · 3. OG rechts“, „ganze Liegenschaft · aktiv“, „Datenschutz · Impressum“, im Briefkopf der Annahmeseite (Anschrift wie auf Papier), und in PDFs. Faustregel für einen Wächter: **höchstens ein Punkt je Zeile**; ab zwei wird es eine zweite Zeile oder eine Spalte; nie ein Punkt am Zeilenanfang oder -ende (heute am Handy und Tablet gemessen).

**Gleich bleiben muss** bei allen P-Vorschlägen: die Auskunft selbst (nichts verschwindet, was nicht in D2-T mit seinem neuen Ort steht), die ganze Zeile als Ziel, Umbruch langer Kundennamen (`min-width: 0`, `overflow-wrap`), 44 px Zeilenhöhe am Handy. Rückschritt merkt man an: seitlicher Überlauf bei 390/834 (`messen.mjs`), abgeschnittene Namen, eine Angabe, die es nur noch im Fenster gibt und dort fehlt.

Aufwand: P2, P6, P7, P8, P9 klein; P3, P4 mittel; P1, P5 mittel–groß (Baustein `ListRow` bekommt eine Spaltenform; mit den anderen Bereichen gemeinsam bauen).

---

## 8. Nicht angesehen / nur im Code gelesen

- **Angebot bearbeiten und „Neue Fassung“** (`/quotes?bearbeiten=…`, `?neueFassung=…`): dasselbe Formular wie „Neues Angebot“ — nur das neue, leere Formular wurde im Bild geprüft; die Fassungen-Nachbarn nur als Verlaufseinträge.
- **Katalog-Suche mit Treffern** (`KatalogSuche.tsx`): das Fenster geöffnet, Treffer liefert die Attrappe nicht; Trefferzeile nur im Code.
- **Mailversand** bis „Gesendet“ und der Versandverlauf (`belegMail`): Fenster geprüft, Senden ist in der Vorschau wirkungslos; die Zustände „nicht eingerichtet“/„gesendet“ nur im Code.
- **Annahme-Link mit bestehendem Link** (Link kopieren, widerrufen, „gesehen“): nur das Erzeugen-Fenster; Rest in `AnnahmeLink.tsx` gelesen. Kundenseite: Zustände „abgelehnt“, „zu viele Versuche“, „Fehler“, das Ablehnen-Fenster und die große Unterschrift nicht geöffnet.
- **PDF-Ausgaben** (Angebot, Schein, Stundennachweis): nicht erzeugt.
- **Kundenimport** (`KundenImport.tsx`): öffnet direkt die Dateiauswahl; Vorschau des Imports nur im Code.
- **Kunden zusammenführen** nach der Auswahl (zweiter Schritt, Probe): nur das erste Fenster.
- **„Nicht verrechnet“ in der Scheinliste und „Entwurf verwerfen“:** die Gruppe zeigt in der Vorschau einen Ladefehler; das ⋯ im Scheinfenster wurde geöffnet („Verwerfen“, „Löschen“ in Rot; `D2/b/sc_zeile_menue_1440.png`), die Rückfragen dazu nicht ausgelöst. `WorkSheetsListView.tsx:1685` gelesen.
- **Papierkorb mit Inhalt** (Wiederherstellen, endgültig löschen, abgelaufene): Attrappe leer; `PapierkorbView.tsx` gelesen.
- **Baustelle abschließen** nach der Rückfrage (Abschlusspunkte, `BaustelleAbschliessen.tsx`), **Pläne mit Dateien** (`PlaeneListe.tsx`), **Stunden nach Person**, Maßlinie mit Buchungen und Überhang: keine Daten in der Vorschau.
- **Liegenschaft: Vorschläge** (`LiegenschaftVorschlaege.tsx`, `KundenLiegenschaften.tsx` in der Kundenakte): ohne Daten nicht sichtbar.
- **Lade- und Fehlerzustände** der Akten (Platzhalter, „konnte nicht geladen werden“ mit „Neu laden“): nur dort gesehen, wo die Attrappe sie zufällig erzeugt (Material in der Baustellenakte, Scheine „nicht verrechnet“).
- **Rollen:** Projektleiter, Verwaltung, Buchhaltung nur für Menüs, Hauptaktionen und Zugriff je Route (`D2/tour1.mjs`, `D2/menues.mjs`); Fenster und Handy-Ansichten dieser Rollen nicht einzeln fotografiert. Beobachtet: Verwaltung und Buchhaltung sehen die Kundenliste ohne „Neuer Kunde“ und ohne Zeilen-⋯ (Zeilen tragen dann den Pfeil), die Kundenakte ohne „Bearbeiten“; die Buchhaltung die Angebotsakte nur mit „PDF herunterladen“.
- **834 px:** alle Routen und Reiter als Grundbild und Überlaufmessung; Fenster und Menüs am Tablet nicht einzeln geöffnet.
- **Dunkler Satz:** zwölf Ansichten (Listen, Akten, Fenster, Formular); Menüs, Rückfragen und die Annahmeseite dunkel nicht.
- **Echte Geräte** (iOS-Tastatur über dem Fuß, Sicherheitszonen, WebKit): nicht möglich; alle Handy-Befunde stammen aus Chromium bei 390 × 844 mit Touch.
