import { useEffect, useMemo, useState } from 'react';
import type { TimeEntry, ZeitfeldDefinition } from '@/types';
import { istAn } from '@/lib/module';
import {
  feldsatzLaden, gemerkterFeldsatz, listFeldwerte, listZeitfeldFassungen, type Feldsatz,
} from '@/lib/db/zeitfelder';
import { schluessel, useZwischengespeichert } from '@/lib/zwischenspeicher';
import { werteJeBuchung, type ZeitfeldSatz, type ZeitfeldWert } from '@/lib/zeitfelder';

/**
 * DIE FREIEN ZEITFELDER FÜR EINE ANSICHT (M06b).
 *
 * `useFeldsatz`: die geltende Fassung und die Definitionen — erst der auf dem
 * Gerät gemerkte Stand (ohne Empfang der einzige), dann frisch geladen. Ist
 * die Unterfähigkeit aus, gibt es keine Felder, und nichts wird geladen.
 *
 * ÜBER DEN ZWISCHENSPEICHER DER APP (`useZwischengespeichert`), nicht je
 * Aufbau neu: die Buchungsmaske entsteht bei jedem Bearbeiten neu, und
 * Zeiterfassung und Maske stehen auf derselben Seite. So fragt die Seite
 * einmal, gleichzeitige Aufbauten teilen sich die Antwort, und eine Minute
 * lang gilt sie ohne Nachfrage. Veraltet sie in dieser Minute, ist das kein
 * Fehler: der Server prüft die Buchung nach der Fassung, die die Maske
 * kannte, und nennt, was die neue zusätzlich verlangt („Nachpflege“) — wie
 * bei einer Buchung ohne Empfang. Die Seite „Zeitfelder“ verwirft den
 * Zwischenspeicher nach jedem Speichern.
 */
export interface FeldsatzStand {
  an: boolean;
  satz: ZeitfeldSatz | null;
  definitionen: ZeitfeldDefinition[];
  /** Noch nichts da — weder gemerkt noch geladen. */
  laedt: boolean;
}

/** Wie lange ein geladener Feldsatz ohne Nachfrage gilt. */
export const FELDSATZ_FRISCH_MS = 60_000;

/** Der Schlüssel des Feldsatzes im Zwischenspeicher — die Seite „Zeitfelder“ verwirft ihn. */
export const FELDSATZ_SCHLUESSEL = 'zeitfelder';

function alsStand(an: boolean, f: Feldsatz | null | undefined, laedt: boolean): FeldsatzStand {
  return {
    an,
    satz: an && f?.fassung ? { nummer: f.fassung.nummer, felder: f.fassung.felder } : null,
    definitionen: an ? f?.definitionen ?? [] : [],
    laedt,
  };
}

export function useFeldsatz(
  wer: { uid: string; companyId: string } | null | undefined,
  module: Record<string, boolean> | undefined,
): FeldsatzStand {
  const an = !!wer && (istAn(module, 'zeiterfassung.freie_zeitfelder') || (!istAn(module, 'zeiterfassung') && !!(module?.['zeiterfassung.freie_zeitfelder'] ?? true)));
  const firma = wer?.companyId;
  const [gemerkt] = useState(() => (firma ? gemerkterFeldsatz(firma) : null));
  const abfrage = useZwischengespeichert<Feldsatz>({
    queryKey: wer ? schluessel(FELDSATZ_SCHLUESSEL, wer) : [FELDSATZ_SCHLUESSEL],
    enabled: an,
    queryFn: () => feldsatzLaden(firma!),
    staleTime: FELDSATZ_FRISCH_MS,
  });
  // Ohne Netz bleibt der gemerkte Stand; ohne ihn gibt es eben keine Felder.
  const satz = abfrage.data ?? gemerkt;
  const laedt = !satz && abfrage.isPending && abfrage.fetchStatus !== 'idle';
  return useMemo(() => alsStand(an, satz, laedt), [an, satz, laedt]);
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
