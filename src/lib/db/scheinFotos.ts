import { app } from '@/lib/firebase';
import { bildHash, fotoPfad, zielMasse, GUETE } from '@/features/worksheets/fotos';
import type { WorkSheetFoto } from '@/types';

/**
 * Fotos hochladen und wieder entfernen.
 *
 * DAS STORAGE-SDK WIRD ERST HIER GELADEN, per dynamischem Import. Es ist ein
 * eigenes Bündel von rund fünfzig Kilobyte, und die allermeisten Aufrufe
 * dieser App kommen nie in die Nähe eines Fotos — der Monteur bucht Zeit, das
 * Büro schreibt Rechnungen. Fest importiert läge es in jedem ersten Aufruf
 * mit auf der Leitung, auch auf einer Baustelle mit halbem Balken.
 */

async function speicher() {
  const { getStorage, ref, uploadBytes, deleteObject, getDownloadURL } = await import(
    'firebase/storage'
  );
  return { getStorage, ref, uploadBytes, deleteObject, getDownloadURL };
}

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

/**
 * Ein Foto hochladen und den Eintrag für den Schein zurückgeben.
 *
 * DER HASH WIRD ÜBER DIE BYTES GEBILDET, DIE TATSÄCHLICH HOCHGEHEN — nicht
 * über das Original. Sonst stimmte er mit nichts überein, was jemals in
 * Storage liegt, und die spätere Prüfung schlüge bei jedem Foto an.
 */
export async function fotoHochladen(
  companyId: string,
  scheinId: string,
  daten: Blob,
  geraetZeit: number,
): Promise<WorkSheetFoto> {
  const { getStorage, ref, uploadBytes } = await speicher();
  const bytes = await daten.arrayBuffer();
  const hash = await bildHash(bytes);
  /*
    DER HASH IST ZUGLEICH DER DATEINAME. Zweimal dasselbe Bild ergibt damit
    denselben Pfad und belegt den Bucket nicht doppelt — und ein
    wiederholter Upload nach einem Abbruch schreibt genau dorthin, wo der
    erste hinwollte, statt eine halbe Leiche zurückzulassen.
  */
  const pfad = fotoPfad(companyId, scheinId, `${hash}.jpg`);
  await uploadBytes(ref(getStorage(app), pfad), daten, { contentType: 'image/jpeg' });
  return { pfad, hash, bytes: daten.size, geraetZeit };
}

/** Die Adresse, unter der sich ein Foto anzeigen lässt. */
export async function fotoAdresse(pfad: string): Promise<string> {
  const { getStorage, ref, getDownloadURL } = await speicher();
  return getDownloadURL(ref(getStorage(app), pfad));
}

/**
 * Ein Foto entfernen.
 *
 * Nur am ENTWURF sinnvoll — das prüft die Ansicht. Hier steht keine zweite
 * Prüfung: eine Regel, die an zwei Stellen steht, weicht irgendwann ab.
 */
export async function fotoEntfernen(pfad: string): Promise<void> {
  const { getStorage, ref, deleteObject } = await speicher();
  await deleteObject(ref(getStorage(app), pfad));
}
