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
/*
  Die Adressen der Bilder kommen aus Firebase Storage. Geprüft wird hier
  nicht das Laden, sondern was die Ansicht damit tut — und was sie sagt, wenn
  ein Bild NICHT mehr dort liegt, wo der Schein es verzeichnet.
*/
const fotoAdresse = vi.fn<[string], Promise<string>>(async (p) => `https://x/${p}`);
vi.mock('@/lib/db/scheinFotos', () => ({
  fotoAdresse: (p: string) => fotoAdresse(p),
}));

/*
  Die Zeiteinträge der KOLLEGEN — nur das Büro bekommt sie zu sehen.

  Der Mock ist auch dann nötig, wenn keine Buchung geprüft wird: ohne ihn
  zöge die Ansicht das echte Firebase-Modul in den Testlauf.
*/
let buchungen: Array<Record<string, unknown>> = [];
const zeitenGeholt = vi.fn(async () => buchungen);
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesInRange: (...a: unknown[]) => zeitenGeholt(...(a as [])),
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
  buchungen = [];
  verwerfen.mockClear();
  zurueckholen.mockClear();
  zeitenGeholt.mockClear();
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

/**
 * Die Fotos im Büro.
 *
 * Sie liegen in Firebase Storage, ihre Adressen müssen einzeln geholt werden.
 * Deshalb geschieht das erst beim AUFKLAPPEN eines Scheins — eine Liste, die
 * beim Öffnen zwanzig Bilder nachlädt, ist auf einer Baustelle keine Liste
 * mehr.
 */
describe('Fotos am Schein', () => {
  const mitFotos = () => {
    scheine[1] = {
      ...scheine[1],
      fotos: [
        { pfad: 'scheine/perl/u1/aaa.jpg', hash: 'a'.repeat(64), bytes: 340_000, geraetZeit: 1 },
      ],
    } as WorkSheet & { id: string };
  };

  it('holt die Bilder erst beim Aufklappen', async () => {
    mitFotos();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Berger/);
    expect(fotoAdresse).not.toHaveBeenCalled();

    await nutzer.click(screen.getAllByRole('button', { name: 'Details' })[1]);
    await waitFor(() => expect(fotoAdresse).toHaveBeenCalledWith('scheine/perl/u1/aaa.jpg'));
  });

  it('zeigt die Prüfsumme neben dem Bild', async () => {
    /*
      Sie ist der Grund, warum ein Foto überhaupt etwas beweist: die
      Storage-Datei allein sagt nichts darüber, ob sie noch die ist, die
      unterschrieben wurde.
    */
    mitFotos();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Berger/);
    await nutzer.click(screen.getAllByRole('button', { name: 'Details' })[1]);
    expect(await screen.findByText(/^aaaaaaaaaaaa…/)).toBeInTheDocument();
  });

  /*
    EIN FEHLENDES BILD IST EINE AUSSAGE, KEINE PANNE. Die Datei liegt nicht
    mehr dort, wo der Schein sie verzeichnet — das ist der Unterschied
    zwischen „lädt noch" und „der Beleg hat ein Loch".
  */
  it('sagt es, wenn ein Bild nicht mehr da ist', async () => {
    mitFotos();
    fotoAdresse.mockRejectedValueOnce(new Error('weg'));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Berger/);
    await nutzer.click(screen.getAllByRole('button', { name: 'Details' })[1]);
    expect(await screen.findByText(/nicht mehr vollständig belegbar/)).toBeInTheDocument();
  });

  it('zeigt gar keinen Fotobereich, wenn es keine gibt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);
    await nutzer.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.queryByText(/^Fotos/)).not.toBeInTheDocument();
  });
});

/**
 * Stunden ohne Buchung — die Kollegenzeile, an die niemand erinnert wird.
 *
 * Der Nachtrag in der Zeiterfassung deckt nur die EIGENEN Zeilen des
 * Monteurs ab, und das muss so bleiben: in derselben Ablage stehen Kranken-
 * und Urlaubstage der Kollegen. Trägt er auf dem Schein die Zeile eines
 * Kollegen ein, sieht die niemand wieder — er nicht, weil ihm fremde
 * Buchungen verborgen sind, der Kollege nicht, weil ihm dieser Schein
 * verborgen ist. Die Stunde wird nie verrechnet und nie aufgezeichnet.
 */
describe('Stunden ohne Buchung', () => {
  /* Tage relativ zu HEUTE — der Befund hängt am Alter des Scheins, und ein
     festes Datum im Testtext wäre nächstes Jahr ein anderer Fall. */
  const vorTagen = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  /* Die Zeile ist aus mehreren Elementen gesetzt — gesucht wird deshalb im
     zusammengesetzten Text, nicht in einem einzelnen Knoten. */
  const zeile = (text: string) =>
    screen.getByText((_t, el) => el?.textContent?.replace(/\s+/g, ' ').trim() === text, {
      selector: 'span.text-xs',
    });

  const offenerSchein = (p: Partial<WorkSheet> = {}): WorkSheet & { id: string } =>
    ({
      id: 'o1',
      companyId: 'perl',
      projectNumber: 'B-009',
      customerName: 'Familie Wagner',
      datum: vorTagen(10),
      status: 'Unterschrieben',
      abrechnung: 'Regie',
      zeiten: [
        {
          datum: vorTagen(10),
          mitarbeiter: 'Franz Huber',
          von: '07:00',
          bis: '15:30',
          pauseMin: 30,
          minuten: 480,
        },
      ],
      material: [],
      erstelltVonUid: 'm1',
      erstelltVonName: 'Max Mustermann',
      ...p,
    }) as WorkSheet & { id: string };

  it('nennt dem Büro die Zeile, die niemand gebucht hat', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein()];
    zeichne();

    expect(await screen.findByText(/Stunden ohne Buchung \(1\)/)).toBeInTheDocument();
    expect(zeile('Franz Huber · 08:00 · keine Buchung gefunden')).toBeInTheDocument();
    // Die Summe ist die eigentliche Aussage: so viel Zeit steht
    // unterschrieben beim Kunden und in keiner Aufzeichnung.
    expect(screen.getByText(/stehen unterschrieben beim Kunden/)).toBeInTheDocument();
  });

  /*
    DER MONTEUR BEKOMMT DIESE KARTE NICHT — und holt die Daten auch gar nicht
    erst. Fremde Zeiteinträge darf er nach den Firestore-Regeln nicht lesen;
    die Abfrage bliebe an ihnen hängen und hinterliesse nichts als einen
    Fehler in einer Ansicht, die er sonst benutzen kann.
  */
  it('lädt für den Monteur keine fremden Zeiteinträge', async () => {
    authWert.user.role = 'Mitarbeiter';
    geladen = [offenerSchein()];
    zeichne();

    await screen.findByText(/Familie Wagner/);
    expect(zeitenGeholt).not.toHaveBeenCalled();
    expect(screen.queryByText(/Stunden ohne Buchung/)).not.toBeInTheDocument();
  });

  it('schweigt, sobald die Zeit gebucht ist', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein()];
    buchungen = [
      { date: vorTagen(10), userName: 'Franz Huber', projectNumber: 'B-009', status: 'Anwesend' },
    ];
    zeichne();

    await screen.findByText(/Familie Wagner/);
    await waitFor(() => expect(zeitenGeholt).toHaveBeenCalled());
    expect(screen.queryByText(/Stunden ohne Buchung/)).not.toBeInTheDocument();
  });

  /*
    Gebucht, aber auf die Hauptbaustelle: die Arbeitszeit IST aufgezeichnet,
    falsch ist nur die Zuordnung — und die entscheidet, wem die Stunde
    verrechnet wird. Beides in einen Topf zu werfen machte die Summe
    unbrauchbar.
  */
  it('unterscheidet die falsch zugeordnete Stunde von der fehlenden', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein()];
    buchungen = [
      { date: vorTagen(10), userName: 'Franz Huber', projectNumber: 'B-001', status: 'Anwesend' },
    ];
    zeichne();

    await screen.findByText(/Stunden ohne Buchung/);
    expect(zeile('Franz Huber · 08:00 · gebucht auf B-001')).toBeInTheDocument();
    expect(screen.queryByText(/stehen unterschrieben beim Kunden/)).not.toBeInTheDocument();
  });

  /*
    Der Zeitraum der Abfrage kommt aus den geladenen Scheinen, nicht aus dem
    Kalender: ein fester Monat holte entweder zu wenig oder viel zu viel.
  */
  it('holt die Zeiteinträge über den Zeitraum der geladenen Scheine', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein(), offenerSchein({ id: 'o2', datum: vorTagen(40) })];
    zeichne();

    await waitFor(() => expect(zeitenGeholt).toHaveBeenCalled());
    expect(zeitenGeholt.mock.calls[0]).toEqual(['perl', vorTagen(40), vorTagen(10)]);
  });

  /*
    Die Karte ist kein Dauerzustand: gibt es nichts zu tun, steht sie nicht
    da. Ein Kasten „alles gebucht", der jeden Tag erscheint, wird nach einer
    Woche nicht mehr gelesen — und dann auch nicht, wenn er etwas meldet.
  */
  it('erscheint gar nicht, wenn nichts offen ist', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = scheine;
    zeichne();

    await screen.findByText(/Familie Berger/);
    expect(screen.queryByText(/Stunden ohne Buchung/)).not.toBeInTheDocument();
  });

  /*
    Der Knopf führt zum Schein, und der steht unten in der Liste. Steht dort
    noch ein Suchbegriff, klappte er zwar auf, wäre aber nicht zu sehen — ein
    Knopf, der scheinbar nichts tut.
  */
  it('räumt die Suche weg, bevor es den Schein aufklappt', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein()];
    const nutzer = userEvent.setup();
    zeichne();

    await screen.findByText(/Stunden ohne Buchung/);
    const suchfeld = screen.getByLabelText('Scheine durchsuchen');
    await nutzer.type(suchfeld, 'zzz');
    expect(screen.getByText(/Kein Schein passt/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Schein ansehen' }));
    expect(suchfeld).toHaveValue('');
    // Zweimal: einmal in der Karte oben, einmal in der Liste darunter — und
    // genau die untere soll wieder da sein.
    expect(screen.getAllByText(/Familie Wagner/)).toHaveLength(2);
  });
});
