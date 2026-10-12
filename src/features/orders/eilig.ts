import type { MaterialOrder } from '@/types';

/**
 * Lässt sich diese Anforderung jetzt (noch) als eilig markieren? (17 F)
 *
 * Dieselben Bedingungen wie in `anforderung_eilig_setzen` — hier nur, damit
 * der Knopf gar nicht erst erscheint, wo die Datenbank ablehnen würde:
 * offen oder in Arbeit, nicht abgeschlossen, keine Retoure, mit Baustelle.
 */
export function eiligMoeglich(
  o: Pick<MaterialOrder, 'status' | 'processed' | 'transactionType' | 'projectNumber'>,
): boolean {
  return (
    o.transactionType !== 'return' &&
    (o.status === 'Offen' || o.status === 'In Bearbeitung') &&
    !o.processed &&
    !!o.projectNumber?.trim()
  );
}
