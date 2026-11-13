import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Material, MaterialOrder, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import OrderView from '@/features/orders/OrderView';

/**
 * Material anfordern — der erste Schritt des Materialablaufs und die Ansicht,
 * die ein Monteur mit Handschuhen im Keller bedient.
 *
 * GEPRÜFT WIRD DIE VERDRAHTUNG, nicht die Rechnung. Was hier schiefgehen
 * kann, geht still schief: eine Eilzustellung ohne zuständige Baustelle
 * erreicht niemanden, ein Teilfehler beim Absenden erzeugt beim zweiten
 * Versuch Doppelbuchungen, ein geteiltes Tablet bestellt unter dem falschen
 * Namen. Keiner dieser Fälle wirft eine Meldung.
 */

const ROHR: WithId<Material> = {
  id: 'm1', companyId: 'perl', name: 'Kupferrohr 15mm', category: 'Rohre',
  unit: 'm', stock: 40, articleNumber: 'KR15',
} as WithId<Material>;
const DICHTUNG: WithId<Material> = {
  id: 'm2', companyId: 'perl', name: 'Dichtung 1/2"', category: 'Kleinteile',
  unit: 'Stk', stock: 3, articleNumber: 'D12',
} as WithId<Material>;

const MIT_LEITUNG: Project = {
  id: 'p1', companyId: 'perl', projectNumber: '2026-042', customerName: 'Familie Huber',
  status: 'Aktiv', projectManagers: ['pl1'],
} as Project;
const OHNE_LEITUNG: Project = {
  id: 'p2', companyId: 'perl', projectNumber: '2026-099', customerName: 'Firma Ohne',
  status: 'Aktiv', projectManagers: [],
} as Project;

let materialien: WithId<Material>[] = [];
let projekte: Project[] = [];
let eigene: WithId<MaterialOrder>[] = [];
let abosFehler: { material?: boolean; eigene?: boolean; projekte?: boolean } = {};

const anlegen = vi.fn();
const retoure = vi.fn();
const statusSetzen = vi.fn();
const eiligSetzen = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);

let lagerStand: Map<string, unknown> | null = null;
/** Hält den Katalog zurück, bis der Test ihn schickt. */
let katalogHalten = false;
let katalogSenden: () => void = () => undefined;
/** Was die Ansicht beim Server angefragt hat — Suchbegriff und Länge der Seite. */
let katalogAbfragen: { begriff: string; anzahl: number }[] = [];
/** Mit welcher Wahl der Katalog gefragt wurde — „nur anforderbar“ (10.11.2026). */
let katalogWahl: unknown[] = [];
/** Meldet der Ansicht eine Änderung im Katalog, wie es der Live-Kanal täte. */
let katalogGeaendert: () => void = () => undefined;
/** Hält die eigenen Anforderungen zurück, bis der Test sie schickt. */
let eigeneHalten = false;
let eigeneSenden: () => void = () => undefined;
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  lagerFrei: async () => {
    if (!lagerStand) throw new Error('nicht geladen');
    return lagerStand;
  },
  /*
    Wie der Server (18.10.2026): nach Namen, gesucht in Bezeichnung,
    Kategorie und Artikelnummer, die ersten `anzahl` und die Zahl aller Treffer.
  */
  katalogSeite: (_c: string, begriff: string, anzahl: number, wie?: unknown) => {
    katalogAbfragen.push({ begriff, anzahl });
    katalogWahl.push(wie);
    const ergebnis = () => {
      const treffer = katalogTreffer(begriff);
      return { zeilen: treffer.slice(0, anzahl), gesamt: treffer.length };
    };
    if (abosFehler.material) return Promise.reject(new Error('Katalog nicht lesbar'));
    if (katalogHalten) return new Promise((fertig) => { katalogSenden = () => fertig(ergebnis()); });
    return Promise.resolve(ergebnis());
  },
  sucheKatalog: async (_c: string, begriff: string, max = 20) => katalogTreffer(begriff).slice(0, max),
  katalogBeobachten: (_c: string, melde: () => void) => {
    katalogGeaendert = melde;
    return () => undefined;
  },
}));

function katalogTreffer(begriff: string): WithId<Material>[] {
  const q = begriff.trim().toLowerCase();
  return [...materialien]
    .filter((m) => !q || [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)))
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
}

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => {
    if (abosFehler.projekte) throw new Error('kein Netz');
    return projekte;
  }),
  listProjectsByNumbers: vi.fn(async () => projekte),
  listRecentProjects: vi.fn(async () => projekte),
}));

vi.mock('@/lib/db/materialOrders', () => ({
  subscribeOwnOrders: (
    _c: string,
    _uid: string,
    _max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    if (abosFehler.eigene) onError(new Error('nicht lesbar'));
    else if (eigeneHalten) eigeneSenden = () => cb(eigene);
    else cb(eigene);
    return () => undefined;
  },
  // Die Ansicht schreibt über das Ausgangsfach: die Antwort ist nicht mehr
  // eine Kennung, sondern der Stand — `confirmed` oder `queued`.
  createMaterialOrderOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  createReturn: (...a: unknown[]) => retoure(...a),
  updateOrderStatus: (...a: unknown[]) => statusSetzen(...a),
  anforderungEiligSetzen: (...a: unknown[]) => eiligSetzen(...a),
}));

/*
  DIE BAUSTELLE WANDERT MIT (B3, E83): Einsätze des Tages und der laufende
  Arbeitstag — ab Werk keiner von beiden.
*/
let heuteEinsaetze: { projectNumber: string; zeitVon?: string }[] = [];
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: vi.fn(async () => heuteEinsaetze),
}));
let letzteBuchung: string | null = null;
vi.mock('@/lib/db/timeEntries', () => ({ letzteEigeneBaustelle: vi.fn(async () => letzteBuchung) }));
let laufenderTag: { stand: string; segmente: { art: string; baustelle?: string; von: string }[] } | undefined;
vi.mock('@/features/time/zeitsitzungStand', () => ({
  useZeitsitzung: () => ({ laeuft: laufenderTag }),
}));

const authWert = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max Mustermann', role: 'Mitarbeiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige(adresse = '/material') {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <ToastProvider>
        <OrderView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Die Auswahl der Baustelle, ERST WENN DIE BAUSTELLEN GELADEN SIND. Bis
 * dahin steht sie gesperrt mit „lädt …“ da; wer früher wählt, findet die
 * Baustelle nicht — auf einem langsamen CI-Rechner geschah genau das.
 */
async function baustelleFeld() {
  const feld = await screen.findByRole('combobox', { name: /Für welche Baustelle/ });
  await waitFor(() => expect(feld).toBeEnabled());
  return feld;
}

/**
 * Die Retoure im Seitenfenster öffnen — seit dem 20.10.2026 über die
 * sichtbare Zeile „Material zurückgeben“ statt über das „⋯“ des Seitenkopfs.
 */
async function retoureOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: /^Material zurückgeben/ }));
  return screen.findByRole('dialog', { name: 'Material zurückgeben' });
}

beforeEach(() => {
  eiligSetzen.mockClear();
  localStorage.clear();
  heuteEinsaetze = [];
  laufenderTag = undefined;
  letzteBuchung = null;
  materialien = [ROHR, DICHTUNG];
  katalogAbfragen = [];
  katalogWahl = [];
  katalogGeaendert = () => undefined;
  projekte = [MIT_LEITUNG, OHNE_LEITUNG];
  eigene = [];
  abosFehler = {};
  anlegen.mockReset();
  anlegen.mockResolvedValue('confirmed');
  retoure.mockReset();
  retoure.mockResolvedValue('ret1');
  statusSetzen.mockReset();
  statusSetzen.mockResolvedValue({ art: 'geaendert' });
});

/*
  ERST MIT DEN EIGENEN ANFORDERUNGEN (Analyse 10.10.2026): bis sie da waren,
  stand „Meine Anforderungen (0) – Keine offenen Bestellungen“.
*/
describe('Meine Anforderungen beim Laden', () => {
  it('stehen erst mit dem Katalog darüber — sonst schöbe er sie beim Eintreffen nach unten', async () => {
    katalogHalten = true;
    try {
      zeige();
      await baustelleFeld();
      expect(screen.queryByText(/Meine Anforderungen \(/)).not.toBeInTheDocument();
      expect(screen.queryByText('Nicht im Katalog?')).not.toBeInTheDocument();
      // Auch kein Platzhalter darunter: den schöbe der eintreffende Katalog ebenso weg.
      expect(within(screen.getByRole('region', { name: 'Meine Anforderungen' })).queryByRole('status')).toBeNull();
      await act(async () => katalogSenden());
      expect(await screen.findByText(/Meine Anforderungen \(\d+\)/)).toBeInTheDocument();
      expect(screen.getByText('Nicht im Katalog?')).toBeInTheDocument();
    } finally {
      katalogHalten = false;
    }
  });

  it('sagen nichts, bevor sie geladen sind — danach die richtige Zahl', async () => {
    eigeneHalten = true;
    try {
      zeige();
      await baustelleFeld();
      expect(screen.queryByText('Keine offenen Bestellungen.')).not.toBeInTheDocument();
      expect(screen.queryByText(/Meine Anforderungen \(0\)/)).not.toBeInTheDocument();
      // Der Katalog steht schon — dann zeigt ein Platzhalter, dass hier noch etwas kommt.
      await waitFor(() => expect(within(screen.getByRole('region', { name: 'Meine Anforderungen' })).getByRole('status')).toBeInTheDocument());
      await act(async () => eigeneSenden());
      expect(await screen.findByText(/Meine Anforderungen \(\d+\)/)).toBeInTheDocument();
    } finally {
      eigeneHalten = false;
    }
  });
});

describe('Material anfordern — der Warenkorb', () => {
  it('schickt Menge, Baustelle und Besteller an die Datenbank', async () => {
    zeige();
    await userEvent.selectOptions(
      await baustelleFeld(),
      '2026-042',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][0]).toBe('perl');
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      materialId: 'm1',
      materialName: 'Kupferrohr 15mm',
      quantity: 1,
      projectNumber: '2026-042',
      status: 'Offen',
      transactionType: 'order',
      userId: 'u1',
      userName: 'Max Mustermann',
    });
  });

  it('fordert auch an, was nicht im Katalog steht (Launch-Check 25.09.2026)', async () => {
    zeige();
    await userEvent.selectOptions(
      await baustelleFeld(),
      '2026-042',
    );
    const knopf = screen.getByRole('button', { name: 'In die Liste' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Eckventil ½″');
    await userEvent.clear(screen.getByLabelText('Menge'));
    await userEvent.type(screen.getByLabelText('Menge'), '2');
    await userEvent.click(knopf);
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      materialId: null,
      materialName: 'Eckventil ½″',
      quantity: 2,
      projectNumber: '2026-042',
    });
  });

  it('lässt die Namensspalte bei „Nicht im Katalog?“ schrumpfen (P4-02)', async () => {
    /*
      Prüflauf 25.09.2026, P4-02: `grid-cols-[1fr_5rem]` — `1fr` heißt
      `minmax(auto,1fr)` und gibt nicht unter die Eigenbreite des
      Eingabefelds nach. Bei 390 px liefen Menge und „Hinzufügen" 90–106 px
      aus der Karte. jsdom rechnet kein Layout; geprüft wird die Spalten-
      vorlage, die das Schrumpfen erlaubt (im Browser nachgemessen).
    */
    zeige();
    // Die Zeile steht mit dem Katalog, und der kommt seit dem 18.10.2026 als Antwort des Servers.
    const raster = (await screen.findByLabelText('Bezeichnung')).closest('.grid') as HTMLElement;
    // Seit E74 steht der Petrol-Kreis in jeder Breite in derselben Reihe — die Namensspalte schrumpft weiter.
    expect(raster.className).toContain('grid-cols-[minmax(0,1fr)_5rem_auto]');
    expect(raster.className).toContain('sm:grid-cols-[minmax(0,1fr)_6rem_auto]');
    expect(raster.className).not.toMatch(/grid-cols-\[1fr/);
  });

  it('schickt die Notiz mit, die nach dem Hinzufügen getippt wurde', async () => {
    /*
      GEFUNDEN BEIM PROBELAUF. Das Notizfeld erscheint erst, wenn schon etwas
      im Korb liegt — die Notiz hing aber an der Position und wurde beim
      Hinzufügen übernommen. Was danach getippt wurde (also immer), kam nie
      an, und das Feld war nach dem Absenden leer.
    */
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /Dichtung .* in die Liste/ }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Notiz für die Projektleitung/ }),
      'Bitte bis Donnerstag',
    );
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(2));
    expect(anlegen.mock.calls.map((c) => (c[1] as { note: string }).note)).toEqual([
      'Bitte bis Donnerstag',
      'Bitte bis Donnerstag',
    ]);
  });

  it('nimmt eine frei eingetippte Menge', async () => {
    /**
     * AUS DEM BETRIEB GEWUENSCHT. Vorher gab es nur „noch eins": wer dreissig
     * Meter Rohr braucht, haette dreissig Mal tippen muessen — mit Handschuhen,
     * auf der Baustelle. Der Knopf bleibt fuer den Regelfall, das Feld ist der
     * Ausweg fuer alles darueber.
     */
    zeige();
    const menge = await screen.findByRole('textbox', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '30');
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].quantity).toBe(30);
  });

  it('faellt nach dem Anfordern auf eins zurueck', async () => {
    // Eine stehengebliebene 30 waere die teurere Ueberraschung: die naechste
    // Position ist fast immer wieder eine.
    zeige();
    const menge = await screen.findByRole('textbox', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '30');
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));

    await waitFor(() => expect(menge).toHaveValue('1'));
  });

  it('fordert nichts an, solange die Menge unbrauchbar ist', async () => {
    // Ein leeres oder krummes Feld darf nicht als 0 oder NaN durchgehen.
    zeige();
    const menge = await screen.findByRole('textbox', { name: /Menge .* Kupferrohr 15mm/ });
    await userEvent.clear(menge);
    expect(screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ })).toBeDisabled();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('zählt dasselbe Material auf derselben Baustelle zusammen', async () => {
    // Sonst stünden drei Zeilen „Kupferrohr ×1" in der Anforderung, und die
    // Projektleitung müsste sie im Kopf addieren.
    zeige();
    const knopf = await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ });
    await userEvent.click(knopf);
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].quantity).toBe(2);
  });

  it('übernimmt die Eilzustellung NICHT ohne Baustelle', async () => {
    /**
     * Der Haken ist ohne Baustelle gesperrt — aber ein Zustand, der nur von
     * einem `disabled` gehalten wird, überlebt keine Umbauten. Hier wird
     * geprüft, was tatsächlich in die Datenbank geht: eine Eilmeldung ohne
     * Baustelle hat keine zuständige Projektleitung und erreicht damit
     * niemanden. Der Monteur wartete dann auf einen Anruf, den nie jemand
     * bekommen hat.
     */
    zeige();
    expect(await screen.findByRole('checkbox', { name: /Eilzustellung/ })).toBeDisabled();
    expect(screen.getByText('Dafür zuerst die Baustelle wählen.')).toBeInTheDocument();

    // Erst Baustelle und Haken setzen, dann die Baustelle wieder wegnehmen:
    // NUR SO wird die Bedingung im Warenkorb tatsächlich geprüft. Ohne diesen
    // Umweg bliebe der Haken schon deshalb aus, weil das Kästchen gesperrt
    // ist — und der Test wäre auch dann grün, wenn die Bedingung fehlte.
    const baustelle = await baustelleFeld();
    await userEvent.selectOptions(baustelle, '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeChecked());
    await userEvent.selectOptions(baustelle, '');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeDisabled(),
    );

    await userEvent.click(await screen.findByRole('button', { name: /Dichtung .* in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1].projectNumber).toBe('');
    expect(anlegen.mock.calls[0][1].isUrgent).toBe(false);
  });

  it('warnt vor einer Eilzustellung an eine Baustelle ohne Projektleitung', async () => {
    // Abschicken darf man sie — die Verwaltung sieht sie ohnehin. Aber wer
    // „Eil" ankreuzt, erwartet einen Anruf, und der käme hier nicht.
    zeige();
    await userEvent.selectOptions(
      await baustelleFeld(),
      '2026-099',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));

    expect(
      await screen.findByText(/keine Projektleitung zugeteilt/),
    ).toBeInTheDocument();
  });

  it('sagt nichts, wenn die Baustelle eine Projektleitung hat', async () => {
    zeige();
    await userEvent.selectOptions(
      await baustelleFeld(),
      '2026-042',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Eilzustellung/ }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Eilzustellung/ })).toBeChecked());
    expect(screen.queryByText(/keine Projektleitung zugeteilt/)).not.toBeInTheDocument();
  });
});

describe('Material anfordern — wenn das Absenden teilweise scheitert', () => {
  it('lässt genau die gescheiterten Positionen im Korb stehen', async () => {
    /**
     * DER FALL, DER DOPPELBUCHUNGEN ERZEUGT. Ginge der Korb komplett verloren
     * oder bliebe er komplett stehen, wäre nach einem Teilfehler unklar, was
     * schon geschrieben ist — und der zweite Versuch bestellte das Material
     * ein zweites Mal. Es wird positionsweise gesendet, und nur das
     * Gescheiterte bleibt liegen.
     */
    anlegen
      .mockResolvedValueOnce('confirmed')
      .mockRejectedValueOnce(new Error('kein Netz'));

    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Dichtung .* in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(screen.getByText(/konnten nicht gesendet werden/)).toBeInTheDocument());

    // Genau eine Zeile blieb übrig — die gescheiterte.
    expect(await screen.findByRole('heading', { name: 'Anforderung (1) — noch nicht abgeschickt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dichtung .* entfernen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kupferrohr 15mm entfernen/ })).not.toBeInTheDocument();
  });

  it('sagt es, wenn die Anforderung nur vorgemerkt ist', async () => {
    /*
      IM KELLER OHNE NETZ. Die Anforderung liegt im Ausgangsfach und geht
      später raus — sagt die App das nicht, tippt der Monteur sie oben am
      Fahrzeug ein zweites Mal, und das Material kommt doppelt.
    */
    anlegen.mockResolvedValue('queued');

    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    expect(await screen.findByText(/wird automatisch gesendet/)).toBeInTheDocument();
  });

  it('leert den Korb und springt zur Verfolgung, wenn alles durchging', async () => {
    // Seit dem Umbau stehen „Meine Anforderungen“ unter dem Katalog; statt
    // den Reiter zu wechseln, rollt die Seite dorthin.
    const rollen = vi.fn();
    Element.prototype.scrollIntoView = rollen;
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    expect(rollen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));

    await waitFor(() => expect(rollen).toHaveBeenCalled());
    expect(rollen.mock.contexts[0]).toBe(screen.getByRole('region', { name: 'Meine Anforderungen' }));
    expect(screen.queryByRole('heading', { name: /noch nicht abgeschickt/ })).toBeNull();
  });
});

describe('Material anfordern — der Warenkorb auf einem geteilten Tablet', () => {
  it('trennt den Korb nach Mandant und Benutzer', async () => {
    /**
     * Auf einem Baustellen-Tablet meldet sich nacheinander die halbe
     * Mannschaft an. Mit einem festen Schlüssel sah der Nächste den Korb
     * seines Vorgängers — und gab ihn unter SEINEM Namen auf DESSEN
     * Baustelle auf.
     */
    localStorage.setItem(
      'senklot.warenkorb:perl:jemand-anderer',
      JSON.stringify([{ materialId: 'm2', materialName: 'Fremd', quantity: 9, projectNumber: '', note: '' }]),
    );
    zeige();

    // Ein leerer Korb zeigt keine Karte (Analyse 03.10.2026, Paket 1) — und der fremde Korb kommt nicht herein.
    await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ });
    expect(screen.queryByRole('heading', { name: /^Anforderung \(/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Fremd/)).not.toBeInTheDocument();

    // Und die Gegenprobe beim Schreiben: der eigene Korb landet unter dem
    // eigenen Schlüssel, nicht unter einem, den sich alle teilen.
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await waitFor(() =>
      expect(localStorage.getItem('senklot.warenkorb:perl:u1')).toContain('Kupferrohr'),
    );
    expect(localStorage.getItem('senklot.warenkorb:perl')).toBeNull();
    // Mit dem ersten Artikel erscheint die Karte.
    expect(screen.getByRole('heading', { name: /^Anforderung \(1\) — noch nicht abgeschickt/ })).toBeInTheDocument();
  });

  it('holt den eigenen Korb nach einem Neustart zurück', async () => {
    // Auf der Baustelle bricht die Verbindung — oder die App — weg, bevor
    // abgeschickt wurde. Der Korb neu getippt ist eine verlorene Viertelstunde.
    localStorage.setItem(
      'senklot.warenkorb:perl:u1',
      JSON.stringify([
        { materialId: 'm1', materialName: 'Kupferrohr 15mm', quantity: 7, projectNumber: '2026-042', note: '' },
      ]),
    );
    zeige();

    expect(await screen.findByRole('heading', { name: 'Anforderung (1) — noch nicht abgeschickt' })).toBeInTheDocument();
    expect(screen.getByText('×7')).toBeInTheDocument();
  });
});

describe('Material anfordern — Retoure', () => {
  it('weist eine Menge unter 1 ab, statt sie zu buchen', async () => {
    /**
     * Eine Retoure mit Menge -3 ginge als `increment(-3)` durch und
     * VERRINGERTE den Lagerbestand — eine Rückgabe, die das Lager leert.
     */
    zeige();
    const fenster = await retoureOeffnen();
    await userEvent.type(within(fenster).getByRole('searchbox', { name: /^Material/ }), 'Kupfer');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    const menge = within(fenster).getByRole('textbox', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '-3');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));

    // Der Fehler steht im Fenster, in dem er entstand.
    expect(await within(fenster).findByText(/größer als null/)).toBeInTheDocument();
    expect(retoure).not.toHaveBeenCalled();
  });

  it('gibt Zustand und Menge weiter — nur „neu“ wird gutgeschrieben', async () => {
    zeige();
    const fenster = await retoureOeffnen();
    await userEvent.type(within(fenster).getByRole('searchbox', { name: /^Material/ }), 'KR15');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    await userEvent.selectOptions(within(fenster).getByRole('combobox', { name: /Zustand/ }), 'defekt');
    const menge = within(fenster).getByRole('textbox', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '4');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));

    await waitFor(() => expect(retoure).toHaveBeenCalledTimes(1));
    // Erfasst: das Fenster schliesst.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Material zurückgeben' })).toBeNull());
    expect(retoure.mock.calls[0][1]).toMatchObject({
      materialId: 'm1',
      materialName: 'Kupferrohr 15mm',
      quantity: 4,
      condition: 'defekt',
      userId: 'u1',
    });
  });
});

describe('Material anfordern — gescheiterte Ladevorgänge', () => {
  it('zeigt den Katalog trotzdem, wenn nur die Baustellen fehlen', async () => {
    // Ein stumm gescheitertes Nebenabo sieht aus wie „nichts da". Der Monteur
    // hielte seine Baustelle für nicht angelegt.
    abosFehler = { projekte: true };
    zeige();

    expect(await screen.findByText(/Die Baustellen/)).toBeInTheDocument();
    expect(screen.getByText('Kupferrohr 15mm')).toBeInTheDocument();
  });

  it('unterscheidet einen leeren Katalog von einer erfolglosen Suche', async () => {
    materialien = [];
    zeige();
    expect(await screen.findByRole('heading', { name: 'Noch kein Material im Katalog' })).toBeInTheDocument();
    // Echte Leere mit dem Regal (Planlinie § 6), keine Lupe.
    expect(document.querySelector('.lot-zeichnung-leer[data-motiv="lager"]')).not.toBeNull();
  });

  it('sagt bei einer erfolglosen Suche, dass es an der Suche liegt', async () => {
    zeige();
    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText('Kein Material passt zur Suche.')).toBeInTheDocument();
    // Gegenprobe zum leeren Katalog: hier die Lupe, nicht das Regal.
    expect(document.querySelector('.lot-zeichnung-leer[data-motiv="suche"]')).not.toBeNull();
    expect(document.querySelector('[data-motiv="lager"]')).toBeNull();
  });

  it('sucht auch über Kategorie und Artikelnummer', async () => {
    zeige();
    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'KR15');
    // Gesucht wird auf dem Server, kurz nach dem letzten Tastendruck.
    await waitFor(() => expect(screen.queryByText('Dichtung 1/2"')).not.toBeInTheDocument());
    expect(screen.getByText('Kupferrohr 15mm')).toBeInTheDocument();
    expect(katalogAbfragen[katalogAbfragen.length - 1].begriff).toBe('KR15');
  });
});

/*
  DER KATALOG SEITENWEISE VOM SERVER (Mengengerüst, 18.10.2026). Bis dahin
  lud die Seite bis zu tausend Artikel und suchte nur in diesen — aus einem
  eingespielten Großhandelskatalog fand der Monteur nur, was zufällig unter
  den ersten tausend lag.
*/
describe('Material anfordern — der Katalog vom Server', () => {
  const artikel = (i: number, name = `Artikel ${String(i).padStart(4, '0')}`) =>
    ({ id: `a${i}`, companyId: 'perl', name, category: 'Fittings', unit: 'Stk', stock: 0, articleNumber: `F${i}` }) as WithId<Material>;

  it('holt die ersten zwanzig nach Namen — „und N weitere“ holt die nächsten', async () => {
    materialien = Array.from({ length: 45 }, (_, i) => artikel(i));
    zeige();
    expect(await screen.findByText('Artikel 0019')).toBeInTheDocument();
    expect(screen.queryByText('Artikel 0020')).not.toBeInTheDocument();
    expect(katalogAbfragen[0]).toEqual({ begriff: '', anzahl: 20 });

    await userEvent.click(screen.getByRole('button', { name: 'und 25 weitere anzeigen' }));
    expect(await screen.findByText('Artikel 0039')).toBeInTheDocument();
    expect(katalogAbfragen[katalogAbfragen.length - 1]).toEqual({ begriff: '', anzahl: 40 });
    expect(screen.getByRole('button', { name: 'und 5 weitere anzeigen' })).toBeInTheDocument();
  });

  /*
    AUSGELAUFENES NICHT NEU ANFORDERN (Prüfbericht 10.11.2026) — wie bei den
    übrigen Erfassungen; was davon noch im Lager liegt, filtert die
    Datenbank nicht weg (`katalogSeite`, geprüft in tests/supabase).
  */
  it('fragt den Katalog „nur anforderbar“ — ohne Ausgelaufenes', async () => {
    materialien = [artikel(1)];
    zeige();
    expect(await screen.findByText('Artikel 0001')).toBeInTheDocument();
    expect(katalogWahl.length).toBeGreaterThan(0);
    expect(katalogWahl.every((w) => (w as { nurAnforderbar?: boolean } | undefined)?.nurAnforderbar === true)).toBe(true);
  });

  it('findet auch, was hinter den ersten tausend Artikeln liegt', async () => {
    materialien = [...Array.from({ length: 1200 }, (_, i) => artikel(i)), artikel(9999, 'Zylinderkopf Pressfitting 22')];
    zeige();
    await screen.findByText('Artikel 0000');
    await userEvent.type(screen.getByRole('searchbox', { name: /Suche/ }), 'Pressfitting');
    expect(await screen.findByText('Zylinderkopf Pressfitting 22')).toBeInTheDocument();
    expect(screen.queryByText('Artikel 0000')).not.toBeInTheDocument();
  });

  it('eine Änderung im Katalog holt die Seite neu — die Liste bleibt live', async () => {
    zeige();
    await screen.findByText('Kupferrohr 15mm');
    materialien = [...materialien, artikel(1, 'Eckventil 1/2"')];
    await act(async () => katalogGeaendert());
    expect(await screen.findByText('Eckventil 1/2"')).toBeInTheDocument();
  });

  it('die Retoure sucht auf dem Server — auch einen Artikel, der oben nicht geladen ist', async () => {
    materialien = [...Array.from({ length: 30 }, (_, i) => artikel(i)), { ...artikel(500, 'Zinkwanne'), unit: 'Stk' }];
    zeige();
    await screen.findByText('Artikel 0000');
    expect(screen.queryByText('Zinkwanne')).not.toBeInTheDocument();
    const fenster = await retoureOeffnen();
    await userEvent.type(within(fenster).getByRole('searchbox', { name: 'Material' }), 'Zink');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Zinkwanne zurückgeben/ }));
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    await waitFor(() => expect(retoure).toHaveBeenCalled());
    expect(retoure.mock.calls[0][1]).toMatchObject({ materialId: 'a500', materialName: 'Zinkwanne', quantity: 1 });
  });

  it('Gegenprobe: ein Neuladen des Katalogs wischt den Fehler einer Retoure nicht weg', async () => {
    zeige();
    await screen.findByText('Kupferrohr 15mm');
    const fenster = await retoureOeffnen();
    await userEvent.type(within(fenster).getByRole('searchbox', { name: 'Material' }), 'Kupfer');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    const menge = within(fenster).getByLabelText('Menge');
    await userEvent.clear(menge);
    await userEvent.type(menge, '-3');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    const meldung = (await within(fenster).findByRole('alert')).textContent;
    await act(async () => katalogGeaendert());
    await waitFor(() => expect(katalogAbfragen.length).toBeGreaterThan(1));
    expect(within(fenster).getByRole('alert')).toHaveTextContent(meldung ?? '');
  });
});

describe('Nachträglich eilig (17 F)', () => {
  const eigen = (rest: Partial<MaterialOrder>) =>
    ({ id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2, status: 'Offen',
      transactionType: 'order', userId: 'u1', projectNumber: '2026-042', ...rest }) as WithId<MaterialOrder>;

  /*
    SEIT E89 STEHT „EILIG“ IM SEITENFENSTER der Zeile, nicht als dritter Knopf
    in ihr (C7: Stand zuerst). Geprüft wird dieselbe Bedingung an der neuen
    Stelle.
  */
  const oeffnen = async (name: string) =>
    userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name} ×`) }));

  it('bietet „Als eilig markieren“ nur, wo es geht — offen oder in Arbeit, mit Baustelle, noch nicht eilig', async () => {
    eigene = [
      eigen({ id: 'a' }),
      eigen({ id: 'b', status: 'In Bearbeitung', materialName: 'Dichtung' }),
      eigen({ id: 'c', status: 'Abholbereit', materialName: 'Hanf' }),
      eigen({ id: 'd', projectNumber: undefined, materialName: 'Fitting' }),
      eigen({ id: 'e', isUrgent: true, materialName: 'Rohrschelle' }),
    ];
    zeige();
    await screen.findByText('Hanf');
    // In der Zeile steht kein „Eilig“ mehr.
    expect(screen.queryByRole('button', { name: 'Eilig' })).toBeNull();
    const kann: Record<string, boolean> = {};
    for (const name of ['Kupferrohr 15mm', 'Dichtung', 'Hanf', 'Fitting', 'Rohrschelle']) {
      await oeffnen(name);
      const f = within(screen.getByRole('dialog', { name: `Anforderung ${name}` }));
      kann[name] = !!f.queryByRole('button', { name: 'Als eilig markieren' });
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(kann).toEqual({ 'Kupferrohr 15mm': true, Dichtung: true, Hanf: false, Fitting: false, Rohrschelle: false });
  });

  it('fragt nach, sagt, wer verständigt wird — und setzt erst nach dem Ja', async () => {
    projekte = [MIT_LEITUNG];
    eigene = [eigen({})];
    zeige();
    await oeffnen('Kupferrohr 15mm');
    await userEvent.click(screen.getByRole('button', { name: 'Als eilig markieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Als eilig markieren?' });
    expect(within(dialog).getByText(/Projektleitung der Baustelle wird verständigt/)).toBeInTheDocument();
    expect(eiligSetzen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eilig' }));
    await waitFor(() => expect(eiligSetzen).toHaveBeenCalledWith('o1', true));
  });

  it('ohne Projektleitung an der Baustelle sagt sie das vorher — wie beim Anlegen', async () => {
    projekte = [OHNE_LEITUNG];
    eigene = [eigen({ projectNumber: '2026-099' })];
    zeige();
    await oeffnen('Kupferrohr 15mm');
    await userEvent.click(screen.getByRole('button', { name: 'Als eilig markieren' }));
    expect(within(await screen.findByRole('dialog', { name: 'Als eilig markieren?' })).getByText(/keine Projektleitung zugeteilt/)).toBeInTheDocument();
  });
});

/*
  „ABGEHOLT“ MIT HERKUNFT (C7, E89): solange nichts bereitgestellt oder
  bestellt ist, fragt die Rückfrage, woher die Ware kam, und gibt es weiter.
*/
describe('Abgeholt — aus dem Lager oder vom Händler (C7, E89)', () => {
  const eigen = (rest: Partial<MaterialOrder>) =>
    ({ id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2, status: 'Offen',
      transactionType: 'order', userId: 'u1', projectNumber: '2026-042', ...rest }) as WithId<MaterialOrder>;
  beforeEach(() => {
    statusSetzen.mockReset();
    statusSetzen.mockResolvedValue({ art: 'geaendert' });
  });

  it('bei „Offen“: die Rückfrage fragt nach der Herkunft — „vom Händler“ bucht nichts ab und geht so weiter', async () => {
    eigene = [eigen({})];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Abgeholt' }));
    const d = within(screen.getByRole('dialog', { name: 'Material abgeholt?' }));
    expect(d.getByRole('radio', { name: 'Aus dem Lager genommen' })).toBeChecked();
    expect(d.getByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    await userEvent.click(d.getByRole('radio', { name: 'Beim Händler mitgenommen' }));
    expect(d.getByText(/Vom Lagerbestand wird nichts abgezogen/)).toBeInTheDocument();
    await userEvent.click(d.getByRole('button', { name: 'Abgeholt' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o1', 'Erledigt', { von: 'Offen', herkunft: 'haendler' }));
  });

  it('Gegenprobe: abholbereit oder bestellt — keine Frage, gebucht wird wie bisher', async () => {
    eigene = [
      eigen({ id: 'a', status: 'Abholbereit' }),
      eigen({ id: 'b', materialName: 'Dichtung', status: 'In Bearbeitung', beschaffung: 'einkauf', bestelltAm: 1 }),
    ];
    zeige();
    const knoepfe = await screen.findAllByRole('button', { name: 'Abgeholt' });
    for (const [i, k] of knoepfe.entries()) {
      await userEvent.click(k);
      const d = within(screen.getByRole('dialog', { name: 'Material abgeholt?' }));
      expect(d.queryByRole('radio')).toBeNull();
      await userEvent.click(d.getByRole('button', { name: 'Abgeholt' }));
      await waitFor(() => expect(statusSetzen).toHaveBeenCalledTimes(i + 1));
    }
    expect(statusSetzen.mock.calls.map((c) => c[2])).toEqual([{ von: 'Abholbereit' }, { von: 'In Bearbeitung' }]);
  });

  it('erledigt und vom Händler: die Zeile sagt es', async () => {
    eigene = [eigen({ status: 'Erledigt', processed: true, abgeholtHerkunft: 'haendler' })];
    zeige();
    expect(await screen.findByText(/beim Händler mitgenommen/)).toBeInTheDocument();
  });
});

describe('Material anfordern — die eigene Verfolgung', () => {
  it('bietet „Abgeholt“ bei JEDER eigenen offenen Anforderung an', async () => {
    /**
     * AUS DEM BETRIEB GEWUENSCHT, und die Begruendung ueberzeugt: der Status
     * ist eine Absichtserklaerung der Verwaltung, kein Tatsachenbericht. Wer
     * sich das Material selbst aus dem Lager nimmt oder es beim Haendler
     * mitnimmt, ist fertig — unabhaengig davon, ob im Buero jemand dazu
     * gekommen ist, den Status weiterzuschalten. Vorher blieb so eine
     * Anforderung ewig offen, und der Lagerabzug unterblieb.
     */
    eigene = [
      { id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
        status: 'Offen', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
        status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();

    const knoepfe = await screen.findAllByRole('button', { name: 'Abgeholt' });
    expect(knoepfe).toHaveLength(2);
  });

  it('sagt dem Monteur, wenn sein Material erst bestellt wird', async () => {
    // Sonst fährt er ins Lager und findet nichts.
    eigene = [
      { id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2, status: 'In Bearbeitung',
        transactionType: 'order', userId: 'u1', beschaffung: 'einkauf' } as WithId<MaterialOrder>,
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5, status: 'In Bearbeitung',
        transactionType: 'order', userId: 'u1', beschaffung: 'einkauf', bestelltAm: 1 } as WithId<MaterialOrder>,
      { id: 'o3', companyId: 'perl', materialName: 'Hanf', quantity: 1, status: 'Abholbereit',
        transactionType: 'order', userId: 'u1', beschaffung: 'einkauf', bestelltAm: 1, geliefertAm: 2 } as WithId<MaterialOrder>,
    ];
    zeige();
    expect(await screen.findByText('nicht im Lager — wird bestellt')).toBeInTheDocument();
    expect(screen.getByText('beim Großhändler bestellt')).toBeInTheDocument();
    // Geliefert: kein Hinweis mehr — es liegt im Lager.
    expect(screen.getAllByText(/bestellt/)).toHaveLength(2);
  });

  it('bucht die Abholung erst nach der Bestätigung', async () => {
    eigene = [
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
        status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Abgeholt' }));

    expect(await screen.findByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();

    /**
     * Der Knopf muss „Abgeholt" heißen. Ohne gesetztes `confirmLabel` nimmt
     * der Dialog seine Vorgabe „Löschen" — in Rot, unter der Frage „Material
     * abgeholt?". Wer das liest, tippt nicht darauf.
     */
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abgeholt' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o2', 'Erledigt', { von: 'Abholbereit' }));
  });

  /* Runde 7, R7-M3: schon gebucht (zweiter Tab, oder das Lager war schneller) — kein Erfolg für nichts. */
  it('meldet eine Abholung, die schon gebucht war, als Hinweis — nicht als „bestätigt“', async () => {
    statusSetzen.mockResolvedValueOnce({ art: 'veraltet' });
    eigene = [
      { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
        status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Abgeholt' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abgeholt' }));
    expect(await screen.findByText(/Inzwischen schon als abgeholt gebucht/)).toBeInTheDocument();
    expect(screen.queryByText('Abholung bestätigt')).not.toBeInTheDocument();
  });

  it('führt Retouren im Erledigten, nicht im Offenen', async () => {
    eigene = [
      { id: 'r1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
        status: 'Offen', transactionType: 'return', userId: 'u1' } as WithId<MaterialOrder>,
    ];
    zeige();

    expect(await screen.findByText('Keine offenen Bestellungen.')).toBeInTheDocument();
    const erledigt = screen.getByRole('heading', { name: 'Erledigt (1)' }).closest('section')!;
    expect(within(erledigt).getByText('Retoure')).toBeInTheDocument();
  });
});

// Testbericht 30.09.2026, M27 — Mengen je Einheit: Meter mit Komma, Stück ganz.
describe('Mengen je Einheit', () => {
  it('Gegenprobe: „2,5“ Stück bei einer Retoure wird abgewiesen', async () => {
    zeige();
    const fenster = await retoureOeffnen();
    await userEvent.type(within(fenster).getByRole('searchbox', { name: /^Material/ }), 'Dichtung');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Dichtung 1\/2" zurückgeben/ }));
    const menge = within(fenster).getByRole('textbox', { name: /Menge/ });
    await userEvent.clear(menge);
    await userEvent.type(menge, '2,5');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    expect(await within(fenster).findByText(/ganze Stück/)).toBeInTheDocument();
    expect(retoure).not.toHaveBeenCalled();
  });

  it('Rohr in Metern nimmt „2,5“ in die Anforderung', async () => {
    zeige();
    const feld = await screen.findByRole('textbox', { name: /Menge m für Kupferrohr 15mm/ });
    await userEvent.clear(feld);
    await userEvent.type(feld, '2,5');
    const knopf = screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ });
    expect(knopf).toBeEnabled();
    await userEvent.click(knopf);
    expect((await screen.findAllByText('×2,5')).length).toBeGreaterThan(0);
  });

  it('Gegenprobe: bei Stück bleibt „1,5“ gesperrt', async () => {
    zeige();
    const feld = await screen.findByRole('textbox', { name: /Menge Stk für Dichtung/ });
    await userEvent.clear(feld);
    await userEvent.type(feld, '1,5');
    expect(screen.getByRole('button', { name: /Dichtung 1\/2" in die Liste/ })).toBeDisabled();
  });
});

// Testbericht 30.09.2026, G19 — der Monteur sieht, was frei ist, nicht was im Regal steht.
describe('Freie Menge', () => {
  it('„2 Stk frei (knapp)“ statt „Lager: 3 Stk“, wenn eines zugesagt ist', async () => {
    lagerStand = new Map([['m2', { bestand: 3, zugesagt: 1, geplant: 0, frei: 2 }]]);
    zeige();
    expect(await screen.findByText(/2 Stk frei \(knapp\)/)).toBeInTheDocument();
    lagerStand = null;
  });

  it('Gegenprobe: ohne Zahlen der Datenbank steht der Bestand', async () => {
    lagerStand = null;
    zeige();
    expect(await screen.findByText(/Lager: 3 Stk/)).toBeInTheDocument();
  });
});

// Testbericht 30.09.2026, M36 — der Warenkorb sagt, dass er noch nicht abgeschickt ist.
describe('Warenkorb-Beschriftung', () => {
  it('„In die Liste“ sammelt nur, erst „Anforderung abschicken“ sendet', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    expect(screen.getByRole('heading', { name: /noch nicht abgeschickt/ })).toBeInTheDocument();
    expect(screen.getByText(/Erst mit „Anforderung abschicken“ geht sie an die Verwaltung/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ })).toBeInTheDocument();
  });

  // Analyse 03.10.2026, Paket 2 — der Knopf klebt am Telefon über der Reiterleiste;
  // seit dem Umbau (Linie „Lot“, E5) als Warenkorb-Leiste im Daumenbereich.
  it('steht in der Warenkorb-Leiste und nennt Zahl und Baustelle', async () => {
    zeige();
    await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ });
    // Leerer Korb: keine Leiste.
    expect(screen.queryByRole('region', { name: 'Warenkorb' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    const leiste = screen.getByRole('region', { name: 'Warenkorb' });
    expect(leiste).toHaveClass('korb');
    expect(within(leiste).getByText('1 Artikel ohne Baustelle')).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Anforderung (1) abschicken' })).toBeInTheDocument();
    expect(within(leiste).getByRole('button', { name: 'Liste leeren' })).toBeInTheDocument();
    // „noch nicht abgeschickt“ ist ein Zustand der Linie, mit dem Zeichen für „offen“ (E47).
    expect(within(leiste).getByText('noch nicht abgeschickt')).toHaveClass('stand', 'stand-offen');
  });

  it('nennt den Kunden der Baustelle — und „2 Baustellen“, wenn gemischt', async () => {
    zeige();
    await userEvent.selectOptions(await baustelleFeld(), '2026-042');
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    const leiste = screen.getByRole('region', { name: 'Warenkorb' });
    expect(within(leiste).getByText('1 Artikel für Familie Huber')).toBeInTheDocument();
    await userEvent.selectOptions(await baustelleFeld(), '2026-099');
    await userEvent.click(screen.getByRole('button', { name: /Dichtung .* in die Liste/ }));
    expect(within(leiste).getByText('2 Artikel für 2 Baustellen')).toBeInTheDocument();
  });

  it('meldet einen Teilfehler an der Leiste, an der abgeschickt wurde', async () => {
    anlegen.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));
    const leiste = screen.getByRole('region', { name: 'Warenkorb' });
    expect(await within(leiste).findByRole('alert')).toHaveTextContent(/konnten nicht gesendet werden/);
  });
});

// 04.11.2026 — „Zur Anforderung“ brach am Telefon mitten im Wort um; der Knopf
// heißt jetzt „In die Liste“, und was schon darin liegt, steht unter ihm statt
// als „×2“ davor (dort schob es den Knopf beim ersten Tippen in die nächste
// Zeile). Gezählt wird aus der Liste selbst. Die Lage misst der Browserweg
// in `tests/durchklick/materialAnfordern.spec.ts`.
describe('Was schon in der Liste liegt', () => {
  it('der Knopf heißt „In die Liste“; darunter steht die Menge aus der Liste, „Liste leeren“ nimmt sie weg', async () => {
    zeige();
    const knopf = await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ });
    // Seit E74 der Petrol-Kreis: kein Wort im Knopf, der Name als Hinweis beim Darüberfahren.
    expect(knopf).toHaveClass('symbol-rund');
    expect(knopf).toHaveTextContent(/^$/);
    expect(knopf).toHaveAttribute('title', 'Kupferrohr 15mm in die Liste');
    expect(screen.queryByText(/ in der Liste$/)).toBeNull();
    await userEvent.click(knopf);
    await userEvent.click(knopf);
    expect(screen.getByText('2 m in der Liste')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Liste leeren' }));
    // Vorher blieb „×2“ am Artikel stehen, obwohl die Liste leer war.
    expect(screen.queryByText(/ in der Liste$/)).toBeNull();
  });

  it('steht nach einem Neustart wieder da', async () => {
    localStorage.setItem(
      'senklot.warenkorb:perl:u1',
      JSON.stringify([
        { materialId: 'm1', materialName: 'Kupferrohr 15mm', quantity: 7, projectNumber: '2026-042', note: '' },
        { materialId: 'm1', materialName: 'Kupferrohr 15mm', quantity: 2.5, projectNumber: '2026-099', note: '' },
      ]),
    );
    zeige();
    // Zwei Baustellen, ein Artikel: am Artikel steht, was insgesamt darin liegt.
    expect(await screen.findByText('9,5 m in der Liste')).toBeInTheDocument();
  });

  it('ist nach dem Abschicken weg', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    expect(screen.getByText('1 m in der Liste')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Anforderung \(\d+\) abschicken$/ }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/ in der Liste$/)).toBeNull());
  });

  it('Gegenprobe: ein anderer Artikel und ein freier Eintrag zählen beim Kupferrohr nicht mit', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Dichtung .* in die Liste/ }));
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Eckventil');
    await userEvent.click(screen.getByRole('button', { name: 'Eckventil in die Liste' }));
    expect(screen.getByText('1 Stk in der Liste')).toBeInTheDocument();
    expect(screen.getAllByText(/ in der Liste$/)).toHaveLength(1);
  });
});

// Linie „Lot“, E5 — „Meine Anforderungen“ unter dem Katalog, Verweis der Startseite.
describe('Meine Anforderungen auf derselben Seite', () => {
  const eigeneZwei = () => [
    { id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
      status: 'Offen', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
    { id: 'o2', companyId: 'perl', materialName: 'Dichtung 1/2"', quantity: 5,
      status: 'Abholbereit', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>,
  ];

  it('stehen ohne Reiterwechsel unter dem Katalog, mit Stand', async () => {
    eigene = eigeneZwei();
    zeige();
    const meine = await screen.findByRole('region', { name: 'Meine Anforderungen' });
    expect(within(meine).getByRole('heading', { name: 'Meine Anforderungen (2)' })).toBeInTheDocument();
    expect(within(meine).getByText('Abholbereit')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('der Verweis „nur abholbereit“ filtert und springt hierher', async () => {
    const rollen = vi.fn();
    Element.prototype.scrollIntoView = rollen;
    eigene = eigeneZwei();
    zeige('/material?reiter=meine&status=Abholbereit');
    const meine = await screen.findByRole('region', { name: 'Meine Anforderungen' });
    expect(within(meine).getByText(/nur abholbereite Anforderungen/)).toBeInTheDocument();
    expect(within(meine).queryByText('Kupferrohr 15mm')).toBeNull();
    expect(within(meine).getByText('Dichtung 1/2"')).toBeInTheDocument();
    await waitFor(() => expect(rollen).toHaveBeenCalled());
  });

  it('Gegenprobe: ohne Verweis kein Sprung und kein Filter', async () => {
    const rollen = vi.fn();
    Element.prototype.scrollIntoView = rollen;
    eigene = eigeneZwei();
    zeige();
    const meine = await screen.findByRole('region', { name: 'Meine Anforderungen' });
    expect(within(meine).getByText('Kupferrohr 15mm')).toBeInTheDocument();
    expect(rollen).not.toHaveBeenCalled();
  });
});

/*
  DIE RÜCKGABE STEHT SICHTBAR (20.10.2026, Auftrag „Retoure zu dezent“) —
  statt im „⋯“ des Seitenkopfs, wo sie niemand fand.
*/
describe('Material anfordern — Rückgabe sichtbar', () => {
  it('„Material zurückgeben“ steht als Zeile auf der Seite, das „⋯“ entfällt', async () => {
    zeige();
    expect(await screen.findByRole('button', { name: /^Material zurückgeben/ })).toBeInTheDocument();
    expect(screen.getByText(/Übrig von der Baustelle\? Zurück ans Lager/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weitere Aktionen für Material' })).toBeNull();
  });

  it('aus der Rüstliste (?retoure=1&baustelle=…) öffnet sie gleich, die Baustelle vorbelegt', async () => {
    zeige('/material?retoure=1&baustelle=2026-042');
    const fenster = await screen.findByRole('dialog', { name: 'Material zurückgeben' });
    const feld = within(fenster).getByRole('combobox', { name: /Von welcher Baustelle/ });
    await waitFor(() => expect(feld).toHaveValue('2026-042'));
    await userEvent.type(within(fenster).getByRole('searchbox', { name: /^Material/ }), 'Kupfer');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    await waitFor(() => expect(retoure).toHaveBeenCalledTimes(1));
    expect(retoure.mock.calls[0][1]).toMatchObject({ projectNumber: '2026-042', condition: 'neu', userId: 'u1' });
  });

  it('Gleichbleiben: ohne Adresse bleibt das Fenster zu', async () => {
    zeige();
    await screen.findByRole('button', { name: /^Material zurückgeben/ });
    expect(screen.queryByRole('dialog', { name: 'Material zurückgeben' })).toBeNull();
  });
});

/*
  E72 (09.11.2026) — gemessen in der Vorschau: „−“ und „+“ standen als graue
  Zeichen ohne Rahmen neben der Menge, die Suche war ein beschriftetes Feld
  ohne Lupe über die ganze Breite, die Baustellenwahl 1128 px breit, „Abgeholt“
  in jeder Zeile gefüllt, und die Knöpfe des Warenkorbs brachen bei 390 px um.
  Gegenprobe: mit dem Stand davor sind diese Prüfungen rot.
*/
describe('Material anfordern — Knöpfe und Fluchten der Linie (E72)', () => {
  /*
    E74 (10.11.2026): − Feld + tragen EINEN Rahmen mit Trennstrichen statt
    dreier Kästchen, und „In die Liste“ ist der Petrol-Kreis daneben.
    Gegenprobe: mit dem Stand E72 (drei gerahmte Kästchen, Wortknopf) rot.
  */
  it('Minus, Menge und Plus sind eine gerahmte Einheit, daneben der Petrol-Kreis „In die Liste“', async () => {
    zeige();
    const minus = await screen.findByRole('button', { name: 'Menge für Kupferrohr 15mm verringern' });
    const plus = screen.getByRole('button', { name: 'Menge für Kupferrohr 15mm erhöhen' });
    const feld = screen.getByRole('textbox', { name: /Menge m für Kupferrohr 15mm/ });
    const gruppe = feld.closest('.mengen-wahl') as HTMLElement;
    expect(gruppe).not.toBeNull();
    for (const k of [minus, plus]) {
      expect(k.parentElement).toBe(gruppe);
      expect(k).toHaveClass('mengen-schritt');
      expect(k).not.toHaveClass('border');
    }
    expect(feld).toHaveClass('mengen-feld');
    expect(feld).not.toHaveClass('border');
    const liste = screen.getByRole('button', { name: 'Kupferrohr 15mm in die Liste' });
    expect(liste).toHaveClass('symbol-rund');
    expect(gruppe.contains(liste)).toBe(false);
  });

  it('eine ungültige Menge färbt den ganzen Rahmen und sperrt den Kreis', async () => {
    zeige();
    const feld = await screen.findByRole('textbox', { name: /Menge m für Kupferrohr 15mm/ });
    await userEvent.clear(feld);
    await userEvent.type(feld, 'abc');
    expect(feld.closest('.mengen-wahl')).toHaveClass('mengen-wahl-fehler');
    expect(screen.getByRole('button', { name: 'Kupferrohr 15mm in die Liste' })).toBeDisabled();
  });

  it('die Suche steht als Listenleiste mit Lupe im Blatt „Katalog“', async () => {
    zeige();
    const suche = await screen.findByRole('searchbox', { name: 'Suche' });
    expect(suche.closest('.listenleiste-suche')).not.toBeNull();
    expect(suche.closest('section')).toHaveTextContent(/^Katalog/);
  });

  it('die Baustellenwahl steht in einem Formular von höchstens 560 px', async () => {
    zeige();
    expect((await baustelleFeld()).closest('.formular')).not.toBeNull();
  });

  it('„Abgeholt“ ist in der Zeile ein Zweitknopf, kein gefüllter', async () => {
    eigene = [{ id: 'o1', companyId: 'perl', materialName: 'Kupferrohr 15mm', quantity: 2,
      status: 'Offen', transactionType: 'order', userId: 'u1' } as WithId<MaterialOrder>];
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Abgeholt' });
    expect(knopf).toHaveClass('border-line-strong');
    expect(knopf).not.toHaveClass('bg-brand');
  });

  it('der Warenkorb zeigt kurz „Leeren“; die Vorlesehilfe hört weiter „Liste leeren“', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Kupferrohr 15mm in die Liste/ }));
    const leiste = screen.getByRole('region', { name: 'Warenkorb' });
    expect(within(leiste).getByRole('button', { name: 'Liste leeren' })).toHaveTextContent(/^Leeren$/);
    // Gleich geblieben: das Abschicken heißt, wie es hieß.
    expect(within(leiste).getByRole('button', { name: 'Anforderung (1) abschicken' })).toHaveTextContent('Anforderung (1) abschicken');
  });
});


describe('Die Baustelle ist schon gewählt (B2/B3, E83)', () => {
  const feldWert = async () => (await baustelleFeld()) as HTMLSelectElement;

  it('vom Einsatz aus kommt sie aus der Adresse — ohne Satz darunter', async () => {
    heuteEinsaetze = [{ projectNumber: '2026-042' }];
    zeige('/material?projekt=2026-099');
    await waitFor(async () => expect((await feldWert()).value).toBe('2026-099'));
    expect(screen.queryByText(/^Vorbelegt/)).toBeNull();
  });

  it('sonst nach dem Einsatz von heute, und es steht da, woher', async () => {
    heuteEinsaetze = [{ projectNumber: '2026-042' }];
    zeige();
    await waitFor(async () => expect((await feldWert()).value).toBe('2026-042'));
    expect(screen.getByText('Vorbelegt nach deinem Einsatz.')).toBeInTheDocument();
  });

  it('der laufende Arbeitstag geht vor dem Einsatz', async () => {
    heuteEinsaetze = [{ projectNumber: '2026-042' }];
    laufenderTag = { stand: 'laeuft', segmente: [{ art: 'arbeit', baustelle: '2026-099', von: '2026-11-12T07:00:00Z' }] };
    zeige();
    await waitFor(async () => expect((await feldWert()).value).toBe('2026-099'));
    expect(screen.getByText('Vorbelegt vom laufenden Arbeitstag.')).toBeInTheDocument();
  });

  it('ohne Einsatz die zuletzt benutzte — gemerkt beim Abschicken', async () => {
    localStorage.setItem('senklot:zuletzt-baustelle:perl:u1', '2026-099');
    zeige();
    await waitFor(async () => expect((await feldWert()).value).toBe('2026-099'));
    expect(screen.getByText('Vorbelegt: zuletzt benutzt.')).toBeInTheDocument();
  });

  it('weiß das Gerät nichts, kommt „zuletzt“ aus der letzten eigenen Buchung', async () => {
    letzteBuchung = '2026-099';
    zeige();
    await waitFor(async () => expect((await feldWert()).value).toBe('2026-099'));
    expect(screen.getByText('Vorbelegt: zuletzt benutzt.')).toBeInTheDocument();
  });

  it('von Hand gewählt: der Satz fällt weg, und nichts überschreibt die Wahl', async () => {
    heuteEinsaetze = [{ projectNumber: '2026-042' }];
    zeige();
    const feld = await feldWert();
    await waitFor(() => expect(feld.value).toBe('2026-042'));
    await userEvent.selectOptions(feld, '2026-099');
    expect(feld.value).toBe('2026-099');
    expect(screen.queryByText(/^Vorbelegt/)).toBeNull();
  });

  it('Gegenprobe: ohne Einsatz, Timer und zuletzt bleibt das Feld leer', async () => {
    zeige();
    const feld = await feldWert();
    // Die Vorbelegung hätte nach dem Laden der Einsätze gegriffen — sie greift nicht.
    await new Promise((r) => setTimeout(r, 50));
    expect(feld.value).toBe('');
    expect(screen.queryByText(/^Vorbelegt/)).toBeNull();
  });
});
