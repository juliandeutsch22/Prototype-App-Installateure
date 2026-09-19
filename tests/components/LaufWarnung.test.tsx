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
    laeufe = { ausleitung: lauf('ausleitung', 6) };
    const { container } = zeige();
    // ERST WARTEN, BIS GELADEN IST. Am Anfang ist ohnehin nichts da; eine
    // Zusicherung darauf ginge durch, ohne je etwas geprüft zu haben — genau
    // das ist mir hier beim ersten Anlauf passiert.
    await waitFor(() => expect(ladeLauf).toHaveBeenCalledTimes(1));
    // Nicht „grün melden": eine Kachel, die immer da ist, sieht nach zwei
    // Wochen niemand mehr.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('Wenn ein Lauf ausbleibt', () => {
  it('meldet sich mit dem Weg dorthin', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sicherung');
    expect(screen.getByRole('link', { name: 'Zur Datensicherung' })).toBeInTheDocument();
  });

  it('in der Einzahl, solange es nur einen Lauf gibt', async () => {
    /*
      BIS ZUM 19.09. STAND HIER DAS GEGENTEIL: „nennt beide, wenn beide
      ausbleiben". Es gab zwei Nachtläufe — die Sicherung und den Bilanzlauf,
      der die Monatssummen vorrechnete. Unter Postgres ist die Monatsbilanz
      eine Sicht; es gibt nur noch einen Lauf.

      Die Mehrzahl steht in der Ansicht weiterhin da und ist RICHTIG so: sie
      ist die Regel für eine Liste, nicht ein Schalter für einen zweiten Lauf.
      Kommt je einer dazu, soll die Überschrift von selbst stimmen. Bis dahin
      hält diese Zeile fest, dass die Einzahl erscheint — und fällt, sobald
      jemand einen zweiten Lauf einträgt, ohne die Prüfungen mitzunehmen.
    */
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    zeige();
    expect(await screen.findByText('Ein nächtlicher Lauf steht aus')).toBeInTheDocument();
    expect(screen.queryByText(/Läufe stehen aus/)).not.toBeInTheDocument();
  });

  it('meldet auch den Lauf, von dem NICHTS bekannt ist', async () => {
    /*
      Der gefährlichste Fall und der Grund für diesen Test. Ein Betrieb ohne
      Aufzeichnung sieht in den Daten genauso aus wie einer, bei dem nie etwas
      lief — und beides heisst: es gibt keine Sicherung, von der jemand weiss.
      Ihn zu verschweigen wäre die stillste Art, eine fehlende Sicherung zu
      verstecken.
    */
    laeufe = {};
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

describe('Den Bilanzlauf gibt es nicht mehr', () => {
  /*
    DER BEFUND AUS DEM BETRIEB. Auf der Startseite stand dauerhaft „Ein
    nächtlicher Lauf steht aus", verlinkt auf die Monatsbilanzen. Er war
    tatsächlich nie durchgelaufen und wird es nie: `monthly_stats` ist eine
    SICHT, es gibt nichts nachzuziehen, keinen Lauf und keinen Eintrag in
    `cron`. Die Einstellungen sagten das auch so — nur die Startseite fragte
    weiter danach.

    Eine Warnung, die niemand abstellen kann, ist schlimmer als keine: sie
    bringt einem bei, die Stelle zu übersehen, an der eines Tages die
    ausgefallene SICHERUNG steht.
  */
  it('fragt gar nicht erst nach ihm', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 6) };
    zeige();
    await waitFor(() => expect(ladeLauf).toHaveBeenCalledTimes(1));
    expect(ladeLauf).toHaveBeenCalledWith('perl', 'ausleitung');
  });

  it('schweigt, wenn die Sicherung läuft — auch ohne jede Bilanz-Aufzeichnung', async () => {
    laeufe = { ausleitung: lauf('ausleitung', 6) };
    const { container } = zeige();
    await waitFor(() => expect(ladeLauf).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe('');
  });

  it('meldet die Sicherung weiterhin, wenn sie ausbleibt', async () => {
    // Das Wegnehmen darf nicht das Falsche mitnehmen.
    laeufe = { ausleitung: lauf('ausleitung', 80) };
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sicherung');
    expect(screen.queryByRole('link', { name: 'Zu den Monatsbilanzen' })).not.toBeInTheDocument();
  });
});
