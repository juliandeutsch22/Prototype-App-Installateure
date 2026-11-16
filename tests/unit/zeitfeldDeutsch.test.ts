/** U10, E5: Datum und Uhrzeit deutsch neben dem Feld des Geräts. */
import { describe, it, expect } from 'vitest';
import { geraetZeigtDeutsch, istZeitfeld, zeitfeldDeutsch } from '@/lib/zeitfeldDeutsch';
import { attribut, elemente, ort, tagName, tsxDateien } from './bedienregelnQuelle';

describe('zeitfeldDeutsch', () => {
  it('Datum TT.MM.JJJJ, Uhrzeit HH:MM, beides zusammen, Monat MM.JJJJ', () => {
    expect(zeitfeldDeutsch('2026-11-15', 'date')).toBe('15.11.2026');
    expect(zeitfeldDeutsch('07:00', 'time')).toBe('07:00');
    expect(zeitfeldDeutsch('19:30:00', 'time')).toBe('19:30');
    expect(zeitfeldDeutsch('2026-11-15T07:05', 'datetime-local')).toBe('15.11.2026, 07:05');
    expect(zeitfeldDeutsch('2026-11', 'month')).toBe('11.2026');
  });
  it('leer oder unlesbar: nichts — es wird nichts geraten', () => {
    expect(zeitfeldDeutsch('', 'date')).toBe('');
    expect(zeitfeldDeutsch('15.11.2026', 'date')).toBe('');
    expect(zeitfeldDeutsch('7 Uhr', 'time')).toBe('');
  });
  it('nur Datums- und Zeitfelder', () => {
    expect(istZeitfeld('date')).toBe(true);
    expect(istZeitfeld('datetime-local')).toBe(true);
    expect(istZeitfeld('text')).toBe(false);
    expect(istZeitfeld(undefined)).toBe(false);
  });
  it('ein deutsches Gerät zeichnet selbst deutsch — dort keine zweite Zeile', () => {
    expect(geraetZeigtDeutsch('date', 'de-AT')).toBe(true);
    expect(geraetZeigtDeutsch('time', 'de')).toBe(true);
    expect(geraetZeigtDeutsch('datetime-local', 'de-CH')).toBe(true);
    expect(geraetZeigtDeutsch('date', 'en-US')).toBe(false);
    expect(geraetZeigtDeutsch('time', 'en-US')).toBe(false);
  });
  it('nach dem Format gefragt: Großbritannien zeichnet die Uhrzeit wie wir, das Datum nicht', () => {
    expect(geraetZeigtDeutsch('time', 'en-GB')).toBe(true);
    expect(geraetZeigtDeutsch('date', 'en-GB')).toBe(false);
    expect(geraetZeigtDeutsch('datetime-local', 'en-GB')).toBe(false);
  });
});


/** Datums- und Zeitfelder, die nicht über `InputField` laufen — dort fehlte die deutsche Zeile. */
function rohZeitfelder(datei: string, text?: string): string[] {
  return elemente(datei, text).filter((e) => {
    const t = attribut(e, 'type');
    return tagName(e) === 'input' && !!t && t !== true && /['"](date|time|datetime-local|month)['"]/.test(t.getText());
  }).map(ort);
}

describe('U10 · ein Baustein für Datum und Uhrzeit', () => {
  it('jedes Datums- und Zeitfeld läuft über InputField', () => {
    expect(tsxDateien().filter((d) => !d.startsWith('src/components/Field.tsx')).flatMap((d) => rohZeitfelder(d))).toEqual([]);
  }, 60_000);
  it('Gegenprobe: ein rohes Datumsfeld fiele auf', () => {
    expect(rohZeitfelder('alt.tsx', `export const X = () => <input type="date" value={v} />;`)).toHaveLength(1);
  });
});
