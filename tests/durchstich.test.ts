import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, type Firestore } from 'firebase/firestore';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Die Durchstich-Tests: gehen die Geldwege durch, von einem Ende zum anderen.
 *
 * WAS SIE VON ALLEM ANDEREN UNTERSCHEIDET. Die Rechentests prüfen Formeln mit
 * erfundenen Eingaben. Die Ansichtstests prüfen Klicks mit ersetzter
 * Datenbank. Beide sehen nur ihr eigenes Stück. Ein Fehler an der NAHT — die
 * Genehmigung schreibt Tage, die der Saldo dann anders zählt; das Angebot
 * setzt ein Stundenbudget, das die Nachkalkulation nicht findet — fällt beiden
 * nicht auf, weil jede Seite für sich stimmt.
 *
 * Diese Tests schreiben deshalb mit den ECHTEN Datenbankfunktionen in einen
 * ECHTEN Firestore, lesen mit den echten Abfragen zurück und rechnen mit den
 * echten Formeln. Was hier grün ist, hängt tatsächlich zusammen.
 *
 * WAS SIE NICHT ABDECKEN, und das gehört gesagt:
 *   - die React-Ansichten (dafür die Komponententests)
 *   - die Cloud Functions selbst; sie laufen mit Admin-Rechten und werden
 *     hier durch dieselben Schreibvorgänge nachgestellt, die sie ausführen.
 *     Geprüft ist damit die Kette UM sie herum, nicht ihr Innenleben.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

let testEnv: RulesTestEnvironment;
let aktuelleDb: Firestore;

vi.mock('@/lib/firebase', () => ({
  get db() {
    return aktuelleDb;
  },
  app: {},
  auth: {},
  functions: {},
}));

const FIRMA = 'perl';
const MONTEUR = 'monteur1';

const alsMonteur = () =>
  testEnv
    .authenticatedContext(MONTEUR, { companyId: FIRMA, role: 'Mitarbeiter' })
    .firestore() as unknown as Firestore;
const alsBuchhaltung = () =>
  testEnv
    .authenticatedContext('buch1', { companyId: FIRMA, role: 'Buchhaltung' })
    .firestore() as unknown as Firestore;
const alsGF = () =>
  testEnv
    .authenticatedContext('chef', { companyId: FIRMA, role: 'Geschäftsführung' })
    .firestore() as unknown as Firestore;

/** Der Monteur, gegen dessen Stammdaten gerechnet wird. */
const MITARBEITER: AppUser = {
  id: MONTEUR,
  companyId: FIRMA,
  uid: MONTEUR,
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  appStartDate: '2026-06-01',
  initialOvertime: 0,
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'durchstich',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies', FIRMA), { name: 'Perl Installationen' });
    await setDoc(doc(db, 'users', MONTEUR), {
      companyId: FIRMA,
      uid: MONTEUR,
      name: MITARBEITER.name,
      email: MITARBEITER.email,
      role: 'Mitarbeiter',
      workDays: [1, 2, 3, 4, 5],
      app_start_date: '2026-06-01',
    });
  });
});

const zeiten = await import('@/lib/db/timeEntries');
const projekte = await import('@/lib/db/projects');
const angeboteDb = await import('@/lib/db/quotes');
const rechnungenDb = await import('@/lib/db/invoices');
const scheineDb = await import('@/lib/db/workSheets');
const einsaetzeDb = await import('@/lib/db/assignments');
const ruestDb = await import('@/lib/db/einsatzMaterial');
const urlaubeDb = await import('@/lib/db/vacations');
const { calcOverallSaldo, offeneWerktage, urlaubsTage, calcWorkMin } = await import('@/lib/time');
const { rechneBaustelle } = await import('@/features/costing/nachkalkulation');

/**
 * Den Stichtag festnageln.
 *
 * `calcOverallSaldo` und `pflichtTage` rechnen gegen HEUTE — sie sollen ja
 * sagen, was bis gestern angefallen ist. Ein Test mit festen Buchungsdaten
 * liefert damit jeden Tag ein anderes Ergebnis und wäre binnen einer Woche
 * rot. Deshalb steht die Uhr in jedem Durchstich still, und zwar an dem Tag,
 * an dem die geprüfte Aussage gilt.
 */
function heuteIst(iso: string) {
  /**
   * NUR `Date` faelschen, nicht alle Timer.
   *
   * Der Firestore-Client braucht echte `setTimeout`/`setInterval` fuer seine
   * Netzwerkschleife. Stellt man sie mit still, kommt keine Antwort mehr
   * zurueck und jeder Test laeuft in die Zeitgrenze — genau das ist beim
   * ersten Anlauf passiert.
   */
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T08:00:00`));
}

afterEach(() => {
  vi.useRealTimers();
});

/** Ein voller Arbeitstag: 07:00–16:00 mit 30 Minuten Pause = 8,5 h. */
function arbeitstag(datum: string, projectNumber = 'B-2026-0001') {
  return {
    date: datum,
    status: 'Anwesend' as const,
    startTime: '07:00',
    endTime: '16:00',
    breakDuration: 30,
    projectNumber,
    userId: MONTEUR,
    userName: MITARBEITER.name,
  };
}

// ---------------------------------------------------------------------------

describe('Durchstich 1: gebuchte Zeit kommt in der Auswertung an', () => {
  it('drei Tage buchen, Buchhaltung liest sie, der Saldo stimmt', async () => {
    // Donnerstag: gerechnet wird bis GESTERN, also genau ueber die drei
    // gebuchten Tage.
    heuteIst('2026-06-04');
    // Der Monteur bucht Mo, Di, Mi der ersten Juniwoche 2026.
    aktuelleDb = alsMonteur();
    for (const tag of ['2026-06-01', '2026-06-02', '2026-06-03']) {
      await zeiten.createTimeEntry(FIRMA, arbeitstag(tag));
    }

    /**
     * Die Buchhaltung liest denselben Zeitraum — mit einer ANDEREN Abfrage
     * als der Monteur. Genau hier fiel bisher nichts auf: dass beide dieselben
     * Dokumente sehen, prüft kein einziger Rechentest.
     */
    aktuelleDb = alsBuchhaltung();
    const imMonat = await zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-30');
    const seine = imMonat.filter((e) => e.userId === MONTEUR);
    expect(seine).toHaveLength(3);
    expect(seine.every((e) => calcWorkMin(e) === 510)).toBe(true); // 8,5 h

    /**
     * Und der Saldo rechnet mit genau diesen Daten. Soll je Tag: 40 h auf
     * fünf Tage = 8 h. Gebucht: 8,5 h. Also ein halbe Stunde Plus je Tag.
     */
    const saldo = calcOverallSaldo(MITARBEITER, seine as TimeEntry[]);
    expect(saldo.hasConfig).toBe(true);
    expect(saldo.saldoH).toBeCloseTo(1.5, 5);
  });

  it('meldet die Tage, an denen NICHTS gebucht wurde', async () => {
    // Montag darauf: die ganze Vorwoche liegt hinter uns.
    heuteIst('2026-06-08');
    aktuelleDb = alsMonteur();
    await zeiten.createTimeEntry(FIRMA, arbeitstag('2026-06-01'));

    aktuelleDb = alsBuchhaltung();
    const vorhandene = await zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-05');
    const offen = offeneWerktage(
      MITARBEITER,
      vorhandene as TimeEntry[],
      new Date('2026-06-01T00:00:00'),
      new Date('2026-06-05T00:00:00'),
    );
    /**
     * DREI, nicht vier. Gebucht ist der Montag; vom Rest der Woche faellt der
     * Donnerstag heraus, weil der 4. Juni 2026 FRONLEICHNAM ist.
     *
     * Genau das ist der Grund, warum diese Kette einen eigenen Test braucht:
     * die Startseite darf einen Feiertag nicht als „Zeit fehlt" melden, und
     * ob der Feiertagskalender bis in die Lueckenrechnung durchschlaegt,
     * sagt kein einzelner Rechentest.
     */
    expect(offen).toEqual(['2026-06-02', '2026-06-03', '2026-06-05']);
  });
});

// ---------------------------------------------------------------------------

describe('Durchstich 2: genehmigter Urlaub landet im Zeitkonto', () => {
  it('Antrag, Genehmigung, Zeiteintraege — und der Saldo bleibt heil', async () => {
    /**
     * Eintritt am Montag der Urlaubswoche und Stichtag am Montag danach: das
     * geprüfte Fenster ist damit GENAU die Urlaubswoche. Sonst mischten sich
     * ungebuchte Tage davor in den Saldo und die Aussage waere unscharf.
     */
    const neuling = { ...MITARBEITER, appStartDate: '2026-06-08' };
    heuteIst('2026-06-15');

    // 1. Der Monteur beantragt Mo–Fr der zweiten Juniwoche.
    aktuelleDb = alsMonteur();
    const tage = urlaubsTage(neuling, '2026-06-08', '2026-06-12');
    expect(tage).toHaveLength(5);
    await urlaubeDb.createVacation(FIRMA, {
      userId: MONTEUR,
      userName: MITARBEITER.name,
      von: '2026-06-08',
      bis: '2026-06-12',
      tage: tage.length,
      status: 'Beantragt',
    });

    // 2. Die Geschäftsführung sieht den offenen Antrag.
    aktuelleDb = alsGF();
    const offene = await urlaubeDb.listOpenVacations(FIRMA);
    expect(offene).toHaveLength(1);
    const antrag = offene[0];

    /**
     * 3. Die Genehmigung selbst läuft in einer Cloud Function mit
     * Admin-Rechten. Hier wird nachgestellt, WAS sie schreibt — Status plus
     * ein Zeiteintrag je Arbeitstag, mit `vacationId`.
     */
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'vacations', antrag.id), {
        status: 'Genehmigt',
        entschiedenVonUid: 'chef',
        entschiedenVonName: 'Julian Deutsch',
      });
      for (const datum of tage) {
        await setDoc(doc(db, 'timeEntries', `urlaub-${datum}`), {
          companyId: FIRMA,
          date: datum,
          status: 'Urlaub',
          userId: MONTEUR,
          userName: MITARBEITER.name,
          breakDuration: 0,
          vacationId: antrag.id,
        });
      }
    });

    // 4. Der Monteur sieht seinen Urlaub — und zwar als genehmigt.
    aktuelleDb = alsMonteur();
    const meine = await urlaubeDb.listOwnVacations(FIRMA, MONTEUR);
    expect(meine[0].status).toBe('Genehmigt');

    /**
     * 5. DER PUNKT, UM DEN ES GEHT. Fünf Urlaubstage dürfen den Saldo NICHT
     * ins Minus ziehen und dürfen NICHT als „Zeit fehlt" erscheinen. Ohne die
     * Zeiteinträge zöge der Saldo fünfmal das Tagessoll ab — vierzig Stunden.
     */
    const eigene = await zeiten.listOwnEntriesSince(FIRMA, MONTEUR, '2026-06-01');
    const saldo = calcOverallSaldo(neuling, eigene as TimeEntry[]);
    expect(saldo.saldoH).toBeCloseTo(0, 5);

    const offenTage = offeneWerktage(
      neuling,
      eigene as TimeEntry[],
      new Date('2026-06-08T00:00:00'),
      new Date('2026-06-12T00:00:00'),
    );
    expect(offenTage).toEqual([]);
  });

  it('die Ruecknahme entfernt genau die erzeugten Tage', async () => {
    aktuelleDb = alsMonteur();
    await urlaubeDb.createVacation(FIRMA, {
      userId: MONTEUR, userName: MITARBEITER.name,
      von: '2026-06-08', bis: '2026-06-09', tage: 2, status: 'Beantragt',
    });
    aktuelleDb = alsGF();
    const antrag = (await urlaubeDb.listOpenVacations(FIRMA))[0];

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Zwei Tage aus der Genehmigung ...
      for (const datum of ['2026-06-08', '2026-06-09']) {
        await setDoc(doc(db, 'timeEntries', `u-${datum}`), {
          companyId: FIRMA, date: datum, status: 'Urlaub', userId: MONTEUR,
          vacationId: antrag.id, breakDuration: 0,
        });
      }
      // ... und einer, den der Monteur selbst gebucht hat.
      await setDoc(doc(db, 'timeEntries', 'u-handisch'), {
        companyId: FIRMA, date: '2026-06-10', status: 'Urlaub', userId: MONTEUR,
        breakDuration: 0,
      });
    });

    /**
     * Die Rücknahme sucht über `vacationId`, nicht über den Zeitraum. Der von
     * Hand gebuchte Urlaubstag mitten drin darf NICHT mit verschwinden —
     * sonst löscht eine Rücknahme fremde Buchungen.
     */
    aktuelleDb = alsBuchhaltung();
    const alle = await zeiten.listEntriesInRange(FIRMA, '2026-06-08', '2026-06-10');
    const ausGenehmigung = alle.filter((e) => e.vacationId === antrag.id);
    expect(ausGenehmigung).toHaveLength(2);
    expect(alle.filter((e) => !e.vacationId)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe('Durchstich 3: vom Angebot bis zur Nachkalkulation', () => {
  it('Angebot annehmen, Zeiten buchen, verrechnen, Marge rechnen', async () => {
    // 1. Die Geschäftsführung legt ein Angebot mit kalkulierter Arbeitszeit an.
    aktuelleDb = alsGF();
    await angeboteDb.createQuote(FIRMA, {
      quoteNumber: 'AN-2026-0001',
      customerId: 'k1',
      customerName: 'Familie Huber',
      quoteDate: '2026-06-01',
      validUntil: '2026-07-01',
      status: 'Versendet',
      positions: [],
      subtotalNetto: 3000,
      totalNetto: 3000,
      totalVat: 600,
      totalBrutto: 3600,
      vatRate: 0.2,
      kalkulierteStunden: 30,
    });

    // 2. Angenommen -> daraus entsteht die Baustelle MIT Stundenbudget.
    const angebot = (await angeboteDb.listRecentQuotes(FIRMA))[0];
    await projekte.createProject(FIRMA, {
      projectNumber: 'B-2026-0001',
      customerId: angebot.customerId,
      customerName: angebot.customerName,
      status: 'Aktiv',
      estimatedHours: angebot.kalkulierteStunden,
      billingMode: 'Regie',
    });
    await angeboteDb.updateQuote(angebot.id, {
      status: 'Angenommen',
      projectNumber: 'B-2026-0001',
    });

    /**
     * Das Stundenbudget stammt aus der Kalkulation und nicht aus einem zweiten
     * Mal Abtippen — erst damit misst die Budget-Ampel gegen eine Zahl mit
     * Herkunft.
     */
    const baustelle = (await projekte.listActiveProjects(FIRMA))[0];
    expect(baustelle.estimatedHours).toBe(30);

    // 3. Der Monteur arbeitet vier Tage darauf.
    aktuelleDb = alsMonteur();
    for (const tag of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18']) {
      await zeiten.createTimeEntry(FIRMA, arbeitstag(tag, 'B-2026-0001'));
    }

    // 4. Die Buchhaltung verrechnet.
    aktuelleDb = alsBuchhaltung();
    await rechnungenDb.createInvoice(FIRMA, {
      invoiceNumber: 'RE-2026-0001',
      projectNumber: 'B-2026-0001',
      customerName: 'Familie Huber',
      invoiceDate: '2026-06-30',
      dueDate: '2026-07-14',
      totalNetto: 3000,
      totalVat: 600,
      totalBrutto: 3600,
      paymentStatus: 'Offen',
    });

    /**
     * 5. Die Nachkalkulation zieht alles zusammen: Zeiten der Baustelle,
     * Rechnungen, Angebot. Vier Tage à 8,5 h = 34 Stunden, bei 42 EUR
     * Kostensatz also 1.428 EUR Personalkosten gegen 3.000 EUR Erlös.
     */
    aktuelleDb = alsGF();
    const zeitenDerBaustelle = await zeiten.listEntriesForProjects(FIRMA, ['B-2026-0001']);
    const rechnungen = await rechnungenDb.listUnpaidInvoices(FIRMA);
    const ergebnis = rechneBaustelle(
      'B-2026-0001',
      'Familie Huber',
      zeitenDerBaustelle as TimeEntry[],
      rechnungen,
      undefined,
      { fach: 42, helper: 28 },
    );

    expect(ergebnis.fachStunden).toBe(34);
    expect(ergebnis.erloes).toBe(3000);
    expect(ergebnis.erloesQuelle).toBe('Rechnungen');
    expect(ergebnis.personalkosten).toBe(1428);
    expect(ergebnis.deckungsbeitrag).toBe(1572);

    /**
     * Und die Warnung, die den ganzen Weg rechtfertigt: kalkuliert waren 30
     * Stunden, geleistet sind 34. Die Baustelle ist über Budget — sichtbar
     * nur, weil das Budget aus dem Angebot mitgewandert ist.
     */
    expect(ergebnis.fachStunden).toBeGreaterThan(baustelle.estimatedHours ?? 0);
  });
});

// ---------------------------------------------------------------------------

describe('Durchstich 4: der Schein ist nach der Unterschrift zu', () => {
  it('Entwurf aendern geht, unterschrieben nicht mehr, Storno mit Grund schon', async () => {
    aktuelleDb = alsMonteur();
    const id = await scheineDb.createWorkSheet(FIRMA, {
      projectNumber: 'B-2026-0001',
      customerName: 'Familie Huber',
      datum: '2026-06-18',
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [{ datum: '2026-06-18', mitarbeiter: 'Max Mustermann', minuten: 510 }],
      material: [],
      erstelltVonUid: MONTEUR,
      erstelltVonName: MITARBEITER.name,
    });

    // Solange Entwurf: aenderbar.
    await expect(
      scheineDb.updateWorkSheetDraft(id, { notizen: 'Abfluss zusätzlich gereinigt' }),
    ).resolves.toBeUndefined();

    // Unterschreiben friert ein.
    const jetzt = Date.now();
    await scheineDb.signWorkSheet(
      id,
      { name: 'Max Mustermann', bild: 'data:image/png;base64,AAA', geraetZeit: jetzt },
      { name: 'Herr Huber', bild: 'data:image/png;base64,BBB', geraetZeit: jetzt },
    );

    /**
     * DER KERN DES BELEGS. Ein Schein, den der Kunde unterschrieben hat und
     * den man danach ändern kann, ist wertlos: der Kunde hat etwas anderes
     * unterschrieben, als im System steht, und niemand könnte den Unterschied
     * nachweisen. Die Sperre steht in den Rules, nicht in der Oberfläche —
     * deshalb wird sie hier gegen den echten Firestore geprüft.
     */
    await expect(
      scheineDb.updateWorkSheetDraft(id, { notizen: 'nachträglich geändert' }),
    ).rejects.toThrow();

    /**
     * Der Storno ist der einzige Weg — und er ist der LEITUNG vorbehalten.
     * Duerfte der Monteur selbst stornieren, koennte er einen unbequemen
     * unterschriebenen Beleg allein aus der Welt schaffen.
     */
    await expect(
      scheineDb.cancelWorkSheet(id, 'Falsche Baustelle erfasst', 'Julian Deutsch'),
    ).rejects.toThrow();

    aktuelleDb = alsGF();
    await expect(
      scheineDb.cancelWorkSheet(id, 'Falsche Baustelle erfasst', 'Julian Deutsch'),
    ).resolves.toBeUndefined();

    aktuelleDb = alsBuchhaltung();
    const nachher = await getDoc(doc(aktuelleDb, 'workSheets', id));
    expect(nachher.data()?.status).toBe('Storniert');
    expect(nachher.data()?.stornoGrund).toBe('Falsche Baustelle erfasst');
    // Geloescht wird nie: ein spurlos verschwundener Beleg waere schlimmer
    // als ein falscher.
    expect(nachher.exists()).toBe(true);
  });
});

/**
 * Durchstich 5: von der geplanten Rüstliste bis zum Haken im Bus.
 *
 * DIE NAHT, DIE HIER GEPRÜFT WIRD, ist eine Sicherheitsnaht. Die Regel, die
 * dem Monteur das Abhaken erlaubt, hängt an einem Feld (`uids`), das eine
 * ANDERE Funktion schreibt — die Einteilung. Beide Seiten für sich sind
 * plausibel; läuft das Feld auseinander, sieht der Monteur die Liste und
 * kommt beim Antippen nicht durch. Das fiele weder den Rules-Tests auf
 * (die setzen `uids` selbst) noch den Ansichtstests (dort ist die Datenbank
 * ersetzt).
 *
 * Und ein zweiter Weg, der leicht falsch wird: streicht die Planung eine
 * Position, muss ihr Haken mitgehen. Sonst bleibt eine Markierung liegen,
 * die zu nichts mehr gehört und beim nächsten Speichern mitwandert.
 */
describe('Durchstich 5: Rüstliste — geplant, gesehen, eingeladen', () => {
  const TAG = '2026-06-18';
  const BAUSTELLE = 'B-2026-0001';

  async function einteilenMitMaterial(uids: string[], positionen: { id: string; name: string; menge: number }[]) {
    aktuelleDb = alsGF();
    await einsaetzeDb.saveAssignments(
      FIRMA,
      TAG,
      BAUSTELLE,
      uids.map((uid) => ({ date: TAG, projectNumber: BAUSTELLE, userId: uid, userName: uid })),
    );
    await ruestDb.saveEinsatzMaterial(FIRMA, TAG, BAUSTELLE, positionen, uids, 'chef');
  }

  it('der eingeteilte Monteur sieht die Liste und hakt sie ab', async () => {
    await einteilenMitMaterial([MONTEUR], [
      { id: 'p1', name: 'Eckventil', menge: 3 },
      { id: 'p2', name: 'Mischbatterie', menge: 1 },
    ]);

    aktuelleDb = alsMonteur();
    const liste = await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE);
    expect(liste?.positionen).toHaveLength(2);

    await ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p1', true, 'Max Mustermann');
    const nachher = await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE);
    expect(nachher?.geladen?.p1?.von).toBe('Max Mustermann');
    expect(nachher?.geladen?.p2).toBeUndefined();

    // Und wieder zurück — ein Haken, den man nicht lösen kann, ist eine Falle.
    await ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p1', false, 'Max Mustermann');
    expect((await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE))?.geladen?.p1).toBeUndefined();
  });

  it('wer NICHT eingeteilt ist, kommt nicht durch', async () => {
    await einteilenMitMaterial(['jemand-anderer'], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);

    aktuelleDb = alsMonteur();
    // Sehen darf er sie — er ist in derselben Firma. Anfassen nicht.
    expect(await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE)).not.toBeNull();
    await expect(
      ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p1', true, 'Max'),
    ).rejects.toThrow();
  });

  it('kommt jemand nachträglich dazu, darf er sofort abhaken', async () => {
    /**
     * DIE NAHT. `saveAssignments` zieht `uids` an der Rüstliste nach — im
     * selben Batch. Täte es das nicht, sähe der neue Kollege das Material
     * und käme beim Antippen nicht durch: die Regel kennt ihn nicht.
     */
    await einteilenMitMaterial(['jemand-anderer'], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);

    aktuelleDb = alsGF();
    await einsaetzeDb.saveAssignments(FIRMA, TAG, BAUSTELLE, [
      { date: TAG, projectNumber: BAUSTELLE, userId: 'jemand-anderer', userName: 'X' },
      { date: TAG, projectNumber: BAUSTELLE, userId: MONTEUR, userName: 'Max' },
    ]);

    aktuelleDb = alsMonteur();
    await expect(
      ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p1', true, 'Max'),
    ).resolves.toBeUndefined();
  });

  it('streicht die Planung eine Position, geht ihr Haken mit', async () => {
    await einteilenMitMaterial([MONTEUR], [
      { id: 'p1', name: 'Eckventil', menge: 3 },
      { id: 'p2', name: 'Mischbatterie', menge: 1 },
    ]);
    aktuelleDb = alsMonteur();
    await ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p1', true, 'Max');
    await ruestDb.ladenUmschalten(FIRMA, TAG, BAUSTELLE, 'p2', true, 'Max');

    aktuelleDb = alsGF();
    await ruestDb.saveEinsatzMaterial(
      FIRMA, TAG, BAUSTELLE,
      [{ id: 'p2', name: 'Mischbatterie', menge: 1 }],
      [MONTEUR], 'chef',
    );

    const nachher = await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE);
    expect(nachher?.geladen?.p1).toBeUndefined();
    // Der Haken der GEBLIEBENEN Position bleibt — sonst müsste der Monteur
    // nach jeder Planungsänderung noch einmal von vorn einladen.
    expect(nachher?.geladen?.p2?.von).toBe('Max');
  });

  it('eine leer geräumte Liste verschwindet, statt leer liegenzubleiben', async () => {
    await einteilenMitMaterial([MONTEUR], [{ id: 'p1', name: 'Eckventil', menge: 3 }]);
    aktuelleDb = alsGF();
    await ruestDb.saveEinsatzMaterial(FIRMA, TAG, BAUSTELLE, [], [MONTEUR], 'chef');
    expect(await ruestDb.getEinsatzMaterial(FIRMA, TAG, BAUSTELLE)).toBeNull();
  });

  it('die Kennung übersteht eine Baustellennummer mit Schrägstrich', async () => {
    // Baustellennummern werden von Hand vergeben. Ein Schrägstrich wäre in
    // einer Firestore-Kennung ein Pfadtrenner — das Schreiben schlüge fehl,
    // und zwar erst im Betrieb.
    const KRUMM = '2026/042';
    aktuelleDb = alsGF();
    await ruestDb.saveEinsatzMaterial(
      FIRMA, TAG, KRUMM, [{ id: 'p1', name: 'Rohr', menge: 2 }], [MONTEUR], 'chef',
    );
    const liste = await ruestDb.getEinsatzMaterial(FIRMA, TAG, KRUMM);
    expect(liste?.projectNumber).toBe(KRUMM);
  });
});
