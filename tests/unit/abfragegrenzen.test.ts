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
  for (const datei of readdirSync(DB_VERZEICHNIS).filter((f) => f.endsWith('.ts'))) {
    // core.ts hält die Bausteine selbst — dort steht die Grenze naturgemäß
    // nicht, sie wird von den Aufrufern mitgegeben.
    if (datei === 'core.ts') continue;
    const text = readFileSync(join(DB_VERZEICHNIS, datei), 'utf8');

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
      if (!/queryTenant|subscribeTenant|getDocs\(|onSnapshot\(/.test(koerper)) continue;
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
