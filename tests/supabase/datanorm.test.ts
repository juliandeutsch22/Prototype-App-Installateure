/**
 * Der Katalogimport — gegen eine echte Datenbank.
 *
 * WARUM DIE WÄCHTER IN DER DATENBANK STEHEN. Ein Katalogimport schreibt
 * zehntausende Zeilen auf einmal. Was dabei schiefgeht, fällt nicht bei der
 * Eingabe auf, sondern Wochen später auf einer Rechnung oder in einer
 * Nachkalkulation, die nicht mehr stimmt. Die beiden teuersten Fälle:
 *
 *  - Ein Listenpreis wird als Einkaufspreis gebucht. Dann sieht jede
 *    Baustelle schlechter aus, als sie ist, und niemand weiss warum.
 *  - Der Import bricht in der Mitte ab. Dann steht die halbe Preisliste
 *    von heute neben der halben von vor zwei Jahren, und es gibt keine
 *    Stelle, an der man das ablesen könnte.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as dn from '@/lib/db/pg/datanorm';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'dn-a';
const FREMD = 'dn-b';

let chefin: Konto;
let verwaltung: Konto;
let fremdChef: Konto;
let lieferant: string;
let fremdLieferant: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'dngf');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'dnvw');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'dnfremd');
  clientEinreichen(chefin.client);
  lieferant = await dn.lieferantAnlegen(BETRIEB, 'HTI Grosshandel');
  fremdLieferant = await dn.lieferantAnlegen(FREMD, 'Fremd Grosshandel', fremdChef.client);
}, 180_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(chefin.client));

let lfd = 0;
const nummer = () => {
  lfd += 1;
  return `ART-${lfd}`;
};

const zeile = (extra: Partial<dn.DatanormZeile> = {}): dn.DatanormZeile => ({
  zeile: 1,
  artikelnummer: nummer(),
  name: 'Eckventil 1/2 Zoll',
  einheit: 'Stk',
  preis: 23.5,
  preisArt: 'netto',
  verarbeitung: 'neu',
  ...extra,
});

/** Ein ganzer Durchlauf: Lauf anlegen, Zeilen schicken, übernehmen. */
async function einspielen(
  zeilen: dn.DatanormZeile[],
  betrieb = BETRIEB,
  wer = lieferant,
): Promise<{ lauf: string; bericht: dn.UebernahmeBericht }> {
  const lauf = await dn.laufAnlegen(betrieb, wer, 'katalog.001', 'cp850', { artikel: zeilen.length });
  await dn.zeilenSchicken(betrieb, lauf, zeilen);
  return { lauf, bericht: await dn.uebernehmen(lauf) };
}

const stamm = async (artikelnummer: string) => {
  const { data } = await admin
    .from('materials')
    .select('*')
    .eq('company_id', BETRIEB)
    .eq('article_number', artikelnummer)
    .maybeSingle();
  return data as Record<string, unknown> | null;
};

describe('Wer einspielen darf', () => {
  it('lässt die Verwaltung keinen Lauf anlegen', async () => {
    /*
      WARUM NICHT DIE VERWALTUNG. Einen Einkaufspreis von Hand setzt nur die
      Geschäftsführung (`app.materialfelder_geschuetzt`). Wäre der Import
      offen, wäre er der bequeme Weg daran vorbei — vierzigtausend
      Einkaufspreise auf einmal statt einem.
    */
    await expect(
      dn.laufAnlegen(BETRIEB, lieferant, 'k.001', 'cp850', {}, verwaltung.client),
    ).rejects.toThrow();
  });

  it('lässt die Verwaltung auch nicht übernehmen', async () => {
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'k.001', 'cp850', {});
    await expect(dn.uebernehmen(lauf, verwaltung.client)).rejects.toThrow(/Geschäftsführung/);
  });

  it('lässt einen fremden Betrieb nicht an den Lauf', async () => {
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'k.001', 'cp850', {});
    await expect(dn.uebernehmen(lauf, fremdChef.client)).rejects.toThrow(/nicht gefunden/);
  });

  it('nimmt keinen Lieferanten eines fremden Betriebs', async () => {
    await expect(
      dn.laufAnlegen(BETRIEB, fremdLieferant, 'k.001', 'cp850', {}),
    ).rejects.toThrow(/gehört nicht zu diesem Betrieb/);
  });
});

describe('Vom Katalog in den Stamm', () => {
  it('legt einen Artikel mit Nettopreis als Einkaufspreis an', async () => {
    const z = zeile();
    const { bericht } = await einspielen([z]);
    expect(bericht).toMatchObject({ angelegt: 1, geaendert: 0, preise: 1, ohneRabattsatz: 0 });
    expect(await stamm(z.artikelnummer)).toMatchObject({
      name: 'Eckventil 1/2 Zoll',
      unit: 'Stk',
      einkaufspreis: 23.5,
      ausgelaufen: false,
    });
  });

  it('macht aus einem Listenpreis OHNE Rabattsatz keinen Einkaufspreis', async () => {
    /*
      DER TEUERSTE FEHLER DIESER SCHNITTSTELLE. Der Listenpreis ist der Preis
      vor dem ausgehandelten Rabatt. Würde er als Einkauf gebucht, sähe jede
      Baustelle schlechter aus, als sie ist — und zwar plausibel. Lieber
      bleibt die Lücke, die die Nachkalkulation ohnehin meldet.
    */
    const z = zeile({ preis: 100, preisArt: 'liste', rabattgruppe: '10' });
    const { bericht } = await einspielen([z]);
    expect(bericht.ohneRabattsatz).toBe(1);
    expect(await stamm(z.artikelnummer)).toMatchObject({ einkaufspreis: null });

    // Der Listenpreis geht trotzdem nicht verloren — er steht beim Lieferanten.
    const { data } = await admin
      .from('material_prices')
      .select('listenpreis, einkaufspreis, rabattgruppe')
      .eq('company_id', BETRIEB)
      .eq('supplier_id', lieferant);
    expect(data).toContainEqual({
      listenpreis: 100,
      einkaufspreis: null,
      rabattgruppe: '10',
    });
  });

  it('rechnet einen Listenpreis mit hinterlegtem Rabattsatz in den Einkauf', async () => {
    await dn.rabattsatzSetzen(BETRIEB, lieferant, '20', 37.5);
    const z = zeile({ preis: 100, preisArt: 'liste', rabattgruppe: '20' });
    const { bericht } = await einspielen([z]);
    expect(bericht.ohneRabattsatz).toBe(0);
    expect(await stamm(z.artikelnummer)).toMatchObject({ einkaufspreis: 62.5 });
  });

  it('fasst den Verkaufspreis nie an', async () => {
    // Das ist die Kalkulation des Betriebs. Der Grosshändler hat darin
    // nichts verloren, auch nicht mit einem neuen Katalog.
    const z = zeile();
    await einspielen([z]);
    const vorher = await stamm(z.artikelnummer);
    await admin.from('materials').update({ verkaufspreis: 49.9 }).eq('id', vorher!.id as string);

    await einspielen([{ ...z, zeile: 2, preis: 19.9, verarbeitung: 'aenderung' }]);
    expect(await stamm(z.artikelnummer)).toMatchObject({
      verkaufspreis: 49.9,
      einkaufspreis: 19.9,
    });
  });

  it('leert einen bekannten Einkaufspreis nicht, wenn die Datei keinen bringt', async () => {
    // Der zuletzt bekannte Preis ist immer noch die beste Auskunft, die der
    // Betrieb hat. Ihn gegen „nichts" zu tauschen macht die Nachkalkulation
    // schlechter, nicht ehrlicher.
    const z = zeile({ preis: 23.5 });
    await einspielen([z]);
    await einspielen([{ ...z, preis: undefined, preisArt: 'unbekannt', verarbeitung: 'aenderung' }]);
    expect(await stamm(z.artikelnummer)).toMatchObject({ einkaufspreis: 23.5 });
  });
});

describe('Löschsätze', () => {
  it('markiert einen Artikel als ausgelaufen, statt ihn zu löschen', async () => {
    /*
      Ein Löschsatz sagt, dass der Grosshändler den Artikel nicht mehr führt —
      nicht, dass er nie auf einem Handwerksschein oder einer Rechnung stand.
      Verschwände er, fehlte er rückwirkend in jeder Auswertung.
    */
    const z = zeile();
    await einspielen([z]);
    const { bericht } = await einspielen([{ ...z, verarbeitung: 'loeschung' }]);
    expect(bericht).toMatchObject({ ausgelaufen: 1, angelegt: 0, geaendert: 0 });
    expect(await stamm(z.artikelnummer)).toMatchObject({ ausgelaufen: true });
  });

  it('zählt einen Löschsatz für einen unbekannten Artikel, statt ihn anzulegen', async () => {
    const { bericht } = await einspielen([{ ...zeile(), verarbeitung: 'loeschung' }]);
    expect(bericht).toMatchObject({ loeschungOhneArtikel: 1, angelegt: 0 });
  });

  it('holt einen ausgelaufenen Artikel zurück, wenn er wieder im Katalog steht', async () => {
    const z = zeile();
    await einspielen([z]);
    await einspielen([{ ...z, verarbeitung: 'loeschung' }]);
    await einspielen([{ ...z, verarbeitung: 'neu' }]);
    expect(await stamm(z.artikelnummer)).toMatchObject({ ausgelaufen: false });
  });
});

describe('Alles oder nichts', () => {
  it('schreibt keinen einzigen Artikel, wenn ein späterer die Übernahme sprengt', async () => {
    /*
      DER GRUND FÜR DIE GANZE BAUART. Bricht die Übernahme bei Artikel 39.000
      ab und die ersten 38.999 stehen im Stamm, gibt es keine Stelle mehr, an
      der jemand ablesen könnte, welche Hälfte zu welchem Katalog gehört.
      Hier wird das Zerwürfnis erzwungen: zwei Artikel im Stamm tragen
      dieselbe Nummer, also ist nicht entscheidbar, welcher gemeint ist.
    */
    const doppelt = nummer();
    await admin.from('materials').insert([
      { company_id: BETRIEB, name: 'Zwilling A', article_number: doppelt, stock: 0 },
      { company_id: BETRIEB, name: 'Zwilling B', article_number: doppelt, stock: 0 },
    ]);
    const harmlos = zeile({ zeile: 1, name: 'Kommt vor dem Krach' });

    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'k.002', 'cp850', {});
    await dn.zeilenSchicken(BETRIEB, lauf, [harmlos, zeile({ zeile: 2, artikelnummer: doppelt })]);
    await expect(dn.uebernehmen(lauf)).rejects.toThrow(/mehrfach/);

    expect(await stamm(harmlos.artikelnummer)).toBeNull();
    const { data } = await admin
      .from('datanorm_laeufe')
      .select('status')
      .eq('id', lauf)
      .single();
    expect(data).toMatchObject({ status: 'offen' });
  });

  it('lässt denselben Lauf kein zweites Mal übernehmen', async () => {
    /*
      Beim Doppelklick wäre das harmlos. Nach einem späteren Katalog nicht
      mehr: dann schriebe der alte Lauf seine alten Preise wieder über die
      neuen.
    */
    const { lauf } = await einspielen([zeile()]);
    await expect(dn.uebernehmen(lauf)).rejects.toThrow(/bereits abgeschlossen/);
  });
});

describe('Was nach der Übernahme bleibt', () => {
  it('räumt das Zwischenlager und hinterlässt den Bericht am Lauf', async () => {
    // Die Zeilen stehen zu Zehntausenden da und führen von da an jede
    // nächtliche Sicherung und jeden DSGVO-Auszug mit sich. Was bleiben
    // muss, ist die Frage „wer hat wann welchen Katalog eingespielt".
    const { lauf } = await einspielen([zeile(), zeile({ zeile: 2 })]);

    const { data: rest } = await admin.from('datanorm_zeilen').select('id').eq('lauf_id', lauf);
    expect(rest).toEqual([]);

    const { data } = await admin
      .from('datanorm_laeufe')
      .select('status, dateiname, zeichensatz, bericht, abgeschlossen_am')
      .eq('id', lauf)
      .single();
    expect(data).toMatchObject({ status: 'uebernommen', dateiname: 'katalog.001', zeichensatz: 'cp850' });
    expect((data as { bericht: Record<string, unknown> }).bericht).toMatchObject({
      artikel: 2,
      uebernahme: { angelegt: 2 },
    });
    expect((data as { abgeschlossen_am: string | null }).abgeschlossen_am).not.toBeNull();
  });

  it('verwirft einen Lauf samt seinen Zeilen', async () => {
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'k.003', 'cp850', {});
    await dn.zeilenSchicken(BETRIEB, lauf, [zeile()]);
    await dn.laufVerwerfen(lauf);

    const { data: rest } = await admin.from('datanorm_zeilen').select('id').eq('lauf_id', lauf);
    expect(rest).toEqual([]);
    await expect(dn.uebernehmen(lauf)).rejects.toThrow(/bereits abgeschlossen/);
  });
});
