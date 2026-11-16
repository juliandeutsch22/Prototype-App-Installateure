/**
 * Mail über SMTP verschicken — der Teil ohne Netz: Einstellungen aus der
 * Umgebung, die Nachricht im MIME-Format und das Gespräch mit dem Server.
 * Die Verbindung selbst (TCP/TLS) steckt die Edge Function `beleg-mail`
 * hinein (`supabase/functions/_eigen/smtpVerbindung.ts`).
 *
 * WARUM SELBST GESCHRIEBEN STATT EINER BIBLIOTHEK. Die Functions laden keine
 * fremden Pakete (jede bisher nicht); ein SMTP-Client aus dem Netz brächte
 * Abhängigkeiten in den Weg, über den Rechnungen an Kunden gehen. Das
 * Gespräch ist klein (EHLO, STARTTLS, AUTH, MAIL, RCPT, DATA, QUIT) und hier
 * ohne Netz prüfbar (`tests/unit/smtp.test.ts`, mit einem nachgebauten Server).
 *
 * WARUM HIER UND NICHT IN `_eigen/`. Die Prüfungen laufen in Vitest; was in
 * `_eigen/` liegt, braucht Deno. Ohne Importe — die Function lädt die Kopie
 * in `supabase/functions/_shared/`.
 */

export type Sicherheit = 'tls' | 'starttls' | 'keine';

export interface SmtpEinstellung {
  host: string;
  port: number;
  sicherheit: Sicherheit;
  benutzer?: string;
  passwort?: string;
  /** Die Absenderadresse — eine der Domain mit SPF und DKIM (z. B. office@senklot.at). */
  absender: string;
}

/** Die Namen der Secrets der Edge Function — dokumentiert in `docs/DEPLOYMENT.md`. */
export const SMTP_SECRETS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SICHERHEIT', 'SMTP_BENUTZER', 'SMTP_PASSWORT', 'SMTP_ABSENDER'] as const;

/**
 * Ein Host, für den unverschlüsselt erlaubt ist: nur der Mailfänger des
 * örtlichen Stapels (Mailpit, im Docker-Netz „inbucket“) und localhost. Gegen
 * einen Server im Netz ginge sonst ein Passwort im Klartext hinaus — und eine
 * Rechnung mit Namen und Beträgen ebenso.
 */
function istOertlich(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'inbucket' || h === 'mailpit' || !h.includes('.');
}

/**
 * Die Einstellung aus den Secrets — oder warum es keine gibt.
 *
 * NICHT EINGERICHTET (kein Host, kein Absender) ist kein Fehler, sondern ein
 * Zustand: die App bietet dann den bisherigen Weg an. HALB EINGERICHTET ist
 * ein Fehler, mit dem Namen dessen, was fehlt — wie bei der Sicherung
 * (`docs/DEPLOYMENT.md`, Abschnitt 5).
 */
export function smtpEinstellung(
  umgebung: Record<string, string | undefined>,
): { einstellung: SmtpEinstellung | null; fehler: string | null } {
  const w = (n: string) => umgebung[n]?.trim() || undefined;
  const host = w('SMTP_HOST');
  const absender = w('SMTP_ABSENDER');
  const benutzer = w('SMTP_BENUTZER');
  const passwort = umgebung.SMTP_PASSWORT || undefined;
  if (!host && !absender && !benutzer && !passwort) return { einstellung: null, fehler: null };
  if (!host) return { einstellung: null, fehler: 'SMTP_HOST fehlt.' };
  if (!absender) return { einstellung: null, fehler: 'SMTP_ABSENDER fehlt.' };
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(absender)) return { einstellung: null, fehler: 'SMTP_ABSENDER ist keine E-Mail-Adresse.' };
  if (!!benutzer !== !!passwort) return { einstellung: null, fehler: benutzer ? 'SMTP_PASSWORT fehlt.' : 'SMTP_BENUTZER fehlt.' };
  const roh = (w('SMTP_SICHERHEIT') ?? 'tls').toLowerCase();
  if (roh !== 'tls' && roh !== 'starttls' && roh !== 'keine') {
    return { einstellung: null, fehler: 'SMTP_SICHERHEIT ist „tls“, „starttls“ oder „keine“.' };
  }
  const sicherheit = roh as Sicherheit;
  if (sicherheit === 'keine' && !istOertlich(host)) {
    return { einstellung: null, fehler: 'Unverschlüsselt („keine“) nur für den örtlichen Mailfänger — sonst „tls“ (Port 465) oder „starttls“.' };
  }
  const port = w('SMTP_PORT') ? Number(w('SMTP_PORT')) : sicherheit === 'tls' ? 465 : sicherheit === 'starttls' ? 587 : 25;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { einstellung: null, fehler: 'SMTP_PORT ist keine Portnummer.' };
  return { einstellung: { host, port, sicherheit, absender, ...(benutzer ? { benutzer, passwort } : {}) }, fehler: null };
}

// ---------------------------------------------------------------------------
// Die Nachricht
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 ohne `btoa` — der Anhang ist binär und groß; ein Umweg über eine Zeichenkette wäre beides nicht wert. */
export function base64(bytes: Uint8Array): string {
  let raus = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    raus += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    raus += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  return raus;
}

/** Base64 zurück — für den Anhang, den die App schickt. Wirft bei allem, was kein Base64 ist. */
export function ausBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = text.replace(/\s+/g, '');
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Kein Base64.');
  const laenge = (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
  const raus = new Uint8Array(laenge);
  let j = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12)
      | ((s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2])) << 6) | (s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]));
    if (j < laenge) raus[j++] = (n >> 16) & 255;
    if (j < laenge) raus[j++] = (n >> 8) & 255;
    if (j < laenge) raus[j++] = n & 255;
  }
  return raus;
}

/** In Zeilen zu 76 Zeichen (RFC 2045). */
function zeilen76(s: string): string {
  return s.replace(/.{1,76}/g, (z) => `${z}\r\n`);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * Ein Kopfwert: reines ASCII bleibt, alles andere als „encoded word“
 * (RFC 2047, UTF-8, Base64), in Stücken, die eine Zeile nicht sprengen —
 * ohne ein Zeichen zu zerteilen.
 */
export function kopfKodieren(wert: string): string {
  if (/^[\x20-\x7e]*$/.test(wert)) return wert;
  const stuecke: string[] = [];
  let jetzt = '';
  for (const z of Array.from(wert)) {
    if (utf8(jetzt + z).length > 45) {
      stuecke.push(jetzt);
      jetzt = '';
    }
    jetzt += z;
  }
  if (jetzt) stuecke.push(jetzt);
  return stuecke.map((s) => `=?UTF-8?B?${base64(utf8(s))}?=`).join('\r\n ');
}

/** Name und Adresse für From/Reply-To: „Perl Installationen“ <office@senklot.at>. */
export function adressKopf(adresse: string, name?: string): string {
  if (!name) return `<${adresse}>`;
  const sauber = name.replace(/[\r\n"\\]/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(sauber) ? `"${sauber}" <${adresse}>` : `${kopfKodieren(sauber)} <${adresse}>`;
}

export interface Nachricht {
  von: { adresse: string; name?: string };
  antwortAn?: string;
  an: string[];
  betreff: string;
  text: string;
  anhang?: { name: string; mime: string; inhalt: Uint8Array };
  /** Für die Message-ID: die Domain des Absenders. */
  datum: Date;
  kennung: string;
}

/** Datum nach RFC 5322 in UTC: „Sun, 15 Nov 2026 17:05:00 +0000“. */
function mailDatum(d: Date): string {
  return d.toUTCString().replace('GMT', '+0000');
}

/**
 * Die ganze Nachricht mit CRLF. Text als UTF-8 in Base64 — damit geht jedes
 * Zeichen unbeschadet durch jeden Server, und kein Punkt am Zeilenanfang muss
 * gesondert behandelt werden; der Anhang als PDF in Base64.
 */
export function mimeNachricht(n: Nachricht): string {
  const domain = n.von.adresse.split('@')[1] ?? 'localhost';
  const grenze = `=_senklot_${n.kennung.replace(/[^A-Za-z0-9]/g, '')}`;
  const kopf = [
    `From: ${adressKopf(n.von.adresse, n.von.name)}`,
    ...(n.antwortAn ? [`Reply-To: ${adressKopf(n.antwortAn)}`] : []),
    `To: ${n.an.map((a) => adressKopf(a)).join(', ')}`,
    `Subject: ${kopfKodieren(n.betreff)}`,
    `Date: ${mailDatum(n.datum)}`,
    `Message-ID: <${n.kennung}@${domain}>`,
    'MIME-Version: 1.0',
    // Kein Rundschreiben: Abwesenheitsnotizen und Weiterleitungsregeln sollen nicht antworten.
    'Auto-Submitted: auto-generated',
  ];
  const text = zeilen76(base64(utf8(n.text.replace(/\r?\n/g, '\r\n'))));
  if (!n.anhang) {
    return [...kopf, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', text].join('\r\n');
  }
  const name = n.anhang.name.replace(/[^A-Za-z0-9._-]/g, '_');
  return [
    ...kopf,
    `Content-Type: multipart/mixed; boundary="${grenze}"`,
    '',
    'Diese Nachricht besteht aus mehreren Teilen im MIME-Format.',
    `--${grenze}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    text,
    `--${grenze}`,
    `Content-Type: ${n.anhang.mime}; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${name}"`,
    '',
    zeilen76(base64(n.anhang.inhalt)),
    `--${grenze}--`,
    '',
  ].join('\r\n');
}

// ---------------------------------------------------------------------------
// Das Gespräch mit dem Server
// ---------------------------------------------------------------------------

/** Was die Edge Function als Verbindung hineinreicht. */
export interface Verbindung {
  /** Eine Zeile ohne CRLF; wirft bei Zeitüberschreitung oder geschlossener Verbindung. */
  zeile(): Promise<string>;
  schreiben(text: string): Promise<void>;
  /** STARTTLS: dieselbe Verbindung verschlüsselt weiterführen. */
  tlsStarten(): Promise<void>;
  schliessen(): void;
}

/** Wobei es scheiterte, und was das für den Benutzer heißt. */
export type SmtpSchritt = 'verbinden' | 'begruessung' | 'ehlo' | 'starttls' | 'anmeldung' | 'absender' | 'empfaenger' | 'daten' | 'groesse';

export class SmtpFehler extends Error {
  readonly schritt: SmtpSchritt;
  readonly code: number;
  readonly antwort: string;
  constructor(schritt: SmtpSchritt, code: number, antwort: string) {
    super(`SMTP ${schritt}: ${code} ${antwort}`);
    this.schritt = schritt;
    this.code = code;
    this.antwort = antwort;
  }
  /** Ist es vorübergehend (4xx, Verbindung) — lohnt ein späterer Versuch? */
  get voruebergehend(): boolean {
    return this.code === 0 || (this.code >= 400 && this.code < 500);
  }
}

/** Ein Satz für die App — ohne Interna des Servers, mit dem, was zu tun ist. */
export function smtpFehlerText(f: unknown): string {
  if (!(f instanceof SmtpFehler)) return 'Der Mailserver war nicht erreichbar. Bitte später noch einmal versuchen oder das PDF selbst senden.';
  switch (f.schritt) {
    case 'empfaenger':
      return 'Der Mailserver hat die Empfängeradresse abgelehnt. Bitte die Adresse prüfen.';
    case 'groesse':
      return 'Die Mail ist für den Mailserver zu groß. Bitte das PDF selbst senden.';
    case 'anmeldung':
    case 'starttls':
      return 'Der Mailversand ist falsch eingerichtet (Anmeldung am Mailserver gescheitert). Bitte dem Betreiber melden; bis dahin das PDF selbst senden.';
    default:
      return f.voruebergehend
        ? 'Der Mailserver hat die Mail vorübergehend nicht angenommen. Bitte in einigen Minuten noch einmal versuchen.'
        : 'Der Mailserver hat die Mail abgelehnt. Bitte das PDF selbst senden.';
  }
}

async function antwort(v: Verbindung, schritt: SmtpSchritt): Promise<{ code: number; zeilen: string[] }> {
  const zeilen: string[] = [];
  for (;;) {
    let z: string;
    try {
      z = await v.zeile();
    } catch (e) {
      throw new SmtpFehler(schritt, 0, (e as Error).message);
    }
    const m = /^(\d{3})([ -])(.*)$/.exec(z);
    if (!m) throw new SmtpFehler(schritt, 0, `unverständliche Antwort: ${z.slice(0, 80)}`);
    zeilen.push(m[3]);
    if (m[2] === ' ') return { code: Number(m[1]), zeilen };
  }
}

async function befehl(v: Verbindung, text: string, schritt: SmtpSchritt, erwartet: number[]): Promise<string[]> {
  await v.schreiben(`${text}\r\n`);
  const a = await antwort(v, schritt);
  if (!erwartet.includes(a.code)) throw new SmtpFehler(schritt, a.code, a.zeilen.join(' '));
  return a.zeilen;
}

/**
 * Eine Nachricht abgeben. `umschlag.an` sind ALLE Empfänger, auch die Kopie
 * an den Betrieb (die im Kopf nicht steht — eine Blindkopie).
 *
 * Gibt die Annahme des Servers zurück („250 2.0.0 Ok: queued as …“): die
 * steht im Protokoll, falls einmal nachgefragt wird, ob eine Mail
 * hinausging.
 */
export async function smtpSenden(
  v: Verbindung,
  e: SmtpEinstellung,
  umschlag: { von: string; an: string[] },
  daten: string,
  rechnername = 'senklot',
): Promise<string> {
  const gruss = await antwort(v, 'begruessung');
  if (gruss.code !== 220) throw new SmtpFehler('begruessung', gruss.code, gruss.zeilen.join(' '));
  let faehig = await befehl(v, `EHLO ${rechnername}`, 'ehlo', [250]);
  if (e.sicherheit === 'starttls') {
    if (!faehig.some((z) => /^STARTTLS\b/i.test(z))) throw new SmtpFehler('starttls', 0, 'Der Server bietet kein STARTTLS an.');
    await befehl(v, 'STARTTLS', 'starttls', [220]);
    await v.tlsStarten();
    faehig = await befehl(v, `EHLO ${rechnername}`, 'ehlo', [250]);
  }
  const groesse = faehig.map((z) => /^SIZE\s+(\d+)/i.exec(z)).find(Boolean);
  if (groesse && Number(groesse[1]) > 0 && daten.length > Number(groesse[1])) {
    throw new SmtpFehler('groesse', 552, `Nachricht ${daten.length} Bytes, Server nimmt ${groesse[1]}.`);
  }
  if (e.benutzer && e.passwort !== undefined) {
    const auth = faehig.find((z) => /^AUTH\b/i.test(z))?.toUpperCase() ?? '';
    if (/\bPLAIN\b/.test(auth) || !/\bLOGIN\b/.test(auth)) {
      await befehl(v, `AUTH PLAIN ${base64(utf8(`\u0000${e.benutzer}\u0000${e.passwort}`))}`, 'anmeldung', [235]);
    } else {
      await befehl(v, 'AUTH LOGIN', 'anmeldung', [334]);
      await befehl(v, base64(utf8(e.benutzer)), 'anmeldung', [334]);
      await befehl(v, base64(utf8(e.passwort)), 'anmeldung', [235]);
    }
  }
  await befehl(v, `MAIL FROM:<${umschlag.von}>${groesse ? ` SIZE=${daten.length}` : ''}`, 'absender', [250]);
  for (const an of umschlag.an) await befehl(v, `RCPT TO:<${an}>`, 'empfaenger', [250, 251]);
  await befehl(v, 'DATA', 'daten', [354]);
  // Punkt am Zeilenanfang verdoppeln (RFC 5321, 4.5.2) — bei Base64 kommt keiner vor, im Kopf vielleicht doch.
  const geschuetzt = daten.replace(/\r\n\./g, '\r\n..').replace(/^\./, '..');
  const angenommen = await befehl(v, `${geschuetzt.replace(/\r\n$/, '')}\r\n.`, 'daten', [250]);
  try {
    await befehl(v, 'QUIT', 'daten', [221]);
  } catch {
    // Angenommen ist angenommen — ein Server, der sich beim Abschied verschluckt, ändert daran nichts.
  }
  return angenommen.join(' ');
}
