import { describe, expect, it } from 'vitest';
import { gleitDauer, gleitVerlauf, ueberschwingen } from '@/lib/untenGleiten';

/*
  E95: die Auswahlfläche der unteren Leiste fährt zum neuen Punkt und federt
  dort ein wenig nach. Hier die Rechnung; ob sie im Browser wirklich fährt,
  prüft `tests/links/bewegungen.spec.ts` („E95 Untere Leiste“).
*/
describe('Gleiten der unteren Leiste', () => {
  it('zum Nachbarn knapp 300 ms, über die ganze Leiste höchstens 420 ms', () => {
    expect(gleitDauer(75)).toBe(285);
    expect(gleitDauer(-75)).toBe(285);
    expect(gleitDauer(10)).toBe(280);
    expect(gleitDauer(300)).toBe(420);
  });

  it('schießt in Fahrtrichtung über das Ziel hinaus und kommt ohne Versatz an', () => {
    // Die alte Stelle lag 150 px links: die Fläche fährt nach rechts und schießt rechts hinaus.
    const rechts = gleitVerlauf(-150);
    expect(rechts[0].transform).toBe('translateX(-150px) scaleX(1)');
    expect(rechts[1].transform).toBe('translateX(4px) scaleX(1)');
    expect(rechts[rechts.length - 1].transform).toBe('translateX(0px) scaleX(1)');
    const links = gleitVerlauf(75);
    expect(links[1].transform).toBe('translateX(-3.75px) scaleX(1)');
    expect(ueberschwingen(400)).toBe(4);
  });

  it('gleich geblieben: ohne Strecke kein Weg', () => {
    expect(gleitVerlauf(0)).toEqual([]);
    expect(gleitVerlauf(0.2)).toEqual([]);
  });
});
