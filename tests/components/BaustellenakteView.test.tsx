import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Project, AppUser, Customer } from '@/types';

/**
 * Die Baustellenakte.
 *
 * WAS SIE ABLÖST. Die Baustelle hatte keine eigene Seite: bearbeitet wurde
 * sie in einem Formular über der Liste, ihre Stundenauswertung klappte IN der
 * Listenzeile auf. Wer etwas ändern wollte, sprang nach oben, tippte, und
 * suchte die Baustelle danach in der Liste wieder.
 *
 * Geprüft werden beide Darstellungen — Formular und Nur-Lesen —, weil an der
 * zweiten die grössere Hälfte der Belegschaft hängt.
 */

const BAUSTELLE: Project & { id: string } = {
  id: 'b1',
  companyId: 'perl',
  projectNumber: '2026-101',
  customerId: 'k1',
  customerName: 'Hausverwaltung Nord',
  address: 'Ringstraße 3, 2700 Wiener Neustadt',
  status: 'Aktiv',
  billingMode: 'Pauschal',
  estimatedHours: 40,
  description: 'Steigleitung tauschen.\nBad im ersten Stock.',
  startDate: '2026-03-02',
  endDate: '2026-04-30',
  contactName: 'Frau Wagner',
  contactPhone: '0664 1234567',
  assignedEmployees: ['u1', 'u2'],
  projectManagers: ['u9'],
};

const BELEGSCHAFT: AppUser[] = [
  { id: 'u1', uid: 'u1', name: 'Anton Meier', email: 'a@perl.at', role: 'Mitarbeiter', companyId: 'perl', active: true },
  { id: 'u2', uid: 'u2', name: 'Berta Klein', email: 'b@perl.at', role: 'Mitarbeiter', companyId: 'perl', active: true },
  { id: 'u9', uid: 'u9', name: 'Clara Leiter', email: 'c@perl.at', role: 'Projektleiter', companyId: 'perl', active: true },
];

const KUNDEN: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Nord' },
  { id: 'k2', companyId: 'perl', name: 'Bäckerei Süd', address: 'Marktplatz 7, 2700 Wiener Neustadt' },
];

let baustellen: (Project & { id: string })[] = [BAUSTELLE];
let belegschaft: AppUser[] = BELEGSCHAFT;
let nebenladenScheitert = false;

const listProjectsByIds = vi.fn(async () => baustellen);
const updateProject = vi.fn(async () => undefined);
const baustelleUmnummern = vi.fn<(a0: string, a1: string) => Promise<void>>(async () => undefined);

// Termine (Plan 10.4): ohne eigene Prüfung hier leer — geprüft in TermineKarte.test.tsx.
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => []),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/projects', () => ({
  listProjectsByIds: () => listProjectsByIds(),
  updateProject: (...a: unknown[]) => updateProject(...(a as [])),
  baustelleUmnummern: (id: string, neu: string) => baustelleUmnummern(id, neu),
}));
vi.mock('@/lib/db/users', () => ({
  listUsers: async () => {
    if (nebenladenScheitert) throw new Error('kaputt');
    return belegschaft;
  },
}));
vi.mock('@/lib/db/customers', () => ({
  listCustomers: async () => {
    if (nebenladenScheitert) throw new Error('kaputt');
    return KUNDEN;
  },
}));

/** Pläne an der Baustelle. */
type Plan = { id: string; projectId: string; pfad: string; dateiname: string; mime: string; bytes: number };
let plaene: Plan[] = [];
const hochgeladen: File[] = [];
const geloescht: string[] = [];
vi.mock('@/lib/db/baustellenDokumente', async () => {
  const echt = await vi.importActual<typeof import('@/lib/db/pg/baustellenDokumente')>(
    '@/lib/db/pg/baustellenDokumente',
  );
  return {
    listDokumente: vi.fn(async () => plaene),
    dokumentAdressen: vi.fn(async (d: Plan[]) => new Map(d.map((x) => [x.pfad, `https://speicher/${x.pfad}`]))),
    dokumentHochladen: vi.fn(async (_c: string, projectId: string, datei: File) => {
      hochgeladen.push(datei);
      const neu = { id: `d${hochgeladen.length}`, projectId, pfad: `baustellen/perl/${projectId}/${hochgeladen.length}.pdf`, dateiname: datei.name, mime: 'application/pdf', bytes: datei.size };
      plaene = [neu, ...plaene];
      return neu;
    }),
    dokumentLoeschen: vi.fn(async (d: Plan) => {
      geloescht.push(d.id);
      plaene = plaene.filter((x) => x.id !== d.id);
      return { dateiBlieb: false };
    }),
    // Die Prüfung der Datei ist die echte — sie ist Teil dessen, was hier gilt.
    dateiPruefen: echt.dateiPruefen,
    GUELTIG_SEKUNDEN: 3600,
  };
});

/** Angebote zur Baustelle — gesucht über ihre Kennung. */
let angebote: { id: string; quoteNumber: string; status?: string; totalNetto?: number; quoteDate?: string }[] = [];
let angeboteScheitern = false;
const listQuotesForProject = vi.fn<(a0: string, a1: string) => Promise<typeof angebote>>(async () => {
  if (angeboteScheitern) throw new Error('kaputt');
  return angebote;
});
/*
  DIE HANDWERKSSCHEINE DER BAUSTELLE (09.10.2026): über die bestehende Abfrage
  der Baustelle; „verrechnet“ über die bestehende Abfrage der Rechnungen.
*/
const SCHEIN = (id: string, p: Record<string, unknown> = {}) => ({
  id, companyId: 'perl', projectNumber: '2026-101', customerName: 'Familie Huber', datum: '2026-10-05',
  status: 'Unterschrieben', abrechnung: 'Regie', zeiten: [{ mitarbeiter: 'Max', minuten: 240 }], material: [],
  erstelltVonUid: 'm1', erstelltVonName: 'Max Monteur', unterschriften: { kunde: { name: 'Frau Huber' } }, ...p,
});
let scheine: ReturnType<typeof SCHEIN>[] = [];
let aufRechnung: string[] = [];
const listWorkSheetsForProject = vi.fn(async (_c: string, _p: string, max?: number) => scheine.slice(0, max ?? scheine.length));
const scheineAufRechnung = vi.fn(async (_c: string, ids: string[]) => ids.filter((i) => aufRechnung.includes(i)));
vi.mock('@/lib/db/workSheets', () => ({
  listWorkSheetsForProject: (c: string, p: string, max?: number) => listWorkSheetsForProject(c, p, max),
}));
vi.mock('@/lib/db/invoices', () => ({
  scheineAufRechnung: (c: string, ids: string[]) => scheineAufRechnung(c, ids),
}));

vi.mock('@/lib/db/quotes', () => ({
  listQuotesForProject: (c: string, p: string) => listQuotesForProject(c, p),
}));

/*
  Die Stundenauswertung hat einen eigenen Ansichtstest. Hier steht sie als
  Platzhalter: geprüft wird, DASS die Akte sie zeigt, nicht was sie rechnet.
*/
vi.mock('@/features/projects/BaustellenUebersicht', () => ({
  default: () => <p>Stundenauswertung</p>,
}));

let modulAn = true;
vi.mock('@/lib/useModule', () => ({ useModul: () => modulAn }));

let rolle: 'Geschäftsführung' | 'Verwaltung' = 'Geschäftsführung';
const NUTZER = () => ({
  uid: 'chef',
  email: 'chefin@perl.at',
  name: 'Julian Deutsch',
  role: rolle,
  companyId: 'perl',
  docId: 'chef',
});
let nutzer = NUTZER();
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: nutzer }) }));

const { default: BaustellenakteView } = await import('@/features/projects/BaustellenakteView');
const { listTermineDerBaustelle } = await import('@/lib/db/termine');

function zeige(id = 'b1') {
  return render(
    <MemoryRouter initialEntries={[`/admin-projects/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/admin-projects/:id" element={<BaustellenakteView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Der Wert zu einer Beschriftung in den Stammdaten. */
function angabe(wort: string) {
  const dt = screen.getByText(wort);
  return dt.nextElementSibling as HTMLElement;
}

beforeEach(() => {
  baustellen = [BAUSTELLE];
  belegschaft = BELEGSCHAFT;
  nebenladenScheitert = false;
  scheine = [];
  aufRechnung = [];
  listWorkSheetsForProject.mockClear();
  scheineAufRechnung.mockClear();
  modulAn = true;
  rolle = 'Geschäftsführung';
  nutzer = NUTZER();
  listProjectsByIds.mockClear();
  updateProject.mockClear();
  baustelleUmnummern.mockClear();
  angebote = [];
  angeboteScheitern = false;
  plaene = [];
  hochgeladen.length = 0;
  geloescht.length = 0;
  listQuotesForProject.mockClear();
});

describe('Die Stammdaten für alle, die nur lesen', () => {
  beforeEach(() => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
  });

  it('zeigt die Angaben, ohne ein einziges Eingabefeld', async () => {
    zeige();
    expect(await screen.findByText('Projektnummer')).toBeInTheDocument();
    expect(angabe('Projektnummer')).toHaveTextContent('2026-101');
    expect(angabe('Abrechnung')).toHaveTextContent('Pauschal');
    expect(screen.queryByLabelText(/Projektnummer/)).not.toBeInTheDocument();
  });

  it('sagt bei einer leeren Angabe, dass sie nicht hinterlegt ist', async () => {
    /*
      Die Zeile wegzulassen wäre bequemer und falsch: eine Akte ohne
      Ansprechpartner sähe dann genauso aus wie eine, in der das Feld gar
      nicht vorgesehen ist — und niemand käme auf die Idee, ihn nachzutragen.
    */
    baustellen = [{ ...BAUSTELLE, contactName: undefined }];
    zeige();
    expect(await screen.findByText('Ansprechpartner vor Ort')).toBeInTheDocument();
    expect(angabe('Ansprechpartner vor Ort')).toHaveTextContent('nicht hinterlegt');
  });

  it('zeigt die Beschreibung mit ihren Zeilenumbrüchen', async () => {
    zeige();
    const text = await screen.findByText(/Steigleitung tauschen/);
    expect(text).toHaveClass('whitespace-pre-line');
  });

  it('nennt das Team beim Namen und nicht bei der Kennung', async () => {
    /*
      DER FEHLER, DEN DIESE PRÜFUNG GEFUNDEN HAT. Die Belegschaft wurde
      zuerst nur für die Auswahlfelder geladen — also nur für die, die
      ändern dürfen. Im Nur-Lesen-Fall stand im Team deshalb `u1, u2`. An
      der Baustelle steht, WER dort arbeitet; eine Kennung beantwortet das
      nicht.
    */
    zeige();
    expect(await screen.findByText('Team')).toBeInTheDocument();
    expect(angabe('Team')).toHaveTextContent('Anton Meier, Berta Klein');
    expect(angabe('Projektleitung')).toHaveTextContent('Clara Leiter');
  });

  it('sagt es, wenn die Belegschaft nicht lädt', async () => {
    nebenladenScheitert = true;
    zeige();
    expect(await screen.findByText(/Belegschaft/)).toBeInTheDocument();
  });
});

describe('Die Stammdaten für alle, die ändern dürfen', () => {
  it('zeigt dieselben Angaben als Felder', async () => {
    zeige();
    expect(await screen.findByLabelText(/Projektnummer/)).toHaveValue('2026-101');
    expect(screen.getByLabelText(/Baustellenadresse/)).toHaveValue(
      'Ringstraße 3, 2700 Wiener Neustadt',
    );
    expect(screen.getByLabelText(/Abrechnung/)).toHaveValue('Pauschal');
    expect(screen.getByLabelText(/Stundenbudget/)).toHaveValue('40');
  });

  it('zeigt die Speicherleiste erst, wenn sich wirklich etwas geändert hat', async () => {
    /*
      Ein dauerhaft sichtbarer Speichern-Knopf lädt zum Speichern ohne
      Änderung ein. Jeder dieser Schreibvorgänge geht auf die Baustelle —
      und die Einsatzplanung hängt daran.
    */
    zeige();
    await screen.findByLabelText(/Projektnummer/);
    expect(screen.queryByText(/ungespeicherte Änderungen/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Baustellenadresse/), '!');
    expect(await screen.findByText(/ungespeicherte Änderungen/)).toBeInTheDocument();
  });

  it('nimmt die Änderung mit, nicht nur die Anzeige', async () => {
    zeige();
    const feld = await screen.findByLabelText(/Ansprechpartner vor Ort/);
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Herr Huber');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateProject).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ contactName: 'Herr Huber' }),
    );
  });

  it('macht aus einem geleerten Stundenbudget kein Budget von null', async () => {
    /*
      `Number('')` ist `0`, und `0` hiesse „null Stunden kalkuliert" — die
      Ampel der Projektauswertung stünde ab da auf Rot. „Kein Budget" ist
      etwas anderes.
    */
    zeige();
    await userEvent.clear(await screen.findByLabelText(/Stundenbudget/));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateProject).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ estimatedHours: undefined }),
    );
  });

  it('speichert die Bezeichnung (G4)', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText(/Bezeichnung/), 'Bad 2. OG');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith('b1', expect.objectContaining({ bezeichnung: 'Bad 2. OG' })),
    );
  });

  it('schlägt beim Kundenwechsel dessen Anschrift nur vor, wenn das Feld leer ist (G5)', async () => {
    zeige();
    const adresse = await screen.findByLabelText(/Baustellenadresse/);
    // Gegenprobe zuerst: eine eigene Baustellenadresse bleibt stehen.
    await userEvent.selectOptions(screen.getByLabelText(/^Kunde/), 'k2');
    expect(adresse).toHaveValue('Ringstraße 3, 2700 Wiener Neustadt');
    // Geleert und neu gewählt: jetzt kommt der Vorschlag.
    await userEvent.clear(adresse);
    await userEvent.selectOptions(screen.getByLabelText(/^Kunde/), 'k1');
    await userEvent.selectOptions(screen.getByLabelText(/^Kunde/), 'k2');
    expect(adresse).toHaveValue('Marktplatz 7, 2700 Wiener Neustadt');
    expect(screen.getByText(/Vom Kunden übernommen/)).toBeInTheDocument();
  });

  it('speichert kein Ende vor dem Beginn (Testbericht 30.09.2026, M13)', async () => {
    zeige();
    const beginn = await screen.findByLabelText('Beginn');
    await userEvent.clear(beginn);
    await userEvent.type(beginn, '2026-10-05');
    const ende = screen.getByLabelText('Ende (geplant)');
    await userEvent.clear(ende);
    await userEvent.type(ende, '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/liegt vor dem Beginn/)).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('schreibt die Abrechnungsart, die vorher nirgends änderbar war', async () => {
    /*
      Der Handwerksschein LIEST `billingMode` — auf einer Regiebaustelle sind
      die bestätigten Stunden die Rechnungsgrundlage, auf einer
      Pauschalbaustelle belegt derselbe Schein nur, DASS gearbeitet wurde.
      Geschrieben wurde die Angabe bisher nur beim Umwandeln eines Angebots;
      wer sie korrigieren musste, konnte es nicht.
    */
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText(/Abrechnung/), 'Regie');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateProject).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ billingMode: 'Regie' }),
    );
  });

  it('nimmt beim Kundenwechsel den Namen mit', async () => {
    // Der Name steht als Kopie auf der Baustelle, damit die Listen ihn zeigen
    // können, ohne den Kundenstamm zu laden. Bliebe er stehen, zeigte die
    // Liste den alten Kunden zu einer Baustelle, die einem anderen gehört.
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText(/Kunde/), 'k2');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateProject).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ customerId: 'k2', customerName: 'Bäckerei Süd' }),
    );
  });

  it('speichert nicht ohne Projektnummer', async () => {
    zeige();
    await userEvent.clear(await screen.findByLabelText(/Projektnummer/));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateProject).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ohne Projektnummer/);
  });

  it('ändert die Nummer über den eigenen Weg — erst nach Rückfrage', async () => {
    /*
      An der Nummer hängen Buchungen, Scheine und Einsätze als Text. Über
      `updateProject` gewechselt, blieben sie auf der alten stehen — die
      Baustelle zeigte danach null Stunden. So war es bis zum 23.09.
    */
    zeige();
    const feld = await screen.findByLabelText(/Projektnummer/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '2026-110');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/Aus 2026-101 wird 2026-110/)).toBeInTheDocument();
    expect(baustelleUmnummern).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Nummer ändern' }));

    await vi.waitFor(() => expect(baustelleUmnummern).toHaveBeenCalledWith('b1', '2026-110'));
    await vi.waitFor(() => expect(updateProject).toHaveBeenCalled());
    // Die Nummer geht NICHT noch einmal über den gewöhnlichen Weg.
    expect((updateProject.mock.calls[0] as unknown[])[1]).not.toHaveProperty('projectNumber');
  });

  it('nennt den Grund, wenn die Nummer schon auf Belegen steht — und speichert dann nichts', async () => {
    baustelleUmnummern.mockRejectedValueOnce(
      new Error('Die Nummer steht schon auf Belegen und bleibt: 1 Rechnung(en)'),
    );
    zeige();
    const feld = await screen.findByLabelText(/Projektnummer/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '2026-110');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Nummer ändern' }));

    expect(await screen.findByText(/steht schon auf Belegen und bleibt: 1 Rechnung/)).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('fragt bei unveränderter Nummer nicht nach', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText(/Baustellenadresse/), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(updateProject).toHaveBeenCalled());
    expect(baustelleUmnummern).not.toHaveBeenCalled();
    expect(screen.queryByText(/Projektnummer ändern\?/)).not.toBeInTheDocument();
  });

  it('verwirft die Änderung auf Wunsch wieder', async () => {
    zeige();
    const feld = await screen.findByLabelText(/Baustellenadresse/);
    await userEvent.type(feld, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(feld).toHaveValue('Ringstraße 3, 2700 Wiener Neustadt');
    expect(screen.queryByText(/ungespeicherte Änderungen/)).not.toBeInTheDocument();
  });

  it('warnt, solange keine Projektleitung zugeteilt ist', async () => {
    // Ohne Zuständige erreicht eine Eilzustellung niemanden. Das gehört
    // gesagt, nicht erst, wenn ein Monteur im Keller wartet.
    baustellen = [{ ...BAUSTELLE, projectManagers: [] }];
    zeige();
    expect(await screen.findByText(/Eilzustellung für diese Baustelle/)).toBeInTheDocument();
  });

  it('sagt es, wenn Belegschaft und Kundenstamm nicht laden', async () => {
    // Sonst blieben beide Auswahlfelder leer, und es sähe aus, als hätte der
    // Betrieb weder Monteure noch Kunden.
    nebenladenScheitert = true;
    zeige();
    expect(await screen.findByText(/Belegschaft und Kundenstamm/)).toBeInTheDocument();
  });
});

describe('Was die Akte sonst noch zeigt', () => {
  it('trägt die Stundenauswertung, die vorher in der Listenzeile aufklappte', async () => {
    zeige();
    expect(await screen.findByText('Stundenauswertung')).toBeInTheDocument();
  });

  it('verweist auf die Kundenakte', async () => {
    zeige();
    expect(await screen.findByRole('link', { name: 'Zur Kundenakte' })).toHaveAttribute(
      'href',
      '/customers/k1',
    );
  });

  it('gibt den Links unter „Weiter“ die volle Tastfläche (Prüflauf 25.09.2026, P4-09)', async () => {
    // Alleinstehende Links waren nur so hoch wie ihre Zeile (24 px).
    zeige();
    expect((await screen.findByRole('link', { name: 'Zur Kundenakte' })).className)
      .toMatch(/\bmin-h-touch\b/);
    expect((await screen.findByRole('link', { name: /Handwerksschein/ })).className).toMatch(/\bmin-h-touch\b/);
  });

  it('sagt es, wenn kein Kunde verknüpft ist, statt den Verweis wegzulassen', async () => {
    // Altbestand: die Baustelle trägt einen Kundennamen, aber keine
    // Verknüpfung. Ein fehlender Verweis sähe aus wie „gibt es nicht".
    baustellen = [{ ...BAUSTELLE, customerId: undefined }];
    zeige();
    expect(await screen.findByText(/Kein Kunde verknüpft/)).toBeInTheDocument();
  });

  it('führt zum Handwerksschein dieser Baustelle', async () => {
    zeige();
    expect(await screen.findByRole('link', { name: /Handwerksschein/ })).toHaveAttribute(
      'href',
      '/worksheet?projekt=2026-101',
    );
  });

  it('zeigt den Schein-Verweis nicht, wenn das Modul aus ist', async () => {
    modulAn = false;
    zeige();
    await screen.findByLabelText(/Projektnummer/);
    expect(screen.queryByRole('link', { name: /Handwerksschein/ })).not.toBeInTheDocument();
  });

  it('unterscheidet „gibt es nicht“ von „konnte nicht laden“', async () => {
    // Wer einem alten Lesezeichen folgt, soll das erfahren und nicht auf
    // einen Ladefehler schliessen.
    baustellen = [];
    zeige();
    expect(await screen.findByText(/gibt es nicht/)).toBeInTheDocument();
  });
});

/*
  GEMELDET: in der Baustelle stand nur „Aus Angebot AN-2026-0001", und das
  Angebot war von hier aus nirgends zu erreichen.
*/
describe('Das Angebot hinter der Baustelle', () => {
  it('ist von der Akte aus verlinkt', async () => {
    angebote = [{ id: 'q7', quoteNumber: 'AN-2026-0007' }];
    zeige();
    expect(await screen.findByRole('link', { name: 'Angebot AN-2026-0007' })).toHaveAttribute(
      'href',
      '/quotes/q7',
    );
    // Über die Kennung gesucht, nicht über die änderbare Nummer.
    expect(listQuotesForProject).toHaveBeenCalledWith('perl', BAUSTELLE.id);
  });

  it('wird für jemanden ohne Zugang zu Angeboten gar nicht erst gesucht', async () => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
    angebote = [{ id: 'q7', quoteNumber: 'AN-2026-0007' }];
    zeige();
    await screen.findByText('Stundenauswertung');
    expect(listQuotesForProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Angebot AN/ })).toBeNull();
  });

  it('sagt bei Pauschal, woher der Preis kommt: aus dem angenommenen Angebot (M14)', async () => {
    angebote = [{ id: 'q7', quoteNumber: 'AN-2026-0007', status: 'Angenommen', totalNetto: 7500.5, quoteDate: '2026-09-01' }];
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText(/Abrechnung/), 'Pauschal');
    expect(await screen.findByText(/legt das angenommene Angebot AN-2026-0007 fest/)).toBeInTheDocument();
  });

  it('ohne angenommenes Angebot: sagt, dass der Preis in der Rechnung eingetragen wird (M14)', async () => {
    angebote = [{ id: 'q7', quoteNumber: 'AN-2026-0007', status: 'Versendet', totalNetto: 100 }];
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText(/Abrechnung/), 'Pauschal');
    expect(await screen.findByText(/Pauschal ohne angenommenes Angebot/)).toBeInTheDocument();
  });

  it('Gegenprobe: bei Regie kein Hinweis zum Pauschalpreis', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText(/Abrechnung/), 'Regie');
    expect(screen.queryByText(/Pauschalpreis|Pauschal ohne/)).toBeNull();
  });

  it('sagt es, wenn das Angebot nicht geladen werden konnte', async () => {
    angeboteScheitern = true;
    zeige();
    expect(await screen.findByText(/Das Angebot zu dieser Baustelle konnte nicht geladen werden/)).toBeInTheDocument();
  });
});

/*
  GEMELDET: „Baustellen sollte man Dokumente oder Bilder hinzufügen können,
  für Baupläne oder ähnliches, damit der Monteur Zugriff darauf hat."
*/
describe('Pläne und Dokumente', () => {
  const pdf = (name: string, groesse = 1000) =>
    new File([new Uint8Array(groesse)], name, { type: 'application/pdf' });

  it('lädt hoch und zeigt den Plan sofort', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText('Noch keine Pläne oder Dokumente.');
    await nutzer.upload(screen.getByLabelText('Pläne oder Bilder auswählen'), pdf('Grundriss EG.pdf'));
    expect(hochgeladen.map((d) => d.name)).toEqual(['Grundriss EG.pdf']);
    expect(await screen.findByRole('link', { name: 'Grundriss EG.pdf' })).toHaveAttribute(
      'href',
      'https://speicher/baustellen/perl/b1/1.pdf',
    );
  });

  it('lädt von mehreren Dateien die guten hoch und nennt die schlechte', async () => {
    const nutzer = userEvent.setup({ applyAccept: false });
    zeige();
    await screen.findByText('Noch keine Pläne oder Dokumente.');
    await nutzer.upload(screen.getByLabelText('Pläne oder Bilder auswählen'), [
      pdf('Plan 1.pdf'),
      new File([new Uint8Array(10)], 'Zeichnung.dwg', { type: '' }),
      pdf('Plan 2.pdf'),
    ]);
    expect(hochgeladen.map((d) => d.name)).toEqual(['Plan 1.pdf', 'Plan 2.pdf']);
    expect(await screen.findByText(/Zeichnung.dwg.*nur PDF und Bilder/)).toBeInTheDocument();
  });

  it('löscht erst nach Rückfrage', async () => {
    plaene = [{ id: 'd9', projectId: 'b1', pfad: 'baustellen/perl/b1/x.pdf', dateiname: 'Alt.pdf', mime: 'application/pdf', bytes: 500 }];
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Alt.pdf löschen' }));
    expect(geloescht).toEqual([]);
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: /Löschen|Bestätigen|Ja/ }));
    expect(geloescht).toEqual(['d9']);
    expect(await screen.findByText('Noch keine Pläne oder Dokumente.')).toBeInTheDocument();
  });

  it('lässt wer nur liest die Pläne sehen, aber nichts hochladen oder löschen', async () => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
    plaene = [{ id: 'd9', projectId: 'b1', pfad: 'baustellen/perl/b1/x.pdf', dateiname: 'Alt.pdf', mime: 'application/pdf', bytes: 500 }];
    zeige();
    expect(await screen.findByRole('link', { name: 'Alt.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Plan oder Bild hinzufügen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alt.pdf löschen' })).toBeNull();
  });
});

describe('Termine in der Baustellenakte (Plan 10.4)', () => {
  it('zeigt die Termine dieser Baustelle, mit „Termin anlegen" für die Leitung', async () => {
    zeige();
    const titel = await screen.findByRole('heading', { name: 'Termine' });
    expect(within(titel.closest('section')!).getByRole('button', { name: 'Termin anlegen' })).toBeInTheDocument();
    await waitFor(() => expect(listTermineDerBaustelle).toHaveBeenCalledWith('perl', '2026-101'));
  });

  it('nicht ohne das Modul Einsatzplanung', async () => {
    modulAn = false;
    zeige();
    await screen.findByText('Projektnummer');
    expect(screen.queryByRole('heading', { name: 'Termine' })).not.toBeInTheDocument();
  });
});

/*
  LINIE „LOT“ (Schritt E7): Zusammenfassung zuerst, Sprungleiste, Verlauf als
  Lot, Stammdaten als Kurzzeilen — und Warnungen bleiben sichtbar.
*/
describe('Die Baustellenakte in der Linie „Lot“', () => {
  it('führt mit der Sprungleiste zu jedem Teil, den es gibt', async () => {
    zeige();
    const leiste = await screen.findByRole('navigation', { name: 'Auf dieser Seite' });
    const ziele = within(leiste).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(ziele).toEqual(['#b-ueberblick', '#b-termine', '#b-scheine', '#b-daten', '#b-plaene']);
    for (const z of ziele) expect(document.getElementById(z!.slice(1))).not.toBeNull();
  });

  it('Gegenprobe: ohne Einsatzplanung kein Sprung zu den Terminen', async () => {
    modulAn = false;
    zeige();
    const leiste = await screen.findByRole('navigation', { name: 'Auf dieser Seite' });
    expect(within(leiste).queryByRole('link', { name: 'Termine' })).toBeNull();
  });

  it('zeigt den Verlauf als Lot: Beginn, heute als Ring, das überschrittene Ende', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 4, 15, 9, 0, 0));
    try {
      zeige();
      const lot = await screen.findByRole('list', { name: 'Verlauf der Baustelle' });
      const punkte = within(lot).getAllByRole('listitem');
      expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual([
        'Beginn', 'Ende geplant', 'Heute · Aktiv',
      ]);
      expect(punkte[2]).toHaveAttribute('aria-current', 'step');
      expect(within(punkte[1]).getByText('überschritten')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Gegenprobe: eine abgeschlossene Baustelle hat keinen „heute“-Ring und nichts überschritten', async () => {
    baustellen = [{ ...BAUSTELLE, status: 'Abgeschlossen' }];
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf der Baustelle' });
    expect(within(lot).queryByText(/Heute/)).toBeNull();
    expect(within(lot).queryByText('überschritten')).toBeNull();
    expect(within(lot).getByText('Ende')).toBeInTheDocument();
  });

  it('fasst die Stammdaten in Kurzzeilen zusammen — die Felder stehen darin', async () => {
    zeige();
    const feld = await screen.findByLabelText(/Projektnummer/);
    const zeile = feld.closest('details')!;
    expect(within(zeile.querySelector('summary')!).getByText('Auftrag')).toBeInTheDocument();
    expect(zeile.querySelector('summary')).toHaveTextContent('Aktiv · Pauschal · 40 h Budget');
  });

  it('lässt die Warnung zur fehlenden Projektleitung sichtbar, auch wenn die Kurzzeile zu ist', async () => {
    baustellen = [{ ...BAUSTELLE, projectManagers: [] }];
    zeige();
    const warnung = await screen.findByText(/Eilzustellung für diese Baustelle/);
    expect(warnung.closest('details')).toBeNull();
    // Gegenprobe: die Auswahl der Projektleitung selbst steht in der Kurzzeile.
    expect(screen.getByText('Verantwortliche Projektleitung').closest('details')).not.toBeNull();
  });
});

/*
  DIE HANDWERKSSCHEINE IN DER AKTE (Rückmeldung des Betreibers, 09.10.2026):
  vorher stand dort nur „Handwerksschein schreiben“.
*/
/** Die Karte „Handwerksscheine“ (Card trägt keinen Vorlesenamen; gefunden über ihre Überschrift). */
async function scheinKarte() {
  await screen.findByRole('heading', { name: 'Handwerksscheine' });
  return document.getElementById('b-scheine')!;
}

describe('Die Handwerksscheine der Baustelle', () => {
  it('stehen in der Akte, neueste zuerst, mit Stand, Dauer und dem Weg zum Schein', async () => {
    scheine = [
      SCHEIN('s2', { datum: '2026-10-07', status: 'Entwurf', unterschriften: undefined }),
      SCHEIN('s1'),
    ];
    zeige();
    const karte = within(await scheinKarte());
    const zeilen = await karte.findAllByRole('link', { name: /07\.10\.2026|05\.10\.2026/ });
    expect(zeilen.map((z) => z.getAttribute('href'))).toEqual(['/worksheets?markiert=s2', '/worksheets?markiert=s1']);
    expect(karte.getByText('Entwurf')).toBeInTheDocument();
    expect(karte.getByText('Unterschrieben')).toBeInTheDocument();
    expect(karte.getByText(/unterschrieben von Frau Huber/)).toBeInTheDocument();
    expect(karte.getAllByText('04:00 Std').length).toBe(2);
    expect(listWorkSheetsForProject).toHaveBeenCalledWith('perl', '2026-101', 20);
  });

  it('nennt „verrechnet“, wer Rechnungen sieht — und fragt sonst gar nicht', async () => {
    scheine = [SCHEIN('s1')];
    aufRechnung = ['s1'];
    zeige();
    const karte = within(await scheinKarte());
    expect(await karte.findByText('verrechnet')).toBeInTheDocument();
    cleanup();
    // Gegenprobe: die Verwaltung liest keine Rechnungen — kein „verrechnet“, keine Abfrage.
    rolle = 'Verwaltung';
    nutzer = NUTZER();
    scheineAufRechnung.mockClear();
    zeige();
    const zweite = within(await scheinKarte());
    expect(await zweite.findByText('Unterschrieben')).toBeInTheDocument();
    expect(zweite.queryByText('verrechnet')).toBeNull();
    expect(scheineAufRechnung).not.toHaveBeenCalled();
  });

  it('sagt, wenn es noch keinen gibt, und bietet „Handwerksschein schreiben“', async () => {
    zeige();
    const karte = within(await scheinKarte());
    expect(await karte.findByText(/noch keinen Handwerksschein/)).toBeInTheDocument();
    expect(karte.getByRole('link', { name: 'Handwerksschein schreiben' })).toHaveAttribute('href', '/worksheet?projekt=2026-101');
  });

  it('lädt zwanzig auf einmal und auf Wunsch weitere', async () => {
    scheine = Array.from({ length: 25 }, (_, i) => SCHEIN(`s${i}`, { datum: `2026-09-${String(30 - i).padStart(2, '0')}` }));
    zeige();
    const karte = within(await scheinKarte());
    expect(await karte.findAllByRole('link', { name: /\.09\.2026/ })).toHaveLength(20);
    await userEvent.click(karte.getByRole('button', { name: /Weitere/ }));
    await waitFor(() => expect(karte.getAllByRole('link', { name: /\.09\.2026/ })).toHaveLength(25));
    expect(listWorkSheetsForProject).toHaveBeenLastCalledWith('perl', '2026-101', 40);
  });

  it('Gegenprobe: ohne das Modul „Handwerksscheine“ kein Abschnitt und keine Abfrage', async () => {
    modulAn = false;
    zeige();
    await screen.findByLabelText(/Projektnummer/);
    expect(document.getElementById('b-scheine')).toBeNull();
    expect(listWorkSheetsForProject).not.toHaveBeenCalled();
  });
});
