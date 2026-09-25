import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Invoice, Material, Project, Quote, TimeEntry, WorkSheet } from '@/types';
import { mitSchreibtisch } from './schreibtisch';

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

/*
  DIE GRENZE IM TEST KLEIN HALTEN.

  Die echte steht bei tausend. Tausend Zeilen zu rendern, nur um zu prüfen,
  DASS die Ansicht die Grenze weiterreicht, kostete auf dem Läufer über fünf
  Sekunden — der Test lief in die Zeitgrenze. Geprüft wird hier die
  Verdrahtung, nicht der Zahlenwert; der steht in
  `tests/unit/listengrenzen.test.ts`.
*/
vi.mock('@/lib/listengrenzen', () => ({
  KATALOG_GRENZE: 3,
  KUNDEN_GRENZE: 500,
  BAUSTELLEN_AUSWAHL_GRENZE: 500,
  abgeschnitten: (z: readonly unknown[], g: number) => z.length >= g,
  katalogAbgeschnitten: (z: readonly unknown[], g = 3) => z.length >= g,
  kundenAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
  baustellenAuswahlAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
}));

vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: vi.fn(async () => projekte),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: (c: string, n: string[]) => listEntriesForProjects(c, n),
}));
vi.mock('@/lib/db/quotes', () => ({ listRecentQuotes: vi.fn(async () => angebote) }));

/*
  Material zählt seit dem 07.09.2026 mit. Die Ansicht holt dafür den
  Materialstamm (die Einkaufspreise) und je Baustelle die unterschriebenen
  Handwerksscheine (die Mengen).
*/
let katalog: Material[] = [];
let scheine: Array<WorkSheet & { id: string }> = [];
const listWorkSheetsForProject = vi.fn(async () => scheine);
vi.mock('@/lib/db/materials', () => ({ listMaterials: vi.fn(async () => katalog) }));
vi.mock('@/lib/db/workSheets', () => ({
  listWorkSheetsForProject: () => listWorkSheetsForProject(),
}));
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
  katalog = [];
  scheine = [];
  eintraege = [];
  rechnungen = [];
  angebote = [];
  listEntriesForProjects.mockClear();
  listWorkSheetsForProject.mockClear();
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

  it('beginnt bei den laufenden, solange keine Baustelle abgeschlossen ist', async () => {
    // Prüflauf 24.09.2026, L7: ein neuer Betrieb sah „Keine Baustelle in
    // dieser Auswahl", obwohl laufende Baustellen Zahlen hätten.
    projekte = [projekt('2026-003', 'Aktiv')];
    zeige();
    await waitFor(() => expect(screen.getByLabelText('Baustellen')).toHaveValue('Aktiv'));
    expect(await screen.findByText(/Zwischenstand — es kommen noch Stunden dazu/)).toBeInTheDocument();
  });

  it('bleibt bei „Abgeschlossen", sobald es eine abgeschlossene gibt', async () => {
    projekte = [projekt('2026-001'), projekt('2026-003', 'Aktiv')];
    zeige();
    await screen.findByText('Ergebnis je Baustelle');
    expect(screen.getByLabelText('Baustellen')).toHaveValue('Abgeschlossen');
  });

  it('sagt bei leerer Auswahl, dass nichts da ist', async () => {
    zeige();
    expect(await screen.findByText('Keine Baustelle in dieser Auswahl.')).toBeInTheDocument();
  });
});

/**
 * Material in der Ansicht — die Verdrahtung, nicht die Rechnung.
 *
 * Dass `materialkosten()` richtig rechnet, steht in `tests/unit`. Hier geht es
 * um die Naht davor und danach: kommt der Materialstamm überhaupt an, werden
 * die Scheine je Baustelle geholt, und steht das Ergebnis so da, dass jemand
 * die Lücke sieht, statt sie für eine Null zu halten.
 */
describe('Material im Ergebnis', () => {
  it('zieht es ab und schreibt es in die Zeile', async () => {
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0, einkaufspreis: 3.5 } as Material];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Eckventil', menge: 100 }],
      } as unknown as WorkSheet & { id: string },
    ];
    zeige();

    const zeile = await screen.findByText(/− Material/);
    // Erlös 2000 − Personal 0 − Material 350 = 1650. Die Zahl selbst zählt:
    // stünde hier 2000, wäre das Material zwar geholt, aber nicht abgezogen.
    expect(zeile.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('1650,00');
  });

  it('sagt es, wenn der Materialstamm nur bis zur Grenze geladen wurde', async () => {
    /*
      Material wird über den NAMEN zugeordnet, nicht über eine Kennung — ein
      Artikel, der wegen der Obergrenze fehlt, findet seinen Einkaufspreis
      nicht. Falsch wird die Zahl dadurch nicht: der Artikel landet in „ohne
      Einkaufspreis" und steht sichtbar da. Aber der GRUND wäre ein anderer
      als sonst, und wer ihm nachginge, suchte im Materialstamm nach einer
      Pflege, die längst da ist.
    */
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = Array.from({ length: 3 }, (_, i) =>
      ({ id: `m${i}`, companyId: 'perl', name: `Artikel ${i}`, stock: 0 }) as Material,
    );
    zeige();

    expect(await screen.findByText(/nur bis zur Obergrenze geladen/)).toBeInTheDocument();
  });

  it('schweigt dazu, solange der Stamm vollständig ist', async () => {
    // Ein Hinweis, der bei jedem gewöhnlichen Katalog erschiene, wäre Lärm.
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0 } as Material];
    zeige();

    // Auf das Ende des Ladens warten, sonst prüft die Zusicherung eine Seite,
    // die noch gar nichts behauptet.
    await screen.findByText(/Nachkalkulation/);
    await waitFor(() =>
      expect(screen.queryByText(/nur bis zur Obergrenze geladen/)).not.toBeInTheDocument(),
    );
  });

  it('nennt Artikel ohne Einkaufspreis, statt sie mit null anzusetzen', async () => {
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Spezialdichtung', menge: 2 }],
      } as unknown as WorkSheet & { id: string },
    ];
    zeige();

    expect(await screen.findByText(/Spezialdichtung/)).toBeInTheDocument();
    expect(screen.getByText(/Deckungsbeitrag ist um diesen Betrag zu hoch/)).toBeInTheDocument();
    // Und keine Materialzeile: es ist nichts eingerechnet worden, ein
    // „− Material 0,00 €" läse sich wie „kein Material verbaut".
    expect(screen.queryByText(/− Material/)).not.toBeInTheDocument();
  });

  it('holt die Scheine je Baustelle, nicht einmal für alle', async () => {
    // Die Abfrage kann nur je Baustelle gestellt werden. Dass es genau so
    // viele sind wie angezeigte Baustellen, ist die Wachstumsbremse: die
    // Obergrenze von 25 gilt damit auch hier.
    projekte = [projekt('2026-001'), projekt('2026-002')];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-002', 2000)];
    zeige();

    await screen.findAllByText(/Kunde 2026-00/);
    expect(listWorkSheetsForProject).toHaveBeenCalledTimes(2);
  });

  it('rechnet weiter, wenn die Scheine einer Baustelle nicht ladbar sind', async () => {
    /*
      Die Scheine sind eine ZUSATZangabe. Fiele die ganze Auswertung aus, weil
      eine Abfrage scheitert, wäre die Ansicht bei jedem Rechteproblem leer —
      der Deckungsbeitrag vor Material ist immer noch eine Auskunft.
    */
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    listWorkSheetsForProject.mockRejectedValueOnce(new Error('nicht lesbar'));
    zeige();

    // Nicht /Erlös/: so heisst auch die Überschrift der Karte.
    const zeile = await screen.findByText(/− Personal/);
    expect(zeile.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('2000,00');
    expect(screen.queryByText(/− Material/)).not.toBeInTheDocument();
  });
});

describe('Nachkalkulation am Schreibtisch', () => {
  const schreibtisch = mitSchreibtisch();

  it('stellt die Beträge als Spalten nebeneinander, die schlechteste Baustelle oben', async () => {
    projekte = [projekt('2026-001'), projekt('2026-002')];
    eintraege = [...stunden('2026-001', 2), ...stunden('2026-002', 2)];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-002', 700)];
    schreibtisch();
    zeige();

    const zeile = await screen.findByRole('row', { name: /Kunde 2026-001/ });
    const t = zeile.closest('table')!;
    expect(within(t).getAllByRole('columnheader').map((k) => k.textContent)).toEqual([
      'Baustelle', 'Erlös', 'Personal', 'Material', 'Deckungsbeitrag', 'Marge',
    ]);
    // Erlös 2000, Personal 640, kein Material, Deckungsbeitrag 1360 — je in
    // einer eigenen Zelle. Ohne Tausendertrennzeichen verglichen, siehe oben.
    const zellen = within(zeile)
      .getAllByRole('cell')
      .map((z) => z.textContent?.replace(/[\s\u00A0.]/g, ''));
    expect(zellen.slice(1, 5)).toEqual(['€2000,00', '€640,00', '–', '€1360,00']);
    expect(zeile).toHaveTextContent('Erlös aus Rechnungen');

    const reihen = within(t).getAllByRole('row').slice(1);
    expect(reihen[0]).toHaveTextContent('Kunde 2026-002');
    // Genau eine Form im DOM.
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
