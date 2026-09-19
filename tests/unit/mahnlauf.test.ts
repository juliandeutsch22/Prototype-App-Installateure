import { describe, it, expect } from 'vitest';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import type { Invoice } from '@/types';

/**
 * Der Mahnlauf.
 *
 * Die Stufen stimmten, die Belege stimmten — nur kam niemand dorthin. Wer
 * wissen wollte, was zu mahnen ist, filterte auf „Überfällig", ging die Liste
 * durch, öffnete an jeder Zeile das Menü und prüfte im Kopf, ob die dritte
 * Mahnung schon draussen war. Deshalb bleibt Mahnwesen in kleinen Betrieben
 * liegen: nicht das Schreiben ist die Arbeit, das ZUSAMMENSTELLEN ist es.
 */

const HEUTE = '2026-09-07';

const rechnung = (p: Partial<Invoice> & { id: string }): Invoice & { id: string } =>
  ({
    companyId: 'perl',
    invoiceNumber: `RE-2026-${p.id}`,
    projectNumber: '2026-001',
    customerName: 'Huber',
    invoiceDate: '2026-07-01',
    dueDate: '2026-08-01',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    paymentStatus: 'Überfällig',
    ...p,
  }) as unknown as Invoice & { id: string };

describe('Was in den Lauf kommt', () => {
  it('nimmt überfällige offene Rechnungen und schlägt die nächste Stufe vor', () => {
    const l = mahnlauf([rechnung({ id: '1' })], HEUTE, undefined);
    expect(l.zeilen).toHaveLength(1);
    expect(l.zeilen[0].stufe).toBe(1);
    expect(l.zeilen[0].tageUeberfaellig).toBe(37);
  });

  it('zählt von der zweiten auf die dritte Stufe weiter', () => {
    const l = mahnlauf([rechnung({ id: '1', mahnstufe: 2 })], HEUTE, undefined);
    expect(l.zeilen[0].stufe).toBe(3);
  });

  /*
    DIE FÄLLIGKEIT ENTSCHEIDET, NICHT DER STATUS. „Überfällig" wird beim
    Öffnen der Rechnungsliste gesetzt; wer sie heute noch nicht geöffnet hat,
    hätte sonst eine fällige Rechnung, die im Lauf fehlt.
  */
  it('nimmt auch eine, die noch als „Offen" dasteht', () => {
    const l = mahnlauf([rechnung({ id: '1', paymentStatus: 'Offen' })], HEUTE, undefined);
    expect(l.zeilen).toHaveLength(1);
  });

  it('lässt Bezahltes, Storniertes und noch nicht Fälliges liegen', () => {
    const l = mahnlauf(
      [
        rechnung({ id: '1', paymentStatus: 'Bezahlt' }),
        rechnung({ id: '2', paymentStatus: 'Storniert' }),
        rechnung({ id: '3', dueDate: '2026-12-01', paymentStatus: 'Offen' }),
      ],
      HEUTE,
      undefined,
    );
    expect(l.zeilen).toHaveLength(0);
    expect(l.ausgereizt).toHaveLength(0);
  });

  it('lässt eine heute erst fällige Rechnung noch liegen', () => {
    // Am Fälligkeitstag selbst ist nichts überfällig — der Kunde hat den Tag.
    const l = mahnlauf([rechnung({ id: '1', dueDate: HEUTE })], HEUTE, undefined);
    expect(l.zeilen).toHaveLength(0);
  });
});

/**
 * Die Reihenfolge ist die Aussage.
 */
describe('Die Reihenfolge', () => {
  it('stellt die weit fortgeschrittenen nach oben, nicht die ältesten', () => {
    // Eine Forderung vor der letzten Mahnung ist dringender als eine, die
    // gerade erst die Frist überschritten hat — auch wenn jene älter ist.
    const l = mahnlauf(
      [
        rechnung({ id: 'jung', mahnstufe: 2, dueDate: '2026-09-01' }),
        rechnung({ id: 'alt', dueDate: '2026-01-01' }),
      ],
      HEUTE,
      undefined,
    );
    expect(l.zeilen.map((z) => z.rechnung.id)).toEqual(['jung', 'alt']);
  });

  it('entscheidet bei gleicher Stufe nach Alter', () => {
    const l = mahnlauf(
      [
        rechnung({ id: 'neu', dueDate: '2026-09-01' }),
        rechnung({ id: 'alt', dueDate: '2026-02-01' }),
      ],
      HEUTE,
      undefined,
    );
    expect(l.zeilen.map((z) => z.rechnung.id)).toEqual(['alt', 'neu']);
  });

  it('entscheidet bei gleichem Alter nach Betrag', () => {
    // 12.000 € gehen vor 80 €, wenn beide gleich lange offen sind.
    const l = mahnlauf(
      [
        rechnung({ id: 'klein', totalBrutto: 80 }),
        rechnung({ id: 'gross', totalBrutto: 12000 }),
      ],
      HEUTE,
      undefined,
    );
    expect(l.zeilen.map((z) => z.rechnung.id)).toEqual(['gross', 'klein']);
  });
});

/**
 * Wo die App aufhört.
 */
describe('Die ausgereizten Forderungen', () => {
  /*
    NACH DER DRITTEN MAHNUNG ENTSCHEIDET EIN MENSCH — Anwalt, Inkasso oder
    abschreiben. Fielen diese Rechnungen stillschweigend aus dem Lauf, wären
    ausgerechnet die ältesten Forderungen die unsichtbarsten.
  */
  it('nennt sie getrennt, statt sie zu verschlucken', () => {
    const l = mahnlauf([rechnung({ id: '1', mahnstufe: 3 })], HEUTE, undefined);
    expect(l.zeilen).toHaveLength(0);
    expect(l.ausgereizt.map((i) => i.id)).toEqual(['1']);
  });

  it('führt eine bezahlte dritte Mahnung nicht als offene Entscheidung', () => {
    // Sonst stünde jede beglichene Altforderung dauerhaft unter „braucht eine
    // Entscheidung", und die Liste wäre nach einem Jahr unbrauchbar.
    const l = mahnlauf(
      [rechnung({ id: '1', mahnstufe: 3, paymentStatus: 'Bezahlt' })],
      HEUTE,
      undefined,
    );
    expect(l.ausgereizt).toHaveLength(0);
  });
});

/**
 * Was der Lauf zusammenzählt.
 */
describe('Die Summen', () => {
  it('zählt offene Beträge und Spesen der Stufe', () => {
    const l = mahnlauf(
      [
        rechnung({ id: '1', totalBrutto: 1200 }),
        rechnung({ id: '2', totalBrutto: 300.5, mahnstufe: 1 }),
      ],
      HEUTE,
      [5, 10, 20],
    );
    expect(l.summeOffen).toBe(1500.5);
    // Stufe 1 → 5 €, Stufe 2 → 10 €.
    expect(l.summeSpesen).toBe(15);
  });

  /*
    DIE ZAHL, UM DIE ES IN STUFE 10.1 GEHT. Vorher stand hier der
    Bruttobetrag, und der Mahnlauf forderte 1.000 €, obwohl 400 gekommen
    waren. Die Prüfung steht bei den Summen und nicht bei den Zeilen, weil
    genau die Summe auf dem Bildschirm des Büros steht.
  */
  it('rechnet mit dem Rest, nicht mit dem Rechnungsbetrag', () => {
    const l = mahnlauf(
      [rechnung({ id: '1', totalBrutto: 1000, bezahltBetrag: 400 })],
      HEUTE,
      undefined,
    );
    expect(l.zeilen[0].offen).toBe(600);
    expect(l.summeOffen).toBe(600);
  });

  it('lässt eine vollständig bezahlte Rechnung ganz aus dem Lauf', () => {
    const l = mahnlauf(
      [rechnung({ id: '1', totalBrutto: 1000, bezahltBetrag: 1000 })],
      HEUTE,
      undefined,
    );
    expect(l.zeilen).toHaveLength(0);
    expect(l.ausgereizt).toHaveLength(0);
  });

  it('rechnet ohne hinterlegte Spesen mit null, nicht mit einer Vorgabe', () => {
    // Was ein Betrieb verrechnen darf, hängt am Aufwand und am Vertrag. Eine
    // voreingestellte Zahl sähe aus wie eine Auskunft darüber.
    const l = mahnlauf([rechnung({ id: '1' })], HEUTE, undefined);
    expect(l.summeSpesen).toBe(0);
    expect(l.zeilen[0].spesen).toBe(0);
  });
});
