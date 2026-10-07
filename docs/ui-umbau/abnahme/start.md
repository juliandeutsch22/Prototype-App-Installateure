# Abnahme Paket „start“ — E1 Startseiten, E9 Mitarbeiterübersicht und Nachkalkulation

```text
Schritt:            E1 – Startseiten je Rolle; E9 (Teil) – Mitarbeiterübersicht, Nachkalkulation
Stand / Tag:        Arbeitsbaum agent-a0cab0841892c5b97 auf ui-lot f30424d (Tag offen, setzt die Hauptsitzung)
Bestandsvergleich:  68 Einträge in docs/ui-umbau/zuordnung-start.json, 0 ohne Zuordnung;
                    ein Element einen Klick weiter (Monats-CSV ins ⋯ der Seite), zwei neu (Raster, Kennzahlen Nachkalkulation)
Rechte:             unverändert — keine Bedingung über Rolle, Modul oder Supportzugang geändert
                    (Monats-CSV: weiter nicht im Supportzugang, Test „im Supportzugang gibt es kein Raster …“)
Prüfungen:          176 Unit-/Ansichtstests der Pakettests grün (10 Dateien, siehe unten);
                    tsc und lint grün; Browser-Wege NICHT ausgeführt (Vorgabe), WebKit offen
Breiten:            390 / 834 / 1440 in der Vorschau, alle sechs Rollen auf der Startseite,
                    Mitarbeiterübersicht und Nachkalkulation: scrollWidth − innerWidth = 0 überall;
                    834 quer nicht geprüft
Belege/Exporte:     nicht berührt (export.ts, hoursPdf.ts, ExportDialog unverändert); Prüfsummen offen
Mengengerüst:       offen — nicht gemessen
Bedienbarkeit:      Raster als Tabelle mit Spalten- und Zeilenköpfen, jede Zelle mit Vorlesetext
                    (Person, Tag, gebucht, Soll); Seitenfenster mit Fokusfalle und Esc (Baustein);
                    axe offen
Rückgängig:         keine neue Umkehr; Löschbestätigung „Eintrag löschen?“ unverändert
Fehlerprotokoll:    in der Vorschau keine Seitenfehler (pageerror) auf den drei Seiten
Bildschirmfotos:    in der Sitzung angesehen, nicht eingecheckt (docs/ui-umbau/nachher/ offen)
Dokumentation:      Handbuch und FUNKTIONEN.md offen (nicht Paketdateien) — siehe unten
Freigabe Betreiber: ____________________  Datum: __________   (offen)
```

## Was geprüft ist

| Prüfung | Datei | Ergebnis |
|---|---|---|
| Startseite je Rolle, Kennzahlen oben, „Zu erledigen“ | `tests/components/DashboardView.test.tsx` (45) | grün; die zwei neuen Prüfungen sind ohne die Änderung rot (Gegenprobe ausgeführt) |
| Nachtlauf-Warnung, Wartungshinweis | `LaufWarnung.test.tsx`, `WartungHinweis.test.tsx` | grün, unverändert |
| Mitarbeiterübersicht, Raster, Seitenfenster, ⋯ | `tests/components/AccountingView.test.tsx` (30) | grün; neue Prüfungen ohne die Änderung rot, „kein Raster im Supportzugang“ prüft, was gleich bleiben muss |
| Arbeitszeitgrenzen | `ArbeitszeitGrenzenKarten.test.tsx`, `ArbeitszeitGrenzenRunde3.test.tsx` | grün, unverändert |
| Projektauswertung als Zeilen | `tests/components/ProjectSummary.test.tsx` (15) | grün; neue Prüfung ohne die Änderung rot |
| Nachkalkulation, Segmente, Kennzahlen | `tests/components/NachkalkulationView.test.tsx` (22) | grün; neue Prüfungen ohne die Änderung rot |
| Regeln der Startseite | `tests/unit/startseiteRunde3.test.ts` | grün, unverändert |
| Grundwerte und CSS-Regeln (auch `lot-start.css`) | `tests/unit/lotGrundwerte.test.ts` | grün |

## Was offen ist

- **Browser-Wege** (`tests/durchklick/startseiteViel.spec.ts`): angepasst („Zu erledigen“ statt
  „Handlungsbedarf“), nicht ausgeführt. Die Höhenprobe (≤ 2,25 Bildschirme) kann am Schreibtisch
  knapper werden: die Kennzahlen stehen jetzt über beiden Spalten statt in der rechten.
- **WebKit, 834 quer, axe, Mengengerüst, Prüfsummen der Exporte**: nicht geprüft.
- **Raster mit 25 Personen**: nur mit den vier Personen der Vorschau angesehen; ab etwa
  15 Personen rollt das Raster in seiner Hülle (höchstens 70 % der Bildschirmhöhe).
- **Leere Startseite** („Heute liegt nichts an“): nur im Test, nicht in der Vorschau gesehen
  (die Vorschau hat immer etwas zu tun).
- **Handbuch und FUNKTIONEN.md**: nennen noch „Handlungsbedarf“ und die Kennzahlen „rechts“
  (handbuch.html Zeilen 630 und 2118, FUNKTIONEN.md Zeile 97).
- **Freigabe des Betreibers**.
