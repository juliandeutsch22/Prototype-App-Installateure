#!/usr/bin/env node
/**
 * Erzeugt `docs/ui-umbau/zuordnung.json` (Anhang 12.2) aus den beiden
 * Beständen und den Handregeln (K4, 13.10.2026).
 *
 *   node scripts/ui-umbau/zuordnung-erzeugen.mjs [rest]
 *
 * Zugeordnet wird nur, was keine Kennung im Nachher hat (oder dort schlechter
 * erreichbar ist) — in derselben Variante und Breite:
 *
 *   1. VON HAND (`docs/ui-umbau/zuordnung-hand.json`): `alt` ist eine Kennung
 *      oder ein `/Ausdruck/`, `neu` eine Kennung oder `neuRe` ein Ausdruck.
 *      Gibt es mehrere Ziele, gewinnt das mit den meisten gleichen Wörtern,
 *      dann das mit dem ähnlicheren Klickweg. `gleich: "tag"` verlangt
 *      denselben Wochentag und Tag („Di 06.10.“ = „Di 6“). Jede Regel trägt
 *      ihre Begründung (`bemerkung`), nachgesehen im Code oder in der Vorschau.
 *   2. NACH REGEL: dieselbe Seite, dieselbe Beschriftung und dieselbe Sorte
 *      (Knopf/Verweis/Menüeintrag, Auswahl/Segment/Reiter, Kästchen, Feld,
 *      Anzeige); allgemeine Wörter („Speichern“, „Abbrechen“) nur, wo
 *      der letzte Schritt des Klickwegs derselbe ist.
 *
 * Was keine Zuordnung findet, steht mit `rest` am Ende — es bleibt für den
 * Vergleich offen (`bestand-vergleich.mjs`). Ein Eintrag ohne `neu` wird nie
 * geschrieben (Anhang 12.2).
 */
import fs from 'node:fs';

const V = JSON.parse(fs.readFileSync('docs/ui-umbau/bestand-vorher.json', 'utf8')).elemente;
const N = JSON.parse(fs.readFileSync('docs/ui-umbau/bestand-nachher.json', 'utf8')).elemente;
const HAND = JSON.parse(fs.readFileSync('docs/ui-umbau/zuordnung-hand.json', 'utf8'));

const wo = (e) => `${e.variante}|${e.breite}`;
const weg = (e) => Math.max(0, e.klickweg.length - 1);
const RANG = { aktiv: 0, gesperrt: 1, ausgeblendet: 2 };
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[„“"…?]/g, '').trim();
const txt = (e) => norm(e.text) || norm(e.aria);
const woerter = (e) => new Set(`${e.text} ${e.aria}`.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length > 2));
const gemeinsam = (a, b) => b.klickweg.filter((x) => a.klickweg.includes(x)).length;
const letzter = (e) => e.klickweg[e.klickweg.length - 1];
const tag = (e) => {
  const m = /\b(mo|di|mi|do|fr|sa|so)\.?,?\s+0?(\d{1,2})\b/i.exec(`${e.text} ${e.aria}`);
  return m ? `${m[1].toLowerCase()}${m[2]}` : null;
};

/*
  GLEICHE SORTE: aus einem Knopf darf ein Verweis oder Menüeintrag werden,
  aus einer Auswahl ein Segment, aus einer Überschrift eine Kennzahl — aus
  einem Kästchen aber kein Knopf mit demselben Namen (K4: „Franz
  Hinterleitner“ im Formular ist nicht „Franz Hinterleitner entfernen“).
*/
const SORTE = {
  knopf: 'tun', link: 'tun', menuepunkt: 'tun', menueeintrag: 'tun', aufklapper: 'tun',
  auswahl: 'waehlen', segment: 'waehlen', reiter: 'waehlen',
  checkbox: 'haken', schalter: 'haken', radio: 'haken',
  feld: 'feld', datei: 'datei',
};
const sorte = (art) => SORTE[art] ?? 'anzeige';
const ALLGEMEIN = /^(abbrechen|löschen|schließen|speichern|ok|ja|nein|zurück|weiter|bearbeiten|ändern|änderungen speichern)$/;

const nachKennung = new Map(N.map((e) => [`${wo(e)}|${e.id}`, e]));
const jeSeite = new Map();
for (const e of N) {
  if (e.zustand === 'ausgeblendet') continue;
  const k = `${wo(e)}|${e.seite}`;
  if (!jeSeite.has(k)) jeSeite.set(k, []);
  jeSeite.get(k).push(e);
}
const hand = HAND.map((h) => ({ ...h, re: h.alt.startsWith('/') ? new RegExp(h.alt.slice(1, -1)) : null }));
const varianten = new Set(N.map(wo));

const paare = new Map();
const rest = new Map();
const tragen = (a, n, art, bemerkung, optionen) => {
  const k = `${a.id}|${n.id}`;
  const p = paare.get(k) ?? { alt: a.id, neu: n.id, weg_alt: weg(a), weg_neu: weg(n), bemerkung, geprueft: true, art, ...(optionen ? { optionen } : {}) };
  // Je Paar der kürzeste alte und der längste neue Weg — so zählt der ungünstigste Fall.
  p.weg_alt = Math.min(p.weg_alt, weg(a));
  p.weg_neu = Math.max(p.weg_neu, weg(n));
  paare.set(k, p);
};

for (const a of V) {
  if (a.zustand === 'ausgeblendet' || !varianten.has(wo(a))) continue;
  const gleich = nachKennung.get(`${wo(a)}|${a.id}`);
  const h = hand.find((x) => (x.re ? x.re.test(a.id) : x.alt === a.id));
  if (gleich && RANG[gleich.zustand] <= RANG[a.zustand]) {
    // Dieselbe Kennung, aber umbenannte Einträge der Auswahl („Alle“ → „Jeder Stand“).
    if (h?.optionen && h.neu === a.id) tragen(a, gleich, 'von Hand', h.bemerkung, h.optionen);
    continue;
  }
  const seite = jeSeite.get(`${wo(a)}|${a.seite}`) ?? [];

  if (h) {
    const aw = woerter(a);
    const gleicheWoerter = (n) => [...woerter(n)].filter((w) => aw.has(w)).length;
    const ziel = seite
      .filter((n) => (h.neuRe ? new RegExp(h.neuRe).test(n.id) : n.id === h.neu))
      .filter((n) => h.gleich !== 'tag' || (tag(n) && tag(n) === tag(a)))
      .sort((x, y) => gleicheWoerter(y) - gleicheWoerter(x) || gemeinsam(a, y) - gemeinsam(a, x) || weg(x) - weg(y))[0];
    if (ziel) {
      tragen(a, ziel, 'von Hand', h.bemerkung, h.optionen);
      continue;
    }
  }

  const kandidaten = txt(a)
    ? seite
      .filter((n) => txt(n) === txt(a) && n.id !== a.id)
      .filter((n) => sorte(n.art) === sorte(a.art))
      .filter((n) => !ALLGEMEIN.test(txt(a)) || letzter(n) === letzter(a))
    : [];
  if (kandidaten.length) {
    // Eine Erklärung („i“) gehört bevorzugt zu ihrem Eintrag unter „Hilfe zu dieser Seite“.
    const hilfe = (n) => (a.art === 'info' && n.id.includes('.hilfe-zu-') ? 1 : 0);
    const ziel = kandidaten.sort((x, y) => (y.art === a.art) - (x.art === a.art) || hilfe(y) - hilfe(x) || gemeinsam(a, y) - gemeinsam(a, x) || weg(x) - weg(y))[0];
    tragen(a, ziel, 'Regel', ziel.art === a.art ? 'gleiche Seite, gleiche Beschriftung, neuer Ort' : `gleiche Seite, gleiche Beschriftung, jetzt ${ziel.art}`);
    continue;
  }
  const g = rest.get(a.id) ?? { a, n: 0 };
  g.n += 1;
  rest.set(a.id, g);
}

const liste = [...paare.values()].sort((x, y) => x.alt.localeCompare(y.alt) || x.neu.localeCompare(y.neu));
fs.writeFileSync('docs/ui-umbau/zuordnung.json', `${JSON.stringify(liste, null, 1)}\n`);
console.log(`Zuordnungen: ${liste.length} (Regel ${liste.filter((p) => p.art === 'Regel').length}, von Hand ${liste.filter((p) => p.art === 'von Hand').length}) · ohne Zuordnung: ${rest.size} Kennungen`);
if (process.argv[2] === 'rest') {
  for (const { a, n } of [...rest.values()].sort((x, y) => x.a.id.localeCompare(y.a.id))) {
    console.log(`  ${a.id} ×${n} ${a.art} „${(a.text || a.aria).slice(0, 60)}“ ⟨${a.klickweg.slice(1).join(' › ').slice(0, 70)}⟩`);
  }
}
