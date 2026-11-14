import ProduktMarke from './ProduktMarke';

/**
 * Die Senklot-Marke oben auf den Seiten, die ohne die Seitenleiste stehen
 * (Zwei-Faktor-Anmeldung, Startpasswort, Wiederherstellungscodes).
 *
 * Ohne Marke sahen diese Seiten aus wie eine fremde Seite (Prüflauf
 * 24.09.2026, D19 und C12). Bis V10 trug sie ein dunkles Band; seit
 * 13.11.2026 steht sie wie im Login auf dem warmen Papier, mit einer feinen
 * Linie darunter — die dunkle Fläche gehört dem laufenden Arbeitstag und der
 * Navigation.
 */
export default function MarkenBand() {
  return (
    <div className="border-b border-line pb-4">
      <ProduktMarke hoehe={32} />
    </div>
  );
}
