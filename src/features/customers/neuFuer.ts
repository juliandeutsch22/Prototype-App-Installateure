import type { Customer, Liegenschaft, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import type { RowMenuItem } from '@/components/RowMenu';
import { canAccess } from '@/app/navigation';
import { darfEingangErfassen, isGF } from '@/lib/permissions';
import { listCustomersByIds } from '@/lib/db/customers';
import { getLiegenschaft } from '@/lib/db/liegenschaften';

/**
 * „NEU FÜR DIESEN KUNDEN“ (Durchsicht 15.11.2026, V3).
 *
 * Die Kundenakte hatte als einzige Aktion „Bearbeiten“; Angebot, Baustelle,
 * Eingang und Wartung begannen in ihrer Liste, und der Kunde wurde dort noch
 * einmal gesucht. Ebenso die Liegenschaftsakte. Jetzt trägt das „⋯“ der Akte
 * den Weg, und die Zielseite öffnet ihr Formular mit Kunde, Ort und
 * Liegenschaft vorbelegt.
 *
 * Die Vorbelegung reist in der Adresse (`?neu=fuer&kunde=…&liegenschaft=…`):
 * so überlebt sie ein Neuladen bis zum Öffnen, und jede Zielseite nimmt die
 * Parameter danach wieder heraus.
 */
export interface NeuFuer {
  kunde?: string;
  liegenschaft?: string;
  top?: string;
}

/** Was es zu einem Kunden oder einer Liegenschaft neu geben kann — mit dem Recht, es anzulegen. */
const ZIELE: { pfad: string; text: string; darf: (r: Role) => boolean }[] = [
  { pfad: '/eingaenge', text: 'Neuer Eingang', darf: darfEingangErfassen },
  { pfad: '/quotes', text: 'Neues Angebot', darf: isGF },
  { pfad: '/admin-projects', text: 'Neue Baustelle', darf: isGF },
  { pfad: '/wartungen', text: 'Neue Wartung', darf: isGF },
];

export function neuFuerAdresse(pfad: string, v: NeuFuer): string {
  const p = new URLSearchParams({ neu: 'fuer' });
  if (v.kunde) p.set('kunde', v.kunde);
  if (v.liegenschaft) p.set('liegenschaft', v.liegenschaft);
  if (v.top) p.set('top', v.top);
  return `${pfad}?${p.toString()}`;
}

/** Die Einträge für das „⋯“ der Akte — nur, was Rolle und Module erlauben. */
export function neuFuerMenue(
  rolle: Role,
  module: Record<string, boolean> | undefined,
  v: NeuFuer,
  oeffnen: (adresse: string) => void,
): RowMenuItem[] {
  return ZIELE
    .filter((z) => z.darf(rolle) && canAccess(rolle, z.pfad, module))
    .map((z) => ({ label: z.text, onSelect: () => oeffnen(neuFuerAdresse(z.pfad, v)) }));
}

/** Die Vorbelegung aus der Adresse — `null`, wenn keine angefragt ist. */
export function neuFuerLesen(p: URLSearchParams): NeuFuer | null {
  if (p.get('neu') !== 'fuer') return null;
  return {
    ...(p.get('kunde') ? { kunde: p.get('kunde')! } : {}),
    ...(p.get('liegenschaft') ? { liegenschaft: p.get('liegenschaft')! } : {}),
    ...(p.get('top') ? { top: p.get('top')! } : {}),
  };
}

/** Dieselbe Adresse ohne die Vorbelegung — sonst öffnete jedes Neuladen das Formular wieder. */
export function ohneNeuFuer(p: URLSearchParams): URLSearchParams {
  const rest = new URLSearchParams(p);
  for (const n of ['neu', 'kunde', 'liegenschaft', 'top']) rest.delete(n);
  return rest;
}

/**
 * Kunde und Liegenschaft der Vorbelegung laden. Was es nicht (mehr) gibt,
 * ist `null` — das Formular öffnet trotzdem, nur ohne diese Angabe.
 * `ort`: wo gearbeitet wird — die Anschrift der Liegenschaft vor der des
 * Kunden (eine Hausverwaltung sitzt woanders als ihre Häuser).
 */
export async function neuFuerLaden(companyId: string, v: NeuFuer): Promise<{
  kunde: WithId<Customer> | null;
  liegenschaft: Liegenschaft | null;
  ort: string;
}> {
  const [kunden, liegenschaft] = await Promise.all([
    v.kunde ? listCustomersByIds(companyId, [v.kunde]).catch(() => []) : Promise.resolve([]),
    v.liegenschaft ? getLiegenschaft(companyId, v.liegenschaft).catch(() => null) : Promise.resolve(null),
  ]);
  const kunde = kunden.find((k) => k.id === v.kunde) ?? null;
  return { kunde, liegenschaft, ort: liegenschaft?.anschrift?.trim() || kunde?.address || '' };
}
