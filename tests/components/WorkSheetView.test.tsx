import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Assignment, Material, Project, WorkSheet, WorkSheetZeit } from '@/types';
import { todayStr } from '@/lib/time';
import type { NewWorkSheet } from '@/lib/db/workSheets';
import { kanonischerInhalt } from '@shared/scheinHash';

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
const updateWorkSheetDraft = vi.fn<[string, Partial<NewWorkSheet>], Promise<void>>(
  async () => undefined,
);
type Unterschrift = { name: string; bild: string; geraetZeit: number };
const signWorkSheet = vi.fn<[string, Unterschrift, Unterschrift], Promise<void>>(
  async () => undefined,
);
let entwurf: (WorkSheet & { id: string }) | undefined;
const getWorkSheet = vi.fn(async () => entwurf);
let bestehendeScheine: (WorkSheet & { id: string })[] = [];
const listWorkSheetsForProject = vi.fn(async () => bestehendeScheine);
/*
  Die Fotoliste wird SOFORT nach jedem Upload ans Dokument geschrieben, nicht
  erst beim Speichern — sonst bliebe ein Bild im Storage zurück, auf das kein
  Dokument zeigt, wenn der Monteur das Fenster schliesst.
*/
const fotosFestgeschrieben = vi.fn(async () => undefined);

vi.mock('@/lib/db/workSheets', () => ({
  createWorkSheet: (companyId: string, e: NewWorkSheet) => createWorkSheet(companyId, e),
  updateWorkSheetDraft: (id: string, data: Partial<NewWorkSheet>) =>
    updateWorkSheetDraft(id, data),
  getWorkSheet: () => getWorkSheet(),
  signWorkSheet: (id: string, m: Unterschrift, k: Unterschrift) => signWorkSheet(id, m, k),
  listWorkSheetsForProject: () => listWorkSheetsForProject(),
  fotosAmEntwurf: (...a: unknown[]) => fotosFestgeschrieben(...(a as [])),
  vorbereiten: () => callScheinVorbereiten(),
}));
/*
  Die Foto-Schicht. Sie kapselt Canvas und Firebase Storage — beides gibt es
  in jsdom nicht, und beides ist nicht das, was hier geprüft wird. Geprüft
  wird, was die Ansicht damit MACHT: dass sie den Entwurf anlegt, das Bild
  anhängt, einen gescheiterten Upload stehen lässt statt ihn zu verschlucken,
  und vor dem Unterschreiben warnt.
*/
const komprimiere = vi.fn(async (b: Blob) => b);
const fotoHochladen = vi.fn<[string, string, Blob, number], Promise<unknown>>(async () => ({
  pfad: 'scheine/perl/s1/aaa.jpg',
  hash: 'aaa',
  bytes: 340_000,
  geraetZeit: 1,
}));
const fotoEntfernen = vi.fn<[string], Promise<void>>(async () => undefined);
vi.mock('@/lib/db/scheinFotos', () => ({
  komprimiere: (b: Blob) => komprimiere(b),
  fotoHochladen: (c: string, s: string, b: Blob, z: number) => fotoHochladen(c, s, b, z),
  fotoEntfernen: (p: string) => fotoEntfernen(p),
}));

/*
  Das Unterschriftsfeld zeichnet auf ein Canvas — in jsdom gibt es keins. Der
  Doppelgänger bietet stattdessen einen Knopf je Feld an und liefert ein
  festes Bild zurück. Geprüft wird hier ohnehin nicht das Zeichnen (dafür gibt
  es `SignaturePad.test.tsx`), sondern was die Ansicht mit dem Ergebnis tut.
*/
/*
  Wie oft ein Unterschriftsfeld EINGEHÄNGT wurde. Das echte Feld hält seine
  Striche nur im Speicher; würde es beim Wechsel der Schritte ausgehängt,
  wären sie weg — während der Schein sich weiter „unterschrieben" merkt.
*/
let felderEingehaengt = 0;

vi.mock('@/components/SignaturePad', () => ({
  default: forwardRef<
    { bildLesen: () => string | null; leeren: () => void },
    { titel: string; onChange?: (gesetzt: boolean) => void }
  >(function Feld({ titel, onChange }, ref) {
    useEffect(() => {
      felderEingehaengt += 1;
    }, []);
    useImperativeHandle(ref, () => ({
      bildLesen: () => 'data:image/png;base64,AAAA',
      leeren: () => undefined,
    }));
    return (
      <button type="button" onClick={() => onChange?.(true)}>
        {titel} zeichnen
      </button>
    );
  }),
}));

const callScheinVorbereiten = vi.fn<[], Promise<{ zeiten: WorkSheetZeit[] }>>(
  async () => ({ zeiten: [] }),
);


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

/** Beide Unterschriften setzen — der Doppelgänger oben macht daraus einen Klick. */
function unterschreiben() {
  for (const knopf of screen.getAllByRole('button', { name: /zeichnen$/ })) {
    knopf.click();
  }
}

function zeichne(adresse = '/worksheet') {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
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
  callScheinVorbereiten.mockClear().mockResolvedValue({ zeiten: [] });
  listMaterials.mockClear().mockResolvedValue(materialien);
  createWorkSheet.mockClear().mockResolvedValue('s1');
  updateWorkSheetDraft.mockClear();
  fotosFestgeschrieben.mockClear();
  signWorkSheet.mockClear();
  komprimiere.mockClear().mockImplementation(async (b: Blob) => b);
  fotoHochladen.mockClear().mockResolvedValue({
    pfad: 'scheine/perl/s1/aaa.jpg',
    hash: 'aaa',
    bytes: 340_000,
    geraetZeit: 1,
  });
  fotoEntfernen.mockClear();
  /*
    `mockClear` allein raeumt die IMPLEMENTIERUNG nicht weg.

    Ein Test stellt hier die Ablehnung nach (`mockRejectedValue`); ohne das
    Zuruecksetzen liefen alle folgenden Tests weiter in diese Ablehnung. Der
    Test „behandelt ein leeres Ergebnis genauso" war deshalb aus dem falschen
    Grund gruen: er prueft den leeren Zweig und bekam die Ablehnung.
  */
  getWorkSheet.mockReset().mockImplementation(async () => entwurf);
  entwurf = undefined;
  bestehendeScheine = [];
  listWorkSheetsForProject.mockClear();
  felderEingehaengt = 0;
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

  /**
   * EIN ENTWURF WAR EINE SACKGASSE.
   *
   * „Als Entwurf speichern" legte den Schein an, und in der Liste gab es
   * danach nur Aufklappen, PDF und Storno. Wer ihn anlegte, um ihn später
   * unterschreiben zu lassen — der Regelfall für diesen Knopf: vormittags
   * vorbereiten, nachmittags unterschreiben lassen —, kam nie wieder hinein.
   * Er tippte alles neu und legte damit einen ZWEITEN Beleg über dieselbe
   * Arbeit an.
   */
  describe('Entwurf weiterbearbeiten', () => {
    const gespeichert: WorkSheet & { id: string } = {
      id: 'e1',
      companyId: 'perl',
      projectNumber: 'B-001',
      customerId: 'k1',
      customerName: 'Familie Huber',
      address: 'Hauptstraße 12',
      datum: heute,
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [{ datum: heute, mitarbeiter: 'Max Mustermann', minuten: 300 }],
      material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }],
      notizen: 'Absperrventil klemmt',
      erstelltVonUid: 'm9',
      erstelltVonName: 'Erna Beispiel',
    } as WorkSheet & { id: string };

    it('holt Material und Notizen unverändert aus dem Entwurf', async () => {
      // Von Hand Erfasstes gibt es nirgends sonst. Ginge es beim Öffnen
      // verloren, wäre der Entwurf schlimmer als nutzlos.
      entwurf = gespeichert;
      zeichne('/worksheet?entwurf=e1');

      expect(await screen.findByText(/Verbautes Material \(1\)/)).toBeInTheDocument();
      expect(screen.getByText('Eckventil 1/2 Zoll')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Absperrventil klemmt')).toBeInTheDocument();
    });

    it('ändert den bestehenden Schein, statt einen zweiten anzulegen', async () => {
      /*
        DER TEURE FEHLER, den das verhindert: zwei Belege über dieselbe
        Arbeit. Einer davon wandert in die Rechnung, der andere bleibt als
        Entwurf liegen — und niemand kann sagen, welcher gilt.
      */
      entwurf = gespeichert;
      const nutzer = userEvent.setup();
      zeichne('/worksheet?entwurf=e1');
      await screen.findByText(/Verbautes Material \(1\)/);

      await nutzer.click(screen.getByRole('button', { name: 'Entwurf aktualisieren' }));

      await waitFor(() => expect(updateWorkSheetDraft).toHaveBeenCalled());
      expect(createWorkSheet).not.toHaveBeenCalled();
      expect(updateWorkSheetDraft.mock.calls[0][0]).toBe('e1');
    });

    it('lässt den Urheber stehen, auch wenn ein Kollege weitermacht', async () => {
      /*
        Angemeldet ist Max, angelegt hat Erna. „Wer hat den Beleg
        aufgesetzt" ist eine Tatsache über die Vergangenheit — sie mit dem
        gerade Angemeldeten zu überschreiben verfälscht den einzigen
        Hinweis darauf.
      */
      entwurf = gespeichert;
      const nutzer = userEvent.setup();
      zeichne('/worksheet?entwurf=e1');
      await screen.findByText(/Verbautes Material \(1\)/);

      await nutzer.click(screen.getByRole('button', { name: 'Entwurf aktualisieren' }));

      await waitFor(() => expect(updateWorkSheetDraft).toHaveBeenCalled());
      const geschrieben = updateWorkSheetDraft.mock.calls[0][1];
      expect(geschrieben).not.toHaveProperty('erstelltVonUid');
      expect(geschrieben).not.toHaveProperty('erstelltVonName');
    });

    it('behält die Zeiten des Entwurfs, wenn das Auffrischen scheitert', async () => {
      /*
        Die Zeiten werden beim Öffnen NEU geholt — wer den Entwurf
        vormittags anlegt und erst danach bucht, fände sonst nachmittags
        einen Schein ohne Stunden. Kommt der Server nicht durch, dürfen sie
        aber nicht auf null fallen: sie stehen sauber im Entwurf, und der
        Kunde steht daneben und will unterschreiben.
      */
      entwurf = gespeichert;
      callScheinVorbereiten.mockRejectedValue(new Error('deadline-exceeded'));
      zeichne('/worksheet?entwurf=e1');

      expect(await screen.findByText(/nicht aufgefrischt/)).toBeInTheDocument();
      // Die Summe steht in der Kartenüberschrift: 300 Minuten aus dem
      // Entwurf, nicht 0 aus einer fehlgeschlagenen Abfrage.
      expect(screen.getByText(/Zeiten am .* · 05:00/)).toBeInTheDocument();
    });

    it('öffnet KEINEN unterschriebenen Schein', async () => {
      /*
        Er ist eingefroren; die Rules lehnen jede Änderung ab. Ein Formular
        dafür wäre ein Knopf, der nichts tut — und beim Kunden ein
        Versprechen, das die Datenbank nicht hält.
      */
      entwurf = { ...gespeichert, status: 'Unterschrieben' };
      zeichne('/worksheet?entwurf=e1');

      expect(await screen.findByText(/unterschrieben und lässt sich nicht mehr ändern/))
        .toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Unterschreiben und abschließen' }),
      ).not.toBeInTheDocument();
    });

    it('sagt es, wenn sich der Entwurf nicht öffnen lässt', async () => {
      /*
        DER REALE AUSGANG, gegen den Emulator nachgemessen: eine Kennung, die
        es nicht gibt, kommt als ABGEWIESENER ZUGRIFF zurück, nicht als
        „nicht gefunden" — die Regel liest `resource.data.companyId`, und
        `resource` ist bei einem fehlenden Dokument null.

        Deshalb wird hier die Ablehnung nachgestellt und nicht ein leeres
        Ergebnis. Ein Test, der nur den leeren Fall prüft, prüfte einen Zweig,
        den es im Betrieb gar nicht gibt.
      */
      getWorkSheet.mockRejectedValue(new Error('permission-denied'));
      zeichne('/worksheet?entwurf=gibtesnicht');

      expect(await screen.findByText(/lässt sich nicht öffnen/)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Unterschreiben und abschließen' }),
      ).not.toBeInTheDocument();
    });

    it('behandelt ein leeres Ergebnis genauso', async () => {
      // Der Zweig bleibt stehen, falls die Regel je gelockert wird. Dann
      // darf er nicht plötzlich eine andere Geschichte erzählen.
      entwurf = undefined;
      zeichne('/worksheet?entwurf=gibtesnicht');

      expect(await screen.findByText(/lässt sich nicht öffnen/)).toBeInTheDocument();
    });

    it('warnt NICHT vor einem verworfenen Entwurf als „schon vorhanden"', async () => {
      /*
        Die Warnung soll vor DOPPELT bestätigten Stunden schützen. Ein
        aufgegebener Entwurf bestätigt nichts — er zählte sonst als Warnung
        gegen genau den Schein, der ihn ersetzen soll.
      */
      bestehendeScheine = [
        { ...gespeichert, id: 'v1', status: 'Verworfen' },
        { ...gespeichert, id: 'e2' },
      ];
      zeichne();

      expect(await screen.findByText(/Für diesen Tag gibt es bereits/)).toBeInTheDocument();
      // EINER, nicht zwei: der verworfene zählt nicht mit.
      expect(screen.getByText(/gibt es bereits/).textContent).toContain('1 Schein');
    });

    it('sagt beim VERWORFENEN Entwurf, wo er wieder herkommt', async () => {
      /*
        „Lässt sich nicht mehr ändern" wäre bei ihm falsch — er lässt sich
        sehr wohl wieder aufnehmen, nur nicht von hier aus. Eine Meldung, die
        eine Sackgasse behauptet, wo ein Weg ist, kostet den ganzen getippten
        Schein.
      */
      entwurf = { ...gespeichert, status: 'Verworfen' };
      zeichne('/worksheet?entwurf=e1');

      expect(await screen.findByText(/wieder aufnehmen/)).toBeInTheDocument();
      expect(screen.queryByText(/lässt sich nicht mehr ändern/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Unterschreiben und abschließen' }),
      ).not.toBeInTheDocument();
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

/**
 * Fotos am Schein — freiwillig, und das ist keine Sparsamkeit.
 *
 * Der Schein muss im Keller ohne Netz unterschreibbar bleiben: Firestore hält
 * einen Schreibvorgang offline vor, Firebase Storage tut das NICHT. Wäre auch
 * nur ein Foto Bedingung, hinge der ganze Beleg an einem Balken Empfang — und
 * der Monteur stünde mit einem Kunden vor sich da, der unterschreiben will.
 */
describe('Fotos', () => {
  const bild = () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });

  async function fotoWaehlen(nutzer: ReturnType<typeof userEvent.setup>) {
    // Erst wenn die Baustelle steht, gibt es den Abschnitt: ein Foto ohne
    // Schein hat keinen Ort, an den es gehört.
    await screen.findByText(/^Fotos \(/);
    // Beschriftung des versteckten Dateifelds ist der Knopftext, und der
    // wechselt mit dem Zustand: erstes Bild, weiteres, Fach voll.
    const feld = screen.getByLabelText(/Foto aufnehmen|Weiteres Foto|Höchstens/);
    await nutzer.upload(feld, bild());
  }

  /*
    DER ENTWURF ENTSTEHT MIT DEM ERSTEN FOTO. Ein Bild braucht einen Ort im
    Storage, und der hängt an der Kennung des Scheins; ohne sie landete es in
    einem Ordner, den später nichts mehr zuordnet.
  */
  it('legt den Entwurf an und hängt das Bild daran', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);

    await waitFor(() => expect(fotoHochladen).toHaveBeenCalled());
    expect(createWorkSheet).toHaveBeenCalled();
    // Mandant und Schein-Kennung — in dieser Reihenfolge, sonst greift die
    // Storage-Regel an der falschen Stelle.
    expect(fotoHochladen.mock.calls[0][0]).toBe('perl');
    expect(fotoHochladen.mock.calls[0][1]).toBe('s1');
  });

  /*
    DER FOTOBLOCK STEHT NICHT MEHR IM KOPF DER UNTERSCHRIFTEN.

    Dort sass er unmittelbar über „Monteur (Name in Druckbuchstaben)": ein
    unterstrichener Link in Akzentfarbe und darunter drei Zeilen graues
    Kleingedrucktes — beides las sich wie eine Fehlermeldung zu genau diesem
    Feld. Der Test hält die Trennung fest, weil sie sonst beim nächsten
    Umbau still zurückfällt: das Dateifeld darf im Abschnitt der
    Unterschriften nicht vorkommen.
  */
  it('steht in einer eigenen Karte, nicht bei den Unterschriften', async () => {
    zeichne();
    await screen.findByText(/^Fotos \(/);

    const namensfeld = screen.getByLabelText(/Monteur \(Name in Druckbuchstaben\)/);
    const unterschriften = namensfeld.closest('section');
    expect(unterschriften).not.toBeNull();
    expect(
      unterschriften!.querySelector('input[type="file"]'),
      'Das Dateifeld gehört in die Fotokarte, nicht zu den Unterschriften.',
    ).toBeNull();
  });

  /*
    Der Knopf sagt, was er tut — und was er nicht mehr tut. „Foto aufnehmen"
    beim leeren Fach, „Weiteres Foto", sobald eines da ist. Ohne diesen
    Wechsel stünde nach acht Bildern derselbe Text wie am Anfang, nur ohne
    Wirkung: ein Knopf, der nichts tut, ist schlimmer als keiner.
  */
  it('beschriftet den Knopf nach dem Stand und zählt im Kartentitel mit', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Fotos (0/8)');
    expect(screen.getByLabelText('Foto aufnehmen')).toBeInTheDocument();

    await fotoWaehlen(nutzer);
    await waitFor(() => expect(fotoHochladen).toHaveBeenCalled());

    expect(await screen.findByText('Fotos (1/8)')).toBeInTheDocument();
    expect(screen.getByLabelText('Weiteres Foto')).toBeInTheDocument();
  });

  it('verkleinert vor dem Hochladen', async () => {
    // Ein Handyfoto ist drei bis fünf Megabyte. Auf einer Baustelle mit
    // halbem Balken ist das keine Übertragung, sondern ein Abbruch.
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await waitFor(() => expect(komprimiere).toHaveBeenCalled());
  });

  it('schreibt das Foto in den Schein', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await waitFor(() => expect(fotoHochladen).toHaveBeenCalled());

    await nutzer.click(screen.getByRole('button', { name: 'Entwurf aktualisieren' }));
    await waitFor(() => expect(updateWorkSheetDraft).toHaveBeenCalled());
    expect(updateWorkSheetDraft.mock.calls[updateWorkSheetDraft.mock.calls.length - 1][1].fotos).toEqual([
      { pfad: 'scheine/perl/s1/aaa.jpg', hash: 'aaa', bytes: 340_000, geraetZeit: 1 },
    ]);
  });

  /*
    EIN GESCHEITERTER UPLOAD VERSCHWINDET NICHT. Im Keller ohne Netz ist er
    der Normalfall. Das Bild bleibt im Formular stehen, mit einer Meldung und
    einem Knopf — ein Bild, das dabei still verschwindet, wäre die
    schlechteste aller Antworten.
  */
  it('lässt ein Bild ohne Netz stehen und bietet es erneut an', async () => {
    fotoHochladen.mockRejectedValueOnce(new Error('offline'));
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);

    expect(await screen.findByText(/Nicht hochgeladen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nochmal versuchen' })).toBeInTheDocument();
  });

  it('reicht es nach, wenn wieder Netz da ist', async () => {
    fotoHochladen.mockRejectedValueOnce(new Error('offline'));
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);

    await nutzer.click(await screen.findByRole('button', { name: 'Nochmal versuchen' }));
    await waitFor(() =>
      expect(screen.queryByText(/Nicht hochgeladen/)).not.toBeInTheDocument(),
    );
    // Auch das nachgereichte Bild geht sofort ans Dokument, sonst wäre genau
    // der zweite Anlauf der Weg, auf dem doch noch eine Waise entsteht.
    await waitFor(() =>
      expect(fotosFestgeschrieben).toHaveBeenCalledWith('s1', [
        { pfad: 'scheine/perl/s1/aaa.jpg', hash: 'aaa', bytes: 340_000, geraetZeit: 1 },
      ]),
    );
  });

  /*
    UND ER WIRD BEIM UNTERSCHREIBEN GENANNT. Das nicht hochgeladene Bild kommt
    nicht in den Schein — ein Verweis auf eine Datei, die es nicht gibt, wäre
    schlimmer als kein Verweis. Aber der Monteur erfährt es VORHER und
    entscheidet.
  */
  it('warnt vor dem Unterschreiben, wenn ein Bild noch nicht oben ist', async () => {
    fotoHochladen.mockRejectedValue(new Error('offline'));
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await screen.findByText(/Nicht hochgeladen/);

    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();
    await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));

    expect(await screen.findByText(/noch nicht.*hochgeladen/i)).toBeInTheDocument();
    expect(signWorkSheet).not.toHaveBeenCalled();
  });

  it('unterschreibt beim zweiten Tippen trotzdem — ohne das Bild', async () => {
    // Die Entscheidung liegt beim Monteur, nicht bei der App. Ein Schein, der
    // sich ohne Netz nicht abschliessen lässt, ist unbrauchbar.
    fotoHochladen.mockRejectedValue(new Error('offline'));
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await screen.findByText(/Nicht hochgeladen/);

    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();
    const knopf = screen.getByRole('button', { name: 'Unterschreiben und abschließen' });
    await nutzer.click(knopf);
    await screen.findByText(/noch nicht.*hochgeladen/i);
    await nutzer.click(knopf);

    await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
    expect(updateWorkSheetDraft.mock.calls[updateWorkSheetDraft.mock.calls.length - 1][1].fotos).toEqual([]);
  });

  /*
    KEINE WAISEN IM STORAGE.

    Der Entwurf entsteht mit dem ersten Foto, das Bild geht sofort hoch — der
    VERWEIS darauf entstand bisher aber erst, wenn der Monteur den Entwurf
    speicherte. Wer fotografierte und dann das Fenster schloss, hinterliess
    eine Datei, auf die kein Dokument zeigt: sie kostet dauerhaft, und es ist
    ein Bild aus einer fremden Wohnung ohne Beleg, der seine Aufbewahrung
    rechtfertigt.
  */
  it('schreibt das Bild sofort ans Dokument, nicht erst beim Speichern', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await waitFor(() => expect(fotosFestgeschrieben).toHaveBeenCalled());

    // Kein Knopf wurde gedrückt: der Entwurf ist nicht gespeichert worden.
    expect(updateWorkSheetDraft).not.toHaveBeenCalled();
    expect(fotosFestgeschrieben).toHaveBeenCalledWith('s1', [
      { pfad: 'scheine/perl/s1/aaa.jpg', hash: 'aaa', bytes: 340_000, geraetZeit: 1 },
    ]);
  });

  /*
    ERST AUS DEM DOKUMENT, DANN AUS DEM STORAGE. Andersherum stünde
    zwischendurch ein Eintrag da, der auf eine gelöschte Datei zeigt — und
    genau der ginge beim Unterschreiben in die Prüfsumme ein.
  */
  it('nimmt das Bild auch aus dem Dokument, wenn es entfernt wird', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await waitFor(() => expect(fotosFestgeschrieben).toHaveBeenCalled());
    fotosFestgeschrieben.mockClear();

    await nutzer.click(screen.getByRole('button', { name: 'Foto entfernen' }));
    await waitFor(() => expect(fotosFestgeschrieben).toHaveBeenCalledWith('s1', []));
  });

  /*
    EIN GESCHEITERTER UPLOAD DARF NICHT IN DAS DOKUMENT. Der Eintrag zeigte
    auf eine Datei, die es im Storage nicht gibt — und er ginge in die
    Prüfsumme ein, die damit einen Beleg zusichert, den niemand ansehen kann.
  */
  it('schreibt ein nicht hochgeladenes Bild nicht fest', async () => {
    fotoHochladen.mockRejectedValueOnce(new Error('kein Netz'));
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await screen.findByText(/Nicht hochgeladen/);
    expect(fotosFestgeschrieben).not.toHaveBeenCalled();
  });

  it('nimmt ein Bild wieder weg — auch aus dem Storage', async () => {
    // Sonst sammelte der Bucket über die Jahre alles, was jemand versehentlich
    // aufgenommen und gleich wieder verworfen hat.
    const nutzer = userEvent.setup();
    zeichne();
    await fotoWaehlen(nutzer);
    await waitFor(() => expect(fotoHochladen).toHaveBeenCalled());

    await nutzer.click(screen.getByRole('button', { name: 'Foto entfernen' }));
    await waitFor(() => expect(fotoEntfernen).toHaveBeenCalledWith('scheine/perl/s1/aaa.jpg'));
  });

  it('unterschreibt ganz ohne Fotos ohne jede Nachfrage', async () => {
    // Der Regelfall. Ein Schein ohne Fotos ist vollständig.
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Verbautes Material/);
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();
    await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));

    await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
  });
});

/**
 * Leistungszeit vor Ort erfassen.
 *
 * Der Monteur stellt den Schein beim Kunden aus, oft bevor er die Zeit
 * gebucht hat. Bis zum 08.09.2026 konnte er auf dem Schein nichts eintragen:
 * die Zeilen kamen ausschliesslich aus der Zeiterfassung, und war dort nichts
 * gebucht, unterschrieb der Kunde einen Zettel, der nur Material
 * dokumentierte.
 */
describe('Zeit beim Kunden eintragen', () => {
  async function zeileEintragen(
    nutzer: ReturnType<typeof userEvent.setup>,
    von = '08:00',
    bis = '11:00',
  ) {
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), von);
    await nutzer.clear(screen.getByLabelText('Bis'));
    await nutzer.type(screen.getByLabelText('Bis'), bis);
    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
  }

  it('rechnet die Minuten mit derselben Formel wie die Zeiterfassung', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await zeileEintragen(nutzer);

    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    const zeilen = createWorkSheet.mock.calls[0][1].zeiten;
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].minuten).toBe(180);
    expect(zeilen[0].mitarbeiter).toBe('Max Mustermann');
  });

  it('zieht die Pause ab', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '08:00');
    await nutzer.type(screen.getByLabelText('Bis'), '12:00');
    await nutzer.type(screen.getByLabelText(/Pause/), '30');
    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));

    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(createWorkSheet.mock.calls[0][1].zeiten[0].minuten).toBe(210);
  });

  /*
    GEFUNDEN BEIM PROBELAUF. Von und Bis eingetippt, dann nach unten zum
    Unterschreiben — die naheliegende Reihenfolge. Die Zeit kam nie auf den
    Schein, weil „Zeile hinzufügen" fehlte, und der Kunde unterschrieb einen
    Beleg, auf dem nur das Material stand.
  */
  it('lässt nicht unterschreiben, solange eine eingetippte Zeit nicht übernommen ist', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '07:00');
    await nutzer.type(screen.getByLabelText('Bis'), '15:30');
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();

    const knopf = screen.getByRole('button', { name: 'Unterschreiben und abschließen' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText(/Noch nicht auf dem Schein/).parentElement).toHaveTextContent(
      /die Zeit 07:00–15:30/,
    );

    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    expect(screen.queryByText(/Noch nicht auf dem Schein/)).not.toBeInTheDocument();
    await nutzer.click(knopf);
    await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
    // Unterschrieben wird der Stand, der zuletzt geschrieben wurde — beim
    // ersten Mal ist das die Anlage, danach die Aktualisierung.
    const letzte = [...createWorkSheet.mock.calls, ...updateWorkSheetDraft.mock.calls].pop();
    const zeiten = letzte?.[1].zeiten ?? [];
    expect(zeiten).toHaveLength(1);
    expect(zeiten[0].minuten).toBe(510);
  });

  it('lässt nicht unterschreiben, solange eine freie Materialzeile nur eingetippt ist', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Verbautes Material/);
    await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Silikon sanitär');
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();

    expect(screen.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeDisabled();
    expect(screen.getByText(/Noch nicht auf dem Schein/).parentElement).toHaveTextContent(
      /das Material „Silikon sanitär"/,
    );

    // Leeren reicht auch — wer es sich anders überlegt hat, muss nichts übernehmen.
    await nutzer.clear(screen.getByLabelText(/Freie Zeile/));
    expect(screen.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeEnabled();
  });

  /*
    „BIS" VOR „VON" IST HIER KEIN FEHLER, SONDERN EINE NACHT.

    `calcWorkMin` behandelt eine Endzeit vor der Startzeit als Einsatz über
    Mitternacht — Bereitschaft und Notdienst gibt es in diesem Gewerbe, und
    22:00–06:00 muss acht Stunden ergeben, nicht null. Das ist beim Schreiben
    dieses Tests aufgefallen: meine erste Fassung hielt es für einen
    Vertipper und hätte die Notdienstnacht unbezahlt gelassen.

    Der Preis der richtigen Formel: aus dem Vertipper „11:00 bis 08:00"
    werden stillschweigend einundzwanzig Stunden — auf einem Zettel, den der
    Kunde gleich unterschreibt. Deshalb wird nachgefragt statt gesperrt.
  */
  it('rechnet eine Nachtschicht richtig und fragt bei langer Spanne nach', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '11:00');
    await nutzer.type(screen.getByLabelText('Bis'), '08:00');

    /*
      Die Nachfrage steht WÄHREND des Tippens da, nicht erst nach dem
      Hinzufügen — nachher ist die Zeile schon auf dem Beleg, und genau davor
      soll sie warnen.
    */
    expect(await screen.findByText(/über Mitternacht gerechnet/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    // 21 Stunden — die Zeile geht durch, aber der Monteur hat es gelesen.
    expect(createWorkSheet.mock.calls[0][1].zeiten[0].minuten).toBe(21 * 60);
  });

  it('warnt am Notizfeld vor Angaben zur Gesundheit', async () => {
    /*
      DAS NOTIZFELD IST DIE EINE STELLE, AN DER DIE TRENNUNG VON HAND ZU
      UMGEHEN IST.

      Fremde Zeiteinträge darf ein Monteur weder lesen noch schreiben — dort
      stehen Kranken- und Urlaubstage, also Gesundheitsdaten nach Art. 9
      DSGVO. Den Schein dagegen sieht jeder im Betrieb, und das ist Absicht.
      Wer hier „Kollege war krank" hineinschreibt, hebt die Trennung auf,
      ohne dass ihn etwas daran hindert. Sperren liesse sich das nicht — kein
      Filter unterscheidet eine Krankmeldung von einer Mängelbeschreibung.
      Sagen lässt es sich, und zwar dort, wo getippt wird.
    */
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Was bedeutet Ergänzungen/ }));

    /*
      Der Text ist über mehrere `strong` verteilt; ein schlichtes `getByText`
      trifft nur das innerste davon. Gesucht wird deshalb der Absatz, der ihn
      GANZ enthält — sonst prüfte die Zusicherung ein Bruchstück.
    */
    const feld = await screen.findByText(
      (_t, el) => el?.tagName === 'SPAN' && /Was hier steht, sieht jeder im Betrieb/.test(el.textContent ?? ''),
    );
    const text = feld.textContent ?? '';
    expect(text).toMatch(/Gesundheit/);
    expect(text).toMatch(/Art\. 9 DSGVO/);
    // Und es sagt auch, was hier SEHR WOHL hingehört — sonst bleibt das Feld
    // aus Unsicherheit leer, und der Mangel steht nirgends.
    expect(text).toMatch(/Mängel/);
  });

  it('nennt bei einem langen Tag OHNE Mitternacht nicht die Mitternacht', async () => {
    /*
      05:00–19:00 sind vierzehn Stunden und lösen dieselbe Nachfrage aus —
      „Bis" liegt dabei aber gar nicht vor „Von". Die Meldung nannte trotzdem
      die Mitternacht als Grund und schickte den Monteur damit an die falsche
      Stelle. Wer einmal gemerkt hat, dass eine Warnung danebenliegt, liest
      sie beim nächsten Mal nicht mehr.
    */
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '05:00');
    await nutzer.type(screen.getByLabelText('Bis'), '19:00');

    const meldung = await screen.findByText(/ungewöhnlich langer Einsatz/);
    expect(meldung.textContent).toMatch(/14:00/);
    expect(meldung.textContent).not.toMatch(/Mitternacht/);
  });

  it('weist eine Spanne zurück, die gar keine Zeit ergibt', async () => {
    // Pause so lang wie der Einsatz: null Minuten auf einem Beleg wäre eine
    // Zeile, die nichts aussagt.
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Zeit beim Kunden eintragen/);
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '08:00');
    await nutzer.type(screen.getByLabelText('Bis'), '10:00');
    await nutzer.type(screen.getByLabelText(/Pause/), '120');
    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));

    expect(await screen.findByText(/ergibt keine Zeit/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(createWorkSheet.mock.calls[0][1].zeiten).toEqual([]);
  });

  it('nimmt eine getippte Zeile wieder weg', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await zeileEintragen(nutzer);
    await screen.findByRole('button', { name: /Zeile Max Mustermann entfernen/ });

    await nutzer.click(screen.getByRole('button', { name: /Zeile Max Mustermann entfernen/ }));
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(createWorkSheet.mock.calls[0][1].zeiten).toEqual([]);
  });

  /*
    DER GEFÄHRLICHSTE FALL. Die Vorausfüllung hat eine Frist von zwölf
    Sekunden; im Keller mit einem Balken LTE tippt der Monteur in dieser Zeit
    längst. Käme die Antwort danach und ersetzte die Liste, wäre seine Eingabe
    weg — kommentarlos, während der Kunde danebensteht.
  */
  it('behält die getippte Zeile, wenn die Vorausfüllung scheitert', async () => {
    callScheinVorbereiten.mockRejectedValue(new Error('deadline-exceeded'));
    const nutzer = userEvent.setup();
    zeichne();
    await zeileEintragen(nutzer);

    await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(createWorkSheet.mock.calls[0][1].zeiten).toHaveLength(1);
  });

  it('behält sie auch, wenn die Vorausfüllung danach doch noch antwortet', async () => {
    /*
      Der Ablauf, wie er im Keller wirklich aussieht: die Vorausfüllung läuft
      in die Frist, der Monteur tippt in der Wartezeit, dann versucht er es
      erneut — und diesmal kommen die gebuchten Zeiten. Sie gehören dazu, aber
      nicht ANSTELLE seiner Eingabe.
    */
    callScheinVorbereiten.mockRejectedValueOnce(new Error('deadline-exceeded'));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('button', { name: 'Erneut versuchen' });
    await zeileEintragen(nutzer);

    callScheinVorbereiten.mockResolvedValue({
      zeiten: [
        { datum: '2026-09-04', mitarbeiter: 'Kollege', von: '07:00', bis: '09:00', minuten: 120 },
      ],
    });
    await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    await nutzer.click(await screen.findByRole('button', { name: 'Als Entwurf speichern' }));
    const zeilen = createWorkSheet.mock.calls[0][1].zeiten;
    expect(zeilen.map((z) => z.mitarbeiter)).toEqual(['Kollege', 'Max Mustermann']);
  });
});

/**
 * Der Schein als Schrittfolge am Telefon und Tablet — Zeiten, Material,
 * Fotos, Unterschrift.
 *
 * NUR DIE ANORDNUNG IST NEU. Was hier geprüft wird: dass man vor, zurück und
 * aus der Zusammenfassung in jeden Schritt kommt; dass ein wieder geöffneter
 * Entwurf vorne beginnt; dass kein Teil beim Wechsel ausgehängt wird; dass
 * die Sperre „Noch nicht auf dem Schein" auch aus einem anderen Schritt
 * greift; und vor allem, dass der Schein, der am Ende unterschrieben wird,
 * Zeichen für Zeichen derselbe ist wie auf der einen Seite am Schreibtisch.
 *
 * jsdom kennt keine Medienabfrage — ohne sie steht der Schein als die eine
 * Seite da, und alle Tests oben laufen so. Hier wird die Abfrage gezielt
 * gesetzt: schmal (unter 1024 px) für die Schritte, breit für den
 * Schreibtisch. Abfragen nach Rolle finden nur, was sichtbar ist — ein Test,
 * der einen Knopf aus einem anderen Schritt drückt, fällt also auf, statt
 * durch ausgeblendete Teile hindurchzugreifen.
 */
describe('Schrittfolge', () => {
  const matchMediaVorher = window.matchMedia;
  function breite(breit: boolean) {
    window.matchMedia = ((q: string) => ({
      matches: breit,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  }
  /** Das Telefon nachstellen: die Medienabfrage für 1024 px trifft nicht zu. */
  beforeEach(() => breite(false));
  /** Den Schreibtisch nachstellen: sie trifft zu. */
  const schreibtisch = () => breite(true);
  afterEach(() => {
    window.matchMedia = matchMediaVorher;
  });

  /** In einen Schritt springen — über die Leiste oben, wie am Telefon. */
  async function zuSchritt(
    nutzer: ReturnType<typeof userEvent.setup>,
    name: 'Zeiten' | 'Material' | 'Fotos' | 'Unterschrift',
  ) {
    const nr = { Zeiten: 1, Material: 2, Fotos: 3, Unterschrift: 4 }[name];
    await nutzer.click(await screen.findByRole('button', { name: `${nr} ${name}` }));
  }

  const aktuell = () =>
    screen
      .getByRole('navigation', { name: 'Schritte des Scheins' })
      .querySelector('[aria-current="step"]')?.textContent;

  it('geht mit „Weiter" vor und mit „Zurück" wieder zurück', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    expect(aktuell()).toBe('1 Zeiten');
    // Im ersten Schritt gibt es nichts, wohin man zurück könnte.
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zeile hinzufügen' })).toBeInTheDocument();
    // Die Unterschriften sind eingehängt, aber noch nicht zu sehen.
    expect(
      screen.queryByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).not.toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Weiter: Material' }));
    expect(aktuell()).toBe('2 Material');
    // Der vorige Schritt ist ausgeblendet, der neue zu sehen.
    expect(screen.queryByRole('button', { name: 'Zeile hinzufügen' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Freie Zeile/ })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Weiter: Fotos' }));
    expect(aktuell()).toBe('3 Fotos');
    expect(screen.getByRole('heading', { name: /^Fotos \(/ })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Notizen, Regiearbeiten, Mängel' }),
    ).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Weiter: Unterschrift' }));
    expect(aktuell()).toBe('4 Unterschrift');
    // Im letzten Schritt steht der Abschluss an der Stelle von „Weiter".
    expect(screen.queryByRole('button', { name: /^Weiter/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(aktuell()).toBe('3 Fotos');
    expect(
      screen.queryByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Zurück' }));
    await nutzer.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(aktuell()).toBe('1 Zeiten');
  });

  it('zeigt die Leiste erst mit einer Baustelle', async () => {
    // Ohne Baustelle gibt es die übrigen Schritte nicht — drei tote Ziele
    // wären schlimmer als keine Leiste.
    listAssignmentsForUserInRange.mockResolvedValue([]);
    zeichne();
    expect(await screen.findByText('Zuerst eine Baustelle wählen.')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Schritte des Scheins' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Weiter/ })).not.toBeInTheDocument();
  });

  it('sperrt „Weiter" nicht — geprüft wird beim Unterschreiben', async () => {
    // Keiner der Schritte hat eine Pflichtangabe: ein Schein ohne Stunden,
    // Material oder Fotos ist gültig. Die Sperre sitzt am Abschluss.
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    for (const name of ['Weiter: Material', 'Weiter: Fotos', 'Weiter: Unterschrift']) {
      const knopf = screen.getByRole('button', { name });
      expect(knopf).toBeEnabled();
      await nutzer.click(knopf);
    }
    expect(screen.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeDisabled();
  });

  it('springt aus der Zusammenfassung mit „Ändern" in den Schritt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    await zuSchritt(nutzer, 'Material');
    await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Dichtungen');
    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await zuSchritt(nutzer, 'Unterschrift');

    // Die Zusammenfassung zählt, was in den Schritten steht.
    expect(screen.getByText('1 Position')).toBeInTheDocument();
    expect(screen.getByText('Keine Zeit auf dem Schein')).toBeInTheDocument();
    expect(screen.getByText(/0 Fotos · ohne Notiz/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Material ändern' }));
    expect(aktuell()).toBe('2 Material');
    expect(
      screen.getByRole('button', { name: 'Dichtungen vom Schein nehmen' }),
    ).toBeInTheDocument();

    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.click(screen.getByRole('button', { name: 'Zeiten ändern' }));
    expect(aktuell()).toBe('1 Zeiten');
    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.click(screen.getByRole('button', { name: 'Fotos und Notizen ändern' }));
    expect(aktuell()).toBe('3 Fotos');
    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.click(screen.getByRole('button', { name: 'Baustelle und Tag ändern' }));
    expect(aktuell()).toBe('1 Zeiten');
    expect(screen.getByRole('combobox', { name: 'Baustelle' })).toBeInTheDocument();
  });

  it('hängt beim Wechsel nichts aus — die Unterschriften bleiben stehen', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    // Beide Felder sind von Anfang an eingehängt, auch wenn sie noch nicht zu sehen sind.
    expect(felderEingehaengt).toBe(2);

    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();
    await nutzer.click(screen.getByRole('button', { name: 'Zeiten ändern' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter: Material' }));
    await zuSchritt(nutzer, 'Unterschrift');

    expect(felderEingehaengt).toBe(2);
    // Name und Unterschriften sind noch da: der Abschluss ist frei.
    expect(screen.getByLabelText<HTMLInputElement>(/Kunde \(Name/).value).toBe('Frau Huber');
    await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));
    await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
  });

  it('sperrt den Abschluss auch, wenn die offene Zeit in einem anderen Schritt steht', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    await nutzer.clear(screen.getByLabelText('Von'));
    await nutzer.type(screen.getByLabelText('Von'), '07:00');
    await nutzer.type(screen.getByLabelText('Bis'), '15:30');
    /*
      Das Feld steht bei den Zeiten, der Knopf bei der Unterschrift. Ausgehängt
      hätte das Feld beim Weitergehen „nichts offen" gemeldet — und die Sperre
      wäre weg gewesen.
    */
    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();

    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeDisabled();
    expect(screen.getByText(/Noch nicht auf dem Schein/).parentElement).toHaveTextContent(
      /die Zeit 07:00–15:30/,
    );
    // Die Zusammenfassung nennt es auch.
    expect(
      screen.getByText(/Eingetippt, aber nicht übernommen: 07:00–15:30/),
    ).toBeInTheDocument();

    // Der Weg zurück steht an der Meldung.
    await nutzer.click(screen.getByRole('button', { name: 'Zu den Zeiten' }));
    expect(aktuell()).toBe('1 Zeiten');
    await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    await zuSchritt(nutzer, 'Unterschrift');
    expect(screen.queryByText(/Noch nicht auf dem Schein/)).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));
    await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
  });

  it('sperrt ihn ebenso für eine nur eingetippte Materialzeile', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    await zuSchritt(nutzer, 'Material');
    await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Silikon sanitär');
    await zuSchritt(nutzer, 'Unterschrift');
    await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
    unterschreiben();

    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Eingetippt, aber nicht hinzugefügt: „Silikon sanitär"/),
    ).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Zum Material' }));
    expect(aktuell()).toBe('2 Material');
    await nutzer.clear(screen.getByLabelText(/Freie Zeile/));
    await zuSchritt(nutzer, 'Unterschrift');
    expect(screen.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeEnabled();
  });

  it('bietet „Als Entwurf speichern" in jedem Schritt an', async () => {
    // Vormittags vorbereiten, nachmittags unterschreiben: wer nach den Zeiten
    // aufhört, soll nicht erst bis zur Unterschrift weiterklicken müssen.
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    for (const name of ['Zeiten', 'Material', 'Fotos', 'Unterschrift'] as const) {
      await zuSchritt(nutzer, name);
      expect(screen.getByRole('button', { name: 'Als Entwurf speichern' })).toBeInTheDocument();
    }
    await zuSchritt(nutzer, 'Zeiten');
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    await waitFor(() => expect(createWorkSheet).toHaveBeenCalledTimes(1));
  });

  it('zeigt einen Speicherfehler auch außerhalb des letzten Schritts', async () => {
    // Die Fehlermeldung steht am Schreibtisch in der Karte der Unterschriften.
    // Dort wäre sie ausgeblendet, wenn der Entwurf aus Schritt 1 gespeichert wird.
    createWorkSheet.mockRejectedValue(new Error('offline'));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    await nutzer.click(screen.getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Das hat nicht geklappt/);
  });

  it('hält das Unterschreiben nicht auf, wenn die Vorausfüllung scheitert', async () => {
    callScheinVorbereiten.mockRejectedValue(new Error('deadline-exceeded'));
    const nutzer = userEvent.setup();
    zeichne();
    expect(
      await screen.findByText(/Der Schein lässt sich trotzdem schreiben/),
    ).toBeInTheDocument();
    // „Erneut versuchen" steht bei den Zeiten ...
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    // ... und der Hinweis „Ohne Stunden" bei der Unterschrift, mit dem Abschluss.
    await zuSchritt(nutzer, 'Unterschrift');
    expect(screen.getByText(/Ohne Stunden\./)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unterschreiben und abschließen' }),
    ).toBeInTheDocument();
  });

  describe('ein wieder geöffneter Entwurf', () => {
    const gespeichert: WorkSheet & { id: string } = {
      id: 'e1',
      companyId: 'perl',
      projectNumber: 'B-001',
      customerId: 'k1',
      customerName: 'Familie Huber',
      address: 'Hauptstraße 12',
      datum: heute,
      status: 'Entwurf',
      abrechnung: 'Regie',
      zeiten: [{ datum: heute, mitarbeiter: 'Max Mustermann', minuten: 300 }],
      material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }],
      notizen: 'Absperrventil klemmt',
      erstelltVonUid: 'm9',
      erstelltVonName: 'Erna Beispiel',
    } as WorkSheet & { id: string };

    it('beginnt bei Schritt 1 — die Zeiten sind frisch geholt', async () => {
      entwurf = gespeichert;
      callScheinVorbereiten.mockResolvedValue({ zeiten: gespeichert.zeiten });
      zeichne('/worksheet?entwurf=e1');
      await screen.findByText(/Verbautes Material \(1\)/);
      await screen.findByRole('link', { name: /Hauptstraße 12/ });
      expect(aktuell()).toBe('1 Zeiten');
    });

    it('fasst den Entwurf zusammen und unterschreibt ihn, ohne einen zweiten anzulegen', async () => {
      entwurf = gespeichert;
      callScheinVorbereiten.mockResolvedValue({ zeiten: gespeichert.zeiten });
      const nutzer = userEvent.setup();
      zeichne('/worksheet?entwurf=e1');
      await screen.findByText(/Verbautes Material \(1\)/);
      await screen.findByRole('link', { name: /Hauptstraße 12/ });

      // Ein Tipp auf die Leiste genügt, um vom Vormittag in die Unterschrift zu kommen.
      await zuSchritt(nutzer, 'Unterschrift');
      expect(screen.getByText('1 Position')).toBeInTheDocument();
      expect(screen.getByText('05:00 Std')).toBeInTheDocument();
      expect(screen.getByText('1 Person')).toBeInTheDocument();
      expect(screen.getByText(/0 Fotos · mit Notiz/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Entwurf aktualisieren' })).toBeInTheDocument();

      await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
      unterschreiben();
      await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));

      await waitFor(() => expect(signWorkSheet).toHaveBeenCalled());
      expect(createWorkSheet).not.toHaveBeenCalled();
      const letzte = updateWorkSheetDraft.mock.calls[updateWorkSheetDraft.mock.calls.length - 1];
      expect(letzte[0]).toBe('e1');
      expect(signWorkSheet.mock.calls[0][0]).toBe('e1');
      expect(letzte[1].material).toEqual(gespeichert.material);
      expect(letzte[1].notizen).toBe('Absperrventil klemmt');
    });
  });

  /*
    DER KERN: DERSELBE BELEG, EGAL WIE ER AUSGEFÜLLT WURDE.

    Dieselben Eingaben einmal durch die Schritte (Telefon) und einmal auf der
    einen Seite (Schreibtisch). Was geschrieben und unterschrieben wird, muss
    gleich sein — und damit die kanonische Zeichenkette, aus der die
    Prüfsumme entsteht. Die Uhr steht still, sonst unterschieden sich die
    beiden Läufe allein in der Gerätezeit der Unterschrift.
  */
  describe('Absenden', () => {
    const JETZT = Date.parse('2026-09-25T14:04:00Z');

    async function ausfuellenUndUnterschreiben(schritte: boolean): Promise<string> {
      const nutzer = userEvent.setup();
      const ansicht = zeichne();
      await screen.findByRole('link', { name: /Hauptstraße 12/ });
      // Mit Leiste am Telefon, ohne sie am Schreibtisch.
      expect(!!screen.queryByRole('navigation', { name: 'Schritte des Scheins' })).toBe(
        schritte,
      );

      await nutzer.clear(screen.getByLabelText('Von'));
      await nutzer.type(screen.getByLabelText('Von'), '07:00');
      await nutzer.type(screen.getByLabelText('Bis'), '15:30');
      await nutzer.type(screen.getByLabelText(/Pause/), '30');
      await nutzer.type(screen.getByLabelText(/Tätigkeit/), 'Eckventil getauscht');
      await nutzer.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));

      if (schritte) await nutzer.click(screen.getByRole('button', { name: 'Weiter: Material' }));
      await nutzer.type(screen.getByLabelText('Artikel aus dem Lager'), 'eckventil');
      await nutzer.click(
        await screen.findByRole('button', { name: /Eckventil 1\/2 Zoll auf den Schein/ }),
      );
      await nutzer.type(screen.getByLabelText(/Freie Zeile/), 'Dichtungen');
      await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen' }));

      if (schritte) await nutzer.click(screen.getByRole('button', { name: 'Weiter: Fotos' }));
      await nutzer.type(
        screen.getByRole('textbox', { name: 'Notizen, Regiearbeiten, Mängel' }),
        'Kunde informiert',
      );

      if (schritte) {
        await nutzer.click(screen.getByRole('button', { name: 'Weiter: Unterschrift' }));
      }
      await nutzer.type(screen.getByLabelText(/Kunde \(Name/), 'Frau Huber');
      unterschreiben();
      await nutzer.click(screen.getByRole('button', { name: 'Unterschreiben und abschließen' }));
      await waitFor(() => expect(signWorkSheet).toHaveBeenCalledTimes(1));

      const inhalt = [...createWorkSheet.mock.calls, ...updateWorkSheetDraft.mock.calls].pop()![1];
      const [id, monteur, kunde] = signWorkSheet.mock.calls[0];
      expect(id).toBe('s1');
      ansicht.unmount();
      return kanonischerInhalt({
        ...(inhalt as NewWorkSheet),
        unterschriften: { monteur, kunde },
      });
    }

    it('ergibt in Schritten und auf einer Seite denselben Beleg', async () => {
      const uhr = vi.spyOn(Date, 'now').mockReturnValue(JETZT);
      let inSchritten: string;
      let aufEinerSeite: string;
      try {
        inSchritten = await ausfuellenUndUnterschreiben(true);

        createWorkSheet.mockClear();
        updateWorkSheetDraft.mockClear();
        signWorkSheet.mockClear();
        schreibtisch();
        aufEinerSeite = await ausfuellenUndUnterschreiben(false);
      } finally {
        uhr.mockRestore();
      }

      expect(inSchritten).toBe(aufEinerSeite);
      // Und der Beleg enthält, was eingegeben wurde — nicht bloß zweimal dasselbe Leere.
      const F = '\u001f';
      expect(inSchritten).toBe(
        [
          ['SCHEIN', 'B-001', 'Familie Huber', 'Hauptstraße 12', heute, 'Regie'].join(F),
          ['ZEIT', heute, 'Max Mustermann', '07:00', '15:30', '30', '480', 'Eckventil getauscht', '0'].join(F),
          ['MATERIAL', 'Eckventil 1/2 Zoll', '1', 'Stk'].join(F),
          ['MATERIAL', 'Dichtungen', '1', ''].join(F),
          ['NOTIZ', 'Kunde informiert'].join(F),
          ['MONTEUR', 'Max Mustermann', String(JETZT), 'data:image/png;base64,AAAA'].join(F),
          ['KUNDE', 'Frau Huber', String(JETZT), 'data:image/png;base64,AAAA'].join(F),
        ].join('\n'),
      );
    });
  });

  it('steht am Schreibtisch als eine Seite da — ohne Leiste und ohne „Weiter"', async () => {
    schreibtisch();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });

    expect(
      screen.queryByRole('navigation', { name: 'Schritte des Scheins' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Weiter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument();
    // Die Zusammenfassung braucht es dort nicht: alles steht darüber.
    expect(screen.queryByText('Zusammenfassung')).not.toBeInTheDocument();
    // Alles zugleich zu sehen, in der Reihenfolge wie immer.
    const titel = [
      'Baustelle und Tag',
      /^Zeiten am /,
      /^Verbautes Material/,
      'Ergänzungen',
      /^Fotos \(/,
      'Unterschriften',
    ].map((t) => screen.getByRole('heading', { name: t }));
    for (let i = 1; i < titel.length; i += 1) {
      expect(
        titel[i - 1].compareDocumentPosition(titel[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Zeile hinzufügen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unterschreiben und abschließen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Als Entwurf speichern' })).toBeInTheDocument();
  });

  it('stellt im Schritt Fotos die Fotos vor die Ergänzungen', async () => {
    // Der Schritt heisst „Fotos" — also steht vorne, wonach er heisst. Am
    // Schreibtisch bleibt die alte Reihenfolge (Test darüber).
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('link', { name: /Hauptstraße 12/ });
    await zuSchritt(nutzer, 'Fotos');
    const fotos = screen.getByRole('heading', { name: /^Fotos \(/ }).closest('section');
    expect(fotos).toHaveClass('order-first');
  });
});
