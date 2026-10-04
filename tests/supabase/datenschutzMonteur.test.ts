/**
 * Testbericht 30.09.2026, H8 — gegen eine echte Datenbank.
 *
 *   H8  Kundenstamm: Monteure lesen die Tabelle nicht mehr; über
 *       `kunden_im_ueberblick` Name und Adresse aller Kunden, Ansprechpartner
 *       und Telefon nur bei Kunden ihrer eingeteilten Baustellen.
 *   H8  Krankmeldungen: vom Büro erfasste nur ansehen; eigene bis zum Beginn
 *       ändern und löschen, danach nur das Ende.
 *
 * Jede Regel mit Gegenprobe: was sie verbietet UND was sie weiter zulässt.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'rechte-3a';
let monteur: Konto;
let buero: Konto;
let chefin: Konto;
let verwaltung: Konto;
let eigenerKunde: string;
let fremderKunde: string;

const tag = (versatz: number) => {
  const d = new Date();
  d.setDate(d.getDate() + versatz);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'r3mont');
  buero = await konto(BETRIEB, 'Buchhaltung', 'r3buch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r3chef');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'r3verw');

  const k = await admin.from('customers').insert([
    { company_id: BETRIEB, name: 'Familie Eigen', address: 'Hauptstraße 1', contact_name: 'Frau Eigen',
      contact_phone: '0664 111', email: 'eigen@example.at', vat_id: 'ATU12345678', notes: 'zahlt spät' },
    { company_id: BETRIEB, name: 'Firma Fremd', address: 'Nebengasse 2', contact_name: 'Herr Fremd',
      contact_phone: '0664 222', email: 'fremd@example.at', notes: 'nur vormittags' },
  ]).select('id, name');
  if (k.error) throw new Error(k.error.message);
  eigenerKunde = k.data!.find((x) => x.name === 'Familie Eigen')!.id;
  fremderKunde = k.data!.find((x) => x.name === 'Firma Fremd')!.id;

  const p = await admin.from('projects').insert([
    { company_id: BETRIEB, project_number: 'R3-1', customer_id: eigenerKunde, customer_name: 'Familie Eigen',
      status: 'Aktiv', assigned_employees: [monteur.uid] },
    { company_id: BETRIEB, project_number: 'R3-2', customer_id: fremderKunde, customer_name: 'Firma Fremd',
      status: 'Aktiv', assigned_employees: [] },
  ]);
  if (p.error) throw new Error(p.error.message);
}, 120_000);

describe('H8 — der Kundenstamm', () => {
  it('der Monteur liest die Tabelle nicht mehr (vorher: alles samt E-Mail, UID, Notizen)', async () => {
    const { data } = await monteur.client.from('customers').select('*');
    expect(data).toEqual([]);
  });

  it('Büro und Verwaltung lesen wie bisher alles', async () => {
    for (const k of [buero, verwaltung, chefin]) {
      const { data } = await k.client.from('customers').select('name, email, notes').eq('id', eigenerKunde);
      expect(data).toEqual([{ name: 'Familie Eigen', email: 'eigen@example.at', notes: 'zahlt spät' }]);
    }
  });

  it('der Überblick: alle Kunden mit Name und Adresse, Kontakt nur bei eigener Baustelle', async () => {
    const { data, error } = await monteur.client.rpc('kunden_im_ueberblick');
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: eigenerKunde, name: 'Familie Eigen', address: 'Hauptstraße 1', contact_name: 'Frau Eigen', contact_phone: '0664 111' },
      { id: fremderKunde, name: 'Firma Fremd', address: 'Nebengasse 2', contact_name: null, contact_phone: null },
    ]);
    // E-Mail, UID und Notizen gibt es in dieser Antwort gar nicht.
    expect(Object.keys((data as object[])[0]).sort()).toEqual(['address', 'contact_name', 'contact_phone', 'id', 'name']);
  });

  it('das Büro bekommt im Überblick auch die Kontakte fremder Baustellen', async () => {
    const { data } = await buero.client.rpc('kunden_im_ueberblick');
    expect((data as { name: string; contact_phone: string }[]).find((x) => x.name === 'Firma Fremd')?.contact_phone)
      .toBe('0664 222');
  });
});

describe('H8 — Krankmeldungen', () => {
  const speichern = (k: Konto, a: { id?: string; user?: string; von: string; bis: string }) =>
    k.client.rpc('krankmeldung_speichern', {
      p_id: a.id ?? null, p_user: a.user ?? null, p_von: a.von, p_bis: a.bis, p_notiz: null,
    });

  it('eine vom Büro erfasste Meldung kann der Monteur weder löschen noch ändern', async () => {
    const { data, error } = await speichern(buero, { user: monteur.uid, von: tag(-4), bis: tag(-2) });
    expect(error).toBeNull();
    const id = (data as { id: string }).id;

    const weg = await monteur.client.rpc('krankmeldung_loeschen', { p_id: id });
    expect(weg.error?.message).toMatch(/hat das Büro erfasst/);
    const anders = await speichern(monteur, { id, von: tag(-4), bis: tag(-1) });
    expect(anders.error?.message).toMatch(/hat das Büro erfasst/);

    // Die Tage sind noch da — der Aufruf ist ganz zurückgerollt.
    const { count } = await admin.from('time_entries').select('id', { count: 'exact', head: true })
      .eq('krankmeldung_id', id);
    expect(count).toBeGreaterThan(0);

    // Gegenprobe: das Büro löscht sie.
    const buerosache = await buero.client.rpc('krankmeldung_loeschen', { p_id: id });
    expect(buerosache.error).toBeNull();
  });

  it('eine eigene, laufende Meldung: das Ende lässt sich ändern, löschen nicht', async () => {
    const { data } = await speichern(monteur, { von: tag(-1), bis: tag(2) });
    const id = (data as { id: string }).id;

    const ende = await speichern(monteur, { id, von: tag(-1), bis: tag(4) });
    expect(ende.error).toBeNull();
    const beginn = await speichern(monteur, { id, von: tag(0), bis: tag(4) });
    expect(beginn.error?.message).toMatch(/nur das Ende/);
    const weg = await monteur.client.rpc('krankmeldung_loeschen', { p_id: id });
    expect(weg.error?.message).toMatch(/schon begonnen/);

    await buero.client.rpc('krankmeldung_loeschen', { p_id: id });
  });

  it('eine eigene Meldung, die noch nicht begonnen hat, darf der Monteur löschen', async () => {
    /*
      EINE GANZE WOCHE, nicht drei Tage: am 04.10.2026 waren das Samstag bis
      Nationalfeiertag — ohne Arbeitstag, und die Meldung kam gar nicht
      zustande. Acht Tage enthalten immer Arbeitstage.
    */
    const { data, error } = await speichern(monteur, { von: tag(20), bis: tag(27) });
    expect(error).toBeNull();
    const weg = await monteur.client.rpc('krankmeldung_loeschen', { p_id: (data as { id: string }).id });
    expect(weg.error).toBeNull();
  });
});
