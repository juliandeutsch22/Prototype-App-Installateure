# Abnahme – Paket „verwaltung“ (E9 Einstellungen und Plattform, E6 Benutzerliste, E7 Benutzerakte, Anmeldung)

```text
Schritt:            E6/E7/E9 – Einstellungen, Benutzer, Benutzerakte, Plattform, Anmeldung, Zwei-Faktor, Recht, Module
Stand / Tag:        Arbeitszweig des Pakets (Commit siehe Bericht), auf ui-lot f30424d
Bestandsvergleich:  180 Einträge in docs/ui-umbau/zuordnung-verwaltung.json, alle zugeordnet, 0 offen;
                    weg_neu − weg_alt höchstens 1 (nur „Je Einstufung“ unter „Weitere Angaben“ und die
                    noch nicht verdrahtete Übersicht der Einstellungen)
Rechte:             unverändert — Rollen je Unterseite weiter aus navigation.ts (UNTER['/settings']);
                    die neue Übersicht liest dieselbe Liste (Test: Monteur, Buchhaltung, Leitung, Admin).
                    Gegenproben über die Schnittstelle: nicht gelaufen (keine Datenbank-Tests in diesem Paket)
Prüfungen:          tsc und lint grün; 25 Ansichtstests des Pakets grün (siehe Bericht für die Zahl).
                    Browser-Wege Chromium/WebKit, Zeitraffer, Datenbank-Tests, pruefen:links: OFFEN
                    (laufen nach dem Zusammenführen in der Hauptsitzung)
Breiten:            390 / 834 / 1440 in der Vorschau (Port 5219): kein seitliches Überlaufen auf
                    Sätze, Personal, Rechnungsvorgaben, Firmendaten, Kontenrahmen, Supportzugang,
                    Mein Konto, Datensicherung, Module, Benutzerliste (mit offenem Formular),
                    Benutzerakte, Plattform (mit Seitenfenster), Übersicht (vorübergehend verdrahtet).
                    834 quer: nicht eigens fotografiert — OFFEN
Belege/Exporte:     nicht berührt (keine *Pdf/*Export-Datei geändert); Prüfsummen nicht gelaufen — OFFEN
Mengengerüst:       nicht gemessen — OFFEN. Benutzerliste: Gruppen ≤ 20 mit „und N weitere“
                    (clientseitig; listUsers lädt alle, wie bisher)
Bedienbarkeit:      axe nicht gelaufen — OFFEN. Segmente mit aria-pressed, Sprungleiste als nav,
                    Seitenfenster mit Fokusfalle und Esc (Test PlattformView)
Rückgängig:         keine neuen Umkehrungen; alle Bestätigungen unverändert (Standardwerte,
                    Module ausschalten, Jugendschutz, Startpasswort, Deaktivieren, Datenauskunft,
                    Löschen eines Betriebs mit Kennung)
Fehlerprotokoll:    Vorschau ohne Ladefehler auf den fotografierten Seiten; Produktion nicht berührt
Bildschirmfotos:    im Scratchpad der Sitzung erstellt, nicht ins Repository übernommen — OFFEN
                    (docs/ui-umbau/nachher/ legt die Hauptsitzung an)
Dokumentation:      Handbuch und FUNKTIONEN.md nicht geändert (gemeinsame Dateien) — OFFEN:
                    „Neuer Benutzer“ heisst jetzt „Benutzer anlegen“; Filter als Segmente;
                    Verwalten eines Betriebs im Seitenfenster
Freigabe Betreiber: offen (entscheidungen.md E5)  Datum: __________
```

## Prüfliste „drei Breiten“

- [x] Kein seitliches Überlaufen (390, 834, 1440; gemessen scrollWidth − innerWidth = 0)
- [x] Keine abgeschnittene Beschriftung in den eigenen Seiten — behoben: „Deaktivierte (n)“ brach am Handy im Wort
- [ ] Offen in einer gemeinsamen Datei: „Schließen“ im Kopf des Seitenfensters bricht bei langem Titel („Schließ-en“), siehe Bericht
- [x] Hauptaktion am Handy im Daumenbereich („Benutzer anlegen“)
- [x] Seitenfenster öffnet und schliesst (auch Esc) — Plattform „Verwalten“
- [x] Heller Modus Standard; dunkler Modus lesbar (Akte, Module bei 834)
- [x] Gruppen ≤ 20 in der Benutzerliste

## Bekannte Lücken

- **Übersicht der Einstellungen** (Suche, Einrichtungsstand, alle Unterseiten) liegt als
  `EinstellungenUebersicht.tsx` mit Tests bereit, ist aber nicht erreichbar, bis App.tsx und
  navigation.ts sie verdrahten (Vorschlag im Bericht).
- **Einrichtungsstand** nur aus dem bereits geladenen Betrieb: Briefkopf, UID, Bankverbindung.
  Kostensätze, Kontenrahmen, Basiszinssatz (braucht den zentralen Satz) und Datensicherung
  liegen in eigenen Tabellen und erscheinen dort nicht.
- **Benutzerliste seitenweise vom Server**: `listUsers` lädt alle Benutzer; die Datenschicht wird
  nicht geändert.
