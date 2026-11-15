import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ListRow } from '@/components/ListRow';

/*
  F15: Wischen an der Zeile. Der echte Finger läuft im Browser
  (`bewegungen.spec.ts`); hier: nur am Handy, zu stumm (inert, aria-hidden),
  waagrecht gewischt offen, der Tipp ruft denselben Aufruf und schließt.
*/
const alsBreite = (handy: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
  matches: handy ? /max-width/.test(q) : /min-width/.test(q), media: q,
  addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
}));
afterEach(() => vi.unstubAllGlobals());

function touch(ziel: Element, type: string, x: number, y: number) {
  const t = { identifier: 1, clientX: x, clientY: y };
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { touches: { value: type === 'touchend' ? [] : [t] }, changedTouches: { value: [t] } });
  fireEvent(ziel, e);
}

describe('Wischen an der Zeile', () => {
  it('gleich geblieben: ab dem Tablet keine Wischfläche', () => {
    alsBreite(false);
    const { container } = render(<ul><ListRow title="Eintrag" wischen={[{ text: 'Löschen', onClick: vi.fn() }]} /></ul>);
    expect(container.querySelector('[data-wischbar], .wisch-aktionen')).toBeNull();
  });

  it('am Handy: zu stumm, nach links gewischt offen, der Tipp ruft die Aktion', () => {
    alsBreite(true);
    const loeschen = vi.fn();
    const { container } = render(<ul><ListRow title="Eintrag" wischen={[{ text: 'Löschen', name: 'Eintrag löschen', onClick: loeschen }]} /></ul>);
    const zeile = container.querySelector('li')!;
    const flaeche = container.querySelector('.wisch-aktionen')!;
    expect(flaeche).toHaveAttribute('inert', '');
    expect(flaeche).toHaveAttribute('aria-hidden', 'true');
    // jsdom misst keine Breite: die Fläche ist 88 px breit.
    Object.defineProperty(flaeche, 'offsetWidth', { value: 88 });
    act(() => {
      touch(zeile, 'touchstart', 300, 100);
      touch(zeile, 'touchmove', 250, 102);
      touch(zeile, 'touchmove', 180, 103);
      touch(zeile, 'touchend', 180, 103);
    });
    expect(zeile.style.getPropertyValue('--wisch-x')).toBe('-88px');
    expect(flaeche).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Eintrag löschen' }));
    expect(loeschen).toHaveBeenCalledTimes(1);
    expect(zeile.style.getPropertyValue('--wisch-x')).toBe('0px');
  });

  it('senkrecht ist Rollen, nicht Wischen', () => {
    alsBreite(true);
    const { container } = render(<ul><ListRow title="Eintrag" wischen={[{ text: 'Löschen', onClick: vi.fn() }]} /></ul>);
    const zeile = container.querySelector('li')!;
    act(() => {
      touch(zeile, 'touchstart', 300, 100);
      touch(zeile, 'touchmove', 296, 160);
      touch(zeile, 'touchend', 296, 160);
    });
    expect(zeile.style.getPropertyValue('--wisch-x') || '0px').toBe('0px');
  });
});
