import { afterEach, describe, expect, it, vi } from 'vitest';
import { zeilenflussHalten, ZEILE_SELEKTOR } from '@/lib/zeilenfluss';

/*
  B2 (Plan 15.11.2026): der Beobachter über der App. Die Bewegung selbst misst
  `tests/links/bewegungen.spec.ts` im Browser; jsdom kennt keine Animationen —
  hier ist geprüft, was auch ohne sie gelten muss: der Fokus aus einer
  gegangenen Zeile geht auf die nächste, ohne Web Animations entsteht kein
  Abbild, und nach dem Abmelden tut der Beobachter nichts mehr.
*/
function liste(n: number) {
  const ul = document.createElement('ul');
  for (let i = 0; i < n; i++) {
    const li = document.createElement('li');
    li.className = 'zeile';
    li.innerHTML = `<button type="button">Zeile ${i}</button>`;
    ul.append(li);
  }
  document.body.append(ul);
  return ul;
}
const mikro = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('Zeilenfluss', () => {
  it('erkennt die Zeilen der Listen und des Gesprächs', () => {
    expect(ZEILE_SELEKTOR).toContain('li.zeile');
    expect(ZEILE_SELEKTOR).toContain('li.nachricht');
  });

  it('stand der Fokus in der gegangenen Zeile, geht er auf die nächste', async () => {
    const ul = liste(4);
    const stop = zeilenflussHalten(document.body);
    ul.children[1].querySelector('button')!.focus();
    ul.children[1].remove();
    await mikro();
    expect(document.activeElement).toBe(ul.children[1].querySelector('button'));
    expect(document.activeElement?.textContent).toBe('Zeile 2');
    stop();
  });

  it('war es die letzte Zeile, geht er auf die vorige', async () => {
    const ul = liste(3);
    const stop = zeilenflussHalten(document.body);
    ul.children[2].querySelector('button')!.focus();
    ul.children[2].remove();
    await mikro();
    expect(document.activeElement?.textContent).toBe('Zeile 1');
    stop();
  });

  it('gleich geblieben: stand der Fokus woanders, bleibt er dort', async () => {
    const ul = liste(3);
    const draussen = document.createElement('input');
    document.body.append(draussen);
    const stop = zeilenflussHalten(document.body);
    draussen.focus();
    ul.children[1].remove();
    await mikro();
    expect(document.activeElement).toBe(draussen);
    stop();
  });

  it('ohne Web Animations entsteht kein Abbild — das Ende ist dasselbe', async () => {
    const ul = liste(4);
    const stop = zeilenflussHalten(document.body);
    ul.children[1].remove();
    await mikro();
    expect(ul.querySelectorAll('[data-geist]')).toHaveLength(0);
    expect(ul.children).toHaveLength(3);
    stop();
  });

  it('abgemeldet rettet er nichts mehr', async () => {
    const ul = liste(3);
    const stop = zeilenflussHalten(document.body);
    stop();
    ul.children[1].querySelector('button')!.focus();
    ul.children[1].remove();
    await mikro();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('B3 neue Zeile', () => {
  it('ohne Web Animations: die Zeile steht sofort da, kein Abbild, keine Markierung', async () => {
    const ul = liste(3);
    const stop = zeilenflussHalten(document.body);
    const neu = document.createElement('li');
    neu.className = 'zeile';
    ul.insertBefore(neu, ul.children[1]);
    await mikro();
    expect(neu.getAttribute('style')).toBeNull();
    expect(ul.querySelectorAll('[data-geist]')).toHaveLength(0);
    stop();
  });

  it('mit Web Animations: nur die neue Zeile blendet ein, die umgestellte nicht', async () => {
    const aufrufe: Array<{ el: Element; bilder: Keyframe[] }> = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: HTMLElement, bilder: Keyframe[]) { aufrufe.push({ el: this, bilder }); return { onfinish: null, oncancel: null } as unknown as Animation; },
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      const ul = liste(4);
      const stop = zeilenflussHalten(document.body);
      await new Promise((r) => setTimeout(r, 650)); // Ruhe nach dem Start
      const neu = document.createElement('li');
      neu.className = 'zeile';
      ul.insertBefore(neu, ul.children[1]);
      await mikro();
      expect(aufrufe.some((a) => a.el === neu && a.bilder[0].opacity === 0)).toBe(true);
      aufrufe.length = 0;
      ul.insertBefore(ul.children[4], ul.children[0]); // umstellen
      await mikro();
      expect(aufrufe.some((a) => a.bilder[0].opacity === 0)).toBe(false);
      stop();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });
});
