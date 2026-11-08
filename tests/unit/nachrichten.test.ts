/**
 * NACHRICHTEN (M10/B09) — die reinen Regeln ohne Datenbank.
 *
 * Festgehalten wird:
 * - Push ohne Inhalt, solange der Empfänger keine Vorschau gewählt hat; mit
 *   Vorschau die 80 Zeichen; eine Erwähnung sagt das; der Absender bekommt
 *   nichts; dieselbe Kennung je Gespräch;
 * - die Vormerkungen eines Gesprächs aus dem Ausgangsfach (Text und Bilder),
 *   und nur seine;
 * - Senden im Funkloch steht auf der Liste des Ausgangsfachs (Aufruf und
 *   beide Eimer), sonst nichts Neues;
 * - Zeit, Größe, Dateiprüfung, Erwähnungen, Dateiname des Exports;
 * - die Zeilen der Startseite.
 *
 * Gegenprobe: ohne `textNachricht`/`empfaengerNachricht`,
 * `vorgemerkteNachrichten` und die Einträge in `AUFRUFE_OHNE_EMPFANG` sind
 * die Prüfungen rot.
 */
import { describe, it, expect } from 'vitest';
import { empfaengerNachricht, textNachricht, willMeldung, type NachrichtEreignis } from '@shared/notifyLogic';
import { vorgemerkteNachrichten, NACHRICHT_TABELLE } from '@/lib/db/pg/nachrichten';
import { AUFRUFE_OHNE_EMPFANG, EIMER_OHNE_EMPFANG } from '@/lib/sync/supabaseSender';
import type { Vormerkung } from '@/lib/sync/ausgangsfach';
import { dateiPruefen, erwaehnteIn, exportDateiname, groesseText, istBild, zeitText } from '@/features/nachrichten/text';
import { meldungenZeile, nachrichtenZeile, ungeleseneNachrichten } from '@/features/dashboard/start/regeln';

const ereignis = (x: Partial<NachrichtEreignis> = {}): NachrichtEreignis => ({
  nachricht: 'n1', kanal: 'k1', art: 'direkt', von: 'Max Monteur', text: null, anhang: false,
  empfaenger: [{ uid: 'b', vorschau: false }], ...x,
});

describe('Push einer Nachricht', () => {
  it('ohne gewählte Vorschau kein Inhalt — nur, wer geschrieben hat', () => {
    const m = textNachricht(ereignis({ text: 'Geheimer Text' }), false);
    expect(m).toEqual({ title: 'Max Monteur', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' });
    expect(JSON.stringify(m)).not.toContain('Geheim');
  });

  it('mit Vorschau der Text; in Runde und Baustelle mit Absender', () => {
    expect(textNachricht(ereignis({ text: 'Bin um 7 dort' }), true).body).toBe('Bin um 7 dort');
    expect(textNachricht(ereignis({ art: 'runde', runde: 'Bad Huber', text: 'Fliesen da' }), true))
      .toMatchObject({ title: 'Bad Huber', body: 'Max Monteur: Fliesen da' });
    expect(textNachricht(ereignis({ art: 'baustelle', baustelle: 'B-12', text: 'x' }), false))
      .toMatchObject({ title: 'Baustelle B-12', body: 'Neue Nachricht von Max Monteur' });
  });

  it('eine Erwähnung sagt das; ein Bild ohne Text heißt „Anhang“', () => {
    expect(textNachricht(ereignis({ art: 'runde', runde: null }), false, true)).toMatchObject({ title: 'Runde', body: 'Max Monteur hat dich erwähnt' });
    expect(textNachricht(ereignis({ anhang: true, text: '' }), true).body).toBe('Anhang');
  });

  it('gruppiert nach Vorschau und Erwähnung; der Absender fällt heraus; ohne Text keine Vorschau', () => {
    const e = ereignis({
      art: 'runde', text: 'Hallo',
      empfaenger: [
        { uid: 'a', vorschau: true }, { uid: 'b', vorschau: false }, { uid: 'c', vorschau: true, erwaehnt: true }, { uid: 'ich' },
      ],
    });
    expect(empfaengerNachricht(e, 'ich')).toEqual([
      { uids: ['a'], vorschau: true, erwaehnt: false },
      { uids: ['b'], vorschau: false, erwaehnt: false },
      { uids: ['c'], vorschau: true, erwaehnt: true },
    ]);
    // Liefert die Datenbank keinen Text (niemand wollte die Vorschau), bekommt sie auch keiner.
    expect(empfaengerNachricht({ ...e, text: null }, 'ich').every((g) => !g.vorschau)).toBe(true);
    // Im Direktgespräch gibt es keine Erwähnung.
    expect(empfaengerNachricht(ereignis({ empfaenger: [{ uid: 'b', erwaehnt: true }] }))[0].erwaehnt).toBe(false);
  });

  it('wer Nachrichten abschaltet, bekommt keine — Vorgabe an', () => {
    expect(willMeldung({ notifyNachrichten: false }, 'notifyNachrichten')).toBe(false);
    expect(willMeldung({}, 'notifyNachrichten')).toBe(true);
  });
});

describe('Vorgemerkte Nachrichten', () => {
  const v = (folge: number, x: Partial<Vormerkung>): Vormerkung => ({
    folge, zeile: 'n1', tabelle: NACHRICHT_TABELLE, art: 'aufruf', daten: {}, versuche: 0, angelegt: 1000 + folge, ...x,
  });

  it('Text und Bilder eines Gesprächs, in der Reihenfolge — fremde Gespräche und Scheine nicht', () => {
    const bild = new Uint8Array([1, 2, 3]).buffer;
    const liste = vorgemerkteNachrichten([
      v(1, { art: 'hochladen', daten: { pfad: 'nachrichten/b/k1/n1/a1', inhalt: bild, inhaltsart: 'image/png', kanal: 'k1', name: 'x.png' } }),
      v(2, { daten: { funktion: 'nachricht_senden', parameter: { p_kanal: 'k1', p_text: 'Mit Bild' } } }),
      v(3, { zeile: 'n2', daten: { funktion: 'nachricht_senden', parameter: { p_kanal: 'k2', p_text: 'anderes Gespräch' } } }),
      v(4, { zeile: 's1', tabelle: 'work_sheets', daten: { funktion: 'schein_speichern', parameter: {} } }),
    ], 'k1');
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: 'n1', text: 'Mit Bild', seit: 1002 });
    expect(liste[0].dateien.map((d) => [d.id, d.name, d.inhalt.size])).toEqual([['a1', 'x.png', 3]]);
  });

  it('Senden ohne Netz steht auf der Liste des Ausgangsfachs — Aufruf und beide Eimer', () => {
    expect([...AUFRUFE_OHNE_EMPFANG]).toEqual(['schein_speichern', 'schein_unterschreiben', 'nachricht_senden']);
    expect([...EIMER_OHNE_EMPFANG]).toEqual(['scheinfotos', 'nachrichten', 'nachrichten-privat']);
  });
});

describe('Texte im Gespräch', () => {
  const jetzt = new Date('2026-11-08T10:00:00Z');

  it('Zeit in Wiener Zeit: heute die Uhr, gestern, diese Woche der Tag, sonst das Datum', () => {
    expect(zeitText('2026-11-08T08:41:00Z', jetzt)).toBe('09:41');
    expect(zeitText('2026-11-07T17:02:00Z', jetzt)).toBe('gestern 18:02');
    expect(zeitText('2026-11-04T06:15:00Z', jetzt)).toMatch(/^Mi 07:15$/);
    expect(zeitText('2026-10-01T06:15:00Z', jetzt)).toBe('01.10.2026 08:15');
  });

  it('Größe, Bild, Dateiprüfung', () => {
    expect(groesseText(830 * 1024)).toBe('830 KB');
    expect(groesseText(2.4 * 1024 * 1024)).toBe('2,4 MB');
    expect(istBild('image/png')).toBe(true);
    expect(istBild('image/heic')).toBe(false);
    expect(dateiPruefen({ name: 'a.png', size: 10, type: 'image/png' })).toBeNull();
    expect(dateiPruefen({ name: 'a.exe', size: 10, type: 'application/x-msdownload' })).toContain('geht nicht mit');
    expect(dateiPruefen({ name: 'gross.pdf', size: 26 * 1024 * 1024, type: 'application/pdf' })).toContain('25 MB');
  });

  it('erwähnt ist, wer mit „@Name“ am Wortanfang steht', () => {
    const leute = [{ uid: 'a', name: 'Anna Huber' }, { uid: 'b', name: 'Bernd' }, { uid: 'c', name: 'Ann' }];
    expect(erwaehnteIn('@Anna Huber bitte prüfen, @bernd auch.', leute).sort()).toEqual(['a', 'b']);
    expect(erwaehnteIn('mail@Bernd.at', leute)).toEqual([]);
    expect(erwaehnteIn('@Anna Huber', leute)).toEqual(['a']);
  });

  it('der Dateiname des Exports sagt, wessen und von wann', () => {
    expect(exportDateiname('Jürgen Groß', new Date('2026-11-08T10:00:00Z'))).toBe('nachrichten-jurgen-gross-2026-11-08.json');
  });
});

describe('Startseite', () => {
  it('eine Zeile für die eigenen ungelesenen, keine bei null', () => {
    expect(nachrichtenZeile(0)).toBeNull();
    expect(nachrichtenZeile(1)).toMatchObject({ titel: '1 ungelesene Nachricht', to: '/nachrichten', status: { ton: 'leise' } });
    expect(ungeleseneNachrichten(3)?.zeilen[0].titel).toBe('3 ungelesene Nachrichten');
  });

  it('gemeldete Nachrichten für die Geschäftsführung, Bernstein', () => {
    expect(meldungenZeile(undefined)).toBeNull();
    expect(meldungenZeile(2)).toMatchObject({ titel: '2 gemeldete Nachrichten', to: '/settings/nachrichten', status: { ton: 'warn' } });
  });
});
