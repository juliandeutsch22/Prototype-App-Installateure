import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Invoice, Project, Quote, TimeEntry } from '@/types';

/**
 * Die Nachkalkulation — die einzige Ansicht der App, an der jemand
 * Preisentscheidungen festmacht.
 *
 * Die Rechenkerne (`nachkalkulation.ts`) waren geprüft, die Ansicht nicht.
 * Genau dazwischen liegt der Fehler, den kein Rechen-Test findet: eine
 * richtige Formel, die mit der falschen Zahl gefüttert wird. Diese Datei
 * prüft die VERDRAHTUNG — welche Kostensätze ankommen, welche Baustellen
 * gerechnet werden, und was dasteht, wenn nichts gerechnet werden kann.
 */

const RATES = {
  fach: 60, helper: 40, nightSurcharge: 0.5, emergencySurcharge: 1,
  vatRate: 0.2, dueDays: 14,
};

let firma: Partial<Company> = {
  id: 'perl',
  name: 'Perl Installationen',
  rates: RATES,
  costRates: { fach: 40, helper: 25 },
};

const projekt = (nr: string, status: Project['status'] = 'Abgeschlossen'): Project & { id: string } =>
  ({
    id: `p-${nr}`,
    companyId: 'perl',
    projectNumber: nr,
    customerName: `Kunde ${nr}`,
    status,
  }) as Project & { id: string };

const stunden = (nr: string, anzahl: number): (TimeEntry & { id: string })[] =>
  Array.from({ length: anzahl }, (_, i) => ({
    id: `t-${nr}-${i}`,
    companyId: 'perl',
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '15:00',
    breakDuration: 0,
    userId: 'u1',
    userName: 'Max Mustermann',
    projectNumber: nr,
  })) as (TimeEntry & { id: string })[];

const rechnung = (nr: string, netto: number): Invoice & { id: string } =>
  ({
    id: `r-${nr}`,
    companyId: 'perl',
    invoiceNumber: `RE-2026-${nr}`,
    projectNumber: nr,
    customerName: `Kunde ${nr}`,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-14',
    totalNetto: netto,
    totalVat: netto * 0.2,
    totalBrutto: netto * 1.2,
    paymentStatus: 'Offen',
  }) as unknown as Invoice & { id: string };

let projekte: (Project & { id: string })[] = [];
let eintraege: (TimeEntry & { id: string })[] = [];
let rechnungen: (Invoice & { id: string })[] = [];
let angebote: (Quote & { id: string })[] = [];

const listEntriesForProjects = vi.fn<[string, string[]], Promise<(TimeEntry & { id: string })[]>>(
  async () => eintraege,
);

vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: vi.fn(async () => projekte),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: (c: string, n: string[]) => listEntriesForProjects(c, n),
}));
vi.mock('@/lib/db/quotes', () => ({ listRecentQuotes: vi.fn(async () => angebote) }));
vi.mock('@/lib/db/invoices', () => ({
  subscribeRecentInvoices: (
    _c: string,
    _max: number,
    cb: (rows: (Invoice & { id: string })[]) => void,
  ) => {
    cb(rechnungen);
    return () => undefined;
  },
}));

/*
  Nutzer als EIN Objekt, nicht je Rendern ein neues: die Ansicht hängt zwei
  Effekte daran. Ein Objektliteral im Doppelgänger liesse sie endlos laufen —
  in dieser Sitzung schon zweimal passiert.
*/
const NUTZER = {
  uid: 'chef',
  email: 'chefin@perl.at',
  name: 'Julian Deutsch',
  role: 'Geschäftsführung' as const,
  companyId: 'perl',
  docId: 'chef',
};
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: NUTZER, company: firma }),
}));

const { default: NachkalkulationView } = await import(
  '@/features/costing/NachkalkulationView'
);

function zeige() {
  return render(
    <MemoryRouter>
      <NachkalkulationView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  firma = {
    id: 'perl',
    name: 'Perl Installationen',
    rates: RATES,
    costRates: { fach: 40, helper: 25 },
  };
  projekte = [];
  eintraege = [];
  rechnungen = [];
  angebote = [];
  listEntriesForProjects.mockClear();
});

describe('Ohne interne Kostensätze', () => {
  it('rechnet die Ansicht gar nicht erst', async () => {
    /*
      DER KERN. Mit dem Verrechnungssatz als Kosten ergäbe jede Baustelle
      glatt null — und das sähe aus wie ein Ergebnis. Deshalb wird nicht
      gerechnet, sondern gesagt, was fehlt.
    */
    firma = { ...firma, costRates: undefined };
    projekte = [projekt('2026-001')];
    zeige();

    expect(await screen.findByText('Kostensätze fehlen')).toBeInTheDocument();
    expect(listEntriesForProjects).not.toHaveBeenCalled();
    expect(screen.queryByText('Ergebnis je Baustelle')).not.toBeInTheDocument();
  });

  it('nennt den Weg dorthin vollständig', async () => {
    // „In den Einstellungen hinterlegen" hat aus dem Betrieb die Rückmeldung
    // ausgelöst, es gäbe kein solches Feld. Jetzt steht der ganze Pfad da.
    firma = { ...firma, costRates: undefined };
    zeige();
    const link = await screen.findByRole('link', { name: /Interne Kostensätze/ });
    expect(link.getAttribute('href')).toBe('/settings/saetze');
  });
});

describe('Mit Kostensätzen', () => {
  it('rechnet Erlös minus Personalkosten', async () => {
    // Eine Baustelle, 2 Tage à 8 h Facharbeit = 16 h. Kosten 16 × 40 = 640 €.
    // Erlös aus der Rechnung: 2.000 € netto. Deckungsbeitrag 1.360 €.
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    zeige();

    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li');
    /*
      Ohne Tausendertrennzeichen verglichen: `Intl` setzt in dieser Laufzeit
      ein geschütztes Leerzeichen (U+00A0), nicht den Punkt — nach ÖNORM
      richtig, aber von den Gebietsdaten der Umgebung abhängig. Geprüft wird
      der BETRAG, nicht seine Schreibweise.
    */
    const text = (zeile as HTMLElement).textContent?.replace(/[\s\u00A0.]/g, '') ?? '';
    expect(text).toContain('640,00');
    expect(text).toContain('1360,00');
    expect(text).toContain('ErlösausRechnungen');
  });

  it('nimmt die KOSTENsätze, nicht die Verrechnungssätze', async () => {
    /*
      DER FEHLER, DEN KEIN RECHEN-TEST FINDET: die Formel stimmt, aber die
      Ansicht reicht die falsche Zahl hinein. Mit dem Verrechnungssatz (60 €)
      stünden hier 960 € Personalkosten statt 640 € — und die Marge wäre um
      ein Drittel zu niedrig.
    */
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    zeige();

    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li');
    const text = (zeile as HTMLElement).textContent?.replace(/[\s\u00A0.]/g, '') ?? '';
    expect(text).not.toContain('960,00');
  });

  it('sagt es, wenn kein Erlös hinterlegt ist — statt null zu rechnen', async () => {
    projekte = [projekt('2026-002')];
    eintraege = stunden('2026-002', 1);
    zeige();

    const zeile = (await screen.findByText(/Kunde 2026-002/)).closest('li');
    const bereich = within(zeile as HTMLElement);
    expect(bereich.getByText(/kein Erlös hinterlegt/)).toBeInTheDocument();
    expect(bereich.getByText('keine Aussage')).toBeInTheDocument();
  });

  it('stellt die schlechteste Baustelle nach oben', async () => {
    /*
      Eine Auswertung ist eine Arbeitsliste: oben steht, worum man sich
      kümmern muss. Nach Nummer sortiert stünde die schlechteste irgendwo.
    */
    projekte = [projekt('2026-001'), projekt('2026-002')];
    eintraege = [...stunden('2026-001', 2), ...stunden('2026-002', 2)];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-002', 700)];
    zeige();

    await screen.findByText(/Kunde 2026-001/);
    const zeilen = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    // 700 € Erlös bei 640 € Kosten ist die dünnere Baustelle.
    expect(zeilen[0]).toContain('Kunde 2026-002');
  });

  it('warnt beim Zwischenstand laufender Baustellen', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-003', 'Aktiv')];
    zeige();
    await screen.findByText('Ergebnis je Baustelle');

    await nutzer.selectOptions(screen.getByLabelText('Baustellen'), 'Aktiv');
    expect(
      await screen.findByText(/Zwischenstand — es kommen noch Stunden dazu/),
    ).toBeInTheDocument();
  });

  it('warnt, dass Deckungsbeitrag kein Gewinn ist', async () => {
    // Material fehlt in dieser Rechnung vollständig. Wer den Deckungsbeitrag
    // als Gewinn liest, hält eine dünne Baustelle für tragfähig.
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 1);
    rechnungen = [rechnung('2026-001', 1000)];
    zeige();
    expect(await screen.findByText(/Deckungsbeitrag, nicht Gewinn/)).toBeInTheDocument();
  });

  it('sagt bei leerer Auswahl, dass nichts da ist', async () => {
    zeige();
    expect(await screen.findByText('Keine Baustelle in dieser Auswahl.')).toBeInTheDocument();
  });
});
