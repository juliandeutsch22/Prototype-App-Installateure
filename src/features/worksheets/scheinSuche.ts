import { normProjectNumber } from '@/lib/time';

/**
 * Was ein Suchbegriff meint — und wonach der Server sucht.
 *
 * Die Liste zeigt die jüngsten Scheine; gefiltert wird sofort im geladenen
 * Bestand. Ältere holt „Auf dem Server suchen", und dafür muss klar sein,
 * WONACH: eine Baustellennummer (exakt, auch mit altem „PR-"), ein Zeitraum
 * oder ein Kundenname bzw. ein Wort aus der Notiz (seit 30.09.2026 ebenfalls
 * serverseitig — der Grund dagegen war Firestore, das keine Volltextsuche
 * kannte).
 */

import { monatsEnde } from '@shared/feiertage';

export type Suchabsicht =
  | { art: 'baustelle'; nummer: string }
  | { art: 'zeitraum'; von: string; bis: string; text: string }
  | { art: 'text'; text: string };

/**
 * Was der Begriff bedeutet.
 *
 * DIE REIHENFOLGE IST DIE AUSSAGE: Datumsformen zuerst, danach alles mit
 * einer Ziffer als Baustellennummer, sonst freier Text.
 *
 * Ein Sonderfall bleibt zweideutig und wird bewusst zugunsten des Zeitraums
 * entschieden: „2026-09" kann ein Monat sein oder eine Baustellennummer. Die
 * Nummernvergabe dieses Betriebs füllt auf drei Stellen auf („2026-042"),
 * eine zweistellige Nummer ist damit die unwahrscheinlichere Lesart — und wer
 * sie doch meint, sieht die Scheine des Monats, in dem sie liegt.
 */
export function deuteSuche(text: string): Suchabsicht {
  const t = text.trim();
  if (!t) return { art: 'text', text: '' };

  /* Ein einzelner Tag. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { art: 'zeitraum', von: t, bis: t, text: t };

  /* Ein Monat — als ISO („2026-09") oder wie man ihn hier spricht („09.2026"). */
  const iso = /^(\d{4})-(\d{2})$/.exec(t);
  const deAt = /^(\d{2})\.(\d{4})$/.exec(t);
  const monat = iso
    ? { jahr: Number(iso[1]), monat: Number(iso[2]) }
    : deAt
      ? { jahr: Number(deAt[2]), monat: Number(deAt[1]) }
      : null;
  if (monat && monat.monat >= 1 && monat.monat <= 12) {
    return {
      art: 'zeitraum',
      von: `${monat.jahr}-${String(monat.monat).padStart(2, '0')}-01`,
      bis: monatsEnde(monat.jahr, monat.monat),
      text: t,
    };
  }

  /* Ein ganzes Jahr. */
  if (/^\d{4}$/.test(t)) return { art: 'zeitraum', von: `${t}-01-01`, bis: `${t}-12-31`, text: t };

  /*
    Alles Übrige mit einer Ziffer gilt als Baustellennummer. `normProjectNumber`
    nimmt ein führendes „PR-" weg, das aus Altbeständen stammt — ohne das fände
    die Abfrage genau die alten Scheine nicht, um die es hier geht.
  */
  if (/\d/.test(t)) return { art: 'baustelle', nummer: normProjectNumber(t) };

  return { art: 'text', text: t };
}

/** Was die Oberfläche über den Begriff sagt, bevor jemand sucht. */
export function suchHinweis(absicht: Suchabsicht): string {
  switch (absicht.art) {
    case 'baustelle':
      return `Auf dem Server nach Baustelle ${absicht.nummer} suchen`;
    case 'zeitraum':
      return `Auf dem Server nach Scheinen aus ${absicht.text} suchen`;
    default:
      return `Auf dem Server nach Kundenname oder Notiz „${absicht.text}“ suchen`;
  }
}
