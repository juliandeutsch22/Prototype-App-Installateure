# Ladezeit: Ausgangsstand, gemessen wie ausgeliefert (19.10.2026)

**Warum eine neue Messung.** Bis zum 19.10.2026 maß `scripts/ui-umbau/messung.mjs`
gegen `vite preview` und den rohen lokalen Supabase-Stapel. Beide liefern
anders aus als die echte App:

- **Die Datenbank antwortete lokal ungepackt.** Supabase packt draussen jede
  Antwort mit gzip (geprüft am 19.10.2026 an der REST-Schnittstelle des
  Projekts: `content-encoding: gzip`). Eine Monatsliste Buchungen sind roh
  432 KB, gepackt 24 KB — die alten Messungen setzten bis zum 18-Fachen an
  Datenmenge an.
- **`vite preview` spricht HTTP/1.1** mit höchstens sechs Leitungen je Adresse
  und lässt jede Programmdatei bei jedem Besuch neu bestätigen. Firebase
  Hosting spricht HTTP/2 und liefert `/assets/**` als `immutable`
  (`firebase.json`): wer die App schon einmal offen hatte, lädt ihren
  Programmcode gar nicht mehr.

Seit dieser Messung baut `scripts/ui-umbau/auslieferung.mjs` die Auslieferung
nach (HTTP/2 über TLS, gepackt, Kopfzeilen aus `firebase.json`); die
Drosselung bleibt so streng wie bisher (langsames 4G mit 150 ms und
1,6 Mbit/s, CPU vierfach gedrosselt — das Handy-Profil von Lighthouse).
Gemessen wird in zwei Durchgängen:

- **erster Besuch** — leerer Zwischenspeicher, wie nach einer neuen Fassung
  der App;
- **Wiederkehr** — der Alltag: die App war auf dem Gerät schon offen, ihre
  Programmdateien liegen im Zwischenspeicher (`--wiederkehr`).

**Was daraus folgt.** Die Zahlen in `messung-nachher.md` bis zum 19.10.2026
überzeichnen Datenmenge und Ladezeit deutlich; dort steht ein Hinweis. Die
Seiten sind im Alltag bis auf die Startseite schon heute in 2,5 s bereit.
Was mit dem Bestand wächst und deshalb trotzdem umgebaut wird, steht in
`docs/stand-2026-10-03.md` (T-5): das Nachfassen der Live-Listen holt alles
ein zweites Mal (Mitarbeiterübersicht 12.000 Buchungen, Lager 800 Artikel
doppelt), drei Seiten laden bis zu 500 Kunden für ihre Auswahlfelder, und die
Startseite rechnet „knapp“ aus allen Lagerartikeln.

<!-- messung-ohne-hintergrund:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 19.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand` · **ohne Hintergrund:** Service Worker gesperrt, Datensparmodus an (kein Vorladen).

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,3 s | 2,8 s | 4,4 s | 4,6 s | 103 | 471 KB | 45 | 213 KB | 2 040 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,3 s | 2,8 s | 3,1 s | 4,5 s | 64 | 273 KB | 21 | 45 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,3 s | 2,7 s | 3,0 s | 4,3 s | 61 | 268 KB | 17 | 20 KB | 120 (assignments) |
| Lager | `/lager` | 1,3 s | 2,3 s | 3,7 s | 5,0 s | 50 | 336 KB | 18 | 113 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 1,3 s | 2,6 s | 2,8 s | 2,7 s | 42 | 226 KB | 11 | 20 KB | 200 (material_orders) |
| Material anfordern | `/material` | 1,3 s | 2,2 s | 2,4 s | 3,9 s | 46 | 221 KB | 16 | 19 KB | 120 (projects) |
| Rechnungen | `/invoices` | 1,3 s | 2,7 s | 3,8 s | 4,7 s | 81 | 366 KB | 29 | 108 KB | 500 (customers) |
| Angebote | `/quotes` | 1,3 s | 2,2 s | 2,8 s | 2,9 s | 43 | 263 KB | 11 | 51 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,3 s | 2,7 s | 3,0 s | 2,8 s | 46 | 274 KB | 12 | 59 KB | 500 (customers) |
| Kunden | `/customers` | 1,3 s | 2,2 s | 2,5 s | 2,3 s | 30 | 214 KB | 9 | 14 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,3 s | 2,8 s | 3,9 s | 8,5 s | 92 | 696 KB | 47 | 434 KB | 12 000 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,3 s | 2,2 s | 2,2 s | 2,2 s | 25 | 204 KB | 11 | 4 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 2 040 Zeilen in 5 Anfragen; assignments 1 360 Zeilen in 4 Anfragen; materials 800 Zeilen in 2 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 95 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): customers 500 Zeilen; projects 300 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 12 000 Zeilen in 29 Anfragen; monthly_stats 1 180 Zeilen in 3 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung-ohne-hintergrund:ende -->

<!-- messung-ohne-hintergrund-wiederkehr:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 19.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, **Wiederkehr:** Programmdateien im Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand` · **ohne Hintergrund:** Service Worker gesperrt, Datensparmodus an (kein Vorladen).

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 0,4 s | 0,9 s | 2,5 s | 2,5 s | 103 | 217 KB | 45 | 213 KB | 2 040 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 0,3 s | 0,8 s | 1,5 s | 2,8 s | 64 | 48 KB | 21 | 44 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 0,3 s | 1,2 s | 1,2 s | 2,6 s | 61 | 23 KB | 17 | 19 KB | 120 (assignments) |
| Lager | `/lager` | 0,4 s | 1,2 s | 2,0 s | 3,3 s | 50 | 117 KB | 18 | 113 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 0,4 s | 0,9 s | 1,3 s | 1,2 s | 42 | 23 KB | 11 | 19 KB | 200 (material_orders) |
| Material anfordern | `/material` | 0,4 s | 0,9 s | 1,1 s | 2,5 s | 46 | 22 KB | 16 | 18 KB | 120 (projects) |
| Rechnungen | `/invoices` | 0,4 s | 1,2 s | 1,8 s | 2,8 s | 81 | 112 KB | 29 | 108 KB | 500 (customers) |
| Angebote | `/quotes` | 0,4 s | 0,7 s | 1,2 s | 1,2 s | 43 | 54 KB | 11 | 51 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 0,4 s | 0,8 s | 1,4 s | 1,2 s | 46 | 61 KB | 12 | 58 KB | 500 (customers) |
| Kunden | `/customers` | 0,4 s | 1,2 s | 1,2 s | 1,2 s | 30 | 18 KB | 9 | 14 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 0,3 s | 0,8 s | 2,0 s | 6,8 s | 92 | 438 KB | 47 | 434 KB | 12 000 (time_entries) |
| Einstellungen | `/settings/meldungen` | 0,4 s | 0,8 s | 0,8 s | 0,9 s | 25 | 7 KB | 11 | 3 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 2 040 Zeilen in 5 Anfragen; assignments 1 360 Zeilen in 4 Anfragen; materials 800 Zeilen in 2 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 95 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 200 Zeilen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): customers 500 Zeilen; projects 300 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 12 000 Zeilen in 29 Anfragen; monthly_stats 1 180 Zeilen in 3 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung-ohne-hintergrund-wiederkehr:ende -->
