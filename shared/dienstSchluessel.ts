/**
 * Woher eine Edge Function ihren Dienstschlüssel nimmt — und wann sie keinen hat.
 *
 * WARUM DAS EIGENEN CODE BRAUCHT. Der Dienstschlüssel wird von der Plattform
 * in die Umgebung gelegt, nicht von uns. Die Plattform hat dafür im Laufe der
 * Zeit zwei Namen benutzt: `SUPABASE_SERVICE_ROLE_KEY` für die alten
 * JWT-Schlüssel, `SUPABASE_SECRET_KEYS` seit der Umstellung auf
 * `sb_secret_…` — und das ist ein JSON-Verzeichnis, kein einzelner Wert.
 * Welcher Name in einem Projekt gesetzt ist, hängt davon ab, wann es
 * angelegt wurde. Ein fest verdrahteter Name ist damit eine Wette.
 *
 * WAS PASSIERT, WENN DIE WETTE VERLOREN GEHT — und das ist der eigentliche
 * Grund für diese Datei: `Deno.env.get(…)!` liefert dann `undefined`, und das
 * Ausrufezeichen verspricht dem Übersetzer etwas, was zur Laufzeit nicht
 * stimmt. Die Function läuft weiter, schickt `apikey: undefined` an die
 * Datenbank, bekommt 401 zurück und antwortet dem Anrufer mit „Keine
 * Anmeldung." Das ist wahr und vollkommen irreführend: es klingt nach einem
 * falschen Token des Anrufers und ist eine fehlende Variable im Dienst.
 *
 * Genau dieser Irrweg ist einmal passiert, im echten Projekt, und hat eine
 * Stunde gekostet. Deshalb: den Schlüssel EINMAL an einer Stelle auflösen,
 * und wenn keiner da ist, das auch sagen — mit dem Namen, der fehlt.
 */

/**
 * Die Namen, unter denen der Dienstschlüssel stehen kann, in dieser
 * Reihenfolge: der ältere zuerst, weil ein Projekt, in dem beide gesetzt
 * sind, seine bestehenden Aufrufe nicht verlieren soll.
 */
export const SCHLUESSEL_NAMEN = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEYS',
] as const;

/**
 * Der bevorzugte Eintrag im Verzeichnis der neuen Geheimschlüssel.
 *
 * `SUPABASE_SECRET_KEYS` ist kein einzelner Wert, sondern ein
 * JSON-Verzeichnis — beim Tausch eines Schlüssels stehen zwei darin, damit
 * der alte weiterläuft, während der neue schon gilt. `default` ist der, mit
 * dem gearbeitet werden soll.
 */
const VORZUGSEINTRAG = 'default';

/** Alle brauchbaren Einträge aus dem JSON-Verzeichnis, `default` zuerst. */
function ausVerzeichnis(roh: string): string[] {
  let gelesen: unknown;
  try {
    gelesen = JSON.parse(roh);
  } catch {
    /*
      Kein JSON. Statt hier zu scheitern, wird der Wert als der Schlüssel
      selbst genommen: sollte die Plattform je wieder eine einfache
      Zeichenkette hinterlegen, läuft der Dienst weiter, statt an einer
      Formatannahme von heute zu sterben.
    */
    return [roh];
  }
  if (typeof gelesen !== 'object' || gelesen === null) return [];

  const verzeichnis = gelesen as Record<string, unknown>;
  const brauchbar = (wert: unknown): wert is string =>
    typeof wert === 'string' && wert.trim().length > 0;

  const gefunden: string[] = [];
  const bevorzugt = verzeichnis[VORZUGSEINTRAG];
  if (brauchbar(bevorzugt)) gefunden.push(bevorzugt.trim());
  for (const [name, wert] of Object.entries(verzeichnis)) {
    if (name !== VORZUGSEINTRAG && brauchbar(wert)) gefunden.push(wert.trim());
  }
  return gefunden;
}

/**
 * ALLE Dienstschlüssel, die diese Umgebung kennt — in der Reihenfolge, in
 * der sie benutzt werden sollen.
 *
 * WARUM ALLE UND NICHT EINER. Ein Projekt kann mitten in der Ablösung
 * stehen: der alte JWT-Schlüssel ist noch gesetzt, der neue auch. Welcher im
 * Tresor liegt, entscheidet die Person, die ihn dort eingetragen hat — und
 * wenn die Function nur gegen EINEN vergleicht, hängt es am Zufall, ob es
 * derselbe ist. Der Fehlschlag sieht dann aus wie ein falscher Schlüssel und
 * ist eine Reihenfolge.
 *
 * Sicherheitlich kostet das nichts: jeder dieser Schlüssel hebelt die
 * Zeilenregeln ohnehin aus. Wer einen davon hat, IST der Dienst.
 *
 * Leerzeichen werden abgeschnitten: ein Schlüssel, der beim Einfügen einen
 * Zeilenumbruch mitbekommen hat, ist derselbe Schlüssel, und ein Vergleich,
 * der daran scheitert, wäre nicht sicherer, sondern nur schwerer zu finden.
 */
export function alleDienstSchluessel(
  umgebung: Record<string, string | undefined>,
): string[] {
  const gefunden: string[] = [];
  const alt = umgebung.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (alt) gefunden.push(alt);

  const neu = umgebung.SUPABASE_SECRET_KEYS?.trim();
  if (neu) gefunden.push(...ausVerzeichnis(neu).filter((k) => !gefunden.includes(k)));
  return gefunden;
}

/**
 * Der Schlüssel, mit dem die Function selbst spricht — oder `null`, wenn
 * keiner dasteht.
 */
export function dienstSchluessel(
  umgebung: Record<string, string | undefined>,
): string | null {
  return alleDienstSchluessel(umgebung)[0] ?? null;
}

/**
 * Sieht der Schlüssel aus wie ein JWT?
 *
 * WOZU DIE FRAGE. Die alten Schlüssel (`service_role`) SIND JWT, die neuen
 * (`sb_secret_…`) sind es nicht. Das Tor vor den Edge Functions prüft alles,
 * was im `Authorization`-Kopf steht, als JWT — und lehnt einen neuen
 * Schlüssel dort ab, auch wenn `apikey` daneben steht. Ein neuer Schlüssel
 * gehört deshalb NUR in `apikey`.
 *
 * Geprüft wird die Form, nicht die Gültigkeit: drei durch Punkte getrennte
 * Teile. Mehr braucht es nicht — die Entscheidung lautet „in welchen Kopf",
 * nicht „ist er echt". Echt oder nicht entscheidet ohnehin das Tor.
 */
export function istJwtFormat(wert: string): boolean {
  const teile = wert.split('.');
  return teile.length === 3 && teile.every((t) => t.length > 0);
}

/**
 * Ruft hier die Maschine an?
 *
 * DIE LEERE ZEICHENKETTE IST DER GRUND, WARUM DAS EINE FUNKTION IST. Ohne
 * Kopfzeile ist das Token `''`; fehlt der Dienstschlüssel, wäre er es
 * womöglich auch. Ein blosses `token === dienst` machte daraus „ja, das ist
 * der Dienst" — der Aufruf ganz ohne Anmeldung wäre der einzige, der
 * durchkäme. Beide Seiten müssen also gefüllt sein, bevor sie verglichen
 * werden.
 */
export function istDienst(token: string, dienst: string | null): boolean {
  const sauber = token.trim();
  return sauber !== '' && sauber === dienst;
}

/**
 * Kommt dieser Aufruf von der Maschine — gleich, in welchem Kopf der
 * Schlüssel steht?
 *
 * Der alte Schlüssel kommt als `Authorization: Bearer …`, der neue als
 * `apikey`. Beide Wege sind gleich stark: wer den Dienstschlüssel hat, ist
 * die Maschine, ganz gleich, in welche Kopfzeile er ihn schreibt — und
 * gleich, welchen der Schlüssel dieser Umgebung er benutzt.
 */
export function rufDerMaschine(
  authKopf: string,
  apikeyKopf: string,
  schluessel: readonly string[],
): boolean {
  const ausAuth = authKopf.startsWith('Bearer ') ? authKopf.slice(7) : '';
  return schluessel.some((s) => istDienst(ausAuth, s) || istDienst(apikeyKopf, s));
}

/**
 * Die Kopfzeilen, mit denen eine Function selbst bei Supabase anfragt.
 *
 * Der Schlüssel steht immer in `apikey`. In `Authorization` kommt er nur,
 * wenn er ein JWT ist — dort leitet PostgREST die Rolle daraus ab. Ein neuer
 * Schlüssel würde an derselben Stelle als kaputtes JWT abgewiesen.
 */
export function dienstKopfzeilen(dienst: string | null): Record<string, string> {
  const schluessel = dienst ?? '';
  const kopf: Record<string, string> = {
    apikey: schluessel,
    'Content-Type': 'application/json',
  };
  if (istJwtFormat(schluessel)) kopf.Authorization = `Bearer ${schluessel}`;
  return kopf;
}

/** Was einer Function fehlt, in Worten — für die Antwort nach aussen. */
export const SCHLUESSEL_FEHLT =
  `Dienstschlüssel fehlt: keine der Umgebungsvariablen ${SCHLUESSEL_NAMEN.join(' oder ')} ist gesetzt.`;
