/**
 * Gleiche Fehler zusammen — damit der zweite, andere Fehler nicht unter
 * vierzig gleichen verschwindet.
 */
import { describe, it, expect } from 'vitest';
import { fehlerGruppen, meldungen, type ProtokollZeile } from '@/features/plattform/fehlergruppen';

const z = (id: string, teil: Partial<ProtokollZeile>): ProtokollZeile => ({
  id, art: 'absturz', nachricht: 'x is undefined', createdAt: 1000, ...teil,
});

describe('Fehlergruppen', () => {
  it('bündelt nach Art und Meldung, zählt Vorfälle und Betroffene, jüngster zuerst', () => {
    const g = fehlerGruppen([
      z('1', { createdAt: 1000, wer: 'Hans', fassung: 'a', pfad: '/time' }),
      z('2', { createdAt: 3000, wer: 'Eva', fassung: 'b', pfad: '/time', geraet: 'iPhone' }),
      z('3', { createdAt: 2000, wer: 'Hans', fassung: 'a', pfad: '/customers/:id' }),
      z('4', { art: 'fehler', nachricht: 'anderer', createdAt: 5000 }),
      z('5', { art: 'meldung', beschreibung: 'hilfe', nachricht: 'x is undefined' }),
    ]);
    expect(g.map((x) => x.nachricht)).toEqual(['anderer', 'x is undefined']);
    const a = g[1];
    expect(a).toMatchObject({ anzahl: 3, zuerst: 1000, zuletzt: 3000, betroffen: 2 });
    expect(a.fassungen).toEqual(['a', 'b']);
    expect(a.ansichten).toEqual(['/time', '/customers/:id']);
    expect(a.beispiel.geraet).toBe('iPhone');
  });

  it('zählt auf der Plattform Betriebe statt Personen', () => {
    const g = fehlerGruppen([z('1', { betrieb: 'perl' }), z('2', { betrieb: 'perl' }), z('3', { betrieb: 'mayr' })]);
    expect(g[0].betroffen).toBe(2);
  });

  it('trennt Meldungen ab, jüngste zuerst', () => {
    const m = meldungen([
      z('1', { art: 'meldung', beschreibung: 'alt', createdAt: 1 }),
      z('2', {}),
      z('3', { art: 'meldung', beschreibung: 'neu', createdAt: 9 }),
    ]);
    expect(m.map((x) => x.beschreibung)).toEqual(['neu', 'alt']);
  });
});
