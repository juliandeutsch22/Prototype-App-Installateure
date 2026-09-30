import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  async function eingangMit(menge: string, lieferant = 'Frauenthal') {
    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    const dialog = await screen.findByRole('dialog');
    const feld = within(dialog).getByLabelText(/^Menge/);
    await userEvent.clear(feld);
    if (menge) await userEvent.type(feld, menge);
    if (lieferant) await userEvent.type(within(dialog).getByLabelText(/^Lieferant/), lieferant);
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abbrechen' }));
    expect(bestandAendern).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Inventur' }));
    const dialog = await screen.findByRole('dialog');
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
    await userEvent.click(await screen.findByRole('button', { name: 'Inventur' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bestand buchen' }));
    expect(await within(dialog).findByText(/Ohne Grund keine Korrektur/)).toBeInTheDocument();
    expect(inventurBuchen).not.toHaveBeenCalled();
  });

  it('zeigt das Bewegungsprotokoll mit Lieferant und Grund', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    bewegungenLaden.mockResolvedValueOnce([
      { id: 'b2', materialId: 'm1', art: 'inventur', menge: -2, bestandNachher: 20, grund: 'Bruch', createdAt: Date.UTC(2026, 8, 30, 10) },
      { id: 'b1', materialId: 'm1', art: 'eingang', menge: 12, bestandNachher: 22, lieferant: 'Frauenthal', lieferschein: 'LS-4711', createdAt: Date.UTC(2026, 8, 29, 10) },
    ]);
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Bewegungen' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Inventur -2 m/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Grund: Bruch/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Wareneingang \+12 m/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Frauenthal · Lieferschein LS-4711/)).toBeInTheDocument();
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

describe('Wer den Katalog einspielen darf', () => {
  /*
    EINSPIELEN SETZT EINKAUFSPREISE — zu Zehntausenden. Von Hand darf das nur
    die Geschäftsführung; die harte Grenze steht in der Datenbank. Der Reiter
    wird deshalb nicht bloss deaktiviert, sondern gar nicht angeboten: ein
    Knopf, der zuverlässig abweist, ist schlechter als keiner.
  */
  it('zeigt der Verwaltung den Reiter nicht', async () => {
    zeige();
    expect(await screen.findByRole('tab', { name: 'Katalog' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Katalog einspielen' })).toBeNull();
  });

  it('zeigt ihn der Geschäftsführung und öffnet ihn', async () => {
    authWert = CHEFIN;
    zeige();
    await userEvent.click(await screen.findByRole('tab', { name: 'Katalog einspielen' }));
    expect(await screen.findByText('Katalog einspielen (Inhalt)')).toBeInTheDocument();
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
    expect(await screen.findByRole('tab', { name: 'Katalog einspielen' })).toBeInTheDocument();
  });
});

// Testbericht 30.09.2026, G8 — der Reiter im Lager steht in der Adresse.
describe('Reiter in der Adresse', () => {
  it('ein Klick auf „Katalog“ schreibt ?reiter=katalog', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('tab', { name: 'Katalog' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?reiter=katalog');
    expect(screen.getByRole('tab', { name: 'Katalog' })).toHaveAttribute('aria-selected', 'true');
  });

  it('die Adresse öffnet den Reiter — und Unbekanntes landet beim Bestand', async () => {
    zeige('/lager?reiter=katalog');
    expect(await screen.findByRole('tab', { name: 'Katalog' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Gegenprobe: ein unbekannter Reiter gilt als Bestand', async () => {
    zeige('/lager?reiter=irgendwas');
    expect(await screen.findByRole('tab', { name: 'Bestand' })).toHaveAttribute('aria-selected', 'true');
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
    expect(screen.getByText(/5 reserviert \(davon 3 auf Rüstlisten\)/)).toBeInTheDocument();
  });
});
