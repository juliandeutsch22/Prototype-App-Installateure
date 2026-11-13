import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Metric, { MetricRow } from '@/components/Metric';
import PageHeader from '@/components/PageHeader';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import { KopfTitelKontext, useKopfTitel } from '@/components/KopfTitel';
import { Segmente } from '@/components/LotBausteine';
import { useReiterImBild } from '@/components/reiterImBild';
import { ListRow } from '@/components/ListRow';

/*
  HANDY: INHALT ZUERST (Paket 6, E86). Was die Bausteine dafür tun — die
  Darstellung selbst prüfen `planlinieStil.test.ts` (Stil) und
  `tests/durchklick/handyInhalt.spec.ts` (Browser, 390 px).
*/

describe('Die Kennzahl sagt dem Handy, was sie ist (D1)', () => {
  const klassen = (el: HTMLElement) => [...(el.closest('li') as HTMLElement).classList];
  it('null, ladend, nur breit und Achtung — jeweils als eigene Klasse', () => {
    render(
      <MemoryRouter>
        <MetricRow>
          <Metric label="Null" value={0} />
          <Metric label="Null als Text" value="€ 0,00" />
          <Metric label="Lädt" value={3} bereit={false} />
          <Metric label="Breit" value={5} nurBreit />
          <Metric label="Über Budget" value={2} tone="danger" />
          <Metric label="Nahe" value={1} tone="warning" />
        </MetricRow>
      </MemoryRouter>,
    );
    expect(klassen(screen.getByText('Null'))).toContain('lage-punkt-null');
    expect(klassen(screen.getByText('Null als Text'))).toContain('lage-punkt-null');
    expect(klassen(screen.getByText('Lädt'))).toContain('lage-punkt-laedt');
    expect(klassen(screen.getByText('Breit'))).toContain('lage-punkt-breit');
    expect(klassen(screen.getByText('Über Budget'))).toContain('lage-punkt-achtung');
    expect(klassen(screen.getByText('Nahe'))).toContain('lage-punkt-achtung');
  });

  it('Gegenprobe: ein Wert, ein Strich „—“ und eine Null mit Warnton bleiben, was sie sind', () => {
    render(
      <MemoryRouter>
        <MetricRow>
          <Metric label="Eins" value={1} />
          <Metric label="Beginn" value="—" />
          <Metric label="Über Budget" value={0} tone="danger" />
        </MetricRow>
      </MemoryRouter>,
    );
    expect(klassen(screen.getByText('Eins'))).toEqual(['lage-punkt']);
    // „—“ heißt „nicht festgelegt“, nicht null: die Zeile bleibt am Handy stehen.
    expect(klassen(screen.getByText('Beginn'))).toEqual(['lage-punkt']);
    // Null mit Warnton ist null — kein Hinweis für nichts.
    expect(klassen(screen.getByText('Über Budget'))).toEqual(['lage-punkt', 'lage-punkt-null']);
  });
});

function kopf(props: Partial<Parameters<typeof PageHeader>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin-projects']}>
      <SeitenHilfeProvider>
        <PageHeader title="Baustellen" {...props} />
      </SeitenHilfeProvider>
    </MemoryRouter>,
  );
}

describe('Der Seitenkopf am Handy (D1, D3, D11)', () => {
  it('ein beschreibender Untertitel ist als Beschreibung markiert und steht auch in der Hilfe', () => {
    const { container } = kopf({ subtitle: 'Anlegen und suchen' });
    expect(container.querySelector('.seitenkopf-meta-beschreibung')).toHaveTextContent('Anlegen und suchen');
    // Ohne eigene Hilfe trägt der Knopf nur die Beschreibung — und ist am Handy der Weg zu ihr.
    expect(container.querySelector('.seitenkopf-hilfe-handy')).not.toBeNull();
  });

  it('Gegenprobe: ein Untertitel aus Bausteinen ist eine Angabe und bleibt überall stehen', () => {
    const { container } = kopf({ subtitle: <span>B-2026-0001 · Baustelle</span> });
    expect(container.querySelector('.seitenkopf-meta')).toHaveTextContent('B-2026-0001 · Baustelle');
    expect(container.querySelector('.seitenkopf-meta-beschreibung')).toBeNull();
    expect(container.querySelector('.seitenkopf-hilfe-handy')).toBeNull();
  });

  it('ein langer Titel bricht an der Wortfuge — vorgelesen und gesucht wird er ohne Trennzeichen', () => {
    const { container } = kopf({ title: 'Mitarbeiterübersicht' });
    expect(screen.getByRole('heading', { level: 1, name: 'Mitarbeiterübersicht' })).toBeInTheDocument();
    const sichtbar = container.querySelector('h1 .titel-satz') as HTMLElement;
    expect(sichtbar.getAttribute('aria-hidden')).toBe('true');
    expect(sichtbar.textContent).toBe('Mitarbeiter­übersicht');
  });

  it('Gegenprobe: ein kurzer Titel steht einmal, ohne zweite Fassung', () => {
    const { container } = kopf({ title: 'Baustellen' });
    expect(container.querySelectorAll('h1 > span')).toHaveLength(1);
    expect(container.querySelector('h1 .sr-only')).toBeNull();
  });

  it('der Stand der Akte steht als Wort neben dem Stempel', () => {
    const { container } = kopf({ stempel: 'B-2026-0001', stempelZusatz: 'Aktiv' });
    expect(container.querySelector('.plankopf-zusatz')).toHaveTextContent('Aktiv');
  });
});

/*
  DER TITEL WANDERT IN DIE KOPFZEILE (D11). jsdom kennt keine Lage; der
  Beobachter wird hier nachgestellt und meldet, was der Browser melden würde.
*/
describe('useKopfTitel', () => {
  let rueckruf: ((e: Partial<IntersectionObserverEntry>[]) => void) | null = null;
  let hoehe = 36;
  class Beobachter {
    constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) { rueckruf = cb; }
    observe() {}
    disconnect() {}
  }
  class Groesse { observe() {} disconnect() {} }
  afterEach(() => { vi.unstubAllGlobals(); rueckruf = null; });

  function Kopf({ titel }: { titel: string }) {
    const h1 = useRef<HTMLHeadingElement>(null);
    const satz = useRef<HTMLSpanElement>(null);
    useKopfTitel(h1, satz, titel);
    return <h1 ref={h1}><span ref={(el) => {
      (satz as { current: HTMLSpanElement | null }).current = el;
      if (el) el.getBoundingClientRect = () => ({ height: hoehe } as DOMRect);
    }}>{titel}</span></h1>;
  }

  it('meldet den Titel, sobald er über die Kopfzeile gerollt ist, und nimmt ihn zurück', () => {
    vi.stubGlobal('IntersectionObserver', Beobachter);
    vi.stubGlobal('ResizeObserver', Groesse);
    const melden = vi.fn();
    const { unmount } = render(<KopfTitelKontext.Provider value={melden}><Kopf titel="Familie Huber" /></KopfTitelKontext.Provider>);
    act(() => rueckruf!([{ isIntersecting: false, boundingClientRect: { top: -40 } as DOMRectReadOnly }]));
    expect(melden).toHaveBeenLastCalledWith('Familie Huber');
    act(() => rueckruf!([{ isIntersecting: true, boundingClientRect: { top: 80 } as DOMRectReadOnly }]));
    expect(melden).toHaveBeenLastCalledWith(null);
    act(() => rueckruf!([{ isIntersecting: false, boundingClientRect: { top: -40 } as DOMRectReadOnly }]));
    unmount();
    // Verlässt man die Seite, steht in der Kopfzeile wieder der Betrieb.
    expect(melden).toHaveBeenLastCalledWith(null);
  });

  it('Gegenprobe: unter dem Bildrand (noch nicht erreicht) ist kein Grund, ihn zu melden', () => {
    vi.stubGlobal('IntersectionObserver', Beobachter);
    vi.stubGlobal('ResizeObserver', Groesse);
    const melden = vi.fn();
    render(<KopfTitelKontext.Provider value={melden}><Kopf titel="Familie Huber" /></KopfTitelKontext.Provider>);
    act(() => rueckruf!([{ isIntersecting: false, boundingClientRect: { top: 2000 } as DOMRectReadOnly }]));
    expect(melden).not.toHaveBeenCalled();
  });

  it('rechnet das Polster so, dass der Titel auf einer Rasterlinie endet', () => {
    vi.stubGlobal('ResizeObserver', Groesse);
    for (const [zeilen, polster] of [[36, '6px'], [72, '12px'], [108, '6px'], [32, '8px'], [64, '16px']] as const) {
      hoehe = zeilen;
      const { container, unmount } = render(<Kopf titel="Titel" />);
      const h1 = container.querySelector('h1') as HTMLElement;
      expect(h1.style.getPropertyValue('--titel-luft')).toBe(polster);
      // Polster + Höhe = ganze Zellen (24 px), mindestens eine halbe Zelle Luft.
      expect((zeilen + 2 * parseFloat(polster)) % 24).toBe(0);
      unmount();
    }
    hoehe = 36;
  });
});

describe('Reiter und Filter (D6)', () => {
  it('eine Null steht nicht am Reiter; eine Zahl über null schon', () => {
    render(<Segmente name="Kunden filtern" werte={[
      { wert: 'a', text: 'Alle' },
      { wert: 'p', text: 'Anschrift prüfen', anzahl: 0 },
      { wert: 'o', text: 'Ohne Kundenart', anzahl: 2 },
    ]} wert="a" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anschrift prüfen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ohne Kundenart 2' })).toBeInTheDocument();
  });

  function Leiste() {
    const leiste = useReiterImBild<HTMLDivElement>('a');
    return (
      <div ref={(el) => {
        (leiste as { current: HTMLDivElement | null }).current = el;
        if (!el) return;
        Object.defineProperty(el, 'scrollWidth', { value: 500, configurable: true });
        Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true });
        el.getBoundingClientRect = () => ({ left: 0, right: 300, width: 300 } as DOMRect);
        const kinder = el.children as HTMLCollectionOf<HTMLElement>;
        [[0, 100], [120, 220], [240, 340], [360, 460]].forEach(([l, r], i) => {
          if (kinder[i]) kinder[i].getBoundingClientRect = () => ({ left: l, right: r } as DOMRect);
        });
      }} data-testid="leiste">
        <button aria-selected>A</button><button>B</button><button>C</button><button>D</button>
      </div>
    );
  }

  it('die Kante beginnt am ersten angeschnittenen Reiter, nicht mitten in seinem Wort', () => {
    render(<Leiste />);
    const el = screen.getByTestId('leiste');
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(el.hasAttribute('data-mehr-rechts')).toBe(true);
    // Der dritte Reiter (240–340) ragt über 300 hinaus: ab 240 von 300 blendet die Kante aus.
    expect(el.style.getPropertyValue('--mehr-ab')).toBe('80%');
  });
});

describe('Arbeitslisten am Handy (D4)', () => {
  it('die Seite der Knöpfe ist als solche erkennbar — der Stil setzt einen Textknopf unter den Text', () => {
    const { container } = render(
      <MemoryRouter>
        <ul><ListRow title="Kupferrohr 15mm"><button type="button">Abgeholt</button></ListRow></ul>
      </MemoryRouter>,
    );
    expect(container.querySelector('.zeile > .zeile-rechts > button')).toHaveTextContent('Abgeholt');
  });
});
