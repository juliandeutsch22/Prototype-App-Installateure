import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ProduktMarke from '@/components/ProduktMarke';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
  V10 (13.11.2026): die Marke ist zweifarbig (Zeichen im Akzent, Schriftzug
  Tinte) und lässt sich nicht mehr per Filter weiß färben. Im dunklen Satz
  zeigt sie deshalb die Fassung für dunkle Flächen — auch, wenn der Satz
  während der Arbeit wechselt. Gegenprobe: mit der alten Marke (immer
  logo.svg, Filter im Stil) sind die beiden ersten Prüfungen rot.
*/
afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('Produktmarke im hellen und dunklen Satz', () => {
  it('dunkel: die Fassung für dunkle Flächen', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ProduktMarke />);
    expect(screen.getByRole('img', { name: 'Senklot' })).toHaveAttribute('src', '/marke/logo-weiss.svg');
  });

  it('folgt einem Wechsel des Satzes ohne Neuladen', async () => {
    render(<ProduktMarke />);
    const bild = screen.getByRole('img', { name: 'Senklot' });
    expect(bild).toHaveAttribute('src', '/marke/logo.svg');
    await act(async () => { document.documentElement.setAttribute('data-theme', 'dark'); await Promise.resolve(); });
    expect(bild).toHaveAttribute('src', '/marke/logo-weiss.svg');
  });

  it('gleich geblieben: hell die Tinten-Fassung, auf dunkler Fläche ausdrücklich die helle', () => {
    const { unmount } = render(<ProduktMarke />);
    expect(screen.getByRole('img', { name: 'Senklot' })).toHaveAttribute('src', '/marke/logo.svg');
    unmount();
    render(<ProduktMarke hell />);
    expect(screen.getByRole('img', { name: 'Senklot' })).toHaveAttribute('src', '/marke/logo-weiss.svg');
  });

  /*
    Breite und Höhe stehen am Bild, damit beim Laden nichts springt. Sie
    müssen dem Seitenverhältnis der Vorlage folgen — sonst reserviert die
    Seite zu viel oder zu wenig Platz. Gegenprobe: mit dem Verhältnis der
    Marke vor E93 (165,12 : 56) ist die Prüfung rot.
  */
  it('reserviert genau das Seitenverhältnis von marke/logo.svg', () => {
    const vorlage = readFileSync(resolve(process.cwd(), 'marke/logo.svg'), 'utf8');
    const [, b, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(vorlage)!.map(Number);
    render(<ProduktMarke hoehe={56} />);
    const bild = screen.getByRole('img', { name: 'Senklot' });
    expect(bild).toHaveAttribute('width', String(Math.round(56 * b / h)));
    expect(bild).toHaveAttribute('height', '56');
  });
});
