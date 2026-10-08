import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Quote } from '@/types';

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
const updateQuote = vi.fn<(a0: string, a1: unknown) => Promise<void>>(async () => undefined);
const deleteQuote = vi.fn<(a0: string) => Promise<void>>(async () => undefined);
const pdf = vi.fn<(a0: unknown) => Promise<void>>(async () => undefined);
const annehmen = vi.fn(async () => ({ projectNumber: 'B-2026-0007', abgeleitet: 'B-2026-0007' }));

/** Die Fassungen rundherum (M17). */
let fassungen: (Quote & { id: string })[] = [];
const VORGAENGER = { ...ANGEBOT, id: '99999999-2222-3333-4444-555555555555', quoteNumber: 'AN-2026-0003' };
vi.mock('@/lib/db/quotes', () => ({
  getQuote: vi.fn(async (_c: string, qid: string) => (qid === VORGAENGER.id ? VORGAENGER : angebot)),
  listFassungen: vi.fn(async () => fassungen),
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

/** Die Angebotsliste als Ziel — mit der Adresse, damit ein Test sieht, WOHIN es ging. */
function Liste() {
  const { search } = useLocation();
  return <p>Angebotsliste{search}</p>;
}

/**
 * Seit der Linie „Lot“ liegen die seltenen Aktionen (ablehnen, kopieren,
 * löschen) im „⋯“ des Seitenkopfs — ein Tipp weiter als in der früheren
 * Karte „Weiter“. Was die Tests schützen, bleibt: dass es sie gibt und was
 * sie tun.
 */
async function mehrMenue(nutzer: ReturnType<typeof userEvent.setup>, eintrag: string) {
  await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
  await nutzer.click(screen.getByRole('menuitem', { name: eintrag }));
}

function zeige(id = ANGEBOT.id) {
  return render(
    <MemoryRouter initialEntries={[`/quotes/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/quotes/:id" element={<AngebotView />} />
          <Route path="/quotes" element={<Liste />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  angebot = { ...ANGEBOT };
  fassungen = [];
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
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    expect(within(positionen).getByText('Facharbeiterstunden')).toBeInTheDocument();
    expect(within(positionen).getByText('Geberit Duofix')).toBeInTheDocument();
    expect(within(positionen).getByText(/16 h ×/)).toBeInTheDocument();
    expect(within(positionen).getByText('Brutto').nextSibling).toHaveTextContent(/1.845,48/);
    expect(screen.getByText(/WC im Erdgeschoss tauschen/)).toBeInTheDocument();
  });

  it('Titel mit der Summe ihrer Positionen, Text ohne Beträge, Rabatt an der Position (M18)', async () => {
    angebot = {
      ...ANGEBOT,
      positions: [
        { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10 },
        { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300 },
      ],
    };
    zeige();
    // Gezählt werden die Positionen, nicht Titel und Text.
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    expect(within(positionen).getByText('Bad')).toBeInTheDocument();
    expect(within(positionen).getByText(/Summe € 480,00/)).toBeInTheDocument();
    expect(within(positionen).getByText('Fliesen bauseits')).toBeInTheDocument();
    expect(within(positionen).getByText(/2 Stk × € 100,00, abzüglich 10 % Rabatt/)).toBeInTheDocument();
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

  it('gibt beiden Links die volle Tastfläche (Prüflauf 25.09.2026, P4-09)', async () => {
    // Alleinstehende Links waren nur so hoch wie ihre Zeile (20 px).
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007', projectId: 'p9' };
    zeige();
    const kunde = await screen.findByRole('link', { name: 'Gemeinde Neudorf' });
    expect(kunde.className).toMatch(/\bmin-h-touch\b/);
    expect(screen.getByRole('link', { name: 'B-2026-0007' }).className).toMatch(/\bmin-h-touch\b/);
  });

  it('sagt „gibt es nicht“, statt einen Ladefehler vorzutäuschen', async () => {
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
    await screen.findByText(/Positionen \(2\)/);
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
    await mehrMenue(nutzer, 'Als abgelehnt markieren');
    expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Abgelehnt' });
  });

  it('löscht einen Entwurf nach Rückfrage und kehrt zur Liste zurück', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Löschen');
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
    // Gewartet wird auf den Kartentitel „Positionen (2)“ — „Positionen“ allein steht auch in der Sprungleiste.
    await screen.findByText(/Positionen \(/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    // Ansehen und PDF bleiben.
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });

  it('lässt die Buchhaltung ansehen, aber nichts ändern', async () => {
    rolle.wert = 'Buchhaltung';
    zeige();
    await screen.findByText(/Positionen \(/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    // Auch das „⋯“ mit Ablehnen, Kopieren und Löschen gibt es für sie nicht.
    expect(screen.queryByRole('button', { name: /^Weitere Aktionen/ })).toBeNull();
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });
});

/*
  TESTBERICHT 30.09.2026, M17 — überarbeiten ohne zu ändern: neue Fassung
  oder Kopie, und die Fassungen verweisen aufeinander.
*/
describe('Fassungen eines Angebots (M17)', () => {
  it('bietet beim versendeten Angebot „Neue Fassung“ und „Als Kopie anlegen“ an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByRole('link', { name: 'Neue Fassung' })).toHaveAttribute(
      'href', `/quotes?neueFassung=${ANGEBOT.id}`,
    );
    // Die Kopie steht seit der Linie „Lot“ im „⋯“ und führt an dieselbe Adresse.
    await mehrMenue(nutzer, 'Als Kopie anlegen');
    expect(await screen.findByText(`Angebotsliste?kopie=${ANGEBOT.id}`)).toBeInTheDocument();
  });

  it('Gegenprobe: ein Entwurf wird bearbeitet, nicht neu gefasst', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Fassung' })).toBeNull();
  });

  it('verweist auf den Vorgänger und auf spätere Fassungen', async () => {
    angebot = { ...ANGEBOT, vorgaengerId: VORGAENGER.id };
    fassungen = [{ ...ANGEBOT, id: '88888888-2222-3333-4444-555555555555', quoteNumber: 'AN-2026-0009', status: 'Entwurf' }];
    zeige();
    expect(await screen.findByRole('link', { name: 'AN-2026-0003' })).toHaveAttribute('href', `/quotes/${VORGAENGER.id}`);
    expect(screen.getByRole('link', { name: 'AN-2026-0009 (Entwurf)' })).toBeInTheDocument();
  });
});

/*
  LINIE „LOT“ (Protokoll E7): die Akte beginnt mit der Zusammenfassung, der
  Verlauf steht als Lot, und der nächste Schritt hängt am Punkt, an dem das
  Angebot gerade steht. Seltenes liegt im „⋯“ des Seitenkopfs.
*/
describe('Die Akte auf der Linie „Lot“', () => {
  it('beginnt mit den Kennzahlen — Arbeitszeit und Bindefrist — vor den Positionen', async () => {
    zeige();
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    const kennzahl = screen.getByText('Kalkulierte Arbeitszeit');
    expect(kennzahl.nextSibling).toHaveTextContent('16 h');
    expect(screen.getByText('Gültig bis').nextSibling).toHaveTextContent('01.10.2099');
    // Im Dokument vor den Positionen: am Handy steht sie zuerst.
    expect(kennzahl.compareDocumentPosition(positionen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('zeigt den Verlauf als Lot: das versendete Angebot steht „jetzt“ beim Versand, mit dem nächsten Schritt', async () => {
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Angebot erstellt', 'Versendet']);
    expect(punkte[1]).toHaveAttribute('aria-current', 'step');
    expect(within(punkte[1]).getByText('Wartet auf die Antwort des Kunden.')).toBeInTheDocument();
    expect(within(punkte[1]).getByRole('button', { name: 'Annehmen → Baustelle' })).toBeInTheDocument();
  });

  it('Gegenprobe: ein angenommenes Angebot hat keinen „jetzt“-Punkt und keinen Schritt mehr', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    expect(within(lot).getByText('Angenommen')).toBeInTheDocument();
    expect(within(lot).getByText('Baustelle B-2026-0007')).toBeInTheDocument();
    expect(lot.querySelector('[aria-current]')).toBeNull();
    expect(within(lot).queryByRole('button')).toBeNull();
  });

  it('nennt die abgelaufene Bindefrist auch am Punkt im Verlauf', async () => {
    angebot = { ...ANGEBOT, validUntil: '2020-01-01' };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    expect(within(lot).getByText(/Die Bindefrist ist abgelaufen\./)).toBeInTheDocument();
  });

  it('legt die seltenen Aktionen je Status ins „⋯“ — Löschen nur beim Entwurf', async () => {
    const nutzer = userEvent.setup();
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const { unmount } = zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Als abgelehnt markieren', 'Als Kopie anlegen', 'Löschen',
    ]);
    unmount();

    // Gegenprobe: angenommen bleibt nur die Kopie.
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Als Kopie anlegen']);
  });

  it('führt mit der Sprungleiste zu den Abschnitten der Akte', async () => {
    zeige();
    const leiste = await screen.findByRole('navigation', { name: 'Auf dieser Seite' });
    const ziele = within(leiste).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(ziele).toEqual(['#angebot-verlauf', '#angebot-angaben', '#angebot-positionen', '#angebot-anmerkungen']);
    for (const z of ziele) expect(document.querySelector(z!)).not.toBeNull();
  });
});
