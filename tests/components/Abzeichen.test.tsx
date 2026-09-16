import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Marke, Zustand, Warnung, RoleBadge } from '@/components/Badge';
import StatusBadge from '@/components/StatusBadge';

/**
 * Die drei Formen — und die eine Regel, auf der alles steht.
 *
 * DIE GEFÜLLTE PILLE GIBT ES NUR NOCH BEI EINER WARNUNG. Das ist nicht
 * Geschmack, sondern die Bedingung dafür, dass sie überhaupt etwas heisst:
 * solange „40 h Budget" genauso aussah wie „über Budget", sagte eine gefüllte
 * Pille nichts über Dringlichkeit. Fällt diese Prüfung, ist der Gewinn wieder
 * weg — und zwar unbemerkt, weil jede einzelne Ansicht für sich weiter
 * vernünftig aussieht.
 */

/** Hat das Abzeichen eine eigene Fläche? Genau das unterscheidet die Formen. */
function hatFlaeche(el: HTMLElement): boolean {
  return [...el.classList].some((k) => k.startsWith('bg-'));
}

describe('Die Marke — eine Tatsache ohne Urteil', () => {
  it('trägt keine Fläche und keine Farbe', () => {
    render(<Marke>40 h Budget</Marke>);
    const marke = screen.getByText('40 h Budget');

    expect(hatFlaeche(marke)).toBe(false);
    expect(marke.className).not.toMatch(/text-(danger|warning|success)/);
  });

  it('spricht in der Stimme der Kartentitel', () => {
    /*
      `section-label` ist die Klasse, die auch über jeder Karte steht: klein,
      gedämpft, begleitend. Eine Notiz in der Zeile hat genau diese Rolle —
      sie ordnet sich dem Namen unter, nach dem jemand sucht.
    */
    render(<Marke>verrechnet</Marke>);
    expect([...screen.getByText('verrechnet').classList]).toContain('section-label');
  });
});

describe('Der Zustand — ein Wert aus einer kleinen Menge', () => {
  it('zeigt einen Punkt in der Farbe des Werts, nicht eine gefüllte Pille', () => {
    const { container } = render(<Zustand stand="schlecht">Überfällig</Zustand>);
    const abzeichen = screen.getByText(/Überfällig/);
    const punkt = container.querySelector('span[aria-hidden="true"]')!;

    expect(hatFlaeche(abzeichen)).toBe(false);
    expect([...punkt.classList]).toContain('bg-danger');
  });

  it('verschiedene Werte tragen verschiedene Punkte', () => {
    // Sonst wäre der Punkt Zierrat und die Liste nicht mehr zu überfliegen.
    const { container: gut } = render(<Zustand stand="gut">Bezahlt</Zustand>);
    const { container: ruht } = render(<Zustand stand="ruht">Storniert</Zustand>);

    const klasse = (c: HTMLElement) =>
      [...c.querySelector('span[aria-hidden="true"]')!.classList].find((k) => k.startsWith('bg-'));
    expect(klasse(gut)).not.toBe(klasse(ruht));
  });

  it('der Punkt sagt dem Vorleser nichts — das tut das Wort', () => {
    const { container } = render(<Zustand stand="gut">Bezahlt</Zustand>);
    expect(container.querySelector('span[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText(/Bezahlt/)).toBeInTheDocument();
  });
});

describe('Die Warnung — die einzige gefüllte Pille', () => {
  it('trägt eine Fläche', () => {
    render(<Warnung>3 knapp</Warnung>);
    expect(hatFlaeche(screen.getByText('3 knapp'))).toBe(true);
  });

  it('hat zwei Stufen, und die dringende ist die rote', () => {
    render(<Warnung stufe="achtung">12 Tage</Warnung>);
    render(<Warnung stufe="dringend">90 Tage</Warnung>);

    expect([...screen.getByText('12 Tage').classList]).toContain('bg-warning-bg');
    expect([...screen.getByText('90 Tage').classList]).toContain('bg-danger-bg');
  });

  it('ist ohne Angabe die mildere Stufe', () => {
    // Wer sich nicht entscheidet, soll nicht versehentlich Alarm schlagen.
    render(<Warnung>bitte prüfen</Warnung>);
    expect([...screen.getByText('bitte prüfen').classList]).toContain('bg-warning-bg');
  });
});

describe('Der Status eines Geschäftsobjekts', () => {
  it('ist ein Zustand und keine Warnung — auch „Überfällig"', () => {
    /*
      DER STATUS SAGT, WO ETWAS STEHT, NICHT WAS ZU TUN IST. Was zu tun ist,
      steht daneben: „3 Tage" am Mahnlauf, „12 Tage" an der unverrechneten
      Leistung. Stünde beides als gefüllte Pille da, riefe die Zeile zweimal
      dasselbe — und die eine Pille, die wirklich etwas verlangt, ginge darin
      unter.
    */
    render(<StatusBadge status="Überfällig" />);
    expect(hatFlaeche(screen.getByText(/Überfällig/))).toBe(false);
  });

  it('kennt einen unbekannten Status, ohne zu werfen', () => {
    render(<StatusBadge status="Irgendwas" />);
    expect(screen.getByText(/Irgendwas/)).toBeInTheDocument();
  });
});

describe('Die Rolle', () => {
  it('ist eine Marke — sechs Farben für sechs Rollen waren eine Legende', () => {
    /*
      Niemand lernt sie auswendig, und sie standen in Listen neben
      Status-Pillen, mit denen sie nichts zu tun haben. Das Wort
      „Buchhaltung" sagt, was „Gelb" nicht sagt.
    */
    render(<RoleBadge role="Buchhaltung" />);
    const rolle = screen.getByText('Buchhaltung');

    expect(hatFlaeche(rolle)).toBe(false);
    expect([...rolle.classList]).toContain('section-label');
  });
});
