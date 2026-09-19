/**
 * Durchstich 5 und 6 auf Postgres: die Rüstliste und der Tag mit drei
 * Baustellen — und die Anforderung, die den Lagerbestand genau einmal bewegt.
 *
 * DIE NAHT BEI DER RÜSTLISTE IST EINE SICHERHEITSNAHT. Die Regel, die dem
 * Monteur das Abhaken erlaubt, hängt an einem Feld (`uids`), das eine ANDERE
 * Funktion schreibt — die Einteilung. Beide Seiten für sich sind plausibel;
 * läuft das Feld auseinander, sieht der Monteur die Liste und kommt beim
 * Antippen nicht durch.
 *
 * BEIM LAGER GEHT ES UM DIE TRANSAKTION. Verwaltung und Projektleitung
 * arbeiten dieselbe Anforderungsliste ab, oft am selben Vormittag. Klicken
 * beide „Erledigt", ginge der Bestand ohne Absicherung zweimal herunter — und
 * niemandem fiele es auf, weil beide Klicks Erfolg melden.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { AppUser, TimeEntry } from '@/types';


const zeiten = await import('@/lib/db/timeEntries');
const einsaetzeDb = await import('@/lib/db/assignments');
const ruestDb = await import('@/lib/db/einsatzMaterial');
const anforderungenDb = await import('@/lib/db/materialOrders');
const { calcOverallSaldo, groupProjectHours } = await import('@/lib/time');
const { bilanzAusEintraegen } = await import('@shared/monatsbilanz');

const BETRIEB = 'durchstich3';
const TAG = '2026-06-18';
const BAUSTELLE = 'B-2026-0001';
const ARTIKEL = crypto.randomUUID();

let monteur: Konto;
let kollege: Konto;
let buch: Konto;
let chef: Konto;
let mitarbeiter: AppUser;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'd3-monteur');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'd3-kollege');
  buch = await konto(BETRIEB, 'Buchhaltung', 'd3-buch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'd3-chef');

  const { error } = await admin.from('users').update({
    name: 'Max Mustermann', weekly_target_hours: 40, yearly_vacation_days: 25,
    work_days: [1, 2, 3, 4, 5], app_start_date: '2026-06-01', initial_overtime: 0,
  }).eq('id', monteur.uid);
  if (error) throw new Error(error.message);

  mitarbeiter = {
    id: monteur.uid, companyId: BETRIEB, uid: monteur.uid, name: 'Max Mustermann',
    email: 'max@perl.at', role: 'Mitarbeiter', weeklyTargetHours: 40,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5],
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

function heuteIst(iso: string) {
  // Nur `Date`, nicht alle Timer: der Supabase-Client braucht echte
  // `setTimeout` für seine Netzwerkschleife.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T08:00:00`));
}

async function einteilenMitMaterial(
  uids: string[], positionen: { id: string; name: string; menge: number }[],
) {
  clientEinreichen(chef.client);
  await einsaetzeDb.saveAssignments(BETRIEB, TAG, BAUSTELLE,
    uids.map((uid) => ({ date: TAG, projectNumber: BAUSTELLE, userId: uid, userName: uid })));
  await ruestDb.saveEinsatzMaterial(BETRIEB, TAG, BAUSTELLE, positionen, uids, 'chef');
}

describe('Durchstich 5: Rüstliste — geplant, gesehen, eingeladen', () => {
  it('der eingeteilte Monteur sieht die Liste und hakt sie ab', async () => {
    await einteilenMitMaterial([monteur.uid], [
      { id: 'p1', name: 'Eckventil', menge: 3 },
      { id: 'p2', name: 'Mischbatterie', menge: 1 },
    ]);

    clientEinreichen(monteur.client);
    const liste = await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE);
    expect(liste?.positionen).toHaveLength(2);

    await ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p1', true, 'Max Mustermann');
    const nachher = await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE);
    expect(nachher?.geladen?.p1?.von).toBe('Max Mustermann');
    expect(nachher?.geladen?.p2).toBeUndefined();

    // Und wieder zurück — ein Haken, den man nicht lösen kann, ist eine Falle.
    await ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p1', false, 'Max Mustermann');
    expect((await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE))?.geladen?.p1)
      .toBeUndefined();
  }, 120_000);

  it('wer NICHT eingeteilt ist, kommt nicht durch', async () => {
    await einteilenMitMaterial([kollege.uid], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);

    clientEinreichen(monteur.client);
    // Sehen darf er sie — er ist in derselben Firma. Anfassen nicht.
    expect(await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE)).not.toBeNull();
    await expect(
      ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p1', true, 'Max'),
    ).rejects.toThrow();
  }, 120_000);

  it('kommt jemand nachträglich dazu, darf er sofort abhaken', async () => {
    /*
      DIE NAHT. `saveAssignments` zieht `uids` an der Rüstliste nach — in
      derselben Klammer. Täte es das nicht, sähe der neue Kollege das Material
      und käme beim Antippen nicht durch: die Regel kennt ihn nicht.
    */
    await einteilenMitMaterial([kollege.uid], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);

    clientEinreichen(chef.client);
    await einsaetzeDb.saveAssignments(BETRIEB, TAG, BAUSTELLE, [
      { date: TAG, projectNumber: BAUSTELLE, userId: kollege.uid, userName: 'X' },
      { date: TAG, projectNumber: BAUSTELLE, userId: monteur.uid, userName: 'Max' },
    ]);

    clientEinreichen(monteur.client);
    await expect(
      ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p1', true, 'Max'),
    ).resolves.toBeUndefined();
  }, 120_000);

  it('streicht die Planung eine Position, geht ihr Haken mit', async () => {
    await einteilenMitMaterial([monteur.uid], [
      { id: 'p1', name: 'Eckventil', menge: 3 },
      { id: 'p2', name: 'Mischbatterie', menge: 1 },
    ]);
    clientEinreichen(monteur.client);
    await ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p1', true, 'Max');
    await ruestDb.ladenUmschalten(BETRIEB, TAG, BAUSTELLE, 'p2', true, 'Max');

    clientEinreichen(chef.client);
    await ruestDb.saveEinsatzMaterial(BETRIEB, TAG, BAUSTELLE,
      [{ id: 'p2', name: 'Mischbatterie', menge: 1 }], [monteur.uid], 'chef');

    const nachher = await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE);
    expect(nachher?.geladen?.p1).toBeUndefined();
    // Der Haken der GEBLIEBENEN Position bleibt — sonst müsste der Monteur
    // nach jeder Planungsänderung noch einmal von vorn einladen.
    expect(nachher?.geladen?.p2?.von).toBe('Max');
  }, 120_000);

  it('eine leer geräumte Liste verschwindet, statt leer liegenzubleiben', async () => {
    await einteilenMitMaterial([monteur.uid], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);
    clientEinreichen(chef.client);
    await ruestDb.saveEinsatzMaterial(BETRIEB, TAG, BAUSTELLE, [], [monteur.uid], 'chef');
    expect(await ruestDb.getEinsatzMaterial(BETRIEB, TAG, BAUSTELLE)).toBeNull();
  }, 120_000);

  it('die Kennung übersteht eine Baustellennummer mit Schrägstrich', async () => {
    /*
      Baustellennummern werden von Hand vergeben. In Firestore wäre ein
      Schrägstrich ein PFADTRENNER gewesen und das Schreiben hätte fehl-
      geschlagen — erst im Betrieb. Postgres kennt dieses Problem nicht mehr;
      der Test bleibt trotzdem, damit die Zusage auch nach dem Umzug gilt.
    */
    const KRUMM = '2026/042';
    clientEinreichen(chef.client);
    await ruestDb.saveEinsatzMaterial(BETRIEB, TAG, KRUMM,
      [{ id: 'p1', name: 'Rohr', menge: 2 }], [monteur.uid], 'chef');
    const liste = await ruestDb.getEinsatzMaterial(BETRIEB, TAG, KRUMM);
    expect(liste?.projectNumber).toBe(KRUMM);
  }, 120_000);
});

describe('Durchstich 6: mehrere Baustellen an einem Tag', () => {
  /** 07:00–bis ohne Pause. */
  const kurzeinsatz = (datum: string, projectNumber: string, bis: string) => ({
    date: datum, status: 'Anwesend' as const, startTime: '07:00', endTime: bis,
    breakDuration: 0, projectNumber, userId: monteur.uid, userName: 'Max Mustermann',
  });

  it('drei Buchungen an einem Tag — Stunden addiert, Tag einmal gezählt', async () => {
    heuteIst('2026-09-02');
    clientEinreichen(monteur.client);

    // 3 h + 2 h + 4 h = 9 h an einem Tag, auf drei Baustellen.
    await zeiten.createTimeEntry(BETRIEB, kurzeinsatz('2026-09-01', 'B-2026-0001', '10:00'));
    await zeiten.createTimeEntry(BETRIEB, kurzeinsatz('2026-09-01', 'B-2026-0002', '09:00'));
    await zeiten.createTimeEntry(BETRIEB, kurzeinsatz('2026-09-01', 'B-2026-0003', '11:00'));

    clientEinreichen(buch.client);
    const alle = (await zeiten.listEntriesInRange(BETRIEB, '2026-09-01', '2026-09-30'))
      .filter((e) => e.userId === monteur.uid) as TimeEntry[];
    expect(alle).toHaveLength(3);

    /*
      DER SALDO. Soll je Tag: 40 h auf fünf Tage = 8 h. Gebucht: 9 h. Also
      genau eine Stunde Plus — NICHT drei Tage Soll gegen 9 h.
    */
    const saldo = calcOverallSaldo(
      { ...mitarbeiter, appStartDate: '2026-09-01' } as AppUser, alle,
    );
    expect(saldo.saldoH).toBeCloseTo(1, 5);
    expect(saldo.daysWithoutEntry).toBe(0);

    /** DIE MONATSBILANZ, aus der die Buchhaltung später liest. */
    const bilanz = bilanzAusEintraegen('2026-09', alle);
    expect(bilanz.anwesendMin).toBe(9 * 60);
    expect(bilanz.tage).toEqual(['2026-09-01']); // EIN Tag, nicht drei.

    /** DIE BAUSTELLENSTUNDEN — jede bekommt ihren Anteil. */
    const nach = Object.fromEntries(
      groupProjectHours(alle).map((p) => [p.projectNumber, p.fachMin]),
    );
    expect(nach['B-2026-0001']).toBe(180);
    expect(nach['B-2026-0002']).toBe(120);
    expect(nach['B-2026-0003']).toBe(240);
  }, 180_000);

  it('DIESELBE Baustelle ein zweites Mal wird abgewiesen', async () => {
    // Zwei Buchungen für denselben Einsatz zählen doppelt und wandern auf den
    // Lohnzettel.
    clientEinreichen(monteur.client);
    await zeiten.createTimeEntry(BETRIEB, kurzeinsatz('2026-09-07', 'B-2026-0001', '10:00'));
    await expect(
      zeiten.createTimeEntry(BETRIEB, kurzeinsatz('2026-09-07', 'B-2026-0001', '11:00')),
    ).rejects.toThrow(/diese Baustelle/i);
  }, 120_000);

  it('Urlaub bleibt EIN Tag, auch wenn jemand es zweimal versucht', async () => {
    /*
      Krank und Urlaub zählen in allen drei Rechnungen als GANZE TAGE, je
      Eintrag einen. Ein zweiter Urlaubseintrag am selben Tag wäre ein zweiter
      Urlaubstag — im Saldo, im Monatsbericht und im Resturlaub.
    */
    clientEinreichen(monteur.client);
    const urlaubstag = {
      date: '2026-09-14', status: 'Urlaub' as const,
      userId: monteur.uid, userName: 'Max Mustermann',
    };
    await zeiten.createTimeEntry(BETRIEB, urlaubstag);
    await expect(zeiten.createTimeEntry(BETRIEB, urlaubstag)).rejects.toThrow(/ganzen Tag/i);

    clientEinreichen(buch.client);
    const alle = (await zeiten.listEntriesInRange(BETRIEB, '2026-09-14', '2026-09-14'))
      .filter((e) => e.userId === monteur.uid) as TimeEntry[];
    expect(bilanzAusEintraegen('2026-09', alle).urlaubTage).toBe(1);
  }, 120_000);
});

describe('Durchstich 6b: Anforderung → Lager', () => {
  async function lagerAufbauen(stand: number) {
    const { error } = await admin.from('materials').upsert({
      id: ARTIKEL, company_id: BETRIEB, name: 'Kupferrohr 15mm',
      stock: stand, unit: 'm',
    });
    if (error) throw new Error(error.message);
  }

  async function bestand(): Promise<number> {
    const { data } = await admin.from('materials').select('stock').eq('id', ARTIKEL).single();
    return Number(data!.stock);
  }

  async function anforderung(menge: number): Promise<string> {
    clientEinreichen(monteur.client);
    return anforderungenDb.createMaterialOrder(BETRIEB, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: menge,
      userId: monteur.uid, userName: 'Max Mustermann',
      status: 'Offen', transactionType: 'order',
    });
  }

  it('zieht beim Abschliessen genau die angeforderte Menge ab', async () => {
    await lagerAufbauen(20);
    const id = await anforderung(8);
    clientEinreichen(chef.client);
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(12);
  }, 120_000);

  it('zieht bei zwei gleichzeitigen Abschlüssen nur einmal ab', async () => {
    /*
      DER GRUND FÜR DIE KLAMMER. Zweimal „Erledigt" auf derselben Anforderung
      darf den Bestand einmal bewegen. Unter Firestore hing das an einem
      `processed`-Feld, das IN der Transaktion gelesen und gesetzt wurde; ein
      Blick davor genügte nicht, weil zwischen Blick und Schreibvorgang der
      andere Klick liegt. Postgres entscheidet es in einer Funktion — dieselbe
      Frage, ein anderer Mechanismus, und deshalb hier noch einmal geprüft.
    */
    await lagerAufbauen(20);
    const id = await anforderung(8);
    clientEinreichen(chef.client);
    await Promise.all([
      anforderungenDb.updateOrderStatus(id, 'Erledigt').catch(() => undefined),
      anforderungenDb.updateOrderStatus(id, 'Erledigt').catch(() => undefined),
    ]);
    expect(await bestand()).toBe(12);
  }, 120_000);

  it('zieht auch nacheinander nicht zweimal ab', async () => {
    // Der alltäglichere Weg: jemand klickt nochmal, weil die Liste sich
    // langsam aktualisiert hat.
    await lagerAufbauen(20);
    const id = await anforderung(8);
    clientEinreichen(chef.client);
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    await anforderungenDb.updateOrderStatus(id, 'Erledigt').catch(() => undefined);
    expect(await bestand()).toBe(12);
  }, 120_000);

  it('bleibt bei null stehen, statt ins Minus zu laufen', async () => {
    /*
      EIN NEGATIVER LAGERSTAND IST KEINE AUSSAGE ÜBER EIN LAGER, sondern ein
      Zeichen, dass die Buchführung nicht mehr stimmt. Die ehrliche Null fällt
      sofort als „knapp" auf; minus vier sähe aus wie eine Zahl.
    */
    await lagerAufbauen(3);
    const id = await anforderung(7);
    clientEinreichen(chef.client);
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(0);
  }, 120_000);

  it('bewegt nichts, solange die Anforderung offen oder abholbereit ist', async () => {
    await lagerAufbauen(20);
    const id = await anforderung(8);
    clientEinreichen(chef.client);
    await anforderungenDb.updateOrderStatus(id, 'Abholbereit');
    expect(await bestand()).toBe(20);
  }, 120_000);

  it('bucht eine Retoure in neuem Zustand zurück', async () => {
    /*
      BELEG UND GUTSCHRIFT IN EINEM SCHRITT. Vorher wurde erst der Beleg
      geschrieben und danach der Bestand gutgeschrieben. Scheiterte der
      zweite Vorgang, stand der Beleg schon da — und wer es noch einmal
      versuchte, legte einen ZWEITEN Beleg an.
    */
    await lagerAufbauen(12);
    clientEinreichen(monteur.client);
    await anforderungenDb.createReturn(BETRIEB, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 5,
      userId: monteur.uid, userName: 'Max Mustermann', condition: 'neu',
    });
    expect(await bestand()).toBe(17);
  }, 120_000);

  it('bucht beschädigtes Material NICHT zurück', async () => {
    // Es liegt im Regal, ist aber nicht verkäuflich. Stünde es im Bestand,
    // sagte jemand es einer Baustelle zu.
    await lagerAufbauen(12);
    clientEinreichen(monteur.client);
    await anforderungenDb.createReturn(BETRIEB, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 5,
      userId: monteur.uid, userName: 'Max Mustermann', condition: 'beschädigt',
    });
    expect(await bestand()).toBe(12);
  }, 120_000);
});
