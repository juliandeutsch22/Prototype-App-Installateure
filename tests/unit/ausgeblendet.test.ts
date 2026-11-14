// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HOECHSTENS, alleAusblenden, alleZeigen, aufgeraeumt, einenAusblenden, istAusgeblendet, lesen } from '@/lib/ausgeblendet';

/*
  AUSGEBLENDET AUF DIESEM GERÄT (14.11.2026): einzeln und „alle“, je Liste und
  Person, mit festen Grenzen — auch nach Jahren voller Einträge bleibt der
  Speicher klein. Kaputter Speicher heißt: nichts ausgeblendet.
*/
describe('lib/ausgeblendet', () => {
  beforeEach(() => window.localStorage.clear());

  it('einzeln ausblenden, je Liste und Person getrennt', () => {
    einenAusblenden('zeitprotokoll', 'u1', 'a', 100);
    expect(istAusgeblendet(lesen('zeitprotokoll', 'u1'), 'a', 100)).toBe(true);
    expect(istAusgeblendet(lesen('zeitprotokoll', 'u1'), 'b', 100)).toBe(false);
    // Gegenprobe: eine andere Person oder Liste sieht den Eintrag weiter.
    expect(istAusgeblendet(lesen('zeitprotokoll', 'u2'), 'a', 100)).toBe(false);
    expect(istAusgeblendet(lesen('andere', 'u1'), 'a', 100)).toBe(false);
  });

  it('„alle ausblenden“ merkt sich nur den Zeitpunkt — Neueres steht wieder da, ältere Einzelne fallen weg', () => {
    einenAusblenden('zeitprotokoll', 'u1', 'alt', 50);
    einenAusblenden('zeitprotokoll', 'u1', 'neu', 500);
    const stand = alleAusblenden('zeitprotokoll', 'u1', 200);
    expect(stand).toEqual({ bis: 200, einzeln: { neu: 500 } });
    expect(istAusgeblendet(stand, 'irgendeiner', 150)).toBe(true);
    expect(istAusgeblendet(stand, 'spaeter', 300)).toBe(false);
    // Die Grenze geht nie zurück.
    expect(alleAusblenden('zeitprotokoll', 'u1', 100).bis).toBe(200);
  });

  it('wieder zeigen leert den Speicher ganz', () => {
    einenAusblenden('zeitprotokoll', 'u1', 'a', 100);
    alleAusblenden('zeitprotokoll', 'u1', 50);
    expect(alleZeigen('zeitprotokoll', 'u1')).toEqual({ bis: 0, einzeln: {} });
    expect(window.localStorage.length).toBe(0);
  });

  it('mehr als HOECHSTENS Einzelne: die neuesten zählen', () => {
    const einzeln: Record<string, number> = {};
    for (let i = 0; i < HOECHSTENS + 50; i++) einzeln[`e${i}`] = i + 1;
    const sauber = aufgeraeumt({ bis: 0, einzeln });
    expect(Object.keys(sauber.einzeln)).toHaveLength(HOECHSTENS);
    expect(sauber.einzeln[`e${HOECHSTENS + 49}`]).toBeDefined();
    expect(sauber.einzeln.e0).toBeUndefined();
  });

  it('kaputter Speicher: nichts ausgeblendet, kein Absturz', () => {
    window.localStorage.setItem('senklot.ausgeblendet:zeitprotokoll:u1', '{kaputt');
    expect(lesen('zeitprotokoll', 'u1')).toEqual({ bis: 0, einzeln: {} });
    window.localStorage.setItem('senklot.ausgeblendet:zeitprotokoll:u1', JSON.stringify({ bis: 'x', einzeln: { a: 'b', c: 3 } }));
    expect(lesen('zeitprotokoll', 'u1')).toEqual({ bis: 0, einzeln: { c: 3 } });
  });
});
