import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

/**
 * Der Leistungswächter (Plan 15.11.2026, L11): jeder Bau misst, was vor dem
 * ersten Bild übers Netz muss, wie viele Bausteine es gibt und was jede
 * Ansicht beim ersten Öffnen dazuholt — und scheitert über dem Budget in
 * `leistungsbudget.json`. Der Bau läuft in der CI im Durchklick (Inhaltsregel)
 * und vor jeder Auslieferung; dort wirkt der Wächter.
 *
 * Gegenprobe: ohne `leistungswaechter()` in `vite.config.ts` ist „hängt am
 * Bau“ rot; mit überschrittenem Budget scheitert der Bau (unten nachgestellt).
 */

// Über einen Pfad in einer Variablen, wie in `sicherheitsKopfzeilen.test.ts`:
// mit Endung, damit eine liegengebliebene `vite.config.js` (bis 15.11.2026 legte `tsc -b` sie ab) nicht vorgeht.
// Die Formen stehen hier noch einmal: `vite.config.ts` gehört nicht zum Typprogramm der Tests.
interface Baustein {
  datei: string;
  inhalt: string | Uint8Array;
  statisch: string[];
  dynamisch: string[];
  einstieg: boolean;
  modul: string | null;
  module?: string[];
  css: string[];
}
interface Leistungsbudget {
  vorErstemBildKB: number;
  einstiegKB: number;
  bausteine: number;
  groessterBausteinKB: number;
  aufAbruf: string[];
  jeAnsichtKB: number;
  jeAnsichtDateien: number;
  importierenEinstieg: number;
}
interface Messung {
  startDateien: string[];
  vorErstemBildKB: number;
  importierenEinstieg: number;
  ansichten: { modul: string; datei: string; kb: number; dateien: number }[];
  fehlend: string[];
}
const configPfad = '../../vite.config.ts';
const vite = (await import(/* @vite-ignore */ configPfad)) as {
  default: { plugins: Plugin[] };
  leistungMessen: (b: Baustein[], stile: Record<string, string>, pflicht?: string[]) => Messung;
  leistungPruefen: (m: Messung, budget: Leistungsbudget, b: Baustein[]) => string[];
};
const { leistungMessen, leistungPruefen } = vite;

/** Inhalt, der sich kaum packen lässt — damit die Größen messbar auseinanderliegen. */
function zufall(bytes: number, saat: number): string {
  let x = saat;
  let s = '';
  while (s.length < bytes) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += x.toString(36);
  }
  return s.slice(0, bytes);
}

const b = (datei: string, bytes: number, teile: Partial<Baustein> = {}): Baustein => ({
  datei,
  inhalt: zufall(bytes, datei.length * 31 + bytes),
  statisch: [],
  dynamisch: [],
  einstieg: false,
  modul: null,
  css: [],
  ...teile,
});

/*
  Ein kleiner Bau: Einstieg → kern (fest), Stile; auf Abruf zwei Ansichten,
  die eine mit einer nachgeladenen Komponente und einem PDF-Baustein.
*/
const bau: Baustein[] = [
  b('index.js', 20_000, { einstieg: true, statisch: ['kern.js'], dynamisch: ['kunden.js', 'rechnung.js'], css: ['index.css'], modul: 'src/main.tsx' }),
  b('kern.js', 10_000, { modul: null }),
  b('kunden.js', 4_000, { statisch: ['kern.js', 'liste.js'], modul: 'src/features/customers/CustomersView.tsx' }),
  b('liste.js', 2_000),
  b('rechnung.js', 1_000, { statisch: ['kern.js'], dynamisch: ['verwaltung.js', 'pdf.js'], modul: 'src/features/invoices/RechnungenSeite.tsx' }),
  b('verwaltung.js', 8_000, { statisch: ['liste.js'], modul: 'src/features/invoices/InvoicesView.tsx' }),
  b('pdf.js', 30_000, { statisch: ['jspdf.js'], modul: 'src/features/invoices/pdf.ts' }),
  b('jspdf.js', 60_000),
];
const stile = { 'index.css': zufall(5_000, 7) };

const grosszuegig: Leistungsbudget = {
  vorErstemBildKB: 1000, einstiegKB: 1000, bausteine: 100, groessterBausteinKB: 1000,
  aufAbruf: ['jspdf'], jeAnsichtKB: 1000, jeAnsichtDateien: 100, importierenEinstieg: 100,
};

describe('Leistungswächter: messen', () => {
  const m = leistungMessen(bau, stile);

  it('vor dem ersten Bild zählen Einstieg, seine festen Bausteine und Stile — nichts auf Abruf', () => {
    expect(m.startDateien).toEqual(['index.css', 'index.js', 'kern.js']);
    const gz = (t: string) => gzipSync(t, { level: 9 }).length;
    const erwartet = gz(stile['index.css']) + gz(bau[0].inhalt as string) + gz(bau[1].inhalt as string);
    expect(m.vorErstemBildKB).toBe(Math.round((erwartet / 1024) * 10) / 10);
  });

  it('je Ansicht zählt, was sie über den Start hinaus fest einbindet', () => {
    const kunden = m.ansichten.find((a) => a.datei === 'kunden.js')!;
    // kunden.js + liste.js; kern.js liegt schon seit dem Start.
    expect(kunden.dateien).toBe(2);
  });

  it('eine nachgeladene Komponente ist eine eigene Ansicht, nachgeladenes Rechnen (PDF) nicht', () => {
    expect(m.ansichten.map((a) => a.datei).sort()).toEqual(['kunden.js', 'rechnung.js', 'verwaltung.js']);
    // Die Rechnungsseite selbst holt nur sich: das PDF kommt erst auf einen Knopf.
    expect(m.ansichten.find((a) => a.datei === 'rechnung.js')!.dateien).toBe(1);
  });

  it('zählt, wer den Einstieg fest einbindet', () => {
    expect(m.importierenEinstieg).toBe(0);
    const mitRueckgriff = bau.map((x) => (x.datei === 'liste.js' ? { ...x, statisch: ['index.js'] } : x));
    expect(leistungMessen(mitRueckgriff, stile).importierenEinstieg).toBe(1);
  });
});

describe('Leistungswächter: prüfen', () => {
  const m = leistungMessen(bau, stile);

  it('im Budget: keine Meldung (Gegenprobe zu unten)', () => {
    expect(leistungPruefen(m, grosszuegig, bau)).toEqual([]);
  });

  it('über dem Budget: je Grenze ein Satz mit Ist und Grenze', () => {
    const fehler = leistungPruefen(m, { ...grosszuegig, vorErstemBildKB: 10, bausteine: 3, jeAnsichtDateien: 1 }, bau);
    expect(fehler).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Vor dem ersten Bild \(gepackt\): [\d.]+ KB statt höchstens 10 KB$/),
        'JavaScript-Bausteine: 8 Stück statt höchstens 3 Stück',
        'Ansicht src/features/customers/CustomersView.tsx holt dazu: 2 Dateien statt höchstens 1 Dateien',
      ]),
    );
  });

  it('Bibliotheken auf Abruf zählen nicht als größter Baustein — alle anderen schon', () => {
    expect(leistungPruefen(m, { ...grosszuegig, groessterBausteinKB: 15 }, bau)).toEqual([
      expect.stringMatching(/^Größter Baustein \(pdf\.js\): /),
    ]);
    expect(leistungPruefen(m, { ...grosszuegig, groessterBausteinKB: 15, aufAbruf: [] }, bau)).toEqual([
      expect.stringMatching(/^Größter Baustein \(jspdf\.js\): /),
    ]);
  });
});

describe('Leistungswächter: hängt am Bau', () => {
  const plugin = vite.default.plugins.find((p) => p && (p as Plugin).name === 'leistungswaechter') as Plugin | undefined;

  it('ist in vite.config.ts eingehängt, nur für den Bau', () => {
    expect(plugin).toBeDefined();
    expect(plugin!.apply).toBe('build');
  });

  it('ein Bau über dem Budget scheitert mit den Verstößen', () => {
    const budget = JSON.parse(readFileSync(join(__dirname, '../../leistungsbudget.json'), 'utf8')) as Leistungsbudget;
    const bundle: Record<string, unknown> = {
      'assets/index.js': { type: 'chunk', fileName: 'assets/index.js', code: zufall(2_000, 1), imports: [], dynamicImports: [], isEntry: true, facadeModuleId: null },
    };
    // Mehr Bausteine, als das Budget erlaubt.
    for (let i = 0; i <= budget.bausteine; i++) {
      bundle[`assets/teil-${i}.js`] = { type: 'chunk', fileName: `assets/teil-${i}.js`, code: 'export{}', imports: [], dynamicImports: [], isEntry: false, facadeModuleId: null };
    }
    const zeilen: string[] = [];
    (plugin!.configResolved as (c: unknown) => void)({ logger: { info: (t: string) => zeilen.push(t) } });
    const kontext = { error: (t: string) => { throw new Error(t); } };
    const bauen = () => ((plugin!.generateBundle as { handler: (this: unknown, o: unknown, b: unknown) => void }).handler).call(kontext, {}, bundle);
    expect(bauen).toThrow(/Leistungsbudget überschritten[\s\S]*JavaScript-Bausteine/);
    expect(zeilen[0]).toMatch(/^Leistung: vor dem ersten Bild/);
  });

  it('das Budget nennt jede Grenze als Zahl', () => {
    const budget = JSON.parse(readFileSync(join(__dirname, '../../leistungsbudget.json'), 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys(grosszuegig).filter((k) => k !== 'aufAbruf')) {
      expect(typeof budget[k], k).toBe('number');
    }
    expect(Array.isArray(budget.aufAbruf)).toBe(true);
  });
});

/*
  DER BLINDE FLECK (Nacharbeit 10b, 15.11.2026). Importiert ein nachgeladenes
  Fenster aus dem Baustein seiner Ansicht, ist dieser keine Fassade mehr
  (`modul` leer) — der Wächter erkannte die Ansicht nicht und ließ sie still
  aus (so geschehen mit der Rechnungsansicht und der E-Rechnung). Jetzt misst
  er jede Pflicht-Ansicht über den Baustein, in dem ihr Code liegt, und wird
  rot, wenn er sie nirgends findet.
  Gegenprobe: mit dem alten Wächter fehlt die Ansicht in der Messung, und
  ein Bau ohne sie bleibt grün.
*/
describe('Leistungswächter: jede Ansicht wird gemessen', () => {
  const RECHNUNG = 'src/features/invoices/InvoicesView.tsx';
  const FENSTER = 'src/features/invoices/EbInterfaceDialog.tsx';
  const ohneFassade: Baustein[] = [
    b('index.js', 20_000, { einstieg: true, statisch: ['kern.js'], dynamisch: ['rechnung.js'], modul: 'src/main.tsx' }),
    b('kern.js', 10_000),
    b('rechnung.js', 1_000, { statisch: ['kern.js'], dynamisch: ['verwaltung.js'], modul: 'src/features/invoices/RechnungenSeite.tsx' }),
    // Die Ansicht: keine Fassade mehr, weil das Fenster aus ihr importiert.
    b('verwaltung.js', 8_000, { statisch: ['liste.js'], dynamisch: ['fenster.js'], modul: null, module: [RECHNUNG, 'src/features/invoices/ebinterface.ts'] }),
    b('fenster.js', 2_000, { statisch: ['verwaltung.js'], modul: FENSTER }),
    b('liste.js', 2_000),
  ];

  it('heute: ohne Pflichtliste fällt die Ansicht still heraus (der Fleck, nachgestellt)', () => {
    expect(leistungMessen(ohneFassade, {}).ansichten.map((a) => a.modul)).not.toContain(RECHNUNG);
  });

  it('mit Pflichtliste wird sie über ihren Code gefunden und mit allem gemessen, was sie fest einbindet', () => {
    const m = leistungMessen(ohneFassade, {}, ['src/features/invoices/RechnungenSeite.tsx', RECHNUNG, FENSTER]);
    const rechnung = m.ansichten.find((a) => a.modul === RECHNUNG)!;
    expect(rechnung.datei).toBe('verwaltung.js');
    expect(rechnung.dateien).toBe(2);
    expect(m.fehlend).toEqual([]);
  });

  it('findet er eine Pflicht-Ansicht in keinem Baustein, ist der Bau rot', () => {
    const m = leistungMessen(ohneFassade, {}, ['src/features/fehlt/FehltView.tsx']);
    expect(m.fehlend).toEqual(['src/features/fehlt/FehltView.tsx']);
    expect(leistungPruefen(m, grosszuegig, ohneFassade)).toEqual([
      'Ansicht src/features/fehlt/FehltView.tsx fehlt in der Messung (in keinem Baustein gefunden)',
    ]);
  });

  it('am Bau: die Pflichtliste kommt aus dem Modulgraphen von App.tsx; eine Ansicht ohne Baustein macht den Bau rot', () => {
    const plugin = vite.default.plugins.find((p) => p && (p as Plugin).name === 'leistungswaechter') as Plugin;
    const wurzel = join(__dirname, '../..') + '/';
    const bundle = {
      'assets/index.js': { type: 'chunk', fileName: 'assets/index.js', code: zufall(2_000, 1), imports: [], dynamicImports: [], isEntry: true, facadeModuleId: null, modules: {} },
    };
    const graph: Record<string, string[]> = {
      [`${wurzel}src/app/App.tsx`]: [`${wurzel}src/features/fehlt/FehltView.tsx`, `${wurzel}src/lib/push.ts`],
    };
    (plugin.configResolved as (c: unknown) => void)({ logger: { info: () => undefined } });
    const kontext = {
      error: (t: string) => { throw new Error(t); },
      getModuleInfo: (id: string) => ({ dynamicallyImportedIds: graph[id] ?? [] }),
    };
    const bauen = () => ((plugin.generateBundle as { handler: (this: unknown, o: unknown, b: unknown) => void }).handler).call(kontext, {}, bundle);
    expect(bauen).toThrow(/Ansicht src\/features\/fehlt\/FehltView\.tsx fehlt in der Messung/);
  });
});
