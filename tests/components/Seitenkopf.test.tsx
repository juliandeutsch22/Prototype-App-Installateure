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
  it('ab dem Tablet gibt der Titel nach, bis 18 rem — erst darunter rutschen die Knöpfe unter ihn', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 760px\) \{\s*\.seitenkopf-zeile \{ flex-wrap: wrap;[^}]*\}\s*\.seitenkopf-zeile > \.plankopf-titel \{ flex: 1 1 18rem; \}/);
  });
});

/*
  RÜCKMELDUNG 31.10.2026 (E31): „Buttons rechts auf die gleiche Höhe wie die
  Überschrift; alle Seiten und Untertabs beginnen auf derselben Höhe.“
  Gemessen über 46 Ansichten in drei Breiten saßen die Knöpfe 15 px über der
  Mitte des Titels, Akten und Einstellungen begannen 56 bzw. 117 px tiefer.
*/
describe('Drei feste Zeilen: Ort, Titel mit Knöpfen, Meta (E31)', () => {
  it('die Knöpfe stehen in der Titelzeile, nicht neben dem ganzen Kopf', () => {
    const { container } = kopf('/lager', { action: <button type="button">Wareneingang</button>, subtitle: 'Bestände' });
    const zeile = container.querySelector('.seitenkopf-zeile')!;
    expect(zeile.querySelector('h1')).toHaveTextContent('Titel');
    expect(zeile.querySelector('.seitenkopf-rechts')).toContainElement(screen.getByRole('button', { name: 'Wareneingang' }));
    // Ortszeile darüber, Meta darunter — beide außerhalb der Titelzeile.
    expect(zeile.previousElementSibling).toHaveClass('seitenkopf-ort');
    expect(zeile.nextElementSibling).toHaveClass('seitenkopf-meta');
  });

  it('der rechte Block ist genau eine Titelzeile hoch — die Knöpfe stehen mittig zur Überschrift', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const plan = readFileSync(join(process.cwd(), 'src/styles/lot-planlinie.css'), 'utf8');
    expect(css).toMatch(/\.seitenkopf-rechts \{[^}]*align-items: center;[^}]*height: 1\.75rem; \}/);
    expect(css).toMatch(/@media \(min-width: 760px\) \{ \.seitenkopf-rechts \{ height: 2\.25rem; \} \}/);
    expect(plan).toMatch(/\.seitenkopf h1 \{ font-size: 1\.5rem; line-height: 1\.75rem;/);
    expect(plan).toMatch(/@media \(min-width: 760px\) \{ \.seitenkopf h1 \{ font-size: 1\.875rem; line-height: 2\.25rem; \} \}/);
  });

  it('der Rückweg steht in der Ortszeile, nicht als Zeile darüber', () => {
    const { container } = kopf('/customers/k1', { zurueck: { to: '/customers', text: 'Zur Kundenliste' } });
    const ort = container.querySelector('.seitenkopf-ort')!;
    expect(ort.querySelector('a')).toHaveAttribute('href', '/customers');
    expect(ort).toHaveTextContent('← Zur Kundenliste');
    // Nichts steht vor der Ortszeile.
    expect(ort.previousElementSibling).toBeNull();
  });

  it('Gegenprobe: ohne Rückweg bleibt die Ortszeile die Gruppe aus dem Menü, ohne Link', () => {
    const { container } = kopf('/customers/k1');
    expect(container.querySelector('.seitenkopf-ort')).toHaveTextContent('Aufträge');
    expect(container.querySelector('.seitenkopf-ort a')).toBeNull();
  });

  it('am Handy keine Skizze neben dem Titel — sie schob die Überschrift nach unten', () => {
    const { container } = kopf('/invoices', { stand: <ul><li>Offen</li></ul> });
    expect(container.querySelector('.plankopf-titel [data-skizze]')).toBeNull();
    // Die Skizze des Bereichs steht weiter im Schriftfeld (ab dem Tablet sichtbar).
    expect(container.querySelector('.schriftfeld [data-skizze="rechnung"]')).not.toBeNull();
  });
});
