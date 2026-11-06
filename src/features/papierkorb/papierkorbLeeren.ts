import { deleteAbgelaufeneAngebote } from '@/lib/db/quotes';
import { deleteWorkSheetDraft, listAbgelaufeneScheine } from '@/lib/db/workSheets';
import { grundAus } from '@/lib/fehlerGrund';

export interface Geleert {
  angebote: number;
  scheine: number;
  /** Woran es abbrach — dann ist der Rest liegen geblieben, die Zahlen davor stimmen. */
  fehler: string | null;
}

/** Wie viele Scheine je Durchgang geholt werden; gelöscht wird, bis keiner mehr da ist. */
const SCHEINE_JE_DURCHGANG = 50;

/**
 * „ABGELAUFENE ENDGÜLTIG LÖSCHEN“ (M01d): alles, was bis `bis` verworfen
 * wurde, in einem Handgriff der Spitze.
 *
 * Die Angebote mit einer Anweisung — die Datenbank lässt nur verworfene des
 * eigenen Betriebs gehen. Die Scheine einzeln über dasselbe Löschen wie in
 * der Scheinliste (E42): erst die Fotos im Speicher, dann die Zeile. Das
 * kann nur die App, nicht die Datenbank (siehe den Kopf der Migration
 * `20261106200000_papierkorb.sql`) — deshalb auch kein Lauf in der Nacht.
 *
 * KEIN STILLES LIMIT: geholt wird seitenweise, bis keiner mehr übrig ist.
 * Scheitert ein Schein, endet es dort mit dem Grund — ein zweiter Durchgang
 * holte sonst denselben wieder und liefe im Kreis.
 */
export async function abgelaufeneLoeschen(
  companyId: string,
  bis: string,
  was: { angebote: boolean; scheine: boolean },
): Promise<Geleert> {
  const raus: Geleert = { angebote: 0, scheine: 0, fehler: null };
  try {
    if (was.angebote) raus.angebote = await deleteAbgelaufeneAngebote(companyId, bis);
    if (was.scheine) {
      for (;;) {
        const seite = await listAbgelaufeneScheine(companyId, bis, SCHEINE_JE_DURCHGANG);
        if (seite.length === 0) break;
        for (const s of seite) {
          await deleteWorkSheetDraft(companyId, s.id, (s.fotos ?? []).map((f) => f.pfad));
          raus.scheine += 1;
        }
      }
    }
  } catch (e) {
    raus.fehler = grundAus(e, 'Das Löschen brach ab.');
  }
  return raus;
}
