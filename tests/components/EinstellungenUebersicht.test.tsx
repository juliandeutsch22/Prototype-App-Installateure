import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AppUser, Company } from '@/types';

/**
 * Die Übersicht der Einstellungen (Protokoll E9): Suche, Einrichtungsstand,
 * alle Unterseiten — je Rolle genau die, die sie öffnen darf.
 *
 * Geprüft wird vor allem die GRENZE: die Übersicht darf keiner Rolle einen
 * Weg zeigen, den `navigation.ts` ihr nicht gibt, und den Stand des Betriebs
 * nur der Spitze.
 */

let angemeldet: Pick<AppUser, 'uid' | 'companyId' | 'name' | 'role'> = {
  uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung',
};
let betrieb: Partial<Company> = {};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: angemeldet, company: betrieb }) }));

const { default: EinstellungenUebersicht, einrichtungsstand } = await import(
  '@/features/settings/EinstellungenUebersicht'
);

function zeige() {
  return render(
    <MemoryRouter>
      <EinstellungenUebersicht />
    </MemoryRouter>,
  );
}

/** Die Gruppe (Karte) zu einer Überschrift. */
const gruppe = (titel: string) =>
  screen.getByRole('heading', { name: titel }).closest('section') as HTMLElement;

const VOLL: Partial<Company> = {
  name: 'Perl Installationen GmbH', strasse: 'Hauptplatz 1', plz: '2700', ort: 'Wiener Neustadt',
  vatId: 'ATU12345678', iban: 'AT611904300234573201',
};

beforeEach(() => {
  angemeldet = { uid: 'gf1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' };
  betrieb = { ...VOLL };
});

describe('Alle Einstellungen je Rolle', () => {
  it('zeigt einem Monteur nur „Mein Konto“ und keinen Einrichtungsstand', () => {
    angemeldet = { ...angemeldet, role: 'Mitarbeiter' };
    zeige();
    const liste = gruppe('Alle Einstellungen');
    expect(within(liste).getAllByRole('link').map((l) => l.textContent)).toEqual(['Mein Konto']);
    expect(screen.queryByText('Einrichtungsstand')).not.toBeInTheDocument();
  });

  it('zeigt der Buchhaltung ihre drei Unterseiten — und nicht die Sätze', () => {
    angemeldet = { ...angemeldet, role: 'Buchhaltung' };
    zeige();
    const liste = gruppe('Alle Einstellungen');
    expect(within(liste).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Mein Konto', 'Rechnungsvorgaben', 'Kontenrahmen',
    ]);
    expect(screen.queryByText('Einrichtungsstand')).not.toBeInTheDocument();
  });

  it('zeigt die Module nur dem Administrator', () => {
    zeige();
    expect(screen.queryByRole('link', { name: 'Module' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sätze und Kosten' })).toHaveAttribute('href', '/settings/saetze');
  });
});

describe('Die Suche', () => {
  it('findet eine Unterseite über die Wörter ihrer Felder', async () => {
    zeige();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Einstellung suchen' }), 'iban');
    const liste = gruppe('Treffer (1)');
    expect(within(liste).getByRole('link', { name: 'Firmendaten' })).toHaveAttribute('href', '/settings/firma');
  });

  it('sagt, wenn nichts passt', async () => {
    zeige();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Einstellung suchen' }), 'Wasserhahn');
    expect(screen.getByText(/Keine Einstellung passt zu „Wasserhahn“/)).toBeInTheDocument();
  });

  it('findet nichts, was die Rolle nicht öffnen darf', async () => {
    angemeldet = { ...angemeldet, role: 'Buchhaltung' };
    zeige();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Einstellung suchen' }), 'Stundensätze');
    expect(screen.getByText(/Keine Einstellung passt/)).toBeInTheDocument();
  });
});

describe('Der Einrichtungsstand', () => {
  it('zählt, was erledigt ist, und meldet eine falsche IBAN als Fehler', () => {
    betrieb = { ...VOLL, iban: 'AT00 1234' };
    zeige();
    const stand = gruppe('Einrichtungsstand');
    expect(within(stand).getByText('2 von 3 erledigt')).toBeInTheDocument();
    const zeile = within(stand).getByRole('link', { name: 'Bankverbindung' }).closest('li') as HTMLElement;
    expect(within(zeile).getByText('prüfen')).toBeInTheDocument();
  });

  it('ist bei vollständigem Briefkopf „erledigt“ und sonst „offen“', () => {
    expect(einrichtungsstand(VOLL as Company).map((p) => p.wort)).toEqual(['erledigt', 'erledigt', 'erledigt']);
    expect(einrichtungsstand({ ...VOLL, ort: '' } as Company)[0].wort).toBe('offen');
    expect(einrichtungsstand({ ...VOLL, vatId: 'ATU1' } as Company)[1].wort).toBe('prüfen');
    expect(einrichtungsstand({} as Company).map((p) => p.wort)).toEqual(['offen', 'offen', 'offen']);
  });
});
