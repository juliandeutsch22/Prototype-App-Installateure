import { LOGO_BREITE_MM, LOGO_HOEHE_MM } from './pdfBriefkopf';

/**
 * Ein hochgeladenes Logo für den PDF-Briefkopf aufbereiten.
 *
 * DREI PROBLEME AUF EINMAL, und sie hängen zusammen:
 *
 *   1. jsPDF braucht die BYTES des Bildes. Eine fremde Adresse müsste der
 *      Browser holen, und daran scheitert er an CORS — nicht mit einer
 *      Meldung, sondern mit einem fehlenden Logo oder einem PDF, das gar
 *      nicht erst entsteht. Eine Data-URL hat das Problem nicht.
 *   2. Das Bild landet im Firmendokument, und das lädt die App bei jedem
 *      Start. Ein Logo im Originalformat wären schnell mehrere Megabyte —
 *      auf der Baustelle bei einem Balken LTE der Unterschied zwischen
 *      „startet" und „startet nicht". Es wird deshalb verkleinert.
 *   3. Der Briefkopf zeichnet in ein FESTES Rechteck. Ein Bild mit anderem
 *      Seitenverhältnis würde darin verzerrt — ein verzogenes Firmenlogo auf
 *      einer Rechnung ist schlimmer als gar keins.
 *
 * Deshalb wird das Logo in eine Fläche mit genau dem Seitenverhältnis des
 * Briefkopfs EINGEPASST, mittig, auf durchsichtigem Grund. Es behält seine
 * Form, und das feste Rechteck im PDF stimmt danach immer.
 */

/** Breite der Zielfläche in Bildpunkten — 34 mm bei rund 300 dpi. */
export const ZIEL_BREITE_PX = 400;

/** Höhe daraus, mit dem Seitenverhältnis des Briefkopfs. */
export const ZIEL_HOEHE_PX = Math.round((ZIEL_BREITE_PX * LOGO_HOEHE_MM) / LOGO_BREITE_MM);

/** Mehr nimmt das Firmendokument nicht auf, ohne den Start zu belasten. */
export const MAX_BYTES = 400_000;

/**
 * Wohin das Bild in der Zielfläche kommt — eingepasst, nicht beschnitten.
 *
 * „Contain", nicht „cover": ein beschnittenes Logo verliert im Zweifel den
 * Schriftzug. Lieber Luft daneben als ein halbes Wort.
 */
export function einpassen(
  breite: number,
  hoehe: number,
  zielB = ZIEL_BREITE_PX,
  zielH = ZIEL_HOEHE_PX,
): { x: number; y: number; b: number; h: number } {
  if (breite <= 0 || hoehe <= 0) return { x: 0, y: 0, b: 0, h: 0 };
  const faktor = Math.min(zielB / breite, zielH / hoehe);
  const b = breite * faktor;
  const h = hoehe * faktor;
  return { x: (zielB - b) / 2, y: (zielH - h) / 2, b, h };
}

/** Wie groß eine Data-URL tatsächlich ist — Base64 trägt rund ein Drittel auf. */
export function dataUrlBytes(dataUrl: string): number {
  const komma = dataUrl.indexOf(',');
  if (komma < 0) return 0;
  return Math.floor(((dataUrl.length - komma - 1) * 3) / 4);
}

/** Was hier hereindarf. SVG bewusst nicht: jsPDF kann es nicht zeichnen. */
export const ERLAUBTE_TYPEN = ['image/png', 'image/jpeg', 'image/webp'];

export class LogoFehler extends Error {}

/**
 * Datei → Data-URL, verkleinert und eingepasst.
 *
 * Wirft `LogoFehler` mit einem Text, der in die Oberfläche darf.
 */
export async function logoAufbereiten(datei: File): Promise<string> {
  if (!ERLAUBTE_TYPEN.includes(datei.type)) {
    throw new LogoFehler('Bitte ein PNG, JPEG oder WebP wählen. SVG kann das PDF nicht zeichnen.');
  }

  const quelle = await new Promise<HTMLImageElement>((fertig, ab) => {
    const leser = new FileReader();
    leser.onerror = () => ab(new LogoFehler('Die Datei konnte nicht gelesen werden.'));
    leser.onload = () => {
      const bild = new Image();
      bild.onload = () => fertig(bild);
      bild.onerror = () => ab(new LogoFehler('Das ist kein lesbares Bild.'));
      bild.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  });

  const flaeche = document.createElement('canvas');
  flaeche.width = ZIEL_BREITE_PX;
  flaeche.height = ZIEL_HOEHE_PX;
  const stift = flaeche.getContext('2d');
  if (!stift) throw new LogoFehler('Das Bild konnte nicht verarbeitet werden.');

  const { x, y, b, h } = einpassen(quelle.naturalWidth, quelle.naturalHeight);
  stift.drawImage(quelle, x, y, b, h);

  // PNG, damit ein durchsichtiger Hintergrund durchsichtig bleibt.
  const dataUrl = flaeche.toDataURL('image/png');
  if (dataUrlBytes(dataUrl) > MAX_BYTES) {
    throw new LogoFehler(
      'Das Logo ist auch verkleinert noch zu groß. Bitte eine einfachere Fassung verwenden — ' +
        'ein Schriftzug oder eine Bildmarke, kein Foto.',
    );
  }
  return dataUrl;
}
