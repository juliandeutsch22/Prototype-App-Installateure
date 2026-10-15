# Prüfergebnis des Gestaltungskonzepts

Stand 15.10.2026. Geprüft wurde der eigenständige Entwurf, nicht die Live-Anwendung.

| Prüfung | Ergebnis |
|---|---|
| Konzeptumfang | 217 eindeutige Ansichten: 206 geprüfte Ausgangsansichten und elf ergänzende Aufgaben-/Zustandsvarianten. |
| Screens | 651 nummerierte Bilder: 1440 × 1040 Desktop, 834 × 1112 Tablet und 390 × 844 Handy als Ausgangsfenster; vollständige Seitenlänge je Inhalt. |
| Rendering | Alle 651 Aufrufe mit korrekter Ansichts-ID, einem H1, ohne JavaScript-Seitenfehler oder seitliches Überlaufen der ganzen Seite. |
| Beschriftungen | Kein vom Geometriecheck gemeldeter abgeschnittener Text in sichtbaren Elementen mit verstecktem Überlauf. Interne Planraster dürfen bewusst scrollen. |
| Automatische Barrierefreiheit | 434 Ansichtsprüfungen des Hauptinhalts mit axe (WCAG 2 A/AA und 2.1 AA): keine automatisch festgestellten Verstöße im gezeigten Ausgangszustand. |
| Seitengerüst | 17 repräsentative Einstiege einschließlich Rollenstarts, Zugang, Plattform und Galerie bei Desktop/Handy: 34 zusätzliche Prüfungen ohne automatisch festgestellte Verstöße. |
| Bedienung | 18 gezielte Szenarien bestanden; dabei keine JavaScript-Seitenfehler oder externen Netzwerkanfragen. |
| Navigation | Interne Bild-/Nachweisdateien vollständig; gerenderte interne Ansichtsverweise in allen 217 Ansichten gültig. |
| Quellbezug | Alle referenzierten Quellpfade vorhanden, SHA-256 in Seitenpruefung.json. |
| Produktanwendung | Arbeitsbaum sauber auf d4b8542821d86c7057761af16de1331d1de87e09; für diese Lieferung nicht verändert. |

## Bedienprüfungen

Die einzelnen Szenarien stehen in [Interaktionen.json](Interaktionen.json). Geprüft sind Suche/Lückenfilter/Tagesliste, zielgerichtete Fremdbuchung, Plan-Gruppen und Ansichtswechsel, alle sieben mobilen Tagesreiter, lesender Teamplan, bedingte Termin- und Benutzerfelder, geschützte Kennungen/Rollen, doppelfreier Rechnungseditor, Positionszeilen, Materialmengen/Warenkorb, Belegauswahl, lokale Schein-Entwürfe und Signaturen, Zeitvorlagen ohne automatische Buchung, lesende Rechnung/Rücklass/Rückzahlung, Löschfolgen, Einmalcode-Merkmale, interne Verweise und die Galerie.

Gezielte Nachprüfungen nach dem visuellen Gegencheck stehen in [Nachpruefung.json](Nachpruefung.json): Zusammenfassung vor den Signaturen, Kontakt innerhalb der Hauptspalte und erkennbare Personenauswahl im Detailkontext.

## Aussagegrenzen

Axe enthält auch **incomplete**-Ergebnisse, unter anderem zu Kontrast, ARIA und Tabellenbezügen. Diese sind nicht als bestandene manuelle Prüfungen zu verstehen. Die Rohberichte dokumentieren die betreffenden Prüfarten; eine Prüfung mit Screenreader, Tastatur, Zoom, Touch und echten Daten bleibt erforderlich. Der automatische Durchlauf ist keine WCAG-Zertifizierung.

Die Screens wurden in Chromium erstellt. Für lesbare vollständige Seitenbilder wird die mobile Navigation beim Fotografieren ans Seitenende gesetzt, und lange Planraster werden vertikal geöffnet. Im Bedienprototyp bleiben Navigation und Plan-Kopfzeilen fixiert bzw. begrenzt scrollbar. Übersichtsboards kennzeichnen absichtlich gekürzte Ansichten als Ausschnitt.

Visuelle Stichproben umfassen Mitarbeitervergleich und Detailnachweis, Wochenplan, Startseiten, Baustellenakte, Kundenformular am Tablet, mobile Zeit-/Rechnungserfassung, Scheinabschluss, Benutzeranlage und Abwesenheitsmonat. Eine automatische Geometrieprüfung aller Bilder ist kein vollständiger manueller UX-Test jeder Datenkonstellation.

Die Galerie wurde über einen lokalen HTTP-Server getestet und verwendet eingebettete Metadaten sowie lokale Bild-/Schriftdateien ohne Fetch-Abhängigkeit. Das direkte Öffnen lokaler file:-URLs lässt die verwaltete Browserumgebung hier nicht zu. In einem normalen Browser ist Öffnen nach vollständigem Entpacken vorgesehen; alternativ ist der lokale Python-Server im README beschrieben.

Backend, echte Rechte, gespeicherte Entwürfe, Uploads, PDF/Exporte, Rechenregeln und Produktionszustände wurden durch diese Entwurfsprüfung nicht freigegeben. [Funktionsschutz.md](Funktionsschutz.md) benennt die noch notwendigen Abnahmen.

## Rohberichte

- [Bildgeometrie](Bildpruefung.json)
- [Automatischer Hauptinhaltstest](Barrierefreiheit.json)
- [Seitengerüst einschließlich Galerie](Seitengeruest-Pruefung.json)
- [Bedienung und Netzwerkanfragen](Interaktionen.json)
- [Nachprüfungen](Nachpruefung.json)
