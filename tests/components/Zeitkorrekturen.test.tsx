import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Zeitkorrektur } from '@/lib/db/zeitkorrekturen';

const listeLaden = vi.fn();
const einzelLaden = vi.fn();
vi.mock('@/lib/db/zeitkorrekturen', () => ({
  zeitkorrekturenLaden: (...args: unknown[]) => listeLaden(...args),
  zeitkorrekturLaden: (...args: unknown[]) => einzelLaden(...args),
  korrekturBuchungLaden: vi.fn(), zeitkorrekturBeantragen: vi.fn(), zeitkorrekturEntscheiden: vi.fn(),
}));
vi.mock('@/lib/db/users', () => ({ getUserByUid: vi.fn() }));
vi.mock('@/features/time/TimeForm', () => ({ default: () => null }));
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({
  user: { uid: 'buero', companyId: 'firma', role: 'Buchhaltung' },
  company: { modules: { 'zeiterfassung.korrekturantraege': true } },
}) }));
const { default: Zeitkorrekturen } = await import('@/features/time/Zeitkorrekturen');
function spaeter<T>() {
  let liefern!: (wert: T) => void;
  const antwort = new Promise<T>((resolve) => { liefern = resolve; });
  return { antwort, liefern: (wert: T) => liefern(wert) };
}
function zeichnen(url = '/time') {
  render(<MemoryRouter initialEntries={[url]}><ToastProvider><Zeitkorrekturen /></ToastProvider></MemoryRouter>);
}
const antrag = (id: string, wunsch: string, stand: Zeitkorrektur['stand']): Zeitkorrektur => ({
  id, companyId: 'firma', userId: 'ma', eintragId: 'e', datum: '2026-11-05', stand, wunsch,
  vorher: { user_name: 'Max' }, angelegtAm: 0,
});
beforeEach(() => { listeLaden.mockReset(); einzelLaden.mockReset(); });
it('eine verspätete Antwort überschreibt die zuletzt gewählte Filteransicht nicht', async () => {
  const alle = spaeter<Zeitkorrektur[]>(), offen = spaeter<Zeitkorrektur[]>();
  listeLaden.mockResolvedValueOnce([]).mockReturnValueOnce(alle.antwort).mockReturnValueOnce(offen.antwort);
  zeichnen();
  await waitFor(() => expect(listeLaden).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('checkbox', { name: /Auch entschiedene Anträge/ }));
  await waitFor(() => expect(listeLaden).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('checkbox', { name: /Auch entschiedene Anträge/ }));
  await waitFor(() => expect(listeLaden).toHaveBeenCalledTimes(3));
  await act(async () => offen.liefern([antrag('neu', 'Neuer offener Antrag', 'offen')]));
  expect(screen.getByText(/Neuer offener Antrag/)).toBeInTheDocument();
  await act(async () => alle.liefern([antrag('alt', 'Alter erledigter Antrag', 'abgelehnt')]));
  expect(screen.queryByText(/Alter erledigter Antrag/)).not.toBeInTheDocument();
  expect(screen.getByText(/Neuer offener Antrag/)).toBeInTheDocument();
});
it('der Hinweis auf einen unzugänglichen Direktlink bleibt nach dem Laden der Liste erhalten', async () => {
  const liste = spaeter<Zeitkorrektur[]>();
  listeLaden.mockReturnValue(liste.antwort); einzelLaden.mockResolvedValue(null);
  zeichnen('/time?korrektur=nicht-zugaenglich');
  expect(await screen.findByText(/Dieser Korrekturantrag fehlt oder ist nicht für dich zugänglich/)).toBeInTheDocument();
  await act(async () => liste.liefern([]));
  expect(screen.getByText(/Dieser Korrekturantrag fehlt oder ist nicht für dich zugänglich/)).toBeInTheDocument();
});
/*
  DIESELBE GRENZE WIE DIE DATENBANK (Befund 09.11.2026): bearbeitbar ist nur
  Arbeitszeit und Zeitausgleich ohne Antrag oder Meldung. Ein alter
  Urlaubstag ohne Antrag führt zum ursprünglichen Vorgang, nicht ins Formular.
*/
it('ein Urlaubstag ohne Antrag öffnet kein Formular', async () => {
  const { korrekturBuchungLaden } = await import('@/lib/db/zeitkorrekturen');
  const { getUserByUid } = await import('@/lib/db/users');
  vi.mocked(getUserByUid).mockResolvedValue({ uid: 'ma', role: 'Mitarbeiter' } as never);
  vi.mocked(korrekturBuchungLaden).mockResolvedValue({ id: 'e', date: '2026-11-05', status: 'Urlaub', korrekturStand: 'x' } as never);
  listeLaden.mockResolvedValue([]); einzelLaden.mockResolvedValue(antrag('a1', 'Bitte berichtigen', 'offen'));
  zeichnen('/time?korrektur=a1');
  expect(await screen.findByText(/stammt aus einer Abwesenheit/)).toBeInTheDocument();
});
it('Gegenprobe: bei Arbeitszeit steht kein Hinweis auf den ursprünglichen Vorgang', async () => {
  const { korrekturBuchungLaden } = await import('@/lib/db/zeitkorrekturen');
  const { getUserByUid } = await import('@/lib/db/users');
  vi.mocked(getUserByUid).mockResolvedValue({ uid: 'ma', role: 'Mitarbeiter' } as never);
  vi.mocked(korrekturBuchungLaden).mockResolvedValue({ id: 'e', date: '2026-11-05', status: 'Anwesend', korrekturStand: 'x' } as never);
  listeLaden.mockResolvedValue([]); einzelLaden.mockResolvedValue(antrag('a1', 'Bitte berichtigen', 'offen'));
  zeichnen('/time?korrektur=a1');
  expect(await screen.findByText(/Bitte berichtigen/)).toBeInTheDocument();
  await waitFor(() => expect(korrekturBuchungLaden).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(/stammt aus einer Abwesenheit/)).toBeNull();
});

/*
  DAS FENSTER „KORREKTUR ANFRAGEN“ (E72, 09.11.2026): ohne Uhrzeit stand
  „06.11.2026 · –.“, der Knopf klebte ohne Fuß am Feld. Jetzt der Stand statt
  des Strichs und ein Fuß mit „Abbrechen“ und dem Hauptknopf.
*/
it('Korrektur anfragen: ohne Uhrzeit steht der Stand, der Fuß trägt Abbrechen und Hauptknopf', async () => {
  const { KorrekturAnfordern } = await import('@/features/time/Zeitkorrekturen');
  render(
    <MemoryRouter><ToastProvider>
      <KorrekturAnfordern eintrag={{ id: 'e1', date: '2026-11-06', status: 'Zeitausgleich' } as never} />
    </ToastProvider></MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Korrektur anfragen' }));
  const fenster = await screen.findByRole('dialog');
  expect(fenster).toHaveTextContent('06.11.2026 · Zeitausgleich.');
  expect(fenster).not.toHaveTextContent('· –');
  const fuss = screen.getByRole('button', { name: 'Beim Büro anfragen' }).parentElement!;
  expect(fuss.className).toContain('fuss-aktionen');
  expect(fuss).toContainElement(screen.getByRole('button', { name: 'Abbrechen' }));
});

it('gleich geblieben: mit Uhrzeit steht Von–Bis im Fenster', async () => {
  const { KorrekturAnfordern } = await import('@/features/time/Zeitkorrekturen');
  render(
    <MemoryRouter><ToastProvider>
      <KorrekturAnfordern eintrag={{ id: 'e2', date: '2026-11-06', status: 'Anwesend', startTime: '07:00', endTime: '15:30' } as never} />
    </ToastProvider></MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Korrektur anfragen' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('06.11.2026 · 07:00–15:30.');
});
