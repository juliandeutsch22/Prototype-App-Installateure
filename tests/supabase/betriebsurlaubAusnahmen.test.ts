/**
 * Betriebsurlaub mit Ausnahmen — gegen die echte Datenbank.
 *
 * Gewünscht vom Betrieb am 24.09.2026: der Betrieb hat zu, aber nicht jeder
 * (Notdienst, Lager). Wer ausgenommen ist, bekommt keinen Urlaub gebucht —
 * beim Anlegen nicht und beim späteren Nachbuchen nach einem Wiedereintritt
 * auch nicht. Die Tage liegen im August 2027, damit sie keinem anderen
 * Betriebsurlaub der Prüfungen ins Gehege kommen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'bu-ausnahmen';
const SOMMER = { von: '2027-08-02', bis: '2027-08-06' };

let buch: Konto;
let chef: Konto;
let anna: Konto;
let bernd: Konto;
let lager: Konto;

async function urlaubstage(uid: string) {
  const { data } = await admin.from('time_entries').select('date, status')
    .eq('user_id', uid).gte('date', SOMMER.von).lte('date', SOMMER.bis);
  return (data ?? []).filter((t) => t.status === 'Urlaub').length;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('betriebsurlaube').delete().eq('company_id', BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'buabuch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'buachef');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'buaanna');
  bernd = await konto(BETRIEB, 'Mitarbeiter', 'buabernd');
  lager = await konto(BETRIEB, 'Verwaltung', 'bualager');
}, 120_000);

describe('Anlegen mit Ausnahmen', () => {
  let kennung = '';

  it('bucht allen ausser den Ausgenommenen', async () => {
    const { data, error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: SOMMER.von, p_bis: SOMMER.bis, p_bezeichnung: 'Sommer', p_abbuchen: true,
      p_name: 'Büro', p_ausgenommen: [bernd.uid, lager.uid, bernd.uid],
    });
    expect(error).toBeNull();
    kennung = (data as { id: string }).id;
    expect(await urlaubstage(anna.uid)).toBe(5);
    expect(await urlaubstage(bernd.uid)).toBe(0);
    expect(await urlaubstage(lager.uid)).toBe(0);
    // Doppelt Genanntes steht einmal da.
    const { data: b } = await admin.from('betriebsurlaube').select('ausgenommen').eq('id', kennung).single();
    expect([...(b!.ausgenommen as string[])].sort()).toEqual([bernd.uid, lager.uid].sort());
  });

  it('ein Ausgenommener bekommt ihn auch beim Wiedereintritt nicht nachgebucht', async () => {
    await chef.client.from('users').update({ active: false }).eq('id', bernd.uid);
    await chef.client.from('users').update({ active: true }).eq('id', bernd.uid);
    expect(await urlaubstage(bernd.uid)).toBe(0);
    // Gegenprobe im selben Ablauf: wer NICHT ausgenommen ist, bekommt ihn.
    await chef.client.from('users').update({ active: false }).eq('id', anna.uid);
    await admin.from('time_entries').delete().eq('user_id', anna.uid)
      .gte('date', SOMMER.von).lte('date', SOMMER.bis);
    await admin.from('vacations').delete().eq('user_id', anna.uid).eq('betriebsurlaub_id', kennung);
    await chef.client.from('users').update({ active: true }).eq('id', anna.uid);
    expect(await urlaubstage(anna.uid)).toBe(5);
  });

  it('Löschen nimmt zurück, was gebucht wurde — und lässt die Ausgenommenen, wie sie waren', async () => {
    const { data, error } = await buch.client.rpc('betriebsurlaub_loeschen', { p_id: kennung });
    expect(error).toBeNull();
    expect(data).toMatchObject({ mitarbeiter: 3 });
    expect(await urlaubstage(anna.uid)).toBe(0);
    expect(await urlaubstage(bernd.uid)).toBe(0);
  });
});

describe('Ausnahmen nur aus dem eigenen Betrieb', () => {
  it('weist eine fremde Kennung ab und legt nichts an', async () => {
    await betriebAnlegen('bu-ausnahmen-fremd');
    const fremd = await konto('bu-ausnahmen-fremd', 'Mitarbeiter', 'buafremd');
    const { error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: SOMMER.von, p_bis: SOMMER.bis, p_bezeichnung: 'Sommer', p_abbuchen: true,
      p_name: 'Büro', p_ausgenommen: [fremd.uid],
    });
    expect(error?.message).toMatch(/zum Betrieb gehört/);
    const { count } = await admin.from('betriebsurlaube').select('id', { count: 'exact', head: true })
      .eq('company_id', BETRIEB);
    expect(count).toBe(0);
  });

  it('ohne Ausnahmen ruft die alte App weiter richtig auf', async () => {
    const { data, error } = await buch.client.rpc('betriebsurlaub_anlegen', {
      p_von: SOMMER.von, p_bis: SOMMER.bis, p_bezeichnung: 'Sommer', p_abbuchen: false, p_name: 'Büro',
    });
    expect(error).toBeNull();
    await buch.client.rpc('betriebsurlaub_loeschen', { p_id: (data as { id: string }).id });
  });
});
