/**
 * Eine eigene Krankmeldung reicht höchstens 14 Tage zurück (offene Punkte A4).
 *
 * Die Daten liegen RELATIV ZU HEUTE — die Regel hängt am heutigen Tag, und
 * ein festes Datum wäre in drei Wochen auf der falschen Seite der Grenze.
 * Jeder Zeitraum ist eine ganze Woche: so liegt immer ein Arbeitstag darin,
 * auch in einer Woche mit Feiertagen.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'krank-rueck';

let monteur: Konto;
let buch: Konto;

/** Ein Tag relativ zu heute in Wien, als JJJJ-MM-TT. */
function tag(abstand: number): string {
  const heute = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vienna' }));
  heute.setDate(heute.getDate() + abstand);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${heute.getFullYear()}-${z(heute.getMonth() + 1)}-${z(heute.getDate())}`;
}

const krank = (k: Konto, a: { id?: string; user?: string; von: string; bis: string }) =>
  k.client.rpc('krankmeldung_speichern', {
    p_id: a.id ?? null, p_user: a.user ?? null, p_von: a.von, p_bis: a.bis, p_notiz: null,
  });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'krmon');
  buch = await konto(BETRIEB, 'Buchhaltung', 'krbuch');
}, 120_000);

describe('Selbst krank melden', () => {
  it('geht bis 14 Tage zurück', async () => {
    const { error } = await krank(monteur, { von: tag(-10), bis: tag(-4) });
    expect(error).toBeNull();
  });

  it('weiter zurück nicht — die Meldung sagt, ab wann und wer', async () => {
    const { error } = await krank(monteur, { von: tag(-30), bis: tag(-24) });
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/Selbst melden geht bis 14 Tage zurück .* trägt das Büro ein/);
  });
});

describe('Das Büro', () => {
  let alteMeldung: string;

  it('trägt auch eine weit zurückliegende Meldung für den Monteur ein', async () => {
    const { data, error } = await krank(buch, { user: monteur.uid, von: tag(-60), bis: tag(-54) });
    expect(error).toBeNull();
    alteMeldung = (data as { id: string }).id;
  });

  /*
    SEIT DEM TESTBERICHT VOM 30.09.2026 (H8): eine vom Büro erfasste Meldung
    sieht der Monteur nur an — verlängern, verschieben oder löschen tut das
    Büro. Hier stand bis dahin, dass er sie selbst verlängert (A4, 28.09.);
    die jüngere Entscheidung geht vor.
  */
  it('der Monteur verlängert diese Meldung nicht selbst — das Büro schon', async () => {
    const selbst = await krank(monteur, { id: alteMeldung, von: tag(-60), bis: tag(-50) });
    expect(selbst.error?.message).toMatch(/hat das Büro erfasst/);
    const buero = await krank(buch, { id: alteMeldung, von: tag(-60), bis: tag(-50) });
    expect(buero.error).toBeNull();
  });

  it('eine eigene, noch nicht begonnene Meldung lässt sich nicht weiter als 14 Tage zurückverlegen', async () => {
    const { data, error } = await krank(monteur, { von: tag(21), bis: tag(27) });
    expect(error).toBeNull();
    const zurueck = await krank(monteur, { id: (data as { id: string }).id, von: tag(-30), bis: tag(27) });
    expect(zurueck.error?.code).toBe('42501');
    expect(zurueck.error?.message).toMatch(/14 Tage zurück/);
  });
});
