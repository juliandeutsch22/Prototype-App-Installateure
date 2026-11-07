# M00 — Abnahmematrix und Nachweisregister

Stand: 2026-11-06. Je Original-ID gelten die positiven/negativen/erhaltenden Gegenproben aus dem Masterprompt (Abschnitte 5, 6, 11.2) und der Bauplanung (Teile 5 und 7). Diese Matrix führt den Nachweisstatus.

## 1. Nachweisstatus je Paket

| Paket | IDs | Fachliche Abnahme | DB-/Rechte-Tests | Offline/Geräte | Externe Nachweise | Status |
|---|---|---|---|---|---|---|
| M01 | U04 U05 U06, N02-Vertrag | Journal/Papierkorb/Module | negativ: Client-Insert, fremder Mandant, Support | Alt-PWA-Verhalten | keine | M01-Journal-Unterbau in PR |
| M02 | A03 A09 A11 A06 | Auftrag ohne Angebot, Annahme | Token/Widerruf/Doppelannahme | — | keine | offen |
| M03 | E01–E07 A07 A08 E02 E03 G06 | K04/K03-Szenarien | Aktivierung atomar, Rechte EK | Großimport fortsetzbar | DATANORM-Realdateien | offen |
| M04 | E10–E14 E16 G03 | K02-Konkurrenzfälle | Umlagerung atomar | Scanner/Inventur offline | keine | offen |
| M05 | E08 E09 R01–R03 | Teillieferung/Storno | Mengeninvarianten | — | Mailprogrammweg | offen |
| M06 | Z01–Z04 B02 N01 | N01-Abnahmeliste vollständig | API = UI-Regeln | Altentwurf/Gerätewechsel | keine | offen |
| M07 | Z05 B04–B08 G10 A01 A02 A04 | DnD-Konflikt, Board-Achsen | Qualifikation verifiziert | — | keine | offen |
| M08 | B03 A05 R10 | LV→Aufmaß→Rechnung | Doppelübernahme ausgeschlossen | Besichtigung offline | ÖNORM-A-2063-Fassung | offen |
| M09 | W01–W08 G11 | Fassungswechsel, Fristen | Bericht bindet Fassung | — | keine | offen |
| M10 | B01 B09–B13 B15 | K01-Serviceeinsatz | Rechte Chat/Mängel | E49-Signatur, Sync | SharePoint-Mandant, FCM | offen |
| M11 | R06–R09 E15 G09 | Dreiwege/Dublette | Import≠Buchung | — | Kanzlei-/Steuerprofil | offen |
| M12 | R04 R05 G08 G07 | CAMT/Aufteilung/Skonto | Euro-einmal-Constraint | — | CAMT-Testdatei (camt.053) | offen |
| M13 | G01 G02 G04 G05 A10 B14 R11 | K07 alle Abrechnungsarten | Doppelverbrauch ausgeschlossen | — | keine | offen |
| M14 | R12 U03 | Versandstatus/Wochenbericht | kein Versand ohne Aktion | — | Versandprovider | offen |
| M15 | U01 U02 | Personalisierung ohne Rechteänderung | — | mobil+desktop | keine | offen |
| M16 | Gesamt | 7 End-to-End-Szenarien | RLS-Nachweis gesamt | Gerätematrix | alle | offen |

## 2. Nachweisregister (extern)

| Nachweis | Benötigt für | Status |
|---|---|---|
| DATANORM-Testdateien realer Großhändler | M03 | anzufordern |
| ÖNORM-A-2063-Fassung (Lizenz/Stand) | M08 | anzufordern |
| CAMT.053-Testdatei der Hausbank | M12 | anzufordern |
| Kanzlei-/Steuerprofil (Kontierungsregeln) | M11 | anzufordern |
| E-Mail-Versandprovider (Konfiguration) | M14 (E09 danach) | anzufordern |
| SharePoint-Testmandant | M10/B15 | anzufordern |
| FCM-/Push-Konfiguration Bestand | M10/B09 | im Bestand prüfen |

Fehlende Nachweise blockieren nur die abhängige Freigabe, nicht unabhängige Entwicklung (Arbeitsgrundsatz 10).
