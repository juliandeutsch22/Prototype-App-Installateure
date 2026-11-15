import type { FolgeEntfernt, FolgeTag } from '@/lib/db/assignments';
import { fmtDay } from './einsatzDaten';
import { getAustrianHolidayName } from '@/lib/time';

/** Höchstens so viele Tage je Speichern — das Fenster der Abwesenheitsprüfung (`einsatz_folgetage`). */
export const FOLGETAGE_HOECHSTENS = 62;

/** Ein Tag nach `iso` ('YYYY-MM-DD'), ohne Zeitzone: gerechnet wird mit Kalendertagen. */
export function tagDanach(iso: string, n = 1): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tage von a bis b einschließlich. */
export function tageEinschliesslich(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * WAS DER PLANER NACH DEM SPEICHERN WISSEN MUSS (B4, E85): die Tage, an denen
 * etwas anders lief als gewählt. Ausgelassene Wochenenden mit „nur
 * Werktage“ sind die Wahl selbst und stehen nicht da; alles andere schon —
 * nichts wird still übersprungen.
 */
export function folgeBericht(tage: readonly FolgeTag[]): { geplant: number; zeilen: string[] } {
  const geplant = tage.filter((t) => t.ergebnis === 'geplant' || t.ergebnis === 'ergaenzt' || t.ergebnis === 'geaendert').length;
  const zeilen: string[] = [];
  for (const t of tage) {
    const teile: string[] = [];
    if (t.ergebnis === 'feiertag') teile.push('Feiertag — ausgelassen');
    if (t.ergebnis === 'betriebsurlaub') teile.push(`Betriebsurlaub${t.abwesend[0] ? ` („${t.abwesend[0]}“)` : ''} — ausgelassen`);
    if (t.ergebnis === 'alle_abwesend') teile.push('alle abwesend — niemand eingeteilt');
    if (t.ergebnis === 'ergaenzt') teile.push('war schon geplant — ergänzt');
    // V13: beim Angleichen steht da, wer an dem Tag herausgenommen wurde.
    if ((t.entfernt ?? []).length > 0) teile.push(`${t.entfernt.join(', ')} herausgenommen`);
    if (t.ergebnis !== 'betriebsurlaub' && t.ergebnis !== 'alle_abwesend' && t.abwesend.length > 0) {
      teile.push(`${t.abwesend.join(', ')} abwesend, nicht eingeteilt`);
    }
    if (t.anderswo.length > 0) teile.push(`${t.anderswo.join(', ')} auch auf einer anderen Baustelle`);
    if (teile.length > 0) zeilen.push(`${fmtDay(t.datum)}: ${teile.join('; ')}`);
  }
  return { geplant, zeilen };
}

/** Die Meldung nach dem Entfernen über mehrere Tage (V13). */
export function entferntBericht(tage: readonly FolgeEntfernt[]): string {
  if (tage.length === 0) return ' · an den folgenden Tagen war nichts mehr zu entfernen';
  const leer = tage.filter((t) => t.ruestliste === 'behalten').length;
  const aufgeloest = tage.filter((t) => t.ruestliste === 'aufgeloest').length;
  const teile = [`dazu an ${tage.length === 1 ? 'einem weiteren Tag' : `${tage.length} weiteren Tagen`}`];
  if (aufgeloest) teile.push(`${aufgeloest === 1 ? 'eine Rüstliste' : `${aufgeloest} Rüstlisten`} aufgelöst`);
  if (leer) teile.push(`${leer === 1 ? 'eine Rüstliste bleibt' : `${leer} Rüstlisten bleiben`} ohne Mannschaft stehen`);
  return ` · ${teile.join('; ')}`;
}

/**
 * Der nächste Werktag nach `iso` — ohne Wochenende und gesetzlichen
 * Feiertag. „Auf morgen kopieren“ am Freitag meint den Montag; am Tag vor
 * dem Feiertag den Tag danach. Betriebsurlaub prüft die Datenbank und sagt es.
 */
export function naechsterWerktag(iso: string): string {
  let t = tagDanach(iso);
  for (let i = 0; i < 14; i++) {
    const d = new Date(`${t}T00:00:00`);
    const wt = d.getDay();
    if (wt !== 0 && wt !== 6 && !getAustrianHolidayName(d)) return t;
    t = tagDanach(t);
  }
  return t;
}

/** „Auch an den folgenden Tagen entfernen“ (V13): Haken und letzter Tag. */
export interface FolgetageStand {
  an: boolean;
  bis: string;
}

/** Ist die Wahl so, dass entfernt werden kann? Ohne Haken immer. */
export function folgetageGueltig(tag: string, s: FolgetageStand): boolean {
  return !s.an || (!!s.bis && s.bis > tag && s.bis <= tagDanach(tag, FOLGETAGE_HOECHSTENS - 1));
}
