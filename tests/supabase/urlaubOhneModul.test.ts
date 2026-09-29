/**
 * Urlaub zurücknehmen, wenn das Modul Urlaub ausgeschaltet ist — gegen die
 * echte Datenbank.
 *
 * Die Urlaubsseite gibt es dann nicht; das Büro trägt Urlaub über die
 * Zeiterfassung ein (`urlaub_eintragen`), und die App nimmt ihn am Tag
 * zurück: sie liest den Antrag (`getVacation`) und ruft dieselbe
 * Entscheidung wie die Urlaubsseite. Geprüft wird, dass beides mit dem
 * ausgeschalteten Modul geht — und dass das Lesen nicht mehr zeigt, als die
 * Zeilenregeln ohnehin erlauben.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import * as urlaub from '@/lib/db/pg/vacations';

const BETRIEB = 'urlaub-ohne-modul';
const TAGE = { von: '2027-11-08', bis: '2027-11-10' };

let buch: Konto;
let anna: Konto;
let bernd: Konto;
let antrag = '';

async function urlaubstage(uid: string) {
  const { data } = await admin.from('time_entries').select('status')
    .eq('user_id', uid).gte('date', TAGE.von).lte('date', TAGE.bis);
  return (data ?? []).filter((t) => t.status === 'Urlaub').length;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('companies').update({ modules: { urlaub: false } }).eq('id', BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'uombuch');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'uomanna');
  bernd = await konto(BETRIEB, 'Mitarbeiter', 'uombernd');
  const { data, error } = await buch.client.rpc('urlaub_eintragen', {
    p_user: anna.uid, p_von: TAGE.von, p_bis: TAGE.bis, p_notiz: null, p_name: 'Büro',
  });
  expect(error).toBeNull();
  antrag = (data as { id: string }).id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Ohne Modul Urlaub', () => {
  it('das Büro liest den Antrag zum Tag', async () => {
    clientEinreichen(buch.client);
    const a = await urlaub.getVacation(BETRIEB, antrag);
    expect(a).toMatchObject({ id: antrag, userId: anna.uid, von: TAGE.von, bis: TAGE.bis, status: 'Genehmigt' });
  });

  it('ein Kollege liest ihn nicht — `null`, nicht der fremde Urlaub', async () => {
    clientEinreichen(bernd.client);
    expect(await urlaub.getVacation(BETRIEB, antrag)).toBeNull();
  });

  it('das Büro nimmt ihn zurück, und die Tage verschwinden aus dem Zeitkonto', async () => {
    expect(await urlaubstage(anna.uid)).toBe(3);
    clientEinreichen(buch.client);
    const r = await urlaub.entscheiden({ vacationId: antrag, entscheidung: 'Storniert', grund: 'Doch gearbeitet', entscheiderName: 'Büro' });
    expect(r).toMatchObject({ status: 'Storniert', entfernt: 3 });
    expect(await urlaubstage(anna.uid)).toBe(0);
  });
});
