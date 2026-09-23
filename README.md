# Senklot — Betriebssoftware für Installationsbetriebe

Mandantenfähige Software für Zeiterfassung, Baustellen, Material,
Einsatzplanung, Handwerksscheine, Angebote, Rechnungen, Mahnwesen, Urlaub und
Wartungen. Entstanden aus einer monolithischen Einzeldatei
(`perl-installateur-web-app.html`, rund 10 400 Zeilen).

## Dokumentation

**Wer hier neu ist, fängt bei der Übergabe an.**

| Datei | Beantwortet |
|---|---|
| [`docs/UEBERGABE.md`](docs/UEBERGABE.md) | **Einstieg.** Wie das Projekt aufgebaut ist, was man nicht versehentlich umwirft, wo die Lücken sind. |
| [`docs/FUNKTIONEN.md`](docs/FUNKTIONEN.md) | Was es gibt, wer was darf, wodurch es geprüft ist — inklusive der bekannten Lücken. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Änderungsprotokoll: was wurde wann warum gebaut. |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Ein Projekt einrichten und die App ausliefern. |
| [`docs/LEGACY-ANALYSIS.md`](docs/LEGACY-ANALYSIS.md) | Datenmodell und übernommene Geschäftslogik aus der Altanwendung. |
| [`docs/MIGRATION-SUPABASE.md`](docs/MIGRATION-SUPABASE.md) | Der Umzug von Firestore nach Postgres — Entscheidung und Reihenfolge. |

## Stack

- **Frontend:** React + TypeScript (strict) + Vite, Tailwind
- **Daten, Anmeldung, Dateien:** **Supabase** (Postgres mit Zeilenschutz,
  Supabase Auth, Supabase Storage) — EU-Region
- **Serverlogik:** Postgres-Funktionen, Trigger, `pg_cron` und fünf Edge
  Functions (`mitarbeiter-anlegen`, `passwort-vergeben`, `betrieb-anlegen`,
  `daten-ausleitung`, `push-melden`)
- **Auslieferung:** Firebase Hosting
- **Push aufs Telefon:** Firebase Cloud Messaging

> **Firebase ist am 19.09.2026 abgebaut worden** — Firestore, die Anmeldung und
> vierzehn Cloud Functions. Übrig sind das Hosting und FCM. Warum FCM bleibt:
> eine Push-Meldung braucht einen Dienst, den Apple und Google akzeptieren, und
> dafür hat Supabase keinen Ersatz.

## Projektstruktur

```
src/
  app/        Routing (App.tsx), Layout, AuthContext, guards.tsx,
              navigation.ts — DIE Liste, wer wohin darf
  features/   ein Verzeichnis je Bereich: time, invoices, quotes, customers,
              projects, assignments, worksheets, vacations, orders, costing,
              accounting, users, settings, modules, dashboard, plattform, auth
  lib/        db/ (Datenschicht: Weiche + pg/), auth/ (Anmeldung),
              supabase.ts, firebase.ts (nur noch Push), time.ts, praefixe.ts,
              permissions.ts, module.ts, sync/ (Ausgangsfach ohne Empfang)
  components/ wiederverwendbare Oberfläche (Button, Card, ListRow, Badge, …)
  types/      zentrale Datentypen (companyId auf jedem Datensatz)
shared/       Logik, die Browser UND Server brauchen — wird beim Bauen nach
              supabase/functions/_shared/ kopiert, nicht abgeschrieben
supabase/
  migrations/ das Schema, der Zeilenschutz, die Datenbankfunktionen
  functions/  die vier Edge Functions
tests/
  unit/       Rechnung und statische Abgleiche (schnell, ohne Datenbank)
  components/ Ansichten (Rendern und Klicken, Datenschicht ersetzt)
  supabase/   gegen eine ECHTE Postgres-Datenbank
  durchklick/ vier Wege im echten Browser (Playwright)
```

**Regeln:** keine Datei über rund 300 Zeilen; Datenbankzugriffe nur in
`lib/db/`, und dort **jede** Abfrage mit einer Grenze (per Test erzwungen).

## Einrichtung

```bash
npm install
cp .env.example .env        # Supabase-Werte eintragen, Firebase optional

npm run dev                 # Entwicklungsserver
npm run stack               # lokale Supabase-Datenbank (Docker)
```

Was in `.env` gehört und warum, steht in `.env.example` — inklusive der
Warnung, die dort am wichtigsten ist: **der `service_role`-Schlüssel gehört
niemals in eine Datei, die ein Browser sieht.**

## Prüfen

```bash
npm test                    # Rechnung und Ansichten (ohne Datenbank)
npm run supabase:test       # gegen eine echte Postgres-Datenbank
npm run durchklick          # vier Wege im echten Browser
npm run lint && npm run typecheck && npm run build
```

Die Datenbankprüfungen brauchen den lokalen Stack (`npm run stack`).

## Ersteinrichtung eines Betriebs

**Henne und Ei:** einen Betrieb legt die Edge Function `betrieb-anlegen` an,
und die lässt nur herein, wer in `platform_admins` steht — wo niemanden die App
einträgt. Den Ring durchbricht `scripts/bootstrap-postgres.mjs` genau einmal.
Der vollständige Ablauf steht in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#4--erstanlage-betrieb-und-erster-zugang).

### Mitarbeiter anlegen — und warum kein Schalter im Dashboard hilft

In der App legt die Geschäftsführung oder die Administration Mitarbeiter unter
*Benutzerverwaltung* an. Das läuft über die Edge Function
`mitarbeiter-anlegen`, und der Umweg hat einen Grund.

Vorher rief die App `auth.signUp` — aus dem Browser, mit dem **öffentlichen**
Schlüssel. Das verlangt im Projekt unter *Authentication → Sign In / Providers
→ Email* den Schalter **„Allow new users to sign up"**, und der gehört
**ausgeschaltet**: der öffentliche Schlüssel steht im ausgelieferten
JavaScript, und eingeschaltet könnte sich jeder, der ihn dort abliest, selbst
ein Konto anlegen.

| Schalter | Stellung | Warum |
| --- | --- | --- |
| Allow new users to sign up | **aus** | sonst steht die Anmeldung des Betriebs offen |
| Confirm email | **an** | wer sich selbst anmeldet, bestätigt seine Adresse |

Die Function setzt beim Anlegen `email_confirm`, weil hier nicht jemand sich
selbst anmeldet, sondern die Geschäftsführung ein Konto für einen Mitarbeiter
erzeugt, den sie kennt. Ohne das käme er bis zu seinem Klick in einer Mail
nicht hinein.

**Was die Function bewusst NICHT tut:** die Zeile in der Belegschaft
schreiben. Auf `users` liegen `users_anlegen` (verlangt `app.ist_spitze()`)
und der Trigger `users_adminrolle`; beide lesen den Anspruch aus dem Token des
Aufrufers. Mit dem Dienstschlüssel geschrieben, gälte keine der beiden Regeln
mehr. Die Zeile schreibt deshalb weiter der Browser — durch den Zeilenschutz,
so wie bisher.

### Weitere Betriebe: der globale Administrator

Für jeden **weiteren** Betrieb gibt es einen zweiten Weg, und er ist der
bessere: ein Konto, das Betriebe anlegt und in keinen hineinsieht.

Ein Dienstschlüssel kann alles, hinterlässt kein Protokoll und kommt auch an
jeden Kundenstamm. Der globale Administrator kann genau eines: einen neuen,
leeren Betrieb erzeugen. Sein Token trägt **keine `companyId`**, und daran
hängt jede einzelne Leseregel.

**Einrichten** (einmalig, über die Supabase-Konsole — mit Absicht): ein Konto
mit eigener E-Mail anlegen, das zu **keinem** Betrieb gehört, und seine Kennung
in `platform_admins` eintragen. An diese Tabelle kommt kein Client heran; sie
hat absichtlich keine einzige Richtlinie. Wer einen globalen Administrator
ernennen will, braucht die Konsole — genau die Hürde, die ein solches Konto
verdient.

**Zwei Konten, nicht eines.** Gäbe es für dieselbe Kennung beides, entschiede
allein die Reihenfolge zweier Trigger, ob am Ende ein Plattformkonto oder ein
Konto MIT Betrieb dasteht — und ein Zufall entschiede über Leserechte an
fremden Kundendaten.

## Deployment

`.github/workflows/deploy.yml` prüft jeden Pull Request und veröffentlicht
jeden Push auf `main` auf Firebase Hosting. Der Deploy hängt am Prüf-Job: ist
Typprüfung, Lint oder ein Test rot, geht nichts live.

`.github/workflows/supabase-migrationen.yml` spielt Schema und Edge Functions
ein — auf jedem Pull Request gegen eine **frische** Datenbank, auf `main` ins
echte Projekt. Die Prüfung steht **vor** dem Einspielen: eine Migration, die
einmal im Projekt liegt, ist dort.

**Zwischenspeicherung.** `firebase.json` setzt die `Cache-Control`-Kopfzeilen
selbst, weil die Voreinstellung von Firebase Hosting ein neues Deployment bis
zu einer Stunde lang unsichtbar macht: der Browser hält die alte `index.html`
und lädt damit auch das alte Bundle. Genau das ist passiert — eine behobene
Anzeige war am Telefon noch immer kaputt zu sehen, obwohl der Deploy längst
durch war. Jetzt gilt:

| Pfad | Kopfzeile | Warum |
| --- | --- | --- |
| `**` | `no-cache` | Einstieg (`index.html`), Manifest, Service Worker: bei jedem Aufruf gegenprüfen |
| `/assets/**` | `public, max-age=31536000, immutable` | Vite hängt einen Hash an jeden Dateinamen — eine geänderte Datei heißt anders und kann nie veraltet ausgeliefert werden |

`no-cache` heißt nicht „gar nicht speichern", sondern „vor Benutzung
rückfragen"; unverändert antwortet der Server mit 304 und schickt keine Daten.

Die Reihenfolge ist nicht beliebig: **die letzte passende Regel gewinnt.**
Gegen den Hosting-Emulator nachgemessen — mit `/assets/**` zuerst überschreibt
das nachfolgende `**` sie wieder, und die gehashten Dateien landen ebenfalls
bei `no-cache`. Deshalb steht die allgemeine Regel oben und die besondere
unten.

## Mandantensicherheit

- `companyId` liegt auf **jedem** Datensatz und wird serverseitig gesetzt, nie
  aus einer Eingabe des Browsers.
- Betrieb, Rolle und der Aktiv-Zustand stehen im `app_metadata` des Tokens,
  gesetzt von zwei **Postgres-Triggern** aus der Belegschaftstabelle.
- Jede Tabelle trägt Zeilenschutz, und jede Richtlinie prüft den Betrieb.
  `tests/supabase/schema.test.ts` fragt die Datenbank danach, statt eine Liste
  zu pflegen — eine neue Tabelle ist damit automatisch geprüft oder fällt
  durch.
- **Eine Zeile, die man nicht sehen darf, ist nicht „verboten", sondern nicht
  vorhanden.** Fehlender und fremder Datensatz sehen von aussen gleich aus.

```bash
npm run stack && npm run supabase:test
```

## DSGVO

- **EU-Region** für Datenbank, Anmeldung und Dateien.
- **Datenexport je Betrieb** (Art. 15/20): *Einstellungen → Datensicherung →
  Alle Daten herunterladen*. Die Sammlungsliste kommt aus dem Katalog der
  Datenbank, nicht aus einer Datei, die jemand pflegt.
- **Nächtliche Sicherung an einen zweiten Ort**, mit einem Schlüssel, der nur
  anlegen darf — nicht lesen, nicht löschen, nicht überschreiben.
- **Kein GPS**, solange keine Betriebsvereinbarung nach § 96 ArbVG vorliegt.
- Die Checkliste vor dem echten Betrieb steht in
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#dsgvo-checkliste-vor-dem-echten-betrieb).
