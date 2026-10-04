import { describe, it, expect } from 'vitest';
import {
  anlaesseDesBetriebs,
  arbeitsjahr,
  istTeilung,
  kalendertage,
  laengerAlsEinMonat,
  pflegeStand,
  warnungen,
  type FreistellungFuerRegeln,
} from '@shared/freistellung';
import { kuerzungsVorschlag } from '@shared/urlaubAliquot';
import { bilanzAusEintraegen, monatVon } from '@shared/monatsbilanz';
import {
  empfaengerFreistellung,
  textFreistellungAntrag,
  textFreistellungEntscheidung,
  type Belegschaftsmitglied,
} from '@shared/notifyLogic';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import { calcMonthStats, calcOverallSaldo, saldoAusBilanzen, localDateStr } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Sonderurlaub (Plan 10.3) — die Regeln, die App und Datenbank teilen, und
 * was der Sonderurlaub im Zeitkonto bewirkt.
 */

const anlaesse = anlaesseDesBetriebs(null);
const tageVon = (f: FreistellungFuerRegeln) => kalendertage(f.von, f.bis);
const f = (rest: Partial<FreistellungFuerRegeln>): FreistellungFuerRegeln => ({
  id: 'x', userId: 'u', art: 'dienstverhinderung', von: '2026-11-02', bis: '2026-11-02', status: 'Beantragt', ...rest,
});

describe('Warnungen für die Bestätigenden', () => {
  it('mehr Tage als vorgesehen — über alle Anträge desselben Falls', () => {
    const erster = f({ id: 'a', anlass: 'tod_eltern', ereignisDatum: '2026-11-01', von: '2026-11-02', bis: '2026-11-02' });
    const zweiter = f({ id: 'b', anlass: 'tod_eltern', ereignisDatum: '2026-11-01', von: '2026-11-03', bis: '2026-11-04' });
    expect(warnungen(zweiter, [erster], anlaesse, tageVon).join(' ')).toMatch(/zusammen 3 Arbeitstage, vorgesehen sind 2/);
    // Gegenprobe: im Rahmen keine Warnung.
    expect(warnungen(f({ anlass: 'tod_eltern', ereignisDatum: '2026-11-01', von: '2026-11-02', bis: '2026-11-03' }), [], anlaesse, tageVon)).toEqual([]);
  });

  it('zweiter Wohnungswechsel im selben Kalenderjahr', () => {
    const maerz = f({ id: 'a', anlass: 'wohnungswechsel', ereignisDatum: '2026-03-02', von: '2026-03-02', bis: '2026-03-03' });
    const august = f({ id: 'b', anlass: 'wohnungswechsel', ereignisDatum: '2026-08-03', von: '2026-08-03', bis: '2026-08-03' });
    expect(warnungen(august, [maerz], anlaesse, tageVon).join(' ')).toMatch(/Zweiter Wohnungswechsel/);
    const naechstesJahr = f({ id: 'c', anlass: 'wohnungswechsel', ereignisDatum: '2027-01-11', von: '2027-01-11', bis: '2027-01-11' });
    expect(warnungen(naechstesJahr, [maerz], anlaesse, tageVon)).toEqual([]);
  });

  it('Beginn mehr als 14 Tage nach dem Ereignis — außer der späte Begräbnistag beim Todesfall', () => {
    const spaet = f({ anlass: 'geburt', ereignisDatum: '2026-11-01', von: '2026-11-20', bis: '2026-11-20' });
    expect(warnungen(spaet, [], anlaesse, tageVon).join(' ')).toMatch(/mehr als 14 Tage nach dem Ereignis/);
    const tod = f({ id: 'a', anlass: 'tod_partner', ereignisDatum: '2026-11-01', von: '2026-11-02', bis: '2026-11-03' });
    const beisetzung = f({ id: 'b', anlass: 'tod_partner', ereignisDatum: '2026-11-01', von: '2026-11-25', bis: '2026-11-25' });
    expect(warnungen(beisetzung, [tod], anlaesse, tageVon)).toEqual([]);
    // Gegenprobe: ohne den ersten Teil ist auch beim Todesfall ein später Beginn eine Warnung.
    expect(warnungen(beisetzung, [], anlaesse, tageVon).join(' ')).toMatch(/mehr als 14 Tage/);
  });

  it('geteilt außer beim Todesfall: Hinweis auf die Freigabe der Spitze', () => {
    const a = f({ id: 'a', anlass: 'hochzeit', ereignisDatum: '2026-11-13', von: '2026-11-12', bis: '2026-11-12' });
    const b = f({ id: 'b', anlass: 'hochzeit', ereignisDatum: '2026-11-13', von: '2026-11-16', bis: '2026-11-16' });
    expect(istTeilung(b, [a])).toBe(true);
    expect(warnungen(b, [a], anlaesse, tageVon).join(' ')).toMatch(/Geteilt/);
    // Ein abgelehnter Antrag zählt nicht.
    expect(istTeilung(b, [{ ...a, status: 'Abgelehnt' }])).toBe(false);
  });

  it('die Tage des Betriebs gelten statt der Vorbelegung', () => {
    const eigen = anlaesseDesBetriebs({ wohnungswechsel: 3 });
    expect(eigen.find((a) => a.schluessel === 'wohnungswechsel')?.tage).toBe(3);
    expect(eigen.find((a) => a.schluessel === 'vorladung')?.tage).toBeNull();
  });
});

describe('Pflegefreistellung', () => {
  it('das Arbeitsjahr beginnt am Jahrestag des Eintritts', () => {
    expect(arbeitsjahr('2020-01-15', '2027-01-14')).toEqual({ von: '2026-01-15', bis: '2027-01-14' });
    expect(arbeitsjahr('2020-01-15', '2027-01-15')).toEqual({ von: '2027-01-15', bis: '2028-01-14' });
    expect(arbeitsjahr(null, '2027-03-01')).toEqual({ von: '2027-01-01', bis: '2027-12-31' });
  });

  it('die zweite Woche erst, wenn die erste verbraucht ist — gezählt wird Bestätigtes', () => {
    const woche = f({ art: 'pflegefreistellung', status: 'Bestätigt', von: '2027-03-08', bis: '2027-03-12', minuten: 2400 });
    expect(pflegeStand([woche], 40, '2020-01-15', '2027-04-01')).toMatchObject({ ersteWocheRestMin: 0, zusatzwocheMoeglich: true });
    expect(pflegeStand([{ ...woche, status: 'Beantragt' }], 40, '2020-01-15', '2027-04-01')).toMatchObject({ ersteWocheRestMin: 2400, zusatzwocheMoeglich: false });
    // Im nächsten Arbeitsjahr beginnt es neu.
    expect(pflegeStand([woche], 40, '2020-01-15', '2028-02-01').zusatzwocheMoeglich).toBe(false);
  });
});

describe('Kürzung des Urlaubsanspruchs', () => {
  it('25 Tage, März bis Mai unbezahlt: rund 6,3 Tage', () => {
    expect(kuerzungsVorschlag(25, '2027-03-01', '2027-05-31')).toEqual([
      { urlaubsjahr: 2027, kalendertage: 92, jahresTage: 365, tage: 6.3 },
    ]);
  });

  it('über den Jahreswechsel des Urlaubsjahres je Jahr eine Zeile', () => {
    const teile = kuerzungsVorschlag(25, '2026-12-01', '2027-01-31');
    expect(teile.map((t) => [t.urlaubsjahr, t.kalendertage])).toEqual([[2026, 31], [2027, 31]]);
    // Urlaubsjahr ab 1. Juli: Dezember und Jänner liegen im selben.
    expect(kuerzungsVorschlag(25, '2026-12-01', '2027-01-31', '07-01').map((t) => t.urlaubsjahr)).toEqual([2026]);
  });

  it('mehr als ein Monat (Sozialversicherung)', () => {
    expect(laengerAlsEinMonat('2027-03-01', '2027-03-31')).toBe(false);
    expect(laengerAlsEinMonat('2027-03-01', '2027-04-01')).toBe(true);
  });
});

describe('Im Zeitkonto', () => {
  const anna: AppUser = {
    id: 'u', uid: 'u', companyId: 'c', name: 'Anna', email: 'a@b.at', role: 'Mitarbeiter',
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-06-01', initialOvertime: 0,
  } as AppUser;
  const e = (date: string, status: TimeEntry['status'], von?: string, bis?: string): TimeEntry & { id: string } => ({
    id: `${date}-${status}-${von ?? ''}`, companyId: 'c', userId: 'u', userName: 'Anna', date, status,
    startTime: von, endTime: bis, breakDuration: status === 'Anwesend' ? 0 : undefined,
  } as TimeEntry & { id: string });

  /** Jeder Werktag im Juni 2026 gebucht: 8 Stunden Arbeit, ausser den genannten. */
  function juni(sonder: Record<string, Array<TimeEntry & { id: string }>>) {
    const raus: Array<TimeEntry & { id: string }> = [];
    for (let t = 1; t <= 30; t += 1) {
      const d = new Date(2026, 5, t);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const iso = localDateStr(d);
      raus.push(...(sonder[iso] ?? [e(iso, 'Anwesend', '07:00', '15:00')]));
    }
    return raus;
  }

  it('ein ganzer Sonderurlaubstag, ein ganzer Pflegetag und ein unbezahlter Tag erfüllen das Soll wie ein Urlaubstag', () => {
    const mitUrlaub = calcOverallSaldo(anna, juni({ '2026-06-10': [e('2026-06-10', 'Urlaub')] }), true).saldoH;
    for (const status of ['Dienstverhinderung', 'Pflegefreistellung', 'Unbezahlt'] as const) {
      expect(calcOverallSaldo(anna, juni({ '2026-06-10': [e('2026-06-10', status)] }), true).saldoH).toBe(mitUrlaub);
    }
  });

  it('stundenweise: die Minuten zählen als Soll, nicht als Arbeit', () => {
    // 4 Stunden gearbeitet, 4 Stunden Pflege: ausgeglichen wie ein voller Tag.
    const voll = calcOverallSaldo(anna, juni({}), true).saldoH;
    const geteilt = calcOverallSaldo(anna, juni({
      '2026-06-10': [e('2026-06-10', 'Anwesend', '07:00', '11:00'), e('2026-06-10', 'Pflegefreistellung', '12:00', '16:00')],
    }), true).saldoH;
    expect(geteilt).toBe(voll);
    // Gegenprobe: ohne die Pflege fehlen genau die 4 Stunden.
    const ohne = calcOverallSaldo(anna, juni({ '2026-06-10': [e('2026-06-10', 'Anwesend', '07:00', '11:00')] }), true).saldoH;
    expect(ohne).toBe(voll - 4);
  });

  it('Monatsbilanz und Einzelbuchungen kommen auf denselben Saldo', () => {
    const eintraege = juni({
      '2026-06-03': [e('2026-06-03', 'Dienstverhinderung')],
      '2026-06-04': [e('2026-06-04', 'Unbezahlt')],
      '2026-06-10': [e('2026-06-10', 'Anwesend', '07:00', '11:00'), e('2026-06-10', 'Pflegefreistellung', '12:00', '16:00')],
      '2026-06-17': [e('2026-06-17', 'Anwesend', '07:00', '13:00'), e('2026-06-17', 'Dienstverhinderung', '13:30', '15:30')],
    });
    const bilanz = bilanzAusEintraegen('2026-06', eintraege.map((x) => ({ ...x })));
    expect(bilanz.freistellungTage).toBe(2);
    expect(bilanz.freigestelltMin).toBe(360);
    const direkt = calcOverallSaldo(anna, eintraege, true);
    const verdichtet = saldoAusBilanzen(anna, [bilanz], [], true);
    expect(monatVon('2026-06-30')).toBe('2026-06');
    expect(verdichtet.saldoH).toBeCloseTo(direkt.saldoH, 2);
  });

  it('die Monatsauswertung nennt Tage je Art und die freigestellten Stunden', () => {
    const eintraege = juni({
      '2026-06-03': [e('2026-06-03', 'Dienstverhinderung')],
      '2026-06-04': [e('2026-06-04', 'Unbezahlt')],
      '2026-06-05': [e('2026-06-05', 'Pflegefreistellung')],
      '2026-06-10': [e('2026-06-10', 'Anwesend', '07:00', '11:00'), e('2026-06-10', 'Pflegefreistellung', '12:00', '16:00')],
    });
    const s = calcMonthStats(anna, eintraege, eintraege, 2026, 5, true);
    expect(s).toMatchObject({ sonderurlaubDays: 1, pflegeDays: 1, unbezahltDays: 1, freigestelltMin: 240 });
    // Ein vergangener Monat, voll gebucht: der Saldo ist ausgeglichen.
    expect(s.saldoMin).toBe(0);
  });
});

describe('Push-Meldungen', () => {
  const leute: Belegschaftsmitglied[] = [
    { uid: 'm', role: 'Mitarbeiter', active: true, buero: false },
    { uid: 'b', role: 'Buchhaltung', active: true, buero: true },
    { uid: 'g', role: 'Geschäftsführung', active: true, buero: true },
    { uid: 'a', role: 'Administrator', active: false, buero: true },
  ];

  it('neuer Sonderurlaub ans Büro, unbezahlter nur an die Spitze — nie an die Person selbst', () => {
    expect(empfaengerFreistellung(leute, { userId: 'm', art: 'dienstverhinderung' })).toEqual(['b', 'g']);
    expect(empfaengerFreistellung(leute, { userId: 'm', art: 'unbezahlt' })).toEqual(['g']);
    expect(empfaengerFreistellung(leute, { userId: 'b', art: 'pflegefreistellung' })).toEqual(['g']);
  });

  it('der Anlass steht nie in der Meldung', () => {
    const antrag = textFreistellungAntrag({ userName: 'Max', von: '2026-11-11', bis: '2026-11-13', art: 'dienstverhinderung' }, 'f1');
    expect(antrag.title).toBe('Neuer Antrag auf Sonderurlaub');
    expect(antrag.body).toBe('Max: 11.11.–13.11.');
    const entscheidung = textFreistellungEntscheidung({ von: '2026-11-11', bis: '2026-11-11', art: 'pflegefreistellung', status: 'Bestätigt' }, 'f1');
    expect(entscheidung.title).toBe('Pflegefreistellung bestätigt');
  });
});

describe('Buchen neben stundenweiser Freistellung', () => {
  it('Arbeit daneben ja, darüber nein — wie beim Zeitausgleich', () => {
    const pflege = { status: 'Pflegefreistellung' as const, startTime: '12:00', endTime: '16:00' };
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '07:00', endTime: '11:30', projectNumber: 'B1' }, [pflege])).toBeNull();
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '11:00', endTime: '13:00', projectNumber: 'B1' }, [pflege]))
      .toMatch(/überschneiden sich mit der Freistellung/);
  });

  it('ein ganzer Sonderurlaubstag lässt keine Arbeit daneben', () => {
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '07:00', endTime: '11:00' }, [{ status: 'Dienstverhinderung' }]))
      .toMatch(/gilt für den ganzen Tag/);
  });
});
