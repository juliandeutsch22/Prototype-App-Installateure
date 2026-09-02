# Firebase-Projekt anlegen & App deployen — Schritt für Schritt

Diese Anleitung führt vom leeren Firebase-Projekt bis zur laufenden,
mandantenfähigen App inkl. KI-Funktion. DSGVO-relevant: durchgängig
EU-Region (`europe-west3`, Frankfurt).

Voraussetzungen lokal: Node 20, `npm`, Firebase CLI
(`npm i -g firebase-tools`).

---

## 1 · Firebase-Projekt erstellen

1. [console.firebase.google.com](https://console.firebase.google.com) → **Projekt hinzufügen**.
2. Namen vergeben (z. B. `perl-installateur`). Google Analytics ist optional
   (für den Start nicht nötig).
3. Nach dem Anlegen: **Tarif auf „Blaze" (Pay-as-you-go) umstellen**
   (Zahnrad → Nutzung und Abrechnung). **Pflicht**, weil Cloud Functions den
   Blaze-Tarif brauchen. Es gibt ein großzügiges Gratis-Kontingent.

## 2 · Firestore anlegen (EU-Region!)

1. Build → **Firestore Database** → **Datenbank erstellen**.
2. Modus: **Production mode**.
3. **Standort: `europe-west3` (Frankfurt)** wählen. ⚠️ Der Standort ist
   **dauerhaft** und kann nicht geändert werden — hier nicht „nam5"/US lassen.

## 3 · Authentifizierung aktivieren

1. Build → **Authentication** → **Los geht's**.
2. Anmeldemethode **E-Mail/Passwort** aktivieren.

## 4 · Web-App registrieren & Config holen

1. Projektübersicht → **Web-App hinzufügen** (`</>`-Symbol), Namen vergeben.
2. Firebase zeigt das `firebaseConfig`-Objekt. Diese Werte brauchst du gleich
   für die `.env`.

## 5 · Repository vorbereiten

```bash
git clone <repo> && cd Prototype-App-Installateure
npm install
cd functions && npm install && cd ..

# Frontend-Config (NICHT committen)
cp .env.example .env
```

Trage in `.env` die Werte aus Schritt 4 ein:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<projektid>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<projektid>
VITE_FIREBASE_STORAGE_BUCKET=<projektid>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FUNCTIONS_REGION=europe-west3
VITE_USE_EMULATORS=false
```

## 6 · CLI mit dem Projekt verbinden

```bash
firebase login
firebase use --add        # das eben erstellte Projekt auswählen, Alias z. B. "default"
```

## 7 · KI-Schlüssel als Secrets hinterlegen

Die KI-Funktion braucht zwei Schlüssel (liegen **nur** serverseitig):

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY      # Claude-Extraktion
firebase functions:secrets:set TRANSCRIPTION_API_KEY  # Whisper-kompatible Transkription
```

Transkriptions-Endpunkt/-Modell sind keine Geheimnisse und stehen als Default
im Code (OpenAI Whisper). Für strenge DSGVO einen **EU-basierten STT-Anbieter
mit DPA** verwenden und in `functions/.env` überschreiben:

```
TRANSCRIPTION_URL=https://<eu-endpunkt>/v1/audio/transcriptions
TRANSCRIPTION_MODEL=whisper-1
```

> Ohne KI: Schritt 7 kann übersprungen werden. Dann ist nur der Sprach-Screen
> ohne Funktion — der Rest der App läuft vollständig.

## 8 · Rules & Functions deployen

```bash
# Functions bauen
cd functions && npm run build && cd ..

# Security Rules + Indizes + Functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Erfolgskontrolle: Es werden drei Functions in `europe-west3` deployt:
`syncUserClaims`, `voiceExtract`, `exportCompanyData`.

## 9 · Erste Firma + ersten Admin anlegen (Bootstrap)

Ohne bestehenden Admin kann niemand Nutzer mit Berechtigungen anlegen
(Henne-Ei). Das Bootstrap-Skript erledigt das einmalig mit Admin-Rechten.

1. **Service-Account-Schlüssel** holen: Console → ⚙️ Projekteinstellungen →
   **Dienstkonten** → **Neuen privaten Schlüssel generieren** → JSON speichern
   (z. B. `serviceAccount.json`, **nicht** committen).
2. Skript ausführen (gegen das echte Projekt):

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
COMPANY_ID=perl \
COMPANY_NAME="Perl Installationen GmbH" \
ADMIN_EMAIL=chef@perl.at \
ADMIN_PASSWORD='EinSicheresPasswort!' \
BRAND_COLOR=#003366 ACCENT_COLOR=#d51f26 \
node scripts/bootstrap-company.mjs
```

Das Skript legt das `companies/perl`-Dokument, das Auth-Konto, das
`users/{uid}`-Profil **und** die Custom Claims (`companyId` + `role=Administrator`)
an. Danach kann sich der Admin sofort anmelden und über die
**Benutzerverwaltung** weitere Mitarbeiter/Rollen anlegen.

> Alternative ohne Skript (manuell in der Console): Auth-Konto unter
> Authentication anlegen, dann in Firestore `companies/{id}` und `users/{uid}`
> (Feld `uid` = Auth-UID, `role` = `Administrator`, `companyId` = `{id}`) per
> Hand erstellen. Der `syncUserClaims`-Trigger setzt die Claims; danach einmal
> ab- und wieder anmelden, damit das Token die Claims enthält.

## 10 · Frontend bauen & hosten

```bash
npm run build
firebase deploy --only hosting
```

Die App ist dann unter `https://<projektid>.web.app` erreichbar.
(Alternativ lässt sich `dist/` auch bei Vercel/Netlify hosten — dann Schritt 10
überspringen.)

## 11 · Funktionstest in Produktion

1. Unter der Hosting-URL als Admin anmelden → Branding (Farben/Name) der Firma
   erscheint.
2. Benutzerverwaltung: einen Mitarbeiter anlegen → er bekommt eine
   Passwort-Mail; nach dem Setzen kann er sich anmelden.
3. Mit dem Mitarbeiter: Zeit buchen, Material bestellen.
4. KI-Erfassung: Mikrofon-Aufnahme → Bestätigungskarten. (Setzt Schritt 7
   voraus.)
5. Mandanten-Isolation: ggf. eine zweite Firma per Bootstrap anlegen und prüfen,
   dass sie keine Daten der ersten sieht.

---

## DSGVO-Checkliste (vor echtem Betrieb)

- ✅ Firestore + Functions in EU (`europe-west3`).
- ☐ **AV-Verträge**: Google (Firebase) und KI-/Transkriptionsanbieter sind
  Auftragsverarbeiter — Verträge abschließen; STT mit EU-Verarbeitung/DPA
  bevorzugen.
- ✅ Sprachdaten werden nach der Auswertung nicht dauerhaft gespeichert (im Code
  so umgesetzt), Verarbeitung im Aufnahme-Flow transparent gemacht.
- ✅ **Datenexport pro Mandant**: Cloud Function `exportCompanyData` (nur
  GF/Admin), erreichbar unter **Einstellungen → Datensicherung → Alle Daten
  herunterladen**. Sie führt alle sechzehn Sammlungen. Der Haken stand hier
  schon einmal — damals bei einer Function, die neun von sechzehn Sammlungen
  führte und die die App nirgends aufrief. Jetzt trägt er.
- ☐ **Zweiter Datenstandort**: `datenAusleitung` schreibt jede Nacht um 02:30
  den kompletten Bestand jedes Mandanten weg. **Ohne die Repository-Variable
  `AUSLEITUNG_BUCKET` landet er im Standard-Bucket DESSELBEN Projekts** — das
  hilft gegen einen Fehlgriff oder eine geleerte Sammlung, nicht gegen einen
  Ausfall des Projekts. Der Haken gehört gesetzt, wenn die Variable auf einen
  Bucket ausserhalb zeigt, besser ausserhalb von Google.

### Die nächtliche Datenausleitung einrichten

1. **Firebase Storage im Projekt aktivieren** (Konsole → Storage → Loslegen).
   Ohne Bucket scheitert der Lauf; der Functions-Deploy warnt vorab.
2. Dem Dienstkonto aus `FIREBASE_SERVICE_ACCOUNT` die Rolle **Storage Object
   Admin** auf dem Zielbucket geben.
3. Optional, aber der eigentliche Punkt: unter *Settings → Secrets and
   variables → Actions → Variables* die Variable **`AUSLEITUNG_BUCKET`** auf
   einen Bucket ausserhalb dieses Projekts setzen. Mit **`AUSLEITUNG_TAGE`**
   lässt sich die Aufbewahrung ändern (Vorgabe 30).
4. Nach dem Deploy einmal **Einstellungen → Datensicherung → Sicherung jetzt
   erstellen** drücken. Der Knopf sagt, wie viele Datensätze geschrieben
   wurden und wohin. Eine Sicherung, die niemand je ausgelöst hat, ist keine.

Der Stand liegt als `ausleitung/{companyId}/{JJJJ-MM-TT}.jsonl` — eine Zeile
je Dokument mit ihrer Sammlung. Aufbewahrt werden die letzten dreissig Stände,
**der jüngste immer**, auch wenn er älter ist: sonst stünde ein Betrieb, bei
dem die Ausleitung wochenlang scheitert, am Ende ohne jeden Stand da.
- ☐ Firmen-Stammdaten/Logo im `companies/{companyId}`-Dokument hinterlegen
  (Rechnungskopf): `addressLine`, `iban`, `bic`, `vatId` etc.

## Häufige Stolpersteine

- **Functions schlagen beim Deploy fehl** → Blaze-Tarif nicht aktiv (Schritt 1).
- **Login meldet „kein Profil"** → für die UID fehlt das `users/{uid}`-Dokument
  (Bootstrap, Schritt 9) oder die Claims sind noch nicht im Token → einmal neu
  anmelden.
- **„Missing or insufficient permissions"** → Rules nicht deployt (Schritt 8)
  oder das Konto hat keine Custom Claims (Bootstrap/erneut anmelden).
- **Region falsch** → Firestore-Standort lässt sich nicht ändern; im Zweifel
  neues Projekt mit `europe-west3` anlegen.
