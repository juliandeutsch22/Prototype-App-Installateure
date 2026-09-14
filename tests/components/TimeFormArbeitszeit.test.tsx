import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';

/**
 * Die Buchungsmaske sagt, was sie bucht.
 *
 * WAS HIER SCHIEFGING. Die Maske nahm Von, Bis und Pause entgegen und zeigte
 * das Ergebnis nirgends. Zwei Eingaben laufen damit still in die falsche
 * Richtung, und beide landen über die Monatsbilanz auf einem Lohnzettel:
 *
 *   – Eine Endzeit VOR der Startzeit liest `calcWorkMin` als Einsatz über
 *     Mitternacht. Das ist für Bereitschaft und Notdienst richtig — und macht
 *     aus einem vertippten „06:00" statt „16:00" dreiundzwanzig Stunden.
 *   – Eine Pause, die länger ist als der Zeitraum, wird auf null gekappt: der
 *     Tag steht gebucht da, gearbeitet wurde laut App nichts.
 *
 * Geprüft wird hier die MASKE, nicht die Formel — die steht in
 * `tests/unit/zeitPlausibilitaet.test.ts`. Beides ist nötig: eine richtige
 * Formel, die niemand zu sehen bekommt, ändert an dem Tippfehler nichts.
 */

const MONTEUR = 'u1';

const eintraegeAmTag = vi.fn(async () => []);
vi.mock('@/lib/db/timeEntries', () => ({
  // Die Maske schreibt über das Ausgangsfach; die Antwort ist der Stand.
  createTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: () => eintraegeAmTag(),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: {
    uid: MONTEUR,
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as const,
    companyId: 'perl',
    docId: MONTEUR,
  } as unknown as AppUser,
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Ein Zeit- oder Zahlenfeld setzen, wie es der Browser täte. */
function setze(beschriftung: string, wert: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(beschriftung)), { target: { value: wert } });
}

/*
  Die Zeile mit der gerechneten Arbeitszeit, ÜBER ELEMENTGRENZEN HINWEG: die
  Zahl steht in einem eigenen `strong`, ein schlichtes `getByText(/Arbeitszeit:/)`
  fände sie nie — und träfe damit auch dann nichts, wenn die Zeile da ist.
*/
const istZeile = (_t: string, el: Element | null) => /^Arbeitszeit: /.test(el?.textContent ?? '');

function zeile() {
  return screen.getByText(istZeile, { selector: 'p' });
}

beforeEach(() => {
  eintraegeAmTag.mockClear();
});

describe('Die gerechnete Arbeitszeit in der Maske', () => {
  it('steht schon vor dem ersten Tastendruck da', async () => {
    // Die Vorbelegung ist 07:00–16:00 mit 30 Minuten Pause.
    zeichne();
    expect(zeile().textContent).toMatch(/08:30 Std/);
  });

  it('folgt jeder Änderung', () => {
    zeichne();
    setze('Bis', '18:00');
    expect(zeile().textContent).toMatch(/10:30 Std/);
    setze('Pause', '60');
    expect(zeile().textContent).toMatch(/10:00 Std/);
  });

  it('macht den Tippfehler in der Endzeit sichtbar', () => {
    /*
      DER FALL, UM DEN ES GEHT: aus „16:00" wird „06:00". Vorher stand
      nirgends, dass daraus dreiundzwanzig Stunden werden.
    */
    zeichne();
    setze('Bis', '06:00');
    // 23 Stunden abzüglich der vorbelegten halben Stunde Pause.
    expect(zeile().textContent).toMatch(/22:30 Std/);
    expect(screen.getByRole('alert').textContent).toMatch(/Endzeit liegt vor der Startzeit/);
  });

  it('lässt den gültigen Notdienst in Ruhe, sagt aber, wie gerechnet wird', () => {
    // 22:00–06:00 muss buchbar bleiben — ohne Ermahnung.
    zeichne();
    setze('Von', '22:00');
    setze('Bis', '06:00');
    setze('Pause', '0');
    expect(zeile().textContent).toMatch(/08:00 Std/);
    expect(zeile().textContent).toMatch(/über Mitternacht/);
    expect(zeile().textContent).not.toMatch(/prüfen/);
  });

  it('meldet eine Pause, die den ganzen Zeitraum auffrisst', () => {
    zeichne();
    setze('Pause', '600');
    expect(zeile().textContent).toMatch(/00:00 Std/);
    expect(screen.getByRole('alert').textContent).toMatch(/keine Arbeitszeit/);
  });

  it('meldet den gewöhnlichen Tag NICHT', () => {
    // Eine Warnung, die täglich grundlos erscheint, wird nach einer Woche
    // nicht mehr gelesen — auch dann nicht, wenn sie einmal recht hat.
    zeichne();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('verschwindet bei einem Ganztagsstatus mitsamt den Zeitfeldern', () => {
    // „Urlaub" erfasst keine Arbeitszeiten; eine Zahl dazu wäre eine
    // Behauptung über Felder, die es gerade nicht gibt.
    zeichne();
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'Urlaub' } });
    expect(screen.queryByText(istZeile, { selector: 'p' })).not.toBeInTheDocument();
  });
});
