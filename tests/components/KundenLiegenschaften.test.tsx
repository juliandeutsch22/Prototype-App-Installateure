import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop } from '@/types';

/**
 * „LIEGENSCHAFTEN“ IN DER KUNDENAKTE (M02c): woran der Kunde beteiligt ist,
 * mit Liegenschaft, Top, Rolle und Zeitraum — jede Zeile führt in die Akte
 * der Liegenschaft. Die Akte zeigt die Karte nur mit der Unterfähigkeit
 * (`KundenakteLiegenschaften` unten).
 *
 * Gegenprobe: ohne `KundenLiegenschaften.tsx` gibt es nichts zu zeigen — rot.
 */
const L1: Liegenschaft = { id: 'l1', companyId: 'perl', bezeichnung: 'WHA Hauptstraße 12', aktiv: true };
const L2: Liegenschaft = { id: 'l2', companyId: 'perl', bezeichnung: 'Reihenhaus Au', aktiv: true };
const T: LiegenschaftTop[] = [{ id: 't5', companyId: 'perl', liegenschaftId: 'l2', bezeichnung: 'Top 5', aktiv: true }];
const B: LiegenschaftBeteiligter[] = [
  { id: 'b1', companyId: 'perl', liegenschaftId: 'l1', rolle: 'hausverwaltung', customerId: 'k1' },
  { id: 'b2', companyId: 'perl', liegenschaftId: 'l2', topId: 't5', rolle: 'eigentuemer', customerId: 'k1', gueltigAb: '2026-03-01' },
];
const listTops = vi.fn(async () => T);
vi.mock('@/lib/db/liegenschaften', () => ({
  listBeteiligungenDesKunden: vi.fn(async () => B),
  listLiegenschaftenByIds: vi.fn(async () => [L1, L2]),
  listTops: (...a: unknown[]) => listTops(...(a as [])),
}));

const { default: KundenLiegenschaften } = await import('@/features/liegenschaften/KundenLiegenschaften');

describe('Die Beteiligungen eines Kunden', () => {
  it('Liegenschaft, Top, Rolle und Zeitraum — mit Weg in die Akte der Liegenschaft', async () => {
    render(<MemoryRouter><KundenLiegenschaften companyId="perl" customerId="k1" /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'WHA Hauptstraße 12' })).toHaveAttribute('href', '/liegenschaften/l1');
    expect(screen.getByRole('link', { name: 'Reihenhaus Au · Top 5' })).toHaveAttribute('href', '/liegenschaften/l2');
    expect(screen.getByText('Hausverwaltung')).toBeInTheDocument();
    expect(screen.getByText('Eigentümer · seit 01.03.2026')).toBeInTheDocument();
    // Die Tops nur der Liegenschaft, an deren Top er beteiligt ist.
    expect(listTops).toHaveBeenCalledTimes(1);
    expect(listTops).toHaveBeenCalledWith('perl', 'l2');
  });
});
