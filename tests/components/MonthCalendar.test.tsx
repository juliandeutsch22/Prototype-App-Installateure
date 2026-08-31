import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonthCalendar from '@/components/MonthCalendar';

/**
 * Der Kalender ist die Ansicht, an der die Einsatzplanung haengt. Faellt hier
 * eine Zelle in die falsche Spalte, plant jemand den falschen Tag ein — und
 * das faellt erst auf, wenn der Monteur woanders steht.
 */

function aufbauen(over: Partial<Parameters<typeof MonthCalendar>[0]> = {}) {
  const onSelect = vi.fn();
  const onShiftMonth = vi.fn();
  render(
    <MonthCalendar
      year={2026}
      month={7} // August
      selected={null}
      onSelect={onSelect}
      onShiftMonth={onShiftMonth}
      {...over}
    />,
  );
  return { onSelect, onShiftMonth };
}

describe('Monatskalender', () => {
  it('nennt Monat und Jahr', () => {
    aufbauen();
    expect(screen.getByText('August 2026')).toBeInTheDocument();
  });

  it('zeigt alle Tage des Monats, aber keinen darueber hinaus', () => {
    aufbauen();
    // August hat 31 Tage. Die Fuellzellen davor und danach sind keine Knoepfe.
    const tage = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(tage).toHaveLength(31);
  });

  it('beginnt die Woche am Montag', () => {
    aufbauen();
    const kopf = screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So)$/).map((e) => e.textContent);
    expect(kopf).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  });

  it('setzt den 1. August 2026 in die Samstag-Spalte', () => {
    // Der eigentliche Fehler, den das verhindert: eine falsche Vorlaufzahl
    // verschiebt den ganzen Monat um einen Tag.
    aufbauen();
    expect(screen.getByRole('button', { name: /^Samstag, 1\. August/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Montag, 31\. August/ })).toBeInTheDocument();
  });

  it('beschriftet Feiertage mit ihrem Namen', () => {
    // Farbe allein ist fuer Farbenblinde kein Signal.
    aufbauen();
    expect(
      screen.getByRole('button', { name: /15\. August, Mariä Himmelfahrt/ }),
    ).toBeInTheDocument();
  });

  it('nennt die Zahl der Eintraege im Namen des Tages, im richtigen Numerus', () => {
    aufbauen({
      marks: new Map([
        ['2026-08-03', 1],
        ['2026-08-04', 3],
      ]),
      markLabel: (n) => `${n} ${n === 1 ? 'Baustelle' : 'Baustellen'} geplant`,
    });
    expect(screen.getByRole('button', { name: /3\. August, 1 Baustelle geplant/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /4\. August, 3 Baustellen geplant/ })).toBeInTheDocument();
  });

  it('meldet den angeklickten Tag als ISO-Datum', async () => {
    const { onSelect } = aufbauen();
    await userEvent.click(screen.getByRole('button', { name: /^Montag, 17\. August/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-08-17');
  });

  it('kennzeichnet den gewaehlten Tag fuer die Vorlesehilfe', () => {
    aufbauen({ selected: '2026-08-17' });
    expect(screen.getByRole('button', { name: /17\. August/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /18\. August/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('blaettert vor und zurueck', async () => {
    const { onShiftMonth } = aufbauen();
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(onShiftMonth).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    expect(onShiftMonth).toHaveBeenCalledWith(-1);
  });

  it('kommt mit einem Februar im Schaltjahr zurecht', () => {
    aufbauen({ year: 2028, month: 1 });
    const tage = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(tage).toHaveLength(29);
  });
});
