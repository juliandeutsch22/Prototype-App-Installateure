import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { jedesDokument } from './mandantendaten.js';
import { abgelaufeneStaende, ausleitungsPfad, ausleitungsPraefix, jsonZeile } from './generated/ausleitungPlan.js';
import { laufFesthalten } from './laufFesthalten.js';

/**
 * Nächtliche Ausleitung: der Bestand jedes Mandanten an einen zweiten Ort.
 *
 * WOFÜR. Bisher lag alles ausschließlich in Firestore. Fällt das Projekt aus,
 * wird der Zugang gesperrt oder löscht jemand versehentlich eine Sammlung,
 * sind die Daten des Betriebs nicht greifbar — Rechnungen, Zeitkonten,
 * Kundenstamm. Das ist die einzige Lücke, die nicht nur die App betrifft,
 * sondern den Betrieb.
 *
 * WIE EHRLICH DIESE LÖSUNG IST. Ohne weitere Einstellung schreibt der Lauf in
 * den Standard-Bucket DESSELBEN Google-Projekts. Gegen einen Fehlgriff, eine
 * kaputte Migration oder eine versehentlich geleerte Sammlung hilft das
 * sofort. Gegen „der Zugang zum Projekt ist weg" hilft es NICHT — dafür muss
 * `AUSLEITUNG_BUCKET` auf einen Bucket außerhalb dieses Projekts zeigen,
 * besser außerhalb von Google. Solange das nicht gesetzt ist, ist die halbe
 * Strecke gewonnen und nicht die ganze; `docs/DEPLOYMENT.md` sagt, wie der
 * Rest geht.
 *
 * FORMAT. Zeilenweises JSON (`.jsonl`), eine Zeile je Dokument mit ihrer
 * Sammlung. So lässt sich der Stand schreiben und wieder einlesen, ohne ihn
 * je vollständig im Speicher zu halten — bei 15.660 Zeiteinträgen der
 * Unterschied zwischen „läuft" und „bricht ohne Meldung ab".
 */

const REGION = 'europe-west3';

/** Wohin. Leer = Standard-Bucket dieses Projekts (siehe Kopfkommentar). */
const ZIEL_BUCKET = process.env.AUSLEITUNG_BUCKET || undefined;

/** Wie lange Stände aufbewahrt werden. */
const AUFBEWAHRUNG_TAGE = Number(process.env.AUSLEITUNG_TAGE ?? 30);

interface Bilanz {
  companyId: string;
  zeilen: number;
  bytes: number;
  pfad: string;
}

/** Einen Mandanten wegschreiben. Gibt zurück, was geschrieben wurde. */
async function mandantAusleiten(companyId: string, heute: Date): Promise<Bilanz> {
  const db = getFirestore();
  const bucket = getStorage().bucket(ZIEL_BUCKET);
  const pfad = ausleitungsPfad(companyId, heute);

  const strom = bucket.file(pfad).createWriteStream({
    contentType: 'application/x-ndjson',
    // Ein wiederaufnehmbarer Upload legt für jede Datei zusätzliche
    // Zwischenstände an. Für Dateien dieser Größe ist das nur Aufwand.
    resumable: false,
  });

  let zeilen = 0;
  let bytes = 0;

  /**
   * Auf `drain` warten, statt blind weiterzuschreiben.
   *
   * Ohne das puffert Node alles, was schneller aus Firestore kommt, als es in
   * den Speicher hinausgeht — bei einem großen Mandanten also fast den
   * ganzen Bestand. Genau das, was die Seitenweise beim Lesen gerade
   * vermeidet.
   */
  async function schreibe(text: string) {
    zeilen += 1;
    bytes += Buffer.byteLength(text);
    if (!strom.write(text)) {
      await new Promise<void>((weiter) => strom.once('drain', weiter));
    }
  }

  const fertig = new Promise<void>((gut, schlecht) => {
    strom.on('finish', gut);
    strom.on('error', schlecht);
  });

  try {
    await jedesDokument(db, companyId, (sammlung, zeile) => schreibe(jsonZeile(sammlung, zeile)));
  } catch (e) {
    strom.destroy();
    throw e;
  }
  strom.end();
  await fertig;

  return { companyId, zeilen, bytes, pfad };
}

/**
 * Alte Stände wegräumen.
 *
 * Die Entscheidung, WAS weg darf, steht in `ausleitungPlan.ts` und ist dort
 * geprüft: nie etwas, das nicht wie ein Stand heißt, und nie der jüngste —
 * auch dann nicht, wenn er älter ist als die Frist. Ein Betrieb, bei dem die
 * Ausleitung wochenlang scheitert, stünde sonst am Ende ohne jeden Stand da.
 */
async function alteStaendeRaeumen(companyId: string, heute: Date): Promise<number> {
  const bucket = getStorage().bucket(ZIEL_BUCKET);
  const [dateien] = await bucket.getFiles({ prefix: ausleitungsPraefix(companyId) });
  const weg = abgelaufeneStaende(
    dateien.map((d) => d.name),
    heute,
    AUFBEWAHRUNG_TAGE,
  );
  for (const name of weg) await bucket.file(name).delete({ ignoreNotFound: true });
  return weg.length;
}

async function alleMandantenAusleiten(): Promise<Bilanz[]> {
  const db = getFirestore();
  const heute = new Date();
  // Die Mandantenliste ist naturgemäß kurz — ein Dokument je Betrieb.
  const firmen = await db.collection('companies').get();

  const bilanzen: Bilanz[] = [];
  for (const firma of firmen.docs) {
    try {
      const bilanz = await mandantAusleiten(firma.id, heute);
      const geraeumt = await alteStaendeRaeumen(firma.id, heute);
      bilanzen.push(bilanz);
      logger.info('Mandant ausgeleitet', { ...bilanz, geraeumt, ziel: ZIEL_BUCKET ?? 'Standard' });
      await laufFesthalten(firma.id, 'ausleitung', {
        erfolg: true,
        kennzahl: bilanz.zeilen,
        kennzahlEinheit: 'Zeilen',
        zielExtern: !!ZIEL_BUCKET,
      });
    } catch (e) {
      /**
       * Weitermachen: ein Mandant, der scheitert, darf die übrigen nicht
       * mitreißen. Der Fehlschlag steht im Protokoll, und der jüngste Stand
       * dieses Mandanten bleibt beim Aufräumen ausdrücklich verschont.
       *
       * ER STEHT SEIT DEM 07.09.2026 AUCH IN DER ÜBERWACHUNG. Vorher endete
       * er hier im Google-Protokoll, und dorthin sieht in einem
       * Installationsbetrieb niemand: die Sicherung konnte wochenlang
       * ausfallen, und bemerkt hätte man es an dem Tag, an dem man sie
       * braucht.
       */
      logger.error('Ausleitung fehlgeschlagen', { companyId: firma.id, e });
      await laufFesthalten(firma.id, 'ausleitung', {
        erfolg: false,
        meldung: e instanceof Error ? e.message : 'Unbekannter Fehler',
        zielExtern: !!ZIEL_BUCKET,
      });
    }
  }
  return bilanzen;
}

/**
 * Der nächtliche Lauf.
 *
 * 02:30, also vor dem Bilanzlauf um 03:15: die Ausleitung soll den Stand des
 * abgelaufenen Tages festhalten, nicht einen, der gerade umgerechnet wird.
 */
export const datenAusleitung = onSchedule(
  {
    region: REGION,
    schedule: '30 2 * * *',
    timeZone: 'Europe/Vienna',
    memory: '512MiB',
    // Ein grosser Mandant liest seinen ganzen Bestand. Die Vorgabe von 60 s
    // reicht dafuer nicht.
    timeoutSeconds: 540,
    retryCount: 1,
  },
  async () => {
    const bilanzen = await alleMandantenAusleiten();
    logger.info('Ausleitung beendet', {
      mandanten: bilanzen.length,
      zeilen: bilanzen.reduce((s, b) => s + b.zeilen, 0),
      bytes: bilanzen.reduce((s, b) => s + b.bytes, 0),
    });
  },
);

/**
 * Denselben Lauf von Hand anstossen — für Geschäftsführung und Administration.
 *
 * WARUM ES DAS GIBT. Eine Sicherung, die man nicht auslösen kann, prüft
 * niemand; und eine, die niemand je geprüft hat, ist keine. Nach dem
 * Einrichten einmal drücken zeigt in einem Zug, ob die Berechtigungen
 * stimmen, ob der Bucket erreichbar ist und wie gross der Stand ist.
 *
 * Ausgeleitet wird immer nur der EIGENE Mandant — der Zeitplan nimmt alle,
 * dieser Aufruf nicht.
 */
export const datenAusleitungJetzt = onCall(
  { region: REGION, memory: '512MiB', timeoutSeconds: 540, maxInstances: 2 },
  async (request) => {
    const companyId = request.auth?.token.companyId as string | undefined;
    const role = request.auth?.token.role as string | undefined;
    if (!companyId) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
    if (role !== 'Geschäftsführung' && role !== 'Administrator') {
      throw new HttpsError('permission-denied', 'Nur Geschäftsführung/Administrator.');
    }

    const heute = new Date();
    try {
      const bilanz = await mandantAusleiten(companyId, heute);
      const geraeumt = await alteStaendeRaeumen(companyId, heute);
      logger.info('Ausleitung von Hand', { ...bilanz, geraeumt });
      // Auch der Lauf VON HAND zählt: sonst stünde nach einer eben erst
      // ausgelösten Sicherung weiter „überfällig" da.
      await laufFesthalten(companyId, 'ausleitung', {
        erfolg: true,
        kennzahl: bilanz.zeilen,
        kennzahlEinheit: 'Zeilen',
        // AUCH VON HAND. Der Knopf ist der erste Lauf nach dem Einrichten —
        // genau der Moment, in dem die Frage „liegt der Stand ausserhalb
        // dieses Projekts?" beantwortet gehoert. Ohne das erfuehre man es
        // erst in der naechsten Nacht.
        zielExtern: !!ZIEL_BUCKET,
      });
      return { ...bilanz, geraeumt, ziel: ZIEL_BUCKET ?? 'Standard-Bucket des Projekts' };
    } catch (e) {
      await laufFesthalten(companyId, 'ausleitung', {
        erfolg: false,
        meldung: e instanceof Error ? e.message : 'Unbekannter Fehler',
        zielExtern: !!ZIEL_BUCKET,
      });
      throw e;
    }
  },
);
