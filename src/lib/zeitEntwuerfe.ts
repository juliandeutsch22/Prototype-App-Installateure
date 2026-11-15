import type { TimeEntry } from '@/types';
import type { Sendung } from '@/lib/sync/ausgangsfach';
import type { WithId } from '@/lib/db/core';
import { zeileAlsObjekt } from '@/lib/db/pg/felder';

/**
 * ZEITBUCHUNGEN, DIE NICHT ANGEKOMMEN SIND — als Entwurf auf dem Gerät (Z4,
 * Durchsicht 15.11.2026).
 *
 * Lehnte der Server eine vorgemerkte Buchung ab (oder gab das Fach sie nach
 * einer unklaren Antwort auf), war sie weg: die Meldung sagte weder Tag noch
 * Grund, die Eingabe war verloren. Der Timer macht es seit E73 richtig — sein
 * Entwurf bleibt mit Grund stehen (`zeitsitzungSpeicher.ts`). Dasselbe hier
 * für die Buchung von Hand: der Entwurf trägt die Daten, wie sie ins Fach
 * gingen, den Tag und den Grund; „Meine Einträge“ zeigt ihn zum Wiederöffnen.
 *
 * IM `localStorage`, wie die Entwürfe des Timers: ein eigener Schlüssel je
 * Buchung, damit zwei Tabs einander nichts überschreiben. Gelingt das
 * Speichern nicht (privates Fenster), sagt die Meldung das.
 */
export interface ZeitEntwurf {
  /** Die Kennung der Zeile, wie sie im Fach stand. */
  kennung: string;
  uid: string;
  companyId?: string;
  /** Neu angelegt oder eine Änderung an einer bestehenden Buchung. */
  art: 'anlegen' | 'aendern';
  /** Die Spalten, wie sie gesendet wurden — Anlegen und Ändern derselben Zeile zusammengelegt. */
  daten: Record<string, unknown>;
  grund: string;
  angelegtAm: number;
  /** Vom Server abgelehnt oder vom Monteur aus dem Fach zurückgeholt. */
  quelle: 'abgelehnt' | 'zurueckgeholt';
}

/** Das Ereignis, wenn sich die Entwürfe ändern — Ansichten laden danach neu. */
export const ZEIT_ENTWURF_EREIGNIS = 'senklot:zeitentwurf';

const PREFIX = 'senklot.zeitentwurf.';
const schluessel = (uid: string, kennung: string) => `${PREFIX}${uid}.${kennung}`;

function melden(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ZEIT_ENTWURF_EREIGNIS));
}

/** Aus den Vorgängen des Fachs (in seiner Reihenfolge) einen Entwurf. */
export function zeitEntwurfAus(
  vorgaenge: readonly Sendung[],
  grund: string,
  quelle: ZeitEntwurf['quelle'],
): ZeitEntwurf | null {
  const erster = vorgaenge[0];
  if (!erster || (erster.art !== 'anlegen' && erster.art !== 'aendern')) return null;
  const daten = Object.assign({}, ...vorgaenge.map((v) => v.daten)) as Record<string, unknown>;
  return {
    kennung: erster.zeile,
    uid: erster.uid ?? '',
    companyId: typeof daten.company_id === 'string' ? daten.company_id : undefined,
    art: erster.art,
    daten,
    grund,
    angelegtAm: Date.now(),
    quelle,
  };
}

export function zeitEntwurfMerken(e: ZeitEntwurf): boolean {
  try {
    localStorage.setItem(schluessel(e.uid, e.kennung), JSON.stringify(e));
    melden();
    return true;
  } catch {
    return false;
  }
}

/** Die Entwürfe dieses Kontos — ältester zuerst. Ohne Konto (ältere Vormerkungen) gehören sie jedem. */
export function zeitEntwuerfeLesen(uid: string, companyId?: string): ZeitEntwurf[] {
  const liste: ZeitEntwurf[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const e = JSON.parse(localStorage.getItem(k) ?? 'null') as ZeitEntwurf | null;
        if (!e || typeof e.kennung !== 'string' || !e.daten) continue;
        if (e.uid && e.uid !== uid) continue;
        if (companyId && e.companyId && e.companyId !== companyId) continue;
        liste.push(e);
      } catch {
        // Ein beschädigter Entwurf darf die anderen nicht verdecken.
      }
    }
  } catch {
    return [];
  }
  return liste.sort((a, b) => a.angelegtAm - b.angelegtAm);
}

export function zeitEntwurfEntfernen(e: Pick<ZeitEntwurf, 'uid' | 'kennung'>): void {
  try {
    localStorage.removeItem(schluessel(e.uid, e.kennung));
    melden();
  } catch {
    // Ein gesperrter Speicher bleibt unverändert.
  }
}

/** Ein Entwurf als Buchung der App — so öffnet ihn das Formular. */
export function entwurfAlsEintrag(e: ZeitEntwurf): WithId<TimeEntry> {
  return zeileAlsObjekt<WithId<TimeEntry>>('time_entries', { ...e.daten, id: e.kennung });
}
