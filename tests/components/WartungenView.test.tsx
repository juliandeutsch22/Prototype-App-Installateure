import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Role, Wartung } from '@/types';

/**
 * Die Wartungsansicht — geprüft wird der ABLAUF, nicht die Liste.
 *
 * Der Wert dieses Bereichs hängt an einem einzigen Schritt: dem Eintragen der
 * erledigten Wartung, mit dem der nächste Termin nachrückt. Ohne ihn wäre das
 * hier nach einem Jahr eine Sammlung roter Zeilen, die niemand mehr ansieht —
 * dieselbe Karteileiche wie vorher im Kalender, nur auf einem Bildschirm.
 *
 * Deshalb prüft dieser Test genau das: was die Ansicht als anstehend zeigt,
 * und was beim Eintragen tatsächlich in die Datenschicht geht.
 */

/**
 * „Heute" im Test. Fest verdrahtet, weil die Ansicht `todayStr()` benutzt —
 * ein Test, der mit dem echten Datum rechnet, hätte an genau einem Tag im
 * Jahr ein anderes Ergebnis.
 */
const HEUTE = '2026-06-01';
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => HEUTE };
});

const wartung = (
  id: string,
  customerName: string,
  faelligAm: string,
  extra: Partial<Wartung> = {},
): Wartung & { id: string } => ({
  id,
  companyId: 'perl',
  customerId: `k-${id}`,
  customerName,
  anlage: 'Therme Vaillant ecoTEC',
  intervallMonate: 12,
  faelligAm,
  aktiv: true,
  ...extra,
});

/*
  Vier Vereinbarungen, die zusammen die ganze Skala abdecken: längst
  überfällig, in zwei Wochen fällig, erst im Herbst, und eine ruhende, die
  trotz weit zurückliegendem Termin NICHT anstehen darf.
*/
let bestand: (Wartung & { id: string })[] = [];

const listWartungen = vi.fn(async () => bestand);
const wartungErledigt = vi.fn(async () => undefined);
const createWartung = vi.fn(async () => 'neu');
const updateWartung = vi.fn(async () => undefined);

vi.mock('@/lib/db/wartungen', () => ({
  listWartungen: () => listWartungen(),
  createWartung: (...a: unknown[]) => createWartung(...(a as [])),
  updateWartung: (...a: unknown[]) => updateWartung(...(a as [])),
  deleteWartung: vi.fn(async () => undefined),
  wartungErledigt: (...a: unknown[]) => wartungErledigt(...(a as [])),
}));

const kunden: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Nord' },
];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));

let rolle: Role = 'Geschäftsführung';
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'chef',
      email: 'chefin@perl.at',
      name: 'Julian Deutsch',
      role: rolle,
      companyId: 'perl',
      docId: 'chef',
    },
    company: { id: 'perl', name: 'Perl Installationen' },
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    reloadCompany: vi.fn(),
  }),
}));

const { default: WartungenView } = await import('@/features/maintenance/WartungenView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WartungenView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rolle = 'Geschäftsführung';
  bestand = [
    wartung('w1', 'Bäckerei Stein', '2026-04-10', { zuletztAm: '2025-04-10' }),
    wartung('w2', 'Hausverwaltung Nord', '2026-06-14'),
    wartung('w3', 'Familie Huber', '2026-11-02'),
    wartung('w4', 'Gasthaus Alt', '2025-01-01', { aktiv: false }),
  ];
  listWartungen.mockClear();
  wartungErledigt.mockClear();
  createWartung.mockClear();
  updateWartung.mockClear();
});

/**
 * Der Abschnitt „Steht an" als eigener Bereich, ohne den Bestand darunter.
 *
 * GEWARTET WIRD AUF DIE DATEN, NICHT AUF DIE ÜBERSCHRIFT. Die Karte trägt
 * ihren Titel schon während des Ladens — „Steht an (0)" neben einem
 * Skelettblock. Ein `findByText(/^Steht an/)` ist damit sofort erfüllt, und
 * die Zusicherung danach läuft gegen den Ladezustand.
 *
 * Genau daran ist der Testlauf auf `main` gescheitert, nachdem er im
 * Zweig zweimal grün war: der Fehler hing an der Laufzeit der Maschine, nicht
 * am Code. Ein Test, der von der Tagesform abhängt, ist schlimmer als keiner
 * — er blockiert den Deploy und man sucht die Ursache im Falschen.
 */
async function anstehendeZeilen() {
  /*
    Irgendeine echte Zeile: sie erscheint erst, wenn die Abfrage zurück ist.
    `findAll`, weil dieselbe Vereinbarung zweimal auf dem Schirm steht — oben
    unter „Steht an", darunter im Bestand.
  */
  await screen.findAllByText(/Bäckerei Stein/);
  const ueberschrift = screen.getByText(/^Steht an/);
  const karte = ueberschrift.closest('section');
  if (!karte) throw new Error('Abschnitt „Steht an" nicht gefunden');
  return within(karte as HTMLElement);
}

/** Wartet, bis die Ansicht fertig geladen hat — für Tests ohne Zeilenbezug. */
async function geladen() {
  await screen.findAllByText(/Familie Huber/);
}

describe('Wartungen', () => {
  it('zeigt oben nur, was wirklich ansteht', async () => {
    zeichne();
    const an = await anstehendeZeilen();

    // Überfällig und binnen Vorlauf fällig: ja.
    expect(an.getByText(/Bäckerei Stein/)).toBeTruthy();
    expect(an.getByText(/Hausverwaltung Nord/)).toBeTruthy();
    // Im November: nein.
    expect(an.queryByText(/Familie Huber/)).toBeNull();
    /*
      Die ruhende Vereinbarung ist der Fall, der ohne eigene Prüfung
      durchrutscht: ihr Termin liegt über ein Jahr zurück, sie wäre unter
      jeder reinen Datumsbetrachtung die dringendste Zeile der Seite.
    */
    expect(an.queryByText(/Gasthaus Alt/)).toBeNull();
  });

  it('nennt die Überfälligkeit in Tagen, nicht nur als Farbe', async () => {
    zeichne();
    const an = await anstehendeZeilen();
    // 10. April bis 1. Juni sind 52 Tage.
    expect(an.getByText('Seit 52 Tagen überfällig.')).toBeTruthy();
  });

  it('trägt eine erledigte Wartung ein und rückt den Termin nach', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));

    /*
      Der Dialog nennt den künftigen Termin, BEVOR jemand bestätigt. Wer eine
      Wartung einträgt, verschiebt damit eine Zusage um ein Jahr; das soll
      nicht erst hinterher in der Liste auffallen.
    */
    expect(screen.getByText(/Nächster Termin: 1\.6\.2027/)).toBeTruthy();

    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(wartungErledigt).toHaveBeenCalledWith('w1', {
      erledigtAm: HEUTE,
      intervallMonate: 12,
      projectNumber: undefined,
    });
  });

  it('rechnet den neuen Termin mit dem im Dialog geänderten Intervall', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));

    await nutzer.selectOptions(screen.getByLabelText('Intervall ab jetzt'), '24');
    // Zwei Jahre, nicht eines — und die Vorschau sagt es vor dem Bestätigen.
    expect(screen.getByText(/Nächster Termin: 1\.6\.2028/)).toBeTruthy();

    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(wartungErledigt).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ intervallMonate: 24 }),
    );
  });

  it('lädt die Liste nach dem Eintragen neu, damit der Termin nicht alt stehenbleibt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();
    expect(listWartungen).toHaveBeenCalledTimes(1);

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));
    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(listWartungen).toHaveBeenCalledTimes(2);
  });

  it('bietet der Verwaltung kein Eintragen an — sie darf es serverseitig nicht', async () => {
    rolle = 'Verwaltung';
    zeichne();
    const an = await anstehendeZeilen();
    expect(an.getByText(/Bäckerei Stein/)).toBeTruthy();
    expect(an.queryByRole('button', { name: 'Erledigt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Neue Wartung' })).toBeNull();
  });

  it('legt keine Wartung ohne Termin an', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Anlage'), 'Therme im Stiegenhaus');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(createWartung).not.toHaveBeenCalled();
    expect(await screen.findByText(/Ohne Termin wüsste niemand/)).toBeTruthy();
  });

  it('schlägt aus der letzten Wartung den nächsten Termin vor', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    const zuletzt = screen.getByLabelText('Zuletzt gewartet') as HTMLInputElement;
    await nutzer.type(zuletzt, '2026-03-15');
    await nutzer.tab();

    expect((screen.getByLabelText('Nächster Termin') as HTMLInputElement).value).toBe('2027-03-15');
  });
});
