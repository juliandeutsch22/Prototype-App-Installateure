import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { ZweiterFaktorStand } from '@/lib/auth/sitzung';

/**
 * Runde 3, H1: die Karte „Zwei-Faktor-Anmeldung“ unter „Mein Konto“. Was
 * erlaubt ist, entscheidet die Datenbank (tests/supabase/zweiFaktor.test.ts);
 * hier: die Karte bietet nur an, was geht.
 */
let stand: ZweiterFaktorStand;
const ausschalten = vi.fn(async () => undefined);
const neueCodes = vi.fn(async () => ['AAAA-BBBB']);
let ohne: Array<{ uid: string; name: string; rolle: string }> = [];
vi.mock('@/lib/auth/sitzung', () => ({
  ohneFaktor: vi.fn(async () => ohne),
  zweiterFaktorStand: vi.fn(async () => stand),
  zweitenFaktorAusschalten: ausschalten,
  neueCodes,
  einrichtenBeginnen: vi.fn(),
  einrichtenBestaetigen: vi.fn(),
}));
const updateCompany = vi.fn(async () => undefined);
vi.mock('@/lib/db/company', () => ({ updateCompany }));

const { default: ZweiFaktorKarte } = await import('@/features/settings/ZweiFaktorKarte');

const basis: ZweiterFaktorStand = {
  angeboten: true, pflicht: false, plattform: false, betriebPflicht: false,
  eingerichtet: false, codesOffen: 0, codeZuletztVerwendet: null,
};

const zeige = (betrieb?: string) =>
  render(<ToastProvider><ZweiFaktorKarte betrieb={betrieb} /></ToastProvider>);

beforeEach(() => {
  stand = { ...basis };
  ohne = [];
  updateCompany.mockClear();
  ausschalten.mockClear();
});

describe('Zwei-Faktor unter „Mein Konto“', () => {
  it('nicht eingerichtet: Einrichten ja, Pflicht erst danach', async () => {
    zeige('perl');
    expect(await screen.findByRole('button', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.getByLabelText(/in diesem Betrieb verpflichtend/)).toBeDisabled();
    expect(screen.getByText(/Zuerst für dich selbst einrichten/)).toBeInTheDocument();
  });

  it('eingerichtet: Pflicht einschaltbar, Ausschalten nur ohne Pflicht', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 9 };
    zeige('perl');
    expect(await screen.findByText(/Noch 9 von 10 Wiederherstellungscodes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausschalten' })).toBeInTheDocument();
    await nutzer.click(screen.getByLabelText(/in diesem Betrieb verpflichtend/));
    expect(updateCompany).toHaveBeenCalledWith('perl', { zweiFaktorPflicht: true });
  });

  it('Gegenprobe: mit Pflicht kein Ausschalten', async () => {
    stand = { ...basis, eingerichtet: true, pflicht: true, betriebPflicht: true, codesOffen: 10 };
    zeige('perl');
    await screen.findByText(/Noch 10 von 10/);
    expect(screen.queryByRole('button', { name: 'Ausschalten' })).not.toBeInTheDocument();
    expect(screen.getByText(/Pflicht — ausschalten geht deshalb nicht/)).toBeInTheDocument();
  });

  it('wer es nicht angeboten bekommt (Monteur), sieht die Karte nicht', async () => {
    stand = { ...basis, angeboten: false };
    zeige();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Zwei-Faktor-Anmeldung')).not.toBeInTheDocument();
  });

  it('ohne Betriebsrecht kein Schalter für die Pflicht', async () => {
    zeige();
    await screen.findByRole('button', { name: 'Einrichten' });
    expect(screen.queryByLabelText(/in diesem Betrieb verpflichtend/)).not.toBeInTheDocument();
  });
});

/*
  K6 (Durchsicht 15.11.2026): die Pflicht wirkt sofort. Wer sie einschaltet,
  sieht vorher, wen sie trifft. GEGENPROBE (Erwartung): mit der alten Karte
  schaltet der Haken sofort, ohne Dialog — „fragt vorher“ und „Abbrechen“
  sind rot; „ohne Betroffene“ ist in beiden Fassungen grün.
*/
describe('Wen die Pflicht trifft', () => {
  const ohneFaktorListe = [
    { uid: 'b1', name: 'Eva Buch', rolle: 'Buchhaltung' },
    { uid: 'a1', name: 'Max Admin', rolle: 'Administrator' },
  ];

  it('fragt vorher und nennt, wer noch keinen zweiten Faktor hat', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 10 };
    ohne = ohneFaktorListe;
    zeige('perl');
    await nutzer.click(await screen.findByLabelText(/in diesem Betrieb verpflichtend/));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Eva Buch · Buchhaltung');
    expect(dialog).toHaveTextContent('Max Admin · Administrator');
    expect(updateCompany).not.toHaveBeenCalled();
    await nutzer.click(screen.getByRole('button', { name: 'Pflicht einschalten' }));
    expect(updateCompany).toHaveBeenCalledWith('perl', { zweiFaktorPflicht: true });
  });

  it('Abbrechen lässt die Pflicht aus', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 10 };
    ohne = ohneFaktorListe;
    zeige('perl');
    await nutzer.click(await screen.findByLabelText(/in diesem Betrieb verpflichtend/));
    await nutzer.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('bleibt gleich ohne Betroffene: der Haken schaltet sofort', async () => {
    const nutzer = userEvent.setup();
    stand = { ...basis, eingerichtet: true, codesOffen: 10 };
    zeige('perl');
    await nutzer.click(await screen.findByLabelText(/in diesem Betrieb verpflichtend/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateCompany).toHaveBeenCalledWith('perl', { zweiFaktorPflicht: true });
  });

  it('solange die Pflicht gilt, steht da, wer noch fehlt', async () => {
    stand = { ...basis, eingerichtet: true, pflicht: true, betriebPflicht: true, codesOffen: 10 };
    ohne = ohneFaktorListe;
    zeige('perl');
    expect(await screen.findByText(/Noch ohne zweiten Faktor: Eva Buch und Max Admin/)).toBeInTheDocument();
  });
});
