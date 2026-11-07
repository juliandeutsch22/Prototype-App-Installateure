/**
 * DIE EDGE FUNCTION `push-melden` FÜR DIE ANTWORT EINES KUNDEN ÜBER DEN
 * ANNAHME-LINK (M02a) — direkt aufgerufen, wie der Trigger es tut.
 *
 * Festgehalten wird:
 * - wer sie bekommt: Projektleitung, Geschäftsführung, Administration,
 *   aktive Konten — nicht Buchhaltung, Verwaltung, Monteur;
 * - wer „Antwort über den Annahme-Link“ abgeschaltet hat, bekommt kein Gerät
 *   gezählt;
 * - genau einmal: ein zweiter Aufruf für dieselbe Entscheidung plant nichts;
 * - ein Link ohne Entscheidung, eine unbekannte Art und ein fremder Aufrufer
 *   melden nichts.
 *
 * Wie `push.test.ts`: ohne Dienstkonto für Google antwortet die Function 503
 * und sagt in `geplant`, was sie verschickt hätte.
 *
 * Gegenprobe: ohne den Zweig `quelle: 'angebot'` in der Function liest sie
 * das Ereignis als Materialanforderung und plant nichts — rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, API, SERVICE, betriebAnlegen, konto, nurStatus, type Konto } from './helfer';

const FUNKTION = `${API}/functions/v1/push-melden`;
const BETRIEB = 'push-angebotlink';
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let chefin: Konto;
let pl: Konto;
let admins: Konto;
let buch: Konto;
let verwaltung: Konto;
let monteur: Konto;
let ehemalig: Konto;
let lauf = 0;

async function anstossen(ereignis: unknown, token = SERVICE) {
  const a = await fetch(FUNKTION, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ereignis),
  });
  return { status: a.status, daten: await a.json().catch(() => ({})) };
}

/**
 * Ein entschiedener Link — mit dem Dienstschlüssel in die Tabelle gesetzt,
 * nicht über `angebot_link_annehmen`: so stößt kein Trigger an, und die
 * Function bekommt den Link hier zum ersten Mal.
 */
async function entschiedenerLink(entscheidung: 'angenommen' | 'abgelehnt' | null): Promise<string> {
  lauf += 1;
  const { data: q, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: `AN-PL-${Date.now()}-${lauf}`, customer_name: 'Familie Push', quote_date: '2026-11-06',
      valid_until: '2099-01-01', vat_rate: 0.2, status: 'Versendet',
    },
    p_positionen: [{ label: 'Montage', qty: 1, unit: 'h', unit_price: 70, netto: 70 }],
  });
  if (error) throw new Error(error.message);
  const l = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: q, p_abrechnung: 'Regie', p_praefix: 'PL' });
  if (l.error) throw new Error(l.error.message);
  const id = (l.data as { id: string }).id;
  if (entscheidung === 'angenommen') {
    await admin.from('angebot_links').update({ angenommen_am: new Date().toISOString(), angenommen_name: 'Maria Push', angenommen_unterschrift: BILD }).eq('id', id);
  } else if (entscheidung === 'abgelehnt') {
    await admin.from('angebot_links').update({ abgelehnt_am: new Date().toISOString(), abgelehnt_name: 'Maria Push', abgelehnt_grund: 'Zu teuer' }).eq('id', id);
  }
  return id;
}

const ereignis = (link: string, art = 'link-entschieden') => ({ quelle: 'angebot', art, zeile: { id: link, company_id: BETRIEB } });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Push Installationen');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'pal-chefin');
  pl = await konto(BETRIEB, 'Projektleiter', 'pal-pl');
  admins = await konto(BETRIEB, 'Administrator', 'pal-admin');
  buch = await konto(BETRIEB, 'Buchhaltung', 'pal-buch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'pal-verw');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'pal-monteur');
  ehemalig = await konto(BETRIEB, 'Geschäftsführung', 'pal-ehemalig');
  for (const k of [chefin, pl, admins, buch, verwaltung, monteur, ehemalig]) {
    await admin.from('user_prefs').upsert({ user_id: k.uid, company_id: BETRIEB, push_tokens: [`geraet-${k.uid}`] });
  }
  await admin.from('users').update({ active: false }).eq('id', ehemalig.uid);
}, 120_000);

describe('Antwort über den Annahme-Link melden', () => {
  it('an Projektleitung, Geschäftsführung und Administration — genau einmal', async () => {
    const link = await entschiedenerLink('angenommen');
    const erst = await anstossen(ereignis(link));
    expect(erst.status).toBe(503); // ohne Dienstkonto wird nicht verschickt
    expect(erst.daten.geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 3 }]);
    expect((await admin.from('angebot_links').select('gemeldet_am').eq('id', link).single()).data!.gemeldet_am).not.toBeNull();

    // Zweitzustellung derselben Entscheidung: nichts mehr.
    const noch = await anstossen(ereignis(link));
    expect(noch.status).toBe(200);
    expect(noch.daten).toEqual({ gesendet: 0, geplant: [] });
  }, 60_000);

  it('die Ablehnung ebenso', async () => {
    const { daten } = await anstossen(ereignis(await entschiedenerLink('abgelehnt')));
    expect(daten.geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 3 }]);
  }, 60_000);

  it('wer den Schalter abgeschaltet hat, bekommt kein Gerät gezählt', async () => {
    await admin.from('user_prefs').update({ notify_angebot: false }).eq('user_id', pl.uid);
    try {
      const { daten } = await anstossen(ereignis(await entschiedenerLink('angenommen')));
      expect(daten.geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 2 }]);
    } finally {
      await admin.from('user_prefs').update({ notify_angebot: true }).eq('user_id', pl.uid);
    }
  }, 60_000);

  it('ein Link ohne Entscheidung, eine unbekannte Art und ein angemeldeter Mensch melden nichts', async () => {
    const offen = await entschiedenerLink(null);
    expect((await anstossen(ereignis(offen))).daten).toEqual({ gesendet: 0, geplant: [] });
    expect((await admin.from('angebot_links').select('gemeldet_am').eq('id', offen).single()).data!.gemeldet_am).toBeNull();
    const fertig = await entschiedenerLink('angenommen');
    expect((await anstossen(ereignis(fertig, 'irgendwas'))).daten).toEqual({ gesendet: 0, grund: 'kein Ereignis, das etwas meldet' });
    const a = await fetch(FUNKTION, {
      method: 'POST', headers: { Authorization: `Bearer ${chefin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ereignis(fertig)),
    });
    expect(await nurStatus(a)).toBe(401);
    // Danach ist sie noch zu melden — keiner der Fehlversuche hat sie verbraucht.
    expect((await anstossen(ereignis(fertig))).daten.geplant).toEqual([{ art: 'notifyAngebot', empfaenger: 3, geraete: 3 }]);
  }, 60_000);
});
