# Prüfung der Entwurfsdateien

[Zur Übersicht](README.md)

Geprüft wurde das statische Entwurfspaket, ohne Änderungen an der App.

| Prüfung | Ergebnis |
| --- | --- |
| Alle 263 Ansichten bei 1440, 834 und 390 px | 789 Darstellungsprüfungen erfolgreich |
| JavaScript-Fehler, horizontaler Seitenüberlauf, interne Entwurfsziele, benannte Formularfelder | Keine gefunden |
| Automatische Axe-Prüfung aller 263 Desktopansichten, WCAG 2 A/AA, 2.1 AA, 2.2 AA | Keine gemeldeten Verstöße |
| Mobile Stichprobe: Akte, Angebot, Wochenplan, Mitarbeiterübersicht, E-Rechnung, Konto | Keine gemeldeten Axe-Verstöße |
| Galerie bei drei Breiten: Suche, Bereich, Rolle, Format, Schriftdateien, Überlauf, JavaScript und Axe | Erfolgreich |
| Mobiles „Mehr“ für sechs Rollen | Ziele stimmen mit der jeweiligen bestehenden Navigationsmatrix überein |
| Registerziele der drei Akten sowie Rechnungseinstellungen | Erreichbar |
| Datum im Angebotsentwurf | Deutsches Anzeigeformat |

Die ergänzende Bedienprüfung enthält insgesamt 57 erfolgreiche Prüfungen. [Rohdaten der Darstellung](darstellungspruefung.json) · [Rohdaten der Bedienprüfung](bedienpruefung.json)

## Genauigkeit und Grenzen

Die Screenshotprüfung wurde nach der Einschränkung der Einstellungsregister auf die tatsächlichen Rollen für die betroffenen Seiten wiederholt. Nach einer visuellen Gegenprobe wurden außerdem alle 41 Ansichten mit Datumsfeldern auf drei Breiten erneut gerendert. Der Datumscheck startet die Angebotsseite ausdrücklich frisch und prüft den Wert `31.10.2026`.

Die sechs Startseitenbilder sind vorhandene Umsetzungsscreens und wurden als Referenzen übernommen; ihre neue Referenzanzeige wurde ebenfalls geprüft.

Die Galerie benötigt keine externen Schriftdateien, APIs oder nachzuladenden JSON-Daten. Sie wurde über einen lokalen HTTP-Server geprüft. Ein direkter Test über `file://` wurde von der Browserrichtlinie dieser Cloud-Umgebung blockiert; dieser Startweg ist daher hier nicht praktisch nachgewiesen. Im Paket gibt es keine `fetch`-Abhängigkeit für die Galerie. Falls ein Browser lokale Dateien einschränkt, lassen sich sämtliche Screens alternativ direkt über die GitHub-Übersicht öffnen.

Automatische Barrierefreiheitsprüfungen ersetzen keine vollständige manuelle Prüfung. Es wurden keine produktiven Abläufe oder Backendfunktionen durch dieses statische Paket getestet. Insbesondere sind Berechnungen, Rollenregeln, Datenbankzugriffe, Speicherung, Importe/Exporte und Benachrichtigungen erst bei einer späteren Umsetzung verbindlich abzunehmen.

Die Hauptanwendung bleibt auf Quellstand `3e49090`. Für das reine Entwurfspaket wurde kein App-Merge und kein Deployment vorgenommen.
