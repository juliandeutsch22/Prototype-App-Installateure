import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IconButton from '@/components/IconButton';
import { BearbeitenKnopf, LoeschenKnopf, PdfKnopf } from '@/components/Symbolknoepfe';

/*
  DIE KNOPFARTEN DER SYMBOLE (E74, 10.11.2026). Der kleine Petrol-Kreis ist
  die eine Hauptsache einer Zeile; schlicht ohne Rahmen ist jede Handlung an
  einer Sache. Den gerahmten Symbolknopf (E72, R8) gibt es nicht mehr.
  Gegenprobe: mit dem Stand E72 (Schalter `gerahmt`, kein `rund`, keine
  Symbolknöpfe) sind die ersten drei Prüfungen rot.
*/
describe('IconButton', () => {
  it('rund: der Petrol-Kreis, ohne Ecke, mit Name für Vorlesehilfe und Hinweis', () => {
    render(<IconButton rund label="Zurück zu dieser Woche" disabled>x</IconButton>);
    const knopf = screen.getByRole('button', { name: 'Zurück zu dieser Woche' });
    expect(knopf).toHaveClass('symbol-rund', 'min-h-touch', 'min-w-touch');
    expect(knopf).not.toHaveClass('rounded');
    expect(knopf).not.toHaveClass('hover:bg-surface-2');
    expect(knopf).toHaveAttribute('title', 'Zurück zu dieser Woche');
    expect(knopf).toBeDisabled();
  });

  it('Stift, Papierkorb und PDF: je ein Zeichen, schlicht, der Papierkorb rot erst beim Antippen', () => {
    render(
      <>
        <BearbeitenKnopf label="Termin bearbeiten" />
        <LoeschenKnopf label="Termin löschen" />
        <PdfKnopf label="Schein als PDF teilen oder speichern" />
      </>,
    );
    const pfad = (name: string) => screen.getByRole('button', { name }).querySelector('path')!.getAttribute('d');
    expect(pfad('Termin bearbeiten')).toMatch(/^M5 20h3/);
    expect(pfad('Termin löschen')).toMatch(/^M4 7h16/);
    expect(pfad('Schein als PDF teilen oder speichern')).toMatch(/^M14 3H7.*M12 10v7/);
    for (const k of screen.getAllByRole('button')) {
      expect(k).toHaveTextContent(/^$/);
      expect(k).not.toHaveClass('border');
      expect(k).toHaveAttribute('data-icon', '');
    }
    expect(screen.getByRole('button', { name: 'Termin löschen' })).toHaveClass('hover:text-danger', 'text-ink-muted');
  });

  it('läuft die Handlung, ist das Symbol gesperrt und sagt es', () => {
    render(<PdfKnopf label="PDF" laeuft />);
    const knopf = screen.getByRole('button', { name: 'PDF' });
    expect(knopf).toBeDisabled();
    expect(knopf).toHaveAttribute('aria-busy', 'true');
  });

  it('gleich geblieben: ohne den Schalter schlicht, ohne Rahmen', () => {
    render(<IconButton label="Zeile entfernen" tone="danger">✕</IconButton>);
    const knopf = screen.getByRole('button', { name: 'Zeile entfernen' });
    expect(knopf).toHaveClass('text-ink-muted', 'hover:bg-danger-bg', 'hover:text-danger', 'min-h-touch', 'rounded');
    expect(knopf).not.toHaveClass('border');
    expect(knopf).toHaveAttribute('data-icon', '');
  });
});
