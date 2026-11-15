import { kwSchluessel } from './planungKopf';

/** „Mi 02.09.“ — kurz, für eine Aufzählung. */
function tagKurz(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const wt = d.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '');
  return `${wt} ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
}

/**
 * „An 3 Tagen eingeteilt: Mi 02.09., Do 03.09., Fr 04.09.“ — ab fünf Tagen
 * die ersten drei und „…“ (V1).
 */
export function eingeteiltText(tage: readonly string[]): string {
  const n = tage.length;
  const liste = n > 4 ? `${tage.slice(0, 3).map(tagKurz).join(', ')} …` : tage.map(tagKurz).join(', ');
  return `${n === 1 ? 'An einem Tag' : `An ${n} Tagen`} eingeteilt: ${liste}`;
}

/** Die Woche dieses Tages im Einsatzplan, der Tag markiert. */
export function planAdresse(tag: string): string {
  return `/assignments/woche?woche=${kwSchluessel(tag)}&tag=${tag}`;
}
