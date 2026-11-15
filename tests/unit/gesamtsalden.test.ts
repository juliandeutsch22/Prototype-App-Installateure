import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcOverallSaldo, localDateStr } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Der Gesamtsaldo aller Konten für die Mitarbeiterübersicht (19.10.2026).
 *
 * Die eine Eigenschaft, auf die es ankommt: je Person DIESELBE Zahl wie im
 * Fenster der Person (`zeitguthabenLaden`). Seit der Durchsicht vom
 * 15.11.2026 (L2) rechnet beides die Datenbank (`zeitkonto_salden`) — hier
 * steht für sie die App-Rechnung über eine Datenbank im Speicher; dass beide
 * auf die Minute gleich rechnen, prüft `tests/supabase/zeitkontoSaldo.test.ts`.
 * Geprüft wird hier, dass die Übersicht EINE Anfrage für alle stellt, auch
 * für das eigene Tagessoll je Wochentag (vorher alle Buchungen seit Eintritt).
 */

type Eintrag = TimeEntry & { id: string };
let alle: Eintrag[] = [];

const saldoAusSpeicher = (p: AppUser) => calcOverallSaldo(p, alle.filter((e) => e.userId === p.uid), true);
const zeitkontoSalden = vi.fn(async () => new Map(personen.filter((p) => p.appStartDate).map((p) => [p.uid, saldoAusSpeicher(p)])));
const zeitkontoSaldo = vi.fn(async (uid: string) => saldoAusSpeicher(personen.find((p) => p.uid === uid)!));
vi.mock('@/lib/db/zeitkonto', () => ({
  zeitkontoSalden: () => zeitkontoSalden(),
  zeitkontoSaldo: (uid: string) => zeitkontoSaldo(uid),
}));
const listEntriesInRange = vi.fn();
const listOwnEntriesSince = vi.fn();
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: (...a: unknown[]) => listOwnEntriesSince(...a),
  listOwnEntriesInRange: vi.fn(),
  listEntriesInRange: (...a: unknown[]) => listEntriesInRange(...a),
}));

const { gesamtsaldenLaden, zeitguthabenLaden } = await import('@/features/vacations/zeitguthaben');

const vorTagen = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
};

/** Der 15. vor `n` Monaten — ein Eintritt mitten im Monat, an jedem Tag des Testlaufs. */
const mitteVorMonaten = (n: number) => {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth() - n, 15));
};

function person(uid: string, over: Partial<AppUser> = {}): AppUser {
  return {
    id: uid, uid, companyId: 'perl', name: uid, email: `${uid}@perl.at`, role: 'Mitarbeiter', active: true,
    weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], initialOvertime: 3,
    ...over,
  } as AppUser;
}

/** Werktags gebucht ab `ab`, jeder siebte Tag fehlt, jeder elfte krank. */
function buchungen(uid: string, ab: string, workDays = [1, 2, 3, 4, 5]): Eintrag[] {
  const liste: Eintrag[] = [];
  let i = 0;
  for (const d = new Date(`${ab}T00:00:00`); d < new Date(); d.setDate(d.getDate() + 1)) {
    if (!workDays.includes(d.getDay())) continue;
    i += 1;
    if (i % 7 === 0) continue;
    const date = localDateStr(d);
    const krank = i % 11 === 0;
    liste.push({
      id: `${uid}-${date}`, companyId: 'perl', userId: uid, date, status: krank ? 'Krank' : 'Anwesend',
      startTime: krank ? undefined : '07:00', endTime: krank ? undefined : i % 3 === 0 ? '17:00' : '15:30',
      breakDuration: krank ? undefined : 30,
    } as Eintrag);
  }
  return liste;
}

const personen = [
  person('voll', { appStartDate: vorTagen(300) }),
  // Teilzeit mit vier Tagen, Eintritt mitten im Monat vor zwei Monaten.
  person('teil', { appStartDate: mitteVorMonaten(2), weeklyTargetHours: 32, workDays: [1, 2, 3, 4] }),
  // Eigenes Tagessoll: geht einzeln über alle Buchungen.
  person('kurzerFreitag', { appStartDate: vorTagen(120), tagessoll: { '1': 8.5, '2': 8.5, '3': 8.5, '4': 8.5, '5': 6 } }),
  person('ohneEintritt', { appStartDate: undefined }),
];

beforeEach(() => {
  vi.clearAllMocks();
  const teil = personen[1];
  alle = [
    ...buchungen('voll', vorTagen(300)),
    ...buchungen('teil', teil.appStartDate!, [1, 2, 3, 4]),
    ...buchungen('kurzerFreitag', vorTagen(120)),
    ...buchungen('ohneEintritt', vorTagen(30)),
  ];
  // Probewoche VOR dem Eintritt im selben Monat — die Bilanz zählt sie, der Saldo nicht (P1-15).
  alle.push({
    id: 'teil-probe', companyId: 'perl', userId: 'teil', date: `${teil.appStartDate!.slice(0, 7)}-02`, status: 'Anwesend',
    startTime: '06:00', endTime: '20:00', breakDuration: 30,
  } as Eintrag);
});

describe('Gesamtsaldo aller Konten', () => {
  it('ist je Person dieselbe Zahl wie im Fenster der Person', async () => {
    const salden = await gesamtsaldenLaden('perl', personen, true);
    for (const p of personen.filter((x) => x.appStartDate)) {
      expect(salden.get(p.uid)).toBe((await zeitguthabenLaden(p, true)).saldoH);
    }
  });

  it('ohne Eintrittsdatum kein Eintrag — kein Saldo von null', async () => {
    const salden = await gesamtsaldenLaden('perl', personen, true);
    expect(salden.has('ohneEintritt')).toBe(false);
  });

  it('holt alle in EINER Anfrage — auch das eigene Tagessoll, ohne Buchungen (L2)', async () => {
    await gesamtsaldenLaden('perl', personen, true);
    expect(zeitkontoSalden).toHaveBeenCalledTimes(1);
    expect(zeitkontoSaldo).not.toHaveBeenCalled();
    expect(listEntriesInRange).not.toHaveBeenCalled();
    expect(listOwnEntriesSince).not.toHaveBeenCalled();
  });

  it('ohne ein Konto mit Eintritt keine Anfrage', async () => {
    await gesamtsaldenLaden('perl', [personen[3]], true);
    expect(zeitkontoSalden).not.toHaveBeenCalled();
  });
});
