/**
 * Liegt eine Sitzung auf dem Gerät? (Ladezeit, 19.10.2026) — die Frage vor
 * dem Vorgriff beim Start (`startansichtVorladen` in `main.tsx`). Ohne
 * Sitzung kommt die Anmeldemaske, und der Baustein der Seite kostete nur
 * Daten.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sitzungVermutlich } from '@/lib/supabase';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('sitzungVermutlich', () => {
  it('ohne Sitzung: nein', () => {
    localStorage.setItem('senklot.darstellung', 'hell');
    expect(sitzungVermutlich()).toBe(false);
  });

  it('mit der Sitzung von supabase-js im Gerätespeicher: ja', () => {
    localStorage.setItem('sb-abcdefgh-auth-token', '{}');
    expect(sitzungVermutlich()).toBe(true);
  });

  it('„nicht angemeldet bleiben“: die Sitzung liegt im Fensterspeicher und zählt nur dort', () => {
    localStorage.setItem('senklot.sitzungMerken', 'nein');
    sessionStorage.setItem('sb-abcdefgh-auth-token', '{}');
    expect(sitzungVermutlich()).toBe(true);
    sessionStorage.clear();
    localStorage.setItem('sb-abcdefgh-auth-token', '{}');
    expect(sitzungVermutlich()).toBe(false);
  });
});
