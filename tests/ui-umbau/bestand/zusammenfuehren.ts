/**
 * Führt die Teilergebnisse der Bestandsaufnahme zu EINER Datei zusammen:
 * `docs/ui-umbau/bestand-<quelle>.json` (globalTeardown von
 * `playwright.bestand.config.ts`).
 *
 * Teile, die in diesem Lauf nicht neu entstanden sind, bleiben aus einem
 * früheren Lauf stehen — so lässt sich eine einzelne Variante nachholen
 * (`BESTAND_NUR=lehrling`), ohne alles neu aufzunehmen.
 *
 * SORTIERT UND EINE ZEILE JE ELEMENT: zwei Aufnahmen desselben Stands ergeben
 * dieselbe Datei, und ein Unterschied steht im Diff als einzelne Zeile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { QUELLE, TEILE, VARIANTEN, BREITEN, UHR } from './varianten';
import type { Element } from './sammler';

interface Teil {
  variante: string;
  breite: number;
  seiten: Array<{ seite: string; pfad: string; elemente: number; befund?: string }>;
  elemente: Element[];
}

export default async function zusammenfuehren(): Promise<void> {
  if (!fs.existsSync(TEILE)) return;
  const teile: Teil[] = fs.readdirSync(TEILE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(TEILE, f), 'utf8')) as Teil);
  if (!teile.length) return;

  const reihe = new Map(VARIANTEN.map((v, i) => [v.schluessel, i]));
  teile.sort((a, b) => (reihe.get(a.variante)! - reihe.get(b.variante)!) || a.breite - b.breite);

  const fehlend: string[] = [];
  for (const v of VARIANTEN) {
    for (const { breite } of BREITEN) {
      if (!teile.some((t) => t.variante === v.schluessel && t.breite === breite)) fehlend.push(`${v.schluessel}:${breite}`);
    }
  }

  const elemente = teile.flatMap((t) =>
    [...t.elemente].sort((a, b) => a.seite.localeCompare(b.seite) || a.id.localeCompare(b.id)),
  );
  const kopf = {
    quelle: QUELLE,
    uhr: UHR,
    format: 'docs/ui-umbau/protokoll.md, Anhang 12.1; weg = klickweg.length - 1',
    varianten: VARIANTEN.map(({ schluessel, rolle, freigaben, parameter }) => ({ schluessel, rolle, freigaben, parameter })),
    fehlend,
    aufnahmen: teile.map((t) => ({ variante: t.variante, breite: t.breite, elemente: t.elemente.length, seiten: t.seiten })),
  };

  const zeilen = [
    '{',
    `"kopf": ${JSON.stringify(kopf)},`,
    '"elemente": [',
    elemente.map((e) => JSON.stringify(e)).join(',\n'),
    ']',
    '}',
  ];
  const ziel = path.resolve('docs/ui-umbau', `bestand-${QUELLE}.json`);
  fs.writeFileSync(ziel, `${zeilen.join('\n')}\n`);
  console.log(`Bestand ${QUELLE}: ${elemente.length} Elemente aus ${teile.length} Aufnahmen → ${ziel}`);
  if (fehlend.length) console.log(`  fehlend: ${fehlend.join(', ')}`);
}
