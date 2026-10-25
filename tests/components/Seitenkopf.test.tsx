import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PageHeader from '@/components/PageHeader';
import { SeitenHilfeProvider } from '@/components/SeitenHilfe';
import { gruppeVon } from '@/app/navigation';

/**
 * Der Seitenkopf überall gleich (Design-Entwurf vom 25.10.2026, Punkt 1).
 *
 * Manche Seiten trugen eine Ortszeile über dem Titel, andere nicht; „Hilfe
 * zu dieser Seite“ stand als unterstrichenes Wort, das ⋯ daneben als
 * Zeichen. Jetzt hat jede Seite ihre Ortszeile, und Hilfe und ⋯ sind zwei
 * gleich ruhige Zeichen — rechts fällt nur die Hauptaktion auf.
 */
function kopf(pfad: string, props: Partial<Parameters<typeof PageHeader>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <SeitenHilfeProvider>
        <PageHeader title="Titel" {...props} />
      </SeitenHilfeProvider>
    </MemoryRouter>,
  );
}

describe('Die Ortszeile', () => {
  it('nennt ohne eigene Angabe die Gruppe aus dem Menü', () => {
    const { container, unmount } = kopf('/lager');
    expect(container.querySelector('.seitenkopf-ort')).toHaveTextContent('Material');
    unmount();
    expect(kopf('/time').container.querySelector('.seitenkopf-ort')).toHaveTextContent('Team');
  });

  it('gilt auch für Akten und Unterseiten einer Liste', () => {
    expect(kopf('/customers/k1').container.querySelector('.seitenkopf-ort')).toHaveTextContent('Aufträge');
  });

  it('gleich geblieben: eine eigene Ortszeile geht vor', () => {
    expect(kopf('/invoices', { ort: 'Geld · Mahnwesen' }).container.querySelector('.seitenkopf-ort')).toHaveTextContent('Geld · Mahnwesen');
  });

  it('die Startseite hat keine Gruppe — dort steht ihre eigene Zeile', () => {
    expect(kopf('/').container.querySelector('.seitenkopf-ort')).toBeNull();
  });

  it('ohne Router (eine Komponente für sich) bleibt der Kopf ohne Ortszeile', () => {
    const { container } = render(<PageHeader title="Allein" />);
    expect(container.querySelector('.seitenkopf-ort')).toBeNull();
  });
});

describe('gruppeVon', () => {
  it('ordnet Pfade ihrer Gruppe zu', () => {
    expect(gruppeVon('/invoices')).toBe('Geld');
    expect(gruppeVon('/admin-projects/p1')).toBe('Aufträge');
    expect(gruppeVon('/worksheet/s1')).toBe('Aufträge');
    expect(gruppeVon('/settings/firma')).toBe('Einstellungen');
    expect(gruppeVon('/')).toBeNull();
    expect(gruppeVon('/gibt-es-nicht')).toBeNull();
  });
});

describe('Hilfe zu dieser Seite', () => {
  it('ist ein ruhiges Zeichen, ausgeschrieben nur für Vorlesehilfe und Mauszeiger', () => {
    kopf('/lager', { hilfe: 'Erklärung' });
    const knopf = screen.getByRole('button', { name: 'Hilfe zu dieser Seite' });
    expect(knopf.querySelector('svg')).not.toBeNull();
    expect(knopf).toHaveAttribute('title', 'Hilfe zu dieser Seite');
    // Kein sichtbares Wort mehr — das unterstrichene „Hilfe zu dieser Seite“ ist weg.
    expect(knopf.textContent).toBe('');
  });

  it('so groß und still wie das ⋯ daneben: 44 px, grau, ohne Unterstreichung', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const regel = /\.seitenkopf-hilfe \{([^}]*)\}/.exec(css)![1];
    expect(regel).toContain('min-width: 2.75rem');
    expect(regel).toContain('min-height: 2.75rem');
    expect(regel).toContain('color: var(--text-muted)');
    expect(regel).not.toContain('underline');
  });
});

describe('Aktionen oben rechts', () => {
  it('ab dem Tablet gibt der Titelblock nach, damit ein langer Stand die Aktionen nicht unter sich schiebt', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 760px\) \{\s*\.seitenkopf \{ flex-wrap: wrap;[^}]*\}\s*\.seitenkopf > \.min-w-0 \{ flex: 1 1 18rem; \}/);
  });
});
