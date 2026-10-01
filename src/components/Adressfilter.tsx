import { useSearchParams } from 'react-router-dom';
import Hinweiszeile from './Hinweiszeile';

/**
 * EIN FILTER AUS DER ADRESSE — sichtbar und mit einem Griff wieder weg
 * (Startseite, Nachtest 01.10.2026 Paket B).
 *
 * Die Startseite führt mit „und N weitere →“ auf eine schon gefilterte
 * Fachseite. Stünde der Filter nirgends, sähe die Liste aus wie der ganze
 * Bestand — wer dann etwas sucht, das nicht dabei ist, hält es für weg.
 * Darum steht über der Liste, was gefiltert ist, und „Alle zeigen“ nimmt
 * die genannten Parameter aus der Adresse.
 */
export default function Adressfilter({
  text,
  parameter,
}: {
  /** „Nur offene Anforderungen“ */
  text: string;
  /** Welche Adressparameter „Alle zeigen“ entfernt. */
  parameter: string[];
}) {
  const [suche, setSuche] = useSearchParams();
  return (
    <Hinweiszeile role="status">
      <p className="flex flex-wrap items-center gap-x-3">
        <span>
          <b>Gefiltert:</b> {text}
        </span>
        <button
          type="button"
          className="link-hinweis-weiter py-3.5 -my-3.5"
          onClick={() => {
            const neu = new URLSearchParams(suche);
            for (const p of parameter) neu.delete(p);
            setSuche(neu, { replace: true });
          }}
        >
          Alle zeigen
        </button>
      </p>
    </Hinweiszeile>
  );
}
