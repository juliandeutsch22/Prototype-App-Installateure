// @vitest-environment jsdom
/**
 * Der Name der App — überall dort, wo ein Gerät ihn sieht.
 *
 * GEMELDET: der Browserreiter hiess „Perl Installationen GmbH", und eine
 * Push-Meldung kam „from Perl Zeit". Im Quelltext stand längst „Senklot" —
 * aber `applyBranding` überschrieb den Titel mit dem Firmennamen, iOS schlug
 * beim „Zum Home-Bildschirm" genau diesen Titel als App-Namen vor, und der
 * Service Worker fiel ohne Titel auf „Perl Zeiterfassung" zurück.
 *
 * iOS merkt sich den Namen beim Hinzufügen und ändert ihn danach nie. Ein
 * falscher Vorschlag hier ist also einer, der auf dem Telefon bleibt.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyBranding } from '@/lib/tenant';

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), 'utf8');

describe('Der Name der App', () => {
  beforeEach(() => {
    document.title = 'Senklot';
  });

  it('bleibt im Browserreiter „Senklot", auch wenn der Betrieb geladen ist', () => {
    applyBranding({ name: 'Perl Installationen GmbH', brandColor: '#123456' });
    expect(document.title).toBe('Senklot');
  });

  it('wird iOS beim Hinzufügen zum Home-Bildschirm ausdrücklich vorgeschlagen', () => {
    const html = lies('index.html');
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Senklot" \/>/);
    expect(html).toMatch(/<title>Senklot<\/title>/);
  });

  it('steht so im Manifest', () => {
    const manifest = JSON.parse(lies('public/manifest.webmanifest'));
    expect(manifest.name).toBe('Senklot');
    expect(manifest.short_name).toBe('Senklot');
  });

  it('ist der Ersatztitel einer Push-Meldung ohne eigenen Titel', () => {
    expect(lies('public/sw.js')).toMatch(/showNotification\(title \|\| 'Senklot'/);
  });

  it('kommt in dem, was ausgeliefert wird, nicht mehr unter altem Namen vor', () => {
    for (const datei of ['index.html', 'public/manifest.webmanifest', 'public/sw.js']) {
      expect(lies(datei), datei).not.toMatch(/Perl Zeit/);
    }
  });
});
