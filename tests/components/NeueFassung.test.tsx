import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

const neueFassungUebernehmen = vi.fn(async () => undefined);
let darfStill = true;
/** Der Rückruf, den der Service Worker bekommt. */
let vomWorker: (() => void) | undefined;
/** Der Rückruf, den die Serverprüfung bekommt. */
let vomServer: (() => void) | undefined;

vi.mock('@/lib/sw', () => ({
  serviceWorkerAnmelden: (f: () => void) => {
    vomWorker = f;
  },
  neueFassungUebernehmen: () => neueFassungUebernehmen(),
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
vi.mock('@/lib/erneuerung', () => ({
  appHartErneuern: vi.fn(async () => undefined),
  darfHartErneuern: () => false,
  uebernahmeAufraeumen: vi.fn(),
}));

const { default: NeueFassung } = await import('@/components/NeueFassung');

beforeEach(() => {
  neueFassungUebernehmen.mockClear().mockResolvedValue(undefined);
  darfStill = true;
  vomWorker = undefined;
  vomServer = undefined;
});

const leiste = () => screen.queryByText(/Eine neue Fassung der App steht bereit/);

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
