/**
 * FREIE ZEITFELDER (M06b, N01) — gegen die echte Datenbank.
 *
 * Geprüft wird der ganze Weg: Definition und Fassung, die Werte jedes Typs
 * mit der Buchung in einem Zug, Pflicht beim Buchen und „ergänzt das Büro“,
 * Umbenennen und Typwechsel, deaktivierte Optionen, eine offline
 * vorgemerkte Buchung mit älterer Fassung („Nachpflege“), das zweite
 * Zustellen derselben Vormerkung, verrechnet, Löschen, das Änderungsprotokoll,
 * `zeit_einfuegen`, Datenauskunft und Löschung einer Person, Rechte, fremder
 * Betrieb, Support und das abgeschaltete Modul.
 *
 * Gegenprobe: ohne die Migration `20261108200000_freie_zeitfelder.sql` gibt es
 * weder die Funktionen noch die Tabellen — jeder Fall hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, buchung, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { offeneAngaben, type ZeitfeldAnzeige } from '@/lib/zeitfelder';

const A = 'zeitfelder-a';
const B = 'zeitfelder-b';

let gf: Konto;
let ad: Konto;
let buch: Konto;
let pl: Konto;
let verw: Konto;
let monteur: Konto;
let kollege: Konto;
let fremd: Konto;
let plattform: Konto;

const OPT = {
  WIEN: '11111111-1111-4111-8111-111111111111',
  GRAZ: '22222222-2222-4222-8222-222222222222',
  LINZ: '33333333-3333-4333-8333-333333333333',
};
const F: Record<'K' | 'KM' | 'MAT' | 'HV' | 'AB', string> = { K: '', KM: '', MAT: '', HV: '', AB: '' };
let fassung = 0;

let tagNr = 0;
/** Jede Buchung an einem eigenen Tag — die Überschneidungsprüfung bleibt außen vor. */
function tag(): string {
  tagNr += 1;
  return new Date(Date.UTC(2099, 2, 1) + tagNr * 86_400_000).toISOString().slice(0, 10);
}

const ALLE_ROLLEN = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'];

async function speichern(wer: Konto, feld: Record<string, unknown>) {
  const { data, error } = await wer.client.rpc('zeitfeld_speichern', { p_feld: feld });
  return { r: data as { id: string; fassung: number | null } | null, fehler: error };
}

/** Eine gültige Auswahl für alle Felder (Pflicht beim Buchen ist die Kostenstelle). */
const gueltig = () => ({
  [F.K]: OPT.WIEN, [F.KM]: 12.5, [F.MAT]: true, [F.AB]: '2099-01-15',
});

async function buchen(wer: Konto, werte: Record<string, unknown>, rest: Record<string, unknown> = {}, nummer = fassung) {
  const zeile = { ...buchung(wer, tag()), ...rest, zeitfelder: { fassung: nummer, werte } };
  const { error } = await wer.client.from('time_entries').insert(zeile);
  return { id: zeile.id as string, fehler: error };
}

async function werte(eintrag: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from('zeitbuchung_feldwerte').select('feld_id, wert').eq('eintrag_id', eintrag);
  return Object.fromEntries((data ?? []).map((z) => [z.feld_id, z.wert]));
}

async function definitionen(): Promise<ZeitfeldAnzeige[]> {
  const { data } = await admin.from('zeitfeld_definitionen').select('id, name, typ, regeln, reihenfolge, aktiv').eq('company_id', A);
  return (data ?? []) as ZeitfeldAnzeige[];
}

async function satzVon(nummer: number) {
  const { data } = await admin.from('zeitfeld_fassungen').select('nummer, felder').eq('company_id', A).eq('nummer', nummer).single();
  return data as { nummer: number; felder: Record<string, never> };
}

beforeAll(async () => {
  await betriebAnlegen(A, 'Zeitfelder GmbH');
  await betriebAnlegen(B, 'Fremd GmbH');
  await admin.from('companies').update({ modules: {} }).eq('id', A);
  gf = await konto(A, 'Geschäftsführung', 'zfgf');
  ad = await konto(A, 'Administrator', 'zfad');
  buch = await konto(A, 'Buchhaltung', 'zfbuch');
  pl = await konto(A, 'Projektleiter', 'zfpl');
  verw = await konto(A, 'Verwaltung', 'zfverw');
  monteur = await konto(A, 'Mitarbeiter', 'zfmon');
  kollege = await konto(A, 'Mitarbeiter', 'zfkol');
  fremd = await konto(B, 'Geschäftsführung', 'zffremd');
  plattform = await plattformkonto('zfsupport');

  const kosten = await speichern(gf, {
    name: 'Kostenstelle', typ: 'auswahl', pflicht: 'beim_buchen', gilt_staende: ['Anwesend'], gilt_rollen: ALLE_ROLLEN,
    regeln: { optionen: [
      { id: OPT.WIEN, text: 'Wien', aktiv: true }, { id: OPT.GRAZ, text: 'Graz', aktiv: true }, { id: OPT.LINZ, text: 'Linz', aktiv: true },
    ] },
  });
  expect(kosten.fehler).toBeNull();
  F.K = kosten.r!.id;
  const km = await speichern(ad, {
    name: 'Kilometer Firmenauto', typ: 'zahl', regeln: { min: 0, max: 2000, stellen: 1, einheit: 'km' }, gilt_staende: ['Anwesend'],
  });
  expect(km.fehler).toBeNull();
  F.KM = km.r!.id;
  F.MAT = (await speichern(gf, { name: 'Material vom Kunden', typ: 'janein' })).r!.id;
  F.HV = (await speichern(gf, { name: 'Auftragsnummer HV', typ: 'text', regeln: { laenge: 20 }, pflicht: 'nur_buero' })).r!.id;
  const ab = await speichern(gf, { name: 'Datum der Abnahme', typ: 'datum' });
  F.AB = ab.r!.id;
  fassung = ab.r!.fassung!;
}, 180_000);

afterAll(async () => {
  await admin.from('companies').update({ modules: {} }).eq('id', A);
});

describe('Definition und Fassung', () => {
  it('jedes neue Feld veröffentlicht eine Fassung mit fortlaufender Nummer und Schnappschuss', async () => {
    expect(fassung).toBe(5);
    const s = await satzVon(fassung);
    expect(Object.keys(s.felder).sort()).toEqual(Object.values(F).sort());
    expect(s.felder[F.K]).toMatchObject({ typ: 'auswahl', pflicht: 'beim_buchen', staende: ['Anwesend'] });
  });

  it('umbenennen und umsortieren ergeben keine Fassung — Pflicht ändern schon', async () => {
    const umbenannt = await speichern(gf, {
      id: F.HV, name: 'Auftragsnr. Hausverwaltung', typ: 'text', regeln: { laenge: 20 }, pflicht: 'nur_buero', aktiv: true,
    });
    expect(umbenannt.fehler).toBeNull();
    expect(umbenannt.r!.fassung).toBe(fassung);
    expect((await gf.client.rpc('zeitfeld_reihenfolge', { p_ids: [F.KM, F.K, F.MAT, F.HV, F.AB] })).error).toBeNull();
    const { count } = await admin.from('zeitfeld_fassungen').select('*', { count: 'exact', head: true }).eq('company_id', A);
    expect(count).toBe(fassung);
    expect((await admin.from('zeitfeld_definitionen').select('reihenfolge').eq('id', F.KM).single()).data!.reihenfolge).toBe(1);
  });

  it('regeln werden geprüft wie in der App; ein Name gibt es aktiv nur einmal', async () => {
    const schlecht = await speichern(gf, { name: 'Leer', typ: 'auswahl', regeln: { optionen: [] } });
    expect(schlecht.fehler?.message).toBe('Eine Auswahl braucht mindestens eine Option');
    const doppelt = await speichern(gf, { name: 'kostenstelle ', typ: 'text' });
    expect(doppelt.fehler?.code).toBe('23505');
    const krank = await speichern(gf, { name: 'Diagnose', typ: 'text', gilt_staende: ['Krank'] });
    expect(krank.fehler?.message).toBe('Gilt für Anwesend, Zeitausgleich oder beide');
  });

  it('den Typ ändert speichern nicht — dafür gibt es den Typwechsel', async () => {
    const r = await speichern(gf, { id: F.AB, name: 'Datum der Abnahme', typ: 'text' });
    expect(r.fehler?.message).toMatch(/Typ ändern/);
  });
});

describe('Rechte', () => {
  it('Mitarbeiter, Verwaltung, Buchhaltung und Projektleitung definieren nicht — Geschäftsführung und Administration schon', async () => {
    for (const wer of [monteur, verw, buch, pl]) {
      const r = await speichern(wer, { name: `Versuch ${wer.rolle}`, typ: 'text' });
      expect({ rolle: wer.rolle, code: r.fehler?.code }).toEqual({ rolle: wer.rolle, code: '42501' });
      expect((await wer.client.rpc('zeitfeld_reihenfolge', { p_ids: [F.K] })).error?.code).toBe('42501');
    }
    expect((await speichern(ad, { id: F.MAT, name: 'Material vom Kunden', typ: 'janein' })).fehler).toBeNull();
  });

  it('niemand schreibt an den Funktionen vorbei', async () => {
    const def = await gf.client.from('zeitfeld_definitionen').insert({ company_id: A, name: 'Direkt', typ: 'text' });
    expect(def.error).not.toBeNull();
    const fas = await gf.client.from('zeitfeld_fassungen').insert({ company_id: A, nummer: 99, felder: {} });
    expect(fas.error).not.toBeNull();
    const b = await buchen(monteur, gueltig());
    expect(b.fehler).toBeNull();
    const wert = await buch.client.from('zeitbuchung_feldwerte')
      .update({ wert: 'x' }, { count: 'exact' }).eq('eintrag_id', b.id);
    expect(wert.count ?? 0).toBe(0);
    expect((await werte(b.id))[F.K]).toBe(OPT.WIEN);
  });

  it('ein fremder Betrieb ändert kein Feld und sieht keine Werte', async () => {
    const r = await speichern(fremd, { id: F.K, name: 'Gekapert', typ: 'auswahl', regeln: { optionen: [{ id: OPT.WIEN, text: 'W', aktiv: true }] } });
    expect(r.fehler?.code).toBe('P0002');
    expect((await fremd.client.from('zeitfeld_definitionen').select('id').eq('company_id', A)).data).toEqual([]);
    expect((await fremd.client.from('zeitbuchung_feldwerte').select('id').eq('company_id', A)).data).toEqual([]);
  });

  it('lesen: die Person und Buchhaltung/Spitze die Werte; Kollege und Projektleitung nicht; Definitionen jeder', async () => {
    const b = await buchen(monteur, gueltig());
    expect(b.fehler).toBeNull();
    const lies = async (wer: Konto) => (await wer.client.from('zeitbuchung_feldwerte').select('id').eq('eintrag_id', b.id)).data?.length ?? 0;
    expect(await lies(monteur)).toBe(4);
    expect(await lies(buch)).toBe(4);
    expect(await lies(gf)).toBe(4);
    expect(await lies(kollege)).toBe(0);
    expect(await lies(pl)).toBe(0);
    expect(await lies(verw)).toBe(0);
    expect(((await kollege.client.from('zeitfeld_definitionen').select('id').eq('company_id', A)).data ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('der Support liest die Definitionen, sieht keine Werte und definiert nicht — auch mit „mitarbeiten“', async () => {
    const b = await buchen(monteur, gueltig());
    const { data: freigabe } = await gf.client.from('support_freigaben').insert({
      company_id: A, gewaehrt_von: gf.uid, grund: 'Zeitfelder prüfen', stufe: 'mitarbeiten',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    try {
      await einblickBeginnen(plattform, A, freigabe!.id);
      expect(((await plattform.client.from('zeitfeld_definitionen').select('id').eq('company_id', A)).data ?? []).length).toBeGreaterThan(0);
      expect((await plattform.client.from('zeitbuchung_feldwerte').select('id').eq('eintrag_id', b.id)).data).toEqual([]);
      expect((await speichern(plattform, { name: 'Support', typ: 'text' })).fehler).not.toBeNull();
    } finally {
      await admin.from('support_freigaben').delete().eq('company_id', A);
    }
  });
});

describe('Werte mit der Buchung in einem Zug', () => {
  it('jeder Typ mit gültigem Wert — gespeichert mit der Fassung', async () => {
    const b = await buchen(monteur, { ...gueltig(), [F.HV]: '  HV-17 ' });
    expect(b.fehler).toBeNull();
    expect(await werte(b.id)).toEqual({
      [F.K]: OPT.WIEN, [F.KM]: 12.5, [F.MAT]: true, [F.AB]: '2099-01-15', [F.HV]: 'HV-17',
    });
    const { data } = await admin.from('zeitbuchung_feldwerte').select('fassung, user_id, typ').eq('eintrag_id', b.id);
    expect(new Set(data!.map((z) => z.fassung))).toEqual(new Set([fassung]));
    expect(new Set(data!.map((z) => z.user_id))).toEqual(new Set([monteur.uid]));
    // Der Durchgang ist nie gespeichert, die Fassung beim Eintreffen schon.
    const { data: zeile } = await admin.from('time_entries').select('zeitfelder, zeitfeld_fassung').eq('id', b.id).single();
    expect(zeile).toEqual({ zeitfelder: null, zeitfeld_fassung: fassung });
  });

  it.each([
    ['Zahl unter dem Minimum', 'KM', -1, 'Kilometer Firmenauto: Mindestens 0'],
    ['Zahl mit zu vielen Stellen', 'KM', 1.25, 'Kilometer Firmenauto: Höchstens 1 Nachkommastellen'],
    ['Zahl als Text', 'KM', 'zwölf', 'Kilometer Firmenauto: Bitte eine Zahl eingeben'],
    ['Ja/Nein als Text', 'MAT', 'ja', 'Material vom Kunden: Bitte Ja oder Nein wählen'],
    ['Text zu lang', 'HV', 'x'.repeat(21), 'Auftragsnr. Hausverwaltung: Höchstens 20 Zeichen'],
    ['Option unbekannt', 'K', '44444444-4444-4444-8444-444444444444', 'Kostenstelle: Diese Option gibt es nicht'],
    ['Datum gibt es nicht', 'AB', '2099-02-30', 'Datum der Abnahme: Dieses Datum gibt es nicht'],
  ] as const)('%s: der Server lehnt ab, die Buchung entsteht nicht', async (_, feld, wert, meldung) => {
    const b = await buchen(monteur, { ...gueltig(), [F[feld]]: wert });
    expect(b.fehler?.code).toBe('22023');
    expect(b.fehler?.message).toBe(meldung);
    expect((await admin.from('time_entries').select('id').eq('id', b.id)).data).toEqual([]);
  });

  it('Pflicht beim Buchen: ohne Kostenstelle keine Buchung', async () => {
    const { [F.K]: _weg, ...ohne } = gueltig();
    void _weg;
    const b = await buchen(monteur, ohne);
    expect(b.fehler?.message).toBe('Bitte ausfüllen: Kostenstelle');
    expect((await admin.from('time_entries').select('id').eq('id', b.id)).data).toEqual([]);
  });

  it('gilt nicht für den Stand (Zeitausgleich bucht das Büro) — ein Wert dort wird abgelehnt, ohne fehlt nichts', async () => {
    // Für den Monteur gebucht: den eigenen Zeitausgleich bucht niemand selbst (Vier-Augen-Prinzip).
    const za = { status: 'Zeitausgleich', start_time: null, end_time: null, break_duration: 0, user_id: monteur.uid };
    const mitWert = await buchen(buch, { [F.KM]: 3 }, za);
    expect(mitWert.fehler?.message).toBe('„Kilometer Firmenauto“ gilt nicht für diese Buchung');
    const ohne = await buchen(buch, {}, za);
    expect(ohne.fehler).toBeNull();
  });

  it('nur für das Büro: der Monteur darf leer lassen, das Büro sieht „fehlt“ und ergänzt', async () => {
    const b = await buchen(monteur, gueltig());
    expect(b.fehler).toBeNull();
    const defs = await definitionen();
    const lesen = async () => {
      const { data: e } = await buch.client.from('time_entries').select('status, zeitfeld_fassung').eq('id', b.id).single();
      const satz = await satzVon(e!.zeitfeld_fassung as number);
      return offeneAngaben(satz, defs, e as never, 'Mitarbeiter', (await werte(b.id)) as never);
    };
    expect(await lesen()).toEqual({ fehlt: ['Auftragsnr. Hausverwaltung'], nachpflege: [] });
    const ergaenzt = await buch.client.from('time_entries')
      .update({ zeitfelder: { fassung, werte: { [F.HV]: 'HV-99' } } }).eq('id', b.id);
    expect(ergaenzt.error).toBeNull();
    expect(await lesen()).toEqual({ fehlt: [], nachpflege: [] });
    expect((await werte(b.id))[F.K]).toBe(OPT.WIEN);
  });

  it('eine Pflichtangabe lässt sich nicht entfernen', async () => {
    const b = await buchen(monteur, gueltig());
    const { error } = await monteur.client.from('time_entries').update({ zeitfelder: { fassung, werte: { [F.K]: null } } }).eq('id', b.id);
    expect(error?.message).toBe('Pflichtangabe bleibt: Kostenstelle');
    expect((await werte(b.id))[F.K]).toBe(OPT.WIEN);
  });

  it('ohne Durchgang (ältere App) entsteht die Buchung — was die Fassung verlangt, ist Nachpflege', async () => {
    const zeile = buchung(monteur, tag());
    expect((await monteur.client.from('time_entries').insert(zeile)).error).toBeNull();
    const { data: e } = await admin.from('time_entries').select('status, zeitfeld_fassung').eq('id', zeile.id).single();
    expect(e!.zeitfeld_fassung).toBe(fassung);
    expect(offeneAngaben(await satzVon(fassung), await definitionen(), e as never, 'Mitarbeiter', {}))
      .toEqual({ fehlt: ['Auftragsnr. Hausverwaltung'], nachpflege: ['Kostenstelle'] });
  });
});

describe('Umbenennen, Typwechsel, Option', () => {
  it('umbenennen behält die Werte', async () => {
    const b = await buchen(monteur, gueltig());
    expect((await speichern(gf, {
      id: F.MAT, name: 'Material gestellt', typ: 'janein', aktiv: true,
    })).fehler).toBeNull();
    expect((await werte(b.id))[F.MAT]).toBe(true);
    expect((await admin.from('zeitfeld_definitionen').select('name').eq('id', F.MAT).single()).data!.name).toBe('Material gestellt');
  });

  it('Typwechsel: ein neues Feld, das alte endet — seine Werte bleiben mit altem Namen und Typ lesbar', async () => {
    const b = await buchen(monteur, gueltig());
    const r = await gf.client.rpc('zeitfeld_typ_wechseln', {
      p_alt: F.AB, p_feld: { name: 'Datum der Abnahme', typ: 'text', regeln: { laenge: 30 } },
    });
    expect(r.error).toBeNull();
    const neu = (r.data as { id: string; fassung: number }).id;
    fassung = (r.data as { fassung: number }).fassung;
    const { data: alt } = await admin.from('zeitfeld_definitionen').select('aktiv, typ, name, ersetzt_durch').eq('id', F.AB).single();
    expect(alt).toEqual({ aktiv: false, typ: 'datum', name: 'Datum der Abnahme', ersetzt_durch: neu });
    expect((await werte(b.id))[F.AB]).toBe('2099-01-15');
    // Die neue Fassung kennt das alte Feld nicht mehr — ein Wert dafür wird abgelehnt.
    const s = await satzVon(fassung);
    expect(Object.keys(s.felder)).not.toContain(F.AB);
    const alterWert = await buchen(monteur, { ...gueltig() });
    expect(alterWert.fehler?.message).toMatch(/kein Feld \(mehr\)/);
    const { [F.AB]: _a, ...ohneAlt } = gueltig();
    void _a;
    expect((await buchen(monteur, { ...ohneAlt, [neu]: 'Mitte März' })).fehler).toBeNull();
    // Ein ersetztes Feld kommt nicht zurück.
    expect((await speichern(gf, { id: F.AB, name: 'Datum der Abnahme', typ: 'datum', aktiv: true })).fehler?.code).toBe('55000');
    F.AB = neu;
  });

  it('Option deaktivieren: alte Werte bleiben, neu gewählt wird sie nicht; entfernen nur, solange unbenutzt', async () => {
    const b = await buchen(monteur, { [F.K]: OPT.LINZ });
    expect(b.fehler).toBeNull();
    const ohneLinz = await speichern(gf, {
      id: F.K, name: 'Kostenstelle', typ: 'auswahl', pflicht: 'beim_buchen',
      regeln: { optionen: [{ id: OPT.WIEN, text: 'Wien', aktiv: true }, { id: OPT.GRAZ, text: 'Graz', aktiv: true }] },
    });
    expect(ohneLinz.fehler?.message).toBe('Die Option „Linz“ ist an Buchungen gewählt — deaktivieren statt entfernen');
    const deaktiviert = await speichern(gf, {
      id: F.K, name: 'Kostenstelle', typ: 'auswahl', pflicht: 'beim_buchen',
      regeln: { optionen: [
        { id: OPT.WIEN, text: 'Wien', aktiv: true }, { id: OPT.GRAZ, text: 'Graz', aktiv: true }, { id: OPT.LINZ, text: 'Linz', aktiv: false },
      ] },
    });
    expect(deaktiviert.fehler).toBeNull();
    expect(deaktiviert.r!.fassung).toBe(fassung + 1);
    fassung = deaktiviert.r!.fassung!;
    expect((await werte(b.id))[F.K]).toBe(OPT.LINZ);
    expect((await buchen(monteur, { [F.K]: OPT.LINZ })).fehler?.message).toBe('Kostenstelle: Diese Option ist nicht mehr wählbar');
    // Dieselbe Buchung mit ihrem alten Wert bleibt speicherbar.
    const gleich = await monteur.client.from('time_entries')
      .update({ comment: 'nachgetragen', zeitfelder: { fassung, werte: { [F.K]: OPT.LINZ } } }).eq('id', b.id);
    expect(gleich.error).toBeNull();
  });
});

describe('Offline vorgemerkt', () => {
  it('eine ältere Fassung wird nach IHRER Regel angenommen — was die neue verlangt, ist Nachpflege', async () => {
    const alt = fassung;
    const neuesFeld = await speichern(gf, { name: 'Baustellenbuch', typ: 'janein', pflicht: 'beim_buchen' });
    expect(neuesFeld.fehler).toBeNull();
    fassung = neuesFeld.r!.fassung!;
    expect(fassung).toBe(alt + 1);
    // Die Vormerkung von vorher kennt das neue Feld nicht und sendet nach (ignoreDuplicates wie das Ausgangsfach).
    const zeile = { ...buchung(monteur, tag()), zeitfelder: { fassung: alt, werte: { [F.K]: OPT.GRAZ } } };
    const erst = await monteur.client.from('time_entries').upsert(zeile, { onConflict: 'id', ignoreDuplicates: true });
    expect(erst.error).toBeNull();
    const { data: e } = await admin.from('time_entries').select('status, zeitfeld_fassung').eq('id', zeile.id).single();
    expect(e!.zeitfeld_fassung).toBe(fassung);
    expect((await admin.from('zeitbuchung_feldwerte').select('fassung').eq('eintrag_id', zeile.id)).data).toEqual([{ fassung: alt }]);
    expect(offeneAngaben(await satzVon(fassung), await definitionen(), e as never, 'Mitarbeiter', await werte(zeile.id) as never).nachpflege)
      .toEqual(['Baustellenbuch']);
    // Online mit der neuen Fassung geht dieselbe Buchung ohne das Feld nicht.
    expect((await buchen(monteur, { [F.K]: OPT.GRAZ })).fehler?.message).toBe('Bitte ausfüllen: Baustellenbuch');

    // Nachgepflegt — dann sendet das Fach dieselbe Vormerkung ein zweites Mal: nichts wird überschrieben.
    expect((await monteur.client.from('time_entries')
      .update({ zeitfelder: { fassung, werte: { [neuesFeld.r!.id]: true, [F.K]: OPT.WIEN } } }).eq('id', zeile.id)).error).toBeNull();
    const zweit = await monteur.client.from('time_entries').upsert(zeile, { onConflict: 'id', ignoreDuplicates: true });
    expect(zweit.error).toBeNull();
    expect(await werte(zeile.id)).toEqual({ [neuesFeld.r!.id]: true, [F.K]: OPT.WIEN });
    // Für die übrigen Fälle: das Feld wieder freiwillig.
    fassung = (await speichern(gf, { id: neuesFeld.r!.id, name: 'Baustellenbuch', typ: 'janein', pflicht: 'nie' })).r!.fassung!;
  });

  it('eine Fassung, die es nicht gibt, wird abgelehnt', async () => {
    expect((await buchen(monteur, gueltig(), {}, 999)).fehler?.message).toBe('Diese Fassung der freien Zeitfelder gibt es nicht');
  });
});

describe('Verrechnet, gelöscht, Verlauf, Einfügen', () => {
  it('eine verrechnete Buchung sperrt auch ihre Angaben', async () => {
    const b = await buchen(monteur, { [F.K]: OPT.WIEN });
    expect((await admin.from('time_entries').update({ is_billed: true, invoice_number: 'RE-ZF-1' }).eq('id', b.id)).error).toBeNull();
    const { error } = await buch.client.from('time_entries').update({ zeitfelder: { fassung, werte: { [F.KM]: 5 } } }).eq('id', b.id);
    expect(error?.code).toBe('42501');
    expect((await werte(b.id))[F.KM]).toBeUndefined();
  });

  it('der Verlauf zeigt Anlegen, Ändern und Löschen der Angaben — Name über die Kennung', async () => {
    const b = await buchen(monteur, { [F.K]: OPT.WIEN, [F.KM]: 10 });
    expect((await monteur.client.from('time_entries')
      .update({ zeitfelder: { fassung, werte: { [F.KM]: 20, [F.K]: OPT.WIEN } } }).eq('id', b.id)).error).toBeNull();
    // Ohne Änderung schreibt nichts.
    expect((await monteur.client.from('time_entries')
      .update({ zeitfelder: { fassung, werte: { [F.KM]: 20 } } }).eq('id', b.id)).error).toBeNull();
    expect((await monteur.client.from('time_entries').delete().eq('id', b.id)).error).toBeNull();
    const { data } = await admin.from('zeitbuchung_verlauf').select('art, aenderungen').eq('eintrag_id', b.id).order('am');
    expect(data!.map((z) => z.art)).toEqual(['angelegt', 'geaendert', 'geloescht']);
    expect(data![0].aenderungen).toMatchObject({ [`feld:${F.K}`]: OPT.WIEN, [`feld:${F.KM}`]: 10 });
    expect(data![1].aenderungen).toEqual({ [`feld:${F.KM}`]: { alt: 10, neu: 20 } });
    expect(data![2].aenderungen).toMatchObject({ [`feld:${F.KM}`]: 20 });
    expect(data![0].aenderungen).not.toHaveProperty('zeitfelder');
    expect(data![0].aenderungen).not.toHaveProperty('zeitfeld_fassung');
    // Gelöscht: die Werte gehen mit.
    expect(await werte(b.id)).toEqual({});
  });

  it('zeit_einfuegen nimmt die Angaben mit; der abgetrennte Rest bekommt keine', async () => {
    const t = tag();
    const erst = { ...buchung(monteur, t), project_number: 'ZF-1', zeitfelder: { fassung, werte: { [F.K]: OPT.WIEN, [F.KM]: 40 } } };
    expect((await monteur.client.from('time_entries').insert(erst)).error).toBeNull();
    const r = await monteur.client.rpc('zeit_einfuegen', { p_neu: {
      user_id: monteur.uid, date: t, start_time: '10:00', end_time: '12:00', project_number: 'ZF-2',
      zeitfelder: { fassung, werte: { [F.K]: OPT.GRAZ } },
    } });
    expect(r.error).toBeNull();
    const neu = (r.data as { neu: string }).neu;
    expect(await werte(neu)).toEqual({ [F.K]: OPT.GRAZ });
    expect(await werte(erst.id)).toEqual({ [F.K]: OPT.WIEN, [F.KM]: 40 });
    const { data: rest } = await admin.from('time_entries').select('id').eq('user_id', monteur.uid).eq('date', t)
      .neq('id', erst.id).neq('id', neu);
    expect(rest).toHaveLength(1);
    expect(await werte(rest![0].id)).toEqual({});
    // Ohne Pflichtangabe lehnt auch das Einfügen ab — und nichts ist gekürzt.
    const t2 = tag();
    const zwei = { ...buchung(monteur, t2), project_number: 'ZF-1', zeitfelder: { fassung, werte: { [F.K]: OPT.WIEN } } };
    expect((await monteur.client.from('time_entries').insert(zwei)).error).toBeNull();
    const ohne = await monteur.client.rpc('zeit_einfuegen', { p_neu: {
      user_id: monteur.uid, date: t2, start_time: '10:00', end_time: '12:00', project_number: 'ZF-2',
      zeitfelder: { fassung, werte: {} },
    } });
    expect(ohne.error?.message).toBe('Bitte ausfüllen: Kostenstelle');
    expect((await admin.from('time_entries').select('end_time').eq('id', zwei.id).single()).data!.end_time).toBe('16:00:00');
  });
});

describe('Datenschutz', () => {
  it('die Datenauskunft nennt die Angaben der Person mit Feldnamen und Optionstext; die Spitze als Bearbeiterin', async () => {
    const b = await buchen(monteur, { [F.K]: OPT.GRAZ, [F.KM]: 7 });
    expect(b.fehler).toBeNull();
    const fuerMonteur = await gf.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    expect(fuerMonteur.error).toBeNull();
    const angaben = (fuerMonteur.data as { daten: { zeitbuchungen_freie_angaben: { buchung: string; feld: string; wert: unknown }[] } })
      .daten.zeitbuchungen_freie_angaben.filter((z) => z.buchung === b.id);
    expect(angaben).toEqual(expect.arrayContaining([
      expect.objectContaining({ feld: 'Kostenstelle', wert: 'Graz' }),
      expect.objectContaining({ feld: 'Kilometer Firmenauto', wert: 7 }),
    ]));
    const fuerGf = await gf.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: gf.uid });
    const bearbeiter = (fuerGf.data as { als_bearbeiter: { zeitfeld_fassungen_veroeffentlicht: number } }).als_bearbeiter;
    expect(bearbeiter.zeitfeld_fassungen_veroeffentlicht).toBeGreaterThanOrEqual(4);
  });

  it('bei der Löschung einer Person bleiben die Angaben mit den Buchungen aufbewahrt', async () => {
    const weg = await konto(A, 'Mitarbeiter', 'zfweg');
    const b = await buchen(weg, { [F.K]: OPT.WIEN });
    expect(b.fehler).toBeNull();
    await admin.from('users').update({ active: false }).eq('id', weg.uid);
    const { data, error } = await gf.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: weg.uid, p_nur_pruefen: false });
    expect(error).toBeNull();
    expect((data as { aufbewahren: { was: string; anzahl: number }[] }).aufbewahren)
      .toEqual(expect.arrayContaining([expect.objectContaining({ was: 'Freie Angaben der Zeitbuchungen', anzahl: 1 })]));
    expect(await werte(b.id)).toEqual({ [F.K]: OPT.WIEN });
  });
});

describe('Modul aus (V3)', () => {
  it('abgeschaltet: kein Definieren, keine Werte — eine Buchung ohne Angaben geht, gespeicherte Werte bleiben', async () => {
    const vorher = await buchen(monteur, { [F.K]: OPT.WIEN });
    await admin.from('companies').update({ modules: { 'zeiterfassung.freie_zeitfelder': false } }).eq('id', A);
    try {
      expect((await speichern(gf, { name: 'Aus', typ: 'text' })).fehler?.code).toBe('55000');
      const mit = await buchen(monteur, { [F.K]: OPT.WIEN });
      expect(mit.fehler?.code).toBe('55000');
      const leer = await buchen(monteur, {});
      expect(leer.fehler).toBeNull();
      expect((await werte(vorher.id))[F.K]).toBe(OPT.WIEN);
    } finally {
      await admin.from('companies').update({ modules: {} }).eq('id', A);
    }
  });
});
