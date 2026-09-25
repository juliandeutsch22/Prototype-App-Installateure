/**
 * Striche von einer Zeichenfläche auf eine andere übertragen.
 *
 * Gebraucht beim Wechsel zwischen dem Feld im Formular und dem großen Blatt
 * zum Unterschreiben im Querformat (`SignaturePad`). Die Striche liegen in
 * CSS-Pixeln der Fläche, auf der gezeichnet wurde; eine andere Fläche hat
 * andere Maße. Ohne Umrechnung stünde eine im Blatt geschriebene Unterschrift
 * im kleineren Feld halb außerhalb — und das gespeicherte Bild wäre
 * abgeschnitten.
 *
 * Die Regel: die Ausdehnung aller Striche wird gleichmäßig skaliert (nichts
 * verzerrt) und mittig in die neue Fläche gesetzt, mit etwas Luft zum Rand.
 * Größer als `hoechstens` wird dabei nicht skaliert — ins Formular zurück
 * höchstens 1, damit eine kleine Unterschrift nicht aufgeblasen wird.
 */

export interface Punkt {
  x: number;
  y: number;
}

export interface Masse {
  w: number;
  h: number;
}

/** Luft zum Rand, damit die runden Strichenden nicht angeschnitten werden. */
const RAND = 8;

export function einpassen(striche: Punkt[][], ziel: Masse, hoechstens: number): Punkt[][] {
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
  if (!Number.isFinite(minX)) return striche;
  // Ein einzelner Punkt hat keine Ausdehnung — nicht durch null teilen.
  const breite = Math.max(maxX - minX, 1);
  const hoehe = Math.max(maxY - minY, 1);
  const massstab = Math.max(
    0,
    Math.min(hoechstens, (ziel.w - 2 * RAND) / breite, (ziel.h - 2 * RAND) / hoehe),
  );
  const versatzX = (ziel.w - (maxX - minX) * massstab) / 2 - minX * massstab;
  const versatzY = (ziel.h - (maxY - minY) * massstab) / 2 - minY * massstab;
  return striche.map((strich) =>
    strich.map((p) => ({ x: p.x * massstab + versatzX, y: p.y * massstab + versatzY })),
  );
}
