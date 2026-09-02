import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import StockView from '@/features/orders/StockView';

/**
 * Lager — der dritte Schritt des Materialablaufs.
 *
 * DIE ZAHL, DIE HIER ZÄHLT, IST „FREI", nicht der Lagerstand. Zwanzig Stück
 * im Regal, von denen achtzehn drei Monteuren bereits zugesagt sind, sind
 * keine zwanzig verfügbaren Stück. Wer sich auf den Lagerstand verlässt,
 * sagt Material zu, das schon vergeben ist — und der vierte Monteur steht
 * am Freitag vor einem leeren Fach.
 */

function material(p: Partial<Material> & { id: string }): WithId<Material> {
  return {
    companyId: 'perl', name: 'Kupferrohr 15mm', category: 'Rohre', unit: 'm', stock: 20,
    ...p,
  } as WithId<Material>;
}

function anforderung(p: Partial<MaterialOrder> & { id: string }): WithId<MaterialOrder> {
  return {
    companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 1, status: 'Offen',
    transactionType: 'order', userId: 'u1', userName: 'Max',
    ...p,
  } as unknown as WithId<MaterialOrder>;
}

let materialien: WithId<Material>[] = [];
let anforderungen: WithId<MaterialOrder>[] = [];
let katalogFehler: string | null = null;
let anforderungsFehler = false;

const bestandAendern = vi.fn();

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  subscribeMaterials: (
    _c: string,
    cb: (rows: WithId<Material>[]) => void,
    onError: (e: Error) => void,
  ) => {
    if (katalogFehler) onError(new Error(katalogFehler));
    else cb(materialien);
    return () => undefined;
  },
  adjustStock: (...a: unknown[]) => bestandAendern(...a),
}));

vi.mock('@/lib/db/materialOrders', () => ({
  subscribeAllOrders: (
    _c: string,
    _max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    if (anforderungsFehler) onError(new Error('nicht lesbar'));
    else cb(anforderungen);
    return () => undefined;
  },
}));

// Der Katalogreiter hat einen eigenen Test; hier steht er nur im Weg.
vi.mock('@/features/orders/MaterialCatalog', () => ({
  default: () => <div>Katalogpflege</div>,
}));

const authWert = {
  user: { uid: 'v1', companyId: 'perl', name: 'Verwaltung', role: 'Verwaltung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <StockView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  materialien = [];
  anforderungen = [];
  katalogFehler = null;
  anforderungsFehler = false;
  bestandAendern.mockReset();
  bestandAendern.mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe('Lager — was ist wirklich frei?', () => {
  it('zieht offene Anforderungen vom Lagerstand ab', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [
      anforderung({ id: 'o1', materialId: 'm1', quantity: 8 }),
      anforderung({ id: 'o2', materialId: 'm1', quantity: 10, status: 'Abholbereit' }),
    ];
    zeige();

    expect(await screen.findByText('2 m frei')).toBeInTheDocument();
    expect(screen.getByText('20 im Lager, 18 reserviert')).toBeInTheDocument();
  });

  it('zählt Erledigtes und Retouren NICHT als reserviert', async () => {
    // Erledigtes ist bereits vom Bestand abgezogen — noch einmal als
    // Reservierung gerechnet, zählte es doppelt und das Lager sähe leerer
    // aus, als es ist.
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [
      anforderung({ id: 'o1', materialId: 'm1', quantity: 5, status: 'Erledigt' }),
      anforderung({ id: 'o2', materialId: 'm1', quantity: 7, transactionType: 'return' }),
      anforderung({ id: 'o3', materialId: 'm1', quantity: 3 }),
    ];
    zeige();

    expect(await screen.findByText('17 m frei')).toBeInTheDocument();
  });

  it('erkennt eine Anforderung ohne Verweis über den Namen', async () => {
    /**
     * Nicht jede Anforderung trägt eine `materialId` — der Altbestand kennt
     * Positionen ohne Verweis, und auch eine per Sprache erfasste Zeile kann
     * sie verlieren. Ohne diesen Rückfall zählte die Reservierung
     * stillschweigend zu niedrig, und eine falsche Zahl im Lager ist
     * schlimmer als gar keine.
     */
    materialien = [material({ id: 'm1', name: 'Kupferrohr 15mm', stock: 20 })];
    anforderungen = [
      anforderung({ id: 'o1', materialId: undefined, materialName: ' kupferrohr 15MM ', quantity: 6 }),
    ];
    zeige();

    expect(await screen.findByText('14 m frei')).toBeInTheDocument();
  });

  it('stellt das Knappe an den Anfang', async () => {
    // Wer das Lager öffnet, will wissen, was fehlt — nicht alphabetisch
    // blättern.
    // Die Namen laufen der Knappheit ABSICHTLICH entgegen: alphabetisch käme
    // „Abflussrohr" zuerst. Nur so zeigt der Test, dass nach dem freien
    // Bestand sortiert wird und nicht nach dem Namen.
    materialien = [
      material({ id: 'm1', name: 'Abflussrohr', stock: 50 }),
      material({ id: 'm2', name: 'Zargenschraube', stock: 1 }),
    ];
    zeige();

    const zeilen = await screen.findAllByRole('listitem');
    expect(within(zeilen[0]).getByText('Zargenschraube')).toBeInTheDocument();
    expect(within(zeilen[1]).getByText('Abflussrohr')).toBeInTheDocument();
  });

  it('zählt als knapp, was durch Reservierungen knapp GEWORDEN ist', async () => {
    /**
     * Der Kern der Ansicht: die Warnung hängt am freien Bestand, nicht am
     * Lagerstand. 20 Stück, von denen 18 vergeben sind, sind knapp — auch
     * wenn das Regal voll aussieht.
     */
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1', quantity: 18 })];
    zeige();

    // Die Kennzahl „Knapp" steht auf 1 — und die Zeile zeigt 2 m frei.
    const kachel = (await screen.findByText('Knapp')).parentElement!;
    expect(within(kachel).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2 m frei')).toBeInTheDocument();
  });
});

describe('Lager — Wareneingang', () => {
  it('bucht die eingegebene Menge auf', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.spyOn(window, 'prompt').mockReturnValue('12');
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith('m1', 12));
  });

  it('weist eine negative Menge ab, statt den Bestand zu senken', async () => {
    // Ohne diese Prüfung ginge sie als `increment(-n)` durch: ein
    // Wareneingang, der das Lager leert.
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.spyOn(window, 'prompt').mockReturnValue('-5');
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    expect(await screen.findByText(/ganze Menge von mindestens 1/)).toBeInTheDocument();
    expect(bestandAendern).not.toHaveBeenCalled();
  });

  it('weist eine krumme Menge ab', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.spyOn(window, 'prompt').mockReturnValue('Kiste');
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    expect(await screen.findByText(/ganze Menge von mindestens 1/)).toBeInTheDocument();
    expect(bestandAendern).not.toHaveBeenCalled();
  });

  it('bucht nichts, wenn der Dialog abgebrochen wird', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    expect(bestandAendern).not.toHaveBeenCalled();
    expect(screen.queryByText(/ganze Menge von mindestens 1/)).not.toBeInTheDocument();
  });
});

describe('Lager — wenn ein Ladevorgang scheitert', () => {
  it('nennt die fehlenden Anforderungen, statt „nichts reserviert" zu zeigen', async () => {
    /**
     * Der Fehlerweg war einmal `() => undefined`. Scheiterte die Abfrage,
     * blieb die Liste leer und die Ansicht meldete null Reservierungen — die
     * Zahl war falsch, sah aber vollkommen normal aus.
     */
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungsFehler = true;
    zeige();

    expect(await screen.findByText(/Die Anforderungen/)).toBeInTheDocument();
    // Der Bestand steht trotzdem — nur eben ohne Reservierungen.
    expect(screen.getByText('Kupferrohr 15mm')).toBeInTheDocument();
  });

  it('zeigt den Fehler des Katalogs selbst', async () => {
    katalogFehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
  });

  it('unterscheidet einen leeren Katalog von einer erfolglosen Suche', async () => {
    materialien = [material({ id: 'm1' })];
    zeige();

    await userEvent.type(await screen.findByRole('textbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Kein Material passt zu/)).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: /Suche/ }));
    materialien = [];
    // Der leere Katalog verweist auf den Reiter, der ihn füllt.
    zeige();
    expect(await screen.findAllByText(/Noch kein Material im Katalog/)).not.toHaveLength(0);
  });
});
