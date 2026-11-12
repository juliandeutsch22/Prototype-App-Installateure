import { zeitMeldung, zeitKorrekturEmpfaenger, zeitEigenerEmpfaenger } from '../_shared/zeitMeldungen.ts';
/**
 * Die Push-Meldungen rund um Materialanforderungen, Abwesenheiten, die
 * Antwort eines Kunden über den Annahme-Link (M02a) und neue Nachrichten
 * (M10/B09) —
 * angestossen von einem Postgres-Trigger, verschickt über Firebase Cloud
 * Messaging.
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
  abwesenheitAusZeile,
  empfaengerAngebotLink,
  empfaengerAntrag,
  empfaengerFreistellung,
  empfaengerKrankmeldung,
  empfaengerNachricht,
  textAngebotLink,
  textAntrag,
  textEntscheidung,
  textFreistellungAntrag,
  textFreistellungEntscheidung,
  textKrankmeldung,
  textNachricht,
  textEinsatzplan,
  type EinsatzEreignis,
  type NachrichtEreignis,
  type Belegschaftsmitglied,
  EMPFAENGER_NEUE_ANFORDERUNG,
  empfaengerNeueAnforderung,
  istEilRelevant,
  istUebergangAufEil,
  istMeldepflichtigeAnforderung,
  istUebergangAufAbholbereit,
  orderAusZeile,
  textAbholbereit,
  textEilAbholbereit,
  textEilAngefordert,
  textNeueAnforderung,
  toteTokens,
  abgelehnteCodes,
  willMeldung,
  type Meldung,
  type MeldungsArt,
} from '../_shared/notifyLogic.ts';
import { type Dienstkonto } from '../_shared/fcmVersand.ts';
import { anEinGeraet, zugangstoken } from '../_eigen/fcm.ts';
import {
  alleDienstSchluessel, dienstKopfzeilen, rufDerMaschine, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
/*
  ALLE Schlüssel, die diese Umgebung kennt — gesprochen wird mit dem ersten,
  anerkannt wird jeder. Ein Projekt mitten in der Ablösung hat zwei, und
  welcher im Tresor liegt, entscheidet nicht diese Datei.
*/
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;

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
const alsDienst = dienstKopfzeilen(DIENST);

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });

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
      notifyAbwesenheit: zeile.notify_abwesenheit,
      notifyAngebot: zeile.notify_angebot,
      notifyZeiterfassung: zeile.notify_zeiterfassung,
      notifyNachrichten: zeile.notify_nachrichten,
      notifyEinsaetze: zeile.notify_einsaetze,
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
): Promise<{ gesendet: number; abgelehnt: string[] }> {
  if (tokens.length === 0) return { gesendet: 0, abgelehnt: [] };
  const antworten = await Promise.all(
    tokens.map((t) => anEinGeraet(konto.project_id, t, zugang, meldung)),
  );
  for (const tot of toteTokens(tokens, antworten)) {
    await fetch(`${URL_BASIS}/rest/v1/rpc/push_token_entfernen`, {
      method: 'POST', headers: alsDienst, body: JSON.stringify({ p_token: tot }),
    }).catch(() => undefined);
  }
  return { gesendet: antworten.filter((a) => !a.error).length, abgelehnt: abgelehnteCodes(antworten) };
}

type Auftrag = { art: MeldungsArt; uids: string[]; meldung: Meldung };
/** Was der Trigger schickt — Zeilen aus `to_jsonb`, geprüft wird beim Lesen. */
interface Ereignis {
  quelle?: string;
  art?: string;
  vorher?: Record<string, unknown>;
  nachher?: Record<string, unknown>;
  zeile?: Record<string, unknown>;
  /** Wer es ausgelöst hat — bisher nur beim nachträglichen „eilig“. */
  von?: string | null;
}

/** Materialanforderungen: neu, abholbereit, Eilzustellung. */
async function auftraegeAnforderung(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const vorher = orderAusZeile(ereignis.vorher);
  const nachher = orderAusZeile(ereignis.nachher);
  const kennung = String(ereignis.nachher?.id ?? '');
  if (!nachher) return null;

  /*
    WER WAS BEKOMMT — hier wird nichts entschieden, nur zusammengetragen.
  */
  const auftraege: Auftrag[] = [];

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

  /*
    NACHTRÄGLICH EILIG (17 F): dieselbe Meldung wie beim Anlegen einer
    Eilzustellung an die Projektleitung, dazu das Lager, das sie jetzt
    vorziehen muss. Wer es selbst gesetzt hat, bekommt nichts.
  */
  if (ereignis.art === 'eil' && istUebergangAufEil(vorher, nachher)) {
    const von = typeof ereignis.von === 'string' ? ereignis.von : undefined;
    auftraege.push({
      art: 'notifyNewOrder',
      uids: empfaengerNeueAnforderung(
        belegschaft.filter((u) => EMPFAENGER_NEUE_ANFORDERUNG.includes(u.role ?? '')),
        nachher.userId,
      ).filter((uid) => uid !== von),
      meldung: textEilAngefordert(nachher, kennung),
    });
    const leitungOhne = leitung.filter((uid) => uid !== von);
    if (leitungOhne.length > 0) {
      auftraege.push({
        art: 'notifyUrgentDelivery',
        uids: leitungOhne,
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
  return auftraege;
}

/**
 * Abwesenheiten: neuer Antrag an die Genehmigenden, die Entscheidung an den
 * Antragsteller, eine Krankmeldung ans Büro. Wer wer ist, sagt
 * `push_empfaenger_abwesenheit`; die Auswahl trifft `notifyLogic.ts`.
 */
async function auftraegeAbwesenheit(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const a = abwesenheitAusZeile(ereignis.zeile);
  const kennung = String(ereignis.zeile?.id ?? '');
  if (!a?.companyId) return null;

  if (ereignis.art === 'entschieden') {
    return a.userId
      ? [{ art: 'notifyAbwesenheit', uids: [a.userId], meldung: textEntscheidung(a, kennung) }]
      : [];
  }
  if (ereignis.art === 'freistellung-entschieden') {
    return a.userId
      ? [{ art: 'notifyAbwesenheit', uids: [a.userId], meldung: textFreistellungEntscheidung(a, kennung) }]
      : [];
  }

  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/push_empfaenger_abwesenheit`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ p_betrieb: a.companyId }),
  });
  const kreis = r.ok ? await r.json() : { belegschaft: [] };
  const leute = (kreis.belegschaft ?? []) as Belegschaftsmitglied[];

  if (ereignis.art === 'antrag') {
    return [{ art: 'notifyAbwesenheit', uids: empfaengerAntrag(leute, a.userId), meldung: textAntrag(a, kennung) }];
  }
  if (ereignis.art === 'freistellung-antrag') {
    return [{
      art: 'notifyAbwesenheit', uids: empfaengerFreistellung(leute, a), meldung: textFreistellungAntrag(a, kennung),
    }];
  }
  if (ereignis.art === 'krank') {
    return [{
      art: 'notifyAbwesenheit', uids: empfaengerKrankmeldung(leute, a.userId), meldung: textKrankmeldung(a, kennung),
    }];
  }
  return null;
}

/**
 * Angebote (M02a): der Kunde hat über den Annahme-Link angenommen oder
 * abgelehnt. `push_angebot_link` gibt den Link genau einmal heraus — ein
 * zweiter Anstoß für dieselbe Entscheidung bekommt `null` und meldet nichts.
 */
async function auftraegeZeit(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const zeile = ereignis.zeile;
  const meldung = zeitMeldung(ereignis.art ?? '', String(zeile?.id ?? ''));
  if (!meldung || typeof zeile?.user_id !== 'string' || typeof zeile.company_id !== 'string') return null;
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/push_empfaenger_abwesenheit`, { method: 'POST', headers: alsDienst, body: JSON.stringify({ p_betrieb: zeile.company_id }) });
  if (!r.ok) throw new Error('Empfänger der Zeitmeldung konnten nicht geladen werden');
  const kreis = await r.json();
  const uids = ereignis.art === 'korrektur-antrag'
    ? zeitKorrekturEmpfaenger(kreis.belegschaft ?? [], zeile.user_id)
    : zeitEigenerEmpfaenger(kreis.belegschaft ?? [], zeile.user_id);
  return [{ art: 'notifyZeiterfassung', uids, meldung }];
}

async function auftraegeAngebot(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const link = String(ereignis.zeile?.id ?? '');
  if (ereignis.art !== 'link-entschieden' || !link) return null;
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/push_angebot_link`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify({ p_link: link }),
  });
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (!d) return [];
  const e = d as {
    angebot: string; nummer: string; entscheidung: 'angenommen' | 'abgelehnt'; name?: string;
    belegschaft?: Belegschaftsmitglied[];
  };
  return [{
    art: 'notifyAngebot',
    uids: empfaengerAngebotLink(e.belegschaft ?? []),
    meldung: textAngebotLink(e, link),
  }];
}

/**
 * Nachrichten (M10/B09): eine neue Nachricht in einem Gespräch.
 * `push_nachricht` gibt sie genau einmal heraus; der Anstoß trägt nur die
 * Kennung, nie den Text. Den Text (80 Zeichen) liefert die Datenbank nur,
 * wenn ein Empfänger die Vorschau gewählt hat — und nur der bekommt ihn.
 */
async function auftraegeNachricht(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const nachricht = String(ereignis.zeile?.id ?? '');
  if (ereignis.art !== 'neu' || !nachricht) return null;
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/push_nachricht`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify({ p_nachricht: nachricht }),
  });
  const e = r.ok ? (await r.json().catch(() => null)) as NachrichtEreignis | null : null;
  if (!e) return [];
  return empfaengerNachricht(e).map((g) => ({
    art: 'notifyNachrichten' as const,
    uids: g.uids,
    meldung: textNachricht(e, g.vorschau, g.erwaehnt),
  }));
}

/**
 * Einsatzplan (B6, E85): der Plan der Person für heute und morgen hat sich
 * geändert. Die Datenbank sammelt je Person und stößt erst nach zwei Minuten
 * Ruhe an; der Anstoß trägt nur die Kennung, der Plan kommt von
 * `push_einsatz` — wie er jetzt ist.
 */
async function auftraegeEinsatz(ereignis: Ereignis): Promise<Auftrag[] | null> {
  const uid = String(ereignis.zeile?.user_id ?? '');
  if (ereignis.art !== 'plan' || !uid) return null;
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/push_einsatz`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify({ p_user: uid }),
  });
  const e = r.ok ? (await r.json().catch(() => null)) as EinsatzEreignis | null : null;
  if (!e) return [];
  return [{ art: 'notifyEinsaetze' as const, uids: [uid], meldung: textEinsatzplan(e) }];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return antwort({ error: 'Nur POST.' }, 405);

  // Ohne eigenen Dienstschluessel koennte diese Function nicht einmal die
  // Geraete nachschlagen. Das zu sagen ist ehrlicher, als jeden Anrufer
  // abzuweisen, als waere seine Anmeldung das Problem.
  if (!DIENST) return antwort({ error: SCHLUESSEL_FEHLT }, 503);

  // Angestossen wird ausschliesslich vom Trigger, und der hat den
  // Dienstschluessel. Ein Mensch hat hier nichts zu suchen.
  const kopf = req.headers.get('Authorization') ?? '';
  const apikeyKopf = req.headers.get('apikey') ?? '';
  if (!rufDerMaschine(kopf, apikeyKopf, SCHLUESSEL)) {
    return antwort({ error: 'Nur der Dienst.' }, 401);
  }

  const ereignis = await req.json().catch(() => null);
  if (!ereignis) return antwort({ error: 'Kein lesbares Ereignis.' }, 400);

  const auftraege: Auftrag[] | null = ereignis.quelle === 'zeit'
    ? await auftraegeZeit(ereignis)
    : ereignis.quelle === 'abwesenheit'
    ? await auftraegeAbwesenheit(ereignis)
    : ereignis.quelle === 'angebot'
      ? await auftraegeAngebot(ereignis)
      : ereignis.quelle === 'nachricht'
        ? await auftraegeNachricht(ereignis)
        : ereignis.quelle === 'einsatz'
          ? await auftraegeEinsatz(ereignis)
          : await auftraegeAnforderung(ereignis);
  if (!auftraege) return antwort({ gesendet: 0, grund: 'kein Ereignis, das etwas meldet' });

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
  const abgelehnt = new Set<string>();
  for (const auftrag of auftraege) {
    const ergebnis = await senden(
      konto, zugang, await tokensFuer(auftrag.uids, auftrag.art), auftrag.meldung,
    );
    gesendet += ergebnis.gesendet;
    ergebnis.abgelehnt.forEach((c) => abgelehnt.add(c));
  }
  /*
    GOOGLE HAT ABGELEHNT — DAS IST EIN FEHLER, KEIN ERFOLG (E69). Vorher
    antwortete die Function hier immer 200; die Wache zählte das als
    zugestellt, auch wenn Google jede Meldung abwies. Jetzt steht der Code in
    der Antwort, und „Kommen die Meldungen an?“ zeigt ihn. Ein totes Gerät
    ist kein solcher Fehler: es wird oben abgeräumt.
  */
  if (abgelehnt.size > 0) {
    return antwort({ error: `Google hat abgelehnt: ${[...abgelehnt].join(', ')}`, gesendet, geplant }, 502);
  }
  return antwort({ gesendet, geplant });
});
