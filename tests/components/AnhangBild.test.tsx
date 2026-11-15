import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import AnhangBild from '@/features/nachrichten/AnhangBild';

/**
 * L4: ein Bild im Verlauf, das schon steht, behält seine Adresse, wenn die
 * Adresse erneuert wird — sonst holte der Browser es alle neun Minuten noch
 * einmal. Eines, das noch lädt oder scheiterte, nimmt die neue.
 *
 * GEGENPROBE (Erwartung): ein schlichtes `<img src={url}>` wechselt immer —
 * der erste Fall ist dann rot, die beiden anderen grün.
 */
describe('Ein Bild im Verlauf', () => {
  it('geladen: eine neue Adresse ändert nichts', () => {
    const { container, rerender } = render(<AnhangBild src="https://s/a?t=1" alt="Foto" />);
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    rerender(<AnhangBild src="https://s/a?t=2" alt="Foto" />);
    expect(img.getAttribute('src')).toBe('https://s/a?t=1');
  });

  it('bleibt gleich: noch nicht geladen, nimmt es die neue Adresse', () => {
    const { container, rerender } = render(<AnhangBild src="https://s/a?t=1" alt="Foto" />);
    rerender(<AnhangBild src="https://s/a?t=2" alt="Foto" />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://s/a?t=2');
  });

  it('gescheitert (abgelaufen), nimmt es die neue Adresse', () => {
    const { container, rerender } = render(<AnhangBild src="https://s/a?t=1" alt="Foto" />);
    const img = container.querySelector('img')!;
    fireEvent.load(img);
    rerender(<AnhangBild src="https://s/a?t=2" alt="Foto" />);
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe('https://s/a?t=2');
  });
});
