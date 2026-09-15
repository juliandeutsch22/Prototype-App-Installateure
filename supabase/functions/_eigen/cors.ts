/**
 * WARUM DIESE DATEI NICHT IN `_shared/` LIEGT.
 *
 * `_shared/` ist ERZEUGT: `scripts/edge-shared-uebernehmen.mjs` löscht das
 * Verzeichnis bei jedem `npm test` und `npm run build` und schreibt es aus
 * `shared/` neu. Eine von Hand hineingelegte Datei ist beim nächsten Lauf
 * weg — genau das ist beim ersten Versuch passiert, und im Deploy wäre die
 * Function dann ohne sie hochgegangen.
 *
 * Nach `shared/` gehört sie auch nicht: dort stehen Regeln, die im Browser
 * UND auf dem Server dasselbe entscheiden müssen. Ein CORS-Kopf ist keine
 * Regel des Fachs, sondern Handwerkszeug der Edge Functions.
 *
 * Deshalb ein eigenes Verzeichnis daneben: eingecheckt, von Hand gepflegt,
 * und weil es unter `supabase/functions/` liegt, lädt `supabase functions
 * deploy` es mit hoch.
 */

/**
 * Der Vorabflug des Browsers — und warum ihn hier zwei Monate niemand vermisst
 * hat.
 *
 * WAS PASSIERT. Bevor der Browser eine Anfrage an eine fremde Herkunft
 * schickt, die nicht ganz einfach ist — und `Authorization` plus
 * `Content-Type: application/json` ist nicht einfach —, fragt er mit einem
 * `OPTIONS` vorher nach: darf ich? Antwortet die Gegenstelle darauf nicht mit
 * den passenden `Access-Control-*`-Kopfzeilen, wird die eigentliche Anfrage
 * gar nicht erst gestellt. Der Aufrufer sieht dann keinen Statuscode und
 * keinen Text, sondern nur, dass gar nichts ankam. In der App stand deshalb
 * „Failed to send a request to the Edge Function" — eine Meldung, die nach
 * Netzproblem aussieht und keines ist.
 *
 * WARUM ES ÖRTLICH FUNKTIONIERTE UND GEHOSTET NICHT. Vor dem örtlichen
 * Stapel steht Kong, und Kong beantwortet `OPTIONS` selbst, bevor die Anfrage
 * die Function überhaupt erreicht. Jede Prüfung gegen den örtlichen Stapel
 * war deshalb grün — und jede Prüfung mit `fetch` aus Node ohnehin, denn
 * Node kennt keinen Vorabflug. Es gab keinen Ort, an dem der Fehler sichtbar
 * werden konnte, ausser im Browser gegen das echte Projekt.
 *
 * Nachgemessen, an Kong vorbei direkt am Edge-Runtime:
 *
 *     OPTIONS /mitarbeiter-anlegen  →  405  {"error":"Nur POST."}
 *
 * Kein einziger `Access-Control`-Kopf. Genau das sieht der Browser.
 *
 * WARUM `*` UND KEINE LISTE ERLAUBTER HERKÜNFTE. Weil die Herkunft hier gar
 * nichts absichert: Anspruch kommt aus dem Token im `Authorization`-Kopf, und
 * jede dieser Functions prüft ihn selbst. Cookies sind nicht im Spiel, also
 * auch kein `Allow-Credentials` — und mit dem zusammen wäre `*` ohnehin
 * verboten. Eine feste Liste wäre zusätzlich falsch: die App ist
 * mandantenfähig und kann unter der Adresse eines Betriebs laufen. Man würde
 * eine Herkunft vergessen, und der Fehler sähe genauso aus wie dieser hier.
 */

const ERLAUBT: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  /*
    `apikey` und `x-client-info` schickt supabase-js von sich aus mit. Fehlt
    einer der Namen hier, lehnt der Browser den Vorabflug ab — und zwar mit
    derselben nichtssagenden Meldung wie bei gar keiner Antwort.
  */
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  /*
    Einen Tag lang nicht wieder fragen. Ohne das steht vor JEDEM Aufruf ein
    zweiter Weg über den Atlantik — spürbar auf einem Telefon im Funkloch.
  */
  'Access-Control-Max-Age': '86400',
};

/**
 * Eine Function so umhüllen, dass sie den Vorabflug beantwortet und JEDE
 * Antwort die Kopfzeilen trägt.
 *
 * WARUM UMHÜLLEN UND NICHT AN JEDER STELLE ANHÄNGEN. Diese Functions haben
 * ein Dutzend Ausgänge — 400, 401, 403, 405, 409, 500, 503 und der gute Fall.
 * Hängt man die Kopfzeilen von Hand an, fehlen sie irgendwann an einem davon,
 * und dann sieht der Benutzer bei genau diesem Fehler statt der Begründung
 * wieder „es kam nichts an". Der Weg, an dem man es nicht vergessen kann, ist
 * der einzige, der hier trägt.
 */
export function mitCors(
  behandeln: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    /*
      204 und kein Rumpf: der Vorabflug fragt nach Erlaubnis, nicht nach
      Inhalt. Er kommt ohne `Authorization` — der Browser schickt bei einem
      Vorabflug grundsätzlich keine —, und genau deshalb darf er die
      Anmeldeprüfung der Function NICHT durchlaufen. Er trägt auch keine
      Daten und kann deshalb nichts auslösen.
    */
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ERLAUBT });

    const antwort = await behandeln(req);
    const kopf = new Headers(antwort.headers);
    for (const [name, wert] of Object.entries(ERLAUBT)) kopf.set(name, wert);
    return new Response(antwort.body, {
      status: antwort.status,
      statusText: antwort.statusText,
      headers: kopf,
    });
  };
}
