import { zwischenspeicherLeeren } from '@/lib/zwischenspeicher';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Company, Role, TimeEntry, ZeitfeldDefinition } from '@/types';

/**
 * DIE FREIEN ZEITFELDER IN DER BUCHUNGSMASKE (M06b, N01).
 *
 * Die Maske zeigt die Felder, die für Stand und Rolle der gebuchten Person
 * gelten, prüft mit derselben Regel wie der Server und schickt die Werte mit
 * der Buchung — auch ins Ausgangsfach, ohne Empfang mit dem gemerkten
 * Feldsatz. Beim Bearbeiten stehen die gespeicherten Werte da; eine nicht
 * mehr wählbare Option bleibt an ihnen.
 *
 * Gegenprobe: ohne die Felder in `TimeForm` (oder ohne den Durchgang
 * `zeitfelder` im Speichern) sind alle Fälle hier rot.
 */

const K = '00000000-0000-4000-8000-0000000000a1';
const KM = '00000000-0000-4000-8000-0000000000a2';
const BUERO = '00000000-0000-4000-8000-0000000000a3';
const WIEN = '11111111-1111-4111-8111-111111111111';
const LINZ = '33333333-3333-4333-8333-333333333333';
const ALLE: Role[] = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'];

const def = (id: string, name: string, x: Partial<ZeitfeldDefinition>): ZeitfeldDefinition => ({
  id, companyId: 'perl', name, typ: 'text', regeln: {}, giltStaende: ['Anwesend'], giltRollen: ALLE, pflicht: 'nie',
  reihenfolge: 1, aktiv: true, ...x,
});
const definitionen = [
  def(K, 'Kostenstelle', {
    typ: 'auswahl', pflicht: 'beim_buchen', reihenfolge: 1,
    regeln: { optionen: [{ id: WIEN, text: 'Wien', aktiv: true }, { id: LINZ, text: 'Linz', aktiv: false }] },
  }),
  def(KM, 'Kilometer', { typ: 'zahl', regeln: { min: 0, stellen: 1, einheit: 'km' }, reihenfolge: 2 }),
  def(BUERO, 'Interne Notiz', { reihenfolge: 3, giltRollen: ['Buchhaltung'] }),
];
const regel = (d: ZeitfeldDefinition) => ({ typ: d.typ, regeln: d.regeln, staende: d.giltStaende, rollen: d.giltRollen, pflicht: d.pflicht });
const fassung = { id: 'f4', companyId: 'perl', nummer: 4, felder: Object.fromEntries(definitionen.map((d) => [d.id, regel(d)])) };

const buchen = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => 'confirmed');
const aendern = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => buchen(...a),
  updateTimeEntryOhneEmpfang: (...a: unknown[]) => aendern(...a),
  eintraegeAmTag: vi.fn(async () => []),
  eintraegeUmDenTag: vi.fn(async () => []),
  listOwnEntriesInRange: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const feldsatzLaden = vi.fn(async () => ({ fassung, definitionen }));
const gemerkterFeldsatz = vi.fn((): unknown => null);
const listFeldwerte = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('@/lib/db/zeitfelder', () => ({
  feldsatzLaden: () => feldsatzLaden(),
  gemerkterFeldsatz: () => gemerkterFeldsatz(),
  listFeldwerte: () => listFeldwerte(),
  listZeitfeldFassungen: vi.fn(async () => [fassung]),
}));

const authWert: { user: AppUser; company: Pick<Company, 'id' | 'name' | 'modules' | 'zeitStandardfelder'> } = {
  user: { uid: 'u1', name: 'Max Monteur', role: 'Mitarbeiter', companyId: 'perl' } as unknown as AppUser,
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne(entry?: TimeEntry) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: { projectNumber: 'B-001' } }]}>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} entry={entry as never} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Der Feldsatz liegt im Zwischenspeicher der App (M06b) — je Fall frisch.
  zwischenspeicherLeeren();
  buchen.mockClear();
  aendern.mockClear();
  feldsatzLaden.mockClear();
  feldsatzLaden.mockImplementation(async () => ({ fassung, definitionen }));
  gemerkterFeldsatz.mockReturnValue(null);
  listFeldwerte.mockResolvedValue([]);
  authWert.user = { ...authWert.user, role: 'Mitarbeiter' } as AppUser;
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
});

describe('Die Felder in der Maske', () => {
  it('zeigt die Felder für Stand und Rolle — die Pflicht mit Stern, Fremdes nicht', async () => {
    zeichne();
    expect(await screen.findByLabelText(/^Kostenstelle/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Kilometer (km)')).toBeInTheDocument();
    // „Interne Notiz“ gilt nur für die Buchhaltung.
    expect(screen.queryByLabelText(/Interne Notiz/)).toBeNull();
    // Eine nicht mehr wählbare Option steht bei einer neuen Buchung nicht zur Wahl.
    expect(screen.queryByRole('option', { name: /Linz/ })).toBeNull();
  });

  it('ohne Pflichtangabe wird nicht gebucht — die Meldung wie vom Server', async () => {
    zeichne();
    await screen.findByLabelText(/^Kostenstelle/);
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByText('Bitte ausfüllen: Kostenstelle')).toBeInTheDocument();
    expect(buchen).not.toHaveBeenCalled();
  });

  it('ein falscher Wert nennt das Feld', async () => {
    zeichne();
    await userEvent.selectOptions(await screen.findByLabelText(/^Kostenstelle/), WIEN);
    fireEvent.change(screen.getByLabelText('Kilometer (km)'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByText('Kilometer: Mindestens 0')).toBeInTheDocument();
    expect(buchen).not.toHaveBeenCalled();
  });

  it('die Werte reisen mit der Buchung, samt Fassung — ins Ausgangsfach wie jede Buchung', async () => {
    zeichne();
    await userEvent.selectOptions(await screen.findByLabelText(/^Kostenstelle/), WIEN);
    fireEvent.change(screen.getByLabelText('Kilometer (km)'), { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    const eintrag = buchen.mock.calls[0][1] as TimeEntry;
    expect(eintrag.zeitfelder).toEqual({ fassung: 4, werte: { [K]: WIEN, [KM]: 12.5 } });
  });

  it('ohne Empfang gilt der auf dem Gerät gemerkte Feldsatz', async () => {
    gemerkterFeldsatz.mockReturnValue({ fassung: { ...fassung, nummer: 3 }, definitionen });
    feldsatzLaden.mockImplementation(async () => { throw new Error('Failed to fetch'); });
    zeichne();
    await userEvent.selectOptions(await screen.findByLabelText(/^Kostenstelle/), WIEN);
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    expect((buchen.mock.calls[0][1] as TimeEntry).zeitfelder).toEqual({ fassung: 3, werte: { [K]: WIEN, [KM]: null } });
  });

  it('der erste Griff vor dem Laden bucht nicht an den Feldern vorbei — die Maske fragt einmal nach', async () => {
    let freigeben: () => void = () => undefined;
    let erstes = true;
    feldsatzLaden.mockImplementation(() => {
      if (!erstes) return Promise.resolve({ fassung, definitionen });
      erstes = false;
      return new Promise((fertig) => { freigeben = () => fertig({ fassung, definitionen }); });
    });
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByText('Bitte ausfüllen: Kostenstelle')).toBeInTheDocument();
    expect(buchen).not.toHaveBeenCalled();
    freigeben();
  });

  it('Netzlast: ein neuer Aufbau der Maske innerhalb einer Minute fragt nicht neu', async () => {
    const erste = zeichne();
    await screen.findByLabelText(/^Kostenstelle/);
    erste.unmount();
    zeichne();
    expect(await screen.findByLabelText(/^Kostenstelle/)).toBeInTheDocument();
    expect(feldsatzLaden).toHaveBeenCalledTimes(1);
  });

  it('die Buchhaltung sieht ihr Feld; bei Zeitausgleich verschwinden die Felder für Anwesend', async () => {
    authWert.user = { ...authWert.user, role: 'Buchhaltung' } as AppUser;
    zeichne();
    expect(await screen.findByLabelText('Interne Notiz')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Zeitausgleich');
    expect(screen.queryByLabelText(/^Kostenstelle/)).toBeNull();
    expect(screen.queryByLabelText('Interne Notiz')).toBeNull();
  });

  it('ist die Unterfähigkeit aus, gibt es keine Felder und keinen Durchgang', async () => {
    authWert.company = { ...authWert.company, modules: { 'zeiterfassung.freie_zeitfelder': false } };
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    expect(screen.queryByLabelText(/^Kostenstelle/)).toBeNull();
    expect((buchen.mock.calls[0][1] as TimeEntry).zeitfelder).toBeUndefined();
  });
});

describe('Bearbeiten', () => {
  const eintrag: TimeEntry = {
    id: 'e1', companyId: 'perl', userId: 'u1', userName: 'Max Monteur', date: '2026-10-14', status: 'Anwesend',
    startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-001', zeitfeldFassung: 4,
  };

  it('zeigt die gespeicherten Werte — eine nicht mehr wählbare Option bleibt an ihnen', async () => {
    listFeldwerte.mockResolvedValue([
      { eintragId: 'e1', feldId: K, wert: LINZ }, { eintragId: 'e1', feldId: KM, wert: 7 }, { eintragId: 'anders', feldId: KM, wert: 1 },
    ]);
    zeichne(eintrag);
    const k = await screen.findByLabelText(/^Kostenstelle/);
    await waitFor(() => expect(k).toHaveValue(LINZ));
    expect(screen.getByRole('option', { name: 'Linz (nicht mehr wählbar)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kilometer (km)')).toHaveValue('7');
    fireEvent.change(screen.getByLabelText('Kilometer (km)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect((aendern.mock.calls[0][1] as TimeEntry).zeitfelder).toEqual({ fassung: 4, werte: { [K]: LINZ, [KM]: 9 } });
  });

  it('eine Pflichtangabe bleibt — leeren geht nicht', async () => {
    listFeldwerte.mockResolvedValue([{ eintragId: 'e1', feldId: K, wert: WIEN }]);
    zeichne(eintrag);
    const k = await screen.findByLabelText(/^Kostenstelle/);
    await waitFor(() => expect(k).toHaveValue(WIEN));
    await userEvent.selectOptions(k, '');
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(await screen.findByText('Pflichtangabe bleibt: Kostenstelle')).toBeInTheDocument();
    expect(aendern).not.toHaveBeenCalled();
  });

  it('lassen sich die Werte nicht laden, schickt die Maske keine Angaben — nichts wird geleert', async () => {
    listFeldwerte.mockRejectedValue(new Error('Failed to fetch'));
    zeichne(eintrag);
    expect(await screen.findByText(/ließen sich nicht laden — sie bleiben, wie sie sind/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Kostenstelle/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect((aendern.mock.calls[0][1] as TimeEntry).zeitfelder).toBeUndefined();
  });
});

describe('Standardfelder der bisherigen Maske', () => {
  it('schaltet Zusatzfelder aus, bewahrt aber die vorhandenen Werte beim Ändern', async () => {
    authWert.company.modules = { 'zeiterfassung.freie_zeitfelder': false };
    authWert.company.zeitStandardfelder = { travelTime: false, vehiclePlate: false, helperName: false, comment: false, isEmergency: false };
    zeichne({ id: 'e1', companyId: 'perl', userId: 'u1', userName: 'Max Monteur', date: '2026-10-14', status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-001', travelTime: 25, vehiclePlate: 'G-123', helperName: 'Helfer', comment: 'Alt', isEmergency: true });
    expect(screen.queryByLabelText(/Wegzeit/)).toBeNull();
    expect(screen.queryByLabelText(/Kommentar/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect(aendern.mock.calls[0][1]).toMatchObject({ travelTime: 25, vehiclePlate: 'G-123', helperName: 'Helfer', comment: 'Alt', isEmergency: true });
  });
  it('ohne Gesamtmodul bleibt die Neuanlage aus, das Bearbeiten vorhandener Daten bleibt', () => {
    authWert.company.modules = { zeiterfassung: false };
    zeichne();
    expect(screen.getByText(/Zeiterfassung ist ausgeschaltet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Zeit buchen/ })).toBeNull();
  });
  it('offene Korrektur bei ausgeschaltetem Modul ändert feste Angaben ohne freie Werte neu zu schreiben', async () => {
    authWert.company.modules = { zeiterfassung: false };
    listFeldwerte.mockResolvedValue([{ eintragId: 'e1', feldId: K, wert: WIEN }]);
    const eintrag: TimeEntry = { id: 'e1', companyId: 'perl', userId: 'u1', userName: 'Max Monteur', date: '2026-10-14', status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30, projectNumber: 'B-001', zeitfeldFassung: 4 };
    const korrigieren = vi.fn<(werte: Partial<TimeEntry>) => Promise<void>>(async () => undefined);
    render(<MemoryRouter><ToastProvider><TimeForm entry={eintrag as never} speichernMit={korrigieren} onSaved={vi.fn()} /></ToastProvider></MemoryRouter>);
    await waitFor(() => expect(feldsatzLaden).toHaveBeenCalled());
    await waitFor(() => expect(listFeldwerte).toHaveBeenCalled());
    expect(screen.queryByLabelText(/^Kostenstelle/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Kommentar/), { target: { value: 'Berichtigte Tätigkeit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(korrigieren).toHaveBeenCalled());
    expect(korrigieren.mock.calls[0][0]).toMatchObject({ comment: 'Berichtigte Tätigkeit' });
    expect(korrigieren.mock.calls[0][0]).not.toHaveProperty('zeitfelder');
  });

});


it('Archivfelder verwenden dieselbe Wertsemantik wie das Modulregister', async () => {
  const { useFeldsatz } = await import('@/features/time/useZeitfelder');
  for (const parent of [false, 0, '']) for (const flag of [false, 0, '', undefined, null, 2, 'aktiv', {}, []]) {
    zwischenspeicherLeeren();
    const module = { zeiterfassung: parent, 'zeiterfassung.freie_zeitfelder': flag } as unknown as Record<string, boolean>;
    const { result, unmount } = renderHook(() => useFeldsatz(authWert.user, module));
    expect(result.current.an, JSON.stringify(flag)).toBe(flag === undefined || flag === null || Boolean(flag));
    await waitFor(() => expect(result.current.laedt).toBe(false));
    unmount();
  }
});
