import type { IconName } from '@/components/Icon';
import type { KanalKopf, Nachricht } from '@/lib/db/nachrichten';

/**
 * WAS MAN MIT EINER NACHRICHT TUN KANN — an einer Stelle festgelegt, damit
 * die Leiste beim Darüberfahren und das Fenster nach langem Drücken genau
 * dasselbe anbieten (E77).
 *
 *   - jede, die nicht gelöscht ist: reagieren (nicht bei Schreibsperre —
 *     zurücknehmen geht dort weiter, über das Kästchen), Text kopieren;
 *   - die eigene: bearbeiten (nicht bei Schreibsperre), löschen, aus einem
 *     privaten Gespräch in eine Baustelle übernehmen;
 *   - eine fremde: melden (D5), solange man sie nicht schon gemeldet hat.
 */
export interface Moeglichkeiten {
  reagieren: boolean;
  bearbeiten: boolean;
  uebernehmen: boolean;
  kopieren: boolean;
  melden: boolean;
  loeschen: boolean;
}

export function moeglichkeiten(n: Nachricht, kopf: KanalKopf, nachrichtenAn: boolean): Moeglichkeiten {
  const da = !n.geloeschtAm;
  return {
    reagieren: da && !kopf.sperre,
    bearbeiten: da && n.eigene && !kopf.sperre,
    uebernehmen: da && n.eigene && kopf.art !== 'baustelle' && nachrichtenAn,
    kopieren: da && !!n.text,
    melden: da && !n.eigene && !n.gemeldet,
    loeschen: da && n.eigene,
  };
}

export type Handlung = 'bearbeiten' | 'uebernehmen' | 'kopieren' | 'melden' | 'loeschen';

/** Die Handlungen in fester Reihenfolge, jede mit genau einem Zeichen (E74). */
export const HANDLUNGEN: { art: Handlung; name: string; icon: IconName }[] = [
  { art: 'bearbeiten', name: 'Bearbeiten', icon: 'pencil' },
  { art: 'uebernehmen', name: 'In eine Baustelle übernehmen', icon: 'building' },
  { art: 'kopieren', name: 'Text kopieren', icon: 'kopieren' },
  { art: 'melden', name: 'Melden', icon: 'melden' },
  { art: 'loeschen', name: 'Löschen', icon: 'papierkorb' },
];

export const irgendwas = (m: Moeglichkeiten) => Object.values(m).some(Boolean);

/** Den Text in die Zwischenablage — im Klick selbst, sonst lehnt Safari ab. */
export async function textKopieren(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
