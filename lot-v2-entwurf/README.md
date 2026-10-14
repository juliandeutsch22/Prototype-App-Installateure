# Lot v2 – vier Ansichten als Gestaltungsentwurf

Stand 14.10.2026. Ein eigenständiger, klickbarer Entwurf für Senklot mit fiktiven Beispieldaten. Die produktive App wurde nicht geändert.

## Öffnen

ZIP vollständig entpacken und `index.html` im Browser öffnen. Schriften, Symbole, Gestaltung und Interaktionen sind eingebettet; die Vorschau funktioniert offline. Alternativ lässt sich die HTML-Datei einzeln speichern und öffnen.

Die linke Navigation bzw. die untere Leiste am Handy verbindet die vier Ansichten. Direktaufrufe: `index.html#heute`, `#rechnungen`, `#baustelle`, `#zeit`.

## Die vier Ansichten

1. **Heute:** eine kompakte Kennzahlenzeile; Aufgaben nach Dringlichkeit als durchgehende Zeilen; rechts Tageskontext und Team. Am Handy eine klare Lesereihenfolge.
2. **Rechnungen:** eine Rechnungsliste mit Ansichten „Offen“, „Mahnungen“, „Alle“. Suche und Zustand wirken auf dieselbe Liste. Ganze Zeilen öffnen Einzelheiten; Zahlung und Export benutzen das gemeinsame Seitenfenster.
3. **Baustellenakte:** Name, Zustand und Zusammenfassung zuerst. „Überblick“, „Scheine“, „Dokumente“, „Stammdaten“ und „Verlauf“ gliedern die Akte. Zusammengehörige Belege und Arbeitswege bleiben erkennbar.
4. **Zeit erfassen:** kleine Zusammenfassung statt Kennzahlenkacheln. Die täglichen Felder stehen zuerst; zusätzliche Angaben sind aufklappbar. Die errechnete Arbeitszeit bleibt vor dem Abschluss sichtbar, am Handy neben dem festen Buchungsknopf.

## Gestaltung

- Eine weiße bzw. dunkle Arbeitsfläche ohne Kartenraster.
- Feine Trennlinien, gleichmäßige Abstände und wiederkehrende Zeilen.
- Petrol, Poppins mit zwei Schriftstärken, zurückhaltende Zustandsfarben.
- Vergleichbare Inhalte stehen in vergleichbaren Spalten; Beträge verwenden gleich breite Ziffern.
- Feste Such-/Filterposition; ein Hauptknopf im Seitenkopf bzw. am Handy unten.
- Kurze Bearbeitung rechts, auf dem Handy als vollständige Ansicht. Suche und Filter bleiben beim Schließen bestehen.
- Drei Anordnungen: Handy 390 px, Tablet 834 px, Desktop 1440 px; dunkle Darstellung über „Darstellung wechseln“ bzw. Hilfe.

## Ausprobieren

- Auf „2 Rechnungen sind überfällig“ klicken: öffnet die passende Mahnungsansicht.
- In Rechnungen nach „Sonnenhof“ suchen, einen Treffer öffnen und mit Escape schließen: Suche, Filter und Fokus bleiben erhalten.
- Zwischen den Bereichen der Baustellenakte wechseln.
- In der Zeiterfassung „Bis“ auf 16:00 ändern: Arbeitszeit wird 8:30 h. Ein Ende vor dem Beginn löst eine Rückmeldung aus.
- Globale Suche öffnen, nach einer der vier Ansichten suchen und wechseln.
- Zahlung oder Einsatz öffnen: die Felder zeigen das gemeinsame Bearbeitungsmuster. Der Abschluss meldet eine simulierte Aktion.
- Beim Export eine ausdrücklich als Demo gekennzeichnete CSV herunterladen.

## Umfang und Grenzen

Dies ist ein Vorschlag zur Gestaltung und Bedienung, kein Umbau der App und keine fachliche Abnahme. Das Navigationsmenü ist auf den Entwurfsumfang reduziert. Rollen-/Modulregeln sind nicht implementiert; eine konkrete spätere Umsetzung behält die bestehenden Grenzen bei.

Klickbar ausgearbeitet sind die vier Ansichten, Rechnungseinzelheiten, die Aktenbereiche, Suche, Filter, Zeitvorschau sowie beispielhafte Bearbeitungsfenster. Kundenakte, kompletter Scheinablauf, echte Planung und echte Beleg-/Dateiverarbeitung werden als noch nicht ausgearbeitete Bereiche benannt. Kein Knopf schreibt Produktionsdaten, vergibt eine echte Nummer oder sendet eine Nachricht.

Kennzahlen sind fiktive Demoangaben. Zahlung/Planung/Speichern simulieren nur den Abschluss und verändern keinen fachlichen Bestand. Die Demo-CSV ist kein BMD-Stapel; die Datumsfelder demonstrieren die Bedienung, keine vollständige Exportlogik. Änderungen im Entwurf müssen nicht nach einem Neuladen erhalten bleiben.

Die eingebettete Schrift stammt aus der bestehenden App-Abhängigkeit `@fontsource/poppins` (SIL Open Font License); siehe `OFL.txt`.

## Bilder

Unter `bilder/` liegen die vier Ansichten jeweils für Desktop, Tablet und Handy, dazu Rechnungseinzelheiten und eine dunkle Ansicht. PNGs in 2× Auflösung; JPEGs für die schnelle Vorschau. Längere Ansichten haben zusätzlich `*-gesamt.png`.

`bildnachweis.json` dokumentiert Breiten und Überlaufprüfung. `bedienpruefung.json` enthält die durchgeführten Browserprüfungen und den automatisierten Barrierefreiheitscheck. Diese Prüfungen ersetzen keine Prüfung der wirklichen App.
