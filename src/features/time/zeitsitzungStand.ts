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
  /**
   * Ein Timer-Schritt. `baustelle` ist die Baustelle, beim Verwerfen der Grund.
   * Wahr, sobald der Schritt angezeigt wird — nicht erst nach dem Server (C4).
   */
  befehl: (art: TimerArt, s: Zeitsitzung | undefined, baustelle: string) => Promise<boolean>;
  /** Ein Timer-Schritt ist auf dem Weg zum Server; ein zweiter wird bis dahin nicht angenommen. */
  unterwegs: boolean;
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
  /*
    EIN SCHRITT UNTERWEGS (C4, E90). Als Ref, nicht als Zustand: ein zweiter
    Tipp im selben Augenblick sieht sonst noch den alten Wert. Gerade beim
    Doppeltipp wäre das teuer — nach „Pause“ steht an derselben Stelle
    „Weiterarbeiten“, und der zweite Tipp hiebe die Pause gleich wieder ab.
  */
  const unterwegsRef = useRef(false);
  /*
    „VORGEMERKT“ EINMAL JE FUNKLOCH (C4, E90). Seit der Schritt sofort gilt,
    tippt man im Keller leicht zwei Schritte hintereinander — die gleiche
    Meldung zweimal übereinander sagt nichts Neues. Wieder gemeldet wird erst
    nach dem nächsten Empfang.
  */
  const vorgemerktGemeldet = useRef(false);
  const [unterwegs, setUnterwegs] = useState(false);

  const laden = useCallback(async () => {
    if (!aktiv || !firma || !uid) return;
    // Der Abgleich alle 30 Sekunden darf den angezeigten Schritt nicht mit dem alten Stand überschreiben.
    if (unterwegsRef.current) return;
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
    // Nur echter Empfang: das Ausgangsfach meldet sich nach jedem Versuch, auch im Funkloch.
    const empfang = () => { vorgemerktGemeldet.current = false; void laden(); };
    window.addEventListener('online', empfang);
    window.addEventListener(FACH_GELEERT, wiederDa);
    return () => {
      if (intervall !== null) window.clearInterval(intervall);
      window.removeEventListener('online', empfang);
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

  /*
    DER TIMER ANTWORTET SOFORT (C4, E90). Vorher blieben die Knöpfe grau, bis
    der Server geantwortet und die App neu geladen hatte — im Keller einige
    Sekunden, in denen die Uhr scheinbar nichts tat. Jetzt gilt der Schritt
    sofort, gerechnet wie ohne Netz (`timerFortschreiben`, dieselbe Rechnung
    wie im Ausgangsfach). Der Server bestätigt im Hintergrund; lehnt er ab
    (ein anderes Gerät war schneller, die Sitzung ist geschlossen), springt
    die Anzeige auf den Stand davor zurück, der Grund steht in der Karte,
    und der Stand des Servers wird geholt.
  */
  const befehl = useCallback(async (art: TimerArt, s: Zeitsitzung | undefined, baustelle: string) => {
    if (!firma || !uid || unterwegsRef.current) return false;
    const b = {
      p_id: s?.id ?? crypto.randomUUID(), p_befehl: crypto.randomUUID(), p_revision: s?.revision ?? 0,
      p_art: art, p_zeit: new Date().toISOString(), p_baustelle: baustelle,
    };
    let neu: Zeitsitzung;
    try {
      neu = timerFortschreiben(s ?? null, b, firma, uid);
    } catch (e) {
      // Der angezeigte Stand passt nicht mehr zur Sitzung: nichts senden, neu holen.
      setFehler(grundAus(e, 'Der Timer-Schritt konnte nicht übernommen werden.'));
      void laden();
      return false;
    }
    unterwegsRef.current = true;
    setUnterwegs(true);
    setFehler(null);
    // Ein Laden, das vor dem Schritt begann, brächte den Stand davor zurück.
    ladeNummer.current += 1;
    let vorher: Zeitsitzung[] = [];
    setSitzungen((alt) => {
      vorher = alt;
      return [neu, ...alt.filter((x) => x.id !== neu.id)];
    });
    setJetzt(Date.now());
    void (async () => {
      let bestaetigt = false;
      try {
        const stand = await timerSenden(b);
        if (stand === 'queued') {
          setSitzungen((alt) => {
            timerMerken(firma, uid, alt);
            return alt;
          });
          if (!vorgemerktGemeldet.current) toast?.info('Timer-Schritt auf diesem Gerät vorgemerkt. Er wird bei Verbindung gesendet.');
          vorgemerktGemeldet.current = true;
        } else {
          bestaetigt = true;
        }
      } catch (e) {
        setSitzungen(vorher);
        setFehler(grundAus(e, 'Der Timer-Schritt konnte nicht übernommen werden.'));
        bestaetigt = true;
      } finally {
        unterwegsRef.current = false;
        setUnterwegs(false);
      }
      // Bestätigt oder abgelehnt: der Stand des Servers gilt — ohne dass jemand darauf wartet.
      if (bestaetigt) void laden();
    })();
    return true;
  }, [firma, uid, laden, toast]);

  const ueberfaellig = !!laeuft && istAn(company?.modules, 'zeiterfassung.timer_erinnerung')
    && jetzt - Date.parse(laeuft.weiterlaufen_am ?? laeuft.segmente[0].von) >= (company?.timerErinnerungMin ?? 600) * 60_000;

  return { an, sitzungen, geladen, fehler, setFehler, speichert, setSpeichert, laeuft, offen, ueberfaellig, jetzt, laden, befehl, unterwegs };
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
