import { useCallback, useEffect, useRef, useState } from 'react';
import type { SeitenZeiger } from './db/pg/kern';

type Listenseite<T> = { zeilen: T[]; naechste: SeitenZeiger | null };

/** Gleiche Filter, nächste Seite: bereits geladene Seiten werden beim Weiterladen nicht wieder angefragt. */
export function useSeitenListe<T extends { id: string }>(
  seiteLaden: (vor?: SeitenZeiger | null) => Promise<Listenseite<T>>,
) {
  const [zeilen, setZeilen] = useState<T[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [mehrLaedt, setMehrLaedt] = useState(false);
  const [mehr, setMehr] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const version = useRef(0);
  const cursor = useRef<SeitenZeiger | null>(null);
  const seiten = useRef(1);
  const mehrInArbeit = useRef(false);

  const neuLaden = useCallback(async () => {
    const stand = ++version.current;
    setLaedt(true);
    setFehler(null);
    setMehrLaedt(false);
    mehrInArbeit.current = false;
    try {
      const neu: T[] = [];
      let vor: SeitenZeiger | null = null;
      for (let n = 0; n < seiten.current; n++) {
        const s = await seiteLaden(vor);
        if (stand !== version.current) return;
        neu.push(...s.zeilen);
        vor = s.naechste;
        if (!vor) break;
      }
      if (stand !== version.current) return;
      setZeilen(neu);
      cursor.current = vor;
      setMehr(!!vor);
    } catch (e) {
      if (stand === version.current) setFehler(e instanceof Error ? e.message : 'Die Liste konnte nicht geladen werden.');
    } finally {
      if (stand === version.current) setLaedt(false);
    }
  }, [seiteLaden]);

  useEffect(() => {
    const laufendeVersion = version;
    seiten.current = 1;
    cursor.current = null;
    setZeilen([]);
    setMehr(false);
    void neuLaden();
    return () => { laufendeVersion.current++; };
  }, [neuLaden]);

  async function nachladen() {
    if (!cursor.current || mehrInArbeit.current || laedt) return;
    const stand = version.current;
    mehrInArbeit.current = true;
    setMehrLaedt(true);
    setFehler(null);
    try {
      const s = await seiteLaden(cursor.current);
      if (stand !== version.current) return;
      setZeilen((alt) => [...new Map([...alt, ...s.zeilen].map((z) => [z.id, z])).values()]);
      cursor.current = s.naechste;
      seiten.current++;
      setMehr(!!s.naechste);
    } catch (e) {
      if (stand === version.current) setFehler(e instanceof Error ? e.message : 'Weitere Einträge konnten nicht geladen werden.');
    } finally {
      if (stand === version.current) {
        mehrInArbeit.current = false;
        setMehrLaedt(false);
      }
    }
  }
  return { zeilen, laedt, mehrLaedt, mehr, fehler, neuLaden, nachladen };
}
