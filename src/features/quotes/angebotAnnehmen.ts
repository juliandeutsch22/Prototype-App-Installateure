import { updateQuote } from '@/lib/db/quotes';
import { createProject, reserveProjectNumber, type NewProject } from '@/lib/db/projects';
import type { Quote } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Was aus einem angenommenen Angebot in die Baustelle wandert.
 *
 * GEMELDET: „in der Baustellenbeschreibung steht nur ‚Aus Angebot
 * AN-2026-0001', und man kann nirgends sehen, was das Angebot war". Die
 * Anmerkungen des Angebots — dort steht, WAS gemacht werden soll — gingen
 * verloren. Der Monteur, der die Baustelle öffnet, sieht Angebote gar nicht
 * (sie tragen Preise); für ihn ist die Beschreibung der einzige Auftragstext.
 *
 * Jetzt stehen die Anmerkungen oben, der Verweis aufs Angebot darunter. Das
 * Angebot selbst ist von der Baustellenakte aus verlinkt.
 */
export function beschreibungAusAngebot(q: Pick<Quote, 'notes' | 'quoteNumber'>): string {
  const vermerk = `Aus Angebot ${q.quoteNumber}`;
  const text = q.notes?.trim();
  return text ? `${text}\n\n${vermerk}` : vermerk;
}

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
): Promise<{ projectNumber: string }> {
  const daten: Omit<NewProject, 'projectNumber'> = {
    customerId: q.customerId,
    customerName: q.customerName,
    address: q.address,
    status: 'Aktiv',
    billingMode: 'Pauschal',
    estimatedHours: q.kalkulierteStunden > 0 ? q.kalkulierteStunden : undefined,
    description: beschreibungAusAngebot(q),
    projectManagers: [],
    assignedEmployees: [],
  };
  const projectNumber = await reserveProjectNumber(companyId, { seedFrom: 0, praefix: vorsatzBaustelle });
  // Ohne Zähler keine Nummer: eine geratene stünde womöglich schon auf einer
  // anderen Baustelle, und das Angebot hinge dann an der falschen.
  if (!projectNumber) {
    throw new Error('Die Baustellennummer konnte nicht vergeben werden — bitte gleich noch einmal versuchen.');
  }
  await createProject(companyId, { ...daten, projectNumber });
  await updateQuote(q.id, { status: 'Angenommen', projectNumber });
  return { projectNumber };
}

/** Die Meldung nach dem Annehmen — gleich, wo angenommen wurde. */
export function annahmeMeldung(r: { projectNumber: string }): string {
  return `Baustelle ${r.projectNumber} angelegt`;
}
