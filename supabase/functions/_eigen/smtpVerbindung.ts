/**
 * Die Verbindung zum Mailserver für `smtpSenden` (`shared/smtp.ts`) — der
 * Teil, der Deno braucht und deshalb hier liegt, nicht in `shared/`.
 *
 * TLS VON ANFANG AN (Port 465) IST DER WEG IM GEHOSTETEN PROJEKT: Supabase
 * lässt aus Edge Functions keine Verbindungen zu den Ports 25 und 587 zu.
 * STARTTLS auf einem anderen Port (z. B. 2525) geht ebenso; unverschlüsselt
 * nur zum örtlichen Mailfänger (`smtpEinstellung` prüft das).
 *
 * Jede Zeile hat eine Frist: ein Server, der nicht antwortet, soll die
 * Function nicht bis zu ihrer eigenen Grenze festhalten.
 */
import type { SmtpEinstellung, Verbindung } from '../_shared/smtp.ts';

const FRIST_MS = 30_000;

export async function verbinden(e: SmtpEinstellung): Promise<Verbindung> {
  let conn: Deno.Conn = e.sicherheit === 'tls'
    ? await Deno.connectTls({ hostname: e.host, port: e.port })
    : await Deno.connect({ hostname: e.host, port: e.port });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let puffer = '';

  async function lesenMitFrist(ziel: Uint8Array): Promise<number | null> {
    let zeitgeber: number | undefined;
    const frist = new Promise<never>((_, nein) => {
      zeitgeber = setTimeout(() => nein(new Error('Der Mailserver antwortet nicht.')), FRIST_MS);
    });
    try {
      return await Promise.race([conn.read(ziel), frist]);
    } finally {
      clearTimeout(zeitgeber);
    }
  }

  return {
    async zeile() {
      for (;;) {
        const ende = puffer.indexOf('\r\n');
        if (ende >= 0) {
          const z = puffer.slice(0, ende);
          puffer = puffer.slice(ende + 2);
          return z;
        }
        const stueck = new Uint8Array(4096);
        const n = await lesenMitFrist(stueck);
        if (n === null) throw new Error('Der Mailserver hat die Verbindung beendet.');
        puffer += decoder.decode(stueck.subarray(0, n), { stream: true });
      }
    },
    async schreiben(text: string) {
      const bytes = encoder.encode(text);
      let geschrieben = 0;
      while (geschrieben < bytes.length) geschrieben += await conn.write(bytes.subarray(geschrieben));
    },
    async tlsStarten() {
      puffer = '';
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: e.host });
    },
    schliessen() {
      try {
        conn.close();
      } catch {
        // Schon zu — nichts zu tun.
      }
    },
  };
}
