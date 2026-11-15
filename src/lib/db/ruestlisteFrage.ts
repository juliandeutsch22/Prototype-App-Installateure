/**
 * Was mit der Rüstliste geschieht, wenn ihr Einsatz wandert oder wegfällt
 * (Durchsicht 15.11.2026, P2; `supabase/migrations/20261116010000_einsatz_ruestliste_mit.sql`).
 *
 * Die Liste gehört zum Paar aus Tag und Baustelle. Wird der Letzte dieses
 * Paares entfernt, stünde sie sonst verwaist da: Reservierung im Lager,
 * offene Fehlmengen-Anforderung, niemand, der abhaken kann. Die Datenbank
 * fragt deshalb zurück, bevor sie etwas schreibt — die App stellt die Frage.
 */

/** `fragen`: bei verwaister Liste mit `SL428` ablehnen; sonst die Entscheidung. */
export type RuestlisteWahl = 'fragen' | 'aufloesen' | 'behalten';

/** Was beim Verschieben mit der Liste geschah — `null`: nichts (keine Liste, oder es bleibt jemand dort). */
export type RuestlisteUmzug = 'mitgezogen' | 'zusammengefuehrt' | null;

/** Antwort nach dem Entfernen; `null`, wenn keine Liste verwaist war. */
export interface RuestlisteErgebnis {
  ruestliste: 'aufgeloest' | 'behalten';
  /** Zurückgezogene (aufgelöst) Fehlmengen-Anforderungen. */
  anforderungen?: number;
  /** Anforderungen, die das Lager schon in Arbeit hat — sie bleiben. */
  in_arbeit?: number;
}

export const RUESTLISTE_FRAGE_CODE = 'SL428';

/** Die Datenbank will wissen, was mit der Liste geschehen soll. Nichts ist geschrieben. */
export class RuestlisteFrage extends Error {
  constructor(
    message: string,
    readonly positionen: number,
    /** Offene Fehlmengen-Anforderungen, die „Auflösen“ zurückzöge. */
    readonly anforderungen: number,
    /** Anforderungen, die das Lager schon in Arbeit hat. */
    readonly inArbeit: number,
  ) {
    super(message);
    this.name = 'RuestlisteFrage';
  }
}

export function ruestlisteFrageAus(fehler: { code?: string; message: string; details?: string | null }): RuestlisteFrage | null {
  if (fehler.code !== RUESTLISTE_FRAGE_CODE) return null;
  let d: { positionen?: number; anforderungen?: number; in_arbeit?: number } = {};
  try {
    d = JSON.parse(fehler.details ?? '{}') as typeof d;
  } catch {
    // Ohne lesbares Detail bleibt es die Frage — nur ohne Zahlen.
  }
  return new RuestlisteFrage(fehler.message, Number(d.positionen) || 0, Number(d.anforderungen) || 0, Number(d.in_arbeit) || 0);
}

const mal = (n: number, eins: string, mehr: string) => (n === 1 ? `eine ${eins}` : `${n} ${mehr}`);

/** Die Folge von „Auflösen“ in einem Satz — für die Frage. */
export function aufloesenText(f: Pick<RuestlisteFrage, 'positionen' | 'anforderungen' | 'inArbeit'>): string {
  const teile = [`Auflösen löscht die Rüstliste (${mal(f.positionen, 'Position', 'Positionen')}) und gibt die Reservierung im Lager frei`];
  if (f.anforderungen > 0) teile.push(`${mal(f.anforderungen, 'offene Anforderung', 'offene Anforderungen')} über die Fehlmenge ${f.anforderungen === 1 ? 'wird' : 'werden'} zurückgezogen`);
  const satz = `${teile.join('; ')}.`;
  return f.inArbeit > 0
    ? `${satz} ${f.inArbeit === 1 ? 'Eine Anforderung hat' : `${f.inArbeit} Anforderungen hat`} das Lager schon in Arbeit — ${f.inArbeit === 1 ? 'sie bleibt' : 'sie bleiben'} stehen und ${f.inArbeit === 1 ? 'ist' : 'sind'} dort zu klären.`
    : satz;
}

/** Nachsatz für die Meldung nach dem Verschieben. */
export function umzugText(u: RuestlisteUmzug): string {
  if (u === 'mitgezogen') return ' · die Rüstliste zog mit';
  if (u === 'zusammengefuehrt') return ' · die Rüstliste kam zur Liste am Zieltag dazu';
  return '';
}

/** Nachsatz für die Meldung nach dem Entfernen. */
export function entferntText(e: RuestlisteErgebnis | null): string {
  if (!e) return '';
  if (e.ruestliste === 'behalten') return ' · die Rüstliste bleibt für die nächste Einteilung an diesem Tag';
  const n = e.in_arbeit ?? 0;
  return n > 0
    ? ` · Rüstliste aufgelöst; ${n === 1 ? 'eine Anforderung ist' : `${n} Anforderungen sind`} im Lager schon in Arbeit`
    : ' · Rüstliste aufgelöst';
}
