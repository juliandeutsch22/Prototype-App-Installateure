// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import { zwischenspeicherFuer } from '@/lib/liveSpeicher';
import { timerAuftragErgebnis, timerEntwurfMerken, timerEntwuerfeLesen, timerStandLesen, timerStandMerken, type TimerEntwurf } from '@/lib/zeitsitzungSpeicher';
import type { SupabaseClient } from '@supabase/supabase-js';
const sitzung = { id: 's', company_id: 'c', user_id: 'u', stand: 'beendet' as const, revision: 2, segmente: [{ id: 'seg', art: 'arbeit' as const, von: '2026-11-08T07:00:00Z', bis: '2026-11-08T09:00:00Z', baustelle: '' }], aktualisiert_am: '2026-11-08T09:00:00Z', erinnert_am: null, abgeschlossen: false };
const entwurf = (kennung: string): TimerEntwurf => ({ kennung, art: 'buchen', companyId: 'c', uid: 'u', segment: 0, basis: sitzung, eintrag: { comment: `Tätigkeit ${kennung}`, travelTime: 25 }, angelegtAm: 1 });
beforeEach(() => { localStorage.clear(); });
describe('Gesicherte Timer-Abschlüsse', () => {
  it('trennt Besitzer und hält beide konkurrierenden Versuche vor', () => {
    timerEntwurfMerken(entwurf('a')); timerEntwurfMerken(entwurf('b'));
    expect(timerEntwuerfeLesen('c','u').map((d) => d.eintrag?.comment)).toEqual(['Tätigkeit a','Tätigkeit b']);
    expect(timerEntwuerfeLesen('c','fremd')).toEqual([]);
    expect(timerEntwuerfeLesen('fremd','u')).toEqual([]);
    timerAuftragErgebnis('fremd', { uid: 'u', companyId: 'c', kennung: 'a' }, 'buchung');
    expect(timerEntwuerfeLesen('c','u')).toHaveLength(2);
  });
  it('ein abgewiesener Nachsendeversuch behält die tatsächlichen Eingaben', () => {
    timerEntwurfMerken(entwurf('a'));
    timerAuftragErgebnis('u', { uid: 'u', companyId: 'c', kennung: 'a' }, null, 'Zeit überschneidet sich');
    expect(timerEntwuerfeLesen('c','u')[0]).toMatchObject({ fehler: 'Zeit überschneidet sich', eintrag: { comment: 'Tätigkeit a', travelTime: 25 } });
  });
  it('erst der bestätigte Sender entfernt genau seinen Entwurf und merkt die wirkliche Buchung', async () => {
    timerStandMerken('c','u',[sitzung]); timerEntwurfMerken(entwurf('a')); timerEntwurfMerken(entwurf('b'));
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) }, rpc: vi.fn(() => ({ abortSignal: async () => ({ data: 'echte-buchung', error: null, status: 200 }) })) } as unknown as SupabaseClient;
    expect(await supabaseSender(client)({ uid: 'u', art: 'aufruf', tabelle: 'zeitsitzungen', zeile: 's', versuche: 0, angelegt: 1,
      daten: { funktion: 'zeit_timer_buchen', parameter: { p_id: 's', p_segment: 0, p_eintrag: {} }, timer: { uid: 'u', companyId: 'c', kennung: 'a' } } })).toEqual({ art: 'ok' });
    expect(timerEntwuerfeLesen('c','u').map((d) => d.kennung)).toEqual(['b']);
    expect(timerStandLesen('c','u')?.[0].segmente[0].buchung).toBe('echte-buchung');
    expect(timerStandLesen('c','u')?.[0].abgeschlossen).toBe(true);
  });
  it('Abmelden räumt den Lesecache auf; ein offener Entwurf bleibt wie das Ausgangsfach nur seinem Besitzer zugänglich', () => {
    zwischenspeicherFuer('u','c'); timerStandMerken('c','u',[sitzung]); timerEntwurfMerken(entwurf('a'));
    zwischenspeicherFuer(null,null);
    expect(timerStandLesen('c','u')).toBeNull();
    expect(timerEntwuerfeLesen('c','u')).toHaveLength(1);
    expect(timerEntwuerfeLesen('c','anderer')).toEqual([]);
  });
});
