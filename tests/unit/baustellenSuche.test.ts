import { describe, it, expect } from 'vitest';
import {
  deuteBaustellenSuche,
  baustellenSuchHinweis,
} from '@/features/projects/baustellenSuche';

/**
 * Was ein Suchbegriff in der Baustellenliste meint.
 *
 * Die Entscheidung ist eng: nur eine Baustellennummer geht auf den Server.
 * Alles andere im Browser zu filtern ist keine Bequemlichkeit, sondern die
 * einzige Lesart, die nicht stillschweigend danebenliegt — Firestore kann
 * keine Volltextsuche, und ein nachgepflegtes Suchfeld fände Altbestände
 * genau so lange nicht, wie es niemandem auffällt.
 */

describe('Die Deutung des Suchbegriffs', () => {
  it('erkennt die Baustellennummer in beiden Schreibweisen', () => {
    expect(deuteBaustellenSuche('2024-031')).toEqual({
      art: 'nummer',
      nummer: '2024-031',
      formen: ['2024-031', 'PR-2024-031'],
    });
    // Altbestände tragen ein führendes „PR-"; wer es mit eintippt, meint
    // dieselbe Baustelle.
    expect(deuteBaustellenSuche('PR-2024-031')).toMatchObject({ nummer: '2024-031' });
    expect(deuteBaustellenSuche('pr-2024-031')).toMatchObject({ nummer: '2024-031' });
  });

  it('nimmt den Schrägstrich als Trenner an', () => {
    // Auf Papier wird die Nummer so geschrieben; wer sie abtippt, tippt sie so.
    expect(deuteBaustellenSuche('2024/31')).toMatchObject({ nummer: '2024-31' });
  });

  it('sucht BEIDE Formen, nicht nur die eingetippte', () => {
    /*
      Firestore vergleicht Zeichenketten genau. Stünde nur die normalisierte
      Form in der Abfrage, fände die Suche ausgerechnet die alten Baustellen
      nicht — die mit dem „PR-", um die es hier geht.
    */
    const s = deuteBaustellenSuche('PR-2024-031');
    expect(s.art === 'nummer' && s.formen).toEqual(['2024-031', 'PR-2024-031']);
  });

  it('hält eine Hausnummer NICHT für eine Baustellennummer', () => {
    /*
      Strenger als bei den Scheinen, und mit Grund: im Bestand stehen
      Adressen. Eine Abfrage nach „Grazbachgasse 12" fände verlässlich nichts
      und würde die örtliche Suche nur mit einem falschen Versprechen
      überdecken.
    */
    expect(deuteBaustellenSuche('12').art).toBe('text');
    expect(deuteBaustellenSuche('Grazbachgasse 12').art).toBe('text');
    expect(deuteBaustellenSuche('Huber').art).toBe('text');
    expect(deuteBaustellenSuche('').art).toBe('text');
    // Ein Jahr allein ist kein Treffer: es fehlt die laufende Nummer.
    expect(deuteBaustellenSuche('2024').art).toBe('text');
  });

  it('lässt eine unsinnig lange Zahlenfolge liegen', () => {
    // Eine Telefonnummer ist keine Baustellennummer.
    expect(deuteBaustellenSuche('2024-123456').art).toBe('text');
  });
});

describe('Was die Oberfläche vorher sagt', () => {
  it('kündigt bei einer Nummer die Serversuche an', () => {
    const satz = baustellenSuchHinweis(deuteBaustellenSuche('2024-031'));
    expect(satz).toMatch(/Server/);
    expect(satz).toMatch(/2024-031/);
  });

  it('sagt bei freiem Text, wie weit die Suche reicht — und was hilft', () => {
    /*
      Ohne diesen Satz sieht eine Suche über die Grenze hinaus genauso aus wie
      eine, die es wirklich nicht gibt: leer. Er muss deshalb beides tun —
      die Grenze nennen UND den Ausweg.
    */
    const satz = baustellenSuchHinweis(deuteBaustellenSuche('Huber'));
    expect(satz).toMatch(/geladenen Bestand/);
    expect(satz).toMatch(/Nummer/);
  });
});
