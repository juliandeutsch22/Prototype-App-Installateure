/**
 * Anzahlung, Teilrechnung, Schlussrechnung — gegen eine echte Datenbank.
 *
 * WARUM DIE WÄCHTER IN DER DATENBANK STEHEN UND NICHT IN DER ANSICHT: der
 * teure Fehler ist der doppelte Abzug. Zieht der Betrieb dieselbe Anzahlung
 * auf zwei Schlussrechnungen ab, hat er sie einmal verrechnet und zweimal
 * gutgeschrieben — der Kunde zahlt zu wenig, und es fällt frühestens beim
 * Jahresabschluss auf. Eine Prüfung im Browser hilft dagegen nicht: sie sieht
 * nur, was gerade geladen ist.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice, Vorrechnung } from '@/types';

const BETRIEB = 'arten-a';
const FREMD = 'arten-b';
const JAHR = new Date().getFullYear();

let buch: Konto;
let fremdBuch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'abuch');
  fremdBuch = await konto(FREMD, 'Buchhaltung', 'afremd');
  clientEinreichen(buch.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 2000;

/** Eine Rechnung über 1.200 € brutto, mit frei wählbarer Art und Baustelle. */
async function anlegen(
  extra: Partial<rechnungen.NewInvoice> = {},
  betrieb = BETRIEB,
): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(betrieb, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: 'B-200',
    customerName: 'Familie Huber',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    ...extra,
  });
}

/** Die Rechnung so, wie die Datenschicht sie wieder herausgibt. */
async function lesen(id: string): Promise<WithId<Invoice>> {
  const alle = await rechnungen.listInvoicesInRange(BETRIEB, '2026-01-01', '2026-12-31');
  const treffer = alle.find((r) => r.id === id);
  expect(treffer, 'Rechnung nicht wiedergefunden').toBeTruthy();
  return treffer!;
}

/** Der Abzug, wie er auf der Schlussrechnung steht. */
function abzug(id: string, nummer: string): Vorrechnung {
  return {
    invoiceId: id,
    invoiceNumber: nummer,
    invoiceDate: '2026-04-30',
    netto: 1000,
    vat: 200,
    brutto: 1200,
  };
}

/** Die eigene Leistung dieser Schlussrechnung, zusätzlich zu den Abzügen. */
const REST = { netto: 1000, vat: 200, brutto: 1200 };

/**
 * Eine Schlussrechnung, die aufgeht.
 *
 * Die Gesamtleistung ist die eigene Leistung PLUS die abgezogenen
 * Vorrechnungen — nur so ist der Rechnungsbetrag das, was übrig bleibt. Die
 * Datenbank rechnet das nach; eine Prüfung, die hier von Hand danebenläge,
 * prüfte den falschen Fehler.
 */
async function schluss(
  abzuege: Vorrechnung[],
  extra: Partial<rechnungen.NewInvoice> = {},
): Promise<string> {
  const g = abzuege.reduce(
    (s, a) => ({ netto: s.netto + a.netto, vat: s.vat + a.vat, brutto: s.brutto + a.brutto }),
    { ...REST },
  );
  return anlegen({
    art: 'schluss',
    vorrechnungen: abzuege,
    totalNetto: REST.netto,
    totalVat: REST.vat,
    totalBrutto: REST.brutto,
    gesamtNetto: g.netto,
    gesamtVat: g.vat,
    gesamtBrutto: g.brutto,
    ...extra,
  });
}

describe('Die Art einer Rechnung', () => {
  it('ist ohne Angabe eine Einzelrechnung, und die zieht nichts ab', async () => {
    const id = await anlegen();
    const r = await lesen(id);
    expect(r.art).toBe('einzel');
    expect(r.vorrechnungen).toBeUndefined();
    /*
      Die Gesamtleistung bleibt leer, wo nichts abgezogen wird — sonst stünde
      dieselbe Zahl zweimal da, und beim nächsten Rechenweg wäre offen, welche
      von beiden gilt.
    */
    expect(r.gesamtBrutto).toBeUndefined();
  });

  it('kennt genau vier Arten — eine fünfte weist die Datenbank ab', async () => {
    await expect(
      anlegen({ art: 'abschlag' as never }),
    ).rejects.toThrow();
  });
});

describe('Der Abzug auf der Schlussrechnung', () => {
  it('steht mit Nummer, Datum und Beträgen auf dem Beleg', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;

    const id = await schluss([abzug(anzahlung, nummer)]);

    const r = await lesen(id);
    expect(r.art).toBe('schluss');
    expect(r.vorrechnungen).toEqual([abzug(anzahlung, nummer)]);
    /*
      DIE FORDERUNG IST DER REST, die Gesamtleistung steht daneben. Genau
      daran hängen offene Posten, Mahnlauf und Zahlungsstand: sie dürfen die
      2.400 € nicht einfordern, von denen 1.200 € längst verrechnet sind.
    */
    expect(r.totalBrutto).toBe(1200);
    expect(r.gesamtBrutto).toBe(2400);
  });

  it('nimmt dieselbe Anzahlung kein zweites Mal', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;
    await schluss([abzug(anzahlung, nummer)]);

    await expect(schluss([abzug(anzahlung, nummer)])).rejects.toThrow(/bereits auf einer anderen/);
  });

  it('gibt die Anzahlung wieder frei, wenn die Schlussrechnung storniert wird', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;
    const erste = await schluss([abzug(anzahlung, nummer)]);

    /*
      Der Storno ist der vorgesehene Weg zurück — eine Rechnung wird nicht
      gelöscht (§ 132 BAO). Was er freigibt, muss er ganz freigeben: sonst
      bliebe die Anzahlung für immer verbraucht, ohne dass ihr etwas
      gegenübersteht.
    */
    await rechnungen.cancelInvoice({ id: erste } as unknown as WithId<Invoice>, 'Zahlendreher');

    const zweite = await schluss([abzug(anzahlung, nummer)]);
    expect((await lesen(zweite)).vorrechnungen).toHaveLength(1);
  });

  it('greift nicht auf eine Rechnung eines anderen Betriebs', async () => {
    clientEinreichen(fremdBuch.client);
    const fremdeAnzahlung = await anlegen({ art: 'anzahlung' }, FREMD);
    clientEinreichen(buch.client);

    await expect(schluss([abzug(fremdeAnzahlung, 'RE-fremd')])).rejects.toThrow(
      /desselben Betriebs/,
    );

    // Und die fremde Rechnung steht unberührt da.
    const { data } = await admin.from('invoices').select('company_id').eq('id', fremdeAnzahlung).single();
    expect(data!.company_id).toBe(FREMD);
  });

  /*
    DIE BETRIEBSBEDINGUNG WIRD HIER MIT DEM DIENSTSCHLÜSSEL GEPRÜFT, und zwar
    absichtlich. Ein angemeldetes Konto sieht fremde Rechnungen ohnehin nicht
    — der Wächter fände sie also auch dann nicht, wenn er gar nicht nach dem
    Betrieb fragte. Erst der Dienstschlüssel, der an den Richtlinien vorbei
    schreibt (Rücklauf einer Sicherung, Erstanlage), zeigt, ob die Bedingung
    wirklich da ist.
  */
  it('greift auch mit dem Dienstschlüssel nicht auf einen anderen Betrieb', async () => {
    clientEinreichen(fremdBuch.client);
    const fremdeAnzahlung = await anlegen({ art: 'anzahlung' }, FREMD);
    clientEinreichen(buch.client);

    const { error } = await admin.from('invoices').insert({
      company_id: BETRIEB,
      invoice_number: `RE-${JAHR}-8888`,
      project_number: 'B-200',
      customer_name: 'Familie Huber',
      invoice_date: '2026-04-30',
      due_date: '2026-05-14',
      total_netto: 1000, total_vat: 200, total_brutto: 1200,
      art: 'schluss',
      vorrechnungen: [abzug(fremdeAnzahlung, 'RE-fremd')],
      gesamt_netto: 2000, gesamt_vat: 400, gesamt_brutto: 2400,
    });
    expect(error?.message).toMatch(/desselben Betriebs/);
  });

  it('greift nicht auf eine Rechnung einer anderen Baustelle', async () => {
    const andere = await anlegen({ art: 'anzahlung', projectNumber: 'B-999' });
    const nummer = (await lesen(andere)).invoiceNumber;

    /*
      Sonst wanderte Erlös zwischen zwei Baustellen: die eine sähe in der
      Nachkalkulation besser aus, als sie ist, die andere schlechter — und
      zwar ohne erkennbare Ursache.
    */
    await expect(schluss([abzug(andere, nummer)])).rejects.toThrow(/derselben Baustelle/);
  });

  it('nimmt keine Rechnung, die schon Belege verbraucht hat', async () => {
    /*
      DIE FALLE, DIE ZWEIMAL KÜRZT. Eine Teilrechnung über einen
      abgeschlossenen Bauabschnitt hat dessen Zeiteinträge verbraucht: sie
      sind als verrechnet markiert und stehen in der Schlussrechnung gar
      nicht mehr. Ihre Summe ist also schon heraussen — ein Abzug zöge sie
      ein zweites Mal ab, und der Betrieb schenkte dem Kunden seine eigene
      Leistung.
    */
    const teil = await anlegen({
      art: 'teil',
      linkedEntries: ['11111111-2222-4333-8444-555555555555'],
    });
    const nummer = (await lesen(teil)).invoiceNumber;

    await expect(schluss([abzug(teil, nummer)])).rejects.toThrow(/Belege verbraucht/);
  });

  it('nimmt den Betrag nicht anders, als er auf der abgezogenen Rechnung steht', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;

    /*
      Die Kopie steht auf dem Beleg und wird nie wieder nachgerechnet. Ein
      Zahlendreher hier wäre einer für immer — und zwar einer, der genau um
      den vertippten Betrag zu wenig fordert.
    */
    await expect(
      schluss([{ ...abzug(anzahlung, nummer), netto: 100 }]),
    ).rejects.toThrow(/stimmt nicht mit der abgezogenen Rechnung/);
  });
});

describe('Die Rechnung muss aufgehen', () => {
  it('weist einen Rechnungsbetrag ab, der nicht der Rest ist', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;

    await expect(
      schluss([abzug(anzahlung, nummer)], { totalBrutto: 1500 }),
    ).rejects.toThrow(/nicht die Gesamtleistung abzüglich/);
  });

  it('verlangt die Gesamtleistung, wo abgezogen wird', async () => {
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;

    await expect(
      anlegen({ art: 'schluss', vorrechnungen: [abzug(anzahlung, nummer)] }),
    ).rejects.toThrow(/Gesamtleistung fehlt/);
  });

  it('lässt keine Gesamtleistung ohne Abzug stehen', async () => {
    // Sonst stünde dieselbe Zahl zweimal da, und es wäre offen, welche gilt.
    await expect(
      anlegen({ gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200 }),
    ).rejects.toThrow(/ohne abgezogene Vorrechnung/);
  });

  it('weist eine Schlussrechnung ab, die ins Minus liefe', async () => {
    /*
      Das ist eine Gutschrift, und die gibt es hier noch nicht: Zahlungsstand,
      offene Posten und Mahnlauf rechnen alle mit einer Forderung, die man
      begleichen kann. Auf null gekappt verschwände der Betrag, den der
      Betrieb dem Kunden zurückschuldet — lautlos und zu seinen Gunsten.
    */
    const anzahlung = await anlegen({ art: 'anzahlung' });
    const nummer = (await lesen(anzahlung)).invoiceNumber;

    await expect(
      anlegen({
        art: 'schluss',
        vorrechnungen: [abzug(anzahlung, nummer)],
        totalNetto: -200, totalVat: -40, totalBrutto: -240,
        gesamtNetto: 800, gesamtVat: 160, gesamtBrutto: 960,
      }),
    ).rejects.toThrow(/Gutschrift/);
  });
});

describe('Der Abzug greift nicht daneben', () => {
  it('zieht sich nicht selbst ab', async () => {
    /*
      Die Rechnung gibt es beim Anlegen noch nicht — der Wächter findet sie
      also nicht und weist ab. Das ist kein Zufallstreffer, sondern der
      einzige Weg, auf dem eine Rechnung sich selbst nennen könnte.
    */
    const erfunden = '00000000-0000-4000-8000-000000000001';
    await expect(schluss([abzug(erfunden, 'RE-gibt-es-nicht')])).rejects.toThrow(
      /desselben Betriebs/,
    );
  });
});
