/**
 * Das „i" braucht eine Zeile, die umbricht.
 *
 * `InfoHint` stellt seinen Text mit `basis-full` in eine eigene Zeile — das
 * geht nur, wenn der umgebende Behälter `flex-wrap` trägt (siehe
 * `InfoHint.tsx`). Fehlt es, quetscht sich der aufgeklappte Text als schmale
 * Spalte NEBEN die Beschriftung: gemeldet am 24.09.2026 mit einem
 * Bildschirmfoto vom Betriebsurlaub, wo er ein Wort je Zeile zeigte. Dieselbe
 * Falle stand an drei weiteren Stellen.
 *
 * Geprüft wird am Syntaxbaum, nicht mit einem Textmuster: der Elternteil ist
 * das JSX-Element, das `<InfoHint>` unmittelbar enthält.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : n.endsWith('.tsx') ? [p] : [];
  });
}

function klassen(el: ts.JsxOpeningLikeElement): string {
  for (const a of el.attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== 'className' || !a.initializer) continue;
    if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
    // Vorlagen mit Einschüben: der feste Teil reicht für die Frage.
    return a.initializer.getText();
  }
  return '';
}

function istNamens(el: ts.JsxOpeningLikeElement, name: string): boolean {
  return el.tagName.getText() === name;
}

function funde(datei: string): string[] {
  const text = readFileSync(datei, 'utf8');
  const quelle = ts.createSourceFile(datei, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const raus: string[] = [];
  const besuche = (knoten: ts.Node) => {
    if (ts.isJsxElement(knoten)) {
      const kinder = knoten.children.filter((k) => ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k));
      const hatInfo = kinder.some((k) =>
        istNamens(ts.isJsxElement(k) ? k.openingElement : (k as ts.JsxSelfClosingElement), 'InfoHint'),
      );
      if (hatInfo) {
        const c = klassen(knoten.openingElement);
        const flexZeile = /(^|[\s"'`])flex([\s"'`]|$)/.test(c) && !/flex-wrap|flex-col/.test(c);
        if (flexZeile) {
          const zeile = quelle.getLineAndCharacterOfPosition(knoten.getStart()).line + 1;
          raus.push(`${datei}:${zeile}`);
        }
      }
    }
    ts.forEachChild(knoten, besuche);
  };
  besuche(quelle);
  return raus;
}

describe('„i" in einer Zeile', () => {
  it('steht nie in einer Flex-Zeile ohne Umbruch', () => {
    expect(dateien('src').flatMap(funde)).toEqual([]);
  });
});
