import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Assignment, EinsatzMaterial, Project, Termin, Vacation } from '@/types';

/**
 * „Mein Einsatzplan" — die Ansicht, in der der Monteur sieht, wo er in den
 * nächsten Tagen hin muss. Bis hierher ohne eigenen Test.
 *
 * Sie zeigt jetzt zusätzlich die Rüstliste, und zwar AUCH FÜR KOMMENDE TAGE:
 * den Bus lädt man am Vorabend. Wer erst am Einsatzmorgen erfährt, was
 * mitzunehmen ist, steht um sieben vor einem Lager, in dem etwas fehlt.
 */

const HEUTE = '2026-09-15';
const MORGEN = '2026-09-16';

const BAUSTELLEN: Project[] = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-001', customerName: 'Familie Huber', status: 'Aktiv' } as Project,
  { id: 'p2', companyId: 'perl', projectNumber: 'B-002', customerName: 'Gemeinde Neudorf', status: 'Aktiv' } as Project,
];

const EINSAETZE: Assignment[] = [
  { id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: 'B-001', userId: 'm1', userName: 'Anton', comment: 'Bad' },
  { id: 'a2', companyId: 'perl', date: MORGEN, projectNumber: 'B-002', userId: 'm1', userName: 'Anton' },
];

/** Abweichende „nächste Einsätze“ für einzelne Prüfungen; leer = EINSAETZE. */
const kommend: { wert: Assignment[] | null } = { wert: null };

/** Welcher Tag gerade abgefragt wird — die Ansicht lädt je gewähltem Tag. */
const geholt: { tage: string[] } = { tage: [] };
const listen: Record<string, (EinsatzMaterial & { id: string })[]> = {};

/** Was die Datenbank an Terminen herausgibt — gefiltert wird in der Ansicht. */
const termine: { wert: Termin[] } = { wert: [] };
vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [{ uid: 'm1', name: 'Anton Berger' }, { uid: 'm2', name: 'Bruno Kollege' }]),
}));
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => termine.wert),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: vi.fn(async () => EINSAETZE),
  listUpcomingAssignments: vi.fn(async () => kommend.wert ?? EINSAETZE),
  kalenderAboStand: vi.fn(async () => null),
  kalenderAboAnlegen: vi.fn(async () => 'x'),
  kalenderAboBeenden: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/projects', () => ({
  listProjectsByNumbers: vi.fn(async () => BAUSTELLEN),
}));
/** Abwesenheiten, wie sie der Wochenplan liest (M33). */
const abwesend: { wert: { userId: string; von: string; bis: string; grund: string | null; zeiten: string | null }[] } = { wert: [] };
vi.mock('@/lib/db/vacations', () => ({
  listOwnVacations: vi.fn(async () => [] as Vacation[]),
  listAbwesendInRange: vi.fn(async () => abwesend.wert),
}));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  listEinsatzMaterialForDate: vi.fn(async (_c: string, tag: string) => {
    geholt.tage.push(tag);
    return listen[tag] ?? [];
  }),
  ladenUmschalten: vi.fn(async () => undefined),
}));

/** Pläne, die das Büro an Baustellen gehängt hat. */
const plaene: { wert: { id: string; projectId: string; pfad: string; dateiname: string; mime: string; bytes: number }[] } = { wert: [] };
vi.mock('@/lib/db/baustellenDokumente', () => ({
  listDokumente: vi.fn(async (_c: string, ids: string[]) => plaene.wert.filter((d) => ids.includes(d.projectId))),
  dokumentAdressen: vi.fn(async (d: { pfad: string }[]) => new Map(d.map((x) => [x.pfad, `https://speicher/${x.pfad}`]))),
  GUELTIG_SEKUNDEN: 3600,
}));

const authWert: Record<string, unknown> = {
  user: { uid: 'm1', email: 'm1@perl.at', name: 'Anton Berger', role: 'Mitarbeiter' as const, companyId: 'perl', docId: 'm1' },
  company: { id: 'perl', name: 'Perl Installationen' } as Record<string, unknown>,
  einblick: null,
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: MyScheduleView } = await import('@/features/assignments/MyScheduleView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MyScheduleView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 8, 0, 0));
  geholt.tage = [];
  for (const k of Object.keys(listen)) delete listen[k];
  plaene.wert = [];
  abwesend.wert = [];
  kommend.wert = null;
  termine.wert = [];
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
  authWert.einblick = null;
  authWert.user = { ...(authWert.user as object), einstufung: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Mein Einsatzplan — der Einsatz selbst', () => {
  it('zeigt den heutigen Einsatz mit Kunde und Kommentar', async () => {
    zeichne();
    const karte = (await screen.findByText(/Einsätze am/)).closest('section')!;
    // Der Kundenname kommt aus einem zweiten, spaeteren Ladevorgang — bis
    // dahin steht die Baustellennummer da. Deshalb warten statt sofort lesen.
    expect((await within(karte).findAllByText(/Familie Huber/)).length).toBeGreaterThan(0);
    expect(within(karte).getByText('Bad')).toBeInTheDocument();
  });

  it('führt mit Baustelle und Rolle in die Zeiterfassung', async () => {
    // Ein vergessener Helfer-Haken kostet den falschen Verrechnungssatz.
    zeichne();
    await screen.findByText('Bad');
    expect(screen.getAllByRole('link', { name: 'Zeit erfassen' })[0]).toHaveAttribute('href', '/time');
  });
});

describe('Mein Einsatzplan — als was ich eingeteilt bin', () => {
  // Vorher stand beim Lehrling „Facharbeiter“ (Entscheidung 03.10.2026).
  const marke = async () => {
    const karte = (await screen.findByText(/Einsätze am/)).closest('section')!;
    await within(karte).findByText('Bad');
    return karte;
  };

  it('zeigt dem Lehrling „Lehrling“, nicht „Facharbeiter“', async () => {
    authWert.user = { ...(authWert.user as object), einstufung: 'lehrling' };
    zeichne();
    const karte = await marke();
    expect(within(karte).getByText('Lehrling')).toBeInTheDocument();
    expect(within(karte).queryByText('Facharbeiter')).toBeNull();
  });

  it('Gegenprobe: ohne Einstufung bleibt es „Facharbeiter“', async () => {
    zeichne();
    const karte = await marke();
    expect(within(karte).getByText('Facharbeiter')).toBeInTheDocument();
  });
});

describe('Mein Einsatzplan — die Rüstliste', () => {
  it('zeigt, was für heute mitzunehmen ist', async () => {
    listen[HEUTE] = [
      {
        id: 'perl_2026-09-15_B-001', companyId: 'perl', date: HEUTE, projectNumber: 'B-001',
        uids: ['m1'],
        positionen: [{ id: 'p1', name: 'Eckventil 1/2', menge: 3, einheit: 'Stk' }],
        geladen: {},
      } as EinsatzMaterial & { id: string },
    ];
    zeichne();
    expect(await screen.findByText(/Eckventil 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/noch 1 von 1/)).toBeInTheDocument();
  });

  it('holt die Liste des GEWÄHLTEN Tages, nicht nur die von heute', async () => {
    /**
     * Der Vorabend ist der eigentliche Zweck: wer erst am Einsatzmorgen
     * erfährt, was mitzunehmen ist, steht um sieben vor einem Lager, in dem
     * etwas fehlt.
     */
    zeichne();
    await screen.findByText('Bad');
    expect(geholt.tage).toContain(HEUTE);

    geholt.tage = [];
    await userEvent.click(screen.getByRole('button', { name: /16\./ }));
    await waitFor(() => expect(geholt.tage).toContain(MORGEN));
  });

  it('zeigt an einem Tag ohne Liste keinen leeren Materialblock', async () => {
    // Ein leerer Block sähe aus wie „nichts mitzunehmen" statt „nichts
    // geplant" — und das sind zwei verschiedene Aussagen.
    zeichne();
    await screen.findByText('Bad');
    expect(screen.queryByText('Material')).toBeNull();
  });
});

/*
  GEMELDET: „Baustellen sollte man Dokumente oder Bilder hinzufügen können,
  damit der Monteur Zugriff darauf hat." Wer eingeteilt ist, sieht sie am
  Einsatz — ob er im Team der Baustelle steht, entscheidet die Datenbank.
*/
describe('Mein Einsatzplan — die Pläne der Baustelle', () => {
  it('zeigt den Plan am Einsatz, zum Öffnen', async () => {
    plaene.wert = [
      { id: 'd1', projectId: 'p1', pfad: 'baustellen/perl/p1/a.pdf', dateiname: 'Grundriss EG.pdf', mime: 'application/pdf', bytes: 120_000 },
    ];
    zeichne();
    const link = await screen.findByRole('link', { name: 'Grundriss EG.pdf' });
    expect(link).toHaveAttribute('href', 'https://speicher/baustellen/perl/p1/a.pdf');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('zeigt ohne Pläne auch keine leere Rubrik', async () => {
    zeichne();
    await screen.findAllByText(/Familie Huber/);
    expect(screen.queryByText('Pläne und Dokumente')).toBeNull();
  });
});

/*
  TESTBERICHT 30.09.2026, M33 — wer krank ist, hat an dem Tag keinen
  „nächsten Einsatz“.
*/
describe('Mein Einsatzplan — Abwesenheit (M33)', () => {
  function naechsteKarte() {
    return screen.getByText('Nächste Einsätze').closest('section')!;
  }

  it('blendet den Einsatz an einem Kranktag aus und sagt es', async () => {
    abwesend.wert = [{ userId: 'm1', von: MORGEN, bis: MORGEN, grund: 'Krank', zeiten: null }];
    zeichne();
    expect(await screen.findByText(/liegt an einem Tag, an dem du abwesend bist/)).toBeInTheDocument();
    expect(within(naechsteKarte()).queryByText(/Gemeinde Neudorf|B-002/)).toBeNull();
  });

  it('Gegenprobe: stundenweise weg — der Einsatz bleibt', async () => {
    abwesend.wert = [{ userId: 'm1', von: MORGEN, bis: MORGEN, grund: 'ZA', zeiten: '13:00–17:00' }];
    zeichne();
    expect((await within(await screen.findByText('Nächste Einsätze').then((t) => t.closest('section')!)).findAllByText(/Gemeinde Neudorf|B-002/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/an dem du abwesend bist/)).toBeNull();
  });
});

// Analyse 03.10.2026, Paket 1 — heute steht schon in der Karte darüber.
describe('Mein Einsatzplan — Nächste Einsätze ab morgen', () => {
  const karte = () => screen.getByText('Nächste Einsätze').closest('section')!;

  it('wiederholt den heutigen Einsatz nicht, zeigt aber den morgigen', async () => {
    zeichne();
    await screen.findByText('Bad');
    expect((await within(karte()).findAllByText(/Gemeinde Neudorf|B-002/)).length).toBeGreaterThan(0);
    expect(within(karte()).queryByText(/Familie Huber|B-001/)).toBeNull();
  });

  it('sagt „Nach heute ist nichts eingeplant“, wenn nur heute etwas ansteht', async () => {
    kommend.wert = [EINSAETZE[0]];
    zeichne();
    expect(await within(await screen.findByText('Nächste Einsätze').then((t) => t.closest('section')!)).findByText('Nach heute ist nichts eingeplant.')).toBeInTheDocument();
    // Gegenprobe: oben steht der heutige Einsatz weiterhin.
    expect(screen.getByText('Bad')).toBeInTheDocument();
  });
});

describe('Mein Einsatzplan — das Kalender-Abo (02.10.2026)', () => {
  it('steht nur da, wenn der Betrieb es eingeschaltet hat (Gegenprobe: ausgeschaltet)', async () => {
    const { unmount } = zeichne();
    await screen.findByText('Bad');
    expect(screen.queryByText('Im eigenen Kalender')).toBeNull();
    unmount();
    authWert.company = { id: 'perl', name: 'Perl Installationen', kalenderAboErlaubt: true };
    zeichne();
    expect(await screen.findByText('Im eigenen Kalender')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Kalender-Abo einrichten' })).toBeInTheDocument();
  });

  it('der Supportzugang legt keines an', async () => {
    authWert.company = { id: 'perl', name: 'Perl Installationen', kalenderAboErlaubt: true };
    authWert.einblick = { betrieb: 'perl' };
    zeichne();
    await screen.findByText('Bad');
    expect(screen.queryByText('Im eigenen Kalender')).toBeNull();
  });
});

describe('Mein Einsatzplan — Termine (Plan 10.4)', () => {
  const t = (id: string, rest: Partial<Termin>): Termin => ({
    id, companyId: 'perl', art: 'Lieferung', datum: HEUTE, zeitVon: null, zeitBis: null,
    projectNumber: null, customerId: null, teilnehmer: [], ...rest,
  });

  it('am Tag: die Lieferung auf meiner Baustelle und mein eigener Termin — nicht der auf einer fremden', async () => {
    termine.wert = [
      // Heute auf B-001 eingeteilt: die Lieferung dort nehme ich an.
      t('t1', { projectNumber: 'B-001', zeitVon: '08:00', zeitBis: '10:00' }),
      // Ich bin Teilnehmer, ohne Baustelle.
      t('t2', { art: 'Besichtigung', customerId: 'k1', teilnehmer: ['m1', 'm2'], ortName: 'Hausverwaltung Nord', ortAdresse: 'Ringstraße 3, 2700 Wiener Neustadt' }),
      // B-002 erst morgen — heute geht mich die Abnahme dort nichts an.
      t('t3', { art: 'Abnahme', projectNumber: 'B-002', teilnehmer: ['m2'] }),
    ];
    zeichne();
    const amTag = await screen.findByRole('region', { name: 'Termine an diesem Tag' });
    expect(within(amTag).getByText('Lieferung (Aviso) · 08:00–10:00')).toBeInTheDocument();
    expect(within(amTag).getByText('Besichtigung')).toBeInTheDocument();
    // Kunden liest der Monteur nicht — Name und Adresse stehen am Termin.
    expect(within(amTag).getByText('Hausverwaltung Nord (ohne Baustelle)')).toBeInTheDocument();
    expect(within(amTag).getByRole('link', { name: /Ringstraße 3/ })).toBeInTheDocument();
    expect(await within(amTag).findByText('Teilnehmer: Anton Berger, Bruno Kollege')).toBeInTheDocument();
    expect(within(amTag).queryByText('Abnahme')).not.toBeInTheDocument();
  });

  it('„Nächste Termine": morgen auf der Baustelle, auf der ich morgen stehe — heute steht schon oben', async () => {
    termine.wert = [
      t('t1', { projectNumber: 'B-001' }),
      t('t4', { art: 'Baustellenbesprechung', datum: MORGEN, projectNumber: 'B-002' }),
      t('t5', { art: 'Abnahme', datum: MORGEN, projectNumber: 'B-001' }),
    ];
    zeichne();
    const karte = (await screen.findByRole('heading', { name: 'Nächste Termine' })).closest('section')!;
    expect(within(karte).getByText(/Baustellenbesprechung/)).toBeInTheDocument();
    expect(within(karte).queryByText(/Lieferung/)).not.toBeInTheDocument();
    expect(within(karte).queryByText(/Abnahme/)).not.toBeInTheDocument();
  });

  it('ohne Termine bleibt die Ansicht, wie sie war', async () => {
    zeichne();
    await screen.findByText('Bad');
    expect(screen.queryByRole('region', { name: 'Termine an diesem Tag' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nächste Termine' })).not.toBeInTheDocument();
  });
});

describe('Name und Nummer (Runde 3, G4)', () => {
  it('trennt den Kundennamen und die Baustellennummer durch ein echtes Leerzeichen', async () => {
    // Nur per Abstand getrennt, stand beim Kopieren und Vorlesen „Familie Huber(B-001)“.
    zeichne();
    await screen.findByText('Bad');
    const zeile = screen.getAllByText((_, el) => el?.tagName === 'SPAN' && /^Familie Huber/.test(el.textContent ?? ''))
      .find((el) => el.classList.contains('font-semibold'))!;
    expect(zeile.textContent).toBe('Familie Huber (B-001)');
  });
});
