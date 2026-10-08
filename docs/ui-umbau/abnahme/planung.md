# Abnahmeblatt – E2 Planung

```text
Schritt:            E2 – Planung (Tag planen, Wochenplan, Team-Woche, Mein Einsatzplan, Termine)
Stand / Tag:        Arbeitsbaum Paket „planung“ (auf ui-lot f30424d), noch nicht zusammengeführt
Bestandsvergleich:  65 Einträge in docs/ui-umbau/zuordnung-planung.json, 0 ohne neuen Ort,
                    kein altes Element mehr als 1 Klick weiter. Kein Bestandsskript-Lauf
                    (läuft in der Hauptsitzung) – Zuordnung von Hand aus dem Code.
Rechte:             unverändert: dieselben Routen, dieselbe Auswahl `einplanbar`, Team-Woche
                    ohne Knöpfe, ohne „frei“, ohne Monat; Termine schreiben nur `darfTermineSchreiben`;
                    Kalender-Abo „gesamt“ nur Planende mit Erlaubnis, nicht im Supportzugang.
                    Gegenproben über die Schnittstelle: offen (Datenbank-Tests nicht gelaufen).
Prüfungen:          tsc grün, lint grün; 15 Testdateien / 387 Prüfungen grün
                    (AssignmentsView, WochenplanView, MyScheduleView, KalenderAboKarte,
                    RuestlisteAbhaken, TermineKarte, Abwesenheiten, Baustellenakte, Kundenakte,
                    Dashboard, AusgelaufenesMaterial, PersonPicker, unit wochenplan, planungKopf,
                    startseite). Browser-Wege (Chromium/WebKit), Zeitraffer: offen (Hauptsitzung).
Breiten:            390 / 834 / 1440 in der Vorschau (Projektleiter: Woche, Monat, Baustellen,
                    Seitenfenster, Tag planen; Mitarbeiter: Mein Einsatzplan), hell und dunkel –
                    kein seitliches Überlaufen (scrollWidth − innerWidth = 0). 834 quer: offen.
                    Team-Woche nur im Test (die Vorschau hat den Schalter „Wochenplan für alle“ aus).
Belege/Exporte:     nicht berührt (keine *Pdf/*Export-Datei geändert); Prüfsummen: offen.
Mengengerüst:       nicht gemessen – offen. Raster mit stehender Kopfzeile/Namensspalte und
                    Gruppen; „Noch einzuplanen“ und Monatslisten ≤ 20 mit „und N weitere“.
Bedienbarkeit:      Vorlesenamen der Zellen unverändert bzw. erweitert; axe: offen.
Rückgängig:         „Einsatz löschen“ bleibt mit Rückfrage (Umkehr wäre nicht exakt).
Fehlerprotokoll:    keine Laufzeitfehler in der Vorschau (nur 403/404 der gestubbten Ressourcen).
Bildschirmfotos:    nur im Arbeitsbereich angesehen, nicht abgelegt – offen.
Dokumentation:      Handbuch und FUNKTIONEN.md noch nicht nachgezogen – offen (Hauptsitzung).
Freigabe Betreiber: offen
```
