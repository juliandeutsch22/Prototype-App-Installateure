import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { eingeteiltText, planAdresse } from './eingeteilt';

/**
 * „AN 3 TAGEN EINGETEILT“ (Durchsicht 15.11.2026, V1): beim Genehmigen eines
 * Urlaubs und beim Erfassen einer Krankmeldung steht, ob die Person im
 * Zeitraum eingeteilt ist — mit dem Sprung in den Plan, wo umgeplant wird.
 * Vorher erfuhr der Planer davon erst beim Öffnen der Woche.
 *
 * Nur Tage und Anzahl, keine Baustellen: wer genehmigt, entscheidet über die
 * Abwesenheit, nicht über die Einsätze. Den Sprung bekommt, wer planen darf
 * (`darfPlanen`); die Buchhaltung sieht den Satz ohne Weg, den sie nicht
 * gehen kann. Ohne Einsatzplanung (`an`) wird nicht gefragt.
 */
export default function EingeteiltHinweis({ companyId, an, darfPlanen, uid, von, bis, vorne }: {
  companyId: string;
  an: boolean;
  darfPlanen: boolean;
  uid: string;
  von: string;
  bis: string;
  /** Was davor steht (etwa Name und Zeitraum) — nur, wenn es etwas zu sagen gibt. */
  vorne?: string;
}) {
  const [tage, setTage] = useState<string[] | null>(null);

  useEffect(() => {
    if (!an) return;
    let weg = false;
    listAssignmentsForUserInRange(companyId, uid, von, bis)
      .then((a) => { if (!weg) setTage([...new Set(a.map((x) => x.date))].sort()); })
      // Kommt die Auskunft nicht, steht nichts da — die Entscheidung hängt nicht an ihr.
      .catch(() => { if (!weg) setTage(null); });
    return () => { weg = true; };
  }, [an, companyId, uid, von, bis]);

  if (!an || !tage || tage.length === 0) return null;
  const text = eingeteiltText(tage);
  return (
    <span className="mt-1 block text-meta text-warning">
      {vorne ? `${vorne}${text.replace(/^An/, 'an')}` : text}
      {darfPlanen && (
        <>
          {' · '}
          <Link className="link" to={planAdresse(tage[0])}>Im Plan ansehen</Link>
        </>
      )}
    </span>
  );
}
