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
function ctxA_buch() {
  return testEnv.authenticatedContext('buchA', { companyId: 'companyA', role: 'Buchhaltung' });
}
function ctxA_verw() {
  return testEnv.authenticatedContext('verwA', { companyId: 'companyA', role: 'Verwaltung' });
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

/**
 * Urlaubsanträge.
 *
 * Die entscheidende Grenze ist, WER GENEHMIGT. Stünde sie nur in der
 * Oberfläche, könnte sich jeder Monteur seinen Urlaub per Konsole selbst
 * genehmigen — und weil eine Genehmigung die Urlaubstage ins Zeitkonto
 * schreibt, wäre das zugleich ein Weg, sich bezahlte Tage zu verschaffen.
 */
describe('Urlaub — beantragen darf jeder, entscheiden nicht', () => {
  const ANTRAG = {
    companyId: 'companyA',
    userId: 'userA1',
    userName: 'Monteur A',
    von: '2026-07-06',
    bis: '2026-07-10',
    tage: 5,
    status: 'Beantragt',
  };

  async function seedAntrag(extra: Record<string, unknown> = {}) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'vacations', 'uA'), { ...ANTRAG, ...extra });
    });
  }

  it('ein Monteur stellt einen Antrag fuer sich selbst', async () => {
    const db = ctxA_employee().firestore();
    await assertSucceeds(setDoc(doc(db, 'vacations', 'neu1'), ANTRAG));
  });

  it('aber nicht fuer jemand anderen', async () => {
    // Sonst koennte man einem Kollegen Urlaub eintragen, den er nie wollte.
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'vacations', 'neu2'), { ...ANTRAG, userId: 'userA2' }),
    );
  });

  it('und nicht gleich als genehmigt', async () => {
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'vacations', 'neu3'), { ...ANTRAG, status: 'Genehmigt' }),
    );
  });

  it('ein Monteur genehmigt seinen eigenen Urlaub NICHT', async () => {
    /**
     * Der Kern der ganzen Regel. Eine Genehmigung schreibt bezahlte Tage ins
     * Zeitkonto — sie selbst zu setzen waere bare Muenze.
     */
    await seedAntrag();
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('ein Monteur darf seinen offenen Antrag noch aendern', async () => {
    await seedAntrag();
    const db = ctxA_employee().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'vacations', 'uA'), { bis: '2026-07-09', tage: 4 }),
    );
  });

  it('aber nicht mehr, nachdem entschieden wurde', async () => {
    // Sonst waere „aendern" die Hintertuer zu einem laengeren Urlaub.
    await seedAntrag({ status: 'Genehmigt' });
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'vacations', 'uA'), { bis: '2026-07-31', tage: 20 }));
  });

  it('die Geschaeftsfuehrung genehmigt', async () => {
    await seedAntrag();
    const db = ctxA_gf().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'vacations', 'uA'), {
        status: 'Genehmigt',
        entschiedenVonUid: 'gfA',
      }),
    );
  });

  it('die Projektleitung SIEHT den Urlaub, entscheidet aber nicht', async () => {
    /**
     * Sehen muss sie ihn: wer den Urlaub eines Monteurs beim Einteilen nicht
     * sieht, plant ihn ein. Entscheiden ist Sache von Geschaeftsfuehrung,
     * Administration und Buchhaltung.
     */
    await seedAntrag();
    const db = ctxA_pl().firestore();
    await assertSucceeds(getDoc(doc(db, 'vacations', 'uA')));
    await assertFails(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('ein entschiedener Antrag wird nicht geloescht', async () => {
    // Er ist der Nachweis, dass entschieden wurde. Zurueckgenommen wird ueber
    // den Status „Storniert".
    await seedAntrag({ status: 'Genehmigt' });
    const db = ctxA_employee().firestore();
    await assertFails(deleteDoc(doc(db, 'vacations', 'uA')));
  });

  it('eine fremde Firma sieht den Antrag nicht', async () => {
    await seedAntrag();
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'vacations', 'uA')));
  });
});


/**
 * Wer Urlaub genehmigen darf, legt die Geschaeftsfuehrung in den Einstellungen
 * fest. Eine Genehmigung schreibt bezahlte Urlaubstage ins Zeitkonto — wer sie
 * aussprechen kann, entscheidet ueber Geld. Deshalb steht die Liste nicht nur
 * in der Oberflaeche, sondern wird hier durchgesetzt.
 */
describe('Urlaub — Genehmigende sind einstellbar', () => {
  const ANTRAG = {
    companyId: 'companyA',
    userId: 'userA1',
    userName: 'Monteur A',
    von: '2026-07-06',
    bis: '2026-07-10',
    tage: 5,
    status: 'Beantragt',
  };

  async function seed(genehmiger?: string[]) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'vacations', 'uA'), ANTRAG);
      await setDoc(doc(db, 'companies', 'companyA'), {
        name: 'Firma A',
        ...(genehmiger ? { vacationApprovers: genehmiger } : {}),
      });
    });
  }

  it('ohne Festlegung entscheidet die Buchhaltung wie bisher', async () => {
    /**
     * Wichtig fuer bestehende Betriebe: das Einfuehren dieser Einstellung darf
     * niemandem stillschweigend Rechte entzogen haben.
     */
    await seed();
    const db = ctxA_buch().firestore();
    await assertSucceeds(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('mit Festlegung entscheidet, wer daraufsteht — auch die Verwaltung', async () => {
    await seed(['verwA']);
    const db = ctxA_verw().firestore();
    await assertSucceeds(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('und die Buchhaltung dann NICHT mehr, wenn sie nicht daraufsteht', async () => {
    // Die Liste ersetzt den Ausgangszustand, sie ergaenzt ihn nicht.
    await seed(['verwA']);
    const db = ctxA_buch().firestore();
    await assertFails(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('die Geschaeftsfuehrung entscheidet IMMER, auch ausserhalb der Liste', async () => {
    /**
     * Waere sie abwaehlbar, koennte eine Fehleingabe den ganzen Betrieb
     * aussperren — und niemand koennte sie zuruecknehmen, weil auch das
     * Aendern der Liste der Leitung vorbehalten ist.
     */
    await seed(['verwA']);
    const db = ctxA_gf().firestore();
    await assertSucceeds(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('ein Monteur kommt auch mit Liste nicht an die Genehmigung', async () => {
    await seed(['verwA']);
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'vacations', 'uA'), { status: 'Genehmigt' }));
  });

  it('die Liste aendert nur die Geschaeftsfuehrung', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(ctxA_gf().firestore(), 'companies', 'companyA'), {
        vacationApprovers: ['verwA'],
      }),
    );
  });

  it('die Projektleitung aendert die Liste NICHT', async () => {
    /**
     * Sonst koennte sie sich selbst eintragen — und damit ueber die Urlaube
     * derer entscheiden, die sie einteilt.
     */
    await seed();
    await assertFails(
      updateDoc(doc(ctxA_pl().firestore(), 'companies', 'companyA'), {
        vacationApprovers: ['plA'],
      }),
    );
  });

  it('die Projektleitung aendert am Firmendokument gar nichts mehr', async () => {
    /**
     * Frueher galt die Grenze nur fuer die beiden ausgenommenen Felder, alles
     * Uebrige durfte die Projektleitung aendern — auch den STUNDENSATZ. Genau
     * die Ausnahmeliste war der Beleg, dass die Grenze eine Stufe zu weit
     * unten lag: sobald man einzelne Felder herausnehmen muss, gehoert das
     * ganze Dokument nicht in diese Hand.
     *
     * Der Reiter „Einstellungen" liess die Projektleitung ohnehin nie hinein.
     * Der Server aber schon — und der zaehlt.
     */
    await seed();
    await assertFails(
      updateDoc(doc(ctxA_pl().firestore(), 'companies', 'companyA'), { addressLine: 'Neu 1' }),
    );
  });
});


/**
 * Welche Module ein Betrieb benutzt, steht in `companies/{id}.modules`.
 *
 * Ein abgeschaltetes Modul ist ausdruecklich KEINE Sicherheitsgrenze — wer die
 * Rolle hat, duerfte die Daten ohnehin lesen. Die LISTE dagegen ist eine:
 * koennte sie jeder aendern, waere die Umfangsentscheidung der Leitung nur
 * eine Empfehlung. Und wer sich ein Modul selbst wieder einschaltet, umgeht
 * keine Rechte, aber eine betriebliche Anweisung.
 */
/**
 * Die Module — EINRICHTUNG, nicht Führung.
 *
 * Bis zum 07.09.2026 durfte die Geschäftsführung sie stellen. Aus dem Betrieb
 * kam die Ansage, dass das enger gehört, und das Argument überzeugt: Sätze,
 * Briefkopf und Bankverbindung sind ihr Tagesgeschäft. Die Modulliste
 * entscheidet dagegen, welche BEREICHE es überhaupt gibt — ein versehentlich
 * abgeschaltetes Modul nimmt allen den Weg zu ihrer Arbeit, und zwar
 * unsichtbar: der Reiter ist einfach weg, und niemand weiss, warum.
 *
 * Dass die Oberfläche den Reiter nur der Administration zeigt, ist eine
 * Bequemlichkeit. Die GRENZE steht hier.
 */
describe('Module stellt nur die Administration', () => {
  async function seed(module?: Record<string, boolean>) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'companies', 'companyA'), {
        name: 'Firma A',
        ...(module ? { modules: module } : {}),
      });
    });
  }

  it('der Administrator schaltet ein Modul ab', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(ctxA_admin().firestore(), 'companies', 'companyA'), {
        modules: { material: false },
      }),
    );
  });

  it('die Geschaeftsfuehrung NICHT', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'companies', 'companyA'), {
        modules: { material: false },
      }),
    );
  });

  it('die Projektleitung schaltet sich NICHTS frei', async () => {
    await seed({ material: false });
    await assertFails(
      updateDoc(doc(ctxA_pl().firestore(), 'companies', 'companyA'), {
        modules: { material: true },
      }),
    );
  });

  it('die Buchhaltung auch nicht', async () => {
    await seed({ rechnungen: false });
    await assertFails(
      updateDoc(doc(ctxA_buch().firestore(), 'companies', 'companyA'), {
        modules: { rechnungen: true },
      }),
    );
  });

  it('ein Monteur kommt an die Firmendaten ohnehin nicht', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'companies', 'companyA'), {
        modules: { material: false },
      }),
    );
  });

  it('eine fremde Firma aendert die Liste nicht', async () => {
    /**
     * Die Rolle allein genuegt nie: der Administrator von Firma B ist bei
     * Firma A niemand.
     */
    await seed();
    await assertFails(
      updateDoc(doc(ctxB_admin().firestore(), 'companies', 'companyA'), {
        modules: { material: false },
      }),
    );
  });

  it('auch nicht als Beifang in einem sonst erlaubten Schreibvorgang', async () => {
    /*
      Der Grund fuer `hasAny` statt `hasOnly`. Kaeme `modules` in einem
      Vorgang mit, der ansonsten erlaubt ist — etwa zusammen mit den
      Genehmigenden —, waere genau dieser Vorgang die Luecke.

      Der Test hiess vorher „die Leitung darf beide vorbehaltenen Felder in
      einem Zug setzen" und war richtig, solange beide derselben Grenze
      unterlagen. Seit die Module enger stehen, sagt derselbe Fall das
      Gegenteil.
    */
    await seed();
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'companies', 'companyA'), {
        modules: { ki: false },
        vacationApprovers: ['verwA'],
      }),
    );
  });

  it('die Geschaeftsfuehrung darf alles ANDERE weiterhin aendern', async () => {
    // Die Grenze soll die Module ziehen, nicht das Tagesgeschaeft lahmlegen.
    await seed();
    await assertSucceeds(
      updateDoc(doc(ctxA_gf().firestore(), 'companies', 'companyA'), {
        rates: { fach: 70 },
        addressLine: 'Musterstraße 1',
        vacationApprovers: ['verwA'],
      }),
    );
  });
});


/**
 * Benutzer anlegen und Rollen vergeben.
 *
 * Der Kommentar in den Regeln sagte immer „nur GF/Admin", die Regel liess aber
 * `isLeadership()` zu — und darin steckt die Projektleitung. Sie haette sich
 * damit selbst hochstufen koennen: wer Rollen vergibt, vergibt sie auch an
 * sich. Aufgefallen ist es beim Abgleich von Navigation und Routen, wo
 * dieselbe Grenze zum dritten Mal anders gezogen war.
 */
describe('Benutzerverwaltung — wer Rollen vergibt', () => {
  const NEU = {
    companyId: 'companyA',
    uid: 'neu1',
    name: 'Neuer Monteur',
    email: 'neu@a.at',
    role: 'Mitarbeiter',
    active: true,
  };

  it('die Geschaeftsfuehrung legt einen Benutzer an', async () => {
    await assertSucceeds(setDoc(doc(ctxA_gf().firestore(), 'users', 'neu1'), NEU));
  });

  it('die Projektleitung NICHT', async () => {
    // Sie plant Baustellen, sie vergibt keine Rechte.
    await assertFails(setDoc(doc(ctxA_pl().firestore(), 'users', 'neu1'), NEU));
  });

  it('die Projektleitung stuft auch niemanden hoch', async () => {
    /**
     * Der eigentliche Grund fuer die Grenze: haette sie das Recht, koennte sie
     * sich selbst zur Geschaeftsfuehrung machen und danach alles.
     */
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'plA'), {
        companyId: 'companyA',
        uid: 'plA',
        name: 'Projektleiter A',
        email: 'pl@a.at',
        role: 'Projektleiter',
        active: true,
      });
    });
    await assertFails(
      updateDoc(doc(ctxA_pl().firestore(), 'users', 'plA'), { role: 'Geschäftsführung' }),
    );
  });

  it('die Buchhaltung erst recht nicht', async () => {
    await assertFails(setDoc(doc(ctxA_buch().firestore(), 'users', 'neu1'), NEU));
  });

  it('lesen darf die Projektleitung weiterhin', async () => {
    // Sie braucht die Mitarbeiterliste zum Einteilen — nur aendern soll sie
    // dort nichts.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'neu1'), NEU);
    });
    await assertSucceeds(getDoc(doc(ctxA_pl().firestore(), 'users', 'neu1')));
  });

  it('einen Administrator legt nur ein Administrator an', async () => {
    // Unveraendert, aber hier festgehalten: die Hierarchie darf durch die
    // neue Grenze nicht verlorengegangen sein.
    await assertFails(
      setDoc(doc(ctxA_gf().firestore(), 'users', 'neu2'), { ...NEU, uid: 'neu2', role: 'Administrator' }),
    );
    await assertSucceeds(
      setDoc(doc(ctxA_admin().firestore(), 'users', 'neu2'), { ...NEU, uid: 'neu2', role: 'Administrator' }),
    );
  });
});

/**
 * Deaktivierte Konten.
 *
 * Deaktivieren war vorher eine Anzeigeeinstellung: geprüft wurde nur im
 * Browser. Ein ausgeschiedener Mitarbeiter behielt ein gültiges Konto mit
 * gültigen Claims und kam mit dem Firestore-SDK unverändert an alle Daten
 * seiner Firma. Diese Tests halten fest, dass der Server das entscheidet.
 */
describe('Deaktivierte Konten kommen an gar nichts', () => {
  function ctxA_deaktiviert() {
    return testEnv.authenticatedContext('userA1', {
      companyId: 'companyA',
      role: 'Mitarbeiter',
      active: false,
    });
  }
  function ctxA_aktiv() {
    return testEnv.authenticatedContext('userA1', {
      companyId: 'companyA',
      role: 'Mitarbeiter',
      active: true,
    });
  }

  it('liest die eigenen Zeiteintraege NICHT mehr', async () => {
    await assertFails(getDoc(doc(ctxA_deaktiviert().firestore(), 'timeEntries', 'tA')));
  });

  it('liest keine Baustellen und keine Firmendaten mehr', async () => {
    const db = ctxA_deaktiviert().firestore();
    await assertFails(getDoc(doc(db, 'projects', 'pA')));
    await assertFails(getDoc(doc(db, 'companies', 'companyA')));
  });

  it('schreibt auch nichts mehr', async () => {
    const db = ctxA_deaktiviert().firestore();
    await assertFails(
      setDoc(doc(db, 'timeEntries', 'neu'), {
        companyId: 'companyA', userId: 'userA1', date: '2026-06-19', status: 'Anwesend',
      }),
    );
  });

  it('das aktive Konto derselben Person arbeitet weiter', async () => {
    // Sonst prüfte der Test nur, dass irgendetwas fehlschlägt.
    await assertSucceeds(getDoc(doc(ctxA_aktiv().firestore(), 'timeEntries', 'tA')));
  });

  it('ein Token OHNE das Merkmal gilt als aktiv', async () => {
    /**
     * Der Bestandsschutz, und er ist kein Detail: bestehende Token tragen den
     * Claim nicht. Würde ein fehlendes Merkmal als „deaktiviert" gelesen,
     * spörrte der Deploy jeden aus, bis er sich neu angemeldet hat — an einem
     * Montagmorgen also den ganzen Betrieb.
     */
    await assertSucceeds(getDoc(doc(ctxA_employee().firestore(), 'timeEntries', 'tA')));
  });
});

/**
 * Einsatzplanung.
 *
 * Wer plant, entscheidet, wer am Montag wo steht. Das Ändern stand vorher
 * jedem Firmenangehörigen offen — begründet mit einem Feld, das es in der App
 * gar nicht gibt.
 */
describe('Einsatzplanung — planen darf nur die Leitung', () => {
  async function seedEinsatz() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assignments', 'aA'), {
        companyId: 'companyA',
        date: '2026-06-18',
        projectNumber: '2024-001',
        userId: 'userA2',
      });
    });
  }

  it('der Monteur sieht die Einteilung', async () => {
    await seedEinsatz();
    await assertSucceeds(getDoc(doc(ctxA_employee().firestore(), 'assignments', 'aA')));
  });

  it('der Monteur setzt sich NICHT selbst auf eine andere Baustelle', async () => {
    await seedEinsatz();
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'assignments', 'aA'), { userId: 'userA1' }));
    await assertFails(updateDoc(doc(db, 'assignments', 'aA'), { projectNumber: '2024-999' }));
  });

  it('der Monteur legt keine Einteilung an und loescht keine', async () => {
    await seedEinsatz();
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'assignments', 'neu'), {
        companyId: 'companyA', date: '2026-06-19', projectNumber: '2024-001', userId: 'userA1',
      }),
    );
    await assertFails(deleteDoc(doc(db, 'assignments', 'aA')));
  });

  it('die Projektleitung plant, anlegen bis loeschen', async () => {
    await seedEinsatz();
    const db = ctxA_pl().firestore();
    await assertSucceeds(updateDoc(doc(db, 'assignments', 'aA'), { projectNumber: '2024-002' }));
    await assertSucceeds(deleteDoc(doc(db, 'assignments', 'aA')));
  });
});

/**
 * Die Rüstliste zu einem Einsatz — zwei Schreiber, zwei Rechte.
 *
 * Sie sagt „nimm das mit", nicht „das muss besorgt werden". Geplant wird sie
 * von der Leitung; der Monteur hakt ab, was er eingeladen hat.
 *
 * DIE GEFÄHRLICHE STELLE ist genau diese Trennung. Dürfte der Monteur die
 * Liste ändern, könnte er sich das Material wegplanen, das er mitnehmen
 * soll — und niemand sähe, dass die Planung eine andere war. Deshalb steht
 * der Haken in einem EIGENEN Feld: nur so kann eine Regel „abgehakt" von
 * „Liste überschrieben" überhaupt unterscheiden.
 */
describe('Rüstliste — planen darf die Leitung, abhaken der Eingeteilte', () => {
  const KENNUNG = 'companyA_2026-06-18_2024-001';

  async function seedListe(uids: string[] = ['userA1']) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'einsatzMaterial', KENNUNG), {
        companyId: 'companyA',
        date: '2026-06-18',
        projectNumber: '2024-001',
        uids,
        positionen: [{ id: 'p1', name: 'Eckventil', menge: 3 }],
        geladen: {},
      });
    });
  }

  it('die fremde Firma kommt nicht heran', async () => {
    await seedListe();
    const db = ctxB_admin().firestore();
    await assertFails(getDoc(doc(db, 'einsatzMaterial', KENNUNG)));
    await assertFails(updateDoc(doc(db, 'einsatzMaterial', KENNUNG), { uids: ['adminB'] }));
  });

  it('die Projektleitung legt an, ändert und löscht', async () => {
    const db = ctxA_pl().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'einsatzMaterial', KENNUNG), {
        companyId: 'companyA',
        date: '2026-06-18',
        projectNumber: '2024-001',
        uids: ['userA1'],
        positionen: [{ id: 'p1', name: 'Eckventil', menge: 3 }],
        geladen: {},
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'einsatzMaterial', KENNUNG), {
        positionen: [{ id: 'p1', name: 'Eckventil', menge: 5 }],
      }),
    );
    await assertSucceeds(deleteDoc(doc(db, 'einsatzMaterial', KENNUNG)));
  });

  it('der eingeteilte Monteur hakt ab', async () => {
    await seedListe(['userA1']);
    const db = ctxA_employee().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'einsatzMaterial', KENNUNG), {
        'geladen.p1': { von: 'Max', am: 1750000000000 },
      }),
    );
  });

  it('der eingeteilte Monteur ändert die LISTE nicht', async () => {
    /**
     * Der Kern der Trennung. Was mitzunehmen ist, entscheidet die Planung —
     * sonst verschwände eine Position, und am Ende stünde der Monteur ohne
     * Teil auf der Baustelle, ohne dass jemand sagen könnte, wo es abhanden
     * kam.
     */
    await seedListe(['userA1']);
    const db = ctxA_employee().firestore();
    await assertFails(
      updateDoc(doc(db, 'einsatzMaterial', KENNUNG), { positionen: [] }),
    );
    await assertFails(updateDoc(doc(db, 'einsatzMaterial', KENNUNG), { uids: ['userA1', 'x'] }));
    // Auch nicht zusammen mit einem erlaubten Haken — sonst wäre die Regel
    // mit einem Beipack zu umgehen.
    await assertFails(
      updateDoc(doc(db, 'einsatzMaterial', KENNUNG), {
        'geladen.p1': { von: 'Max', am: 1 },
        positionen: [],
      }),
    );
  });

  it('ein NICHT eingeteilter Mitarbeiter hakt nichts ab', async () => {
    // Sonst könnte jeder in der Firma die Liste einer fremden Mannschaft als
    // eingeladen markieren — und die führe ohne ihr Material los.
    await seedListe(['userA2']);
    const db = ctxA_employee().firestore();
    await assertFails(
      updateDoc(doc(db, 'einsatzMaterial', KENNUNG), {
        'geladen.p1': { von: 'Max', am: 1 },
      }),
    );
  });

  it('der Monteur legt keine Liste an und löscht keine', async () => {
    await seedListe(['userA1']);
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'einsatzMaterial', 'companyA_2026-06-19_2024-001'), {
        companyId: 'companyA',
        date: '2026-06-19',
        projectNumber: '2024-001',
        uids: ['userA1'],
        positionen: [],
        geladen: {},
      }),
    );
    await assertFails(deleteDoc(doc(db, 'einsatzMaterial', KENNUNG)));
  });

  it('die Buchhaltung sieht die Liste, plant sie aber nicht', async () => {
    await seedListe();
    await assertSucceeds(getDoc(doc(ctxA_buch().firestore(), 'einsatzMaterial', KENNUNG)));
    await assertFails(
      updateDoc(doc(ctxA_buch().firestore(), 'einsatzMaterial', KENNUNG), { positionen: [] }),
    );
  });
});

/**
 * Das Verrechnet-Kennzeichen — wem es gehört.
 *
 * `isBilled` und `invoiceNumber` entscheiden, ob eine Stunde oder eine
 * Materialposition je auf eine Rechnung kommt: die Rechnungsstellung sammelt
 * nur, was NICHT verrechnet ist. Wer das Kennzeichen selbst setzen kann,
 * nimmt seine eigene Arbeitszeit aus der Verrechnung — still, ohne
 * Fehlermeldung, und niemandem fällt es auf, weil die Zeile im Zeitkonto
 * ganz normal weitersteht. Der Kunde zahlt sie nie.
 *
 * Gefunden beim Nachgehen des Materialstamm-Fundes: die Regel für FREMDE
 * Belege war dicht, die für die EIGENEN nicht. Über die Oberfläche ist das
 * nicht erreichbar — die Formulare schicken die beiden Felder überhaupt nie
 * mit. Über das SDK schon, und der Server zählt.
 *
 * DIE ZWEITE HÄLFTE DIESES BLOCKS IST DIE WICHTIGERE: dass der Riegel keinen
 * einzigen echten Arbeitsweg kostet. Genau diese Prüfung fehlte beim
 * Materialstamm, und deshalb tat dort ein Knopf drei Wochen lang nichts.
 */
describe('Verrechnet-Kennzeichen — setzt nur, wer abrechnet', () => {
  async function seedZeit() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries', 'zA'), {
        companyId: 'companyA', userId: 'userA1', date: '2026-09-01',
        status: 'Anwesend', startTime: '08:00', endTime: '16:30', breakDuration: 30,
        projectNumber: '2026-042',
      });
    });
  }

  async function seedAnforderung() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'materialOrders', 'aA'), {
        companyId: 'companyA', userId: 'userA1', materialId: 'mA',
        materialName: 'Kupferrohr 15mm', quantity: 2, status: 'Abholbereit',
        transactionType: 'order',
      });
    });
  }

  it('der Monteur setzt es an seinem EIGENEN Zeiteintrag NICHT', async () => {
    await seedZeit();
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'timeEntries', 'zA'), { isBilled: true }));
    await assertFails(updateDoc(doc(db, 'timeEntries', 'zA'), { invoiceNumber: 'RE-2026-0001' }));
  });

  it('der Monteur schmuggelt es nicht neben einer echten Korrektur mit', async () => {
    // Die Stelle, an der eine Feldgrenze bricht: erlaubt man die Korrektur,
    // geht das Kennzeichen daneben gleich mit durch.
    await seedZeit();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'timeEntries', 'zA'), {
        endTime: '17:00', isBilled: true,
      }),
    );
  });

  it('der Monteur legt keinen bereits verrechneten Eintrag an', async () => {
    await assertFails(
      setDoc(doc(ctxA_employee().firestore(), 'timeEntries', 'zNeu'), {
        companyId: 'companyA', userId: 'userA1', date: '2026-09-02',
        status: 'Anwesend', startTime: '08:00', endTime: '16:30', breakDuration: 30,
        isBilled: true,
      }),
    );
  });

  it('der Monteur setzt es auch an seiner eigenen Anforderung NICHT', async () => {
    await seedAnforderung();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'materialOrders', 'aA'), { isBilled: true }),
    );
  });

  it('die Buchhaltung setzt es — sie stellt die Rechnung', async () => {
    await seedZeit();
    await seedAnforderung();
    const db = ctxA_buch().firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'timeEntries', 'zA'), { isBilled: true, invoiceNumber: 'RE-2026-0001' }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'materialOrders', 'aA'), { isBilled: true, invoiceNumber: 'RE-2026-0001' }),
    );
  });

  it('die Buchhaltung gibt einen Storno auch wieder frei', async () => {
    // `releaseBilled` schreibt `isBilled: false` und eine leere Nummer.
    await seedZeit();
    await assertSucceeds(
      updateDoc(doc(ctxA_buch().firestore(), 'timeEntries', 'zA'), {
        isBilled: false, invoiceNumber: '',
      }),
    );
  });

  // --- und jetzt die Gegenprobe: was WEITER gehen muss --------------------

  it('der Monteur korrigiert seine Zeit unverändert', async () => {
    await seedZeit();
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'timeEntries', 'zA'), {
        endTime: '17:00', breakDuration: 45, comment: 'länger geworden',
      }),
    );
  });

  it('der Monteur bucht weiterhin eine neue Zeit', async () => {
    await assertSucceeds(
      setDoc(doc(ctxA_employee().firestore(), 'timeEntries', 'zNeu2'), {
        companyId: 'companyA', userId: 'userA1', date: '2026-09-03',
        status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30,
        source: 'manual',
      }),
    );
  });

  it('der Monteur bestätigt weiterhin seine Abholung', async () => {
    /**
     * GENAU DER WEG, DER BEIM MATERIALSTAMM DREI WOCHEN LANG TOT WAR. Was
     * „Abgeholt" schreibt: Status, das Verarbeitet-Kennzeichen, den
     * aufgelösten Katalogeintrag und den Zeitstempel.
     */
    await seedAnforderung();
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'materialOrders', 'aA'), {
        status: 'Erledigt', processed: true, materialId: 'mA', updatedAt: new Date(),
      }),
    );
  });

  it('der Monteur gibt weiterhin eine Anforderung auf', async () => {
    await assertSucceeds(
      setDoc(doc(ctxA_employee().firestore(), 'materialOrders', 'aNeu'), {
        companyId: 'companyA', userId: 'userA1', materialId: 'mA',
        materialName: 'Kupferrohr 15mm', quantity: 3, status: 'Offen',
        transactionType: 'order',
      }),
    );
  });

  it('die Buchhaltung korrigiert einen fremden Eintrag weiterhin', async () => {
    await seedZeit();
    await assertSucceeds(
      updateDoc(doc(ctxA_buch().firestore(), 'timeEntries', 'zA'), {
        endTime: '17:00', lastEditedByUid: 'buchA',
      }),
    );
  });
});

/**
 * Materialstamm — und die Trennung, die dabei wirklich gilt.
 *
 * DIE ERSTE FASSUNG DIESER REGEL WAR ZU ENG, und dieser Block hat den Irrtum
 * mit festgeschrieben: er behauptete, der Lagerstand werde ausschließlich
 * unter „Material → Lager" gebucht und dorthin komme nur Verwaltung oder
 * Leitung. Das stimmt nicht. Der Monteur bewegt den Bestand an zwei Stellen
 * seines Alltags:
 *
 *  - „Abgeholt" bei einer abholbereiten Anforderung zieht das Material ab,
 *  - eine Retoure in Originalverpackung schreibt es wieder gut.
 *
 * Beides läuft aus der App heraus, in einer Transaktion, unter SEINER
 * Anmeldung. Mit der zu engen Regel scheiterte diese Transaktion — und weil
 * sie beide Schreibvorgänge umfasst, blieb auch die Anforderung offen. Der
 * Monteur stand mit dem Material in der Hand vor einem Knopf, der nichts tat.
 *
 * Die Grenze läuft deshalb nicht zwischen den Rollen, sondern zwischen den
 * FELDERN: `stock` darf jeder im Betrieb bewegen, alles andere — Bezeichnung,
 * Preis, Artikelnummer, Kategorie — bleibt bei Verwaltung und Leitung.
 */
describe('Materialstamm — Bestand bewegt jeder, gepflegt wird er von der Verwaltung', () => {
  async function seedMaterial() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'materials', 'mA'), {
        companyId: 'companyA', name: 'Kupferrohr 15mm', stock: 12, price: 4.2,
      });
    });
  }

  it('der Monteur sieht den Katalog', async () => {
    await seedMaterial();
    await assertSucceeds(getDoc(doc(ctxA_employee().firestore(), 'materials', 'mA')));
  });

  it('der Monteur bucht seine Abholung vom Bestand ab', async () => {
    // Genau der Schreibvorgang, den „Abgeholt" auslöst.
    await seedMaterial();
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'materials', 'mA'), { stock: 9 }),
    );
  });

  it('der Monteur schreibt eine Retoure zurück', async () => {
    await seedMaterial();
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'materials', 'mA'), { stock: 15 }),
    );
  });

  it('der Monteur ändert die Bezeichnung NICHT', async () => {
    await seedMaterial();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'materials', 'mA'), { name: 'etwas anderes' }),
    );
  });

  it('der Monteur ändert den Preis NICHT', async () => {
    // Der Preis geht in jede Rechnung und in jedes Angebot ein.
    await seedMaterial();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'materials', 'mA'), { price: 0.01 }),
    );
  });

  it('der Monteur schmuggelt den Preis NICHT neben dem Bestand mit', async () => {
    /**
     * DIE STELLE, AN DER EINE FELDGRENZE ÜBLICHERWEISE BRICHT. Erlaubt man
     * „Bestand ändern", ist die naheliegende Regel „`stock` ist unter den
     * geänderten Feldern" — und darunter geht dann alles andere gleich mit
     * durch. Es muss `hasOnly` sein, nicht `hasAny`.
     */
    await seedMaterial();
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'materials', 'mA'), { stock: 9, price: 0.01 }),
    );
  });

  it('der Monteur legt kein Material an und löscht keines', async () => {
    await seedMaterial();
    const db = ctxA_employee().firestore();
    await assertFails(
      setDoc(doc(db, 'materials', 'm-neu2'), { companyId: 'companyA', name: 'Eigenes', stock: 1 }),
    );
    await assertFails(deleteDoc(doc(db, 'materials', 'mA')));
  });

  it('der fremde Betrieb bewegt den Bestand NICHT', async () => {
    // Die Feldgrenze lockert die Mandantengrenze nicht.
    await seedMaterial();
    await assertFails(updateDoc(doc(ctxB_admin().firestore(), 'materials', 'mA'), { stock: 0 }));
  });

  it('die Verwaltung pflegt den Katalog vollständig', async () => {
    await seedMaterial();
    const db = ctxA_verw().firestore();
    await assertSucceeds(updateDoc(doc(db, 'materials', 'mA'), { stock: 7 }));
    await assertSucceeds(updateDoc(doc(db, 'materials', 'mA'), { name: 'Kupferrohr 18mm', price: 5 }));
  });

  /*
    DER EINKAUFSPREIS IST DIE AUSNAHME IN DIESER AUSNAHME.

    Den Katalog pflegt die Verwaltung — alles ausser diesem einen Feld. Was
    der Betrieb im EINKAUF zahlt, ist die Kostenseite der Nachkalkulation und
    damit Margendaten; die sieht nicht einmal die Projektleitung. Die Grenze
    läuft also ein zweites Mal zwischen den FELDERN, diesmal quer durch eine
    Rolle, die sonst alles darf.

    WAS SIE NICHT KANN, und das gehört gesagt: das LESEN verhindern. Firestore
    gibt ein Dokument ganz oder gar nicht heraus, und den Katalog muss jeder
    im Betrieb lesen dürfen — der Monteur fordert daraus an. Wer direkt
    abfragt, sieht das Feld. Geschützt ist das Ändern.
  */
  it('die Verwaltung setzt den Einkaufspreis NICHT', async () => {
    await seedMaterial();
    await assertFails(
      updateDoc(doc(ctxA_verw().firestore(), 'materials', 'mA'), { einkaufspreis: 2.1 }),
    );
  });

  it('die Verwaltung schmuggelt ihn auch nicht neben der Bezeichnung mit', async () => {
    // Dieselbe Stelle, an der Feldgrenzen brechen: erlaubt ist „Katalog
    // pflegen", und darunter geht dann alles Übrige gleich mit durch.
    await seedMaterial();
    await assertFails(
      updateDoc(doc(ctxA_verw().firestore(), 'materials', 'mA'), {
        name: 'Kupferrohr 18mm', einkaufspreis: 2.1,
      }),
    );
  });

  it('die Verwaltung legt auch kein neues Material MIT Einkaufspreis an', async () => {
    // Beim Anlegen gibt es kein Vorher, gegen das sich diffen liesse — die
    // Regel muss dort auf das blosse Vorhandensein des Feldes schauen.
    await assertFails(
      setDoc(doc(ctxA_verw().firestore(), 'materials', 'm-ek'), {
        companyId: 'companyA', name: 'Eckventil', stock: 1, einkaufspreis: 3.5,
      }),
    );
  });

  it('die Projektleitung ebenfalls nicht — sie sieht keine Marge', async () => {
    await seedMaterial();
    const db = ctxA_pl().firestore();
    await assertFails(updateDoc(doc(db, 'materials', 'mA'), { einkaufspreis: 2.1 }));
    // Auch nicht auf dem Umweg über einen neuen Artikel: die Projektleitung
    // darf Material anlegen, nur eben ohne dieses Feld.
    await assertFails(
      setDoc(doc(db, 'materials', 'm-ek-pl'), {
        companyId: 'companyA', name: 'Eckventil', stock: 1, einkaufspreis: 3.5,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'materials', 'm-pl'), {
        companyId: 'companyA', name: 'Eckventil', stock: 1,
      }),
    );
  });

  it('die Geschäftsführung setzt ihn — beim Anlegen wie beim Ändern', async () => {
    await seedMaterial();
    const db = ctxA_gf().firestore();
    await assertSucceeds(updateDoc(doc(db, 'materials', 'mA'), { einkaufspreis: 2.1 }));
    await assertSucceeds(
      setDoc(doc(db, 'materials', 'm-ek2'), {
        companyId: 'companyA', name: 'Eckventil', stock: 1, einkaufspreis: 3.5,
      }),
    );
  });

  it('die Verwaltung pflegt weiter, was neben einem gesetzten Einkaufspreis steht', async () => {
    /*
      DER ALLTAGSFALL, an dem eine zu strenge Regel scheitern würde: der Chef
      hat 2,10 hinterlegt, die Verwaltung ändert die Bezeichnung. Solange sie
      den Wert nicht ANFASST, geht das — sonst wäre der Katalog für sie
      gesperrt, sobald der Chef einmal einen Preis eingetragen hat.
    */
    await seedMaterial();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'materials', 'mA'), { einkaufspreis: 2.1 });
    });
    await assertSucceeds(
      updateDoc(doc(ctxA_verw().firestore(), 'materials', 'mA'), { name: 'Kupferrohr 18mm' }),
    );
  });
});

/**
 * Rechnungen sind Belege. Gelöscht wird nur, was ohnehin storniert ist —
 * alles andere bleibt in den Büchern.
 */
/**
 * KEINE RECHNUNG WIRD GELOESCHT — auch die stornierte nicht.
 *
 * Vorher liess sich jede entfernen, dann nur noch die stornierte. Beides war
 * zu viel: § 132 BAO verlangt sieben Jahre Aufbewahrung, und die gezogene
 * Nummer hinterliesse eine Luecke im Kreis, die der Buchhaltungs-Export
 * danach zu Recht meldet — ohne dass noch jemand wuesste, warum.
 *
 * Der Storno ist die vorgesehene Korrektur: er bleibt stehen, traegt seinen
 * Grund und laesst sich wieder aufheben. Dass er selbst kein Loeschen ist,
 * prueft der letzte Fall hier.
 */
describe('Rechnungen — geloescht wird gar keine', () => {
  async function seedRechnungen() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'invoices', 'offen'), {
        companyId: 'companyA', invoiceNumber: 'RE-2026-1001', paymentStatus: 'Offen',
      });
      await setDoc(doc(db, 'invoices', 'storno'), {
        companyId: 'companyA', invoiceNumber: 'RE-2026-1002', paymentStatus: 'Storniert',
      });
    });
  }

  it('eine offene Rechnung bleibt stehen', async () => {
    await seedRechnungen();
    await assertFails(deleteDoc(doc(ctxA_buch().firestore(), 'invoices', 'offen')));
  });

  it('eine bezahlte auch', async () => {
    await seedRechnungen();
    const db = ctxA_buch().firestore();
    await assertSucceeds(updateDoc(doc(db, 'invoices', 'offen'), { paymentStatus: 'Bezahlt' }));
    await assertFails(deleteDoc(doc(db, 'invoices', 'offen')));
  });

  it('und die stornierte ebenfalls', async () => {
    // Der Fall, der vorher erlaubt war. Er ist der teuerste: eine stornierte
    // Rechnung sieht nach „erledigt" aus und ist trotzdem ein Beleg.
    await seedRechnungen();
    await assertFails(deleteDoc(doc(ctxA_buch().firestore(), 'invoices', 'storno')));
  });

  it('auch die Administration kommt nicht daran vorbei', async () => {
    await seedRechnungen();
    for (const ctx of [ctxA_admin(), ctxA_gf()]) {
      const db = ctx.firestore();
      await assertFails(deleteDoc(doc(db, 'invoices', 'storno')));
    }
  });

  it('stornieren geht weiter — das ist die Korrektur', async () => {
    await seedRechnungen();
    await assertSucceeds(
      updateDoc(doc(ctxA_buch().firestore(), 'invoices', 'offen'), {
        paymentStatus: 'Storniert',
        cancellationNote: 'Falsche Baustelle verrechnet',
      }),
    );
  });
});

/**
 * Angebotsnummern. Anders als der Rechnungskreis beginnt dieser zum
 * Jahreswechsel neu — und genau dieses Zugeständnis war vorher ein Loch:
 * erlaubt war jeder Wert über null, also auch ein kleinerer mitten im Jahr.
 */
describe('Angebotszaehler — steigend, Neubeginn nur zum Jahreswechsel', () => {
  async function seedAngebotszaehler(seq: number, jahr: number) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'counters', 'companyA_quotes'), {
        companyId: 'companyA', lastSeq: seq, year: jahr,
      });
    });
  }

  it('die Leitung zaehlt im laufenden Jahr hoch', async () => {
    await seedAngebotszaehler(7, 2026);
    await assertSucceeds(
      updateDoc(doc(ctxA_pl().firestore(), 'counters', 'companyA_quotes'), {
        lastSeq: 8, year: 2026,
      }),
    );
  });

  it('zurueck geht im laufenden Jahr NICHT', async () => {
    // Sonst bekaemen zwei Kunden dieselbe Angebotsnummer.
    await seedAngebotszaehler(7, 2026);
    const db = ctxA_pl().firestore();
    await assertFails(updateDoc(doc(db, 'counters', 'companyA_quotes'), { lastSeq: 3, year: 2026 }));
    await assertFails(updateDoc(doc(db, 'counters', 'companyA_quotes'), { lastSeq: 7, year: 2026 }));
  });

  it('zum Jahreswechsel beginnt er bei genau 1', async () => {
    await seedAngebotszaehler(42, 2026);
    await assertSucceeds(
      updateDoc(doc(ctxA_pl().firestore(), 'counters', 'companyA_quotes'), {
        lastSeq: 1, year: 2027,
      }),
    );
  });

  it('der Jahreswechsel ist kein Freibrief fuer irgendeine Zahl', async () => {
    await seedAngebotszaehler(42, 2026);
    await assertFails(
      updateDoc(doc(ctxA_pl().firestore(), 'counters', 'companyA_quotes'), {
        lastSeq: 500, year: 2027,
      }),
    );
  });

  it('der Rechnungskreis laeuft ueber den Jahreswechsel weiter', async () => {
    // Dort ist der Neubeginn ausdruecklich NICHT gewollt.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'counters', 'companyA_invoices'), {
        companyId: 'companyA', lastSeq: 1042, year: 2026,
      });
    });
    const db = ctxA_buch().firestore();
    await assertFails(updateDoc(doc(db, 'counters', 'companyA_invoices'), { lastSeq: 1, year: 2027 }));
    await assertSucceeds(
      updateDoc(doc(db, 'counters', 'companyA_invoices'), { lastSeq: 1043, year: 2027 }),
    );
  });
});

/**
 * Handwerksscheine — die Unveraenderbarkeit, jetzt nachgewiesen.
 *
 * Sie stand bisher nur in den Rules. Das genuegt, solange niemand daran
 * ruehrt; mit dem „Verwerfen" kommt aber eine zweite Bedingung in dieselbe
 * `allow update`-Zeile, und ein Test, der erst hinterher geschrieben wird,
 * beweist nur noch, dass der Code tut, was er tut.
 *
 * Die drei Zeilen, die der Betrieb wirklich braucht:
 *   – ein unterschriebener Schein bleibt, wie er ist,
 *   – geloescht wird gar nichts,
 *   – der aufgegebene Entwurf kommt zurueck, aber ohne Inhaltsaenderung.
 */
describe('Handwerksschein: verwerfen, zurueckholen, einfrieren', () => {
  const ENTWURF = {
    companyId: 'companyA',
    projectNumber: '2024-001',
    customerName: 'Müller',
    datum: '2026-06-18',
    status: 'Entwurf',
    abrechnung: 'Regie',
    zeiten: [{ datum: '2026-06-18', mitarbeiter: 'A', minuten: 60 }],
    material: [],
    erstelltVonUid: 'userA1',
    erstelltVonName: 'A',
  };

  async function seedSchein(daten: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'workSheets', 'sA'), { ...ENTWURF, ...daten });
    });
  }

  it('der Entwurf laesst sich verwerfen', async () => {
    await seedSchein({});
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'workSheets', 'sA'), {
        status: 'Verworfen',
        verworfenVonName: 'A',
      }),
    );
  });

  it('der verworfene Entwurf kommt zurueck', async () => {
    await seedSchein({ status: 'Verworfen', verworfenVonName: 'A' });
    await assertSucceeds(
      updateDoc(doc(ctxA_employee().firestore(), 'workSheets', 'sA'), { status: 'Entwurf' }),
    );
  });

  it('beim Zurueckholen darf sich der Inhalt NICHT aendern', async () => {
    // Sonst waere der Rueckweg ein Schleichweg: verwerfen, umschreiben,
    // zurueckholen — und der geaenderte Schein sieht aus wie der alte.
    await seedSchein({ status: 'Verworfen', verworfenVonName: 'A' });
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'workSheets', 'sA'), {
        status: 'Entwurf',
        zeiten: [{ datum: '2026-06-18', mitarbeiter: 'A', minuten: 999 }],
      }),
    );
  });

  it('aus dem verworfenen Entwurf wird KEIN unterschriebener Schein', async () => {
    await seedSchein({ status: 'Verworfen', verworfenVonName: 'A' });
    await assertFails(
      updateDoc(doc(ctxA_employee().firestore(), 'workSheets', 'sA'), {
        status: 'Unterschrieben',
        unterschriften: { kunde: { name: 'K', bild: 'x', zeitpunkt: 1 } },
      }),
    );
  });

  it('der UNTERSCHRIEBENE Schein bleibt unveraenderbar', async () => {
    await seedSchein({ status: 'Unterschrieben' });
    const db = ctxA_employee().firestore();
    await assertFails(updateDoc(doc(db, 'workSheets', 'sA'), { notizen: 'nachtraeglich' }));
    await assertFails(updateDoc(doc(db, 'workSheets', 'sA'), { status: 'Entwurf' }));
    // Und auch nicht ueber den neuen Zustand als Umweg.
    await assertFails(updateDoc(doc(db, 'workSheets', 'sA'), { status: 'Verworfen' }));
  });

  /*
    DIE FOTOS GEHOEREN ZUM EINGEFRORENEN INHALT.

    Ihre Pfade und Inhalts-Hashes sind das einzige, was ein spaeter im Storage
    ausgetauschtes Bild auffliegen laesst — die Storage-Regel sieht die Datei,
    nicht ihren Zusammenhang mit dem Schein. Waere die Liste beim Storno
    aenderbar, liesse sich genau dieser Nachweis stillschweigend umschreiben:
    stornieren, Fotoliste tauschen, fertig.
  */
  it('die Fotoliste laesst sich beim Storno nicht mitaendern', async () => {
    await seedSchein({
      status: 'Unterschrieben',
      fotos: [{ pfad: 'scheine/companyA/sA/aaa.jpg', hash: 'aaa', bytes: 1, geraetZeit: 1 }],
    });
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA'), {
        status: 'Storniert',
        stornoGrund: 'Verrechnet',
        fotos: [{ pfad: 'scheine/companyA/sA/bbb.jpg', hash: 'bbb', bytes: 1, geraetZeit: 1 }],
      }),
    );
  });

  it('der Storno geht mit unveraenderter Fotoliste durch', async () => {
    await seedSchein({
      status: 'Unterschrieben',
      fotos: [{ pfad: 'scheine/companyA/sA/aaa.jpg', hash: 'aaa', bytes: 1, geraetZeit: 1 }],
    });
    await assertSucceeds(
      updateDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA'), {
        status: 'Storniert',
        stornoGrund: 'Verrechnet',
        fotos: [{ pfad: 'scheine/companyA/sA/aaa.jpg', hash: 'aaa', bytes: 1, geraetZeit: 1 }],
      }),
    );
  });

  it('und der Storno eines Scheins OHNE Fotofeld geht weiterhin', async () => {
    /*
      Scheine aus der Zeit vor den Fotos tragen das Feld gar nicht. Ein
      direkter Zugriff auf ein fehlendes Feld bricht die Regel ab — der
      Storno eines Altbelegs waere damit unmoeglich geworden, und zwar
      ausgerechnet fuer die aeltesten Belege, bei denen am ehesten etwas
      zu korrigieren ist.
    */
    await seedSchein({ status: 'Unterschrieben' });
    await assertSucceeds(
      updateDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA'), {
        status: 'Storniert',
        stornoGrund: 'Verrechnet',
      }),
    );
  });

  it('auch die Geschaeftsfuehrung kann den unterschriebenen Schein nicht verwerfen', async () => {
    await seedSchein({ status: 'Unterschrieben' });
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA'), { status: 'Verworfen' }),
    );
  });

  it('der stornierte Schein bleibt eingefroren', async () => {
    await seedSchein({ status: 'Storniert', stornoGrund: 'Zahlendreher' });
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA'), { status: 'Entwurf' }),
    );
  });

  it('geloescht wird kein Schein, in keinem Zustand', async () => {
    for (const status of ['Entwurf', 'Verworfen', 'Unterschrieben', 'Storniert']) {
      await seedSchein({ status });
      await assertFails(deleteDoc(doc(ctxA_gf().firestore(), 'workSheets', 'sA')));
    }
  });

  it('die fremde Firma kommt an den Schein nicht heran', async () => {
    await seedSchein({ status: 'Verworfen', verworfenVonName: 'A' });
    await assertFails(
      updateDoc(doc(ctxB_admin().firestore(), 'workSheets', 'sA'), { status: 'Entwurf' }),
    );
  });
});

/**
 * Der zweite Riegel, den der Betrieb ausdrücklich verlangt hat: KEIN Konto
 * legt einen Administrator an ausser einem Administrator selbst.
 *
 * Die Fälle „anlegen" und „ändern" stehen schon weiter oben. Was fehlte, ist
 * das LÖSCHEN — ohne das könnte die Geschäftsführung den letzten Administrator
 * entfernen und danach die Rolle selbst neu vergeben.
 */
describe('Einen Administrator entfernt nur ein Administrator', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'adminDoc'), {
        companyId: 'companyA', uid: 'adminDoc', name: 'Chef-Admin',
        email: 'a@a.at', role: 'Administrator', active: true,
      });
    });
  });

  it('die Geschäftsführung darf ihn nicht löschen', async () => {
    await assertFails(deleteDoc(doc(ctxA_gf().firestore(), 'users', 'adminDoc')));
  });

  it('ein Administrator darf', async () => {
    await assertSucceeds(deleteDoc(doc(ctxA_admin().firestore(), 'users', 'adminDoc')));
  });

  it('die Geschäftsführung kann sich auch nicht selbst befördern', async () => {
    // Der direkteste Weg zum Superuser, und er ist zu.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'gfDoc'), {
        companyId: 'companyA', uid: 'gfA', name: 'Chefin',
        email: 'c@a.at', role: 'Geschäftsführung', active: true,
      });
    });
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'users', 'gfDoc'), { role: 'Administrator' }),
    );
  });
});

/**
 * Der Zustand der nächtlichen Läufe.
 *
 * Ausleitung und Bilanzlauf halten hier fest, ob sie durchgegangen sind. Der
 * Punkt der Regel: geschrieben wird ausschliesslich vom Server. Eine
 * Überwachung, die der Überwachte selbst beschreiben kann, überwacht nichts —
 * wer sich aussperren will, setzte einfach einen Erfolg von heute ein.
 */
describe('Die Überwachung schreibt nur der Server', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'systemLaeufe', 'companyA_ausleitung'), {
        companyId: 'companyA',
        art: 'ausleitung',
        zuletztErfolg: 1757000000000,
        erfolg: true,
      });
    });
  });

  it('die Leitung darf den Zustand lesen', async () => {
    await assertSucceeds(getDoc(doc(ctxA_gf().firestore(), 'systemLaeufe', 'companyA_ausleitung')));
    await assertSucceeds(
      getDoc(doc(ctxA_admin().firestore(), 'systemLaeufe', 'companyA_ausleitung')),
    );
  });

  it('der Monteur nicht', async () => {
    // Es sind Betriebsdaten. Eine Meldung über eine ausgefallene Sicherung auf
    // seinem Telefon wäre eine Beunruhigung ohne Handlungsmöglichkeit.
    await assertFails(
      getDoc(doc(ctxA_employee().firestore(), 'systemLaeufe', 'companyA_ausleitung')),
    );
  });

  it('NIEMAND darf schreiben — auch die Administration nicht', async () => {
    /*
      Der Kern. Wer sich aussperren will, setzte einfach einen Erfolg von
      heute ein, und die Überwachung meldete Ruhe, während seit Wochen nichts
      läuft.
    */
    for (const ctx of [ctxA_admin(), ctxA_gf(), ctxA_buch(), ctxA_employee()]) {
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'systemLaeufe', 'companyA_ausleitung'), {
          zuletztErfolg: Date.now(),
        }),
      );
    }
  });

  it('und keiner legt einen eigenen an', async () => {
    await assertFails(
      setDoc(doc(ctxA_admin().firestore(), 'systemLaeufe', 'companyA_bilanzen'), {
        companyId: 'companyA',
        art: 'bilanzen',
        zuletztErfolg: Date.now(),
        erfolg: true,
      }),
    );
  });

  it('die fremde Firma sieht nichts', async () => {
    await assertFails(
      getDoc(doc(ctxB_admin().firestore(), 'systemLaeufe', 'companyA_ausleitung')),
    );
  });
});

describe('Wartungen — anlegen und verschieben darf nur die Leitung', () => {
  const wartung = {
    companyId: 'companyA',
    customerId: 'k1',
    customerName: 'Bäckerei Stein',
    anlage: 'Therme Vaillant ecoTEC',
    intervallMonate: 12,
    faelligAm: '2027-03-15',
    aktiv: true,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'wartungen', 'w1'), wartung);
    });
  });

  it('der Monteur darf lesen — er fährt hin', async () => {
    // Er sieht vor Ort ohnehin, was dort steht; eine leere Zeile wäre nur
    // ein Rätsel.
    await assertSucceeds(getDoc(doc(ctxA_employee().firestore(), 'wartungen', 'w1')));
    await assertSucceeds(getDoc(doc(ctxA_verw().firestore(), 'wartungen', 'w1')));
  });

  it('aber nicht schreiben', async () => {
    /*
      DER KERN. Den Termin zu verschieben heisst, eine Zusage gegenüber dem
      Kunden zu verschieben — und beim Eintragen einer erledigten Wartung
      rückt er gleich um ein Jahr. Wer das darf, entscheidet über den
      Wartungsumsatz des nächsten Jahres.
    */
    // `firestore()` je Kontext EINMAL: ein zweiter Aufruf auf demselben
    // Kontext lässt die Bibliothek über bereits gesetzte Einstellungen
    // stolpern.
    for (const ctx of [ctxA_employee(), ctxA_verw(), ctxA_buch()]) {
      const db = ctx.firestore();
      await assertFails(updateDoc(doc(db, 'wartungen', 'w1'), { faelligAm: '2030-01-01' }));
      await assertFails(deleteDoc(doc(db, 'wartungen', 'w1')));
    }
  });

  it('die Leitung darf anlegen, ändern und löschen', async () => {
    await assertSucceeds(
      setDoc(doc(ctxA_gf().firestore(), 'wartungen', 'w2'), { ...wartung, anlage: 'Etagenheizung' }),
    );
    await assertSucceeds(
      updateDoc(doc(ctxA_pl().firestore(), 'wartungen', 'w1'), {
        zuletztAm: '2026-03-15',
        faelligAm: '2027-03-15',
      }),
    );
    await assertSucceeds(deleteDoc(doc(ctxA_gf().firestore(), 'wartungen', 'w1')));
  });

  it('die fremde Firma sieht und ändert nichts', async () => {
    await assertFails(getDoc(doc(ctxB_admin().firestore(), 'wartungen', 'w1')));
    await assertFails(
      updateDoc(doc(ctxB_admin().firestore(), 'wartungen', 'w1'), { faelligAm: '2030-01-01' }),
    );
  });

  it('und niemand schiebt eine Wartung in eine fremde Firma', async () => {
    /*
      Die Vereinbarung trägt Kundenname und Adresse; sie umzuhängen wäre ein
      Weg, Kundendaten aus dem Mandanten herauszutragen.

      ZUR EHRLICHKEIT: gestoppt wird das schon von `ownsIncoming()` — die
      neue companyId gehörte nicht zum Token. Das zusätzliche
      `companyUnchanged()` in der Regel ist an dieser Stelle redundant und
      steht dort, weil jede andere Sammlung dieser Datei es trägt; nimmt man
      es heraus, bleibt dieser Test grün. Geprüft wird hier also das
      VERHALTEN, nicht die einzelne Bedingung.
    */
    await assertFails(
      updateDoc(doc(ctxA_gf().firestore(), 'wartungen', 'w1'), { companyId: 'companyB' }),
    );
  });
});
