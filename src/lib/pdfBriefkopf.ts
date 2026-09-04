import type { Company } from '@/types';

/**
 * Der Briefkopf der drei PDFs — Firmenangaben und Logo aus EINER Quelle.
 *
 * WARUM DAS GEBÜNDELT GEHÖRT. Rechnung, Stundenbericht und Handwerksschein
 * bauten ihren Kopf jeweils selbst. Das Ergebnis: die Rechnung trug Name,
 * Adresse und Kontakt, der Stundenbericht Name und Adresse, der
 * Handwerksschein nur den Namen — und das Logo erschien in keinem einzigen.
 * Ein Beleg, den der Kunde unterschreibt, sagte damit nicht, von wem er ist.
 *
 * DIE SICHERHEITSREGEL DIESER DATEI: ohne hinterlegtes Logo zeichnet
 * `logoZeichnen` NICHTS und gibt 0 zurück. Jedes PDF sieht dann exakt so aus
 * wie vorher. Ein Betrieb ohne Logo kann durch diese Änderung nichts
 * verlieren; die Tests halten das fest.
 */

/** Wie breit das Logo im Kopf höchstens sein darf (mm). */
const LOGO_BREITE_MM = 34;

/** Und wie hoch — ein hohes, schmales Logo darf den Kopf nicht sprengen. */
const LOGO_HOEHE_MM = 16;

/**
 * Die Zeilen unter dem Firmennamen.
 *
 * Leere Felder fallen heraus, statt eine Leerzeile zu hinterlassen: ein
 * Briefkopf mit einer Lücke sieht aus wie ein Fehler im Programm, nicht wie
 * ein nicht gepflegtes Feld.
 */
export function firmenZeilen(company: Pick<Company, 'addressLine' | 'contactLine'>): string[] {
  return [company.addressLine, company.contactLine].filter(
    (z): z is string => !!z && z.trim() !== '',
  );
}

/** Was `logoZeichnen` braucht — bewusst nur die Bildquelle. */
export type MitLogo = Pick<Company, 'logoUrl'>;

/**
 * Ist das eine Bildquelle, die jsPDF ohne Netzzugriff verarbeiten kann?
 *
 * NUR DATA-URLS. jsPDF braucht die BYTES des Bildes; eine fremde Adresse
 * müsste es holen, und genau daran scheitert es im Browser an CORS — nicht
 * mit einer Meldung, sondern mit einem PDF, in dem das Logo fehlt oder das
 * gar nicht erst entsteht.
 *
 * Die Einstellungsseite legt das Logo deshalb als Data-URL ab. Eine von Hand
 * eingetragene Adresse bleibt für die Oberfläche brauchbar (dort genügt ein
 * `<img>`), wird hier aber übergangen — lieber ein Kopf ohne Logo als ein
 * Beleg, der sich nicht erzeugen lässt.
 */
export function istZeichenbar(logoUrl?: string): boolean {
  return !!logoUrl && /^data:image\/(png|jpe?g|webp);base64,/i.test(logoUrl);
}

interface Zeichenflaeche {
  addImage: (
    daten: string,
    format: string,
    x: number,
    y: number,
    breite: number,
    hoehe: number,
  ) => void;
}

/**
 * Das Logo oben rechts zeichnen — und melden, wie viel Höhe es belegt hat.
 *
 * Der Rückgabewert ist der Grund, warum diese Funktion nicht einfach malt:
 * die Aufrufer schieben ihren übrigen Kopf um genau diesen Betrag nach unten.
 * OHNE Logo sind es 0 mm, und damit bleibt alles, wo es war.
 *
 * Das Seitenverhältnis wird NICHT berechnet — dafür müsste das Bild geladen
 * werden, und das geht beim Erzeugen nicht überall. Stattdessen wird es beim
 * Hochladen auf ein festes Maß gebracht (siehe Einstellungen → Firmendaten).
 */
export function logoZeichnen(
  doc: Zeichenflaeche,
  company: MitLogo,
  x: number,
  y: number,
): number {
  if (!istZeichenbar(company.logoUrl)) return 0;
  const format = /^data:image\/jpe?g/i.test(company.logoUrl!) ? 'JPEG' : 'PNG';
  try {
    doc.addImage(company.logoUrl!, format, x - LOGO_BREITE_MM, y, LOGO_BREITE_MM, LOGO_HOEHE_MM);
  } catch {
    // Ein kaputtes Bild darf keinen Beleg verhindern. Der Kopf bleibt dann
    // ohne Logo — sichtbar, aber folgenlos.
    return 0;
  }
  return LOGO_HOEHE_MM;
}

export { LOGO_BREITE_MM, LOGO_HOEHE_MM };
