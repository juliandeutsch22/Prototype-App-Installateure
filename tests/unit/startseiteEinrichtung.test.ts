import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOECHSTENS_KENNZAHLEN,
  KENNZAHL_NAMEN,
  KENNZAHLEN_VORGABE,
  THEMEN,
  ausgeblendetText,
  geltendeKennzahlen,
  waehlbareKennzahlen,
} from '@/features/dashboard/start/einrichtung';

/*
 * DIE STARTSEITE SELBST EINRICHTEN (E68) — wer was wählen kann.
 * Gewählt wird nur, WAS dasteht, nie, ob jemand etwas sehen darf.
 */
const alles = () => true;

describe('Wählbare Kennzahlen', () => {
  it('nur, was Rolle und Module erlauben', () => {
    expect(waehlbareKennzahlen({ zeitkonto: true, lager: false, geld: false, baustellen: false, darf: alles })).toEqual(['saldo', 'urlaub']);
    expect(waehlbareKennzahlen({ zeitkonto: false, lager: true, geld: true, baustellen: true, darf: alles }))
      .toEqual(['anf', 'knapp', 'offen', 'ueberfaellig', 'bezahlt', 'baustellen', 'auslastung']);
  });

  it('eine Zielseite, die die Rolle nicht sehen darf, nimmt ihre Kennzahl mit', () => {
    const ohneUrlaub = (ziel: string) => !ziel.startsWith('/vacations');
    expect(waehlbareKennzahlen({ zeitkonto: true, lager: false, geld: false, baustellen: false, darf: ohneUrlaub })).toEqual(['saldo']);
    const ohneRechnungen = (ziel: string) => !ziel.startsWith('/invoices');
    expect(waehlbareKennzahlen({ zeitkonto: false, lager: false, geld: true, baustellen: false, darf: ohneRechnungen })).toEqual([]);
  });

  it('jede Kennzahl hat einen Namen, jede Vorgabe ist bekannt und höchstens vier lang', () => {
    for (const [rolle, liste] of Object.entries(KENNZAHLEN_VORGABE)) {
      expect(liste.length, rolle).toBeLessThanOrEqual(HOECHSTENS_KENNZAHLEN);
      for (const k of liste) expect(KENNZAHL_NAMEN[k], `${rolle}: ${k}`).toBeTruthy();
    }
  });
});

describe('Geltende Kennzahlen', () => {
  it('ohne Wahl die Vorgabe der Rolle', () => {
    expect(geltendeKennzahlen('monteur', null)).toEqual(['saldo', 'urlaub']);
    expect(geltendeKennzahlen('leitung', { aus: ['eil'] })).toEqual(['offen', 'ueberfaellig', 'baustellen']);
  });

  it('die eigene Wahl: Unbekanntes und Doppeltes heraus, höchstens vier', () => {
    expect(geltendeKennzahlen('leitung', { kennzahlen: ['bezahlt', 'gibts-nicht', 'bezahlt', 'offen', 'saldo', 'urlaub', 'anf'] }))
      .toEqual(['bezahlt', 'offen', 'saldo', 'urlaub']);
    // Eine leere Wahl ist eine Wahl: keine Zahlen.
    expect(geltendeKennzahlen('monteur', { kennzahlen: [] })).toEqual([]);
  });
});

describe('Ausgeblendet', () => {
  it('nennt Themen und — wo es mehr sind — die Einträge', () => {
    expect(ausgeblendetText(1, 1, true)).toBe('Ausgeblendet: 1 Thema');
    expect(ausgeblendetText(2, 5, false)).toBe('Ausgeblendet: 2 Themen mit 5 Einträgen');
    expect(ausgeblendetText(2, 2, false)).toBe('Ausgeblendet: 2 Themen');
  });
});

/*
 * DER KATALOG UND DER AUFBAU BLEIBEN GLEICH. Ein neues Thema in `aufbau.ts`
 * oder `regeln.ts`, das im Katalog fehlt, ließe sich nicht ausblenden — und
 * niemand merkte es. Gelesen wird der Quelltext: jedes Thema der Leitung
 * (`key: '…', wann:`) und jeder Abschnitt (`abschnitt('…'`) muss vorkommen.
 */
describe('Katalog der Themen', () => {
  const quelle = (datei: string) => readFileSync(join(__dirname, '../../src/features/dashboard/start', datei), 'utf8');
  const aufbau = quelle('aufbau.ts');
  const regeln = quelle('regeln.ts');
  const leitung = new Set(THEMEN.leitung.map((t) => t.key));
  const andere = new Set((['monteur', 'verwaltung', 'buchhaltung', 'projektleitung'] as const).flatMap((r) => THEMEN[r].map((t) => t.key)));

  it('jedes Thema der Leitung steht im Katalog', () => {
    const keys = [...aufbau.slice(aufbau.indexOf('function leitung(')).matchAll(/key: '([a-z0-9-]+)', wann:/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !leitung.has(k))).toEqual([]);
    // Die Zeilen, die als Thema übernommen werden (Nachrichten, Meldungen, Eingang, nicht verrechnete Scheine und Stunden).
    for (const k of ['nachrichten', 'nachricht-meldungen', 'eingaenge', 'scheine', 'stunden']) expect(leitung.has(k), k).toBe(true);
  });

  /*
    DIE ÜBERNOMMENEN ZEILEN DER LEITUNG (Prüfbericht 09.11.2026): eine Zeile
    aus `regeln.ts`, die die Leitung als Thema übernimmt (`themen.push(wenn(z.to,
    { key: z.key …`), trägt ihren Schlüssel dort — der Abgleich oben sieht
    ihn nicht. „Scheine“ und „Stunden“ fehlten so im Katalog.
  */
  it('jede übernommene Zeile der Leitung steht im Katalog', () => {
    const teil = aufbau.slice(aufbau.indexOf('function leitung('));
    const uebernommen = [...teil.matchAll(/for \(const z of \[([^\]]+)\]\)/g)]
      .flatMap((m) => [...m[1].matchAll(/(\w+Zeile)\(/g)].map((x) => x[1]));
    expect(uebernommen.length).toBeGreaterThan(3);
    for (const fn of uebernommen) {
      const rumpf = `${regeln}\n${aufbau}`.slice(`${regeln}\n${aufbau}`.indexOf(`function ${fn}(`));
      const key = /key: '([a-z0-9-]+)'/.exec(rumpf)?.[1];
      expect(key, fn).toBeTruthy();
      expect(leitung.has(key!), `${fn}: ${key}`).toBe(true);
    }
  });

  it('jeder Abschnitt der übrigen Rollen steht im Katalog', () => {
    const keys = [...`${aufbau}\n${regeln}`.matchAll(/abschnitt\('([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !andere.has(k))).toEqual([]);
  });

  it('jeder Schlüssel ist ein kurzes Wort, wie die Datenbank es annimmt', () => {
    for (const liste of Object.values(THEMEN)) for (const t of liste) expect(t.key).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});
