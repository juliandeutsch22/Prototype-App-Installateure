import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';

/*
 * DIE STARTSEITE SELBST EINRICHTEN (E68) — `startseite_wahl`.
 *
 * - Jede Person liest und schreibt nur ihre eigene Wahl; auch die
 *   Geschäftsführung sieht nicht, wie jemand seine Startseite eingerichtet hat.
 * - Geschrieben wird nur über `startseite_speichern`, das die Form prüft.
 * - Die Wahl steht in der Datenauskunft und geht beim Löschen der Person.
 * - `user_prefs` bleibt unberührt: dort hätte das erste Speichern die
 *   Meldungen „Anforderungen“ still abgeschaltet (Spaltenvorgabe `false`).
 *
 * Gegenprobe: mit einer Leseregel ohne `user_id = auth.uid()` oder ohne die
 * Formprüfung ist je eine Prüfung rot.
 */
const A = 'startwahl-a';
let monteur: Konto;
let kollege: Konto;
let chefin: Konto;

beforeAll(async () => {
  await betriebAnlegen(A, 'Startseite A');
  monteur = await konto(A, 'Mitarbeiter', 'sw-monteur');
  kollege = await konto(A, 'Mitarbeiter', 'sw-kollege');
  chefin = await konto(A, 'Geschäftsführung', 'sw-chefin');
}, 60_000);

const lesen = async (k: Konto, uid = k.uid) =>
  (await k.client.from('startseite_wahl').select('wahl').eq('user_id', uid).maybeSingle()).data?.wahl ?? null;

describe('Speichern und Lesen', () => {
  it('die eigene Wahl — gespeichert, gelesen, überschrieben, auf die Vorgabe zurückgesetzt', async () => {
    expect(await lesen(monteur)).toBeNull();
    const wahl = { kennzahlen: ['urlaub', 'saldo'], aus: ['abholbereit', 'bereich-tag'] };
    expect((await monteur.client.rpc('startseite_speichern', { p_wahl: wahl })).error).toBeNull();
    expect(await lesen(monteur)).toEqual(wahl);
    expect((await monteur.client.rpc('startseite_speichern', { p_wahl: { kennzahlen: [] } })).error).toBeNull();
    expect(await lesen(monteur)).toEqual({ kennzahlen: [] });
    expect((await monteur.client.rpc('startseite_speichern', { p_wahl: {} })).error).toBeNull();
    expect(await lesen(monteur)).toEqual({});
  });

  it('fremde Wahl sieht niemand — auch nicht die Geschäftsführung', async () => {
    await kollege.client.rpc('startseite_speichern', { p_wahl: { aus: ['tage'] } });
    expect(await lesen(kollege)).toEqual({ aus: ['tage'] });
    expect(await lesen(monteur, kollege.uid)).toBeNull();
    expect(await lesen(chefin, kollege.uid)).toBeNull();
  });

  it('direkt schreiben geht nicht — nur über die Funktion', async () => {
    const r = await monteur.client.from('startseite_wahl').upsert({ user_id: monteur.uid, company_id: A, wahl: { aus: ['x'] } });
    expect(r.error).not.toBeNull();
  });

  it('die Form wird geprüft: Unbekanntes, zu viele, Doppelte, falsche Schlüssel', async () => {
    const abgelehnt = async (p_wahl: unknown) => {
      const r = await monteur.client.rpc('startseite_speichern', { p_wahl });
      expect(r.error?.code, JSON.stringify(p_wahl)).toBe('22023');
    };
    await abgelehnt({ kennzahlen: ['a', 'b', 'c', 'd', 'e'] });
    await abgelehnt({ kennzahlen: ['saldo', 'saldo'] });
    await abgelehnt({ kennzahlen: ['Saldo'] });
    await abgelehnt({ kennzahlen: [1] });
    await abgelehnt({ aus: 'tage' });
    await abgelehnt({ farbe: ['rot'] });
    await abgelehnt([]);
    await abgelehnt({ aus: Array.from({ length: 81 }, (_, i) => `t${i}`) });
  });

  it('gleich geblieben: die Meldungsvorgaben in `user_prefs` legt das Speichern nicht an', async () => {
    const neu = await konto(A, 'Mitarbeiter', 'sw-neu');
    expect((await neu.client.rpc('startseite_speichern', { p_wahl: { aus: ['tage'] } })).error).toBeNull();
    const { data } = await admin.from('user_prefs').select('user_id').eq('user_id', neu.uid);
    expect(data).toEqual([]);
  });
});

describe('Auskunft und Löschung einer Person', () => {
  it('die Wahl steht in der Datenauskunft und geht beim Löschen sofort', async () => {
    const weg = await konto(A, 'Mitarbeiter', 'sw-weg');
    await weg.client.rpc('startseite_speichern', { p_wahl: { kennzahlen: ['urlaub'] } });

    const auskunft = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: weg.uid });
    expect(auskunft.error).toBeNull();
    expect((auskunft.data as { daten: { startseite: unknown } }).daten.startseite).toEqual({ kennzahlen: ['urlaub'] });

    await deaktivieren(weg.uid);
    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: weg.uid });
    expect(probe.error).toBeNull();
    expect(JSON.stringify(probe.data)).toContain('"startseite":1');
    const antwort = await chefin.client.rpc('person_loeschen', { p_art: 'mitarbeiter', p_id: weg.uid, p_nur_pruefen: false });
    expect(antwort.error).toBeNull();
    const { data } = await admin.from('startseite_wahl').select('user_id').eq('user_id', weg.uid);
    expect(data).toEqual([]);
  }, 60_000);
});
