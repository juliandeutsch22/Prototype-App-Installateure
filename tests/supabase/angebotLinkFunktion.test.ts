/**
 * DIE EDGE FUNCTION `angebot-annahme` (M02a, A06) — gegen den laufenden
 * Stapel, ohne Anmeldung, wie der Browser des Kunden sie ruft.
 *
 * Festgehalten wird:
 * - die Form des Schlüssels, Methode, Größe und Rumpf werden vor der
 *   Datenbank geprüft; ein falscher Schlüssel bekommt genau dieselbe Antwort
 *   wie ein unbekannter, abgelaufener oder widerrufener — ohne Daten;
 * - Annahme und Ablehnung prüfen Name, Bestätigung und Unterschrift;
 * - das Rate-Limit je Link: nach `ANFRAGEN_JE_STUNDE` Anfragen „zu viele“,
 *   ohne weiter zu zählen; ein neues Fenster gilt wieder;
 * - die Grenzen aus `shared/angebotLink.ts` sind dieselben wie in SQL;
 * - die Datenschicht der Seite liest die Antwort zu einem Angebot.
 *
 * Gegenprobe: ohne die Function (`supabase/functions/angebot-annahme`)
 * antwortet die Adresse nicht so — jede Prüfung hier ist rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, API, betriebAnlegen, konto, nurStatus, type Konto } from './helfer';
import {
  ANFRAGE_MAX_BYTES, ANFRAGEN_JE_STUNDE, GRUND_MAX, NAME_MAX, UNTERSCHRIFT_MAX,
} from '@shared/angebotLink';
import { annahmeAnfrage } from '@/lib/db/pg/angebotAnnahme';

const FUNKTION = `${API}/functions/v1/angebot-annahme`;
const BETRIEB = 'angebotlink-fn';
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let chefin: Konto;
let lauf = 0;

async function angebot(): Promise<string> {
  lauf += 1;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-FN-${Date.now()}-${lauf}`, customer_name: 'Familie Funktion', address: 'Weg 2, 1020 Wien',
      quote_date: '2026-11-06', valid_until: '2099-01-01', vat_rate: 0.2, status: 'Versendet', kalkulierte_stunden: 2,
      subtotal_netto: 140, total_netto: 140, total_vat: 28, total_brutto: 168,
    },
    p_positionen: [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 70, netto: 140, ist_arbeitszeit: true }],
  });
  if (error) throw new Error(error.message);
  return String(data);
}

async function link(): Promise<{ id: string; schluessel: string; angebot: string }> {
  const id = await angebot();
  const { data, error } = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: id, p_abrechnung: 'Pauschal', p_praefix: 'FN' });
  if (error) throw new Error(error.message);
  return { ...(data as { id: string; schluessel: string }), angebot: id };
}

/** Wie der Browser: POST, JSON, kein Anmeldekopf. */
async function rufen(rumpf: unknown, init: RequestInit = {}) {
  const a = await fetch(FUNKTION, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rumpf), ...init,
  });
  return { status: a.status, text: await a.text(), kopf: a.headers };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Funktion GmbH');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'fn-chefin');
}, 60_000);

afterAll(async () => {
  await admin.from('angebot_links').delete().eq('company_id', BETRIEB);
});

describe('Vor der Datenbank', () => {
  it('ein falsch geformter Schlüssel bekommt dieselbe Antwort wie ein unbekannter, abgelaufener oder widerrufener', async () => {
    const falsch = await rufen({ aktion: 'abruf', schluessel: 'zu-kurz' });
    expect(falsch.status).toBe(404);
    expect(JSON.parse(falsch.text)).toEqual({ zustand: 'ungueltig' });
    const unbekannt = await rufen({ aktion: 'abruf', schluessel: 'B'.repeat(43) });

    const widerrufen = await link();
    await chefin.client.rpc('angebot_link_widerrufen', { p_link: widerrufen.id });
    const abgelaufen = await link();
    await admin.from('angebot_links').update({ gueltig_bis: '2020-01-01' }).eq('id', abgelaufen.id);

    for (const a of [
      unbekannt,
      await rufen({ aktion: 'abruf', schluessel: widerrufen.schluessel }),
      await rufen({ aktion: 'abruf', schluessel: abgelaufen.schluessel }),
      await rufen({ aktion: 'annehmen', schluessel: abgelaufen.schluessel, name: 'Max Muster', bestaetigt: true, unterschrift: BILD }),
      await rufen({ aktion: 'abruf', schluessel: `${widerrufen.schluessel.slice(0, 42)}#` }),
    ]) {
      expect([a.status, a.text]).toEqual([falsch.status, falsch.text]);
      expect(a.kopf.get('cache-control')).toBe('private, no-store');
    }
    expect((await admin.from('angebot_links').select('geoeffnet_anzahl').in('id', [widerrufen.id, abgelaufen.id])).data)
      .toEqual([{ geoeffnet_anzahl: 0 }, { geoeffnet_anzahl: 0 }]);
  });

  it('nur POST mit einem JSON-Objekt, einer bekannten Aktion und begrenzter Größe', async () => {
    expect(await nurStatus(await fetch(FUNKTION))).toBe(405);
    expect(await nurStatus(await fetch(FUNKTION, { method: 'POST', body: 'kein json' }))).toBe(400);
    expect((await rufen([1, 2])).status).toBe(400);
    const l = await link();
    expect((await rufen({ aktion: 'loeschen', schluessel: l.schluessel })).status).toBe(400);
    const gross = await fetch(FUNKTION, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktion: 'annehmen', schluessel: l.schluessel, name: 'X Y', bestaetigt: true, unterschrift: `data:image/png;base64,${'A'.repeat(ANFRAGE_MAX_BYTES)}` }),
    });
    expect(await nurStatus(gross)).toBe(413);
    expect((await admin.from('angebot_links').select('geoeffnet_anzahl, anfragen_im_fenster').eq('id', l.id).single()).data)
      .toEqual({ geoeffnet_anzahl: 0, anfragen_im_fenster: 0 });
  });

  it('Annahme ohne Name, Bestätigung oder Unterschrift wird abgewiesen — die Datenbank bleibt unberührt', async () => {
    const l = await link();
    for (const [rumpf, grund] of [
      [{ name: ' ', bestaetigt: true, unterschrift: BILD }, /Namen/],
      [{ name: 'Max Muster', bestaetigt: false, unterschrift: BILD }, /bestätigen/],
      [{ name: 'Max Muster', bestaetigt: 'ja', unterschrift: BILD }, /bestätigen/],
      [{ name: 'Max Muster', bestaetigt: true, unterschrift: 'data:image/jpeg;base64,AAAA' }, /unterschreiben/],
      [{ name: 'Max Muster', bestaetigt: true }, /unterschreiben/],
    ] as const) {
      const a = await rufen({ aktion: 'annehmen', schluessel: l.schluessel, ...rumpf });
      expect(a.status).toBe(422);
      expect(JSON.parse(a.text).grund).toMatch(grund);
    }
    const a = await rufen({ aktion: 'ablehnen', schluessel: l.schluessel, name: 'X', grund: '' });
    expect(a.status).toBe(422);
    expect((await admin.from('angebot_links').select('anfragen_im_fenster, angenommen_am').eq('id', l.id).single()).data)
      .toEqual({ anfragen_im_fenster: 0, angenommen_am: null });
  });
});

describe('Abruf, Annahme, Ablehnung', () => {
  it('der Abruf liefert den Stand — ohne Hashwert, Unterschrift oder Angaben über die Belegschaft', async () => {
    const l = await link();
    const a = await rufen({ aktion: 'abruf', schluessel: l.schluessel });
    expect(a.status).toBe(200);
    expect(a.kopf.get('access-control-allow-origin')).toBe('*');
    const d = JSON.parse(a.text);
    expect(Object.keys(d).sort()).toEqual(['gueltig_bis', 'pruefsumme', 'schnappschuss', 'zustand']);
    expect(d.zustand).toBe('offen');
    expect(Object.keys(d.schnappschuss).sort()).toEqual(['angebot', 'aussteller', 'fassung', 'kunde']);
    expect(a.text).not.toMatch(new RegExp(sha(l.schluessel)));
    expect(a.text).not.toMatch(/erzeugt_von|fn-chefin/);
  });

  it('die Datenschicht der Seite liest daraus ein Angebot', async () => {
    const l = await link();
    const a = await annahmeAnfrage({ aktion: 'abruf', schluessel: l.schluessel });
    expect(a.zustand).toBe('offen');
    if (a.zustand !== 'offen') return;
    expect(a.stand.angebot).toMatchObject({ customerName: 'Familie Funktion', totalBrutto: 168, vatRate: 0.2 });
    expect(a.stand.angebot.positions).toEqual([{ label: 'Montage', qty: 2, unit: 'h', unitPrice: 70, netto: 140 }]);
    expect(a.stand.aussteller.name).toBe('Funktion GmbH');
    expect(a.pruefsumme).toMatch(/^[0-9a-f]{64}$/);
    expect(await annahmeAnfrage({ aktion: 'abruf', schluessel: 'C'.repeat(43) })).toEqual({ zustand: 'ungueltig' });
    expect(await annahmeAnfrage({ aktion: 'annehmen', schluessel: l.schluessel, name: 'Max', bestaetigt: false, unterschrift: BILD }))
      .toEqual({ zustand: 'fehler', grund: 'Bitte bestätigen, dass Sie das Angebot verbindlich annehmen.' });
  });

  it('annehmen, dann noch einmal: einmal entschieden, danach „bereits angenommen“', async () => {
    const l = await link();
    const erst = await rufen({ aktion: 'annehmen', schluessel: l.schluessel, name: '  Max Muster ', bestaetigt: true, unterschrift: BILD });
    expect(erst.status).toBe(200);
    expect(JSON.parse(erst.text)).toMatchObject({ zustand: 'angenommen', name: 'Max Muster', neu: true });
    const noch = await rufen({ aktion: 'annehmen', schluessel: l.schluessel, name: 'Wer Anderer', bestaetigt: true, unterschrift: BILD });
    expect(JSON.parse(noch.text)).toMatchObject({ zustand: 'angenommen', name: 'Max Muster', neu: false });
    expect(JSON.parse(noch.text).entschieden_am).toBe(JSON.parse(erst.text).entschieden_am);
    const abruf = await rufen({ aktion: 'abruf', schluessel: l.schluessel });
    expect(JSON.parse(abruf.text)).toMatchObject({ zustand: 'angenommen', name: 'Max Muster' });
    expect(abruf.text).not.toContain(BILD);
    expect((await admin.from('quotes').select('status').eq('id', l.angebot).single()).data!.status).toBe('Angenommen');
  });

  it('ablehnen mit Grund', async () => {
    const l = await link();
    const a = await rufen({ aktion: 'ablehnen', schluessel: l.schluessel, name: 'Max Muster', grund: ' Zu spät ' });
    expect(JSON.parse(a.text)).toMatchObject({ zustand: 'abgelehnt', name: 'Max Muster', neu: true });
    expect((await admin.from('angebot_links').select('abgelehnt_grund').eq('id', l.id).single()).data!.abgelehnt_grund).toBe('Zu spät');
  });
});

describe('Rate-Limit je Link', () => {
  it(`nach ${ANFRAGEN_JE_STUNDE} Anfragen in der Stunde „zu viele“ — ohne weiter zu zählen; ein neues Fenster gilt wieder`, async () => {
    const l = await link();
    for (let i = 0; i < ANFRAGEN_JE_STUNDE; i += 1) {
      expect((await rufen({ aktion: 'abruf', schluessel: l.schluessel })).status, `Anfrage ${i + 1}`).toBe(200);
    }
    const zuViel = await rufen({ aktion: 'abruf', schluessel: l.schluessel });
    expect(zuViel.status).toBe(429);
    expect(JSON.parse(zuViel.text).zustand).toBe('zu_viele');
    const annahme = await rufen({ aktion: 'annehmen', schluessel: l.schluessel, name: 'Max Muster', bestaetigt: true, unterschrift: BILD });
    expect(annahme.status).toBe(429);
    expect((await admin.from('angebot_links').select('geoeffnet_anzahl, angenommen_am').eq('id', l.id).single()).data)
      .toEqual({ geoeffnet_anzahl: ANFRAGEN_JE_STUNDE, angenommen_am: null });
    // Ein anderer Link ist davon nicht betroffen.
    expect((await rufen({ aktion: 'abruf', schluessel: (await link()).schluessel })).status).toBe(200);
    // Nach einer Stunde beginnt ein neues Fenster.
    await admin.from('angebot_links').update({ anfragen_fenster_ab: new Date(Date.now() - 3_700_000).toISOString() }).eq('id', l.id);
    expect((await rufen({ aktion: 'abruf', schluessel: l.schluessel })).status).toBe(200);
  }, 120_000);
});

describe('Dieselben Grenzen in der Function und in der Datenbank', () => {
  it('Name, Grund und Unterschrift: was die Function durchlässt, nimmt die Datenbank — eins mehr nicht', async () => {
    const l = await link();
    const p = { p_hash: sha(l.schluessel), p_bestaetigt: true };
    expect((await admin.rpc('angebot_link_annehmen', { ...p, p_name: 'x'.repeat(NAME_MAX + 1), p_unterschrift: BILD })).error?.message).toMatch(/Namen/);
    const zuGross = `data:image/png;base64,${'A'.repeat(UNTERSCHRIFT_MAX - 'data:image/png;base64,'.length + 1)}`;
    expect(zuGross.length).toBe(UNTERSCHRIFT_MAX + 1);
    expect((await admin.rpc('angebot_link_annehmen', { ...p, p_name: 'Max', p_unterschrift: zuGross })).error?.message).toMatch(/Unterschrift/);
    expect((await admin.rpc('angebot_link_ablehnen', { p_hash: sha(l.schluessel), p_name: 'Max', p_grund: 'g'.repeat(GRUND_MAX + 1) })).error?.message)
      .toMatch(/zu lang/);
    const genau = `data:image/png;base64,${'A'.repeat(UNTERSCHRIFT_MAX - 'data:image/png;base64,'.length)}`;
    const r = await admin.rpc('angebot_link_annehmen', { ...p, p_name: 'm'.repeat(NAME_MAX), p_unterschrift: genau });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ zustand: 'angenommen', neu: true });
  });
});
