# Lot · Entwurf 02 · gemeinsame Gestaltung

28. Oktober 2026, zur visuellen Durchsicht. Grundlage sind beide Premium-Prompts und die bisher freigegebene Lot-Linie. Kein Produktcode wurde umgebaut.

## Entscheidung

Die App braucht hierfür keine neue Seitenarchitektur. Premium entsteht durch verlässliche Zustände, präzise Rückmeldung und kurze Bewegungen. Bestehende ruhige Typografie, dünnere Zahlen, Petrol-Navigation, offene Listen und Aktenreiter bleiben die Grundlage. Große Übersichten erhalten keine zusätzliche Dekoration.

219 Seitenbilder stammen aus echten React-Komponenten auf Stand 7601e378 mit fiktiven Daten und ausschließlich im Browser ergänztem gemeinsamen Stil. 84 Zustandsbilder stammen aus einem isolierten Designmodell: Sie zeigen neue Abläufe, ersetzen aber nicht die vollständigen Fachseiten. Unterschiedliche Beispieldaten sind kein Vorher-/Nachher-Vergleich.

## Gemeinsame Regeln

| Baustein | Entscheidung | Grenze |
|---|---|---|
| Schrift / Zahlen | Poppins, klare Ebenen, Titel halbfett, keine zusätzliche Betonung der Zahlen. Bestehende Seitengrößen und Tabellenhierarchie erhalten. | Keine großen Kennzahlenleisten in Akten und keine neuen Kartenraster. |
| Navigation / Hauptaktion | Bestehende mobile Reiterleiste und Daumenbereich; eindeutige Hauptaktion je Arbeitskontext. | Kein Hamburger, keine parallelen schwebenden Aktionen. |
| Buttons | Normal, Hover, gedrückt, Fokus, laufend, bestätigt, Fehler, begründet deaktiviert. Druck maximal 1 px. | Kein Aufblähen oder Federn. Kompakte vorhandene Sekundärbuttons sind nicht pauschal ein Problem. |
| Speichern | Sofort laufend anzeigen, doppeltes Absenden sperren. Haken und Text erst nach bestätigtem Ergebnis. Breite bleibt stabil, neue Eingaben während der Anfrage bleiben ungespeichert. | Kein Erfolg nach bloßem Klick. Keine künstliche Mindestwartezeit in der App; Modellwartezeiten dienen nur der Vorführung. |
| Fehler / Teilerfolg | Bekanntes Ergebnis bewahren, nächste sichere Aktion anbieten. Kritische Meldung bleibt stehen. | Keine verschwundenen Eingaben, keine automatische Wiederholung finanzieller Schreibvorgänge. |
| Menü / Dialog | Kurzes Einblenden, vorhandene Positionen und Fokusführung. Modell-Dialoge blenden beim Schließen kurz aus. | Auf echten BottomSheets nur Deckkraft: vorhandene Ziehgesten behalten ihren Transform. Schließ-Lifecycle ist dort noch nicht integriert. |
| Listen / Reiter / Auswahl | Kurzer Farbwechsel, klarer aktiver Zustand. Neue Zeile darf nach echter Bestätigung kurz einblenden. | Keine animierten Tabellenhöhen oder automatisch bewegten Sortierungen. |
| Suche | Aktueller Anfrage zugeordneter Ladezustand, alte Antworten verwerfen, Übernahme direkt bestätigen. | Keine alten Treffer unter neuem Begriff; Katalog bleibt bei Übernahme offen. |
| Seitenwechsel / Fokus | Vorhandene 160-ms-Deckkraft der App erhalten. Fokus weiß auf dunkler Navigation, Petrol/helles Petrol auf Inhaltsflächen. | Keine globale Slide-Show und kein Remount beim Seitenwechsel. |
| Icons | Alle 29 vorhandenen SVG-Icons: 24er-Raster, 1,8er Strich, runde Enden/Verbindungen. Gleiche Bedeutung überall. | Keine weitere Bibliothek oder erfundene gefüllte Varianten. App-Icon unverändert. |
| Leere Ansichten | Erstnutzung, Suche, Filter, Zeitraum, Fehler und Berechtigung getrennt erklären, passende nächste Aktion. | Leerer Bestand ist kein Ladefehler; keine Illustration bei jedem Problem. |
| Lot-Zeichnung | Zwei kleine statische SVGs aus Lot, Achsen und Konstruktionslinien für erste Baustelle und erstes Angebot. Gleiche Größe und Strichführung. | Keine Cliparts, Maskottchen, 3D-Objekte oder Endlosschleifen. Nur bei tatsächlicher Erstnutzung zeigen. |

## Bewegungswerte

| Token | Dauer | Verwendung |
|---|---|---|
| --motion-press | 100 ms | Druck, unmittelbare Farbantwort |
| --motion-state | 160 ms | Status, Menü, Detailinhalt |
| --motion-overlay | 200 ms | Dialog / Blatt öffnen |
| --motion-exit | 140 ms | Modell-Dialog schließen |
| --motion-route | 160 ms | vorhandenen Seitenwechsel erhalten |
| --ease-response | cubic-bezier(.22,1,.36,1) | ruhig auslaufend, ohne Überschwingen |

Überwiegend Deckkraft und kleine Verschiebungen; Farbe nur kurz wechseln. Struktur, Zeilenhöhe und Breite bleiben stabil. Vorhandene Skeleton-Verzögerung 200 ms und Lade-Konvention wiederverwenden. Die eigenständige Vorschau ist keine neue Komponentenbibliothek.

Bei prefers-reduced-motion: reduce entfallen die Gestaltungsanimationen und Übergänge. Beschriftung, Ladezustand, Haken, Fehlertext und Bedienung bleiben verständlich. Unterbrochene Modellanimationen werden abgebrochen und sauber beendet. Bedienung wartet nicht auf dekorative Animationen. Langsames Netz wird nicht durch längere Effekte kaschiert.

## Haptik

Kein Vibration-Aufruf im Entwurf. Die Anwendung ist Web/PWA, keine native iOS-Taptic-Anbindung. Chromium meldet eine Vibration-Funktion; das beweist keine fühlbare Ausgabe am Gerät. Falls später gewünscht, wäre ein sehr zurückhaltendes optionales Signal nach bestätigter Aktion auf tatsächlich unterstützten Geräten P3. Kein Schalter ohne nachgewiesene Wirkung und kein Architekturumbau nur für Haptik.

## Reihenfolge nach Freigabe

| Stufe | Punkt | Nutzen |
|---|---|---|
| P1 · C01 | Ehrliche Speicherzustände, Wiederholschutz, Eingaben erhalten, Fehler zuordnen | Größter praktischer Nutzen; offene F01–F07 fachlich lösen und finanzielle Abläufe einzeln abnehmen. |
| P1 · C02 | Fokus, reduzierte Bewegung, stabile Geometrie, bestehende gemeinsame Komponenten | Einheitliches Verhalten über Seiten und Rollen. |
| P1 · C03 | Laufende Suche, veraltete Antwort, Übernahme, Rückkehr | Sichere häufige Folgeaktionen. |
| P2 · C04 | Kontextbezogene Leerzustände und zwei Lot-Zeichnungen | Klarer Einstieg ohne unnötige Grafik im Arbeitsalltag. |
| P2 · C05 | Bestehende Icon-Familie und kurze Menü-/Disclosure-Rückmeldung | Sichtbare Präzision bei geringem Eingriff. |
| P3 | Optionale Haptik nach echtem Gerätetest | Aktuell nicht aktiviert. |

Alte Audit-Prioritäten P0–P2 bleiben bestehen: [offene technische Befunde](AUDIT-BASIS.md). Keine neue Datenbank, kein Routing-Umbau, kein neues Recht, keine zusätzliche Bibliothek.
