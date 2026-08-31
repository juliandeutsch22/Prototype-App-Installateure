import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

/**
 * Push-Benachrichtigungen rund um Materialanforderungen.
 *
 * Zwei Ereignisse, zwei Empfängerkreise:
 *  - neue Anforderung  -> Verwaltung, Geschäftsführung, Administrator
 *  - „Abholbereit"     -> der Monteur, der sie gestellt hat
 *
 * Die Empfänger werden serverseitig aus dem MANDANTEN der Anforderung
 * bestimmt, nie aus Client-Eingabe. Wer nichts eingestellt hat, bekommt die
 * Meldung (siehe PREFS_DEFAULTS im Client): nichts zu verpassen ist der
 * hilfreichere Ausgangszustand, Abschalten bleibt ein bewusster Schritt.
 */

const REGION = 'europe-west3';
const EMPFAENGER_NEUE_ANFORDERUNG = ['Verwaltung', 'Geschäftsführung', 'Administrator'];

interface OrderDoc {
  companyId?: string;
  materialName?: string;
  quantity?: number;
  projectNumber?: string;
  userId?: string;
  userName?: string;
  status?: string;
  transactionType?: string;
}

/** Alle Gerätetokens der genannten Nutzer, sofern sie diese Meldung wollen. */
async function tokensFor(uids: string[], pref: 'notifyNewOrder' | 'notifyOrderReady') {
  if (uids.length === 0) return [];
  const db = getFirestore();
  const tokens: string[] = [];
  // getAll statt einer Schleife mit Einzelabfragen: ein Betrieb kann zwanzig
  // Leute haben, und jede Runde kostet sonst eine eigene Latenz.
  const refs = uids.map((u) => db.collection('userPrefs').doc(u));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (!snap.exists) continue; // nie etwas eingestellt -> auch kein Gerät registriert
    const d = snap.data() as { pushTokens?: string[] } & Record<string, unknown>;
    // Nur explizit abgeschaltet zählt als Nein.
    if (d[pref] === false) continue;
    for (const t of d.pushTokens ?? []) tokens.push(t);
  }
  return [...new Set(tokens)];
}

/**
 * Verschickt und räumt dabei auf: Tokens, die der Dienst als endgültig
 * ungültig meldet (App deinstalliert, Browserdaten gelöscht), werden aus
 * userPrefs entfernt. Ohne das wächst die Liste mit jedem Gerätewechsel und
 * jeder Versand läuft in dieselben Fehler.
 */
async function send(
  tokens: string[],
  data: { title: string; body: string; link: string; tag: string },
) {
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
  await Promise.all(
    res.responses.map(async (r, i) => {
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        const dead = tokens[i];
        const q = await db.collection('userPrefs').where('pushTokens', 'array-contains', dead).get();
        await Promise.all(
          q.docs.map((d) => d.ref.update({ pushTokens: FieldValue.arrayRemove(dead) })),
        );
      }
    }),
  );

  logger.info('Push verschickt', {
    erfolgreich: res.successCount,
    fehlgeschlagen: res.failureCount,
  });
}

/** Neue Materialanforderung -> Verwaltung und Leitung. */
export const notifyNewOrder = onDocumentCreated(
  { document: 'materialOrders/{id}', region: REGION, maxInstances: 10 },
  async (event) => {
    const order = event.data?.data() as OrderDoc | undefined;
    if (!order?.companyId) return;
    // Retouren sind Rückgaben, keine Anforderung — dafür muss niemand laufen.
    if (order.transactionType === 'return') return;

    const db = getFirestore();
    const users = await db
      .collection('users')
      .where('companyId', '==', order.companyId)
      .where('role', 'in', EMPFAENGER_NEUE_ANFORDERUNG)
      .get();

    const uids = users.docs
      .map((d) => d.data() as { uid?: string; active?: boolean })
      .filter((u) => u.uid && u.active !== false)
      .map((u) => u.uid as string)
      // Wer selbst anfordert, braucht die eigene Meldung nicht.
      .filter((uid) => uid !== order.userId);

    const tokens = await tokensFor(uids, 'notifyNewOrder');
    const menge = order.quantity ?? 1;
    await send(tokens, {
      title: 'Neue Materialanforderung',
      body: `${menge}× ${order.materialName ?? 'Material'}${
        order.userName ? ` — ${order.userName}` : ''
      }${order.projectNumber ? ` (${order.projectNumber})` : ''}`,
      link: '/admin-orders',
      // Alle offenen Anforderungen teilen sich eine Kennung: bei fünf
      // Meldungen kurz hintereinander bleibt eine im Sperrbildschirm stehen.
      tag: 'material-neu',
    });
  },
);

/** Status auf „Abholbereit" -> der Monteur, der angefordert hat. */
export const notifyOrderReady = onDocumentUpdated(
  { document: 'materialOrders/{id}', region: REGION, maxInstances: 10 },
  async (event) => {
    const before = event.data?.before.data() as OrderDoc | undefined;
    const after = event.data?.after.data() as OrderDoc | undefined;
    if (!after?.userId) return;
    // Nur der ÜBERGANG zählt. Ohne diese Prüfung löste jede spätere
    // Änderung an einer abholbereiten Anforderung dieselbe Meldung erneut aus.
    if (before?.status === after.status || after.status !== 'Abholbereit') return;

    const tokens = await tokensFor([after.userId], 'notifyOrderReady');
    await send(tokens, {
      title: 'Material abholbereit',
      body: `${after.quantity ?? 1}× ${after.materialName ?? 'Material'} liegt bereit${
        after.projectNumber ? ` (${after.projectNumber})` : ''
      }`,
      link: '/order',
      tag: `material-bereit-${event.params.id}`,
    });
  },
);
