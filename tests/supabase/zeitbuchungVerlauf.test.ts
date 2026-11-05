/**
 * DAS ÄNDERUNGSPROTOKOLL DER ZEITBUCHUNGEN (E50, 05.11.2026) — gegen die
 * echte Datenbank.
 *
 * Festgehalten wird:
 * - Anlegen, Ändern und Löschen schreiben je eine Zeile: wer, wann, was; beim
 *   Ändern nur die geänderten Spalten mit alt und neu, ohne Zeitstempel und
 *   ohne das, was die Datenbank selbst rechnet;
 * - ein Speichern ohne Änderung schreibt nichts, der Dienstschlüssel (Rücklauf
 *   einer Sicherung, Löschen eines Betriebs) auch nicht;
 * - lesen dürfen die Person und Buchhaltung/Führung, kein Kollege, kein
 *   fremder Betrieb; schreiben, ändern, löschen darf es niemand;
 * - es steht in der Datenauskunft und bleibt bei der Löschung einer Person
 *   mit den Buchungen aufbewahrt.
 *
 * Gegenprobe: ohne `20261105100000_zeitbuchung_verlauf.sql` gibt es die
 * Tabelle nicht, und jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, buchung, deaktivieren, konto, type Konto } from './helfer';

const BETRIEB = 'verlauf-a';
const FREMD = 'verlauf-b';
let monteur: Konto;
let kollege: Konto;
let buero: Konto;
let chefin: Konto;
let fremder: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vl-monteur');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'vl-kollege');
  buero = await konto(BETRIEB, 'Buchhaltung', 'vl-buero');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'vl-chefin');
  fremder = await konto(FREMD, 'Geschäftsführung', 'vl-fremd');
}, 180_000);

async function verlauf(eintrag: string) {
  const { data, error } = await admin
    .from('zeitbuchung_verlauf').select('*').eq('eintrag_id', eintrag).order('am');
  if (error) throw error;
  return data ?? [];
}

describe('Das Protokoll schreibt mit', () => {
  it('Anlegen, Ändern (nur was sich ändert) und Löschen — mit wer und wann', async () => {
    const b = buchung(monteur, '2026-11-02', { start_time: '07:00', end_time: '15:00', comment: 'Bad' });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();

    // Das Büro korrigiert das Ende — mit dem Vermerk, wie die Maske ihn setzt.
    expect((await buero.client.from('time_entries')
      .update({ end_time: '14:00', last_edited_by: 'Büro', last_edited_by_uid: buero.uid })
      .eq('id', b.id)).error).toBeNull();

    // Ein Speichern ohne Änderung schreibt nichts.
    expect((await monteur.client.from('time_entries').update({ comment: 'Bad' }).eq('id', b.id)).error).toBeNull();

    expect((await monteur.client.from('time_entries').delete().eq('id', b.id)).error).toBeNull();

    const zeilen = await verlauf(b.id);
    expect(zeilen.map((z) => z.art)).toEqual(['angelegt', 'geaendert', 'geloescht']);
    const [angelegt, geaendert, geloescht] = zeilen;

    expect(angelegt.von_uid).toBe(monteur.uid);
    expect(angelegt.user_id).toBe(monteur.uid);
    expect(angelegt.datum).toBe('2026-11-02');
    expect(angelegt.aenderungen).toMatchObject({ start_time: '07:00:00', end_time: '15:00:00', comment: 'Bad' });
    expect(angelegt.aenderungen).not.toHaveProperty('updated_at');

    expect(geaendert.von_uid).toBe(buero.uid);
    expect(geaendert.von_name).toBeTruthy();
    // Nur das Ende — nicht der Vermerk, nicht die gerechneten Stunden, nicht der Zeitstempel.
    expect(geaendert.aenderungen).toEqual({ end_time: { alt: '15:00:00', neu: '14:00:00' } });

    expect(geloescht.von_uid).toBe(monteur.uid);
    expect(geloescht.aenderungen).toMatchObject({ end_time: '14:00:00', comment: 'Bad' });
  }, 60_000);
});

describe('Der Dienstschlüssel schreibt nicht mit', () => {
  /*
    Mit ihm spielt der Rücklauf eine Sicherung zurück — samt ihrem Protokoll.
    Schriebe der Trigger dabei mit, stünde jede Buchung zweimal als angelegt
    darin (`ruecklauf.test.ts` prüft den ganzen Weg).
  */
  it('Anlegen, Ändern und Löschen mit dem Dienstschlüssel hinterlassen keine Zeile', async () => {
    const b = buchung(monteur, '2026-11-01');
    expect((await admin.from('time_entries').insert(b)).error).toBeNull();
    expect((await admin.from('time_entries').update({ end_time: '12:00' }).eq('id', b.id)).error).toBeNull();
    expect((await admin.from('time_entries').delete().eq('id', b.id)).error).toBeNull();
    expect(await verlauf(b.id)).toEqual([]);
  }, 60_000);
});

describe('Wer das Protokoll sieht', () => {
  it('die Person und Buchhaltung/Führung, kein Kollege, kein fremder Betrieb', async () => {
    const b = buchung(monteur, '2026-11-03');
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();

    const sieht = async (k: Konto) =>
      ((await k.client.from('zeitbuchung_verlauf').select('id').eq('eintrag_id', b.id)).data ?? []).length;
    expect(await sieht(monteur)).toBe(1);
    expect(await sieht(buero)).toBe(1);
    expect(await sieht(chefin)).toBe(1);
    expect(await sieht(kollege)).toBe(0);
    expect(await sieht(fremder)).toBe(0);
  }, 60_000);

  it('niemand schreibt, ändert oder löscht darin — auch nicht die Führung', async () => {
    const b = buchung(monteur, '2026-11-04');
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    const [zeile] = await verlauf(b.id);

    const anlegen = await chefin.client.from('zeitbuchung_verlauf').insert({
      company_id: BETRIEB, eintrag_id: b.id, user_id: monteur.uid, datum: '2026-11-04', art: 'geaendert',
    });
    expect(anlegen.error).not.toBeNull();

    await chefin.client.from('zeitbuchung_verlauf').update({ von_name: 'Niemand' }).eq('id', zeile.id);
    await chefin.client.from('zeitbuchung_verlauf').delete().eq('id', zeile.id);
    await monteur.client.from('zeitbuchung_verlauf').delete().eq('id', zeile.id);
    const danach = await verlauf(b.id);
    expect(danach).toHaveLength(1);
    expect(danach[0].von_name).toBe(zeile.von_name);
  }, 60_000);
});

describe('Das Protokoll hält nichts fest', () => {
  it('ein Konto, dessen Buchungen gelöscht sind, lässt sich weiter entfernen — der Verlauf bleibt', async () => {
    const kurz = await konto(BETRIEB, 'Mitarbeiter', 'vl-kurz');
    const b = buchung(kurz, '2026-10-29');
    expect((await kurz.client.from('time_entries').insert(b)).error).toBeNull();
    expect((await kurz.client.from('time_entries').delete().eq('id', b.id)).error).toBeNull();

    const weg = await admin.auth.admin.deleteUser(kurz.uid);
    expect(weg.error).toBeNull();
    expect((await verlauf(b.id)).map((z) => z.art)).toEqual(['angelegt', 'geloescht']);
  }, 60_000);
});

describe('Datenauskunft und Löschung', () => {
  it('der Verlauf steht in der Auskunft der Person; als Bearbeiter die Anzahl', async () => {
    const b = buchung(monteur, '2026-11-05', { end_time: '15:00' });
    expect((await monteur.client.from('time_entries').insert(b)).error).toBeNull();
    expect((await buero.client.from('time_entries')
      .update({ end_time: '13:00', last_edited_by: 'Büro', last_edited_by_uid: buero.uid })
      .eq('id', b.id)).error).toBeNull();

    const fuerMonteur = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    expect(fuerMonteur.error).toBeNull();
    const daten = (fuerMonteur.data as { daten: { zeitbuchungen_verlauf: { buchung: string; art: string }[] } }).daten;
    expect(daten.zeitbuchungen_verlauf.filter((z) => z.buchung === b.id).map((z) => z.art))
      .toEqual(['angelegt', 'geaendert']);

    const fuerBuero = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buero.uid });
    expect(fuerBuero.error).toBeNull();
    const bearbeitet = (fuerBuero.data as { als_bearbeiter: { zeitbuchungen_verlauf_fuer_andere: number } }).als_bearbeiter;
    expect(bearbeitet.zeitbuchungen_verlauf_fuer_andere).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('bei der Löschung einer Person bleibt der Verlauf mit den Buchungen aufbewahrt', async () => {
    const weg = await konto(BETRIEB, 'Mitarbeiter', 'vl-weg');
    const b = buchung(weg, '2026-10-30');
    expect((await weg.client.from('time_entries').insert(b)).error).toBeNull();
    await deaktivieren(weg.uid);

    const antwort = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: weg.uid, p_nur_pruefen: false });
    expect(antwort.error).toBeNull();
    const aufbewahren = (antwort.data as { aufbewahren: { was: string; anzahl: number; grund: string }[] }).aufbewahren;
    const protokoll = aufbewahren.find((a) => a.was === 'Änderungsprotokoll der Zeitbuchungen');
    expect(protokoll?.anzahl).toBe(1);
    expect(protokoll?.grund).toMatch(/§ 132 BAO/);
    expect(await verlauf(b.id)).toHaveLength(1);
  }, 60_000);
});
