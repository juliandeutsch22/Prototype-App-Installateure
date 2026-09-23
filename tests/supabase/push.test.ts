/**
 * Die Push-Meldungen — vom Trigger bis zur Edge Function.
 *
 * WAS HIER GEPRÜFT WIRD UND WAS NICHT. Geprüft ist die ganze Kette bis
 * unmittelbar vor Google: der Trigger erkennt das Ereignis, stösst die
 * Function an, die trägt die Empfänger zusammen und sagt, was sie verschicken
 * würde. Ungeprüft bleibt genau eine Runde — die zu Firebase Cloud Messaging,
 * denn dafür braucht es ein Dienstkonto, das hier niemand hat.
 *
 * DASS SIE BIS DORTHIN KOMMT, IST DAS ENTSCHEIDENDE. Eine Push-Meldung, die
 * nicht ankommt, merkt niemand: es erscheint keine Fehlermeldung, es kommt
 * nur nichts. Deshalb gibt die Function `geplant` zurück — wer wie viele
 * bekommen hätte —, und deshalb steht das hier auf dem Prüfstand statt
 * „läuft durch".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, API, SERVICE, betriebAnlegen, konto, type Konto } from './helfer';

const FUNKTION = `${API}/functions/v1/push-melden`;

/**
 * Dieselbe Function, aus Sicht der DATENBANK.
 *
 * `pg_net` läuft im Postgres-Container; `127.0.0.1` ist dort nicht der
 * Stapel, sondern der Container selbst. Der Trigger braucht deshalb die
 * containerinterne Adresse — im Projekt ist das schlicht die öffentliche
 * URL, hier der Name des Torwächters im Docker-Netz.
 *
 * Die Unterscheidung fällt sonst erst auf, wenn `net._http_response`
 * „Couldn't connect to server" enthält und niemand hinsieht — was bei einer
 * Push-Meldung heisst: es kommt einfach nichts.
 */
const FUNKTION_INTERN =
  'http://supabase_kong_Prototype-App-Installateure:8000/functions/v1/push-melden';
const BETRIEB = 'push-b';
const BAUSTELLE = 'B-2026-0001';

let monteur: Konto;
let verwaltung: Konto;
let leitung: Konto;
let buchhaltung: Konto;
let db: Client;

async function anstossen(ereignis: unknown, token = SERVICE) {
  const antwort = await fetch(FUNKTION, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ereignis),
  });
  return { status: antwort.status, daten: await antwort.json() };
}

const anforderung = (rest: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  company_id: BETRIEB,
  material_name: 'Kupferrohr 15mm',
  quantity: '8.000',
  project_number: BAUSTELLE,
  status: 'Offen',
  transaction_type: 'order',
  is_urgent: false,
  user_id: monteur.uid,
  user_name: 'Max Mustermann',
  ...rest,
});

beforeAll(async () => {
  db = new Client({ connectionString:
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();

  await betriebAnlegen(BETRIEB, 'Perl Installationen');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'push-monteur');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'push-verwaltung');
  leitung = await konto(BETRIEB, 'Projektleiter', 'push-leitung');
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'push-buch');

  const { error } = await admin.from('projects').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, project_number: BAUSTELLE,
    customer_name: 'Familie Huber', status: 'Aktiv',
    project_managers: [leitung.uid],
  });
  if (error) throw new Error(error.message);

  // Gerätekanäle: ohne sie gäbe es niemanden zu benachrichtigen.
  for (const k of [monteur, verwaltung, leitung]) {
    await admin.from('user_prefs').insert({
      user_id: k.uid, company_id: BETRIEB, push_tokens: [`geraet-${k.uid}`],
      notify_new_order: true, notify_order_ready: true, notify_urgent_delivery: true,
    });
  }
}, 240_000);

afterAll(async () => { await db.end(); });

describe('Wer von einer neuen Anforderung erfährt', () => {
  it('die Verwaltung — aber nicht der Besteller selbst', async () => {
    /*
      Er hat sie gerade abgeschickt; ihn darüber zu benachrichtigen wäre der
      klassische Fall einer Meldung, die nur stört.
    */
    const { status, daten } = await anstossen({ art: 'neu', nachher: anforderung() });
    expect(status).toBe(503); // ohne Dienstkonto wird nicht verschickt
    expect(daten.geplant).toEqual([{ art: 'notifyNewOrder', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('auch dann nicht, wenn der Besteller SELBST zu den Empfängern zählt', async () => {
    /*
      DER FALL, DEN DIE ERSTE FASSUNG DIESER PRÜFUNG ÜBERSAH. Bestellt ein
      Monteur, fällt er ohnehin aus dem Empfängerkreis — er hat keine der
      drei Rollen. Bestellt die VERWALTUNG selbst Material, steht sie in
      beiden Listen: als Bestellerin und als Empfängerin.

      Ohne den Ausschluss bekäme sie eine Meldung über ihre eigene Bestellung,
      und zwar genau in dem Moment, in dem sie auf „Absenden" gedrückt hat.
      Eine Mutation hat gezeigt, dass das vorher niemand gemerkt hätte.
    */
    const { daten } = await anstossen({
      art: 'neu',
      nachher: anforderung({ user_id: verwaltung.uid, user_name: 'Die Verwaltung' }),
    });
    expect(daten.geplant).toEqual([{ art: 'notifyNewOrder', empfaenger: 0, geraete: 0 }]);
  }, 120_000);

  it('bei einer Eilzustellung zusätzlich die Projektleitung', async () => {
    const { daten } = await anstossen({
      art: 'neu', nachher: anforderung({ is_urgent: true }),
    });
    expect(daten.geplant).toEqual([
      { art: 'notifyNewOrder', empfaenger: 1, geraete: 1 },
      { art: 'notifyUrgentDelivery', empfaenger: 1, geraete: 1 },
    ]);
  }, 120_000);

  it('eine Eilzustellung OHNE Baustelle hat keine Projektleitung', async () => {
    // Ohne sie gibt es niemanden zu verständigen — die Baustellenverwaltung
    // weist beim Anlegen darauf hin.
    const { daten } = await anstossen({
      art: 'neu', nachher: anforderung({ is_urgent: true, project_number: null }),
    });
    expect(daten.geplant).toEqual([{ art: 'notifyNewOrder', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('eine Retoure meldet niemand — dafür muss keiner laufen', async () => {
    const { daten } = await anstossen({
      art: 'neu', nachher: anforderung({ transaction_type: 'return' }),
    });
    // Gar kein Auftrag, nicht ein Auftrag ohne Empfänger: `notifyLogic`
    // entscheidet, dass hier nichts zu melden ist.
    expect(daten.geplant).toEqual([]);
    expect(daten.gesendet).toBe(0);
  }, 120_000);
});

describe('Wer vom Abholbereit erfährt', () => {
  it('der Monteur, der sie gestellt hat', async () => {
    const { daten } = await anstossen({
      art: 'geaendert',
      vorher: anforderung({ status: 'In Bearbeitung' }),
      nachher: anforderung({ status: 'Abholbereit' }),
    });
    expect(daten.geplant).toEqual([{ art: 'notifyOrderReady', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('bei Eilzustellung auch die Projektleitung — sie nimmt es mit', async () => {
    // Der Besteller sitzt auf der Baustelle und kann ohnehin nicht fahren.
    const { daten } = await anstossen({
      art: 'geaendert',
      vorher: anforderung({ status: 'Offen', is_urgent: true }),
      nachher: anforderung({ status: 'Abholbereit', is_urgent: true }),
    });
    expect(daten.geplant).toEqual([
      { art: 'notifyOrderReady', empfaenger: 1, geraete: 1 },
      { art: 'notifyUrgentDelivery', empfaenger: 1, geraete: 1 },
    ]);
  }, 120_000);

  it('ein Status, der sich NICHT auf Abholbereit bewegt, meldet nichts', async () => {
    const { daten } = await anstossen({
      art: 'geaendert',
      vorher: anforderung({ status: 'Offen' }),
      nachher: anforderung({ status: 'In Bearbeitung' }),
    });
    expect(daten.geplant).toEqual([]);
    expect(daten.gesendet).toBe(0);
  }, 120_000);

  it('und ein zweites Speichern auf demselben Status auch nicht', async () => {
    // Sonst bekäme der Monteur bei jedem Klick in der Verwaltung dieselbe
    // Meldung noch einmal.
    const { daten } = await anstossen({
      art: 'geaendert',
      vorher: anforderung({ status: 'Abholbereit' }),
      nachher: anforderung({ status: 'Abholbereit' }),
    });
    expect(daten.geplant).toEqual([]);
  }, 120_000);
});

describe('Wer die Function anstossen darf', () => {
  it('nur der Dienst — ein angemeldeter Mensch nicht', async () => {
    /*
      Sie liest die Gerätekanäle des ganzen Betriebs und verschickt in seinem
      Namen. Der Weg dorthin führt über den Trigger, nicht über einen Browser.
    */
    const { status } = await anstossen({ art: 'neu', nachher: anforderung() }, monteur.token);
    expect(status).toBe(401);
    /*
      DIESE PRÜFUNG IST ZWEIMAL AUF DEM CI-LÄUFER UMGEFALLEN, und zwar mit
      einer Zeitüberschreitung statt einer falschen Behauptung. Beim ersten
      Mal hatte sie als einzige im Haus die halbe Frist; die wurde
      angeglichen. Beim zweiten Mal fiel sie auch mit 120 Sekunden — die
      Frist war es also nicht.

      GESUCHT UND GEFUNDEN wurde etwas anderes: drei Prüfungen im Haus lasen
      den Rumpf ihrer Antwort nie aus. `fetch` in Node hält die Verbindung
      offen, solange der Rumpf weder gelesen noch verworfen ist; in einem Lauf
      mit sechshundert Prüfungen gegen dieselbe Adresse wartet irgendwann eine
      Anfrage auf eine Verbindung, die nie frei wird. Dass es diese hier traf,
      ist Zufall — sie ruft dieselbe Adresse wie alle anderen. Siehe
      `nurStatus` in `helfer.ts`.

      OB DAS DIE URSACHE WAR, IST DAMIT NICHT BEWIESEN: örtlich liess sich der
      Ausfall nie nachstellen, auch nicht im vollen Lauf. Belegt ist nur, dass
      die Verbindungen jetzt sauber freigegeben werden. Fällt sie wieder um,
      liegt es woanders — und dann gehört es erneut gesucht, nicht die Frist
      noch einmal erhöht.
    */
  }, 120_000);

  it('und die Buchhaltung bekommt gar keine Materialmeldungen', async () => {
    // Sie steht nicht in den Empfängerrollen — geprüft wird das hier, weil
    // ein zu weiter Kreis niemandem auffiele.
    await admin.from('user_prefs').insert({
      user_id: buchhaltung.uid, company_id: BETRIEB,
      push_tokens: ['geraet-buch'], notify_new_order: true,
    });
    const { daten } = await anstossen({ art: 'neu', nachher: anforderung() });
    expect(daten.geplant).toEqual([{ art: 'notifyNewOrder', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('wer die Meldungsart abgeschaltet hat, bekommt kein Gerät gezählt', async () => {
    /*
      DIE ZWEITE HÄLFTE DER ENTSCHEIDUNG. Empfänger zu sein heisst noch nicht,
      etwas zu bekommen: jeder kann die einzelnen Meldungsarten abschalten,
      und das ist eine Einstellung, die jemand bewusst getroffen hat.

      Eine Mutation, die `willMeldung` ganz entfernte, blieb unbemerkt —
      deshalb steht in `geplant` jetzt auch die Zahl der GERÄTE. „Ein
      Empfänger, null Geräte" heisst: niemand merkt etwas.
    */
    await admin.from('user_prefs')
      .update({ notify_new_order: false }).eq('user_id', verwaltung.uid);
    const { daten } = await anstossen({ art: 'neu', nachher: anforderung() });
    expect(daten.geplant).toEqual([{ art: 'notifyNewOrder', empfaenger: 1, geraete: 0 }]);

    await admin.from('user_prefs')
      .update({ notify_new_order: true }).eq('user_id', verwaltung.uid);
  }, 120_000);
});

describe('Der Trigger stösst wirklich an', () => {
  it('eine neue Anforderung ruft die Function', async () => {
    /*
      DIE NAHT ZWISCHEN DATENBANK UND FUNCTION. Bis hierher war jede Prüfung
      ein direkter Aufruf; dass der TRIGGER ihn auslöst, ist eine eigene
      Frage — und die mit den meisten stillen Fehlschlägen: `pg_net` wartet
      nicht auf die Antwort, ein falscher Tresoreintrag fiele nirgends auf.

      `net._http_response` hält fest, was zurückkam. Genau dort wird
      nachgesehen.
    */
    await db.query(
      `select vault.create_secret($1, 'push_url'), vault.create_secret($2, 'push_schluessel')`,
      [FUNKTION_INTERN, SERVICE],
    ).catch(() => undefined); // beim zweiten Lauf gibt es sie schon

    const vorher = await db.query('select count(*)::int as n from net._http_response');
    await admin.from('material_orders').insert(anforderung());

    // pg_net arbeitet im Hintergrund; ein paar Sekunden sind realistisch.
    let nachher = vorher.rows[0].n;
    for (let i = 0; i < 30 && nachher === vorher.rows[0].n; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      nachher = (await db.query('select count(*)::int as n from net._http_response')).rows[0].n;
    }
    expect(nachher).toBeGreaterThan(vorher.rows[0].n);

    const letzte = await db.query(
      'select status_code, content from net._http_response order by created desc limit 1',
    );
    // 503: die Function ist erreicht worden und hat mangels Dienstkonto nicht
    // verschickt. Genau das soll hier zu sehen sein.
    expect(letzte.rows[0].status_code).toBe(503);
    expect(JSON.parse(letzte.rows[0].content).geplant)
      .toEqual([{ art: 'notifyNewOrder', empfaenger: 1, geraete: 1 }]);
  }, 180_000);

  it('und eine gescheiterte Meldung reisst die Anforderung NICHT mit', async () => {
    /*
      DIE WICHTIGSTE EIGENSCHAFT DES AUSLÖSERS. Eine Push-Meldung, die nicht
      hinausgeht, ist ärgerlich. Eine Materialanforderung, die deshalb nicht
      angelegt wird, ist ein Betriebsstillstand.
    */
    await db.query(`select vault.update_secret(id, 'http://127.0.0.1:1/gibtesnicht')
                      from vault.secrets where name = 'push_url'`);
    const zeile = anforderung();
    const { error } = await admin.from('material_orders').insert(zeile);
    expect(error).toBeNull();

    const { data } = await admin.from('material_orders').select('id').eq('id', zeile.id).single();
    expect(data!.id).toBe(zeile.id);

    await db.query(`select vault.update_secret(id, $1)
                      from vault.secrets where name = 'push_url'`,
      [FUNKTION_INTERN]);
  }, 180_000);
});

/*
  ABWESENHEITEN: der neue Antrag an die Genehmigenden, die Entscheidung an
  den Antragsteller, die Krankmeldung ans Büro. Im Betrieb dieser Prüfung
  ist niemand als Genehmigender festgelegt — also entscheidet das Büro, hier
  die Buchhaltung.
*/
describe('Abwesenheiten melden', () => {
  const zeile = (rest: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(), company_id: BETRIEB, user_id: monteur.uid, user_name: 'Max Mustermann',
    von: '2026-10-27', bis: '2026-10-29', art: 'Urlaub', status: 'Beantragt', ...rest,
  });

  it('ein neuer Antrag geht an die, die entscheiden — nicht an die Projektleitung', async () => {
    const { daten } = await anstossen({ quelle: 'abwesenheit', art: 'antrag', zeile: zeile() });
    expect(daten.geplant).toEqual([{ art: 'notifyAbwesenheit', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('die Entscheidung geht an den Antragsteller', async () => {
    const { daten } = await anstossen({
      quelle: 'abwesenheit', art: 'entschieden', zeile: zeile({ status: 'Genehmigt' }),
    });
    expect(daten.geplant).toEqual([{ art: 'notifyAbwesenheit', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('eine Krankmeldung geht ans Büro — nicht an Verwaltung oder Projektleitung', async () => {
    const { daten } = await anstossen({
      quelle: 'abwesenheit', art: 'krank', zeile: { ...zeile(), art: undefined, status: undefined },
    });
    expect(daten.geplant).toEqual([{ art: 'notifyAbwesenheit', empfaenger: 1, geraete: 1 }]);
  }, 120_000);

  it('wer „Abwesenheiten" abgeschaltet hat, bekommt kein Gerät gezählt', async () => {
    await admin.from('user_prefs').update({ notify_abwesenheit: false }).eq('user_id', monteur.uid);
    const { daten } = await anstossen({
      quelle: 'abwesenheit', art: 'entschieden', zeile: zeile({ status: 'Abgelehnt' }),
    });
    expect(daten.geplant).toEqual([{ art: 'notifyAbwesenheit', empfaenger: 1, geraete: 0 }]);
    await admin.from('user_prefs').update({ notify_abwesenheit: true }).eq('user_id', monteur.uid);
  }, 120_000);

  it('der Trigger stösst beim neuen Antrag an', async () => {
    const vorher = (await db.query('select count(*)::int as n from net._http_response')).rows[0].n;
    const { error } = await monteur.client.from('vacations').insert({
      company_id: BETRIEB, user_id: monteur.uid, user_name: 'Max Mustermann',
      von: '2026-11-02', bis: '2026-11-03', tage: 2, status: 'Beantragt',
    });
    expect(error).toBeNull();
    let nachher = vorher;
    for (let i = 0; i < 30 && nachher === vorher; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      nachher = (await db.query('select count(*)::int as n from net._http_response')).rows[0].n;
    }
    expect(nachher).toBeGreaterThan(vorher);
    const letzte = await db.query(
      'select content from net._http_response order by created desc limit 1',
    );
    expect(JSON.parse(letzte.rows[0].content).geplant)
      .toEqual([{ art: 'notifyAbwesenheit', empfaenger: 1, geraete: 1 }]);
  }, 180_000);
});
