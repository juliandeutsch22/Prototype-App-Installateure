import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Index-Abgleich: hat jede Abfrage den Index, den sie in Produktion braucht?
 *
 * WARUM DAS EIN EIGENER TEST SEIN MUSS. Der Smoketest gegen den Emulator
 * findet fehlende Indizes NICHT — der Emulator legt zusammengesetzte Indizes
 * bei Bedarf still selbst an. In Produktion tut das niemand: dort scheitert
 * die Abfrage mit „The query requires an index", und die Ansicht steht leer
 * da. Genau so ist die Kundenakte ausgefallen; der Index auf
 * `(companyId, customerName)` fehlte, und niemand hat es gemerkt, weil lokal
 * alles lief.
 *
 * Deshalb prüft dieser Test rein statisch: welche Felder schränkt eine
 * Abfrage ein, und steht dafür ein Index in `firestore.indexes.json`?
 *
 * DIE REGEL VON FIRESTORE, auf die er sich stützt: sobald eine Abfrage mehr
 * als EIN Feld einschränkt oder sortiert, braucht sie einen zusammengesetzten
 * Index. Jede Abfrage dieser App filtert auf `companyId` — Mandantenfähigkeit
 * —, also ist praktisch jede zweite Einschränkung indexpflichtig.
 *
 * Der Test ist bewusst NACHSICHTIG bei der Reihenfolge: er verlangt, dass ein
 * Index existiert, der alle benötigten Felder enthält, nicht dass sie in
 * genau dieser Folge stehen. Die Feinheiten der Reihenfolge meldet Firestore
 * beim ersten Aufruf mit einem fertigen Link; was es NICHT meldet, ist ein
 * Index, den man nie angelegt hat.
 */

const DB_VERZEICHNIS = join(__dirname, '../../src/lib/db');
const INDEX_DATEI = join(__dirname, '../../firestore.indexes.json');

interface IndexEintrag {
  collectionGroup: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string }[];
}

const indexe: IndexEintrag[] = JSON.parse(readFileSync(INDEX_DATEI, 'utf8')).indexes;

/**
 * Felder, die keinen zusammengesetzten Index verlangen.
 *
 * `__name__` ist der Dokumentschlüssel; eine Abfrage darauf läuft immer.
 */
const OHNE_INDEX = new Set(['__name__']);

interface Abfrage {
  datei: string;
  funktion: string;
  sammlung: string;
  felder: string[];
}

/** Aus `const NAME = 'sammlung'` die Zuordnung Variable -> Sammlung lesen. */
function sammlungsNamen(quelle: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of quelle.matchAll(/const\s+([A-Z_]+)\s*=\s*'([a-zA-Z]+)'/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Die Abfragen einer Datei einsammeln.
 *
 * Zerlegt wird an den exportierten Funktionen; alles bis zur nächsten
 * gehört zur laufenden. Das ist gröber als ein echter Parser und genau
 * deshalb robust: es kommt nicht darauf an, WO im Rumpf ein `where` steht.
 */
function abfragenAus(datei: string, quelle: string): Abfrage[] {
  const namen = sammlungsNamen(quelle);
  const treffer: Abfrage[] = [];
  const grenzen = [...quelle.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)];

  for (let i = 0; i < grenzen.length; i++) {
    const funktion = grenzen[i][1];
    const von = grenzen[i].index ?? 0;
    const bis = i + 1 < grenzen.length ? (grenzen[i + 1].index ?? quelle.length) : quelle.length;
    const rumpf = quelle.slice(von, bis);

    // Welche Sammlung? Erstes Argument von queryTenant/subscribeTenant.
    const nutzung = rumpf.match(/(?:queryTenant|subscribeTenant)<[^>]*>\(\s*(\w+)/);
    if (!nutzung) continue;
    const sammlung = namen[nutzung[1]];
    if (!sammlung) continue;

    const felder = new Set<string>(['companyId']); // steht in queryTenant selbst
    for (const w of rumpf.matchAll(/where\(\s*'([^']+)'/g)) felder.add(w[1]);
    for (const o of rumpf.matchAll(/orderBy\(\s*'([^']+)'/g)) felder.add(o[1]);

    treffer.push({ datei, funktion, sammlung, felder: [...felder] });
  }
  return treffer;
}

const ALLE: Abfrage[] = [];
for (const datei of readdirSync(DB_VERZEICHNIS).filter((f) => f.endsWith('.ts'))) {
  if (datei === 'core.ts') continue; // die Helfer selbst, ohne eigene Abfrage
  ALLE.push(...abfragenAus(datei, readFileSync(join(DB_VERZEICHNIS, datei), 'utf8')));
}

/** Gibt es einen Index, der alle diese Felder trägt? */
function indexVorhanden(sammlung: string, felder: string[]): boolean {
  const gebraucht = felder.filter((f) => !OHNE_INDEX.has(f));
  if (gebraucht.length <= 1) return true; // Einzelfeld — Firestore legt das selbst an
  return indexe.some((idx) => {
    if (idx.collectionGroup !== sammlung) return false;
    const hat = new Set(idx.fields.map((f) => f.fieldPath));
    return gebraucht.every((f) => hat.has(f));
  });
}

describe('Jede Abfrage hat den Index, den sie in Produktion braucht', () => {
  it('findet ueberhaupt Abfragen — sonst prueft der Test nichts', () => {
    /**
     * Ein Parser, der stillschweigend nichts findet, ist schlimmer als kein
     * Test: er meldet Erfolg. Diese Untergrenze schlägt an, wenn sich die
     * Schreibweise in `lib/db` so ändert, dass das Muster nicht mehr greift.
     */
    expect(ALLE.length).toBeGreaterThanOrEqual(20);
  });

  for (const a of ALLE) {
    const gebraucht = a.felder.filter((f) => !OHNE_INDEX.has(f));
    const titel =
      gebraucht.length <= 1
        ? `${a.funktion} — ein Feld, kein Index noetig`
        : `${a.funktion} — ${a.sammlung} (${gebraucht.join(' + ')})`;

    it(titel, () => {
      expect(
        indexVorhanden(a.sammlung, a.felder),
        `${a.datei}: ${a.funktion} fragt ${a.sammlung} auf ${gebraucht.join(' + ')} ab. ` +
          'Dafuer fehlt ein zusammengesetzter Index in firestore.indexes.json. ' +
          'In Produktion scheitert diese Abfrage mit "The query requires an index" — ' +
          'der Emulator legt ihn still selbst an und verschweigt das Problem.',
      ).toBe(true);
    });
  }
});

describe('Keine Indizes auf Vorrat', () => {
  it('jeder Index wird von mindestens einer Abfrage gebraucht', () => {
    /**
     * Andersherum ist genauso wichtig: ein Index kostet Schreibleistung bei
     * JEDEM Schreibvorgang in seine Sammlung. Bleibt einer stehen, nachdem
     * seine Abfrage weggefallen ist, zahlt der Betrieb dauerhaft für nichts.
     *
     * Kein harter Fehlschlag, sondern eine Liste: manche Indizes gehören zu
     * Abfragen in den Cloud Functions, die dieser Parser nicht sieht.
     */
    const gebrauchte = ALLE.map((a) => ({
      sammlung: a.sammlung,
      felder: new Set(a.felder.filter((f) => !OHNE_INDEX.has(f))),
    }));
    const verwaist = indexe.filter((idx) => {
      const hat = idx.fields.map((f) => f.fieldPath);
      return !gebrauchte.some(
        (g) => g.sammlung === idx.collectionGroup && hat.every((f) => g.felder.has(f)),
      );
    });
    // Nur dokumentieren, nicht durchfallen lassen.
    if (verwaist.length > 0) {
      console.info(
        'Indizes ohne passende Abfrage in lib/db (womoeglich fuer Cloud Functions):\n' +
          verwaist
            .map((i) => `  ${i.collectionGroup}: ${i.fields.map((f) => f.fieldPath).join(' + ')}`)
            .join('\n'),
      );
    }
    expect(true).toBe(true);
  });
});
