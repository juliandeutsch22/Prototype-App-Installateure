import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Kennzahl {
  key: string;
  label: string;
  wert: ReactNode;
  zusatz?: string;
  to: string;
  ton?: 'danger';
  /**
   * Nichts zu tun: keine offene Rechnung, kein unverrechneter Schein, keine
   * Anforderung. Solche Zahlen fallen aus der Zeile — „Überfällig € 0,00“ sagt
   * nichts, was das Fehlen der Angabe nicht auch sagt. Zustände wie Resturlaub,
   * Saldo oder aktive Baustellen tragen das Feld nie: dort ist auch die Null
   * eine Auskunft.
   */
  leer?: boolean;
}

/**
 * DER STAND IN EINER ZEILE (Entscheidung E22, 25.10.2026).
 *
 * Bis hierher standen bis zu vier große Kacheln über „Zu erledigen“. Sie
 * sahen in keiner Rolle und keiner Breite gut aus: oft „€ 0,00“ in großer
 * Schrift, bei einer einzelnen Zahl eine verlorene Kachel, und was dringend
 * war, stand darunter ohnehin noch einmal als Aufgabe. Die Startseite ist
 * zum Handeln da; der Stand ist der Blick nebenbei.
 *
 * Jetzt: Beschriftung, Wert und Zusatz hintereinander, jeder Eintrag ein
 * Verweis auf dieselbe gefilterte Liste wie vorher die Kachel. Am Handy
 * untereinander, Beschriftung links, Wert rechts. Gerechnet wird nach wie vor
 * in `aufbau.ts`; hier ändert sich nur die Darstellung.
 */
export default function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte.filter((k) => !k.leer).slice(0, 4);
  if (liste.length === 0) return null;
  return (
    <ul className="lage-zeile" aria-label="Stand">
      {liste.map((k) => (
        <li key={k.key} className="lage-punkt">
          <Link to={k.to} className="lage-eintrag">
            <span className="lage-name">{k.label}</span>{' '}
            <span className={k.ton === 'danger' ? 'lage-wert lage-wert-rot' : 'lage-wert'}>{k.wert}</span>
            {k.zusatz && (
              <>
                {' '}
                <span className="lage-zusatz">{k.zusatz}</span>
              </>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
