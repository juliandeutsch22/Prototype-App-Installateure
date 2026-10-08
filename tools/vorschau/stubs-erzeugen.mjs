/**
 * Erzeugt fuer jedes Modul in `src/lib/db/` ein Gegenstueck mit denselben
 * Exporten, das Beispieldaten liefert statt eine Datenbank zu fragen.
 *
 * ERZEUGT UND NICHT EINGECHECKT: Bekommt die Datenschicht eine Funktion dazu,
 * fehlt sie sonst im Stub — und die Vorschau bricht mit „does not provide an
 * export named …", und zwar erst beim Oeffnen der betroffenen Ansicht.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
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
    listUidPruefungen: 'D.uidPruefungen',
  },
  company: { getCompany: 'D.firma', auszug: 'D.firma' },
  materialOrders: { '*': 'D.bestellungen' },
  materials: {
    '*': 'D.materialien',
    listKnappeLagerArtikel: 'D.materialien.filter((m) => m.stock <= 5).map((m) => ({ id: m.id, name: m.name, unit: m.unit, frei: m.stock }))',
  },
  invoices: { '*': 'D.rechnungen' },
  workSheets: { '*': 'D.scheine', getWorkSheet: 'D.scheine[0]' },
  vacations: {
    listOwnVacations: 'D.urlaube',
    listOpenVacations: 'D.urlaube.filter((v) => v.status === "Beantragt")',
    listApprovedVacationsInRange: 'D.urlaube',
    listAbwesendInRange: 'D.abwesend',
  },
  // Runde 4: Termine im Wochenplan, Monat und Tag planen.
  termine: { listTermineImZeitraum: 'D.termine', listTermineDerBaustelle: 'D.termine', listTermineDesKunden: 'D.termine' },
  assignments: { '*': 'D.einsaetze' },
  einsatzMaterial: { '*': 'D.ruestlisten', getEinsatzMaterial: 'D.ruestlisten[0]' },
  quotes: { '*': 'D.angebote', getQuote: 'D.angebote[0]' },
  wartungen: { '*': 'D.wartungen' },
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
  // `lagerFrei` liefert eine Map je Artikel — ein Feld hätte die Startseite als „nicht geladen“ gemeldet.
  materials: 'export const LOW_STOCK_THRESHOLD = 5;\n' +
    'export const lagerFrei = () => A(new Map());\n',
  materialOrders:
    "export const ORDER_STATUS_FLOW = ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'] as const;\n" +
    'export const listOrdersPage = () => A({ zeilen: D.bestellungen, naechste: null });\n' +
    'export const subscribeOrderChanges = () => () => {};\n',
  zeitjournal: 'export const listZeitjournal = () => A({ zeilen: [], naechste: null });\n',
  vacations: 'export const listGenehmigungsAbwesenheiten = () => A([]);\n',
  quotes: 'export const listQuotesPage = () => A({ zeilen: D.angebote, naechste: null });\n',
  quelle: 'export const nutztPostgres = () => false;\n',
  // Die Scheinliste fragt fürs Büro, welche Scheine schon verrechnet sind; ohne Antwort
  // bliebe die Gruppe „Nicht verrechnet“ in der Vorschau für immer am Laden.
  invoices: 'export const scheineAufRechnung = () => A([]);\n',
  monatsbilanzen: "export const monatVon = (d: string) => d.slice(0, 7);\n",
  prefs:
    'const P = {} as never;\nexport const getPrefs = () => A(P);\nexport const subscribePrefs = SUB(P);\n',
  // Formen, die die Heuristik falsch raten wuerde (Prueflauf 25.09.2026, C11).
  workSheets: 'export const vorbereiten = () => A({ zeiten: [], material: [] });\n',
  invoices:
    'export const sucheRechnungen = () => A([]);\n' +
    "export const nextInvoiceNumber = () => 'RE-2026-0234';\n" +
    'export const isInvoiceNumberTaken = () => false;\n',
  konten: 'export const buchungskonten = () => A([]);\n',
  // Die Grenzprüfung liest die Geburtsdaten als Map je Person; ein Feld liess
  // die Karte „Arbeitszeitgrenzen“ in der Vorschau mit einem Fehler stehen.
  arbeitszeitGrenzen: 'export const listGeburtsdaten = () => A(new Map<string, string>());\n',
  // Das Kalender-Abo (02.10.2026): eingerichtet, damit die Karte ihren Normalfall zeigt.
  assignments:
    'export const kalenderAboStand = () => A(D.kalenderAbo);\n' +
    "export const kalenderAboAnlegen = () => A('Beispiel-Schluessel');\n",
  // Seit B1 (29.09.2026) nicht mehr am Betrieb und am Artikel.
  kosten:
    'export const kostensaetze = () => A({ fach: 46, helper: 31 });\n' +
    'export const einkaufspreise = () => A(new Map<string, number>());\n',
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
/* Auch `pg/`: einzelne Ansichten importieren `@/lib/db/pg/...` direkt (etwa
   das Ausgangsfach im Layout). Der Rueckruf-Kopf importiert `../daten`; fuer
   den Unterordner wird der Pfad angepasst. */
const ORDNER = ['', 'pg'];
for (const unter of ORDNER) {
  const von = join(quelle, unter);
  if (!existsSync(von)) continue;
  mkdirSync(join(ziel, unter), { recursive: true });
  for (const datei of readdirSync(von).filter((f) => f.endsWith('.ts'))) {
  const name = basename(datei, '.ts');
  const text = readFileSync(join(von, datei), 'utf8');

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
  const kopf = unter ? KOPF.replace("'../daten'", "'../../daten'") : KOPF;
  writeFileSync(join(ziel, unter, `${name}.ts`), kopf + rumpf);
  n++;
  }
}
/* Handgeschriebene Stubs unter `fest/` legen sich ueber die erzeugten: dort
   liegt, was sich aus dem Namen nicht ableiten laesst (Ausgangsfach,
   Katalogimport). */
const fest = join(hier, 'fest');
if (existsSync(fest)) cpSync(fest, ziel, { recursive: true });
console.log(`Vorschau: ${n} Ersatzmodule erzeugt.`);
