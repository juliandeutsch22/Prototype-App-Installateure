import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { insBild, useReiterImBild } from '@/components/reiterImBild';

/*
  REITER ALS KNÖPFE (Material, Lager, Anforderungen, Urlaub) und als Links
  (Unterreiter). Der gewählte Reiter wird beim Öffnen und bei jedem Wechsel
  ganz ins Bild geholt — und dabei rollt NUR die Leiste, nie die Seite
  (gemeldet am 03.10.2026: dunkle Ecken an der Kopfleiste am iPhone nach
  „Planung“). jsdom rechnet keine Breiten; die Lage wird hier vorgegeben.
*/

type Rechteck = { left: number; right: number };
function lage(el: Element, r: Rechteck) {
  el.getBoundingClientRect = () => ({ ...r, top: 0, bottom: 40, width: r.right - r.left, height: 40, x: r.left, y: 0, toJSON: () => r }) as DOMRect;
}

function Leiste({ start }: { start: string }) {
  const [reiter, setReiter] = useState(start);
  const leiste = useReiterImBild<HTMLDivElement>(reiter);
  return (
    <div ref={leiste} role="tablist" data-testid="leiste">
      {['Bestellen', 'Meine Anforderungen', 'Lager'].map((r) => (
        <button key={r} role="tab" aria-selected={reiter === r} onClick={() => setReiter(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}

describe('insBild', () => {
  const leiste = () => {
    const el = document.createElement('div');
    lage(el, { left: 0, right: 300 });
    return el;
  };

  it('rollt die Leiste nach rechts, wenn der Reiter rechts hinausragt', () => {
    const el = leiste();
    const reiter = document.createElement('a');
    lage(reiter, { left: 280, right: 380 });
    insBild(el, reiter);
    expect(el.scrollLeft).toBe(80);
  });

  it('und nach links, wenn er links hinausragt', () => {
    const el = leiste();
    el.scrollLeft = 100;
    const reiter = document.createElement('a');
    lage(reiter, { left: -40, right: 60 });
    insBild(el, reiter);
    expect(el.scrollLeft).toBe(60);
  });

  it('Gegenprobe: ein sichtbarer Reiter bewegt nichts', () => {
    const el = leiste();
    el.scrollLeft = 30;
    const reiter = document.createElement('a');
    lage(reiter, { left: 20, right: 120 });
    insBild(el, reiter);
    expect(el.scrollLeft).toBe(30);
  });
});

describe('useReiterImBild', () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it('holt den gewählten Reiter beim Öffnen und bei jedem Wechsel ins Bild — ohne die Seite zu rollen', async () => {
    const seiteGerollt: unknown[] = [];
    Element.prototype.scrollIntoView = function (this: Element, o?: unknown) {
      seiteGerollt.push(o);
    } as Element['scrollIntoView'];
    const proto = HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect };
    const echt = proto.getBoundingClientRect;
    // Leiste 0–300, jeder Reiter 150 breit nebeneinander: „Lager“ liegt bei 300–450.
    proto.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tablist') return { left: 0, right: 300 } as DOMRect;
      const i = ['Bestellen', 'Meine Anforderungen', 'Lager'].indexOf(this.textContent ?? '');
      const links = i * 150 - (this.parentElement?.scrollLeft ?? 0);
      return { left: links, right: links + 150 } as DOMRect;
    };
    try {
      render(<Leiste start="Lager" />);
      expect(screen.getByTestId('leiste').scrollLeft).toBe(150);
      await userEvent.click(screen.getByRole('tab', { name: 'Bestellen' }));
      expect(screen.getByTestId('leiste').scrollLeft).toBe(0);
      expect(seiteGerollt).toEqual([]);
    } finally {
      proto.getBoundingClientRect = echt;
    }
  });
});
