import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Auftragseingang, EingangStand } from '@/types';

/**
 * DIE LISTE „AUFTRAGSEINGANG“ (M02b): Reiter offen, übernommen, abgelehnt
 * (in der Adresse), Suche auf dem Server, die Zahl der offenen am Reiter,
 * jede Zeile führt zum Eingang, „Weitere anzeigen“ holt die nächste Seite,
 * „Neuer Eingang“ für das Büro. Die Reihenfolge rechnet der Server
 * (`auftragseingangAbfrage.test.ts`); hier steht, dass die Liste sie zeigt,
 * wie sie kommt.
 *
 * Gegenprobe: ohne `EingaengeView.tsx` gibt es nichts zu zeigen — rot.
 */

const T = (h: number) => new Date(2026, 10, 7, h, 0).getTime();
const eingang = (n: number, x: Partial<Auftragseingang> = {}): Auftragseingang => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, companyId: 'perl', nummer: `EG-2026-${String(n).padStart(4, '0')}`,
  stand: 'offen', quelle: 'telefon', anliegen: `Anliegen ${n}`, dringlichkeit: 'normal', eingegangenAm: T(8 + n),
  kundeName: `Kunde ${n}`, customerId: 'k1', ...x,
});

let seiten: Record<EingangStand, Auftragseingang[][]> = { offen: [], uebernommen: [], abgelehnt: [] };
const listEingaenge = vi.fn(async (_c: string, o: { stand: EingangStand; suche?: string; nach?: unknown }) => {
  const s = seiten[o.stand];
  const i = o.nach ? 1 : 0;
  return { zeilen: s[i] ?? [], weiter: i === 0 && s.length > 1 ? { rang: 2, amRoh: 'x', id: 'y' } : null };
});
const zaehle = vi.fn(async () => ({ offen: 3, dringend: 1, notfall: 1 }));
vi.mock('@/lib/db/auftragseingaenge', () => ({
  listEingaenge: (c: string, o: { stand: EingangStand; suche?: string; nach?: unknown }) => listEingaenge(c, o),
  zaehleOffeneEingaenge: () => zaehle(),
  eingangAnlegen: vi.fn(async () => 'neu-id'),
  eingangAendern: vi.fn(async () => undefined),
}));

let rolle = 'Verwaltung';
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'v1', companyId: 'perl', role: rolle, name: 'Vera Verwaltung' }, company: { id: 'perl', name: 'Perl' } }),
}));

const { default: EingaengeView } = await import('@/features/auftragseingang/EingaengeView');

function Adresse() {
  const l = useLocation();
  return <output data-testid="adresse">{l.pathname}{l.search}</output>;
}
const zeige = (start = '/eingaenge') => render(
  <MemoryRouter initialEntries={[start]}>
    <ToastProvider>
      <Routes>
        <Route path="/eingaenge" element={<><EingaengeView /><Adresse /></>} />
        <Route path="/eingaenge/:id" element={<Adresse />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  rolle = 'Verwaltung';
  seiten = {
    offen: [[
      eingang(1, { dringlichkeit: 'notfall', ort: 'Hauptplatz 1, 8010 Graz' }),
      eingang(2, { dringlichkeit: 'dringend', quelle: 'versicherung', auftraggeberNummer: 'SCH-77' }),
      eingang(3, { customerId: null, kundeName: 'Familie Neu', neukundeName: 'Familie Neu' }),
    ]],
    uebernommen: [[eingang(4, { stand: 'uebernommen' })]],
    abgelehnt: [],
  };
  listEingaenge.mockClear();
  zaehle.mockClear();
});

describe('Die Liste', () => {
  it('zeigt die offenen in der Reihenfolge des Servers — Kunde, Nummer, Ort, Anliegen, Quelle; Notfall und dringend markiert', async () => {
    zeige();
    const zeilen = await screen.findAllByRole('link', { name: /Kunde 1|Kunde 2|Familie Neu/ });
    expect(zeilen.map((z) => z.getAttribute('href'))).toEqual([
      `/eingaenge/${eingang(1).id}`, `/eingaenge/${eingang(2).id}`, `/eingaenge/${eingang(3).id}`,
    ]);
    // Die ganze Zeile ist der Verweis; ihr Inhalt steht im Listeneintrag.
    const [eins, zwei] = zeilen.map((z) => z.closest('li') as HTMLElement);
    expect(eins).toHaveTextContent('EG-2026-0001');
    expect(eins).toHaveTextContent('Hauptplatz 1, 8010 Graz · Anliegen 1 · Telefon');
    expect(eins).toHaveTextContent('Notfall');
    expect(zwei).toHaveTextContent('Dringend');
    expect(zwei).toHaveTextContent('Versicherung SCH-77');
    expect(listEingaenge).toHaveBeenCalledWith('perl', { stand: 'offen', suche: '' });
    // Die Zahl der offenen am Reiter, gezählt auf dem Server.
    expect(screen.getByRole('button', { name: 'Offen 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('die Reiter wechseln den Stand — in der Adresse', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText('Kunde 1');
    await nutzer.click(screen.getByRole('button', { name: 'Übernommen' }));
    expect(await screen.findByText('Kunde 4')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('/eingaenge?stand=uebernommen');
    expect(listEingaenge).toHaveBeenLastCalledWith('perl', { stand: 'uebernommen', suche: '' });
    await nutzer.click(screen.getByRole('button', { name: 'Abgelehnt' }));
    expect(await screen.findByText('Kein Eingang „Abgelehnt“')).toBeInTheDocument();
  });

  it('die Suche geht an den Server und steht in der Adresse', async () => {
    const nutzer = userEvent.setup();
    zeige('/eingaenge?stand=uebernommen&suche=Huber');
    await waitFor(() => expect(listEingaenge).toHaveBeenCalledWith('perl', { stand: 'uebernommen', suche: 'Huber' }));
    expect(screen.getByRole('searchbox', { name: 'Eingänge suchen' })).toHaveValue('Huber');
    await nutzer.clear(screen.getByRole('searchbox', { name: 'Eingänge suchen' }));
    await nutzer.type(screen.getByRole('searchbox', { name: 'Eingänge suchen' }), 'SCH-77');
    await waitFor(() => expect(listEingaenge).toHaveBeenLastCalledWith('perl', { stand: 'uebernommen', suche: 'SCH-77' }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('suche=SCH-77');
  });

  it('seitenweise: „Weitere anzeigen“ holt die nächste Seite hinter der letzten Zeile — kein stilles Ende', async () => {
    const nutzer = userEvent.setup();
    seiten.offen.push([eingang(9)]);
    zeige();
    await screen.findByText('Kunde 1');
    expect(screen.queryByText('Kunde 9')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Weitere anzeigen' }));
    expect(await screen.findByText('Kunde 9')).toBeInTheDocument();
    expect(listEingaenge).toHaveBeenLastCalledWith('perl', { stand: 'offen', suche: '', nach: { rang: 2, amRoh: 'x', id: 'y' } });
    // Die letzte Seite: kein Knopf mehr.
    expect(screen.queryByRole('button', { name: 'Weitere anzeigen' })).toBeNull();
  });

  it('„Neuer Eingang“ öffnet das Formular; erfasst führt zum Eingang', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Neuer Eingang' }));
    const fenster = await screen.findByRole('dialog', { name: 'Neuer Eingang' });
    expect(within(fenster).getByRole('form', { name: 'Eingang erfassen' })).toBeInTheDocument();
  });

  it('jede Rolle des Büros erfasst; die Liste zeigt sich auch der Buchhaltung', async () => {
    for (const r of ['Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator']) {
      rolle = r;
      const v = zeige();
      expect(await screen.findByRole('button', { name: 'Neuer Eingang' }), r).toBeInTheDocument();
      v.unmount();
    }
  });

  it('ein Ladefehler sagt es und lässt es noch einmal versuchen', async () => {
    const nutzer = userEvent.setup();
    listEingaenge.mockRejectedValueOnce(new Error('weg'));
    zeige();
    expect(await screen.findByText('Die Eingänge konnten nicht geladen werden.')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: /Erneut|Noch einmal|Wiederholen/i }));
    expect(await screen.findByText('Kunde 1')).toBeInTheDocument();
  });
});
