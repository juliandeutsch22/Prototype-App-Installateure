// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { aendertEtwas, naechsterWerktag, umplanText, zielAus, type Last } from '@/features/assignments/umplanen';

/*
  UMPLANEN IM WOCHENPLAN (E88): der nächste Werktag, das Ziel unter dem
  Finger, ob ein Ablegen etwas ändert, und die Meldung danach.
*/
describe('naechsterWerktag', () => {
  it('Freitag → Montag', () => {
    expect(naechsterWerktag('2026-11-13')).toBe('2026-11-16');
  });
  it('über einen Feiertag: Di 7.12.2027 → Do 9.12. (8.12. Mariä Empfängnis)', () => {
    expect(naechsterWerktag('2027-12-07')).toBe('2027-12-09');
  });
  it('Gegenprobe: Mittwoch → Donnerstag', () => {
    expect(naechsterWerktag('2026-11-11')).toBe('2026-11-12');
  });
  it('über Weihnachten: Do 24.12.2026 → Mo 28.12. (25., 26. Feiertag, Wochenende)', () => {
    expect(naechsterWerktag('2026-12-24')).toBe('2026-12-28');
  });
});

describe('zielAus', () => {
  it('die Zelle unter dem Punkt, auch von einem Kind aus', () => {
    document.body.innerHTML = '<table><tr><td data-ziel-tag="2026-11-12" data-ziel-person="u1"><span id="kind">x</span></td></tr></table>';
    expect(zielAus(document.getElementById('kind'))).toEqual({ tag: '2026-11-12', person: 'u1' });
  });
  it('Gegenprobe: außerhalb einer Zelle nichts', () => {
    document.body.innerHTML = '<div id="weg">x</div>';
    expect(zielAus(document.getElementById('weg'))).toBeNull();
    expect(zielAus(null)).toBeNull();
  });
});

describe('aendertEtwas', () => {
  const e: Last = { art: 'einsatz', id: 'a', tag: '2026-11-12', person: 'u1', nummer: 'B-1', titel: 'Huber' };
  it('auf die eigene Zelle: nichts — außer beim Kopieren', () => {
    expect(aendertEtwas(e, { tag: '2026-11-12', person: 'u1' }, false)).toBe(false);
    expect(aendertEtwas(e, { tag: '2026-11-12', person: 'u1' }, true)).toBe(true);
  });
  it('anderer Tag oder andere Person: ja', () => {
    expect(aendertEtwas(e, { tag: '2026-11-13', person: 'u1' }, false)).toBe(true);
    expect(aendertEtwas(e, { tag: '2026-11-12', person: 'u2' }, false)).toBe(true);
  });
  it('eine Baustelle aus „Noch einzuplanen“ plant immer', () => {
    expect(aendertEtwas({ art: 'baustelle', nummer: 'B-1', titel: 'Huber' }, { tag: '2026-11-12', person: 'u1' }, false)).toBe(true);
  });
});

describe('umplanText', () => {
  it('derselbe Mensch, anderer Tag', () => {
    expect(umplanText({ kopieren: false, titel: 'Familie Huber', vonPerson: 'Max', nachPerson: 'Max', nachTag: '2026-11-13', anderswo: false }))
      .toMatch(/^Familie Huber verschoben: Freitag/);
  });
  it('andere Person, kopiert, und dort auch anderswo', () => {
    const t = umplanText({ kopieren: true, titel: 'Familie Huber', vonPerson: 'Max', nachPerson: 'Nora', nachTag: '2026-11-13', anderswo: true });
    expect(t).toMatch(/^Familie Huber kopiert: Nora, Freitag/);
    expect(t).toMatch(/steht dort auch auf einer anderen Baustelle$/);
  });
});
