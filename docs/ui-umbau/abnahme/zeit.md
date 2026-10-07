# Abnahmeblatt — E8 Formulare: Zeiterfassung, Urlaub und Anträge (Paket „zeit“)

Vorlage: Protokoll Anhang 12.3. Was in diesem Paket nicht geprüft werden
konnte, steht ausdrücklich als **offen** da.

```text
Schritt:            E8 – Formulare (Zeiterfassung /time, Urlaub und Anträge /vacations
                    mit den Büro-Reitern Krankenstände und Betriebsurlaub)
Stand / Tag:        Zweig worktree-agent-a5c36798eb5940444 (auf ui-lot f30424d), Commits siehe Bericht
Bestandsvergleich:  134 Elemente in docs/ui-umbau/zuordnung-zeit.json, 134 zugeordnet, 0 offen,
                    kein Klickweg länger als +1 (Bestandsskript nicht gelaufen — die Liste ist
                    von Hand aus dem Code und den Ansichten je Rolle erhoben)
Rechte:             unverändert — keine Bedingung über Rollen geändert; die antippbare Zeile der
                    Zeiterfassung trägt genau die Bedingungen des früheren Knopfs „Bearbeiten“
                    (Test: gesperrte Zeilen verrechnet/ZA/Jugendschutz öffnen nichts).
                    Gegenproben über die Schnittstelle: offen (keine Datenbank-Tests in diesem Paket)
Prüfungen:          tsc und lint grün; 23 Testdateien / 299 Tests grün (TimeView, alle TimeForm*,
                    AntragKnopf, VacationsView, SonderurlaubKarte, BetriebsurlaubHinweis,
                    Abwesenheiten, AccountingView, LotBausteine, ausgangsfachNaht,
                    eintrittUndTagessoll, zeitPlausibilitaet).
                    Gegenprobe: 17 neue/angepasste Prüfungen gegen den alten Stand rot, mit dem
                    neuen grün. Browser-Wege Chromium/WebKit und Zeitraffer: offen (laufen nach dem
                    Zusammenführen in der Hauptsitzung)
Breiten:            390 / 834 hoch / 1112 quer / 1280 / 1440 in der Vorschau (Rollen Mitarbeiter,
                    Buchhaltung), hell und dunkel — kein seitliches Überlaufen
                    (scrollWidth − innerWidth = 0), Hauptaktion „Zeit buchen“ am Handy im
                    Daumenbereich (Aktionsleiste). Gemessen bei 390 px: „Zeit buchen“ 48 px,
                    „Weitere Angaben“ 48 px, „Ältere Einträge laden“ 48 px, „Löschen“ 44 px.
                    WebKit: offen
Belege/Exporte:     nicht berührt (keine Datei der Belege/Exporte geändert); Prüfsummen: offen
Mengengerüst:       nicht gemessen (offen); die Datenschicht ist unverändert, die Liste lädt
                    weiter monatsweise („Ältere Einträge laden“)
Bedienbarkeit:      Zeilen-Ziele mit Vorlesetext („… bearbeiten“, „– Verlauf anzeigen“),
                    Fokus springt beim Bearbeiten ins Formular; Seitenfenster mit Fokusfalle und
                    Esc (Baustein). axe-Lauf: offen
Rückgängig:         keine neue Umkehr; alle Bestätigungsdialoge unverändert (Löschen, Zurückziehen,
                    Zurücknehmen, Ablehnen, Jugendschutz, Betriebsurlaub anlegen/löschen,
                    Krankmeldung löschen)
Fehlerprotokoll:    in der Vorschau keine Fehler der Seite (nur gesperrte Schriftdateien)
Bildschirmfotos:    nicht ins Repository gelegt (Vorschau-Fotos lagen im Arbeitsverzeichnis);
                    docs/ui-umbau/nachher/E8/: offen
Dokumentation:      Handbuch („Bearbeiten“ ist jetzt die Zeile; Antrag mit Verlauf; Krankmeldung
                    im Seitenfenster) und FUNKTIONEN.md: offen — gehören nicht zu den Dateien
                    dieses Pakets
Freigabe Betreiber: ____________________  Datum: __________   (offen, Entscheidung E5)
```

## Was sich geändert hat (Kurzfassung)

- **Zeiterfassung:** Formularkarte höchstens 36 rem; neben „Meine Einträge“,
  wo beide Platz haben (ab etwa 1.400 px), sonst untereinander. Die ganze
  Zeile öffnet einen Eintrag zum Bearbeiten und holt das Formular ins Bild;
  „Löschen“ bleibt eigener Knopf. „Weitere Angaben“ als Baustein der Linie.
  Erklärungen zu Krank, Urlaub, Berufsschule, Zeitausgleich in einem Satz
  plus „i“. Krankmeldung eines Krank-Tags im Seitenfenster.
- **Urlaub und Anträge:** Antrag neben „Meine Anträge“, wo beide Platz haben.
  Eigene Anträge (Urlaub, Zeitausgleich, Sonderurlaub) öffnen ein
  Seitenfenster mit dem Verlauf als Lot und denselben Handgriffen. Krank-
  Erklärung in einem Satz plus „i“. Büro-Reiter Krankenstände und
  Betriebsurlaub: Formular neben der Liste; „Mitarbeiter ausnehmen“ unter
  „Weitere Angaben“.

## Offene Punkte und Lücken

1. **Monatsansicht für Genehmigende** (Protokoll E8: „Genehmigende sehen die
   Monatsansicht daneben“) ist nicht gebaut. Die Seite lädt nur die offenen
   Anträge und die genehmigten Urlaube der Antragsteller selbst, nicht alle
   genehmigten Abwesenheiten im Monat; eine Monatsansicht daraus wäre
   unvollständig und damit irreführend. Es gibt `listApprovedVacationsInRange`
   und `MonthCalendar`, aber die Ansicht wäre eine neue Funktion mit neuer
   Abfrage — gesondert zu entscheiden. Bis dahin bleibt die Zeile
   „Gleichzeitig im Urlaub: …“ je Antrag die Auskunft.
2. **Verlauf nur aus dem, was der Antrag trägt:** Zeitpunkt des Antrags und der
   letzten Entscheidung. Wird ein genehmigter Urlaub zurückgenommen, ist die
   Genehmigung im Verlauf nicht mehr zu sehen (die Datenbank überschreibt sie).
3. **Krankmeldung „Ende ändern“** klappt in den Listen (eigene Meldungen,
   Krankenstände) weiter ein Feld in der Zeile auf, statt ein Seitenfenster
   zu öffnen (Regel 8). Bewusst so gelassen: in der Zeiterfassung steht die
   Liste schon im Seitenfenster, ein Fenster im Fenster wäre schlechter.
4. Die Krankmeldung im Seitenfenster konnte in der Vorschau nicht angesehen
   werden (die Beispieldaten haben keinen Krank-Tag mit Meldung); geprüft im
   Komponententest.
5. In der Aktionsleiste bricht „Abbrechen“ bei 390 px als „Abbreche|n“ um
   (beim Bearbeiten eines Eintrags) — vorbestehend, gemeinsamer Baustein.
