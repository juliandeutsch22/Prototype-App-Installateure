/**
 * ANGEBOTE: FASSUNGEN, ARBEITSZEIT, ANSPRECHPARTNER (Testbericht Runde 6, G15, G24, Hinweis 11).
 *
 * G15: Nach dem Annehmen von AN-0009 (neue Fassung von AN-0008) stand
 * AN-0008 weiter „Versendet“ mit „Annehmen → Baustelle“ — ein Klick hätte
 * eine zweite Baustelle zum selben Auftrag angelegt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'r6p4-angebot';
let chefin: Konto;
let kunde = '';
let lauf = 0;

const ZEILE = [{ label: 'Montage', qty: 16, unit: 'h', unit_price: 70, netto: 1120, ist_arbeitszeit: true }];

async function angebot(extra: Record<string, unknown> = {}): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-R6-${Date.now()}-${lauf}`, customer_id: kunde, customer_name: 'Familie Deutsch',
      quote_date: '2026-10-19', valid_until: '2026-11-19', vat_rate: 20, status: 'Versendet',
      kalkulierte_stunden: 16, ...extra,
    },
    p_positionen: ZEILE,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

const status = async (id: string) =>
  ((await admin.from('quotes').select('status').eq('id', id).single()).data as { status: string }).status;
const annehmen = (id: string) =>
  chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'PR', p_abrechnung: 'Pauschal' });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r6p4gfa');
  const { data } = await admin.from('customers').insert({
    company_id: BETRIEB, name: 'Familie Deutsch', contact_name: 'Julian Deutsch', contact_phone: '0664 1112223',
  }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);

describe('Überholte Fassungen (G15)', () => {
  it('beim Annehmen der neuen Fassung gilt die alte als ersetzt — und lässt sich nicht mehr annehmen', async () => {
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    const { data: nummer, error } = await annehmen(neu);
    expect(error).toBeNull();
    expect(await status(neu)).toBe('Angenommen');
    expect(await status(alt)).toBe('Ersetzt');

    const zweit = await annehmen(alt);
    expect(zweit.error?.message).toMatch(/durch eine andere Fassung ersetzt/);
    const baustellen = await admin.from('projects').select('project_number').eq('company_id', BETRIEB)
      .like('description', '%Aus Angebot%');
    expect((baustellen.data ?? []).filter((b) => b.project_number === nummer)).toHaveLength(1);
  });

  it('auch rückwärts: wird die alte angenommen, ist die neue ersetzt — über drei Fassungen', async () => {
    const eins = await angebot();
    const zwei = await angebot({ vorgaenger_id: eins });
    const drei = await angebot({ vorgaenger_id: zwei, status: 'Entwurf' });
    expect((await annehmen(eins)).error).toBeNull();
    expect([await status(eins), await status(zwei), await status(drei)]).toEqual(['Angenommen', 'Ersetzt', 'Ersetzt']);
  });

  it('eine abgelehnte Fassung bleibt abgelehnt', async () => {
    const alt = await angebot({ status: 'Abgelehnt' });
    const neu = await angebot({ vorgaenger_id: alt });
    expect((await annehmen(neu)).error).toBeNull();
    expect(await status(alt)).toBe('Abgelehnt');
  });

  it('Altbestand: eine schon offene Fassung neben einer angenommenen wird nicht angenommen', async () => {
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    // So stand es vor dieser Fassung: angenommen, die andere blieb „Versendet“.
    expect((await admin.from('quotes').update({ status: 'Angenommen' }).eq('id', neu)).error).toBeNull();
    const { error } = await annehmen(alt);
    expect(error?.message).toMatch(/schon die Fassung .* angenommen/);
    expect(await status(alt)).toBe('Versendet');
  });

  it('eine ersetzte Fassung wird nicht wieder offen', async () => {
    const alt = await angebot();
    const neu = await angebot({ vorgaenger_id: alt });
    await annehmen(neu);
    const { error } = await chefin.client.from('quotes').update({ status: 'Versendet' }).eq('id', alt);
    expect(error?.message).toMatch(/ersetzt und wird nicht wieder offen/);
  });

  it('Gegenprobe: ein Angebot ohne Fassungen nimmt man an wie bisher, wiederholt ohne zweite Baustelle', async () => {
    const id = await angebot();
    const erst = await annehmen(id);
    expect(erst.error).toBeNull();
    const noch = await annehmen(id);
    expect(noch.data).toBe(erst.data);
  });
});

describe('Ansprechpartner aus der Kundenakte (Hinweis 11)', () => {
  it('die Baustelle aus dem Angebot bekommt Ansprechpartner und Telefon des Kunden', async () => {
    const { data: nummer } = await annehmen(await angebot());
    const { data } = await admin.from('projects').select('contact_name, contact_phone')
      .eq('company_id', BETRIEB).eq('project_number', String(nummer)).single();
    expect(data).toEqual({ contact_name: 'Julian Deutsch', contact_phone: '0664 1112223' });
  });
});

describe('Arbeitszeit nur in Stunden (G24)', () => {
  it('eine Position in „Pauschale“ zählt nicht als Arbeitszeit', async () => {
    const { error } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: `AN-R6-P-${Date.now()}`, customer_name: 'Familie Deutsch', quote_date: '2026-10-19', valid_until: '2026-11-19', vat_rate: 20 },
      p_positionen: [{ label: 'Heizungstausch', qty: 1, unit: 'Pauschale', unit_price: 6000, netto: 6000, ist_arbeitszeit: true }],
    });
    expect(error?.message).toMatch(/quote_lines_arbeitszeit_in_stunden/);
  });

  it('in Stunden, „Std.“ und ohne Haken geht es wie bisher', async () => {
    const { error } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: `AN-R6-S-${Date.now()}`, customer_name: 'Familie Deutsch', quote_date: '2026-10-19', valid_until: '2026-11-19', vat_rate: 20 },
      p_positionen: [
        { label: 'Montage', qty: 8, unit: 'Std.', unit_price: 70, netto: 560, ist_arbeitszeit: true },
        { label: 'Heizungstausch', qty: 1, unit: 'Pauschale', unit_price: 6000, netto: 6000, ist_arbeitszeit: false },
      ],
    });
    expect(error).toBeNull();
  });
});
