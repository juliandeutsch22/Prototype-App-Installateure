import { describe, it, expect, afterEach } from 'vitest';
import type { ServerResponse } from 'node:http';
import { ohneZwischenspeicherImTestlauf } from '../../vite.testlauf';

/*
  OHNE ZWISCHENSPEICHER IM TESTLAUF (18.11.2026): im Browserlauf antwortet der
  Entwicklungsserver mit `no-store`, auch wenn Vite später selbst `no-cache`
  setzt — sonst füllt sich der Speicher des Browsers, und lange Wege brechen
  mit ERR_INSUFFICIENT_RESOURCES ab (Messung in `vite.testlauf.ts`).
  Gegenprobe: ohne das Plugin (oder ohne den Schalter) bleibt `no-cache`.
*/
type Mitte = (req: unknown, res: ServerResponse, weiter: () => void) => void;

function starten(): Mitte[] {
  const mitten: Mitte[] = [];
  const plugin = ohneZwischenspeicherImTestlauf();
  const haken = plugin.configureServer as (s: unknown) => void;
  haken({ middlewares: { use: (m: Mitte) => mitten.push(m) } });
  return mitten;
}

function antwort() {
  const koepfe = new Map<string, string>();
  const res = { setHeader: (n: string, w: string) => { koepfe.set(n.toLowerCase(), w); return res; } } as unknown as ServerResponse;
  return { res, koepfe };
}

describe('Testlauf ohne Zwischenspeicher', () => {
  afterEach(() => { delete process.env.ZWISCHENSPEICHER_AUS; });

  it('mit dem Schalter: jeder Cache-Control-Kopf wird no-store, auch der spätere von Vite', () => {
    process.env.ZWISCHENSPEICHER_AUS = '1';
    const mitten = starten();
    expect(mitten).toHaveLength(1);
    const { res, koepfe } = antwort();
    let weiter = false;
    mitten[0]({}, res, () => { weiter = true; });
    expect(weiter).toBe(true);
    expect(koepfe.get('cache-control')).toBe('no-store');
    res.setHeader('Cache-Control', 'no-cache'); // so setzt Vite ihn beim Senden
    expect(koepfe.get('cache-control')).toBe('no-store');
    res.setHeader('Content-Type', 'text/javascript');
    expect(koepfe.get('content-type')).toBe('text/javascript');
  });

  it('gleich geblieben: ohne den Schalter (beim Entwickeln) greift nichts', () => {
    expect(starten()).toHaveLength(0);
  });
});
