/**
 * Der globale Administrator — ein Konto, das Betriebe ANLEGEN kann und in
 * keinen HINEINSIEHT.
 *
 * WOZU. Bisher entsteht ein neuer Betrieb über ein Skript, das jemand mit
 * einem Dienstkonto von Hand ausführt (`scripts/bootstrap-tenant.mjs`). Das
 * ist genau der Zustand, in dem ein Fehlgriff nicht auffällt: das Dienstkonto
 * kann alles, es bleibt kein Protokoll, und wer es hat, kommt auch an jeden
 * Kundenstamm.
 *
 * DIE ENTSCHEIDENDE EINSCHRÄNKUNG. Der globale Administrator bekommt einen
 * eigenen Claim (`plattformAdmin`) und mit ihm NICHT ein einziges Leserecht.
 * Die firestore.rules prüfen durchweg `resource.data.companyId ==
 * request.auth.token.companyId`; ein Token ohne `companyId` erfüllt das
 * nirgends. Das ist keine Nachlässigkeit, auf die man sich verlässt, sondern
 * die tragende Eigenschaft dieses Kontos — und sie ist in
 * `tests/rules/plattform.rules.test.ts` einzeln geprüft.
 *
 * Anders gesagt: dieses Konto kann einen Betrieb ins Leben rufen und danach
 * nie wieder etwas über ihn erfahren. Wer mehr braucht, braucht ein Konto IN
 * dem Betrieb — und das legt dessen Administration an, nicht die Plattform.
 *
 * WARUM NICHT EINFACH EINE ROLLE MEHR. Weil eine Rolle im
 * `users`-Dokument eines Betriebs steht und damit an einen Betrieb gebunden
 * wäre. Der globale Administrator gehört zu keinem — er hat kein
 * `users`-Dokument, keine `companyId`, und die App zeigt ihm folglich auch
 * keinen einzigen Reiter.
 */

/** Wo die globalen Administratoren stehen. Kein Client kommt an diese Sammlung. */
export const PLATTFORM_ADMINS = 'platformAdmins';

/** Wo festgehalten wird, wer wann welchen Betrieb angelegt hat. */
export const BETRIEBSANLAGEN = 'betriebsanlagen';

/** Was beim Anlegen eines Betriebs angegeben werden muss. */
export interface NeuerBetrieb {
  /** Anzeigename des Betriebs, z. B. „Perl Installationen". */
  name: string;
  /** Kennung des Mandanten — sie steht später in jedem Dokument. */
  companyId: string;
  /** E-Mail des ersten Administrators dieses Betriebs. */
  adminEmail: string;
  /** Name des ersten Administrators. */
  adminName: string;
}

/**
 * Was der Anlagevorgang festhält.
 *
 * BEWUSST OHNE GESCHÄFTSDATEN. Hier steht, dass ein Betrieb entstanden ist
 * und wer ihn angelegt hat — nicht, was in ihm passiert. Ein Protokoll, das
 * mitwüchse, wäre am Ende doch wieder ein Fenster in fremde Betriebe.
 */
export interface Betriebsanlage {
  companyId: string;
  name: string;
  /** Wer angelegt hat — die Auth-Kennung des globalen Administrators. */
  angelegtVon: string;
  angelegtAm: number;
  /** Die Kennung des ersten Administrators, damit man ihn wiederfindet. */
  ersterAdminUid: string;
}

/**
 * Wie eine Mandantenkennung aussehen darf.
 *
 * Sie wird zur Dokument-Id von `companies/{companyId}` und steht als Feld in
 * jedem einzelnen Datensatz. Ein Schrägstrich zerlegte den Pfad, ein
 * Leerzeichen macht jede spätere Abfrage von Hand zur Fehlerquelle, und
 * Grossbuchstaben lassen zwei Kennungen gleich aussehen, die es nicht sind.
 */
const KENNUNG = /^[a-z][a-z0-9-]{1,29}$/;

/**
 * Eine sehr einfache Prüfung auf eine E-Mail.
 *
 * ABSICHTLICH GROB. Sie soll den Vertipper abfangen („perl.at" ohne @), nicht
 * die Zustellbarkeit beweisen — das kann ohnehin nur ein Zustellversuch. Eine
 * strengere Regel würde gültige Adressen zurückweisen, und dann steht jemand
 * mit einer richtigen Adresse vor einem Formular, das ihn für falsch hält.
 */
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Was an der Eingabe nicht stimmt — oder `null`.
 *
 * Dieselbe Prüfung läuft im Browser und in der Function. Der Browser, damit
 * niemand ins Leere tippt; die Function, weil sie die einzige ist, die zählt.
 */
export function betriebFehler(b: Partial<NeuerBetrieb>): string | null {
  if (!b.name?.trim()) return 'Der Betrieb braucht einen Namen.';
  /*
    GEPRÜFT WIRD DIE FORM, DIE GESPEICHERT WÜRDE — nicht die getippte. Wer
    „Perl" eintippt, meint dieselbe Kennung wie „perl", und ihn dafür
    abzuweisen wäre eine Regel, die sich niemandem erschliesst. Gespeichert
    wird ohnehin nur die kleingeschriebene Form (`betriebNormalisiert`), es
    kann also gar nicht zwei geben, die gleich aussehen.
  */
  const kennung = (b.companyId ?? '').trim().toLowerCase();
  if (!KENNUNG.test(kennung)) {
    return 'Die Kennung besteht aus Kleinbuchstaben, Ziffern und Bindestrichen, beginnt mit einem Buchstaben und ist 2 bis 30 Zeichen lang.';
  }
  if (!MAIL.test((b.adminEmail ?? '').trim())) {
    return 'Die E-Mail des ersten Administrators fehlt oder ist unvollständig.';
  }
  if (!b.adminName?.trim()) return 'Der erste Administrator braucht einen Namen.';
  return null;
}

/** Die Eingabe in die Form bringen, in der sie gespeichert wird. */
export function betriebNormalisiert(b: NeuerBetrieb): NeuerBetrieb {
  return {
    name: b.name.trim(),
    companyId: b.companyId.trim().toLowerCase(),
    // Kleinbuchstaben: Firebase Auth behandelt Adressen ohnehin so, und zwei
    // Schreibweisen derselben Adresse ergäben sonst zwei Konten.
    adminEmail: b.adminEmail.trim().toLowerCase(),
    adminName: b.adminName.trim(),
  };
}
