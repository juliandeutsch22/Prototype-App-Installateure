# Lot v2 · Entwurf 07

Reviewbare Vorschläge, keine Umsetzung der Produkt-App. Alle Beträge, Namen, Zuordnungen und die Uhrzeit 14.10.2026 10:05 sind fiktive, eingefrorene Beispieldaten. Die Vorschau schreibt keine Betriebsdaten und erzeugt keine echten PDFs.

## Meine Empfehlung

Die Linie ist nicht zu minimalistisch. Wichtig sind unterscheidbare Ebenen und sichtbare häufige Aktionen. Schriftfamilie und Titelgewichte bleiben; große Zahlen bleiben bei Gewicht 500. Zusätzliche Karten oder große Illustrationen würden die Startseite weniger übersichtlich machen.

- **A:** Kalenderachse mit Jetzt-Markierung und nächstem Termin. Bewusst wenig Grafik.
- **B:** Gleicher Inhalt wie A plus schmales Teamband. Die Segmente zeigen die Personenverteilung auf die drei Baustellen (2/3/1). Sie behaupten keine freie Kapazität.
- **C:** Mein Vorschlag für die Struktur: klarere Aktionswörter, keine doppelte Personenkennzahl oben, mobil Aufgaben → Kalender → Team → Zuletzt geöffnet. Das Teamband kann entfallen; die Kalenderlinie würde ich behalten.
- **Monteur:** eigener Einsatz mit Adresse/Anruf, „Wie zuletzt buchen“, „Andere Zeit“, Schein und Materialübernahme direkt erreichbar. Die letzte Zeit öffnet nur ein vorausgefülltes Formular; sie bucht noch nichts.
- **Rechnung:** Zahlung und PDF sichtbar. Mahnung/Korrektur folgen dem tatsächlichen Belegzustand. Keine Bankgarantie im Beispiel ohne Rücklass.
- **Benutzer:** Anmeldekennung als getrennte, nicht direkt bearbeitbare Angabe. Kontoumstellung bleibt ein eigener geschützter Weg.

Keine unnötigen Diagramme, Erfolgsbanner, dekorativen Kennzahlen oder zusätzlichen Icons. Grafische Akzente sollten Zeit, Zuordnung oder einen bestehenden Zustand erklären. Leerzustände bleiben bewusst leer, statt mit erfundenen Kennzahlen gefüllt zu werden.

## Funktionserhalt: belastbare Aussage

Die bestehende App ist unverändert. Dieser Entwurf entfernt dort keine Funktionen. Für die spätere Umsetzung ist eine pauschale Garantie anhand von Screenshots jedoch nicht seriös.

Das vorherige Gesamtkonzept enthielt 206 Ansichten und eine breite Zuordnung zu Routen und Komponenten. Das beweist noch nicht, dass jede Aktion, Bedingung und Berechtigung korrekt dargestellt ist. Bei der gezielten Gegenprüfung wurden echte Lücken im Mockup gefunden: Einsatzkontakt/Adresse und letzte Zeitvorlage waren nicht sichtbar; die Anmeldung war zu frei editierbar; Bankgarantie wurde ohne passende Belegbedingung gezeigt. Diese sechs neuen Ansichten korrigieren diese konkreten Beispiele. Die übrigen Ansichten des früheren Entwurfs sind dadurch nicht automatisch korrigiert oder neu abgenommen.

`Funktionsschutz.json` hält die geprüften Zusammenhänge und die Pflichten für die Umsetzung fest. `bestandsfunktionen.json` enthält 977 historische Zuordnungseinträge aus dem Repository als Arbeitsgrundlage. Deren frühere Prüfvermerke gelten ausdrücklich NICHT als Prüfung dieser neuen Linie.

Vor einem Umbau sind noch nötig:

1. Die Bestandswege vollständig den neuen Ansichten zuordnen: Felder, Aktionen, Bedingungen, Rollen, Seiteneffekte und Rückwege.
2. Entwürfe nachziehen, wo diese Zuordnung eine Lücke zeigt. Rechte, Berechnungen, Speichern, Exporte und Bestätigungen bleiben an die bestehenden Komponenten angebunden.
3. Arbeitsabläufe gegen die echte App prüfen: Zeit/Abwesenheit, Schein bis Unterschrift und Verrechnung, Angebot/Auftrag/Rechnung, Zahlung/Guthaben/Storno, Material/Planung sowie Benutzerverwaltung.
4. Mobil Tastatur, Fokus, ungespeicherte Eingaben, Uploads, Unterschriften und Listenrückkehr mit realen Zuständen prüfen. Die Schein-Schritte müssen ihren Zustand behalten.

## Umfang dieser Lieferung

Sechs Vergleichsansichten, jeweils Desktop (1440), Tablet (834) und Mobil (390). `galerie.html` lokal öffnen; dort sind Screens und Vorschau verlinkt. Das ZIP entpacken und dann öffnen. Schriften sind eingebettet. Der automatisierte Browser dieser Cloud sperrt file://; geprüft wird die Galerie daher über den lokalen Server ohne externe Netzanforderungen. Alternativ lässt sie sich mit `python -m http.server 8000` aus dem entpackten Ordner und `http://localhost:8000/galerie.html` öffnen. Die übernommenen weiteren Vorschauansichten stammen aus Entwurf 06 und dienen nur der Navigation, nicht als neue Einzelprüfung.

`bildpruefung.json` dokumentiert die 18 Darstellungen; `pruefung.json` die ergänzenden Prüfungen. Diese prüfen das Mockup, nicht den produktiven Backendbetrieb oder die vollständige Funktionsgleichheit.
