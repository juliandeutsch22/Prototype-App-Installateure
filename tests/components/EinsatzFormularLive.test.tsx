import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, EinsatzMaterial, Material, Project } from '@/types';
import type { WithId } from '@/lib/db/core';
import EinsatzFormular from '@/features/assignments/EinsatzFormular';

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
    return Promise.resolve();
  },
  einsatzFolgetage: vi.fn(async () => []),
}));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  saveEinsatzMaterial: (...a: unknown[]) => {
    ruestSpeichern(...a);
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
      onLoeschen={fenster ? (a) => { loesche(a.id); return Promise.resolve(); } : undefined}
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
