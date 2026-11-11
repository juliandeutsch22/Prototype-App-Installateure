import { acceptQuote } from '@/lib/db/quotes';
import type { Abrechnungsart, Quote } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Annehmen — und daraus die Baustelle machen.
 *
 * Der eigentliche Zweck des ganzen Schritts. Die kalkulierten Stunden
 * wandern als Stundenbudget mit; die Budget-Ampel misst danach gegen eine
 * Zahl, die aus der Kalkulation stammt und nicht aus einem Gedächtnis.
 *
 * Eine Funktion für Liste UND Angebotsseite: zwei Fassungen desselben
 * Ablaufs laufen irgendwann auseinander, und dann legt der eine Knopf eine
 * andere Baustelle an als der andere.
 *
 * DIE NUMMER KOMMT AUS DEM ZÄHLER DER BAUSTELLEN — wie bei jeder anderen
 * Baustelle. Bis zum Launch-Check (25.09.2026, K6) wurde sie aus der
 * Angebotsnummer abgeleitet (AN-2026-0004 → PR-2026-0004). Damit gab es drei
 * Logiken für eine Frage, und die Nummern sprangen: der Zähler wusste nichts
 * von der abgeleiteten, und eine von Hand angelegte Baustelle bekam danach
 * eine, die es schon gab. Zuordenbar bleiben beide trotzdem — die Baustelle
 * kennt ihr Angebot über die Kennung, und die Akte verlinkt es.
 */
export async function angebotAnnehmen(
  companyId: string,
  q: WithId<Quote>,
  vorsatzBaustelle: string,
  /**
   * Wie die Baustelle abgerechnet wird — beim Annehmen gewählt (Testbericht
   * 30.09.2026, M16). Pauschal war bisher die einzige Möglichkeit und bleibt
   * die Vorgabe.
   */
  abrechnung: Abrechnungsart = 'Pauschal',
): Promise<{ projectNumber: string }> {
  void companyId;
  return { projectNumber: await acceptQuote(q.id, vorsatzBaustelle, abrechnung) };
}

/** Die Meldung nach dem Annehmen — gleich, wo angenommen wurde. */
export function annahmeMeldung(r: { projectNumber: string }): string {
  return `Baustelle ${r.projectNumber} angelegt`;
}
