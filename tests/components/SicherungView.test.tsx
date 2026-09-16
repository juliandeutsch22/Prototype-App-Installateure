import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import SicherungView from '@/features/settings/SicherungView';
import LaufStatus from '@/features/settings/LaufStatus';

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
let letzterLauf:
  | {
      zuletztErfolg?: number;
      kennzahl?: number;
      kennzahlEinheit?: string;
      zielExtern?: boolean;
    }
  | undefined;
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

  it('sagt, wie viele Fotos mitgingen — und wie viele noch fehlen', async () => {
    /*
      DER BESTAND GEHT IN EINEM ZUG HINAUS, DIE FOTOS NICHT. Ein Lauf nimmt so
      viele Bilder, wie in seine Laufzeit passen, und holt den Rest in den
      nächsten Nächten nach. Stünde hier nur „gesichert", hielte jemand einen
      Rückstand von dreitausend Fotos für erledigt — und genau die sind der
      Beweis am Handwerksschein.
    */
    ausleitung.mockResolvedValue({
      data: {
        companyId: 'perl', zeilen: 12, bytes: 1000, pfad: 'x', geraeumt: 0,
        ziel: 'eimer/ausleitung/perl/2026-09-16/023007.jsonl',
        dateien: 200, dateienOffen: 3041,
      },
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    const beleg = await screen.findByText(/Zuletzt gesichert:/);
    expect(beleg).toHaveTextContent('200');
    expect(beleg).toHaveTextContent('3041 noch offen');
  });

  it('sagt ausdrücklich, wenn KEIN Foto mehr fehlt', async () => {
    // „0 noch offen" wäre dieselbe Auskunft und die schlechtere: eine Null
    // liest sich wie ein Zähler, der noch nicht gelaufen ist.
    ausleitung.mockResolvedValue({
      data: {
        companyId: 'perl', zeilen: 12, bytes: 1000, pfad: 'x', geraeumt: 0, ziel: 'z',
        dateien: 4, dateienOffen: 0,
      },
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    const beleg = await screen.findByText(/Zuletzt gesichert:/);
    expect(beleg).toHaveTextContent('es fehlt keines');
    expect(beleg).not.toHaveTextContent('noch offen');
  });

  it('behauptet nichts über Fotos, wenn die Function nichts dazu sagt', async () => {
    /*
      EINE ÄLTERE FASSUNG DER FUNCTION SCHICKT DIE FELDER NICHT MIT. Sie dann
      als „0 mitgesichert, es fehlt keines" anzuzeigen wäre die bequeme
      Fassung und eine Falschaussage: „nicht gesagt" ist nicht „nichts offen".
    */
    ausleitung.mockResolvedValue({
      data: { companyId: 'perl', zeilen: 12, bytes: 1000, pfad: 'x', geraeumt: 0, ziel: 'z' },
    });
    zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Sicherung jetzt erstellen' }));

    const beleg = await screen.findByText(/Zuletzt gesichert:/);
    expect(beleg).not.toHaveTextContent('Fotos');
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

/**
 * Wo die Sicherung liegt.
 *
 * Ohne gesetzten Zielspeicher schreibt die Ausleitung in denselben
 * Google-Projektbereich wie die Daten. Gegen einen Fehlgriff hilft das
 * sofort; gegen „der Zugang zum Projekt ist weg" gar nicht. Bis zum
 * 08.09.2026 stand diese halbe Wirkung allein in der Deployment-Dokumentation
 * — eine Sicherung, deren Grenze man nur durch Lesen einer Datei erfährt,
 * hält man für ganz.
 */
describe('Wo der Stand liegt', () => {
  it('sagt es, wenn die Sicherung im selben Projekt liegt', async () => {
    letzterLauf = { zuletztErfolg: Date.now() - 6 * 3_600_000, zielExtern: false };
    zeige();
    expect(
      await screen.findByText(/im selben Projekt wie die Daten/),
    ).toBeInTheDocument();
  });

  it('schweigt, wenn ein Ziel ausserhalb gesetzt ist', async () => {
    letzterLauf = { zuletztErfolg: Date.now() - 6 * 3_600_000, zielExtern: true };
    zeige();
    await screen.findByText(/lief zuletzt vor 6 Stunden durch/);
    expect(screen.queryByText(/im selben Projekt wie die Daten/)).not.toBeInTheDocument();
  });

  /*
    Ein Lauf aus einer Fassung, die das Feld noch nicht schreibt, ist kein
    Befund, sondern eine ältere Fassung. Etwas zu behaupten, das man nicht
    weiss, wäre schlechter als zu schweigen.
  */
  it('behauptet nichts, wenn der Lauf es nicht mitteilt', async () => {
    letzterLauf = { zuletztErfolg: Date.now() - 6 * 3_600_000 };
    zeige();
    await screen.findByText(/lief zuletzt vor 6 Stunden durch/);
    expect(screen.queryByText(/im selben Projekt wie die Daten/)).not.toBeInTheDocument();
  });

  /*
    NUR DIE AUSLEITUNG. Der Bilanzlauf schreibt nichts in einen Speicher, für
    ihn ist die Frage sinnlos — und ein Hinweis auf einen Zielspeicher unter
    einer Monatsbilanz wäre schlicht falsch. Die Bedingung steht im Code; ohne
    diesen Test fiele sie beim nächsten Umbau still weg.
  */
  it('sagt es beim Bilanzlauf gar nicht, egal was dort steht', async () => {
    letzterLauf = { zuletztErfolg: Date.now() - 6 * 3_600_000, zielExtern: false };
    render(<LaufStatus art="bilanzen" />);
    await screen.findByText(/lief zuletzt vor 6 Stunden durch/);
    expect(screen.queryByText(/im selben Projekt wie die Daten/)).not.toBeInTheDocument();
  });
});
