/**
 * EINE MELDUNG ERREICHT NIE DEN, ÜBER DEN SIE IST (K1, Durchsicht 15.11.2026)
 * — gegen die echte Datenbank.
 *
 * Der Meldedialog verspricht: der Absender erfährt von der Meldung nichts.
 * Gehörte er zur Leitung, sah er sie bisher samt Melder und Grund, zählte sie
 * auf der Startseite, fand sie im Auszug und in der Datenauskunft und konnte
 * sie erledigen und löschen.
 *
 * Festgehalten wird, mit zwei Leitungen (Anna, Administrator; Berta,
 * Geschäftsführung) und einem Monteur (Max), der eine Nachricht von Anna
 * meldet:
 * - Anna: nichts in der Liste, Zahl 0, Erledigen und Löschen abgewiesen wie
 *   eine Kennung, die es nicht gibt, die Datei aus der Meldung nicht lesbar,
 *   nichts im Auszug, nichts in Datenauskunft und Löschbericht;
 * - Berta: alles wie bisher (Gegenprobe innerhalb des Tests);
 * - bleibt gleich: eine Meldung über den Monteur sehen beide Leitungen;
 * - „Erreicht die Meldung jemanden?“: ja, wenn es außer Absender und
 *   Aufrufer eine Leitung gibt; nein im Betrieb mit einer einzigen Leitung
 *   und wenn die einzige weitere Leitung selbst meldet; eine fremde Nachricht
 *   wird abgewiesen.
 *
 * Gegenprobe: ohne `20261115200000_meldung_nicht_an_gemeldete.sql` sieht und
 * zählt Anna die Meldung, erledigt und löscht sie, liest die Datei und findet
 * sie in Auszug und Auskunft; `nachricht_meldung_erreicht_jemanden` gibt es
 * nicht — jede Prüfung zu Anna und zur neuen Funktion ist rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';

const X = `meldung-x-${crypto.randomUUID().slice(0, 6)}`;
const Y = `meldung-y-${crypto.randomUUID().slice(0, 6)}`;

type Zeile = Record<string, unknown>;

let anna: Konto;
let berta: Konto;
let max: Konto;
let moritz: Konto;
let dora: Konto;
let emil: Konto;

async function rpc<T = unknown>(wer: Konto, f: string, p: Zeile = {}): Promise<T> {
  const { data, error } = await wer.client.rpc(f, p);
  if (error) throw Object.assign(new Error(`${f}: ${error.message}`), { code: error.code });
  return data as T;
}
async function fehler(wer: Konto, f: string, p: Zeile = {}): Promise<{ code?: string; message: string }> {
  const { error } = await wer.client.rpc(f, p);
  expect(error, `${f} hätte abgewiesen werden müssen`).not.toBeNull();
  return error!;
}
const senden = (wer: Konto, kanal: string, text: string, x: Zeile = {}) =>
  rpc<{ id: string }>(wer, 'nachricht_senden', { p_id: crypto.randomUUID(), p_kanal: kanal, p_text: text, ...x });

const meldungsKennungen = async (wer: Konto) =>
  (await rpc<Zeile[]>(wer, 'nachricht_meldungen', { p_status: null })).map((m) => m.id);
const imAuszug = async (wer: Konto) =>
  (((await rpc<{ data: Record<string, Zeile[]> }>(wer, 'betrieb_auszug')).data.nachricht_meldungen) ?? []).map((m) => m.id);
const inDerAuskunft = async (wer: Konto, person: string) =>
  (((await rpc<{ daten: Zeile }>(wer, 'person_auskunft', { p_art: 'mitarbeiter', p_id: person })).daten
    .nachrichten_meldungen as Zeile[]) ?? []);

beforeAll(async () => {
  await betriebAnlegen(X, 'Zwei Leitungen GmbH');
  await betriebAnlegen(Y, 'Eine Leitung e.U.');
  [anna, berta, max, moritz, dora, emil] = await Promise.all([
    konto(X, 'Administrator', 'mg-anna'),
    konto(X, 'Geschäftsführung', 'mg-berta'),
    konto(X, 'Mitarbeiter', 'mg-max'),
    konto(X, 'Mitarbeiter', 'mg-moritz'),
    konto(Y, 'Administrator', 'mg-dora'),
    konto(Y, 'Mitarbeiter', 'mg-emil'),
  ]);
}, 120_000);

describe('Max meldet eine Nachricht von Anna (Leitung)', () => {
  let kanal = '';
  let nachricht = '';
  let meldung = '';
  let pfad = '';

  beforeAll(async () => {
    kanal = await rpc<string>(anna, 'nachrichten_kanal_direkt', { p_mit: max.uid });
    nachricht = crypto.randomUUID();
    const anhang = crypto.randomUUID();
    pfad = `nachrichten/${X}/${kanal}/${nachricht}/${anhang}`;
    const hoch = await anna.client.storage.from('nachrichten-privat').upload(
      pfad, new Blob(['Bild'], { type: 'image/png' }), { contentType: 'image/png', upsert: true });
    expect(hoch.error).toBeNull();
    await rpc(anna, 'nachricht_senden', {
      p_id: nachricht, p_kanal: kanal, p_text: 'Grenzwertige Bemerkung', p_anhaenge: [{ id: anhang, name: 'x.png' }],
    });
    expect(await rpc<boolean>(max, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: nachricht })).toBe(true);
    meldung = await rpc<string>(max, 'nachricht_melden', { p_nachricht: nachricht, p_grund: 'Belästigung' });
  }, 60_000);

  it('Anna sieht die Meldung nicht und zählt sie nicht — Berta sieht sie mit Melder und Grund', async () => {
    expect(await meldungsKennungen(anna)).not.toContain(meldung);
    expect(await rpc<number>(anna, 'nachricht_meldungen_offen')).toBe(0);

    const beiBerta = (await rpc<Zeile[]>(berta, 'nachricht_meldungen', { p_status: null })).find((m) => m.id === meldung);
    expect(beiBerta).toMatchObject({
      von_uid: anna.uid, gemeldet_von: max.uid, grund: 'Belästigung', text_kopie: 'Grenzwertige Bemerkung', status: 'offen',
    });
    expect(await rpc<number>(berta, 'nachricht_meldungen_offen')).toBe(1);
  });

  it('nicht im Auszug „Alle Daten herunterladen“ und nicht in der Datenauskunft über Max — bei Berta schon', async () => {
    expect(await imAuszug(anna)).not.toContain(meldung);
    expect(await inDerAuskunft(anna, max.uid)).toEqual([]);
    expect(await imAuszug(berta)).toContain(meldung);
    expect(await inDerAuskunft(berta, max.uid)).toEqual([
      expect.objectContaining({ rolle: 'gemeldet', grund: 'Belästigung' }),
    ]);
  });

  it('nach dem Löschen ihrer Nachricht liest Anna die Datei aus der Meldung nicht mehr — Berta schon', async () => {
    await rpc(anna, 'nachricht_loeschen', { p_id: nachricht });
    expect((await anna.client.storage.from('nachrichten-privat').download(pfad)).error).not.toBeNull();
    expect((await berta.client.storage.from('nachrichten-privat').download(pfad)).error).toBeNull();
  });

  it('Anna erledigt und löscht nicht — dieselbe Antwort wie für eine Kennung, die es nicht gibt', async () => {
    const unbekannt = crypto.randomUUID();
    const erledigen = await fehler(anna, 'nachricht_meldung_erledigen', { p_meldung: meldung, p_vermerk: 'weg damit' });
    const erledigenUnbekannt = await fehler(anna, 'nachricht_meldung_erledigen', { p_meldung: unbekannt, p_vermerk: 'x' });
    expect(erledigen.code).toBe('P0002');
    expect(erledigen).toMatchObject({ code: erledigenUnbekannt.code, message: erledigenUnbekannt.message });

    await rpc(berta, 'nachricht_meldung_erledigen', { p_meldung: meldung, p_vermerk: 'Gespräch geführt' });
    const loeschen = await fehler(anna, 'nachricht_meldung_loeschen', { p_meldung: meldung });
    const loeschenUnbekannt = await fehler(anna, 'nachricht_meldung_loeschen', { p_meldung: unbekannt });
    expect(loeschen.code).toBe('55000');
    expect(loeschen).toMatchObject({ code: loeschenUnbekannt.code, message: loeschenUnbekannt.message });

    // Die Meldung steht danach unverändert bei Berta: erledigt von ihr, nicht gelöscht.
    const beiBerta = (await rpc<Zeile[]>(berta, 'nachricht_meldungen', { p_status: null })).find((m) => m.id === meldung);
    expect(beiBerta).toMatchObject({ status: 'erledigt', erledigt_von: berta.uid, vermerk: 'Gespräch geführt' });
    expect(await meldungsKennungen(anna)).not.toContain(meldung);
  });

  it('der Löschbericht über einen Melder nennt die Meldung bei Anna nicht, bei Berta schon', async () => {
    const geht = await konto(X, 'Mitarbeiter', 'mg-geht');
    const paar = await rpc<string>(anna, 'nachrichten_kanal_direkt', { p_mit: geht.uid });
    const { id } = await senden(anna, paar, 'Noch eine Bemerkung');
    await rpc(geht, 'nachricht_melden', { p_nachricht: id, p_grund: null });
    await deaktivieren(geht.uid);

    const gemeldete = (bericht: Zeile) =>
      (bericht.aufbewahren as Zeile[]).find((z) => z.was === 'Gemeldete Nachrichten');
    const beiAnna = await rpc<Zeile>(anna, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: true });
    const beiBerta = await rpc<Zeile>(berta, 'person_loeschen', { p_art: 'mitarbeiter', p_id: geht.uid, p_nur_pruefen: true });
    expect(gemeldete(beiAnna)).toBeUndefined();
    expect(gemeldete(beiBerta)).toMatchObject({ anzahl: 1 });
  });
});

describe('Bleibt gleich: eine Meldung über jemand anderen sieht die ganze Leitung', () => {
  it('Max meldet Moritz — Anna und Berta sehen und zählen sie, beide dürfen erledigen', async () => {
    const kanal = await rpc<string>(moritz, 'nachrichten_kanal_direkt', { p_mit: max.uid });
    const { id } = await senden(moritz, kanal, 'Vom Kollegen');
    const meldung = await rpc<string>(max, 'nachricht_melden', { p_nachricht: id, p_grund: 'Ton' });

    expect(await meldungsKennungen(anna)).toContain(meldung);
    expect(await meldungsKennungen(berta)).toContain(meldung);
    expect(await rpc<number>(anna, 'nachricht_meldungen_offen')).toBeGreaterThanOrEqual(1);
    expect(await imAuszug(anna)).toContain(meldung);
    expect(await inDerAuskunft(anna, moritz.uid)).toEqual([expect.objectContaining({ rolle: 'absender' })]);

    await rpc(anna, 'nachricht_meldung_erledigen', { p_meldung: meldung, p_vermerk: 'besprochen' });
    await rpc(anna, 'nachricht_meldung_loeschen', { p_meldung: meldung });
    expect(await meldungsKennungen(berta)).not.toContain(meldung);
  });
});

describe('Erreicht die Meldung jemanden?', () => {
  it('nein im Betrieb mit einer einzigen Leitung, wenn sie der Absender ist', async () => {
    const kanal = await rpc<string>(dora, 'nachrichten_kanal_direkt', { p_mit: emil.uid });
    const { id } = await senden(dora, kanal, 'Von der Chefin');
    expect(await rpc<boolean>(emil, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: id })).toBe(false);
  });

  it('nein, wenn die einzige Leitung selbst meldet — die Meldung läge nur bei ihr', async () => {
    const kanal = await rpc<string>(dora, 'nachrichten_kanal_direkt', { p_mit: emil.uid });
    const { id } = await senden(emil, kanal, 'Vom Monteur');
    expect(await rpc<boolean>(dora, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: id })).toBe(false);
  });

  it('nein, wenn Berta Anna meldet — außer den beiden gibt es keine Leitung', async () => {
    const kanal = await rpc<string>(anna, 'nachrichten_kanal_direkt', { p_mit: berta.uid });
    const { id } = await senden(anna, kanal, 'Unter Leitungen');
    expect(await rpc<boolean>(berta, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: id })).toBe(false);
  });

  it('eine Nachricht, die nicht an den Aufrufer ist, wird abgewiesen — die Antwort verrät nichts über sie', async () => {
    const kanal = await rpc<string>(anna, 'nachrichten_kanal_direkt', { p_mit: max.uid });
    const { id } = await senden(anna, kanal, 'Nur für Max');
    expect((await fehler(moritz, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: id })).code).toBe('42501');
    expect((await fehler(dora, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: id })).code).toBe('42501');
    expect((await fehler(moritz, 'nachricht_meldung_erreicht_jemanden', { p_nachricht: crypto.randomUUID() })).code).toBe('42501');
  });
});
