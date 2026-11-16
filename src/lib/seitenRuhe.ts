/**
 * DIE RUHE NACH EINEM SEITENWECHSEL (B2/B3). Die neue Seite baut ihre Listen
 * auf — das ist kein „diese Zeile ging“ und kein „diese kam“. Eigene kleine
 * Datei, damit die Hülle (`Layout`) sie setzen kann, ohne die Beobachter
 * selbst vor dem ersten Bild zu laden (`bewegungenHalten.ts`).
 */
let ruheBis = 0;

const jetzt = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function seitenwechselRuhe(ms = 600): void {
  ruheBis = jetzt() + ms;
}

export function inSeitenRuhe(): boolean {
  return jetzt() < ruheBis;
}
