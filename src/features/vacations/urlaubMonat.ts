import type { Vacation } from '@/types';
import { localDateStr } from '@/lib/time';

/**
 * WER WANN FREI HAT — für die, die Urlaub entscheiden (Plan 17 H).
 *
 * Gerechnet wird aus dem genehmigten Urlaub und Zeitausgleich des Betriebs,
 * samt Betriebsurlaub (er steht je Person als genehmigter Urlaub da). Lesen
 * dürfen das alle, die entscheiden (`vacations_lesen` über
 * `app.darf_urlaub_entscheiden`) — es braucht kein neues Recht.
 *
 * NICHT DARIN: Krankenstände und Sonderurlaub. Sie sind nicht Teil der
 * Urlaubsentscheidung, und wer nur als Genehmigender eingetragen ist, darf
 * sie nicht lesen (Gesundheitsdaten, Büro).
 */

/**
 * Obergrenze je Abfrage. Ein Monat hat bei hundert Leuten samt Betriebsurlaub
 * keine tausend genehmigten Anträge; wird sie doch erreicht, sagt die Ansicht,
 * dass die Übersicht unvollständig ist, statt still zu kürzen.
 */
export const GENEHMIGT_GRENZE = 1000;

type Eintrag = Pick<Vacation, 'userId' | 'userName' | 'von' | 'bis'> &
  Partial<Pick<Vacation, 'art' | 'zaVon' | 'zaBis' | 'betriebsurlaubId'>>;

/** Erster und letzter Tag eines Monats ('YYYY-MM-DD'); `monat` 0-basiert. */
export function monatsGrenzen(jahr: number, monat: number): { von: string; bis: string } {
  return {
    von: localDateStr(new Date(jahr, monat, 1)),
    bis: localDateStr(new Date(jahr, monat + 1, 0)),
  };
}

/**
 * Wie viele PERSONEN an jedem Tag des Zeitraums frei haben. Eine Person mit
 * Urlaub und Zeitausgleich am selben Tag zählt einmal.
 */
export function personenJeTag(liste: Eintrag[], von: string, bis: string): Map<string, number> {
  const je = new Map<string, Set<string>>();
  for (const v of liste) {
    const anfang = v.von > von ? v.von : von;
    const ende = v.bis < bis ? v.bis : bis;
    if (anfang > ende) continue;
    const [j, m, t] = anfang.split('-').map(Number);
    // Über den Kalender, nicht über Millisekunden: die Zeitumstellung hat 23- und 25-Stunden-Tage.
    for (let d = new Date(j, m - 1, t); localDateStr(d) <= ende; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = localDateStr(d);
      const menge = je.get(iso) ?? new Set<string>();
      menge.add(v.userId);
      je.set(iso, menge);
    }
  }
  return new Map([...je].map(([iso, menge]) => [iso, menge.size]));
}

/** Was an einem Tag gilt, nach Namen geordnet. */
export function amTag<T extends Eintrag>(liste: T[], tag: string): T[] {
  return liste
    .filter((v) => v.von <= tag && v.bis >= tag)
    .sort((a, b) => a.userName.localeCompare(b.userName, 'de'));
}

/** „Urlaub“, „Betriebsurlaub“, „Zeitausgleich 13:00–17:00“. */
export function artText(v: Eintrag): string {
  if (v.betriebsurlaubId) return 'Betriebsurlaub';
  if (v.art === 'Zeitausgleich') return v.zaVon && v.zaBis ? `Zeitausgleich ${v.zaVon}–${v.zaBis}` : 'Zeitausgleich';
  return 'Urlaub';
}

/**
 * Wer ANDERER im Zeitraum eines Antrags frei hat — je Person einmal, nach
 * Namen. Wer dabei nur Zeitausgleich hat, steht mit „(ZA)“ da: er fehlt
 * vielleicht nur ein paar Stunden.
 */
export function gleichzeitigMit(antrag: Eintrag, genehmigt: Eintrag[]): string[] {
  const je = new Map<string, { name: string; nurZa: boolean }>();
  for (const v of genehmigt) {
    if (v.userId === antrag.userId || v.von > antrag.bis || v.bis < antrag.von) continue;
    const za = v.art === 'Zeitausgleich' && !v.betriebsurlaubId;
    const bisher = je.get(v.userId);
    je.set(v.userId, { name: v.userName, nurZa: (bisher?.nurZa ?? true) && za });
  }
  return [...je.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((p) => (p.nurZa ? `${p.name} (ZA)` : p.name));
}

/** Vom frühesten Beginn bis zum spätesten Ende der Anträge — `null` ohne Antrag. */
export function zeitspanne(antraege: Pick<Vacation, 'von' | 'bis'>[]): { von: string; bis: string } | null {
  if (antraege.length === 0) return null;
  return {
    von: antraege.reduce((m, a) => (a.von < m ? a.von : m), antraege[0].von),
    bis: antraege.reduce((m, a) => (a.bis > m ? a.bis : m), antraege[0].bis),
  };
}
