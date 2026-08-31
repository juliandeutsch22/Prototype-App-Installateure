import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * DSGVO-Datenexport (Spec §10): Ein Mandant kann seine kompletten Daten
 * exportieren — technische Einlösung des „eure Daten gehören euch"-Versprechens.
 * Nur Geschäftsführung/Administrator. Liefert alle Collections gefiltert auf
 * die eigene companyId.
 */
const EXPORTABLE = [
  'companies',
  'users',
  'projects',
  'assignments',
  'materials',
  'materialOrders',
  'timeEntries',
  'invoices',
  'followUps',
] as const;

export const exportCompanyData = onCall(
  // Ein DSGVO-Export wird ein paar Mal im Jahr angefordert, liest dabei aber
  // den gesamten Mandanten. Eng begrenzen, damit wiederholtes Klicken nicht
  // die halbe Datenbank mehrfach parallel liest.
  { region: 'europe-west3', maxInstances: 3 },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
  const companyId = request.auth.token.companyId as string | undefined;
  const role = request.auth.token.role as string | undefined;
  if (!companyId) throw new HttpsError('permission-denied', 'Kein Mandantenkontext.');
  if (role !== 'Geschäftsführung' && role !== 'Administrator') {
    throw new HttpsError('permission-denied', 'Nur Geschäftsführung/Administrator.');
  }

  const db = getFirestore();
  const out: Record<string, unknown[]> = {};

  for (const name of EXPORTABLE) {
    if (name === 'companies') {
      const doc = await db.collection('companies').doc(companyId).get();
      out[name] = doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
    } else {
      const snap = await db.collection(name).where('companyId', '==', companyId).get();
      out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  }

  return { companyId, exportedAt: new Date().toISOString(), data: out };
});
