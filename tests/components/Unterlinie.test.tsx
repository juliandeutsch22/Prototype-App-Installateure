import { afterEach, describe, expect, it, vi } from 'vitest';
import { unterlinieHalten } from '@/lib/unterlinie';

/*
  B5 (Plan 15.11.2026): die Unterlinie gleitet. Die Bewegung misst
  `tests/links/bewegungen.spec.ts`; hier: der Strich entsteht nur, wo eine
  Markierung in einer Leiste wandert und Web Animations laufen dürfen — er ist
  stumm, und ohne Bewegung bleibt alles wie vorher.
*/
function leiste() {
  const nav = document.createElement('nav');
  nav.className = 'segment';
  nav.innerHTML = '<button class="segment-an" style="border-bottom:2px solid red">Offen</button><button style="border-bottom:2px solid transparent">Erledigt</button>';
  document.body.append(nav);
  return nav;
}
const mikro = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'animate'); });

describe('Unterlinie', () => {
  it('gleich geblieben: ohne Web Animations entsteht kein Strich', async () => {
    const nav = leiste();
    const stop = unterlinieHalten(document.body);
    nav.children[0].classList.remove('segment-an');
    nav.children[1].classList.add('segment-an');
    await mikro();
    expect(nav.querySelector('[data-unterlinie]')).toBeNull();
    stop();
  });

  it('wandert die Markierung, fährt ein stummer Strich', async () => {
    const fahrten: Keyframe[][] = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(bilder: Keyframe[]) { fahrten.push(bilder); return { onfinish: null, oncancel: null } as unknown as Animation; },
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const nav = leiste();
    // jsdom rechnet kein Layout: Breiten von Hand.
    for (const [i, b] of [...nav.children].entries()) b.getBoundingClientRect = () => ({ left: i * 100, width: 80, bottom: 40, top: 0, right: i * 100 + 80, height: 40, x: i * 100, y: 0, toJSON() {} });
    const stop = unterlinieHalten(document.body);
    nav.children[0].classList.remove('segment-an');
    nav.children[1].classList.add('segment-an');
    await mikro();
    const strich = nav.querySelector('[data-unterlinie]');
    expect(strich).not.toBeNull();
    expect(strich).toHaveAttribute('aria-hidden', 'true');
    expect(fahrten[0][0].transform).toBe('translateX(-100px) scaleX(1)');
    stop();
  });
});
