import { useEffect, useMemo, useState } from 'react';
import type { Material } from '@/types';
import type { WithId } from '@/lib/db/core';
import { sucheKatalog } from '@/lib/db/materials';

/** Wie viele Treffer der Server liefert — genug, dass nach den Filtern der Ansicht acht bleiben. */
const VOM_SERVER = 20;

/** Dieselbe Suche wie bei der Retoure: Bezeichnung, Kategorie und Artikelnummer. */
export function passtZurSuche(m: Pick<Material, 'name' | 'category' | 'articleNumber'>, begriff: string): boolean {
  const q = begriff.trim().toLowerCase();
  return !!q && [m.name, m.category, m.articleNumber].some((v) => v?.toLowerCase().includes(q));
}

/**
 * DIE SUCHE IM KATALOG FÜR SCHEIN UND RÜSTLISTE (19.10.2026).
 *
 * Gesucht wird auf dem Server, über den ganzen Katalog. Bis hierher suchten
 * beide im geladenen Katalog, und der endet bei tausend Artikeln: nach einem
 * DATANORM-Import fand der Monteur einen Artikel dahinter nicht und schrieb
 * ihn als freie Zeile — auf der Rechnung stand er dann ohne Preis.
 *
 * DIE GELADENEN ARTIKEL BLEIBEN DIE RESERVE. Bis die Antwort da ist, zeigt die
 * Suche, was sie unter ihnen findet; kommt keine Antwort (kein Empfang im
 * Keller), bleibt es dabei, und die Ansicht sagt es. So geht nichts verloren,
 * was ohne Netz bisher ging.
 */
export function useKatalogSuche(
  companyId: string | undefined,
  begriff: string,
  reserve: readonly WithId<Material>[],
): { treffer: WithId<Material>[]; laeuft: boolean; ohneNetz: boolean } {
  const q = begriff.trim();
  const [antwort, setAntwort] = useState<{ fuer: string; treffer: WithId<Material>[] } | null>(null);
  const [fehlschlag, setFehlschlag] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !q) return;
    let weg = false;
    // Kurz warten: nicht bei jedem Tastendruck eine Abfrage.
    const t = setTimeout(() => {
      sucheKatalog(companyId, q, VOM_SERVER)
        .then((liste) => {
          if (weg) return;
          setAntwort({ fuer: q, treffer: liste });
          setFehlschlag(null);
        })
        .catch(() => {
          if (!weg) setFehlschlag(q);
        });
    }, 300);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [companyId, q]);

  const vorOrt = useMemo(() => (q ? reserve.filter((m) => passtZurSuche(m, q)) : []), [reserve, q]);
  const vomServer = antwort && antwort.fuer === q ? antwort.treffer : null;
  const ohneNetz = fehlschlag === q;
  return {
    treffer: !q ? [] : vomServer ?? vorOrt,
    laeuft: !!q && !vomServer && !ohneNetz,
    ohneNetz,
  };
}
