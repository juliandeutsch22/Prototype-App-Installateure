import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Assignment, Material, Project } from '@/types';
import { todayStr } from '@/lib/time';
import type { NewWorkSheet } from '@/lib/db/workSheets';

/**
 * Der Handwerksschein war ein Formular ohne Anschluss: er stand in einem
 * eigenen Bereich, und die erste Frage darin war „welche Baustelle?" — an
 * einen Monteur gestellt, der gerade von genau dieser Baustelle kommt.
 *
 * Diese Tests halten den Anschluss fest: die Einsätze des Tages stehen oben,
 * bei einem einzigen wird vorausgewählt, und der Abschluss-Knopf ist gesperrt,
 * solange die Stammdaten fehlen — statt anklickbar zu sein und nichts zu tun.
 */

const heute = todayStr();

const projekte: (Project & { id: string })[] = [
  {
    id: 'p1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12',
    contactPhone: '0664 1234567',
    status: 'Aktiv',
    billingMode: 'Regie',
  },
];

const einsaetze: (Assignment & { id: string })[] = [
  {
    id: 'a1',
    companyId: 'perl',
    userId: 'm1',
    userName: 'Max Mustermann',
    projectNumber: 'B-001',
    date: heute,
  } as Assignment & { id: string },
];

const materialien: (Material & { id: string })[] = [
  {
    id: 'mat1',
    companyId: 'perl',
    name: 'Eckventil 1/2 Zoll',
    category: 'Armaturen',
    articleNumber: 'EV-12',
    unit: 'Stk',
    stock: 40,
  } as Material & { id: string },
];

const listAssignmentsForUserInRange = vi.fn(async () => einsaetze);
const listProjectsByNumbers = vi.fn(async () => projekte);

vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: () => listAssignmentsForUserInRange(),
}));
const listActiveProjects = vi.fn(async () => projekte);
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: () => listActiveProjects(),
  listRecentProjects: () => listActiveProjects(),
  listProjectsByNumbers: () => listProjectsByNumbers(),
}));
const listMaterials = vi.fn(async () => materialien);
vi.mock('@/lib/db/materials', () => ({
  listMaterials: () => listMaterials(),
}));
const createWorkSheet = vi.fn<[string, NewWorkSheet], Promise<string>>(async () => 's1');
vi.mock('@/lib/db/workSheets', () => ({
  createWorkSheet: (companyId: string, entwurf: NewWorkSheet) =>
    createWorkSheet(companyId, entwurf),
  signWorkSheet: vi.fn(async () => undefined),
  listWorkSheetsForProject: vi.fn(async () => []),
}));
const callScheinVorbereiten = vi.fn(async () => ({ data: { zeiten: [] } }));
vi.mock('@/lib/functions', () => ({
  callScheinVorbereiten: () => callScheinVorbereiten(),
}));

const authWert = {
  user: {
    uid: 'm1',
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as const,
    companyId: 'perl',
    docId: 'm1',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WorkSheetView } = await import('@/features/worksheets/WorkSheetView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkSheetView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listAssignmentsForUserInRange.mockClear().mockResolvedValue(einsaetze);
  listProjectsByNumbers.mockClear().mockResolvedValue(projekte);
  listActiveProjects.mockClear().mockResolvedValue(projekte);
  callScheinVorbereiten.mockClear().mockResolvedValue({ data: { zeiten: [] } });
  listMaterials.mockClear().mockResolvedValue(materialien);
  createWorkSheet.mockClear().mockResolvedValue('s1');
});

describe('Handwerksschein', () => {
  it('waehlt die Baustelle vor, wenn der Tag eindeutig ist', async () => {
    zeichne();
    /**
     * Ein Einsatz an diesem Tag heißt: die Frage, die das Auswahlfeld stellt,
     * ist bereits beantwortet. Sie trotzdem zu stellen ist der Unterschied
     * zwischen einem Formular und einem Werkzeug.
     */
    expect(await screen.findByText(/Deine Einsätze an diesem Tag/)).toBeInTheDocument();
    const feld = await screen.findByLabelText<HTMLSelectElement>('Baustelle');
    expect(feld.value).toBe('B-001');
  });

  it('waehlt NICHT vor, wenn der Monteur auf zwei Baustellen war', async () => {
    listAssignmentsForUserInRange.mockResolvedValue([
      ...einsaetze,
      { ...einsaetze[0], id: 'a2', projectNumber: 'B-002' },
    ]);
    zeichne();
    await screen.findByText(/Deine Einsätze an diesem Tag/);
    // Eine falsche Vorauswahl wäre schlimmer als gar keine: der Schein liefe
    // auf die falsche Baustelle und würde dort unterschrieben.
    const feld = screen.getByLabelText<HTMLSelectElement>('Baustelle');
    expect(feld.value).toBe('');
  });

  it('zeigt Adresse und Telefon der Baustelle als Handgriff', async () => {
    zeichne();
    expect(
      await screen.findByRole('link', { name: /Hauptstraße 12/ }),
    ).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
    expect(screen.getByRole('link', { name: /0664 1234567/ })).toHaveAttribute(
      'href',
      'tel:06641234567',
    );
  });

  /**
   * Aus dem Betrieb gemeldet: „es lädt ewig."
   *
   * Die Vorausfüllung läuft über eine Cloud Function. Scheitert sie — oder
   * kommt sie im Keller mit einem Balken LTE nicht durch —, stand vorher ein
   * Kreisel über dem ganzen Formular, ohne Ende und ohne Ausweg. Auch über den
   * Unterschriften, die mit der Vorausfüllung nichts zu tun haben.
   */
  it('haelt das Unterschreiben nicht auf, wenn die Vorausfuellung scheitert', async () => {
    callScheinVorbereiten.mockRejectedValue(new Error('deadline-exceeded'));
    zeichne();

    expect(
      await screen.findByText(/Der Schein lässt sich trotzdem schreiben/),
    ).toBeInTheDocument();
    // Der Kern: der Beleg ist über Arbeit, die geleistet wurde, und der Kunde
    // steht daneben. Unterschreiben muss gehen.
    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    // Und es steht dabei, dass der Schein dann ohne Stunden eingefroren wird.
    expect(screen.getByText(/Ohne Stunden\./)).toBeInTheDocument();
    /*
      Das MATERIAL haengt nicht daran, und das muss dastehen. Es wird von Hand
      eingetragen; wer hier „ohne Stunden und Material" liest, glaubt, auch
      seine getippten Zeilen seien verloren, und tippt sie nach dem zweiten
      Versuch ein zweites Mal.
    */
    expect(screen.getByText(/ohnehin von Hand eingetragen/)).toBeInTheDocument();
  });

  it('laedt die Vorausfuellung auf Wunsch erneut', async () => {
    const nutzer = userEvent.setup();
    callScheinVorbereiten.mockRejectedValueOnce(new Error('deadline-exceeded'));
    zeichne();
    await screen.findByText(/Der Schein lässt sich trotzdem schreiben/);

    await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText(/keine Zeit gebucht/)).toBeInTheDocument();
    expect(callScheinVorbereiten).toHaveBeenCalledTimes(2);
  });

  /**
   * DAS MATERIAL WIRD VON HAND EINGETRAGEN — gemeldet aus dem Betrieb:
   *
   *   „beim Schein sollte man Materialien nur selbst hinzufügen können bei
   *   der Erstellung, um flexibler zu bleiben. Der Schein ist größtenteils
   *   für private Kunden mit kleineren Aufträgen und Reparaturen, da ist es
   *   schwierig, das schon im Voraus zu sagen."
   *
   * Vorausgefüllt wurde bis hierher aus den MaterialANFORDERUNGEN der
   * Baustelle, also aus dem vorab Bestellten. Bei einer Reparatur bestellt
   * niemand vorab; was verbaut wird, entscheidet sich vor Ort. Und was auf
   * dem Schein steht, unterschreibt der Kunde: eine Liste aus einer
   * Vorabbestellung führt genau den Streit herbei, den der Beleg verhindern
   * soll.
   */
  describe('Material', () => {
    it('faengt leer an und sagt, dass es von Hand dazukommt', async () => {
      zeichne();
      expect(await screen.findByText(/Verbautes Material \(0\)/)).toBeInTheDocument();
      expect(screen.getByText(/Noch kein Material eingetragen/)).toBeInTheDocument();
    });

    it('nimmt eine freie Zeile auf — fuer alles, was nicht im Lager steht', async () => {
      // Das beim Händler geholte Ersatzteil. Ohne diesen Weg müsste der
      // Monteur auf der Baustelle den Katalog pflegen, um eine Zeile
      // loszuwerden.
      const nutzer = userEvent.setup();
      zeichne();
      await screen.findByText(/Verbautes Material \(0\)/);

      await nutzer.type(
        screen.getByLabelText(/Freie Zeile/),
        'Dichtungssatz Mischbatterie',
      );
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));

      expect(await screen.findByText(/Verbautes Material \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Dichtungssatz Mischbatterie')).toBeInTheDocument();
    });

    it('nimmt einen Artikel aus dem Lager samt Einheit auf', async () => {
      // Der Regelfall. Bezeichnung und Einheit kommen richtig mit, statt
      // abgetippt zu werden.
      const nutzer = userEvent.setup();
      zeichne();
      await screen.findByText(/Verbautes Material \(0\)/);

      await nutzer.type(screen.getByLabelText('Artikel aus dem Lager'), 'eckventil');
      await nutzer.click(
        await screen.findByRole('button', { name: /Eckventil 1\/2 Zoll auf den Schein/ }),
      );

      expect(await screen.findByText(/Verbautes Material \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Stk')).toBeInTheDocument();
    });

    it('nimmt eine Zeile wieder heraus', async () => {
      const nutzer = userEvent.setup();
      zeichne();
      await screen.findByText(/Verbautes Material \(0\)/);
      await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Falsch eingetragen');
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
      await screen.findByText(/Verbautes Material \(1\)/);

      await nutzer.click(
        screen.getByRole('button', { name: 'Falsch eingetragen vom Schein nehmen' }),
      );

      expect(await screen.findByText(/Verbautes Material \(0\)/)).toBeInTheDocument();
    });

    it('speichert die eingetragenen Zeilen OHNE Anzeigekennung', async () => {
      /*
        Der Schein wird eingefroren und mit einer Prüfsumme versehen. Was
        hier hineingeht, steht danach unveränderlich auf einem Beleg.
      */
      const nutzer = userEvent.setup();
      zeichne();
      await screen.findByText(/Verbautes Material \(0\)/);
      await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Dichtungen');
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
      await screen.findByText(/Verbautes Material \(1\)/);

      await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));

      expect(createWorkSheet.mock.calls[0][1].material).toEqual([
        { name: 'Dichtungen', menge: 1 },
      ]);
    });

    it('behaelt die getippten Zeilen, wenn die Vorausfuellung scheitert', async () => {
      /*
        DER FALL, DER SONST EINGABE VERNICHTET. Die Frist läuft zwölf
        Sekunden; im Keller mit einem Balken LTE tippt der Monteur in dieser
        Zeit längst seine Zeilen. Sie wegen einer FREMDEN fehlgeschlagenen
        Abfrage zu löschen wäre auf der Baustelle nicht zu erklären.
      */
      const nutzer = userEvent.setup();
      let scheitern: (f: Error) => void = () => undefined;
      callScheinVorbereiten.mockReturnValue(
        new Promise((_, ab) => {
          scheitern = ab;
        }) as ReturnType<typeof callScheinVorbereiten>,
      );
      zeichne();
      await screen.findByText(/Verbautes Material \(0\)/);
      await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Kupferrohr 18mm');
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
      await screen.findByText(/Verbautes Material \(1\)/);

      scheitern(new Error('deadline-exceeded'));

      expect(
        await screen.findByText(/Die Zeiten konnten nicht geladen werden/),
      ).toBeInTheDocument();
      expect(screen.getByText('Kupferrohr 18mm')).toBeInTheDocument();
    });

    it('raeumt die Zeilen weg, wenn die Baustelle wechselt', async () => {
      /*
        Eine andere Baustelle ist ein ANDERER Schein. Material, das dort nicht
        verbaut wurde, auf dem Beleg stehen zu lassen, wäre schlimmer als ein
        verlorener Tipp — der Kunde unterschreibt es.
      */
      const nutzer = userEvent.setup();
      listAssignmentsForUserInRange.mockResolvedValue([
        ...einsaetze,
        { ...einsaetze[0], id: 'a2', projectNumber: 'B-002' },
      ]);
      const zweitesProjekt = { ...projekte[0], id: 'p2', projectNumber: 'B-002' };
      listProjectsByNumbers.mockResolvedValue([...projekte, zweitesProjekt]);
      listActiveProjects.mockResolvedValue([...projekte, zweitesProjekt]);
      zeichne();
      // Zwei Einsätze an diesem Tag: dann wählt das Formular bewusst NICHT
      // vor, und die Karte erscheint erst mit der Auswahl.
      const feld = await screen.findByLabelText<HTMLSelectElement>('Baustelle');
      await nutzer.selectOptions(feld, 'B-001');
      await screen.findByText(/Verbautes Material \(0\)/);

      await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Gehört zu B-001');
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
      await screen.findByText(/Verbautes Material \(1\)/);

      await nutzer.selectOptions(feld, 'B-002');

      expect(await screen.findByText(/Verbautes Material \(0\)/)).toBeInTheDocument();
      expect(screen.queryByText('Gehört zu B-001')).not.toBeInTheDocument();
    });
  });

  it('sperrt den Abschluss, solange Unterschriften fehlen', async () => {
    zeichne();
    /**
     * Auf die STAMMDATEN warten, nicht nur auf das Auswahlfeld.
     *
     * Das Feld steht sofort da; der Datensatz der Baustelle kommt eine Runde
     * später. Dazwischen sagt das Formular zu Recht „Die Stammdaten der
     * Baustelle werden noch geladen" — auf einem langsamen Läufer wurde genau
     * dieser Zwischenstand geprüft.
     */
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeDisabled();
    // Und sagt, was genau fehlt — statt den Knopf kommentarlos zu sperren.
    expect(await screen.findByText(/^Zum Abschließen fehlen:/)).toHaveTextContent(
      'Unterschrift Monteur, Unterschrift Kunde, Name des Kunden',
    );
  });
});
