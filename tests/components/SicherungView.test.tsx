import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import SicherungView from '@/features/settings/SicherungView';

/**
 * Die Ansicht, die aus einer deployten Function eine benutzbare Sicherung
 * macht.
 *
 * WAS HIER SCHIEFGEHEN KANN, und zwar unbemerkt: der Knopf ruft die Function
 * auf, sie scheitert, und die Ansicht sagt nichts. Der Betrieb glaubt dann,
 * er habe eine Sicherung. Das ist schlimmer als gar kein Knopf — deshalb
 * prüft dieser Test vor allem den Fehlerweg, und dass die Meldung der
 * Function DURCHKOMMT statt durch ein allgemeines „hat nicht geklappt"
 * ersetzt zu werden. Sie sagt zum Beispiel, dass der Bestand zu groß ist,
 * und das ist die einzige Auskunft, mit der jemand etwas anfangen kann.
 */

const ausleitung = vi.fn();
const export_ = vi.fn();

vi.mock('@/lib/functions', () => ({
  callDatenAusleitungJetzt: (...a: unknown[]) => ausleitung(...a),
  callExportCompanyData: (...a: unknown[]) => export_(...a),
}));

/** Was die Überwachung über den letzten Lauf weiss. */
let letzterLauf: { zuletztErfolg?: number; kennzahl?: number; kennzahlEinheit?: string } | undefined;
vi.mock('@/lib/db/laeufe', () => ({
  ladeLauf: vi.fn(async () => (letzterLauf ? { companyId: 'perl', art: 'ausleitung', ...letzterLauf } : undefined)),
}));

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'gf', companyId: 'perl', name: 'Chef', role: 'Geschäftsführung' },
    company: { id: 'perl', name: 'Perl Installationen' },
  }),
}));

function zeige() {
  return render(
    <ToastProvider>
      <SicherungView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  ausleitung.mockReset();
  export_.mockReset();
  letzterLauf = undefined;
});

describe('Datensicherung', () => {
  it('sagt nach dem Lauf, WIE VIEL gesichert wurde', async () => {
    /**
     * „Erledigt" allein ist wertlos: eine Sicherung, die null Datensätze
     * schreibt, meldete dasselbe. Die Zahl ist der Unterschied zwischen einer
     * Bestätigung und einem Beleg.
     */
    ausleitung.mockResolvedValue({
      data: { companyId: 'perl', zeilen: 4211, bytes: 2_500_000, pfad: 'x', geraeumt: 1, ziel: 'Standard-Bucket des Projekts' },
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    // Die Zeile, die STEHEN bleibt — nicht die Kurzmeldung, die wieder
    // verschwindet. Nach einem Lauf will man den Beleg noch sehen koennen.
    const beleg = await screen.findByText(/Zuletzt gesichert:/);
    expect(beleg).toHaveTextContent('4211');
    expect(beleg).toHaveTextContent('2.4 MB');
    expect(beleg).toHaveTextContent('Standard-Bucket des Projekts');
  });

  it('reicht die Meldung der Function durch, statt sie zu verschlucken', async () => {
    ausleitung.mockRejectedValue(new Error('Der Datenbestand ist zu groß für einen Export in einem Stück.'));
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Der Datenbestand ist zu groß'),
    );
  });

  it('meldet auch beim Herunterladen den Fehler', async () => {
    export_.mockRejectedValue(new Error('Nur Geschäftsführung/Administrator.'));
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Alle Daten herunterladen' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Nur Geschäftsführung/Administrator.'),
    );
  });

  it('sperrt beide Knoepfe, solange einer laeuft', async () => {
    // Zwei gleichzeitige Läufe lesen denselben Bestand doppelt — und der
    // zweite überschriebe den Stand des ersten mitten im Schreiben.
    let loesen: (w: unknown) => void = () => undefined;
    ausleitung.mockReturnValue(new Promise((gut) => (loesen = gut)));
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    expect(screen.getByRole('button', { name: 'Sicherung läuft …' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Alle Daten herunterladen' })).toBeDisabled();

    loesen({ data: { companyId: 'perl', zeilen: 1, bytes: 10, pfad: 'x', geraeumt: 0, ziel: 'z' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' })).toBeEnabled(),
    );
  });
});

/**
 * „Sie läuft von selbst" war eine BEHAUPTUNG.
 *
 * Ob die nächtliche Sicherung tatsächlich lief, stand nur im
 * Google-Protokoll — und dorthin sieht in einem Installationsbetrieb niemand.
 * Sie konnte wochenlang ausfallen; bemerkt hätte man es an dem Tag, an dem
 * man sie braucht.
 */
describe('Der Zustand der nächtlichen Sicherung', () => {
  it('sagt, wann sie zuletzt durchging — und wie viel', async () => {
    letzterLauf = {
      zuletztErfolg: Date.now() - 6 * 3_600_000,
      kennzahl: 4812,
      kennzahlEinheit: 'Zeilen',
    };
    zeige();
    expect(await screen.findByText(/lief zuletzt vor 6 Stunden durch/)).toBeInTheDocument();
    expect(screen.getByText(/4.812/)).toBeInTheDocument();
  });

  it('meldet sich, wenn sie zu lange aussteht', async () => {
    letzterLauf = { zuletztErfolg: Date.now() - 80 * 3_600_000 };
    zeige();
    // Nach dem TEXT, nicht nach der Rolle: der Toast-Bereich trägt von
    // Anfang an eine leere Live-Region, und die käme zuerst.
    expect(await screen.findByText(/lief zuletzt vor 3 Tagen durch/)).toBeInTheDocument();
  });

  it('sagt „noch nie", wenn nichts festgehalten ist — statt zu schweigen', async () => {
    /*
      Der gefährlichste Fall: ein Betrieb ohne Aufzeichnung sieht genauso aus
      wie einer, bei dem nie etwas lief. Beides heisst, dass es keine
      Sicherung gibt, von der jemand weiss.
    */
    letzterLauf = undefined;
    zeige();
    expect(await screen.findByText(/noch nie durchgelaufen/)).toBeInTheDocument();
  });
});
