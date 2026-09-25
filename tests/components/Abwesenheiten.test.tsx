import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Betriebsurlaub, Krankmeldung } from '@/types';

/**
 * Die Büro-Reiter der Urlaubsseite: Krankenstände und Betriebsurlaub.
 *
 * Beide schreiben Tage ins Zeitkonto — Krank, Urlaub. Geprüft wird hier,
 * dass die Oberfläche das Richtige an die Datenbank schickt und nichts ohne
 * Rückfrage löscht; was die Datenbank daraus macht, prüft
 * `tests/supabase/abwesenheiten.test.ts`.
 */

const speichern = vi.fn<[unknown], Promise<unknown>>(
  async () => ({ id: 'k', angelegt: 2, entfernt: 0, uebersprungen: 0 }),
);
const loeschen = vi.fn<[string], Promise<number>>(async () => 2);
const buAnlegen = vi.fn<[unknown], Promise<unknown>>(
  async () => ({ id: 'b', mitarbeiter: 3, tage: 12, uebersprungen: 0 }),
);
const buLoeschen = vi.fn<[string], Promise<unknown>>(async () => ({ tage: 12, mitarbeiter: 3 }));
let meldungen: (Krankmeldung & { id: string })[] = [];
let urlaube: (Betriebsurlaub & { id: string })[] = [];

vi.mock('@/lib/db/abwesenheiten', () => ({
  krankmeldungSpeichern: (a: unknown) => speichern(a),
  krankmeldungLoeschen: (id: string) => loeschen(id),
  listKrankmeldungenAb: vi.fn(async () => meldungen),
  listBetriebsurlaubeAb: vi.fn(async () => urlaube),
  betriebsurlaubAnlegen: (a: unknown) => buAnlegen(a),
  betriebsurlaubLoeschen: (id: string) => buLoeschen(id),
}));
vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [
    { uid: 'm1', name: 'Max Monteur', active: true },
    { uid: 'm2', name: 'Alt Ausgeschieden', active: false },
  ] as AppUser[]),
}));

const { KrankenstaendeReiter } = await import('@/features/vacations/Krankmeldungen');
const { default: BetriebsurlaubReiter } = await import('@/features/vacations/BetriebsurlaubReiter');

function zeige(el: JSX.Element) {
  return render(<ToastProvider>{el}</ToastProvider>);
}

async function datum(label: RegExp | string, wert: string) {
  const feld = screen.getByLabelText(label) as HTMLInputElement;
  await userEvent.clear(feld);
  await userEvent.type(feld, wert);
}

beforeEach(() => {
  for (const f of [speichern, loeschen, buAnlegen, buLoeschen]) f.mockClear();
  meldungen = [];
  urlaube = [];
});

describe('Krankenstände', () => {
  it('erfasst eine Krankmeldung für jemanden — nur aktive stehen zur Wahl', async () => {
    zeige(<KrankenstaendeReiter companyId="perl" meinName="Brigitte" />);
    const wahl = await screen.findByLabelText(/Mitarbeiter/);
    await waitFor(() => expect(within(wahl).getAllByRole('option')).toHaveLength(2));
    expect(within(wahl).queryByText('Alt Ausgeschieden')).not.toBeInTheDocument();

    await userEvent.selectOptions(wahl, 'm1');
    await datum('Krank ab', '2026-10-27');
    await datum('Voraussichtlich bis', '2026-10-28');
    await userEvent.click(screen.getByRole('button', { name: 'Krankmeldung erfassen' }));
    await waitFor(() =>
      expect(speichern).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'm1', von: '2026-10-27', bis: '2026-10-28', melderName: 'Brigitte',
      })),
    );
  });

  it('ändert das Ende über dieselbe Meldung', async () => {
    meldungen = [{ id: 'k1', companyId: 'perl', userId: 'm1', userName: 'Max Monteur', von: '2026-10-27', bis: '2026-10-30' }];
    zeige(<KrankenstaendeReiter companyId="perl" meinName="Brigitte" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ende ändern' }));
    await datum('Krank bis', '2026-10-28');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(speichern).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1', von: '2026-10-27', bis: '2026-10-28' })),
    );
  });

  it('löscht erst nach der Rückfrage', async () => {
    meldungen = [{ id: 'k1', companyId: 'perl', userId: 'm1', userName: 'Max Monteur', von: '2026-10-27', bis: '2026-10-30' }];
    zeige(<KrankenstaendeReiter companyId="perl" meinName="Brigitte" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(loeschen).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith('k1'));
  });

  it('zeigt die Meldung der Datenbank, statt sie zu verschlucken', async () => {
    speichern.mockRejectedValueOnce(new Error('Überschneidet sich mit der Krankmeldung vom 27.10.2026'));
    zeige(<KrankenstaendeReiter companyId="perl" meinName="Brigitte" />);
    const wahl = await screen.findByLabelText(/Mitarbeiter/);
    await waitFor(() => expect(within(wahl).getAllByRole('option')).toHaveLength(2));
    await userEvent.selectOptions(wahl, 'm1');
    await userEvent.click(screen.getByRole('button', { name: 'Krankmeldung erfassen' }));
    expect(await screen.findByText(/Überschneidet sich/)).toBeInTheDocument();
  });
});

describe('Betriebsurlaub', () => {
  it('fragt nach und legt mit Häkchen „Urlaub abbuchen" an', async () => {
    zeige(<BetriebsurlaubReiter companyId="perl" meinName="Brigitte" />);
    await datum('Von', '2026-12-28');
    await datum('Bis (einschließlich)', '2026-12-31');
    await userEvent.clear(screen.getByLabelText(/Bezeichnung/));
    await userEvent.type(screen.getByLabelText(/Bezeichnung/), 'Weihnachten');
    await userEvent.click(screen.getByRole('button', { name: 'Betriebsurlaub anlegen' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Allen aktiven Mitarbeitern werden die Arbeitstage als Urlaub gebucht/);
    expect(buAnlegen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() =>
      expect(buAnlegen).toHaveBeenCalledWith(expect.objectContaining({
        von: '2026-12-28', bis: '2026-12-31', bezeichnung: 'Weihnachten', abbuchen: true,
      })),
    );
  });

  it('ohne Häkchen wird nichts abgebucht — und die Rückfrage sagt das', async () => {
    zeige(<BetriebsurlaubReiter companyId="perl" meinName="Brigitte" />);
    await userEvent.click(screen.getByLabelText(/Urlaubskonto aller aktiven Mitarbeiter belasten/));
    await userEvent.click(screen.getByRole('button', { name: 'Betriebsurlaub anlegen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/nur die Planung ist gesperrt/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(buAnlegen).toHaveBeenCalledWith(expect.objectContaining({ abbuchen: false })));
  });

  it('nimmt einzelne Mitarbeiter aus — Rückfrage und Aufruf nennen sie', async () => {
    zeige(<BetriebsurlaubReiter companyId="perl" meinName="Brigitte" />);
    // Zugeklappt: meistens hat der ganze Betrieb zu.
    expect(screen.queryByLabelText('Max Monteur')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Mitarbeiter ausnehmen/ }));
    // Nur aktive stehen zur Wahl.
    expect(screen.queryByLabelText('Alt Ausgeschieden')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByLabelText('Max Monteur'));
    await userEvent.click(screen.getByRole('button', { name: 'Betriebsurlaub anlegen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/ausser den Ausgenommenen/);
    expect(dialog).toHaveTextContent(/Arbeiten in dieser Zeit: Max Monteur/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() =>
      expect(buAnlegen).toHaveBeenCalledWith(expect.objectContaining({ ausgenommen: ['m1'] })),
    );
  });

  it('zeigt in der Liste, wer arbeitet', async () => {
    urlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31', bezeichnung: 'Weihnachten', urlaubAbbuchen: true, ausgenommen: ['m1'] }];
    zeige(<BetriebsurlaubReiter companyId="perl" meinName="Brigitte" />);
    expect(await screen.findByText(/arbeiten: Max Monteur/)).toBeInTheDocument();
  });

  it('löscht erst nach der Rückfrage, die sagt, was zurückgenommen wird', async () => {
    urlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31', bezeichnung: 'Weihnachten', urlaubAbbuchen: true }];
    zeige(<BetriebsurlaubReiter companyId="perl" meinName="Brigitte" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/werden bei allen wieder entfernt/);
    expect(buLoeschen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(buLoeschen).toHaveBeenCalledWith('b1'));
  });
});
