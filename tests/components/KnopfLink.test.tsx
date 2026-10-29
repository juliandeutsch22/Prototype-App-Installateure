/**
 * Die Gestalt eines Knopfs an einer Stelle (`knopf.ts`, 29.10.2026).
 *
 * „Neuer Schein“, „Schein schreiben“, „Zeit erfassen“ und „Im Kalender
 * öffnen“ sind Links in der Rolle eines Knopfs. Sie trugen ihre Klassen von
 * Hand — mit Schatten und Skalierung beim Drücken, die kein Knopf der Linie
 * hat, und mit 14 px statt 15 px Schrift am Handy. `KnopfLink` nimmt die
 * Klassen jetzt aus derselben Quelle wie `Button`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Button from '@/components/Button';
import KnopfLink from '@/components/KnopfLink';
import { knopfKlassen, type Groesse, type Variant } from '@/components/knopf';

/*
  DIE KLASSEN DES KNOPFS VOR DEM UMZUG NACH knopf.ts — abgeschrieben aus
  Button.tsx im Stand vor a425fdf3. Der Umzug sollte nichts ändern; jede
  Abweichung hier wäre eine stille Änderung an jedem Knopf der App.
*/
const VORHER_GRUND = 'lot-knopf inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50';
const VORHER_GROESSE: Record<Groesse, string> = {
  normal: 'min-h-touch rounded px-4 py-2 text-fliess',
  klein: 'min-h-[2.25rem] rounded-sm px-3 py-1.5 text-sm',
};
const VORHER_VARIANTE: Record<Variant, string> = {
  primary: 'bg-brand font-semibold text-brand-fg hover:opacity-90',
  secondary: 'border border-line-strong bg-surface font-normal text-ink hover:border-brand-fixed',
  danger: 'border border-danger bg-surface font-semibold text-danger hover:bg-danger-bg',
  ghost: 'bg-transparent font-normal text-ink-muted hover:bg-surface-2',
  'ghost-dark': 'bg-transparent font-normal text-navi-text hover:bg-navi-tief hover:text-white',
};

const FAELLE = (Object.keys(VORHER_VARIANTE) as Variant[]).flatMap((v) =>
  (Object.keys(VORHER_GROESSE) as Groesse[]).map((g) => [v, g] as const),
);

describe('Button — gleich geblieben nach dem Umzug der Klassen', () => {
  it.each(FAELLE)('%s, %s: dieselben Klassen wie vorher', (variant, groesse) => {
    render(<Button variant={variant} groesse={groesse} className="w-full">Speichern</Button>);
    expect(screen.getByRole('button', { name: 'Speichern' }).className).toBe(
      `${VORHER_GRUND} ${VORHER_GROESSE[groesse]} ${VORHER_VARIANTE[variant]} w-full`,
    );
  });

  it('ohne Angaben: Hauptaktion in normaler Größe', () => {
    render(<Button>Anlegen</Button>);
    expect(screen.getByRole('button', { name: 'Anlegen' }).className).toBe(
      `${VORHER_GRUND} ${VORHER_GROESSE.normal} ${VORHER_VARIANTE.primary} `,
    );
  });
});

describe('KnopfLink', () => {
  it('mit `to`: ein Link innerhalb der App, gestaltet wie die Hauptaktion', async () => {
    render(
      <MemoryRouter initialEntries={['/worksheets']}>
        <Routes>
          <Route path="/worksheets" element={<KnopfLink to="/worksheet">Neuer Schein</KnopfLink>} />
          <Route path="/worksheet" element={<p>Neuer Schein geöffnet</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Neuer Schein' });
    expect(link).toHaveAttribute('href', '/worksheet');
    expect(link.className).toBe(`${knopfKlassen('primary', 'normal')} `);
    await userEvent.click(link);
    expect(screen.getByText('Neuer Schein geöffnet')).toBeInTheDocument();
  });

  it('mit `href`: ein gewöhnliches <a> nach draußen, mit denselben Klassen', () => {
    render(<KnopfLink href="webcal://beispiel.invalid/plan.ics" rel="noopener">Im Kalender öffnen</KnopfLink>);
    const link = screen.getByRole('link', { name: 'Im Kalender öffnen' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'webcal://beispiel.invalid/plan.ics');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link.className).toBe(`${knopfKlassen('primary', 'normal')} `);
  });

  it('dieselbe Gestalt wie ein Button derselben Variante und Größe', () => {
    render(
      <MemoryRouter>
        <KnopfLink to="/x" variant="secondary" groesse="klein" className="ml-2">Zum Plan</KnopfLink>
        <Button variant="secondary" groesse="klein" className="ml-2">Zum Plan</Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Zum Plan' }).className).toBe(screen.getByRole('button', { name: 'Zum Plan' }).className);
  });

  it('ohne die handgesetzten Reste: kein Schatten, kein Skalieren beim Drücken', () => {
    render(<MemoryRouter><KnopfLink to="/worksheet">Neuer Schein</KnopfLink></MemoryRouter>);
    const klassen = screen.getByRole('link', { name: 'Neuer Schein' }).className;
    expect(klassen).not.toMatch(/\bshadow/);
    expect(klassen).not.toMatch(/\bactive:scale/);
  });
});
