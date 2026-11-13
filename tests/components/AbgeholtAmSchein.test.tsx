import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import type { MaterialZeile } from '@/features/worksheets/materialZeilen';

/**
 * „FÜR DIESE BAUSTELLE ABGEHOLT“ AM SCHEIN (C2, E89).
 *
 * Die Vorausfüllung bleibt abgeschafft — der Kunde unterschreibt, was verbaut
 * wurde. Die eigenen Abholungen stehen nur als Vorschlag da; erst ein Tipp
 * übernimmt eine Zeile.
 */

const artikel = (p: Partial<Material> & { id: string }): WithId<Material> =>
  ({ companyId: 'perl', name: 'Eckventil', stock: 5, unit: 'Stk', ...p }) as WithId<Material>;
const ROHR = artikel({ id: 'm1', name: 'Kupferrohr 15mm', unit: 'm' });
const FERN = artikel({ id: 'm7', name: 'Pressfitting 22', unit: 'Stk' });

const abgeholt = (p: Partial<MaterialOrder>) =>
  ({ id: `o-${Math.random()}`, companyId: 'perl', materialId: 'm1', materialName: 'Kupferrohr 15mm', quantity: 6,
    status: 'Erledigt', transactionType: 'order', userId: 'u1', projectNumber: '2026-042',
    erledigtAm: new Date(2026, 10, 12, 9).getTime(), ...p }) as WithId<MaterialOrder>;

let antwort: WithId<MaterialOrder>[] = [];
let fehler = false;
const eigeneAbgeholt = vi.fn(async (..._a: unknown[]) => {
  if (fehler) throw new Error('Failed to fetch');
  return antwort;
});
vi.mock('@/lib/db/materialOrders', () => ({ eigeneAbgeholt: (...a: unknown[]) => eigeneAbgeholt(...a) }));
vi.mock('@/lib/db/materials', () => ({
  sucheKatalog: async () => [],
  katalogNachIds: async (_c: string, ids: readonly string[]) => [FERN].filter((m) => ids.includes(m.id)),
}));

const { default: MaterialErfassen } = await import('@/features/worksheets/MaterialErfassen');

function Schein({ start = [], projectNumber = '2026-042' }: { start?: MaterialZeile[]; projectNumber?: string }) {
  const [zeilen, setZeilen] = useState<MaterialZeile[]>(start);
  return (
    <>
      <MaterialErfassen companyId="perl" materials={[ROHR]} zeilen={zeilen} onChange={setZeilen}
        uid="u1" projectNumber={projectNumber} datum="2026-11-13" />
      <output aria-label="Zeilen">{zeilen.map((z) => `${z.menge}×${z.name}${z.einheit ? ` ${z.einheit}` : ''}`).join(' | ')}</output>
    </>
  );
}
const zeilen = () => screen.getByLabelText('Zeilen').textContent;
const block = async () =>
  (await screen.findByText('Für diese Baustelle abgeholt')).parentElement as HTMLElement;

beforeEach(() => {
  antwort = [];
  fehler = false;
  eigeneAbgeholt.mockClear();
});

describe('Für diese Baustelle abgeholt (C2, E89)', () => {
  it('fragt die eigenen Abholungen dieser Baustelle der zwei Wochen bis zum Scheintag', async () => {
    render(<Schein />);
    await waitFor(() => expect(eigeneAbgeholt).toHaveBeenCalledTimes(1));
    const [c, uid, nr, ab, bis] = eigeneAbgeholt.mock.calls[0];
    expect([c, uid, nr]).toEqual(['perl', 'u1', '2026-042']);
    expect(new Date(ab as string).getTime()).toBe(new Date(2026, 9, 31, 0, 0, 0, 0).getTime());
    expect(new Date(bis as string).getTime()).toBe(new Date(2026, 10, 13, 23, 59, 59, 999).getTime());
  });

  it('nichts kommt von selbst auf den Schein — ein Tipp übernimmt die Zeile mit der abgeholten Menge', async () => {
    antwort = [
      abgeholt({}),
      abgeholt({ quantity: 4, erledigtAm: new Date(2026, 10, 10, 9).getTime() }),
      abgeholt({ materialId: 'm7', materialName: 'Pressfitting 22', quantity: 3, abgeholtHerkunft: 'haendler',
        erledigtAm: new Date(2026, 10, 13, 7).getTime() }),
    ];
    render(<Schein />);
    const b = within(await block());
    // Je Artikel eine Zeile, zusammengezählt; der zuletzt abgeholte zuerst.
    const z = b.getAllByRole('listitem').map((x) => x.textContent ?? '');
    expect(z).toHaveLength(2);
    expect(z[0]).toMatch(/Pressfitting 22.*3 Stk abgeholt.*13\.11\.2026.*beim Händler mitgenommen/);
    expect(z[1]).toMatch(/Kupferrohr 15mm.*10 m abgeholt.*zuletzt 12\.11\.2026/);
    expect(zeilen()).toBe('');
    await userEvent.click(b.getByRole('button', { name: 'Kupferrohr 15mm auf den Schein' }));
    expect(zeilen()).toBe('10×Kupferrohr 15mm m');
    // Übernommen heißt: aus den Vorschlägen weg — ein zweiter Tipp verdoppelte sonst still.
    expect(screen.queryByRole('button', { name: 'Kupferrohr 15mm auf den Schein' })).toBeNull();
  });

  it('frei angeforderte Ware geht als freie Zeile; was schon auf dem Schein steht, steht nicht da', async () => {
    antwort = [abgeholt({ materialId: null, materialName: 'Eckventil 1/2 Zoll', quantity: 2 }), abgeholt({})];
    render(<Schein start={[{ id: 'z1', name: 'Kupferrohr 15mm', menge: 3, einheit: 'm', materialId: 'm1' }]} />);
    const b = within(await block());
    expect(b.queryByText('Kupferrohr 15mm')).toBeNull();
    await userEvent.click(b.getByRole('button', { name: 'Eckventil 1/2 Zoll auf den Schein' }));
    expect(zeilen()).toBe('3×Kupferrohr 15mm m | 2×Eckventil 1/2 Zoll');
    // Alles übernommen — der Block verschwindet.
    expect(screen.queryByText('Für diese Baustelle abgeholt')).toBeNull();
  });

  it('Gegenprobe: ohne Baustelle wird nichts gefragt und nichts vorgeschlagen', async () => {
    antwort = [abgeholt({})];
    render(<Schein projectNumber="" />);
    await screen.findByLabelText('Artikel aus dem Lager');
    expect(eigeneAbgeholt).not.toHaveBeenCalled();
    expect(screen.queryByText('Für diese Baustelle abgeholt')).toBeNull();
  });

  it('lässt es sich nicht laden, sagt es das — die Suche bleibt', async () => {
    fehler = true;
    render(<Schein />);
    expect(await screen.findByText(/ließ sich gerade nicht laden/)).toBeInTheDocument();
    expect(screen.getByLabelText('Artikel aus dem Lager')).toBeEnabled();
  });
});

describe('Ein Tipp legt hinein, auch am Schein (C1, E89)', () => {
  it('derselbe Artikel ein zweites Mal aus der Suche: eines mehr, keine zweite Zeile', async () => {
    const { default: Erfassen } = await import('@/features/worksheets/MaterialErfassen');
    const onChange = vi.fn();
    render(<Erfassen companyId="perl" materials={[ROHR]}
      zeilen={[{ id: 'z1', name: 'Kupferrohr 15mm', menge: 2, einheit: 'm', materialId: 'm1' }]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Kupfer');
    const knopf = await screen.findByRole('button', { name: 'Kupferrohr 15mm auf den Schein' });
    expect(knopf).toHaveClass('symbol-rund');
    await userEvent.click(knopf);
    expect(onChange).toHaveBeenCalledWith([{ id: 'z1', name: 'Kupferrohr 15mm', menge: 3, einheit: 'm', materialId: 'm1' }]);
  });
});
