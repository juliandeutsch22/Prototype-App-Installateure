import { describe, it, expect } from 'vitest';
import { crc32, zipErstellen, ZipSchreiber } from '@/lib/zip';

/**
 * Das ZIP des Belegarchivs (Stand-Datei 11.1, Punkt 6). Gelesen wird es hier
 * so, wie jedes Entpackprogramm es liest: vom Ende her über das Verzeichnis.
 */

interface Eintrag { name: string; flags: number; crc: number; inhalt: Uint8Array }

function lies(puffer: ArrayBuffer): Eintrag[] {
  const v = new DataView(puffer);
  const ende = puffer.byteLength - 22;
  expect(v.getUint32(ende, true)).toBe(0x06054b50);
  const anzahl = v.getUint16(ende + 10, true);
  let p = v.getUint32(ende + 16, true);
  const dekodierer = new TextDecoder();
  const liste: Eintrag[] = [];
  for (let i = 0; i < anzahl; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const flags = v.getUint16(p + 8, true);
    const crc = v.getUint32(p + 16, true);
    const groesse = v.getUint32(p + 24, true);
    const nameLaenge = v.getUint16(p + 28, true);
    const versatz = v.getUint32(p + 42, true);
    const name = dekodierer.decode(new Uint8Array(puffer, p + 46, nameLaenge));
    // Der lokale Kopf muss zum Verzeichnis passen.
    expect(v.getUint32(versatz, true)).toBe(0x04034b50);
    expect(v.getUint32(versatz + 14, true)).toBe(crc);
    const lokalName = v.getUint16(versatz + 26, true);
    const start = versatz + 30 + lokalName + v.getUint16(versatz + 28, true);
    liste.push({ name, flags, crc, inhalt: new Uint8Array(puffer.slice(start, start + groesse)) });
    p += 46 + nameLaenge;
  }
  return liste;
}

describe('ZIP', () => {
  it('CRC-32 wie im Standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('enthält jede Datei unverändert, mit Prüfsumme und Umlauten im Namen', async () => {
    const a = new TextEncoder().encode('%PDF-1.3 Rechnung');
    const b = new Uint8Array([0, 1, 2, 255]);
    const blob = zipErstellen([
      { name: 'Rechnungen/RE-2026-0001.pdf', inhalt: a },
      { name: 'Mühlbauer/Größe.bin', inhalt: b },
      { name: 'leer.txt', inhalt: new Uint8Array() },
    ]);
    const liste = lies(await blob.arrayBuffer());
    expect(liste.map((e) => e.name)).toEqual(['Rechnungen/RE-2026-0001.pdf', 'Mühlbauer/Größe.bin', 'leer.txt']);
    expect(liste[0].inhalt).toEqual(a);
    expect(liste[1].inhalt).toEqual(b);
    expect(liste[1].crc).toBe(crc32(b));
    // UTF-8-Kennzeichen — sonst liest Windows „MÃ¼hlbauer“.
    expect(liste.every((e) => (e.flags & 0x0800) !== 0)).toBe(true);
  });

  it('ein leeres Archiv ist ein gültiges Archiv', async () => {
    expect(lies(await zipErstellen([]).arrayBuffer())).toEqual([]);
  });

  it('bleibt gleich: bis 65.535 Dateien ohne ZIP64 — das Ende steht direkt hinter dem Verzeichnis', async () => {
    const viele = Array.from({ length: 65_535 }, (_, i) => ({ name: `${i}`, inhalt: new Uint8Array() }));
    const puffer = await zipErstellen(viele).arrayBuffer();
    const v = new DataView(puffer);
    const ende = puffer.byteLength - 22;
    expect(v.getUint32(ende, true)).toBe(0x06054b50);
    expect(v.getUint16(ende + 10, true)).toBe(65_535);
    expect(v.getUint32(ende - 20, true)).not.toBe(0x07064b50);
  });
});

/*
  ZIP64 (A13, 24.10.2026): über 65.535 Dateien oder 4 GB statt einer
  Absage. Gelesen wird wie ein Entpackprogramm: vom Zeiger vor dem Ende zum
  ZIP64-Ende, von dort zum Verzeichnis.
*/
describe('ZIP64', () => {
  it('über 65.535 Dateien: ZIP64-Ende samt Zeiger, jede Datei auffindbar', async () => {
    const viele = Array.from({ length: 65_537 }, (_, i) => ({ name: `d${i}`, inhalt: new Uint8Array([i % 256]) }));
    const puffer = await zipErstellen(viele).arrayBuffer();
    const v = new DataView(puffer);
    const ende = puffer.byteLength - 22;
    expect(v.getUint32(ende, true)).toBe(0x06054b50);
    expect(v.getUint16(ende + 10, true)).toBe(0xffff);
    expect(v.getUint32(ende - 20, true)).toBe(0x07064b50);
    const ende64 = v.getUint32(ende - 20 + 8, true);
    expect(v.getUint32(ende64, true)).toBe(0x06064b50);
    expect(v.getUint32(ende64 + 32, true)).toBe(65_537);
    // Die letzte Datei: über das Verzeichnis zu ihrem Inhalt.
    let p = v.getUint32(ende64 + 48, true);
    for (let i = 0; i < 65_536; i++) p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true);
    const versatz = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(puffer, versatz + 30, v.getUint16(versatz + 26, true)));
    expect(name).toBe('d65536');
    expect(new Uint8Array(puffer)[versatz + 30 + name.length]).toBe(65_536 % 256);
  });

  it('ein Versatz über 4 GB steht im Zusatzfeld des Verzeichnisses', async () => {
    const s = new ZipSchreiber();
    // Wie nach 4 GB Belegen — ohne 4 GB in den Speicher zu legen.
    (s as unknown as { versatz: number }).versatz = 0x1_0000_0005;
    s.hinzufuegen('spaet.pdf', new Uint8Array([1, 2, 3]));
    const puffer = await s.fertig().arrayBuffer();
    const v = new DataView(puffer);
    const ende = puffer.byteLength - 22;
    expect(v.getUint32(ende - 20, true)).toBe(0x07064b50);
    // Das Verzeichnis beginnt hinter dem einen lokalen Eintrag (30 + 9 + 3 Bytes im Blob).
    const p = 30 + 9 + 3;
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    expect(v.getUint16(p + 6, true)).toBe(45);
    expect(v.getUint32(p + 42, true)).toBe(0xffffffff);
    expect(v.getUint16(p + 30, true)).toBe(12);
    expect(v.getUint16(p + 46 + 9, true)).toBe(0x0001);
    expect(v.getUint32(p + 46 + 9 + 4, true)).toBe(5);
    expect(v.getUint32(p + 46 + 9 + 8, true)).toBe(1);
  });
});
