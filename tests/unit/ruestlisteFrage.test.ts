import { describe, it, expect } from 'vitest';
import { aufloesenText, entferntText, RuestlisteFrage, ruestlisteFrageAus, umzugText } from '@/lib/db/ruestlisteFrage';

/**
 * Die Frage nach der Rüstliste (P2): die Datenbank lehnt mit `SL428` ab und
 * schickt mit, was an der Liste hängt; die App liest es und nennt die Folge.
 */
describe('ruestlisteFrageAus', () => {
  it('liest die Zahlen aus dem Detail', () => {
    const f = ruestlisteFrageAus({ code: 'SL428', message: 'verwaist', details: '{"positionen": 3, "anforderungen": 1, "in_arbeit": 2}' });
    expect(f).toBeInstanceOf(RuestlisteFrage);
    expect([f?.positionen, f?.anforderungen, f?.inArbeit]).toEqual([3, 1, 2]);
  });

  it('Gegenprobe: ein anderer Fehler ist keine Frage; ohne lesbares Detail bleibt es eine', () => {
    expect(ruestlisteFrageAus({ code: '42501', message: 'nein' })).toBeNull();
    expect(ruestlisteFrageAus({ code: 'SL428', message: 'x', details: 'kaputt' })?.positionen).toBe(0);
  });
});

describe('die Texte', () => {
  it('nennt, was Auflösen tut — und was im Lager bleibt', () => {
    expect(aufloesenText({ positionen: 1, anforderungen: 0, inArbeit: 0 }))
      .toBe('Auflösen löscht die Rüstliste (eine Position) und gibt die Reservierung im Lager frei.');
    expect(aufloesenText({ positionen: 4, anforderungen: 2, inArbeit: 1 })).toBe(
      'Auflösen löscht die Rüstliste (4 Positionen) und gibt die Reservierung im Lager frei; 2 offene Anforderungen über die Fehlmenge werden zurückgezogen. '
      + 'Eine Anforderung hat das Lager schon in Arbeit — sie bleibt stehen und ist dort zu klären.',
    );
  });

  it('Nachsätze der Meldungen; ohne Liste kein Nachsatz', () => {
    expect(umzugText('mitgezogen')).toBe(' · die Rüstliste zog mit');
    expect(umzugText('zusammengefuehrt')).toBe(' · die Rüstliste kam zur Liste am Zieltag dazu');
    expect(umzugText(null)).toBe('');
    expect(entferntText(null)).toBe('');
    expect(entferntText({ ruestliste: 'aufgeloest', anforderungen: 1, in_arbeit: 2 }))
      .toBe(' · Rüstliste aufgelöst; 2 Anforderungen sind im Lager schon in Arbeit');
  });
});
