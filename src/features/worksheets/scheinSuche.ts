import { normProjectNumber } from '@/lib/time';

/**
 * Was ein Suchbegriff meint — und was sich damit serverseitig holen lässt.
 *
 * WARUM ES DAS BRAUCHT. Die Suche in der Scheinliste filterte den GELADENEN
 * Bestand im Browser: die jüngsten fünfzig. Ein Schein vom März war damit
 * nicht auffindbar, egal was jemand eintippte — und das Feld sagte nichts
 * dazu, es lieferte einfach kein Ergebnis. Dieselbe Fehlerform wie beim
 * Buchhaltungs-Export damals: eine leere Antwort, die wie ein Befund aussieht.
 *
 * WARUM NICHT EINFACH ALLES SERVERSEITIG SUCHEN. Firestore kann keine
 * Volltextsuche. Nach einem Kundennamen liesse sich nur mit einem zusätzlich
 * gepflegten Feld (`nameLower`) suchen — und bis das auf jedem Altbestand
 * nachgetragen wäre, fände die Suche alte Scheine STILLSCHWEIGEND nicht.
 * Genau das Verhalten, das hier beseitigt werden soll.
 *
 * Deshalb die Trennung, und sie steht auch in der Oberfläche:
 *
 *   Baustellennummer und Zeitraum  — serverseitig, exakt, ohne neues Feld
 *   Kundenname und Notiz           — nur im geladenen Bestand
 *
 * Das deckt ab, wonach im Büro tatsächlich gesucht wird („die Scheine zur
 * 2026-042", „alles vom März"), und behauptet für den Rest nichts.
 */

export type Suchabsicht =
  | { art: 'baustelle'; nummer: string }
  | { art: 'zeitraum'; von: string; bis: string; text: string }
  | { art: 'text' };

/** Letzter Tag eines Monats, als ISO-Tag. */
function monatsEnde(jahr: number, monat: number): string {
  // Tag 0 des FOLGEmonats ist der letzte des gesuchten — spart eine
  // Schalttagsregel, die irgendwann jemand falsch abschreibt.
  const d = new Date(Date.UTC(jahr, monat, 0));
  return d.toISOString().slice(0, 10);
}

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
  if (!t) return { art: 'text' };

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

  return { art: 'text' };
}

/** Was die Oberfläche über den Begriff sagt, bevor jemand sucht. */
export function suchHinweis(absicht: Suchabsicht): string {
  switch (absicht.art) {
    case 'baustelle':
      return `Auf dem Server nach Baustelle ${absicht.nummer} suchen`;
    case 'zeitraum':
      return `Auf dem Server nach Scheinen aus ${absicht.text} suchen`;
    default:
      return 'Nach Kundenname oder Notiz kann nur im geladenen Bestand gesucht werden — für ältere Scheine bitte die Baustellennummer oder einen Zeitraum eingeben (etwa 2026-042, 09.2026 oder 2026).';
  }
}
