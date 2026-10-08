import { beforeAll, expect, it } from 'vitest';
import { admin, betriebAnlegen, buchung, konto, type Konto } from './helfer';
import { Client } from 'pg';

const betrieb = 'zeitjournal';
let chef: Konto, monteur: Konto, kollege: Konto, pl: Konto, fremd: Konto;
const id = crypto.randomUUID();
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  await betriebAnlegen(`${betrieb}-fremd`);
  chef = await konto(betrieb, 'Geschäftsführung', 'journalchef');
  monteur = await konto(betrieb, 'Mitarbeiter', 'journalmonteur');
  kollege = await konto(betrieb, 'Mitarbeiter', 'journalkollege');
  pl = await konto(betrieb, 'Projektleiter', 'journalpl');
  fremd = await konto(`${betrieb}-fremd`, 'Geschäftsführung', 'journalfremd');
  expect((await monteur.client.from('time_entries').insert({ ...buchung(monteur, '2026-10-07'), id })).error).toBeNull();
});

async function journal(k: Konto = monteur) {
  const r = await k.client.from('zeitbuchungs_aenderungen').select('*').eq('entry_id', id).order('created_at');
  expect(r.error).toBeNull();
  return r.data!;
}
it('hält Anlage und echten Urheber fest, bearbeitet mit Vorher/Nachher und überlebt das Löschen', async () => {
  const angelegt = await journal();
  expect(angelegt).toHaveLength(1);
  expect(angelegt[0]).toMatchObject({ art: 'angelegt', durch: monteur.uid, vorher: null,
    nachher: expect.objectContaining({ start_time: '07:00:00', end_time: '16:00:00' }) });
  expect((await chef.client.from('time_entries').update({ end_time: '17:00',
    last_edited_by_uid: kollege.uid, last_edited_by: 'Gefälscht' }).eq('id', id)).error).toBeNull();
  const bearbeitet = await journal();
  expect(bearbeitet).toHaveLength(2);
  expect(bearbeitet[1]).toMatchObject({ art: 'geaendert', durch: chef.uid,
    vorher: expect.objectContaining({ end_time: '16:00:00' }),
    nachher: expect.objectContaining({ end_time: '17:00:00' }) });
  expect((await chef.client.from('time_entries').delete().eq('id', id)).error).toBeNull();
  const geloescht = await journal();
  expect(geloescht).toHaveLength(3);
  expect(geloescht[2]).toMatchObject({ art: 'geloescht', durch: chef.uid, nachher: null,
    vorher: expect.objectContaining({ end_time: '17:00:00' }) });
});
it('zeigt eigene Änderungen und dem Büro den Betrieb, anderen Personen und Betrieben keine', async () => {
  expect((await journal(chef)).length).toBeGreaterThan(0);
  for (const k of [kollege, pl, fremd]) expect(await journal(k)).toEqual([]);
});
it('lässt das Protokoll nicht direkt anlegen, ändern oder löschen', async () => {
  const j = (await journal())[0];
  expect((await monteur.client.from('zeitbuchungs_aenderungen').insert({ ...j, id: crypto.randomUUID() })).error).not.toBeNull();
  expect((await chef.client.from('zeitbuchungs_aenderungen').update({ art: 'geloescht' }).eq('id', j.id)).error).not.toBeNull();
  expect((await chef.client.from('zeitbuchungs_aenderungen').delete().eq('id', j.id)).error).not.toBeNull();
  expect(await journal()).toHaveLength(3);
});
it('erfindet bei Importen keinen Urheber und protokolliert keine wirkungslosen Speicherungen', async () => {
  const zeile = buchung(monteur, '2026-10-06');
  expect((await admin.from('time_entries').insert(zeile)).error).toBeNull();
  expect((await admin.from('zeitbuchungs_aenderungen').select('*').eq('entry_id', zeile.id)).data).toEqual([]);
  expect((await monteur.client.from('time_entries').update({ end_time: '16:00', last_edited_by: 'Kein Inhalt geändert' })
    .eq('id', zeile.id)).error).toBeNull();
  expect((await admin.from('zeitbuchungs_aenderungen').select('*').eq('entry_id', zeile.id)).data).toEqual([]);
  expect((await admin.from('time_entries').update({ end_time: '16:30' }).eq('id', zeile.id)).error).toBeNull();
  const j = await admin.from('zeitbuchungs_aenderungen').select('*').eq('entry_id', zeile.id);
  expect(j.data).toHaveLength(1);
  expect(j.data![0]).toMatchObject({ durch: null, durch_name: 'System', art: 'geaendert' });
});
it('nimmt bei einer zurückgerollten Buchung auch das Ereignis zurück', async () => {
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  const kennung = crypto.randomUUID();
  try {
    await db.query('begin');
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: monteur.uid,
      role: 'authenticated', aal: 'aal1', app_metadata: { company_id: betrieb, role: 'Mitarbeiter', active: true } })]);
    await db.query(`insert into public.time_entries(id,company_id,user_id,date,status,start_time,end_time)
      values ($1,$2,$3,'2026-10-05','Anwesend','07:00','16:00')`, [kennung, betrieb, monteur.uid]);
    expect((await db.query('select count(*)::int as n from public.zeitbuchungs_aenderungen where entry_id=$1', [kennung])).rows[0].n).toBe(1);
    await db.query('rollback');
    expect((await admin.from('zeitbuchungs_aenderungen').select('id').eq('entry_id', kennung)).data).toEqual([]);
    expect((await admin.from('time_entries').select('id').eq('id', kennung)).data).toEqual([]);
  } finally {
    await db.query('rollback');
    await db.end();
  }
});
it('nimmt das Journal in Personenauskunft und Aufbewahrungsprüfung auf', async () => {
  const auskunft = await chef.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
  expect(auskunft.error).toBeNull();
  expect(auskunft.data.daten.zeitbuchungs_aenderungen.length).toBeGreaterThanOrEqual(3);
  expect(auskunft.data.daten.zeitbuchungs_aenderungen.some((j: { art: string }) => j.art === 'geloescht')).toBe(true);
  expect((await admin.from('users').update({ active: false }).eq('id', monteur.uid)).error).toBeNull();
  const loeschung = await chef.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: monteur.uid });
  expect(loeschung.error).toBeNull();
  expect(loeschung.data.aufbewahren).toContainEqual(expect.objectContaining({ was: 'Änderungsprotokoll der Zeitbuchungen' }));
});
it('gibt Kunden nur ihren Bezug, keine Kollegen, fremden Kundennamen oder privaten Notizen aus', async () => {
  const kunde = await admin.from('customers').insert({ company_id: betrieb, name: 'Familie Journal' }).select('id').single();
  expect(kunde.error).toBeNull();
  const zeit = buchung(kollege, '2026-10-07', { customer_name: 'Familie Journal', comment: 'Private Mitarbeiternotiz' });
  expect((await admin.from('time_entries').insert(zeit)).error).toBeNull();
  expect((await chef.client.from('time_entries').update({ customer_name: 'Fremder geheimer Kunde' }).eq('id', zeit.id)).error).toBeNull();
  const auskunft = await chef.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde.data!.id });
  expect(auskunft.error).toBeNull();
  const protokoll = auskunft.data.daten.zeitbuchungs_aenderungen;
  expect(protokoll).toHaveLength(1);
  expect(protokoll[0].kundenname).toBe('Familie Journal');
  expect(JSON.stringify(protokoll)).not.toMatch(/Private Mitarbeiternotiz|Fremder geheimer Kunde/);
  const loeschung = await chef.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde.data!.id });
  expect(loeschung.error).toBeNull();
  expect(loeschung.data.aufbewahren).toContainEqual(expect.objectContaining({ was: 'Änderungsprotokoll mit Kundenbezug' }));
  expect(loeschung.data.ganz).toBe(false);
});
