import { createHmac } from 'node:crypto';

/**
 * Ein TOTP-Code nach RFC 6238 — für die Prüfungen der Zwei-Faktor-Anmeldung
 * (Runde 3, H1). Die App rechnet keinen Code selbst; das tut die
 * Authenticator-App am Telefon. Im Test steht diese Funktion an ihrer Stelle.
 */
export function totp(geheimnis: string, zeitpunktMs = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const z of geheimnis.replace(/=+$/, '').toUpperCase()) {
    const wert = alphabet.indexOf(z);
    if (wert < 0) continue;
    bits += wert.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const schritt = Math.floor(zeitpunktMs / 1000 / 30);
  const zaehler = Buffer.alloc(8);
  zaehler.writeBigUInt64BE(BigInt(schritt));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(zaehler).digest();
  const versatz = hmac[hmac.length - 1] & 0x0f;
  const zahl = ((hmac[versatz] & 0x7f) << 24) | (hmac[versatz + 1] << 16) | (hmac[versatz + 2] << 8) | hmac[versatz + 3];
  return String(zahl % 1_000_000).padStart(6, '0');
}
