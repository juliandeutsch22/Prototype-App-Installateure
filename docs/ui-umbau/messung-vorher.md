# Messung vorher

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 8.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, ohne Zwischenspeicher · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bedienbar (Netz ruhig) | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,5 s | 4,0 s | 53,6 s | 101 | 4 076 KB | 42 | 3 794 KB | 2 640 (time_entries) |
| Planung (Tag) | `/assignments/tag` | 1,4 s | 3,6 s | 26,4 s | 72 | 1 487 KB | 30 | 1 235 KB | 2 000 (materials) |
| Planung (Woche) | `/assignments/woche` | 1,3 s | 2,7 s | 3,0 s | 38 | 343 KB | 16 | 120 KB | 100 (assignments) |
| Lager | `/lager` | 1,4 s | 2,7 s | 26,6 s | 49 | 1 070 KB | 17 | 834 KB | 2 000 (materials) |
| Anforderungen | `/anforderungen` | 1,4 s | 2,7 s | 10,7 s | 43 | 250 KB | 11 | 12 KB | 5 (suppliers) |
| Material anfordern | `/material` | 1,3 s | 2,7 s | 20,9 s | 52 | 1 153 KB | 19 | 919 KB | 2 000 (materials) |
| Rechnungen | `/invoices` | 1,4 s | 3,8 s | 11,4 s | 79 | 1 027 KB | 26 | 738 KB | 500 (customers) |
| Angebote | `/quotes` | 1,3 s | 2,6 s | 8,2 s | 45 | 644 KB | 11 | 408 KB | 500 (customers) |
| Baustellen | `/admin-projects` | 1,4 s | 2,7 s | 10,3 s | 52 | 954 KB | 13 | 713 KB | 600 (projects) |
| Kunden | `/customers` | 1,4 s | 2,7 s | 3,4 s | 34 | 345 KB | 9 | 114 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 3,1 s | 20,3 s | 63 | 2 199 KB | 24 | 1 937 KB | 2 160 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,3 s | 2,1 s | 2,1 s | 26 | 237 KB | 11 | 11 KB | 3 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): time_entries 2 640 Zeilen in 7 Anfragen; assignments 1 480 Zeilen in 4 Anfragen; materials 1 000 Zeilen in 2 Anfragen; invoice_lines 198 Zeilen; invoices 99 Zeilen; wartungen 73 Zeilen; projects 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): materials 2 000 Zeilen in 4 Anfragen; assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 100 Zeilen; projects 60 Zeilen
- **Lager** (`/lager`): materials 2 000 Zeilen in 4 Anfragen
- **Material anfordern** (`/material`): materials 2 000 Zeilen in 4 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): customers 500 Zeilen; invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Angebote** (`/quotes`): customers 500 Zeilen; quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen; customers 500 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 2 160 Zeilen in 9 Anfragen

**Fehler und unvollständige Messungen** (eine schnelle Fehlerseite zählt nicht als erfolgreicher Seitenaufruf):

- **Start, Lauf 1**: /rest/v1/rpc/lager_frei: 500; /rest/v1/time_entries: 500; /rest/v1/work_sheets: 500
- **Start, Lauf 2**: /rest/v1/rpc/lager_frei: 500; /rest/v1/time_entries: 500; /rest/v1/work_sheets: 500
- **Start, Lauf 3**: /rest/v1/rpc/lager_frei: 500; /rest/v1/time_entries: 500; /rest/v1/work_sheets: 500
- **Planung (Tag), Lauf 1**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Planung (Tag), Lauf 2**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Planung (Tag), Lauf 3**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Lager, Lauf 1**: /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500
- **Lager, Lauf 2**: /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500
- **Lager, Lauf 3**: /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/material_orders: 500; /rest/v1/rpc/lager_frei: 500
- **Anforderungen, Lauf 1**: /rest/v1/material_orders: 500; Das hat nicht geklapptcanceling statement due to statement timeout
- **Anforderungen, Lauf 2**: /rest/v1/material_orders: 500; Das hat nicht geklapptcanceling statement due to statement timeout
- **Anforderungen, Lauf 3**: /rest/v1/material_orders: 500; Das hat nicht geklapptcanceling statement due to statement timeout
- **Material anfordern, Lauf 1**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Material anfordern, Lauf 2**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Material anfordern, Lauf 3**: /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500; /rest/v1/rpc/lager_frei: 500
- **Rechnungen, Lauf 1**: /rest/v1/work_sheets: 500
- **Rechnungen, Lauf 3**: /rest/v1/work_sheets: 500
- **Mitarbeiterübersicht, Lauf 1**: /rest/v1/time_entries: 500; /rest/v1/time_entries: 500; Das hat nicht geklapptcanceling statement due to statement timeout
- **Mitarbeiterübersicht, Lauf 2**: /rest/v1/time_entries: 500; /rest/v1/time_entries: 500; Das hat nicht geklapptcanceling statement due to statement timeout
- **Mitarbeiterübersicht, Lauf 3**: /rest/v1/time_entries: 500; /rest/v1/time_entries: 500; Das hat nicht geklapptcanceling statement due to statement timeout
<!-- messung:ende -->
