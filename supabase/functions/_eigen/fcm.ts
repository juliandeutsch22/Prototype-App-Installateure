/**
 * Der Versand an Google — für `push-melden` und `push-probe` derselbe, damit
 * die Probemeldung genau den Weg nimmt, den jede Meldung nimmt.
 *
 * Handwerk der Edge Functions (Netz, Zugangstoken), deshalb hier und nicht in
 * `shared/`: was daran zu entscheiden ist — die Form der Nachricht und die
 * Bedeutung der Fehlercodes —, steht in `shared/fcmVersand.ts` und ist dort
 * geprüft.
 */
import { alsSdkCode, fcmNachricht, jwtBauen, type Dienstkonto } from '../_shared/fcmVersand.ts';

export async function zugangstoken(konto: Dienstkonto): Promise<string> {
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
export async function anEinGeraet(
  projekt: string, token: string, zugang: string, daten: Record<string, string>,
): Promise<{ error?: { code?: string } }> {
  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projekt}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${zugang}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmNachricht(token, daten)),
    },
  );
  if (r.ok) return {};
  const rumpf = await r.json().catch(() => ({}));
  return { error: { code: alsSdkCode(rumpf.error) ?? `http-${r.status}` } };
}
