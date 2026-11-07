/**
 * Das Änderungsprotokoll in Worten (E50): Rohwerte der Datenbank werden zu
 * dem, was ein Mensch liest — und nichts Internes steht als Zeile da.
 */
import { describe, it, expect } from 'vitest';
import { verlaufEintrag } from '@/features/time/verlaufText';
import type { VerlaufZeile } from '@/lib/db/zeitbuchungVerlauf';

const zeile = (z: Partial<VerlaufZeile>): VerlaufZeile => ({
  eintragId: 'e1', userId: 'u1', datum: '2026-11-02', art: 'geaendert', aenderungen: {}, am: Date.parse('2026-11-05T13:03:00Z'), ...z,
});

describe('verlaufEintrag', () => {
  it('eine Änderung: je Feld alt → neu, in lesbarer Form', () => {
    const e = verlaufEintrag(zeile({
      vonName: 'Erna Beispiel',
      aenderungen: {
        end_time: { alt: '15:00:00', neu: '14:00:00' },
        break_duration: { alt: 30, neu: 45 },
        is_emergency: { alt: false, neu: true },
        date: { alt: '2026-11-02', neu: '2026-11-03' },
      },
    }));
    expect(e.titel).toBe('Geändert von Erna Beispiel');
    expect(e.zeilen).toEqual(['Tag 02.11.2026 → 03.11.2026', 'Ende 15:00 → 14:00', 'Pause 30 Min. → 45 Min.', 'Notdienst nein → ja']);
    expect(e.zeit).toMatch(/05\.11\.2026/);
  });

  it('nur Internes geändert: sagt es, statt eine leere Zeile zu zeigen', () => {
    const e = verlaufEintrag(zeile({ aenderungen: { vacation_id: { alt: null, neu: 'v1' } } }));
    expect(e.zeilen).toEqual(['Verknüpfung geändert (Antrag, Meldung oder Baustelle)']);
  });

  it('Anlegen und Löschen: der Stand, ohne leere Felder und ohne Kennungen', () => {
    const stand = {
      id: 'e1', company_id: 'perl', user_id: 'u1', date: '2026-11-02', status: 'Anwesend',
      start_time: '07:00:00', end_time: '15:00:00', break_duration: 30, comment: null,
      is_night_work: false, customer_name: 'Familie Huber', project_number: 'B-001', project_id: 'p1',
    };
    const a = verlaufEintrag(zeile({ art: 'angelegt', aenderungen: stand }));
    expect(a.titel).toBe('Angelegt');
    expect(a.zeilen).toEqual([
      'Tag 02.11.2026', 'Art Anwesend', 'Beginn 07:00', 'Ende 15:00', 'Pause 30 Min.', 'Kunde Familie Huber', 'Baustelle B-001',
    ]);
    expect(verlaufEintrag(zeile({ art: 'geloescht', vonName: 'Max', aenderungen: stand })).titel).toBe('Gelöscht von Max');
  });
});

/*
  DIE FREIEN ZEITFELDER IM PROTOKOLL (M06b): `feld:<Kennung>` mit dem Namen
  der Definition, wie sie jetzt heißt; eine Auswahl mit dem Text der Option;
  in der Reihenfolge des Betriebs, nach den festen Spalten.
*/
describe('verlaufEintrag — freie Zeitfelder', () => {
  const WIEN = '11111111-1111-4111-8111-111111111111';
  const GRAZ = '22222222-2222-4222-8222-222222222222';
  const felder = [
    { id: 'k', name: 'Kostenstelle', typ: 'auswahl' as const, reihenfolge: 1, aktiv: true,
      regeln: { optionen: [{ id: WIEN, text: 'Wien', aktiv: true }, { id: GRAZ, text: 'Graz', aktiv: false }] } },
    { id: 'km', name: 'Kilometer', typ: 'zahl' as const, regeln: { einheit: 'km' }, reihenfolge: 2, aktiv: true },
  ];

  it('eine Wertänderung als „Name alt → neu“', () => {
    const e = verlaufEintrag(zeile({ aenderungen: {
      'feld:km': { alt: 10, neu: 20 }, 'feld:k': { alt: WIEN, neu: GRAZ }, end_time: { alt: '15:00:00', neu: '14:00:00' },
    } }), felder);
    expect(e.zeilen).toEqual(['Ende 15:00 → 14:00', 'Kostenstelle Wien → Graz', 'Kilometer 10 km → 20 km']);
  });

  it('beim Anlegen im ganzen Stand; ein neuer oder entfernter Wert mit Strich', () => {
    expect(verlaufEintrag(zeile({ art: 'angelegt', aenderungen: { 'feld:k': WIEN } }), felder).zeilen).toEqual(['Kostenstelle Wien']);
    expect(verlaufEintrag(zeile({ aenderungen: { 'feld:km': { alt: null, neu: 3 } } }), felder).zeilen).toEqual(['Kilometer — → 3 km']);
  });

  it('ohne Definition steht „Freie Angabe“ — nie „Verknüpfung geändert“', () => {
    expect(verlaufEintrag(zeile({ aenderungen: { 'feld:x': { alt: 'a', neu: 'b' } } })).zeilen).toEqual(['Freie Angabe a → b']);
  });
});
