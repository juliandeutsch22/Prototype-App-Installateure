import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Avatar from '@/components/Avatar';

/*
  E95 (17.11.2026): „das Icon mit dem Namenskürzel sollte ganz rund sein“ —
  in der Kopfleiste am Handy, in der Seitenleiste und im Profil. Rund wie die
  Kürzel in den Nachrichten; eine Baustelle bleibt dort eckig.
  Gegenprobe: mit der Klasse `rounded` (vorher) ist die erste Prüfung rot.
*/
describe('Das Namenskürzel', () => {
  it('ist ein Kreis in jeder Größe', () => {
    for (const size of [32, 34, 36, 48]) {
      const { container, unmount } = render(<Avatar name="Julian Deutsch" size={size} />);
      const el = container.querySelector('.lot-avatar') as HTMLElement;
      expect(el.className.split(' ')).toContain('rounded-full');
      expect(el.className.split(' ')).not.toContain('rounded');
      expect([el.style.width, el.style.height]).toEqual([`${size}px`, `${size}px`]);
      expect(el.textContent).toBe('JD');
      unmount();
    }
  });

  it('kein Stil darf die Rundung zurücknehmen', () => {
    const quelle = ['src/index.css', 'src/styles/lot.css'].map((p) => readFileSync(resolve(process.cwd(), p), 'utf8')).join('\n');
    const regeln = [...quelle.matchAll(/([^{}]*\.lot-avatar[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);
    expect(regeln.length).toBeGreaterThan(0);
    for (const r of regeln) expect(r).not.toMatch(/border-radius/);
  });
});
