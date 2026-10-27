import { describe, it, expect } from 'vitest';
import type { Quote } from '@/types';
import { fassungsHinweis, fassungenVon } from '@/features/quotes/fassungen';

/**
 * Die Fassungen eines Angebots (Testbericht Runde 6, G15) — vorwärts und
 * rückwärts über `vorgaengerId`, auch über Verzweigungen.
 */
type F = Pick<Quote, 'vorgaengerId' | 'status' | 'quoteNumber'> & { id: string };
const f = (id: string, status: Quote['status'], vorgaengerId?: string): F => ({ id, status, vorgaengerId, quoteNumber: `AN-${id}` });

describe('fassungenVon', () => {
  const alle = [f('1', 'Versendet'), f('2', 'Versendet', '1'), f('3', 'Entwurf', '2'), f('2b', 'Abgelehnt', '1'), f('x', 'Versendet')];

  it('findet von der Mitte aus Vorgänger, Nachfolger und Geschwister — nichts Fremdes', () => {
    expect(fassungenVon(alle[1], alle).map((x) => x.id).sort()).toEqual(['1', '2b', '3']);
    expect(fassungenVon(alle[4], alle)).toEqual([]);
  });

  it('nennt, was ersetzt wird und ob schon eine angenommen ist', () => {
    expect(fassungsHinweis(alle[2], alle).ersetzt.map((x) => x.id).sort()).toEqual(['1', '2']);
    const mitAngenommen = alle.map((x) => (x.id === '1' ? { ...x, status: 'Angenommen' as const } : x));
    expect(fassungsHinweis(mitAngenommen[2], mitAngenommen).angenommen?.quoteNumber).toBe('AN-1');
  });
});
