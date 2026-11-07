import { useEffect, useMemo, useState } from 'react';
import type { TimeEntry, ZeitfeldDefinition } from '@/types';
import { istAn } from '@/lib/module';
import {
  feldsatzLaden, gemerkterFeldsatz, listFeldwerte, listZeitfeldFassungen, type Feldsatz,
} from '@/lib/db/zeitfelder';
import { werteJeBuchung, type ZeitfeldSatz, type ZeitfeldWert } from '@/lib/zeitfelder';

/**
 * DIE FREIEN ZEITFELDER FÜR EINE ANSICHT (M06b).
 *
 * `useFeldsatz`: die geltende Fassung und die Definitionen — erst der auf dem
 * Gerät gemerkte Stand (ohne Empfang der einzige), dann frisch geladen. Ist
 * die Unterfähigkeit aus, gibt es keine Felder, und nichts wird geladen.
 */
export interface FeldsatzStand {
  an: boolean;
  satz: ZeitfeldSatz | null;
  definitionen: ZeitfeldDefinition[];
  /** Noch nichts da — weder gemerkt noch geladen. */
  laedt: boolean;
}

function alsStand(an: boolean, f: Feldsatz | null, laedt: boolean): FeldsatzStand {
  return {
    an,
    satz: an && f?.fassung ? { nummer: f.fassung.nummer, felder: f.fassung.felder } : null,
    definitionen: an ? f?.definitionen ?? [] : [],
    laedt,
  };
}

export function useFeldsatz(companyId: string | undefined, module: Record<string, boolean> | undefined): FeldsatzStand {
  const an = !!companyId && istAn(module, 'zeiterfassung.freie_zeitfelder');
  const [satz, setSatz] = useState<Feldsatz | null>(() => (companyId ? gemerkterFeldsatz(companyId) : null));
  const [geladen, setGeladen] = useState(false);
  useEffect(() => {
    if (!companyId || !an) return;
    let weg = false;
    const gemerkt = gemerkterFeldsatz(companyId);
    if (gemerkt) setSatz(gemerkt);
    Promise.resolve()
      .then(() => feldsatzLaden(companyId))
      .then((f) => { if (!weg) setSatz(f); })
      // Ohne Netz bleibt der gemerkte Stand; ohne ihn gibt es eben keine Felder.
      .catch(() => undefined)
      .finally(() => { if (!weg) setGeladen(true); });
    return () => { weg = true; };
  }, [companyId, an]);
  return useMemo(() => alsStand(an, satz, !satz && !geladen), [an, satz, geladen]);
}

/**
 * Die Werte der Buchungen eines Zeitraums und die Fassungen, unter denen sie
 * eingetroffen sind — für Liste, Monatsansicht und Export. Neu geladen, wenn
 * sich die Buchungen ändern (eine geänderte Angabe ändert auch ihre Buchung).
 */
export interface FeldwerteStand {
  werte: Map<string, Record<string, ZeitfeldWert>>;
  fassungen: Map<number, ZeitfeldSatz>;
  fehler: boolean;
}

const LEER: FeldwerteStand = { werte: new Map(), fassungen: new Map(), fehler: false };

export function useFeldwerte(a: {
  companyId: string | undefined;
  an: boolean;
  von: string;
  bis: string;
  userId?: string;
  eintraege: readonly Pick<TimeEntry, 'id' | 'zeitfeldFassung' | 'updatedAt'>[];
}): FeldwerteStand {
  const [stand, setStand] = useState<FeldwerteStand>(LEER);
  const { companyId, an, von, bis, userId } = a;
  // Was die Werte bestimmt: welche Buchungen, in welchem Stand.
  const schluessel = a.eintraege.map((e) => `${e.id}:${e.updatedAt ?? ''}`).sort().join('|');
  const nummern = useMemo(
    () => [...new Set(a.eintraege.map((e) => e.zeitfeldFassung).filter((n): n is number => typeof n === 'number'))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schluessel],
  );
  useEffect(() => {
    if (!companyId || !an) {
      setStand(LEER);
      return;
    }
    let weg = false;
    Promise.resolve()
      .then(() => Promise.all([listFeldwerte(companyId, von, bis, userId), listZeitfeldFassungen(companyId, nummern)]))
      .then(([zeilen, fassungen]) => {
        if (weg) return;
        setStand({
          werte: werteJeBuchung(zeilen),
          fassungen: new Map(fassungen.map((f) => [f.nummer, { nummer: f.nummer, felder: f.felder }])),
          fehler: false,
        });
      })
      .catch(() => { if (!weg) setStand((s) => ({ ...s, fehler: true })); });
    return () => { weg = true; };
  }, [companyId, an, von, bis, userId, nummern, schluessel]);
  return stand;
}
