import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import {
  EMPFAENGER_NEUE_ANFORDERUNG,
  empfaengerNeueAnforderung,
  istEilRelevant,
  istMeldepflichtigeAnforderung,
  istUebergangAufAbholbereit,
  textAbholbereit,
  textEilAbholbereit,
  textEilAngefordert,
  textNeueAnforderung,
  toteTokens,
  willMeldung,
  type MeldungsArt,
  type Meldung,
  type OrderDoc,
} from './notifyLogic.js';

/**
 * Push-Benachrichtigungen rund um Materialanforderungen.
 *
 * Drei Ereignisse:
 *  - neue Anforderung  -> Verwaltung, Geschäftsführung, Administrator
 *  - „Abholbereit"     -> der Monteur, der sie gestellt hat
 *  - EILZUSTELLUNG     -> zusätzlich die Projektleitung der Baustelle, bei
 *    beiden Ereignissen. Sie fährt ohnehin hin und kann das Material
 *    mitnehmen; deshalb muss sie es früh wissen und noch einmal, wenn es
 *    bereitliegt. Ohne zugeteilte Projektleitung gibt es niemanden zu
 *    verständigen — die Baustellenverwaltung weist beim Anlegen darauf hin.
 *
 * Die Empfänger werden serverseitig aus dem MANDANTEN der Anforderung
 * bestimmt, nie aus Client-Eingabe.
 *
 * Hier steht nur noch, was Firebase braucht: lesen, senden, aufräumen. Jede
 * ENTSCHEIDUNG liegt in `notifyLogic.ts` und ist dort einzeln geprüft — ein
 * Fehler in einem Ereignis-Trigger ist sonst unsichtbar: niemand bekommt
 * eine Meldung, und niemand merkt, dass eine gefehlt hat.
 */

const REGION = 'europe-west3';

/** Alle Gerätetokens der genannten Nutzer, sofern sie diese Meldung wollen. */
async function tokensFor(uids: string[], pref: MeldungsArt) {
  if (uids.length === 0) return [];
  const db = getFirestore();
  const tokens: string[] = [];
  // getAll statt einer Schleife mit Einzelabfragen: ein Betrieb kann zwanzig
  // Leute haben, und jede Runde kostet sonst eine eigene Latenz.
  const refs = uids.map((u) => db.collection('userPrefs').doc(u));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    if (!willMeldung(d, pref)) continue;
    for (const t of ((d?.pushTokens as string[] | undefined) ?? [])) tokens.push(t);
  }
  return [...new Set(tokens)];
}

/**
 * Verschickt und räumt dabei auf: Tokens, die der Dienst als endgültig
 * ungültig meldet, werden aus userPrefs entfernt. Ohne das wächst die Liste
 * mit jedem Gerätewechsel und jeder Versand läuft in dieselben Fehler.
 */
async function send(tokens: string[], data: Meldung) {
  if (tokens.length === 0) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    // Bewusst nur `data`, keine `notification`: so entscheidet allein der
    // Service Worker, wie die Meldung aussieht — sonst zeigen manche
    // Browser zusätzlich eine eigene, und der Nutzer sieht sie doppelt.
    data,
    webpush: { fcmOptions: { link: data.link } },
  });

  const db = getFirestore();
  const tot = toteTokens(tokens, res.responses);
  await Promise.all(
    tot.map(async (dead) => {
      const q = await db
        .collection('userPrefs')
        .where('pushTokens', 'array-contains', dead)
        .get();
      await Promise.all(
        q.docs.map((d) => d.ref.update({ pushTokens: FieldValue.arrayRemove(dead) })),
      );
    }),
  );

  logger.info('Push verschickt', {
    erfolgreich: res.successCount,
    fehlgeschlagen: res.failureCount,
    abgemeldet: tot.length,
  });
}

/**
 * Die zugeteilte Projektleitung einer Baustelle.
 *
 * Verknüpft wird über die projectNumber, nicht über eine Dokument-ID — so
 * hält es die ganze App (siehe types/index.ts). Zwei Gleichheitsfilter
 * brauchen in Firestore keinen zusammengesetzten Index.
 */
async function projectManagersOf(companyId: string, projectNumber: string): Promise<string[]> {
  const db = getFirestore();
  const snap = await db
    .collection('projects')
    .where('companyId', '==', companyId)
    .where('projectNumber', '==', projectNumber)
    .limit(1)
    .get();
  if (snap.empty) return [];
  const p = snap.docs[0].data() as { projectManagers?: string[] };
  return p.projectManagers ?? [];
}

/** Neue Materialanforderung -> Verwaltung und Leitung. */
export const notifyNewOrder = onDocumentCreated(
  { document: 'materialOrders/{id}', region: REGION, maxInstances: 10 },
  async (event) => {
    const order = event.data?.data() as OrderDoc | undefined;
    if (!istMeldepflichtigeAnforderung(order) || !order) return;

    const db = getFirestore();
    const users = await db
      .collection('users')
      .where('companyId', '==', order.companyId)
      .where('role', 'in', EMPFAENGER_NEUE_ANFORDERUNG)
      .get();

    const uids = empfaengerNeueAnforderung(
      users.docs.map((d) => d.data() as { uid?: string; active?: boolean }),
      order.userId,
    );
    await send(await tokensFor(uids, 'notifyNewOrder'), textNeueAnforderung(order));

    if (!istEilRelevant(order)) return;
    const leitung = (
      await projectManagersOf(order.companyId as string, order.projectNumber as string)
    ).filter((uid) => uid !== order.userId);
    if (leitung.length === 0) {
      logger.info('Eilzustellung ohne zugeteilte Projektleitung', {
        projectNumber: order.projectNumber,
      });
      return;
    }
    await send(
      await tokensFor(leitung, 'notifyUrgentDelivery'),
      textEilAngefordert(order, event.params.id),
    );
  },
);

/** Status auf „Abholbereit" -> der Monteur, der angefordert hat. */
export const notifyOrderReady = onDocumentUpdated(
  { document: 'materialOrders/{id}', region: REGION, maxInstances: 10 },
  async (event) => {
    const before = event.data?.before.data() as OrderDoc | undefined;
    const after = event.data?.after.data() as OrderDoc | undefined;
    if (!istUebergangAufAbholbereit(before, after) || !after) return;

    await send(
      await tokensFor([after.userId as string], 'notifyOrderReady'),
      textAbholbereit(after, event.params.id),
    );

    // Bei einer Eilzustellung erfährt es auch die Projektleitung — sie ist
    // diejenige, die es mitnimmt. Der Besteller sitzt auf der Baustelle und
    // kann ohnehin nicht selbst fahren.
    if (!istEilRelevant(after)) return;
    const leitung = await projectManagersOf(
      after.companyId as string,
      after.projectNumber as string,
    );
    await send(
      await tokensFor(leitung, 'notifyUrgentDelivery'),
      textEilAbholbereit(after, event.params.id),
    );
  },
);
