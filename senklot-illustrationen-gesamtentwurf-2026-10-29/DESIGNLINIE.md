# Gemeinsame Bildsprache

1. Bestehende Lot-Typografie und Fachseiten sind Grundlage. Die Zeichnungen ergänzen, sie bilden kein neues Navigations- oder Kartensystem.
2. Technische Linienillustrationen: einheitlicher Zeichenraum 160 × 104, Kontur 1,4, Hilfslinie 1,0, wenige Flächen mit 12 % Deckkraft. Farben kommen aus den vorhandenen Theme-Variablen.
3. Ein kleiner Kopfakzent pro geeigneter Hauptseite, 112 × 73 CSS-Pixel. Erst ab 1280 px sichtbar; keine Kopfillustration auf Tablet oder Handy, keine neue Kopfzeile.
4. Erklärende Leerzeichnung: Desktop 136 × 88, mobil 104 × 68 CSS-Pixel. Keine permanente Dekoration zwischen gefüllten Listenzeilen.
5. Filter ohne Treffer ist ein eigener Zustand, kein erster Einstieg. Hier bleibt die Meldung auf die aktuelle Suche bezogen. Kein Erfolgsmotiv bei Ladefehlern.
6. Startseite: Arbeitsansicht mit kleinem Gebäudeakzent; bei vollständig geladenem, leerem Aufgabenbereich eine ruhige Abschlusszeichnung. Termine bleiben davon unabhängig sichtbar. Ein separater Screen zeigt, dass Ladefehler als Warnung bestehen bleiben.
7. Planung: Das bedienbare Raster erhält keine Illustration über freien Zellen. Wochen-, Monats-, Tages- und persönliche Planung bleiben funktionale Arbeitsflächen.
8. Akten: Keine großen Kennzahlen oder zusätzlichen Bildkästen. In leeren Planunterlagen darf eine kleine Zeichnung helfen; gefüllte Akten und Bearbeitungsformulare bleiben klar.
9. Einstellungen: Auf der Übersicht ein kleiner Kopfakzent. In der zusätzlichen Einrichtungsvariante der Firmendaten ein kompakter erklärender Hinweis. Nicht dauerhaft in allen Formularen wiederholen.
10. Globaler Admin: Dasselbe Linienmotiv auf der Bereichsebene; keine verspielten Zusätze bei Notzugang, Passwort, zweitem Faktor oder Löschvorgängen.
11. Alle Zeichnungen sind dekorativ, mit aria-hidden und ohne Fokus, Klickfläche oder Statusinformation. Text und echte Aktionen tragen die Bedeutung. Keine Grafik ersetzt einen Wert, eine Warnung oder einen Termin.
12. Die vorgeschlagenen Motive sind statisch. Eine optionale spätere einmalige Einblendung darf keine Layoutverschiebung verursachen und entfällt bei reduzierter Bewegung. Kein Wippen, Pendeln oder Dauerpulsieren.

Die zwölf SVG-Dateien lassen sich ohne neue Bibliothek in die vorhandene LotLeerzeichnung-Komponente überführen. Das zusätzliche Ablagemotiv ist ein verfügbarer Baustein; daraus folgt kein neuer allgemeiner Upload-Bereich in der aktuellen App.
