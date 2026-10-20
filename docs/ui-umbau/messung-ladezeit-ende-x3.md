# Ladezeit: Endmessung mit dreifachem Bestand (20.10.2026)

Bestand ×3 (`TESTBESTAND_FAKTOR=3`: 75 Leute, 120.000 Katalogartikel, 450.000 Buchungen). Einordnung und Vergleich in `messung-ladezeit-ende.md`.

<!-- messung-wiederkehr:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 20.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, **Wiederkehr:** Programmdateien im Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 0,3 s | 1,1 s | 1,8 s | 1,8 s | 186 | 123 KB | 29 | 123 KB | 420 (rpc/baustellen_stunden) |
| Planung (Tag) | `/assignments/tag` | 0,3 s | 1,2 s | 1,5 s | 3,6 s | 178 | 136 KB | 22 | 136 KB | 2 100 (assignments) |
| Planung (Woche) | `/assignments/woche` | 0,2 s | 1,2 s | 1,3 s | 2,5 s | 170 | 44 KB | 14 | 44 KB | 420 (assignments) |
| Lager | `/lager` | 0,2 s | 1,1 s | 2,1 s | 3,1 s | 172 | 110 KB | 15 | 110 KB | 2 000 (materials) |
| Anforderungen | `/anforderungen` | 0,3 s | 1,1 s | 1,1 s | 2,5 s | 165 | 28 KB | 9 | 28 KB | 400 (material_orders) |
| Material anfordern | `/material` | 0,2 s | 0,6 s | 0,8 s | 2,4 s | 169 | 41 KB | 13 | 41 KB | 360 (projects) |
| Rechnungen | `/invoices` | 0,2 s | 1,1 s | 2,1 s | 2,8 s | 193 | 185 KB | 36 | 185 KB | 794 (invoice_lines) |
| Angebote | `/quotes` | 0,3 s | 1,0 s | 1,1 s | 1,4 s | 164 | 22 KB | 7 | 22 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 0,3 s | 1,2 s | 1,2 s | 1,4 s | 164 | 39 KB | 8 | 39 KB | 600 (projects) |
| Kunden | `/customers` | 0,2 s | 1,0 s | 1,1 s | 1,1 s | 162 | 12 KB | 6 | 12 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 0,3 s | 1,3 s | 3,5 s | 6,0 s | 195 | 527 KB | 38 | 527 KB | 9 240 (time_entries) |
| Einstellungen | `/settings/meldungen` | 0,3 s | 1,1 s | 1,1 s | 1,3 s | 164 | 2 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_stunden 420 Zeilen; invoices 297 Zeilen in 2 Anfragen; rpc/lager_knapp 288 Zeilen; assignments 280 Zeilen in 2 Anfragen; wartungen 200 Zeilen; projects 180 Zeilen; material_orders 120 Zeilen; rpc/baustellen_einsatzlage 120 Zeilen; users 76 Zeilen in 2 Anfragen; rpc/buchungstage_je_person 70 Zeilen; vacations 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 2 100 Zeilen in 6 Anfragen; projects 360 Zeilen in 2 Anfragen; users 151 Zeilen in 3 Anfragen; rpc/wochenplan_abwesend 79 Zeilen
- **Planung (Woche)** (`/assignments/woche`): assignments 420 Zeilen in 2 Anfragen; projects 180 Zeilen; users 76 Zeilen in 2 Anfragen
- **Lager** (`/lager`): materials 2 000 Zeilen in 6 Anfragen; rpc/lager_frei 1 000 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 360 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 794 Zeilen in 5 Anfragen; customers 554 Zeilen in 7 Anfragen; invoices 397 Zeilen in 3 Anfragen; projects 180 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen; users 76 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 9 240 Zeilen in 24 Anfragen; rpc/baustellen_stunden 420 Zeilen; users 76 Zeilen in 2 Anfragen; projects 75 Zeilen; rpc/arbeitszeit_vorlauf 70 Zeilen; rpc/monatsbilanzen_alle 70 Zeilen
<!-- messung-wiederkehr:ende -->

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 20.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,3 s | 2,6 s | 3,5 s | 3,5 s | 186 | 367 KB | 29 | 123 KB | 420 (rpc/baustellen_stunden) |
| Planung (Tag) | `/assignments/tag` | 1,3 s | 2,7 s | 3,1 s | 5,4 s | 178 | 386 KB | 22 | 137 KB | 2 100 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,4 s | 2,7 s | 3,0 s | 4,3 s | 170 | 294 KB | 14 | 45 KB | 420 (assignments) |
| Lager | `/lager` | 1,4 s | 2,1 s | 3,5 s | 4,5 s | 172 | 326 KB | 15 | 111 KB | 2 000 (materials) |
| Anforderungen | `/anforderungen` | 1,3 s | 2,1 s | 2,4 s | 3,8 s | 165 | 228 KB | 9 | 29 KB | 400 (material_orders) |
| Material anfordern | `/material` | 1,4 s | 2,3 s | 2,4 s | 3,8 s | 169 | 237 KB | 13 | 41 KB | 360 (projects) |
| Rechnungen | `/invoices` | 1,3 s | 2,8 s | 3,8 s | 4,5 s | 193 | 370 KB | 36 | 186 KB | 794 (invoice_lines) |
| Angebote | `/quotes` | 1,5 s | 2,6 s | 2,8 s | 3,3 s | 164 | 231 KB | 7 | 23 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 1,5 s | 2,7 s | 2,9 s | 4,3 s | 165 | 287 KB | 9 | 46 KB | 600 (projects) |
| Kunden | `/customers` | 1,4 s | 2,1 s | 2,5 s | 3,2 s | 162 | 231 KB | 6 | 13 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 2,6 s | 5,6 s | 8,1 s | 195 | 775 KB | 38 | 527 KB | 9 240 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,3 s | 2,6 s | 2,6 s | 2,9 s | 164 | 254 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_stunden 420 Zeilen; invoices 297 Zeilen in 2 Anfragen; rpc/lager_knapp 288 Zeilen; assignments 280 Zeilen in 2 Anfragen; wartungen 200 Zeilen; projects 180 Zeilen; material_orders 120 Zeilen; rpc/baustellen_einsatzlage 120 Zeilen; users 76 Zeilen in 2 Anfragen; rpc/buchungstage_je_person 70 Zeilen; vacations 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 2 100 Zeilen in 6 Anfragen; projects 360 Zeilen in 2 Anfragen; users 151 Zeilen in 3 Anfragen; rpc/wochenplan_abwesend 79 Zeilen
- **Planung (Woche)** (`/assignments/woche`): assignments 420 Zeilen in 2 Anfragen; projects 180 Zeilen; users 76 Zeilen in 2 Anfragen
- **Lager** (`/lager`): materials 2 000 Zeilen in 6 Anfragen; rpc/lager_frei 1 000 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 360 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 794 Zeilen in 5 Anfragen; customers 554 Zeilen in 7 Anfragen; invoices 397 Zeilen in 3 Anfragen; projects 180 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen; users 76 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 9 240 Zeilen in 24 Anfragen; rpc/baustellen_stunden 420 Zeilen; users 76 Zeilen in 2 Anfragen; projects 75 Zeilen; rpc/arbeitszeit_vorlauf 70 Zeilen; rpc/monatsbilanzen_alle 70 Zeilen
<!-- messung:ende -->
