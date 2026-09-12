import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { laufId, type Lauf, type LaufArt } from '@shared/laufStatus';

/**
 * Den Zustand eines nächtlichen Laufs holen.
 *
 * GESCHRIEBEN WIRD HIER NICHTS, und das ist Absicht: die Rules lassen für
 * angemeldete Zugriffe gar kein Schreiben zu. Eine Überwachung, die der
 * Überwachte selbst beschreiben kann, überwacht nichts.
 *
 * WAS „NICHT DA" HEISST. Es gibt den Fall, dass ein Lauf noch nie gelaufen
 * ist — dann fehlt das Dokument. Anders als bei den mandantengebundenen
 * Sammlungen wirft das hier nicht: die Regel prüft `ownsExisting()`, und ein
 * fehlendes Dokument ist damit ein abgewiesener Zugriff. Beides — Ablehnung
 * und Leere — bedeutet dasselbe und wird gleich behandelt: „von diesem Lauf
 * ist nichts bekannt". Das ist NICHT dasselbe wie „alles in Ordnung".
 */
export async function ladeLauf(companyId: string, art: LaufArt): Promise<Lauf | undefined> {
  try {
    const snap = await getDoc(doc(db, 'systemLaeufe', laufId(companyId, art)));
    if (!snap.exists()) return undefined;
    return snap.data() as Lauf;
  } catch {
    return undefined;
  }
}
