/**
 * Testbericht 30.09.2026, Paket 7c — in der Datenbank.
 *
 *   M30  Katalog getrennt vom Lager: ein eingespielter Artikel ist kein
 *        Lagerartikel; wer Bestand bekommt, wird geführt; Bestand gibt es nur
 *        im Lager; Mindestmenge pflegt, wer den Katalog pflegt.
 *   M31  Aufschlag mit fester Form; Verkaufspreise werden nur dort gesetzt,
 *        wo keiner steht, und nur von dem, der Einkaufspreise sieht.
 *   M39  Der nächste Wartungstermin folgt aus „zuletzt gewartet“ plus
 *        Intervall — ein ausdrücklich gesetzter geht vor.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'katalog-7c';
let lager: Konto;
let monteur: Konto;
let chefin: Konto;
let kunde = '';

async function artikel(werte: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Artikel', ...werte }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function zeile(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from('materials').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lager = await konto(BETRIEB, 'Verwaltung', 'lager7c');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'mont7c');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'gf7c');
  const { data } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Hausverwaltung Huber' }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);

describe('M30 — Katalog getrennt vom Lager', () => {
  it('ein Artikel ohne Bestand ist nur Katalog — so legt ihn der Import an', async () => {
    const id = await artikel({ name: 'Pressfitting 15' });
    expect((await zeile(id)).lagerartikel).toBe(false);
  });

  it('wer Bestand bekommt, wird geführt — auch beim Anlegen', async () => {
    const { data, error } = await lager.client.from('materials')
      .insert({ company_id: BETRIEB, name: 'Kupferrohr', stock: 5, lagerartikel: false }).select('lagerartikel').single();
    expect(error).toBeNull();
    expect((data as { lagerartikel: boolean }).lagerartikel).toBe(true);
  });

  it('ein Wareneingang auf einen Katalogartikel führt ihn im Lager', async () => {
    const id = await artikel({ name: 'Kugelhahn' });
    const { error } = await lager.client.rpc('lager_eingang', {
      p_material: id, p_menge: 3, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null,
    });
    expect(error).toBeNull();
    expect(await zeile(id)).toMatchObject({ lagerartikel: true });
  });

  it('mit Bestand lässt sich „im Lager führen“ nicht abschalten', async () => {
    const id = await artikel({ name: 'Eckventil', stock: 2, lagerartikel: true });
    const { error } = await lager.client.from('materials').update({ lagerartikel: false }).eq('id', id);
    expect(error?.message).toMatch(/materials_bestand_nur_im_lager/);
  });

  it('Gegenprobe: bei Bestand null schon', async () => {
    const id = await artikel({ name: 'Muffe', lagerartikel: true });
    const { error } = await lager.client.from('materials').update({ lagerartikel: false }).eq('id', id);
    expect(error).toBeNull();
  });

  it('eine negative Mindestmenge: abgewiesen', async () => {
    const id = await artikel({ name: 'Dichtband', lagerartikel: true });
    const { error } = await lager.client.from('materials').update({ mindestmenge: -1 }).eq('id', id);
    expect(error?.message).toMatch(/materials_mindestmenge/);
  });

  it('Mindestmenge und Lagerführung pflegt nicht der Monteur', async () => {
    const id = await artikel({ name: 'Hanf', lagerartikel: true });
    const { error } = await monteur.client.from('materials').update({ mindestmenge: 10 }).eq('id', id);
    expect(error?.message).toMatch(/Katalog pflegt die Verwaltung/);
    const ok = await lager.client.from('materials').update({ mindestmenge: 10 }).eq('id', id);
    expect(ok.error).toBeNull();
  });
});

describe('M31 — Materialaufschlag', () => {
  it('ein Aufschlag in falscher Form: abgewiesen', async () => {
    const { error } = await admin.from('companies')
      .update({ rates: { fach: 70, helper: 48, materialaufschlag: { standard: -5 } } }).eq('id', BETRIEB);
    expect(error?.message).toMatch(/companies_materialaufschlag/);
  });

  it('setzt Verkaufspreise nur, wo keiner steht — Warengruppe vor Standard', async () => {
    expect((await admin.from('companies')
      .update({ rates: { fach: 70, helper: 48, materialaufschlag: { standard: 25, warengruppen: { '1201': 40 } } } })
      .eq('id', BETRIEB)).error).toBeNull();
    const mitGruppe = await artikel({ name: 'Fitting', einkaufspreis: 10, warengruppe: '1201' });
    const ohneGruppe = await artikel({ name: 'Bogen', einkaufspreis: 10 });
    const gepflegt = await artikel({ name: 'Ventil', einkaufspreis: 10, verkaufspreis: 19.9 });

    const { data, error } = await chefin.client.rpc('verkaufspreise_vorschlagen');
    expect(error).toBeNull();
    expect((data as { gesetzt: number }).gesetzt).toBeGreaterThanOrEqual(2);
    expect(Number((await zeile(mitGruppe)).verkaufspreis)).toBe(14);
    expect(Number((await zeile(ohneGruppe)).verkaufspreis)).toBe(12.5);
    // Ein gesetzter Preis ist die Kalkulation des Betriebs.
    expect(Number((await zeile(gepflegt)).verkaufspreis)).toBe(19.9);
  });

  it('nur, wer die Einkaufspreise sieht', async () => {
    const { error } = await lager.client.rpc('verkaufspreise_vorschlagen');
    expect(error?.message).toMatch(/Einkaufspreise sieht/);
  });
});

describe('M39 — Termin und Anlagendaten der Wartung', () => {
  const wartung = (rest: Record<string, unknown>) => ({
    company_id: BETRIEB, customer_id: kunde, customer_name: 'Hausverwaltung Huber',
    anlage: 'Therme', intervall_monate: 6, ...rest,
  });

  it('ohne Termin: aus „zuletzt gewartet“ plus Intervall, Monatsende bleibt Monatsende', async () => {
    const { data, error } = await chefin.client.from('wartungen')
      .insert(wartung({ zuletzt_am: '2026-01-31' })).select('id, faellig_am').single();
    expect(error).toBeNull();
    expect((data as { faellig_am: string }).faellig_am).toBe('2026-07-31');

    const id = (data as { id: string }).id;
    const neu = await chefin.client.from('wartungen')
      .update({ intervall_monate: 12 }).eq('id', id).select('faellig_am').single();
    expect((neu.data as { faellig_am: string }).faellig_am).toBe('2027-01-31');
  });

  it('ein ausdrücklich gesetzter Termin geht vor', async () => {
    const { data } = await chefin.client.from('wartungen')
      .insert(wartung({ zuletzt_am: '2026-03-15', faellig_am: '2026-10-01' })).select('id, faellig_am').single();
    expect((data as { faellig_am: string }).faellig_am).toBe('2026-10-01');
    const id = (data as { id: string }).id;
    const beides = await chefin.client.from('wartungen')
      .update({ zuletzt_am: '2026-04-01', faellig_am: '2026-12-24' }).eq('id', id).select('faellig_am').single();
    expect((beides.data as { faellig_am: string }).faellig_am).toBe('2026-12-24');
  });

  it('Anlagendaten und Preis werden gespeichert; ein unmögliches Baujahr nicht', async () => {
    const gut = await chefin.client.from('wartungen').insert(wartung({
      faellig_am: '2026-11-01', hersteller: 'Vaillant', typ: 'ecoTEC plus', seriennummer: '21184500', baujahr: 2018, preis: 149,
    })).select('hersteller, baujahr, preis').single();
    expect(gut.error).toBeNull();
    expect(gut.data).toMatchObject({ hersteller: 'Vaillant', baujahr: 2018 });
    const schlecht = await chefin.client.from('wartungen').insert(wartung({ faellig_am: '2026-11-01', baujahr: 1800 }));
    expect(schlecht.error?.message).toMatch(/wartungen_baujahr/);
  });
});
