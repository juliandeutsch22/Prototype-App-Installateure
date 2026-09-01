import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@/types';

/**
 * Diese Komponente ist die Antwort auf einen konkreten Fehler: das
 * Auswahlfeld für die Baustelle stand leer da, mit nichts darin außer
 * „— wählen —", und der Benutzer hatte keinen Anhaltspunkt, warum.
 *
 * Die Ursache war jedes Mal ein `catch(() => undefined)` um die Abfrage.
 * Damit sahen vier verschiedene Lagen identisch aus: es lädt noch, es ist
 * schiefgegangen, es gibt keine laufende Baustelle, es gibt gar keine. Die
 * Tests halten fest, dass sie sich jetzt unterscheiden.
 */

const aktiv: (Project & { id: string })[] = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-001', customerName: 'Familie Huber', status: 'Aktiv' },
];
const alle: (Project & { id: string })[] = [
  {
    id: 'p2',
    companyId: 'perl',
    projectNumber: 'B-900',
    customerName: 'Gemeinde Neudorf',
    status: 'Abgeschlossen',
  },
];

const listActiveProjects = vi.fn(async () => aktiv);
const listRecentProjects = vi.fn(async () => alle);
const listProjectsByNumbers = vi.fn(async () => alle);

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: () => listActiveProjects(),
  listRecentProjects: () => listRecentProjects(),
  listProjectsByNumbers: () => listProjectsByNumbers(),
}));

const { default: BaustellenSelect } = await import('@/components/BaustellenSelect');

beforeEach(() => {
  listActiveProjects.mockClear().mockResolvedValue(aktiv);
  listRecentProjects.mockClear().mockResolvedValue(alle);
  listProjectsByNumbers.mockClear().mockResolvedValue(alle);
});

describe('Baustellenauswahl', () => {
  it('zeigt die laufenden Baustellen', async () => {
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);
    expect(await screen.findByRole('option', { name: /Familie Huber/ })).toBeInTheDocument();
    expect(listRecentProjects).not.toHaveBeenCalled();
  });

  it('weicht auf den Gesamtbestand aus, wenn nichts laeuft', async () => {
    listActiveProjects.mockResolvedValue([]);
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);

    /**
     * Ein Betrieb, dessen Baustellen alle auf „Abgeschlossen" stehen, bekam
     * vorher ein leeres Feld. Ein Schein wird aber auch für eine gerade
     * abgeschlossene Baustelle nachgereicht — und wer eine wählt, soll sehen,
     * dass er das gerade tut.
     */
    expect(await screen.findByRole('option', { name: /Gemeinde Neudorf/ })).toBeInTheDocument();
    expect(screen.getByText(/Keine laufende Baustelle/)).toBeInTheDocument();
  });

  it('sagt es, wenn ueberhaupt keine Baustelle angelegt ist', async () => {
    listActiveProjects.mockResolvedValue([]);
    listRecentProjects.mockResolvedValue([]);
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);
    expect(await screen.findByText(/noch keine Baustelle angelegt/)).toBeInTheDocument();
  });

  it('meldet einen Fehler als Fehler und bietet einen zweiten Versuch', async () => {
    const nutzer = userEvent.setup();
    listActiveProjects.mockRejectedValueOnce(new Error('offline'));
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);

    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('option', { name: /Familie Huber/ })).toBeInTheDocument();
  });

  it('laedt eine vorgegebene Baustelle nach, die nicht in der Liste steht', async () => {
    const gemeldet = vi.fn();
    // B-900 ist abgeschlossen, steht also nicht in der Liste der laufenden.
    render(<BaustellenSelect companyId="perl" value="B-900" onChange={gemeldet} />);

    /**
     * Ohne das Nachladen bliebe die Nummer gesetzt, der Datensatz aber
     * unbekannt — und die aufrufende Ansicht hätte einen Knopf, der
     * anklickbar aussieht und beim Drücken kommentarlos nichts tut. Genau
     * dieser Fall entsteht bei jedem Link aus der Baustellenliste auf einen
     * abgeschlossenen Auftrag.
     */
    await screen.findByRole('option', { name: /Gemeinde Neudorf/ });
    expect(gemeldet).toHaveBeenCalledWith(
      'B-900',
      expect.objectContaining({ projectNumber: 'B-900' }),
    );
  });
});
