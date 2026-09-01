import { describe, it, expect } from 'vitest';
import { calcOverallSaldo, saldoAusBilanzen, localDateStr } from '@/lib/time';
import {
  bilanzAusEintraegen,
  betroffeneMonate,
  monatVon,
} from '../../functions/src/monatsbilanzLogik';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Die eine Eigenschaft, auf die es bei den Monatsbilanzen ankommt:
 *
 *   Der Saldo aus verdichteten Bilanzen muss auf die Minute derselbe sein wie
 *   der aus den Einzelbuchungen.
 *
 * Weicht er ab, ist der Stundensaldo falsch — und der geht auf den
 * Lohnzettel. Ein Beispiel-Test mit drei handverlesenen Fällen würde das
 * nicht zuverlässig aufdecken: die gefährlichen Fälle sind die schiefen —
 * Teilzeit mit vier Arbeitstagen, ein Eintritt mitten im Monat, Krankentage
 * neben Feiertagen, ein Einsatz über Mitternacht. Deshalb wird hier gegen
 * ZUFÄLLIG erzeugte Monate geprüft, viele Male.
 */

/** Deterministischer Zufall — ein Fehlschlag muss nachstellbar sein. */
function wuerfel(saat: number) {
  let x = saat;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const rollen = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung'] as const;

function baueFall(saat: number) {
  const r = wuerfel(saat);
  const heute = new Date();

  // Eintritt zwischen 14 und 400 Tagen zurück — mal mitten im Monat.
  const eintritt = new Date(heute);
  eintritt.setDate(eintritt.getDate() - (14 + Math.floor(r() * 386)));

  // Teilzeit einschließen: vier Arbeitstage sind der Fall, bei dem ein fest
  // durch fünf geteiltes Tagessoll falsch wird.
  const arbeitstage = r() < 0.3 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const wochenstunden = arbeitstage.length === 4 ? 32 : r() < 0.2 ? 20 : 40;

  const user: AppUser = {
    id: 'u1',
    companyId: 'perl',
    uid: 'u1',
    name: 'Prüffall',
    email: 'p@perl.at',
    role: rollen[Math.floor(r() * rollen.length)],
    active: true,
    weeklyTargetHours: wochenstunden,
    yearlyVacationDays: 25,
    workDays: arbeitstage,
    appStartDate: localDateStr(eintritt),
    initialOvertime: Math.floor(r() * 40) - 20,
  };

  // Buchungen: nicht jeden Tag, mit Krank, Urlaub und Nachtschichten.
  const eintraege: (TimeEntry & { id: string })[] = [];
  for (const d = new Date(eintritt); d < heute; d.setDate(d.getDate() + 1)) {
    if (!arbeitstage.includes(d.getDay())) continue;
    const w = r();
    if (w < 0.15) continue; // Lücke
    const datum = localDateStr(d);
    const status = w < 0.2 ? 'Krank' : w < 0.28 ? 'Urlaub' : 'Anwesend';
    const nacht = status === 'Anwesend' && r() < 0.08;
    eintraege.push({
      id: `e-${datum}`,
      companyId: 'perl',
      userId: 'u1',
      userName: 'Prüffall',
      date: datum,
      status,
      // Über Mitternacht: 22:00–06:00 ergab früher glatt null Stunden.
      startTime: status === 'Anwesend' ? (nacht ? '22:00' : '07:00') : undefined,
      endTime: status === 'Anwesend' ? (nacht ? '06:00' : '16:00') : undefined,
      breakDuration: status === 'Anwesend' ? (r() < 0.5 ? 30 : 45) : undefined,
    } as TimeEntry & { id: string });
  }
  return { user, eintraege };
}

/** Verdichtet Einträge so, wie es der Trigger serverseitig tut. */
function verdichte(eintraege: (TimeEntry & { id: string })[]) {
  const monate = [...new Set(eintraege.map((e) => monatVon(e.date)))].sort();
  return monate.map((m) =>
    bilanzAusEintraegen(
      m,
      eintraege.map((e) => ({
        userId: e.userId,
        date: e.date,
        status: e.status,
        startTime: e.startTime,
        endTime: e.endTime,
        breakDuration: e.breakDuration,
      })),
    ),
  );
}

describe('Monatsbilanzen liefern denselben Saldo wie die Einzelbuchungen', () => {
  it.each([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987])(
    'stimmt für Zufallsfall %i überein',
    (saat) => {
      const { user, eintraege } = baueFall(saat);
      const bilanzen = verdichte(eintraege);

      const jetzt = new Date();
      const aktuell = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;
      // Der laufende Monat kommt aus den echten Einträgen — er ändert sich
      // noch, und der Trigger braucht einen Augenblick.
      const laufend = eintraege.filter((e) => monatVon(e.date) === aktuell);

      const direkt = calcOverallSaldo(user, eintraege);
      const verdichtet = saldoAusBilanzen(user, bilanzen, laufend);

      expect(verdichtet.saldoH).toBeCloseTo(direkt.saldoH, 2);
      expect(verdichtet.daysWithoutEntry).toBe(direkt.daysWithoutEntry);
      expect(verdichtet.hasConfig).toBe(direkt.hasConfig);
    },
  );

  it('bleibt gleich, wenn die Wochenstunden nachträglich geändert werden', () => {
    /**
     * Der Grund, warum in der Bilanz NUR das Ist steht und niemals der Saldo.
     *
     * Setzt die Geschäftsführung jemanden von 40 auf 32 Wochenstunden, ändert
     * sich rückwirkend jeder einzelne Tag — Soll und Bewertung der Kranktage.
     * Ein gespeicherter Saldo wäre ab diesem Moment falsch, ohne dass eine
     * einzige Buchung angefasst wurde. Weil das Soll abgeleitet bleibt,
     * stimmen beide Wege auch danach überein, ohne dass eine Bilanz neu
     * geschrieben werden muss.
     */
    const { user, eintraege } = baueFall(4711);
    const bilanzen = verdichte(eintraege);
    const jetzt = new Date();
    const aktuell = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;
    const laufend = eintraege.filter((e) => monatVon(e.date) === aktuell);

    const geaendert: AppUser = { ...user, weeklyTargetHours: 32, workDays: [1, 2, 3, 4] };
    expect(saldoAusBilanzen(geaendert, bilanzen, laufend).saldoH).toBeCloseTo(
      calcOverallSaldo(geaendert, eintraege).saldoH,
      2,
    );
  });
});

describe('Die Bilanz selbst', () => {
  const e = (date: string, status: TimeEntry['status'], von?: string, bis?: string) => ({
    userId: 'u1',
    date,
    status,
    startTime: von,
    endTime: bis,
    breakDuration: 30,
  });

  it('zählt Krank- und Urlaubstage, statt sie zu bewerten', () => {
    /**
     * Ein Krankentag zählt als Tagessoll — wie viel das ist, hängt aber an
     * der Konfiguration. Stünden hier Minuten, wären sie nach der nächsten
     * Vertragsänderung falsch.
     */
    const b = bilanzAusEintraegen('2026-09', [
      e('2026-09-01', 'Krank'),
      e('2026-09-02', 'Urlaub'),
      e('2026-09-03', 'Anwesend', '07:00', '16:00'),
    ]);
    expect(b.krankTage).toBe(1);
    expect(b.urlaubTage).toBe(1);
    expect(b.anwesendMin).toBe(510); // 9 h minus 30 min Pause
  });

  it('rechnet einen Einsatz über Mitternacht als Nacht, nicht als null', () => {
    const b = bilanzAusEintraegen('2026-09', [e('2026-09-01', 'Anwesend', '22:00', '06:00')]);
    expect(b.anwesendMin).toBe(450); // 8 h minus 30 min
  });

  it('lässt Einträge fremder Monate liegen', () => {
    const b = bilanzAusEintraegen('2026-09', [
      e('2026-09-01', 'Anwesend', '07:00', '16:00'),
      e('2026-08-31', 'Anwesend', '07:00', '16:00'),
    ]);
    expect(b.tage).toEqual(['2026-09-01']);
  });

  it('ist wiederholbar — zweimal gerechnet ergibt dasselbe', () => {
    /**
     * Firestore-Trigger laufen MINDESTENS einmal, nicht GENAU einmal. Ein
     * Fortschreiben per `+= delta` verzählte sich beim Wiederholungslauf,
     * unbemerkt und dauerhaft. Die vollständige Neuberechnung darf beliebig
     * oft laufen.
     */
    const eintraege = [
      e('2026-09-01', 'Anwesend', '07:00', '16:00'),
      e('2026-09-02', 'Krank'),
    ];
    expect(bilanzAusEintraegen('2026-09', eintraege)).toEqual(
      bilanzAusEintraegen('2026-09', eintraege),
    );
  });
});

describe('Betroffene Monate bei einer Änderung', () => {
  it('nimmt BEIDE Monate, wenn ein Eintrag über die Monatsgrenze verschoben wird', () => {
    /**
     * Wird der 31. März auf den 1. April geschoben, sind zwei Bilanzen
     * falsch: die alte trägt die Stunden noch, die neue noch nicht. Wer nur
     * den Zielmonat neu rechnet, lässt im alten eine Stunde stehen, die es
     * nicht mehr gibt — aufgefallen wäre das erst am Jahressaldo.
     */
    const monate = betroffeneMonate(
      { userId: 'u1', date: '2026-03-31' },
      { userId: 'u1', date: '2026-04-01' },
    );
    expect(monate).toEqual([
      { userId: 'u1', monat: '2026-03' },
      { userId: 'u1', monat: '2026-04' },
    ]);
  });

  it('nimmt beide Mitarbeiter, wenn ein Eintrag umgehängt wird', () => {
    const monate = betroffeneMonate(
      { userId: 'u1', date: '2026-03-10' },
      { userId: 'u2', date: '2026-03-10' },
    );
    expect(monate).toHaveLength(2);
  });

  it('deckt Anlegen und Löschen ab', () => {
    expect(betroffeneMonate(null, { userId: 'u1', date: '2026-03-10' })).toHaveLength(1);
    expect(betroffeneMonate({ userId: 'u1', date: '2026-03-10' }, null)).toHaveLength(1);
    expect(betroffeneMonate(null, null)).toHaveLength(0);
  });
});
