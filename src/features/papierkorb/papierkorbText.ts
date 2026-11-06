import { datumAusMs } from '@/lib/datum';
import { PAPIERKORB_SEIT, tageImPapierkorb } from '@/lib/papierkorb';
import { tageWortDativ } from '@/lib/time';

/**
 * „verworfen von … am … · seit N Tagen“ — die Angabe einer Zeile im
 * Papierkorb und auf der Angebotsseite (M01d).
 *
 * OHNE ZEITPUNKT (Scheine, die vor der Einführung verworfen wurden) steht
 * das so da, statt ein Datum zu raten.
 */
export function verworfenText(
  e: { verworfenAm?: number | null; verworfenVonName?: string | null },
  jetzt: number,
): string {
  const von = e.verworfenVonName?.trim() ? `von ${e.verworfenVonName.trim()} ` : '';
  if (typeof e.verworfenAm !== 'number') {
    return `verworfen ${von}vor dem ${datumAusMs(PAPIERKORB_SEIT)} · Zeitpunkt unbekannt`;
  }
  const tage = tageImPapierkorb(e.verworfenAm, jetzt);
  return `verworfen ${von}am ${datumAusMs(e.verworfenAm)} · ${tage === 0 ? 'seit heute' : `seit ${tageWortDativ(tage)}`}`;
}

/** „1 Entwurf liegt“ / „3 Entwürfe liegen“ — für Hinweis und Startseite. */
export function entwuerfeLiegen(n: number): string {
  return n === 1 ? '1 Entwurf liegt' : `${n} Entwürfe liegen`;
}
