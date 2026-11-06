import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { WorkSheet } from '@/types';

/**
 * DER PAPIERKORB (M01d, U06): verworfene Angebote und Handwerksscheine,
 * nach Art gruppiert — wiederherstellen, endgültig löschen mit Rückfrage,
 * über der Frist ein Hinweis und „Abgelaufene endgültig löschen“ für die
 * Spitze, leer ein Satz. Die Frist pflegt die Spitze auf derselben Seite.
 *
 * Gegenprobe: ohne `PapierkorbView.tsx` gibt es nichts zu zeigen — rot.
 */

const TAG = 86_400_000;
const JETZT = Date.now();

const ANGEBOT = {
  id: 'q1', quoteNumber: 'AN-2026-0042', customerName: 'Familie Huber', address: 'Hauptplatz 1, 8010 Graz',
  quoteDate: '2026-11-01', totalBrutto: 1200, status: 'Verworfen' as const,
  verworfenAm: JETZT - 40 * TAG, verworfenVonName: 'Carla Chefin',
};
const SCHEIN = {
  id: 's1', companyId: 'perl', projectNumber: 'B-2026-0007', customerName: 'Familie Gruber', datum: '2026-10-01',
  status: 'Verworfen', abrechnung: 'Regie', erstelltVonUid: 'm1', erstelltVonName: 'Max Monteur',
  verworfenVonName: 'Max Monteur', verworfenAm: null,
  zeiten: [{ datum: '2026-10-01', mitarbeiter: 'Max', minuten: 90 }], material: [{ name: 'Dichtung', menge: 1 }],
  fotos: [{ pfad: 'scheine/perl/s1/a.jpg', hash: 'h', bytes: 1, geraetZeit: 1 }],
} as unknown as WorkSheet & { id: string };

let angebote: typeof ANGEBOT[] = [];
let scheine: (WorkSheet & { id: string })[] = [];
const zaehleAngebote = vi.fn<(c: string, bis?: string) => Promise<number>>(async () => angebote.length);
const zaehleScheine = vi.fn<(c: string, bis?: string) => Promise<number>>(async () => scheine.length);
const updateQuote = vi.fn(async () => undefined);
const deleteQuote = vi.fn(async () => undefined);
const restoreWorkSheetDraft = vi.fn(async () => undefined);
const deleteWorkSheetDraft = vi.fn(async () => undefined);
const abgelaufeneLoeschen = vi.fn(async () => ({ angebote: 1, scheine: 1, fehler: null }));
const updateCompany = vi.fn<(id: string, d: Record<string, unknown>) => Promise<void>>(async () => undefined);

vi.mock('@/lib/db/quotes', () => ({
  listVerworfeneAngebote: vi.fn(async () => angebote),
  zaehleVerworfeneAngebote: (c: string, b?: string) => zaehleAngebote(c, b),
  updateQuote: (...a: unknown[]) => updateQuote(...(a as [])),
  deleteQuote: (...a: unknown[]) => deleteQuote(...(a as [])),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listVerworfeneScheine: vi.fn(async () => scheine),
  zaehleVerworfeneScheine: (c: string, b?: string) => zaehleScheine(c, b),
  restoreWorkSheetDraft: (...a: unknown[]) => restoreWorkSheetDraft(...(a as [])),
  deleteWorkSheetDraft: (...a: unknown[]) => deleteWorkSheetDraft(...(a as [])),
}));
vi.mock('@/features/papierkorb/papierkorbLeeren', () => ({
  abgelaufeneLoeschen: (...a: unknown[]) => abgelaufeneLoeschen(...(a as [])),
}));
vi.mock('@/lib/db/company', () => ({ updateCompany: (id: string, d: Record<string, unknown>) => updateCompany(id, d) }));

let rolle = 'Geschäftsführung';
let firma: Record<string, unknown> = { id: 'perl', name: 'Perl' };
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'gf', companyId: 'perl', role: rolle, name: 'Carla Chefin' },
    company: firma,
    reloadCompany: vi.fn(async () => undefined),
  }),
}));
let module: Record<string, boolean> = { angebote: true, scheine: true };
vi.mock('@/lib/useModule', () => ({ useModul: (id: string) => module[id] !== false }));

const { default: PapierkorbView } = await import('@/features/papierkorb/PapierkorbView');

const zeige = () => render(<MemoryRouter><ToastProvider><PapierkorbView /></ToastProvider></MemoryRouter>);

beforeEach(() => {
  angebote = [ANGEBOT];
  scheine = [SCHEIN];
  rolle = 'Geschäftsführung';
  firma = { id: 'perl', name: 'Perl' };
  module = { angebote: true, scheine: true };
  for (const f of [zaehleAngebote, updateQuote, deleteQuote, restoreWorkSheetDraft, deleteWorkSheetDraft, abgelaufeneLoeschen, updateCompany]) f.mockClear();
  zaehleScheine.mockReset();
  zaehleScheine.mockImplementation(async () => scheine.length);
});

describe('Der Papierkorb', () => {
  it('nach Art gruppiert: Nummer, Kunde, Baustelle, verworfen von und am, seit wann', async () => {
    zeige();
    const angebotsZeile = (await screen.findByText('Familie Huber')).closest('li')!;
    expect(screen.getByRole('heading', { name: /Angebote/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Handwerksscheine/ })).toBeInTheDocument();
    expect(angebotsZeile).toHaveTextContent('AN-2026-0042');
    expect(angebotsZeile).toHaveTextContent(/verworfen von Carla Chefin am .* · seit 40 Tagen/);
    expect(within(angebotsZeile).getByRole('link', { name: /Familie Huber/ })).toHaveAttribute('href', '/quotes/q1');
    const scheinZeile = screen.getByText('Familie Gruber').closest('li')!;
    expect(scheinZeile).toHaveTextContent('B-2026-0007');
    // Altdaten: der Zeitpunkt ist unbekannt — und wird nicht geraten.
    expect(scheinZeile).toHaveTextContent('verworfen von Max Monteur vor dem 06.11.2026 · Zeitpunkt unbekannt');
    expect(within(scheinZeile).getByRole('link', { name: /Familie Gruber/ })).toHaveAttribute('href', '/worksheets?markiert=s1');
    // Ohne Frist: kein „über der Frist“, kein Hinweis.
    expect(screen.queryByText('über der Frist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abgelaufene endgültig löschen' })).toBeNull();
  });

  it('wiederherstellen: das Angebot wird wieder Entwurf, der Schein über seinen Rückweg', async () => {
    const nutzer = userEvent.setup();
    zeige();
    const angebotsZeile = (await screen.findByText('Familie Huber')).closest('li')!;
    await nutzer.click(within(angebotsZeile).getByRole('button', { name: 'Wiederherstellen' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith('q1', { status: 'Entwurf' }));
    const scheinZeile = (await screen.findByText('Familie Gruber')).closest('li')!;
    await nutzer.click(within(scheinZeile).getByRole('button', { name: 'Wiederherstellen' }));
    await waitFor(() => expect(restoreWorkSheetDraft).toHaveBeenCalledWith('s1'));
    expect(deleteQuote).not.toHaveBeenCalled();
    expect(deleteWorkSheetDraft).not.toHaveBeenCalled();
  });

  it('endgültig löschen nur nach Rückfrage, die sagt, dass es nicht umkehrbar ist — beim Schein samt Fotos', async () => {
    const nutzer = userEvent.setup();
    zeige();
    const angebotsZeile = (await screen.findByText('Familie Huber')).closest('li')!;
    await nutzer.click(within(angebotsZeile).getByRole('button', { name: 'Endgültig löschen' }));
    let dialog = await screen.findByRole('dialog', { name: 'Angebot endgültig löschen' });
    expect(dialog).toHaveTextContent(/lässt sich nicht rückgängig machen/);
    expect(deleteQuote).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(deleteQuote).toHaveBeenCalledWith('q1'));

    const scheinZeile = (await screen.findByText('Familie Gruber')).closest('li')!;
    await nutzer.click(within(scheinZeile).getByRole('button', { name: 'Endgültig löschen' }));
    dialog = await screen.findByRole('dialog', { name: 'Verworfenen Entwurf endgültig löschen' });
    expect(dialog).toHaveTextContent(/1 Foto/);
    expect(dialog).toHaveTextContent(/samt Zeiten, Material und Fotos endgültig gelöscht und lässt sich nicht zurückholen/);
    await nutzer.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(deleteWorkSheetDraft).toHaveBeenCalledWith('perl', 's1', ['scheine/perl/s1/a.jpg']));
  });

  it('über der Frist: Hinweis mit Anzahl, und die Spitze leert nach Rückfrage mit einem Handgriff', async () => {
    firma = { id: 'perl', name: 'Perl', papierkorbFristTage: 30 };
    scheine = [SCHEIN, { ...SCHEIN, id: 's2', customerName: 'Familie Jung', verworfenAm: JETZT - 2 * TAG }];
    zaehleScheine.mockImplementation(async (_c: string, bis?: string) => (bis ? 0 : 2));
    const nutzer = userEvent.setup();
    zeige();
    // Gezählt auf dem Server: 1 Angebot + 0 Scheine (die Attrappe sagt, was der Server sagte).
    expect(await screen.findByText(/1 Entwurf liegt länger als 30 Tage im Papierkorb/)).toBeInTheDocument();
    // Je Zeile: das Angebot nach 40 Tagen ist darüber, der Schein von vorgestern nicht.
    expect(within(screen.getByText('Familie Huber').closest('li')!).getByText('über der Frist')).toBeInTheDocument();
    expect(within(screen.getByText('Familie Jung').closest('li')!).queryByText('über der Frist')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Abgelaufene endgültig löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abgelaufene endgültig löschen?' });
    expect(dialog).toHaveTextContent(/nicht rückgängig/);
    expect(abgelaufeneLoeschen).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: '1 Entwurf löschen' }));
    await waitFor(() => expect(abgelaufeneLoeschen).toHaveBeenCalledTimes(1));
    const [betrieb, bis, was] = abgelaufeneLoeschen.mock.calls[0] as unknown as [string, string, unknown];
    expect(betrieb).toBe('perl');
    expect(Date.now() - Date.parse(bis)).toBeGreaterThanOrEqual(30 * TAG);
    expect(was).toEqual({ angebote: true, scheine: true });
  });

  it('die Projektleitung sieht den Hinweis, leert aber nicht und pflegt keine Frist', async () => {
    rolle = 'Projektleiter';
    firma = { id: 'perl', name: 'Perl', papierkorbFristTage: 30 };
    zeige();
    expect(await screen.findByText(/länger als 30 Tage im Papierkorb/)).toBeInTheDocument();
    expect(screen.getByText(/Leeren kann sie die Geschäftsführung/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abgelaufene endgültig löschen' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Hinweis nach/ })).toBeNull();
    // Wiederherstellen und löschen kann sie wie bisher (Führung).
    expect(screen.getAllByRole('button', { name: 'Wiederherstellen' })).toHaveLength(2);
  });

  it('leer: ein Satz statt einer leeren Liste', async () => {
    angebote = [];
    scheine = [];
    zeige();
    expect(await screen.findByText('Der Papierkorb ist leer.')).toBeInTheDocument();
    expect(screen.getByText(/bis es wiederhergestellt oder endgültig gelöscht wird/)).toBeInTheDocument();
  });

  it('nur die Arten, deren Modul an ist', async () => {
    module = { angebote: false, scheine: true };
    zeige();
    await screen.findByText('Familie Gruber');
    expect(screen.queryByText('Familie Huber')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Angebote/ })).toBeNull();
    expect(zaehleAngebote).not.toHaveBeenCalled();
  });
});

describe('Die Frist', () => {
  it('die Spitze setzt sie in Tagen; leer heißt kein Hinweis; Unsinn wird nicht gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    const feld = await screen.findByRole('textbox', { name: /Papierkorb: Hinweis nach … Tagen/ });
    expect(feld).toHaveValue('');
    await nutzer.type(feld, '30');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith('perl', { papierkorbFristTage: 30 }));

    await nutzer.clear(feld);
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(updateCompany).toHaveBeenLastCalledWith('perl', { papierkorbFristTage: null }));

    updateCompany.mockClear();
    for (const falsch of ['0', '2,5', '-3', 'abc']) {
      await nutzer.clear(feld);
      await nutzer.type(feld, falsch);
      await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByText(/ganze Tage zwischen 1 und 3650/)).toBeInTheDocument();
    }
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('zeigt die gespeicherte Frist', async () => {
    firma = { id: 'perl', name: 'Perl', papierkorbFristTage: 14 };
    zeige();
    expect(await screen.findByRole('textbox', { name: /Papierkorb: Hinweis nach … Tagen/ })).toHaveValue('14');
  });
});
