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
| Vollständige Browserwege gegen den lokalen Stapel | Chromium und Tablet: **72 bestanden, ein erwarteter gerätebedingter Skip**, keine fehlgeschlagene Prüfung (8,2 Minuten) |
| Herunterladbare Galerie | 40 Ansichten × drei Breiten; alle 120 Bilder über HTTP geladen, kein JavaScriptfehler oder seitlicher Seitenüberlauf bei 390 px. Direktes `file://`-Öffnen ist durch die Browserrichtlinie dieser Umgebung gesperrt und deshalb hier nicht verifiziert. Die Galerie verwendet lokale Dateien ohne Fetch/CDN. |

Die Browserausgaben liegen getrennt von der Linkprüfung. Ein anfangs geteilter
Trace-Ordner und ein nicht mehr laufender Testserver führten zu abgebrochenen
Durchgängen. Außerdem musste die zuvor angehaltene lokale Edge-Laufzeit für
Benutzeranlage und Passwortvergabe gestartet werden. Diese Durchgänge sind
keine bestandenen Prüfungen. Die abschließende Abnahme verwendet einen eigens
laufenden App-Server und die antwortenden Serverfunktionen.

Der gerätebedingte Skip ist die vorhandene Tablet-Seitenleistenprüfung im
Desktop-Projekt; dieselbe Prüfung besteht im Tablet-Projekt. Der Lauf umfasst
unter anderem Anmeldung, Benutzeranlage, Passwortvergabe, Zeitbuchung,
Fremderfassung, Materialanforderung, Unterschrift, Rechnungsstellung, Termine
und Sonderurlaub. Er ist eine lokale Abnahme, kein Ersatz für die Remote-CI.

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


## Remote-CI · abgeschlossen am 15.10.2026

Für Quellstand `bc804862318b2b5e94056b2d48aeb86bee7202c1` vollständig grün:

- [Typen, Lint und Tests](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/38806001798): 332 Dateien, **5.093 Prüfungen bestanden**, Typprüfung und Lint bestanden.
- [Chromium, mobiles WebKit und Tablet](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/38806001763): **82 Browserprüfungen bestanden**, zwei gerätebedingte Skips; anschließend **sieben Linkprüfungen bestanden**.
- Der Deployment-Auftrag wurde im Pull Request erwartungsgemäß übersprungen. Dieser Stand wurde noch nicht nach main gemergt oder produktiv veröffentlicht.

Die lokale Einschränkung zur fehlenden WebKit-Prüfung gilt für den lokalen Lauf; WebKit ist durch diesen Remote-Lauf abgedeckt. Sichtfreigabe, echte Geräte und Pilotbetrieb bleiben offen.
