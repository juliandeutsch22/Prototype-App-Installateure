# Messung nachher

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 9.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 3,2 s | 33,1 s | 100 | 6 199 KB | 49 | 5 921 KB | 5 400 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,4 s | 3,2 s | 12,8 s | 66 | 1 703 KB | 27 | 1 452 KB | 2 000 (materials) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 3,2 s | 3,6 s | 54 | 391 KB | 14 | 119 KB | 100 (assignments) |
| Lager | `/lager` | 1,4 s | 2,7 s | 10,7 s | 45 | 1 468 KB | 18 | 1 234 KB | 2 400 (rpc/lager_frei) |
| Anforderungen | `/anforderungen` | 1,5 s | 2,7 s | 4,5 s | 54 | 543 KB | 24 | 303 KB | 5 956 (rpc/anforderungen_baustellen) |
| Material anfordern | `/material` | 1,4 s | 2,7 s | 11,0 s | 46 | 1 368 KB | 18 | 1 137 KB | 2 000 (materials) |
| Rechnungen | `/invoices` | 1,4 s | 3,1 s | 7,0 s | 73 | 1 068 KB | 27 | 785 KB | 500 (customers) |
| Angebote | `/quotes` | 1,4 s | 2,6 s | 4,8 s | 39 | 573 KB | 9 | 338 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,4 s | 2,7 s | 6,2 s | 41 | 736 KB | 10 | 500 KB | 500 (customers) |
| Kunden | `/customers` | 1,5 s | 2,1 s | 3,2 s | 25 | 338 KB | 7 | 113 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,5 s | 2,7 s | 118,1 s | 110 | 22 220 KB | 72 | 21 952 KB | 24 960 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,5 s | 2,3 s | 2,3 s | 21 | 233 KB | 9 | 9 KB | 2 (companies) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 5 400 Zeilen in 12 Anfragen; assignments 1 480 Zeilen in 4 Anfragen; invoice_lines 198 Zeilen; invoices 99 Zeilen; rpc/lager_knapp 96 Zeilen; wartungen 73 Zeilen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): materials 2 000 Zeilen in 4 Anfragen; rpc/lager_frei 2 000 Zeilen in 4 Anfragen; assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 100 Zeilen; projects 60 Zeilen
- **Lager** (`/lager`): rpc/lager_frei 2 400 Zeilen in 6 Anfragen; materials 1 600 Zeilen in 4 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): rpc/anforderungen_baustellen 5 956 Zeilen in 12 Anfragen
- **Material anfordern** (`/material`): materials 2 000 Zeilen in 4 Anfragen; rpc/lager_frei 2 000 Zeilen in 4 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 100 Zeilen
- **Baustellen** (`/admin-projects`): customers 500 Zeilen; projects 300 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 24 960 Zeilen in 57 Anfragen

**Fehler und unvollständige Messungen** (eine schnelle Fehlerseite zählt nicht als erfolgreicher Seitenaufruf):

- keine
<!-- messung:ende -->
