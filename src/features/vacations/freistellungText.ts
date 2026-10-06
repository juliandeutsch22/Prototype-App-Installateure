import type { Freistellung } from '@/types';
import { ART_NAME, anlassVon, anlaesseDesBetriebs } from '@shared/freistellung';
import { datumAT } from '@/lib/datum';
import { localDateStr } from '@/lib/time';
import { zeitraumText } from './abwesenheitText';

/** Texte zum Sonderurlaub — von Antragsliste und Bestätigen geteilt. */

/** „11.11.2026" oder „03.12.2026, 08:00–10:30" — der Zeitraum eines Antrags. */
export function freistellungZeitraum(f: Pick<Freistellung, 'von' | 'bis' | 'zeitVon' | 'zeitBis'>): string {
  const zeit = f.zeitVon && f.zeitBis ? `, ${f.zeitVon.slice(0, 5)}–${f.zeitBis.slice(0, 5)}` : '';
  return zeitraumText(f.von, f.bis) + zeit;
}

/** Art und Anlass in Worten. Den Anlass sieht nur, wer den Antrag lesen darf. */
export function freistellungWas(f: Pick<Freistellung, 'art' | 'anlass' | 'zusatzwoche' | 'kindUnter12'>, abweichend?: Record<string, number> | null): string {
  if (f.art === 'dienstverhinderung') {
    const a = anlassVon(f.anlass, anlaesseDesBetriebs(abweichend));
    return `${ART_NAME.dienstverhinderung}${a ? ` — ${a.name}` : ''}`;
  }
  if (f.art === 'pflegefreistellung') {
    return `${ART_NAME.pflegefreistellung}${f.kindUnter12 ? ' — Kind unter 12' : ''}${f.zusatzwoche ? ', zweite Woche' : ''}`;
  }
  return ART_NAME.unbezahlt;
}

/** Der dauerhafte Vermerk zum Nachweis — die Datei selbst gibt es dann nicht mehr. */
export function nachweisVermerk(f: Pick<Freistellung, 'nachweisGeprueftVonName' | 'nachweisGeprueftAm'>): string | null {
  if (!f.nachweisGeprueftVonName) return null;
  const am = f.nachweisGeprueftAm ? ` am ${datumAT(localDateStr(new Date(f.nachweisGeprueftAm)))}` : '';
  return `Nachweis geprüft von ${f.nachweisGeprueftVonName}${am}`;
}

/**
 * Was mit den Tagen über dem Kontingent geschah (Runde 3, G17) — für die
 * eigene Liste und für die Bestätigenden.
 */
export function ueberVermerk(f: Pick<Freistellung, 'ueberKontingent' | 'ueberTage' | 'ueberGrund'>): string | null {
  if (!f.ueberKontingent || !f.ueberTage) return null;
  const n = Number(f.ueberTage);
  const tage = `${n} ${n === 1 ? 'Tag' : 'Tage'} über dem Kontingent`;
  return f.ueberKontingent === 'urlaub'
    ? `${tage} als Urlaub gebucht`
    : `${tage} als Sonderurlaub bestätigt${f.ueberGrund ? ` — ${f.ueberGrund}` : ''}`;
}
