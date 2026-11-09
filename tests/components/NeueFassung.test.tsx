import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

/**
 * Die Leiste „Eine neue Fassung der App steht bereit".
 *
 * AUS DEM BETRIEB GEMELDET: „beim Öffnen erscheint die Update-Meldung mit
 * ‚Jetzt laden' nur ganz kurz während dem ‚Anmeldung wird geprüft'-Bildschirm.
 * Man sieht nicht einmal genau, was da steht, und kann auch nichts klicken."
 *
 * Die Ursache war eine Verdopplung: die App erfährt von einer neuen Fassung
 * aus ZWEI Quellen (Service Worker und eigene Serverprüfung), und das ist
 * richtig so — hängt eine fest, meldet die andere. Falsch war, auf beide zu
 * REAGIEREN. `darfStillUebernehmen` trägt einen Einmal-Merker je Sitzung:
 * der erste Aufruf übernimmt still und verbraucht ihn, der zweite bekommt
 * ein „nein" und zeigt die Leiste — kurz bevor der Neustart aus dem ersten
 * Aufruf sie wieder wegnimmt.
 *
 * Hier stehen deshalb die beiden Fragen, die darüber entscheiden, ob ein
 * Monteur beim Öffnen der App etwas Unerklärliches sieht.
 */

/*
  Was der Wechsel ergibt (`lib/sw.ts`). Ab 09.11.2026 sagt er es — vorher kam
  nichts zurück, und die Leiste hielt jedes Ergebnis für ein Neuladen.
*/
const neueFassungUebernehmen = vi.fn<(darfLaden?: () => boolean) => Promise<'neuGeladen' | 'ausstehend' | 'angehalten'>>(
  async () => 'neuGeladen',
);
let darfStill = true;
/** Der Rückruf, den der Service Worker bekommt. */
let vomWorker: (() => void) | undefined;
/** Der Rückruf, den die Serverprüfung bekommt. */
let vomServer: (() => void) | undefined;

vi.mock('@/lib/sw', async (original) => ({
  // Die echte Bedingung „kurz nach dem Start und unberührt“ — an ihr hängt die Notbremse.
  nochKalt: (await original<typeof import('@/lib/sw')>()).nochKalt,
  serviceWorkerAnmelden: (f: () => void) => {
    vomWorker = f;
  },
  neueFassungUebernehmen: (darfLaden?: () => boolean) => neueFassungUebernehmen(darfLaden),
  /*
    Der ECHTE Einmal-Merker, nachgebildet: beim ersten Mal ja, danach nie
    wieder. Ohne dieses Verhalten prüfte der Test etwas anderes als die
    Wirklichkeit — genau daran hing der gemeldete Fehler.
  */
  darfStillUebernehmen: () => {
    if (!darfStill) return false;
    darfStill = false;
    return true;
  },
}));
vi.mock('@/lib/fassungPruefen', () => ({
  fassungBeobachten: (f: () => void) => {
    vomServer = f;
    return () => undefined;
  },
}));
/** Steckt die App fest (ein Wechsel von dieser Fassung aus scheiterte schon)? */
let festgefahren = false;
const appHartErneuern = vi.fn(async () => undefined);
const darfHartErneuern = vi.fn(() => festgefahren);
vi.mock('@/lib/erneuerung', () => ({
  appHartErneuern: () => appHartErneuern(),
  darfHartErneuern: () => darfHartErneuern(),
  uebernahmeAufraeumen: vi.fn(),
}));

const { default: NeueFassung } = await import('@/components/NeueFassung');

beforeEach(() => {
  neueFassungUebernehmen.mockClear().mockResolvedValue('neuGeladen');
  darfStill = true;
  festgefahren = false;
  appHartErneuern.mockClear();
  darfHartErneuern.mockClear();
  vi.restoreAllMocks();
  vomWorker = undefined;
  vomServer = undefined;
});

const leiste = () => screen.queryByText(/Eine neue Fassung der App steht bereit/);
const hinweis = () => screen.queryByText(/Die Verbindung reicht gerade nicht/);

describe('Neue Fassung melden', () => {
  it('zeigt beim Kaltstart NICHTS und übernimmt still', async () => {
    render(<NeueFassung />);
    vomWorker?.();

    await waitFor(() => expect(neueFassungUebernehmen).toHaveBeenCalled());
    expect(leiste()).not.toBeInTheDocument();
  });

  it('blitzt NICHT auf, wenn beide Quellen dasselbe melden', async () => {
    /*
      DER GEMELDETE FEHLER. Beide melden beim Start; der zweite Aufruf lief
      auf die Leiste, obwohl die Übernahme längst unterwegs war. Sichtbar
      war sie nur eine Sekunde, anklickbar nie — die schlechteste Art, einem
      Monteur etwas mitzuteilen.
    */
    render(<NeueFassung />);
    vomWorker?.();
    vomServer?.();

    await waitFor(() => expect(neueFassungUebernehmen).toHaveBeenCalled());
    expect(leiste()).not.toBeInTheDocument();
    // Und übernommen wird EINMAL, nicht zweimal.
    expect(neueFassungUebernehmen).toHaveBeenCalledTimes(1);
  });

  it('fragt weiterhin, wenn nicht still übernommen werden darf', async () => {
    // Beim Fortsetzen kann jemand mitten in einem Schein stehen. Dort wird
    // gefragt — diese Abwägung war von Anfang an richtig und bleibt.
    darfStill = false;
    render(<NeueFassung />);
    vomServer?.();

    expect(await screen.findByText(/Eine neue Fassung der App steht bereit/)).toBeInTheDocument();
    expect(neueFassungUebernehmen).not.toHaveBeenCalled();
  });

  it('fragt doch noch, wenn der stille Neustart scheitert', async () => {
    /*
      Sonst bliebe die App still auf dem alten Stand, und niemand hätte je
      die Wahl gehabt. Ein verschluckter Fehlschlag ist hier teurer als eine
      Leiste zu viel.
    */
    neueFassungUebernehmen.mockRejectedValue(new Error('kein Netz'));
    render(<NeueFassung />);
    vomWorker?.();

    expect(await screen.findByText(/Eine neue Fassung der App steht bereit/)).toBeInTheDocument();
  });
});

/*
  DIE NOTBREMSE MITTEN IN DER ARBEIT (09.11.2026). Meldete die Serverprüfung
  beim Fortsetzen eine andere Fassung und war ein Wechsel von dieser aus
  schon einmal gescheitert, lud die App hart neu — mitten im Schein, ohne
  Rückfrage. Der Kopf von `NeueFassung` schließt genau das aus.
*/
describe('Die Notbremse', () => {
  it('gleich geblieben: beim Kaltstart, unberührt, räumt sie selbsttätig', async () => {
    festgefahren = true;
    render(<NeueFassung />);
    vomServer?.();

    await waitFor(() => expect(appHartErneuern).toHaveBeenCalledTimes(1));
    expect(leiste()).not.toBeInTheDocument();
  });

  it('nach einer Eingabe lädt sie NICHT neu, sondern fragt — und lässt den Merker unverbraucht', async () => {
    festgefahren = true;
    darfStill = false;
    render(<NeueFassung />);
    fireEvent.pointerDown(window);
    vomServer?.();

    expect(await screen.findByText(/Eine neue Fassung der App steht bereit/)).toBeInTheDocument();
    expect(appHartErneuern).not.toHaveBeenCalled();
    // Erst die Bedingung, dann der Merker: sonst wäre er für den Knopf schon verbraucht.
    expect(darfHartErneuern).not.toHaveBeenCalled();
  });

  it('nach dem Kaltstart-Fenster lädt sie NICHT neu, sondern fragt', async () => {
    festgefahren = true;
    darfStill = false;
    const start = Date.now();
    const uhr = vi.spyOn(Date, 'now').mockReturnValue(start);
    render(<NeueFassung />);
    uhr.mockReturnValue(start + 60_000);
    vomServer?.();

    expect(await screen.findByText(/Eine neue Fassung der App steht bereit/)).toBeInTheDocument();
    expect(appHartErneuern).not.toHaveBeenCalled();
  });

  it('„Jetzt laden“ räumt hart, wenn der gewöhnliche Wechsel schon gescheitert ist', async () => {
    festgefahren = true;
    darfStill = false;
    render(<NeueFassung />);
    fireEvent.pointerDown(window);
    vomServer?.();

    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt laden' }));
    expect(appHartErneuern).toHaveBeenCalledTimes(1);
    expect(neueFassungUebernehmen).not.toHaveBeenCalled();
  });

  it('gleich geblieben: „Jetzt laden“ wechselt gewöhnlich, solange nichts festgefahren ist', async () => {
    darfStill = false;
    render(<NeueFassung />);
    vomServer?.();

    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt laden' }));
    expect(neueFassungUebernehmen).toHaveBeenCalledTimes(1);
    expect(appHartErneuern).not.toHaveBeenCalled();
  });
});

/*
  LIEGT DIE NEUE HÜLLE NOCH NICHT (09.11.2026). Kamen ihre Bausteine über ein
  schwaches Netz nicht an, lud die App trotzdem neu, landete auf derselben
  Fassung — und der nächste Start räumte mit der Notbremse alles weg. Jetzt
  bleibt die Leiste und sagt, woran es liegt.
*/
describe('Die neue Hülle liegt noch nicht', () => {
  it('beim Kaltstart: statt still neu zu laden, kommt die Leiste mit dem Hinweis', async () => {
    neueFassungUebernehmen.mockResolvedValue('ausstehend');
    render(<NeueFassung />);
    vomServer?.();

    expect(await screen.findByText(/Die Verbindung reicht gerade nicht/)).toBeInTheDocument();
    expect(leiste()).toBeInTheDocument();
    expect(appHartErneuern).not.toHaveBeenCalled();
  });

  it('die stille Übernahme lädt nicht mehr, sobald jemand tippt', async () => {
    let darfLaden: (() => boolean) | undefined;
    neueFassungUebernehmen.mockImplementation(async (d) => {
      darfLaden = d;
      return 'neuGeladen';
    });
    render(<NeueFassung />);
    vomWorker?.();
    await waitFor(() => expect(darfLaden).toBeDefined());

    expect(darfLaden!()).toBe(true);
    fireEvent.pointerDown(window);
    expect(darfLaden!()).toBe(false);
  });

  it('angehalten, weil jemand tippt: die Leiste kommt — ohne Hinweis, die Hülle liegt ja', async () => {
    neueFassungUebernehmen.mockResolvedValue('angehalten');
    render(<NeueFassung />);
    vomWorker?.();

    expect(await screen.findByText(/Eine neue Fassung der App steht bereit/)).toBeInTheDocument();
    expect(hinweis()).not.toBeInTheDocument();
  });

  it('„Jetzt laden“: liegt die Hülle nicht, bleibt die Leiste mit dem Hinweis, und der Knopf geht wieder', async () => {
    darfStill = false;
    render(<NeueFassung />);
    vomServer?.();
    expect(hinweis()).not.toBeInTheDocument();

    let antworten: (e: 'ausstehend') => void = () => undefined;
    neueFassungUebernehmen.mockImplementation(() => new Promise((f) => { antworten = f; }));
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt laden' }));
    // Solange der Worker holt, läuft der Knopf.
    await waitFor(() => expect(screen.getByRole('button', { name: /Jetzt laden/ })).toBeDisabled());

    antworten('ausstehend');
    expect(await screen.findByText(/Die Verbindung reicht gerade nicht/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jetzt laden' })).toBeEnabled();
    expect(appHartErneuern).not.toHaveBeenCalled();
  });

  it('meldet der Worker danach die neue Fassung, ist der Hinweis erledigt', async () => {
    darfStill = false;
    neueFassungUebernehmen.mockResolvedValue('ausstehend');
    render(<NeueFassung />);
    vomServer?.();
    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt laden' }));
    expect(await screen.findByText(/Die Verbindung reicht gerade nicht/)).toBeInTheDocument();

    // Der Worker meldet erst, wenn die Hülle samt Bausteinen liegt.
    act(() => vomWorker?.());

    await waitFor(() => expect(hinweis()).not.toBeInTheDocument());
    expect(leiste()).toBeInTheDocument();
  });
});
