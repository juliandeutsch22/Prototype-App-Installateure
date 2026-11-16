import { describe, it, expect } from 'vitest';
import {
  adressKopf, ausBase64, base64, kopfKodieren, mimeNachricht, smtpEinstellung, smtpFehlerText, smtpSenden, SmtpFehler,
  type SmtpEinstellung, type Verbindung,
} from '@shared/smtp';

/*
  DER SMTP-VERSAND OHNE NETZ (F16). Ein nachgebauter Server antwortet nach
  Drehbuch; geprüft wird, was die Function sagt und wie sie auf Ablehnungen
  reagiert. Der echte Weg über Mailpit steht in
  `tests/supabase/belegMail.test.ts`.
*/

/** Ein Server nach Drehbuch: auf jede Zeile des Clients folgt die nächste Antwort. */
function server(eigene: Record<string, string>, gruss = '220 mail.test ESMTP') {
  const antworten: Record<string, string> = { DATA: '354 End data with <CR><LF>.<CR><LF>', ...eigene };
  const gesendet: string[] = [];
  const offen: string[] = [gruss];
  let tls = false;
  const v: Verbindung = {
    async zeile() {
      const z = offen.shift();
      if (z === undefined) throw new Error('Der Mailserver antwortet nicht.');
      return z;
    },
    async schreiben(text) {
      gesendet.push(text);
      const befehl = text.startsWith('EHLO') ? 'EHLO'
        : text.startsWith('AUTH PLAIN') ? 'AUTH PLAIN'
          : text.startsWith('RCPT') ? `RCPT ${/<(.*)>/.exec(text)![1]}`
            : text.startsWith('MAIL') ? 'MAIL' : text.endsWith('\r\n.\r\n') ? '.' : text.trim();
      const a = antworten[befehl] ?? (befehl.startsWith('RCPT') ? antworten.RCPT : undefined) ?? '250 ok';
      offen.push(...a.split('\n'));
    },
    async tlsStarten() {
      tls = true;
    },
    schliessen() {},
  };
  return { v, gesendet, istTls: () => tls };
}

const E: SmtpEinstellung = { host: 'mail.test', port: 465, sicherheit: 'tls', absender: 'office@senklot.at', benutzer: 'office@senklot.at', passwort: 'geheim' };
const EHLO = '250-mail.test\n250-SIZE 10000000\n250-AUTH PLAIN LOGIN\n250 8BITMIME';

describe('Die Einstellung aus den Secrets', () => {
  it('nichts gesetzt heißt nicht eingerichtet — kein Fehler', () => {
    expect(smtpEinstellung({})).toEqual({ einstellung: null, fehler: null });
  });
  it('vollständig: TLS auf 465 ist die Vorgabe', () => {
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.world4you.com', SMTP_ABSENDER: 'office@senklot.at', SMTP_BENUTZER: 'office@senklot.at', SMTP_PASSWORT: 'x' }))
      .toEqual({ einstellung: { host: 'smtp.world4you.com', port: 465, sicherheit: 'tls', absender: 'office@senklot.at', benutzer: 'office@senklot.at', passwort: 'x' }, fehler: null });
  });
  it('halb eingerichtet sagt, was fehlt', () => {
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.x.at' }).fehler).toMatch(/SMTP_ABSENDER/);
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.x.at', SMTP_ABSENDER: 'a@x.at', SMTP_BENUTZER: 'a' }).fehler).toMatch(/SMTP_PASSWORT/);
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.x.at', SMTP_ABSENDER: 'a@x.at', SMTP_SICHERHEIT: 'ssl' }).fehler).toMatch(/tls/);
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.x.at', SMTP_ABSENDER: 'a@x.at', SMTP_PORT: 'abc' }).fehler).toMatch(/Port/);
  });
  it('unverschlüsselt nur zum örtlichen Mailfänger', () => {
    expect(smtpEinstellung({ SMTP_HOST: 'inbucket', SMTP_PORT: '1025', SMTP_SICHERHEIT: 'keine', SMTP_ABSENDER: 'belege@senklot.invalid' }).einstellung)
      .toMatchObject({ host: 'inbucket', port: 1025, sicherheit: 'keine' });
    expect(smtpEinstellung({ SMTP_HOST: 'smtp.world4you.com', SMTP_SICHERHEIT: 'keine', SMTP_ABSENDER: 'a@x.at' }).fehler).toMatch(/Unverschlüsselt/);
  });
});

describe('Die Nachricht', () => {
  it('Base64 hin und zurück, auch an den Rändern', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 257]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      expect(Array.from(ausBase64(base64(b)))).toEqual(Array.from(b));
      expect(base64(b)).toBe(Buffer.from(b).toString('base64'));
    }
    expect(() => ausBase64('kein base64!')).toThrow();
  });

  it('Umlaute im Kopf als encoded word, ASCII bleibt, und kein Zeilenumbruch kommt durch', () => {
    expect(kopfKodieren('Rechnung RE-2026-1001')).toBe('Rechnung RE-2026-1001');
    const k = kopfKodieren('Rechnung für Maria Hübner');
    expect(k).toMatch(/^=\?UTF-8\?B\?/);
    expect(Buffer.from(k.replace(/=\?UTF-8\?B\?|\?=|\r\n /g, ''), 'base64').toString('utf8')).toBe('Rechnung für Maria Hübner');
    expect(adressKopf('office@senklot.at', 'Perl "Installationen"\r\nBcc: x@y.at')).toBe('"Perl  Installationen   Bcc: x@y.at" <office@senklot.at>');
  });

  it('Kopf, Text und PDF-Anhang; die Kopie an den Betrieb steht nicht im Kopf', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 Probe');
    const m = mimeNachricht({
      von: { adresse: 'office@senklot.at', name: 'Perl Installationen' }, antwortAn: 'office@perl.at',
      an: ['kunde@huber.at'], betreff: 'Rechnung RE-2026-1001', text: 'Sehr geehrte Damen und Herren,\n\nanbei …',
      anhang: { name: 'Rechnung_RE-2026-1001.pdf', mime: 'application/pdf', inhalt: pdf },
      datum: new Date('2026-11-15T17:05:00Z'), kennung: 'a1b2-c3',
    });
    expect(m).toContain('From: "Perl Installationen" <office@senklot.at>\r\n');
    expect(m).toContain('Reply-To: <office@perl.at>\r\n');
    expect(m).toContain('To: <kunde@huber.at>\r\n');
    expect(m).toContain('Date: Sun, 15 Nov 2026 17:05:00 +0000\r\n');
    expect(m).toContain('Message-ID: <a1b2-c3@senklot.at>');
    expect(m).toContain('Content-Disposition: attachment; filename="Rechnung_RE-2026-1001.pdf"');
    expect(m).toContain(Buffer.from(pdf).toString('base64'));
    // Die Kopie an den Betrieb geht nur im Umschlag (RCPT) mit — nie als Kopfzeile.
    expect(m).not.toMatch(/^(Bcc|Cc):/im);
    expect(m.split('\r\n').every((z) => z.length <= 998)).toBe(true);
  });
});

describe('Das Gespräch mit dem Server', () => {
  it('EHLO, Anmeldung, Absender, Empfänger samt Blindkopie, Daten — und die Annahme kommt zurück', async () => {
    const s = server({ EHLO, 'AUTH PLAIN': '235 ok', '.': '250 2.0.0 Ok: queued as 4F2A', QUIT: '221 bye' });
    const angenommen = await smtpSenden(s.v, E, { von: 'office@senklot.at', an: ['kunde@huber.at', 'office@perl.at'] }, 'Subject: x\r\n\r\n.Punkt\r\n');
    expect(angenommen).toBe('2.0.0 Ok: queued as 4F2A');
    expect(s.gesendet.map((z) => z.split(' ')[0].trim())).toEqual(['EHLO', 'AUTH', 'MAIL', 'RCPT', 'RCPT', 'DATA', 'Subject:', 'QUIT']);
    expect(s.gesendet[1]).toBe(`AUTH PLAIN ${Buffer.from('\0office@senklot.at\0geheim').toString('base64')}\r\n`);
    expect(s.gesendet[2]).toMatch(/^MAIL FROM:<office@senklot.at> SIZE=\d+\r\n$/);
    // Punkt am Zeilenanfang verdoppelt, Ende mit „.“ allein.
    expect(s.gesendet[6]).toBe('Subject: x\r\n\r\n..Punkt\r\n.\r\n');
  });

  it('STARTTLS: erst verschlüsseln, dann neu grüßen, dann anmelden', async () => {
    const s = server({ EHLO: '250-mail.test\n250-STARTTLS\n250 AUTH PLAIN', STARTTLS: '220 go ahead', 'AUTH PLAIN': '235 ok' });
    await smtpSenden(s.v, { ...E, sicherheit: 'starttls', port: 587 }, { von: E.absender, an: ['a@b.at'] }, 'x\r\n');
    expect(s.istTls()).toBe(true);
    expect(s.gesendet.slice(0, 4).map((z) => z.trim().split(' ')[0])).toEqual(['EHLO', 'STARTTLS', 'EHLO', 'AUTH']);
  });

  it('Gegenprobe: ohne STARTTLS-Angebot wird nicht unverschlüsselt angemeldet', async () => {
    const s = server({ EHLO: '250 mail.test' });
    await expect(smtpSenden(s.v, { ...E, sicherheit: 'starttls' }, { von: E.absender, an: ['a@b.at'] }, 'x\r\n'))
      .rejects.toMatchObject({ schritt: 'starttls' });
    expect(s.gesendet.some((z) => z.startsWith('AUTH'))).toBe(false);
  });

  it('nur LOGIN angeboten: Anmeldung über AUTH LOGIN', async () => {
    const s = server({ EHLO: '250-mail.test\n250 AUTH LOGIN', 'AUTH LOGIN': '334 VXNlcm5hbWU6', [Buffer.from('office@senklot.at').toString('base64')]: '334 UGFzc3dvcmQ6', [Buffer.from('geheim').toString('base64')]: '235 ok' });
    await smtpSenden(s.v, E, { von: E.absender, an: ['a@b.at'] }, 'x\r\n');
    expect(s.gesendet[1]).toBe('AUTH LOGIN\r\n');
  });

  it('ohne Zugangsdaten (örtlicher Mailfänger) keine Anmeldung', async () => {
    const s = server({ EHLO: '250 mail.test' });
    await smtpSenden(s.v, { host: 'inbucket', port: 1025, sicherheit: 'keine', absender: 'b@senklot.invalid' }, { von: 'b@senklot.invalid', an: ['a@b.at'] }, 'x\r\n');
    expect(s.gesendet.some((z) => z.startsWith('AUTH'))).toBe(false);
  });

  it('Ablehnungen kommen als Schritt mit Code — und als verständlicher Satz', async () => {
    const falsch = server({ EHLO, 'AUTH PLAIN': '535 5.7.8 Authentication credentials invalid' });
    const f1 = await smtpSenden(falsch.v, E, { von: E.absender, an: ['a@b.at'] }, 'x\r\n').catch((e) => e);
    expect(f1).toBeInstanceOf(SmtpFehler);
    expect(f1).toMatchObject({ schritt: 'anmeldung', code: 535 });
    expect(smtpFehlerText(f1)).toMatch(/falsch eingerichtet/);
    expect(falsch.gesendet.some((z) => z.startsWith('MAIL'))).toBe(false);

    const empfaenger = server({ EHLO, 'AUTH PLAIN': '235 ok', RCPT: '550 5.1.1 User unknown' });
    const f2 = await smtpSenden(empfaenger.v, E, { von: E.absender, an: ['weg@b.at'] }, 'x\r\n').catch((e) => e);
    expect(f2).toMatchObject({ schritt: 'empfaenger', code: 550 });
    expect(smtpFehlerText(f2)).toMatch(/Empfängeradresse abgelehnt/);
    expect(empfaenger.gesendet.some((z) => z === 'DATA\r\n')).toBe(false);

    const voll = server({ EHLO, 'AUTH PLAIN': '235 ok', '.': '451 4.3.0 try later' });
    const f3 = await smtpSenden(voll.v, E, { von: E.absender, an: ['a@b.at'] }, 'x\r\n').catch((e) => e);
    expect(f3.voruebergehend).toBe(true);
    expect(smtpFehlerText(f3)).toMatch(/vorübergehend/);

    expect(smtpFehlerText(new Error('ECONNREFUSED'))).toMatch(/nicht erreichbar/);
  });

  it('größer als der Server annimmt (SIZE): vor dem Senden abgebrochen', async () => {
    const s = server({ EHLO: '250-mail.test\n250 SIZE 100' });
    await expect(smtpSenden(s.v, { ...E, benutzer: undefined, passwort: undefined }, { von: E.absender, an: ['a@b.at'] }, 'x'.repeat(200)))
      .rejects.toMatchObject({ schritt: 'groesse' });
  });

  it('ein stummer Server bricht mit verständlichem Grund ab', async () => {
    const s = server({}, '');
    const f = await smtpSenden({ ...s.v, zeile: async () => { throw new Error('Der Mailserver antwortet nicht.'); } }, E, { von: E.absender, an: ['a@b.at'] }, 'x').catch((e) => e);
    expect(f).toMatchObject({ schritt: 'begruessung', code: 0 });
    expect(f.voruebergehend).toBe(true);
  });
});
