# Prüfung des Gestaltungsentwurfs

14.10.2026. Eigenständiger Entwurf, keine App-Änderung.

- Vier Hauptansichten bei 390, 834 und 1440 px: keine erfassten JavaScript-Fehler, keine überbreite Seite.
- Acht geprüfte Bedienwege: Aufgabenlink, Rechnungssuche/-filter, leere Suche, Rückkehr mit Fokus, Aktenbereiche, gültige/ungültige Zeit, globale Suche, Demo-CSV und mobile Abschluss-/Detailansicht (im JSON nach funktionalen Themen zusammengefasst).
- Automatisierte axe-Prüfung WCAG 2 A/AA und 2.1 A/AA über die vier Hauptansichten in drei Breiten: zwölf Läufe, keine gemeldeten Verstöße.
- Eigenständiges HTML offline mit eingebetteten Schriften und Navigation geprüft.
- Bilder nach dem letzten CSS-Stand neu exportiert; zentrale Ansichten und Übersicht visuell kontrolliert.
- App-Checkout bleibt sauber auf `main`. Kein Merge, keine Migration, kein App-Deployment.

Der Barrierefreiheitscheck prüft die vier Hauptansichten, nicht jedes Bearbeitungsfenster oder die fachliche Verständlichkeit. Die Demonstration ist keine vollständige Nachbildung der App und kein Ersatz für Geräte-/Rollen-/Funktionsabnahmen. Umfang und Grenzen stehen in README.md.
