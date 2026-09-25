import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Role, WorkSheet } from '@/types';
import { todayStr } from '@/lib/time';
import { mitSchreibtisch } from './schreibtisch';
import { karteZaehlt } from './kartenZahl';

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

/* Die tiefe Prüfung holt sich ihre Scheine selbst — auf Anforderung. */
let tiefGeladen: (WorkSheet & { id: string })[] = [];
const tiefeAbfrage = vi.fn(async () => tiefGeladen);

/* Die serverseitige Suche — je Weg eine eigene Abfrage. */
let serverTreffer: (WorkSheet & { id: string })[] = [];
const zeitraumSuche = vi.fn(async () => serverTreffer);
const baustellenSuche = vi.fn(async () => serverTreffer);

vi.mock('@/lib/db/workSheets', () => ({
  listRecentWorkSheets: vi.fn(async () => geladen),
  listSignedWorkSheetsInRange: (...a: unknown[]) => tiefeAbfrage(...(a as [])),
  listWorkSheetsInRange: (...a: unknown[]) => zeitraumSuche(...(a as [])),
  listWorkSheetsForProject: (...a: unknown[]) => baustellenSuche(...(a as [])),
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
  tiefGeladen = [];
  tiefeAbfrage.mockClear();
  serverTreffer = [];
  zeitraumSuche.mockClear();
  baustellenSuche.mockClear();
  verwerfen.mockClear();
  zurueckholen.mockClear();
  zeitenGeholt.mockClear();
});

describe('Liste der Handwerksscheine', () => {
  it('hat den Knopf für einen neuen Schein im Kopf — wie die anderen Listen', async () => {
    /*
      Gemeldet: „der Tab sieht ganz anders aus — der Button erstreckt sich
      über die ganze Zeile". Er stand als einzige Anlage-Aktion der App in
      einer eigenen Karte.
    */
    zeichne();
    const neu = await screen.findByRole('link', { name: 'Neuer Schein' });
    expect(neu).toHaveAttribute('href', '/worksheet');
    // Er steht neben der Überschrift, nicht in einer Karte darunter.
    expect(neu.closest('section')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Handwerksscheine' }).parentElement?.parentElement)
      .toContainElement(neu);
  });

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

/*
  VERWERFEN, WIEDER AUFNEHMEN UND STORNIEREN LIEGEN IM „⋯" der Zeile
  (docs/design/linie.md 3: höchstens zwei Textknöpfe, das Seltene im Menü).
  Die Tests gehen deshalb über das Menü — derselbe Handgriff, eine Ebene
  tiefer; die Rückfragen dahinter sind unverändert.
*/
async function ausDemMenue(about: string, eintrag: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Weitere Aktionen für ${about}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: eintrag }));
}

/** Was das „⋯" einer Zeile anbietet — leer, wenn es keines gibt. */
async function menueVon(about: string): Promise<string[]> {
  const knopf = screen.queryByRole('button', { name: `Weitere Aktionen für ${about}` });
  if (!knopf) return [];
  await userEvent.click(knopf);
  const eintraege = screen.getAllByRole('menuitem').map((e) => e.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return eintraege;
}

describe('Einen Entwurf aufgeben', () => {
  it('fragt zurueck und nennt dabei den Schein', async () => {
    /*
      Der Fehlgriff in einer Liste gleichaussehender Zeilen ist die falsche
      ZEILE, nicht der falsche Knopf. „Wollen Sie wirklich?" allein faengt
      das nicht ab — der Kunde und der Tag muessen dastehen.
    */
    zeichne();
    await ausDemMenue('Schein Familie Huber, 04.09.2026', 'Verwerfen');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Entwurf verwerfen');
    expect(dialog).toHaveTextContent('Familie Huber, 04.09.2026');
    expect(verwerfen).not.toHaveBeenCalled();
  });

  it('verwirft erst nach der Bestaetigung, und mit dem Namen', async () => {
    zeichne();
    await ausDemMenue('Schein Familie Huber, 04.09.2026', 'Verwerfen');
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(verwerfen).toHaveBeenCalledWith('e1', 'Max Mustermann'));
  });

  it('bricht ab, ohne etwas zu tun', async () => {
    zeichne();
    await ausDemMenue('Schein Familie Huber, 04.09.2026', 'Verwerfen');
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
    expect(await menueVon('Schein Familie Berger, 03.09.2026')).not.toContain('Verwerfen');
  });

  it('zeigt der Buchhaltung den Knopf gar nicht erst', async () => {
    authWert.user.role = 'Buchhaltung';
    zeichne();
    await screen.findByText('Entwurf');
    expect(screen.queryByRole('button', { name: 'Verwerfen' })).not.toBeInTheDocument();
    expect(await menueVon('Schein Familie Huber, 04.09.2026')).not.toContain('Verwerfen');
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
    await karteZaehlt(/^Scheine$/, 2);
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
    await ausDemMenue('Schein Familie Gruber, 02.09.2026', 'Wieder aufnehmen');
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
     festes Datum im Testtext wäre nächstes Jahr ein anderer Fall.

     GERECHNET WIRD AB DEM ÖRTLICHEN HEUTE, genau wie in der Ansicht: die
     nimmt `todayStr()` und zieht davon ab. Wer hier stattdessen von der
     UTC-Uhr ausgeht, bekommt zwischen 22 und 24 Uhr UTC einen Tag Versatz —
     in Wien ist dann schon der nächste Tag. Der Test fiele zwei Stunden am
     Tag und liefe die übrigen zweiundzwanzig durch; wer ihn rot sieht, sucht
     den Fehler in seiner Änderung. Aufgefallen um 22:29 UTC. */
  const vorTagen = (n: number) =>
    new Date(Date.parse(`${todayStr()}T00:00:00Z`) - n * 86_400_000)
      .toISOString()
      .slice(0, 10);

  /* Die Unterzeile einer Person, gesucht über ihren TEXT — nicht mehr über
     die Schriftklasse (`span.text-xs`): die Personen stehen seit der Linie
     in derselben Schrift wie die übrige Unterzeile, und woran ein Test eine
     Zeile findet, soll das sein, was dort steht. Genau EIN Element trägt
     den ganzen Satz; die Textstücke darin sind seine direkten Kinder. */
  const zeile = (text: string) => screen.getByText(text);

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

    await karteZaehlt(/^Stunden ohne Buchung/, 1);
    expect(zeile('Franz Huber · 08:00 Std · keine Buchung gefunden')).toBeInTheDocument();
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

  it('meldet nichts mehr, sobald die Zeit gebucht ist', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = [offenerSchein()];
    buchungen = [
      { date: vorTagen(10), userName: 'Franz Huber', projectNumber: 'B-009', status: 'Anwesend' },
    ];
    zeichne();

    await screen.findByText(/Familie Wagner/);
    await waitFor(() => expect(zeitenGeholt).toHaveBeenCalled());
    await karteZaehlt(/^Stunden ohne Buchung/, 0);
    expect(screen.getByText(/gibt es eine Buchung in der Zeiterfassung/)).toBeInTheDocument();
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
    expect(zeile('Franz Huber · 08:00 Std · gebucht auf B-001')).toBeInTheDocument();
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
    OHNE BEFUND BLEIBT DIE KARTE STEHEN — und das ist eine Abkehr von der
    ersten Fassung. Damals war sie ein reiner Befund, und ein leerer Kasten
    wäre Rauschen gewesen. Jetzt trägt sie eine HANDLUNG: weiter zurück
    prüfen. Verschwände sie bei null Befunden, gäbe es keinen Weg mehr zu der
    Prüfung, die den alten — und damit teuren — Schein überhaupt erst findet.
  */
  it('bleibt ohne Befund stehen, weil sie die tiefe Prüfung trägt', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = scheine;
    zeichne();

    await screen.findByText(/Familie Berger/);
    await karteZaehlt(/^Stunden ohne Buchung/, 0);
    expect(screen.getByRole('button', { name: '1 Jahr' })).toBeInTheDocument();
  });

  /*
    DER ALTE SCHEIN IST DER TEURE. Die Anzeigeliste reicht fünfzig Scheine
    weit; was vier Monate zurückliegt, lag ausserhalb — und bucht niemand
    mehr von selbst nach.
  */
  it('findet auf Anforderung den Schein ausserhalb der Liste', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = scheine;
    tiefGeladen = [offenerSchein({ id: 'alt', datum: vorTagen(200) })];
    const nutzer = userEvent.setup();
    zeichne();

    await karteZaehlt(/^Stunden ohne Buchung/, 0);
    await nutzer.click(screen.getByRole('button', { name: '1 Jahr' }));

    await karteZaehlt(/^Stunden ohne Buchung/, 1);
    // Mandant, Von, Bis, Obergrenze — in dieser Reihenfolge. Die Grenze
    // gehört mitgegeben: ohne sie holte die Abfrage ein ganzes Jahr
    // unterschriebener Scheine samt ihrer Unterschriftsbilder.
    expect(tiefeAbfrage.mock.calls[0]).toEqual(['perl', vorTagen(365), vorTagen(0), 150]);
  });

  /*
    WORAUF SICH DAS ERGEBNIS STÜTZT, muss dastehen: sonst hiesse „nichts
    offen" mal „im letzten Monat" und mal „im letzten Jahr", ohne dass es
    jemand unterscheiden könnte.
  */
  it('sagt, worüber gerade geprüft wurde', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = scheine;
    tiefGeladen = [];
    const nutzer = userEvent.setup();
    zeichne();

    expect(await screen.findByText(/geladenen Scheine dieser Liste/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: '30 Tage' }));
    expect(await screen.findByText(/über die letzten 30 Tage/)).toBeInTheDocument();
  });

  /*
    Und die Obergrenze schneidet nicht still ab. Wird sie erreicht, kann die
    Antwort „nichts offen" schlicht falsch sein — das gehört dazugesagt.
  */
  it('nennt die erreichte Obergrenze', async () => {
    authWert.user.role = 'Buchhaltung';
    geladen = scheine;
    tiefGeladen = Array.from({ length: 150 }, (_, i) =>
      offenerSchein({ id: `s${i}`, datum: vorTagen(1) }),
    );
    const nutzer = userEvent.setup();
    zeichne();

    await karteZaehlt(/^Stunden ohne Buchung/, 0);
    await nutzer.click(screen.getByRole('button', { name: '90 Tage' }));
    expect(await screen.findByText(/Grenze von 150 Scheinen ist erreicht/)).toBeInTheDocument();
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
    const suchfeld = screen.getByLabelText('Suche');
    await nutzer.type(suchfeld, 'zzz');
    expect(screen.getByText(/Kein Schein passt/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Schein ansehen' }));
    expect(suchfeld).toHaveValue('');
    // Zweimal: einmal in der Karte oben, einmal in der Liste darunter — und
    // genau die untere soll wieder da sein.
    expect(screen.getAllByText(/Familie Wagner/)).toHaveLength(2);
  });
});

/**
 * Suche über den geladenen Bestand hinaus.
 *
 * Das Feld filterte bis hierher nur die geladenen fünfzig im Browser. Ein
 * Schein vom März war nicht auffindbar, egal was jemand eintippte — und das
 * Feld sagte nichts dazu, es lieferte einfach kein Ergebnis. Dieselbe
 * Fehlerform wie beim Buchhaltungs-Export: eine leere Antwort, die wie ein
 * Befund aussieht.
 */
describe('Scheine suchen', () => {
  const alterSchein = (over: Partial<WorkSheet> = {}): WorkSheet & { id: string } =>
    ({
      id: 'alt1',
      companyId: 'perl',
      projectNumber: 'B-042',
      customerName: 'Familie Steiner',
      datum: '2026-03-14',
      status: 'Unterschrieben',
      abrechnung: 'Regie',
      zeiten: [],
      material: [],
      erstelltVonUid: 'm1',
      erstelltVonName: 'Max Mustermann',
      ...over,
    }) as WorkSheet & { id: string };

  /*
    OHNE DIESE ZEILE hiesse „kein Treffer" mal „gibt es nicht" und mal „ist
    nicht geladen", ohne dass es jemand unterscheiden könnte.
  */
  it('sagt, dass die Suche nur die geladenen Scheine sieht', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'B-042');
    expect(screen.getByText(/von 2 geladenen Scheinen passen/)).toBeInTheDocument();
    expect(screen.getByText(/Ältere sind nicht geladen/)).toBeInTheDocument();
  });

  it('holt eine Baustellennummer vom Server', async () => {
    serverTreffer = [alterSchein()];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'B-042');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));

    expect(await screen.findByText(/Familie Steiner/)).toBeInTheDocument();
    expect(baustellenSuche.mock.calls[0]).toEqual(['perl', 'B-042', 150]);
    expect(zeitraumSuche).not.toHaveBeenCalled();
  });

  it('holt einen Monat als Zeitraum', async () => {
    serverTreffer = [alterSchein()];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), '03.2026');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));

    await screen.findByText(/Familie Steiner/);
    expect(zeitraumSuche.mock.calls[0]).toEqual(['perl', '2026-03-01', '2026-03-31', 150]);
    expect(baustellenSuche).not.toHaveBeenCalled();
  });

  /*
    Firestore kann keine Volltextsuche. Nach einem Namen liesse sich nur mit
    einem zusätzlich gepflegten Feld suchen, und bis das auf jedem Altbestand
    nachgetragen wäre, fände sie alte Scheine stillschweigend nicht — genau
    das Verhalten, das hier weg soll. Also wird es gesagt, nicht behauptet.
  */
  it('bietet beim Kundennamen gar keine Serversuche an, sondern erklärt es', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'Steiner');
    expect(screen.getByText(/nur im geladenen Bestand/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auf dem Server suchen' })).not.toBeInTheDocument();
  });

  /*
    Das Ergebnis gilt für GENAU den Begriff, mit dem es geholt wurde. Tippt
    jemand weiter, ist es veraltet — stehen zu bleiben hiesse, Scheine unter
    einem Suchbegriff zu zeigen, zu dem sie nicht passen.
  */
  it('verwirft das Serverergebnis, sobald der Begriff sich ändert', async () => {
    serverTreffer = [alterSchein()];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    const feld = screen.getByLabelText('Suche');
    await nutzer.type(feld, 'B-042');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));
    await screen.findByText(/Familie Steiner/);

    await nutzer.type(feld, '9');
    expect(screen.queryByText(/Familie Steiner/)).not.toBeInTheDocument();
    expect(screen.getByText(/Ältere sind nicht geladen/)).toBeInTheDocument();
  });

  it('nennt die erreichte Obergrenze auch bei der Suche', async () => {
    serverTreffer = Array.from({ length: 150 }, (_, i) => alterSchein({ id: `t${i}` }));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'B-042');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));

    expect(await screen.findByText(/Grenze von 150 ist erreicht/)).toBeInTheDocument();
  });

  /*
    Wer sucht, wartet auf eine Antwort. „Nichts gefunden" wäre bei einem
    Fehler die falsche — es wurde gar nicht gesucht.
  */
  it('meldet einen Fehler, statt ein leeres Ergebnis vorzutäuschen', async () => {
    baustellenSuche.mockRejectedValueOnce(new Error('Netz weg'));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'B-042');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));

    expect(await screen.findByText(/Netz weg/)).toBeInTheDocument();
  });

  it('führt aus dem Serverergebnis zurück in die Liste', async () => {
    serverTreffer = [alterSchein()];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/Familie Huber/);

    await nutzer.type(screen.getByLabelText('Suche'), 'B-042');
    await nutzer.click(screen.getByRole('button', { name: 'Auf dem Server suchen' }));
    await screen.findByText(/Familie Steiner/);

    await nutzer.click(screen.getByRole('button', { name: 'Zurück zur Liste' }));
    expect(screen.queryByText(/Familie Steiner/)).not.toBeInTheDocument();
  });
});

/*
  DIE ZEILE NACH DER LINIE (docs/design/linie.md 3 und 4): höchstens zwei
  Textknöpfe, das Seltene im „⋯", am Schreibtisch eine Tabelle.
*/
describe('Die Scheinzeile', () => {
  const schreibtisch = mitSchreibtisch();

  it('trägt beim Entwurf Details und Weiterbearbeiten, PDF und Verwerfen im Menü', async () => {
    geladen = [scheine[0]];
    zeichne();
    const zeile = (await screen.findByText('Familie Huber')).closest('li') as HTMLElement;
    expect(within(zeile).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(within(zeile).getByRole('link', { name: 'Weiterbearbeiten' })).toBeInTheDocument();
    expect(within(zeile).queryByRole('button', { name: 'PDF' })).not.toBeInTheDocument();
    expect(await menueVon('Schein Familie Huber, 04.09.2026')).toEqual(['PDF', 'Verwerfen']);
  });

  it('trägt beim unterschriebenen Schein Details und PDF; Stornieren nur im Menü der Geschäftsführung', async () => {
    geladen = [scheine[1]];
    authWert.user.role = 'Geschäftsführung';
    zeichne();
    const zeile = (await screen.findByText('Familie Berger')).closest('li') as HTMLElement;
    expect(within(zeile).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(within(zeile).getByRole('button', { name: 'PDF' })).toBeInTheDocument();
    expect(within(zeile).queryByRole('button', { name: 'Stornieren' })).not.toBeInTheDocument();

    await ausDemMenue('Schein Familie Berger, 03.09.2026', 'Stornieren');
    // Der Storno fragt weiterhin nach seinem Grund.
    expect(await screen.findByLabelText(/Grund/)).toBeInTheDocument();
  });

  it('bietet dem Monteur am unterschriebenen Schein kein Menü an', async () => {
    geladen = [scheine[1]];
    zeichne();
    await screen.findByText('Familie Berger');
    expect(await menueVon('Schein Familie Berger, 03.09.2026')).toEqual([]);
  });

  it('steht am Schreibtisch als Tabelle — genau eine Form im DOM', async () => {
    schreibtisch();
    zeichne();
    const zeile = await screen.findByRole('row', { name: /Familie Huber/ });
    const t = zeile.closest('table')!;
    expect(within(t).getAllByRole('columnheader').map((k) => k.textContent)).toEqual([
      'Baustelle', 'Kunde', 'Datum', 'Abrechnung', 'Stunden', 'Status', 'Aktionen',
    ]);
    expect(zeile).toHaveTextContent('B-001');
    expect(zeile).toHaveTextContent('04.09.2026');
    expect(zeile).toHaveTextContent('Regie');
    expect(zeile).toHaveTextContent('Entwurf');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Weiterbearbeiten' })).toHaveLength(1);
  });

  it('klappt die Einzelheiten am Schreibtisch unter der Zeile auf', async () => {
    schreibtisch();
    const nutzer = userEvent.setup();
    zeichne();
    const zeile = await screen.findByRole('row', { name: /Familie Huber/ });
    // Die erste Zelle klappt auf — kein eigener Knopf „Details" in der Aktionsspalte.
    expect(within(zeile).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    const aufklapper = within(zeile).getByRole('button', { name: 'Einzelheiten zu B-001' });
    expect(aufklapper).toHaveAttribute('aria-expanded', 'false');
    await nutzer.click(aufklapper);
    expect(aufklapper).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByText('Entsteht mit der Unterschrift.').closest('td') as HTMLElement;
    expect(detail).toHaveAttribute('colspan', '7');
  });
});
