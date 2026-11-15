import type { TimeEntry } from '@/types';
import type { WithId } from './core';
import { wartendeVorgaenge } from './pg/ohneEmpfang';
import { zeileAlsObjekt } from './pg/felder';

/**
 * Eine Zeitbuchung, die auf diesem Gerät im Ausgangsfach wartet (Z4) — für
 * „Meine Einträge“ („wartet auf Verbindung“) und für die Prüfung auf
 * Überschneidung ohne Netz.
 */
export interface WartendeBuchung {
  art: 'anlegen' | 'aendern';
  /** Bei `aendern` nur die geänderten Felder samt Kennung. */
  eintrag: WithId<TimeEntry>;
  angelegt: number;
}

/**
 * Die wartenden Zeitbuchungen des angemeldeten Kontos, je Zeile
 * zusammengelegt (Anlegen und spätere Änderung derselben Buchung).
 */
export async function wartendeZeitbuchungen(companyId: string): Promise<WartendeBuchung[]> {
  const vorgaenge = (await wartendeVorgaenge().catch(() => []))
    .filter((v) => v.tabelle === 'time_entries' && (v.art === 'anlegen' || v.art === 'aendern'))
    .sort((a, b) => a.folge - b.folge);
  const je = new Map<string, { art: 'anlegen' | 'aendern'; daten: Record<string, unknown>; angelegt: number }>();
  for (const v of vorgaenge) {
    const da = je.get(v.zeile);
    if (da) Object.assign(da.daten, v.daten);
    else je.set(v.zeile, { art: v.art as 'anlegen' | 'aendern', daten: { ...v.daten }, angelegt: v.angelegt });
  }
  return [...je.entries()]
    .filter(([, x]) => x.art === 'aendern' || x.daten.company_id === companyId)
    .map(([zeile, x]) => ({
      art: x.art,
      angelegt: x.angelegt,
      eintrag: zeileAlsObjekt<WithId<TimeEntry>>('time_entries', { ...x.daten, id: zeile }),
    }));
}

/**
 * Die Buchungen vom Server und die wartenden auf diesem Gerät, als EIN Stand
 * (Z4): ohne Netz sah der Monteur einen leeren Tag und buchte darüber —
 * beim Senden wies die Datenbank die zweite Buchung ab.
 */
export function mitWartenden(
  server: WithId<TimeEntry>[],
  wartend: WartendeBuchung[],
  uid: string,
  imFenster: (date: string) => boolean,
  exceptId?: string,
): WithId<TimeEntry>[] {
  const nachId = new Map(server.map((e) => [e.id, e]));
  for (const w of wartend) {
    const vorher = nachId.get(w.eintrag.id);
    if (vorher) nachId.set(w.eintrag.id, { ...vorher, ...w.eintrag });
    else if (w.art === 'anlegen') nachId.set(w.eintrag.id, w.eintrag);
  }
  return [...nachId.values()].filter((e) => e.id !== exceptId && e.userId === uid && imFenster(e.date));
}
