# Prüfung des Entwurfs

Geprüft wurde ausschließlich der lokale HTML/CSS-Prototyp, nicht die produktive App.

- **75 Darstellungsfälle:** 25 Ansichten / Zustände in 390, 834 und 1440 px.
- Kein seitliches Überlaufen; sichtbare Links und Schaltflächen mindestens 44 × 44 px.
- Mobile Eingabefelder 16 px Schriftgröße; sichtbare Feldbeschriftungen.
- **50 automatische axe-Prüfungen** auf Desktop und Mobil mit WCAG 2 A/AA und 2.1 AA: keine gemeldeten Verstöße. Das ist keine vollständige Barrierefreiheitsabnahme.
- Keine JavaScript-Seitenfehler beim Aufnehmen.
- **54 Bedienprüfungen:** Suche / Statusfilter, Betriebsidentität, vorausgewählter Notzugang, Anmeldeart, bestätigter Rückruf, Übergabe vor Löschplanung, Testausnahme, Frist, Kennungsbestätigung, technische Details, Ersetzen und negative Zinseingabe, Passwortwiederholung, Codezahl sowie alle 25 Zustände bei 320 px ohne seitliches Überlaufen.
- Sichtprüfung repräsentativer Desktop-, Tablet- und Mobilbilder einschließlich vollständigem Löschblatt.
- Sieben zusätzliche vollständige mobile Verwaltungsblätter; zusammen **82 JPG-Screens**.

[Darstellungsprotokoll](darstellungspruefung.json) · [Bedienprotokoll](bedienpruefung.json)

Backend-Anbindung, echte Berechtigungen, reale Zugänge, MFA-Einrichtung, Exporte, Löschung und Auslieferung sind kein Gegenstand dieses Entwurfs. Die vorgesehenen Bestandsfunktionen sind im [Funktionsabgleich](Funktionsabgleich.md) zugeordnet. Die Prüfungen des Prototyps ersetzen die spätere Abnahme der echten Umsetzung nicht.
