import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import OffeneLieferantenartikel from '@/features/materials/OffeneLieferantenartikel';
import type { OffenerLieferantenartikel } from '@/lib/db/lieferantenartikel';

/**
 * Offene Lieferantenartikel (M03a, E01) — was ein Katalog nicht selbst
 * zuordnen durfte. Geprüft wird: seitenweise und gesucht vom Server, die
 * Vorschläge mit ihrem Grund, „Zuordnen zu …“ über die Artikelsuche und „Als
 * neuen Artikel“ erst nach der Rückfrage. GEGENPROBE: ohne die Ansicht gibt es
 * keinen Weg, einen offenen Lieferantenartikel zuzuordnen.
 */

const liste = vi.fn();
const zuordnen = vi.fn();
const alsNeu = vi.fn();
const suche = vi.fn();
vi.mock('@/lib/db/lieferantenartikel', () => ({
  offeneLieferantenartikel: (...a: unknown[]) => liste(...a),
  zuordnen: (...a: unknown[]) => zuordnen(...a),
  alsNeuerArtikel: (...a: unknown[]) => alsNeu(...a),
}));
vi.mock('@/lib/db/materials', () => ({ sucheKatalog: (...a: unknown[]) => suche(...a) }));
const authWert = { user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const } };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const offen = (n: number, rest: Partial<OffenerLieferantenartikel> = {}): OffenerLieferantenartikel => ({
  id: `la${n}`, supplierId: 'beta', lieferant: 'Beta Großhandel', lieferantenNr: `B-${n}`, bezeichnung: `Rohr ${n}`,
  einheit: 'Stk', ean: null, zuordnung: null, bestaetigtVon: null, bestaetigtAm: null, vorschlaege: [], ...rest,
});

function zeige() {
  render(
    <ToastProvider>
      <OffeneLieferantenartikel />
    </ToastProvider>,
  );
}

beforeEach(() => {
  liste.mockReset();
  zuordnen.mockReset().mockResolvedValue(undefined);
  alsNeu.mockReset().mockResolvedValue('neu');
  suche.mockReset().mockResolvedValue([]);
});

describe('Die Liste', () => {
  it('seitenweise vom Server — „und N weitere“ holt die nächste Seite', async () => {
    liste
      .mockResolvedValueOnce({ gesamt: 21, zeilen: Array.from({ length: 20 }, (_, i) => offen(i)) })
      .mockResolvedValueOnce({ gesamt: 21, zeilen: [offen(20)] });
    zeige();
    expect(await screen.findByText('Offene Lieferantenartikel (21)')).toBeInTheDocument();
    expect(liste).toHaveBeenCalledWith('', 0, 20);
    await userEvent.click(screen.getByRole('button', { name: 'und 1 weitere anzeigen' }));
    expect(await screen.findByText('Rohr 20')).toBeInTheDocument();
    expect(liste).toHaveBeenLastCalledWith('', 20, 20);
  });

  it('sucht auf dem Server', async () => {
    liste.mockResolvedValue({ gesamt: 0, zeilen: [] });
    zeige();
    await screen.findByText('Nichts offen');
    await userEvent.type(screen.getByRole('searchbox'), 'rohr');
    await waitFor(() => expect(liste).toHaveBeenLastCalledWith('rohr', 0, 20));
  });

  it('kennzeichnet einen von Hand gelösten und zählt die Vorschläge', async () => {
    liste.mockResolvedValue({
      gesamt: 1,
      zeilen: [offen(1, { zuordnung: 'geloest', vorschlaege: [{ materialId: 'm1', name: 'Rohr Alpha', articleNumber: 'B-1', grund: 'nummer' }] })],
    });
    zeige();
    const zeile = (await screen.findByText('Rohr 1')).closest('li')!;
    expect(within(zeile).getByText('gelöst')).toBeInTheDocument();
    expect(within(zeile).getByText('1 Vorschlag')).toBeInTheDocument();
  });
});

describe('Zuordnen', () => {
  beforeEach(() => {
    liste.mockResolvedValue({
      gesamt: 2,
      zeilen: [
        offen(1, { vorschlaege: [{ materialId: 'm1', name: 'Rohr Alpha', articleNumber: 'B-1', grund: 'nummer' }] }),
        offen(2),
      ],
    });
  });

  it('zu einem Vorschlag — die Zeile verschwindet, die Zahl sinkt', async () => {
    zeige();
    await userEvent.click(within((await screen.findByText('Rohr 1')).closest('li')!).getAllByRole('button')[0]);
    const fenster = await screen.findByRole('dialog');
    expect(within(fenster).getByText(/gleiche Nummer/)).toBeInTheDocument();
    await userEvent.click(within(fenster).getByRole('button', { name: 'Zuordnen' }));
    await waitFor(() => expect(zuordnen).toHaveBeenCalledWith('la1', 'm1'));
    expect(await screen.findByText('Offene Lieferantenartikel (1)')).toBeInTheDocument();
    expect(screen.queryByText('Rohr 1')).toBeNull();
  });

  it('zu einem gesuchten Artikel', async () => {
    suche.mockResolvedValue([{ id: 'm9', companyId: 'perl', name: 'Kupferrohr 15', articleNumber: 'K-15', unit: 'm', stock: 0 }]);
    zeige();
    await userEvent.click(within((await screen.findByText('Rohr 2')).closest('li')!).getAllByRole('button')[0]);
    const fenster = await screen.findByRole('dialog');
    await userEvent.type(within(fenster).getByLabelText('Artikel im Katalog suchen'), 'kupfer');
    const treffer = (await within(fenster).findByText('Kupferrohr 15')).closest('li')!;
    await userEvent.click(within(treffer).getByRole('button', { name: 'Zuordnen' }));
    await waitFor(() => expect(zuordnen).toHaveBeenCalledWith('la2', 'm9'));
  });

  it('als neuen Artikel erst nach der Rückfrage', async () => {
    zeige();
    await userEvent.click(within((await screen.findByText('Rohr 2')).closest('li')!).getAllByRole('button')[0]);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Als neuen Artikel …' }));
    expect(alsNeu).not.toHaveBeenCalled();
    const frage = await screen.findByRole('dialog', { name: /Als neuen Artikel anlegen/ });
    await userEvent.click(within(frage).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(alsNeu).toHaveBeenCalledWith('la2'));
  });
});
