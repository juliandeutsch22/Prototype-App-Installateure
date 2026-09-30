/**
 * Testbericht 30.09.2026, M12 — Adressen in Teilen. Die eine Zeile folgt den
 * Teilen; wer nur die Zeile schreibt (Import, Übernahme), bekommt die Teile
 * zerlegt, wo es eindeutig ist, sonst „Adresse prüfen“. Dazu die
 * Kundennummer und die Anschrift des Betriebs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'm12-adressen';
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'm12gf');
}, 60_000);

async function anlegen(felder: Record<string, unknown>) {
  const { data, error } = await chefin.client.from('customers')
    .insert({ company_id: BETRIEB, name: `Kunde ${crypto.randomUUID().slice(0, 6)}`, ...felder })
    .select('id, address, strasse, plz, ort, land, adresse_pruefen, kundennummer').single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

describe('Kunden (M12)', () => {
  it('die Zeile folgt den Teilen', async () => {
    const k = await anlegen({ strasse: 'Gartengasse 12', plz: '2700', ort: 'Wiener Neustadt' });
    expect(k).toMatchObject({ address: 'Gartengasse 12, 2700 Wiener Neustadt', land: 'AT', adresse_pruefen: false });
  });

  it('ein anderes Land steht in der Zeile', async () => {
    const k = await anlegen({ strasse: 'Marienplatz 1', plz: '80331', ort: 'München', land: 'de' });
    expect(k).toMatchObject({ address: 'Marienplatz 1, 80331 München, Deutschland', land: 'DE' });
  });

  it('nur die Zeile: zerlegt, wo es eindeutig ist', async () => {
    const k = await anlegen({ address: 'Hauptplatz 3, 8010 Graz' });
    expect(k).toMatchObject({ strasse: 'Hauptplatz 3', plz: '8010', ort: 'Graz', adresse_pruefen: false });
    expect(k.address).toBe('Hauptplatz 3, 8010 Graz');
  });

  it('Gegenprobe: nicht eindeutig — die Zeile bleibt in „Straße“, zu prüfen', async () => {
    const k = await anlegen({ address: 'Hauptplatz 3 Graz' });
    expect(k).toMatchObject({ strasse: 'Hauptplatz 3 Graz', plz: null, ort: null, adresse_pruefen: true });
    expect(k.address).toBe('Hauptplatz 3 Graz');
  });

  it('wer die Teile ergänzt, hat nichts mehr zu prüfen', async () => {
    const k = await anlegen({ address: 'Hauptplatz 3 Graz' });
    const { data } = await chefin.client.from('customers')
      .update({ strasse: 'Hauptplatz 3', plz: '8010', ort: 'Graz' }).eq('id', k.id as string)
      .select('address, adresse_pruefen').single();
    expect(data).toEqual({ address: 'Hauptplatz 3, 8010 Graz', adresse_pruefen: false });
  });

  it('Kundennummer: leer ist keine, doppelt geht nicht, der Vorschlag ist die nächste', async () => {
    const a = await anlegen({ kundennummer: '' });
    const b = await anlegen({ kundennummer: '  ' });
    expect([a.kundennummer, b.kundennummer]).toEqual([null, null]);
    await anlegen({ kundennummer: '10007' });
    const doppelt = await chefin.client.from('customers')
      .insert({ company_id: BETRIEB, name: 'Doppelt', kundennummer: '10007' });
    expect(doppelt.error?.code).toBe('23505');
    const { data } = await chefin.client.rpc('naechste_kundennummer');
    expect(data).toBe('10008');
  });
});

describe('Betrieb (M12)', () => {
  it('die Briefkopfzeile folgt den Teilen, das Firmenbuchgericht wird gespeichert', async () => {
    const { data, error } = await chefin.client.from('companies')
      .update({ strasse: 'Teststraße 1', plz: '8200', ort: 'Gleisdorf', firmenbuchgericht: 'Landesgericht Graz' })
      .eq('id', BETRIEB).select('address_line, firmenbuchgericht').single();
    expect(error).toBeNull();
    expect(data).toEqual({ address_line: 'Teststraße 1, 8200 Gleisdorf', firmenbuchgericht: 'Landesgericht Graz' });
  });

  it('eine alte Zeile mit „·“ wird zerlegt', async () => {
    const { data } = await admin.from('companies')
      .update({ address_line: 'Musterstraße 1 · 1010 Wien' }).eq('id', BETRIEB)
      .select('strasse, plz, ort').single();
    expect(data).toEqual({ strasse: 'Musterstraße 1', plz: '1010', ort: 'Wien' });
  });
});
