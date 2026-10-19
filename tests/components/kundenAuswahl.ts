import { vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/*
  DIE KUNDENAUSWAHL IN DEN SEITENPRÜFUNGEN (Ladezeit, 19.10.2026).

  Die Seiten laden keine Kundenliste mehr; gewählt wird über die Suche
  (`KundenAuswahl`), angezeigt über Kennung oder Namen (`useKunde`,
  `useKundenFuer`). Statt in jeder Prüfung dieselbe Attrappe nachzubauen,
  stehen sie hier — gegen eine feste Liste, wie sie die Prüfung führt.
*/

interface KundeArt { id?: string; name: string; address?: string; active?: boolean }

/** Die Datenschicht der Kundenauswahl — für `vi.mock('@/lib/db/customers', …)`. */
export function kundenAttrappe<K extends KundeArt>(kunden: () => K[]) {
  return {
    searchCustomers: vi.fn(async (_c: string, begriff: string) => {
      const q = begriff.trim().toLowerCase();
      return kunden().filter((k) => [k.name, k.address].some((x) => x?.toLowerCase().includes(q)));
    }),
    listCustomersByIds: vi.fn(async (_c: string, ids: string[]) => kunden().filter((k) => k.id && ids.includes(k.id))),
    kundenNachNamen: vi.fn(async (_c: string, namen: readonly string[]) => {
      const gesucht = new Set(namen.map((n) => n.trim().toLowerCase()));
      return kunden().filter((k) => gesucht.has(k.name.trim().toLowerCase()));
    }),
  };
}

/**
 * Einen Kunden über die Suche wählen — wo die Prüfungen vorher im Auswahlfeld
 * `selectOptions` riefen. Getippt wird der Name; gewählt die Zeile des Treffers.
 */
export async function kundeWaehlen(nutzer: UserEvent, name: string, label = 'Kunde', bereich?: HTMLElement) {
  const wo = bereich ? within(bereich) : screen;
  // Erst warten, bis die Auswahl dasteht — als Suchfeld oder mit gewähltem Kunden.
  await waitFor(() => {
    if (!wo.queryByRole('button', { name: 'Anderen Kunden wählen' }) && !wo.queryByRole('searchbox', { name: label })) {
      throw new Error(`Keine Kundenauswahl „${label}“`);
    }
  });
  // Steht schon ein Kunde da, erst „Anderen Kunden wählen“.
  const anderer = wo.queryByRole('button', { name: 'Anderen Kunden wählen' });
  if (anderer) await nutzer.click(anderer);
  const feld = wo.getByRole('searchbox', { name: label });
  await nutzer.clear(feld);
  await nutzer.type(feld, name);
  await nutzer.click(await wo.findByRole('button', { name }));
}
