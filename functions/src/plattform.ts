import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import {
  BETRIEBSANLAGEN,
  PLATTFORM_ADMINS,
  betriebFehler,
  betriebNormalisiert,
  type NeuerBetrieb,
} from './generated/plattform.js';

/**
 * Der globale Administrator: Betriebe anlegen, in keinen hineinsehen.
 *
 * Warum es dieses Konto gibt und warum es nichts lesen darf, steht in
 * `shared/plattform.ts`. Hier steht, wie es technisch entsteht — und wo die
 * Fallen liegen.
 */

const REGION = 'europe-west3';

/**
 * Der Claim, der den globalen Administrator ausmacht.
 *
 * Er entsteht aus einem Dokument in `platformAdmins`, an das KEIN Client
 * herankommt (firestore.rules: die Sammlung fällt unter das abschliessende
 * `allow read, write: if false`). Wer einen globalen Administrator ernennen
 * will, braucht die Firebase-Konsole oder ein Dienstkonto — also genau die
 * Hürde, die ein solches Konto verdient.
 */
export const plattformAdminClaim = onDocumentWritten(
  { document: `${PLATTFORM_ADMINS}/{uid}`, region: REGION, maxInstances: 5 },
  async (event) => {
    const uid = event.params.uid;
    const da = !!event.data?.after?.exists;

    try {
      /**
       * EIN GLOBALER ADMINISTRATOR GEHÖRT ZU KEINEM BETRIEB — UND DAS WIRD
       * HIER DURCHGESETZT, NICHT NUR ANGENOMMEN.
       *
       * `setCustomUserClaims` ersetzt die Claims vollständig, und
       * `syncUserClaims` schreibt sie bei jeder Änderung am users-Dokument
       * neu. Gäbe es für dieselbe Kennung beides, entschiede allein die
       * Reihenfolge der beiden Trigger, welche Claims am Ende stehen: mal
       * ein Plattformkonto, mal ein Konto MIT companyId — und mit einer
       * companyId im Token greift jede einzelne Leseregel. Ein Zufall
       * entschiede also über Leserechte an fremden Kundendaten.
       *
       * Deshalb wird hier abgelehnt statt zusammengeführt. Wer die Rechte
       * eines Betriebs braucht, braucht ein Konto IN dem Betrieb — ein
       * zweites, mit eigener Adresse.
       */
      const alsMitarbeiter = await getFirestore().collection('users').doc(uid).get();
      if (da && alsMitarbeiter.exists) {
        logger.error(
          'Plattform-Claim abgelehnt: die Kennung gehört bereits zu einem Betrieb',
          { uid, companyId: alsMitarbeiter.data()?.companyId },
        );
        return;
      }

      /*
        Ohne `users`-Dokument gibt es keinen zweiten Schreiber: `syncUserClaims`
        wird für diese Kennung nie ausgelöst. Die Claims dürfen deshalb
        vollständig gesetzt werden — ohne zusätzlichen Abruf bei Google, der
        auf dem heissen Pfad des ANDEREN Triggers Kosten und eine weitere
        Fehlerquelle wäre.
      */
      await getAuth().setCustomUserClaims(uid, da ? { plattformAdmin: true } : {});
      // Ohne Widerruf liefe ein bereits ausgestelltes Token bis zu einer
      // Stunde weiter — beim ENTZIEHEN ist genau das der Punkt.
      if (!da) await getAuth().revokeRefreshTokens(uid);
      logger.info('Plattform-Administrator gesetzt', { uid, plattformAdmin: da });
    } catch (err) {
      logger.error('Plattform-Claim konnte nicht gesetzt werden', { uid, err });
    }
  },
);

interface Antwort {
  companyId: string;
  ersterAdminUid: string;
  /**
   * Der Link, mit dem der erste Administrator sein Passwort setzt.
   *
   * WARUM ER ZURÜCKKOMMT statt versendet zu werden: der Betrieb versendet
   * seine Post selbst, und eine Mailanbindung wäre ein weiterer Dienst mit
   * einem weiteren Auftragsverarbeitungsvertrag. Der globale Administrator
   * hat das Konto gerade selbst erzeugt — der Link gibt ihm nichts, was er
   * nicht ohnehin schon hätte.
   */
  passwortLink: string;
}

/**
 * Einen Betrieb anlegen.
 *
 * ERSETZT `scripts/bootstrap-tenant.mjs` FÜR DEN LAUFENDEN BETRIEB. Das
 * Skript braucht ein Dienstkonto — und ein Dienstkonto kann alles, hinterlässt
 * kein Protokoll und kommt auch an jeden Kundenstamm. Dieser Weg kann genau
 * eines: einen neuen, leeren Betrieb erzeugen.
 */
export const betriebAnlegen = onCall<Partial<NeuerBetrieb>, Promise<Antwort>>(
  { region: REGION, maxInstances: 2 },
  async (req) => {
    if (req.auth?.token.plattformAdmin !== true) {
      throw new HttpsError('permission-denied', 'Nur der globale Administrator.');
    }

    const fehler = betriebFehler(req.data ?? {});
    if (fehler) throw new HttpsError('invalid-argument', fehler);
    const betrieb = betriebNormalisiert(req.data as NeuerBetrieb);

    const db = getFirestore();
    const firmaRef = db.collection('companies').doc(betrieb.companyId);
    if ((await firmaRef.get()).exists) {
      throw new HttpsError(
        'already-exists',
        `Die Kennung „${betrieb.companyId}" ist vergeben. Ein zweiter Betrieb darauf würde seine Daten mit dem bestehenden vermischen.`,
      );
    }

    /**
     * EINE BESTEHENDE ADRESSE WIRD ABGEWIESEN, NICHT WIEDERVERWENDET.
     *
     * Die Claims hängen an der Auth-Kennung, nicht am `users`-Dokument.
     * Bekäme dieselbe Person ein zweites `users`-Dokument in einem zweiten
     * Betrieb, entschiede allein die Reihenfolge der Trigger, in welchem sie
     * landet — und sie stünde eines Morgens im falschen Betrieb, ohne dass
     * jemand etwas geändert hätte. Ein Konto gehört zu einem Betrieb.
     */
    try {
      await getAuth().getUserByEmail(betrieb.adminEmail);
      throw new HttpsError(
        'already-exists',
        `Zu ${betrieb.adminEmail} gibt es schon ein Konto. Ein Konto gehört zu genau einem Betrieb — bitte eine andere Adresse verwenden.`,
      );
    } catch (e) {
      // `getUserByEmail` wirft, wenn es die Adresse NICHT gibt: das ist der
      // gewünschte Fall. Nur die eigene Absage darf durch.
      if (e instanceof HttpsError) throw e;
    }

    const konto = await getAuth().createUser({
      email: betrieb.adminEmail,
      displayName: betrieb.adminName,
      emailVerified: false,
      /*
        EIN ZUFALLSPASSWORT, DAS NIEMAND ERFÄHRT. Ein Konto ganz ohne
        Passwort hat keinen Passwort-Anbieter, und für ein solches lässt sich
        kein Rücksetzlink erzeugen — der erste Administrator käme nie hinein.
        Gesetzt wird das Passwort gleich darauf von ihm selbst.
      */
      password: `${Date.now()}-${Math.random().toString(36).slice(2)}-Aa1!`,
    });

    try {
      const jetzt = Date.now();
      const batch = db.batch();
      batch.set(firmaRef, {
        name: betrieb.name,
        rates: {
          fach: 65,
          helper: 45,
          nightSurcharge: 0.5,
          emergencySurcharge: 1,
          vatRate: 0.2,
          dueDays: 14,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      /*
        Nach uid geschlüsselt, wie überall: der erste Profil-Abruf beim
        Anmelden ist damit ein einzelnes `get` und braucht keine Abfrage, die
        die Regeln ohne companyId gar nicht zuliessen.
      */
      batch.set(db.collection('users').doc(konto.uid), {
        uid: konto.uid,
        companyId: betrieb.companyId,
        name: betrieb.adminName,
        email: betrieb.adminEmail,
        role: 'Administrator',
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.collection(BETRIEBSANLAGEN).doc(betrieb.companyId), {
        companyId: betrieb.companyId,
        name: betrieb.name,
        angelegtVon: req.auth.uid,
        angelegtAm: jetzt,
        ersterAdminUid: konto.uid,
      });
      // Ein Batch, nicht drei Schreibvorgänge: ein Betrieb ohne
      // Administrator wäre nicht zu betreten und nicht zu reparieren.
      await batch.commit();
    } catch (e) {
      /*
        AUFRÄUMEN, WENN DIE DATENBANK NICHT MITSPIELT. Sonst bliebe ein
        Auth-Konto ohne Betrieb zurück — und die nächste Anlage mit derselben
        Adresse scheiterte an genau diesem Rest, ohne dass irgendwo stünde,
        warum.
      */
      await getAuth()
        .deleteUser(konto.uid)
        .catch(() => undefined);
      throw e;
    }

    const passwortLink = await getAuth().generatePasswordResetLink(betrieb.adminEmail);

    logger.info('Betrieb angelegt', {
      companyId: betrieb.companyId,
      angelegtVon: req.auth.uid,
    });
    return { companyId: betrieb.companyId, ersterAdminUid: konto.uid, passwortLink };
  },
);
