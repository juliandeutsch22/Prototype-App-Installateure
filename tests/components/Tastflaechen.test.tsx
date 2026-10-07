import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RechtLinks from '@/components/RechtLinks';

/**
 * Touch-Ziele unter 44 px (Prüflauf 25.09.2026).
 *
 * Gemessen im Browser: „Datenschutz"/„Impressum" in der Seitenleiste 17 px
 * hoch, der Öffnen-Link der Angebotsliste 24 px, die Links in den Hinweisen
 * der Startseite ebenso knapp. Vergrössert wird die TASTFLÄCHE, nicht das
 * Bild: senkrechtes Polster an einem Link im Fliesstext verschiebt keine
 * Zeile, und wo der Link ein Flex-Element ist, hebt ein gleich grosser
 * negativer Rand das Polster im Layout wieder auf.
 *
 * jsdom misst nichts; geprüft wird deshalb die Klasse — und dass beide Hälften
 * (Polster und Gegenrand) zusammen dastehen, wo sie gebraucht werden.
 */

/** Höhe der Schrift-Inhaltsfläche von Poppins: rund 1,4 × Schriftgrösse. */
const inhalt = (px: number) => px * 1.4;
/** Tailwind: py-3 = 12 px, py-3.5 = 14 px je Seite. */
const polster = (klasse: string) => (/\bpy-3\.5\b/.test(klasse) ? 14 : /\bpy-3\b/.test(klasse) ? 12 : 0);

describe('Tastflächen', () => {
  it('Datenschutz und Impressum sind mindestens 44 px hoch antippbar', () => {
    render(
      <MemoryRouter>
        <RechtLinks className="text-xs" />
      </MemoryRouter>,
    );
    for (const name of ['Datenschutz', 'Impressum']) {
      const klasse = screen.getByRole('link', { name }).className;
      expect(inhalt(12) + 2 * polster(klasse), name).toBeGreaterThanOrEqual(44);
    }
  });

  it.each([
    // „Jetzt nachtragen“ der Startseite ist seit dem 01.10.2026 eine eigene Zeile
    // (Abschnitt „Tage ohne Buchung“, min-h-touch) — kein Link im Fließtext mehr.
    ['src/features/dashboard/WartungHinweis.tsx', 'to="/wartungen"', 14],
    // Der Öffnen-Link der Angebotsliste ist seit der Linie „Lot“ die ganze
    // Zeile (`ListRow` mit `to`, mindestens 56 px hoch) — geprüft in
    // tests/components/QuotesView.test.tsx, „verlinkt jedes Angebot …“.
  ])('%s: der Link %s hat 44 px Tastfläche ohne neue Zeilenhöhe', (datei, ziel, schrift) => {
    const quelle = readFileSync(resolve(process.cwd(), datei), 'utf8');
    const stelle = quelle.indexOf(ziel);
    expect(stelle, `${ziel} in ${datei}`).toBeGreaterThan(-1);
    const klasse = /className="([^"]*)"/.exec(quelle.slice(stelle, stelle + 200))?.[1] ?? '';
    expect(inhalt(schrift) + 2 * polster(klasse)).toBeGreaterThanOrEqual(44);
    // Der Gegenrand gehört dazu — sonst würde die Zeile um das Polster höher.
    expect(klasse).toMatch(/-my-3(\.5)?\b/);
  });
});
