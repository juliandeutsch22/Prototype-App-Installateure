# Messbasis vor dem Umbau (Phase B, B1/B2)

Stand: Code vor dem Umbau (`6035627`), lokaler Supabase-Stapel, Testbetrieb
`ui-testbestand`. Gleiches Werkzeug für „nachher“ — siehe unten.

**Gemessen am 12.10.2026** (Stand 18, K4) auf `vor-ui-lot` (`4abb9ca`): der
App-Code ist dort derselbe wie in `6035627`, das nur die Unterlagen des
Umbaus hinzufügt. Gemessen am selben Tag und auf demselben Rechner wie
„nachher“; die Gegenüberstellung steht in `messung-nachher.md`.

## Testbestand „fünf Jahre Betrieb“ (B1)

Erzeugt mit `node scripts/ui-umbau/testbestand.mjs` (nur gegen
`127.0.0.1`/`localhost`; Abbruch bei jeder anderen Adresse). Stichtag
07.10.2026, Bestand ab 01.10.2021.

| Gegenstand | Menge |
|---|---|
| Mitarbeiter (alle Rollen; 3 Lehrlinge, einer unter 18 mit Geburtsdatum) | 25 |
| Kunden | 1.500 |
| Baustellen (40 laufend, 20 pausiert) | 3.000 |
| Angebote (mit je 2 Positionen) | 4.000 |
| Einsätze (die laufenden Baustellen auch in den nächsten zwei Wochen) | 20.000 |
| Zeitbuchungen (6 je Person und Werktag, ohne Überschneidung) | 150.000 |
| Scheine (unterschrieben, storniert, 10 Entwürfe; mit Zeiten und Material) | 15.000 |
| Rechnungen (Einzel, Anzahlung, Schluss; 120 storniert, 99 offen/überfällig/teilbezahlt) | 12.000 |
| Zahlungen | 14.000 |
| Anforderungen (40 offen: Offen, In Bearbeitung, Abholbereit) | 30.000 |
| Lagerartikel / Katalogartikel | 800 / 40.000 |
| Lagerbewegungen | 60.000 |
| Wartungen | 1.200 |
| Urlaubs- und Zeitausgleichsanträge (20 offen) | 3.000 |

Anmeldung: `<kurz>@ui-testbestand.test`, Passwort `Testbestand-2026!`
(`gf`, `admin`, `verwaltung1`, `verwaltung2`, `buchhaltung`, `pl1`–`pl3`,
`monteur1`–`monteur14`, `lehrling1`–`lehrling3`). Der Betrieb bleibt im
lokalen Stapel stehen; `--neu` entfernt nur ihn und legt ihn neu an.

**Grenzen des Bestands.** Geschrieben wird mit der Rolle des
Dienstschlüssels; Auslöser, die für den Dienst aussetzen, rechnen also
nicht mit. Stunden, Summen und „bezahlt“ setzt das Skript selbst. Es gibt
keine Krankmeldungen, Freistellungen, Termine, Rüstlisten, Fotos und
Dokumente; Abwesenheiten sind Urlaubs- und Zeitausgleichsanträge (ohne die
daraus gebuchten Urlaubstage). Für Ladezeit und Mengen reicht das; für eine
fachliche Prüfung nicht.

## Messung (B2)

`node scripts/ui-umbau/messung.mjs vorher` baut die App gegen den lokalen
Stapel (`npm run build` mit `VITE_SUPABASE_URL=http://127.0.0.1:54321` und
dem Anon-Schlüssel der CLI), startet `vite preview` auf Port 4320, meldet
sich als Geschäftsführung des Testbetriebs an und lädt jede Seite dreimal im
Handy-Profil. Je Seite der Median.

- **erste Anzeige**: First Contentful Paint;
- **Inhalt da**: die Überschrift der Seite (`main h1`) ist sichtbar;
- **bedienbar**: das Netz ruht (eine Sekunde keine offene Anfrage). Eine
  echte „Time to Interactive“ misst der Browser nicht; das ist die
  Annäherung, und sie ist streng: eine Liste, die im Hintergrund weiter
  nachlädt, gilt als nicht bedienbar;
- **Anfragen / übertragen**: alle Anfragen bis dahin, übertragene Bytes
  (ohne Zwischenspeicher, also erster Besuch);
- **grösste Liste**: die Tabelle mit den meisten Zeilen über alle
  Datenbankanfragen der Seite (Zeilen aus `Content-Range`).

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 12.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 3,6 s | 35,6 s | 114 | 6 743 KB | 54 | 6 459 KB | 5 400 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,4 s | 3,3 s | 12,8 s | 73 | 2 086 KB | 30 | 1 834 KB | 5 000 (rpc/lager_frei) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 2,8 s | 3,1 s | 39 | 344 KB | 16 | 120 KB | 100 (assignments) |
| Lager | `/lager` | 1,4 s | 2,7 s | 11,4 s | 52 | 1 907 KB | 19 | 1 670 KB | 5 000 (rpc/lager_frei) |
| Anforderungen | `/anforderungen` | 1,3 s | 2,8 s | 3,7 s | 44 | 397 KB | 11 | 158 KB | 200 (material_orders) |
| Material anfordern | `/material` | 1,4 s | 2,7 s | 6,0 s | 51 | 849 KB | 17 | 614 KB | 1 000 (rpc/lager_frei) |
| Rechnungen | `/invoices` | 1,4 s | 3,6 s | 7,9 s | 84 | 1 141 KB | 30 | 851 KB | 500 (customers) |
| Angebote | `/quotes` | 1,3 s | 2,8 s | 5,1 s | 46 | 651 KB | 11 | 414 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,3 s | 2,8 s | 7,6 s | 53 | 955 KB | 13 | 712 KB | 600 (projects) |
| Kunden | `/customers` | 1,3 s | 2,7 s | 3,0 s | 35 | 346 KB | 9 | 114 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,3 s | 3,2 s | 119,8 s | 109 | 22 607 KB | 69 | 22 344 KB | 25 880 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,3 s | 2,6 s | 2,6 s | 27 | 239 KB | 11 | 11 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 5 400 Zeilen in 12 Anfragen; assignments 1 520 Zeilen in 5 Anfragen; materials 1 000 Zeilen in 2 Anfragen; rpc/lager_frei 1 000 Zeilen; invoice_lines 198 Zeilen; invoices 99 Zeilen; wartungen 68 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): rpc/lager_frei 5 000 Zeilen in 5 Anfragen; materials 2 000 Zeilen in 4 Anfragen; assignments 720 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 100 Zeilen; projects 60 Zeilen
- **Lager** (`/lager`): rpc/lager_frei 5 000 Zeilen in 5 Anfragen; materials 2 000 Zeilen in 4 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): rpc/lager_frei 1 000 Zeilen in 2 Anfragen; materials 1 000 Zeilen in 3 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 120 Zeilen in 2 Anfragen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen; customers 500 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 25 880 Zeilen in 53 Anfragen
<!-- messung:ende -->

## Was das für den Umbau heisst

- **Lager lädt Artikel in Paketen von 1.000 Zeilen** (`materials`, 2.000
  Zeilen in einer Seitenansicht) und brauchte im Probelauf (Rechner
  ausgelastet) rund 30 s, bis das Netz ruht — in der Messung 11,4 s. Das verfehlt B3 („höchstens 50 Einträge je Anfrage, kein
  ganzer Bestand“) deutlich und ist für den Umbau (E3) ein Haltepunkt nach
  0.3: seitenweises Laden vom Server ist eine Änderung an der Datenabfrage,
  nicht nur an der Darstellung.
- Anforderungen lädt im Probelauf nur den offenen Arbeitsstand (keine
  Antwort über 50 Zeilen); ob „Erledigt“ den ganzen Bestand von 30.000
  holt, zeigt erst die vollständige Messung bzw. ein Klick auf den Reiter —
  die Messung lädt nur die Seite.
- Welche weiteren Seiten über 50 Zeilen je Anfrage holen, war offen, bis
  die Messung gelaufen ist. Sie ist gelaufen (oben): jede gemessene Seite
  ausser den Einstellungen; am meisten die Mitarbeiterübersicht mit den
  Buchungen des ganzen Jahres (25.880 Zeilen, 22 MB, rund 2 Minuten bis
  das Netz ruht).

## Durchgang ohne Hintergrund

Derselbe Lauf mit gesperrtem Service Worker und Datensparmodus
(`--ohne-hintergrund`) — die Grundlage des Vergleichs in
`messung-nachher.md`. Vorher holte die App nichts im Hintergrund; die
Werte sind deshalb fast dieselben.

<!-- messung-ohne-hintergrund:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 12.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand` · **ohne Hintergrund:** Service Worker gesperrt, Datensparmodus an (kein Vorladen).

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,3 s | 3,8 s | 35,5 s | 114 | 6 743 KB | 54 | 6 459 KB | 5 400 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,3 s | 3,3 s | 12,9 s | 73 | 2 086 KB | 30 | 1 834 KB | 5 000 (rpc/lager_frei) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 2,8 s | 3,1 s | 39 | 344 KB | 16 | 120 KB | 100 (assignments) |
| Lager | `/lager` | 1,4 s | 2,7 s | 11,4 s | 52 | 1 907 KB | 19 | 1 670 KB | 5 000 (rpc/lager_frei) |
| Anforderungen | `/anforderungen` | 1,3 s | 3,1 s | 3,7 s | 44 | 397 KB | 11 | 158 KB | 200 (material_orders) |
| Material anfordern | `/material` | 1,4 s | 2,8 s | 6,0 s | 51 | 849 KB | 17 | 614 KB | 1 000 (rpc/lager_frei) |
| Rechnungen | `/invoices` | 1,4 s | 3,8 s | 7,9 s | 84 | 1 141 KB | 30 | 851 KB | 500 (customers) |
| Angebote | `/quotes` | 1,4 s | 2,7 s | 5,1 s | 46 | 651 KB | 11 | 414 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,3 s | 2,8 s | 7,6 s | 53 | 955 KB | 13 | 712 KB | 600 (projects) |
| Kunden | `/customers` | 1,3 s | 2,7 s | 3,0 s | 35 | 346 KB | 9 | 114 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 3,2 s | 119,8 s | 109 | 22 607 KB | 69 | 22 344 KB | 25 880 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,4 s | 2,2 s | 2,3 s | 27 | 239 KB | 11 | 11 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 5 400 Zeilen in 12 Anfragen; assignments 1 520 Zeilen in 5 Anfragen; materials 1 000 Zeilen in 2 Anfragen; rpc/lager_frei 1 000 Zeilen; invoice_lines 198 Zeilen; invoices 99 Zeilen; wartungen 68 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): rpc/lager_frei 5 000 Zeilen in 5 Anfragen; materials 2 000 Zeilen in 4 Anfragen; assignments 720 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 100 Zeilen; projects 60 Zeilen
- **Lager** (`/lager`): rpc/lager_frei 5 000 Zeilen in 5 Anfragen; materials 2 000 Zeilen in 4 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): rpc/lager_frei 1 000 Zeilen in 2 Anfragen; materials 1 000 Zeilen in 3 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 120 Zeilen in 2 Anfragen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen; customers 500 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 25 880 Zeilen in 53 Anfragen
<!-- messung-ohne-hintergrund:ende -->
