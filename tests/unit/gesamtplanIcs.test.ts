/**
 * Der ganze Einsatzplan als Kalenderdatei und die Termine im Abo
 * (Plan 10.4, PR B) — ohne Server geprüft.
 */
import { describe, it, expect } from 'vitest';
import { gesamtplanDatei, kalenderDatei, terminArtName, type KalenderTermin } from '@shared/kalenderIcs';

const jetzt = new Date('2026-10-04T10:00:00Z');
/** Gefaltete Zeilen wieder zusammen — geprüft wird der Inhalt, nicht der Umbruch. */
const flach = (ics: string) => ics.replace(/\r\n /g, '');
const eintraege = (ics: string) => ics.match(/BEGIN:VEVENT/g)?.length ?? 0;

const LIEFERUNG: KalenderTermin = {
  id: 't1', art: 'Lieferung', datum: '2026-10-06', von: '08:00', bis: '10:00', baustelle: 'B-1',
  ort: 'Familie Huber', adresse: 'Hauptstraße 1, 1010 Wien', notiz: 'Wannen', teilnehmer: [],
};
const BESICHTIGUNG: KalenderTermin = {
  id: 't2', art: 'Besichtigung', datum: '2026-10-07', baustelle: null,
  ort: 'Hausverwaltung Nord', adresse: 'Ringstraße 3', teilnehmer: ['Anna', 'Bert'],
};

describe('Der Gesamtplan — je Baustelle und Tag ein Eintrag', () => {
  const datei = flach(gesamtplanDatei({
    person: 'chef', betrieb: 'Perl', jetzt, termine: [],
    baustellen: [
      {
        datum: '2026-10-06', baustelle: 'B-1', kunde: 'Familie Huber', adresse: 'Hauptstraße 1, 1010 Wien',
        leute: [
          { name: 'Anna', helfer: false, einstufung: 'obermonteur', von: '07:00', bis: '12:00' },
          { name: 'Bert', helfer: true, einstufung: 'facharbeiter', von: '08:00', bis: '16:00' },
          { name: 'Carl', helfer: false, einstufung: 'lehrling', von: '07:30', bis: '15:00' },
        ],
      },
      { datum: '2026-10-07', baustelle: 'B-2', kunde: 'Gemeinde', adresse: null, leute: [{ name: 'Anna', von: '07:00' }, { name: 'Bert' }] },
    ],
  }));

  it('ein Eintrag je Baustelle und Tag, nicht je Person', () => {
    expect(eintraege(datei)).toBe(2);
    expect(datei).toContain('SUMMARY:Familie Huber · B-1 · 3 Personen');
    expect(datei).toContain('X-WR-CALNAME:Einsatzplan – Perl');
  });

  it('in der Notiz jede Person mit Stufe im Einsatz und Uhrzeit — dieselbe Regel wie in der App', () => {
    expect(datei).toContain('Anna · Obermonteur · 07:00–12:00');
    expect(datei).toContain('Bert · Helfer · 08:00–16:00');
    expect(datei).toContain('Carl · Lehrling · 07:30–15:00');
  });

  it('mit Uhrzeit bei allen: von der frühesten bis zur spätesten', () => {
    expect(datei).toContain('DTSTART;TZID=Europe/Vienna:20261006T070000');
    expect(datei).toContain('DTEND;TZID=Europe/Vienna:20261006T160000');
  });

  it('fehlt sie bei einem, ganztägig — sonst stünde er kürzer da, als gearbeitet wird', () => {
    expect(datei).toContain('DTSTART;VALUE=DATE:20261007');
    expect(datei).toContain('DTEND;VALUE=DATE:20261008');
  });

  it('dieselbe Baustelle am selben Tag behält ihre Kennung — der Kalender ersetzt statt zu verdoppeln', () => {
    const nochmal = flach(gesamtplanDatei({
      person: 'chef', betrieb: 'Perl', jetzt: new Date('2026-10-05T10:00:00Z'), termine: [],
      baustellen: [{ datum: '2026-10-06', baustelle: 'B-1', leute: [] }],
    }));
    const uid = (t: string) => t.match(/UID:(.*20261006-B-1.*)/)?.[1];
    expect(uid(nochmal)).toBe(uid(datei));
  });
});

describe('Termine im Abo', () => {
  it('im Gesamtplan: Art und Ort im Titel, Adresse als Ort, Teilnehmer und Notiz in der Notiz', () => {
    const datei = flach(gesamtplanDatei({ person: 'chef', betrieb: 'Perl', jetzt, baustellen: [], termine: [LIEFERUNG, BESICHTIGUNG] }));
    expect(eintraege(datei)).toBe(2);
    expect(datei).toContain('SUMMARY:Lieferung (Aviso) · Familie Huber · B-1');
    expect(datei).toContain('Zeitfenster 08:00–10:00');
    expect(datei).toContain('LOCATION:Hauptstraße 1\\, 1010 Wien');
    expect(datei).toContain('SUMMARY:Besichtigung · Hausverwaltung Nord');
    expect(datei).toContain('Beim Kunden\\, ohne Baustelle');
    expect(datei).toContain('Teilnehmer: Anna\\, Bert');
    expect(datei).toContain('DTSTART;VALUE=DATE:20261007');
  });

  it('im eigenen Abo neben den Einsätzen — und ohne Termine wie bisher', () => {
    const einsatz = { datum: '2026-10-06', baustelle: 'B-1', kunde: 'Familie Huber' };
    const mit = flach(kalenderDatei({ person: 'anna', betrieb: 'Perl', jetzt, einsaetze: [einsatz], termine: [LIEFERUNG] }));
    expect(eintraege(mit)).toBe(2);
    expect(mit).toContain('SUMMARY:Lieferung (Aviso) · Familie Huber · B-1');
    const ohne = flach(kalenderDatei({ person: 'anna', betrieb: 'Perl', jetzt, einsaetze: [einsatz] }));
    expect(eintraege(ohne)).toBe(1);
    expect(ohne).toContain('X-WR-CALNAME:Einsätze – Perl');
  });

  it('die Kennung hängt am Termin: geänderte Uhrzeit ersetzt den Eintrag', () => {
    const a = flach(kalenderDatei({ person: 'anna', betrieb: 'Perl', jetzt, einsaetze: [], termine: [LIEFERUNG] }));
    const b = flach(kalenderDatei({ person: 'anna', betrieb: 'Perl', jetzt, einsaetze: [], termine: [{ ...LIEFERUNG, von: '09:00' }] }));
    expect(a.match(/UID:.*/)?.[0]).toBe(b.match(/UID:.*/)?.[0]);
  });

  it('nur die Lieferung heißt zusätzlich „Aviso"', () => {
    expect(terminArtName('Lieferung')).toBe('Lieferung (Aviso)');
    expect(terminArtName('Abnahme')).toBe('Abnahme');
  });
});
