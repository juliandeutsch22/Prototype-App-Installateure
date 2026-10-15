# Prüfstand · Lot v2, Gesamtkonzept 10

Die Produktänderung wurde gegen `main` d4b8542 begonnen. Die Screens verwenden
die echten Ansichten mit dem bereits vorhandenen fiktiven Vorschau-Datenbestand.
Dessen künstliche Grenzfälle, doppelte Beispieldaten und unvollständige
Firmendaten sind keine Befunde über einen Produktivbetrieb.

| Prüfung | Ergebnis |
|---|---|
| Ausgangsprüfung der betroffenen Ansichten/Grundwerte | 166 Prüfungen bestanden |
| Neue Verhaltensprüfungen vor der Änderung | Gegenproben erwartungsgemäß rot: Vergleich/Tagesraster, Personenkalender, Grenzfall im Vergleich, Budgetüberschreitung, Zeitband |
| Vollständige Modul-/Komponentensuite | 332 Dateien, **5.093 Prüfungen bestanden** |
| Gezielter Nachtest einschließlich Kalender-Tastatur und Gestaltungsregeln | 118 Prüfungen bestanden |
| TypeScript | `tsc --noEmit -p .` bestanden |
| Lint | `npm run -s lint` bestanden |
| Produktivbuild | `npm run build` bestanden |
| Links und Rechte der Navigation | alle sieben vorhandenen Browserprüfungen bestanden |
| Layoutdurchgang | 38 Einstiege × drei Breiten; kein schwerwiegender Befund. Zwei Meldungen betreffen bewusst auf 1 px gekürzte Vorlesebeschriftungen an Stundenwerten, keine sichtbaren abgeschnittenen Werte. |
| Screens der Einstiege | 114 Aufnahmen bei 390/834/1.440 px; korrekte Überschrift, kein Seitenüberlauf oder JavaScript-Seitenfehler |
| Personenkalender im Browser | bei allen drei Breiten 31 Tage, Pfeiltasten, Fokusrückgabe und axe ohne Befund; Zellen am Handy etwa 49 × 60 px |
| Vollständige Browserwege gegen den lokalen Stapel | abschließender Lauf läuft; noch keine Gesamtfreigabe |

Die Browserausgaben liegen getrennt von der Linkprüfung. Ein anfangs geteilter
Trace-Ordner und ein nicht mehr laufender Testserver führten zu abgebrochenen
Durchgängen. Außerdem musste die zuvor angehaltene lokale Edge-Laufzeit für
Benutzeranlage und Passwortvergabe gestartet werden. Diese Durchgänge sind
keine bestandenen Prüfungen. Die abschließende Abnahme verwendet einen eigens
laufenden App-Server und die antwortenden Serverfunktionen.

## Funktionserhalt

Rechen- und Exportmodule, Berechtigungen, Datenbank und Migrationen sind im Diff
unverändert. Die Mitarbeiterprüfungen decken weiterhin mehrere Buchungen am
selben Tag, Eintritt, Saldo, Urlaub, Support und Fremdkorrekturen ab. Die
bestehenden Browserwege behalten ihre fachlichen Vor-/Nachbedingungen. Nur der
nun optionale Tagesstreifen wird ausdrücklich geöffnet. Der erste Runde-4-Weg
prüft zusätzlich den neuen Einstieg und die Kalender-Tippflächen am Telefon,
bevor er weiterhin einen fehlenden Tag für die Zielperson bucht.

## Grenzen

Die 217 Einträge in `seiten.json` sind Quellzuordnungen von Konzeptzuständen,
keine 217 eigenständigen Browser-Abnahmen. Die Bildschirmprüfung umfasst die
38 dokumentierten Vorschau-Einstiege und gezielte Personenzustände. Fiktive
Daten prüfen Darstellung, keine echte Speicherung. Speicherung und Fachwege
werden gesondert gegen den lokalen Supabase-Stapel durchgeklickt.

WebKit/Safari und echte Mobilgeräte sind in diesem lokalen Lauf nicht geprüft;
die CI besitzt weiterhin ihren WebKit-Auftrag. Pilotwochen und die Sichtprüfung
mit den Anwendern bleiben offen. Automatisches axe ist keine vollständige
manuelle WCAG-Zertifizierung. Produktivdaten wurden nicht geändert.
