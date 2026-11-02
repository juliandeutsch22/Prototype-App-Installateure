import type { Freistellung } from '@/types';
import { ART_NAME, anlassVon, anlaesseDesBetriebs, istArztbesuch } from '@shared/freistellung';
import { datumAT } from '@/lib/datum';
import { fmtDauer, localDateStr } from '@/lib/time';
import { zeitraumText } from './abwesenheitText';

/** Texte zum Sonderurlaub — von Antragsliste und Bestätigen geteilt. */

/** „11.11.2026" oder „03.12.2026, 08:00–10:30" — der Zeitraum eines Antrags. */
export function freistellungZeitraum(f: Pick<Freistellung, 'von' | 'bis' | 'zeitVon' | 'zeitBis'>): string {
  const zeit = f.zeitVon && f.zeitBis ? `, ${f.zeitVon.slice(0, 5)}–${f.zeitBis.slice(0, 5)}` : '';
  return zeitraumText(f.von, f.bis) + zeit;
}

/** Art und Anlass in Worten. Den Anlass sieht nur, wer den Antrag lesen darf. */
export function freistellungWas(f: Pick<Freistellung, 'art' | 'anlass' | 'zusatzwoche' | 'kindUnter12'>, abweichend?: Record<string, number> | null): string {
  // Ein Arztbesuch ist rechtlich eine Dienstverhinderung, heißt aber, was er ist (E35).
  if (istArztbesuch(f)) return 'Arztbesuch';
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

/** Minuten des Termins eines stundenweisen Antrags. */
export function terminMinuten(f: Pick<Freistellung, 'zeitVon' | 'zeitBis'>): number {
  if (!f.zeitVon || !f.zeitBis) return 0;
  const [h1, m1] = f.zeitVon.split(':').map(Number);
  const [h2, m2] = f.zeitBis.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

/**
 * Was vom Arztbesuch angerechnet ist (E35) — nur, wenn es vom Termin
 * abweicht oder begründet geändert wurde: „Angerechnet 2:00 von 3:00 —
 * Grund“. Sonst sagt der Termin alles.
 */
export function anrechnungVermerk(f: Pick<Freistellung, 'art' | 'anlass' | 'status' | 'minuten' | 'zeitVon' | 'zeitBis' | 'anrechnungGrund'>): string | null {
  if (!istArztbesuch(f) || f.status !== 'Bestätigt' || f.minuten == null) return null;
  const termin = terminMinuten(f);
  const angerechnet = Math.round(Number(f.minuten));
  if (angerechnet === termin && !f.anrechnungGrund) return null;
  return `Angerechnet ${fmtDauer(angerechnet)} von ${fmtDauer(termin)}${f.anrechnungGrund ? ` — ${f.anrechnungGrund}` : ' (der Rest lag außerhalb der Sollzeit)'}`;
}

/** Was aus einem abgelehnten Arztbesuch wurde (E35). */
export function ablehnungVermerk(f: Pick<Freistellung, 'status' | 'ablehnungFolge'>): string | null {
  if (f.status !== 'Abgelehnt' || !f.ablehnungFolge) return null;
  return f.ablehnungFolge === 'zeitausgleich'
    ? 'Als Zeitausgleich gebucht'
    : 'Nicht gebucht — die Zeit fehlt im Saldo';
}

/**
 * „2:30" → 150 Minuten. Die angerechnete Zeit eines Arztbesuchs wird so
 * eingegeben, wie die App Dauern zeigt (`fmtMin`). Alles andere: null.
 */
export function leseDauer(text: string): number | null {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
