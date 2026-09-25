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
export async function karteZaehlt(titel: RegExp, zahl: number | string | RegExp): Promise<void> {
  await karteMitZahl(titel, zahl);
}

/**
 * Wie `karteZaehlt`, gibt aber die Karte (`section`) zurück — für Tests, die
 * danach in der Karte weitersuchen. Die Zahl darf auch ein Text sein
 * („1 von 8“ bei den Fotos des Scheins).
 */
export async function karteMitZahl(
  titel: RegExp,
  zahl: number | string | RegExp,
): Promise<HTMLElement> {
  let karte: HTMLElement | null = null;
  await waitFor(() => {
    // Ebene 2: der Kartentitel, nicht der gleichnamige Seitentitel (h1).
    // `hidden`: auch Karten eines gerade nicht gezeigten Schritts (der
    // Schein hält alle Schritte eingehängt und blendet nur aus).
    const kopf = screen.getByRole('heading', { name: titel, level: 2, hidden: true });
    const anzahl = kopf.closest('header')?.querySelector('.liste-anzahl');
    const muster =
      zahl instanceof RegExp
        ? zahl
        : new RegExp(`^${String(zahl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    expect(anzahl).toHaveTextContent(muster);
    karte = kopf.closest('section');
  });
  return karte!;
}
