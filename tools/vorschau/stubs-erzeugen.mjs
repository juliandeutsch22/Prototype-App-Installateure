/**
 * Erzeugt fuer jedes Modul in `src/lib/db/` ein Gegenstueck mit denselben
 * Exporten, das Beispieldaten liefert statt eine Datenbank zu fragen.
 *
 * ERZEUGT UND NICHT EINGECHECKT: Bekommt die Datenschicht eine Funktion dazu,
 * fehlt sie sonst im Stub — und die Vorschau bricht mit „does not provide an
 * export named …", und zwar erst beim Oeffnen der betroffenen Ansicht.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, '..', '..');
const ziel = join(hier, 'db');
mkdirSync(ziel, { recursive: true });

/** Welche Beispieldaten ein Modul zurueckgeben soll. `*` gilt fuer alles Uebrige. */
const DATEN = {
  users: { listUsers: 'D.benutzer', getUserByUid: 'D.benutzer[0]' },
  timeEntries: { '*': 'D.zeiten', listUrlaubstage: '[]' },
  projects: { '*': 'D.baustellen' },
  customers: {
    listCustomers: 'D.kunden', listCustomersByIds: 'D.kunden', searchCustomers: 'D.kunden',
    listProjectsForCustomer: 'D.baustellen', listUnlinkedProjectsByName: '[]',
  },
  company: { getCompany: 'D.firma', auszug: 'D.firma' },
  materialOrders: { '*': 'D.bestellungen' },
  materials: { '*': 'D.materialien' },
  invoices: { '*': 'D.rechnungen' },
  workSheets: { '*': 'D.scheine', getWorkSheet: 'D.scheine[0]' },
  vacations: {
    listOwnVacations: 'D.urlaube',
    listOpenVacations: 'D.urlaube.filter((v) => v.status === "Beantragt")',
    listApprovedVacationsInRange: 'D.urlaube',
  },
  assignments: { '*': 'D.einsaetze' },
  quotes: { '*': 'D.angebote' },
  wartungen: { '*': 'D.wartungen' },
  followUps: { listOpenFollowUps: 'D.folgetermine' },
  offenePosten: { ladeOffenePosten: '{ urlaub: 1, anforderungen: 2, mahnungen: 1 }' },
  laeufe: { ladeLauf: 'null' },
  monatsbilanzen: { bilanzMarker: 'null' },
};

/** Was sich nicht aus dem Namen ableiten laesst. */
const FEST = {
  benutzerVorgaben:
    'export const DEFAULT_WEEKLY_HOURS = 38.5;\n' +
    'export const DEFAULT_VACATION_DAYS = 25;\n' +
    'export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];\n',
  meldungsvorgaben: 'export const PREFS_DEFAULTS = {} as never;\n',
  materials: 'export const LOW_STOCK_THRESHOLD = 5;\n',
  materialOrders:
    "export const ORDER_STATUS_FLOW = ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'] as const;\n",
  quelle: 'export const nutztPostgres = () => false;\n',
  monatsbilanzen: "export const monatVon = (d: string) => d.slice(0, 7);\n",
  prefs:
    'const P = {} as never;\nexport const getPrefs = () => A(P);\nexport const subscribePrefs = SUB(P);\n',
};

const KOPF = `import * as D from '../daten';
const A = <T,>(v: T) => Promise.resolve(v);
const NOOP = () => Promise.resolve(undefined as never);
/* Der Daten-Rueckruf ist in jeder Abo-Signatur dieses Projekts das ERSTE
   Funktionsargument (danach kommt onError). Damit sind die Stubs unabhaengig
   davon, an welcher Stelle er steht. */
const SUB = (daten) => (...args) => {
  const cb = args.find((a) => typeof a === 'function');
  setTimeout(() => cb?.(daten), 0);
  return () => {};
};
void A; void NOOP; void SUB; void D;
`;

const quelle = join(wurzel, 'src', 'lib', 'db');
let n = 0;
for (const datei of readdirSync(quelle).filter((f) => f.endsWith('.ts'))) {
  const name = basename(datei, '.ts');
  const text = readFileSync(join(quelle, datei), 'utf8');

  const namen = [
    ...text.matchAll(/export (?:async )?function ([A-Za-z0-9_]+)/g),
    ...text.matchAll(/export const ([A-Za-z0-9_]+)/g),
  ].map((m) => m[1]);
  const klassen = [...text.matchAll(/export class ([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  // `export { a, b } from '…'` — aber nicht `export type { … }`.
  const weiter = [];
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    if (/export\s+type\s*\{/.test(text.slice(Math.max(0, m.index - 8), m.index + m[0].length))) continue;
    for (const teil of m[1].split(',')) {
      const t = teil.trim().split(' as ').pop().trim();
      if (/^[A-Za-z0-9_]+$/.test(t)) weiter.push(t);
    }
  }

  const fest = FEST[name] ?? '';
  const schon = new Set([...fest.matchAll(/export const ([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  const daten = DATEN[name] ?? {};
  let rumpf = fest;

  for (const k of new Set(klassen)) {
    rumpf += `export class ${k} extends Error {}\n`;
    schon.add(k);
  }
  for (const x of new Set([...namen, ...weiter])) {
    if (schon.has(x)) continue;
    const wert = daten[x] ?? daten['*'] ?? '[]';
    if (x.startsWith('subscribe')) rumpf += `export const ${x} = SUB(${wert});\n`;
    else if (/^(list|get|find|search|lade|auszug|eintraege|bilanz)/.test(x))
      rumpf += `export const ${x} = () => A(${wert});\n`;
    else if (x[0] === x[0].toUpperCase()) rumpf += `export class ${x} extends Error {}\n`;
    else rumpf += `export const ${x} = NOOP;\n`;
  }
  writeFileSync(join(ziel, `${name}.ts`), KOPF + rumpf);
  n++;
}
console.log(`Vorschau: ${n} Ersatzmodule erzeugt.`);
