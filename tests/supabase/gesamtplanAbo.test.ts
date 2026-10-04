/**
 * Der ganze Einsatzplan als Kalender-Abo für die Leitung, und die Termine in
 * beiden Abos (Plan 10.4, PR B) — gegen den laufenden Stapel, bis zur
 * Kalenderdatei aus der Serverfunktion. Jede Grenze mit ihrer Gegenprobe:
 *   - wer den Gesamtplan abonniert (Leitung; nicht Monteur, Verwaltung,
 *     Buchhaltung) und dass das eigene Abo daneben bleibt,
 *   - was darin steht (je Baustelle und Tag die Eingeteilten mit Stufe und
 *     Uhrzeit, alle Termine; keine Abwesenheiten),
 *   - was das eigene Abo an Terminen bekommt (eigene und die der Baustelle
 *     am Einsatztag; nicht fremde),
 *   - wann es endet (Rolle, Modul) — und dass das eigene dann bleibt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, API, betriebAnlegen, konto, type Konto } from './helfer';

const KALENDER = `${API}/functions/v1/kalender`;
const BETRIEB = 'gesamtabo-a';

let chefin: Konto;
let pl: Konto;
let verw: Konto;
let buch: Konto;
let anna: Konto;
let bert: Konto;

const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const tagPlus = (n: number) => {
  const d = new Date(`${heute()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ohneStriche = (iso: string) => iso.replace(/-/g, '');

/** Wie ein Kalender: GET, ohne Anmeldung. */
async function abrufen(schluessel: string) {
  const a = await fetch(`${KALENDER}?t=${encodeURIComponent(schluessel)}`);
  // Gefaltete Zeilen wieder zusammen — geprüft wird der Inhalt, nicht der Umbruch.
  return { status: a.status, typ: a.headers.get('content-type') ?? '', text: (await a.text()).replace(/\r\n /g, '') };
}

/** Was die Datenbank der Serverfunktion gibt — unmittelbar. */
async function abruf(schluessel: string) {
  const { data, error } = await admin.rpc('kalender_abruf', {
    p_schluessel_hash: createHash('sha256').update(schluessel).digest('hex'),
  });
  if (error) throw new Error(error.message);
  return data as null | Record<string, unknown>;
}

async function anlegen(k: Konto, art?: string) {
  return art === undefined ? k.client.rpc('kalender_abo_anlegen') : k.client.rpc('kalender_abo_anlegen', { p_art: art });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await admin.from('companies').update({ kalender_abo_erlaubt: true, modules: null }).eq('id', BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'gachefin');
  pl = await konto(BETRIEB, 'Projektleiter', 'gapl');
  verw = await konto(BETRIEB, 'Verwaltung', 'gaverw');
  buch = await konto(BETRIEB, 'Buchhaltung', 'gabuch');
  anna = await konto(BETRIEB, 'Mitarbeiter', 'gaanna');
  bert = await konto(BETRIEB, 'Mitarbeiter', 'gabert');
  for (const [k, felder] of [
    [anna, { name: 'Anna Monteurin', einstufung: 'facharbeiter' }],
    [bert, { name: 'Bert Helfer', einstufung: 'helfer' }],
  ] as const) {
    const { error } = await admin.from('users').update(felder).eq('id', k.uid);
    if (error) throw new Error(error.message);
  }

  const { data: k } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Hausverwaltung Nord', address: 'Ringstraße 3' }).select('id').single();
  await admin.from('projects').insert([
    { company_id: BETRIEB, project_number: 'GA-1', customer_name: 'Familie Huber', address: 'Hauptstraße 1, 1010 Wien', status: 'Aktiv' },
    { company_id: BETRIEB, project_number: 'GA-2', customer_name: 'Gemeinde Neudorf', address: 'Rathausplatz 1', status: 'Aktiv' },
  ]);
  const { error } = await admin.from('assignments').insert([
    { company_id: BETRIEB, date: tagPlus(1), project_number: 'GA-1', user_id: anna.uid, user_name: 'Anna Monteurin', zeit_von: '07:00', zeit_bis: '12:00' },
    { company_id: BETRIEB, date: tagPlus(1), project_number: 'GA-1', user_id: bert.uid, user_name: 'Bert Helfer', zeit_von: '08:00', zeit_bis: '15:00' },
    { company_id: BETRIEB, date: tagPlus(2), project_number: 'GA-2', user_id: anna.uid, user_name: 'Anna Monteurin' },
  ]);
  if (error) throw new Error(error.message);
  // Abwesenheit: steht im Gesamtplan NICHT.
  await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: bert.uid, user_name: 'Bert Helfer', von: tagPlus(3), bis: tagPlus(3),
    tage: 1, status: 'Genehmigt', art: 'Urlaub',
  });
  const termine: Record<string, unknown>[] = [
    // Lieferung auf GA-1 am Einsatztag — Anna und Bert stehen dort.
    { company_id: BETRIEB, art: 'Lieferung', datum: tagPlus(1), zeit_von: '08:00', zeit_bis: '10:00', project_number: 'GA-1', notiz: 'Wannen', teilnehmer: [] },
    // Besichtigung beim Kunden, nur Bert nimmt teil.
    { company_id: BETRIEB, art: 'Besichtigung', datum: tagPlus(4), customer_id: k!.id, teilnehmer: [bert.uid] },
    // Abnahme auf GA-2 an einem Tag ohne Einsatz — betrifft Anna nicht.
    { company_id: BETRIEB, art: 'Abnahme', datum: tagPlus(5), project_number: 'GA-2', teilnehmer: [] },
  ];
  // Einzeln: eine Sammelanlage setzt fehlende Felder auf null statt auf die Vorgabe.
  for (const zeile of termine) {
    const t = await admin.from('termine').insert(zeile);
    if (t.error) throw new Error(t.error.message);
  }
}, 120_000);

describe('Wer den Gesamtplan abonniert', () => {
  it('Geschäftsführung und Projektleitung', async () => {
    expect((await anlegen(chefin, 'gesamt')).error).toBeNull();
    expect((await anlegen(pl, 'gesamt')).error).toBeNull();
  });

  it('nicht Monteur, Verwaltung, Buchhaltung — das eigene Abo bekommen sie weiter', async () => {
    for (const k of [anna, verw, buch]) {
      const { error } = await anlegen(k, 'gesamt');
      expect(error?.message).toMatch(/nur, wer die Einsatzplanung sieht/);
      expect((await anlegen(k, 'eigen')).error).toBeNull();
    }
  });

  it('ohne Angabe bleibt es das eigene Abo — so ruft die ausgelieferte App bis zum Neuladen', async () => {
    const { data, error } = await anlegen(anna);
    expect(error).toBeNull();
    const { data: zeilen } = await admin.from('kalender_abos').select('art').eq('user_id', anna.uid);
    expect(zeilen).toEqual([{ art: 'eigen' }]);
    expect((await abruf(data as string))?.art).toBe('eigen');
  });

  it('eine unbekannte Art gibt es nicht', async () => {
    const { error } = await anlegen(chefin, 'alles');
    expect(error?.code).toBe('22023');
  });

  it('zwei getrennte Links: ein neuer Gesamtplan lässt das eigene Abo stehen, Beenden auch', async () => {
    const { data: eigen } = await anlegen(pl, 'eigen');
    const { data: gesamt1 } = await anlegen(pl, 'gesamt');
    const { data: gesamt2 } = await anlegen(pl, 'gesamt');
    expect(await abruf(gesamt1 as string)).toBeNull();
    expect((await abruf(gesamt2 as string))?.art).toBe('gesamt');
    expect((await abruf(eigen as string))?.art).toBe('eigen');
    expect((await pl.client.rpc('kalender_abo_beenden', { p_art: 'gesamt' })).error).toBeNull();
    expect(await abruf(gesamt2 as string)).toBeNull();
    expect((await abruf(eigen as string))?.art).toBe('eigen');
    const { data: zeilen } = await pl.client.from('kalender_abos').select('angelegt_am');
    expect(zeilen).toHaveLength(1);
  });
});

describe('Was im Gesamtplan steht', () => {
  it('je Baustelle und Tag ein Eintrag mit den Eingeteilten, ihrer Stufe und Uhrzeit — als Kalenderdatei', async () => {
    const { data: schluessel } = await anlegen(chefin, 'gesamt');
    const { status, typ, text } = await abrufen(schluessel as string);
    expect(status).toBe(200);
    expect(typ).toMatch(/text\/calendar/);
    expect(text).toContain('X-WR-CALNAME:Einsatzplan – gesamtabo-a');
    expect(text).toContain('SUMMARY:Familie Huber · GA-1 · 2 Personen');
    expect(text).toContain(`DTSTART;TZID=Europe/Vienna:${ohneStriche(tagPlus(1))}T070000`);
    expect(text).toContain(`DTEND;TZID=Europe/Vienna:${ohneStriche(tagPlus(1))}T150000`);
    expect(text).toContain('Anna Monteurin · Facharbeiter · 07:00–12:00');
    expect(text).toContain('Bert Helfer · Helfer · 08:00–15:00');
    // Ohne Uhrzeit ganztägig.
    expect(text).toContain('SUMMARY:Gemeinde Neudorf · GA-2 · 1 Person');
    expect(text).toContain(`DTSTART;VALUE=DATE:${ohneStriche(tagPlus(2))}`);
  });

  it('dazu alle Termine des Betriebs — und keine Abwesenheit', async () => {
    const { data: schluessel } = await anlegen(chefin, 'gesamt');
    const { text } = await abrufen(schluessel as string);
    expect(text).toContain('SUMMARY:Lieferung (Aviso) · Familie Huber · GA-1');
    expect(text).toContain('SUMMARY:Besichtigung · Hausverwaltung Nord');
    expect(text).toContain('SUMMARY:Abnahme · Gemeinde Neudorf · GA-2');
    expect(text).toContain('Teilnehmer: Bert Helfer');
    expect(text).not.toMatch(/Urlaub|abwesend/i);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  });
});

describe('Die Termine im eigenen Abo', () => {
  it('Anna: die Lieferung auf ihrer Baustelle am Einsatztag — nicht die Besichtigung, nicht die Abnahme', async () => {
    const { data: schluessel } = await anlegen(anna, 'eigen');
    const { text } = await abrufen(schluessel as string);
    expect(text).toContain('X-WR-CALNAME:Einsätze – gesamtabo-a');
    expect(text).toContain('SUMMARY:Lieferung (Aviso) · Familie Huber · GA-1');
    expect(text).toContain('Zeitfenster 08:00–10:00');
    expect(text).not.toContain('Besichtigung');
    expect(text).not.toContain('Abnahme');
  });

  it('Bert: die Besichtigung als Teilnehmer, mit Ort aus dem Kunden — und die Lieferung', async () => {
    const { data: schluessel } = await anlegen(bert, 'eigen');
    const { text } = await abrufen(schluessel as string);
    expect(text).toContain('SUMMARY:Besichtigung · Hausverwaltung Nord');
    expect(text).toContain('LOCATION:Ringstraße 3');
    expect(text).toContain('SUMMARY:Lieferung (Aviso) · Familie Huber · GA-1');
    expect(text).not.toContain('Abnahme');
  });
});

describe('Wann der Gesamtplan endet', () => {
  it('wechselt die Rolle weg von der Leitung, ist er sofort weg — das eigene bleibt', async () => {
    const wechsel = await konto(BETRIEB, 'Projektleiter', 'gawechsel');
    const { data: eigen } = await anlegen(wechsel, 'eigen');
    const { data: gesamt } = await anlegen(wechsel, 'gesamt');
    await admin.from('users').update({ role: 'Mitarbeiter' }).eq('id', wechsel.uid);
    expect(await abruf(gesamt as string)).toBeNull();
    const { data } = await admin.from('kalender_abos').select('art').eq('user_id', wechsel.uid);
    expect(data).toEqual([{ art: 'eigen' }]);
    expect((await abruf(eigen as string))?.art).toBe('eigen');
  });

  it('Gegenprobe: ein Wechsel innerhalb der Leitung lässt ihn stehen', async () => {
    const wechsel = await konto(BETRIEB, 'Projektleiter', 'gableibt');
    const { data: gesamt } = await anlegen(wechsel, 'gesamt');
    await admin.from('users').update({ role: 'Geschäftsführung' }).eq('id', wechsel.uid);
    expect((await abruf(gesamt as string))?.art).toBe('gesamt');
  });

  it('schaltet der Betrieb die Einsatzplanung aus, ist er weg — das eigene Abo bleibt', async () => {
    const { data: eigen } = await anlegen(chefin, 'eigen');
    const { data: gesamt } = await anlegen(chefin, 'gesamt');
    await admin.from('companies').update({ modules: { einsatzplanung: false } }).eq('id', BETRIEB);
    try {
      expect(await abruf(gesamt as string)).toBeNull();
      expect((await admin.from('kalender_abos').select('id').eq('company_id', BETRIEB).eq('art', 'gesamt')).data).toEqual([]);
      expect((await abruf(eigen as string))?.art).toBe('eigen');
      // Und neu anlegen geht dann auch nicht.
      expect((await anlegen(chefin, 'gesamt')).error?.message).toMatch(/nur, wer die Einsatzplanung sieht/);
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
  });

  it('die Datenauskunft nennt, welche Abos es gibt', async () => {
    await anlegen(pl, 'eigen');
    await anlegen(pl, 'gesamt');
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: pl.uid });
    expect(error).toBeNull();
    const abos = (data as { daten: { kalenderabo: { art: string }[] } }).daten.kalenderabo;
    expect(abos.map((a) => a.art).sort()).toEqual(['eigene Einsätze', 'ganzer Einsatzplan']);
  });
});
