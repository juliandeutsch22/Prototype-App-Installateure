import type { TimeEntry } from '@/types';
import type { Zeitsitzung } from './zeitsitzung';

export interface TimerEntwurf {
  kennung: string;
  art: 'buchen' | 'verwerfen';
  companyId: string;
  uid: string;
  segment: number;
  /** Letzter Arbeitsabschnitt des gebuchten Zeitraums (E73) — fehlt bei Entwürfen einer älteren Fassung: dann nur `segment`. */
  bis?: number;
  basis: Omit<Zeitsitzung, 'entwuerfe'>;
  eintrag?: Partial<TimeEntry>;
  grund?: string;
  fehler?: string;
  angelegtAm: number;
  /** Aus dem Ausgangsfach gelesen, nicht als Bestätigung gespeichert. */
  wartet?: boolean;
}
export const TIMER_STAND_PREFIX = 'senklot.timer.';
export const timerStandKey = (companyId: string, uid: string) => `${TIMER_STAND_PREFIX}${uid}@${companyId}`;
const entwurfPrefix = (companyId: string, uid: string) => `senklot.timerentwurf.${uid}@${companyId}.`;
const entwurfKey = (d: Pick<TimerEntwurf, 'companyId' | 'uid' | 'kennung'>) => entwurfPrefix(d.companyId, d.uid) + d.kennung;

export function timerStandLesen(companyId: string, uid: string): Zeitsitzung[] | null {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(timerStandKey(companyId, uid)) ?? 'null');
    return Array.isArray(a) ? a.filter((s): s is Zeitsitzung => !!s && s.company_id === companyId && s.user_id === uid && Array.isArray(s.segmente)) : null;
  } catch { return null; }
}
export function timerStandMerken(companyId: string, uid: string, sitzungen: Zeitsitzung[]): boolean {
  try { localStorage.setItem(timerStandKey(companyId, uid), JSON.stringify(sitzungen.map((s) => { const basis = { ...s }; delete basis.entwuerfe; return basis; }))); return true; }
  catch { return false; }
}
/** Ein eigener Schlüssel je Versuch verhindert, dass zwei Tabs einander ihre Eingaben überschreiben. */
export function timerEntwurfMerken(d: TimerEntwurf): boolean {
  try { localStorage.setItem(entwurfKey(d), JSON.stringify(d)); return true; } catch { return false; }
}
export function timerEntwuerfeLesen(companyId: string, uid: string): TimerEntwurf[] {
  try {
    const a: TimerEntwurf[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(entwurfPrefix(companyId, uid))) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k) ?? 'null') as TimerEntwurf | null;
        if (d?.companyId === companyId && d.uid === uid && typeof d.kennung === 'string' && d.basis?.id && Number.isInteger(d.segment) && d.segment >= 0) a.push(d);
      } catch { /* Ein beschädigter Entwurf darf die anderen nicht verdecken. */ }
    }
    return a.sort((x, y) => x.angelegtAm - y.angelegtAm || x.kennung.localeCompare(y.kennung));
  } catch { return []; }
}
export function timerEntwurfEntfernen(d: Pick<TimerEntwurf, 'companyId' | 'uid' | 'kennung'>): void {
  try { localStorage.removeItem(entwurfKey(d)); } catch { /* Ein gesperrter Speicher bleibt unverändert. */ }
}
/** Nur eine tatsächliche Serverbestätigung entfernt den dazugehörigen Entwurf. */
export function timerAuftragErgebnis(uid: string | undefined, meta: unknown, daten: unknown, fehler?: string): void {
  const m = meta as { uid?: string; companyId?: string; kennung?: string } | undefined;
  if (!uid || m?.uid !== uid || !m.companyId || !m.kennung) return;
  const d = timerEntwuerfeLesen(m.companyId, uid).find((x) => x.kennung === m.kennung);
  if (!d) return;
  if (fehler) { timerEntwurfMerken({ ...d, fehler }); return; }
  const sitzungen = timerStandLesen(m.companyId, uid) ?? [];
  const s = sitzungen.find((x) => x.id === d.basis.id);
  const seg = s?.segmente[d.segment];
  if (s && seg) {
    if (d.art === 'buchen' && typeof daten === 'string') seg.buchung = daten;
    if (d.art === 'verwerfen') seg.verworfen_grund = d.grund;
    delete seg.vorgemerkt;
    s.abgeschlossen = s.segmente.every((x) => x.art === 'pause' || !!x.buchung || !!x.verworfen_grund);
    timerStandMerken(m.companyId, uid, sitzungen);
  }
  timerEntwurfEntfernen(d);
}
