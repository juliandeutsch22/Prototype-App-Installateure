# Messung ladezeit-nachher

<!-- messung-wiederkehr:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 19.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, **Wiederkehr:** Programmdateien im Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 0,4 s | 1,2 s | 1,7 s | 1,9 s | 189 | 66 KB | 32 | 66 KB | 460 (rpc/baustellen_einsatzlage) |
| Planung (Tag) | `/assignments/tag` | 0,3 s | 1,3 s | 1,6 s | 2,8 s | 174 | 38 KB | 18 | 38 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 0,2 s | 1,1 s | 1,3 s | 2,6 s | 170 | 16 KB | 14 | 16 KB | 120 (assignments) |
| Lager | `/lager` | 0,2 s | 1,1 s | 2,3 s | 4,2 s | 173 | 68 KB | 16 | 68 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 0,4 s | 0,8 s | 1,2 s | 2,6 s | 165 | 22 KB | 9 | 22 KB | 400 (material_orders) |
| Material anfordern | `/material` | 0,2 s | 0,8 s | 1,1 s | 2,5 s | 169 | 17 KB | 13 | 17 KB | 120 (projects) |
| Rechnungen | `/invoices` | 0,2 s | 1,1 s | 2,0 s | 2,9 s | 185 | 95 KB | 28 | 94 KB | 398 (invoice_lines) |
| Angebote | `/quotes` | 0,3 s | 1,2 s | 1,2 s | 1,5 s | 164 | 23 KB | 7 | 23 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 0,4 s | 1,1 s | 1,4 s | 2,7 s | 165 | 36 KB | 9 | 36 KB | 600 (projects) |
| Kunden | `/customers` | 0,3 s | 1,0 s | 1,0 s | 1,3 s | 162 | 13 KB | 6 | 13 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 0,3 s | 1,0 s | 2,3 s | 7,3 s | 203 | 397 KB | 46 | 397 KB | 12 000 (time_entries) |
| Einstellungen | `/settings/meldungen` | 0,3 s | 1,0 s | 1,0 s | 1,3 s | 164 | 2 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_einsatzlage 460 Zeilen; rpc/buchungstage 340 Zeilen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; rpc/lager_knapp 96 Zeilen; wartungen 95 Zeilen; assignments 80 Zeilen in 2 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 3 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; customers 184 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 12 000 Zeilen in 29 Anfragen; monthly_stats 1 180 Zeilen in 3 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung-wiederkehr:ende -->

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 19.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 2,6 s | 3,1 s | 3,4 s | 188 | 309 KB | 31 | 66 KB | 460 (rpc/baustellen_einsatzlage) |
| Planung (Tag) | `/assignments/tag` | 1,3 s | 2,7 s | 2,9 s | 4,5 s | 174 | 287 KB | 18 | 38 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 2,7 s | 2,8 s | 4,1 s | 170 | 265 KB | 14 | 17 KB | 120 (assignments) |
| Lager | `/lager` | 1,3 s | 2,2 s | 3,4 s | 4,5 s | 172 | 304 KB | 15 | 89 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 1,4 s | 2,1 s | 2,3 s | 3,8 s | 165 | 230 KB | 9 | 23 KB | 400 (material_orders) |
| Material anfordern | `/material` | 1,3 s | 2,1 s | 2,3 s | 3,8 s | 169 | 213 KB | 13 | 17 KB | 120 (projects) |
| Rechnungen | `/invoices` | 1,3 s | 2,3 s | 3,2 s | 4,2 s | 185 | 279 KB | 28 | 94 KB | 398 (invoice_lines) |
| Angebote | `/quotes` | 1,3 s | 2,2 s | 2,7 s | 3,2 s | 164 | 231 KB | 7 | 23 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 1,4 s | 2,7 s | 2,8 s | 4,1 s | 165 | 277 KB | 9 | 37 KB | 600 (projects) |
| Kunden | `/customers` | 1,3 s | 2,1 s | 2,4 s | 3,0 s | 162 | 231 KB | 6 | 13 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,3 s | 2,7 s | 3,4 s | 8,4 s | 201 | 644 KB | 44 | 397 KB | 12 000 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,4 s | 2,6 s | 2,6 s | 2,9 s | 164 | 254 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_einsatzlage 460 Zeilen; rpc/buchungstage 340 Zeilen; invoice_lines 198 Zeilen; rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; rpc/lager_knapp 96 Zeilen; wartungen 95 Zeilen; assignments 80 Zeilen in 2 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; customers 184 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 12 000 Zeilen in 29 Anfragen; monthly_stats 1 180 Zeilen in 3 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung:ende -->
