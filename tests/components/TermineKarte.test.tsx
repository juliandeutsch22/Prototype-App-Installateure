import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Termin } from '@/types';
import type { TerminVorgabe } from '@/features/termine/TerminFormular';

/**
 * Die Termine an einer Stelle (Plan 10.4): Tagesplanung, Baustellenakte,
 * Kundenakte. Gelesen wird, was der Zeilenschutz zeigt; anlegen, ändern und
 * löschen nur Leitung und Verwaltung. Geprüft wird, was beim Speichern an
 * die Datenbank geht — die Grenzen selbst prüft `tests/supabase/termine.test.ts`.
 */

const ANNA: AppUser = { uid: 'anna', name: 'Anna Monteurin', role: 'Mitarbeiter', companyId: 'perl', active: true } as AppUser;
const BERT: AppUser = { uid: 'bert', name: 'Bert Monteur', role: 'Mitarbeiter', companyId: 'perl', active: true } as AppUser;

const LIEFERUNG: Termin = {
  id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-06-02', zeitVon: '08:00', zeitBis: '10:00',
  projectNumber: '2026-042', customerId: null, teilnehmer: ['anna'], notiz: 'Wannen, 2 Paletten',
  ortName: 'Familie Huber', ortAdresse: 'Hauptstraße 12, 2700 Wiener Neustadt',
};
const ALT: Termin = {
  id: 't0', companyId: 'perl', art: 'Abnahme', datum: '2026-05-20', zeitVon: null, zeitBis: null,
  projectNumber: '2026-042', customerId: null, teilnehmer: [],
};

let termine: Termin[] = [];
const terminAnlegen = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'neu');
const terminAendern = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
const terminLoeschen = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => termine),
  listTermineDerBaustelle: vi.fn(async () => termine),
  listTermineDesKunden: vi.fn(async () => termine),
  terminAnlegen: (...a: unknown[]) => terminAnlegen(...a),
  terminAendern: (...a: unknown[]) => terminAendern(...a),
  terminLoeschen: (...a: unknown[]) => terminLoeschen(...a),
}));
const PROJEKT = { id: 'p1', projectNumber: '2026-042', customerName: 'Familie Huber', status: 'Aktiv' };
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [PROJEKT]),
  listRecentProjects: vi.fn(async () => [PROJEKT]),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => [ANNA, BERT]) }));
vi.mock('@/lib/db/customers', () => ({
  listCustomers: vi.fn(async () => [{ id: 'k1', name: 'Hausverwaltung Nord', active: true }]),
}));
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-06-01' };
});

let rolle: AppUser['role'] = 'Verwaltung';
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'verw', name: 'Vera Büro', role: rolle, companyId: 'perl' } }),
}));

const { default: TermineKarte } = await import('@/features/termine/TermineKarte');

function zeige(vorgabe: TerminVorgabe, titel = 'Termine') {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TermineKarte titel={titel} vorgabe={vorgabe} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const karte = () => screen.getByRole('heading', { name: /Termine/ }).closest('section') as HTMLElement;

beforeEach(() => {
  termine = [];
  rolle = 'Verwaltung';
  terminAnlegen.mockClear();
  terminAendern.mockClear();
  terminLoeschen.mockClear();
});

describe('Die Liste', () => {
  it('zeigt Art, Zeitfenster, Baustelle, Teilnehmer und Notiz', async () => {
    termine = [LIEFERUNG];
    zeige({ bezug: 'frei', datum: '2026-06-02' }, 'Termine am Di, 02.06.');
    expect(await screen.findByText('Lieferung (Aviso) · 08:00–10:00')).toBeInTheDocument();
    expect(await screen.findByText('Familie Huber · 2026-042')).toBeInTheDocument();
    expect(await screen.findByText('Teilnehmer: Anna Monteurin')).toBeInTheDocument();
    expect(screen.getByText('Wannen, 2 Paletten')).toBeInTheDocument();
  });

  it('in der Akte stehen die kommenden oben, die früheren klappen auf', async () => {
    termine = [ALT, LIEFERUNG];
    zeige({ bezug: 'baustelle', projectNumber: '2026-042' });
    expect(await screen.findByText(/Lieferung \(Aviso\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Abnahme/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Frühere zeigen (1)' }));
    expect(screen.getByText(/Abnahme/)).toBeInTheDocument();
  });

  it('ohne Termine sagt sie es', async () => {
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    expect(await screen.findByText('Keine Termine an diesem Tag.')).toBeInTheDocument();
  });

  it('wer nicht schreiben darf, sieht weder Anlegen noch Ändern noch Löschen', async () => {
    rolle = 'Mitarbeiter';
    termine = [LIEFERUNG];
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    expect(await screen.findByText(/Lieferung \(Aviso\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ändern$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /löschen$/ })).not.toBeInTheDocument();
  });

  it('die Verwaltung darf — Gegenprobe zum Monteur', async () => {
    termine = [LIEFERUNG];
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    expect(await screen.findByRole('button', { name: 'Termin anlegen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lieferung \(Aviso\) · 08:00–10:00 am .* ändern/ })).toBeInTheDocument();
  });
});

describe('Anlegen', () => {
  it('in der Tagesplanung: Lieferung auf der Baustelle mit Zeitfenster und Teilnehmer', async () => {
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    await userEvent.selectOptions(screen.getByLabelText('Art'), 'Lieferung');
    await userEvent.type(screen.getByLabelText('Zeitfenster von'), '08:00');
    await userEvent.type(screen.getByLabelText('Zeitfenster bis'), '10:00');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Anna Monteurin/ }));
    await userEvent.type(screen.getByLabelText('Notiz'), 'Wannen');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen).toHaveBeenCalledWith('perl', {
      art: 'Lieferung', datum: '2026-06-02', zeitVon: '08:00', zeitBis: '10:00',
      projectNumber: '2026-042', customerId: null, teilnehmer: ['anna'], notiz: 'Wannen',
    });
  });

  it('ohne Baustelle wird nicht gespeichert — und es steht da, warum', async () => {
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    expect(await screen.findByText('Bitte eine Baustelle wählen.')).toBeInTheDocument();
    expect(terminAnlegen).not.toHaveBeenCalled();
  });

  it('„bis" vor „von" wird nicht gespeichert', async () => {
    zeige({ bezug: 'baustelle', projectNumber: '2026-042' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    await userEvent.type(screen.getByLabelText('Von'), '10:00');
    await userEvent.type(screen.getByLabelText('Bis'), '08:00');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    expect(await screen.findByText('„Bis“ muss nach „Von“ liegen.')).toBeInTheDocument();
    expect(terminAnlegen).not.toHaveBeenCalled();
  });

  it('sagt verdrehte Zeiten gleich unter den Feldern, nicht erst beim Speichern (05.10.2026)', async () => {
    zeige({ bezug: 'baustelle', projectNumber: '2026-042' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    const satz = /liegt nicht nach „Von“ — so lässt sich der Termin nicht speichern/;
    await userEvent.type(screen.getByLabelText('Von'), '12:22');
    await userEvent.type(screen.getByLabelText('Bis'), '12:12');
    expect(screen.getByText(satz)).toBeInTheDocument();
    // Gegenprobe: in der richtigen Folge steht nichts da.
    await userEvent.clear(screen.getByLabelText('Bis'));
    await userEvent.type(screen.getByLabelText('Bis'), '13:00');
    expect(screen.queryByText(satz)).not.toBeInTheDocument();
  });

  it('die Uhrzeit lässt sich wieder entfernen — dann gilt der ganze Tag (05.10.2026)', async () => {
    zeige({ bezug: 'baustelle', projectNumber: '2026-042' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    // Ohne Uhrzeit gibt es nichts zu entfernen.
    expect(screen.queryByRole('button', { name: 'Uhrzeit entfernen' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Von'), '10:00');
    await userEvent.type(screen.getByLabelText('Bis'), '08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Uhrzeit entfernen' }));
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Bis') as HTMLInputElement).value).toBe('');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen.mock.calls[0][1]).toMatchObject({ zeitVon: '', zeitBis: '' });
  });

  it('in der Baustellenakte steht die Baustelle fest', async () => {
    zeige({ bezug: 'baustelle', projectNumber: '2026-042' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    expect(screen.queryByRole('combobox', { name: /Baustelle/ })).not.toBeInTheDocument();
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen.mock.calls[0][1]).toMatchObject({ projectNumber: '2026-042', customerId: null, datum: '2026-06-01' });
  });

  it('in der Kundenakte ohne Baustelle: die Besichtigung hängt am Kunden', async () => {
    zeige({ bezug: 'kunde', customerId: 'k1', baustellen: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    expect(screen.getByRole('radio', { name: 'Beim Kunden, ohne Baustelle' })).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText('Art'), 'Besichtigung');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen.mock.calls[0][1]).toMatchObject({ art: 'Besichtigung', projectNumber: null, customerId: 'k1' });
  });

  it('in der Kundenakte mit Baustelle: vorgewählt ist seine erste', async () => {
    zeige({ bezug: 'kunde', customerId: 'k1', baustellen: [{ projectNumber: '2026-042', label: '2026-042 · Ringstraße 3' }] });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    expect(screen.getByRole('combobox', { name: 'Baustelle' })).toHaveValue('2026-042');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen.mock.calls[0][1]).toMatchObject({ projectNumber: '2026-042', customerId: null });
  });

  it('in der Tagesplanung beim Kunden: aus der Kundenliste gewählt', async () => {
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    await userEvent.click(await screen.findByRole('button', { name: 'Termin anlegen' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Beim Kunden, ohne Baustelle' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Kunde' }), 'k1');
    await userEvent.click(within(karte()).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledTimes(1));
    expect(terminAnlegen.mock.calls[0][1]).toMatchObject({ projectNumber: null, customerId: 'k1' });
  });
});

describe('Ändern und Löschen', () => {
  it('ändert mit den bisherigen Werten im Formular', async () => {
    termine = [LIEFERUNG];
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    await userEvent.click(await screen.findByRole('button', { name: /Lieferung \(Aviso\) · 08:00–10:00 am .* ändern/ }));
    expect(screen.getByLabelText('Zeitfenster von')).toHaveValue('08:00');
    const bis = screen.getByLabelText('Zeitfenster bis');
    await userEvent.clear(bis);
    await userEvent.type(bis, '11:00');
    await userEvent.click(screen.getByRole('button', { name: 'Änderung speichern' }));
    await waitFor(() => expect(terminAendern).toHaveBeenCalledTimes(1));
    expect(terminAendern).toHaveBeenCalledWith('t1', expect.objectContaining({ zeitVon: '08:00', zeitBis: '11:00', teilnehmer: ['anna'] }));
  });

  it('löscht erst nach der Rückfrage', async () => {
    termine = [LIEFERUNG];
    zeige({ bezug: 'frei', datum: '2026-06-02' });
    await userEvent.click(await screen.findByRole('button', { name: /Lieferung \(Aviso\) · 08:00–10:00 am .* löschen/ }));
    expect(terminLoeschen).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Löschen|Bestätigen|OK/ }));
    await waitFor(() => expect(terminLoeschen).toHaveBeenCalledWith('t1'));
  });
});
