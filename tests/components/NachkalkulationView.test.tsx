import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Company, Invoice, Material, Project, Quote, TimeEntry, WorkSheet } from '@/types';

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
};

/*
  Seit dem 29.09.2026 NICHT am Betrieb und am Artikel, sondern in eigenen
  Tabellen, die nur die Spitze liest (offene Punkte B1). Der Katalog kommt
  deshalb OHNE Einkaufspreis an; nur der Weg über `einkaufspreise` bringt ihn.
*/
let kosten: { fach: number; helper: number } | null = { fach: 40, helper: 25 };

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

const listEntriesForProjects = vi.fn<(a0: string, a1: string[]) => Promise<(TimeEntry & { id: string })[]>>(
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
  baustellenAuswahlAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
}));

vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: vi.fn(async () => projekte),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: (c: string, n: string[]) => listEntriesForProjects(c, n),
}));
/*
  SEIT DEM PRÜFLAUF 25.09.2026 (P2-13) die Belege DER BAUSTELLEN, nicht die
  jüngsten des Betriebs; seit dem 04.11.2026 für alle gezeigten Baustellen in
  einem Zug. Die Doppelgänger geben zurück, was zu den gefragten Baustellen
  gehört.
*/
const listQuotesForProjects = vi.fn(async (_c: string, projektIds: readonly string[]) =>
  angebote.filter((q) => q.projectId && projektIds.includes(q.projectId)));
vi.mock('@/lib/db/quotes', () => ({
  listQuotesForProjects: (c: string, ids: readonly string[]) => listQuotesForProjects(c, ids),
}));

/*
  Material zählt seit dem 07.09.2026 mit. Die Ansicht holt dafür den
  Materialstamm (die Einkaufspreise) und je Baustelle die unterschriebenen
  Handwerksscheine (die Mengen).
*/
let katalog: Material[] = [];
let scheine: Array<WorkSheet & { id: string }> = [];
const listWorkSheetsForProjects = vi.fn(async (_c: string, nummern: readonly string[]) =>
  scheine.filter((s) => nummern.includes(s.projectNumber)));
/*
  Der Katalog wie auf dem Server (19.10.2026): nach Namen oder Kennungen,
  ohne Einkaufspreis — den liest nur die Spitze aus der eigenen Tabelle.
*/
const nameNorm = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const katalogNachNamen = vi.fn(async (_c: string, namen: readonly string[]) =>
  katalog.filter((m) => namen.map(nameNorm).includes(nameNorm(m.name))).map((m) => ({ ...m, einkaufspreis: undefined })));
const katalogNachIds = vi.fn(async (_c: string, ids: readonly string[]) =>
  katalog.filter((m) => ids.includes(m.id!)).map((m) => ({ ...m, einkaufspreis: undefined })));
vi.mock('@/lib/db/materials', () => ({
  katalogNachNamen: (...a: [string, readonly string[]]) => katalogNachNamen(...a),
  katalogNachIds: (...a: [string, readonly string[]]) => katalogNachIds(...a),
}));
vi.mock('@/lib/db/kosten', () => ({
  kostensaetze: vi.fn(async () => kosten),
  einkaufspreise: vi.fn(async (_c: string, ids: readonly string[]) => new Map(
    katalog
      .filter((m) => ids.includes(m.id!) && m.einkaufspreis != null)
      .map((m) => [m.id!, m.einkaufspreis!] as const),
  )),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listWorkSheetsForProjects: (c: string, n: readonly string[]) => listWorkSheetsForProjects(c, n),
}));
/*
  Was das Lager je ausgegeben hat (Befund 09.11.2026) — wie die Datenbank
  unter der Nummer ohne „PR-“ in Kleinschrift.
*/
let ausgaben: Record<string, Array<{ art: 'anforderung' | 'retoure' | 'ruestliste'; datum: string; materialId: string | null; name: string; einheit: string | null; menge: number }>> = {};
const ausgegebenesMaterialGesamt = vi.fn<(n: readonly string[]) => Promise<Map<string, (typeof ausgaben)[string]>>>(
  async () => new Map(Object.entries(ausgaben)));
vi.mock('@/lib/db/materialOrders', () => ({
  ausgegebenesMaterialGesamt: (n: readonly string[]) => ausgegebenesMaterialGesamt(n),
}));
const listInvoicesForProjects = vi.fn(async (_c: string, nummern: readonly string[]) =>
  rechnungen.filter((r) => nummern.includes(r.projectNumber)));
vi.mock('@/lib/db/invoices', () => ({
  listInvoicesForProjects: (c: string, n: readonly string[]) => listInvoicesForProjects(c, n),
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

/** Die Zeile einer Baustelle antippen; zurück kommt ihr Seitenfenster. */
async function oeffnen(nutzer: ReturnType<typeof userEvent.setup>, nummer: string): Promise<HTMLElement> {
  const zeile = (await screen.findByText(nummer)).closest('li') as HTMLElement;
  await nutzer.click(within(zeile).getByRole('button', { name: new RegExp(nummer) }));
  return screen.findByRole('dialog', { name: `Nachkalkulation ${nummer}` });
}

beforeEach(() => {
  firma = {
    id: 'perl',
    name: 'Perl Installationen',
    rates: RATES,
  };
  kosten = { fach: 40, helper: 25 };
  projekte = [];
  katalog = [];
  katalogNachNamen.mockClear();
  katalogNachIds.mockClear();
  scheine = [];
  ausgaben = {};
  ausgegebenesMaterialGesamt.mockClear();
  eintraege = [];
  rechnungen = [];
  angebote = [];
  listEntriesForProjects.mockClear();
  listWorkSheetsForProjects.mockClear();
  listInvoicesForProjects.mockClear();
  listQuotesForProjects.mockClear();
});

describe('Ohne interne Kostensätze', () => {
  it('rechnet die Ansicht gar nicht erst', async () => {
    /*
      DER KERN. Mit dem Verrechnungssatz als Kosten ergäbe jede Baustelle
      glatt null — und das sähe aus wie ein Ergebnis. Deshalb wird nicht
      gerechnet, sondern gesagt, was fehlt.
    */
    kosten = null;
    projekte = [projekt('2026-001')];
    zeige();

    expect(await screen.findByRole('heading', { name: 'Kostensätze fehlen' })).toBeInTheDocument();
    // Eine fehlende Voraussetzung: die kleine Einrichtungs-Zeichnung, keine große Leere (Planlinie § 6).
    expect(document.querySelector('.lot-zeichnung-hinweis[data-motiv="einrichtung"]')).not.toBeNull();
    expect(document.querySelector('.lot-zeichnung-leer')).toBeNull();
    expect(listEntriesForProjects).not.toHaveBeenCalled();
    expect(screen.queryByText('Ergebnis je Baustelle')).not.toBeInTheDocument();
  });

  it('führt mit einem Knopf dorthin; die Erklärung steht nicht offen auf der Seite (D5, E86)', async () => {
    // „In den Einstellungen hinterlegen" hat aus dem Betrieb die Rückmeldung
    // ausgelöst, es gäbe kein solches Feld — deshalb führt der Knopf direkt
    // zu den Sätzen. Zwei Absätze Erklärung standen offen; jetzt ein Satz.
    kosten = null;
    zeige();
    const link = await screen.findByRole('link', { name: 'Kostensätze eintragen' });
    expect(link.getAttribute('href')).toBe('/settings/saetze');
    expect(screen.queryByText(/ergäbe jede Baustelle eine Marge von null/)).toBeNull();
    expect(screen.getByText('Gerechnet wird, sobald feststeht, was eine Arbeitsstunde den Betrieb kostet.')).toBeInTheDocument();
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
    // Die Einträge der Stand-Zeile darüber sind auch Listenpunkte; gezählt wird die Liste der Baustellen.
    const zeilen = screen.getAllByRole('listitem').filter((li) => !li.classList.contains('lage-punkt')).map((li) => li.textContent ?? '');
    // 700 € Erlös bei 640 € Kosten ist die dünnere Baustelle.
    expect(zeilen[0]).toContain('Kunde 2026-002');
  });

  /*
    SEIT DER LINIE „LOT“ IST DIE AUSWAHL EIN SEGMENT (zwei Knöpfe mit
    `aria-pressed`) statt einer Auswahlliste. Geprüft wird dasselbe: welche
    Auswahl gilt und was sie sagt.
  */
  const auswahl = (text: 'Abgeschlossen' | 'Laufend') =>
    within(screen.getByRole('group', { name: 'Baustellen' })).getByRole('button', { name: text });

  it('warnt beim Zwischenstand laufender Baustellen', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-003', 'Aktiv')];
    zeige();
    await screen.findByText('Ergebnis je Baustelle');

    await nutzer.click(auswahl('Laufend'));
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
    await waitFor(() => expect(auswahl('Laufend')).toHaveAttribute('aria-pressed', 'true'));
    expect(await screen.findByText(/Zwischenstand — es kommen noch Stunden dazu/)).toBeInTheDocument();
  });

  /*
    Befund 09.11.2026: eine pausierte Baustelle stand in keiner der beiden
    Auswahlen — ihre Zahlen waren nirgends zu sehen. „Laufend“ heißt aktiv
    oder pausiert, wie in der Baustellenwahl. Gegenprobe: ohne die Änderung
    fehlt 2026-005 unter „Laufend“.
  */
  it('rechnet pausierte Baustellen unter „Laufend“ mit — nicht unter „Abgeschlossen“', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-001'), projekt('2026-003', 'Aktiv'), projekt('2026-005', 'Pausiert')];
    rechnungen = [rechnung('2026-005', 900)];
    zeige();
    await screen.findByText(/Kunde 2026-001/);
    expect(screen.queryByText(/Kunde 2026-005/)).not.toBeInTheDocument();
    await nutzer.click(auswahl('Laufend'));
    expect(await screen.findByText(/Kunde 2026-005/)).toBeInTheDocument();
    expect(screen.getByText(/Kunde 2026-003/)).toBeInTheDocument();
    expect(listInvoicesForProjects.mock.calls.some(([, n]) => n.includes('2026-005') && n.includes('2026-003'))).toBe(true);
  });

  it('beginnt bei den laufenden, wenn es nur pausierte gibt', async () => {
    projekte = [projekt('2026-005', 'Pausiert')];
    zeige();
    await waitFor(() => expect(auswahl('Laufend')).toHaveAttribute('aria-pressed', 'true'));
    expect(await screen.findByText(/Kunde 2026-005/)).toBeInTheDocument();
  });

  it('bleibt bei „Abgeschlossen“, sobald es eine abgeschlossene gibt', async () => {
    projekte = [projekt('2026-001'), projekt('2026-003', 'Aktiv')];
    zeige();
    await screen.findByText('Ergebnis je Baustelle');
    expect(auswahl('Abgeschlossen')).toHaveAttribute('aria-pressed', 'true');
  });

  it('zählt oben, wie viele Baustellen Verlust machen, zu prüfen sind oder keinen Erlös haben', async () => {
    // 001: 2.000 € Erlös bei 640 € Kosten (gut) · 002: kein Erlös · 004: 300 € bei 640 € (Verlust).
    projekte = [projekt('2026-001'), projekt('2026-002'), projekt('2026-004')];
    eintraege = [...stunden('2026-001', 2), ...stunden('2026-002', 1), ...stunden('2026-004', 2)];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-004', 300)];
    zeige();
    await screen.findByText(/Kunde 2026-004/);
    const zahl = (name: string) => screen.getByText(name).closest('.lage-punkt') as HTMLElement;
    expect(zahl('Baustellen')).toHaveTextContent('3');
    expect(zahl('Mit Verlust')).toHaveTextContent('1');
    expect(zahl('Zu prüfen')).toHaveTextContent('0');
    expect(zahl('Ohne Erlös')).toHaveTextContent('1');
  });

  /*
    PLANLINIE (E30): Kosten gegen Erlös als Maßlinie, ein Verlust läuft über
    den Erlös hinaus. Ohne Erlös keine Grenze, also keine Linie — und kein
    Haken, denn „ohne Erlös“ ist nicht „erledigt“.
  */
  it('bemaßt Kosten gegen Erlös je Baustelle; ohne Erlös keine Linie und kein Haken (Planlinie)', async () => {
    projekte = [projekt('2026-002'), projekt('2026-004')];
    eintraege = [...stunden('2026-002', 1), ...stunden('2026-004', 2)];
    rechnungen = [rechnung('2026-004', 300)];
    zeige();
    const verlust = (await screen.findByText(/Kunde 2026-004/)).closest('li') as HTMLElement;
    const linie = within(verlust).getByRole('img', { name: /^Kosten €\s.*640,00 von €\s.*300,00 Erlös/ });
    expect(linie).toHaveAttribute('data-darueber', 'true');
    const ohne = screen.getByText(/Kunde 2026-002/).closest('li') as HTMLElement;
    expect(within(ohne).queryByRole('img')).not.toBeInTheDocument();
    const zeichen = within(ohne).getByText('keine Aussage');
    expect(zeichen).toHaveClass('stand-offen');
    expect(zeichen).not.toHaveClass('stand-leise');
  });

  it('Gegenprobe: ohne Verlust läuft die Linie nicht über den Erlös', async () => {
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    zeige();
    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li') as HTMLElement;
    expect(within(zeile).getByRole('img', { name: /^Kosten/ })).not.toHaveAttribute('data-darueber');
  });

  it('Gegenprobe: ohne Baustelle keine Kennzahlen', async () => {
    zeige();
    await screen.findByText('Keine Baustelle in dieser Auswahl.');
    expect(screen.queryByText('Mit Verlust')).not.toBeInTheDocument();
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
  // Testbericht 30.09.2026, G26 — die Überschrift nennt, was abgezogen wird.
  it('sagt schon in der Unterzeile: Erlös gegen Personal- und Materialkosten (G26)', async () => {
    zeige();
    expect(await screen.findByText('Erlös gegen Personal- und Materialkosten — je Baustelle')).toBeInTheDocument();
  });

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
    const nutzer = userEvent.setup();
    zeige();

    // Seit dem 04.11.2026 steht der Deckungsbeitrag in der Zeile, die Posten im Seitenfenster.
    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li') as HTMLElement;
    // Erlös 2000 − Personal 0 − Material 350 = 1650. Die Zahl selbst zählt:
    // stünde hier 2000, wäre das Material zwar geholt, aber nicht abgezogen.
    expect(zeile.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('1650,00');
    const fenster = await oeffnen(nutzer, '2026-001');
    const material = within(fenster).getByText('− Material').closest('.nachkalk-posten') as HTMLElement;
    expect(material.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('350,00');
    expect(material).toHaveTextContent('aus den unterschriebenen Handwerksscheinen');
  });

  /*
    Befund 09.11.2026: was das Lager ohne Schein ausgegeben hat, schlägt die
    Regie-Rechnung als Erlös vor — die Nachkalkulation kannte es nicht und
    rechnete Material mit null. Gegenprobe: ohne die Änderung steht der
    Deckungsbeitrag bei 2000 statt 1650, und das Fenster nennt kein Lager.
  */
  it('zieht ab, was das Lager ausgegeben hat, und nennt im Fenster das Lager als Herkunft', async () => {
    projekte = [projekt('PR-2026-001')];
    rechnungen = [rechnung('PR-2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0, einkaufspreis: 3.5 } as Material];
    ausgaben = { '2026-001': [{ art: 'anforderung', datum: '2026-08-03', materialId: 'm1', name: 'Eckventil', einheit: 'Stk', menge: 100 }] };
    const nutzer = userEvent.setup();
    zeige();
    const zeile = (await screen.findByText(/Kunde PR-2026-001/)).closest('li') as HTMLElement;
    expect(zeile.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('1650,00');
    expect(ausgegebenesMaterialGesamt).toHaveBeenCalledWith(['PR-2026-001']);
    // Der Einkaufspreis des ausgegebenen Artikels wird über seine Kennung gefragt.
    expect(katalogNachIds.mock.calls.some(([, ids]) => ids.includes('m1'))).toBe(true);
    const fenster = await oeffnen(nutzer, 'PR-2026-001');
    const material = within(fenster).getByText('− Material').closest('.nachkalk-posten') as HTMLElement;
    expect(material.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('350,00');
    expect(material).toHaveTextContent('was das Lager für die Baustelle ausgegeben hat');
  });

  it('kommen die Lagerausgaben nicht, wird kein Material angesetzt — wie ohne Scheine', async () => {
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0, einkaufspreis: 3.5 } as Material];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Eckventil', menge: 100 }],
      } as unknown as WorkSheet & { id: string },
    ];
    ausgegebenesMaterialGesamt.mockRejectedValueOnce(new Error('weg'));
    const nutzer = userEvent.setup();
    zeige();
    const fenster = await oeffnen(nutzer, '2026-001');
    expect(within(fenster).getByText('− Material').closest('.nachkalk-posten')).toHaveTextContent('nichts eingerechnet');
  });

  it('fragt den Katalog nach den Namen der Scheine und des Angebots, nicht den ganzen Stamm (19.10.2026)', async () => {
    /*
      Bis hierher kamen die ersten tausend Artikel; ein Artikel dahinter stand
      als „ohne Einkaufspreis“ da, und der Deckungsbeitrag war zu hoch. Jetzt
      fragt die Ansicht genau nach dem Material der gezeigten Baustellen.
    */
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0 } as Material];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Eckventil', menge: 1 }],
      } as unknown as WorkSheet & { id: string },
    ];
    zeige();
    await screen.findByText(/Nachkalkulation/);
    await waitFor(() => expect(katalogNachNamen).toHaveBeenCalledWith('perl', ['Eckventil']));
    expect(katalogNachIds).toHaveBeenCalledWith('perl', []);
    expect(screen.queryByText(/nur bis zur Obergrenze geladen/)).not.toBeInTheDocument();
  });


  it('fragt auch nach den Artikeln, auf die eine Scheinzeile zeigt (24.10.2026)', async () => {
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    katalog = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0 } as Material];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Eckventil alt', menge: 1, materialId: 'm1' }],
      } as unknown as WorkSheet & { id: string },
    ];
    zeige();
    await screen.findByText(/Nachkalkulation/);
    await waitFor(() => expect(katalogNachIds).toHaveBeenCalledWith('perl', ['m1']));
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
    const nutzer = userEvent.setup();
    zeige();

    // In der Zeile kurz, wie viele — beim Namen im Seitenfenster.
    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li') as HTMLElement;
    expect(within(zeile).getByText('1 Artikel ohne Einkaufspreis')).toHaveClass('text-warning');
    expect(zeile).not.toHaveTextContent('Spezialdichtung');
    const fenster = await oeffnen(nutzer, '2026-001');
    expect(within(fenster).getByRole('listitem')).toHaveTextContent('Spezialdichtung');
    expect(within(fenster).getByText(/der Deckungsbeitrag ist um ihren Einkaufswert zu hoch/)).toBeInTheDocument();
    // Und kein Materialbetrag: es ist nichts eingerechnet worden, ein
    // „Material 0,00 €" läse sich wie „kein Material verbaut".
    const material = within(fenster).getByText('− Material').closest('.nachkalk-posten') as HTMLElement;
    expect(material).not.toHaveTextContent('€');
    expect(material).toHaveTextContent('nichts eingerechnet — siehe unten');
  });

  it('holt die Scheine der gezeigten Baustellen in einem Zug (04.11.2026)', async () => {
    /*
      Je Baustelle einzeln waren es bei 25 Baustellen hundert Anfragen allein
      für die Scheine. Jetzt eine — mit genau den gezeigten Baustellen: die
      Obergrenze von 25 bleibt die Wachstumsbremse.
    */
    projekte = [projekt('2026-001'), projekt('2026-002'), projekt('2026-009', 'Aktiv')];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-002', 2000)];
    zeige();

    await screen.findAllByText(/Kunde 2026-00/);
    expect(listWorkSheetsForProjects.mock.calls[0][1]).toEqual(['2026-002', '2026-001']);
  });

  it('rechnet höchstens die 25 jüngsten einer Auswahl', async () => {
    projekte = Array.from({ length: 30 }, (_, i) => projekt(`2026-${String(i + 1).padStart(3, '0')}`));
    zeige();
    await screen.findByText(/Kunde 2026-030/);
    const gefragt = listEntriesForProjects.mock.calls[0][1];
    expect(gefragt).toHaveLength(25);
    expect(gefragt).not.toContain('2026-005');
    expect(listWorkSheetsForProjects.mock.calls[0][1]).toEqual(gefragt);
    expect(listInvoicesForProjects.mock.calls[0][1]).toEqual(gefragt);
  });

  it('rechnet weiter, wenn die Scheine einer Baustelle nicht ladbar sind', async () => {
    /*
      Die Scheine sind eine ZUSATZangabe. Fiele die ganze Auswertung aus, weil
      eine Abfrage scheitert, wäre die Ansicht bei jedem Rechteproblem leer —
      der Deckungsbeitrag vor Material ist immer noch eine Auskunft.
    */
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    listWorkSheetsForProjects.mockRejectedValueOnce(new Error('nicht lesbar'));
    zeige();

    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li') as HTMLElement;
    // Erlös 2000, nichts abgezogen: der Deckungsbeitrag vor Material.
    expect(zeile.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('2000,00Deckungsbeitrag');
    expect(screen.queryByText(/Zeiten, Rechnungen, Angebote/)).not.toBeInTheDocument();
  });
});

/*
  PRÜFLAUF 25.09.2026, P2-13. Die Ansicht rechnete mit den 200 jüngsten
  Rechnungen und den 100 jüngsten Angeboten des Betriebs und nahm das ERSTE
  Angebot der Baustelle. Eine Baustelle vom Frühjahr stand ohne Erlös da,
  und ein abgelehntes Angebot verdrängte das angenommene.
*/
describe('Rechnungen und Angebote je Baustelle', () => {
  it('fragt die Rechnungen und Angebote genau der angezeigten Baustellen — in einem Zug', async () => {
    projekte = [projekt('2026-001'), projekt('2026-002')];
    eintraege = [...stunden('2026-001', 1), ...stunden('2026-002', 1)];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-002', 700), rechnung('2026-077', 99999)];
    zeige();
    await screen.findByText(/Kunde 2026-001/);
    expect(listInvoicesForProjects).toHaveBeenCalledTimes(1);
    expect([...listInvoicesForProjects.mock.calls[0][1]].sort()).toEqual(['2026-001', '2026-002']);
    expect([...listQuotesForProjects.mock.calls[0][1]].sort()).toEqual(['p-2026-001', 'p-2026-002']);
    // Jede Rechnung bei ihrer Baustelle: 700 € Erlös bleiben bei 2026-002.
    const zwei = screen.getByText(/Kunde 2026-002/).closest('li') as HTMLElement;
    expect(zwei.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('Erlös€700,00');
  });

  it('nimmt das angenommene Angebot, auch wenn ein abgelehntes davor steht', async () => {
    projekte = [projekt('2026-003')];
    eintraege = stunden('2026-003', 1);
    const angebot = (id: string, status: Quote['status'], netto: number) =>
      ({
        id, companyId: 'perl', quoteNumber: `AN-${id}`, customerName: 'Kunde 2026-003',
        projectNumber: '2026-003', projectId: 'p-2026-003', quoteDate: '2026-05-01',
        validUntil: '2026-06-01', status, positions: [], subtotalNetto: netto,
        totalNetto: netto, totalVat: netto * 0.2, totalBrutto: netto * 1.2, vatRate: 0.2,
        kalkulierteStunden: 0,
      }) as unknown as Quote & { id: string };
    angebote = [angebot('alt', 'Abgelehnt', 9000), angebot('neu', 'Angenommen', 1500)];
    zeige();

    const zeile = (await screen.findByText(/Kunde 2026-003/)).closest('li');
    const text = (zeile as HTMLElement).textContent?.replace(/[\s\u00A0.]/g, '') ?? '';
    expect(text).toContain('1500,00');
    expect(text).toContain('ErlösausdemAngebot');
  });
});

/*
  DIE ZEILE SAGT, WIE ES STEHT — DAS FENSTER, WARUM (Auftrag 04.11.2026:
  „viel Text … sehr unübersichtlich … Detailansicht mit einem Modal“).
*/
describe('Zeile und Seitenfenster', () => {
  it('die Zeile bleibt kurz: Herkunft des Erlöses, Zustand, Kosten gegen Erlös, Deckungsbeitrag', async () => {
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    zeige();
    const zeile = (await screen.findByText(/Kunde 2026-001/)).closest('li') as HTMLElement;
    expect(within(zeile).getByText('Erlös aus Rechnungen')).toBeInTheDocument();
    expect(within(zeile).getByRole('img', { name: /^Kosten/ })).toBeInTheDocument();
    // Stunden und Posten stehen im Fenster, nicht mehr in der Zeile.
    expect(zeile).not.toHaveTextContent('Facharbeit');
    expect(zeile).not.toHaveTextContent('Personal');
    // Die ganze Zeile öffnet, mit dem Pfeil wie bei den Rechnungen.
    expect(within(zeile).getByRole('button', { name: /2026-001/ })).toHaveClass('zeile-ziel');
    expect(zeile.querySelector('.zeile-pfeil')).not.toBeNull();
  });

  it('das Fenster schlüsselt auf: Erlös, Personal nach Stunden, Material, Deckungsbeitrag — und führt in die Akte', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    zeige();
    // Gegenprobe: vor dem Tipp kein Fenster.
    await screen.findByText(/Kunde 2026-001/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const fenster = await oeffnen(nutzer, '2026-001');
    const posten = (wort: string) =>
      ([...fenster.querySelectorAll('.nachkalk-posten')].find((p) => p.querySelector('dt')?.textContent === wort) as HTMLElement).textContent?.replace(/[\s\u00A0.]/g, '') ?? '';
    expect(posten('Erlös')).toContain('€2000,00');
    expect(posten('Erlös')).toContain('aus1Rechnung,netto');
    // 16 h × 40 € Kostensatz.
    expect(posten('− Personal')).toContain('€640,00');
    expect(posten('− Personal')).toContain('16,0hFacharbeit(€640,00)');
    expect(posten('Deckungsbeitrag')).toContain('€1360,00');
    expect(posten('Deckungsbeitrag')).toContain('68%vomErlös');
    expect(within(fenster).getByRole('link', { name: 'Akte der Baustelle öffnen' })).toHaveAttribute('href', '/admin-projects/p-2026-001');
    // Ohne fehlende Einkaufspreise kein Abschnitt dazu.
    expect(within(fenster).queryByText(/ohne Einkaufspreis/)).not.toBeInTheDocument();

    await nutzer.click(within(fenster).getByRole('button', { name: /^Schließen$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('fehlen Einkaufspreise, zeigt das Fenster den Weg in den Katalog', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    scheine = [
      {
        id: 's1', companyId: 'perl', projectNumber: '2026-001', status: 'Unterschrieben',
        material: [{ name: 'Spezialdichtung', menge: 2 }, { name: 'Sonderventil', menge: 1 }],
      } as unknown as WorkSheet & { id: string },
    ];
    zeige();
    const fenster = await oeffnen(nutzer, '2026-001');
    expect(within(fenster).getByRole('heading', { name: '2 Artikel ohne Einkaufspreis' })).toBeInTheDocument();
    expect(within(fenster).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sonderventil', 'Spezialdichtung']);
    expect(within(fenster).getByRole('link', { name: 'Einkaufspreise im Katalog hinterlegen' })).toHaveAttribute('href', '/lager?reiter=katalog');
  });

  it('ohne Erlös sagt das Fenster es, statt null zu rechnen', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-002')];
    eintraege = stunden('2026-002', 1);
    zeige();
    const fenster = await oeffnen(nutzer, '2026-002');
    expect(within(fenster).getByText(/kein Erlös hinterlegt — weder Rechnung noch angenommenes Angebot/)).toBeInTheDocument();
    expect(within(fenster).getByText('ohne Erlös keine Marge')).toBeInTheDocument();
    expect(within(fenster).queryByRole('img')).not.toBeInTheDocument();
  });

  it('bei laufenden Baustellen sagt auch das Fenster: Zwischenstand', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-003', 'Aktiv')];
    rechnungen = [rechnung('2026-003', 500)];
    zeige();
    const fenster = await oeffnen(nutzer, '2026-003');
    expect(within(fenster).getByText(/Zwischenstand — es kommen noch Stunden dazu/)).toBeInTheDocument();
  });
});

/*
  KEIN NACHLADEN BEIM WECHSEL (Auftrag 04.11.2026: „beim Tabwechsel in der
  Seite wird Inhalt oft noch nachgeladen“). Steht die eine Auswahl, wird die
  andere im Hintergrund gerechnet; der Wechsel zeigt sie sofort, auch zurück.
*/
describe('Wechsel und Wiederkommen', () => {
  const auswahl = (text: 'Abgeschlossen' | 'Laufend') =>
    within(screen.getByRole('group', { name: 'Baustellen' })).getByRole('button', { name: text });

  it('die andere Auswahl steht beim Wechsel sofort da — ohne Platzhalter, auch zurück', async () => {
    const nutzer = userEvent.setup();
    projekte = [projekt('2026-001'), projekt('2026-003', 'Aktiv')];
    rechnungen = [rechnung('2026-001', 2000), rechnung('2026-003', 900)];
    zeige();
    await screen.findByText(/Kunde 2026-001/);
    // Die laufenden werden im Hintergrund mitgerechnet.
    await waitFor(() => expect(listEntriesForProjects).toHaveBeenCalledWith('perl', ['2026-003']));

    await nutzer.click(auswahl('Laufend'));
    expect(screen.getByText(/Kunde 2026-003/)).toBeInTheDocument();
    expect(document.querySelector('.skeleton, [aria-busy="true"]')).toBeNull();
    await nutzer.click(auswahl('Abgeschlossen'));
    expect(screen.getByText(/Kunde 2026-001/)).toBeInTheDocument();
  });

  it('beim Wiederkommen steht der letzte Stand sofort da', async () => {
    projekte = [projekt('2026-001')];
    rechnungen = [rechnung('2026-001', 2000)];
    const erst = zeige();
    await screen.findByText(/Kunde 2026-001/);
    erst.unmount();
    zeige();
    expect(screen.getByText(/Kunde 2026-001/)).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Kostensätze wird auch im Hintergrund nichts gerechnet', async () => {
    kosten = null;
    projekte = [projekt('2026-001'), projekt('2026-003', 'Aktiv')];
    zeige();
    await screen.findByRole('heading', { name: 'Kostensätze fehlen' });
    expect(listEntriesForProjects).not.toHaveBeenCalled();
  });
});

describe('Wenn nichts gerechnet werden kann', () => {
  it('sagt es in der Karte, statt Platzhalter stehen zu lassen', async () => {
    projekte = [projekt('2026-001')];
    listInvoicesForProjects.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    expect(await screen.findByText(/Zeiten, Rechnungen, Angebote oder Materialpreise der Baustellen konnten nicht geladen werden/)).toBeInTheDocument();
    expect(screen.getAllByText(/konnten nicht geladen werden/)).toHaveLength(1);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

/*
  EIN FEHLER MIT NÄCHSTEM SCHRITT (V10, 13.11.2026; Auftrag 9.6): scheitert
  das Rechnen, steht „Erneut versuchen“ dabei — vorher nur „Das hat nicht
  geklappt“. Und weiterhin keine Kennzahl über einem Fehler.
*/
describe('V10: Ladefehler', () => {
  it('bietet „Erneut versuchen“ und rechnet damit neu', async () => {
    projekte = [projekt('2026-001')];
    eintraege = stunden('2026-001', 2);
    rechnungen = [rechnung('2026-001', 2000)];
    listEntriesForProjects.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Erneut versuchen' });
    // Gleich bleibt: über einem Fehler steht keine Zählung („0 mit Verlust“).
    expect(screen.queryByText('Mit Verlust')).toBeNull();
    await userEvent.click(knopf);
    expect(await screen.findByText(/Kunde 2026-001/)).toBeInTheDocument();
  });
});
