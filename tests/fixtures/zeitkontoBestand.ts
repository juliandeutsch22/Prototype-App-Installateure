/**
 * EIN GEWACHSENER BESTAND FÜR DAS ZEITKONTO (Durchsicht 15.11.2026, Z3/L1/L2).
 *
 * Für die Frage „bleibt der Saldo gleich?“ reicht kein Monat mit acht
 * Buchungen: die Fehler, die hier zählen, stecken in Randfällen, die erst
 * über Jahre zusammenkommen — kurzer Freitag, Vier-Tage-Woche, 24./31.12.,
 * Schultag mit Arbeit danach, stundenweise Freistellung, Krank am Wochenende,
 * Nachtschicht über die Zeitumstellung, Buchungen vor dem Saldo-Start und
 * Urlaub in der Zukunft. Derselbe Bestand geht in die Prüfung der App-Rechnung
 * und in die gegen die Datenbank, damit beide dasselbe vergleichen.
 *
 * Bestimmt (fester Zufallsgenerator), relativ zu `heute`: die Buchungen
 * reichen vom Saldo-Start bis drei Wochen nach heute.
 */
import type { AppUser, TimeEntry } from '@/types';
import { isAustrianHoliday, localDateStr } from '@/lib/time';

export interface BestandPerson extends AppUser {
  /** Betrieb mit oder ohne halbe Tage am 24./31.12. */
  halbeTage: boolean;
}

export interface Bestand {
  betriebe: Array<{ id: string; halbeTage: boolean }>;
  personen: BestandPerson[];
  buchungen: TimeEntry[];
}

/** mulberry32 — klein, schnell, für Prüfungen völlig ausreichend. */
function zufall(saat: number): () => number {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plus = (iso: string, tage: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + tage);
  return localDateStr(d);
};

/** Kennungen als UUID — die Datenbank verlangt sie so. */
function kennung(r: () => number): string {
  const h = () => Math.floor(r() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

type Vorlage = Omit<BestandPerson, 'id' | 'uid' | 'companyId' | 'email'> & { betrieb: number; schule?: boolean };

/**
 * Die Personen: jede eine andere Arbeitszeit, so wie sie in Installations-
 * betrieben vorkommt. `heute` bestimmt nur, wie weit die Buchungen reichen.
 */
export function zeitkontoBestand(heute: string, saat = 20261116, praefix = 'zk-bestand'): Bestand {
  const r = zufall(saat);
  const jahr = Number(heute.slice(0, 4));
  const betriebe = [
    { id: `${praefix}-a`, halbeTage: true },
    { id: `${praefix}-b`, halbeTage: false },
  ];
  const vorlagen: Vorlage[] = [
    { betrieb: 0, halbeTage: true, name: 'Vollzeit', role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
      appStartDate: `${jahr - 4}-03-15`, initialOvertime: 12.5, yearlyVacationDays: 25, initialVacationDays: 7 },
    { betrieb: 0, halbeTage: true, name: 'Kurzer Freitag', role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, workDays: [1, 2, 3, 4, 5],
      tagessoll: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 }, appStartDate: `${jahr - 5}-01-01`, initialOvertime: 0, yearlyVacationDays: 25 },
    { betrieb: 0, halbeTage: true, name: 'Vier Tage', role: 'Mitarbeiter', active: true, weeklyTargetHours: 32, workDays: [1, 2, 3, 4],
      appStartDate: `${jahr - 2}-07-03`, initialOvertime: -3.25, yearlyVacationDays: 20 },
    { betrieb: 0, halbeTage: true, name: 'Lehrling', role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, workDays: [1, 2, 3, 4, 5],
      appStartDate: `${jahr - 1}-02-01`, initialOvertime: 0, yearlyVacationDays: 25, schule: true },
    { betrieb: 1, halbeTage: false, name: 'Teilzeit', role: 'Verwaltung', active: true, weeklyTargetHours: 20, workDays: [1, 3, 5],
      appStartDate: `${jahr - 1}-05-12`, initialOvertime: 4, yearlyVacationDays: 25 },
    { betrieb: 1, halbeTage: false, name: 'Chefin ohne Konto', role: 'Geschäftsführung', active: true, weeklyTargetHours: 40,
      workDays: [1, 2, 3, 4, 5], appStartDate: `${jahr - 3}-01-01`, initialOvertime: 0, fuehrtZeitkonto: false },
    { betrieb: 0, halbeTage: true, name: 'Ohne Saldo-Start', role: 'Mitarbeiter', active: true, weeklyTargetHours: 40,
      workDays: [1, 2, 3, 4, 5], appStartDate: null, initialOvertime: 6.75 },
    { betrieb: 1, halbeTage: false, name: 'Chef mit Konto', role: 'Geschäftsführung', active: true, weeklyTargetHours: 45,
      workDays: [1, 2, 3, 4, 5, 6], appStartDate: `${jahr - 2}-10-01`, initialOvertime: -20, fuehrtZeitkonto: true },
  ];

  const personen: BestandPerson[] = vorlagen.map((v) => {
    const uid = kennung(r);
    const { betrieb, schule, ...rest } = v;
    void schule;
    return { ...rest, id: uid, uid, companyId: betriebe[betrieb].id, email: `${uid}@zk.test` };
  });

  const buchungen: TimeEntry[] = [];
  const buche = (p: BestandPerson, date: string, status: TimeEntry['status'], extra: Partial<TimeEntry> = {}) => {
    buchungen.push({
      id: kennung(r), companyId: p.companyId, userId: p.uid, userName: p.name, date, status,
      breakDuration: 0, ...extra,
    } as TimeEntry);
  };

  personen.forEach((p, i) => {
    const start = p.appStartDate ?? `${jahr}-01-01`;
    const tage = p.workDays ?? [1, 2, 3, 4, 5];
    const schule = vorlagen[i].schule === true;
    const bis = plus(heute, 21);
    /*
      ABWESENHEITSBLÖCKE je Jahr: zwei Urlaube über Arbeitstage, einer davon
      über Weihnachten (24.–31.12.), und ein Krankenstand über Kalendertage —
      auch Wochenenden, wie ihn ein Import mitbringt.
    */
    const urlaub = new Set<string>();
    const krank = new Set<string>();
    for (let j = Number(start.slice(0, 4)); j <= jahr + 1; j += 1) {
      const sommer = `${j}-0${6 + Math.floor(r() * 3)}-${String(1 + Math.floor(r() * 20)).padStart(2, '0')}`;
      for (let k = 0; k < 8 + Math.floor(r() * 5); k += 1) urlaub.add(plus(sommer, k));
      if (r() < 0.6) for (let k = 23; k <= 31; k += 1) urlaub.add(`${j}-12-${k}`);
      const krankAb = `${j}-${String(2 + Math.floor(r() * 9)).padStart(2, '0')}-${String(1 + Math.floor(r() * 25)).padStart(2, '0')}`;
      for (let k = 0; k < 3 + Math.floor(r() * 4); k += 1) krank.add(plus(krankAb, k));
    }
    // Urlaub in den nächsten drei Wochen — zählt erst, wenn er vorbei ist.
    for (let k = 3; k < 8; k += 1) urlaub.add(plus(heute, k));
    // Heute krank — schreibt erst morgen gut.
    if (i === 1) krank.add(heute);

    for (let d = plus(start, -6); d <= bis; d = plus(d, 1)) {
      const wt = new Date(`${d}T00:00:00`).getDay();
      const arbeitstag = tage.includes(wt) && !isAustrianHoliday(new Date(`${d}T00:00:00`));
      if (krank.has(d)) { buche(p, d, 'Krank'); continue; }
      if (urlaub.has(d) && arbeitstag) { buche(p, d, 'Urlaub'); continue; }
      if (d > heute) continue;
      if (!arbeitstag) {
        // Ab und zu Arbeit am freien Tag, manchmal über Mitternacht.
        if (r() < 0.03) buche(p, d, 'Anwesend', { startTime: '22:00', endTime: '06:00', breakDuration: 0 });
        else if (r() < 0.02) buche(p, d, 'Anwesend', { startTime: '08:00', endTime: '12:15', breakDuration: 0 });
        continue;
      }
      if (schule && wt === 2) {
        buche(p, d, 'Berufsschule', { unterrichtMin: 300 + Math.floor(r() * 4) * 30 });
        if (r() < 0.5) buche(p, d, 'Anwesend', { startTime: '14:00', endTime: '16:30', breakDuration: 0 });
        continue;
      }
      const x = r();
      if (x < 0.03) continue;
      if (x < 0.05) { buche(p, d, 'Zeitausgleich'); continue; }
      if (x < 0.06) { buche(p, d, 'Dienstverhinderung'); continue; }
      if (x < 0.07) {
        buche(p, d, 'Anwesend', { startTime: '07:00', endTime: '12:00', breakDuration: 0 });
        buche(p, d, 'Pflegefreistellung', { startTime: '13:00', endTime: '16:00' });
        continue;
      }
      if (x < 0.075) { buche(p, d, 'Unbezahlt'); continue; }
      if (x < 0.10) { buche(p, d, 'Anwesend', { hours: 8.25 }); continue; }
      if (x < 0.30) {
        buche(p, d, 'Anwesend', { startTime: '07:00', endTime: '12:00', breakDuration: 0 });
        buche(p, d, 'Anwesend', { startTime: '12:30', endTime: '16:15', breakDuration: 0 });
        continue;
      }
      buche(p, d, 'Anwesend', { startTime: '07:00', endTime: `15:${x < 0.6 ? '30' : '45'}`, breakDuration: 30 });
    }
  });

  return {
    betriebe,
    personen: personen.map((p) => ({ ...p, halbeTage: betriebe.find((b) => b.id === p.companyId)!.halbeTage })),
    buchungen,
  };
}
