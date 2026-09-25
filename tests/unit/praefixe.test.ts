import { describe, it, expect } from 'vitest';
import {
  praefixeVon, praefixPutzen, praefixFehler, belegNummer, hoechsteLfd, lfdNummerVon,
  ohneKennzeichenVorsatz, mitKennzeichenVorsatz, PRAEFIX_VORGABE,
} from '@/lib/praefixe';
import type { Company } from '@/types';

/**
 * Die Vorsätze, die bis zum 18.09. fest im Quelltext standen.
 *
 * DER SCHLIMMSTE FALL WAR DAS KENNZEICHEN: `WZ` ist der Kenner eines
 * bestimmten Bezirks und stand dreifach in `TimeForm.tsx`. Ein zweiter
 * Betrieb hätte ihn auf JEDEM Zeiteintrag stehen gehabt, ohne Möglichkeit,
 * ihn loszuwerden — und von dort wandert er in den Lohnexport.
 */

const betrieb = (f: Partial<Company> = {}) => ({ id: 'x', name: 'X', ...f }) as Company;

describe('Was gilt, wenn der Betrieb nichts festgelegt hat', () => {
  it('die Belege zählen weiter wie bisher', () => {
    // Bestehende Nummernkreise dürfen sich durch diese Änderung nicht
    // verschieben — sonst risse sie eine Lücke, die der Steuerberater
    // erklären lassen will.
    const v = praefixeVon(betrieb());
    expect(v.rechnung).toBe('RE');
    expect(v.angebot).toBe('AN');
    expect(v.baustelle).toBe('B');
  });

  it('das Kennzeichen bleibt LEER — und das ist der ganze Punkt', () => {
    /*
      EINE VORGABE WÄRE HIER GENAU DER FEHLER, DER BEHOBEN WIRD. `WZ` stand
      fest im Code; als Vorgabe stehen zu bleiben hiesse, ihn jedem neuen
      Betrieb aufzustempeln — nur an einer anderen Stelle.
    */
    expect(praefixeVon(betrieb()).kennzeichen).toBe('');
    expect(PRAEFIX_VORGABE.kennzeichen).toBe('');
  });

  it('ohne Betrieb wirft es nicht', () => {
    expect(praefixeVon(undefined).rechnung).toBe('RE');
    expect(praefixeVon(null).baustelle).toBe('B');
  });
});

describe('„Nicht festgelegt" ist nicht dasselbe wie „keiner"', () => {
  it('eine leere Zeichenkette bleibt leer', () => {
    /*
      OHNE DIESEN UNTERSCHIED KÄME EIN BETRIEB SEINEN VORSATZ NIE LOS: jede
      leere Eingabe fiele auf die Vorgabe zurück, und wer ohne Vorsatz zählen
      will („2026-1001"), bekäme beim nächsten Laden wieder `RE`.
    */
    expect(praefixeVon(betrieb({ praefixRechnung: '' })).rechnung).toBe('');
  });

  it('und `undefined` fällt auf die Vorgabe', () => {
    expect(praefixeVon(betrieb({ praefixRechnung: undefined })).rechnung).toBe('RE');
  });
});

describe('Die Belegnummer', () => {
  it('setzt den Vorsatz vor Jahr und laufende Nummer', () => {
    expect(belegNummer('RE', 2026, 1001)).toBe('RE-2026-1001');
    expect(belegNummer('B', 2026, 7)).toBe('B-2026-0007');
  });

  it('lässt ohne Vorsatz auch den Trennstrich weg', () => {
    // Sonst hiesse die erste Rechnung „-2026-1001" — eine Nummer, die mit
    // einem Strich anfängt, sieht in jeder Buchhaltung nach einem Fehler aus.
    expect(belegNummer('', 2026, 1001)).toBe('2026-1001');
  });
});

describe('Die laufende Nummer überlebt einen Wechsel des Vorsatzes', () => {
  it('gelesen werden die Ziffern am Ende, nicht der Vorsatz', () => {
    /*
      DER FALL, UM DEN ES GEHT: ein Betrieb stellt im Juli von `RE-` auf `R-`
      um. Der Zahlenkreis ist lückenlos und steht in zwei Schreibweisen.
      Prüfte das Auslesen den Vorsatz mit, finge die Zählung wieder bei 1001
      an — und risse genau die Lücke, die niemand erklären will.
    */
    expect(lfdNummerVon('RE-2026-1042')).toBe(1042);
    expect(lfdNummerVon('R-2026-1043')).toBe(1043);
    expect(lfdNummerVon('2026-1044')).toBe(1044);
    expect(lfdNummerVon('ohne Zahl')).toBeNull();
  });

  it('die höchste über beide Schreibweisen hinweg', () => {
    expect(hoechsteLfd(['RE-2026-1041', 'R-2026-1042', undefined, ''])).toBe(1042);
    expect(hoechsteLfd([])).toBe(0);
  });
});

describe('Ein getippter Vorsatz wird geputzt, nicht abgewiesen', () => {
  it('Kleinbuchstaben werden gross', () => {
    expect(praefixPutzen('re')).toBe('RE');
  });

  it('eine eingefügte ganze Nummer wird auf den Vorsatz gekürzt', () => {
    // Wer „RE-2026-1001" aus der Zwischenablage einfügt, meint `RE`. Das als
    // Fehler abzuweisen wäre formal richtig und im Betrieb lästig.
    expect(praefixPutzen('RE-2026-1001')).toBe('RE');
    expect(praefixPutzen('2026-1001')).toBe('');
  });

  it('Leerzeichen und Umlaute fallen weg', () => {
    // Sie landen sonst im Dateinamen des PDFs und in der CSV.
    expect(praefixPutzen('R Ä')).toBe('R');
  });

  it('Trennstriche am Rand fallen weg, in der Mitte nicht', () => {
    expect(praefixPutzen('-RE-')).toBe('RE');
    expect(praefixPutzen('R-E')).toBe('R-E');
  });

  it('länger als sechs Zeichen wird gekürzt', () => {
    expect(praefixPutzen('ABCDEFGH')).toBe('ABCDEF');
  });
});

describe('Was die Prüfung abweist', () => {
  it('nimmt an, was geputzt wurde', () => {
    for (const w of ['RE', 'AN', 'B', '', 'R-E', 'ABCDEF']) {
      expect(praefixFehler(w)).toBeNull();
    }
  });

  it('weist ab, was in einen Dateinamen nicht gehört', () => {
    expect(praefixFehler('R E')).not.toBeNull();
    expect(praefixFehler('RÄ')).not.toBeNull();
    expect(praefixFehler('re')).not.toBeNull();
    expect(praefixFehler('ABCDEFG')).not.toBeNull();
  });
});

describe('Das Kennzeichen', () => {
  it('zieht den Vorsatz ab, wenn jemand das ganze Kennzeichen einfügt', () => {
    // Ohne diese Zeile stünde „WZ-WZ-12345A" im Zeiteintrag — und damit im
    // Lohnexport.
    expect(ohneKennzeichenVorsatz('WZ-12345A', 'WZ')).toBe('12345A');
    expect(ohneKennzeichenVorsatz('wz 12345a', 'WZ')).toBe('12345A');
    expect(ohneKennzeichenVorsatz('12345A', 'WZ')).toBe('12345A');
  });

  it('zieht NICHTS ab, wenn der Betrieb keinen Vorsatz führt', () => {
    /*
      Dann trägt das Feld das vollständige Kennzeichen — der richtige Zustand
      für einen Fuhrpark, der nicht aus einem Bezirk kommt. Würde hier
      trotzdem etwas abgezogen, verlöre jedes Kennzeichen seinen Anfang.
    */
    expect(ohneKennzeichenVorsatz('W-12345A', '')).toBe('W-12345A');
  });

  it('zieht den Vorsatz des EIGENEN Betriebs ab, nicht einen fremden', () => {
    // Ein Betrieb mit `GU` darf ein Kennzeichen, das zufällig mit W beginnt,
    // nicht verstümmelt bekommen.
    expect(ohneKennzeichenVorsatz('WZ-12345A', 'GU')).toBe('WZ-12345A');
    expect(ohneKennzeichenVorsatz('GU-123AB', 'GU')).toBe('123AB');
  });

  it('setzt ihn beim Speichern wieder davor — und lässt Leeres leer', () => {
    expect(mitKennzeichenVorsatz('12345A', 'WZ')).toBe('WZ-12345A');
    expect(mitKennzeichenVorsatz('W-12345A', '')).toBe('W-12345A');
    expect(mitKennzeichenVorsatz('', 'WZ')).toBe('');
    expect(mitKennzeichenVorsatz('   ', 'WZ')).toBe('');
  });

  it('Abziehen und Zurücksetzen heben einander auf', () => {
    // Die Eigenschaft, an der alles hängt: ein Kennzeichen, das durch die
    // Maske läuft, kommt unverändert wieder heraus.
    for (const vorsatz of ['WZ', 'GU', '']) {
      const voll = vorsatz ? `${vorsatz}-12345A` : 'W-12345A';
      expect(mitKennzeichenVorsatz(ohneKennzeichenVorsatz(voll, vorsatz), vorsatz)).toBe(voll);
    }
  });
});

describe('hoechsteLfdImJahr — nur Nummern im Schema des Jahres (Launch-Check, K6)', () => {
  it('überspringt „PR-187", das Vorjahr und fremde Nummern', async () => {
    const { hoechsteLfdImJahr } = await import('@/lib/praefixe');
    expect(hoechsteLfdImJahr(['PR-187', 'PR-2026-0003', 'B-2025-0900', '2026-0002', 'Bauträger 4711'], 2026)).toBe(3);
    expect(hoechsteLfdImJahr([], 2026)).toBe(0);
    expect(hoechsteLfdImJahr([undefined, 'PR-187'], 2026)).toBe(0);
  });
});
