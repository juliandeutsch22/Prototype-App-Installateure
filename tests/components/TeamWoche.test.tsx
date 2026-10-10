import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, Project, Termin } from '@/types';

/**
 * DIE TEAM-WOCHE DER MONTEURE (`WochenplanView nurLesen`).
 *
 * SEIT 10.10.2026 MIT DEN BAUSTEINEN DER EINSATZPLANUNG, nur zum Lesen. Bis
 * dahin blieb sie nach Auftrag 4.8 beim älteren Raster; die Durchsicht vom
 * 10.10. fand darin Einsätze, die in der Spalte von heute verschwanden
 * (gleiche Farbe), Kästen in der Karte am Handy, einen Lehrling als
 * „Helfer“ und abgeschnittene Namen. Was gleich bleiben muss: keine Knöpfe
 * außer Woche, Gruppen und Tageswahl, kein „frei“, „abwesend“ ohne Grund,
 * Betriebsurlaub mit Ausnahme, M33 („fehlt“) sichtbar.
 *
 * Dazu das GANZE gezeichnete DOM gegen eine eingecheckte Datei: eine
 * Änderung an den gemeinsamen Bausteinen, die die Team-Woche mitändert,
 * fällt hier auf und muss bewusst nachgezogen werden.
 */

const BAUSTELLEN: Project[] = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', status: 'Aktiv' } as Project,
  { id: 'p2', companyId: 'perl', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf', status: 'Aktiv' } as Project,
];

const mk = (uid: string, name: string, x: Partial<AppUser> = {}) =>
  ({
    id: uid, companyId: 'perl', uid, name, email: `${uid}@perl.at`,
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...x,
  }) as AppUser;

const LEUTE: AppUser[] = [
  mk('u1', 'Max Mustermann'),
  mk('u2', 'Erna Beispiel'),
  mk('u3', 'Stefan Gruber', { einstufung: 'obermonteur' } as Partial<AppUser>),
  mk('u4', 'Jürgen Fasching', { einstufung: 'helfer' } as Partial<AppUser>),
  mk('u5', 'Lena Pichler', { einstufung: 'lehrling' } as Partial<AppUser>),
];

// Die Woche mit dem Nationalfeiertag (Mo 26.10.) und Allerheiligen (So 01.11.).
const E = (id: string, date: string, pn: string, uid: string, x: Partial<Assignment> = {}) =>
  ({ id, companyId: 'perl', date, projectNumber: pn, userId: uid, userName: LEUTE.find((u) => u.uid === uid)!.name, ...x }) as Assignment & { id: string };
const EINSAETZE = [
  E('a1', '2026-10-27', 'B-2026-0147', 'u1', { zeitVon: '07:00', zeitBis: '15:30' }),
  E('a2', '2026-10-27', 'B-2026-0147', 'u4', { asHelper: true }),
  E('a3', '2026-10-28', 'B-2026-0147', 'u3'),
  E('a4', '2026-10-28', 'B-2026-0148', 'u3', { zeitVon: '16:00' }),
  E('a5', '2026-10-29', 'B-2026-0148', 'u2'),
  E('a6', '2026-10-29', 'B-2026-0148', 'u5', { asHelper: true }),
  E('a7', '2026-10-31', 'B-2026-0148', 'u1', { zeitVon: '08:00', zeitBis: '12:00' }),
  // Eine Facharbeiterin als Helfer: nur hier gehört „als Helfer“ in den Block.
  E('a8', '2026-10-27', 'B-2026-0148', 'u2', { asHelper: true }),
];
/** So sieht der Monteur Abwesenheiten: ohne Grund. */
const ABWESEND = [
  { userId: 'u2', von: '2026-10-29', bis: '2026-10-29', grund: null, zeiten: null },
  { userId: 'u4', von: '2026-10-28', bis: '2026-10-28', grund: null, zeiten: '13:00–17:00' },
  // Am selben Tag auch stundenweise — nach der ganztägigen Zeile.
  { userId: 'u2', von: '2026-10-29', bis: '2026-10-29', grund: null, zeiten: '08:00–10:00' },
];
const BETRIEBSURLAUB = [{ id: 'b1', von: '2026-10-30', bis: '2026-10-30', bezeichnung: 'Fenstertag', ausgenommen: ['u3'] }];
const TERMINE: Termin[] = [
  { id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-10-27', zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-2026-0147', teilnehmer: ['u1'], ortName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118' },
  { id: 't2', companyId: 'perl', art: 'Abnahme', datum: '2026-10-29', projectNumber: 'B-2026-0148', teilnehmer: [], ortName: 'Gemeinde Neudorf' },
];

vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => TERMINE),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
}));
const users = vi.hoisted(() => ({ listUsers: vi.fn() }));
vi.mock('@/lib/db/users', () => users);
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => BAUSTELLEN),
  listRecentProjects: vi.fn(async () => BAUSTELLEN),
  listProjectsByNumbers: vi.fn(async () => BAUSTELLEN),
}));
const abwesenheiten = vi.hoisted(() => ({ listBetriebsurlaubeImZeitraum: vi.fn() }));
vi.mock('@/lib/db/abwesenheiten', () => abwesenheiten);
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => []),
  listAbwesendInRange: vi.fn(async () => ABWESEND),
}));
vi.mock('@/lib/db/assignments', () => ({
  kalenderAboStand: vi.fn(async () => null),
  subscribeAssignmentsInRange: (_c: string, _v: string, _b: string, cb: (r: unknown[]) => void) => {
    cb(EINSAETZE);
    return () => undefined;
  },
}));

const authWert = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max Mustermann', role: 'Mitarbeiter' as const, email: 'u1@perl.at', docId: 'u1' },
  // Das Abo ist erlaubt — die Team-Woche zeigt es trotzdem nicht.
  company: { id: 'perl', name: 'Perl Installationen', wochenplanFuerAlle: true, kalenderAboErlaubt: true },
  loading: false, error: null,
  signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WochenplanView } = await import('@/features/assignments/WochenplanView');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
  users.listUsers.mockImplementation(async () => LEUTE);
  abwesenheiten.listBetriebsurlaubeImZeitraum.mockImplementation(async () => BETRIEBSURLAUB);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Die von React vergebenen Kennungen (`useId`) hängen an der Reihenfolge der Bausteine, nicht an der Team-Woche. */
function ohneZufall(html: string): string {
  return html.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:/g, '«id»');
}

function zeigen() {
  return render(
    <MemoryRouter initialEntries={['/my-schedule/team']}>
      <ToastProvider>
        <WochenplanView nurLesen />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Zeigen und warten, bis alles geladen ist: Einsätze, Abwesenheiten, Betriebsurlaub, Termine. */
async function geladen() {
  zeigen();
  const raster = await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
  await within(raster).findAllByText('Fenstertag');
  await within(raster).findByText('abwesend 13:00–17:00');
  await within(raster).findAllByText('Lieferung');
  return raster;
}

/** Die Zelle einer Person an einem Tag (Spalte nach der Namensspalte). */
function zelle(raster: HTMLElement, name: RegExp, tagIndex: number): HTMLElement {
  const zeile = within(raster).getByRole('rowheader', { name }).closest('tr')!;
  return zeile.querySelectorAll('td')[tagIndex] as HTMLElement;
}

describe('Team-Woche — die Bausteine der Planung, nur zum Lesen', () => {
  it('hat keine Knöpfe außer Woche, Gruppen und Tageswahl — und nirgends „frei“', async () => {
    const raster = await geladen();
    const container = raster.closest('body')!;
    const knoepfe = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    for (const k of knoepfe) {
      expect(k).toMatch(/^(Hilfe zu dieser Seite|Woche zurück|Woche vor|.+ · \d+|(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag) \d.*)$/);
    }
    expect(container.textContent).not.toMatch(/\bfrei\b/);
    expect(container.textContent).not.toMatch(/Einsatz planen|Ganzen Tag ansehen|Termin anlegen|ohne Annahme|niemand dort/);
  });

  it('heute ist markiert, und ein Einsatz bleibt darin sichtbar', async () => {
    const raster = await geladen();
    const heute = within(raster).getAllByRole('columnheader').find((h) => h.getAttribute('aria-current') === 'date')!;
    expect(heute).toHaveTextContent('Mi 28.10.');
    // Die Zelle von heute trägt die Fläche „heute“, der Block seine eigene Farbe.
    const z = zelle(raster, /Stefan Gruber/, 2);
    expect(z.className).toBe('wp-zelle-heute');
    expect(within(z).getByText('Gemeinde Neudorf').closest('.eintrag')).not.toBeNull();
  });

  it('die eigene Zeile trägt „du“', async () => {
    const raster = await geladen();
    expect(within(raster).getByRole('rowheader', { name: 'Max Mustermann · du' })).toBeInTheDocument();
    expect(within(raster).getByRole('rowheader', { name: 'Erna Beispiel' })).toBeInTheDocument();
  });

  it('„als Helfer“ nur, wo es von der Einstufung abweicht — nie beim Lehrling', async () => {
    const raster = await geladen();
    expect(within(zelle(raster, /Erna Beispiel/, 1)).getByText('als Helfer')).toBeInTheDocument();
    expect(within(zelle(raster, /Lena Pichler/, 3)).queryByText('als Helfer')).toBeNull();
    expect(within(zelle(raster, /Jürgen Fasching/, 1)).queryByText('als Helfer')).toBeNull();
    expect(raster.textContent).not.toMatch(/\(Helfer\)/);
  });

  it('eingeteilt und ganztags weg: der Block mit dem Kunden und „fehlt“ (M33) — ganztags geht vor stundenweise', async () => {
    const raster = await geladen();
    const z = zelle(raster, /Erna Beispiel/, 3);
    const block = within(z).getByText('Gemeinde Neudorf').closest('.eintrag-konflikt')!;
    expect(block).toHaveTextContent('fehlt');
    expect(block.textContent).not.toMatch(/08:00–10:00/);
  });

  it('stundenweise weg steht über dem Einsatz, ohne Grund', async () => {
    const raster = await geladen();
    const z = zelle(raster, /Jürgen Fasching/, 2);
    expect(within(z).getByText('abwesend 13:00–17:00')).toBeInTheDocument();
  });

  it('Betriebsurlaub mit Ausnahme: die anderen grau, der Ausgenommene wie an jedem Tag', async () => {
    const raster = await geladen();
    expect(within(zelle(raster, /Max Mustermann/, 4)).getByText('Betriebsurlaub')).toBeInTheDocument();
    expect(within(zelle(raster, /Stefan Gruber/, 4)).queryByText('Betriebsurlaub')).toBeNull();
  });

  it('Termine stehen beim Teilnehmer und am Einsatz derselben Baustelle; im Kopf nur gezählt, ohne Verweis', async () => {
    const raster = await geladen();
    expect(within(zelle(raster, /Max Mustermann/, 1)).getByText('Lieferung').closest('.eintrag-termin')).not.toBeNull();
    expect(within(zelle(raster, /Lena Pichler/, 3)).getByText(/Abnahme/)).toBeInTheDocument();
    const kopf = within(raster).getAllByRole('columnheader')[2];
    expect(within(kopf).getByText('1 Termin').className).toBe('kopf-info');
  });

  it('am Handy der Tag von heute, je Person dieselben Einträge; wer nichts hat, „nicht eingeteilt“', async () => {
    await geladen();
    const liste = screen.getByRole('region', { name: 'Wochenplan als Liste' });
    expect(within(liste).getByText('Mittwoch 28.10. · heute')).toBeInTheDocument();
    expect(within(liste).getByText('Max Mustermann').parentElement).toHaveTextContent('Max Mustermann · du');
    expect(within(liste).getAllByText('nicht eingeteilt').length).toBeGreaterThan(0);
    expect(liste.querySelectorAll('.tag-karte-lesen, .tl-frei')).toHaveLength(0);
  });

  it('am Wochenende stehen am Handy nur, die eingeteilt sind — kein „nicht eingeteilt“ für jeden', async () => {
    await geladen();
    const liste = screen.getByRole('region', { name: 'Wochenplan als Liste' });
    await userEvent.click(within(liste).getByRole('button', { name: /^Samstag 31\.10\./ }));
    expect(within(liste).getByText('Max Mustermann')).toBeInTheDocument();
    expect(within(liste).queryByText('Erna Beispiel')).toBeNull();
    expect(within(liste).queryByText('nicht eingeteilt')).toBeNull();
    // Gegenprobe: an einem Werktag steht weiter jeder, mit „nicht eingeteilt“, wo nichts ist.
    await userEvent.click(within(liste).getByRole('button', { name: /^Mittwoch 28\.10\./ }));
    expect(within(liste).getByText('Erna Beispiel')).toBeInTheDocument();
    expect(within(liste).getAllByText('nicht eingeteilt').length).toBeGreaterThan(0);
  });

  it('zeigt beim Laden „Wird geladen“, nicht „niemand im Außendienst“', async () => {
    users.listUsers.mockImplementation(() => new Promise(() => undefined));
    zeigen();
    expect(await screen.findByText('Wird geladen …')).toBeInTheDocument();
    expect(screen.queryByText(/Außendienst/)).toBeNull();
  });

  it('sagt es, wenn der Betriebsurlaub nicht geladen werden konnte', async () => {
    abwesenheiten.listBetriebsurlaubeImZeitraum.mockImplementation(async () => {
      throw new Error('weg');
    });
    zeigen();
    expect(await screen.findByText(/Der Betriebsurlaub konnte nicht geladen werden/)).toBeInTheDocument();
  });

  it('ein Kollege, der nicht mehr einplanbar ist, steht mit seinem Einsatz in eigener Gruppe (10.10.2026)', async () => {
    EINSAETZE.push(E('a9', '2026-10-27', 'B-2026-0148', 'u1'));
    EINSAETZE[EINSAETZE.length - 1].userId = 'u9';
    EINSAETZE[EINSAETZE.length - 1].userName = 'Gerhard Weg';
    try {
      const raster = await geladen();
      expect(within(raster).getByRole('button', { name: /Nicht mehr einplanbar · 1/ })).toBeInTheDocument();
      expect(within(zelle(raster, /Gerhard Weg/, 1)).getByText('Gemeinde Neudorf')).toBeInTheDocument();
    } finally {
      EINSAETZE.pop();
    }
  });

  it('zeichnet mit festen Daten genau das festgehaltene DOM', async () => {
    const raster = await geladen();
    const container = raster.closest('body')!.firstElementChild!;
    await expect(ohneZufall(container.innerHTML).replace(/></g, '>\n<')).toMatchFileSnapshot(
      '../fixtures/teamWoche-dom.html',
    );
  });
});
