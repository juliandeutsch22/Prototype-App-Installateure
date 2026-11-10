/**
 * Zwei Entscheidungen über denselben Urlaubsantrag zur selben Zeit.
 *
 * DER BEFUND (09.11.2026). `urlaub_entscheiden` las den Antrag ohne Sperre.
 * Entschieden zwei Berechtigte gleichzeitig — die Chefin am Telefon, die
 * Buchhaltung am Schreibtisch —, sahen beide „Beantragt“, und beide gingen
 * durch: zweimal genehmigt hieß jeder Urlaubstag doppelt im Zeitkonto (zwei
 * Urlaubstage je Tag im Saldo und im Resturlaub); genehmigt und abgelehnt
 * zugleich hieß ein abgelehnter Antrag mit gebuchten Urlaubstagen daneben.
 * Seit 20261110110000 sperrt die Funktion den Antrag (`for update`); die
 * zweite Entscheidung wartet und sieht danach „bereits entschieden“.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'urlaub-gleichzeitig';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let chefin: Konto;
let buchhaltung: Konto;
let monteur: Konto;
let db: Client;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  buchhaltung = await konto(BETRIEB, 'Geschäftsführung', 'zweite');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  db = new Client({ connectionString: DB });
  await db.connect();
}, 120_000);

afterAll(async () => {
  await db?.end();
});

/** Mo–Fr derselben Woche — die Wochen der Tests haben keinen Feiertag, also fünf Arbeitstage. */
async function antragAnlegen(von: string, bis: string): Promise<string> {
  const { data, error } = await admin.from('vacations').insert({
    company_id: BETRIEB, user_id: monteur.uid, user_name: 'Monteur',
    von, bis, tage: 5, status: 'Beantragt',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

async function stand(id: string) {
  const { data: a } = await admin.from('vacations').select('status').eq('id', id).single();
  const { data: z } = await admin.from('time_entries')
    .select('date').eq('company_id', BETRIEB).eq('user_id', monteur.uid).eq('vacation_id', id);
  const jeTag = new Map<string, number>();
  for (const e of z ?? []) jeTag.set(e.date as string, (jeTag.get(e.date as string) ?? 0) + 1);
  return { status: a!.status as string, jeTag };
}

const entscheiden = (k: Konto, id: string, entscheidung: 'Genehmigt' | 'Abgelehnt') =>
  k.client.rpc('urlaub_entscheiden', {
    p_antrag: id, p_entscheidung: entscheidung, p_grund: 'Gleichzeitig entschieden', p_entscheider_name: 'Test',
  });

/** Die Ansprüche aus dem Anmeldetoken — damit eine eigene Verbindung als diese Person handelt. */
function ansprueche(k: Konto): string {
  return Buffer.from(k.token.split('.')[1], 'base64url').toString('utf8');
}

describe('Gleichzeitige Entscheidungen über einen Antrag', () => {
  it('zweimal genehmigt: genau eine geht durch, je Tag genau ein Urlaubseintrag', async () => {
    // Mehrere Runden: ob zwei Aufrufe über das Netz sich wirklich treffen,
    // entscheidet der Zufall. Der Nachweis, dass die zweite WARTET, steht im
    // Test darunter; hier zählt das Ergebnis im echten Ablauf.
    const wochen = [
      ['2027-03-01', '2027-03-05'], ['2027-03-08', '2027-03-12'], ['2027-03-15', '2027-03-19'],
      ['2027-04-12', '2027-04-16'], ['2027-04-19', '2027-04-23'],
    ];
    for (const [von, bis] of wochen) {
      const id = await antragAnlegen(von, bis);
      const antworten = await Promise.all([
        entscheiden(chefin, id, 'Genehmigt'),
        entscheiden(buchhaltung, id, 'Genehmigt'),
      ]);
      const ok = antworten.filter((r) => !r.error);
      expect(ok, `${von}: ${antworten.map((r) => r.error?.message).join(' / ')}`).toHaveLength(1);
      expect(antworten.find((r) => r.error)?.error?.message).toMatch(/bereits entschieden/);
      const s = await stand(id);
      expect(s.status).toBe('Genehmigt');
      expect(s.jeTag.size).toBe(5);
      expect([...s.jeTag.values()].every((n) => n === 1)).toBe(true);
    }
  }, 60_000);

  it('genehmigt und abgelehnt zugleich: der Antrag und das Zeitkonto passen zusammen', async () => {
    for (const [von, bis] of [['2027-09-06', '2027-09-10'], ['2027-09-13', '2027-09-17'], ['2027-09-20', '2027-09-24']]) {
      const id = await antragAnlegen(von, bis);
      const antworten = await Promise.all([
        entscheiden(chefin, id, 'Genehmigt'),
        entscheiden(buchhaltung, id, 'Abgelehnt'),
      ]);
      expect(antworten.filter((r) => !r.error)).toHaveLength(1);
      const s = await stand(id);
      // Abgelehnt: kein Urlaubstag. Genehmigt: jeder Tag genau einmal.
      if (s.status === 'Abgelehnt') expect(s.jeTag.size).toBe(0);
      else expect([...s.jeTag.values()]).toEqual([1, 1, 1, 1, 1]);
    }
  }, 60_000);

  it('die zweite Entscheidung wartet, bis die erste fertig ist', async () => {
    /*
      DER BELASTBARE NACHWEIS, unabhängig vom Zufall im Netz: die erste
      Entscheidung läuft in einer eigenen, noch offenen Transaktion, als die
      Chefin. Erst danach kommt die zweite über die Schnittstelle. Ohne Sperre
      las sie den alten Stand „Beantragt“, buchte die fünf Tage ein zweites
      Mal und überschrieb danach die erste Entscheidung.
    */
    const id = await antragAnlegen('2027-06-07', '2027-06-11');
    await db.query('begin');
    let zweite: PromiseLike<Awaited<ReturnType<typeof entscheiden>>> | null = null;
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [ansprueche(chefin)]);
      await db.query('set local role authenticated');
      const { rows } = await db.query(
        `select public.urlaub_entscheiden($1, 'Genehmigt', '', 'Chefin') as r`, [id],
      );
      expect(rows[0].r).toMatchObject({ status: 'Genehmigt', angelegt: 5 });

      // `.then` schickt die Anfrage ab — der Aufbau allein tut es nicht.
      zweite = entscheiden(buchhaltung, id, 'Genehmigt').then((r) => r);
      // Der zweiten Zeit geben, bis an die Sperre zu laufen.
      await new Promise((r) => setTimeout(r, 1500));
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
    const antwort = await zweite!;
    expect(antwort.error?.message).toMatch(/bereits entschieden/);
    const s = await stand(id);
    expect(s.status).toBe('Genehmigt');
    expect([...s.jeTag.values()]).toEqual([1, 1, 1, 1, 1]);
  }, 30_000);
});
