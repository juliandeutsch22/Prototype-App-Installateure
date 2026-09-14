/**
 * Das signierte JWT für Google — nachgerechnet.
 *
 * WARUM DAS EINEN TEST BRAUCHT. Das Admin-SDK nahm einem diese dreissig
 * Zeilen ab. Ohne es sind sie der Teil, bei dem ein Tippfehler zu
 * „invalid_grant" führt und zu sonst gar nichts: keine Meldung geht hinaus,
 * kein Fehler erscheint irgendwo, wo jemand hinsieht. Eine Push-Meldung, die
 * nicht ankommt, merkt niemand — das ist ihr gefährlichster Zug.
 *
 * Geprüft wird mit einem SELBST ERZEUGTEN Schlüssel: die Signatur wird mit
 * dem passenden öffentlichen Schlüssel nachgerechnet, und der Rumpf wird
 * gelesen. Ungeprüft bleibt danach genau eine Runde — die zu Google.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { jwtBauen, b64url, schluesselBytes, alsSdkCode, type Dienstkonto } from '@shared/fcmVersand';

let konto: Dienstkonto;
let oeffentlich: CryptoKey;

/** Bytes als PEM — so, wie Google das Dienstkonto ausliefert. */
function alsPem(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let roh = '';
  for (const x of b) roh += String.fromCharCode(x);
  const base = btoa(roh).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${base}\n-----END PRIVATE KEY-----\n`;
}

beforeAll(async () => {
  const paar = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  oeffentlich = paar.publicKey;
  konto = {
    client_email: 'dienst@perl-installationen.iam.gserviceaccount.com',
    project_id: 'perl-installationen',
    private_key: alsPem(await crypto.subtle.exportKey('pkcs8', paar.privateKey)),
  };
});

const teile = (jwt: string) => jwt.split('.');
const rumpfVon = (jwt: string) =>
  JSON.parse(Buffer.from(teile(jwt)[1], 'base64url').toString('utf8'));

describe('Das JWT für den Tokendienst', () => {
  it('trägt die Angaben, die Google verlangt', async () => {
    const jwt = await jwtBauen(konto, 1_700_000_000);
    const kopf = JSON.parse(Buffer.from(teile(jwt)[0], 'base64url').toString('utf8'));
    expect(kopf).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(rumpfVon(jwt)).toEqual({
      iss: konto.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      // Eine Stunde: länger nimmt Google nicht an.
      exp: 1_700_000_000 + 3600,
    });
  });

  it('ist mit dem Schlüssel des Dienstkontos signiert', async () => {
    const jwt = await jwtBauen(konto, 1_700_000_000);
    const [kopf, rumpf, signatur] = teile(jwt);
    const gueltig = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      oeffentlich,
      Buffer.from(signatur, 'base64url'),
      new TextEncoder().encode(`${kopf}.${rumpf}`),
    );
    expect(gueltig).toBe(true);
  });

  it('eine veränderte Nutzlast fällt durch', async () => {
    // Die Gegenprobe: ohne sie prüfte der Test darüber nur, dass irgendetwas
    // zurückkommt.
    const jwt = await jwtBauen(konto, 1_700_000_000);
    const [kopf, , signatur] = teile(jwt);
    const gefaelscht = b64url(JSON.stringify({ iss: 'wer-anderer@example.com' }));
    const gueltig = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      oeffentlich,
      Buffer.from(signatur, 'base64url'),
      new TextEncoder().encode(`${kopf}.${gefaelscht}`),
    );
    expect(gueltig).toBe(false);
  });

  it('kommt auch mit einem Schlüssel aus einer Umgebungsvariablen zurecht', async () => {
    /*
      In einer Umgebungsvariablen steht der Schlüssel oft mit `\\n` als ZWEI
      ZEICHEN statt als Umbruch. Ohne die Rückübersetzung ergäbe das „Invalid
      keyData" — und zwar erst im Betrieb, beim ersten Versand.
    */
    const flach = { ...konto, private_key: konto.private_key.replace(/\n/g, '\\n') };
    await expect(jwtBauen(flach, 1)).resolves.toContain('.');
  });

  it('base64url schreibt ohne Füllzeichen und ohne + oder /', () => {
    // JWT verträgt beides nicht. Auffallen würde es erst bei der Nutzlast,
    // die zufällig eines davon erzeugt.
    const text = b64url('?>?>?>üüü');
    expect(text).not.toMatch(/[+/=]/);
  });

  it('der Schlüssel wird auf seine reinen Bytes zurückgeführt', () => {
    expect(schluesselBytes(konto.private_key).length).toBeGreaterThan(100);
  });
});

describe('Die Fehlercodes von HTTP v1', () => {
  /*
    DIE STELLE, AN DER EINE SORGFÄLTIGE ABWÄGUNG VERLOREN GEHEN KÖNNTE.
    `toteTokens` meldet ein Gerät nur bei „endgültig ungültig" ab und lässt
    `invalid-argument` ausdrücklich aussen vor — derselbe Code kommt auch bei
    einer fehlerhaften Nachricht, und die beträfe ALLE Empfänger auf einmal.
  */
  it('ein abgemeldetes Gerät heisst weiterhin so, wie `toteTokens` es kennt', () => {
    expect(alsSdkCode({ details: [{ errorCode: 'UNREGISTERED' }] }))
      .toBe('messaging/registration-token-not-registered');
  });

  it('ein fehlerhaftes Argument behält seinen eigenen Code', () => {
    expect(alsSdkCode({ details: [{ errorCode: 'INVALID_ARGUMENT' }] }))
      .toBe('messaging/invalid-argument');
  });

  it('ein vorübergehender Fehler wird nicht zu einem endgültigen', () => {
    // Kontingent erschöpft: das Gerät lebt, der Versand ging nur gerade nicht.
    expect(alsSdkCode({ details: [{ errorCode: 'QUOTA_EXCEEDED' }] }))
      .toBe('messaging/quota_exceeded');
    expect(alsSdkCode({ status: 'UNAVAILABLE' })).toBe('messaging/unavailable');
  });

  it('und ohne Code gibt es keinen', () => {
    expect(alsSdkCode({})).toBeUndefined();
    expect(alsSdkCode(undefined)).toBeUndefined();
  });
});
