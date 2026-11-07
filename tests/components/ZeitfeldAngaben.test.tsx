import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ZeitfeldAngaben from '@/features/time/ZeitfeldAngaben';

/**
 * Die freien Angaben einer Buchung in Liste und Tagesnachweis (M06b): als
 * Text, dazu „Nachpflege“ als Warnung und „fehlt“ als offen.
 *
 * Gegenprobe: ohne den Baustein steht keine der Zeilen da.
 */
const definitionen = [
  { id: 'k', name: 'Kostenstelle', typ: 'text' as const, regeln: {}, reihenfolge: 1, aktiv: true },
  { id: 'km', name: 'Kilometer', typ: 'zahl' as const, regeln: { einheit: 'km' }, reihenfolge: 2, aktiv: true },
];

describe('ZeitfeldAngaben', () => {
  it('zeigt die Werte als Text in der Reihenfolge des Betriebs', () => {
    render(<ZeitfeldAngaben definitionen={definitionen} werte={{ km: 12, k: 'Wien' }} />);
    expect(screen.getByText('Kostenstelle: Wien · Kilometer: 12 km')).toBeInTheDocument();
  });

  it('nennt Nachpflege und fehlende Angaben', () => {
    render(<ZeitfeldAngaben definitionen={definitionen} werte={{}} offen={{ fehlt: ['Kilometer'], nachpflege: ['Kostenstelle'] }} />);
    expect(screen.getByText('Nachpflege: Kostenstelle')).toHaveClass('stand-warn');
    expect(screen.getByText('fehlt: Kilometer')).toHaveClass('stand-offen');
  });

  it('ohne Angaben und ohne Offenes steht nichts da', () => {
    const { container } = render(<ZeitfeldAngaben definitionen={definitionen} werte={undefined} offen={{ fehlt: [], nachpflege: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
