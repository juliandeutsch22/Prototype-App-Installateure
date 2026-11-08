import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { KanalKopf, Nachricht, PostfachZeile } from '@/lib/db/nachrichten';

/**
 * DIE NACHRICHTEN (M10/B09) in der Oberfläche.
 *
 * Festgehalten wird:
 * - der Posteingang zeigt die eigene Zahl ungelesener je Gespräch; ohne
 *   Direktnachrichten keinen Reiter „Direkt“;
 * - das Gespräch: „Du“ an der eigenen Nachricht, „Nachricht gelöscht“,
 *   „bearbeitet“; was im Ausgangsfach liegt, steht als „vorgemerkt“; eine
 *   abgelehnte Nachricht als „Nicht gesendet“ mit „Erneut senden“;
 * - an der fremden Nachricht „Melden …“, nicht „Bearbeiten“/„Löschen“; an
 *   der eigenen privaten „In eine Baustelle übernehmen …“; das Melden gibt
 *   genau diese Nachricht weiter;
 * - ist das Gespräch geschlossen, steht statt der Eingabe der Grund;
 * - ein Gespräch, das es nicht gibt (oder das nicht meins ist), sagt das.
 *
 * Gegenprobe: ohne `src/features/nachrichten` gibt es nichts zu zeigen — rot.
 */

const kopf = (x: Partial<KanalKopf> = {}): KanalKopf => ({
  kanal: 'k1', art: 'direkt', titel: 'Anna Huber', name: null, projectId: null,
  teilnehmer: [{ uid: 'ich', name: 'Max Monteur', aktiv: true, ich: true }, { uid: 'anna', name: 'Anna Huber', aktiv: true, ich: false }],
  folgt: true, stumm: false, ungelesen: 0, sperre: null, ...x,
});
const nachricht = (n: number, x: Partial<Nachricht> = {}): Nachricht => ({
  id: `n${n}`, vonUid: 'anna', vonName: 'Anna Huber', eigene: false, text: `Text ${n}`,
  gesendetAm: new Date(Date.now() - (10 - n) * 60_000).toISOString(), bearbeitetAm: null, geloeschtAm: null,
  erwaehnt: [], anhaenge: [], uebernommen: false, gemeldet: false, ...x,
});

let kopfWert: KanalKopf | Error = kopf();
let verlaufWert: Nachricht[] = [];
let wartendWert: { id: string; kanal: string; text: string; dateien: []; seit: number }[] = [];
let sendenErgebnis: 'confirmed' | 'queued' | Error = 'confirmed';
let postfachWert: PostfachZeile[] = [];
let direktAn = true;
const melden = vi.fn(async () => 'm1');
const senden = vi.fn(async () => {
  if (sendenErgebnis instanceof Error) throw sendenErgebnis;
  return sendenErgebnis;
});
const gelesen = vi.fn(async () => undefined);

vi.mock('@/lib/db/nachrichten', () => ({
  kanalKopf: vi.fn(async () => { if (kopfWert instanceof Error) throw kopfWert; return kopfWert; }),
  verlauf: vi.fn(async () => ({ nachrichten: [...verlaufWert].reverse(), weiter: null })),
  wartendeNachrichten: vi.fn(async () => wartendWert),
  gelesen: () => gelesen(),
  anhangAdressen: vi.fn(async () => new Map()),
  nachrichtSenden: () => senden(),
  nachrichtMelden: () => melden(),
  nachrichtBearbeiten: vi.fn(async () => undefined),
  nachrichtLoeschen: vi.fn(async () => undefined),
  postfach: vi.fn(async () => ({ zeilen: postfachWert, weiter: null })),
  kanalDirekt: vi.fn(async () => 'k1'),
  kanalRunde: vi.fn(async () => 'k2'),
  kanalBaustelle: vi.fn(async () => 'k3'),
  stummSchalten: vi.fn(async () => undefined),
  folgen: vi.fn(async () => undefined),
  rundeVerlassen: vi.fn(async () => undefined),
  rundeHinzufuegen: vi.fn(async () => undefined),
  rundeBenennen: vi.fn(async () => undefined),
  abonniereNachrichtenStand: vi.fn(() => () => undefined),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []) }));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => []), listProjectsForEmployee: vi.fn(async () => []), searchProjects: vi.fn(async () => []),
}));
vi.mock('@/app/offenePosten', () => ({ postenNeuLaden: vi.fn(async () => undefined) }));
vi.mock('@/lib/useModule', () => ({ useModul: (id: string) => (id === 'nachrichten.direktnachrichten' ? direktAn : true) }));
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'ich', companyId: 'perl', role: 'Mitarbeiter', name: 'Max Monteur' }, company: { id: 'perl', name: 'Perl' } }),
}));

const { default: NachrichtenView } = await import('@/features/nachrichten/NachrichtenView');

const zeige = (pfad = '/nachrichten/k1') => render(
  <MemoryRouter initialEntries={[pfad]}>
    <ToastProvider>
      <Routes>
        <Route path="/nachrichten" element={<NachrichtenView />} />
        <Route path="/nachrichten/:kanal" element={<NachrichtenView />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  kopfWert = kopf();
  verlaufWert = [];
  wartendWert = [];
  sendenErgebnis = 'confirmed';
  postfachWert = [];
  direktAn = true;
  melden.mockClear();
  senden.mockClear();
  gelesen.mockClear();
});

describe('Der Posteingang', () => {
  it('zeigt je Gespräch die eigene Zahl ungelesener — ohne Direktnachrichten keinen Reiter „Direkt“', async () => {
    postfachWert = [{
      kanal: 'k1', art: 'baustelle', titel: 'B-12 · Familie Huber', projectId: 'p1', zuletzt: new Date().toISOString(),
      letzteText: 'Wasser ist abgedreht', letzteVon: 'Anna Huber', letzteEigene: false, ungelesen: 2, stumm: false, geschlossen: false,
    }];
    direktAn = false;
    zeige('/nachrichten');
    const zeile = await screen.findByRole('link', { name: /B-12 · Familie Huber/ });
    expect(zeile.closest('li')).toHaveTextContent('2 neu');
    expect(zeile.closest('li')).toHaveTextContent('Anna Huber: Wasser ist abgedreht');
    expect(screen.queryByRole('button', { name: 'Direkt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baustellen' })).toBeInTheDocument();
  });
});

describe('Das Gespräch', () => {
  it('„Du“, „bearbeitet“, „Nachricht gelöscht“ — und gelesen ist, was man sieht', async () => {
    verlaufWert = [
      nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur', text: 'Bin um 7 dort', bearbeitetAm: new Date().toISOString() }),
      nachricht(2, { text: null, geloeschtAm: new Date().toISOString() }),
      nachricht(3, { text: 'Passt' }),
    ];
    zeige();
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    const zeilen = within(verlauf).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('Du');
    expect(zeilen[0]).toHaveTextContent('bearbeitet');
    expect(zeilen[1]).toHaveTextContent('Nachricht gelöscht');
    expect(zeilen[1]).not.toHaveTextContent('Text 2');
    expect(zeilen[2]).toHaveTextContent('Passt');
    await waitFor(() => expect(gelesen).toHaveBeenCalled());
  });

  it('was im Ausgangsfach liegt, steht als vorgemerkt da', async () => {
    wartendWert = [{ id: 'w1', kanal: 'k1', text: 'Aus dem Keller', dateien: [], seit: Date.now() }];
    zeige();
    expect(await screen.findByText('Aus dem Keller')).toBeInTheDocument();
    expect(screen.getByText('auf diesem Gerät vorgemerkt, wird gesendet')).toBeInTheDocument();
  });

  it('eine abgelehnte Nachricht: „Nicht gesendet“ mit Grund und „Erneut senden“', async () => {
    sendenErgebnis = new Error('Das Konto ist deaktiviert');
    zeige();
    const feld = await screen.findByRole('textbox', { name: 'Nachricht' });
    await userEvent.type(feld, 'Hallo');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText(/Nicht gesendet: Das Konto ist deaktiviert/)).toBeInTheDocument();
    sendenErgebnis = 'confirmed';
    await userEvent.click(screen.getByRole('button', { name: 'Erneut senden' }));
    await waitFor(() => expect(senden).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Nicht gesendet/)).not.toBeInTheDocument());
  });

  it('an der fremden Nachricht Melden — es geht genau diese weiter; Bearbeiten und Löschen nicht', async () => {
    verlaufWert = [nachricht(1, { text: 'Beleidigung' })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Nachricht von Anna Huber/ }));
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Melden …' }));
    expect(screen.getByText(/genau diese Nachricht/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'An die Geschäftsführung weitergeben' }));
    await waitFor(() => expect(melden).toHaveBeenCalledTimes(1));
  });

  it('an der eigenen privaten Nachricht: Bearbeiten, Löschen, In eine Baustelle übernehmen — Melden nicht', async () => {
    verlaufWert = [nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur', text: 'Zählerstand 4711' })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Nachricht von dir/ }));
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In eine Baustelle übernehmen …' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Melden …' })).not.toBeInTheDocument();
  });

  it('im Thread der Baustelle wird nichts „übernommen“ — er ist schon die Akte', async () => {
    kopfWert = kopf({ art: 'baustelle', titel: 'B-12', teilnehmer: null, projectId: 'p1' });
    verlaufWert = [nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur' })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Nachricht von dir/ }));
    expect(screen.queryByRole('button', { name: 'In eine Baustelle übernehmen …' })).not.toBeInTheDocument();
  });

  it('ist das Gespräch geschlossen, steht statt der Eingabe der Grund', async () => {
    kopfWert = kopf({ sperre: 'Das Konto von Anna Huber ist deaktiviert — das Gespräch ist geschlossen.' });
    zeige();
    expect(await screen.findByText(/das Gespräch ist geschlossen/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nachricht' })).not.toBeInTheDocument();
  });

  it('ein Gespräch, das nicht meins ist, sagt das', async () => {
    kopfWert = new Error('Dieses Gespräch gibt es nicht oder es ist nicht deines');
    zeige();
    expect(await screen.findByText(/nicht deines/)).toBeInTheDocument();
  });
});
