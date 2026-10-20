/**
 * Die Fragen der Startseite (Ladezeit, 19.10.2026) — gegen die echte
 * Datenbank.
 *
 * „Baustellen ohne Einsatz“ und „nicht verrechnet“ holen nur die Spalten,
 * die sie brauchen.
 * „Tage ohne Buchung“ und „knapp“ fragen nach der Antwort statt nach den
 * Rohdaten: `buchungstage` gibt jeden Tag je Person einmal, `lager_knapp`
 * nur die knappen Artikel. Geprüft wird, dass dabei dieselbe Antwort
 * herauskommt wie über den alten Weg im Browser — und dieselben Rechte gelten.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { buchungstage, listEntriesInRange } from '@/lib/db/pg/timeEntries';
import { baustellenEinsatzlage, listAssignmentsInRange, listEinsatztageInRange } from '@/lib/db/pg/assignments';
import { ohneEinsatzListe, planFenster } from '@/features/projects/baustellenLage';
import { lagerFrei, lagerKnapp, listLagerartikel } from '@/lib/db/pg/materials';
import { listRecentWorkSheetKoepfe, listRecentWorkSheets } from '@/lib/db/pg/workSheets';
import { istKnapp } from '@/features/orders/lagerartikel';

const BETRIEB = 'schmale-abfragen';
const FREMD = 'schmale-abfragen-fremd';
const GRENZE = 5;
let chefin: Konto;
let monteur: Konto;
let kollege: Konto;
let fremd: Konto;
const zugesagt = randomUUID();

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'sa-gf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'sa-mon');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'sa-kol');
  fremd = await konto(FREMD, 'Mitarbeiter', 'sa-fremd');
  const buchung = (wer: Konto, date: string, start = '07:00', end = '15:30') => ({
    id: randomUUID(), company_id: wer.betrieb, user_id: wer.uid, user_name: wer.rolle, date, status: 'Anwesend',
    start_time: start, end_time: end, break_duration: 30, comment: 'Heizung getauscht', customer_name: 'Huber',
  });
  const fehler = [
    (await admin.from('time_entries').insert([
      buchung(monteur, '2026-09-01', '07:00', '11:00'),
      // Zwei Buchungen an einem Tag: der Tag zählt einmal.
      buchung(monteur, '2026-09-01', '11:30', '15:30'),
      buchung(monteur, '2026-09-02'),
      buchung(monteur, '2026-10-05'),
      buchung(kollege, '2026-09-02'),
      buchung(kollege, '2026-09-03'),
      buchung(fremd, '2026-09-04'),
    ])).error,
    (await admin.from('assignments').insert([
      { company_id: BETRIEB, date: '2026-09-01', project_number: 'B-1', user_id: monteur.uid, comment: 'Schlüssel beim Nachbarn' },
      { company_id: BETRIEB, date: '2026-09-03', project_number: 'B-2', user_id: monteur.uid },
      // Für die Einsatzlage, vom 15.09. aus gesehen: B-1 kommt wieder, B-2 nicht, B-3 erst nach dem Fenster.
      { company_id: BETRIEB, date: '2026-09-20', project_number: 'B-1', user_id: kollege.uid },
      { company_id: BETRIEB, date: '2026-09-25', project_number: 'B-1', user_id: monteur.uid },
      { company_id: BETRIEB, date: '2026-08-01', project_number: 'B-2', user_id: kollege.uid },
      { company_id: BETRIEB, date: '2026-12-01', project_number: 'B-3', user_id: monteur.uid },
      // Abgeschlossen: hat Einsätze im Fenster, gehört aber nicht in „ohne Einsatz“ (19.10.2026).
      { company_id: BETRIEB, date: '2026-09-10', project_number: 'B-9', user_id: kollege.uid },
    ])).error,
    (await admin.from('projects').insert([
      ...['B-1', 'B-2', 'B-3', 'B-4'].map((n) => ({ company_id: BETRIEB, project_number: n, customer_name: 'Huber', status: 'Aktiv' })),
      { company_id: BETRIEB, project_number: 'B-9', customer_name: 'Huber', status: 'Abgeschlossen' },
      // Laufend im fremden Betrieb: dort bliebe sein Einsatz am 16.09. sichtbar, würde der Betrieb nicht geprüft.
      { company_id: FREMD, project_number: 'B-2', customer_name: 'Fremd', status: 'Aktiv' },
    ])).error,
    (await admin.from('assignments').insert({ company_id: FREMD, date: '2026-09-16', project_number: 'B-2', user_id: fremd.uid })).error,
    (await admin.from('materials').insert([
      // Mit Mindestmenge: knapp darunter, nicht darauf.
      { id: randomUUID(), company_id: BETRIEB, name: 'Kupferrohr 15', unit: 'm', stock: 3, lagerartikel: true, mindestmenge: 10, verkaufspreis: 9.5 },
      { id: randomUUID(), company_id: BETRIEB, name: 'Kupferrohr 18', unit: 'm', stock: 10, lagerartikel: true, mindestmenge: 10 },
      // Ohne Mindestmenge: knapp bis einschließlich zur Grenze.
      { id: randomUUID(), company_id: BETRIEB, name: 'Muffe 1/2', unit: 'Stk', stock: GRENZE, lagerartikel: true },
      { id: randomUUID(), company_id: BETRIEB, name: 'Muffe 3/4', unit: 'Stk', stock: GRENZE + 1, lagerartikel: true },
      // Im Regal genug, aber fast alles zugesagt: knapp ist, was FREI ist.
      { id: zugesagt, company_id: BETRIEB, name: 'Zugesagt', unit: 'Stk', stock: 20, lagerartikel: true },
      { id: randomUUID(), company_id: BETRIEB, name: 'Katalogartikel', unit: 'Stk', stock: 0, lagerartikel: false },
      { id: randomUUID(), company_id: FREMD, name: 'Fremdes Fach', unit: 'Stk', stock: 0, lagerartikel: true },
    ])).error,
    (await admin.from('work_sheets').insert(['Huber', 'Berger', 'Gruber', 'Maier'].map((kunde, i) => ({
      id: randomUUID(), company_id: BETRIEB, project_number: `B-${i}`, customer_name: kunde, datum: `2026-09-0${i + 1}`,
      status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Monteur',
      created_at: `2026-09-0${i + 1}T08:00:00Z`,
    })))).error,
  ].filter(Boolean);
  if (fehler.length) throw new Error(fehler.map((f) => f!.message).join('; '));
  const { error } = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: BETRIEB, material_id: zugesagt, material_name: 'Zugesagt', quantity: 17, status: 'Offen',
    transaction_type: 'order', processed: false, beschaffung: 'lager', is_urgent: false,
    user_id: monteur.uid, user_name: 'Monteur', project_number: 'B-1',
  });
  if (error) throw new Error(error.message);
  clientEinreichen(chefin.client);
}, 60_000);

afterAll(() => clientEinreichen(null));

describe('Tage ohne Buchung: buchungstage', () => {
  it('jeder Tag je Person einmal — dieselben Tage wie aus den vollen Buchungen', async () => {
    const tage = await buchungstage('2026-09-01', '2026-09-30');
    const voll = await listEntriesInRange(BETRIEB, '2026-09-01', '2026-09-30');
    const ausVoll = [...new Set(voll.map((e) => `${e.userId}|${e.date}`))].sort();
    expect(tage.map((t) => `${t.userId}|${t.date}`).sort()).toEqual(ausVoll);
    // Gegenprobe: die vollen Buchungen sind mehr Zeilen, und tragen, was die Frage nicht braucht.
    expect(voll).toHaveLength(5);
    expect(tage).toHaveLength(4);
    expect(Object.keys(tage[0]).sort()).toEqual(['date', 'userId']);
  });

  it('hält den Zeitraum ein und blättert vollständig', async () => {
    expect(await buchungstage('2026-09-01', '2026-10-31', 2)).toHaveLength(5);
    expect((await buchungstage('2026-10-01', '2026-10-31')).map((t) => t.date)).toEqual(['2026-10-05']);
  });

  it('ohne Buchhaltung oder Spitze nur die eigenen Tage — wie `time_entries_lesen`', async () => {
    clientEinreichen(monteur.client);
    try {
      const tage = await buchungstage('2026-09-01', '2026-09-30');
      expect(tage.every((t) => t.userId === monteur.uid)).toBe(true);
      expect(tage.map((t) => t.date)).toEqual(['2026-09-01', '2026-09-02']);
    } finally {
      clientEinreichen(chefin.client);
    }
  });

  it('nur aus dem eigenen Betrieb', async () => {
    const tage = await buchungstage('2026-09-01', '2026-09-30');
    expect(tage.some((t) => t.userId === fremd.uid)).toBe(false);
  });
});

describe('Baustellen ohne Einsatz: Einsatztage', () => {
  it('dieselben Zeilen wie die vollen Einsätze, nur Person, Tag und Baustelle', async () => {
    const schmal = await listEinsatztageInRange(BETRIEB, '2026-09-01', '2026-09-30');
    const voll = await listAssignmentsInRange(BETRIEB, '2026-09-01', '2026-09-30');
    expect(schmal.map((a) => `${a.userId}|${a.date}|${a.projectNumber}`)).toEqual(voll.map((a) => `${a.userId}|${a.date}|${a.projectNumber}`));
    expect(Object.keys(schmal[0]).sort()).toEqual(['date', 'id', 'projectNumber', 'userId']);
  });
});

describe('Baustellen ohne Einsatz: baustellen_einsatzlage', () => {
  const HEUTE = '2026-09-15';
  const { von, bis } = planFenster(HEUTE);
  const projekte = ['B-1', 'B-2', 'B-3', 'B-4'].map((projectNumber) => ({ projectNumber, status: 'Aktiv' as const }));
  const zuZeilen = (lage: Awaited<ReturnType<typeof baustellenEinsatzlage>>) =>
    lage.flatMap((l) => [l.zuletzt, l.naechster].filter((d): d is string => !!d).map((date) => ({ projectNumber: l.projectNumber, date })));

  it('je Baustelle der letzte Einsatz davor und der nächste ab heute, im Fenster', async () => {
    expect(await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis)).toEqual([
      { projectNumber: 'B-1', zuletzt: '2026-09-01', naechster: '2026-09-20' },
      { projectNumber: 'B-2', zuletzt: '2026-09-03', naechster: null },
    ]);
  });

  it('Gleichbleiben: dieselben Baustellen ohne Einsatz wie aus allen Einsätzen', async () => {
    const alle = await listAssignmentsInRange(BETRIEB, von, bis);
    const alt = ohneEinsatzListe(projekte, alle, HEUTE);
    const neu = ohneEinsatzListe(projekte, zuZeilen(await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis)), HEUTE);
    expect(neu).toEqual(alt);
    expect(neu.map((p) => p.projectNumber)).toEqual(['B-2', 'B-3', 'B-4']);
    // Gegenprobe: alle Einsätze sind mehr Zeilen als die Lage.
    expect(alle.length).toBeGreaterThan(zuZeilen(await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis)).length);
  });

  it('blättert vollständig', async () => {
    expect(await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis, 1)).toHaveLength(2);
  });

  it('nur laufende Baustellen: eine abgeschlossene mit Einsatz im Fenster fehlt', async () => {
    const lage = await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis);
    expect(lage.map((l) => l.projectNumber)).not.toContain('B-9');
    // Gegenprobe: ihr Einsatz liegt im Fenster und ist lesbar — es ist der Status, der sie ausnimmt.
    expect((await listAssignmentsInRange(BETRIEB, von, bis)).map((a) => a.projectNumber)).toContain('B-9');
  });

  it('nicht für Fremde: kein Einsatz eines anderen Betriebs, auch nicht über dessen Kennung', async () => {
    const lage = await baustellenEinsatzlage(BETRIEB, von, HEUTE, bis);
    expect(lage.find((l) => l.projectNumber === 'B-2')?.naechster).toBeNull();
    expect(await baustellenEinsatzlage(FREMD, von, HEUTE, bis)).toEqual([]);
  });
});

describe('nicht verrechnet: die Köpfe der jüngsten Scheine', () => {
  it('dieselben Scheine in derselben Folge wie die ganzen — nur der Kopf', async () => {
    const koepfe = await listRecentWorkSheetKoepfe(BETRIEB, 3);
    const ganz = await listRecentWorkSheets(BETRIEB, 3);
    expect(koepfe.map((s) => s.id)).toEqual(ganz.map((s) => s.id));
    expect(koepfe.map((s) => s.customerName)).toEqual(['Maier', 'Gruber', 'Berger']);
    expect(Object.keys(koepfe[0]).sort()).toEqual(['customerName', 'datum', 'id', 'projectNumber', 'status']);
    // Gegenprobe: der ganze Schein bringt Stunden, Material und Fotos mit.
    expect(ganz[0]).toHaveProperty('zeiten');
  });
});

describe('knapp: lager_knapp', () => {
  it('genau die knappen Lagerartikel, mit dem Freien', async () => {
    const knapp = await lagerKnapp(GRENZE);
    expect(knapp.map((a) => [a.name, a.frei, a.mindestmenge])).toEqual([
      ['Kupferrohr 15', 3, 10],
      ['Muffe 1/2', GRENZE, null],
      ['Zugesagt', 3, null],
    ]);
    expect(knapp[0]).toEqual(expect.objectContaining({ unit: 'm' }));
  });

  it('Gleichbleiben: dieselbe Antwort wie der alte Weg im Browser (alle Lagerartikel, ihr Freies, `istKnapp`)', async () => {
    const artikel = await listLagerartikel(BETRIEB);
    const frei = await lagerFrei(artikel.map((m) => m.id));
    const alt = artikel
      .map((m) => ({ m, f: frei.get(m.id)?.frei ?? m.stock }))
      .filter(({ m, f }) => istKnapp(f, m, GRENZE))
      .map(({ m, f }) => `${m.id}|${f}`)
      .sort();
    expect((await lagerKnapp(GRENZE)).map((a) => `${a.id}|${a.frei}`).sort()).toEqual(alt);
    // Gegenprobe: der alte Weg trug jeden Lagerartikel in den Browser, die Antwort nur die knappen.
    expect(artikel).toHaveLength(5);
  });

  it('blättert vollständig', async () => {
    expect((await lagerKnapp(GRENZE, 2)).map((a) => a.name)).toEqual(['Kupferrohr 15', 'Muffe 1/2', 'Zugesagt']);
  });

  it('nicht für Fremde: ein anderer Betrieb sieht keines dieser Fächer', async () => {
    clientEinreichen(fremd.client);
    try {
      const knapp = await lagerKnapp(GRENZE);
      expect(knapp.some((a) => ['Kupferrohr 15', 'Muffe 1/2', 'Zugesagt'].includes(a.name))).toBe(false);
    } finally {
      clientEinreichen(chefin.client);
    }
  });
});
