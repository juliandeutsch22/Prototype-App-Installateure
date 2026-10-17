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
 *   3. Gegenstücke und zugeordnete Elemente, deren Klickweg um mehr als
 *      einen Schritt länger wurde (gezählt wie in Anhang 12.1: Schritte nach
 *      dem Menüpunkt), die schlechter erreichbar wurden (aktiv → gesperrt
 *      oder ausgeblendet) oder einer Auswahl, der Einträge fehlen.
 *
 * Eine Zuordnung kann auch ein Gegenstück ersetzen, das dieselbe Kennung
 * trägt, aber ausgeblendet ist (das Element steht jetzt an anderer Stelle),
 * und sie kann umbenannte Einträge einer Auswahl nennen:
 * `{ "alt": …, "neu": …, "optionen": { "Alle": "Jeder Stand" } }`. Ist aus
 * der Auswahl etwas anderes geworden (Segmente, Reiter), zählt ein Eintrag,
 * wenn ein Element mit seinem Text auf derselben Seite steht.
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

/** Das neue Element einer Zuordnung in derselben Variante und Breite — das am besten erreichbare. */
const zugeordnet = (alt) => (zuNach.get(alt.id) ?? [])
  .filter((z) => z.neu)
  .map((z) => ({ z, e: neuNach.get(`${wo(alt)}|${z.neu}`) }))
  .filter((t) => t.e)
  .sort((a, b) => RANG[a.e.zustand] - RANG[b.e.zustand] || weg(a.e) - weg(b.e))[0];

for (const alt of vorher) {
  if (alt.zustand === 'ausgeblendet') continue;
  const gleich = neuNach.get(schluessel(alt));
  const t = zugeordnet(alt);
  /*
    DIESELBE KENNUNG, ABER SCHLECHTER ERREICHBAR, zählt als zugeordnet, wenn
    eine Zuordnung auf ein Element zeigt, das so gut erreichbar ist wie das
    alte — etwa „Impressum“, am Tablet seit „Lot“ im Profil statt offen in
    der Leiste; die ausgeblendete Fassung derselben Kennung bleibt im DOM.
  */
  const ersetzt = gleich && t && RANG[gleich.zustand] > RANG[alt.zustand] && RANG[t.e.zustand] <= RANG[alt.zustand];
  const neu = gleich && !ersetzt ? gleich : t?.e;
  if (!neu) {
    ohne.push(alt);
    continue;
  }
  // Auch für Zugeordnetes gilt der Weg aus dem Bestand, nicht nur die Zahl in der Zuordnung.
  if (weg(neu) - weg(alt) > 1) zuLang.push(`${alt.id}${neu === gleich ? '' : ` → ${neu.id}`} [${wo(alt)}]: Weg ${weg(alt)} → ${weg(neu)} (${neu.klickweg.join(' › ')})`);
  if (RANG[neu.zustand] > RANG[alt.zustand]) schlechter.push(`${alt.id}${neu === gleich ? '' : ` → ${neu.id}`} [${wo(alt)}]: ${alt.zustand} → ${neu.zustand}`);
  if (alt.optionen) {
    // Umbenannte Einträge („Alle“ → „Jeder Stand“) stehen in der Zuordnung unter `optionen`.
    const umbenannt = Object.assign({}, ...(zuNach.get(alt.id) ?? []).map((z) => z.optionen ?? {}));
    // Aus einer Auswahl können Segmente oder Reiter derselben Seite geworden sein.
    const daneben = new Set(nachher.filter((e) => wo(e) === wo(alt) && e.seite === neu.seite && e.zustand !== 'ausgeblendet').map((e) => e.text));
    const fehlt = alt.optionen.filter((o) => {
      const soll = umbenannt[o] ?? o;
      return !(neu.optionen ?? []).includes(soll) && !(neu !== gleich && daneben.has(soll));
    });
    if (fehlt.length) auswahl.push(`${alt.id} [${wo(alt)}]: fehlt ${fehlt.map((o) => `„${o}“`).join(', ')}`);
  }
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
