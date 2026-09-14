/**
 * Woher eine Edge Function ihren Dienstschlüssel nimmt — und wann sie keinen hat.
 *
 * WARUM DAS EIGENEN CODE BRAUCHT. Der Dienstschlüssel wird von der Plattform
 * in die Umgebung gelegt, nicht von uns. Die Plattform hat dafür im Laufe der
 * Zeit zwei Namen benutzt: `SUPABASE_SERVICE_ROLE_KEY` für die alten
 * JWT-Schlüssel, `SUPABASE_SECRET_KEY` seit der Umstellung auf
 * `sb_secret_…`. Welcher Name in einem Projekt gesetzt ist, hängt davon ab,
 * wann es angelegt wurde. Ein fest verdrahteter Name ist damit eine Wette.
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
  'SUPABASE_SECRET_KEY',
] as const;

/**
 * Der Dienstschlüssel aus der Umgebung — oder `null`, wenn keiner dasteht.
 *
 * Leerzeichen werden abgeschnitten: ein Schlüssel, der beim Einfügen einen
 * Zeilenumbruch mitbekommen hat, ist derselbe Schlüssel, und ein Vergleich,
 * der daran scheitert, wäre nicht sicherer, sondern nur schwerer zu finden.
 */
export function dienstSchluessel(
  umgebung: Record<string, string | undefined>,
): string | null {
  for (const name of SCHLUESSEL_NAMEN) {
    const wert = umgebung[name]?.trim();
    if (wert) return wert;
  }
  return null;
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

/** Was einer Function fehlt, in Worten — für die Antwort nach aussen. */
export const SCHLUESSEL_FEHLT =
  `Dienstschlüssel fehlt: keine der Umgebungsvariablen ${SCHLUESSEL_NAMEN.join(' oder ')} ist gesetzt.`;
