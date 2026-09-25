import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Project } from '@/types';

/**
 * Die Baustellen des Monteurs — die Ansicht, die er im Auto aufmacht.
 *
 * Hier zählen drei Dinge, und alle drei entscheiden sich daran, ob jemand
 * ankommt und jemanden erreicht: die Route, die Telefonnummer, und die
 * ehrliche Meldung, wenn eines davon fehlt. Eine leere Zeile statt eines
 * Ansprechpartners heisst vor Ort: anrufen im Büro, warten, weiterfahren.
 */

let baustellen: Project[] = [];
let faellt = false;
const listProjectsForEmployee = vi.fn(async () => {
  if (faellt) throw new Error('kein Netz');
  return baustellen;
});
/** Baustellen aus der Einteilung — die, die nicht im Team stehen. */
let perNummer: Project[] = [];
let einsaetze: { projectNumber: string; date: string }[] = [];
const listProjectsByNumbers = vi.fn(async (_c: string, n: string[]) =>
  perNummer.filter((p) => n.includes(p.projectNumber)));
vi.mock('@/lib/db/projects', () => ({
  listProjectsForEmployee: () => listProjectsForEmployee(),
  listProjectsByNumbers: (c: string, n: string[]) => listProjectsByNumbers(c, n),
}));
vi.mock('@/lib/db/assignments', () => ({
  listUpcomingAssignments: vi.fn(async () => einsaetze),
}));
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-09-24' };
});

const plaene: { wert: { id: string; projectId: string; pfad: string; dateiname: string; mime: string; bytes: number }[] } = { wert: [] };
let plaeneScheitern = false;
vi.mock('@/lib/db/baustellenDokumente', () => ({
  listDokumente: vi.fn(async (_c: string, ids: string[]) => {
    if (plaeneScheitern) throw new Error('kein Netz');
    return plaene.wert.filter((d) => ids.includes(d.projectId));
  }),
  dokumentAdressen: vi.fn(async (d: { pfad: string }[]) => new Map(d.map((x) => [x.pfad, `https://speicher/${x.pfad}`]))),
  GUELTIG_SEKUNDEN: 3600,
}));

const NUTZER = {
  uid: 'm1',
  email: 'max@perl.at',
  name: 'Max Mustermann',
  role: 'Mitarbeiter' as const,
  companyId: 'perl',
  docId: 'm1',
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: NUTZER }) }));

const { default: MyProjectsView } = await import('@/features/projects/MyProjectsView');

const baustelle = (over: Partial<Project> = {}): Project =>
  ({
    id: 'p1',
    companyId: 'perl',
    projectNumber: '2026-001',
    customerName: 'Familie Huber',
    status: 'Aktiv',
    address: 'Hauptstraße 12, 2700 Wiener Neustadt',
    contactName: 'Frau Huber',
    contactPhone: '0664 1234567',
    ...over,
  }) as Project;

beforeEach(() => {
  baustellen = [];
  perNummer = [];
  einsaetze = [];
  listProjectsByNumbers.mockClear();
  faellt = false;
  plaene.wert = [];
  plaeneScheitern = false;
  listProjectsForEmployee.mockClear();
});

describe('Meine Baustellen', () => {
  it('führt zur Route und zur Telefonnummer', async () => {
    /*
      Beide sind der Grund, warum diese Ansicht existiert. Als toter Text
      müsste der Monteur die Adresse abtippen — mit dem Telefon in der Hand,
      im Auto.
    */
    baustellen = [baustelle()];
    render(<MyProjectsView />);

    const route = await screen.findByRole('link', { name: /Route:/ });
    expect(route.getAttribute('href')).toContain('Hauptstra');
    expect(screen.getByRole('link', { name: /0664/ }).getAttribute('href')).toBe(
      'tel:06641234567',
    );
  });

  it('mahnt einen fehlenden Ansprechpartner an, statt eine leere Zeile zu zeigen', async () => {
    baustellen = [baustelle({ contactName: undefined, contactPhone: undefined })];
    render(<MyProjectsView />);
    expect(await screen.findByText('Kein Ansprechpartner hinterlegt.')).toBeInTheDocument();
  });

  it('lässt abgeschlossene Baustellen weg', async () => {
    // Eine Arbeitsliste zeigt Arbeit. Was fertig ist, steht im Weg.
    baustellen = [
      baustelle({ id: 'p1', projectNumber: '2026-001', status: 'Aktiv' }),
      baustelle({
        id: 'p2',
        projectNumber: '2026-002',
        customerName: 'Bäckerei Stein',
        status: 'Abgeschlossen',
      }),
    ];
    render(<MyProjectsView />);

    expect(await screen.findByText('Familie Huber')).toBeInTheDocument();
    expect(screen.queryByText('Bäckerei Stein')).not.toBeInTheDocument();
  });

  it('zeigt eine pausierte Baustelle sehr wohl', async () => {
    // Pausiert heisst „kommt wieder", nicht „vorbei".
    baustellen = [baustelle({ status: 'Pausiert' })];
    render(<MyProjectsView />);
    expect(await screen.findByText('Familie Huber')).toBeInTheDocument();
  });

  it('sagt bei leerer Liste auch, wer einteilt', async () => {
    render(<MyProjectsView />);
    expect(
      await screen.findByText(/Die Einteilung macht die Projektleitung/),
    ).toBeInTheDocument();
  });

  it('zeigt „keine Baustelle" als ruhige Zeile, nicht in einer eigenen Karte', async () => {
    render(<MyProjectsView />);
    const satz = await screen.findByText(/Die Einteilung macht die Projektleitung/);
    expect(satz.closest('section')).toBeNull();
  });

  it('unterscheidet einen Ladefehler von „keine Baustellen"', async () => {
    /*
      Beide sehen im Code gleich aus und heissen das Gegenteil. Wer die
      Störung als Aussage liest, fährt nirgendwo hin.
    */
    faellt = true;
    render(<MyProjectsView />);
    expect(await screen.findByText(/kein Netz/)).toBeInTheDocument();
    expect(screen.queryByText(/keinem laufenden Baustelle|auf keiner laufenden Baustelle/)).not.toBeInTheDocument();
  });

  it('nennt Nummer, Zeitraum und kalkulierte Stunden', async () => {
    baustellen = [
      baustelle({ startDate: '2026-08-03', endDate: '2026-08-21', estimatedHours: 40 }),
    ];
    render(<MyProjectsView />);
    const karte = (await screen.findByText('Familie Huber')).closest('section');
    const bereich = within(karte as HTMLElement);
    expect(bereich.getByText('2026-001')).toBeInTheDocument();
    expect(bereich.getByText('03.08.2026 – 21.08.2026')).toBeInTheDocument();
    expect(bereich.getByText('40 h kalkuliert')).toBeInTheDocument();
  });
});

describe('Der Auftragsumfang', () => {
  it('behält seine Zeilen — aus dem Angebot kommt oft eine Liste', async () => {
    baustellen = [baustelle({ description: 'Bad erneuern:\n- WC tauschen\n\nAus Angebot AN-2026-0001' })];
    render(<MyProjectsView />);
    const text = await screen.findByText(/Bad erneuern:/);
    expect(text.textContent).toBe('Bad erneuern:\n- WC tauschen\n\nAus Angebot AN-2026-0001');
    // Ohne diese Klasse fasst der Browser die Umbrüche zu Leerzeichen zusammen.
    expect(text).toHaveClass('whitespace-pre-line');
  });
});

describe('Die Pläne der Baustelle', () => {
  it('stehen an der Karte ihrer Baustelle — und nur dort', async () => {
    baustellen = [baustelle(), baustelle({ id: 'p2', projectNumber: '2026-002', customerName: 'Gemeinde Neudorf' })];
    plaene.wert = [
      { id: 'd1', projectId: 'p1', pfad: 'baustellen/perl/p1/a.pdf', dateiname: 'Grundriss EG.pdf', mime: 'application/pdf', bytes: 2_500_000 },
      { id: 'd2', projectId: 'p1', pfad: 'baustellen/perl/p1/b.jpg', dateiname: 'Foto Schacht.jpg', mime: 'image/jpeg', bytes: 300_000 },
    ];
    render(<MyProjectsView />);
    const link = await screen.findByRole('link', { name: 'Grundriss EG.pdf' });
    const karte = link.closest('section')!;
    expect(within(karte).getByText(/Familie Huber/)).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Foto Schacht.jpg' })).toBeInTheDocument();
    expect(within(karte).getByText(/2,4 MB/)).toBeInTheDocument();
    // Die zweite Baustelle hat keine Pläne — und damit auch keine Rubrik.
    expect(screen.getAllByText('Pläne und Dokumente')).toHaveLength(1);
  });

  it('sagt es, wenn die Pläne nicht geladen werden konnten', async () => {
    baustellen = [baustelle()];
    plaeneScheitern = true;
    render(<MyProjectsView />);
    expect(await screen.findByText(/Die Pläne konnte nicht geladen werden/)).toBeInTheDocument();
  });
});

/**
 * Prüflauf L2 (24.09.2026): eingeteilt heisst für den Monteur zugeordnet.
 * Die Baustelle stand unter „Mein Einsatzplan“, hier aber nicht.
 */
describe('Meine Baustellen — auch aus der Einteilung', () => {
  it('zeigt eine Baustelle, auf die er nur eingeteilt ist, mit dem nächsten Einsatz', async () => {
    perNummer = [baustelle({ id: 'p2', projectNumber: '2026-042', customerName: 'Gemeinde Neudorf' })];
    einsaetze = [
      { projectNumber: '2026-042', date: '2026-10-02' },
      { projectNumber: '2026-042', date: '2026-09-28' },
    ];
    render(<MyProjectsView />);
    expect(await screen.findByText('Gemeinde Neudorf')).toBeInTheDocument();
    expect(screen.getByText('nächster Einsatz 28.09.2026')).toBeInTheDocument();
  });

  it('zeigt eine Baustelle aus Team UND Einteilung nur einmal — und fragt sie nicht doppelt ab', async () => {
    baustellen = [baustelle()];
    einsaetze = [{ projectNumber: '2026-001', date: '2026-09-25' }];
    render(<MyProjectsView />);
    expect(await screen.findAllByText('Familie Huber')).toHaveLength(1);
    expect(listProjectsByNumbers).not.toHaveBeenCalled();
  });

  it('sagt ehrlich, wenn es weder noch gibt', async () => {
    render(<MyProjectsView />);
    expect(await screen.findByText(/auf keiner laufenden Baustelle und hast keinen kommenden Einsatz/)).toBeInTheDocument();
  });
});
