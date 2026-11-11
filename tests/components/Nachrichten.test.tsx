import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
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
 * - „Stumm schalten“ beim Thread nur, wer folgt (sonst machte es zum
 *   Folgenden); im privaten Gespräch immer;
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
  erwaehnt: [], anhaenge: [], uebernommen: false, gemeldet: false, reaktionen: [], ...x,
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
let reagierenErgebnis: Error | null = null;
/** Ohne Netz lädt auch der Verlauf nicht — die Rücknahme muss ohne ihn stimmen. */
let ohneNetz = false;
/** Hält die Antwort des Servers zurück, bis `freigeben()` — so lässt sich „sofort im Verlauf“ sehen. */
let warten: Promise<void> | null = null;
let freigeben = () => {};
const reagieren = vi.fn(async (...args: unknown[]) => {
  void args;
  if (warten) await warten;
  if (reagierenErgebnis) throw reagierenErgebnis;
});
const zurueckhalten = () => { warten = new Promise((r) => { freigeben = r; }); };

vi.mock('@/lib/db/nachrichten', () => ({
  kanalKopf: vi.fn(async () => { if (kopfWert instanceof Error) throw kopfWert; return kopfWert; }),
  verlauf: vi.fn(async () => { if (ohneNetz) throw new Error('Failed to fetch'); return { nachrichten: [...verlaufWert].reverse(), weiter: null }; }),
  wartendeNachrichten: vi.fn(async () => wartendWert),
  gelesen: () => gelesen(),
  anhangAdressen: vi.fn(async () => new Map()),
  nachrichtSenden: () => senden(),
  nachrichtMelden: () => melden(),
  nachrichtBearbeiten: vi.fn(async () => undefined),
  nachrichtLoeschen: vi.fn(async () => undefined),
  nachrichtReagieren: (...a: unknown[]) => reagieren(...a),
  REAKTIONEN: ['👍', '❤️', '😆', '😮', '😢', '🙏'],
  REAKTION_NAME: { '👍': 'Daumen hoch', '❤️': 'Herz', '😆': 'Lachen', '😮': 'Staunen', '😢': 'Traurig', '🙏': 'Danke' },
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
let kollegen: { uid: string; name: string; role: string; active: boolean }[] = [];
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => kollegen) }));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => []), listProjectsForEmployee: vi.fn(async () => []), searchProjects: vi.fn(async () => []),
}));
vi.mock('@/app/offenePosten', () => ({ postenNeuLaden: vi.fn(async () => undefined) }));
vi.mock('@/lib/useModule', () => ({ useModul: (id: string) => (id === 'nachrichten.direktnachrichten' ? direktAn : true) }));
let einblick: { id: string; stufe: string } | null = null;
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'ich', companyId: 'perl', role: 'Mitarbeiter', name: 'Max Monteur' }, company: { id: 'perl', name: 'Perl' }, einblick }),
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
  einblick = null;
  kollegen = [];
  melden.mockClear();
  senden.mockClear();
  gelesen.mockClear();
  reagieren.mockClear();
  reagierenErgebnis = null;
  warten = null;
  ohneNetz = false;
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

  /*
    E77 (11.11.2026): beim Darüberfahren eine Leiste mit den Reaktionen und
    den Handlungen als Zeichen, statt eines Fensters mit Wortknöpfen.
    Gegenprobe: mit dem Stand vor E77 gibt es keine Leiste — rot.
  */
  const leisteVon = async (name: RegExp) => {
    await userEvent.hover(await screen.findByRole('group', { name }));
    return screen.findByRole('toolbar', { name: /^Zur Nachricht von/ });
  };
  const namen = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => b.getAttribute('aria-label'));

  it('an der fremden Nachricht: reagieren, kopieren, melden — Bearbeiten und Löschen nicht; Melden gibt genau diese weiter', async () => {
    verlaufWert = [nachricht(1, { text: 'Beleidigung' })];
    zeige();
    const leiste = await leisteVon(/Nachricht von Anna Huber/);
    expect(namen(leiste)).toEqual([
      'Reagieren: Daumen hoch', 'Reagieren: Herz', 'Reagieren: Lachen', 'Reagieren: Staunen', 'Reagieren: Traurig', 'Reagieren: Danke',
      'Text kopieren', 'Melden',
    ]);
    await userEvent.click(within(leiste).getByRole('button', { name: 'Melden' }));
    const fenster = await screen.findByRole('dialog');
    expect(within(fenster).getByText(/genau diese Nachricht/)).toBeInTheDocument();
    await userEvent.click(within(fenster).getByRole('button', { name: 'An die Geschäftsführung weitergeben' }));
    await waitFor(() => expect(melden).toHaveBeenCalledTimes(1));
  });

  it('an der eigenen privaten Nachricht: Bearbeiten, In eine Baustelle übernehmen, Kopieren, Löschen — Melden nicht', async () => {
    verlaufWert = [nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur', text: 'Zählerstand 4711' })];
    zeige();
    const leiste = await leisteVon(/Nachricht von dir/);
    expect(namen(leiste).slice(6)).toEqual(['Bearbeiten', 'In eine Baustelle übernehmen', 'Text kopieren', 'Löschen']);
    // Löschen fragt nach, wie bisher.
    await userEvent.click(within(leiste).getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText('Nachricht löschen?')).toBeInTheDocument();
  });

  it('im Thread der Baustelle wird nichts „übernommen“ — er ist schon die Akte', async () => {
    kopfWert = kopf({ art: 'baustelle', titel: 'B-12', teilnehmer: null, projectId: 'p1' });
    verlaufWert = [nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur' })];
    zeige();
    const leiste = await leisteVon(/Nachricht von dir/);
    expect(namen(leiste).slice(6)).toEqual(['Bearbeiten', 'Text kopieren', 'Löschen']);
  });

  /*
    E79 (11.11.2026): „der Balken sollte nur erscheinen, wenn man direkt über
    die Nachricht hovert“, „mobil viel schlanker“, „Nachrichtentext frei
    markieren“. Gegenprobe: mit dem Stand von E78 öffnet die Zeile neben der
    Blase die Leiste, die Blase ist ein Knopf (nicht markierbar), und die
    Eingabetaste öffnet ein Fenster mit Liste — rot.
  */
  it('nur direkt über der Blase: neben ihr in der Zeile kommt keine Leiste; verlässt die Maus Blase und Leiste, geht sie', async () => {
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    zeige();
    const blase = await screen.findByRole('group', { name: /Nachricht von Anna Huber/ });
    // Die Zeile reicht über die ganze Breite — dort ist nichts.
    await userEvent.hover(blase.closest('li')!);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    await userEvent.hover(blase);
    const leiste = await screen.findByRole('toolbar');
    // Auf die Leiste: sie bleibt.
    await userEvent.hover(leiste);
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    // Weg von beiden: sie geht.
    await userEvent.unhover(leiste);
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('der Text ist kein Knopf mehr — er lässt sich markieren; ein Klick öffnet nichts', async () => {
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    zeige();
    const blase = await screen.findByRole('group', { name: /Nachricht von Anna Huber/ });
    expect(blase.tagName).toBe('DIV');
    expect(screen.queryByRole('button', { name: /Nachricht von/ })).not.toBeInTheDocument();
    await userEvent.click(blase);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mit der Tastatur: die Eingabetaste öffnet die schwebende Leiste an der Nachricht, Escape schließt sie, der Fokus kehrt zurück', async () => {
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    zeige();
    const blase = await screen.findByRole('group', { name: /Nachricht von Anna Huber/ });
    blase.focus();
    await userEvent.keyboard('{Enter}');
    const wahl = await screen.findByRole('dialog', { name: 'Zur Nachricht von Anna Huber' });
    const leiste = within(wahl).getByRole('toolbar');
    expect(within(leiste).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Reagieren: Daumen hoch', 'Reagieren: Herz', 'Reagieren: Lachen', 'Reagieren: Staunen', 'Reagieren: Traurig', 'Reagieren: Danke',
      'Text kopieren', 'Melden',
    ]);
    // Zweizeilig, mit Zielen für den Finger.
    expect(leiste).toHaveAttribute('data-zeilen', '2');
    expect(leiste).toHaveAttribute('data-gross', 'ja');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(blase).toHaveFocus();
  });

  it('in der schwebenden Leiste: ein Zeichen setzt die Reaktion und schließt; „Melden“ öffnet das Formular', async () => {
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    zeige();
    const blase = await screen.findByRole('group', { name: /Nachricht von Anna Huber/ });
    blase.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reagieren: Herz' }));
    expect(reagieren).toHaveBeenCalledWith('n1', '❤️', true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Zur Nachricht/ })).not.toBeInTheDocument());
    blase.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(await screen.findByRole('dialog', { name: /^Zur Nachricht/ })).getByRole('button', { name: 'Melden' }));
    expect(await screen.findByText(/genau diese Nachricht/)).toBeInTheDocument();
  });

  it('eine gelöschte Nachricht hat keine Leiste und keine Reaktionen', async () => {
    verlaufWert = [nachricht(1, { text: null, geloeschtAm: new Date().toISOString() }), nachricht(2, { text: 'Danach' })];
    zeige();
    await userEvent.hover(await screen.findByText('Nachricht gelöscht'));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});

/*
  REAKTIONEN (E77): sofort im Verlauf, der Server bestätigt im Hintergrund;
  geht es nicht durch, steht alles wie vorher und der Grund als Meldung.
  Gegenprobe: ohne die Reaktionen (Stand vor E77) fehlt jedes Kästchen — rot.
*/
describe('Reaktionen', () => {
  it('ein Zeichen in der Leiste setzt die eigene Reaktion — das Kästchen steht sofort, ein Klick darauf nimmt sie zurück', async () => {
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    zeige();
    await userEvent.hover(await screen.findByRole('group', { name: /Nachricht von Anna Huber/ }));
    const leiste = await screen.findByRole('toolbar');
    zurueckhalten();
    await userEvent.click(within(leiste).getByRole('button', { name: 'Reagieren: Daumen hoch' }));
    expect(reagieren).toHaveBeenCalledWith('n1', '👍', true);
    // Der Server hat noch nicht geantwortet — das Kästchen steht trotzdem schon.
    const kaestchen = screen.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' });
    expect(kaestchen).toHaveAttribute('aria-pressed', 'true');
    // Der Server bestätigt; der neu geladene Verlauf trägt die Reaktion.
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort', reaktionen: [{ zeichen: '👍', anzahl: 1, meine: true, personen: [{ uid: 'ich', name: 'Max Monteur' }] }] })];
    freigeben();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' })).toBeInTheDocument());
    zurueckhalten();
    await userEvent.click(screen.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' }));
    expect(reagieren).toHaveBeenLastCalledWith('n1', '👍', false);
    expect(screen.queryByRole('button', { name: /^Daumen hoch, / })).not.toBeInTheDocument();
    verlaufWert = [nachricht(1, { text: 'Bin um 7 dort' })];
    freigeben();
  });

  it('wer reagiert hat, steht am Kästchen — die eigene Person als „Du“ und zuerst; ein Klick auf eine fremde setzt dieselbe', async () => {
    verlaufWert = [nachricht(1, { reaktionen: [
      { zeichen: '👍', anzahl: 2, meine: true, personen: [{ uid: 'ich', name: 'Max Monteur' }, { uid: 'anna', name: 'Anna Huber' }] },
      { zeichen: '🙏', anzahl: 1, meine: false, personen: [{ uid: 'anna', name: 'Anna Huber' }] },
    ] })];
    zeige();
    const daumen = await screen.findByRole('button', { name: 'Daumen hoch, 2: Du, Anna Huber — zurücknehmen' });
    expect(daumen).toHaveAttribute('title', 'Du, Anna Huber');
    expect(daumen).toHaveTextContent('2');
    const danke = screen.getByRole('button', { name: 'Danke, 1: Anna Huber' });
    expect(danke).toHaveAttribute('aria-pressed', 'false');
    zurueckhalten();
    await userEvent.click(danke);
    expect(reagieren).toHaveBeenCalledWith('n1', '🙏', true);
    expect(screen.getByRole('button', { name: 'Danke, 2: Du, Anna Huber — zurücknehmen' })).toBeInTheDocument();
    freigeben();
  });

  it('ohne Netz: die Reaktion steht wieder wie vorher, mit dem Grund als Meldung', async () => {
    reagierenErgebnis = new Error('Failed to fetch');
    verlaufWert = [nachricht(1)];
    zeige();
    await userEvent.hover(await screen.findByRole('group', { name: /Nachricht von Anna Huber/ }));
    zurueckhalten();
    await userEvent.click(within(await screen.findByRole('toolbar')).getByRole('button', { name: 'Reagieren: Herz' }));
    expect(screen.getByRole('button', { name: 'Herz, 1: Du — zurücknehmen' })).toBeInTheDocument();
    ohneNetz = true;
    freigeben();
    expect(await screen.findByText(/Die Reaktion ging nicht durch\. Keine Verbindung/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Herz, 1/ })).not.toBeInTheDocument();
  });

  it('bei Schreibsperre: keine neuen Reaktionen, die eigene lässt sich zurücknehmen', async () => {
    kopfWert = kopf({ sperre: 'Du bist nicht mehr in dieser Runde.' });
    verlaufWert = [nachricht(1, { reaktionen: [
      { zeichen: '👍', anzahl: 1, meine: true, personen: [{ uid: 'ich', name: 'Max Monteur' }] },
      { zeichen: '🙏', anzahl: 1, meine: false, personen: [{ uid: 'anna', name: 'Anna Huber' }] },
    ] })];
    zeige();
    await userEvent.hover(await screen.findByRole('group', { name: /Nachricht von Anna Huber/ }));
    const leiste = await screen.findByRole('toolbar');
    expect(within(leiste).queryByRole('button', { name: /^Reagieren/ })).not.toBeInTheDocument();
    const danke = screen.getByRole('button', { name: 'Danke, 1: Anna Huber' });
    expect(danke).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(danke);
    expect(reagieren).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Daumen hoch, 1: Du — zurücknehmen' }));
    expect(reagieren).toHaveBeenCalledWith('n1', '👍', false);
  });
});

describe('Das Gespräch: Kopf und Sperre', () => {
  it('im Thread, dem man nicht folgt, gibt es kein „Stumm schalten“ — nur „Folgen“', async () => {
    kopfWert = kopf({ art: 'baustelle', titel: 'B-12', teilnehmer: null, projectId: 'p1', folgt: false });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für B-12' }));
    const menue = screen.getByRole('menu', { name: 'Aktionen für B-12' });
    expect(within(menue).getByRole('menuitem', { name: 'Folgen' })).toBeInTheDocument();
    expect(within(menue).queryByRole('menuitem', { name: 'Stumm schalten' })).not.toBeInTheDocument();
  });

  it('gleich bleibt: wer dem Thread folgt oder im privaten Gespräch ist, schaltet stumm', async () => {
    kopfWert = kopf({ art: 'baustelle', titel: 'B-12', teilnehmer: null, projectId: 'p1', folgt: true });
    const { unmount } = zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für B-12' }));
    expect(within(screen.getByRole('menu', { name: 'Aktionen für B-12' })).getByRole('menuitem', { name: 'Stumm schalten' })).toBeInTheDocument();
    unmount();

    kopfWert = kopf({ stumm: true });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weitere Aktionen für Anna Huber' }));
    expect(within(screen.getByRole('menu', { name: 'Aktionen für Anna Huber' })).getByRole('menuitem', { name: 'Wieder melden' })).toBeInTheDocument();
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

/*
  APPLE-NAH (E71, 09.11.2026): Tag und Uhrzeit stehen als Zeile über der
  Gruppe, nicht in jeder Blase; unter der letzten eigenen Nachricht steht
  „Gesendet“; am Schreibtisch sendet Eingabe, Umschalt + Eingabe macht einen
  Absatz.
*/
describe('Das Gespräch, Apple-nah (E71)', () => {
  const mitMaus = (an: boolean) => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: an && q.includes('pointer: fine'), media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  };
  afterEach(() => { mitMaus(false); });

  it('die Uhrzeit steht einmal über der Gruppe, nicht in jeder Blase', async () => {
    const t = (min: number) => new Date(Date.parse('2026-11-09T12:00:00Z') + min * 60_000).toISOString();
    verlaufWert = [
      nachricht(1, { text: 'Eins', gesendetAm: t(0) }),
      nachricht(2, { text: 'Zwei', gesendetAm: t(1) }),
      nachricht(3, { text: 'Nach der Pause', gesendetAm: t(40) }),
    ];
    zeige();
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    const zeilen = within(verlauf).getAllByRole('listitem');
    // Zeitzeile über der ersten Nachricht und nach der Pause — nicht über der zweiten.
    expect(zeilen[0].querySelector('.verlauf-tag')).not.toBeNull();
    expect(zeilen[1].querySelector('.verlauf-tag')).toBeNull();
    expect(zeilen[2].querySelector('.verlauf-tag')).not.toBeNull();
    // Keine Uhrzeit in der Blase mehr.
    expect(verlauf.querySelector('.nachricht-zeit')).toBeNull();
    // Gruppe: die erste beginnt, die zweite endet sie.
    expect(zeilen[0]).toHaveAttribute('data-anfang', 'ja');
    expect(zeilen[0]).not.toHaveAttribute('data-ende');
    expect(zeilen[1]).toHaveAttribute('data-ende', 'ja');
  });

  it('unter der letzten eigenen Nachricht steht „Gesendet“ — und nur dort', async () => {
    verlaufWert = [
      nachricht(1, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur', text: 'Erste' }),
      nachricht(2, { eigene: true, vonUid: 'ich', vonName: 'Max Monteur', text: 'Letzte eigene' }),
      nachricht(3, { text: 'Antwort' }),
    ];
    zeige();
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    const zeilen = within(verlauf).getAllByRole('listitem');
    expect(within(verlauf).getAllByText('Gesendet')).toHaveLength(1);
    expect(zeilen[1]).toHaveTextContent('Gesendet');
  });

  it('am Schreibtisch sendet Eingabe; Umschalt + Eingabe macht einen Absatz', async () => {
    mitMaus(true);
    zeige();
    const feld = await screen.findByRole('textbox', { name: 'Nachricht' });
    await userEvent.type(feld, 'Erste Zeile{Shift>}{Enter}{/Shift}zweite');
    expect(senden).not.toHaveBeenCalled();
    expect(feld).toHaveValue('Erste Zeile\nzweite');
    await userEvent.type(feld, '{Enter}');
    await waitFor(() => expect(senden).toHaveBeenCalledTimes(1));
  });

  it('gleich bleibt: am Telefon ist Eingabe ein Zeilenumbruch, gesendet wird mit dem Pfeil', async () => {
    mitMaus(false);
    zeige();
    const feld = await screen.findByRole('textbox', { name: 'Nachricht' });
    await userEvent.type(feld, 'Zeile{Enter}noch eine');
    expect(senden).not.toHaveBeenCalled();
    expect(feld).toHaveValue('Zeile\nnoch eine');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(senden).toHaveBeenCalledTimes(1));
  });
});

describe('Im Einblick des Supports', () => {
  it('steht ein Satz statt eines Gesprächs — und es wird nichts geladen', async () => {
    einblick = { id: 'e1', stufe: 'mitarbeiten' };
    const { kanalKopf, verlauf, postfach } = await import('@/lib/db/nachrichten');
    vi.mocked(kanalKopf).mockClear();
    vi.mocked(verlauf).mockClear();
    vi.mocked(postfach).mockClear();
    zeige();
    expect(await screen.findByText('Im Einblick nicht einsehbar')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Verlauf' })).not.toBeInTheDocument();
    expect(kanalKopf).not.toHaveBeenCalled();
    expect(verlauf).not.toHaveBeenCalled();
    expect(postfach).not.toHaveBeenCalled();
  });
});

describe('Neue Nachricht (E65)', () => {
  it('zeigt die Personen gleich — ein Tipp öffnet das Gespräch zu zweit', async () => {
    kollegen = [
      { uid: 'ich', name: 'Max Monteur', role: 'Mitarbeiter', active: true },
      { uid: 'anna', name: 'Anna Huber', role: 'Verwaltung', active: true },
      { uid: 'alt', name: 'Otto Alt', role: 'Mitarbeiter', active: false },
    ];
    const { kanalDirekt } = await import('@/lib/db/nachrichten');
    vi.mocked(kanalDirekt).mockClear();
    zeige('/nachrichten');
    await userEvent.click(await screen.findByRole('button', { name: 'Neue Nachricht' }));
    const bogen = await screen.findByRole('dialog');
    // Ohne Zwischenschritt: die Person steht da; man selbst und deaktivierte Konten nicht.
    const anna = await within(bogen).findByRole('button', { name: /Anna Huber/ });
    expect(within(bogen).queryByRole('button', { name: /Max Monteur/ })).not.toBeInTheDocument();
    expect(within(bogen).queryByRole('button', { name: /Otto Alt/ })).not.toBeInTheDocument();
    await userEvent.click(anna);
    await waitFor(() => expect(kanalDirekt).toHaveBeenCalledWith('anna'));
  });

  it('„Runde mit mehreren“: Personen wählen, dann der freiwillige Name', async () => {
    kollegen = [
      { uid: 'anna', name: 'Anna Huber', role: 'Verwaltung', active: true },
      { uid: 'berta', name: 'Berta Büro', role: 'Verwaltung', active: true },
    ];
    const { kanalRunde } = await import('@/lib/db/nachrichten');
    vi.mocked(kanalRunde).mockClear();
    zeige('/nachrichten');
    await userEvent.click(await screen.findByRole('button', { name: 'Neue Nachricht' }));
    const bogen = await screen.findByRole('dialog');
    await userEvent.click(within(bogen).getByRole('button', { name: 'Runde mit mehreren' }));
    await userEvent.click(await within(bogen).findByRole('button', { name: /Anna Huber/ }));
    await userEvent.click(within(bogen).getByRole('button', { name: /Berta Büro/ }));
    await userEvent.click(within(bogen).getByRole('button', { name: 'Weiter (2)' }));
    await userEvent.type(await screen.findByLabelText('Name der Runde (freiwillig)'), 'Bad Huber');
    await userEvent.click(screen.getByRole('button', { name: 'Runde beginnen' }));
    await waitFor(() => expect(kanalRunde).toHaveBeenCalledWith('Bad Huber', ['anna', 'berta']));
  });

  it('der Reiter „Ungelesen“ fragt den Server danach', async () => {
    const { postfach } = await import('@/lib/db/nachrichten');
    zeige('/nachrichten');
    await userEvent.click(await screen.findByRole('button', { name: 'Ungelesen' }));
    await waitFor(() => expect(vi.mocked(postfach).mock.calls.some((c) => c[0] === 'ungelesen')).toBe(true));
    expect(await screen.findByText('Alles gelesen')).toBeInTheDocument();
  });
});
