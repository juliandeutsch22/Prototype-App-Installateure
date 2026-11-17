/*
  MITROLLEN BEIM ZIEHEN (E96, 17.11.2026). Das Raster rollt in sich (Hülle,
  höchstens 74 % der Bildhöhe), die Seite darüber auch. Bisher stand beim
  Ziehen alles still: wer eine Baustelle auf den Samstag legen wollte, der
  seitlich verdeckt war, oder auf eine Person unten in der Liste, kam nicht
  hin. Jetzt rollt, wer mit dem Zeiger an den Rand fährt — je näher am Rand,
  desto schneller, wie am iPad.

  Hier steht nur die Rechnung (prüfbar ohne Browser); das Abspielen je Bild
  macht `useZiehen`.
*/

/** Wie breit der Rand ist, in dem es rollt (px). */
export const ROLL_RAND = 48;
/** Höchstes Tempo je Bild (px) — am Rand oder darüber hinaus. */
export const ROLL_MAX = 18;

/**
 * Das Tempo nach dem Abstand des Zeigers zur Kante: 0 ausserhalb des Rands,
 * am Rand selbst und darüber hinaus (negativer Abstand) das Höchste. Nie
 * weniger als 1 px, sobald es rollt — sonst stünde es am inneren Saum still.
 */
export function randTempo(abstand: number): number {
  if (abstand >= ROLL_RAND) return 0;
  const anteil = Math.min(1, (ROLL_RAND - abstand) / ROLL_RAND);
  return Math.max(1, Math.round(ROLL_MAX * anteil));
}

export interface Rollflaeche {
  links: number;
  oben: number;
  rechts: number;
  unten: number;
}

/**
 * Um wie viel eine Fläche je Bild rollt, wenn der Zeiger bei (x, y) steht.
 * `frei` ist der Teil, über dem man ablegt — ohne feste Kopfzeile und
 * Namensspalte; der Rand beginnt an ihrer Kante, nicht erst am Rand der
 * Hülle. `aussen` ist die ganze Fläche: liegt der Zeiger ausserhalb (etwa
 * über „Noch einzuplanen“), rollt nichts.
 */
export function rollSchritt(frei: Rollflaeche, aussen: Rollflaeche, x: number, y: number): { dx: number; dy: number } {
  if (x < aussen.links || x > aussen.rechts || y < aussen.oben || y > aussen.unten) return { dx: 0, dy: 0 };
  const dx = x < frei.links + ROLL_RAND ? -randTempo(x - frei.links) : x > frei.rechts - ROLL_RAND ? randTempo(frei.rechts - x) : 0;
  const dy = y < frei.oben + ROLL_RAND ? -randTempo(y - frei.oben) : y > frei.unten - ROLL_RAND ? randTempo(frei.unten - y) : 0;
  return { dx, dy };
}
