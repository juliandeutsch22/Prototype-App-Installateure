import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createHash } from 'node:crypto';
import { kanonischerInhalt, type HashbarerSchein } from './generated/scheinHash.js';

/**
 * Die Prüfsumme eines unterschriebenen Handwerksscheins — serverseitig.
 *
 * WARUM NICHT IM BROWSER. Eine Prüfsumme, die der Client selbst mitliefert,
 * beweist nichts: wer den Inhalt fälschen wollte, würde die passende
 * Prüfsumme gleich mitfälschen. Erst weil sie hier entsteht — nach dem
 * Schreiben, aus dem, was tatsächlich in der Datenbank steht — hat sie Wert.
 *
 * WANN. Genau einmal, beim Übergang nach „Unterschrieben". Ein Schein im
 * Entwurf ändert sich noch; einen Storno lässt die Prüfsumme unberührt, denn
 * er ändert den Inhalt nicht.
 *
 * Der Schreibvorgang läuft über das Admin-SDK und ist damit nicht an die
 * Firestore-Rules gebunden — die verbieten jede Änderung an einem
 * unterschriebenen Schein, und genau so soll es für den Client auch bleiben.
 */

const REGION = 'europe-west3';

export const scheinPruefsumme = onDocumentWritten(
  { region: REGION, document: 'workSheets/{id}' },
  async (event) => {
    const nachher = event.data?.after?.data() as
      | (HashbarerSchein & { status?: string; inhaltHash?: string })
      | undefined;
    if (!nachher) return;

    // Nur der unterschriebene Schein bekommt eine Prüfsumme, und nur einmal.
    if (nachher.status !== 'Unterschrieben') return;
    if (nachher.inhaltHash) return;

    try {
      const hash = createHash('sha256').update(kanonischerInhalt(nachher), 'utf8').digest('hex');
      await getFirestore()
        .collection('workSheets')
        .doc(event.params.id)
        .update({ inhaltHash: hash });
      logger.info('Prüfsumme gesetzt', { id: event.params.id });
    } catch (e) {
      // Ein Fehlschlag darf den Schein nicht ungültig machen: die Unterschrift
      // steht, der Inhalt ist eingefroren. Die Prüfsumme lässt sich
      // nachtragen; das PDF sagt in diesem Fall ausdrücklich, dass sie fehlt.
      logger.error('Prüfsumme fehlgeschlagen', { id: event.params.id, e });
    }
  },
);
