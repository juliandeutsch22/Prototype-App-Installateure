import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UID_FORMEN, istUnternehmerKunde, uidFehler, uidNormalisieren, uidSperrt,
} from '@/lib/uid';

// Testbericht 30.09.2026, M10 — die Form der UID für Österreich und die EU.
describe('uidFehler', () => {
  it('„ATU123“ aus dem Bericht ist keine UID', () => {
    expect(uidFehler('ATU123')).toMatch(/„ATU“ und acht Ziffern/);
  });

  it('nimmt die österreichische Form an, auch mit Leerzeichen und klein geschrieben', () => {
    expect(uidFehler('ATU12345678')).toBeNull();
    expect(uidFehler(' atu 1234 5678 ')).toBeNull();
  });

  it('fängt das vergessene „U“ und „GR“ statt „EL“', () => {
    expect(uidFehler('AT12345678')).toMatch(/acht Ziffern/);
    expect(uidFehler('GR123456789')).toMatch(/„EL“/);
  });

  it('prüft die EU-Staaten nach ihrer Form und nennt ein Beispiel', () => {
    expect(uidFehler('DE123456789')).toBeNull();
    expect(uidFehler('DE12345678')).toMatch(/Deutschland, z\. B\. DE123456789/);
    expect(uidFehler('NL123456789B01')).toBeNull();
    expect(uidFehler('NL123456789')).toMatch(/Niederlande/);
    expect(uidFehler('IT12345678901')).toBeNull();
    expect(uidFehler('FRXX123456789')).toBeNull();
  });

  it('jedes Beispiel besteht die eigene Prüfung', () => {
    for (const [kennung, form] of Object.entries(UID_FORMEN)) {
      expect(uidFehler(form.beispiel), kennung).toBeNull();
    }
  });

  it('Gegenprobe: ausserhalb der EU gilt nur die grobe Form, leer ist kein Fehler', () => {
    expect(uidFehler('CHE-123.456.789')).toBeNull();
    expect(uidFehler('NO123456789MVA')).toBeNull();
    expect(uidFehler('')).toBeNull();
    expect(uidFehler(null)).toBeNull();
    expect(uidFehler('12345678')).toMatch(/zwei Buchstaben/);
  });
});

describe('uidNormalisieren', () => {
  it('Grossbuchstaben ohne Leerzeichen, Punkte und Bindestriche', () => {
    expect(uidNormalisieren(' atu 1234.5678 ')).toBe('ATU12345678');
    expect(uidNormalisieren('CHE-123.456.789')).toBe('CHE123456789');
  });
});

describe('uidSperrt — nur eine GEÄNDERTE UID hält auf', () => {
  it('eine neu falsche hält auf', () => {
    expect(uidSperrt('ATU123', '')).toMatch(/acht Ziffern/);
    expect(uidSperrt('ATU123', 'ATU12345678')).toMatch(/acht Ziffern/);
  });

  it('Gegenprobe: eine alte, unverändert falsche hält nicht auf', () => {
    expect(uidSperrt('ATU123', 'ATU123')).toBeNull();
    expect(uidSperrt('atu 123', 'ATU123')).toBeNull();
  });
});

describe('istUnternehmerKunde', () => {
  it('die Kundenart entscheidet — auch ohne UID', () => {
    expect(istUnternehmerKunde({ kundenart: 'unternehmen', vatId: '' })).toBe(true);
    expect(istUnternehmerKunde({ kundenart: 'privat', vatId: '' })).toBe(false);
  });

  it('ohne Angabe gilt wie bisher: wer eine UID hat', () => {
    expect(istUnternehmerKunde({ kundenart: null, vatId: 'ATU12345678' })).toBe(true);
    expect(istUnternehmerKunde({ kundenart: null, vatId: '' })).toBe(false);
    expect(istUnternehmerKunde(undefined)).toBe(false);
  });

  it('eine UID auf der Rechnung macht den Empfänger zum Unternehmer', () => {
    expect(istUnternehmerKunde(undefined, 'ATU12345678')).toBe(true);
    expect(istUnternehmerKunde({ kundenart: 'privat' }, 'ATU12345678')).toBe(true);
  });
});

describe('dieselben Muster in der Datenbank', () => {
  it('app.uid_form_fehler kennt jedes Land mit derselben Form', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260930330000_uid_und_kundenart.sql'),
      'utf8',
    );
    const inSql = new Map(
      [...sql.matchAll(/when '([A-Z]{2})' then '([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect([...inSql.keys()].sort()).toEqual(Object.keys(UID_FORMEN).sort());
    for (const [kennung, form] of Object.entries(UID_FORMEN)) {
      expect(inSql.get(kennung), kennung).toBe(form.muster.source.replace(/\\d/g, '[0-9]'));
    }
  });
});
