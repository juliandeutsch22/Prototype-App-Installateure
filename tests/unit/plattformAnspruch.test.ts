/**
 * Nur der WÖRTLICHE Anspruch zählt.
 *
 * WARUM DAS EIGENS GEPRÜFT WIRD. Der Plattform-Anspruch entscheidet, ob
 * jemand die Seite zu sehen bekommt, auf der Betriebe entstehen. Er ist eine
 * ANZEIGEFRAGE und keine Sicherheitsgrenze — die steht in den Zeilenregeln
 * und in der Edge Function. Trotzdem: ein `'ja'`, eine `1` oder ein
 * `'false'` als Zeichenkette sind alle wahrheitswertig wahr, und ein
 * `if (anspruch)` liesse sie durch. Verglichen wird deshalb gegen `true`.
 *
 * BIS ZUM 19.09. STANDEN HIER ZWEI FASSUNGEN nebeneinander — Firebase las den
 * Anspruch aus dem Token-Ergebnis, Supabase aus dem `app_metadata` der
 * Sitzung. Mit dem Abbau von Firebase ist die erste gefallen; die Prüfung
 * bleibt, weil die Frage dieselbe ist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let appMetadata: Record<string, unknown> = {};

vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  supabaseClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { app_metadata: appMetadata } } } }),
    },
  }),
}));

const postgres = await import('@/lib/auth/pg/sitzung');

beforeEach(() => {
  appMetadata = {};
});

describe('Der Plattform-Anspruch', () => {
  it('gilt bei `true`', async () => {
    appMetadata = { plattform_admin: true };
    expect(await postgres.istPlattformAdmin()).toBe(true);
  });

  it('gilt NICHT bei einem wahrheitswertig wahren Wert', async () => {
    for (const wert of ['ja', 1, 'true', {}, [1]]) {
      appMetadata = { plattform_admin: wert };
      expect({ wert, anspruch: await postgres.istPlattformAdmin() })
        .toEqual({ wert, anspruch: false });
    }
  });

  it('gilt nicht, wenn er fehlt', async () => {
    expect(await postgres.istPlattformAdmin()).toBe(false);
  });
});
