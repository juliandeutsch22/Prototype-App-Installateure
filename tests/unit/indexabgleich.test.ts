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
const FUNCTIONS_VERZEICHNIS = join(__dirname, '../../functions/src');
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
  /**
   * Verlangt DIESE Abfrage einen zusammengesetzten Index?
   *
   * Nicht jede Abfrage mit zwei Feldern tut das. Firestore bedient mehrere
   * GLEICHHEITSfilter aus den Einzelfeld-Indizes, die es ohnehin für jedes
   * Feld anlegt (Zickzack-Verbund). Verlangt wird ein zusammengesetzter Index
   * erst, sobald neben der Gleichheit etwas anderes dazukommt: ein Bereich
   * (`<`, `<=`, `>`, `>=`, `!=`, `not-in`), ein `array-contains`, oder eine
   * Sortierung nach einem weiteren Feld.
   *
   * DIESE UNTERSCHEIDUNG IST NEU (07.09.2026) und sie ist eine Korrektur.
   * Vorher galt schlicht „mehr als ein Feld = Index nötig". Für `lib/db` fiel
   * das nie auf, weil dort für jede solche Abfrage ohnehin ein Index steht.
   * Als der Abgleich auf die Cloud Functions ausgedehnt wurde, meldete er
   * zwei Abfragen als indexlos, die in Produktion einwandfrei laufen — und
   * hätte damit zwei Indizes erzwungen, die bei JEDEM Schreibvorgang in
   * `users` Leistung kosten, ohne je gebraucht zu werden. Ein Test, der zu
   * Arbeit auf Vorrat drängt, ist kein guter Test.
   */
  brauchtIndex: boolean;
}

/** Operatoren, die über die reine Gleichheit hinausgehen. */
const BEREICH = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);

/**
 * Aus den `where`- und `orderBy`-Aufrufen eines Textstücks lesen, was die
 * Abfrage einschränkt — und ob daraus Indexpflicht folgt.
 */
function einschraenkungen(text: string, vorbelegt: string[] = []) {
  const felder = new Set<string>(vorbelegt);
  let ueberGleichheit = false;
  for (const w of text.matchAll(/where\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
    felder.add(w[1]);
    if (BEREICH.has(w[2]) || w[2].startsWith('array-contains')) ueberGleichheit = true;
  }
  // where() ohne erkennbaren Operator (z. B. zur Laufzeit gebaut): Feld
  // mitnehmen und im Zweifel Indexpflicht annehmen.
  for (const w of text.matchAll(/where\(\s*'([^']+)'\s*\)/g)) {
    felder.add(w[1]);
    ueberGleichheit = true;
  }
  let sortiert = false;
  for (const o of text.matchAll(/orderBy\(\s*'([^']+)'/g)) {
    felder.add(o[1]);
    sortiert = true;
  }
  return { felder: [...felder], brauchtIndex: felder.size > 1 && (ueberGleichheit || sortiert) };
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

    // `companyId` steht in `queryTenant` selbst und taucht im Rumpf nicht auf.
    const { felder, brauchtIndex } = einschraenkungen(rumpf, ['companyId']);
    treffer.push({ datei, funktion, sammlung, felder, brauchtIndex });
  }
  return treffer;
}

/**
 * Dieselbe Frage für die CLOUD FUNCTIONS — und das war eine echte Lücke.
 *
 * Der Abgleich sah bis zum 07.09.2026 nur `src/lib/db`. Die Functions fragen
 * Firestore aber genauso ab, mit dem Admin-SDK und derselben Indexpflicht:
 * `bilanzNeuRechnen` etwa schränkt `timeEntries` auf `companyId + userId +
 * date` ein — drei Felder, also indexpflichtig. Fehlte der Index, liefe der
 * nächtliche Bilanzlauf in Produktion in „The query requires an index".
 *
 * DAS WÄRE DIE TEUERSTE ART VON AUSFALL GEWESEN. Ein Trigger meldet sich
 * nicht: er scheitert ins Protokoll, das niemand liest, und die Bilanzen
 * blieben still stehen. Genau dagegen gibt es seit Ü1 die Überwachung der
 * Nachtläufe — aber ein Fehler, der gar nicht erst entsteht, ist besser als
 * einer, der zwei Tage später auffällt.
 *
 * Der Emulator hilft hier nicht: er legt zusammengesetzte Indizes still
 * selbst an. Nur dieser statische Abgleich sieht das Problem.
 *
 * ANDERE SCHREIBWEISE, DESHALB EIN ZWEITER LESER: das Admin-SDK kettet
 * `db.collection('x').where(...)`, statt Einschränkungen wie der Client als
 * Argumente zu übergeben. Der Mandantenfilter steht hier ausserdem
 * ausgeschrieben und kommt nicht wie bei `queryTenant` von selbst dazu.
 */
function funktionsAbfragenAus(datei: string, quelle: string): Abfrage[] {
  const namen = sammlungsNamen(quelle);
  const treffer: Abfrage[] = [];

  /*
    Von `.collection(...)` bis zum abschliessenden `.get()`, `.stream()` oder
    `.onSnapshot(` — dazwischen liegen die Einschränkungen. Ein `.doc(` bricht
    ab: das ist ein Einzelzugriff und braucht keinen Index.
  */
  for (const m of quelle.matchAll(
    /\.collection\(\s*(?:'([a-zA-Z]+)'|([A-Z_]+))\s*\)((?:\s*\.(?:where|orderBy|limit)\([^)]*\))*)/g,
  )) {
    const sammlung = m[1] ?? namen[m[2] ?? ''];
    if (!sammlung) continue;
    const { felder, brauchtIndex } = einschraenkungen(m[3] ?? '');
    if (felder.length === 0) continue; // ganze Sammlung lesen — kein Index nötig
    treffer.push({
      datei: `functions/${datei}`,
      funktion: `${datei.replace('.ts', '')}:${sammlung}`,
      sammlung,
      felder,
      brauchtIndex,
    });
  }
  return treffer;
}

const ALLE: Abfrage[] = [];
for (const datei of readdirSync(DB_VERZEICHNIS).filter((f) => f.endsWith('.ts'))) {
  if (datei === 'core.ts') continue; // die Helfer selbst, ohne eigene Abfrage
  ALLE.push(...abfragenAus(datei, readFileSync(join(DB_VERZEICHNIS, datei), 'utf8')));
}
const FUNKTIONEN: Abfrage[] = [];
for (const datei of readdirSync(FUNCTIONS_VERZEICHNIS).filter((f) => f.endsWith('.ts'))) {
  FUNKTIONEN.push(
    ...funktionsAbfragenAus(datei, readFileSync(join(FUNCTIONS_VERZEICHNIS, datei), 'utf8')),
  );
}

/** Gibt es einen Index, der alle diese Felder trägt? */
function indexVorhanden(a: Abfrage): boolean {
  if (!a.brauchtIndex) return true;
  const gebraucht = a.felder.filter((f) => !OHNE_INDEX.has(f));
  if (gebraucht.length <= 1) return true; // Einzelfeld — Firestore legt das selbst an
  const sammlung = a.sammlung;
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

  /*
    DIE REGEL SELBST FESTNAGELN.

    Sie ist am 07.09.2026 gelockert worden — von „mehr als ein Feld" auf „mehr
    als ein Feld UND mehr als Gleichheit". Eine Lockerung, die niemand prüft,
    wird beim nächsten Mal weiter gelockert, bis der Test nichts mehr sagt.
    Diese beiden Fälle halten beide Seiten der Regel fest.
  */
  it('verlangt einen Index, sobald neben der Gleichheit sortiert wird', () => {
    // Genau der Fall, an dem die Kundenakte in Produktion ausgefallen ist.
    const kunden = ALLE.find((a) => a.funktion === 'listCustomers');
    expect(kunden?.felder.sort()).toEqual(['companyId', 'name']);
    expect(kunden?.brauchtIndex).toBe(true);
  });

  it('verlangt keinen für zwei reine Gleichheitsfilter', () => {
    /*
      Firestore bedient die aus den Einzelfeld-Indizes, die es ohnehin anlegt.
      Ein erzwungener zusammengesetzter Index kostete bei JEDEM Schreibvorgang
      Leistung, ohne je gebraucht zu werden.
    */
    const urlaub = FUNKTIONEN.find(
      (a) => a.datei === 'functions/urlaubEntscheiden.ts' && a.sammlung === 'users',
    );
    expect(urlaub?.felder.sort()).toEqual(['companyId', 'uid']);
    expect(urlaub?.brauchtIndex).toBe(false);
  });

  for (const a of ALLE) {
    const gebraucht = a.felder.filter((f) => !OHNE_INDEX.has(f));
    const titel = !a.brauchtIndex
      ? `${a.funktion} — kein zusammengesetzter Index noetig`
      : `${a.funktion} — ${a.sammlung} (${gebraucht.join(' + ')})`;

    it(titel, () => {
      expect(
        indexVorhanden(a),
        `${a.datei}: ${a.funktion} fragt ${a.sammlung} auf ${gebraucht.join(' + ')} ab. ` +
          'Dafuer fehlt ein zusammengesetzter Index in firestore.indexes.json. ' +
          'In Produktion scheitert diese Abfrage mit "The query requires an index" — ' +
          'der Emulator legt ihn still selbst an und verschweigt das Problem.',
      ).toBe(true);
    });
  }
});

/**
 * Und dasselbe für die Cloud Functions.
 *
 * Sie fragen mit dem Admin-SDK ab und unterliegen derselben Indexpflicht.
 * Scheitert eine Function-Abfrage in Produktion, meldet sich niemand: sie
 * scheitert ins Protokoll, und die Bilanzen bleiben still stehen.
 */
describe('Auch die Cloud Functions haben ihre Indizes', () => {
  it('findet ueberhaupt Abfragen — sonst prueft der Test nichts', () => {
    // Ein Parser, der stillschweigend nichts findet, meldet Erfolg.
    expect(FUNKTIONEN.length).toBeGreaterThanOrEqual(6);
  });

  it('sieht die Abfrage des Bilanzlaufs — die teuerste, wenn sie ausfaellt', () => {
    /*
      Die Untergrenze oben schlägt nicht an, wenn ausgerechnet DIESE Abfrage
      aus dem Muster fällt und andere sie in der Zahl ersetzen. Sie steht
      deshalb namentlich da: drei eingeschränkte Felder auf `timeEntries`,
      indexpflichtig, und ihr Ausfall wäre ein stiller.
    */
    const bilanz = FUNKTIONEN.find(
      (a) => a.datei === 'functions/monatsbilanz.ts' && a.sammlung === 'timeEntries',
    );
    expect(bilanz?.felder.sort()).toEqual(['companyId', 'date', 'userId']);
    /*
      UND SIE IST INDEXPFLICHTIG — das ist die halbe Aussage, die beim ersten
      Anlauf fehlte. Ohne diese Zeile hätte ein Abgleich, der Bereichs-
      operatoren nicht mehr beachtet, die Abfrage stillschweigend für
      indexfrei gehalten: `date >=` und `date <=` neben zwei Gleichheiten sind
      genau der Fall, für den Firestore einen zusammengesetzten Index
      verlangt. Die Gegenprobe hat mir das gezeigt.
    */
    expect(bilanz?.brauchtIndex).toBe(true);
  });

  for (const a of FUNKTIONEN) {
    const gebraucht = a.felder.filter((f) => !OHNE_INDEX.has(f));
    const titel = !a.brauchtIndex
      ? `${a.funktion} — kein zusammengesetzter Index noetig`
      : `${a.funktion} (${gebraucht.join(' + ')})`;

    it(titel, () => {
      expect(
        indexVorhanden(a),
        `${a.datei}: fragt ${a.sammlung} auf ${gebraucht.join(' + ')} ab. ` +
          'Dafuer fehlt ein zusammengesetzter Index in firestore.indexes.json. ' +
          'In Produktion scheitert diese Abfrage mit "The query requires an index" — ' +
          'und weil sie in einer Function laeuft, sieht das niemand ausser dem Protokoll.',
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
     * Kein harter Fehlschlag, sondern eine Liste: es bleiben Abfragen, die
     * kein Muster erfasst — etwa mit zur Laufzeit zusammengebauten Feldern.
     *
     * Die Cloud Functions sind seit dem 07.09.2026 MIT dabei; bis dahin
     * stand hier, sie seien der Grund für die Nachsicht, und das war eine
     * Lücke mit Erklärung statt einer Prüfung.
     */
    const gebrauchte = [...ALLE, ...FUNKTIONEN].map((a) => ({
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
        'Indizes ohne passende Abfrage in lib/db oder functions/src:\n' +
          verwaist
            .map((i) => `  ${i.collectionGroup}: ${i.fields.map((f) => f.fieldPath).join(' + ')}`)
            .join('\n'),
      );
    }
    expect(true).toBe(true);
  });
});
