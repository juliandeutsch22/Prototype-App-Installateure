# Gegenprüfung: Zeit und Personal (`analyse/1-zeit-personal.md`) — 23.11.2026

Geprüft von einem unabhängigen Prüfer. Stand `main` fa6e740 (Arbeitsstand 663b684, nur
Dokumente dazu). Womit geprüft:

- **Wegwerf-Datenbank `pruef_z`** (Postgres 16, alle 358 Migrationen am Endstand): jede
  zitierte Funktion am Endstand gelesen (`\sf`, `pg_get_functiondef`), nicht in der
  Migrationsdatei; ein eigener Betrieb mit fünf Konten (Administrator, Buchhaltung,
  Geschäftsführung, zwei Monteure), Aufrufe mit der Rolle `authenticated` und dem Token
  des jeweiligen Kontos, jede Probe in einer Transaktion mit `rollback`.
- **Eigene Rechenprobe** gegen `src/lib/time.ts` (`vitest`, eigene Konfiguration, andere
  Zahlen als das Papier) für Z-5.
- **Eigenes Skript** über die 358 Migrationen für Z-15.
- Belege in `src/`, `shared/`, `tests/supabase/` an Datei und Zeile gelesen.

Die Skripte liegen außerhalb des Repositorys unter `scratchpad/audit/pruef-z/`
(`z1.sql`, `z1b.sql`, `z1c.sql`, `z1d.sql`, `z2.sql`, `z2b.sql`, `z4.sql`, `z5.sql`,
`z5.pruef.ts`, `z7.sql`, `z8.sql`, `kA.sql`/`kB.sql`, `z15.py`). Im Repository ist nur
diese Datei neu.

## 1. Ergebnis in Zahlen

| Urteil | Anzahl | Befunde |
|---|---|---|
| bestätigt (nachgestellt) | 7 | Z-1, Z-2, Z-4, Z-5, Z-7, Z-8, Z-15 |
| bestätigt (am Code) | 8 | Z-3, Z-9, Z-10, Z-11, Z-12, Z-13, Z-14, Z-16 |
| teilweise | 1 | Z-6 |
| widerlegt | 0 | — |
| nicht prüfbar | 0 | — |

Kein Befund ist widerlegt. **Aber drei Vorschläge reichen so, wie sie dastehen, nicht
aus oder würden etwas verschlechtern** (Z-1, Z-2, Z-15 — Abschnitt 2a), und der Plan gibt
zwei Befunde anders wieder als das Papier (Z-8, Z-14 — Abschnitt 4).

## 2. Je Befund

| Kürzel | Urteil | Eigener Beleg | Zum Vorschlag: Risiko „verschlimmbessern“, fehlendes „bleibt gleich“, Widerspruch |
|---|---|---|---|
| Z-1 | bestätigt (nachgestellt) | Betrieb mit Monatsabschluss, Oktober von der Buchhaltung abgeschlossen. `rechnung_anlegen` mit `p_belege = {"time_entry":[…]}` über zwei Oktoberbuchungen: `ERROR: Der Monat 10/2026 ist abgeschlossen — Änderungen nur über einen Korrekturantrag`. Gegenprobe vor dem Abschluss: dieselbe Rechnung geht, beide Buchungen `is_billed = t`. Ebenso gescheitert: `rechnung_stornieren` (Rechnung vor dem Abschluss ausgestellt) und `baustelle_umnummern`. Endstand `app.monat_abgeschlossen_sperre` hat genau die zwei Ausnahmen (Dienstschlüssel, Merker). | **Unvollständig, siehe 2a.** (1) Ein vierter Weg scheitert und bleibt mit dem Vorschlag gesperrt: Einstufung, Lehrbeginn oder Lehrzeit einer Person ändern. (2) Die Ausnahme lässt mittelbar doch etwas anderes durch: `is_night_work` kippt beim Ausstellen. (3) Der Merker für das Umnummern muss nach dem `UPDATE` zurückgesetzt werden. |
| Z-2 | bestätigt (nachgestellt) | Endstand `urlaub_entscheiden`: `select u.work_days into arbeitstage …; tage := app.urlaubstage(arbeitstage, a.von, a.bis)`. Nur diese beiden Funktionen rechnen noch so; die acht anderen (`urlaub_eintragen`, `krankmeldung_speichern`, `freistellung_*`, `berufsschule_eintragen`, `betriebsurlaub_fuer_person`, …) nutzen `urlaubstage_person`. Nachgestellt: heute Mo–Fr, ab 1.1.2027 Mo–Do, Antrag 4.–8.1.2027 → `angelegt: 4`, gebucht Mo, Di, Do **und Fr 8.1.**, `tage = 4.0` (mit Verlauf wären es 3). Umgekehrt (heute Mo–Mi, ab 1.3.2027 Mo–Fr, Antrag 8.–12.3.) → nur 3 Tage, Do und Fr fehlen. `urlaub_kuerzen`: Donnerstag 11.3. streichen → `Der 11.03.2027 ist kein Urlaubstag`. | **Ein „bleibt gleich“ fehlt, siehe 2a:** nach der Korrektur lässt sich ein unter dem Fehler gebuchter Tag (der Freitag) nicht mehr einzeln streichen. Sonst trägt der Vorschlag: nach dem Textersatz bucht ein neuer Antrag 18.–22.1. genau Mo–Do; ohne Verlauf liefern `urlaubstage` und `urlaubstage_person` für sieben Muster von Arbeitstagen dieselben Tage (14.12.2026–17.1.2027 verglichen). Anmerkung zum Umfang: bei `urlaub_kuerzen` hängt die Zahl der Urlaubstage an den gebuchten Zeilen, nicht an `work_days` — betroffen sind dort die Prüfung „gestrichener Tag ist Arbeitstag“, der Filter „Teil ohne Arbeitstag“ und die Tage beim Zeitausgleich. |
| Z-3 | bestätigt (am Code) | Endstand `zeitkonto_salden`: `p.anfang + sum(ist_min + gutschrift_min − soll_min)`; `time.ts:876, 991` ebenso. In der Datenbank gibt es keine Tabelle und keine Funktion mit „auszahl/ausbezahlt“ (Katalog durchsucht); `urlaubsanspruch_anpassungen` ist das einzige Gegenstück. `export.ts:301, 350` und `LohnregelnKarte.tsx:188–196` wie zitiert. Entscheidung E63 (M06e) sperrt nur Zeitmodelle und Zulagen, keine Buchung einer Auszahlung. | `calcOverallSaldo` hat mehrere Aufrufer (`zeitguthaben.ts`, `TimeView.tsx`, `eigeneKonten.ts`, `tagesbuchungen.ts`, `benutzerVorgaben.ts`, `zeitkonto.ts`). Ein Eingang mit Vorgabe „leer“ lässt einen vergessenen Aufrufer still den alten Saldo zeigen — der Eingang muss Pflicht sein, oder die Prüfung „App = Datenbank“ läuft über jeden Aufrufer. Die Spalte „Zeitkonto am Monatsende(Std)“ steht in Z-3 **und** Z-13 (siehe 4). `vacations.saldo_bei_antrag` (festgehaltener Stand beim Antrag) ist im Vorschlag nicht genannt: bleibt, wie er war. |
| Z-4 | bestätigt (nachgestellt) | Meldung 1.–2.9.2026, von der Monteurin selbst erfasst. Heute (23.11.) neue Meldung 15.–18.9.: `Selbst melden geht bis 14 Tage zurück (ab 09.11.2026)`. Dieselbe Person mit `krankmeldung_speichern(<id>, null, '2026-09-01', '2026-09-18')`: geht durch, `angelegt: 12`, danach 14 Krank-Tage 1.–18.9. Zurück auf 1.9.: `entfernt: 13`. Der Auslöser `krankmeldungen_rueckwirkend` ist `BEFORE INSERT OR UPDATE OF von` und lässt bei `new.von >= old.von` alles durch; `krankmeldungen_push` nur `AFTER INSERT`. `Krankmeldungen.tsx:199–206` (`min={k.von}`, sonst keine Grenze). | Trägt. Zwei Hinweise: (a) `krankmeldung_speichern` schreibt bei jedem Speichern `von` und `bis` (auch wenn nur die Notiz geändert wird) — der neue Push braucht `WHEN (old.von is distinct from new.von or old.bis is distinct from new.bis)`, sonst meldet jede Notiz. (b) Wer länger als 14 Tage nicht verlängert hat (schwer krank, App nicht geöffnet), kann danach nicht mehr selbst verlängern; das ist die Regel, aber die Meldung muss es sagen. Mit eingeschaltetem Monatsabschluss ist die Umgehung für abgeschlossene Monate schon heute zu (der Auslöser an `time_entries` weist ab). |
| Z-5 | bestätigt (nachgestellt) | Eigene Rechenprobe (`z5.pruef.ts`): Dienstverhältnis 1.2.–31.5.2026, Mai voll gebucht (18 Tage). Vor dem Wiedereintritt Mai Ist 144 / Soll 144 / Saldo 0; nach dem Wiedereintritt am 1.9. **Ist 144 / Soll 0 / Saldo +144**. Urlaub: 7 Tage im April, Feld leer → `rest: 18` statt 25. In der Datenbank liefert `zeitkonto_monate('2026-05-01','2026-05-31', …)` nach demselben `UPDATE` wie `BenutzerakteView.tsx:566–572` **keine Zeile mehr** (vorher 144/144/0). | Der Dialog sagt heute „das alte Zeitkonto bleibt abgeschlossen“ (`BenutzerakteView.tsx:550`) — das stimmt nicht. Diese Aussage zu berichtigen ist keine „erste Fassung“ und sollte nicht bis Paket 17 warten. Der Umbau selbst berührt Saldo, Urlaub, Pflichttage, Zwischenstände und (mit Z-11) den Beginn des Arbeitsjahres: Z-5 vor Z-11, wie im Plan. |
| Z-6 | teilweise | Die Lücke stimmt: `zeitkorrekturen.eintrag_id` ist `NOT NULL`; `zeit_korrektur_beantragen` verlangt eine **eigene** bestehende Buchung (`e.user_id <> auth.uid()` → 42501); „umgesetzt“ ändert nur unverrechnete Zeilen mit Stand Anwesend oder Zeitausgleich. Nicht ganz: siehe 3. | **Die Risikoaussage des Papiers stimmt nicht**, siehe 3: sechs Wächter an `time_entries` greifen in einer `security definer`-Funktion nicht. |
| Z-7 | bestätigt (nachgestellt) | Zeitausgleichsantrag 29.–30.10. offen; `zeit_monat_abschliessen('2026-10-01')` geht ohne Hinweis durch; danach `urlaub_entscheiden(…, 'Genehmigt')`: `Der Monat 10/2026 ist abgeschlossen …`. Endstand `zeit_monat_abschliessen` prüft Rolle, Einstellung, „vergangener Monat“, sonst nichts. Timer-Fall nur gelesen (`zeit_timer_buchen` legt in `time_entries` an). | Der Zähler „Fälle der Arbeitszeitgrenzen ohne Begründung“ gehört **nicht** in `zeit_monat_stand`: die Grenzen rechnet nur die App (`arbeitszeitGrenzen.ts`), in der Datenbank gibt es dazu nur `arbeitszeit_begruendungen`. In SQL wäre es ein zweiter Rechenweg für AZG/ARG/KJBG (gegen die benannte Grenze L5). Diesen Zähler aus den schon geladenen Daten der Mitarbeiterübersicht nehmen. |
| Z-8 | bestätigt (nachgestellt) | Heute 7–11 Uhr gebucht, dann `krankmeldung_speichern(null, null, heute, morgen)`: `angelegt: 1, uebersprungen: 1`; heute bleibt „Anwesend 07:00–11:00“, nur morgen „Krank“. Krank von Hand daneben: `Für den 23.11.2026 sind schon Einträge („Anwesend") gebucht …` (`app.ganzer_tag_allein`). | Die Reihenfolge fehlt im Vorschlag: meldet sich jemand **zuerst** krank und trägt den Vormittag **danach** ein, weist der Zweig „Anwesend“ von `ganzer_tag_allein` ab — beide Richtungen müssen gehen (auch `zeit_timer_buchen`). „Alle Monate rechnen einmal neu“: gleich bleiben muss, dass der Altbestand auf die Minute dieselben Zahlen ergibt (heute kann es „Krank + Anwesend“ an einem Tag nicht geben) — als eigene Prüfung über den gewachsenen Bestand. |
| Z-9 | bestätigt (am Code) | Endstand `freistellung_beantragen(p_art, p_anlass, …)`: kein Parameter für die Person, `where id = wer`; Anlässe fest aufgezählt (Zeile 45 der Funktion). `shared/freistellung.ts:76–98` wie zitiert. `freistellung_nur_ueber_antrag` sperrt den direkten Weg über die Buchung. | Trägt. `freistellung_entscheiden` hat zehn Parameter (Nachweis, Teilung, Kürzung): „in einem Zug“ muss diese Funktion rufen, nicht nachbauen. |
| Z-10 | bestätigt (am Code) | `ArbeitszeitVerlaufKarte.tsx:216` (Hinweis auf die Handanpassung); kein Umrechnungsvorschlag in `shared/urlaubAliquot.ts` (nur `kuerzungsVorschlag`). Rechtsaussage nicht geprüft. | Trägt (nichts geschieht von selbst). Kanzlei zuerst, wie im Plan. |
| Z-11 | bestätigt (am Code) | `20260920100000_urlaubsjahr_beginn.sql:17–23`, `SettingsView.tsx:1043–1045`, `types/index.ts:327–329` wie zitiert; im Grenzen-Dokument keine Zeile dazu; `shared/freistellung.ts:254–264` rechnet das Arbeitsjahr. | Fundstelle: der Normalfall „Arbeitsjahr“ steht nach meiner Kenntnis in § 2 Abs 1 UrlG, Abs 4 ist die Umstellung auf das Kalenderjahr (die Migration nennt Abs 2). Vor dem Bau mit der Kanzlei klären, auch wie die Einstellung „verfällt an einem festen Tag“ mit je Person verschiedenen Jahren zusammengeht — das nennt der Vorschlag nicht. |
| Z-12 | bestätigt (am Code) | `time.ts:404–408`, `VacationsView.tsx:1656–1663`; in `src/features/dashboard` und `shared/notifyLogic.ts` keine Fundstelle zu Verjährung oder Verfall. Rechtsaussage nicht geprüft. | Trägt. |
| Z-13 | bestätigt (am Code) | `export.ts:252, 338` (nur Name), `:287–290` (Kopfzeile ohne Zeitkontostand); „Personalnummer“ kommt in `src`, `shared` und den Migrationen nicht vor; `stand-2026-10-03.md:1487`. | Trägt. Überschneidung mit Z-3 (dieselbe Spalte), siehe 4. |
| Z-14 | bestätigt (am Code) | `time.ts:539`, `ueberstunden.ts:70`, `standardZeitfelder.ts:4`, `export.ts:244, 264`; im Grenzen-Dokument nur die Wegzeit Schule–Betrieb (A9). | Das Papier schlägt vor: benennen, die Einstellung erst nach fachlicher Klärung. Der Plan führt die Einstellung als entschieden — siehe 4. |
| Z-15 | bestätigt (nachgestellt) | Eigenes Skript: 42 Dateien mit `pg_get_functiondef`; genau eine Funktion wird nach einem Textersatz noch einmal vollständig definiert: `public.urlaub_entscheiden` (Textersatz `20261116020000`, Neudefinition `20261116030000`). Ein zweiter Treffer meines Skripts (`app.zeitkonto_monate_gemerkt`) ist keiner (der Name steht dort im Ersatztext). | **Die Gegenprobe „nach Z-2 grün“ geht für den Wächter über die Migrationen nicht auf**, siehe 2a. |
| Z-16 | bestätigt (am Code) | `vacations.ts:22–28` (alle Arten und Stände, `von` absteigend, `grenze: max`), `VacationsView.tsx:354, 597` (500), `:522–546` (`urlaubsStand` aus genau dieser Liste). | Trägt. |

### 2a. Bestätigte Befunde, deren Vorschlag nicht reicht

**Z-1 — der Vorschlag deckt nicht alles, und die Ausnahme lässt mehr durch als gedacht.**
Den Vorschlag habe ich als Funktion eingespielt (in einer Transaktion, `z1c.sql`,
`z1d.sql`): Ausnahme für ein `UPDATE`, bei dem sich außer `is_billed`, `invoice_number`,
`updated_at` nichts ändert; Merker `app.monatsabschluss_umnummern` gibt `project_number`
frei.

Was damit geht (nachgestellt): `rechnung_anlegen`, `rechnung_stornieren`,
`rechnung_storno_aufheben`, `baustelle_umnummern` (mit Merker). Was gesperrt bleibt
(nachgestellt, je 23514): Büro ändert Ende, Kommentar, Baustelle, Notdienst, löscht; der
Monteur setzt `is_billed` nicht (`Nur die Buchhaltung darf den Verrechnungsstand aendern`,
42501).

Drei Punkte fehlen:

1. **Einstufung ändern scheitert — heute und mit dem Vorschlag.** Der Auslöser
   `users_satz_nachziehen` (`AFTER UPDATE OF einstufung, lehrbeginn, lehrzeit_monate`)
   setzt `satz = null` an **allen** unverrechneten Anwesend-Buchungen der Person, ohne
   Datumsgrenze. Nachgestellt: Monteurin mit einer unverrechneten Oktoberbuchung, Oktober
   abgeschlossen, Geschäftsführung setzt `einstufung = 'obermonteur'` →
   `Der Monat 10/2026 ist abgeschlossen — Änderungen nur über einen Korrekturantrag`.
   Gegenprobe vor dem Abschluss: geht. Die Benutzerakte schreibt die Einstufung direkt
   an `users` (`src/lib/db/pg/users.ts:153–160`), der Dienstschlüssel hilft also nicht.
   Betroffen ist jede Person mit Stunden, die nie verrechnet werden (Pauschalbaustellen,
   interne Stunden) — nach dem ersten Abschluss praktisch jede. `satz` steht nicht in der
   vorgeschlagenen Spaltenliste. Zu entscheiden: `satz` in die Ausnahme aufnehmen (der
   Satz ist Verrechnung und Nachkalkulation, nicht Arbeitszeitaufzeichnung; ein direktes
   Schreiben überschreibt `app.satz_setzen` ohnehin) **oder** `app.satz_nachziehen` lässt
   abgeschlossene Monate aus. In beiden Fällen mit eigener Prüfung.
2. **Die Ausnahme vergleicht, bevor die anderen Auslöser die Zeile ändern.**
   `time_entries_abgeschlossen` läuft als erster `BEFORE`-Auslöser (alphabetisch). Danach
   rechnen `nacht_setzen`, `satz_setzen` und `baustelle_aufloesen` an derselben Zeile
   weiter, solange `old.is_billed = false` — also genau beim Ausstellen. Nachgestellt:
   Buchung 16.10., 18:00–21:30; nach dem Abschluss stellt der Betrieb die Nachtzeit von
   22:00 auf 20:00; `rechnung_anlegen` über die Buchung → **`is_night_work` wechselt im
   abgeschlossenen Monat von `false` auf `true`**. Das Kennzeichen steht in Lohn-CSV und
   Stundennachweis (`zuschlaege.ts`). Das Papier nennt „Nacht/Notdienst“ ausdrücklich
   unter „bleibt gleich“ — der Vorschlag hält das nicht. Nötig: eine Prüfung „eine
   Rechnung über einen abgeschlossenen Monat lässt jede andere Spalte unverändert, auch
   wenn Nachtzeit oder Einstufung inzwischen geändert wurden“, und dafür eine Stelle, die
   im abgeschlossenen Monat nichts nachrechnet (am engsten: `nacht_setzen` lässt die
   Zeile, wenn der Monat abgeschlossen ist und sich Zeiten, Stand und Abwahl nicht
   ändern). In offenen Monaten bleibt das heutige Nachrechnen.
3. **Der Merker für das Umnummern gilt bis zum Ende der Transaktion.** Nachgestellt:
   nach `baustelle_umnummern` (Merker „an“) ging in derselben Transaktion ein freies
   `update … set project_number = null` an einer Oktoberbuchung durch. Über die
   Schnittstelle ist jeder Aufruf eine eigene Transaktion, einen Weg dorthin gibt es
   heute nicht — die Funktion soll den Merker trotzdem gleich nach ihrem `UPDATE`
   zurücksetzen (`set_config(…, '', true)`).

Was sonst an Zeitbuchungen abgeschlossener Monate schreibt (Katalog der Datenbank
durchsucht: 21 Funktionen mit `insert`/`update`/`delete` auf `time_entries`, dazu die
Fremdschlüssel):

| Stelle | Schreibt an `time_entries`? | Im abgeschlossenen Monat |
|---|---|---|
| `kunde_umbenennen`, `kunden_zusammenfuehren`, Auslöser an `customers` | nein (`customer_name` ist Text, kein Verweis) | unberührt |
| `person_loeschen` (Mitarbeiter und Kunde) | nein (Zeitbuchungen werden aufbewahrt) | unberührt |
| `betrieb_loeschen_ausfuehren` | ja, nur mit Dienstschlüssel ausführbar | geht durch |
| `users_satz_nachziehen` | ja (`satz`) | **scheitert**, siehe 1 |
| `users_betriebsurlaub_nachbuchen` (Saldo-Start geändert, Betriebsurlaub im abgeschlossenen Monat noch nicht gebucht) | ja (legt Urlaubstage an) | scheitert mit derselben Meldung beim Speichern der Benutzerakte — fachlich richtig, die Meldung passt nicht (nur gelesen) |
| `urlaub_kuerzen` (`vacation_id` am zweiten Teil), `urlaub_entscheiden` „Storniert“, `krankmeldung_speichern`/`_loeschen`, `freistellung_entscheiden`, `betriebsurlaub_loeschen`, `zeit_aufteilen`, `zeit_einfuegen`, Timer | ja | scheitern — gewollt, sie ändern die Aufzeichnung |
| Fremdschlüssel `ON DELETE SET NULL` (`vacation_id`, `krankmeldung_id`, `freistellung_id`) | ja, beim Löschen des Antrags | scheitert; die Funktionen löschen die Tage ohnehin vorher |
| Bildschirm: direkte Änderung nur über `TimeForm`, Löschen in `TimeView`/`AccountingView` | ja | scheitern — gewollt |

**Z-2 — unter dem Fehler gebuchte Tage dürfen nicht unkürzbar werden.** Mit dem
Textersatz aus dem Vorschlag (eingespielt, `z2b.sql`): ein unter dem heutigen Stand
genehmigter Urlaub 4.–15.1.2027 trägt die Freitage 8.1. und 15.1. Den 8.1. einzeln
streichen → `Der 08.01.2027 ist kein Urlaubstag — gestrichen wird ein Arbeitstag`. Am
Rand kürzen (bis 14.1.) geht. Heute ginge das Streichen. Die Prüfung muss einen Tag
gelten lassen, an dem eine Zeile dieses Antrags steht. Dazu fehlt dem Vorschlag eine
Aussage zum Bestand: zwischen 16.11. (Migration `20261116030000`) und der Korrektur
genehmigte Anträge von Personen mit Verlauf können einen Tag zu viel oder zu wenig
tragen. Nicht umschreiben (Altdaten), aber dem Betrieb nennen — eine lesende Abfrage
„genehmigte Anträge seit 16.11., deren gebuchte Tage von `urlaubstage_person` abweichen“.

**Z-15 — die Gegenprobe braucht einen Eintrag in der Ausnahmeliste.** Der Wächter liest
die Migrationen; „keine Migration wird angefasst“. Die Neudefinition in `20261116030000`
steht also für immer dort, und die Korrektur aus Z-2 fasst `urlaub_entscheiden` ein
weiteres Mal an. „Am heutigen Stand rot, nach Schritt 2 grün“ stimmt nur für die Tabelle
„Funktion → muss enthalten“ in `tests/supabase/schema.test.ts` (die braucht die
Datenbank). Der Wächter ohne Datenbank wird nur grün, wenn die Stelle mit Grund
(„behoben in <Migration>“) in die Ausnahmeliste kommt. Das muss im Plan stehen, sonst
wird die Prüfung beim Bau passend gebogen.

## 3. Nicht bestätigt — im Einzelnen

### Z-6 (teilweise)

**Was das Papier sagt:** Im abgeschlossenen Monat geht über den Korrekturantrag nur das
Ändern; zwei bzw. drei Texte sagen mehr zu; das Risiko des Umbaus sei gedeckt, weil die
Prüfungen des normalen Wegs „als Auslöser an der Tabelle sitzen und das tun“.

**Was ich gefunden habe:**

- Die Lücke stimmt (Beleg oben).
- Die Texte: die beiden Texte der Oberfläche (`MonatsabschlussEinstellung.tsx:49`,
  `AccountingView.tsx:1480`) sagen wörtlich „nichts mehr buchen, ändern oder löschen …
  Wer noch etwas **ändern** muss, stellt einen Korrekturantrag“ — das ist eng gelesen
  richtig, nur leicht misszuverstehen. Eindeutig falsch ist die Meldung der Datenbank:
  sie antwortet auch auf das **Anlegen** und **Löschen** mit „Änderungen nur über einen
  Korrekturantrag“ (nachgestellt bei Z-7; `monatsabschluss.test.ts:60–66` hält genau
  diesen Wortlaut für ein `insert` fest). „Drei Texte sagen mehr zu“ ist damit zu stark:
  einer weist auf einen Weg, den es nicht gibt, zwei sind unscharf.
- **Die Risikoaussage ist falsch.** Sechs Wächter an `time_entries` beginnen mit
  `if current_user <> 'authenticated' then return …`: `krank_nur_ueber_meldung`,
  `urlaub_nur_ueber_antrag`, `zeitausgleich_vier_augen`, `jugendschutz_buerobuchung`,
  `freistellung_nur_ueber_antrag`, `berufsschule_nur_ueber_eintrag`.
  `zeit_korrektur_entscheiden` ist `security definer` und schreibt als Eigentümer; die
  Funktion sagt es selbst („Die Wächter an time_entries sehen diesen Aufruf nicht“) und
  baut deshalb ihre Grenzen von Hand nach (nur Anwesend/Zeitausgleich, nicht verrechnet,
  nicht aus Antrag oder Meldung, Vier-Augen beim Zeitausgleich). Ein Nachtrag und ein
  Löschen über dieselbe Funktion brauchen dieselben Grenzen ausdrücklich: Nachtrag nur
  mit Stand „Anwesend“ (Krank, Urlaub, Sonderurlaub, Berufsschule weiter nur über ihren
  Weg), Löschen nur von Zeilen ohne `vacation_id`/`krankmeldung_id`/`freistellung_id`
  und nicht verrechnet. Überschneidung, Eintritt/Austritt und „ganzer Tag allein“
  greifen dagegen wirklich (sie prüfen den Dienstschlüssel, nicht `current_user`).

**Was zu ändern ist:** Im Papier die Risikozeile von Z-6 (Wächter greifen nicht von
selbst; Grenzen in der Funktion, mit Prüfung je Grenze) und „Krankmeldung nachtragen“ aus
der Auswirkung nehmen oder als eigener Weg benennen (das Büro trägt sie über
`krankmeldung_speichern` ein — im abgeschlossenen Monat scheitert auch das). Im Plan
(3.1) „drei Texte sagen mehr zu“ → „die Meldung der Datenbank verweist beim Anlegen und
Löschen auf einen Weg, den es nicht gibt“.

## 4. Zum Plan

1. **Abschnitt 1.2, „Rückfälle … zwei davon … nachgestellt“.** Das Papier Z sagt selbst
   „Nichts lief gegen eine Datenbank“. Z-1 und Z-2 sind jetzt beide an der Datenbank
   nachgestellt (dieser Bericht). Z-1 ist kein Rückfall eines erledigten Punktes, sondern
   eine Nebenwirkung des neuen Monatsabschlusses (Z6, 16.11.) — Überschrift oder Satz
   anpassen.
2. **Paket 1, Schritt 3 (Z-1)** um die drei Punkte aus 2a ergänzen: Einstufung ändern
   (`users_satz_nachziehen`), kein Nachrechnen von `is_night_work` im abgeschlossenen
   Monat, Merker zurücksetzen. „Bleibt gleich“ ergänzen um: Nacht-Kennzeichen, Satz und
   Baustellenbezug einer Zeile nach Ausstellen/Storno unverändert; der Monteur setzt
   `is_billed` weiterhin nicht; Anlegen mit `is_billed = true` bleibt gesperrt; offene
   Monate rechnen wie heute. Aufwand „k“ (bis ½ Tag) ist damit zu knapp — eher „m“.
3. **Paket 1, Schritt 2 (Z-2)** um „unter dem Fehler gebuchte Tage bleiben einzeln
   streichbar“ und die lesende Abfrage für den Bestand seit 16.11. ergänzen.
4. **Paket 1, Schritt 1 (Z-15):** „nach Schritt 2 grün“ gilt nur mit einem begründeten
   Eintrag in der Ausnahmeliste (siehe 2a).
5. **Z-8 ist im Plan anders beschrieben als im Papier.** Paket 17 (b) nennt „stundenweise
   Krankmeldung“. Das Papier schlägt das nicht vor, sondern: am ersten Tag einer
   Krankmeldung darf „Krank“ neben „Anwesend“ stehen, gutgeschrieben wird der Rest zum
   Tagessoll (wie der Berufsschultag mit Arbeit). Eine stundenweise Krankmeldung wäre ein
   anderer, größerer Umbau. Wortlaut im Plan an das Papier angleichen.
6. **Z-14 hat im Plan keinen Schritt und geht weiter als das Papier.** Tabelle 3.1 sagt
   „17 (entschieden)“, E-Z14 „Einstellung je Betrieb: ja“; die Reihenfolge (a)–(g) von
   Paket 17 nennt Z-14 nicht. Das Papier schlägt nur vor, die Grenze zu benennen, und
   stellt die Einstellung unter den Vorbehalt einer fachlichen Klärung mit Pilotbetrieb
   und Kanzlei — in Abschnitt 9 fehlt die Frage. Eine solche Einstellung ändert Saldo,
   Überstunden, Arbeitszeitgrenzen und die Spalte „Gesamtzeit“ der Monats-CSV; ohne
   „gültig ab“ rechnete sie alle vergangenen und abgeschlossenen Monate um. Sie berührt
   auch E63 (M06, Standardfelder: „Abrechnungsbedeutung … lässt sich nicht
   umdefinieren“). Schritt, Kanzleifrage und „gilt ab“ nachtragen.
7. **Z-3 und Z-13 schlagen dieselbe Spalte vor** („Zeitkonto am Monatsende(Std)“).
   Paket 17 baut (d) Z-13 vor (f) Z-3: die Spalte käme zuerst und änderte mit Z-3 ihre
   Bedeutung (nach Auszahlungen), die Byte-Referenzen der CSV wechselten zweimal. Einmal
   festlegen, in welchem Schritt die Spalte entsteht und was sie zählt.
8. **Paket 17, „Bleibt gleich: abgeschlossene Monate … werden nicht neu gerechnet“**
   steht neben Z-8 („alle Monate rechnen einmal neu — gewollt“). Kein Widerspruch in den
   Zahlen, wenn der Altbestand dieselben Minuten ergibt — genau das als Prüfung nennen.
9. **Z-7:** der Zähler der Arbeitszeitgrenzen nicht in die Datenbankfunktion (Abschnitt 2).
10. **Z-5:** der falsche Satz im Dialog („das alte Zeitkonto bleibt abgeschlossen“) kann
    mit Paket 1 oder 3 berichtigt werden; der Umbau bleibt in Paket 17 vor Z-11.
11. **Z-4 in Paket 3** („Ohne Netz und stille Fehlschläge“) ist ein Rechtefehler an der
    Datenbank; fachlich passt er, die Reihenfolge ist in Ordnung.
12. Kein Vorschlag aus diesem Papier entfernt eine bestehende Funktion oder macht sie
    schwerer erreichbar. Der einzige Vorschlag, der heute Mögliches wegnimmt, ist Z-4
    (gewollt) und — unbeabsichtigt — Z-2 beim Streichen falsch gebuchter Tage (2a).

## 5. Geklärte Verdachtsfälle

- **Zwei gleichzeitige Krankmeldungen derselben Person — bestätigt (nachgestellt).** Zwei
  Verbindungen, dieselbe Person: A meldet 23.–25.11. und hält die Transaktion vier
  Sekunden offen, B meldet währenddessen 24.–26.11. Beide enden mit `COMMIT`. Danach
  stehen zwei überschneidende Krankmeldungen in der Tabelle, und am 24. und 25.11. je
  **zwei** Zeilen „Krank“. Weder `krankmeldung_speichern` noch `ganzer_tag_allein` sperrt
  die Person; an `krankmeldungen` gibt es nur `bis >= von`. Gehört als Befund in den Plan
  (Sperre je Person wie `pg_advisory_xact_lock` in `zeit_korrektur_beantragen`, oder
  Ausschlussbedingung).
- **Der Monatsabschluss sperrt Eintritt und Austritt nicht — bestätigt (nachgestellt).**
  Oktober abgeschlossen, Soll der Person 168 Std. `update users set austritt =
  '2026-10-16', active = false` geht durch: Soll danach 96 Std. `eintritt`/`app_start_date`
  auf 12.10.: Soll 112 Std. Zum Vergleich weist `arbeitszeit_aendern` ab 20.10. ab („träfe
  einen abgeschlossenen Monat“). Die benannte Grenze nennt Saldo-Start, nicht Eintritt
  und Austritt; am Abschluss bleibt keine Spur.
- **Fenster der Wochenruhe:** am Code nachvollzogen (`arbeitszeitGrenzen.ts:183–186`
  zieht den Wiener Versatz ab, `:324–325` nicht), nicht nachgerechnet. Bleibt Verdacht.
- **`listOpenVacations` höchstens 100:** `vacations.ts:43–48` ohne Reihenfolge in der
  Abfrage; in `VacationsView.tsx` keine Fundstelle für einen Hinweis, wenn die Grenze
  greift. Nicht weiter verfolgt.

## 6. Nicht geprüft

- Die Abschnitte 4 (Grenzen neu bewertet), 5 (Ideen) und 6 (nachgeprüfte ✔-Punkte) des
  Papiers — nur dort, wo ein Befund darauf verweist.
- Die übrigen Verdachtsfälle: Timer-Zeitpunkt vom Gerät, Deaktivieren mit Austritt in der
  Zukunft, „verfällt an einem festen Tag“, Summenzeile des Stundennachweis-PDF.
- Rechtsaussagen (Z-10, Z-11, Z-12, Kollektivvertrag): nicht am Gesetzestext geprüft; die
  Anmerkung zu § 2 UrlG bei Z-11 stammt aus meiner Kenntnis und gehört zur Kanzlei.
- `rechnung_ersetzen` nicht selbst aufgerufen (es ruft `rechnung_stornieren`, das
  nachgestellt ist). Der Timer-Fall in Z-7 und `users_betriebsurlaub_nachbuchen` nur
  gelesen.
- Nichts im Browser; keine bestehende Prüfung des Repositorys gestartet; kein
  Supabase-Stack. Die Oberfläche zu Z-1 (welche Meldung die Buchhaltung sieht) nur aus
  dem Fehlertext der Datenbank geschlossen.
- Aufwandsschätzungen nur bei Z-1 angemerkt.
