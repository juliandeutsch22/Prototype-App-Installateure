import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AbschnittBlock } from '@/features/dashboard/start/Handlungsbedarf';
import type { Abschnitt, Ton } from '@/features/dashboard/start/abschnitte';

/*
  DIE ZEICHEN DER STARTSEITE (Planlinie B3, E30). Vorher trugen „leise“,
  „ok“ und „info“ denselben grünen Punkt, und wer abwesend war, bekam den
  Haken von „erledigt“. Jetzt hat jede Bedeutung ihr Zeichen; Rot bleibt
  Überfälligem vorbehalten.
*/
const ZEILEN: [Ton, string][] = [
  ['fehl', 'überfällig'],
  ['warn', 'knapp'],
  ['leise', 'einplanen'],
  ['ok', 'abholbereit'],
  ['info', 'heute'],
  ['abwesend', 'Urlaub'],
  ['einsatz', '2 Personen'],
];

function zeige() {
  const a: Abschnitt = {
    key: 'k', titel: 'Dringend', anzahl: ZEILEN.length,
    zeilen: ZEILEN.map(([ton, text], i) => ({ key: String(i), titel: `Eintrag ${i}`, status: { text, ton } })),
  };
  return render(<MemoryRouter><ul><AbschnittBlock a={a} /></ul></MemoryRouter>);
}

describe('Startseite — Statuszeichen je Ton', () => {
  it('jede Bedeutung ihr Zeichen', () => {
    zeige();
    const klasse = (text: string) => screen.getAllByText(text)[0].className;
    expect(klasse('überfällig')).toBe('stand stand-fehl');
    expect(klasse('knapp')).toBe('stand stand-warn');
    expect(klasse('einplanen')).toBe('stand stand-offen stand-leise-wort');
    expect(klasse('abholbereit')).toBe('stand stand-erledigt');
    expect(klasse('heute')).toBe('stand stand-geplant');
    expect(klasse('Urlaub')).toBe('stand stand-storniert');
    expect(klasse('2 Personen')).toBe('stand stand-info');
  });

  it('die Zahl des Abschnitts steht im Achskreis', () => {
    const { container } = zeige();
    expect(container.querySelector('h3 .achskreis')).toHaveTextContent('7');
  });
});
