import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const spruenge = vi.fn();
const laufVerwerfen = vi.fn();
let laeufe: unknown[] = [];

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
  laeufe: () => Promise.resolve(laeufe),
  laufVerwerfen: (...a: unknown[]) => laufVerwerfen(...a),
  // M03a: die Preissprünge des Laufs, seitenweise.
  preisspruenge: (...a: unknown[]) => spruenge(...a),
}));

const authWert: {
  user: { uid: string; companyId: string; name: string; role: 'Geschäftsführung' };
  company: { id: string; name: string; modules?: Record<string, boolean> };
} = {
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
  'V;20092026;HTI Großhandel;EUR',
  'A;N;A1;0;Eckventil 1/2 Zoll;verchromt;1;0;Stk;2350;10;0',
  'A;N;A2;0;Kugelhahn;messing;1;0;Stk;1890;10;0',
  'A;N;A3;0;Kupferrohr;15 mm;2;0;m;450;20;0',
  'A;N;A4;0;Bogen;90 Grad;1;0;Stk;320;10;0',
  'A;N;A5;0;Muffe;;1;0;Stk;210;10;0',
].join('\n');

/** Dieselbe Datei, aber mit einer Stelle zu viel — alles verschiebt sich. */
const VERSCHOBEN = [
  'A;N;100001;0;HTI-Großhandel GmbH;1;0;0;EUR;0',
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

function zeige(onZuordnen?: () => void) {
  return render(
    <ToastProvider>
      <KatalogImport onZuordnen={onZuordnen} />
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
  // Ohne Vorgabe gäbe der Bericht `undefined` zurück und die Ansicht stürzte nach dem Test unbehandelt ab.
  spruenge.mockReset().mockResolvedValue({ gesamt: 0, schwelle: 10, zeilen: [] });
  laufVerwerfen.mockReset().mockResolvedValue(undefined);
  laeufe = [];
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
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
    expect(kennzahl('Nicht übernommen')).toBe('0');
    expect(screen.getByText(/5 neu · 0 Änderungen · 0 Löschsätze/)).toBeInTheDocument();
  });

  it('nennt den erkannten Zeichensatz, damit falsche Umlaute erklärbar sind', async () => {
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Was bedeutet Probelauf/ }));
    expect(await screen.findByText(/utf-8/)).toBeInTheDocument();
  });

  it('führt „Verwerfen“ zurück zur Dateiauswahl, ohne etwas geschrieben zu haben', async () => {
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

describe('Übernahme in Blöcken (10.10.2026)', () => {
  it('zeigt den Fortschritt der Übernahme, Block für Block', async () => {
    let weiter: () => void = () => undefined;
    uebernehmen.mockImplementation(async (_lauf: string, _c: unknown, fortschritt?: (offen: number) => void) => {
      fortschritt?.(3);
      await new Promise<void>((r) => { weiter = r; });
      return { angelegt: 5, geaendert: 0, ausgelaufen: 0, loeschungOhneArtikel: 0, preise: 5, ohneRabattsatz: 0 };
    });
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    // Seit der Planlinie (E30) steht der Fortschritt als Maßlinie unter dem Knopf, nicht mehr im Knopf.
    expect(await screen.findByRole('img', { name: '2 von 5 Artikeln übernommen' })).toBeInTheDocument();
    expect(screen.getByText('2 von 5 übernommen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wird übernommen/ })).toBeInTheDocument();
    weiter();
    expect(await screen.findByText('Übernommen')).toBeInTheDocument();
  });

  it('nach einem Abbruch setzt „Weiter übernehmen“ beim Rest fort — ohne den Katalog neu zu senden', async () => {
    uebernehmen.mockRejectedValueOnce(new Error('Failed to fetch'));
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    expect(await screen.findByText(/Was bis hierher übernommen ist, bleibt im Katalog/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Weiter übernehmen' }));
    expect(await screen.findByText('Übernommen')).toBeInTheDocument();
    expect(laufAnlegen).toHaveBeenCalledTimes(1);
    expect(zeilenSchicken).toHaveBeenCalledTimes(1);
    expect(uebernehmen).toHaveBeenCalledTimes(2);
    expect(uebernehmen.mock.calls[1][0]).toBe('lauf-1');
  });

  /*
    VERWERFEN VERWIRFT (11.11.2026): vorher setzte der Knopf nach einem
    Abbruch nur die Maske zurück, und der Lauf blieb mit seinen übrigen
    Zeilen stehen. Gegenprobe: mit dem Stand davor wird `laufVerwerfen` nie
    gerufen.
  */
  it('nach einem Abbruch verwirft „Verwerfen“ den Lauf im Zwischenlager', async () => {
    uebernehmen.mockRejectedValueOnce(new Error('Failed to fetch'));
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    await screen.findByText(/Was bis hierher übernommen ist, bleibt im Katalog/);
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByLabelText('DATANORM-Datei')).toBeInTheDocument();
    expect(laufVerwerfen).toHaveBeenCalledWith('lauf-1');
  });

  it('lässt sich der Lauf nicht verwerfen, bleibt die Maske und nennt den Grund', async () => {
    uebernehmen.mockRejectedValueOnce(new Error('Failed to fetch'));
    laufVerwerfen.mockRejectedValueOnce(new Error('Der Lauf ist nicht mehr offen'));
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    await screen.findByText(/Was bis hierher übernommen ist, bleibt im Katalog/);
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByText(/Der Lauf ließ sich nicht verwerfen: Der Lauf ist nicht mehr offen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weiter übernehmen' })).toBeInTheDocument();
  });

  it('ein liegengebliebener Lauf lässt sich im Protokoll verwerfen — nach Rückfrage', async () => {
    laeufe = [
      { id: 'alt', companyId: 'perl', dateiname: 'alt.001', status: 'offen', createdAt: Date.parse('2026-11-10T09:00:00Z'), bericht: null },
      { id: 'fertig', companyId: 'perl', dateiname: 'fertig.001', status: 'uebernommen', createdAt: Date.parse('2026-11-09T09:00:00Z'), bericht: null },
    ];
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Lauf „alt.001“ verwerfen' });
    // Ein übernommener Lauf hat keinen: seine offenen Zuordnungen hängen an ihm.
    expect(screen.queryByRole('button', { name: 'Lauf „fertig.001“ verwerfen' })).toBeNull();
    await userEvent.click(knopf);
    const frage = await screen.findByRole('dialog', { name: 'Lauf verwerfen?' });
    expect(frage).toHaveTextContent('Was er schon übernommen hat, bleibt im Katalog');
    await userEvent.click(within(frage).getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(laufVerwerfen).toHaveBeenCalledWith('alt'));
  });

  it('scheitert das Verwerfen nach der Übernahme, steht der Grund trotzdem da', async () => {
    laeufe = [{ id: 'alt', companyId: 'perl', dateiname: 'alt.001', status: 'offen', createdAt: Date.parse('2026-11-10T09:00:00Z'), bericht: null }];
    laufVerwerfen.mockRejectedValueOnce(new Error('Der Lauf ist nicht mehr offen'));
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    expect(await screen.findByText('Übernommen')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Lauf „alt.001“ verwerfen' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Lauf verwerfen?' })).getByRole('button', { name: 'Verwerfen' }));
    expect(await screen.findByText(/Der Lauf ließ sich nicht verwerfen: Der Lauf ist nicht mehr offen/)).toBeInTheDocument();
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

  it('Runde 6, G25: zeigt eine doppelte Artikelnummer im Probelauf und schickt sie nicht', async () => {
    await einlesen([SAUBER, 'A;N;A2;0;Kugelhahn doppelt;;1;0;Stk;100;10;0'].join('\n'));
    expect(kennzahl('Artikel erkannt')).toBe('4');
    expect(kennzahl('Nicht übernommen')).toBe('2');
    expect(screen.getByText(/Nicht übernommene Zeilen \(2\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/„A2“ steht in der Datei mehrfach \(Zeilen 3, 7\)/)).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /4 Artikel übernehmen/ }));
    await waitFor(() => expect(zeilenSchicken).toHaveBeenCalled());
    const geschickt = zeilenSchicken.mock.calls[0][2] as Array<{ artikelnummer: string }>;
    expect(geschickt.map((a) => a.artikelnummer)).toEqual(['A1', 'A3', 'A4', 'A5']);
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

/*
  M03a: DER BERICHT NENNT, WAS OFFEN ZUZUORDNEN BLIEB, UND DIE PREISSPRÜNGE
  (seitenweise). Beides verschwindet mit seinem Modulschalter. GEGENPROBE:
  vor M03a stand im Bericht weder das eine noch das andere.
*/
describe('Bericht: offen zuzuordnen und Preissprünge (M03a)', () => {
  const sprung = (n: number, prozent: number) => ({
    lieferantenartikelId: `la${n}`, materialId: `m${n}`, lieferantenNr: `A${n}`, bezeichnung: `Artikel ${n}`,
    artikel: `Artikel ${n}`, art: 'einkauf' as const, alt: 10, neu: 10 * (1 + prozent / 100), prozent, seit: '2026-10-01',
  });

  beforeEach(() => {
    uebernehmen.mockResolvedValue({
      angelegt: 3, geaendert: 0, ausgelaufen: 0, loeschungOhneArtikel: 0, preise: 5, ohneRabattsatz: 0,
      offenZuzuordnen: 2, preisspruenge: 21, schwelle: 10,
    });
  });

  it('nennt die offenen und führt mit einem Klick zu ihnen', async () => {
    spruenge.mockResolvedValue({ gesamt: 0, schwelle: 10, zeilen: [] });
    const hin = vi.fn();
    zeige(hin);
    await userEvent.upload(await screen.findByLabelText('DATANORM-Datei'), datei(SAUBER));
    await userEvent.click(await screen.findByRole('button', { name: /Artikel übernehmen/ }));
    await screen.findByText('Übernommen');
    expect(kennzahl('Offen zuzuordnen')).toBe('2');
    expect(screen.getByText(/2 Artikel dieses Katalogs tragen eine Nummer/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Offene zuordnen' }));
    expect(hin).toHaveBeenCalled();
  });

  it('listet die Preissprünge seitenweise, größter zuerst, mit alt, neu und Prozent', async () => {
    spruenge
      .mockResolvedValueOnce({ gesamt: 21, schwelle: 10, zeilen: Array.from({ length: 20 }, (_, i) => sprung(i, 30 - i)) })
      .mockResolvedValueOnce({ gesamt: 21, schwelle: 10, zeilen: [sprung(20, -11)] });
    await einlesen(SAUBER);
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    expect(await screen.findByText('Preissprünge (21)')).toBeInTheDocument();
    expect(spruenge).toHaveBeenCalledWith('lauf-1', 0, 20);
    expect(screen.getByText('€ 10,00 → € 13,00 (+30 %)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'und 1 weitere anzeigen' }));
    expect(await screen.findByText('€ 10,00 → € 8,90 (−11 %)')).toBeInTheDocument();
    expect(spruenge).toHaveBeenLastCalledWith('lauf-1', 20, 20);
  });

  it('ohne die Module: weder offen zuzuordnen noch Preissprünge, und nichts gefragt', async () => {
    authWert.company = {
      id: 'perl', name: 'Perl Installationen',
      modules: { 'material.katalogversionen': false, 'material.katalogpreisverlauf': false },
    };
    zeige(vi.fn());
    await userEvent.upload(await screen.findByLabelText('DATANORM-Datei'), datei(SAUBER));
    await userEvent.click(await screen.findByRole('button', { name: /Artikel übernehmen/ }));
    await screen.findByText('Übernommen');
    expect(screen.queryByText('Offen zuzuordnen')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Offene zuordnen' })).toBeNull();
    expect(screen.queryByText(/Preissprünge/)).toBeNull();
    expect(spruenge).not.toHaveBeenCalled();
  });

  it('schickt EAN und Preiseinheit mit, und der Probelauf nennt, wie viele eine EAN tragen', async () => {
    await einlesen([SAUBER, 'B;N;A1;M;;1;0;0;4006381333931;;;;', 'B;N;A2;M;;1;0;0;4006381333932;;;;'].join('\n'));
    expect(screen.getByText(/1 mit EAN/)).toBeInTheDocument();
    expect(screen.getByText(/1 ungültige EAN nicht übernommen/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Artikel übernehmen/ }));
    await waitFor(() => expect(zeilenSchicken).toHaveBeenCalled());
    const geschickt = zeilenSchicken.mock.calls[0][2] as Array<Record<string, unknown>>;
    expect(geschickt[0]).toMatchObject({ artikelnummer: 'A1', ean: '4006381333931', preiseinheit: 1 });
    expect(geschickt[1].ean).toBeUndefined();
  });
});

/*
  E72 (09.11.2026): die Datei wird über einen Knopf der Linie gewählt, wie in
  der Dokumentablage — nicht mehr über das Feld des Browsers mit „Choose
  File“. Das Feld bleibt, unsichtbar und ohne eigenen Tab-Halt, und heißt
  weiter „DATANORM-Datei“. Gegenprobe: mit dem Stand davor rot.
*/
describe('Die Dateiauswahl in der Gestalt der Linie (E72)', () => {
  it('ein Zweitknopf öffnet das unsichtbare Dateifeld', async () => {
    zeige();
    const feld = (await screen.findByLabelText('DATANORM-Datei')) as HTMLInputElement;
    expect(feld).toHaveClass('sr-only');
    expect(feld).toHaveAttribute('tabindex', '-1');
    const knopf = screen.getByRole('button', { name: 'Datei auswählen' });
    expect(knopf).toHaveClass('border-line-strong');
    const geklickt = vi.spyOn(feld, 'click');
    await userEvent.click(knopf);
    expect(geklickt).toHaveBeenCalledTimes(1);
  });

  it('gleich geblieben: die gewählte Datei geht in den Probelauf', async () => {
    expect(await einlesen(SAUBER)).toBeInTheDocument();
  });
});
