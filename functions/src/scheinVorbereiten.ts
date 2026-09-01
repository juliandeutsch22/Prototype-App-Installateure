import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { calcWorkMin } from './generated/arbeitszeit.js';

/**
 * Die Positionen für einen Handwerksschein — serverseitig zusammengestellt.
 *
 * WARUM NICHT IM BROWSER. Der Schein braucht die Stunden der GANZEN
 * Mannschaft eines Tages: der Kunde unterschreibt für alle, die dort waren,
 * nicht nur für den, der gerade das Tablet hält. Ein Monteur darf die
 * Zeiteinträge seiner Kollegen aber nicht lesen — die Firestore-Rules
 * verbieten es, und das aus gutem Grund: Zeiteinträge tragen Kranken- und
 * Urlaubstage und damit Gesundheitsdaten im Sinne von Art. 9 DSGVO.
 *
 * Der naheliegende Ausweg wäre gewesen, die Regel aufzuweichen und
 * Anwesenheitseinträge betriebsweit lesbar zu machen. Das hätte funktioniert
 * — und nebenbei jedem Monteur offengelegt, wer wann auf welcher Baustelle
 * war. Eine Datenschutzgrenze aufzumachen, weil eine Ansicht sonst umständlich
 * wird, ist die falsche Reihenfolge.
 *
 * Stattdessen stellt der Server genau das zusammen, was auf den Schein
 * gehört: Anwesenheitszeiten EINER Baustelle an EINEM Tag, dazu das
 * angeforderte Material. Krank- und Urlaubstage sind darin per Definition
 * nicht enthalten. Der Aufrufer bekommt nichts, was er nicht ohnehin vor Ort
 * sieht — die Kollegen stehen neben ihm.
 */

const REGION = 'europe-west3';

interface Antwort {
  zeiten: Array<{
    datum: string;
    mitarbeiter: string;
    von?: string;
    bis?: string;
    pauseMin?: number;
    minuten: number;
    taetigkeit?: string;
    helfer?: boolean;
  }>;
  material: Array<{ name: string; menge: number }>;
}

/** Wie die App: ein führendes „PR-" aus Altbeständen angleichen. */
function norm(n: string): string {
  return (n ?? '').trim().toLowerCase().replace(/^pr-/, '');
}

export const scheinVorbereiten = onCall<{ projectNumber?: string; datum?: string }, Promise<Antwort>>(
  { region: REGION },
  async (req) => {
    const claims = req.auth?.token as { companyId?: string } | undefined;
    const companyId = claims?.companyId;
    if (!companyId) throw new HttpsError('unauthenticated', 'Keine Anmeldung.');

    const projectNumber = (req.data?.projectNumber ?? '').trim();
    const datum = (req.data?.datum ?? '').trim();
    if (!projectNumber || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      throw new HttpsError('invalid-argument', 'Baustelle und Datum sind nötig.');
    }

    const db = getFirestore();

    /**
     * Nur ANWESENHEIT, nur dieser Tag, nur diese Baustelle.
     *
     * Die drei Einschränkungen zusammen sind der Grund, warum diese Function
     * die Rules umgehen darf: was sie zurückgibt, ist genau der Inhalt des
     * Belegs — und der wird ohnehin gleich unterschrieben.
     */
    const zeitSnap = await db
      .collection('timeEntries')
      .where('companyId', '==', companyId)
      .where('date', '==', datum)
      .get();

    const zeiten: Antwort['zeiten'] = [];
    for (const d of zeitSnap.docs) {
      const e = d.data() as {
        status?: string;
        projectNumber?: string;
        userName?: string;
        startTime?: string;
        endTime?: string;
        breakDuration?: number;
        hours?: number;
        comment?: string;
        isHelper?: boolean;
      };
      if (e.status !== 'Anwesend') continue;
      if (norm(e.projectNumber ?? '') !== norm(projectNumber)) continue;
      zeiten.push({
        datum,
        mitarbeiter: e.userName ?? 'Mitarbeiter',
        von: e.startTime,
        bis: e.endTime,
        pauseMin: e.breakDuration,
        minuten: calcWorkMin({
          status: 'Anwesend',
          startTime: e.startTime,
          endTime: e.endTime,
          breakDuration: e.breakDuration,
          hours: e.hours,
        }),
        taetigkeit: e.comment,
        helfer: !!e.isHelper,
      });
    }
    zeiten.sort((a, b) => a.mitarbeiter.localeCompare(b.mitarbeiter, 'de'));

    const matSnap = await db
      .collection('materialOrders')
      .where('companyId', '==', companyId)
      .where('status', 'in', ['Offen', 'In Bearbeitung', 'Abholbereit'])
      .get();

    const material: Antwort['material'] = [];
    for (const d of matSnap.docs) {
      const o = d.data() as {
        transactionType?: string;
        projectNumber?: string;
        materialName?: string;
        quantity?: number;
      };
      if (o.transactionType === 'return') continue;
      if (norm(o.projectNumber ?? '') !== norm(projectNumber)) continue;
      material.push({ name: o.materialName ?? 'Material', menge: o.quantity ?? 0 });
    }

    return { zeiten, material };
  },
);
