import { useEffect, useMemo, useState } from 'react';
import { AB_TABLET } from '@/lib/breiten';
import type { RuestPosition } from '@/types';
import type { EinsatzDeckung } from './materialDeckung';
import type { MonatsQuelle } from './monatsQuelle';
import { ruestZeile } from './monatsVorschau';

/*
  WAS DIE VORSCHAU EINES TAGES NEBEN IHREM INHALT BRAUCHT — für die
  Monatsansicht und die Startseite (E98) an einer Stelle. Zwei Abschriften
  der Rüstlisten-Rechnung liefen sonst bei der nächsten Änderung
  auseinander, und die Startseite zeigte eine andere Fehlmenge als der Monat.
*/

/** Handy (unter 760 px)? Ohne `matchMedia` (Komponententests) gilt der Schreibtisch. */
export function useHandy(): boolean {
  const frage = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia(AB_TABLET).matches;
  const [handy, setHandy] = useState(frage);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(AB_TABLET);
    const neu = () => setHandy(!m.matches);
    neu();
    m.addEventListener?.('change', neu);
    return () => m.removeEventListener?.('change', neu);
  }, []);
  return handy;
}

/**
 * DIE RÜSTLISTE beim Öffnen über die bestehenden Abfragen: die Listen des
 * Tages (`listEinsatzMaterialForDate`) und ihre Deckung (`materialdeckung`,
 * dieselbe Rechnung wie Formular, Woche und Tag — M04b) — nur mit dem
 * Modul „Material“, wie im Seitenfenster. Bis dahin „…“.
 *
 * `undefined` heisst: Modul aus, die Vorschau zeigt keine Zeile „Rüstliste“.
 */
export function useRuestText(
  tag: string | null,
  materialAn: boolean,
  betrieb: string | null,
  quelle: MonatsQuelle,
): ((nummer: string) => string) | undefined {
  const [ruest, setRuest] = useState<{ tag: string; listen: Map<string, RuestPosition[]> | 'fehler' } | null>(null);
  /** Die Deckung der Rüstlisten eines Tages je Baustelle; `null` heisst: konnte nicht geladen werden. */
  const [lager, setLager] = useState<{ tag: string; deckung: Map<string, EinsatzDeckung> | null } | undefined>(undefined);
  const offen = !!tag;
  useEffect(() => {
    if (!offen) {
      setRuest(null);
      setLager(undefined);
    }
  }, [offen]);
  // Erst wenn die Listen des Tages da sind und es überhaupt eine gibt.
  useEffect(() => {
    if (!offen || !materialAn || !ruest || ruest.listen === 'fehler' || lager?.tag === ruest.tag) return;
    const fuer = ruest.tag;
    if (ruest.listen.size === 0) {
      setLager({ tag: fuer, deckung: new Map() });
      return;
    }
    let weg = false;
    Promise.resolve()
      .then(() => quelle.deckung(fuer))
      .then((k) => {
        if (!weg) setLager({ tag: fuer, deckung: k });
      })
      .catch(() => {
        if (!weg) setLager({ tag: fuer, deckung: null });
      });
    return () => {
      weg = true;
    };
  }, [offen, materialAn, ruest, lager, quelle]);
  useEffect(() => {
    if (!tag || !materialAn || !betrieb) return;
    let weg = false;
    Promise.resolve()
      .then(() => quelle.ruestlisten(betrieb, tag))
      .then((listen) => {
        if (weg) return;
        const m = new Map<string, RuestPosition[]>();
        for (const l of listen) if (l.date === tag) m.set(l.projectNumber, l.positionen ?? []);
        setRuest({ tag, listen: m });
      })
      .catch(() => {
        if (!weg) setRuest({ tag, listen: 'fehler' });
      });
    return () => {
      weg = true;
    };
  }, [tag, materialAn, betrieb, quelle]);
  return useMemo(() => {
    if (!materialAn || !tag) return undefined;
    return (nummer: string) => {
      if (!ruest || ruest.tag !== tag) return '…';
      if (ruest.listen === 'fehler') return 'konnte nicht geladen werden';
      if (lager?.tag !== tag) return '…';
      return ruestZeile(ruest.listen.get(nummer), lager.deckung ? (lager.deckung.get(nummer) ?? null) : null);
    };
  }, [materialAn, tag, ruest, lager]);
}
