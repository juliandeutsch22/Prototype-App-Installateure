/**
 * DIE ZWISCHENSTÄNDE DES ZEITKONTOS (Durchsicht 15.11.2026, L13,
 * `20261117012000_zeitkonto_zwischenstand.sql`).
 *
 * `zeitkonto_salden` rechnete jeden Monat seit dem Saldo-Start bei jedem
 * Aufruf neu: 50 Personen, zehn Jahre, 119.000 Buchungen 750 ms. Jetzt kommen
 * vergangene Monate aus `app.zeitkonto_monatsstand` (stündlich gefüllt, bei
 * jeder Änderung einer Eingabe in derselben Transaktion entfernt), gerechnet
 * wird nur, was fehlt.
 *
 * Die eine Eigenschaft, auf die es ankommt: der Saldo bleibt auf die
 * Hundertstelstunde derselbe — vor dem Füllen, nach dem Füllen und nach jeder
 * Art von Änderung, gegen `calcOverallSaldo` der App auf dem gewachsenen
 * Bestand (`tests/fixtures/zeitkontoBestand.ts`) und gegen die Rechnung ohne
 * Speicher auf einem großen Bestand. Dazu die Gegenproben: dass gelesen wird,
 * was gespeichert ist (sonst prüfte das alles nichts), dass eine Änderung,
 * die die Rechnung nicht berührt, nichts entfernt, und dass das Füllen
 * wartet, solange jemand ändert.
 *
 * Alles in einer Transaktion, die zurückgerollt wird.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { calcOverallSaldo, todayStr } from '@/lib/time';
import { zeitkontoBestand, type BestandPerson } from '../fixtures/zeitkontoBestand';
import type { ArbeitszeitAbschnitt, TimeEntry } from '@/types';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const PRAEFIX = `zk-zw-${randomUUID().slice(0, 6)}`;
const bestand = zeitkontoBestand(todayStr(), 8150, PRAEFIX);
const BUERO = new Map(bestand.betriebe.map((b) => [b.id, randomUUID()]));
const A = bestand.betriebe[0].id;

/** Der Stand der App: Personen und Buchungen, wie die Prüfungen sie verändern. */
const personen = new Map(bestand.personen.map((p) => [p.uid, { ...p } as BestandPerson]));
const buchungen = new Map(bestand.buchungen.map((e) => [e.id, { ...e } as TimeEntry]));
const halbe = new Map(bestand.betriebe.map((b) => [b.id, b.halbeTage]));

const vorMonaten = (n: number, tag = 10) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  d.setDate(tag);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function alsBuero<T>(betrieb: string, f: () => Promise<T>): Promise<T> {
  await db.query('savepoint buero');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: BUERO.get(betrieb), role: 'authenticated', app_metadata: { company_id: betrieb } }),
    ]);
    await db.query('set local role authenticated');
    return await f();
  } finally {
    await db.query('rollback to savepoint buero');
  }
}

/** Je Person die Zahl aus der Datenbank. */
async function salden(betrieb: string): Promise<Map<string, { saldo: number; luecken: number }>> {
  const rows = await alsBuero(betrieb, async () => (await db.query('select * from public.zeitkonto_salden()')).rows);
  return new Map(rows.map((z) => [z.user_id as string, { saldo: Number(z.saldo_h), luecken: Number(z.tage_ohne_buchung) }]));
}

/** Datenbank = App, für alle Personen beider Betriebe. */
async function gleichWieApp(): Promise<void> {
  for (const b of bestand.betriebe) {
    const db_ = await salden(b.id);
    for (const p of [...personen.values()].filter((x) => x.companyId === b.id)) {
      const e = calcOverallSaldo(p, [...buchungen.values()].filter((x) => x.userId === p.uid), halbe.get(b.id)!);
      expect({ name: p.name, ...db_.get(p.uid) }).toEqual({ name: p.name, saldo: e.saldoH, luecken: e.daysWithoutEntry });
    }
  }
}

/*
  DIE MONATSBILANZEN (Befund 4): `zeitkonto_monate` nimmt dieselben
  Zwischenstände. Verglichen Zeile für Zeile mit der Rechnung ohne Speicher,
  gerundet wie die Funktion — über den ganzen Zeitraum und über ein Jahr
  mitten darin (dort beginnt der Speicher nicht beim Saldo-Start).
*/
async function monateGleich(): Promise<void> {
  for (const b of bestand.betriebe) {
    for (const [von, bis] of [['2000-01-01', '2099-12-31'], [vorMonaten(18, 1), vorMonaten(6, 1)]]) {
      const mit = await alsBuero(b.id, async () => (await db.query(
        `select user_id, monat, soll_min::text, ist_min::text, gutschrift_min::text, saldo_min::text, pflichttage::text, ohne_buchung
           from public.zeitkonto_monate($1, $2) order by 1, 2`, [von, bis])).rows);
      const ohne = (await db.query(
        `select r.user_id, to_char(r.monat, 'YYYY-MM') as monat, round(r.soll_min, 2)::text as soll_min, round(r.ist_min, 2)::text as ist_min,
                round(r.gutschrift_min, 2)::text as gutschrift_min, round(r.ist_min + r.gutschrift_min - r.soll_min, 2)::text as saldo_min,
                r.pflichttage::text as pflichttage, r.ohne_buchung
           from app.zeitkonto_rechnung(array(select u.id from public.users u where u.company_id = $1),
                                       date_trunc('month', $2::date)::date, (date_trunc('month', $3::date) + interval '1 month - 1 day')::date) r
          order by 1, 2`, [b.id, von, bis])).rows;
      expect(mit).toEqual(ohne);
      expect(mit.length).toBeGreaterThan(5);
    }
  }
}

const gespeichert = async (uid: string, monat?: string) => Number((await db.query(
  `select count(*) from app.zeitkonto_monatsstand where user_id = $1 and ($2::date is null or monat = date_trunc('month', $2::date))`,
  [uid, monat ?? null],
)).rows[0].count);

/*
  NUR DIE BETRIEBE DIESER PRÜFUNG: das Füllen hält die Sperre jedes Betriebs,
  den es anfasst, bis zum Ende der Transaktion — ohne Einschränkung warteten
  gleichzeitig laufende Prüfungen anderer Betriebe auf diese hier.
*/
async function fuellen(betriebe: string[] = bestand.betriebe.map((b) => b.id)): Promise<number> {
  let n = 0;
  for (const b of betriebe) n += Number((await db.query('select app.zeitkonto_zwischenstand_fuellen($1) as n', [b])).rows[0].n);
  return n;
}

/** Eine Buchung so in die Datenbank, wie sie im Bestand steht. */
const alsZeile = (e: TimeEntry) => [
  e.id, e.companyId, e.userId, e.userName ?? null, e.date, e.status, e.startTime ?? null, e.endTime ?? null,
  e.breakDuration ?? 0, e.hours ?? null, e.unterrichtMin ?? null,
];
const EINFUEGEN = `insert into public.time_entries
  (id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration, hours, unterricht_min)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  for (const b of bestand.betriebe) {
    await db.query(`insert into public.companies (id, name, dezember_halbtage) values ($1, $1, $2)`, [b.id, b.halbeTage]);
  }
  const konten = [
    ...bestand.personen.map((p) => ({ id: p.uid, betrieb: p.companyId, name: p.name, rolle: p.role, p })),
    ...bestand.betriebe.map((b) => ({ id: BUERO.get(b.id)!, betrieb: b.id, name: 'Büro', rolle: 'Buchhaltung', p: null })),
  ];
  for (const k of konten) {
    await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                    values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [k.id, `${k.id}@zw.test`]);
    await db.query(`insert into public.users (id, company_id, name, email, role, active, weekly_target_hours, work_days, tagessoll,
                                              app_start_date, austritt, fuehrt_zeitkonto)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [k.id, k.betrieb, k.name, `${k.id}@zw.test`, k.rolle, k.p ? k.p.active !== false : true, k.p?.weeklyTargetHours ?? null,
      k.p?.workDays ?? [1, 2, 3, 4, 5], k.p?.tagessoll ? JSON.stringify(k.p.tagessoll) : null, k.p?.appStartDate ?? null,
      k.p?.austritt ?? null, k.p?.fuehrtZeitkonto === true]);
    if (k.p) {
      await db.query(`insert into public.zeitkonto_anfang (company_id, user_id, initial_overtime) values ($1, $2, $3)`,
        [k.betrieb, k.id, k.p.initialOvertime ?? 0]);
    }
  }
  for (const e of bestand.buchungen) await db.query(EINFUEGEN, alsZeile(e));
  await db.query('set local session_replication_role = origin');
  await db.query('analyze public.time_entries');
}, 300_000);

afterAll(async () => {
  await db.query('rollback');
  await db.end();
});

describe('Saldo mit Zwischenständen = Saldo der App', () => {
  it('ohne gespeicherte Stände (wie bisher gerechnet)', async () => {
    await db.query(`delete from app.zeitkonto_monatsstand z using public.users u where u.id = z.user_id and u.company_id = any($1)`,
      [bestand.betriebe.map((b) => b.id)]);
    await gleichWieApp();
  });

  it('nach dem Füllen: vergangene Monate gespeichert, nie der laufende, nur aktive Konten', async () => {
    expect(await fuellen()).toBeGreaterThan(100);
    const kurzerFreitag = bestand.personen[1];
    const monate = Number((await db.query(
      `select count(*) from app.zeitkonto_monatsstand where user_id = $1`, [kurzerFreitag.uid])).rows[0].count);
    const erwartet = (new Date().getFullYear() - Number(kurzerFreitag.appStartDate!.slice(0, 4))) * 12 + new Date().getMonth();
    expect(monate).toBe(erwartet);
    expect(await gespeichert(kurzerFreitag.uid, todayStr())).toBe(0);
    const ausgetreten = bestand.personen.find((p) => p.name === 'Ausgetreten')!;
    expect(await gespeichert(ausgetreten.uid)).toBe(0);
    await gleichWieApp();
    await monateGleich();
  });

  it('Gegenprobe: gelesen wird, was gespeichert ist — ein verfälschter Monat verfälscht den Saldo', async () => {
    const p = bestand.personen[0];
    await db.query('savepoint falsch');
    await db.query(`update app.zeitkonto_monatsstand set soll_min = soll_min + 600 where user_id = $1 and monat = date_trunc('month', $2::date)`,
      [p.uid, vorMonaten(5)]);
    const falsch = (await salden(p.companyId)).get(p.uid)!.saldo;
    // Auch die Monatsbilanz liest den gespeicherten Stand (Befund 4).
    const monatFalsch = await alsBuero(p.companyId, async () => Number((await db.query(
      `select soll_min from public.zeitkonto_monate($1, $1, $2)`, [vorMonaten(5), p.uid])).rows[0].soll_min));
    await db.query('rollback to savepoint falsch');
    const monatRichtig = await alsBuero(p.companyId, async () => Number((await db.query(
      `select soll_min from public.zeitkonto_monate($1, $1, $2)`, [vorMonaten(5), p.uid])).rows[0].soll_min));
    expect(monatFalsch - monatRichtig).toBe(600);
    expect(falsch).toBeCloseTo((await salden(p.companyId)).get(p.uid)!.saldo - 10, 2);
  });

  it('ein anderer Fingerabdruck der Rechnung gilt nicht — gelesen wird gerechnet, das Füllen räumt ihn weg', async () => {
    const p = bestand.personen[0];
    await db.query('savepoint stand');
    await db.query(`update app.zeitkonto_monatsstand set rechenstand = 'alte Rechnung', soll_min = soll_min + 600 where user_id = $1`, [p.uid]);
    await gleichWieApp();
    await fuellen();
    expect(Number((await db.query(`select count(*) from app.zeitkonto_monatsstand where rechenstand = 'alte Rechnung'`)).rows[0].count)).toBe(0);
    await db.query('rollback to savepoint stand');
  });
});

describe('Jede Änderung einer Eingabe nimmt ihren Monat heraus — der Saldo bleibt richtig', () => {
  const eine = (p: BestandPerson, monat: string, status: TimeEntry['status'] = 'Anwesend') =>
    [...buchungen.values()].find((e) => e.userId === p.uid && e.date.startsWith(monat.slice(0, 7)) && e.status === status && e.startTime)!;

  it('Buchung geändert (Ende später)', async () => {
    const p = bestand.personen[0];
    const e = eine(p, vorMonaten(7));
    expect(await gespeichert(p.uid, e.date)).toBe(1);
    await db.query(`update public.time_entries set end_time = '18:45' where id = $1`, [e.id]);
    buchungen.set(e.id, { ...e, endTime: '18:45' });
    expect(await gespeichert(p.uid, e.date)).toBe(0);
    await gleichWieApp();
  });

  it('Gegenprobe: was die Rechnung nicht liest (Kommentar, Kunde), nimmt nichts heraus', async () => {
    const p = bestand.personen[0];
    const e = eine(p, vorMonaten(9));
    await db.query(`update public.time_entries set comment = 'Notiz', customer_name = 'Kunde X' where id = $1`, [e.id]);
    expect(await gespeichert(p.uid, e.date)).toBe(1);
  });

  it('Buchung in einen anderen Monat verschoben — beide Monate', async () => {
    const p = bestand.personen[1];
    const e = eine(p, vorMonaten(11));
    const neu = freierTag(p, 14);
    await db.query(`update public.time_entries set date = $2 where id = $1`, [e.id, neu]);
    buchungen.set(e.id, { ...e, date: neu });
    expect(await gespeichert(p.uid, e.date)).toBe(0);
    expect(await gespeichert(p.uid, neu)).toBe(0);
    await gleichWieApp();
  });

  it('Buchung gelöscht und eine neue eingetragen (Arbeit an einem freien Tag)', async () => {
    const p = bestand.personen[2];
    const weg = eine(p, vorMonaten(4));
    await db.query(`delete from public.time_entries where id = $1`, [weg.id]);
    buchungen.delete(weg.id);
    const dazu: TimeEntry = { id: randomUUID(), companyId: p.companyId, userId: p.uid, userName: p.name, date: freierTag(p, 6),
      status: 'Anwesend', startTime: '08:00', endTime: '12:30', breakDuration: 0 } as TimeEntry;
    await db.query(EINFUEGEN, alsZeile(dazu));
    buchungen.set(dazu.id, dazu);
    expect(await gespeichert(p.uid, weg.date)).toBe(0);
    expect(await gespeichert(p.uid, dazu.date)).toBe(0);
    await gleichWieApp();
  });

  it('nach erneutem Füllen wieder gespeichert, und weiter gleich — Saldo und Monatsbilanzen', async () => {
    expect(await gespeichert(bestand.personen[0].uid, vorMonaten(7))).toBe(0);
    await monateGleich();
    await fuellen();
    expect(await gespeichert(bestand.personen[0].uid, vorMonaten(7))).toBe(1);
    await gleichWieApp();
    await monateGleich();
  });

  it('Arbeitszeit rückwirkend geändert (Verlauf ab einem vergangenen Monat) — alle Monate der Person', async () => {
    const p = personen.get(bestand.personen[0].uid)!;
    const verlauf: ArbeitszeitAbschnitt[] = [
      { ab: p.appStartDate!, wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
      { ab: vorMonaten(8, 1), wochenstunden: 30, arbeitstage: [1, 2, 3, 4], tagessoll: null },
    ];
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await db.query(`update public.users set arbeitszeit_verlauf = $2 where id = $1`, [p.uid, JSON.stringify(verlauf)]);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    personen.set(p.uid, { ...p, arbeitszeitVerlauf: verlauf, weeklyTargetHours: 30, workDays: [1, 2, 3, 4] });
    expect(await gespeichert(p.uid)).toBe(0);
    await gleichWieApp();
    await fuellen();
    await gleichWieApp();
  });

  it('Austritt nachgetragen — alle Monate der Person', async () => {
    const p = personen.get(bestand.personen[2].uid)!;
    const austritt = vorMonaten(3, 15);
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await db.query(`update public.users set austritt = $2 where id = $1`, [p.uid, austritt]);
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    personen.set(p.uid, { ...p, austritt });
    expect(await gespeichert(p.uid)).toBe(0);
    await gleichWieApp();
  });

  it('halbe Tage am 24./31.12. umgestellt — alle Monate des Betriebs', async () => {
    await fuellen();
    await db.query(`update public.companies set dezember_halbtage = false where id = $1`, [A]);
    halbe.set(A, false);
    const imBetrieb = Number((await db.query(`select count(*) from app.zeitkonto_monatsstand where company_id = $1`, [A])).rows[0].count);
    expect(imBetrieb).toBe(0);
    await gleichWieApp();
    await fuellen();
    await gleichWieApp();
    await monateGleich();
  });
});

describe('Kein Wettlauf zwischen Füllen und Ändern', () => {
  /*
    EIN EIGENER BETRIEB: wer hier schon gefüllt hat, hält dessen Sperre bis
    zum Ende der Transaktion — die zweite Verbindung wartete dann auf diese.
  */
  it('solange jemand im Betrieb ändert, füllt das Füllen dort nichts — danach schon', async () => {
    const R = `${PRAEFIX}-r`;
    const person = randomUUID();
    await db.query('savepoint wettlauf');
    try {
      await db.query('set local session_replication_role = replica');
      await db.query(`insert into public.companies (id, name) values ($1, $1)`, [R]);
      await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                      values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [person, `${person}@zw.test`]);
      await db.query(`insert into public.users (id, company_id, name, email, role, weekly_target_hours, app_start_date)
                      values ($1, $2, 'R', $3, 'Mitarbeiter', 40, $4)`, [person, R, `${person}@zw.test`, vorMonaten(3, 1)]);
      await db.query(`insert into public.time_entries (id, company_id, user_id, date, status, start_time, end_time, break_duration)
                      values ($1, $2, $3, $4, 'Anwesend', '07:00', '15:30', 30)`, [randomUUID(), R, person, vorMonaten(2, 10)]);
      await db.query('set local session_replication_role = origin');
      const zweite = new Client({ connectionString: VERBINDUNG });
      await zweite.connect();
      try {
        await zweite.query('begin');
        // Wie der Auslöser einer offenen Änderung im selben Betrieb.
        await zweite.query('select pg_advisory_xact_lock_shared(app.zeitkonto_sperre($1))', [R]);
        expect(await fuellen([R])).toBe(0);
        expect(await gespeichert(person)).toBe(0);
        await zweite.query('commit');
      } finally {
        await zweite.end();
      }
      expect(await fuellen([R])).toBeGreaterThan(0);
      expect(await gespeichert(person, vorMonaten(2))).toBe(1);
    } finally {
      await db.query('rollback to savepoint wettlauf');
    }
  });

  it('mit festem Schnappschuss füllt es gar nicht', async () => {
    const zweite = new Client({ connectionString: VERBINDUNG });
    await zweite.connect();
    try {
      await zweite.query('begin isolation level repeatable read');
      await expect(zweite.query(`select app.zeitkonto_zwischenstand_fuellen('gibt-es-nicht')`)).rejects.toThrow(/read committed/);
      await zweite.query('rollback');
    } finally {
      await zweite.end();
    }
  });
});

describe('Datenauskunft und Löschung', () => {
  it('die Auskunft nennt die Zwischenstände, die Löschung nimmt sie mit', async () => {
    const p = bestand.personen.find((x) => x.name === 'Teilzeit')!;
    const chef = bestand.personen.find((x) => x.name === 'Chef mit Konto')!;
    await fuellen([p.companyId]);
    const vorher = await gespeichert(p.uid);
    expect(vorher).toBeGreaterThan(5);
    await db.query('savepoint loeschen');
    try {
      // Gelöscht wird ein deaktiviertes Konto.
      await db.query('set local session_replication_role = replica');
      await db.query('update public.users set active = false where id = $1', [p.uid]);
      await db.query('set local session_replication_role = origin');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: chef.uid, role: 'authenticated', app_metadata: { company_id: p.companyId } }),
      ]);
      await db.query('set local role authenticated');
      const auskunft = (await db.query(`select public.person_auskunft('mitarbeiter', $1) as a`, [p.uid])).rows[0].a;
      expect(auskunft.daten.zeitkonto_monatsstaende).toHaveLength(vorher);
      await db.query(`select public.person_loeschen('mitarbeiter', $1, false)`, [p.uid]);
      await db.query('reset role');
      expect(await gespeichert(p.uid)).toBe(0);
      // Gefüllt wird nur für aktive Konten — nach der Löschung entsteht nichts neu.
      await fuellen([p.companyId]);
      expect(await gespeichert(p.uid)).toBe(0);
    } finally {
      await db.query('rollback to savepoint loeschen');
    }
  });

  it('niemand außer den Funktionen liest den Speicher', async () => {
    await db.query('savepoint lesen');
    await db.query('set local role authenticated');
    await expect(db.query('select * from app.zeitkonto_monatsstand limit 1')).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint lesen');
  });
});

describe('Großer Bestand: gespeichert und gerechnet ergeben dieselben Monate', () => {
  it('20 Personen, zehn Jahre — je Person und Monat gleich, vor und nach Änderungen', async () => {
    const B = `${PRAEFIX}-gross`;
    await db.query('savepoint gross');
    try {
      await db.query(`insert into public.companies (id, name) values ($1, $1)`, [B]);
      await db.query('set local session_replication_role = replica');
      await db.query(`
        insert into auth.users (id, instance_id, aud, role, email)
        select md5($1 || i)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1 || i || '@zw.test'
          from generate_series(1, 20) i`, [B]);
      await db.query(`
        insert into public.users (id, company_id, name, email, role, active, weekly_target_hours, work_days, tagessoll, app_start_date)
        select md5($1 || i)::uuid, $1, 'P' || i, $1 || i || '@zw.test', 'Mitarbeiter', true,
               case when i % 4 = 0 then 32 else 38.5 end,
               case when i % 4 = 0 then '{1,2,3,4}'::smallint[] else '{1,2,3,4,5}'::smallint[] end,
               case when i % 3 = 0 then '{"1":8.5,"2":8.5,"3":8.5,"4":8.5,"5":4.5}'::jsonb end,
               (current_date - interval '10 years')::date + (i * 37)
          from generate_series(1, 20) i`, [B]);
      await db.query(`select setseed(0.25)`);
      await db.query(`
        insert into public.time_entries (id, company_id, user_id, user_name, date, status, start_time, end_time, break_duration, hours, unterricht_min)
        select gen_random_uuid(), $1, u.id, u.name, d::date,
               case when r < 0.08 then 'Urlaub' when r < 0.11 then 'Krank' when r < 0.12 then 'Berufsschule' else 'Anwesend' end,
               case when r >= 0.12 and r < 0.9 then '07:00'::time end,
               case when r >= 0.12 and r < 0.9 then (case when r < 0.5 then '15:30' else '16:15' end)::time end,
               case when r >= 0.12 and r < 0.9 then 30 else 0 end,
               case when r >= 0.9 then 8.25 end,
               case when r >= 0.11 and r < 0.12 then 300 end
          from public.users u
          cross join lateral generate_series(u.app_start_date, current_date, interval '1 day') d
          cross join lateral (select random() as r) z
         where u.company_id = $1 and extract(dow from d) = any(u.work_days)
           -- Ein fester Zeitraum: hinge die Menge an der Person, rechnete Postgres sie für jede Zeile neu.
           and d::date not in (select f.tag from app.feiertage((current_date - interval '11 years')::date, current_date) f)`, [B]);
      await db.query('set local session_replication_role = origin');
      const ids = (await db.query(`select array_agg(id) as ids from public.users where company_id = $1`, [B])).rows[0].ids as string[];
      const vergleiche = async () => {
        const ohne = (await db.query(`
          select user_id, monat, soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung
            from app.zeitkonto_rechnung($1, '0001-01-01', '9999-12-31') order by 1, 2`, [ids])).rows;
        const mit = (await db.query(`
          select user_id, monat, soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung
            from app.zeitkonto_monate_gemerkt($1)
           where (soll_min, ist_min, gutschrift_min, pflichttage, ohne_buchung) <> (0, 0, 0, 0, 0) order by 1, 2`, [ids])).rows;
        expect(mit.length).toBeGreaterThan(2000);
        expect(mit).toEqual(ohne.filter((z) => [z.soll_min, z.ist_min, z.gutschrift_min, z.pflichttage, z.ohne_buchung].some((w) => Number(w) !== 0)));
        // Ein Zeitraum mitten im Bestand: dieselben Zeilen wie die Rechnung, auch die ohne Wert (Befund 4).
        const vonBis = [vorMonaten(40, 1), vorMonaten(10, 1)];
        const teil = (await db.query(`
          select * from app.zeitkonto_monate_gemerkt($1, date_trunc('month', $2::date)::date,
                                                     (date_trunc('month', $3::date) + interval '1 month - 1 day')::date) order by 1, 2`,
        [ids, ...vonBis])).rows;
        const teilOhne = (await db.query(`
          select * from app.zeitkonto_rechnung($1, date_trunc('month', $2::date)::date,
                                               (date_trunc('month', $3::date) + interval '1 month - 1 day')::date) order by 1, 2`,
        [ids, ...vonBis])).rows;
        expect(teil).toEqual(teilOhne);
        expect(teil.length).toBeGreaterThan(400);
      };
      await vergleiche();
      await fuellen([B]);
      expect(Number((await db.query(`select count(*) from app.zeitkonto_monatsstand where company_id = $1`, [B])).rows[0].count)).toBeGreaterThan(2000);
      await vergleiche();
      // Hundert zufällige Änderungen in vergangenen Monaten, dann noch einmal.
      await db.query(`
        update public.time_entries set end_time = end_time + interval '45 minutes'
         where id in (select id from public.time_entries where company_id = $1 and start_time is not null
                        and date < date_trunc('month', current_date) order by md5(id::text) limit 100)`, [B]);
      await db.query(`
        delete from public.time_entries
         where id in (select id from public.time_entries where company_id = $1 and status = 'Urlaub'
                        and date < date_trunc('month', current_date) order by md5(id::text) limit 50)`, [B]);
      await vergleiche();
      await fuellen([B]);
      await vergleiche();
    } finally {
      await db.query('rollback to savepoint gross');
    }
  }, 600_000);
});

/** Ein Tag im Monat vor `n` Monaten, an dem die Person nichts gebucht hat (keine Überschneidung). */
function freierTag(p: BestandPerson, n: number): string {
  for (let tag = 1; tag <= 28; tag += 1) {
    const d = vorMonaten(n, tag);
    if (![...buchungen.values()].some((e) => e.userId === p.uid && e.date === d)) return d;
  }
  throw new Error('kein freier Tag');
}
