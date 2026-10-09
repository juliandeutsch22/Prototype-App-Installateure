# Abnahmeblatt – R4-A Mitarbeiterübersicht

```text
Schritt:            R4-A – Mitarbeiterübersicht (/accounting): Streifen, Woche, Seitenfenster „Person im Monat“
Stand / Tag:        Arbeitsbaum Paket „uebersicht“ (auf ui-lot-r4 e91a3ce), noch nicht zusammengeführt
Bestandsvergleich:  57 Einträge in docs/ui-umbau/r4/zuordnung-uebersicht.json, 0 ohne neuen Ort,
                    kein altes Element mehr als 1 Klick weiter (Monat/Jahr: +1, dafür ‹ › 0).
                    Kein Bestandsskript-Lauf (Hauptsitzung) – Zuordnung von Hand aus dem Code.
Rechte:             unverändert: dieselbe Route, dieselbe Auswahl (fuehrtZeitkonto, aktiv), Art der
                    Abwesenheit so, wie die Datenbank sie liefert; Supportzugang ohne Streifen, ohne
                    Woche, ohne Kennzahlen, ohne Karte „Arbeitszeitgrenzen“ (und ohne deren Abfrage).
Prüfungen:          tsc grün, lint grün; 26 Testdateien / 309 Prüfungen grün (AccountingView,
                    ArbeitszeitGrenzenKarten, ArbeitszeitGrenzenRunde3, TimeForm* (13 Dateien,
                    neu: TimeFormVorbelegungPerson), Fokusfalle, ProjectSummary, LotBausteine,
                    unit: tagesauswertung (neu), r4Referenz, lotGrundwerte, lotRegelnQuelltext,
                    arbeitszeitGrenzen, export, navigation-routen). Browser-Wege, WebKit: offen
                    (Hauptsitzung); kein bestehender Browser-Weg benutzt /accounting.
Breiten:            390 / 834 / 1112 (quer) / 1440 / 1920 in der Vorschau, hell und dunkel –
                    scrollWidth − innerWidth = 0 überall (Monat, Woche, Seitenfenster, Auswahl).
Belege/Exporte:     nicht berührt (export.ts, hoursPdf.ts unverändert); r4Referenz grün.
Mengengerüst:       Tagesauswertung 25 Personen × 31 Tage samt Tooltip-Texten: 11,5 ms (Node).
                    Vorschau (7 Personen, Entwicklungsserver): Liste steht nach 0,6–1,7 s,
                    Seitenfenster öffnet in 80–135 ms (gemessen mit Playwright inkl. Klick).
                    Lauf gegen 25 echte Personen: offen.
Bedienbarkeit:      Felder und Zellen mit aria-label „Person, Tag · Zustand · Stunden · Soll“;
                    je Reihe ein Tabulatorschritt, ← → Pos1 Ende wandern; Esc schliesst das
                    oberste Fenster; axe: offen.
Fehlerprotokoll:    keine Laufzeitfehler (nur 403/404 der gestubbten Ressourcen; die Karte
                    „Arbeitszeitgrenzen“ meldet in der Vorschau „geburtsdaten.get is not a function“
                    – der Stub liefert keine Map, schon vor R4 so, siehe vorher/).
Bildschirmfotos:    docs/ui-umbau/r4/nachher/uebersicht-*.jpg (Buchhaltung, Administrator,
                    Woche, Seitenfenster, dunkel, quer).
Dokumentation:      Handbuch und stand-Datei: offen (gemeinsame Dateien, Hauptsitzung).
Freigabe Betreiber: erteilt (09.10.2026)
```

## Abnahme 3.7

- [x] **Zustand je Person und Tag gleich dem heutigen Raster.** `tests/unit/tagesauswertung.test.ts`
  vergleicht die Herleitung des alten `MonatsRaster.tsx` (wörtlich im Test) Tag für Tag mit
  `tagesauswertung` – 5 Monate (laufend, vergangen, mit Ostermontag, Dezember mit halben Tagen,
  Februar) × 40 zufällige Personen (Teilzeit, eigenes Tagessoll, Eintritt im Monat, ohne Eintritt,
  Krank, Urlaub, ZA, Berufsschule, stundenweise Freistellung, zwei Buchungen, Notdienst am freien Tag).
  Zuordnung: Bernstein-Rand → fehlt; Stunden → gebucht; Kürzel → abwesend; grau leer → frei;
  weiss leer → heute/Zukunft. Gegenproben: eine geänderte Rangfolge macht den Test rot.
- [x] **Gebucht, Soll bisher, Saldo, Gesamtsaldo, Resturlaub zeichengleich.** Zeile und Fenster
  lesen dieselben `stats` mit denselben Formaten (`fmtMin`, `tageZahl`, `vorzeichenTage`, `Gesamtsaldo`);
  `AccountingView.test.tsx` prüft „80:00 von 80:00 Soll bisher“, „00:00“, „Gesamtsaldo seit 17.08.2026:
  +12:30 · darin Start-Saldo +05:00“, „Anspruch angepasst: −6,25 Tage“. Ein Skript gegen den Testbestand: offen.
- [x] **Exporte gleich.** Nicht berührt; `tests/unit/r4Referenz.test.ts` grün.
- [x] **Monat und Jahr über den Titel, auch 2022.** Test „ein Klick auf den Titel öffnet die bisherige
  Auswahl — auch 2022“; ‹ › über den Jahreswechsel lädt das neue Jahr (Test).
- [ ] **25 × 31: Seite ≤ 1,5 s, Fenster ≤ 300 ms.** Nur in der Vorschau mit 7 Personen gemessen
  (Fenster 80–135 ms) und die Auswertung allein (11,5 ms für 25 × 31). Offen: Lauf mit Testbestand.
- [x] **Kein seitliches Scrollen bei 390, 834, 1440** (und 1112, 1920).
- [x] **Supportzugang: kein Streifen, keine Karte „Arbeitszeitgrenzen“** (Tests; dazu keine Kennzahlen,
  keine Woche, keine Grenzprüfung-Abfrage).

## Entscheidungen (Abweichungen vom Auftrag/Entwurf, mit Grund)

1. **Seitenfenster 440 statt 480 px.** `BottomSheet` (gemeinsam) kennt keine Breite; eine eigene Regel
   hätte alle Seitenfenster verändert. Standardbreite genommen.
2. **Fokus beim Öffnen** geht wie bei jedem Seitenfenster auf das Fenster selbst (die Vorlesehilfe nennt
   es), der erste Tabulatorschritt auf „Schließen“; beim Schliessen zurück zum Auslöser. „Fokus auf
   Schließen“ verlangte eine Änderung an `BottomSheet`.
3. **„Darüber: Einstufung · Monat“** steht als erste Zeile IM Fenster unter dem Namen – der Kopf des
   gemeinsamen `BottomSheet` nimmt nur einen Titel.
4. **Wochenfälle der Arbeitszeitgrenzen** (Woche, Wochenruhe, Wochenfreizeit) färben kein Feld: sie
   hängen an sieben Tagen; ein Feld am Montag behauptete einen Tagesverstoss. Sie stehen in der Karte,
   in der Kennzahl und im Fenster der Person. Tagesfälle (Tag, Nacht, Ruhezeit) markieren den Tag.
5. **Summen der Woche** aus denselben Tageswerten, aber mit der Regel der Monatsauswertung: ein
   ganztägig gutgeschriebener Tag (Krank, Urlaub, Berufsschule …) zählt nicht zum Soll, stundenweise
   Freistellung zieht ihre Minuten ab, gerundet einmal am Ende. Nur das Tooltip-Soll zu summieren hätte
   jedem Krankentag −8:00 gegeben. Der Test prüft: über einen Monat summiert = `stats.sollMin`/`istMin`/
   `saldoMin` (auch halbe Tage 24./31.12., eigenes Tagessoll). Zeitausgleich zieht wie im Monat nicht ab.
6. **Woche am Schreibtisch** `210px | 7 Tage | 70 | 76 | 76` statt `230 | … | 76 | 76 | 84`: sonst wurde
   „07:00–15:30“ bei 1.440 px abgeschnitten.
7. **Woche und Monat**: blättert die Woche, folgt der Monat ihrem Donnerstag (wie die Kalenderwoche), damit
   Kennzahlen und Fenster zur gezeigten Woche passen. Ein Tag der Nachbarmonate in der Woche öffnet das
   Fenster ohne Markierung (sein Tagesnachweis gehört zum anderen Monat) – Grenze.
8. **Suche immer sichtbar** (bisher ab 8 Personen) – der Auftrag stellt sie fest in die Steuerung.
9. **Tagesnachweis als Liste** statt Tabelle (440 px Fenster); Marke „ZA“ → „Zeitausgleich“ (Wort).
10. **Die Grenzprüfung startet erst, wenn die Belegschaft geladen ist** – vorher prüfte die Karte zweimal
    (leer, dann voll); jetzt eine Abfrage.
