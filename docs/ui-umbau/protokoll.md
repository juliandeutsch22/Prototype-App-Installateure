# Senklot – Umbauprotokoll: Oberfläche auf die Designlinie „Lot“

**Fassung:** 1.0 · **Grundlage:** Entwurf `senklot-designlinie-v2.html` (Leitfaden „Lot“, elf Regeln, Bausteine, Beispielansichten)
**Ersetzt:** `Senklot_Arbeitsauftrag_UI-Umbau_Designlinie.md` vollständig.
**Ausführung:** Claude Code, Schritt für Schritt nach diesem Protokoll. Freigaben erteilt der Betreiber.

> **Hinweis:** Designlinie und Protokoll sind ein KI-Vorschlag; Fehler sind möglich. Wo dieses Protokoll und der tatsächliche Code nicht zusammenpassen, gilt: **anhalten, Abweichung beschreiben, nachfragen** – nicht raten.

---

## Inhalt

0. Ziel, Grundsätze, Haltepunkte
1. Voraussetzungen (vor jeder Codeänderung)
2. Phase A – Bestandsaufnahme
3. Phase B – Mengengerüst und Messbasis
4. Phase C – Bausteine
5. Phase D – Hülle und Navigation
6. Phase E – Seiten (Reihenfolge, Vorgaben je Seite)
7. Regeln für viele Daten
8. Abnahme je Schritt (Definition of Done)
9. Einführung, Rückbau, Kommunikation
10. Endabnahme
11. Danach: „Tag buchen“ (eigene Funktion)
12. Anhänge: Dateiformate, Prüflisten, Vorlagen

---

## 0. Ziel, Grundsätze, Haltepunkte

**Ziel:** Die Oberfläche wird in allen Ansichten (Schreibtisch, Tablet, Handy) einheitlich, ruhig und auch mit vielen Daten übersichtlich. **Funktionen, Rechte, Berechnungen, Belege und Exporte bleiben exakt gleich. Nichts geht verloren.**

### 0.1 Verbindliche Grundsätze

1. **Reine Darstellungsänderung.** Nicht verändert werden:
   - Datenbank, Migrationen, Zeilenschutz (RLS), Serverfunktionen, Zeitpläne, Webhooks
   - Berechnungen: Stunden, Salden, Urlaub, Zuschläge, Rechnungssummen, Skonto, Rücklass, Zinsen, Nachkalkulation
   - Belege und Exporte: PDF-Rechnungen, Stornorechnungen, Scheine, Stundennachweise, Ausgangsbuch, BMD-Stapel, Lohn-CSV, Belegarchiv
   - Rechte: Keine Rolle sieht oder darf danach mehr oder weniger als vorher
   - Wortlaut der Datenbank-Fehlermeldungen
   - Bestehende Adressen (Routen): bleiben gültig; neue nur zusätzlich oder mit Weiterleitung
2. **Nichts geht verloren.** Jedes heutige Element (Knopf, Link, Menüpunkt, Feld, Auswahl samt Einträgen, Schalter, Reiter, Filter, Zähler, Hinweis, Warnung, ⋯-Eintrag) ist danach erreichbar – höchstens **einen** zusätzlichen Klick entfernt. Wegfallen darf nichts im Umbau; Vorschläge dazu gehen gesondert an den Betreiber.
3. **Gemessen, nicht vermutet.** Vorher und nachher mit denselben Werkzeugen erfassen und vergleichen.
4. **Schritt für Schritt, jeder Schritt rückbaubar.**
5. **Nichts verschlimmbessern.** Keine Nebenbei-Änderungen, keine neuen Funktionen im Umbau.

### 0.2 Gestaltungs- und CSS-Vorgaben

- Keine Emojis. Symbole nur in der Navigation. Keine halbtransparenten bunten Farbflächen (der neutrale Schleier hinter Seitenfenstern ist erlaubt). Keine strichlierten Linien.
- **Heller Modus ist Standard**, unabhängig von der Systemeinstellung; der dunkle Modus nur auf ausdrückliche Wahl.
- Pro Element genau eine Klasse; gemeinsame Muster als Bausteine; keine `clamp()`/`calc()`; keine Container-Queries oder -Einheiten; Media-Queries nur auf die Bildschirmbreite; keine positionsabhängigen Selektoren (`nth-child()` u. ä.).
- Rollenbezeichnungen wie in der Rollenauswahl („Administrator“, „Projektleiter“).

### 0.3 Haltepunkte (sofort anhalten und nachfragen)

- Eine Änderung würde Datenbank, Rechte, Berechnung, Beleg oder Export berühren.
- Ein Element der Bestandsliste lässt sich keinem neuen Ort zuordnen.
- Eine bestehende Prüfung schlägt fehl und lässt sich nicht ohne Änderung der Funktion beheben.
- Eine Vorgabe dieses Protokolls widerspricht dem Handbuch oder dem Code.
- Ein Mengengerüst-Budget (Abschnitt 3) wird verfehlt.
- Unklar ist, ob etwas Darstellung oder Funktion ist.

---

## 1. Voraussetzungen (vor jeder Codeänderung)

| Nr. | Voraussetzung | Nachweis |
|---|---|---|
| V1 | Eigener Arbeitszweig `ui-lot`; Hauptzweig unverändert lauffähig | Zweig vorhanden |
| V2 | Ausgangsstand markiert (Tag `vor-ui-lot`) | Tag vorhanden |
| V3 | Alle bestehenden Prüfungen und Browser-Wege grün auf dem Ausgangsstand | Prüflauf mit Zahl der Prüfungen |
| V4 | Schalter „neue Oberfläche“ je Betrieb vorbereitet (Plattform-Einstellung, ab Werk aus) | Schalter wirkt nur auf Darstellung |
| V5 | Testbetrieb mit festem Testbestand (Abschnitt 3) im Vorschau-Projekt | Testbetrieb angelegt |
| V6 | Entwurf `senklot-designlinie-v2.html` im Repository unter `docs/design/` | Datei vorhanden |
| V7 | Fehlerprotokoll der Plattform leer bzw. bekannt (Ausgangswert notiert) | Notiz in `docs/ui-umbau/ausgang.md` |

---

## 2. Phase A – Bestandsaufnahme

**A1 – Bestandsskript.** Ein Browser-Skript (Chromium) meldet sich nacheinander mit jeder Rolle an und besucht jede erreichbare Seite in drei Breiten (390 × 844, 834 × 1112, 1440 × 900):
- Rollen: Mitarbeiter, Lehrling (unter 18), Verwaltung ohne Freigaben, Verwaltung mit allen Freigaben, Buchhaltung, Projektleiter ohne und mit Freigaben, Geschäftsführung, Administrator, globaler Admin, Supportmodus „ansehen“ und „mitarbeiten“.
- Je Seite: alle Reiter, Filter, aufklappbaren Bereiche, ⋯-Menüs, Dialoge und Seitenfenster öffnen (ohne zu speichern) und darin ebenfalls erfassen.

**A2 – Erfasst wird je Element:** Seite, Rolle, Breite, Art, sichtbarer Text, Beschriftung für Screenreader, Ziel (Adresse oder Aktion), Zustand (aktiv, gesperrt, ausgeblendet), Klickweg von der Seite aus. Format: Anhang 12.1. Ergebnis: `docs/ui-umbau/bestand.json`.

**A3 – Bildschirmfotos** je Seite, Rolle und Breite: `docs/ui-umbau/vorher/`.

**A4 – Referenzdateien für Belege und Exporte** aus dem Testbestand: alle PDFs, Ausgangsbuch, BMD-Stapel, Lohn-CSV, Belegarchiv; mit Prüfsummen in `docs/ui-umbau/referenz.json`.

**A5 – Wege- und Prüfliste:** alle bestehenden Browser-Wege und automatischen Prüfungen mit Anzahl; dazu die „Woche im Zeitraffer“ als durchgehender Weg.

**Abnahme A:** Bestandsliste vollständig (jede Seite jeder Rolle in jeder Breite), Bildschirmfotos und Referenzen vorhanden, Betreiber hat die Liste gesehen.

---

## 3. Phase B – Mengengerüst und Messbasis

**B1 – Testbestand „fünf Jahre Betrieb“** (per Skript erzeugbar, nur im Vorschau-Projekt):

| Gegenstand | Menge |
|---|---|
| Mitarbeiter (alle Rollen, davon 3 Lehrlinge, 1 unter 18) | 25 |
| Kunden | 1.500 |
| Baustellen (davon 40 laufend) | 3.000 |
| Angebote | 4.000 |
| Einsätze | 20.000 |
| Zeitbuchungen | 150.000 |
| Scheine | 15.000 |
| Rechnungen (inkl. Anzahlung, Schluss, Storno) | 12.000 |
| Zahlungen | 14.000 |
| Anforderungen (davon 40 offen) | 30.000 |
| Lagerartikel / Katalogartikel | 800 / 40.000 |
| Lagerbewegungen | 60.000 |
| Wartungen | 1.200 |
| Urlaubs- und Abwesenheitsanträge | 3.000 |

**B2 – Messbasis vorher** mit dem Testbestand: Ladezeit je Seite, Zahl der Anfragen, übertragene Datenmenge (Handy-Profil: gedrosselt auf 4G, mittlere CPU).

**B3 – Budgets nachher** (je Seite, Handy-Profil):
- erste sinnvolle Anzeige ≤ 1,5 s, bedienbar ≤ 2,5 s;
- Listen laden höchstens 50 Einträge je Anfrage, weitere seitenweise vom Server;
- keine Seite lädt einen ganzen Bestand (etwa alle Anforderungen) in den Browser;
- nicht langsamer als die Messbasis vorher.

**Abnahme B:** Testbestand erzeugt und dokumentiert, Messbasis vorher notiert in `docs/ui-umbau/messung-vorher.md`.

---

## 4. Phase C – Bausteine

Zentral anlegen, **noch keine Seite umstellen**:

1. **Grundwerte:** Farben (Papier, Fläche, Tinte, Grau, Linie, Linie stark, Petrol, Petrol tief, Petrol hell, Navigation, Bernstein für Achtung, Rot für Fehler, Abwesend), Schriftgrade 26/18/15/13 px, zwei Stärken (400/600), Abstände 4/8/16/24/40, Radien 8/12, Tippflächen ≥ 44 px (Handy ≥ 48 px für Hauptaktionen), heller und dunkler Satz.
2. **Bausteine** (je mit Beispielen auf einer internen Musterseite `/_muster`, nur für Administrator und globalen Admin sichtbar):
   - Seitenkopf (Ortszeile, Titel, ⋯, Hauptaktion; am Handy Hauptaktion im Daumenbereich)
   - Gruppe (Fläche mit Kopf, Linien statt Karten)
   - Zeile (ganz antippbar; Titel, Nebeninfo, Wert rechtsbündig, Status)
   - Arbeitszeile (Auswahlkästchen, antippbarer Inhalt, genau ein Knopf für den nächsten Schritt)
   - Sammelleiste (Zahl der Auswahl, eine Sammelaktion, „Auswahl aufheben“)
   - „und N weitere anzeigen“ (lädt seitenweise nach)
   - Status (offen, läuft, erledigt, Achtung, Fehler)
   - Kennzahlen (höchstens vier, antippbar)
   - Auswahl (Segmente, auch als Reiter)
   - Kurzzeile zum Aufklappen (Akten)
   - Lot-Verlauf (Akten und Seitenfenster)
   - Raster (Planung, Mitarbeiterübersicht) mit stehender erster Spalte und Kopfzeile
   - Seitenfenster (Schreibtisch, Tablet) bzw. Blatt von unten (Handy)
   - Suchfenster (Strg + K)
   - Meldung mit „Rückgängig“
   - Bestätigungsdialog (nur für Unumkehrbares)
   - Formularfeld, Feldpaar, „Weitere Angaben“
   - Leerer Zustand
   - Hilfe-Zugang „Hilfe zu dieser Seite“
3. **Bedienbarkeit je Baustein:** Tastatur vollständig, sichtbarer Fokus, Beschriftungen für Screenreader, Kontrast WCAG 2.1 AA (Text ≥ 4,5:1, große Schrift und Bedienelemente ≥ 3:1), Seitenfenster und Dialoge halten den Fokus und schließen mit Esc.
4. **Prüfungen je Baustein:** Darstellung in drei Breiten, Tastaturbedienung, „Rückgängig“ stellt den Zustand exakt wieder her.

**Abnahme C:** Musterseite vollständig, Bausteinprüfungen grün, **alle bestehenden Prüfungen grün, Oberfläche der App unverändert.**

---

## 5. Phase D – Hülle und Navigation

- **Schreibtisch (ab 1.200 px):** Seitenleiste mit Gruppen (Start; Aufträge; Geld; Team; Material; Einstellungen und Leitfaden unten), Suche oben, Zähler nur bei Handlungsbedarf.
- **Tablet (760–1.199 px):** schmale Leiste mit Symbol und Kurztext.
- **Handy (bis 759 px):** untere Leiste mit fünf Zielen je Rolle und „Mehr“ als Blatt von unten; „Mehr“ ist markiert, wenn die aktuelle Seite dort liegt.
- **Je Rolle exakt die bisherigen Menüpunkte**, nur gruppiert. Zähler zeigen dieselben Zahlen wie vorher (Prüfung je Rolle).
- **Suchen oder springen** (Strg + K) zusätzlich, kein Ersatz für einen bisherigen Weg.

**Abnahme D:** Abschnitt 8 vollständig für die Hülle; Zuordnung aller Menüpunkte je Rolle in `zuordnung.json`.

---

## 6. Phase E – Seiten

Jede Seite ist ein eigener Schritt mit eigener Abnahme (Abschnitt 8) und eigenem Rückbaustand. Reihenfolge verbindlich.

### E1 – Startseiten je Rolle
Kennzahlen (höchstens vier, antippbar), „Zu erledigen“ nach Dringlichkeit (höchstens 3 je Thema, dann „und N weitere“), „Heute“. Leere Startseite: „Heute liegt nichts an“. Alle bisherigen Karten und Hinweise je Rolle zugeordnet.

### E2 – Planung (Tag planen und Wochenplan werden eine Seite)
- **Kopf:** groß „Diese Woche“, „Nächste Woche“, „Letzte Woche“, sonst der Zeitraum („19. – 23. Oktober“); klein darunter „KW 42“ (bei relativen Wochen mit Zeitraum). Jahreszahl nur, wenn nicht das laufende Jahr. Monatsansicht: „Oktober“, klein das Jahr.
- **Umschalter:** „Woche | Monat“ und (nur in der Woche) „Personen | Baustellen“. Woche ist Standard.
- **Woche:** Raster Personen × Tage (Handy: Tagesplan mit Tagauswahl); Einsätze als Blöcke mit Uhrzeit; Abwesenheiten grau; Konflikte (eingeplant und abwesend, unbesetzt) bernsteinfarben; je Tag „x frei“.
- **Planen und Bearbeiten im Seitenfenster** (Handy: Blatt von unten) mit vorbelegtem Tag und Person; Personenliste mit „frei“, „schon: …“, abwesend ausgegraut; **„Einsatz löschen“** beim Bearbeiten mit „Rückgängig“.
- **„Noch einzuplanen“** als Ablage (Baustellen ohne Einsatz, fällige Wartungen, Termine); Ziehen auf einen Tag nur am Schreibtisch, überall antippen.
- **Monat:** je Person und Tag eingeplant, abwesend, frei; Wochenenden und Feiertage markiert; laufende Baustellen als Balken; ein Tag springt in die Woche. Handy: Listen „Diesen Monat abwesend“ und „Baustellen diesen Monat“.
- **Viele Daten:** Personen nach Team bzw. Einstufung gruppiert und einklappbar; Filter „nur mit Einsätzen“ bzw. „nur freie“; erste Spalte und Kopfzeile stehen beim Scrollen; Baustellen-Sicht zeigt nur in der Woche laufende Baustellen.
- **Erhalten bleiben vollständig:** Uhrzeit, mehrere Personen, Einstufung, Aufgabe, Rüstliste samt freier Menge, Fehlmenge und „Anforderung über … anlegen“, Termine und Aviso, Abwesenheiten mit den bisherigen Sichtbarkeiten (Krankenstand für Planende nur „abwesend“), Feiertagslogik, Team-Woche für Monteure, alle bisherigen Hinweise.

### E3 – Lager
- Reiter „Bestand | Katalog“. Bestand: Zeile mit „x frei · y reserviert“, Status nur bei „knapp“ oder „fehlt“; Filter „Alle · knapp · fehlt“; Suche.
- Hauptaktion „Wareneingang“; Inventur, Katalog einspielen, Mindestmengen, Materialaufschlag im ⋯-Menü.
- Artikel im Seitenfenster: Kennzahlen (im Lager, reserviert, frei, Mindestmenge), Bewegungsprotokoll als Lot, alle bisherigen Aktionen.
- Katalog: Suche über alle Katalogartikel (seitenweise), „Im Lager führen“ als nächster Schritt.

### E4 – Anforderungen (Arbeitsliste)
- Reiter „Laufend | Einkauf | Retouren | Erledigt“ plus Suche.
- Laufend: Gruppen „Offen“, „In Bearbeitung“, „Abholbereit“; Eilt zuerst, dann nach Datum.
- **Arbeitszeile:** Auswahlkästchen, antippbarer Inhalt (öffnet das Seitenfenster mit Verlauf als Lot, Notiz und **allen** Aktionen: nächster Schritt, „Nicht auf Lager – auf die Einkaufsliste“, „Zurück auf ‚Offen‘“, „Als eilig markieren“, „Anforderung löschen“ mit Bestätigung), genau ein Knopf für den häufigsten nächsten Schritt.
- **Sammelaktion:** Auswahl mehrerer Zeilen, „Alle: nächster Schritt“; wird für jede Anforderung einzeln mit **derselben Serverfunktion** ausgeführt wie die Einzelaktion; Teilfehler werden je Zeile gemeldet; „Rückgängig“ für alle erfolgreichen.
- Gruppen höchstens 20 Zeilen, dann „und N weitere anzeigen“ (seitenweise vom Server).
- Einkauf: Gruppe je Großhändler mit „Bestellung senden“ (PDF und E-Mail wie heute) und „Als bestellt markieren“; Lieferung wie heute.
- Erledigt: Abgeholtes erscheint nach 14 Tagen hier – **reine Ansicht, keine Daten werden geändert oder gelöscht**; Suche.

### E5 – Material anfordern (Monteur)
Baustelle und Katalogsuche oben, Artikel mit Minus und Plus, Warenkorb als feste Leiste im Daumenbereich („3 Artikel für … – Anfordern“), darunter „Meine Anforderungen“ mit Status; Eilzustellung, freie Zeile und alle bisherigen Angaben erhalten.

### E6 – Weitere Listen
Rechnungen, Angebote, Baustellen, Kunden, Wartungen, Scheine, Benutzer: Zeile, Filter als Segmente, Suche, Arbeitsstand als Standard, „und N weitere“.

### E7 – Akten
Baustelle (Verlauf als Lot, Kurzzeilen, Kennzahlen), Kunde, Benutzer, Angebot, Anlage (Wartungen als Lot): Sprungleiste (Schreibtisch links, Tablet und Handy waagrecht mitlaufend).

### E8 – Formulare
Zeiterfassung, Schein (am Handy als Schrittfolge mit Kundenmodus), Urlaub und Anträge (Antrag mit Lot; Genehmigende sehen die Monatsansicht daneben), Rechnung erstellen, Angebot, Termin: einspaltig, Beschriftung oben, Seltenes unter „Weitere Angaben“, Hinweise höchstens eine Zeile.

### E9 – Mitarbeiterübersicht, Nachkalkulation, Einstellungen, Plattform
- Mitarbeiterübersicht als Raster (Ist gegen Soll je Tag; fehlende Tage mit Bernstein-Rand; Seitenfenster „Zeit erfassen“); Karten Arbeitszeitgrenzen und Projektauswertung erhalten.
- Nachkalkulation: Kennzahlen, Zeilen je Baustelle.
- Einstellungen: eine Seite mit Abschnitten, Suche und „Einrichtungsstand“; **alle bisherigen Reiter-Inhalte vollständig**.
- Plattform: Betriebe als Liste, Protokoll als Lot; alle Abläufe (Anlegen, Notzugang, Passwort neu setzen, Deaktivieren, Löschen) unverändert.

---

## 7. Regeln für viele Daten (gelten für jede Liste)

1. **Arbeitsstand als Standard;** Abgeschlossenes im Reiter bzw. Filter „Erledigt“ (nur Ansicht, nichts wird gelöscht).
2. **Gruppen höchstens 20 Zeilen,** dann „und N weitere anzeigen“; Nachladen seitenweise (50) vom Server.
3. **Sortierung nach Dringlichkeit** (überfällig, eilig, heute, diese Woche), dann nach Datum; wahlweise gruppiert nach Baustelle, Person oder Großhändler.
4. **Suche in jeder Liste** (serverseitig) und Strg + K über alles.
5. **Filter in der Adresse,** damit Ansichten als Lesezeichen gespeichert werden können; Rückkehr in eine Liste stellt Filter und Position wieder her.
6. **Sammelaktionen** nur in Arbeitslisten; immer über dieselbe Serverfunktion wie die Einzelaktion.
7. **Zähler zählen nur Handlungsbedarf,** nie den Gesamtbestand.

---

## 8. Abnahme je Schritt (Definition of Done)

Ein Schritt ist erst fertig, wenn **alle** Punkte erfüllt und in `docs/ui-umbau/abnahme/<schritt>.md` (Vorlage Anhang 12.3) belegt sind:

1. **Bestandsvergleich:** Das Bestandsskript läuft erneut. Jedes alte Element ist in `zuordnung.json` (Anhang 12.2) einem neuen Ort zugeordnet; Klickweg höchstens um 1 länger. **Ein Element ohne Zuordnung = nicht bestanden.**
2. **Rechte unverändert:** je Rolle dieselbe Menge an Elementen und Aktionen (abgesehen von Umgruppierung); zusätzlich Gegenproben über die Schnittstelle für die betroffenen Aktionen.
3. **Alle Prüfungen grün:** alle automatischen Prüfungen, alle Browser-Wege in Chromium **und** WebKit, „Woche im Zeitraffer“.
4. **Drei Breiten:** 390 px, 834 px (hoch und quer), 1.440 px – kein seitliches Überlaufen, keine abgeschnittenen Beschriftungen, Tippflächen ≥ 44 px, Hauptaktion am Handy im Daumenbereich ohne ein Feld zu verdecken, Navigation je Breite wie in Abschnitt 5.
5. **Belege und Exporte unverändert:** Erzeugen aus dem Testbestand, Prüfsummen gleich der Referenz (Abschnitt 2, A4).
6. **Mengengerüst:** Budgets aus Abschnitt 3 eingehalten; Messwerte im Abnahmeblatt.
7. **Bedienbarkeit:** Tastatur, Fokus, Screenreader-Texte, Kontrast (automatische Prüfung, z. B. axe, ohne neue Fehler).
8. **„Rückgängig“ und Bestätigungen:** Umkehrbares mit „Rückgängig“ (stellt exakt wieder her), Unumkehrbares mit Bestätigungsdialog – wie vor dem Umbau oder strenger, nie lockerer.
9. **Fehlerprotokoll:** keine neuen Einträge während der Prüfläufe (insbesondere keine Realtime- oder Ladefehler).
10. **Bildschirmfotos nachher** je Rolle und Breite in `docs/ui-umbau/nachher/`, Vorher-Nachher-Vergleich für den Betreiber.
11. **Dokumentation:** Handbuch und `docs/FUNKTIONEN.md` an neue Orte und Begriffe angepasst; Funktionsbeschreibungen inhaltlich gleich.
12. **Freigabe** durch den Betreiber im Abnahmeblatt.

---

## 9. Einführung, Rückbau, Kommunikation

1. **Schalter je Betrieb:** neue Oberfläche zuerst nur im Testbetrieb, dann im Pilotbetrieb; Rückschalten jederzeit ohne Datenverlust.
2. **Rückbau:** Jeder Seiten-Schritt ist ein eigener Stand mit Tag (`ui-lot-E2` usw.). Fällt eine Abnahme im Pilot durch, wird nur dieser Schritt zurückgeschaltet.
3. **Keine Datenwirkung:** Der Umbau schreibt keine Daten und braucht keine Migration. Taucht doch eine auf: Haltepunkt (0.3).
4. **Pilot-Begleitung:** Vor dem Einschalten eine einseitige Kurzinfo für den Pilotbetrieb („Was ist wo?“, je Rolle), im Handbuch verlinkt. Eine Woche Rückmeldung sammeln, bevor der nächste Schritt eingeschaltet wird.
5. **Rückmeldungen:** über „Problem melden“; jede Meldung mit Seite, Rolle und Breite.

---

## 10. Endabnahme

- Bestandsvergleich über **alle** Seiten, Rollen und Breiten: 0 Elemente ohne Zuordnung.
- Alle Prüfungen, Browser-Wege (Chromium und WebKit), „Woche im Zeitraffer“ grün.
- Belege und Exporte prüfsummengleich zur Referenz.
- Mengengerüst-Budgets auf allen Seiten eingehalten.
- Bedienbarkeit ohne neue Fehler.
- Pilotbetrieb hat mindestens zwei Wochen mit der neuen Oberfläche gearbeitet, ohne offene Rückmeldung der Stufe „hoch“.
- Handbuch, `docs/FUNKTIONEN.md` und Kurzinfo aktuell.
- Freigabe durch den Betreiber; danach Schalter für neue Betriebe standardmäßig an, alte Oberfläche bleibt noch einen Monat umschaltbar.

---

## 11. Danach: „Tag buchen“ (eigene Funktion, eigener Auftrag)

Erst nach der Endabnahme. Das bisherige Formular „Zeit von Hand eintragen“ bleibt vollständig erhalten.
- Die Arbeitszeit beginnt im Betrieb. Vorschlag am Abend: Beginn und Ende aus dem Einsatz (mit Uhrzeit) bzw. dem Tagessoll, Pause nach Regel, Baustelle aus dem Einsatz; ein Tipp bestätigt.
- Zwei oder mehr Baustellen: je Baustelle eine Zeile und ein eigener Zeiteintrag; mit Uhrzeiten geplant → Zeiten übernehmen, Fahrt dazwischen nach Einstellung des Betriebs; ohne Uhrzeiten → nur „Wechsel um“ eingeben; „Baustelle hinzufügen“ für Ungeplantes; Erinnerung an fehlende Scheine je Baustelle.
- Erinnerung, wenn bis zu einer einstellbaren Uhrzeit (Standard 17:00) nicht gebucht wurde. Stempeln nur als Einstellung, nicht Standard.
- Prüfungen wie bisher (Überschneidung, AZG, KJBG); Abnahme mit Vergleich gegen händische Buchung derselben Zeiten.

---

## 12. Anhänge

### 12.1 `bestand.json` – ein Eintrag je Element

```json
{
  "id": "anforderungen.zeile.aktion.aus-lager",
  "seite": "/anforderungen",
  "rolle": "verwaltung",
  "freigaben": ["kunden_pflegen"],
  "breite": 1440,
  "art": "knopf",
  "text": "Aus Lager",
  "aria": "Aus Lager",
  "ziel": "aktion:anforderung_aus_lager",
  "zustand": "aktiv",
  "klickweg": ["Anforderungen", "Laufend", "Zeile"],
  "quelle": "vorher"
}
```

### 12.2 `zuordnung.json` – alt → neu

```json
{
  "alt": "anforderungen.zeile.aktion.aus-lager",
  "neu": "anforderungen.arbeitszeile.schritt",
  "weg_alt": 2,
  "weg_neu": 2,
  "bemerkung": "Häufigster Schritt als Knopf in der Zeile; zusätzlich im Seitenfenster",
  "geprueft": true
}
```

Regel: `weg_neu − weg_alt ≤ 1`; Einträge ohne `neu` sind nicht zulässig.

### 12.3 Abnahmeblatt je Schritt (Vorlage)

```text
Schritt:            E4 – Anforderungen
Stand / Tag:        ui-lot-E4
Bestandsvergleich:  412 Elemente, 412 zugeordnet, 0 offen
Rechte:             je Rolle gleich (Liste angehängt), Gegenproben grün
Prüfungen:          5.6xx automatisch grün · Browser-Wege Chromium/WebKit grün · Zeitraffer grün
Breiten:            390 / 834 hoch / 834 quer / 1440 – ohne Befund
Belege/Exporte:     Prüfsummen gleich
Mengengerüst:       erste Anzeige 1,1 s · bedienbar 1,9 s · 1 Anfrage je 50 Einträge
Bedienbarkeit:      axe ohne neue Fehler · Tastatur vollständig
Rückgängig:         Einzel- und Sammelaktion geprüft
Fehlerprotokoll:    keine neuen Einträge
Bildschirmfotos:    docs/ui-umbau/nachher/E4/
Dokumentation:      Handbuch Abschnitt „Anforderungen“, FUNKTIONEN.md aktualisiert
Freigabe Betreiber: ____________________  Datum: __________
```

### 12.4 Prüfliste „drei Breiten“ (je Seite abhaken)

- [ ] Kein seitliches Überlaufen
- [ ] Keine abgeschnittene Beschriftung, keine Silbentrennung in Nummern, Namen, Beträgen
- [ ] Tippflächen ≥ 44 px (Hauptaktion am Handy ≥ 48 px)
- [ ] Hauptaktion am Handy im Daumenbereich, verdeckt kein Feld
- [ ] Seitenfenster bzw. Blatt öffnet und schließt korrekt (auch mit Esc)
- [ ] Navigation je Breite korrekt, aktueller Punkt markiert
- [ ] Heller Modus Standard; dunkler Modus nur nach Wahl lesbar
- [ ] Mit Mengengerüst übersichtlich (Gruppen ≤ 20, „und N weitere“)

### 12.5 Begriffe

- **Arbeitsstand:** das, woran gerade gearbeitet wird (offen, laufend, diese Woche).
- **Arbeitsliste:** Liste, in der Einträge Schritt für Schritt weitergehen (Anforderungen, Einkauf, Genehmigungen).
- **Lot:** senkrechter Verlauf mit Punkten und einem „jetzt“-Punkt.
- **Seitenfenster / Blatt:** Bearbeitungsbereich rechts (Schreibtisch, Tablet) bzw. von unten (Handy); die Übersicht bleibt dahinter stehen.

---

*Erstellt mit KI-Unterstützung. Fehler sind möglich – im Zweifel an einem Haltepunkt anhalten und nachfragen.*
