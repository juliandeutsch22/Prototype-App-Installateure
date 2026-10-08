import { acceptQuote } from '@/lib/db/quotes';
import type { Abrechnungsart, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Liste und Angebotsseite nehmen auf demselben Weg an. Die Datenbank sperrt
 * das aktuelle Angebot und schreibt Baustelle, Nummer und Annahme gemeinsam.
 * Eine Wiederholung mit altem Browserstand erzeugt damit keine zweite Baustelle;
 * bei einem Abbruch bleibt auch keine halbe Annahme zurück.
 * Kunde, Anschrift, Auftragsumfang und Stundenbudget stammen aus dem Angebot.
 */
export function angebotAnnehmen(
  companyId: string,
  q: WithId<Quote>,
  vorsatzBaustelle: string,
  abrechnung: Abrechnungsart = 'Pauschal',
): Promise<{ projectNumber: string }> {
  return acceptQuote(companyId, q.id, vorsatzBaustelle, abrechnung);
}

/** Die Meldung nach dem Annehmen — gleich, wo angenommen wurde. */
export function annahmeMeldung(r: { projectNumber: string }): string {
  return `Baustelle ${r.projectNumber} angelegt`;
}
