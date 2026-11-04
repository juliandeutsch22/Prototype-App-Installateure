import { describe, it, expect } from 'vitest';
import {
  LEERER_BETREIBER, aenderungenText, betreiberAenderungen, neueVerarbeiter, offeneAngaben, standVon, textFehler, textZerlegen,
  type Betreiber, type TextInhalt,
} from '@/features/recht/rechtstext';

/**
 * Die Rechtstexte als Daten (E45): wie ein getippter Text gelesen wird, was
 * als offen gilt und was das Veröffentlichen aufhält.
 *
 * Gegenprobe: jede Prüfung hier hängt an `rechtstext.ts`; vor E45 gab es die
 * Datei nicht, und die Texte standen fest im Quelltext.
 */

const B: Betreiber = { ...LEERER_BETREIBER, name: 'Senklot Prüf GmbH', anschrift: 'Lotgasse 1\n1010 Wien', email: 'office@senklot.test' };

describe('Schreibweise', () => {
  it('Leerzeile trennt Absätze, ein Zeilenumbruch bleibt einer, „- “ macht eine Aufzählung', () => {
    expect(textZerlegen('Erste Zeile\nzweite Zeile\n\n- eins\n- zwei', B)).toEqual([
      { art: 'absatz', teile: [{ art: 'text', text: 'Erste Zeile' }, { art: 'umbruch' }, { art: 'text', text: 'zweite Zeile' }] },
      { art: 'liste', punkte: [[{ art: 'text', text: 'eins' }], [{ art: 'text', text: 'zwei' }]] },
    ]);
  });

  it('fett und Verweise — nur https:, mailto: und tel:; alles andere bleibt Text', () => {
    const [absatz] = textZerlegen('**fett** [Gesetz](https://www.ris.bka.gv.at) [x](javascript:alert(1)) [Mail](mailto:a@b.at)', B);
    expect(absatz).toEqual({
      art: 'absatz',
      teile: [
        { art: 'fett', teile: [{ art: 'text', text: 'fett' }] },
        { art: 'text', text: ' ' },
        { art: 'verweis', text: 'Gesetz', ziel: 'https://www.ris.bka.gv.at' },
        { art: 'text', text: ' [x](javascript:alert(1)) ' },
        { art: 'verweis', text: 'Mail', ziel: 'mailto:a@b.at' },
      ],
    });
  });

  it('Markup bleibt Text — es gibt kein Stück, das HTML trüge', () => {
    const bloecke = textZerlegen('<img src=x onerror=alert(1)> <script>x</script>', B);
    expect(bloecke).toEqual([{ art: 'absatz', teile: [{ art: 'text', text: '<img src=x onerror=alert(1)> <script>x</script>' }] }]);
  });

  it('Platzhalter setzen die Betreiberangaben ein: die Anschrift allein in der Zeile untereinander, im Satz mit Komma', () => {
    expect(textZerlegen('{Anschrift}', B)).toEqual([{ art: 'absatz', teile: [
      { art: 'angabe', text: 'Lotgasse 1', leer: false }, { art: 'umbruch' }, { art: 'angabe', text: '1010 Wien', leer: false },
    ] }]);
    expect(textZerlegen('Betreiber: {Name}, {Anschrift}.', B)).toEqual([{ art: 'absatz', teile: [
      { art: 'text', text: 'Betreiber: ' }, { art: 'angabe', text: 'Senklot Prüf GmbH', leer: false }, { art: 'text', text: ', ' },
      { art: 'angabe', text: 'Lotgasse 1, 1010 Wien', leer: false }, { art: 'text', text: '.' },
    ] }]);
  });

  it('ein leeres Feld steht wie bisher in eckigen Klammern da; ein unbekannter Platzhalter bleibt, wie er getippt ist', () => {
    expect(textZerlegen('Telefon: {Telefon} {Nmae}', B)).toEqual([{ art: 'absatz', teile: [
      { art: 'text', text: 'Telefon: ' }, { art: 'angabe', text: '[Telefonnummer — wird ergänzt]', leer: true }, { art: 'text', text: ' {Nmae}' },
    ] }]);
  });

  it('eine Zeile mit nur {Unterauftragsverarbeiter} setzt die Liste ein', () => {
    expect(textZerlegen('Davor:\n\n{Unterauftragsverarbeiter}\n\nDanach.', B).map((b) => b.art)).toEqual(['absatz', 'verarbeiter', 'absatz']);
  });
});

describe('Offen und fehlerhaft', () => {
  const text = (t: string, verarbeiter?: TextInhalt['verarbeiter']): TextInhalt => ({ abschnitte: [{ titel: 'A', text: t }], ...(verarbeiter ? { verarbeiter } : {}) });

  it('offen ist ein leeres Feld, das der Text benutzt, und jede eckige Klammer „— wird ergänzt]“', () => {
    expect(offeneAngaben(text('{Name} {Telefon} [Standort — wird ergänzt]'), B)).toEqual(['[Standort — wird ergänzt]', '[Telefonnummer — wird ergänzt]']);
    expect(offeneAngaben(text('{Name}', [{ wer: '[Mailanbieter — wird ergänzt]', wofuer: 'x', wo: 'y' }]), B)).toEqual(['[Mailanbieter — wird ergänzt]']);
    // Gegenprobe: ein Feld, das der Text nicht benutzt, ist nicht offen.
    expect(offeneAngaben(text('{Name}, {E-Mail}'), B)).toEqual([]);
  });

  it('bemängelt vertippte Platzhalter, fremde Verweise, fehlende Überschriften und die Liste am falschen Ort', () => {
    expect(textFehler('impressum', text('{Nmae} [x](http://a.at)'))).toEqual([
      'Abschnitt 1 („A“): {Nmae} ist kein bekannter Platzhalter.',
      'Abschnitt 1 („A“): der Verweis „x“ führt nicht auf https:, mailto: oder tel:.',
    ]);
    expect(textFehler('impressum', text('{Unterauftragsverarbeiter}'))).toContain('Abschnitt 1 („A“): {Unterauftragsverarbeiter} ist kein bekannter Platzhalter.');
    expect(textFehler('datenschutz', text('ohne Liste', []))).toEqual(['Die Liste der Unterauftragsverarbeiter steht nirgends — {Unterauftragsverarbeiter} fehlt im Text.']);
    expect(textFehler('datenschutz', text('Liste: {Unterauftragsverarbeiter}', []))).toContain('Abschnitt 1 („A“): {Unterauftragsverarbeiter} steht allein in einer Zeile.');
    expect(textFehler('datenschutz', text('{Unterauftragsverarbeiter}', [{ wer: 'X', wofuer: 'a', wo: 'b' }, { wer: 'X', wofuer: '', wo: 'b' }]))).toEqual([
      'Unterauftragsverarbeiter 2: Anbieter, Zweck und Standort ausfüllen.',
      'Ein Unterauftragsverarbeiter steht doppelt in der Liste.',
    ]);
    expect(textFehler('impressum', { abschnitte: [{ titel: ' ', text: '' }] })).toEqual(['Abschnitt 1: die Überschrift fehlt.', 'Abschnitt 1: der Text fehlt.']);
    // Gegenprobe: ein richtiger Text hat keinen Fehler.
    expect(textFehler('datenschutz', text('{Name}\n\n{Unterauftragsverarbeiter}', [{ wer: 'X', wofuer: 'a', wo: 'b' }]))).toEqual([]);
  });
});

describe('Vergleich mit der geltenden Fassung', () => {
  const alt: TextInhalt = { abschnitte: [{ titel: 'A', text: '1' }, { titel: 'B', text: '2' }], verarbeiter: [{ wer: 'X', wofuer: 'a', wo: 'b' }, { wer: 'Y', wofuer: 'a', wo: 'b' }] };

  it('nennt geänderte, neue und weggefallene Abschnitte und Unterauftragsverarbeiter — wie die Datenbank', () => {
    const neu: TextInhalt = { abschnitte: [{ titel: 'A', text: '1*' }, { titel: 'C', text: '3' }], verarbeiter: [{ wer: 'X', wofuer: 'a', wo: 'c' }, { wer: 'Z', wofuer: 'a', wo: 'b' }] };
    expect(aenderungenText(alt, neu)).toEqual([
      'Geändert: „A“.', 'Neuer Abschnitt: „C“.', 'Entfällt: „B“.',
      'Neue Unterauftragsverarbeiter: Z.', 'Nicht mehr eingesetzt: Y.', 'Zweck oder Standort geändert: X.',
    ]);
    expect(neueVerarbeiter(neu.verarbeiter!, alt.verarbeiter!)).toEqual(['Z']);
  });

  it('sagt es, wenn sich nur die Reihenfolge oder gar nichts ändert', () => {
    expect(aenderungenText(alt, { ...alt, abschnitte: [...alt.abschnitte].reverse() })).toEqual(['Die Reihenfolge der Abschnitte ändert sich.']);
    expect(aenderungenText(alt, alt)).toEqual(['Inhaltlich gleich wie die geltende Fassung.']);
    expect(aenderungenText(undefined, alt)).toEqual(['Erste Fassung.']);
    expect(betreiberAenderungen(LEERER_BETREIBER, B)).toEqual(['Geändert: Name bzw. Firma, Anschrift, E-Mail-Adresse.']);
  });

  it('der Stand einer Seite ist die jüngere von Text und Betreiberangaben', () => {
    const f = (t: string) => ({ nummer: 1, inhalt: null, veroeffentlichtAm: t, geprueft: false, hinweisen: false, neueVerarbeiter: [] });
    expect(standVon(f('2026-10-05T10:00:00+00:00'), f('2026-11-04T16:00:00+00:00'))).toBe('2026-11-04T16:00:00+00:00');
    expect(standVon(f('2026-11-04T16:00:00+00:00'), f('2026-10-05T10:00:00+00:00'))).toBe('2026-11-04T16:00:00+00:00');
    expect(standVon(f('2026-10-05T10:00:00+00:00'))).toBe('2026-10-05T10:00:00+00:00');
  });
});
