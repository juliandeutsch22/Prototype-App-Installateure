import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
  it('kennzeichnet eine Pflichtauswahl und sagt selbst, was fehlt', async () => {
    /*
      Prüflauf 24.09.2026, F6: die Zeitmaske liess sich ohne Baustelle nicht
      speichern, aber das Feld trug keinen Stern, und der Browser meldete
      nur „ein Element auswählen" — in seiner Sprache, nicht in der der App.
    */
    function Maske() {
      const [nr, setNr] = useState('');
      return (
        <form>
          <BaustellenSelect companyId="perl" value={nr} onChange={setNr} required />
        </form>
      );
    }
    const { container } = render(<Maske />);
    const feld = (await screen.findByLabelText('Baustelle')) as HTMLSelectElement;
    await screen.findByRole('option', { name: /Familie Huber/ });
    expect(feld).toHaveAttribute('aria-required', 'true');
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).toBe('*');

    expect(feld.checkValidity()).toBe(false);
    expect(feld.validationMessage).toBe('Bitte eine Baustelle wählen.');

    // Wer wählt, ist die Meldung los — sonst bliebe das Feld für immer ungültig.
    await userEvent.selectOptions(feld, 'B-001');
    expect(feld.validationMessage).toBe('');
    expect(feld.checkValidity()).toBe(true);
  });

  it('ohne Pflicht kein Stern', async () => {
    const { container } = render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);
    await screen.findByRole('option', { name: /Familie Huber/ });
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

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

/**
 * WENN DIE AUSWAHL AN IHRER GRENZE ENDET.
 *
 * `listActiveProjects` galt lange als begrenzt, weil sie auf „Aktiv" und
 * „Pausiert" filtert — abgeschlossene fallen weg, und die machen mit der Zeit
 * den Grossteil aus. Das stimmt, und es ist trotzdem keine Grenze: die Zahl
 * der OFFENEN Baustellen wächst nicht mit der Zeit, wohl aber mit dem
 * Betrieb, und sie wird nie wieder kleiner.
 *
 * Ein Auswahlfeld ist dabei der unangenehmste Ort für eine Grenze: es sieht
 * vollständig aus, egal wie viel fehlt. Wer seine Baustelle nicht findet,
 * bucht auf eine andere.
 */
describe('Baustellenauswahl — Reihenfolge (Launch-Check 25.09.2026, R2)', () => {
  const drei: (Project & { id: string })[] = [
    // Die Nummern laufen absichtlich GEGEN die Kunden — sonst bewiese die
    // Reihenfolge nichts.
    { id: 'a', companyId: 'perl', projectNumber: 'B-1', customerName: 'Zach GmbH', status: 'Aktiv' },
    { id: 'b', companyId: 'perl', projectNumber: 'B-3', customerName: 'Aigner', status: 'Aktiv', assignedEmployees: ['max'] },
    { id: 'c', companyId: 'perl', projectNumber: 'B-2', customerName: 'Müller', status: 'Aktiv' },
  ];
  const beschriftungen = () =>
    screen.getAllByRole('option').map((o) => o.textContent).filter((t) => t !== '— wählen —');

  it('sortiert nach dem Kunden, statt die Reihenfolge der Datenbank zu zeigen', async () => {
    listActiveProjects.mockResolvedValue(drei);
    render(<BaustellenSelect companyId="perl" value="" onChange={() => undefined} />);
    await screen.findByText('Aigner (B-3)');
    expect(beschriftungen()).toEqual(['Aigner (B-3)', 'Müller (B-2)', 'Zach GmbH (B-1)']);
  });

  it('stellt die eigenen Baustellen in einer Gruppe nach oben — die übrigen bleiben wählbar', async () => {
    listActiveProjects.mockResolvedValue(drei);
    const { container } = render(
      <BaustellenSelect companyId="perl" value="" onChange={() => undefined} meineUid="max" />,
    );
    await screen.findByText('Aigner (B-3)');
    const gruppen = [...container.querySelectorAll('optgroup')].map((g) => g.label);
    expect(gruppen).toEqual(['Meine Baustellen', 'Weitere laufende Baustellen']);
    expect(beschriftungen()).toEqual(['Aigner (B-3)', 'Müller (B-2)', 'Zach GmbH (B-1)']);
  });

  it('ohne eigene Baustelle bleibt es bei einer Gruppe', async () => {
    listActiveProjects.mockResolvedValue(drei);
    const { container } = render(
      <BaustellenSelect companyId="perl" value="" onChange={() => undefined} meineUid="niemand" />,
    );
    await screen.findByText('Aigner (B-3)');
    expect([...container.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Laufende Baustellen']);
  });
});

describe('Baustellenauswahl — wenn die Grenze greift', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `v${i}`,
        companyId: 'perl',
        projectNumber: `2026-${String(i).padStart(3, '0')}`,
        customerName: `Kunde ${i}`,
        status: 'Aktiv',
      }) as Project & { id: string },
    );

  it('sagt es, sobald die Grenze erreicht ist', async () => {
    listActiveProjects.mockResolvedValue(viele(500));
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);

    expect(await screen.findByText(/nur die ersten 500 laufenden Baustellen/)).toBeInTheDocument();
  });

  it('schweigt bei einem gewöhnlichen Betrieb', async () => {
    // Achtzig laufende Baustellen sind viel — und weit unter der Grenze. Ein
    // Hinweis, der dort erschiene, wäre täglicher Lärm über dem Feld, das der
    // Monteur bei jeder Buchung bedient.
    listActiveProjects.mockResolvedValue(viele(80));
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);

    await screen.findByText(/Kunde 0/);
    expect(screen.queryByText(/nur die ersten/)).not.toBeInTheDocument();
  });

  it('verwechselt den Ausweichweg nicht mit der Grenze', async () => {
    /*
      Gibt es keine laufende Baustelle, weicht die Komponente auf die zuletzt
      angelegten aus — und die bringen ihre EIGENE Grenze mit. Dort „nur die
      ersten 500 laufenden" zu behaupten wäre schlicht falsch: laufend ist
      keine davon.
    */
    listActiveProjects.mockResolvedValue([]);
    listRecentProjects.mockResolvedValue(viele(500));
    render(<BaustellenSelect companyId="perl" value="" onChange={vi.fn()} />);

    expect(await screen.findByText(/Keine laufende Baustelle/)).toBeInTheDocument();
    expect(screen.queryByText(/nur die ersten/)).not.toBeInTheDocument();
  });
});
