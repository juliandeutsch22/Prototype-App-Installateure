import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { darfMahnen, laufendeFrist, FRIST_TAGE } from '@/features/invoices/mahnung';
import { mahnlauf } from '@/features/invoices/mahnlauf';
import type { Invoice } from '@/types';

/**
 * Die Frist, die der Betrieb dem Kunden selbst gesetzt hat.
 *
 * DER FEHLER, DEN ERST DAS ABZEICHEN AUFGEDECKT HAT. Geprüft wurde nur das
 * ursprüngliche Zahlungsziel. Wer gestern eine Zahlungserinnerung mit einer
 * Woche Frist verschickt hat, bekam die Rechnung heute wieder im Mahnlauf
 * angeboten — für Stufe 2, sechs Tage vor Ablauf der eigenen Zusage.
 *
 * Solange das nur eine Liste war, sah es aus wie Arbeit. Als Zahl im Menü
 * wäre es eine Zahl, die JEDEN TAG leuchtet, solange auch nur eine Rechnung
 * überfällig ist — und damit keine Meldung mehr, sondern Tapete.
 */

const HEUTE = '2026-09-16';

const rg = (f: Partial<Invoice> = {}) =>
  ({
    paymentStatus: 'Überfällig',
    dueDate: '2026-08-01',
    totalBrutto: 1000,
    mahnstufe: 0,
    ...f,
  }) as Invoice & { id: string };

describe('Die laufende Frist', () => {
  it('läuft nicht, solange noch nie gemahnt wurde', () => {
    expect(laufendeFrist(rg())).toBeNull();
  });

  it('ist die eingetragene Frist der letzten Mahnung', () => {
    expect(laufendeFrist(rg({ mahnstufe: 1, gemahntAm: '2026-09-15', mahnfrist: '2026-09-22' })))
      .toBe('2026-09-22');
  });

  it('ohne eingetragene Frist: das Mahndatum plus die Vorgabe des Belegs', () => {
    /*
      Eine ältere Mahnung trägt womöglich keine Frist — die Spalte kam später
      dazu. Der Beleg schlägt sieben Tage vor, und die hat der Kunde auf dem
      Papier gelesen; sie hier zu ignorieren hiesse, ihm eine Frist zu
      nehmen, die er schwarz auf weiss hat.
    */
    expect(laufendeFrist(rg({ mahnstufe: 1, gemahntAm: '2026-09-10' })))
      .toBe('2026-09-17');
    expect(FRIST_TAGE).toBe(7);
  });

  it('ohne jede Angabe: keine laufende Frist — die Forderung bleibt sichtbar', () => {
    /*
      DIE ANDERE WAHL WÄRE SCHLIMMER. „Im Zweifel läuft eine Frist" hiesse:
      eine Rechnung mit kaputtem Mahnsatz verschwindet für immer aus dem
      Mahnlauf, und zwar lautlos.
    */
    expect(laufendeFrist(rg({ mahnstufe: 2 }))).toBeNull();
    expect(darfMahnen(rg({ mahnstufe: 2 }), HEUTE).moeglich).toBe(true);
  });
});

describe('Gemahnt wird erst, wenn die eigene Frist abgelaufen ist', () => {
  it('nicht am Tag nach der Mahnung', () => {
    const p = darfMahnen(
      rg({ mahnstufe: 1, gemahntAm: '2026-09-15', mahnfrist: '2026-09-22' }), HEUTE,
    );
    expect(p.moeglich).toBe(false);
    expect(p.grund).toContain('2026-09-22');
  });

  it('nicht am letzten Tag der Frist — der Tag gehört noch dem Kunden', () => {
    expect(darfMahnen(rg({ mahnstufe: 1, mahnfrist: HEUTE }), HEUTE).moeglich).toBe(false);
  });

  it('am Tag danach schon', () => {
    expect(darfMahnen(rg({ mahnstufe: 1, mahnfrist: '2026-09-15' }), HEUTE).moeglich).toBe(true);
  });

  it('und der Mahnlauf lässt sie deshalb aus', () => {
    const laufend = rg({ id: 'a', mahnstufe: 1, mahnfrist: '2026-09-22' });
    const reif = rg({ id: 'b', mahnstufe: 1, mahnfrist: '2026-09-01' });

    const lauf = mahnlauf([laufend, reif], HEUTE, undefined);

    expect(lauf.zeilen.map((z) => z.rechnung.id)).toEqual(['b']);
    /*
      UND SIE FÄLLT NICHT IN „AUSGEREIZT". Dort stehen die Forderungen, bei
      denen die dritte Mahnung heraus ist und ein Mensch entscheiden muss.
      Eine Rechnung, deren Frist noch läuft, gehört in keine der beiden
      Listen — sie ist schlicht noch nicht dran.
    */
    expect(lauf.ausgereizt).toHaveLength(0);
  });
});

describe('Dieselbe Regel steht in der Datenbank', () => {
  /*
    ZWEI ORTE, EINE REGEL — und genau das ist die Gefahr. Das Abzeichen im
    Menü zählt in Postgres (`app.mahnung_faellig`), die Liste rechnet im
    Browser. Laufen sie auseinander, steht im Menü eine Drei und in der Liste
    stehen zwei Zeilen; danach glaubt niemand mehr der Zahl.
  */
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260916140000_offene_posten.sql'), 'utf8',
  );

  it('kennt die Frist aus der letzten Mahnung', () => {
    expect(sql).toMatch(/coalesce\(p_frist,\s*p_gemahnt \+ \d+,\s*p_faellig\) < p_heute/);
  });

  it('und rechnet mit derselben Zahl von Tagen wie der Beleg', () => {
    const treffer = sql.match(/coalesce\(p_frist,\s*p_gemahnt \+ (\d+)/);
    expect(treffer).not.toBeNull();
    expect(Number(treffer![1])).toBe(FRIST_TAGE);
  });
});
