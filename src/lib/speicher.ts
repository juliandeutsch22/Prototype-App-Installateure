/**
 * WAS DIE APP IM BROWSER LIEGEN LÄSST — und wann es wieder geht
 * (Testbericht 30.09.2026, M9).
 *
 * Auf geteilten Tablets und Lager-PCs blieben nach dem Abmelden Profil,
 * Firma und Warenkorb früherer Nutzer im lokalen Speicher, dazu Reste der
 * Firestore-Zeit. Die Schlüssel trugen noch den Namen des Pilotbetriebs
 * („perl“) statt den des Produkts.
 *
 * DREI DINGE STEHEN HIER:
 *   - `schluesselUmziehen` — einmal beim Start: „perl…“ wird „senklot…“, der
 *     Wert bleibt. Ein schon vorhandener neuer Schlüssel gewinnt.
 *   - `firestoreResteEntfernen` — die Datenbanken des alten Firestore-SDK und
 *     der alten Firebase-Anmeldung. NICHT die von Firebase Messaging: über sie
 *     läuft der Push weiter (`lib/push.ts`).
 *   - `benutzerSpurenLoeschen` — beim Abmelden alles, was einem Nutzer gehört.
 *
 * WAS BLEIBT, mit Absicht: die Einstellung „angemeldet bleiben“ (sie gehört
 * zum Gerät), die Merker des Service Workers und das Ausgangsfach. Was dort
 * ohne Empfang vorgemerkt ist, geht erst hinaus, wenn sich sein Besitzer auf
 * diesem Gerät wieder anmeldet — gelöscht wäre es verloren. Die App fragt vor
 * dem Abmelden danach (Layout, „Noch nicht gesendet“).
 */

/** Der alte Anfang → der neue. Die längste Übereinstimmung steht zuerst. */
const UMZUG: ReadonlyArray<readonly [string, string]> = [
  ['perl_cart_v2:', 'senklot.warenkorb:'],
  ['perl.', 'senklot.'],
  ['perl:', 'senklot:'],
];

/** Was einem Nutzer gehört und beim Abmelden geht. */
const JE_NUTZER_LOKAL = ['senklot.sitzung.', 'senklot.letzteFirma.', 'senklot.warenkorb:'];
const JE_NUTZER_SITZUNG = ['senklot.einblick'];

function speicher(art: 'local' | 'session'): Storage | null {
  try {
    return art === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // Privates Fenster oder blockierte Website-Daten: dann gibt es nichts zu tun.
    return null;
  }
}

function schluessel(s: Storage): string[] {
  const alle: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const k = s.key(i);
    if (k) alle.push(k);
  }
  return alle;
}

export function schluesselUmziehen(): void {
  for (const art of ['local', 'session'] as const) {
    const s = speicher(art);
    if (!s) continue;
    try {
      for (const alt of schluessel(s)) {
        const regel = UMZUG.find(([von]) => alt.startsWith(von));
        if (!regel) continue;
        const neu = regel[1] + alt.slice(regel[0].length);
        const wert = s.getItem(alt);
        if (s.getItem(neu) === null && wert !== null) s.setItem(neu, wert);
        s.removeItem(alt);
      }
    } catch {
      /* voller oder gesperrter Speicher: beim nächsten Start noch einmal */
    }
  }
}

export function benutzerSpurenLoeschen(): void {
  for (const [art, anfaenge] of [['local', JE_NUTZER_LOKAL], ['session', JE_NUTZER_SITZUNG]] as const) {
    const s = speicher(art);
    if (!s) continue;
    try {
      for (const k of schluessel(s)) {
        if (anfaenge.some((a) => k === a || k.startsWith(a))) s.removeItem(k);
      }
    } catch {
      /* dann eben nicht — die Abmeldung selbst hängt nicht daran */
    }
  }
}

/** Die Datenbanken der Firestore-Zeit — Firebase Messaging bleibt. */
export function istFirestoreRest(name: string): boolean {
  return name.startsWith('firestore/') || name === 'firebaseLocalStorageDb';
}

export async function firestoreResteEntfernen(): Promise<void> {
  const lokal = speicher('local');
  try {
    // Die alte Firebase-Anmeldung legte ihren Nutzer auch hier ab.
    for (const k of lokal ? schluessel(lokal) : []) {
      if (k.startsWith('firebase:authUser:') || k.startsWith('firebase:host:')) lokal!.removeItem(k);
      /*
        UND DIE MEHR-TAB-ABSTIMMUNG DES ALTEN FIRESTORE-SDK (Nachtest
        01.10.2026, N7): `firestore_online_state_…`, `firestore_sequence_number_…`,
        `firestore_clients_…` und Verwandte. Das SDK lädt seit dem 19.09.2026
        nicht mehr — die Schlüssel stammen aus der Zeit davor und blieben liegen.
      */
      else if (k.startsWith('firestore_')) lokal!.removeItem(k);
    }
  } catch {
    /* nicht schlimm */
  }
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
    for (const { name } of await indexedDB.databases()) {
      if (name && istFirestoreRest(name)) indexedDB.deleteDatabase(name);
    }
  } catch {
    /* ältere Browser kennen `databases()` nicht — dann bleibt der Rest liegen */
  }
}
