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

## Nacharbeit: Antworten über dem Budget B3 (Welle 4, 16.11.2026)

**Befund.** Lager, Anforderungen, Baustellen und die Startseite der
Geschäftsführung holten mehr als 50 Zeilen je Anfrage (Tabellen unten,
Stand L22). Je Seite geprüft, ob die Ansicht die Zeilen braucht:

- **Lager** zeigte 20 Artikel, holte aber jeden Lagerartikel (2.000 Zeilen in
  6 Anfragen), sein Freies (`lager_frei`, 1.000 in 2) und die jüngsten 200
  Anforderungen (zweimal), um im Browser zu suchen, zu filtern, nach dem
  Freien zu sortieren und Knapp, Fehlt und Reserviert zu zählen. Das rechnet
  jetzt die Datenbank nach denselben Regeln
  (`supabase/migrations/20261118030000_lager_liste.sql`, `lager_liste`): die
  gezeigte Seite und die Zahlen über alle; „und N weitere anzeigen“ holt die
  nächsten 20, die Suche (auch über Nummern der Großhändler) geht über alle.
  Neu gefragt wird, wenn der Kanal eine Änderung an Artikeln oder
  Anforderungen meldet. Artikelwahl, weiterer Ort und Seitenfenster fragen
  dieselbe Funktion.
- **Startseite:** die knappen Artikel (`lager_knapp`, 192) und die fälligen
  Wartungen (200 — dort war Schluss, darüber stimmten die Zahlen nicht mehr)
  kamen ganz, gezeigt werden je drei. Jetzt Zahl und die drei dringendsten
  aus `lager_liste` und aus `wartungen_faellig_stand`
  (`20261118031000_wartungen_faellig_stand.sql`, je Abschnitt Zahl,
  überfällig und die ersten nach dem Fälligkeitstag).
- **Anforderungen:** die jüngsten 200 (zweimal geholt) brauchen nur „Erledigt“
  und „Retouren“; sie kommen jetzt erst, wenn einer dieser Reiter offen ist.

Gemessen mit `messung.mjs --quelle=…` gegen einen eigenen Stapel mit demselben
gewachsenen Bestand (Median aus drei Läufen, Handy-Profil wie unten). Während
der Messung „vorher“ lief auf demselben Rechner ein Prüflauf gegen einen
zweiten Stapel: die Zeiten sind nur grob vergleichbar, Zeilen, Anfragen und
Datenmengen hängen davon nicht ab.

| Seite | vorher | nachher |
|---|---|---|
| Lager | bereit 5,1 s · 444 KB · 21 DB-Anfragen · 117 KB DB-Daten · grösste Liste 2.000 (materials) | bereit 3,7 s · 330 KB · 15 DB-Anfragen · 6 KB · keine Antwort über 50 Zeilen |
| Start (Geschäftsführung) | bereit 5,2 s · 444 KB · 84 KB DB-Daten · wartungen 200, lager_knapp 192 | bereit 4,7 s · 424 KB · 64 KB · beide unter 50 |
| Anforderungen | bereit 3,8 s · 365 KB · 47 KB · material_orders 560 in 6 Anfragen | bereit 3,8 s · 335 KB · 17 KB · material_orders 160 in 4 Anfragen |
| übrige Seiten | 4,0–6,3 s | 3,4–5,0 s (an ihnen nichts geändert — der Unterschied ist die Last daneben) |

Zunächst offen gelassen und danach gebaut (Teile 1–3 unten): Anforderungen
„Laufend“, Baustellen und die offenen Rechnungen der Startseite. Die übrigen
Seiten der Liste unten waren nicht Teil dieses Auftrags.

**Nacharbeit, Teil 1 — Anforderungen „Laufend“** (`20261118032000_anforderungen_laufend.sql`):
je Gruppe Zahl und die gezeigten 20 aus der Datenbank, gefiltert wie von der
Startseite verlangt; der ganze Arbeitsstand nur noch für die Einkaufsliste.
Gemessen (eigener Stapel, ein Lauf): grösste Antwort 160 → 8 Zeilen, bereit
3,8 → 3,6 s.

**Nacharbeit, Teil 2 — Baustellen** (`20261118033000_baustellen_liste.sql`):
je Statusgruppe Zahl und die gezeigten 20 aus der Datenbank über alle
Baustellen, Schriftfeld und Budgetstand ebenso; ohne Filter fehlen ältere
laufende Baustellen nicht mehr hinter den jüngsten 300. Gemessen (ein Lauf):
projects 720 → keine Antwort über 50 Zeilen außer der Belegschaft (51 Konten,
siehe Grenzen), 421 → 380 KB, bereit 4,3 → 4,4 s.

**Nacharbeit, Teil 3 — offene Rechnungen der Startseite**: die Regeln stehen
in `shared/forderungen.ts`; die Edge Function `startseite-forderungen` rechnet
mit ihnen über alle offenen Köpfe und schickt Zahlen und je Abschnitt drei
Zeilen (rund 1,5 KB statt 198 Köpfen). Gemessen (ein Lauf, Rechner zu der
Zeit merklich langsamer — FCP 2,3 statt 1,8 s): keine Antwort der Datenbank
über 50 Zeilen außer `projects` (120, die laufenden Baustellen für Budget,
Einsatzplanung und „ohne Projektleiter“ — nicht Teil dieses Auftrags),
424 → 403 KB, bereit 4,7 → 5,3 s (alle Seiten in diesem Lauf 5–15 % langsamer).

**Noch über dem Budget** auf den Seiten dieses Auftrags danach: die
Belegschaft auf der Baustellenseite (51 Konten, Grenze: Betriebsgröße).

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
