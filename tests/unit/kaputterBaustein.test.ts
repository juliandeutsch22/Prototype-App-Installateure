import { describe, it, expect } from 'vitest';
import { istNachladeFehler } from '@/lib/nachladen';

/**
 * Die Meldung, die aus dem Betrieb kam — wörtlich vom Bildschirm des iPhones.
 *
 * Sie entstand durch ein Vorladen, das ich eingebaut hatte: scheiterte es auf
 * schwachem Empfang, merkte sich der Browser das kaputte Modul, und der
 * spätere echte Aufruf bekam `undefined` statt der Ansicht. Das Vorladen ist
 * wieder draussen — dieser Test hält fest, dass die Fehlergrenze so einen
 * Fall AUCH DANN als Nachladefehler behandelt, wenn er auf anderem Weg
 * entsteht. Sonst sitzt der Monteur wieder vor einem Knopf, der nichts kann.
 */
describe('Ein leer angekommener Baustein gilt als Nachladefehler', () => {
  it('erkennt die aus dem Betrieb gemeldete Meldung wörtlich', () => {
    expect(
      istNachladeFehler({
        message: "undefined is not an object (evaluating 'e._result.default')",
      }),
    ).toBe(true);
  });

  it('erkennt auch die Chrome-Formulierung derselben Sache', () => {
    expect(
      istNachladeFehler({
        message: "Cannot read properties of undefined (reading 'default')  _payload",
      }),
    ).toBe(true);
  });

  it('haelt einen GEWOEHNLICHEN Programmfehler davon getrennt', () => {
    // Sonst wuerde jeder Tippfehler ein Neuladen ausloesen, und ein echter
    // Fehler verschwaende sich hinter einer Schleife aus Neustarts.
    expect(
      istNachladeFehler({ message: "undefined is not an object (evaluating 'kunde.name')" }),
    ).toBe(false);
    expect(istNachladeFehler({ message: 'Cannot read properties of undefined' })).toBe(false);
  });
});
