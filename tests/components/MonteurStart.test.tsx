import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: null, company: null }) }));

const { default: MonteurStart } = await import('@/features/dashboard/MonteurStart');

/**
 * Die Startseite des Monteurs: höchstens drei Karten — Heute, Diese Woche,
 * Offen für dich (Design-Durchgang 25.09.2026).
 */
const einsatz = {
  id: 'a1',
  date: '2026-09-25',
  projectNumber: 'PR-187',
  customerName: 'Max Musterkunde',
  address: 'Ludersdorf 204',
  contactName: 'Julian Deutsch',
  contactPhone: '0660 6322503',
  asHelper: false,
  comment: 'Rohr verlegen',
};
const letzte = { startTime: '07:00', endTime: '16:00', breakDuration: 30, minuten: 510, projectNumber: 'PR-187' };

function zeichne(props: Partial<Parameters<typeof MonteurStart>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MonteurStart
        einsaetze={[einsatz]}
        letzte={letzte}
        woche={{ istMin: 17 * 60, sollMin: 38 * 60 + 30 }}
        monat={{ name: 'September', saldoMin: 60 }}
        fehlendeTage={[]}
        offeneAnforderungen={0}
        scheineAn
        materialAn
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('Monteur-Start', () => {
  it('zeigt höchstens drei Karten', () => {
    const { container } = zeichne();
    expect(container.querySelectorAll('section')).toHaveLength(3);
  });

  it('nennt Baustelle, Nummer und Aufgabe — und macht Adresse und Anruf zu Handgriffen', () => {
    zeichne();
    expect(screen.getByText('Max Musterkunde')).toBeInTheDocument();
    expect(screen.getByText('Rohr verlegen')).toBeInTheDocument();
    expect(screen.getByText(/PR-187/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ludersdorf 204/ })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    );
    expect(screen.getByRole('link', { name: /0660 6322503/ })).toHaveAttribute('href', 'tel:06606322503');
  });

  it('bietet „Wie zuletzt“ als Hauptknopf, wenn es dieselbe Baustelle ist', () => {
    zeichne();
    const knopf = screen.getByRole('link', { name: /Wie zuletzt buchen/ });
    expect(knopf).toHaveTextContent('07:00–16:00 · 30 min Pause · 08:30 Std');
    expect(knopf).toHaveAttribute('href', '/time');
    expect(screen.getByRole('link', { name: 'Andere Zeit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schein schreiben' })).toHaveAttribute(
      'href',
      '/worksheet?projekt=PR-187',
    );
  });

  it('bucht NIE die gestrige Baustelle auf den heutigen Einsatz', () => {
    zeichne({ letzte: { ...letzte, projectNumber: 'PR-100' } });
    expect(screen.queryByRole('link', { name: /Wie zuletzt/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zeit erfassen' })).toBeInTheDocument();
  });

  it('zeigt die Woche gegen das Soll und den Saldo des Monats', () => {
    zeichne();
    const woche = screen.getByText('Diese Woche').closest('section')!;
    expect(woche).toHaveTextContent('17:00 von 38:30 Std');
    expect(within(woche).getByText('Saldo September')).toBeInTheDocument();
    expect(within(woche).getByText('+01:00')).toBeInTheDocument();
  });

  it('sagt ruhig „Alles erledigt“, wenn nichts offen ist', () => {
    zeichne();
    expect(screen.getByText('Alles erledigt.')).toBeInTheDocument();
  });

  it('nennt fehlende Tage mit Datum und angefordertes Material', () => {
    zeichne({ fehlendeTage: ['2026-09-22', '2026-09-23'], offeneAnforderungen: 2 });
    const offen = screen.getByText('Offen für dich').closest('section')!;
    expect(within(offen).getByRole('link', { name: '2 Tage ohne Buchung' })).toHaveAttribute('href', '/time');
    expect(offen).toHaveTextContent(/22\.09\..*23\.09\./);
    expect(within(offen).getByRole('link', { name: 'Material angefordert' })).toHaveAttribute('href', '/material');
  });

  it('ohne Einsatz: eine ruhige Zeile und trotzdem der Hauptknopf', () => {
    zeichne({ einsaetze: [] });
    expect(screen.getByText('Heute ist kein Einsatz eingeplant.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wie zuletzt buchen/ })).toBeInTheDocument();
  });
});
