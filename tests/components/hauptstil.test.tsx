import { describe, it, expect, beforeEach } from 'vitest';
import { hauptstilBereit } from '@/lib/hauptstil';
import { darstellungAnwenden } from '@/lib/darstellung';

/**
 * L10: die App schaltet das Stylesheet ein und zeichnet erst, wenn es geladen
 * ist; scheitert es, zeichnet sie trotzdem. Ohne solches Stylesheet
 * (Entwicklung, Vorschau) sofort.
 */
beforeEach(() => {
  document.head.innerHTML = '';
});

function stil(): HTMLLinkElement {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.media = 'print';
  l.setAttribute('data-hauptstil', '');
  document.head.appendChild(l);
  return l;
}

describe('Das Stylesheet einschalten', () => {
  it('schaltet auf alle Medien und wartet, bis es geladen ist', async () => {
    const l = stil();
    let fertig = false;
    const warten = hauptstilBereit().then(() => { fertig = true; });
    expect(l.media).toBe('all');
    await Promise.resolve();
    expect(fertig).toBe(false);
    l.dispatchEvent(new Event('load'));
    await warten;
    expect(fertig).toBe(true);
  });

  it('scheitert es, zeichnet die App trotzdem', async () => {
    const l = stil();
    const warten = hauptstilBereit();
    l.dispatchEvent(new Event('error'));
    await expect(warten).resolves.toBeUndefined();
  });

  it('bleibt gleich: ohne solches Stylesheet sofort', async () => {
    await expect(hauptstilBereit()).resolves.toBeUndefined();
  });
});

describe('Der Grund am <html> folgt der Darstellung', () => {
  it('hell: Papier; dunkel: der dunkle Grund', () => {
    localStorage.removeItem('senklot.darstellung');
    darstellungAnwenden();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(244, 240, 232)');
    localStorage.setItem('senklot.darstellung', 'dunkel');
    darstellungAnwenden();
    expect(document.documentElement.style.backgroundColor).toBe('rgb(33, 31, 28)');
    localStorage.removeItem('senklot.darstellung');
    darstellungAnwenden();
  });
});
