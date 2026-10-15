# Lot v2 · Screen-Mockups 05

Sechs Situationen zum Beurteilen der nächsten gestalterischen Schritte. Grundlage ist Entwurf 04: Poppins, ruhige Überschriften, große Kennzahlen mit Gewicht 500, weiße Flächen und feine Trennlinien. Die neuen Ansichten zeigen zusammenhängende Arbeitswege und konkrete nächste Schritte.

## Ansehen

- `galerie.html` öffnen: sechs Screens, umschaltbar zwischen Desktop, Tablet und Handy. Ein Bild anklicken öffnet das PNG in voller Auflösung.
- `index.html` öffnen: eigenständige klickbare Vorschau, mit Ansichtswechsel oben. Funktioniert ohne Installation und offline; Schriften sind eingebettet.
- `Lot-v2-Screen-Mockups-Uebersicht.jpg` zeigt alle sechs Desktopansichten zusammen.
- `bilder/`: PNG mit zweifacher Pixeldichte, JPEG in normaler Auflösung, längere Ansichten zusätzlich als `-gesamt.png`.
- `bilder/07-rechnungsdetails-handy-gesamt.png` zeigt die mobile Rechnungsdetailansicht vollständig.

## Die sechs Screens

1. **Heute:** priorisierte Aufgaben, verständliche nächste Schritte und Tageskontext.
2. **Rechnungen:** verbundene Liste und Detailansicht am Desktop. Am Tablet/Handy ersetzt das Detail die Liste; die Rückkehr erhält Suche und Filter. Die Legende der Forderungsgrafik filtert dieselbe Liste.
3. **Handwerksschein:** ausgeführte Arbeit, Zeiten, Material und Unterschriften; sichtbarer Zusammenhang mit Baustelle und nächster Abrechnung.
4. **Baustellenakte:** verrechenbare Leistungen, Termine und Budget auf einer Fläche. Ein kompakter Hinweis führt zum nächsten Schritt.
5. **Zeit gebucht:** lokale Demo-Bestätigung direkt über der Eingabe; ein zusätzlicher Wocheneintrag und eine aktualisierte Wochensumme. Das zeigt den Zustand nach dem simulierten Speichern.
6. **Alles erledigt:** ruhiger Abschluss ohne große Illustration; keine überfälligen Rechnungen, daneben verbleibende fristgerechte Forderungen und die letzten Zahlungen.

Die ersten fünf Ansichten verwenden den 14.10.2026 als Beispieldatum. Screen 06 ist ein **separater Beispielzustand am Folgetag**, nachdem die zwei überfälligen Forderungen vollständig bezahlt wurden: € 18.420,00 − € 6.280,00 = € 12.140,00 weiterhin offen; € 24.960,00 + € 6.280,00 = € 31.240,00 im Oktober bezahlt. Er verändert die anderen Screens nicht.

## Umfang und Prüfung

Dies sind separate UI-Mockups mit fiktiven Daten, kein Umbau und keine neue Auslieferung der App. Die bestehende App, Rollen, Datenbank und Produktivdaten bleiben unverändert.

Klickbar sind Ansichtswechsel, Rechnungsauswahl, Suche/Zustandsfilter, Rückkehr zur Liste, ausgewählte Verknüpfungen, Demo-Auswahl unterschriebener Scheine und Zeitberechnung mit lokaler Speicherbestätigung. Die Fenster zu weiteren Funktionen beschreiben den vorgesehenen Einstieg; sie ersetzen keine vollständige Funktion. Insbesondere entstehen keine echten Rechnungen, PDFs, Mahnungen, Zahlungen oder Exporte. Änderungen sind nur im Arbeitsspeicher der Vorschau und nach einem Neuladen weg. Der vollständige Scheinablauf und weitere Baustellen/Kundenakten sind nicht ausgearbeitet.

`pruefung.json` dokumentiert die geprüften Demo-Wege sowie automatisierte WCAG-2-A/AA- und WCAG-2.1-A/AA-Prüfungen der sechs Hauptansichten plus Rechnungsdetail auf 1440, 834 und 390 px (21 Prüfungen ohne gemeldete Verstöße). `bildnachweis.json` dokumentiert die Bildgrößen und Kontrollen auf JavaScript-Fehler und seitliches Überlaufen. Die Offline-Vorschau ist zusätzlich ohne Netzwerk geprüft. Das ersetzt keine Abnahme der echten App und keine Prüfung auf physischen Geräten.

Schrift: Poppins aus der vorhandenen App-Abhängigkeit @fontsource/poppins, SIL Open Font License; siehe `OFL.txt`.
