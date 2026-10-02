import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelefonLink } from '@/components/Kontakt';

/** U2, U3 (Nachtest 01.10.2026): einheitlich angezeigt, international gewählt, immer mit Namen vorgelesen. */
describe('TelefonLink', () => {
  it('zeigt national mit Leerzeichen, wählt mit +43 und nennt den Namen', () => {
    render(<TelefonLink nummer="06606322503" name="Julian Deutsch" />);
    const link = screen.getByRole('link', { name: /Julian Deutsch anrufen/ });
    expect(link).toHaveAttribute('href', 'tel:+436606322503');
    expect(link).toHaveTextContent('0660 6322503');
  });

  it('ohne Ansprechpartner: „Kunde anrufen“, nie nur „— anrufen“', () => {
    render(<TelefonLink nummer="+43 3112 12345" name="  " />);
    expect(screen.getByRole('link', { name: /— Kunde anrufen$/ })).toBeInTheDocument();
  });
});
