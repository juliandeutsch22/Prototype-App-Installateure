/**
 * Fotos am Handwerksschein — im Supabase-Speicher.
 *
 * DER PFAD IST DERSELBE WIE UNTER FIREBASE, Zeichen für Zeichen. Er steht im
 * Schein und geht in dessen Prüfsumme ein; würde der Umzug ihn umschreiben,
 * liesse sich kein unterschriebener Schein mehr nachrechnen. Deshalb heisst
 * der Eimer `scheinfotos` und der Objektname beginnt trotzdem mit `scheine/`.
 */
import type { WorkSheetFoto } from '@/types';
import { bildHash, fotoPfad } from '@/features/worksheets/fotos';
import { derClient } from './kern';

const EIMER = 'scheinfotos';

/**
 * Wie lange eine Bildadresse gilt.
 *
 * Unter Firebase kam sie aus `getDownloadURL` und galt für immer. Eine
 * Stunde reicht für das, wofür sie da ist — ein Foto ansehen, während der
 * Schein offen ist —, und eine weitergegebene Adresse ist am nächsten Tag
 * kein offener Zugang mehr.
 */
const GUELTIG_SEKUNDEN = 60 * 60;

/**
 * Ein Foto hochladen und den Eintrag für den Schein zurückgeben.
 *
 * DER HASH WIRD ÜBER DIE BYTES GEBILDET, DIE TATSÄCHLICH HOCHGEHEN — nicht
 * über das Original. Sonst stimmte er mit nichts überein, was jemals im
 * Speicher liegt, und die spätere Prüfung schlüge bei jedem Foto an.
 */
export async function fotoHochladen(
  companyId: string,
  scheinId: string,
  daten: Blob,
  geraetZeit: number,
): Promise<WorkSheetFoto> {
  const bytes = await daten.arrayBuffer();
  const hash = await bildHash(bytes);
  /*
    DER HASH IST ZUGLEICH DER DATEINAME. Zweimal dasselbe Bild ergibt damit
    denselben Pfad und belegt den Speicher nicht doppelt — und ein
    wiederholter Upload nach einem Abbruch schreibt genau dorthin, wo der
    erste hinwollte, statt eine halbe Leiche zurückzulassen. `upsert`, weil
    genau dieser zweite Versuch sonst an der bestehenden Datei scheiterte.
  */
  const pfad = fotoPfad(companyId, scheinId, `${hash}.jpg`);
  const { error } = await derClient().storage
    .from(EIMER)
    .upload(pfad, daten, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return { pfad, hash, bytes: daten.size, geraetZeit };
}

/** Die Adresse, unter der sich ein Foto anzeigen lässt. */
export async function fotoAdresse(pfad: string): Promise<string> {
  const { data, error } = await derClient().storage
    .from(EIMER)
    .createSignedUrl(pfad, GUELTIG_SEKUNDEN);
  if (error) throw new Error(error.message);
  return data!.signedUrl;
}

/**
 * Ein Foto entfernen.
 *
 * `remove` meldet ein nicht vorhandenes Objekt NICHT als Fehler — anders als
 * die Zeilen, wo ein Schreibvorgang ohne Treffer inzwischen wirft. Hier ist
 * das richtig herum: das Ziel ist „die Datei ist weg", und das gilt auch,
 * wenn ein abgebrochener Upload sie nie angelegt hat.
 */
export async function fotoEntfernen(pfad: string): Promise<void> {
  const { error } = await derClient().storage.from(EIMER).remove([pfad]);
  if (error) throw new Error(error.message);
}
