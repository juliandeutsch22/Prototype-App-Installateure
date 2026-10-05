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
 * GRENZEN: höchstens 65.535 Dateien und 4 GB — das ältere ZIP-Format ohne
 * ZIP64. Ein Belegarchiv eines Installationsbetriebs bleibt weit darunter; wer
 * darüber käme, bekommt eine klare Meldung statt eines kaputten Archivs.
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

const MAX_DATEIEN = 0xffff;
const MAX_BYTES = 0xffffffff;

export function zipErstellen(dateien: ZipDatei[], jetzt = new Date()): Blob {
  if (dateien.length > MAX_DATEIEN) {
    throw new Error(`Zu viele Dateien für ein Archiv (${dateien.length}). Bitte einen kürzeren Zeitraum wählen.`);
  }
  const kodierer = new TextEncoder();
  const { zeit, tag } = dosZeit(jetzt);
  const teile: Uint8Array[] = [];
  const verzeichnis: Uint8Array[] = [];
  let versatz = 0;

  for (const d of dateien) {
    const name = kodierer.encode(d.name);
    const crc = crc32(d.inhalt);
    const groesse = d.inhalt.length;

    const kopf = new Uint8Array(30 + name.length);
    const k = new DataView(kopf.buffer);
    k.setUint32(0, 0x04034b50, true);
    k.setUint16(4, 20, true);
    k.setUint16(6, 0x0800, true);
    k.setUint16(8, 0, true);
    k.setUint16(10, zeit, true);
    k.setUint16(12, tag, true);
    k.setUint32(14, crc, true);
    k.setUint32(18, groesse, true);
    k.setUint32(22, groesse, true);
    k.setUint16(26, name.length, true);
    k.setUint16(28, 0, true);
    kopf.set(name, 30);

    const eintrag = new Uint8Array(46 + name.length);
    const e = new DataView(eintrag.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x0800, true);
    e.setUint16(10, 0, true);
    e.setUint16(12, zeit, true);
    e.setUint16(14, tag, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, groesse, true);
    e.setUint32(24, groesse, true);
    e.setUint16(28, name.length, true);
    // Zusatzfeld, Kommentar, Datenträger, Attribute: alles leer.
    e.setUint32(42, versatz, true);
    eintrag.set(name, 46);

    teile.push(kopf, d.inhalt);
    verzeichnis.push(eintrag);
    versatz += kopf.length + groesse;
    if (versatz > MAX_BYTES) {
      throw new Error('Das Archiv würde größer als 4 GB. Bitte einen kürzeren Zeitraum wählen.');
    }
  }

  const verzeichnisGroesse = verzeichnis.reduce((s, v) => s + v.length, 0);
  const ende = new Uint8Array(22);
  const z = new DataView(ende.buffer);
  z.setUint32(0, 0x06054b50, true);
  z.setUint16(8, dateien.length, true);
  z.setUint16(10, dateien.length, true);
  z.setUint32(12, verzeichnisGroesse, true);
  z.setUint32(16, versatz, true);

  return new Blob([...teile, ...verzeichnis, ende] as BlobPart[], { type: 'application/zip' });
}
