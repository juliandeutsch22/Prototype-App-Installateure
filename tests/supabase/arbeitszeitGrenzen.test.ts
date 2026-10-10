/**
 * Arbeitszeitgrenzen (Stand-Datei 11.1, Punkt 4): Geburtsdatum und
 * Begründung je Fall — wer liest, wer schreibt, und dass beide in
 * Datenauskunft und Löschung einer Person stehen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'azg-grenzen';
const FREMD = 'azg-grenzen-fremd';
let chefin: Konto;
let buero: Konto;
let monteur: Konto;
let kollege: Konto;
let fremderMonteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'azggf');
  buero = await konto(BETRIEB, 'Buchhaltung', 'azgbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'azgmont');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'azgkoll');
  fremderMonteur = await konto(FREMD, 'Mitarbeiter', 'azgfremd');
}, 120_000);

const lies = async (k: Konto, uid: string) =>
  (await k.client.from('geburtsdaten').select('geburtsdatum').eq('user_id', uid)).data ?? [];

describe('Geburtsdatum', () => {
  it('die Geschäftsführung trägt es ein und ändert es', async () => {
    const neu = await chefin.client.from('geburtsdaten')
      .upsert({ user_id: monteur.uid, company_id: BETRIEB, geburtsdatum: '2009-04-01' }, { onConflict: 'user_id' });
    expect(neu.error).toBeNull();
    const geaendert = await chefin.client.from('geburtsdaten')
      .upsert({ user_id: monteur.uid, company_id: BETRIEB, geburtsdatum: '2009-04-02' }, { onConflict: 'user_id' });
    expect(geaendert.error).toBeNull();
    expect(await lies(chefin, monteur.uid)).toEqual([{ geburtsdatum: '2009-04-02' }]);
  });

  it('lesen dürfen die Person selbst und das Büro', async () => {
    expect(await lies(monteur, monteur.uid)).toEqual([{ geburtsdatum: '2009-04-02' }]);
    expect(await lies(buero, monteur.uid)).toEqual([{ geburtsdatum: '2009-04-02' }]);
  });

  it('Gegenprobe: ein Kollege sieht es nicht, das Büro schreibt es nicht', async () => {
    expect(await lies(kollege, monteur.uid)).toEqual([]);
    const { error } = await buero.client.from('geburtsdaten')
      .upsert({ user_id: kollege.uid, company_id: BETRIEB, geburtsdatum: '2000-01-01' }, { onConflict: 'user_id' });
    expect(error).not.toBeNull();
  });

  it('Gegenprobe: keine Person eines fremden Betriebs', async () => {
    const { error } = await chefin.client.from('geburtsdaten')
      .insert({ user_id: fremderMonteur.uid, company_id: BETRIEB, geburtsdatum: '2000-01-01' });
    expect(error?.code).toBe('42501');
  });
});

describe('Begründung je Fall', () => {
  it('das Büro begründet — wer und wann setzt die Datenbank', async () => {
    const { error } = await buero.client.from('arbeitszeit_begruendungen').upsert({
      company_id: BETRIEB, user_id: monteur.uid, art: 'ruhezeit', bezug: '2026-10-07',
      text: '  Notdienst, Rohrbruch  ', von_name: 'Erfunden', von_uid: kollege.uid,
    }, { onConflict: 'company_id,user_id,art,bezug' });
    expect(error).toBeNull();
    const { data } = await admin.from('arbeitszeit_begruendungen')
      .select('text, von_uid, von_name').eq('user_id', monteur.uid).single();
    expect(data!.text).toBe('Notdienst, Rohrbruch');
    expect(data!.von_uid).toBe(buero.uid);
    expect(data!.von_name).not.toBe('Erfunden');
  });

  it('je Fall eine Begründung — ein zweites Mal ersetzt sie', async () => {
    await buero.client.from('arbeitszeit_begruendungen').upsert({
      company_id: BETRIEB, user_id: monteur.uid, art: 'ruhezeit', bezug: '2026-10-07', text: 'Gefahr in Verzug',
    }, { onConflict: 'company_id,user_id,art,bezug' });
    const { data } = await admin.from('arbeitszeit_begruendungen').select('text').eq('user_id', monteur.uid);
    expect(data).toEqual([{ text: 'Gefahr in Verzug' }]);
  });

  it('die Person liest ihre, ein Kollege nicht; schreiben darf die Person nicht', async () => {
    const eigene = await monteur.client.from('arbeitszeit_begruendungen').select('text').eq('user_id', monteur.uid);
    expect(eigene.data).toEqual([{ text: 'Gefahr in Verzug' }]);
    const fremde = await kollege.client.from('arbeitszeit_begruendungen').select('text').eq('user_id', monteur.uid);
    expect(fremde.data ?? []).toEqual([]);
    const selbst = await monteur.client.from('arbeitszeit_begruendungen').insert({
      company_id: BETRIEB, user_id: monteur.uid, art: 'tag', bezug: '2026-10-08', text: 'selbst',
    });
    expect(selbst.error).not.toBeNull();
  });

  it('ohne Text und mit fremder Art wird nichts', async () => {
    const leer = await buero.client.from('arbeitszeit_begruendungen').insert({
      company_id: BETRIEB, user_id: monteur.uid, art: 'tag', bezug: '2026-10-09', text: '   ',
    });
    expect(leer.error).not.toBeNull();
    const art = await buero.client.from('arbeitszeit_begruendungen').insert({
      company_id: BETRIEB, user_id: monteur.uid, art: 'xyz', bezug: '2026-10-09', text: 'x',
    });
    expect(art.error).not.toBeNull();
  });

  // Am Kollegen und ohne Büro-Konto: Auskunft und Löschung unten zählen die
  // Begründungen des Monteurs und die des Büros.
  it('Pause und Durchschnitt lassen sich begründen (seit 10.10.2026)', async () => {
    for (const [art, bezug] of [['pause', '2026-10-09'], ['durchschnitt', '2026-10-05']]) {
      const r = await admin.from('arbeitszeit_begruendungen').insert({
        company_id: BETRIEB, user_id: kollege.uid, art, bezug, text: 'Notdienst',
      });
      expect(r.error).toBeNull();
    }
  });
});

describe('Datenauskunft und Löschung', () => {
  it('die Auskunft enthält Geburtsdatum und Begründungen', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    expect(error).toBeNull();
    const d = (data as { daten: Record<string, unknown> }).daten;
    expect(d.geburtsdatum).toBe('2009-04-02');
    expect(d.begruendungen_arbeitszeit).toEqual([
      expect.objectContaining({ grenze: 'ruhezeit', bezug: '2026-10-07', begruendung: 'Gefahr in Verzug' }),
    ]);
    const vomBuero = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buero.uid });
    expect((vomBuero.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.arbeitszeit_begruendet).toBe(1);
  });

  it('die Löschung entfernt das Geburtsdatum; die Begründungen bleiben mit den Zeiten', async () => {
    await admin.from('users').update({ active: false }).eq('id', monteur.uid);
    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: monteur.uid });
    const b = probe.data as { sofort: Record<string, number>; aufbewahren: Array<{ was: string; anzahl: number }> };
    expect(b.sofort.geburtsdatum).toBe(1);
    expect(b.aufbewahren).toContainEqual(expect.objectContaining({ was: 'Begründungen zu Arbeitszeitgrenzen', anzahl: 1 }));

    const { error } = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: monteur.uid, p_nur_pruefen: false });
    expect(error).toBeNull();
    expect((await admin.from('geburtsdaten').select('user_id').eq('user_id', monteur.uid)).data).toEqual([]);
    expect((await admin.from('arbeitszeit_begruendungen').select('id').eq('user_id', monteur.uid)).data).toHaveLength(1);
  });
});
