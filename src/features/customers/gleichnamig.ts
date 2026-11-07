/**
 * GLEICHNAMIGE KUNDEN — eine Prüfung für jeden Weg, auf dem ein Kunde
 * entsteht (Testbericht 30.09.2026, M11; seit M02b auch aus einem
 * Auftragseingang).
 *
 * Huber und Gruber gibt es oft; ein gleicher Name ist erlaubt, aber nicht
 * still: die Rückfrage sagt, wen es schon gibt und wo. Gefragt wird der
 * Server, nicht eine geladene Liste — er kennt den ganzen Bestand.
 */
import { searchCustomers } from '@/lib/db/customers';
import type { Customer } from '@/types';
import type { WithId } from '@/lib/db/core';

/** Namen für den Abgleich vereinheitlichen — Groß-/Kleinschreibung und Leerraum. */
export function schluessel(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Die Kunden des Betriebs mit genau diesem Namen (nach `schluessel`). */
export async function gleichnamigeKunden(companyId: string, name: string): Promise<WithId<Customer>[]> {
  const treffer = await searchCustomers(companyId, name.trim(), 50);
  return treffer.filter((k) => schluessel(k.name) === schluessel(name));
}

/**
 * Die Rückfrage: wen es schon gibt, mit Adresse — daran erkennt man ihn.
 * `sonst` sagt, was statt des Anlegens geht (in der Kundenliste: den
 * bestehenden bearbeiten; im Eingang: ihn übernehmen).
 */
export function rueckfrageText(
  name: string,
  gleiche: Pick<Customer, 'name' | 'address'>[],
  sonst = 'sonst den bestehenden bearbeiten',
): string {
  const wer = gleiche
    .slice(0, 3)
    .map((k) => `„${k.name}“ (${k.address?.trim() || 'ohne Adresse'})`)
    .join(', ');
  const mehr = gleiche.length > 3 ? ` und ${gleiche.length - 3} weitere` : '';
  return `Es gibt schon ${wer}${mehr}. Ist „${name}“ ein anderer Kunde, trotzdem anlegen; ${sonst}.`;
}
