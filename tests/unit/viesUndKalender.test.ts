import { describe, it, expect } from 'vitest';
import {
  beiViesPruefbar, viesAnfrage, viesAntwortLesen, viesFehlerText, viesPruefen,
} from '@shared/vies';
import { icsFalten, icsText, kalenderDatei } from '@shared/kalenderIcs';
import { UID_FORMEN } from '@/lib/uid';
import { kalenderAdresse, webcalAdresse } from '@/features/assignments/kalenderAbo';

/**
 * UID bei VIES prüfen und das Kalender-Abo (Entscheidung vom 02.10.2026).
 * Die Antworten unten sind die Formen, die VIES am 02.10.2026 tatsächlich
 * geliefert hat — gekürzt um die Felder, die hier nicht gelesen werden.
 */

const GUELTIG = {
  countryCode: 'AT', vatNumber: 'U33864707', requestDate: '2026-10-02T22:22:57.134Z', valid: true,
  requestIdentifier: 'WAPIAAAAZ8Cq1x2b', name: 'Red Bull GmbH', address: 'Am Brunnen 1\nAT-5330 Fuschl/See',
  traderName: '---', traderNameMatch: 'NOT_PROCESSED',
};
const UNGUELTIG = {
  countryCode: 'AT', vatNumber: 'U12345678', requestDate: '2026-10-02T22:22:57.535Z', valid: false,
  requestIdentifier: '', name: '---', address: '---',
};
const FALSCHER_FRAGER = { actionSucceed: false, errorWrappers: [{ error: 'INVALID_REQUESTER_INFO' }] };
const LAND_WEG = { actionSucceed: false, errorWrappers: [{ error: 'MS_UNAVAILABLE' }] };

describe('Welche UID sich bei VIES prüfen lässt', () => {
  it('jede EU-Form aus der Formprüfung, auch Griechenland als „EL“ und Nordirland', () => {
    for (const kennung of Object.keys(UID_FORMEN)) {
      expect({ kennung, pruefbar: beiViesPruefbar(UID_FORMEN[kennung].beispiel) }).toEqual({ kennung, pruefbar: true });
    }
  });

  it('Gegenprobe: Schweiz, Vereinigtes Königreich, Norwegen und leer nicht', () => {
    expect(beiViesPruefbar('CHE123456789')).toBe(false);
    expect(beiViesPruefbar('GB123456789')).toBe(false);
    expect(beiViesPruefbar('NO123456789')).toBe(false);
    expect(beiViesPruefbar('')).toBe(false);
    expect(beiViesPruefbar(null)).toBe(false);
  });

  it('fragt mit der eigenen UID, wenn es eine prüfbare gibt — sonst ohne', () => {
    expect(viesAnfrage('ATU 3386 4707', 'atu12345678')).toEqual({
      countryCode: 'AT', vatNumber: 'U33864707', requesterMemberStateCode: 'AT', requesterNumber: 'U12345678',
    });
    expect(viesAnfrage('DE123456789', null)).toEqual({ countryCode: 'DE', vatNumber: '123456789' });
    expect(viesAnfrage('DE123456789', 'CHE123456789')).toEqual({ countryCode: 'DE', vatNumber: '123456789' });
  });
});

describe('Die Antwort von VIES', () => {
  it('gültig: Name, Anschrift, Abfrage-ID und der Zeitpunkt laut VIES', () => {
    expect(viesAntwortLesen(GUELTIG)).toEqual({
      art: 'ergebnis', gueltig: true, name: 'Red Bull GmbH', adresse: 'Am Brunnen 1\nAT-5330 Fuschl/See',
      abfrageId: 'WAPIAAAAZ8Cq1x2b', zeitpunkt: '2026-10-02T22:22:57.134Z',
    });
  });

  it('nicht gültig ist ein Ergebnis, kein Fehler — „---“ heißt keine Angabe', () => {
    expect(viesAntwortLesen(UNGUELTIG)).toEqual({
      art: 'ergebnis', gueltig: false, name: null, adresse: null, abfrageId: null, zeitpunkt: '2026-10-02T22:22:57.535Z',
    });
  });

  it('ein nicht erreichbarer Landesdienst ist ein Fehler mit verständlichem Text', () => {
    expect(viesAntwortLesen(LAND_WEG)).toEqual({ art: 'fehler', code: 'MS_UNAVAILABLE', text: viesFehlerText('MS_UNAVAILABLE') });
    expect(viesFehlerText('MS_UNAVAILABLE')).toMatch(/später noch einmal/);
    expect(viesFehlerText('NEU_UNBEKANNT')).toMatch(/NEU_UNBEKANNT/);
  });

  it('ohne Ergebnis oder ohne Zeitpunkt kein Nachweis', () => {
    expect(viesAntwortLesen({ ...GUELTIG, valid: undefined }).art).toBe('fehler');
    expect(viesAntwortLesen({ ...GUELTIG, requestDate: undefined }).art).toBe('fehler');
    expect(viesAntwortLesen(null).art).toBe('fehler');
  });
});

describe('Der Ablauf einer Prüfung', () => {
  it('mit anerkannter eigener UID: eine Frage, mit Abfrage-ID', async () => {
    const gefragt: unknown[] = [];
    const r = await viesPruefen('ATU33864707', 'ATU12345678', async (rumpf) => { gefragt.push(rumpf); return GUELTIG; });
    expect(gefragt).toHaveLength(1);
    expect(r.eigeneGeschickt).toBe('ATU12345678');
    expect(r.ohneIdGrund).toBeNull();
    expect(r.ergebnis).toMatchObject({ art: 'ergebnis', abfrageId: 'WAPIAAAAZ8Cq1x2b' });
  });

  it('erkennt VIES die eigene UID nicht an: noch einmal ohne, und der Grund steht dabei', async () => {
    const gefragt: Record<string, unknown>[] = [];
    const r = await viesPruefen('ATU33864707', 'ATU12345678', async (rumpf) => {
      gefragt.push(rumpf);
      return gefragt.length === 1 ? FALSCHER_FRAGER : { ...GUELTIG, requestIdentifier: '' };
    });
    expect(gefragt).toHaveLength(2);
    expect(gefragt[1].requesterNumber).toBeUndefined();
    expect(r.eigeneGeschickt).toBeNull();
    expect(r.ohneIdGrund).toMatch(/eigene UID-Nummer aus den Firmendaten/);
    expect(r.ergebnis).toMatchObject({ art: 'ergebnis', gueltig: true, abfrageId: null });
  });

  it('ohne eigene UID in den Firmendaten: eine Frage, und der Grund für die fehlende ID', async () => {
    let n = 0;
    const r = await viesPruefen('ATU33864707', null, async () => { n += 1; return { ...GUELTIG, requestIdentifier: '' }; });
    expect(n).toBe(1);
    expect(r.ohneIdGrund).toMatch(/Ohne eigene UID-Nummer/);
  });

  it('Gegenprobe: ein anderer Fehler wird nicht wiederholt', async () => {
    let n = 0;
    const r = await viesPruefen('DE123456789', 'ATU12345678', async () => { n += 1; return LAND_WEG; });
    expect(n).toBe(1);
    expect(r.ergebnis.art).toBe('fehler');
  });

  it('ist VIES gar nicht erreichbar, kommt der Fehler beim Aufrufer an', async () => {
    await expect(viesPruefen('DE123456789', null, async () => { throw new Error('Netz weg'); })).rejects.toThrow('Netz weg');
  });
});

describe('Die Kalenderdatei', () => {
  const datei = kalenderDatei({
    person: '1969a076-e7a4',
    betrieb: 'Perl Installationen',
    jetzt: new Date('2026-10-02T22:15:00Z'),
    einsaetze: [
      { datum: '2026-10-05', baustelle: 'B-2026-012', von: '07:30', bis: '12:00', kunde: 'Familie Huber',
        adresse: 'Hauptstraße 1, 1010 Wien', ansprechpartner: 'Frau Huber', telefon: '+43 1 234', kommentar: 'Schlüssel; beim Hausmeister' },
      { datum: '2026-10-06', baustelle: 'B-2026-012', helfer: true },
      { datum: '2026-10-31', baustelle: 'B-2026-013', bis: '12:00', kunde: 'Müller' },
      { datum: '2026-10-07', baustelle: 'B-2026-014', von: '13:00' },
    ],
  });
  const zeilen = datei.replace(/\r\n /g, '').split('\r\n');

  it('jede Zeile endet mit CRLF, die Zeitzone steht dabei', () => {
    expect(datei.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(datei.replace(/\r\n/g, '')).not.toMatch(/\n/);
    expect(zeilen).toContain('TZID:Europe/Vienna');
    expect(zeilen).toContain('X-WR-CALNAME:Einsätze – Perl Installationen');
  });

  it('mit Uhrzeit ein Termin in Wiener Zeit, Ort und Notiz', () => {
    expect(zeilen).toContain('DTSTART;TZID=Europe/Vienna:20261005T073000');
    expect(zeilen).toContain('DTEND;TZID=Europe/Vienna:20261005T120000');
    expect(zeilen).toContain('SUMMARY:Familie Huber · B-2026-012');
    expect(zeilen).toContain('LOCATION:Hauptstraße 1\\, 1010 Wien');
    expect(zeilen).toContain('DESCRIPTION:Baustelle B-2026-012\\nAnsprechpartner: Frau Huber\\, +43 1 234\\nSchlüssel\\; beim Hausmeister');
  });

  it('ohne Uhrzeit ganztägig bis zum Folgetag — auch am Monatsende', () => {
    expect(zeilen).toContain('DTSTART;VALUE=DATE:20261006');
    expect(zeilen).toContain('DTEND;VALUE=DATE:20261007');
    expect(zeilen).toContain('SUMMARY:B-2026-012 · Helfer');
    expect(zeilen).toContain('DTEND;VALUE=DATE:20261101');
  });

  it('nur „bis“: ganztägig, die Uhrzeit im Titel; nur „von“: ein Termin ohne Ende', () => {
    expect(zeilen).toContain('SUMMARY:Müller · B-2026-013 (bis 12:00)');
    expect(zeilen).toContain('DTSTART;TZID=Europe/Vienna:20261007T130000');
    const i = zeilen.indexOf('DTSTART;TZID=Europe/Vienna:20261007T130000');
    expect(zeilen[i + 1].startsWith('DTEND')).toBe(false);
  });

  it('gleiche Einsätze behalten ihre Kennung, verschiedene nicht', () => {
    const uids = zeilen.filter((z) => z.startsWith('UID:'));
    expect(uids).toHaveLength(4);
    expect(new Set(uids).size).toBe(4);
    expect(uids[0]).toBe('UID:20261005-B-2026-012-1969a076-e7a4@einsatz.senklot');
  });

  it('Gegenprobe: ohne Einsätze ein leerer, gültiger Kalender', () => {
    const leer = kalenderDatei({ person: 'p', betrieb: 'B', einsaetze: [], jetzt: new Date() });
    expect(leer).toContain('BEGIN:VCALENDAR');
    expect(leer).not.toContain('BEGIN:VEVENT');
  });
});

describe('Text und Zeilen nach RFC 5545', () => {
  it('maskiert Backslash, Strichpunkt, Beistrich und Zeilenumbruch', () => {
    expect(icsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('bricht nach 75 Byte um, nie mitten in einem Umlaut', () => {
    const lang = `SUMMARY:${'ä'.repeat(60)}`;
    const gefaltet = icsFalten(lang);
    const teile = gefaltet.split('\r\n');
    expect(teile.length).toBeGreaterThan(1);
    for (const t of teile) expect(new TextEncoder().encode(t).length).toBeLessThanOrEqual(75);
    expect(gefaltet.replace(/\r\n /g, '')).toBe(lang);
  });

  it('Gegenprobe: eine kurze Zeile bleibt, wie sie ist', () => {
    expect(icsFalten('VERSION:2.0')).toBe('VERSION:2.0');
  });
});

describe('Die Adresse des Abos', () => {
  it('beim Datenbankprojekt, mit dem Schlüssel; webcal zum Antippen', () => {
    const a = kalenderAdresse('https://abc.supabase.co/', 'Xy_-9');
    expect(a).toBe('https://abc.supabase.co/functions/v1/kalender?t=Xy_-9');
    expect(webcalAdresse(a!)).toBe('webcal://abc.supabase.co/functions/v1/kalender?t=Xy_-9');
  });

  it('Gegenprobe: ohne Projektadresse oder Schlüssel keine Adresse', () => {
    expect(kalenderAdresse(undefined, 'x')).toBeNull();
    expect(kalenderAdresse('https://abc.supabase.co', '')).toBeNull();
  });
});
