// @vitest-environment jsdom
/**
 * Inventur als Zählliste (Durchsicht 15.11.2026, F14) — was die Ansicht
 * rechnet und was auf Zählliste und Protokoll steht. Die Buchung selbst
 * prüft `tests/supabase/inventurZaehlliste.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tabellen: Array<{ head?: string[][]; body?: string[][] }> = [];
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { head?: string[][]; body?: string[][] }) => {
    tabellen.push(opts);
    doc.lastAutoTable = { finalY: 140 };
  },
}));

import {
  abweichungText,
  ergebnisText,
  fortschritt,
  inventurDateiname,
  protokollCsv,
  protokollTabelle,
  vorgabeGrund,
  zaehllistenTabelle,
  zaehlzeitText,
  zeilenFiltern,
} from '@/features/orders/inventur';
import { buildInventurPdf } from '@/features/orders/inventurPdf';
import type { ZaehllisteVoll, ZaehllistenZeile } from '@/lib/db/inventur';
import type { Company } from '@/types';

const zeile = (id: string, name: string, rest: Partial<ZaehllistenZeile> = {}): ZaehllistenZeile => ({
  id, materialId: `m-${id}`, name, artikelnummer: `A-${id}`, einheit: 'Stk', warengruppe: 'Rohre',
  gezaehlt: null, gezaehltAm: null, gezaehltVonName: null, ergebnis: null, soll: null, abweichung: null,
  bestandVorher: null, bestandNachher: null, grund: null, ...rest,
});

const GEBUCHT: ZaehllisteVoll = {
  id: 'i1', ort: 'o', ortName: 'Fahrzeug W-1A', imHauptlager: false, bezeichnung: 'Jahresinventur', stichtag: null,
  zustand: 'gebucht', angelegtAm: 1, angelegtVonName: 'Vera', gebuchtAm: Date.parse('2026-12-31T16:00:00Z'), gebuchtVonName: 'Paul',
  auswahl: {}, grund: 'Inventur 31.12.',
  zeilen: [
    zeile('1', 'Muffe', { gezaehlt: 5, soll: 4, abweichung: 1, bestandVorher: 4, bestandNachher: 5, ergebnis: 'gebucht', gezaehltVonName: 'Vera' }),
    zeile('2', 'Kabel', { einheit: 'm', gezaehlt: 12.5, soll: 15, abweichung: -2.5, bestandVorher: 14, bestandNachher: 11.5, ergebnis: 'gebucht', grund: 'Bruch' }),
    zeile('3', 'Schelle', { gezaehlt: 6, soll: 6, ergebnis: 'ueberholt' }),
    zeile('4', 'Band', { ergebnis: 'nicht_gezaehlt' }),
  ],
};

beforeEach(() => {
  tabellen.length = 0;
});

describe('Zählen', () => {
  it('Fortschritt und Filter: offen, gezählt, alle — gesucht über Name, Nummer und Warengruppe', () => {
    const z = [zeile('1', 'Muffe', { gezaehlt: 0 }), zeile('2', 'Kabel', { warengruppe: 'Elektro' }), zeile('3', 'Rohr')];
    // Null gezählt ist gezählt — ein leeres Fach ist ein Ergebnis.
    expect(fortschritt(z)).toEqual({ gezaehlt: 1, gesamt: 3 });
    expect(zeilenFiltern(z, 'offen', '').map((x) => x.name)).toEqual(['Kabel', 'Rohr']);
    expect(zeilenFiltern(z, 'gezaehlt', '').map((x) => x.name)).toEqual(['Muffe']);
    expect(zeilenFiltern(z, 'alle', 'elektro').map((x) => x.name)).toEqual(['Kabel']);
    expect(zeilenFiltern(z, 'alle', 'a-3').map((x) => x.name)).toEqual(['Rohr']);
  });

  it('die Abweichung in Worten — mit echtem Minus, „stimmt“ bei null', () => {
    expect(abweichungText(2, 'Stk')).toBe('+2 Stk');
    expect(abweichungText(-1.5, 'm')).toBe('−1,5 m');
    expect(abweichungText(0, 'Stk')).toBe('stimmt');
    expect(abweichungText(null, 'Stk')).toBe('—');
  });

  it('der vorgeschlagene Grund nennt Ort und Tag — beim Stichtag dessen Tag', () => {
    const heute = new Date(2026, 10, 17, 9).getTime();
    expect(vorgabeGrund('Hauptlager', null, heute)).toBe('Inventur Hauptlager 17.11.2026');
    expect(vorgabeGrund('Hauptlager', new Date(2026, 11, 31, 7).getTime(), heute)).toBe('Inventur Hauptlager 31.12.2026');
    expect(zaehlzeitText(null)).toBe('je Artikel beim Eintragen');
    expect(zaehlzeitText(Date.parse('2026-12-31T06:00:00Z'))).toBe('zum Stichtag 31.12.2026, 07:00 Uhr');
  });
});

describe('Zählliste und Protokoll', () => {
  it('die Zählliste zum Ausdrucken trägt keine Zahl aus dem System — nur, was schon gezählt ist', () => {
    const offen = [zeile('1', 'Muffe'), zeile('2', 'Kabel', { gezaehlt: 3, soll: 7 })];
    expect(zaehllistenTabelle(offen)).toEqual([
      ['1', 'A-1', 'Muffe', 'Stk', ''],
      ['2', 'A-2', 'Kabel', 'Stk', '3'],
    ]);
  });

  it('das Protokoll: Soll, Gezählt, Abweichung, danach, Ergebnis und eigener Grund — im PDF mit Bindestrich als Minus', () => {
    expect(protokollTabelle(GEBUCHT.zeilen)).toEqual([
      ['A-1', 'Muffe', 'Stk', '4', '5', '+1 Stk', '5', 'Abweichung gebucht'],
      ['A-2', 'Kabel', 'm', '15', '12,5', '-2,5 m', '11,5', 'Abweichung gebucht · Bruch'],
      ['A-3', 'Schelle', 'Stk', '6', '6', '', '', 'überholt — danach einzeln inventiert'],
      ['A-4', 'Band', 'Stk', '', '', '', '', 'nicht gezählt — Bestand unverändert'],
    ]);
    expect(ergebnisText({ ergebnis: 'gebucht', abweichung: 0 })).toBe('stimmt');
  });

  it('das Protokoll als CSV: Semikolon, Komma als Dezimalzeichen, der Grund der Liste, wo die Zeile keinen eigenen hat', () => {
    const zeilen = protokollCsv(GEBUCHT).split('\r\n');
    expect(zeilen[0]).toBe('Ort;Gezählt;Art.-Nr.;Artikel;Einheit;Soll;Gezählt (Menge);Abweichung;Bestand nachher;Ergebnis;Grund;Gezählt von;Gezählt am');
    expect(zeilen[1]).toBe('Fahrzeug W-1A;je Artikel beim Eintragen;A-1;Muffe;Stk;4;5;1;5;Abweichung gebucht;Inventur 31.12.;Vera;');
    expect(zeilen[2]).toContain(';12,5;-2,5;11,5;Abweichung gebucht;Bruch;');
    // Nicht gebucht: kein Grund, keine Abweichung.
    expect(zeilen[4]).toBe('Fahrzeug W-1A;je Artikel beim Eintragen;A-4;Band;Stk;;;;;nicht gezählt — Bestand unverändert;;;');
  });

  it('der Dateiname ist im Download-Ordner erkennbar', () => {
    expect(inventurDateiname('Inventurprotokoll', 'Fahrzeug W-1A', '2026-12-31', 'pdf')).toBe('Inventurprotokoll_Fahrzeug_W-1A_2026-12-31.pdf');
  });

  it('das PDF: Titel und Tabelle je nach Art — das Protokoll nennt, wann und von wem gebucht', async () => {
    const firma = { id: 'b', name: 'Perl Installationen GmbH' } as Company;
    const text = (doc: unknown) => (doc as { internal: { pages: string[][] } }).internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
    const protokoll = text(await buildInventurPdf({ company: firma, liste: GEBUCHT, art: 'protokoll' }));
    expect(protokoll).toContain('(Inventurprotokoll) Tj');
    expect(protokoll).toContain('von Paul');
    // Das Minus der Abweichung kommt an: kein Zeichen außerhalb der Grundschrift in der Tabelle.
    expect(tabellen[0].body!.flat().join('')).not.toMatch(/\u2212/);
    expect(tabellen[0].head?.[0]).toEqual(['Art.-Nr.', 'Artikel', 'Einh.', 'Soll', 'Gezählt', 'Abw.', 'Danach', 'Ergebnis']);
    const liste = text(await buildInventurPdf({ company: firma, liste: { ...GEBUCHT, zustand: 'offen' }, art: 'zaehlliste' }));
    expect(liste).toContain('(Zählliste) Tj');
    expect(tabellen[1].head?.[0]).toEqual(['Pos.', 'Art.-Nr.', 'Artikel', 'Einheit', 'Gezählt']);
  });
});
