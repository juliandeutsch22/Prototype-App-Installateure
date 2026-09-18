import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { isGF, isVerw } from '@/lib/permissions';
import { useModul } from '@/lib/useModule';
import { listFaelligeWartungen } from '@/lib/db/wartungen';
import { todayStr } from '@/lib/time';
import { monateDazu, VORLAUF_TAGE } from '@/features/maintenance/wartungsplan';

/**
 * Was an Wartungen ansteht — auf der Startseite, nicht in einer Liste.
 *
 * WARUM ÜBERHAUPT HIER. Eine Wartungsliste, die man aufrufen muss, wird im
 * Frühjahr aufgerufen und dann nicht mehr. Der Schaden einer vergessenen
 * Wartung fällt niemandem auf: der Kunde ruft nicht an, um sich zu
 * beschweren, dass niemand gekommen ist — er wechselt beim nächsten Gebrechen
 * den Betrieb. Deshalb steht der Hinweis dort, wo ohnehin jeder hinsieht.
 *
 * NUR WENN ETWAS IST. Dieselbe Regel wie bei den Nachtläufen: eine dauerhafte
 * Kachel „nichts fällig" wäre nach zwei Wochen unsichtbar, und mit ihr der
 * eine Tag, an dem etwas darin steht.
 *
 * FÜR LEITUNG UND VERWALTUNG. Beim Kunden anzurufen und einen Termin zu
 * vereinbaren ist Büroarbeit; der Monteur kann damit nichts anfangen.
 */
export default function WartungHinweis() {
  const { user } = useAuth();
  const an = useModul('wartung');
  const [anzahl, setAnzahl] = useState(0);
  const [ueberfaellig, setUeberfaellig] = useState(0);

  const companyId = user?.companyId;
  const rolle = user?.role;

  useEffect(() => {
    if (!an || !companyId || !rolle || !(isGF(rolle) || isVerw(rolle))) return;
    let weg = false;
    void (async () => {
      try {
        const heute = todayStr();
        /*
          Der Stichtag liegt einen Monat voraus, nicht auf heute. Wer erst am
          Fälligkeitstag davon erfährt, kann keinen Termin mehr vereinbaren —
          der Kunde muss ja auch zu Hause sein.

          Gerechnet über Monate statt über Tage, damit derselbe Vorlauf gilt
          wie in der Liste (`VORLAUF_TAGE` ist ein Monat).
        */
        const bis = monateDazu(heute, 1);
        const faellig = await listFaelligeWartungen(companyId, bis);
        if (weg) return;
        setAnzahl(faellig.length);
        setUeberfaellig(faellig.filter((w) => w.faelligAm < heute).length);
      } catch {
        /*
          Schweigen, nicht melden. Der Hinweis ist eine Zugabe auf einer
          Seite, die auch ohne ihn ihren Zweck erfüllt; eine Fehlermeldung
          dafür stünde neben den Dingen, auf die es hier ankommt.
        */
      }
    })();
    return () => {
      weg = true;
    };
  }, [an, companyId, rolle]);

  if (anzahl === 0) return null;

  return (
    <div className="rounded border-l-[3px] border-info bg-surface-2 p-4 text-info">
      <p className="font-semibold">
        {anzahl === 1 ? 'Eine Wartung steht an' : `${anzahl} Wartungen stehen an`}
      </p>
      <p className="mt-1 text-sm">
        {ueberfaellig > 0
          ? `${ueberfaellig} davon ${ueberfaellig === 1 ? 'ist' : 'sind'} überfällig. `
          : `Fällig in den nächsten ${VORLAUF_TAGE} Tagen. `}
        <Link to="/wartungen" className="underline">
          Zu den Wartungen
        </Link>
      </p>
    </div>
  );
}
