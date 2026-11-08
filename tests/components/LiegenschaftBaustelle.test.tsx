import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Liegenschaft, LiegenschaftBeteiligter, LiegenschaftTop } from '@/types';
import { kundeWaehlen } from './kundenAuswahl';

/**
 * EINE NEUE BAUSTELLE MIT LIEGENSCHAFT (M02c, A09).
 *
 * - Mit der Unterfähigkeit: Liegenschaft suchen, Top wählen; darunter die
 *   Vorschläge aus den Beteiligten — Kunde aus der Hausverwaltung (bzw.
 *   Rechnungsempfänger, Auftraggeber), Adresse aus der Liegenschaft,
 *   Ansprechpartner aus dem Nutzer des Tops. Übernommen wird nur auf Klick;
 *   gespeichert werden Liegenschaft und Top.
 * - Ohne sie: kein Feld, und die Baustelle entsteht wie bisher — ohne
 *   Liegenschaft und Top (Erhaltung).
 *
 * Gegenprobe: ohne die Felder im Formular sind die Fälle mit Unterfähigkeit
 * rot; der Erhaltungsfall ist mit und ohne Änderung grün.
 */

const LID = '00000000-0000-4000-8000-000000000001';
const L: Liegenschaft = { id: LID, companyId: 'perl', bezeichnung: 'WHA Hauptstraße 12', anschrift: 'Hauptstraße 12, 1010 Wien', aktiv: true };
const TOPS: LiegenschaftTop[] = [
  { id: 't1', companyId: 'perl', liegenschaftId: LID, bezeichnung: 'Top 1', aktiv: true },
  { id: 't2', companyId: 'perl', liegenschaftId: LID, bezeichnung: 'Top 2', lage: '1. OG', aktiv: true },
];
const BETEILIGTE: LiegenschaftBeteiligter[] = [
  { id: 'b1', companyId: 'perl', liegenschaftId: LID, rolle: 'hausverwaltung', customerId: 'hv' },
  { id: 'b2', companyId: 'perl', liegenschaftId: LID, topId: 't2', rolle: 'nutzer', name: 'Max Mieter', telefon: '0664 1' },
];
const HV = { id: 'hv', companyId: 'perl', name: 'Muster Hausverwaltung', address: 'Ring 1, 1010 Wien', contactName: 'Frau Ring', contactPhone: '01 111' } as Customer & { id: string };
const HUBER = { id: 'k1', companyId: 'perl', name: 'Familie Huber', address: 'Hof 2, 8010 Graz' } as Customer & { id: string };

const lege = vi.fn();
vi.mock('@/lib/db/projects', () => ({
  subscribeRecentProjects: (_c: string, _g: number, cb: (rows: unknown[]) => void) => { cb([]); return () => undefined; },
  createProject: (c: string, data: unknown) => { lege(c, data); return Promise.resolve('neu'); },
  reserveProjectNumber: vi.fn(async () => null),
  updateProject: vi.fn(async () => undefined),
  deleteProject: vi.fn(async () => undefined),
  searchProjects: vi.fn(async () => []),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []) }));
vi.mock('@/lib/db/customers', async () => (await import('./kundenAuswahl')).kundenAttrappe(() => [HV, HUBER]));
vi.mock('@/lib/db/timeEntries', () => ({ stundenDerBaustellen: vi.fn(async () => []) }));
vi.mock('@/lib/db/liegenschaften', () => ({
  listLiegenschaften: vi.fn(async () => ({ zeilen: [L], weiter: null })),
  getLiegenschaft: vi.fn(async () => L),
  listTops: vi.fn(async () => TOPS),
  listBeteiligte: vi.fn(async () => BETEILIGTE),
}));

// Feste Objekte: die Liste abonniert je Benutzer — ein neues Objekt je Zeichnung abonnierte ohne Ende.
const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen', modules: {} as Record<string, boolean> },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: AdminProjectsView } = await import('@/features/projects/AdminProjectsView');

const zeige = () => render(
  <MemoryRouter initialEntries={['/admin-projects']}>
    <ToastProvider>
      <AdminProjectsView />
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  authWert.company = { ...authWert.company, modules: { 'kunden.liegenschaften': true } };
  lege.mockClear();
});

async function liegenschaftWaehlen(ev: ReturnType<typeof userEvent.setup>) {
  await ev.type(screen.getByRole('searchbox', { name: 'Liegenschaft (freiwillig)' }), 'Haupt');
  await ev.click(await screen.findByRole('button', { name: 'WHA Hauptstraße 12' }));
}

describe('Neue Baustelle mit Liegenschaft', () => {
  it('Liegenschaft und Top wählen; Kunde aus der Hausverwaltung, Adresse und Mieter als Vorschlag — erst auf Klick', async () => {
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: 'Neue Baustelle' }));
    await liegenschaftWaehlen(ev);
    await ev.selectOptions(await screen.findByLabelText('Top'), 'Top 2 (1. OG)');

    const vorschlaege = await screen.findByRole('region', { name: 'Vorschläge aus der Liegenschaft' });
    expect(vorschlaege).toHaveTextContent('Kunde: Muster Hausverwaltung');
    expect(vorschlaege).toHaveTextContent('Hausverwaltung');
    expect(vorschlaege).toHaveTextContent('Baustellenadresse: Hauptstraße 12, 1010 Wien');
    expect(vorschlaege).toHaveTextContent('Ansprechpartner vor Ort: Max Mieter · 0664 1');
    // Noch nichts übernommen — es bleibt Vorschlag.
    expect(screen.getByLabelText('Baustellenadresse')).toHaveValue('');

    await ev.click(within(vorschlaege).getByRole('button', { name: 'Anschrift der Liegenschaft als Baustellenadresse übernehmen' }));
    await ev.click(within(vorschlaege).getByRole('button', { name: 'Muster Hausverwaltung als Kunde übernehmen' }));
    await ev.click(within(screen.getByRole('region', { name: 'Vorschläge aus der Liegenschaft' }))
      .getByRole('button', { name: 'Nutzer des Tops als Ansprechpartner übernehmen' }));

    expect(screen.getByLabelText('Baustellenadresse')).toHaveValue('Hauptstraße 12, 1010 Wien');
    expect(screen.getByLabelText('Ansprechpartner vor Ort')).toHaveValue('Max Mieter');
    expect(screen.getByLabelText('Telefon vor Ort')).toHaveValue('0664 1');
    // Der übernommene Kunde steht als gewählt da.
    expect(screen.getByRole('button', { name: 'Anderen Kunden wählen' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Vorschläge aus der Liegenschaft' })).toBeNull();

    await ev.click(screen.getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1]).toMatchObject({
      customerId: 'hv', customerName: 'Muster Hausverwaltung', address: 'Hauptstraße 12, 1010 Wien',
      contactName: 'Max Mieter', contactPhone: '0664 1', liegenschaftId: LID, topId: 't2',
    });
  });

  it('ein Vorschlag ist kein Zwang: ein anderer Kunde bleibt, Liegenschaft und Top gehen trotzdem mit', async () => {
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: 'Neue Baustelle' }));
    await liegenschaftWaehlen(ev);
    await kundeWaehlen(ev, 'Familie Huber');
    await ev.click(screen.getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1]).toMatchObject({ customerId: 'k1', liegenschaftId: LID });
    expect((lege.mock.calls[0][1] as { topId?: string }).topId).toBeUndefined();
  });

  it('„Ohne Liegenschaft“ löst die Wahl wieder', async () => {
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: 'Neue Baustelle' }));
    await liegenschaftWaehlen(ev);
    await ev.click(await screen.findByRole('button', { name: 'Ohne Liegenschaft' }));
    expect(await screen.findByRole('searchbox', { name: 'Liegenschaft (freiwillig)' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Vorschläge aus der Liegenschaft' })).toBeNull();
  });
});

describe('Erhaltung: ohne die Unterfähigkeit', () => {
  it('kein Feld, und die Baustelle entsteht wie bisher — ohne Liegenschaft und Top', async () => {
    authWert.company = { ...authWert.company, modules: {} };
    const ev = userEvent.setup();
    zeige();
    await ev.click(await screen.findByRole('button', { name: 'Neue Baustelle' }));
    expect(screen.queryByRole('searchbox', { name: 'Liegenschaft (freiwillig)' })).toBeNull();
    await kundeWaehlen(ev, 'Familie Huber');
    await ev.click(screen.getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(lege).toHaveBeenCalled());
    const daten = lege.mock.calls[0][1] as Record<string, unknown>;
    expect(daten.liegenschaftId).toBeUndefined();
    expect(daten.topId).toBeUndefined();
    expect(daten).toMatchObject({ customerId: 'k1', customerName: 'Familie Huber' });
  });
});
