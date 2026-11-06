/**
 * DER PAPIERKORB FÜR ENTWÜRFE (M01d, U06, 06.11.2026) — gegen die echte
 * Datenbank.
 *
 * Festgehalten wird:
 * - ein Angebotsentwurf wird verworfen und wiederhergestellt; wer und wann
 *   setzt die Datenbank, die Firmendaten bleiben beim Entwurf;
 * - verworfen wird nur ein Entwurf, zurück geht es nur in den Entwurf — und
 *   nicht, wenn inzwischen eine andere Fassung angenommen ist;
 * - ein versendetes, angenommenes, abgelehntes oder ersetztes Angebot lässt
 *   sich nicht löschen, auch nicht von der Spitze und direkt über die
 *   Schnittstelle; ein Entwurf und ein verworfenes schon;
 * - ein verworfenes Angebot lässt sich weder speichern noch annehmen noch
 *   versenden;
 * - fremder Betrieb, Mitarbeiter und Support scheitern (der Support mit
 *   „mitarbeiten“ verwirft, löscht aber nicht endgültig);
 * - der Schein hält fest, wann er verworfen wurde, und vergisst es beim
 *   Zurückholen; mitschicken lässt sich der Zeitpunkt nicht;
 * - die Frist schreibt nur die Spitze; Zählen und „Abgelaufene löschen“
 *   rechnen die Scheine ohne Zeitpunkt ab der Einführung;
 * - die Listen der App zeigen kein verworfenes Angebot;
 * - das Journal zeigt Verwerfen und Wiederherstellen als Wechsel des Stands,
 *   das endgültige Löschen mit Nummer;
 * - die Datenauskunft nennt beim Kunden niemanden aus der Belegschaft.
 *
 * Gegenprobe: ohne `20261106200000_papierkorb.sql` gibt es weder den Stand
 * „Verworfen“ noch die Spalten noch die Löschsperre — jede Prüfung hier ist
 * rot (die Löschsperre: die Spitze löscht ein versendetes Angebot).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import * as angebote from '@/lib/db/pg/quotes';
import * as scheine from '@/lib/db/pg/workSheets';
import { updateCompany } from '@/lib/db/pg/company';
import { PAPIERKORB_SEIT } from '@/lib/papierkorb';
import { abgelaufeneLoeschen } from '@/features/papierkorb/papierkorbLeeren';

const A = 'papierkorb-a';
const B = 'papierkorb-b';
let chefin: Konto;
let admins: Konto;
let pl: Konto;
let buch: Konto;
let monteur: Konto;
let fremd: Konto;
let plattform: Konto;
let kunde = '';
let lauf = 0;

const ZEILE = [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 70, netto: 140, ist_arbeitszeit: true }];

/** Ein Angebot über die Funktion der App — als Entwurf, wenn nichts anderes verlangt ist. */
async function angebot(wer: Konto = chefin, extra: Record<string, unknown> = {}): Promise<string> {
  lauf += 1;
  const { data, error } = await wer.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-PK-${Date.now()}-${lauf}`, customer_id: kunde, customer_name: 'Familie Korb',
      address: 'Weg 1, 1010 Wien', quote_date: '2026-11-06', valid_until: '2026-12-06', vat_rate: 20,
      status: 'Entwurf', kalkulierte_stunden: 2, ...extra,
    },
    p_positionen: ZEILE,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Wie das Angebot in der Datenbank steht — mit dem Dienstschlüssel, an jeder Regel vorbei. */
async function zeile(id: string) {
  const { data } = await admin.from('quotes')
    .select('status, verworfen_am, verworfen_von_uid, verworfen_von_name, aussteller_stand, quote_number')
    .eq('id', id).maybeSingle();
  return data as {
    status: string; verworfen_am: string | null; verworfen_von_uid: string | null; verworfen_von_name: string | null;
    aussteller_stand: string | null; quote_number: string;
  } | null;
}

/** Den Stand direkt über die Schnittstelle setzen — wie es ein Aufrufer ohne App tun könnte. */
const setzen = (wer: Konto, id: string, werte: Record<string, unknown>) =>
  wer.client.from('quotes').update(werte).eq('id', id).select('id');

const loeschenDirekt = (wer: Konto, id: string) => wer.client.from('quotes').delete().eq('id', id).select('id');

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'pk-chefin');
  admins = await konto(A, 'Administrator', 'pk-admin');
  pl = await konto(A, 'Projektleiter', 'pk-pl');
  buch = await konto(A, 'Buchhaltung', 'pk-buch');
  monteur = await konto(A, 'Mitarbeiter', 'pk-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'pk-fremd');
  plattform = await plattformkonto('pk-support');
  expect((await admin.from('users').update({ name: 'Carla Chefin' }).eq('id', chefin.uid)).error).toBeNull();
  expect((await admin.from('users').update({ name: 'Paul Projektleiter' }).eq('id', pl.uid)).error).toBeNull();
  const { data, error } = await admin.from('customers').insert({
    company_id: A, name: 'Familie Korb', kundenart: 'privat', strasse: 'Weg 1', plz: '1010', ort: 'Wien',
  }).select('id').single();
  expect(error).toBeNull();
  kunde = data!.id;
}, 180_000);

/*
  KEIN VERWORFENES ANGEBOT BLEIBT LIEGEN. Zwei Prüfungen (`verlaeufe`,
  `urlaubNurUeberAntrag`) spielen ältere Migrationen erneut ein; darunter
  setzt `20261027400200_r6_angebot_fassungen.sql` die Prüfung der Stände
  ohne „Verworfen“ neu. Eine verworfene Zeile ließe sie scheitern und das
  Einspielen mittendrin abbrechen — die Prüfungen danach liefen gegen alte
  Funktionsrümpfe. Mit dem Dienstschlüssel, an der Löschsperre vorbei.
*/
afterAll(async () => {
  clientEinreichen(null);
  await admin.from('quotes').delete().in('company_id', [A, B, 'papierkorb-c']).eq('status', 'Verworfen');
});

describe('Verwerfen und Wiederherstellen eines Angebots', () => {
  it('über die Datenschicht der App: wer und wann setzt die Datenbank, zurück ist es wieder ein Entwurf', async () => {
    clientEinreichen(pl.client);
    const id = await angebot(pl);
    const vorher = Date.now();
    await angebote.updateQuote(id, { status: 'Verworfen' });
    const weg = (await zeile(id))!;
    expect(weg).toMatchObject({ status: 'Verworfen', verworfen_von_uid: pl.uid, verworfen_von_name: 'Paul Projektleiter' });
    expect(Date.parse(weg.verworfen_am!)).toBeGreaterThanOrEqual(vorher - 5_000);
    // Verwerfen ist kein Ausstellen: der Entwurf behält „keine Firmendaten“.
    expect(weg.aussteller_stand).toBeNull();

    await angebote.updateQuote(id, { status: 'Entwurf' });
    expect(await zeile(id)).toMatchObject({
      status: 'Entwurf', verworfen_am: null, verworfen_von_uid: null, verworfen_von_name: null, aussteller_stand: null,
    });
  }, 60_000);

  it('Wer und Wann lassen sich nicht mitschicken oder nachträglich ändern', async () => {
    const id = await angebot();
    // Mitgeschickt beim Verwerfen: die Datenbank setzt ihre eigenen Werte.
    expect((await setzen(chefin, id, {
      status: 'Verworfen', verworfen_am: '2020-01-01T00:00:00Z', verworfen_von_uid: pl.uid, verworfen_von_name: 'Jemand',
    })).error).toBeNull();
    const weg = (await zeile(id))!;
    expect(weg.verworfen_von_uid).toBe(chefin.uid);
    expect(weg.verworfen_von_name).toBe('Carla Chefin');
    expect(weg.verworfen_am!.startsWith('2020')).toBe(false);
    // Nachträglich: bleibt stehen.
    expect((await setzen(chefin, id, { verworfen_am: '2020-01-01T00:00:00Z', verworfen_von_name: 'Jemand' })).error).toBeNull();
    expect(await zeile(id)).toMatchObject({ verworfen_am: weg.verworfen_am, verworfen_von_name: 'Carla Chefin' });
    // Ein Angebot entsteht nicht im Papierkorb.
    await expect(angebot(chefin, { status: 'Verworfen' })).rejects.toThrow(/entsteht nicht im Papierkorb/);
  }, 60_000);

  it('verworfen wird nur ein Entwurf — nichts, was beim Kunden lag', async () => {
    for (const stand of ['Versendet', 'Abgelehnt']) {
      const id = await angebot(chefin, { status: stand });
      const r = await setzen(chefin, id, { status: 'Verworfen' });
      expect(r.error?.message, stand).toMatch(/nur ein Entwurf/);
      expect((await zeile(id))!.status).toBe(stand);
    }
  }, 60_000);

  it('zurück geht es nur in den Entwurf — und nicht, wenn inzwischen eine andere Fassung angenommen ist', async () => {
    const versendet = await angebot(chefin, { status: 'Versendet' });
    const fassung = await angebot(chefin, { vorgaenger_id: versendet });
    expect((await setzen(chefin, fassung, { status: 'Verworfen' })).error).toBeNull();
    // Beim Annehmen der anderen Fassung bleibt die verworfene im Papierkorb, statt „ersetzt“ zu werden.
    const { error } = await chefin.client.rpc('angebot_annehmen', { p_angebot: versendet, p_praefix: 'PK', p_abrechnung: 'Pauschal' });
    expect(error).toBeNull();
    expect((await zeile(fassung))!.status).toBe('Verworfen');
    const r = await setzen(chefin, fassung, { status: 'Entwurf' });
    expect(r.error?.message).toMatch(/inzwischen die Fassung .* angenommen/);
    expect((await zeile(fassung))!.status).toBe('Verworfen');
  }, 60_000);
});

describe('Ein verworfenes Angebot ist nur zu lesen', () => {
  it('weder speichern noch versenden noch ablehnen noch annehmen — und das Annehmen legt keine Baustelle an', async () => {
    const id = await angebot();
    expect((await setzen(chefin, id, { status: 'Verworfen' })).error).toBeNull();
    const nummer = (await zeile(id))!.quote_number;

    const speichern = await chefin.client.rpc('angebot_speichern', {
      p_id: id, p_kopf: { notes: 'geändert' }, p_positionen: null,
    });
    expect(speichern.error?.message).toMatch(/Nur ein Entwurf lässt sich ändern/);
    const positionen = await chefin.client.rpc('angebot_speichern', { p_id: id, p_kopf: {}, p_positionen: ZEILE });
    expect(positionen.error?.message).toMatch(/Nur ein Entwurf lässt sich ändern/);

    for (const stand of ['Versendet', 'Abgelehnt', 'Angenommen']) {
      const r = await chefin.client.rpc('angebot_speichern', { p_id: id, p_kopf: { status: stand }, p_positionen: null });
      expect(r.error?.message, stand).toMatch(/liegt im Papierkorb — erst wiederherstellen/);
    }

    const baustellenVorher = (await admin.from('projects').select('id').eq('company_id', A)).data!.length;
    const an = await chefin.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: 'PK', p_abrechnung: 'Pauschal' });
    expect(an.error?.message).toMatch(/liegt im Papierkorb/);
    expect((await admin.from('projects').select('id').eq('company_id', A)).data!.length).toBe(baustellenVorher);
    expect(await zeile(id)).toMatchObject({ status: 'Verworfen', quote_number: nummer });
  }, 60_000);
});

describe('Endgültig löschen', () => {
  it('ein versendetes, angenommenes, abgelehntes oder ersetztes Angebot nicht — auch nicht die Spitze, direkt über die Schnittstelle', async () => {
    for (const stand of ['Versendet', 'Angenommen', 'Abgelehnt', 'Ersetzt']) {
      const { data, error } = await admin.from('quotes').insert({
        company_id: A, quote_number: `AN-PK-L-${stand}-${Date.now()}`, customer_name: 'Familie Korb',
        quote_date: '2026-11-06', valid_until: '2026-12-06', status: stand, vat_rate: 20,
      }).select('id').single();
      expect(error).toBeNull();
      for (const wer of [chefin, admins]) {
        const r = await loeschenDirekt(wer, data!.id);
        expect(r.error, `${stand}/${wer.rolle}`).toBeNull();
        expect(r.data, `${stand}/${wer.rolle}`).toEqual([]);
      }
      // Über die App meldet es das, statt still „gelöscht“ zu sagen.
      clientEinreichen(chefin.client);
      await expect(angebote.deleteQuote(data!.id)).rejects.toThrow();
      expect((await zeile(data!.id))?.status).toBe(stand);
    }
  }, 90_000);

  it('ein Entwurf und ein verworfenes Angebot schon — samt Positionen', async () => {
    const entwurf = await angebot();
    const verworfen = await angebot();
    expect((await setzen(chefin, verworfen, { status: 'Verworfen' })).error).toBeNull();
    clientEinreichen(chefin.client);
    await angebote.deleteQuote(entwurf);
    await angebote.deleteQuote(verworfen);
    expect(await zeile(entwurf)).toBeNull();
    expect(await zeile(verworfen)).toBeNull();
    expect((await admin.from('quote_lines').select('id').in('quote_id', [entwurf, verworfen])).data).toEqual([]);
  }, 60_000);
});

describe('Wer nicht darf', () => {
  it('fremder Betrieb, Mitarbeiter und Buchhaltung: weder verwerfen noch wiederherstellen noch löschen', async () => {
    const id = await angebot();
    for (const wer of [fremd, monteur, buch]) {
      expect((await setzen(wer, id, { status: 'Verworfen' })).data, wer.rolle).toEqual([]);
    }
    expect((await zeile(id))!.status).toBe('Entwurf');
    expect((await setzen(chefin, id, { status: 'Verworfen' })).error).toBeNull();
    for (const wer of [fremd, monteur, buch]) {
      expect((await setzen(wer, id, { status: 'Entwurf' })).data, wer.rolle).toEqual([]);
      expect((await loeschenDirekt(wer, id)).data, wer.rolle).toEqual([]);
    }
    expect((await zeile(id))!.status).toBe('Verworfen');
  }, 60_000);

  it('der Support: ohne Schreibfreigabe nichts; mit „mitarbeiten“ verwerfen ja, endgültig löschen nein', async () => {
    const id = await angebot();
    for (const stufe of ['ansehen', 'mitarbeiten'] as const) {
      const { data: freigabe, error } = await chefin.client.from('support_freigaben').insert({
        company_id: A, gewaehrt_von: chefin.uid, grund: 'Papierkorb prüfen', stufe,
        gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
      }).select('id').single();
      expect(error).toBeNull();
      try {
        await einblickBeginnen(plattform, A, freigabe!.id);
        const r = await setzen(plattform, id, { status: 'Verworfen' });
        if (stufe === 'ansehen') {
          // Die Regel `quotes_schreiben` lässt ihn gar nicht an die Zeile — sie bleibt, wie sie war.
          expect(r.data ?? []).toEqual([]);
          expect((await zeile(id))!.status).toBe('Entwurf');
        } else {
          expect(r.error).toBeNull();
          expect(await zeile(id)).toMatchObject({ status: 'Verworfen', verworfen_von_name: 'Support (pk-support)' });
          // Das Unumkehrbare entscheidet der Betrieb selbst (wie E42).
          expect((await loeschenDirekt(plattform, id)).data).toEqual([]);
          expect((await zeile(id))!.status).toBe('Verworfen');
        }
      } finally {
        await admin.from('support_zugriffe').delete().eq('company_id', A);
        await admin.from('support_freigaben').delete().eq('company_id', A);
      }
    }
  }, 90_000);
});

describe('Der Schein hält fest, wann er verworfen wurde', () => {
  async function schein(extra: Record<string, unknown> = {}): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await monteur.client.from('work_sheets').insert({
      id, company_id: A, project_number: 'PK-1', customer_name: 'Familie Korb', datum: '2026-11-06',
      status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur', ...extra,
    });
    if (error) throw new Error(error.message);
    return id;
  }
  const verworfenAm = async (id: string) =>
    ((await admin.from('work_sheets').select('verworfen_am').eq('id', id).single()).data as { verworfen_am: string | null }).verworfen_am;

  it('beim Verwerfen gesetzt, beim Zurückholen geleert — über die Datenschicht der App', async () => {
    const id = await schein();
    clientEinreichen(monteur.client);
    const vorher = Date.now();
    await scheine.discardWorkSheetDraft(id, 'Monteur');
    const am = await verworfenAm(id);
    expect(am).not.toBeNull();
    expect(Date.parse(am!)).toBeGreaterThanOrEqual(vorher - 5_000);
    // Die Liste des Papierkorbs trägt ihn mit.
    expect((await scheine.listVerworfeneScheine(A)).find((s) => s.id === id)?.verworfenAm).toBe(Date.parse(am!));
    await scheine.restoreWorkSheetDraft(id);
    expect(await verworfenAm(id)).toBeNull();
  }, 60_000);

  it('mitschicken lässt er sich nicht: beim Anlegen, im Entwurf und beim Verwerfen', async () => {
    const id = await schein({ verworfen_am: '2020-01-01T00:00:00Z' });
    expect(await verworfenAm(id)).toBeNull();
    expect((await monteur.client.from('work_sheets').update({ verworfen_am: '2020-01-01T00:00:00Z' }).eq('id', id)).error).toBeNull();
    expect(await verworfenAm(id)).toBeNull();
    const r = await monteur.client.from('work_sheets')
      .update({ status: 'Verworfen', verworfen_von_name: 'Monteur', verworfen_am: '2020-01-01T00:00:00Z' }).eq('id', id);
    expect(r.error?.message).toMatch(/nur der Zustand/);
  }, 60_000);
});

describe('Frist, Zählen und „Abgelaufene endgültig löschen“', () => {
  it('die Frist schreibt nur die Spitze — und nur eine Zahl über null', async () => {
    const frist = async () =>
      ((await admin.from('companies').select('papierkorb_frist_tage').eq('id', A).single()).data as { papierkorb_frist_tage: number | null }).papierkorb_frist_tage;
    clientEinreichen(chefin.client);
    await updateCompany(A, { papierkorbFristTage: 30 });
    expect(await frist()).toBe(30);
    clientEinreichen(admins.client);
    await updateCompany(A, { papierkorbFristTage: 45 });
    expect(await frist()).toBe(45);
    for (const wer of [pl, buch, monteur, fremd]) {
      clientEinreichen(wer.client);
      await expect(updateCompany(A, { papierkorbFristTage: 1 }), wer.rolle).rejects.toThrow();
    }
    expect(await frist()).toBe(45);
    clientEinreichen(chefin.client);
    await expect(updateCompany(A, { papierkorbFristTage: 0 })).rejects.toThrow(/companies_papierkorb_frist/);
    await updateCompany(A, { papierkorbFristTage: null });
    expect(await frist()).toBeNull();
  }, 60_000);

  it('zählt und löscht, was bis zum Stichtag verworfen wurde; Scheine ohne Zeitpunkt ab der Einführung', async () => {
    // Ein eigener Betrieb, damit die Zahlen nur diese Fälle zählen.
    const C = 'papierkorb-c';
    await betriebAnlegen(C);
    const c = await konto(C, 'Geschäftsführung', 'pk-c');
    const q = async (nummer: string, status: string, am: string | null) => {
      const { data, error } = await admin.from('quotes').insert({
        company_id: C, quote_number: nummer, customer_name: 'Familie Alt', quote_date: '2026-10-01',
        valid_until: '2026-11-01', status, vat_rate: 20, verworfen_am: am,
      }).select('id').single();
      expect(error).toBeNull();
      return data!.id as string;
    };
    const s = async (am: string | null) => {
      const id = crypto.randomUUID();
      const { error } = await admin.from('work_sheets').insert({
        id, company_id: C, project_number: 'PK-C', customer_name: 'Familie Alt', datum: '2026-10-01',
        status: 'Verworfen', abrechnung: 'Regie', erstellt_von_uid: c.uid, erstellt_von_name: 'C', verworfen_am: am,
      });
      expect(error).toBeNull();
      return id;
    };
    const altAngebot = await q('AN-C-1', 'Verworfen', '2026-09-01T10:00:00Z');
    const neuAngebot = await q('AN-C-2', 'Verworfen', '2026-11-20T10:00:00Z');
    const versendet = await q('AN-C-3', 'Versendet', null);
    const altSchein = await s('2026-09-01T10:00:00Z');
    const ohneZeit = await s(null);
    const neuSchein = await s('2026-11-20T10:00:00Z');

    clientEinreichen(c.client);
    expect(await angebote.zaehleVerworfeneAngebote(C)).toBe(2);
    expect(await scheine.zaehleVerworfeneScheine(C)).toBe(3);
    // Stichtag vor der Einführung: der Schein ohne Zeitpunkt zählt noch nicht mit.
    const vorher = new Date(PAPIERKORB_SEIT - 86_400_000).toISOString();
    expect(await angebote.zaehleVerworfeneAngebote(C, vorher)).toBe(1);
    expect(await scheine.zaehleVerworfeneScheine(C, vorher)).toBe(1);
    // Danach schon — er liegt ab der Einführung.
    const danach = '2026-11-10T00:00:00Z';
    expect(await scheine.zaehleVerworfeneScheine(C, danach)).toBe(2);
    expect((await scheine.listAbgelaufeneScheine(C, danach)).map((x) => x.id).sort()).toEqual([altSchein, ohneZeit].sort());
    // Die Liste des Papierkorbs: die jüngsten zuerst, ohne Zeitpunkt am Ende.
    expect((await scheine.listVerworfeneScheine(C)).map((x) => x.id)).toEqual([neuSchein, altSchein, ohneZeit]);
    expect((await angebote.listVerworfeneAngebote(C)).map((x) => x.id)).toEqual([neuAngebot, altAngebot]);

    const r = await abgelaufeneLoeschen(C, danach, { angebote: true, scheine: true });
    expect(r).toEqual({ angebote: 1, scheine: 2, fehler: null });
    expect((await admin.from('quotes').select('id').eq('company_id', C)).data!.map((x) => x.id).sort())
      .toEqual([neuAngebot, versendet].sort());
    expect((await admin.from('work_sheets').select('id').eq('company_id', C)).data!.map((x) => x.id)).toEqual([neuSchein]);
  }, 90_000);
});

describe('Die Listen der App zeigen kein verworfenes Angebot', () => {
  it('jüngste, Suche, Kunde, Fassungen, Baustelle, Baustellen und Archiv — die eigene Seite schon', async () => {
    const { data: p } = await admin.from('projects')
      .insert({ company_id: A, project_number: 'PK-B-1', customer_name: 'Familie Korb', status: 'Aktiv' })
      .select('id').single();
    const vorgaenger = await angebot(chefin, { status: 'Versendet' });
    const sichtbar = await angebot(chefin, { project_number: 'PK-B-1' });
    const weg = await angebot(chefin, { project_number: 'PK-B-1', vorgaenger_id: vorgaenger });
    expect((await setzen(chefin, weg, { status: 'Verworfen' })).error).toBeNull();
    const nummer = (await zeile(weg))!.quote_number;
    clientEinreichen(chefin.client);
    const ids = (l: { id: string }[]) => l.map((x) => x.id);

    expect(ids(await angebote.listRecentQuotes(A, 500))).toContain(sichtbar);
    expect(ids(await angebote.listRecentQuotes(A, 500))).not.toContain(weg);
    expect(ids(await angebote.sucheAngebote(A, nummer))).toEqual([]);
    expect(ids(await angebote.listQuotesForCustomer(A, kunde, 500))).not.toContain(weg);
    expect(ids(await angebote.listFassungen(A, vorgaenger))).toEqual([]);
    expect(ids(await angebote.listQuotesForProject(A, p!.id))).toEqual([sichtbar]);
    expect(ids(await angebote.listQuotesForProjects(A, [p!.id]))).toEqual([sichtbar]);
    expect(ids(await angebote.listQuotesInRange(A, '2026-11-01', '2026-11-30'))).not.toContain(weg);
    // Die Gegenprobe: dieselben Listen kennen den Entwurf daneben, und die eigene Seite das verworfene.
    expect(ids(await angebote.listQuotesInRange(A, '2026-11-01', '2026-11-30'))).toContain(sichtbar);
    expect((await angebote.getQuote(A, weg))?.status).toBe('Verworfen');
    expect(ids(await angebote.listVerworfeneAngebote(A, 500))).toContain(weg);
  }, 60_000);
});

describe('Journal und Datenauskunft', () => {
  it('das Journal zeigt Verwerfen und Wiederherstellen als Wechsel des Stands, das endgültige Löschen mit Nummer', async () => {
    const id = await angebot();
    const nummer = (await zeile(id))!.quote_number;
    expect((await setzen(chefin, id, { status: 'Verworfen' })).error).toBeNull();
    expect((await setzen(chefin, id, { status: 'Entwurf' })).error).toBeNull();
    expect((await setzen(chefin, id, { status: 'Verworfen' })).error).toBeNull();
    expect((await loeschenDirekt(chefin, id)).data).toHaveLength(1);
    const { data } = await admin.from('aenderungsjournal').select('art, aenderungen, bezeichnung, von_name')
      .eq('objekt_id', id).order('am');
    expect(data).toEqual([
      { art: 'angelegt', aenderungen: {}, bezeichnung: nummer, von_name: 'Carla Chefin' },
      { art: 'geaendert', aenderungen: { status: { alt: 'Entwurf', neu: 'Verworfen' } }, bezeichnung: nummer, von_name: 'Carla Chefin' },
      { art: 'geaendert', aenderungen: { status: { alt: 'Verworfen', neu: 'Entwurf' } }, bezeichnung: nummer, von_name: 'Carla Chefin' },
      { art: 'geaendert', aenderungen: { status: { alt: 'Entwurf', neu: 'Verworfen' } }, bezeichnung: nummer, von_name: 'Carla Chefin' },
      { art: 'geloescht', aenderungen: {}, bezeichnung: nummer, von_name: 'Carla Chefin' },
    ]);
  }, 60_000);

  it('beim Kunden ohne die Kennung und den Namen dessen, der verworfen hat; bei der Person die Anzahl', async () => {
    const id = await angebot();
    expect((await setzen(pl, id, { status: 'Verworfen' })).error).toBeNull();
    const kundeAuskunft = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
    expect(kundeAuskunft.error).toBeNull();
    const text = JSON.stringify(kundeAuskunft.data);
    expect(text).toContain((await zeile(id))!.quote_number);
    expect(text).not.toContain(pl.uid);
    expect(text).not.toContain('Paul Projektleiter');
    // Die Angebote selbst ohne die beiden Felder — der Zeitpunkt bleibt, er sagt nichts über eine Person.
    const ins = (kundeAuskunft.data as { daten: { angebote: Record<string, unknown>[] } }).daten.angebote
      .find((a) => a.id === id)!;
    expect(ins).toMatchObject({ status: 'Verworfen' });
    expect(Object.keys(ins)).not.toContain('verworfen_von_uid');
    expect(Object.keys(ins)).not.toContain('verworfen_von_name');
    expect(Object.keys(ins)).toContain('verworfen_am');

    const person = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: pl.uid });
    expect(person.error).toBeNull();
    const verworfen = (await admin.from('quotes').select('id').eq('verworfen_von_uid', pl.uid)).data!.length;
    expect(verworfen).toBeGreaterThan(0);
    expect((person.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.angebote_verworfen).toBe(verworfen);
  }, 60_000);
});
