import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { ZuVerbuchen, VerbuchtErgebnis } from '@/lib/db/kontoauszug';

/**
 * KONTOAUSZUG ABGLEICHEN (F13) — der ganze Weg in der Ansicht: Datei wählen,
 * Vorschläge sehen (zugeordnet vorgewählt, „bitte prüfen“ nicht, „ohne
 * Zuordnung“ sichtbar), von Hand zuordnen, mit Rückfrage verbuchen — und
 * danach neu abgleichen, mit dem Grund an einer abgewiesenen Zeile.
 */

const OFFEN = [
  { id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-1001', customerName: 'Maria Huber', invoiceDate: '2026-10-01',
    dueDate: '2026-10-31', projectNumber: 'B-1', totalNetto: 100, totalVat: 20, totalBrutto: 120, bezahltBetrag: 0,
    paymentStatus: 'Offen', skontoBetrag: 0, mahnkostenBetrag: 0, mahnstufe: 0 },
  { id: 'r2', companyId: 'perl', invoiceNumber: 'RE-2026-1002', customerName: 'Bau Meier GmbH', invoiceDate: '2026-10-02',
    dueDate: '2026-11-01', projectNumber: 'B-2', totalNetto: 500, totalVat: 100, totalBrutto: 600, bezahltBetrag: 0,
    paymentStatus: 'Offen', skontoBetrag: 0, mahnkostenBetrag: 0, mahnstufe: 0 },
];
let offen = OFFEN;
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoiceKoepfe: vi.fn(async () => offen),
  listMahnungenZurRechnung: vi.fn(async () => []),
}));
vi.mock('@/lib/db/zahlungen', () => ({ listZahlungenImZeitraum: vi.fn(async () => []) }));

let verbucht = new Map<string, { am: number }>();
const kontoauszugVerbuchen = vi.fn<(p: ZuVerbuchen[]) => Promise<VerbuchtErgebnis[]>>();
vi.mock('@/lib/db/kontoauszug', () => ({
  kontoauszugVerbuchen: (p: ZuVerbuchen[]) => kontoauszugVerbuchen(p),
  kontoauszugSchonVerbucht: vi.fn(async () => verbucht),
  rechnungsKoepfeNachNummer: vi.fn(async () => []),
}));

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'b', email: 'b@perl.at', name: 'Bea', role: 'Buchhaltung', companyId: 'perl', docId: 'b' },
    company: { id: 'perl', name: 'Perl Installationen', praefixRechnung: 'RE' },
  }),
}));

const { default: KontoauszugView } = await import('@/features/invoices/KontoauszugView');

const CSV = [
  'Buchungsdatum;Partnername;Betrag;Währung;Zahlungsreferenz',
  '10.11.2026;Maria Huber;120,00;EUR;RE-2026-1001',
  '10.11.2026;Unbekannt GmbH;77,70;EUR;Danke',
  '10.11.2026;Stadtwerke;-50,00;EUR;Strom',
].join('\n');

function zeige() {
  return render(
    <MemoryRouter initialEntries={['/invoices/kontoauszug']}>
      <ToastProvider>
        <KontoauszugView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function dateiWaehlen(inhalt = CSV) {
  const feld = document.getElementById('kontoauszug-datei') as HTMLInputElement;
  const f = new File([inhalt], 'umsaetze.csv', { type: 'text/csv' });
  // jsdom kennt `File.arrayBuffer` je nach Fassung nicht (wie in `KundenImport.test.tsx`).
  Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(new TextEncoder().encode(inhalt).buffer) });
  await userEvent.upload(feld, f);
}

beforeEach(() => {
  offen = OFFEN;
  verbucht = new Map();
  kontoauszugVerbuchen.mockReset();
});

describe('Kontoauszug abgleichen', () => {
  it('zeigt Vorschläge: zugeordnet vorgewählt, ohne Zuordnung sichtbar, Abbuchungen genannt', async () => {
    zeige();
    await dateiWaehlen();
    expect(await screen.findByRole('heading', { name: /Zugeordnet \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText('Gleicht RE-2026-1001 aus.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /über €\s120,00 verbuchen/ })).toBeChecked();
    expect(screen.getByRole('heading', { name: /Ohne Zuordnung \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Nicht abgeglichen: 1 Abbuchung\./)).toBeInTheDocument();
    // Ohne Zuordnung gibt es nichts zu verbuchen — kein Häkchen.
    expect(screen.queryByRole('checkbox', { name: /über €\s77,70 verbuchen/ })).toBeNull();
    expect(screen.getByRole('button', { name: '1 Eingang verbuchen' })).toBeInTheDocument();
  });

  it('verbucht nach Rückfrage genau das Gewählte und gleicht danach neu ab', async () => {
    kontoauszugVerbuchen.mockImplementation(async (p) => {
      verbucht = new Map(p.map((x) => [x.kennung, { am: Date.now() }]));
      offen = [{ ...OFFEN[0], bezahltBetrag: 120, paymentStatus: 'Bezahlt' }, OFFEN[1]];
      return p.map((x) => ({ kennung: x.kennung, ergebnis: 'gebucht' as const }));
    });
    zeige();
    await dateiWaehlen();
    await userEvent.click(await screen.findByRole('button', { name: '1 Eingang verbuchen' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Zusammen €\s120,00 auf 1 Rechnung,/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verbuchen' }));
    await waitFor(() => expect(kontoauszugVerbuchen).toHaveBeenCalledTimes(1));
    const [posten] = kontoauszugVerbuchen.mock.calls[0];
    expect(posten).toHaveLength(1);
    expect(posten[0]).toMatchObject({
      buchungstag: '2026-11-10', betrag: 120, hinweis: 'Kontoauszug: Maria Huber — RE-2026-1001',
      teile: [{ rechnung: 'r1', betrag: 120, skonto: 0, mahnkosten: 0 }],
    });
    expect(posten[0].kennung).toMatch(/^[0-9a-f]{64}$/);
    // Neu abgeglichen: die Bewegung steht unter „Schon erfasst“.
    expect(await screen.findByRole('heading', { name: /Schon erfasst \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Zugeordnet/ })).toBeNull();
  });

  it('von Hand zuordnen: die Zeile antippen, Rechnung und Betrag wählen, übernehmen — dann gewählt', async () => {
    zeige();
    await dateiWaehlen();
    await userEvent.click(await screen.findByRole('button', { name: /Unbekannt GmbH/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Zuordnung' });
    await userEvent.selectOptions(within(fenster).getByLabelText('Rechnung'), 'r2');
    expect(within(fenster).getByLabelText('Auf die Rechnung (€)')).toHaveValue('77,7');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Übernehmen' }));
    expect(await screen.findByRole('checkbox', { name: /über €\s77,70 verbuchen/ })).toBeChecked();
    expect(screen.getByRole('button', { name: '2 Eingänge verbuchen' })).toBeInTheDocument();
  });

  it('Gegenprobe: mehr zuordnen als eingegangen lässt sich nicht übernehmen', async () => {
    zeige();
    await dateiWaehlen();
    await userEvent.click(await screen.findByRole('button', { name: /Unbekannt GmbH/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Zuordnung' });
    await userEvent.selectOptions(within(fenster).getByLabelText('Rechnung'), 'r2');
    const betrag = within(fenster).getByLabelText('Auf die Rechnung (€)');
    await userEvent.clear(betrag);
    await userEvent.type(betrag, '80');
    expect(within(fenster).getByRole('alert')).toHaveTextContent(/mehr als eingegangen/);
    expect(within(fenster).getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
  });

  it('eine abgewiesene Bewegung behält ihren Grund aus der Datenbank', async () => {
    kontoauszugVerbuchen.mockImplementation(async (p) => p.map((x) => ({
      kennung: x.kennung, ergebnis: 'abgewiesen' as const, grund: 'Diese Rechnung sagt keinen Skonto zu.',
    })));
    zeige();
    await dateiWaehlen();
    await userEvent.click(await screen.findByRole('button', { name: '1 Eingang verbuchen' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Verbuchen' }));
    expect(await screen.findByText('Abgewiesen: Diese Rechnung sagt keinen Skonto zu.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /über €\s120,00 verbuchen/ })).toBeChecked();
  });

  it('eine Datei, die kein Auszug ist, sagt, was zu tun ist — nichts wird geraten', async () => {
    zeige();
    await dateiWaehlen('Name;Ort\nHuber;Wien\nMaier;Graz');
    expect(await screen.findByText(/Datum und Betrag nicht erkennen/)).toBeInTheDocument();
  });
});
