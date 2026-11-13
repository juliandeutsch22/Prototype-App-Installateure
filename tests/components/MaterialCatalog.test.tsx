import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Material, Role } from '@/types';
import type { WithId } from '@/lib/db/core';
import MaterialCatalog from '@/features/orders/MaterialCatalog';

/**
 * Der Einkaufspreis im Materialkatalog.
 *
 * ER IST DIE KOSTENSEITE DER NACHKALKULATION und damit Margendaten. Gepflegt
 * wird der Katalog von der Verwaltung, setzen darf dieses eine Feld aber nur
 * die Geschäftsführung — die Grenze läuft zwischen den FELDERN, nicht zwischen
 * den Ansichten.
 *
 * WARUM DAS FELD NICHT NUR AUSGEBLENDET WIRD, sondern ganz aus den Daten
 * fällt: das Formular der Verwaltung kennt den Wert nicht und trüge beim
 * Speichern eine 0 ein, wo der Chef 3,50 hinterlegt hat. Die Regel in
 * `firestore.rules` weist das zurück — richtig so, aber gescheitert wäre dann
 * ihr GANZES Speichern: der Knopf täte nichts, und niemand wüsste warum.
 * Genau das prüft der letzte Test hier.
 */

let materialien: WithId<Material>[] = [];
const anlegen = vi.fn();
const aendern = vi.fn();

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


/*
  Der Katalog wie auf dem Server (19.10.2026): nach Namen geordnet, gesucht in
  Name, Kategorie und Artikelnummer, die ersten `anzahl` samt Zahl aller Treffer.
*/
const katalogSeite = vi.fn(async (_c: string, begriff: string, anzahl: number) => {
  const q = begriff.trim().toLowerCase();
  const treffer = materialien
    .filter((m) => !q || [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { zeilen: treffer.slice(0, anzahl), gesamt: treffer.length };
});
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  katalogSeite: (...a: [string, string, number]) => katalogSeite(...a),
  katalogAnzahl: async () => materialien.length,
  katalogBeobachten: () => () => undefined,
  createMaterial: (...a: unknown[]) => anlegen(...a),
  updateMaterial: (...a: unknown[]) => aendern(...a),
  deleteMaterial: vi.fn(),
}));

/*
  Der Einkaufspreis kommt seit dem 29.09.2026 NICHT mit dem Artikel, sondern
  aus einer eigenen Tabelle, die nur die Spitze liest (offene Punkte B1).
*/
let preisLaden: () => Promise<Map<string, number>> = async () => new Map();
vi.mock('@/lib/db/kosten', () => ({ einkaufspreise: () => preisLaden() }));
/*
  Der Abschnitt „Lieferanten“ (M03a) fragt den Vergleich eigens; hier nur so
  weit, dass er erscheint — was er zeigt, prüft `Lieferantenvergleich.test.tsx`.
*/
const vergleichLaden = vi.fn<(m: string) => Promise<unknown>>(async () => ({ heute: '2026-11-07', fristTage: 180, basisGrund: null, zeilen: [] }));
vi.mock('@/lib/db/lieferantenartikel', () => ({
  artikelVergleich: (m: string) => vergleichLaden(m),
  preisverlauf: vi.fn(),
  zuordnen: vi.fn(),
  loesen: vi.fn(),
}));
/*
  STABILE OBJEKTE, KEINE FRISCHEN LITERALE. Gäbe der Mock bei jedem Aufruf ein
  neues Objekt zurück, liefe der Effekt, der an `user` hängt, endlos — der
  Testlauf hängt dann ohne Fehlermeldung.
*/
const alsRolle = (uid: string, name: string, role: Role) => ({
  user: { uid, companyId: 'perl', name, role },
});
const VERWALTUNG = alsRolle('v1', 'Verwaltung', 'Verwaltung');
const CHEF = alsRolle('g1', 'Chef', 'Geschäftsführung');
let angemeldet = VERWALTUNG;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => angemeldet }));

function zeige() {
  return render(
    <ToastProvider>
      <MaterialCatalog />
    </ToastProvider>,
  );
}

/*
  SEIT DEM UMBAU (Linie „Lot“, Regel 8) steht das Formular im Seitenfenster:
  „Neues Material“ öffnet es leer, die Zeile eines Artikels öffnet ihn zum
  Bearbeiten. Geprüft wird weiter dasselbe Formular.
*/
async function neuesMaterial(nutzer: ReturnType<typeof userEvent.setup> = userEvent.setup()) {
  await nutzer.click(await screen.findByRole('button', { name: 'Neues Material' }));
}

async function ersterArtikel(nutzer: ReturnType<typeof userEvent.setup>) {
  const zeile = (await screen.findAllByRole('listitem'))[0];
  await nutzer.click(within(zeile).getAllByRole('button')[0]);
}

beforeEach(() => {
  materialien = [];
  angemeldet = VERWALTUNG;
  anlegen.mockReset();
  anlegen.mockResolvedValue('m1');
  aendern.mockReset();
  aendern.mockResolvedValue(undefined);
  preisLaden = async () => new Map();
});

describe('Der Einkaufspreis', () => {
  it('steht der Geschäftsführung offen', async () => {
    angemeldet = CHEF;
    zeige();
    await neuesMaterial();
    expect(await screen.findByLabelText(/Einkaufspreis/)).toBeInTheDocument();
  });

  it('wird der Verwaltung gar nicht angeboten', async () => {
    zeige();
    await neuesMaterial();
    // Der Verkaufspreis ist da — es fehlt nicht das Formular, sondern das Feld.
    expect(await screen.findByLabelText(/Verkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Einkaufspreis/)).not.toBeInTheDocument();
  });

  it('geht mit, wenn die Geschäftsführung ihn einträgt', async () => {
    angemeldet = CHEF;
    const nutzer = userEvent.setup();
    zeige();

    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Eckventil');
    await nutzer.type(screen.getByLabelText(/Einkaufspreis/), '3.5');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Eckventil', einkaufspreis: 3.5 });
  });

  it('fehlt im Datensatz der Verwaltung ganz — nicht als 0', async () => {
    const nutzer = userEvent.setup();
    zeige();

    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Eckventil');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    const daten = anlegen.mock.calls[0][1] as Record<string, unknown>;
    // `toMatchObject` würde ein mitgeschicktes Feld übersehen: der Schlüssel
    // selbst ist hier der Fehler, nicht sein Wert.
    expect(Object.keys(daten)).not.toContain('einkaufspreis');
  });

  it('überschreibt beim Bearbeiten durch die Verwaltung keinen bestehenden Preis', async () => {
    // Der gefährlichste Fall: der Chef hat 3,50 hinterlegt, die Verwaltung
    // ändert die Kategorie. Ginge das Feld mit, wiese die Regel das Speichern
    // zurück — und ohne Regel stünde dort still eine 0.
    materialien = [
      { id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4, einkaufspreis: 3.5 } as WithId<Material>,
    ];
    const nutzer = userEvent.setup();
    zeige();

    await ersterArtikel(nutzer);
    await nutzer.type(screen.getByLabelText(/Kategorie/), 'Sanitär');
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(aendern).toHaveBeenCalled());
    const daten = aendern.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(daten)).not.toContain('einkaufspreis');
  });
});

describe('Der Einkaufspreis beim Bearbeiten durch die Geschäftsführung (B1)', () => {
  /*
    DIE FALLE NACH DEM UMZUG. Der Artikel trägt den Preis nicht mehr; das
    Formular stünde leer da, und Speichern schriebe 0 über 3,50.
  */
  const artikel = () => [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4 } as WithId<Material>];

  it('holt den hinterlegten Preis und schreibt ihn unverändert zurück', async () => {
    angemeldet = CHEF;
    materialien = artikel();
    preisLaden = async () => new Map([['m1', 3.5]]);
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    await waitFor(() => expect((screen.getByLabelText(/Einkaufspreis/) as HTMLInputElement).value).toBe('3,50'));
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect(aendern.mock.calls[0][1]).toMatchObject({ einkaufspreis: 3.5 });
  });

  it('schickt ihn nicht mit, solange er noch lädt', async () => {
    angemeldet = CHEF;
    materialien = artikel();
    preisLaden = () => new Promise(() => undefined);
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(screen.getByLabelText(/Einkaufspreis/)).toBeDisabled();
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect(Object.keys(aendern.mock.calls[0][1] as Record<string, unknown>)).not.toContain('einkaufspreis');
  });

  it('sagt es, wenn er nicht geladen werden konnte — und lässt ihn beim Speichern stehen', async () => {
    angemeldet = CHEF;
    materialien = artikel();
    preisLaden = async () => { throw new Error('Keine Verbindung.'); };
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(await screen.findByText(/konnte nicht geladen werden/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(aendern).toHaveBeenCalled());
    expect(Object.keys(aendern.mock.calls[0][1] as Record<string, unknown>)).not.toContain('einkaufspreis');
  });
});

describe('Der Bestand beim Bearbeiten', () => {
  /*
    PRÜFLAUF 25.09.2026 (P3-18). Das Formular schrieb den Bestand bei jedem
    Speichern absolut zurück. Wer nur die Kategorie änderte, während ein
    Monteur zwei Stück abholte, setzte den Bestand auf den Stand beim Öffnen
    zurück — die Abholung war aus dem Lager verschwunden.
  */
  it('geht nicht mit, wenn ihn niemand angefasst hat', async () => {
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4 } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();

    await ersterArtikel(nutzer);
    await nutzer.type(screen.getByLabelText(/Kategorie/), 'Sanitär');
    await nutzer.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(aendern).toHaveBeenCalled());
    const daten = aendern.mock.calls[0][1] as Record<string, unknown>;
    expect(daten).toMatchObject({ category: 'Sanitär' });
    expect(Object.keys(daten)).not.toContain('stock');
  });

  /*
    TESTBERICHT 30.09.2026, M28: beim Bearbeiten ist der Bestand kein Feld
    mehr — er ändert sich über Wareneingang oder Inventur, mit Grund.
  */
  it('lässt sich beim Bearbeiten nicht mehr überschreiben', async () => {
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4 } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();

    await ersterArtikel(nutzer);
    expect(screen.queryByRole('textbox', { name: /Lagerbestand|Anfangsbestand/ })).toBeNull();
    expect(screen.getByText(/über Wareneingang oder Inventur/)).toBeInTheDocument();
  });

  it('steht beim Anlegen immer drin — als Anfangsbestand', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Neu');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Neu', stock: 0 });
  });
});

/**
 * WIE WEIT DER KATALOG REICHT.
 *
 * Er wurde bis zum 09.09.2026 ohne jede Grenze geladen — in sechs Ansichten,
 * vier davon als Live-Abo. Bei ein paar hundert Artikeln harmlos; er wächst
 * nur ohne jedes Signal, und bemerkt würde es an dem Tag, an dem die
 * Anwendung stehen bleibt.
 */
describe('Materialkatalog — seitenweise vom Server (19.10.2026)', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `m${i}`,
        companyId: 'perl',
        name: `Artikel ${String(i).padStart(2, '0')}`,
        stock: 10,
      }) as WithId<Material>,
    );
  beforeEach(() => {
    katalogSeite.mockClear();
  });

  it('zeigt die ersten zwanzig nach Namen; „und N weitere“ holt mehr vom Server', async () => {
    materialien = viele(25);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText('Artikel 00');
    expect(screen.queryByText('Artikel 20')).not.toBeInTheDocument();
    expect(katalogSeite).toHaveBeenLastCalledWith('perl', '', 20);
    await nutzer.click(screen.getByRole('button', { name: 'und 5 weitere anzeigen' }));
    expect(await screen.findByText('Artikel 24')).toBeInTheDocument();
    expect(katalogSeite).toHaveBeenLastCalledWith('perl', '', 40);
  });

  it('sucht über den ganzen Katalog auf dem Server — der Titel nennt weiter den ganzen Katalog', async () => {
    materialien = viele(25);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText('Artikel 00');
    expect(screen.getByText('Katalog (25)')).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText('Suche'), 'Artikel 24');
    expect(await screen.findByText('Artikel 24')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Artikel 00')).not.toBeInTheDocument());
    expect(katalogSeite).toHaveBeenLastCalledWith('perl', 'Artikel 24', 20);
    expect(screen.getByText('Katalog (25)')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Treffer kein „weitere“ und die Auskunft, dass nichts passt', async () => {
    materialien = viele(3);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText('Artikel 00');
    expect(screen.queryByRole('button', { name: /weitere anzeigen/ })).not.toBeInTheDocument();
    await nutzer.type(screen.getByLabelText('Suche'), 'Heizkessel');
    expect(await screen.findByText(/Kein Material passt zu „Heizkessel“/)).toBeInTheDocument();
  });

  /*
    AUS „SUCHEN ODER SPRINGEN“ (C3, E91): das Lager reicht den Begriff aus
    der Adresse herein — er steht im Feld und geht gleich an den Server, auch
    wenn der Katalog schon offen war.
  */
  it('nimmt einen Suchbegriff von aussen — beim Öffnen und bei offenem Katalog', async () => {
    materialien = viele(25);
    const { rerender } = render(
      <ToastProvider>
        <MaterialCatalog suche="Artikel 24" />
      </ToastProvider>,
    );
    expect(screen.getByLabelText('Suche')).toHaveValue('Artikel 24');
    expect(await screen.findByText('Artikel 24')).toBeInTheDocument();
    expect(katalogSeite).toHaveBeenCalledWith('perl', 'Artikel 24', 20);
    expect(screen.queryByText('Artikel 00')).not.toBeInTheDocument();
    rerender(
      <ToastProvider>
        <MaterialCatalog suche="Artikel 03" />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('Suche')).toHaveValue('Artikel 03'));
    expect(await screen.findByText('Artikel 03')).toBeInTheDocument();
  });

  it('Gegenprobe: eigenes Tippen bleibt stehen, solange von aussen nichts Neues kommt', async () => {
    materialien = viele(25);
    const nutzer = userEvent.setup();
    const { rerender } = render(
      <ToastProvider>
        <MaterialCatalog suche="Artikel 24" />
      </ToastProvider>,
    );
    await screen.findByText('Artikel 24');
    await nutzer.clear(screen.getByLabelText('Suche'));
    await nutzer.type(screen.getByLabelText('Suche'), 'Artikel 1');
    rerender(
      <ToastProvider>
        <MaterialCatalog suche="Artikel 24" lagerartikel={[]} />
      </ToastProvider>,
    );
    expect(screen.getByLabelText('Suche')).toHaveValue('Artikel 1');
  });

  it('„knapp“ im Kopf kommt aus den Lagerartikeln, nicht aus der gezeigten Seite', async () => {
    materialien = viele(25);
    const knapp = { id: 'k1', companyId: 'perl', name: 'Zylinder knapp', stock: 1, lagerartikel: true } as WithId<Material>;
    render(
      <ToastProvider>
        <MaterialCatalog lagerartikel={[knapp]} />
      </ToastProvider>,
    );
    await screen.findByText('Artikel 00');
    expect(screen.getByText('1 knapp')).toBeInTheDocument();
    /*
      E72 (09.11.2026): der Zustand gehört zum Titel. Als drittes Element
      zwischen Titel und Knopf verteilt, schwebte er mitten in der Kopfzeile;
      `mr-auto` rückt ihn an den Titel. Gegenprobe: mit dem Stand davor rot.
    */
    const kopfzeile = screen.getByRole('heading', { name: /^Katalog/ }).parentElement!;
    const zustand = screen.getByText('1 knapp').closest('.mr-auto');
    expect(zustand).not.toBeNull();
    expect(zustand!.parentElement).toBe(kopfzeile);
    expect(zustand!.previousElementSibling).toBe(screen.getByRole('heading', { name: /^Katalog/ }));
  });

  it('löscht auch einen hereingereichten Artikel, der nicht auf der gezeigten Seite steht', async () => {
    materialien = viele(25);
    const fern = { id: 'fern', companyId: 'perl', name: 'Zylinder fern', stock: 0, lagerartikel: false } as WithId<Material>;
    const nutzer = userEvent.setup();
    render(
      <ToastProvider>
        <MaterialCatalog zuBearbeiten={fern} />
      </ToastProvider>,
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Material löschen …' }));
    expect(await screen.findByText(/Zylinder fern/)).toBeInTheDocument();
  });
});

describe('Ausgelaufene Artikel im Katalog', () => {
  it('kennzeichnet sie, statt sie zu verstecken', async () => {
    /*
      Sie BLEIBEN im Katalog — sie stehen auf alten Scheinen und Rechnungen.
      Dass sie in der Materialerfassung nicht mehr auftauchen, braucht hier
      eine Erklärung, sonst sucht jemand einen Artikel, den er sieht.
    */
    materialien = [
      { id: 'm1', companyId: 'perl', name: 'Eckventil alt', stock: 3, ausgelaufen: true },
      { id: 'm2', companyId: 'perl', name: 'Eckventil neu', stock: 30 },
    ] as WithId<Material>[];
    zeige();

    const alt = (await screen.findByText('Eckventil alt')).closest('li') as HTMLElement;
    expect(within(alt).getByText('ausgelaufen')).toBeInTheDocument();

    const neu = screen.getByText('Eckventil neu').closest('li') as HTMLElement;
    expect(within(neu).queryByText('ausgelaufen')).toBeNull();
  });
});

/**
 * KATALOG UND LAGER GETRENNT (Testbericht 30.09.2026, M30) und der
 * Materialaufschlag (M31).
 */
describe('Im Lager führen', () => {
  it('ohne Haken nur Katalog: kein Anfangsbestand, keine Mindestmenge', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Kugelhahn');
    await nutzer.click(screen.getByLabelText('Im Lager führen'));
    expect(screen.queryByLabelText(/Anfangsbestand/)).toBeNull();
    expect(screen.queryByLabelText(/Mindestmenge/)).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Kugelhahn', stock: 0, lagerartikel: false, mindestmenge: null });
  });

  it('mit Haken samt Mindestmenge und Warengruppe', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Fitting');
    await nutzer.clear(screen.getByLabelText(/Anfangsbestand/));
    await nutzer.type(screen.getByLabelText(/Anfangsbestand/), '40');
    await nutzer.type(screen.getByLabelText(/Mindestmenge/), '10');
    await nutzer.type(screen.getByLabelText(/Warengruppe/), '1201');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      stock: 40, lagerartikel: true, mindestmenge: 10, warengruppe: '1201',
    });
  });

  it('lässt sich mit Bestand nicht abschalten', async () => {
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4, lagerartikel: true } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(screen.getByLabelText('Im Lager führen')).toBeDisabled();
    expect(screen.getByText(/erst, wenn die Inventur den Bestand auf null/)).toBeInTheDocument();
  });

  it('zeigt einen Katalogartikel als „nur Katalog“, nicht mit Bestand', async () => {
    materialien = [{ id: 'k1', companyId: 'perl', name: 'Pressfitting', stock: 0, lagerartikel: false } as WithId<Material>];
    zeige();
    expect(await screen.findByText('nur Katalog')).toBeInTheDocument();
  });
});

describe('Verkaufspreis aus Einkauf plus Aufschlag (M31)', () => {
  const MIT_AUFSCHLAG = {
    ...CHEF,
    company: { id: 'perl', name: 'Perl', rates: { materialaufschlag: { standard: 25, warengruppen: { '1201': 40 } } } },
  };

  it('schlägt vor — Warengruppe vor Standard — und übernimmt erst auf Klick', async () => {
    angemeldet = MIT_AUFSCHLAG as unknown as typeof VERWALTUNG;
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Fitting', stock: 0, warengruppe: '1201' } as WithId<Material>];
    preisLaden = async () => new Map([['m1', 10]]);
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(await screen.findByText(/Vorschlag: € 14,00 \(Einkauf \+ 40 %\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verkaufspreis/)).toHaveValue('');
    await nutzer.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.getByLabelText(/Verkaufspreis/)).toHaveValue('14,00');
  });

  it('ohne Aufschlag kein Vorschlag', async () => {
    angemeldet = CHEF;
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Fitting', stock: 0 } as WithId<Material>];
    preisLaden = async () => new Map([['m1', 10]]);
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    await waitFor(() => expect(screen.getByLabelText(/Einkaufspreis/)).toHaveValue('10,00'));
    expect(screen.queryByText(/Vorschlag:/)).toBeNull();
  });
});

describe('Das Formular im Seitenfenster (Linie „Lot“, Regel 8)', () => {
  it('steht erst nach „Neues Material“ da — und schliesst nach dem Anlegen', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByRole('button', { name: 'Neues Material' });
    // Gegenprobe: ohne Klick kein Formular auf der Seite.
    expect(screen.queryByLabelText(/Bezeichnung/)).toBeNull();
    await neuesMaterial(nutzer);
    const fenster = screen.getByRole('dialog', { name: 'Neues Material' });
    await nutzer.type(within(fenster).getByLabelText(/Bezeichnung/), 'Muffe');
    await nutzer.click(within(fenster).getByRole('button', { name: 'Material anlegen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Neues Material' })).toBeNull());
  });

  it('löscht aus dem Fenster erst nach der Rückfrage', async () => {
    const loeschen = vi.mocked((await import('@/lib/db/materials')).deleteMaterial);
    loeschen.mockClear();
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 0 } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    await nutzer.click(within(screen.getByRole('dialog', { name: 'Material bearbeiten' })).getByRole('button', { name: /Material löschen/ }));
    const frage = await screen.findByRole('dialog', { name: 'Material löschen?' });
    expect(loeschen).not.toHaveBeenCalled();
    await nutzer.click(within(frage).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith('m1'));
  });
});

/*
  DER ABSCHNITT „LIEFERANTEN“ IM ARTIKELBLATT (M03a, E02): nur wer
  Einkaufspreise sieht, nur mit dem Modul „Preisvergleich“ — und erst beim
  Bearbeiten eines vorhandenen Artikels. GEGENPROBE: ohne die Änderung steht
  er für niemanden da.
*/
describe('Lieferanten im Artikelblatt (M03a)', () => {
  const artikel = () => [{ id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4, unit: 'Stk' } as WithId<Material>];

  it('die Geschäftsführung sieht ihn beim Bearbeiten', async () => {
    angemeldet = CHEF;
    materialien = artikel();
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(await screen.findByRole('region', { name: 'Lieferanten' })).toBeInTheDocument();
    expect(vergleichLaden).toHaveBeenCalledWith('m1');
  });

  it('die Verwaltung ohne Freigabe sieht ihn nicht, und es wird nichts gefragt', async () => {
    materialien = artikel();
    vergleichLaden.mockClear();
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(await screen.findByLabelText(/Verkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lieferanten' })).toBeNull();
    expect(vergleichLaden).not.toHaveBeenCalled();
  });

  it('ist der Preisvergleich ausgeschaltet, verschwindet er', async () => {
    angemeldet = { ...CHEF, company: { id: 'perl', name: 'Perl', modules: { 'material.lieferantenvergleich': false } } } as typeof CHEF;
    materialien = artikel();
    vergleichLaden.mockClear();
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(await screen.findByLabelText(/Einkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lieferanten' })).toBeNull();
    expect(vergleichLaden).not.toHaveBeenCalled();
  });

  it('beim neuen Material gibt es ihn nicht — es hat noch keinen Lieferanten', async () => {
    angemeldet = CHEF;
    zeige();
    await neuesMaterial();
    expect(await screen.findByLabelText(/Einkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lieferanten' })).toBeNull();
  });
});

/*
  M03a: ÜBER DIE NUMMER EINES GROSSHÄNDLERS GEFUNDEN — die Trefferzeile sagt,
  worüber. GEGENPROBE: ohne die Änderung steht nur die eigene Artikelnummer da.
*/
describe('Treffer über die Nummer eines Großhändlers (M03a)', () => {
  it('nennt Nummer und Großhändler in der Zeile', async () => {
    materialien = [{
      id: 'm1', companyId: 'perl', name: 'Eckventil', stock: 4, articleNumber: 'A-1',
      gefundenUeber: { nummer: 'B-7788', art: 'lieferant', lieferant: 'Beta' },
    } as WithId<Material>];
    zeige();
    expect(await screen.findByText(/Art\.-Nr\. A-1 · Nr\. B-7788 bei Beta/)).toBeInTheDocument();
  });
});

/*
  E72 (09.11.2026), Leitfaden Regel 9: bis zu 13 Felder standen offen. Was
  selten ist — Warengruppe, Sollbestand, Verpackungseinheit, Preise — steht
  unter „Weitere Angaben“, zugeklappt, ausser es steht schon etwas darin.
  Gegenprobe: mit dem Stand davor rot (die Felder standen in keinem Aufklapper).
*/
describe('Seltenes unter „Weitere Angaben“ (E72)', () => {
  const aufklapper = (feld: HTMLElement) => feld.closest('details');

  it('ein neues Material: zugeklappt, und Bezeichnung, Einheit, Bestand stehen offen', async () => {
    angemeldet = CHEF;
    const nutzer = userEvent.setup();
    zeige();
    await neuesMaterial(nutzer);
    for (const name of [/Warengruppe/, /Verkaufspreis/, /Einkaufspreis/]) {
      const d = aufklapper(screen.getByLabelText(name));
      expect(d, String(name)).not.toBeNull();
      expect(d).not.toHaveAttribute('open');
    }
    for (const name of [/Bezeichnung/, /Anfangsbestand/, /Mindestmenge/]) {
      expect(aufklapper(screen.getByLabelText(name)), String(name)).toBeNull();
    }
    expect(screen.getByText('Weitere Angaben')).toBeInTheDocument();
  });

  it('ein Artikel mit Warengruppe: offen', async () => {
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Fitting', stock: 0, warengruppe: '1201' } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(aufklapper(await screen.findByLabelText(/Warengruppe/))).toHaveAttribute('open');
  });

  it('ein Artikel ohne seltene Angaben: zugeklappt; ein eingetroffener Einkaufspreis öffnet', async () => {
    materialien = [{ id: 'm1', companyId: 'perl', name: 'Fitting', stock: 0, verkaufspreis: 0 } as WithId<Material>];
    const nutzer = userEvent.setup();
    zeige();
    await ersterArtikel(nutzer);
    expect(aufklapper(await screen.findByLabelText(/Warengruppe/))).not.toHaveAttribute('open');
    cleanup();
    angemeldet = CHEF;
    preisLaden = async () => new Map([['m1', 4]]);
    zeige();
    await ersterArtikel(nutzer);
    await waitFor(() => expect(aufklapper(screen.getByLabelText(/Einkaufspreis/))).toHaveAttribute('open'));
  });

  it('was im Aufklapper steht, wird mit gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await neuesMaterial(nutzer);
    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Fitting');
    await nutzer.click(screen.getByText('Weitere Angaben'));
    await nutzer.type(screen.getByLabelText(/Warengruppe/), '1201');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Fitting', warengruppe: '1201' });
  });
});
