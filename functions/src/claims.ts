import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

/**
 * Setzt companyId + role + active als Custom Auth Claims, sobald ein
 * users-Dokument geschrieben wird. Diese Claims sind das Fundament der
 * firestore.rules (Spec §7) — sie kommen serverseitig aus dem
 * vertrauenswürdigen users-Dokument, NIE aus Client-Eingabe.
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

    const data = after.data() as {
      uid?: string;
      companyId?: string;
      role?: string;
      active?: boolean;
    };
    const { uid, companyId, role } = data;

    if (!uid || !companyId || !role) {
      logger.warn('users-Dokument ohne uid/companyId/role — Claims nicht gesetzt', {
        docId: event.params.userId,
      });
      return;
    }

    /**
     * FEHLT DAS FELD, GILT AKTIV. Dieselbe Lesart wie überall sonst in der App
     * (`u.active !== false`): übernommene Altbestände tragen es nicht, und ein
     * Import dürfte niemanden aussperren, der nie deaktiviert wurde.
     */
    const aktiv = data.active !== false;

    try {
      await getAuth().setCustomUserClaims(uid, { companyId, role, active: aktiv });

      /**
       * DEAKTIVIEREN MUSS DEN SERVER ERREICHEN, NICHT NUR DIE OBERFLÄCHE.
       *
       * Vorher stand die Prüfung ausschließlich im Browser (`loadProfile`).
       * Ein ausgeschiedener Mitarbeiter behielt damit ein gültiges Konto mit
       * gültigen Claims: mit seinem Passwort und dem Firestore-SDK kam er
       * unverändert an Kunden, Baustellen und Scheine — die App ließ ihn nur
       * nicht mehr hinein. „Deaktiviert" war eine Anzeigeeinstellung.
       *
       * Drei Riegel, weil jeder für sich eine Lücke lässt:
       *
       *   1. Das Auth-Konto sperren. Wirkt sofort und absolut, aber erst beim
       *      nächsten Anmeldeversuch.
       *   2. Die Sitzungstoken widerrufen. Ohne das liefe ein bereits
       *      ausgestelltes Token noch bis zu einer Stunde weiter.
       *   3. Der `active`-Claim, den die Regeln prüfen — er greift auch dort,
       *      wo ein Token trotz allem noch gültig scheint.
       *
       * Das Zurücknehmen gehört dazu: ohne `disabled: false` käme ein wieder
       * eingestellter Mitarbeiter nie mehr herein, und niemand fände den
       * Grund, weil im Firestore alles richtig aussähe.
       */
      await getAuth().updateUser(uid, { disabled: !aktiv });
      if (!aktiv) await getAuth().revokeRefreshTokens(uid);

      logger.info('Custom Claims gesetzt', { uid, companyId, role, active: aktiv });
    } catch (err) {
      logger.error('Custom Claims konnten nicht gesetzt werden', { uid, err });
    }
  },
);
