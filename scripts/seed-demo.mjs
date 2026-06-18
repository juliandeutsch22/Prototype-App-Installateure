// Seed-Skript für die lokale Demo gegen die Firebase-Emulatoren.
// Legt ZWEI Firmen an (Perl & Mustermann), je mit Nutzern, Projekten und
// Zeiteinträgen — auch nützlich, um die Mandanten-Isolation manuell zu prüfen.
//
// Voraussetzung: laufende Emulatoren (firebase emulators:start).
// Aufruf:  node scripts/seed-demo.mjs

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const app = initializeApp({ projectId: 'demo-installateur' });
const auth = getAuth(app);
const db = getFirestore(app);

async function makeUser({ email, password, name, role, companyId }) {
  let user;
  try {
    user = await auth.createUser({ email, password, displayName: name });
  } catch {
    user = await auth.getUserByEmail(email);
  }
  // Custom Claims (companyId + role) — Fundament der firestore.rules.
  await auth.setCustomUserClaims(user.uid, { companyId, role });
  // users-Dokument per uid geschlüsselt (users/{uid}).
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    companyId,
    name,
    email,
    role,
    active: true,
    weeklyTargetHours: 38.5,
    work_days: [1, 2, 3, 4, 5],
    initial_overtime: 2,
    app_start_date: '2026-01-01',
  });
  return user.uid;
}

async function seedCompany({ companyId, name, brandColor, projects }) {
  await db.collection('companies').doc(companyId).set({
    name,
    brandColor,
    brandForeground: '#ffffff',
    defaultVatRate: 0.2,
    createdAt: FieldValue.serverTimestamp(),
  });
  for (const p of projects) {
    await db.collection('projects').add({ companyId, ...p, createdAt: FieldValue.serverTimestamp() });
  }
}

async function main() {
  // Firma A — Perl
  await seedCompany({
    companyId: 'perl',
    name: 'Perl Installationen GmbH',
    brandColor: '#1d4ed8',
    projects: [
      { projectNumber: '2026-001', customerName: 'Familie Müller', address: 'Hauptstr. 1, Graz', status: 'Aktiv' },
      { projectNumber: '2026-002', customerName: 'Bäckerei Huber', address: 'Marktplatz 3, Graz', status: 'Aktiv' },
      { projectNumber: '2025-014', customerName: 'Hotel Alpenblick', address: 'Seeweg 7, Schladming', status: 'Pausiert' },
    ],
  });
  const perlUid = await makeUser({
    email: 'max@perl.at', password: 'demo1234', name: 'Max Mustermann',
    role: 'Mitarbeiter', companyId: 'perl',
  });
  await makeUser({
    email: 'chefin@perl.at', password: 'demo1234', name: 'Petra Perl',
    role: 'Geschäftsführung', companyId: 'perl',
  });

  // Beispiel-Zeiteinträge für Max (eine Woche)
  const days = ['2026-06-15', '2026-06-16', '2026-06-17'];
  for (const date of days) {
    await db.collection('timeEntries').add({
      companyId: 'perl', userId: perlUid, userName: 'Max Mustermann',
      date, status: 'Anwesend', startTime: '07:00', endTime: '16:30', breakDuration: 30,
      projectNumber: '2026-001', customerName: 'Familie Müller',
      comment: 'Heizungsmontage', isHelper: false, source: 'manual',
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Firma B — Mustermann (für Isolationsnachweis)
  await seedCompany({
    companyId: 'mustermann',
    name: 'Mustermann Haustechnik',
    brandColor: '#047857',
    projects: [{ projectNumber: 'M-001', customerName: 'Kunde B', address: 'Wien', status: 'Aktiv' }],
  });
  await makeUser({
    email: 'admin@mustermann.at', password: 'demo1234', name: 'Erika Mustermann',
    role: 'Administrator', companyId: 'mustermann',
  });

  console.log('Seed fertig.');
  console.log('  Mitarbeiter:      max@perl.at / demo1234');
  console.log('  Geschäftsführung: chefin@perl.at / demo1234');
  console.log('  Admin (Firma B):  admin@mustermann.at / demo1234');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
