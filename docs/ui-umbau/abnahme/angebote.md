# Abnahme – Paket „angebote“ (E6 Listen, E7 Akten, E8 Formular)

```text
Schritt:            E6–E8 – Angebote (Liste, Formular), Angebotsakte, Wartungen (Anlage mit Wartungen als Lot)
Stand / Tag:        Arbeitsbaum worktree-agent-aa7795344ba1cc11a auf ui-lot f30424d
                    7d1a245 Umbau · 2884574 Fehler Anlagendaten (eigener Commit) · 2e6ed98 Wege ≤ +1
Bestandsvergleich:  125 Einträge in docs/ui-umbau/zuordnung-angebote.json, 125 zugeordnet, 0 offen,
                    jeder weg_neu − weg_alt ≤ 1 (das Erzeugerskript bricht sonst ab)
Rechte:             unverändert — darfAendern = isGF wie bisher; Buchhaltung (Akte) und Verwaltung
                    (Wartungen) sehen keine ändernden Knöpfe, auch nicht im ⋯ und im Seitenfenster
                    (Tests „lässt die Buchhaltung ansehen …“, „lässt die Verwaltung die Anlage ansehen …“,
                    „bietet der Verwaltung kein Eintragen an …“). Gegenproben über die Schnittstelle: offen.
Prüfungen:          tsc und lint grün; QuotesView 50, AngebotView 23, WartungenView 27 Tests grün;
                    dazu Tastflaechen und alle Quellprüfungen in tests/unit (675) grün.
                    Ganze Suite, Datenbank, Playwright/WebKit, Links, Zeitraffer: offen (Hauptsitzung).
Breiten:            390 / 834 / 1440, hell und dunkel, Vorschau Port 5216: kein seitliches Überlaufen
                    (scrollWidth − innerWidth = 0) auf Liste, Formular, Katalogfenster, Akte, Wartungen,
                    Anlagefenster, Wartungsformular. 834 quer: offen.
Belege/Exporte:     angebotPdf.ts unberührt (tests/unit/angebotPdf.test.ts, pdfUnveraendert grün);
                    Prüfsummen gegen die Referenz: offen.
Mengengerüst:       nicht gemessen (offen). Angebote: weiterhin 100 je Abfrage, jetzt mit „Weitere
                    Angebote laden“; Suche im Geladenen. Wartungen: 200 je Abfrage, Suche serverseitig.
Bedienbarkeit:      Segmente mit aria-pressed, Lot mit aria-current, Seitenfenster mit Fokusfalle und Esc,
                    ganze Zeile als Link/Knopf; axe: offen.
Rückgängig:         nicht eingeführt — keine der Aktionen ist exakt umkehrbar; alle Bestätigungen bleiben.
Fehlerprotokoll:    Vorschau ohne Seitenfehler; Produktion nicht angefasst.
Bildschirmfotos:    nur in der Sitzung angesehen (Scratchpad), nicht im Repository: offen.
Dokumentation:      Handbuch und FUNKTIONEN.md: offen (siehe unten).
Freigabe Betreiber: ____________________  Datum: __________
```

## Prüfliste drei Breiten

- [x] Kein seitliches Überlaufen
- [x] Keine abgeschnittene Beschriftung (Fensterkopf „Anlage“ statt langem Kundennamen, weil „Schließen“ sonst umbrach)
- [x] Tippflächen ≥ 44 px (ganze Zeile; Links im Lot mit Polster und Gegenrand)
- [x] Hauptaktion am Handy im Daumenbereich („Neues Angebot“, „Neue Wartung“, „PDF herunterladen“)
- [x] Seitenfenster öffnen und schließen (Schließen, Esc, Tipp daneben)
- [ ] Navigation je Breite — Hülle, nicht Teil dieses Pakets
- [x] Dunkler Modus lesbar
- [x] Gruppen ≤ 20, „und N weitere anzeigen“ (Tests mit 23 bzw. 25 Einträgen)

## Bekannte Grenzen und offene Punkte

- **Mehr als 20 Einträge in einer Gruppe einer Nebenansicht** (etwa Angebot Nr. 25 unter
  „Erledigt“ oder Vereinbarung Nr. 25 unter „Alle“): ohne Suche liegt sie zwei Tipps tiefer
  (Segment + „und N weitere“). Mit dem Suchfeld (Tippen, kein Klick) bleibt es bei einem. Der
  Zielkonflikt kommt aus dem Protokoll selbst (7.2 Gruppen ≤ 20 gegen 0.1.2 höchstens ein Klick).
- **Angebote: keine Suche auf dem Server.** Die Datenschicht kennt sie nicht; gesucht wird im
  Geladenen, `Nachladen` sagt das. Seitenweise je 50 (Protokoll 7.2) geht ebenfalls nicht —
  die Abfrage lädt 100 und mehr auf Anfrage.
- **Wartungen als Lot**: die App speichert je Anlage nur die letzte Wartung (`zuletztAm`,
  `letzteBaustelle`), keine Reihe früherer Ausführungen. Der Lot zeigt deshalb „Zuletzt gewartet“,
  „Eingeplant“ und „Nächste Wartung“, nicht die ganze Geschichte.
- **Angebotsverlauf**: Wann versendet, angenommen oder abgelehnt wurde, ist nicht gespeichert;
  dort steht kein Datum.
- Handbuch-Stellen, die die alten Orte nennen: Abschnitt Angebote (Karte „Weiter“ → ⋯ und
  Verlauf; „Aus dem Katalog …“ im Seitenfenster), Wartungen (zwei Karten → Segmente,
  Bearbeiten im Seitenfenster bzw. unter „Alle“).
