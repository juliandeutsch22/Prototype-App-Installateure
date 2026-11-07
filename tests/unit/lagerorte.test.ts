import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Fahrzeug, Lagerort } from '@/types';
import {
  abhakOrte, eigeneFahrzeugOrte, fahrzeugText, HAUPTLAGER, kennzeichenSchluessel, ortName, ortNameVon,
  ortReihenfolge, weitereOrte,
} from '@/features/orders/lagerorte';

/**
 * Lagerorte in der Oberfläche (M04a, E10): Namen, Reihenfolge, welche Orte
 * zur Wahl stehen — und der Schreibbefehls-Vertrag auf der Seite der App
 * (Vorgangskennung einmal je Absicht, Nachfrage bei unklarem Ausgang).
 *
 * Gegenprobe: ohne `features/orders/lagerorte.ts` bzw. ohne die
 * Wiederholungslogik in `pg/lagerorte.ts` sind alle Fälle rot.
 */

const ort = (p: Partial<Lagerort> & { id: string }): Lagerort =>
  ({ companyId: 'perl', art: 'lager', bezeichnung: p.id, aktiv: true, ...p }) as Lagerort;
const fz = (p: Partial<Fahrzeug> & { id: string }): Fahrzeug =>
  ({ companyId: 'perl', kennzeichen: p.id, aktiv: true, ...p }) as Fahrzeug;

const HAUPT = ort({ id: 'h', art: 'haupt', bezeichnung: 'Zentrallager' });
const BUS_MAX = ort({ id: 'o-max', art: 'fahrzeug', bezeichnung: 'W-1A', fahrzeugId: 'f-max' });
const BUS_TOM = ort({ id: 'o-tom', art: 'fahrzeug', bezeichnung: 'W-2B', fahrzeugId: 'f-tom' });
const POOL = ort({ id: 'o-pool', art: 'fahrzeug', bezeichnung: 'W-3C', fahrzeugId: 'f-pool' });
const ALT = ort({ id: 'o-alt', art: 'fahrzeug', bezeichnung: 'W-0', fahrzeugId: 'f-alt', aktiv: false });
const AUSSEN = ort({ id: 'o-aussen', art: 'lager', bezeichnung: 'Außenlager' });
const ORTE = [BUS_TOM, AUSSEN, POOL, HAUPT, BUS_MAX, ALT];
const FAHRZEUGE = [
  fz({ id: 'f-max', standardfahrerUid: 'max' }),
  fz({ id: 'f-tom', standardfahrerUid: 'tom' }),
  fz({ id: 'f-pool', standardfahrerUid: null }),
  fz({ id: 'f-alt', standardfahrerUid: 'max', aktiv: false }),
];

describe('Namen und Reihenfolge', () => {
  it('ein Fahrzeuglager heißt nach dem Fahrzeug, das Hauptlager nach seiner Bezeichnung', () => {
    expect(ortName(BUS_MAX)).toBe('Fahrzeug W-1A');
    expect(ortName(AUSSEN)).toBe('Außenlager');
    expect(ortName(undefined)).toBe('Hauptlager');
    expect(ortNameVon(ORTE, HAUPTLAGER)).toBe('Zentrallager');
    expect(ortNameVon([], HAUPTLAGER)).toBe('Hauptlager');
    expect(ortNameVon(ORTE, 'o-tom')).toBe('Fahrzeug W-2B');
  });

  it('Hauptlager zuerst, dann weitere Lager, dann Fahrzeuge — je nach Name', () => {
    expect(ortReihenfolge(ORTE).map((o) => o.id)).toEqual(['h', 'o-aussen', 'o-alt', 'o-max', 'o-tom', 'o-pool']);
  });

  it('zur Wahl stehen nur aktive weitere Orte', () => {
    expect(weitereOrte(ORTE).map((o) => o.id)).toEqual(['o-aussen', 'o-max', 'o-tom', 'o-pool']);
    expect(weitereOrte(ORTE, 'fahrzeug').map((o) => o.id)).toEqual(['o-max', 'o-tom', 'o-pool']);
  });
});

describe('Fahrzeuge einer Person', () => {
  it('„Mein Fahrzeug“: die aktiven Fahrzeuge, deren Standardfahrer sie ist', () => {
    expect(eigeneFahrzeugOrte(ORTE, FAHRZEUGE, 'max').map((o) => o.id)).toEqual(['o-max']);
    expect(eigeneFahrzeugOrte(ORTE, FAHRZEUGE, 'niemand')).toEqual([]);
  });

  it('Abhaken: eigene, die der Eingeteilten und Poolfahrzeuge — Vorschlag das eigene', () => {
    const r = abhakOrte(ORTE, FAHRZEUGE, 'max', ['max'], false);
    expect(r.orte.map((o) => o.id)).toEqual(['o-max', 'o-pool']);
    expect(r.vorschlag).toBe('o-max');
    const mitTom = abhakOrte(ORTE, FAHRZEUGE, 'max', ['max', 'tom'], false);
    expect(mitTom.orte.map((o) => o.id)).toEqual(['o-max', 'o-tom', 'o-pool']);
  });

  it('Abhaken: ohne eigenes Fahrzeug ist der Vorschlag das Hauptlager; die Leitung wählt aus jedem', () => {
    expect(abhakOrte(ORTE, FAHRZEUGE, 'anna', ['anna'], false)).toEqual({ orte: [POOL], vorschlag: HAUPTLAGER });
    expect(abhakOrte(ORTE, FAHRZEUGE, 'chef', [], true).orte.map((o) => o.id)).toEqual(['o-max', 'o-tom', 'o-pool']);
  });

  it('ein Kennzeichen wird verglichen wie im eindeutigen Index der Datenbank', () => {
    expect(kennzeichenSchluessel('W-123 4a')).toBe('W1234A');
    expect(kennzeichenSchluessel('w 1234-A')).toBe(kennzeichenSchluessel('W-1234A'));
    expect(fahrzeugText({ kennzeichen: 'W-1A', bezeichnung: 'Sprinter' })).toBe('W-1A · Sprinter');
    expect(fahrzeugText({ kennzeichen: 'W-1A', bezeichnung: null })).toBe('W-1A');
  });
});

/* ---------------------------------------------------------------------------
   Der Schreibbefehls-Vertrag auf der Seite der App
--------------------------------------------------------------------------- */

const rpc = vi.fn();
vi.mock('@/lib/db/pg/kern', () => ({
  derClient: () => ({ rpc }),
  abfragen: vi.fn(),
  kanalHalten: vi.fn(),
}));

const AUFTRAG = { artikelId: 'm1', vonId: null, nachId: 'o-max', menge: 5, einheit: 'm', erwartetVon: 20, grund: '' };
const AUSGEFUEHRT = { ergebnis: 'ausgefuehrt', vorgang: 'v1', bestand_von: 15, bestand_nach: 5 };
const NETZ_WEG = { data: null, error: { message: 'FetchError: Failed to fetch', code: '' }, status: 0 };

describe('Umlagern nach dem Vertrag', () => {
  beforeEach(() => rpc.mockReset());

  it('schickt Vorgang, Aktion, Zielkennung, erwarteten Stand, Menge, Einheit — und liest das Ergebnis', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc.mockResolvedValueOnce({ data: AUSGEFUEHRT, error: null, status: 200 });
    expect(await umlagern(AUFTRAG, 'v1')).toEqual({ art: 'ausgefuehrt', vorgang: 'v1', bestandVon: 15, bestandNach: 5 });
    expect(rpc).toHaveBeenCalledWith('umlagern', {
      p_befehl: {
        vorgang: 'v1', aktion: 'umlagerung', ziel: { artikel: 'm1', von: null, nach: 'o-max' },
        erwartet: { bestand_von: 20 }, menge: 5, einheit: 'm', grund: null,
      },
    });
  });

  it('unklarer Ausgang, aber durch: fragt nach dem Stand und sendet NICHT noch einmal', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc
      .mockResolvedValueOnce(NETZ_WEG)
      .mockResolvedValueOnce({ data: { stand: 'erledigt', ergebnis: AUSGEFUEHRT }, error: null, status: 200 });
    expect((await umlagern(AUFTRAG, 'v1')).art).toBe('ausgefuehrt');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['umlagern', 'befehl_stand']);
    expect(rpc.mock.calls[1][1]).toEqual({ p_vorgang: 'v1' });
  });

  it('unklarer Ausgang, nichts geschrieben: sendet einmal neu — mit DERSELBEN Vorgangskennung', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc
      .mockResolvedValueOnce(NETZ_WEG)
      .mockResolvedValueOnce({ data: { stand: 'unbekannt' }, error: null, status: 200 })
      .mockResolvedValueOnce({ data: AUSGEFUEHRT, error: null, status: 200 });
    expect((await umlagern(AUFTRAG)).art).toBe('ausgefuehrt');
    const gesendet = rpc.mock.calls.filter((c) => c[0] === 'umlagern').map((c) => (c[1] as { p_befehl: { vorgang: string } }).p_befehl.vorgang);
    expect(gesendet).toHaveLength(2);
    expect(gesendet[0]).toBe(gesendet[1]);
  });

  it('bleibt es offen, sagt es das — statt still noch einmal zu buchen', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc.mockImplementation(async (name: string) =>
      name === 'umlagern' ? NETZ_WEG : { data: { stand: 'unbekannt' }, error: null, status: 200 });
    await expect(umlagern(AUFTRAG, 'v1')).rejects.toThrow(/ist offen/);
    expect(rpc.mock.calls.filter((c) => c[0] === 'umlagern')).toHaveLength(2);
  });

  it('eine Ablehnung der Datenbank ist eindeutig: kein Nachfragen, keine Wiederholung', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Umlagern darf die Verwaltung', code: '42501' }, status: 403 });
    await expect(umlagern(AUFTRAG, 'v1')).rejects.toThrow('Umlagern darf die Verwaltung');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('veraltet und Fehlbestand kommen als Ergebnis, nicht als Fehler', async () => {
    const { umlagern } = await import('@/lib/db/pg/lagerorte');
    rpc.mockResolvedValueOnce({ data: { ergebnis: 'veraltet', vorgang: 'v1', bestand_von: 3, einheit: 'm' }, error: null, status: 200 });
    expect(await umlagern(AUFTRAG, 'v1')).toEqual({ art: 'veraltet', vorgang: 'v1', bestandVon: 3, einheit: 'm' });
    rpc.mockResolvedValueOnce({ data: { ergebnis: 'fehlbestand', vorgang: 'v2', bestand_von: 2, menge: 5, einheit: 'm' }, error: null, status: 200 });
    expect(await umlagern(AUFTRAG, 'v2')).toEqual({ art: 'fehlbestand', vorgang: 'v2', bestandVon: 2, menge: 5, einheit: 'm' });
  });
});
