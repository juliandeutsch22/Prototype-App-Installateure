/**
 * Ein Betriebsurlaub wird nicht für eine Person zurückgenommen — gegen die
 * echte Datenbank (Rückmeldung vom 29.09.2026).
 *
 * Einzeln storniert, verschwanden die Tage aus dem Zeitkonto, der
 * Betriebsurlaub selbst blieb stehen, und der Wochenplan zeigte die Person
 * weiter als abwesend. Die Tage liegen im September 2027, damit sie keinem
 * anderen Betriebsurlaub der Prüfungen ins Gehege kommen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'bu-einzeln';
const HERBST = { von: '2027-09-06', bis: '2027-09-10' };

let buch: Konto;
let chef: Konto;
let anna: Konto;
let kennung = '';

async function urlaubstage(uid: string, von = HERBST.von, bis = HERBST.bis) {
  const { data } = await admin.from('time_entries').select('status')
    .eq('user_id', uid).gte('date', von).lte('date', bis);
  return (data ?? []).filter((t) => t.status === 'Urlaub').length;
}

const zuruecknehmen = (k: Konto, antrag: string) =>
  k.client.rpc('urlaub_entscheiden', {
    p_antrag: antrag, p_entscheidung: 'Storniert', p_grund: 'Doch Notdienst', p_entscheider_name: 'Chef',
  });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('betriebsurlaube').delete().eq('company_id', BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'bueibuch');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'bueichef');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'bueianna');
  const { data, error } = await buch.client.rpc('betriebsurlaub_anlegen', {
    p_von: HERBST.von, p_bis: HERBST.bis, p_bezeichnung: 'Herbst', p_abbuchen: true,
    p_name: 'Büro', p_ausgenommen: [],
  });
  expect(error).toBeNull();
  kennung = (data as { id: string }).id;
}, 120_000);

describe('Zurücknehmen', () => {
  it('lehnt den Urlaub aus einem Betriebsurlaub ab und lässt alles, wie es war', async () => {
    const { data: urlaub } = await admin.from('vacations').select('id')
      .eq('user_id', anna.uid).eq('betriebsurlaub_id', kennung).single();
    const { error } = await zuruecknehmen(chef, (urlaub as { id: string }).id);
    expect(error?.message).toMatch(/gehört zum Betriebsurlaub/);
    // Auch die Tage bleiben: das Löschen davor rollt mit zurück.
    expect(await urlaubstage(anna.uid)).toBe(5);
    const { data: danach } = await admin.from('vacations').select('status')
      .eq('id', (urlaub as { id: string }).id).single();
    expect(danach!.status).toBe('Genehmigt');
  });

  it('Gegenprobe: ein beantragter Urlaub lässt sich weiter zurücknehmen', async () => {
    const von = '2027-10-04';
    const bis = '2027-10-05';
    const { data, error } = await buch.client.rpc('urlaub_eintragen', {
      p_user: anna.uid, p_von: von, p_bis: bis, p_notiz: null, p_name: 'Büro',
    });
    expect(error).toBeNull();
    const antrag = (data as { id: string }).id;
    expect(await urlaubstage(anna.uid, von, bis)).toBe(2);
    const zurueck = await zuruecknehmen(chef, antrag);
    expect(zurueck.error).toBeNull();
    expect(await urlaubstage(anna.uid, von, bis)).toBe(0);
  });

  it('der Name lässt sich weiter ändern — gesperrt ist nur der Stand', async () => {
    const { error } = await admin.from('vacations').update({ user_name: 'Anna B.' })
      .eq('user_id', anna.uid).eq('betriebsurlaub_id', kennung);
    expect(error).toBeNull();
  });

  it('der Weg über den Reiter bleibt: Löschen nimmt ihn allen zurück', async () => {
    const { error } = await buch.client.rpc('betriebsurlaub_loeschen', { p_id: kennung });
    expect(error).toBeNull();
    expect(await urlaubstage(anna.uid)).toBe(0);
  });
});
