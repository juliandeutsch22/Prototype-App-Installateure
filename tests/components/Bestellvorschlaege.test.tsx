import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Bestellvorschlag } from '@/lib/db/materialdeckung';
import Bestellvorschlaege from '@/features/orders/Bestellvorschlaege';
import { bestellFehler, vorschlagGrundText, vorschlagGruppen } from '@/features/orders/bestellvorschlag';

/**
 * BESTELLVORSCHLÄGE (M04b, E14/G03) — Ansicht über der Einkaufsliste.
 *
 *  - je Großhändler gebündelt, ohne Großhändler zuletzt, mit Grund und Menge;
 *  - alle vorgewählt; abwählen und Menge ändern, bevor übernommen wird;
 *  - Übernehmen schickt EINEN Befehl mit Vorgangskennung, der Menge und dem
 *    gezeigten Vorschlag als Erwartung — und lädt die Einkaufsliste neu;
 *  - was inzwischen anders ist, sagt die Meldung;
 *  - eine Menge in Stück muss ganz sein — sonst kein Übernehmen.
 *
 * Gegenprobe: ohne `Bestellvorschlaege.tsx` gibt es nichts davon.
 */

const V = (x: Partial<Bestellvorschlag> & { materialId: string; name: string }): Bestellvorschlag => ({
  einheit: 'Stk', artikelnummer: null, mindestmenge: 5, sollbestand: null, verpackungseinheit: null,
  frei: 2, zulauf: 0, grund: 'mindestmenge', menge: 3, lieferantId: null, lieferantName: null, ...x,
});

let liste: Bestellvorschlag[] = [];
const uebernehmen = vi.fn<(...a: unknown[]) => Promise<{ angelegt: number; uebersprungen: string[]; veraltet: string[] }>>(
  async () => ({ angelegt: 2, uebersprungen: [], veraltet: [] }),
);
vi.mock('@/lib/db/materialdeckung', () => ({
  bestellvorschlaege: async () => liste,
  bestellvorschlaegeUebernehmen: (...a: unknown[]) => uebernehmen(...a),
}));

beforeEach(() => {
  uebernehmen.mockClear();
  liste = [
    V({ materialId: 'a', name: 'Absperrventil', menge: 10, sollbestand: 12, verpackungseinheit: 5, lieferantId: 's1', lieferantName: 'Frauenthal' }),
    V({ materialId: 'b', name: 'Bogen 90°', grund: 'fehlmenge', frei: -3, menge: 3 }),
    V({ materialId: 'c', name: 'Muffe', lieferantId: 's2', lieferantName: 'Bacher' }),
  ];
});

function zeige(onUebernommen = vi.fn()) {
  render(
    <ToastProvider>
      <Bestellvorschlaege stand={0} onUebernommen={onUebernommen} />
    </ToastProvider>,
  );
  return onUebernommen;
}

describe('Bestellvorschläge', () => {
  it('bündelt je Großhändler, ohne Großhändler zuletzt, mit Grund und vorgeschlagener Menge', async () => {
    zeige();
    expect(await screen.findByRole('checkbox', { name: 'Absperrventil übernehmen' })).toBeChecked();
    const koepfe = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(koepfe).toEqual(['Bacher', 'Frauenthal', 'Ohne Großhändler']);
    expect(screen.getByText('Frei 2 Stk, Mindestmenge 5 Stk · bis Sollbestand 12 Stk · in Schritten zu 5 Stk')).toBeInTheDocument();
    expect(screen.getByText('Für Rüstlisten und Zusagen fehlen 3 Stk')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Menge (Stk)' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: '3 Vorschläge übernehmen' })).toBeInTheDocument();
  });

  it('übernimmt die gewählten mit ihrer Menge — ein Befehl, der gezeigte Vorschlag als Erwartung, nichts bestellt', async () => {
    const neu = zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Muffe übernehmen' }));
    const zeile = screen.getByRole('checkbox', { name: 'Absperrventil übernehmen' }).closest('li')!;
    const menge = within(zeile).getByRole('textbox', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '15');
    await userEvent.click(screen.getByRole('button', { name: '2 Vorschläge übernehmen' }));
    await waitFor(() => expect(uebernehmen).toHaveBeenCalledTimes(1));
    const [vorgang, posten] = uebernehmen.mock.calls[0] as [string, unknown[]];
    expect(vorgang).toMatch(/^[0-9a-f-]{36}$/);
    expect(posten).toEqual([
      { materialId: 'a', menge: 15, lieferantId: 's1', erwartet: 10 },
      { materialId: 'b', menge: 3, lieferantId: null, erwartet: 3 },
    ]);
    expect(await screen.findByText('2 Vorschläge auf die Einkaufsliste übernommen')).toBeInTheDocument();
    expect(neu).toHaveBeenCalled();
  });

  it('sagt, was inzwischen nicht mehr stimmte', async () => {
    uebernehmen.mockResolvedValueOnce({ angelegt: 1, uebersprungen: ['Muffe'], veraltet: ['Bogen 90°'] });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: '3 Vorschläge übernehmen' }));
    expect(await screen.findByText(/Nicht übernommen, weil sich der Stand inzwischen geändert hat: Muffe, Bogen 90°/)).toBeInTheDocument();
  });

  it('in Stück nur ganze — sonst kein Übernehmen', async () => {
    zeige();
    const zeile = (await screen.findByRole('checkbox', { name: 'Muffe übernehmen' })).closest('li')!;
    const menge = within(zeile).getByRole('textbox', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '2,5');
    expect(within(zeile).getByText(/ganze Stück/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 Vorschläge übernehmen' })).toBeDisabled();
  });

  it('nichts vorzuschlagen: ein Satz, kein Knopf', async () => {
    liste = [];
    zeige();
    expect(await screen.findByText(/Nichts vorzuschlagen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /übernehmen/ })).toBeNull();
  });
});

describe('Bausteine', () => {
  it('Gruppen und Grund', () => {
    expect(vorschlagGruppen(liste).map((g) => g.name)).toEqual(['Bacher', 'Frauenthal', 'Ohne Großhändler']);
    expect(vorschlagGrundText(V({ materialId: 'x', name: 'X', zulauf: 4 }))).toBe('Frei 2 Stk, Mindestmenge 5 Stk · 4 Stk schon auf der Einkaufsliste');
  });

  it('Sollbestand nie unter der Mindestmenge, Verpackungseinheit in Stück ganz — wie die Datenbank', () => {
    const f = { lagerartikel: true, mindestmenge: '5', sollbestand: '', verpackungseinheit: '', unit: 'Stk' };
    expect(bestellFehler(f)).toBeNull();
    expect(bestellFehler({ ...f, sollbestand: '4' })).toMatch(/unter der Mindestmenge/);
    expect(bestellFehler({ ...f, sollbestand: '5' })).toBeNull();
    expect(bestellFehler({ ...f, verpackungseinheit: '2,5' })).toMatch(/ganze Stück/);
    expect(bestellFehler({ ...f, verpackungseinheit: '2,5', unit: 'm' })).toBeNull();
    expect(bestellFehler({ ...f, verpackungseinheit: '0' })).toMatch(/größer als null/);
  });
});
