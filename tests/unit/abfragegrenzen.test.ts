import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Die Wachstumsbremse.
 *
 * Gemessen an einem Bestand von zwanzig Monteuren und drei Jahren — 15.660
 * Zeiteinträgen — stand die Startseite nach 29,7 Sekunden. Ursache waren
 * Abfragen ohne jede Grenze: sie luden den gesamten Bestand des Betriebs, um
 * daraus im Browser ein paar Zeilen zu filtern. Zwölf solcher Abfragen gab
 * es, verteilt über acht Ansichten.
 *
 * Einzeln repariert kommen sie zurück. Eine Abfrage ohne Grenze zu schreiben
 * ist die naheliegende, bequeme Variante: sie ist kürzer, sie funktioniert im
 * Test mit dreißig Datensätzen tadellos, und sie fällt erst nach Jahren im
 * Echtbetrieb auf — bei dem Kunden, der die App am längsten benutzt.
 *
 * Deshalb prüft dieser Test die Datenschicht als Ganzes: JEDE Abfrage braucht
 * eine Grenze. Erlaubt sind drei Arten:
 *
 *   1. ein Zeitraum        — `where('date', '>=', …)`
 *   2. eine feste Obergrenze — `limit(n)`
 *   3. ein Gleichheitsfilter auf eine von Natur aus kleine Menge — etwa
 *      `status`, `userId` in Verbindung mit einem Datum, oder eine konkrete
 *      Baustellennummer
 *
 * Wer eine neue Abfrage ohne Grenze hinzufügt, bekommt hier einen Fehlschlag
 * mit dem Namen der Funktion — und muss sich entscheiden, statt es zu
 * übersehen.
 */

const DB_VERZEICHNIS = join(__dirname, '../../src/lib/db');

/** Abfragen, die bewusst ohne Zeit- oder Mengengrenze auskommen. */
const AUSNAHMEN: Record<string, string> = {
  // Die Belegschaft. Wächst mit Einstellungen, nicht mit der Zeit — ein
  // Betrieb mit zwanzig Monteuren hat auch nach zehn Jahren zwanzig Zeilen.
  listUsers: 'Belegschaft — wächst nicht mit der Zeit',
  /*
    DER MATERIALSTAMM STAND HIER — ZU UNRECHT.

    Die Begründung lautete „ein Katalog, den der Betrieb selbst pflegt; er
    wächst mit dem Sortiment, nicht mit dem Betrieb". Das stimmt genau so
    lange, wie er von Hand gepflegt wird. Ein Datanorm-Import bringt 50.000
    bis 500.000 Artikel auf einmal — und dann laden sechs Ansichten den
    ganzen Bestand, vier davon als Live-Abo.

    Die Ausnahme ist am 09.09.2026 entfallen. Beide Abfragen tragen jetzt
    eine Obergrenze; wo sie greift, sagt es die Ansicht (siehe
    `lib/katalogGrenze.ts`).
  */
  // Nachfassungen sind per Status begrenzt: erledigte fallen heraus.
  listOpenFollowUps: 'Nur offene — per Status begrenzt',
  // Einstellungen und Stammdaten des Mandanten: ein Dokument.
  subscribePrefs: 'Ein Dokument je Mandant',
};

/**
 * Abfragen, bei denen ein Statusfilter NICHT als Grenze zählt.
 *
 * „Wächst nicht mit der ZEIT" ist nicht dasselbe wie „ist begrenzt". Die Zahl
 * der laufenden Baustellen wächst nicht mit der Historie — abgeschlossene
 * fallen heraus —, wohl aber mit dem Betrieb, und sie wird nie wieder
 * kleiner. Genau deshalb ging `listActiveProjects` jahrelang als begrenzt
 * durch, obwohl sie es nicht war.
 *
 * Wo das Ergebnis an einem AUSWAHLFELD hängt, wiegt das doppelt: dort sieht
 * eine abgeschnittene Liste vollständig aus, egal wie viel fehlt.
 */
const STATUS_REICHT_NICHT: Record<string, string> = {
  listActiveProjects: 'Hängt an der Baustellenauswahl beim Buchen — dort darf nichts fehlen',
};

/** Muster, die eine Grenze belegen. */
const GRENZ_MUSTER = [
  /limit\(/,
  /*
   * DIESELBE GRENZE, IN DER SPRACHE DER POSTGRES-SCHICHT.
   *
   * Mit dem Umzug wandert eine Abfrage von `limit(50)` nach `grenze: 50`.
   * Ohne diese Zeilen fiele der Wächter bei jedem umgestellten Modul um —
   * und die naheliegende „Lösung" wäre, das Modul auszunehmen. Dann wäre er
   * am Ende des Umzugs blind, ohne dass es jemand gemerkt hätte.
   */
  /grenze:/,
  /\{ art: 'in', feld: '(id|projectNumber|status)'/,
  /\{ art: 'gleich', feld: '(date|datum|customerId|projectNumber|userId)'/,
  /\{ art: 'ab', feld: '(date|datum|invoiceDate|monat)'/,
  /\{ art: 'enthaelt', feld: 'assignedEmployees'/,
  /where\(\s*'date'\s*,\s*'>=?'/,
  /where\(\s*'date'\s*,\s*'=='/,
  // Das RECHNUNGSdatum ist dieselbe Art Grenze wie `date`, nur heisst das
  // Feld auf der Rechnung anders. Der Buchhaltungs-Export holt darüber
  // seinen Zeitraum — der Zeitraum IST seine Grenze, und ein `limit` wäre
  // dort sogar schädlich: ein Journal, das stillschweigend bei tausend
  // Rechnungen aufhört, ist genau der Fehler, den diese Abfrage behebt.
  /where\(\s*'invoiceDate'\s*,\s*'>=?'/,
  // Monatsbilanzen sind ueber einen Monatsbereich begrenzt — dieselbe Art
  // Grenze wie ein Datumsbereich, nur eine Stufe groeber.
  /where\(\s*'monat'\s*,\s*'>=?'/,
  /where\(\s*'status'\s*,/,
  /where\(\s*'paymentStatus'\s*,/,
  /where\(\s*'projectNumber'\s*,/,
  /where\(\s*'assignedEmployees'\s*,/,
  // Eine `in`-Abfrage auf die Dokument-Id ist von Firestore selbst auf
  // hoechstens 30 Werte begrenzt — enger geht es nicht.
  /where\(\s*'__name__'\s*,\s*'in'/,
];

interface Abfrage {
  datei: string;
  name: string;
  koerper: string;
}

/** Alle exportierten Funktionen der Datenschicht, die Firestore lesen. */
function sammleAbfragen(): Abfrage[] {
  const raus: Abfrage[] = [];
  /*
   * DER WÄCHTER FOLGT DEM CODE.
   *
   * Mit dem Umzug liegt dieselbe Abfrage mal in `db/x.ts`, mal in `db/fs/x.ts`
   * und mal in `db/pg/x.ts`. Ein Wächter, der nur das obere Verzeichnis
   * kennt, findet nach dem ersten Umzug weniger Abfragen als vorher und
   * meldet trotzdem grün. Genau das ist passiert: von 46 Prüfungen blieben
   * 40 übrig, ohne dass eine einzige rot wurde.
   *
   * Deshalb wird auch die ANZAHL geprüft (siehe unten): ein Wächter, der
   * still weniger bewacht, ist schlimmer als keiner.
   */
  const verzeichnisse = [DB_VERZEICHNIS, join(DB_VERZEICHNIS, 'fs'), join(DB_VERZEICHNIS, 'pg')];
  const dateien: Array<{ datei: string; pfad: string }> = [];
  for (const v of verzeichnisse) {
    let inhalt: string[];
    try {
      inhalt = readdirSync(v).filter((f) => f.endsWith('.ts'));
    } catch {
      continue; // fs/ und pg/ gibt es erst, sobald das erste Modul umzieht
    }
    const zweig = v === DB_VERZEICHNIS ? '' : `${v.split('/').pop()}/`;
    for (const d of inhalt) dateien.push({ datei: `${zweig}${d}`, pfad: join(v, d) });
  }

  for (const { datei, pfad } of dateien) {
    // core.ts und kern.ts halten die Bausteine selbst — dort steht die Grenze
    // naturgemäß nicht, sie wird von den Aufrufern mitgegeben.
    if (datei === 'core.ts' || datei === 'pg/kern.ts') continue;
    // Die Weichen entscheiden nur; die Abfrage steht in fs/ oder pg/.
    if (/from '\.\/pg\//.test(readFileSync(pfad, 'utf8'))) continue;
    const text = readFileSync(pfad, 'utf8');

    const muster = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
    let treffer: RegExpExecArray | null;
    while ((treffer = muster.exec(text))) {
      const name = treffer[1];
      // Nur Lesezugriffe: Schreiben trifft immer genau ein Dokument.
      if (!/^(list|subscribe|get|find)/.test(name)) continue;

      // Körper bis zur nächsten Export-Zeile oder zum Dateiende.
      const ab = treffer.index;
      const naechster = text.indexOf('\nexport ', ab + 1);
      const koerper = text.slice(ab, naechster === -1 ? text.length : naechster);
      // Nur was tatsächlich MEHRERE Dokumente abfragt. Ein `getDoc(doc(…))`
      // holt genau eines und kann per Definition nicht wachsen — es hier
      // namentlich auszunehmen wäre eine Liste, die jemand pflegen muss.
      // Dieselbe Frage in der Sprache der Postgres-Schicht: `abfragen(…)`
      // und `abonnieren(…)` holen mehrere Zeilen, ein `.single()` genau eine.
      //
      // DIE ECKIGE KLAMMER IST DER PUNKT. Die Aufrufe stehen fast immer mit
      // Typangabe da — `abfragen<Assignment>(…)` —, und ein Muster, das ein
      // `(` unmittelbar nach dem Namen verlangte, ging daran vorbei. So
      // blieben fünfundzwanzig Postgres-Abfragen unbewacht, während der Test
      // grün meldete und sogar bestätigte, er finde etwas in `pg/`.
      if (!/queryTenant|subscribeTenant|getDocs\(|onSnapshot\(|abfragen[<(]|abonnieren[<(]|\.select\(/.test(koerper)) continue;
      raus.push({ datei, name, koerper });
    }
  }
  return raus;
}

describe('Abfragegrenzen in der Datenschicht', () => {
  const abfragen = sammleAbfragen();

  it('findet die Abfragen überhaupt', () => {
    // Schutz gegen einen stillschweigend wirkungslosen Test: greift das
    // Muster nicht mehr, prüfte er nichts und bliebe trotzdem grün.
    expect(abfragen.length).toBeGreaterThan(10);
  });

  it.each(sammleAbfragen().map((a) => [a.name, a] as const))(
    '%s hat eine Grenze',
    (name, abfrage) => {
      if (AUSNAHMEN[name]) {
        expect(AUSNAHMEN[name]).toBeTruthy();
        return;
      }
      const muster = STATUS_REICHT_NICHT[name]
        ? GRENZ_MUSTER.filter((m) => !/'status'/.test(m.source))
        : GRENZ_MUSTER;
      const begrenzt = muster.some((m) => m.test(abfrage.koerper));
      expect(
        begrenzt,
        `${abfrage.datei}: ${name}() fragt Firestore ohne Grenze ab.\n` +
          `Ohne Zeitraum, ohne limit() und ohne begrenzenden Gleichheitsfilter wächst diese\n` +
          `Abfrage mit dem Bestand des Betriebs — sie ist bei dreißig Datensätzen schnell und\n` +
          `nach fünf Jahren unbenutzbar. Entweder eine Grenze ergänzen oder, wenn die Menge\n` +
          `wirklich von Natur aus klein bleibt, mit Begründung in AUSNAHMEN eintragen.`,
      ).toBe(true);
    },
  );

  it('führt keine Ausnahmen für Abfragen, die es nicht mehr gibt', () => {
    // Eine Ausnahme, deren Funktion verschwunden ist, verdeckt sonst später
    // eine gleichnamige neue Abfrage.
    const namen = new Set(abfragen.map((a) => a.name));
    const verwaist = Object.keys(AUSNAHMEN).filter((n) => !namen.has(n));
    expect(verwaist).toEqual([]);
  });
});

/**
 * Der Wächter über den Wächter.
 *
 * Diese Datei erzeugt eine Prüfung je gefundener Abfrage. Findet sie keine
 * mehr — weil der Code umgezogen ist, weil ein Muster nicht mehr passt, weil
 * jemand ein Verzeichnis übersehen hat —, dann meldet sie GRÜN und bewacht
 * nichts. Genau das ist beim Umzug des ersten Moduls passiert: von 46
 * Prüfungen blieben 40, und keine einzige wurde rot.
 *
 * Die Zahl unten ist deshalb Teil der Zusage. Sie darf steigen; sinkt sie,
 * muss jemand hinsehen und sie bewusst nachziehen.
 */
const MINDESTENS = 77;

/*
  Am 12.09.2026 sprang die Zahl von 49 auf 74 — ohne dass eine einzige
  Abfrage hinzugekommen wäre. Das Muster für die Postgres-Schicht verlangte
  eine Klammer unmittelbar hinter `abfragen`, die Aufrufe tragen aber fast
  alle eine Typangabe (`abfragen<Assignment>(…)`). Fünfundzwanzig Abfragen
  waren damit unbewacht, und der Test meldete grün.

  Die Lehre steht schon im Kopf dieser Datei und hat sich wiederholt: ein
  Wächter, der still weniger bewacht, ist schlimmer als keiner. Deshalb ist
  die Zahl Teil der Zusage — sie darf steigen, aber nie unbemerkt sinken.
*/

describe('Der Wächter bewacht noch, was er bewachen soll', () => {
  it(`findet mindestens ${MINDESTENS} Abfragen`, () => {
    expect(sammleAbfragen().length).toBeGreaterThanOrEqual(MINDESTENS);
  });

  it('findet Abfragen in fs/ UND in pg/', () => {
    // Sonst wäre die Zahl oben auch dann erfüllt, wenn eine ganze Seite
    // fehlte — solange die andere genug liefert.
    const dateien = new Set(sammleAbfragen().map((a) => a.datei));
    expect([...dateien].some((d) => d.startsWith('fs/'))).toBe(true);
    expect([...dateien].some((d) => d.startsWith('pg/'))).toBe(true);
  });
});
