import type { Abwesenheit } from '@/lib/db/vacations';

/**
 * WER VON DEN EINGETEILTEN FEHLT (Testbericht 30.09.2026, M33).
 *
 * Eine Krankmeldung verdrängte den Einsatz ohne Warnung: im Wochenplan stand
 * nur „Krank“, der Einsatz war weg, die Startseite schwieg, und der Monteur
 * sah ihn weiter als nächsten Einsatz. Diese Rechnung sagt für einen Tag und
 * eine Baustelle, wer da ist und wer fehlt — und ob damit niemand mehr da
 * ist.
 *
 * Als FEHLEND zählt nur, wer GANZTAGS weg ist. Stundenweise (ZA 13–17 Uhr)
 * ist man teilweise da; das steht beim Namen, besetzt ist die Baustelle
 * trotzdem.
 */
export function ganztagsWeg(abwesenheiten: Abwesenheit[], uid: string, tag: string): Abwesenheit | null {
  return abwesenheiten.find((a) => a.userId === uid && !a.zeiten && a.von <= tag && a.bis >= tag) ?? null;
}

export interface Besetzung {
  /** Wer eingeteilt ist und da. */
  da: string[];
  /** Wer eingeteilt ist und ganztags fehlt — mit Grund, soweit sichtbar. */
  fehlen: { name: string; grund: string | null }[];
  /** Eingeteilt waren welche, da ist keiner. */
  unbesetzt: boolean;
}

export function besetzung(
  eingeteilt: { userId: string; userName?: string }[],
  abwesenheiten: Abwesenheit[],
  tag: string,
): Besetzung {
  const da: string[] = [];
  const fehlen: Besetzung['fehlen'] = [];
  for (const e of eingeteilt) {
    const name = e.userName?.trim() || 'Unbekannt';
    const weg = ganztagsWeg(abwesenheiten, e.userId, tag);
    if (weg) fehlen.push({ name, grund: weg.grund });
    else da.push(name);
  }
  return { da, fehlen, unbesetzt: eingeteilt.length > 0 && da.length === 0 };
}

/** „Erna (Krank), Max“ — wer fehlt, mit Grund, wo er sichtbar ist. */
export function fehlenText(fehlen: Besetzung['fehlen']): string {
  return fehlen.map((f) => (f.grund ? `${f.name} (${f.grund})` : f.name)).join(', ');
}
