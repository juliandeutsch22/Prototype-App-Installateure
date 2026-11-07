/**
 * LIEGENSCHAFTEN, TOPS, BETEILIGTE (M02c, A09) — gegen die echte Datenbank.
 *
 * Festgehalten wird:
 * - Anlegen von Liegenschaft (Anschrift als Zeile von der Datenbank), Top
 *   und Beteiligten — ein Kunde ODER freie Angaben, nie beides, nie keines;
 *   ein Kunde nur aus dem eigenen Betrieb;
 * - ein Top ist eindeutig je Liegenschaft (ohne Rücksicht auf Groß-/
 *   Kleinschreibung und Leerraum am Rand);
 * - Baustelle, Wartung und Eingang mit Liegenschaft und Top: Bezeichnungen
 *   von der Datenbank, ein Top einer fremden Liegenschaft, ein Top ohne
 *   Liegenschaft und eine Liegenschaft eines fremden Betriebs abgewiesen;
 *   eine umbenannte Liegenschaft heißt überall so;
 * - Lesen und Schreiben je Rolle wie Kunden; fremder Betrieb; Support wie
 *   Kunden (ansehen liest, mitarbeiten schreibt);
 * - Modul aus (ab Werk): Schreiben und neue Zuordnung abgewiesen, Lesen und
 *   bestehende Zuordnung bleiben, Entfernen eines Beteiligten geht;
 * - Löschen einer Liegenschaft mit Baustelle abgewiesen, ohne mit Tops und
 *   Beteiligten;
 * - Journal: Liegenschaft, Tops und Beteiligte unter ihr; Liegenschaft und
 *   Top an der Baustelle mit Namen; entfernter Beteiligter ohne Werte;
 * - Kundenlöschung (mit und ohne Belege), Datenauskunft des Kunden;
 * - die Suche über Bezeichnung, Anschrift und Beteiligte, seitenweise;
 * - Eingang → Baustelle und Wartung → Baustelle tragen Liegenschaft und Top;
 * - aus freien Angaben ein Kunde, in einem Zug;
 * - das Angebot trägt Liegenschaft und Top; die Annahme im Büro und über den
 *   Link gibt sie an die Baustelle; Eingang → Angebot → Annahme → Baustelle
 *   verliert sie nicht; der Schnappschuss des Links bleibt ohne sie;
 * - Erhaltung: Baustelle und Wartung ohne Liegenschaft wie bisher.
 *
 * Gegenprobe: ohne `20261108300000_liegenschaften.sql` gibt es weder die
 * Tabellen noch die Spalten noch die Funktionen — jede Prüfung hier ist rot,
 * außer der Erhaltung, die mit und ohne Änderung grün sein muss.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listLiegenschaften } from '@/lib/db/pg/liegenschaften';

const A = 'liegenschaft-a';
const B = 'liegenschaft-b';
let chefin: Konto;
let verwaltung: Konto;
let buch: Konto;
let monteur: Konto;
let fremd: Konto;
let plattform: Konto;
let hv = '';
let fremdKunde = '';

type Zeile = Record<string, unknown>;
const AN = { 'kunden.liegenschaften': true };

const module = async (festlegung: Zeile) =>
  expect((await admin.from('companies').update({ modules: festlegung }).eq('id', A)).error).toBeNull();

async function liegenschaft(wer: Konto, x: Zeile = {}): Promise<Zeile> {
  const { data, error } = await wer.client.from('liegenschaften').insert({
    company_id: wer.betrieb, bezeichnung: `WHA ${crypto.randomUUID().slice(0, 6)}`, strasse: 'Hauptstraße 12', plz: '1010', ort: 'Wien', ...x,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Zeile;
}
async function top(wer: Konto, l: string, bezeichnung: string, x: Zeile = {}): Promise<Zeile> {
  const { data, error } = await wer.client.from('liegenschaft_tops').insert({
    company_id: wer.betrieb, liegenschaft_id: l, bezeichnung, ...x,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Zeile;
}
async function beteiligter(wer: Konto, l: string, x: Zeile): Promise<Zeile> {
  const { data, error } = await wer.client.from('liegenschaft_beteiligte').insert({
    company_id: wer.betrieb, liegenschaft_id: l, ...x,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Zeile;
}
async function baustelle(wer: Konto, x: Zeile): Promise<{ data: Zeile | null; error: { message: string } | null }> {
  const r = await wer.client.from('projects').insert({
    company_id: wer.betrieb, project_number: `LG-${crypto.randomUUID().slice(0, 8)}`, customer_id: hv,
    customer_name: 'Muster Hausverwaltung', status: 'Aktiv', ...x,
  }).select('*').single();
  return { data: r.data as Zeile | null, error: r.error };
}
const zeile = async (tabelle: string, id: unknown) => (await admin.from(tabelle).select('*').eq('id', id as string).single()).data as Zeile;

beforeAll(async () => {
  await betriebAnlegen(A, 'Liegenschaft Installationen GmbH');
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'lg-chefin');
  verwaltung = await konto(A, 'Verwaltung', 'lg-verw');
  buch = await konto(A, 'Buchhaltung', 'lg-buch');
  monteur = await konto(A, 'Mitarbeiter', 'lg-monteur');
  fremd = await konto(B, 'Geschäftsführung', 'lg-fremd');
  plattform = await plattformkonto('lg-support');
  for (const [k, name] of [[chefin, 'Carla Chefin'], [verwaltung, 'Vera Verwaltung']] as const) {
    expect((await admin.from('users').update({ name }).eq('id', k.uid)).error).toBeNull();
  }
  // Die Verwaltung pflegt Kunden (Freigabe), die Buchhaltung nicht.
  expect((await admin.from('users').update({ kunden_pflegen: true }).eq('id', verwaltung.uid)).error).toBeNull();
  await admin.from('companies').update({ modules: AN }).eq('id', B);
  await module(AN);
  hv = (await admin.from('customers').insert({ company_id: A, name: 'Muster Hausverwaltung', strasse: 'Ring 1', plz: '1010', ort: 'Wien' })
    .select('id').single()).data!.id;
  fremdKunde = (await admin.from('customers').insert({ company_id: B, name: 'Fremde HV' }).select('id').single()).data!.id;
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await admin.from('companies').update({ modules: {} }).eq('id', A);
});

describe('Anlegen', () => {
  it('Liegenschaft mit Anschrift als Zeile, zwei Tops, Beteiligte als Kunde und frei', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: '  WHA Hauptstraße 12 ' });
    expect(l).toMatchObject({ bezeichnung: 'WHA Hauptstraße 12', anschrift: 'Hauptstraße 12, 1010 Wien', land: 'AT', aktiv: true });
    const t1 = await top(verwaltung, l.id as string, 'Top 1', { lage: 'EG' });
    const t2 = await top(verwaltung, l.id as string, 'Top 2');
    const b1 = await beteiligter(verwaltung, l.id as string, { rolle: 'hausverwaltung', customer_id: hv });
    const b2 = await beteiligter(verwaltung, l.id as string, { rolle: 'nutzer', top_id: t2.id, name: ' Max Mieter ', telefon: '0664 1', gueltig_ab: '2026-01-01' });
    expect(b1).toMatchObject({ customer_id: hv, name: null, top_id: null });
    expect(b2).toMatchObject({ name: 'Max Mieter', top_id: t2.id });
    // Mehrere je Rolle sind möglich.
    await beteiligter(verwaltung, l.id as string, { rolle: 'nutzer', top_id: t2.id, name: 'Mia Mieterin' });
    expect(t1).toMatchObject({ lage: 'EG' });
  });

  it('Kunde ODER freie Angaben — beides, keines und ein fremder Kunde werden abgewiesen', async () => {
    const l = await liegenschaft(verwaltung);
    const beides = await verwaltung.client.from('liegenschaft_beteiligte').insert({
      company_id: A, liegenschaft_id: l.id, rolle: 'eigentuemer', customer_id: hv, name: 'Auch frei' });
    expect(beides.error?.message).toMatch(/kunde_oder_frei/);
    const keines = await verwaltung.client.from('liegenschaft_beteiligte').insert({ company_id: A, liegenschaft_id: l.id, rolle: 'eigentuemer' });
    expect(keines.error?.message).toMatch(/kunde_oder_frei/);
    const fremderKunde = await verwaltung.client.from('liegenschaft_beteiligte').insert({
      company_id: A, liegenschaft_id: l.id, rolle: 'eigentuemer', customer_id: fremdKunde });
    expect(fremderKunde.error?.message).toMatch(/Diesen Kunden gibt es in diesem Betrieb nicht/);
    const rolle = await verwaltung.client.from('liegenschaft_beteiligte').insert({ company_id: A, liegenschaft_id: l.id, rolle: 'hausmeister', name: 'x' });
    expect(rolle.error).not.toBeNull();
  });

  it('ein Top ist eindeutig je Liegenschaft — auch mit anderer Schreibweise; in einer anderen Liegenschaft nicht', async () => {
    const l = await liegenschaft(verwaltung);
    await top(verwaltung, l.id as string, 'Top 5');
    const doppelt = await verwaltung.client.from('liegenschaft_tops').insert({ company_id: A, liegenschaft_id: l.id, bezeichnung: ' top 5 ' });
    expect(doppelt.error?.message).toMatch(/duplicate key value/);
    const andere = await liegenschaft(verwaltung);
    await top(verwaltung, andere.id as string, 'Top 5');
  });
});

describe('Baustelle, Wartung, Eingang mit Liegenschaft und Top', () => {
  it('die Bezeichnungen setzt die Datenbank; eine umbenannte Liegenschaft heißt überall so', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Ring 7' });
    const t2 = await top(verwaltung, l.id as string, 'Top 2');
    const p = await baustelle(chefin, { liegenschaft_id: l.id, top_id: t2.id, liegenschaft_bezeichnung: 'gelogen' });
    expect(p.error).toBeNull();
    expect(p.data).toMatchObject({ liegenschaft_bezeichnung: 'WHA Ring 7', top_bezeichnung: 'Top 2' });
    const w = await chefin.client.from('wartungen').insert({
      company_id: A, customer_id: hv, customer_name: 'Muster Hausverwaltung', anlage: 'Therme', intervall_monate: 12,
      faellig_am: '2099-01-01', liegenschaft_id: l.id, top_id: t2.id,
    }).select('*').single();
    expect(w.error).toBeNull();
    expect(w.data).toMatchObject({ liegenschaft_bezeichnung: 'WHA Ring 7', top_bezeichnung: 'Top 2' });
    const e = await verwaltung.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'hausverwaltung', customer_id: hv, anliegen: 'Tropft', liegenschaft_id: l.id, top_id: t2.id,
    }).select('*').single();
    expect(e.error).toBeNull();
    expect(e.data).toMatchObject({ liegenschaft_bezeichnung: 'WHA Ring 7', top_bezeichnung: 'Top 2' });

    expect((await verwaltung.client.from('liegenschaften').update({ bezeichnung: 'WHA Ringstraße 7' }).eq('id', l.id as string)).error).toBeNull();
    expect((await verwaltung.client.from('liegenschaft_tops').update({ bezeichnung: 'Top 2a' }).eq('id', t2.id as string)).error).toBeNull();
    for (const [t, id] of [['projects', p.data!.id], ['wartungen', w.data!.id], ['auftragseingaenge', e.data!.id]] as const) {
      expect(await zeile(t, id), t).toMatchObject({ liegenschaft_bezeichnung: 'WHA Ringstraße 7', top_bezeichnung: 'Top 2a' });
    }
  });

  it('abgewiesen: Top einer anderen Liegenschaft, Top ohne Liegenschaft, Liegenschaft eines fremden Betriebs', async () => {
    const l1 = await liegenschaft(verwaltung);
    const l2 = await liegenschaft(verwaltung);
    const t = await top(verwaltung, l2.id as string, 'Top 1');
    expect((await baustelle(chefin, { liegenschaft_id: l1.id, top_id: t.id })).error?.message).toMatch(/Dieses Top gehört nicht zu dieser Liegenschaft/);
    expect((await baustelle(chefin, { top_id: t.id })).error?.message).toMatch(/Ein Top gehört zu einer Liegenschaft/);
    const fremde = await liegenschaft(fremd);
    expect((await baustelle(chefin, { liegenschaft_id: fremde.id })).error?.message).toMatch(/Diese Liegenschaft gibt es in diesem Betrieb nicht/);
    // Auch nachträglich nicht.
    const p = await baustelle(chefin, { liegenschaft_id: l1.id });
    const umgehaengt = await chefin.client.from('projects').update({ top_id: t.id }).eq('id', p.data!.id as string);
    expect(umgehaengt.error?.message).toMatch(/Dieses Top gehört nicht zu dieser Liegenschaft/);
  });

  it('Löschen: mit Baustelle bleibt die Liegenschaft (mit Satz), ohne geht sie samt Tops und Beteiligten', async () => {
    const belegt = await liegenschaft(verwaltung);
    const tb = await top(verwaltung, belegt.id as string, 'Top 1');
    await baustelle(chefin, { liegenschaft_id: belegt.id, top_id: tb.id });
    const weg = await verwaltung.client.from('liegenschaften').delete().eq('id', belegt.id as string);
    expect(weg.error?.message).toMatch(/Baustellen, Wartungen, Eingängen oder Angeboten zugeordnet .* inaktiv/);
    expect((await verwaltung.client.from('liegenschaft_tops').delete().eq('id', tb.id as string)).error?.message).toMatch(/Dieses Top ist/);
    expect((await verwaltung.client.from('liegenschaften').update({ aktiv: false }).eq('id', belegt.id as string)).error).toBeNull();

    const frei = await liegenschaft(verwaltung);
    const tf = await top(verwaltung, frei.id as string, 'Top 1');
    const bf = await beteiligter(verwaltung, frei.id as string, { rolle: 'nutzer', top_id: tf.id, name: 'Weg' });
    expect((await verwaltung.client.from('liegenschaften').delete().eq('id', frei.id as string)).error).toBeNull();
    expect((await admin.from('liegenschaft_tops').select('id').eq('id', tf.id as string)).data).toEqual([]);
    expect((await admin.from('liegenschaft_beteiligte').select('id').eq('id', bf.id as string)).data).toEqual([]);
  });
});

describe('Rollen, fremder Betrieb, Support — wie Kunden', () => {
  it('der Monteur liest nichts; die Buchhaltung ohne Freigabe liest, schreibt aber nicht', async () => {
    const l = await liegenschaft(verwaltung);
    expect((await monteur.client.from('liegenschaften').select('id').eq('id', l.id as string)).data).toEqual([]);
    expect((await monteur.client.from('liegenschaft_tops').select('id').eq('liegenschaft_id', l.id as string)).data).toEqual([]);
    expect((await buch.client.from('liegenschaften').select('id').eq('id', l.id as string)).data).toEqual([{ id: l.id }]);
    expect((await buch.client.from('liegenschaften').insert({ company_id: A, bezeichnung: 'Buch' })).error).not.toBeNull();
    const aendern = await buch.client.from('liegenschaften').update({ notiz: 'x' }, { count: 'exact' }).eq('id', l.id as string);
    expect(aendern.count ?? 0).toBe(0);
    expect((await monteur.client.from('liegenschaften').insert({ company_id: A, bezeichnung: 'Monteur' })).error).not.toBeNull();
  });

  it('der Monteur sieht Liegenschaft und Top an seiner Baustelle als Text', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Monteurgasse' });
    const t = await top(verwaltung, l.id as string, 'Top 9');
    const p = await baustelle(chefin, { liegenschaft_id: l.id, top_id: t.id, assigned_employees: [monteur.uid] });
    const { data } = await monteur.client.from('projects').select('liegenschaft_bezeichnung, top_bezeichnung').eq('id', p.data!.id as string);
    expect(data).toEqual([{ liegenschaft_bezeichnung: 'WHA Monteurgasse', top_bezeichnung: 'Top 9' }]);
  });

  it('ein fremder Betrieb sieht und ändert nichts und legt nicht in A an', async () => {
    const l = await liegenschaft(verwaltung);
    expect((await fremd.client.from('liegenschaften').select('id').eq('id', l.id as string)).data).toEqual([]);
    const aendern = await fremd.client.from('liegenschaften').update({ notiz: 'x' }, { count: 'exact' }).eq('id', l.id as string);
    expect(aendern.count ?? 0).toBe(0);
    expect((await fremd.client.from('liegenschaften').insert({ company_id: A, bezeichnung: 'Fremd' })).error).not.toBeNull();
    expect((await fremd.client.from('liegenschaft_tops').insert({ company_id: B, liegenschaft_id: l.id, bezeichnung: 'Fremd' })).error).not.toBeNull();
  });

  it('der Support liest mit Einblick; schreibt nur mit „mitarbeiten“ (wie bei den Kunden)', async () => {
    const l = await liegenschaft(verwaltung);
    for (const stufe of ['ansehen', 'mitarbeiten'] as const) {
      const { data: freigabe } = await chefin.client.from('support_freigaben').insert({
        company_id: A, gewaehrt_von: chefin.uid, grund: 'Liegenschaft prüfen', stufe,
        gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
      }).select('id').single();
      try {
        await einblickBeginnen(plattform, A, freigabe!.id);
        expect((await plattform.client.from('liegenschaften').select('id').eq('id', l.id as string)).data, stufe).toEqual([{ id: l.id }]);
        const aendern = await plattform.client.from('liegenschaften').update({ notiz: `Support ${stufe}` }, { count: 'exact' }).eq('id', l.id as string);
        if (stufe === 'ansehen') expect(aendern.error ?? aendern.count === 0).toBeTruthy();
        else expect(aendern.error).toBeNull();
      } finally {
        await admin.from('support_zugriffe').delete().eq('company_id', A);
        await admin.from('support_freigaben').delete().eq('company_id', A);
      }
    }
    expect((await zeile('liegenschaften', l.id)).notiz).toBe('Support mitarbeiten');
  });
});

describe('Modul aus (ab Werk)', () => {
  it('Schreiben und neue Zuordnung abgewiesen; Lesen, bestehende Zuordnung, Lösen und Entfernen bleiben', async () => {
    const l = await liegenschaft(verwaltung);
    const t = await top(verwaltung, l.id as string, 'Top 1');
    const frei = await beteiligter(verwaltung, l.id as string, { rolle: 'nutzer', name: 'Bleibt nicht' });
    const p = await baustelle(chefin, { liegenschaft_id: l.id, top_id: t.id });
    await module({});
    try {
      const neu = await verwaltung.client.from('liegenschaften').insert({ company_id: A, bezeichnung: 'Aus' });
      expect(neu.error?.message).toMatch(/Liegenschaften sind in diesem Betrieb ausgeschaltet/);
      expect((await verwaltung.client.from('liegenschaften').update({ notiz: 'x' }).eq('id', l.id as string)).error?.message)
        .toMatch(/ausgeschaltet/);
      expect((await verwaltung.client.from('liegenschaft_tops').insert({ company_id: A, liegenschaft_id: l.id, bezeichnung: 'Top 2' })).error?.message)
        .toMatch(/ausgeschaltet/);
      expect((await baustelle(chefin, { liegenschaft_id: l.id })).error?.message).toMatch(/ausgeschaltet/);
      // Lesen bleibt, die bestehende Zuordnung auch — eine andere Angabe der Baustelle ändert sich wie bisher.
      expect((await verwaltung.client.from('liegenschaften').select('id').eq('id', l.id as string)).data).toEqual([{ id: l.id }]);
      expect((await chefin.client.from('projects').update({ description: 'Neu' }).eq('id', p.data!.id as string)).error).toBeNull();
      expect(await zeile('projects', p.data!.id)).toMatchObject({ liegenschaft_id: l.id, top_id: t.id, description: 'Neu' });
      // Lösen geht immer, Entfernen eines Beteiligten auch (DSGVO vor Modul).
      expect((await chefin.client.from('projects').update({ top_id: null }).eq('id', p.data!.id as string)).error).toBeNull();
      expect((await verwaltung.client.from('liegenschaft_beteiligte').delete().eq('id', frei.id as string)).error).toBeNull();
      // Löschen der Liegenschaft nicht.
      expect((await verwaltung.client.from('liegenschaft_tops').delete().eq('id', t.id as string)).error?.message).toMatch(/ausgeschaltet/);
      // Und die Suche liest weiter.
      expect((await verwaltung.client.rpc('liegenschaften_suche', { p_betrieb: A, p_suche: l.bezeichnung as string })).data).toHaveLength(1);
    } finally {
      await module(AN);
    }
  });
});

describe('Journal', () => {
  it('Liegenschaft, Tops und Beteiligte stehen im Verlauf der Liegenschaft — das Büro liest, der Monteur nicht', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Journal' });
    const t = await top(verwaltung, l.id as string, 'Top 3');
    const b = await beteiligter(verwaltung, l.id as string, { rolle: 'hausverwaltung', customer_id: hv });
    await verwaltung.client.from('liegenschaften').update({ notiz: 'Schlüssel beim Hausbesorger' }).eq('id', l.id as string);
    await verwaltung.client.from('liegenschaft_beteiligte').update({ top_id: t.id }).eq('id', b.id as string);
    const { data: j } = await buch.client.from('objekt_verlauf')
      .select('objektart, art, aenderungen, bezeichnung, von_name')
      .or(`and(objektart.eq.liegenschaft,objekt_id.eq.${l.id}),and(objektart.in.(top,beteiligter),bezug_id.eq.${l.id})`)
      .order('am');
    expect(j).toEqual([
      { objektart: 'liegenschaft', art: 'angelegt', aenderungen: {}, bezeichnung: 'WHA Journal', von_name: 'Vera Verwaltung' },
      { objektart: 'top', art: 'angelegt', aenderungen: {}, bezeichnung: 'Top 3', von_name: 'Vera Verwaltung' },
      { objektart: 'beteiligter', art: 'angelegt', aenderungen: {}, bezeichnung: 'Hausverwaltung · Muster Hausverwaltung', von_name: 'Vera Verwaltung' },
      { objektart: 'liegenschaft', art: 'geaendert', aenderungen: { notiz: { alt: null, neu: 'Schlüssel beim Hausbesorger' } }, bezeichnung: 'WHA Journal', von_name: 'Vera Verwaltung' },
      { objektart: 'beteiligter', art: 'geaendert', aenderungen: { top_id: { alt: null, neu: t.id } }, bezeichnung: 'Hausverwaltung · Muster Hausverwaltung', von_name: 'Vera Verwaltung' },
    ]);
    expect((await monteur.client.from('objekt_verlauf').select('id').eq('objekt_id', l.id as string)).data).toEqual([]);
    // Der Beteiligte, der ein Kunde ist, trägt den Kunden — so findet ihn dessen Löschung.
    const { data: k } = await admin.from('aenderungsjournal').select('kunde_id').eq('objekt_id', b.id as string);
    expect(new Set((k ?? []).map((z) => z.kunde_id))).toEqual(new Set([hv]));
  });

  it('an der Baustelle stehen Liegenschaft und Top mit Namen, nicht mit Kennung', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Baustellenjournal' });
    const t = await top(verwaltung, l.id as string, 'Top 4');
    const p = await baustelle(chefin, {});
    await chefin.client.from('projects').update({ liegenschaft_id: l.id, top_id: t.id }).eq('id', p.data!.id as string);
    const { data } = await chefin.client.from('objekt_verlauf').select('aenderungen')
      .eq('objektart', 'baustelle').eq('objekt_id', p.data!.id as string).eq('art', 'geaendert');
    expect(data).toEqual([{ aenderungen: {
      liegenschaft_bezeichnung: { alt: null, neu: 'WHA Baustellenjournal' }, top_bezeichnung: { alt: null, neu: 'Top 4' },
    } }]);
  });

  it('ein entfernter freier Beteiligter: seine Werte gehen aus dem Journal, die Rolle und wer wann bleiben', async () => {
    const l = await liegenschaft(verwaltung);
    const b = await beteiligter(verwaltung, l.id as string, { rolle: 'nutzer', name: 'Max Mieter', telefon: '0664 1' });
    await verwaltung.client.from('liegenschaft_beteiligte').update({ telefon: '0664 2', email: 'max@example.at' }).eq('id', b.id as string);
    expect((await verwaltung.client.from('liegenschaft_beteiligte').delete().eq('id', b.id as string)).error).toBeNull();
    const { data: j } = await admin.from('aenderungsjournal').select('art, aenderungen, bezeichnung, von_name')
      .eq('objektart', 'beteiligter').eq('objekt_id', b.id as string).order('am');
    expect(j).toEqual([
      { art: 'angelegt', aenderungen: {}, bezeichnung: 'Nutzer bzw. Mieter', von_name: 'Vera Verwaltung' },
      { art: 'geaendert', aenderungen: { telefon: { entfernt: true }, email: { entfernt: true } }, bezeichnung: 'Nutzer bzw. Mieter', von_name: 'Vera Verwaltung' },
      { art: 'geloescht', aenderungen: {}, bezeichnung: 'Nutzer bzw. Mieter', von_name: 'Vera Verwaltung' },
    ]);
    expect(JSON.stringify(j)).not.toMatch(/Max Mieter|0664|example/);
  });
});

describe('Datenauskunft und Löschung eines Kunden', () => {
  it('die Auskunft des Kunden nennt seine Beteiligungen mit Rolle, Liegenschaft und Top', async () => {
    const k = (await admin.from('customers').insert({ company_id: A, name: 'Familie Eigen' }).select('id').single()).data!.id;
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Auskunft' });
    const t = await top(verwaltung, l.id as string, 'Top 6');
    await beteiligter(verwaltung, l.id as string, { rolle: 'eigentuemer', customer_id: k, top_id: t.id, gueltig_ab: '2026-03-01' });
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: k });
    expect(error).toBeNull();
    expect((data as { daten: { liegenschaft_beteiligungen: Zeile[] } }).daten.liegenschaft_beteiligungen).toEqual([
      expect.objectContaining({ rolle: 'Eigentümer', liegenschaft: 'WHA Auskunft', top: 'Top 6', gueltig_ab: '2026-03-01' }),
    ]);
  });

  it('mit Belegen: der Kunde bleibt, seine Beteiligungen gehen — samt Werten im Journal', async () => {
    const k = (await admin.from('customers').insert({ company_id: A, name: 'Familie Beleg', kundenart: 'privat' }).select('id').single()).data!.id;
    await admin.from('projects').insert({ company_id: A, project_number: `LG-BELEG-${Date.now()}`, customer_id: k, customer_name: 'Familie Beleg', status: 'Aktiv' });
    const l = await liegenschaft(verwaltung);
    const b = await beteiligter(verwaltung, l.id as string, { rolle: 'auftraggeber', customer_id: k });
    await verwaltung.client.from('liegenschaft_beteiligte').update({ hinweis: 'ruft nur abends' }).eq('id', b.id as string);
    const probe = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k, p_nur_pruefen: true });
    expect((probe.data as { sofort: Record<string, number> }).sofort.liegenschaft_beteiligungen).toBe(1);
    const echt = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k, p_nur_pruefen: false });
    expect(echt.error).toBeNull();
    expect((echt.data as { ganz: boolean }).ganz).toBe(false);
    expect((await admin.from('liegenschaft_beteiligte').select('id').eq('id', b.id as string)).data).toEqual([]);
    const { data: j } = await admin.from('aenderungsjournal').select('aenderungen, bezeichnung').eq('objekt_id', b.id as string);
    expect(JSON.stringify(j)).not.toMatch(/Familie Beleg|abends/);
    expect((j ?? []).some((z) => JSON.stringify(z.aenderungen).includes('entfernt'))).toBe(true);
  });

  it('ohne Belege geht er ganz — seine Beteiligungen mit ihm', async () => {
    const k = (await admin.from('customers').insert({ company_id: A, name: 'Familie Ganz' }).select('id').single()).data!.id;
    const l = await liegenschaft(verwaltung);
    const b = await beteiligter(verwaltung, l.id as string, { rolle: 'eigentuemer', customer_id: k });
    const { data } = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: k, p_nur_pruefen: false });
    expect((data as { ganz: boolean }).ganz).toBe(true);
    expect((await admin.from('liegenschaft_beteiligte').select('id').eq('id', b.id as string)).data).toEqual([]);
    expect((await admin.from('liegenschaften').select('id').eq('id', l.id as string)).data).toEqual([{ id: l.id }]);
  });
});

describe('Die Suche', () => {
  it('über Bezeichnung, Anschrift und Beteiligte (frei und Kunde) — nur im eigenen Betrieb, nicht für den Monteur', async () => {
    const marke = crypto.randomUUID().slice(0, 6);
    const l = await liegenschaft(verwaltung, { bezeichnung: `Suchhaus ${marke}`, strasse: `Suchgasse ${marke}` });
    await beteiligter(verwaltung, l.id as string, { rolle: 'nutzer', name: `Mieter ${marke}` });
    clientEinreichen(verwaltung.client);
    for (const begriff of [`Suchhaus ${marke}`, `Suchgasse ${marke}`, `Mieter ${marke}`]) {
      expect((await listLiegenschaften(A, { suche: begriff })).zeilen.map((z) => z.id), begriff).toEqual([l.id]);
    }
    const hvHaus = await liegenschaft(verwaltung, { bezeichnung: `HV-Haus ${marke}` });
    const hvName = `Hausverwaltung ${marke}`;
    const k = (await admin.from('customers').insert({ company_id: A, name: hvName }).select('id').single()).data!.id;
    await beteiligter(verwaltung, hvHaus.id as string, { rolle: 'hausverwaltung', customer_id: k });
    expect((await listLiegenschaften(A, { suche: hvName })).zeilen.map((z) => z.id)).toEqual([hvHaus.id]);
    // Ein Joker ist ein Zeichen, kein Joker.
    expect((await listLiegenschaften(A, { suche: `Such%${marke}` })).zeilen).toEqual([]);
    clientEinreichen(monteur.client);
    expect((await listLiegenschaften(A, { suche: marke })).zeilen).toEqual([]);
    clientEinreichen(fremd.client);
    expect((await listLiegenschaften(A, { suche: marke })).zeilen).toEqual([]);
    clientEinreichen(null);
  });

  it('seitenweise ohne Lücke und ohne Doppel; inaktive nur unter „Alle“', async () => {
    const marke = crypto.randomUUID().slice(0, 6);
    expect((await admin.from('liegenschaften').insert(Array.from({ length: 7 }, (_, i) => ({
      company_id: A, bezeichnung: `Seite ${marke} ${i % 3}`, aktiv: i !== 6,
    })))).error).toBeNull();
    clientEinreichen(verwaltung.client);
    const eins = await listLiegenschaften(A, { suche: `Seite ${marke}`, grenze: 4 });
    expect(eins.zeilen).toHaveLength(4);
    const zwei = await listLiegenschaften(A, { suche: `Seite ${marke}`, grenze: 4, nach: eins.weiter });
    expect(zwei.zeilen).toHaveLength(2);
    expect(zwei.weiter).toBeNull();
    expect(new Set([...eins.zeilen, ...zwei.zeilen].map((z) => z.id)).size).toBe(6);
    expect((await listLiegenschaften(A, { suche: `Seite ${marke}`, nurAktive: false })).zeilen).toHaveLength(7);
    clientEinreichen(null);
  });
});

describe('Umwandeln und Kunde aus freien Angaben', () => {
  it('Eingang → Baustelle und Wartung → Baustelle tragen Liegenschaft und Top; ohne Ort die Anschrift der Liegenschaft', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Umwandeln', strasse: 'Umweg 3', plz: '1030', ort: 'Wien' });
    const t = await top(verwaltung, l.id as string, 'Top 2');
    const e = (await verwaltung.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'hausverwaltung', customer_id: hv, anliegen: 'Heizung', liegenschaft_id: l.id, top_id: t.id,
    }).select('id').single()).data!;
    const r = await chefin.client.rpc('eingang_zu_baustelle', { p_eingang: e.id, p_praefix: 'LG', p_abrechnung: 'Regie' });
    expect(r.error).toBeNull();
    expect(await zeile('projects', (r.data as { project_id: string }).project_id)).toMatchObject({
      liegenschaft_id: l.id, top_id: t.id, top_bezeichnung: 'Top 2', address: 'Umweg 3, 1030 Wien',
    });
    const w = (await chefin.client.from('wartungen').insert({
      company_id: A, customer_id: hv, customer_name: 'Muster Hausverwaltung', anlage: 'Therme', intervall_monate: 12,
      faellig_am: '2099-03-01', liegenschaft_id: l.id, top_id: t.id,
    }).select('id, faellig_am').single()).data!;
    const n = await chefin.client.rpc('wartung_einplanen', { p_wartung: w.id, p_nummer: null, p_praefix: 'LG', p_faellig: w.faellig_am });
    expect(n.error).toBeNull();
    const { data: p } = await admin.from('projects').select('liegenschaft_id, top_id').eq('company_id', A).eq('project_number', n.data as string).single();
    expect(p).toEqual({ liegenschaft_id: l.id, top_id: t.id });
  });

  it('aus freien Angaben ein Kunde, in einem Zug — ein zweiter Aufruf gibt denselben; ohne Recht ein Satz', async () => {
    const l = await liegenschaft(verwaltung);
    const b = await beteiligter(verwaltung, l.id as string, { rolle: 'eigentuemer', name: 'Erna Eigen', telefon: '0664 7', email: 'erna@example.at' });
    const ohne = await buch.client.rpc('liegenschaft_beteiligter_zu_kunde', { p_beteiligter: b.id });
    expect(ohne.error?.message).toMatch(/nur, wer Kunden pflegen darf/);
    const r = await verwaltung.client.rpc('liegenschaft_beteiligter_zu_kunde', { p_beteiligter: b.id });
    expect(r.error).toBeNull();
    expect(await zeile('customers', r.data)).toMatchObject({ company_id: A, name: 'Erna Eigen', contact_phone: '0664 7', email: 'erna@example.at' });
    expect(await zeile('liegenschaft_beteiligte', b.id)).toMatchObject({ customer_id: r.data, name: null, telefon: null, email: null });
    expect((await verwaltung.client.rpc('liegenschaft_beteiligter_zu_kunde', { p_beteiligter: b.id })).data).toBe(r.data);
    expect((await fremd.client.rpc('liegenschaft_beteiligter_zu_kunde', { p_beteiligter: b.id })).error?.message).toMatch(/nicht gefunden/);
  });
});

describe('Erhaltung', () => {
  it('Baustelle und Wartung ohne Liegenschaft entstehen und ändern sich wie bisher', async () => {
    const p = await baustelle(chefin, {});
    expect(p.error).toBeNull();
    expect(p.data).toMatchObject({ liegenschaft_id: null, top_id: null, liegenschaft_bezeichnung: null });
    expect((await chefin.client.from('projects').update({ status: 'Pausiert' }).eq('id', p.data!.id as string)).error).toBeNull();
    const w = await chefin.client.from('wartungen').insert({
      company_id: A, customer_id: hv, customer_name: 'Muster Hausverwaltung', anlage: 'Therme', intervall_monate: 12, faellig_am: '2099-01-01',
    }).select('liegenschaft_id').single();
    expect(w.error).toBeNull();
    expect(w.data).toEqual({ liegenschaft_id: null });
  });
});

/*
  DAS ANGEBOT TRÄGT LIEGENSCHAFT UND TOP (M02c, Nachtrag): sonst bräche der
  Weg Eingang (mit Liegenschaft) → Angebot → Annahme → Baustelle (ohne) ab.
*/
describe('Angebot mit Liegenschaft', () => {
  const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const sha = (x: string) => createHash('sha256').update(x).digest('hex');
  let lauf = 0;
  async function angebot(extra: Zeile = {}): Promise<string> {
    lauf += 1;
    const { data, error } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: {
        quote_number: `AN-LG-${Date.now()}-${lauf}`, customer_id: hv, customer_name: 'Muster Hausverwaltung',
        address: 'Hauptstraße 12, 1010 Wien', quote_date: '2026-11-07', valid_until: '2099-12-31', vat_rate: 0.2,
        status: 'Versendet', kalkulierte_stunden: 2, notes: 'Strang tauschen.', subtotal_netto: 100, total_netto: 100,
        total_vat: 20, total_brutto: 120, ...extra,
      },
      p_positionen: [{ label: 'Montage', qty: 2, unit: 'h', unit_price: 50, netto: 100, ist_arbeitszeit: true }],
    });
    if (error) throw new Error(error.message);
    return String(data);
  }
  const baustelleZu = async (quoteId: string) => {
    const q = await zeile('quotes', quoteId);
    return (await admin.from('projects').select('*').eq('company_id', A).eq('project_number', q.project_number as string).single()).data as Zeile;
  };

  it('Bezeichnungen vom Server; die Annahme im Büro gibt Liegenschaft und Top an die Baustelle', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Angebot' });
    const t = await top(verwaltung, l.id as string, 'Top 7');
    const q = await angebot({ liegenschaft_id: l.id, top_id: t.id });
    expect(await zeile('quotes', q)).toMatchObject({ liegenschaft_bezeichnung: 'WHA Angebot', top_bezeichnung: 'Top 7' });
    const r = await chefin.client.rpc('angebot_annehmen', { p_angebot: q, p_praefix: 'LG', p_abrechnung: 'Pauschal' });
    expect(r.error).toBeNull();
    expect(await baustelleZu(q)).toMatchObject({ liegenschaft_id: l.id, top_id: t.id, top_bezeichnung: 'Top 7' });
  });

  it('über den Annahme-Link ebenso — und der Schnappschuss des Links trägt keine Liegenschaft', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Link' });
    const t = await top(verwaltung, l.id as string, 'Top 1');
    const q = await angebot({ liegenschaft_id: l.id, top_id: t.id });
    const link = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: q, p_abrechnung: 'Pauschal', p_praefix: 'LG', p_gueltig_bis: null });
    expect(link.error).toBeNull();
    const { data: zeileLink } = await admin.from('angebot_links').select('schnappschuss').eq('quote_id', q).single();
    expect(JSON.stringify(zeileLink?.schnappschuss ?? {})).not.toMatch(/WHA Link|liegenschaft/i);
    const an = await admin.rpc('angebot_link_annehmen', {
      p_hash: sha((link.data as { schluessel: string }).schluessel), p_name: 'Hermine Hausverwaltung', p_unterschrift: BILD, p_bestaetigt: true,
    });
    expect(an.error).toBeNull();
    expect(await baustelleZu(q)).toMatchObject({ liegenschaft_id: l.id, top_id: t.id });
  });

  it('Eingang → Angebot → Annahme → Baustelle: die Liegenschaft geht den ganzen Weg mit', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Ganzer Weg', strasse: 'Weggasse 2', plz: '1040', ort: 'Wien' });
    const t = await top(verwaltung, l.id as string, 'Top 3');
    const e = (await verwaltung.client.from('auftragseingaenge').insert({
      company_id: A, quelle: 'hausverwaltung', customer_id: hv, anliegen: 'Angebot für Strang', liegenschaft_id: l.id, top_id: t.id,
    }).select('id').single()).data!;
    const r = await chefin.client.rpc('eingang_zu_angebot', { p_eingang: e.id });
    expect(r.error).toBeNull();
    const qid = (r.data as { quote_id: string }).quote_id;
    expect(await zeile('quotes', qid)).toMatchObject({ liegenschaft_id: l.id, top_id: t.id, address: 'Weggasse 2, 1040 Wien' });
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: qid, p_praefix: 'LG', p_abrechnung: 'Regie' })).error).toBeNull();
    expect(await baustelleZu(qid)).toMatchObject({ liegenschaft_id: l.id, top_id: t.id });
  });

  it('nach dem Versand nachtragbar, der Inhalt bleibt gesperrt; im Journal mit Namen', async () => {
    const l = await liegenschaft(verwaltung, { bezeichnung: 'WHA Nachtrag' });
    const q = await angebot();
    expect((await chefin.client.rpc('angebot_speichern', { p_id: q, p_kopf: { liegenschaft_id: l.id }, p_positionen: null })).error).toBeNull();
    expect(await zeile('quotes', q)).toMatchObject({ liegenschaft_id: l.id, liegenschaft_bezeichnung: 'WHA Nachtrag' });
    expect((await chefin.client.rpc('angebot_speichern', { p_id: q, p_kopf: { notes: 'Anders' }, p_positionen: null })).error?.message)
      .toMatch(/Nur ein Entwurf lässt sich ändern/);
    const { data } = await chefin.client.from('objekt_verlauf').select('aenderungen')
      .eq('objektart', 'angebot').eq('objekt_id', q).eq('art', 'geaendert');
    expect(data).toEqual([{ aenderungen: { liegenschaft_bezeichnung: { alt: null, neu: 'WHA Nachtrag' } } }]);
  });

  it('Modul aus: keine neue Zuordnung am Angebot; ein schon zugeordnetes wird angenommen — die Baustelle ohne', async () => {
    const l = await liegenschaft(verwaltung);
    const q = await angebot({ liegenschaft_id: l.id });
    await module({});
    try {
      await expect(angebot({ liegenschaft_id: l.id })).rejects.toThrow(/ausgeschaltet/);
      expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: q, p_praefix: 'LG', p_abrechnung: 'Pauschal' })).error).toBeNull();
      expect(await baustelleZu(q)).toMatchObject({ liegenschaft_id: null, top_id: null });
      expect(await zeile('quotes', q)).toMatchObject({ liegenschaft_id: l.id });
    } finally {
      await module(AN);
    }
  });

  it('Erhaltung: ein Angebot ohne Liegenschaft wird angenommen wie bisher', async () => {
    const q = await angebot();
    expect(await zeile('quotes', q)).toMatchObject({ liegenschaft_id: null, liegenschaft_bezeichnung: null });
    expect((await chefin.client.rpc('angebot_annehmen', { p_angebot: q, p_praefix: 'LG', p_abrechnung: 'Pauschal' })).error).toBeNull();
    expect(await baustelleZu(q)).toMatchObject({ liegenschaft_id: null, status: 'Aktiv', billing_mode: 'Pauschal' });
  });
});
