import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import OhneUmbruch from '@/components/OhneUmbruch';

/** U8: kurze Wörter mit Bindestrich bleiben beisammen, lange dürfen brechen. */
describe('OhneUmbruch', () => {
  it('hält Nummern und Doppelnamen als Ganzes', () => {
    const { container } = render(<p><OhneUmbruch text="PR-2026-0189 · Familie Berger-Steinmetz (Claude-Test)" /></p>);
    const nr = [...container.querySelectorAll('span.nr')].map((s) => s.textContent);
    expect(nr).toEqual(['PR-2026-0189', 'Berger-Steinmetz', '(Claude-Test)']);
    expect(container.textContent).toBe('PR-2026-0189 · Familie Berger-Steinmetz (Claude-Test)');
  });

  it('lässt lange Wörter umbrechbar — sie liefen sonst aus der Zeile', () => {
    const lang = 'Wohnungseigentümergemeinschaft-Hauptstraße';
    const { container } = render(<p><OhneUmbruch text={lang} /></p>);
    expect(container.querySelector('span.nr')).toBeNull();
    expect(container.textContent).toBe(lang);
  });

  it('Text ohne Bindestrich und leere Werte bleiben, wie sie sind', () => {
    const { container, rerender } = render(<p><OhneUmbruch text="Familie Huber" /></p>);
    expect(container.querySelector('span')).toBeNull();
    expect(container.textContent).toBe('Familie Huber');
    rerender(<p><OhneUmbruch text={null} /></p>);
    expect(container.textContent).toBe('');
  });
});
