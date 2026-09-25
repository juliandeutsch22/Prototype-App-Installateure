import { expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

/**
 * Die Zahl einer Liste steht seit der Linie (docs/design/linie.md 2) rechts
 * in der Titelzeile der Karte (`.liste-anzahl`), nicht mehr in Klammern im
 * Titel — aus „Scheine (2)“ wurden der Titel „Scheine“ und rechts „2“.
 *
 * Wartet wie vorher `findByText('Scheine (2)')`, bis Titel UND Zahl
 * stimmen: die Karte steht schon während des Ladens mit ihrem Titel da, eine
 * Prüfung nur auf den Titel liefe gegen den Ladezustand.
 */
export async function karteZaehlt(titel: RegExp, zahl: number): Promise<void> {
  await waitFor(() => {
    // Ebene 2: der Kartentitel, nicht der gleichnamige Seitentitel (h1).
    const kopf = screen.getByRole('heading', { name: titel, level: 2 });
    const anzahl = kopf.closest('header')?.querySelector('.liste-anzahl');
    expect(anzahl).toHaveTextContent(new RegExp(`^${zahl}$`));
  });
}
