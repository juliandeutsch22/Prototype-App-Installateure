# Lot v2 · Revision 09

Die Rückmeldung war eindeutig: Der Wochenplan soll näher am aktuellen Stil bleiben. Die Mitarbeiterübersicht braucht eine deutlich stärkere Überarbeitung.

## Wochenplan: den aktuellen Charakter erhalten

Die Originalkomponenten des ausgecheckten Produktstands wurden über `npm run vorschau` mit gestubbten Beispieldaten gerendert und mit dem Entwurf verglichen. Grundlage sind `src/features/assignments/WochenRaster.tsx`, `WochenEintraege.tsx` und `src/styles/lot-planung.css`. Das ist ein Vergleich mit dem aktuellen lokalen Quellstand, kein Zugriff auf Produktionsdaten oder eine neue Live-Abnahme.

- Wieder dunkle Petrolflächen mit weißer Schrift und kleinen Radien für Einsätze.
- Kompaktere Zeilen; helle, klar abgegrenzte freie Zellen; graue Abwesenheiten und bernsteinfarbene Konflikte.
- Umschalter mit gefüllter aktiver Fläche, wie im Bestand.
- Anpassung an die neue Linie über Schrift, Kopfbereich, Navigation und Abstände. Kein neuer Diagramm- oder Kartenaufbau.
- Acht fiktive Personen in vier Gruppen zeigen den Plan mit realistischerer Informationsdichte.

## Mitarbeiterübersicht: Personen vergleichen, Tage lesen

Die Standardansicht verbindet eine kompakte Personenliste mit einem großen Monatsnachweis der ausgewählten Person. Dadurch werden Stunden und Zustände an den Tagen direkt lesbar. Die Summen bleiben nebeneinander vergleichbar.

- Links: Name, gebucht, Soll bisher, Monatssaldo und ein konkreter Hinweis, wenn Buchungen fehlen oder eine Arbeitszeitgrenze betroffen ist.
- Rechts: Monatskalender mit Stunden pro gebuchtem Tag, Urlaub als Wort, fehlender Buchung in Bernstein und Arbeitszeitgrenze mit roter Unterkante. Zukunft wird nicht als fehlende Buchung gewertet.
- Ein gewählter Tag zeigt darunter den Nachweis bzw. den Einstieg zur Zeiterfassung.
- „Tagesliste“ zeigt Uhrzeiten, Pausen und Dauer in Textform. Das vollständige Zeitkonto und die Urlaubsauswertung bleiben als eigener Weg erhalten.
- **Der gemeinsame Monatsvergleich aller Personen bleibt unter „Alle Tage vergleichen“ erreichbar.** Der große Kalender ergänzt diese Fähigkeit; er soll sie nicht streichen.
- Die Wochenansicht bleibt ein Vergleich mit lesbaren Tagesstunden und Von–Bis. Unterschiedliche Datenarten bleiben getrennt: Einsatzplanung zeigt Geplantes, Mitarbeiterübersicht zeigt Buchungen und anrechenbare Abwesenheiten.
- Am Handy und Tablet öffnet die Personenwahl einen eigenen Monatsnachweis. Auf Desktop bleibt der Vergleich links sichtbar. Auf Mobil bleiben Gebucht/Soll unter dem Namen und der Saldo rechts direkt sichtbar.

## Was bewusst noch offen ist

Dies ist ein UI-Entwurf mit fiktiven Daten, Stand 14.10.2026. Die App ist unverändert. Es gibt keinen Backendzugriff und keine echte Buchung oder PDF-/CSV-Erzeugung. Zeitraumblättern und einige weiterführende Aktionen sind als Vorschau gekennzeichnet. Verlinkte ältere Ansichten dienen der Navigation und sind nicht automatisch nach dem neuen Entwurf überarbeitet.

Die bestehenden Bearbeitungsformulare und Berechnungen sollen bei einem Umbau weiterverwendet werden. Die neue Auswahl-/Kalenderdarstellung muss an die bestehende Tagesauswertung angeschlossen werden; die Demo-Daten sind keine neu geprüfte fachliche Berechnung.

Vor Umsetzung nachzuziehen sind insbesondere:

1. Mehrere Buchungen pro Tag vollständig mit ihren einzelnen Aktionen zeigen; der große Kalender zeigt eine Tageszusammenfassung, die Tagesliste muss alle Einträge enthalten.
2. Alle zulässigen Abwesenheitsarten, Teilabwesenheiten, fehlende Kontokonfiguration, Eintritt/Austritt, individuelle Sollzeiten, Jahreswechsel und Arbeitszeitgrenzen integrieren.
3. Bestehende Sperren und Korrekturwege erhalten: verrechnete Zeiten, Urlaubsanträge, Krankmeldungen und Freistellungen werden über ihre erlaubten Abläufe geändert.
4. Alle Exporte, Filter-/Rückkehrzustände, Lade-/Fehlerzustände und Rechte einschließlich Supportzugang vollständig anbinden.
5. Im Wochenplan Helferzuordnung, Termine ohne Baustelle, mehrere Einsätze, Wochenende mit Einsatz, Rüstliste, Materialanforderung und Einzellöschung vollständig erhalten.
6. Große Belegschaften, lange Namen, Tablet-Scroll und Tastaturbedienung mit den tatsächlichen Komponenten prüfen.

Der Funktionsvertrag aus Entwurf 08 liegt als `Bestandsvertrag-08.md` bei und gilt als Arbeitsgrundlage weiter. Screenshots und die Prüfung dieser Vorschau sind kein Nachweis vollständiger Funktionsgleichheit.

## Prüfung der Lieferung

Sieben Darstellungen in drei Breiten (1440, 834, 390). Die siebte Darstellung zeigt den erhaltenen gemeinsamen Monatsvergleich. Zusätzlich gibt es die Personenansicht als Kalender und als Tagesliste. Screens und Messungen stehen unter `bilder/` und `bildpruefung.json`; ergänzende Prüfungen unter `pruefung.json` und `wcag.json`.

Die Bilder `bestand-wochenplan.jpg` und `bestand-mitarbeiter.jpg` stammen aus der lokalen Originalkomponenten-Vorschau mit Testdaten. Deren Meldungen/Zahlen sind keine Produktionsbefunde. Vollseitenbilder der neuen Entwürfe zeigen das Raster vollständig; in der interaktiven Vorschau scrollt es innerhalb der Ansicht.
