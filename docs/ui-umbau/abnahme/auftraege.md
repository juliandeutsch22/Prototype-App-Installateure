# Abnahmeblatt – Paket „auftraege“ (E6/E7)

```text
Schritt:            E6 – Listen Baustellen, Kunden · E7 – Akten Baustelle, Kunde · Meine Baustellen
Stand / Tag:        Zweig worktree-agent-a5094b6b6918a5add (auf ui-lot f30424d), noch kein Tag
Bestandsvergleich:  45 Einträge in docs/ui-umbau/zuordnung-auftraege.json, alle zugeordnet,
                    weg_neu − weg_alt ≤ 1. Das Bestandsskript (Phase A) lief NICHT erneut — offen.
Rechte:             unverändert: Liste/Akte Baustellen nur LEAD-Rollen (Route), Bearbeiten in der
                    Akte nur isGF, Kunden pflegen nur darfKundenPflegen, Baustellen übernehmen und
                    Zuordnen nur isGF, Angebote/Rechnungen/Termine in der Kundenakte je canAccess/
                    canInvoice/darfTermineSchreiben wie bisher (Komponententests je Rolle grün).
                    Gegenproben über die Schnittstelle: offen (Datenbanktests nicht gelaufen).
Prüfungen:          tsc grün · eslint grün · 9 Komponententests des Pakets + Wächtertests
                    (lotGrundwerte, markenfarben, abfragegrenzen, pflichtfelder, Tastflaechen …) grün.
                    Neue Prüfungen gegen den alten Stand gelaufen: rot (Gegenprobe), mit Änderung grün.
                    Browser-Wege Chromium/WebKit, Zeitraffer: offen (nicht ausgeführt, Vorgabe).
Breiten:            390 / 834 / 1440 hell, 834 und 390 dunkel in der Vorschau — kein seitliches
                    Überlaufen (scrollWidth − innerWidth = 0). 834 quer: offen.
Belege/Exporte:     nicht berührt (keine *Pdf/*Export-Datei, keine Datenschicht geändert).
Mengengerüst:       offen (nicht gemessen). Listen zeigen je Gruppe höchstens 20 Zeilen.
Bedienbarkeit:      Segmente mit aria-pressed, Sprungleiste als nav „Auf dieser Seite“, Seitenfenster
                    mit Fokusfalle. axe: offen.
Rückgängig:         keine neuen Rückgängig-Wege; alle Bestätigungen (Löschen Baustelle/Kunde/Plan,
                    Nummer ändern, gleicher Name, Bürobeleg) unverändert.
Fehlerprotokoll:    keine JS-Fehler in der Vorschau.
Bildschirmfotos:    nur in der Sitzung angesehen, nicht abgelegt — offen (docs/ui-umbau/nachher/).
Dokumentation:      Handbuch und FUNKTIONEN.md nicht nachgezogen (fremde Dateien) — offen, siehe unten.
Freigabe Betreiber: ____________________  Datum: __________   (offen)
```

## Offen fürs Handbuch

- Baustellenliste: „Aktiv & pausiert / Alle / Archiv (n)“ heisst jetzt „Laufend / Erledigt / Alle“, die
  Zahl steht über der Gruppe „Abgeschlossen“; „Akte“ entfällt, die ganze Zeile öffnet sie.
- Kundenliste: „Kunden aus einer Datei“ und „Bestehende Baustellen übernehmen“ stehen im ⋯ oben;
  „Nur Kunden ohne Kundenart“ heisst „Ohne Kundenart“ (Handbuch Zeile ~719 nennt den alten Namen).
- Akten: Stammdaten als aufklappbare Kurzzeilen, Sprungleiste, Verlauf der Baustelle.
