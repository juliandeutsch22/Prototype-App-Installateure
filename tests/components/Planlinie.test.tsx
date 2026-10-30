import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  Masskette,
  Masslinie,
  Modulskizze,
  Saldolinie,
  Stempel,
  Hinweislinie,
} from '@/components/Planlinie';
import PageHeader from '@/components/PageHeader';
import Abschnitt from '@/components/Abschnitt';
import { LoadingState } from '@/components/States';
import { Zustand } from '@/components/Badge';
import Metric, { MetricRow } from '@/components/Metric';

/*
  DIE BAUSTEINE DER PLANLINIE (Auftrag 30.10.2026, E30). Geprüft wird, was
  die Bausteine versprechen: keine Linie ohne Zahl, die Überschreitung als
  eigene rote Strecke, ein Akzent je Seite und keiner ohne Schriftfeld, das
  Statuszeichen je Zustand. Die Gestalt selbst prüfen die Fotos.
*/

describe('B2 Maßlinie', () => {
  it('im Rahmen: die Strecke endet beim Anteil, die Soll-Marke am Ende, kein Überhang', () => {
    render(<Masslinie ist={12} soll={16} istText="12,0 h gebucht" sollText="Budget 16 h" name="12,0 h von 16 h" />);
    const linie = screen.getByRole('img', { name: '12,0 h von 16 h' });
    expect((linie.querySelector('.masslinie-strecke') as HTMLElement).style.width).toBe('75%');
    expect((linie.querySelector('.masslinie-soll') as HTMLElement).style.left).toBe('100%');
    expect(linie.querySelector('.masslinie-ueber')).toBeNull();
    expect(linie.querySelector('.masslinie-marke-rot')).toBeNull();
    // Nie eine Linie ohne Zahl.
    expect(linie).toHaveTextContent('12,0 h gebucht');
    expect(linie).toHaveTextContent('Budget 16 h');
  });

  it('darüber: die Soll-Marke rückt nach links, der Überhang läuft rot bis an eine eigene Endmarke', () => {
    render(<Masslinie ist={45} soll={16} istText="45,0 h" sollText="Budget 16 h" ueberText="+29,0 h" name="45 von 16" />);
    const linie = screen.getByRole('img', { name: '45 von 16' });
    // 16 / 45 = 35,6 %
    expect((linie.querySelector('.masslinie-soll') as HTMLElement).style.left).toBe('35.6%');
    const ueber = linie.querySelector('.masslinie-ueber') as HTMLElement;
    expect(ueber.style.left).toBe('35.6%');
    expect(ueber.style.width).toBe('64.4%');
    expect(linie.querySelector('.masslinie-marke-rot')).not.toBeNull();
    expect(screen.getByText('+29,0 h')).toHaveClass('masslinie-plus');
    // Weit genug links: der Überhang steht oben.
    expect(screen.getByText('+29,0 h')).not.toHaveClass('masslinie-plus-unten');
  });

  it('knapp darüber: die Zahl des Überhangs rückt nach unten, damit sie die Soll-Beschriftung nicht trifft', () => {
    render(<Masslinie ist={20} soll={16} istText="20 h" sollText="16 h" ueberText="+4 h" name="20 von 16" />);
    expect(screen.getByText('+4 h')).toHaveClass('masslinie-plus', 'masslinie-plus-unten');
  });

  it('Achtung färbt nur unter der Grenze — darüber ist es ohnehin rot', () => {
    const { rerender } = render(<Masslinie ist={15} soll={16} achtung istText="15" name="n" />);
    expect(screen.getByRole('img')).toHaveClass('masslinie-achtung');
    rerender(<Masslinie ist={17} soll={16} achtung istText="17" name="n" />);
    expect(screen.getByRole('img')).not.toHaveClass('masslinie-achtung');
  });

  it('ist ein span und darf damit in einem Absatz stehen (Listenzeilen)', () => {
    render(<p><Masslinie ist={1} soll={2} istText="1" name="n" /></p>);
    expect(screen.getByRole('img').tagName).toBe('SPAN');
  });
});

describe('B2a Saldolinie', () => {
  it('Minus wächst von der Mitte nach links, Plus nach rechts, beides höchstens bis zum Rand', () => {
    const { rerender } = render(<Saldolinie minuten={-60} massstabMinuten={240} name="minus" />);
    const minus = screen.getByRole('img', { name: 'minus' }).querySelector('.saldolinie-minus') as HTMLElement;
    expect(minus.style.width).toBe('1.25rem');
    expect(minus.style.left).toBe('3.75rem');
    rerender(<Saldolinie minuten={9999} massstabMinuten={240} name="plus" />);
    const plus = screen.getByRole('img', { name: 'plus' }).querySelector('.saldolinie-plus') as HTMLElement;
    expect(plus.style.width).toBe('5rem');
  });

  it('Gegenprobe: ein Saldo von null zeichnet keine Strecke', () => {
    render(<Saldolinie minuten={0} massstabMinuten={240} name="null" />);
    const linie = screen.getByRole('img', { name: 'null' });
    expect(linie.querySelector('.saldolinie-minus, .saldolinie-plus')).toBeNull();
  });
});

describe('B11 Maßkette', () => {
  it('teilt die Arbeitszeit um die Pause in der Mitte und bemaßt jedes Stück', () => {
    const dauer = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    render(<Masskette vonText="07:00" bisText="16:00" gesamtMinuten={540} pauseMinuten={30} dauer={dauer} name="kette" />);
    const kette = screen.getByRole('img', { name: 'kette' });
    expect([...kette.querySelectorAll('.masskette-teil')].map((e) => e.textContent)).toEqual(['4:15', '0:30', '4:15']);
    expect(kette.querySelector('.masskette-pause')).not.toBeNull();
    expect(kette).toHaveTextContent('07:00');
    expect(kette).toHaveTextContent('16:00');
  });

  it('Gegenprobe: ohne Dauer keine Kette', () => {
    const { container } = render(<Masskette vonText="" bisText="" gesamtMinuten={0} pauseMinuten={0} dauer={String} name="leer" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('B10 Nummernstempel und B8 Hinweislinie', () => {
  it('der Stempel trägt die Nummer als Text', () => {
    render(<Stempel>PR-2026-0194</Stempel>);
    expect(screen.getByText('PR-2026-0194')).toHaveClass('stempel');
  });

  it('die Hinweislinie sagt ihren Satz, die Linie selbst ist für die Vorlesehilfe stumm', () => {
    render(<Hinweislinie stufe="fehl">Die PLZ hat vier Ziffern.</Hinweislinie>);
    const hinweis = screen.getByText('Die PLZ hat vier Ziffern.').closest('p')!;
    expect(hinweis).toHaveClass('hinweislinie', 'hinweislinie-fehl');
    expect(hinweis.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('B9 Modulskizze', () => {
  it('ist rein dekorativ und benennt ihr Motiv', () => {
    const { container } = render(<Modulskizze motiv="rechnung" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-skizze', 'rechnung');
    expect(svg).toHaveClass('lot-zeichnung', 'lot-skizze');
  });
});

describe('B1 Plankopf mit Schriftfeld', () => {
  const kopf = (pfad: string, mitStand: boolean) =>
    render(
      <MemoryRouter initialEntries={[pfad]}>
        <PageHeader
          title="Rechnungen"
          stempel="RE-2026-1502"
          stand={mitStand ? <MetricRow label="Stand"><Metric label="Offen" value="3" /></MetricRow> : undefined}
        />
      </MemoryRouter>,
    );

  it('trägt Titel, Stempel, Schriftfeld, Lineal und die Skizze des Bereichs', () => {
    const { container } = kopf('/invoices', true);
    expect(container.querySelector('.plankopf')).not.toBeNull();
    expect(screen.getByText('RE-2026-1502')).toHaveClass('stempel');
    expect(container.querySelector('.schriftfeld')).toHaveTextContent('Offen');
    expect(container.querySelector('.lineal')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.schriftfeld [data-skizze="rechnung"]')).not.toBeNull();
  });

  it('Gegenprobe: ohne Kennzahlen kein Schriftfeld und keine Skizze — der Akzent kommt nicht dazu', () => {
    const { container } = kopf('/invoices', false);
    expect(container.querySelector('.schriftfeld')).toBeNull();
    expect(container.querySelector('.lineal')).toBeNull();
    expect(container.querySelector('[data-skizze]')).toBeNull();
  });

  it('Gegenprobe: eine Seite ohne eigene Skizze (die Planung) bekommt keine', () => {
    const { container } = kopf('/assignments', true);
    expect(container.querySelector('.schriftfeld')).not.toBeNull();
    expect(container.querySelector('[data-skizze]')).toBeNull();
  });
});

describe('B5 Achskreis', () => {
  it('eine kurze Zahl steht im Kreis vor dem Titel', () => {
    render(<Abschnitt titel="Dringend" anzahl={2} />);
    expect(screen.getByText('2')).toHaveClass('achskreis');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('2 Dringend');
  });

  it('Gegenprobe: ein langer Zusatz passt nicht in den Kreis und bleibt Text', () => {
    render(<Abschnitt titel="Offen" anzahl="3 · € 1 200,00" />);
    expect(screen.queryByText('3 · € 1 200,00', { selector: '.achskreis' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Offen· 3 · € 1 200,00');
  });
});

describe('B3 Statuszeichen und B4 Lot', () => {
  it('jeder der sieben Zustände hat seine Klasse — die Maske wählt das Zeichen', () => {
    render(
      <>
        <Zustand stand="offen">a</Zustand>
        <Zustand stand="geplant">b</Zustand>
        <Zustand stand="laeuft">c</Zustand>
        <Zustand stand="erledigt">d</Zustand>
        <Zustand stand="achtung">e</Zustand>
        <Zustand stand="schlecht">f</Zustand>
        <Zustand stand="storniert">g</Zustand>
      </>,
    );
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((t) => screen.getByText(t).className)).toEqual([
      'stand stand-offen',
      'stand stand-geplant',
      'stand stand-info',
      'stand stand-erledigt',
      'stand stand-warn',
      'stand stand-fehl',
      'stand stand-storniert',
    ]);
  });

  it('beim Laden pendelt das Lot statt eines Kreisels', () => {
    const { container } = render(<LoadingState sofort />);
    expect(container.querySelector('.lot-zeichen.lot-pendel')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Wird geladen …');
  });
});
