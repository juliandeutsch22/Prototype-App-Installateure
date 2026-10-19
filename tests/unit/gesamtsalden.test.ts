import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bilanzAusEintraegen, monatVon } from '@shared/monatsbilanz';
import { localDateStr, saldoAusBilanzen } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Der Gesamtsaldo aller Konten für die Mitarbeiterübersicht (19.10.2026).
 *
 * Die eine Eigenschaft, auf die es ankommt: je Person DIESELBE Zahl wie im
 * Fenster der Person (`zeitguthabenLaden`) — nur gebündelt geholt. Geprüft
 * gegen eine Datenbank im Speicher mit schiefen Fällen: Eintritt mitten im
 * Monat samt Buchungen davor, Teilzeit mit vier Tagen, ein eigenes Tagessoll
 * je Wochentag, ein Konto ohne Eintrittsdatum.
 */

type Eintrag = TimeEntry & { id: string };
let alle: Eintrag[] = [];

const bilanzenVon = (uid: string) => {
  const eigene = alle.filter((e) => e.userId === uid);
  return [...new Set(eigene.map((e) => monatVon(e.date)))].sort().map((m) => ({ ...bilanzAusEintraegen(m, eigene), userId: uid }));
};

const listBilanzen = vi.fn(async (_c: string, uid: string, ab: string) => bilanzenVon(uid).filter((b) => b.monat >= ab));
const listBilanzenAlle = vi.fn(async (_c: string, ab: string) =>
  [...new Set(alle.map((e) => e.userId))].flatMap((uid) => bilanzenVon(uid)).filter((b) => b.monat >= ab));
vi.mock('@/lib/db/monatsbilanzen', () => ({
  monatVon: (d: string) => d.slice(0, 7),
  bilanzMarker: async () => ({ vollstaendigAb: '0000-01' }),
  listBilanzen: (...a: [string, string, string]) => listBilanzen(...a),
  listBilanzenAlle: (...a: [string, string]) => listBilanzenAlle(...a),
}));

const listOwnEntriesSince = vi.fn(async (_c: string, uid: string, ab: string) => alle.filter((e) => e.userId === uid && e.date >= ab));
const listEntriesInRange = vi.fn(async (_c: string, von: string, bis: string) => alle.filter((e) => e.date >= von && e.date <= bis));
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: (...a: [string, string, string]) => listOwnEntriesSince(...a),
  listOwnEntriesInRange: async (_c: string, uid: string, von: string, bis: string) =>
    alle.filter((e) => e.userId === uid && e.date >= von && e.date <= bis),
  listEntriesInRange: (...a: [string, string, string]) => listEntriesInRange(...a),
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

  it('holt gebündelt: eine Abfrage für die Bilanzen, eine für den laufenden Monat, eine je Eintrittsmonat', async () => {
    await gesamtsaldenLaden('perl', personen, true);
    expect(listBilanzenAlle).toHaveBeenCalledTimes(1);
    expect(listBilanzen).not.toHaveBeenCalled();
    // laufender Monat + zwei verschiedene Eintrittsmonate (voll, teil)
    expect(listEntriesInRange).toHaveBeenCalledTimes(1 + new Set([personen[0], personen[1]].map((p) => p.appStartDate!.slice(0, 7))).size);
    // Nur das eigene Tagessoll geht einzeln über alle Buchungen.
    expect(listOwnEntriesSince).toHaveBeenCalledTimes(1);
    expect(listOwnEntriesSince.mock.calls[0][1]).toBe('kurzerFreitag');
  });

  it('Gegenprobe: ohne den Eintrittsmonat aus den Einzelbuchungen stimmte die Teilzeit nicht', async () => {
    const teil = personen[1];
    const salden = await gesamtsaldenLaden('perl', personen, true);
    const jetzt = new Date();
    const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
    const ohneEintrittsmonat = saldoAusBilanzen(
      teil,
      bilanzenVon('teil').filter((b) => b.monat >= teil.appStartDate!.slice(0, 7)),
      alle.filter((e) => e.userId === 'teil' && e.date >= monatsErster),
      true,
    ).saldoH;
    expect(salden.get('teil')).not.toBe(ohneEintrittsmonat);
  });
});
