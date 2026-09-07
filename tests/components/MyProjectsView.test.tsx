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
vi.mock('@/lib/db/projects', () => ({
  listProjectsForEmployee: () => listProjectsForEmployee(),
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
  faellt = false;
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

  it('unterscheidet einen Ladefehler von „keine Baustellen"', async () => {
    /*
      Beide sehen im Code gleich aus und heissen das Gegenteil. Wer die
      Störung als Aussage liest, fährt nirgendwo hin.
    */
    faellt = true;
    render(<MyProjectsView />);
    expect(await screen.findByText(/kein Netz/)).toBeInTheDocument();
    expect(screen.queryByText(/keine Baustellen zugeordnet/)).not.toBeInTheDocument();
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
