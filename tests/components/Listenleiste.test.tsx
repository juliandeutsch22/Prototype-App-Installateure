import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Listenleiste, Segmente } from '@/components/LotBausteine';

/**
 * Eine Listenleiste für jede Liste (Design-Entwurf vom 25.10.2026, Punkt 2).
 *
 * Vorher baute jede Listenseite ihre eigene Anordnung: die Suche mal links,
 * mal rechts, mit Beschriftung darüber und Hilfetext darunter oder ohne, die
 * Reiter gestreckt oder schmal. Jetzt: Reiter links, Suche rechts, ein
 * Zusatzfilter daneben — und eine Zahl am Reiter nur, wo sie Arbeit zählt.
 */
const lesen = (datei: string) => readFileSync(join(process.cwd(), datei), 'utf8');

describe('Listenleiste', () => {
  it('Reiter links, Suche rechts — die Suche ohne sichtbare Beschriftung, mit Namen für die Vorlesehilfe', () => {
    const { container } = render(
      <Listenleiste
        reiter={<Segmente name="Ansicht" werte={[{ wert: 'a', text: 'Offen' }, { wert: 'b', text: 'Alle' }]} wert="a" onChange={() => {}} />}
        suche={{ id: 's', wert: '', onChange: () => {}, platzhalter: 'Kunde oder Nummer' }}
      />,
    );
    const leiste = container.querySelector('.listenleiste')!;
    expect(leiste.firstElementChild).toHaveClass('listenleiste-reiter');
    expect(leiste.lastElementChild).toHaveClass('listenleiste-werkzeug');
    const feld = screen.getByRole('searchbox', { name: 'Suche' });
    expect(feld).toHaveAttribute('placeholder', 'Kunde oder Nummer');
    expect(container.querySelector('label')).toBeNull();
    expect(container.textContent).not.toContain('Suche');
  });

  it('gibt Getipptes weiter und nimmt einen eigenen Namen', async () => {
    const onChange = vi.fn();
    render(<Listenleiste suche={{ id: 's', wert: '', onChange, platzhalter: 'x', name: 'Kunden durchsuchen' }} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Kunden durchsuchen' }), 'H');
    expect(onChange).toHaveBeenCalledWith('H');
  });

  it('der Zusatzfilter steht neben der Suche, vor ihr', () => {
    const { container } = render(
      <Listenleiste
        suche={{ id: 's', wert: '', onChange: () => {}, platzhalter: 'x' }}
        zusatz={<select aria-label="Stand"><option>Jeder Stand</option></select>}
      />,
    );
    const werkzeug = container.querySelector('.listenleiste-werkzeug')!;
    expect(werkzeug.firstElementChild).toHaveClass('listenleiste-zusatz');
    expect(werkzeug.lastElementChild).toHaveClass('listenleiste-suche');
  });

  it('ohne Reiter keine leere Reiterspalte, ohne Suche und Zusatz kein Werkzeug', () => {
    const ohneReiter = render(<Listenleiste suche={{ id: 's', wert: '', onChange: () => {}, platzhalter: 'x' }} />);
    expect(ohneReiter.container.querySelector('.listenleiste-reiter')).toBeNull();
    ohneReiter.unmount();
    const nurReiter = render(<Listenleiste reiter={<span>R</span>} />);
    expect(nurReiter.container.querySelector('.listenleiste-werkzeug')).toBeNull();
  });
});

describe('Die Zahl am Reiter', () => {
  it('steht grau hinter dem Wort und wird mit einem echten Leerzeichen vorgelesen', () => {
    render(<Segmente name="Filter" werte={[{ wert: 'k', text: 'knapp', anzahl: 3 }]} wert="k" onChange={() => {}} />);
    const knopf = screen.getByRole('button', { name: 'knapp 3' });
    expect(within(knopf).getByText('3')).toHaveClass('segment-anzahl');
  });

  it('auch eine Null wird genannt — „nichts zu tun“ ist eine Auskunft', () => {
    render(<Segmente name="Filter" werte={[{ wert: 'k', text: 'fehlt', anzahl: 0 }]} wert="k" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'fehlt 0' })).toBeInTheDocument();
  });

  it('gleich geblieben: ohne Zahl ist der Reiter genau sein Wort', () => {
    const { container } = render(<Segmente name="Filter" werte={[{ wert: 'a', text: 'Alle' }]} wert="a" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Alle' }).textContent).toBe('Alle');
    expect(container.querySelector('.segment-anzahl')).toBeNull();
  });
});

describe('Gestaltung', () => {
  const css = lesen('src/styles/lot.css');

  it('am Handy die Suche oben, ab dem Tablet Reiter links und Suche rechts', () => {
    expect(css).toMatch(/\.listenleiste \{ display: flex; flex-direction: column-reverse;/);
    expect(css).toMatch(/@media \(min-width: 760px\) \{\s*\.listenleiste \{ flex-direction: row;/);
    expect(css).toMatch(/\.listenleiste-werkzeug \{ flex: 0 1 30rem; margin-left: auto;/);
  });

  it('Reiter nach ihrem Text breit — „Deaktivierte 12“ bricht nicht mitten im Wort', () => {
    expect(css).toMatch(/\.listenleiste-reiter \.segment \{ grid-auto-columns: auto; \}/);
    expect(css).toMatch(/\.segment-anzahl \{[^}]*white-space: nowrap;/);
  });

  it('der Fokusring wie bei jedem Feld: 3 px um Lupe und Feld', () => {
    expect(css).toMatch(/\.listenleiste-suche:has\(input:focus-visible\) \{ outline: 3px solid var\(--brand-fixed\);/);
  });
});

/*
  KEINE LISTE BAUT IHRE LEISTE MEHR SELBST. Die alten Anordnungen trugen ihre
  eigenen Klassen und eine sichtbare Beschriftung „Suche“ über dem Feld; eine
  Seite, die so wieder gebaut würde, fiele hier auf.
*/
describe('Alle Listenseiten nutzen die Listenleiste', () => {
  const seiten = [
    'src/features/quotes/QuotesView.tsx',
    'src/features/maintenance/WartungenView.tsx',
    'src/features/customers/CustomersView.tsx',
    'src/features/orders/StockView.tsx',
    'src/features/orders/MaterialCatalog.tsx',
    'src/features/orders/AdminOrdersView.tsx',
    'src/features/projects/AdminProjectsView.tsx',
    'src/features/users/UserMgmtView.tsx',
    'src/features/invoices/InvoicesView.tsx',
    'src/features/invoices/RechnungenLesen.tsx',
    'src/features/worksheets/WorkSheetsListView.tsx',
  ];

  it.each(seiten)('%s', (datei) => {
    const quelle = lesen(datei);
    expect(quelle).toContain('<Listenleiste');
    expect(quelle).not.toMatch(/label="Suche"/);
    expect(quelle).not.toMatch(/listen-werkzeug|lager-werkzeug|rechnungen-filter|scheine-werkzeug/);
  });
});
