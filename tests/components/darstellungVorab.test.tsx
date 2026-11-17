import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { darstellungAnwenden, wirksam } from '@/lib/darstellung';

/**
 * L10, Nacharbeit: das eingebettete Skript in `index.html` setzt vor dem
 * ersten Bild denselben Grund wie später `darstellungAnwenden` — dunkel bei
 * „Dunkel“ und bei „System“ mit dunklem Gerät, sonst bleibt das helle Papier.
 *
 * GEGENPROBE (Erwartung): ohne das Skript bleibt bei „Dunkel“ das helle
 * Papier — der erste Fall ist rot.
 */
const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const skript = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

function geraet(dunkel: boolean) {
  window.matchMedia = ((q: string) => ({ matches: dunkel && q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
}

function vorab(wahl: string | null, dunkel = false) {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.setAttribute('style', 'background-color:#ffffff');
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  if (wahl) localStorage.setItem('senklot.darstellung', wahl);
  else localStorage.removeItem('senklot.darstellung');
  geraet(dunkel);
  new Function(skript)();
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    grund: document.documentElement.style.backgroundColor,
    leiste: document.querySelector('meta[name="theme-color"]')!.getAttribute('content'),
  };
}

beforeEach(() => localStorage.clear());

describe('Darstellung vor dem ersten Bild', () => {
  it('„Dunkel“: dunkler Grund, Statusbalken dunkel', () => {
    expect(vorab('dunkel')).toEqual({ theme: 'dark', grund: 'rgb(12, 28, 32)', leiste: '#0c1c20' });
  });

  it('„System“ folgt dem Gerät', () => {
    expect(vorab('system', true).theme).toBe('dark');
    expect(vorab('system', false).theme).toBeNull();
  });

  it('bleibt gleich: „Hell“ und ohne Wahl der helle Grund', () => {
    expect(vorab(null, true)).toEqual({ theme: null, grund: 'rgb(255, 255, 255)', leiste: '#ffffff' });
    expect(vorab('hell', true).theme).toBeNull();
  });

  it('dasselbe Ergebnis wie die App danach', () => {
    for (const [wahl, dunkel] of [['dunkel', false], ['system', true], ['system', false], [null, true]] as const) {
      const vorher = vorab(wahl, dunkel);
      darstellungAnwenden();
      expect(document.documentElement.getAttribute('data-theme')).toBe(vorher.theme);
      expect(document.documentElement.style.backgroundColor).toBe(vorher.grund);
      expect(wirksam(wahl === 'system' ? 'system' : wahl === 'dunkel' ? 'dunkel' : 'hell')).toBe(vorher.theme ? 'dunkel' : 'hell');
    }
  });

  it('ohne lesbaren Speicher (privates Fenster) hell — kein Fehler', () => {
    const echt = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('gesperrt'); }, configurable: true });
    try {
      document.documentElement.removeAttribute('data-theme');
      expect(() => new Function(skript)()).not.toThrow();
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', echt);
    }
  });
});
