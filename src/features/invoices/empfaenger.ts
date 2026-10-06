import type { Customer } from '@/types';
import { uidNormalisieren } from '@/lib/uid';

/**
 * IST DER EMPFÄNGER VOLLSTÄNDIG? (Runde 3, M9 und M10)
 *
 * Dieselben Regeln wie `app.rechnung_empfaenger_pruefen` in der Datenbank —
 * hier, damit die Maske es vor dem Klick sagt und den Weg in die Kundenakte
 * zeigt:
 *   - „Adresse prüfen“ am Kunden sperrt;
 *   - ohne PLZ und Ort keine Rechnung (§ 11 Abs 1 Z 1 UStG);
 *   - ohne Kundenart keine Rechnung und keine Mahnung — sie entscheidet über
 *     Zinsen und Mahnspesen. Eine UID auf dem Beleg macht ihn zum Unternehmen.
 */
export interface EmpfaengerBefund {
  text: string;
  /** Wohin, um es zu beheben — die Kundenakte, wenn es einen Kunden gibt. */
  kundeId?: string;
}

/** Hat die Anschrift PLZ und Ort? Dieselbe Regel wie in der Datenbank. */
export function hatPlzUndOrt(anschrift: string | null | undefined): boolean {
  return /(^|[^0-9])[0-9]{4,5}\s+\S/.test(anschrift ?? '');
}

export function empfaengerFehler(
  kunde: Pick<Customer, 'id' | 'name' | 'plz' | 'ort' | 'adressePruefen' | 'kundenart'> | undefined,
  anschrift: string,
  uidAufBeleg: string,
): EmpfaengerBefund | null {
  if (kunde) {
    if (kunde.adressePruefen) {
      return { text: `Die Anschrift von ${kunde.name} ist als „Adresse prüfen“ markiert. Bitte zuerst in der Kundenakte berichtigen.`, kundeId: kunde.id };
    }
    if (!kunde.plz?.trim() || !kunde.ort?.trim()) {
      return { text: `Zur Anschrift von ${kunde.name} fehlen PLZ und Ort. Bitte zuerst in der Kundenakte ergänzen.`, kundeId: kunde.id };
    }
    if (kundenartFehlt(kunde, uidAufBeleg)) {
      return { text: `Für ${kunde.name} ist keine Kundenart hinterlegt (Privatperson oder Unternehmen). Sie entscheidet über Zinsen und Mahnspesen — bitte in der Kundenakte festlegen.`, kundeId: kunde.id };
    }
  }
  // Mit Kunden im Stamm gelten seine Felder — so geht auch eine Postleitzahl anderer Form.
  if (!kunde && !hatPlzUndOrt(anschrift)) {
    return { text: 'Die Rechnungsanschrift hat keine PLZ und keinen Ort. Bitte die Anschrift des Kunden ergänzen.' };
  }
  return null;
}

/** Fehlt die Kundenart, obwohl der Kunde im Stamm steht und keine UID auf dem Beleg ist? */
export function kundenartFehlt(
  kunde: Pick<Customer, 'kundenart'> | undefined,
  uidAufBeleg: string | null | undefined,
): boolean {
  return !!kunde && !kunde.kundenart && !uidNormalisieren(uidAufBeleg ?? '');
}
