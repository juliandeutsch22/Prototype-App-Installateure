import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    render(<BrandLogo ort="leiste" />);

    const bild = screen.getByRole('img', { name: 'Perl Installationen' });
    expect(bild).toHaveAttribute('src', EIN_BILD);
  });

  it('zeigt ohne hinterlegtes Logo den NAMEN des Betriebs', () => {
    render(<BrandLogo ort="leiste" />);
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
    render(<BrandLogo ort="leiste" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Installationen Mustermann')).toBeInTheDocument();
    expect(screen.queryByText(/Perl/)).not.toBeInTheDocument();
  });

  it('behauptet nichts, solange der Betrieb noch lädt', () => {
    // Weder Bild noch geratener Name: beim Wechsel zwischen zwei Mandanten
    // wäre ein kurz aufblitzender falscher Name genau das Falsche.
    betrieb = null;
    render(<BrandLogo ort="leiste" />);

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
    render(<BrandLogo ort="leiste" />);

    const schriftzug = screen.getByText(/Mustermann/);
    // E100: die Grenze steht im Stil (`.marke-leiste .marke-name`: drei Zeilen), die Klasse trägt sie hierher.
    expect(schriftzug).toHaveClass('marke-name');
    expect(schriftzug.parentElement).toHaveClass('marke-leiste');
    expect(schriftzug.parentElement).toHaveAttribute(
      'title',
      'Installationen Mustermann Gesellschaft m.b.H. & Co KG',
    );
  });
});

/*
  WO DAS ZEICHEN STEHT (E100). Die Größe kommt aus dem Ort, nicht mehr aus
  einer Pixelzahl je Aufruf — die Maße stehen in `lot.css`. Gegenprobe: mit
  dem Stand vor E100 (Prop `height`, Schrift 0,4 × Höhe inline) fehlen die
  Ortsklassen, und die Vorschau zeigt den gespeicherten Betrieb.
*/
describe('Ort und Vorschau', () => {
  it('trägt die Klasse seines Orts — Kopf am Handy, Leiste am Schreibtisch', () => {
    const { container, rerender } = render(<BrandLogo ort="kopf" />);
    expect(container.firstElementChild).toHaveClass('marke', 'marke-kopf');
    expect(container.firstElementChild).not.toHaveClass('marke-leiste');
    rerender(<BrandLogo ort="leiste" />);
    expect(container.firstElementChild).toHaveClass('marke', 'marke-leiste');
  });

  it('setzt keine Größe mehr am Element — sie gehört dem Stil', () => {
    betrieb = { ...BETRIEB, logoUrl: EIN_BILD } as Company;
    const { container, rerender } = render(<BrandLogo ort="kopf" />);
    expect(container.querySelector('[style]')).toBeNull();
    betrieb = BETRIEB;
    rerender(<BrandLogo ort="kopf" />);
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('zeigt in der Vorschau, was im Formular steht — nicht den gespeicherten Betrieb', () => {
    render(<BrandLogo ort="kopf" vorschau={{ name: 'Neuer Name GmbH', logoUrl: '' }} />);
    expect(screen.getByText('Neuer Name GmbH')).toBeInTheDocument();
    expect(screen.queryByText('Perl Installationen')).not.toBeInTheDocument();
  });

  it('zeigt in der Vorschau auch ein Logo, bevor der Betrieb geladen ist', () => {
    betrieb = null;
    render(<BrandLogo ort="kopf" vorschau={{ name: 'Neuer Name GmbH', logoUrl: EIN_BILD }} />);
    expect(screen.getByRole('img', { name: 'Neuer Name GmbH' })).toHaveAttribute('src', EIN_BILD);
  });
});

describe('Solange das Logo zugeschnitten wird', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hält den Platz frei und zeigt dann das Logo — nie erst mit Rand, dann ohne', async () => {
    /*
      Mit Zeichenfläche (der echte Browser) wird zugeschnitten, bevor das Bild
      erscheint. jsdom kann kein Bild entschlüsseln — das Zuschneiden
      scheitert dort und gibt, wie gewollt, das ursprüngliche Logo zurück.
    */
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('kein Bild')));
    const url = `${EIN_BILD}#zuschnitt`;
    betrieb = { ...BETRIEB, logoUrl: url } as Company;
    const { container } = render(<BrandLogo ort="kopf" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('marke-platz', 'marke-kopf');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');

    await waitFor(() => expect(screen.getByRole('img', { name: 'Perl Installationen' })).toHaveAttribute('src', url));
  });
});
