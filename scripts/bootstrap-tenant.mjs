// Erstanlage eines Mandanten samt erstem Zugang — für die ECHTE Datenbank,
// nicht für die Emulatoren (dafür ist seed-demo.mjs da).
//
// Warum es dieses Skript braucht: Benutzer legt normalerweise die
// Geschäftsführung in der App an. Beim allerersten Mal gibt es aber noch
// keine Geschäftsführung, die das dürfte — Henne und Ei. Dieses Skript
// umgeht die Security Rules mit Admin-Rechten und durchbricht den Ring
// genau einmal.
//
// Es setzt bewusst KEIN Passwort. Der Zugang wird über „Passwort vergessen?"
// auf dem Anmeldebildschirm freigeschaltet — so läuft kein Geheimnis durch
// ein Protokoll, das später jeder mit Repo-Zugriff lesen kann.
//
// Aufruf (Umgebungsvariablen):
//   ADMIN_EMAIL=... ADMIN_NAME=... COMPANY_NAME=... COMPANY_ID=...
//   GOOGLE_APPLICATION_CREDENTIALS=/pfad/zum/dienstkonto.json
//   node scripts/bootstrap-tenant.mjs
//
// Mehrfach ausführbar: bestehende Firmen- und Nutzerdaten werden ergänzt,
// nicht überschrieben.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const email = (process.env.ADMIN_EMAIL ?? '').trim();
const name = (process.env.ADMIN_NAME ?? '').trim() || 'Administrator';
const companyName = (process.env.COMPANY_NAME ?? '').trim() || 'Perl Installationen GmbH';
const companyId = (process.env.COMPANY_ID ?? '').trim() || 'perl';
const role = (process.env.ADMIN_ROLE ?? '').trim() || 'Administrator';

const ROLES = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Geschäftsführung', 'Administrator'];

// Eine Adresse ohne @ nimmt Firebase ohnehin nicht an — hier scheitern heißt,
// mit einer klaren Meldung zu scheitern statt mit „auth/invalid-email".
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`FEHLER: "${email}" ist keine gültige E-Mail-Adresse (fehlt das @?).`);
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`FEHLER: Rolle "${role}" ist unbekannt. Erlaubt: ${ROLES.join(', ')}`);
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FEHLER: Dieses Skript ist für die echte Datenbank. Für die Emulatoren seed-demo.mjs nehmen.');
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault() });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log(`Mandant : ${companyName} (${companyId})`);
  console.log(`Zugang  : ${email} als ${role}`);
  console.log('');

  // 1) Firmendokument. merge, damit ein erneuter Lauf gepflegte Sätze und
  //    Rechnungsstammdaten nicht wieder auf die Vorgaben zurücksetzt.
  const companyRef = db.collection('companies').doc(companyId);
  const existing = await companyRef.get();
  if (existing.exists) {
    console.log('• Firma besteht bereits — Stammdaten bleiben unangetastet.');
  } else {
    await companyRef.set({
      name: companyName,
      brandColor: '#003366',
      brandForeground: '#ffffff',
      accentColor: '#d51f26',
      accentForeground: '#ffffff',
      rates: {
        fach: 65,
        helper: 45,
        nightSurcharge: 0.5,
        emergencySurcharge: 1,
        vatRate: 0.2,
        dueDays: 14,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log('• Firma angelegt (Sätze auf Vorgabewerten, in den Einstellungen änderbar).');
  }

  // 2) Auth-Konto. Ohne Passwort: der Zugang wird über „Passwort vergessen?"
  //    freigeschaltet.
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`• Konto besteht bereits (uid ${user.uid}).`);
  } catch {
    user = await auth.createUser({ email, displayName: name, emailVerified: false });
    console.log(`• Konto angelegt (uid ${user.uid}), noch ohne Passwort.`);
  }

  // 3) Custom Claims. Normalerweise setzt sie der Trigger syncUserClaims —
  //    der ist eine Cloud Function und läuft nur, wenn die Functions
  //    deployed sind. Hier direkt gesetzt, damit die Anmeldung sofort
  //    funktioniert und nicht an fehlenden Rechten hängen bleibt.
  await auth.setCustomUserClaims(user.uid, { companyId, role });
  console.log(`• Berechtigungen gesetzt: companyId=${companyId}, role=${role}`);

  // 4) users/{uid} — per uid geschlüsselt, damit das Profil beim ersten
  //    Anmelden ohne Suchabfrage gefunden wird.
  const userRef = db.collection('users').doc(user.uid);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    await userRef.set({ companyId, role, active: true, email, name }, { merge: true });
    console.log('• Profil aktualisiert (Rolle, Firma, aktiv).');
  } else {
    await userRef.set({
      uid: user.uid,
      companyId,
      name,
      email,
      role,
      active: true,
      weeklyTargetHours: 40,
      yearlyVacationDays: 25,
      workDays: [1, 2, 3, 4, 5],
      initialOvertime: 0,
      appStartDate: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log('• Profil angelegt.');
  }

  console.log('');
  console.log('Fertig. Nächster Schritt für den Zugang:');
  console.log('  1. Anmeldeseite öffnen');
  console.log('  2. „Passwort vergessen?" anklicken');
  console.log(`  3. ${email} eintragen und Passwort per Mail setzen`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FEHLGESCHLAGEN:', err?.message ?? err);
    process.exit(1);
  });
