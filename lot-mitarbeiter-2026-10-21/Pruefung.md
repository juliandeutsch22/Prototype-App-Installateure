# Prüfung des überarbeiteten Entwurfs

[Zur Screenübersicht](README.md)

- 10 Zustände bei 1440, 834 und 390 px: 30 Screens erfolgreich gerendert. Keine JavaScriptfehler, horizontalen Seitenüberläufe oder unbenannten Formularfelder gefunden.
- Automatische Axe-Prüfung aller 30 Darstellungen nach WCAG 2 A/AA, 2.1 AA und 2.2 AA: keine gemeldeten Verstöße. Ein zunächst zu schwacher Kontrast der Zeitangaben in Wochenfeldern wurde korrigiert und erneut geprüft.
- Insgesamt 46 ergänzende Prüfungen erfolgreich: Beispielsummen, Suche, Kombination mit Lückenfilter, Zurücksetzen, Filter bei Rückkehr erhalten, Monats-/Gesamtsaldo, 31 Monatstage, sieben Wochentage, zukünftige Tage, Kalender, Dialog und Mitarbeiter-/Datumsvorbelegung.
- Die zweite Buchung vom 13.10. öffnet 11:30–15:30 mit 0 Minuten Pause; sie wird nicht mit der ersten Buchung zusammengefasst.
- Die Galerie wurde bei drei Breiten einschließlich Bildwechsel, Überlauf und Axe geprüft.
- Neun visuelle Gegenproben für die akzeptierten Kundenakten, Angebote und Wochenpläne auf drei Breiten zeigen keine sichtbaren Änderungen. Bei einer Gegenprobe wurden minimale Unterschiede an geglätteten Eingaberändern mit der Standardtoleranz von Pixelmatch bewertet, statt sie als inhaltliche Änderung zu behandeln.

Die erste Personenzeile beginnt im 390-px-Vergleich nach rund 405 statt 585 Pixeln. Das spart rund 180 Pixel vor der Liste.

[Rohdaten Darstellung](darstellungspruefung.json) · [Rohdaten Bedienung und Gegenproben](bedienpruefung.json)

Die Hauptanwendung bleibt unverändert auf `3e49090`. Geprüft wurde eine lokale Gestaltungsstudie, keine produktive Datenverarbeitung. Die Backendabläufe, sämtliche bedingten Rechte und Datenzustände werden bei einer Umsetzung geprüft. Die automatischen Barrierefreiheitsprüfungen ersetzen keine vollständige manuelle Abnahme.
