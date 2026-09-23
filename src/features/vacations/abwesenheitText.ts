import type { KrankmeldungErgebnis } from '@/lib/db/abwesenheiten';

/** Datums- und Ergebnistexte der Abwesenheiten — von mehreren Ansichten geteilt. */

export function fmtTag(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function zeitraumText(von: string, bis: string): string {
  return von === bis ? fmtTag(von) : `${fmtTag(von)} – ${fmtTag(bis)}`;
}

/** Was eine gespeicherte Meldung im Zeitkonto bewirkt hat, in einem Satz. */
export function ergebnisText(e: KrankmeldungErgebnis): string {
  const teile: string[] = [];
  if (e.angelegt) teile.push(`${e.angelegt} ${e.angelegt === 1 ? 'Tag' : 'Tage'} eingetragen`);
  if (e.entfernt) teile.push(`${e.entfernt} ${e.entfernt === 1 ? 'Tag' : 'Tage'} entfernt`);
  if (e.uebersprungen) {
    teile.push(`${e.uebersprungen} übersprungen (dort war schon gebucht)`);
  }
  return teile.length ? teile.join(', ') : 'nichts im Zeitkonto geändert';
}
