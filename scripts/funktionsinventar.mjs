#!/usr/bin/env node
/*
  FUNKTIONSINVENTAR (V10, 13.11.2026).

  Der Umbau auf die Designlinie V10 ändert die Gestalt jeder Seite, nicht
  ihren Funktionsumfang. Damit das nicht nur behauptet ist, liest dieses
  Skript aus dem Quelltext jede Bedienstelle:

    - Knöpfe (`Button`, `IconButton`, `button`) mit ihrem Text oder Namen,
    - Verweise (`KnopfLink`, `Link`, `NavLink`, `a`) mit Text und Ziel,
    - Menü- und Reitereinträge (Objekte mit `label` in einer Liste),
    - Beschriftungen von Feldern (`label`-Eigenschaft),
    - zugängliche Namen und Hinweise (`aria-label`, `title`),
    - Routen und Weiterleitungen (`Route path`, `Navigate to`).

  `node scripts/funktionsinventar.mjs` schreibt den Stand nach
  `docs/ui-umbau/v10-funktionsinventar.json`. Die Prüfung
  `tests/unit/funktionsinventar.test.ts` hält fest, dass jeder Eintrag des
  Stands vor dem Umbau noch vorhanden ist — oder mit Begründung in
  `docs/ui-umbau/v10-entfernt.json` steht. Gelesen wird nur Statisches;
  dynamische Texte stehen als `{…}`, damit der Eintrag nicht an Daten hängt.
*/
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WURZEL = process.cwd();
const ZIEL = process.argv[2] ?? 'docs/ui-umbau/v10-funktionsinventar-vorher.json';

function dateien(ordner) {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** Der statische Text eines Ausdrucks; Dynamisches als `{…}`. */
function text(knoten) {
  if (!knoten) return '';
  if (ts.isStringLiteral(knoten) || ts.isNoSubstitutionTemplateLiteral(knoten)) return knoten.text;
  if (ts.isTemplateExpression(knoten)) {
    return knoten.head.text + knoten.templateSpans.map((s) => `{…}${s.literal.text}`).join('');
  }
  if (ts.isJsxExpression(knoten)) return knoten.expression ? text(knoten.expression) : '';
  if (ts.isParenthesizedExpression(knoten)) return text(knoten.expression);
  if (ts.isConditionalExpression(knoten)) return `${text(knoten.whenTrue)}|${text(knoten.whenFalse)}`;
  return '{…}';
}

function kinderText(element) {
  if (!ts.isJsxElement(element)) return '';
  const teile = [];
  for (const k of element.children) {
    if (ts.isJsxText(k)) { const t = k.text.replace(/\s+/g, ' ').trim(); if (t) teile.push(t); }
    else if (ts.isJsxExpression(k) && k.expression) {
      const t = text(k.expression);
      if (t && t !== '{…}') teile.push(t); else if (t) teile.push('{…}');
    } else if (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k)) {
      const t = kinderText(k);
      if (t) teile.push(t);
    }
  }
  return teile.join(' ').replace(/\s+/g, ' ').replace(/(\{…\} ?)+/g, '{…} ').trim();
}

function attribute(oeffnend) {
  const a = {};
  for (const p of oeffnend.attributes.properties) {
    if (!ts.isJsxAttribute(p) || !p.name) continue;
    const name = p.name.getText();
    a[name] = p.initializer ? text(p.initializer) : 'true';
  }
  return a;
}

const KNOEPFE = new Set(['Button', 'IconButton', 'button']);
const VERWEISE = new Set(['KnopfLink', 'Link', 'NavLink', 'a']);

function inventar() {
  const eintraege = [];
  for (const pfad of dateien(join(WURZEL, 'src'))) {
    const datei = relative(WURZEL, pfad);
    const quelle = readFileSync(pfad, 'utf8');
    const sf = ts.createSourceFile(pfad, quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const neu = (art, inhalt, zusatz = '') => {
      const t = String(inhalt ?? '').trim();
      if (!t || t === '{…}') return;
      eintraege.push({ datei, art, text: t, ...(zusatz ? { ziel: zusatz } : {}) });
    };
    const besuche = (k) => {
      if (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k)) {
        const oeffnend = ts.isJsxElement(k) ? k.openingElement : k;
        const tag = oeffnend.tagName.getText();
        const a = attribute(oeffnend);
        const inhalt = kinderText(k);
        if (KNOEPFE.has(tag)) neu('knopf', a['aria-label'] || inhalt || a.title);
        if (VERWEISE.has(tag)) neu('verweis', a['aria-label'] || inhalt || a.title, a.to || a.href || '');
        if (tag === 'Route' && a.path) neu('route', a.path);
        if (tag === 'Navigate' && a.to) neu('weiterleitung', a.to);
        if (a.label && !KNOEPFE.has(tag) && !VERWEISE.has(tag)) neu('beschriftung', a.label, tag);
        if (a['aria-label'] && !KNOEPFE.has(tag) && !VERWEISE.has(tag)) neu('name', a['aria-label'], tag);
        if (a.title && !KNOEPFE.has(tag) && !VERWEISE.has(tag) && tag !== 'Card' && tag !== 'PageHeader') neu('hinweis', a.title, tag);
        if (tag === 'PageHeader' && a.title) neu('seite', a.title);
        if (tag === 'Card' && a.title) neu('blatt', a.title);
      }
      // Menü-, Reiter- und Auswahleinträge: Objekte mit `label` in einer Liste.
      if (ts.isObjectLiteralExpression(k) && ts.isArrayLiteralExpression(k.parent)) {
        const label = k.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'label');
        if (label && ts.isPropertyAssignment(label)) neu('eintrag', text(label.initializer));
      }
      ts.forEachChild(k, besuche);
    };
    besuche(sf);
  }
  const schluessel = (e) => `${e.datei}\u0000${e.art}\u0000${e.text}\u0000${e.ziel ?? ''}`;
  const einzeln = new Map();
  for (const e of eintraege) einzeln.set(schluessel(e), e);
  return [...einzeln.values()].sort((x, y) => schluessel(x).localeCompare(schluessel(y)));
}

export { inventar };

if (process.argv[1] && process.argv[1].endsWith('funktionsinventar.mjs')) {
  const liste = inventar();
  writeFileSync(join(WURZEL, ZIEL), `${JSON.stringify(liste, null, 1)}\n`);
  console.log(`${liste.length} Bedienstellen → ${ZIEL}`);
}
