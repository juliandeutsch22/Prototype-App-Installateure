import { Link } from 'react-router-dom';
import { EintragZeile } from './Handlungsbedarf';
import StartKarte from './StartKarte';
import { JE_ABSCHNITT, type Zeile } from './abschnitte';

/**
 * HEUTE ALS LISTE (Skizzen 02, 03): Lieferungen, die heute erwartet werden,
 * bzw. die Zahlungseingänge von heute. Höchstens drei, der Rest auf der
 * gefilterten Fachseite.
 */
export default function HeuteListe({
  zusatz,
  zeilen,
  verweis,
}: {
  zusatz: string;
  zeilen: Zeile[];
  verweis: { to: string; text: string };
}) {
  if (zeilen.length === 0) return null;
  const rest = zeilen.length - JE_ABSCHNITT;
  return (
    <StartKarte titel="Heute" zusatz={zusatz} verweis={verweis}>
      <ul>
        {zeilen.slice(0, JE_ABSCHNITT).map((z) => <EintragZeile key={z.key} z={z} />)}
      </ul>
      {rest > 0 && (
        <Link to={verweis.to} className="start-weiter">
          und {rest} weitere →
        </Link>
      )}
    </StartKarte>
  );
}
