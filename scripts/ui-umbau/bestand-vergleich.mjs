#!/usr/bin/env node
/**
 * Bestandsvergleich vorher/nachher (Umbau „Lot“, Abnahme 8.1 und 10).
 *
 *   node scripts/ui-umbau/bestand-vergleich.mjs [vorher.json] [nachher.json] [zuordnung.json] [--ohne=ueberschrift,abzeichen]
 *
 * Voreinstellung: `docs/ui-umbau/bestand-vorher.json`,
 * `docs/ui-umbau/bestand-nachher.json`, `docs/ui-umbau/zuordnung.json`.
 *
 * Gemeldet wird:
 *   1. jedes alte Element ohne Gegenstück und ohne Zuordnung — je Variante
 *      (Rolle samt Freigaben) und Breite. Gegenstück heisst: dieselbe Kennung
 *      in derselben Variante und Breite. Was vorher bei dieser Breite
 *      ausgeblendet war, zählt nicht — es war dort nicht erreichbar;
 *   2. Zuordnungen mit `weg_neu − weg_alt > 1` (Anhang 12.2), Zuordnungen
 *      ohne `neu`, und Zuordnungen, deren neues Element im Nachher-Bestand
 *      fehlt;
 *   3. Gegenstücke, deren Klickweg um mehr als einen Schritt länger wurde
 *      (gezählt wie in Anhang 12.1: Schritte nach dem Menüpunkt), die
 *      schlechter erreichbar wurden (aktiv → gesperrt oder ausgeblendet) oder
 *      einer Auswahl, der Einträge fehlen.
 *
 * Endet mit Code 1, sobald etwas offen ist — so taugt es als Abnahmeprüfung.
 */
import fs from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [VORHER = 'docs/ui-umbau/bestand-vorher.json', NACHHER = 'docs/ui-umbau/bestand-nachher.json', ZUORDNUNG = 'docs/ui-umbau/zuordnung.json'] = args;
const OHNE = new Set((process.argv.find((a) => a.startsWith('--ohne='))?.split('=')[1] ?? '').split(',').filter(Boolean));

const lies = (datei) => JSON.parse(fs.readFileSync(datei, 'utf8'));
const elemente = (datei) => {
  const d = lies(datei);
  return Array.isArray(d) ? d : d.elemente;
};

const vorher = elemente(VORHER).filter((e) => !OHNE.has(e.art));
const nachher = elemente(NACHHER);
const zuordnung = fs.existsSync(ZUORDNUNG) ? lies(ZUORDNUNG) : [];
const liste = Array.isArray(zuordnung) ? zuordnung : zuordnung.zuordnung ?? [];

const wo = (e) => `${e.variante ?? `${e.rolle}+${(e.freigaben ?? []).join(',')}`}|${e.breite}`;
const schluessel = (e) => `${wo(e)}|${e.id}`;
const weg = (e) => Math.max(0, (e.klickweg?.length ?? 1) - 1);
const RANG = { aktiv: 0, gesperrt: 1, ausgeblendet: 2 };

const neuNach = new Map(nachher.map((e) => [schluessel(e), e]));
const zuNach = new Map();
for (const z of liste) {
  if (!zuNach.has(z.alt)) zuNach.set(z.alt, []);
  zuNach.get(z.alt).push(z);
}

const ohne = [];
const schlechter = [];
const zuLang = [];
const auswahl = [];
for (const alt of vorher) {
  if (alt.zustand === 'ausgeblendet') continue;
  const neu = neuNach.get(schluessel(alt));
  if (neu) {
    if (weg(neu) - weg(alt) > 1) zuLang.push(`${alt.id} [${wo(alt)}]: Weg ${weg(alt)} → ${weg(neu)} (${neu.klickweg.join(' › ')})`);
    if (RANG[neu.zustand] > RANG[alt.zustand]) schlechter.push(`${alt.id} [${wo(alt)}]: ${alt.zustand} → ${neu.zustand}`);
    if (alt.optionen) {
      const fehlt = alt.optionen.filter((o) => !(neu.optionen ?? []).includes(o));
      if (fehlt.length) auswahl.push(`${alt.id} [${wo(alt)}]: fehlt ${fehlt.map((o) => `„${o}“`).join(', ')}`);
    }
    continue;
  }
  const zs = zuNach.get(alt.id) ?? [];
  // Eine Zuordnung zählt, wenn ihr neues Element in derselben Variante und Breite steht.
  const treffer = zs.find((z) => z.neu && neuNach.has(`${wo(alt)}|${z.neu}`));
  if (!treffer) ohne.push(alt);
}

const zuordnungsfehler = [];
for (const z of liste) {
  if (!z.neu) zuordnungsfehler.push(`${z.alt}: Zuordnung ohne „neu“ (Anhang 12.2: nicht zulässig)`);
  else if (!nachher.some((e) => e.id === z.neu)) zuordnungsfehler.push(`${z.alt} → ${z.neu}: das neue Element steht in keinem Nachher-Bestand`);
  if (typeof z.weg_alt === 'number' && typeof z.weg_neu === 'number' && z.weg_neu - z.weg_alt > 1) {
    zuordnungsfehler.push(`${z.alt} → ${z.neu}: Weg ${z.weg_alt} → ${z.weg_neu} (mehr als ein zusätzlicher Klick)`);
  }
}

// Gruppiert nach Kennung, damit dieselbe Lücke nicht 39-mal untereinander steht.
const gruppe = new Map();
for (const e of ohne) {
  if (!gruppe.has(e.id)) gruppe.set(e.id, { e, wo: [] });
  gruppe.get(e.id).wo.push(wo(e));
}

console.log(`Vorher:  ${vorher.length} Elemente (${VORHER})`);
console.log(`Nachher: ${nachher.length} Elemente (${NACHHER})`);
console.log(`Zuordnungen: ${liste.length} (${ZUORDNUNG})${OHNE.size ? ` · ohne Arten: ${[...OHNE].join(', ')}` : ''}\n`);

const abschnitt = (titel, zeilen) => {
  console.log(`## ${titel}: ${zeilen.length}`);
  for (const z of zeilen.slice(0, 400)) console.log(`  ${z}`);
  if (zeilen.length > 400) console.log(`  … und ${zeilen.length - 400} weitere`);
  console.log('');
};
abschnitt('Alte Elemente ohne Gegenstück und ohne Zuordnung (Kennungen)', [...gruppe.values()].map(
  ({ e, wo: w }) => `${e.id} · ${e.art} „${e.text || e.aria}“ · Weg ${e.klickweg.join(' › ')} · in ${w.length}: ${w.slice(0, 6).join(', ')}${w.length > 6 ? ' …' : ''}`,
));
abschnitt('Zuordnungen fehlerhaft oder mit mehr als einem zusätzlichen Klick', zuordnungsfehler);
abschnitt('Gegenstücke mit mehr als einem zusätzlichen Klick', zuLang);
abschnitt('Gegenstücke schlechter erreichbar (gesperrt oder ausgeblendet)', schlechter);
abschnitt('Auswahlfelder mit fehlenden Einträgen', auswahl);

const offen = ohne.length + zuordnungsfehler.length + zuLang.length + schlechter.length + auswahl.length;
console.log(offen ? `OFFEN: ${offen} Befunde (${ohne.length} Elemente ohne Zuordnung).` : 'Bestanden: jedes alte Element hat sein Gegenstück oder seine Zuordnung.');
process.exit(offen ? 1 : 0);
