/**
 * Signature Version 4 für einen einzelnen PUT — so viel, wie die Sicherung
 * ausser Haus braucht, und keinen Handgriff mehr.
 *
 * WARUM SELBST GESCHRIEBEN UND KEINE BIBLIOTHEK. Diese Datei läuft in einer
 * Edge Function (Deno) UND wird im Node-Testlauf geprüft; sie darf deshalb
 * nichts importieren ausser dem, was beide haben — und das ist die
 * Web-Crypto-Schnittstelle. Ein SDK für einen einzigen PUT wäre ein Paket
 * von einigen hundert Kilobyte für dreissig Zeilen Rechnung, die sich exakt
 * nachprüfen lässt: AWS veröffentlicht Testvektoren, und genau gegen die
 * prüft `tests/unit/s3Signatur.test.ts`.
 *
 * WARUM DIE S3-SCHNITTSTELLE UND NICHT DIE VON GOOGLE. Google Cloud Storage
 * spricht beides. Der Google-eigene Weg verlangt ein Dienstkonto-JSON, ein
 * selbst signiertes JWT und einen Tausch gegen ein Token — drei Schritte, die
 * alle ablaufen können. Die S3-Schnittstelle verlangt zwei Zeichenketten und
 * rechnet den Rest aus. Und sie ist nicht Google-eigen: derselbe Code trägt
 * morgen zu Cloudflare R2, Wasabi oder Hetzner, falls der Betrieb den
 * Anbieter wechseln will. Bei einer SICHERUNG ist das keine Kleinigkeit —
 * sie soll den Anbieter überleben, gegen dessen Ausfall sie gebaut ist.
 */

const KODIERER = new TextEncoder();

/*
  `Uint8Array<ArrayBuffer>` und nicht bloss `Uint8Array`: die Typen der
  Web-Crypto-Schnittstelle schliessen einen geteilten Puffer aus, und ein
  `as`-Umweg an dieser Stelle hätte genau die Prüfung ausgeschaltet, die hier
  etwas taugt.
*/
type Bytes = Uint8Array<ArrayBuffer>;

function roh(text: string): Bytes {
  return KODIERER.encode(text) as Bytes;
}

/**
 * Der SHA-256 eines Textes, hexadezimal.
 *
 * Nach aussen gereicht, weil S3 den Inhaltshash als KOPFZEILE verlangt
 * (`x-amz-content-sha256`) und der Aufrufer ihn deshalb ohnehin braucht.
 * Ihn hier heimlich dazuzulegen wäre bequemer gewesen und hätte diese
 * Funktion um genau das gebracht, was sie prüfbar macht: dass sie signiert,
 * was man ihr gibt, und nichts sonst. Nur so lässt sie sich gegen die
 * veröffentlichten Testvektoren halten.
 */
export async function inhaltsHash(daten: string): Promise<string> {
  return alsHex(new Uint8Array(await crypto.subtle.digest('SHA-256', roh(daten))) as Bytes);
}

async function hmac(schluessel: Bytes, nachricht: string): Promise<Bytes> {
  const k = await crypto.subtle.importKey(
    'raw', schluessel, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, roh(nachricht))) as Bytes;
}

function alsHex(bytes: Bytes): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ein Pfadabschnitt, wie SigV4 ihn erwartet.
 *
 * `encodeURIComponent` lässt `!'()*` stehen; die Signatur verlangt sie
 * kodiert. Bleibt einer davon unkodiert, unterscheidet sich die berechnete
 * Signatur von der des Servers — und der antwortet mit 403, ohne zu sagen
 * warum. Ein Betriebsname mit Apostroph hätte gereicht.
 */
export function pfadKodieren(pfad: string): string {
  return pfad
    .split('/')
    .map((teil) =>
      encodeURIComponent(teil).replace(
        /[!'()*]/g,
        (z) => `%${z.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/** '20260915T123600Z' und '20260915' — beide Formen, aus einem Zeitpunkt. */
export function zeitstempel(jetzt: Date): { lang: string; kurz: string } {
  const lang = `${jetzt.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  return { lang, kurz: lang.slice(0, 8) };
}

export interface Signatureingabe {
  /** z. B. 'https://storage.googleapis.com' */
  endpunkt: string;
  region: string;
  /** Dienstname im Geltungsbereich. Für S3 und alles Kompatible: 's3'. */
  dienst?: string;
  verb: string;
  /** Pfad OHNE führenden Schrägstrich, z. B. 'eimer/ausleitung/perl/…' */
  pfad: string;
  inhalt: string;
  schluessel: string;
  geheimnis: string;
  jetzt: Date;
  /** Zusätzliche Kopfzeilen, die MITSIGNIERT werden sollen. */
  kopfzeilen?: Record<string, string>;
}

/**
 * Die fertigen Kopfzeilen für einen signierten Aufruf.
 *
 * SIGNIERT WIRD, WAS ÜBERGEBEN WURDE — `host`, `x-amz-date` und jede
 * Kopfzeile aus `kopfzeilen`. Die Funktion legt von sich aus nichts dazu.
 * Das ist keine Kargheit, sondern die Bedingung dafür, dass sie sich gegen
 * die veröffentlichten Testvektoren halten lässt: ein heimlich ergänztes
 * Feld verändert die Signatur, und die Prüfung könnte nur noch die FORM
 * vergleichen statt den Wert.
 *
 * Der Aufrufer für S3 übergibt `x-amz-content-sha256` — dort ist der
 * Inhaltshash Pflicht, und das aus gutem Grund: ohne ihn liesse sich der
 * Text unterwegs austauschen, und die Sicherung enthielte etwas anderes als
 * der Betrieb. Der schlimmste denkbare Fehler bei einer Sicherung, weil er
 * erst beim Wiederanlauf auffällt.
 */
export async function signiere(e: Signatureingabe): Promise<Record<string, string>> {
  const dienst = e.dienst ?? 's3';
  const { lang, kurz } = zeitstempel(e.jetzt);
  const host = new URL(e.endpunkt).host;
  const nutzlast = await inhaltsHash(e.inhalt);

  const alle: Record<string, string> = {
    host,
    'x-amz-date': lang,
    ...Object.fromEntries(
      Object.entries(e.kopfzeilen ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };
  // Alphabetisch, Werte auf einfache Leerzeichen zusammengezogen — beides
  // schreibt die Spezifikation vor, und beides bricht still, wenn es fehlt.
  const namen = Object.keys(alle).sort();
  const kanonischeKopfzeilen = namen
    .map((n) => `${n}:${alle[n].trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const unterschrieben = namen.join(';');

  const kanonisch = [
    e.verb,
    `/${pfadKodieren(e.pfad)}`,
    '',
    kanonischeKopfzeilen,
    unterschrieben,
    nutzlast,
  ].join('\n');

  const geltungsbereich = `${kurz}/${e.region}/${dienst}/aws4_request`;
  const zuSignieren = [
    'AWS4-HMAC-SHA256',
    lang,
    geltungsbereich,
    await inhaltsHash(kanonisch),
  ].join('\n');

  /*
    Die Schlüsselkette: aus dem Geheimnis wird über Datum, Region und Dienst
    ein Schlüssel, der NUR für diesen Tag, diese Region und diesen Dienst
    gilt. Deshalb ist eine abgefangene Signatur morgen wertlos.
  */
  let k = roh(`AWS4${e.geheimnis}`);
  for (const teil of [kurz, e.region, dienst, 'aws4_request']) k = await hmac(k, teil);
  const signatur = alsHex(await hmac(k, zuSignieren));

  return {
    ...(e.kopfzeilen ?? {}),
    'x-amz-date': lang,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${e.schluessel}/${geltungsbereich}, ` +
      `SignedHeaders=${unterschrieben}, Signature=${signatur}`,
  };
}
