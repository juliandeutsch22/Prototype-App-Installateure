// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Zeitsitzung } from '@/lib/zeitsitzung';
const antworten: { data: Zeitsitzung[] | null; error: { message: string } | null; count: number | null }[] = [];
const vorgemerkt = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({ wartendeVorgaenge: () => vorgemerkt(), vorgangOhneEmpfang: vi.fn() }));
vi.mock('@/lib/db/pg/kern', () => ({ derClient: () => {
  const abfrage = { select: () => abfrage, eq: () => abfrage, neq: () => abfrage, order: () => abfrage, limit: () => abfrage, gt: () => abfrage,
    then: (f: (a: unknown) => unknown) => Promise.resolve(antworten.shift()).then(f) };
  return { from: () => abfrage };
} }));
import { timerMerken, zeitsitzungenLaden } from '@/lib/db/zeitsitzungen';
const sitzung = (i: number): Zeitsitzung => ({ id: String(i).padStart(6,'0'), company_id: 'c', user_id: 'u', stand: 'beendet', revision: 2,
  segmente: [], aktualisiert_am: '2026-11-08T07:00:00Z', erinnert_am: null, abgeschlossen: false });
beforeEach(() => { antworten.length = 0; localStorage.clear(); vorgemerkt.mockResolvedValue([]); });
describe('Alle offenen Zeitsitzungen, auch ohne Verbindung', () => {
  it('liest über das Seitenlimit des Servers hinaus, ohne offene Abschnitte zu verlieren', async () => {
    const alle = Array.from({ length: 501 }, (_, i) => sitzung(i));
    antworten.push({ data: alle.slice(0,500), error: null, count: 501 }, { data: alle.slice(500), error: null, count: 1 });
    expect(await zeitsitzungenLaden('c','u')).toHaveLength(501);
  });
  it('ein Netzabbruch zeigt den letzten vollständigen Stand samt vorgemerkt weitergeführtem Timer', async () => {
    const alt = { ...sitzung(1), stand: 'laeuft' as const, revision: 1, segmente: [{ id: 'seg', art: 'arbeit' as const, von: '2026-11-08T07:00:00Z', baustelle: '' }] };
    timerMerken('c','u',[alt]);
    antworten.push({ data: null, error: { message: 'TypeError: Failed to fetch' }, count: null });
    vorgemerkt.mockResolvedValue([{ uid: 'u', daten: { funktion: 'zeit_timer_befehl', parameter: { p_id: alt.id, p_befehl: 'cmd', p_revision: 1, p_art: 'stop', p_zeit: '2026-11-08T09:00:00Z', p_baustelle: '' } } }]);
    const geladen = await zeitsitzungenLaden('c','u');
    expect(geladen[0].stand).toBe('beendet'); expect(geladen[0].segmente[0].bis).toBe('2026-11-08T09:00:00Z');
  });
  it('ein Rechtefehler wird nicht als „offline“ mit einem alten Stand verdeckt', async () => {
    timerMerken('c','u',[sitzung(1)]);
    antworten.push({ data: null, error: { message: 'Zugriff verweigert' }, count: null });
    await expect(zeitsitzungenLaden('c','u')).rejects.toThrow('Zugriff verweigert');
  });
});
