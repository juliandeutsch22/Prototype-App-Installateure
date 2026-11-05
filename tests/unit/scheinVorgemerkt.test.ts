/**
 * Wartende Handwerksscheine aus dem Ausgangsfach (E49).
 *
 * Die Liste zeigt sie, damit niemand denselben Schein zweimal anlegt, und
 * die Maske öffnet einen wartenden Entwurf auch ohne Netz. Beides hängt
 * daran, dass die Vorgänge so zusammengesetzt werden, wie die Datenbank sie
 * anwenden wird: der Kopf Feld für Feld, die Listen jeweils ganz.
 */
import { describe, it, expect } from 'vitest';
import type { Vormerkung } from '@/lib/sync/ausgangsfach';
import { entwurfMitVorgemerktem, vorgemerkteScheine } from '@/features/worksheets/vorgemerkt';
import type { WorkSheet } from '@/types';

let folge = 0;
const v = (teil: Partial<Vormerkung>): Vormerkung => {
  folge += 1;
  return { folge, zeile: 's1', tabelle: 'work_sheets', art: 'aufruf', daten: {}, versuche: 0, angelegt: 1000 + folge, ...teil };
};
const speichern = (zeile: string, p: Record<string, unknown>) =>
  v({ zeile, daten: { funktion: 'schein_speichern', parameter: { p_id: zeile, p_kopf: null, p_zeiten: null, p_material: null, p_fotos: null, ...p } } });

describe('vorgemerkteScheine', () => {
  it('setzt Kopf, Zeiten, Material und Fotos eines Scheins zusammen — spätere Vorgänge gewinnen', () => {
    const datei = new Blob(['x']);
    const scheine = vorgemerkteScheine([
      speichern('s1', {
        p_kopf: { project_number: 'B-1', customer_name: 'Familie Huber', datum: '2026-11-05', notizen: 'alt' },
        p_zeiten: [{ datum: '2026-11-05', mitarbeiter: 'Max', von: '07:00', bis: '09:00', pause_min: 0, minuten: 120 }],
        p_material: [{ name: 'Dichtung', menge: 2 }],
        p_fotos: [],
      }),
      v({ tabelle: 'scheinfotos', art: 'hochladen', zeile: 'scheine/perl/s1/aa.jpg', daten: { eimer: 'scheinfotos', pfad: 'scheine/perl/s1/aa.jpg', datei, schein: 's1' } }),
      speichern('s1', { p_fotos: [{ pfad: 'scheine/perl/s1/aa.jpg', hash: 'aa', bytes: 1, geraet_zeit: '2026-11-05T08:00:00.000Z' }] }),
      speichern('s1', { p_kopf: { notizen: 'neu' } }),
    ]);

    expect(scheine).toHaveLength(1);
    const [s] = scheine;
    expect(s.kopf).toMatchObject({ projectNumber: 'B-1', customerName: 'Familie Huber', notizen: 'neu' });
    expect(s.zeiten).toEqual([{ datum: '2026-11-05', mitarbeiter: 'Max', von: '07:00', bis: '09:00', pauseMin: 0, minuten: 120 }]);
    expect(s.material).toEqual([{ name: 'Dichtung', menge: 2 }]);
    // Die Gerätezeit kommt zurück, wie die App sie kennt: in Millisekunden.
    expect(s.fotos).toEqual([{ pfad: 'scheine/perl/s1/aa.jpg', hash: 'aa', bytes: 1, geraetZeit: Date.parse('2026-11-05T08:00:00.000Z') }]);
    expect(s.dateien['scheine/perl/s1/aa.jpg']).toBe(datei);
    expect(s.unterschrieben).toBe(false);
  });

  it('erkennt die wartende Unterschrift und trennt mehrere Scheine', () => {
    const scheine = vorgemerkteScheine([
      speichern('a', { p_kopf: { customer_name: 'A' } }),
      speichern('b', { p_kopf: { customer_name: 'B' } }),
      v({ zeile: 'b', daten: { funktion: 'schein_unterschreiben', parameter: { p_id: 'b' } } }),
    ]);
    expect(scheine.map((s) => [s.id, s.unterschrieben])).toEqual([['b', true], ['a', false]]);
  });

  it('lässt Zeitbuchungen, Anforderungen und Entfernen außen vor', () => {
    expect(vorgemerkteScheine([
      v({ tabelle: 'time_entries', art: 'anlegen', zeile: 't1', daten: { date: '2026-11-05' } }),
      v({ tabelle: 'material_orders', art: 'aendern', zeile: 'm1', daten: {} }),
      v({ tabelle: 'scheinfotos', art: 'entfernen', zeile: 'p', daten: { eimer: 'scheinfotos', pfade: ['p'] } }),
    ])).toEqual([]);
  });
});

describe('entwurfMitVorgemerktem', () => {
  const server = {
    id: 's1', companyId: 'perl', projectNumber: 'B-1', customerName: 'Familie Huber', datum: '2026-11-04',
    status: 'Entwurf', abrechnung: 'Regie', zeiten: [], material: [{ name: 'Alt', menge: 1 }], notizen: 'vom Server',
    erstelltVonUid: 'm1', erstelltVonName: 'Max', createdAt: 1,
  } as unknown as WorkSheet;

  it('ohne Wartendes bleibt der Stand vom Server', () => {
    expect(entwurfMitVorgemerktem(server, undefined)).toBe(server);
  });

  it('das Wartende liegt über dem Stand vom Server', () => {
    const [w] = vorgemerkteScheine([speichern('s1', { p_kopf: { notizen: 'im Keller' }, p_material: [] })]);
    const s = entwurfMitVorgemerktem(server, w);
    expect(s).toMatchObject({ id: 's1', notizen: 'im Keller', material: [], customerName: 'Familie Huber', status: 'Entwurf' });
  });

  it('ein Schein, der nur im Gerät steht, öffnet aus dem Fach — ohne Kopf gibt es nichts zu öffnen', () => {
    const [mitKopf] = vorgemerkteScheine([speichern('n', { p_kopf: { project_number: 'B-2', customer_name: 'Neu', datum: '2026-11-05' }, p_zeiten: [], p_material: [] })]);
    expect(entwurfMitVorgemerktem(undefined, mitKopf)).toMatchObject({ projectNumber: 'B-2', status: 'Entwurf', zeiten: [], material: [] });
    const [nurFotos] = vorgemerkteScheine([speichern('f', { p_fotos: [] })]);
    expect(entwurfMitVorgemerktem(undefined, nurFotos)).toBeUndefined();
  });
});
