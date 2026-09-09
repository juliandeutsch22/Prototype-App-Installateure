import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Customer, Project } from '@/types';
import AdminProjectsView from '@/features/projects/AdminProjectsView';

/**
 * Die Baustellenverwaltung — die vierte der bisher ungetesteten Kernansichten.
 *
 * Die Baustelle ist der Anker, an dem Zeiten, Material, Scheine und
 * Rechnungen hängen. Zwei Dinge daran sind mehr als Formularkosmetik: das
 * Stundenbudget (an ihm misst die Ampel der Nachkalkulation) und die
 * Zuordnung von Team und Projektleitung (sie entscheidet, wer die Baustelle
 * überhaupt sieht).
 */

const KUNDE: Customer & { id: string } = {
  id: 'k1', companyId: 'perl', name: 'Familie Huber',
} as Customer & { id: string };

const MONTEUR: AppUser = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true,
} as AppUser;

let baustellen: (Project & { id: string })[] = [];
let ladefehler = false;

/* Was die Serversuche nach einer Nummer zurückgibt — und womit sie gefragt wurde. */
let serverBaustellen: (Project & { id: string })[] = [];
let serverFehler = false;
const gefragtMit = vi.fn();

const lege = vi.fn();
const aendere = vi.fn();
const loesche = vi.fn();

/* Mit welcher Grenze zuletzt abonniert wurde — der Nachladeknopf hebt sie an. */
let letzteGrenze = 0;

vi.mock('@/lib/db/projects', () => ({
  subscribeRecentProjects: (
    _c: string,
    g: number,
    cb: (rows: (Project & { id: string })[]) => void,
  ) => {
    letzteGrenze = g;
    cb(baustellen);
    return () => undefined;
  },
  createProject: (c: string, data: unknown) => {
    lege(c, data);
    return Promise.resolve('neu');
  },
  updateProject: (id: string, data: unknown) => {
    aendere(id, data);
    return Promise.resolve();
  },
  deleteProject: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
  findProjectsByNumber: (c: string, formen: string[]) => {
    gefragtMit(c, formen);
    return serverFehler ? Promise.reject(new Error('kein Netz')) : Promise.resolve(serverBaustellen);
  },
}));

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => {
    if (ladefehler) throw new Error('kein Netz');
    return [MONTEUR];
  }),
}));
let kundenBestand: (Customer & { id: string })[] = [KUNDE];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kundenBestand) }));

/*
  Die Stunden der Übersicht. Sie hängen an einer eigenen Abfrage, und diese
  Datei prüft nicht die Übersicht selbst (das tut
  `BaustellenUebersicht.test.tsx`), sondern DASS sie überhaupt geöffnet wird —
  und erst dann lädt.
*/
const listEntriesForProjects = vi.fn(async () => [
  {
    id: 'z1',
    companyId: 'perl',
    date: '2026-09-01',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: '2026-001',
  },
]);
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: () => listEntriesForProjects(),
}));

const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AdminProjectsView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  baustellen = [];
  kundenBestand = [KUNDE];
  ladefehler = false;
  serverBaustellen = [];
  serverFehler = false;
  gefragtMit.mockClear();
  lege.mockClear();
  aendere.mockClear();
  loesche.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Baustellen — anlegen', () => {
  it('übernimmt den Kundennamen aus dem Stammdatensatz', async () => {
    /**
     * Der Kunde ist kein Textfeld mehr. Würde der Name hier frei getippt,
     * stünde auf der Rechnung ein anderer als in der Kundenakte — und die
     * Akte fände ihre eigene Baustelle nicht wieder.
     */
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-042');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1]).toMatchObject({
      projectNumber: '2026-042',
      customerId: 'k1',
      customerName: 'Familie Huber',
    });
  });

  it('lässt ein leeres Stundenbudget UNGESETZT, statt 0 daraus zu machen', async () => {
    /**
     * „Kein Budget" und „Budget null" sind zwei verschiedene Aussagen. Aus
     * einem leeren Feld eine 0 zu machen hieße, dass die Ampel der
     * Nachkalkulation jede Baustelle sofort als überzogen meldet.
     */
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-043');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBeUndefined();
  });

  it('nimmt ein gesetztes Stundenbudget als Zahl mit', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Projektnummer'), '2026-044');
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.type(screen.getByLabelText(/Stundenbudget/), '40');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][1].estimatedHours).toBe(40);
  });
});

describe('Baustellen — bearbeiten', () => {
  it('ändert die vorhandene Baustelle, statt eine zweite anzulegen', async () => {
    /**
     * Bei einer Nummer, die zweimal existiert, wüsste keine Zeitbuchung mehr,
     * zu welcher Baustelle sie gehört.
     */
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', customerId: 'k1', status: 'Aktiv',
      } as Project & { id: string },
    ];
    zeige();

    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: /bearbeiten/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(aendere).toHaveBeenCalled());
    expect(aendere.mock.calls[0][0]).toBe('p1');
    expect(lege).not.toHaveBeenCalled();
  });
});

describe('Baustellen — löschen', () => {
  it('fragt vorher nach', async () => {
    // An einer Baustelle haengen Zeiten, Scheine und Rechnungen. Ein Loeschen
    // ohne Rueckfrage waere hier besonders teuer.
    baustellen = [
      {
        id: 'p1', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Familie Huber', status: 'Aktiv',
      } as Project & { id: string },
    ];
    zeige();

    const zeile = (await screen.findByText(/2026-042/)).closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: 'Baustelle löschen' }));

    const dialog = await screen.findByRole('dialog');
    expect(loesche).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: /löschen/i }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('p1'));
  });
});

describe('Baustellen — wenn etwas nicht lädt', () => {
  it('sagt es, statt eine leere Belegschaft zu zeigen', async () => {
    // Sonst liesse sich eine Baustelle ohne Mannschaft anlegen, und niemand
    // wuesste, dass die Liste nur nicht geladen hat.
    ladefehler = true;
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Belegschaft konnte nicht geladen werden.',
    );
  });
});

/**
 * DIE ÜBERSICHT JE BAUSTELLE.
 *
 * Sie beantwortet die Frage, die man beim Blick auf eine Baustelle
 * tatsächlich hat — „wie steht DIESE Baustelle?" —, und zwar dort, wo man sie
 * stellt. Bisher stand die Auswertung nur unter der Mitarbeiterübersicht, wo
 * sie eine Monatsfrage über alle Baustellen beantwortet.
 */
describe('Baustellen — Übersicht je Baustelle', () => {
  beforeEach(() => {
    baustellen = [
      {
        id: 'p1',
        companyId: 'perl',
        projectNumber: '2026-001',
        customerName: 'Familie Huber',
        status: 'Aktiv',
        estimatedHours: 40,
      } as Project & { id: string },
    ];
    listEntriesForProjects.mockClear();
  });

  it('lädt die Stunden erst beim Aufklappen', async () => {
    zeige();
    await screen.findByText(/Familie Huber/);
    /*
      Der Punkt: zwanzig Baustellen im Voraus zu laden hiesse zwanzig
      Abfragen für die eine, die jemanden interessiert.
    */
    expect(listEntriesForProjects).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }));
    await waitFor(() => expect(listEntriesForProjects).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Fachzeit')).toBeInTheDocument();
  });

  it('klappt wieder zu', async () => {
    zeige();
    await screen.findByText(/Familie Huber/);
    await userEvent.click(screen.getByRole('button', { name: 'Übersicht' }));
    await screen.findByText('Fachzeit');

    await userEvent.click(screen.getByRole('button', { name: 'Übersicht zu' }));
    await waitFor(() => expect(screen.queryByText('Fachzeit')).not.toBeInTheDocument());
  });
});

/**
 * Die Baustellenliste sagt, wie weit sie reicht.
 *
 * Sie holte fest die jüngsten 300 und schwieg dazu. Ab der 301. Baustelle
 * fielen die ÄLTESTEN heraus, ohne dass irgendwo etwas stand — die Baustelle
 * von vor drei Jahren war in der Verwaltung schlicht nicht mehr auffindbar,
 * und nichts unterschied das von „gibt es nicht".
 *
 * Genau diese Fehlerform hat „Sichtbare Grenzen" überall herausgenommen; hier
 * wurde sie übersehen, weil die Ansicht ein Live-Abo verwendet und damit
 * nicht ins Muster der einmal ladenden Listen passte.
 */
describe('Wie weit die Baustellenliste reicht', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `p${i}`,
        companyId: 'perl',
        projectNumber: `B-${String(i).padStart(4, '0')}`,
        customerName: 'Familie Huber',
        status: 'Aktiv',
      }) as Project & { id: string },
    );

  it('schweigt, solange die Grenze nicht greift', async () => {
    baustellen = viele(12);
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(screen.queryByRole('button', { name: /Weitere Baustellen laden/ })).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist — samt Hinweis auf die Suche', async () => {
    baustellen = viele(300);
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(screen.getByRole('button', { name: /Weitere Baustellen laden/ })).toBeInTheDocument();
    /*
      Der zweite Satz ist der wichtigere: wer eine alte Baustelle sucht und
      nichts findet, soll nicht schliessen, es gebe sie nicht. Er sagt
      seither auch, was WEITER reicht — die Nummer geht auf den Server.
    */
    const satz = screen.getByText(/nur in diesen gesucht/);
    expect(satz.textContent).toMatch(/Baustellennummer geht auf den Server/);
  });

  it('holt beim Nachladen tatsächlich mehr', async () => {
    baustellen = viele(300);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Alle Baustellen/);
    expect(letzteGrenze).toBe(300);

    await nutzer.click(screen.getByRole('button', { name: /Weitere Baustellen laden/ }));
    expect(letzteGrenze).toBe(600);
  });
});

/**
 * Die Suche, die über die geladene Liste hinausreicht.
 *
 * Die Liste zeigt die jüngsten dreihundert. Eine Baustelle von vor vier
 * Jahren steht nicht darin, und im Browser zu filtern kann sie folglich nicht
 * finden — das Feld lieferte einfach kein Ergebnis, und nichts unterschied
 * das von „gibt es nicht". Nach der NUMMER lässt sich dagegen exakt fragen.
 *
 * Warum nur nach der Nummer und nicht nach Kunde und Adresse, steht in
 * `baustellenSuche.ts` und ist in `tests/unit/baustellenSuche.test.ts`
 * geprüft. Hier geht es um die Ansicht: fragt sie den Server, zeigt sie den
 * Treffer, und sagt sie vorher, wie weit sie reicht?
 */
describe('Baustellen — Suche über die Liste hinaus', () => {
  const geladene = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `p${i}`,
        companyId: 'perl',
        projectNumber: `2026-${String(i).padStart(3, '0')}`,
        customerName: 'Familie Huber',
        status: 'Aktiv',
      }) as Project & { id: string },
    );

  /** Die alte, abgeschlossene Baustelle, die nur der Server kennt. */
  const ALT = {
    id: 'alt',
    companyId: 'perl',
    projectNumber: '2022-007',
    customerName: 'Hausverwaltung Berger',
    status: 'Abgeschlossen',
  } as Project & { id: string };

  it('fragt den Server, sobald der Begriff eine Nummer ist', async () => {
    baustellen = geladene(10);
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    // Beide Schreibweisen, sonst fänden sich ausgerechnet die Altbestände nicht.
    await waitFor(() =>
      expect(gefragtMit).toHaveBeenCalledWith('perl', ['2022-007', 'PR-2022-007']),
    );
  });

  it('fragt NICHT bei Kunde oder Adresse', async () => {
    // Eine Abfrage, die verlässlich nichts findet, wäre nur ein falsches
    // Versprechen über der örtlichen Suche.
    baustellen = geladene(10);
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), 'Berger');

    expect(await screen.findByText(/nur im geladenen Bestand/)).toBeInTheDocument();
    expect(gefragtMit).not.toHaveBeenCalled();
  });

  it('zeigt die gefundene Baustelle, obwohl sie nicht geladen ist', async () => {
    baustellen = geladene(10);
    serverBaustellen = [ALT];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    expect(await screen.findByText(/Hausverwaltung Berger/)).toBeInTheDocument();
    expect(
      screen.getByText(/Eine Baustelle ausserhalb der geladenen Liste gefunden/),
    ).toBeInTheDocument();
  });

  it('lässt den Servertreffer am Statusfilter vorbei', async () => {
    /*
      Die Ansicht steht auf „Aktiv & pausiert"; die gesuchte alte Baustelle ist
      abgeschlossen. Sie deshalb zu verschweigen wäre wieder das leere
      Ergebnis, das wie ein Befund aussieht — und wer eine Nummer eintippt,
      meint genau diese Baustelle.
    */
    baustellen = geladene(10);
    serverBaustellen = [ALT];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2022-007');

    expect(await screen.findByText(/Hausverwaltung Berger/)).toBeInTheDocument();
  });

  it('zählt eine bereits geladene Baustelle nicht als Fund vom Server', async () => {
    // Sonst behauptete die Zeile einen Gewinn, den es nicht gab.
    baustellen = geladene(10);
    serverBaustellen = [baustellen[3]];
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2026-003');

    await waitFor(() => expect(gefragtMit).toHaveBeenCalled());
    /*
      Genau die Zählzeile, nicht der Hinweis darüber: der kündigt die
      Serversuche an und enthält dieselben Worte. Ein zu weiter Ausdruck
      träfe ihn und wäre damit blind für das, was hier geprüft wird.
    */
    expect(screen.queryByText(/Baustellen? ausserhalb der geladenen Liste gefunden/))
      .not.toBeInTheDocument();
  });

  it('lässt bei einem Fehlschlag die örtliche Suche stehen', async () => {
    /*
      Was geladen ist, ist wegen eines gescheiterten Serveraufrufs nicht
      falsch. Die Liste zu leeren wäre der schlechtere Zustand: sie behauptete
      dann, es gebe die Baustelle nicht.
    */
    baustellen = geladene(10);
    serverFehler = true;
    const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    zeige();
    await nutzer.type(await screen.findByLabelText('Suche'), '2026-003');

    // Die Zeile der Baustelle, nicht der Hinweis über dem Feld: dort steht die
    // Nummer in Klammern hinter dem Kundennamen.
    expect(await screen.findByText('(2026-003)')).toBeInTheDocument();
    expect(screen.queryByText(/Baustellen? ausserhalb der geladenen Liste gefunden/))
      .not.toBeInTheDocument();
  });
});

/**
 * WENN DIE KUNDENAUSWAHL AN IHRER GRENZE ENDET.
 *
 * `listCustomers` hatte schon immer eine Grenze — einen Standardwert von 500,
 * der nirgends stand. Damit war sie die einzige Liste, die noch
 * stillschweigend abschnitt: der Wächter `abfragegrenzen` liess sie durch,
 * weil sie eine Grenze HAT.
 *
 * Der Schaden wäre nicht die Kundenliste, sondern dieses Auswahlfeld: fehlt
 * ein Kunde, legt jemand die Baustelle ohne Kunden an oder tippt den Namen
 * von Hand — genau die Dublette, gegen die die Kundenstammdaten eingeführt
 * wurden.
 */
describe('Baustellen — Kundenauswahl an der Grenze', () => {
  it('sagt es, sobald die Grenze erreicht ist', async () => {
    kundenBestand = Array.from({ length: 500 }, (_, i) =>
      ({ id: `k${i}`, companyId: 'perl', name: `Kunde ${i}` }) as Customer & { id: string },
    );
    zeige();

    expect(await screen.findByText(/nur die ersten 500 Kunden/)).toBeInTheDocument();
  });

  it('schweigt bei einem gewöhnlichen Kundenstamm', async () => {
    zeige();
    await screen.findByLabelText('Kunde');
    expect(screen.queryByText(/nur die ersten/)).not.toBeInTheDocument();
  });
});
