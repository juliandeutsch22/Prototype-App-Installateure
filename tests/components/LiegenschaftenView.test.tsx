import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Liegenschaft } from '@/types';

/**
 * DIE LISTE „LIEGENSCHAFTEN“ (M02c, A09): gesucht auf dem Server über
 * Bezeichnung, Anschrift und Beteiligte (Suche und Auswahl in der Adresse),
 * seitenweise mit „Weitere anzeigen“, jede Zeile führt zur Akte, „Neue
 * Liegenschaft“ nur, wer Kunden pflegen darf — und nicht im Supporteinblick.
 *
 * Gegenprobe: ohne `LiegenschaftenView.tsx` gibt es nichts zu zeigen — rot;
 * ohne die Rechteprüfung am Knopf der Fall der Buchhaltung.
 */

const l = (n: number, x: Partial<Liegenschaft> = {}): Liegenschaft => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, companyId: 'perl', bezeichnung: `Haus ${n}`,
  anschrift: `Gasse ${n}, 1010 Wien`, aktiv: true, ...x,
});

let seiten: Liegenschaft[][] = [];
const listLiegenschaften = vi.fn(async (_c: string, o: { suche?: string; nurAktive?: boolean; nach?: unknown }) => {
  const i = o.nach ? 1 : 0;
  return { zeilen: seiten[i] ?? [], weiter: i === 0 && seiten.length > 1 ? { bezeichnung: 'x', id: 'y' } : null };
});
const liegenschaftAnlegen = vi.fn(async () => 'neu-id');
vi.mock('@/lib/db/liegenschaften', () => ({
  listLiegenschaften: (c: string, o: { suche?: string; nurAktive?: boolean; nach?: unknown }) => listLiegenschaften(c, o),
  liegenschaftAnlegen: (...a: unknown[]) => liegenschaftAnlegen(...(a as [])),
  liegenschaftAendern: vi.fn(async () => undefined),
}));

let nutzer: Record<string, unknown> = {};
let einblick: unknown = null;
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: nutzer, company: { id: 'perl', name: 'Perl', modules: { 'kunden.liegenschaften': true } }, einblick }),
}));

const { default: LiegenschaftenView } = await import('@/features/liegenschaften/LiegenschaftenView');

function Adresse() {
  const loc = useLocation();
  return <output data-testid="adresse">{loc.pathname}{loc.search}</output>;
}
const zeige = (start = '/liegenschaften') => render(
  <MemoryRouter initialEntries={[start]}>
    <ToastProvider>
      <Routes>
        <Route path="/liegenschaften" element={<><LiegenschaftenView /><Adresse /></>} />
        <Route path="/liegenschaften/:id" element={<Adresse />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  nutzer = { uid: 'v1', companyId: 'perl', role: 'Verwaltung', name: 'Vera', kundenPflegen: true };
  einblick = null;
  seiten = [[l(1), l(2, { aktiv: false })]];
  listLiegenschaften.mockClear();
  liegenschaftAnlegen.mockClear();
});

describe('Die Liste', () => {
  it('zeigt Bezeichnung und Anschrift; die ganze Zeile öffnet die Akte', async () => {
    const nutzerEv = userEvent.setup();
    zeige();
    const zeile = await screen.findByRole('link', { name: /Haus 1/ });
    expect(screen.getByText('Gasse 1, 1010 Wien')).toBeInTheDocument();
    // Die inaktive steht unter „Alle“-Treffern mit ihrem Zustand.
    expect(screen.getByRole('link', { name: /Haus 2/ })).toBeInTheDocument();
    expect(screen.getByText('inaktiv')).toBeInTheDocument();
    expect(listLiegenschaften).toHaveBeenCalledWith('perl', { suche: '', nurAktive: true });
    await nutzerEv.click(zeile);
    expect(screen.getByTestId('adresse')).toHaveTextContent(`/liegenschaften/${l(1).id}`);
  });

  it('sucht auf dem Server — die Suche und „Alle“ stehen in der Adresse', async () => {
    const nutzerEv = userEvent.setup();
    zeige();
    await screen.findByRole('link', { name: /Haus 1/ });
    await nutzerEv.type(screen.getByRole('searchbox', { name: 'Liegenschaften suchen' }), 'Huber');
    await waitFor(() => expect(listLiegenschaften).toHaveBeenLastCalledWith('perl', { suche: 'Huber', nurAktive: true }));
    expect(screen.getByTestId('adresse')).toHaveTextContent('suche=Huber');
    await nutzerEv.click(screen.getByRole('button', { name: 'Alle' }));
    await waitFor(() => expect(listLiegenschaften).toHaveBeenLastCalledWith('perl', { suche: 'Huber', nurAktive: false }));
  });

  it('„Weitere anzeigen“ holt die nächste Seite ab der letzten Zeile', async () => {
    const nutzerEv = userEvent.setup();
    seiten = [[l(1)], [l(3)]];
    zeige();
    await screen.findByRole('link', { name: /Haus 1/ });
    await nutzerEv.click(screen.getByRole('button', { name: /Weitere anzeigen/ }));
    expect(await screen.findByRole('link', { name: /Haus 3/ })).toBeInTheDocument();
    expect(listLiegenschaften).toHaveBeenLastCalledWith('perl', { suche: '', nurAktive: true, nach: { bezeichnung: 'x', id: 'y' } });
  });

  it('ohne Treffer sagt es, wonach gesucht wurde', async () => {
    seiten = [[]];
    zeige('/liegenschaften?suche=Nirgends');
    expect(await screen.findByText(/Keine Liegenschaft passt zu „Nirgends“/)).toBeInTheDocument();
  });
});

describe('Anlegen', () => {
  it('wer Kunden pflegt, legt an — mit Bezeichnung als Pflicht — und landet in der Akte', async () => {
    const nutzerEv = userEvent.setup();
    zeige();
    await nutzerEv.click(await screen.findByRole('button', { name: 'Neue Liegenschaft' }));
    await nutzerEv.click(screen.getByRole('button', { name: 'Liegenschaft anlegen' }));
    expect(await screen.findByText(/Bitte eine Bezeichnung angeben/)).toBeInTheDocument();
    expect(liegenschaftAnlegen).not.toHaveBeenCalled();
    await nutzerEv.type(screen.getByLabelText(/^Bezeichnung/), 'WHA Hauptstraße 12');
    await nutzerEv.type(screen.getByLabelText('Straße und Hausnummer'), 'Hauptstraße 12');
    await nutzerEv.click(screen.getByRole('button', { name: 'Liegenschaft anlegen' }));
    await waitFor(() => expect(liegenschaftAnlegen).toHaveBeenCalledWith('perl', expect.objectContaining({
      bezeichnung: 'WHA Hauptstraße 12', strasse: 'Hauptstraße 12', land: 'AT',
    })));
    expect(await screen.findByTestId('adresse')).toHaveTextContent('/liegenschaften/neu-id');
  });

  it('ohne das Recht „Kunden pflegen“ und im Supporteinblick kein Knopf', async () => {
    nutzer = { uid: 'b1', companyId: 'perl', role: 'Buchhaltung', name: 'Berta', kundenPflegen: false };
    zeige();
    await screen.findByRole('link', { name: /Haus 1/ });
    expect(screen.queryByRole('button', { name: 'Neue Liegenschaft' })).toBeNull();
  });

  it('im Supporteinblick auch für die Führung nur lesen', async () => {
    nutzer = { uid: 'gf', companyId: 'perl', role: 'Geschäftsführung', name: 'Carla' };
    einblick = { betrieb: 'perl' };
    zeige();
    await screen.findByRole('link', { name: /Haus 1/ });
    expect(screen.queryByRole('button', { name: 'Neue Liegenschaft' })).toBeNull();
  });
});
