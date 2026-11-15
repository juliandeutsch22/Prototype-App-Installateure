# Bereich 6 — Grundlagen, Sicherheit, Kommunikation

Stand: 15.11.2026, nur gelesen. Am Repository wurde nichts geändert.

**Wie geprüft wurde.** Viele Datenbankfunktionen werden in späteren Migrationen über
`pg_get_functiondef … replace … execute` nachgezogen; der Text einer einzelnen Migration ist deshalb
oft nicht der Endstand. Ich habe alle 265 Migrationen in eine Wegwerf-Datenbank (Postgres 16 mit
nachgebauten `auth`/`storage`/`cron`/`net`/`vault`-Hüllen) eingespielt und den **Endstand** gelesen
(629 Funktionen, 174 Regeln, 88 Tabellen). Befunde mit „gemessen“ sind dort mit nachgestellten
Ansprüchen (`request.jwt.claims`) ausgeführt; die Datenbank ist wieder entfernt. Nicht nachgestellt
sind Anmeldedienst, Realtime, Speicher-Schnittstelle und Edge-Runtime — dort steht „Code“.

---

## 1. Wie der Ablauf funktioniert

1. **Betrieb anlegen:** Plattformkonto (immer `aal2`, Tabelle `platform_admins`) ruft `betrieb-anlegen`.
   Die Function legt das Anmeldekonto an und ruft `betrieb_anlegen` (Firma, erster Administrator,
   Protokoll in einer Transaktion). Mit E-Mail kommt ein Rücksetzlink zurück (wird nicht versendet),
   mit Benutzername ein einmaliges Startpasswort.
2. **Anmeldung:** `signInWithPassword`; ein Benutzername wird zur Kunstadresse
   `name@benutzer.senklot.invalid`. `AuthContext` prüft erst Plattformmarke, dann den Bedarf am zweiten
   Faktor, dann Profil (`users`) und Firma; Startpasswort/Rücksetzlink erzwingen zuerst ein eigenes Passwort.
3. **Ansprüche:** Trigger `users_ansprueche` schreibt `company_id`, `role`, `active` ins Token
   (`app_metadata`). Der Betrieb kommt aus dem Token (`app.betrieb()`), Rolle und „aktiv“ aus der Tabelle.
   `app.aktiv()` = Sitzung lebt ∧ Konto aktiv ∧ Betrieb ruht nicht ∧ zweiter Faktor nicht ausständig.
   Jede Regel prüft `company_id = app.lesebetrieb()` (Support: `app.supportbetrieb()`).
4. **Benutzer anlegen:** `mitarbeiter-anlegen` legt nur das Konto an (Spitze, aus der Tabelle geprüft),
   die Zeile in `users` schreibt der Browser unter Zeilenschutz; Wiederaufnahme über eine Vorgangskennung.
5. **Zwei-Faktor (TOTP):** Pflicht fürs Plattformkonto, je Betrieb schaltbar für Administrator,
   Geschäftsführung, Buchhaltung; wer einen Faktor hat, braucht ihn. Zehn Wiederherstellungscodes; ein
   Code entfernt den Faktor. Zurücksetzen sonst nur über den Notzugang der Plattform.
6. **Passwort vergessen:** E-Mail-Konto über Link; Benutzernamen-Konto über `passwort-vergeben`
   (Spitze, Administrator nur durch Administrator) oder `notzugang-passwort` (Plattform, offener
   Notzugang, Grund, Rückruf). `konto-umstellen` wechselt zwischen E-Mail und Benutzername.
7. **Deaktivieren:** `users.active=false` → Trigger sperrt das Konto (`banned_until`), löscht Sitzungen
   und Erneuerungstokens; `app.sitzung_lebt()` lässt das Token sofort nicht mehr gelten. Rollenwechsel
   beendet ebenfalls die Sitzungen. Ein deaktivierter Betrieb sperrt alle Konten.
8. **Person löschen / Auskunft:** `person_auskunft` und `person_loeschen` (nur Spitze; Mitarbeiter erst
   nach Deaktivierung). Sofort gehen Einstellungen, Einsätze, Nachrichteninhalte, Faktor; Zeit- und
   Lohnunterlagen bleiben mit Frist benannt.
9. **Betrieb löschen:** deaktivieren → Export/Übergabe → Löschung planen (Frist) → `betrieb-loeschen`
   (Dateien, dann alle Zeilen über `app.auszug_tabellen()`, dann Anmeldekonten). Nachtlauf `daten-ausleitung`
   sichert jeden Betrieb in einen Eimer bzw. außer Haus.
10. **Supportzugang:** Der Betrieb gewährt „ansehen“ (≤ 7 Tage) oder „mitarbeiten“ (≤ 24 h); die
    Plattform kann einen lesenden Notzugang (≤ 24 h, Grund) öffnen. Ohne Protokollzeile in
    `support_zugriffe` gilt kein Einblick; Zeiten, Abwesenheiten, Fotos, Nachrichten bleiben zu.
11. **Nachrichten:** Tabellen ohne Leseregel, alles über Funktionen mit Eigentümerrechten. Privat
    (direkt/Runde) liest nur, wer teilnimmt; Baustellen-Thread, wer die Baustelle sieht. Führung,
    Support und Plattform lesen Privates nicht — außer einer **gemeldeten** Nachricht als Kopie.
    Anhänge in zwei privaten Eimern, Adressen 10 Minuten. Live nur über die eigene Teilnahmezeile.
    Aufbewahrung: private Gespräche 6/12/24 Monate nach der letzten Nachricht (Nachtlauf).

---

## 2. Belegte Befunde

### Hoch

**H1 — Meldung einer Nachricht: die Zusage „… erfährt von der Meldung nichts“ stimmt nicht, wenn der Absender zur Leitung gehört.**
- Stellen: `src/features/nachrichten/NachrichtAktionen.tsx:174–177` (Zusage); `supabase/migrations/20261108800000_nachrichten.sql:1652` (`app.darf_meldungen_sehen`), `:1669` (`nachricht_meldungen`), `:1687` (`…_erledigen`), `:1718` (`…_loeschen`); Anzeige `src/features/nachrichten/NachrichtenEinstellungen.tsx:162, 179` („Gemeldet von“); Zahl auf der Startseite `src/features/dashboard/start/laden.ts:293`.
- Was fehlt: Keine der vier Funktionen nimmt Meldungen aus, in denen der Aufrufer selbst der Gemeldete ist (`von_uid = auth.uid()`).
- Szenario (gemessen): Administratorin schreibt Projektleiterin eine Direktnachricht, diese meldet sie mit Grund „Belästigung“. Die Administratorin sieht auf der Startseite „1 gemeldete Nachricht“, in den Einstellungen Text, Grund und **den Namen der Melderin**, setzt die Meldung auf „erledigt“ und löscht sie — danach ist nichts mehr da. In einem Betrieb mit einer einzigen Leitung landet jede Meldung über die Leitung bei ihr selbst.
- Folge: falsche Vertraulichkeitszusage genau im heikelsten Fall; die Meldung lässt sich vom Betroffenen spurlos beseitigen.

### Mittel

**M1 — „Auf allen Geräten abmelden“, Deaktivieren und neues Passwort lassen die Push-Marken der anderen Geräte stehen.**
- Stellen: `src/app/AuthContext.tsx:504–521` (nur die Marke *dieses* Geräts geht); `src/features/settings/NotificationSettings.tsx:449–455` („etwa wenn ein Telefon verloren ging“); `supabase/migrations/20260926090000_push_marke_ein_konto.sql:31` (`push_marke_setzen` kennt nur die eigene Marke); `20260912220000_ansprueche.sql:68` (`app.konto_sperren` rührt `user_prefs.push_tokens` nicht an); Versand `supabase/functions/push-melden/index.ts:98–127`.
- Szenario: Telefon verloren → am PC „Auf allen Geräten abmelden“. Die Sitzung am Telefon ist beendet, seine Marke steht weiter in `user_prefs`. Das verlorene Telefon zeigt weiter Meldungen am Sperrbildschirm: neue Nachrichten (mit 80 Zeichen Text, wenn die Vorschau gewählt ist), Einsatzplan mit Kundennamen, Abwesenheiten, Material. Das Gerät selbst kann die Marke nicht mehr abmelden (keine Sitzung).
- Gemessen: nach `active=false` steht die Marke weiter in `user_prefs`; erst „Person löschen“ entfernt sie.
- Dazu (niedrig, Code): Meldungen an die **Projektleitung** (`push-melden/index.ts:186`, Eilzustellung) und „Material abholbereit“ an den Besteller (`:235`) filtern nicht nach `active` — ein deaktivierter Projektleiter, der noch an der Baustelle steht, bekommt Eilmeldungen weiter.

**M2 — Der Nachtlauf der Sicherung arbeitet alle Betriebe in einem einzigen Aufruf ab.**
- Stellen: `supabase/functions/daten-ausleitung/index.ts:684–721` (Schleife über `companies`, ohne Reihenfolge, ohne Zeitbudget); `supabase/migrations/20260915120000_nachtlauf_wache.sql:47–74` (ein Anstoß, Frist 300 000 ms); `20261013120000_anstoss_neustart.sql:103–150` (bei ausbleibender Antwort `lauf_festhalten(c.id, 'ausleitung', false, …) from companies`).
- Was passiert: Je Betrieb der ganze Stand plus bis zu 200 Dateien/64 MB — das Budget gilt je Betrieb, die Wanduhr der Function für alle zusammen. Mit wachsender Zahl der Betriebe läuft der Aufruf in die Zeitgrenze.
- Szenario: 40 Betriebe à 10 s → 400 s. Die Betriebe am Ende der (immer gleichen) Reihenfolge werden **nie** gesichert, und weil keine Antwort kommt, meldet die Wache bei **jedem** Betrieb „Keine Antwort“ — auch bei denen, deren Stand fertig wurde.
- Widerspricht dem Anspruch „für jeden Betrieb“ (CLAUDE.md, Grundsatz 6); in den benannten Grenzen steht dazu nichts.

**M3 — „Alle Daten herunterladen“ und die Datenauskunft enden bei 8 MB, und der genannte Ausweg führt in dieselbe Grenze.**
- Stellen: `supabase/migrations/20261108800000_nachrichten.sql:2108–2117` (`betrieb_auszug`, 8 MB über **alle** Tabellen); `src/features/settings/SicherungView.tsx:109–135` (Kommentar Zeile 36 nennt 10 MB); `20261012300000_grenzen_verlaeufe.sql:156, 431` (`person_auskunft`: „zu groß … bitte die Datensicherung herunterladen und die Zeilen dieser Person daraus nehmen“).
- Gemessen: mit 40 000 Katalogzeilen (13 MB) antwortet `betrieb_auszug` „Der Datenbestand ist zu groß … Der vollständige Stand liegt in der nächtlichen Ausleitung“. Im Dauerbetrieb reichen dafür ein eingespielter Großhändlerkatalog (`materials`, `lieferantenartikel`, `material_prices`), das Änderungsjournal oder einige hundert Scheine — die Unterschrift des Kunden liegt als Bild in der Zeile (`work_sheets.unterschrift_kunde`).
- Kein Selbstbedienungsweg danach: Der Eimer `ausleitung` hat keine Leseregel für Konten, die Übergabe der Plattform gibt es nur für einen **deaktivierten** Betrieb (`betrieb_uebergabe_dateien`).
- Szenario: Hausverwaltung als Kunde mit 600 unterschriebenen Scheinen verlangt Auskunft (Art. 15) → „zu groß, nimm die Datensicherung“ → die Datensicherung antwortet „zu groß“. Sackgasse; nicht in `docs/grenzen-durchsicht-2026-10-24.md`.

**M4 — Anmeldemaske: jede Ablehnung heißt „Passwort prüfen“.**
- Stelle: `src/features/auth/LoginPage.tsx:113–116` (`catch` ohne Blick auf den Grund).
- Szenario A: deaktiviertes Konto oder deaktivierter Betrieb (Konto gesperrt) → „Anmeldung fehlgeschlagen. E-Mail bzw. Benutzername und Passwort prüfen.“ Der Monteur lässt sich ein neues Passwort geben, das wieder nicht geht; bei einem deaktivierten Betrieb betrifft es alle. Die richtige Meldung („Dieses Konto ist deaktiviert“) gibt es nur für den Fall mitten in der Sitzung (`AuthContext.tsx:388`).
- Szenario B: kein Netz oder Drosselung des Anmeldedienstes → dieselbe Meldung; im Keller sieht es nach falschem Passwort aus.
- Belegt am Code; dass der Dienst die Sperre erst nach richtigem Passwort meldet (also nichts verrät), ist sein bekanntes Verhalten, hier nicht nachgestellt.

**M5 — Zwei-Faktor-Pflicht eingeschaltet: Kollegen der Leitung/Buchhaltung arbeiten bis zu einer Stunde in einer leeren App.**
- Stellen: `app.zweiter_faktor_verlangt` (`20261011200000_zwei_faktor_buchhaltung.sql:44`) wirkt sofort; der Bedarf wird im Browser nur bei einem Anmeldeereignis gefragt (`src/app/AuthContext.tsx:255`, `src/lib/auth/pg/zweiFaktor.ts:62`).
- Szenario: Geschäftsführung schaltet die Pflicht ein, die Buchhalterin ist gerade angemeldet (ohne Faktor). Ab sofort liefert jede Abfrage nichts, Speichern wird abgewiesen — ohne Erklärung, bis das Token erneuert wird oder sie neu lädt. Die Prüfung beim Zurückkommen in den Vordergrund (`sitzungAnderswoBeendet`) erkennt das nicht, die Sitzung lebt ja.

### Niedrig

**N1 — Zweiter Faktor ohne Ausweg nach Rollenwechsel.** `plattform_zweiter_faktor_zuruecksetzen` (`20261011200000_zwei_faktor_buchhaltung.sql:120–146`) nimmt nur Administrator, Geschäftsführung, Buchhaltung; im Betrieb gibt es kein Zurücksetzen. Wer als Buchhaltung einen Faktor eingerichtet hat, danach Verwaltung/Projektleitung wird und Telefon samt Codes verliert, kommt nicht mehr hinein („Nur für Konten der Administration …“). Einziger Weg heute: deaktivieren und „Person löschen“ — das nimmt Einsätze, Einstellungen und Nachrichten mit. Der Hinweis auf `ZweiFaktorSeite.tsx:103` nennt den Fall nicht.

**N2 — Support „Nur ansehen“ sieht mehr Bereiche leer, als dem Betrieb gesagt wird.** Text: `src/features/settings/SupportzugangView.tsx:207` („sieht den Betrieb wie ein Administrator … ausgenommen Zeitbuchungen, Urlaube, Krankenstände, Angebote und Scheinfotos“). Gemessen mit Freigabe „ansehen“: `einkauf_posten` 0 von 1, `system_laeufe` 0 von 1; ebenso nach den Regeln `lagerbewegungen`, `konto_umstellungen` (alle verlangen eine Rolle oder `app.ist_spitze()`). Der Support sieht eine leere Einkaufsliste und „keine Sicherung gelaufen“ statt „verschlossen“ — ein Supportfall zu Einkauf oder Sicherung lässt sich so nur mit „Mitarbeiten“ ansehen.

**N3 — Anhänge im offenen Gespräch laufen nach 10 Minuten ab.** `src/lib/db/pg/nachrichten.ts:462` (600 s), neu signiert nur, wenn sich der Verlauf ändert (`src/features/nachrichten/Gespraech.tsx:247–253`), Verwendung als `href`/`src` (`:609–618`). Szenario: Thread mit Plan-PDF offen, nach einer Viertelstunde Ruhe antippen → Fehlerseite des Speichers; Bilder, die erst beim Scrollen geladen werden (`loading="lazy"`), bleiben leer. Bei den Baustellendokumenten wurde derselbe Fehler schon behoben (Adresse erst beim Öffnen, T-42).

**N4 — „Problem melden“ verspricht eine Rückfrage, die bei Benutzernamen-Konten ins Leere geht.** `src/components/ProblemMelden.tsx:50` („mit deinem Namen und deiner E-Mail-Adresse, damit er nachfragen kann“); die Plattform bekommt `users.email` (`20260929190000_fehler_vor_anmeldung.sql:97`) — bei einem Benutzernamen-Konto die Kunstadresse `…@benutzer.senklot.invalid`. Der Support kann den Melder nicht erreichen und sieht auch nicht, dass es so ist.

**N5 — Nach „Person löschen“ nennt der Bericht zwei verbleibende Tabellen nicht.** `konto_umstellungen` (wer wann umgestellt wurde) und `zeitkonto_anfang` stehen in der Auskunft, werden weder gelöscht noch unter „wird aufbewahrt“ genannt (Endstand `person_loeschen`). Kein Datenverlust, aber der Bericht ist nicht vollständig (Grundsatz 3).

---

## 3. Verdacht (nicht bis zum Ende verfolgt)

- **V1 — Ausgangsfach bei entzogenem Zugriff.** Wird während M5 (oder nach Deaktivierung/Abmeldung anderswo) ohne Empfang Vorgemerktes nachgesendet, weist die Datenbank mit 42501 ab. Ob das Fach das als „endgültig abgelehnt“ verwirft (`src/lib/sync/ausgangsfach.ts:311–315`) statt zu warten, habe ich nicht verfolgt — wäre Datenverlust bei der Buchhalterin aus M5.
- **V2 — Erster Administrator mit E-Mail.** Der Link aus `betrieb-anlegen` ist ein einmaliger Rücksetzlink (örtlich 1 h, `supabase/config.toml:246`); gibt die Plattform ihn später weiter oder öffnet ein Mail-Scanner ihn zuerst, bleibt nur „Passwort vergessen“. Ob das gehostete Projekt für ein noch unbestätigtes Konto (`email_confirm: false`) die Mail schickt, ist nicht geprüft.
- **V3 — Realtime, Löschereignisse.** Die zehn Tabellen der Veröffentlichung haben `REPLICA IDENTITY FULL`. Wer ohne Filter abonniert, bekommt bei Supabase für gelöschte Zeilen den Primärschlüssel auch fremder Betriebe (Zeilenschutz greift bei DELETE nicht). Inhalt: nur Kennung und Zeitpunkt. Nicht gegen einen Realtime-Server geprüft.
- **V4 — `betrieb-loeschen`, Schritt 3.** Scheitert das Löschen einzelner Anmeldekonten (`kontenOffen`), ist der Betrieb schon weg; ein zweiter Aufruf scheitert an „Betrieb gibt es nicht“. Die Konten bleiben gesperrt und ohne Ansprüche, ihre Adressen aber belegt („Zu … gibt es schon ein Konto“). Der Fehlerpfad ist im Code so, ausgelöst habe ich ihn nicht.

---

## 4. Nicht nahtlos

- **Meldung ohne Rückweg:** Wer eine Nachricht meldet, erfährt nie, ob und wie sie erledigt wurde (nur „gemeldet“ an der Nachricht).
- **Datenschutz → Löschen:** Die Karte sagt „Zuerst deaktivieren … Status auf ‚Deaktiviert‘ stellen und speichern“ (`Datenauskunft.tsx`), bietet den Schritt aber nicht an; danach muss man die Karte wiederfinden.
- **Problem melden → Supportzugang:** Die Meldung geht an die Plattform, der Zugang wird getrennt unter Einstellungen gewährt. Weder schlägt die Meldung die Freigabe vor, noch sieht die Fehlerliste der Plattform, ob eine Freigabe offen ist.
- **Passwort vergessen mit Benutzername:** Die Maske sagt „das Büro vergibt ein neues“ — das Büro erfährt davon nur durch einen Anruf.
- **Verlorenes Telefon:** drei Stellen (Mein Konto „Auf allen Geräten“, Benutzerakte „deaktivieren“, Startpasswort „Geräte bleiben angemeldet“), keine davon räumt die Meldungen ab (M1).
- **Zu große Auskunft/Sicherung:** Verweis auf einen Weg, der dem Betrieb nicht offensteht (M3).
- **Zwei-Faktor-Pflicht:** Beim Einschalten sagt nichts, welche Kollegen noch keinen Faktor haben und gleich draußen stehen (M5). `plattform_leitung_mit_zweitem_faktor` gibt es nur für die Plattform.

---

## 5. Funktionen mit Mehrwert (in den bestehenden Abläufen)

1. **„Gerät vergessen“ in Mein Konto und in der Benutzerakte** — beim Abmelden überall, Deaktivieren und neuen Startpasswort die Push-Marken des Kontos leeren; schließt M1 mit einem Handgriff an drei Stellen.
2. **Meldungen über die Leitung gehen an die übrige Leitung** (und sind für den Gemeldeten unsichtbar und nicht löschbar); gibt es keine zweite Leitung, sagt der Dialog das vor dem Absenden. Macht die bestehende Zusage wahr.
3. **Sicherung und Auskunft als Datei in Teilen** — derselbe Weg in Seiten, den es für die Ausleitung schon gibt (`auszug_snapshot_*`), für „Herunterladen“ und die Datenauskunft; hebt die 8-MB-Grenze ohne neuen Ablauf auf.
4. **Nachtlauf je Betrieb anstoßen** (ein Anstoß je Betrieb oder ein Lauf mit Zeitbudget und Fortsetzung beim nächsten Betrieb) — die Wache meldet dann je Betrieb richtig.
5. **Zwei-Faktor im Betrieb zurücksetzen** — eine zweite Leitung setzt den Faktor eines Kollegen zurück (Grund, Protokoll, Sitzungen beendet), wie es `passwort-vergeben` für das Passwort tut; spart den Notzugang für alle Rollen unter der Leitung.
6. **Anmeldemaske nennt den Grund** — „Konto deaktiviert“, „Betrieb deaktiviert“, „kein Netz“, „zu viele Versuche“ statt immer „Passwort prüfen“; erspart dem Büro die häufigste falsche Rückfrage.

---

## 6. Was ich NICHT angesehen habe

- **Ohne Befund geprüft (zur Einordnung):** kein `security definer` ohne festen Suchpfad; für `anon` ausführbar nur die zwei benannten Ausnahmen und fünf Funktionen mit Aufruferrechten; alle 151 für Konten ausführbaren Eigentümer-Funktionen prüfen den Aufrufer; jede Tabelle in `public` hat Zeilenschutz; `person_loeschen`/`person_auskunft` gegen jede Spalte mit Personenbezug abgeglichen (bis auf N5 vollständig); Betriebslöschung erfasst jede Tabelle mit `company_id`, alle Lösch-Riegel lassen den Dienst durch; Nachrichten: privat bleibt privat (Regeln, Speicher, Auszug, Sicherung, Support); alle zehn Edge Functions meines Bereichs prüfen Token, zweiten Faktor und Rolle aus der Tabelle.
- **Nicht angesehen:** Benutzerverwaltung und Benutzerakte selbst (`src/features/users`), Startseite, Zeit/Urlaub/Material/Geld; `kalender`, `angebot-annahme`, `uid-pruefen`; das Ausgangsfach (`src/lib/sync`) über die Nachrichten hinaus; `Layout.tsx`, `Suchfenster.tsx`, `SettingsView.tsx`, `FirmendatenView.tsx`, `KontenrahmenView.tsx`, `ZeitfelderView.tsx`, `FahrzeugeView.tsx`, `ModulesView.tsx`, `Rechtstexte.tsx`, `BetriebVerwalten.tsx` nur überflogen; die Durchsetzung der Module in der Datenbank (`app.modul_aktiv`) nicht je Modul; `scripts/ruecklauf.mjs`; Einstellungen des gehosteten Projekts (Passwortregeln, Drosselung, Linkdauer); echtes Verhalten von Anmeldedienst, Realtime und FCM; keine Browser- oder Gerätetests, keine Testsuite gelaufen.
