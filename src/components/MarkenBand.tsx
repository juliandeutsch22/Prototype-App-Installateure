import ProduktMarke from './ProduktMarke';

/**
 * Das dunkle Band mit dem Senklot-Zeichen — für die Seiten, die ohne die
 * Seitenleiste stehen.
 *
 * Anmeldung, Willkommen und Plattform sehen niemanden die App-Navigation.
 * Die Anmeldung trug das Band schon; Willkommen und Plattform standen als
 * weisse Fläche ohne Zeichen da und sahen damit aus wie eine fremde Seite
 * (Prüflauf 24.09.2026, D19 und C12).
 */
export default function MarkenBand() {
  return (
    <div className="panel-dark rounded px-6 py-5">
      <ProduktMarke hoehe={36} className="text-white" />
    </div>
  );
}
