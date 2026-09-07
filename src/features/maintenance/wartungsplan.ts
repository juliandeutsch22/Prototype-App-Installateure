import type { Wartung } from '@/types';

/**
 * Wann die nächste Wartung fällig ist — und wie dringend sie ist.
 *
 * WOZU DAS EIN EIGENES MODUL IST. Die jährliche Thermenwartung ist der einzige
 * Umsatz eines Installateurs, der sich ein Jahr im Voraus planen lässt. Wer
 * sie im Kopf oder im Kalender führt, verliert sie: nicht auffällig, sondern
 * still, indem sie in einem vollen Frühjahr niemandem einfällt. Sie fehlt dann
 * niemandem — und genau das ist der Schaden.
 *
 * Hier steht nur die RECHNUNG, keine Anzeige und keine Datenschicht. Der
 * Grund ist derselbe wie bei den Mahnstufen: eine Frist, die an drei Stellen
 * gerechnet wird, ist an drei Stellen anders.
 */

/** Wie weit im Voraus eine Wartung als „fällig" gilt, in Tagen. */
export const VORLAUF_TAGE = 30;

/** Übliche Intervalle in Monaten — Vorschläge, keine Grenze. */
export const INTERVALLE = [6, 12, 18, 24, 36] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Tage im Monat (1-basiert), schaltjahrfest über UTC. */
function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/**
 * Monate auf ein Datum addieren — mit Anschlag am Monatsende.
 *
 * DER FALL, DER SONST FALSCH WIRD: 31. August plus sechs Monate. Den 31.
 * Februar gibt es nicht. Ohne Anschlag rutscht das Datum in JavaScript
 * stillschweigend in den März — die Wartung wandert bei jedem Durchlauf ein
 * Stück weiter nach hinten, und nach ein paar Jahren steht die Sommerwartung
 * im Herbst. Hier wird auf den letzten Tag des Zielmonats gekürzt.
 */
export function monateDazu(iso: string, monate: number): string {
  if (!ISO.test(iso)) throw new Error(`Kein Datum im Format JJJJ-MM-TT: ${iso}`);
  const [jahr, monat, tag] = iso.split('-').map(Number);
  const gesamt = jahr * 12 + (monat - 1) + monate;
  const zielJahr = Math.floor(gesamt / 12);
  const zielMonat = gesamt - zielJahr * 12 + 1; // 1-basiert, auch bei negativem `monate`
  const zielTag = Math.min(tag, tageImMonat(zielJahr, zielMonat));
  return `${String(zielJahr).padStart(4, '0')}-${String(zielMonat).padStart(2, '0')}-${String(zielTag).padStart(2, '0')}`;
}

/**
 * Der nächste Termin nach einer erledigten Wartung.
 *
 * GERECHNET WIRD AB DEM TAG DER AUSFÜHRUNG, nicht ab dem geplanten Termin.
 * Das Wartungsintervall des Herstellers läuft ab der letzten tatsächlichen
 * Wartung; eine im Mai erledigte Märzwartung ist im Mai des Folgejahres
 * wieder dran. Die Alternative — den Plantermin fortzuschreiben — hielte die
 * Vereinbarung im Jahresraster, würde aber bei jeder Verschiebung eine Frist
 * behaupten, die technisch nicht gilt.
 */
export function naechsterTermin(erledigtAm: string, intervallMonate: number): string {
  if (!Number.isInteger(intervallMonate) || intervallMonate < 1) {
    throw new Error(`Intervall muss ganze Monate ab 1 sein: ${intervallMonate}`);
  }
  return monateDazu(erledigtAm, intervallMonate);
}

/**
 * Wie dringend eine Vereinbarung ist.
 *
 * `unklar` ist ausdrücklich NICHT `später`. Eine Vereinbarung ohne
 * brauchbares Datum ist kein erledigter Fall, sondern einer, den niemand
 * beurteilen kann — sie gehört nach oben, nicht ans Ende.
 */
export type Dringlichkeit = 'überfällig' | 'fällig' | 'später' | 'ruht' | 'unklar';

export interface Urteil {
  stand: Dringlichkeit;
  /** Tage bis zum Termin; negativ heisst überfällig. Null, wenn unbekannt. */
  tage: number | null;
  text: string;
}

/** Ganze Tage zwischen zwei ISO-Daten — über UTC, damit keine Sommerzeit stört. */
export function tageZwischen(von: string, bis: string): number {
  const a = Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10));
  const b = Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function beurteile(
  w: Pick<Wartung, 'faelligAm' | 'aktiv'>,
  heute: string,
  vorlaufTage = VORLAUF_TAGE,
): Urteil {
  if (w.aktiv === false) {
    return { stand: 'ruht', tage: null, text: 'Ruht — kein Termin.' };
  }
  if (!w.faelligAm || !ISO.test(w.faelligAm)) {
    return { stand: 'unklar', tage: null, text: 'Kein Termin hinterlegt.' };
  }
  const tage = tageZwischen(heute, w.faelligAm);
  if (tage < 0) {
    const d = Math.abs(tage);
    return { stand: 'überfällig', tage, text: `Seit ${d} ${d === 1 ? 'Tag' : 'Tagen'} überfällig.` };
  }
  if (tage <= vorlaufTage) {
    return {
      stand: 'fällig',
      tage,
      text: tage === 0 ? 'Heute fällig.' : `Fällig in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}.`,
    };
  }
  return { stand: 'später', tage, text: `Fällig in ${tage} Tagen.` };
}

/** Was jetzt zu tun ist: überfällig und fällig, das Dringendste zuerst. */
export function anstehende<T extends Pick<Wartung, 'faelligAm' | 'aktiv'>>(
  liste: T[],
  heute: string,
  vorlaufTage = VORLAUF_TAGE,
): T[] {
  return liste
    .filter((w) => {
      const s = beurteile(w, heute, vorlaufTage).stand;
      return s === 'überfällig' || s === 'fällig' || s === 'unklar';
    })
    .sort(nachFaelligkeit);
}

/**
 * Sortierung: früherer Termin zuerst, Vereinbarungen ohne Termin ganz nach oben.
 *
 * Ohne Termin nach oben, weil sie sonst hinter dem letzten Datum des Bestands
 * verschwinden — dort sieht sie niemand, und sie ist der einzige Fall, der
 * eine Eingabe braucht.
 */
export function nachFaelligkeit(
  a: Pick<Wartung, 'faelligAm'>,
  b: Pick<Wartung, 'faelligAm'>,
): number {
  const x = a.faelligAm && ISO.test(a.faelligAm) ? a.faelligAm : '';
  const y = b.faelligAm && ISO.test(b.faelligAm) ? b.faelligAm : '';
  return x.localeCompare(y);
}
