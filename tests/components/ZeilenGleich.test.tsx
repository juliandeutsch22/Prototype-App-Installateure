import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { List, ListRow } from '@/components/ListRow';
import { Zustand } from '@/components/Badge';

/**
 * Zeilen gleich gebaut (Design-Entwurf vom 25.10.2026, Punkt 3).
 *
 * Name fett, die Nummer grau daneben ohne Klammer; eine Detailzeile; rechts
 * eine feste Spalte für den Zustand, in der nur der Punkt Farbe trägt; nie
 * „⋯“ und „›“ nebeneinander.
 */
const lesen = (datei: string) => readFileSync(join(process.cwd(), datei), 'utf8');

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const pfad = join(ordner, n);
    return statSync(pfad).isDirectory() ? dateien(pfad) : pfad.endsWith('.tsx') ? [pfad] : [];
  });
}

function zeile(props: Partial<Parameters<typeof ListRow>[0]>) {
  return render(
    <MemoryRouter>
      <List>
        <ListRow title="Bäckerei Gruber" to="/x" {...props} />
      </List>
    </MemoryRouter>,
  );
}

describe('Name und Nummer', () => {
  it('der Name fett, die Nummer grau daneben — ohne Klammer, mit echtem Leerzeichen', () => {
    zeile({ nummer: 'B-2026-0011' });
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Bäckerei Gruber B-2026-0011');
    expect(link.textContent).not.toContain('(');
    expect(screen.getByText('B-2026-0011')).toHaveClass('zeile-nr');
    expect(screen.getByText('Bäckerei Gruber')).toHaveClass('zeile-name');
  });

  it('gleich geblieben: ohne Nummer ist der Titel genau der Name', () => {
    const { container } = zeile({});
    expect(screen.getByRole('link').textContent).toBe('Bäckerei Gruber');
    expect(container.querySelector('.zeile-nr')).toBeNull();
  });

  it('die Nummer als Stempel (Planlinie B10): normal gesetzt, nie umgebrochen, in Mono und fein gerahmt', () => {
    const css = lesen('src/index.css');
    expect(css).toMatch(/\.zeile-nr \{ font-weight: 400; color: var\(--text\); white-space: nowrap;[^}]*font-family: var\(--schrift-mono\);[^}]*border: 1px solid var\(--border-strong\);/);
  });
});

describe('Der Zustand in einer festen Spalte', () => {
  it('steht in seiner Spalte vor dem Wert', () => {
    const { container } = zeile({ zustand: <Zustand stand="achtung">ohne Projektleitung</Zustand>, wert: '40 h' });
    const spalte = container.querySelector('.zeile-zustand')!;
    expect(spalte).toHaveTextContent('ohne Projektleitung');
    expect(spalte.nextElementSibling).toHaveClass('zeile-wert');
  });

  it('ab dem Tablet in jeder Zeile gleich breit — Punkt und Wort fluchten', () => {
    expect(lesen('src/index.css')).toMatch(/@media \(min-width: 760px\) \{ \.zeile-zustand \{ min-width: 8\.5rem; \} \}/);
  });

  it('nur das Zeichen trägt Farbe: Achtung und Fehler in 500 in Tinte', () => {
    // Seit der Planlinie (E30): Statuszeichen statt Punkt, Gewicht 500 statt 600 (Poppins 400/500).
    const css = lesen('src/index.css') + lesen('src/styles/lot-planlinie.css');
    expect(css).toMatch(/\.stand-warn \{ font-weight: 500; \}/);
    expect(css).toMatch(/\.stand-fehl \{ font-weight: 500; \}/);
    expect(css).not.toMatch(/\.stand-(warn|fehl) \{[^}]*color:/);
    // Das Zeichen behält die Farbe.
    expect(css).toMatch(/\.stand-warn::before \{ background: var\(--warning\);/);
    expect(css).toMatch(/\.stand-fehl::before \{ background: var\(--danger\);/);
  });
});

/*
  ÜBER ALLE SEITEN: nie „⋯“ und „›“ in derselben Zeile, keine Nummer mehr in
  Klammern hinter einem Namen. Eine Seite, die es wieder so baut, fällt hier
  auf.
*/
describe('Alle Listen', () => {
  const quellen = dateien(join(process.cwd(), 'src/features')).map((d) => ({ d, s: readFileSync(d, 'utf8') }));

  it('keine Zeile trägt „⋯“ und dazu fest den Pfeil', () => {
    const verstoesse: string[] = [];
    for (const { d, s } of quellen) {
      /*
        Eine Zeile reicht bis zu ihrem </ListRow> — oder bis zur nächsten
        Zeile, wenn sie sich selbst schliesst. Selbstschliessende Elemente
        IN der Zeile (Verweise, Marken) beenden sie nicht.
      */
      const teile = s.split('<ListRow').slice(1);
      for (const teil of teile) {
        const ende = teil.indexOf('</ListRow>');
        const block = ende === -1 ? teil : teil.slice(0, ende);
        const vorDemMenue = block.split('<RowMenu')[0];
        if (block.includes('<RowMenu') && /\n\s*pfeil\s*\n/.test(vorDemMenue)) verstoesse.push(d);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('keine Nummer in Klammern hinter einem Namen', () => {
    const verstoesse = quellen
      .filter(({ s }) => /<span[^>]*>\(\{[a-zA-Z.]*(projectNumber|invoiceNumber|quoteNumber)\}\)<\/span>/.test(s))
      .map(({ d }) => d);
    expect(verstoesse).toEqual([]);
  });
});
