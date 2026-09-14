/**
 * Was der Versand über Firebase Cloud Messaging braucht, ohne Firebase.
 *
 * WOFÜR DAS GETRENNT STEHT. Das Admin-SDK nahm einem zwei Dinge ab, die sonst
 * still danebengehen: ein signiertes JWT für den Tokendienst und die
 * Bedeutung der Fehlercodes. Beides steht in der Edge Function nicht zur
 * Verfügung — dort gibt es kein Admin-SDK —, und beides ist genau die Art
 * Code, bei der ein Tippfehler zu „invalid_grant" führt und zu sonst gar
 * nichts.
 *
 * Hier ist es prüfbar: `tests/unit/fcmVersand.test.ts` erzeugt einen eigenen
 * Schlüssel, lässt signieren und rechnet die Signatur nach. Was danach noch
 * ungeprüft bleibt, ist genau eine Runde — die zu Google.
 *
 * Die Datei importiert bewusst NICHTS: sie wird in die Edge Functions
 * kopiert (`scripts/edge-shared-uebernehmen.mjs`).
 */

/** Das Dienstkonto, wie Google es als JSON ausgibt — nur die drei Felder. */
export interface Dienstkonto {
  client_email: string;
  private_key: string;
  project_id: string;
}

/** Base64url ohne Füllzeichen — so verlangt es JWT. */
export function b64url(daten: Uint8Array | string): string {
  const bytes = typeof daten === 'string' ? new TextEncoder().encode(daten) : daten;
  let roh = '';
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Den PEM-Schlüssel in die Bytes bringen, die WebCrypto erwartet.
 *
 * Die Zeilenumbrüche müssen weg, und zwar ALLE: in einer Umgebungsvariablen
 * steht der Schlüssel oft mit `\n` als zwei Zeichen statt als Umbruch. Beides
 * fällt unter `\s+`, und beides ergibt sonst „Invalid keyData".
 */
export function schluesselBytes(pem: string): Uint8Array {
  const roh = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaer = atob(roh);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

/**
 * Ein signiertes JWT für den Tokendienst von Google.
 *
 * `jetzt` wird hereingereicht und nicht hier gelesen: sonst liesse sich die
 * Gültigkeitsdauer nicht nachrechnen, ohne die Uhr zu fälschen.
 */
export async function jwtBauen(konto: Dienstkonto, jetzt: number): Promise<string> {
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const rumpf = b64url(JSON.stringify({
    iss: konto.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: jetzt,
    exp: jetzt + 3600,
  }));
  const schluessel = await crypto.subtle.importKey(
    'pkcs8',
    schluesselBytes(konto.private_key) as unknown as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatur = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', schluessel, new TextEncoder().encode(`${kopf}.${rumpf}`),
  );
  return `${kopf}.${rumpf}.${b64url(new Uint8Array(signatur))}`;
}

/**
 * Die Fehlercodes von HTTP v1 auf die des Admin-SDK abbilden.
 *
 * DIE STELLE, AN DER EINE SORGFÄLTIGE ABWÄGUNG VERLOREN GEHEN KÖNNTE.
 * `toteTokens` unterscheidet zwischen „dieses Gerät gibt es nicht mehr" und
 * „gerade ging es nicht", und lässt `invalid-argument` ausdrücklich AUSSEN
 * VOR: derselbe Code kommt auch bei einer fehlerhaften Nachricht, und die
 * beträfe ALLE Empfänger auf einmal — ein Tippfehler im Meldungstext würde
 * sämtliche Geräte des Betriebs abmelden.
 *
 * Ohne diese Zuordnung hielte `toteTokens` jedes tote Gerät für lebendig, und
 * jeder Versand liefe bis in alle Ewigkeit in dieselben Fehler.
 */
export function alsSdkCode(fehler: unknown): string | undefined {
  const code =
    (fehler as { details?: Array<{ errorCode?: string }> })?.details
      ?.map((d) => d.errorCode).find(Boolean)
    ?? (fehler as { status?: string })?.status;
  if (code === 'UNREGISTERED') return 'messaging/registration-token-not-registered';
  if (code === 'INVALID_ARGUMENT') return 'messaging/invalid-argument';
  return code ? `messaging/${String(code).toLowerCase()}` : undefined;
}
