/**
 * Kunden aus einer Datei übernehmen — gegen die echte Datenbank.
 *
 * Die Datenbank beurteilt „gibt es schon" über den GANZEN Bestand, gleich im
 * Probelauf und bei der Übernahme; sie schreibt alle oder keinen; und nur,
 * wer auch einzeln Kunden anlegen darf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kundenEinspielen, kundenVorhanden } from '@/lib/db/pg/customers';

const BETRIEB = 'kunden-import';
const FREMD = 'kunden-import-fremd';

let chefin: Konto;

const kunde = (name: string, rest: Record<string, string> = {}) => ({
  name, address: '', contactName: '', contactPhone: '', email: '', vatId: '', notes: '', active: true, ...rest,
});

async function namen(betrieb = BETRIEB) {
  const { data } = await admin.from('customers').select('name').eq('company_id', betrieb).order('name');
  return (data ?? []).map((z) => z.name as string);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  await admin.from('customers').delete().in('company_id', [BETRIEB, FREMD]);
  await admin.from('customers').insert([
    { company_id: BETRIEB, name: 'Familie Huber' },
    { company_id: FREMD, name: 'Maier GmbH' },
  ]);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kichef');
  clientEinreichen(chefin.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Probelauf', () => {
  it('nennt, was es im Betrieb schon gibt — ohne Rücksicht auf Schreibweise, und nur im eigenen', async () => {
    const da = await kundenVorhanden([kunde('Maier GmbH'), kunde('  familie   HUBER '), kunde('Neu KG')]);
    expect(da).toEqual([1]);
    expect(await namen()).toEqual(['Familie Huber']);
  });
});

describe('Übernahme', () => {
  it('legt an, was fehlt, überspringt Vorhandenes und Doppeltes — mit allen Feldern', async () => {
    const r = await kundenEinspielen([
      kunde('Familie Huber'),
      kunde('Berger Bau', {
        address: 'Hauptstraße 1, 1010 Wien', contactName: 'Anna Berger', contactPhone: '01 234',
        email: 'office@berger.at', vatId: 'ATU12345678', notes: 'Kundennummer im Altsystem: 7',
      }),
      kunde('berger  bau'),
      kunde('Maier GmbH'),
    ]);
    expect(r).toEqual({ angelegt: 2, uebersprungen: 2 });
    expect(await namen()).toEqual(['Berger Bau', 'Familie Huber', 'Maier GmbH']);
    const { data } = await admin.from('customers').select('*')
      .eq('company_id', BETRIEB).eq('name', 'Berger Bau').single();
    expect(data).toMatchObject({
      address: 'Hauptstraße 1, 1010 Wien', contact_name: 'Anna Berger', contact_phone: '01 234',
      email: 'office@berger.at', vat_id: 'ATU12345678', notes: 'Kundennummer im Altsystem: 7', active: true,
    });
    const leer = await admin.from('customers').select('address, email')
      .eq('company_id', BETRIEB).eq('name', 'Maier GmbH').single();
    expect(leer.data).toEqual({ address: null, email: null });
    expect(await namen(FREMD)).toEqual(['Maier GmbH']);
  });

  it('schreibt alle oder keinen', async () => {
    await expect(kundenEinspielen([kunde('Gültig OG'), kunde('   ')])).rejects.toThrow('braucht einen Namen');
    expect(await namen()).not.toContain('Gültig OG');
  });

  it('nicht mehr als 5000 auf einmal', async () => {
    const viele = Array.from({ length: 5001 }, (_, i) => kunde(`K ${i}`));
    await expect(kundenEinspielen(viele)).rejects.toThrow('Höchstens 5000');
  });

  it('nur, wer auch einzeln Kunden anlegen darf', async () => {
    for (const rolle of ['Mitarbeiter', 'Verwaltung', 'Buchhaltung'] as const) {
      const k = await konto(BETRIEB, rolle, `ki${rolle.slice(0, 4).toLowerCase()}`);
      const { error } = await k.client.rpc('kunden_einspielen', {
        p_kunden: [kunde('Schleichweg')], p_nur_pruefen: false,
      });
      expect(error?.message).toMatch(/wer Kunden anlegen darf/);
    }
    // Mit der Freigabe „Kunden pflegen“ darf das Büro auch übernehmen.
    const buero = await konto(BETRIEB, 'Verwaltung', 'kifrei');
    await admin.from('users').update({ kunden_pflegen: true }).eq('id', buero.uid);
    const frei = await buero.client.rpc('kunden_einspielen', {
      p_kunden: [kunde('Vom Büro')], p_nur_pruefen: false,
    });
    expect(frei.error).toBeNull();
    expect(await namen()).toContain('Vom Büro');
    const leitung = await konto(BETRIEB, 'Projektleiter', 'kipl');
    const { error } = await leitung.client.rpc('kunden_einspielen', {
      p_kunden: [kunde('Von der Leitung')], p_nur_pruefen: false,
    });
    expect(error).toBeNull();
    expect(await namen()).not.toContain('Schleichweg');
    expect(await namen()).toContain('Von der Leitung');
  });
});
