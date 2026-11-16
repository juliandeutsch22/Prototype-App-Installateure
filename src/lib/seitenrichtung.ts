import { aktiverMenuepunktFuer } from '@/app/navigation';

/**
 * WOHIN EIN SEITENWECHSEL GEHT (Plan 15.11.2026, B12).
 *
 * Von der Liste in die Akte geht es „tiefer“ (die Akte kommt von rechts),
 * von der Akte zurück in ihre Liste „zurück“ (die Liste kommt von links —
 * die Akte geht nach rechts hinaus). Alles andere — ein anderer Bereich,
 * ein Unterreiter, die Startseite — ist „quer“ und blendet nur ein, wie
 * bisher (Implementierungsauftrag 12.2: Seitenwechsel ohne seitliches
 * Durchschieben).
 *
 * Tiefer heißt: derselbe Bereich, und der neue Pfad setzt den alten fort
 * (`/customers` → `/customers/k1`). Ein Schein (`/worksheet…`) steht bei
 * seiner Liste `/worksheets`, obwohl er nicht unter ihrem Pfad liegt.
 */
export function seitenRichtung(von: string, nach: string): 'tiefer' | 'zurueck' | 'quer' {
  const a = teile(von);
  const b = teile(nach);
  if (!a.length || !b.length || a[0] !== b[0] || a.length === b.length) return 'quer';
  const [kurz, lang] = a.length < b.length ? [a, b] : [b, a];
  if (!kurz.every((t, i) => lang[i] === t)) return 'quer';
  return a.length < b.length ? 'tiefer' : 'zurueck';
}

function teile(pfad: string): string[] {
  const t = pfad.split('/').filter(Boolean);
  const liste = aktiverMenuepunktFuer(pfad);
  return liste && !pfad.startsWith(`${liste}/`) && pfad !== liste ? [...liste.split('/').filter(Boolean), ...t] : t;
}
