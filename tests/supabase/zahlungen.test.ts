/**
 * Zahlungseingänge — gegen eine echte Datenbank.
 *
 * WARUM DIESE PRÜFUNGEN HIER STEHEN UND NICHT BEI DEN RECHENREGELN: das
 * Entscheidende an Stufe 10.1 ist kein Rechenweg im Browser, sondern eine
 * Zusage der Datenbank. Der Zahlungsstand einer Rechnung ergibt sich aus
 * ihren Eingängen, und von Hand lässt er sich nicht mehr setzen. Eine
 * Nachbildung könnte das bestätigen, ohne dass es stimmt.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as zahlungen from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'zahl-a';
const FREMD = 'zahl-b';
const JAHR = new Date().getFullYear();

let buch: Konto;
let monteur: Konto;
let fremdBuch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'zbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zmonteur');
  fremdBuch = await konto(FREMD, 'Buchhaltung', 'zfremd');
  clientEinreichen(buch.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 1000;

/** Eine frische Rechnung über 1.000 €, fällig in der Vergangenheit. */
async function rechnung(brutto = 1000): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: 'B-100',
    customerName: 'Familie Huber',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    totalNetto: Math.round((brutto / 1.2) * 100) / 100,
    totalVat: Math.round((brutto - brutto / 1.2) * 100) / 100,
    totalBrutto: brutto,
    vatRate: 0.2,
    paymentStatus: 'Offen',
  });
}

/*
  Storno und Storno-Aufhebung laufen über Datenbankfunktionen und brauchen von
  der Rechnung nur ihre Kennung — der Rest des Datensatzes stünde hier als
  Beiwerk, das beim nächsten neuen Feld nachgezogen werden müsste.
*/
const nurKennung = (id: string) => ({ id } as unknown as WithId<Invoice>);

/** Stand der Rechnung, direkt aus der Datenbank gelesen. */
async function stand(id: string) {
  const { data } = await admin
    .from('invoices')
    .select('payment_status, bezahlt_betrag')
    .eq('id', id)
    .single();
  return { status: data!.payment_status as string, bezahlt: Number(data!.bezahlt_betrag) };
}

describe('Der Zahlungsstand ergibt sich aus den Eingängen', () => {
  it('rechnet von offen über teilbezahlt bis überzahlt — und wieder zurück', async () => {
    const id = await rechnung();
    expect(await stand(id)).toEqual({ status: 'Offen', bezahlt: 0 });

    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-10', betrag: 400, art: 'Überweisung',
    });
    expect(await stand(id)).toEqual({ status: 'Teilbezahlt', bezahlt: 400 });

    const rest = await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-20', betrag: 600, art: 'Überweisung',
    });
    expect(await stand(id)).toEqual({ status: 'Bezahlt', bezahlt: 1000 });

    /*
      ZWEIMAL ÜBERWIESEN IST KEIN SELTENER FALL, und „Bezahlt" wäre dafür die
      falsche Auskunft: es steht eine Rückzahlung aus, und die fällt sonst nur
      dem Kunden auf.
    */
    const zuviel = await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-21', betrag: 50, art: 'Bar',
    });
    expect(await stand(id)).toEqual({ status: 'Überzahlt', bezahlt: 1050 });

    /* Die Rückzahlung ist derselbe Vorgang mit umgekehrtem Vorzeichen. */
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-22', betrag: -50, art: 'Überweisung',
      hinweis: 'Zuviel überwiesen, zurück',
    });
    expect(await stand(id)).toEqual({ status: 'Bezahlt', bezahlt: 1000 });

    /* Und ein gelöschter Eingang zieht den Stand mit. */
    await zahlungen.deleteZahlung(rest);
    expect(await stand(id)).toEqual({ status: 'Teilbezahlt', bezahlt: 400 });
    void zuviel;
  }, 60_000);

  it('nimmt keinen Eingang über null Euro an', async () => {
    const id = await rechnung();
    await expect(zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-10', betrag: 0, art: 'Bar',
    })).rejects.toThrow();
  });

  /*
    DER HAKEN VON HAND IST WEG, und zwar in der Datenbank. Stünde er nur in
    der Oberfläche nicht mehr zur Verfügung, wäre er beim nächsten Formular
    wieder da — und dann behaupten zwei Quellen denselben Stand.
  */
  it('lässt sich nicht von Hand auf „Bezahlt" stellen', async () => {
    const id = await rechnung();
    const { error } = await buch.client
      .from('invoices').update({ payment_status: 'Bezahlt' }).eq('id', id);
    expect(error).not.toBeNull();
    expect((await stand(id)).status).toBe('Offen');
  });

  it('lässt den bezahlten Betrag nicht von Hand setzen', async () => {
    const id = await rechnung();
    const { error } = await buch.client
      .from('invoices').update({ bezahlt_betrag: 999 }).eq('id', id);
    expect(error).not.toBeNull();
    expect((await stand(id)).bezahlt).toBe(0);
  });

  it('lässt „Überfällig" weiterhin zu — das hängt am Datum, nicht am Geld', async () => {
    const id = await rechnung();
    await rechnungen.updateInvoiceStatus(id, 'Überfällig');
    expect((await stand(id)).status).toBe('Überfällig');
  });

  /*
    EINE TEILZAHLUNG HEILT DEN VERZUG NICHT. Wer auf eine überfällige Rechnung
    etwas anzahlt, ist weiter in Verzug; „Teilbezahlt" ist die genauere
    Auskunft, und sie bleibt mahnbar, weil `app.mahnung_faellig` am
    Fälligkeitsdatum hängt.
  */
  it('macht aus einer überfälligen Rechnung mit Teilzahlung „Teilbezahlt"', async () => {
    const id = await rechnung();
    await rechnungen.updateInvoiceStatus(id, 'Überfällig');
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-20', betrag: 300, art: 'Überweisung',
    });
    expect((await stand(id)).status).toBe('Teilbezahlt');
    const offen = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(offen.map((r) => r.id)).toContain(id);
  }, 30_000);
});

describe('Storno und Zahlung', () => {
  it('behält die Zahlungen — das Geld ist da, die Forderung nicht mehr', async () => {
    const id = await rechnung();
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-10', betrag: 1000, art: 'Überweisung',
    });
    await rechnungen.cancelInvoice(nurKennung(id), 'Falscher Kunde');

    const nachher = await stand(id);
    expect(nachher.status).toBe('Storniert');
    /*
      DIE ZAHL BLEIBT STEHEN. Sie auf null zu setzen wäre der naheliegende
      Griff und der teuerste: der Betrieb schuldet dem Kunden 1.000 €, und
      eine Rückzahlung, an die nichts mehr erinnert, findet nicht statt.
    */
    expect(nachher.bezahlt).toBe(1000);
    expect(await zahlungen.listZahlungen(BETRIEB, id)).toHaveLength(1);
  }, 60_000);

  it('nimmt auch nach dem Storno noch eine Zahlung an, ohne den Status zu drehen', async () => {
    const id = await rechnung();
    await rechnungen.cancelInvoice(nurKennung(id), 'Storno');
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-25', betrag: 200, art: 'Überweisung',
    });
    expect(await stand(id)).toEqual({ status: 'Storniert', bezahlt: 200 });
  }, 60_000);

  /*
    DER FEHLER, DEN DAS VERHINDERT. `rechnung_storno_aufheben` setzte den
    Status hart auf „Offen". Bei einer längst bezahlten Rechnung hätte das
    Aufheben eines Fehlstornos die Forderung wieder aufgemacht — und der
    Mahnlauf hätte einen Kunden gemahnt, der bezahlt hat.
  */
  it('stellt beim Aufheben den abgeleiteten Stand her, nicht „Offen"', async () => {
    const id = await rechnung();
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-10', betrag: 1000, art: 'Überweisung',
    });
    await rechnungen.cancelInvoice(nurKennung(id), 'Versehen');
    await rechnungen.reactivateInvoice(nurKennung(id));
    expect(await stand(id)).toEqual({ status: 'Bezahlt', bezahlt: 1000 });
  }, 60_000);
});

describe('Wer an Zahlungen darf', () => {
  it('der Monteur sieht keine und schreibt keine', async () => {
    const id = await rechnung();
    await zahlungen.createZahlung(BETRIEB, {
      invoiceId: id, datum: '2026-05-10', betrag: 100, art: 'Bar',
    });

    clientEinreichen(monteur.client);
    const { data } = await monteur.client.from('zahlungseingaenge').select('*');
    expect(data ?? []).toHaveLength(0);

    const { error } = await monteur.client.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: id, datum: '2026-05-11', betrag: 1, art: 'Bar',
    });
    expect(error).not.toBeNull();
  }, 30_000);

  /*
    DER FREMDSCHLÜSSEL ALLEIN REICHT NICHT. Er sagt nur, dass es die Rechnung
    GIBT. Ohne den Wächter könnte ein Betrieb seine eigene Kennung eintragen
    und die Rechnung eines anderen — die Zeile wäre für beide unsichtbar und
    stünde trotzdem in der Summe eines fremden Belegs.
  */
  it('nimmt keine Zahlung auf die Rechnung eines fremden Betriebs an', async () => {
    const id = await rechnung();
    clientEinreichen(fremdBuch.client);
    const { error } = await fremdBuch.client.from('zahlungseingaenge').insert({
      company_id: FREMD, invoice_id: id, datum: '2026-05-11', betrag: 1, art: 'Bar',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/anderen Betrieb/);
  }, 30_000);
});
