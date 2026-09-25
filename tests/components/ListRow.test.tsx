import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { List, ListRow } from '@/components/ListRow';

/**
 * Die Listenzeile mit Platz vorne und unten.
 *
 * Vorne steht ein Mengenfeld oder ein Vorschaubild, unten eine Warnung oder
 * aufklappbare Einzelheiten. Beides gehört IN die Zeile (über ihre
 * Trennlinie), und eine Zeile ohne beides sieht aus wie bisher.
 */
describe('ListRow', () => {
  it('setzt vorne vor den Titel und unten hinter die Aktionen, beides in der Zeile', () => {
    render(
      <List>
        <ListRow title="Kupferrohr" vorne={<span>Menge</span>} unten={<p>Im Lager fehlen 7.</p>}>
          <button type="button">Weg</button>
        </ListRow>
      </List>,
    );
    const zeile = screen.getByRole('listitem');
    const vorne = screen.getByText('Menge').parentElement!;
    const unten = screen.getByText('Im Lager fehlen 7.').parentElement!;
    expect(vorne).toHaveClass('zeile-vorne');
    expect(unten).toHaveClass('zeile-unten');
    const teile = Array.from(zeile.children);
    expect(teile.indexOf(vorne)).toBe(0);
    expect(teile.indexOf(unten)).toBe(teile.length - 1);
    expect(teile.indexOf(screen.getByRole('button').parentElement!)).toBe(teile.length - 2);
  });

  it('ohne vorne und unten bleibt die Zeile, wie sie war', () => {
    render(
      <List>
        <ListRow title="Kupferrohr" subtitle="Lager: 40" />
      </List>,
    );
    const zeile = screen.getByRole('listitem');
    expect(zeile.querySelector('.zeile-vorne')).toBeNull();
    expect(zeile.querySelector('.zeile-unten')).toBeNull();
    expect(zeile.children).toHaveLength(1);
  });
});
