/**
 * Der Entwurf eines Benutzerprofils.
 *
 * WAS HIER AUF DEM SPIEL STEHT. An diesen Umrechnungen hängen Wochenstunden,
 * Urlaubsanspruch und Startsaldo — also der Lohnzettel. Und sie werden von
 * ZWEI Masken benutzt: die Liste legt an, die Akte ändert. Ein Unterschied
 * zwischen beiden wäre nicht sichtbar, sondern stünde am Monatsende in einer
 * Zahl.
 */
import { describe, it, expect } from 'vitest';
import {
  zahlOderVorgabe,
  zahlOderNull,
  alsEntwurf,
  alsProfil,
  gleich,
  leererEntwurf,
  aliquoterAnspruch,
} from '@/features/users/benutzerEntwurf';
import type { AppUser } from '@/types';

const PERSON = {
  id: 'u1', uid: 'u1', companyId: 'perl', name: 'Erna Beispiel', email: 'erna@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 38.5, yearlyVacationDays: 25,
  appStartDate: '2026-01-01', initialOvertime: 12, initialVacationDays: null,
  workDays: [1, 2, 3, 4, 5],
} as AppUser;

describe('Eine Zahl aus einem Formularfeld', () => {
  it('nimmt die Vorgabe nur bei leerer oder unbrauchbarer Eingabe', () => {
    expect(zahlOderVorgabe('', 40)).toBe(40);
    expect(zahlOderVorgabe('   ', 40)).toBe(40);
    expect(zahlOderVorgabe('abc', 40)).toBe(40);
    expect(zahlOderVorgabe('20', 40)).toBe(20);
  });

  it('macht aus einer eingetippten Null KEINE Vierzig', () => {
    /*
      `Number(x) || VORGABE` sieht harmlos aus und ist es nicht. Wer null
      Wochenstunden einträgt — geringfügig, ruhendes Dienstverhältnis, die
      Chefin selbst —, bekäme stillschweigend vierzig. Jeder Monat
      produzierte danach rund 170 Minusstunden.
    */
    expect(zahlOderVorgabe('0', 40)).toBe(0);
    expect(zahlOderVorgabe('0', 25)).toBe(0);
  });

  it('unterscheidet „nicht angegeben" von null', () => {
    // Beim Resturlaub ist das der Unterschied zwischen „voller
    // Jahresanspruch" und „dieses Jahr keinen Tag mehr".
    expect(zahlOderNull('')).toBeNull();
    expect(zahlOderNull('abc')).toBeNull();
    expect(zahlOderNull('0')).toBe(0);
    expect(zahlOderNull('7')).toBe(7);
  });
});

describe('Aus einem Benutzer wird ein Entwurf', () => {
  it('nimmt die Felder mit, die es gibt', () => {
    const e = alsEntwurf(PERSON);
    expect(e.name).toBe('Erna Beispiel');
    expect(e.weeklyTargetHours).toBe('38.5');
    expect(e.initialOvertime).toBe('12');
    expect(e.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('macht aus „kein Resturlaub angegeben" ein leeres Feld', () => {
    expect(alsEntwurf(PERSON).initialVacationDays).toBe('');
    expect(alsEntwurf({ ...PERSON, initialVacationDays: 7 }).initialVacationDays).toBe('7');
  });

  it('behält einen Resturlaub von wirklich null Tagen', () => {
    // Die Gegenprobe: eine Prüfung auf `if (u.initialVacationDays)`
    // verschluckte die 0 — und die heisst „aufgebraucht", nicht „unbekannt".
    expect(alsEntwurf({ ...PERSON, initialVacationDays: 0 }).initialVacationDays).toBe('0');
  });

  it('behält einen Startsaldo von wirklich null Stunden', () => {
    expect(alsEntwurf({ ...PERSON, initialOvertime: 0 }).initialOvertime).toBe('0');
  });

  it('nimmt die Vorgaben, wo der Datensatz nichts sagt', () => {
    const e = alsEntwurf({ ...PERSON, weeklyTargetHours: undefined, workDays: undefined });
    expect(e.weeklyTargetHours).toBe('40');
    expect(e.workDays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Aus dem Entwurf wird, was gespeichert wird', () => {
  it('kommt unverändert zurück, was unverändert hineinging', () => {
    // DER RUNDLAUF. Geht er verloren, verändert schon das blosse Öffnen und
    // Speichern der Akte die Zahlen.
    const p = alsProfil(alsEntwurf(PERSON));
    expect(p).toMatchObject({
      name: 'Erna Beispiel', weeklyTargetHours: 38.5, yearlyVacationDays: 25,
      appStartDate: '2026-01-01', initialOvertime: 12, initialVacationDays: null,
      workDays: [1, 2, 3, 4, 5],
    });
  });

  it('macht aus einem leeren Startdatum `null` und nicht ""', () => {
    // Eine leere Zeichenkette nimmt eine `date`-Spalte nicht an.
    expect(alsProfil({ ...leererEntwurf(), appStartDate: '' }).appStartDate).toBeNull();
  });

  it('lässt keine leere Arbeitswoche zu', () => {
    // Das Tagessoll ist „Wochenstunden durch Arbeitstage". Ohne einen
    // einzigen Tag wäre es eine Division durch null.
    expect(alsProfil({ ...leererEntwurf(), workDays: [] }).workDays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Ob sich etwas geändert hat', () => {
  it('sagt nein, wenn nichts angefasst wurde', () => {
    expect(gleich(alsEntwurf(PERSON), alsEntwurf(PERSON))).toBe(true);
  });

  it('sagt ja bei jedem einzelnen Feld', () => {
    const a = alsEntwurf(PERSON);
    expect(gleich(a, { ...a, name: 'Anders' })).toBe(false);
    expect(gleich(a, { ...a, role: 'Buchhaltung' })).toBe(false);
    expect(gleich(a, { ...a, active: false })).toBe(false);
    expect(gleich(a, { ...a, weeklyTargetHours: '40' })).toBe(false);
    expect(gleich(a, { ...a, yearlyVacationDays: '30' })).toBe(false);
    expect(gleich(a, { ...a, appStartDate: '2026-02-01' })).toBe(false);
    expect(gleich(a, { ...a, initialOvertime: '13' })).toBe(false);
    expect(gleich(a, { ...a, initialVacationDays: '7' })).toBe(false);
  });

  it('sagt nein, wenn dieselben Tage in anderer Reihenfolge stehen', () => {
    // Wer einen Tag abwählt und wieder anwählt, hat nichts geändert — er
    // steht danach aber am Ende der Liste.
    const a = alsEntwurf(PERSON);
    expect(gleich(a, { ...a, workDays: [5, 4, 3, 2, 1] })).toBe(true);
  });

  it('sagt ja, sobald ein Tag dazukommt oder wegfällt', () => {
    const a = alsEntwurf(PERSON);
    expect(gleich(a, { ...a, workDays: [1, 2, 3, 4] })).toBe(false);
    expect(gleich(a, { ...a, workDays: [1, 2, 3, 4, 5, 6] })).toBe(false);
    expect(gleich(a, { ...a, workDays: [1, 2, 3, 4, 6] })).toBe(false);
  });
});

describe('Der aliquote Anspruch im angebrochenen ersten Urlaubsjahr', () => {
  /*
    DIE FALLE, DIE DAS SCHLIESST. Wer bei einem Neueintritt das Feld
    „Resturlaub" leer liess — was naheliegt, weil ja nichts mitzubringen ist —,
    bekam den VOLLEN Jahresanspruch ab Tag eins. Wer am 1. Oktober anfängt,
    hatte damit 25 Tage statt rund sechs. Das stand nirgends und fiel erst
    auf, wenn jemand Urlaub einreicht, den er nicht hat.
  */
  it('rechnet die Monate bis zum Ende des Urlaubsjahres', () => {
    // Eintritt im Oktober, Kalenderjahr: Oktober, November, Dezember.
    expect(aliquoterAnspruch(25, '2026-10-15')).toEqual({ monate: 3, tage: 6.25 });
  });

  it('zählt den Eintrittsmonat voll mit', () => {
    /*
      Die für den Mitarbeiter günstige Lesart, und die in Kollektivverträgen
      übliche. Wer am 31. Oktober anfängt, bekommt denselben Vorschlag wie
      wer am 1. Oktober anfängt — beim Urlaub in die für den Betrieb günstige
      Richtung zu irren ist keine Näherung, sondern ein Fehler.
    */
    expect(aliquoterAnspruch(25, '2026-10-31').monate).toBe(3);
    expect(aliquoterAnspruch(25, '2026-10-01').monate).toBe(3);
  });

  it('gibt am ersten Tag des Urlaubsjahres den vollen Anspruch', () => {
    // Dann ist nichts angebrochen, und der Vorschlag ist der Jahresanspruch.
    expect(aliquoterAnspruch(25, '2026-01-01')).toEqual({ monate: 12, tage: 25 });
  });

  it('richtet sich nach dem Urlaubsjahr des Betriebs, nicht nach dem Kalender', () => {
    /*
      Bei einem Urlaubsjahr ab 1. Juli liegt der Eintritt im Oktober 2026 im
      Urlaubsjahr 2026 (1.7.2026 – 30.6.2027) — es bleiben neun Monate, nicht
      drei. Nach dem Kalender gerechnet bekäme die Person ein Dreivierteljahr
      Urlaub zu wenig.
    */
    expect(aliquoterAnspruch(25, '2026-10-15', '07-01')).toEqual({ monate: 9, tage: 18.75 });
    // Und ein Eintritt im März gehört noch ins Urlaubsjahr davor.
    expect(aliquoterAnspruch(25, '2027-03-01', '07-01').monate).toBe(4);
  });

  it('rundet auf zwei Stellen und erfindet nichts dazu', () => {
    expect(aliquoterAnspruch(25, '2026-08-10').tage).toBe(10.42);
  });
});
