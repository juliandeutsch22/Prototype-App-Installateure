/**
 * LAGERORTE, FAHRZEUGE, UMLAGERUNG — UND DER SCHREIBBEFEHLS-VERTRAG
 * (SHK-Ausbau M04a, E10; `20261107200000_lagerorte_fahrzeuge_umlagerung.sql`
 * und `20261107200100_lagerorte_bestehende_wege.sql`) — echte Datenbank.
 *
 * Geprüft wird:
 *  - Fahrzeuge und Orte: anlegen, ein Kennzeichen je Betrieb, Stilllegen nur
 *    ohne Bestand, nur über die Funktionen, Kennzeichen aus Buchungen.
 *  - Umlagern: mengenneutral, beide Bewegungen mit Ort, Gegenort und Vorgang,
 *    kein Ort negativ (keine Übersteuerung), erwarteter Stand und Einheit,
 *    Wiederholung liefert dasselbe Ergebnis, andere Nutzlast ist ein Konflikt,
 *    Stand bei unklarem Ausgang, atomar (Fehler im zweiten Schritt erzwungen),
 *    zwei gleichzeitige Umlagerungen auf dieselbe Menge: genau eine gelingt.
 *  - Zahl-Gleichheit: die Summe der Bewegungen je Ort ist der Bestand; für das
 *    Hauptlager `materials.stock` — nach jedem Weg.
 *  - Jeder bestehende Weg ohne Ort: wie bisher (neue Spalten leer, Hauptlager).
 *  - Mit Ort: Wareneingang, Inventur (Eröffnungsbestand nur durch Zählung),
 *    Rüstliste aus dem Fahrzeug, Retoure ins Fahrzeug, Abholen aus einem Ort,
 *    Einkaufsliste an einen Ort — und was das für Reservierung und
 *    Rechnungsvorschlag heißt.
 *  - Rechte, fremder Betrieb, Support, Datenauskunft.
 *  - Modul aus — sobald `app.modul_aktiv` eingespielt ist (anderes Paket).
 *  - Messung: Umlagern und Abhaken mit 10.000 Artikeln und 20 Orten unter der
 *    Zeitgrenze angemeldeter Konten (8 s).
 *
 * GEGENPROBE: vor den beiden Migrationen ist jeder Fall rot außer den
 * Erhaltungen ohne Ort, die vorher wie nachher grün sind (dort prüfen die
 * neuen Spalten nur, dass sie leer bleiben — vorher gibt es sie nicht; der
 * Kern der Erhaltung, Bestand und Bewegung, ist vorher wie nachher grün).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, buchung, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'lagerorte-a';
const FREMD = 'lagerorte-b';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

let lager: Konto;
let chef: Konto;
let max: Konto;
let tom: Konto;
let buch: Konto;
let fremd: Konto;
let plattform: Konto;
let hauptId = '';
/** Max fährt BUS, Tom fährt TOM; POOL hat keinen Standardfahrer. */
let BUS = '';
let TOM = '';
let POOL = '';
let AUSSEN = '';
let fremdOrt = '';

/* ------------------------------------------------------------------ Helfer */

async function fahrzeug(k: Konto, kennzeichen: string, fahrer: string | null = null): Promise<{ id: string; ort: string }> {
  const { data, error } = await k.client.rpc('fahrzeug_speichern', {
    p_fahrzeug: { kennzeichen, standardfahrer_uid: fahrer, aktiv: true },
  });
  if (error) throw new Error(error.message);
  const { data: o } = await admin.from('lagerorte').select('id').eq('fahrzeug_id', data).single();
  return { id: String(data), ort: (o as { id: string }).id };
}

async function artikel(stock = 10, unit = 'Stk', betrieb = BETRIEB, k: Konto = lager): Promise<string> {
  const { data, error } = await k.client.from('materials')
    .insert({ company_id: betrieb, name: `Artikel ${crypto.randomUUID().slice(0, 6)}`, stock, unit, lagerartikel: true })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

const befehl = (
  material: string, von: string | null, nach: string | null, menge: number, erwartet: number,
  rest: Record<string, unknown> = {},
) => ({
  vorgang: crypto.randomUUID(), aktion: 'umlagerung', ziel: { artikel: material, von, nach },
  erwartet: { bestand_von: erwartet }, menge, einheit: 'Stk', ...rest,
});

const umlagern = (k: Konto, b: Record<string, unknown>) => k.client.rpc('umlagern', { p_befehl: b });

async function haupt(material: string): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', material).single();
  return Number((data as { stock: number }).stock);
}

async function amOrt(ort: string, material: string): Promise<number> {
  const { data } = await admin.from('lagerbestaende').select('menge').eq('lagerort_id', ort).eq('material_id', material);
  return Number((data as { menge: number }[] | null)?.[0]?.menge ?? 0);
}

async function bewegungen(material: string): Promise<Record<string, unknown>[]> {
  const { data } = await admin.from('lagerbewegungen').select('*').eq('material_id', material).order('created_at');
  return (data ?? []) as Record<string, unknown>[];
}

/** Die jüngste Bewegung — je Aufruf eine eigene Transaktion, also eine eigene Zeit. */
async function letzte(material: string): Promise<Record<string, unknown>> {
  const alle = await bewegungen(material);
  return alle[alle.length - 1];
}

/**
 * DIE ZAHL-GLEICHHEIT: je Ort ergibt die Summe der Bewegungen den Bestand;
 * am Hauptlager (Ort leer) ist das `materials.stock`. Für Artikel, die über
 * die App angelegt wurden — ihr Anfangsbestand steht im Protokoll.
 */
async function zahlenGleich(material: string): Promise<void> {
  const alle = await bewegungen(material);
  const summe = (ort: string | null) =>
    alle.filter((b) => (b.lagerort_id ?? null) === ort).reduce((s, b) => s + Number(b.menge), 0);
  expect(summe(null), 'Hauptlager').toBe(await haupt(material));
  const { data } = await admin.from('lagerbestaende').select('lagerort_id, menge').eq('material_id', material);
  for (const z of (data ?? []) as { lagerort_id: string; menge: number }[]) {
    expect(summe(z.lagerort_id), `Ort ${z.lagerort_id}`).toBe(Number(z.menge));
  }
}

async function mitPg<T>(f: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    return await f(db);
  } finally {
    await db.end();
  }
}

/* ------------------------------------------------------------------ Aufbau */

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Lagerorte GmbH');
  await betriebAnlegen(FREMD, 'Fremd GmbH');
  lager = await konto(BETRIEB, 'Verwaltung', 'loverw');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'lochef');
  max = await konto(BETRIEB, 'Mitarbeiter', 'lomax');
  tom = await konto(BETRIEB, 'Mitarbeiter', 'lotom');
  buch = await konto(BETRIEB, 'Buchhaltung', 'lobuch');
  fremd = await konto(FREMD, 'Verwaltung', 'lofremd');
  plattform = await plattformkonto('loplatt');
  // Das Hauptlager legt `betrieb_anlegen` an; ein über den Dienstschlüssel angelegter Prüfbetrieb hat es nicht.
  const { data: h, error: he } = await admin.from('lagerorte')
    .insert({ company_id: BETRIEB, art: 'haupt', bezeichnung: 'Zentrallager' }).select('id').single();
  if (he) throw new Error(he.message);
  hauptId = (h as { id: string }).id;
  BUS = (await fahrzeug(lager, 'W-111A', max.uid)).ort;
  TOM = (await fahrzeug(lager, 'W-222B', tom.uid)).ort;
  POOL = (await fahrzeug(lager, 'W-333C')).ort;
  const { data: a, error: ae } = await lager.client.rpc('lagerort_speichern', {
    p_ort: { art: 'lager', bezeichnung: 'Außenlager Liesing', anschrift: 'Liesinger Platz 1', aktiv: true },
  });
  if (ae) throw new Error(ae.message);
  AUSSEN = String(a);
  fremdOrt = (await fahrzeug(fremd, 'W-999F')).ort;
}, 180_000);

afterAll(async () => {
  for (const b of [BETRIEB]) {
    await admin.from('support_zugriffe').delete().eq('company_id', b);
    await admin.from('support_freigaben').delete().eq('company_id', b);
  }
});

/* ----------------------------------------------------- Fahrzeuge und Orte */

describe('Fahrzeuge und Orte', () => {
  it('ein Fahrzeug bringt sein Fahrzeuglager mit — benannt nach dem Kennzeichen', async () => {
    const { data } = await admin.from('lagerorte').select('art, bezeichnung, aktiv').eq('id', BUS).single();
    expect(data).toEqual({ art: 'fahrzeug', bezeichnung: 'W-111A', aktiv: true });
  });

  it('ein Kennzeichen je Betrieb — gleich geschrieben ist gleich, ohne Bindestrich und Leerzeichen', async () => {
    const { error } = await lager.client.rpc('fahrzeug_speichern', { p_fahrzeug: { kennzeichen: 'w 111 a', aktiv: true } });
    expect(error?.message).toMatch(/schon angelegt/);
    // In einem anderen Betrieb darf es dasselbe Kennzeichen geben.
    const { error: anderswo } = await fremd.client.rpc('fahrzeug_speichern', { p_fahrzeug: { kennzeichen: 'W-111A', aktiv: true } });
    expect(anderswo).toBeNull();
  });

  it('pflegt nur, wer das Lager führt; der Standardfahrer kommt aus dem eigenen Betrieb', async () => {
    for (const k of [max, buch]) {
      const { error } = await k.client.rpc('fahrzeug_speichern', { p_fahrzeug: { kennzeichen: `W-${k.rolle.slice(0, 3)}9`, aktiv: true } });
      expect(error?.code, k.rolle).toBe('42501');
    }
    const { error } = await lager.client.rpc('fahrzeug_speichern', {
      p_fahrzeug: { kennzeichen: 'W-444D', standardfahrer_uid: fremd.uid, aktiv: true },
    });
    expect(error?.message).toMatch(/gibt es in diesem Betrieb nicht/);
  });

  it('niemand schreibt an den Funktionen vorbei — auch die Leitung nicht', async () => {
    const versuche = await Promise.all([
      chef.client.from('fahrzeuge').insert({ company_id: BETRIEB, kennzeichen: 'W-DIREKT' }),
      chef.client.from('lagerorte').insert({ company_id: BETRIEB, art: 'lager', bezeichnung: 'Direkt' }),
      chef.client.from('lagerbestaende').insert({ company_id: BETRIEB, lagerort_id: AUSSEN, material_id: await artikel(0), menge: 5 }),
      chef.client.from('befehle_vorgaenge').insert({ company_id: BETRIEB, vorgang: crypto.randomUUID(), befehl: 'x', nutzlast_hash: 'x' }),
      chef.client.from('lagerbestaende').update({ menge: 99 }).eq('lagerort_id', BUS),
    ]);
    for (const v of versuche) expect(v.error).not.toBeNull();
  });

  it('stilllegen nur ohne Bestand — sonst stünde Ware in keiner Liste', async () => {
    const { id, ort } = await fahrzeug(lager, 'W-555E');
    const m = await artikel(5);
    expect((await umlagern(lager, befehl(m, null, ort, 2, 5))).data.ergebnis).toBe('ausgefuehrt');
    const zu = await lager.client.rpc('fahrzeug_speichern', { p_fahrzeug: { id, kennzeichen: 'W-555E', aktiv: false } });
    expect(zu.error?.message).toMatch(/liegt noch Material/);
    expect((await umlagern(lager, befehl(m, ort, null, 2, 2))).data.ergebnis).toBe('ausgefuehrt');
    const jetzt = await lager.client.rpc('fahrzeug_speichern', { p_fahrzeug: { id, kennzeichen: 'W-555E', aktiv: false } });
    expect(jetzt.error).toBeNull();
    expect((await admin.from('lagerorte').select('aktiv').eq('id', ort).single()).data).toEqual({ aktiv: false });
    // Ein stillgelegter Ort nimmt nichts mehr an.
    const r = await umlagern(lager, befehl(m, null, ort, 1, 5));
    expect(r.error?.message).toMatch(/stillgelegt/);
  });

  it('weitere Lager: anlegen, das Hauptlager umbenennen, aber nicht stilllegen; ein Fahrzeuglager nur über sein Fahrzeug', async () => {
    const umbenannt = await lager.client.rpc('lagerort_speichern', { p_ort: { id: hauptId, bezeichnung: 'Zentrallager Nord', aktiv: true } });
    expect(umbenannt.error).toBeNull();
    const still = await lager.client.rpc('lagerort_speichern', { p_ort: { id: hauptId, bezeichnung: 'Zentrallager Nord', aktiv: false } });
    expect(still.error?.message).toMatch(/Hauptlager bleibt/);
    const bus = await lager.client.rpc('lagerort_speichern', { p_ort: { id: BUS, bezeichnung: 'Anders', aktiv: true } });
    expect(bus.error?.message).toMatch(/über sein Fahrzeug/);
    expect((await admin.from('lagerorte').select('anschrift').eq('id', AUSSEN).single()).data).toEqual({ anschrift: 'Liesinger Platz 1' });
  });

  it('Kennzeichen aus Buchungen: nur als Vorschlag, ohne Namen, ohne schon angelegte Fahrzeuge', async () => {
    await admin.from('time_entries').insert([
      { ...buchung(max, '2026-10-05'), vehicle_plate: 'WZ-4711B' },
      { ...buchung(max, '2026-10-06'), vehicle_plate: 'wz 4711b' },
      { ...buchung(tom, '2026-10-07'), vehicle_plate: 'W-111A' },
    ]);
    const { data, error } = await lager.client.rpc('kennzeichen_aus_buchungen');
    expect(error).toBeNull();
    expect(data).toEqual([{ kennzeichen: expect.stringMatching(/^WZ[- ]4711B$/), buchungen: 2, zuletzt: '2026-10-06' }]);
    // Nichts zugeordnet: die Buchungen bleiben, wie sie sind.
    const { data: b } = await admin.from('time_entries').select('vehicle_plate').eq('company_id', BETRIEB).order('date');
    expect((b ?? []).map((z) => z.vehicle_plate)).toEqual(['WZ-4711B', 'wz 4711b', 'W-111A']);
    expect((await max.client.rpc('kennzeichen_aus_buchungen')).error?.code).toBe('42501');
  });
});

/* -------------------------------------------------------------- Umlagern */

describe('Umlagern', () => {
  it('Hauptlager → Fahrzeug: mengenneutral, zwei Bewegungen mit Ort, Gegenort und Vorgang', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, BUS, 4, 10, { grund: 'für Baustelle Hauptstraße' });
    const { data, error } = await umlagern(lager, b);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      ergebnis: 'ausgefuehrt', vorgang: b.vorgang, artikel: m, von: null, nach: BUS, menge: 4,
      bestand_von: 6, bestand_nach: 4, revision_von: null, revision_nach: 1,
    });
    expect(await haupt(m)).toBe(6);
    expect(await amOrt(BUS, m)).toBe(4);
    // Beide Zeilen entstehen in einer Transaktion (gleiche Zeit) — geordnet nach der Menge.
    const um = (await bewegungen(m)).filter((x) => x.art === 'umlagerung').sort((x, y) => Number(x.menge) - Number(y.menge));
    expect(um).toEqual([
      expect.objectContaining({ menge: -4, lagerort_id: null, gegenort_id: BUS, vorgang: b.vorgang, bestand_nachher: 6,
        erfasst_von: lager.uid, grund: 'für Baustelle Hauptstraße', bezug: expect.stringMatching(/^Umlagerung .+ → Fahrzeug W-111A$/) }),
      expect.objectContaining({ menge: 4, lagerort_id: BUS, gegenort_id: null, vorgang: b.vorgang, bestand_nachher: 4,
        erfasst_von: lager.uid }),
    ]);
    await zahlenGleich(m);
  });

  it('Fahrzeug → Fahrzeug und Fahrzeug → Hauptlager, Kennung des Hauptlagers wie leer', async () => {
    const m = await artikel(10);
    await umlagern(lager, befehl(m, hauptId, BUS, 6, 10));
    const r = await umlagern(lager, befehl(m, BUS, TOM, 2, 6));
    expect(r.data).toMatchObject({ ergebnis: 'ausgefuehrt', bestand_von: 4, bestand_nach: 2 });
    const zurueck = await umlagern(chef, befehl(m, TOM, hauptId, 2, 2));
    expect(zurueck.data).toMatchObject({ ergebnis: 'ausgefuehrt', von: TOM, nach: null, bestand_von: 0, bestand_nach: 6 });
    expect([await haupt(m), await amOrt(BUS, m), await amOrt(TOM, m)]).toEqual([6, 4, 0]);
    await zahlenGleich(m);
  });

  it('kein Ort wird negativ — auch nicht „trotzdem“; nichts geschrieben', async () => {
    const m = await artikel(3);
    const vorher = (await bewegungen(m)).length;
    const r = await umlagern(lager, befehl(m, null, BUS, 5, 3, { trotz_fehlbestand: true }));
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ ergebnis: 'fehlbestand', bestand_von: 3, menge: 5 });
    expect(await haupt(m)).toBe(3);
    expect(await amOrt(BUS, m)).toBe(0);
    expect((await bewegungen(m)).length).toBe(vorher);
    // Und am Fahrzeug ebenso.
    const f = await umlagern(lager, befehl(m, BUS, null, 1, 0));
    expect(f.data.ergebnis).toBe('fehlbestand');
  });

  it('erwarteter Stand und Einheit: stimmt einer nicht, ist es „veraltet“ und nichts geschrieben', async () => {
    const m = await artikel(10);
    const alt = await umlagern(lager, befehl(m, null, BUS, 2, 9));
    expect(alt.data).toMatchObject({ ergebnis: 'veraltet', bestand_von: 10, einheit: 'Stk' });
    const meter = await umlagern(lager, befehl(m, null, BUS, 2, 10, { einheit: 'm' }));
    expect(meter.data).toMatchObject({ ergebnis: 'veraltet', einheit: 'Stk' });
    expect(await haupt(m)).toBe(10);
    expect((await bewegungen(m)).filter((x) => x.art === 'umlagerung')).toEqual([]);
  });

  it('Mengen je Einheit: Stück ganz, null und weniger nicht', async () => {
    const m = await artikel(10);
    expect((await umlagern(lager, befehl(m, null, BUS, 1.5, 10))).error?.message).toMatch(/ganze Stück/);
    expect((await umlagern(lager, befehl(m, null, BUS, 0, 10))).error?.message).toMatch(/größer als null/);
    expect((await umlagern(lager, befehl(m, BUS, BUS, 1, 0))).error?.message).toMatch(/derselbe Ort/);
  });

  it('Wiederholung: dieselbe Kennung mit denselben Daten liefert dasselbe Ergebnis — einmal gebucht', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, BUS, 3, 10);
    const eins = await umlagern(lager, b);
    const zwei = await umlagern(lager, { ...b });
    expect(zwei.error).toBeNull();
    expect(zwei.data).toEqual(eins.data);
    expect(await haupt(m)).toBe(7);
    expect((await bewegungen(m)).filter((x) => x.art === 'umlagerung')).toHaveLength(2);
    const { count } = await admin.from('befehle_vorgaenge').select('*', { count: 'exact', head: true }).eq('vorgang', b.vorgang);
    expect(count).toBe(1);
  });

  it('dieselbe Kennung mit anderem Inhalt ist ein Konflikt', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, BUS, 3, 10);
    await umlagern(lager, b);
    const anders = await umlagern(lager, { ...b, menge: 4 });
    expect(anders.error?.code).toBe('23505');
    expect(anders.error?.message).toMatch(/anderen Befehl/);
    expect(await haupt(m)).toBe(7);
  });

  it('auch ein „veraltet“ ist der Ausgang dieses Vorgangs — wiederholt kommt er wieder', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, BUS, 3, 8);
    expect((await umlagern(lager, b)).data.ergebnis).toBe('veraltet');
    expect((await umlagern(lager, b)).data.ergebnis).toBe('veraltet');
    expect(await haupt(m)).toBe(10);
  });

  it('der Stand eines Vorgangs: erledigt mit Ergebnis, sonst unbekannt — der Monteur sieht nur seine', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, BUS, 1, 10);
    const r = await umlagern(lager, b);
    const stand = await lager.client.rpc('befehl_stand', { p_vorgang: b.vorgang });
    expect(stand.data).toMatchObject({ stand: 'erledigt', befehl: 'umlagerung', ergebnis: r.data });
    expect((await lager.client.rpc('befehl_stand', { p_vorgang: crypto.randomUUID() })).data).toMatchObject({ stand: 'unbekannt' });
    expect((await max.client.rpc('befehl_stand', { p_vorgang: b.vorgang })).data).toMatchObject({ stand: 'unbekannt' });
    expect((await fremd.client.rpc('befehl_stand', { p_vorgang: b.vorgang })).data).toMatchObject({ stand: 'unbekannt' });
  });

  it('atomar: scheitert der zweite Schritt, bleibt keine Teilmenge — weder Bestand noch Bewegung noch Vorgang', async () => {
    const m = await artikel(10);
    const b = befehl(m, null, AUSSEN, 4, 10);
    await mitPg(async (db) => {
      await db.query(`create or replace function app.m04a_stoerer() returns trigger language plpgsql set search_path = '' as $$
        begin
          if new.lagerort_id = '${AUSSEN}'::uuid and new.material_id = '${m}'::uuid and new.menge > 0 then
            raise exception 'Störer: der zweite Schritt scheitert';
          end if;
          return new;
        end $$`);
      await db.query(`create trigger m04a_stoerer before insert or update on public.lagerbestaende
        for each row execute function app.m04a_stoerer()`);
    });
    try {
      const r = await umlagern(lager, b);
      expect(r.error?.message).toMatch(/Störer/);
    } finally {
      await mitPg(async (db) => {
        await db.query('drop trigger if exists m04a_stoerer on public.lagerbestaende');
        await db.query('drop function if exists app.m04a_stoerer()');
      });
    }
    // Der erste Schritt (Hauptlager −4) lief, bevor der zweite scheiterte — und ist mit zurückgerollt.
    expect(await haupt(m)).toBe(10);
    expect(await amOrt(AUSSEN, m)).toBe(0);
    expect((await bewegungen(m)).filter((x) => x.art === 'umlagerung')).toEqual([]);
    expect((await lager.client.rpc('befehl_stand', { p_vorgang: b.vorgang })).data.stand).toBe('unbekannt');
    // Unklarer Ausgang heißt hier: nichts geschrieben — derselbe Vorgang darf neu gesendet werden.
    expect((await umlagern(lager, b)).data.ergebnis).toBe('ausgefuehrt');
    await zahlenGleich(m);
  });

  it('zwei gleichzeitige Umlagerungen auf dieselbe Menge: genau eine gelingt', async () => {
    const m = await artikel(10);
    const [a, b] = await Promise.all([
      umlagern(lager, befehl(m, null, BUS, 8, 10)),
      umlagern(chef, befehl(m, null, TOM, 8, 10)),
    ]);
    expect([a.error, b.error]).toEqual([null, null]);
    const ergebnisse = [a.data.ergebnis, b.data.ergebnis].sort();
    expect(ergebnisse[0]).toBe('ausgefuehrt');
    expect(['fehlbestand', 'veraltet']).toContain(ergebnisse[1]);
    expect(await haupt(m)).toBe(2);
    expect((await amOrt(BUS, m)) + (await amOrt(TOM, m))).toBe(8);
    await zahlenGleich(m);
  });

  it('„im Lager führen“ lässt sich nicht abschalten, solange an einem Ort etwas liegt', async () => {
    const m = await artikel(5);
    await umlagern(lager, befehl(m, null, BUS, 5, 5));
    expect(await haupt(m)).toBe(0);
    const { error } = await lager.client.from('materials').update({ lagerartikel: false }).eq('id', m);
    expect(error?.message).toMatch(/liegt noch an einem weiteren Lagerort \(W-111A\)/);
  });
});

/* ---------------------------------------------------------------- Rechte */

describe('Rechte, fremder Betrieb, Support', () => {
  it('Monteur und Buchhaltung lagern nicht um', async () => {
    const m = await artikel(10);
    for (const k of [max, buch]) {
      expect((await umlagern(k, befehl(m, null, BUS, 1, 10))).error?.code, k.rolle).toBe('42501');
    }
    expect(await haupt(m)).toBe(10);
  });

  it('der Fahrer lagert aus SEINEM Fahrzeug ins Hauptlager zurück — nur wenn der Betrieb es erlaubt', async () => {
    const m = await artikel(10);
    await umlagern(lager, befehl(m, null, BUS, 5, 10));
    expect((await umlagern(max, befehl(m, BUS, null, 2, 5))).error?.code).toBe('42501');
    expect((await chef.client.from('companies').update({ lager_rueckgabe_fahrer: true }).eq('id', BETRIEB)).error).toBeNull();
    try {
      expect((await umlagern(max, befehl(m, BUS, null, 2, 5))).data.ergebnis).toBe('ausgefuehrt');
      // In ein anderes Fahrzeug nicht, aus einem fremden Fahrzeug nicht.
      expect((await umlagern(max, befehl(m, BUS, TOM, 1, 3))).error?.code).toBe('42501');
      expect((await umlagern(tom, befehl(m, BUS, null, 1, 3))).error?.code).toBe('42501');
    } finally {
      await chef.client.from('companies').update({ lager_rueckgabe_fahrer: false }).eq('id', BETRIEB);
    }
    // Die Erlaubnis setzt die Spitze, nicht die Verwaltung (`companies_aendern`).
    const v = await lager.client.from('companies').update({ lager_rueckgabe_fahrer: true }).eq('id', BETRIEB).select('id');
    expect(v.data ?? []).toEqual([]);
    await zahlenGleich(m);
  });

  it('fremder Betrieb: weder Artikel noch Ort eines anderen', async () => {
    const m = await artikel(10);
    const fremderArtikel = await fremd.client.rpc('umlagern', { p_befehl: befehl(m, null, fremdOrt, 1, 10) });
    expect(fremderArtikel.error).not.toBeNull();
    const fremderOrt = await umlagern(lager, befehl(m, null, fremdOrt, 1, 10));
    expect(fremderOrt.error?.message).toMatch(/gibt es in diesem Betrieb nicht/);
    expect(await haupt(m)).toBe(10);
    // Lesen: der fremde Betrieb sieht weder Orte noch Fahrzeuge noch Bestände von A.
    for (const t of ['lagerorte', 'fahrzeuge', 'lagerbestaende', 'befehle_vorgaenge']) {
      const { data } = await fremd.client.from(t).select('company_id').eq('company_id', BETRIEB);
      expect({ t, n: (data ?? []).length }).toEqual({ t, n: 0 });
    }
  });

  it('Support: mit „ansehen“ nur lesen, mit „mitarbeiten“ umlagern', async () => {
    const m = await artikel(10);
    const freigabe = async (stufe: 'ansehen' | 'mitarbeiten') => {
      await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
      await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
      const { data, error } = await chef.client.from('support_freigaben').insert({
        company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Lager prüfen',
        gilt_bis: new Date(Date.now() + 3_600_000).toISOString(), stufe,
      }).select('id').single();
      if (error) throw new Error(error.message);
      await einblickBeginnen(plattform, BETRIEB, (data as { id: string }).id);
    };
    await freigabe('ansehen');
    expect((await plattform.client.from('lagerorte').select('id').eq('company_id', BETRIEB)).data!.length).toBeGreaterThan(0);
    expect((await plattform.client.rpc('umlagern', { p_befehl: befehl(m, null, BUS, 1, 10) })).error?.code).toBe('42501');
    expect(await haupt(m)).toBe(10);
    await freigabe('mitarbeiten');
    expect((await plattform.client.rpc('umlagern', { p_befehl: befehl(m, null, BUS, 1, 10) })).data?.ergebnis).toBe('ausgefuehrt');
    expect(await haupt(m)).toBe(9);
  });

  it('Datenauskunft: Fahrzeuge als Standardfahrer und die Zahl der Befehle', async () => {
    const { data, error } = await chef.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: max.uid });
    expect(error).toBeNull();
    expect((data as { daten: Record<string, unknown> }).daten.fahrzeuge_als_standardfahrer)
      .toEqual([{ kennzeichen: 'W-111A', bezeichnung: null, aktiv: true }]);
    const v = await chef.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: lager.uid });
    const bearbeiter = (v.data as { als_bearbeiter: Record<string, number> }).als_bearbeiter;
    expect(bearbeiter.befehle_ausgefuehrt).toBeGreaterThan(5);
    // Wer umlagerte, steht an den Bewegungen — gezählt wie jede Bewegung.
    expect(bearbeiter.lagerbewegungen_erfasst).toBeGreaterThan(bearbeiter.befehle_ausgefuehrt);
  });
});

/* ------------------------------------------- Bestehende Wege ohne Ort */

describe('Erhaltung: jeder bestehende Weg ohne Ort bucht wie bisher ins Hauptlager', () => {
  it('Wareneingang', async () => {
    const m = await artikel(10);
    const { data, error } = await lager.client.rpc('lager_eingang', {
      p_material: m, p_menge: 12, p_lieferant: 'Frauenthal', p_lieferschein: 'LS-1', p_bezug: null,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(22);
    expect((await letzte(m))).toMatchObject({
      art: 'eingang', menge: 12, bestand_nachher: 22, lieferant: 'Frauenthal', lagerort_id: null, gegenort_id: null, vorgang: null,
    });
    await zahlenGleich(m);
  });

  it('Inventur', async () => {
    const m = await artikel(10);
    expect(Number((await lager.client.rpc('lager_inventur', { p_material: m, p_bestand: 8, p_grund: 'Bruch' })).data)).toBe(8);
    expect((await letzte(m))).toMatchObject({ art: 'inventur', menge: -2, bestand_nachher: 8, lagerort_id: null });
    await zahlenGleich(m);
  });

  it('Rüstliste: Eintrag ohne Ort, Abgang im Hauptlager, Zurücknehmen dorthin', async () => {
    const m = await artikel(20);
    await chef.client.rpc('ruestliste_speichern', {
      p_datum: heute, p_baustelle: 'PR-ERH', p_uids: [max.uid], p_von: 'Chef',
      p_positionen: [{ id: 'p1', position: 0, material_id: m, name: 'Rohr', menge: 8, einheit: 'Stk' }],
    });
    const r = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-ERH', p_position: 'p1', p_an: true, p_von: 'Max' });
    expect(Number(r.data)).toBe(8);
    expect(await haupt(m)).toBe(12);
    const { data: kopf } = await admin.from('einsatz_material').select('geladen').eq('company_id', BETRIEB).eq('project_number', 'PR-ERH').single();
    expect(Object.keys((kopf as { geladen: Record<string, object> }).geladen.p1).sort()).toEqual(['am', 'gebucht', 'material', 'von']);
    await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-ERH', p_position: 'p1', p_an: false, p_von: 'Max' });
    expect(await haupt(m)).toBe(20);
    await zahlenGleich(m);
  });

  it('Retoure „neu“ und Abholen einer Anforderung', async () => {
    const m = await artikel(10);
    const ret = await max.client.rpc('retoure_anlegen', { p_beleg: {
      id: crypto.randomUUID(), company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 3,
      condition: 'neu', user_id: max.uid, user_name: 'Max', project_number: 'PR-ERH',
    } });
    expect(ret.error).toBeNull();
    expect(await haupt(m)).toBe(13);
    expect((await admin.from('material_orders').select('lagerort_id').eq('id', ret.data).single()).data).toEqual({ lagerort_id: null });
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 4, status: 'Abholbereit',
      beschaffung: 'lager', transaction_type: 'order', user_id: max.uid, user_name: 'Max',
    });
    expect(Number((await lager.client.rpc('anforderung_abschliessen', { p_order: id, p_status: 'Abholbereit' })).data)).toBe(1);
    expect(await haupt(m)).toBe(9);
    expect((await admin.from('material_orders').select('lagerort_id, status').eq('id', id).single()).data)
      .toEqual({ lagerort_id: null, status: 'Erledigt' });
    await zahlenGleich(m);
  });

  it('Einkaufsliste „Geliefert“: Anforderung abholbereit, Bestand im Hauptlager, als Zusage reserviert', async () => {
    const m = await artikel(0);
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 5, status: 'In Bearbeitung',
      beschaffung: 'einkauf', bestellt_am: new Date().toISOString(), transaction_type: 'order', user_id: max.uid, user_name: 'Max',
    });
    expect(Number((await lager.client.rpc('einkauf_geliefert', { p_ids: [id] })).data)).toBe(1);
    expect(await haupt(m)).toBe(5);
    const { data: frei } = await lager.client.rpc('lager_frei', { p_ids: [m] });
    expect(frei).toEqual([{ material_id: m, bestand: 5, zugesagt: 5, geplant: 0, frei: 0 }]);
    expect((await admin.from('material_orders').select('lagerort_id, status').eq('id', id).single()).data)
      .toEqual({ lagerort_id: null, status: 'Abholbereit' });
  });

  it('der Rechnungsvorschlag ändert sich durch eine Umlagerung nicht — sie ist kein Verbrauch', async () => {
    const m = await artikel(20);
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 2, status: 'Erledigt', processed: true,
      transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: 'PR-RV',
    });
    const vorher = await buch.client.rpc('ausgegebenes_material', { p_baustelle: 'PR-RV' });
    expect(vorher.error).toBeNull();
    expect((await umlagern(lager, befehl(m, null, BUS, 10, 20))).data.ergebnis).toBe('ausgefuehrt');
    expect((await umlagern(lager, befehl(m, BUS, TOM, 5, 10))).data.ergebnis).toBe('ausgefuehrt');
    const nachher = await buch.client.rpc('ausgegebenes_material', { p_baustelle: 'PR-RV' });
    expect(nachher.data).toEqual(vorher.data);
  });
});

/* ------------------------------------------------------- Wege mit Ort */

describe('Die bestehenden Wege mit Ort', () => {
  it('Wareneingang an einen weiteren Ort: dort, nicht im Hauptlager', async () => {
    const m = await artikel(10);
    const { data, error } = await lager.client.rpc('lager_eingang', {
      p_material: m, p_menge: 7, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null, p_ort: AUSSEN,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(7);
    expect([await haupt(m), await amOrt(AUSSEN, m)]).toEqual([10, 7]);
    expect((await letzte(m))).toMatchObject({ art: 'eingang', lagerort_id: AUSSEN, lieferant: 'Frauenthal', bestand_nachher: 7 });
    // Ein Wareneingang an einen fremden Ort scheitert.
    expect((await lager.client.rpc('lager_eingang', {
      p_material: m, p_menge: 1, p_lieferant: 'X', p_lieferschein: null, p_bezug: null, p_ort: fremdOrt,
    })).error).not.toBeNull();
    await zahlenGleich(m);
  });

  it('Inventur je Ort: der Eröffnungsbestand entsteht durch eine Zählung; bestätigt steht mit null im Protokoll', async () => {
    const m = await artikel(10);
    expect(await amOrt(TOM, m)).toBe(0);
    expect(Number((await lager.client.rpc('lager_inventur', { p_material: m, p_bestand: 4, p_grund: 'Eröffnung Bus', p_ort: TOM })).data)).toBe(4);
    expect((await letzte(m))).toMatchObject({ art: 'inventur', menge: 4, lagerort_id: TOM, grund: 'Eröffnung Bus' });
    expect(Number((await lager.client.rpc('lager_inventur', { p_material: m, p_bestand: 4, p_grund: 'Kontrolle', p_ort: TOM })).data)).toBe(4);
    expect((await letzte(m))).toMatchObject({ art: 'inventur', menge: 0, lagerort_id: TOM, bestand_nachher: 4 });
    expect(await haupt(m)).toBe(10);
    // Ohne Grund keine Korrektur — auch am Ort; und der Monteur zählt nicht.
    expect((await lager.client.rpc('lager_inventur', { p_material: m, p_bestand: 2, p_grund: '', p_ort: TOM })).error?.message).toMatch(/Ohne Grund/);
    expect((await max.client.rpc('lager_inventur', { p_material: m, p_bestand: 2, p_grund: 'x', p_ort: BUS })).error?.code).toBe('42501');
    await zahlenGleich(m);
  });

  it('Rüstliste aus dem Fahrzeug: bucht dort, merkt sich den Ort, nimmt dorthin zurück — Hauptlager unberührt', async () => {
    const m = await artikel(20);
    await umlagern(lager, befehl(m, null, BUS, 10, 20));
    await chef.client.rpc('ruestliste_speichern', {
      p_datum: heute, p_baustelle: 'PR-FZ', p_uids: [max.uid], p_von: 'Chef',
      p_positionen: [
        { id: 'p1', position: 0, material_id: m, name: 'Rohr', menge: 6, einheit: 'Stk' },
        { id: 'p2', position: 1, material_id: m, name: 'Rohr', menge: 8, einheit: 'Stk' },
      ],
    });
    const r = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-FZ', p_position: 'p1', p_an: true, p_von: 'Max', p_ort: BUS });
    expect(r.error).toBeNull();
    expect(Number(r.data)).toBe(6);
    expect([await haupt(m), await amOrt(BUS, m)]).toEqual([10, 4]);
    const { data: kopf } = await admin.from('einsatz_material').select('geladen').eq('company_id', BETRIEB).eq('project_number', 'PR-FZ').single();
    expect((kopf as { geladen: Record<string, Record<string, unknown>> }).geladen.p1).toMatchObject({ gebucht: 6, material: m, ort: BUS });
    // Im Fahrzeug liegen nur noch 4: gebucht wird, was da ist — wie im Hauptlager.
    expect(Number((await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-FZ', p_position: 'p2', p_an: true, p_von: 'Max', p_ort: BUS })).data)).toBe(4);
    expect(await amOrt(BUS, m)).toBe(0);
    // Zurücknehmen bucht in das Fahrzeug zurück.
    await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-FZ', p_position: 'p1', p_an: false, p_von: 'Max' });
    expect([await haupt(m), await amOrt(BUS, m)]).toEqual([10, 6]);
    await zahlenGleich(m);
  });

  it('Rüstliste: aus Toms Fahrzeug hakt Max nicht ab, solange Tom nicht eingeteilt ist; aus dem Poolfahrzeug schon', async () => {
    const m = await artikel(20);
    await umlagern(lager, befehl(m, null, TOM, 5, 20));
    await umlagern(lager, befehl(m, null, POOL, 5, 15));
    await chef.client.rpc('ruestliste_speichern', {
      p_datum: heute, p_baustelle: 'PR-POOL', p_uids: [max.uid], p_von: 'Chef',
      p_positionen: [{ id: 'p1', position: 0, material_id: m, name: 'Rohr', menge: 2, einheit: 'Stk' }],
    });
    const fremdesFz = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-POOL', p_position: 'p1', p_an: true, p_von: 'Max', p_ort: TOM });
    expect(fremdesFz.error?.code).toBe('42501');
    const aussen = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-POOL', p_position: 'p1', p_an: true, p_von: 'Max', p_ort: AUSSEN });
    expect(aussen.error?.message).toMatch(/Hauptlager oder aus einem Fahrzeug/);
    const pool = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-POOL', p_position: 'p1', p_an: true, p_von: 'Max', p_ort: POOL });
    expect(Number(pool.data)).toBe(2);
    expect(await amOrt(POOL, m)).toBe(3);
  });

  it('der Rechnungsvorschlag zählt das Abhaken aus dem Fahrzeug wie aus dem Hauptlager', async () => {
    const { data } = await buch.client.rpc('ausgegebenes_material', { p_baustelle: 'PR-FZ' });
    const zeilen = (data ?? []) as { art: string; beleg_id: string; menge: number }[];
    // p1 wurde zurückgenommen, p2 ist eingeladen — aus dem Fahrzeug.
    expect(zeilen.map((z) => [z.art, z.beleg_id, Number(z.menge)])).toEqual([['ruestliste', 'p2', 8]]);
  });

  it('Retoure ins Fahrzeug: der Fahrer in sein eigenes, das Lager in jedes; „gebraucht“ bucht nichts', async () => {
    const m = await artikel(0, 'Stk');
    const beleg = (k: Konto, ort: string, zustand = 'neu') => ({
      id: crypto.randomUUID(), company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 2,
      condition: zustand, user_id: k.uid, user_name: 'X', project_number: 'PR-RET', lagerort_id: ort,
    });
    const eigen = await max.client.rpc('retoure_anlegen', { p_beleg: beleg(max, BUS) });
    expect(eigen.error).toBeNull();
    expect([await haupt(m), await amOrt(BUS, m)]).toEqual([0, 2]);
    expect((await admin.from('material_orders').select('lagerort_id').eq('id', eigen.data).single()).data).toEqual({ lagerort_id: BUS });
    expect((await max.client.rpc('retoure_anlegen', { p_beleg: beleg(max, TOM) })).error?.code).toBe('42501');
    expect((await lager.client.rpc('retoure_anlegen', { p_beleg: beleg(lager, TOM) })).error).toBeNull();
    expect(await amOrt(TOM, m)).toBe(2);
    expect((await max.client.rpc('retoure_anlegen', { p_beleg: beleg(max, BUS, 'gebraucht') })).error).toBeNull();
    expect(await amOrt(BUS, m)).toBe(2);
    await zahlenGleich(m);
  });

  it('Abholen aus einem Ort: dort abgebucht, und die Anforderung trägt ihn', async () => {
    const m = await artikel(10);
    await umlagern(lager, befehl(m, null, BUS, 6, 10));
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 4, status: 'Abholbereit',
      beschaffung: 'lager', transaction_type: 'order', user_id: max.uid, user_name: 'Max',
    });
    // Der Besteller selbst nur aus seinem eigenen Fahrzeug.
    expect((await max.client.rpc('anforderung_abschliessen', { p_order: id, p_status: 'Abholbereit', p_ort: TOM })).error?.code).toBe('42501');
    expect(Number((await max.client.rpc('anforderung_abschliessen', { p_order: id, p_status: 'Abholbereit', p_ort: BUS })).data)).toBe(1);
    expect([await haupt(m), await amOrt(BUS, m)]).toEqual([4, 2]);
    expect((await admin.from('material_orders').select('lagerort_id').eq('id', id).single()).data).toEqual({ lagerort_id: BUS });
    await zahlenGleich(m);
  });

  it('Einkaufsliste an ein Außenlager: dort eingebucht, nicht gegen das Hauptlager reserviert, beim Abholen von dort', async () => {
    const m = await artikel(3);
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: m, material_name: 'Rohr', quantity: 5, status: 'In Bearbeitung',
      beschaffung: 'einkauf', bestellt_am: new Date().toISOString(), transaction_type: 'order', user_id: max.uid, user_name: 'Max',
    });
    const { data: posten } = await lager.client.from('einkauf_posten').insert({
      company_id: BETRIEB, material_id: m, material_name: 'Rohr', menge: 2, bestellt_am: new Date().toISOString(),
    }).select('id').single();
    expect(Number((await lager.client.rpc('einkauf_geliefert', { p_ids: [id, (posten as { id: string }).id], p_ort: AUSSEN })).data)).toBe(2);
    expect([await haupt(m), await amOrt(AUSSEN, m)]).toEqual([3, 7]);
    expect((await admin.from('material_orders').select('lagerort_id, status').eq('id', id).single()).data)
      .toEqual({ lagerort_id: AUSSEN, status: 'Abholbereit' });
    // Die Ware liegt im Außenlager — das Freie des Hauptlagers rechnet ohne sie.
    expect((await lager.client.rpc('lager_frei', { p_ids: [m] })).data).toEqual([{ material_id: m, bestand: 3, zugesagt: 0, geplant: 0, frei: 3 }]);
    // Abgeholt ohne Angabe: von dort, wohin geliefert wurde.
    expect(Number((await lager.client.rpc('anforderung_abschliessen', { p_order: id, p_status: 'Abholbereit' })).data)).toBe(1);
    expect([await haupt(m), await amOrt(AUSSEN, m)]).toEqual([3, 2]);
    await zahlenGleich(m);
  });

  it('den Ort einer Anforderung setzt nur die Datenbank', async () => {
    const id = crypto.randomUUID();
    // Der Monteur legt seine eigene Anforderung an — der mitgeschickte Ort bleibt leer.
    const neu = await max.client.from('material_orders').insert({
      id, company_id: BETRIEB, material_name: 'Rohr', quantity: 1, status: 'Offen', transaction_type: 'order',
      user_id: max.uid, user_name: 'Max', lagerort_id: BUS,
    });
    expect(neu.error).toBeNull();
    expect((await admin.from('material_orders').select('lagerort_id').eq('id', id).single()).data).toEqual({ lagerort_id: null });
    const aendern = await lager.client.from('material_orders').update({ lagerort_id: BUS }).eq('id', id);
    expect(aendern.error?.message).toMatch(/setzt nur die Datenbank/);
  });

  it('Retoure ins Fahrzeug eines Katalogartikels macht ihn zum Lagerartikel', async () => {
    const { data } = await lager.client.from('materials')
      .insert({ company_id: BETRIEB, name: `Katalog ${crypto.randomUUID().slice(0, 6)}`, unit: 'Stk', stock: 0, lagerartikel: false })
      .select('id').single();
    const m = (data as { id: string }).id;
    const r = await max.client.rpc('retoure_anlegen', { p_beleg: {
      id: crypto.randomUUID(), company_id: BETRIEB, material_id: m, material_name: 'Katalog', quantity: 1,
      condition: 'neu', user_id: max.uid, user_name: 'Max', lagerort_id: BUS,
    } });
    expect(r.error).toBeNull();
    expect((await admin.from('materials').select('lagerartikel').eq('id', m).single()).data).toEqual({ lagerartikel: true });
  });
});

/* -------------------------------------------------------------- Modul aus */

/*
  V3: Der Server prüft das Modul bei NEUEN Fachbefehlen über
  `app.modul_aktiv` — die Hilfsfunktion kommt mit einem anderen Paket. Bis sie
  eingespielt ist, laufen diese Fälle nicht (sie wären rot, ohne dass etwas
  falsch wäre); danach prüfen sie, dass mit „Lagerorte und Fahrzeuglager“ aus
  kein weiterer Ort mehr bebucht wird — und die Bestände bleiben.
*/
const modulDa = await mitPg(async (db) =>
  (await db.query(`select to_regprocedure('app.modul_aktiv(text)') is not null as da`)).rows[0].da as boolean);

describe.runIf(modulDa)('Modul aus: nur das Hauptlager', () => {
  it('kein Befehl an einen weiteren Ort; die Bestände bleiben; das Hauptlager bucht wie bisher', async () => {
    const m = await artikel(10);
    await umlagern(lager, befehl(m, null, BUS, 4, 10));
    await admin.from('companies').update({ modules: { 'material.lagerorte_fahrzeuglager': false } }).eq('id', BETRIEB);
    try {
      expect((await umlagern(lager, befehl(m, null, BUS, 1, 6))).error).not.toBeNull();
      expect((await lager.client.rpc('lager_eingang', { p_material: m, p_menge: 1, p_lieferant: 'X', p_lieferschein: null, p_bezug: null, p_ort: BUS })).error).not.toBeNull();
      expect((await lager.client.rpc('lager_inventur', { p_material: m, p_bestand: 1, p_grund: 'x', p_ort: BUS })).error).not.toBeNull();
      expect((await lager.client.rpc('fahrzeug_speichern', { p_fahrzeug: { kennzeichen: 'W-MODUL', aktiv: true } })).error).not.toBeNull();
      expect([await haupt(m), await amOrt(BUS, m)]).toEqual([6, 4]);
      // Ohne Ort wie bisher.
      expect((await lager.client.rpc('lager_eingang', { p_material: m, p_menge: 1, p_lieferant: 'X', p_lieferschein: null, p_bezug: null })).error).toBeNull();
      expect(await haupt(m)).toBe(7);
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
  });
});

/* ---------------------------------------------------------------- Messung */

describe('Messung: 10.000 Artikel, 20 Orte', () => {
  const MESS = 'lagerorte-mess';
  let verw: Konto;
  let leitung: Konto;
  let monteur: Konto;
  const orte: string[] = [];
  let ziel = '';

  beforeAll(async () => {
    await betriebAnlegen(MESS, 'Messung GmbH');
    verw = await konto(MESS, 'Verwaltung', 'lomessv');
    leitung = await konto(MESS, 'Geschäftsführung', 'lomessg');
    monteur = await konto(MESS, 'Mitarbeiter', 'lomessm');
    const fz = await fahrzeug(verw, 'W-MESS1', monteur.uid);
    orte.push(fz.ort);
    for (let i = 0; i < 19; i += 1) {
      const { data } = await verw.client.rpc('lagerort_speichern', { p_ort: { art: 'lager', bezeichnung: `Lager ${i}`, aktiv: true } });
      orte.push(String(data));
    }
    // Der Bestand wird hier gesetzt, nicht gebucht: es geht um die Zeit des Buchens, nicht um das Protokoll davor.
    await mitPg(async (db) => {
      await db.query('begin');
      await db.query('set local session_replication_role = replica');
      await db.query(`insert into public.materials (id, company_id, name, unit, stock, lagerartikel)
        select gen_random_uuid(), $1, 'Messartikel ' || g, 'Stk', 100, true from generate_series(1, 10000) g`, [MESS]);
      await db.query(`insert into public.lagerbestaende (lagerort_id, material_id, company_id, menge, revision)
        select o, m.id, $1, 50, 1 from public.materials m, unnest($2::uuid[]) o where m.company_id = $1`, [MESS, orte]);
      await db.query('commit');
    });
    const { data } = await admin.from('materials').select('id').eq('company_id', MESS).limit(1).single();
    ziel = (data as { id: string }).id;
    await leitung.client.rpc('ruestliste_speichern', {
      p_datum: heute, p_baustelle: 'PR-MESS', p_uids: [monteur.uid], p_von: 'Verwaltung',
      p_positionen: [{ id: 'p1', position: 0, material_id: ziel, name: 'Messartikel', menge: 5, einheit: 'Stk' }],
    });
  }, 300_000);

  afterAll(async () => {
    await mitPg(async (db) => {
      await db.query('begin');
      await db.query('set local session_replication_role = replica');
      for (const t of ['lagerbewegungen', 'lagerbestaende', 'befehle_vorgaenge', 'einsatz_material_positionen', 'einsatz_material', 'materials']) {
        await db.query(`delete from public.${t} where company_id = $1`, [MESS]);
      }
      await db.query('commit');
    });
  }, 120_000);

  it('Umlagern und Abhaken aus dem Fahrzeug bleiben weit unter der Zeitgrenze (8 s)', async () => {
    const zeiten: Record<string, number> = {};
    let t = performance.now();
    const r1 = await umlagern(verw, befehl(ziel, null, orte[0], 10, 100));
    zeiten['Hauptlager → Fahrzeug'] = performance.now() - t;
    expect(r1.data?.ergebnis).toBe('ausgefuehrt');
    t = performance.now();
    const r2 = await umlagern(verw, befehl(ziel, orte[5], orte[0], 10, 50));
    zeiten['Lager → Fahrzeug'] = performance.now() - t;
    expect(r2.data?.ergebnis).toBe('ausgefuehrt');
    t = performance.now();
    const r3 = await monteur.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'PR-MESS', p_position: 'p1', p_an: true, p_von: 'M', p_ort: orte[0] });
    zeiten['Abhaken aus dem Fahrzeug'] = performance.now() - t;
    expect(Number(r3.data)).toBe(5);
    console.log('M04a Messung (ms):', JSON.stringify(Object.fromEntries(Object.entries(zeiten).map(([k, v]) => [k, Math.round(v)]))));
    for (const [was, ms] of Object.entries(zeiten)) expect(ms, was).toBeLessThan(8000);
  }, 60_000);
});
