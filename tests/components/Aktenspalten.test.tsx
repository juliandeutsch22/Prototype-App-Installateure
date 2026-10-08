import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Aktenspalten from '@/components/Aktenspalten';

const vorher = window.matchMedia;
function breite(schreibtisch: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: schreibtisch && q.includes('min-width: 1200px'),
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => {
  window.matchMedia = vorher;
});

const a = <section>A</section>;
const b = <section>B</section>;
const c = <section>C</section>;

function reihenfolge() {
  return Array.from(document.querySelectorAll('section')).map((s) => s.textContent);
}

describe('Aktenspalten', () => {
  it('zeigt am Telefon die Telefon-Reihenfolge, ohne Spalten', () => {
    breite(false);
    render(<Aktenspalten telefon={[a, b, c]} links={[b, c]} rechts={[a]} />);
    expect(reihenfolge()).toEqual(['A', 'B', 'C']);
    expect(document.querySelector('.zwei-spalten')).toBeNull();
  });

  it('ordnet am Schreibtisch links und rechts — jede Karte genau einmal', () => {
    breite(true);
    render(<Aktenspalten telefon={[a, b, c]} links={[b, c]} rechts={[a]} />);
    const spalten = document.querySelectorAll('.zwei-spalten > .spalte');
    expect(spalten).toHaveLength(2);
    expect(spalten[0].textContent).toBe('BC');
    expect(spalten[1].textContent).toBe('A');
    expect(screen.getAllByText('A')).toHaveLength(1);
  });

  it('bleibt einspaltig, wenn eine Seite leer bliebe', () => {
    breite(true);
    render(<Aktenspalten telefon={[a, null]} links={[a]} rechts={[null]} />);
    expect(document.querySelector('.zwei-spalten')).toBeNull();
    expect(reihenfolge()).toEqual(['A']);
  });

  // Gegenprobe zur leeren Seite: eine ausgeblendete Karte allein macht die
  // Seite nicht leer, solange eine andere darin steht.
  it('bleibt zweispaltig, wenn auf einer Seite nur eine von zwei Karten fehlt', () => {
    breite(true);
    render(<Aktenspalten telefon={[a, b, null]} links={[b]} rechts={[a, null]} />);
    expect(document.querySelector('.zwei-spalten')).not.toBeNull();
  });
});
