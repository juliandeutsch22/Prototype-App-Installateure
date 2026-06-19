// Produktions-Bootstrap: legt die ERSTE Firma + den ersten Administrator an.
// Löst das Henne-Ei-Problem: Ohne bestehenden Admin kann niemand Nutzer mit
// Custom Claims anlegen. Dieses Skript läuft mit Admin-Rechten (Service Account)
// und setzt Firmen-/Nutzerdokument UND Custom Claims direkt.
//
// Voraussetzung: Service-Account-Schlüssel (Firebase Console > Projekt-
// einstellungen > Dienstkonten > Neuen privaten Schlüssel generieren).
//
// Aufruf (gegen das ECHTE Projekt, NICHT Emulator):
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
//   COMPANY_ID=perl COMPANY_NAME="Perl Installationen GmbH" \
//   ADMIN_EMAIL=chef@perl.at ADMIN_PASSWORD='EinSicheresPasswort!' \
//   BRAND_COLOR=#003366 ACCENT_COLOR=#e2001a \
//   node scripts/bootstrap-company.mjs
//
// Hinweis: Stelle sicher, dass FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST
// NICHT gesetzt sind, sonst schreibt das Skript in den Emulator.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const {
  COMPANY_ID,
  COMPANY_NAME,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BRAND_COLOR = '#003366',
  BRAND_FG = '#ffffff',
  ACCENT_COLOR = '#e2001a',
  ACCENT_FG = '#ffffff',
} = process.env;

if (!COMPANY_ID || !COMPANY_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Fehlend: COMPANY_ID, COMPANY_NAME, ADMIN_EMAIL, ADMIN_PASSWORD müssen gesetzt sein.');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Abbruch: Emulator-Variablen sind gesetzt — dieses Skript ist für PRODUKTION gedacht.');
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault() });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  // 1) Firma anlegen (Branding + Rechnungskopf-Defaults)
  await db.collection('companies').doc(COMPANY_ID).set(
    {
      name: COMPANY_NAME,
      brandColor: BRAND_COLOR,
      brandForeground: BRAND_FG,
      accentColor: ACCENT_COLOR,
      accentForeground: ACCENT_FG,
      defaultVatRate: 0.2,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`✓ Firma "${COMPANY_NAME}" (${COMPANY_ID}) angelegt.`);

  // 2) Auth-Konto anlegen (oder bestehendes verwenden)
  let user;
  try {
    user = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Administrator' });
    console.log(`✓ Auth-Konto ${ADMIN_EMAIL} angelegt.`);
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      user = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`• Auth-Konto ${ADMIN_EMAIL} existiert bereits — wird verwendet.`);
    } else {
      throw e;
    }
  }

  // 3) Custom Claims direkt setzen (robust, auch ohne deployte Function)
  await auth.setCustomUserClaims(user.uid, { companyId: COMPANY_ID, role: 'Administrator' });
  console.log('✓ Custom Claims gesetzt (companyId + role=Administrator).');

  // 4) users/{uid}-Profil schreiben (löst zusätzlich den syncUserClaims-Trigger aus)
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    companyId: COMPANY_ID,
    name: 'Administrator',
    email: ADMIN_EMAIL,
    role: 'Administrator',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✓ Benutzerprofil users/{uid} angelegt.');

  console.log('\nFertig. Anmeldung:');
  console.log(`  E-Mail:   ${ADMIN_EMAIL}`);
  console.log('  Passwort: (das gesetzte)');
  console.log('\nWichtig: Nach dem ersten Login ist der Admin sofort handlungsfähig.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Bootstrap fehlgeschlagen:', e);
    process.exit(1);
  });
