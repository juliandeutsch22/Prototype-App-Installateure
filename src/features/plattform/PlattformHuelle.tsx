import { useEffect, useRef, type ReactNode } from 'react';
import Icon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import ProduktMarke from '@/components/ProduktMarke';
import { SeilLotFuer } from '@/app/NaviLot';
import { taktHalten } from '@/lib/takt';

/**
 * DIE PLATTFORM IN DER LINIE „LOT“ (E48, 05.11.2026).
 *
 * Bis hierher stand das Plattformkonto in einer eigenen Form: ein dunkles
 * Band oben, Reiter darunter, die Seite weiß, eine grau gefüllte Spalte —
 * der Stand vor „Raster und Blätter“ (E33). Jetzt trägt es dieselbe Hülle wie
 * die App: am Tablet und Schreibtisch die dunkle Seitenleiste mit dem Lot am
 * Seil, am Handy die schmale Kopfzeile und die Reiterleiste unten, der
 * Inhalt auf dem Raster, Listen und Formulare als Blätter.
 *
 * EIGENE HÜLLE, DIESELBEN BAUSTEINE. Das `Layout` der App gehört zu einem
 * Betrieb (Navigation je Rolle und Modul, offene Posten, Suche im Bestand);
 * das Plattformkonto hat keinen. Es nimmt deshalb die Klassen und
 * Mechanismen des Layouts — Leiste, Raster mit Taktgeber, Höhe der
 * Reiterleiste —, nicht das Layout selbst.
 *
 * DIE BEREICHE WECHSELN AUF EINER ADRESSE, wie bisher: Formulare und
 * einmalige Zugangsdaten überleben den Wechsel (sie bleiben verborgen statt
 * ausgehängt). Das Lot fährt deshalb am Bereich, nicht am Pfad.
 */

export type PlattformBereich = 'betriebe' | 'support' | 'fehler' | 'basiszins' | 'rechtstexte' | 'konto';

/** Die Bereiche der Leiste: voller Name, Kurzname (Tablet, Handy) und Symbol. */
export const BEREICHE = [
  { wert: 'betriebe', name: 'Betriebe', kurz: 'Betriebe', symbol: 'building' },
  { wert: 'support', name: 'Supportzugänge', kurz: 'Support', symbol: 'contact' },
  { wert: 'fehler', name: 'Fehlerprotokoll', kurz: 'Fehler', symbol: 'warnung' },
  { wert: 'basiszins', name: 'Basiszinssatz', kurz: 'Basiszins', symbol: 'calculator' },
  { wert: 'rechtstexte', name: 'Rechtstexte', kurz: 'Recht', symbol: 'file' },
] as const;

const KONTO = 'Globaler Administrator';

export default function PlattformHuelle({
  bereich,
  onBereich,
  email,
  onAbmelden,
  children,
  unten,
}: {
  bereich: PlattformBereich;
  onBereich: (b: PlattformBereich) => void;
  /** Die Anmeldung des Plattformkontos; leer, solange sie nicht bekannt ist. */
  email: string;
  onAbmelden: () => void;
  children: ReactNode;
  /** Was außerhalb des Inhalts hängt (Seitenfenster). */
  unten?: ReactNode;
}) {
  const flaeche = useRef<HTMLElement>(null);
  const reiterleiste = useRef<HTMLElement>(null);

  // Jedes Blatt auf eine Rasterlinie — derselbe Taktgeber wie im Layout der App.
  useEffect(() => (flaeche.current ? taktHalten(flaeche.current) : undefined), []);

  /*
    DIE HÖHE DER REITERLEISTE (`--reiter-hoehe` am body), wie im Layout:
    Leisten, die am Handy unten kleben (Rechtstexte: Speichern und
    Veröffentlichen), stehen über ihr statt hinter ihr. Ab dem Tablet ist
    die Leiste ausgeblendet, dann 0.
  */
  useEffect(() => {
    const leiste = reiterleiste.current;
    if (!leiste) return;
    const setzen = () => document.body.style.setProperty('--reiter-hoehe', `${leiste.offsetHeight}px`);
    setzen();
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(setzen);
    beobachter?.observe(leiste);
    window.addEventListener('resize', setzen);
    return () => {
      beobachter?.disconnect();
      window.removeEventListener('resize', setzen);
      document.body.style.removeProperty('--reiter-hoehe');
    };
  }, []);

  const punkt = (b: PlattformBereich) => (bereich === b ? 'navi-punkt-aktiv' : 'navi-punkt');

  return (
    <div className="huelle plattform">
      <a href="#inhalt" className="sprunglink">
        Zum Inhalt
      </a>

      {/* Am Handy: die Marke und „Mein Konto“ — die Bereiche stehen in der Leiste unten. */}
      <header className="kopfzeile">
        <span className="plattform-marke">
          <ProduktMarke hoehe={26} hell />
          <span className="plattform-markenzusatz">Plattform</span>
        </span>
        <button
          type="button"
          className="min-h-touch px-2 text-sm text-navi-text"
          aria-current={bereich === 'konto' ? 'page' : undefined}
          onClick={() => onBereich('konto')}
        >
          Mein Konto
        </button>
      </header>

      <aside className="navi">
        <SeilLotFuer ziel={bereich} />
        <div className="navi-betrieb">
          <ProduktMarke hoehe={30} hell />
          <p className="plattform-markenzusatz">Plattform</p>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Bereiche der Plattform">
          {BEREICHE.map((b) => (
            <button
              key={b.wert}
              type="button"
              className={punkt(b.wert)}
              aria-current={bereich === b.wert ? 'page' : undefined}
              onClick={() => onBereich(b.wert)}
            >
              <Icon name={b.symbol} size={16} />
              <span className="navi-text-lang">{b.name}</span>
              <span className="navi-text-kurz" aria-hidden="true">{b.kurz}</span>
            </button>
          ))}
        </nav>
        <div className="navi-fuss">
          <nav className="flex flex-col gap-0.5" aria-label="Plattformkonto">
            <button
              type="button"
              className={punkt('konto')}
              aria-current={bereich === 'konto' ? 'page' : undefined}
              onClick={() => onBereich('konto')}
            >
              <Icon name="settings" size={16} />
              <span className="navi-text-lang">Mein Konto</span>
              <span className="navi-text-kurz" aria-hidden="true">Konto</span>
            </button>
          </nav>
          <div className="navi-breit">
            <div className="navi-person">
              <Avatar name={KONTO} />
              <div className="min-w-0">
                {/* Wie in der App: wer angemeldet ist, darunter die Rolle. */}
                <p className="navi-person-name truncate" title={email || undefined}>{email || 'Plattformkonto'}</p>
                <p className="navi-person-rolle truncate">{KONTO}</p>
              </div>
            </div>
            <button type="button" className="navi-punkt w-full" onClick={onAbmelden}>
              Abmelden
            </button>
            {/*
              KEINE VERWEISE AUF IMPRESSUM UND DATENSCHUTZ wie in der App: das
              Plattformkonto wird von jeder anderen Adresse auf /plattform
              zurückgeführt (App.tsx) — die Verweise führten ins Leere. Beide
              Texte pflegt es unter „Rechtstexte“.
            */}
          </div>
        </div>
      </aside>

      <main id="inhalt" ref={flaeche} tabIndex={-1} className="hauptflaeche min-w-0 flex-1 pb-24 outline-none md:pb-6">
        <div className="inhalt">{children}</div>
      </main>

      {/* Am Handy: die fünf Bereiche als Reiter — „Mein Konto“ steht oben in der Kopfzeile. */}
      <nav ref={reiterleiste} className="unten" aria-label="Bereiche der Plattform, untere Leiste">
        {BEREICHE.map((b) => (
          <button
            key={b.wert}
            type="button"
            className={bereich === b.wert ? 'unten-punkt-aktiv' : 'unten-punkt'}
            aria-current={bereich === b.wert ? 'page' : undefined}
            onClick={() => onBereich(b.wert)}
          >
            <span className="unten-lot" aria-hidden="true" />
            <span className="unten-symbol">
              <Icon name={b.symbol} size={22} />
            </span>
            <span className="unten-text">{b.kurz}</span>
          </button>
        ))}
      </nav>
      {unten}
    </div>
  );
}
