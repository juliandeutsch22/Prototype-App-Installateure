/**
 * Die Push-Meldungen rund um Materialanforderungen — angestossen von einem
 * Postgres-Trigger, verschickt über Firebase Cloud Messaging.
 *
 * WARUM FCM BLEIBT. Es hängt an keiner Datenbank und funktioniert; ein Umzug
 * dorthin wäre Arbeit ohne Gegenwert. Umgezogen ist nur, was den Versand
 * ANSTÖSST: aus zwei Firestore-Ereignissen wird ein Trigger auf
 * `material_orders`.
 *
 * WAS HIER NICHT ENTSCHIEDEN WIRD. Wer etwas bekommt, wann ein Übergang
 * gilt und wann ein Gerät wirklich tot ist, steht in `shared/notifyLogic.ts`
 * — derselben Datei wie unter Firestore, und die ist einzeln geprüft. Hier
 * steht nur das Handwerk: lesen, senden, aufräumen.
 *
 * DER UNTERSCHIED, DER BEIM ÜBERSETZEN NICHT AUFFÄLLT: das Admin-SDK meldete
 * Fehler als `messaging/registration-token-not-registered`, die HTTP-v1-
 * Schnittstelle als `UNREGISTERED`. Würde man das nicht abbilden, hielte
 * `toteTokens` jedes tote Gerät für lebendig — und jeder Versand liefe bis in
 * alle Ewigkeit in dieselben Fehler. Die Zuordnung steht unten und ist der
 * Grund, warum die sorgfältige Abwägung dort weiter gilt.
 */
import {
  EMPFAENGER_NEUE_ANFORDERUNG,
  empfaengerNeueAnforderung,
  istEilRelevant,
  istMeldepflichtigeAnforderung,
  istUebergangAufAbholbereit,
  orderAusZeile,
  textAbholbereit,
  textEilAbholbereit,
  textEilAngefordert,
  textNeueAnforderung,
  toteTokens,
  willMeldung,
  type Meldung,
  type MeldungsArt,
} from '../_shared/notifyLogic.ts';
import {
  alsSdkCode, jwtBauen, type Dienstkonto,
} from '../_shared/fcmVersand.ts';
import {
  dienstSchluessel, istDienst, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const DIENST = dienstSchluessel(Deno.env.toObject());

/**
 * Das Dienstkonto, mit dem bei Google gesendet wird — als JSON im Geheimnis.
 *
 * Dasselbe, das die Cloud Functions ausliefert. Es liegt NICHT in dieser
 * Datei und nicht in einer Migration: beides läge im Git, und dort bliebe es
 * auch nach dem Löschen.
 */
const DIENSTKONTO = Deno.env.get('FCM_DIENSTKONTO') ?? '';

/*
  Der leere Ersatz ist nie im Einsatz: fehlt der Schlüssel, antwortet die
  Function 503, bevor sie irgendetwas abruft. Er steht hier, weil die
  Kopfzeilen beim Laden der Datei gebaut werden und nicht beim Aufruf.
*/
const alsDienst = {
  apikey: DIENST ?? '',
  Authorization: `Bearer ${DIENST ?? ''}`,
  'Content-Type': 'application/json',
};

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });

async function zugangstoken(konto: Dienstkonto): Promise<string> {
  const jwt = await jwtBauen(konto, Math.floor(Date.now() / 1000));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const daten = await r.json();
  if (!r.ok || !daten.access_token) {
    throw new Error(`Zugangstoken abgelehnt: ${JSON.stringify(daten)}`);
  }
  return daten.access_token as string;
}

/** An ein Gerät senden. HTTP v1 kennt keinen Sammelversand. */
async function anEinGeraet(
  projekt: string, token: string, zugang: string, meldung: Meldung,
): Promise<{ error?: { code?: string } }> {
  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projekt}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${zugang}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          /*
            Bewusst nur `data`, keine `notification`: so entscheidet allein
            der Service Worker, wie die Meldung aussieht — sonst zeigen
            manche Browser zusätzlich eine eigene, und der Nutzer sieht sie
            doppelt.
          */
          data: meldung,
          webpush: { fcm_options: { link: meldung.link } },
        },
      }),
    },
  );
  if (r.ok) return {};
  const rumpf = await r.json().catch(() => ({}));
  return { error: { code: alsSdkCode(rumpf.error) } };
}

/** Alle Gerätetokens der genannten Kennungen, sofern sie diese Meldung wollen. */
async function tokensFuer(uids: string[], art: MeldungsArt): Promise<string[]> {
  if (uids.length === 0) return [];
  const liste = uids.map((u) => `"${u}"`).join(',');
  const r = await fetch(
    `${URL_BASIS}/rest/v1/user_prefs?select=*&user_id=in.(${liste})`,
    { headers: alsDienst },
  );
  if (!r.ok) return [];
  const zeilen = (await r.json()) as Array<Record<string, unknown>>;
  const tokens: string[] = [];
  for (const zeile of zeilen) {
    /*
      `willMeldung` liest die Vorgaben in camelCase — die Zeile kommt in
      snake_case. Übersetzt wird nur, was die Entscheidung anschaut.
    */
    const vorgaben = {
      notifyNewOrder: zeile.notify_new_order,
      notifyOrderReady: zeile.notify_order_ready,
      notifyUrgentDelivery: zeile.notify_urgent_delivery,
    };
    if (!willMeldung(vorgaben, art)) continue;
    for (const t of (zeile.push_tokens as string[] | null) ?? []) tokens.push(t);
  }
  return [...new Set(tokens)];
}

/**
 * Verschicken und dabei aufräumen: Tokens, die der Dienst als endgültig
 * ungültig meldet, fallen aus den Vorgaben. Ohne das wächst die Liste mit
 * jedem Gerätewechsel, und jeder Versand läuft in dieselben Fehler.
 */
async function senden(
  konto: Dienstkonto, zugang: string, tokens: string[], meldung: Meldung,
): Promise<number> {
  if (tokens.length === 0) return 0;
  const antworten = await Promise.all(
    tokens.map((t) => anEinGeraet(konto.project_id, t, zugang, meldung)),
  );
  for (const tot of toteTokens(tokens, antworten)) {
    await fetch(`${URL_BASIS}/rest/v1/rpc/push_token_entfernen`, {
      method: 'POST', headers: alsDienst, body: JSON.stringify({ p_token: tot }),
    }).catch(() => undefined);
  }
  return antworten.filter((a) => !a.error).length;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return antwort({ error: 'Nur POST.' }, 405);

  // Ohne eigenen Dienstschluessel koennte diese Function nicht einmal die
  // Geraete nachschlagen. Das zu sagen ist ehrlicher, als jeden Anrufer
  // abzuweisen, als waere seine Anmeldung das Problem.
  if (!DIENST) return antwort({ error: SCHLUESSEL_FEHLT }, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  // Angestossen wird ausschliesslich vom Trigger, und der hat den
  // Dienstschluessel. Ein Mensch hat hier nichts zu suchen.
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  if (!istDienst(token, DIENST)) return antwort({ error: 'Nur der Dienst.' }, 401);

  const ereignis = await req.json().catch(() => null);
  if (!ereignis) return antwort({ error: 'Kein lesbares Ereignis.' }, 400);

  const vorher = orderAusZeile(ereignis.vorher);
  const nachher = orderAusZeile(ereignis.nachher);
  const kennung = String(ereignis.nachher?.id ?? '');
  if (!nachher) return antwort({ gesendet: 0, grund: 'keine Anforderung' });

  /*
    WER WAS BEKOMMT — hier wird nichts entschieden, nur zusammengetragen.
  */
  const auftraege: Array<{ art: MeldungsArt; uids: string[]; meldung: Meldung }> = [];

  const empfaengerAntwort = await fetch(`${URL_BASIS}/rest/v1/rpc/push_empfaenger`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({
      p_betrieb: nachher.companyId, p_baustelle: nachher.projectNumber ?? '',
    }),
  });
  const kreis = empfaengerAntwort.ok
    ? await empfaengerAntwort.json()
    : { belegschaft: [], projektleitung: [] };
  const belegschaft = (kreis.belegschaft ?? []) as Array<{
    uid: string; role?: string; active?: boolean;
  }>;
  const leitung = ((kreis.projektleitung ?? []) as string[])
    .filter((uid) => uid !== nachher.userId);

  if (ereignis.art === 'neu' && istMeldepflichtigeAnforderung(nachher)) {
    auftraege.push({
      art: 'notifyNewOrder',
      uids: empfaengerNeueAnforderung(
        belegschaft.filter((u) => EMPFAENGER_NEUE_ANFORDERUNG.includes(u.role ?? '')),
        nachher.userId,
      ),
      meldung: textNeueAnforderung(nachher),
    });
    if (istEilRelevant(nachher) && leitung.length > 0) {
      auftraege.push({
        art: 'notifyUrgentDelivery',
        uids: leitung,
        meldung: textEilAngefordert(nachher, kennung),
      });
    }
  }

  if (ereignis.art === 'geaendert' && istUebergangAufAbholbereit(vorher, nachher)) {
    auftraege.push({
      art: 'notifyOrderReady',
      uids: nachher.userId ? [nachher.userId] : [],
      meldung: textAbholbereit(nachher, kennung),
    });
    /*
      Bei einer Eilzustellung erfährt es auch die Projektleitung — sie ist
      diejenige, die es mitnimmt. Der Besteller sitzt auf der Baustelle und
      kann ohnehin nicht selbst fahren.
    */
    if (istEilRelevant(nachher) && leitung.length > 0) {
      auftraege.push({
        art: 'notifyUrgentDelivery',
        uids: leitung,
        meldung: textEilAbholbereit(nachher, kennung),
      });
    }
  }

  /*
    DIE GERÄTE WERDEN VOR DEM VERSAND GEZÄHLT, nicht dabei.

    Zuerst stand hier nur die Zahl der Empfänger. Das übersah die zweite
    Hälfte der Entscheidung: wer die Meldungsart abgeschaltet hat, bekommt
    nichts — und das ist eine EINSTELLUNG, die jemand bewusst getroffen hat.
    Eine Mutation, die `willMeldung` ganz entfernte, blieb unbemerkt, weil
    die Vorgaben erst beim Senden gelesen wurden und gesendet wird hier nie.

    Jetzt steht in `geplant`, wie viele GERÄTE erreicht würden. Das ist auch
    die ehrlichere Auskunft: „drei Empfänger, null Geräte" heisst, dass
    niemand etwas merkt.
  */
  const geplant = await Promise.all(auftraege.map(async (a) => ({
    art: a.art,
    empfaenger: a.uids.length,
    geraete: (await tokensFuer(a.uids, a.art)).length,
  })));
  if (auftraege.length === 0) return antwort({ gesendet: 0, geplant });

  /*
    OHNE DIENSTKONTO WIRD NICHT STILL NICHTS GETAN.

    Eine Push-Meldung, die nicht ankommt, merkt niemand — das ist ihr
    gefährlichster Zug. Fehlt das Geheimnis, sagt die Antwort das deutlich
    und mit dem Namen, der zu setzen ist. `geplant` steht trotzdem darin:
    daran ist zu sehen, dass alles bis zum Versand richtig gelaufen ist.
  */
  if (!DIENSTKONTO) {
    return antwort({
      error: 'FCM_DIENSTKONTO fehlt — es wurde nichts verschickt.',
      geplant,
    }, 503);
  }

  const konto = JSON.parse(DIENSTKONTO) as Dienstkonto;
  const zugang = await zugangstoken(konto);
  let gesendet = 0;
  for (const auftrag of auftraege) {
    gesendet += await senden(
      konto, zugang, await tokensFuer(auftrag.uids, auftrag.art), auftrag.meldung,
    );
  }
  return antwort({ gesendet, geplant });
});
