import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { List } from './ListRow';

/**
 * Eine Liste mit Obergrenze: höchstens `grenze` Zeilen, danach
 * „und X weitere“.
 *
 * DIE GRENZE IST EINE EINSTELLUNG DIESES BAUSTEINS, keine Ansicht rechnet sie
 * selbst. Vorher schnitt jede Stelle ihre Liste eigenhändig ab und schrieb
 * ihren eigenen Satz darunter — auf der Startseite „und 3 weitere — alle
 * unter …“, in der Kundenakte „Alle 7 zeigen“, im Einsatzplan „… im
 * Kalender links nachschlagen“. Dreimal dieselbe Idee, dreimal anders
 * gesagt.
 *
 * Wohin „und X weitere“ führt, entscheidet die Aufrufstelle:
 *   `mehr.to`         ein Link auf die ganze Liste (der Normalfall)
 *   `mehr.aufklappen` die übrigen Zeilen an Ort und Stelle zeigen
 *   ohne `mehr`       nur die Zahl, mit einem erklärenden `nachsatz`
 */
export default function Grenzliste<T>({
  eintraege,
  grenze = 5,
  zeile,
  mehr,
  nachsatz,
}: {
  eintraege: T[];
  grenze?: number;
  /** Rendert EINE Zeile — in der Regel ein `<ListRow key=…>`. */
  zeile: (eintrag: T) => ReactNode;
  mehr?: { to: string } | { aufklappen: true };
  /** Steht hinter „und X weitere“, z. B. „— alle unter Baustellen“. */
  nachsatz?: ReactNode;
}) {
  const [alle, setAlle] = useState(false);
  const rest = eintraege.length - grenze;
  const sichtbar = alle ? eintraege : eintraege.slice(0, grenze);

  return (
    <>
      <List>{sichtbar.map(zeile)}</List>
      {rest > 0 && (
        <p className="grenze-weitere">
          {mehr && 'to' in mehr ? (
            <Link to={mehr.to} className="textlink">
              und {rest} weitere
            </Link>
          ) : mehr && 'aufklappen' in mehr ? (
            <button type="button" className="textlink-allein" onClick={() => setAlle((a) => !a)}>
              {alle ? 'Weniger zeigen' : `und ${rest} weitere`}
            </button>
          ) : (
            <>und {rest} weitere</>
          )}
          {nachsatz && !alle && <> {nachsatz}</>}
        </p>
      )}
    </>
  );
}
