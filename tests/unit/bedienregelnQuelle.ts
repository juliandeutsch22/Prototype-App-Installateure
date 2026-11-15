/**
 * DIE BEDIENREGELN AM QUELLTEXT LESEN (U1–U4, U6, Durchsicht 15.11.2026).
 *
 * Die Wächter in `bedienregeln.test.ts` prüfen nicht Klassen per Suchmuster,
 * sondern den Baum der Oberfläche: welche Knöpfe in einer Knopfreihe stehen,
 * was einem Seitenkopf als Hauptaktion übergeben wird. Ein Suchmuster sah
 * dabei zu wenig — eine Bedingung `a ? <Knopf/> : <Knopf/>` sind zwei Knöpfe
 * im Text, aber nur einer auf dem Bildschirm. Deshalb der Parser von
 * TypeScript: getrennte Zweige zählen einzeln (das Größere gilt), `a && b`
 * zählt `b`, ein Fragment zählt seinen Inhalt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export function tsxDateien(ordner = 'src'): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return tsxDateien(pfad);
    return pfad.endsWith('.tsx') ? [pfad] : [];
  });
}

const baeume = new Map<string, ts.SourceFile>();
export function baum(datei: string, text?: string): ts.SourceFile {
  if (text !== undefined) return ts.createSourceFile(datei, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let b = baeume.get(datei);
  if (!b) {
    b = ts.createSourceFile(datei, readFileSync(datei, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    baeume.set(datei, b);
  }
  return b;
}

type Element = ts.JsxElement | ts.JsxSelfClosingElement;

export function tagName(e: Element): string {
  const t = ts.isJsxElement(e) ? e.openingElement.tagName : e.tagName;
  return t.getText();
}

function attribute(e: Element): ts.JsxAttributes {
  return ts.isJsxElement(e) ? e.openingElement.attributes : e.attributes;
}

/** Der Wert eines Attributs als Text (Zeichenkette) oder der Ausdruck. */
export function attribut(e: Element, name: string): ts.JsxAttributeValue | true | undefined {
  for (const a of attribute(e).properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a.initializer ?? true;
  }
  return undefined;
}

function textVon(v: ts.JsxAttributeValue | true | undefined): string | undefined {
  if (!v || v === true) return undefined;
  if (ts.isStringLiteral(v)) return v.text;
  if (ts.isJsxExpression(v) && v.expression && ts.isStringLiteralLike(v.expression)) return v.expression.text;
  return undefined;
}

/** Alle JSX-Elemente einer Datei. */
export function elemente(datei: string, text?: string): Element[] {
  const funde: Element[] = [];
  const gehen = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) funde.push(n);
    ts.forEachChild(n, gehen);
  };
  gehen(baum(datei, text));
  return funde;
}

/** Hat das Element diese Klasse (auch in einer Vorlage `…${x}…`)? */
export function hatKlasse(e: Element, klasse: string): boolean {
  const v = attribut(e, 'className');
  if (!v || v === true) return false;
  const roh = v.getText();
  return new RegExp(`(^|[\\s'"\`{])${klasse}($|[\\s'"\`}])`).test(roh);
}

export type Zaehlung = { knoepfe: number; primaer: number; gefahr: number };
const NULL: Zaehlung = { knoepfe: 0, primaer: 0, gefahr: 0 };
const plus = (a: Zaehlung, b: Zaehlung): Zaehlung => ({ knoepfe: a.knoepfe + b.knoepfe, primaer: a.primaer + b.primaer, gefahr: a.gefahr + b.gefahr });
const max = (a: Zaehlung, b: Zaehlung): Zaehlung => ({ knoepfe: Math.max(a.knoepfe, b.knoepfe), primaer: Math.max(a.primaer, b.primaer), gefahr: Math.max(a.gefahr, b.gefahr) });

/** Knöpfe, die als eigene Gestalt in einer Reihe stehen. */
const KNOPF = new Set(['Button', 'KnopfLink']);

function knopf(e: Element): Zaehlung {
  const variante = textVon(attribut(e, 'variant'));
  const v = attribut(e, 'variant');
  // Ein berechneter Rang (`variant={x ? 'primary' : 'secondary'}`) kann gefüllt sein.
  const vielleichtPrimaer = v !== undefined && v !== true && !variante && /'primary'/.test(v.getText());
  const primaer = v === undefined || variante === 'primary' || vielleichtPrimaer;
  return { knoepfe: 1, primaer: primaer ? 1 : 0, gefahr: variante === 'danger' ? 1 : 0 };
}

/**
 * Was eine Stelle im Baum an Knöpfen beiträgt — ohne in Knöpfe, Menüs oder
 * fremde Bausteine hineinzusehen (die zählen nicht als Knopf der Reihe).
 */
export function zaehle(n: ts.Node | undefined): Zaehlung {
  if (!n) return NULL;
  if (ts.isParenthesizedExpression(n)) return zaehle(n.expression);
  if (ts.isJsxExpression(n)) return zaehle(n.expression);
  if (ts.isConditionalExpression(n)) return max(zaehle(n.whenTrue), zaehle(n.whenFalse));
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return zaehle(n.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return max(zaehle(n.left), zaehle(n.right));
    return NULL;
  }
  if (ts.isJsxFragment(n)) return n.children.reduce((s, k) => plus(s, zaehle(k)), NULL);
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
    if (KNOPF.has(tagName(n))) return knopf(n);
    return NULL;
  }
  return NULL;
}

/** Die Knöpfe, die als Kinder in genau diesem Element nebeneinander stehen. */
export function reihe(e: Element): Zaehlung {
  if (!ts.isJsxElement(e)) return NULL;
  return e.children.reduce((s, k) => plus(s, zaehle(k)), NULL);
}

export function ort(e: ts.Node): string {
  const q = e.getSourceFile();
  const { line } = q.getLineAndCharacterOfPosition(e.getStart());
  return `${q.fileName}:${line + 1}`;
}

/**
 * Die möglichen Ergebnisse eines Ausdrucks — je Zweig einer Bedingung eines.
 * Eine Variable wird über ihre Deklaration in derselben Datei aufgelöst.
 */
export function ergebnisse(n: ts.Node | undefined, tiefe = 0): ts.Node[] {
  if (!n || tiefe > 6) return [];
  if (ts.isParenthesizedExpression(n) || ts.isJsxExpression(n)) return ergebnisse(n.expression, tiefe);
  if (ts.isConditionalExpression(n)) return [...ergebnisse(n.whenTrue, tiefe), ...ergebnisse(n.whenFalse, tiefe)];
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return ergebnisse(n.right, tiefe);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...ergebnisse(n.left, tiefe), ...ergebnisse(n.right, tiefe)];
  }
  if (ts.isIdentifier(n)) {
    if (n.text === 'undefined') return [];
    const decl = deklaration(n);
    // Eine Prop, die durchgereicht wird, prüft die Stelle, die sie setzt.
    return decl ? ergebnisse(decl, tiefe + 1) : [];
  }
  if (n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.FalseKeyword) return [];
  return [n];
}

function deklaration(id: ts.Identifier): ts.Expression | undefined {
  let fund: ts.Expression | undefined;
  const gehen = (n: ts.Node) => {
    if (fund) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id.text && n.initializer) fund = n.initializer;
    ts.forEachChild(n, gehen);
  };
  gehen(id.getSourceFile());
  return fund;
}

/**
 * U6: Kästchen, deren Änderung sofort schreibt — im `onChange` ein `await`,
 * ein `void …(…)` oder der Aufruf einer `async`-Funktion derselben Datei.
 */
function asyncFunktionen(q: ts.SourceFile): Set<string> {
  const namen = new Set<string>();
  const gehen = (n: ts.Node) => {
    const istAsync = (m?: ts.NodeArray<ts.ModifierLike>) => !!m?.some((x) => x.kind === ts.SyntaxKind.AsyncKeyword);
    if (ts.isFunctionDeclaration(n) && n.name && istAsync(n.modifiers)) namen.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && istAsync(n.initializer.modifiers)) namen.add(n.name.text);
    ts.forEachChild(n, gehen);
  };
  gehen(q);
  return namen;
}

export function sofortKaestchen(datei: string, text?: string): string[] {
  const q = baum(datei, text);
  const async = asyncFunktionen(q);
  return elemente(datei, text).filter((e) => {
    const t = tagName(e);
    const typ = attribut(e, 'type');
    const kaestchen = t === 'CheckboxField' || (t === 'input' && !!typ && typ !== true && /checkbox/.test(typ.getText()));
    if (!kaestchen) return false;
    const oc = attribut(e, 'onChange');
    if (!oc || oc === true) return false;
    let sofort = false;
    const gehen = (n: ts.Node) => {
      if (ts.isAwaitExpression(n) || (ts.isVoidExpression(n) && ts.isCallExpression(n.expression))) sofort = true;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && async.has(n.expression.text)) sofort = true;
      if (ts.isIdentifier(n) && async.has(n.text) && ts.isJsxExpression(n.parent)) sofort = true;
      ts.forEachChild(n, gehen);
    };
    gehen(oc);
    return sofort;
  }).map(ort);
}

