import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Quote } from '@/types';

/**
 * Das Angebot schließt die Kette nach vorne — und genau eine Zahl daraus
 * entscheidet später über die Budget-Ampel der Baustelle: die kalkulierte
 * Arbeitszeit.
 *
 * Der Fehler, den dieser Test verhindert, ist der naheliegende: alle Zeilen
 * mit der Einheit „h" zu summieren. Eine Anfahrtspauschale wird oft in
 * Stunden angesetzt und ist trotzdem keine Arbeitszeit. Zählte sie mit,
 * bekäme die Baustelle ein zu hohes Budget, und die Ampel bliebe grün,
 * während der Auftrag längst gerissen ist — ein Fehler, der Geld kostet und
 * erst bei der Nachkalkulation auffällt.
 */

const kunden: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Gemeinde Neudorf', address: 'Rathausplatz 1' },
];

/**
 * Mit Parametern TYPISIERT, nicht benannt: sonst leitet TypeScript ein leeres
 * Tupel ab und der Zugriff auf `mock.calls[0][1]` scheitert im Build. Die
 * Signatur steht deshalb als Typ da, ohne unbenutzte Bezeichner.
 */
const createQuote = vi.fn<[string, unknown], Promise<string>>(async () => 'q1');
const createProject = vi.fn<[string, unknown], Promise<string>>(async () => 'p1');
const updateQuote = vi.fn<[string, unknown], Promise<void>>(async () => undefined);
const angebote: (Quote & { id: string })[] = [];

vi.mock('@/lib/db/quotes', () => ({
  listRecentQuotes: vi.fn(async () => angebote),
  createQuote: (c: string, q: unknown) => createQuote(c, q),
  updateQuote: (id: string, d: unknown) => updateQuote(id, d),
  deleteQuote: vi.fn(async () => undefined),
  reserveQuoteNumber: vi.fn(async () => 'AN-2026-0001'),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));
vi.mock('@/lib/db/projects', () => ({
  createProject: (c: string, p: unknown) => createProject(c, p),
  listActiveProjects: vi.fn(async () => []),
}));

const authWert = {
  user: {
    uid: 'chef',
    email: 'chefin@perl.at',
    name: 'Julian Deutsch',
    role: 'Geschäftsführung' as const,
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

const { default: QuotesView } = await import('@/features/quotes/QuotesView');

function zeichne() {
  return render(
    <ToastProvider>
      <QuotesView />
    </ToastProvider>,
  );
}

/**
 * Das Kalkulationsformular aufklappen.
 *
 * SEIT DEM 18.09. STEHT ES NICHT MEHR OFFEN. Gemessen am Telefon begann die
 * Angebotsliste bei 1332 px — gut zwei Bildschirme unter der Kante, und
 * darüber das längste Formular der App.
 */
async function formOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: 'Neues Angebot' }));
}

beforeEach(() => {
  createQuote.mockClear();
  createProject.mockClear();
  updateQuote.mockClear();
  angebote.length = 0;
});

describe('Angebot kalkulieren', () => {
  it('zeigt die Liste zuerst, nicht die leere Kalkulation', async () => {
    // Gemessen: 1332 px bis zur ersten Zeile. Das Kalkulationsformular ist
    // das längste der vier Ansichten und der seltenste Vorgang.
    zeichne();
    await screen.findByRole('button', { name: 'Neues Angebot' });
    expect(screen.queryByLabelText('Kunde')).not.toBeInTheDocument();
  });

  it('klappt die Kalkulation auf und wieder zu', async () => {
    zeichne();
    await formOeffnen();
    expect(screen.getByLabelText('Kunde')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByLabelText('Kunde')).not.toBeInTheDocument();
  });

  it('zählt nur echte Arbeitszeit ins Stundenbudget', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();

    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');

    // Zeile 1: 20 Stunden Montage — echte Arbeitszeit.
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Montage Heizung');
    await nutzer.type(screen.getByLabelText('Menge'), '20');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '65');

    // Zeile 2: Anfahrtspauschale, ebenfalls in „h" — aber KEINE Arbeitszeit.
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    const bezeichnungen = screen.getAllByLabelText('Bezeichnung');
    const mengen = screen.getAllByLabelText('Menge');
    const preise = screen.getAllByLabelText('Einzelpreis netto');
    await nutzer.type(bezeichnungen[1], 'Anfahrtspauschale');
    await nutzer.type(mengen[1], '2');
    await nutzer.type(preise[1], '45');
    await nutzer.click(screen.getAllByRole('checkbox')[1]);

    // 20 h, nicht 22 — die Pauschale zählt nicht mit.
    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('20 h');

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));

    const uebergeben = createQuote.mock.calls[0]?.[1] as unknown as Quote;
    expect(uebergeben.kalkulierteStunden).toBe(20);
    // Der Preis enthält beide Zeilen: 20×65 + 2×45 = 1390 netto.
    expect(uebergeben.totalNetto).toBe(1390);
    expect(uebergeben.positions).toHaveLength(2);
  });

  it('rechnet Netto, USt und Brutto mit derselben Funktion wie die Rechnung', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Pauschale');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '1000');

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    const q = createQuote.mock.calls[0]?.[1] as unknown as Quote;
    expect(q.totalNetto).toBe(1000);
    expect(q.totalVat).toBe(200); // 20 % Standard
    expect(q.totalBrutto).toBe(1200);
  });

  it('legt beim Annehmen die Baustelle MIT Stundenbudget an', async () => {
    angebote.push({
      id: 'q1',
      companyId: 'perl',
      quoteNumber: 'AN-2026-0007',
      customerId: 'k1',
      customerName: 'Gemeinde Neudorf',
      address: 'Rathausplatz 1',
      quoteDate: '2026-09-01',
      validUntil: '2026-10-01',
      status: 'Versendet',
      positions: [],
      subtotalNetto: 1300,
      totalNetto: 1300,
      totalVat: 260,
      totalBrutto: 1560,
      vatRate: 0.2,
      kalkulierteStunden: 20,
    });
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);

    await nutzer.click(screen.getByRole('button', { name: /Annehmen/ }));

    /**
     * Der eigentliche Zweck des ganzen Schritts: das Stundenbudget stammt aus
     * der Kalkulation und nicht aus einem zweiten Mal Abtippen. Erst damit
     * misst die Budget-Ampel gegen eine Zahl mit Herkunft.
     */
    const projekt = createProject.mock.calls[0]?.[1] as unknown as {
      estimatedHours?: number;
      projectNumber: string;
      customerId?: string;
    };
    expect(projekt.estimatedHours).toBe(20);
    // Nummer bleibt zuordenbar: AN-2026-0007 -> B-2026-0007.
    expect(projekt.projectNumber).toBe('B-2026-0007');
    expect(projekt.customerId).toBe('k1');
    expect(updateQuote).toHaveBeenCalledWith('q1', {
      status: 'Angenommen',
      projectNumber: 'B-2026-0007',
    });
  });
});
