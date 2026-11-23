# Durchsicht vom 23.11.2026 — Befunde und Umsetzungsplan

Stand des Codes: `main` fa6e740 (nach E99). Diese Datei fasst zwölf Arbeitspapiere
zusammen (`analyse/`, je mit Datei und Zeile bzw. Route, Rolle, Breite und Messwert).
**Gebaut ist nichts.** Umgesetzt wird erst auf Ansage (Grundsatz 5), Paket für Paket.
Die Entscheidungen aus Abschnitt 8 sind am 23.11.2026 getroffen (alle wie empfohlen);
ein Startsignal gibt es noch nicht.

Auftrag des Auftraggebers, in vier Teilen:

1. Code-Durchsicht des ganzen Repositorys: offene Lücken, Fehler und Grenzen in der Funktion.
2. Alle Bildschirme und Unterbildschirme: Fehler im Design und Unstimmigkeiten in der
   Linie (Abstände, Schriftgrößen), und was Bedienung und Zusammenspiel intuitiver,
   hochwertiger und näher an Apple machte.
3. Wo noch zu viel Text oder unnötige Auskunft steht, und was statt der vielen
   Trennpunkte „·“ stehen kann.
4. **„Es darf nichts verschlimmbessert werden.“** — das ist die Bedingung für alles
   Folgende (Abschnitt 2).

---

## 1. Kurzfassung

### 1.1 Was gefunden wurde

| Teil | Papiere | Befunde |
|---|---|---|
| Funktion (Code) | `analyse/1` bis `7` | **107 belegte Befunde**: 26 Fehler, 34 Lücken, 25 Grenzen, 13 Unstimmigkeiten, 9 fehlende Prüfungen; dazu 45 Verdachtsfälle und 158 benannte Grenzen neu bewertet |
| Oberfläche: Fehler gegen die Linie | `analyse/9` bis `12` | **73** (mit Messwert) |
| Oberfläche: Unstimmigkeiten zwischen Seiten | `analyse/9` bis `12` | **62** |
| Bedienung: Befunde aus rund 30 durchgespielten Aufgaben | `analyse/9` bis `12` | **45** |
| Ideen (intuitiver, hochwertiger, näher an Apple) | `analyse/9` bis `12` | **56** |
| Zu viel Text, unnötige Auskunft | `analyse/9` bis `12`, je eigener Abschnitt | **88** |
| Trennpunkte „·“ | `analyse/8` §4, `analyse/9` bis `12` je eigener Abschnitt | **51 Muster** an rund 510 Zeilen im Quelltext (rund 160 Dateien) |
| Vermessung über alle Seiten, Rollen, Breiten (863 Zustände, 56.091 Textelemente) | `analyse/8` | **16 Fehler, 11 Unstimmigkeiten**, 16 fehlende Wächter (Abschnitt 4.1) |

### 1.2 Das Wichtigste zuerst

**Rückfälle aus den letzten Wellen** (alle drei im Code nachgelesen, zwei davon an einer
Wegwerf-Datenbank bzw. per Skript nachgestellt):

- **Z-1** Mit eingeschaltetem Monatsabschluss lässt sich über Stunden eines
  abgeschlossenen Monats keine Rechnung ausstellen oder stornieren: der Auslöser sperrt
  jede Änderung der Zeitbuchung, auch das Setzen von „verrechnet“.
- **Z-2** „Urlaub genehmigen“ und „Urlaub kürzen“ rechnen wieder mit den heutigen
  Arbeitstagen der Person statt mit denen zum jeweiligen Datum (eine spätere Migration
  desselben Tages hat die Korrektur überschrieben).
- **S-1 / M-1** Der Supportzugang sieht seit 18.11. Baustellen, Lager, Anforderungen,
  Wartungen und offene Forderungen nicht mehr (die neuen Listenfunktionen nehmen den
  Betrieb nur aus dem Token).

**Stille Falschzahlen und Datenverlust:**

- **L-1 / M-2** Die Nachkalkulation verliert Materialkosten ab 1.000 Ausgabezeilen;
  der Deckungsbeitrag steht zu hoch da.
- **G-1** Der Kontoauszug-Abgleich hält ein Datum im Verwendungszweck für eine
  Rechnungsnummer und wählt die Rechnung eines fremden Kunden vor (nachgestellt).
- **P-1** Ein vorgemerkter Schein, den der Server endgültig ablehnt, wird samt
  Kundenunterschrift vom Gerät gelöscht.
- **A-1 / P-10** Der Abschluss einer Pauschalbaustelle meldet verrechnete Scheine und
  Stunden als offen.
- **D3-6** Der Zahlungsdialog belegt den Betrag als „22104.6“ vor.

**Oberfläche, die größten Hebel:**

- Vier Formen von Fenster- und Blattfuß; drei „Neu“-Fenster und das Zeitblatt haben
  ihre Hauptaktion beim Öffnen nicht im Bild (D1-B3, D1-C1, D2-A20, D4-B8).
- „Rechnung stellen“ läuft am Handy und Tablet aus dem Blatt, Summen unsichtbar (D3-1).
- Am Handy: im Gespräch steht nicht, mit wem man schreibt (D1-A17); im Korb liegt
  „Abschicken“ hinter der Kopfinsel (D1-C3); der Tipp auf einen Tag im Einsatzplan
  zeigt nichts (D1-C6).
- Die Planungstafel zeigt bei 1440×900 nur 2½ Personen (D4-C12).
- Zwei Speichermodelle in den Einstellungen mit demselben Schalter (D4-B1).
- Text: die Untertitel der Seitenköpfe wiederholen ab Tablet nur den Titel; derselbe
  Betrag steht im Rechnungsfenster viermal; Erklärsätze stehen bis zu dreimal offen.
- Trennpunkte: die Menge entsteht durch Wiederholung (Zeitliste: 55-mal „Tag · Zeit“
  auf einer Seite) und durch Ketten mit drei bis fünf Punkten (Mahnlauf, Wartung,
  Einkauf).

### 1.3 Empfohlene Reihenfolge

| Stufe | Inhalt | Pakete | Warum in dieser Reihenfolge |
|---|---|---|---|
| **A** | Rückfälle, Falschzahlen, Datenverlust — je mit einem Wächter, der den Rückfall künftig verhindert | 1–4 | Schaden heute; alle klein; die Wächter schützen jede weitere Arbeit |
| **B** | Bausteine und Regeln der Oberfläche (Fuß, Zeile, Zahl- und Datumsformen, Text- und Punktregel) | 5–9 | ein Baustein berichtigt viele Seiten; ohne die Regeln würde Stufe C je Seite neu entscheiden |
| **C** | Seiten und Arbeitsbereiche (Handy des Monteurs, Rechnung stellen, Planung, Akten, Einstellungen) | 10–16 | sichtbarster Nutzen; setzt B voraus |
| **D** | Lücken in den Abläufen (Zeit, Auftragskette, Planung, Geld, Material, Plattform) | 17–22 | größere Stücke; einzelne brauchen eine Entscheidung oder die Kanzlei |
| **E** | Technik: Auslieferung, Prüfungen, Skalierung, Zustand des Codes | 23–25 | begleitend; Paket 23 (Auslieferung) kann jederzeit vorgezogen werden |

---

## 2. „Nichts verschlimmbessern“ — wie der Plan das absichert

Diese Regeln gelten für jedes Paket und stehen deshalb nur hier.

1. **Erst nachstellen, dann ändern.** Jeder Befund bekommt vor dem Bau eine Prüfung, die
   ihn zeigt (rot), und ist danach grün (Gegenprobe, `CLAUDE.md`). Was sich nicht
   nachstellen lässt, wird nicht „behoben“ (Grundsatz 2). Die 45 Verdachtsfälle der
   Papiere werden deshalb nicht gebaut, sondern nur geklärt, wenn ihr Paket ansteht.
2. **Zu jedem Punkt steht, was gleich bleiben muss** — in den Papieren je Befund, hier
   je Paket. Dafür gibt es eine eigene Prüfung („bleibt gleich“), nicht nur das
   Vertrauen in die bestehenden.
3. **Keine Bedienstelle geht verloren.** Der Wächter `funktionsinventar.test.ts` (alle
   Knöpfe, Verweise, Menüeinträge, Felder; Stand vor V10: 1.941) bleibt bei jedem
   Oberflächenpaket grün; was bewusst wegfällt oder umzieht, steht begründet in
   `docs/ui-umbau/v10-entfernt.json`.
4. **Kein Text verschwindet ohne Ziel.** Für Paket 8 (weniger Text) gilt: jeder
   gestrichene Satz steht danach in „Hilfe zu dieser Seite“, im Fenster der Zeile oder
   erscheint nur noch im abweichenden Fall. Sätze, die eine Entscheidung tragen, sind
   in den Papieren ausdrücklich als „bleibt“ markiert und werden nicht angefasst.
5. **Vorher/Nachher im Bild.** Jedes Oberflächenpaket legt für die betroffenen Routen
   je Rolle auf 390, 834 und 1440 px Bilder vor und nach der Änderung nebeneinander
   (`tools/vorschau/fotos.mjs`) und misst `scrollWidth`, Fluchten und Tastflächen neu.
6. **Ein Thema, ein PR.** Fehlerbehebung und Umgestaltung nie im selben PR; Bausteine
   (Stufe B) getrennt von Seiten (Stufe C).
7. **Alle Browser vor dem Push.** Seit 16.11. läuft WebKit auch lokal
   (`PLAYWRIGHT_BROWSERS_PATH`, Stand §113): `telefon-chromium`, `webkit-telefon`,
   `tablet-834` und die Linkprüfungen laufen vor jedem PR der Stufen B und C.
8. **Entscheidung vor Bau, wo zwei Regeln einander widersprechen** (Abschnitt 8). Ohne
   Entscheidung wird der Punkt nicht gebaut.
9. **Wächter zuerst.** Paket 1 baut die drei Wächter, die die Rückfälle dieser
   Durchsicht verhindert hätten; erst danach werden weitere Datenbankfunktionen angefasst.
10. **Altdaten bleiben.** Keine Migration rechnet ausgestellte Belege, genehmigte
    Anträge oder abgeschlossene Monate neu (`CLAUDE.md`, Sicherheit und Daten).

Kennzeichen in den Tabellen: **✔** = von mir am Code nachgelesen · **◆** = vom Agenten
nachgestellt (Skript, Wegwerf-Datenbank oder Messung im Browser) · ohne Zeichen = im
Papier mit Datei und Zeile belegt, vor dem Bau nachzustellen.

---

## 3. Befunde: Funktion

Einzelheiten, Belege, Vorschlag, Prüfung und „bleibt gleich“ je Befund stehen im
jeweiligen Papier. Schwere: **h** hoch, **m** mittel, **n** niedrig. Aufwand: **k** bis
½ Tag, **m** bis 2 Tage, **g** größer.

### 3.1 Zeit und Personal (`analyse/1-zeit-personal.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| Z-1 ✔ | Monatsabschluss sperrt Ausstellen und Stornieren von Rechnungen über Stunden des Monats | Fehler | h | k | 1 |
| Z-2 ✔ | Urlaub genehmigen/kürzen rechnet wieder mit den heutigen Arbeitstagen (Rückfall) | Fehler | h | k | 1 |
| Z-3 | Zeitkonto kennt keinen Abgang außer Zeitausgleich; ausbezahlte Überstunden bleiben im Saldo | Lücke | h | g | 17 |
| Z-4 | 14-Tage-Grenze der rückwirkenden Krankmeldung über „Ende ändern“ umgehbar, Büro erfährt nichts | Fehler | m | k | 3 |
| Z-5 | Wiedereintritt überschreibt Eintritt und Saldo-Start; alte Monate verlieren ihr Soll | Fehler | m | m | 17 |
| Z-6 | Im abgeschlossenen Monat geht nur „ändern“, nicht der vergessene Tag und nicht das Löschen; drei Texte sagen mehr zu | Lücke | m | m | 17 |
| Z-7 | „Monat abschließen“ prüft und zeigt nichts; offene Anträge hängen danach fest | Lücke | m | m | 17 |
| Z-8 | „Krank ab Mittag“ lässt sich nicht abbilden | Lücke | m | m | 17 |
| Z-9 | Sonderurlaub, Pflegefreistellung, unbezahlten Urlaub kann nur die Person selbst eintragen, nur neun Anlässe | Lücke | m | m | 17 |
| Z-10 | Ändern sich die Arbeitstage je Woche, bleibt der Resturlaub in Tagen stehen | Lücke | m | m | 17 (Kanzlei) |
| Z-11 | Urlaubsjahr für alle derselbe Tag; das Arbeitsjahr je Person fehlt | Grenze | m–h | g | 17 (entschieden) |
| Z-12 | Urlaub verjährt ohne Vorwarnung | Lücke | m | m | 17 (Kanzlei) |
| Z-13 | Lohn-Datei kennt Personen nur über den Namen, Zeitkontostand fehlt | Lücke | n–m | k | 17 |
| Z-14 | „Wegzeit“ zählt nirgends als Arbeitszeit (unbenannte Annahme) | Grenze | n–m | k/m | 17 (entschieden) |
| Z-15 | Nichts verhindert, dass eine neu definierte Funktion einen früheren Textersatz verwirft | f. Prüfung | m | k | 1 |
| Z-16 | Resturlaub des Monteurs hängt an einer Liste mit fester Obergrenze | Grenze | n | k | 25 |

### 3.2 Auftragskette (`analyse/2-auftragskette.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| A-1 | Abschluss-Dialog zählt „nicht verrechnet“ anders als der Kern; jede Pauschalbaustelle meldet Offenes | Unstimm. | m–h | k | 1 |
| A-2 | Baustellen- und Kundenakte speichern den ganzen Entwurf über einen veralteten Stand | Fehler | m | m | 18 |
| A-3 | Nachtrag behält seine Baustelle beim Kundenwechsel; Annahme-Link hängt ohne Kundenvergleich an | Fehler | m | k | 2 |
| A-4 ✔ | Pauschalrechnung und Akte lesen höchstens 20 Angebote je Baustelle, ungeordnet | Grenze | m | k | 2 |
| A-5 | Empfänger eines versendeten Angebots nicht festgehalten (Nachdruck, Mail-Kopie, Archiv zeigen den heutigen) | Unstimm. | m | m | 18 |
| A-6 | Geführter Abschluss kennt offene Angebote und kommende Termine nicht | Lücke | m | k | 18 |
| A-7 | Nachlass auf die Angebotssumme lässt sich nicht eingeben, ein geerbter nicht ändern | Lücke | m | m | 18 |
| A-8 | Angebots-PDF mit festen Texten, ohne Zahlungs- und Ausführungsbedingungen je Betrieb | Grenze | m | m | 18 |
| A-9 | Annahmeseite ohne Platz für AGB und Rücktrittsbelehrung | Grenze | m | k | 18 (Kanzlei) |
| A-10 | Positionen des Angebots erreichen den Monteur nicht | Lücke | m | m | 18 |
| A-11 | Vorschläge aus der Liegenschaft nur in „Neue Baustelle“, nicht in Eingang und Angebot | Lücke | m | k | 18 |
| A-12 | Nach „Angenommen“ kein nächster Schritt; Eingang → Angebot landet auf der Akte statt im Formular | Lücke | n–m | k | 14 |
| A-13 | Angebote schreibt nur die Führung; die Verwaltung sieht sie nicht | Grenze | m | m | 18 (entschieden) |
| A-14 | Datenbank lässt „Angenommen“ ohne Rücknahme verlassen und die Baustelle umhängen | f. Prüfung | n | k | 18 |
| A-15 | Dublettenfrage sucht nur in den ersten 50 Treffern | Fehler | n | k | 18 |
| A-16 | Startseite kennt offene Angebote nicht (Bindefrist, liegen gebliebener Entwurf) | Lücke | n–m | m | 14 |
| A-17 | Angebotsakte trägt zwei ⋯-Menüs | Unstimm. | n | k | 13 |

### 3.3 Planung, Startseite, Scheine (`analyse/3-planung-scheine.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| P-1 ✔ | Vorgemerkter Schein, den der Server ablehnt, verschwindet samt Kundenunterschrift | Fehler | h | m | 3 |
| P-2 | „Mein Einsatzplan“ zeigt Einsätze an eigenen Urlaubs-/Krankentagen (über 62 Tage voraus oder „Wochenplan für alle“ aus) | Fehler | m | k | 3 |
| P-3 | Wochenplan, Tagesplanung, Startseite lesen höchstens 500 laufende Baustellen ohne Hinweis | Grenze | m | m | 25 |
| P-4 | Offener Wochenplan zeigt Abwesenheiten, Termine, Baustellen wie beim Öffnen; Speichern prüft keine Abwesenheit | Lücke | m | m | 19 |
| P-5 | Scheitert die Abfrage der Abwesenheiten, heißt es still „niemand fehlt“ | Fehler | n–m | k | 3 |
| P-6 | Termine kennen keine Abwesenheit ihrer Teilnehmer | Lücke | m | k–m | 19 |
| P-7 | Push bei geändertem Plan nur für heute und morgen; Freitag-für-Montag kommt nie an | Grenze | m | k–m | 19 |
| P-8 | Ohne Netz zeigt die neu geöffnete App den Einsatz von heute nicht; kein Schein möglich | Grenze | m | m | 19 |
| P-9 | „Stunden ohne Buchung“ prüft nur die 50 jüngsten Scheine; Grund entfallen | Grenze | m | m | 19 |
| P-10 | Abschluss zählt „unterschriebene Scheine nicht verrechnet“ nach anderer Regel (wie A-1) | Unstimm. | n–m | k | 1 |
| P-11 | Tagesübersicht, Baustellen-Sicht, Fenster „Tag“ zeigen nur die Uhrzeit der ersten Person | Unstimm. | n | k | 19 |
| P-12 | Geführtes Abschließen sieht kommende Termine nicht (wie A-6) | Lücke | n | k | 18 |

### 3.4 Geld (`analyse/4-geld.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| G-1 ◆ | Kontoauszug liest ein Datum im Zweck als Rechnungsnummer und wählt die falsche Rechnung vor | Fehler | m–h | k | 2 |
| G-2 | Rabatt, „Bauleistung“, Rücklass, Steuerbefreiung, Rechnungsart bleiben beim Baustellenwechsel/Verwerfen stehen | Fehler | m | k | 2 |
| G-3 | Haftrücklass rechnet nach Regie-Teilrechnungen nicht von der ganzen Leistung; Deckungsrücklass wird nicht fällig | Fehler/Lücke | m | m | 20 (Kanzlei) |
| G-4 | BMD-Zahlungsstapel bucht Bar- und Kartenzahlungen auf das Bankkonto | Fehler | m | k | 2 (Kanzlei) |
| G-5 | Zeitbuchung zwischen Vorschau und Ausstellen geändert: neue Dauer gesperrt, alte verrechnet | Fehler | n–m | m | 2 |
| G-6 | Pauschale ohne offene Belege aus veralteter Vorschau zweimal verrechenbar | Fehler | n | k | 2 |
| G-7 | Mahnung lässt sich nicht zurücknehmen | Lücke | m | m | 20 |
| G-8 | Offene Mahnspesen und Zinsen verschwinden, sobald die Hauptforderung bezahlt ist | Lücke | n–m | m | 20 |
| G-9 | Exporte ohne Gedächtnis: übergebene Zeiträume still änderbar, Storno in zwei Exporten | Lücke | m | m–g | 20 |
| G-10 | Kein Beleg für „weniger“ (Schlussrechnung mit Guthaben, Gutschrift) | Lücke | m | k/g | 20 |
| G-11 | Zahlungsziel, Skonto, Nachlass nur je Betrieb oder Rechnung, nicht je Kunde | Lücke | m | m | 20 |
| G-12 | Schema der Rechnungsnummer fest (Vorsatz, Jahr, ab 1001) | Grenze | n–m | m | 20 (entschieden) |
| G-13 | Übergabe an die Steuerberatung setzt doppelte Buchführung, Sollbesteuerung, BMD voraus | Grenze | m | m | 20 (entschieden: erst nach der Kanzlei) |
| G-14 | Abzug einer Anzahlung prüft den Steuersatz nicht | Grenze | n | k | 2 |
| G-15 | Nachkalkulation sieht nur die 300 jüngsten Baustellen, rechnet alte Stunden mit dem heutigen Kostensatz | Grenze | n | m | 25 |
| G-16 | Datenbank übernimmt die Summen einer Rechnung ungeprüft | f. Prüfung | n–m | k–m | 2 |
| G-17 | Prüfsumme des Mail-Anhangs nicht wiederherstellbar (Begründung einer Grenze trägt nicht) | Unstimm. | n | k | 20 |

### 3.5 Material (`analyse/5-material.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| M-1 ✔ | Support-Einblick: Lager, „knapp“, Anforderungen „Laufend“ enden im Fehler (wie S-1) | Fehler | m | k | 1 |
| M-2 ✔ | Nachkalkulation verliert Lagerausgaben ab 1.000 Zeilen (wie L-1) | Fehler | m | k | 1 |
| M-3 | Einheit eines Artikels änderbar, während Bestand, Anforderungen und Preise in der alten stehen (Import still, von Hand ohne Warnung) | Lücke | m | m | 4 |
| M-4 | Eigener Einkaufsposten mit anderer Einheit als der Katalogartikel; „Geliefert“ bucht die Zahl roh | Fehler | m | k | 4 |
| M-5 | Preisupdate des Großhändlers erreicht die Verkaufspreise nicht | Lücke | m | m | 21 |
| M-6 | Verbrauch am Schein wird niemandem angeboten; Fahrzeuglager sinkt nur nach erneutem Öffnen | Lücke | m | m | 21 |
| M-7 | Ein Fahrzeug hat genau einen Fahrer | Grenze | m | m | 21 (entschieden) |
| M-8 | Wareneingang findet nur Lagerartikel und nicht über die Nummer am Lieferschein | Lücke | n–m | k | 4 |
| M-9 | Bestellung hinterlässt keinen Beleg (Nummer, Stand, Lieferort); nur `mailto` | Lücke | m | g | 21 |
| M-10 | Einheit einer frei getippten Zeile geht beim Teilen und auf der Bestellung verloren | Fehler | n | k | 4 |
| M-11 | Gelieferte Kommissionsware zählt als Zusage gegen den Bestand | Fehler | n | k | 4 |
| M-12 | Bewegungsprotokoll zeigt höchstens 200 Bewegungen, ohne Hinweis | Grenze | n–m | k | 4 |
| M-13 | Kennzahl „Reserviert“ zählt Meter, Stück, Kilo zusammen | Unstimm. | n | k | 4 |
| M-14 | Verbuchte, zurückgesetzte Anforderung lässt sich ein zweites Mal bestellen | Fehler | n | k | 4 |
| M-15 | „Knapp“ ohne Mindestmenge heißt überall „höchstens 5 frei“ | Grenze | n | k | 4 |
| M-16 | Kein Wächter prüft neue Lesefunktionen auf Support-Einblick und Zeilengrenze | f. Prüfung | n | k–m | 1 |

### 3.6 Grundlagen und Sicherheit (`analyse/6-grundlagen-sicherheit.md`)

Kein Befund, bei dem ein Konto Daten eines anderen Betriebs lesen oder schreiben kann.

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| S-1 ◆ | Vier Listenfunktionen und `startseite-forderungen` weisen den Supportzugang ab (Rückfall K7b) | Fehler | m | k | 1 |
| S-2 | „Passwort ändern/vergessen“ meldet andere Geräte ab, lässt ihre Push-Anmeldungen stehen | Lücke | m | k | 3 |
| S-3 | Bleiben beim Löschen eines Betriebs Anmeldekonten übrig, lässt sich die Löschung nicht abschließen | Fehler | m | m | 22 |
| S-4 | Notzugang/Support-Einblick: der Betrieb erfährt es nur auf der Einstellungsseite | Lücke | m | m | 22 |
| S-5 | Ohne Netz vorgemerkte Anforderung/Nachricht, die der Server ablehnt, ist weg (bei der Anforderung ohne Grund) | Lücke | m | k | 3 |
| S-6 | Von anderswo beendete Sitzung: offenes Fenster merkt es spät und nennt den falschen Grund | Fehler | n–m | k | 3 |
| S-7 | Speicherregeln der Scheinfotos binden nicht an den Ersteller | Unstimm. | n | k | 22 |
| S-8 | Ein Mensch nur in einem Betrieb, Benutzername über alle Betriebe vergeben (unbenannt, kein Ausweg in der Maske) | Grenze | n | k | 22 |
| S-9 | Auslieferung: Zugangsdaten mit vollem Zugriff in GitHub-Secrets, `npm ci` mit Skripten im selben Auftrag | Grenze | n–m | k | 23 |
| S-10 | Kein Prüfnetz hält fest, dass lesende Funktionen im Einblick laufen | f. Prüfung | m | k | 1 |
| S-11 | Inhaltsregel erlaubt jedes Supabase-Projekt; die Sicherheitsprüfung sagt „nur eigene Instanz“ | Unstimm. | n | k | 22 |
| S-12 | Bericht nach „Person löschen“ nennt Scheine, Mahnungen, Pläne nicht, die Auskunft zählt sie | Lücke | n | k–m | 22 |
| S-13 ◆ | Übersicht aller 122 Funktionen seit 15.11.: drei weitere falsch für den Support, drei Rückfälle für „Mitarbeiten“ | Unstimm. | n–m | k | 1 |

### 3.7 Technik, Ladezeiten, Zustand (`analyse/7-technik-ladezeiten.md`)

| Kürzel | Befund | Art | Schw. | Aufw. | Paket |
|---|---|---|---|---|---|
| L-1 ✔ | Nachkalkulation ruft zwei Funktionen ungeblättert; ab 1.000 Zeilen fehlen Kosten | Fehler | h | k | 1 |
| L-2 | Kein Wächter für ungeblätterte Datenbankfunktionen (37 von 47 Aufrufen blättern nicht) | f. Prüfung | m | k | 1 |
| L-3 | Kunden- und Baustellenakte holen jede Rechnung ganz, um Köpfe zu zeigen; ab 500 fehlt der Rest | Grenze | m | m | 25 |
| L-4 | Leistungswächter fast ohne Luft (254/260 Bausteine, Rechnungen 131/135 KB) | Grenze | m | k/m | 25 |
| L-5 | Grenze „Belegschaft“ beruft sich wieder auf „bis etwa 30 Mitarbeiter“ | Unstimm. | n–m | k | 24 |
| L-6 | Welche Seiten das Budget B3 (50 Zeilen) nicht halten, steht nirgends aktuell | Grenze | m | m je Seite | 25 |
| L-7 | Schreiben über Datenbankfunktionen meldet den Live-Listen nichts | Lücke | m | m | 19 |
| L-8 | Nach der Auslieferung prüft nichts, ob die neue Fassung live ist; Rücksprung dauert länger als beschrieben | Lücke | m–h | k/m | 23 |
| L-9 | Gebaut wird vor dem Merge nur, wenn der Durchklick läuft | Lücke | m | k | 23 |
| L-10 | Auslieferung auf Node 20 (ohne Pflege), Werkzeugfassungen uneinheitlich | Grenze | n–m | k | 23 |
| L-11 | Wege des Büros laufen nie in WebKit, das Tablet nie in Safari | f. Prüfung | m | m | 24 |
| L-12 | `InvoicesView` 6.574 Zeilen in einer Komponente | Grenze | m | g | 11/25 |
| L-13 | L15: Ursache je träger Prüfung gemessen (viermal Rechenzeit in der Prüfung, einmal fehlende Frist) | f. Prüfung | n–m | k | 24 |
| L-14 | Toter Code in Datenschicht und Datenbank, von Prüfungen am Leben gehalten | Unstimm. | n | k | 24 |
| L-15 | Migrationen können im Projekt in anderer Reihenfolge landen als in der Prüfung | f. Prüfung | n | k | 23 |
| L-16 | Vier Texte beschreiben einen Stand, den es nicht mehr gibt | Unstimm. | n | k | 24 |

### 3.8 Benannte Grenzen ohne gültigen Grund

Die Papiere haben 158 Einträge aus `docs/grenzen-durchsicht-2026-10-24.md` neu
bewertet. Nach Grundsatz 6 tragen diese Gründe nicht mehr und sind oben als Befund
geführt: Bestellung ohne Beleg und Versand (M-9, Grund „kommt mit M05a“ / „App
verschickt nichts“ seit F16 überholt), „Stunden ohne Buchung“ nur 50 Scheine (P-9,
Grund „Unterschriftsbilder“ seit der Listenumstellung entfallen), Push nur heute und
morgen (P-7), Einsatz ohne Netz (P-8, Datenschutzgrund trägt für eigene Einsätze
nicht), Liegenschaftsakte höchstens 100, Belegschaft „bis etwa 30 Mitarbeiter“ (L-5),
Live-Listen nach Datenbankfunktionen (L-7), Urlaubsjahr (Z-11), Gutschrift „noch
nicht“ (G-10). Überholt und zu streichen: zwei Zeilen zum Mailversand (durch F16
gebaut). Unbenannt und nachzutragen: S-8, A-13, M-7, G-12, G-13, Z-14, P-3, A-4.
Das Grenzen-Dokument wird in Paket 24 auf diesen Stand gebracht.

---

## 4. Befunde: Oberfläche

### 4.1 Vermessung über alle Seiten (`analyse/8-oberflaeche-vermessung.md`)

Gemessen wurden 65 Routen, 177 Paare Route × Rolle, 863 Zustände auf 390, 834 und
1440 px: 56.091 Textelemente, 1.933 Blätter, 13.479 Bedienelemente; Kontrast im hellen
und dunklen Satz an jedem Text.

**Gesamtbild:** Die Bausteine halten die Linie fast lückenlos — Schriftstufen (E97),
Radien, Seitenrand 16/24/40 px, kein seitlicher Überlauf, keine Pillen, keine Glas- oder
Farbflächen, Schatten nur an Schwebendem, im dunklen Satz kein aktiver Text unter
4,5 : 1. **Die Ausreißer sitzen dort, wo eine Seite eigene Klassen an den Bausteinen
vorbei schreibt.**

| Kürzel | Befund (gemessen) | Ursache | Paket |
|---|---|---|---|
| V-13 | Tastaturfokus setzt jeden Radius auf 8 px: runde Knöpfe werden eckig, ein per Enter geöffnetes Fenster fällt von 24 auf 8 px | `src/index.css:401–405` (`:focus-visible { border-radius … }`) | 5 |
| V-3 | Blätter nebeneinander liegen neben dem Raster: `/invoices` 20 statt 24 px, `/assignments/tag` 36 px, `/worksheet` 8 px daneben | je Seite; `raster.spec.ts` deckt die Fälle nicht ab | 5 |
| V-1, V-2 | Ab dem Tablet stehen `p.leer` 8 px und `.arbeitszeile` 4 px vor der Flucht (16 bzw. 20 statt 24 px) | beiden fehlt `--blatt-rand` | 5 |
| V-5 | Sieben Bausteine am Handy unter 44 px Tastfläche, darunter das Suchfeld der Listenleiste (40 px, die Lupe nimmt den Tipp nicht an), „alle ausblenden“ (20 px), „Im Plan ansehen“ (17 px) | kein allgemeiner Tastflächen-Wächter | 5 |
| V-6 | Einziger Kontrastbefund: Platzhalter der Personensuche in `/accounting` 2,54 : 1 | eigenes `input.ue-suche` | 5 |
| V-8, V-9 | Tabelle der Mitarbeiterübersicht: Kopf 15 px statt 12 versal, Stunden in DM Sans; Rechnungsfenster und Einsatz-Vorschau: Beschriftungen 15 statt 13 px | handgebaut | 5 |
| V-10 bis V-12, V-14, V-15 | Blatttitel der Rechtsseiten 16 statt 18 px; drei handgebaute Feldbeschriftungen; freie Tailwind-Stufe im Wartungsfenster; kleiner Knopf 8 px, Zeilenknopf 12 px Radius; Kopf der Akte 6 px neben dem Raster | je Stelle | 5 |
| V-4 | Zweites ⋯ außerhalb des Seitenkopfs in der Angebotsakte (= A-17, D2-A10) | `AngebotView` | 13 |
| V-7 | Fehlertafel steht außerhalb der Linie (= D4-A3) | — | 15 |
| V-16 | Vorhandene Messung `vorschau:messen`: 35 Ansichten mit Meldungen, keine neue echte; fünf Falschmeldungen fehlen in der README | `tools/vorschau/messen.mjs` | 9 |

**Ungeregelt, braucht je eine Entscheidung (neu, Abschnitt 8):**

| Kürzel | Befund | Vorschlag |
|---|---|---|
| V-B1 | **Zeilenhöhe:** je Schriftstufe bis zu neun Werte (15 px: 22 / 22,5 / 24 / 20 …); sichtbar in derselben Zeile (Module: 13/24 über 13/18). E97 hat die Zeilenhöhen ausdrücklich offen gelassen | je Stufe eine Zeilenhöhe im Fließtext (12 → 16, 13 → 18, 15 → 22, 16 → 24) |
| V-B2 | **Titel:** zwölf Größen zwischen 16 und 30 px ohne Stufen (Titel waren nicht Teil von E97) | Titelskala mit Rollen: Seite 30/28, Fenster 20, Blatt 18, Gruppe 16; 17/19/22 darauf abbilden. Vorbehalt: 17 px der Planung und des Arbeitstags stehen in engen Köpfen — vorher messen |
| V-B3 | **Gemessenes nicht überall in Mono:** rund 330 Baustellennummern, 640 Zeiten, 190 Datumswerte stehen in Begleitzeilen in DM Sans | zuerst die Nummer (Baustein `Nummer`), dann Zeiten; ob ein Datum in einer Meta-Zeile Mono trägt, ist die Entscheidung |

Weitere Unstimmigkeiten der Vermessung (V-B4 bis V-B11: drei Suchfelder, Abschnittskopf
in zwei Formen, Verweise in vier Formen, kleine Radien neben der Skala, Monatsbalken mit
3-px-Petrolstrich, Kennwerte im Seitenkopf, Tabelle im Blatt 16 px hinter der Flucht,
Reiter der Akte am Handy zwei- und dreizeilig) decken sich mit 4.3 und gehören zu
Paket 5 bzw. 12.

**Was die Tests heute nicht erzwingen** (`analyse/8` §8, 16 Zeilen): Schrift außerhalb
der Skala in Fenstern, Menüs und auf 19 Routen außerhalb der geprüften 46; freie
Tailwind-Größen im Code; Rolle falsch trotz gültiger Stufe; handgebaute Tabellen,
Beschriftungen, Suchfelder; Text rechts der Flucht; Blätter neben dem Raster;
Tastflächen; Kontrast von Platzhaltern; Form unter Fokus; Radius außerhalb der Rollen;
⋯ außerhalb des Seitenkopfs; Trennpunkte; lange Texte offen. Je ein Wächter ist
vorgeschlagen; sie gehören zu den Paketen 5 bis 8.

### 4.2 Fehler gegen die Linie, je Bereich

Vollständige Listen mit Messwert, Ursache und Vorschlag in den Papieren. Hier die
Befunde, die ein Paket begründen; die übrigen sind dem Paket in Abschnitt 7 zugeordnet.

**Monteur und Hülle (`analyse/9`, D1-A1 bis A22)**

| Kürzel | Befund | Ursache | Paket |
|---|---|---|---|
| D1-A17 ◆ | Im Gespräch steht am Handy nicht, mit wem man schreibt (Titel bei y −122, Kopfinsel zeigt den Betrieb) | Gespräch meldet seinen Titel nicht über `useKopfTitel` | 10 |
| D1-A2 | „Eintrag löschen“ als Knopf 16 px über „Änderungen speichern“ (gegen U4) | `TimeForm` | 5 |
| D1-A1 | Wisch-Aktion bricht „Lösche\|n“ um | `.wisch-knopf` (Baustein) | 5 |
| D1-A3 | Inhalt von Blättern ohne `auchBreit` klebt 0 px an der Kopflinie | `.blatt-inhalt` ohne Polster | 5 |
| D1-A19 | Seitenleiste am Schreibtisch läuft bei 1440×900 aus dem Bild (Abmelden unter dem Rand) | `Layout` | 5 |
| D1-A22 | Falsche Tastaturen: „Pause“, „Wegzeit“ ohne `inputMode="numeric"`, Kennzeichen ohne Großschreibung, Suche ohne Such-Attribute; `enterKeyHint` einmal im ganzen Code | Formulare | 6 |
| D1-A16 | Englischer Rest „Baustellen-Threads“ | Seitenkopf Nachrichten | 6 |
| D1-A20/A21 | „Neue Fassung“-Leiste deckt die Fußinsel; Meldung liegt auf der Kopfinsel (nur im Code/Grenzfall) | — | 10 (am Gerät prüfen) |

**Büro — Aufträge (`analyse/10`, D2-A1 bis A20)**

| Kürzel | Befund | Ursache | Paket |
|---|---|---|---|
| D2-A1 ◆ | Baustellenakte → Scheine am Handy: „Handwerksschein schreiben“ liegt 10 px auf dem Kartentitel | `index.css:1134` trifft einen Knopf-Link | 13 |
| D2-A10 | Angebotsakte: Hauptaktion ist in jedem Stand „PDF herunterladen“; die echten Schritte und ein zweites ⋯ stehen im Verlauf | `AngebotView` | 13/14 |
| D2-A20 ◆ | „Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“ haben ihren Fuß nicht im Bild (Inhalt 1041/1830/972 px bei 785) | ältere Formulare ohne klebenden Fuß | 5 |
| D2-A2 | Speicherleiste im Akten-Fenster lässt 20 px Inhalt darunter durchlaufen | Fenster + `Speicherleiste` | 5 |
| D2-A3 / D3-4 | Rechnungsfenster: Aktionsreihe links mitten im Inhalt, Linie 159 bzw. 319 px kurz | `lot-rechnungen.css:51`, `RechnungDetail` | 5 |
| D2-A4 | „Wartung erledigt → Eintragen“ ist rot | `WartungenView.tsx:1148` ohne `confirmTone` | 13 |
| D2-A7 | Reiter „Belege“ der Kundenakte nutzt nicht die Belegzeile aus E99 | `KundenakteView` | 13 |
| D2-A8 / D4-A11 / D3-B16 | Zeilen, die etwas öffnen, ohne Pfeil (Mitarbeiterübersicht, Tag-Fenster, Plattform, Anforderungen, Kontoauszug) | je Seite, Regel E99 | 5 |
| D2-A15 | Kundenseite der Annahme am Handy: „Als PDF“ schwebt über dem Unterschriftsfeld | `AngebotAnnahmeSeite` | 13 |
| D2-A18 | Akten-Titel am Handy 24 px in zwei Akten, 28 px in der dritten | `PageHeader`/Liegenschaft | 13 |

**Büro — Geld und Material (`analyse/11`, D3-1 bis D3-17)**

| Kürzel | Befund | Ursache | Paket |
|---|---|---|---|
| D3-1 ◆ | Rechnung stellen: Positionstabelle 675 px breit in 326 px (Handy) bzw. 624 px (Tablet); Summen außerhalb des Bildes | Tabelle ohne Handyform | 11 |
| D3-2 | Positionsfelder 15 px statt 16 px (iOS zoomt), 44 statt 48 px, schwacher Rand | `lot-rechnungen.css:74–77` | 11 |
| D3-3 | Beträge in DM Sans, Summen und Zahlbetrag auf zwei Fluchten (x 1286 gegen 1376) | Rechnung stellen | 11 |
| D3-6 ✔ | Zahlungsdialog belegt „22104.6“ vor | `InvoicesView.tsx:1306` `String(vorschlag)` | 2 |
| D3-7 | Kontoauszug: Zustand und Betrag fluchten nicht; am Handy Zeilen bis 287 px | `Kontoauszug` | 11 |
| D3-9 ◆ | Einkaufsliste am Handy: Auswahl „Großhändler wählen“ ragt 119 px links aus dem Blatt | `Einkaufsliste` | 11 |
| D3-13 | Mehr als eine gefüllte Hauptaktion; schwebende Aktion verdeckt das offene Formular | Rechnung stellen | 11 |
| D3-16 | Überfälliger Liefertermin ohne Zeichen | Einkauf | 11 |
| D3-17 | Maschinentext im Fehlerzustand | Lager | 6 |

**Planung, Team, Einstellungen (`analyse/12`, D4-A1 bis A14)**

| Kürzel | Befund | Ursache | Paket |
|---|---|---|---|
| D4-A1 ◆ | Tag-Planung am Handy: das Neu-Formular steht offen vor dem Bestand (Einsätze erst ab y 2.310), gegen U2 | Wächter erkennt den Titel „Einsatz planen — …“ nicht | 12 |
| D4-A3 | „Kein Zugriff“ / „… ist ausgeschaltet“ außerhalb der Linie, ohne Weg weiter; unbekannte Adresse leitet still auf Start | `App.tsx:657` | 15 |
| D4-A10 | Monatsansicht am Tablet: Tastflächen 18×51 px und 53×26 px | Monatsraster | 12 (entschieden) |
| D4-A4 | Leer- und Zustandssätze in 13 px statt 15 px | je Seite | 6 |
| D4-A6 | Drei Formen des Tastaturfokus | Stile | 5 |
| D4-A2 | Fensterfuß „Einsatz bearbeiten“ bricht in zwei Zeilen | Fenster | 5 |

Ohne Befund blieben in allen vier Bereichen: seitlicher Überlauf im Grundzustand,
Schatten an Nicht-Schwebendem, Radien von Blättern und Kacheln, Blattabstände, und der
dunkle Satz (kein Text unter 4,5 : 1 in den gemessenen Ansichten).

### 4.3 Unstimmigkeiten zwischen Seiten — die Muster

| Muster | Fundstellen | Paket |
|---|---|---|
| **Fuß von Fenster und Blatt** in vier Formen (gestreckt, kompakt rechts, volle Breite, `Fensteraktionen`); klebt oder rollt; Unumkehrbares als Knopf im Körper statt im ⋯ | D1-B3, D1-B15, D4-B7, D4-B8, D2-A20 | 5 |
| **Ungespeicherte Eingaben** in drei Verhalten (Akte fragt, „Neuer Kunde“ behält still, „Neuer Eingang“ verwirft bei Escape) | D2-B3 | 5 |
| **Speichern in zwei Modellen** mit demselben Schalter (sofort gegen „Speichern“); Speicherleiste je Seite gegen je Blatt | D4-B1 | 16 (entschieden) |
| **Zahlen- und Zeitformen:** Dauer in drei Schreibweisen („337:30“, „8:00“, „240,0 h“), Datum in fünf Längen, Wochentag mit und ohne Punkt, „€“ vor und hinter der Zahl, Menge in vier Formen, Betrag in Mono oder DM Sans | D1-B5, D1-B6, D3-B1 bis B4, D4-B10, D2-A11 | 6 |
| **Wörter:** neun Wörter für den Knopf, der speichert; fünf für PDF; „Anforderungen“/„Bestellungen“; „Inventur“ für zwei Dinge; „ganztags“/„ganzer Tag“; „(freiwillig)“/„(optional)“; „Einstellungen › Betrieb“ für eine Seite, die Firmendaten heißt; drei Namen für „Mein Konto“; Anrede „Ihrer“ neben „dir“ | D2-B4 bis B6, D3-B6 bis B10, D3-T22, D4-B10, D1-B14 | 6 |
| **Verweiszeichen** „→“ neben „›“ | D4-B3, D1-A15, D3-B10 | 6 |
| **Zähler am Kartentitel** in drei Formen („(10)“, „· 4 Einsätze“, rechts leise) | D1-B9, D4-P3 | 7 |
| **Gruppenkopf** normal 13/500 gegen Versalien 12 px; Abschnitt im Fenster `h3` 15/500 gegen `section-label` 12/500; Tabellenkopf 12 versal gegen 15 gemischt | D4-B2, D3-B11 bis B13, D1-B8 | 5 |
| **Suche und Filter** in drei Formen und an zwei Orten | D4-B5, D3-B14 | 5 |
| **Vier Kalender** (Tag-Planung, Monat am Handy, Urlaub im Monat, Personenkalender) | D4-B4, D1-B7 | 12 |
| **Derselbe Einsatz in zwei Anordnungen** (Startseite dreigeteilte Leiste, Einsatzplan zwei Knöpfe plus Verweise) | D1-B1 | 10 |
| **Akten:** Kunde, Baustelle, Benutzer gleich gebaut; die Liegenschaftsakte nicht (kein `AktenKopf`, keine Kontextspalte, h1 28 statt 24 px); die Kundenakte als einzige ohne Kennwerte | D2-B1 | 15 |
| **„Neu in dieser Liste“:** `NeuKnopf` (runder Kreis, E76) neben „+ Material“ gerahmt, „+ Steuersatz“; im Fenster neben der gefüllten Hauptaktion (gegen U4) | D3-B15, D4-B15, D2-A9 | 5 (entschieden) |
| **Anmeldeweg** in drei Gestalten (Anmeldung, zweiter Faktor, Willkommen) | D4-B12 | 15 |
| **Knöpfe in Listenzeilen** (bis zu zwei Knöpfe, Stift und ⋯) statt Zeile öffnet, Aktionen im Fenster | D2-C12, D3-B20 | 7/13 |

### 4.4 Bedienung: was beim Durchspielen stockte

30 Aufgaben wurden mit gezählten Tipps durchgespielt (Tabellen in den Papieren,
je Abschnitt 4). Kurz und gut sind: Arbeitstag starten (1 Tipp), Urlaub beantragen (7),
Urlaubsantrag entscheiden (2, mit Resturlaub und Einteilung am Antrag), Passwort
vergessen (2), Kunde finden über Strg+K (0 Klicks). Es stockt hier:

| Aufgabe | Heute | Wo es stockt | Paket |
|---|---|---|---|
| Tag nachträglich auf zwei Baustellen buchen (Handy) | ~17 Tipps | „Aufteilen“ gibt es erst am gespeicherten Eintrag: man bucht zuerst falsch (D1-C2) | 10 |
| Drei Artikel für morgen anfordern | 7 | „für morgen“ nur als Notiz weit unten; „Abschicken“ liegt hinter der Kopfinsel (D1-C3 ◆) | 10 |
| „Wo muss ich morgen hin?“ | 2 + Rollen | Tipp auf den Tag zeigt nichts: die Tagesliste beginnt bei y 846 von 844 (D1-C6 ◆); „Meine Baustellen“ ist eine Sackgasse (D1-C5) | 10 |
| Dem Büro ein Foto schreiben | 6 | „Das Büro“ gibt es nicht als Empfänger (D1-C7) | 10 |
| Therme tropft: vom Anruf bis zum geplanten Einsatz | 14 | „Quelle“ Pflicht ohne Vorgabe; der Weg in die Planung steht nur in der flüchtigen Meldung (D2-C1) | 14 |
| Angebot schreiben und verschicken | ≥ 9 + Positionen | Formular als halbe Spalte über der Liste; Senden über ein ⋯ im Verlauf (D2-C2) | 13/14 |
| Angenommen → Team zuteilen | 5 + n | Team am Ende eines Fensters mit 19 Feldern, 1.800 px Rollen (D2-C3) | 13 |
| „Was ist bei Huber offen?“ | 3 Reiter + Kopfrechnen | Übersicht ohne Summe (D2-C4) | 15 |
| Wartung fällig → einplanen | 4 + Planung | Der Knopf heißt „Baustelle anlegen“; „einplanen“ kommt nicht vor (D2-C6) | 14 |
| Monatsende: alle Scheine verrechnen | je Baustelle ein Umweg | „Baustelle wählen“ statt „Verrechnen“; kein „Nächste“ (D3-C2) | 11/14 |
| Schlussrechnung mit zwei Anzahlungen | — | Abzüge stehen unter den Summen; Seite bis 4.318 px hoch; drei gefüllte Knöpfe (D3-C1) | 11 |
| Morgen früh: drei Monteure, einer krank | ~20 | Krankmeldung liegt vier Ebenen entfernt von der Planung (D4-C1) | 12 |
| Einsatz auf Donnerstag schieben (Tablet) | langes Drücken | steht nur in der Hilfe; das Feld „Tag“ im Fenster lädt einen anderen Tag, statt zu verschieben (D4-C2 ◆) | 12 |
| Neuer Mitarbeiter fängt Montag an | 8 + Text | danach bleibt man auf der Liste; Arbeitszeit und Urlaub sind ein zweiter Weg (D4-C3) | 14 |
| Eine Einstellung finden | — | 15 Reiter in zwei Zeilen; die Suche kennt „dunkel“, „Monatsabschluss“, „Mahnung“ nicht (D4-C9) | 16 |
| Planung mit 12 Monteuren | — | sichtbar sind 2½ Personen, hochgerechnet 2,6 Bildschirme (D4-C12 ◆) | 12 |

---

## 5. Zu viel Text — Befund und Regel

88 Funde, je mit Wortlaut, Grund und Ziel (`analyse/9` §6, `10` §6, `11` §7, `12` §7).
Sie fallen in sieben Muster:

| Muster | Beispiele | Wohin | Wie oft |
|---|---|---|---|
| **1. Untertitel im Seitenkopf wiederholt den Titel** (ab Tablet; am Handy fehlt er schon) | „Deine gebuchten Zeiten und dein Saldo“, „Aus Baustellen erzeugen, Zahlung verfolgen, stornieren“, „Benutzer anlegen, Rollen und Zeitkonten pflegen“ | in „Hilfe zu dieser Seite“. Bleibt, wo er eine Auskunft ist (Kontoauszug: Dateiname; Start: Datum) | rund 30 Seiten (D1-T1, D2-T, D3-T1, D4-T1) |
| **2. Dieselbe Angabe mehrfach auf einem Bildschirm** | Rechnungsfenster: Betrag viermal, Stand zweimal; Kontoauszug-Zeile: Kunde zweimal, Nummer dreimal; Tag-Planung: Datum dreimal; „fehlt 2“ und „Im Lager fehlen 2.“; Benutzerakte: Wochenstunden an drei Stellen | einmal, an der Stelle mit dem höchsten Rang | D3-T6, T7, T11, T17, D4-T7, T8, T11, T14, D1-T11, T12 |
| **3. Erklärsatz, der beim ersten Mal nützt, steht dauernd offen** | Rüstliste: „Der Haken bucht Lagermaterial vom Bestand ab …“ (bis dreimal je Seite); Kalenderlegende unter jedem Monat; Mahn-Dialog: „Der Beleg wird als PDF erzeugt …“ | „Hilfe zu dieser Seite“ bzw. `hint` am Feld; beim Abhaken eine Meldung mit „Rückgängig“ | D1-T3, T14, T20, D3-T8, T14, T15, D4-T6 |
| **4. Der Normalfall wird ausgeschrieben** | „Skonto keines“, „Rücklass keiner“, Zahlbetrag = Brutto; „Nacht 00:00“; „0 Änderungen · 0 Löschsätze“; „Soll 7:42“ in jeder von 15 Zeilen; „Rolle: Mitarbeiter“; „Saldo —“ | nur zeigen, wenn abweichend bzw. ungleich null | D3-T4, T12, T13, T20, D1-T2, T4, T5, D4-T2, T10 |
| **5. Technik- und Bürosprache beim Monteur** | „Timer-Schritt auf diesem Gerät vorgemerkt“, „Kein Startdatum konfiguriert“, „Rechnungsquelle“, „Prüfsumme — entsteht mit der Unterschrift“, „am Gerät verkleinert“, „andere Satzarten“ | kurzes Wort der Aufgabe; Technik in die Hilfe | D1-T6, T7, T8, T15, D4-T20, D3-T9, T20 |
| **6. Zeilen mit vier und mehr Angaben** | Baustellenliste am Handy: sieben Angaben, 282 px je Zeile; Wartung: Kette mit fünf Punkten; Eingang: Anliegen ungekürzt in fünf Zeilen; Plattform: Anlegedatum in jeder Zeile | zwei Zeilen; der Rest ins Fenster der Zeile (das es überall gibt) | D2-T (Listen), D2-C9, D1-T9, T25, D4-T17, T21 |
| **7. Blätter, die meist nichts tragen, stehen vor dem Inhalt** | Einkauf: „Nichts vorzuschlagen …“ und „Material dazusetzen“ vor der Liste; Scheine: „Stunden ohne Buchung (0)“; „Kommen die Meldungen an?“; Benutzerakte: Blatt „Geburtsdatum“ mit nur einem Knopf | zugeklappt, wenn leer (`Card klappe`, wie E98 bei den Rechnungen); Einzelknöpfe als Zeile in das Nachbarblatt | D3-T16, D2-C10, D4-T16, D4-I9, I11 |

**Gemessen (`analyse/8` §5, Grundzustand, Beispieldaten):** die textlastigsten Seiten
sind `/time` (662 Wörter am Handy), `/settings/module` (630) und `/my-schedule/mein`
(406). Elf Fließtexte über 20 Wörter stehen offen auf der Seite; kein Untertitel hat
über 12 Wörter (sie sind kurz, aber sie wiederholen den Titel); in den Einstellungen
steht der Seitentitel zusätzlich als aktiver Reiter.

**Regel für `docs/design/v10/style.md` (entschieden, E-T):**

1. Der Seitenkopf trägt einen Untertitel nur, wenn er eine Auskunft ist, die sich ändert
   (Datum, Dateiname, Zahl) — nie eine Beschreibung der Seite.
2. Jede Angabe steht auf einem Bildschirm einmal.
3. Erklärung steht in „Hilfe zu dieser Seite“ oder als `hint` am Feld. Offen steht nur,
   was eine Entscheidung trägt oder vor Schaden schützt.
4. Der Normalfall wird nicht ausgeschrieben; gezeigt wird die Abweichung.
5. Eine Listenzeile trägt am Handy höchstens zwei Textzeilen und einen Wert rechts.
6. Ein Blatt ohne Inhalt steht zugeklappt oder als ein Satz, nicht als leere Karte vor
   der Arbeit.

**Ausdrücklich bleiben** (aus den Papieren): „Für diesen Tag gibt es bereits 1 Schein.“,
„Kein Ansprechpartner hinterlegt.“, „Lager: 4 Stk (knapp)“, „Keine Angaben zur
Gesundheit — den Schein sieht jeder im Betrieb.“, „Das ist der Wareneingang — im Lager
nicht noch einmal einbuchen.“, „Im System stehen 4 Stk.“, die beiden Absätze unter
„Nur ansehen“/„Mitarbeiten“ im Supportzugang, „Resturlaub: 24 Tage — nach Genehmigung
14 Tage“ und „An 9 Tagen eingeteilt …“ am Urlaubsantrag, die Sperrgründe vor „Rechnung
erstellen“ (gekürzt, nicht gestrichen), die Zeile unter einem abgeschnittenen
Auswahlfeld (E91).

---

## 6. Statt der Trennpunkte — Befund und Regel

Im Quelltext steht „ · “ an rund 510 Zeilen in rund 160 Dateien (am häufigsten Material,
Planung, Zeit, Rechnungen), 113-mal über `join(' · ')`, ohne gemeinsamen Baustein. Das
runde „•“ kommt weder im Quelltext noch im gerenderten Text vor.
Gemessen im Grundzustand (`analyse/8` §4, mit wenigen Beispieldaten): 736 Punkte auf
163 Seiten bei 390 px, davon 60 allein auf `/time`; am häufigsten getrennt werden
„Datum · Zeitspanne“ (318-mal) und „Zeitspanne · Baustelle“ (246-mal). Meist steht ein
oder zwei Punkte je Zeile, höchstens fünf (`/wartungen`); die Menge entsteht durch
Wiederholung. 51 Muster sind gesammelt (`analyse/9` §7, `10` §7, `11` §8, `12` §8), je
mit Skizze. Sie lassen sich mit sieben Formen ersetzen, die es in der Linie schon gibt:

| Statt des Punkts | Für | Beispiel heute → künftig | Baustein |
|---|---|---|---|
| **Gruppenkopf** | was sich je Zeile wiederholt (Tag, Baustelle) | 55-mal „Mo, 23.11. · 07:00–16:30“ → Dachzeile „MO 23.11.“ mit Tagessumme rechts, darunter die Buchungen ohne Datum | Achse/Gruppenkopf der Listen (gibt es für KW) |
| **Messwert rechts in Mono** | Zeit, Stunden, Menge, Betrag | „Rohr · 12 Stk“ → Name links, „12 Stk“ rechts | `ListRow` mit Wert (gibt es in Rechnungen, Lager) |
| **Stempel am Namen** | Nummern (Baustelle, Rechnung, Artikel) | „Familie Huber · B-2026-0149“ → Name, dahinter die Nummer als Stempel | `.zeile-nr` (gibt es) |
| **Zweite Zeile in leiser Tinte** | die dritte Angabe | „Kunde · Nummer · Ort“ → Name + Stempel, darunter der Ort | `ListRow` Untertitel |
| **Datums- oder Zeitspalte links** | Termine, nächste Einsätze | „Di, 24.11. · Lieferung · 08:00–10:00“ → Spalte „DI / 24.11.“, Titel, Zeit rechts | Termin-Zeile der Akten (gibt es) |
| **Wertpaare / Kennwerte** | Kopfzeilen von Fenstern und Dialogen | „Kunde · Rechnungsbetrag € … · offen € …“ → zwei Kennwerte mit Beschriftung | `Angaben`/`Metric` (gibt es im Rechnungsfenster) |
| **Feste Spalten** am Schreibtisch | Listen mit drei und mehr Angaben | Mahnlauf: „2026-0231 · € 22 104,60 · 71 Tage überfällig · Kundenart fehlt“ → Spalten Name, Stufe, Betrag, Tage; die Warnung als eigener Zustand | Tabelle/Spaltenraster der Listen |
| **Zähler rechts im Kartenkopf** | „Dein Einsatz heute · 4 Einsätze“ | Titel links, „4“ leise rechts — eine Form für alle Karten | `Card` |

**Regel für `style.md` (entschieden, E-P):**

1. Der Punkt trennt höchstens **zwei kurze, gleichrangige** Angaben in einer leisen
   Zeile. Nie mehr als ein Punkt je Zeile.
2. Gemessenes steht für sich in Mono und braucht kein Zeichen davor.
3. Ein Zustand ist ein Zustand (Zeichen und Wort), kein Glied einer Kette; eine Warnung
   steht nie im grauen Punktfluss (heute: „Kundenart fehlt“ im Mahnlauf, „Liefertermin …
   überschritten“ im Einkauf).
4. Was die Gruppe sagt, steht im Gruppenkopf.
5. Am Schreibtisch feste Spalten statt Ketten.

**Der Punkt bleibt:** bei zwei kurzen gleichrangigen Angaben („KW 48 · 23.11. – 29.11.“,
„Max Mustermann · du“), in der Summenzeile einer zugeklappten Karte (E98 legt sie so
fest), in der Anschrift, wie sie auf dem Beleg steht („Musterstrasse 1 · 2700 Wiener
Neustadt“), und in den Auswahlfeldern des Geräts (dort gibt es keine Spalten).

**Wächter:** eine Browsermessung in den Linkprüfungen zählt je gerenderter Zeile die
Punkte und schlägt bei zwei und mehr an (mit Ausnahmeliste für die vier Fälle oben).
Gegenprobe: am heutigen Stand rot an den gesammelten Fundstellen.

---

## 7. Der Plan in Paketen

Je Paket: Ziel, Punkte, was gebaut wird, Prüfungen mit Gegenprobe, was gleich bleibt,
Risiko, Aufwand (Schätzung in Arbeitstagen), Voraussetzung. Die Schritte je Befund
stehen ausführlich im Papier; hier steht, was zusammengehört und in welcher Reihenfolge.

### Stufe A — Rückfälle, Falschzahlen, Datenverlust

#### Paket 1 — Rückfälle beheben, drei Wächter bauen
**Ziel:** Die drei Rückfälle der letzten Wellen sind behoben, und dieselbe Art Fehler
kann nicht unbemerkt wiederkommen.
**Punkte:** Z-1, Z-2, Z-15, S-1, M-1, S-13, S-10, M-16, L-1, M-2, L-2, A-1, P-10.

| Schritt | Was | Prüfung und Gegenprobe | Bleibt gleich |
|---|---|---|---|
| 1 | **Wächter Textersatz (Z-15):** `tests/unit/migrationenTextersatz.test.ts` liest die Migrationen in Reihenfolge und schlägt an, wenn eine Funktion nach einem Textersatz noch einmal definiert wird (Ausnahmeliste mit Grund); in `schema.test.ts` eine Tabelle „Funktion → muss enthalten“ für lohnrelevante Stellen | am heutigen Stand rot wegen `urlaub_entscheiden`; nach Schritt 2 grün | keine Migration wird angefasst |
| 2 | **Z-2:** neue Migration, `urlaub_entscheiden` und `urlaub_kuerzen` rechnen über `app.urlaubstage_person(…)`, sonst Wort für Wort gleich | `urlaubMitVerlauf.test.ts`: Antrag über den Tag einer vorgemerkten Änderung genehmigen, kürzen, zurücknehmen; Tage wie in der Vorschau der App. Ohne Migration rot | Personen ohne Verlauf bekommen dieselben Tage; genehmigte Anträge werden nicht neu gerechnet |
| 3 | **Z-1:** `app.monat_abgeschlossen_sperre()` lässt ein UPDATE durch, wenn sich nur `is_billed`, `invoice_number`, `updated_at` ändern (Vergleich über `to_jsonb(new) - Spalten`, damit neue Spalten von selbst gesperrt bleiben); eigener Merker für `baustelle_umnummern` | `monatsabschluss.test.ts`: Rechnung ausstellen, stornieren, Storno aufheben, Baustelle umnummern im abgeschlossenen Monat. Ohne Migration rot (23514) | Tag, Uhrzeit, Pause, Stand, Baustelle, Kommentar bleiben gesperrt; Anlegen und Löschen gesperrt; je eigene Prüfung |
| 4 | **Wächter Support-Einblick (S-10, M-16):** jede Funktion aus `LESENDE_FUNKTIONEN` steht in genau einer Liste: „läuft im Einblick“ (wird mit Freigabe „ansehen“ gerufen, darf nicht 42501 antworten) oder „dem Support verschlossen“ mit Grund | mit den vier Funktionen in der ersten Liste heute rot | was dem Support verschlossen ist, bleibt es |
| 5 | **S-1, M-1, S-13:** eine Migration: `lager_liste`, `anforderungen_laufend`, `baustellen_liste`, `wartungen_faellig_stand`, dazu `schein_verrechnung`, `retoure_rahmen`, `kommissionsartikel_im_lager` nehmen `coalesce(app.betrieb(), app.supportbetrieb())`; `startseite-forderungen` bekommt den Betrieb aus dem Rumpf (gelesen wird weiter mit dem Token der Person); die drei „Mitarbeiten“-Rückfälle (`anforderung_aus_lager`, `anforderung_zurueckziehen`, `retoure_annehmen`) erst nach Nachstellen | `supportAnsehenListen.test.ts` und `startseiteForderungen.test.ts` um den Einblick erweitert: gleiche Zahlen wie der Administrator. Ohne Migration rot | die 34 bestehenden Fälle der vier Funktionen; ohne Einblick sieht die Plattform nichts; der Monteur sieht nur seine Anforderungen; `baustellen_budget_lage` bleibt dem Support verschlossen (benannte Grenze) |
| 6 | **Wächter Zeilengrenze (L-2):** `tests/unit/funktionsgrenzen.test.ts`: jeder `.rpc(` mit Zeilenmenge braucht `.range(`/`rpcAlle`, ein `limit` im Rumpf oder einen begründeten Eintrag | ohne Schritt 7 rot für zwei Funktionen | — |
| 7 | **L-1, M-2:** Helfer `rpcAlle` in `kern.ts` (seitenweise wie `unverrechnetHolen`); `ausgegebenes_material_gesamt` und `schein_einkaufspreise` bekommen eine eindeutige Reihenfolge (neue Migration, Sicherheitsregeln unverändert) | `ausgegebenesMaterialGesamt.test.ts` mit 1.200 Zeilen über zwei Baustellen: alle kommen an. Mit dem heutigen Aufruf genau 1.000 | Zeilen, Vorzeichen der Retouren, Rechte, Bündeln, Ansicht (bestehende Prüfungen) |
| 8 | **A-1, P-10:** `app.baustelle_abschluss_zaehlen` zählt über `app.scheine_verrechnet_kern`; Minuten und Material = 0 bei Pauschal/Einheitspreis mit gültiger Rechnung, die weder Anzahlung noch Teilrechnung ist | `baustelleAbschliessen.test.ts`: Pauschalbaustelle mit Schlussrechnung meldet 0. Ohne Migration rot | Regiebaustelle zählt wie bisher; Pauschale nur mit Anzahlung zählt weiter; Rückgabeform |

**Risiko:** Z-1: eine zu weite Ausnahme wäre ein Loch im Abschluss — deshalb feste,
kurze Spaltenliste. S-1: keines für den eigenen Betrieb. **Aufwand:** 3–4 Tage.
**Voraussetzung:** keine. Offene Entscheidung nur zu S-13 (Scheine und Auftragseingänge
im Supportzugang, E-S).

#### Paket 2 — Geld: falsche Vorwahl, stehen gebliebene Werte, Wettläufe
**Ziel:** Keine falsche Zahl in Rechnung, Zahlung und Abgleich.
**Punkte:** G-1, G-2, D3-6, G-5, G-6, G-14, G-16, A-3, A-4, G-4.

- **G-1:** `abgleichen` nimmt eine Ziffernfolge ohne Vorsatz nur dann als
  Rechnungsnummer, wenn sie kein Datum ist (JJJJMMTT, TTMMJJJJ) und nicht Teil einer
  längeren Ziffernfolge. Prüfung in `kontoauszugAbgleich.test.ts` mit dem nachgestellten
  Fall („20261015-…“); Gegenprobe rot. Bleibt: die 32 bestehenden Fälle.
- **D3-6:** Vorbelegung über den Betragsformatierer (`22.104,60`) statt `String()`;
  Komponentenprüfung; bleibt: das Feld liest beide Schreibweisen.
- **G-2:** beim Wechsel der Baustelle und beim Verwerfen alle abgeleiteten Werte
  (Rabatt, Bauleistung, Rücklass, Befreiung, Art) aus der Vorgabe neu setzen;
  Prüfung je Wert; bleibt: bewusst geänderte Werte derselben Baustelle bleiben.
- **G-5, G-6:** `rechnung_anlegen` vergleicht den Stand (Dauer der Zeitbuchungen bzw.
  „Pauschale schon verrechnet“) mit dem der Vorschau und weist ab („hat sich geändert —
  Vorschau neu laden“); Datenbankprüfung mit zwei Sitzungen.
- **G-16:** `rechnung_anlegen` rechnet Netto, Steuer, Brutto aus den Zeilen nach und
  weist eine Abweichung über einem Cent ab. **Zuerst messen**, ob alle bestehenden
  Belegarten die Prüfung bestehen (Belegreferenz), dann einschalten.
- **G-14:** Abzug einer Anzahlung prüft den Steuersatz; **A-3:** Kundenwechsel im
  Nachtrag löst die Baustelle, `angebot_annehmen` vergleicht den Kunden auch über den
  Link; **A-4:** `listQuotesForProject` ohne die Grenze 20, geordnet, über `rpcAlle`.
- **G-4:** Kontenrahmen bekommt ein Kassakonto; der Zahlungsstapel bucht nach Zahlart.
  **Voraussetzung:** Kontonummer und Buchungssatz mit der Kanzlei abstimmen (K-1).

**Risiko:** G-16 kann bestehende Rechnungswege abweisen, wenn irgendwo anders gerundet
wird — deshalb erst messen. **Aufwand:** 4–5 Tage.

#### Paket 3 — Ohne Netz und stille Fehlschläge
**Ziel:** Nichts, was jemand eingegeben hat, verschwindet ohne Spur; keine falsche
Auskunft bei einem Fehler.
**Punkte:** P-1, S-5, P-5, P-2, Z-4, S-2, S-6.

- **P-1:** aufgegebener Schein wird wie die Zeitbuchung (Z4) zum Entwurf auf dem Gerät
  (`src/lib/scheinEntwuerfe.ts`, IndexedDB wegen der Unterschriftsbilder);
  `ohneEmpfang.ts` sichert auch die Schein-Tabelle; in der Scheinliste Abschnitt „Nicht
  angekommen“ mit Grund und den Handgriffen „Als neuen Schein öffnen“ / „Verwerfen“;
  `schein_speichern` setzt einen unbekannten Kunden (zusammengeführt) auf den der
  Baustelle. Prüfung: Fach mit `schein_speichern` + `schein_unterschreiben`, Sender
  lehnt ab → Entwurf liegt mit beiden Unterschriften; Gegenprobe rot.
  Bleibt: ein anderswo unterschriebener Schein wird nicht überschrieben (Grenze E49).
- **S-5:** dieselbe Sicherung für Materialanforderung (mit Inhalt und Grund in der
  Meldung) und Nachricht.
- **P-5:** scheitert die Abfrage der Abwesenheiten, steht „Abwesenheiten nicht geladen“
  mit „Erneut versuchen“, nicht „niemand fehlt“ (Tagesplanung, Startseite, Einsatzplan).
- **P-2:** „Mein Einsatzplan“ fragt die eigenen Abwesenheiten unabhängig von „Wochenplan
  für alle“ und über den ganzen gezeigten Zeitraum.
- **Z-4:** „Ende ändern“ prüft dieselbe 14-Tage-Grenze und meldet dem Büro.
- **S-2:** „Passwort ändern“ und „Passwort vergessen“ räumen die Push-Anmeldungen der
  anderen Geräte (`app.push_anmeldungen_entfernen`, Weg wie K2).
- **S-6:** ein sichtbares Fenster merkt die beendete Sitzung sofort (Hörer am
  Anmeldezustand) und nennt den richtigen Grund.

**Bleibt gleich:** Zeitentwürfe (Z4), Reihenfolge im Ausgangsfach, Datenschutz beim
Abmelden (Entwürfe eines Kontos sieht kein anderes). **Risiko:** P-1 legt
Unterschriften auf dem Gerät ab — dieselbe Schutzregel wie für das Ausgangsfach (je
Konto, beim Abmelden mit Rückfrage). **Aufwand:** 4–5 Tage.

#### Paket 4 — Material: der Bestand stimmt
**Punkte:** M-4, M-10, M-11, M-14, M-3, M-13, M-12, M-15, M-8.

- **M-4:** ein Posten mit Katalogartikel trägt dessen Einheit (Formular sperrt das Feld;
  Datenbank weist ab); **M-10:** Einheit freier Zeilen wandert beim Teilen und auf die
  Bestellung mit; **M-11:** Kommissionsware zählt nicht als Zusage; **M-14:** eine
  verbuchte Anforderung lässt sich nicht erneut auf die Einkaufsliste setzen.
- **M-3:** Einheit ändern: der Import ändert sie nicht still (Probelauf zeigt „Einheit
  weicht ab“ und lässt entscheiden); von Hand mit Rückfrage, die Bestand, offene
  Anforderungen und Preis nennt.
- **M-13:** „Reserviert“ zählt Artikel, nicht Mengen verschiedener Einheiten;
  **M-12:** Protokoll blättert („ältere anzeigen“); **M-15:** die Schwelle „knapp“ ohne
  Mindestmenge wird Einstellung je Betrieb (Vorgabe 5); **M-8:** Wareneingang findet
  jeden Katalogartikel, auch über Großhändlernummer und EAN.

**Prüfungen:** je Punkt eine Datenbankprüfung mit Gegenprobe (Bestand vor/nach).
**Bleibt gleich:** `lagerListe.test.ts` (9), Bestellvorschläge, Inventur.
**Aufwand:** 4–5 Tage.

### Stufe B — Bausteine und Regeln der Oberfläche

#### Paket 5 — Ein Fuß, eine Zeile, ein Kopf (Bausteine)
**Ziel:** Was auf vielen Seiten verschieden ist, wird am Baustein einmal richtig.
**Punkte:** D1-B3, D1-B15, D1-C1, D1-A2, D2-A20, D2-A2, D2-A3, D3-4, D4-A2, D4-B7,
D4-B8, D2-B3, D1-A1, D1-A3, D1-A19, D2-A8, D4-A11, D3-B16, D4-A6, D4-B2, D3-B11 bis
B13, D1-B8, D4-B5, D3-B14, D3-B15, D2-A9, D4-B15, D2-A14, D2-A19, D2-A5,
V-1 bis V-3, V-5, V-6, V-8 bis V-15, V-B4 bis V-B7, V-B9, V-B10.

| Schritt | Was | Bleibt gleich |
|---|---|---|
| 1 | **Ein Fuß für Fenster und Blatt** (`Fensteraktionen` als einzige Form): klebt am unteren Rand, Hauptaktion rechts, höchstens eine zweite, der Rest und alles Unumkehrbare im ⋯ (U4); am Handy über die Breite. Alle Formulare in Fenstern und Blättern stellen darauf um („Neuer Kunde“, „Neue Baustelle“, „Neue Wartung“, Zeitblatt, „Einsatz bearbeiten“, Plattform) | jede Aktion bleibt erreichbar (Funktionsinventar); Enter/Escape; Fokusfalle |
| 2 | **Ungespeichertes** in Fenstern einheitlich: Schließen mit Änderungen fragt (wie die Akte) | „Neuer Kunde“ verliert nichts, was es heute behält |
| 3 | **Zeile, die öffnet, trägt den Pfeil** (E99) — überall, wo ein Tipp ein Fenster oder eine Akte öffnet; Wächter in den Linkprüfungen | Zeilen ohne Ziel bleiben ohne Pfeil |
| 4 | **Baustein-Fehler:** `.wisch-knopf` ohne Umbruch; `.blatt-inhalt` mit 16 px Polster; Seitenleiste rollt in sich; Speicherleiste im Fenster deckt bis zur Kante; Rechnungsfenster-Aktionen im Fuß; ein Fokusring; 24-px-Flucht an den vier gemessenen Stellen | Maße der Blätter, Wischgeste, Speicherleiste auf Seiten |
| 5 | **Eine Form je Rolle:** Gruppenkopf, Abschnitt im Fenster, Tabellenkopf, Suche (`.suche` mit Lupe), Ort von Filter und Suche (`Listenleiste` im Blatt), „Neu in dieser Liste“ (nach Entscheidung E-N) | E97 (Schriftskala) |
| 6 | **Ausreißer der Vermessung am Baustein:** `:focus-visible` ändert die Form nicht mehr (V-13); `p.leer` und `.arbeitszeile` mit `--blatt-rand` (V-1, V-2); Blätter nebeneinander im Raster (V-3); Tastflächen ≥ 44 px (V-5, die Lupe nimmt den Tipp an); Platzhalterkontrast (V-6); handgebaute Tabelle, Beschriftungen, Titel auf die Bausteine (V-8 bis V-12, V-14, V-15) | Fokusring selbst (Farbe, 2 px außen); Maße der Felder |
| 7 | **Wächter aus `analyse/8` §8:** Tastfläche 44 px über jede Seite bei 390 px; Form unter Fokus gleich; `raster.spec.ts` über alle Seiten der Navigation mit aufgeklappten Karten; Rollenprüfung (`th` = 12, `dt` = 13, Blatttitel = 18) auch in Fenstern; Radius nur aus den Tokens; `<table>`/`<label>`/Suchfeld nur über die Bausteine | — |

**Prüfungen:** Komponentenprüfungen der Bausteine; Linkprüfung „Fuß im Bild“ (jede
Hauptaktion eines Fensters liegt beim Öffnen im sichtbaren Bereich, 390×844 und
1440×900 — heute rot an sieben Fenstern); Vorher/Nachher-Bilder aller Fenster.
**Risiko:** Der Fuß berührt jedes Formular — deshalb in drei PRs (Baustein; Büro-Fenster;
Handy-Blätter), je mit dem vollen Durchklick. **Aufwand:** 6–8 Tage.
E-N ist entschieden.

#### Paket 6 — Eine Schreibweise: Zahlen, Zeiten, Wörter, Anrede, Tastaturen
**Punkte:** D1-B5, D1-B6, D3-B1 bis B10, D4-B10, D2-A11, D2-A17, D2-B4 bis B6,
D4-B3, D1-A15, D1-A16, D1-B14, D3-T22, D1-A22, D4-A4, D3-17, D1-C9, D1-B4, D3-B9.

- **Formatierer als einzige Quelle** (`src/lib/betrag.ts`, Zeit- und Datumshelfer):
  Dauer „HH:MM Std“, Datum kurz/lang nach Rolle, Wochentag ohne Punkt, Betrag „€ 1 234,56“
  in Mono rechtsbündig, Menge „12 Stk“ in Mono. Wächter: kein `toFixed`/`String(betrag)`
  in Ansichten, keine zweite Datumsform.
- **Wörterliste** (`docs/design/v10/woerter.md`, neu): ein Wort je Sache — Speichern,
  PDF laden, Anforderung, Zählliste/Bestand berichtigen, ganztags, (freiwillig),
  Firmendaten, Mein Konto; Verweiszeichen „›“; **Anrede „du“ überall** (E-D). Wächter
  über die Texte (`schreibweise.test.ts` erweitern).
- **Tastaturen:** `inputMode`, `autoComplete`, `enterKeyHint`, `autoCapitalize` an jedem
  Feld über `InputField` (Zahl, Dezimal, Telefon, Mail, Suche, Kennzeichen); Wächter.
- Leer- und Zustandssätze 15 px; Maschinentexte in Fehlern durch Sätze ersetzen.
- Nach Entscheidung E-V1 bis E-V3 (noch offen): feste Zeilenhöhe je Schriftstufe,
  Titelskala nach Rollen, Nummern und Zeiten in Begleitzeilen in Mono (V-B1 bis V-B3) —
  je ein eigener PR mit Bildvergleich aller Seiten, weil jede Seite betroffen ist.

**Bleibt gleich:** Belege und Exporte (sie schreiben `euroBetrag`, Belegreferenz Byte
für Byte gleich); gespeicherte Werte. **Risiko:** Texte ändern sich an vielen Stellen —
das Funktionsinventar führt umbenannte Knöpfe in `v10-entfernt.json` mit altem und
neuem Namen. **Aufwand:** 5–6 Tage. E-D (Anrede „du“) ist entschieden.

#### Paket 7 — Statt der Punkte (Regel, Bausteine, Wächter)
**Punkte:** alle 51 Muster (D1-P1 bis P17, D2-P1 bis P9, D3-P1 bis P13, D4-P1 bis P12),
D1-B9, D4-P3, D1-A18, D1-B2, D3-B17.

1. Regel in `style.md` (Abschnitt 6) — entschieden (E-P).
2. Bausteine: `ListRow` mit Wert rechts (Mono) und Stempel am Titel überall; Gruppenkopf
   „Tag“ für Listen; Datumsspalte der Termin-Zeile als Baustein; Zähler rechts im
   `Card`-Kopf; `Angaben` (Wertpaare) für Fenster- und Dialogköpfe.
3. Wächter „höchstens ein Punkt je Zeile“ (Abschnitt 6).
4. Umstellen in der Reihenfolge der Wirkung: Zeitliste (D1-P1, der größte Hebel),
   Startseite (D1-P4, P8, P9, D4-P1 bis P3), Material und Anforderungen (D1-P10, P11,
   D3-P6 bis P8, P10), Rechnungen und Mahnlauf (D3-P1 bis P5), Wartungen/Baustellen/
   Angebote (D2-P), Planung und Team (D4-P4 bis P10), Fenster-Köpfe (D1-P14, D3-P4).

**Prüfungen:** je umgestellter Liste die bestehenden Prüfungen (Wischen, Fenster öffnen,
Vorlesetext) plus Bildvergleich; `aria-label` der Zeile nennt weiter alle Angaben in
derselben Reihenfolge (Prüfung wie G3 in `TimeView.test.tsx`).
**Bleibt gleich:** jede Angabe bleibt sichtbar oder einen Tipp entfernt; Reihenfolge für
die Vorlesehilfe; `kein-trennen` an Nummern; die vier Fälle, in denen der Punkt bleibt.
**Risiko:** eine Zeile wird am Handy (375 px) dreizeilig — Messung je Liste auf 375 px.
**Aufwand:** 8–10 Tage, in vier PRs. **Voraussetzung:** Paket 6 (Formatierer). E-P ist entschieden.

#### Paket 8 — Weniger Text
**Punkte:** alle 88 T-Funde (D1-T1 bis T25, D2-T1 bis T20, D3-T1 bis T22, D4-T1 bis
T21), D2-C10, D4-I9, D4-I11, D1-I16, D1-I18.

1. Regel in `style.md` (Abschnitt 5) — entschieden (E-T).
2. `PageHeader`: Untertitel nur noch als Auskunft; die beschreibenden Untertitel wandern
   in `hilfe` derselben Seite (ein PR, rund 30 Seiten).
3. Doppelte Angaben streichen (Muster 2), je Fenster ein PR-Abschnitt: Rechnungsfenster,
   Zahlungsdialog, Kontoauszug-Zeile, Tag-Planung, Benutzerakte, Anforderungsfenster.
4. Erklärsätze in Hilfe oder `hint` (Muster 3); Rüstliste: Meldung mit „Rückgängig“
   statt Dauersatz.
5. Normalfall weglassen (Muster 4); Technik- und Bürowörter ersetzen (Muster 5).
6. Leere Blätter zuklappen (Muster 7).
7. Zeilen kürzen (Muster 6) — zusammen mit Paket 7.

**Prüfungen:** Wächter „Untertitel im Seitenkopf höchstens n Wörter und kein Verb der
Beschreibung“ ist nicht verlässlich — stattdessen eine **Liste der erlaubten Untertitel**
im Test; jede Hilfe-Seite enthält die verschobenen Sätze (Prüfung über die Hilfetexte);
Messung „Wörter über dem Falz“ je Route vorher/nachher (aus `analyse/8`).
**Bleibt gleich:** die als „bleibt“ markierten Sätze (Abschnitt 5); alles Gestrichene
steht in der Hilfe oder im Fenster. **Risiko:** gering, solange Schritt 3 je Fenster
geprüft wird, dass die Angabe an der verbleibenden Stelle wirklich steht.
**Aufwand:** 5–6 Tage. E-T ist entschieden.

#### Paket 9 — Vorschau zeigt jeden Bildschirm
**Punkte:** D3-C0, die „nicht erreichbar“-Listen der Papiere 9–12.
Die Vorschau liefert für „Rechnung stellen“, Kontoauszug, Einkaufsliste,
Auftragseingang, Liegenschaften, Zählliste, zweiten Faktor, Mein Fahrzeug keine oder
abstürzende Daten; einen leeren Betrieb gibt es nicht. Attrappen ergänzen
(`tools/vorschau/fest/`), dazu ein Bestand „leer“ (`?bestand=leer`). `fotos.mjs` und
`messen.mjs` nehmen Fenster, ⋯-Menüs und Blätter je Seite auf.
**Nutzen:** Stufe C lässt sich vollständig im Bild prüfen; der Wächter
`vorschauErsatz.test.ts` verlangt die Form je Attrappe. **Aufwand:** 3–4 Tage.

### Stufe C — Seiten und Arbeitsbereiche

#### Paket 10 — Der Monteur am Handy
**Punkte:** D1-A17, D1-C1 bis C9, D1-B1, D1-A4 bis A14, D1-B10 bis B13, D1-I1 bis I4,
I10, I14, I15, P-11 (Uhrzeit je Person).

- Gespräch meldet seinen Titel in die Kopfinsel; **Kopfinsel mit Rückweg** „‹“ in Akte,
  Schein und Gespräch (D1-I2), großer Titel schrumpft weich hinein (D1-I3).
- Korb: Leiste „Abschicken“ klebt immer über der Fußinsel; „Brauche ich bis“ als Feld
  (heute / morgen / Datum) statt Notiz (D1-C3).
- Einsatzplan: Tipp auf einen Tag rollt die Tagesliste ins Bild; „Nächste Einsätze“
  öffnen das Einsatz-Fenster mit Adresse, Telefon, Route; „Meine Baustellen“ öffnet die
  Baustelle des Monteurs (lesend: Adresse, Ansprechpartner, Leistungsumfang aus A-10,
  eigene Scheine) (D1-C5, C6).
- Derselbe Einsatz überall mit derselben Aktionszeile (D1-B1).
- Zeit: „Auf mehrere Baustellen aufteilen“ schon im neuen Eintrag (D1-C2); gesperrte
  Hauptaktion nennt den Grund am Knopf (D1-C4).
- Nachrichten: Empfänger „Büro“ (Gruppe aus Verwaltung/Leitung, je Betrieb einstellbar)
  (D1-C7); Postfach mit kurzer Zeit (D1-I14).
- Rückmeldung beim Antippen für alle Zeilen und Knöpfe (D1-I4); `:hover` nur für
  Zeigegeräte (D1-I5) — am Gerät prüfen.

**Bleibt gleich:** alle sieben Wege des Monteurs im Durchklick (Chromium, WebKit,
Tablet); Wischen, Ziehen zum Aktualisieren; kein Start-Balken im Gespräch.
**Aufwand:** 8–10 Tage, in drei PRs.

#### Paket 11 — Rechnung stellen, Kontoauszug, Einkauf (die dichten Arbeitsbereiche)
**Punkte:** D3-1 bis D3-5, D3-7 bis D3-16, D3-C1 bis C13, D3-B18 bis B20, L-12 (Teil).

- **Rechnung stellen als Arbeitsbereich in vier Schritten** (D3-C1): ① Baustelle und
  Art ② Positionen (am Handy als Zeilenliste statt Tabelle, „Position hinzufügen“
  direkt darunter, Abzüge der Anzahlungen direkt darunter) ③ Angaben (Zahlungsziel,
  Skonto, Rücklass — nur Abweichungen offen) ④ Prüfen und erstellen. Die Summe steht
  als feste Zeile; eine gefüllte Hauptaktion. Beträge in Mono auf einer Flucht.
  **Dazu zuerst** `InvoicesView` in Teile zerlegen (Liste, Erstellen, Fenster,
  Zahlung, Mahnung, Export — L-12), **ohne Verhalten zu ändern**: eigener PR, alle
  Rechnungsprüfungen und die Belegreferenz Byte für Byte gleich.
- „Verrechnen“ statt „Baustelle wählen“, danach „Nächste: …“ (D3-C2).
- Kontoauszug: Zeile einzeilig mit Betrag rechts auf einer Flucht; Einstieg im
  Seitenkopf ab Tablet; Datei per Ablegen (D3-7, D3-C3).
- Mahnen in einem Zug („Erzeugen und senden“, wenn Mail eingerichtet) (D3-C4).
- Export mit Segmenten „Vormonat · Dieser Monat · Quartal“ (D3-C5).
- Einkaufsliste: je Großhändler eine Hauptaktion „Bestellen …“; bestellte Zeile öffnet
  ein Fenster mit „Geliefert“ (D3-C6, D3-9); Katalog einspielen mit fester Schrittzeile
  und Vorschau als Tabelle (D3-C8).
- Tastatur am Schreibtisch: Enter legt die nächste Position an, Strg+Enter löst die
  Hauptaktion aus (D3-C11).

**Bleibt gleich:** jede Rechnungsart, jeder Steuerfall, alle Sperrgründe;
`rechnung_anlegen` unverändert; PDFs Byte für Byte. **Risiko:** das größte der
Oberflächenpakete — deshalb Zerlegen und Umgestalten getrennt, und der Umbau des
Erstellens erst, wenn Paket 2 (G-2, G-5, G-6, G-16) drin ist. **Aufwand:** 12–15 Tage.

#### Paket 12 — Planungstafel und Kalender
**Punkte:** D4-A1, D4-A10, D4-A14, D4-B4, D4-B6, D4-B11, D4-B13, D4-C1, C2, C12, D4-I1,
D4-T12 bis T14, D1-B7.

- **Kachel zweizeilig** mit Kurzbezeichnung (D4-I1): Zeile rund 70 statt 131 px; bei 12
  Monteuren fast auf einem Bildschirm. Nummer in `title`, `aria-label` und Fenster.
- **Verschieben auffindbar:** im Fenster „Einsatz bearbeiten“ verschiebt das Feld „Tag“
  den Einsatz (heute lädt es einen anderen Tag) — oder ein eigener Eintrag „Verschieben
  …“; Pfeiltasten im Raster (D4-C2).
- Tag-Planung am Handy: Bestand zuerst, „Einsatz planen“ als Blatt (U2); der Wächter
  erkennt den Titel.
- Krankmeldung direkt aus der Planung („fehlt heute …“ an der Person) (D4-C1).
- Ein Kalenderbaustein für die vier Kalender; Tastflächen ≥ 44 px (Monat am Tablet:
  Tag öffnet das Tag-Fenster statt winziger Balken — E-M).
- Ansichtswahl als eine Leiste (Sicht | Zeitraum getrennt erkennbar).

**Bleibt gleich:** Ziehen mit Maus und Finger, „Noch einzuplanen“ (E96), Konflikte,
Abwesenheiten, Monatsvorschau. **Aufwand:** 7–9 Tage. E-M ist entschieden; Paket 19
(P-4: Plan aktuell halten) kann parallel.

#### Paket 13 — Akten, Angebote, Scheine, Wartungen (Büro)
**Punkte:** D2-A1, A4 bis A7, A10 bis A13, A15 bis A18, D2-B2, B7 bis B11, D2-C2, C3,
C9 bis C13, D2-I4, I5, I7, I11 bis I13, A-17.

- Angebotsakte: Hauptaktion = nächster Schritt des Stands (Versenden → Annehmen →
  Baustelle öffnen), ein ⋯ im Seitenkopf (D2-A10, A-17); am Handy Positionen vor dem
  Verlauf.
- Angebot schreiben als Arbeitsbereich mit zwei Zonen am Schreibtisch: Formular links,
  die Positionen, wie der Kunde sie sieht, und die laufende Summe rechts (D2-I4);
  Enter legt die nächste Position an (D2-I5).
- Kundenseite der Annahme: Angaben und Positionen vor dem Unterschriftsblatt (D2-C13).
- Baustellenakte: Team direkt an der Akte ändern (D2-I11); „Bearbeiten“ in Abschnitten
  mit Sprungleiste (D2-I13); leere Karten der Übersicht zusammengelegt (D2-I10,
  Vorbehalt E99).
- Listenzeilen kurz (Baustelle, Wartung, Angebot, Eingang) — mit Paket 7; höchstens ein
  kleiner Knopf je Zeile (D2-C12).
- Reiter „Belege“ der Kundenakte mit der Belegzeile aus E99; Schein öffnet im Fenster
  der Akte wie die Rechnung (D2-B9); „Wartung erledigt“ nicht rot.

**Bleibt gleich:** `akten.spec.ts`, E99 (Zeitstrahl, Rechnungen im Fenster), alle
Annahme-Wege. **Aufwand:** 8–10 Tage.

#### Paket 14 — Der nächste Schritt wird angeboten
**Punkte:** A-12, A-16, D2-I1, I3, D2-C1, C6, D3-C2, C7, C13, D4-C3, M-6 (Anzeige),
D2-I9, D3-C10.

Eine Regel, überall gleich: **nach einer abgeschlossenen Handlung führt die App dorthin,
wo es weitergeht; die Meldung bestätigt nur.** Angebot angenommen → Baustellenakte;
Wartung eingeplant → Einsatzplanung mit gewählter Baustelle; Eingang → Angebotsformular;
Benutzer angelegt → Akte (Arbeitszeit, Urlaub); Schein unterschrieben → „Verbrauch
buchen?“ (M-6); verrechnet → „Nächste Baustelle“. Leerzustände tragen den ersten Schritt
als Verweis. Startseite der Leitung zeigt Angebote mit ablaufender Bindefrist und liegen
gebliebene Entwürfe (A-16). Wartung: der Knopf heißt „Einplanen“.
**Bleibt gleich:** die Meldung mit „Rückgängig“; wer abbricht, kommt dorthin zurück, wo
er herkam (D2-B9). **Aufwand:** 5–6 Tage.

#### Paket 15 — Erster Eindruck, Akten gleich, Sackgassen
**Punkte:** D2-B1, D2-C4, D2-I2, D4-A3, D4-C13, D4-B12, D4-I5, D4-C7, D4-C8, D4-C11.

- Liegenschaftsakte wie die drei anderen (`AktenKopf`, Kontextspalte, 24 px).
- Kundenakte mit Kennwerten im Kopf: „offen € …“, „1 Eingang offen“, „1 Wartung
  überfällig“, je ein Verweis auf den Reiter (D2-I2).
- „Kein Zugriff“, „Modul ausgeschaltet“, „Seite nicht gefunden“ als Seiten der Linie mit
  Weg weiter; unbekannte Adresse zeigt eine Auskunft statt still auf Start zu leiten.
- Anmeldung, zweiter Faktor, Willkommen in einer Gestalt; „Passwort anzeigen“.
- **Leerer Betrieb:** Blatt „Einrichten (2 von 6)“ auf der Startseite der Leitung,
  solange etwas offen ist (D4-I5); braucht den leeren Bestand aus Paket 9.

**Aufwand:** 5–6 Tage.

#### Paket 16 — Einstellungen
**Punkte:** D4-B1, D4-B14, D4-C9, D4-I2 bis I4, I8, I9, D4-A7, D4-A9, D4-T4, T5, T15,
D3-C12, D3-P12.

- **Ein Speichermodell** (E-E): Empfehlung — Einstellungsseiten speichern mit der
  Speicherleiste je Seite; Schalter, die sofort wirken, stehen nur dort, wo nichts
  anderes zu speichern ist (Module, Mein Konto). Auf Seiten mit Speicherleiste wird der
  Schalter zum Kästchen-Ersatz „gilt mit Speichern“ sichtbar gleich behandelt wie die
  Felder daneben.
- Gliederung statt 15 gleichrangiger Reiter: Mein Konto · Betrieb · Geld · Team · Daten
  (D4-I2); die Suche (Strg+K) kennt die Stichworte der Einstellungen (D4-I3).
- Briefkopf-Vorschau neben den Firmendaten; Farbprobe am Hex-Feld (D4-I4).
- Betragsfelder mit Einheit im Feld; Mahnspesen als Raster 3 × 2.

**Bleibt gleich:** jede Einstellung, ihr Ort in der Adresse (alte Adressen leiten
weiter), Rückfragen der Module. **Aufwand:** 6–7 Tage. E-E ist entschieden.

### Stufe D — Lücken in den Abläufen

#### Paket 17 — Zeit und Personal
**Punkte:** Z-5 bis Z-14, Z-3.
Reihenfolge: (a) Z-6, Z-7 Korrekturantrag kann anlegen und löschen; „Monat abschließen“
zeigt vorher, was offen ist. (b) Z-8 „Krank ab Mittag“ (stundenweise Krankmeldung),
Z-9 Büro trägt Sonderurlaub/Pflegefreistellung/unbezahlten Urlaub für eine Person ein,
Anlässe je Betrieb erweiterbar. (c) Z-5 Wiedereintritt als zweites Dienstverhältnis mit
eigenem Beginn. (d) Z-13 Personalnummer und Zeitkontostand in der Lohn-Datei.
(e) Z-12 Vorwarnung vor Verjährung, Z-10 Umrechnung des Resturlaubs — **nach Auskunft
der Kanzlei** (K-3). (f) Z-3 Auszahlung von Überstunden als Abgang im Zeitkonto,
(g) Z-11 Arbeitsjahr je Person — beide groß, je eigene Entscheidung (E-Z3, E-Z11).
**Bleibt gleich:** abgeschlossene Monate und genehmigte Anträge werden nicht neu
gerechnet; `zeitkontoSaldo.test.ts`. **Aufwand:** (a)–(d) 8–10 Tage; (e) 3; (f) 5–7;
(g) 6–8.

#### Paket 18 — Auftragskette
**Punkte:** A-2, A-5 bis A-11, A-13 bis A-15, P-12.
(a) A-2 Fassungsprüfung in Baustellen- und Kundenakte (wie P1 im Einsatzformular):
gespeichert werden nur geänderte Felder gegen den gelesenen Stand. (b) A-6, P-12
Abschluss nennt offene Angebote und kommende Termine. (c) A-5 Empfänger des versendeten
Angebots einfrieren. (d) A-7 Nachlass im Angebotsformular. (e) A-8, A-9 Texte und
Bedingungen des Angebots je Betrieb; AGB/Rücktrittsbelehrung auf der Annahmeseite
(K-4). (f) A-10 lesende Funktion „Leistungsumfang ohne Preise“ für den Monteur.
(g) A-11 Liegenschafts-Vorschläge in Eingang und Angebot. (h) A-13 Verwaltung schreibt
Angebote (E-A13). (i) A-14, A-15.
**Aufwand:** 12–14 Tage in vier PRs.

#### Paket 19 — Planung: aktuell, vollständig, auch ohne Netz
**Punkte:** P-4, L-7, P-6, P-7, P-8, P-9, P-11.
(a) L-7 Datenbankfunktionen melden den betroffenen Live-Listen (Tabellenname genügt);
P-4 der offene Plan hält Abwesenheiten, Termine, Baustellen aktuell, `einsatz_speichern`
warnt bei Abwesenheit. (b) P-6 Termine kennen Abwesenheiten. (c) P-7 Push für den
„nächsten Arbeitstag der Person“. (d) P-8 die eigenen Einsätze von heute und morgen
liegen auf dem Gerät (nur die eigenen; beim Abmelden gelöscht). (e) P-9 „Stunden ohne
Buchung“ über alle Scheine aus der Datenbank, auch auf der Startseite.
**Aufwand:** 8–10 Tage.

#### Paket 20 — Geld: Rücknahme, Gutschrift, Festschreiben, Konditionen
**Punkte:** G-3, G-7 bis G-13, G-17.
(a) G-7 Mahnung zurücknehmen (als Vorgang im Verlauf, Stufe und Spesen fallen zurück).
(b) G-8 offene Mahnkosten bleiben sichtbar. (c) G-11 Zahlungsziel, Skonto, Nachlass je
Kunde als Vorgabe. (d) G-10 Stufe 1: Schlussrechnung mit Guthaben; Stufe 2: Gutschrift
als Beleg. (e) G-9 Export merkt sich den übergebenen Zeitraum; spätere Änderungen
erscheinen als „Nachtrag zum Zeitraum“. (f) G-3 Rücklass — **nach Auskunft der Kanzlei**.
(g) G-12 Nummernschema einstellbar (E-G12). (h) G-13 Einnahmen-Ausgaben-Rechner und
Istbesteuerung (E-G13, K-1).
**Aufwand:** (a)–(c) 6–7 Tage; (d) 2 + 6; (e) 4–6; (f)–(h) nach Entscheidung.

#### Paket 21 — Material: Preise, Verbrauch, Fahrzeug, Bestellung
**Punkte:** M-5, M-6, M-7, M-9.
(a) M-5 nach einem Preisupdate schlägt der Probelauf neue Verkaufspreise vor (Aufschlag
je Warengruppe), übernommen wird nach Bestätigung. (b) M-6 der Verbrauch wird nach der
Unterschrift angeboten; das Lager zählt „Verbrauch offen“. (c) M-7 mehrere Personen je
Fahrzeug (E-M7). (d) M-9 Bestellung als Beleg mit Nummer, Stand, Lieferort; Versand über
„Belege per Mail“ (F16).
**Aufwand:** (a) 3–4; (b) 3; (c) 4–5; (d) 8–10.

#### Paket 22 — Plattform, Datenschutz, Härtung
**Punkte:** S-3, S-4, S-7, S-8, S-11, S-12.
S-3 Löschen eines Betriebs lässt sich fortsetzen (übrig gebliebene Kennungen stehen im
Protokoll); S-4 Notzugang und Einblick erscheinen auf der Startseite der Leitung und als
Push; S-7 Speicherregel an den Ersteller gebunden; S-8 als Grenze benennen, Maske nennt
den Ausweg; S-11 CSP auf die eigene Instanz; S-12 Bericht nach „Person löschen“
vollständig. **Aufwand:** 5–6 Tage.

### Stufe E — Technik

#### Paket 23 — Auslieferung
**Punkte:** L-8, L-9, L-10, L-15, S-9.
Nach dem Deploy prüft ein Schritt `/fassung.txt` gegen den Commit; Rücksprung über
Firebase beschrieben und geprobt; Bau in „Typen, Lint und Tests“ bei jedem PR; Node 22
und feste Werkzeugfassungen überall; Wächter für die Reihenfolge der Migrationen;
`npm ci --ignore-scripts` im Auftrag mit den Zugangsdaten.
**Aufwand:** 2–3 Tage. **Kann jederzeit vorgezogen werden.**

#### Paket 24 — Prüfungen und Ordnung
**Punkte:** L-11, L-13, L-14, L-16, L-5, Abschnitt 3.8.
Geldwege des Büros und das Tablet auch in WebKit; die fünf trägen Prüfungen nach der
gemessenen Ursache berichtigt (nicht die Frist erhöhen); toter Code entfernt (mit Beleg
je Stelle); Grenzen-Dokument auf den Stand dieser Durchsicht.
**Aufwand:** 4–5 Tage.

#### Paket 25 — Skalierung
**Punkte:** L-3, L-4, L-6, P-3, G-15, Z-16, L-12 (Rest).
Akten holen Rechnungsköpfe statt ganzer Rechnungen; Planung und Startseite lesen
Baustellen über eine Auswahlfunktion statt „höchstens 500“; Nachkalkulation über alle
Baustellen mit dem Kostensatz „gültig ab“; Liste der Seiten über dem Budget B3 aktuell
und je Seite abgearbeitet; Leistungsbudget nach dem Zerlegen von `InvoicesView` neu
gesetzt (nur nach Messung).
**Aufwand:** 8–10 Tage.

### Später: wie eine eingebaute App (nach Stufe C)
Ideen mit eigenem Nutzen, aber ohne Dringlichkeit; je einzeln entscheidbar
(`analyse/9` §5, `10` §5): Kontextmenü an Zeilen (langes Drücken, Rechtsklick;
D1-I13, D2-I6), Blatt in zwei Höhen (D1-I12), Zahl am App-Zeichen (D1-I7), Startbild
für iOS (D1-I6), Timer-Leiste „bereit“ auf allen Seiten des Monteurs (D1-I1, Vorbehalt:
58 px dauerhaft), Fenster mit Pfeil auf/ab weiterblättern (D2-I8), Zustand nach
Rückkehr behalten (D1-I10), Reihenfolge der Kennzahlen ziehen (D4-I7), Manifest und
Hinweis „Quer halten“ (D1-I8).

---

## 8. Entscheidungen des Auftraggebers

**Entschieden am 23.11.2026: alle fünfzehn Punkte wie empfohlen** (Wortlaut: „alles wie
von dir empfohlen, aber noch nicht mit der umsetzung starten“). Die Spalte „Entschieden“
hält fest, was damit gilt. **Das ist noch kein Startsignal** (Grundsatz 5): gebaut wird
erst auf Ansage, und erst nach der unabhängigen Gegenprüfung des Plans (Abschnitt 11).
E-G13 bleibt bis zum Gespräch mit der Kanzlei offen — so lautete die Empfehlung.

| Nr. | Frage | Entschieden (= Empfehlung) |
|---|---|---|
| E-R | Reihenfolge A → B → C → D, E begleitend? | ja; Paket 1 sofort |
| E-T | Textregel (Abschnitt 5) in `style.md` aufnehmen; Untertitel der Seitenköpfe in die Hilfe? | ja |
| E-P | Punktregel (Abschnitt 6) in `style.md` aufnehmen; Wächter „höchstens ein Punkt je Zeile“? | ja |
| E-D | Anrede überall „du“ (heute im Kontoauszug „Ihrer“)? | ja |
| E-N | „Neu in dieser Liste“: runder Kreis (E76) bleibt in Listen; im Fenster neben einer gefüllten Hauptaktion gerahmt (U4)? | ja |
| E-E | Einstellungen: ein Speichermodell (Speicherleiste je Seite; sofort nur Module und Mein Konto)? | ja |
| E-M | Monatsansicht am Tablet: Tag öffnet das Tag-Fenster statt Tastflächen unter 44 px? | ja |
| E-S | Supportzugang: sollen Scheine und Auftragseingänge im Einblick sichtbar sein? | „Nur ansehen“: ja, wie Baustellen; sonst als Grenze benennen |
| E-A13 | Darf die Verwaltung Angebote schreiben (Führung gibt frei)? | als Einstellung je Betrieb |
| E-M7 | Mehrere Personen je Fahrzeug? | ja |
| E-G12 | Nummernschema der Rechnung einstellbar (durchlaufend, Startwert)? | ja, nur für künftige Nummern |
| E-G13 | Einnahmen-Ausgaben-Rechner und Istbesteuerung unterstützen? | erst nach Gespräch mit der Kanzlei |
| E-Z3 | Auszahlung von Überstunden als Abgang im Zeitkonto bauen? | ja (größter Punkt in Zeit) |
| E-Z11 | Arbeitsjahr je Person als Urlaubsjahr? | ja, als Einstellung je Betrieb |
| E-Z14 | „Wegzeit zählt als Arbeitszeit“ als Einstellung je Betrieb? | ja |

**Neu aus der Vermessung, noch offen** (nach den fünfzehn Entscheidungen dazugekommen):

| Nr. | Frage | Empfehlung |
|---|---|---|
| E-V1 | Je Schriftstufe eine feste Zeilenhöhe im Fließtext (V-B1)? E97 hatte das offen gelassen | ja, als eigener Schritt in Paket 6 mit Bildvergleich aller Seiten |
| E-V2 | Titelskala nach Rollen (V-B2): Seite 30/28, Fenster 20, Blatt 18, Gruppe 16? | ja; 17 px in Planung und Arbeitstag erst nach Messung |
| E-V3 | Gemessenes in Begleitzeilen in Mono (V-B3): Nummern und Zeiten ja — Datum in Meta-Zeilen auch? | Nummern und Zeiten ja; Datum in Meta-Zeilen bleibt DM Sans |

## 9. Fragen an Kanzlei und Steuerberatung

| Nr. | Frage | Betrifft |
|---|---|---|
| K-1 | BMD-Importtest: Kassakonto und Buchungssatz für Bar/Karte; Anzahlungssteuer; Einnahmen-Ausgaben-Rechner | G-4, G-13 |
| K-2 | Haft- und Deckungsrücklass: Bemessung nach Teilrechnungen, Fälligkeit mit der Schlussrechnung | G-3 |
| K-3 | Urlaub: Umrechnung bei Wechsel der Arbeitstage; Hinweispflicht vor Verjährung (die Fundstellen im Papier stammen aus dem Gedächtnis des Agenten) | Z-10, Z-12 |
| K-4 | Annahme über den Link gegenüber Verbrauchern: AGB, Rücktrittsbelehrung | A-9 |

## 10. Was diese Durchsicht nicht geleistet hat

- **Nichts lief gegen den vollen Datenbankstapel oder ein echtes Gerät.** Nachgestellt
  sind die mit ◆ markierten Befunde; alle anderen sind aus dem Code gelesen bzw. in der
  Vorschau mit Beispieldaten gemessen. Deshalb Regel 1 in Abschnitt 2.
- **In der Vorschau nicht erreichbar** (nur im Code gelesen): leerer Betrieb, zweiter
  Faktor einrichten, Mein Fahrzeug, Zählliste am Handy, Korrekturantrag als Blatt,
  Anhang und Kamera, Verbindungsband, „Neue Fassung“-Leiste, mehrere Rechnungsdialoge
  (Klärung, Bankgarantie, Stornorechnung, Rückzahlung), Lieferantenvergleich, Retoure-
  Fenster, Teile der Plattform. Paket 9 schließt diese Lücke.
- **Nicht angesehen im Code** (je Papier, letzter Abschnitt): DATANORM-Leser im
  Einzelnen, XML-Schreiber der E-Rechnung, PDF-Gestaltung und gedruckte Pflichtangaben,
  `public/sw.js`, `daten-ausleitung`, `konto-umstellen`, `betrieb-anlegen` über die
  Eingangsprüfung hinaus, Zuschläge und Überstunden gegen den Kollektivvertrag,
  `package-lock.json` auf bekannte Schwächen.
- **Breiten:** 375 px, Querformat und echte Sicherheitszonen des iPhone sind nicht
  geprüft; der dunkle Satz von den vier Bereichs-Agenten nur an ausgewählten
  Ansichten (die Vermessung in `analyse/8` deckt ihn breiter ab).
- Die Zahlen der Tipps sind gezählt, nicht am Gerät gestoppt.
