/**
 * WAS BEIM DREIFACHEN BESTAND NOCH MITWUCHS (`20261019400000_skalierung.sql`,
 * Nachweis 19.10.2026) — gegen die echte Datenbank.
 *
 * Jede der Abfragen liefert weniger Zeilen oder rechnet schneller als vorher.
 * Geprüft wird vor allem, dass die ANTWORT dieselbe bleibt:
 *
 * - `arbeitszeit_vorlauf`: dieselben Minuten je Tag wie `calcWorkMin` über
 *   die Buchungen (samt Nacht über Mitternacht und Zeitumstellung), und
 *   `grenzfaelle` findet mit dem verdichteten Vorlauf genau dieselben Fälle
 *   wie mit jeder Buchung;
 * - `buchungstage_je_person`: dieselben Tage wie `buchungstage`;
 * - `lager_frei`: mit einer Liste von Kennungen über den Schlüssel, und
 *   dieselbe Antwort wie ohne Liste;
 * - die Köpfe der unbezahlten Rechnungen (Startseite): dieselben Rechnungen
 *   wie die ganzen, ohne Positionen und Abdeckung, samt Rabatt;
 * - `monthly_stats` rechnet die Minuten in der Abfrage — dieselben wie
 *   `app.arbeitsminuten`; `monatsbilanzen_alle` gibt dieselben Bilanzen wie
 *   die Sicht je Person.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen, derClient } from '@/lib/db/pg/kern';
import { arbeitszeitVorlauf, buchungstage, listEntriesInRange } from '@/lib/db/pg/timeEntries';
import { lagerFrei } from '@/lib/db/pg/materials';
import { createInvoice, listUnpaidInvoiceKoepfe, listUnpaidInvoices } from '@/lib/db/pg/invoices';
import { listBilanzen, listBilanzenAlle } from '@/lib/db/pg/monatsbilanzen';
import { calcWorkMin, istGanztagsGutschrift } from '@shared/arbeitszeit';
import { grenzfaelle, montagVon, type GrenzPerson } from '@/features/accounting/arbeitszeitGrenzen';

const BETRIEB = 'skalierung';
const FREMD = 'skalierung-fremd';
let chefin: Konto;
let dauer: Konto;
let faelle: Konto;
let fremd: Konto;
const artikel = [randomUUID(), randomUUID(), randomUUID()];

function plusTage(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Zeile = {
  date: string;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  break_duration?: number;
  hours?: number | null;
  unterricht_min?: number | null;
};

/**
 * Die Grenzfälle der Minutenrechnung, je auf einem eigenen Tag. Die
 * Zeitumstellung 2026: 29.03. (02:00 → 03:00) und 25.10. (03:00 → 02:00).
 */
const FAELLE: Zeile[] = [
  { date: '2025-11-03', status: 'Anwesend', start_time: '07:00', end_time: '15:30', break_duration: 30 },
  { date: '2025-11-04', status: 'Anwesend', hours: 7.33 },
  // Nur Beginn: zählt über die Stunden.
  { date: '2025-11-05', status: 'Anwesend', start_time: '07:00', hours: 6 },
  // Über Mitternacht.
  { date: '2025-11-06', status: 'Anwesend', start_time: '22:00', end_time: '06:00', break_duration: 0 },
  // Die Nacht in den Sommer: eine Stunde weniger.
  { date: '2026-03-28', status: 'Anwesend', start_time: '22:00', end_time: '06:00', break_duration: 0 },
  // Am Tag der Umstellung selbst.
  { date: '2026-03-29', status: 'Anwesend', start_time: '01:00', end_time: '04:00', break_duration: 0 },
  // Die Nacht in den Winter (Oktober 2025): eine Stunde mehr.
  { date: '2025-10-25', status: 'Anwesend', start_time: '22:00', end_time: '06:00', break_duration: 0 },
  { date: '2025-10-26', status: 'Anwesend', start_time: '01:00', end_time: '04:00', break_duration: 15 },
  // Pause länger als die Spanne: null, zählt nicht.
  { date: '2025-11-07', status: 'Anwesend', start_time: '08:00', end_time: '08:30', break_duration: 45 },
  // Zwei Buchungen an einem Tag.
  { date: '2025-11-10', status: 'Anwesend', start_time: '07:00', end_time: '11:00', break_duration: 0 },
  { date: '2025-11-10', status: 'Anwesend', start_time: '11:30', end_time: '16:00', break_duration: 0 },
  // Gleicher Beginn und Ende: null.
  { date: '2025-11-11', status: 'Anwesend', start_time: '09:00', end_time: '09:00', break_duration: 0 },
  // Ganztags gutgeschrieben, auch mit Arbeit am selben Tag.
  { date: '2025-11-12', status: 'Krank' },
  { date: '2025-11-13', status: 'Urlaub' },
  { date: '2025-11-13', status: 'Anwesend', start_time: '07:00', end_time: '09:00', break_duration: 0 },
  { date: '2025-11-14', status: 'Unbezahlt' },
  { date: '2025-11-17', status: 'Dienstverhinderung' },
  // Stundenweise freigestellt: nicht ganztags.
  { date: '2025-11-18', status: 'Dienstverhinderung', start_time: '08:00', end_time: '10:00' },
  { date: '2025-11-19', status: 'Pflegefreistellung' },
  { date: '2025-11-20', status: 'Pflegefreistellung', start_time: '08:00', end_time: '12:00' },
  // Weder Arbeit noch Gutschrift.
  { date: '2025-11-21', status: 'Zeitausgleich' },
  // Berufsschule bleibt einzeln.
  { date: '2025-11-24', status: 'Berufsschule' },
  { date: '2025-11-25', status: 'Berufsschule', unterricht_min: 400 },
];

/** Werktage von `von` bis `bis`. */
function werktage(von: string, bis: string): string[] {
  const tage: string[] = [];
  for (let t = von; t <= bis; t = plusTage(t, 1)) {
    const wt = new Date(`${t}T00:00:00Z`).getUTCDay();
    if (wt !== 0 && wt !== 6) tage.push(t);
  }
  return tage;
}

const db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

beforeAll(async () => {
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'sk-gf');
  dauer = await konto(BETRIEB, 'Mitarbeiter', 'sk-dauer');
  faelle = await konto(BETRIEB, 'Mitarbeiter', 'sk-faelle');
  fremd = await konto(FREMD, 'Mitarbeiter', 'sk-fremd');
  const zeile = (wer: Konto, z: Zeile) => ({
    id: randomUUID(), company_id: wer.betrieb, user_id: wer.uid, user_name: wer.rolle,
    start_time: null, end_time: null, break_duration: 0, hours: null, unterricht_min: null, ...z,
  });
  /*
    „Dauer“ arbeitet ein Jahr lang 10,5 Std. an jedem Werktag — über dem
    Schnitt von 48 Std. —, mit einer Urlaubswoche, einem Krankenstand am
    Wochenende und einem Berufsschultag dazwischen.
  */
  const urlaub = werktage('2026-07-13', '2026-07-17');
  const dauerZeilen: Zeile[] = [
    ...werktage('2025-10-06', '2026-11-06')
      .filter((t) => !urlaub.includes(t) && t !== '2026-08-04')
      .map((date) => ({ date, status: 'Anwesend', start_time: '07:00', end_time: '18:00', break_duration: 30 })),
    ...urlaub.map((date) => ({ date, status: 'Urlaub' })),
    { date: '2026-08-08', status: 'Krank' },
    { date: '2026-08-04', status: 'Berufsschule' },
  ];
  const fehler = [
    (await admin.from('time_entries').insert(dauerZeilen.map((z) => zeile(dauer, z)))).error,
    (await admin.from('time_entries').insert(FAELLE.map((z) => zeile(faelle, z)))).error,
    (await admin.from('time_entries').insert(zeile(fremd, { date: '2025-11-03', status: 'Anwesend', hours: 8 }))).error,
    (await admin.from('materials').insert(artikel.map((id, i) => (
      { id, company_id: BETRIEB, name: `Fitting ${i}`, unit: 'Stk', stock: 10 + i, lagerartikel: true }
    )))).error,
  ].filter(Boolean);
  if (fehler.length) throw new Error(fehler.map((f) => f!.message).join('; '));
  const { error } = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: BETRIEB, material_id: artikel[1], material_name: 'Fitting 1', quantity: 4, status: 'Offen',
    transaction_type: 'order', processed: false, beschaffung: 'lager', is_urgent: false,
    user_id: dauer.uid, user_name: 'Dauer', project_number: 'B-1',
  });
  if (error) throw new Error(error.message);
  clientEinreichen(chefin.client);
}, 60_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

describe('arbeitszeit_vorlauf: je Person und Tag verdichtet', () => {
  it('dieselben Minuten wie `calcWorkMin`, dieselben ganztags gutgeschriebenen Tage', async () => {
    const roh = (await listEntriesInRange(BETRIEB, '2025-10-01', '2026-03-31')).filter((e) => e.userId === faelle.uid);
    const { data, error } = await derClient().rpc('arbeitszeit_vorlauf', { p_von: '2025-10-01', p_bis: '2026-03-31' });
    if (error) throw new Error(error.message);
    // Je Person EINE Zeile mit ihren Tagen.
    const zeilen = data as Array<{ user_id: string; tage: string[]; minuten: Array<number | null>; ganztags: boolean[] }>;
    expect(zeilen.map((z) => z.user_id).sort()).toEqual([dauer.uid, faelle.uid].sort());
    const meine = zeilen.find((z) => z.user_id === faelle.uid)!;
    const tage = meine.tage.map((date, i) => ({ date, minuten: meine.minuten[i], ganztags: meine.ganztags[i] }));

    const erwartet = new Map<string, { minuten: number | null; ganztags: boolean }>();
    for (const e of roh) {
      if (e.status === 'Berufsschule') continue;
      const t = erwartet.get(e.date) ?? { minuten: null, ganztags: false };
      const min = calcWorkMin(e);
      if (min > 0) t.minuten = (t.minuten ?? 0) + min;
      t.ganztags ||= istGanztagsGutschrift(e);
      erwartet.set(e.date, t);
    }
    expect(Object.fromEntries(tage.map((z) => [z.date, { minuten: z.minuten == null ? null : Number(z.minuten), ganztags: z.ganztags }])))
      .toEqual(Object.fromEntries(erwartet));

    // Gegenprobe gegen die Hand: die Nächte der Zeitumstellung und die Fälle mit null.
    const min = (tag: string) => tage.find((z) => z.date === tag)?.minuten;
    expect(Number(min('2025-11-06'))).toBe(480);
    expect(Number(min('2026-03-28'))).toBe(420);
    expect(Number(min('2026-03-29'))).toBe(120);
    expect(Number(min('2025-10-25'))).toBe(540);
    expect(Number(min('2025-10-26'))).toBe(225);
    expect(Number(min('2025-11-04'))).toBe(440);
    expect(Number(min('2025-11-05'))).toBe(360);
    expect(Number(min('2025-11-10'))).toBe(510);
    expect(min('2025-11-07')).toBeNull();
    expect(min('2025-11-11')).toBeNull();
    expect(tage.filter((z) => z.ganztags).map((z) => z.date))
      .toEqual(['2025-11-12', '2025-11-13', '2025-11-14', '2025-11-17', '2025-11-19']);
    // Die Berufsschule nicht: sie kommt einzeln.
    expect(tage.some((z) => z.date === '2025-11-24' || z.date === '2025-11-25')).toBe(false);
  });

  it('die App macht daraus Einträge, die `calcWorkMin` und `istGanztagsGutschrift` gleich zählen — Berufsschule einzeln', async () => {
    const vorlauf = (await arbeitszeitVorlauf(BETRIEB, '2025-10-01', '2026-03-31')).filter((e) => e.userId === faelle.uid);
    const jeTag = (tag: string) => vorlauf.filter((e) => e.date === tag);
    expect(jeTag('2025-11-13').map((e) => [e.status, calcWorkMin(e), istGanztagsGutschrift(e)]))
      .toEqual([['Anwesend', 120, false], ['Urlaub', 0, true]]);
    expect(jeTag('2026-03-28').map(calcWorkMin)).toEqual([420]);
    expect(jeTag('2025-11-21')).toEqual([]);
    expect(jeTag('2025-11-25')).toEqual([expect.objectContaining({ status: 'Berufsschule', date: '2025-11-25' })]);
  });

  it('blättert vollständig', async () => {
    const ganz = await arbeitszeitVorlauf(BETRIEB, '2025-10-01', '2026-03-31');
    // Je Person eine Zeile: Seiten zu einer Person reichen für beide.
    const seitenweise = await arbeitszeitVorlauf(BETRIEB, '2025-10-01', '2026-03-31', 1);
    expect(seitenweise).toEqual(ganz);
    expect(new Set(ganz.map((e) => e.userId)).size).toBe(2);
  });

  it('ohne Buchhaltung oder Spitze nur die eigenen Tage — wie `time_entries_lesen`; nie ein fremder Betrieb', async () => {
    clientEinreichen(faelle.client);
    try {
      const eigene = await arbeitszeitVorlauf(BETRIEB, '2025-10-01', '2026-11-30');
      expect(eigene.length).toBeGreaterThan(0);
      expect(eigene.every((e) => e.userId === faelle.uid)).toBe(true);
    } finally {
      clientEinreichen(chefin.client);
    }
    const alle = await arbeitszeitVorlauf(BETRIEB, '2025-10-01', '2026-11-30');
    expect(new Set(alle.map((e) => e.userId))).toEqual(new Set([dauer.uid, faelle.uid]));
  });

  /*
    DER EIGENTLICHE NACHWEIS: die Karte „Arbeitszeitgrenzen“ rechnet mit dem
    verdichteten Vorlauf und den vollen Buchungen ab einer Woche vor dem
    Monat (`useArbeitszeitGrenzen`). Dieselben Fälle wie mit jeder Buchung —
    für 17 und für 52 Wochen, für einen Erwachsenen und für einen, der im
    Vorlauf noch jugendlich war.
  */
  it.each([
    ['Oktober 2026, 17 Wochen', 2026, 9, 17],
    ['Oktober 2026, 52 Wochen', 2026, 9, 52],
    ['April 2026, 26 Wochen', 2026, 3, 26],
  ])('Gleichbleiben: dieselben Grenzfälle wie mit jeder Buchung (%s)', async (_n, jahr, monat, wochen) => {
    const von = `${jahr}-${String(monat + 1).padStart(2, '0')}-01`;
    const bis = new Date(Date.UTC(jahr, monat + 1, 0)).toISOString().slice(0, 10);
    const vorlaufAb = plusTage(montagVon(von), -7 * (wochen - 1));
    const ab = plusTage(von, -7);
    const bisMit = plusTage(bis, 7);
    const [roh, vorlauf, seite] = await Promise.all([
      listEntriesInRange(BETRIEB, vorlaufAb, bisMit),
      arbeitszeitVorlauf(BETRIEB, vorlaufAb, plusTage(von, -8)),
      listEntriesInRange(BETRIEB, ab, bisMit),
    ]);
    const personen: Array<[Konto, GrenzPerson]> = [
      [dauer, { geburtsdatum: null }],
      [dauer, { geburtsdatum: '2008-08-01', schultagMin: () => 480 }],
      [faelle, { geburtsdatum: null, arbeitstageJeWoche: 4 }],
    ];
    let gefunden = 0;
    for (const [wer, person] of personen) {
      const alt = grenzfaelle(roh.filter((e) => e.userId === wer.uid), { von, bis }, person, { durchrechnungWochen: wochen });
      const neu = grenzfaelle([...vorlauf, ...seite].filter((e) => e.userId === wer.uid), { von, bis }, person, { durchrechnungWochen: wochen });
      expect(neu).toEqual(alt);
      gefunden += alt.filter((f) => f.art === 'durchschnitt').length;
    }
    // Gegenprobe: es gibt Fälle des Durchschnitts, und ohne Vorlauf fehlen sie.
    expect(gefunden).toBeGreaterThan(0);
    const ohneVorlauf = grenzfaelle(seite.filter((e) => e.userId === dauer.uid), { von, bis }, { geburtsdatum: null }, { durchrechnungWochen: wochen });
    const mit = grenzfaelle(roh.filter((e) => e.userId === dauer.uid), { von, bis }, { geburtsdatum: null }, { durchrechnungWochen: wochen });
    expect(ohneVorlauf).not.toEqual(mit);
  });
});

describe('buchungstage_je_person', () => {
  it('Gleichbleiben: dieselben Tage wie `buchungstage`, je Person und Tag einmal', async () => {
    const { data, error } = await derClient().rpc('buchungstage', { p_von: '2025-10-01', p_bis: '2026-11-30' }).range(0, 99_999);
    if (error) throw new Error(error.message);
    const alt = (data as Array<{ user_id: string; date: string }>).map((z) => `${z.user_id}|${z.date}`).sort();
    const neu = (await buchungstage('2025-10-01', '2026-11-30')).map((t) => `${t.userId}|${t.date}`).sort();
    expect(neu).toEqual(alt);
    expect(new Set(neu).size).toBe(neu.length);
    // Gegenprobe: je Person EINE Zeile statt je Tag.
    const { data: zeilen } = await derClient().rpc('buchungstage_je_person', { p_von: '2025-10-01', p_bis: '2026-11-30' });
    expect(zeilen).toHaveLength(2);
    expect(alt.length).toBeGreaterThan(200);
  });

  it('blättert vollständig', async () => {
    const ganz = await buchungstage('2025-10-01', '2026-11-30');
    expect(await buchungstage('2025-10-01', '2026-11-30', 1)).toEqual(ganz);
  });

  it('ohne Buchhaltung oder Spitze nur die eigenen Tage', async () => {
    clientEinreichen(faelle.client);
    try {
      const tage = await buchungstage('2025-10-01', '2026-11-30');
      expect(tage.length).toBeGreaterThan(0);
      expect(tage.every((t) => t.userId === faelle.uid)).toBe(true);
    } finally {
      clientEinreichen(chefin.client);
    }
  });
});

describe('lager_frei mit einer Liste von Kennungen', () => {
  it('Gleichbleiben: dieselbe Antwort wie ohne Liste', async () => {
    const { data, error } = await derClient().rpc('lager_frei').range(0, 99_999);
    if (error) throw new Error(error.message);
    const ohne = new Map((data as Array<{ material_id: string; frei: number }>).map((z) => [z.material_id, Number(z.frei)]));
    const mit = await lagerFrei(artikel);
    expect([...mit.entries()].map(([id, s]) => [id, s.frei]).sort()).toEqual(artikel.map((id) => [id, ohne.get(id)]).sort());
    expect(mit.get(artikel[1])).toEqual({ bestand: 11, zugesagt: 4, geplant: 0, frei: 7 });
  });

  it('nur die gefragten Artikel, und keine fremden', async () => {
    expect([...(await lagerFrei([artikel[0]])).keys()]).toEqual([artikel[0]]);
    clientEinreichen(fremd.client);
    try {
      expect((await lagerFrei(artikel)).size).toBe(0);
    } finally {
      clientEinreichen(chefin.client);
    }
  });

  /*
    Langsamkeit lässt sich mit drei Artikeln nicht messen. Geprüft wird die
    Voraussetzung: im allgemeinen Plan, den Postgres für alle Aufrufe der
    Funktion bildet, kann die Liste die Artikel über den Schlüssel finden
    (`id = ANY` als Indexbedingung). Mit `p_ids is null or m.id = any (p_ids)`
    (Stand davor) geht das nicht — die Prüfung ist dann rot (Gegenprobe:
    gegen den alten Text gelaufen).

    NUR DER SCHLÜSSEL BLEIBT ALS INDEX, die übrigen in der Transaktion
    weggenommen und zurückgerollt: welchen Postgres sonst vorzieht, hängt an
    Statistik und Datenmenge — im vollen Lauf an den Artikeln anderer
    Prüfungen, in der CI an der leeren Tabelle (beides am 20.10.2026
    geschehen). Die Frage hier ist nur, ob der Schlüssel überhaupt nutzbar ist.
  */
  it('der allgemeine Plan kann die Artikel über den Schlüssel finden', async () => {
    const { rows } = await db.query(`select prosrc from pg_proc where oid = 'public.lager_frei(uuid[])'::regprocedure`);
    const text = String(rows[0].prosrc).replace(/\bp_ids\b/g, '$1');
    await db.query('begin');
    try {
      await db.query("set local lock_timeout = '5s'");
      const { rows: indizes } = await db.query(
        `select indexrelid::regclass::text as name from pg_index
          where indrelid = 'public.materials'::regclass and not indisprimary`);
      for (const { name } of indizes) await db.query(`drop index ${name}`);
      await db.query('set local plan_cache_mode = force_generic_plan');
      await db.query('set local enable_seqscan = off');
      await db.query(`prepare lager_frei_plan(uuid[]) as ${text}`);
      const { rows: plan } = await db.query(`explain (format json) execute lager_frei_plan('{${artikel.join(',')}}')`);
      // Auch als Bitmap: dort steht der Index im Knoten unter dem Tabellenzugriff.
      const schluessel: Array<Record<string, unknown>> = [];
      const sammeln = (k: unknown) => {
        if (Array.isArray(k)) k.forEach(sammeln);
        else if (k && typeof k === 'object') {
          const knoten = k as Record<string, unknown>;
          if (knoten['Index Name'] === 'materials_pkey') schluessel.push(knoten);
          Object.values(knoten).forEach(sammeln);
        }
      };
      sammeln(plan[0]['QUERY PLAN']);
      expect(schluessel.some((k) => /id = ANY/.test(String(k['Index Cond'] ?? '')))).toBe(true);
    } finally {
      await db.query('rollback');
    }
  });
});

describe('unbezahlte Rechnungen: nur die Köpfe', () => {
  it('Gleichbleiben: dieselben Rechnungen und Felder wie die ganzen, ohne Positionen und Abdeckung — der Rabatt bleibt', async () => {
    const rechnung = (nr: string, rabatt?: { mode: 'percent'; value: number; label: string }) => createInvoice(BETRIEB, {
      invoiceNumber: nr, projectNumber: 'B-1', customerName: 'Familie Huber', address: 'Hauptplatz 1, 8200 Gleisdorf',
      invoiceDate: '2026-09-30', leistungVon: '2026-09-30', leistungBis: '2026-09-30', dueDate: '2026-10-14', totalNetto: 900, totalVat: 180, totalBrutto: 1080, vatRate: 0.2,
      paymentStatus: 'Offen',
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
      ...(rabatt ? { discount: rabatt } : {}),
    });
    await rechnung('RE-2026-9001', { mode: 'percent', value: 10, label: 'Treue' });
    await rechnung('RE-2026-9002');
    const ganz = await listUnpaidInvoices(BETRIEB);
    const koepfe = await listUnpaidInvoiceKoepfe(BETRIEB);
    const ohne = ganz.map((r) => {
      const kopf: Record<string, unknown> = { ...r };
      for (const feld of ['positions', 'linkedEntries', 'linkedOrders', 'linkedWorkSheets']) delete kopf[feld];
      return kopf as typeof koepfe[number];
    });
    const nachId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    expect(nachId(koepfe)).toEqual(nachId(ohne));
    expect(koepfe.find((r) => r.invoiceNumber === 'RE-2026-9001')?.discount).toEqual({ mode: 'percent', value: 10, label: 'Treue' });
    // Gegenprobe: die ganzen tragen ihre Positionen, die Köpfe nicht.
    expect(ganz.every((r) => (r.positions ?? []).length === 1)).toBe(true);
    expect(koepfe.every((r) => !('positions' in r))).toBe(true);
  });
});

describe('Monatsbilanzen: die Minuten in der Abfrage', () => {
  it('Gleichbleiben: dieselben Minuten je Monat wie über `app.arbeitsminuten` — samt Zeitumstellung, Mitternacht, Stunden ohne Uhrzeit', async () => {
    const { rows: sicht } = await db.query(
      `select user_id, monat, anwesend_min from public.monthly_stats where company_id = $1 order by user_id, monat`, [BETRIEB]);
    const { rows: funktion } = await db.query(
      `select user_id, to_char(date, 'YYYY-MM') as monat,
              sum(app.arbeitsminuten(status, start_time, end_time, break_duration, hours, date)) as anwesend_min
         from public.time_entries where company_id = $1 group by 1, 2 order by 1, 2`, [BETRIEB]);
    expect(sicht).toEqual(funktion);
    // Die Fälle der Zeitumstellung liegen darin: März 2026 und Oktober 2025.
    expect(sicht.some((z) => z.user_id === faelle.uid && z.monat === '2026-03')).toBe(true);
    expect(sicht.some((z) => z.user_id === faelle.uid && z.monat === '2025-10')).toBe(true);
  });

  /*
    Langsamkeit misst hier niemand; geprüft wird die Ursache. Mit dem Stand
    davor ruft der Plan der Sicht `app.arbeitsminuten` je Buchung (rot).
  */
  it('der Plan der Sicht ruft keine Funktion je Buchung', async () => {
    const { rows } = await db.query(`explain (verbose, format json) select * from public.monthly_stats where company_id = '${BETRIEB}'`);
    expect(JSON.stringify(rows[0]['QUERY PLAN'])).not.toMatch(/arbeitsminuten/);
  });

  it('monatsbilanzen_alle: dieselben Bilanzen wie die Sicht je Person, in einer Anfrage', async () => {
    const alle = await listBilanzenAlle(BETRIEB, '2025-10');
    for (const wer of [dauer, faelle]) {
      const ihre = alle.filter((b) => b.userId === wer.uid).map((b) => {
        const ohneId: Record<string, unknown> = { ...b };
        delete ohneId.userId;
        return ohneId;
      });
      expect(ihre).toEqual(await listBilanzen(BETRIEB, wer.uid, '2025-10'));
    }
    expect(new Set(alle.map((b) => b.userId))).toEqual(new Set([dauer.uid, faelle.uid]));
    // Ab einem späteren Monat nur die späteren Monate; seitenweise je Person dasselbe.
    expect((await listBilanzenAlle(BETRIEB, '2026-09')).every((b) => b.monat >= '2026-09')).toBe(true);
    expect(await listBilanzenAlle(BETRIEB, '2025-10', 1)).toEqual(alle);
  });

  it('monatsbilanzen_alle: ohne Buchhaltung oder Spitze nur die eigenen; nie ein fremder Betrieb', async () => {
    clientEinreichen(faelle.client);
    try {
      const eigene = await listBilanzenAlle(BETRIEB, '2025-10');
      expect(eigene.length).toBeGreaterThan(0);
      expect(eigene.every((b) => b.userId === faelle.uid)).toBe(true);
    } finally {
      clientEinreichen(chefin.client);
    }
    clientEinreichen(fremd.client);
    try {
      expect((await listBilanzenAlle(FREMD, '2025-10')).every((b) => b.userId === fremd.uid)).toBe(true);
      expect((await listBilanzenAlle(BETRIEB, '2025-10')).some((b) => b.userId === dauer.uid)).toBe(false);
    } finally {
      clientEinreichen(chefin.client);
    }
  });
});
