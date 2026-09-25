import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReiterImBild } from '@/components/reiterImBild';

/*
  REITER ALS KNÖPFE (Material, Lager, Anforderungen, Urlaub). Dieselbe Regel
  wie in Unterreiter: der gewählte Reiter wird beim Öffnen und bei jedem
  Wechsel ganz ins Bild geholt, ohne Gleiten und ohne die Seite senkrecht zu
  verschieben. jsdom rechnet keine Breiten — geprüft wird der Auftrag an den
  Browser.
*/
function Leiste({ start }: { start: string }) {
  const [reiter, setReiter] = useState(start);
  const leiste = useReiterImBild<HTMLDivElement>(reiter);
  return (
    <div ref={leiste} role="tablist">
      {['Bestellen', 'Meine Anforderungen', 'Lager'].map((r) => (
        <button key={r} role="tab" aria-selected={reiter === r} onClick={() => setReiter(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}

describe('useReiterImBild', () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  function beobachte() {
    const aufrufe: { reiter: string | null; optionen: unknown }[] = [];
    Element.prototype.scrollIntoView = function (this: Element, optionen?: unknown) {
      aufrufe.push({ reiter: this.textContent, optionen });
    } as Element['scrollIntoView'];
    return aufrufe;
  }

  const ERWARTET = { behavior: 'auto', block: 'nearest', inline: 'nearest' };

  it('holt den gewählten Reiter beim Öffnen ins Bild', () => {
    const aufrufe = beobachte();
    render(<Leiste start="Lager" />);
    expect(aufrufe).toEqual([{ reiter: 'Lager', optionen: ERWARTET }]);
  });

  it('und bei jedem Wechsel', async () => {
    const aufrufe = beobachte();
    render(<Leiste start="Bestellen" />);
    await userEvent.click(screen.getByRole('tab', { name: 'Meine Anforderungen' }));
    expect(aufrufe[aufrufe.length - 1]).toEqual({ reiter: 'Meine Anforderungen', optionen: ERWARTET });
  });
});
