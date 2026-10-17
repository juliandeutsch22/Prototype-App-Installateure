/**
 * Der Bestandsvergleich vorher/nachher (`scripts/ui-umbau/bestand-vergleich.mjs`,
 * Stand 18, K4).
 *
 * Er ist die Abnahmeprüfung des Umbaus: endet er mit 0, hat jedes alte
 * Element sein Gegenstück oder seine Zuordnung. Was er durchlässt, prüft
 * niemand mehr von Hand — deshalb hier jede Regel mit ihrer Gegenprobe.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SKRIPT = resolve(process.cwd(), 'scripts/ui-umbau/bestand-vergleich.mjs');

interface E {
  id: string;
  seite?: string;
  text?: string;
  variante?: string;
  breite?: number;
  zustand?: 'aktiv' | 'gesperrt' | 'ausgeblendet';
  klickweg?: string[];
  optionen?: string[];
}
const el = (e: E) => ({ variante: 'gf', breite: 390, zustand: 'aktiv', klickweg: ['Seite'], art: 'knopf', text: e.id, seite: '/s', ...e });

function vergleich(vorher: E[], nachher: E[], zuordnung: object[] = []) {
  const ort = mkdtempSync(join(tmpdir(), 'bestand-'));
  writeFileSync(join(ort, 'v.json'), JSON.stringify({ elemente: vorher.map(el) }));
  writeFileSync(join(ort, 'n.json'), JSON.stringify({ elemente: nachher.map(el) }));
  writeFileSync(join(ort, 'z.json'), JSON.stringify(zuordnung));
  const r = spawnSync(process.execPath, [SKRIPT, join(ort, 'v.json'), join(ort, 'n.json'), join(ort, 'z.json')], { encoding: 'utf8' });
  return { code: r.status, text: r.stdout };
}

describe('Bestandsvergleich', () => {
  it('gleich geblieben: dasselbe Element am selben Ort besteht, ein fehlendes nicht', () => {
    expect(vergleich([{ id: 'a' }], [{ id: 'a' }]).code).toBe(0);
    const r = vergleich([{ id: 'a' }], [{ id: 'b' }]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('ohne Gegenstück und ohne Zuordnung (Kennungen): 1');
  });

  it('dieselbe Kennung ausgeblendet, aber zugeordnet an einen sichtbaren Ort: besteht', () => {
    const vorher = [{ id: 'huelle.link.impressum' }];
    const nachher = [
      { id: 'huelle.link.impressum', zustand: 'ausgeblendet' as const },
      { id: 'huelle.profil.link.impressum', klickweg: ['Hülle', 'Profil öffnen'] },
    ];
    // Gegenprobe: ohne Zuordnung bleibt es „schlechter erreichbar“.
    const ohne = vergleich(vorher, nachher);
    expect(ohne.code).toBe(1);
    expect(ohne.text).toContain('schlechter erreichbar (gesperrt oder ausgeblendet): 1');
    expect(vergleich(vorher, nachher, [{ alt: 'huelle.link.impressum', neu: 'huelle.profil.link.impressum' }]).code).toBe(0);
  });

  it('eine Zuordnung auf ein ebenfalls ausgeblendetes Element hilft nicht', () => {
    const r = vergleich(
      [{ id: 'x' }],
      [{ id: 'x', zustand: 'ausgeblendet' }, { id: 'y', zustand: 'ausgeblendet' }],
      [{ alt: 'x', neu: 'y' }],
    );
    expect(r.code).toBe(1);
    expect(r.text).toContain('schlechter erreichbar (gesperrt oder ausgeblendet): 1');
  });

  it('der Weg einer Zuordnung zählt aus dem Bestand: ein Klick mehr besteht, zwei nicht', () => {
    const vorher = [{ id: 'alt', klickweg: ['Rechnungen', 'Konditionen'] }];
    const zu = [{ alt: 'alt', neu: 'neu' }];
    expect(vergleich(vorher, [{ id: 'neu', klickweg: ['Rechnungen', 'Neue Rechnung', 'Konditionen'] }], zu).code).toBe(0);
    const r = vergleich(vorher, [{ id: 'neu', klickweg: ['Rechnungen', 'Neue Rechnung', 'Mehr', 'Konditionen'] }], zu);
    expect(r.code).toBe(1);
    expect(r.text).toContain('alt → neu [gf|390]: Weg 1 → 3');
  });

  it('umbenannte Einträge einer Auswahl gelten mit Zuordnung, fehlende nicht', () => {
    const vorher = [{ id: 'filter', optionen: ['Alle', 'Offen'] }];
    const nachher = [{ id: 'filter', optionen: ['Jeder Stand', 'Offen'] }];
    // Gegenprobe: ohne die Umbenennung fehlt „Alle“.
    expect(vergleich(vorher, nachher).text).toContain('fehlt „Alle“');
    expect(vergleich(vorher, nachher, [{ alt: 'filter', neu: 'filter', optionen: { Alle: 'Jeder Stand' } }]).code).toBe(0);
    // Eine Umbenennung auf etwas, das es nicht gibt, deckt nichts.
    expect(vergleich(vorher, nachher, [{ alt: 'filter', neu: 'filter', optionen: { Alle: 'Sämtliche' } }]).code).toBe(1);
  });

  it('aus einer Auswahl wurden Segmente: jeder Eintrag muss als Segment derselben Seite dastehen', () => {
    const vorher = [{ id: 'filter', seite: '/b', optionen: ['Aktiv & pausiert', 'Alle'] }];
    const zu = [{ alt: 'filter', neu: 'segment.laufend', optionen: { 'Aktiv & pausiert': 'Laufend' } }];
    const beide = [{ id: 'segment.laufend', seite: '/b', text: 'Laufend' }, { id: 'segment.alle', seite: '/b', text: 'Alle' }];
    expect(vergleich(vorher, beide, zu).code).toBe(0);
    // Gegenprobe: fehlt das Segment „Alle“, fehlt der Eintrag.
    const r = vergleich(vorher, [beide[0]], zu);
    expect(r.code).toBe(1);
    expect(r.text).toContain('fehlt „Alle“');
    // Und ein Segment auf einer anderen Seite zählt nicht.
    expect(vergleich(vorher, [beide[0], { ...beide[1], seite: '/andere' }], zu).code).toBe(1);
  });

  it('die Zuordnung zählt nur in derselben Variante und Breite', () => {
    const r = vergleich([{ id: 'a', breite: 390 }], [{ id: 'b', breite: 1440 }], [{ alt: 'a', neu: 'b' }]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('ohne Gegenstück und ohne Zuordnung (Kennungen): 1');
  });
});
