import { updateQuote } from '@/lib/db/quotes';
import {
  createProject,
  listActiveProjects,
  reserveProjectNumber,
  type NewProject,
} from '@/lib/db/projects';
import { belegNummer, hoechsteLfd } from '@/lib/praefixe';
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
 * Gibt die vergebene Nummer zurück und die, die abgeleitet worden wäre —
 * weichen sie ab, war die abgeleitete schon vergeben.
 */
export async function angebotAnnehmen(
  companyId: string,
  q: WithId<Quote>,
  vorsatzBaustelle: string,
): Promise<{ projectNumber: string; abgeleitet: string }> {
  const vorhandene = await listActiveProjects(companyId);
  /*
    BAUSTELLENNUMMER AUS DER ANGEBOTSNUMMER — damit beide ohne weiteres
    Zutun einander zuordenbar bleiben.

    Abgezogen wird die Nummer, wie sie WIRKLICH DASTEHT: ein Angebot von vor
    der Umstellung der Vorsätze trägt noch den alten, und den kennt diese
    Ansicht nicht mehr. Deshalb wird alles vor der Jahreszahl ersetzt, statt
    auf einen bestimmten Anfang zu hoffen.
  */
  const rumpf = q.quoteNumber.replace(/^.*?(?=\d{4}-)/, '');
  const abgeleitet = vorsatzBaustelle ? `${vorsatzBaustelle}-${rumpf}` : rumpf;
  /*
    IST DIE ABGELEITETE NUMMER VERGEBEN, KOMMT DIE NÄCHSTE FREIE.

    Angebote und Baustellen zählen getrennt. Wer Baustellen auch von Hand
    anlegt — also jeder Betrieb —, hat nach dem ersten Monat B-2026-0003,
    während das dritte Angebot AN-2026-0003 heisst. Früher liess sich das
    Angebot dann GAR NICHT annehmen. Jetzt vergibt der Zähler die Nummer —
    derselbe Weg wie bei der Baustellenanlage.
  */
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
  let projectNumber = abgeleitet;
  const belegt = vorhandene.some((p) => p.projectNumber === abgeleitet);
  try {
    if (belegt) throw new Error('projects_nummer_je_betrieb');
    await createProject(companyId, { ...daten, projectNumber });
  } catch (e) {
    if (!/projects_nummer_je_betrieb|duplicate key/i.test((e as Error).message)) throw e;
    const hoechste = hoechsteLfd(vorhandene.map((p) => p.projectNumber));
    // `null` heisst „kein Zähler erreichbar" — dann gilt der örtliche
    // Vorschlag, wie in der Baustellenanlage.
    projectNumber =
      (await reserveProjectNumber(companyId, { seedFrom: hoechste, praefix: vorsatzBaustelle })) ??
      belegNummer(vorsatzBaustelle, new Date().getFullYear(), hoechste + 1);
    await createProject(companyId, { ...daten, projectNumber });
  }
  await updateQuote(q.id, { status: 'Angenommen', projectNumber });
  return { projectNumber, abgeleitet };
}

/** Die Meldung nach dem Annehmen — gleich, wo angenommen wurde. */
export function annahmeMeldung(r: { projectNumber: string; abgeleitet: string }): string {
  return r.projectNumber === r.abgeleitet
    ? `Baustelle ${r.projectNumber} angelegt`
    : `Baustelle ${r.projectNumber} angelegt — ${r.abgeleitet} war schon vergeben`;
}
