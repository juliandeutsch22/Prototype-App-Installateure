/**
 * KUNDE MIT UNGÜLTIGER PLZ ODER E-MAIL STEHT UNTER „ANSCHRIFT PRÜFEN“
 * (Testbericht Runde 6, M6).
 *
 * PLZ „82“ in Österreich und „juliandeutsch22@gmail“ ließen sich speichern,
 * der Zähler „Anschrift prüfen“ blieb bei 0. Die App fragt jetzt nach; was
 * trotzdem gespeichert wird, markiert die Datenbank (`angaben_pruefen`) —
 * nach denselben Regeln wie die App (`plzFehler`, `mailFehler`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { kundenAdressePruefen, kundenZuPruefenAnzahl } from '@/lib/db/pg/customers';
import { mailFehler, plzFehler } from '@/lib/adresse';

const BETRIEB = 'r6p4-kunden';
let chefin: Konto;

async function anlegen(rest: Record<string, unknown>): Promise<string> {
  const { data, error } = await chefin.client.from('customers')
    .insert({ company_id: BETRIEB, name: `Kunde ${crypto.randomUUID().slice(0, 6)}`, kundenart: 'privat', ...rest })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function stand(id: string) {
  const { data } = await admin.from('customers').select('adresse_pruefen, angaben_pruefen').eq('id', id).single();
  return data as { adresse_pruefen: boolean; angaben_pruefen: boolean };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r6p4gfk');
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Anschrift prüfen: PLZ und E-Mail (M6)', () => {
  it('markiert „82“ in Österreich und eine E-Mail ohne Endung — die Rechnungssperre bleibt unberührt', async () => {
    const plz = await anlegen({ strasse: 'Bürgergasse 7', plz: '82', ort: 'Gleisdorf', land: 'AT' });
    expect(await stand(plz)).toEqual({ adresse_pruefen: false, angaben_pruefen: true });
    const mail = await anlegen({ strasse: 'Bürgergasse 7', plz: '8200', ort: 'Gleisdorf', email: 'juliandeutsch22@gmail' });
    expect(await stand(mail)).toEqual({ adresse_pruefen: false, angaben_pruefen: true });
    const gut = await anlegen({ strasse: 'Bürgergasse 7', plz: '8200', ort: 'Gleisdorf', email: 'julian@gmail.com' });
    expect(await stand(gut)).toEqual({ adresse_pruefen: false, angaben_pruefen: false });
  });

  it('nimmt die Markierung zurück, sobald die Angabe stimmt', async () => {
    const id = await anlegen({ strasse: 'Hauptplatz 1', plz: '82', ort: 'Gleisdorf' });
    expect((await stand(id)).angaben_pruefen).toBe(true);
    expect((await chefin.client.from('customers').update({ plz: '8200' }).eq('id', id)).error).toBeNull();
    expect((await stand(id)).angaben_pruefen).toBe(false);
  });

  it('die unzerlegbare alte Zeile zählt weiter mit', async () => {
    const id = await anlegen({ address: 'irgendwo am Land' });
    expect(await stand(id)).toEqual({ adresse_pruefen: true, angaben_pruefen: true });
  });

  it('zählt und listet sie unter „Anschrift prüfen“', async () => {
    clientEinreichen(chefin.client);
    const vorher = await kundenZuPruefenAnzahl(BETRIEB);
    const id = await anlegen({ strasse: 'Ring 3', plz: '82', ort: 'Wien' });
    expect((await kundenZuPruefenAnzahl(BETRIEB)).adressePruefen).toBe(vorher.adressePruefen + 1);
    expect((await kundenAdressePruefen(BETRIEB, 1000)).map((k) => k.id)).toContain(id);
  });

  it('rechnet wie die App — je Land und für die E-Mail', async () => {
    const faelle: [string, string, string][] = [
      ['82', 'AT', ''], ['1010', 'AT', ''], ['8001', 'CH', ''], ['80331', 'DE', ''], ['1010', 'DE', ''],
      ['SW1A 1AA', 'GB', ''], ['00186', 'IT', ''], ['1', 'IT', ''], ['', 'AT', 'a@b'], ['', 'AT', 'a@b.at'],
      ['', 'AT', 'office@huber.c'], ['', 'AT', 'kein at-zeichen.at'],
    ];
    for (const [plz, land, email] of faelle) {
      // Ohne PLZ auch ohne Straße: sonst markierte schon die alte Regel (Straße ohne PLZ und Ort).
      const id = await anlegen({ strasse: plz ? 'Weg 1' : null, plz: plz || null, ort: plz ? 'Ort' : null, land, email });
      const app = !!plzFehler(plz, land) || !!mailFehler(email);
      const s = await stand(id);
      expect(s.adresse_pruefen).toBe(false);
      expect({ plz, land, email, db: s.angaben_pruefen }).toEqual({ plz, land, email, db: app });
    }
  });
});
