import { describe, it, expect } from 'vitest';
import {
  darfMahnen,
  naechsteStufe,
  spesenFuer,
  TEXTE,
  MAHNSTUFEN,
} from '@/features/invoices/mahnung';
import type { Invoice } from '@/types';

/**
 * Das Mahnwesen.
 *
 * WAS ES VORHER GAB: den Status „Überfällig". Er wurde beim Öffnen der
 * Ansicht gesetzt und angezeigt — mehr nicht. Kein Mahndatum, keine Stufe,
 * kein Schreiben an den Kunden. Der Betrieb sah, dass Geld aussteht, und
 * führte das Mahnen selbst im Kopf.
 */

const HEUTE = '2026-09-20';

function rg(z: Partial<Invoice> = {}): Invoice {
  return {
    id: 'r1',
    companyId: 'perl',
    invoiceNumber: 'RE-2026-0001',
    projectNumber: 'B-001',
    customerName: 'Huber',
    invoiceDate: '2026-08-20',
    dueDate: '2026-09-03',
    totalNetto: 100,
    totalVat: 20,
    totalBrutto: 120,
    paymentStatus: 'Offen',
    ...z,
  } as Invoice;
}

describe('Wann gemahnt werden darf', () => {
  it('sobald das Zahlungsziel abgelaufen ist', () => {
    expect(darfMahnen(rg(), HEUTE).moeglich).toBe(true);
  });

  it('am Fälligkeitstag selbst noch nicht', () => {
    // Wer am letzten Tag zahlt, zahlt pünktlich.
    expect(darfMahnen(rg({ dueDate: HEUTE }), HEUTE).moeglich).toBe(false);
  });

  it('nicht bei einer bezahlten Rechnung', () => {
    expect(darfMahnen(rg({ paymentStatus: 'Bezahlt' }), HEUTE).moeglich).toBe(false);
  });

  it('nicht bei einer stornierten', () => {
    expect(darfMahnen(rg({ paymentStatus: 'Storniert' }), HEUTE).moeglich).toBe(false);
  });

  it('richtet sich nach dem DATUM, nicht nach dem Status', () => {
    /*
      „Überfällig" wird beim Öffnen der Liste gesetzt. Wer sie heute noch
      nicht geöffnet hat, hätte sonst eine fällige Rechnung, die sich nicht
      mahnen lässt — der Status ist eine Anzeige, das Datum ist die Tatsache.
    */
    const nochOffen = rg({ paymentStatus: 'Offen', dueDate: '2026-09-03' });
    expect(darfMahnen(nochOffen, HEUTE).moeglich).toBe(true);
  });

  it('sagt, warum nicht', () => {
    // Ein gesperrter Knopf ohne Begründung ist eine Sackgasse.
    expect(darfMahnen(rg({ paymentStatus: 'Bezahlt' }), HEUTE).grund).toContain('bezahlt');
    expect(darfMahnen(rg({ dueDate: '2026-12-01' }), HEUTE).grund).toContain('Zahlungsziel');
  });
});

describe('Die Stufen', () => {
  it('gehen von eins bis drei', () => {
    expect(naechsteStufe(rg())).toBe(1);
    expect(naechsteStufe(rg({ mahnstufe: 1 }))).toBe(2);
    expect(naechsteStufe(rg({ mahnstufe: 2 }))).toBe(3);
  });

  it('enden nach der dritten', () => {
    /*
      Was dann folgt, entscheidet nicht diese App, sondern ein Mensch mit
      einem Anwalt oder einem Inkassobüro. Eine vierte Mahnung wäre ein
      Schreiben, das seine eigene Ankündigung widerruft.
    */
    expect(naechsteStufe(rg({ mahnstufe: 3 }))).toBeNull();
    expect(darfMahnen(rg({ mahnstufe: 3 }), HEUTE).moeglich).toBe(false);
    expect(darfMahnen(rg({ mahnstufe: 3 }), HEUTE).grund).toContain('dritte Mahnung');
  });

  it('haben für jede einen eigenen Text', () => {
    for (const s of MAHNSTUFEN) {
      expect(TEXTE[s].titel.length).toBeGreaterThan(0);
      expect(TEXTE[s].anrede.length).toBeGreaterThan(0);
      expect(TEXTE[s].frist('01.10.2026')).toContain('01.10.2026');
    }
  });

  it('werden im Ton schärfer, nicht gleich laut', () => {
    /*
      Die erste geht davon aus, dass es übersehen wurde — das ist in den
      meisten Fällen die Wahrheit, und ein scharfer Ton bei der ersten
      Nachfrage kostet Kunden, die einfach im Urlaub waren.
    */
    expect(TEXTE[1].titel).toBe('Zahlungserinnerung');
    expect(TEXTE[1].anrede).toContain('untergegangen');
    expect(TEXTE[3].titel).toBe('Letzte Mahnung');
    expect(TEXTE[3].frist('x')).toContain('aus der Hand');
  });
});

describe('Mahnspesen', () => {
  it('sind null, solange der Betrieb nichts festgelegt hat', () => {
    // KEINE Vorgabe mit einer erfundenen Zahl: was ein Betrieb verrechnen
    // darf, hängt am Aufwand und am Vertrag.
    expect(spesenFuer(1, undefined)).toBe(0);
    expect(spesenFuer(2, [])).toBe(0);
  });

  it('kommen je Stufe aus der Einstellung', () => {
    expect(spesenFuer(1, [0, 5, 15])).toBe(0);
    expect(spesenFuer(2, [0, 5, 15])).toBe(5);
    expect(spesenFuer(3, [0, 5, 15])).toBe(15);
  });

  it('behandeln Unsinn wie „nicht gesetzt"', () => {
    // Ein negativer Betrag auf einer Mahnung wäre eine Gutschrift.
    expect(spesenFuer(1, [-5])).toBe(0);
    expect(spesenFuer(1, [Number.NaN])).toBe(0);
  });
});
