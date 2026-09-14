import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  schreiben,
  nachsenden,
  beiVormerkungFehlgeschlagen,
  VERSUCHE_GRENZE,
  type Lager,
  type Sender,
  type Sendeergebnis,
  type Vormerkung,
  type Sendung,
} from '@/lib/sync/ausgangsfach';

/** Ein Lager im Arbeitsspeicher — dieselben Zusagen, ohne Browser. */
function lagerImKopf(): Lager & { inhalt: () => Vormerkung[]; kaputt: boolean } {
  let zeilen: Vormerkung[] = [];
  let zaehler = 0;
  const l = {
    kaputt: false,
    inhalt: () => [...zeilen].sort((a, b) => a.folge - b.folge),
    async alle() {
      return [...zeilen];
    },
    async ablegen(v: Omit<Vormerkung, 'folge'>) {
      if (l.kaputt) throw new Error('Speicher voll');
      zaehler += 1;
      zeilen.push({ ...v, folge: zaehler });
      return zaehler;
    },
    async entfernen(folge: number) {
      zeilen = zeilen.filter((x) => x.folge !== folge);
    },
    async ersetzen(v: Vormerkung) {
      zeilen = zeilen.map((x) => (x.folge === v.folge ? v : x));
    },
  };
  return l;
}

function senderMit(...antworten: Sendeergebnis[]): Sender & { gesehen: Sendung[] } {
  const rest = [...antworten];
  const s = async (v: Sendung) => {
    s.gesehen.push(v);
    return rest.shift() ?? ({ art: 'ok' } as Sendeergebnis);
  };
  s.gesehen = [] as Sendung[];
  return s;
}

const auftrag = (zeile = 'z1', art: 'anlegen' | 'aendern' = 'anlegen') => ({
  tabelle: 'time_entries',
  art,
  zeile,
  daten: { date: '2026-09-11' },
});

const online = () => false; // istOffline() === false
const imFunkloch = () => true;

let gemeldet: Array<{ zeile: string; grund: string }> = [];
beforeEach(() => {
  gemeldet = [];
  beiVormerkungFehlgeschlagen((f) => gemeldet.push({ zeile: f.zeile, grund: f.grund }));
});
afterEach(() => beiVormerkungFehlgeschlagen(null));

describe('schreiben', () => {
  it('bestätigt sofort, wenn der Server bestätigt', async () => {
    const l = lagerImKopf();
    const s = senderMit({ art: 'ok' });
    expect(await schreiben(auftrag(), l, s, online)).toBe('confirmed');
    expect(l.inhalt()).toHaveLength(0);
  });

  it('merkt ohne Verbindung vor, ohne es überhaupt zu versuchen', async () => {
    const l = lagerImKopf();
    const s = senderMit();
    expect(await schreiben(auftrag(), l, s, imFunkloch)).toBe('queued');
    expect(s.gesehen).toHaveLength(0);
    expect(l.inhalt()).toHaveLength(1);
  });

  it('merkt vor, wenn nichts ankommt', async () => {
    const l = lagerImKopf();
    expect(await schreiben(auftrag(), l, senderMit({ art: 'kein-netz' }), online)).toBe('queued');
    expect(l.inhalt()).toHaveLength(1);
  });

  it('merkt auch bei unklarem Ausgang vor — der Vorgang darf nicht verloren gehen', async () => {
    const l = lagerImKopf();
    const erg = await schreiben(auftrag(), l, senderMit({ art: 'unklar', grund: '503' }), online);
    expect(erg).toBe('queued');
    expect(l.inhalt()).toHaveLength(1);
  });

  it('wirft bei einer Ablehnung und merkt NICHTS vor', async () => {
    const l = lagerImKopf();
    const s = senderMit({ art: 'abgelehnt', grund: 'Zeilenschutz' });
    await expect(schreiben(auftrag(), l, s, online)).rejects.toThrow('Zeilenschutz');
    expect(l.inhalt()).toHaveLength(0);
  });

  it('sagt NICHT „vorgemerkt", wenn das Lager selbst scheitert', async () => {
    const l = lagerImKopf();
    l.kaputt = true;
    // Sonst bekäme der Monteur eine Bestätigung für etwas, das nirgends liegt.
    await expect(schreiben(auftrag(), l, senderMit(), imFunkloch)).rejects.toThrow('Speicher voll');
  });

  it('stellt sich hinten an, wenn schon etwas wartet — auch mit Verbindung', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit({ art: 'kein-netz' }), online);
    const s = senderMit({ art: 'ok' });
    expect(await schreiben(auftrag('z1', 'aendern'), l, s, online)).toBe('queued');
    // Das „Ändern" darf das „Anlegen" nicht überholen.
    expect(s.gesehen).toHaveLength(0);
    expect(l.inhalt().map((v) => v.art)).toEqual(['anlegen', 'aendern']);
  });
});

describe('nachsenden', () => {
  it('sendet in der Reihenfolge, in der vorgemerkt wurde', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit({ art: 'kein-netz' }), online);
    await schreiben(auftrag('z2'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z3'), l, senderMit(), imFunkloch);

    const s = senderMit({ art: 'ok' }, { art: 'ok' }, { art: 'ok' });
    const bericht = await nachsenden(l, s);

    expect(s.gesehen.map((v) => v.zeile)).toEqual(['z1', 'z2', 'z3']);
    expect(bericht).toEqual({ gesendet: 3, abgelehnt: 0, offen: 0 });
  });

  it('hält bei fehlendem Netz an und lässt den Rest liegen', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z2'), l, senderMit(), imFunkloch);

    const s = senderMit({ art: 'ok' }, { art: 'kein-netz' });
    const bericht = await nachsenden(l, s);

    expect(bericht).toEqual({ gesendet: 1, abgelehnt: 0, offen: 1 });
    expect(l.inhalt().map((v) => v.zeile)).toEqual(['z2']);
    expect(gemeldet).toHaveLength(0); // kein Netz ist kein Verlust
  });

  it('zieht nichts vor, wenn mittendrin das Netz fehlt', async () => {
    // Der Fall, den der vorige Test NICHT trifft: die Zeile ohne Netz ist
    // nicht die letzte. Würde hier weitergemacht statt angehalten, überholten
    // z2 und z3 die Buchung z1 — und ein späteres „Ändern" käme vor dem
    // „Anlegen" an, auf das es sich bezieht.
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z2'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z3'), l, senderMit(), imFunkloch);

    const s = senderMit({ art: 'kein-netz' }, { art: 'ok' }, { art: 'ok' });
    const bericht = await nachsenden(l, s);

    expect(bericht).toEqual({ gesendet: 0, abgelehnt: 0, offen: 3 });
    expect(s.gesehen.map((v) => v.zeile)).toEqual(['z1']);
    expect(l.inhalt().map((v) => v.zeile)).toEqual(['z1', 'z2', 'z3']);
  });

  it('meldet eine späte Ablehnung und räumt sie weg', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);

    const bericht = await nachsenden(l, senderMit({ art: 'abgelehnt', grund: 'Konto gesperrt' }));

    expect(bericht).toEqual({ gesendet: 0, abgelehnt: 1, offen: 0 });
    expect(gemeldet).toEqual([{ zeile: 'z1', grund: 'Konto gesperrt' }]);
  });

  it('räumt bei einer Ablehnung die Nachfolger derselben Zeile mit weg — und meldet einmal', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z1', 'aendern'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z2'), l, senderMit(), imFunkloch);

    const s = senderMit({ art: 'abgelehnt', grund: 'Zeilenschutz' }, { art: 'ok' });
    const bericht = await nachsenden(l, s);

    // z1 und sein Nachfolger fallen zusammen, z2 geht durch.
    expect(bericht).toEqual({ gesendet: 1, abgelehnt: 2, offen: 0 });
    expect(gemeldet).toEqual([{ zeile: 'z1', grund: 'Zeilenschutz' }]);
    expect(s.gesehen.map((v) => v.zeile)).toEqual(['z1', 'z2']);
  });

  it('zählt einen unklaren Ausgang hoch und versucht es später wieder', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);

    const bericht = await nachsenden(l, senderMit({ art: 'unklar', grund: '500' }));

    expect(bericht).toEqual({ gesendet: 0, abgelehnt: 0, offen: 1 });
    expect(l.inhalt()[0].versuche).toBe(1);
    expect(gemeldet).toHaveLength(0); // noch ist nichts verloren
  });

  it('gibt eine vergiftete Zeile nach der Grenze auf, statt die Schlange zu blockieren', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);

    for (let i = 0; i < VERSUCHE_GRENZE; i += 1) {
      await nachsenden(l, senderMit({ art: 'unklar', grund: '500' }));
    }

    expect(l.inhalt()).toHaveLength(0);
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0].grund).toContain(`${VERSUCHE_GRENZE} Versuchen`);
  });

  it('zählt fehlendes Netz NICHT als Versuch — eine Woche offline vergiftet nichts', async () => {
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);

    for (let i = 0; i < VERSUCHE_GRENZE + 3; i += 1) {
      await nachsenden(l, senderMit({ art: 'kein-netz' }));
    }

    expect(l.inhalt()).toHaveLength(1);
    expect(l.inhalt()[0].versuche).toBe(0);
    expect(gemeldet).toHaveLength(0);
  });

  it('lässt sich von einem Fehler in der Meldung nicht mitreissen', async () => {
    beiVormerkungFehlgeschlagen(() => {
      throw new Error('Anzeige kaputt');
    });
    const l = lagerImKopf();
    await schreiben(auftrag('z1'), l, senderMit(), imFunkloch);
    await schreiben(auftrag('z2'), l, senderMit(), imFunkloch);

    const bericht = await nachsenden(l, senderMit({ art: 'abgelehnt', grund: 'x' }, { art: 'ok' }));
    expect(bericht).toEqual({ gesendet: 1, abgelehnt: 1, offen: 0 });
  });
});
