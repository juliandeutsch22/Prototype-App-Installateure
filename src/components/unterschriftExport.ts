/**
 * Das Bild einer Unterschrift — auf einer FESTEN Fläche, nicht auf der Anzeige.
 *
 * WARUM. Bis hierher war das gespeicherte Bild `toDataURL` der angezeigten
 * Zeichenfläche: Größe und Seitenverhältnis hingen am Gerät und an der
 * Breite des Formulars, das PDF presste das Bild dann in sein festes Feld
 * von 70 × 25 mm. Eine Unterschrift vom schmalen Telefon kam gestaucht an,
 * eine vom breiten Schreibtisch gestreckt — und eine große Zeichenfläche im
 * Querformat hätte jedes künftige Bild noch weiter verzerrt.
 *
 * Jetzt gilt: die Striche (in CSS-Pixeln der Fläche, auf der gezeichnet
 * wurde) werden auf eine Fläche von 700 × 250 Pixeln übertragen — genau das
 * Seitenverhältnis des PDF-Felds, 10 Pixel je Millimeter. Gleichmäßig
 * skaliert, damit nichts verzerrt, und mittig gesetzt. Wie groß das Feld auf
 * dem Bildschirm war, spielt damit keine Rolle mehr.
 *
 * WAS SICH NICHT ÄNDERT. Gespeicherte Scheine behalten ihr Bild; die
 * Prüfsumme läuft wie bisher über den Bildtext, der im Schein steht, und das
 * PDF setzt ihn wie bisher in das Feld. Nur NEUE Unterschriften entstehen
 * auf der festen Fläche.
 */

export interface Punkt {
  x: number;
  y: number;
}

/** 70 × 25 mm bei 10 Pixeln je Millimeter — das Feld im PDF (`worksheetPdf.ts`). */
export const EXPORT_BREITE = 700;
export const EXPORT_HOEHE = 250;
/** Luft zum Rand, damit die runden Strichenden nicht angeschnitten werden. */
const RAND = 16;
/**
 * Strichstärke auf der Exportfläche: 3 px sind 0,3 mm im PDF — so kräftig
 * wie ein Kugelschreiber, unabhängig davon, wie groß gezeichnet wurde.
 */
const STRICH = 3;
/** `--text` der Oberfläche; ein Canvas liest keine CSS-Variablen. */
const TINTE = '#0a2030';

/**
 * Die Striche auf die Exportfläche übertragen: gleichmäßig skaliert, sodass
 * ihre Ausdehnung die Fläche (abzüglich Rand) füllt, und mittig gesetzt.
 */
export function aufExportflaeche(striche: Punkt[][]): Punkt[][] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const strich of striche) {
    for (const p of strich) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return [];
  // Ein einzelner Punkt hat keine Ausdehnung — nicht durch null teilen.
  const breite = Math.max(maxX - minX, 1);
  const hoehe = Math.max(maxY - minY, 1);
  const massstab = Math.min((EXPORT_BREITE - 2 * RAND) / breite, (EXPORT_HOEHE - 2 * RAND) / hoehe);
  const versatzX = (EXPORT_BREITE - (maxX - minX) * massstab) / 2 - minX * massstab;
  const versatzY = (EXPORT_HOEHE - (maxY - minY) * massstab) / 2 - minY * massstab;
  return striche.map((strich) =>
    strich.map((p) => ({ x: p.x * massstab + versatzX, y: p.y * massstab + versatzY })),
  );
}

/**
 * Die Striche auf eine Fläche von `EXPORT_BREITE` × `EXPORT_HOEHE` malen.
 *
 * Dieselbe Zeichnung für das gespeicherte Bild und für die Vorschau in der
 * Kachel — was der Kunde dort sieht, ist genau das, was auf dem Papier steht.
 */
export function unterschriftMalen(c: CanvasRenderingContext2D, striche: Punkt[][]): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, EXPORT_BREITE, EXPORT_HOEHE);
  c.lineWidth = STRICH;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = TINTE;
  for (const strich of aufExportflaeche(striche)) {
    if (strich.length === 0) continue;
    c.beginPath();
    c.moveTo(strich[0].x, strich[0].y);
    // Ein einzelner Tipp: Linie auf sich selbst, damit ein Punkt entsteht.
    if (strich.length === 1) c.lineTo(strich[0].x, strich[0].y);
    else for (const p of strich.slice(1)) c.lineTo(p.x, p.y);
    c.stroke();
  }
}

/** Das Bild für den Schein — oder `null`, wenn nichts gezeichnet ist. */
export function unterschriftBild(striche: Punkt[][]): string | null {
  if (!striche.some((s) => s.length > 0)) return null;
  const flaeche = document.createElement('canvas');
  flaeche.width = EXPORT_BREITE;
  flaeche.height = EXPORT_HOEHE;
  const c = flaeche.getContext('2d');
  if (!c) return null;
  unterschriftMalen(c, striche);
  return flaeche.toDataURL('image/png');
}
