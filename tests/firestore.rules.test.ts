import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Beweist das Akzeptanzkriterium aus Spec §7: Mit Test-Accounts zweier Firmen
 * kann Firma B kein Dokument von Firma A lesen oder ändern — auch nicht über
 * direkte Firestore-Anfragen unter Umgehung des UI.
 *
 * Voraussetzung: laufender Firestore-Emulator (npm run emulators) — sonst
 * werden die Tests übersprungen.
 *
 * companyId/role kommen aus Custom Auth Claims, exakt wie in Produktion.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

// Auth-Kontexte mit Custom Claims (companyId + role).
function ctxA_employee() {
  return testEnv.authenticatedContext('userA1', { companyId: 'companyA', role: 'Mitarbeiter' });
}
function ctxA_admin() {
  return testEnv.authenticatedContext('adminA', { companyId: 'companyA', role: 'Administrator' });
}
function ctxB_admin() {
  return testEnv.authenticatedContext('adminB', { companyId: 'companyB', role: 'Administrator' });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rules-test',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed: ein Projekt + ein Zeiteintrag für Firma A (unter Umgehung der Rules).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects', 'pA'), {
      companyId: 'companyA',
      projectNumber: '2024-001',
      customerName: 'Müller',
      status: 'Aktiv',
    });
    await setDoc(doc(db, 'timeEntries', 'tA'), {
      companyId: 'companyA',
      userId: 'userA1',
      date: '2026-06-18',
      status: 'Anwesend',
    });
    await setDoc(doc(db, 'companies', 'companyA'), { name: 'Firma A' });
  });
});

describe('Mandanten-Isolation', () => {
  it('Firma A darf eigene Projekte lesen', async () => {
    const db = ctxA_employee().firestore();
    await assertSucceeds(getDoc(doc(db, 'projects', 'pA')));
  });

  it('Firma B darf KEIN Projekt von Firma A lesen', async () => {
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'projects', 'pA')));
  });

  it('Firma B darf KEINEN Zeiteintrag von Firma A lesen', async () => {
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'timeEntries', 'tA')));
  });

  it('Firma B darf KEIN Firmendokument von Firma A lesen', async () => {
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'companies', 'companyA')));
  });

  it('Nicht angemeldet: kein Zugriff', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'projects', 'pA')));
  });
});

describe('Schreibregeln', () => {
  it('Mitarbeiter darf eigenen Zeiteintrag mit eigener companyId anlegen', async () => {
    const db = ctxA_employee().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries', 'new1'), {
        companyId: 'companyA',
        userId: 'userA1',
        date: '2026-06-18',
        status: 'Anwesend',
      }),
    );
  });

  it('Mitarbeiter darf KEINEN Eintrag mit fremder companyId schreiben', async () => {
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'timeEntries', 'bad1'), {
        companyId: 'companyB', // gefälscht
        userId: 'userA1',
        date: '2026-06-18',
        status: 'Anwesend',
      }),
    );
  });

  it('Mitarbeiter darf KEINEN Zeiteintrag für einen anderen Nutzer anlegen', async () => {
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'timeEntries', 'bad2'), {
        companyId: 'companyA',
        userId: 'someoneElse',
        date: '2026-06-18',
        status: 'Anwesend',
      }),
    );
  });

  it('Mitarbeiter darf KEIN Projekt anlegen (nur Leitung)', async () => {
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'projects', 'p2'), {
        companyId: 'companyA',
        projectNumber: '2024-002',
        customerName: 'Test',
        status: 'Aktiv',
      }),
    );
  });

  it('Administrator der Firma A darf ein Projekt anlegen', async () => {
    const db = ctxA_admin().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'projects', 'p3'), {
        companyId: 'companyA',
        projectNumber: '2024-003',
        customerName: 'Test',
        status: 'Aktiv',
      }),
    );
  });

  it('Mitarbeiter darf KEINE Rechnung lesen', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invoices', 'iA'), {
        companyId: 'companyA',
        invoiceNumber: 'RE-2026-1001',
      });
    });
    const db = ctxA_employee().firestore();
    await assertFails(getDoc(doc(db, 'invoices', 'iA')));
  });
});
