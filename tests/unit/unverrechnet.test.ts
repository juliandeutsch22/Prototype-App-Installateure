import { describe, it, expect } from 'vitest';
import { pauschaleVerrechnetMit } from '@/features/invoices/pauschale';
import {
  inAbgerechnetemZeitraum,
  nichtVerrechnetJeBaustelle,
  inVerrechneterPauschale,
  unverrechneteScheine,
  unverrechneteStundenZeilen,
  auffaellige,
  AUFFAELLIG_AB_TAGEN,
} from '@/features/worksheets/unverrechnet';
import type { Invoice, Project, WorkSheet } from '@/types';

/**
 * Unterschriebene Scheine, für die nie eine Rechnung geschrieben wurde.
 *
 * DIE LETZTE OFFENE STELLE IM KREIS. Der Weg vom Einsatz zum Geld war
 * durchgehend gebaut, aber niemand konnte sagen, WAS davon noch nicht durch
 * ist. Das ist kein Buchhaltungsfehler, den man später sieht — es ist Geld,
 * das schlicht nie eingefordert wird, und im Handwerk der klassische Weg,
 * wie ein gut ausgelasteter Betrieb trotzdem knapp bei Kasse ist.
 */

const HEUTE = '2026-09-08';

const schein = (
  id: string,
  datum: string,
  status: WorkSheet['status'] = 'Unterschrieben',
): WorkSheet & { id: string } =>
  ({
    id,
    companyId: 'perl',
    projectNumber: '2026-001',
    customerName: 'Huber',
    datum,
    status,
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max',
  }) as WorkSheet & { id: string };

const rechnung = (
  scheine: string[],
  paymentStatus: Invoice['paymentStatus'] = 'Offen',
): Pick<Invoice, 'linkedWorkSheets' | 'paymentStatus'> => ({
  linkedWorkSheets: scheine,
  paymentStatus,
});

describe('Was als unverrechnet gilt', () => {
  it('nennt einen unterschriebenen Schein ohne Rechnung', () => {
    const offen = unverrechneteScheine([schein('s1', '2026-09-01')], [], HEUTE);
    expect(offen.map((z) => z.schein.id)).toEqual(['s1']);
    expect(offen[0].tage).toBe(7);
  });

  it('lässt einen verrechneten Schein weg', () => {
    const offen = unverrechneteScheine([schein('s1', '2026-09-01')], [rechnung(['s1'])], HEUTE);
    expect(offen).toEqual([]);
  });

  /*
    ENTWÜRFE UND STORNIERTE SCHEINE GEHÖREN NICHT HIERHER. Ein Entwurf ist
    noch keine Leistung, ein Storno ist zurückgenommen. Stünden sie in der
    Liste, wäre sie nach zwei Wochen so voll, dass niemand mehr hinsieht —
    und dann fällt auch der echte Fall nicht mehr auf.
  */
  it('lässt Entwürfe, Verworfenes und Stornos weg', () => {
    const offen = unverrechneteScheine(
      [
        schein('s1', '2026-09-01', 'Entwurf'),
        schein('s2', '2026-09-01', 'Storniert'),
        schein('s3', '2026-09-01', 'Verworfen'),
      ],
      [],
      HEUTE,
    );
    expect(offen).toEqual([]);
  });

  /*
    DER KERN, und er ist leicht zu übersehen: wer eine Rechnung STORNIERT,
    nimmt die Forderung zurück — die Leistung steht dann wieder offen.
    Zählte der Storno als Verrechnung, verschwände genau die Arbeit aus der
    Liste, die am ehesten vergessen wird.
  */
  it('gibt die Scheine einer stornierten Rechnung wieder frei', () => {
    const offen = unverrechneteScheine(
      [schein('s1', '2026-09-01')],
      [rechnung(['s1'], 'Storniert')],
      HEUTE,
    );
    expect(offen.map((z) => z.schein.id)).toEqual(['s1']);
  });

  it('lässt ihn weg, sobald eine gültige Rechnung ihn wieder aufnimmt', () => {
    const offen = unverrechneteScheine(
      [schein('s1', '2026-09-01')],
      [rechnung(['s1'], 'Storniert'), rechnung(['s1'], 'Offen')],
      HEUTE,
    );
    expect(offen).toEqual([]);
  });

  it('kommt mit einer Rechnung ohne verknüpfte Scheine zurecht', () => {
    // Eine reine Stundenrechnung verweist auf keinen Schein — das ist normal
    // und darf die Liste nicht leeren.
    const offen = unverrechneteScheine(
      [schein('s1', '2026-09-01')],
      [{ paymentStatus: 'Offen' }],
      HEUTE,
    );
    expect(offen.map((z) => z.schein.id)).toEqual(['s1']);
  });
});

describe('Die Reihenfolge', () => {
  it('stellt die ältesten nach oben', () => {
    // Eine Leistung von vorgestern ist normal, eine von vor drei Monaten ist
    // ein Befund.
    const offen = unverrechneteScheine(
      [schein('neu', '2026-09-06'), schein('alt', '2026-06-01'), schein('mittel', '2026-08-01')],
      [],
      HEUTE,
    );
    expect(offen.map((z) => z.schein.id)).toEqual(['alt', 'mittel', 'neu']);
  });
});

describe('Was auffällig lange offen ist', () => {
  it('zählt ab vier Wochen', () => {
    // Kürzer wäre Lärm: zwischen Einsatz und Rechnung liegt im Handwerk
    // regelmässig ein Monatsabschluss.
    const offen = unverrechneteScheine(
      [schein('grenze', '2026-08-11'), schein('knapp', '2026-08-12')],
      [],
      HEUTE,
    );
    expect(offen.find((z) => z.schein.id === 'grenze')!.tage).toBe(AUFFAELLIG_AB_TAGEN);
    expect(auffaellige(offen).map((z) => z.schein.id)).toEqual(['grenze']);
  });

  it('meldet nichts, wenn alles frisch ist', () => {
    const offen = unverrechneteScheine([schein('s1', '2026-09-06')], [], HEUTE);
    expect(auffaellige(offen)).toEqual([]);
  });
});

describe('unverrechnete Stunden der Regiebaustellen (23.10.2026)', () => {
  it('misst am ältesten offenen Tag und stellt die älteste Baustelle nach vorn', () => {
    const z = unverrechneteStundenZeilen([
      { projectNumber: 'B', aeltester: '2026-09-20' },
      { projectNumber: 'A', aeltester: '2026-08-01' },
    ], '2026-09-30');
    expect(z.map((x) => [x.stunden.projectNumber, x.tage])).toEqual([['A', 60], ['B', 10]]);
    expect(auffaellige(z).map((x) => x.stunden.projectNumber)).toEqual(['A']);
  });
});

/*
  SCHEINE IN EINER VERRECHNETEN PAUSCHALE (Befund 09.11.2026). Nach der
  Einzel- oder Schlussrechnung einer Pauschal- oder Einheitspreisbaustelle
  verweigert die Vorschau jede weitere Rechnung; ein danach unterschriebener
  Schein stand für immer unter „nicht verrechnet“. Die Regel steht hier,
  gefragt wird sie in `scheineAufRechnung` — so bekommen Startseite,
  Rechnungen und Scheinliste dieselbe Antwort.
*/
describe('In der verrechneten Pauschale enthalten', () => {
  const s = (id: string, projectNumber: string, status: WorkSheet['status'] = 'Unterschrieben') =>
    ({ id, projectNumber, status });
  const b = (projectNumber: string, billingMode: Project['billingMode']) => ({ projectNumber, billingMode });
  const r = (projectNumber: string, art?: Invoice['art'], paymentStatus: Invoice['paymentStatus'] = 'Offen') =>
    ({ projectNumber, art, paymentStatus });

  it('Pauschale mit Schlussrechnung: der Schein danach ist enthalten', () => {
    expect(inVerrechneterPauschale([s('a', '2026-1')], [b('2026-1', 'Pauschal')], [r('2026-1', 'schluss')])).toEqual(['a']);
  });

  it('Einheitspreis mit Einzelrechnung ebenso — eine Rechnung ohne Art ist eine Einzelrechnung', () => {
    expect(inVerrechneterPauschale([s('a', 'PR-2026-2')], [b('2026-2', 'Einheitspreis')], [r('pr-2026-2')])).toEqual(['a']);
  });

  it('Regie bleibt gezählt, auch mit Rechnung', () => {
    expect(inVerrechneterPauschale([s('a', '2026-3')], [b('2026-3', 'Regie')], [r('2026-3', 'schluss')])).toEqual([]);
  });

  it('Pauschale ohne Einzel- oder Schlussrechnung bleibt gezählt — Anzahlung, Teilrechnung und Storno verrechnen sie nicht', () => {
    expect(inVerrechneterPauschale(
      [s('a', '2026-4')],
      [b('2026-4', 'Pauschal')],
      [r('2026-4', 'anzahlung'), r('2026-4', 'teil'), r('2026-4', 'schluss', 'Storniert')],
    )).toEqual([]);
  });

  it('nur Unterschriebenes; eine Baustelle ohne Abrechnungsart ist keine Pauschale', () => {
    expect(inVerrechneterPauschale(
      [s('a', '2026-5', 'Entwurf'), s('b', '2026-6')],
      [b('2026-5', 'Pauschal'), b('2026-6', undefined)],
      [r('2026-5', 'schluss'), r('2026-6', 'schluss')],
    )).toEqual([]);
  });

  it('dieselbe Bedingung wie die Vorschau (`pauschaleVerrechnetMit`)', () => {
    const faelle: Array<[Invoice['art'] | undefined, Invoice['paymentStatus']]> = [
      [undefined, 'Offen'], ['einzel', 'Bezahlt'], ['schluss', 'Offen'], ['anzahlung', 'Offen'],
      ['teil', 'Offen'], ['schluss', 'Storniert'], ['einzel', 'Teilbezahlt'],
    ];
    for (const [art, paymentStatus] of faelle) {
      const rechnung = { projectNumber: 'PR-2026-7', invoiceNumber: 'RE-1', art, paymentStatus } as Invoice;
      const vorschau = pauschaleVerrechnetMit([rechnung], '2026-7') !== null;
      const hier = inVerrechneterPauschale([s('a', '2026-7')], [b('2026-7', 'Pauschal')], [rechnung]).length > 0;
      expect(hier, `${art} ${paymentStatus}`).toBe(vorschau);
    }
  });
});

/*
  SCHEINE OHNE MATERIAL IM ABGERECHNETEN ZEITRAUM (Gesamtanalyse 12.11.2026,
  A1). Bis dahin verknüpfte eine Rechnung nur Scheine mit Material; ein
  Schein nur mit Stunden galt danach für immer als „nicht verrechnet“.
  Gegenprobe: ohne `inAbgerechnetemZeitraum` (Rückgabe []) sind die Fälle der
  ersten Gruppe rot, die Erhaltung grün.
*/
describe('Im abgerechneten Zeitraum (A1)', () => {
  const regie = (p: Partial<Invoice> = {}) => ({
    projectNumber: '2026-001', paymentStatus: 'Offen' as Invoice['paymentStatus'], art: 'einzel' as Invoice['art'],
    leistungVon: '2026-08-01', leistungBis: '2026-08-31', invoiceDate: '2026-09-02',
    linkedEntries: ['t1'], linkedOrders: [], linkedWorkSheets: [], ...p,
  });
  const mitMaterial = (id: string, datum: string) =>
    ({ ...schein(id, datum), material: [{ name: 'Eckventil', menge: 1 }] }) as WorkSheet & { id: string };

  it('nennt einen Schein nur mit Stunden im Zeitraum einer Rechnung, die Belege verbraucht hat', () => {
    expect(inAbgerechnetemZeitraum([schein('s1', '2026-08-15')], [regie()])).toEqual(['s1']);
  });

  it('der erste und der letzte Tag gehören dazu; ohne „Leistung bis“ gilt das Rechnungsdatum', () => {
    expect(inAbgerechnetemZeitraum([schein('a', '2026-08-01'), schein('z', '2026-08-31')], [regie()])).toEqual(['a', 'z']);
    expect(inAbgerechnetemZeitraum([schein('s', '2026-07-01')], [regie({ leistungVon: undefined, leistungBis: undefined })]))
      .toEqual(['s']);
  });

  it('gleicht die Schreibweise der Nummer an (mit und ohne „PR-“)', () => {
    expect(inAbgerechnetemZeitraum([{ ...schein('s1', '2026-08-15'), projectNumber: 'PR-2026-001' }], [regie()]))
      .toEqual(['s1']);
  });

  it('Erhaltung: Material, außerhalb, andere Baustelle, Storno, Anzahlung, ohne Belege, Entwurf', () => {
    const scheine = [
      mitMaterial('mat', '2026-08-15'),
      schein('nach', '2026-09-01'),
      schein('vor', '2026-07-31'),
      { ...schein('fremd', '2026-08-15'), projectNumber: '2026-002' },
      schein('entwurf', '2026-08-15', 'Entwurf'),
    ];
    expect(inAbgerechnetemZeitraum(scheine, [regie()])).toEqual([]);
    const s = [schein('s1', '2026-08-15')];
    expect(inAbgerechnetemZeitraum(s, [regie({ paymentStatus: 'Storniert' })])).toEqual([]);
    expect(inAbgerechnetemZeitraum(s, [regie({ art: 'anzahlung' })])).toEqual([]);
    expect(inAbgerechnetemZeitraum(s, [regie({ linkedEntries: [] })])).toEqual([]);
  });

  it('eine Materialzeile ohne Menge oder Namen ist kein Material', () => {
    const leer = { ...schein('s1', '2026-08-15'), material: [{ name: ' ', menge: 2 }, { name: 'Rohr', menge: 0 }] };
    expect(inAbgerechnetemZeitraum([leer as WorkSheet & { id: string }], [regie()])).toEqual(['s1']);
  });
});

/*
  EINE ZEILE JE BAUSTELLE (A2): Schein und Stunden derselben Baustelle
  standen doppelt da. Gegenprobe: mit zwei Zeilen je Baustelle (der alte
  Weg) ist der erste Fall rot.
*/
describe('Nicht verrechnet je Baustelle (A2)', () => {
  const std = (projectNumber: string, aeltester: string, kunde = 'Huber') =>
    ({ stunden: { projectNumber, kunde, minuten: 510, aeltester }, tage: 0 });

  it('führt Schein und Stunden derselben Baustelle als eine Zeile, gemessen am ältesten Beleg', () => {
    const zeilen = nichtVerrechnetJeBaustelle(
      [{ schein: schein('s1', '2026-09-01'), tage: 7 }, { schein: schein('s2', '2026-08-20'), tage: 19 }],
      [{ ...std('PR-2026-001', '2026-08-01'), tage: 38 }],
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ projectNumber: '2026-001', tage: 38, aeltesterSchein: '2026-08-20', kunde: 'Huber' });
    expect(zeilen[0].scheine.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(zeilen[0].stunden?.minuten).toBe(510);
  });

  it('verschiedene Baustellen bleiben getrennt, älteste zuerst', () => {
    const zeilen = nichtVerrechnetJeBaustelle(
      [{ schein: schein('s1', '2026-09-01'), tage: 7 }],
      [{ ...std('2026-009', '2026-07-01', 'Gruber'), tage: 69 }],
    );
    expect(zeilen.map((z) => [z.projectNumber, z.kunde, z.tage])).toEqual([['2026-009', 'Gruber', 69], ['2026-001', 'Huber', 7]]);
    expect(zeilen[0].scheine).toEqual([]);
    expect(zeilen[1].stunden).toBeNull();
  });
});
