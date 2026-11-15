import { useRef } from 'react';
import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useZustandswechsel } from '@/lib/useZustandswechsel';

/*
  B7 (Plan 15.11.2026): der Arbeitstag wechselt Fläche, Inhalt und Knopf
  gemeinsam. Gemessen im Browser (`bewegungen.spec.ts`, B7); hier: beim
  ersten Zeichnen und ohne Wechsel bewegt sich nichts, bei einem Wechsel
  blendet der Inhalt ein und der neue Knopf kommt aus der Verkleinerung.
*/
const fahrten: Array<{ el: Element; bilder: Keyframe[] }> = [];
afterEach(() => { fahrten.length = 0; vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'animate'); });

function Karte({ stand }: { stand: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useZustandswechsel(ref, stand, '.knopf');
  return <div ref={ref}><p>Uhr</p><button className="knopf">{stand}</button></div>;
}

it('bewegt beim ersten Zeichnen und ohne Wechsel nichts, beim Wechsel Inhalt und Knopf', () => {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, bilder: Keyframe[]) { fahrten.push({ el: this, bilder }); return {} as Animation; },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const { rerender, container } = render(<Karte stand="bereit" />);
  rerender(<Karte stand="bereit" />);
  expect(fahrten).toHaveLength(0);
  rerender(<Karte stand="laeuft" />);
  expect(fahrten.find((f) => f.el === container.querySelector('p'))!.bilder[0]).toEqual({ opacity: 0 });
  expect(fahrten.find((f) => f.el === container.querySelector('.knopf'))!.bilder[0].transform).toBe('scale(0.88)');
});

it('gleich geblieben: bei „Bewegung reduzieren“ wechselt alles ohne Bewegung', () => {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, bilder: Keyframe[]) { fahrten.push({ el: this, bilder }); return {} as Animation; },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { rerender } = render(<Karte stand="bereit" />);
  rerender(<Karte stand="pause" />);
  expect(fahrten).toHaveLength(0);
});
