# Abnahmeblatt R4-C – Monat mit Balken und Vorschau

```text
Paket:              R4-C „monat“ (Auftrag Abschnitt 5, Bausteine aus Abschnitt 6)
Stand / Tag:        Arbeitsbaum Paket C auf ui-lot-r4 e91a3ce, noch nicht zusammengeführt
                    (die Seite WochenplanView gehört Paket B und verdrahtet die neuen Props
                    erst beim Zusammenführen – bis dahin fehlen auf der echten Seite
                    „Bearbeiten“, „Termin ändern“, die Termin-Punkte und die Sicht „Baustellen“;
                    vollständig zu sehen auf /_muster)
Bestandsvergleich:  16 Einträge in docs/ui-umbau/r4/zuordnung-monat.json, keiner ohne neuen Ort,
                    keiner mehr als 1 Klick weiter (Abschnitt 9: Tag → Vorschau → Zur Woche +1,
                    Liste → Sicht „Baustellen“ +1 ab Tablet, am Handy bleibt die Liste).
Rechte:             unverändert. Grund einer Abwesenheit so, wie die Datenbank ihn liefert
                    (null → „abwesend“, Test); „Termin ändern“ nur mit darfTermineSchreiben,
                    sonst „Termin ansehen“ (dasselbe Fenster der Seite, schreibgeschützt);
                    „Baustelle öffnen“ nur mit canAccess('/admin-projects').
Daten:              keine neue Abfrage, keine Serverfunktion. Die Vorschau zeigt, was der Monat
                    geladen hat; beim Öffnen über bestehende Abfragen: Rüstlisten des Tages
                    (listEinsatzMaterialForDate) und lager_frei (lagerFrei) wie das Formular,
                    fehlende Baustellen (listProjectsByNumbers); Tage ausserhalb des Monats
                    (listAssignmentsForDate, listAbwesendInRange, listTermineImZeitraum,
                    listBetriebsurlaubeImZeitraum) – je Tag einmal, kein N+1 je Person.
Prüfungen:          tsc grün, lint grün. Neue Tests: tests/unit/kurzname.test.ts (50),
                    tests/unit/monatsBalken.test.ts (36), tests/components/MonatsAnsicht.test.tsx
                    (27) – alle grün; Lot-Wächter lotGrundwerte/lotRegelnQuelltext grün.
                    tests/components/WochenplanView.test.tsx: 1 Prüfung („Planung – Monat“)
                    hält das alte Aussehen fest und gehört Paket B – Ersatz steht im Bericht und
                    ist im Arbeitsbaum gegengeprüft (grün). Gegenprobe Monatsgrenze: ohne die
                    Sperre (`imMonat`) wird der Test rot.
Breiten:            Vorschau, 390 / 834 / 1440 / 1920, hell; 390 / 1440 dunkel:
                    scrollWidth − innerWidth = 0 auf der Seite und der Musterseite.
                    834 quer: offen.
Belege/Exporte:     nicht berührt (keine Datei unter lib/db, keine *Pdf/*Export-Datei, kein
                    Kalender-Abo).
Mengengerüst:       25 Personen × 31 Tage: höchstens 2.500 Elemente im Raster (Test, jsdom;
                    überschlagen rund 1.300). Seite fertig ≤ 1,5 s: offen (kein Testbestand).
Bildschirmfotos:    docs/ui-umbau/r4/nachher/ – monat-projektleiter-{390,834,1440,1920}.jpg
                    (echte Seite, alte Verdrahtung), muster-*.jpg (alle Props, Vorschau,
                    Rand, Tastatur, Sicht „Baustellen“, Handy-Blatt, Person, dunkel).
Dokumentation:      Handbuch und docs/stand-2026-10-03.md: Textvorschlag im Bericht – offen
                    (gemeinsame Dateien, Hauptsitzung).
Freigabe Betreiber: erteilt (09.10.2026)
```

## Abnahme 5.5

- [x] **Jeder Einsatz des Testmonats ist über genau einen Balkentag erreichbar.**
  `monatsBalken.test.ts` („Abnahme 5.5 – jeder Einsatz liegt auf genau einem
  Balkentag“): für jede Einsatzzeile genau ein Balken dieser Baustelle in der
  Zeile der Person, der den Tag abdeckt; Gegenprobe: kein Balken über einem
  Tag ohne Einsatz. Gegen den Testbestand nach Abschnitt 7: offen.
- [x] **Die Vorschau zeigt dieselben Daten wie das Seitenfenster.**
  `MonatsAnsicht.test.tsx` („Vorschau und Seitenfenster sagen dasselbe“):
  dasselbe Paar Tag × Baustelle in der Vorschau und im gerenderten
  `EinsatzFenster` – Eingeteilte, Aufgabe, Beginn–Ende, Termin der Baustelle.
  Dieselbe Regel steht als reine Rechnung in `monatsVorschau.ts`
  (`existing[0]` für Zeit und Aufgabe, Fehlmenge wie `RuestlistePlanen`).
- [ ] **„Bearbeiten“ aus der Vorschau und der Klick in der Woche öffnen ein
  identisches Seitenfenster.** Die Vorschau ruft `onEinsatz({ datum,
  projectNumber })` – dieselbe Form wie der Einsatzblock der Woche
  (`setFenster`). Der DOM-Vergleich braucht die Verdrahtung durch Paket B:
  **offen bis zum Zusammenführen.**
- [x] **← → blättern auch über Monatsgrenzen, das Raster bleibt stehen.** Der
  Tag ausserhalb wird nachgeladen und gezeigt; dort gibt es nur „Zur Woche“,
  nie ein Fenster mit leerer Planung (Test mit Gegenprobe; Fehlschlag sagt
  „Dieser Tag konnte nicht geladen werden.“).
- [x] **Bei 1.440 px liegt die Vorschau vollständig im Bild, auch am rechten
  Rand und in der untersten Zeile.** Gemessen in der Vorschau (Musterseite):
  letzter Tag der untersten Zeile → Abstand rechts 12 px, unten 137 px; bei
  834 px rechts 12 px; bei 1.920 px im Bild. Passt sie weder unter noch über
  die Klickstelle, steht sie daneben statt über dem Balken.
- [x] **Vorschau öffnen ≤ 150 ms (ohne Nachladen).** Grob gemessen im Browser
  (Entwicklungsbuild, Klick bis Vorschau im DOM): 68–108 ms bei 1.440,
  70–118 ms bei 834, 79–107 ms bei 1.920. Mit Nachladen ≤ 500 ms: offen
  (die Vorschau-Umgebung hat keine Netzwerkzeit).
- [x] **Das Handy-Blatt verdeckt die untere Leiste, die Hauptaktion bleibt
  danach erreichbar.** Blatt im Schleier (Ebene 40 über Leiste 30 und
  Daumenleiste 20), höchstens 82 vh; nach dem Schliessen steht die Seite wie
  vorher (Foto muster-blatt-390.jpg).

## Abschnitt 8 (Auszug, was dieses Paket betrifft)

- [x] Tastatur: Balken sind Knöpfe (Tab), je Zeile ein Tag im Tab-Lauf (heute,
  sonst der erste), alle übrigen Tage über ← → in der Vorschau; Kopf je Tag
  ist ein Knopf. Fokus beim Öffnen auf ×, beim Schliessen zurück auf das
  markierte Element (Balken bzw. der Tag, auf dem die Vorschau zuletzt stand).
  `role="dialog"` mit `aria-labelledby`; am Handy `aria-modal` mit Fokusfalle.
- [x] `aria-label` mit Person, Tag und Zustand an Balken, Tagen und Kopf.
- [x] Kontrast Bernstein auf Bernstein-hell und Grau auf `--abwesend` ≥ 4,5:1
  (Wächter lotGrundwerte, beide Sätze).
- [ ] axe ohne neue Fehler: offen (Hauptsitzung).
- [ ] Browser-Wege 5, 6, 7 (Monat → Balken → Vorschau → „Bearbeiten“ …): offen
  – brauchen die Verdrahtung durch Paket B; heute benutzt kein Weg in
  `tests/durchklick/` den Monat.

## Entscheidungen

1. **Beschriftung ab 46 px gemessen**, nicht über eine Mindestzahl Tage je
   Breitenstufe: die Tagesbreite hängt an Bildschirm, Seitenleiste und
   Monatslänge (1.440 px ≈ 30 px, 1.920 px ≈ 45 px). Ein ResizeObserver misst
   einen Tageskopf; vor der ersten Messung ohne Text.
2. **Abwesenheit als durchgehender Balken auch über das Wochenende**, wie die
   Datenbank den Zeitraum liefert und wie der Monat sie schon vorher zeigte.
   Nur Einsatzbalken enden am einsatzfreien Tag.
3. **Kopf eines Tages öffnet „Alle Einsätze“ des Tages** (wie der Handy-Tag
   bei „Alle Personen“): so erreicht man am Schreibtisch auch Termine ohne
   Teilnehmer im Raster und die Lieferung ohne Annahme.
4. **„Baustellen diesen Monat“ bleibt am Handy**: die Sicht „Baustellen“ gibt
   es dort nicht; ohne Liste fehlte der Überblick.
5. **Rüstliste mit Fehlmenge** über die bestehenden Abfragen des Formulars
   (Listen des Tages und `lager_frei`), mit derselben Regel; ohne Lagerstand
   nur „N Positionen“.
6. **Kurzname nur, wo der Name es sagt** (Rechtsform, Gemeinde, Familie,
   Anrede/Titel, bekannter Vorname); im Zweifel der volle Name.

## Nach dem Zusammenführen (09.10.2026, Hauptsitzung)

- Die Seite übergibt alle Teile der Schnittstelle (`sicht`, `termine`, `zuAm`, `onEinsatz`, `onTermin`, `onZurWoche`); „Bearbeiten“, „Termin ändern“, die Punkte im Tageskopf und die Sicht „Baustellen“ stehen damit auch auf der echten Seite. Die Monatsprüfung in `WochenplanView.test.tsx` deckt Vorschau → „Zur Woche“ → markierter Tag → „Zurück“ ab; der Browser-Weg 6 steht in `tests/durchklick/runde4.spec.ts`.
- „Lieferung ohne Annahme“ und die Kurzform „Max M.“ haben je eine Stelle (`wochenTermine.ts` bzw. `kurzname.ts`) für Woche und Monat.
- Unabhängige Prüfung: „Zurück“ bei offenem Seitenfenster schließt es jetzt (sonst hätte es mit leerer Planung gestanden); die Vorschau geht beim Rollen mit ihrem Balken mit; am Tablet stehen die Tageszahlen im Kopf eine Stufe kleiner, damit sie nicht zusammenlaufen.
