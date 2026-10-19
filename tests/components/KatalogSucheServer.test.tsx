import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Material, RuestPosition } from '@/types';
import type { WithId } from '@/lib/db/core';

/**
 * Schein und Rüstliste suchen im ganzen Katalog auf dem Server (19.10.2026).
 *
 * Bis hierher suchten beide nur in den geladenen Artikeln, und die enden bei
 * tausend: nach einem DATANORM-Import fand der Monteur einen Artikel dahinter
 * nicht, schrieb ihn als freie Zeile, und auf der Rechnung stand er ohne
 * Preis. Die geladenen Artikel bleiben die Reserve, wenn der Server nicht
 * antwortet — was ohne Netz ging, geht weiter.
 */

const artikel = (p: Partial<Material> & { id: string }): WithId<Material> =>
  ({ companyId: 'perl', name: 'Eckventil', stock: 5, unit: 'Stk', ...p }) as WithId<Material>;

let aufDemServer: WithId<Material>[] = [];
let ohneNetz = false;
const sucheKatalog = vi.fn(async (_c: string, begriff: string) => {
  if (ohneNetz) throw new Error('Failed to fetch');
  const q = begriff.toLowerCase();
  return aufDemServer.filter((m) => m.name.toLowerCase().includes(q));
});
const katalogNachIds = vi.fn(async (_c: string, ids: readonly string[]) => aufDemServer.filter((m) => ids.includes(m.id)));
vi.mock('@/lib/db/materials', () => ({
  sucheKatalog: (...a: [string, string]) => sucheKatalog(...a),
  katalogNachIds: (...a: [string, readonly string[]]) => katalogNachIds(...a),
}));

const { default: MaterialErfassen } = await import('@/features/worksheets/MaterialErfassen');
const { default: RuestlistePlanen } = await import('@/features/assignments/RuestlistePlanen');

// Hinter den ersten tausend Artikeln: nicht unter den geladenen.
const FERN = artikel({ id: 'fern', name: 'Pressfitting 22 verzinkt', unit: 'Stk', stock: 12, lagerartikel: true });

beforeEach(() => {
  aufDemServer = [FERN, artikel({ id: 'alt', name: 'Pressfitting 22 alt', ausgelaufen: true })];
  ohneNetz = false;
  sucheKatalog.mockClear();
  katalogNachIds.mockClear();
});

describe('Material am Schein', () => {
  it('findet einen Artikel, der nicht unter den geladenen steht, und übernimmt ihn', async () => {
    const onChange = vi.fn();
    render(<MaterialErfassen companyId="perl" materials={[artikel({ id: 'm1' })]} zeilen={[]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Pressfitting');
    await userEvent.click(await screen.findByRole('button', { name: 'Pressfitting 22 verzinkt auf den Schein' }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'Pressfitting 22 verzinkt', einheit: 'Stk', menge: 1 })]);
    expect(sucheKatalog).toHaveBeenLastCalledWith('perl', 'Pressfitting', 20);
    // Ausgelaufen bleibt draussen, auch vom Server.
    expect(screen.queryByText('Pressfitting 22 alt')).toBeNull();
  });

  it('ohne Verbindung sucht es in den geladenen Artikeln und sagt es', async () => {
    ohneNetz = true;
    render(<MaterialErfassen companyId="perl" materials={[artikel({ id: 'm1', name: 'Eckventil 1/2' })]} zeilen={[]} onChange={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Eckventil');
    expect(await screen.findByText(/Keine Verbindung zum Katalog/)).toBeInTheDocument();
    expect(screen.getByText('Eckventil 1/2')).toBeInTheDocument();
  });

  it('Gegenprobe: mit Verbindung kein Hinweis, und „Sucht im Katalog …“ statt „kein Artikel“, solange die Antwort fehlt', async () => {
    let freigeben: () => void = () => undefined;
    sucheKatalog.mockImplementationOnce(() => new Promise((fertig) => { freigeben = () => fertig([FERN]); }));
    render(<MaterialErfassen companyId="perl" materials={[]} zeilen={[]} onChange={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'P');
    expect(await screen.findByText('Sucht im Katalog …')).toBeInTheDocument();
    expect(screen.queryByText(/Kein Artikel passt/)).toBeNull();
    await waitFor(() => expect(sucheKatalog).toHaveBeenCalled());
    expect(screen.getByText('Sucht im Katalog …')).toBeInTheDocument();
    freigeben();
    expect(await screen.findByText('Pressfitting 22 verzinkt')).toBeInTheDocument();
    expect(screen.queryByText(/Keine Verbindung zum Katalog/)).toBeNull();
  });
});

describe('Rüstliste am Einsatz', () => {
  it('nimmt einen Artikel vom Server auf und zeigt seinen Lagerstand', async () => {
    let positionen: RuestPosition[] = [];
    const { rerender } = render(
      <RuestlistePlanen companyId="perl" materials={[]} positionen={positionen} onChange={(p) => { positionen = p; }} />,
    );
    await userEvent.type(screen.getByLabelText('Artikel aus dem Lager'), 'Pressfitting');
    await userEvent.click(await screen.findByRole('button', { name: 'Pressfitting 22 verzinkt auf die Rüstliste' }));
    expect(positionen).toEqual([expect.objectContaining({ materialId: 'fern', name: 'Pressfitting 22 verzinkt' })]);
    rerender(<RuestlistePlanen companyId="perl" materials={[]} positionen={positionen} onChange={(p) => { positionen = p; }} />);
    expect(await screen.findByText(/Lager:/)).toHaveTextContent('Lager: 12');
  });

  it('eine gespeicherte Zeile mit einem Artikel ausserhalb der geladenen holt ihn nach — samt Fehlmenge', async () => {
    const zeile: RuestPosition = { id: 'p1', materialId: 'fern', name: 'Pressfitting 22 verzinkt', menge: 20, einheit: 'Stk' };
    render(<RuestlistePlanen companyId="perl" materials={[]} positionen={[zeile]} onChange={() => undefined} />);
    expect(await screen.findByText(/Im Lager fehlen/)).toHaveTextContent('Im Lager fehlen 8');
    expect(katalogNachIds).toHaveBeenCalledWith('perl', ['fern']);
  });

  it('Gegenprobe: steht der Artikel unter den geladenen, wird nichts nachgeholt', async () => {
    const zeile: RuestPosition = { id: 'p1', materialId: 'fern', name: 'Pressfitting 22 verzinkt', menge: 2, einheit: 'Stk' };
    render(<RuestlistePlanen companyId="perl" materials={[FERN]} positionen={[zeile]} onChange={() => undefined} />);
    expect(await screen.findByText(/Lager:/)).toBeInTheDocument();
    expect(katalogNachIds).not.toHaveBeenCalled();
  });
});
