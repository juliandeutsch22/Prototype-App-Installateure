import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Role } from '@/types';
import type { Lauf, LaufArt } from '@shared/laufStatus';

/**
 * Die Meldung über einen ausgefallenen Nachtlauf.
 *
 * DER PUNKT DIESER DATEI: sie erscheint NUR, wenn etwas ist. Eine dauerhafte
 * grüne Kachel „alles in Ordnung" wäre nach zwei Wochen unsichtbar — und mit
 * ihr die eine Meldung, auf die es ankommt.
 */

const STUNDE = 3_600_000;
let laeufe: Partial<Record<LaufArt, Lauf>> = {};

const ladeLauf = vi.fn(async (_c: string, art: LaufArt) => laeufe[art]);
vi.mock('@/lib/db/laeufe', () => ({ ladeLauf: (c: string, a: LaufArt) => ladeLauf(c, a) }));

const authWert = {
  user: { uid: 'chef', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as Role },
  company: { id: 'perl', name: 'Perl' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: LaufWarnung } = await import('@/features/dashboard/LaufWarnung');

function zeige() {
  return render(
    <MemoryRouter>
      <LaufWarnung />
    </MemoryRouter>,
  );
}

function lauf(art: LaufArt, stundenHer: number): Lauf {
  return { companyId: 'perl', art, zuletztErfolg: Date.now() - stundenHer * STUNDE, erfolg: true };
}

beforeEach(() => {
  laeufe = {};
  ladeLauf.mockClear();
  authWert.user.role = 'Geschäftsführung';
});

describe('Wenn alles läuft', () => {
  it('steht gar nichts da', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 6), bilanzen: lauf('bilanzen', 5) };
    const { container } = zeige();
    // ERST WARTEN, BIS GELADEN IST. Am Anfang ist ohnehin nichts da; eine
    // Zusicherung darauf ginge durch, ohne je etwas geprüft zu haben — genau
    // das ist mir hier beim ersten Anlauf passiert.
    await waitFor(() => expect(ladeLauf).toHaveBeenCalledTimes(2));
    // Nicht „grün melden": eine Kachel, die immer da ist, sieht nach zwei
    // Wochen niemand mehr.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('Wenn ein Lauf ausbleibt', () => {
  it('meldet sich mit dem Weg dorthin', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 80), bilanzen: lauf('bilanzen', 4) };
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sicherung');
    expect(screen.getByRole('link', { name: 'Zur Datensicherung' })).toBeInTheDocument();
    // Der Bilanzlauf ist in Ordnung und wird deshalb nicht mitgenannt.
    expect(screen.queryByText(/Bilanzlauf/)).not.toBeInTheDocument();
  });

  it('nennt beide, wenn beide ausbleiben', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 80), bilanzen: lauf('bilanzen', 80) };
    zeige();
    expect(await screen.findByText('Zwei nächtliche Läufe stehen aus')).toBeInTheDocument();
  });

  it('meldet auch den Lauf, von dem NICHTS bekannt ist', async () => {
    /*
      Der gefährlichste Fall und der Grund für diesen Test. Ein Betrieb ohne
      Aufzeichnung sieht in den Daten genauso aus wie einer, bei dem nie etwas
      lief — und beides heisst: es gibt keine Sicherung, von der jemand weiss.
      Ihn zu verschweigen wäre die stillste Art, eine fehlende Sicherung zu
      verstecken.
    */
    laeufe = { bilanzen: lauf('bilanzen', 4) };
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent('noch nie');
  });
});

describe('Wer sie sieht', () => {
  it('die Geschäftsführung und die Administration', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    zeige();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('der Monteur NICHT', async () => {
    /*
      Er kann an einer ausgefallenen Sicherung nichts ändern; eine Meldung auf
      seinem Telefon wäre eine Beunruhigung ohne Handlungsmöglichkeit. Die
      Rules sehen das genauso — er darf den Zustand gar nicht lesen, die
      Abfrage liefe für ihn ohnehin ins Leere.
    */
    authWert.user.role = 'Mitarbeiter';
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    const { container } = zeige();
    /*
      Geprüft wird, dass GAR NICHT GELADEN wird — nicht, dass nichts
      dasteht. „Nichts da" ist der Anfangszustand und beweist nichts; die
      Zusicherung ginge durch, bevor der Effekt gelaufen ist.
    */
    await Promise.resolve();
    expect(ladeLauf).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('die Projektleitung auch nicht', async () => {
    authWert.user.role = 'Projektleiter';
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    const { container } = zeige();
    await Promise.resolve();
    expect(ladeLauf).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
