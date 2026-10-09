import { describe, it, expect } from 'vitest';
import type { Termin } from '@/types';
import {
  lieferungOhneAnnahme,
  naechsterArbeitstag,
  ortAus,
  personKurz,
  schmalerTag,
  terminZeitKurz,
  zelleLeer,
} from '@/features/assignments/wochenTermine';
import { wocheAb } from '@/features/assignments/wochenplan';

/*
  Die reinen Rechnungen der Einsatzplanung, Runde 4 (Auftrag 4.2 und 4.4).
  Sie rechnen nur auf geladenen Daten — keine neue Abfrage.
*/

const lieferung = (x: Partial<Termin> = {}): Termin => ({
  id: 't', companyId: 'c', art: 'Lieferung', datum: '2026-10-07', projectNumber: 'B-1', teilnehmer: [], ...x,
});

describe('Lieferung ohne Annahme', () => {
  it('eine Lieferung an einer Baustelle, auf der an dem Tag niemand eingeteilt ist', () => {
    expect(lieferungOhneAnnahme(lieferung(), [])).toBe(true);
    // Eingeteilt, aber an einem anderen Tag oder auf einer anderen Baustelle: niemand dort.
    expect(lieferungOhneAnnahme(lieferung(), [{ date: '2026-10-08', projectNumber: 'B-1' }])).toBe(true);
    expect(lieferungOhneAnnahme(lieferung(), [{ date: '2026-10-07', projectNumber: 'B-2' }])).toBe(true);
  });

  it('Gegenprobe: mit einem Einsatz am selben Tag auf derselben Baustelle — wie der Hinweis im Einsatzformular', () => {
    expect(lieferungOhneAnnahme(lieferung(), [{ date: '2026-10-07', projectNumber: 'B-1' }])).toBe(false);
  });

  it('nur Lieferungen, und nur mit Baustelle', () => {
    expect(lieferungOhneAnnahme(lieferung({ art: 'Abnahme' }), [])).toBe(false);
    expect(lieferungOhneAnnahme(lieferung({ projectNumber: null, customerId: 'k' }), [])).toBe(false);
  });
});

describe('Samstag, Sonntag, Feiertag schmal', () => {
  const woche = wocheAb('2026-10-26'); // Mo 26.10. Nationalfeiertag, So 01.11. Allerheiligen

  it('schmal, solange weder Einsatz noch Termin daliegt', () => {
    expect(woche.filter((t) => schmalerTag(t, [], []))).toEqual(['2026-10-26', '2026-10-31', '2026-11-01']);
  });

  it('breit mit einem Einsatz oder einem Termin — ein Werktag nie schmal (Gegenprobe)', () => {
    expect(schmalerTag('2026-10-31', [{ date: '2026-10-31', projectNumber: 'B-1' }], [])).toBe(false);
    expect(schmalerTag('2026-10-26', [], [{ datum: '2026-10-26' }])).toBe(false);
    expect(schmalerTag('2026-10-27', [], [])).toBe(false);
  });
});

describe('der nächste Arbeitstag für „Noch einzuplanen“', () => {
  const woche = wocheAb('2026-10-05');
  it('ab heute, Wochenende übersprungen', () => {
    expect(naechsterArbeitstag(woche, '2026-10-07')).toBe('2026-10-07');
    expect(naechsterArbeitstag(woche, '2026-10-10')).toBe('2026-10-05');
  });
  it('eine künftige Woche: ihr Montag; ein Feiertag zählt nicht', () => {
    expect(naechsterArbeitstag(wocheAb('2026-10-26'), '2026-10-07')).toBe('2026-10-27');
  });
});

describe('Kurzformen', () => {
  it('Person „Max M.“, Zeit „ganzer Tag“, Ort aus der Adresse', () => {
    expect(personKurz('Max Mustermann')).toBe('Max M.');
    expect(personKurz('Anton Berger-Steinmetz')).toBe('Anton B.');
    expect(personKurz('Cher')).toBe('Cher');
    expect(terminZeitKurz({ zeitVon: '08:00', zeitBis: '10:00' })).toBe('08:00–10:00');
    expect(terminZeitKurz({ zeitVon: null, zeitBis: null })).toBe('ganzer Tag');
    expect(ortAus('Hauptstraße 112, 2700 Wiener Neustadt')).toBe('Wiener Neustadt');
    expect(ortAus('Ringstraße 3')).toBe('Ringstraße 3');
    expect(ortAus(undefined)).toBe('');
  });
});

describe('leere Zelle', () => {
  const zelle = (x = {}) => ({ baustellen: [], imUrlaub: false, abwesendText: null, ...x });
  it('leer ohne Einsatz, Abwesenheit, Betriebsurlaub und eigenen Termin', () => {
    expect(zelleLeer(undefined, false, [], 'u1')).toBe(true);
    expect(zelleLeer(zelle(), false, [{ teilnehmer: ['u2'] }], 'u1')).toBe(true);
  });
  it('Gegenprobe: jedes davon füllt sie', () => {
    expect(zelleLeer(zelle({ baustellen: [{}] }), false, [], 'u1')).toBe(false);
    expect(zelleLeer(zelle({ abwesendText: 'ZA 13:00–17:00' }), false, [], 'u1')).toBe(false);
    expect(zelleLeer(undefined, true, [], 'u1')).toBe(false);
    expect(zelleLeer(undefined, false, [{ teilnehmer: ['u1'] }], 'u1')).toBe(false);
  });
});
