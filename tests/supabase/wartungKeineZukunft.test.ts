/**
 * WARTUNG: KEIN TAG UND KEIN BAUJAHR AUS DER ZUKUNFT (Testbericht Runde 6, G23).
 *
 * „Zuletzt gewartet 01.12.2026“ am 27.10. und „Bj. 2030“ wurden gespeichert.
 * Die Datenbank weist das jetzt ab — auf jedem Weg, auf dem sich der Tag
 * ändert —, lässt aber eine Wartung, die schon so einen Tag trägt, weiter
 * bearbeiten (Altbestand wird nicht umgeschrieben).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'r6p4-wartung';
let chefin: Konto;
let kunde = '';

/** Ein Tag relativ zu heute in Wien, als JJJJ-MM-TT. */
function tag(versatz: number): string {
  const heute = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vienna' }));
  heute.setDate(heute.getDate() + versatz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${heute.getFullYear()}-${z(heute.getMonth() + 1)}-${z(heute.getDate())}`;
}
const jahr = Number(tag(0).slice(0, 4));

const wartung = (rest: Record<string, unknown>) => ({
  company_id: BETRIEB, customer_id: kunde, customer_name: 'Hausverwaltung Huber',
  anlage: 'Therme', intervall_monate: 12, faellig_am: tag(300), ...rest,
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r6p4gfw');
  const { data } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: 'Hausverwaltung Huber' }).select('id').single();
  kunde = (data as { id: string }).id;
}, 60_000);

describe('Kein Wartungstag und kein Baujahr aus der Zukunft (G23)', () => {
  it('weist „zuletzt gewartet“ nach heute ab — heute geht', async () => {
    const morgen = await chefin.client.from('wartungen').insert(wartung({ zuletzt_am: tag(1) }));
    expect(morgen.error?.message).toMatch(/liegt in der Zukunft/);
    const heute = await chefin.client.from('wartungen').insert(wartung({ zuletzt_am: tag(0) }));
    expect(heute.error).toBeNull();
  });

  it('weist ein Baujahr nach dem laufenden Jahr ab — das laufende geht', async () => {
    const spaeter = await chefin.client.from('wartungen').insert(wartung({ baujahr: jahr + 1 }));
    expect(spaeter.error?.message).toMatch(/Baujahr .* liegt in der Zukunft/);
    const jetzt = await chefin.client.from('wartungen').insert(wartung({ baujahr: jahr }));
    expect(jetzt.error).toBeNull();
  });

  it('gilt auch für „Erledigt“ und „Tag berichtigen“', async () => {
    const { data } = await chefin.client.from('wartungen')
      .insert(wartung({ zuletzt_am: tag(-30) })).select('id').single();
    const id = (data as { id: string }).id;
    const erledigt = await chefin.client.from('wartungen').update({ zuletzt_am: tag(5) }).eq('id', id);
    expect(erledigt.error?.message).toMatch(/liegt in der Zukunft/);
    const berichtigt = await chefin.client.rpc('wartung_tag_berichtigen', { p_wartung: id, p_am: tag(5) });
    expect(berichtigt.error?.message).toMatch(/liegt in der Zukunft/);
    const { data: stand } = await admin.from('wartungen').select('zuletzt_am').eq('id', id).single();
    expect((stand as { zuletzt_am: string }).zuletzt_am).toBe(tag(-30));
  });

  it('lässt eine Wartung mit einem Tag aus der Zukunft (Altbestand) weiter bearbeiten', async () => {
    // Wie ein Altbestand: am Wächter vorbei über den Dienstschlüssel.
    const { data } = await admin.from('wartungen')
      .insert(wartung({ zuletzt_am: tag(40), baujahr: jahr + 3 })).select('id').single();
    const id = (data as { id: string }).id;
    const hinweis = await chefin.client.from('wartungen').update({ hinweis: 'Schlüssel beim Hausmeister' }).eq('id', id);
    expect(hinweis.error).toBeNull();
    // Wer den Tag anfasst, muss einen gültigen eintragen.
    const richtig = await chefin.client.from('wartungen').update({ zuletzt_am: tag(-1), baujahr: jahr - 2 }).eq('id', id);
    expect(richtig.error).toBeNull();
  });
});
