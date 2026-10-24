#!/usr/bin/env node
/**
 * DIE ABSTURZPROBE (N2, 24.10.2026) — nur gegen den lokalen Stapel.
 *
 * WOFÜR. Die Wache über pg_net (`app.anstoss_wache`) erkennt eine Antwort an
 * Anfragenummer UND Generation. Beides hängt an Tabellen, die Postgres nach
 * einem Absturz leert („unlogged“): die Antworten von pg_net, seine
 * Nummernfolge und die Generation selbst. Geprüft war das bisher nur
 * nachgestellt — die Tabelle von Hand geleert (`robusteAblaeufe.test.ts`).
 * Hier stürzt die Datenbank wirklich ab: ein Prozess wird hart beendet,
 * Postgres beendet alle anderen und läuft durch die Wiederherstellung.
 * Danach muss gelten:
 *
 *   1. Bestätigte Daten sind da, unbestätigte nicht.
 *   2. Die unlogged-Tabellen sind leer, die Nummernfolge von pg_net beginnt
 *      neu — dieselbe Nummer kann wiederkommen.
 *   3. Es gibt eine neue Generation, und ein alter Zettel der Wache wird
 *      nicht mit einer neuen Antwort gleicher Nummer verwechselt: er zählt
 *      als „keine Antwort“.
 *   4. Die Dienste (Datenbank-API, Anmeldung) antworten wieder.
 *
 * WARUM KEIN TEST IM PRÜFLAUF. Der Absturz trifft jede Verbindung des Stapels;
 * mitten in der Prüfreihe risse er die Prüfungen daneben mit. Die Probe läuft
 * deshalb von Hand, und ihr Ergebnis steht im Stand (T-46).
 *
 *   node scripts/absturzprobe.mjs
 *
 * Sie verweigert jede Datenbank ausser der lokalen (127.0.0.1:54322).
 */
import pg from 'pg';
import { execFileSync } from 'node:child_process';

const DB = process.env.ABSTURZ_DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
// Der öffentlich bekannte Dienstschlüssel des lokalen Stapels (wie in
// tests/supabase/helfer.ts) — er gilt nirgends sonst.
const DIENST = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const NUMMER = 987654322;

let fehler = 0;
const pruefen = (ok, text) => {
  console.log(`${ok ? '✓' : '✗'} ${text}`);
  if (!ok) fehler += 1;
};
const abbruch = (text) => { console.error(`\n${text}\n`); process.exit(1); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

if (!/@(127\.0\.0\.1|localhost):54322\//.test(DB)) abbruch('Die Absturzprobe läuft nur gegen den lokalen Stapel (127.0.0.1:54322).');
const behaelter = execFileSync('docker', ['ps', '--format', '{{.Names}}']).toString()
  .split('\n').find((n) => n.startsWith('supabase_db_'));
if (!behaelter) abbruch('Kein lokaler Datenbank-Behälter (supabase_db_…) gefunden.');

async function verbinden() {
  const c = new pg.Client({ connectionString: DB });
  c.on('error', () => undefined);
  await c.connect();
  return c;
}

const eins = async (c, sql, werte) => (await c.query(sql, werte)).rows[0];

/* VORHER */
const a = await verbinden();
await a.query('create table if not exists app.absturzprobe (id int primary key, wert text not null)');
await a.query('truncate app.absturzprobe');
await a.query("insert into app.absturzprobe values (1, 'bestätigt')");
const g1 = (await eins(a, 'select app.anstoss_generation() as g')).g;
await a.query("delete from app.anstoss_wache where anfrage = $1", [NUMMER]);
await a.query("insert into app.anstoss_wache(anfrage, art) values ($1, 'push')", [NUMMER]);
for (let i = 0; i < 5; i += 1) await a.query("select nextval('net.http_request_queue_id_seq')");
const nummerVorher = Number((await eins(a, 'select last_value as n from net.http_request_queue_id_seq')).n);
const antwortenVorher = Number((await eins(a, 'select count(*) as n from net._http_response')).n);

const b = await verbinden();
await b.query('begin');
await b.query("insert into app.absturzprobe values (2, 'nie bestätigt')");
const pid = (await eins(b, 'select pg_backend_pid() as p')).p;
const seit = new Date(Date.now() - 1000).toISOString();
console.log(`Vorher: Generation ${g1}, Nummernfolge von pg_net bei ${nummerVorher}, ${antwortenVorher} Antworten`);

/* DER ABSTURZ: ein Prozess hart beendet — Postgres beendet alle und stellt wieder her. */
console.log(`Absturz: kill -9 ${pid} im Behälter ${behaelter}`);
execFileSync('docker', ['exec', behaelter, 'kill', '-9', String(pid)]);
await Promise.allSettled([a.end(), b.end()]);

let c = null;
for (let i = 0; i < 60 && !c; i += 1) {
  await warte(1000);
  c = await verbinden().catch(() => null);
  if (c) await c.query('select 1').catch(async () => { await c.end().catch(() => undefined); c = null; });
}
if (!c) abbruch('Die Datenbank kam nach 60 Sekunden nicht wieder.');

// Postgres schreibt sein Protokoll auf den Fehlerkanal des Behälters.
const alles = execFileSync('sh', ['-c', `docker logs --since ${seit} ${behaelter} 2>&1`]).toString();
pruefen(/terminated by signal 9/.test(alles), 'Postgres meldet den hart beendeten Prozess');
pruefen(/automatic recovery in progress|not properly shut down/.test(alles), 'Postgres läuft durch die Wiederherstellung nach einem Absturz');

/* NACHHER */
const zeilen = (await c.query('select id from app.absturzprobe order by id')).rows.map((r) => r.id);
pruefen(JSON.stringify(zeilen) === '[1]', `bestätigte Zeile da, unbestätigte nicht (${JSON.stringify(zeilen)})`);

const generationenLeer = Number((await eins(c, 'select count(*) as n from app.anstoss_generation')).n) === 0;
pruefen(generationenLeer, 'die Generation ist nach dem Absturz geleert (unlogged)');
const nummerNachher = Number((await eins(c, 'select last_value as n from net.http_request_queue_id_seq')).n);
pruefen(nummerNachher < nummerVorher, `die Nummernfolge von pg_net beginnt neu (${nummerVorher} → ${nummerNachher}) — Nummern können wiederkommen`);
const alteAntworten = Number((await eins(c, 'select count(*) as n from net._http_response where created < $1', [seit])).n);
pruefen(alteAntworten === 0, 'keine Antwort von vor dem Absturz mehr da');
const zettel = await eins(c, 'select generation from app.anstoss_wache where anfrage = $1', [NUMMER]);
pruefen(zettel?.generation === g1, 'der Zettel der Wache ist da (logged), mit der alten Generation');

const g2 = (await eins(c, 'select app.anstoss_generation() as g')).g;
pruefen(g2 !== g1, `neue Generation ${g2}`);

// Eine neue Anfrage bekommt dieselbe Nummer und eine erfolgreiche Antwort.
await c.query('insert into net._http_response(id, status_code, created) values ($1, 200, now())', [NUMMER]);
await c.query('select app.push_nachsehen()');
const rest = Number((await eins(c, 'select count(*) as n from app.anstoss_wache where anfrage = $1', [NUMMER])).n);
pruefen(rest === 0, 'die Wache hat den alten Zettel abgearbeitet');
const lauf = await eins(c, "select erfolg, meldung from system_laeufe where art = 'push' order by updated_at desc limit 1");
pruefen(lauf?.erfolg === false && lauf?.meldung === 'Keine Antwort auf den Anstoss.',
  `der alte Anstoss zählt als „keine Antwort“, nicht als die neue erfolgreiche (${JSON.stringify(lauf)})`);

/* DIE DIENSTE */
let api = 0;
for (let i = 0; i < 30 && api !== 200; i += 1) {
  api = await fetch(`${API}/rest/v1/companies?select=id&limit=1`, { headers: { apikey: DIENST, Authorization: `Bearer ${DIENST}` } }).then((r) => r.status).catch(() => 0);
  if (api !== 200) await warte(1000);
}
pruefen(api === 200, `die Datenbank-API antwortet wieder (${api})`);
const anmeldung = await fetch(`${API}/auth/v1/health`, { headers: { apikey: ANON } }).then((r) => r.status).catch(() => 0);
pruefen(anmeldung === 200, `die Anmeldung antwortet wieder (${anmeldung})`);

/* AUFRÄUMEN — nur, was die Probe angelegt hat. */
await c.query('delete from net._http_response where id = $1', [NUMMER]);
await c.query('drop table app.absturzprobe');
await c.end();

console.log(fehler === 0 ? '\nAbsturzprobe bestanden.' : `\nAbsturzprobe: ${fehler} Prüfung(en) nicht bestanden.`);
process.exit(fehler === 0 ? 0 : 1);
