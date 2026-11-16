/**
 * RECHNUNG UND ANGEBOT PER MAIL (Durchsicht 15.11.2026, F16) — gegen den
 * laufenden Stapel: Edge Function `beleg-mail`, Datenbank und der örtliche
 * Mailfänger (Mailpit, `supabase/config.toml`: `[edge_runtime.secrets]`
 * zeigt auf „inbucket“; Ansicht und Schnittstelle unter 127.0.0.1:54324).
 *
 * Festgehalten wird:
 * - die Mail kommt an: an den Kunden, Antwort an den Betrieb, Kopie als
 *   Blindkopie, der Name des Betriebs als Absender, das PDF als Anhang;
 * - das Protokoll: wer, wann, an wen, welcher Beleg, Prüfsumme des Anhangs,
 *   die Annahme des Mailservers — und im Verlauf des Belegs;
 * - ein Entwurf ist danach versendet, mit Zeitpunkt, Firmendaten-Stand und
 *   Journal;
 * - nur berechtigte Rollen, keine stornierte Rechnung, kein Anhang, der kein
 *   PDF ist, kein Umbruch im Betreff, höchstens drei Empfänger, ohne
 *   Antwortadresse keine Mail; das Rate-Limit je Beleg;
 * - „versendet“ trägt nur die Function ein, nie ein Konto;
 * - Datenauskunft und Löschung kennen Absender und Empfänger.
 *
 * Gegenprobe: ohne `20261117041000_beleg_versand.sql` und ohne die Function
 * ist jede Prüfung hier rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { admin, ANON, API, betriebAnlegen, deaktivieren, konto, type Konto, mahnInhalt } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const FUNKTION = `${API}/functions/v1/beleg-mail`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const BETRIEB = 'beleg-mail-f16';
const OHNE = 'beleg-mail-f16-ohne';
let chefin: Konto;
let buch: Konto;
let pl: Konto;
let monteur: Konto;
let ohneAdresse: Konto;
let lauf = 0;

/** Ein winziges, aber echtes PDF — was die App schickt, beginnt so. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PDF_B64 = PDF.toString('base64');

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function senden(wer: Konto, rumpf: Record<string, unknown>) {
  const a = await fetch(FUNKTION, {
    method: 'POST',
    headers: { Authorization: `Bearer ${wer.token}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(rumpf),
  });
  return { status: a.status, daten: await a.json().catch(() => null) as Record<string, unknown> | null };
}

/** Eine gespeicherte Mahnung zur Rechnung — wie sie `mahnung_festhalten` hinterlässt (Stufe, Tag, Frist, Inhalt). */
async function gespeicherteMahnung(r: { id: string; nummer: string }, stufe: 1 | 2 | 3, datum: string): Promise<string> {
  const { data, error } = await admin.from('mahnungen').insert({
    company_id: BETRIEB, invoice_id: r.id, stufe, datum, frist: '2099-01-01', spesen: 0,
    inhalt: mahnInhalt(stufe, datum, '2099-01-01', r.nummer),
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function rechnung(kunde = 'Familie Mail'): Promise<{ id: string; nummer: string }> {
  clientEinreichen(buch.client);
  const r = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-F16', customerName: kunde, address: 'Postgasse 1, 1010 Wien',
    invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
    subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  }, { praefix: 'RE' });
  clientEinreichen(null);
  const { data } = await admin.from('invoices').select('invoice_number').eq('id', r.id).single();
  return { id: r.id, nummer: (data as { invoice_number: string }).invoice_number };
}

async function angebot(status = 'Entwurf', quoteDate = heute()): Promise<{ id: string; nummer: string }> {
  lauf += 1;
  const nummer = `AN-F16-${Date.now()}-${lauf}`;
  const { data, error } = await chefin.client.rpc('angebot_speichern', {
    p_id: null,
    p_kopf: {
      quote_number: nummer, customer_name: 'Familie Mail', address: 'Postgasse 1, 1010 Wien',
      quote_date: quoteDate, valid_until: '2099-01-01', vat_rate: 0.2, status, kalkulierte_stunden: 1,
      subtotal_netto: 70, total_netto: 70, total_vat: 14, total_brutto: 84,
    },
    p_positionen: [{ label: 'Montage', qty: 1, unit: 'h', unit_price: 70, netto: 70, ist_arbeitszeit: true }],
  });
  if (error) throw new Error(error.message);
  return { id: String(data), nummer };
}

const auftrag = (art: 'rechnung' | 'angebot' | 'mahnung', beleg: string, betreff: string, mehr: Record<string, unknown> = {}) => ({
  art, beleg, an: ['kunde@familie-mail.test'], kopie: true, betreff, text: 'Sehr geehrte Damen und Herren,\n\nanbei …\n\nPerl', anhang: PDF_B64,
  ...mehr,
});

interface MailpitAdresse { Name: string; Address: string }
interface MailpitNachricht {
  ID: string; Subject: string; From: MailpitAdresse; To: MailpitAdresse[]; Bcc: MailpitAdresse[] | null;
  ReplyTo: MailpitAdresse[] | null; Attachments: { FileName: string; ContentType: string; Size: number }[]; Text: string;
}

/** Die angekommene Mail mit diesem Betreff — oder `null`. */
async function angekommen(betreff: string): Promise<MailpitNachricht | null> {
  const suche = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${betreff}"`)}`);
  const treffer = (await suche.json()) as { messages: { ID: string }[] };
  if (!treffer.messages?.length) return null;
  return (await (await fetch(`${MAILPIT}/api/v1/message/${treffer.messages[0].ID}`)).json()) as MailpitNachricht;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  await betriebAnlegen(OHNE, 'Ohne Adresse GmbH');
  await admin.from('companies').update({ beleg_mail_antwort: 'office@perl.test' }).eq('id', BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'bmchef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'bmbuch');
  pl = await konto(BETRIEB, 'Projektleiter', 'bmpl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'bmmon');
  ohneAdresse = await konto(OHNE, 'Geschäftsführung', 'bmohne');
}, 120_000);

describe('beleg-mail (F16)', () => {
  it('meldet, dass der Versand eingerichtet ist (örtlich: Mailpit)', async () => {
    const r = await senden(buch, { pruefen: true });
    expect(r, 'functions serve ohne [edge_runtime.secrets] aus supabase/config.toml?').toEqual({
      status: 200, daten: { eingerichtet: true, absender: 'belege@senklot.invalid' },
    });
  });

  it('Rechnung: die Mail kommt an — Antwort an den Betrieb, Kopie als Blindkopie, PDF im Anhang — und steht im Protokoll', async () => {
    const r = await rechnung();
    const betreff = `Rechnung ${r.nummer} Probe ${Date.now()}`;
    const a = await senden(buch, auftrag('rechnung', r.id, betreff));
    expect(a.status, JSON.stringify(a.daten)).toBe(200);
    expect(a.daten).toMatchObject({ ok: true, an: ['kunde@familie-mail.test'], kopie: 'office@perl.test' });

    const m = await angekommen(betreff);
    expect(m).not.toBeNull();
    expect(m!.From).toEqual({ Name: 'Perl Installationen', Address: 'belege@senklot.invalid' });
    expect(m!.To.map((x) => x.Address)).toEqual(['kunde@familie-mail.test']);
    expect((m!.ReplyTo ?? []).map((x) => x.Address)).toEqual(['office@perl.test']);
    expect((m!.Bcc ?? []).map((x) => x.Address)).toEqual(['office@perl.test']);
    expect(m!.Attachments).toEqual([expect.objectContaining({ FileName: `Rechnung_${r.nummer}.pdf`, ContentType: 'application/pdf', Size: PDF.length })]);
    expect(m!.Text).toContain('anbei');

    const { data: zeile } = await admin.from('beleg_versand').select('*').eq('id', a.daten!.versand as string).single();
    expect(zeile).toMatchObject({
      company_id: BETRIEB, art: 'rechnung', invoice_id: r.id, beleg_nummer: r.nummer, an: ['kunde@familie-mail.test'],
      kopie_an: 'office@perl.test', betreff, anhang_name: `Rechnung_${r.nummer}.pdf`, anhang_bytes: PDF.length,
      anhang_sha256: createHash('sha256').update(PDF).digest('hex'), zustand: 'versendet', von_uid: buch.uid,
    });
    expect(zeile!.server_antwort).toBeTruthy();
    // Im Verlauf der Rechnung — gelesen wie die Rechnung.
    const { data: verlauf } = await buch.client.from('objekt_verlauf').select('art, von_name, aenderungen')
      .eq('objektart', 'rechnung').eq('objekt_id', r.id).eq('quelle', 'beleg_versand');
    expect(verlauf).toEqual([expect.objectContaining({ art: 'per_mail_versendet' })]);
  });

  it('Angebot (Entwurf): die Projektleitung sendet, danach ist es versendet — mit Zeitpunkt, Firmendaten und Journal', async () => {
    const q = await angebot();
    const betreff = `Angebot ${q.nummer}`;
    const a = await senden(pl, auftrag('angebot', q.id, betreff, { kopie: false }));
    expect(a.status, JSON.stringify(a.daten)).toBe(200);
    expect(a.daten).toMatchObject({ angebotVersendet: true, kopie: null });
    const { data } = await admin.from('quotes').select('status, versendet_am, aussteller_stand').eq('id', q.id).single();
    expect(data!.status).toBe('Versendet');
    expect(data!.versendet_am).not.toBeNull();
    expect(data!.aussteller_stand).not.toBeNull();
    const { data: journal } = await admin.from('aenderungsjournal').select('aenderungen, von_uid')
      .eq('objektart', 'angebot').eq('objekt_id', q.id);
    expect(journal).toContainEqual({ aenderungen: { status: { alt: 'Entwurf', neu: 'Versendet' } }, von_uid: pl.uid });
    const m = await angekommen(betreff);
    expect(m!.Bcc ?? []).toEqual([]);
    expect(m!.Attachments[0].FileName).toBe(`Angebot_${q.nummer}.pdf`);
  });

  it('mit Annahme-Link nur, wenn es einen offenen gibt', async () => {
    const q = await angebot('Versendet');
    const ohne = await senden(chefin, auftrag('angebot', q.id, `Link ${q.nummer}`, { mitLink: true }));
    expect(ohne.status).toBe(409);
    expect(String(ohne.daten?.error)).toMatch(/keinen offenen Annahme-Link/);
    const { error } = await chefin.client.rpc('angebot_link_erzeugen', { p_angebot: q.id, p_abrechnung: 'Pauschal', p_praefix: 'FN' });
    expect(error).toBeNull();
    const mit = await senden(chefin, auftrag('angebot', q.id, `Link ${q.nummer} 2`, { mitLink: true }));
    expect(mit.status).toBe(200);
    const { data } = await admin.from('beleg_versand').select('mit_link').eq('id', mit.daten!.versand as string).single();
    expect(data!.mit_link).toBe(true);
  });

  it('nur berechtigte Rollen: Monteur nichts, Projektleitung keine Rechnung, Buchhaltung kein Angebot', async () => {
    const r = await rechnung();
    const q = await angebot();
    expect((await senden(monteur, auftrag('rechnung', r.id, 'x'))).status).toBe(403);
    expect((await senden(pl, auftrag('rechnung', r.id, 'x'))).status).toBe(403);
    expect((await senden(buch, auftrag('angebot', q.id, 'x'))).status).toBe(403);
    const weg = await konto(BETRIEB, 'Buchhaltung', 'bmweg');
    await deaktivieren(weg.uid);
    expect([401, 403]).toContain((await senden(weg, auftrag('rechnung', r.id, 'x'))).status);
    expect(await angekommen('x')).toBeNull();
  });

  it('Eingaben: kein PDF, Umbruch im Betreff, zu viele Empfänger, ungültige Adresse, stornierte Rechnung', async () => {
    const r = await rechnung();
    expect((await senden(buch, auftrag('rechnung', r.id, 'Kein PDF', { anhang: Buffer.from('<html>').toString('base64') }))).status).toBe(400);
    expect((await senden(buch, auftrag('rechnung', r.id, 'Zeile\r\nBcc: fremd@x.test'))).status).toBe(400);
    expect((await senden(buch, auftrag('rechnung', r.id, 'Viele', { an: ['a@x.test', 'b@x.test', 'c@x.test', 'd@x.test'] }))).status).toBe(400);
    expect((await senden(buch, auftrag('rechnung', r.id, 'Falsch', { an: ['kunde@x'] }))).status).toBe(400);
    clientEinreichen(buch.client);
    await rechnungen.cancelInvoice({ id: r.id } as Parameters<typeof rechnungen.cancelInvoice>[0], 'Probe');
    clientEinreichen(null);
    const storno = await senden(buch, auftrag('rechnung', r.id, 'Storno'));
    expect(storno.status).toBe(409);
    expect(String(storno.daten?.error)).toMatch(/storniert/);
    const { count } = await admin.from('beleg_versand').select('id', { count: 'exact', head: true }).eq('invoice_id', r.id);
    expect(count).toBe(0);
  });

  it('ohne Antwortadresse des Betriebs geht keine Mail hinaus — mit einem Satz, was zu tun ist', async () => {
    const { data } = await ohneAdresse.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: {
        quote_number: `AN-OHNE-${Date.now()}`, customer_name: 'K', address: 'A', quote_date: heute(), valid_until: '2099-01-01',
        vat_rate: 0.2, status: 'Entwurf', kalkulierte_stunden: 1, subtotal_netto: 1, total_netto: 1, total_vat: 0.2, total_brutto: 1.2,
      },
      p_positionen: [{ label: 'X', qty: 1, unit: 'h', unit_price: 1, netto: 1, ist_arbeitszeit: true }],
    });
    const a = await senden(ohneAdresse, auftrag('angebot', String(data), 'Ohne'));
    expect(a.status).toBe(409);
    expect(String(a.daten?.error)).toMatch(/Antwortadresse/);
  });

  it('Rate-Limit je Beleg: nach fünf Versuchen in der Stunde ist Schluss', async () => {
    const r = await rechnung();
    for (let i = 0; i < 5; i += 1) expect((await senden(buch, auftrag('rechnung', r.id, `Limit ${r.nummer} ${i}`))).status).toBe(200);
    const sechster = await senden(buch, auftrag('rechnung', r.id, `Limit ${r.nummer} 5`));
    expect(sechster.status).toBe(429);
    expect(await angekommen(`Limit ${r.nummer} 5`)).toBeNull();
  });

  it('„versendet“ trägt nur die Function ein — kein Konto, auch nicht direkt in die Tabelle', async () => {
    const r = await rechnung();
    const { data: v, error: e1 } = await buch.client.rpc('beleg_versand_vorbereiten', {
      p_art: 'rechnung', p_beleg: r.id, p_an: ['kunde@familie-mail.test'], p_kopie: false, p_betreff: 'Direkt',
      p_anhang_bytes: 10, p_anhang_sha256: 'a'.repeat(64),
    });
    expect(e1).toBeNull();
    const { error: e2 } = await buch.client.rpc('beleg_versand_festhalten', { p_id: (v as { id: string }).id, p_ok: true });
    expect(e2).not.toBeNull();
    const { error: e3 } = await buch.client.from('beleg_versand').update({ zustand: 'versendet' }).eq('id', (v as { id: string }).id);
    const { data: danach } = await admin.from('beleg_versand').select('zustand').eq('id', (v as { id: string }).id).single();
    expect(e3 === null ? danach!.zustand : 'abgewiesen').not.toBe('versendet');
    const { error: e4 } = await buch.client.from('beleg_versand').insert({
      company_id: BETRIEB, art: 'rechnung', beleg_nummer: 'X', an: ['a@b.test'], betreff: 'x', anhang_name: 'x.pdf',
      anhang_bytes: 1, anhang_sha256: 'a'.repeat(64), zustand: 'versendet',
    });
    expect(e4).not.toBeNull();
  });

  it('Leseregel: die Projektleitung sieht den Versand eines Angebots, nicht den einer Rechnung', async () => {
    const { data: rechnungsVersand } = await pl.client.from('beleg_versand').select('id').eq('art', 'rechnung');
    const { data: angebotsVersand } = await pl.client.from('beleg_versand').select('id').eq('art', 'angebot');
    expect(rechnungsVersand).toEqual([]);
    expect((angebotsVersand ?? []).length).toBeGreaterThan(0);
    const { data: fremd } = await ohneAdresse.client.from('beleg_versand').select('id').eq('company_id', BETRIEB);
    expect(fremd).toEqual([]);
  });

  it('Datenauskunft und Löschung: Absender als Bearbeiter, Kunde mit seinen Adressen — die gehen bei der Löschung', async () => {
    const { data: kunde } = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Löschung' }).select('id').single();
    // Ohne Kundenkennung an der Rechnung — zugeordnet über den Namen, wie bei Altbeständen.
    const r = await rechnung('Familie Löschung');
    expect((await senden(buch, auftrag('rechnung', r.id, `Auskunft ${r.nummer}`))).status).toBe(200);

    const { data: a1 } = await chefin.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde!.id });
    const versaende = (a1 as { daten: { belege_per_mail: { an: string[]; beleg: string }[] } }).daten.belege_per_mail;
    expect(versaende).toEqual([expect.objectContaining({ beleg: r.nummer, an: ['kunde@familie-mail.test'] })]);
    const { data: a2 } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: buch.uid });
    expect((a2 as { als_bearbeiter: Record<string, number> }).als_bearbeiter.belege_per_mail).toBeGreaterThan(0);

    const { data: pruefung } = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde!.id, p_nur_pruefen: true });
    expect((pruefung as { sofort: Record<string, number> }).sofort.mailversand_adressen).toBe(1);
    const { error } = await chefin.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde!.id, p_nur_pruefen: false });
    expect(error).toBeNull();
    const { data: nachher } = await admin.from('beleg_versand').select('an, beleg_nummer, betreff').eq('invoice_id', r.id);
    expect(nachher).toEqual([{ an: ['entfernt'], beleg_nummer: r.nummer, betreff: `Auskunft ${r.nummer}` }]);
  });

  describe('Mahnung per Mail (Nacharbeit)', () => {
    it('die jüngste Mahnung kommt an — Anhang je Stufe, Protokoll an Mahnung und Rechnung, im Verlauf der Rechnung', async () => {
      const r = await rechnung();
      await gespeicherteMahnung(r, 1, '2026-10-01');
      const m2 = await gespeicherteMahnung(r, 2, '2026-10-15');
      const { data: vorher } = await admin.from('invoices').select('mahnstufe, gemahnt_am').eq('id', r.id).single();
      const betreff = `Mahnung ${r.nummer} Probe ${Date.now()}`;
      const a = await senden(buch, auftrag('mahnung', m2, betreff));
      expect(a.status, JSON.stringify(a.daten)).toBe(200);
      const m = await angekommen(betreff);
      expect(m!.Attachments).toEqual([expect.objectContaining({ FileName: `Mahnung_${r.nummer}.pdf`, ContentType: 'application/pdf' })]);
      const { data: zeile } = await admin.from('beleg_versand').select('*').eq('id', a.daten!.versand as string).single();
      expect(zeile).toMatchObject({ art: 'mahnung', mahnung_id: m2, invoice_id: r.id, beleg_nummer: r.nummer, zustand: 'versendet' });
      // Die Stufe setzt das Erstellen der Mahnung — das Senden ändert sie nicht.
      const { data: nachher } = await admin.from('invoices').select('mahnstufe, gemahnt_am').eq('id', r.id).single();
      expect(nachher).toEqual(vorher);
      const { data: verlauf } = await buch.client.from('objekt_verlauf').select('art, aenderungen')
        .eq('objektart', 'rechnung').eq('objekt_id', r.id).eq('quelle', 'beleg_versand');
      expect(verlauf).toEqual([expect.objectContaining({ art: 'per_mail_versendet', aenderungen: expect.objectContaining({ beleg_art: 'mahnung' }) })]);
    });

    it('Gegenprobe: keine ältere Stufe, nicht nach Bezahlung, nicht von der Projektleitung', async () => {
      const r = await rechnung();
      const m1 = await gespeicherteMahnung(r, 1, '2026-10-01');
      const m2 = await gespeicherteMahnung(r, 2, '2026-10-15');
      const alt = await senden(buch, auftrag('mahnung', m1, `Alt ${r.nummer}`));
      expect(alt.status).toBe(409);
      expect(String(alt.daten?.error)).toMatch(/neuere Mahnung/);
      expect((await senden(pl, auftrag('mahnung', m2, `PL ${r.nummer}`))).status).toBe(403);
      const { error: zahlung } = await admin.from('zahlungseingaenge').insert({
        company_id: BETRIEB, invoice_id: r.id, datum: heute(), betrag: 120, art: 'Überweisung',
      });
      expect(zahlung).toBeNull();
      const bezahlt = await senden(buch, auftrag('mahnung', m2, `Bezahlt ${r.nummer}`));
      expect(bezahlt.status).toBe(409);
      expect(String(bezahlt.daten?.error)).toMatch(/bezahlt/);
      const { count } = await admin.from('beleg_versand').select('id', { count: 'exact', head: true }).eq('invoice_id', r.id);
      expect(count).toBe(0);
    });

    it('Rate-Limit: Rechnung und ihre Mahnungen zählen zusammen', async () => {
      const r = await rechnung();
      const m = await gespeicherteMahnung(r, 1, '2026-10-01');
      for (let i = 0; i < 3; i += 1) expect((await senden(buch, auftrag('rechnung', r.id, `Zus ${r.nummer} ${i}`))).status).toBe(200);
      for (let i = 3; i < 5; i += 1) expect((await senden(buch, auftrag('mahnung', m, `Zus ${r.nummer} ${i}`))).status).toBe(200);
      expect((await senden(buch, auftrag('mahnung', m, `Zus ${r.nummer} 5`))).status).toBe(429);
    });
  });
});
