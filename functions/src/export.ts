import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { jedesDokument } from './mandantendaten.js';

/**
 * DSGVO-Auskunft auf Knopfdruck: ein Mandant lädt seine kompletten Daten
 * herunter — technische Einlösung des „eure Daten gehören euch"-Versprechens.
 * Nur Geschäftsführung/Administrator.
 *
 * WAS AUSGELESEN WIRD, steht in `mandantendaten.ts` — dieselbe Liste, die
 * auch die nächtliche Ausleitung benutzt. Zwei Listen wären hier derselbe
 * Fehler wie zwei Implementierungen einer Formel.
 *
 * DIESE FUNCTION IST NICHT DIE SICHERUNG. Sie gibt alles in EINER Antwort
 * zurück, und Firebase deckelt die bei 10 MB — für einen Betrieb mit
 * Historie zu wenig. Die Sicherung ist `datenAusleitung`, die in einen
 * Speicherort schreibt und keine Größengrenze hat.
 */

/**
 * Obergrenze für die Antwort.
 *
 * Ohne eigene Grenze scheitert der Aufruf an der Firebase-Grenze, und zwar an
 * einer Stelle, an der niemand die Ursache erkennt: der Client bekommt einen
 * abgebrochenen Aufruf ohne Text. Lieber hier abbrechen und sagen, was los
 * ist — samt dem Weg, der stattdessen funktioniert.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export const exportCompanyData = onCall(
  {
    region: 'europe-west3',
    // Ein DSGVO-Export wird ein paar Mal im Jahr angefordert, liest dabei aber
    // den gesamten Mandanten. Eng begrenzen, damit wiederholtes Klicken nicht
    // die halbe Datenbank mehrfach parallel liest.
    maxInstances: 3,
    // Die Vorgaben (256 MiB, 60 s) reichten für einen Betrieb mit Historie
    // nicht: der Lauf liest jede Sammlung vollständig.
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
    const companyId = request.auth.token.companyId as string | undefined;
    const role = request.auth.token.role as string | undefined;
    if (!companyId) throw new HttpsError('permission-denied', 'Kein Mandantenkontext.');
    if (role !== 'Geschäftsführung' && role !== 'Administrator') {
      throw new HttpsError('permission-denied', 'Nur Geschäftsführung/Administrator.');
    }

    const out: Record<string, unknown[]> = {};
    let bytes = 0;

    await jedesDokument(getFirestore(), companyId, (sammlung, zeile) => {
      bytes += JSON.stringify(zeile).length;
      if (bytes > MAX_BYTES) {
        throw new HttpsError(
          'resource-exhausted',
          'Der Datenbestand ist zu groß für einen Download in einem Stück. ' +
            'Der vollständige Stand liegt in der nächtlichen Ausleitung.',
        );
      }
      (out[sammlung] ??= []).push(zeile);
    });

    const anzahl = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
    logger.info('Mandantenexport erstellt', { companyId, bytes, anzahl });

    return { companyId, exportedAt: new Date().toISOString(), anzahl, data: out };
  },
);
