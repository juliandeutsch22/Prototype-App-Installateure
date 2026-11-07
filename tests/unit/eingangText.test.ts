/**
 * Der Auftragseingang in Worten (M02b): Pflichtangaben, Zustand in der
 * Liste, die Notiz der Besichtigung und die Zeile der Startseite.
 *
 * Gegenprobe: ohne `eingangText.ts` bzw. die Regel `eingaengeZeile` gibt es
 * nichts zu importieren — rot.
 */
import { describe, it, expect } from 'vitest';
import {
  alsFeldzeit,
  ausFeldzeit,
  besichtigungNotiz,
  eingangFehler,
  kundeText,
  zustandVon,
  type EingangFormularStand,
} from '@/features/auftragseingang/eingangText';
import { eingaengeZeile, offeneEingaenge } from '@/features/dashboard/start/regeln';

const VOLL: EingangFormularStand = {
  quelle: 'telefon', auftraggeberNummer: '', kundeArt: 'vorhanden', customerId: 'k1',
  neukundeName: '', neukundeStrasse: '', neukundePlz: '', neukundeOrt: '', neukundeTelefon: '', neukundeEmail: '',
  ort: '', ansprechpartnerName: '', ansprechpartnerTelefon: '', anliegen: 'Heizung kalt', dringlichkeit: 'normal',
  wunschtermin: '', eingegangenAm: '2026-11-07T09:14',
};

describe('Pflichtangaben', () => {
  it('vollständig: woher, für wen, worum', () => {
    expect(eingangFehler(VOLL)).toBeNull();
    expect(eingangFehler({ ...VOLL, kundeArt: 'neu', customerId: '', neukundeName: 'Familie Neu' })).toBeNull();
  });

  it('ohne Quelle, ohne Kunden, ohne Namen des neuen Kunden, ohne Anliegen — je mit Satz', () => {
    expect(eingangFehler({ ...VOLL, quelle: '' })).toMatch(/woher/);
    expect(eingangFehler({ ...VOLL, customerId: '' })).toMatch(/Kunden wählen/);
    expect(eingangFehler({ ...VOLL, kundeArt: 'neu', customerId: 'k1', neukundeName: '  ' })).toMatch(/Namen des neuen Kunden/);
    expect(eingangFehler({ ...VOLL, anliegen: '   ' })).toMatch(/Anliegen/);
    expect(eingangFehler({ ...VOLL, anliegen: 'x'.repeat(4001) })).toMatch(/zu lang/);
    expect(eingangFehler({ ...VOLL, kundeArt: 'neu', neukundeName: 'N', neukundeEmail: 'neu@' })).toMatch(/E-Mail/);
    expect(eingangFehler({ ...VOLL, eingegangenAm: '' })).toMatch(/wann/);
  });

  it('die Zeit des Eingangs geht als Ortszeit ins Feld und zurück', () => {
    const ms = new Date(2026, 10, 7, 9, 14).getTime();
    expect(alsFeldzeit(ms)).toBe('2026-11-07T09:14');
    expect(ausFeldzeit('2026-11-07T09:14')).toBe(ms);
  });
});

describe('In der Liste', () => {
  it('Notfall rot, dringend Achtung, offen leer; übernommen erledigt, abgelehnt gilt nicht mehr', () => {
    expect(zustandVon({ stand: 'offen', dringlichkeit: 'notfall' })).toEqual({ stand: 'schlecht', text: 'Notfall' });
    expect(zustandVon({ stand: 'offen', dringlichkeit: 'dringend' })).toEqual({ stand: 'achtung', text: 'Dringend' });
    expect(zustandVon({ stand: 'offen', dringlichkeit: 'normal' })).toEqual({ stand: 'offen', text: 'Offen' });
    // Übernommen zählt die Dringlichkeit nicht mehr.
    expect(zustandVon({ stand: 'uebernommen', dringlichkeit: 'notfall' })).toEqual({ stand: 'erledigt', text: 'Übernommen' });
    expect(zustandVon({ stand: 'abgelehnt', dringlichkeit: 'dringend' })).toEqual({ stand: 'storniert', text: 'Abgelehnt' });
  });

  it('für wen — oder dass noch keiner gewählt ist', () => {
    expect(kundeText({ kundeName: 'Familie Huber', customerId: 'k1' })).toBe('Familie Huber');
    expect(kundeText({ kundeName: null, customerId: null })).toBe('Ohne Kunde');
  });

  it('die Besichtigung bringt Ort, Ansprechpartner, Anliegen und die Nummer mit', () => {
    expect(besichtigungNotiz({
      nummer: 'EG-2026-0003', ort: 'Hauptstraße 1, 1010 Wien', ansprechpartnerName: 'Hr. Hausmeister',
      ansprechpartnerTelefon: '0664 1', anliegen: 'Wasserfleck an der Decke',
    })).toBe('Ort: Hauptstraße 1, 1010 Wien\nVor Ort: Hr. Hausmeister, 0664 1\nWasserfleck an der Decke\nEingang EG-2026-0003');
    expect(besichtigungNotiz({ nummer: 'EG-2026-0004', anliegen: 'Tropft' })).toBe('Tropft\nEingang EG-2026-0004');
  });
});

describe('Startseite: offene Eingänge', () => {
  it('Anzahl und Dringlichkeit — rot bei einem Notfall, Bernstein bei dringend, sonst leise', () => {
    expect(eingaengeZeile({ offen: 3, dringend: 2, notfall: 1 })).toEqual({
      key: 'eingaenge', titel: '3 offene Eingänge', detail: 'davon 1 Notfall, 2 dringend',
      status: { text: 'Notfall', ton: 'fehl' }, to: '/eingaenge',
    });
    expect(eingaengeZeile({ offen: 1, dringend: 1, notfall: 0 })).toMatchObject({
      titel: '1 offener Eingang', detail: 'davon 1 dringend', status: { ton: 'warn' },
    });
    expect(eingaengeZeile({ offen: 2, dringend: 0, notfall: 2 })?.detail).toBe('davon 2 Notfälle');
    expect(eingaengeZeile({ offen: 2, dringend: 0, notfall: 0 })).toMatchObject({ detail: 'keiner dringend', status: { ton: 'leise' } });
  });

  it('ohne offene kein Abschnitt', () => {
    expect(eingaengeZeile({ offen: 0, dringend: 0, notfall: 0 })).toBeNull();
    expect(offeneEingaenge({ offen: 0, dringend: 0, notfall: 0 })).toBeNull();
    expect(offeneEingaenge(undefined)).toBeNull();
    expect(offeneEingaenge({ offen: 1, dringend: 0, notfall: 0 })).toMatchObject({ titel: 'Auftragseingang', anzahl: 1 });
  });
});
