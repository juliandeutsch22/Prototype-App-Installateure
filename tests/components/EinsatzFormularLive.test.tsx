import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, EinsatzMaterial, Material, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import EinsatzFormular from '@/features/assignments/EinsatzFormular';
import { PaarGeaendert } from '@/lib/db/paarFassung';
import { RuestlisteFrage, type RuestlisteErgebnis, type RuestlisteWahl } from '@/lib/db/ruestlisteFrage';

/**
 * DAS OFFENE EINSATZFORMULAR UND DIE LIVE-DATEN (Durchsicht 15.11.2026, P1).
 *
 * Einteilung und Rüstlisten des Tages kommen live herein, und JEDE Meldung
 * des Betriebs bringt neue Listen — auch wenn ein Monteur auf einer ganz
 * anderen Baustelle eine Position abhakt. Das Formular setzte bei jeder
 * davon Mannschaft, Aufgabe, Uhrzeit und Rüstliste auf den gespeicherten
 * Stand zurück; ungespeicherte Eingaben waren still weg.
 *
 * Geprüft wird das Formular selbst: die Live-Daten kommen als neue Props,
 * genau so, wie Tagesplanung und Seitenfenster sie hereinreichen.
 */

const TAG = '2026-09-01';
const HIER = '2026-042';
const DORT = '2026-043';

const PROJEKTE = [
  { id: 'p1', companyId: 'perl', projectNumber: HIER, customerName: 'Familie Huber', status: 'Aktiv' },
  { id: 'p2', companyId: 'perl', projectNumber: DORT, customerName: 'Firma Gruber', status: 'Aktiv' },
] as (Project & { id: string })[];

const MAX = {
  id: 'u1', companyId: 'perl', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
} as AppUser;
const ERNA = { ...MAX, id: 'u2', uid: 'u2', name: 'Erna Beispiel' } as AppUser;
const PAUL = { ...MAX, id: 'u3', uid: 'u3', name: 'Paul Neu' } as AppUser;
const LEUTE = [ERNA, MAX, PAUL];

const MATERIAL = [
  { id: 'm1', companyId: 'perl', name: 'Eckventil 1/2', category: 'Armaturen', stock: 10, unit: 'Stk' },
  { id: 'm2', companyId: 'perl', name: 'Mischbatterie', category: 'Armaturen', stock: 5, unit: 'Stk' },
] as (Material & { id: string })[];

const speichere = vi.fn();
const ruestSpeichern = vi.fn();
const loesche = vi.fn();
/** Wie die Datenbank auf „Einsatz löschen“ antwortet — ab Werk: gelöscht, keine Liste verwaist. */
let loeschenAntwort: (id: string, wahl: RuestlisteWahl) => Promise<RuestlisteErgebnis | null>;
/** Was die Datenbank beim nächsten Speichern ablehnt — der Reihe nach. */
const abweisen: { einsatz: unknown[]; liste: unknown[] } = { einsatz: [], liste: [] };

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' },
    company: { id: 'perl', name: 'Perl Installationen' },
    einblick: null,
  }),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => PROJEKTE),
  listProjectsByNumbers: vi.fn(async (_c: string, nrn: string[]) => PROJEKTE.filter((p) => nrn.includes(p.projectNumber))),
  listRecentProjects: vi.fn(async () => []),
}));
vi.mock('@/lib/db/materials', () => ({
  subscribeMaterials: (_c: string, cb: (r: (Material & { id: string })[]) => void) => {
    cb(MATERIAL);
    return () => undefined;
  },
  sucheKatalog: async (_c: string, q: string) => MATERIAL.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())),
  katalogNachIds: async () => [],
  lagerFrei: async () => new Map(),
  LOW_STOCK_THRESHOLD: 3,
}));
// Ohne Deckung rechnet das Formular mit dem Bestand — für diese Prüfungen ohne Belang.
vi.mock('@/lib/db/materialdeckung', () => ({
  materialdeckung: async () => {
    throw new Error('nicht geladen');
  },
}));
vi.mock('@/lib/db/materialOrders', () => ({ createMaterialOrder: vi.fn(async () => undefined) }));
vi.mock('@/lib/db/assignments', () => ({
  saveAssignments: (...a: unknown[]) => {
    speichere(...a);
    // Die Datenbank weist ab, solange eine Abweisung ansteht (P1, Fassung des Paares).
    const nein = abweisen.einsatz.shift();
    return nein ? Promise.reject(nein) : Promise.resolve();
  },
  einsatzFolgetage: vi.fn(async () => []),
}));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  saveEinsatzMaterial: (...a: unknown[]) => {
    ruestSpeichern(...a);
    const nein = abweisen.liste.shift();
    if (nein) return Promise.reject(nein);
    return Promise.resolve();
  },
}));

function einsatz(
  id: string,
  wer: AppUser,
  projectNumber = HIER,
  mehr: Partial<Assignment> = {},
): WithId<Assignment> {
  return {
    id, companyId: 'perl', date: TAG, projectNumber, userId: wer.uid, userName: wer.name,
    asHelper: false, comment: 'Rohinstallation', zeitVon: null, zeitBis: null, ...mehr,
  } as WithId<Assignment>;
}

function liste(projectNumber: string, positionen: EinsatzMaterial['positionen'], mehr: Partial<EinsatzMaterial> = {}) {
  return {
    id: `perl_${TAG}_${projectNumber}`, companyId: 'perl', date: TAG, projectNumber, uids: ['u1'],
    positionen, ...mehr,
  } as WithId<EinsatzMaterial>;
}

interface Live {
  einsaetze: WithId<Assignment>[];
  listen: WithId<EinsatzMaterial>[];
  bereit?: boolean;
}

/** Neue Live-Daten, wie sie das Abonnement hereinreicht — immer als neue Arrays. */
let senden: (l: Live) => void = () => undefined;

function Rahmen({ start, anfang, fenster }: { start: string; anfang: Live; fenster?: boolean }) {
  const [baustelle, setBaustelle] = useState(start);
  const [live, setLive] = useState<Live>(anfang);
  senden = (l) => setLive({ einsaetze: [...l.einsaetze], listen: [...l.listen], bereit: l.bereit });
  return (
    <EinsatzFormular
      date={TAG}
      projectNumber={baustelle}
      onProjectNumber={setBaustelle}
      users={LEUTE}
      staff={LEUTE}
      projects={PROJEKTE}
      onProjekt={() => undefined}
      tagesEinsaetze={live.einsaetze}
      urlaube={[]}
      betriebsurlaube={[]}
      termineDesTages={[]}
      tagesListen={live.listen}
      bereit={live.bereit ?? true}
      // Im Seitenfenster: ohne Karten, mit „Einsatz löschen“ je Person.
      karten={fenster ? undefined : { titel: 'Einsatz planen' }}
      onLoeschen={fenster ? (a, wahl) => loeschenAntwort(a.id, wahl) : undefined}
    />
  );
}

function zeige(anfang: Live, start = HIER, fenster = false) {
  return render(
    <ToastProvider>
      <Rahmen start={start} anfang={anfang} fenster={fenster} />
    </ToastProvider>,
  );
}

const ANFANG: Live = {
  einsaetze: [einsatz('a1', MAX)],
  listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 }])],
};

const kommentar = () => screen.getByRole('textbox', { name: 'Kommentar / Aufgabe' }) as HTMLInputElement;
const erna = () => screen.getByRole('checkbox', { name: /^Erna Beispiel/ });
const max = () => screen.getByRole('checkbox', { name: /^Max Mustermann/ });
const speichernKnopf = () => screen.getByRole('button', { name: 'Einsatz und Rüstliste speichern' });
const hinweis = () => screen.queryByText(/Inzwischen geändert/);

/** Was ein Planer in einer Minute zusammenstellt: Erna dazu, neue Aufgabe, Uhrzeit, mehr Eckventile. */
async function eingeben() {
  await waitFor(() => expect(max()).toBeChecked());
  await userEvent.click(erna());
  await userEvent.clear(kommentar());
  await userEvent.type(kommentar(), 'Vorwand setzen');
  await userEvent.type(screen.getByLabelText('Beginn (optional)'), '07:30');
  const menge = await screen.findByRole('textbox', { name: 'Menge' });
  await userEvent.clear(menge);
  await userEvent.type(menge, '6');
}

async function eingabeSteht() {
  expect(erna()).toBeChecked();
  expect(max()).toBeChecked();
  expect(kommentar().value).toBe('Vorwand setzen');
  expect((screen.getByLabelText('Beginn (optional)') as HTMLInputElement).value).toBe('07:30');
  expect(screen.getByRole('textbox', { name: 'Menge' })).toHaveValue('6');
}

beforeEach(() => {
  speichere.mockClear();
  ruestSpeichern.mockClear();
  loesche.mockClear();
  loeschenAntwort = (id) => { loesche(id); return Promise.resolve(null); };
  abweisen.einsatz = [];
  abweisen.liste = [];
});

describe('Einsatzformular — fremde Änderung an einer ANDEREN Baustelle', () => {
  it('lässt Mannschaft, Aufgabe, Uhrzeit und Rüstliste stehen und sagt nichts', async () => {
    zeige(ANFANG);
    await eingeben();

    // Ein Kollege plant die Nachbarbaustelle samt Rüstliste.
    act(() => senden({
      einsaetze: [...ANFANG.einsaetze, einsatz('b1', PAUL, DORT, { comment: 'Therme' })],
      listen: [...ANFANG.listen, liste(DORT, [{ id: 'r9', materialId: 'm2', name: 'Mischbatterie', menge: 1 }])],
    }));

    await eingabeSteht();
    expect(hinweis()).toBeNull();
    expect(speichernKnopf()).toBeEnabled();
    // Was die Nachbarbaustelle betrifft, sieht man trotzdem: Paul ist jetzt dort.
    expect(screen.getByText(/schon eingeteilt: Firma Gruber/)).toBeInTheDocument();
  });

  it('ein Monteur hakt auf DIESER Liste ab — die Positionen sind dieselben, nichts springt', async () => {
    zeige(ANFANG);
    await eingeben();

    act(() => senden({
      einsaetze: [...ANFANG.einsaetze],
      listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 }], {
        geladen: { r1: { von: 'Max Mustermann', am: Date.UTC(2026, 8, 1, 4, 12) } },
      })],
    }));

    await eingabeSteht();
    expect(hinweis()).toBeNull();
  });
});

describe('Einsatzformular — fremde Änderung an DIESEM Tag und DIESER Baustelle', () => {
  const FREMD: Live = {
    einsaetze: [einsatz('a7', MAX, HIER, { comment: 'Silikon' }), einsatz('a8', PAUL, HIER, { comment: 'Silikon' })],
    listen: [liste(HIER, [
      { id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 2 },
      { id: 'r2', materialId: 'm2', name: 'Mischbatterie', menge: 1 },
    ])],
  };

  it('die Eingabe bleibt stehen, ein Hinweis sagt es — und Speichern wartet auf die Entscheidung', async () => {
    zeige(ANFANG);
    await eingeben();

    act(() => senden(FREMD));

    await eingabeSteht();
    expect(hinweis()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeInTheDocument();
    // Nicht still überschreiben: erst entscheiden, dann speichern.
    expect(speichernKnopf()).toBeDisabled();
  });

  it('„Übernehmen“ holt den neuen Stand ins Formular', async () => {
    zeige(ANFANG);
    await eingeben();
    act(() => senden(FREMD));
    await userEvent.click(await screen.findByRole('button', { name: 'Übernehmen' }));

    expect(kommentar().value).toBe('Silikon');
    expect(erna()).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Paul Neu/ })).toBeChecked();
    expect((screen.getByLabelText('Beginn (optional)') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Mischbatterie')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Menge' }).map((f) => (f as HTMLInputElement).value)).toEqual(['2', '1']);
    expect(hinweis()).toBeNull();
    expect(speichernKnopf()).toBeEnabled();
  });

  it('„Meine Eingabe behalten“ gibt das Speichern frei — gespeichert wird bewusst die eigene Eingabe', async () => {
    zeige(ANFANG);
    await eingeben();
    act(() => senden(FREMD));
    await userEvent.click(await screen.findByRole('button', { name: 'Meine Eingabe behalten' }));

    expect(hinweis()).toBeNull();
    await eingabeSteht();
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const zeilen = speichere.mock.calls[0][3] as { userId: string; comment: string }[];
    expect(zeilen.map((z) => z.userId).sort()).toEqual(['u1', 'u2']);
    expect(zeilen[0].comment).toBe('Vorwand setzen');
  });

  it('nur die Rüstliste fremd geändert, nur die Aufgabe selbst getippt: die Liste kommt still, die Aufgabe bleibt', async () => {
    zeige(ANFANG);
    await waitFor(() => expect(max()).toBeChecked());
    await userEvent.clear(kommentar());
    await userEvent.type(kommentar(), 'Vorwand setzen');

    act(() => senden({ einsaetze: [...ANFANG.einsaetze], listen: FREMD.listen }));

    expect(kommentar().value).toBe('Vorwand setzen');
    expect(await screen.findByText('Mischbatterie')).toBeInTheDocument();
    expect(hinweis()).toBeNull();
  });
});

describe('Einsatzformular — was gleich bleiben muss', () => {
  it('ohne eigene Eingabe übernimmt es eine fremde Änderung still, wie bisher', async () => {
    zeige(ANFANG);
    await waitFor(() => expect(max()).toBeChecked());

    act(() => senden({ einsaetze: [einsatz('a7', MAX, HIER, { comment: 'Silikon' })], listen: ANFANG.listen }));

    await waitFor(() => expect(kommentar().value).toBe('Silikon'));
    expect(hinweis()).toBeNull();
  });

  it('wechselt der Nutzer die Baustelle, übernimmt es deren Planung — die Eingabe der vorigen gehört nicht dazu', async () => {
    zeige({
      einsaetze: [...ANFANG.einsaetze, einsatz('b1', PAUL, DORT, { comment: 'Therme' })],
      listen: [...ANFANG.listen, liste(DORT, [{ id: 'r9', materialId: 'm2', name: 'Mischbatterie', menge: 3 }])],
    });
    await eingeben();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Baustelle/ }), DORT);

    await waitFor(() => expect(kommentar().value).toBe('Therme'));
    expect(screen.getByRole('checkbox', { name: /^Paul Neu/ })).toBeChecked();
    expect(max()).not.toBeChecked();
    expect(erna()).not.toBeChecked();
    expect((screen.getByLabelText('Beginn (optional)') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('textbox', { name: 'Menge' })).toHaveValue('3');
    expect(hinweis()).toBeNull();
  });

  it('beim Öffnen: was vor dem Laden getippt war, weicht der geladenen Planung', async () => {
    zeige({ einsaetze: [...ANFANG.einsaetze], listen: [], bereit: false });
    await waitFor(() => expect(max()).toBeChecked());
    await userEvent.click(erna());

    act(() => senden({ ...ANFANG, bereit: true }));

    expect(await screen.findByRole('textbox', { name: 'Menge' })).toHaveValue('4');
    expect(hinweis()).toBeNull();
  });
});

describe('Einsatzformular — das eigene Speichern ist keine fremde Änderung', () => {
  it('die Meldung des eigenen Speicherns übernimmt still — auch wenn danach schon weitergetippt wurde', async () => {
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());

    // Gleich weiter: noch Paul dazu, bevor die Live-Meldung des Speicherns da ist.
    await userEvent.click(screen.getByRole('checkbox', { name: /^Paul Neu/ }));

    // Die Datenbank meldet das Gespeicherte: neue Kennungen (alles weg, alles neu), Uhrzeit mit Sekunden.
    act(() => senden({
      einsaetze: [
        einsatz('n1', ERNA, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30:00' }),
        einsatz('n2', MAX, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30:00' }),
      ],
      listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 6 }])],
    }));

    expect(hinweis()).toBeNull();
    expect(screen.getByRole('checkbox', { name: /^Paul Neu/ })).toBeChecked();
    await eingabeSteht();
    expect(speichernKnopf()).toBeEnabled();
  });

  it('eine verknüpfte Anforderung aus dem eigenen Speichern kommt mit — kein zweites Anfordern', async () => {
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());

    act(() => senden({
      einsaetze: [
        einsatz('n1', ERNA, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30' }),
        einsatz('n2', MAX, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30' }),
      ],
      listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 6, angefordert: 2 }])],
    }));

    expect(hinweis()).toBeNull();
    expect(await screen.findByText(/Davon 2 über eine Anforderung/)).toBeInTheDocument();
  });
});

describe('Einsatzformular im Seitenfenster — das eigene Löschen ist keine fremde Änderung', () => {
  const ZWEI: Live = { einsaetze: [einsatz('a1', MAX), einsatz('a2', ERNA)], listen: ANFANG.listen };

  async function erstLoeschen() {
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz von Erna Beispiel löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a2'));
  }

  it('getippte Aufgabe bleibt, Erna geht aus der Auswahl, die Meldung danach fragt nichts', async () => {
    zeige(ZWEI, HIER, true);
    await waitFor(() => expect(erna()).toBeChecked());
    await userEvent.clear(kommentar());
    await userEvent.type(kommentar(), 'Vorwand setzen');

    await erstLoeschen();
    expect(erna()).not.toBeChecked();
    act(() => senden({ einsaetze: [einsatz('a1', MAX)], listen: ANFANG.listen }));

    expect(hinweis()).toBeNull();
    expect(kommentar().value).toBe('Vorwand setzen');
    expect(erna()).not.toBeChecked();
    expect(max()).toBeChecked();
  });

  it('ohne Eingabe: Erna ist nach dem Löschen nicht mehr angehakt — auch bevor die Meldung da ist', async () => {
    zeige(ZWEI, HIER, true);
    await waitFor(() => expect(erna()).toBeChecked());
    await erstLoeschen();
    expect(erna()).not.toBeChecked();
    act(() => senden({ einsaetze: [einsatz('a1', MAX)], listen: ANFANG.listen }));
    expect(erna()).not.toBeChecked();
    expect(hinweis()).toBeNull();
  });
});

/*
  DIE DATENBANK PRÜFT DIE FASSUNG (P1, 20261115500000_einsatz_fassung.sql).
  Was gleichzeitig gespeichert wird, kommt live nicht rechtzeitig an — dann
  weist `einsatz_speichern` ab, und das Formular fragt wie bei einer Meldung.
  Die Datenbank selbst ist in tests/supabase/einsatzFassung.test.ts geprüft.
*/
describe('Einsatzformular — die Datenbank weist ab, was auf überholtem Stand beruht', () => {
  const SILIKON = [['u3', false, 'Silikon', '', '']];

  it('schickt mit, worauf die Eingabe beruht — Einteilung und Rüstliste, wie übernommen', async () => {
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());

    expect(speichere.mock.calls[0][4]).toEqual({
      einteilung: [['u1', false, 'Rohinstallation', '', '']],
      liste: [['r1', 'm1', 'Eckventil 1/2', 4, '']],
    });
    // Die Rüstliste prüft beim eigenen Speichern noch einmal — auf derselben Grundlage.
    expect(ruestSpeichern.mock.calls[0][6]).toEqual([['r1', 'm1', 'Eckventil 1/2', 4, '']]);
  });

  it('abgewiesen: die Eingabe bleibt, der Hinweis fragt; behalten speichert auf dem gemeldeten Stand', async () => {
    abweisen.einsatz.push(new PaarGeaendert('geändert', 'einteilung', SILIKON as never));
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());

    expect(await screen.findByText(/Inzwischen geändert — übernehmen\?/)).toBeInTheDocument();
    expect(screen.getByText(/noch nicht gespeichert; der neue Stand wird geladen/)).toBeInTheDocument();
    await eingabeSteht();
    expect(ruestSpeichern).not.toHaveBeenCalled();
    expect(speichernKnopf()).toBeDisabled();
    // Ohne die Live-Meldung gibt es nichts zu übernehmen.
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Meine Eingabe behalten' }));
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(speichere).toHaveBeenCalledTimes(2));
    expect(speichere.mock.calls[1][4].einteilung).toEqual(SILIKON);
    expect(speichere.mock.calls[1][3].map((z: { comment: string }) => z.comment)).toEqual(['Vorwand setzen', 'Vorwand setzen']);
  });

  it('abgewiesen, dann kommt die Meldung: „Übernehmen“ holt den neuen Stand', async () => {
    abweisen.einsatz.push(new PaarGeaendert('geändert', 'einteilung', SILIKON as never));
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());
    await screen.findByText(/Inzwischen geändert — übernehmen\?/);

    act(() => senden({ einsaetze: [einsatz('f1', PAUL, HIER, { comment: 'Silikon' })], listen: ANFANG.listen }));
    expect(screen.queryByText(/der neue Stand wird geladen/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(kommentar().value).toBe('Silikon');
    expect(screen.getByRole('checkbox', { name: /^Paul Neu/ })).toBeChecked();
    expect(hinweis()).toBeNull();
  });

  it('die Rüstliste abgewiesen, der Einsatz gespeichert: das steht da, und der Hinweis fragt nach der Liste', async () => {
    abweisen.liste.push(new PaarGeaendert('geändert', 'liste', [['r1', 'm1', 'Eckventil 1/2', 9, '']] as never));
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());

    expect(await screen.findByText(/Der Einsatz ist gespeichert, die Rüstliste nicht: sie wurde inzwischen anderswo geändert/)).toBeInTheDocument();
    expect(screen.getByText(/Die Rüstliste dieser Baustelle wurde/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Menge' })).toHaveValue('6');
  });
});

describe('Einsatzformular — nach dem eigenen Speichern (bleibt gleich)', () => {
  it('Positionen mit Menge 0 sind nicht gespeichert und verschwinden aus dem Formular', async () => {
    zeige({
      einsaetze: ANFANG.einsaetze,
      listen: [liste(HIER, [
        { id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 },
        { id: 'r2', materialId: 'm2', name: 'Mischbatterie', menge: 1 },
      ])],
    });
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Menge' })).toHaveLength(2));
    const zweite = screen.getAllByRole('textbox', { name: 'Menge' })[1];
    await userEvent.clear(zweite);
    await userEvent.type(zweite, '0');
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());
    expect((ruestSpeichern.mock.calls[0][3] as { id: string }[]).map((p) => p.id)).toEqual(['r1']);

    // Die Meldung des eigenen Speicherns: die Liste ohne die Mischbatterie.
    act(() => senden({ einsaetze: ANFANG.einsaetze, listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 4 }])] }));
    expect(screen.getAllByRole('textbox', { name: 'Menge' })).toHaveLength(1);
    expect(screen.queryByText('Mischbatterie')).toBeNull();
    expect(hinweis()).toBeNull();
  });
});

describe('Einsatzformular — die eigene Meldung in Teilschritten', () => {
  it('ein Zwischenstand der eigenen Meldung löst keinen Hinweis aus', async () => {
    zeige(ANFANG);
    await eingeben();
    await userEvent.click(speichernKnopf());
    await waitFor(() => expect(ruestSpeichern).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('checkbox', { name: /^Paul Neu/ }));

    // Erst nur das Löschen (alles weg), dann das Anlegen (alles neu).
    act(() => senden({ einsaetze: [], listen: ANFANG.listen }));
    expect(hinweis()).toBeNull();
    act(() => senden({
      einsaetze: [
        einsatz('n1', ERNA, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30' }),
        einsatz('n2', MAX, HIER, { comment: 'Vorwand setzen', zeitVon: '07:30' }),
      ],
      listen: [liste(HIER, [{ id: 'r1', materialId: 'm1', name: 'Eckventil 1/2', menge: 6 }])],
    }));
    expect(hinweis()).toBeNull();
    expect(screen.getByRole('checkbox', { name: /^Paul Neu/ })).toBeChecked();
  });

  it('kommt die eigene Meldung nicht vollständig, fragt das Formular nach einer Weile doch', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      zeige(ANFANG);
      await waitFor(() => expect(max()).toBeChecked());
      await nutzer.clear(kommentar());
      await nutzer.type(kommentar(), 'Vorwand setzen');
      await nutzer.click(speichernKnopf());
      await waitFor(() => expect(speichere).toHaveBeenCalled());
      await nutzer.type(kommentar(), ', danach Silikon');

      // Nur der Zwischenstand kommt — dann kommt nichts mehr.
      act(() => senden({ einsaetze: [], listen: ANFANG.listen }));
      expect(hinweis()).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hinweis()).toBeInTheDocument();
      expect(kommentar().value).toBe('Vorwand setzen, danach Silikon');
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
  DER LETZTE GEHT, DIE RÜSTLISTE BLEIBT NICHT STILL ZURÜCK (P2). Die
  Datenbank fragt zurück (`SL428`), bevor sie etwas schreibt; das Formular
  stellt die Frage im Fenster und löscht erst mit der Entscheidung.
*/
describe('Einsatzformular im Seitenfenster — der Letzte mit Rüstliste (P2)', () => {
  it('fragt „Rüstliste auflösen?“, löscht erst mit der Wahl und meldet die Folge', async () => {
    const gefragt: RuestlisteWahl[] = [];
    loeschenAntwort = (id, wahl) => {
      gefragt.push(wahl);
      if (wahl === 'fragen') return Promise.reject(new RuestlisteFrage('Rüstliste verwaist', 3, 1, 0));
      loesche(id, wahl);
      return Promise.resolve({ ruestliste: 'aufgeloest', anforderungen: 1, in_arbeit: 0 });
    };
    zeige(ANFANG, HIER, true);
    await waitFor(() => expect(max()).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz von Max Mustermann löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(await screen.findByText('Rüstliste auflösen?')).toBeInTheDocument();
    expect(screen.getByText(/3 Positionen.*eine offene Anforderung über die Fehlmenge wird zurückgezogen/)).toBeInTheDocument();
    expect(loesche).not.toHaveBeenCalled();
    // Ohne Wahl geht es nicht weiter — eine Vorauswahl bestätigte mit einem Tipp das Falsche.
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /^Auflösen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a1', 'aufloesen'));
    expect(gefragt).toEqual(['fragen', 'aufloesen']);
    expect(await screen.findByText('Einsatz gelöscht · Rüstliste aufgelöst')).toBeInTheDocument();
  });

  it('bleibt gleich: wer nicht der Letzte ist, wird ohne Frage gelöscht', async () => {
    zeige({ einsaetze: [einsatz('a1', MAX), einsatz('a2', ERNA)], listen: ANFANG.listen }, HIER, true);
    await waitFor(() => expect(erna()).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz von Erna Beispiel löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a2'));
    expect(screen.queryByText('Rüstliste auflösen?')).toBeNull();
  });
});

/*
  VERSCHIEDENE AUFGABEN UND UHRZEITEN IM SELBEN PAAR (Durchsicht 15.11.2026,
  P7). Gegenprobe: vorher bekamen beim Speichern alle Aufgabe und Uhrzeit des
  ersten Eintrags der Live-Liste — Bernds „Silikon 13–16“ war still weg.
*/
describe('Einsatzformular — Abweichungen je Person (P7)', () => {
  const ZWEI: Live = {
    einsaetze: [
      einsatz('a1', MAX, HIER, { comment: 'Rohinstallation', zeitVon: '07:00', zeitBis: '12:00' }),
      einsatz('a2', ERNA, HIER, { comment: 'Silikon', zeitVon: '13:00', zeitBis: '16:00' }),
    ],
    listen: [],
  };

  it('zeigt, wer was hat, und speichert je Person ihren Stand — Neue bekommen die Felder', async () => {
    zeige(ZWEI);
    expect(await screen.findByText(/verschiedene Aufgaben oder Uhrzeiten/)).toBeInTheDocument();
    expect(screen.getByText(/Erna Beispiel: 13:00–16:00 · „Silikon“/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /^Paul Neu/ }));
    expect(screen.getByText(/Aufgabe und Uhrzeit unten gelten für neu Eingeteilte/)).toBeInTheDocument();
    const feld = screen.getByRole('textbox', { name: 'Kommentar / Aufgabe' });
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Zuarbeit');
    await userEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const zeilen = speichere.mock.calls[0][3] as { userId: string; comment: string; zeitVon: string | null }[];
    const je = Object.fromEntries(zeilen.map((z) => [z.userId, [z.comment, z.zeitVon]]));
    expect(je).toEqual({
      u1: ['Rohinstallation', '07:00'],
      u2: ['Silikon', '13:00'],
      u3: ['Zuarbeit', expect.anything()],
    });
  });

  it('angleichen nur auf Wunsch: dann alle dieselbe Aufgabe und Uhrzeit', async () => {
    zeige(ZWEI);
    await screen.findByText(/verschiedene Aufgaben oder Uhrzeiten/);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allen dieselbe Aufgabe und Uhrzeit geben' }));
    const feld = screen.getByRole('textbox', { name: 'Kommentar / Aufgabe' });
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Bad fertig');
    await userEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const zeilen = speichere.mock.calls[0][3] as { comment: string }[];
    expect(zeilen.map((z) => z.comment)).toEqual(['Bad fertig', 'Bad fertig']);
  });

  it('bleibt gleich: ohne Abweichung kein Hinweis, die Felder gelten für alle', async () => {
    zeige({ einsaetze: [einsatz('a1', MAX), einsatz('a2', ERNA)], listen: [] });
    await waitFor(() => expect(erna()).toBeChecked());
    expect(screen.queryByText(/verschiedene Aufgaben oder Uhrzeiten/)).toBeNull();
    expect(kommentar().value).toBe('Rohinstallation');
  });
});
