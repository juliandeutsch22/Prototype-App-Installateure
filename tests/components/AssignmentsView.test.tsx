import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, EinsatzMaterial, Material, Project, Vacation } from '@/types';
import AssignmentsView from '@/features/assignments/AssignmentsView';

/**
 * Die Einsatzplanung — die Ansicht, die als einzige Daten LÖSCHT, und bis
 * jetzt ohne eigenen Test.
 *
 * Das Speichern ist ein „alles weg, dann alles neu" für das Paar aus Tag und
 * Baustelle. Das ist richtig so — aber es heißt, dass ein Speichern mit
 * leerer Auswahl die Planung eines Tages spurlos entfernen würde. Genau
 * daran hängt hier der wichtigste Test.
 */

const PROJEKT: Project & { id: string } = {
  id: 'p1',
  companyId: 'perl',
  projectNumber: '2026-042',
  customerName: 'Familie Huber',
  status: 'Aktiv',
} as Project & { id: string };

const MONTEUR: AppUser = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
} as AppUser;
const KOLLEGE: AppUser = { ...MONTEUR, id: 'u2', uid: 'u2', name: 'Erna Beispiel' } as AppUser;

const HEUTE = '2026-09-01';

let einsaetze: (Assignment & { id: string })[] = [];
let urlaube: (Vacation & { id: string })[] = [];
let ladefehler = false;

const speichere = vi.fn();
const loesche = vi.fn();

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => {
    if (ladefehler) throw new Error('kein Netz');
    return [PROJEKT];
  }),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => [MONTEUR, KOLLEGE]) }));
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => urlaube),
}));
vi.mock('@/lib/db/assignments', () => ({
  subscribeAssignmentsForMonth: (
    _c: string,
    _j: number,
    _m: number,
    cb: (rows: (Assignment & { id: string })[]) => void,
  ) => {
    cb(einsaetze);
    return () => undefined;
  },
  saveAssignments: (...a: unknown[]) => {
    speichere(...a);
    return Promise.resolve();
  },
  deleteAssignment: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
}));

const MATERIAL: (Material & { id: string })[] = [
  { id: 'm1', companyId: 'perl', name: 'Eckventil 1/2', category: 'Armaturen', stock: 10, unit: 'Stk' } as Material & { id: string },
  { id: 'm2', companyId: 'perl', name: 'Mischbatterie', category: 'Armaturen', stock: 1, unit: 'Stk' } as Material & { id: string },
];

let ruestlisten: (EinsatzMaterial & { id: string })[] = [];
const ruestSpeichern = vi.fn();
const anforderungAnlegen = vi.fn();

vi.mock('@/lib/db/materials', () => ({
  subscribeMaterials: (_c: string, cb: (r: (Material & { id: string })[]) => void) => {
    cb(MATERIAL);
    return () => undefined;
  },
  LOW_STOCK_THRESHOLD: 3,
}));
vi.mock('@/lib/db/materialOrders', () => ({
  createMaterialOrder: (...a: unknown[]) => {
    anforderungAnlegen(...a);
    return Promise.resolve();
  },
}));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  subscribeEinsatzMaterialForDate: (
    _c: string,
    _d: string,
    cb: (r: (EinsatzMaterial & { id: string })[]) => void,
  ) => {
    cb(ruestlisten);
    return () => undefined;
  },
  saveEinsatzMaterial: (...a: unknown[]) => {
    ruestSpeichern(...a);
    return Promise.resolve();
  },
}));

const authWert = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige(zustand?: { datum?: string; projectNumber?: string }) {
  // Die Ansicht liest Tag und Baustelle aus dem Router-Zustand — so kommt
  // man vom Wochenplan hierher, ohne den Tag noch einmal zu suchen.
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/assignments/tag', state: zustand ?? null }]}>
      <ToastProvider>
        <AssignmentsView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  einsaetze = [];
  urlaube = [];
  ruestlisten = [];
  ladefehler = false;
  speichere.mockClear();
  loesche.mockClear();
  ruestSpeichern.mockClear();
  anforderungAnlegen.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Einsatzplanung — speichern', () => {
  it('schickt genau die gewählten Leute an den Tag und die Baustelle', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }));

    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const [, datum, baustelle, zeilen] = speichere.mock.calls[0];
    expect(datum).toBe(HEUTE);
    expect(baustelle).toBe('2026-042');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ userId: 'u1', asHelper: false, projectNumber: '2026-042' });
  });

  it('nimmt den Helfer-Haken mit — er kostet bare Münze', async () => {
    // Ein Helfer wird mit einem anderen Satz verrechnet. Geht der Haken beim
    // Speichern verloren, steht am Monatsende der falsche Betrag auf der
    // Rechnung, und niemand sucht ihn in der Einsatzplanung.
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'als Helfer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }));

    await waitFor(() => expect(speichere).toHaveBeenCalled());
    expect(speichere.mock.calls[0][3][0].asHelper).toBe(true);
  });

  it('übernimmt eine vorhandene Planung ins Formular', async () => {
    /**
     * DER GEFÄHRLICHSTE FALL DIESER ANSICHT — und er ist bereits abgesichert.
     * Speichern heißt „alle Einsätze dieses Tages auf dieser Baustelle
     * löschen, dann die ausgewählten neu anlegen". Startete das Formular
     * leer, hätte eine Änderung am Kommentar die ganze Mannschaft entfernt.
     * Deshalb kommt die bestehende Planung mit, sobald Tag und Baustelle
     * stehen.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann', asHelper: true,
      } as Assignment & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked());
    // Auch der Helfer-Haken kommt mit — sonst wäre er nach dem nächsten
    // Speichern weg, und die Stunden gingen zum vollen Satz auf die Rechnung.
    expect(screen.getByRole('checkbox', { name: 'als Helfer' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Erna Beispiel/ })).not.toBeChecked();
  });

  it('verweigert das Speichern, wenn die Auswahl leer gemacht wird', async () => {
    /**
     * Wer alle Haken entfernt und speichert, meint fast nie „lösche den Tag".
     * Weil das Speichern aber genau das täte, sagt die Ansicht, wo das
     * Löschen wirklich steht — statt es stillschweigend auszuführen.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked());

    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }));

    expect(await screen.findByText(/Kein Mitarbeiter ausgewählt/)).toBeInTheDocument();
    expect(speichere).not.toHaveBeenCalled();
  });
});

describe('Einsatzplanung — Urlaub', () => {
  it('warnt, bevor jemand im genehmigten Urlaub eingeteilt wird', async () => {
    /**
     * Verboten wird es nicht — bei einem Notdienst holt man auch mal jemanden
     * aus dem Urlaub. Aber es muss dabeistehen, BEVOR der Haken sitzt: ein
     * Urlaub, der erst am Einsatztag auffällt, ist doppelte Arbeit für alle.
     */
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann',
        von: '2026-08-30', bis: '2026-09-05', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));

    expect(await screen.findByText(/im genehmigten/)).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann', { selector: 'strong' })).toBeInTheDocument();
  });

  it('warnt NICHT bei jemandem, der nicht im Urlaub ist', async () => {
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u1', userName: 'Max Mustermann',
        von: '2026-08-30', bis: '2026-09-05', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    zeige();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Erna Beispiel/ }));

    expect(screen.queryByText(/im genehmigten/)).toBeNull();
  });
});

describe('Einsatzplanung — löschen', () => {
  it('fragt vor dem Löschen nach und löscht erst nach der Bestätigung', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();

    const zeile = (await screen.findAllByText('Max Mustermann'))[0].closest('li') as HTMLElement;
    await userEvent.click(within(zeile).getByRole('button', { name: /löschen|entfernen/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Einsatz löschen?');
    expect(loesche).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a1'));
  });
});

describe('Einsatzplanung — wenn etwas nicht lädt', () => {
  it('sagt es, statt eine leere Baustellenliste zu zeigen', async () => {
    ladefehler = true;
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Baustellen konnte nicht geladen werden.',
    );
  });
});

describe('Einsatzplanung — wen habe ich vergessen', () => {
  /**
   * BEI ZWANZIG MITARBEITERN BEHAELT DAS NIEMAND IM KOPF. Die Ansicht
   * beantwortete bisher nur „wer ist auf DIESER Baustelle". Die andere
   * Haelfte der Planung — wer hat an diesem Tag ueberhaupt keinen Einsatz —
   * musste man sich aus den einzelnen Baustellen zusammensuchen.
   */
  it('nennt die Mitarbeiter ohne Einsatz an diesem Tag', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();

    const zeile = await screen.findByText(/Noch nicht eingeteilt/);
    expect(zeile.parentElement).toHaveTextContent('Erna Beispiel');
    // Max steht auf einer Baustelle — er darf hier gerade NICHT stehen.
    expect(zeile.parentElement).not.toHaveTextContent('Max Mustermann');
  });

  it('laesst wen im Urlaub heraus', async () => {
    // Wer frei hat, ist nicht vergessen, sondern abwesend. Stuende er in der
    // Zeile, waere sie an jedem Urlaubstag voller Namen, die niemand
    // einteilen will — und damit wertlos.
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u2', userName: 'Erna Beispiel',
        von: '2026-08-30', bis: '2026-09-05', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    // Erst warten, bis die Belegschaft da ist. Ohne das griff die Zusicherung
    // im Leerlauf: mit leerer Liste ist die Luecke leer, und die Zeile sagte
    // „alle sind eingeteilt", ohne einen einzigen Namen zu kennen.
    await screen.findByRole('checkbox', { name: /^Erna Beispiel/ });

    expect(await screen.findByText(/Alle verfügbaren Mitarbeiter sind/)).toBeInTheDocument();
  });

  it('behauptet nichts, solange die Belegschaft noch nicht geladen ist', async () => {
    /**
     * DER FEHLER, DEN DIE GEGENPROBE ANS LICHT GEBRACHT HAT. Beim ersten
     * Bild ist die Mitarbeiterliste leer — und eine leere Luecke las sich
     * als „Alle verfügbaren Mitarbeiter sind an diesem Tag eingeteilt".
     * Das ist keine Aussage, sondern eine Behauptung ueber Daten, die noch
     * gar nicht da sind.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    const { container } = zeige();
    expect(container.textContent).not.toContain('Alle verfügbaren Mitarbeiter');
    expect(container.textContent).not.toContain('Noch nicht eingeteilt');
  });

  it('schweigt, solange an dem Tag ueberhaupt nichts geplant ist', async () => {
    // Sonst listete die Zeile die ganze Belegschaft und saegte an ihrem
    // eigenen Wert: eine Luecke ist nur dort eine, wo schon geplant wurde.
    zeige();
    await screen.findByText('Keine Einsätze an diesem Tag.');
    expect(screen.queryByText(/Noch nicht eingeteilt/)).toBeNull();
  });
});

describe('Einsatzplanung — Rüstliste', () => {
  /**
   * Die Liste sagt „nimm das mit", nicht „das muss besorgt werden". Sie darf
   * deshalb weder den Lagerstand bewegen noch von selbst eine Anforderung
   * auslösen: die Verwaltung bekäme eine Arbeitsliste voller Dinge, die im
   * Regal stehen, und der Bestand würde zweimal abgezogen.
   */
  async function baustelleWaehlen() {
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Baustelle/ }),
      '2026-042',
    );
  }

  it('nimmt einen Artikel aus dem Lager auf und speichert ihn', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await baustelleWaehlen();

    await userEvent.type(
      await screen.findByRole('searchbox', { name: /Artikel aus dem Lager/ }),
      'Eckventil',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Eckventil 1\/2 auf die Rüstliste/ }));
    /*
      EIN Knopf fuer beides. Gemeldet: „das ist ein zusätzlicher Knopfdruck,
      auf den man potenziell vergessen kann." Und vergessen faellt nicht auf
      — die ausgefuellte Liste steht ja da; auffallen wuerde es erst dem
      Monteur am naechsten Morgen, wenn er ohne Material losfaehrt.
    */
    await userEvent.click(
      screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }),
    );

    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());
    expect(speichere).toHaveBeenCalled();
    const [, datum, baustelle, positionen, uids] = ruestSpeichern.mock.calls[0];
    expect(datum).toBe(HEUTE);
    expect(baustelle).toBe('2026-042');
    expect(positionen).toHaveLength(1);
    expect(positionen[0]).toMatchObject({ materialId: 'm1', name: 'Eckventil 1/2', menge: 1 });
    // `uids` kommt aus der Mannschaft, die GERADE geschrieben wurde — an ihm
    // haengt die Regel, die entscheidet, wer abhaken darf.
    expect(uids).toEqual(['u1']);
  });

  it('übernimmt eine vorhandene Liste ins Formular', async () => {
    /**
     * DERSELBE GEFÄHRLICHE FALL WIE BEI DER MANNSCHAFT. Startete das Formular
     * leer, hätte ein Speichern die geplante Liste gelöscht — und der Monteur
     * führe am nächsten Morgen ohne Material los.
     */
    ruestlisten = [
      {
        id: 'perl_2026-09-01_2026-042', companyId: 'perl', date: HEUTE,
        projectNumber: '2026-042', uids: ['u1'],
        positionen: [{ id: 'p1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 }],
      } as EinsatzMaterial & { id: string },
    ];
    zeige();
    await baustelleWaehlen();

    expect(await screen.findByDisplayValue('4')).toBeInTheDocument();
    expect(screen.getByText('Eckventil 1/2')).toBeInTheDocument();
  });

  it('meldet eine Unterdeckung und legt NUR auf Tipp eine Anforderung an', async () => {
    /**
     * Nie von selbst: der Planer weiß vielleicht, dass morgen eine Lieferung
     * kommt oder das Teil schon im Bus liegt. Eine Schreibung in die
     * Arbeitsliste eines anderen, auf Grundlage einer Vermutung, ist genau
     * die Sorte Funktion, die das Vertrauen in die App kostet.
     */
    zeige();
    await baustelleWaehlen();
    await userEvent.type(
      await screen.findByRole('searchbox', { name: /Artikel aus dem Lager/ }),
      'Mischbatterie',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Mischbatterie auf die Rüstliste/ }));

    // Lager hat 1 — bei Menge 3 fehlen 2.
    const menge = screen.getByRole('spinbutton', { name: 'Menge' });
    await userEvent.clear(menge);
    await userEvent.type(menge, '3');

    expect(await screen.findByText(/Im Lager fehlen/)).toBeInTheDocument();
    expect(anforderungAnlegen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Anforderung über 2 anlegen/ }));
    await waitFor(() => expect(anforderungAnlegen).toHaveBeenCalled());
    expect(anforderungAnlegen.mock.calls[0][1]).toMatchObject({
      materialName: 'Mischbatterie',
      quantity: 2,
      projectNumber: '2026-042',
      transactionType: 'order',
      status: 'Offen',
    });
  });

  it('meldet KEINE Unterdeckung bei einer freien Zeile', async () => {
    // Eine freie Zeile („Leihgerät Kernbohrer") hat keinen Lagerstand.
    // „0 von 1 vorhanden" wäre dort eine Falschaussage statt einer Warnung.
    zeige();
    await baustelleWaehlen();
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Freie Zeile/ }),
      'Leihgerät Kernbohrer',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(await screen.findByText('Leihgerät Kernbohrer')).toBeInTheDocument();
    expect(screen.queryByText(/Im Lager fehlen/)).toBeNull();
  });

  it('speichert nicht, solange eine freie Zeile nur eingetippt ist', async () => {
    /*
      Dieselbe Naht wie am Handwerksschein, gefunden beim Probelauf: die
      freie Zeile kommt erst mit „Hinzufügen" auf die Liste. Wer sie eintippt
      und gleich speichert, verlor sie still — und der Monteur stand ohne das
      Leihgerät auf der Baustelle.
    */
    zeige();
    await baustelleWaehlen();
    const feld = await screen.findByRole('textbox', { name: /Freie Zeile/ });
    await userEvent.type(feld, 'Leihgerät Kernbohrer');

    const knopf = screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText(/Noch nicht auf der Rüstliste/).parentElement).toHaveTextContent(
      /„Leihgerät Kernbohrer"/,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.queryByText(/Noch nicht auf der Rüstliste/)).toBeNull();
    expect(knopf).toBeEnabled();
  });

  it('gibt der Liste die Mannschaft aus DEMSELBEN Speichern mit', async () => {
    /*
      DIE REIHENFOLGE, DIE ES VORHER GAB, IST DAMIT WEG.

      An der Kennungsliste haengt die Regel, die entscheidet, wer abhaken
      darf. Solange die Ruestliste getrennt gespeichert wurde, konnte sie nur
      die BEREITS gespeicherte Einteilung mitbekommen — wer beides in einem
      Zug plante, speicherte eine Liste, die noch niemanden kannte, und der
      Monteur kam am naechsten Morgen beim Antippen nicht durch. Die Ansicht
      musste diese Reihenfolge eigens erklaeren.

      Jetzt kommen die Kennungen aus der Mannschaft, die im selben Vorgang
      geschrieben wird. Hier ist vorher NICHTS eingeteilt.
    */
    zeige();
    await baustelleWaehlen();
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Freie Zeile/ }),
      'Dichtungen',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await userEvent.click(
      screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }),
    );

    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());
    expect(ruestSpeichern.mock.calls[0][4]).toEqual(['u1']);
  });

  it('speichert auch eine LEERE Liste, wenn vorher eine da war', async () => {
    /*
      Der Gegenfall zum Nicht-Anlegen. Wer die letzte Zeile herausnimmt, will
      die Liste loswerden — wuerde dann gar nicht geschrieben, staende am
      naechsten Morgen die alte Liste im Bus des Monteurs, und er laedt
      Material ein, das niemand mehr braucht.
    */
    ruestlisten = [
      {
        id: 'perl_2026-09-01_2026-042', companyId: 'perl', date: HEUTE,
        projectNumber: '2026-042', uids: ['u1'],
        positionen: [{ id: 'p1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 }],
      } as EinsatzMaterial & { id: string },
    ];
    zeige();
    await baustelleWaehlen();
    await screen.findByDisplayValue('4');
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));

    await userEvent.click(
      screen.getByRole('button', { name: /Eckventil 1\/2 von der Rüstliste nehmen/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }),
    );

    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());
    expect(ruestSpeichern.mock.calls[0][3]).toEqual([]);
  });

  it('legt KEINE leere Liste an, wenn nie Material erfasst wurde', async () => {
    // Sonst entstuende fuer jeden Einsatz ein leeres Materialdokument —
    // Ballast in der Datenbank, in der Ausleitung und in der Sicherung.
    zeige();
    await baustelleWaehlen();
    await userEvent.click(screen.getByRole('checkbox', { name: /^Max Mustermann/ }));

    await userEvent.click(
      screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' }),
    );

    await waitFor(() => expect(speichere).toHaveBeenCalled());
    expect(ruestSpeichern).not.toHaveBeenCalled();
  });

  it('zeigt ohne gewählte Baustelle gar keine Rüstliste', async () => {
    // Eine Rüstliste ohne Baustelle gehört zu nichts.
    zeige();
    await screen.findByRole('combobox', { name: /Baustelle/ });
    expect(screen.queryByText('Material für diesen Einsatz')).toBeNull();
  });
});

describe('Einsatzplanung — Übergabe vom Wochenplan', () => {
  /**
   * Im Wochenplan steht, WER wann frei ist; eingetragen wird hier. Ohne die
   * Übergabe müsste man nach jedem Tipp im Brett den Tag noch einmal im
   * Kalender suchen — und genau dieser Umweg macht aus zwei Ansichten zwei
   * getrennte Werkzeuge statt eines Ablaufs.
   */
  it('übernimmt Tag und Baustelle', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: '2026-09-04', projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige({ datum: '2026-09-04', projectNumber: '2026-042' });

    // Der Kalender steht auf dem übergebenen Tag …
    expect(await screen.findByText(/Einsatz planen — Fr\., 04\.09\.2026/)).toBeInTheDocument();
    // … und die Baustelle ist gewählt, also kommt die vorhandene Planung mit.
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked(),
    );
  });

  it('nimmt ohne Übergabe den heutigen Tag', async () => {
    zeige();
    expect(await screen.findByText(/Einsatz planen — Di\., 01\.09\.2026/)).toBeInTheDocument();
  });
});
