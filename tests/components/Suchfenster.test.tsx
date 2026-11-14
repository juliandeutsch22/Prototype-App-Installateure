/**
 * „Suchen oder springen“ (Strg + K) — zusätzlich zu jedem bisherigen Weg,
 * und nie eine Tür, die das Menü der Rolle nicht hat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AppUser, Company } from '@/types';

let nutzer = { uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter', email: 'm@perl.at' } as AppUser;
const betrieb = { id: 'perl', name: 'Perl' } as Company;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: nutzer, company: betrieb }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: nutzer, company: betrieb }) }));

const kundenSuche = vi.fn();
const baustellenSuche = vi.fn();
vi.mock('@/lib/db/customers', () => ({ searchCustomers: (...a: unknown[]) => kundenSuche(...a) }));
vi.mock('@/lib/db/projects', () => ({ searchProjects: (...a: unknown[]) => baustellenSuche(...a) }));
const rechnungsSuche = vi.fn();
const angebotsSuche = vi.fn();
const personenListe = vi.fn();
const katalogSuche = vi.fn();
vi.mock('@/lib/db/invoices', () => ({ rechnungenNachNummer: (...a: unknown[]) => rechnungsSuche(...a) }));
vi.mock('@/lib/db/quotes', () => ({ angeboteNachNummer: (...a: unknown[]) => angebotsSuche(...a) }));
vi.mock('@/lib/db/users', () => ({ listUsers: (...a: unknown[]) => personenListe(...a) }));
vi.mock('@/lib/db/materials', () => ({ sucheKatalog: (...a: unknown[]) => katalogSuche(...a) }));

const { default: Suchfenster } = await import('@/app/Suchfenster');

function Ort() {
  return <p data-testid="ort">{useLocation().pathname}</p>;
}

function zeige(onSchliessen = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Suchfenster offen onSchliessen={onSchliessen} />
      <Routes>
        <Route path="*" element={<Ort />} />
      </Routes>
    </MemoryRouter>,
  );
  return onSchliessen;
}

beforeEach(() => {
  nutzer = { uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter', email: 'm@perl.at' } as AppUser;
  kundenSuche.mockReset().mockResolvedValue([{ id: 'k1', name: 'Familie Huber', ort: 'Gleisdorf' }]);
  baustellenSuche.mockReset().mockResolvedValue([{ id: 'b1', projectNumber: '2026-014', customerName: 'Familie Huber' }]);
  rechnungsSuche.mockReset().mockResolvedValue([]);
  angebotsSuche.mockReset().mockResolvedValue([]);
  personenListe.mockReset().mockResolvedValue([]);
  katalogSuche.mockReset().mockResolvedValue([]);
});

describe('Suchen oder springen', () => {
  it('kennt genau die Seiten der Rolle — der Monteur keine Rechnungen', () => {
    zeige();
    const liste = screen.getByRole('listbox', { name: 'Treffer' });
    expect(within(liste).getByRole('option', { name: /Zeiterfassung/ })).toBeInTheDocument();
    expect(within(liste).queryByRole('option', { name: /Rechnungen/ })).toBeNull();
    expect(within(liste).queryByRole('option', { name: /Benutzerverwaltung/ })).toBeNull();
  });

  it('springt mit Pfeil und Enter zur Seite und schliesst', async () => {
    const zu = zeige();
    await userEvent.type(screen.getByRole('combobox'), 'urlaub');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('ort')).toHaveTextContent('/vacations');
    expect(zu).toHaveBeenCalled();
  });

  it('findet auch Unterseiten — die Geschäftsführung „Nummernkreise“', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'nummern');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('ort')).toHaveTextContent('/settings/nummern');
  });

  // V10 (13.11.2026): zwei ruhige Zeilen — der Bereich einer Unterseite steht unter ihr, rechts bleibt Platz für Nummern.
  it('eine Unterseite nennt ihren Bereich als zweite Zeile, nicht rechts daneben', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'nummern');
    const treffer = screen.getByRole('option', { name: /Nummernkreise/ });
    expect(within(treffer).getByText('Einstellungen')).toHaveClass('such-zweite');
    // Gegenprobe: rechts steht bei einer Seite nichts.
    expect(treffer.querySelector('.such-nebeninfo')).toBeNull();
    // Gleich geblieben: auch der Bereich findet die Unterseite.
    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'einstellungen');
    expect(screen.getByRole('option', { name: /Nummernkreise/ })).toBeInTheDocument();
  });

  it('sucht Kunden und Baustellen nur, wo die Rolle die Liste sehen darf', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    expect(await screen.findByRole('option', { name: /Familie Huber Gleisdorf/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /2026-014/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Familie Huber Gleisdorf/ }));
    expect(screen.getByTestId('ort')).toHaveTextContent('/customers/k1');
  });

  it('Gegenprobe: der Monteur fragt die Datenbank gar nicht erst', async () => {
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    await waitFor(() => expect(screen.getByText('Nichts gefunden.')).toBeInTheDocument(), { timeout: 1000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(kundenSuche).not.toHaveBeenCalled();
    expect(baustellenSuche).not.toHaveBeenCalled();
  });

  it('Esc schliesst', async () => {
    const zu = zeige();
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalled();
  });

  /*
    Ein Klick auf eine Gruppenüberschrift (oder sonst neben die Treffer)
    nimmt dem Suchfeld den Fokus; er liegt dann am Dokument. Esc muss das
    Fenster trotzdem schliessen — gefunden in der Vorschau: es blieb offen.
  */
  it('Esc schliesst auch, wenn das Suchfeld den Fokus verloren hat', async () => {
    const zu = zeige();
    await userEvent.click(screen.getAllByText('Seiten')[0]);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalledTimes(1);
  });

  /*
    C3 (E91): AUCH NUMMERN UND MENSCHEN — jede Gruppe nur mit der Seite, die
    die Rolle in der Navigation hat.
  */
  it('zwei Baustellen eines Kunden: die Kurzbezeichnung steht als zweite Zeile', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    baustellenSuche.mockResolvedValue([
      { id: 'b1', projectNumber: '2026-014', customerName: 'Familie Huber', bezeichnung: 'Bad' },
      { id: 'b2', projectNumber: '2026-019', customerName: 'Familie Huber', bezeichnung: 'Heizung' },
    ]);
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Huber');
    const bad = await screen.findByRole('option', { name: /2026-014/ });
    expect(bad).toHaveTextContent(/^Familie HuberBad2026-014$/);
    expect(within(bad).getByText('Bad')).toHaveClass('such-zweite');
    // V10: die Baustellennummer ist gemessen — Mono, ohne Umbruch.
    expect(within(bad).getByText('2026-014')).toHaveClass('such-nummer');
    expect(screen.getByRole('option', { name: /2026-019/ })).toHaveTextContent('Heizung');
  });

  it('findet die Rechnungsnummer und öffnet die Rechnung im Fenster der Rechnungen', async () => {
    nutzer = { ...nutzer, role: 'Buchhaltung' };
    rechnungsSuche.mockResolvedValue([
      { id: 'r9', invoiceNumber: 'RE-2026-0042', customerName: 'Familie Huber', projectNumber: '2026-014', invoiceDate: '2026-10-02' },
    ]);
    zeige();
    await userEvent.type(screen.getByRole('combobox'), '0042');
    const treffer = await screen.findByRole('option', { name: /RE-2026-0042/ });
    expect(treffer).toHaveTextContent('02.10.2026');
    expect(rechnungsSuche).toHaveBeenCalledWith('perl', '0042', 5);
    await userEvent.click(treffer);
    expect(screen.getByTestId('ort')).toHaveTextContent('/invoices');
  });

  it('die Projektleitung mit „Rechnungen lesen“ landet in ihrer Liste, gefiltert auf die Nummer', async () => {
    nutzer = { ...nutzer, role: 'Projektleiter', rechnungenLesen: true } as AppUser;
    rechnungsSuche.mockResolvedValue([
      { id: 'r9', invoiceNumber: 'RE-2026-0042', customerName: 'Familie Huber', projectNumber: '2026-014', invoiceDate: '2026-10-02' },
    ]);
    let ziel = '';
    function Adresse() {
      const l = useLocation();
      ziel = l.pathname + l.search;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Suchfenster offen onSchliessen={vi.fn()} />
        <Routes><Route path="*" element={<Adresse />} /></Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('combobox'), '0042');
    await userEvent.click(await screen.findByRole('option', { name: /RE-2026-0042/ }));
    expect(ziel).toBe('/invoices?suche=RE-2026-0042');
  });

  it('Angebote nach Nummer führen in das Angebot', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    angebotsSuche.mockResolvedValue([
      { id: 'q3', quoteNumber: 'AN-2026-0007', customerName: 'Familie Huber', quoteDate: '2026-09-01', status: 'Versendet' },
    ]);
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'AN-2026');
    const treffer = await screen.findByRole('option', { name: /AN-2026-0007/ });
    expect(treffer).toHaveTextContent('Versendet');
    await userEvent.click(treffer);
    expect(screen.getByTestId('ort')).toHaveTextContent('/quotes/q3');
  });

  it('Personen sucht nur, wer die Benutzerverwaltung hat — und holt die Liste einmal je Öffnen', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    personenListe.mockResolvedValue([
      { uid: 'u7', name: 'Lena Maier', email: 'lena@perl.at', role: 'Mitarbeiter' },
      { uid: 'u8', name: 'Paul Gruber', email: 'paul@perl.at', role: 'Mitarbeiter', active: false },
    ]);
    zeige();
    await userEvent.type(screen.getByRole('combobox'), 'Maier');
    const lena = await screen.findByRole('option', { name: /Lena Maier/ });
    expect(screen.queryByRole('option', { name: /Paul Gruber/ })).toBeNull();
    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'Gruber');
    expect(await screen.findByRole('option', { name: /Paul Gruber/ })).toHaveTextContent('Deaktiviert');
    // V10: die Anmeldung steht als zweite Zeile, die Nummer der Rolle rechts in gewöhnlicher Schrift.
    expect(within(screen.getByRole('option', { name: /Paul Gruber/ })).getByText('paul@perl.at · Deaktiviert')).toHaveClass('such-zweite');
    expect(within(screen.getByRole('option', { name: /Paul Gruber/ })).getByText('Mitarbeiter')).not.toHaveClass('such-nummer');
    expect(personenListe).toHaveBeenCalledTimes(1);
    expect(lena).toBeTruthy();
    await userEvent.click(screen.getByRole('option', { name: /Paul Gruber/ }));
    expect(screen.getByTestId('ort')).toHaveTextContent('/user-mgmt/u8');
  });

  it('Artikel: wer das Lager führt, landet im Katalog — mit der Artikelnummer als Suche', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    katalogSuche.mockResolvedValue([{ id: 'm1', name: 'Pressfitting 15 mm', articleNumber: 'PF-15', category: 'Fittings' }]);
    let ziel = '';
    function Adresse() {
      const l = useLocation();
      ziel = l.pathname + l.search;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Suchfenster offen onSchliessen={vi.fn()} />
        <Routes><Route path="*" element={<Adresse />} /></Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Press');
    await userEvent.click(await screen.findByRole('option', { name: /Pressfitting 15 mm/ }));
    expect(ziel).toBe('/lager?reiter=katalog&suche=PF-15');
  });

  it('Artikel: der Monteur landet bei „Material anfordern“ — und sieht keine Rechnung, kein Angebot, keine Person', async () => {
    katalogSuche.mockResolvedValue([{ id: 'm1', name: 'Pressfitting 15 mm' }]);
    let ziel = '';
    function Adresse() {
      const l = useLocation();
      ziel = l.pathname + l.search;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Suchfenster offen onSchliessen={vi.fn()} />
        <Routes><Route path="*" element={<Adresse />} /></Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Press');
    await userEvent.click(await screen.findByRole('option', { name: /Pressfitting 15 mm/ }));
    expect(ziel).toBe('/material?suche=Pressfitting%2015%20mm');
    expect(rechnungsSuche).not.toHaveBeenCalled();
    expect(angebotsSuche).not.toHaveBeenCalled();
    expect(personenListe).not.toHaveBeenCalled();
  });

  it('Gegenprobe: ohne Modul „Rechnungen“ fragt auch die Geschäftsführung nicht nach Rechnungen', async () => {
    nutzer = { ...nutzer, role: 'Geschäftsführung' };
    const vorher = betrieb.modules;
    betrieb.modules = { rechnungen: false } as Company['modules'];
    try {
      zeige();
      await userEvent.type(screen.getByRole('combobox'), '0042');
      await waitFor(() => expect(angebotsSuche).toHaveBeenCalled());
      expect(rechnungsSuche).not.toHaveBeenCalled();
    } finally {
      betrieb.modules = vorher;
    }
  });
});
