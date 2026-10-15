# Lot v2 · Planung und Mitarbeiterübersicht · Entwurf 08

## Grundentscheidung

Diese Arbeitsbereiche brauchen mehr Informationsdichte als die Startseite. Das Planraster und die Tageszustände sind funktionale grafische Elemente. Sie bleiben sichtbar. Einheitlich werden Schrift, Linien, Farben, Kopfbereich und Bedienung. Der bestehende Funktionsumfang ist die Grundlage; eine rein optische Neuentwicklung der Geschäftslogik ist nicht vorgesehen.

## Wochenplan und Einsatzplan

- Ein Bereich „Einsatzplanung“ mit **Woche / Monat / Tag**. In der Woche bleibt **Personen / Baustellen** erhalten: Wer hat wann einen Einsatz? Wer arbeitet wann auf einer bestimmten Baustelle?
- Desktop: Personen links, Tage oben; beide bleiben beim Scrollen stehen. Wochenende/Feiertag schmal nur solange ohne Inhalt. In der Vorschau ist das Wochenende leer; Einsätze am Wochenende müssen in der Umsetzung wie bisher die Spalten verbreitern.
- Pro Einsatz: eindeutig unterscheidbare Baustelle mit Nummer, geplante Uhrzeit oder vorhandener Ort, relevante Termine. Weitere Einsätze am selben Tag bleiben eigene Einträge. Aufgaben und Rüstliste stehen im Bearbeitungsfenster.
- **Konflikte bleiben dort, wo sie entstehen.** Eingeteilt trotz ganztägiger Abwesenheit wird mit Text und Bernstein hervorgehoben. Stundenweise Abwesenheit, Feiertage, Betriebsurlaub/Ausnahmen und Lieferungen ohne Annahme bleiben berücksichtigt. Rollenabhängig nur zulässige Abwesenheitsgründe zeigen.
- **Nicht eingeteilt** ist als Beschriftung präziser als eine allgemeine Verfügbarkeit. Die bestehende Ableitung wird beibehalten; sie ist keine Auswertung gebuchter Arbeitszeit und kein Beweis für freie Stunden. Untertägige Termine/Abwesenheiten bleiben zusätzlich sichtbar.
- Leere Zelle öffnet das Formular mit Tag und Person; Einsatz öffnet vorhandene Tag-/Baustellenplanung. Kopf eines Tages öffnet Tagesdetails und den Weg in die Tagesplanung. „Noch einzuplanen“ bleibt eine kompakte Zeile mit vollständiger Liste im Fenster.
- Keine dauerhaft offene zweite Werkzeugspalte. Auf Desktop ein Seitenfenster, auf schmalen Geräten eine große Detailfläche mit erreichbarem Speichern. Nur ein Bearbeitungsvorgang offen.
- Mobil bleibt die Wochentagswahl mit Tagesliste, großen Zielen und denselben Bearbeitungswegen. Das vorhandene Wochenraster wird nicht auf Telefonbreite zusammengedrückt.

## Mitarbeiterübersicht

- Die Übersicht bleibt eine Kontrollansicht für **Buchungen, Vollständigkeit und Salden**. Die Einsatzplanung beschreibt geplante Einsätze. Diese zwei Datenarten werden nicht still miteinander gleichgesetzt.
- Monat mit einem Feld pro Tag und einheitlichen Wochenmarken. Zukunft ist kein fehlender Eintrag. Abwesenheit, freie Tage, fehlende Buchung und Arbeitszeitgrenze müssen unterscheidbar bleiben; Farbe wird durch Wörter, Tooltip/Fokus oder Tagesdetail ergänzt.
- Woche mit Stunden und Von–Bis bzw. mehreren Buchungen/Abwesenheit als Wort. Summen erhalten klare Bezeichnungen für Woche/Monat. Die beiden Kennzahlen oben stammen wie bisher aus der Monatsauswertung; das neue Beispiel benennt die Monatsgrundlage zusätzlich.
- Personen mit Tagen ohne Buchung zuerst. Suche und der bestehende Filter über die Kennzahl bleiben. „Vollständig“ bedeutet vollständig gebucht, nicht automatisch fachlich freigegeben; Arbeitszeitgrenzen bleiben separat sichtbar.
- Pro Person gebucht, Soll bisher und Periodensaldo direkt lesbar. Gesamtsaldo, Resturlaub, Tagessoll, Abwesenheitsdetails und Tagesnachweise im Personenfenster. Ein Klick auf einen Tag wählt ihn dort vor.
- Monats-CSV im Seitenmenü; personenspezifische CSV, Zeitraum-PDF und Projekt-CSV bleiben in den vorhandenen Detail-/Exportabläufen. Keine neue Dashboard-Diagrammsammlung.
- Mobil pro Person eine klar gegliederte Zeile mit Streifen und beschrifteten Summen. Die 31 Mini-Felder sind dort ein großes Ziel für den Tagesnachweis; der konkrete Tag wird in der lesbaren Tagesliste gewählt. Die Wochenansicht behält direkt antippbare Tageszellen. Tablet darf das Raster innerhalb der Ansicht scrollen.

## Funktionserhalt und Grenzen des Mockups

Die App wurde nicht verändert. Die sechs neuen Ansichten zeigen Gestaltung und ausgewählte Bedienwege mit fiktiven Daten, Stand 14.10.2026. Sie sind kein Ersatz für die echten Formulare, Abfragen, Berechnungen und Exporte. Speichern, Zeitraumblättern, einige weiterführende Aktionen und Downloads sind Vorschauaktionen. Weitere verlinkte Ansichten stammen aus Entwurf 06.

Das neue Einsatzfenster zeigt den Kern; **Helferzuordnung, weitere Personen, volle Rüstlistenbearbeitung, Materialanforderung und Einzellöschung sind in der Vorschau nur verlinkt bzw. im Funktionsvertrag festgehalten, nicht vollständig neu ausgearbeitet**. Ebenso stellt das Personenfenster nicht alle Abwesenheits-/Korrektur-/Exportzustände dar. Diese Grenzen dürfen bei der späteren Umsetzung nicht zum Streichen der Bestandsfunktionen führen.

Verbindliche Grundlage für einen späteren Umbau:

| Zusammenhang | Beibehalten | Bestehende Quelle |
|---|---|---|
| Zeitraum, Woche/Monat/Tag, Personen/Baustellen, Browser-Zurück | Auswahl und URL-Kontext; bestehende Kalenderwege | `Einsatzplanung.tsx`, `PlanungsKopf.tsx` |
| Namen und Tagesköpfe, Gruppen, mehrere Einsätze | Fixierung, Tastaturbedienung, ein-/ausklappbare Gruppen, keine abgeschnittenen Baustellennamen | `WochenRaster.tsx`, `WochenEintraege.tsx` |
| Wochenende, Feiertag, Betriebsurlaub, stundenweise Abwesenheit | Bedingte Darstellung und Ausnahmen | `useWochenDaten.ts`, `wochenplan.ts`, `wochenTermine.ts` |
| Mannschaft ändern | Vorhandene ganze Planung vorab laden; passende Rollen/Helfer/Lehrling; einzelne Löschungen mit Bestätigung | `EinsatzFormular.tsx`, `EinsatzFenster.tsx` |
| Aufgabe, Zeit und Rüstliste | Bestehende Werte übernehmen, Validierung, vollständiges Speichern und Fehlerfälle | `EinsatzFormular.tsx`, `RuestlistePlanen.tsx` |
| Materialanforderung und Lager | Rüstliste allein bucht kein Lager; bestehender Anforderungs-/Abholablauf | `EinsatzFormular.tsx`, `RuestlisteAbhaken.tsx` |
| Tagesdetails und Termine | Teilnehmerrechte, Baustellenbezug, Termine ohne Baustelle, Lieferung ohne Annahme | `TagFenster.tsx`, `HandyWoche.tsx` |
| Eigener Plan / Team-Woche | Eigene Einsätze und erlaubte Teamansicht; keine Planungsrechte oder Kontodaten zusätzlich | `MyScheduleView.tsx`, `TeamWoche.tsx` |
| Zeitauswertung | Bestehende Berechnungen für Ist/Soll/Saldo/Urlaub/Arbeitszeitgrenzen; keine Neuberechnung aus dem UI | `AccountingView.tsx`, `tagesauswertung.ts` |
| Person und Tag | Alle Buchungen pro Tag, Fokus, markierter Tag, Rückweg und Filter | `UebersichtListe.tsx`, `PersonFenster.tsx`, `Streifen.tsx` |
| Bearbeitung und Schutz | Verrechnete Einträge geschützt; Krankmeldung/Urlaubsantrag/Freistellung über den jeweiligen Ablauf; Korrekturen/Löschen mit bestehenden Regeln | `PersonFenster.tsx`, `AccountingView.tsx` |
| Export und Rechte | Gesamtexport nicht still auf Suche beschränken; alle bestehenden Exportarten; kein Datenzugriff im Support oder für unzulässige Rollen | `AccountingView.tsx`, `ExportDialog.tsx`, `navigation.ts` |

Alle Featurequellen unter `src/features/assignments/` bzw. `src/features/accounting/`; Navigationsrechte unter `src/app/navigation.ts`. Geprüfte Ausgangsversion: `d4b8542821d86c7057761af16de1331d1de87e09`.

## Noch offen vor der Umsetzung

1. Die oben nur verlinkten Detailfunktionen und sämtliche bedingten Zustände im Entwurf vollständig nachziehen.
2. Alle bestehenden Aktionen/Felder/Rollen gegen die endgültige Oberfläche zuordnen.
3. Bestehende Komponenten weiterverwenden und vollständige Abläufe mit realer Persistenz testen, einschließlich gleichzeitiger Änderungen und Ladefehlern.
4. Bedienung mit vielen Personen, mehreren Einsätzen, langen Namen, Wochenendeinsatz, Tablet-Scroll, Tastatur und mobilem Formular prüfen.
5. Erst danach die neue Oberfläche als funktionsgleich abnehmen. Screenshots alleine reichen dafür nicht.
