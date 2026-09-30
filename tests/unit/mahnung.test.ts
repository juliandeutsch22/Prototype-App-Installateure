import { describe, it, expect } from 'vitest';
import {
  basiszinsVerlauf,
  halbjahreZurWahl,
  zinssatzText,
  darfMahnen,
  naechsteStufe,
  spesenFuer,
  TEXTE,
  MAHNSTUFEN,
  verzugszinsen,
  halbjahresbeginn,
  mahnkosten,
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

describe('Verzugszinsen (B7)', () => {
  const basis = {
    stufe: 2 as const,
    rest: 1200,
    faellig: '2026-09-03',
    bis: '2026-10-03',
    unternehmer: false,
  };

  it('an Verbraucher 4 % im Jahr, vom Zahlungsziel bis zum Mahntag', () => {
    // 1.200 € × 4 % × 30/365 = 3,945… → 3,95 €
    expect(verzugszinsen(basis)).toEqual({
      art: 'berechnet', satz: 4, tage: 30, betrag: 3.95, grundlage: '§ 1000 ABGB',
    });
  });

  it('an Unternehmer 9,2 Punkte über dem Basiszinssatz des Halbjahres', () => {
    const z = verzugszinsen({ ...basis, unternehmer: true, basiszinssatz: 1.53, basiszinssatzAb: '2026-07-01' });
    // 1.200 € × 10,73 % × 30/365 = 10,583… → 10,58 €
    expect(z).toEqual({ art: 'berechnet', satz: 10.73, tage: 30, betrag: 10.58, grundlage: '§ 456 UGB' });
  });

  it('reicht der Verzug ins Vorhalbjahr, wird erst ab dem eingetragenen gerechnet', () => {
    // Fällig 03.06., Mahnung 03.10.: der Satz ab 01.07. ist bekannt, der davor nicht.
    // 01.07.–03.10. sind 95 Tage: 1.200 € × 10,73 % × 95/365 = 33,51 €.
    const z = verzugszinsen({
      ...basis, faellig: '2026-06-03', unternehmer: true, basiszinssatz: 1.53, basiszinssatzAb: '2026-07-01',
    });
    expect(z).toEqual({ art: 'berechnet', satz: 10.73, tage: 95, betrag: 33.51, grundlage: '§ 456 UGB', ab: '2026-07-01' });
    // An Verbraucher gilt 4 % durchgehend — ohne Kürzung.
    expect(verzugszinsen({ ...basis, faellig: '2026-06-03' })).toMatchObject({ tage: 122 });
  });

  it('ein negativer Basiszinssatz senkt den Satz, statt zu verschwinden', () => {
    const z = verzugszinsen({ ...basis, unternehmer: true, basiszinssatz: -0.62, basiszinssatzAb: '2026-07-01' });
    expect(z).toMatchObject({ art: 'berechnet', satz: 8.58 });
  });

  it('ohne Basiszinssatz für das Halbjahr der Mahnung rechnet sie an Unternehmer nichts — und sagt es', () => {
    expect(verzugszinsen({ ...basis, unternehmer: true })).toEqual({ art: 'fehlt' });
    // Der Satz des Vorhalbjahres ist veraltet …
    expect(verzugszinsen({ ...basis, unternehmer: true, basiszinssatz: 1.53, basiszinssatzAb: '2026-01-01' }))
      .toEqual({ art: 'fehlt' });
    // … und einer, der erst ab dem nächsten gilt, noch nicht gültig.
    expect(verzugszinsen({ ...basis, unternehmer: true, basiszinssatz: 1.53, basiszinssatzAb: '2027-01-01' }))
      .toEqual({ art: 'fehlt' });
    // Ohne Stand zählt die Zahl nicht.
    expect(verzugszinsen({ ...basis, unternehmer: true, basiszinssatz: 1.53 })).toEqual({ art: 'fehlt' });
  });

  /*
    TESTBERICHT 30.09.2026, G30 — der Verlauf je Halbjahr. Für eine ältere
    Forderung zählt jeder Tag mit dem Satz seines Halbjahres.
  */
  it('rechnet über zwei Halbjahre mit dem jeweiligen Satz', () => {
    // 04.06.–30.06.: 27 Tage × 11,2 %; 01.07.–03.10.: 95 Tage × 10,73 %.
    // 1.200 × (0,112 × 27 + 0,1073 × 95) / 365 = 9,94 + 33,51 = 43,45 €
    const z = verzugszinsen({
      ...basis, faellig: '2026-06-03', unternehmer: true,
      basiszinssaetze: [{ ab: '2026-01-01', satz: 2 }, { ab: '2026-07-01', satz: 1.53 }],
    });
    expect(z).toEqual({
      art: 'berechnet', satz: 10.73, tage: 122, betrag: 43.45, grundlage: '§ 456 UGB',
      abschnitte: [
        { von: '2026-06-04', bis: '2026-06-30', satz: 11.2, tage: 27 },
        { von: '2026-07-01', bis: '2026-10-03', satz: 10.73, tage: 95 },
      ],
    });
  });

  it('nimmt den alten Einzelsatz in den Verlauf und die Liste vor ihn', () => {
    expect(basiszinsVerlauf({
      basiszinssatz: 1.53, basiszinssatzAb: '2026-07-01',
      basiszinssaetze: [{ ab: '2026-01-01', satz: 2 }, { ab: '2026-07-01', satz: 1.6 }],
    })).toEqual([{ ab: '2026-01-01', satz: 2 }, { ab: '2026-07-01', satz: 1.6 }]);
  });

  it('Gegenprobe: eine Lücke davor kürzt, und gleiche Sätze bleiben eine Zeile', () => {
    const luecke = verzugszinsen({
      ...basis, faellig: '2025-11-03', unternehmer: true,
      basiszinssaetze: [{ ab: '2025-07-01', satz: 2 }, { ab: '2026-07-01', satz: 1.53 }],
    });
    // 01.01.–30.06.2026 fehlt: gerechnet wird erst ab 01.07.2026.
    expect(luecke).toMatchObject({ art: 'berechnet', ab: '2026-07-01', tage: 95 });
    expect(luecke).not.toHaveProperty('abschnitte');

    const gleich = verzugszinsen({
      ...basis, faellig: '2026-06-03', unternehmer: true,
      basiszinssaetze: [{ ab: '2026-01-01', satz: 1.53 }, { ab: '2026-07-01', satz: 1.53 }],
    });
    expect(gleich).toEqual({ art: 'berechnet', satz: 10.73, tage: 122, betrag: 43.04, grundlage: '§ 456 UGB' });
  });

  it('nennt den Satz je Halbjahr im Text', () => {
    const z = verzugszinsen({
      ...basis, faellig: '2026-06-03', unternehmer: true,
      basiszinssaetze: [{ ab: '2026-01-01', satz: 2 }, { ab: '2026-07-01', satz: 1.53 }],
    });
    if (z.art !== 'berechnet') throw new Error('erwartet berechnet');
    expect(zinssatzText(z, (d) => d)).toBe('11,2 % vom 2026-06-04 bis 2026-06-30, 10,73 % vom 2026-07-01 bis 2026-10-03 p. a.');
  });

  it('bietet Halbjahre bis fünfzehn Jahre zurück und das nächste an', () => {
    const wahl = halbjahreZurWahl('2026-09-30');
    expect(wahl[0]).toBe('2027-01-01');
    expect(wahl).toContain('2011-01-01');
    expect(wahl).not.toContain('2027-07-01');
  });

  it('nicht auf der Zahlungserinnerung, nicht ohne Rest, nicht vor dem Ziel', () => {
    expect(verzugszinsen({ ...basis, stufe: 1 })).toEqual({ art: 'keine' });
    expect(verzugszinsen({ ...basis, rest: 0 })).toEqual({ art: 'keine' });
    expect(verzugszinsen({ ...basis, bis: '2026-09-03' })).toEqual({ art: 'keine' });
    expect(verzugszinsen({ ...basis, faellig: undefined })).toEqual({ art: 'keine' });
  });

  it('der Halbjahresbeginn', () => {
    expect(halbjahresbeginn('2026-06-30')).toBe('2026-01-01');
    expect(halbjahresbeginn('2026-07-01')).toBe('2026-07-01');
    expect(halbjahresbeginn('2026-12-31')).toBe('2026-07-01');
  });
});

describe('Mahnkosten je Kundenart', () => {
  it('ohne eigene Sätze für Privatkunden gelten die gemeinsamen — die Trennung ändert nichts still', () => {
    const saetze = { mahnspesen: [0, 10, 20] };
    expect(mahnkosten(2, saetze, false)).toEqual({ spesen: 10, pauschale: 0 });
    expect(mahnkosten(2, saetze, true)).toEqual({ spesen: 10, pauschale: 0 });
  });

  it('eigene Sätze für Privatkunden gelten nur für sie', () => {
    const saetze = { mahnspesen: [0, 10, 20], mahnspesenVerbraucher: [0, 3, 5] };
    expect(mahnkosten(2, saetze, false)).toEqual({ spesen: 3, pauschale: 0 });
    expect(mahnkosten(2, saetze, true)).toEqual({ spesen: 10, pauschale: 0 });
  });

  it('die Pauschale nach § 458 UGB ersetzt bei Firmenkunden die Spesen — ab der Mahnung', () => {
    const saetze = { mahnspesen: [5, 10, 20], mahnspesenVerbraucher: [0, 3, 5], pauschale458: true };
    expect(mahnkosten(1, saetze, true)).toEqual({ spesen: 0, pauschale: 0 });
    expect(mahnkosten(2, saetze, true)).toEqual({ spesen: 0, pauschale: 40 });
    expect(mahnkosten(3, saetze, true)).toEqual({ spesen: 0, pauschale: 40 });
    // Privatkunden bekommen nie die Pauschale.
    expect(mahnkosten(2, saetze, false)).toEqual({ spesen: 3, pauschale: 0 });
  });

  it('ohne Einstellungen kostet eine Mahnung nichts', () => {
    expect(mahnkosten(3, undefined, true)).toEqual({ spesen: 0, pauschale: 0 });
  });
});
