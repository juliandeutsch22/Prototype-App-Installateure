import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Invoice, Project, TimeEntry } from '@/types';
import InvoicesView from '@/features/invoices/InvoicesView';

/**
 * Die Rechnungsansicht — bis jetzt ohne eigenen Test, und dabei die Ansicht,
 * in der Geld entsteht.
 *
 * Die Rechenteile sind abgedeckt (`assemble`, `totals`, `invoiceNumbers`).
 * Was fehlte, ist die REIHENFOLGE: Nummer verbindlich ziehen, Belege sperren,
 * dann anlegen. Genau daran hängt, ob eine Nummer zweimal vergeben oder ein
 * Zeiteintrag zweimal verrechnet werden kann — und beides merkt man erst beim
 * Steuerberater.
 */

const PROJEKT: Project & { id: string } = {
  id: 'p1',
  companyId: 'perl',
  projectNumber: '2026-042',
  customerName: 'Familie Huber',
  address: 'Bergweg 3',
  status: 'Aktiv',
} as Project & { id: string };

const ZEIT: TimeEntry & { id: string } = {
  id: 'z1',
  companyId: 'perl',
  userId: 'u1',
  userName: 'Max',
  date: '2026-08-20',
  status: 'Anwesend',
  startTime: '08:00',
  endTime: '16:00',
  breakDuration: 0,
  projectNumber: '2026-042',
} as TimeEntry & { id: string };

let rechnungen: (Invoice & { id: string })[] = [];
let zeiten: (TimeEntry & { id: string })[] = [];
let reservierteNummer = 'RE-2026-1099';
let reservierungWirft: Error | null = null;

const reserve = vi.fn();
const markiere = vi.fn();
const lege = vi.fn();
const reihenfolge: string[] = [];

vi.mock('@/lib/db/invoices', async () => {
  const echt = await vi.importActual<typeof import('@/lib/invoiceNumbers')>('@/lib/invoiceNumbers');
  return {
    // Die reinen Nummernregeln sind echt — sie sind der Kern der Sache.
    nextInvoiceNumber: echt.nextInvoiceNumber,
    isInvoiceNumberTaken: echt.isInvoiceNumberTaken,
    highestInvoiceSeq: echt.highestInvoiceSeq,
    invoiceSeqOf: echt.invoiceSeqOf,
    subscribeRecentInvoices: (
      _c: string,
      _g: number,
      cb: (rows: (Invoice & { id: string })[]) => void,
    ) => {
      cb(rechnungen);
      return () => undefined;
    },
    reserveInvoiceNumber: (c: string, opts: { seedFrom: number; desired?: number }) => {
      reihenfolge.push('reserve');
      reserve(c, opts);
      if (reservierungWirft) return Promise.reject(reservierungWirft);
      return Promise.resolve(reservierteNummer);
    },
    markBilled: (...a: unknown[]) => {
      reihenfolge.push('markBilled');
      markiere(...a);
      return Promise.resolve();
    },
    createInvoice: (_c: string, inv: Invoice) => {
      reihenfolge.push('createInvoice');
      lege(inv);
      return Promise.resolve('neu');
    },
    updateInvoiceStatus: vi.fn(async () => undefined),
    cancelInvoice: vi.fn(async () => undefined),
    reactivateInvoice: vi.fn(async () => undefined),
    deleteInvoice: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [PROJEKT]),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => []) }));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: vi.fn(async () => zeiten),
}));

// Das PDF wird beim Bestätigen dynamisch nachgeladen und hat mit der Frage
// dieses Tests nichts zu tun.
vi.mock('@/features/invoices/pdf', () => ({ downloadInvoicePdf: vi.fn() }));

const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Buchhaltung' as const },
  company: { id: 'perl', name: 'Perl Installationen', rates: undefined },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <InvoicesView />
    </ToastProvider>,
  );
}

/** Baustelle wählen und die Positionen zusammenstellen lassen. */
async function bisZurVorschau() {
  zeige();
  const auswahl = await screen.findByLabelText(/Baustelle/);
  await userEvent.selectOptions(auswahl, '2026-042');
  await userEvent.click(screen.getByRole('button', { name: 'Positionen zusammenstellen' }));
  return screen.findByRole('button', { name: /Rechnung erstellen/ });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  rechnungen = [];
  zeiten = [ZEIT];
  reservierteNummer = 'RE-2026-1099';
  reservierungWirft = null;
  reihenfolge.length = 0;
  reserve.mockClear();
  markiere.mockClear();
  lege.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Rechnungen — der Weg von Zeiten zu einer Rechnung', () => {
  it('sperrt die Belege VOR dem Anlegen der Rechnung', async () => {
    /**
     * Die Reihenfolge ist die eigentliche Aussage. Bricht es nach dem Sperren
     * ab, ist schlimmstenfalls eine Rechnung nicht entstanden — dreht man sie
     * um, ist im Fehlerfall ein Zeiteintrag ein zweites Mal verrechenbar, und
     * der Kunde bekommt dieselbe Stunde zweimal in Rechnung gestellt.
     */
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(reihenfolge).toEqual(['reserve', 'markBilled', 'createInvoice']);
  });

  it('schreibt die RESERVIERTE Nummer in die Rechnung, nicht die vorgeschlagene', async () => {
    /**
     * Der Vorschlag im Feld stammt aus der Liste im Browser und ist veraltet,
     * sobald jemand parallel abrechnet. Verbindlich ist allein, was die
     * Transaktion zurückgibt.
     */
    rechnungen = [{ id: 'alt', invoiceNumber: 'RE-2026-1004' } as Invoice & { id: string }];
    reservierteNummer = 'RE-2026-1099';

    const bestaetigen = await bisZurVorschau();
    // Der Vorschlag im Feld waere 1005 — die Transaktion sagt 1099.
    expect((screen.getByLabelText(/Rechnungsnummer/) as HTMLInputElement).value).toBe(
      'RE-2026-1005',
    );
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0].invoiceNumber).toBe('RE-2026-1099');
    expect(markiere).toHaveBeenCalledWith('timeEntries', ['z1'], 'RE-2026-1099');
  });

  it('zieht ohne Handeingabe KEINE Wunschnummer', async () => {
    // Sonst gaebe der Client vor, welche Nummer die Transaktion vergeben soll
    // — und die Monotonie haenge wieder am Browser.
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBeUndefined();
  });

  it('reicht eine von Hand gesetzte Nummer als Wunsch weiter', async () => {
    const bestaetigen = await bisZurVorschau();
    const feld = screen.getByLabelText(/Rechnungsnummer/);
    await userEvent.clear(feld);
    await userEvent.type(feld, 'RE-2026-2000');
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBe(2000);
  });

  it('gibt die Auskunft der Nummernvergabe unveraendert weiter', async () => {
    /**
     * „Die Nummer RE-2026-1005 ist bereits vergeben. Die nächste freie ist
     * RE-2026-1006." — diese Auskunft ist mehr wert als ein Sammelsatz, denn
     * sie sagt, was stattdessen geht.
     */
    reservierungWirft = new Error(
      'Die Nummer RE-2026-1005 ist bereits vergeben. Die nächste freie ist RE-2026-1006.',
    );
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    expect(await screen.findByText(/bereits vergeben/)).toBeInTheDocument();
    expect(lege).not.toHaveBeenCalled();
  });

  it('legt ohne verrechenbare Stunden gar nichts an', async () => {
    zeiten = [];
    zeige();
    const auswahl = await screen.findByLabelText(/Baustelle/);
    await userEvent.selectOptions(auswahl, '2026-042');
    await userEvent.click(screen.getByRole('button', { name: 'Positionen zusammenstellen' }));

    expect(await screen.findByText(/Keine offenen, verrechenbaren Stunden/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechnung erstellen/ })).toBeNull();
    expect(reserve).not.toHaveBeenCalled();
  });
});
