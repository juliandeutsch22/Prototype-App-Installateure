import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Lagerbestand, Lagerort, Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import StockView from '@/features/orders/StockView';

/**
 * DAS LAGER JE ORT (SHK-Ausbau M04a, E10) — Ansicht.
 *
 *  - Mit weiteren Orten: eine Wahl „Ort“; ein weiterer Ort zeigt, was dort
 *    liegt, ohne Reservierung. Das Hauptlager bleibt die bisherige Ansicht.
 *  - Das Artikelblatt zeigt den Bestand je Ort.
 *  - Umlagern schickt den Befehl mit Artikel, Orten, Menge, Einheit und dem
 *    Bestand am Quellort, den die Ansicht sah; „veraltet“ sagt es und holt neu.
 *  - Inventur am Ort zählt dort.
 *  - Modul aus: keine Wahl, kein „Lagerorte …“, kein Bestand je Ort — und es
 *    wird nichts von den Orten geholt.
 *
 * Gegenprobe: ohne die Änderung in `StockView.tsx` sind alle Fälle außer
 * „Modul aus“ rot (es gäbe weder Wahl noch Dialog); „Modul aus“ ist die
 * Erhaltung und ist vorher wie nachher grün.
 */

function material(p: Partial<Material> & { id: string }): WithId<Material> {
  return { companyId: 'perl', name: 'Kupferrohr 15mm', category: 'Rohre', unit: 'm', stock: 20, ...p } as WithId<Material>;
}

const HAUPT: Lagerort = { id: 'haupt', companyId: 'perl', art: 'haupt', bezeichnung: 'Hauptlager', aktiv: true };
const BUS: Lagerort = { id: 'ort-bus', companyId: 'perl', art: 'fahrzeug', bezeichnung: 'W-123A', fahrzeugId: 'f1', aktiv: true };
const AUSSEN: Lagerort = { id: 'ort-aussen', companyId: 'perl', art: 'lager', bezeichnung: 'Außenlager Liesing', aktiv: true };

let materialien: WithId<Material>[] = [];
let orte: Lagerort[] = [];
let amOrt: Record<string, Lagerbestand[]> = {};

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  subscribeLagerartikel: (_c: string, cb: (rows: WithId<Material>[]) => void) => {
    cb(materialien);
    return () => undefined;
  },
  katalogAnzahl: async () => materialien.length,
  katalogBeobachten: () => () => undefined,
  lagerEingang: vi.fn(),
  lagerInventur: (...a: unknown[]) => inventur(...a),
  listLagerbewegungen: async () => [],
  lagerFrei: async () => { throw new Error('nicht geladen'); },
}));
const inventur = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 0);
vi.mock('@/lib/db/einkauf', () => ({ listGrosshaendler: vi.fn(async () => []) }));
vi.mock('@/lib/db/materialOrders', () => ({
  subscribeAllOrders: (_c: string, _m: number, cb: (rows: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  },
}));

const umlagern = vi.fn();
const listLagerorte = vi.fn(async () => orte);
const bestandDesArtikels = vi.fn(async (_c: string, id: string) =>
  Object.values(amOrt).flat().filter((b) => b.materialId === id));
vi.mock('@/lib/db/lagerorte', () => ({
  listLagerorte: () => listLagerorte(),
  listFahrzeuge: async () => [],
  bestandAmOrt: async (_c: string, ort: string) => amOrt[ort] ?? [],
  bestandDesArtikels: (c: string, id: string) => bestandDesArtikels(c, id),
  bestandBeobachten: () => () => undefined,
  umlagern: (...a: unknown[]) => umlagern(...a),
  lagerortSpeichern: vi.fn(),
}));

vi.mock('@/features/orders/MaterialCatalog', () => ({ default: () => <div>Katalogpflege</div> }));

const AN = {
  user: { uid: 'v1', companyId: 'perl', name: 'Verwaltung', role: 'Verwaltung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
const AUS = {
  user: { uid: 'v1', companyId: 'perl', name: 'Verwaltung', role: 'Verwaltung' as const },
  company: { id: 'perl', name: 'Perl Installationen', modules: { 'material.lagerorte_fahrzeuglager': false } },
};
let authWert: typeof AN | typeof AUS = AN;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function Adresse() {
  const ort = useLocation();
  return <output data-testid="adresse">{ort.pathname + ort.search}</output>;
}

function zeige(adresse = '/lager') {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <ToastProvider>
        <StockView />
        <Adresse />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authWert = AN;
  materialien = [material({ id: 'm1', stock: 20 }), material({ id: 'm2', name: 'Eckventil', unit: 'Stk', stock: 4 })];
  orte = [HAUPT, BUS, AUSSEN];
  amOrt = {
    'ort-bus': [{ lagerortId: 'ort-bus', materialId: 'm1', companyId: 'perl', menge: 6, revision: 2 }],
  };
  umlagern.mockReset();
  inventur.mockClear();
  listLagerorte.mockClear();
  bestandDesArtikels.mockClear();
});

describe('Lager je Ort', () => {
  it('wählt einen Ort und zeigt, was dort liegt — die Wahl steht in der Adresse', async () => {
    zeige();
    const wahl = await screen.findByLabelText('Ort');
    expect(within(wahl).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Hauptlager', 'Außenlager Liesing', 'Fahrzeug W-123A',
    ]);
    await userEvent.selectOptions(wahl, 'ort-bus');
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?ort=ort-bus');
    const zeile = (await screen.findByRole('button', { name: 'Kupferrohr 15mm' })).closest('li') as HTMLElement;
    expect(within(zeile).getByText('6 m')).toBeInTheDocument();
    // Das Eckventil liegt dort nicht — und „frei/reserviert“ gibt es an einem weiteren Ort nicht.
    expect(screen.queryByText('Eckventil')).not.toBeInTheDocument();
    expect(screen.queryByText(/reserviert/)).not.toBeInTheDocument();
  });

  it('zeigt im Artikelblatt den Bestand je Ort', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    const fenster = await screen.findByRole('dialog', { name: 'Artikel' });
    const je = await within(fenster).findByText('Bestand je Ort');
    const liste = je.nextElementSibling as HTMLElement;
    await waitFor(() => expect(within(liste).getByText('Fahrzeug W-123A')).toBeInTheDocument());
    expect(within(liste).getByText('Hauptlager').nextElementSibling).toHaveTextContent('20 m');
    expect(within(liste).getByText('Fahrzeug W-123A').nextElementSibling).toHaveTextContent('6 m');
    // Das Außenlager hat nichts — es steht nicht da.
    expect(within(liste).queryByText('Außenlager Liesing')).not.toBeInTheDocument();
  });

  it('lagert um: Befehl mit Artikel, Orten, Menge, Einheit und dem gesehenen Bestand am Quellort', async () => {
    umlagern.mockResolvedValue({ art: 'ausgefuehrt', vorgang: 'v', bestandVon: 15, bestandNach: 11 });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    const fenster = await screen.findByRole('dialog', { name: 'Artikel' });
    await userEvent.click(within(fenster).getByRole('button', { name: 'Umlagern' }));
    const dialog = await screen.findByRole('dialog', { name: /^Umlagern: / });
    await userEvent.selectOptions(within(dialog).getByLabelText('Nach'), 'ort-bus');
    const menge = within(dialog).getByLabelText(/Menge/);
    await userEvent.clear(menge);
    await userEvent.type(menge, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Umlagern' }));
    await waitFor(() => expect(umlagern).toHaveBeenCalledTimes(1));
    expect(umlagern.mock.calls[0][0]).toEqual({
      artikelId: 'm1', vonId: null, nachId: 'ort-bus', menge: 5, einheit: 'm', erwartetVon: 20, grund: '',
    });
    expect(await screen.findByText(/5 m Kupferrohr 15mm umgelagert: Hauptlager → Fahrzeug W-123A/)).toBeInTheDocument();
  });

  it('veraltet: sagt die neue Zahl, bucht nichts und holt neu', async () => {
    umlagern.mockResolvedValue({ art: 'veraltet', vorgang: 'v', bestandVon: 3, einheit: 'm' });
    zeige('/lager?ort=ort-bus');
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    const fenster = await screen.findByRole('dialog', { name: 'Artikel' });
    await userEvent.click(within(fenster).getByRole('button', { name: 'Umlagern' }));
    const dialog = await screen.findByRole('dialog', { name: /^Umlagern: / });
    // Vorbelegt: Quelle ist der gewählte Ort, Ziel das Hauptlager.
    expect(within(dialog).getByLabelText('Von')).toHaveValue('ort-bus');
    expect(within(dialog).getByLabelText('Nach')).toHaveValue('');
    const vorher = bestandDesArtikels.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Umlagern' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Fahrzeug W-123A hat jetzt 3 m. Nichts wurde umgelagert');
    expect(umlagern.mock.calls[0][0]).toMatchObject({ vonId: 'ort-bus', nachId: null, erwartetVon: 6 });
    await waitFor(() => expect(bestandDesArtikels.mock.calls.length).toBeGreaterThan(vorher));
  });

  it('mehr als am Quellort liegt, schickt der Dialog gar nicht erst', async () => {
    zeige('/lager?ort=ort-bus');
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Artikel' })).getByRole('button', { name: 'Umlagern' }));
    const dialog = await screen.findByRole('dialog', { name: /^Umlagern: / });
    const menge = within(dialog).getByLabelText(/Menge/);
    await userEvent.clear(menge);
    await userEvent.type(menge, '7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Umlagern' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('dort liegen nur 6 m');
    expect(umlagern).not.toHaveBeenCalled();
  });

  it('zählt am gewählten Ort — mit dem Bestand dort als Vorgabe', async () => {
    zeige('/lager?ort=ort-bus');
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Artikel' })).getByRole('button', { name: 'Inventur' }));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    expect(within(dialog).getByLabelText('Wo gezählt')).toHaveValue('ort-bus');
    expect(within(dialog).getByLabelText(/Gezählter Bestand/)).toHaveValue('6');
    await userEvent.clear(within(dialog).getByLabelText(/Gezählter Bestand/));
    await userEvent.type(within(dialog).getByLabelText(/Gezählter Bestand/), '5');
    await userEvent.type(within(dialog).getByLabelText('Grund'), 'Zählung Bus');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestand buchen' }));
    await waitFor(() => expect(inventur).toHaveBeenCalledWith('m1', 5, 'Zählung Bus', 'ort-bus'));
  });

  it('Erhaltung: im Hauptlager zählt die Inventur mit demselben Aufruf wie bisher', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Artikel' })).getByRole('button', { name: 'Inventur' }));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    await userEvent.type(within(dialog).getByLabelText('Grund'), 'Inventur');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestand buchen' }));
    await waitFor(() => expect(inventur).toHaveBeenCalledTimes(1));
    expect(inventur.mock.calls[0]).toEqual(['m1', 20, 'Inventur']);
  });
});

describe('Modul aus: nur das Hauptlager', () => {
  it('keine Wahl, kein „Lagerorte …“, kein Bestand je Ort — und nichts von den Orten geholt', async () => {
    authWert = AUS;
    zeige('/lager?ort=ort-bus');
    expect(await screen.findByText('20 m frei')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ort')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Weitere Aktionen für Lager' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Inventur …']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Kupferrohr 15mm' }));
    const fenster = await screen.findByRole('dialog', { name: 'Artikel' });
    expect(within(fenster).queryByText('Bestand je Ort')).not.toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: 'Umlagern' })).not.toBeInTheDocument();
    expect(listLagerorte).not.toHaveBeenCalled();
    expect(bestandDesArtikels).not.toHaveBeenCalled();
  });
});
