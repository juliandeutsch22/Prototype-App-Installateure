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

  it('der ausgewählte Tag in der Ecke bleibt ganz: der Rahmen ist eckig und schneidet nichts ab', () => {
    /*
      GEMELDET AUS DEM BETRIEB: „im Eckkaestchen des Kalenders wird der blaue
      Rahmen abgeschnitten." Damals rundete der Rahmen aussen und schnitt ab,
      was ueber die Ecke ragte; die Eckkaestchen rundeten deshalb mit. Seit
      09.11.2026 ist der Rahmen eckig (`rounded-none`) — es gibt keine Ecke
      mehr, ueber die etwas ragen koennte, und die Kaestchen bleiben eckig.
    */
    aufbauen({ selected: '2026-08-31' });
    const rahmen = screen.getByText('August 2026').closest('div')!.parentElement!;
    expect(rahmen).toHaveClass('rounded-none');
    expect(screen.getByRole('button', { name: /31\. August/ }).className).not.toMatch(/rounded/);
  });

  it('kommt mit einem Februar im Schaltjahr zurecht', () => {
    aufbauen({ year: 2028, month: 1 });
    const tage = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(tage).toHaveLength(29);
  });
});

/*
  OHNE RAHMEN, WENN ER IN EINER KARTE STEHT (Urlaub im Monat, 17 H). Gegenprobe:
  ohne den Schalter trägt er seinen Rahmen wie bisher (eckig seit 09.11.2026).
*/
describe('Monatskalender in einer Karte', () => {
  it('ohne eigenen Rahmen und ohne gerundete Ecken', () => {
    aufbauen({ ohneRahmen: true });
    const rahmen = screen.getByText('August 2026').closest('div')!.parentElement!;
    expect(rahmen).not.toHaveClass('panel');
    expect(document.querySelector('[class*="rounded-bl-"], [class*="rounded-br-"]')).toBeNull();
  });

  it('gleich geblieben: ohne den Schalter mit Rahmen', () => {
    aufbauen();
    const rahmen = screen.getByText('August 2026').closest('div')!.parentElement!;
    expect(rahmen).toHaveClass('panel');
  });
});

/*
  HEUTE TRÄGT DAS LOT (Planlinie, B4): über der Zahl hängt das Senkblei,
  statt dass ihr Kreis getönt ist — dasselbe Zeichen wie in der Planung.
*/
describe('Monatskalender — heute als Lot', () => {
  it('das Lot hängt genau über heute, statt eines getönten Kreises', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 12, 9, 0, 0));
    try {
      aufbauen();
      const mitLot = () => screen.getAllByRole('button').filter((b) => b.querySelector('.tag-lot'));
      expect(mitLot()).toHaveLength(1);
      expect(mitLot()[0]).toHaveAttribute('aria-current', 'date');
      expect(mitLot()[0]).toHaveAccessibleName(/12\. August/);
      // Der getönte Kreis von heute ist weg.
      expect(mitLot()[0].querySelector('.bg-info-bg')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('auch am gewählten Tag hängt das Lot, wenn er heute ist', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 12, 9, 0, 0));
    try {
      aufbauen({ selected: '2026-08-12' });
      const gewaehlt = screen.getByRole('button', { pressed: true });
      expect(gewaehlt.querySelector('.tag-lot')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Gegenprobe: in einem anderen Monat hängt nirgends ein Lot', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 2, 9, 0, 0));
    try {
      aufbauen();
      expect(document.querySelectorAll('.tag-lot')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
  EIN BLATT IST ECKIG (09.11.2026, mit Bildschirmfoto: „der Kalender ist an
  der Unterseite noch immer abgerundet und passt nicht zur Hülle“). Die
  Kästchen in den unteren Ecken rundeten noch selbst — aus der Zeit des
  gerundeten Rahmens. Gegenprobe: mit `rounded-bl-[15px]`/`rounded-br-[15px]`
  am letzten Wochenrand ist die Prüfung rot.
*/
describe('Monatskalender — eckig wie die Hülle', () => {
  it('kein Kästchen und nicht der Rahmen ist gerundet, auch der ausgewählte Tag in der Ecke nicht', () => {
    // September 2026: der 28. steht unten links, die letzte Zelle ist ein Füllfeld.
    const { container } = render(
      <MonthCalendar year={2026} month={8} selected="2026-09-28" onSelect={vi.fn()} onShiftMonth={vi.fn()} />,
    );
    const rahmen = container.querySelector('.monatskalender')!;
    expect(rahmen.className).toContain('rounded-none');
    const gerundet = [...container.querySelectorAll('[class*="rounded-b"], [class*="rounded-t"], [class*="rounded-l"], [class*="rounded-r"]')];
    expect(gerundet.map((e) => e.className)).toEqual([]);
  });
});
