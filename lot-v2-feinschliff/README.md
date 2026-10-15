# Lot v2 – Feinschliff / Entwurf 02

Stand 15.10.2026. Der fiktive Beispieltag bleibt der 14. Oktober, damit die Fassungen direkt vergleichbar sind. Ein eigenständiger, klickbarer Entwurf für Senklot mit fiktiven Beispieldaten. Die produktive App wurde nicht geändert.

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


## Was im Feinschliff geändert ist

- **Typografie:** größere, leichter gesetzte Kennzahlen; Titel kombinieren 400 und 600, um den entscheidenden Begriff zu betonen. Beschriftungen, Überschriften und Zahlen unterscheiden sich klarer. Die bestehende Schriftfamilie bleibt erhalten.
- **Positionen und Abstände:** Datum als typografischer Anker der Startseite; Hauptaktionen an der Titelbasis ausgerichtet; kompaktere Rechnungsansicht. Am Handy hat der bezahlte Monatsbetrag eine eigene Zeile, damit Geldbeträge nicht umbrechen.
- **Grafiken statt neuer Icons:** Forderungsanteile als beschriftete Balken, Stundenbudget als Kreis, Arbeitszeit/Pause als Verhältnisband und feinere Zeitachsen im Tageskontext. Die vorhandenen Navigationssymbole bleiben; neue Symbole wurden nicht ergänzt.
- **Nachvollziehbare Werte:** Die Forderungsgrafik stammt aus den fünf Demo-Rechnungen (18.420 Euro offen, davon 6.280 Euro überfällig = rund 34 %). Der Budgetkreis zeigt 164 von 240 Stunden = rund 68 %. Das Zeitband berechnet seine Anteile aus den Eingabefeldern und setzt keine erfundene Pausen-Uhrzeit voraus.
- **Drei Größen:** Die Kennzahlen und Diagramme passen sich an Handy, Tablet und Desktop an. Auf dem Tablet bleibt für Scheinbezeichnung und Zustand eine eigene Zeilenordnung.

`Lot-v2-Vergleich.jpg` zeigt die alte und die verfeinerte Startseite nebeneinander. `Lot-v2-Uebersicht.jpg` zeigt alle vier neuen Ansichten. Die erste Fassung bleibt unter `lot-v2-entwurf/` im Bilderzweig und im bisherigen ZIP unverändert zugänglich.

Der Feinschliff ist weiterhin eine eigenständige Gestaltungsvorschau. Die bestehende App wurde nicht geändert.
