import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import StockView from '@/features/orders/StockView';
import { listGrosshaendler } from '@/lib/db/einkauf';

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
  lagerEingang: (...a: unknown[]) => bestandAendern(...a),
  lagerInventur: (...a: unknown[]) => inventurBuchen(...a),
  listLagerbewegungen: (...a: unknown[]) => bewegungenLaden(...a),
  lagerFrei: () => lagerStand(),
}));
// Ohne eigene Vorgabe rechnet die Ansicht selbst — wie wenn die Zahlen ausbleiben.
const lagerStand = vi.fn<() => Promise<Map<string, unknown>>>(async () => { throw new Error('nicht geladen'); });
const inventurBuchen = vi.fn();
const bewegungenLaden = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock('@/lib/db/einkauf', () => ({
  listGrosshaendler: vi.fn(async () => [{ id: 'g1', name: 'Frauenthal', active: true }]),
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

/*
  STABILE OBJEKTE JE ROLLE, keine frischen Literale: gäbe der Mock bei jedem
  Aufruf ein neues Objekt zurück, liefe der Effekt, der an `user` hängt,
  endlos — der Testlauf hängt dann ohne Fehlermeldung.
*/
const VERWALTUNG = {
  user: { uid: 'v1', companyId: 'perl', name: 'Verwaltung', role: 'Verwaltung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
const CHEFIN = {
  user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
const ADMIN = {
  user: { uid: 'a1', companyId: 'perl', name: 'Admin', role: 'Administrator' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
let authWert: typeof VERWALTUNG | typeof CHEFIN | typeof ADMIN = VERWALTUNG;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

// Der Katalogimport hat einen eigenen Test; hier zählt nur, ob es ihn gibt.
vi.mock('@/features/materials/KatalogImport', () => ({
  default: () => <div>Katalog einspielen (Inhalt)</div>,
}));

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

/** Zeigt die aktuelle Adresse — damit ein Test den Reiter darin sieht. */
function Adresse() {
  const ort = useLocation();
  return <output data-testid="adresse">{ort.pathname + ort.search}</output>;
}

/**
 * Einen Artikel im Seitenfenster öffnen — die ganze Zeile ist antippbar
 * (Linie „Lot“, E3). Bis zum Umbau lagen Inventur und Bewegungen im „⋯“.
 */
async function artikelOeffnen(name = 'Kupferrohr 15mm') {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Artikel' });
}

/** Der Wert unter einer Kennzahl im Seitenfenster. */
function kennzahl(fenster: HTMLElement, name: string) {
  return within(fenster).getByText(name).nextElementSibling as HTMLElement;
}

beforeEach(() => {
  materialien = [];
  anforderungen = [];
  katalogFehler = null;
  anforderungsFehler = false;
  authWert = VERWALTUNG;
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
    // Lagerstand und Reservierung stehen seit dem Umbau als Kennzahlen im Seitenfenster.
    const fenster = await artikelOeffnen();
    expect(kennzahl(fenster, 'im Lager')).toHaveTextContent('20 m');
    expect(kennzahl(fenster, 'reserviert')).toHaveTextContent('18');
    expect(kennzahl(fenster, 'frei')).toHaveTextContent('2');
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

  it('sagt „fehlen“ statt eines negativen „frei“ (Launch-Check, K2)', async () => {
    materialien = [material({ id: 'm1', stock: 74 })];
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1', quantity: 999 })];
    zeige();
    expect(await screen.findByText('925 m fehlen')).toBeInTheDocument();
    expect(screen.queryByText(/-925|−925/)).not.toBeInTheDocument();
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
  /*
    SEIT 24.09.2026 EIN DIALOG DER APP statt `window.prompt` (Prüflauf, F7);
    seit dem Testbericht vom 30.09.2026 (M29) mit Lieferant, Lieferschein und
    Bestellbezug.
  */
  /** Der Wareneingang aus dem Seitenfenster des Artikels (Linie „Lot“, E3). */
  async function eingangOeffnen() {
    await userEvent.click(within(await artikelOeffnen()).getByRole('button', { name: 'Wareneingang' }));
    return screen.findByRole('dialog', { name: /^Wareneingang: / });
  }

  async function eingangMit(menge: string, lieferant = 'Frauenthal') {
    const dialog = await eingangOeffnen();
    const feld = within(dialog).getByLabelText(/^Menge/);
    await userEvent.clear(feld);
    if (menge) await userEvent.type(feld, menge);
    // Seit Runde 3 (G19) eine Auswahl der Großhändler.
    const auswahl = await within(dialog).findByRole('combobox', { name: /^Lieferant/ });
    if (lieferant) await userEvent.selectOptions(auswahl, lieferant);
    await userEvent.type(within(dialog).getByLabelText(/^Lieferschein/), 'LS-4711');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Einbuchen' }));
    return dialog;
  }

  it('bucht Menge, Lieferant und Lieferschein', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    await eingangMit('12');
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 12, lieferant: 'Frauenthal', lieferschein: 'LS-4711', bezug: undefined,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Wareneingang: / })).not.toBeInTheDocument());
  });

  it('aus dem Seitenkopf: erst den Artikel wählen, dann buchen (Linie „Lot“, E3)', async () => {
    materialien = [material({ id: 'm1', stock: 20 }), material({ id: 'm2', name: 'Pressfitting', stock: 4 })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    const wahl = await screen.findByRole('dialog', { name: 'Artikel wählen' });
    await userEvent.type(within(wahl).getByRole('searchbox', { name: 'Artikel suchen' }), 'press');
    // Gegenprobe: die Suche lässt nur den passenden stehen.
    expect(within(wahl).queryByRole('button', { name: /Kupferrohr/ })).toBeNull();
    await userEvent.click(within(wahl).getByRole('button', { name: /Pressfitting/ }));
    expect(await screen.findByRole('dialog', { name: 'Wareneingang: Pressfitting' })).toBeInTheDocument();
  });

  it('bietet die angelegten Großhändler zur Wahl an — und „Anderer Lieferant …“ (Runde 3, G19)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangOeffnen();
    const auswahl = await within(dialog).findByRole('combobox', { name: /^Lieferant/ });
    expect(within(auswahl).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Bitte wählen …', 'Frauenthal', 'Anderer Lieferant …']);
    // Das Textfeld steht erst, wenn jemand einen anderen Lieferanten will.
    expect(within(dialog).queryByLabelText(/Name des Lieferanten/)).not.toBeInTheDocument();
  });

  it('nimmt einen anderen Lieferanten als Freitext (Runde 3, G19)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangOeffnen();
    const feld = within(dialog).getByLabelText(/^Menge/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '2');
    await userEvent.selectOptions(await within(dialog).findByRole('combobox', { name: /^Lieferant/ }), 'Anderer Lieferant …');
    await userEvent.type(within(dialog).getByLabelText(/Name des Lieferanten/), 'Baumarkt Mödling');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Einbuchen' }));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 2, lieferant: 'Baumarkt Mödling', lieferschein: undefined, bezug: undefined,
    }));
  });

  it('ohne angelegte Großhändler bleibt es beim Textfeld „Lieferant“', async () => {
    vi.mocked(listGrosshaendler).mockResolvedValueOnce([]);
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangOeffnen();
    expect(within(dialog).getByRole('textbox', { name: /^Lieferant/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: /^Lieferant/ })).not.toBeInTheDocument();
  });

  it('ohne Lieferant bucht er nicht', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangMit('12', '');
    expect(await within(dialog).findByText(/Von welchem Lieferanten/)).toBeInTheDocument();
    expect(bestandAendern).not.toHaveBeenCalled();
  });

  it('weist eine negative Menge ab, statt den Bestand zu senken', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangMit('-5');
    expect(await within(dialog).findByText(/Bitte eine Menge eintragen|größer als null/)).toBeInTheDocument();
    expect(bestandAendern).not.toHaveBeenCalled();
  });

  it('weist eine leere Menge ab', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    const dialog = await eingangMit('');
    expect(await within(dialog).findByText(/Bitte eine Menge eintragen/)).toBeInTheDocument();
    expect(bestandAendern).not.toHaveBeenCalled();
  });

  it('bucht nichts, wenn der Dialog abgebrochen wird', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    await userEvent.click(within(await eingangOeffnen()).getByRole('button', { name: 'Abbrechen' }));
    expect(bestandAendern).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /^Wareneingang: / })).not.toBeInTheDocument();
    // Das Seitenfenster des Artikels kommt danach wieder.
    expect(screen.getByRole('dialog', { name: 'Artikel' })).toBeInTheDocument();
  });

  it('bleibt bei einem Fehlschlag offen und sagt es — statt „eingebucht“ zu melden', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    bestandAendern.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    zeige();
    const dialog = await eingangMit('3');
    expect(await within(dialog).findByText(/Keine Verbindung zum Server/)).toBeInTheDocument();
    expect(screen.queryByText(/eingebucht/)).not.toBeInTheDocument();
  });
});

// Testbericht 30.09.2026, M28 — Inventur mit Grund, Bewegungsprotokoll.
describe('Lager — Inventur und Bewegungen', () => {
  it('bucht den gezählten Bestand mit Grund', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    inventurBuchen.mockResolvedValueOnce(18);
    zeige();
    // Seit dem Umbau im Seitenfenster des Artikels (vorher im Zeilenmenü, U12).
    await userEvent.click(within(await artikelOeffnen()).getByRole('button', { name: 'Inventur' }));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    const feld = within(dialog).getByLabelText(/^Gezählter Bestand/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '18');
    await userEvent.type(within(dialog).getByLabelText(/^Grund/), 'Inventur 30.09.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestand buchen' }));
    await waitFor(() => expect(inventurBuchen).toHaveBeenCalledWith('m1', 18, 'Inventur 30.09.'));
  });

  it('Gegenprobe: ohne Grund keine Korrektur', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    inventurBuchen.mockClear();
    zeige();
    // Aus dem „⋯“ des Seitenkopfs: erst den Artikel wählen.
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Inventur …' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Artikel wählen' })).getByRole('button', { name: /Kupferrohr/ }));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestand buchen' }));
    expect(await within(dialog).findByText(/Ohne Grund keine Korrektur/)).toBeInTheDocument();
    expect(inventurBuchen).not.toHaveBeenCalled();
  });

  it('nennt eine zurückgenommene Rüstlisten-Buchung „Einladen zurückgenommen“, eine Retoure „Retoure“ (Runde 3, G15)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    bewegungenLaden.mockResolvedValueOnce([
      { id: 'b3', materialId: 'm1', art: 'retoure', menge: 3, bestandNachher: 20, createdAt: Date.UTC(2026, 9, 1, 12) },
      { id: 'b2', materialId: 'm1', art: 'einladen_zurueck', menge: 8, bestandNachher: 17, grund: 'Rüstliste 01.10.2026 · eingeladen zurückgenommen', createdAt: Date.UTC(2026, 9, 1, 7) },
    ]);
    zeige();
    // Das Protokoll steht als Lot im Seitenfenster (vorher ein eigener Lesedialog).
    const dialog = await artikelOeffnen();
    expect(await within(dialog).findByText(/Einladen zurückgenommen \+8 m/)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Retoure \+3 m/)).toBeInTheDocument();
  });

  it('zeigt das Bewegungsprotokoll mit Lieferant und Grund', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    bewegungenLaden.mockResolvedValueOnce([
      { id: 'b2', materialId: 'm1', art: 'inventur', menge: -2, bestandNachher: 20, grund: 'Bruch', createdAt: Date.UTC(2026, 8, 30, 10) },
      { id: 'b1', materialId: 'm1', art: 'eingang', menge: 12, bestandNachher: 22, lieferant: 'Frauenthal', lieferschein: 'LS-4711', createdAt: Date.UTC(2026, 8, 29, 10) },
    ]);
    zeige();
    const dialog = await artikelOeffnen();
    const lot = await within(dialog).findByRole('list', { name: 'Bewegungen: Kupferrohr 15mm' });
    expect(within(lot).getByText(/Inventur -2 m/)).toBeInTheDocument();
    expect(within(lot).getByText(/Grund: Bruch/)).toBeInTheDocument();
    expect(within(lot).getByText(/Wareneingang \+12 m/)).toBeInTheDocument();
    expect(within(lot).getByText(/Frauenthal · Lieferschein LS-4711/)).toBeInTheDocument();
    // Jüngste zuerst, wie im Dialog vorher.
    expect(within(lot).getAllByRole('listitem')[0]).toHaveTextContent(/^Inventur/);
    // „Schließen“ schliesst das Fenster (Runde 3, G20: Lesen ohne „Abbrechen“).
    expect(within(dialog).queryByRole('button', { name: 'Abbrechen' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Lager — wenn ein Ladevorgang scheitert', () => {
  it('nennt die fehlenden Anforderungen, statt „nichts reserviert“ zu zeigen', async () => {
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

  it('führt nur, was im Lager geführt wird — Katalogartikel bleiben draußen (M30)', async () => {
    materialien = [
      material({ id: 'l1', name: 'Kupferrohr 15', lagerartikel: true }),
      material({ id: 'k1', name: 'Kugelhahn aus dem Katalog', stock: 0, lagerartikel: false }),
    ];
    zeige();
    expect(await screen.findByText('Kupferrohr 15')).toBeInTheDocument();
    expect(screen.queryByText('Kugelhahn aus dem Katalog')).not.toBeInTheDocument();
    expect(screen.getByText('von 2 im Katalog')).toBeInTheDocument();
  });

  it('knapp heißt: unter der Mindestmenge, wo eine steht (M30)', async () => {
    materialien = [
      material({ id: 'a', name: 'Fitting', stock: 20, lagerartikel: true, mindestmenge: 25 }),
      material({ id: 'b', name: 'Dichtband', stock: 4, lagerartikel: true, mindestmenge: 2 }),
    ];
    zeige();
    expect(await screen.findByText(/Mindestmenge 25/)).toBeInTheDocument();
    // Fitting liegt unter 25, Dichtband über seiner Mindestmenge von 2 — obwohl höchstens 5 frei.
    const knapp = screen.getByText('Knapp').closest('div')!.parentElement!;
    expect(knapp).toHaveTextContent('1');
  });

  it('unterscheidet einen leeren Katalog von einer erfolglosen Suche', async () => {
    materialien = [material({ id: 'm1' })];
    zeige();

    await userEvent.type(await screen.findByRole('textbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Kein Lagerartikel passt zu/)).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: /Suche/ }));
    materialien = [];
    // Der leere Katalog verweist auf den Reiter, der ihn füllt.
    zeige();
    expect(await screen.findAllByText(/Noch kein Material im Katalog/)).not.toHaveLength(0);
  });
});

describe('Wer den Katalog einspielen darf', () => {
  /*
    EINSPIELEN SETZT EINKAUFSPREISE — zu Zehntausenden. Von Hand darf das nur
    die Geschäftsführung; die harte Grenze steht in der Datenbank. Der Reiter
    wird deshalb nicht bloss deaktiviert, sondern gar nicht angeboten: ein
    Knopf, der zuverlässig abweist, ist schlechter als keiner.
  */
  /** Die Einträge im „⋯“ des Seitenkopfs — seit dem Umbau steht „Katalog einspielen“ dort. */
  async function seitenMenue() {
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    return within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent);
  }

  it('zeigt der Verwaltung den Eintrag nicht', async () => {
    zeige();
    expect(await screen.findByRole('button', { name: 'Katalog' })).toBeInTheDocument();
    expect(await seitenMenue()).toEqual(['Inventur …']);
  });

  it('zeigt ihn der Geschäftsführung und öffnet ihn', async () => {
    authWert = CHEFIN;
    zeige();
    expect(await seitenMenue()).toEqual(['Inventur …', 'Katalog einspielen']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Katalog einspielen' }));
    expect(await screen.findByText('Katalog einspielen (Inhalt)')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?reiter=import');
  });

  it('Gegenprobe: die Verwaltung kommt auch über die Adresse nicht hinein', async () => {
    zeige('/lager?reiter=import');
    expect(await screen.findByRole('button', { name: 'Bestand' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Katalog einspielen (Inhalt)')).toBeNull();
  });

  it('zeigt ihn auch der Administration', async () => {
    /*
      SIE IST DIE ROLLE, DIE DEN BETRIEB EINRICHTET — und der Katalogimport ist
      Einrichtung. Dieselbe Grenze zieht die Datenbank (`app.ist_spitze()`
      umfasst Geschäftsführung UND Administration); stünde hier nur die
      Geschäftsführung, hätte die Administration ein Recht, das sie nicht
      erreichen kann.
    */
    authWert = ADMIN;
    zeige();
    expect(await seitenMenue()).toContain('Katalog einspielen');
  });
});

// Testbericht 30.09.2026, G8 — der Reiter im Lager steht in der Adresse.
describe('Reiter in der Adresse', () => {
  it('ein Klick auf „Katalog“ schreibt ?reiter=katalog', async () => {
    zeige();
    // Seit dem Umbau Segmente „Bestand | Katalog“ statt Reiter.
    await userEvent.click(await screen.findByRole('button', { name: 'Katalog' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?reiter=katalog');
    expect(screen.getByRole('button', { name: 'Katalog' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('die Adresse öffnet den Reiter — und Unbekanntes landet beim Bestand', async () => {
    zeige('/lager?reiter=katalog');
    expect(await screen.findByRole('button', { name: 'Katalog' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Gegenprobe: ein unbekannter Reiter gilt als Bestand', async () => {
    zeige('/lager?reiter=irgendwas');
    expect(await screen.findByRole('button', { name: 'Bestand' })).toHaveAttribute('aria-pressed', 'true');
  });
});

// Testbericht 30.09.2026, M32 — die Rüstliste reserviert; die Zahlen kommen aus der Datenbank.
describe('Lager — Reservierung durch Rüstlisten', () => {
  afterEach(() => lagerStand.mockReset().mockImplementation(async () => { throw new Error('nicht geladen'); }));

  it('zeigt Freies und Geplantes nach der Rechnung der Datenbank', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    lagerStand.mockResolvedValue(new Map([['m1', { bestand: 20, zugesagt: 2, geplant: 3, frei: 15 }]]));
    zeige();
    expect(await screen.findByText(/15 m frei/)).toBeInTheDocument();
    expect(screen.getByText(/5 reserviert/)).toBeInTheDocument();
    // Was davon auf Rüstlisten liegt, steht bei der Kennzahl im Seitenfenster.
    const fenster = await artikelOeffnen();
    expect(within(fenster).getByText('davon 3 auf Rüstlisten')).toBeInTheDocument();
  });
});

/*
  DER FILTER „Alle · knapp · fehlt“ (Linie „Lot“, E3) — in der Adresse, damit
  der Verweis der Startseite (`/lager?filter=knapp`) weiter trägt.
*/
describe('Lager — Filter', () => {
  function bestand() {
    materialien = [
      material({ id: 'a', name: 'Reichlich', stock: 50 }),
      material({ id: 'b', name: 'Knapper', stock: 4 }),
      material({ id: 'c', name: 'Fehlender', stock: 2 }),
    ];
    anforderungen = [anforderung({ id: 'o1', materialId: 'c', quantity: 5 })];
  }

  it('„fehlt“ zeigt nur, was unter null frei ist, und steht in der Adresse', async () => {
    bestand();
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'fehlt' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?filter=fehlt');
    expect(screen.getByText('Fehlender')).toBeInTheDocument();
    expect(screen.queryByText('Knapper')).toBeNull();
    expect(screen.queryByText('Reichlich')).toBeNull();
  });

  it('„knapp“ aus der Adresse schliesst „fehlt“ ein, wie die Kennzahl', async () => {
    bestand();
    zeige('/lager?filter=knapp');
    expect(await screen.findByRole('button', { name: 'knapp' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Knapper')).toBeInTheDocument();
    expect(screen.getByText('Fehlender')).toBeInTheDocument();
    expect(screen.queryByText('Reichlich')).toBeNull();
  });

  it('Gegenprobe: „Alle“ zeigt alles und nimmt den Filter aus der Adresse', async () => {
    bestand();
    zeige('/lager?filter=knapp');
    await userEvent.click(await screen.findByRole('button', { name: 'Alle' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent(/^\/lager$/);
    expect(screen.getByText('Reichlich')).toBeInTheDocument();
  });

  it('zeigt einen Zustand nur bei „knapp“ oder „fehlen“', async () => {
    bestand();
    zeige();
    const reichlich = (await screen.findByText('Reichlich')).closest('li')!;
    expect(reichlich.querySelector('.stand')).toBeNull();
    expect(within(screen.getByText('Knapper').closest('li')!).getByText('knapp')).toBeInTheDocument();
    expect(within(screen.getByText('Fehlender').closest('li')!).getByText('3 m fehlen')).toBeInTheDocument();
  });
});
