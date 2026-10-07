# Abnahme – Paket „rechnungen“ (E6 Liste der Rechnungen, E8 Rechnung erstellen)

```text
Schritt:            E6/E8 – Rechnungen (/invoices: Rechnungsverwaltung und Leseliste der Projektleitung)
Stand / Tag:        Arbeitsbaum des Pakets „rechnungen“ auf ui-lot (Commit siehe Bericht)
Bestandsvergleich:  120 Elemente in docs/ui-umbau/zuordnung-rechnungen.json, 120 zugeordnet, 0 offen;
                    weg_neu − weg_alt ≤ 1 bei jedem Eintrag (vom Erzeuger geprüft).
                    Kein maschinelles Bestandsskript gelaufen (Phase A nicht im Paket) — offen.
Rechte:             je Rolle gleich: Buchhaltung, Geschäftsführung, Administrator wie vorher;
                    Projektleitung mit „Rechnungen lesen“ sieht weiter nur die Leseliste
                    (kein Knopf, der schreibt; Zeilen öffnen nichts). Gegenproben in
                    tests/components/InvoicesView.test.tsx („Die Projektleitung liest nur“)
                    und tests/components/RechnungenLesen.test.tsx. Schnittstellen-Gegenproben: offen
                    (Datenschicht unverändert, keine neuen Aufrufe).
Prüfungen:          tsc grün · lint grün · InvoicesView 207 + RechnungenLesen 4 + lotGrundwerte,
                    reverseChargeKeinSatz, eurozeichen grün (623 Prüfungen in 5 Dateien).
                    Browser-Wege Chromium/WebKit: NICHT gelaufen (Vorgabe des Pakets) — offen.
                    rechnungStellen.spec.ts nachgezogen, nicht ausgeführt. Zeitraffer: offen.
Breiten:            390 / 834 / 1440 in der Vorschau (Port 5214), hell und dunkel:
                    kein seitliches Überlaufen (scrollWidth − innerWidth = 0) für Liste, „Alle“,
                    Seitenfenster, „Neue Rechnung“ mit Vorschau. 834 quer: nicht fotografiert — offen.
                    Leseliste der Projektleitung: in der Vorschau nicht erreichbar (die Vorschau
                    kennt keine Freigabe „Rechnungen lesen“) — nur über Komponententests geprüft.
Belege/Exporte:     keine *.ts der Rechnungen geändert (Summen, PDF, Mahnung, Storno, BMD,
                    Ausgangsbuch, Belegarchiv). Prüfsummen gegen Referenz: nicht erzeugt — offen.
Mengengerüst:       nicht gemessen — offen. Gruppen höchstens 20 Zeilen + „und N weitere anzeigen“;
                    die Liste lädt wie bisher die 50 jüngsten, „Ältere Rechnungen laden“ erweitert.
Bedienbarkeit:      ganze Zeile per Tastatur erreichbar (Knopf im Titel), Seitenfenster mit
                    Fokusfalle und Esc; eine Handlung aus dem Fenster gibt den Fokus dem Dialog
                    (Prüfung mit Gegenprobe). axe: nicht gelaufen — offen.
Rückgängig:         keine neue Rückgängig-Meldung (keine Umkehr ist exakt über dieselbe Funktion);
                    alle Bestätigungen (Storno mit Grund, Stornorechnung, Storno aufheben, Mahnung,
                    Zahlung löschen in zwei Schritten) unverändert.
Fehlerprotokoll:    Vorschau ohne Laufzeitfehler (nur blockierte Schriften der Umgebung).
Bildschirmfotos:    docs/ui-umbau/nachher/rechnungen/ (Rolle Buchhaltung bzw. Geschäftsführung,
                    390/834/1440: Liste, Seitenfenster, Neue Rechnung mit Vorschau)
Dokumentation:      Handbuch und FUNKTIONEN.md NICHT angepasst (gemeinsame Dateien) — offen,
                    siehe Bericht: „Neue Rechnung“ im Seitenkopf, Handlungen im Seitenfenster
                    statt im ⋯, Ansichten Offen/Erledigt/Alle.
Freigabe Betreiber: offen (Entscheidung E5)
```

## Prüfliste „drei Breiten“

- [x] Kein seitliches Überlaufen (390/834/1440, hell und dunkel)
- [x] Keine Silbentrennung in Beträgen — die Beträge der Vorschau-Tabelle stehen jetzt am Stück
      (vorher brach „€ 1 404,00“ am Handy Zeichen für Zeichen)
- [x] Tippflächen ≥ 44 px (Zeilen, Segmente, Knöpfe im Seitenfenster, Felder der Tabelle)
- [x] Hauptaktion „Neue Rechnung“ am Handy im Daumenbereich
- [x] Seitenfenster öffnet und schliesst (Schließen, Esc, Tipp daneben)
- [x] Heller Modus Standard; dunkler Modus lesbar
- [x] Gruppen ≤ 20, „und N weitere anzeigen“
- [ ] 834 quer, WebKit — offen
