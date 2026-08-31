/**
 * Schreiben mit ehrlicher Rückmeldung, auch ohne Empfang.
 *
 * Firestore nimmt einen Schreibvorgang offline sofort in den lokalen
 * Zwischenspeicher auf und sendet ihn selbsttätig nach, sobald wieder Netz da
 * ist. Das zurückgegebene Versprechen löst aber erst auf, wenn der SERVER
 * bestätigt hat — die Firebase-Doku sagt das zu `addDoc` ausdrücklich: „won't
 * resolve while you're offline".
 *
 * Für diese App ist das kein Randfall. Ein Monteur bucht seine Zeit im
 * Keller, im Rohbau, in der Tiefgarage. Dort drehte sich der Speichern-Knopf
 * endlos, obwohl der Eintrag längst sicher lag — und wer das sieht, tippt ein
 * zweites Mal oder gibt auf.
 *
 * Diese Hülle wartet begrenzt auf die Bestätigung. Bleibt sie aus UND meldet
 * der Browser keine Verbindung, gilt der Vorgang als vorgemerkt. Ist der
 * Browser online und nur langsam, wird weiter gewartet: „vorgemerkt" zu
 * melden, wo in Wahrheit gleich ein Fehler kommt, wäre schlimmer als eine
 * Sekunde Geduld.
 */

export type WriteOutcome = 'confirmed' | 'queued';

/** Wie lange auf die Serverbestätigung gewartet wird, bevor nachgesehen wird. */
const WAIT_MS = 4000;

/** Meldet der Browser gar keine Verbindung? */
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function writeWithOfflineNotice<T>(
  write: Promise<T>,
  waitMs = WAIT_MS,
): Promise<WriteOutcome> {
  // Steht schon beim Absenden fest, dass keine Verbindung besteht, gibt es
  // nichts abzuwarten. Vier Sekunden Kreisel wären hier reine Schikane: der
  // Eintrag liegt in dem Moment bereits im Zwischenspeicher.
  if (offline()) {
    void write.catch(() => undefined);
    return 'queued';
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const abgelaufen = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), waitMs);
  });

  try {
    const erste = await Promise.race([write.then(() => 'ok' as const), abgelaufen]);
    if (erste === 'ok') return 'confirmed';

    if (offline()) {
      // Die Verbindung ist während des Schreibens abgerissen. Nicht weiter
      // abwarten — offline kommt keine Antwort. Der Fehlerfall
      // wird abgefangen, damit kein unbehandelter Abbruch übrig bleibt; der
      // eigentliche Schreibvorgang läuft weiter und geht später raus.
      void write.catch(() => undefined);
      return 'queued';
    }

    // Online, nur zäh: weiter warten und Fehler regulär durchreichen.
    await write;
    return 'confirmed';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Meldungstext für einen vorgemerkten Schreibvorgang. */
export function queuedMessage(was: string): string {
  return `${was} — ohne Verbindung gespeichert, wird automatisch gesendet.`;
}
