/**
 * Der Urlaubsübertrag — durch die echte Datenbank.
 *
 * Drei Dinge, die eine reine Rechenprüfung nicht beantwortet:
 *
 *   1. Wer darf die Einstellung setzen? Die Antwort steht im Zeilenschutz,
 *      nicht im Browser — und ein Monteur, der sie ändern könnte, hätte
 *      Zugriff auf die Urlaubsrechnung des ganzen Betriebs.
 *   2. Lässt die Datenbank einen Stichtag zu, den es nicht gibt? Ein
 *      Verfallstag am 31. Februar träte nie ein, und der alte Jahrgang bliebe
 *      für immer stehen — ein stiller Ausfall statt einer Fehlermeldung.
 *   3. Findet die Abfrage den Verlauf über Jahresgrenzen hinweg? Der Übertrag
 *      hängt daran; eine Abfrage, die nur das Jahr liefert, ergäbe still
 *      immer null.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { getCompany, updateCompany } from '@/lib/db/pg/company';
import { listUrlaubstage } from '@/lib/db/pg/timeEntries';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { urlaubsStand, uebertragsRegel } from '@/lib/time';

const BETRIEB = 'urlaub-uebertrag';

let chef: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Wer den Übertrag festlegt', () => {
  it('die Geschäftsführung darf', async () => {
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubUebertrag: 'stichtag', urlaubStichtag: '03-31' });

    const betrieb = await getCompany(BETRIEB);
    expect(betrieb?.urlaubUebertrag).toBe('stichtag');
    expect(betrieb?.urlaubStichtag).toBe('03-31');
  });

  it('ein Monteur darf nicht — und bekommt es gesagt', async () => {
    /*
      Nicht „still nichts tun": `updateCompany` wirft, wenn der Schreibvorgang
      keine Zeile trifft. Eine abgewiesene Änderung, die als „gespeichert"
      zurückkommt, ist schlimmer als eine Fehlermeldung — der Betrieb rechnete
      danach mit einer Regel, die nie gesetzt wurde.
    */
    clientEinreichen(monteur.client);
    await expect(
      updateCompany(BETRIEB, { urlaubUebertrag: 'verjaehrung', urlaubStichtag: null }),
    ).rejects.toThrow();

    clientEinreichen(chef.client);
    expect((await getCompany(BETRIEB))?.urlaubUebertrag).toBe('stichtag');
  });

  it('lässt sich auf die gesetzliche Verjährung zurückstellen', async () => {
    // Der Stichtag MUSS dabei weg: `stichtag` ohne Datum wäre eine Regel
    // ohne Zeitpunkt, und die Datenbank lässt den Zustand nicht zu.
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubUebertrag: 'verjaehrung', urlaubStichtag: null });

    const betrieb = await getCompany(BETRIEB);
    expect(betrieb?.urlaubUebertrag).toBe('verjaehrung');
    expect(betrieb?.urlaubStichtag ?? null).toBeNull();
  });
});

describe('Was die Datenbank an Stichtagen nicht zulässt', () => {
  it.each([
    ['einen Monat, den es nicht gibt', '13-01'],
    ['den 31. Februar', '02-31'],
    ['den 31. April', '04-31'],
    ['den 29. Februar — den gibt es nur jedes vierte Jahr', '02-29'],
  ])('%s', async (_name, stichtag) => {
    clientEinreichen(chef.client);
    await expect(
      updateCompany(BETRIEB, { urlaubUebertrag: 'stichtag', urlaubStichtag: stichtag }),
    ).rejects.toThrow();
  });

  it('einen Stichtag ohne Datum', async () => {
    /*
      DER FALL, DEN DIE ERSTE FASSUNG DURCHLIESS. `urlaub_stichtag is null`
      ergab in der Prüfbedingung nicht `false`, sondern `null` — und eine
      Bedingung, die `null` ergibt, GILT in SQL als erfüllt. Die Regel wäre
      ohne Zeitpunkt gespeichert worden und stillschweigend zu „verfällt nie"
      geworden.
    */
    clientEinreichen(chef.client);
    await expect(
      updateCompany(BETRIEB, { urlaubUebertrag: 'stichtag', urlaubStichtag: null }),
    ).rejects.toThrow();
  });

  it('aber einen echten Tag nimmt sie an', async () => {
    // Die Gegenprobe: wäre die Bedingung zu streng, wäre die Einstellung
    // unbenutzbar, und alle vier Prüfungen darüber wären trotzdem grün.
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubUebertrag: 'stichtag', urlaubStichtag: '06-30' });
    expect((await getCompany(BETRIEB))?.urlaubStichtag).toBe('06-30');
    await updateCompany(BETRIEB, { urlaubUebertrag: 'verjaehrung', urlaubStichtag: null });
  });
});

describe('Der Beginn des Urlaubsjahres', () => {
  afterEach(async () => {
    await updateCompany(BETRIEB, { urlaubJahresbeginn: '01-01' });
  });

  it('steht ohne Zutun auf dem Kalenderjahr', async () => {
    /*
      DIE VORGABE ENTSCHEIDET ÜBER BESTEHENDE BETRIEBE. Stünde hier etwas
      anderes, verschöbe sich mit dieser Migration bei jedem eingerichteten
      Betrieb der Anspruch — ohne dass jemand etwas geändert hätte.
    */
    expect((await getCompany(BETRIEB))?.urlaubJahresbeginn).toBe('01-01');
  });

  it('nimmt einen echten Tag an', async () => {
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubJahresbeginn: '07-01' });
    expect((await getCompany(BETRIEB))?.urlaubJahresbeginn).toBe('07-01');
  });

  it('weist einen Tag ab, den es nicht gibt', async () => {
    /*
      `02-31` wäre ein Jahresbeginn, der nie eintritt — und damit ein
      Urlaubsjahr, das nie anfängt. Derselbe stille Ausfall wie beim
      Verfallstag, nur mit schwereren Folgen: ohne Jahresbeginn entsteht kein
      Anspruch.
    */
    clientEinreichen(chef.client);
    await expect(updateCompany(BETRIEB, { urlaubJahresbeginn: '02-31' })).rejects.toThrow();
    await expect(updateCompany(BETRIEB, { urlaubJahresbeginn: '13-01' })).rejects.toThrow();
    await expect(updateCompany(BETRIEB, { urlaubJahresbeginn: 'Juli' })).rejects.toThrow();
  });

  it('trägt bis in den Stand, den der Mitarbeiter sieht', async () => {
    /*
      DER DURCHSTICH FÜR DAS VERSCHOBENE JAHR. Gerechnet wird gegen eine Regel,
      die wirklich in den Stammdaten steht.

      Urlaubsjahr ab 1. Juli: der Urlaub vom 2. März 2026 gehört damit noch in
      das Urlaubsjahr 2025 (1.7.2025 – 30.6.2026) und nicht in ein neues mit
      vollem Anspruch. Mit dem Kalenderjahr gerechnet stünde der Mitarbeiter
      im März wieder bei 25 Tagen.
    */
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubJahresbeginn: '07-01' });
    await admin.from('time_entries').delete().eq('company_id', BETRIEB);
    await admin.from('time_entries').insert([
      { ...buchung(monteur, '2025-07-01'), status: 'Urlaub' },
      { ...buchung(monteur, '2025-07-02'), status: 'Urlaub' },
      { ...buchung(monteur, '2026-03-02'), status: 'Urlaub' },
    ]);

    const betrieb = await getCompany(BETRIEB);
    const verlauf = (await listUrlaubstage(BETRIEB, '2025-01-01', '2026-12-31'))
      .map((e) => ({ von: e.date, tage: 1 }));

    const stand = urlaubsStand(
      { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2025-07-01' },
      2025,
      verlauf,
      uebertragsRegel(betrieb),
    );
    // Alle drei Tage liegen im Urlaubsjahr 2025 — kein Übertrag, 22 offen.
    expect(stand.genommen).toBe(3);
    expect(stand.uebertrag).toBe(0);
    expect(stand.rest).toBe(22);
  });
});

describe('Der Verlauf über die Jahresgrenze', () => {
  it('findet Urlaubstage aus mehreren Jahren und nur Urlaubstage', async () => {
    clientEinreichen(chef.client);
    await admin.from('time_entries').delete().eq('company_id', BETRIEB);
    await admin.from('time_entries').insert([
      { ...buchung(monteur, '2025-07-01'), status: 'Urlaub' },
      { ...buchung(monteur, '2025-07-02'), status: 'Urlaub' },
      { ...buchung(monteur, '2026-03-02'), status: 'Urlaub' },
      // Zwei, die NICHT mitkommen dürfen: ein Krankenstand und ein
      // Arbeitstag. Ohne die Gegenprobe wäre eine Abfrage ohne Statusfilter
      // genauso grün.
      { ...buchung(monteur, '2026-03-03'), status: 'Krank' },
      { ...buchung(monteur, '2026-03-04'), status: 'Anwesend' },
    ]);

    const verlauf = await listUrlaubstage(BETRIEB, '2025-01-01', '2026-12-31');
    expect(verlauf.map((e) => e.date)).toEqual(['2025-07-01', '2025-07-02', '2026-03-02']);
  });

  it('ergibt am Ende den Übertrag, den der Mitarbeiter sieht', async () => {
    /*
      DER DURCHSTICH. Gerechnet wird gegen einen Verlauf, der wirklich durch
      die Datenbank gegangen ist, und gegen eine Regel, die wirklich in den
      Stammdaten steht — nicht gegen im Test gebaute Objekte.

      2025: 25 Tage, zwei genommen → 23 bleiben.
      2026: 25 neue plus 23 übertragene = 48, einer genommen → 47.
    */
    clientEinreichen(chef.client);
    const betrieb = await getCompany(BETRIEB);
    const verlauf = (await listUrlaubstage(BETRIEB, '2025-01-01', '2026-12-31'))
      .map((e) => ({ von: e.date, tage: 1 }));

    const stand = urlaubsStand(
      { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2025-01-01' },
      2026,
      verlauf,
      uebertragsRegel(betrieb),
    );
    expect(stand.uebertrag).toBe(23);
    expect(stand.rest).toBe(47);
  });

  it('und rechnet anders, wenn der Betrieb einen Verfallstag gesetzt hat', async () => {
    /*
      DIE GEGENPROBE, DIE GEFEHLT HAT. Die Prüfung darüber lief gegen einen
      Betrieb mit gesetzlicher Verjährung — dort ist es gleichgültig, ob
      `uebertragsRegel` den Stichtag überhaupt liest. Eine Mutation, die ihn
      ignoriert, blieb deshalb unbemerkt.

      Mit Verfallstag am 31.03.: der Urlaub am 2. März zehrt noch vom
      Jahrgang 2025, der Rest davon verfällt danach. Statt 47 bleiben 25 —
      und das ist ein Unterschied, an dem sich nichts vorbeimogeln lässt.
    */
    clientEinreichen(chef.client);
    await updateCompany(BETRIEB, { urlaubUebertrag: 'stichtag', urlaubStichtag: '03-31' });

    const betrieb = await getCompany(BETRIEB);
    const verlauf = (await listUrlaubstage(BETRIEB, '2025-01-01', '2026-12-31'))
      .map((e) => ({ von: e.date, tage: 1 }));

    const stand = urlaubsStand(
      { yearlyVacationDays: 25, initialVacationDays: null, appStartDate: '2025-01-01' },
      2026,
      verlauf,
      uebertragsRegel(betrieb),
    );
    expect(stand.rest).toBe(25);
    expect(stand.verfallen).toBe(22);

    await updateCompany(BETRIEB, { urlaubUebertrag: 'verjaehrung', urlaubStichtag: null });
  });
});
