# Installateur-App

Mandantenfähige Betriebssoftware für Installationsbetriebe (Zeiterfassung,
Material, Baustellen, Einsatzplanung, Rechnungen) mit einem **KI-Magic-Moment**:
Ein Mitarbeiter spricht ~15 Sekunden, daraus entstehen automatisch
strukturierte, bestätigbare Einträge (Zeit, Material, Folgetermin).

Diese Codebasis ist die Professionalisierung der monolithischen Einzeldatei
`perl-installateur-web-app.html` (~10.400 Zeilen) gemäß der Bau-Spec. Das
Datenmodell und die übernommene Geschäftslogik sind in
[`docs/LEGACY-ANALYSIS.md`](docs/LEGACY-ANALYSIS.md) dokumentiert.

## Stack

- **Frontend:** React + TypeScript (strict) + Vite, Tailwind als Build-Dependency
- **Backend/DB:** Firebase Firestore + Auth, Cloud Functions (Region `europe-west3`, DSGVO)
- **KI:** Transkription (Whisper-kompatibel) + Claude (`claude-opus-4-8`) — beides
  serverseitig, API-Schlüssel nie im Browser

## Projektstruktur

```
src/
  app/        Routing, Layout, Auth-/Rollen-Guard, AuthContext
  features/   time/ (vertikaler Schnitt), voice/ (KI), dashboard/, auth/
  lib/        firebase.ts (Config aus ENV), db/ (typisierte Firestore-Zugriffe),
              time.ts (Feiertage/Saldo), permissions.ts, tenant.ts, functions.ts
  components/ wiederverwendbare UI (Button, Card, Metric, Field, …)
  types/      zentrale Datentypen (companyId auf jedem Dokument)
functions/    Cloud Functions: Claims-Sync, KI-Extraktion, DSGVO-Export
firestore.rules   mandantensichere Security Rules (Custom Claims)
tests/        Rules-Tests (Mandanten-Isolation, Spec §7)
```

Regel: keine Datei über ~300 Zeilen; rohe Firestore-Aufrufe nur in `lib/db/`.

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

**Cloud Functions laufen über einen eigenen Workflow**
(`.github/workflows/deploy-functions.yml`) — siehe unten. Sie brauchen den
Blaze-Tarif und können Kosten auslösen, deshalb sollen sie nicht bei jeder
Änderung an der Oberfläche mitlaufen.

### Cloud Functions

Fünf Functions, alle in `europe-west3`:

| Function | Zweck | Braucht API-Schlüssel |
| --- | --- | --- |
| `syncUserClaims` | setzt `companyId` + Rolle als Auth-Claims | nein |
| `notifyNewOrder` | Push an Verwaltung/Leitung bei neuer Anforderung | nein |
| `notifyOrderReady` | Push an den Monteur, wenn Material bereitliegt | nein |
| `exportCompanyData` | DSGVO-Export je Mandant | nein |
| `voiceExtract` | Sprache → strukturierte Einträge | **ja** |

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

2. **Diese APIs aktivieren.** Das Dienstkonto darf sie benutzen, aber nicht
   selbst einschalten — das muss der Projektinhaber im Browser tun:
   `cloudfunctions`, `cloudbuild`, `artifactregistry`, `eventarc`, `run` und
   `secretmanager`, jeweils unter
   `https://console.cloud.google.com/apis/library/<name>.googleapis.com`.

3. **Beide Secrets anlegen — auch wenn die KI-Spracherfassung noch nicht
   genutzt wird.** Das ist keine Schikane: `extract.ts` deklariert seine
   Schlüssel per `defineSecret`, und Firebase löst das schon beim
   **Analysieren** des Codes auf, unabhängig von `--only`. Fehlt eines,
   scheitert der gesamte Deploy — auch `syncUserClaims`, das mit der KI
   nichts zu tun hat.

   `ANTHROPIC_API_KEY` und `TRANSCRIPTION_API_KEY` im Browser unter
   *Sicherheit → Secret Manager* anlegen oder per
   `firebase functions:secrets:set NAME`. Ein Platzhalterwert genügt,
   solange die Spracherfassung nicht benutzt wird.

4. **Zusätzliche IAM-Rollen** für das Dienstkonto, über die vom Hosting-Deploy
   hinaus: *Cloud Functions Admin*, *Service Account User*, *Cloud Build
   Editor*, *Artifact Registry Administrator*, *Eventarc Admin* und
   *Secret Manager Secret Accessor*. Functions v2 baut Container und hängt an
   Eventarc — ohne diese Rollen bricht der Deploy mit Berechtigungsfehlern ab.

5. **Für Push-Benachrichtigungen** in der Firebase Console unter *Cloud
   Messaging → Web-Push-Zertifikate* einen Schlüssel erzeugen und als
   Repository-Secret `VITE_FIREBASE_VAPID_KEY` hinterlegen. Fehlt er, läuft
   die App normal weiter und die Einstellungsseite sagt offen, dass der
   Dienst noch nicht eingerichtet ist.

6. Für `voiceExtract` die echten Schlüssel eintragen — Transkription über
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

Optional als *Variable* (nicht Secret): `VITE_PORTAL_NAME` (Name über dem
Anmeldebildschirm, Vorgabe „Perl Installationen") und `VITE_FUNCTIONS_REGION`
(Vorgabe `europe-west3`).

Die `VITE_FIREBASE_*`-Werte sind technisch nicht geheim — sie stehen ohnehin
im ausgelieferten JavaScript, und Firebase schützt die Daten über die
Security Rules, nicht über den Schlüssel. Sie liegen hier trotzdem als
Secrets, damit alles an einer Stelle steht. **Die JSON-Schlüsseldatei ist
dagegen echt geheim** und gehört niemals in einen Commit.

### Ablauf

- **Pull Request:** Typprüfung, Lint, 61 Unit-Tests, 21 Rules-Tests. Kein Deploy.
- **Push auf `main`:** dieselben Prüfungen, danach Build und Deploy.
- **Von Hand:** *Actions → „Test und Deploy" → Run workflow*.

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
- Datenexport pro Mandant via Cloud Function `exportCompanyData` (nur GF/Admin).
