import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop, Project, Wartung } from '@/types';

/**
 * DIE AKTE EINER LIEGENSCHAFT (M02c, A09).
 *
 * - Tops und Beteiligte mit Rolle; wer nicht mehr gilt, steht unter „Früher“, wer erst später gilt, unter „Künftig“;
 * - Baustellen (und Wartungen) der Liegenschaft, je Top gefiltert — das Top
 *   steht in der Adresse und geht an die Abfrage;
 * - „Entfernen“ eines Beteiligten fragt und sagt, dass die Angaben auch aus
 *   dem Verlauf gehen; „Zum Kunden machen“ mit derselben Rückfrage wie die
 *   Kundenliste, wenn es den Namen schon gibt;
 * - wer nicht Kunden pflegen darf, liest nur.
 *
 * Gegenprobe: ohne `LiegenschaftView.tsx` gibt es nichts zu zeigen — rot;
 * ohne den Filter an der Abfrage der Fall „je Top“.
 */

const LID = '00000000-0000-4000-8000-000000000001';
const L: Liegenschaft = { id: LID, companyId: 'perl', bezeichnung: 'WHA Hauptstraße 12', anschrift: 'Hauptstraße 12, 1010 Wien', aktiv: true };
const TOPS: LiegenschaftTop[] = [
  { id: 't1', companyId: 'perl', liegenschaftId: LID, bezeichnung: 'Top 1', lage: 'EG', aktiv: true },
  { id: 't2', companyId: 'perl', liegenschaftId: LID, bezeichnung: 'Top 2', lage: '1. OG', aktiv: true },
];
const HV: Customer & { id: string } = { id: 'hv', companyId: 'perl', name: 'Muster Hausverwaltung', address: 'Ring 1, 1010 Wien' } as Customer & { id: string };
let BETEILIGTE: LiegenschaftBeteiligter[] = [];
const BAUSTELLE = { id: 'p1', companyId: 'perl', projectNumber: 'B-2026-0001', customerName: 'Muster Hausverwaltung', status: 'Aktiv', topId: 't2', topBezeichnung: 'Top 2' } as Project & { id: string };

const listBaustellen = vi.fn(async (_c: string, _l: string, top: string | null) => (top && top !== 't2' ? [] : [BAUSTELLE]));
const beteiligterEntfernen = vi.fn<(id: string) => Promise<void>>(async () => undefined);
const beteiligterZuKunde = vi.fn<(id: string) => Promise<string>>(async () => 'neuer-kunde');
const beteiligterAendern = vi.fn<(id: string, d: unknown) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/liegenschaften', () => ({
  AKTE_GRENZE: 100,
  getLiegenschaft: vi.fn(async () => L),
  listTops: vi.fn(async () => TOPS),
  listBeteiligte: vi.fn(async () => BETEILIGTE),
  listBaustellenDerLiegenschaft: (c: string, l: string, t: string | null) => listBaustellen(c, l, t),
  listWartungenDerLiegenschaft: vi.fn(async () => [] as Wartung[]),
  beteiligterEntfernen: (id: string) => beteiligterEntfernen(id),
  beteiligterZuKunde: (id: string) => beteiligterZuKunde(id),
  beteiligterAendern: (id: string, d: unknown) => beteiligterAendern(id, d),
  beteiligterAnlegen: vi.fn(async () => 'b-neu'),
  liegenschaftLoeschen: vi.fn(async () => undefined),
  liegenschaftAendern: vi.fn(async () => undefined),
  topAnlegen: vi.fn(async () => 't-neu'),
  topAendern: vi.fn(async () => undefined),
  topLoeschen: vi.fn(async () => undefined),
}));
let gleichnamige: (Customer & { id: string })[] = [];
vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: vi.fn(async (_c: string, ids: string[]) => [HV].filter((k) => ids.includes(k.id))),
  searchCustomers: vi.fn(async () => gleichnamige),
  kundenNachNamen: vi.fn(async () => []),
}));
vi.mock('@/lib/db/objektVerlauf', () => ({ listObjektVerlauf: vi.fn(async () => ({ zeilen: [], weiter: null })) }));

let nutzer: Record<string, unknown> = {};
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: nutzer, company: { id: 'perl', name: 'Perl', modules: { 'kunden.liegenschaften': true } }, einblick: null }),
}));

const { default: LiegenschaftView } = await import('@/features/liegenschaften/LiegenschaftView');

function Adresse() {
  const loc = useLocation();
  return <output data-testid="adresse">{loc.pathname}{loc.search}</output>;
}
const zeige = (start = `/liegenschaften/${LID}`) => render(
  <MemoryRouter initialEntries={[start]}>
    <ToastProvider>
      <Routes>
        <Route path="/liegenschaften/:id" element={<><LiegenschaftView /><Adresse /></>} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  nutzer = { uid: 'gf', companyId: 'perl', role: 'Geschäftsführung', name: 'Carla' };
  gleichnamige = [];
  BETEILIGTE = [
    { id: 'b1', companyId: 'perl', liegenschaftId: LID, rolle: 'hausverwaltung', customerId: 'hv' },
    { id: 'b2', companyId: 'perl', liegenschaftId: LID, topId: 't2', rolle: 'nutzer', name: 'Max Mieter', telefon: '0664 1' },
    { id: 'b3', companyId: 'perl', liegenschaftId: LID, topId: 't1', rolle: 'nutzer', name: 'Alt Mieter', gueltigBis: '2020-01-31' },
  ];
  listBaustellen.mockClear();
  beteiligterEntfernen.mockClear();
  beteiligterZuKunde.mockClear();
  beteiligterAendern.mockClear();
});

describe('Tops und Beteiligte', () => {
  it('zeigt Tops mit Lage und Beteiligte mit Rolle; wer nicht mehr gilt, steht unter „Früher“', async () => {
    zeige();
    expect(await screen.findByRole('heading', { name: 'WHA Hauptstraße 12' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Top 2/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Muster Hausverwaltung/ })).toBeInTheDocument();
    expect(screen.getByText(/Hausverwaltung · ganze Liegenschaft · Kunde/)).toBeInTheDocument();
    expect(screen.getByText(/Nutzer bzw\. Mieter · Top 2 · 0664 1/)).toBeInTheDocument();
    const frueher = screen.getByRole('region', { name: 'Früher' });
    expect(within(frueher).getByRole('button', { name: /Alt Mieter/ })).toBeInTheDocument();
  });

  /*
    KÜNFTIG IST NICHT FRÜHER. Wer erst ab einem späteren Tag gilt (der neue
    Mieter ab nächstem Monat), stand unter „Früher“ — als wäre er schon weg.
    Gegenprobe: mit der alten Zweiteilung gibt es keinen Bereich „Künftig“,
    und „Neu Mieter“ steht unter „Früher“.
  */
  it('wer erst später gilt, steht unter „Künftig“ — nicht unter „Früher“', async () => {
    BETEILIGTE.push(
      { id: 'b4', companyId: 'perl', liegenschaftId: LID, topId: 't1', rolle: 'nutzer', name: 'Neu Mieter', gueltigAb: '2099-02-01' },
      { id: 'b5', companyId: 'perl', liegenschaftId: LID, topId: 't1', rolle: 'eigentuemer', name: 'Jetzt Eigentümer', gueltigAb: '2020-02-01', gueltigBis: '2099-12-31' },
    );
    zeige();
    const kuenftig = await screen.findByRole('region', { name: 'Künftig' });
    expect(within(kuenftig).getByRole('button', { name: /Neu Mieter/ })).toBeInTheDocument();
    expect(within(kuenftig).queryByRole('button', { name: /Alt Mieter/ })).toBeNull();
    const frueher = screen.getByRole('region', { name: 'Früher' });
    expect(within(frueher).getByRole('button', { name: /Alt Mieter/ })).toBeInTheDocument();
    expect(within(frueher).queryByRole('button', { name: /Neu Mieter/ })).toBeNull();
    // Wer heute gilt, steht oben, in keiner der beiden Gruppen.
    const jetzt = screen.getByRole('button', { name: /Jetzt Eigentümer/ });
    expect(kuenftig.contains(jetzt) || frueher.contains(jetzt)).toBe(false);
    // Die Reihenfolge: heute, künftig, früher.
    expect(jetzt.compareDocumentPosition(kuenftig) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kuenftig.compareDocumentPosition(frueher) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Erhaltung: ohne künftige Beteiligte kein leerer Bereich „Künftig“', async () => {
    zeige();
    await screen.findByRole('region', { name: 'Früher' });
    expect(screen.queryByRole('region', { name: 'Künftig' })).toBeNull();
  });

  it('Entfernen fragt und sagt, dass Name, Telefon und E-Mail auch aus dem Verlauf gehen', async () => {
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: /Max Mieter/ }));
    await ev.click(await screen.findByRole('button', { name: 'Entfernen' }));
    const frage = await screen.findByRole('dialog', { name: 'Beteiligten entfernen?' });
    expect(frage).toHaveTextContent(/auch aus dem Änderungsverlauf/);
    await ev.click(within(frage).getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(beteiligterEntfernen).toHaveBeenCalledWith('b2'));
  });

  it('„Zum Kunden machen“ — ohne Namensgleichen gleich, mit ihnen erst die Rückfrage wie in der Kundenliste', async () => {
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: /Max Mieter/ }));
    await ev.click(await screen.findByRole('button', { name: 'Zum Kunden machen' }));
    await waitFor(() => expect(beteiligterZuKunde).toHaveBeenCalledWith('b2'));

    beteiligterZuKunde.mockClear();
    gleichnamige = [{ id: 'k9', companyId: 'perl', name: 'Max Mieter', address: 'Hof 3, 1020 Wien' } as Customer & { id: string }];
    await ev.click(await screen.findByRole('button', { name: /Max Mieter/ }));
    await ev.click(await screen.findByRole('button', { name: 'Zum Kunden machen' }));
    const frage = await screen.findByRole('dialog', { name: 'Gleicher Name — trotzdem anlegen?' });
    expect(frage).toHaveTextContent(/Es gibt schon „Max Mieter“ \(Hof 3, 1020 Wien\)/);
    expect(beteiligterZuKunde).not.toHaveBeenCalled();
    await ev.click(within(frage).getByRole('button', { name: 'Max Mieter (Hof 3, 1020 Wien) übernehmen' }));
    await waitFor(() => expect(beteiligterAendern).toHaveBeenCalledWith('b2', { customerId: 'k9', name: null, telefon: null, email: null }));
    expect(beteiligterZuKunde).not.toHaveBeenCalled();
  });

  it('wer nicht Kunden pflegen darf, liest nur — keine Knöpfe zum Anlegen, Entfernen oder Bearbeiten', async () => {
    nutzer = { uid: 'b', companyId: 'perl', role: 'Buchhaltung', name: 'Berta', kundenPflegen: false };
    zeige();
    expect(await screen.findByText('Max Mieter')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Top anlegen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Beteiligten eintragen' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Max Mieter/ })).toBeNull();
    // Der Kunde unter den Beteiligten führt in seine Akte.
    expect(screen.getByRole('link', { name: /Muster Hausverwaltung/ })).toHaveAttribute('href', '/customers/hv');
  });
});

describe('Baustellen je Top', () => {
  it('zeigt die Baustellen der Liegenschaft mit ihrem Top; der Filter geht an die Abfrage und in die Adresse', async () => {
    const ev = userEvent.setup();
    zeige(`/liegenschaften/${LID}?bereich=arbeiten`);
    expect(await screen.findByRole('link', { name: /Muster Hausverwaltung/ })).toHaveAttribute('href', '/admin-projects/p1');
    expect(screen.getByText(/Top 2 · Aktiv/)).toBeInTheDocument();
    expect(listBaustellen).toHaveBeenLastCalledWith('perl', LID, null);
    await ev.selectOptions(screen.getByLabelText('Top'), 'Top 1 (EG)');
    await waitFor(() => expect(listBaustellen).toHaveBeenLastCalledWith('perl', LID, 't1'));
    expect(await screen.findByText('Für dieses Top noch keine Baustelle.')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('top=t1');
  });
});
