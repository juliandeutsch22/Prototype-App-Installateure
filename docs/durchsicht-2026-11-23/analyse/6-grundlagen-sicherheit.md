# Grundlagen und Sicherheit — Arbeitspapier zur Durchsicht vom 23.11.2026

Stand des Codes: `main` fa6e740. Am Repository wurde nichts geändert; die einzige geschriebene
Datei ist dieses Papier.

**Wie geprüft wurde.** Viele Datenbankfunktionen werden in späteren Migrationen über
`pg_get_functiondef … replace … execute` nachgezogen; der Text einer einzelnen Migration ist dann
nicht der Endstand. Ich habe deshalb alle 358 Migrationen der Reihe nach in eine Wegwerf-Datenbank
eingespielt (Postgres 16, das auf dem Rechner schon lag; nur Unix-Socket; nachgebaute Hüllen für
`auth`, `storage`, `cron`, `net`, `vault`; kein Docker, kein Supabase-Stack, nichts installiert) und
den **Endstand** gelesen: 817 Funktionen in `public` und `app` (579 mit Eigentümerrechten),
98 Tabellen in `public`, 170 Regeln in `public` und 13 Speicherregeln. Wo „gemessen“ steht, ist der
Aufruf dort mit nachgestellten Ansprüchen (`request.jwt.claims`) in einer verworfenen Transaktion
gelaufen. Die Datenbank ist wieder entfernt; die Skripte liegen im Arbeitsverzeichnis der
Durchsicht (`…/scratchpad/audit/S/`, nicht im Repository). Nicht nachgestellt sind Anmeldedienst,
Realtime, Speicher-Schnittstelle, Edge-Runtime und FCM — dort steht „Code“. Es lief keine
Testdatei.

---

## 1. Angesehen

**Abläufe von Anfang bis Ende**

1. **Anmeldung und Sitzung:** `LoginPage` → `anmelden` (`src/lib/auth/pg/sitzung.ts`) →
   `AuthContext.verarbeiten` (Plattformmarke, Bedarf am zweiten Faktor, Profil, Firma) →
   Abmelden (dieses Gerät / alle Geräte) → „anderswo beendet“ beim Zurückkommen → Rollenwechsel und
   Deaktivieren (`app.ansprueche_aus_belegschaft`, `app.konto_sperren`, `app.sitzungen_beenden`).
2. **Passwort:** eigenes Passwort ändern (`passwortSetzen`), Passwort vergessen per Mail,
   Bitte aus der Anmeldemaske (`passwort_hilfe_anfragen`), `passwort-vergeben`, `notzugang-passwort`.
3. **Zweiter Faktor:** Pflicht je Betrieb, Wiederherstellungscodes (`zwei_faktor_code_einloesen`),
   Zurücksetzen im Betrieb und über die Plattform.
4. **Supportzugang:** Freigabe „ansehen“/„mitarbeiten“, Notzugang der Plattform
   (`support_notzugang`), Einblick (`app.einblick_aktuell`, `app.supportbetrieb`, `app.support_liest`)
   — und was die Supportansicht seit dem 18.11. tatsächlich lädt.
5. **Plattform:** Betrieb anlegen, deaktivieren, Löschung planen, `betrieb-loeschen`
   (Dateien → Zeilen → Anmeldekonten).
6. **Ohne Netz:** `ausgangsfach.ts`, `supabaseSender.ts`, `ohneEmpfang.ts`, `VerloreneBuchung.tsx`,
   Warnung beim Abmelden (`Layout.tsx`), Fassungswechsel (`sw.ts`, `fassungPruefen.ts`,
   `nachladen.ts`).
7. **Push:** `push.ts` (An- und Abmelden je Gerät), `push-melden` (wer bekommt was),
   `push_vorgaben`, `push-probe`.
8. **Nachrichten:** Speicherregeln der beiden Eimer mit den Vorschaubildern
   (`app.nachrichten_datei_lesbar`/`_schreibbar`), Meldeweg (K1).
9. **Datenauskunft und Löschung:** `person_auskunft`, `person_loeschen` im Endstand gegen jede
   seit dem 15.11. neue Tabelle.
10. **Auslieferung:** `firebase.json`, `.github/workflows/*`, `supabase/config.toml`,
    Geheimnisse im Repository.

**Wichtigste Dateien:** alle 15 Edge Functions (Anmelde- und Rollenprüfung jeder einzelnen),
`supabase/functions/_eigen/*`, `shared/benutzername.ts`, `shared/dienstSchluessel.ts`,
`src/app/AuthContext.tsx`, `src/lib/auth/pg/sitzung.ts`, `src/lib/sync/*`,
`src/lib/db/pg/ohneEmpfang.ts`, `src/lib/push.ts`, `src/lib/speicher.ts`,
die 88 Migrationen seit `20261116…`, `tests/supabase/supportAnsehenListen.test.ts` (Umfang).

**Ohne Befund geprüft (zur Einordnung):** keine Funktion mit Eigentümerrechten ohne leeren
Suchpfad; keine Tabelle in `public` ohne Zeilenschutz; `anon` hat auf keiner Tabelle ein Lese- oder
Schreibrecht; `authenticated` hat nirgends TRUNCATE/TRIGGER/REFERENCES (K11 hält); alle zwölf seit
dem 15.11. neuen Tabellen haben Regeln nach `CLAUDE.md` (`company_id = (select app.lesebetrieb())`,
Support über `app.supportbetrieb()`) oder sind ganz zu; die 46 für Konten ausführbaren Funktionen
ohne sichtbare Betriebsprüfung im eigenen Rumpf prüfen alle über eine Hilfsfunktion
(`app.arbeitszeit_person`, `app.inventur_recht`, `app.verrechnung_betrieb`, …); jede neue Tabelle
mit Personenbezug steht in Auskunft und Löschung (`zeit_monatsabschluesse`, `bank_buchungen`,
`beleg_versand`, `passwort_anfragen`, `zwei_faktor_ruecksetzungen`, `inventuren`,
`inventur_zeilen`, `app.zeitkonto_monatsstand`); `kalender_abruf` liefert nach Deaktivierung,
ruhendem Betrieb oder ausgeschaltetem Abo nichts mehr; alle Edge Functions prüfen Token, zweiten
Faktor und Rolle aus der Tabelle bzw. den Dienstschlüssel; im Repository liegt kein echtes
Geheimnis (die JWTs in Tests und Skripten sind die öffentlichen Schlüssel des lokalen Stapels).

---

## 2. Befunde (belegt)

### S-1 Seit dem 18.11. weisen vier Listenfunktionen und die Forderungs-Function den Supportzugang ab — die Supportansicht zeigt Baustellen, Lager, Anforderungen, Wartungen und offene Forderungen nicht mehr

- Art: Fehler (Rückfall gegenüber K7b und gebrochene Zusage)
- Schwere: mittel — betrifft jeden Supportfall, bei dem der Betrieb „Nur ansehen“ oder
  „Mitarbeiten“ freigibt; der Support sieht auf den meistgebrauchten Seiten eine Fehlermeldung
  statt der Daten und kann genau dort nicht helfen.
- Beleg:
  - `supabase/migrations/20261118033000_baustellen_liste.sql:51` und `:56`,
    `20261118030000_lager_liste.sql:56`/`:60`, `20261118032000_anforderungen_laufend.sql:39`/`:43`,
    `20261118031000_wartungen_faellig_stand.sql:38`/`:41`: jeweils
    `betrieb text := app.betrieb();` und danach
    `if betrieb is null or not app.darf(betrieb) then raise exception 'Kein Zugriff …'`.
    `app.betrieb()` liest `company_id` aus dem Token. Das Plattformkonto hat keinen Betrieb im Token
    (das setzt die Datenbank durch, `app.kein_plattformkonto_im_betrieb`); sein Betrieb kommt aus
    `app.supportbetrieb()`. `app.darf(betrieb)` ließe den Support durch — er wird aber nie gefragt,
    weil `betrieb` schon leer ist. `anforderungen_laufend` ruft in Zeile 14 des Rumpfs sogar
    `app.support_liest(betrieb)`; gemeint war der Support also.
  - `supabase/functions/startseite-forderungen/index.ts:38–47` und `:63–64`: der Betrieb kommt aus
    `app_metadata.company_id` des Tokens; ohne ihn antwortet die Function „Nicht angemeldet.“ (401).
  - Aufrufer ohne Ausweichweg: `src/lib/db/pg/projects.ts:386`, `materials.ts:545`,
    `materialOrders.ts:543`, `wartungen.ts:287`, `src/lib/db/forderungen.ts:13`.
    `src/features/dashboard/start/laden.ts:541` ruft `startseiteForderungen(heute)` ohne `still(…)`;
    scheitert es, fällt der ganze Block „Rechnungen und Scheine“ weg
    (`DashboardView.tsx:184`, `:233`).
  - Zusage: `src/features/settings/SupportzugangView.tsx:207` („Er sieht den Betrieb wie ein
    Administrator …“).
  - Gemessen (Plattformkonto mit `aal2`, Freigabe „ansehen“, Zugriff gemeldet):
    `select count(*) from projects` → 1 Zeile; `baustellen_liste(…)` → „Kein Zugriff auf die
    Baustellen dieses Betriebs“; `lager_liste(…)` → „Kein Zugriff auf das Lager …“;
    `anforderungen_laufend(…)` → „Kein Zugriff auf die Anforderungen …“;
    `wartungen_faellig_stand(…)` → „Kein Zugriff auf die Wartungen …“.
  - Nicht abgesichert: `tests/supabase/supportAnsehenListen.test.ts` prüft die sieben Tabellen aus
    K7b, keine der neuen Funktionen; `startseiteForderungen.test.ts` prüft „nur der eigene Betrieb;
    ohne Anmeldung nichts“, den Einblick nicht.
- Auswirkung: Der Betrieb ruft an, „in der Baustellenliste fehlt eine Baustelle“, und gibt „Nur
  ansehen“ frei. Der Support öffnet die Baustellenliste und sieht „Das hat nicht geklappt — Kein
  Zugriff auf die Baustellen dieses Betriebs“; ebenso Lager, Materialanforderungen „Laufend“ und
  auf der Startseite die fälligen Wartungen, die knappen Artikel und den ganzen Block „Rechnungen
  und Scheine“. Bis zum 17.11. las er diese Seiten über die Tabellen, deren Regeln ihn kennen.
- Vorschlag:
  - Eine Migration, die in den vier Funktionen den Betrieb so bestimmt wie die übrigen Funktionen
    der Supportansicht: `betrieb text := coalesce(app.betrieb(), app.supportbetrieb());` — sonst
    unverändert (`security definer`, `set search_path = ''`, Rechte bleiben bei
    `create or replace`). `app.darf(betrieb)` bleibt die Prüfung. In `anforderungen_laufend` gilt
    für den Support dann schon heute „alle“ (`app.support_liest(betrieb)`).
  - `startseite-forderungen`: der Betrieb kommt aus dem Rumpf (`betrieb`, von der Startseite aus
    `user.companyId` mitgegeben), ersatzweise wie bisher aus dem Token. Gelesen wird weiter mit dem
    Token der Person — der Zeilenschutz entscheidet, nicht die Angabe; ein fremder Betrieb liefert
    eine leere Liste. `src/lib/db/forderungen.ts` reicht den Betrieb durch.
  - `baustellen_budget_lage` bleibt für den Support zu (benannte Grenze „Der Support sieht keinen
    Budgetstand“); `AdminProjectsView.tsx:576` darf im Einblick dann nicht als Fehler erscheinen —
    vor dem Bau nachsehen, ob der Aufruf dort schon still scheitert.
  - Prüfung: `supportAnsehenListen.test.ts` um die vier Funktionen und
    `startseiteForderungen.test.ts` um den Einblick erweitern (je: gleiche Zahlen wie der
    Administrator des Betriebs). Gegenprobe: ohne die Migration bzw. mit der heutigen Function rot.
    Dazu der Wächter aus S-10.
  - Was gleich bleiben muss: Ergebnisse für jedes Konto des Betriebs (die bestehenden Prüfungen
    `baustellenListe`, `lagerListe`, `anforderungenLaufend`, `wartungenFaelligStand` — 34 Fälle —
    bleiben unverändert grün); ohne Einblick sieht die Plattform weiter nichts; der Monteur sieht in
    `anforderungen_laufend` weiter nur seine.
  - Risiko des Umbaus: ein Plattformkonto mit Einblick UND Betrieb im Token gibt es nicht; wäre es
    je so, gewinnt wie bisher der Betrieb des Tokens. Sonst keines.
- Aufwand: klein

### S-2 „Passwort ändern“ und „Passwort vergessen“ melden die anderen Geräte ab, lassen aber ihre Push-Anmeldungen stehen

- Art: Lücke (vierter und fünfter Weg neben den drei, die K2 geschlossen hat)
- Schwere: mittel — selten, aber genau der Fall „Telefon weg, ich ändere mein Passwort“: das
  abgemeldete Gerät zeigt weiter Meldungen am Sperrbildschirm (Nachrichtenvorschau, Einsatz mit
  Kundennamen, Abwesenheiten).
- Beleg: `src/lib/auth/pg/sitzung.ts:197–244` (`passwortSetzen` ruft nur `auth.updateUser`);
  `src/features/auth/PasswortAendern.tsx:101` („Andere Geräte, auf denen du angemeldet bist, werden
  dabei abgemeldet“); Stand §105 hält fest, dass der Anmeldedienst beim eigenen Wechsel die anderen
  Sitzungen beendet. Im Endstand rufen `app.push_anmeldungen_entfernen` nur `app.konto_sperren`,
  `app.sitzungen_beenden`, `push_geraete_abmelden`, `push_geraete_vergessen`
  (`20261116070000_push_anmeldungen_abraeumen.sql:92`, `:101`, `:124`) — der eigene Passwortwechsel
  berührt keine davon. Das abgemeldete Gerät kann seine Marke nicht mehr selbst abmelden
  (`sitzungAnderswoBeendet`, `sitzung.ts:136–151`, meldet nur örtlich ab).
- Auswirkung: Monteur verliert das Telefon, meldet sich am Tablet an und ändert sein Passwort. Die
  Sitzung am Telefon ist beendet, seine Marke steht weiter in `user_prefs.push_tokens`; jede neue
  Nachricht an ihn erscheint weiter auf dem verlorenen Gerät, bis jemand „Auf allen Geräten
  abmelden“ findet oder das Büro das Konto deaktiviert.
- Vorschlag:
  - Neue Funktion `public.push_andere_geraete_abmelden(p_behalten text)` (`security definer`,
    `set search_path = ''`, `revoke … from public, anon`, `grant execute … to authenticated`):
    prüft `auth.uid()` und `app.sitzung_lebt()` wie `push_geraete_abmelden` und entfernt alle Marken
    des eigenen Kontos außer der übergebenen (die des Geräts, auf dem geändert wird; `null` =
    alle). Schreibt über denselben Weg wie `app.push_anmeldungen_entfernen` (Support-Riegel
    beachten, siehe `welle2_nachzug`).
  - `passwortSetzen` ruft sie nach erfolgreichem `updateUser` mit der gemerkten Marke dieses Geräts
    (`gemerktesZeichen` in `src/lib/push.ts`); beim Rücksetzlink ebenso. Scheitert der Aufruf, bleibt
    das Passwort geändert und die Maske sagt es („Meldungen auf anderen Geräten ließen sich nicht
    abmelden — bitte ‚Auf allen Geräten abmelden‘ verwenden“).
  - Prüfung: Datenbank (zwei Marken, Aufruf mit einer → eine bleibt; fremdes Konto unberührt;
    ohne Anmeldung abgewiesen), Komponente `PasswortAendern` (ruft nach dem Wechsel). Gegenprobe:
    ohne den Aufruf bleiben beide Marken.
  - Was gleich bleiben muss: dieses Gerät bekommt weiter Meldungen (`getPushState` bleibt
    „bereit“); „Auf allen Geräten abmelden“, Deaktivieren, Startpasswort unverändert
    (`pushAnmeldungenAbraeumen.test.ts`, `abmeldenGeraete`).
  - Risiko: gibt das Gerät keine oder eine veraltete Marke mit, würde es sich selbst abmelden —
    deshalb danach `pushAbgleichen` aufrufen, das die Marke dieses Geräts wieder einträgt.
- Aufwand: klein

### S-3 Bleiben beim Löschen eines Betriebs Anmeldekonten übrig, lässt sich die Löschung nicht mehr abschließen

- Art: Fehler (Zustand ohne Ausweg; im Vorgängerpapier als Verdacht V4, nicht im Plan)
- Schwere: mittel — selten (der Anmeldedienst muss bei einem Konto scheitern oder die Function
  mitten in der Schleife enden), dann aber bleiben E-Mail-Adressen und Benutzernamen eines
  „gelöschten“ Betriebs dauerhaft belegt und gespeichert.
- Beleg: `supabase/functions/betrieb-loeschen/index.ts:137–151` (die Konten werden nach den Zeilen
  einzeln gelöscht; Fehlschläge nur in `kontenOffen` der Antwort);
  `app.loeschung_pruefen` (`20261002100000_betriebe_deaktivieren_loeschen.sql:749`, Endstand
  gelesen) wirft „Den Betrieb … gibt es nicht“, sobald `companies` die Zeile nicht mehr hat — ein
  zweiter Aufruf kommt also nie mehr bis zu den Konten;
  `src/features/plattform/BetriebVerwalten.tsx:327–328` zeigt nur die Zahl („… ließen sich nicht
  entfernen — sie sind gesperrt und ohne Betrieb“), die Kennungen stehen nirgends
  (`betrieb_protokoll.angaben` hält nur die Anzahl). Endet die Function vor der Antwort
  (Zeitgrenze bei vielen Konten), gibt es nicht einmal die Zahl.
- Auswirkung: Betrieb mit 60 Konten wird nach Fristablauf gelöscht; der Anmeldedienst antwortet bei
  acht Konten mit 5xx. Der Betrieb ist weg, acht Adressen liegen weiter im Anmeldedienst. Legt ein
  anderer Betrieb später denselben Menschen an, heißt es „Mit … lässt sich kein Konto anlegen“.
  Die Zusage „Betrieb gelöscht“ stimmt für diese Personen nicht.
- Vorschlag:
  - `betrieb_loeschen_ausfuehren` hält die Kennungen der Konten in `betrieb_zustand` fest (neue
    Spalte `konten_offen uuid[]`, nur Kennungen, kein Name); neue Funktion
    `betrieb_konto_entfernt(p_admin, p_kennung, p_uid)` (nur `service_role`) streicht eine
    Kennung; `betrieb_loeschen_pruefen` gibt für einen schon gelöschten Betrieb mit offenen Konten
    nur diese Liste zurück statt P0002. Alle drei `security definer`, `set search_path = ''`,
    `revoke … from public, anon, authenticated`, `grant … to service_role`.
  - Die Function überspringt bei einem schon gelöschten Betrieb Dateien und Zeilen und setzt bei den
    Konten fort; nach jedem gelöschten Konto `betrieb_konto_entfernt`.
  - Plattform: in „Gelöschte Betriebe“ die Zeile „n Anmeldekonten offen — Entfernen fortsetzen“.
  - Prüfung: Edge-Prüfung mit einem Konto, dessen Löschung beim ersten Lauf scheitert (Konto vorab
    im Anmeldedienst sperren ist kein Fehlschlag — stattdessen die Liste von Hand um eine
    unbekannte Kennung ergänzen und prüfen, dass 404 als erledigt zählt, sowie einen zweiten Aufruf
    nach abgebrochenem ersten). Gegenprobe: heute antwortet der zweite Aufruf 404 „gibt es nicht“.
  - Was gleich bleiben muss: Reihenfolge Dateien → Zeilen → Konten; die Bestätigung durch Eintippen
    der Kennung; `betriebeDeaktivierenLoeschen.test.ts` unverändert grün.
  - Risiko: `betrieb_zustand` bekommt eine Spalte mit Kennungen gelöschter Personen — nur bis sie
    entfernt sind; danach leer.
- Aufwand: mittel

### S-4 Öffnet die Plattform einen Notzugang oder beginnt der Support einen Einblick, erfährt der Betrieb davon nur, wenn jemand die Einstellungsseite öffnet

- Art: Lücke
- Schwere: mittel — der Notzugang ist der einzige Weg, auf dem jemand ohne Zutun des Betriebs bis
  zu 24 Stunden dessen Daten liest. Protokolliert ist er; mitgeteilt wird er nicht.
- Beleg: `public.support_notzugang` (Endstand; `20261027600000_rpc_ohne_anmeldung_sperren.sql:20`)
  legt die Freigabe an und sonst nichts; auf `support_freigaben` liegen nur die drei Auslöser
  `support_freigaben_frist`, `_betrieb_fest`, `_fest` — keiner meldet; keine `push_…`-Funktion
  kennt den Support; die Startseite hat keinen Eintrag dazu (`src/features/dashboard/start/*` nennt
  den Notzugang nur im Hinweis „einziges Leitungskonto“, `regeln.ts:924`); sichtbar ist er allein
  unter Einstellungen → Supportzugang (`SupportzugangView.tsx:162`, `:297`).
- Auswirkung: Ein Betrieb, der den Support nie gerufen hat, sieht nicht, dass seit gestern ein
  Notzugang mit Grund „Anruf Hr. Maier“ offen war. Fällt es Wochen später im Protokoll auf, ist die
  Frage „warum hat mir das niemand gesagt“ berechtigt — bei einem Auftragsverarbeiter erst recht.
- Vorschlag:
  - Startseite der Spitze: Zeile „Senklot-Support hat einen Notzugang geöffnet (Grund, bis …)“ bzw.
    „Support sieht seit … mit“ mit Sprung zur Supportseite, solange eine Freigabe offen ist; nach
    dem Ende „Notzugang vom … bis … — n Zugriffe“ bis zur Kenntnisnahme (ein Zeitpunkt am Betrieb,
    wie `verarbeiter_kenntnis_am`; keine neue Angabe je Person).
  - Push an Geschäftsführung und Administration beim Anlegen eines Notzugangs (neue Quelle in
    `push-melden`, Empfänger über `push_empfaenger_abwesenheit`-artige Funktion nur für die Spitze,
    Art `notifyNotfall` oder eine eigene Vorgabe; Text ohne Inhalt: „Der Senklot-Support hat einen
    Notzugang geöffnet. Grund: …“).
  - Prüfung: Datenbank (Notzugang → Ereignis an `push-melden` mit den Kennungen der Spitze, nicht an
    Monteure), Startseite (Zeile erscheint, verschwindet nach Kenntnisnahme). Gegenprobe: ohne den
    Auslöser geht kein Ereignis hinaus.
  - Was gleich bleiben muss: Der Notzugang selbst (Grund, 1–24 h, nur lesend), Widerruf durch den
    Betrieb, `supportzugang.test.ts`, `supportArbeitetMit.test.ts`.
  - Risiko: Meldung an einen Betrieb, dessen Leitung gerade ausgesperrt ist (der Fall, für den der
    Notzugang da ist) — sie geht dann ins Leere, schadet aber nicht.
- Aufwand: mittel

### S-5 Eine ohne Netz vorgemerkte Materialanforderung, Nachricht oder ein Schein, den der Server später ablehnt, ist weg — bei der Anforderung ohne Grund

- Art: Lücke (Z4 hat nur die Zeitbuchung gerettet)
- Schwere: mittel für Anforderungen (der Monteur glaubt, bestellt zu haben), niedrig für
  Nachrichten.
- Beleg: `src/lib/db/pg/ohneEmpfang.ts:74–78` — die Sicherung gibt für alles außer `time_entries`
  `false` zurück; `src/components/VerloreneBuchung.tsx:62–70` — der letzte Zweig (alle übrigen
  Tabellen, heute `material_orders`) nennt weder den Grund des Servers noch den Inhalt: „Eine
  vorgemerkte Buchung konnte nicht gesendet werden. Bitte in der Übersicht nachsehen …“. Vorgemerkt
  wird die Anforderung über `anlegenOhneEmpfang` (`src/lib/db/pg/materialOrders.ts:15`).
  Abgelehnt wird sie etwa durch `app.anforderung_menge_pruefen` (23514), einen inzwischen
  gelöschten Artikel oder Großhändler (23503, `app.anforderung_lieferant_im_betrieb`),
  `app.anforderung_ruestliste_pruefen` oder den Zeilenschutz (42501) — alles „endgültig“ in
  `supabaseSender.ts:28–50`.
- Auswirkung: Monteur fordert im Keller fünf Positionen an („ohne Verbindung gespeichert, wird
  automatisch gesendet“). Das Büro hat den Artikel am Vormittag zusammengelegt und den alten
  gelöscht. Am Abend erscheint eine Meldung „Eine vorgemerkte Buchung konnte nicht gesendet
  werden“ — welche Baustelle, welcher Artikel, warum, steht nirgends; in der Übersicht fehlt die
  Position einfach.
- Vorschlag:
  - `VerloreneBuchung`: für `material_orders` Artikelname, Menge, Baustelle aus `vorgaenge[0].daten`
    und den Grund des Servers nennen; „Erneut anfordern“ öffnet die Anforderung mit diesen Angaben
    vorbelegt (der Warenkorb hat dafür schon seinen Speicher `senklot.warenkorb:`).
  - Nachricht: der abgelehnte Text bleibt als Entwurf im Eingabefeld dieses Gesprächs (der Entwurf
    je Gespräch wird schon gemerkt), die Meldung springt hin.
  - Schein bleibt, wie er ist (benannte Grenze E49: der Server-Stand gilt, die Meldung nennt den
    Grund schon).
  - Prüfung: `VerloreneBuchung.test.tsx` je Tabelle (Text enthält Artikel und Grund; Knopf belegt
    den Warenkorb vor). Gegenprobe: mit dem heutigen Zweig fehlen beide.
  - Was gleich bleiben muss: Zeitbuchungen (Z4), Reihenfolge und Wiederholen im Fach
    (`ausgangsfach*.test.ts`), keine Vormerkung geht mit fremder Sitzung hinaus.
  - Risiko: gering; die Meldung liest nur, was das Fach ohnehin übergibt.
- Aufwand: klein

### S-6 Wird eine Sitzung von anderswo beendet (Rollenwechsel, Deaktivieren, „Auf allen Geräten abmelden“), merkt es ein offenes Fenster erst beim nächsten Zurückkommen — und nennt beim Rollenwechsel den falschen Grund

- Art: Fehler (leere App ohne Erklärung; dieselbe Art wie K6, dort nur für die Zwei-Faktor-Rollen
  behoben)
- Schwere: niedrig bis mittel — trifft vor allem das Büro, wo die App den ganzen Tag im sichtbaren
  Fenster steht.
- Beleg: `src/app/AuthContext.tsx:535–557` fragt `sitzungAnderswoBeendet` nur bei
  `visibilitychange` und `focus`; der Minutentakt in `:572–601` läuft nur für Rollen der
  Zwei-Faktor-Pflicht und fragt nur den Faktor. Jede Rollenänderung beendet die Sitzungen sofort
  (`app.ansprueche_aus_belegschaft`, Endstand: `if … new.role is distinct from old.role then perform
  app.sitzungen_beenden(new.id)`); ab da liefert jede Abfrage nichts (`app.aktiv` →
  `app.sitzung_lebt`), Speichern wird mit 42501 abgewiesen. Die Meldung lautet dann immer „Diese
  Anmeldung wurde auf einem anderen Gerät beendet“ (`AuthContext.tsx:546`).
- Auswirkung: Die Chefin stellt die Kollegin von „Verwaltung“ auf „Buchhaltung“ um, während diese
  eine Lieferung einbucht. Deren Listen sind ab sofort leer, „Speichern“ meldet ein fehlendes
  Recht. Erst wenn sie das Fenster wechselt und zurückkommt, steht die Anmeldemaske da — mit einem
  Grund, der nicht stimmt.
- Vorschlag:
  - Der Minutentakt aus K6 gilt für jedes angemeldete Konto und fragt beides (Faktor und „Sitzung
    lebt“); zusätzlich einmal sofort, wenn ein Aufruf mit 42501 oder 401 scheitert (ein Zähler in
    `derClient`/`fehlerGrund.ts`, höchstens einmal je 30 s).
  - Text nach Grund: `mein_zustand` gibt es schon — „deaktiviert“ → „Dieses Konto ist deaktiviert“,
    sonst „Die Anmeldung wurde beendet (anderes Gerät oder geänderte Rolle). Bitte neu anmelden.“
  - Im Benutzerformular beim Ändern der Rolle der Satz „… wird auf allen Geräten abgemeldet und
    meldet sich neu an“ (falls er fehlt — nicht nachgesehen).
  - Prüfung: `AuthAnderswoAbgemeldet.test.tsx` erweitern (Sitzung endet bei sichtbarem Fenster →
    spätestens nach einer Minute Anmeldemaske; nach abgewiesenem Aufruf sofort). Gegenprobe: heute
    bleibt die Ansicht stehen.
  - Was gleich bleiben muss: ohne Netz bleibt man angemeldet (kein Abmelden auf Verdacht —
    `sitzungAnderswoBeendet` unterscheidet das schon); K6 unverändert.
  - Risiko: eine Abfrage je Minute und Gerät an den Anmeldedienst mehr; bei dessen Drosselung
    (429) darf nichts abgemeldet werden — ist heute schon so.
- Aufwand: klein

### S-7 Die Speicherregeln der Scheinfotos binden nicht an den Ersteller des Scheins — die Tabelle tut es

- Art: Unstimmigkeit (Rolle kann über die Schnittstelle mehr als über die Oberfläche)
- Schwere: niedrig — nur innerhalb des eigenen Betriebs und nur an Entwürfen; braucht Absicht.
- Beleg: Endstand der Regeln: `scheinfotos_anlegen` prüft nur
  `app.betriebsmitglied(app.foto_betrieb(name))` (`20260913160000_scheinfotos.sql:76`),
  `scheinfotos_ersetzen`/`_loeschen` zusätzlich nur `app.foto_schein_offen(name)`
  (`20260926110500_scheinfotos_nach_unterschrift.sql:52`, `:59`). Die Tabelle
  `work_sheet_photos` verlangt `app.schein_bearbeitbar(work_sheet_id)` (Ersteller oder Führung).
- Auswirkung: Jedes Konto des Betriebs — auch Buchhaltung oder ein anderer Monteur — kann über die
  Speicher-Schnittstelle die Fotodateien eines fremden Entwurfs überschreiben oder löschen und in
  den Ordner jedes Scheins Dateien legen. Der Schein verzeichnet dann ein Foto, dessen Datei fehlt
  oder eine andere ist.
- Vorschlag: Die drei Regeln um „der Schein gehört mir oder ich bin Führung, **oder es gibt ihn
  noch nicht**“ ergänzen (Schein-Kennung ist das dritte Pfadglied; eine Hilfsfunktion
  `app.foto_schein_schreibbar(name)`, `security definer`, leerer Suchpfad). Die Ausnahme „gibt es
  noch nicht“ ist nötig, weil ein neuer Schein ohne Netz seine Fotos vormerkt, bevor die Zeile
  sicher angekommen ist — vor dem Bau die Reihenfolge im Fach nachstellen.
  Prüfung: `mandantenTrennung`-artige Probe „Kollege überschreibt Foto im fremden Entwurf“ → 403;
  Gegenprobe heute 200. Gleich bleiben: eigener Entwurf mit und ohne Netz
  (`scheinOhneNetz`-Prüfungen, Browserweg), Führung bearbeitet fremde Entwürfe, Lesen unverändert.
  Risiko: genau der Offline-Weg — deshalb die Ausnahme und die Nachstellung.
- Aufwand: klein

### S-8 Ein Mensch kann nur in einem Betrieb ein Konto haben, und ein Benutzername ist über alle Betriebe vergeben — beides steht nicht in der Grenzen-Übersicht, und die Maske bietet keinen Ausweg an

- Art: Grenze (unbenannt in `docs/grenzen-durchsicht-2026-10-24.md`; der Benutzername steht im
  Handbuch, `handbuch.html:5385`, die E-Mail nirgends)
- Schwere: niedrig heute, wächst mit jedem weiteren Betrieb — Monteure wechseln zwischen Betrieben
  derselben Gegend; häufige Namen („thomas“, „lager“, „buero“) sind bald vergeben.
- Beleg: `shared/benutzername.ts:21–25` (Kunstadresse ohne Betriebsanteil, bewusst);
  `supabase/functions/mitarbeiter-anlegen/index.ts:189–200` („Mit … lässt sich kein Konto anlegen —
  bitte eine andere Adresse verwenden“ bzw. „Den Benutzernamen … kann Senklot nicht vergeben“).
  Das Konto im alten Betrieb bleibt nach dem Austritt bestehen (deaktiviert; Name und Anmeldename
  bleiben, solange Einträge aufbewahrt werden — `person_loeschen`, Hinweis im Ergebnis).
- Auswirkung: Monteur wechselt von Betrieb A zu Betrieb B. B legt ihn mit seiner Adresse an: „…
  bitte eine andere Adresse verwenden“. Warum, sagt die Maske bewusst nicht; dass ein Benutzername
  der Ausweg ist, auch nicht.
- Vorschlag (die Grenze selbst hat einen gültigen Grund: der Anmeldedienst führt eine Adresse
  einmal, und ein Konto mit zwei Betrieben im Token widerspräche der Mandantentrennung):
  - Grenze mit Grund in die Übersicht aufnehmen.
  - Im Fehlerfall bietet das Formular den nächsten Schritt an: bei einer Adresse „Stattdessen mit
    Benutzername anlegen“ (füllt den Vorschlag aus Vor- und Nachname), beim Benutzernamen einen
    freien Vorschlag (`name2`, `name.b`), den die Function prüft. Die Meldung verrät weiter nicht,
    wo der Name vergeben ist.
  - Prüfung: `mitarbeiterAnlegen`-Edge-Prüfung (409 trägt `vorschlag`), Komponente (Knopf belegt
    vor). Gegenprobe: heute bleibt das Formular mit der Meldung stehen.
  - Was gleich bleiben muss: keine Auskunft über fremde Betriebe (Testbericht G12); Regeln für
    Benutzernamen in Browser und Function gleich.
  - Risiko: ein Vorschlag, der zwischen Prüfung und Anlegen vergeben wird — dann dieselbe Meldung
    noch einmal, kein Schaden.
- Aufwand: klein

### S-9 Die Auslieferung hält Zugangsdaten mit vollem Zugriff auf das Projekt in GitHub-Secrets und führt im selben Auftrag fremde Installationsskripte aus

- Art: Grenze / fehlende Härtung (widerspricht dem Sinn von `CLAUDE.md`, „Sicherheit und Daten“,
  erster Punkt)
- Schwere: niedrig bis mittel — kein Loch im Betrieb, aber die größte einzelne Angriffsfläche: wer
  diese Secrets liest, hat mehr als den Dienstschlüssel.
- Beleg: `.github/workflows/supabase-migrationen.yml:122`, `:132–133`, `:138–139`, `:158`
  (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` — mit dem Datenbankpasswort ist man `postgres`,
  mit dem Zugangstoken liest man über die Verwaltungsschnittstelle auch den Dienstschlüssel);
  im selben Auftrag `einspielen` läuft `:151` `npm ci` (mit Installationsskripten aller
  Abhängigkeiten) und `:153` `npm run gemeinsames`, **danach** `:158` der Schritt mit dem Token;
  `supabase/setup-cli@v1` (`:82`, `:116`) und `actions/*@v4` sind über verschiebbare Marken
  eingebunden. `CLAUDE.md:82` und `docs/DEPLOYMENT.md:84` sagen „nicht in GitHub-Secrets“ für den
  Dienstschlüssel; `docs/DEPLOYMENT.md:96–98` führt die beiden stärkeren Zugangsdaten dort als nötig.
- Auswirkung: Eine kompromittierte Abhängigkeit (Installationsskript) kann im Auftrag `einspielen`
  die Programmdatei `supabase` oder die Functions vor dem Ausliefern verändern und läuft dann mit
  dem Token; eine verschobene Marke einer fremden Action ebenso.
- Vorschlag (ohne Ablaufänderung für den Menschen):
  - `npm ci --ignore-scripts` im Auftrag `einspielen` (gebraucht wird dort nur
    `edge-shared-uebernehmen.mjs`, das keine gebauten Pakete braucht — vor dem Umbau nachsehen);
    besser: `_shared` im Auftrag `pruefen` erzeugen und als Artefakt übergeben, sodass im Auftrag mit
    Secrets gar kein `npm ci` läuft.
  - Fremde Actions auf Commit-Kennung festlegen (`uses: supabase/setup-cli@<sha> # v1`).
  - Die Secrets an eine GitHub-Umgebung „produktion“ binden (nur `main`, optional Freigabe).
  - `CLAUDE.md`/`DEPLOYMENT.md` nennen die Grenze ehrlich: „Zugangstoken und Datenbankpasswort
    liegen für die Auslieferung in GitHub; Grund: liegt beim Betreiber (CI). Gesichert durch …“.
  - Prüfung: ein Wächter in `tests/unit` liest die Workflow-Dateien (jedes `uses:` fremder Herkunft
    mit 40-stelliger Kennung; kein `npm ci` ohne `--ignore-scripts` in einem Auftrag, der
    `secrets.SUPABASE_` nennt). Gegenprobe: heutige Dateien rot.
  - Was gleich bleiben muss: Reihenfolge prüfen → einspielen → Functions → App; kein Pfadfilter auf
    `main` (begründet im Kopf der Datei).
  - Risiko: `--ignore-scripts` kann ein Paket ohne seinen Bauschritt lassen (etwa `esbuild`) —
    deshalb nur im Auftrag, der nichts baut.
- Aufwand: klein

### S-10 Kein Prüfnetz hält fest, dass die lesenden Funktionen der Supportansicht im Einblick laufen

- Art: fehlende Prüfung (Ursache dafür, dass S-1 vier Tage unbemerkt blieb)
- Schwere: mittel — jede weitere Liste, die „aus der Datenbank“ kommt, kann denselben Rückfall
  bringen.
- Beleg: `tests/supabase/supportAnsehenListen.test.ts` (111 Zeilen, ein einziger `rpc`-Aufruf);
  `mandantenTrennung.test.ts` prüft für den Support, dass er **nichts Fremdes** sieht, nicht, dass er
  das Freigegebene sieht. Im Endstand bestimmen 58 für Konten ausführbare Funktionen mit
  Eigentümerrechten den Betrieb allein über `app.betrieb()` (Liste im Arbeitsverzeichnis); die
  meisten zu Recht (Zeiten, Urlaub, Nachrichten sind dem Support verschlossen), vier zu Unrecht.
- Vorschlag: Ein Wächter in `tests/supabase`: jede Funktion aus `LESENDE_FUNKTIONEN`
  (`src/lib/netzFrist.ts`) steht in genau einer von zwei Listen — „läuft im Einblick“ (wird mit
  einer Freigabe „ansehen“ aufgerufen und darf nicht 42501 antworten) oder „dem Support
  verschlossen“ mit Grund (Zusage aus `SupportzugangView`). Eine neue lesende Funktion ohne Eintrag
  macht den Wächter rot — wie `OHNE_EIGENE_PRUEFUNG` es für die Aufruferprüfung tut. Gegenprobe:
  die vier Funktionen aus S-1 in der ersten Liste → heute rot.
  Gleich bleiben: was dem Support verschlossen ist, bleibt es (die zweite Liste hält es fest).
  Risiko: keines für den Betrieb; die Listen müssen bei neuen Funktionen gepflegt werden.
- Aufwand: klein

### S-11 Die Inhaltsregel erlaubt Verbindungen zu jedem Supabase-Projekt, die Sicherheitsprüfung behauptet „nur zur eigenen Instanz“

- Art: Unstimmigkeit
- Schwere: niedrig — wirkt nur als zweite Verteidigungslinie; ohne eingeschleusten Code ohne Folge.
- Beleg: `firebase.json:41` (`connect-src … https://*.supabase.co wss://*.supabase.co`,
  `img-src … https://*.supabase.co`); `docs/sicherheitspruefung-2026-10-27.md:64` („Verbindungen nur
  zur eigenen Supabase-Instanz“).
- Auswirkung: Gelänge je eine Einschleusung, könnte sie Daten an ein beliebiges fremdes
  Supabase-Projekt senden — genau das soll `connect-src` verhindern.
- Vorschlag: Die Kopfzeile wird beim Bau mit dem Host aus `VITE_SUPABASE_URL` erzeugt (ein kleines
  Skript vor `firebase deploy`, das `firebase.json` aus einer Vorlage schreibt; die Vorlage bleibt
  mit Platzhalter eingecheckt). `sicherheitsKopfzeilen.test.ts` prüft, dass kein `*.supabase.co`
  mehr vorkommt (Gegenprobe: heutige Datei rot); der CSP-Rundgang (`tests/csp/rundgang.spec.ts`)
  muss unverändert durchlaufen. Risiko: örtlicher Stapel und Vorschau nutzen andere Hosts — die
  Vorlage braucht dafür den Wert aus der Umgebung, sonst bleibt die App dort ohne Verbindung.
- Aufwand: klein

---

## 3. Verdacht (nicht zu Ende geprüft)

- **V-1 `betrieb-loeschen` bei vielen Konten.** Die Konten werden nacheinander gelöscht
  (`index.ts:139–143`); ob die Zeitgrenze der Edge-Runtime bei einigen hundert Konten vor der
  Antwort greift, habe ich nicht gemessen. Es wäre der häufigere Auslöser von S-3.
- **V-2 Scheinfoto nachträglich untergeschoben.** Ein unterschriebener Schein, dessen Foto nie
  ankam („Der Schein verzeichnet es, die Datei fehlt“), hat einen freien Dateinamen; nach S-7 kann
  jedes Konto des Betriebs dort eine Datei anlegen. Ob die Anzeige den Inhalts-Hash prüft, habe ich
  nicht gelesen.
- **V-3 `uid-pruefen` ohne Begrenzung.** Die Function fragt VIES je Aufruf; eine Obergrenze je
  Betrieb und Stunde habe ich in `uid_pruefung_vorbereiten` nicht gesucht. Folge wäre höchstens
  eine Sperre der Senklot-Adresse bei VIES.
- **V-4 Realtime, Löschereignisse** (aus dem Vorgängerpapier, weiter offen): bei
  `REPLICA IDENTITY FULL` liefert Supabase für gelöschte Zeilen den Primärschlüssel auch an
  Abonnenten anderer Betriebe, wenn ohne Filter abonniert wird. Nicht gegen einen Realtime-Server
  geprüft.
- **V-5 Erster Administrator mit E-Mail** (aus dem Vorgängerpapier): der Rücksetzlink aus
  `betrieb-anlegen` gilt einmal; wird er von einem Mail-Scanner geöffnet, bleibt „Passwort
  vergessen“. Verhalten des gehosteten Projekts nicht geprüft.
- **V-6 Ältere Funktionen im Einblick.** `kollegen()` und `lager_knapp()` liefern dem Support
  gemessen null Zeilen (Betrieb aus dem Token). `kollegen()` wird nur gerufen, wenn `users` höchstens
  eine Zeile liefert (`src/lib/db/pg/users.ts:97`), trifft den Support also nicht; ob `lager_knapp`
  nach dem Umbau vom 18.11. noch von einer Seite der Supportansicht gerufen wird
  (`src/lib/db/pg/materials.ts:484`), habe ich nicht verfolgt.
- **V-7 Schlüssel des Altsystems in der Doku.** `docs/LEGACY-ANALYSIS.md:327` nennt einen
  Firebase-Web-Schlüssel des Vorgängers. Solche Schlüssel sind öffentlich gedacht; ob das alte
  Projekt mit seinen Regeln noch erreichbar ist, lässt sich aus dem Repository nicht sagen.
- **V-8 Bitte „neues Passwort“ als Vorwand.** `passwort_hilfe_anfragen` ist ohne Anmeldung
  aufrufbar; wer einen Benutzernamen kennt, erzeugt auf der Startseite der Leitung „… bittet um ein
  neues Passwort“ und ruft dann im Büro an. Ob die Akte beim Vergeben auf „persönlich übergeben“
  hinweist, habe ich nicht nachgesehen.

---

## 4. Benannte Grenzen, neu bewertet

| Grenze (Fundstelle im Grenzen-Dokument) | Grund | Grund gültig nach Grundsatz 6? | Empfehlung |
|---|---|---|---|
| Der Support sieht keinen Budgetstand und keine Buchungen (B, Stand 14.1) | Datenschutz: Zeitbuchungen gehören nicht zum Support | ja | bleibt; S-1 berührt sie nicht (`baustellen_budget_lage` bleibt zu) |
| Plattformkonto: Wiederherstellung bei Verlust von Telefon und Codes nur durch den Betreiber (B, Stand 12.1) | Sicherheit | ja | bleibt |
| Zweiter Faktor: Pflicht erst, wenn der Betrieb sie einschaltet (B, Stand 12.1) | Einstellung je Betrieb | ja | bleibt; Idee I-4 |
| Schutz gegen geleakte Passwörter, Ratenbegrenzung, Sitzungsdauer im gehosteten Projekt (X) | Zugang zum gehosteten Projekt | ja (liegt beim Betreiber) — aber `supabase/config.toml:286–288` lässt `timebox`/`inactivity_timeout` auch örtlich auskommentiert, es gibt also keinen Stand, gegen den geprüft wird | Werte aus `DEPLOYMENT.md` in `config.toml` setzen und in einer Prüfung festhalten; eine Zeile „eingestellt am … von …“ im Betriebshandbuch, sonst bleibt „liegt beim Betreiber“ für immer offen |
| Stillstandsfrist: Schreibvorgänge haben keine Frist (B, Stand 29) | Sicherheit der Daten: ein abgebrochener Schreibvorgang ist womöglich schon geschehen | ja | bleibt |
| Stillstandsfrist: zweimal stehende Erneuerung kann abmelden (B, Stand 29) | liegt beim Anmeldedienst | ja | bleibt |
| Handwerksschein ohne jedes Netz neu beginnen (B, E49) | Datenschutz: Vorrat aller Kunden läge unverschlüsselt auf geteilten Tablets | ja — beachten: Vorgemerktes (Fotos, Nachrichtentext) und Zeit-Entwürfe bleiben nach dem Abmelden bewusst auf dem Gerät (`speicher.ts:33`, `ohneEmpfang.ts`), das ist dieselbe Abwägung in klein | bleibt; im Handbuch beim geteilten Tablet einen Satz dazu |
| Im privaten Fenster kein Vormerken (B, E49) | Gerät | ja | bleibt |
| Änderungen mit dem Dienstschlüssel stehen nicht im Änderungsprotokoll (B, E50) | fachlich / Sicherheit: der Schlüssel liegt nur bei den Edge Functions | ja — der Satz „liegt nur bei den Edge Functions“ stimmt nur, solange S-9 nicht eintritt | bleibt; S-9 |
| Nachrichten: keine Ende-zu-Ende-Verschlüsselung (B, E64) | Technik/Sicherheit | ja | bleibt |
| Nachrichten: ein Rücklauf aus der Sicherung bringt keine privaten Gespräche zurück (B, E64) | Datenschutz | ja | bleibt |
| Nachrichten: ein neues Gespräch braucht Netz (B, E64) | Technik: Kennung vergibt der Server | ja | bleibt |
| Push: „Google hat angenommen“ heißt nicht „erschienen“ (E69) | liegt beim Gerät | ja | bleibt |
| Push, geteiltes Gerät: wer sich anmeldet, bekommt die Meldungen dieses Geräts (E69) | Erlaubnis gilt für das Gerät | ja | bleibt |
| Ausleitung höchstens 6 Betriebe gleichzeitig (Paket 8, K3) | Sicherheit/Betrieb der Datenbank | ja; skaliert über `app.ausleitung_gleichzeitig()` | bleibt |
| Bis zu einer Minute bis zur Zwei-Faktor-Einrichtung (Paket 8, K6) | fachlich: kein Dauer-Abo je Gerät | ja | bleibt; S-6 nutzt denselben Takt |
| Alte App nutzt bis zum Neuladen den alten Auszug und meldet ohne Push-Abmeldung ab (Paket 8) | liegt beim Gerät | ja, läuft von selbst aus | kann nach der nächsten Auslieferung entfallen |
| Umstellungszeile am fremden Konto bleibt ohne Kennung (Paket 8, K9) | fachlich | ja | bleibt |
| Annahme per Link: Rate-Limit je Link, nicht je Abrufer (B, E56) | Sicherheit: Adresse des Abrufers nicht verlässlich | ja | bleibt |
| **Unbenannt:** eine E-Mail-Adresse und ein Benutzername gelten über alle Betriebe (Code: `shared/benutzername.ts:21`) | Anmeldedienst führt eine Adresse einmal; ein Konto, ein Betrieb | ja — aber sie fehlt in der Übersicht | aufnehmen; S-8 |
| **Unbenannt:** `passwort_hilfe_anfragen` nimmt höchstens 200 Bitten je Stunde — über **alle** Betriebe zusammen (Endstand der Funktion; Stand §104 nennt die Zahl, nicht den Geltungsbereich) | Schutz vor Flut | Schutz ja; „über alle Betriebe“ ist bei vielen Betrieben eine Grenze ohne Grund | je Betrieb zählen (z. B. 20 je Stunde) und gesamt höher; Prüfung `passwortHilfe.test.ts` erweitern |
| **Unbenannt:** Zugangstoken und Datenbankpasswort in GitHub-Secrets (`DEPLOYMENT.md:96–98`) | liegt beim Betreiber (CI) | ja, aber nicht als Grenze geführt und im Widerspruch zum Wortlaut von `CLAUDE.md:82` | benennen; S-9 |

---

## 5. Zusammenspiel und Ideen

- **I-1 Supportfall in einem Zug** (Nutzen hoch, Aufwand mittel): „Problem melden“ schlägt nach dem
  Absenden die Freigabe „Nur ansehen, 24 Stunden“ vor (ein Tipp); die Fehlerliste der Plattform
  zeigt an der Meldung, ob eine Freigabe offen ist, und springt in den Einblick auf **der Seite, von
  der gemeldet wurde** (`fehlerprotokoll.pfad` ist schon da). Heute sind das drei getrennte Wege.
  Bleibt gleich: ohne Freigabe kein Einblick; die Meldung geht auch ohne Freigabe hinaus.
- **I-2 „Wer sieht mit?“ sichtbar** (Nutzen mittel, Aufwand klein; ergänzt S-4): solange ein
  Einblick offen ist, steht für die Spitze ein ruhiger Vermerk im Kopf der App („Support sieht mit
  bis 14:30 · Beenden“). Ein Tipp widerruft. Vorbehalt: nur für die Spitze, sonst verunsichert es
  die Mannschaft.
- **I-3 Verlorenes Telefon als ein Handgriff** (Nutzen mittel, Aufwand klein): in „Mein Konto“ und
  in der Benutzerakte ein Punkt „Gerät verloren“, der in einem Zug alle Geräte abmeldet, die
  Push-Anmeldungen entfernt (gibt es), das Kalender-Abo erneuert (`kalender_abo_beenden` gibt es)
  und zum neuen Passwort führt. Heute sind es vier Stellen, und S-2 zeigt, dass eine davon
  vergessen wurde.
- **I-4 Zwei-Faktor einladend statt nur als Pflicht** (Nutzen mittel, Aufwand klein): die Startseite
  der Spitze nennt „2 von 3 Leitungskonten ohne zweiten Faktor“ (`zwei_faktor_ohne_faktor` liefert
  es schon) mit Sprung zur Einrichtung — auch ohne eingeschaltete Pflicht. Vorbehalt: darf nicht
  zur Dauerzeile werden; einmal „später“ blendet sie für 30 Tage aus (Startseiten-Wahl gibt es).
- **I-5 Angemeldete Geräte zeigen** (Nutzen mittel, Aufwand mittel): „Mein Konto“ listet die
  offenen Sitzungen (Gerät, zuletzt aktiv) mit „Dieses abmelden“. `auth.sessions` trägt
  `user_agent` und `refreshed_at`; nötig wäre eine Funktion `meine_sitzungen()` und
  `sitzung_beenden(id)` (beide `security definer`, nur eigene Zeilen). Wie am iPhone unter
  „Geräte“. Vorbehalt: `user_agent` ist grob („Safari auf iPhone“), mehr gibt der Browser nicht her.
- **I-6 Passkeys statt Passwort und Code** (Nutzen hoch für „wie bei Apple“, Aufwand groß,
  Vorbehalt): Anmelden mit Face ID/Fingerabdruck. Der Anmeldedienst bietet WebAuthn bislang nur als
  zweiten Faktor (`supabase/config.toml:329`, auskommentiert) — als Ersatz für das Passwort liegt es
  nicht bei Senklot. Als zweiter Faktor wäre es eine Alternative zur Authenticator-App; erst
  prüfen, ob das gehostete Projekt es freigibt.
- **I-7 Nach dem Rollenwechsel weiterarbeiten statt neu anmelden** (Nutzen klein, Vorbehalt): heute
  beendet jede Rollenänderung alle Sitzungen. Sicher ist das; bequemer wäre, das Token zu erneuern.
  Ich empfehle es **nicht**: die sofortige Wirkung ist geprüft (`ansprueche.test.ts`), und S-6
  nimmt dem heutigen Weg die Härte.

---

## 6. Nachgeprüfte ✔-Punkte des letzten Plans (Stichprobe)

| Punkt | Geprüft an | Ergebnis |
|---|---|---|
| K1 Meldung über ein Mitglied der Leitung | Endstand: `nachricht_meldungen`, `_offen`, `_erledigen`, `_loeschen` schließen `von_uid = auth.uid()` aus; `nachricht_meldung_erreicht_jemanden` gibt es; auch die Speicherregel für gemeldete Anhänge (`app.nachrichten_datei_lesbar`) nimmt den Gemeldeten aus | hält |
| K2 Push-Anmeldungen bei „überall abmelden“, Deaktivieren, Startpasswort | `app.konto_sperren`, `app.sitzungen_beenden`, `push_geraete_abmelden`, `push_geraete_vergessen` rufen `app.push_anmeldungen_entfernen`; `push_vorgaben` filtert aktiv und nicht ruhend; `push-melden/index.ts:113–141` liest nur darüber | hält — mit der Lücke S-2 (eigener Passwortwechsel) |
| K5 Anmeldemaske nennt den Grund | `src/lib/auth/pg/sitzung.ts:87–96`, `src/features/auth/anmeldeAblehnung.ts` | hält (bewusst ohne „deaktiviert“ vor dem richtigen Passwort) |
| K6 Zwei-Faktor-Pflicht führt Betroffene zur Einrichtung | `AuthContext.tsx:572–601` (Minutentakt, Rückkehr), `zwei_faktor_ohne_faktor` nur für die Spitze | hält |
| K7b Support „Nur ansehen“ sieht die sieben Listen | Regeln im Endstand (`einkauf_posten`, `system_laeufe`, `lagerbewegungen`, `material_orders`, `befehle_vorgaenge`, `konto_umstellungen`, `termine`) kennen `app.supportbetrieb()` | hält für die Tabellen — **der Zweck ist seit dem 18.11. an anderer Stelle wieder gebrochen (S-1)** |
| K9/K12 Löschung nennt Umstellungen und Bewegungsprotokoll | Endstand `person_loeschen` (398 Zeilen): `konto_umstellungen` gelöscht und gezählt; „Bewegungsprotokoll des Lagers“ unter „aufbewahren“ | hält |
| K11 Tabellenrechte ohne TRUNCATE/TRIGGER/REFERENCES | gemessen: 0 Tabellen oder Sichten mit einem dieser Rechte für `authenticated`; 0 mit Lese- oder Schreibrecht für `anon` | hält |
| V14 Bitte um ein neues Passwort | Endstand `passwort_hilfe_anfragen` (Antwort immer gleich, eine offene Bitte je Konto, 10 Minuten, 200 je Stunde); `passwort-vergeben/index.ts:178`, `notzugang-passwort/index.ts:154` erledigen sie | hält (Geltungsbereich der 200 siehe Abschnitt 4) |

---

## 7. Nicht angesehen

- **Edge Functions nur auf Anmeldung, Rolle und Mandant gelesen, nicht auf jeden Zweig:**
  `daten-ausleitung` (813 Zeilen; nur die Eingangsprüfung), `konto-umstellen`, `betrieb-anlegen`,
  `nachrichten-aufraeumen`; `shared/smtp.ts`, `shared/ausleitung*.ts`, `shared/s3Signatur.ts` gar
  nicht.
- **Benutzerverwaltung und Benutzerakte** (`src/features/users`), `ModulesView`, „Mein Konto“,
  `SicherungView`, `Datenauskunft`, `PlattformView`/`BetriebVerwalten` nur an den genannten Stellen;
  die Durchsetzung der Module in der Datenbank (`app.modul_aktiv`) nicht je Modul.
- **Nachrichten:** Aufbewahrungslauf, Löschen einzelner Nachrichten, Export unter „Mein Konto“,
  Live-Kanal — nur die Speicherregeln und der Meldeweg.
- **Fassungswechsel:** `NeueFassung.tsx` und `ungespeichert.tsx` nicht Zeile für Zeile; nur, dass
  jedes automatische Neuladen über `darfLaden`/`darfNeuLaden` läuft.
- **Service Worker** `public/sw.js` (829 Zeilen) nicht gelesen.
- **Abhängigkeiten:** `package-lock.json` nicht gegen bekannte Schwächen geprüft (ohne Netz nicht
  sicher belegbar).
- **Nicht nachstellbar hier:** Anmeldedienst (Sperre, Drosselung, Linkdauer), Realtime, Speicher-
  Schnittstelle, Edge-Runtime, FCM, Einstellungen des gehosteten Projekts; kein Browser- oder
  Gerätetest, keine Testdatei gelaufen.
- **Handbuch:** nur an den Stellen zum Benutzernamen und zum Notzugang nachgeschlagen.
