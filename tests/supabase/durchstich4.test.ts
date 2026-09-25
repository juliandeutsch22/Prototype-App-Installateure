/**
 * Durchstich 8 auf Postgres: zwei Betriebe arbeiten am selben Tag nebeneinander.
 *
 * WARUM DAS EIGENS GEPRÜFT GEHÖRT, obwohl die Mandantentrennung als belegt
 * gilt. Die Regelprüfungen fragen: darf diese Rolle DIESE ZEILE? Das ist die
 * richtige Frage für einen Zugriff und die falsche für eine AUSWERTUNG. Wo
 * über viele Zeilen summiert wird — Zeitkonto, Nummernkreis, Forderungen,
 * „Stunden ohne Buchung" —, entscheidet nicht allein die Regel, sondern auch,
 * ob die Abfrage ihren Filter mitführt.
 *
 * UNTER POSTGRES IST DAS EINE ANDERE FRAGE ALS UNTER FIRESTORE, und deshalb
 * steht sie hier noch einmal. Dort hätte ein vergessener Mandantenfilter die
 * Datenbank willig fremde Zeilen liefern lassen, weil die Regel nur prüfte,
 * was zurückkam. Hier filtert der Zeilenschutz selbst — der vergessene Filter
 * kann nichts mehr durchlassen, wohl aber kann eine Abfrage LEER zurückkommen,
 * wo sie etwas liefern sollte. Aus einem Datenleck ist ein stiller Ausfall
 * geworden; geprüft gehören beide Richtungen.
 *
 * Ein solcher Fehler ist im Ein-Betrieb-Betrieb UNSICHTBAR. Er erscheint am
 * Tag, an dem der zweite Kunde dazukommt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { TimeEntry } from '@/types';


const zeiten = await import('@/lib/db/timeEntries');
const rechnungenDb = await import('@/lib/db/invoices');
const { calcWorkMin, groupProjectHours } = await import('@/lib/time');

const PERL = 'durchstich4-perl';
const GRUBER = 'durchstich4-gruber';

/** Derselbe Tag, dieselbe Baustellennummer, zwei Betriebe. */
const TAG = '2026-06-15';
const NUMMER = 'B-2026-0001';

let monteurA: Konto;
let buchA: Konto;
let chefA: Konto;
let monteurB: Konto;
let buchB: Konto;

beforeAll(async () => {
  await betriebAnlegen(PERL);
  await betriebAnlegen(GRUBER);
  monteurA = await konto(PERL, 'Mitarbeiter', 'd4-monteur-a');
  buchA = await konto(PERL, 'Buchhaltung', 'd4-buch-a');
  chefA = await konto(PERL, 'Geschäftsführung', 'd4-chef-a');
  monteurB = await konto(GRUBER, 'Mitarbeiter', 'd4-monteur-b');
  buchB = await konto(GRUBER, 'Buchhaltung', 'd4-buch-b');

  const { error } = await admin.from('users')
    .update({ work_days: [1, 2, 3, 4, 5], app_start_date: '2026-06-01' })
    .in('id', [monteurA.uid, monteurB.uid]);
  if (error) throw new Error(error.message);
}, 240_000);

afterAll(() => {
  clientEinreichen(null);
});

const arbeit = (k: Konto, name: string, bis: string) => ({
  date: TAG, status: 'Anwesend' as const, startTime: '07:00', endTime: bis,
  breakDuration: 0, projectNumber: NUMMER, userId: k.uid, userName: name,
});

describe('Durchstich 8: zwei Betriebe nebeneinander', () => {
  it('hält Stunden auseinander, auch bei gleicher Baustellennummer am selben Tag', async () => {
    /*
      DIESELBE BAUSTELLENNUMMER IN BEIDEN BETRIEBEN ist der harte Fall, und er
      ist realistisch: „B-2026-0001" vergibt jeder Betrieb, der bei eins
      anfängt. Addierte eine Auswertung hier acht fremde Stunden, sähe niemand
      es — die Zahl bleibt plausibel.
    */
    clientEinreichen(monteurA.client);
    await zeiten.createTimeEntry(PERL, arbeit(monteurA, 'Max Mustermann', '15:00'));

    clientEinreichen(monteurB.client);
    await zeiten.createTimeEntry(GRUBER, arbeit(monteurB, 'Franz Gruber', '11:00'));

    clientEinreichen(buchA.client);
    const perl = await zeiten.listEntriesInRange(PERL, TAG, TAG);
    expect(perl).toHaveLength(1);
    expect(calcWorkMin(perl[0] as TimeEntry)).toBe(480);

    clientEinreichen(buchB.client);
    const gruber = await zeiten.listEntriesInRange(GRUBER, TAG, TAG);
    expect(gruber).toHaveLength(1);
    expect(calcWorkMin(gruber[0] as TimeEntry)).toBe(240);
  }, 180_000);

  it('rechnet die Baustelle nur mit den eigenen Stunden', async () => {
    /*
      Das Projekt-Radar fragt nach Baustellennummern, nicht nach einem
      Zeitraum — genau die Abfrage, bei der ein vergessener Mandantenfilter am
      wenigsten auffiele.
    */
    clientEinreichen(chefA.client);
    const eigene = await zeiten.listEntriesForProjects(PERL, [NUMMER]);
    expect(eigene).toHaveLength(1);
    expect(groupProjectHours(eigene as TimeEntry[])[0].fachMin).toBe(480);
  }, 120_000);

  it('führt für jeden Betrieb einen eigenen Nummernkreis', async () => {
    /*
      DER TEUERSTE FALL. Zöge er aus einem gemeinsamen Zähler, bekäme Betrieb
      B eine Rechnung mit einer Lücke im eigenen Kreis — und der
      Buchhaltungs-Export meldete sie zu Recht, ohne dass jemand erklären
      könnte, wo die fehlende Nummer geblieben ist.
    */
    clientEinreichen(buchA.client);
    const a1 = await rechnungenDb.reserveInvoiceNumber(PERL, { seedFrom: 0 });
    const a2 = await rechnungenDb.reserveInvoiceNumber(PERL, { seedFrom: 0 });

    clientEinreichen(buchB.client);
    const b1 = await rechnungenDb.reserveInvoiceNumber(GRUBER, { seedFrom: 0 });
    const b2 = await rechnungenDb.reserveInvoiceNumber(GRUBER, { seedFrom: 0 });

    // Beide fangen bei derselben Zahl an — das ist der Punkt, nicht ein Mangel.
    expect(b1).toBe(a1);
    expect(a2).not.toBe(a1);
    expect(b2).toBe(a2);
  }, 120_000);

  it('zeigt jedem Betrieb nur die eigenen offenen Forderungen', async () => {
    clientEinreichen(buchA.client);
    await rechnungenDb.createInvoice(PERL, {
      invoiceNumber: 'RE-2026-9001', projectNumber: NUMMER, customerName: 'Familie Huber',
      invoiceDate: '2026-06-30', dueDate: '2026-07-14',
      totalNetto: 1000, totalVat: 200, totalBrutto: 1200, paymentStatus: 'Offen',
      // Ohne Positionen legt die Datenbank keine Rechnung an (P2-10).
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    } as never);

    clientEinreichen(buchB.client);
    await rechnungenDb.createInvoice(GRUBER, {
      // DIESELBE Nummer im anderen Betrieb — erlaubt, und genau deshalb
      // gefährlich, wenn eine Abfrage den Betrieb vergisst.
      invoiceNumber: 'RE-2026-9001', projectNumber: NUMMER, customerName: 'Familie Berger',
      invoiceDate: '2026-06-30', dueDate: '2026-07-14',
      totalNetto: 500, totalVat: 100, totalBrutto: 600, paymentStatus: 'Offen',
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 500, netto: 500 }],
    } as never);

    const offenB = await rechnungenDb.listUnpaidInvoices(GRUBER);
    expect(offenB.map((r) => r.customerName)).toEqual(['Familie Berger']);

    clientEinreichen(buchA.client);
    const offenA = await rechnungenDb.listUnpaidInvoices(PERL);
    expect(offenA.map((r) => r.customerName)).toEqual(['Familie Huber']);
  }, 180_000);

  it('meldet fehlende Buchungen, ohne fremde Buchungen anzurechnen', async () => {
    /*
      „Stunden ohne Buchung" vergleicht Scheine gegen Zeiteinträge — zwei
      Tabellen, zwei Abfragen, zwei Gelegenheiten für einen Fehler. Der Fall
      hier ist der gemeinste: Betrieb B HAT gebucht, Betrieb A nicht. Zöge die
      Prüfung fremde Buchungen mit, meldete sie bei A nichts — und die
      fehlende Stunde bliebe für immer unverrechnet.
    */
    const { scheineOhneBuchung } = await import('@/features/worksheets/fehlendeZeitbuchung');

    const scheinA = {
      id: 'sa', companyId: PERL, projectNumber: NUMMER, customerName: 'Familie Huber',
      datum: '2026-06-22', status: 'Unterschrieben', abrechnung: 'Regie',
      zeiten: [{ datum: '2026-06-22', mitarbeiter: 'Franz Gruber', minuten: 480 }],
      material: [], erstelltVonUid: monteurA.uid, erstelltVonName: 'Max Mustermann',
    } as never;

    // Betrieb B bucht an diesem Tag, Betrieb A nicht.
    clientEinreichen(monteurB.client);
    await zeiten.createTimeEntry(GRUBER, {
      date: '2026-06-22', status: 'Anwesend', startTime: '07:00', endTime: '15:00',
      breakDuration: 0, projectNumber: NUMMER,
      userId: monteurB.uid, userName: 'Franz Gruber',
    });

    clientEinreichen(buchA.client);
    const eigeneBuchungen = await zeiten.listEntriesInRange(PERL, '2026-06-22', '2026-06-22');
    expect(eigeneBuchungen).toHaveLength(0);

    const befunde = scheineOhneBuchung([scheinA], eigeneBuchungen as TimeEntry[], '2026-06-30');
    expect(befunde).toHaveLength(1);
    expect(befunde[0].zeilen[0].art).toBe('keine');
  }, 180_000);

  it('lässt den Monteur des einen Betriebs nicht an die Zeiten des anderen', async () => {
    /*
      HIER LÄUFT POSTGRES ANDERS ALS FIRESTORE. Dort scheiterte der Versuch,
      über die fremde Kennung zu lesen, an der Regel — mit einem Fehler.
      Der Zeilenschutz filtert stattdessen: die Abfrage gelingt und liefert
      nichts. Für den Aufrufer ist das dasselbe Ergebnis auf einem anderen
      Weg, und weil die Ansicht eine leere Liste ohnehin behandeln muss, ist
      es der ruhigere.
    */
    clientEinreichen(monteurB.client);
    const seine = await zeiten.listOwnEntriesSince(GRUBER, monteurB.uid, '2026-06-01');
    expect(seine.map((e) => e.date).sort()).toEqual(['2026-06-15', '2026-06-22']);
    // Und über die fremde Kennung kommt er an nichts.
    expect(await zeiten.listOwnEntriesSince(PERL, monteurA.uid, '2026-06-01'))
      .toEqual([]);
  }, 120_000);
});
