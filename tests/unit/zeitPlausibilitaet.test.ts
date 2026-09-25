import { describe, it, expect } from 'vitest';
import { zeitbild, zeitSatz, LANGER_TAG_MIN } from '@/features/time/zeitPlausibilitaet';

/**
 * Was die Buchungsmaske aus Von, Bis und Pause rechnet — und wann sie es
 * erklären muss.
 *
 * Zwei Fälle laufen ohne diese Anzeige still in die falsche Richtung, und
 * beide landen über die Monatsbilanz auf einem Lohnzettel: ein Tippfehler in
 * der Endzeit, den `calcWorkMin` als Einsatz über Mitternacht liest, und eine
 * Pause, die den ganzen Zeitraum auffrisst.
 */

describe('Das Bild zur Eingabe', () => {
  it('rechnet den gewöhnlichen Tag', () => {
    expect(zeitbild('07:00', '16:00', '30')).toEqual({
      minuten: 8 * 60 + 30,
      ueberMitternacht: false,
      befund: 'ok',
    });
  });

  it('sagt nichts, solange eine Zeit fehlt', () => {
    // Wer gerade erst die Startzeit gesetzt hat, braucht keine Meldung über
    // eine Arbeitszeit von null.
    expect(zeitbild('', '16:00', '30')).toBeNull();
    expect(zeitbild('07:00', '', '30')).toBeNull();
  });

  it('liest eine leere Pause als keine Pause', () => {
    expect(zeitbild('07:00', '16:00', '')?.minuten).toBe(9 * 60);
  });

  it('erkennt den Einsatz über Mitternacht', () => {
    // 22:00–06:00 ist der gültige Notdienst und muss gebucht werden können.
    const bild = zeitbild('22:00', '06:00', '0');
    expect(bild).toEqual({ minuten: 8 * 60, ueberMitternacht: true, befund: 'ok' });
  });

  it('macht den Tippfehler in der Endzeit sichtbar', () => {
    /*
      DER FALL, UM DEN ES GEHT. Aus „16:00" wird beim Vertippen „06:00", und
      `calcWorkMin` rechnet über Mitternacht: aus neun Stunden werden
      dreiundzwanzig. Bis hierher widersprach niemand.
    */
    const bild = zeitbild('07:00', '06:00', '0');
    expect(bild?.minuten).toBe(23 * 60);
    expect(bild?.befund).toBe('langerTag');
  });

  it('meldet eine Pause, die den ganzen Zeitraum auffrisst', () => {
    const bild = zeitbild('07:00', '16:00', '600');
    expect(bild).toEqual({ minuten: 0, ueberMitternacht: false, befund: 'keineZeit' });
  });

  it('zieht die Grenze bei zwölf Stunden, nicht darunter', () => {
    // § 9 AZG. Genau zwölf sind zulässig; erst darüber ist es eine Buchung,
    // die jemand angesehen haben sollte.
    expect(zeitbild('06:00', '18:00', '0')?.befund).toBe('ok');
    expect(zeitbild('06:00', '18:01', '0')?.befund).toBe('langerTag');
    expect(LANGER_TAG_MIN).toBe(720);
  });
});

describe('Der erklärende Satz', () => {
  it('bleibt beim gewöhnlichen Tag aus', () => {
    // Ein Satz, der bei jeder normalen Buchung erscheint, wird nach einer
    // Woche nicht mehr gelesen.
    expect(zeitSatz(zeitbild('07:00', '16:00', '30')!)).toBeNull();
  });

  it('erklärt den gültigen Notdienst, ohne ihn zu tadeln', () => {
    const satz = zeitSatz(zeitbild('22:00', '06:00', '0')!);
    expect(satz).toMatch(/über Mitternacht/);
    expect(satz).not.toMatch(/prüfen/);
  });

  it('bittet beim Tippfehler ums Nachsehen und nennt den Grund', () => {
    const satz = zeitSatz(zeitbild('07:00', '06:00', '0')!);
    expect(satz).toMatch(/Endzeit liegt vor der Startzeit/);
    expect(satz).toMatch(/prüfen/);
  });

  it('nennt beim langen Tag die zwölf Stunden', () => {
    expect(zeitSatz(zeitbild('05:00', '18:00', '0')!)).toMatch(/zwölf Stunden/);
  });

  it('sagt bei zu langer Pause, dass nichts gebucht wird', () => {
    expect(zeitSatz(zeitbild('07:00', '16:00', '600')!)).toMatch(/keine Arbeitszeit/);
  });
});

describe('nachtMinuten — was zwischen 22 und 6 Uhr liegt', () => {
  it('zählt über Mitternacht', async () => {
    const { nachtMinuten } = await import('@/features/time/zeitPlausibilitaet');
    expect(nachtMinuten('20:00', '02:00')).toBe(4 * 60);
    expect(nachtMinuten('22:00', '06:00')).toBe(8 * 60);
    expect(nachtMinuten('04:00', '08:00')).toBe(2 * 60);
    expect(nachtMinuten('07:00', '16:00')).toBe(0);
    // Beginn gleich Ende ist keine Spanne, ein leeres Feld auch nicht.
    expect(nachtMinuten('07:00', '07:00')).toBe(0);
    expect(nachtMinuten('', '02:00')).toBe(0);
  });
});
