# Messung gewachsen

Gegen den lokalen Stapel mit dem gewachsenen Testbestand
(`TESTBESTAND_GEWACHSEN=1 node scripts/ui-umbau/testbestand.mjs --neu`: 50
Personen, zehn Jahre, 30.000 Scheine, davon 29.671 unterschrieben und 9.888
unverrechnet, 24.000 Rechnungen), gemessen mit
`node scripts/ui-umbau/messung.mjs --quelle=gewachsen` und `… --monteur`.
Die Tabellen unten erzeugt das Skript; dieser Text bleibt stehen.

## L22: „Nicht verrechnet“ in einer Antwort (15.11.2026)

**Befund.** Als Geschäftsführung waren Startseite und Rechnungen erst nach
11,9 und 12,3 s bereit, die übrigen Seiten nach 3,5–5,2 s. Die Mehrzeit lag
ganz in `rpc/scheine_unverrechnet`: 9.888 Zeilen in 20 Seiten zu 500, eine
nach der anderen (die Antwort einer Funktion endet bei 1.000 Zeilen), und jede
Seite rechnete den Kern neu. Gemessen mit Netzmarken im Browser (Handy-Profil
wie unten): die 20 Anfragen liefen von 3,6 bis 12,4 s, je Seite rund 0,15 s
Laufzeit, 0,15–0,3 s Datenbank unter den Rechten der Geschäftsführung und
14 KB gepackt über langsames 4G — zusammen 8,2–8,8 s. Das Verarbeiten im
Browser danach kostete 0,3–0,5 s (lange Aufgaben am Ende), das Rendern war
kein Engpass. Die Scheinliste der Leitung (nicht im Seitensatz dieser Messung)
holte danach zu allen 9.888 Kennungen jeden ganzen Schein: 511 Anfragen,
bereit nach 51 s.

**Lösung.** Jede Ansicht fragt, was sie zeigt
(`supabase/migrations/20261117050000_scheine_unverrechnet_kompakt.sql`):
die Startseite Zahl und „über 4 Wochen“ (`scheine_unverrechnet_stand`, eine
Zeile), Rechnungen je Baustelle eine Zeile (`scheine_unverrechnet_baustellen`,
1.987 Baustellen als ein Wert, 72 KB gepackt), die Scheinliste die ältesten 20
und auf „weitere anzeigen“ die nächsten 50. Die Regeln stehen weiter in einem
Kern (`app.scheine_verrechnet_kern`). Die Spalte „grösste Liste“ zählt die
Antwort je Baustelle als eine Zeile, weil sie ein einzelner Wert ist.

**Vorher und nachher** (Median aus drei Läufen, „bereit“):

| Seite | vorher (Messung L22) | vorher, Bestand neu erzeugt | nachher |
|---|---|---|---|
| Start (Geschäftsführung) | 11,9 s · 64 DB-Anfragen · 357 KB | 10,8 s | 4,8 s · 45 DB-Anfragen |
| Rechnungen | 12,3 s · 43 DB-Anfragen · 353 KB | 9,7 s | 4,3 s · 24 DB-Anfragen |
| Handwerksscheine (Geschäftsführung, ein Lauf) | 51 s · 511 DB-Anfragen | – | 5,2 s · 26 DB-Anfragen |
| übrige Seiten der Geschäftsführung | 3,6–5,2 s | – | 3,3–4,6 s |
| Seiten des Monteurs | 3,1–4,3 s | – | 3,0–4,2 s |

„Bestand neu erzeugt“: die Prüfungen gegen die Datenbank leerten damals vor
jedem Lauf die ganze lokale Datenbank (`tests/supabase/aufraeumen.ts`), auch
den Testbestand; er wurde danach mit demselben Skript (fester Zufallswert,
fester Stichtag) Zeile für Zeile gleich neu angelegt — frisch eingefügt und
analysiert, deshalb schneller als der gealterte. Seit der Nacharbeit zur
Durchsicht (Welle 4) bleibt der Betrieb `ui-testbestand` samt Konten beim
Aufräumen stehen (gelöscht wird als Eigentümer der Datenbank, lokal
`supabase_admin`, ohne Auslöser und Prüfung der Fremdschlüssel: 0,4 s statt
78 s neben dem Bestand); ohne diesen Zugang leert es wie bisher und sagt es. Die Rohwerte der ersten
Messung stehen in `messung-gewachsen-vor-l22.json` und
`messung-gewachsen-vor-l22-monteur.json`.

<!-- messung-monteur:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 15.11.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Monteur (`monteur2`) des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,8 s | 3,3 s | 4,2 s | 4,2 s | 184 | 387 KB | 22 | 17 KB | 134 (vacations) |
| Zeiterfassung | `/time` | 1,8 s | 3,3 s | 3,4 s | 4,6 s | 182 | 362 KB | 20 | 15 KB | 148 (time_entries) |
| Material anfordern | `/material` | 1,8 s | 3,3 s | 3,5 s | 4,8 s | 183 | 369 KB | 23 | 47 KB | 241 (projects) |
| Mein Einsatzplan | `/my-schedule` | 1,9 s | 3,5 s | 3,5 s | 3,8 s | 179 | 378 KB | 16 | 10 KB | 60 (vacations) |
| Handwerksscheine | `/worksheets` | 1,9 s | 3,2 s | 3,8 s | 3,8 s | 174 | 368 KB | 12 | 24 KB | 50 (work_sheets) |
| Urlaub | `/vacations` | 1,9 s | 3,2 s | 3,8 s | 4,3 s | 176 | 336 KB | 15 | 13 KB | 134 (vacations) |
| Nachrichten | `/nachrichten` | 1,9 s | 2,9 s | 3,0 s | 3,7 s | 173 | 306 KB | 13 | 8 KB | 50 (rpc/kollegen) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): vacations 134 Zeilen
- **Zeiterfassung** (`/time`): time_entries 148 Zeilen in 2 Anfragen
- **Material anfordern** (`/material`): projects 241 Zeilen in 3 Anfragen; material_orders 200 Zeilen in 2 Anfragen
- **Mein Einsatzplan** (`/my-schedule`): vacations 60 Zeilen
- **Urlaub** (`/vacations`): vacations 134 Zeilen
<!-- messung-monteur:ende -->

<!-- messung:anfang (erzeugt von scripts/ui-umbau/messung.mjs) -->
Gemessen am 15.11.2026 · 3 Läufe je Seite, Median · Handy 390 × 844, langsames 4G (150 ms, 1,6 Mbit/s), CPU ×4, erster Besuch ohne Zwischenspeicher · ausgeliefert wie draussen (HTTP/2, gepackt, `auslieferung.mjs`) · angemeldet als Geschäftsführung des Testbetriebs `ui-testbestand`.

| Seite | Pfad | erste Anzeige (FCP) | Inhalt da (h1) | bereit (ohne Platzhalter) | Netz ruhig | Anfragen | übertragen | DB-Anfragen | DB-Daten | grösste Liste (Zeilen) |
|---|---|---|---|---|---|---|---|---|---|---|
| Start | `/` | 1,9 s | 3,3 s | 4,8 s | 5,7 s | 272 | 439 KB | 45 | 85 KB | 200 (wartungen) |
| Planung (Tag) | `/assignments/tag` | 2,0 s | 3,2 s | 3,8 s | 4,9 s | 251 | 385 KB | 24 | 40 KB | 240 (projects) |
| Planung (Woche) | `/assignments/woche` | 1,9 s | 3,5 s | 4,1 s | 5,9 s | 247 | 370 KB | 20 | 25 KB | 120 (projects) |
| Lager | `/lager` | 1,9 s | 3,2 s | 4,6 s | 5,4 s | 248 | 438 KB | 21 | 117 KB | 2 000 (materials) |
| Anforderungen | `/anforderungen` | 1,8 s | 2,7 s | 3,3 s | 4,8 s | 247 | 358 KB | 21 | 47 KB | 560 (material_orders) |
| Material anfordern | `/material` | 1,8 s | 2,7 s | 3,3 s | 4,6 s | 248 | 341 KB | 23 | 35 KB | 240 (projects) |
| Rechnungen | `/invoices` | 1,8 s | 3,3 s | 4,3 s | 5,0 s | 251 | 440 KB | 24 | 149 KB | 298 (invoices) |
| Angebote | `/quotes` | 2,0 s | 3,3 s | 3,8 s | 4,5 s | 240 | 362 KB | 14 | 31 KB | 200 (quote_lines) |
| Baustellen | `/admin-projects` | 2,0 s | 3,2 s | 4,0 s | 5,2 s | 244 | 418 KB | 17 | 64 KB | 720 (projects) |
| Kunden | `/customers` | 1,9 s | 3,3 s | 3,5 s | 4,4 s | 238 | 363 KB | 12 | 17 KB | 200 (customers) |
| Mitarbeiterübersicht | `/accounting` | 1,9 s | 3,4 s | 4,5 s | 6,1 s | 252 | 367 KB | 25 | 17 KB | 51 (users) |
| Einstellungen | `/settings/meldungen` | 1,9 s | 3,4 s | 3,5 s | 4,8 s | 238 | 384 KB | 13 | 7 KB | 3 (rpc/zwei_faktor_ohne_faktor) |

**Antworten mit mehr als 50 Zeilen** (Budget B3: höchstens 50 je Anfrage, kein ganzer Bestand):

- **Start** (`/`): wartungen 200 Zeilen; invoices 198 Zeilen in 2 Anfragen; rpc/lager_knapp 192 Zeilen; projects 120 Zeilen; rpc/baustellen_stunden 90 Zeilen; material_orders 80 Zeilen; rpc/baustellen_ohne_einsatz 80 Zeilen; rpc/unverrechnete_stunden 55 Zeilen
- **Planung (Tag)** (`/assignments/tag`): projects 240 Zeilen in 2 Anfragen
- **Planung (Woche)** (`/assignments/woche`): projects 120 Zeilen
- **Lager** (`/lager`): materials 2 000 Zeilen in 6 Anfragen; rpc/lager_frei 1 000 Zeilen in 2 Anfragen; material_orders 400 Zeilen in 2 Anfragen
- **Anforderungen** (`/anforderungen`): material_orders 560 Zeilen in 6 Anfragen
- **Material anfordern** (`/material`): projects 240 Zeilen in 2 Anfragen
- **Rechnungen** (`/invoices`): invoices 298 Zeilen in 3 Anfragen; rpc/suche_customers 249 Zeilen in 2 Anfragen; projects 120 Zeilen; customers 120 Zeilen in 2 Anfragen; rpc/unverrechnete_stunden 55 Zeilen
- **Angebote** (`/quotes`): quote_lines 200 Zeilen; quotes 100 Zeilen in 4 Anfragen
- **Baustellen** (`/admin-projects`): projects 720 Zeilen in 3 Anfragen; rpc/baustellen_stunden 90 Zeilen
- **Kunden** (`/customers`): customers 200 Zeilen in 3 Anfragen
<!-- messung:ende -->
