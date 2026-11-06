/**
 * Der Verlauf eines Geschäftsobjekts in Worten (M01b): Rohwerte der
 * Datenbank werden zu dem, was das Büro liest — Namen der Akte, Geld, Datum,
 * ja/nein, Personen statt Kennungen; gelöschte Werte sagen, dass sie
 * gelöscht sind; die vorhandenen Verläufe (Mahnung, Wartung, Konto, Urlaub)
 * stehen in Worten da.
 *
 * Gegenprobe: ohne `objektVerlaufText.ts` gibt es nichts zu importieren —
 * jede Prüfung hier ist rot.
 */
import { describe, it, expect } from 'vitest';
import { verlaufEintrag, VERLAUF_FELDER } from '@/features/verlauf/objektVerlaufText';
import { verlaufSichtbar } from '@/features/verlauf/verlaufSichtbar';
import type { ObjektVerlaufZeile } from '@/lib/db/objektVerlauf';
import { euro } from '@/lib/betrag';

const zeile = (z: Partial<ObjektVerlaufZeile>): ObjektVerlaufZeile => ({
  quelle: 'journal', id: 'j1', objektart: 'kunde', objektId: 'k1', art: 'geaendert', aenderungen: {},
  am: Date.parse('2026-11-06T13:03:00Z'), amRoh: '2026-11-06 13:03:00.123456+00', ...z,
});

describe('verlaufEintrag — Änderungen', () => {
  it('je Feld alt → neu, mit dem Namen der Akte und in lesbarer Form', () => {
    const e = verlaufEintrag(zeile({
      vonName: 'Berta Büro',
      aenderungen: {
        contact_phone: { alt: '0664 1', neu: '0664 2' },
        active: { alt: true, neu: false },
        kundenart: { alt: null, neu: 'unternehmen' },
      },
    }));
    expect(e.titel).toBe('Geändert von Berta Büro');
    // In der Reihenfolge der Liste, nicht der Datenbank.
    expect(e.zeilen).toEqual(['Kundenart — → Unternehmen', 'Telefon 0664 1 → 0664 2', 'Aktiv ja → nein']);
    expect(e.zeit).toMatch(/06\.11\.2026/);
  });

  it('Geld, Anteil, Datum und Zeitpunkt einer Rechnung', () => {
    const e = verlaufEintrag(zeile({
      objektart: 'rechnung',
      aenderungen: {
        total_brutto: { alt: 1200, neu: 1234.5 },
        vat_rate: { alt: 0.2, neu: 0.1 },
        due_date: { alt: '2026-11-15', neu: '2026-11-30' },
        payment_status: { alt: 'Offen', neu: 'Storniert' },
        cancelled_at: { alt: null, neu: '2026-11-06T13:03:00.123+00:00' },
      },
    }));
    expect(e.zeilen).toEqual([
      'Stand Offen → Storniert',
      'Fällig 15.11.2026 → 30.11.2026',
      'USt-Satz 20 % → 10 %',
      `Summe brutto ${euro(1200)} → ${euro(1234.5)}`,
      expect.stringMatching(/^Storniert am — → 06\.11\.2026, \d\d:03$/),
    ]);
  });

  it('Team und Projektleitung als Namen; wer nicht mehr da ist, heißt so', () => {
    const namen = new Map([['u1', 'Max Monteur'], ['u2', 'Paul Projektleiter']]);
    const e = verlaufEintrag(zeile({
      objektart: 'baustelle',
      aenderungen: {
        assigned_employees: { alt: ['u1'], neu: ['u1', 'weg'] },
        project_managers: { alt: [], neu: ['u2'] },
      },
    }), { name: (u) => namen.get(u) });
    expect(e.zeilen).toEqual([
      'Team Max Monteur → Max Monteur, unbekannte Person',
      'Projektleitung — → Paul Projektleiter',
    ]);
  });

  it('Stammdaten einer Person: Arbeitstage, Tagessoll, Einstufung, Monate', () => {
    const e = verlaufEintrag(zeile({
      objektart: 'benutzer',
      aenderungen: {
        work_days: { alt: [1, 2, 3, 4, 5], neu: [1, 2, 3, 4] },
        tagessoll: { alt: null, neu: { 1: 8.5, 5: 6 } },
        einstufung: { alt: 'facharbeiter', neu: 'lehrling' },
        lehrzeit_monate: { alt: null, neu: 36 },
        weekly_target_hours: { alt: 38.5, neu: 40 },
      },
    }));
    expect(e.zeilen).toEqual([
      'Einstufung Facharbeiter → Lehrling',
      'Lehrzeit — → 36 Monate',
      'Wochenstunden 38,5 → 40',
      'Arbeitstage Mo, Di, Mi, Do, Fr → Mo, Di, Mi, Do',
      'Tagessoll je Wochentag — → Mo 8,5 Std. · Fr 6 Std.',
    ]);
  });

  it('mit den Kundendaten gelöschte Werte: dass, aber nicht was', () => {
    const e = verlaufEintrag(zeile({ aenderungen: { name: { entfernt: true }, contact_phone: { entfernt: true } } }));
    expect(e.zeilen).toEqual([
      'Name geändert (Werte mit den Kundendaten gelöscht)',
      'Telefon geändert (Werte mit den Kundendaten gelöscht)',
    ]);
  });

  it('was für den Leser gleich aussieht, steht nicht da; eine unbekannte Spalte verschwindet nicht', () => {
    expect(verlaufEintrag(zeile({ aenderungen: { notes: { alt: null, neu: '' } } })).zeilen)
      .toEqual(['Keine sichtbare Änderung']);
    expect(verlaufEintrag(zeile({ aenderungen: { neue_spalte: { alt: 1, neu: 2 } } })).zeilen)
      .toEqual(['Angabe „neue_spalte“ geändert']);
  });
});

describe('verlaufEintrag — Anlegen, Löschen, Zahlungen', () => {
  it('Anlegen ohne Angaben (das Objekt zeigt seinen Stand selbst), Löschen mit Bezeichnung', () => {
    expect(verlaufEintrag(zeile({ art: 'angelegt', vonName: 'Carla Chefin', bezeichnung: 'Familie Huber' })))
      .toMatchObject({ titel: 'Angelegt von Carla Chefin', zeilen: [] });
    expect(verlaufEintrag(zeile({ art: 'geloescht', bezeichnung: 'Familie Huber' })))
      .toMatchObject({ titel: 'Gelöscht', zeilen: ['Familie Huber'] });
  });

  it('eine Zahlung im Verlauf ihrer Rechnung: erfasst, geändert, gelöscht — mit Betrag und Tag', () => {
    const z = { objektart: 'zahlung' as const, bezeichnung: '€ 100,00 vom 05.11.2026 · Überweisung', vonName: 'Berta Büro' };
    expect(verlaufEintrag(zeile({ ...z, art: 'angelegt' })))
      .toMatchObject({ titel: 'Zahlung erfasst von Berta Büro', zeilen: ['€ 100,00 vom 05.11.2026 · Überweisung'] });
    expect(verlaufEintrag(zeile({ ...z, art: 'geaendert', aenderungen: { betrag: { alt: 10, neu: 100 } } })).zeilen)
      .toEqual(['€ 100,00 vom 05.11.2026 · Überweisung', 'Betrag € 10,00 → € 100,00']);
    expect(verlaufEintrag(zeile({ ...z, art: 'geloescht' })).titel).toBe('Zahlung gelöscht von Berta Büro');
  });
});

describe('verlaufEintrag — vorhandene Verläufe', () => {
  it('Mahnung, Wartungsausführung, Kontoumstellung, Urlaubsanpassung in Worten', () => {
    expect(verlaufEintrag(zeile({
      quelle: 'mahnung', objektart: 'rechnung', art: 'gemahnt', vonName: 'Berta Büro',
      aenderungen: { stufe: 2, datum: '2026-11-06', frist: '2026-11-20', spesen: 5 },
    }))).toMatchObject({
      titel: 'Gemahnt (Stufe 2) von Berta Büro',
      zeilen: ['Mahndatum 06.11.2026', 'Frist 20.11.2026', 'Spesen € 5,00'],
    });
    expect(verlaufEintrag(zeile({
      quelle: 'wartung_ausfuehrung', objektart: 'wartung', art: 'ausgefuehrt',
      aenderungen: { am: '2026-10-01', baustelle: 'B-2026-0001' },
    }))).toMatchObject({ titel: 'Wartung ausgeführt', zeilen: ['Am 01.10.2026', 'Baustelle B-2026-0001'] });
    expect(verlaufEintrag(zeile({
      quelle: 'konto_umstellung', objektart: 'benutzer', art: 'konto_umgestellt', vonName: 'Carla Chefin',
      aenderungen: { nach: 'benutzername', grund: 'Kein Postfach' },
    }))).toMatchObject({
      titel: 'Konto umgestellt von Carla Chefin',
      zeilen: ['Anmeldung jetzt mit Benutzername', 'Grund: Kein Postfach'],
    });
    expect(verlaufEintrag(zeile({
      quelle: 'urlaubsanspruch', objektart: 'benutzer', art: 'urlaubsanspruch_angepasst',
      aenderungen: { urlaubsjahr: 2026, tage: -2, grund: 'Unbezahlter Urlaub' },
    }))).toMatchObject({
      titel: 'Urlaubsanspruch angepasst', zeilen: ['Urlaubsjahr 2026', '−2 Tage', 'Grund: Unbezahlter Urlaub'],
    });
    expect(verlaufEintrag(zeile({
      quelle: 'urlaubsanspruch', objektart: 'benutzer', art: 'urlaubsanspruch_entfernt',
      aenderungen: { urlaubsjahr: 2026, tage: 1, grund: 'Falsch eingetragen' },
    }))).toMatchObject({
      titel: 'Anpassung des Urlaubsanspruchs entfernt', zeilen: ['Urlaubsjahr 2026', '+1 Tag', 'Grund: Falsch eingetragen'],
    });
  });
});

describe('Die Felderlisten', () => {
  it('nennen jede Spalte je Objektart nur einmal und jeden Namen nur einmal', () => {
    for (const [art, felder] of Object.entries(VERLAUF_FELDER)) {
      const spalten = felder.map(([s]) => s);
      const namen = felder.map(([, n]) => n);
      expect(new Set(spalten).size, `${art}: Spalten`).toBe(spalten.length);
      expect(new Set(namen).size, `${art}: Namen`).toBe(namen.length);
    }
  });
});

describe('verlaufSichtbar — dieselbe Grenze wie die Regel', () => {
  it('nie Mitarbeiter, nie im Supporteinblick; Benutzer nur die Spitze', () => {
    expect(verlaufSichtbar('Mitarbeiter', 'baustelle', false)).toBe(false);
    expect(verlaufSichtbar('Buchhaltung', 'kunde', true)).toBe(false);
    expect(verlaufSichtbar(undefined, 'kunde', false)).toBe(false);
    for (const r of ['Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'] as const) {
      expect(verlaufSichtbar(r, 'kunde', false), r).toBe(true);
      expect(verlaufSichtbar(r, 'wartung', false), r).toBe(true);
    }
    expect(verlaufSichtbar('Projektleiter', 'benutzer', false)).toBe(false);
    expect(verlaufSichtbar('Buchhaltung', 'benutzer', false)).toBe(false);
    expect(verlaufSichtbar('Geschäftsführung', 'benutzer', false)).toBe(true);
    expect(verlaufSichtbar('Administrator', 'benutzer', false)).toBe(true);
  });
});
