// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { it, expect, vi, afterEach } from 'vitest';
import { fachSperre } from '@/lib/sync/fachSperre';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('ordnet auch ohne Web Locks zwei unabhängige Aufrufer über IndexedDB', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const reihe: number[] = [];
  await Promise.all([
    fachSperre(async () => { reihe.push(1); await new Promise((r) => setTimeout(r, 20)); reihe.push(2); }),
    fachSperre(async () => { reihe.push(3); }),
  ]);
  expect(reihe).toEqual([1, 2, 3]);
  await expect(fachSperre(async () => { throw new Error('abgelehnt'); })).rejects.toThrow('abgelehnt');
  await expect(fachSperre(async () => 4)).resolves.toBe(4);
});

it('ordnet den Nachsender auch in Prüfungen ohne navigator', async () => {
  vi.stubGlobal('navigator', undefined);
  const reihe: number[] = [];
  await Promise.all([
    fachSperre(async () => { reihe.push(1); await new Promise((r) => setTimeout(r, 20)); reihe.push(2); }),
    fachSperre(async () => { reihe.push(3); }),
  ]);
  expect(reihe).toEqual([1, 2, 3]);
});
