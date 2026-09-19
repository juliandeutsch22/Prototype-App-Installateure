/**
 * Fotos am Handwerksschein — die Weiche, und das Verkleinern.
 *
 * DAS VERKLEINERN STEHT HIER UND NICHT IN EINER DER BEIDEN HÄLFTEN: es
 * passiert im Browser, bevor irgendein Speicher ins Spiel kommt, und wäre in
 * beiden Fassungen Zeichen für Zeichen dasselbe. Zwei Kopien einer Rechnung
 * laufen auseinander; diese hier bestimmt, welche Bytes gehasht werden, und
 * der Hash ist der Beweis am Beleg.
 *
 * DER PFAD IST IN BEIDEN FASSUNGEN DERSELBE. Er steht im Schein und geht in
 * dessen Prüfsumme ein — würde der Umzug ihn umschreiben, liesse sich kein
 * unterschriebener Schein mehr nachrechnen.
 */
import type { WorkSheetFoto } from '@/types';
import { zielMasse, GUETE } from '@/features/worksheets/fotos';
import * as pg from './pg/scheinFotos';

/**
 * Ein Bild verkleinern und als JPEG ausgeben.
 *
 * WARUM ÜBERHAUPT. Ein Handyfoto ist drei bis fünf Megabyte. Auf einer
 * Baustelle mit halbem Balken ist das keine Übertragung, sondern ein
 * Abbruch — und der Monteur steht daneben und wartet, während der Kunde
 * unterschreiben will.
 *
 * `createImageBitmap` statt eines `<img>`-Elements: es dreht das Bild anhand
 * der EXIF-Angabe von selbst richtig herum (`imageOrientation: 'from-image'`).
 * Ohne das läge jedes Hochformat-Foto vom iPhone im Beleg auf der Seite —
 * die Drehung steckt dort nur in den Metadaten, die beim Zeichnen auf ein
 * Canvas verlorengehen.
 */
export async function komprimiere(datei: Blob): Promise<Blob> {
  const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  const { breite, hoehe } = zielMasse(bild.width, bild.height);
  const flaeche = document.createElement('canvas');
  flaeche.width = breite;
  flaeche.height = hoehe;
  const stift = flaeche.getContext('2d');
  if (!stift) throw new Error('Das Bild lässt sich auf diesem Gerät nicht verkleinern.');
  stift.drawImage(bild, 0, 0, breite, hoehe);
  bild.close();

  const klein = await new Promise<Blob | null>((fertig) =>
    flaeche.toBlob(fertig, 'image/jpeg', GUETE),
  );
  if (!klein) throw new Error('Das Bild lässt sich auf diesem Gerät nicht verkleinern.');
  /*
    Wäre das verkleinerte Bild GRÖSSER als das Original — bei einem schon
    stark komprimierten kleinen JPEG kann das passieren —, bleibt das
    Original. Ein „Verkleinern", das die Datei aufbläht, ist keines.
  */
  return klein.size < datei.size ? klein : datei;
}

export function fotoHochladen(
  companyId: string,
  scheinId: string,
  daten: Blob,
  geraetZeit: number,
): Promise<WorkSheetFoto> {
  return pg.fotoHochladen(companyId, scheinId, daten, geraetZeit);
}

export function fotoAdresse(pfad: string): Promise<string> {
  return pg.fotoAdresse(pfad);
}

export function fotoEntfernen(pfad: string): Promise<void> {
  return pg.fotoEntfernen(pfad);
}
