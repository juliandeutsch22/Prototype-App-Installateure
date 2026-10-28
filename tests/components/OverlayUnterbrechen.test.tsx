import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BottomSheet from '@/components/BottomSheet';
import { offeneSperren } from '@/components/hintergrundSperre';

const vorher = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (vorher) Object.defineProperty(Element.prototype, 'animate', vorher);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});
function bewegung(reduce = false) {
  vi.useFakeTimers();
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion') && reduce, addEventListener() {}, removeEventListener() {} }));
}
it('erneutes Öffnen während des Schließens bricht den Abbau ab; Fokus/Sperre bleiben bis zum echten Ende', () => {
  bewegung();
  const { rerender } = render(<BottomSheet open onClose={vi.fn()} label="Unterbrechbar">Inhalt</BottomSheet>);
  expect(offeneSperren()).toBe(1);
  rerender(<BottomSheet open={false} onClose={vi.fn()} label="Unterbrechbar">Inhalt</BottomSheet>);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(70));
  rerender(<BottomSheet open onClose={vi.fn()} label="Unterbrechbar">Inhalt</BottomSheet>);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(offeneSperren()).toBe(1);
  rerender(<BottomSheet open={false} onClose={vi.fn()} label="Unterbrechbar">Inhalt</BottomSheet>);
  act(() => vi.advanceTimersByTime(141));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(offeneSperren()).toBe(0);
});
it('Reduce schließt unmittelbar und räumt die Hintergrundsperre auf', () => {
  bewegung(true);
  const { rerender } = render(<BottomSheet open onClose={vi.fn()} label="Ohne Bewegung">Inhalt</BottomSheet>);
  rerender(<BottomSheet open={false} onClose={vi.fn()} label="Ohne Bewegung">Inhalt</BottomSheet>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(offeneSperren()).toBe(0);
});
