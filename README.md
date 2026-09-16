# Installateur-App

Mandantenfähige Betriebssoftware für Installationsbetriebe (Zeiterfassung,
Material, Baustellen, Einsatzplanung, Rechnungen) mit einem **KI-Magic-Moment**:
Ein Mitarbeiter spricht ~15 Sekunden, daraus entstehen automatisch
strukturierte, bestätigbare Einträge (Zeit, Material, Folgetermin).

Diese Codebasis ist die Professionalisierung der monolithischen Einzeldatei
`perl-installateur-web-app.html` (~10.400 Zeilen) gemäß der Bau-Spec.

## Dokumentation

**Wer hier neu ist, fängt bei der Übergabe an** — sie erklärt Aufbau,
Entscheidungen, Schwachstellen und die nächsten Schritte.

| Datei | Beantwortet |
|---|---|
| [`docs/UEBERGABE.md`](docs/UEBERGABE.md) | **Einstieg.** Wie das Projekt aufgebaut ist, was man nicht versehentlich umwerfen sollte, wo die Lücken sind. |
| [`docs/FUNKTIONEN.md`](docs/FUNKTIONEN.md) | Was gibt es, wer darf was, wodurch ist es geprüft — inklusive der bekannten Lücken. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Änderungsprotokoll: was wurde wann warum gebaut. |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Firebase-Einrichtung, Secrets, Scheduler. |
| [`docs/LEGACY-ANALYSIS.md`](docs/LEGACY-ANALYSIS.md) | Datenmodell und übernommene Geschäftslogik aus der Altanwendung. |
| [`docs/MIGRATION-SUPABASE.md`](docs/MIGRATION-SUPABASE.md) | Entscheidungsvorlage: soll das Hinterhaus von Firestore auf Supabase wechseln, und in welcher Reihenfolge. |

## Stack

- **Frontend:** React + TypeScript (strict) + Vite, Tailwind als Build-Dependency
- **Backend/DB:** Firebase Firestore + Auth, Cloud Functions (Region `europe-west3`, DSGVO)
- **KI:** Transkription (Whisper-kompatibel) + Claude (`claude-opus-4-8`) — beides
  serverseitig, API-Schlüssel nie im Browser

## Projektstruktur

```
src/
  app/        Routing (App.tsx), Layout, AuthContext, guards.tsx,
              navigation.ts — DIE Liste, wer wohin darf
  features/   ein Verzeichnis je Bereich: time, invoices, quotes, customers,
              projects, assignments, worksheets, vacations, orders, costing,
              accounting, users, settings, modules, dashboard, voice, auth
  lib/        firebase.ts (Config aus ENV), db/ (typisierte Firestore-Zugriffe),
              time.ts (Feiertage/Saldo), permissions.ts, module.ts, tenant.ts
  components/ wiederverwendbare UI (Button, Card, InfoHint, Unterreiter, …)
  types/      zentrale Datentypen (companyId auf jedem Dokument)
shared/       Logik, die Browser UND Server brauchen — wird beim Bauen nach
              functions/src/generated/ kopiert, nicht abgeschrieben
functions/    Cloud Functions (europe-west3): Claims-Sync, Urlaubsentscheidung,
              Schein-Vorbereitung, Monatsbilanzen, Push, DSGVO-Export
firestore.rules   mandantensichere Security Rules (Custom Claims)
tests/        Rules, Abfrage-Smoketest und Durchstich gegen den Emulator;
              unit/ (Rechnung und statische Abgleiche), components/ (Ansichten)
```

Regeln: keine Datei über ~300 Zeilen; rohe Firestore-Aufrufe nur in `lib/db/`,
und dort **jede** Abfrage mit `limit()` (per Test erzwungen).

## Einrichtung

```bash
# 1. Frontend-Abhängigkeiten
npm install

# 2. Firebase-Konfiguration (NICHT committen)
cp .env.example .env        # VITE_FIREBASE_*-Werte aus der Firebase Console eintragen

# 3. Functions
cd functions && npm install && cp .env.example .env   # ANTHROPIC_API_KEY etc.

# 4. Entwicklung
npm run dev                 # Vite Dev-Server
npm run emulators           # Firebase-Emulatoren (Auth/Firestore/Functions)
```

Secrets der Functions in Produktion via Secret Manager:
`firebase functions:secrets:set ANTHROPIC_API_KEY` (und `TRANSCRIPTION_API_KEY`).

## Ersteinrichtung eines Mandanten

Benutzer legt normalerweise die Geschäftsführung in der App an. Beim
allerersten Mal gibt es aber noch keine Geschäftsführung, die das dürfte —
Henne und Ei. Diesen Ring durchbricht `.github/workflows/bootstrap.yml`
genau einmal: *Actions → „Mandant einrichten (Erstzugang)" → Run workflow*,
E-Mail, Name, Rolle und Betriebsname eintragen.

Der Zugang wird **ohne Passwort** angelegt. Freigeschaltet wird er über
„Passwort vergessen?" auf dem Anmeldebildschirm — so läuft kein Geheimnis
durch ein Protokoll, das später jeder mit Repo-Zugriff lesen kann.

Der Workflow ist mehrfach ausführbar: eine bestehende Firma wird nicht
überschrieben, ein bestehendes Konto nur aktualisiert.

### Dasselbe im Postgres-Projekt

Steht die Datenquelle auf Postgres, führt derselbe Ring durch Supabase, und
der Schlüssel dazu ist `scripts/bootstrap-postgres.mjs`:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<Project Settings → API Keys> \
ADMIN_EMAIL=chef@betrieb.at ADMIN_NAME='Vorname Nachname' \
COMPANY_NAME='Betrieb GmbH' COMPANY_ID=betrieb \
PLATTFORM_EMAIL=verwaltung@betrieb.at \
node scripts/bootstrap-postgres.mjs
```

Es legt den Betrieb über **dieselbe** Datenbankfunktion an wie die Edge
Function `betrieb-anlegen` — zwei Wege wären zwei Fassungen derselben
Vorgabewerte, und sie liefen auseinander.

`PLATTFORM_EMAIL` ist freiwillig und braucht eine **eigene** Adresse: ein
Plattformverwalter gehört zu keinem Betrieb, und die Datenbank weist ein
Zwitterkonto ab. Ohne ihn lässt sich über die App kein *weiterer* Betrieb
anlegen; für einen einzelnen ist das in Ordnung.

Kein Passwort, kein Link in der Ausgabe — freigeschaltet wird beides über
„Passwort vergessen?", aus demselben Grund wie oben.

#### Ohne Terminal: derselbe Weg im Dashboard

Wer das Skript nicht laufen lassen will oder kann, kommt auch im Browser hin.
Zwei Schritte, in dieser Reihenfolge:

**1. Das Anmeldekonto.** *Authentication → Users → Add user → Create new
user*: E-Mail, ein Passwort deiner Wahl, „Auto Confirm User" an. Die
angezeigte User-UID brauchst du gleich.

**2. Den Betrieb.** *SQL Editor*:

```sql
begin;
-- OHNE DIESE ZEILE SCHEITERT DER AUFRUF, und die Meldung führt in die Irre:
-- „Die Rolle Administrator vergibt und ändert nur ein Administrator". Der
-- Riegel fragt den Anspruch aus dem Token, und der SQL Editor bringt keines
-- mit. Über die Schnittstelle trägt der Dienstschlüssel ihn; hier wird er
-- für diese eine Transaktion gesetzt.
set local request.jwt.claims = '{"role":"service_role"}';

select public.betrieb_anlegen(
  'betrieb',                 -- Kennung, klein, ohne Leerzeichen
  'Betrieb GmbH',            -- Anzeigename
  '<User-UID aus Schritt 1>'::uuid,
  'Vorname Nachname',
  'chef@betrieb.at',
  '<dieselbe User-UID>'::uuid);
commit;
```

Ein Plattformverwalter, falls gewünscht, ist ein **zweites** Konto aus
Schritt 1 mit einer eigenen Adresse:

```sql
insert into public.platform_admins (id, name)
values ('<UID des zweiten Kontos>'::uuid, 'Plattformverwaltung');
```

Das Ergebnis ist dasselbe wie beim Skript — es ruft dieselbe Funktion.

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
bessere: ein Konto, das Betriebe anlegen kann und in keinen hineinsieht.

Der Bootstrap-Workflow braucht ein Dienstkonto — und ein Dienstkonto kann
alles, hinterlässt kein Protokoll und kommt auch an jeden Kundenstamm. Der
globale Administrator kann genau eines: einen neuen, leeren Betrieb erzeugen.
Sein Token trägt **keine `companyId`**, und daran hängt jede einzelne
Leseregel — `tests/firestore.rules.test.ts` prüft gegen eine echte Datenbank,
dass er an kein Dokument eines Betriebs kommt.

**Einrichten** (einmalig, nur über die Firebase-Konsole — mit Absicht):

1. Unter *Authentication* ein Konto mit eigener E-Mail anlegen. Es darf zu
   **keinem** Betrieb gehören: kein `users`-Dokument, keine Rolle. Der Trigger
   verweigert den Claim, wenn doch eines existiert, und schreibt den Grund ins
   Protokoll.
2. Unter *Firestore* ein Dokument `platformAdmins/{uid}` anlegen — die uid
   steht in der Kontoübersicht. Inhalt beliebig; allein die Existenz zählt.
3. Der Trigger `plattformAdminClaim` setzt daraufhin den Claim. Nach einer
   Neuanmeldung zeigt die App diesem Konto **nur** die Seite „Betriebe
   anlegen" — kein Layout, keine Navigation, keinen einzigen Reiter.

An `platformAdmins` kommt kein Client heran (die Sammlung fällt unter das
abschliessende `allow read, write: if false`). Wer einen globalen
Administrator ernennen will, braucht die Konsole oder ein Dienstkonto — genau
die Hürde, die ein solches Konto verdient.

**Entziehen:** das Dokument löschen. Der Trigger nimmt den Claim zurück und
widerruft die Sitzungstoken; ohne den Widerruf liefe ein bereits ausgestelltes
Token bis zu einer Stunde weiter.

Der erste Administrator des neuen Betriebs bekommt **kein Passwort**, sondern
einen Rücksetzlink, der nach dem Anlegen einmalig auf der Seite steht. Er wird
nicht gespeichert und nicht versendet — der Betrieb versendet seine Post
selbst.

**Vorher in der Firebase Console einzurichten** (sonst scheitert der Deploy
mit Berechtigungsfehlern, die wie ein IAM-Problem aussehen):

1. **Firestore Database** anlegen — Standort **`europe-west3`**. Der Standort
   ist später *nicht* änderbar, und in den Zeiteinträgen stehen Krankenstände,
   also Gesundheitsdaten nach Art. 9 DSGVO. Modus: Produktion.
2. **Authentication** → Anmeldemethode **E-Mail/Passwort** aktivieren.
3. **Hosting** → einmal starten.

Das Dienstkonto braucht in der Google Cloud Console unter **IAM** (nicht auf
der Seite „Dienstkonten", dort regelt der Reiter „Berechtigungen" etwas
anderes) die Rollen **Firebase Admin** und **Service Usage Consumer**.

## Deployment

`.github/workflows/deploy.yml` prüft jeden Pull Request und veröffentlicht
jeden Push auf `main` automatisch auf Firebase Hosting — zusammen mit den
Firestore-Regeln und -Indizes. Der Deploy hängt am Test-Job: ist Typprüfung,
Lint, ein Unit- oder ein Rules-Test rot, geht nichts live.

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

**Cloud Functions laufen über einen eigenen Workflow**
(`.github/workflows/deploy-functions.yml`) — siehe unten. Sie brauchen den
Blaze-Tarif und können Kosten auslösen, deshalb sollen sie nicht bei jeder
Änderung an der Oberfläche mitlaufen.

### Cloud Functions

Acht Functions, alle in `europe-west3`:

| Function | Zweck | Braucht API-Schlüssel |
| --- | --- | --- |
| `syncUserClaims` | setzt `companyId` + Rolle als Auth-Claims | nein |
| `notifyNewOrder` | Push an Verwaltung/Leitung bei neuer Anforderung | nein |
| `notifyOrderReady` | Push an den Monteur, wenn Material bereitliegt | nein |
| `exportCompanyData` | DSGVO-Export je Mandant (Einstellungen → Datensicherung) | nein |
| `datenAusleitung` | nächtliche Sicherung des ganzen Bestands an einen zweiten Ort | nein — **braucht Cloud Scheduler und einen Storage-Bucket** |
| `datenAusleitungJetzt` | dieselbe Sicherung von Hand, zum Prüfen | nein |
| `voiceExtract` | Sprache → strukturierte Einträge | **ja** — wird nur mit `ENABLE_VOICE=true` deployt |
| `bilanzNachziehen` | schreibt die Monatsbilanz eines Mitarbeiters neu, sobald sich eine Buchung ändert | nein |
| `bilanzenNachtlauf` | rechnet nachts den laufenden und den Vormonat neu (Selbstheilung) | nein — **braucht Cloud Scheduler** |
| `bilanzenNeuAufbauen` | einmaliger Erstaufbau, aus den Einstellungen aufrufbar | nein |
| `plattformAdminClaim` | setzt den Claim des globalen Administrators aus `platformAdmins/{uid}` | nein |
| `betriebAnlegen` | legt einen neuen Betrieb an — nur für den globalen Administrator | nein |

**`syncUserClaims` ist nicht optional.** Ohne diesen Trigger bekommt ein neu
angelegter Benutzer keine Berechtigungen: er kommt durch die Anmeldung, sieht
danach aber kein einziges Dokument. Die Benutzerverwaltung ist ohne ihn
faktisch wirkungslos.

Der Workflow läuft bei Änderungen an `functions/**` und von Hand.

**Voraussetzungen:**

1. **Blaze-Tarif** (Pay-as-you-go) in der Firebase Console. Functions v2 gibt
   es im kostenlosen Spark-Tarif nicht. Für einen Betrieb dieser Größe bleibt
   der Verbrauch im Freikontingent; ein Budget-Alarm unter *Abrechnung →
   Budgets und Warnungen* ist trotzdem zu empfehlen.

2. **Diese acht APIs aktivieren.** Das Dienstkonto darf sie benutzen, aber
   nicht selbst einschalten — das muss der Projektinhaber im Browser tun:
   `cloudfunctions`, `cloudbuild`, `artifactregistry`, `eventarc`, `run`,
   `secretmanager`, `cloudbilling` und `cloudscheduler`, jeweils unter
   `https://console.cloud.google.com/apis/library/<name>.googleapis.com`.

   `cloudscheduler` kam mit den Monatsbilanzen dazu: der nächtliche
   Selbstheilungs-Lauf ist eine zeitgesteuerte Function. Fehlt die API,
   scheitert der **gesamte** Functions-Deploy — auch der Bilanz-Trigger und
   der Erstaufbau, die mit dem Zeitplan nichts zu tun haben. Genau so ist der
   erste Deploy der Monatsbilanzen gescheitert. Der Workflow prüft das jetzt
   vorab und nennt den Link, statt mitten im Deploy abzubrechen.

   `cloudbilling` steht hier, weil der Deploy sie tatsächlich braucht und die
   Liste sie zunächst nicht nannte: Firebase prüft vor dem Anlegen der
   Functions, ob am Projekt ein Abrechnungskonto hängt — Functions v2 gibt es
   nur im Blaze-Tarif. Ohne die API kann es das nicht prüfen und bricht mit
   „Permissions denied enabling cloudbilling.googleapis.com" ab. Die Meldung
   klingt nach einem Rechteproblem des Dienstkontos und ist keins: es darf
   grundsätzlich keine APIs einschalten, und das soll auch so bleiben.

3. **Secrets nur für die KI-Spracherfassung.** Standardmäßig wird
   `voiceExtract` gar nicht mitdeployt, und dann braucht der Deploy auch
   keine Schlüssel.

   Das ist kein Zufall, sondern nötig: `extract.ts` deklariert seine
   Schlüssel per `defineSecret`, und Firebase löst das schon beim
   **Analysieren** des Codes auf, unabhängig von `--only`. Solange
   `voiceExtract` statisch exportiert war, liess ein fehlendes Secret den
   gesamten Deploy scheitern — auch den von `syncUserClaims`, ohne das kein
   neuer Benutzer Berechtigungen bekommt. Ein abgeschaltetes Nebenfeature
   blockierte damit die wichtigste Function der App.

   Gelöst über eine generierte Einstiegsdatei (`functions/scripts/
   voice-entry.mjs`, läuft als `prebuild`): `ENABLE_VOICE=true` beim Bauen
   nimmt den Export hinein, sonst bleibt er draußen. Ein bedingter
   *dynamischer* Import wäre der naheliegende Weg und funktioniert nicht —
   die Analyse braucht statische Exporte und meldet sonst „Functions codebase
   could not be analyzed successfully".

   **Zum Einschalten:** `ANTHROPIC_API_KEY` und `TRANSCRIPTION_API_KEY` unter
   *Sicherheit → Secret Manager* anlegen (oder
   `firebase functions:secrets:set NAME`), dann den Workflow *Cloud Functions
   deployen* von Hand starten und „KI-Spracherfassung mitdeployen" ankreuzen.

4. **Zusätzliche IAM-Rollen** für das Dienstkonto, über die vom Hosting-Deploy
   hinaus: *Cloud Functions Admin*, *Service Account User*, *Cloud Build
   Editor*, *Artifact Registry Administrator*, *Eventarc Admin*,
   *Secret Manager Secret Accessor* und ***Cloud Scheduler-Administrator***.
   Functions v2 baut Container und hängt an Eventarc — ohne diese Rollen
   bricht der Deploy mit Berechtigungsfehlern ab.

   *Cloud Scheduler-Administrator* kam mit dem nächtlichen Lauf der
   Monatsbilanzen dazu. Die aktivierte API allein genügt nicht: das
   Dienstkonto muss den Zeitplan-Job auch anlegen und ändern dürfen. Fehlt
   die Rolle, deployen alle übrigen Functions sauber und nur die
   zeitgesteuerte scheitert mit

   ```
   403 … lacks IAM permission "cloudscheduler.jobs.update"
   ```

   Der Deploy meldet dann insgesamt einen Fehler, obwohl Trigger und
   Callable bereits live sind — die Meldung ist also enger zu lesen, als sie
   klingt.

5. **Drei Rollen für die Google-eigenen Dienstkonten.** Das ist die
   Voraussetzung, an der der Deploy zuletzt gescheitert ist:

   ```
   Failed to verify the project has the correct IAM bindings for a successful
   deployment. We failed to modify the IAM policy for the project.
   ```

   Firebase möchte diese Bindungen selbst setzen, darf es aber nicht — das
   verlangt *Project IAM Admin*, und die gehört einem Deploy-Dienstkonto
   nicht in die Hand. Deshalb einmalig vom Projektinhaber setzen, unter
   *IAM & Verwaltung → IAM → Zugriff erlauben*
   (`PROJEKTNUMMER` steht in der Fehlermeldung und in den Projekteinstellungen):

   | Hauptkonto | Rolle |
   | --- | --- |
   | `service-PROJEKTNUMMER@gcp-sa-pubsub.iam.gserviceaccount.com` | Service Account Token Creator |
   | `PROJEKTNUMMER-compute@developer.gserviceaccount.com` | Cloud Run Invoker |
   | `PROJEKTNUMMER-compute@developer.gserviceaccount.com` | Eventarc Event Receiver |

   Diese Konten entstehen erst, wenn die zugehörigen APIs aktiviert sind
   (Schritt 2). Sind sie in der Liste nicht zu sehen, oben
   *Von Google bereitgestellte Rollenzuweisungen einschließen* ankreuzen.

   Wer `gcloud` zur Hand hat, kann stattdessen die drei Befehle ausführen,
   die der fehlgeschlagene Lauf im Protokoll ausgibt.

6. **Für Push-Benachrichtigungen** in der Firebase Console unter *Cloud
   Messaging → Web-Push-Zertifikate* einen Schlüssel erzeugen und als
   Repository-Secret `VITE_FIREBASE_VAPID_KEY` hinterlegen. Fehlt er, läuft
   die App normal weiter und die Einstellungsseite sagt offen, dass der
   Dienst noch nicht eingerichtet ist.

7. Für `voiceExtract` die echten Schlüssel eintragen — Transkription über
   OpenAI Whisper, Extraktion über Claude. Beides US-Anbieter: für einen
   österreichischen Betrieb sind Auftragsverarbeitungsverträge und ein
   Hinweis an die Mitarbeiter nötig, weil Sprachaufnahmen den EU-Rahmen der
   übrigen App verlassen.

**Laufzeit:** `nodejs22`. Node 20 wurde am 30.04.2026 abgekündigt und wird
am 30.10.2026 abgeschaltet.

**Kostenbremse:** jede Function hat ein `maxInstances`-Limit
(`syncUserClaims` und die beiden Benachrichtigungen 10, `voiceExtract` 5,
`exportCompanyData` 3). Ohne das könnte ein fehlerhafter Massenimport oder
wiederholtes Klicken beliebig viele Instanzen hochziehen — bei `voiceExtract`
mit Kosten bei einem externen Anbieter.

**Nach dem ersten Deploy:** bestehende Konten bekommen ihre Claims erst beim
nächsten Schreiben ihres `users`-Dokuments. Einmal in der Benutzerverwaltung
öffnen und speichern genügt.

### Einmalig einzurichten

**1. Dienstkonto anlegen** (Google Cloud Console → IAM & Verwaltung →
Dienstkonten → Schlüssel erstellen → JSON). Rollen: *Firebase Hosting Admin*,
*Cloud Datastore Owner* (für die Regeln) und *Firebase Rules Admin*.
Bequemer geht es mit der CLI, die das Konto samt Rechten selbst anlegt:

```bash
firebase init hosting:github
```

**2. Repository-Secrets setzen** unter *Settings → Secrets and variables →
Actions → New repository secret*:

| Secret | Inhalt |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | der komplette Inhalt der JSON-Schlüsseldatei |
| `VITE_FIREBASE_API_KEY` | aus der Firebase Console → Projekteinstellungen |
| `VITE_FIREBASE_AUTH_DOMAIN` | ebenda |
| `VITE_FIREBASE_PROJECT_ID` | ebenda (dient zugleich als Deploy-Ziel) |
| `VITE_FIREBASE_STORAGE_BUCKET` | ebenda |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ebenda |
| `VITE_FIREBASE_APP_ID` | ebenda |

Optional als *Variable* (nicht Secret): `VITE_FUNCTIONS_REGION` (Vorgabe
`europe-west3`).

`VITE_PORTAL_NAME` und `VITE_PORTAL_LOGO` gibt es nicht mehr. Über dem
Anmeldebildschirm steht die Marke des Produkts — Senklot —, nicht der Name
eines Betriebs: vor der Anmeldung ist der Mandant unbekannt, und die Vorgabe
zeigte deshalb jedem zweiten Kunden das Zeichen des ersten.

Ab der ersten Seite nach der Anmeldung steht dort der BETRIEB: sein
hinterlegtes Logo (Einstellungen → Firmendaten), und wenn keines hinterlegt
ist, sein Name als Schriftzug. **Kein Ersatzbild und erst recht nicht das Logo
eines anderen Kunden** — genau das tat die alte Vorgabe. Eine Bauzeit-Variable
wäre dafür ohnehin der falsche Ort gewesen: sie bedeutet einen eigenen Build je
Betrieb, also das Gegenteil von Mehrmandantenbetrieb. Die Produktmarke steht
klein am Fuss der Seitenleiste, damit der Support ein Wort hat.

Die `VITE_FIREBASE_*`-Werte sind technisch nicht geheim — sie stehen ohnehin
im ausgelieferten JavaScript, und Firebase schützt die Daten über die
Security Rules, nicht über den Schlüssel. Sie liegen hier trotzdem als
Secrets, damit alles an einer Stelle steht. **Die JSON-Schlüsseldatei ist
dagegen echt geheim** und gehört niemals in einen Commit.

### Ablauf

- **Pull Request:** Typprüfung, Lint, die hermetischen Prüfungen und die
  Rules-Tests; dazu die Migrationen von null an mit den Prüfungen gegen die
  echte Datenbank, und der **Durchklick** — die App im echten Browser auf den
  vier Wegen, an denen Geld oder Arbeitszeit hängt. Kein Deploy.
- **Push auf `main`:** dieselben Prüfungen, danach Build und Deploy.
- **Von Hand:** *Actions → „Test und Deploy" → Run workflow*.

Zahlen stehen hier bewusst keine: sie veralten schneller, als sie jemand
nachträgt, und eine falsche Zahl im README ist schlechter als keine. Was
wirklich lief, steht im Protokoll des Laufs.

Örtlich:

| Befehl | Was er prüft |
| --- | --- |
| `npm test` | Bausteine, ohne Stapel — läuft überall |
| `npm run supabase:test` | die Datenschicht gegen die echte Datenbank (`npm run stack` zuerst) |
| `npm run durchklick` | die vier Wege im Browser (Stapel nötig) |

Der Durchklick holt sich beim ersten Mal einen Browser (`npx playwright
install chromium`). Liegt auf dem Rechner schon einer, zeigt `CHROMIUM_PFAD`
darauf und der Download entfällt.

Fehlt ein Secret, bricht der Deploy mit einer Klartextmeldung ab, bevor
irgendetwas veröffentlicht wird. Das ist Absicht: `npm run build` läuft auch
ohne Konfiguration durch — die Lücke fiele sonst erst im Browser des Kunden
auf, mit „Firebase-Konfiguration fehlt" auf weißer Seite.

## Mandantensicherheit (Spec §7)

- `companyId` liegt auf **jedem** Dokument und wird serverseitig aus dem
  Auth-Kontext gesetzt (`lib/db/core.ts`), nie aus Client-Eingabe.
- `companyId` + `role` stehen als **Custom Auth Claims** im Token, gesetzt vom
  Firestore-Trigger `syncUserClaims`. `firestore.rules` prüft jeden Zugriff
  gegen diese Claims.
- Isolations-Nachweis (Firma B sieht kein Dokument von Firma A):

```bash
npm run emulators       # in einem Terminal (Firestore-Emulator auf Port 8080)
npm run rules:test      # in einem zweiten Terminal
```

## Phasen-Status (Spec §8)

- ✅ **Phase 0 — Fundament:** Vite/React/TS, Firebase aus ENV, Auth + Rollen-Guard,
  Layout/Navigation, Komponentenbasis, Tailwind-Build, Kaspersky-Script entfernt.
- ✅ **Phase 1 — Mandantensicherheit:** `companyId`, `firestore.rules` + Tests,
  `companies`-Branding (`lib/tenant.ts`).
- ✅ **Phase 2 — Vertikaler Schnitt:** Zeiterfassung (Erfassen → Firestore → Liste
  + portierter Überstunden-Saldo inkl. AT-Feiertagslogik).
- ✅ **Phase 3 — KI-Magic-Moment:** Aufnahme → Cloud Function (Transkription +
  Extraktion) → editierbare Bestätigungskarten → echte Schreibvorgänge.
- ⏳ **Phase 4 — iterativ:** Material/Bestellung, Baustellen, Einsatzplanung,
  Rechnungen, Buchhaltung (als Platzhalter vorbereitet, Datenmodell steht).

## DSGVO (Spec §10)

- Datenregion EU (`europe-west3`) für Firestore-Zugriffe und Functions.
- Sprachdaten werden serverseitig verarbeitet und **nicht** dauerhaft gespeichert;
  im Aufnahme-Flow transparent gemacht.
- Datenexport pro Mandant via Cloud Function `exportCompanyData` (nur GF/Admin),
  erreichbar unter Einstellungen → Datensicherung.
- Nächtliche Ausleitung des kompletten Bestands (`daten-ausleitung`, 02:30,
  angestossen von `pg_cron`). Sie schreibt **immer** in den Speicher des
  eigenen Projekts (`AUSLEITUNG_EIMER`) — das hilft gegen einen Fehlgriff —,
  und **zusätzlich ausser Haus**, sobald ein Zielspeicher eingerichtet ist.
  Erst das hilft gegen den Verlust des Zugangs.

  Der Zielspeicher ist ein S3-kompatibler Eimer bei einem anderen Anbieter
  (eingerichtet mit Google Cloud Storage; derselbe Code trägt auch zu R2 oder
  Wasabi). Fünf Secrets in den Edge Functions, alle oder keines:

  | Name | Beispiel |
  | --- | --- |
  | `SICHERUNG_S3_ENDPUNKT` | `https://storage.googleapis.com` |
  | `SICHERUNG_S3_REGION` | `auto` |
  | `SICHERUNG_S3_EIMER` | `senklot-ausleitung-perl` |
  | `SICHERUNG_S3_SCHLUESSEL` | der Zugriffsschlüssel |
  | `SICHERUNG_S3_GEHEIMNIS` | das zugehörige Geheimnis |

  **Das Dienstkonto dort darf nur ANLEGEN** (`roles/storage.objectCreator`) —
  nicht lesen, nicht löschen, nicht überschreiben. Wer dieses Projekt
  übernimmt, hat damit einen Schlüssel, mit dem er die abgelegten Stände
  nicht vernichten kann; das ist der halbe Zweck der Übung. Weil nicht
  überschrieben werden darf, trägt der Pfad ausser Haus die Uhrzeit
  (`ausleitung/<betrieb>/<tag>/<hhmmss>.jsonl`), während im eigenen Projekt
  ein Stand JE TAG liegt.

  **Halb eingerichtet gilt als Fehler:** die Function antwortet mit 503 und
  nennt das fehlende Feld. Und **scheitert die Ablage ausser Haus, gilt der
  Lauf als gescheitert** — die Überwachung soll ausschlagen, wenn die
  Sicherung ausbleibt. Ist gar kein Ziel eingerichtet, ist das etwas
  anderes: eine benannte Lücke, und der Lauf gilt als erfolgreich.

  **Die Fotos am Handwerksschein gehen mit** — aber nur ausser Haus. Sie
  liegen bereits im Speicher dieses Projekts; sie in den Eimer nebenan zu
  kopieren verdoppelte den Platz und schützte gegen nichts. Ohne
  eingerichteten Zielspeicher geschieht also nichts, und das ist eine
  benannte Lücke, keine ausgelassene Arbeit.

  | Name | Vorgabe | Wofür |
  | --- | --- | --- |
  | `AUSLEITUNG_DATEIEN_JE_LAUF` | `200` | Dateien je Lauf |
  | `AUSLEITUNG_DATEIEN_BYTES_JE_LAUF` | `67108864` (64 MB) | Bytes je Lauf |

  Die Grenzen sind da, weil eine Edge Function eine Wanduhr hat: ein Betrieb
  mit Jahren an Fotos bräche sonst in jeder Nacht an derselben Stelle ab. So
  arbeitet sich der Rückstand Nacht für Nacht ab, und die Ansicht sagt, wie
  viele noch fehlen.

  Welche Datei schon draussen liegt, führt `ausleitung_dateien` Buch — das
  Dienstkonto dort darf ja nicht nachsehen. Die Tabelle trägt `company_id`
  und geht damit selbst mit in die Sicherung. Welche Eimer überhaupt
  mitgehen, steht in `app.datei_eimer()`, und jeder Eimer muss dort stehen,
  mit `true` oder mit `false`: `tests/supabase/ausleitungDateien.test.ts`
  fällt, wenn ein neuer Eimer niemandem eine Entscheidung abverlangt hat.

  `AUSLEITUNG_ZIEL_EXTERN` gibt es nicht mehr. Die Variable setzte **nur die
  Meldung** in der Überwachung und bewegte keine Datei — eingeschaltet legte
  sie den ehrlichen Hinweis still, ohne dass etwas ausser Haus lag. Gemeldet
  wird jetzt, was wirklich geschah.
  (`AUSLEITUNG_BUCKET` gehörte zum alten Firebase-Weg in `functions/`.)

- **Der Rücklauf** (`scripts/ruecklauf.mjs`): aus einer Sicherungsdatei wird
  wieder ein Betrieb. Eine Sicherung, die nie zurückgespielt wurde, ist keine;
  `tests/supabase/ruecklauf.test.ts` geht den Weg bei jedem Prüflauf einmal
  ganz durch — ausleiten, Betrieb löschen, zurückspielen, vergleichen.

  ```
  RUECKLAUF_URL=https://<projekt>.supabase.co \
  RUECKLAUF_DIENSTSCHLUESSEL=<service_role des ZIELS> \
    node scripts/ruecklauf.mjs stand.jsonl            # nur nachsehen
    node scripts/ruecklauf.mjs stand.jsonl --schreiben # wirklich einspielen
  ```

  **Ein Werkzeug für die Hand und keine Edge Function.** Der Ernstfall ist
  „das Projekt ist weg" — eine Function IN diesem Projekt wäre dann ebenfalls
  weg. Der Trockenlauf ist die Vorgabe, und in ein Ziel, in dem es den Betrieb
  schon gibt, schreibt das Werkzeug gar nicht erst.

  **Die Anmeldekonten stehen NICHT in der Sicherung** — sie tragen kein
  `company_id` und fallen aus der Ausleitung heraus. Der Rücklauf baut sie aus
  den Profilen neu, unter derselben Kennung; damit lösen sich alle
  Fremdschlüssel wieder auf. Betrieb, Rolle und Zustand setzt dabei der
  Auslöser `users_ansprueche` aus der Profilzeile, nicht das Werkzeug.
  **Die Passwörter kommen nicht zurück** (sie stehen als Hash in `auth.users`):
  jeder Zugang braucht danach einmal „Passwort vergessen".

  **Die Dateien holt der Rücklauf NICHT** — und das liegt nicht an ihm.
  Das Dienstkonto im Zielspeicher darf nur anlegen; mit seinem Schlüssel
  lässt sich nichts herunterladen. Wer wiederherstellt, holt die Fotos unter
  `dateien/<betrieb>/<eimer>/…` mit seinem EIGENEN Zugang aus dem Eimer und
  legt sie unter demselben Objektnamen in den Speicher des neuen Projekts.
  Der Name ist unverändert geblieben, Zeichen für Zeichen — er steht in der
  Prüfsumme des Scheins, und nur deshalb lässt sich ein unterschriebener
  Beleg danach noch nachrechnen.
