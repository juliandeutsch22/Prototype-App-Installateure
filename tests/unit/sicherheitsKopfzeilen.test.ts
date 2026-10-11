/**
 * Die Sicherheits-Kopfzeilen der Auslieferung (11.10.2026, Plan 17 B).
 *
 * Live setzte Firebase Hosting bisher nur HSTS. Jetzt: kein Raten des
 * Dateityps, keine volle Adresse an fremde Seiten, kein Einbetten in fremde
 * Seiten, keine Geräte, die die App nicht braucht — und eine Inhaltsregel,
 * die zuerst nur meldet.
 *
 * Geprüft wird zweierlei: dass die Kopfzeilen da sind, UND dass die meldende
 * Regel zu dem passt, was die App wirklich lädt (Service Worker, Startseite).
 * Eine Regel, die die eigene App meldet, wäre beim Durchsetzen eine weiße
 * Seite.
 *
 * Gegenprobe: gegen `firebase.json` und `vite.config.ts` davor sind die
 * Kopfzeilen und die Erweiterung der Vorschau nicht da (rot).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const wurzel = join(__dirname, '../..');
const konfig = JSON.parse(readFileSync(join(wurzel, 'firebase.json'), 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};

// Über einen Pfad in einer Variablen: `vite.config.ts` gehört zum Node-Teil
// des Projekts (tsconfig.node.json), nicht zu dem der App — wie in
// `appStart.test.ts`. Mit Endung, weil `tsc -b` daneben ein `.js` ablegt, das
// sonst vorginge und einen alten Stand prüfte.
const configPfad = '../../vite.config.ts';
const vite = (await import(/* @vite-ignore */ configPfad)) as {
  default: { plugins: Plugin[] };
  auslieferungsKopfzeilen: (k: typeof konfig) => Record<string, string>;
  vorschauKopfzeilen: (k: typeof konfig, adresse: string | undefined) => Record<string, string>;
};
const { auslieferungsKopfzeilen, vorschauKopfzeilen } = vite;
const viteConfig = vite.default;

const kopf = auslieferungsKopfzeilen(konfig);

/** Eine Regel in ihre Anweisungen zerlegt: `{ 'script-src': ["'self'", …] }`. */
function anweisungen(regel: string): Record<string, string[]> {
  return Object.fromEntries(
    regel
      .split(';')
      .map((t) => t.trim().split(/\s+/))
      .filter((t) => t[0])
      .map(([name, ...werte]) => [name, werte]),
  );
}

describe('Auslieferung (firebase.json)', () => {
  it('setzt die Kopfzeilen für jede Adresse', () => {
    expect(kopf['X-Content-Type-Options']).toBe('nosniff');
    expect(kopf['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(kopf['X-Frame-Options']).toBe('DENY');
    expect(kopf['Permissions-Policy']).toBe('camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('die durchgesetzte Regel sperrt nur das Einbetten, Plug-ins und eine fremde Basis — nichts, was die App lädt', () => {
    expect(anweisungen(kopf['Content-Security-Policy'])).toEqual({
      'frame-ancestors': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
    });
  });

  it('die meldende Regel erlaubt kein eingebettetes Skript und kein eval', () => {
    const r = anweisungen(kopf['Content-Security-Policy-Report-Only']);
    expect(r['default-src']).toEqual(["'self'"]);
    expect(r['script-src']).not.toContain("'unsafe-inline'");
    expect(r['script-src']).not.toContain("'unsafe-eval'");
    // Im Meldemodus übergeht der Browser `frame-ancestors`; das steht in der durchgesetzten.
    expect(r['frame-ancestors']).toBeUndefined();
  });

  it('die meldende Regel deckt, was der Service Worker nachlädt', () => {
    const sw = readFileSync(join(wurzel, 'public/sw.js'), 'utf8');
    const geladen = [...sw.matchAll(/importScripts\('([^']+)'\)/g)].map((m) => new URL(m[1]).origin);
    expect(geladen.length).toBeGreaterThan(0);
    const erlaubt = anweisungen(kopf['Content-Security-Policy-Report-Only'])['script-src'];
    for (const herkunft of geladen) expect(erlaubt).toContain(herkunft);
  });

  it('die Startseite hat kein eingebettetes Skript — sonst meldete die Regel jeden Aufruf', () => {
    const html = readFileSync(join(wurzel, 'index.html'), 'utf8');
    const skripte = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    expect(skripte.length).toBeGreaterThan(0);
    for (const attr of skripte) expect(attr).toMatch(/\bsrc=/);
  });

  it('die Regeln für den Zwischenspeicher bleiben, wie sie waren', () => {
    expect(konfig.hosting.headers.find((h) => h.source === '**')?.headers[0]).toEqual({
      key: 'Cache-Control',
      value: 'no-cache',
    });
    expect(konfig.hosting.headers.find((h) => h.source === '/assets/**')?.headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });
});

describe('Vorschau (vite preview)', () => {
  it('schickt live dieselben Kopfzeilen, ohne die Zwischenspeicher-Regel', () => {
    expect(vorschauKopfzeilen(konfig, 'https://abc.supabase.co')).toEqual(kopf);
    expect(vorschauKopfzeilen(konfig, undefined)).toEqual(kopf);
    expect(kopf['Cache-Control']).toBeUndefined();
  });

  it('nimmt den lokalen Stapel in die Regel auf — nur dort, wo die App die Datenbank anspricht', () => {
    const v = vorschauKopfzeilen(konfig, 'http://127.0.0.1:54321');
    const r = anweisungen(v['Content-Security-Policy-Report-Only']);
    expect(r['connect-src']).toEqual([...anweisungen(kopf['Content-Security-Policy-Report-Only'])['connect-src'], 'http://127.0.0.1:54321', 'ws://127.0.0.1:54321']);
    expect(r['img-src']).toContain('http://127.0.0.1:54321');
    expect(r['script-src']).not.toContain('http://127.0.0.1:54321');
    expect(v['Content-Security-Policy']).toBe(kopf['Content-Security-Policy']);
  });

  it('der Vorschau-Server setzt sie an jeder Antwort', () => {
    const p = viteConfig.plugins.find((x) => x && (x as Plugin).name === 'vorschau-sicherheit') as Plugin;
    (p.configResolved as (c: { env: Record<string, string | undefined> }) => void)({
      env: { VITE_SUPABASE_URL: 'https://abc.supabase.co' },
    });
    let mitte: ((req: unknown, res: { setHeader: (n: string, w: string) => void }, weiter: () => void) => void) | undefined;
    (p.configurePreviewServer as (s: unknown) => void)({ middlewares: { use: (f: typeof mitte) => (mitte = f) } });
    const gesetzt: Record<string, string> = {};
    let weiter = false;
    mitte!({}, { setHeader: (n, w) => (gesetzt[n] = w) }, () => (weiter = true));
    expect(gesetzt).toEqual(kopf);
    expect(weiter).toBe(true);
  });
});
