import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { meldungAnzeige, imVordergrundZeigen } from '@/lib/pushAnzeige';

/*
 * DIE PUSH-MELDUNG IM HINTERGRUND (09.11.2026: „Nachrichten senden keine
 * Push-Benachrichtigungen“).
 *
 * Dieselbe Kennung je Gespräch ersetzt die vorige Meldung — ohne `renotify`
 * aber still, ohne Ton und Vibration: die zweite Nachricht im selben Gespräch
 * meldete sich nicht mehr. Geprüft am echten `public/sw.js`, und dass er
 * dieselbe Form zeigt wie die offene App (`lib/pushAnzeige.ts`).
 */
function hintergrundMeldung(daten: Record<string, string>) {
  const QUELLE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
  let handler: ((p: unknown) => void) | null = null;
  const gezeigt: { titel: string; optionen: Record<string, unknown> }[] = [];
  const self_ = {
    location: { origin: 'https://app.test', search: '?apiKey=k&messagingSenderId=s&projectId=p&appId=a' },
    addEventListener: () => undefined,
    skipWaiting: () => undefined,
    registration: { showNotification: (titel: string, optionen: Record<string, unknown>) => gezeigt.push({ titel, optionen }) },
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
  };
  const firebase = {
    initializeApp: () => undefined,
    messaging: () => ({ onBackgroundMessage: (h: (p: unknown) => void) => { handler = h; } }),
  };
  vm.runInNewContext(QUELLE, { self: self_, importScripts: () => undefined, firebase, URLSearchParams, URL, caches: {}, Response, Request, Promise, console });
  handler!({ data: daten });
  return gezeigt[0];
}

describe('Push im Hintergrund', () => {
  const daten = { title: 'Max Monteur', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' };

  it('meldet sich auch bei der zweiten Nachricht im selben Gespräch wieder (renotify)', () => {
    const m = hintergrundMeldung(daten);
    expect(m.titel).toBe('Max Monteur');
    expect(m.optionen).toMatchObject({ tag: 'nachricht-k1', renotify: true, data: { link: '/nachrichten/k1' } });
  });

  it('der Worker zeigt dieselbe Meldung wie die offene App', () => {
    const m = hintergrundMeldung(daten);
    const vorn = meldungAnzeige(daten);
    expect(m.titel).toBe(vorn.titel);
    expect(m.optionen).toEqual(vorn.optionen);
    // Auch ohne Angaben dieselben Rückfälle.
    expect(hintergrundMeldung({}).optionen).toEqual(meldungAnzeige({}).optionen);
  });
});

describe('Push bei offener App — wann zeigen', () => {
  it('zeigt, außer man steht schon dort, wohin die Meldung führt', () => {
    expect(imVordergrundZeigen({ link: '/nachrichten/k1' }, '/nachrichten/k1')).toBe(false);
    expect(imVordergrundZeigen({ link: '/nachrichten/k1' }, '/nachrichten/k2')).toBe(true);
    expect(imVordergrundZeigen({ link: '/nachrichten/k1' }, '/')).toBe(true);
    expect(imVordergrundZeigen({}, '/')).toBe(true);
  });
});
