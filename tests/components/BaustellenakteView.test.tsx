import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  { id: 'k2', companyId: 'perl', name: 'Bäckerei Süd' },
];

let baustellen: (Project & { id: string })[] = [BAUSTELLE];
let belegschaft: AppUser[] = BELEGSCHAFT;
let nebenladenScheitert = false;

const listProjectsByIds = vi.fn(async () => baustellen);
const updateProject = vi.fn(async () => undefined);
const baustelleUmnummern = vi.fn<[string, string], Promise<void>>(async () => undefined);

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
let angebote: { id: string; quoteNumber: string }[] = [];
let angeboteScheitern = false;
const listQuotesForProject = vi.fn<[string, string], Promise<typeof angebote>>(async () => {
  if (angeboteScheitern) throw new Error('kaputt');
  return angebote;
});
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
    expect(screen.getByLabelText(/Stundenbudget/)).toHaveValue(40);
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

  it('gibt den Links unter „Weiter" die volle Tastfläche (Prüflauf 25.09.2026, P4-09)', async () => {
    // Alleinstehende Links waren nur so hoch wie ihre Zeile (24 px).
    zeige();
    expect((await screen.findByRole('link', { name: 'Zur Kundenakte' })).className)
      .toMatch(/\bmin-h-touch\b/);
    expect(screen.getByRole('link', { name: /Handwerksschein/ }).className).toMatch(/\bmin-h-touch\b/);
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

  it('unterscheidet „gibt es nicht" von „konnte nicht laden"', async () => {
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
