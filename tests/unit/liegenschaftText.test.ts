/**
 * LIEGENSCHAFTEN IN WORTEN UND DIE VORSCHLÄGE BEIM ANLEGEN EINER BAUSTELLE
 * (M02c, A09) — reine Rechnung.
 *
 * - Kunde: Rechnungsempfänger, dann Auftraggeber, dann Hausverwaltung — nur
 *   wer Kunde ist und heute gilt, an der Liegenschaft oder am gewählten Top;
 * - Ansprechpartner: der Nutzer bzw. Mieter des Tops;
 * - was beim Speichern an Liegenschaft und Top mitgeht.
 *
 * Gegenprobe: ohne `liegenschaftText.ts` gibt es nichts zu importieren — rot;
 * mit vertauschtem Vorrang (Hausverwaltung vor Auftraggeber) der erste Fall.
 */
import { describe, it, expect } from 'vitest';
import {
  KUNDEN_VORRANG,
  ROLLE_TEXT,
  beteiligterFehler,
  giltAm,
  liegenschaftZeile,
  topText,
  vorschlaege,
  zeitraumText,
  zuordnungAenderung,
} from '@/features/liegenschaften/liegenschaftText';
import { BETEILIGTEN_ROLLEN, type LiegenschaftBeteiligter } from '@/types';

const HEUTE = '2026-11-07';
const b = (x: Partial<LiegenschaftBeteiligter>): LiegenschaftBeteiligter => ({
  id: `b-${Math.random()}`, companyId: 'perl', liegenschaftId: 'l1', rolle: 'eigentuemer', ...x,
});
const KUNDEN = new Map([
  ['hv', { name: 'Muster Hausverwaltung', contactPhone: '01 111' }],
  ['ag', { name: 'Auftrag GmbH', contactPhone: '01 222' }],
  ['re', { name: 'Rechnung KG', contactPhone: '01 333' }],
  ['mieterin', { name: 'Maria Mieterin', contactPhone: '0664 444' }],
]);
const L = { anschrift: 'Hauptstraße 12, 1010 Wien' };

describe('Vorschläge beim Anlegen einer Baustelle', () => {
  it('Kunde: Rechnungsempfänger vor Auftraggeber vor Hausverwaltung — nur Kunden', () => {
    const v = vorschlaege(L, null, [
      b({ rolle: 'hausverwaltung', customerId: 'hv' }),
      b({ rolle: 'auftraggeber', customerId: 'ag' }),
      b({ rolle: 'rechnungsempfaenger', customerId: 're' }),
      // Frei eingetragen: kein Kunde, also kein Vorschlag als Kunde.
      b({ rolle: 'rechnungsempfaenger', name: 'Frei Rechnung' }),
      // Eigentümer und Versicherung schlägt niemand als Kunden vor.
      b({ rolle: 'eigentuemer', customerId: 'mieterin' }),
    ], KUNDEN, HEUTE);
    expect(v.kunden.map((k) => [k.customerId, k.rolle])).toEqual([
      ['re', 'rechnungsempfaenger'], ['ag', 'auftraggeber'], ['hv', 'hausverwaltung'],
    ]);
    expect(KUNDEN_VORRANG).toEqual(['rechnungsempfaenger', 'auftraggeber', 'hausverwaltung']);
  });

  it('ohne Auftraggeber die Hausverwaltung; jeder Kunde nur einmal, mit seiner vordersten Rolle', () => {
    const v = vorschlaege(L, null, [
      b({ rolle: 'hausverwaltung', customerId: 'hv' }),
      b({ rolle: 'rechnungsempfaenger', customerId: 'hv' }),
    ], KUNDEN, HEUTE);
    expect(v.kunden).toEqual([{ customerId: 'hv', rolle: 'rechnungsempfaenger', amTop: false }]);
  });

  it('am gewählten Top vor dem am Haus; fremde Tops und ausgezogene zählen nicht', () => {
    const v = vorschlaege(L, 't2', [
      b({ rolle: 'auftraggeber', customerId: 'hv' }),
      b({ rolle: 'auftraggeber', customerId: 'ag', topId: 't2' }),
      b({ rolle: 'auftraggeber', customerId: 're', topId: 't1' }),
      b({ rolle: 'auftraggeber', customerId: 'mieterin', gueltigBis: '2026-01-31' }),
    ], KUNDEN, HEUTE);
    expect(v.kunden.map((k) => [k.customerId, k.amTop])).toEqual([['ag', true], ['hv', false]]);
  });

  it('Ansprechpartner: der Nutzer bzw. Mieter des Tops — frei oder als Kunde; ohne Top keiner', () => {
    const frei = b({ rolle: 'nutzer', topId: 't2', name: 'Max Mieter', telefon: '0664 1' });
    expect(vorschlaege(L, 't2', [frei], KUNDEN, HEUTE).ansprechpartner).toEqual({ name: 'Max Mieter', telefon: '0664 1' });
    expect(vorschlaege(L, 't2', [b({ rolle: 'nutzer', topId: 't2', customerId: 'mieterin' })], KUNDEN, HEUTE).ansprechpartner)
      .toEqual({ name: 'Maria Mieterin', telefon: '0664 444' });
    expect(vorschlaege(L, null, [frei], KUNDEN, HEUTE).ansprechpartner).toBeNull();
    expect(vorschlaege(L, 't1', [frei], KUNDEN, HEUTE).ansprechpartner).toBeNull();
    // Der ausgezogene Mieter ist kein Ansprechpartner mehr.
    expect(vorschlaege(L, 't2', [{ ...frei, gueltigBis: '2026-10-31' }], KUNDEN, HEUTE).ansprechpartner).toBeNull();
  });

  it('Adresse: die Anschrift der Liegenschaft — ohne sie keine', () => {
    expect(vorschlaege(L, null, [], KUNDEN, HEUTE).adresse).toBe('Hauptstraße 12, 1010 Wien');
    expect(vorschlaege({ anschrift: null }, null, [], KUNDEN, HEUTE).adresse).toBeNull();
  });
});

describe('Gültigkeit und Worte', () => {
  it('gilt ohne Zeitraum immer, sonst von ab bis bis (beide Tage eingeschlossen)', () => {
    expect(giltAm({}, HEUTE)).toBe(true);
    expect(giltAm({ gueltigAb: HEUTE, gueltigBis: HEUTE }, HEUTE)).toBe(true);
    expect(giltAm({ gueltigAb: '2026-11-08' }, HEUTE)).toBe(false);
    expect(giltAm({ gueltigBis: '2026-11-06' }, HEUTE)).toBe(false);
  });

  it('Zeilen, Tops und Zeitraum in Worten', () => {
    expect(liegenschaftZeile({ liegenschaftBezeichnung: 'WHA Hauptstraße 12', topBezeichnung: 'Top 5' })).toBe('WHA Hauptstraße 12 · Top 5');
    expect(liegenschaftZeile({ liegenschaftBezeichnung: 'WHA Hauptstraße 12' })).toBe('WHA Hauptstraße 12');
    expect(liegenschaftZeile({})).toBe('');
    expect(topText({ bezeichnung: 'Top 5', lage: '2. OG' })).toBe('Top 5 (2. OG)');
    expect(topText({ bezeichnung: 'Top 5', lage: null })).toBe('Top 5');
    const d = (iso: string) => iso.split('-').reverse().join('.');
    expect(zeitraumText({ gueltigAb: '2026-03-01' }, d)).toBe('seit 01.03.2026');
    expect(zeitraumText({ gueltigBis: '2026-10-31' }, d)).toBe('bis 31.10.2026');
    expect(zeitraumText({}, d)).toBe('');
  });

  it('jede Rolle hat ihr Wort — dieselben wie in der Datenbank', () => {
    expect(BETEILIGTEN_ROLLEN.map((r) => ROLLE_TEXT[r])).toEqual([
      'Eigentümer', 'Hausverwaltung', 'Betreiber', 'Nutzer bzw. Mieter', 'Auftraggeber', 'Rechnungsempfänger',
      'Versicherung', 'Lieferadresse',
    ]);
  });

  it('ein Beteiligter braucht Rolle und Kunde oder Namen; „bis“ nicht vor „ab“', () => {
    const f = { rolle: 'nutzer', art: 'frei' as const, customerId: '', name: 'Max', gueltigAb: '', gueltigBis: '' };
    expect(beteiligterFehler(f)).toBeNull();
    expect(beteiligterFehler({ ...f, rolle: '' })).toMatch(/Rolle/);
    expect(beteiligterFehler({ ...f, name: ' ' })).toMatch(/Namen/);
    expect(beteiligterFehler({ ...f, art: 'kunde' })).toMatch(/Kunden wählen/);
    expect(beteiligterFehler({ ...f, gueltigAb: '2026-11-01', gueltigBis: '2026-10-01' })).toMatch(/vor „gültig ab“/);
  });
});

describe('Was beim Speichern an Liegenschaft und Top mitgeht', () => {
  it('nichts, wenn nichts geändert ist — eine bestehende Zuordnung bleibt, wie sie ist', () => {
    expect(zuordnungAenderung({ liegenschaftId: '', topId: '' }, undefined)).toEqual({});
    expect(zuordnungAenderung({ liegenschaftId: 'l1', topId: 't1' }, { liegenschaftId: 'l1', topId: 't1' })).toEqual({});
  });

  it('neu, gewechselt oder gelöst — leer als null, ein Top nie ohne Liegenschaft', () => {
    expect(zuordnungAenderung({ liegenschaftId: 'l1', topId: '' }, undefined)).toEqual({ liegenschaftId: 'l1', topId: null });
    expect(zuordnungAenderung({ liegenschaftId: 'l1', topId: 't2' }, { liegenschaftId: 'l1', topId: 't1' })).toEqual({ liegenschaftId: 'l1', topId: 't2' });
    expect(zuordnungAenderung({ liegenschaftId: '', topId: 't1' }, { liegenschaftId: 'l1', topId: 't1' })).toEqual({ liegenschaftId: null, topId: null });
  });
});
