import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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

/*
  Kostensätze, Kontenrahmen, Sicherung (17 E): an der Datenschicht ersetzt,
  die Bewertung selbst ist echt. Jede Quelle lässt sich einzeln scheitern
  lassen oder zurückhalten.
*/
let kosten: unknown = { fach: 42, helper: 31 };
let konten: unknown[] | Error = [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }];
let lauf: unknown = { companyId: 'perl', art: 'ausleitung', zuletztErfolg: Date.now() - 3 * 3_600_000, erfolg: true };
let warten: Promise<void> = Promise.resolve();
const abgefragt = vi.fn();
vi.mock('@/lib/db/kosten', () => ({
  kostensaetze: async (id: string) => {
    abgefragt(id);
    await warten;
    if (kosten instanceof Error) throw kosten;
    return kosten;
  },
}));
vi.mock('@/lib/db/konten', () => ({
  buchungskonten: async () => {
    await warten;
    if (konten instanceof Error) throw konten;
    return konten;
  },
}));
vi.mock('@/lib/db/laeufe', () => ({ ladeLauf: async () => { await warten; return lauf; } }));

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
  kosten = { fach: 42, helper: 31 };
  konten = [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }];
  lauf = { companyId: 'perl', art: 'ausleitung', zuletztErfolg: Date.now() - 3 * 3_600_000, erfolg: true };
  warten = Promise.resolve();
  abgefragt.mockClear();
});

describe('Alle Einstellungen je Rolle', () => {
  it('zeigt einem Monteur nur „Mein Konto“ und keinen Einrichtungsstand', () => {
    angemeldet = { ...angemeldet, role: 'Mitarbeiter' };
    zeige();
    const liste = gruppe('Alle Einstellungen');
    expect(within(liste).getAllByRole('link').map((l) => l.textContent)).toEqual(['Mein Konto']);
    expect(screen.queryByText('Einrichtungsstand')).not.toBeInTheDocument();
    expect(abgefragt).not.toHaveBeenCalled();
  });

  it('zeigt der Buchhaltung ihre drei Unterseiten — und nicht die Sätze', () => {
    angemeldet = { ...angemeldet, role: 'Buchhaltung' };
    zeige();
    const liste = gruppe('Alle Einstellungen');
    expect(within(liste).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Mein Konto', 'Rechnungsvorgaben', 'Kontenrahmen',
    ]);
    expect(screen.queryByText('Einrichtungsstand')).not.toBeInTheDocument();
    // Der Stand ist Sache der Spitze — für die Buchhaltung wird nichts abgefragt.
    expect(abgefragt).not.toHaveBeenCalled();
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
  it('zählt, was erledigt ist, und meldet eine falsche IBAN als Fehler', async () => {
    betrieb = { ...VOLL, iban: 'AT00 1234' };
    zeige();
    expect(await screen.findByText('5 von 6 erledigt')).toBeInTheDocument();
    const stand = gruppe('Einrichtungsstand');
    const zeile = within(stand).getByRole('link', { name: 'Bankverbindung' }).closest('li') as HTMLElement;
    expect(within(zeile).getByText('prüfen')).toBeInTheDocument();
  });

  /*
    PLANLINIE (E30): „5 von 6 erledigt“ ist eine Menge gegen ihre Grenze und
    steht als Maßlinie im Kopf; der Satz bleibt als Zahl daran.
  */
  it('bemaßt den Stand als Maßlinie: erledigt gegen alle Punkte (Planlinie)', async () => {
    betrieb = { ...VOLL, iban: 'AT00 1234' };
    zeige();
    const linie = await screen.findByRole('img', { name: 'Einrichtung: 5 von 6 Punkten erledigt' });
    expect(linie).toHaveClass('masslinie');
    // Fünf von sechs: die Strecke endet bei fünf Sechsteln, nicht am Ende.
    expect((linie.querySelector('.masslinie-strecke') as HTMLElement).style.width).toBe('83.3%');
  });

  it('ist bei vollständigem Briefkopf „erledigt“ und sonst „offen“', () => {
    expect(einrichtungsstand(VOLL as Company).map((p) => p.wort)).toEqual(['erledigt', 'erledigt', 'erledigt']);
    expect(einrichtungsstand({ ...VOLL, ort: '' } as Company)[0].wort).toBe('offen');
    expect(einrichtungsstand({ ...VOLL, vatId: 'ATU1' } as Company)[1].wort).toBe('prüfen');
    expect(einrichtungsstand({} as Company).map((p) => p.wort)).toEqual(['offen', 'offen', 'offen']);
  });
});

describe('Der Einrichtungsstand: Kostensätze, Kontenrahmen, Sicherung (17 E)', () => {
  it('zeigt erst Platzhalter, dann alle sechs Punkte auf einmal — keine Zahl, die springt', async () => {
    let los: () => void = () => undefined;
    warten = new Promise((r) => { los = r; });
    zeige();
    expect(screen.getByRole('heading', { name: 'Einrichtungsstand' })).toBeInTheDocument();
    expect(screen.queryByText(/von \d erledigt/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Briefkopf' })).not.toBeInTheDocument();
    los();
    expect(await screen.findByText('6 von 6 erledigt')).toBeInTheDocument();
    const stand = gruppe('Einrichtungsstand');
    expect(within(stand).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      [expect.stringContaining('Briefkopf'), '/settings/firma'],
      [expect.stringContaining('UID-Nummer'), '/settings/firma'],
      [expect.stringContaining('Bankverbindung'), '/settings/firma'],
      [expect.stringContaining('Kostensätze'), '/settings/saetze'],
      [expect.stringContaining('Kontenrahmen'), '/settings/konten'],
      [expect.stringContaining('Sicherung'), '/settings/sicherung'],
    ]);
    expect(within(stand).getByText('Facharbeiter € 42,00, Helfer € 31,00 je Stunde')).toBeInTheDocument();
    expect(within(stand).getByText('3 Konten für den Buchungsstapel')).toBeInTheDocument();
  });

  it('nennt, was fehlt — und was sich nicht abrufen ließ, als „prüfen“ statt „offen“', async () => {
    kosten = null;
    konten = new Error('Netz weg');
    lauf = undefined;
    zeige();
    expect(await screen.findByText('3 von 6 erledigt')).toBeInTheDocument();
    const zeile = (titel: string) =>
      within(gruppe('Einrichtungsstand')).getByRole('link', { name: new RegExp(titel) }).closest('li') as HTMLElement;
    expect(within(zeile('Kostensätze')).getByText('offen')).toBeInTheDocument();
    expect(within(zeile('Kostensätze')).getByText('Ohne Kostensätze rechnet die Nachkalkulation nichts')).toBeInTheDocument();
    expect(within(zeile('Kontenrahmen')).getByText('prüfen')).toBeInTheDocument();
    expect(within(zeile('Kontenrahmen')).getByText('Der Stand ließ sich gerade nicht abrufen')).toBeInTheDocument();
    expect(within(zeile('Sicherung')).getByText('offen')).toBeInTheDocument();
    expect(within(zeile('Sicherung')).getByText('Noch nie durchgelaufen — oder es ist nichts darüber festgehalten.')).toBeInTheDocument();
  });

  it('eine Sicherung, die seit Tagen nicht lief, ist ein Fehler', async () => {
    lauf = { companyId: 'perl', art: 'ausleitung', zuletztErfolg: Date.now() - 4 * 24 * 3_600_000, erfolg: true };
    zeige();
    await waitFor(() => expect(screen.getByText('5 von 6 erledigt')).toBeInTheDocument());
    const zeile = within(gruppe('Einrichtungsstand')).getByRole('link', { name: /Sicherung/ }).closest('li') as HTMLElement;
    expect(within(zeile).getByText('prüfen')).toBeInTheDocument();
    expect(within(zeile).getByText(/vor 4 Tagen/)).toBeInTheDocument();
  });

  it('bei der Suche bleibt er weg, wie bisher', async () => {
    zeige();
    await screen.findByText('6 von 6 erledigt');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Einstellung suchen' }), 'iban');
    expect(screen.queryByRole('heading', { name: 'Einrichtungsstand' })).not.toBeInTheDocument();
  });
});
