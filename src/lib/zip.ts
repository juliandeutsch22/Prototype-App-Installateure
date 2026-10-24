/**
 * Ein ZIP-Archiv aus fertigen Dateien — ohne Kompression („stored“).
 *
 * WARUM SELBST GESCHRIEBEN. Das Belegarchiv braucht nur das Einpacken; eine
 * Bibliothek dafür brächte Dekompression, Streams und Verschlüsselung mit, die
 * niemand aufruft. PDFs sind schon komprimiert — Deflate gewönne kaum etwas.
 *
 * WARUM UTF-8 MARKIERT. Ohne das Kennzeichen (Bit 11) lesen Windows und
 * macOS die Namen als Codepage 437, und aus „Mühlbauer“ wird Zeichensalat.
 *
 * DATEI FÜR DATEI (A13, 24.10.2026). Bis hierher sammelte das Belegarchiv
 * jedes PDF im Speicher der Seite und packte am Ende alles auf einmal — über
 * viele Jahre zu viel für ein Telefon, „dann ein einzelnes Jahr wählen“. Der
 * `ZipSchreiber` legt jede Datei sofort als eigenen Blob-Teil ab; die Bytes
 * verlassen damit den Speicher der Seite und liegen beim Browser, der große
 * Blobs selbst auf die Platte auslagert. Im Speicher bleibt je Datei nur ihr
 * Eintrag im Verzeichnis.
 *
 * ZIP64 (A13). Über 65.535 Dateien oder 4 GB schreibt der Schreiber die
 * Erweiterung ZIP64, die jedes heutige Entpackprogramm liest (Windows-Explorer
 * seit Windows 7, macOS, 7-Zip). Darunter bleibt das Archiv Byte für Byte, wie
 * es war.
 */

export interface ZipDatei {
  name: string;
  inhalt: Uint8Array;
}

const TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(daten: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = TABELLE[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zeit und Tag im MS-DOS-Format, wie sie im Kopf jeder Datei stehen. */
function dosZeit(d: Date): { zeit: number; tag: number } {
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    tag: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;

/** Eine 64-Bit-Zahl in zwei Hälften — `setBigUint64` fehlt älteren Safari. */
function setU64(v: DataView, an: number, wert: number): void {
  v.setUint32(an, wert % 0x1_0000_0000, true);
  v.setUint32(an + 4, Math.floor(wert / 0x1_0000_0000), true);
}

interface Verzeichniseintrag {
  name: Uint8Array;
  crc: number;
  groesse: number;
  versatz: number;
}

export class ZipSchreiber {
  private readonly kodierer = new TextEncoder();
  private readonly zeit: number;
  private readonly tag: number;
  private readonly teile: Blob[] = [];
  private readonly eintraege: Verzeichniseintrag[] = [];
  private versatz = 0;

  constructor(jetzt = new Date()) {
    ({ zeit: this.zeit, tag: this.tag } = dosZeit(jetzt));
  }

  /** Wie viele Dateien schon im Archiv sind. */
  get anzahl(): number {
    return this.eintraege.length;
  }

  hinzufuegen(name: string, inhalt: Uint8Array): void {
    const n = this.kodierer.encode(name);
    const crc = crc32(inhalt);
    const groesse = inhalt.length;
    // Eine einzelne Datei über 4 GB gibt es im Belegarchiv nicht; ZIP64 brauchte sie auch im lokalen Kopf.
    if (groesse >= MAX_32) throw new Error(`Die Datei ${name} ist größer als 4 GB.`);

    const kopf = new Uint8Array(30 + n.length);
    const k = new DataView(kopf.buffer);
    k.setUint32(0, 0x04034b50, true);
    k.setUint16(4, 20, true);
    k.setUint16(6, 0x0800, true);
    k.setUint16(8, 0, true);
    k.setUint16(10, this.zeit, true);
    k.setUint16(12, this.tag, true);
    k.setUint32(14, crc, true);
    k.setUint32(18, groesse, true);
    k.setUint32(22, groesse, true);
    k.setUint16(26, n.length, true);
    k.setUint16(28, 0, true);
    kopf.set(n, 30);

    this.teile.push(new Blob([kopf, inhalt] as BlobPart[]));
    this.eintraege.push({ name: n, crc, groesse, versatz: this.versatz });
    this.versatz += kopf.length + groesse;
  }

  fertig(): Blob {
    const verzeichnis: Uint8Array[] = [];
    for (const d of this.eintraege) {
      // Nur der Versatz kann über 4 GB kommen; dann steht er im Zusatzfeld (ZIP64).
      const gross = d.versatz >= MAX_32;
      const zusatz = gross ? 12 : 0;
      const eintrag = new Uint8Array(46 + d.name.length + zusatz);
      const e = new DataView(eintrag.buffer);
      e.setUint32(0, 0x02014b50, true);
      e.setUint16(4, gross ? 45 : 20, true);
      e.setUint16(6, gross ? 45 : 20, true);
      e.setUint16(8, 0x0800, true);
      e.setUint16(10, 0, true);
      e.setUint16(12, this.zeit, true);
      e.setUint16(14, this.tag, true);
      e.setUint32(16, d.crc, true);
      e.setUint32(20, d.groesse, true);
      e.setUint32(24, d.groesse, true);
      e.setUint16(28, d.name.length, true);
      e.setUint16(30, zusatz, true);
      // Kommentar, Datenträger, Attribute: alles leer.
      e.setUint32(42, gross ? MAX_32 : d.versatz, true);
      eintrag.set(d.name, 46);
      if (gross) {
        const z = 46 + d.name.length;
        e.setUint16(z, 0x0001, true);
        e.setUint16(z + 2, 8, true);
        setU64(e, z + 4, d.versatz);
      }
      verzeichnis.push(eintrag);
    }

    const verzeichnisGroesse = verzeichnis.reduce((s, v) => s + v.length, 0);
    const anzahl = this.eintraege.length;
    const zip64 = anzahl > MAX_16 || this.versatz >= MAX_32 || verzeichnisGroesse >= MAX_32;

    const schluss: Uint8Array[] = [];
    if (zip64) {
      const ende64 = new Uint8Array(56);
      const z = new DataView(ende64.buffer);
      z.setUint32(0, 0x06064b50, true);
      setU64(z, 4, 44);
      z.setUint16(12, 45, true);
      z.setUint16(14, 45, true);
      setU64(z, 24, anzahl);
      setU64(z, 32, anzahl);
      setU64(z, 40, verzeichnisGroesse);
      setU64(z, 48, this.versatz);
      const zeiger = new Uint8Array(20);
      const p = new DataView(zeiger.buffer);
      p.setUint32(0, 0x07064b50, true);
      setU64(p, 8, this.versatz + verzeichnisGroesse);
      p.setUint32(16, 1, true);
      schluss.push(ende64, zeiger);
    }
    const ende = new Uint8Array(22);
    const z = new DataView(ende.buffer);
    z.setUint32(0, 0x06054b50, true);
    z.setUint16(8, zip64 ? MAX_16 : anzahl, true);
    z.setUint16(10, zip64 ? MAX_16 : anzahl, true);
    z.setUint32(12, zip64 ? MAX_32 : verzeichnisGroesse, true);
    z.setUint32(16, zip64 ? MAX_32 : this.versatz, true);
    schluss.push(ende);

    return new Blob([...this.teile, ...verzeichnis, ...schluss] as BlobPart[], { type: 'application/zip' });
  }
}

export function zipErstellen(dateien: ZipDatei[], jetzt = new Date()): Blob {
  const schreiber = new ZipSchreiber(jetzt);
  for (const d of dateien) schreiber.hinzufuegen(d.name, d.inhalt);
  return schreiber.fertig();
}
