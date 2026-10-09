import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Abwesenheit } from '@/lib/db/vacations';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Assignment, Project, Termin } from '@/types';
import type { MonatsQuelle } from '@/features/assignments/monatsQuelle';

/*
  DER MONAT MIT BALKEN UND VORSCHAU (Runde 4, Auftrag 5), direkt gerendert —
  die Seite (`WochenplanView`) verdrahtet ihn über die Schnittstelle
  (`onEinsatz`, `onTermin`, `onZurWoche`). Geprüft wird, was der Planer tut:
  Balken antippen, Vorschau lesen, blättern, „Bearbeiten“, „Zur Woche“.
*/

/** Ein festes Objekt wie in der App — die Rolle wird je Prüfung gesetzt. */
const auth = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter', email: 'pl@perl.at', docId: 'pl' },
  company: { id: 'perl', name: 'Perl' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));
let materialAn = true;
vi.mock('@/lib/useModule', () => ({ useModul: (id: string) => (id === 'material' ? materialAn : true) }));

/* Was das Seitenfenster für den Vergleich braucht — ohne Datenbank. */
vi.mock('@/lib/db/materials', () => ({
  lagerFrei: vi.fn(async () => new Map([['m1', { frei: 2 }]])),
  subscribeMaterials: (_c: string, cb: (r: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  },
  LOW_STOCK_THRESHOLD: 3,
}));
vi.mock('@/lib/db/materialOrders', () => ({ createMaterialOrder: vi.fn() }));
vi.mock('@/lib/db/assignments', () => ({
  saveAssignments: vi.fn(),
  deleteAssignment: vi.fn(),
  listAssignmentsForDate: vi.fn(async () => []),
}));
let ruestlisten: { date: string; projectNumber: string; positionen: { id: string; materialId?: string; name: string; menge: number }[] }[] = [];
vi.mock('@/lib/db/einsatzMaterial', () => ({
  subscribeEinsatzMaterialForDate: (_c: string, _d: string, cb: (r: unknown[]) => void) => {
    cb(ruestlisten);
    return () => undefined;
  },
  saveEinsatzMaterial: vi.fn(),
  listEinsatzMaterialForDate: vi.fn(async () => ruestlisten),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => BAUSTELLEN),
  listRecentProjects: vi.fn(async () => BAUSTELLEN),
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/vacations', () => ({ listAbwesendInRange: vi.fn(async () => []) }));
vi.mock('@/lib/db/termine', () => ({ listTermineImZeitraum: vi.fn(async () => []) }));
vi.mock('@/lib/db/abwesenheiten', () => ({ listBetriebsurlaubeImZeitraum: vi.fn(async () => []) }));

const { default: MonatsAnsicht } = await import('@/features/assignments/MonatsAnsicht');
const { default: EinsatzFenster } = await import('@/features/assignments/EinsatzFenster');
const { monatsTage } = await import('@/features/assignments/planungKopf');
const { nachEinstufung } = await import('@/features/assignments/planTypen');
const { einsatzZeit } = await import('@/features/assignments/einsatzZeit');
type Brett = import('@/features/assignments/planTypen').Brett;
type Zelle = import('@/features/assignments/planTypen').Zelle;

const HEUTE = '2026-10-07';
const TAGE = monatsTage(2026, 9);

const mk = (uid: string, name: string, x: Partial<AppUser> = {}) =>
  ({ id: uid, uid, companyId: 'perl', name, email: `${uid}@perl.at`, role: 'Mitarbeiter', active: true, ...x }) as AppUser;
const LEUTE = [mk('u1', 'Max Mustermann'), mk('u2', 'Lena Pichler', { einstufung: 'lehrling' }), mk('u3', 'Erna Beispiel')];

const BAUSTELLEN = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-1', customerName: 'CT Bau GmbH', address: 'Industriestraße 4, 4050 Traun', status: 'Aktiv' },
  { id: 'p2', companyId: 'perl', projectNumber: 'B-2', customerName: 'Familie Huber', address: 'Ringstraße 3', status: 'Aktiv' },
] as Project[];

let einsaetze: WithId<Assignment>[] = [];
let urlaube: Abwesenheit[] = [];
let termine: Termin[] = [];

const e = (date: string, userId: string, projectNumber: string, x: Partial<Assignment> = {}) =>
  ({ id: `${date}-${userId}-${projectNumber}`, companyId: 'perl', date, userId, projectNumber, userName: LEUTE.find((u) => u.uid === userId)?.name, ...x }) as WithId<Assignment>;

/** Wie `WochenplanView` je Person und Tag rechnet. */
function brettVon(liste: WithId<Assignment>[], weg: Abwesenheit[]): Brett {
  const m: Brett = new Map();
  const hole = (uid: string, tag: string): Zelle => {
    const proTag = m.get(uid) ?? new Map<string, Zelle>();
    m.set(uid, proTag);
    const z = proTag.get(tag) ?? { baustellen: [], imUrlaub: false, abwesendText: null };
    proTag.set(tag, z);
    return z;
  };
  for (const a of liste) {
    const p = BAUSTELLEN.find((x) => x.projectNumber === a.projectNumber);
    hole(a.userId, a.date).baustellen.push({ nummer: a.projectNumber, name: p?.customerName ?? a.projectNumber, helfer: !!a.asHelper, zeit: einsatzZeit(a) });
  }
  for (const v of weg) {
    for (const tag of TAGE) {
      if (v.von <= tag && v.bis >= tag) {
        const z = hole(v.userId, tag);
        if (!v.zeiten) z.imUrlaub = true;
        z.abwesendText = [v.grund ?? 'abwesend', v.zeiten].filter(Boolean).join(' ');
      }
    }
  }
  return m;
}

const onEinsatz = vi.fn();
const onTermin = vi.fn();
const onZurWoche = vi.fn();
const onTag = vi.fn();
const quelleTag = vi.fn<MonatsQuelle['tag']>(async () => ({ einsaetze: [], urlaube: [], termine: [], zu: null, zuFuer: () => false }));
const quelle: MonatsQuelle = {
  tag: (...a) => quelleTag(...a),
  projekte: async () => [],
  ruestlisten: async () => ruestlisten,
  lager: async () => new Map([['m1', { frei: 2 }]]),
};

function zeige(x: { sicht?: 'personen' | 'baustellen'; ohneZurWoche?: boolean; leute?: AppUser[] } = {}) {
  const leute = x.leute ?? LEUTE;
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MonatsAnsicht
          tage={TAGE}
          heute={HEUTE}
          gruppen={nachEinstufung(leute)}
          zu={new Set()}
          onGruppe={() => undefined}
          brett={brettVon(einsaetze, urlaube)}
          zuFuer={() => false}
          einsaetze={einsaetze}
          projects={BAUSTELLEN}
          urlaube={urlaube}
          staff={leute}
          onTag={onTag}
          sicht={x.sicht ?? 'personen'}
          termine={termine}
          zuAm={new Map()}
          onEinsatz={onEinsatz}
          onTermin={onTermin}
          onZurWoche={x.ohneZurWoche ? undefined : onZurWoche}
          quelle={quelle}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const raster = () => within(screen.getByRole('region', { name: 'Monatsplan nach Personen' }));
const vorschau = () => screen.getByRole('dialog');
const zeileVon = (name: string) => within(raster().getByRole('group', { name }));
/** Wochentag wie `toLocaleDateString('de-AT', { weekday: 'short' })` — mit oder ohne Punkt. */
const wt = (w: string) => `${w}\\.?`;

beforeEach(() => {
  auth.user.role = 'Projektleiter';
  materialAn = true;
  ruestlisten = [];
  einsaetze = [
    // Max Mo–Mi auf B-1 (ein Balken), am Mittwoch zusätzlich B-2 (zweite Bahn).
    e('2026-10-05', 'u1', 'B-1', { zeitVon: '07:00', zeitBis: '15:30', comment: 'Bad rohinstallieren' }),
    e('2026-10-06', 'u1', 'B-1', { zeitVon: '07:00', zeitBis: '15:30', comment: 'Bad rohinstallieren' }),
    e('2026-10-07', 'u1', 'B-1'),
    e('2026-10-07', 'u1', 'B-2', { zeitVon: '16:00', zeitBis: '18:00' }),
    e('2026-10-06', 'u2', 'B-1', { asHelper: true }),
    // Erna eingeteilt, aber krank.
    e('2026-10-08', 'u3', 'B-2'),
  ];
  urlaube = [
    { userId: 'u3', von: '2026-10-08', bis: '2026-10-08', grund: 'Krank', zeiten: null },
    { userId: 'u2', von: '2026-10-12', bis: '2026-10-16', grund: 'Urlaub', zeiten: null },
    { userId: 'u2', von: '2026-10-19', bis: '2026-10-19', grund: 'Berufsschule', zeiten: null },
  ];
  termine = [
    { id: 't1', companyId: 'perl', art: 'Besichtigung', datum: '2026-10-06', zeitVon: '14:00', zeitBis: '15:00', customerId: 'k', teilnehmer: ['u1'], ortName: 'Anna Beispiel' } as Termin,
    { id: 't2', companyId: 'perl', art: 'Lieferung', datum: '2026-10-09', zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-2', teilnehmer: [], ortName: 'Familie Huber' } as Termin,
    { id: 't3', companyId: 'perl', art: 'Lieferung', datum: '2026-10-05', zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-1', teilnehmer: [], ortName: 'CT Bau GmbH' } as Termin,
  ];
  for (const f of [onEinsatz, onTermin, onZurWoche, onTag, quelleTag]) f.mockClear();
});

describe('Monat — Balken statt Felder (Auftrag 5.1)', () => {
  it('aufeinanderfolgende Tage auf derselben Baustelle sind EIN Balken; ein zweiter Einsatz am Tag ist ein eigener', () => {
    zeige();
    const max = zeileVon('Max Mustermann');
    expect(max.getByRole('button', { name: new RegExp(`^Max Mustermann, ${wt('Mo')} 05\\.10\\. – ${wt('Mi')} 07\\.10\\.: eingeplant, CT Bau GmbH \\(B-1\\)`) })).toBeInTheDocument();
    expect(max.getByRole('button', { name: new RegExp(`^Max Mustermann, ${wt('Mi')} 07\\.10\\.: eingeplant, Familie Huber \\(B-2\\)`) })).toBeInTheDocument();
    // Gegenprobe: kein Balken je Tag — für B-1 gibt es genau einen.
    expect(max.getAllByRole('button', { name: /eingeplant, CT Bau GmbH/ }).filter((b) => b.className.startsWith('mo-balken'))).toHaveLength(1);
  });

  it('eingeteilt, aber abwesend: Bernstein; abwesend: grau mit der Art', () => {
    zeige();
    const erna = zeileVon('Erna Beispiel');
    expect(erna.getByRole('button', { name: /^Erna Beispiel, Do\.? 08\.10\.: eingeteilt, aber abwesend, Familie Huber \(B-2\) – eingeteilt, aber Krank/ }).className).toBe(
      'mo-balken-konflikt',
    );
    const lena = zeileVon('Lena Pichler');
    expect(lena.getByRole('button', { name: /12\.10\. – .* 16\.10\.: abwesend, Urlaub/ }).className).toBe('mo-balken-weg');
  });

  it('der Kopf: Punkt für Termine, Bernstein bei einer Lieferung ohne Annahme', () => {
    zeige();
    const fr = raster().getByRole('button', { name: /^Fr\.? 09\.10\., 1 Termin, Lieferung ohne Annahme – alle Einsätze des Tages$/ });
    expect(fr.querySelector('.mo-punkt-achtung')).not.toBeNull();
    // Gegenprobe: die Lieferung am Montag hat einen Einsatz auf ihrer Baustelle.
    const mo = raster().getByRole('button', { name: /^Mo\.? 05\.10\., 1 Termin – alle Einsätze des Tages$/ });
    expect(mo.querySelector('.mo-punkt')).not.toBeNull();
    expect(raster().getByRole('button', { name: /^Mi\.? 07\.10\., heute – alle Einsätze des Tages$/ }).className).toBe('mo-kopf-heute');
  });

  it('Legende in Worten, ohne Kürzel', () => {
    zeige();
    expect(screen.getByText('eingeteilt, aber abwesend')).toBeInTheDocument();
    expect(screen.getByText('Punkt im Kopf: Termine an diesem Tag · Tag antippen zeigt die Vorschau')).toBeInTheDocument();
  });

  it('je Zeile ist nur EIN Tag im Tab-Lauf (heute) — die übrigen erreicht man mit ← → in der Vorschau', () => {
    zeige();
    const tage = zeileVon('Max Mustermann').getAllByRole('button').filter((b) => b.className.startsWith('mo-hg'));
    expect(tage).toHaveLength(31);
    expect(tage.filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/07\.10\./)]);
  });
});

describe('Monat — Vorschau (Auftrag 5.3)', () => {
  it('ein Balken öffnet die Vorschau mit allem, was das Seitenfenster weiß; Fokus auf ×', async () => {
    ruestlisten = [{ date: '2026-10-05', projectNumber: 'B-1', positionen: [{ id: 'r1', materialId: 'm1', name: 'Rohr', menge: 5 }, { id: 'r2', name: 'Leihgerät', menge: 1 }] }];
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ }));
    const v = within(vorschau());
    expect(vorschau()).toHaveAccessibleName('Max Mustermann');
    expect(v.getByText('Montag, 05.10.2026')).toBeInTheDocument();
    expect(v.getByText('CT Bau GmbH')).toBeInTheDocument();
    expect(v.getByText('B-1')).toBeInTheDocument();
    expect(v.getByText('07:00–15:30')).toBeInTheDocument();
    expect(v.getByText('Industriestraße 4, 4050 Traun')).toBeInTheDocument();
    expect(v.getByText('Bad rohinstallieren')).toBeInTheDocument();
    expect(v.getByText(/^Am selben Tag: Lieferung/)).toBeInTheDocument();
    expect(await v.findByText('2 Positionen · 1 mit Fehlmenge')).toBeInTheDocument();
    expect(v.getByRole('link', { name: 'Baustelle öffnen' })).toHaveAttribute('href', '/admin-projects/p1');
    expect(document.activeElement).toBe(v.getByRole('button', { name: 'Vorschau schließen' }));
  });

  it('„Bearbeiten“ öffnet das Seitenfenster der Seite mit Tag und Baustelle — die Vorschau schließt sich', async () => {
    zeige();
    const balken = zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ });
    await userEvent.click(balken);
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Bearbeiten' }));
    expect(onEinsatz).toHaveBeenCalledWith({ datum: '2026-10-05', projectNumber: 'B-1' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Der Fokus steht wieder am Balken — dorthin gibt ihn das Seitenfenster beim Schliessen zurück.
    expect(document.activeElement).toBe(balken);
  });

  it('ein freier Tag: „Frei“ und „Einsatz planen“ mit Person und Tag', async () => {
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, Fr\.? 09\.10\.: frei/ }));
    expect(within(vorschau()).getByText('Frei – noch kein Einsatz an diesem Tag.')).toBeInTheDocument();
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Einsatz planen' }));
    expect(onEinsatz).toHaveBeenCalledWith({ datum: '2026-10-09', person: 'u1' });
  });

  it('zwei Einsätze am Tag: „Bearbeiten“ je Abschnitt, unten nur „Zur Woche“', async () => {
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, Mi\.? 07\.10\.: eingeplant, Familie Huber/ }));
    const v = within(vorschau());
    // Der angeklickte Einsatz zuerst.
    const abschnitte = v.getAllByRole('region', { name: /^Einsatz / });
    expect(abschnitte.map((a) => a.getAttribute('aria-label'))).toEqual(['Einsatz Familie Huber (B-2)', 'Einsatz CT Bau GmbH (B-1)']);
    await userEvent.click(v.getByRole('button', { name: 'CT Bau GmbH (B-1) bearbeiten' }));
    expect(onEinsatz).toHaveBeenCalledWith({ datum: '2026-10-07', projectNumber: 'B-1' });
  });

  it('„Zur Woche“ ruft die Seite mit dem Tag; ohne neue Schnittstelle bleibt der alte Sprung (`onTag`)', async () => {
    const { unmount } = zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ }));
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Zur Woche' }));
    expect(onZurWoche).toHaveBeenCalledWith('2026-10-05');
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    zeige({ ohneZurWoche: true });
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ }));
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Zur Woche' }));
    expect(onTag).toHaveBeenCalledWith('2026-10-05');
  });

  it('der Klick bestimmt den Tag im Balken; mit der Tastatur der erste', async () => {
    zeige();
    const balken = zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ });
    balken.getBoundingClientRect = () => ({ left: 100, width: 90, right: 190, top: 0, bottom: 26, height: 26, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.click(balken, { clientX: 170, detail: 1 });
    expect(within(vorschau()).getByText('Mittwoch, 07.10.2026')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(balken, { clientX: 170, detail: 0 });
    expect(within(vorschau()).getByText('Montag, 05.10.2026')).toBeInTheDocument();
  });

  it('Esc schließt und gibt den Fokus an den Balken zurück', async () => {
    zeige();
    const balken = zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ });
    await userEvent.click(balken);
    expect(document.activeElement).not.toBe(balken);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(balken);
  });

  it('← → blättern tageweise; nach dem Blättern geht der Fokus an den Tag, auf dem die Vorschau stand', async () => {
    zeige();
    const balken = zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ });
    await userEvent.click(balken);
    await userEvent.keyboard('{ArrowRight}');
    expect(within(vorschau()).getByText('Dienstag, 06.10.2026')).toBeInTheDocument();
    // Am Dienstag: die Besichtigung der Person mit „Termin ändern“.
    expect(within(vorschau()).getByRole('region', { name: /^Termin: Besichtigung/ })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(vorschau()).getByText('Sonntag, 04.10.2026')).toBeInTheDocument();
    expect(within(vorschau()).getByText('Sonntag – kein Einsatz.')).toBeInTheDocument();
    // Der markierte Tag ist der Sonntag — dorthin geht der Fokus, nicht zurück an den Montag.
    const sonntag = zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, So\.? 04\.10\.: Wochenende/ });
    expect(sonntag.className).toBe('mo-hg-gewaehlt');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(sonntag);
  });

  it('in einem Eingabefeld blättern die Pfeile nicht (Gegenprobe)', async () => {
    const { container } = zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ }));
    const feld = container.querySelector('select') as HTMLSelectElement;
    fireEvent.keyDown(feld, { key: 'ArrowRight' });
    expect(within(vorschau()).getByText('Montag, 05.10.2026')).toBeInTheDocument();
  });

  it('„Termin ändern“ öffnet das Seitenfenster der Seite; wer Termine nur sieht, liest „Termin ansehen“', async () => {
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, Di\.? 06\.10\./ }));
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Termin ändern' }));
    expect(onTermin).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Rechte: ohne Recht auf Termine nur „Termin ansehen“ (dasselbe Fenster, schreibgeschützt)', async () => {
    auth.user.role = 'Mitarbeiter';
    zeige();
    await userEvent.click(raster().getByRole('button', { name: /^Di\.? 06\.10\./ }));
    expect(within(vorschau()).getByRole('button', { name: 'Termin ansehen' })).toBeInTheDocument();
    expect(within(vorschau()).queryByRole('button', { name: 'Termin ändern' })).toBeNull();
  });

  it('eingeteilt und krank: Bernstein-Hinweis mit Grund; ohne sichtbaren Grund nur „abwesend“', async () => {
    const { unmount } = zeige();
    await userEvent.click(zeileVon('Erna Beispiel').getByRole('button', { name: /eingeteilt, aber abwesend, / }));
    expect(within(vorschau()).getByText('Erna Beispiel ist an diesem Tag abwesend (Krank) – neu einteilen?')).toBeInTheDocument();
    unmount();
    urlaube = [{ userId: 'u3', von: '2026-10-08', bis: '2026-10-08', grund: null, zeiten: null }];
    zeige();
    await userEvent.click(zeileVon('Erna Beispiel').getByRole('button', { name: /eingeteilt, aber abwesend, / }));
    expect(within(vorschau()).getByText('Erna Beispiel ist an diesem Tag abwesend – neu einteilen?')).toBeInTheDocument();
    expect(within(vorschau()).queryByText(/Krank/)).toBeNull();
  });

  it('der Kopf eines Tages zeigt alle Einsätze und Termine des Tages — die Lieferung mit „niemand dort“', async () => {
    zeige();
    await userEvent.click(raster().getByRole('button', { name: /^Fr\.? 09\.10\./ }));
    const v = within(vorschau());
    expect(vorschau()).toHaveAccessibleName('Alle Einsätze');
    expect(v.getByText('Niemand ist an diesem Tag auf dieser Baustelle eingeteilt.')).toBeInTheDocument();
    await userEvent.click(v.getByRole('button', { name: 'Einsatz planen' }));
    expect(onEinsatz).toHaveBeenCalledWith({ datum: '2026-10-09' });
  });

  it('ohne Modul „Material“ keine Rüstliste — wie im Seitenfenster', async () => {
    materialAn = false;
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /05\.10\. – .*: eingeplant, CT Bau GmbH/ }));
    expect(within(vorschau()).queryByText('Rüstliste')).toBeNull();
  });
});

/*
  ← → ÜBER DIE MONATSGRENZE (Abnahme 5.5). Der Tag ausserhalb wird mit den
  bestehenden Abfragen nachgeladen und angezeigt. „Bearbeiten“ gibt es dort
  NICHT: das Seitenfenster kennt nur die geladenen Tage und überschriebe
  eine Planung, die es nicht gelesen hat — dort führt „Zur Woche“ weiter.
*/
describe('Monat — Vorschau über die Monatsgrenze', () => {
  it('lädt den Tag nach, zeigt ihn — und bietet nur „Zur Woche“, nie ein Fenster mit leerer Planung', async () => {
    quelleTag.mockResolvedValueOnce({
      einsaetze: [e('2026-11-01', 'u1', 'B-2', { comment: 'Notdienst' })],
      urlaube: [],
      termine: [],
      zu: null,
      zuFuer: () => false,
    });
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, Sa\.? 31\.10\./ }));
    // Gegenprobe im Monat: hier wird geplant.
    expect(within(vorschau()).getByRole('button', { name: 'Einsatz planen' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(vorschau()).getByText(/^Sonntag, 01\.11\.2026/)).toBeInTheDocument();
    expect(quelleTag).toHaveBeenCalledWith('perl', '2026-11-01');
    expect(await within(vorschau()).findByText('Notdienst')).toBeInTheDocument();
    expect(within(vorschau()).queryByRole('button', { name: /Bearbeiten|Einsatz planen/ })).toBeNull();
    expect(within(vorschau()).getByRole('button', { name: 'Zur Woche' })).toBeInTheDocument();
    // Das Raster bleibt im Oktober stehen.
    expect(raster().getByRole('button', { name: /^Sa\.? 31\.10\./ })).toBeInTheDocument();
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Zur Woche' }));
    expect(onZurWoche).toHaveBeenCalledWith('2026-11-01');
  });

  it('schlägt das Nachladen fehl, sagt die Vorschau es — statt „frei“ zu behaupten', async () => {
    quelleTag.mockRejectedValueOnce(new Error('weg'));
    zeige();
    await userEvent.click(zeileVon('Max Mustermann').getByRole('button', { name: /^Max Mustermann, Do\.? 01\.10\./ }));
    await userEvent.keyboard('{ArrowLeft}');
    expect(await within(vorschau()).findByText('Dieser Tag konnte nicht geladen werden.')).toBeInTheDocument();
    expect(within(vorschau()).queryByText(/^Frei/)).toBeNull();
  });
});

describe('Monat — Sicht „Baustellen“ (Auftrag 5.2)', () => {
  it('eine Zeile je Baustelle mit Einsatz; Balken je gleicher Besetzung, fehlt jemand: Bernstein', async () => {
    zeige({ sicht: 'baustellen' });
    const r = within(screen.getByRole('region', { name: 'Monatsplan nach Baustellen' }));
    const ct = within(r.getByRole('group', { name: 'CT Bau GmbH' }));
    // Mo: Max allein, Di: Max und Lena, Mi: Max allein — drei Balken.
    expect(ct.getAllByRole('button', { name: /: eingeplant, / }).filter((b) => b.className.startsWith('mo-balken')).map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/05\.10\.: eingeplant, Max Mustermann – Vorschau$/),
      expect.stringMatching(/06\.10\.: eingeplant, Max Mustermann, Lena Pichler – Vorschau$/),
      expect.stringMatching(/07\.10\.: eingeplant, Max Mustermann – Vorschau$/),
    ]);
    const huber = within(r.getByRole('group', { name: 'Familie Huber' }));
    expect(huber.getByRole('button', { name: /08\.10\.: eingeteilt, aber abwesend, Erna Beispiel – fehlt: Erna Beispiel/ }).className).toBe('mo-balken-konflikt');
    await userEvent.click(ct.getByRole('button', { name: /06\.10\.: eingeplant, / }));
    expect(within(vorschau()).getByText('Max Mustermann, Lena Pichler (Helfer)')).toBeInTheDocument();
    await userEvent.click(within(vorschau()).getByRole('button', { name: 'Bearbeiten' }));
    expect(onEinsatz).toHaveBeenCalledWith({ datum: '2026-10-06', projectNumber: 'B-1' });
  });
});

describe('Monat — Handy (Auftrag 5.4)', () => {
  it('„Diesen Monat abwesend“: je Abwesenheit eine Zeile, nicht über Arten zusammengelegt', () => {
    zeige();
    const liste = within(screen.getByText('Diesen Monat abwesend').closest('section') as HTMLElement);
    expect(liste.getByText('12.10. – 16.10. · Urlaub')).toBeInTheDocument();
    expect(liste.getByText('19.10. · Berufsschule')).toBeInTheDocument();
    expect(liste.getAllByText('Lena Pichler')).toHaveLength(2);
  });

  it('„Baustellen diesen Monat“ bleibt am Handy und öffnet die Vorschau der Baustelle', async () => {
    zeige();
    const liste = within(screen.getByText('Baustellen diesen Monat').closest('section') as HTMLElement);
    expect(liste.getByText('B-1 · 05.10. – 07.10. · 3 Einsatztage')).toBeInTheDocument();
    await userEvent.click(liste.getByText('CT Bau GmbH'));
    expect(vorschau()).toHaveAccessibleName('CT Bau');
    expect(within(vorschau()).getByText('Montag, 05.10.2026')).toBeInTheDocument();
  });

  it('der Kalender: „Alle Personen“ zählt Baustellen und meldet, wer fehlt; eine Person zeigt ihren Monat', async () => {
    zeige();
    const kal = within(screen.getByRole('group', { name: 'Monat, alle Personen' }));
    expect(kal.getByRole('button', { name: /07\.10\., 2 Baustellen – Vorschau$/ })).toBeInTheDocument();
    expect(kal.getByRole('button', { name: /08\.10\., 1 Baustelle, jemand Eingeteiltes fehlt/ })).toBeInTheDocument();
    await userEvent.click(kal.getByRole('button', { name: /07\.10\., 2 Baustellen/ }));
    expect(vorschau()).toHaveAccessibleName('Alle Einsätze');
    expect(within(vorschau()).getAllByRole('button', { name: /bearbeiten$/ })).toHaveLength(2);
    await userEvent.keyboard('{Escape}');
    await userEvent.selectOptions(screen.getByLabelText('Für wen'), 'u3');
    const erna = within(screen.getByRole('group', { name: 'Monat von Erna Beispiel' }));
    expect(erna.getByRole('button', { name: /08\.10\., eingeteilt, aber Krank/ })).toBeInTheDocument();
  });
});

describe('Monat — Mengengerüst (Auftrag 7)', () => {
  it('25 Personen × 31 Tage: höchstens 2.500 Elemente im Raster', () => {
    const leute = Array.from({ length: 25 }, (_, i) => mk(`x${i}`, `Person ${i}`, { einstufung: i < 3 ? 'lehrling' : undefined }));
    einsaetze = leute.flatMap((u, i) => TAGE.filter((_, k) => (k + i) % 3 !== 0).map((t) => e(t, u.uid, i % 2 ? 'B-1' : 'B-2')));
    urlaube = [];
    zeige({ leute });
    const anzahl = screen.getByRole('region', { name: 'Monatsplan nach Personen' }).querySelectorAll('*').length;
    expect(anzahl).toBeLessThanOrEqual(2500);
  });
});

/*
  DIESELBEN DATEN WIE DAS SEITENFENSTER (Abnahme 5.5): dasselbe Paar aus Tag
  und Baustelle einmal in der Vorschau, einmal im Seitenfenster
  „Einsatz bearbeiten“ — Eingeteilte, Aufgabe, Beginn und Ende stimmen
  überein.
*/
describe('Monat — Vorschau und Seitenfenster sagen dasselbe', () => {
  it('Eingeteilte, Aufgabe und Zeit', async () => {
    zeige({ sicht: 'baustellen' });
    const r = within(screen.getByRole('region', { name: 'Monatsplan nach Baustellen' }));
    await userEvent.click(within(r.getByRole('group', { name: 'CT Bau GmbH' })).getByRole('button', { name: /05\.10\.: eingeplant, / }));
    const v = within(vorschau());
    const wert = (name: string) => (v.getByText(name).nextElementSibling as HTMLElement).textContent;
    const vorschauDaten = { leute: wert('Eingeteilt'), aufgabe: wert('Aufgabe'), zeit: wert('Zeit') };
    await userEvent.keyboard('{Escape}');

    render(
      <MemoryRouter>
        <ToastProvider>
          <EinsatzFenster
            start={{ datum: '2026-10-05', projectNumber: 'B-1' }}
            tage={TAGE}
            einsaetze={einsaetze}
            users={LEUTE}
            staff={LEUTE}
            projects={BAUSTELLEN}
            onProjekt={() => undefined}
            urlaube={urlaube}
            betriebsurlaube={[]}
            termine={termine}
            onClose={() => undefined}
            onTagAnsehen={() => undefined}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    const fenster = within(await screen.findByRole('dialog', { name: 'Einsatz bearbeiten' }));
    await waitFor(() => expect(fenster.getByLabelText('Kommentar / Aufgabe')).toHaveValue('Bad rohinstallieren'));
    const gespeichert = within(fenster.getByRole('region', { name: 'Gespeichert eingeteilt' }));
    const namen = gespeichert.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(vorschauDaten.leute?.split(', ').map((n) => n.replace(/ \(.*\)$/, ''))).toEqual(
      LEUTE.filter((u) => namen.some((t) => t.includes(u.name))).map((u) => u.name),
    );
    expect(vorschauDaten.aufgabe).toBe((fenster.getByLabelText('Kommentar / Aufgabe') as HTMLInputElement).value);
    const von = (fenster.getByLabelText('Beginn (optional)') as HTMLInputElement).value;
    const bis = (fenster.getByLabelText('Ende (optional)') as HTMLInputElement).value;
    expect(vorschauDaten.zeit).toBe(`${von}–${bis}`);
    // Der Termin derselben Baustelle steht in beiden.
    expect(fenster.getByText(/Am selben Tag auf dieser Baustelle:/).parentElement?.textContent).toContain('08:00–10:00');
  });
});
