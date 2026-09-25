import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RowMenu from '@/components/RowMenu';

/**
 * Das Zeilenmenue traegt die seltenen und die gefaehrlichen Aktionen. Zwei
 * Dinge muessen stimmen: es darf nicht von selbst aufgehen, und es muss sich
 * wieder schliessen lassen — sonst steht ein „Deaktivieren" unter dem Daumen,
 * der gerade weiterscrollen wollte.
 */

const aktionen = (onA = vi.fn(), onB = vi.fn()) => [
  { label: 'Passwort-Mail senden', onSelect: onA },
  { label: 'Deaktivieren', onSelect: onB, danger: true },
];

describe('Zeilenmenue', () => {
  it('ist zu, solange niemand tippt', () => {
    render(<RowMenu about="Max Mustermann" items={aktionen()} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weitere Aktionen/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('zeigt auf Tipp alle Aktionen', async () => {
    render(<RowMenu about="Max Mustermann" items={aktionen()} />);
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    const eintraege = screen.getAllByRole('menuitem').map((e) => e.textContent);
    expect(eintraege).toEqual(['Passwort-Mail senden', 'Deaktivieren']);
  });

  it('fuehrt die gewaehlte Aktion aus und schliesst danach', async () => {
    const senden = vi.fn();
    render(<RowMenu about="Max Mustermann" items={aktionen(senden)} />);
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Passwort-Mail senden' }));
    expect(senden).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('schliesst mit Escape, ohne etwas auszuloesen', async () => {
    const senden = vi.fn();
    const sperren = vi.fn();
    render(<RowMenu about="Max Mustermann" items={aktionen(senden, sperren)} />);
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(senden).not.toHaveBeenCalled();
    expect(sperren).not.toHaveBeenCalled();
  });

  it('schliesst bei einem Klick daneben', async () => {
    render(
      <div>
        <RowMenu about="Max Mustermann" items={aktionen()} />
        <p>irgendwo daneben</p>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByText('irgendwo daneben'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  /**
   * Die erste Fassung stand `fixed` und schloss bei JEDEM Scroll-Ereignis.
   * Am Telefon laeuft der Schwung nach dem Loslassen weiter: wer am Ende
   * eines Wischers auf „⋯" tippt, sah das Menue aufblitzen und sofort wieder
   * verschwinden. Gegen den Browser reproduziert, dann am Dokument verankert.
   */
  it('bleibt offen, wenn die Seite nachscrollt', async () => {
    render(<RowMenu about="Max Mustermann" items={aktionen()} />);
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    // In act(), sonst haengt eine ausgeloeste Zustandsaenderung noch in der
    // Warteschlange und der Test bestuende auch mit dem Fehler.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  /*
    Prüflauf 25.09.2026, P4-06: das Menü hängt am Ende von `body`. Der Fokus
    blieb auf „⋯", die Pfeiltasten taten nichts, und Tab ließ das Menü offen
    stehen, während der Fokus woanders weiterlief.
  */
  it('holt den Fokus auf den ersten Eintrag und wandert mit den Pfeiltasten', async () => {
    render(
      <RowMenu
        about="Max Mustermann"
        items={[...aktionen(), { label: 'Rolle ändern', onSelect: vi.fn() }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    const [senden, sperren, rolle] = screen.getAllByRole('menuitem');
    expect(senden).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(sperren).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(senden).toHaveFocus(); // vom letzten wieder zum ersten
    await userEvent.keyboard('{ArrowUp}');
    expect(rolle).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(senden).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(rolle).toHaveFocus();
    // Die Einträge sind keine eigenen Tab-Stopps.
    for (const e of [senden, sperren, rolle]) expect(e).toHaveAttribute('tabindex', '-1');
  });

  it('löst den Eintrag mit Enter aus', async () => {
    const sperren = vi.fn();
    render(<RowMenu about="Max Mustermann" items={aktionen(vi.fn(), sperren)} />);
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen/ }));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(sperren).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weitere Aktionen/ })).toHaveFocus();
  });

  it('schliesst mit Tab und gibt den Fokus an „⋯" zurück', async () => {
    render(<RowMenu about="Max Mustermann" items={aktionen()} />);
    const knopf = screen.getByRole('button', { name: /Weitere Aktionen/ });
    await userEvent.click(knopf);
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
    await userEvent.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(knopf).toHaveFocus();
  });

  it('gibt den Fokus auch nach Escape an „⋯" zurück', async () => {
    render(<RowMenu about="Max Mustermann" items={aktionen()} />);
    const knopf = screen.getByRole('button', { name: /Weitere Aktionen/ });
    await userEvent.click(knopf);
    await userEvent.keyboard('{Escape}');
    expect(knopf).toHaveFocus();
  });

  it('nennt die Zeile, zu der es gehoert', async () => {
    render(<RowMenu about="Rechnung 2026-1001" items={aktionen()} />);
    await userEvent.click(screen.getByRole('button', { name: /Rechnung 2026-1001/ }));
    expect(screen.getByRole('menu', { name: 'Aktionen für Rechnung 2026-1001' })).toBeInTheDocument();
  });
});
