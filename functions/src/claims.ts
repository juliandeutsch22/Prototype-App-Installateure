import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

/**
 * Setzt companyId + role als Custom Auth Claims, sobald ein users-Dokument
 * geschrieben wird. Diese Claims sind das Fundament der firestore.rules
 * (Spec §7) — sie kommen serverseitig aus dem vertrauenswürdigen
 * users-Dokument, NIE aus Client-Eingabe.
 *
 * Region: europe-west3 (Frankfurt) für DSGVO (Spec §10).
 */
export const syncUserClaims = onDocumentWritten(
  // maxInstances als Kostenbremse: ein Betrieb dieser Größe schreibt am Tag
  // eine Handvoll Nutzerdokumente. Ohne Obergrenze könnte ein fehlerhafter
  // Massenimport beliebig viele Instanzen hochziehen und Kosten verursachen.
  { document: 'users/{userId}', region: 'europe-west3', maxInstances: 10 },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // Dokument gelöscht: nichts zu tun

    const data = after.data() as { uid?: string; companyId?: string; role?: string };
    const { uid, companyId, role } = data;

    if (!uid || !companyId || !role) {
      logger.warn('users-Dokument ohne uid/companyId/role — Claims nicht gesetzt', {
        docId: event.params.userId,
      });
      return;
    }

    try {
      await getAuth().setCustomUserClaims(uid, { companyId, role });
      logger.info('Custom Claims gesetzt', { uid, companyId, role });
    } catch (err) {
      logger.error('Custom Claims konnten nicht gesetzt werden', { uid, err });
    }
  },
);
