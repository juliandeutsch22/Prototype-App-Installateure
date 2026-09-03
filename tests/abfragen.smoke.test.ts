import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';

/**
 * Der Smoketest für die Abfragen: läuft, was die App tatsächlich absetzt?
 *
 * WARUM ES DEN BRAUCHT. Die Komponententests ersetzen jeden
 * Datenbankzugriff. Sie prüfen, dass eine Ansicht die richtige Funktion mit
 * den richtigen Argumenten aufruft — nicht, ob diese Funktion gegen einen
 * echten Firestore überhaupt durchkommt. Genau in dieser Lücke lagen die
 * Fehler, die aus dem Betrieb gemeldet wurden: eine Abfrage, die an den
 * Regeln scheitert, sieht in einer Ansicht mit ersetzter Datenbank aus wie
 * ein Erfolg mit leerem Ergebnis.
 *
 * WAS ER FINDET:
 *   - Abfragen, die eine Rolle nach den Rules nicht absetzen darf
 *   - ungültige Filterkombinationen (Firestore lehnt sie ab, unabhängig vom Index)
 *   - Laufzeitfehler in den Abfragebauern selbst
 *
 * WAS ER NICHT FINDET, und das gehört gesagt: FEHLENDE INDIZES. Der Emulator
 * legt zusammengesetzte Indizes bei Bedarf selbst an; in Produktion tut das
 * niemand. Dafür gibt es den zweiten Test in dieser Datei, der die
 * Abfrageform gegen `firestore.indexes.json` prüft — statisch, ohne Emulator.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;

/**
 * Die Firestore-Instanz, die `src/lib/firebase` an die Datenbankmodule
 * liefert — je Test die des gerade angemeldeten Nutzers.
 *
 * Als Getter, nicht als Wert: die Module lesen `db` bei jedem Aufruf, und nur
 * so lässt sich zwischen den Rollen umschalten, ohne sie neu zu laden.
 */
let aktuelleDb: Firestore;
vi.mock('@/lib/firebase', () => ({
  get db() {
    return aktuelleDb;
  },
  app: {},
  auth: {},
  functions: {},
}));

const FIRMA = 'companyA';
const MONTEUR = 'userA1';

function alsMonteur() {
  return testEnv
    .authenticatedContext(MONTEUR, { companyId: FIRMA, role: 'Mitarbeiter' })
    .firestore() as unknown as Firestore;
}
function alsGF() {
  return testEnv
    .authenticatedContext('gfA', { companyId: FIRMA, role: 'Geschäftsführung' })
    .firestore() as unknown as Firestore;
}
function alsBuchhaltung() {
  return testEnv
    .authenticatedContext('buchA', { companyId: FIRMA, role: 'Buchhaltung' })
    .firestore() as unknown as Firestore;
}
function alsProjektleitung() {
  return testEnv
    .authenticatedContext('plA', { companyId: FIRMA, role: 'Projektleiter' })
    .firestore() as unknown as Firestore;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'abfragen-smoke',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

/**
 * Ein Datensatz je Sammlung — mehr braucht der Smoketest nicht.
 *
 * Es geht nicht darum, WAS zurückkommt, sondern ob die Abfrage überhaupt
 * durchkommt. Ein leeres Ergebnis wäre für diese Frage genauso gültig; mit
 * Daten fällt aber zusätzlich auf, wenn eine Sortierung auf ein Feld geht,
 * das die Dokumente gar nicht tragen.
 */
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const jetzt = Date.now();
    await setDoc(doc(db, 'companies', FIRMA), { name: 'Firma A' });
    // Der Schluessel ist die UID: `users/{uid}`. Steht das Dokument woanders,
    // liest die App ins Leere — und bekommt dann keine leere Antwort, sondern
    // eine Rechteverweigerung (siehe Test unten).
    await setDoc(doc(db, 'users', MONTEUR), {
      companyId: FIRMA, uid: MONTEUR, name: 'Monteur A', email: 'a@x.at',
      role: 'Mitarbeiter', workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01',
    });
    await setDoc(doc(db, 'projects', 'pA'), {
      companyId: FIRMA, projectNumber: 'B-001', customerName: 'Huber',
      status: 'Aktiv', createdAt: jetzt, assignedEmployees: [MONTEUR],
      customerId: 'kA',
    });
    await setDoc(doc(db, 'customers', 'kA'), { companyId: FIRMA, name: 'Huber' });
    await setDoc(doc(db, 'timeEntries', 'tA'), {
      companyId: FIRMA, userId: MONTEUR, date: '2026-06-18', status: 'Anwesend',
      startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-001',
    });
    await setDoc(doc(db, 'assignments', 'aA'), {
      companyId: FIRMA, userId: MONTEUR, date: '2026-06-18', projectNumber: 'B-001',
    });
    await setDoc(doc(db, 'materials', 'mA'), { companyId: FIRMA, name: 'Rohr', stock: 5 });
    await setDoc(doc(db, 'materialOrders', 'oA'), {
      companyId: FIRMA, userId: MONTEUR, status: 'Offen', createdAt: jetzt,
      materialName: 'Rohr', quantity: 2, projectNumber: 'B-001',
    });
    await setDoc(doc(db, 'invoices', 'iA'), {
      companyId: FIRMA, invoiceNumber: 'RE-2026-0001', projectNumber: 'B-001',
      customerName: 'Huber', paymentStatus: 'Offen', createdAt: jetzt, totalNetto: 100,
    });
    await setDoc(doc(db, 'quotes', 'qA'), {
      companyId: FIRMA, quoteNumber: 'AN-2026-0001', customerId: 'kA',
      customerName: 'Huber', status: 'Versendet', createdAt: jetzt, totalNetto: 100,
    });
    await setDoc(doc(db, 'workSheets', 'wA'), {
      companyId: FIRMA, projectNumber: 'B-001', customerName: 'Huber',
      datum: '2026-06-18', status: 'Entwurf', createdAt: jetzt,
      zeiten: [], material: [], erstelltVonUid: MONTEUR, erstelltVonName: 'Monteur A',
      abrechnung: 'Regie',
    });
    await setDoc(doc(db, 'vacations', 'vA'), {
      companyId: FIRMA, userId: MONTEUR, userName: 'Monteur A',
      von: '2026-07-06', bis: '2026-07-10', tage: 5, status: 'Beantragt',
    });
    await setDoc(doc(db, 'monthlyStats', `${FIRMA}_${MONTEUR}_2026-06`), {
      companyId: FIRMA, userId: MONTEUR, monat: '2026-06', anwesendMin: 480,
      krankTage: 0, urlaubTage: 0, tage: ['2026-06-18'],
    });
  });
});

/** Alle Abfragemodule EINMAL laden — sie greifen über den Getter auf `db` zu. */
const projekte = await import('@/lib/db/projects');
const zeiten = await import('@/lib/db/timeEntries');
const einsaetze = await import('@/lib/db/assignments');
const kunden = await import('@/lib/db/customers');
const angebote = await import('@/lib/db/quotes');
const scheine = await import('@/lib/db/workSheets');
const urlaube = await import('@/lib/db/vacations');
const rechnungen = await import('@/lib/db/invoices');
const material = await import('@/lib/db/materials');
const anforderungen = await import('@/lib/db/materialOrders');
const ruestlisten = await import('@/lib/db/einsatzMaterial');
const bilanzen = await import('@/lib/db/monatsbilanzen');
const nutzer = await import('@/lib/db/users');

/**
 * Eine Abfrage: was sie heisst, wer sie absetzt und was sie tut.
 *
 * `wer` ist die Rolle, die sie in der App tatsächlich auslöst — nicht die
 * mächtigste, die sie dürfte. Sonst prüfte der Test die Rechte der
 * Geschäftsführung und übersähe, dass ein Monteur an derselben Stelle
 * scheitert.
 */
interface Abfrage {
  name: string;
  wer: () => Firestore;
  lauf: () => Promise<unknown>;
}

const ABFRAGEN: Abfrage[] = [
  // --- Baustellen ---
  { name: 'listActiveProjects (Monteur)', wer: alsMonteur, lauf: () => projekte.listActiveProjects(FIRMA) },
  { name: 'listRecentProjects (Leitung)', wer: alsGF, lauf: () => projekte.listRecentProjects(FIRMA, 50) },
  { name: 'listProjectsByNumbers (Monteur)', wer: alsMonteur, lauf: () => projekte.listProjectsByNumbers(FIRMA, ['B-001']) },
  { name: 'listProjectsForEmployee (Monteur)', wer: alsMonteur, lauf: () => projekte.listProjectsForEmployee(FIRMA, MONTEUR) },

  // --- Zeiten ---
  { name: 'listOwnEntriesSince (Monteur)', wer: alsMonteur, lauf: () => zeiten.listOwnEntriesSince(FIRMA, MONTEUR, '2026-01-01') },
  { name: 'listEntriesInRange (Buchhaltung)', wer: alsBuchhaltung, lauf: () => zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-30') },
  { name: 'listEntriesForProjects (Leitung)', wer: alsGF, lauf: () => zeiten.listEntriesForProjects(FIRMA, ['B-001']) },
  { name: 'findEntryForDate (Monteur)', wer: alsMonteur, lauf: () => zeiten.findEntryForDate(FIRMA, MONTEUR, '2026-06-18') },

  // --- Einsaetze ---
  { name: 'listUpcomingAssignments (Monteur)', wer: alsMonteur, lauf: () => einsaetze.listUpcomingAssignments(FIRMA, MONTEUR, '2026-01-01') },
  { name: 'listAssignmentsForDate (Leitung)', wer: alsGF, lauf: () => einsaetze.listAssignmentsForDate(FIRMA, '2026-06-18') },
  { name: 'listAssignmentsForUserInRange (Monteur)', wer: alsMonteur, lauf: () => einsaetze.listAssignmentsForUserInRange(FIRMA, MONTEUR, '2026-06-01', '2026-06-30') },

  // --- Kunden ---
  { name: 'listCustomers (Buchhaltung)', wer: alsBuchhaltung, lauf: () => kunden.listCustomers(FIRMA) },
  { name: 'listCustomersByIds (Leitung)', wer: alsGF, lauf: () => kunden.listCustomersByIds(FIRMA, ['kA']) },
  { name: 'listProjectsForCustomer (Leitung)', wer: alsGF, lauf: () => kunden.listProjectsForCustomer(FIRMA, 'kA') },
  { name: 'listUnlinkedProjectsByName (Leitung)', wer: alsGF, lauf: () => kunden.listUnlinkedProjectsByName(FIRMA, 'Huber') },

  // --- Angebote ---
  { name: 'listRecentQuotes (Leitung)', wer: alsGF, lauf: () => angebote.listRecentQuotes(FIRMA) },
  { name: 'listQuotesForCustomer (Leitung)', wer: alsGF, lauf: () => angebote.listQuotesForCustomer(FIRMA, 'kA') },

  // --- Scheine ---
  { name: 'listRecentWorkSheets (Monteur)', wer: alsMonteur, lauf: () => scheine.listRecentWorkSheets(FIRMA) },
  { name: 'listWorkSheetsForProject (Monteur)', wer: alsMonteur, lauf: () => scheine.listWorkSheetsForProject(FIRMA, 'B-001') },

  // --- Urlaub ---
  { name: 'listOwnVacations (Monteur)', wer: alsMonteur, lauf: () => urlaube.listOwnVacations(FIRMA, MONTEUR) },
  { name: 'listOpenVacations (Leitung)', wer: alsGF, lauf: () => urlaube.listOpenVacations(FIRMA) },
  {
    name: 'listApprovedVacationsInRange (Projektleitung)',
    // Ausdruecklich die PROJEKTLEITUNG: sie plant Einsaetze und muss den
    // Urlaub sehen, obwohl sie nicht darueber entscheidet.
    wer: alsProjektleitung,
    lauf: () => urlaube.listApprovedVacationsInRange(FIRMA, '2026-06-01', '2026-07-31'),
  },

  // --- Rechnungen ---
  { name: 'listUnpaidInvoices (Buchhaltung)', wer: alsBuchhaltung, lauf: () => rechnungen.listUnpaidInvoices(FIRMA) },

  // --- Material ---
  { name: 'listMaterials (Monteur)', wer: alsMonteur, lauf: () => material.listMaterials(FIRMA) },
  { name: 'listOpenOrders (Verwaltung/Leitung)', wer: alsGF, lauf: () => anforderungen.listOpenOrders(FIRMA) },
  { name: 'listOwnOpenOrders (Monteur)', wer: alsMonteur, lauf: () => anforderungen.listOwnOpenOrders(FIRMA, MONTEUR) },
  // Die Ruestliste holt der MONTEUR auf der Startseite — die schwaechste
  // Rolle also, nicht die Leitung, die sie plant.
  { name: 'listEinsatzMaterialForDate (Monteur)', wer: alsMonteur, lauf: () => ruestlisten.listEinsatzMaterialForDate(FIRMA, '2026-06-18') },
  { name: 'getEinsatzMaterial (Monteur, nichts geplant)', wer: alsMonteur, lauf: () => ruestlisten.getEinsatzMaterial(FIRMA, '2026-06-18', 'B-001') },

  // --- Auswertung ---
  { name: 'listBilanzen (Buchhaltung)', wer: alsBuchhaltung, lauf: () => bilanzen.listBilanzen(FIRMA, MONTEUR, '2026-01') },
  { name: 'listUsers (Leitung)', wer: alsGF, lauf: () => nutzer.listUsers(FIRMA) },
  { name: 'getUserByUid (Monteur)', wer: alsMonteur, lauf: () => nutzer.getUserByUid(FIRMA, MONTEUR) },
];

describe('Abfragen laufen gegen einen echten Firestore', () => {
  for (const abfrage of ABFRAGEN) {
    it(abfrage.name, async () => {
      aktuelleDb = abfrage.wer();
      /**
       * Der Test bestätigt nicht das Ergebnis, sondern dass die Abfrage
       * durchkommt. Ein Fehlschlag heisst eines von zwei Dingen, und beide
       * fallen sonst erst im Betrieb auf: die Rolle darf diese Abfrage nicht,
       * oder die Filterkombination ist ungültig.
       */
      await expect(abfrage.lauf()).resolves.toBeDefined();
    });
  }
});

describe('Die Datenschutzgrenze haelt auch bei den ABFRAGEN', () => {
  it('ein Monteur kann die Zeiten des Betriebs nicht abfragen', async () => {
    /**
     * Nicht dasselbe wie der Dokumenttest in `firestore.rules.test.ts`: dort
     * wird EIN Dokument gelesen, hier die Liste. Firestore prüft Abfragen
     * gegen die Rules als Ganzes — eine Liste kann scheitern, wo ein
     * Einzelzugriff durchgeht.
     *
     * Zeiteinträge tragen Kranken- und Urlaubstage, also Gesundheitsdaten
     * nach Art. 9 DSGVO. Genau diese Grenze war der Grund, den
     * Handwerksschein und die Urlaubsgenehmigung serverseitig zu bauen.
     */
    aktuelleDb = alsMonteur();
    await expect(zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-30')).rejects.toThrow();
  });

  it('ein Monteur kommt an die Rechnungen nicht heran', async () => {
    aktuelleDb = alsMonteur();
    await expect(rechnungen.listUnpaidInvoices(FIRMA)).rejects.toThrow();
  });

  it('die Projektleitung kommt an die Monatsbilanzen nicht heran', async () => {
    // Sie sind verdichtete Zeitkonten — wer die Rohdaten nicht sehen darf,
    // darf auch ihre Summe nicht sehen.
    aktuelleDb = alsProjektleitung();
    await expect(bilanzen.listBilanzen(FIRMA, MONTEUR, '2026-01')).rejects.toThrow();
  });
});

describe('Eigenheiten, die man einmal wissen muss', () => {
  it('ein FEHLENDES Dokument wird abgelehnt, nicht leer beantwortet', async () => {
    /**
     * `ownsExisting()` prüft `resource.data.companyId`. Bei einem Dokument,
     * das es nicht gibt, ist `resource` null — die Regel scheitert also, statt
     * durchzulassen und nichts zu liefern.
     *
     * Für die App heisst das: `getUserByUid` gibt NICHT null zurück, wenn das
     * Nutzerdokument fehlt, sondern wirft. Wer darauf ein `?? null` baut,
     * bekommt stattdessen einen Fehler — genau die Art stiller Annahme, die
     * erst im Betrieb auffällt. Hier steht sie schwarz auf weiss.
     */
    aktuelleDb = alsMonteur();
    await expect(nutzer.getUserByUid(FIRMA, 'gibtesnicht')).rejects.toThrow();
  });
});
