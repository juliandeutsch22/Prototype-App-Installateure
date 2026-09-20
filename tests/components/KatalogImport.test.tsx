import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import KatalogImport from '@/features/materials/KatalogImport';

/**
 * Der Katalogimport — geprüft wird vor allem, WANN geschrieben wird.
 *
 * Die ganze Bauart dieser Seite steht und fällt mit einem Satz: nach dem
 * Einlesen ist noch nichts in der Datenbank. Wäre es anders, wäre der
 * Probelauf ein Bericht über eine Tatsache statt über einen Vorschlag — und
 * der Betrieb sähe erst hinterher, dass sein Grosshändler die Norm anders
 * auslegt.
 */

const laufAnlegen = vi.fn();
const zeilenSchicken = vi.fn();
const uebernehmen = vi.fn();
const rabattsatzSetzen = vi.fn();
const lieferantAnlegen = vi.fn();
let saetze: Array<{ id: string; gruppe: string; prozent: number }> = [];

/** Die Reihenfolge der Schreibzugriffe — sie ist hier die eigentliche Regel. */
let reihenfolge: string[] = [];

vi.mock('@/lib/db/pg/datanorm', () => ({
  lieferanten: () => Promise.resolve([{ id: 'hti', companyId: 'perl', name: 'HTI', active: true }]),
  lieferantAnlegen: (...a: unknown[]) => {
    reihenfolge.push('lieferant');
    return lieferantAnlegen(...a);
  },
  rabattsaetze: () => Promise.resolve(saetze),
  rabattsatzSetzen: (...a: unknown[]) => {
    reihenfolge.push('satz');
    return rabattsatzSetzen(...a);
  },
  laufAnlegen: (...a: unknown[]) => {
    reihenfolge.push('lauf');
    return laufAnlegen(...a);
  },
  zeilenSchicken: (...a: unknown[]) => {
    reihenfolge.push('zeilen');
    return zeilenSchicken(...a);
  },
  uebernehmen: (...a: unknown[]) => {
    reihenfolge.push('uebernahme');
    return uebernehmen(...a);
  },
  laeufe: () => Promise.resolve([]),
}));

const authWert = {
  user: { uid: 'g1', companyId: 'perl', name: 'Chefin', role: 'Geschäftsführung' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

/*
  jsdom kennt `File.arrayBuffer` je nach Fassung nicht. Der Leser braucht
  genau das — also wird es hier ergänzt, und zwar so, dass der echte Inhalt
  herauskommt: ein Mock, der leere Daten liefert, prüfte nichts.
*/
function datei(inhalt: string, name = 'katalog.001'): File {
  const f = new File([inhalt], name, { type: 'text/plain' });
  Object.defineProperty(f, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode(inhalt).buffer),
  });
  return f;
}

const SAUBER = [
  'V;20092026;HTI Grosshandel;EUR',
  'A;N;A1;0;Eckventil 1/2 Zoll;verchromt;0;0;Stk;2350;10;0',
  'A;N;A2;0;Kugelhahn;messing;0;0;Stk;1890;10;0',
  'A;N;A3;0;Kupferrohr;15 mm;1;0;m;450;20;0',
  'A;N;A4;0;Bogen;90 Grad;0;0;Stk;320;10;0',
  'A;N;A5;0;Muffe;;0;0;Stk;210;10;0',
].join('\n');

/** Dieselbe Datei, aber mit einer Stelle zu viel — alles verschiebt sich. */
const VERSCHOBEN = [
  'A;N;100001;0;HTI-Grosshandel GmbH;1;0;0;EUR;0',
  'A;A;100001;A;1029384;Eckventil 1/2 Zoll;verchromt;;1;PST;2350;10;0',
  'A;A;100001;A;1029385;Kugelhahn;messing;;1;PST;1890;10;0',
  'A;A;100001;A;1029386;Kupferrohr;15 mm;;1;PST;450;10;0',
  'A;A;100001;A;1029387;Bogen;90 Grad;;1;PST;320;10;0',
  'A;A;100001;A;1029388;Muffe;;;1;PST;210;10;0',
].join('\n');

/** Der Wert unter einer Kennzahl — er steht als Geschwisterabsatz darunter. */
function kennzahl(label: string): string {
  const p = screen.getByText(label);
  return p.nextElementSibling?.textContent ?? '';
}

function zeige() {
  return render(
    <ToastProvider>
      <KatalogImport />
    </ToastProvider>,
  );
}

async function einlesen(inhalt: string) {
  zeige();
  const feld = await screen.findByLabelText('DATANORM-Datei');
  await userEvent.upload(feld, datei(inhalt));
  return screen.findByText('Probelauf');
}

beforeEach(() => {
  reihenfolge = [];
  saetze = [];
  laufAnlegen.mockReset().mockResolvedValue('lauf-1');
  zeilenSchicken.mockReset().mockResolvedValue(undefined);
  uebernehmen.mockReset().mockResolvedValue({
    angelegt: 5, geaendert: 0, ausgelaufen: 0, loeschungOhneArtikel: 0, preise: 5, ohneRabattsatz: 0,
  });
  rabattsatzSetzen.mockReset().mockResolvedValue(undefined);
  lieferantAnlegen.mockReset().mockResolvedValue('neu');
});

describe('Erst ansehen, dann übernehmen', () => {
  it('schreibt beim Einlesen noch nichts', async () => {
    /*
      DER SATZ, AUF DEM DIE GANZE SEITE STEHT. Würde schon das Einlesen
      schreiben, wäre der Bericht darunter ein Bericht über etwas, das
      bereits passiert ist — und die Rückfrage beim Grosshändler käme, wenn
      die falschen Preise schon im Katalog stehen.
    */
    await einlesen(SAUBER);
    expect(reihenfolge).toEqual([]);
    expect(screen.getByRole('button', { name: /5 Artikel übernehmen/ })).toBeEnabled();
  });

  it('zeigt die Zahlen des Probelaufs', async () => {
    await einlesen(SAUBER);
    // Vier Artikel tragen Preiskennzeichen 0 (Liste), einer die 1 (netto).
    expect(kennzahl('Artikel erkannt')).toBe('5');
    expect(kennzahl('Nur Listenpreis')).toBe('4');
    expect(kennzahl('Nicht verstanden')).toBe('0');
    expect(screen.getByText(/5 neu · 0 Änderungen · 0 Löschsätze/)).toBeInTheDocument();
  });

  it('nennt den erkannten Zeichensatz, damit falsche Umlaute erklärbar sind', async () => {
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Was bedeutet Probelauf/ }));
    expect(await screen.findByText(/utf-8/)).toBeInTheDocument();
  });

  it('führt „Verwerfen" zurück zur Dateiauswahl, ohne etwas geschrieben zu haben', async () => {
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByLabelText('DATANORM-Datei')).toBeInTheDocument();
    expect(reihenfolge).toEqual([]);
  });
});

describe('Wenn die Felder anders stehen als erwartet', () => {
  it('sperrt die Übernahme, statt falsche Preise einzuspielen', async () => {
    /*
      Diese Datei führt vor der Artikelnummer noch eine Katalognummer. Formal
      lässt sie sich lesen; im Katalog stünde danach die Lieferantennummer als
      Artikelnummer. Ein gesperrter Knopf ist hier die einzige richtige
      Antwort — eine Warnung, die man wegklicken kann, ist keine.
    */
    await einlesen(VERSCHOBEN);
    expect(await screen.findByText('Die Felder stehen anders als erwartet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /übernehmen/i })).toBeDisabled();
  });

  it('zeigt die betroffenen Zeilen im Original samt Zeilennummer', async () => {
    await einlesen(VERSCHOBEN);
    expect(await screen.findByText(/Zeile 2: Preisfeld/)).toBeInTheDocument();
    expect(screen.getByText(/A;A;100001;A;1029384/)).toBeInTheDocument();
  });
});

describe('Rabattsätze', () => {
  it('fragt je Rabattgruppe nach dem Satz und nennt die betroffene Anzahl', async () => {
    // Ohne den Satz wird aus einem Listenpreis nie ein Einkaufspreis. Die
    // Anzahl steht daneben, damit erkennbar ist, welche Gruppe zählt.
    await einlesen(SAUBER);
    expect(await screen.findByLabelText(/Gruppe 10 \(4 Artikel\)/)).toBeInTheDocument();
    expect(screen.getByText('1 offen')).toBeInTheDocument();
  });

  it('trägt einen schon hinterlegten Satz ein, statt ihn neu abzufragen', async () => {
    saetze = [{ id: 'r1', gruppe: '10', prozent: 37.5 }];
    await einlesen(SAUBER);
    const feld = (await screen.findByLabelText(/Gruppe 10/)) as HTMLInputElement;
    expect(feld.value).toBe('37.5');
  });

  it('speichert die Sätze VOR dem Lauf — sonst liest ihn die Übernahme nicht', async () => {
    /*
      Die Reihenfolge ist keine Geschmacksfrage: `datanorm_uebernehmen` liest
      die Sätze beim Rechnen. Wer sie danach speichert, bekommt einen Katalog
      ohne Einkaufspreise und einen Satz, der beim NÄCHSTEN Mal wirkt.
    */
    await einlesen(SAUBER);
    await userEvent.type(await screen.findByLabelText(/Gruppe 10/), '37.5');
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));

    await waitFor(() => expect(uebernehmen).toHaveBeenCalled());
    expect(reihenfolge).toEqual(['satz', 'lauf', 'zeilen', 'uebernahme']);
    expect(rabattsatzSetzen).toHaveBeenCalledWith('perl', 'hti', '10', 37.5);
  });

  it('überspringt ein GELEERTES Feld, statt 0 % daraus zu machen', async () => {
    /*
      0 % hiesse „kein Rabatt vereinbart" — eine Aussage, und eine, die den
      Listenpreis zum Einkaufspreis macht. Leer heisst „weiss ich nicht".
      Geprüft wird der Fall, der wirklich vorkommt: jemand tippt eine Zahl,
      ist sich unsicher und löscht sie wieder. Ein nie berührtes Feld steht
      gar nicht erst in den Daten und liefe an dem Wächter vorbei.
    */
    await einlesen(SAUBER);
    const feld = await screen.findByLabelText(/Gruppe 10/);
    await userEvent.type(feld, '37.5');
    await userEvent.clear(feld);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));

    await waitFor(() => expect(uebernehmen).toHaveBeenCalled());
    expect(rabattsatzSetzen).not.toHaveBeenCalled();
  });
});

describe('Nach der Übernahme', () => {
  it('zeigt, was geschehen ist — und nennt die Artikel ohne Einkaufspreis', async () => {
    uebernehmen.mockResolvedValue({
      angelegt: 3, geaendert: 2, ausgelaufen: 1, loeschungOhneArtikel: 0, preise: 5,
      ohneRabattsatz: 4,
    });
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));

    expect(await screen.findByText('Übernommen')).toBeInTheDocument();
    expect(screen.getByText('Neu angelegt')).toBeInTheDocument();
    expect(screen.getByText(/4 Artikel stehen mit Listenpreis/)).toBeInTheDocument();
  });

  it('schickt die gelesenen Artikel und nicht die Rohzeilen', async () => {
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    await waitFor(() => expect(zeilenSchicken).toHaveBeenCalled());

    const geschickt = zeilenSchicken.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(geschickt).toHaveLength(5);
    // 2350 Cent bei Preiseinheit 0 sind 23,50 € — und nicht 2350.
    expect(geschickt[0]).toMatchObject({ artikelnummer: 'A1', preis: 23.5, preisArt: 'liste' });
  });

  it('meldet einen Fehler der Übernahme, statt Erfolg zu behaupten', async () => {
    uebernehmen.mockRejectedValue(new Error('Artikelnummer A1 steht im Katalog mehrfach'));
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    expect(await screen.findByText(/mehrfach/)).toBeInTheDocument();
    expect(screen.queryByText('Übernommen')).toBeNull();
  });
});
