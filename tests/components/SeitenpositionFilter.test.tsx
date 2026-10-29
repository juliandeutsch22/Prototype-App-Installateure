import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Seitenposition from '@/app/Seitenposition';
import { ANSICHTSWECHSEL } from '@/lib/ansichtswechsel';

let position = 0;
const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
beforeEach(() => {
  position = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position });
  vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => { position = y; }) as typeof window.scrollTo);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (original) Object.defineProperty(window, 'scrollY', original);
});

function Steuerung() {
  const gehen = useNavigate();
  const ort = useLocation();
  return <>
    <output>{ort.pathname + ort.search + ort.hash}</output>
    <button onClick={() => gehen('?ansicht=erledigt', { replace: true })}>Filter ersetzen</button>
    <button onClick={() => gehen('?ansicht=monat')}>Ansicht wählen</button>
    <button onClick={() => gehen('/customers/k1')}>Akte öffnen</button>
    <button onClick={() => gehen('/assignments/tag', { state: ANSICHTSWECHSEL })}>Andere Teilansicht</button>
    <button onClick={() => gehen(-1)}>Zurück</button>
    <button onClick={() => gehen('/invoices#liste')}>Sprungziel</button>
  </>;
}
function aufbauen(key: string) {
  render(<MemoryRouter initialEntries={[{ pathname: '/invoices', key }]}><Seitenposition /><Steuerung /></MemoryRouter>);
}
function rollen(y: number) { position = y; fireEvent.scroll(window); }

it('Filteränderung mit REPLACE hält die Position der bestehenden Seite', () => {
  aufbauen('filter-replace'); rollen(480); vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByText('Filter ersetzen'));
  expect(screen.getByText('/invoices?ansicht=erledigt')).toBeInTheDocument();
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(position).toBe(480);
});

it('Ansichtswechsel mit PUSH bleibt stehen; echte neue Seiten und Zurück behalten ihre Regeln', () => {
  aufbauen('filter-push'); rollen(800); vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByText('Ansicht wählen'));
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(position).toBe(800);
  rollen(510);
  fireEvent.click(screen.getByText('Akte öffnen'));
  expect(position).toBe(0);
  fireEvent.click(screen.getByText('Zurück'));
  expect(position).toBe(510);
  fireEvent.click(screen.getByText('Zurück'));
  expect(position).toBe(800);
});

it('ein explizites Sprungziel wird nicht durch ein Zurücksetzen auf null überschrieben', () => {
  aufbauen('filter-hash'); rollen(320); vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByText('Sprungziel'));
  expect(window.scrollTo).not.toHaveBeenCalled();
});

it('ein ausdrücklich markierter Pfadwechsel der Teilansicht hält die Position und lässt neue Akten oben beginnen', () => {
  aufbauen('teilansicht'); rollen(440);
  fireEvent.click(screen.getByText('Andere Teilansicht'));
  expect(position).toBe(440);
  fireEvent.click(screen.getByText('Akte öffnen'));
  expect(position).toBe(0);
});
