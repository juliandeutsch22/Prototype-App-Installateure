/**
 * Durchstich 1 und 2 auf Postgres: Zeit → Auswertung, Urlaub → Zeitkonto.
 *
 * WAS DIESE PRÜFUNG VON DEN MODULPRÜFUNGEN UNTERSCHEIDET. Die prüfen je ein
 * Modul gegen die Datenbank; jede Seite stimmt dann für sich. Ein Fehler an
 * der NAHT — die Genehmigung schreibt Tage, die der Saldo anders zählt —
 * fällt keiner davon auf.
 *
 * SIE GEHT DURCH DIE WEICHE, nicht an ihr vorbei: importiert wird
 * `@/lib/db/…`, nicht `@/lib/db/pg/…`. Damit ist mitgeprüft, dass die Kette
 * trägt und nicht nur die einzelnen Module.
 *
 * DIE FIRESTORE-FASSUNG (`tests/durchstich.test.ts`) STELLT DIE GENEHMIGUNG
 * NACH — sie schreibt von Hand, was die Cloud Function schreiben würde. Hier
 * entscheidet die echte Datenbankfunktion. Das ist der Unterschied zwischen
 * „die Kette um die Genehmigung herum stimmt" und „die Genehmigung stimmt".
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { AppUser, TimeEntry } from '@/types';


const zeiten = await import('@/lib/db/timeEntries');
const urlaubeDb = await import('@/lib/db/vacations');
const { calcOverallSaldo, offeneWerktage, urlaubsTage, calcWorkMin } =
  await import('@/lib/time');

const BETRIEB = 'durchstich1';

let monteur: Konto;
let buch: Konto;
let chef: Konto;
let mitarbeiter: AppUser;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'd1-monteur');
  buch = await konto(BETRIEB, 'Buchhaltung', 'd1-buch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'd1-chef');

  // Die Stammdaten, gegen die gerechnet wird — Soll, Urlaubsanspruch,
  // Arbeitswoche. Ohne sie rechnet der Saldo gegen nichts.
  const { error } = await admin.from('users').update({
    name: 'Max Mustermann',
    weekly_target_hours: 40,
    yearly_vacation_days: 25,
    work_days: [1, 2, 3, 4, 5],
    app_start_date: '2026-06-01',
    initial_overtime: 0,
  }).eq('id', monteur.uid);
  if (error) throw new Error(error.message);

  mitarbeiter = {
    id: monteur.uid, companyId: BETRIEB, uid: monteur.uid,
    name: 'Max Mustermann', email: 'max@perl.at', role: 'Mitarbeiter',
    weeklyTargetHours: 40, yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
    appStartDate: '2026-06-01', initialOvertime: 0,
  } as AppUser;

  clientEinreichen(monteur.client);
}, 180_000);

afterAll(() => {
  clientEinreichen(null);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Den Stichtag festnageln.
 *
 * `calcOverallSaldo` und die Lückenrechnung rechnen gegen HEUTE. Ein Test mit
 * festen Buchungsdaten liefert damit jeden Tag ein anderes Ergebnis und wäre
 * binnen einer Woche rot.
 *
 * NUR `Date`, nicht alle Timer: der Supabase-Client braucht echte
 * `setTimeout` für seine Netzwerkschleife, sonst kommt keine Antwort zurück.
 */
function heuteIst(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T08:00:00`));
}

/** Ein voller Arbeitstag: 07:00–16:00 mit 30 Minuten Pause = 8,5 h. */
const arbeitstag = (datum: string, projectNumber = 'B-2026-0001') => ({
  date: datum,
  status: 'Anwesend' as const,
  startTime: '07:00',
  endTime: '16:00',
  breakDuration: 30,
  projectNumber,
  userId: monteur.uid,
  userName: 'Max Mustermann',
});

describe('Durchstich 1: gebuchte Zeit kommt in der Auswertung an', () => {
  it('drei Tage buchen, die Buchhaltung liest sie, der Saldo stimmt', async () => {
    // Donnerstag: gerechnet wird bis GESTERN, also genau über die drei Tage.
    heuteIst('2026-06-04');
    clientEinreichen(monteur.client);
    for (const tag of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      await zeiten.createTimeEntry(BETRIEB, arbeitstag(tag));
    }

    /*
      Die Buchhaltung liest denselben Zeitraum mit einer ANDEREN Abfrage als
      der Monteur — und über eine andere Zeilenregel. Dass beide dieselben
      Zeilen sehen, prüft kein Rechentest.
    */
    clientEinreichen(buch.client);
    const imMonat = await zeiten.listEntriesInRange(BETRIEB, '2026-06-01', '2026-06-30');
    const seine = imMonat.filter((e) => e.userId === monteur.uid);
    expect(seine).toHaveLength(3);
    expect(seine.every((e) => calcWorkMin(e) === 510)).toBe(true); // 8,5 h

    // Soll je Tag: 40 h auf fünf Tage = 8 h. Gebucht 8,5 h — eine halbe
    // Stunde Plus je Tag.
    const saldo = calcOverallSaldo(mitarbeiter, seine as TimeEntry[]);
    expect(saldo.hasConfig).toBe(true);
    expect(saldo.saldoH).toBeCloseTo(1.5, 5);
  }, 120_000);

  it('meldet die Tage, an denen NICHTS gebucht wurde — ohne den Feiertag', async () => {
    heuteIst('2026-06-08');
    clientEinreichen(buch.client);
    const vorhandene = await zeiten.listEntriesInRange(BETRIEB, '2026-06-01', '2026-06-05');
    const offen = offeneWerktage(
      mitarbeiter,
      vorhandene.filter((e) => e.userId === monteur.uid) as TimeEntry[],
      new Date('2026-06-01T00:00:00'),
      new Date('2026-06-05T00:00:00'),
    );
    /*
      Gebucht sind Mo–Mi. Offen bleibt der Freitag — der Donnerstag fällt
      heraus, weil der 4. Juni 2026 FRONLEICHNAM ist. Ob der Feiertagskalender
      bis in die Lückenrechnung durchschlägt, sagt kein einzelner Rechentest;
      und die Startseite darf einen Feiertag nicht als „Zeit fehlt" melden.
    */
    expect(offen).toEqual(['2026-06-05']);
  }, 60_000);
});

describe('Durchstich 2: genehmigter Urlaub landet im Zeitkonto', () => {
  it('Antrag, echte Genehmigung, Zeiteinträge — und der Saldo bleibt heil', async () => {
    /*
      Eintritt am Montag der Urlaubswoche und Stichtag am Montag danach: das
      geprüfte Fenster ist damit GENAU die Urlaubswoche. Sonst mischten sich
      ungebuchte Tage davor in den Saldo.
    */
    const neuling = { ...mitarbeiter, appStartDate: '2026-07-06' };
    await admin.from('users').update({ app_start_date: '2026-07-06' })
      .eq('id', monteur.uid);
    heuteIst('2026-07-13');

    // 1. Der Monteur beantragt Mo–Fr.
    clientEinreichen(monteur.client);
    const tage = urlaubsTage(neuling, '2026-07-06', '2026-07-10');
    expect(tage).toHaveLength(5);
    await urlaubeDb.createVacation(BETRIEB, {
      userId: monteur.uid,
      userName: 'Max Mustermann',
      von: '2026-07-06',
      bis: '2026-07-10',
      tage: tage.length,
      status: 'Beantragt',
    });

    // 2. Die Geschäftsführung sieht den offenen Antrag.
    clientEinreichen(chef.client);
    const offene = await urlaubeDb.listOpenVacations(BETRIEB);
    expect(offene).toHaveLength(1);

    // 3. Und entscheidet — das ist hier keine Nachstellung mehr.
    const ergebnis = await urlaubeDb.entscheiden({
      vacationId: offene[0].id,
      entscheidung: 'Genehmigt',
      entscheiderName: 'Julian Deutsch',
    });
    expect(ergebnis).toMatchObject({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0 });

    // 4. Der Monteur sieht seinen Urlaub — als genehmigt.
    clientEinreichen(monteur.client);
    const meine = await urlaubeDb.listOwnVacations(BETRIEB, monteur.uid);
    expect(meine[0].status).toBe('Genehmigt');

    /*
      5. DER PUNKT, UM DEN ES GEHT. Fünf Urlaubstage dürfen den Saldo NICHT
      ins Minus ziehen und NICHT als „Zeit fehlt" erscheinen. Ohne die
      Zeiteinträge zöge der Saldo fünfmal das Tagessoll ab — vierzig Stunden.
    */
    const eigene = await zeiten.listOwnEntriesSince(BETRIEB, monteur.uid, '2026-07-01');
    const saldo = calcOverallSaldo(neuling, eigene as TimeEntry[]);
    expect(saldo.saldoH).toBeCloseTo(0, 5);

    expect(offeneWerktage(
      neuling, eigene as TimeEntry[],
      new Date('2026-07-06T00:00:00'), new Date('2026-07-10T00:00:00'),
    )).toEqual([]);
  }, 180_000);

  it('die Rücknahme entfernt genau die erzeugten Tage', async () => {
    clientEinreichen(monteur.client);
    await urlaubeDb.createVacation(BETRIEB, {
      userId: monteur.uid, userName: 'Max Mustermann',
      von: '2026-08-03', bis: '2026-08-04', tage: 2, status: 'Beantragt',
    });

    clientEinreichen(chef.client);
    const antrag = (await urlaubeDb.listOpenVacations(BETRIEB))[0];
    await urlaubeDb.entscheiden({ vacationId: antrag.id, entscheidung: 'Genehmigt' });

    // Ein von Hand gebuchter Urlaubstag mitten drin — er gehört nicht zum
    // Antrag und darf bei der Rücknahme NICHT mit verschwinden.
    const { error } = await admin.from('time_entries').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, user_id: monteur.uid,
      date: '2026-08-05', status: 'Urlaub', break_duration: 0,
      user_name: 'Max Mustermann',
    });
    if (error) throw new Error(error.message);

    const zurueck = await urlaubeDb.entscheiden({
      vacationId: antrag.id, entscheidung: 'Storniert', grund: 'Doch gearbeitet',
    });
    expect(zurueck).toMatchObject({ status: 'Storniert', entfernt: 2 });

    clientEinreichen(buch.client);
    const uebrig = (await zeiten.listEntriesInRange(BETRIEB, '2026-08-03', '2026-08-05'))
      .filter((e) => e.userId === monteur.uid);
    expect(uebrig.map((e) => e.date)).toEqual(['2026-08-05']);
  }, 180_000);
});
