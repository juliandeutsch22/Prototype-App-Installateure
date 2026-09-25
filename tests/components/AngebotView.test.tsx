import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Quote } from '@/types';
import { karteMitZahl, karteZaehlt } from './kartenZahl';

/**
 * Die Angebotsseite.
 *
 * GEMELDET: „ein erstelltes Angebot kann man nicht als PDF herunterladen oder
 * überhaupt ansehen im Nachhinein". Positionen und Anmerkungen gab es nach dem
 * Anlegen nirgends mehr zu sehen, und dem Kunden liess sich nichts schicken.
 */

const ANGEBOT: Quote & { id: string } = {
  id: '11111111-2222-3333-4444-555555555555',
  companyId: 'perl',
  quoteNumber: 'AN-2026-0007',
  customerId: 'k1',
  customerName: 'Gemeinde Neudorf',
  address: 'Volksschule, Schulgasse 2, 2700 Wiener Neustadt',
  quoteDate: '2026-09-01',
  validUntil: '2099-10-01',
  status: 'Versendet',
  positions: [
    { label: 'Facharbeiterstunden', qty: 16, unit: 'h', unitPrice: 78, netto: 1248 },
    { label: 'Geberit Duofix', qty: 1, unit: 'Stk', unitPrice: 289.9, netto: 289.9 },
  ],
  subtotalNetto: 1537.9,
  totalNetto: 1537.9,
  totalVat: 307.58,
  totalBrutto: 1845.48,
  vatRate: 0.2,
  kalkulierteStunden: 16,
  notes: 'WC im Erdgeschoss tauschen.\nArbeiten nur in den Ferien.',
};

const KUNDE: Customer & { id: string } = {
  id: 'k1',
  companyId: 'perl',
  name: 'Gemeinde Neudorf',
  address: 'Rathausplatz 1, 2700 Wiener Neustadt',
};

let angebot: (Quote & { id: string }) | null = ANGEBOT;
let kundeScheitert = false;
const updateQuote = vi.fn<[string, unknown], Promise<void>>(async () => undefined);
const deleteQuote = vi.fn<[string], Promise<void>>(async () => undefined);
const pdf = vi.fn<[unknown], Promise<void>>(async () => undefined);
const annehmen = vi.fn(async () => ({ projectNumber: 'B-2026-0007', abgeleitet: 'B-2026-0007' }));

vi.mock('@/lib/db/quotes', () => ({
  getQuote: vi.fn(async () => angebot),
  updateQuote: (id: string, d: unknown) => updateQuote(id, d),
  deleteQuote: (id: string) => deleteQuote(id),
}));
vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: vi.fn(async () => {
    if (kundeScheitert) throw new Error('kein Netz');
    return [KUNDE];
  }),
}));
vi.mock('@/features/quotes/angebotPdf', () => ({
  downloadAngebotPdf: (o: unknown) => pdf(o),
}));
vi.mock('@/features/quotes/angebotAnnehmen', () => ({
  angebotAnnehmen: (...a: unknown[]) => annehmen(...(a as [])),
  annahmeMeldung: (r: { projectNumber: string }) => `Baustelle ${r.projectNumber} angelegt`,
}));

const rolle = { wert: 'Geschäftsführung' as string };
const authWert = {
  user: {
    uid: 'chef',
    email: 'chefin@perl.at',
    name: 'Chefin',
    get role() {
      return rolle.wert as 'Geschäftsführung';
    },
    companyId: 'perl',
    docId: 'chef',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: AngebotView } = await import('@/features/quotes/AngebotView');

function zeige(id = ANGEBOT.id) {
  return render(
    <MemoryRouter initialEntries={[`/quotes/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/quotes/:id" element={<AngebotView />} />
          <Route path="/quotes" element={<p>Angebotsliste</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  angebot = { ...ANGEBOT };
  kundeScheitert = false;
  rolle.wert = 'Geschäftsführung';
  updateQuote.mockClear();
  deleteQuote.mockClear();
  pdf.mockClear();
  annehmen.mockClear();
});

describe('Ein Angebot ansehen', () => {
  it('zeigt Positionen, Summen und Anmerkungen', async () => {
    zeige();
    const positionen = await karteMitZahl(/^Positionen/, 2);
    expect(within(positionen).getByText('Facharbeiterstunden')).toBeInTheDocument();
    expect(within(positionen).getByText('Geberit Duofix')).toBeInTheDocument();
    expect(within(positionen).getByText(/16 h ×/)).toBeInTheDocument();
    expect(within(positionen).getByText('Brutto').nextSibling).toHaveTextContent(/1.845,48/);
    expect(screen.getByText(/WC im Erdgeschoss tauschen/)).toBeInTheDocument();
  });

  it('verlinkt Kunde und — nach der Annahme — die Baustelle', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007', projectId: 'p9' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Gemeinde Neudorf' })).toHaveAttribute(
      'href',
      '/customers/k1',
    );
    expect(screen.getByRole('link', { name: 'B-2026-0007' })).toHaveAttribute(
      'href',
      '/admin-projects/p9',
    );
  });

  it('sagt „gibt es nicht", statt einen Ladefehler vorzutäuschen', async () => {
    angebot = null;
    zeige();
    expect(await screen.findByText(/gibt es nicht \(mehr\)/)).toBeInTheDocument();
  });

  it('warnt, wenn die Bindefrist eines offenen Angebots abgelaufen ist', async () => {
    angebot = { ...ANGEBOT, validUntil: '2020-01-01' };
    zeige();
    expect(await screen.findByText('Bindefrist abgelaufen')).toBeInTheDocument();
  });
});

describe('Das PDF', () => {
  it('geht mit der Anschrift aus dem Kundenstamm hinaus', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await karteZaehlt(/^Positionen/, 2);
    await nutzer.click(screen.getByRole('button', { name: /PDF herunterladen/ }));
    expect(pdf).toHaveBeenCalledTimes(1);
    const o = pdf.mock.calls[0][0] as { quote: Quote; kunde: Customer };
    expect(o.quote.quoteNumber).toBe('AN-2026-0007');
    expect(o.kunde.address).toBe('Rathausplatz 1, 2700 Wiener Neustadt');
  });

  it('wartet, wenn der Kunde nicht geladen werden konnte — statt an die falsche Anschrift', async () => {
    kundeScheitert = true;
    zeige();
    expect(await screen.findByText(/Anschrift des Kunden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeDisabled();
  });
});

describe('Weiter mit dem Angebot', () => {
  it('nimmt an und legt die Baustelle an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Annehmen → Baustelle' }));
    // Erst die Rückfrage (Launch-Check, M8) — vorher legte der Klick allein an.
    expect(annehmen).not.toHaveBeenCalled();
    await nutzer.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annehmen' }));
    expect(annehmen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Baustelle B-2026-0007 angelegt')).toBeInTheDocument();
  });

  it('vermerkt die Ablehnung', async () => {
    const nutzer = userEvent.setup();
    zeige();
    // Ablehnen ist selten und liegt im ⋯ der Karte „Weiter“ (docs/design/linie.md 3).
    await nutzer.click(await screen.findByRole('button', { name: /Weitere Aktionen für Angebot/ }));
    await nutzer.click(screen.getByRole('menuitem', { name: 'Abgelehnt' }));
    expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Abgelehnt' });
  });

  it('löscht einen Entwurf nach Rückfrage und kehrt zur Liste zurück', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const nutzer = userEvent.setup();
    zeige();
    // Löschen liegt im ⋯ der Karte „Weiter“, wie in der Angebotsliste.
    await nutzer.click(await screen.findByRole('button', { name: /Weitere Aktionen für Angebot/ }));
    await nutzer.click(screen.getByRole('menuitem', { name: 'Löschen' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: /Löschen|Bestätigen|Ja/ }));
    expect(deleteQuote).toHaveBeenCalledWith(ANGEBOT.id);
    expect(await screen.findByText('Angebotsliste')).toBeInTheDocument();
  });

  it('führt einen Entwurf zum Bearbeiten — ein versendetes Angebot nicht', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const { unmount } = zeige();
    expect(await screen.findByRole('link', { name: 'Bearbeiten' }))
      .toHaveAttribute('href', `/quotes?bearbeiten=${ANGEBOT.id}`);
    unmount();

    angebot = { ...ANGEBOT, status: 'Versendet' };
    zeige();
    await screen.findByRole('button', { name: /Annehmen/ });
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('bietet ein angenommenes Angebot nicht noch einmal zum Annehmen an', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    await screen.findByText(/Positionen/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    // Ansehen und PDF bleiben.
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });

  it('lässt die Buchhaltung ansehen, aber nichts ändern', async () => {
    rolle.wert = 'Buchhaltung';
    zeige();
    await screen.findByText(/Positionen/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });
});

describe('Am Schreibtisch zwei Spalten', () => {
  /** Die Karte zu einem Titel. */
  const karte = (titel: RegExp) => screen.getByRole('heading', { name: titel }).closest('section')!;

  it('stellt das Angebot selbst links und was daraus folgt rechts', async () => {
    zeige();
    await screen.findByText(/Positionen/);
    for (const titel of [/^Angaben/, /^Positionen/, /^Anmerkungen/]) {
      expect(karte(titel).parentElement!.className).toBe('akte-links');
    }
    expect(karte(/^Weiter/).parentElement!.className).toBe('akte-rechts');
    expect(karte(/^Weiter/).closest('.akte')).not.toBeNull();
  });

  it('bleibt einspaltig, wenn rechts nichts zu tun ist — keine leere Spalte', async () => {
    rolle.wert = 'Buchhaltung';
    const { container } = zeige();
    await screen.findByText(/Positionen/);
    expect(container.querySelector('.akte')).toBeNull();
    expect(container.querySelector('.akte-rechts')).toBeNull();
    expect(karte(/^Positionen/).closest('.akte-einspaltig')).not.toBeNull();
  });
});
