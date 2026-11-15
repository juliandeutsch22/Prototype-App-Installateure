/**
 * DIE BEDIENREGELN DER DURCHSICHT (15.11.2026) IM QUELLTEXT.
 *
 * Die Regeln stehen in `docs/design/v10/style.md` („Hauptaktion, Neu und
 * Fenster“) und als Bausteine in `src/components/` (`Speicherleiste`,
 * `Fensteraktionen`, `NeuFormular`, `AktenKopf`). Diese Wächter halten
 * sie fest, damit keine neue Seite sie unterläuft — gelesen wird der Baum der
 * Oberfläche (`bedienregelnQuelle.ts`), nicht ein Suchmuster.
 *
 * Jede Regel hat ihre Gegenprobe: ein Stück Quelltext in der alten Form, das
 * die Regel finden muss.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { attribut, baum, elemente, ergebnisse, hatKlasse, ort, tagName, tsxDateien } from './bedienregelnQuelle';

type Element = ts.JsxElement | ts.JsxSelfClosingElement;
const istElement = (n: ts.Node): n is Element => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);

/* ── U1: eine Hauptaktion, keine Gruppe ─────────────────────────────────── */

/** Was einem Seitenkopf als Hauptaktion übergeben wird und kein einzelner Knopf ist. */
function gruppenAlsHauptaktion(datei: string, text?: string): string[] {
  return elemente(datei, text).flatMap((e) => {
    const t = tagName(e);
    if (t !== 'PageHeader' && t !== 'AktenKopf' && t !== 'PlanungsSeitenkopf') return [];
    return ['action', 'nebenAktion'].flatMap((name) => {
      const wert = attribut(e, name);
      if (!wert || wert === true) return [];
      return ergebnisse(wert).filter((r) => {
        if (ts.isJsxFragment(r)) return true;
        // Ein kleingeschriebenes Element (div, span) ist eine Gruppe um Knöpfe, kein Knopf.
        return istElement(r) && /^[a-z]/.test(tagName(r));
      }).map((r) => `${ort(r)}: ${name}={${r.getText().slice(0, 60).replace(/\s+/g, ' ')}…}`);
    });
  });
}

describe('U1 · Muster 1 und 2: eine kompakte Hauptaktion', () => {
  it('kein Seitenkopf bekommt eine Gruppe oder ein Fragment als Hauptaktion', () => {
    expect(tsxDateien().flatMap((d) => gruppenAlsHauptaktion(d))).toEqual([]);
  });

  it('die Gruppe `.akten-aktionen`, die Knöpfe am Handy zu Balken streckte, gibt es nicht mehr', () => {
    const funde = tsxDateien().flatMap((d) => elemente(d).filter((e) => hatKlasse(e, 'akten-aktionen')).map(ort));
    expect(funde).toEqual([]);
    for (const css of ['src/styles/lot-akten.css', 'src/index.css', 'src/styles/lot.css']) {
      expect(readFileSync(css, 'utf8')).not.toMatch(/\.akten-aktionen\b/);
    }
  });

  it('Gegenprobe: die alte Gruppe der Baustellenakte fiele auf', () => {
    const alt = `export const X = () => <AktenKopf title="B" zurueck="/" zurueckText="z" action={darf && <div className="akten-aktionen"><Button>Einsatz planen</Button><Button variant="secondary">Bearbeiten</Button></div>} />;`;
    expect(gruppenAlsHauptaktion('alt.tsx', alt)).toHaveLength(1);
    const fragment = `export const X = () => <PageHeader title="B" action={<><Button>A</Button><Button>B</Button></>} />;`;
    expect(gruppenAlsHauptaktion('alt.tsx', fragment)).toHaveLength(1);
    // Bleibt erlaubt: getrennte Zweige mit je einem Knopf.
    const zweige = `export const X = () => <PageHeader title="B" action={a ? <KnopfLink to="/">A</KnopfLink> : b ? <Button>B</Button> : null} />;`;
    expect(gruppenAlsHauptaktion('neu.tsx', zweige)).toEqual([]);
  });
});

/* ── U1: Muster 3, die Speicherleiste auf Einstellungsseiten ───────────── */

/** Die Ansichten unter /settings/* aus App.tsx — samt den Karten, die sie aus ihrem Ordner holen. */
function einstellungsDateien(): string[] {
  const app = readFileSync('src/app/App.tsx', 'utf8');
  const block = app.slice(app.indexOf('path="/settings/*"'), app.indexOf('/* Buchhaltung */'));
  const namen = [...block.matchAll(/:\s*<(\w+)/g)].map((m) => m[1]);
  const pfadVon = (quelle: string, imp: string): string | null => {
    const roh = imp.startsWith('@/') ? join('src', imp.slice(2)) : imp.startsWith('.') ? join(dirname(quelle), imp) : null;
    if (!roh) return null;
    return [`${roh}.tsx`, `${roh}/index.tsx`].find((p) => existsSync(p)) ?? null;
  };
  const ansichten = namen.map((n) => {
    // Die Ansichten laden nach (`ansicht('/settings', () => import('…'))`); ein fester Import ginge ebenso.
    const m = app.match(new RegExp(`import ${n} from '([^']+)'`)) ?? app.match(new RegExp(`const ${n} = \\w+\\([^)]*\\(\\) => import\\('([^']+)'\\)`));
    return m ? pfadVon('src/app/App.tsx', m[1]) : null;
  }).filter((p): p is string => !!p);
  const alle = new Set(ansichten);
  for (const a of ansichten) {
    const text = readFileSync(a, 'utf8');
    for (const m of text.matchAll(/import \w+(?:, \{[^}]*\})? from '([^']+)'/g)) {
      const p = pfadVon(a, m[1]);
      // Nur Karten derselben Seite: gemeinsame Bausteine prüfen ihre eigenen Wächter.
      if (p && dirname(p) === dirname(a)) alle.add(p);
    }
  }
  return [...alle].sort();
}

const FENSTER = new Set(['BottomSheet', 'ConfirmDialog', 'AktenBearbeiten', 'NeuFormular', 'Speicherleiste', 'Fensteraktionen']);

/** Knöpfe, die „… speichern“ heißen und nicht in der Speicherleiste oder einem Fenster stehen. */
function speichernImFluss(datei: string, text?: string): string[] {
  return elemente(datei, text).filter((e) => tagName(e) === 'Button').filter((e) => {
    const beschriftung = ts.isJsxElement(e) ? e.children.map((k) => k.getText()).join(' ') : '';
    if (!/speichern/i.test(beschriftung)) return false;
    for (let n: ts.Node | undefined = e.parent; n; n = n.parent) {
      if (istElement(n) && FENSTER.has(tagName(n))) return false;
    }
    return true;
  }).map((e) => `${ort(e)}: ${e.getText().slice(0, 70).replace(/\s+/g, ' ')}`);
}

describe('U1 · Muster 3: Formular und Einstellung speichern über die Speicherleiste', () => {
  const dateien = einstellungsDateien();

  it('die Einstellungsseiten sind gefunden — die Prüfung hat etwas zu prüfen', () => {
    expect(dateien).toEqual(expect.arrayContaining([
      'src/features/settings/SettingsView.tsx',
      'src/features/settings/FirmendatenView.tsx',
      'src/features/settings/LohnregelnKarte.tsx',
      'src/features/papierkorb/PapierkorbFristKarte.tsx',
      'src/features/modules/ModulesView.tsx',
    ]));
  });

  it('kein „… speichern“ im Fluss einer Einstellungsseite', () => {
    expect(dateien.flatMap((d) => speichernImFluss(d))).toEqual([]);
  });

  it('die Speicherleiste erscheint erst bei einer Änderung — `geaendert` ist Pflicht und wird ausgewertet', () => {
    const quelle = readFileSync('src/components/Speicherleiste.tsx', 'utf8');
    expect(quelle).toMatch(/geaendert: boolean;/);
    expect(quelle).toContain('if (!geaendert && !speichert && !gespeichert) return null;');
  });

  it('Gegenprobe: das alte „Sätze speichern“ im Fluss fiele auf, in der Leiste oder im Fenster nicht', () => {
    const alt = `export const X = () => <form><div className="fuss-aktionen"><Button type="submit">Sätze speichern</Button></div></form>;`;
    expect(speichernImFluss('alt.tsx', alt)).toHaveLength(1);
    const fenster = `export const X = () => <BottomSheet open label="x" onClose={z}><Button>Speichern</Button></BottomSheet>;`;
    expect(speichernImFluss('neu.tsx', fenster)).toEqual([]);
  });

  it('die Einstellungsseiten nehmen die Speicherleiste', () => {
    const mit = dateien.filter((d) => readFileSync(d, 'utf8').includes('<Speicherleiste'));
    expect(mit.length).toBeGreaterThanOrEqual(12);
  });

  it('nur ein Satz geht durch alle: der Baum ist lesbar (Parser-Fehler fielen hier auf)', () => {
    // `parseDiagnostics` ist intern, aber der einzige Weg, Syntaxfehler ohne Programm zu sehen.
    for (const d of dateien) expect((baum(d) as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []).toEqual([]);
  });
});
