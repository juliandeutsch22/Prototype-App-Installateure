import { describe, it, expect } from 'vitest';
import {
  unverrechneteScheine,
  auffaellige,
  AUFFAELLIG_AB_TAGEN,
} from '@/features/worksheets/unverrechnet';
import type { Invoice, WorkSheet } from '@/types';

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
