import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * L12 (Plan 15.11.2026): eine Akte wird vorbereitet, solange der Finger noch
 * auf der Zeile liegt — Baustein holen und den Kopf aus der Zeile in den
 * gemerkten Stand der Akte legen, ohne eigene Anfrage.
 *
 * GEGENPROBE (Erwartung): ohne `vorbereiten` an der Zeile ist „Berühren
 * bereitet vor“ rot; „ohne Anmeldung nichts“ und „neuerer Stand bleibt“
 * prüfen, dass nichts Falsches gemerkt wird.
 */
const geholt: string[] = [];
vi.mock('@/lib/ansichten', () => ({ ansichtVorbereiten: (p: string) => geholt.push(p) }));

const { akteVorbereiten } = await import('@/lib/akteVorbereiten');
const { abfrageSpeicher, schluessel, zwischenspeicherLeeren } = await import('@/lib/zwischenspeicher');
const { zwischenspeicherFuer } = await import('@/lib/liveSpeicher');
const { ListRow } = await import('@/components/ListRow');

const ICH = { uid: 'chef', companyId: 'perl' };
const KUNDE = { id: 'k1', name: 'Familie Huber' };

beforeEach(() => {
  geholt.length = 0;
  zwischenspeicherLeeren();
  zwischenspeicherFuer('chef', 'perl');
});

describe('Akte vorbereiten', () => {
  it('holt den Baustein und legt den Kopf in den gemerkten Stand der Akte', () => {
    akteVorbereiten('/customers/k1', { schluessel: schluessel('kundenakte', ICH, 'k1'), daten: { kunde: KUNDE } });
    expect(geholt).toEqual(['/customers/k1']);
    expect(abfrageSpeicher.getQueryData(schluessel('kundenakte', ICH, 'k1'))).toEqual({ kunde: KUNDE });
  });

  it('was die Akte schon gemerkt hat, ist neuer und bleibt', () => {
    abfrageSpeicher.setQueryData(schluessel('kundenakte', ICH, 'k1'), { kunde: { ...KUNDE, name: 'Familie Huber-Neu' }, angebote: [] });
    akteVorbereiten('/customers/k1', { schluessel: schluessel('kundenakte', ICH, 'k1'), daten: { kunde: KUNDE } });
    expect(abfrageSpeicher.getQueryData(schluessel('kundenakte', ICH, 'k1'))).toEqual({ kunde: { ...KUNDE, name: 'Familie Huber-Neu' }, angebote: [] });
  });

  it('für einen anderen als den Angemeldeten wird nichts gemerkt — der Baustein kommt trotzdem', () => {
    zwischenspeicherFuer('jemand', 'perl');
    akteVorbereiten('/customers/k1', { schluessel: schluessel('kundenakte', ICH, 'k1'), daten: { kunde: KUNDE } });
    expect(abfrageSpeicher.getQueryData(schluessel('kundenakte', ICH, 'k1'))).toBeUndefined();
    expect(geholt).toEqual(['/customers/k1']);
  });
});

describe('Die Zeile', () => {
  it('Berühren (gedrückt, noch nicht losgelassen) und Tastatur bereiten vor', () => {
    const vorbereiten = vi.fn();
    render(<MemoryRouter><ul><ListRow title="Familie Huber" to="/customers/k1" vorbereiten={vorbereiten} /></ul></MemoryRouter>);
    fireEvent.pointerDown(screen.getByRole('link', { name: 'Familie Huber' }));
    expect(vorbereiten).toHaveBeenCalledTimes(1);
    fireEvent.focus(screen.getByRole('link', { name: 'Familie Huber' }));
    expect(vorbereiten).toHaveBeenCalledTimes(2);
  });

  it('bleibt gleich: ohne Vorbereitung ist die Zeile wie bisher ein Link', () => {
    render(<MemoryRouter><ul><ListRow title="Familie Huber" to="/customers/k1" /></ul></MemoryRouter>);
    expect(() => fireEvent.pointerDown(screen.getByRole('link', { name: 'Familie Huber' }))).not.toThrow();
    expect(screen.getByRole('link', { name: 'Familie Huber' })).toHaveAttribute('href', '/customers/k1');
  });
});
