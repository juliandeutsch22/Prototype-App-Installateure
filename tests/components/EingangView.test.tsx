import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Auftragseingang } from '@/types';

/**
 * EIN EINGANG AUF SEINER SEITE (M02b): was er ist, wohin er führte, und je
 * Stand und Rolle genau die Schritte, die die Datenbank auch annimmt.
 *
 *  - offen, Führung: „Baustelle anlegen“ (mit Abrechnung, Vorgabe Regie),
 *    im ⋯ Angebot, Besichtigung, Bearbeiten, Ablehnen, Löschen;
 *  - offen, übriges Büro: „Bearbeiten“, im ⋯ Ablehnen (Verwaltung auch die
 *    Besichtigung); kein Umwandeln, kein Löschen;
 *  - abgelehnt: „Wieder öffnen“, Löschen nur die Führung;
 *  - übernommen: der Weg zur Baustelle; nichts zu ändern.
 *
 * Gegenprobe: ohne `EingangView.tsx` gibt es nichts zu zeigen — rot; mit
 * einem Umwandeln für die Verwaltung der zweite Fall.
 */

const ID = '00000000-0000-4000-8000-000000000001';
const PROJEKT = '00000000-0000-4000-8000-0000000000aa';
const T = new Date(2026, 10, 7, 9, 14).getTime();
const OFFEN: Auftragseingang = {
  id: ID, companyId: 'perl', nummer: 'EG-2026-0001', stand: 'offen', quelle: 'versicherung',
  auftraggeberNummer: 'SCH-77', customerId: 'k1', kundeName: 'Familie Huber', ort: 'Hauptplatz 1, 8010 Graz',
  ansprechpartnerName: 'Hr. Hausmeister', ansprechpartnerTelefon: '0664 1', anliegen: 'Wasserfleck an der Decke',
  dringlichkeit: 'dringend', eingegangenAm: T, erfasstVonName: 'Vera Verwaltung',
};

let eingang: Auftragseingang | null = OFFEN;
const db = {
  getEingang: vi.fn(async () => eingang),
  eingangZuBaustelle: vi.fn(async () => ({ projectId: PROJEKT, projectNumber: 'B-2026-0007', neu: true })),
  eingangZuAngebot: vi.fn(async () => ({ quoteId: 'q1', quoteNumber: 'AN-2026-0042', neu: true })),
  eingangAblehnen: vi.fn(async () => undefined),
  eingangWiederOeffnen: vi.fn(async () => undefined),
  eingangLoeschen: vi.fn(async () => undefined),
  eingangKundeAnlegen: vi.fn(async () => 'k-neu'),
  eingangTerminSetzen: vi.fn(async () => undefined),
  eingangAendern: vi.fn(async () => undefined),
};
vi.mock('@/lib/db/auftragseingaenge', () => ({
  getEingang: () => db.getEingang(),
  eingangZuBaustelle: (...a: unknown[]) => db.eingangZuBaustelle(...(a as [])),
  eingangZuAngebot: (...a: unknown[]) => db.eingangZuAngebot(...(a as [])),
  eingangAblehnen: (...a: unknown[]) => db.eingangAblehnen(...(a as [])),
  eingangWiederOeffnen: (...a: unknown[]) => db.eingangWiederOeffnen(...(a as [])),
  eingangLoeschen: (...a: unknown[]) => db.eingangLoeschen(...(a as [])),
  eingangKundeAnlegen: (...a: unknown[]) => db.eingangKundeAnlegen(...(a as [])),
  eingangTerminSetzen: (...a: unknown[]) => db.eingangTerminSetzen(...(a as [])),
  eingangAendern: (...a: unknown[]) => db.eingangAendern(...(a as [])),
  eingangAnlegen: vi.fn(),
}));
vi.mock('@/lib/db/projects', () => ({ listProjectsByIds: vi.fn(async () => [{ id: PROJEKT, projectNumber: 'B-2026-0007' }]) }));
vi.mock('@/lib/db/quotes', () => ({ getQuote: vi.fn(async () => ({ id: 'q1', quoteNumber: 'AN-2026-0042' })) }));
const terminAnlegen = vi.fn(async () => 't1');
vi.mock('@/lib/db/termine', () => ({
  getTermin: vi.fn(async () => null),
  terminAnlegen: (...a: unknown[]) => terminAnlegen(...(a as [])),
  terminAendern: vi.fn(),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []) }));
vi.mock('@/lib/db/customers', () => ({ listCustomersByIds: vi.fn(async () => []), searchCustomers: vi.fn(async () => []) }));

let rolle = 'Geschäftsführung';
let kundenPflegen = false;
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', companyId: 'perl', role: rolle, name: 'Carla Chefin', kundenPflegen },
    company: { id: 'perl', name: 'Perl', praefixBaustelle: 'B' },
  }),
}));

const { default: EingangView } = await import('@/features/auftragseingang/EingangView');

function Adresse() {
  const l = useLocation();
  return <output data-testid="adresse">{l.pathname}</output>;
}
const zeige = () => render(
  <MemoryRouter initialEntries={[`/eingaenge/${ID}`]}>
    <ToastProvider>
      <Routes>
        <Route path="/eingaenge/:id" element={<EingangView />} />
        <Route path="*" element={<Adresse />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

const menue = async (nutzer: ReturnType<typeof userEvent.setup>) => {
  await nutzer.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Eingang EG-2026-0001' }));
  return screen.getAllByRole('menuitem').map((m) => m.textContent);
};

beforeEach(() => {
  eingang = OFFEN;
  rolle = 'Geschäftsführung';
  kundenPflegen = false;
  for (const f of Object.values(db)) f.mockClear();
  terminAnlegen.mockClear();
});

describe('Die Angaben', () => {
  it('Nummer, Kunde, Stand, Ort, Ansprechpartner, Quelle mit Nummer des Auftraggebers, Anliegen', async () => {
    zeige();
    expect(await screen.findByText('EG-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Familie Huber' })).toHaveAttribute('href', '/customers/k1');
    expect(screen.getAllByText('Dringend').length).toBeGreaterThan(0);
    expect(screen.getByText('Hauptplatz 1, 8010 Graz')).toBeInTheDocument();
    expect(screen.getByText('Hr. Hausmeister · 0664 1')).toBeInTheDocument();
    expect(screen.getByText('SCH-77')).toBeInTheDocument();
    expect(screen.getByText('Wasserfleck an der Decke')).toBeInTheDocument();
    expect(screen.getByText(/Versicherung · erfasst von Vera Verwaltung/)).toBeInTheDocument();
  });
});

describe('Offen — die Führung', () => {
  it('„Baustelle anlegen“ mit der Abrechnung (Vorgabe Regie) und dem Vorsatz des Betriebs — dann zur Baustelle', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Baustelle anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Baustelle anlegen?' });
    expect(within(dialog).getByLabelText(/Abrechnung der Baustelle/)).toHaveValue('Regie');
    await nutzer.selectOptions(within(dialog).getByLabelText(/Abrechnung der Baustelle/), 'Pauschal');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Baustelle anlegen' }));
    await waitFor(() => expect(db.eingangZuBaustelle).toHaveBeenCalledWith(ID, 'B', 'Pauschal'));
    expect(await screen.findByTestId('adresse')).toHaveTextContent(`/admin-projects/${PROJEKT}`);
  });

  it('im ⋯: Angebot, Besichtigung, Bearbeiten, Ablehnen, Löschen', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(await menue(nutzer)).toEqual(['Angebot anlegen', 'Besichtigung vereinbaren', 'Bearbeiten', 'Ablehnen', 'Löschen']);
  });

  it('„Angebot anlegen“ legt den Entwurf an und führt zu ihm', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await menue(nutzer);
    await nutzer.click(screen.getByRole('menuitem', { name: 'Angebot anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Angebot anlegen?' });
    await nutzer.click(within(dialog).getByRole('button', { name: 'Angebot anlegen' }));
    await waitFor(() => expect(db.eingangZuAngebot).toHaveBeenCalledWith(ID));
    expect(await screen.findByTestId('adresse')).toHaveTextContent('/quotes/q1');
  });

  it('ein neuer Kunde: die Rückfrage sagt, dass er angelegt wird', async () => {
    const nutzer = userEvent.setup();
    eingang = { ...OFFEN, customerId: null, kundeName: 'Familie Neu', neukundeName: 'Familie Neu' };
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Baustelle anlegen' }));
    expect(await screen.findByText(/Dabei wird der Kunde „Familie Neu“ angelegt/)).toBeInTheDocument();
  });

  it('Ablehnen verlangt einen Grund; Löschen fragt nach', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await menue(nutzer);
    await nutzer.click(screen.getByRole('menuitem', { name: 'Ablehnen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eingang ablehnen?' });
    expect(within(dialog).getByRole('button', { name: 'Ablehnen' })).toBeDisabled();
    await nutzer.type(within(dialog).getByLabelText('Grund'), 'Kein Einsatzgebiet');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ablehnen' }));
    await waitFor(() => expect(db.eingangAblehnen).toHaveBeenCalledWith(ID, 'Kein Einsatzgebiet'));

    await menue(nutzer);
    await nutzer.click(screen.getByRole('menuitem', { name: 'Löschen' }));
    const frage = await screen.findByRole('dialog', { name: 'Eingang löschen?' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(db.eingangLoeschen).toHaveBeenCalledWith(ID));
  });

  it('die Besichtigung: das Terminformular mit Art, Wunschtag und Notiz — der Termin hängt danach am Eingang', async () => {
    const nutzer = userEvent.setup();
    eingang = { ...OFFEN, wunschtermin: '2026-11-12' };
    zeige();
    await menue(nutzer);
    await nutzer.click(screen.getByRole('menuitem', { name: 'Besichtigung vereinbaren' }));
    const fenster = await screen.findByRole('dialog', { name: 'Besichtigung vereinbaren' });
    expect(within(fenster).getByLabelText('Art')).toHaveValue('Besichtigung');
    expect(within(fenster).getByLabelText(/^Tag/)).toHaveValue('2026-11-12');
    expect(within(fenster).getByLabelText('Notiz')).toHaveValue(
      'Ort: Hauptplatz 1, 8010 Graz\nVor Ort: Hr. Hausmeister, 0664 1\nWasserfleck an der Decke\nEingang EG-2026-0001');
    await nutzer.click(within(fenster).getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(terminAnlegen).toHaveBeenCalledWith('perl', expect.objectContaining({ art: 'Besichtigung', customerId: 'k1', datum: '2026-11-12' })));
    await waitFor(() => expect(db.eingangTerminSetzen).toHaveBeenCalledWith(ID, 't1'));
  });
});

describe('Offen — das übrige Büro', () => {
  it('Verwaltung: „Bearbeiten“, im ⋯ Besichtigung und Ablehnen — kein Umwandeln, kein Löschen', async () => {
    const nutzer = userEvent.setup();
    rolle = 'Verwaltung';
    zeige();
    expect(await screen.findByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baustelle anlegen' })).toBeNull();
    expect(await menue(nutzer)).toEqual(['Besichtigung vereinbaren', 'Ablehnen']);
  });

  it('Buchhaltung: keine Besichtigung (sie plant keine Termine)', async () => {
    const nutzer = userEvent.setup();
    rolle = 'Buchhaltung';
    zeige();
    expect(await menue(nutzer)).toEqual(['Ablehnen']);
  });

  it('ein neuer Kunde: „Kunde anlegen“ nur mit dem Recht „Kunden pflegen“ — sonst ein Satz dazu', async () => {
    const nutzer = userEvent.setup();
    rolle = 'Verwaltung';
    eingang = { ...OFFEN, customerId: null, kundeName: 'Familie Neu', neukundeName: 'Familie Neu' };
    const ohne = zeige();
    expect(await screen.findByText(/Anlegen darf ihn, wer Kunden pflegt/)).toBeInTheDocument();
    expect(await menue(nutzer)).toEqual(['Ablehnen']);
    ohne.unmount();
    kundenPflegen = true;
    zeige();
    expect(await menue(nutzer)).toEqual(['Kunde anlegen', 'Ablehnen']);
    await nutzer.click(screen.getByRole('menuitem', { name: 'Kunde anlegen' }));
    await waitFor(() => expect(db.eingangKundeAnlegen).toHaveBeenCalledWith(ID));
  });
});

describe('Abgelehnt und übernommen', () => {
  it('abgelehnt: „Wieder öffnen“ für das Büro, Löschen nur für die Führung; der Grund steht da', async () => {
    const nutzer = userEvent.setup();
    eingang = { ...OFFEN, stand: 'abgelehnt', abgelehntGrund: 'Kein Einsatzgebiet', abgelehntAm: T, abgelehntVonName: 'Vera Verwaltung' };
    rolle = 'Verwaltung';
    const v = zeige();
    expect(await screen.findByText(/Kein Einsatzgebiet — Vera Verwaltung/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Wieder öffnen' }));
    await waitFor(() => expect(db.eingangWiederOeffnen).toHaveBeenCalledWith(ID));
    expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).toBeNull();
    v.unmount();
    rolle = 'Projektleiter';
    zeige();
    expect(await menue(nutzer)).toEqual(['Löschen']);
  });

  it('übernommen: der Weg zur Baustelle — nichts zu ändern, nichts zu löschen', async () => {
    eingang = { ...OFFEN, stand: 'uebernommen', projectId: PROJEKT, uebernommenAm: T, uebernommenVonName: 'Carla Chefin' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Zur Baustelle' })).toHaveAttribute('href', `/admin-projects/${PROJEKT}`);
    expect(await screen.findByRole('link', { name: 'Baustelle B-2026-0007' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Baustelle anlegen' })).toBeNull();
  });

  it('übernommen, aber das Angebot gibt es nicht mehr: wieder öffnen', async () => {
    eingang = { ...OFFEN, stand: 'uebernommen', projectId: null, quoteId: null, uebernommenAm: T };
    zeige();
    expect(await screen.findByRole('button', { name: 'Wieder öffnen' })).toBeInTheDocument();
    expect(screen.getByText(/gibt es nicht mehr/)).toBeInTheDocument();
  });

  it('nicht gefunden: ein Satz statt einer leeren Seite', async () => {
    eingang = null;
    zeige();
    expect(await screen.findByText('Diesen Eingang gibt es nicht (mehr).')).toBeInTheDocument();
  });
});
