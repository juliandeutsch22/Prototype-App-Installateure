import type { BaustellenVerwendung } from '@/lib/db/projects';

/**
 * WAS AN EINER BAUSTELLE HÄNGT — in Worten (A1, F7).
 *
 * Eine Stelle für Löschdialog und Rücknahme einer Annahme: beide lesen
 * dieselbe Zählung der Datenbank (`baustelle_verwendung`), und beide sollen
 * dasselbe sagen. Vorher meldete die Liste beim Scheitern pauschal
 * „Buchungen, Scheine, Rechnungen oder Pläne“ — auch bei einer leeren
 * Baustelle, an der nur das Angebot hing.
 */

const WORTE: [keyof Omit<BaustellenVerwendung, 'angebote'>, string, string][] = [
  ['zeitbuchungen', 'Zeitbuchung', 'Zeitbuchungen'],
  ['einsaetze', 'Einsatz', 'Einsätze'],
  ['scheine', 'Handwerksschein', 'Handwerksscheine'],
  ['rechnungen', 'Rechnung', 'Rechnungen'],
  ['anforderungen', 'Materialanforderung', 'Materialanforderungen'],
  ['ruestlisten', 'Rüstlistenzeile', 'Rüstlistenzeilen'],
  ['dokumente', 'Plan oder Dokument', 'Pläne oder Dokumente'],
  ['termine', 'Termin', 'Termine'],
  ['nachrichten', 'Nachricht', 'Nachrichten'],
];

/** „2 Zeitbuchungen“, „1 Einsatz“ … */
function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

/** „a, b und c“ */
export function aufzaehlen(teile: string[]): string {
  if (teile.length <= 1) return teile.join('');
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

/**
 * Was eine Löschung aufhält oder mitnimmt, ohne die Angebote.
 * `mitTermine`: Termine und Nachrichten zählen mit (bei der Rücknahme halten
 * sie die Löschung auf; beim gewöhnlichen Löschen gehen sie mit).
 */
export function verwendungTeile(v: BaustellenVerwendung, mitTermine: boolean): string[] {
  return WORTE
    .filter(([k]) => mitTermine || (k !== 'termine' && k !== 'nachrichten'))
    .filter(([k]) => v[k] > 0)
    .map(([k, e, m]) => anzahl(v[k], e, m));
}

/** Was beim gewöhnlichen Löschen still mitginge: Termine und Nachrichten. */
export function gehtMit(v: BaustellenVerwendung): string[] {
  return WORTE
    .filter(([k]) => k === 'termine' || k === 'nachrichten')
    .filter(([k]) => v[k] > 0)
    .map(([k, e, m]) => anzahl(v[k], e, m));
}

/** Der Weg, den der Löschdialog der Baustellenliste nennt. */
export type LoeschWeg =
  | { art: 'frei'; mitgehend: string[] }
  | { art: 'angebot'; angebot: { id: string; nummer: string } }
  | { art: 'abschliessen'; grund: string[] };

/**
 * Darf gelöscht werden — und wenn nicht, warum und was stattdessen?
 *
 * Ein angenommenes Angebot zuerst: dann ist der Weg die Rücknahme der
 * Annahme am Angebot — sie löscht die Baustelle selbst, wenn sonst nichts
 * daran hängt, und öffnet das Angebot wieder. Hängt anderes daran, ist der
 * Weg das Abschließen.
 */
export function loeschWeg(v: BaustellenVerwendung): LoeschWeg {
  const angenommen = v.angebote.find((a) => a.status === 'Angenommen');
  const sonst = verwendungTeile(v, false);
  if (angenommen && sonst.length === 0) return { art: 'angebot', angebot: angenommen };
  const andereAngebote = v.angebote.length;
  if (sonst.length > 0 || andereAngebote > 0) {
    return {
      art: 'abschliessen',
      grund: [...sonst, ...(andereAngebote > 0 ? [anzahl(andereAngebote, 'Angebot', 'Angebote')] : [])],
    };
  }
  return { art: 'frei', mitgehend: gehtMit(v) };
}

/**
 * Was die Rücknahme mit der Baustelle tun wird — für die Rückfrage am
 * Angebot. `angebotId`: dieses Angebot zählt nicht mit (die Rücknahme löst
 * es von der Baustelle, bevor die Datenbank zählt).
 */
export function ruecknahmeFolge(v: BaustellenVerwendung, angebotId: string, nummer: string): string {
  const andere = v.angebote.filter((a) => a.id !== angebotId).length;
  const teile = [
    ...verwendungTeile(v, true),
    ...(andere > 0 ? [anzahl(andere, 'weiteres Angebot', 'weitere Angebote')] : []),
  ];
  if (teile.length === 0) return `Die Baustelle ${nummer} wird gelöscht — an ihr hängt sonst nichts.`;
  return `Die Baustelle ${nummer} wird abgeschlossen, nicht gelöscht: an ihr ${teile.length === 1 && /^1 /.test(teile[0]) ? 'hängt' : 'hängen'} ${aufzaehlen(teile)}. Nichts davon geht verloren.`;
}
