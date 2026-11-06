/**
 * Die Wartung als Quelle einer Rechnung (M01e + W04).
 *
 * Bis hierher erkannte die Vorschau „schon verrechnet“ am Text der Zeile
 * „Wartung … laut Vereinbarung“. Nach dem Umbenennen der Anlage oder einer
 * umformulierten Zeile kam dieselbe Wartung ein zweites Mal — und die
 * Datenbank hielt nichts auf. Jetzt hängt die Wartung über ihre Kennung an
 * der Rechnung (`invoice_coverage`, Art `wartung`), und die Datenbank zählt
 * ihre Durchgänge: so viele gültige Rechnungen einer Baustelle, wie die
 * Wartung dort Ausführungen hat, und eine mehr, solange sie dort eingeplant
 * ist.
 *
 * Dazu der Befund aus derselben Arbeit: `rechnung_anlegen` nahm jede
 * Kennung als Schein an, auch die eines anderen Betriebs.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as wartungen from '@/lib/db/pg/wartungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'wabd-a';
const FREMD = 'wabd-b';
const JAHR = new Date().getFullYear();

let buch: Konto;
let chef: Konto;
let fremdeBuchhaltung: Konto;
let kunde = '';
let fremderKunde = '';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'wabuch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'wachef');
  fremdeBuchhaltung = await konto(FREMD, 'Buchhaltung', 'wbbuch');
  const a = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber' }).select('id').single();
  const b = await admin.from('customers').insert({ company_id: FREMD, name: 'Familie Gruber' }).select('id').single();
  if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
  kunde = a.data.id as string;
  fremderKunde = b.data.id as string;
  clientEinreichen(buch.client);
}, 120_000);

/*
  AUFRÄUMEN, WAS HIER ENTSTEHT. Prüfungen, die ältere Migrationen erneut
  einspielen, kennen die Art `wartung` nicht; eine liegengebliebene
  Abdeckung brächte sie zu Fall.
*/
afterAll(async () => {
  clientEinreichen(null);
  for (const b of [BETRIEB, FREMD]) {
    await admin.from('invoices').delete().eq('company_id', b);
    await admin.from('number_counters').delete().eq('company_id', b);
    await admin.from('work_sheets').delete().eq('company_id', b);
    await admin.from('wartung_ausfuehrungen').delete().eq('company_id', b);
    await admin.from('wartungen').delete().eq('company_id', b);
    await admin.from('customers').delete().eq('company_id', b);
  }
});
afterEach(() => clientEinreichen(buch.client));

let lfd = 4000;

/** Eine Wartung mit Preis — eingeplant auf `offen`, wenn angegeben. */
async function wartung(offen: string | null, betrieb = BETRIEB): Promise<string> {
  const { data, error } = await admin.from('wartungen').insert({
    company_id: betrieb,
    customer_id: betrieb === BETRIEB ? kunde : fremderKunde,
    customer_name: betrieb === BETRIEB ? 'Familie Huber' : 'Familie Gruber',
    anlage: 'Gaskessel Heizraum',
    intervall_monate: 12,
    faellig_am: `${JAHR}-03-01`,
    preis: 180,
    offene_baustelle: offen,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/*
  „Erledigt“ und „Baustelle anlegen“ auf dem Weg der App, als
  Geschäftsführung: so hält die Datenbank die Ausführung fest wie im Betrieb
  (der Auslöser an `wartungen` übergeht den Dienstschlüssel). Ohne Baustelle
  bleibt `letzte_baustelle` stehen — die Ausführung landet auf der Baustelle
  des letzten Durchgangs.
*/
async function erledigt(w: string, am: string, baustelle?: string): Promise<void> {
  clientEinreichen(chef.client);
  try {
    await wartungen.wartungErledigt(w, { erledigtAm: am, intervallMonate: 12, projectNumber: baustelle });
  } finally {
    clientEinreichen(buch.client);
  }
}

async function eingeplant(w: string, baustelle: string): Promise<void> {
  clientEinreichen(chef.client);
  try {
    await wartungen.wartungEingeplant(w, baustelle);
  } finally {
    clientEinreichen(buch.client);
  }
}

/** Eine Rechnung über die Wartung, auf dem Weg der App. */
async function verrechnen(
  baustelle: string, wartungen: string[], extra: Partial<rechnungen.NewInvoice> = {},
): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: baustelle,
    customerName: 'Familie Huber',
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-04-30', leistungVon: '2026-04-30', leistungBis: '2026-04-30',
    dueDate: '2026-05-14',
    subtotalNetto: 180,
    totalNetto: 180,
    totalVat: 36,
    totalBrutto: 216,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Wartung Gaskessel Heizraum laut Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180 }],
    linkedWartungen: wartungen,
    ...extra,
  });
}

async function nummer(id: string): Promise<string> {
  const { data } = await admin.from('invoices').select('invoice_number').eq('id', id).single();
  return data!.invoice_number as string;
}

const nurKennung = (id: string) => ({ id } as unknown as WithId<Invoice>);

describe('Die Wartung hängt über ihre Kennung an der Rechnung', () => {
  it('ein nur eingeplanter Durchgang lässt sich verrechnen, und die Abdeckung steht da', async () => {
    const w = await wartung('W-1');
    const id = await verrechnen('W-1', [w]);

    const { data } = await admin.from('invoice_coverage').select('art, ziel_id').eq('invoice_id', id);
    expect(data).toEqual([{ art: 'wartung', ziel_id: w }]);
    const [r] = (await rechnungen.listInvoicesForProject(BETRIEB, 'W-1')).filter((x) => x.id === id);
    expect(r.linkedWartungen).toEqual([w]);
    // Die Zeile selbst trägt keine Kennung — sie steht nur in der Abdeckung.
    expect(r.positions).toEqual([
      { label: 'Wartung Gaskessel Heizraum laut Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180 },
    ]);
  });
});

describe('Ein Durchgang steht auf höchstens einer gültigen Rechnung', () => {
  it('eine zweite Rechnung wird abgewiesen — auch über die Schnittstelle, mit anderem Text und „PR-“', async () => {
    const w = await wartung('W-2');
    const erste = await verrechnen('W-2', [w]);

    lfd += 1;
    const { data, error } = await buch.client.rpc('rechnung_anlegen', {
      p_kopf: {
        invoice_number: `RE-${JAHR}-${lfd}`, project_number: 'pr-W-2', customer_name: 'Familie Huber',
        address: 'Hauptstraße 1, 2700 Wiener Neustadt',
        invoice_date: '2026-05-02', leistung_von: '2026-05-02', leistung_bis: '2026-05-02', due_date: '2026-05-16',
        subtotal_netto: 200, total_netto: 200, total_vat: 40, total_brutto: 240, vat_rate: 0.2, payment_status: 'Offen',
      },
      p_positionen: [{ label: 'Kesselservice Heizraum', qty: 1, unit: 'Pauschale', unit_price: 200, netto: 200 }],
      p_belege: { wartung: [w] },
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('23505');
    expect(error?.message).toContain(`schon auf der Rechnung ${await nummer(erste)}`);
    // Nichts angelegt: keine Rechnung ohne ihre Abdeckung.
    const { data: alle } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).eq('project_number', 'pr-W-2');
    expect(alle).toEqual([]);
  });

  it('nach einem Storno ist sie wieder frei; das Aufheben des Stornos bleibt dann aus', async () => {
    const w = await wartung('W-3');
    const erste = await verrechnen('W-3', [w]);
    await rechnungen.cancelInvoice(nurKennung(erste), 'Falscher Betrag');
    const zweite = await verrechnen('W-3', [w]);

    await expect(rechnungen.reactivateInvoice(nurKennung(erste)))
      .rejects.toThrow(new RegExp(`inzwischen auf ${await nummer(zweite)}`));
    const { data } = await admin.from('invoices').select('payment_status').eq('id', erste).single();
    expect(data!.payment_status).toBe('Storniert');
  });

  it('ist sie frei, hebt das Aufheben den Storno auf — und sperrt sie wieder', async () => {
    const w = await wartung('W-4');
    const id = await verrechnen('W-4', [w]);
    await rechnungen.cancelInvoice(nurKennung(id), 'Fehlgriff');
    await rechnungen.reactivateInvoice(nurKennung(id));
    await expect(verrechnen('W-4', [w])).rejects.toThrow(new RegExp(`schon auf der Rechnung ${await nummer(id)}`));
  });
});

describe('Der nächste Durchgang ist verrechenbar', () => {
  it('auf seiner eigenen Baustelle — der gewöhnliche Weg', async () => {
    const w = await wartung('W-5');
    await verrechnen('W-5', [w]);
    // Erledigt auf W-5, der nächste Durchgang ist auf W-6 eingeplant.
    await erledigt(w, '2026-03-02', 'W-5');
    await eingeplant(w, 'W-6');

    await verrechnen('W-6', [w]);
    // Der erste Durchgang bleibt verrechnet — die Ausführung hat ihn nicht verdoppelt.
    await expect(verrechnen('W-5', [w])).rejects.toThrow(/schon auf der Rechnung/);
    await expect(verrechnen('W-6', [w])).rejects.toThrow(/schon auf der Rechnung/);
  });

  it('auf derselben Baustelle, sobald sie dort ein zweites Mal ausgeführt ist', async () => {
    const w = await wartung(null);
    await erledigt(w, '2025-03-03', 'W-7');
    await verrechnen('W-7', [w]);
    await expect(verrechnen('W-7', [w])).rejects.toThrow(/schon auf der Rechnung/);

    // Ein Jahr später erledigt, das Feld „Baustelle“ blieb leer: die Ausführung landet wieder auf W-7.
    await erledigt(w, '2026-03-03');
    const { data: auf } = await admin.from('wartung_ausfuehrungen').select('am, baustelle').eq('wartung_id', w).order('am');
    expect(auf).toEqual([{ am: '2025-03-03', baustelle: 'W-7' }, { am: '2026-03-03', baustelle: 'W-7' }]);
    const zweite = await verrechnen('W-7', [w]);
    await expect(verrechnen('W-7', [w])).rejects.toThrow(/schon auf der Rechnung/);

    // Die Rechnung des Vorjahrs sperrt das Aufheben eines Stornos nicht.
    await rechnungen.cancelInvoice(nurKennung(zweite), 'Fehlgriff');
    await rechnungen.reactivateInvoice(nurKennung(zweite));
    const { data } = await admin.from('invoices').select('payment_status').eq('id', zweite).single();
    expect(data!.payment_status).toBe('Offen');
  });
});

describe('Was nicht zur Baustelle oder zum Betrieb gehört, kommt nicht auf die Rechnung', () => {
  it('eine Wartung, die auf dieser Baustelle weder eingeplant noch ausgeführt ist', async () => {
    const w = await wartung('W-8');
    await expect(verrechnen('W-9', [w])).rejects.toThrow(/weder eingeplant noch ausgeführt/);
  });

  it('die Wartung eines anderen Betriebs', async () => {
    const fremd = await wartung('W-10', FREMD);
    await expect(verrechnen('W-10', [fremd])).rejects.toThrow(/gehört nicht zu diesem Betrieb/);
    const { data } = await admin.from('invoices').select('id').eq('company_id', BETRIEB).eq('project_number', 'W-10');
    expect(data).toEqual([]);
  });

  it('der Schein eines anderen Betriebs (Befund M01e) — der eigene geht weiter', async () => {
    const schein = async (betrieb: string, k: Konto) => {
      const id = crypto.randomUUID();
      const { error } = await admin.from('work_sheets').insert({
        id, company_id: betrieb, project_number: 'W-11', customer_name: 'Familie Huber',
        datum: '2026-04-20', status: 'Entwurf', abrechnung: 'Regie',
        erstellt_von_uid: k.uid, erstellt_von_name: 'Büro',
      });
      if (error) throw new Error(error.message);
      return id;
    };
    const fremd = await schein(FREMD, fremdeBuchhaltung);
    await expect(verrechnen('W-11', [], { linkedWorkSheets: [fremd] }))
      .rejects.toThrow(/gehört nicht zu diesem Betrieb/);
    // Eine erfundene Kennung ebenso.
    await expect(verrechnen('W-11', [], { linkedWorkSheets: [crypto.randomUUID()] }))
      .rejects.toThrow(/gehört nicht zu diesem Betrieb/);

    const eigen = await schein(BETRIEB, buch);
    const id = await verrechnen('W-11', [], { linkedWorkSheets: [eigen] });
    const { data } = await admin.from('invoice_coverage').select('art, ziel_id').eq('invoice_id', id);
    expect(data).toEqual([{ art: 'work_sheet', ziel_id: eigen }]);
  });
});

/*
  DER ABZUG BLEIBT, WIE ER WAR. Eine Teilrechnung auf eine Pauschale, auf die
  jemand die Wartung übernommen hat, ist weiter ein Teilbetrag: die
  Schlussrechnung zieht sie ab — und muss es.
*/
describe('Eine Wartung macht eine Teilrechnung nicht „verbraucht“', () => {
  /** Eine Teilrechnung auf eine Pauschale, mit der Wartung daneben. */
  async function teilMitWartung(baustelle: string): Promise<string> {
    const w = await wartung(baustelle);
    return verrechnen(baustelle, [w], {
      art: 'teil', subtotalNetto: 1180, totalNetto: 1180, totalVat: 236, totalBrutto: 1416,
      positions: [
        { label: 'Teilbetrag der Pauschale', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 },
        { label: 'Wartung Gaskessel Heizraum laut Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 180, netto: 180 },
      ],
    });
  }
  const SCHLUSS = {
    art: 'schluss' as const, subtotalNetto: 5000,
    positions: [{ label: 'Pauschale', qty: 1, unit: 'Pauschale', unitPrice: 5000, netto: 5000 }],
  };
  const OHNE_ABZUG = { ...SCHLUSS, totalNetto: 5000, totalVat: 1000, totalBrutto: 6000 };

  it('die Schlussrechnung muss sie abziehen', async () => {
    const teil = await teilMitWartung('W-12');
    await expect(verrechnen('W-12', [], OHNE_ABZUG))
      .rejects.toThrow(new RegExp(`muss abziehen.*${await nummer(teil)}`));
  });

  it('und sie kann es', async () => {
    const teil = await teilMitWartung('W-13');
    const id = await verrechnen('W-13', [], {
      ...SCHLUSS,
      vorrechnungen: [{ invoiceId: teil, invoiceNumber: await nummer(teil), invoiceDate: '2026-04-30', netto: 1180, vat: 236, brutto: 1416 }],
      gesamtNetto: 5000, gesamtVat: 1000, gesamtBrutto: 6000,
      totalNetto: 3820, totalVat: 764, totalBrutto: 4584,
    });
    const { data } = await admin.from('invoices').select('total_brutto').eq('id', id).single();
    expect(Number(data!.total_brutto)).toBe(4584);
  });

  it('die Liste der Schlussrechnungen ohne Abzug nennt sie', async () => {
    // Eine Schlussrechnung, und erst danach die Teilrechnung — so entsteht der Altfall, den die Liste zeigt.
    const schluss = await verrechnen('W-14', [], OHNE_ABZUG);
    const teil = await teilMitWartung('W-14');
    const { data, error } = await buch.client.rpc('schlussrechnungen_ohne_abzug');
    expect(error).toBeNull();
    expect(data).toContainEqual({ invoice_number: await nummer(schluss), fehlend: await nummer(teil) });
  });
});
