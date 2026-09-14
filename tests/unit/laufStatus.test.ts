import { describe, it, expect } from 'vitest';
import {
  beurteile, pushBeurteilen, laufId, FRIST_STUNDEN,
  type Lauf, type NachtLaufArt,
} from '@shared/laufStatus';

/**
 * Die Überwachung der nächtlichen Läufe.
 *
 * Ausleitung (02:30) und Bilanzlauf (03:15) arbeiten unbeaufsichtigt.
 * Scheiterten sie, stand das im Google-Protokoll und sonst nirgends — der
 * einzige Mangel dieser App, bei dem der Schaden mit der Zeit WÄCHST statt
 * aufzufallen.
 */

const STUNDE = 3_600_000;
const JETZT = Date.parse('2026-09-07T08:00:00Z');

function lauf(zusatz: Partial<Lauf<NachtLaufArt>> = {}): Lauf<NachtLaufArt> {
  return { companyId: 'perl', art: 'ausleitung', ...zusatz };
}

describe('Ein Lauf, der durchgeht', () => {
  it('gilt als gut', () => {
    const u = beurteile(lauf({ zuletztErfolg: JETZT - 6 * STUNDE }), JETZT);
    expect(u.stand).toBe('gut');
    expect(u.stundenHer).toBe(6);
  });

  it('bleibt gut, solange die Frist nicht abgelaufen ist', () => {
    // Ein EINZELNER Fehlschlag heilt sich am nächsten Morgen von selbst. Eine
    // Meldung dafür wäre Lärm, den man abstellt — und dann fehlt sie beim
    // echten Fall.
    const u = beurteile(lauf({ zuletztErfolg: JETZT - (FRIST_STUNDEN - 1) * STUNDE }), JETZT);
    expect(u.stand).toBe('gut');
  });

  it('wird genau an der Frist überfällig', () => {
    const u = beurteile(lauf({ zuletztErfolg: JETZT - FRIST_STUNDEN * STUNDE }), JETZT);
    expect(u.stand).toBe('ueberfaellig');
  });

  it('deckt zwei Nächte ab, nicht eine', () => {
    // 50 Stunden statt 48: der Lauf um 02:30 und der Blick darauf um 08:00
    // liegen nicht auf derselben Uhr.
    expect(FRIST_STUNDEN).toBeGreaterThan(48);
    expect(FRIST_STUNDEN).toBeLessThan(72);
  });
});

describe('Ein Lauf, von dem nichts bekannt ist', () => {
  it('gilt NICHT als gut', () => {
    /*
      Der gefährlichste Fall. Ein Betrieb, in dem der Lauf noch nie
      durchgelaufen ist, sieht in den Daten genauso aus wie einer, dessen
      Aufzeichnung fehlt — und beides heisst: es gibt keine Sicherung, von der
      jemand weiss. Das als Erfolg zu zeigen wäre die gefährlichste Auskunft
      von allen.
    */
    expect(beurteile(undefined, JETZT).stand).toBe('unbekannt');
    expect(beurteile(lauf(), JETZT).stand).toBe('unbekannt');
  });

  it('gilt auch dann nicht als gut, wenn es einen gescheiterten Versuch gab', () => {
    // Ein Versuch ist kein Erfolg. Beurteilt wird `zuletztErfolg`.
    const u = beurteile(lauf({ zuletztVersuch: JETZT - STUNDE, erfolg: false }), JETZT);
    expect(u.stand).toBe('unbekannt');
  });

  it('sagt es in Worten, statt eine Null anzuzeigen', () => {
    expect(beurteile(undefined, JETZT).text).toContain('noch nie');
    expect(beurteile(undefined, JETZT).stundenHer).toBeNull();
  });
});

describe('Wie die Zeit benannt wird', () => {
  it('nennt Stunden, solange es Stunden sind', () => {
    expect(beurteile(lauf({ zuletztErfolg: JETZT - 3 * STUNDE }), JETZT).text).toContain(
      '3 Stunden',
    );
    expect(beurteile(lauf({ zuletztErfolg: JETZT - STUNDE }), JETZT).text).toContain('1 Stunde');
  });

  it('nennt Tage, sobald Stunden unlesbar werden', () => {
    // „vor 74 Stunden" muss man umrechnen, „vor 3 Tagen" nicht.
    const u = beurteile(lauf({ zuletztErfolg: JETZT - 74 * STUNDE }), JETZT);
    expect(u.text).toContain('3 Tagen');
    expect(u.text).not.toContain('74');
  });

  it('kommt mit „gerade eben" zurecht', () => {
    expect(beurteile(lauf({ zuletztErfolg: JETZT - 60_000 }), JETZT).text).toContain(
      'weniger als einer Stunde',
    );
  });

  it('nennt den Lauf beim Namen', () => {
    // „Der Lauf ist überfällig" sagt nicht, welcher.
    expect(beurteile(lauf({ art: 'ausleitung', zuletztErfolg: JETZT }), JETZT).text).toContain(
      'Sicherung',
    );
    expect(beurteile(lauf({ art: 'bilanzen', zuletztErfolg: JETZT }), JETZT).text).toContain(
      'Bilanzlauf',
    );
  });
});

describe('Die Kennung', () => {
  it('entsteht an EINER Stelle für beide Seiten', () => {
    // Die Functions schreiben, die App liest. Zwei Fassungen dieser Bildung
    // wären eine Sicherung, deren Zustand niemand findet.
    expect(laufId('perl', 'ausleitung')).toBe('perl_ausleitung');
    expect(laufId('perl', 'bilanzen')).toBe('perl_bilanzen');
  });
});

describe('Der Push-Versand wird anders beurteilt als ein Nachtlauf', () => {
  /*
    DER UNTERSCHIED IST DER GANZE PUNKT. Ein Nachtlauf MUSS laufen; bleibt er
    aus, ist genau das der Fehler. Push läuft, WENN etwas passiert — bestellt
    drei Tage niemand Material, geht zu Recht keine Meldung hinaus.

    Würde `beurteile` darübergelegt, stünde am ruhigen Wochenende „überfällig"
    über einem Versand, der nichts zu tun hatte. Eine Warnung, die grundlos
    erscheint, wird nach zwei Wochen nicht mehr gelesen — auch dann nicht,
    wenn sie einmal recht hat.
  */
  const push = (zusatz: Partial<Lauf<'push'>> = {}): Lauf<'push'> => ({
    companyId: 'perl', art: 'push', ...zusatz,
  });

  it('kennt keine Frist: ein alter Erfolg bleibt ein Erfolg', () => {
    const vorEinerWoche = JETZT - 7 * 24 * STUNDE;
    const u = pushBeurteilen(push({
      zuletztVersuch: vorEinerWoche, zuletztErfolg: vorEinerWoche, erfolg: true, kennzahl: 0,
    }));
    // Derselbe Abstand macht einen Nachtlauf längst überfällig.
    expect(beurteile(lauf({ zuletztErfolg: vorEinerWoche }), JETZT).stand).toBe('ueberfaellig');
    expect(u.stand).toBe('gut');
  });

  it('meldet, wie viele nicht durchkamen', () => {
    const u = pushBeurteilen(push({
      zuletztVersuch: JETZT, erfolg: false, kennzahl: 3,
      meldung: 'Der Versand antwortete mit 401: Keine Anmeldung.',
    }));
    expect(u.stand).toBe('ueberfaellig');
    expect(u.text).toContain('3 Push-Meldungen');
    // Die Meldung des Servers gehört dazu — ohne sie sucht jemand im Falschen.
    expect(u.text).toContain('401');
  });

  it('zählt richtig im Einzahl', () => {
    const u = pushBeurteilen(push({ zuletztVersuch: JETZT, erfolg: false, kennzahl: 1 }));
    expect(u.text).toContain('1 Push-Meldung kam');
  });

  it('ohne jeden Versuch wird nichts behauptet', () => {
    /*
      NICHT „funktioniert nicht". Ein Betrieb, der noch keine Meldung
      ausgelöst hat, hat kein Problem — und ein roter Kasten dafür wäre die
      erste Warnung, die jemand wegklickt.
    */
    const u = pushBeurteilen(undefined);
    expect(u.stand).toBe('unbekannt');
    expect(u.text).not.toMatch(/Fehler|nicht durch/);
  });
});
