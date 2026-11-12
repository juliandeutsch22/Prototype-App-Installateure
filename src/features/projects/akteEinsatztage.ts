import type { Assignment } from '@/types';
import type { WithId } from '@/lib/db/core';

/** Einsätze sind je Person und Tag gespeichert; die Akte zeigt Tage mit ihren Leuten. */
export function nachTag(einsaetze: readonly WithId<Assignment>[], namen: (uid: string) => string | undefined) {
  const tage = new Map<string, string[]>();
  for (const a of einsaetze) {
    const liste = tage.get(a.date) ?? [];
    const name = (namen(a.userId) ?? a.userName ?? '').trim();
    if (name && !liste.includes(name)) liste.push(name);
    tage.set(a.date, liste);
  }
  return [...tage.entries()].map(([datum, leute]) => ({ datum, leute: leute.sort((x, y) => x.localeCompare(y, 'de')) }));
}

