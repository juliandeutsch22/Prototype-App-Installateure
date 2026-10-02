/**
 * EINE WOCHE IM ZEITRAFFER (Nachtest 01.10.2026, Paket E, Pilot-Simulation).
 *
 * Planen, Material anfordern und einladen, Zeiten buchen, Schein
 * unterschreiben, Krankmeldung, Anzahlung und Schlussrechnung, Zahlung mit
 * Skonto, Monatsabschluss mit Lohn-CSV und BMD-Stapel — in dieser
 * Reihenfolge, in EINEM Betrieb, mit den Rollen, die das wirklich tun.
 *
 * WAS DIESE PRÜFUNG VON DEN ÜBRIGEN UNTERSCHEIDET. Jeder Schritt ist für sich
 * geprüft. Hier geht es um die Nähte: dass der Bestand nach Einladen und
 * Schein genau einmal sinkt, dass die Krankmeldung in der Lohnliste steht,
 * dass die Schlussrechnung die Anzahlung abzieht und mit Skonto aufgeht, und
 * dass der Stapel für die Kanzlei alles davon enthält.
 *
 * Sie geht durch die WEICHE (`@/lib/db/…`) und durch dieselben Rechen- und
 * Exportbausteine wie die Ansichten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { AppUser, Invoice } from '@/types';

const einsaetzeDb = await import('@/lib/db/assignments');
const ruestDb = await import('@/lib/db/einsatzMaterial');
const anforderungenDb = await import('@/lib/db/materialOrders');
const zeitenDb = await import('@/lib/db/timeEntries');
const scheineDb = await import('@/lib/db/workSheets');
const abwesenheitDb = await import('@/lib/db/abwesenheiten');
const rechnungenDb = await import('@/lib/db/invoices');
const zahlungenDb = await import('@/lib/db/zahlungen');
const kontenDb = await import('@/lib/db/konten');
const { calcMonthStats, calcWorkMin } = await import('@/lib/time');
const { buildMonthCsv } = await import('@/features/accounting/export');
const { buildBmdCsv, buildBmdZahlungenCsv } = await import('@/features/invoices/bmdExport');

const BETRIEB = 'zeitraffer';
const BAUSTELLE = 'B-2026-0700';
const ARTIKEL = crypto.randomUUID();

/*
  DIE WOCHE: die letzte volle Arbeitswoche vor heute, deren fünf Tage im
  selben Monat liegen — sonst zerfiele der Monatsabschluss in zwei. Fest
  eingetragene Daten veralteten; eine Woche in der Zukunft dürfte niemand
  buchen.
*/
const iso = (d: Date) => d.toISOString().slice(0, 10);
function woche(): string[] {
  const heute = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date())}T12:00:00Z`);
  const montag = new Date(heute);
  montag.setUTCDate(montag.getUTCDate() - ((montag.getUTCDay() + 6) % 7) - 7);
  for (;;) {
    const tage = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(montag);
      d.setUTCDate(d.getUTCDate() + i);
      return iso(d);
    });
    if (tage[0].slice(0, 7) === tage[4].slice(0, 7)) return tage;
    montag.setUTCDate(montag.getUTCDate() - 7);
  }
}
const [MO, DI, MI, DO, FR] = woche();
const JAHR = Number(MO.slice(0, 4));
const MONAT = Number(MO.slice(5, 7));
const MONAT_VON = `${MO.slice(0, 7)}-01`;
const MONAT_BIS = iso(new Date(Date.UTC(JAHR, MONAT, 0)));
const ZIEL = iso(new Date(Date.UTC(JAHR, MONAT - 1, Number(FR.slice(8, 10)) + 14)));
const SKONTO_BIS = iso(new Date(Date.UTC(JAHR, MONAT - 1, Number(FR.slice(8, 10)) + 7)));

let chef: Konto;
let buch: Konto;
let monteur: Konto;
let mitarbeiter: AppUser;
let schein = '';
let anzahlung = { id: '', invoiceNumber: '' };
let schluss = { id: '', invoiceNumber: '' };

async function bestand(): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', ARTIKEL).single();
  return Number((data as { stock: number }).stock);
}

async function rechnung(id: string) {
  const { data, error } = await admin.from('invoices')
    .select('payment_status, bezahlt_betrag, skonto_betrag, total_brutto, invoice_number')
    .eq('id', id).single();
  if (error) throw new Error(error.message);
  const z = data as Record<string, unknown>;
  return {
    status: String(z.payment_status), bezahlt: Number(z.bezahlt_betrag), skonto: Number(z.skonto_betrag),
    brutto: Number(z.total_brutto), nummer: String(z.invoice_number),
  };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Haustechnik Zeitraffer GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'zr-chef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'zr-buch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zr-monteur');

  const start = `${JAHR}-01-01`;
  const { error } = await admin.from('users').update({
    name: 'Max Mustermann', weekly_target_hours: 40, yearly_vacation_days: 25,
    work_days: [1, 2, 3, 4, 5], app_start_date: start, initial_overtime: 0,
  }).eq('id', monteur.uid);
  if (error) throw new Error(error.message);
  mitarbeiter = {
    id: monteur.uid, companyId: BETRIEB, uid: monteur.uid, name: 'Max Mustermann',
    email: 'max@zeitraffer.test', role: 'Mitarbeiter', weeklyTargetHours: 40,
    yearlyVacationDays: 25, workDays: [1, 2, 3, 4, 5], appStartDate: start, initialOvertime: 0,
  } as AppUser;

  const seeds = [
    await admin.from('companies').update({
      address_line: 'Hauptplatz 1, 8200 Gleisdorf', iban: 'AT611904300234573201',
    }).eq('id', BETRIEB),
    await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf' }),
    await admin.from('projects').insert({
      company_id: BETRIEB, project_number: BAUSTELLE, customer_name: 'Familie Huber',
      address: 'Gartengasse 4, 8200 Gleisdorf', status: 'Aktiv', assigned_employees: [monteur.uid],
    }),
    await admin.from('materials').insert({
      id: ARTIKEL, company_id: BETRIEB, name: 'Kupferrohr 15', unit: 'm', stock: 20, lagerartikel: true,
    }),
  ];
  for (const s of seeds) if (s.error) throw new Error(s.error.message);
}, 180_000);

afterAll(() => clientEinreichen(null));

describe(`Eine Woche im Zeitraffer (${MO} bis ${FR})`, () => {
  it('Montag früh: die Chefin plant drei Tage und packt die Rüstliste', async () => {
    clientEinreichen(chef.client);
    for (const tag of [MO, DI, MI]) {
      await einsaetzeDb.saveAssignments(BETRIEB, tag, BAUSTELLE,
        [{ date: tag, projectNumber: BAUSTELLE, userId: monteur.uid, userName: 'Max Mustermann' }]);
    }
    await ruestDb.saveEinsatzMaterial(BETRIEB, MO, BAUSTELLE,
      [{ id: 'rohr', materialId: ARTIKEL, name: 'Kupferrohr 15', menge: 6, einheit: 'm' }], [monteur.uid], 'Chefin');

    clientEinreichen(monteur.client);
    const plan = await einsaetzeDb.listAssignmentsForUserInRange(BETRIEB, monteur.uid, MO, FR);
    expect(plan.map((e) => e.date).sort()).toEqual([MO, DI, MI]);
    // Bis „eingeladen“ nur reserviert.
    expect(await bestand()).toBe(20);
  });

  it('der Monteur fordert nach, lädt ein — der Bestand sinkt genau um das, was rausgeht', async () => {
    clientEinreichen(monteur.client);
    const nach = await anforderungenDb.createMaterialOrder(BETRIEB, {
      materialId: ARTIKEL, materialName: 'Kupferrohr 15', quantity: 2,
      userId: monteur.uid, userName: 'Max Mustermann', projectNumber: BAUSTELLE,
      status: 'Offen', transactionType: 'order',
    });
    await ruestDb.ladenUmschalten(BETRIEB, MO, BAUSTELLE, 'rohr', true, 'Max Mustermann');
    expect(await bestand()).toBe(14);

    clientEinreichen(chef.client);
    await anforderungenDb.updateOrderStatus(nach, 'Abholbereit');
    await anforderungenDb.updateOrderStatus(nach, 'Erledigt');
    expect(await bestand()).toBe(12);

    // Das Einladen steht im Bewegungsprotokoll — sechs Meter hinaus.
    const { data: bewegungen, error: bf } = await admin.from('lagerbewegungen')
      .select('menge, art').eq('company_id', BETRIEB).eq('material_id', ARTIKEL);
    expect(bf).toBeNull();
    expect((bewegungen ?? []).map((b) => Number(b.menge))).toContain(-6);
  });

  it('Montag bis Mittwoch gebucht, am Montag der Schein unterschrieben — ohne zweiten Abzug', async () => {
    clientEinreichen(monteur.client);
    for (const tag of [MO, DI, MI]) {
      await zeitenDb.createTimeEntry(BETRIEB, {
        date: tag, status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30,
        projectNumber: BAUSTELLE, userId: monteur.uid, userName: 'Max Mustermann',
      });
    }
    schein = await scheineDb.createWorkSheet(BETRIEB, {
      projectNumber: BAUSTELLE, customerName: 'Familie Huber', datum: MO, status: 'Entwurf',
      abrechnung: 'Regie', zeiten: [{ datum: MO, mitarbeiter: 'Max Mustermann', minuten: 510 }],
      material: [{ name: 'Kupferrohr 15', menge: 6, einheit: 'm' }],
      erstelltVonUid: monteur.uid, erstelltVonName: 'Max Mustermann',
    });
    const jetzt = Date.now();
    await scheineDb.signWorkSheet(
      schein,
      { name: 'Max Mustermann', bild: 'data:image/png;base64,AAA', geraetZeit: jetzt },
      { name: 'Herr Huber', bild: 'data:image/png;base64,BBB', geraetZeit: jetzt },
    );
    // Das verbaute Rohr ist das eingeladene — der Schein verrechnet, er bucht nicht noch einmal ab.
    expect(await bestand()).toBe(12);
  });

  it('Donnerstag und Freitag krank — das Büro trägt es ein', async () => {
    clientEinreichen(buch.client);
    await abwesenheitDb.krankmeldungSpeichern({ userId: monteur.uid, von: DO, bis: FR, melderName: 'Büro' });
    const woche = (await zeitenDb.listEntriesInRange(BETRIEB, MO, FR)).filter((e) => e.userId === monteur.uid);
    expect(woche.filter((e) => e.status === 'Anwesend').map((e) => e.date).sort()).toEqual([MO, DI, MI]);
    expect(woche.filter((e) => e.status === 'Krank').map((e) => e.date).sort()).toEqual([DO, FR]);
  });

  it('Anzahlung gestellt und bezahlt, Schlussrechnung zieht sie ab und geht mit Skonto auf', async () => {
    clientEinreichen(buch.client);
    anzahlung = await rechnungenDb.rechnungAusstellen(BETRIEB, {
      art: 'anzahlung', projectNumber: BAUSTELLE, customerName: 'Familie Huber',
      address: 'Gartengasse 4, 8200 Gleisdorf', invoiceDate: DI, dueDate: ZIEL,
      subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2,
      paymentStatus: 'Offen',
      positions: [{ label: 'Anzahlung Badsanierung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    } as Parameters<typeof rechnungenDb.rechnungAusstellen>[1], { praefix: 'RE' });
    await zahlungenDb.createZahlung(BETRIEB, {
      invoiceId: anzahlung.id, datum: MI, betrag: 1200, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    });
    expect((await rechnung(anzahlung.id)).status).toBe('Bezahlt');

    const { data: eintraege } = await admin.from('time_entries').select('id')
      .eq('company_id', BETRIEB).eq('status', 'Anwesend');
    schluss = await rechnungenDb.rechnungAusstellen(BETRIEB, {
      art: 'schluss', projectNumber: BAUSTELLE, customerName: 'Familie Huber',
      address: 'Gartengasse 4, 8200 Gleisdorf', invoiceDate: FR, dueDate: ZIEL,
      leistungVon: MO, leistungBis: MI,
      subtotalNetto: 2000, totalNetto: 2000, totalVat: 400, totalBrutto: 2400, vatRate: 0.2,
      gesamtNetto: 3000, gesamtVat: 600, gesamtBrutto: 3600,
      vorrechnungen: [{
        invoiceId: anzahlung.id, invoiceNumber: anzahlung.invoiceNumber, invoiceDate: DI,
        netto: 1000, vat: 200, brutto: 1200,
      }],
      skontoProzent: 2, skontoBis: SKONTO_BIS,
      paymentStatus: 'Offen',
      positions: [{ label: 'Badsanierung laut Schein', qty: 1, unit: 'Pauschale', unitPrice: 2000, netto: 2000 }],
      linkedWorkSheets: [schein],
      linkedEntries: (eintraege ?? []).map((z) => z.id as string),
    } as Parameters<typeof rechnungenDb.rechnungAusstellen>[1], { praefix: 'RE' });

    // Der Schein ist verrechnet — er taucht in „nicht verrechnet“ nicht mehr auf.
    const { data: deckung } = await admin.from('invoice_coverage').select('*').eq('invoice_id', schluss.id);
    expect((deckung ?? []).length).toBeGreaterThanOrEqual(1);

    // 2 % Skonto auf die Restforderung von 2.400 €: 2.352 € gezahlt, 48 € Skonto.
    await zahlungenDb.createZahlungMitSkonto(BETRIEB, {
      invoiceId: schluss.id, datum: FR, betrag: 2352, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    }, 48);
    expect(await rechnung(schluss.id)).toMatchObject({ status: 'Bezahlt', bezahlt: 2400, skonto: 48, brutto: 2400 });
  });

  it('Monatsabschluss: die Lohnliste trägt Arbeit und Krankenstand', async () => {
    clientEinreichen(buch.client);
    const imMonat = (await zeitenDb.listEntriesInRange(BETRIEB, MONAT_VON, MONAT_BIS)).filter((e) => e.userId === monteur.uid);
    const imJahr = (await zeitenDb.listEntriesInRange(BETRIEB, `${JAHR}-01-01`, `${JAHR}-12-31`)).filter((e) => e.userId === monteur.uid);
    const stats = calcMonthStats(mitarbeiter, imMonat, imJahr, JAHR, MONAT, false);
    const csv = buildMonthCsv([{ user: mitarbeiter, monthEntries: imMonat, stats }], JAHR, MONAT, false);

    const zeilen = csv.split(/\r?\n/).filter((z) => z.includes('Max Mustermann'));
    expect(zeilen.filter((z) => z.includes('Krank'))).toHaveLength(2);
    expect(zeilen.filter((z) => z.includes(BAUSTELLE))).toHaveLength(3);
    // 3 × 8,5 h gearbeitet — dieselbe Rechnung wie in der Zeiterfassung.
    expect(imMonat.filter((e) => e.status === 'Anwesend').reduce((s, e) => s + calcWorkMin(e), 0)).toBe(3 * 510);
  });

  it('Monatsabschluss: der Stapel für die Kanzlei enthält beide Rechnungen und den Skonto', async () => {
    clientEinreichen(buch.client);
    for (const k of [
      { zweck: 'erloes', ustSatz: 0.2, konto: '4000' },
      { zweck: 'anzahlung', konto: '3500' },
      { zweck: 'debitoren', konto: '2000' },
      { zweck: 'bank', konto: '2800' },
      { zweck: 'skonto', konto: '4400' },
    ] as const) {
      await kontenDb.kontoAnlegen(BETRIEB, k);
    }
    const konten = await kontenDb.buchungskonten(BETRIEB);
    const rechnungen = (await rechnungenDb.listInvoicesInRange(BETRIEB, MONAT_VON, MONAT_BIS)) as (Invoice & { id: string })[];
    expect(rechnungen.map((r) => r.id).sort()).toEqual([anzahlung.id, schluss.id].sort());

    const stapel = buildBmdCsv(rechnungen, konten, MONAT_VON, MONAT_BIS);
    expect(stapel.fehlend).toEqual([]);
    expect(stapel.csv).toContain(anzahlung.invoiceNumber);
    expect(stapel.csv).toContain(schluss.invoiceNumber);

    const zahlungen = await zahlungenDb.listZahlungenImZeitraum(BETRIEB, MONAT_VON, MONAT_BIS);
    expect(zahlungen.map((z) => z.art).sort()).toEqual(['Skonto', 'Überweisung', 'Überweisung'].sort());
    const zahlStapel = buildBmdZahlungenCsv(zahlungen, rechnungen, konten, MONAT_VON, MONAT_BIS);
    expect(zahlStapel.fehlend).toEqual([]);
    expect(zahlStapel.csv).toContain('4400');
  });
});
