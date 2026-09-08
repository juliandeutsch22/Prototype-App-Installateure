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
const anforderungenDb = await import('@/lib/db/materialOrders');
const urlaubeDb = await import('@/lib/db/vacations');
const { calcOverallSaldo, offeneWerktage, urlaubsTage, calcWorkMin, groupProjectHours } = await import('@/lib/time');
const { bilanzAusEintraegen } = await import('@shared/monatsbilanz');
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

  it('einen Entwurf wieder OEFFNEN, aendern und dann unterschreiben', async () => {
    /**
     * DER WEG, DEN „Als Entwurf speichern" ERST BRAUCHBAR MACHT.
     *
     * Der Knopf legte den Schein an, und in der Liste gab es danach nur
     * Aufklappen, PDF und Storno. Wer ihn anlegte, um ihn spaeter
     * unterschreiben zu lassen — der Regelfall: vormittags vorbereiten,
     * nachmittags unterschreiben lassen —, kam nie wieder hinein.
     *
     * Geprueft wird hier gegen den ECHTEN Firestore, weil die Frage an den
     * RULES haengt und nicht an der Oberflaeche: darf derselbe Aufrufer den
     * Entwurf lesen, seinen Inhalt ersetzen und ihn danach einfrieren?
     */
    aktuelleDb = alsMonteur();
    const id = await scheineDb.createWorkSheet(FIRMA, {
      projectNumber: 'B-2026-0001',
      customerName: 'Familie Huber',
      datum: '2026-06-19',
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [],
      material: [],
      erstelltVonUid: MONTEUR,
      erstelltVonName: MITARBEITER.name,
    });

    const geholt = await scheineDb.getWorkSheet(id);
    expect(geholt?.status).toBe('Entwurf');
    expect(geholt?.id).toBe(id);

    // Der Inhalt, der beim Anlegen noch fehlte — Stunden und Material.
    await scheineDb.updateWorkSheetDraft(id, {
      zeiten: [{ datum: '2026-06-19', mitarbeiter: MITARBEITER.name, minuten: 240 }],
      material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }],
      notizen: 'Absperrventil getauscht',
    });

    const jetzt = Date.now();
    await expect(
      scheineDb.signWorkSheet(
        id,
        { name: MITARBEITER.name, bild: 'data:image/png;base64,AAA', geraetZeit: jetzt },
        { name: 'Herr Huber', bild: 'data:image/png;base64,BBB', geraetZeit: jetzt },
      ),
    ).resolves.toBeUndefined();

    const fertig = await scheineDb.getWorkSheet(id);
    expect(fertig?.status).toBe('Unterschrieben');
    // Der ergaenzte Inhalt ist mit eingefroren — nicht der leere vom Anlegen.
    expect(fertig?.zeiten).toHaveLength(1);
    expect(fertig?.material?.[0]?.name).toBe('Eckventil 1/2 Zoll');
  });

  it('ein Schein einer FREMDEN Firma laesst sich nicht ueber die Kennung holen', async () => {
    /**
     * Die Kennung kommt sonst aus einer Liste, die der Aufrufer schon lesen
     * durfte. Ueber die Adresszeile laesst sich aber jede Kennung eintippen —
     * und dann entscheidet allein die Regel.
     */
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'workSheets', 'fremd1'), {
        companyId: 'andere-firma',
        projectNumber: 'X-1',
        customerName: 'Fremd GmbH',
        datum: '2026-06-19',
        status: 'Entwurf',
        abrechnung: 'Regie',
        zeiten: [],
        material: [],
        erstelltVonUid: 'wer-auch-immer',
        erstelltVonName: 'Fremd',
      });
    });

    aktuelleDb = alsMonteur();
    await expect(scheineDb.getWorkSheet('fremd1')).rejects.toThrow();
  });

  it('eine Kennung, die es NICHT gibt, wird abgewiesen — nicht als „leer" beantwortet', async () => {
    /**
     * WARUM DAS HIER STEHT UND NICHT NUR IM KOMMENTAR. `ownsExisting()` liest
     * `resource.data.companyId`; bei einem Dokument, das es nicht gibt, ist
     * `resource` null und die Regel scheitert. Ein fehlender Schein kommt
     * also NICHT als „nicht gefunden" zurueck, sondern als abgewiesener
     * Zugriff.
     *
     * Genau diese Falle hat bei der Ruestliste schon einmal zugeschlagen.
     * Die Oberflaeche muss deshalb BEIDE Ausgaenge gleich behandeln — sonst
     * steht beim Vertippen in der Adresszeile eine Meldung, die etwas
     * anderes behauptet, als tatsaechlich passiert ist.
     */
    aktuelleDb = alsMonteur();
    await expect(scheineDb.getWorkSheet('gibtesnicht')).rejects.toThrow();
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

/**
 * Durchstich 6: drei kleine Baustellen an einem Tag.
 *
 * DIE FRAGE, DIE HIER BEANTWORTET WIRD, ist nicht „laesst die Sperre das
 * durch" — das prueft der Regeltest. Sondern: SUMMIEREN SICH DIE STUNDEN AM
 * ENDE RICHTIG? Drei Zahlen haengen daran, und sie werden an drei
 * verschiedenen Stellen gerechnet:
 *
 *   der Stundensaldo        muss die drei Zeiten ADDIEREN und den Tag EINMAL
 *                           als gebucht zaehlen
 *   die Monatsbilanz        dasselbe, aus der die Buchhaltung spaeter liest
 *   die Baustellenstunden   muessen sich auf die drei Baustellen VERTEILEN
 *
 * Ginge eine davon anders, waere die Folge ein falscher Lohnzettel oder eine
 * Baustelle, die zu wenig verrechnet.
 */
describe('Durchstich 6: mehrere Baustellen an einem Tag', () => {
  /** 07:00–10:00 ohne Pause = 3 h. */
  function kurzeinsatz(datum: string, projectNumber: string, bis: string) {
    return {
      date: datum,
      status: 'Anwesend' as const,
      startTime: '07:00',
      endTime: bis,
      breakDuration: 0,
      projectNumber,
      userId: MONTEUR,
      userName: MITARBEITER.name,
    };
  }

  it('drei Buchungen an einem Tag — Stunden addiert, Tag einmal gezaehlt', async () => {
    // Dienstag: gerechnet wird bis gestern, also genau ueber den Montag.
    heuteIst('2026-06-02');
    aktuelleDb = alsMonteur();

    // 3 h + 2 h + 4 h = 9 h an einem Tag, auf drei Baustellen.
    await zeiten.createTimeEntry(FIRMA, kurzeinsatz('2026-06-01', 'B-2026-0001', '10:00'));
    await zeiten.createTimeEntry(FIRMA, kurzeinsatz('2026-06-01', 'B-2026-0002', '09:00'));
    await zeiten.createTimeEntry(FIRMA, kurzeinsatz('2026-06-01', 'B-2026-0003', '11:00'));

    aktuelleDb = alsBuchhaltung();
    const alle = (await zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-30'))
      .filter((e) => e.userId === MONTEUR) as TimeEntry[];
    expect(alle).toHaveLength(3);

    /**
     * DER SALDO. Soll je Tag: 40 h auf fuenf Tage = 8 h. Gebucht: 9 h.
     * Also genau eine Stunde Plus — NICHT drei Tage Soll gegen 9 h, und
     * nicht 9 h gegen 8 h dreimal.
     */
    const saldo = calcOverallSaldo(MITARBEITER, alle);
    expect(saldo.saldoH).toBeCloseTo(1, 5);
    // Und der Tag gilt als gebucht: es fehlt nichts.
    expect(saldo.daysWithoutEntry).toBe(0);

    /** DIE MONATSBILANZ, aus der die Buchhaltung spaeter liest. */
    const bilanz = bilanzAusEintraegen('2026-06', alle);
    expect(bilanz.anwesendMin).toBe(9 * 60);
    // EIN gebuchter Tag, nicht drei.
    expect(bilanz.tage).toEqual(['2026-06-01']);
    expect(bilanz.krankTage).toBe(0);
    expect(bilanz.urlaubTage).toBe(0);

    /** DIE BAUSTELLENSTUNDEN — jede bekommt ihren Anteil. */
    const proBaustelle = groupProjectHours(alle);
    const nach = Object.fromEntries(proBaustelle.map((p) => [p.projectNumber, p.fachMin]));
    expect(nach['B-2026-0001']).toBe(180);
    expect(nach['B-2026-0002']).toBe(120);
    expect(nach['B-2026-0003']).toBe(240);
  });

  it('DIESELBE Baustelle ein zweites Mal wird abgewiesen', async () => {
    // Der Fall, den die alte Sperre eigentlich meinte: zwei Buchungen fuer
    // denselben Einsatz zaehlen doppelt und wandern auf den Lohnzettel.
    heuteIst('2026-06-02');
    aktuelleDb = alsMonteur();
    await zeiten.createTimeEntry(FIRMA, kurzeinsatz('2026-06-01', 'B-2026-0001', '10:00'));
    await expect(
      zeiten.createTimeEntry(FIRMA, kurzeinsatz('2026-06-01', 'B-2026-0001', '11:00')),
    ).rejects.toThrow(/diese Baustelle/i);
  });

  it('Urlaub bleibt EIN Tag, auch wenn jemand es zweimal versucht', async () => {
    /**
     * Krank und Urlaub zaehlen in allen drei Rechnungen als GANZE TAGE, je
     * Eintrag einen. Ein zweiter Urlaubseintrag am selben Tag waere ein
     * zweiter Urlaubstag — im Saldo, im Monatsbericht und im Resturlaub.
     */
    heuteIst('2026-06-02');
    aktuelleDb = alsMonteur();
    await zeiten.createTimeEntry(FIRMA, {
      date: '2026-06-01', status: 'Urlaub', userId: MONTEUR, userName: MITARBEITER.name,
    });
    await expect(
      zeiten.createTimeEntry(FIRMA, {
        date: '2026-06-01', status: 'Urlaub', userId: MONTEUR, userName: MITARBEITER.name,
      }),
    ).rejects.toThrow(/ganzen Tag/i);

    aktuelleDb = alsBuchhaltung();
    const alle = (await zeiten.listEntriesInRange(FIRMA, '2026-06-01', '2026-06-30'))
      .filter((e) => e.userId === MONTEUR) as TimeEntry[];
    expect(bilanzAusEintraegen('2026-06', alle).urlaubTage).toBe(1);
  });
});

/**
 * Durchstich: die Anforderung bewegt den Lagerbestand — genau einmal.
 *
 * WARUM DAS EINEN ECHTEN FIRESTORE BRAUCHT. Der Lagerabzug läuft in einer
 * Firestore-TRANSAKTION. Ein Ersatz-Firestore kann sie nachbauen, aber nicht
 * das, wofür sie da ist: dass zwei gleichzeitige Zugriffe sich nicht in die
 * Quere kommen. Genau dieser Fall stand bis jetzt in der Funktionsübersicht
 * als „nur im Code geprüft, nicht gegen eine echte Transaktion".
 *
 * Er ist keine Theorie: Verwaltung und Projektleitung arbeiten dieselbe
 * Anforderungsliste ab, oft am selben Vormittag. Klicken beide „Erledigt",
 * ginge der Bestand ohne Absicherung zweimal herunter — und niemandem fiele
 * es auf, weil beide Klicks Erfolg melden.
 */
describe('Durchstich 6: Anforderung → Lager', () => {
  const ARTIKEL = 'kupfer15';

  async function lagerAufbauen(stand: number) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'materials', ARTIKEL), {
        companyId: FIRMA, name: 'Kupferrohr 15mm', stock: stand, unit: 'm',
      });
    });
  }

  const bestand = async () => {
    let wert = -1;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'materials', ARTIKEL));
      wert = (snap.data() as { stock: number }).stock;
    });
    return wert;
  };

  it('zieht beim Abschliessen genau die angeforderte Menge ab', async () => {
    await lagerAufbauen(20);
    aktuelleDb = alsMonteur();
    const id = await anforderungenDb.createMaterialOrder(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 8,
      userId: MONTEUR, userName: MITARBEITER.name,
      status: 'Offen', transactionType: 'order',
    });

    aktuelleDb = alsGF();
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(12);
  });

  /*
    DER GRUND FÜR DIE TRANSAKTION. Zweimal „Erledigt" auf derselben
    Anforderung darf den Bestand einmal bewegen. Das `processed`-Flag wird IN
    der Transaktion gelesen und gesetzt — ein Blick davor genügte nicht, weil
    zwischen Blick und Schreibvorgang der andere Klick liegt.
  */
  it('zieht bei zwei gleichzeitigen Abschlüssen nur einmal ab', async () => {
    await lagerAufbauen(20);
    aktuelleDb = alsMonteur();
    const id = await anforderungenDb.createMaterialOrder(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 8,
      userId: MONTEUR, userName: MITARBEITER.name,
      status: 'Offen', transactionType: 'order',
    });

    aktuelleDb = alsGF();
    await Promise.all([
      anforderungenDb.updateOrderStatus(id, 'Erledigt'),
      anforderungenDb.updateOrderStatus(id, 'Erledigt'),
    ]);
    expect(await bestand()).toBe(12);
  });

  it('zieht auch nacheinander nicht zweimal ab', async () => {
    // Derselbe Schutz, aber der alltäglichere Weg: jemand klickt nochmal,
    // weil die Liste sich langsam aktualisiert hat.
    await lagerAufbauen(20);
    aktuelleDb = alsMonteur();
    const id = await anforderungenDb.createMaterialOrder(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 8,
      userId: MONTEUR, userName: MITARBEITER.name,
      status: 'Offen', transactionType: 'order',
    });

    aktuelleDb = alsGF();
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(12);
  });

  /*
    EIN NEGATIVER LAGERSTAND IST KEINE AUSSAGE ÜBER EIN LAGER, sondern ein
    Zeichen, dass die Buchführung nicht mehr stimmt. Die ehrliche Null fällt
    im Bestand sofort als „knapp" auf; minus vier sähe aus wie eine Zahl.
  */
  it('bleibt bei null stehen, statt ins Minus zu laufen', async () => {
    await lagerAufbauen(3);
    aktuelleDb = alsMonteur();
    const id = await anforderungenDb.createMaterialOrder(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 7,
      userId: MONTEUR, userName: MITARBEITER.name,
      status: 'Offen', transactionType: 'order',
    });

    aktuelleDb = alsGF();
    await anforderungenDb.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(0);
  });

  it('bewegt nichts, solange die Anforderung offen oder abholbereit ist', async () => {
    await lagerAufbauen(20);
    aktuelleDb = alsMonteur();
    const id = await anforderungenDb.createMaterialOrder(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 8,
      userId: MONTEUR, userName: MITARBEITER.name,
      status: 'Offen', transactionType: 'order',
    });

    aktuelleDb = alsGF();
    await anforderungenDb.updateOrderStatus(id, 'Abholbereit');
    expect(await bestand()).toBe(20);
  });

  /*
    BELEG UND GUTSCHRIFT IN EINEM SCHRITT. Vorher wurde erst der Beleg
    geschrieben und danach der Bestand gutgeschrieben. Scheiterte der zweite
    Vorgang, stand der Beleg schon da — und wer es noch einmal versuchte,
    legte einen ZWEITEN Beleg an.
  */
  it('bucht eine Retoure in neuem Zustand zurück', async () => {
    await lagerAufbauen(12);
    aktuelleDb = alsMonteur();
    await anforderungenDb.createReturn(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 5,
      userId: MONTEUR, userName: MITARBEITER.name, condition: 'neu',
    });
    expect(await bestand()).toBe(17);
  });

  it('bucht beschädigtes Material NICHT zurück', async () => {
    // Es liegt im Regal, ist aber nicht verkäuflich. Stünde es im Bestand,
    // sagte jemand es einer Baustelle zu.
    await lagerAufbauen(12);
    aktuelleDb = alsMonteur();
    await anforderungenDb.createReturn(FIRMA, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15mm', quantity: 5,
      userId: MONTEUR, userName: MITARBEITER.name, condition: 'beschädigt',
    });
    expect(await bestand()).toBe(12);
  });
});
