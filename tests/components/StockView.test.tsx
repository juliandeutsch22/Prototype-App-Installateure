import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handlung } from './handlung';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Material, MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import StockView from '@/features/orders/StockView';
import { listGrosshaendler, lieferungenFuerArtikel } from '@/lib/db/einkauf';
import { zwischenspeicherFuer } from '@/lib/liveSpeicher';
import type { LagerListeFrage } from '@/lib/db/materials';
import { lagerListeNachgebildet } from './lagerListeNachbildung';

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
/** Was die Ansicht `lager_liste` gefragt hat — je Aufruf eine Frage. */
const listeFragen: LagerListeFrage[] = [];
/** Meldet eine Änderung im Katalog, wie es der Live-Kanal täte. */
let katalogGeaendert: () => void = () => undefined;
/** Meldet eine Änderung im Lager (Artikel, Anforderungen), wie es der Kanal täte. */
let lagerGeaendert: () => void = () => undefined;

const bestandAendern = vi.fn();

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  /*
    Die Lagerliste rechnet seit 15.11.2026 die Datenbank (`lager_liste`):
    hier nachgebildet aus den Mustern — nur die im Lager geführten Artikel
    (ein Datensatz ohne Angabe gilt als geführt; die Muster tragen das Feld
    meist nicht) und das Reservierte, wie `lagerStand` es nennt.
  */
  lagerListe: async (f: LagerListeFrage) => {
    listeFragen.push(f);
    if (katalogFehler) throw new Error(katalogFehler);
    return lagerListeNachgebildet(f, { materialien, stand: (ids) => lagerStand(ids) });
  },
  lagerBeobachten: (_c: string, melde: () => void) => {
    lagerGeaendert = melde;
    return () => undefined;
  },
  katalogAnzahl: async () => materialien.length,
  katalogBeobachten: (_c: string, melde: () => void) => {
    katalogGeaendert = melde;
    return () => undefined;
  },
  lagerEingang: (...a: unknown[]) => bestandAendern(...a),
  lagerInventur: (...a: unknown[]) => inventurBuchen(...a),
  listLagerbewegungen: (...a: unknown[]) => bewegungenLaden(...a),
  // M03a: die Suche über Nummern der Großhändler — der Server nennt die Artikel.
  NUMMER_AB: 3,
  nummernTreffer: (begriff: string) => nummernSuche(begriff),
  kommissionsartikelImLager: (ids?: readonly string[]) => kommissionAufruf(ids),
}));
/** M6: die Kommissionsware, die schon im Lager steht — wie die Datenbank sie nennt. */
const kommissionAufruf = vi.fn<(ids?: readonly string[]) => Promise<Array<{ id: string; name: string }>>>(
  async (ids) => (ids ? ids.map((id) => ({ id, name: 'Sonderfitting' })) : [{ id: 'k9', name: 'Sonderfitting' }]),
);
const nummernSuche = vi.fn<(begriff: string) => Promise<Map<string, unknown>>>(async () => new Map());
/*
  WAS DIE DATENBANK RESERVIERT (wie `lager_frei`; die genauen Regeln prüfen
  die Prüfungen gegen die Datenbank) — ohne eigene Vorgabe für die Muster
  hier: offene Anforderungen mit Verweis auf den Artikel, keine erledigten,
  keine Retouren.
*/
async function standAusAnforderungen(ids?: readonly string[]): Promise<Map<string, unknown>> {
  return new Map((ids ?? []).map((id) => {
    const zugesagt = anforderungen
      .filter((o) => o.materialId === id && o.transactionType !== 'return' && o.status !== 'Erledigt')
      .reduce((n, o) => n + (o.quantity ?? 0), 0);
    return [id, { zugesagt, geplant: 0 }];
  }));
}
const lagerStand = vi.fn<(ids?: readonly string[]) => Promise<Map<string, unknown>>>(standAusAnforderungen);
const inventurBuchen = vi.fn();
const bewegungenLaden = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock('@/lib/db/einkauf', () => ({
  listGrosshaendler: vi.fn(async () => [{ id: 'g1', name: 'Frauenthal', active: true }]),
  // M12: was von diesem Artikel noch kommt — ohne eigene Vorgabe nichts.
  lieferungenFuerArtikel: vi.fn(async () => ({ anforderungen: [], posten: [], geliefert: [] })),
  GELIEFERT_ZURUECK_TAGE: 14,
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
// Ebenso die offenen Lieferantenartikel (M03a).
vi.mock('@/features/materials/OffeneLieferantenartikel', () => ({
  default: () => <div>Offene Lieferantenartikel (Inhalt)</div>,
}));

// F14: die Zähllisten im Reiter „Inventur“ — die Liste selbst prüft `ZaehllisteView.test.tsx`.
vi.mock('@/lib/db/inventur', () => ({
  inventurListen: vi.fn(async () => [{
    id: 'i1', ort: 'h', ortName: 'Hauptlager', bezeichnung: 'Jahresinventur', stichtag: null, zustand: 'offen',
    angelegtAm: Date.parse('2026-11-17T08:00:00Z'), angelegtVonName: 'Vera', gebuchtAm: null, gebuchtVonName: null,
    artikel: 10, gezaehlt: 3, abweichend: 0,
  }]),
  inventurAnlegen: vi.fn(),
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
  listeFragen.length = 0;
  authWert = VERWALTUNG;
  bestandAendern.mockReset();
  bestandAendern.mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

describe('Lager — was ist wirklich frei?', () => {
  /*
    WAS RESERVIERT IST, RECHNET DIE DATENBANK (`lager_frei`, seit 15.11.2026
    auch die ganze Liste, `lager_liste`): zugesagte Anforderungen und
    Rüstlisten, keine erledigten, keine Retouren — geprüft gegen die
    Datenbank (`tests/supabase/lagerListe.test.ts` und die Prüfungen von
    `lager_frei`). Die Ansicht zeigt Lagerstand, Reserviertes und Freies, wie
    die Datenbank sie nennt. Der Rückfall auf eine eigene Rechnung im Browser
    (samt Zuordnung über den Namen) griff nur, wenn die Datenbank nicht
    antwortete; seitdem steht dann ein Fehler mit „Erneut versuchen“.
  */
  it('zeigt frei als Lagerstand minus das Reservierte der Datenbank', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    lagerStand.mockImplementation(async () => new Map([['m1', { zugesagt: 10, geplant: 8 }]]));
    try {
      zeige();
      expect(await screen.findByText('2 m frei')).toBeInTheDocument();
      // Lagerstand und Reservierung stehen seit dem Umbau als Kennzahlen im Seitenfenster.
      const fenster = await artikelOeffnen();
      expect(kennzahl(fenster, 'im Lager')).toHaveTextContent('20 m');
      expect(kennzahl(fenster, 'reserviert')).toHaveTextContent('18');
      expect(kennzahl(fenster, 'frei')).toHaveTextContent('2');
    } finally {
      lagerStand.mockImplementation(standAusAnforderungen);
    }
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

    // Die Einträge der Stand-Zeile darüber sind auch Listenpunkte; gezählt wird die Bestandsliste.
    await screen.findByText('Zargenschraube');
    const zeilen = screen.getAllByRole('listitem').filter((li) => !li.classList.contains('lage-punkt'));
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
    expect(await screen.findByText('2 m frei')).toBeInTheDocument();
    const kachel = screen.getByText('Knapp').parentElement!;
    expect(within(kachel).getByText('1')).toBeInTheDocument();
  });
});

describe('Lager — der Stand im Seitenkopf (E24)', () => {
  it('steht im Kopf; was „Knapp“ und „Reserviert“ meinen, steht in der Hilfe', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1', quantity: 18 })];
    zeige();
    // Die Liste kommt aus der Datenbank: erst mit ihr steht der Kopf fertig da.
    await screen.findByText('2 m frei');
    const knapp = screen.getByText('Knapp');
    expect(knapp.closest('.plankopf')).not.toBeNull();
    expect(screen.getByText('Reserviert').closest('.plankopf')).not.toBeNull();
    expect(screen.queryByText(/unter Mindestmenge/)).toBeNull();
    expect(screen.queryByText('zugesagt und auf Rüstlisten')).toBeNull();
  });

  it('bleibt auf dem Reiter „Katalog“ stehen — sonst sprängen die Reiter beim Wechseln', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige('/lager?reiter=katalog');
    expect((await screen.findByText('Im Lager')).closest('.plankopf')).not.toBeNull();
  });
});

/*
  NUR, WAS GEZEIGT WIRD (Durchsicht 15.11.2026, Budget B3: höchstens 50
  Zeilen je Anfrage). Vorher kam jeder Lagerartikel samt seinem Freien in
  den Browser (gewachsener Bestand: 2.000 und 1.000 Zeilen), um 20 zu
  zeigen. Jetzt fragt die Ansicht die Datenbank nach der gezeigten Seite;
  Zahlen, Suche und Filter gelten trotzdem über alle. Gegenprobe: mit dem
  Stand davor gibt es keine Frage nach einer Seite (rot).
*/
describe('Lager — nur die gezeigte Seite aus der Datenbank', () => {
  const viele = () => Array.from({ length: 45 }, (_, i) =>
    material({ id: `m${String(i).padStart(2, '0')}`, name: `Artikel ${String(i).padStart(2, '0')}`, stock: 20 + i }));

  it('fragt 20 Zeilen, zählt über alle und holt mit „weitere anzeigen“ die nächsten', async () => {
    materialien = viele();
    zeige();
    expect(await screen.findByRole('button', { name: 'Artikel 00' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artikel 20' })).not.toBeInTheDocument();
    expect(listeFragen.every((f) => f.anzahl <= 20)).toBe(true);
    const imLager = screen.getAllByText('Im Lager').find((e) => e.classList.contains('lage-name'))!.parentElement!;
    expect(imLager).toHaveTextContent('45');

    await userEvent.click(screen.getByRole('button', { name: 'und 25 weitere anzeigen' }));
    expect(await screen.findByRole('button', { name: 'Artikel 39' })).toBeInTheDocument();
    expect(listeFragen[listeFragen.length - 1]).toMatchObject({ anzahl: 40, filter: 'alle', reihenfolge: 'frei' });
  });

  it('sucht über alle — auch, was nicht auf der ersten Seite stand', async () => {
    materialien = viele();
    zeige();
    await screen.findByRole('button', { name: 'Artikel 00' });
    await userEvent.type(screen.getByRole('searchbox', { name: /Suche/ }), 'Artikel 44');
    expect(await screen.findByRole('button', { name: 'Artikel 44' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Artikel 00' })).not.toBeInTheDocument());
    expect(listeFragen[listeFragen.length - 1]).toMatchObject({ begriff: 'Artikel 44', anzahl: 20 });
  });

  it('eine Änderung im Lager (Kanal) fragt die Liste neu', async () => {
    materialien = [material({ id: 'm1', stock: 40 })];
    zeige();
    expect(await screen.findByText('40 m frei')).toBeInTheDocument();
    materialien = [material({ id: 'm1', stock: 38 })];
    await act(async () => lagerGeaendert());
    expect(await screen.findByText('38 m frei')).toBeInTheDocument();
  });
});

/*
  ERST MIT DER ANTWORT DER DATENBANK (Analyse 10.10.2026): vorher stand das
  selbst Gerechnete, Augenblicke später das der Datenbank — zwei Zahlen für
  „frei“ hintereinander.
*/
describe('Lager — frei und reserviert erst mit der Datenbank', () => {
  it('zeigt bis dahin Platzhalter statt der eigenen Rechnung', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [];
    let liefern: (m: Map<string, unknown>) => void = () => undefined;
    lagerStand.mockClear();
    lagerStand.mockImplementation(() => new Promise((ok) => { liefern = ok; }));
    try {
      zeige();
      await waitFor(() => expect(lagerStand).toHaveBeenCalled());
      expect(screen.queryByText(/20 m frei/)).not.toBeInTheDocument();
      const knapp = screen.getAllByText('Knapp').find((e) => e.classList.contains('lage-name'))!.parentElement!;
      expect(within(knapp).getAllByRole('status').length).toBeGreaterThan(0);
      // Auch die Reiter zählen erst mit der Datenbank: vorher keine Zahl aus der eigenen Rechnung.
      expect(screen.getByRole('button', { name: 'knapp' }).querySelector('.segment-anzahl')).toBeNull();
      await act(async () => liefern(new Map([['m1', { bestand: 20, zugesagt: 0, geplant: 17, frei: 3 }]])));
      expect(await screen.findByRole('button', { name: 'knapp 1' })).toBeInTheDocument();
      // Gleich die Zahl der Datenbank, nie die eigene (20 frei).
      expect(await screen.findByText(/3 m frei/)).toBeInTheDocument();
      expect(screen.queryByText(/20 m frei/)).not.toBeInTheDocument();
    } finally {
      lagerStand.mockImplementation(standAusAnforderungen);
    }
  });

  // Stufe 3: beim zweiten Besuch stehen frei und reserviert sofort da, frisch geholt wird im Hintergrund.
  it('beim zweiten Besuch stehen frei und reserviert sofort da', async () => {
    zwischenspeicherFuer('v1', 'perl');
    materialien = [material({ id: 'm1', stock: 20 })];
    anforderungen = [];
    lagerStand.mockImplementation(async () => new Map([['m1', { bestand: 20, zugesagt: 0, geplant: 17, frei: 3 }]]));
    try {
      const erster = zeige();
      expect(await screen.findByText(/3 m frei/)).toBeInTheDocument();
      erster.unmount();

      const vorher = lagerStand.mock.calls.length;
      lagerStand.mockImplementation(() => new Promise(() => undefined));
      zeige();
      expect(screen.getByText(/3 m frei/)).toBeInTheDocument();
      const knapp = screen.getAllByText('Knapp').find((e) => e.classList.contains('lage-name'))!.parentElement!;
      expect(within(knapp).queryByRole('status')).toBeNull();
      await waitFor(() => expect(lagerStand.mock.calls.length).toBeGreaterThan(vorher));
    } finally {
      lagerStand.mockImplementation(standAusAnforderungen);
    }
  });

  /*
    Bis 15.11.2026 stand hier „bleibt der gemerkte Stand, bis der Katalog da
    ist“: eine Antwort über eine noch leere Artikelliste überschrieb den
    gemerkten Stand mit Nullen. Seit die Datenbank die ganze Liste rechnet,
    gibt es diese halbe Antwort nicht mehr — gemerkt wird nur eine ganze.
  */
  // Unter dem kürzeren Platzhalter schob die eintreffende Liste sie nach unten (Messung 11.10.2026).
  it('„weitere anzeigen“ steht erst mit der Liste da', async () => {
    materialien = Array.from({ length: 25 }, (_, i) => material({ id: `m${i}`, name: `Artikel ${i}`, stock: 20 }));
    anforderungen = [];
    let liefern: (m: Map<string, unknown>) => void = () => undefined;
    lagerStand.mockClear();
    lagerStand.mockImplementation(() => new Promise((ok) => { liefern = ok; }));
    try {
      zeige();
      await waitFor(() => expect(lagerStand).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /weitere anzeigen/ })).not.toBeInTheDocument();
      await act(async () => liefern(new Map()));
      expect(await screen.findByRole('button', { name: /5 weitere anzeigen/ })).toBeInTheDocument();
    } finally {
      lagerStand.mockImplementation(standAusAnforderungen);
    }
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
    await userEvent.click(handlung({ name: 'Wareneingang' }, await artikelOeffnen()));
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
    await userEvent.click(handlung({ name: 'Einbuchen' }, dialog));
    return dialog;
  }

  it('bucht Menge, Lieferant und Lieferschein', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    await eingangMit('12');
    // Seit 10.11.2026 mit der Vorgangskennung des Dialogs (E58).
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 12, lieferant: 'Frauenthal', lieferschein: 'LS-4711', bezug: undefined,
      vorgang: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Wareneingang: / })).not.toBeInTheDocument());
  });

  /*
    EIN VORGANG JE GEÖFFNETEM DIALOG (Prüfbericht 10.11.2026): riss das Netz
    nach dem Senden ab, buchte ein zweiter Tipp ein zweites Mal ein. Mit
    derselben Kennung bucht die Datenbank höchstens einmal.
  */
  it('ein erneuter Versuch nach einem Fehler schickt denselben Vorgang — ein neuer Eingang einen neuen', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    bestandAendern.mockRejectedValueOnce(new Error('Netzwerkfehler'));
    zeige();
    const dialog = await eingangMit('12');
    expect(await within(dialog).findByText(/Netzwerkfehler/)).toBeInTheDocument();
    await userEvent.click(handlung({ name: 'Einbuchen' }, dialog));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledTimes(2));
    const [erst, zweit] = bestandAendern.mock.calls.map((c) => (c[0] as { vorgang: string }).vorgang);
    expect(erst).toMatch(/^[0-9a-f-]{36}$/);
    expect(zweit).toBe(erst);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Wareneingang: / })).not.toBeInTheDocument());
    await eingangMit('3');
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledTimes(3));
    expect((bestandAendern.mock.calls[2][0] as { vorgang: string }).vorgang).not.toBe(erst);
  });

  it('aus dem Seitenkopf: erst den Artikel wählen, dann buchen (Linie „Lot“, E3)', async () => {
    materialien = [material({ id: 'm1', stock: 20 }), material({ id: 'm2', name: 'Pressfitting', stock: 4 })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Wareneingang' }));
    const wahl = await screen.findByRole('dialog', { name: 'Artikel wählen' });
    await userEvent.type(within(wahl).getByRole('searchbox', { name: 'Artikel suchen' }), 'press');
    // Gegenprobe: die Suche lässt nur den passenden stehen (gesucht in der Datenbank, kurz nach dem Tippen).
    await waitFor(() => expect(within(wahl).queryByRole('button', { name: /Kupferrohr/ })).toBeNull());
    await userEvent.click(handlung({ name: /Pressfitting/ }, wahl));
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
    await userEvent.click(handlung({ name: 'Einbuchen' }, dialog));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 2, lieferant: 'Baumarkt Mödling', lieferschein: undefined, bezug: undefined,
      vorgang: expect.stringMatching(/^[0-9a-f-]{36}$/),
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

  /*
    EIN WEG FÜR EINE LIEFERUNG (M12, B17): der Wareneingang erledigt die
    offenen Bestellungen des Artikels mit — vorher buchte, wer danach auf der
    Einkaufsliste „Geliefert“ drückte, die Menge ein zweites Mal ein.
    Gegenprobe: ohne die Bestellungen im Dialog fehlen sie im Aufruf (rot);
    ohne offene Bestellung bleibt der Aufruf wie bisher (die Tests oben).
  */
  const offen = () => ({
    anforderungen: [anforderung({
      id: 'a1', materialId: 'm1', quantity: 10, beschaffung: 'einkauf', supplierId: 'g1',
      bestelltAm: Date.UTC(2026, 10, 12), userName: 'Max Mustermann', projectNumber: 'B-2026-0001',
      status: 'In Bearbeitung',
    })],
    posten: [{ id: 'p1', companyId: 'perl', materialId: 'm1', materialName: 'Kupferrohr 15mm', menge: 20,
      supplierId: 'g1', bestelltAm: Date.UTC(2026, 10, 10) }],
    // Noch nicht bestellt: kann nicht ankommen, wird nicht angeboten.
    geliefert: [],
  } as unknown as Awaited<ReturnType<typeof lieferungenFuerArtikel>>);

  it('erledigt die offenen Bestellungen mit — Anforderung zuerst, die letzte als Teillieferung (M12)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.mocked(lieferungenFuerArtikel).mockResolvedValueOnce(offen());
    zeige();
    const dialog = await eingangOeffnen();
    const a = await within(dialog).findByRole('checkbox', { name: /^10 m · Max Mustermann · B-2026-0001 · Frauenthal/ });
    const p = within(dialog).getByRole('checkbox', { name: /^20 m · fürs Lager · Frauenthal/ });
    expect(a).toBeChecked();
    expect(p).toBeChecked();
    // Beide beim selben Großhändler: er steht schon als Lieferant da.
    expect(within(dialog).getByRole('combobox', { name: /^Lieferant/ })).toHaveValue('Frauenthal');
    const feld = within(dialog).getByLabelText(/^Menge/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '25');
    expect(within(dialog).getByText('1 Bestellung ist damit geliefert; eine teilweise (15 von 20), der Rest bleibt bestellt.'))
      .toBeInTheDocument();
    await userEvent.click(handlung({ name: 'Einbuchen' }, dialog));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 25, lieferant: 'Frauenthal', lieferschein: undefined, bezug: undefined,
      vorgang: expect.stringMatching(/^[0-9a-f-]{36}$/), bestellungen: ['a1', 'p1'],
    }));
  });

  it('abgehakt geht alles frei in den Bestand — wie bisher (M12)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.mocked(lieferungenFuerArtikel).mockResolvedValueOnce(offen());
    zeige();
    const dialog = await eingangOeffnen();
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Max Mustermann/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /fürs Lager/ }));
    expect(within(dialog).getByText(/Keine Bestellung gewählt/)).toBeInTheDocument();
    await userEvent.click(handlung({ name: 'Einbuchen' }, dialog));
    await waitFor(() => expect(bestandAendern).toHaveBeenCalledWith({
      materialId: 'm1', menge: 1, lieferant: 'Frauenthal', lieferschein: undefined, bezug: undefined,
      vorgang: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
  });

  it('nennt, was in den letzten Tagen schon als geliefert gebucht ist (M12)', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    vi.mocked(lieferungenFuerArtikel).mockResolvedValueOnce({
      anforderungen: [], posten: [],
      geliefert: [{ id: 'p9', menge: 12, lieferschein: 'LS-0815', geliefertAm: Date.UTC(2026, 10, 14, 9) }],
    } as unknown as Awaited<ReturnType<typeof lieferungenFuerArtikel>>);
    zeige();
    const dialog = await eingangOeffnen();
    expect(await within(dialog).findByText(/12 m am 14\.11\.2026 \(Lieferschein LS-0815\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/nicht noch einmal einbuchen/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('bucht nichts, wenn der Dialog abgebrochen wird', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    zeige();
    await userEvent.click(handlung({ name: 'Abbrechen' }, await eingangOeffnen()));
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
    await userEvent.click(handlung({ name: 'Inventur' }, await artikelOeffnen()));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    const feld = within(dialog).getByLabelText(/^Gezählter Bestand/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '18');
    await userEvent.type(within(dialog).getByLabelText(/^Grund/), 'Inventur 30.09.');
    await userEvent.click(handlung({ name: 'Bestand buchen' }, dialog));
    await waitFor(() => expect(inventurBuchen).toHaveBeenCalledWith('m1', 18, 'Inventur 30.09.'));
  });

  it('Gegenprobe: ohne Grund keine Korrektur', async () => {
    materialien = [material({ id: 'm1', stock: 20 })];
    inventurBuchen.mockClear();
    zeige();
    // Aus dem „⋯“ des Seitenkopfs: erst den Artikel wählen.
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Inventur …' }));
    await userEvent.click(handlung({ name: /Kupferrohr/ }, await screen.findByRole('dialog', { name: 'Artikel wählen' })));
    const dialog = await screen.findByRole('dialog', { name: /^Inventur: / });
    await userEvent.click(handlung({ name: 'Bestand buchen' }, dialog));
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
    await userEvent.click(handlung({ name: 'Schließen' }, dialog));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Lager — wenn ein Ladevorgang scheitert', () => {
  /*
    Bis 15.11.2026 auch „nennt die fehlenden Anforderungen“: die Liste holte
    sie für eine eigene Rechnung des Reservierten. Die rechnet jetzt die
    Datenbank in derselben Antwort wie die Liste — scheitert sie, steht der
    Fehler (unten), nie „nichts reserviert“.
  */
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

  /*
    NUR DIE LAGERARTIKEL VOM SERVER (18.10.2026): vorher kam der ganze Katalog
    bis zur Grenze, gefiltert im Browser — nach einem DATANORM-Import fehlten
    die Lagerartikel hinter den ersten tausend Zeilen. Die Grösse des
    Katalogs wird gezählt, nicht geholt, und neu gezählt, wenn er sich ändert.
  */
  it('fragt den Server nur nach den Lagerartikeln und zählt den Katalog neu, wenn er sich ändert', async () => {
    materialien = [
      material({ id: 'l1', name: 'Kupferrohr 15', lagerartikel: true }),
      material({ id: 'k1', name: 'Kugelhahn aus dem Katalog', stock: 0, lagerartikel: false }),
    ];
    zeige();
    expect(await screen.findByText('von 2 im Katalog')).toBeInTheDocument();
    // Beim Öffnen genau eine Frage an die Lagerliste.
    expect(listeFragen).toHaveLength(1);

    materialien = [...materialien, material({ id: 'k2', name: 'Eckventil', stock: 0, lagerartikel: false })];
    await act(async () => katalogGeaendert());
    expect(await screen.findByText('von 3 im Katalog')).toBeInTheDocument();
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

    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Gesucht wurde „.+“ in Name, Kategorie und Artikelnummer\./)).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: /Suche/ }));
    materialien = [];
    // Der leere Katalog verweist auf den Reiter, der ihn füllt.
    zeige();
    expect(await screen.findAllByText(/Noch kein Material im Katalog/)).not.toHaveLength(0);
    // Echte Leere mit dem Regal (Planlinie § 6), nicht nur ein Satz.
    expect(document.querySelector('.lot-zeichnung-leer[data-motiv="lager"]')).not.toBeNull();
  });

  /*
    PLANLINIE (E30): frei und reserviert gegen den Regalbestand als Maßlinie.
    Mehr reserviert als im Regal läuft rot darüber; ein leeres Regal ist
    keine Grenze und bekommt keine Linie.
  */
  it('bemaßt reserviert gegen das Regal; ohne Bestand keine Linie (Planlinie)', async () => {
    materialien = [
      material({ id: 'm1', name: 'Kupferrohr 15', stock: 20 }),
      material({ id: 'm2', name: 'Pressfitting', stock: 4 }),
      material({ id: 'm3', name: 'Eckventil', stock: 0 }),
    ];
    anforderungen = [
      anforderung({ id: 'o1', materialId: 'm1', quantity: 5 }),
      anforderung({ id: 'o2', materialId: 'm2', quantity: 6 }),
    ];
    zeige();
    const rohr = (await screen.findByText('Kupferrohr 15')).closest('li') as HTMLElement;
    const linie = await within(rohr).findByRole('img', { name: /5 reserviert von 20 m im Regal/ });
    expect(linie).not.toHaveAttribute('data-darueber');
    const fitting = screen.getByText('Pressfitting').closest('li') as HTMLElement;
    expect(within(fitting).getByRole('img', { name: /6 reserviert von 4/ })).toHaveAttribute('data-darueber', 'true');
    const ventil = screen.getByText('Eckventil').closest('li') as HTMLElement;
    expect(within(ventil).queryByRole('img')).not.toBeInTheDocument();
  });

  /*
    E72 (09.11.2026) — gemessen: am Tablet blieben dem Namen neben Zustand und
    Maßlinie rund 200 px, die Artikelnummer brach in sich; am Schreibtisch
    sprang der Zustand je Zeile um 14 px, weil die Zahlen ohne Regal schmaler
    waren als die Linie. Gegenprobe: mit dem Stand davor rot.
  */
  it('die Zeile ist gestapelt; Maßlinie und Zahlen stehen in derselben festen Breite, der Zustand in seiner Spalte (E72)', async () => {
    materialien = [
      material({ id: 'm1', name: 'Kupferrohr 15', stock: 20 }),
      material({ id: 'm3', name: 'Eckventil', stock: 0 }),
    ];
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1', quantity: 5 })];
    zeige();
    const rohr = (await screen.findByText('Kupferrohr 15')).closest('li') as HTMLElement;
    const ventil = screen.getByText('Eckventil').closest('li') as HTMLElement;
    for (const zeile of [rohr, ventil]) {
      expect(zeile).toHaveClass('zeile-gestapelt');
      expect(zeile.querySelector('.zeile-stand > .zeile-wert > .lager-masslinie')).not.toBeNull();
      // Eine Zustandsspalte auch ohne Zustand — sonst begänne die Linie dort weiter links.
      expect(zeile.querySelector('.zeile-stand > .zeile-zustand')).not.toBeNull();
    }
    expect(within(rohr).getByRole('img', { name: /5 reserviert von 20 m im Regal/ }).closest('.lager-masslinie')).not.toBeNull();
    expect(within(ventil).getByText(/0 m frei/).closest('.lager-masslinie')).not.toBeNull();
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
    // M04a (bewusst nachgezogen): die Lagerorte pflegt, wer das Lager führt — auch die Verwaltung.
    expect(await seitenMenue()).toEqual(['Inventur …', 'Lagerorte …', 'Kommissionsware aus dem Lager nehmen …']);
  });

  it('zeigt ihn der Geschäftsführung und öffnet ihn', async () => {
    authWert = CHEFIN;
    zeige();
    /*
      ANGEPASST (M03a): seit den Katalogen mehrerer Großhändler steht dort
      auch „Offene Lieferantenartikel“ — für dieselben Rollen wie das
      Einspielen (eigene Prüfungen unten, „Offene Lieferantenartikel“).
    */
    expect(await seitenMenue()).toEqual(['Inventur …', 'Lagerorte …', 'Katalog einspielen', 'Offene Lieferantenartikel', 'Kommissionsware aus dem Lager nehmen …']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Katalog einspielen' }));
    expect(await screen.findByText('Katalog einspielen (Inhalt)')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?reiter=import');
  });

  it('Runde 6, G28: beim Einspielen ist ein Reiter markiert und die Überschrift steht nur einmal', async () => {
    authWert = CHEFIN;
    zeige('/lager?reiter=import');
    expect(await screen.findByText('Katalog einspielen (Inhalt)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einspielen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bestand' })).toHaveAttribute('aria-pressed', 'false');
    // Die Überschrift bringt die (hier nachgestellte) Karte des Einspielens selbst mit.
    expect(screen.queryByRole('heading', { name: 'Katalog einspielen' })).toBeNull();
  });

  it('Runde 6, G28: ohne Einspielen gibt es den Reiter nicht', async () => {
    authWert = CHEFIN;
    zeige('/lager?reiter=katalog');
    expect(await screen.findByRole('button', { name: 'Katalog' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Einspielen' })).toBeNull();
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

  // E72: die Bereiche stehen schmal links in der Listenleiste, nicht über die ganze Breite gestreckt.
  it('die Bereiche stehen in einer Listenleiste wie in den Anforderungen (E72)', async () => {
    zeige();
    const bestand = await screen.findByRole('button', { name: 'Bestand' });
    expect(bestand.closest('.listenleiste-reiter')).not.toBeNull();
    expect(bestand.closest('.anf-leiste')).not.toBeNull();
  });
});

// Testbericht 30.09.2026, M32 — die Rüstliste reserviert; die Zahlen kommen aus der Datenbank.
describe('Lager — Reservierung durch Rüstlisten', () => {
  afterEach(() => lagerStand.mockReset().mockImplementation(standAusAnforderungen));

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
    await userEvent.click(await screen.findByRole('button', { name: /^fehlt( \d+)?$/ }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?filter=fehlt');
    expect(screen.getByText('Fehlender')).toBeInTheDocument();
    expect(screen.queryByText('Knapper')).toBeNull();
    expect(screen.queryByText('Reichlich')).toBeNull();
  });

  it('„knapp“ aus der Adresse schliesst „fehlt“ ein, wie die Kennzahl', async () => {
    bestand();
    zeige('/lager?filter=knapp');
    expect(await screen.findByRole('button', { name: /^knapp( \d+)?$/ })).toHaveAttribute('aria-pressed', 'true');
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

  /*
    DIE ZAHLEN AN DEN REITERN (Design-Entwurf, Punkt 2): was zu tun ist, über
    alle Lagerartikel — „knapp“ schliesst „fehlt“ ein, wie die Kennzahl.
  */
  it('nennt an „knapp“ und „fehlt“, wie viele es sind — erst mit dem Stand der Datenbank', async () => {
    bestand();
    zeige();
    expect(await screen.findByRole('button', { name: 'knapp 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fehlt 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle' }).textContent).toBe('Alle');
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

/*
  LADEZEIT (19.10.2026): die Frei-Mengen hingen an der Identität der
  Live-Listen und wurden bei jeder Meldung neu geholt. Seit 15.11.2026
  kommen Liste und Freies in einer Antwort der Datenbank; neu gefragt wird
  auf eine Meldung des Kanals hin (oben: „eine Änderung im Lager …“).
*/

/*
  OFFENE LIEFERANTENARTIKEL (M03a): erreichbar über das „⋯“ des Lagers für
  dieselben Rollen wie das Einspielen, und nur mit dem Modul „Kataloge
  mehrerer Großhändler“. GEGENPROBE: ohne die Änderung gibt es weder den
  Eintrag noch den Reiter.
*/
describe('Offene Lieferantenartikel', () => {
  async function seitenMenue() {
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    return within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent);
  }

  it('die Geschäftsführung öffnet sie über das „⋯“, mit eigenem Reiter in der Adresse', async () => {
    authWert = CHEFIN;
    zeige();
    expect(await seitenMenue()).toContain('Offene Lieferantenartikel');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Offene Lieferantenartikel' }));
    expect(await screen.findByText('Offene Lieferantenartikel (Inhalt)')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('/lager?reiter=zuordnen');
    expect(screen.getByRole('button', { name: 'Zuordnen' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('die Verwaltung ohne Freigabe sieht weder Eintrag noch Reiter — auch nicht über die Adresse', async () => {
    authWert = VERWALTUNG;
    zeige('/lager?reiter=zuordnen');
    expect(await screen.findByRole('button', { name: 'Bestand' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Offene Lieferantenartikel (Inhalt)')).toBeNull();
    expect(await seitenMenue()).not.toContain('Offene Lieferantenartikel');
  });

  it('ist das Modul aus, verschwindet die Ansicht', async () => {
    authWert = {
      user: CHEFIN.user,
      company: { id: 'perl', name: 'Perl Installationen', modules: { 'material.katalogversionen': false } },
    } as typeof CHEFIN;
    zeige('/lager?reiter=zuordnen');
    expect(await screen.findByRole('button', { name: 'Bestand' })).toHaveAttribute('aria-pressed', 'true');
    // „Lagerorte …“ (M04a) hängt an seiner eigenen Unterfähigkeit, nicht an dieser.
    expect(await seitenMenue()).toEqual(['Inventur …', 'Lagerorte …', 'Katalog einspielen', 'Kommissionsware aus dem Lager nehmen …']);
  });
});

/*
  M03a: DIE LAGERLISTE FINDET AUCH ÜBER DIE NUMMER EINES GROSSHÄNDLERS. Die
  liegt nicht am Artikel, sondern am zugeordneten Lieferantenartikel; der
  Server nennt die passenden Artikel. GEGENPROBE: ohne die Änderung bleibt
  die Liste bei „B-7788“ leer.
*/
describe('Suche über die Nummer eines Großhändlers (M03a)', () => {
  it('nimmt die Artikel dazu, die der Server über Nummer oder EAN nennt', async () => {
    materialien = [material({ id: 'm1', name: 'Kugelhahn' }), material({ id: 'm2', name: 'Eckventil' })];
    nummernSuche.mockImplementation(async (b: string) =>
      b === 'B-7788' ? new Map([['m2', { nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' }]]) : new Map());
    zeige();
    await screen.findByText('Kugelhahn');
    await userEvent.type(screen.getByRole('searchbox', { name: /Suche/ }), 'B-7788');
    await waitFor(() => expect(nummernSuche).toHaveBeenLastCalledWith('B-7788'));
    // Die Lagerliste fragt danach mit den Treffern der Nummernsuche.
    await waitFor(() => expect(listeFragen[listeFragen.length - 1]).toMatchObject({ begriff: 'B-7788', treffer: ['m2'] }));
    expect(await screen.findByText('Eckventil')).toBeInTheDocument();
    expect(screen.queryByText('Kugelhahn')).toBeNull();
  });

  it('unter drei Zeichen fragt sie den Server nicht', async () => {
    materialien = [material({ id: 'm1', name: 'Kugelhahn' })];
    nummernSuche.mockClear();
    zeige();
    await screen.findByText('Kugelhahn');
    await userEvent.type(screen.getByRole('searchbox', { name: /Suche/ }), 'Ku');
    await new Promise((r) => setTimeout(r, 400));
    expect(nummernSuche).not.toHaveBeenCalled();
  });
});

/*
  V10 MATERIAL (13.11.2026): kamen die Lagerartikel nicht, stand „Noch kein
  Artikel im Lager geführt“ und im Kopf „Im Lager 0 · Knapp 0“ — eine Leere
  und Nullen über ein Lager, das nicht gelesen wurde. Gegenprobe: mit dem
  Stand davor sind die ersten beiden Prüfungen rot.
*/
describe('V10 Lager — Fehler ist nicht leer', () => {
  it('nach einem Ladefehler: der Fehler im Bestand, keine Leere, keine Nullen im Kopf', async () => {
    katalogFehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Der Bestand konnte nicht geladen werden/)).toBeInTheDocument();
    expect(screen.queryByText(/Noch kein Artikel im Lager geführt/)).toBeNull();
    expect(screen.queryByText('Noch kein Material im Katalog')).toBeNull();
    const imLager = screen.getAllByText('Im Lager').find((e) => e.classList.contains('lage-name'))!.parentElement!;
    expect(within(imLager).queryByText('0')).toBeNull();
    expect(within(imLager).getByText('nicht geladen')).toBeInTheDocument();
  });

  it('„Erneut versuchen“ holt die Artikel neu', async () => {
    katalogFehler = 'Fehlende Berechtigung';
    materialien = [material({ id: 'm1', name: 'Kupferrohr 15mm', stock: 20 })];
    zeige();
    await screen.findByText(/Der Bestand konnte nicht geladen werden/);
    katalogFehler = null;
    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(await screen.findByRole('button', { name: 'Kupferrohr 15mm' })).toBeInTheDocument();
    expect(screen.queryByText(/Der Bestand konnte nicht geladen werden/)).toBeNull();
  });

  it('gleich geblieben: ein Lager ohne geführte Artikel sagt es weiter', async () => {
    materialien = [material({ id: 'k1', name: 'Kugelhahn', stock: 0, lagerartikel: false })];
    zeige();
    expect(await screen.findByText(/Noch kein Artikel im Lager geführt/)).toBeInTheDocument();
  });
});

/*
  M6 (16.11.2026): KOMMISSIONSWARE, DIE SCHON IM LAGER STEHT. Bis dahin
  machte jede Lieferung für eine Anforderung den Artikel für immer zum
  Lagerartikel. Die Rückfrage zeigt, was die Datenbank nennt, und nimmt nur
  diese Artikel aus dem Lager.
*/
describe('Kommissionsware aus dem Lager nehmen (M6)', () => {
  it('zeigt die Artikel und nimmt genau diese heraus', async () => {
    kommissionAufruf.mockClear();
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Kommissionsware aus dem Lager nehmen …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kommissionsware aus dem Lager nehmen?' });
    expect(within(dialog).getByText('Sonderfitting')).toBeInTheDocument();
    expect(kommissionAufruf).toHaveBeenCalledWith(undefined);
    await userEvent.click(handlung({ name: 'Aus dem Lager nehmen' }, dialog));
    await waitFor(() => expect(kommissionAufruf).toHaveBeenLastCalledWith(['k9']));
  });

  it('Gleichbleiben: ohne solche Artikel kein Fenster, nur eine Meldung', async () => {
    kommissionAufruf.mockResolvedValueOnce([]);
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Lager' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Kommissionsware aus dem Lager nehmen …' }));
    expect(await screen.findByText('Kein Artikel kam nur als Kommissionsware ins Lager.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Kommissionsware aus dem Lager nehmen?' })).toBeNull();
  });
});

/* F14 (Durchsicht 15.11.2026): Inventur als Zählliste je Ort. */
describe('Lager — Reiter „Inventur“ (F14)', () => {
  it('zeigt die offenen Zähllisten mit ihrem Fortschritt; der Reiter steht in der Adresse', async () => {
    zeige('/lager?reiter=inventur');
    expect(await screen.findByText('Hauptlager · Jahresinventur')).toBeInTheDocument();
    expect(screen.getByText('3 von 10 gezählt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neue Zählliste' })).toBeInTheDocument();
  });

  it('der Reiter ist von „Bestand“ aus erreichbar', async () => {
    zeige();
    await userEvent.click(handlung({ name: /Inventur/ }, await screen.findByRole('group', { name: 'Bereich' })));
    expect(screen.getByTestId('adresse').textContent).toBe('/lager?reiter=inventur');
  });

  it('bleibt gleich: die Einzelinventur im ⋯ der Seite', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Lager/ }));
    expect(screen.getByRole('menuitem', { name: 'Inventur …' })).toBeInTheDocument();
  });
});
