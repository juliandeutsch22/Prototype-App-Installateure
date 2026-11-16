import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { FASSUNG, fassungSetzen } from '@/lib/fassung';

/**
 * L7 (Plan 15.11.2026): eine kleine Änderung benennt nicht mehr die halbe
 * App um.
 *
 * Gemessen (je ein Bau vor und nach einer Änderung, Bausteine mit neuem
 * Namen): vorher 182 von 230 (966 KB gzip) — gleich, ob eine Ansicht, die
 * Navigation oder der Datenkern geändert wurde, und schon ohne jede
 * Änderung, weil die Uhrzeit des Baus im gemeinsamen Code stand. Nachher:
 * eine Ansicht 2 (17 KB), die Daten der Rechnungen 1 (7 KB); Hülle und
 * Datenkern 176 (772 KB) — wer sie ändert, ändert, was fast jede Ansicht
 * einbindet.
 *
 * GEGENPROBE (Erwartung): mit dem alten Schnitt (nur Fremdpakete) sind
 * „Einstieg nur main und App“ und „gemeinsam“ rot; mit `__FASSUNG__` in
 * `lib/fassung.ts` ist „die Uhrzeit des Baus steht nur im Einstieg“ rot.
 */
const configPfad = '../../vite.config.ts';
const vite = (await import(/* @vite-ignore */ configPfad)) as {
  default: { plugins: Plugin[] };
  bausteinSchnitt: (id: string, meta?: { getModuleInfo: (id: string) => { importedIds: string[] } | null }) => string | undefined;
  startBausteineFehlen: (html: string, b: Array<{ datei: string; statisch: string[]; einstieg: boolean }>) => string[];
};
const { bausteinSchnitt, startBausteineFehlen } = vite;

const W = join(__dirname, '../..');
const EIN = join(W, 'src/main.tsx');
const APP = join(W, 'src/app/App.tsx');
const LAYOUT = join(W, 'src/app/Layout.tsx');
const KERN = join(W, 'src/lib/db/pg/kern.ts');
const ANSICHT = join(W, 'src/features/customers/CustomersView.tsx');
const NUR_ANSICHT = join(W, 'src/features/invoices/totals.ts');
const QUERY = '/x/node_modules/@tanstack/query-core/build/modern/index.js';
const PDF = '/x/node_modules/jspdf/dist/jspdf.es.min.js';
const HILFE = '\0commonjsHelpers.js';

// Fest eingebunden: main → App → Layout → kern; TanStack und die CommonJS-Hilfe dazu. Nur nachgeladen: die Ansicht und was nur sie braucht.
const GRAPH: Record<string, string[]> = {
  [EIN]: [APP, QUERY, HILFE, join(W, 'src/index.css')],
  [APP]: [LAYOUT],
  [LAYOUT]: [KERN],
  [ANSICHT]: [KERN, NUR_ANSICHT, PDF],
};
const meta = { getModuleInfo: (id: string) => ({ importedIds: GRAPH[id] ?? [] }) };

describe('Der Schnitt in Bausteine', () => {
  it('der Einstieg bleibt main und App — die Tabelle der Ansichten bindet niemand ein', () => {
    expect(bausteinSchnitt(EIN, meta)).toBeUndefined();
    expect(bausteinSchnitt(APP, meta)).toBeUndefined();
  });

  it('was der Start fest braucht, liegt in „gemeinsam“', () => {
    expect(bausteinSchnitt(LAYOUT, meta)).toBe('gemeinsam');
    expect(bausteinSchnitt(KERN, meta)).toBe('gemeinsam');
  });

  it('was nur Ansichten brauchen, teilt Rollup nach den Ansichten', () => {
    expect(bausteinSchnitt(ANSICHT, meta)).toBeUndefined();
    expect(bausteinSchnitt(NUR_ANSICHT, meta)).toBeUndefined();
    expect(bausteinSchnitt(PDF, meta)).toBeUndefined();
  });

  it('Bibliotheken des Starts und Ladehilfen zu React; Supabase und Firebase eigen', () => {
    expect(bausteinSchnitt(QUERY, meta)).toBe('react');
    expect(bausteinSchnitt(HILFE, meta)).toBe('react');
    expect(bausteinSchnitt('\0vite/preload-helper.js', meta)).toBe('react');
    expect(bausteinSchnitt('/x/node_modules/react-dom/client.js', meta)).toBe('react');
    expect(bausteinSchnitt('/x/node_modules/@supabase/postgrest-js/dist/index.js', meta)).toBe('supabase');
    expect(bausteinSchnitt('/x/node_modules/@firebase/app/dist/index.esm.js', meta)).toBe('firebase');
  });

  it('bleibt gleich: die Stile bleiben beim Einstieg (eine Datei, ihre Reihenfolge)', () => {
    expect(bausteinSchnitt(join(W, 'src/index.css'), meta)).toBeUndefined();
    expect(bausteinSchnitt('/x/node_modules/@fontsource/dm-sans/latin-400.css', meta)).toBeUndefined();
  });

  it('hängt am Bau', () => {
    const config = (vite as unknown as { default: { build: { rollupOptions: { output: { manualChunks: unknown } } } } }).default;
    expect(config.build.rollupOptions.output.manualChunks).toBe(bausteinSchnitt);
  });
});

describe('Die Start-Bausteine stehen in index.html (Service Worker)', () => {
  const bau = [
    { datei: 'assets/index-a.js', statisch: ['assets/react-a.js', 'assets/gemeinsam-a.js'], einstieg: true },
    { datei: 'assets/gemeinsam-a.js', statisch: ['assets/react-a.js', 'assets/supabase-a.js'], einstieg: false },
    { datei: 'assets/react-a.js', statisch: [], einstieg: false },
    { datei: 'assets/supabase-a.js', statisch: [], einstieg: false },
    { datei: 'assets/CustomersView-a.js', statisch: ['assets/gemeinsam-a.js'], einstieg: false },
  ];
  const html = (...dateien: string[]) => dateien.map((d) => `<link rel="modulepreload" crossorigin href="/${d}">`).join('') +
    '<script type="module" crossorigin src="/assets/index-a.js"></script>';

  it('alle fest eingebundenen genannt: nichts fehlt — nachgeladene Ansichten gehören nicht dazu', () => {
    expect(startBausteineFehlen(html('assets/react-a.js', 'assets/gemeinsam-a.js', 'assets/supabase-a.js'), bau)).toEqual([]);
  });

  it('fehlt einer (auch über zwei Stufen), nennt die Prüfung ihn', () => {
    expect(startBausteineFehlen(html('assets/react-a.js', 'assets/gemeinsam-a.js'), bau)).toEqual(['assets/supabase-a.js']);
  });
});

describe('Die Fassung (Uhrzeit des Baus)', () => {
  it('steht nur im Einstieg — der gemeinsame Code ändert sich nicht mit jedem Bau', () => {
    expect(readFileSync(join(W, 'src/lib/fassung.ts'), 'utf8')).not.toMatch(/__FASSUNG__/);
    expect(readFileSync(join(W, 'src/main.tsx'), 'utf8')).toMatch(/fassungSetzen\(typeof __FASSUNG__ === 'string' \? __FASSUNG__ : undefined\)/);
  });

  it('bleibt gleich: ohne Bau „Entwicklung“; gesetzt gilt der Wert überall (lebendige Bindung)', async () => {
    expect(FASSUNG).toBe('Entwicklung');
    fassungSetzen('');
    expect(FASSUNG).toBe('Entwicklung');
    fassungSetzen('abc1234 · 17.11.2026, 10:00');
    const nochmal = await import('@/lib/fassung');
    expect(nochmal.FASSUNG).toBe('abc1234 · 17.11.2026, 10:00');
    fassungSetzen('Entwicklung');
  });
});
