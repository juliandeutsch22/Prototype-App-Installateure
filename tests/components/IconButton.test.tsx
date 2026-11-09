import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IconButton from '@/components/IconButton';
import { variants } from '@/components/knopf';

/*
  DIE GERAHMTE SPIELART (E72, 09.11.2026, Regel R8): Steuerknöpfe wie Menge −
  und + tragen die Gestalt des Zweitknopfs aus `knopf.ts`. Gegenprobe: ohne
  den Schalter `gerahmt` rot. Der schlichte Symbolknopf bleibt, wie er war.
*/
describe('IconButton', () => {
  it('gerahmt: Rahmen, Fläche und Schrift des Zweitknopfs, gesperrt sichtbar blass', () => {
    render(<IconButton gerahmt label="Menge erhöhen" disabled>+</IconButton>);
    const knopf = screen.getByRole('button', { name: 'Menge erhöhen' });
    for (const klasse of variants.secondary.split(' ')) expect(knopf).toHaveClass(klasse);
    expect(knopf).toHaveClass('min-h-touch', 'min-w-touch', 'disabled:opacity-50');
    expect(knopf).not.toHaveClass('hover:bg-surface-2');
  });

  it('gleich geblieben: ohne den Schalter schlicht, ohne Rahmen', () => {
    render(<IconButton label="Zeile entfernen" tone="danger">✕</IconButton>);
    const knopf = screen.getByRole('button', { name: 'Zeile entfernen' });
    expect(knopf).toHaveClass('text-ink-muted', 'hover:bg-danger-bg', 'hover:text-danger', 'min-h-touch');
    expect(knopf).not.toHaveClass('border');
    expect(knopf).toHaveAttribute('data-icon', '');
  });
});
