import { describe, it, expect } from 'vitest';
import {
  monateDazu,
  naechsterTermin,
  beurteile,
  tageZwischen,
  nachFaelligkeit,
  VORLAUF_TAGE,
} from '@/features/maintenance/wartungsplan';

/**
 * Die Terminrechnung hinter den wiederkehrenden Wartungen.
 *
 * Was hier schiefgehen kann, geht LEISE schief: ein Termin, der ein paar Tage
 * verrutscht, sieht auf keinem Bildschirm falsch aus. Auffallen würde es erst
 * nach Jahren — an einer Sommerwartung, die im Herbst steht, und an einer
 * Anlage, die niemand mehr angerufen hat.
 */

describe('monateDazu — Monate addieren, ohne den Monat zu wechseln', () => {
  it('rechnet den geraden Fall', () => {
    expect(monateDazu('2026-03-15', 12)).toBe('2027-03-15');
    expect(monateDazu('2026-03-15', 6)).toBe('2026-09-15');
  });

  it('trägt über den Jahreswechsel', () => {
    expect(monateDazu('2026-11-20', 3)).toBe('2027-02-20');
    expect(monateDazu('2026-12-31', 1)).toBe('2027-01-31');
  });

  /*
    DER FALL, DER OHNE ANSCHLAG FALSCH WIRD. Der 31. August plus sechs Monate
    wäre der 31. Februar. Ohne Kürzung auf den letzten Tag des Zielmonats
    rutscht das Datum in den März — und weil ab dann vom März weitergerechnet
    wird, wandert der Termin bei jedem Durchlauf weiter.
  */
  it('kürzt auf den letzten Tag des Zielmonats', () => {
    expect(monateDazu('2026-08-31', 6)).toBe('2027-02-28');
    expect(monateDazu('2026-01-31', 1)).toBe('2026-02-28');
    expect(monateDazu('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('kennt den Schalttag', () => {
    // 2028 ist ein Schaltjahr, 2027 nicht.
    expect(monateDazu('2027-01-31', 1)).toBe('2027-02-28');
    expect(monateDazu('2028-01-31', 1)).toBe('2028-02-29');
    expect(monateDazu('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('weist ein unbrauchbares Datum zurück, statt etwas zu erfinden', () => {
    expect(() => monateDazu('15.03.2026', 12)).toThrow(/JJJJ-MM-TT/);
    expect(() => monateDazu('', 12)).toThrow();
  });
});

describe('naechsterTermin', () => {
  it('rechnet ab dem Tag der Ausführung', () => {
    // Geplant war der 10. März, gewartet wurde am 2. Mai: das Jahr läuft ab
    // dem 2. Mai, nicht ab dem geplanten Termin.
    expect(naechsterTermin('2026-05-02', 12)).toBe('2027-05-02');
  });

  it('lässt kein sinnloses Intervall zu', () => {
    expect(() => naechsterTermin('2026-05-02', 0)).toThrow(/Monate/);
    expect(() => naechsterTermin('2026-05-02', -12)).toThrow(/Monate/);
    expect(() => naechsterTermin('2026-05-02', 1.5)).toThrow(/Monate/);
  });
});

describe('tageZwischen', () => {
  it('zählt ganze Tage', () => {
    expect(tageZwischen('2026-03-01', '2026-03-08')).toBe(7);
    expect(tageZwischen('2026-03-08', '2026-03-01')).toBe(-7);
    expect(tageZwischen('2026-03-01', '2026-03-01')).toBe(0);
  });

  /*
    Über die Zeitumstellung. Der letzte Sonntag im März hat in Österreich 23
    Stunden; mit lokalen Date-Objekten gerechnet käme hier 0,958 heraus und
    nach Abrunden ein Tag zu wenig. Deshalb rechnet die Funktion in UTC.
  */
  it('läuft überhaupt in einer Zeitzone mit Sommerzeit', () => {
    /*
      Ohne diese Feststellung prüfte der Test darunter nichts: auf einem
      Bauserver in UTC gibt es keine Zeitumstellung, über die man stolpern
      könnte. Die Zeitzone steht in `vitest.config.ts`.
    */
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Vienna');
  });

  it('stolpert nicht über die Sommerzeit', () => {
    expect(tageZwischen('2026-03-28', '2026-03-30')).toBe(2);
    expect(tageZwischen('2026-10-24', '2026-10-26')).toBe(2);
  });
});

const w = (faelligAm: string, aktiv = true) => ({ faelligAm, aktiv });

describe('beurteile — wie dringend ist die Wartung?', () => {
  const heute = '2026-06-01';

  it('meldet Überfälligkeit mit der Zahl der Tage', () => {
    const u = beurteile(w('2026-05-30'), heute);
    expect(u.stand).toBe('überfällig');
    expect(u.tage).toBe(-2);
    expect(u.text).toContain('2 Tagen');
  });

  it('nennt den heutigen Termin fällig, nicht überfällig', () => {
    const u = beurteile(w(heute), heute);
    expect(u.stand).toBe('fällig');
    expect(u.text).toBe('Heute fällig.');
  });

  /*
    Die Grenze des Vorlaufs — genau darauf und einen Tag danach. Ein
    Vergleich mit `<` statt `<=` verschöbe hier alles um einen Tag, und das
    fiele im Betrieb nie auf.
  */
  it('zieht die Grenze des Vorlaufs genau', () => {
    const amRand = '2026-07-01'; // 30 Tage später
    expect(tageZwischen(heute, amRand)).toBe(VORLAUF_TAGE);
    expect(beurteile(w(amRand), heute).stand).toBe('fällig');
    expect(beurteile(w('2026-07-02'), heute).stand).toBe('später');
  });

  it('sagt bei einer ruhenden Vereinbarung nichts von einem Termin', () => {
    const u = beurteile(w('2026-05-01', false), heute);
    expect(u.stand).toBe('ruht');
    expect(u.tage).toBeNull();
  });

  /*
    „Unklar" ist ausdrücklich NICHT „später". Eine Vereinbarung ohne
    brauchbares Datum ist kein erledigter Fall — sie ist der einzige, der eine
    Eingabe braucht, und der einzige, den sonst niemand vermisst.
  */
  it('behandelt ein fehlendes oder kaputtes Datum als unklar', () => {
    expect(beurteile({ faelligAm: '', aktiv: true }, heute).stand).toBe('unklar');
    expect(beurteile({ faelligAm: '01.06.2026', aktiv: true }, heute).stand).toBe('unklar');
    expect(beurteile({ faelligAm: '', aktiv: true }, heute).stand).not.toBe('später');
  });

  it('nimmt einen abweichenden Vorlauf an', () => {
    expect(beurteile(w('2026-06-20'), heute, 7).stand).toBe('später');
    expect(beurteile(w('2026-06-20'), heute, 30).stand).toBe('fällig');
  });
});

describe('nachFaelligkeit', () => {
  it('sortiert den früheren Termin nach vorn', () => {
    const liste = [w('2026-09-01'), w('2026-03-01'), w('2026-06-01')];
    expect(liste.sort(nachFaelligkeit).map((x) => x.faelligAm)).toEqual([
      '2026-03-01',
      '2026-06-01',
      '2026-09-01',
    ]);
  });

  it('stellt Vereinbarungen ohne Termin nach ganz oben', () => {
    const liste = [w('2026-09-01'), { faelligAm: '', aktiv: true }, w('2026-03-01')];
    expect(liste.sort(nachFaelligkeit)[0].faelligAm).toBe('');
  });
});
