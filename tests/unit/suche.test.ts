/**
 * Was ein Suchbegriff anrichten kann, bevor er die Datenbank erreicht.
 *
 * Die Syntax von PostgREST ist eine ZEICHENKETTE: Bedingungen durch Kommas
 * getrennt, Gruppen in Klammern. Ein Kundenname wie „Huber, Franz" zerreisst
 * sie — gemessen gegen den laufenden Stapel. Das ist der gutmütige Ausgang;
 * der andere ist ein Begriff, der den Baum nicht zerreisst, sondern UMBAUT.
 */
import { describe, it, expect } from 'vitest';
import { ilikeMuster, alsOderWert, oderUeberSpalten } from '@/lib/db/pg/suche';

describe('Jokerzeichen gehören dem Benutzer, nicht der Abfrage', () => {
  it('ein Prozentzeichen wird gesucht, nicht als „alles" gelesen', () => {
    // Wer „50%" tippt, meint das Zeichen. Ohne Entschärfung fände er jeden
    // Namen, in dem irgendwo „50" vorkommt.
    expect(ilikeMuster('50%')).toBe('%50\\%%');
  });

  it('ein Unterstrich steht für sich und nicht für „ein Zeichen"', () => {
    expect(ilikeMuster('A_B')).toBe('%A\\_B%');
  });

  it('ein Rückstrich wird zuerst verdoppelt', () => {
    /*
      DIE REIHENFOLGE ZÄHLT. Erst die Joker zu entschärfen und dann die
      Rückstriche verdoppelte genau die Rückstriche wieder, die der erste
      Durchgang gerade gesetzt hat — aus `\\%` würde `\\\\%`, und das Prozent
      wäre wieder ein Joker.
    */
    expect(ilikeMuster('a\\b')).toBe('%a\\\\b%');
    expect(ilikeMuster('a\\%b')).toBe('%a\\\\\\%b%');
  });
});

describe('Der Wert kommt in Anführungszeichen', () => {
  it('ein Komma zerreisst den Filterbaum sonst', () => {
    expect(alsOderWert('%Huber, Franz%')).toBe('"%Huber, Franz%"');
  });

  it('ein Anführungszeichen im Namen wird entschärft', () => {
    // Sonst endete der Wert dort, und der Rest des Namens wäre Syntax.
    expect(alsOderWert('%O"Brien%')).toBe('"%O\\"Brien%"');
  });

  it('und ein Rückstrich ebenso', () => {
    expect(alsOderWert('%a\\b%')).toBe('"%a\\\\b%"');
  });
});

describe('Die Bedingung über mehrere Spalten', () => {
  it('setzt jede Spalte gegen dasselbe Muster', () => {
    expect(oderUeberSpalten(['name', 'address'], 'Huber'))
      .toBe('name.ilike."%Huber%",address.ilike."%Huber%"');
  });

  it('ein leerer Begriff ist keine Bedingung, sondern keine', () => {
    /*
      „Nichts gesucht" heisst „alles zeigen" — und das ist eine ANDERE
      Abfrage, keine mit einem Muster, das zufällig auf alles passt. Käme hier
      `%%` zurück, liefe jede Listenansicht ohne Suchbegriff über einen
      Mustervergleich statt über den Index.
    */
    expect(oderUeberSpalten(['name'], '')).toBeNull();
    expect(oderUeberSpalten(['name'], '   ')).toBeNull();
  });

  it('und ein Begriff mit Leerzeichen aussen wird beschnitten', () => {
    expect(oderUeberSpalten(['name'], '  Huber  ')).toBe('name.ilike."%Huber%"');
  });
});
