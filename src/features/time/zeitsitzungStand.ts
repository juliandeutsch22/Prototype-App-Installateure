import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { istAn } from '@/lib/module';
import { grundAus } from '@/lib/fehlerGrund';
import { timerMerken, timerSenden, zeitsitzungenLaden } from '@/lib/db/zeitsitzungen';
import { timerFortschreiben, type TimerArt, type Zeitsitzung } from '@/lib/zeitsitzung';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { useToastWennDa } from '@/components/Toast';

/**
 * DER STAND DES START/STOPP-TIMERS (M06a) — EINMAL FÜR DIE GANZE APP.
 *
 * Die Karte „Arbeitstag“ auf der Startseite und in der Zeiterfassung, die
 * Leiste auf den anderen Seiten und „Abschnitte prüfen“ zeigen dieselbe
 * Sitzung. Deshalb lädt und sendet nur eine Stelle (der Anbieter im
 * Layout); alle lesen von ihr. Laden, Abgleich alle 30 Sekunden, Nachladen
 * nach dem Ausgangsfach und Senden ohne Netz sind dieselben wie vorher in
 * `ZeitsitzungPanel` — nur an einer Stelle.
 */
export interface ZeitsitzungStand {
  /** Das Modul Start/Stopp ist an — neue Sitzungen gehen nur dann. */
  an: boolean;
  sitzungen: Zeitsitzung[];
  geladen: boolean;
  fehler: string | null;
  setFehler: (f: string | null) => void;
  speichert: boolean;
  setSpeichert: (s: boolean) => void;
  /** Die laufende oder pausierte Sitzung. */
  laeuft: Zeitsitzung | undefined;
  /** Beendete Sitzungen mit Abschnitten, die noch zu prüfen sind (oder gesicherten Entwürfen). */
  offen: Zeitsitzung[];
  /** Die Erinnerung ist fällig: der Timer läuft länger als die Frist des Betriebs. */
  ueberfaellig: boolean;
  /** Jetzt — im Sekundentakt, solange eine Sitzung läuft (für die Uhr). */
  jetzt: number;
  laden: () => Promise<void>;
  /** Ein Timer-Schritt. `baustelle` ist die Baustelle, beim Verwerfen der Grund. */
  befehl: (art: TimerArt, s: Zeitsitzung | undefined, baustelle: string) => Promise<boolean>;
}

export const ZeitsitzungKontext = createContext<ZeitsitzungStand | null>(null);

/** Die Logik — `aktiv` ist falsch, wo ein Anbieter darüber schon lädt. */
export function useZeitsitzungStand(aktiv = true): ZeitsitzungStand {
  const { user, company } = useAuth();
  // Im Layout steht der Anbieter innerhalb der Meldungen; ohne sie (Prüfungen einer Seite allein) geht es leise.
  const toast = useToastWennDa();
  const an = istAn(company?.modules, 'zeiterfassung.timer');
  const [sitzungen, setSitzungen] = useState<Zeitsitzung[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const uid = user?.uid;
  const firma = user?.companyId;
  const ladeNummer = useRef(0);

  const laden = useCallback(async () => {
    if (!aktiv || !firma || !uid) return;
    const nr = ++ladeNummer.current;
    try {
      const stand = await zeitsitzungenLaden(firma, uid);
      if (nr !== ladeNummer.current) return;
      setSitzungen(stand);
      setGeladen(true);
      setFehler(null);
    } catch (e) {
      if (nr === ladeNummer.current) setFehler(grundAus(e, 'Der Timer konnte nicht geladen werden.'));
    }
  }, [aktiv, firma, uid]);

  const laeuft = sitzungen.find((s) => s.stand === 'laeuft' || s.stand === 'pause');
  const offen = sitzungen.filter((s) => (s.stand === 'beendet' && !s.abgeschlossen) || !!s.entwuerfe?.length);
  const abgleichen = an || sitzungen.some((s) => s.stand !== 'verworfen' && !s.abgeschlossen);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    const intervall = abgleichen
      ? window.setInterval(() => { if (document.visibilityState === 'visible') void laden(); }, 30_000)
      : null;
    const wiederDa = () => { void laden(); };
    window.addEventListener('online', wiederDa);
    window.addEventListener(FACH_GELEERT, wiederDa);
    return () => {
      if (intervall !== null) window.clearInterval(intervall);
      window.removeEventListener('online', wiederDa);
      window.removeEventListener(FACH_GELEERT, wiederDa);
    };
  }, [aktiv, laden, abgleichen]);

  // Die Uhr: im Sekundentakt nur, solange eine Sitzung läuft — sonst je halbe Minute (für die Erinnerung).
  const tickt = !!laeuft;
  useEffect(() => {
    if (!aktiv) return;
    const t = window.setInterval(() => setJetzt(Date.now()), tickt ? 1000 : 30_000);
    return () => window.clearInterval(t);
  }, [aktiv, tickt]);

  const befehl = useCallback(async (art: TimerArt, s: Zeitsitzung | undefined, baustelle: string) => {
    if (!firma || !uid || speichert) return false;
    setSpeichert(true);
    setFehler(null);
    ladeNummer.current += 1;
    const b = {
      p_id: s?.id ?? crypto.randomUUID(), p_befehl: crypto.randomUUID(), p_revision: s?.revision ?? 0,
      p_art: art, p_zeit: new Date().toISOString(), p_baustelle: baustelle,
    };
    try {
      const stand = await timerSenden(b);
      if (stand === 'queued') {
        const neu = timerFortschreiben(s ?? null, b, firma, uid);
        setSitzungen((alt) => {
          const naechste = [neu, ...alt.filter((x) => x.id !== neu.id)];
          timerMerken(firma, uid, naechste);
          return naechste;
        });
        toast?.info('Timer-Schritt auf diesem Gerät vorgemerkt. Er wird bei Verbindung gesendet.');
      } else {
        await laden();
      }
      setJetzt(Date.now());
      return true;
    } catch (e) {
      setFehler(grundAus(e, 'Der Timer-Schritt konnte nicht übernommen werden.'));
      return false;
    } finally {
      setSpeichert(false);
    }
  }, [firma, uid, speichert, laden, toast]);

  const ueberfaellig = !!laeuft && istAn(company?.modules, 'zeiterfassung.timer_erinnerung')
    && jetzt - Date.parse(laeuft.weiterlaufen_am ?? laeuft.segmente[0].von) >= (company?.timerErinnerungMin ?? 600) * 60_000;

  return { an, sitzungen, geladen, fehler, setFehler, speichert, setSpeichert, laeuft, offen, ueberfaellig, jetzt, laden, befehl };
}

/**
 * Den gemeinsamen Stand lesen. Ohne Anbieter darüber (etwa in einer
 * Prüfung, die eine Seite allein zeigt) lädt die Komponente selbst.
 */
export function useZeitsitzung(): ZeitsitzungStand {
  const kontext = useContext(ZeitsitzungKontext);
  const eigen = useZeitsitzungStand(!kontext);
  return kontext ?? eigen;
}
