/**
 * DIE LESENDE EDGE FUNCTION DER STARTSEITE BEKOMMT EINE FRIST (Durchsicht
 * 15.11.2026). Die offenen Forderungen kamen bisher als lesende Abfrage mit
 * Stillstandsfrist; seit sie über `startseite-forderungen` kommen, gälte für
 * sie sonst „Edge Function — nie abbrechen“, und die Startseite hinge auf
 * einer toten Verbindung. Abbrechen darf nur, was nicht schreiben kann:
 * deshalb prüft diese Datei auch den Quelltext der Function.
 *
 * Gegenprobe: ohne den Eintrag ist die Zugriffsart `null` (rot); andere
 * Functions bleiben ohne Frist (bleibt gleich).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LESENDE_EDGE_FUNCTIONS, zugriffsart } from '@/lib/netzFrist';

describe('lesende Edge Functions mit Stillstandsfrist', () => {
  it('startseite-forderungen gilt als lesend', () => {
    expect(zugriffsart('https://x.supabase.co/functions/v1/startseite-forderungen', 'POST')).toBe('lesen');
  });

  it('bleibt gleich: andere Functions brechen nie ab', () => {
    expect(zugriffsart('https://x.supabase.co/functions/v1/beleg-mail', 'POST')).toBeNull();
    expect(zugriffsart('https://x.supabase.co/functions/v1/push-probe', 'POST')).toBeNull();
  });

  it('jede lesende Function liest nur: im Quelltext kein schreibender Aufruf', () => {
    for (const name of LESENDE_EDGE_FUNCTIONS) {
      const quelle = readFileSync(join(__dirname, `../../supabase/functions/${name}/index.ts`), 'utf8');
      expect(quelle, name).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
      expect(quelle, name).not.toMatch(/\/rest\/v1\/rpc\//);
    }
  });
});
