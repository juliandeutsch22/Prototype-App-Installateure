/**
 * DER APP-START (Analyse 09.10.2026, Maßnahme 8).
 *
 * - Supabase in einem eigenen Baustein: er ändert sich fast nie und bleibt
 *   nach einem Deploy im Zwischenspeicher des Telefons, statt mit unserem
 *   Code jedes Mal neu geladen zu werden.
 * - `preconnect` zur Datenbank, wenn die Adresse beim Bau bekannt ist.
 * - Die Anmeldeseite fest eingebunden (vorher nachgeladen).
 * Gegenprobe: gegen den Stand davor fehlen Baustein und Verbindung (rot).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Über einen Pfad in einer Variablen: `vite.config.ts` gehört zum Node-Teil
// des Projekts (tsconfig.node.json), nicht zu dem der App.
const pfad = '../../vite.config';
const config = (await import(/* @vite-ignore */ pfad)).default as {
  plugins: Plugin[];
  build: { rollupOptions: { output: { manualChunks: (id: string) => string | undefined } } };
};

function vorverbinden(adresse: string | undefined) {
  const p = config.plugins.find((x) => x && (x as Plugin).name === 'datenbank-vorverbinden') as Plugin | undefined;
  if (!p) return null;
  (p.configResolved as (c: { env: Record<string, string | undefined> }) => void)({ env: { VITE_SUPABASE_URL: adresse } });
  return (p.transformIndexHtml as () => unknown[])();
}

describe('App-Start', () => {
  it('Supabase liegt in einem eigenen Baustein, React wie bisher', () => {
    const teile = config.build.rollupOptions.output.manualChunks;
    expect(teile('/x/node_modules/@supabase/postgrest-js/dist/index.js')).toBe('supabase');
    expect(teile('/x/node_modules/react-dom/client.js')).toBe('react');
    expect(teile('/x/src/app/App.tsx')).toBeUndefined();
  });

  it('verbindet vorab zur Datenbank — nur mit bekannter Adresse', () => {
    expect(vorverbinden('https://abc.supabase.co/')).toEqual([
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://abc.supabase.co', crossorigin: '' }, injectTo: 'head' },
    ]);
    expect(vorverbinden(undefined)).toEqual([]);
  });

  it('bindet die Anmeldeseite fest ein', () => {
    const app = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf8');
    expect(app).toMatch(/^import LoginPage from '@\/features\/auth\/LoginPage';$/m);
    expect(app).not.toMatch(/lazy\(\(\) => import\('@\/features\/auth\/LoginPage'\)\)/);
  });
});
