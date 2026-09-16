import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Die Zahlen hinter den Abzeichen — und was beim Nachladen schiefgehen kann.
 *
 * ZWEI DINGE STEHEN HIER AUF DEM PRÜFSTAND, und beide sind unsichtbar,
 * solange man nur hinsieht:
 *
 *   1. „NICHT BEKANNT" IST NICHT „NICHTS OFFEN". Ein gescheiterter Abruf darf
 *      keine Null werden — das wäre eine Auskunft, die niemand geprüft hat.
 *   2. DIE ÜBERHOLENDE ANTWORT. Wer einen Antrag entscheidet, stösst sofort
 *      neu an, während der Lauf vom Seitenwechsel noch unterwegs ist. Träfe
 *      der ältere zuletzt ein, stünde die alte Zahl wieder da — dauerhaft,
 *      bis zum nächsten Anstoss.
 */

const laden = vi.fn();
vi.mock('@/lib/db/offenePosten', () => ({ ladeOffenePosten: (h: string) => laden(h) }));

const { postenNeuLaden, offenePosten, abonnierePosten, postenZuruecksetzen } =
  await import('@/app/offenePosten');

beforeEach(() => {
  postenZuruecksetzen();
  laden.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T08:00:00'));
});
afterEach(() => { vi.useRealTimers(); });

const posten = (urlaub = 0, anforderungen = 0, mahnungen = 0) =>
  ({ urlaub, anforderungen, mahnungen });

describe('Die offenen Posten holen', () => {
  it('sind vor dem ersten Abruf nicht bekannt', () => {
    expect(offenePosten()).toBeUndefined();
  });

  it('fragt mit dem Tag des Browsers, nicht dem der Datenbank', async () => {
    /*
      Die Datenbank rechnet in UTC, gearbeitet wird in Österreich. Um 23 Uhr
      wäre `current_date` schon der nächste Tag — und eine Rechnung im Menü
      fällig, die in der Liste noch nicht drinsteht.
    */
    laden.mockResolvedValue(posten());
    await postenNeuLaden();
    expect(laden).toHaveBeenCalledWith('2026-09-16');
  });

  it('sagt den Horchern Bescheid', async () => {
    const gesehen: unknown[] = [];
    abonnierePosten((p) => gesehen.push(p));
    laden.mockResolvedValue(posten(3));

    await postenNeuLaden();

    expect(gesehen).toEqual([posten(3)]);
    expect(offenePosten()).toEqual(posten(3));
  });

  it('macht aus einem gescheiterten Abruf keine Null', async () => {
    laden.mockResolvedValue(undefined);
    await postenNeuLaden();
    expect(offenePosten()).toBeUndefined();
  });

  it('nimmt einen früheren Stand zurück, wenn der Abruf scheitert', async () => {
    /*
      Sonst stünde eine Zahl von vorhin im Menü und behauptete, sie sei von
      jetzt — schlimmer als gar keine, weil man sie für frisch hält.
    */
    laden.mockResolvedValueOnce(posten(2));
    await postenNeuLaden();
    laden.mockResolvedValueOnce(undefined);
    await postenNeuLaden();

    expect(offenePosten()).toBeUndefined();
  });

  it('ein abgemeldeter Horcher hört nichts mehr', async () => {
    const gesehen: unknown[] = [];
    const ab = abonnierePosten((p) => gesehen.push(p));
    ab();
    laden.mockResolvedValue(posten(1));

    await postenNeuLaden();

    expect(gesehen).toEqual([]);
  });
});

describe('Die überholende Antwort', () => {
  it('der jüngere Lauf gewinnt, auch wenn der ältere später eintrifft', async () => {
    let alterFertig: (w: unknown) => void = () => {};
    laden
      .mockImplementationOnce(() => new Promise((r) => { alterFertig = r; }))
      .mockResolvedValueOnce(posten(0));

    const alt = postenNeuLaden();   // der Seitenwechsel — bleibt hängen
    const neu = postenNeuLaden();   // die Entscheidung — kommt zuerst zurück
    await neu;
    expect(offenePosten()).toEqual(posten(0));

    alterFertig(posten(5));
    await alt;

    /*
      OHNE DIE LAUFNUMMER STÜNDE HIER WIEDER `5`: die Zahl, die der Anwender
      gerade weggearbeitet hat, käme zurück und bliebe stehen.
    */
    expect(offenePosten()).toEqual(posten(0));
  });
});
