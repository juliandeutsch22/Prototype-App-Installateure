import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BottomSheet from '@/components/BottomSheet';
import { offeneSperren } from '@/components/hintergrundSperre';

const animate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals();
  if (animate) Object.defineProperty(Element.prototype, 'animate', animate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});
function Beispiel({ ablehnen = false }: { ablehnen?: boolean }) {
  const [open, setOpen] = useState(true);
  return <BottomSheet open={open} onClose={() => { if (!ablehnen) setOpen(false); }} label="Geste">
    <p>Freier Inhalt</p><label>Name<input /></label>
    <div data-testid="breite-tabelle" style={{ overflowX: 'auto' }}><span>Tabelleninhalt</span></div>
  </BottomSheet>;
}
function touch(type: string, ziel: Element, x: number, y: number, cancelable = true) {
  const t = { identifier: 7, clientX: x, clientY: y };
  const e = new Event(type, { bubbles: true, cancelable });
  Object.defineProperties(e, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [t] }, changedTouches: { value: [t] } });
  fireEvent(ziel, e);
  return e;
}
const versatz = () => screen.getByRole('dialog').style.transform;

it('nach dem Wegwischen bleibt die Abdunkelung aus; der Versatz springt vor dem Abbau nicht auf null', () => {
  render(<Beispiel />);
  const ziel = screen.getByText('Freier Inhalt');
  touch('touchstart', ziel, 100, 100); touch('touchmove', ziel, 100, 260);
  expect(versatz()).toBe('translateY(160px)');
  touch('touchend', ziel, 100, 260);
  const dialog = screen.getByRole('dialog');
  expect(dialog.parentElement).toHaveAttribute('data-phase', 'schliesst');
  expect(dialog.parentElement).toHaveStyle({ opacity: '0' });
  expect(dialog.style.transform).toBe('translateY(160px)');
  expect(offeneSperren()).toBe(1);
  act(() => vi.advanceTimersByTime(141));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(offeneSperren()).toBe(0);
});

it('eine seitliche Geste bleibt seitlich und schließt auch bei späterem Abwärtsanteil nicht', () => {
  render(<Beispiel />); const ziel = screen.getByText('Freier Inhalt');
  touch('touchstart', ziel, 100, 100);
  touch('touchmove', ziel, 220, 110);
  touch('touchmove', ziel, 260, 250);
  touch('touchend', ziel, 260, 250);
  expect(versatz()).toBe('translateY(0px)');
  expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-phase', 'offen');
});

it('Touchcancel verwirft die Geste statt aus einem Scroll-/Zoomabbruch ein Schließen zu machen', () => {
  render(<Beispiel />); const ziel = screen.getByText('Freier Inhalt');
  touch('touchstart', ziel, 100, 100); touch('touchmove', ziel, 100, 260);
  touch('touchcancel', ziel, 100, 260);
  expect(versatz()).toBe('translateY(0px)');
  expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-phase', 'offen');
});

it('eine vom Browser bereits übernommene Bewegung wird nicht zusätzlich als Schließgeste ausgeführt', () => {
  render(<Beispiel />); const ziel = screen.getByText('Freier Inhalt');
  touch('touchstart', ziel, 100, 100);
  touch('touchmove', ziel, 100, 260, false);
  touch('touchend', ziel, 100, 260);
  expect(versatz()).toBe('translateY(0px)');
  expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-phase', 'offen');
});

it('ein abgelehntes Schließen setzt das Blatt zurück und lässt dessen Felder bedienbar', () => {
  render(<Beispiel ablehnen />); const ziel = screen.getByText('Freier Inhalt');
  touch('touchstart', ziel, 100, 100); touch('touchmove', ziel, 100, 260); touch('touchend', ziel, 100, 260);
  expect(versatz()).toBe('translateY(0px)');
  expect(screen.getByRole('dialog').parentElement).toHaveStyle({ opacity: '1' });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bleibt erhalten' } });
  expect(screen.getByLabelText('Name')).toHaveValue('Bleibt erhalten');
});

it('Textfelder und eigene breite Tabellen behalten ihre native seitliche Bedienung', () => {
  render(<Beispiel />);
  const feld = screen.getByLabelText('Name');
  touch('touchstart', feld, 100, 100);
  expect(touch('touchmove', feld, 220, 110).defaultPrevented).toBe(false);
  touch('touchend', feld, 220, 110);
  const tabelle = screen.getByTestId('breite-tabelle');
  Object.defineProperties(tabelle, { scrollWidth: { value: 600 }, clientWidth: { value: 200 } });
  const ziel = screen.getByText('Tabelleninhalt');
  touch('touchstart', ziel, 100, 100);
  expect(touch('touchmove', ziel, 220, 110).defaultPrevented).toBe(false);
  touch('touchend', ziel, 220, 110);
  expect(versatz()).toBe('translateY(0px)');
});

it('Pointercancel am Griff beendet die Bewegung ohne das Blatt zu schließen', () => {
  render(<Beispiel />);
  const griff = document.querySelector('.blatt-griff')!;
  const pointer = (type: string, y: number) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: y });
    Object.defineProperties(e, { pointerId: { value: 3 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
    fireEvent(griff, e);
  };
  pointer('pointerdown', 100); pointer('pointermove', 260);
  expect(versatz()).toBe('translateY(160px)');
  pointer('pointercancel', 260);
  expect(versatz()).toBe('translateY(0px)');
  expect(screen.getByRole('dialog').parentElement).toHaveAttribute('data-phase', 'offen');
});

it('ein neuer Eltern-Callback während des Ziehens setzt die Bewegung nicht zurück', () => {
  const alt = vi.fn(), neu = vi.fn();
  const { rerender } = render(<BottomSheet open onClose={alt} label="Geste"><p>Wischfläche</p></BottomSheet>);
  const ziel = screen.getByText('Wischfläche');
  touch('touchstart', ziel, 100, 100); touch('touchmove', ziel, 100, 260);
  rerender(<BottomSheet open onClose={neu} label="Geste"><p>Wischfläche</p></BottomSheet>);
  expect(versatz()).toBe('translateY(160px)');
  touch('touchend', ziel, 100, 260);
  expect(alt).not.toHaveBeenCalled(); expect(neu).toHaveBeenCalledOnce();
  expect(versatz()).toBe('translateY(0px)');
});
