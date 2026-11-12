/**
 * Mehrere Tage, Kopieren und die Meldung an den Monteur (B4, B6, F2, E85).
 *
 * Geprüft wird, was der Planer nach dem Speichern liest und was der Monteur
 * im Sperrbildschirm sieht — beides muss stimmen, ohne dass jemand die
 * Datenbank fragt.
 */
import { describe, it, expect } from 'vitest';
import { folgeBericht, naechsterWerktag, tagDanach, tageEinschliesslich, FOLGETAGE_HOECHSTENS } from '@/features/assignments/folgetage';
import type { FolgeTag } from '@/lib/db/assignments';
import { textEinsatzplan, willMeldung } from '@shared/notifyLogic';

const tag = (datum: string, ergebnis: FolgeTag['ergebnis'], mehr: Partial<FolgeTag> = {}): FolgeTag => ({
  datum, ergebnis, eingeteilt: [], abwesend: [], anderswo: [], ...mehr,
});

describe('Kalendertage', () => {
  it('rechnet über Monats- und Jahresgrenzen ohne Zeitzone', () => {
    expect(tagDanach('2026-11-30')).toBe('2026-12-01');
    expect(tagDanach('2026-12-31')).toBe('2027-01-01');
    // Umstellung auf Sommerzeit: der Tag bleibt ein Tag.
    expect(tagDanach('2027-03-27')).toBe('2027-03-28');
    expect(tagDanach('2027-03-28')).toBe('2027-03-29');
    expect(tageEinschliesslich('2026-11-12', '2026-11-12')).toBe(1);
    expect(tageEinschliesslich('2027-03-27', '2027-04-02')).toBe(7);
  });

  it('das Fenster der Abwesenheitsprüfung ist die Grenze je Speichern', () => {
    expect(FOLGETAGE_HOECHSTENS).toBe(62);
  });
});

describe('Nächster Werktag beim Kopieren', () => {
  it('Freitag kopiert auf Montag', () => {
    expect(naechsterWerktag('2026-11-13')).toBe('2026-11-16');
  });
  it('vor einem Feiertag auf den Tag danach (7.12. vor dem 8.12.)', () => {
    expect(naechsterWerktag('2026-12-07')).toBe('2026-12-09');
  });
  it('über Weihnachten: 23.12. → 28.12.', () => {
    // 24.12. ist ein Werktag (kein gesetzlicher Feiertag), 25./26. sind Feiertage.
    expect(naechsterWerktag('2026-12-23')).toBe('2026-12-24');
    expect(naechsterWerktag('2026-12-24')).toBe('2026-12-28');
  });
  it('ein gewöhnlicher Dienstag kopiert auf Mittwoch', () => {
    expect(naechsterWerktag('2026-11-10')).toBe('2026-11-11');
  });
});

describe('Bericht nach dem Speichern über mehrere Tage', () => {
  it('nur Tage, an denen etwas anders lief, stehen im Bericht', () => {
    const b = folgeBericht([
      tag('2026-11-16', 'geplant', { eingeteilt: ['Anna'] }),
      tag('2026-11-17', 'geplant', { eingeteilt: ['Anna'] }),
    ]);
    expect(b.geplant).toBe(2);
    expect(b.zeilen).toEqual([]);
  });

  it('Feiertag, Betriebsurlaub, alle abwesend, ergänzt, Abwesende und Doppelte werden genannt', () => {
    const b = folgeBericht([
      tag('2026-12-08', 'feiertag'),
      tag('2026-12-28', 'betriebsurlaub', { abwesend: ['Weihnachten'] }),
      tag('2026-11-18', 'alle_abwesend', { abwesend: ['Anna', 'Ben'] }),
      tag('2026-11-19', 'ergaenzt', { eingeteilt: ['Ben'] }),
      tag('2026-11-20', 'geplant', { eingeteilt: ['Ben'], abwesend: ['Anna'], anderswo: ['Ben'] }),
    ]);
    expect(b.geplant).toBe(2);
    expect(b.zeilen).toHaveLength(5);
    expect(b.zeilen[0]).toMatch(/Feiertag — ausgelassen/);
    expect(b.zeilen[1]).toMatch(/Betriebsurlaub \(„Weihnachten“\) — ausgelassen/);
    expect(b.zeilen[2]).toMatch(/alle abwesend — niemand eingeteilt/);
    // Bei „alle abwesend“ nicht noch einmal jede Person einzeln.
    expect(b.zeilen[2]).not.toMatch(/Anna, Ben abwesend/);
    expect(b.zeilen[3]).toMatch(/war schon geplant — ergänzt/);
    expect(b.zeilen[4]).toMatch(/Anna abwesend, nicht eingeteilt; Ben auch auf einer anderen Baustelle/);
  });

  it('ein ausgelassenes Wochenende ist die Wahl selbst und steht nicht da', () => {
    const b = folgeBericht([tag('2026-11-13', 'geplant'), tag('2026-11-16', 'geplant')]);
    expect(b.zeilen).toEqual([]);
  });
});

describe('Push bei geändertem Einsatzplan', () => {
  it('zeigt den Plan für heute und morgen, wie er jetzt ist', () => {
    const m = textEinsatzplan({
      uid: 'u1',
      heute: [{ nr: '2026-014', kunde: 'Huber', von: '07:00' }, { nr: '2026-015', kunde: 'Maier', von: null }],
      morgen: [],
    });
    expect(m.title).toBe('Dein Einsatzplan hat sich geändert');
    expect(m.body).toBe('Heute: 07:00 Huber, Maier · Morgen: kein Einsatz');
    expect(m.link).toBe('/my-schedule');
    // Eine Kennung je Person: die neue Meldung ersetzt die alte im Sperrbildschirm.
    expect(m.tag).toBe('einsatzplan-u1');
  });

  it('ohne Kundennamen steht die Baustellennummer', () => {
    const m = textEinsatzplan({ uid: 'u1', heute: [], morgen: [{ nr: '2026-020', kunde: '' }] });
    expect(m.body).toBe('Heute: kein Einsatz · Morgen: 2026-020');
  });

  it('abschaltbar je Person, ab Werk an', () => {
    expect(willMeldung({}, 'notifyEinsaetze')).toBe(true);
    expect(willMeldung({ notifyEinsaetze: false }, 'notifyEinsaetze')).toBe(false);
    expect(willMeldung(undefined, 'notifyEinsaetze')).toBe(false);
  });
});
