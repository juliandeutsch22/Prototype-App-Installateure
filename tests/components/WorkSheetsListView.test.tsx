import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Role, WorkSheet } from '@/types';

/**
 * Der Weg zurück in einen Entwurf.
 *
 * „Als Entwurf speichern" war eine Sackgasse: der Schein landete in dieser
 * Liste, und dort gab es nur Aufklappen, PDF und Storno. Wer ihn anlegte, um
 * ihn später unterschreiben zu lassen — der Regelfall für diesen Knopf:
 * vormittags vorbereiten, nachmittags unterschreiben lassen —, kam nie
 * wieder hinein. Er tippte alles neu und legte damit einen ZWEITEN Beleg
 * über dieselbe Arbeit an.
 */

const scheine: (WorkSheet & { id: string })[] = [
  {
    id: 'e1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerId: 'k1',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12',
    datum: '2026-09-04',
    status: 'Entwurf',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max Mustermann',
  } as WorkSheet & { id: string },
  {
    id: 'u1',
    companyId: 'perl',
    projectNumber: 'B-002',
    customerId: 'k2',
    customerName: 'Familie Berger',
    address: 'Nebenweg 3',
    datum: '2026-09-03',
    status: 'Unterschrieben',
    abrechnung: 'Regie',
    zeiten: [],
    material: [],
    erstelltVonUid: 'm1',
    erstelltVonName: 'Max Mustermann',
  } as WorkSheet & { id: string },
];

/**
 * Der verworfene Entwurf — aufgegeben, nicht geloescht.
 *
 * `allow delete` steht fuer diese Sammlung auf `false` und soll dort bleiben:
 * die Regel schuetzt den unterschriebenen Kundenbeleg. Ein versehentlich
 * angelegter Entwurf blieb damit aber fuer immer in der Arbeitsliste stehen.
 */
const verworfener: WorkSheet & { id: string } = {
  id: 'v1',
  companyId: 'perl',
  projectNumber: 'B-003',
  customerId: 'k3',
  customerName: 'Familie Gruber',
  address: 'Feldgasse 7',
  datum: '2026-09-02',
  status: 'Verworfen',
  verworfenVonName: 'Max Mustermann',
  abrechnung: 'Regie',
  zeiten: [],
  material: [],
  erstelltVonUid: 'm1',
  erstelltVonName: 'Max Mustermann',
} as WorkSheet & { id: string };

/** Was die Liste laedt — je Test setzbar. */
let geladen: (WorkSheet & { id: string })[] = scheine;

const verwerfen = vi.fn(async () => undefined);
const zurueckholen = vi.fn(async () => undefined);

vi.mock('@/lib/db/workSheets', () => ({
  listRecentWorkSheets: vi.fn(async () => geladen),
  cancelWorkSheet: vi.fn(async () => undefined),
  discardWorkSheetDraft: (...a: unknown[]) => verwerfen(...(a as [])),
  restoreWorkSheetDraft: (...a: unknown[]) => zurueckholen(...(a as [])),
}));
vi.mock('@/features/worksheets/worksheetPdf', () => ({
  buildWorkSheetPdf: vi.fn(),
  shareOrDownloadPdf: vi.fn(),
}));

/*
  EIN STABILES Objekt, nicht bei jedem Aufruf ein neues.

  Die Ansicht haengt ihr Laden an `user`. Gaebe der Mock jedes Mal ein frisch
  gebautes Objekt zurueck, aenderte sich die Identitaet bei jedem Zeichnen,
  das Laden liefe endlos neu an und die Liste bliebe fuer immer bei „Wird
  geladen …". Genau das ist hier zuerst passiert — ein Fehler im TEST, nicht
  in der Ansicht: `AuthContext` liefert im Betrieb einen stabilen Wert.
*/
const authWert = {
  user: {
    uid: 'm1',
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as Role,
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

const { default: WorkSheetsListView } = await import(
  '@/features/worksheets/WorkSheetsListView'
);

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkSheetsListView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authWert.user.role = 'Mitarbeiter';
  geladen = scheine;
  verwerfen.mockClear();
  zurueckholen.mockClear();
});

describe('Liste der Handwerksscheine', () => {
  it('führt aus einem Entwurf zurück ins Formular — mit seiner Kennung', async () => {
    /*
      Die Kennung ist der Punkt. Ohne sie öffnete der Knopf ein LEERES
      Formular, und der Monteur legte einen zweiten Beleg über dieselbe
      Arbeit an, statt den vorhandenen zu Ende zu bringen.
    */
    zeichne();
    const knopf = await screen.findByRole('link', { name: /Weiterbearbeiten/ });
    expect(knopf).toHaveAttribute('href', '/worksheet?entwurf=e1');
  });

  it('bietet das bei einem unterschriebenen Schein NICHT an', async () => {
    // Er ist eingefroren; die Rules lehnen jede Änderung ab. Ein Knopf
    // dafür wäre ein Versprechen, das die Datenbank nicht hält.
    zeichne();
    await screen.findByText('Unterschrieben');
    expect(screen.getAllByRole('link', { name: /Weiterbearbeiten/ })).toHaveLength(1);
  });

  it('zeigt den Knopf der Buchhaltung gar nicht erst', async () => {
    /*
      Sie steht in diesem Reiter, darf den Schein aber nicht schreiben. Ein
      sichtbarer Knopf führte sie auf eine Seite mit „Kein Zugriff" — die
      unangenehmste Art, eine Berechtigung zu erklären.
    */
    authWert.user.role = 'Buchhaltung';
    zeichne();
    await screen.findByText('Entwurf');
    expect(screen.queryByRole('link', { name: /Weiterbearbeiten/ })).not.toBeInTheDocument();
  });
});

describe('Einen Entwurf aufgeben', () => {
  it('fragt zurueck und nennt dabei den Schein', async () => {
    /*
      Der Fehlgriff in einer Liste gleichaussehender Zeilen ist die falsche
      ZEILE, nicht der falsche Knopf. „Wollen Sie wirklich?" allein faengt
      das nicht ab — der Kunde und der Tag muessen dastehen.
    */
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Entwurf verwerfen');
    expect(dialog).toHaveTextContent('Familie Huber, 2026-09-04');
    expect(verwerfen).not.toHaveBeenCalled();
  });

  it('verwirft erst nach der Bestaetigung, und mit dem Namen', async () => {
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(verwerfen).toHaveBeenCalledWith('e1', 'Max Mustermann'));
  });

  it('bricht ab, ohne etwas zu tun', async () => {
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(verwerfen).not.toHaveBeenCalled();
  });

  it('bietet das Verwerfen bei einem unterschriebenen Schein NICHT an', async () => {
    // Der ist eingefroren; die Rules lehnen jede Aenderung ab.
    geladen = [scheine[1]];
    zeichne();
    await screen.findByText('Unterschrieben');
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).not.toBeInTheDocument();
  });

  it('zeigt der Buchhaltung den Knopf gar nicht erst', async () => {
    authWert.user.role = 'Buchhaltung';
    zeichne();
    await screen.findByText('Entwurf');
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).not.toBeInTheDocument();
  });
});

describe('Der verworfene Entwurf in der Liste', () => {
  it('steht nicht mehr im Weg — die Liste zeigt ihn nicht', async () => {
    geladen = [...scheine, verworfener];
    zeichne();
    await screen.findByText('Familie Huber');
    expect(screen.queryByText('Familie Gruber')).not.toBeInTheDocument();
  });

  it('ist aber nicht verschwunden: der Schalter nennt seine Zahl', async () => {
    /*
      Ihn auch aus der ANSICHT zu nehmen waere das Loeschen durch die
      Hintertuer. Was niemand mehr sehen kann, ist weg — und genau das
      verbieten die Rules aus gutem Grund.
    */
    geladen = [...scheine, verworfener];
    zeichne();
    const schalter = await screen.findByRole('checkbox', {
      name: /1 verworfener Entwurf anzeigen/,
    });
    await userEvent.click(schalter);
    expect(await screen.findByText('Familie Gruber')).toBeInTheDocument();
  });

  it('zaehlt nicht in der Ueberschrift mit', async () => {
    geladen = [...scheine, verworfener];
    zeichne();
    expect(await screen.findByText('Scheine (2)')).toBeInTheDocument();
  });

  it('nennt den, der ihn aufgegeben hat', async () => {
    geladen = [verworfener];
    zeichne();
    await userEvent.click(await screen.findByRole('checkbox'));
    expect(await screen.findByText(/Verworfen von Max Mustermann/)).toBeInTheDocument();
  });

  it('laesst sich wieder aufnehmen', async () => {
    /*
      Der Rueckweg ist der Punkt. „Verwerfen" ist der Knopf fuer den
      Fehlgriff; ohne Rueckweg kostete sein eigener Fehlgriff den ganzen
      getippten Schein — der Fehler waere nur verschoben.
    */
    geladen = [verworfener];
    zeichne();
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(await screen.findByRole('button', { name: 'Wieder aufnehmen' }));
    await waitFor(() => expect(zurueckholen).toHaveBeenCalledWith('v1'));
  });

  it('bietet am verworfenen Entwurf kein Weiterbearbeiten an', async () => {
    // Das Speichern lehnten die Rules ab: aus „Verworfen" fuehrt nur der
    // eine Weg zurueck in den Entwurf, und der aendert den Inhalt nicht.
    geladen = [verworfener];
    zeichne();
    await userEvent.click(await screen.findByRole('checkbox'));
    expect(screen.queryByRole('link', { name: /Weiterbearbeiten/ })).not.toBeInTheDocument();
  });
});
