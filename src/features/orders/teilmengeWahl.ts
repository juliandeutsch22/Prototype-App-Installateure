import { fmtMenge } from '@/lib/belegLayout';
import { leseZahl } from '@/lib/zahl';

/**
 * TEILMENGEN (M5/F5, 16.11.2026): wer 6 von 10 abholt oder ausgibt, trägt 6
 * ein — der Rest bleibt als eigene Zeile liegen (`app.anforderung_abspalten`).
 * Vorher kannten „Aus Lager“ und „Abgeholt“ nur die ganze Menge.
 *
 * Was die Eingabe heißt: `ganz` (leer oder die ganze Menge — der Aufruf wie
 * bisher), `teil` mit der Menge, oder ein Fehler mit Grund.
 */
export type Teilwahl = { art: 'ganz' } | { art: 'teil'; menge: number } | { art: 'fehler'; grund: string };

export function teilwahl(eingabe: string, angefordert: number): Teilwahl {
  if (eingabe.trim() === '') return { art: 'ganz' };
  const { wert, fehler } = leseZahl(eingabe);
  if (fehler || wert == null) return { art: 'fehler', grund: fehler ?? 'Bitte eine Zahl eintragen.' };
  if (wert <= 0) return { art: 'fehler', grund: 'Die Menge muss größer als null sein.' };
  if (wert > angefordert) {
    return { art: 'fehler', grund: `Höchstens die angeforderten ${fmtMenge(angefordert)} — mehr ist eine neue Anforderung.` };
  }
  return wert === angefordert ? { art: 'ganz' } : { art: 'teil', menge: wert };
}

/** Die Anforderung mit der Menge, die dieser Schritt bucht — für den Satz der Rückfrage. */
export function abholTeil<T extends { quantity: number }>(o: T, eingabe: string): T {
  const w = teilwahl(eingabe, o.quantity);
  return w.art === 'teil' ? { ...o, quantity: w.menge } : o;
}
