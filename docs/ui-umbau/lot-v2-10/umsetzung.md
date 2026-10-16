# Lot v2 · Umsetzung des Gesamtkonzepts 10

Startfreigabe am 15.10.2026: „ja beginne mit der Umsetzung“. Grundlage ist das [freigegebene Gesamtkonzept mit 217 Ansichten](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/7ff7da699e9001b660006a5c85f861a60699cde0/lot-v2-gesamtkonzept-10/README.md). Die Entwürfe zeigen auch Dialoge und Fach-/Rollenzustände; sie sind keine 217 eigenständigen App-Routen.

## Gemeinsame Umsetzung

Die vorhandenen Lot-Bausteine tragen die neue Linie. Seitentitel 24/30 px, weiße Grundfläche im hellen Modus, Gruppen mit Trennlinien und Kennzahlen ohne äußeren Kartenrahmen. Zahlen erhalten den ausdrücklich gewünschten Poppins-Schnitt 500; Text und Titel bleiben 400/600. Der zusätzliche Schnitt ist lokal eingebunden, auch in der Vorschau. Dunkle Darstellung, Hausfarben, mobile Hauptaktionsleiste, Fokusführung und Benutzerpräferenzen bleiben erhalten.

Kunden, Angebote, Baustellen, Scheine, Material, Lager, Rechnungen, Zeit, Urlaub, Benutzer, Einstellungen, Plattform und Querschnittsansichten verwenden diese gemeinsamen Grundwerte. Bestehende Formulare, Belegaktionen und Zugänge werden nicht durch die statischen Mockup-Felder ersetzt. Die [Seitenzuordnung](seiten.json) nennt pro Konzeptzustand die echten Komponenten und zu erhaltenden Aufgaben. Sie ist eine Zuordnung, kein Beleg einer manuellen Prüfung jeder Datenkombination.

## Gezielte Änderungen

- **Mitarbeiterübersicht:** Der Monat beginnt mit dem Vergleich von Personen, Buchungsstand und drei Stundenwerten. Das bisherige Tagesraster bleibt unter „Alle Tage vergleichen“ erreichbar; `tage=alle` hält die Auswahl in der Adresse fest. Woche, Suche, Lückenfilter, Gruppen und Nachladen bleiben erhalten. Vorhandene Arbeitszeitgrenzfälle werden auch bei vollständigen Buchungen im Vergleich sichtbar.
- **Person:** Die vollständige Tagesliste bleibt der Einstieg, einschließlich mehrfacher Tagesbuchungen, Beleg-/Antragsverweisen, Grenzprüfung, Korrektur und Löschung nach bestehenden Regeln. Ein optionaler Monatskalender nutzt dieselbe Tagesauswertung und markiert die betreffende Zeile. Pfeiltasten sowie Pos1/Ende führen durch den Kalender. CSV, Zeitraumexport, Resturlaub, Tagessoll, Monatssaldo und Gesamtsaldo bleiben erhalten.
- **Fremderfassung:** Die vorhandene Erfassung im selben Seitenfenster bleibt unverändert angebunden. Person und fehlender Tag werden weiterhin vorbelegt; Abbrechen führt zur Person zurück. Es wird kein zweites eigenes Zeitformular gebaut.
- **Einsatzplanung:** Dunkle Einsatzblöcke bleiben. Die Formen sind zurückhaltender; Tages-/Namensköpfe, Gruppen, Personen-/Baustellensicht, alle Zeiträume, Konflikte und mobile Tageswahl bleiben. Rollflächen sind ausdrücklich mit der Tastatur erreichbar. Der reine Team-Leseplan behält seine Datenschutzgrenzen.
- **Start:** Bestehende Aufgaben und Rollenlogik bleiben. Eine feine grafische Linie verbindet die eigenen Termine. Sie behauptet keine maßstäbliche Zeitachse und ändert weder Reihenfolge noch Teilnehmerrechte.
- **Baustellen:** Der Budgetring liest dieselbe Budgetauswertung. Der Kreis endet bei 100 %, eine Überschreitung wird weiterhin als tatsächlicher Wert und in der bisherigen Fehlerfarbe dargestellt. Helfer und nicht angerechnete Lehrlingsstunden bleiben vom Budget ausgeschlossen.
- **Zeiterfassung:** Das Zeitband veranschaulicht die schon berechnete Arbeitszeit und eingegebene Pause. Unvollständige bzw. ungültige Werte zeigen kein irreführendes Band. Hinweise für Mitternacht, langen Tag und unplausible Pause bleiben erhalten.

## Funktionserhalt

Keine Änderungen an Datenbank, Migrationen, Datenschicht, Rollenregeln, Arbeitszeit-/Urlaubsberechnung, Belegen oder Exportdateien. Routen bleiben unverändert. Die zwei vorhandenen Browserwege für den Tagesstreifen wählen das jetzt optionale Raster ausdrücklich an; ihre fachlichen Vor-/Nachprüfungen bleiben bestehen. Der Team-Wochen-Snapshot ändert nur die zugängliche Beschriftung und Tastaturerreichbarkeit der Scrollfläche.

Neue Verhaltenstests wurden zunächst gegen die alte Umsetzung ausgeführt: Personenvergleich/Tagesraster, Kalender, Grenzfall im Vergleich, Budgetüberschreitung und Zeitband. Die jeweils erwarteten Gegenproben sind im Entwicklungsbericht erfasst. Die übrigen bestehenden Prüfungen schützen insbesondere Mehrfachbuchung, Fremderfassung, Rechte, CSV/PDF-Grundlagen und Team-Datenschutz.

## Abnahme

Testergebnisse und konkrete Grenzen stehen in [pruefung.md](pruefung.md). Vor einer produktiven Freigabe bleiben ein Vergleich mit echten Aufgaben des Betriebs und die Sichtprüfung auf dessen realen Mobilgeräten sinnvoll. Der Entwurf ersetzt keine fachliche Freigabe durch die Nutzer. Ein vollständiger Neuentwurf jeder geschützten Sondermaske war nicht das Ziel; vorhandene passende Abläufe bleiben in der gemeinsamen Linie.
