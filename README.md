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
