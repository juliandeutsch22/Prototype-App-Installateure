import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Role, Wartung } from '@/types';

/**
 * Der Wartungshinweis auf der Startseite.
 *
 * ER SCHLIESST DEN ABLAUF. Ohne ihn wäre die Wartungsliste eine Seite, die
 * man aufrufen muss — im Frühjahr einmal und dann nicht mehr. Eine vergessene
 * Wartung fällt niemandem auf: der Kunde beschwert sich nicht, dass niemand
 * gekommen ist, er wechselt beim nächsten Gebrechen den Betrieb.
 *
 * UND ER STEHT NUR DA, WENN ETWAS IST — dieselbe Regel wie bei den
 * Nachtläufen. Eine dauerhafte Kachel „nichts fällig" wäre nach zwei Wochen
 * unsichtbar, und mit ihr der eine Tag, an dem etwas darin steht.
 */

const HEUTE = '2026-06-01';
let heute = HEUTE;
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => heute };
});

let faellig: (Wartung & { id: string })[] = [];
/*
  Seit 15.11.2026 zählt die Datenbank (`wartungen_faellig_stand`, Budget B3:
  vorher kam jede fällige Wartung für zwei Zahlen) — hier aus `faellig`
  nachgebildet: aktiv, fällig bis zum Stichtag, überfällig vor heute.
  `mock.calls[0][1]` ist weiter der Stichtag.
*/
const wartungenFaelligStand = vi.fn(async (...[h, bis]: [string, string, number]) => {
  const f = faellig.filter((x) => x.aktiv && x.faelligAm <= bis);
  const teil = (xs: typeof f) => ({ anzahl: xs.length, ueberfaellig: xs.filter((x) => x.faelligAm < h).length, zeilen: [] });
  return { ohne: teil(f.filter((x) => !x.offeneBaustelle)), eingeplant: teil(f.filter((x) => !!x.offeneBaustelle)) };
});
vi.mock('@/lib/db/wartungen', () => ({
  wartungenFaelligStand: (h: string, b: string, n: number) => wartungenFaelligStand(h, b, n),
}));

let modulAn = true;
vi.mock('@/lib/useModule', () => ({ useModul: () => modulAn }));

const authWert = {
  user: { uid: 'chef', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as Role },
  company: { id: 'perl', name: 'Perl' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WartungHinweis } = await import('@/features/dashboard/WartungHinweis');

const w = (id: string, faelligAm: string): Wartung & { id: string } => ({
  id,
  companyId: 'perl',
  customerId: 'k1',
  customerName: 'Bäckerei Stein',
  anlage: 'Therme',
  intervallMonate: 12,
  faelligAm,
  aktiv: true,
});

function zeige() {
  return render(
    <MemoryRouter>
      <WartungHinweis />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  heute = HEUTE;
  faellig = [];
  modulAn = true;
  authWert.user.role = 'Geschäftsführung';
  wartungenFaelligStand.mockClear();
});

describe('Wenn nichts ansteht', () => {
  it('steht gar nichts da', async () => {
    const { container } = zeige();
    await waitFor(() => expect(wartungenFaelligStand).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});

describe('Wenn etwas ansteht', () => {
  it('nennt die Zahl und führt zur Liste', async () => {
    faellig = [w('a', '2026-06-10'), w('b', '2026-06-20')];
    zeige();
    expect(await screen.findByText('2 Wartungen stehen an')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zu den Wartungen' }).getAttribute('href')).toBe(
      '/wartungen',
    );
  });

  it('hebt die überfälligen eigens hervor', async () => {
    faellig = [w('a', '2026-05-01'), w('b', '2026-06-20')];
    zeige();
    expect(await screen.findByText(/1 davon ist überfällig/)).toBeTruthy();
  });

  /*
    Der Stichtag liegt einen Monat voraus, nicht auf heute. Wer erst am
    Fälligkeitstag davon erfährt, kann keinen Termin mehr vereinbaren — der
    Kunde muss ja auch zu Hause sein.
  */
  it('fragt einen Monat im Voraus, nicht nur bis heute', async () => {
    zeige();
    await waitFor(() => expect(wartungenFaelligStand).toHaveBeenCalled());
    expect(wartungenFaelligStand.mock.calls[0][1]).toBe('2026-07-01');
  });
});

/*
  DERSELBE VORLAUF WIE DIE LISTE (Prüfbericht 09.11.2026). Gefragt wurde
  einen Kalendermonat voraus — im Februar 28 Tage, im Juli 31 —, die Liste
  „Steht an“ rechnet 30 Tage, und der Satz hier sagt „in den nächsten 30
  Tagen“. Gegenprobe: gegen den Stand davor fragt er bis zum 28.02. (rot).
*/
describe('Derselbe Vorlauf wie die Wartungsliste', () => {
  it('fragt 30 Tage voraus, auch wo der Monat kürzer ist', async () => {
    heute = '2027-01-31';
    faellig = [w('a', '2027-03-01')];
    zeige();
    expect(await screen.findByText('Eine Wartung steht an')).toBeTruthy();
    expect(wartungenFaelligStand.mock.calls[0][1]).toBe('2027-03-02');
    expect(screen.getByText(/Fällig in den nächsten 30 Tagen/)).toBeTruthy();
  });

  it('beurteilt wie die Liste: heute fällig ist nicht überfällig, gestern schon', async () => {
    faellig = [w('a', HEUTE), w('b', '2026-05-31')];
    zeige();
    expect(await screen.findByText('2 Wartungen stehen an')).toBeTruthy();
    expect(screen.getByText(/1 davon ist überfällig/)).toBeTruthy();
  });
});

describe('Wer den Hinweis sieht', () => {
  it('nicht der Monteur — er kann keinen Termin vereinbaren', async () => {
    faellig = [w('a', '2026-06-10')];
    authWert.user.role = 'Mitarbeiter';
    const { container } = zeige();
    /*
      Geprüft wird, dass GAR NICHT GEFRAGT wird. „Es steht nichts da" allein
      wäre der Ausgangszustand und bewiese nichts.
    */
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(wartungenFaelligStand).not.toHaveBeenCalled();
  });

  it('die Verwaltung schon — sie ruft beim Kunden an', async () => {
    faellig = [w('a', '2026-06-10')];
    authWert.user.role = 'Verwaltung';
    zeige();
    expect(await screen.findByText('Eine Wartung steht an')).toBeTruthy();
  });

  it('niemand, solange das Modul aus ist', async () => {
    faellig = [w('a', '2026-06-10')];
    modulAn = false;
    const { container } = zeige();
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(wartungenFaelligStand).not.toHaveBeenCalled();
  });
});
