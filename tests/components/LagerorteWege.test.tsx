import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Fahrzeug, Lagerbestand, Lagerort } from '@/types';

/**
 * Lagerorte in den Wegen des Monteurs und der Pflege (M04a, E10) — Ansicht:
 *
 *  - Rüstliste: Quellort wählbar (Hauptlager oder Fahrzeug), vorgeschlagen
 *    das eigene Standardfahrzeug; der Haken bucht von dort.
 *  - „Mein Fahrzeug“: der Bestand im eigenen Fahrzeug, nur lesen; Rücklagern
 *    nur, wenn der Betrieb es erlaubt.
 *  - Fahrzeuge: anlegen, Kennzeichen aus Buchungen als Vorschlag, die
 *    Erlaubnis zum Rücklagern nur für die Geschäftsführung.
 *  - Retoure: „neu“ zurück in das eigene Fahrzeug.
 *
 * Gegenprobe: ohne die Änderungen sind alle Fälle rot außer den Erhaltungen
 * (Rüstliste ohne Fahrzeug, Retoure ohne Ort), die vorher wie nachher grün
 * sind.
 */

const HAUPT: Lagerort = { id: 'haupt', companyId: 'perl', art: 'haupt', bezeichnung: 'Hauptlager', aktiv: true };
const BUS: Lagerort = { id: 'ort-bus', companyId: 'perl', art: 'fahrzeug', bezeichnung: 'W-123A', fahrzeugId: 'f1', aktiv: true };
const BUS2: Lagerort = { id: 'ort-bus2', companyId: 'perl', art: 'fahrzeug', bezeichnung: 'W-999Z', fahrzeugId: 'f2', aktiv: true };
let orte: Lagerort[] = [];
let fahrzeuge: Fahrzeug[] = [];
let amOrt: Lagerbestand[] = [];

const umlagern = vi.fn();
const fahrzeugSpeichern = vi.fn(async () => 'neu');
vi.mock('@/lib/db/lagerorte', () => ({
  listLagerorte: async () => orte,
  listFahrzeuge: async () => fahrzeuge,
  bestandAmOrt: async () => amOrt,
  bestandBeobachten: () => () => undefined,
  umlagern: (...a: unknown[]) => umlagern(...a),
  fahrzeugSpeichern: (...a: unknown[]) => fahrzeugSpeichern(...(a as [])),
  kennzeichenAusBuchungen: async () => [{ kennzeichen: 'WZ-4711B', buchungen: 12, zuletzt: '2026-11-03' }],
}));
vi.mock('@/lib/db/materials', () => ({
  katalogNachIds: async () => [{ id: 'm1', companyId: 'perl', name: 'Kupferrohr 15mm', unit: 'm', stock: 20 }],
  sucheKatalog: async () => [{ id: 'm1', companyId: 'perl', name: 'Kupferrohr 15mm', unit: 'm', stock: 20 }],
}));
const umschalten = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 4);
const umschaltenAusOrt = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 4);
vi.mock('@/lib/db/einsatzMaterial', () => ({
  ladenUmschalten: (...a: unknown[]) => umschalten(...a),
  ladenUmschaltenAusOrt: (...a: unknown[]) => umschaltenAusOrt(...a),
}));
const createReturn = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'r1');
const createReturnInOrt = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'r1');
vi.mock('@/lib/db/materialOrders', () => ({
  createReturn: (...a: unknown[]) => createReturn(...a),
  createReturnInOrt: (...a: unknown[]) => createReturnInOrt(...a),
}));
vi.mock('@/lib/db/users', () => ({
  listUsers: async () => [{ uid: 'max', name: 'Max Monteur', active: true }, { uid: 'tom', name: 'Tom', active: true }],
}));
const updateCompany = vi.fn(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany: (...a: unknown[]) => updateCompany(...(a as [])) }));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

type Rolle = 'Mitarbeiter' | 'Verwaltung' | 'Geschäftsführung';
let rolle: Rolle = 'Mitarbeiter';
let rueckgabe = false;
let module: Record<string, boolean> | undefined;
const reloadCompany = vi.fn(async () => undefined);
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'max', name: 'Max Monteur', companyId: 'perl', role: rolle },
    company: { id: 'perl', name: 'Perl', modules: module, lagerRueckgabeFahrer: rueckgabe },
    reloadCompany,
  }),
}));

const { default: RuestlisteAbhaken } = await import('@/features/assignments/RuestlisteAbhaken');
const { default: MeinFahrzeug } = await import('@/features/orders/MeinFahrzeug');
const { default: FahrzeugeView } = await import('@/features/settings/FahrzeugeView');
const { default: RetoureFenster } = await import('@/features/orders/RetoureFenster');

const mit = (el: React.ReactNode) =>
  render(<MemoryRouter><ToastProvider>{el}</ToastProvider></MemoryRouter>);

const POS = [{ id: 'a', name: 'Kupferrohr 15', menge: 10, einheit: 'm', materialId: 'm1' }];

beforeEach(() => {
  rolle = 'Mitarbeiter';
  rueckgabe = false;
  module = undefined;
  orte = [HAUPT, BUS, BUS2];
  fahrzeuge = [
    { id: 'f1', companyId: 'perl', kennzeichen: 'W-123A', standardfahrerUid: 'max', aktiv: true },
    { id: 'f2', companyId: 'perl', kennzeichen: 'W-999Z', standardfahrerUid: 'tom', aktiv: true },
  ];
  amOrt = [{ lagerortId: 'ort-bus', materialId: 'm1', companyId: 'perl', menge: 6, revision: 1 }];
  umschalten.mockClear();
  umschaltenAusOrt.mockClear();
  umlagern.mockReset();
  fahrzeugSpeichern.mockClear();
  createReturn.mockClear();
  createReturnInOrt.mockClear();
  updateCompany.mockClear();
});

describe('Rüstliste aus dem Fahrzeug', () => {
  it('schlägt das eigene Fahrzeug vor und bucht den Haken von dort', async () => {
    mit(<RuestlisteAbhaken date="2026-11-06" projectNumber="PR-1" positionen={POS} geladen={{}} eingeteilt={['max']} />);
    const quelle = await screen.findByLabelText('Abbuchen aus');
    expect(quelle).toHaveValue('ort-bus');
    // Nur Hauptlager und das eigene Fahrzeug — Toms Fahrzeug fährt kein Eingeteilter.
    expect(within(quelle).getAllByRole('option').map((o) => o.textContent)).toEqual(['Hauptlager', 'Fahrzeug W-123A']);
    await userEvent.click(screen.getByLabelText(/Kupferrohr 15/));
    await waitFor(() => expect(umschaltenAusOrt).toHaveBeenCalledWith('perl', '2026-11-06', 'PR-1', 'a', true, 'Max Monteur', 'ort-bus'));
    expect(umschalten).not.toHaveBeenCalled();
    expect(await screen.findByText('4 m abgebucht — Fahrzeug W-123A')).toBeInTheDocument();
  });

  it('aus dem Hauptlager gewählt: derselbe Aufruf wie vor den Lagerorten', async () => {
    mit(<RuestlisteAbhaken date="2026-11-06" projectNumber="PR-1" positionen={POS} geladen={{}} eingeteilt={['max']} />);
    await userEvent.selectOptions(await screen.findByLabelText('Abbuchen aus'), '');
    await userEvent.click(screen.getByLabelText(/Kupferrohr 15/));
    await waitFor(() => expect(umschalten).toHaveBeenCalledWith('perl', '2026-11-06', 'PR-1', 'a', true, 'Max Monteur'));
    expect(umschaltenAusOrt).not.toHaveBeenCalled();
  });

  it('nennt den Ort am eingeladenen Eintrag', async () => {
    const jetzt = Date.now();
    mit(<RuestlisteAbhaken date="2026-11-06" projectNumber="PR-1" positionen={POS}
      geladen={{ a: { von: 'Max', am: jetzt, gebucht: 4, material: 'm1', ort: 'ort-bus' } }} />);
    expect(await screen.findByText(/abgebucht aus Fahrzeug W-123A/)).toBeInTheDocument();
  });

  it('Modul aus: keine Wahl, der Haken bucht wie bisher', async () => {
    module = { 'material.lagerorte_fahrzeuglager': false };
    mit(<RuestlisteAbhaken date="2026-11-06" projectNumber="PR-1" positionen={POS} geladen={{}} eingeteilt={['max']} />);
    await userEvent.click(screen.getByLabelText(/Kupferrohr 15/));
    await waitFor(() => expect(umschalten).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Abbuchen aus')).not.toBeInTheDocument();
  });
});

describe('Mein Fahrzeug', () => {
  it('zeigt dem Standardfahrer den Bestand — nur zum Lesen, solange der Betrieb das Rücklagern nicht erlaubt', async () => {
    mit(<MeinFahrzeug />);
    const karte = (await screen.findByText('Mein Fahrzeug W-123A')).closest('section, div') as HTMLElement;
    expect(await screen.findByText('Kupferrohr 15mm')).toBeInTheDocument();
    expect(screen.getByText('6 m')).toBeInTheDocument();
    expect(within(karte.ownerDocument.body).queryByRole('button', { name: /zurücklagern/ })).not.toBeInTheDocument();
  });

  it('mit Erlaubnis: lagert ins Hauptlager zurück — Quelle und Ziel stehen fest', async () => {
    rueckgabe = true;
    umlagern.mockResolvedValue({ art: 'ausgefuehrt', vorgang: 'v', bestandVon: 4, bestandNach: 22 });
    mit(<MeinFahrzeug />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm zurücklagern' }));
    const dialog = await screen.findByRole('dialog', { name: /^Zurücklagern: / });
    expect(within(dialog).queryByLabelText('Von')).not.toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/Menge/));
    await userEvent.type(within(dialog).getByLabelText(/Menge/), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zurücklagern' }));
    await waitFor(() => expect(umlagern).toHaveBeenCalledTimes(1));
    expect(umlagern.mock.calls[0][0]).toMatchObject({ artikelId: 'm1', vonId: 'ort-bus', nachId: null, menge: 2, erwartetVon: 6 });
  });

  it('ohne eigenes Fahrzeug steht nichts da', async () => {
    fahrzeuge = fahrzeuge.map((f) => ({ ...f, standardfahrerUid: 'tom' }));
    const { container } = mit(<MeinFahrzeug />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});

describe('Fahrzeuge (Einstellungen)', () => {
  it('legt ein Fahrzeug aus einem Kennzeichen der Buchungen an — nur als Vorschlag übernommen', async () => {
    rolle = 'Verwaltung';
    mit(<FahrzeugeView />);
    expect(await screen.findByText('W-123A')).toBeInTheDocument();
    expect(screen.getByText('Standardfahrer: Max Monteur')).toBeInTheDocument();
    const vorschlag = (await screen.findByText('WZ-4711B')).closest('li') as HTMLElement;
    expect(within(vorschlag).getByText('12 Buchungen · zuletzt 03.11.2026')).toBeInTheDocument();
    await userEvent.click(within(vorschlag).getByRole('button', { name: 'Als Fahrzeug anlegen' }));
    expect(await screen.findByRole('textbox', { name: /^Kennzeichen/ })).toHaveValue('WZ-4711B');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Standardfahrer/ }), 'tom');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(fahrzeugSpeichern).toHaveBeenCalledWith({
      id: undefined, kennzeichen: 'WZ-4711B', bezeichnung: null, standardfahrerUid: 'tom', aktiv: true,
    }));
  });

  it('das Rücklagern durch den Fahrer erlaubt nur die Geschäftsführung', async () => {
    rolle = 'Verwaltung';
    const { unmount } = mit(<FahrzeugeView />);
    expect(await screen.findByLabelText(/lagert aus seinem Fahrzeug selbst/)).toBeDisabled();
    unmount();
    rolle = 'Geschäftsführung';
    mit(<FahrzeugeView />);
    await userEvent.click(await screen.findByLabelText(/lagert aus seinem Fahrzeug selbst/));
    await userEvent.click(screen.getAllByRole('button', { name: 'Speichern' })[0]);
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', { lagerRueckgabeFahrer: true }));
  });
});

describe('Retoure in das eigene Fahrzeug', () => {
  async function erfassen(ziel?: string) {
    mit(<RetoureFenster offen onClose={() => undefined} companyId="perl" user={{ uid: 'max', name: 'Max Monteur' }} />);
    await userEvent.type(screen.getByLabelText('Material'), 'Kupfer');
    await userEvent.click(await screen.findByRole('button', { name: 'Kupferrohr 15mm zurückgeben' }));
    if (ziel !== undefined) await userEvent.selectOptions(await screen.findByLabelText('Zurück in'), ziel);
    await userEvent.click(screen.getByRole('button', { name: 'Retoure erfassen' }));
  }

  it('„neu“ in das eigene Fahrzeug — der Monteur wählt nur dieses', async () => {
    await erfassen('ort-bus');
    await waitFor(() => expect(createReturnInOrt).toHaveBeenCalledTimes(1));
    expect(createReturnInOrt.mock.calls[0][2]).toBe('ort-bus');
    expect(createReturn).not.toHaveBeenCalled();
  });

  it('Erhaltung: ins Hauptlager derselbe Aufruf wie bisher', async () => {
    await erfassen();
    await waitFor(() => expect(createReturn).toHaveBeenCalledTimes(1));
    expect(createReturn.mock.calls[0]).toHaveLength(2);
    expect(createReturnInOrt).not.toHaveBeenCalled();
  });
});
