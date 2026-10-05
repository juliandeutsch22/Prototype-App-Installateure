import { describe, it, expect } from 'vitest';
import { crc32, zipErstellen } from '@/lib/zip';

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

  it('zu viele Dateien: eine klare Meldung statt eines kaputten Archivs', () => {
    const viele = Array.from({ length: 65_536 }, (_, i) => ({ name: `${i}`, inhalt: new Uint8Array() }));
    expect(() => zipErstellen(viele)).toThrow(/Zu viele Dateien/);
    // Gegenprobe: an der Grenze geht es noch.
    expect(() => zipErstellen(viele.slice(1))).not.toThrow();
  });
});
