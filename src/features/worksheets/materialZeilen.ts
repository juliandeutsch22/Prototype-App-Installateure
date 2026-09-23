import type { WorkSheetMaterial } from '@/types';

/**
 * Die Materialzeilen eines Handwerksscheins, solange sie noch bearbeitet
 * werden.
 *
 * WOZU DIE KENNUNG. Sie steht NICHT im gespeicherten Schein — sie hält nur
 * die Zeile in der Ansicht zusammen. Ohne sie müsste die Liste über den
 * Listenplatz schlüsseln, und der wandert: wer die zweite von vier Zeilen
 * löscht, sieht danach seine Mengen um eine Position verrutscht. Auf einem
 * Beleg, den der Kunde gleich unterschreibt, ist das kein Schönheitsfehler.
 */
export interface MaterialZeile extends WorkSheetMaterial {
  id: string;
}

/**
 * Eine neue, in dieser Liste eindeutige Kennung.
 *
 * Vorher Zeitstempel plus fünf Zufallszeichen: innerhalb derselben
 * Millisekunde konnten zwei Zeilen gleich heissen — selten, aber die Prüfung
 * darunter hat es erwischt.
 */
export function neueKennung(): string {
  return `m${crypto.randomUUID()}`;
}

/**
 * Was gespeichert wird.
 *
 * Die Kennung fällt weg, und `einheit` wird nur gesetzt, wenn es sie gibt:
 * eine leere Einheit stünde sonst als „ Stück"-Lücke auf dem PDF.
 */
export function ohneKennung(zeilen: MaterialZeile[]): WorkSheetMaterial[] {
  return zeilen.map((z) => {
    const eintrag: WorkSheetMaterial = { name: z.name, menge: z.menge };
    if (z.einheit) eintrag.einheit = z.einheit;
    return eintrag;
  });
}
