import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StartKarte from '@/features/dashboard/start/StartKarte';

/**
 * EIN PFEIL, NICHT ZWEI (Testbericht Runde 6, G9).
 *
 * `.link-weiter` und seine Geschwister setzen das „›“ selbst (`::after` in
 * `index.css`). Ein zweites Zeichen im Text des Links ergab auf der
 * Startseite „Einsatzplanung › ›“ und beim Monteur „Übriges zurückgeben → ›“.
 * jsdom zeichnet `::after` nicht — deshalb prüft die Quelle, dass kein Link
 * mit dieser Klasse einen eigenen Pfeil trägt, und die Karte, dass ihr
 * Verweis nur sein Wort ist.
 *
 * Gegenprobe: mit dem „<span> ›</span>“ in `StartKarte` und dem „→“ in
 * `RuestlisteAbhaken` schlagen beide Prüfungen fehl.
 */

const PFEIL_KLASSEN = /className="[^"]*\b(link-weiter|link-hinweis-weiter|link-still-weiter)\b[^"]*"/;

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return pfad.endsWith('.tsx') ? [pfad] : [];
  });
}

/** Der Inhalt jedes Elements, dessen Klasse selbst einen Pfeil setzt — bis zu seinem schliessenden Tag. */
function linkInhalte(quelle: string): string[] {
  const inhalte: string[] = [];
  const tag = /<(Link|a|NavLink|button)\b/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = tag.exec(quelle))) {
    const name = treffer[1];
    // Das öffnende Tag endet am ersten „>“, das nicht in einem `{…}` steht.
    let tiefe = 0;
    let i = treffer.index + treffer[0].length;
    for (; i < quelle.length; i += 1) {
      const z = quelle[i];
      if (z === '{') tiefe += 1;
      else if (z === '}') tiefe -= 1;
      else if (z === '>' && tiefe === 0) break;
    }
    const oeffnend = quelle.slice(treffer.index, i + 1);
    if (!PFEIL_KLASSEN.test(oeffnend) || oeffnend.endsWith('/>')) continue;
    const ende = quelle.indexOf(`</${name}>`, i);
    inhalte.push(quelle.slice(i + 1, ende).replace(/\{\/\*[\s\S]*?\*\/\}/g, ''));
  }
  return inhalte;
}

describe('Ein Pfeil je Verweis (Runde 6, G9)', () => {
  /*
    Gesucht wird ein Pfeil AM ENDE des Textes — dort, wo die Klasse ihren
    setzt. Ein Weg im Satz („Einstellungen → Sätze und Kosten → …“ in der
    Nachkalkulation) trennt Stationen und ist kein zweiter Pfeil.
  */
  it('kein Link mit „link-weiter“ endet auf ein eigenes „›“ oder „→“', () => {
    const funde = dateien(join(process.cwd(), 'src')).flatMap((datei) =>
      linkInhalte(readFileSync(datei, 'utf8'))
        .filter((inhalt) => /([›→]|&rsaquo;)\s*(<\/span>)?\s*$/.test(inhalt.trim()))
        .map((inhalt) => `${datei.replace(process.cwd(), '')}: ${inhalt.trim().slice(0, 60)}`),
    );
    expect(funde).toEqual([]);
  });

  it('die Prüfung sieht die Links überhaupt (sonst wäre sie leer grün)', () => {
    const alle = dateien(join(process.cwd(), 'src')).flatMap((d) => linkInhalte(readFileSync(d, 'utf8')));
    expect(alle.length).toBeGreaterThan(10);
  });

  it('der Verweis unter einer Startkarte ist nur sein Wort — das „›“ setzt die Klasse', () => {
    render(
      <MemoryRouter>
        <StartKarte titel="Die Mannschaft heute" verweisUnten verweis={{ to: '/assignments', text: 'Einsatzplanung' }}>
          <ul />
        </StartKarte>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Einsatzplanung' });
    expect(link).toHaveClass('link-weiter');
    expect(link.textContent).toBe('Einsatzplanung');
  });
});
