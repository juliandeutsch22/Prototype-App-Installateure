import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { ListRow } from '@/components/ListRow';

/*
  V10 (13.11.2026): die Zeile, deren Seitenfenster offen ist, bleibt als
  Auswahl sichtbar — Auswahlton, feine Kontur, `aria-current`. Gegenprobe:
  ohne die Eigenschaft `ausgewaehlt` (Stand vor V10) sind die ersten beiden
  Prüfungen rot.
*/
const zeile = (props: Partial<Parameters<typeof ListRow>[0]> = {}) => render(
  <MemoryRouter><ul><ListRow title="Rechnung 2026-0231" onOeffnen={() => {}} {...props} /></ul></MemoryRouter>,
).container.querySelector('li')!;

describe('Ausgewählte Listenzeile', () => {
  it('trägt aria-current, solange ihr Fenster offen ist — auch gestapelt', () => {
    expect(zeile({ ausgewaehlt: true })).toHaveAttribute('aria-current', 'true');
    expect(zeile({ ausgewaehlt: true, gestapelt: true })).toHaveAttribute('aria-current', 'true');
  });

  it('der Stil zeigt Auswahlton und Kontur, der Hover-Ton ist ein anderer', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain(".zeile[aria-current='true'], .zeile[aria-current='true']:hover { border-radius: var(--radius-sm); background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur); }");
    expect(css).toContain('.zeile-ganz:hover { background: var(--hover-flaeche); }');
  });

  it('gleich geblieben: ohne Auswahl kein aria-current, die Zeile bleibt antippbar', () => {
    const li = zeile();
    expect(li).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Rechnung 2026-0231' })).toBeInTheDocument();
  });
});
