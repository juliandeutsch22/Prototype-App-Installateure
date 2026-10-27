import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@/types';
import { abgeschnittenerText } from '@/lib/auswahlAbgeschnitten';

/**
 * DIE GEWÄHLTE BAUSTELLE GANZ LESBAR (Testbericht Runde 6, G14).
 *
 * Im Seitenfenster des Termins (398 px) und am Handy stand von
 * „CT Bau GmbH (Claude-Test) (PR-2026-0193)“ nur „… (PR-2026-019…“. Die
 * Reihenfolge „Kunde (Nummer)“ bleibt im Büro; passt die Wahl nicht ins
 * Feld, steht sie darunter ganz.
 *
 * jsdom rechnet kein Layout. Die Breite des Feldes und die Breite des Textes
 * werden deshalb gesetzt: 9 px je Zeichen (Poppins 16 px misst für diesen
 * Namen 358 px bei 40 Zeichen), das Feld so breit wie im Seitenfenster bzw.
 * wie am Schreibtisch.
 *
 * Gegenprobe: ohne die Zeile in `BaustellenSelect` schlagen die ersten
 * beiden fehl; „passt sie, steht nichts doppelt“ und „ohne Layout nichts“
 * halten fest, was gleich bleibt.
 */

const ct: Project & { id: string } = {
  id: 'p1', companyId: 'perl', projectNumber: 'PR-2026-0193', customerName: 'CT Bau GmbH (Claude-Test)', status: 'Aktiv',
};
const ct2: Project & { id: string } = { ...ct, id: 'p2', projectNumber: 'PR-2026-0198' };

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: async () => [ct, ct2],
  listRecentProjects: async () => [],
  listProjectsByNumbers: async () => [],
}));

const { default: BaustellenSelect } = await import('@/components/BaustellenSelect');

let feldBreite = 0;
const breiteVorher = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const leinwandVorher = HTMLCanvasElement.prototype.getContext;

/* Das Polster des Feldes wie in der App (`px-3`) — jsdom lädt kein Tailwind. */
const polster = document.createElement('style');
polster.textContent = 'select { padding-left: 12px; padding-right: 12px; }';
document.head.appendChild(polster);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this instanceof HTMLSelectElement ? feldBreite : 0; },
  });
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (t: string) => ({ width: t.length * 9 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  if (breiteVorher) Object.defineProperty(HTMLElement.prototype, 'clientWidth', breiteVorher);
  HTMLCanvasElement.prototype.getContext = leinwandVorher;
});

function Maske({ start = 'PR-2026-0193' }: { start?: string }) {
  const [nr, setNr] = useState(start);
  return <BaustellenSelect id="termin-baustelle" companyId="perl" value={nr} onChange={setNr} />;
}

const ganzeZeile = () => document.querySelector('.auswahl-ganz');

describe('Die gewählte Baustelle ganz lesbar (Runde 6, G14)', () => {
  it('im Seitenfenster (398 px): die ganze Bezeichnung unter dem Feld, Kunde vorn wie bisher', async () => {
    feldBreite = 398;
    render(<Maske />);
    await waitFor(() => expect(ganzeZeile()).not.toBeNull());
    expect(ganzeZeile()!.textContent).toBe('CT Bau GmbH (Claude-Test) (PR-2026-0193)');
    // Für die Vorlesehilfe nicht doppelt — sie liest den Wert des Feldes.
    expect(ganzeZeile()).toHaveAttribute('aria-hidden', 'true');
    // Die Nummer bricht nicht am Bindestrich (G4).
    expect(ganzeZeile()!.querySelector('.nr')!.textContent).toBe('(PR-2026-0193)');
  });

  it('wechselt mit der Wahl — die Nummer unterscheidet zwei Baustellen eines Kunden', async () => {
    feldBreite = 356;
    render(<Maske />);
    await waitFor(() => expect(ganzeZeile()).not.toBeNull());
    await userEvent.selectOptions(screen.getByLabelText('Baustelle'), 'PR-2026-0198');
    await waitFor(() => expect(ganzeZeile()!.textContent).toContain('PR-2026-0198'));
  });

  it('gleich geblieben: passt die Wahl (558 px), steht nichts doppelt', async () => {
    feldBreite = 558;
    render(<Maske />);
    expect(await screen.findByRole('option', { name: 'CT Bau GmbH (Claude-Test) (PR-2026-0193)' })).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText('Baustelle') as HTMLSelectElement).value).toBe('PR-2026-0193'));
    expect(ganzeZeile()).toBeNull();
  });

  it('gleich geblieben: ohne Wahl nichts', async () => {
    feldBreite = 200;
    render(<Maske start="" />);
    await screen.findByRole('option', { name: 'CT Bau GmbH (Claude-Test) (PR-2026-0193)' });
    expect(ganzeZeile()).toBeNull();
  });
});

describe('Die Messung', () => {
  it('ohne Layout (Breite 0) ist nichts abgeschnitten', () => {
    feldBreite = 0;
    const feld = document.createElement('select');
    feld.innerHTML = '<option value="a">Ein sehr langer Kundenname mit Nummer PR-2026-0193</option>';
    feld.value = 'a';
    expect(abgeschnittenerText(feld)).toBeNull();
  });
});
