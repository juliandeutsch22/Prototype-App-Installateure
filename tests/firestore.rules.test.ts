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
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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
function ctxA_gf() {
  return testEnv.authenticatedContext('gfA', { companyId: 'companyA', role: 'Geschäftsführung' });
}
function ctxA_pl() {
  return testEnv.authenticatedContext('plA', { companyId: 'companyA', role: 'Projektleiter' });
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

  // Die Claims-Function übernimmt `role` ungeprüft ins Auth-Token. Ein
  // Tippfehler würde den Nutzer dauerhaft aussperren, weil danach keine
  // Rollenregel mehr greift — deshalb serverseitige Whitelist.
  it('Administrator darf KEINEN Benutzer mit unbekannter Rolle anlegen', async () => {
    const db = ctxA_admin().firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'newUser'), {
        companyId: 'companyA',
        uid: 'newUser',
        name: 'Tippfehler',
        email: 'x@a.at',
        role: 'Geschaeftsfuehrung', // ohne Umlaut = ungültig
        active: true,
      }),
    );
  });

  // Zeiteinträge enthalten Krankenstände und Urlaub — Gesundheitsdaten nach
  // Art. 9 DSGVO. Ein Kollege darf sie nicht lesen können, auch nicht an der
  // Oberfläche vorbei.
  it('Mitarbeiter darf den Zeiteintrag eines KOLLEGEN nicht lesen', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries', 'fremd'), {
        companyId: 'companyA',
        userId: 'userA2', // ein anderer Mitarbeiter derselben Firma
        date: '2026-06-15',
        status: 'Krank',
      });
    });
    const db = ctxA_employee().firestore();
    await assertFails(getDoc(doc(db, 'timeEntries', 'fremd')));
  });

  it('Mitarbeiter darf den EIGENEN Zeiteintrag lesen', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries', 'eigen'), {
        companyId: 'companyA',
        userId: 'userA1',
        date: '2026-06-15',
        status: 'Anwesend',
      });
    });
    const db = ctxA_employee().firestore();
    await assertSucceeds(getDoc(doc(db, 'timeEntries', 'eigen')));
  });

  it('Buchhaltung darf fremde Zeiteinträge lesen (Lohnverrechnung)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries', 'fuerBuch'), {
        companyId: 'companyA',
        userId: 'userA1',
        date: '2026-06-15',
        status: 'Krank',
      });
    });
    const db = testEnv
      .authenticatedContext('buchA', { companyId: 'companyA', role: 'Buchhaltung' })
      .firestore();
    await assertSucceeds(getDoc(doc(db, 'timeEntries', 'fuerBuch')));
  });

  it('Mitarbeiter darf die Bestellung eines Kollegen nicht lesen', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'materialOrders', 'fremdeBestellung'), {
        companyId: 'companyA',
        userId: 'userA2',
        materialName: 'Therme',
        quantity: 1,
      });
    });
    const db = ctxA_employee().firestore();
    await assertFails(getDoc(doc(db, 'materialOrders', 'fremdeBestellung')));
  });

  it('Administrator darf einen Benutzer mit gültiger Rolle anlegen', async () => {
    const db = ctxA_admin().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'newUser2'), {
        companyId: 'companyA',
        uid: 'newUser2',
        name: 'Korrekt',
        email: 'y@a.at',
        role: 'Geschäftsführung',
        active: true,
      }),
    );
  });
});

describe('Firmen-Stammdaten und Verrechnungssätze', () => {
  it('Geschäftsführung darf die Sätze der eigenen Firma ändern', async () => {
    const db = testEnv
      .authenticatedContext('gfA', { companyId: 'companyA', role: 'Geschäftsführung' })
      .firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'companies', 'companyA'), {
        rates: { fach: 70, helper: 48, nightSurcharge: 0.6,
                 emergencySurcharge: 0.8, vatRate: 0.2, dueDays: 14 },
      }),
    );
  });

  it('Mitarbeiter darf die Sätze NICHT ändern', async () => {
    // Sonst könnte ein Monteur seinen eigenen Stundensatz hochsetzen.
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'companies', 'companyA'), { rates: { fach: 999 } }));
  });

  it('Firma B darf die Sätze von Firma A NICHT ändern', async () => {
    const db = ctxB_admin().firestore();
    await assertFails(updateDoc(doc(db, 'companies', 'companyA'), { rates: { fach: 1 } }));
  });

  it('Auch die Leitung darf ihre Firma nicht löschen', async () => {
    // Anlegen und Entfernen eines Mandanten bleibt dem Server vorbehalten.
    const db = ctxA_admin().firestore();
    await assertFails(deleteDoc(doc(db, 'companies', 'companyA')));
  });
});

describe('userPrefs — persönliche Einstellungen und Push-Tokens', () => {
  it('darf das eigene Dokument anlegen und lesen', async () => {
    const db = ctxA_employee().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'userPrefs', 'userA1'), {
        companyId: 'companyA',
        userId: 'userA1',
        notifyOrderReady: true,
        pushTokens: ['token-des-eigenen-telefons'],
      }),
    );
    await assertSucceeds(getDoc(doc(db, 'userPrefs', 'userA1')));
  });

  it('darf das Dokument eines KOLLEGEN nicht lesen', async () => {
    // Dort liegen Push-Tokens. Ein fremdes Token ist ein Kanal auf ein
    // fremdes Telefon — das darf nicht einmal innerhalb der Firma offen sein.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userPrefs', 'kollege'), {
        companyId: 'companyA',
        userId: 'kollege',
        pushTokens: ['fremdes-token'],
      });
    });
    const db = ctxA_employee().firestore();
    await assertFails(getDoc(doc(db, 'userPrefs', 'kollege')));
  });

  it('darf sich kein Token in ein fremdes Dokument schreiben', async () => {
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'userPrefs', 'kollege'), {
        companyId: 'companyA',
        userId: 'kollege',
        pushTokens: ['untergeschobenes-token'],
      }),
    );
  });

  it('auch der Administrator kommt nicht an fremde Tokens', async () => {
    // Bewusste Abweichung vom sonstigen Muster: bei userPrefs hilft die
    // Leitungsrolle nicht weiter, hier zählt nur die eigene Identität.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userPrefs', 'userA1'), {
        companyId: 'companyA',
        userId: 'userA1',
        pushTokens: ['token'],
      });
    });
    const db = ctxA_admin().firestore();
    await assertFails(getDoc(doc(db, 'userPrefs', 'userA1')));
  });

  it('Firma B kommt nicht an Einstellungen aus Firma A', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userPrefs', 'userA1'), {
        companyId: 'companyA',
        userId: 'userA1',
      });
    });
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'userPrefs', 'userA1')));
  });

  it('niemand darf Einstellungen loeschen', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userPrefs', 'userA1'), {
        companyId: 'companyA',
        userId: 'userA1',
      });
    });
    const db = ctxA_employee().firestore();
    await assertFails(deleteDoc(doc(db, 'userPrefs', 'userA1')));
  });
});

describe('Projektleitung — wie die Leitung, aber ohne Zeitkonten', () => {
  it('darf Baustellen anlegen', async () => {
    const db = ctxA_pl().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'projects', 'neu'), {
        companyId: 'companyA', projectNumber: '2026-100',
        customerName: 'Neu', status: 'Aktiv',
      }),
    );
  });

  it('darf Material pflegen', async () => {
    const db = ctxA_pl().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'materials', 'm-neu'), {
        companyId: 'companyA', name: 'Rohr', stock: 5,
      }),
    );
  });

  it('darf FREMDE Zeiteintraege NICHT lesen', async () => {
    // Der einzige Unterschied zur Geschaeftsfuehrung. Ueberstunden,
    // Krankenstaende und Urlaub eines Monteurs gehen die Projektleitung
    // nichts an — Krankenstaende sind Gesundheitsdaten nach Art. 9 DSGVO.
    const db = ctxA_pl().firestore();
    await assertFails(getDoc(doc(db, 'timeEntries', 'tA')));
  });

  it('darf fremde Zeiteintraege auch nicht anlegen', async () => {
    const db = ctxA_pl().firestore();
    await assertFails(
      setDoc(doc(db, 'timeEntries', 'fremd'), {
        companyId: 'companyA', userId: 'userA1', date: '2026-07-01', status: 'Anwesend',
      }),
    );
  });

  it('darf die eigene Zeit sehr wohl buchen', async () => {
    const db = ctxA_pl().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries', 'eigen'), {
        companyId: 'companyA', userId: 'plA', date: '2026-07-01', status: 'Anwesend',
      }),
    );
  });
});

describe('Administratoren verwaltet nur ein Administrator', () => {
  it('Geschaeftsfuehrung darf KEINEN Administrator anlegen', async () => {
    // Sonst koennte sie sich selbst zum Superuser machen.
    const db = ctxA_gf().firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'neuerAdmin'), {
        companyId: 'companyA', uid: 'neuerAdmin', name: 'X', email: 'x@a.at',
        role: 'Administrator', active: true,
      }),
    );
  });

  it('Geschaeftsfuehrung darf einen bestehenden Administrator nicht aendern', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'adminDoc'), {
        companyId: 'companyA', uid: 'adminDoc', name: 'Chef-Admin',
        email: 'a@a.at', role: 'Administrator', active: true,
      });
    });
    const db = ctxA_gf().firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'adminDoc'), {
        companyId: 'companyA', uid: 'adminDoc', name: 'Chef-Admin',
        email: 'a@a.at', role: 'Mitarbeiter', active: true,
      }),
    );
  });

  it('Administrator darf einen Administrator anlegen', async () => {
    const db = ctxA_admin().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'admin2'), {
        companyId: 'companyA', uid: 'admin2', name: 'Zweiter', email: 'z@a.at',
        role: 'Administrator', active: true,
      }),
    );
  });

  it('Geschaeftsfuehrung darf weiterhin normale Rollen vergeben', async () => {
    const db = ctxA_gf().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'monteur'), {
        companyId: 'companyA', uid: 'monteur', name: 'Monteur', email: 'm@a.at',
        role: 'Projektleiter', active: true,
      }),
    );
  });
});

describe('Rechnungszaehler — monoton und nur fuer Abrechnende', () => {
  /**
   * Der Zaehler ist die einzige Stelle, an der eine Rechnungsnummer entsteht.
   * Faellt seine Monotonie, entstehen zwei Rechnungen mit derselben Nummer.
   */
  async function seedCounter(seq: number) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: seq, year: 2026,
      });
    });
  }

  it('Buchhaltung darf den Zaehler anlegen und hochzaehlen', async () => {
    const db = testEnv
      .authenticatedContext('buchA', { companyId: 'companyA', role: 'Buchhaltung' })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 1001, year: 2026,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 1002, year: 2026,
      }),
    );
  });

  it('der Zaehler darf NICHT zurueckgesetzt werden', async () => {
    // Sonst kaeme eine bereits vergebene Nummer ein zweites Mal heraus.
    await seedCounter(1005);
    const db = ctxA_gf().firestore();
    await assertFails(
      setDoc(doc(db, 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 1004, year: 2026,
      }),
    );
    await assertFails(
      setDoc(doc(db, 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 1005, year: 2026,
      }),
    );
  });

  it('der Zaehler darf nicht geloescht werden', async () => {
    // Ein neu angelegter Zaehler begaenne wieder von vorne.
    await seedCounter(1005);
    await assertFails(deleteDoc(doc(ctxA_admin().firestore(), 'counters', 'companyA_invoices')));
  });

  it('ein Monteur kommt an den Zaehler nicht heran', async () => {
    await seedCounter(1005);
    const db = ctxA_employee().firestore();
    await assertFails(getDoc(doc(db, 'counters', 'companyA_invoices')));
    await assertFails(
      setDoc(doc(db, 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 9999, year: 2026,
      }),
    );
  });

  it('eine fremde Firma kommt an den Zaehler nicht heran', async () => {
    await seedCounter(1005);
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'counters', 'companyA_invoices')));
    await assertFails(
      updateDoc(doc(db, 'counters', 'companyA_invoices'), { lastSeq: 2000 }),
    );
  });
});
