# Prüfung und Grenzen · Entwurf 02

Geprüft wird eine Gestaltungsvorschau mit lokalen Modellinteraktionen, keine umgebaute Anwendung. Keine Freigabe zur Auslieferung. Hauptcheckout und Audit-Basis bleiben im getrackten Quellcode unverändert.

## Durchgeführt

- **219 Seitenaufnahmen:** 69 Seiten-/Rollen-/Tab-Kontexte in 390, 834 und 1440 px, zusätzlich zwölf dunkle Aufnahmen. Start für drei Rollen, Zeit, Material, Anforderungen, Lager, eigene Planung, Teamplanung, Urlaub/Krank/Betriebsurlaub, Scheine, Angebote, Kunden-/Baustellen-/Benutzerakten mit weiteren Reitern, Wartungen, Wochen-/Tages-/Monatsplanung, Mitarbeiterübersicht, Einstellungen, Plattform und vier Anmeldezustände. Routen in seiten.json.
- **Bedienelemente vor/nach Darstellungsstil verglichen:** Namen, IDs, Links, Disabled- und Auswahlzustand der erfassten Hauptinhalts-Elemente und Reiter gleich. Keine vollständige Funktionsabnahme: Navigation außerhalb main und Auth-Formulare ohne main sind nicht vollständig von dieser Signatur erfasst. Unveränderter Quellcode und separate Fokus-/Menüprüfung ergänzen die Kontrolle.
- **75 axe-Prüfungen tatsächlicher mobiler React-Ansichten:** 69 helle, sechs dunkle Fälle. Keine gefundenen Verletzungen der verwendeten WCAG-2-A/AA-, 2.1-AA- und 2.2-AA-Regelsätze. Kein Beweis vollständiger Barrierefreiheit.
- **84 Zustandsaufnahmen und axe-Prüfungen:** 24 Szenarien in drei Breiten, zwölf zusätzliche dunkle Aufnahmen. Erwartete Leerzustände sichtbar und ohne versehentlichen Dialog; laufendes Speichern eindeutig gesperrt und beschriftet.
- **13 Interaktionsprüfungen im Modell:** mehrfaches Absenden, Eingaben während Anfrage, Dialog-Fokus/Escape, Verwerfen zum bestätigten Stand, Fehler ohne Eingabeverlust, Erfolg erst nach Antwort, überholte Suche, Artikelnummer, leere Suche/Zurücksetzen, Rückkehr ins Angebot, acht schnelle Dialogfolgen, reduzierte Bewegung, kein Vibration-Aufruf.
- **92 weitere Breitenprüfungen:** 23 Szenarien in 320, 375, 430 und 1112 px ohne horizontalen Dokumentüberlauf. Für firma-speichert/firma-fehler hier normale Formularansicht; dynamische Zustände separat bei 390/834/1440 px aufgenommen.
- **Vier Fokusprüfungen echter React-Ansichten:** mobile und Desktop-Navigation hell/dunkel mit sichtbarer 3-px-Kontur. Dunkle Seitenleiste weiß, mobile Kontur nach innen versetzt.
- **Vier Videos:** drei asynchrone Modelle und Zeilenmenü der lokalen React-Vorschau. Menü öffnen, Tastatur, Escape und Rückfokus geprüft. Keine fachliche Menüaktion ausgelöst.

Berichte: [Seiten](seiten-pruefung.json), [Zustände](zustaende-pruefung.json), [Interaktionen](interaktionen-pruefung.json), [Fokus und Bewegung](bewegung-pruefung.json), [Haptik](haptik-pruefung.json). Skripte in werkzeuge/ verwenden die lokalen Pfade der Audit-Umgebung und sind kein portables Produkt-Testpaket.

Zusätzlich ist die Galerie bei 390 und 1440 px mit Filter-/Rücksetzbedienung, axe und Überlaufprüfung getestet. Die Speicherbutton-Breite bleibt auch nach dem Erfolg stabil (212,94 → 213 px). [Abschlussprüfung](abschluss-pruefung.json).

## Bei der Sichtprüfung korrigiert

Ein zu breit zugeordneter Angebot-Leerzustand öffnete irrtümlich den Katalog; korrigiert und durch Sichtbarkeitsprüfung abgesichert. Reservierter Layoutplatz verhindert eine breitere Speicheraktion beim Wegfall des Verwerfen-Links. Icon-Zuordnungen an App-Familie angeglichen; mobile Reiterleiste des Modells an vorhandene helle App-Leiste angepasst; Tastaturfokus auf dunkler Navigation hell gehalten. Das sind Korrekturen der Vorschau, keine behobenen App-Bugs.

## Noch notwendig nach Gestaltungsfreigabe

1. Neun [technische Befunde](AUDIT-BASIS.md) an echten Schreib-/PDF-/Offline-Wegen beheben und abnehmen.
2. Gemeinsame Darstellung in vorhandene Komponenten integrieren. Schließanimationen mit deren Lifecycle und Focus-Traps verbinden; Ziehgesten erhalten. Das Browser-Overlay dieser Runde ist keine fertige Integration.
3. Fachliche Funktionen/Rollen einschließlich Exporte, Belege, Zahlungen, Importe und Rechte anhand des [Funktionsschutzes](FUNKTIONSERHALT.md) abnehmen. Bilder zeigen Ausgangsansichten und ausgewählte Zustände, nicht jede Dialog-, Rechte- oder Datenkombination.
4. iPhone/Safari und Android auf echten Geräten prüfen: Bildschirmtastatur, Safe Areas, Touch/Ziehen, große Schrift, Vorlesehilfe, ältere Hardware. Hier Chromium 154/Linux, kein WebKit, kein physisches Mobilgerät getestet.
5. Bei späterer Umsetzung reguläre Projektchecks, CI und Release-Abnahme. Diese Designrunde hat kein App-Deployment und keinen neuen App-CI-Lauf ausgelöst.

Videos zeigen Gestaltung, keine FPS-/Rechenlast-/Geräteleistungsmessung. Ruheaufnahmen verwenden reduzierte Bewegung. Modell-Erfolg basiert ausschließlich auf simulierten Antworten, ohne dauerhafte Speicherung. „Status prüfen“ bei unterbrochener Rechnung benötigt weiterhin die sichere technische Zuordnung zum Erstellungsversuch.
