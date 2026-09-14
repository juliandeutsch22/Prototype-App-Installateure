/**
 * Woher der Dienstschlüssel kommt — und was passiert, wenn keiner da ist.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG WERT IST. Der Fehler, der diese Datei
 * ausgelöst hat, sah im Betrieb so aus: der nächtliche Ausleitungslauf
 * antwortete mit 401 „Keine Anmeldung." Der Schlüssel im Tresor war richtig,
 * das Projekt stimmte, die Function war ausgeliefert — gefehlt hat die
 * Umgebungsvariable in der Function. Die Meldung zeigte also auf den
 * Anrufer, während der Dienst das Problem war, und wer danach sucht, sucht
 * eine Stunde an der falschen Stelle.
 *
 * Zwei Dinge werden hier festgehalten: dass der Schlüssel unter beiden
 * Namen gefunden wird, die die Plattform benutzt, und dass „kein Schlüssel"
 * niemals als „das ist die Maschine" durchgeht.
 */
import { describe, it, expect } from 'vitest';
import {
  dienstSchluessel, istDienst, SCHLUESSEL_NAMEN, SCHLUESSEL_FEHLT,
} from '@shared/dienstSchluessel';

describe('dienstSchluessel', () => {
  it('findet den alten Namen', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: 'abc' })).toBe('abc');
  });

  it('findet den neuen Namen', () => {
    expect(dienstSchluessel({ SUPABASE_SECRET_KEY: 'sb_secret_xyz' })).toBe('sb_secret_xyz');
  });

  it('nimmt den alten zuerst, wenn beide dastehen', () => {
    expect(dienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: 'alt',
      SUPABASE_SECRET_KEY: 'neu',
    })).toBe('alt');
  });

  it('meldet null, wenn keiner gesetzt ist', () => {
    expect(dienstSchluessel({})).toBeNull();
    expect(dienstSchluessel({ IRGENDWAS: 'x' })).toBeNull();
  });

  it('behandelt eine leere Variable wie eine fehlende', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: '' })).toBeNull();
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: '   ' })).toBeNull();
  });

  it('fällt auf den zweiten Namen zurück, wenn der erste leer ist', () => {
    expect(dienstSchluessel({
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_SECRET_KEY: 'neu',
    })).toBe('neu');
  });

  it('schneidet Leerraum ab — ein eingefügter Zeilenumbruch ist derselbe Schlüssel', () => {
    expect(dienstSchluessel({ SUPABASE_SERVICE_ROLE_KEY: ' abc\n' })).toBe('abc');
  });
});

describe('istDienst', () => {
  it('erkennt den Dienst', () => {
    expect(istDienst('abc', 'abc')).toBe(true);
  });

  it('weist einen anderen Schlüssel ab', () => {
    expect(istDienst('anon-schluessel', 'dienst-schluessel')).toBe(false);
  });

  /*
    DER GEFÄHRLICHSTE FALL, und der Grund, warum hier nicht `===` steht:
    ohne Kopfzeile ist das Token die leere Zeichenkette. Wäre der
    Dienstschlüssel ebenfalls leer, machte ein blosser Vergleich aus dem
    Aufruf OHNE jede Anmeldung den einzigen, der durchkommt.
  */
  it('macht aus zweimal nichts keinen Dienst', () => {
    expect(istDienst('', null)).toBe(false);
    expect(istDienst('', '')).toBe(false);
    expect(istDienst('   ', null)).toBe(false);
  });

  it('stört sich nicht an Leerraum um das Token', () => {
    expect(istDienst(' abc ', 'abc')).toBe(true);
  });
});

describe('SCHLUESSEL_FEHLT', () => {
  it('nennt beide Namen, damit niemand raten muss', () => {
    for (const name of SCHLUESSEL_NAMEN) expect(SCHLUESSEL_FEHLT).toContain(name);
  });
});
