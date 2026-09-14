/**
 * Was beim Anlegen eines Benutzers schiefging — in Worten, die weiterhelfen.
 *
 * WAS HIER FALSCH WAR. Die Ansicht fing jeden Fehlschlag ab und schrieb „Der
 * Benutzer konnte nicht angelegt werden." Das ist wahr und nutzlos: es sagt
 * nicht, ob die Adresse vergeben ist, ob der Anmeldedienst keine neuen Konten
 * annimmt oder ob gerade das Mailkontingent erschöpft ist. Wer es liest, kann
 * genau nichts tun.
 *
 * Aufgefallen ist das beim Umschalten auf Postgres — und zwar doppelt: die
 * einzige Ausnahme, die je durchkam, suchte nach `email-already-in-use`, und
 * das ist eine FIREBASE-Schreibweise. Supabase sagt „User already registered".
 * Nach dem Umschalten wäre also selbst die vergebene Adresse unter der
 * allgemeinen Meldung verschwunden.
 *
 * DIE REGEL, DIE HIER GILT: eine Meldung darf abkürzen, was sie kennt, und
 * muss durchreichen, was sie nicht kennt. Was hier keine bekannte Ursache
 * trifft, steht im Klartext da — lieber eine technische Meldung als gar
 * keine.
 */

/** Die Adresse ist schon vergeben — in beiden Schreibweisen. */
function schonVergeben(meldung: string): boolean {
  const m = meldung.toLowerCase();
  return m.includes('email-already-in-use')      // Firebase
    || m.includes('already registered')          // Supabase
    || m.includes('already been registered')
    || m.includes('user_already_exists');
}

/** Der Anmeldedienst nimmt gerade keine neuen Konten an. */
function keineAnmeldungen(meldung: string): boolean {
  const m = meldung.toLowerCase();
  return m.includes('signups not allowed')
    || m.includes('signup is disabled')
    || m.includes('signup_disabled');
}

/** Das Mailkontingent ist erschöpft. */
function mailGrenze(meldung: string): boolean {
  const m = meldung.toLowerCase();
  return m.includes('email rate limit') || m.includes('over_email_send_rate_limit');
}

/**
 * Die Meldung für die Ansicht.
 *
 * `bearbeitet` unterscheidet die Änderung eines bestehenden Benutzers von der
 * Neuanlage: bei einer Änderung greift keine der Anlage-Ursachen.
 */
export function anlegeFehler(fehler: unknown, bearbeitet: boolean): string {
  const roh = fehler instanceof Error ? fehler.message : '';

  if (!bearbeitet) {
    if (schonVergeben(roh)) return 'Diese E-Mail ist bereits vergeben.';
    if (keineAnmeldungen(roh)) {
      return 'Der Anmeldedienst nimmt derzeit keine neuen Konten an. '
        + 'Das ist eine Einstellung des Projekts, kein Fehler dieser Eingabe.';
    }
    if (mailGrenze(roh)) {
      return 'Der Anmeldedienst hat sein Mailkontingent für diese Stunde erschöpft. '
        + 'In einer Stunde geht es wieder — oder ein eigener Mailversand wird hinterlegt.';
    }
  }

  const grund = roh.trim();
  const kopf = bearbeitet
    ? 'Die Änderungen konnten nicht gespeichert werden.'
    : 'Der Benutzer konnte nicht angelegt werden.';
  return grund ? `${kopf} ${grund}` : kopf;
}
