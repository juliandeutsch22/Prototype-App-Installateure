/**
 * `useGemerkt` — der gemerkte Stand einer Seite, die selbst lädt (Stufe 3).
 *
 * Festgehalten wird, was die Seiten sich darauf verlassen: der Stand kommt
 * beim nächsten Aufbau als `anfang` zurück, Teile werden zusammengelegt, und
 * gemerkt wird nur für den, der angemeldet ist — sonst sähe nach dem
 * Abmelden der Nächste auf demselben Gerät, was sein Vorgänger geladen hat.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { schluessel, useGemerkt, zwischenspeicherLeeren } from '@/lib/zwischenspeicher';
import { zwischenspeicherFuer } from '@/lib/liveSpeicher';

interface Stand { liste: string[]; zahl: number }
const ICH = { uid: 'm1', companyId: 'perl' };

beforeEach(() => {
  zwischenspeicherLeeren();
  zwischenspeicherFuer('m1', 'perl');
});

describe('useGemerkt', () => {
  it('gibt beim nächsten Aufbau zurück, was gemerkt wurde — Teile zusammengelegt', () => {
    const erster = renderHook(() => useGemerkt<Stand>(schluessel('probe', ICH)));
    expect(erster.result.current.anfang).toBeUndefined();
    act(() => erster.result.current.merken({ liste: ['a'] }));
    act(() => erster.result.current.merken({ zahl: 3 }));
    erster.unmount();

    const zweiter = renderHook(() => useGemerkt<Stand>(schluessel('probe', ICH)));
    expect(zweiter.result.current.anfang).toEqual({ liste: ['a'], zahl: 3 });
  });

  it('liest den Anfang nur einmal — was danach gemerkt wird, ändert ihn nicht', () => {
    const { result } = renderHook(() => useGemerkt<Stand>(schluessel('probe', ICH)));
    act(() => result.current.merken({ zahl: 1 }));
    expect(result.current.anfang).toBeUndefined();
  });

  it('merkt nichts, wenn der Schlüssel nicht dem Angemeldeten gehört', () => {
    const fremd = renderHook(() => useGemerkt<Stand>(schluessel('probe', { uid: 'gf1', companyId: 'perl' })));
    act(() => fremd.result.current.merken({ zahl: 7 }));
    fremd.unmount();
    zwischenspeicherFuer('gf1', 'perl');
    const spaeter = renderHook(() => useGemerkt<Stand>(schluessel('probe', { uid: 'gf1', companyId: 'perl' })));
    expect(spaeter.result.current.anfang).toBeUndefined();
  });

  it('nach dem Abmelden schreibt eine späte Antwort nichts mehr', () => {
    const { result } = renderHook(() => useGemerkt<Stand>(schluessel('probe', ICH)));
    zwischenspeicherFuer(null, null);
    act(() => result.current.merken({ zahl: 9 }));
    zwischenspeicherFuer('m1', 'perl');
    const wieder = renderHook(() => useGemerkt<Stand>(schluessel('probe', ICH)));
    expect(wieder.result.current.anfang).toBeUndefined();
  });

  it('ohne Schlüssel (niemand angemeldet) weder Anfang noch Merken', () => {
    const { result } = renderHook(() => useGemerkt<Stand>(null));
    expect(result.current.anfang).toBeUndefined();
    expect(() => result.current.merken({ zahl: 1 })).not.toThrow();
  });
});
