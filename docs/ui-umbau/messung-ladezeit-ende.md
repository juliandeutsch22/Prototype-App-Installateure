# Ladezeit: Endmessung mit einfachem und dreifachem Bestand (20.10.2026)

**Was gemessen wurde.** Dieselbe Messung wie im Ausgangsstand
(`messung-ladezeit-vorher.md`): ausgeliefert wie draußen (HTTP/2, gepackt,
`auslieferung.mjs`), Handy-Profil mit langsamem 4G (150 ms, 1,6 Mbit/s) und
vierfach gedrosselter CPU, je Seite drei Läufe, Median, angemeldet als
Geschäftsführung. Zwei Bestände:

- **×1** — der Testbestand „fünf Jahre Betrieb“ (25 Leute, 40.000
  Katalogartikel, 150.000 Buchungen);
- **×3** — derselbe Betrieb dreimal so groß in denselben fünf Jahren
  (`TESTBESTAND_FAKTOR=3`: 75 Leute, 120.000 Katalogartikel, 450.000
  Buchungen), Tabellen unten in `messung-ladezeit-ende-x3.md`.

**Vergleich** (bereit, Wiederkehr = Alltag, App schon auf dem Gerät).
„Nach L-D“ ist der Stand nach `#331`, vor den Änderungen dieses Nachweises
(`messung-ladezeit-nachher*.md`), gleich gemessen.

| Seite | ×1 nach L-D | ×1 Ende | ×3 nach L-D | ×3 Ende |
|---|---|---|---|---|
| Start | 1,7 s | 1,3 s | 2,6 s | 1,8 s |
| Planung (Tag) | 1,6 s | 1,4 s | 1,7 s | 1,5 s |
| Planung (Woche) | 1,3 s | 1,1 s | 1,4 s | 1,3 s |
| Lager | 2,3 s | 1,8 s | 2,5 s | 2,1 s |
| Anforderungen | 1,2 s | 0,9 s | 1,1 s | 1,1 s |
| Material anfordern | 1,1 s | 1,0 s | 1,3 s | 0,8 s |
| Rechnungen | 2,0 s | 1,7 s | 2,2 s | 2,1 s |
| Angebote | 1,2 s | 1,1 s | 1,3 s | 1,1 s |
| Baustellen | 1,4 s | 1,2 s | 1,4 s | 1,2 s |
| Kunden | 1,0 s | 1,1 s | 1,1 s | 1,1 s |
| Mitarbeiterübersicht | 2,3 s | 1,9 s | **4,3 s** | **3,5 s** |
| Einstellungen | 1,0 s | 1,1 s | 1,3 s | 1,1 s |

Die Mitarbeiterübersicht bei ×3 zusätzlich: Netz ruhig 22,7 → 6,0 s,
Datenbank 1.579 → 527 KB. Beim ersten Besuch nach einer neuen Fassung (der
Programmcode kommt dann über das langsame Netz, rund 230 KB): ×1 2,3–3,6 s,
×3 2,4–3,8 s, die Mitarbeiterübersicht bei ×3 5,6 s.

**Ergebnis.** Was eine Seite lädt, hängt jetzt am Gezeigten — beim
dreifachen Bestand ist jede Seite im Alltag in höchstens 2,1 s bereit,
**außer der Mitarbeiterübersicht mit 75 Leuten (3,5 s)**. Senklot ist für Betriebe bis etwa 30 Mitarbeiter gedacht; mit 25 Leuten (×1) ist sie in 1,9 s bereit — 75 Leute sind ein Belastungstest über die Zielgröße hinaus. Sie zeigt den
Monat jeder Person, und ihre Grundlage — die Buchungen des Monats samt einer
Woche davor und danach, bei 75 Leuten rund 3.700 Zeilen, knapp 300 KB über
das langsame Netz — wächst mit der Belegschaft (nicht mit den Jahren);
danach rechnet das Handy die Monatswerte jeder Person. Der nächste Schritt
dafür wäre, die Liste in Seiten zu zeigen oder die Monatswerte je Person
auf dem Server zu rechnen; beides ist ein eigener Umbau der Seite.

**Was gefunden und behoben wurde** (Migration
`20261019400000_skalierung.sql`, Einzelheiten in
`docs/stand-2026-10-03.md`, T-5e):

1. `lager_frei` nahm mit einer Liste von Kennungen den Schlüssel nicht —
   „knapp“ auf der Startseite 1.094 → 53 ms.
2. Die Monatsbilanzen (`monthly_stats`) riefen je Buchung eine Funktion, die
   Postgres nicht einbetten kann: 450.000 Buchungen 3,5 s → 0,15 s. Der
   Gesamtsaldo holte sie in acht Seiten, jede rechnete alles neu; jetzt eine
   Anfrage (`monatsbilanzen_alle`).
3. Der Vorlauf der Arbeitszeitgrenzen (16 Wochen) kam als jede einzelne
   Buchung (42.000 Zeilen, 1,5 MB); jetzt je Person und Tag verdichtet
   (`arbeitszeit_vorlauf`), eine Zeile je Person.
4. Die Startseite holte die offenen Rechnungen samt Positionen und
   Abdeckung, die sie nicht liest; die Buchungstage seitenweise; die
   Einsatzlage auch abgeschlossener Baustellen; das Budget erst nach dem
   ganzen Block.
5. Im Browser filterten Liste und Grenzprüfung je Person über alle
   Buchungen (Belegschaft mal Buchungen); die Grenzprüfung rechnet jetzt in
   Häppchen zu zehn Personen und hält die Liste nicht mehr auf.


<!-- messung-wiederkehr:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 20.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, **Wiederkehr:** Programmdateien im Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 0,3 s | 0,6 s | 1,3 s | 1,5 s | 186 | 50 KB | 29 | 49 KB | 120 (rpc/baustellen_stunden) |
| Planung (Tag) | `/assignments/tag` | 0,2 s | 1,2 s | 1,4 s | 2,7 s | 174 | 38 KB | 18 | 38 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 0,3 s | 1,1 s | 1,1 s | 2,5 s | 170 | 16 KB | 14 | 16 KB | 120 (assignments) |
| Lager | `/lager` | 0,2 s | 1,0 s | 1,8 s | 3,0 s | 172 | 88 KB | 15 | 88 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 0,2 s | 0,7 s | 0,9 s | 2,4 s | 165 | 22 KB | 9 | 22 KB | 400 (material_orders) |
| Material anfordern | `/material` | 0,2 s | 1,0 s | 1,0 s | 2,4 s | 169 | 17 KB | 13 | 17 KB | 120 (projects) |
| Rechnungen | `/invoices` | 0,2 s | 1,0 s | 1,7 s | 2,7 s | 185 | 95 KB | 28 | 95 KB | 398 (invoice_lines) |
| Angebote | `/quotes` | 0,2 s | 1,1 s | 1,1 s | 1,3 s | 164 | 23 KB | 7 | 23 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 0,3 s | 1,2 s | 1,2 s | 2,5 s | 165 | 36 KB | 9 | 36 KB | 600 (projects) |
| Kunden | `/customers` | 0,3 s | 1,1 s | 1,1 s | 1,3 s | 162 | 13 KB | 6 | 13 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 0,2 s | 1,1 s | 1,9 s | 3,6 s | 182 | 129 KB | 25 | 129 KB | 2 640 (time_entries) |
| Einstellungen | `/settings/meldungen` | 0,3 s | 1,0 s | 1,1 s | 1,2 s | 164 | 2 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 98 Zeilen; rpc/lager_knapp 96 Zeilen; assignments 80 Zeilen in 2 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; customers 184 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 2 640 Zeilen in 11 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung-wiederkehr:ende -->

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 20.10.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,4 s | 2,7 s | 3,0 s | 3,4 s | 186 | 293 KB | 29 | 50 KB | 120 (rpc/baustellen_stunden) |
| Planung (Tag) | `/assignments/tag` | 1,3 s | 2,7 s | 3,0 s | 4,5 s | 174 | 287 KB | 18 | 38 KB | 600 (assignments) |
| Planung (Woche) | `/assignments/woche` | 1,3 s | 2,6 s | 2,7 s | 4,2 s | 170 | 265 KB | 14 | 17 KB | 120 (assignments) |
| Lager | `/lager` | 1,3 s | 2,1 s | 3,3 s | 4,5 s | 172 | 305 KB | 15 | 89 KB | 1 600 (materials) |
| Anforderungen | `/anforderungen` | 1,3 s | 2,1 s | 2,3 s | 3,7 s | 165 | 222 KB | 9 | 23 KB | 400 (material_orders) |
| Material anfordern | `/material` | 1,3 s | 2,1 s | 2,3 s | 3,8 s | 169 | 221 KB | 13 | 17 KB | 120 (projects) |
| Rechnungen | `/invoices` | 1,3 s | 2,6 s | 3,3 s | 4,3 s | 185 | 280 KB | 28 | 95 KB | 398 (invoice_lines) |
| Angebote | `/quotes` | 1,3 s | 2,1 s | 2,4 s | 2,8 s | 164 | 232 KB | 7 | 23 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 1,3 s | 2,7 s | 2,8 s | 4,2 s | 165 | 278 KB | 9 | 37 KB | 600 (projects) |
| Kunden | `/customers` | 1,3 s | 2,1 s | 2,4 s | 2,9 s | 162 | 231 KB | 6 | 13 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,4 s | 2,6 s | 3,6 s | 5,3 s | 182 | 377 KB | 25 | 129 KB | 2 640 (time_entries) |
| Einstellungen | `/settings/meldungen` | 1,4 s | 2,6 s | 2,6 s | 2,9 s | 164 | 254 KB | 8 | 2 KB | 2 (rpc/mein_zweiter_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): rpc/baustellen_stunden 120 Zeilen; invoices 99 Zeilen in 2 Anfragen; wartungen 98 Zeilen; rpc/lager_knapp 96 Zeilen; assignments 80 Zeilen in 2 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen
- **Planung (Tag)** (`/assignments/tag`): assignments 600 Zeilen in 2 Anfragen; projects 120 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): assignments 120 Zeilen in 2 Anfragen; projects 60 Zeilen
- **Lager** (`/lager`): materials 1 600 Zeilen in 6 Anfragen; rpc/lager_frei 800 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 400 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 120 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoice_lines 398 Zeilen in 3 Anfragen; invoices 199 Zeilen in 3 Anfragen; customers 184 Zeilen in 3 Anfragen; projects 60 Zeilen; work_sheets 60 Zeilen; work_sheet_hours 60 Zeilen; work_sheet_material 60 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen
- **Baustellen** (`/admin-projects`): projects 600 Zeilen in 2 Anfragen
- **Kunden** (`/customers`): customers 200 Zeilen
- **Mitarbeiterübersicht** (`/accounting`): time_entries 2 640 Zeilen in 11 Anfragen; rpc/baustellen_stunden 120 Zeilen
<!-- messung:ende -->
