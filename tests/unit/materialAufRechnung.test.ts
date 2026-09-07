import { describe, it, expect } from 'vitest';
import {
  leistungszeitraum,
  materialPositionen,
  verrechneteScheine,
  normName,
} from '@/features/invoices/materialPositionen';
import { assembleInvoice, INVOICE_DEFAULTS } from '@/features/invoices/assemble';
import type { Material, TimeEntry, WorkSheet } from '@/types';

/**
 * Material auf der Rechnung — und der Leistungszeitraum.
 *
 * ZWEI LÜCKEN, die zusammen den Kreis geschlossen haben:
 *
 *  1. Diese App verrechnete AUSSCHLIESSLICH Stunden. Bei einem Installateur
 *     ist das Material schnell die halbe Rechnungssumme; das Büro tippte es
 *     bei jeder Rechnung von Hand nach — oder vergass es.
 *  2. Der Leistungszeitraum fehlte auf jeder Rechnung. Er ist Pflichtangabe
 *     nach § 11 Abs 1 Z 4 UStG; ohne ihn wackelt beim Kunden der
 *     Vorsteuerabzug.
 */

function schein(zusatz: Partial<WorkSheet> & { id: string }): WorkSheet & { id: string } {
  return {
    companyId: 'perl',
    projectNumber: 'B-001',
    customerName: 'Huber',
    datum: '2026-09-04',
    status: 'Unterschrieben',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max',
    ...zusatz,
  } as WorkSheet & { id: string };
}

const KATALOG: Material[] = [
  { id: 'k1', companyId: 'perl', name: 'Eckventil 1/2 Zoll', stock: 20, unit: 'Stk', verkaufspreis: 8.5 },
  { id: 'k2', companyId: 'perl', name: 'Kupferrohr 15 mm', stock: 50, unit: 'm', verkaufspreis: 6 },
  { id: 'k3', companyId: 'perl', name: 'Dichtung', stock: 99, unit: 'Stk' }, // ohne Preis
];

describe('Woher das Material kommt', () => {
  it('nimmt es aus dem unterschriebenen Schein — mit dem Preis aus dem Katalog', async () => {
    const { positionen } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }] })],
      KATALOG,
    );
    expect(positionen).toEqual([
      { label: 'Eckventil 1/2 Zoll', qty: 2, unit: 'Stk', unitPrice: 8.5, netto: 17 },
    ]);
  });

  it('lässt den ENTWURF draussen', async () => {
    // Er ist noch änderbar. Was der Kunde nicht unterschrieben hat, gehört
    // nicht ungefragt auf seine Rechnung.
    const { positionen } = materialPositionen(
      [schein({ id: 's1', status: 'Entwurf', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] })],
      KATALOG,
    );
    expect(positionen).toEqual([]);
  });

  it('lässt den stornierten und den verworfenen Schein draussen', async () => {
    const { positionen } = materialPositionen(
      [
        schein({ id: 's1', status: 'Storniert', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] }),
        schein({ id: 's2', status: 'Verworfen', material: [{ name: 'Kupferrohr 15 mm', menge: 3 }] }),
      ],
      KATALOG,
    );
    expect(positionen).toEqual([]);
  });

  it('fasst denselben Artikel über mehrere Scheine zusammen', async () => {
    /*
      Drei Anfahrten mit je zwei Eckventilen ergeben EINE Zeile über sechs
      Stück. Der Kunde liest eine Rechnung, keine Chronik der Anfahrten — und
      wer die Aufteilung braucht, findet sie auf den Scheinen, die er
      unterschrieben hat.
    */
    const { positionen } = materialPositionen(
      [
        schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }] }),
        schein({ id: 's2', material: [{ name: 'eckventil 1/2 zoll', menge: 4, einheit: 'Stk' }] }),
      ],
      KATALOG,
    );
    expect(positionen).toHaveLength(1);
    expect(positionen[0]).toMatchObject({ qty: 6, netto: 51 });
  });

  it('fasst NICHT zusammen, wenn die Einheit verschieden ist', async () => {
    // „5 m Rohr" und „5 Stk Rohr" sind nicht dasselbe.
    const { positionen } = materialPositionen(
      [
        schein({ id: 's1', material: [{ name: 'Kupferrohr 15 mm', menge: 5, einheit: 'm' }] }),
        schein({ id: 's2', material: [{ name: 'Kupferrohr 15 mm', menge: 5, einheit: 'Stk' }] }),
      ],
      KATALOG,
    );
    expect(positionen).toHaveLength(2);
  });

  it('sortiert alphabetisch — dieselbe Baustelle ergibt dieselbe Reihenfolge', async () => {
    const { positionen } = materialPositionen(
      [
        schein({
          id: 's1',
          material: [
            { name: 'Kupferrohr 15 mm', menge: 1 },
            { name: 'Eckventil 1/2 Zoll', menge: 1 },
          ],
        }),
      ],
      KATALOG,
    );
    expect(positionen.map((p) => p.label)).toEqual(['Eckventil 1/2 Zoll', 'Kupferrohr 15 mm']);
  });
});

describe('Wenn der Preis fehlt', () => {
  it('setzt 0,00 € ein und sagt, welche Zeile es betrifft', async () => {
    /*
      Eine erfundene Zahl auf einer Rechnung wäre schlimmer als eine sichtbare
      Lücke. Die Zeile steht da, will ausgefüllt werden — und lässt sich
      ebenso gut entfernen.
    */
    const { positionen, herkunft } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Sonderteil vom Grosshandel', menge: 1 }] })],
      KATALOG,
    );
    expect(positionen[0]).toMatchObject({ unitPrice: 0, netto: 0 });
    expect(herkunft.ohnePreis).toEqual(['Sonderteil vom Grosshandel']);
  });

  it('behandelt einen Katalogeintrag OHNE gepflegten Preis genauso', async () => {
    // Ein Eintrag ohne Preis ist dasselbe wie kein Eintrag; ein
    // stillschweigendes 0,00 € wäre schlimmer als eine Lücke, die auffällt.
    // Auch die 0, die das leere Feld im Katalogformular speichert.
    const { herkunft } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Dichtung', menge: 10 }] })],
      [...KATALOG, { id: 'k4', companyId: 'perl', name: 'Nullpreis', stock: 1, verkaufspreis: 0 }],
    );
    expect(herkunft.ohnePreis).toEqual(['Dichtung']);
  });

  it('nimmt die Einheit trotzdem aus dem Katalog', async () => {
    /*
      DIESER TEST ENTSTAND AUS EINER GEGENPROBE, DIE ZUNÄCHST DURCHGING — und
      sie hat einen Entwurfsfehler aufgedeckt, nicht nur eine Testlücke.

      Preis und Einheit hingen an derselben Tabelle. Wer den Preis noch nicht
      gepflegt hatte, bekam damit auch die Einheit nicht: „Dichtung" stand mit
      dem Vorgabewert „Stk" auf der Rechnung, obwohl der Katalog „Pkg" sagt.

      Die Einheit ist eine TATSACHE über den Artikel, der Preis eine
      ENTSCHEIDUNG. Das eine darf nicht am anderen hängen.
    */
    const { positionen } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Dichtung', menge: 10 }] })],
      [{ id: 'k3', companyId: 'perl', name: 'Dichtung', stock: 99, unit: 'Pkg' }],
    );
    expect(positionen[0]).toMatchObject({ unit: 'Pkg', unitPrice: 0 });
  });

  it('übernimmt die Einheit aus dem Katalog, wenn der Schein keine trägt', async () => {
    const { positionen } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Kupferrohr 15 mm', menge: 3 }] })],
      KATALOG,
    );
    expect(positionen[0].unit).toBe('m');
  });
});

describe('Nichts zweimal verrechnen', () => {
  it('überspringt einen Schein, der schon auf einer Rechnung steht', async () => {
    const { positionen } = materialPositionen(
      [schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] })],
      KATALOG,
      new Set(['s1']),
    );
    expect(positionen).toEqual([]);
  });

  it('gibt einen STORNIERTEN Beleg wieder frei', async () => {
    /*
      Der Grund, warum die Zuordnung an der Rechnung hängt und nicht am
      Schein: der Schein ist nach der Unterschrift eingefroren, und ein Feld
      an ihm müsste jemand von Hand zurücksetzen. So macht es der Storno von
      selbst.
    */
    const verbraucht = verrechneteScheine([
      { linkedWorkSheets: ['s1'], paymentStatus: 'Storniert' },
      { linkedWorkSheets: ['s2'], paymentStatus: 'Offen' },
    ]);
    expect([...verbraucht]).toEqual(['s2']);
  });

  it('merkt sich, welche Scheine verbraucht wurden', async () => {
    const { herkunft } = materialPositionen(
      [
        schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] }),
        schein({ id: 's2', material: [] }), // kein Material -> nicht verbraucht
      ],
      KATALOG,
    );
    expect(herkunft.scheine).toEqual(['s1']);
  });
});

describe('Der Leistungszeitraum', () => {
  it('spannt sich vom frühesten bis zum spätesten Beleg', async () => {
    expect(leistungszeitraum(['2026-09-11', '2026-09-04', '2026-09-08'])).toEqual({
      von: '2026-09-04',
      bis: '2026-09-11',
    });
  });

  it('ist bei einem einzigen Tag von und bis gleich', async () => {
    // Auf dem Beleg steht dann „Leistungsdatum", nicht „Zeitraum vom 4. bis
    // 4." — genau die Unterscheidung, die § 11 UStG trifft.
    expect(leistungszeitraum(['2026-09-04'])).toEqual({ von: '2026-09-04', bis: '2026-09-04' });
  });

  it('ist null, wenn es keinen datierten Beleg gibt', async () => {
    // Dann bleibt das Feld leer und will ausgefüllt werden. Ein erfundener
    // Zeitraum wäre eine falsche Angabe gegenüber dem Finanzamt.
    expect(leistungszeitraum([])).toBeNull();
    expect(leistungszeitraum([undefined, '', 'unsinn'])).toBeNull();
  });
});

describe('Die ganze Rechnung', () => {
  const zeiten: Array<TimeEntry & { id: string }> = [
    {
      id: 'z1',
      companyId: 'perl',
      userId: 'm1',
      date: '2026-09-07',
      status: 'Anwesend',
      projectNumber: 'B-001',
      startTime: '07:00',
      endTime: '16:00',
      breakDuration: 30,
    } as TimeEntry & { id: string },
  ];

  it('stellt Stunden UND Material zusammen — Stunden zuerst', async () => {
    // Der Kunde liest von oben: erst die Arbeit, für die er jemanden gerufen
    // hat, dann das, was dabei verbaut wurde.
    const r = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS, {
      scheine: [schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] })],
      katalog: KATALOG,
    });
    expect(r.positions.map((p) => p.label)).toEqual([
      'Facharbeiterstunden',
      'Eckventil 1/2 Zoll',
    ]);
    expect(r.linkedWorkSheets).toEqual(['s1']);
  });

  it('nimmt den Tag des Scheins in den Zeitraum, auch ohne Stunden an dem Tag', async () => {
    /*
      Ein Schein kann einen Tag betreffen, an dem keine Stunden gebucht sind —
      etwa wenn nur geliefert und verbaut wurde. Nähme man nur die
      Zeiteinträge, fiele dieser Tag aus dem Zeitraum, den die Rechnung
      behauptet.
    */
    const r = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS, {
      scheine: [
        schein({ id: 's1', datum: '2026-09-12', material: [{ name: 'Eckventil 1/2 Zoll', menge: 1 }] }),
      ],
      katalog: KATALOG,
    });
    expect(r.leistung).toEqual({ von: '2026-09-07', bis: '2026-09-12' });
  });

  it('zählt den Tag eines Scheins NICHT mit, dessen Material schon verrechnet ist', async () => {
    const r = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS, {
      scheine: [
        schein({ id: 's1', datum: '2026-09-30', material: [{ name: 'Eckventil 1/2 Zoll', menge: 1 }] }),
      ],
      katalog: KATALOG,
      bereitsVerrechnet: new Set(['s1']),
    });
    expect(r.leistung).toEqual({ von: '2026-09-07', bis: '2026-09-07' });
  });

  it('läuft ohne Material genauso wie vorher', async () => {
    // Die Zusicherung an alles Bestehende: wer keine Scheine mitgibt, bekommt
    // exakt die Rechnung von früher.
    const ohne = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS);
    expect(ohne.positions).toHaveLength(1);
    expect(ohne.linkedWorkSheets).toEqual([]);
    expect(ohne.totalBrutto).toBeGreaterThan(0);
  });

  it('summiert Material in die Rechnungssumme', async () => {
    const r = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS, {
      scheine: [schein({ id: 's1', material: [{ name: 'Eckventil 1/2 Zoll', menge: 2 }] })],
      katalog: KATALOG,
    });
    const ohne = assembleInvoice('B-001', zeiten, INVOICE_DEFAULTS);
    expect(r.subtotalNetto).toBe(ohne.subtotalNetto + 17);
  });
});

describe('Namensvergleich', () => {
  it('ignoriert Gross-/Kleinschreibung und Leerraum', async () => {
    expect(normName('  Eckventil   1/2  Zoll ')).toBe(normName('eckventil 1/2 zoll'));
  });
});
