import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Company } from '@/types';

/**
 * Das Zeichen des Betriebs.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG WERT IST. Der Ersatz war fest auf
 * `/perl-logo.png` verdrahtet: ein zweiter Betrieb ohne eigenes Logo sah
 * damit das Zeichen des ERSTEN — jeden Tag, in seiner Seitenleiste. Das ist
 * kein Schönheitsfehler, sondern eine falsche Aussage darüber, wessen Betrieb
 * man vor sich hat. Und es ist die Sorte Fehler, die erst beim zweiten Kunden
 * auffällt, also genau dann, wenn er am teuersten ist.
 */

const BETRIEB: Company = {
  id: 'perl', name: 'Perl Installationen',
} as Company;

let betrieb: Company | null = BETRIEB;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ company: betrieb }) }));

const { default: BrandLogo } = await import('@/components/BrandLogo');

const EIN_BILD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeEach(() => {
  betrieb = BETRIEB;
});

describe('Was in der Kopfleiste steht', () => {
  it('zeigt das hinterlegte Logo des Betriebs', () => {
    betrieb = { ...BETRIEB, logoUrl: EIN_BILD } as Company;
    render(<BrandLogo />);

    const bild = screen.getByRole('img', { name: 'Perl Installationen' });
    expect(bild).toHaveAttribute('src', EIN_BILD);
  });

  it('zeigt ohne hinterlegtes Logo den NAMEN des Betriebs', () => {
    render(<BrandLogo />);
    expect(screen.getByText('Perl Installationen')).toBeInTheDocument();
  });

  it('zeigt dabei KEIN Bild — auch kein Ersatzbild', () => {
    /*
      DIE PRÜFUNG, UM DIE ES GEHT. Vorher stand hier `/perl-logo.png`. Ein
      zweiter Betrieb ohne eigenes Logo bekäme damit das Zeichen des ersten
      zu sehen. Ein Platzhalterbild wäre nur unwesentlich besser: es sagt
      nichts, wo etwas zu sagen wäre.
    */
    betrieb = { id: 'zweiter', name: 'Installationen Mustermann' } as Company;
    render(<BrandLogo />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Installationen Mustermann')).toBeInTheDocument();
    expect(screen.queryByText(/Perl/)).not.toBeInTheDocument();
  });

  it('behauptet nichts, solange der Betrieb noch lädt', () => {
    // Weder Bild noch geratener Name: beim Wechsel zwischen zwei Mandanten
    // wäre ein kurz aufblitzender falscher Name genau das Falsche.
    betrieb = null;
    render(<BrandLogo />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Installationen/)).not.toBeInTheDocument();
  });

  it('hält einen langen Namen in der Spur', () => {
    /*
      Die Seitenleiste ist 16rem breit. Ein Name wie dieser darf sie nicht
      auseinanderdrücken — und der volle Name bleibt am Mauszeiger lesbar.

      GEPRÜFT WIRD DIE GRENZE, NICHT DIE TECHNIK. Vorher stand hier
      `truncate`, also EINE Zeile mit Auslassungspunkten; das schnitt schon
      „Perl Installationen GmbH" mitten im Wort ab. Jetzt bricht der Name um
      und wird erst nach DREI Zeilen begrenzt. Was beide Fassungen
      gemeinsam haben und worauf es ankommt: es gibt eine Grenze, und der
      vollständige Name bleibt erreichbar.
    */
    betrieb = {
      id: 'lang', name: 'Installationen Mustermann Gesellschaft m.b.H. & Co KG',
    } as Company;
    render(<BrandLogo />);

    const schriftzug = screen.getByText(/Mustermann/);
    expect(schriftzug).toHaveClass('line-clamp-3');
    expect(schriftzug.parentElement).toHaveAttribute(
      'title',
      'Installationen Mustermann Gesellschaft m.b.H. & Co KG',
    );
  });
});
