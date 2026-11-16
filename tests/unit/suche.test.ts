/**
 * Was ein Suchbegriff anrichten kann, bevor er die Datenbank erreicht — und
 * wann überhaupt gesucht wird.
 *
 * Seit der Nacharbeit zu L3 geht jede Suche über eine Datenbankfunktion
 * (`suche_<tabelle>`, `katalog_suchen`); die `or(…ilike…)`-Bedingung für
 * PostgREST gibt es nicht mehr, und mit ihr nicht das Entschärfen für deren
 * Syntax. Geblieben: die Jokerzeichen in fertigen Mustern und die Regel, dass
 * ein leerer Begriff keine Suche ist.
 */
import { describe, it, expect } from 'vitest';
import { ohneJoker } from '@/lib/db/pg/suche';
import { mitSuche } from '@/lib/db/pg/kern';

describe('Jokerzeichen gehören dem Benutzer, nicht der Abfrage', () => {
  it('ein Prozentzeichen wird gesucht, nicht als „alles“ gelesen', () => {
    // Wer „50%" tippt, meint das Zeichen.
    expect(ohneJoker('50%')).toBe('50\\%');
  });

  it('ein Unterstrich steht für sich und nicht für „ein Zeichen“', () => {
    expect(ohneJoker('A_B')).toBe('A\\_B');
    expect(ohneJoker('a\\b')).toBe('a\\\\b');
    expect(ohneJoker('a\\%b')).toBe('a\\\\\\%b');
  });
});

describe('Wann gesucht wird (`mitSuche`)', () => {
  it('über die Spalten mit dem beschnittenen Begriff', () => {
    expect(mitSuche({ suche: { spalten: ['name', 'address'], begriff: '  Huber, Franz  ' } }))
      .toEqual({ p_spalten: ['name', 'address'], p_begriff: 'Huber, Franz', p_muster: null });
  });

  it('ein leerer Begriff ist keine Suche, sondern keine — die Tabelle selbst', () => {
    /*
      „Nichts gesucht" heisst „alles zeigen" — eine ANDERE Abfrage, keine mit
      einem Muster, das zufällig auf alles passt.
    */
    expect(mitSuche({ suche: { spalten: ['name'], begriff: '' } })).toBeNull();
    expect(mitSuche({ suche: { spalten: ['name'], begriff: '   ' } })).toBeNull();
    expect(mitSuche({})).toBeNull();
  });

  it('fertige Muster gehen unverändert mit, keine Muster heißt keine Suche', () => {
    expect(mitSuche({ suche: { spalten: ['name'], muster: ['Huber%Franz'] } }))
      .toEqual({ p_spalten: ['name'], p_begriff: null, p_muster: ['Huber%Franz'] });
    expect(mitSuche({ suche: { spalten: ['name'], muster: [] } })).toBeNull();
  });
});
