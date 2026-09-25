import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StartKopf from '@/features/dashboard/StartKopf';
import { gruss, grussZeile, vorname } from '@/features/dashboard/gruss';

/**
 * Der Kopf der Startseite (docs/design/linie.md 9): klein Datum und KW,
 * groß der Gruß nach der Tageszeit mit dem Vornamen.
 */
describe('Gruß nach der Tageszeit', () => {
  const um = (h: number, m = 0) => new Date(2026, 8, 25, h, m);

  it('bis 11 Uhr „Guten Morgen“', () => {
    expect(gruss(um(5))).toBe('Guten Morgen');
    expect(gruss(um(10, 59))).toBe('Guten Morgen');
  });

  it('bis 17 Uhr „Guten Tag“', () => {
    expect(gruss(um(11))).toBe('Guten Tag');
    expect(gruss(um(16, 59))).toBe('Guten Tag');
  });

  it('danach „Guten Abend“', () => {
    expect(gruss(um(17))).toBe('Guten Abend');
    expect(gruss(um(23, 30))).toBe('Guten Abend');
  });

  it('nimmt den Vornamen aus dem Namen', () => {
    expect(vorname('Max Mustermann')).toBe('Max');
    expect(vorname('  Anton   Berger-Steinmetz ')).toBe('Anton');
    expect(vorname('Nora')).toBe('Nora');
    expect(grussZeile(um(7), 'Max Testermann')).toBe('Guten Morgen, Max');
  });

  it('lässt ohne Namen Komma und Lücke weg', () => {
    expect(grussZeile(um(7), '')).toBe('Guten Morgen');
    expect(grussZeile(um(7), undefined)).toBe('Guten Morgen');
  });
});

describe('Kopf der Startseite', () => {
  it('trägt Datum · KW klein über dem Gruß als Überschrift', () => {
    render(<StartKopf datum="Freitag, 25.09.2026" kw={39} titel="Guten Morgen, Max" band={false} />);
    const titel = screen.getByRole('heading', { level: 1, name: 'Guten Morgen, Max' });
    expect(titel.previousElementSibling).toHaveTextContent('Freitag, 25.09.2026 · KW 39');
  });

  it('am Telefon für den Monteur als dunkles Band — mit genau einer Überschrift', () => {
    // Ohne `matchMedia` (jsdom) gilt: schmal, also Telefon.
    const { container } = render(
      <StartKopf
        datum="Freitag, 25.09.2026"
        kw={39}
        feiertag="Nationalfeiertag"
        titel="Guten Morgen, Max"
        band
      />,
    );
    expect(container.querySelector('.start-band')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Nationalfeiertag')).toHaveClass('start-band-feiertag');
  });
});
