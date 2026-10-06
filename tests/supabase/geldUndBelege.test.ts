/**
 * Paket 1 des Testberichts vom 30.09.2026 — gegen eine echte Datenbank.
 *
 *   K2  Eine Schlussrechnung zieht die offenen Anzahlungen ihrer Baustelle ab.
 *   H4  Kein Storno ohne Grund.
 *   H5  „Überfällig“ erst nach dem Zahlungsziel — und dann nicht mehr „Offen“.
 *   H6  Die Stornorechnung zählt im Jahr ihrer Ausstellung.
 *
 * Jede Regel mit Gegenprobe: was sie verbietet UND was sie weiter zulässt.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as zahlungen from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice, Vorrechnung } from '@/types';

const BETRIEB = 'belege-a';
const JAHR = new Date().getFullYear();

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'gbbuch');
  clientEinreichen(buch.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 5000;
let baustellenNr = 500;
let baustelle = 'B-500';
beforeEach(() => {
  baustellenNr += 1;
  baustelle = `B-${baustellenNr}`;
});

/** Eine Rechnung über 1.200 € brutto auf der Baustelle dieses Tests. */
async function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: baustelle,
    customerName: 'Familie Huber',
    address: 'Hauptplatz 1, 8200 Gleisdorf',
    invoiceDate: `${JAHR}-04-30`,
    dueDate: `${JAHR}-05-14`,
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  });
}

async function lesen(id: string): Promise<WithId<Invoice>> {
  const alle = await rechnungen.listInvoicesInRange(BETRIEB, `${JAHR}-01-01`, `${JAHR}-12-31`);
  const treffer = alle.find((r) => r.id === id);
  expect(treffer, 'Rechnung nicht wiedergefunden').toBeTruthy();
  return treffer!;
}

async function abzugVon(id: string): Promise<Vorrechnung> {
  const r = await lesen(id);
  return {
    invoiceId: r.id, invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate,
    netto: r.totalNetto, vat: r.totalVat, brutto: r.totalBrutto,
  };
}

/** Eine Schlussrechnung über eigene 1.200 € plus die Abzüge — sie geht auf. */
function schluss(abzuege: Vorrechnung[], extra: Partial<rechnungen.NewInvoice> = {}) {
  const g = abzuege.reduce(
    (s, a) => ({ netto: s.netto + a.netto, vat: s.vat + a.vat, brutto: s.brutto + a.brutto }),
    { netto: 1000, vat: 200, brutto: 1200 },
  );
  return anlegen({
    art: 'schluss',
    vorrechnungen: abzuege.length ? abzuege : undefined,
    gesamtNetto: abzuege.length ? g.netto : undefined,
    gesamtVat: abzuege.length ? g.vat : undefined,
    gesamtBrutto: abzuege.length ? g.brutto : undefined,
    ...extra,
  });
}

describe('K2 — die Schlussrechnung zieht ab, was auf der Baustelle schon verrechnet ist', () => {
  it('ohne den Abzug der Anzahlung weist die Datenbank sie ab — und nennt die Anzahlung', async () => {
    const anz = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anz)).invoiceNumber;
    await expect(schluss([])).rejects.toThrow(new RegExp(`abziehen.*${nummer}`));
  });

  it('eine Teilrechnung ebenso', async () => {
    const teil = await anlegen({ art: 'teil' });
    const nummer = (await lesen(teil)).invoiceNumber;
    await expect(schluss([])).rejects.toThrow(new RegExp(nummer));
  });

  it('mit dem Abzug geht sie durch (Gegenprobe)', async () => {
    const anz = await anlegen({ art: 'anzahlung' });
    const id = await schluss([await abzugVon(anz)]);
    const r = await lesen(id);
    expect(r.vorrechnungen?.map((v) => v.invoiceId)).toEqual([anz]);
    expect(r.totalBrutto).toBe(1200);
    expect(r.gesamtBrutto).toBe(2400);
  });

  it('eine Baustelle ohne Anzahlung braucht keinen Abzug (Gegenprobe)', async () => {
    await expect(schluss([])).resolves.toBeTruthy();
  });

  it('eine Einzelrechnung derselben Baustelle ist kein Pflichtabzug', async () => {
    await anlegen({ art: 'einzel' });
    await expect(schluss([])).resolves.toBeTruthy();
  });

  it('eine stornierte Anzahlung ist nicht abzuziehen', async () => {
    const anz = await anlegen({ art: 'anzahlung' });
    await rechnungen.cancelInvoice(await lesen(anz), 'Falscher Betrag');
    await expect(schluss([])).resolves.toBeTruthy();
  });

  it('eine Anzahlung mit anderer Steuerbehandlung verlangt die Regel nicht — sie ist gar nicht abziehbar', async () => {
    await anlegen({ art: 'anzahlung' });
    await expect(
      schluss([], { reverseCharge: true, totalVat: 0, totalBrutto: 1000, vatRate: 0 }),
    ).resolves.toBeTruthy();
  });

  it('eine Anzahlung, die schon auf einer anderen Schlussrechnung steht, fehlt nicht', async () => {
    const anz = await anlegen({ art: 'anzahlung' });
    await schluss([await abzugVon(anz)]);
    await expect(schluss([])).resolves.toBeTruthy();
  });

  it('eine Teilrechnung darf eine Anzahlung auslassen — Pflicht ist der Abzug nur am Schluss', async () => {
    await anlegen({ art: 'anzahlung' });
    await expect(anlegen({ art: 'teil' })).resolves.toBeTruthy();
  });

  it('die Prüfliste nennt eine ausgestellte Schlussrechnung ohne Abzug', async () => {
    /*
      Wie RE-2026-1502 im Pilotbetrieb: ausgestellt, bevor die Regel galt.
      Nachgestellt mit dem Dienstschlüssel, der die Regel nicht kennt — so
      wie ein Bestand, der aus einer Sicherung zurückkommt.
    */
    const anz = await anlegen({ art: 'anzahlung' });
    const anzNummer = (await lesen(anz)).invoiceNumber;
    const alt = `RE-${JAHR}-${lfd + 500}`;
    const { error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: alt, project_number: baustelle,
      customer_name: 'Familie Huber', invoice_date: `${JAHR}-05-30`, due_date: `${JAHR}-06-13`,
      total_netto: 1000, total_vat: 200, total_brutto: 1200, vat_rate: 0.2,
      payment_status: 'Offen', art: 'schluss',
    });
    expect(error).toBeNull();

    const liste = await rechnungen.schlussrechnungenOhneAbzug();
    expect(liste).toContainEqual({ invoiceNumber: alt, fehlend: anzNummer });
  });

  it('die Prüfliste nennt keine Schlussrechnung, die richtig abgezogen hat (Gegenprobe)', async () => {
    const anz = await anlegen({ art: 'anzahlung' });
    const id = await schluss([await abzugVon(anz)]);
    const nummer = (await lesen(id)).invoiceNumber;
    const liste = await rechnungen.schlussrechnungenOhneAbzug();
    expect(liste.map((z) => z.invoiceNumber)).not.toContain(nummer);
  });
});

describe('H4 — kein Storno ohne Grund', () => {
  it('ein leerer Grund wird abgewiesen', async () => {
    const id = await anlegen();
    await expect(rechnungen.cancelInvoice(await lesen(id), '')).rejects.toThrow(/Grund/);
    await expect(rechnungen.cancelInvoice(await lesen(id), '   ')).rejects.toThrow(/Grund/);
    expect((await lesen(id)).paymentStatus).toBe('Offen');
  });

  it('mit Grund geht der Storno durch (Gegenprobe)', async () => {
    const id = await anlegen();
    await rechnungen.cancelInvoice(await lesen(id), 'Falscher Kunde');
    const r = await lesen(id);
    expect(r.paymentStatus).toBe('Storniert');
    expect(r.cancellationNote).toBe('Falscher Kunde');
  });
});

describe('H5 — „Überfällig“ hängt am Zahlungsziel', () => {
  const inZweiWochen = () => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  it('vor dem Zahlungsziel lässt sich „Überfällig“ nicht setzen', async () => {
    const id = await anlegen({ invoiceDate: new Date().toISOString().slice(0, 10), dueDate: inZweiWochen() });
    await expect(rechnungen.updateInvoiceStatus(id, 'Überfällig')).rejects.toThrow(/Zahlungsziel/);
    expect((await lesen(id)).paymentStatus).toBe('Offen');
  });

  it('nach dem Zahlungsziel schon (Gegenprobe) — und dann nicht mehr zurück auf „Offen“', async () => {
    const id = await anlegen(); // fällig im Mai
    await rechnungen.updateInvoiceStatus(id, 'Überfällig');
    expect((await lesen(id)).paymentStatus).toBe('Überfällig');
    await expect(rechnungen.updateInvoiceStatus(id, 'Offen')).rejects.toThrow(/überfällig/);
  });

  it('eine Zahlung ändert den Stand weiter — die Regel betrifft nur den Stand von Hand', async () => {
    const id = await anlegen();
    await rechnungen.updateInvoiceStatus(id, 'Überfällig');
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: `${JAHR}-06-02`, betrag: 1200, art: 'Überweisung',
    });
    expect((await lesen(id)).paymentStatus).toBe('Bezahlt');
  });
});

describe('H6 — die Stornorechnung zählt im Jahr ihrer Ausstellung', () => {
  it('ihre Nummer trägt das Jahr der Ausstellung, auch wenn der Storno im Vorjahr lag', async () => {
    const id = await anlegen({ invoiceNumber: `RE-${JAHR - 1}-${++lfd}`, invoiceDate: `${JAHR - 1}-12-10`, dueDate: `${JAHR - 1}-12-24` });
    const zweiJahre = () => rechnungen.listInvoicesInRange(BETRIEB, `${JAHR - 1}-01-01`, `${JAHR}-12-31`);
    await rechnungen.cancelInvoice((await zweiJahre()).find((r) => r.id === id)!, 'Doppelt verrechnet');
    // Der Storno fand im Dezember des Vorjahrs statt.
    const { error } = await admin.from('invoices')
      .update({ cancelled_at: `${JAHR - 1}-12-20T10:00:00+01:00` }).eq('id', id);
    expect(error).toBeNull();

    const nummer = await rechnungen.stornorechnungAusstellen((await zweiJahre()).find((r) => r.id === id)!, 'RE');
    expect(nummer).toMatch(new RegExp(`^RE-${JAHR}-\\d{4}$`));
  });
});
