import TeamWoche from './TeamWoche';
import Einsatzplanung from './Einsatzplanung';

/**
 * Die Woche — in zwei Fassungen unter derselben Komponente, weil zwei
 * Adressen sie so einbinden (`/assignments/woche` und `/my-schedule/team`).
 *
 * `nurLesen`: die Team-Woche für alle Mitarbeiter, nichts zum Antippen.
 * Ohne: die Einsatzplanung mit Woche und Monat (Runde 4). Getrennt
 * gezeichnet, gemeinsam gerechnet (`useWochenDaten`).
 */
export default function WochenplanView({ nurLesen = false }: { nurLesen?: boolean }) {
  return nurLesen ? <TeamWoche /> : <Einsatzplanung />;
}
