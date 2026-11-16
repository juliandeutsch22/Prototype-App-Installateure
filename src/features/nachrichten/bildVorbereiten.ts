import type { NeueDatei } from '@/lib/db/nachrichten';
import { komprimiere } from '@/lib/db/scheinFotos';
import { MAX_KANTE, GUETE } from '@/features/worksheets/fotos';

/**
 * BILDER IM CHAT VOR DEM SENDEN VORBEREITEN (Plan 15.11.2026, L4).
 *
 * Ein Handyfoto ist drei bis acht Megabyte; es ging so hoch, wie es war, und
 * jeder Blick in das Gespräch lud es in voller Größe (Analyse B4). Jetzt:
 *
 *   - DAS BILD auf die längste Kante 1600 verkleinert — dieselbe Grenze wie
 *     die Fotos am Schein, die als Nachweis am Beleg genügen: ein Riss in der
 *     Wand, ein Typenschild bleiben lesbar. Ein unverkleinertes Original
 *     braucht der Chat nicht; wer eine Datei unverändert weitergeben muss
 *     (ein Plan, ein Gutachten), schickt sie als PDF, und PDF bleibt, wie es ist.
 *   - DAZU EIN VORSCHAUBILD (längste Kante 640: das Feld im Verlauf ist
 *     13 × 9,5 rem, am Telefon mit dreifacher Pixeldichte knapp 630 Punkte
 *     breit). Der Verlauf zeigt es, ein Tipp öffnet das Bild.
 *
 * Kann das Gerät ein Bild nicht lesen (HEIC außerhalb von Safari, ein sehr
 * altes Gerät), geht es unverändert und ohne Vorschaubild hinaus — wie bisher.
 */
export const VORSCHAU_KANTE = 640;
export const VORSCHAU_GUETE = 0.7;

/** Welche Bilder vorbereitet werden: was ein Telefon fotografiert oder ein Bildschirmfoto ist. */
const BILD = /^image\/(jpeg|png|webp|heic|heif)$/;

type Verkleinern = (datei: Blob, kante: number, guete: number) => Promise<Blob>;

/** Der Name passt zur neuen Art: aus „IMG_0042.HEIC“ wird „IMG_0042.jpg“. */
export function jpegName(name: string): string {
  return /\.(jpe?g)$/i.test(name) ? name : `${name.replace(/\.[^./\\]+$/, '')}.jpg`;
}

export async function bildVorbereiten(d: NeueDatei, verkleinern: Verkleinern = komprimiere): Promise<NeueDatei> {
  if (d.vorbereitet || !BILD.test(d.inhalt.type)) return d;
  try {
    const bild = await verkleinern(d.inhalt, MAX_KANTE, GUETE);
    const vorschau = await verkleinern(bild instanceof Blob ? bild : d.inhalt, VORSCHAU_KANTE, VORSCHAU_GUETE);
    if (!(bild instanceof Blob) || !(vorschau instanceof Blob)) return { ...d, vorbereitet: true };
    const umgewandelt = bild !== d.inhalt && bild.type === 'image/jpeg' && d.inhalt.type !== 'image/jpeg';
    return {
      ...d,
      name: umgewandelt ? jpegName(d.name) : d.name,
      inhalt: bild,
      vorbereitet: true,
      // Ein Vorschaubild, das nicht kleiner ist als das Bild, spart nichts.
      vorschau: vorschau.size < bild.size ? { id: crypto.randomUUID(), inhalt: vorschau } : undefined,
    };
  } catch {
    return { ...d, vorbereitet: true };
  }
}
