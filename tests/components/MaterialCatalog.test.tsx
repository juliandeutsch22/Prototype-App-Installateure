import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  kundenAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
  baustellenAuswahlAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
}));

/* Mit welcher Grenze zuletzt abonniert wurde — der Nachladeknopf hebt sie an. */
let letzteGrenze = 0;

vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  subscribeMaterials: (
    _c: string,
    cb: (rows: WithId<Material>[]) => void,
    _onError: (e: Error) => void,
    grenze: number,
  ) => {
    letzteGrenze = grenze;
    cb(materialien);
    return () => undefined;
  },
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
    expect(await screen.findByLabelText(/Einkaufspreis/)).toBeInTheDocument();
  });

  it('wird der Verwaltung gar nicht angeboten', async () => {
    zeige();
    // Der Verkaufspreis ist da — es fehlt nicht das Formular, sondern das Feld.
    expect(await screen.findByLabelText(/Verkaufspreis/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Einkaufspreis/)).not.toBeInTheDocument();
  });

  it('geht mit, wenn die Geschäftsführung ihn einträgt', async () => {
    angemeldet = CHEF;
    const nutzer = userEvent.setup();
    zeige();

    await nutzer.type(await screen.findByLabelText(/Bezeichnung/), 'Eckventil');
    await nutzer.type(screen.getByLabelText(/Einkaufspreis/), '3.5');
    await nutzer.click(screen.getByRole('button', { name: 'Material anlegen' }));

    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(anlegen.mock.calls[0][1]).toMatchObject({ name: 'Eckventil', einkaufspreis: 3.5 });
  });

  it('fehlt im Datensatz der Verwaltung ganz — nicht als 0', async () => {
    const nutzer = userEvent.setup();
    zeige();

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

    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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

    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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

    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
    expect(screen.queryByRole('textbox', { name: /Lagerbestand|Anfangsbestand/ })).toBeNull();
    expect(screen.getByText(/über Wareneingang oder Inventur/)).toBeInTheDocument();
  });

  it('steht beim Anlegen immer drin — als Anfangsbestand', async () => {
    const nutzer = userEvent.setup();
    zeige();
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
describe('Materialkatalog — wie weit die Liste reicht', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `m${i}`,
        companyId: 'perl',
        name: `Artikel ${i}`,
        stock: 10,
      }) as WithId<Material>,
    );

  it('holt mit der Grenze, nicht unbegrenzt', async () => {
    materialien = viele(2);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(letzteGrenze).toBe(3);
  });

  it('schweigt, solange die Grenze nicht greift', async () => {
    materialien = viele(2);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(screen.queryByRole('button', { name: /Weitere Artikel laden/ })).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist — samt Reichweite der Suche', async () => {
    materialien = viele(3);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(screen.getByRole('button', { name: /Weitere Artikel laden/ })).toBeInTheDocument();
    // Der zweite Satz ist der wichtigere: wer einen Artikel sucht und nichts
    // findet, soll nicht schliessen, es gebe ihn nicht.
    expect(screen.getByText(/nur in diesen gesucht/)).toBeInTheDocument();
  });

  it('holt beim Nachladen tatsächlich mehr', async () => {
    materialien = viele(3);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(letzteGrenze).toBe(3);

    await nutzer.click(screen.getByRole('button', { name: /Weitere Artikel laden/ }));
    expect(letzteGrenze).toBe(6);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
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
    await nutzer.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
    await waitFor(() => expect(screen.getByLabelText(/Einkaufspreis/)).toHaveValue('10,00'));
    expect(screen.queryByText(/Vorschlag:/)).toBeNull();
  });
});
