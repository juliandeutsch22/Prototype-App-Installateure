import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Termin } from '@/types';
import Button from '@/components/Button';
import { useFokusFalle, istOben } from '@/components/fokusFalle';
import type { FensterStart } from './EinsatzFenster';
import type { EinsatzTeil, VorschauInhalt, VorschauZiel } from './monatsVorschau';

/** Abstand der Vorschau zum Rand des Fensters (Auftrag 5.3). */
const RAND = 12;

/**
 * DIE VORSCHAU EINES TAGES (Runde 4, Auftrag 5.3): was an diesem Tag für
 * diese Person bzw. Baustelle geplant ist, ohne die Seite zu verlassen.
 *
 * Am Schreibtisch und Tablet schwebt sie ohne Schleier unter (oder über)
 * der Klickstelle — das Raster bleibt sichtbar, ein Klick auf einen anderen
 * Balken öffnet gleich dessen Vorschau. Am Handy ist sie ein Blatt von unten
 * im Schleier, wie jedes Fenster dort.
 *
 * Geplant wird hier NICHT: „Bearbeiten“ und „Einsatz planen“ öffnen das
 * Seitenfenster der Seite (`onEinsatz`) — dasselbe wie in der Woche, mit
 * demselben Formular. Ein zweiter Schreibweg hiesse, das „alles weg, dann
 * alles neu“ des Formulars an zwei Stellen richtig zu halten.
 */
export default function MonatsVorschau({
  ziel,
  inhalt,
  ruest,
  imMonat,
  handy,
  anker,
  klickX,
  darfTermine,
  baustelleSichtbar,
  onSchliessen,
  onBlaettern,
  onEinsatz,
  onTermin,
  onZurWoche,
}: {
  ziel: VorschauZiel;
  /** `null`: der Tag liegt ausserhalb des Monats und wird gerade geladen. */
  inhalt: VorschauInhalt | null;
  /** Rüstliste je Baustelle als Zeile; `undefined` = Modul aus, „…“ = wird geladen. */
  ruest: ((nummer: string) => string) | undefined;
  /**
   * Liegt der Tag im geladenen Monat? Nur dann darf „Bearbeiten“ das
   * Seitenfenster öffnen: es kennt nur die geladenen Tage und überschriebe
   * sonst eine Planung, die es nicht gelesen hat.
   */
  imMonat: boolean;
  handy: boolean;
  anker: HTMLElement | null;
  klickX: number | null;
  darfTermine: boolean;
  baustelleSichtbar: boolean;
  /** `zurueck`: den Fokus an den Balken zurückgeben (Tastatur, ×, Esc). */
  onSchliessen: (zurueck: boolean) => void;
  onBlaettern: (schritt: -1 | 1) => void;
  onEinsatz?: (start: FensterStart) => void;
  onTermin?: (t: Termin) => void;
  onZurWoche?: (tag: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const zuRef = useRef<HTMLButtonElement>(null);
  const titelId = useId();
  const tag = ziel.tag;

  // Am Handy ist sie modal: Tab bleibt im Blatt, wie in jedem anderen Blatt.
  useFokusFalle(ref, handy);

  /* Der Fokus geht beim Öffnen auf ×, ohne die Seite zu verschieben. */
  useEffect(() => {
    zuRef.current?.focus({ preventScroll: true });
  }, []);

  /*
    POSITION: unter der Klickstelle, zu ihr zentriert; reicht der Platz
    nicht, darüber; nie näher als 12 px am Rand. Gesetzt wird direkt am
    Element und vor dem Zeichnen — so springt nichts, und React überschreibt
    die Lage beim nächsten Zeichnen nicht.
  */
  useLayoutEffect(() => {
    if (handy) return;
    const setzen = () => {
      const el = ref.current;
      if (!el) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight;
      const r = anker?.isConnected ? anker.getBoundingClientRect() : null;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const mitte = klickX ?? (r ? (r.left + r.right) / 2 : vw / 2);
      let x = Math.max(RAND, Math.min(mitte - w / 2, vw - w - RAND));
      let y = r ? r.bottom + 8 : RAND;
      if (r && y + h > vh - RAND) y = r.top - h - 8;
      if (y < RAND) {
        /*
          WEDER DARUNTER NOCH DARÜBER PLATZ (eine lange Vorschau, die Zeile
          in der Mitte des Bildes): neben die Klickstelle statt über den
          Balken — sonst verdeckte sie, worauf man gerade getippt hat.
        */
        y = Math.max(RAND, Math.min(r ? (r.top + r.bottom) / 2 - h / 2 : RAND, vh - h - RAND));
        if (r) x = mitte + 16 + w <= vw - RAND ? mitte + 16 : Math.max(RAND, mitte - 16 - w);
      }
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    };
    setzen();
    window.addEventListener('resize', setzen);
    return () => window.removeEventListener('resize', setzen);
  }, [handy, anker, klickX, inhalt, tag]);

  /*
    TASTEN: Esc schliesst, ← und → blättern tageweise — nicht, solange in
    einem Eingabefeld getippt wird, und nicht, wenn ein anderes Fenster
    darüber liegt (dort gehören die Tasten ihm).
  */
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const anderesFenster = Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
        (d) => d !== ref.current && !ref.current?.contains(d),
      );
      if (anderesFenster || (handy && !istOben(ref))) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onSchliessen(true);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && (/^(INPUT|SELECT|TEXTAREA)$/.test(ziel.tagName) || ziel.isContentEditable)) return;
      e.preventDefault();
      onBlaettern(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [handy, onSchliessen, onBlaettern]);

  /*
    EIN KLICK AUSSERHALB SCHLIESST (Schreibtisch). Ein Klick auf einen
    anderen Balken oder Tag öffnet dessen Vorschau — der schliesst hier
    nicht erst, sonst flackerte sie.
  */
  useEffect(() => {
    if (handy) return;
    const druck = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest('[data-vorschau-ausloeser]')) return;
      onSchliessen(false);
    };
    document.addEventListener('mousedown', druck);
    return () => document.removeEventListener('mousedown', druck);
  }, [handy, onSchliessen]);

  /*
    VOR DEM SEITENFENSTER DEN FOKUS AN DEN BALKEN: das Fenster merkt sich
    beim Öffnen, wer den Fokus hatte, und gibt ihn beim Schliessen dorthin
    zurück. Stünde er noch in der Vorschau, die dann verschwunden ist, fiele
    er nach dem Speichern an den Anfang der Seite.
  */
  const einsatz = (start: FensterStart) => {
    onSchliessen(true);
    onEinsatz?.(start);
  };
  const termin = (t: Termin) => {
    onSchliessen(true);
    onTermin?.(t);
  };
  const zurWoche = () => {
    onSchliessen(false);
    onZurWoche?.(tag);
  };

  const einsaetze = inhalt?.einsaetze ?? [];
  const planen = imMonat && !!onEinsatz;
  /** Fusszeile je Fall (Auftrag 5.3): ein Einsatz, mehrere, keiner. */
  let haupt: { text: string; start: FensterStart } | null = null;
  if (inhalt && planen) {
    if (ziel.art === 'person') {
      if (einsaetze.length === 1) haupt = { text: 'Bearbeiten', start: { datum: tag, projectNumber: einsaetze[0].nummer } };
      else if (einsaetze.length === 0) haupt = { text: 'Einsatz planen', start: { datum: tag, person: ziel.uid } };
    } else if (ziel.art === 'baustelle') {
      haupt = { text: einsaetze.length > 0 ? 'Bearbeiten' : 'Einsatz planen', start: { datum: tag, projectNumber: ziel.nummer } };
    } else {
      haupt = { text: 'Einsatz planen', start: { datum: tag } };
    }
  }
  // Je Abschnitt „Bearbeiten“, wo die Fusszeile es nicht eindeutig sagen kann.
  const jeAbschnitt = planen && (ziel.art === 'tag' || (ziel.art === 'person' && einsaetze.length > 1));

  const feld = (
    <div
      ref={ref}
      role="dialog"
      aria-modal={handy ? true : undefined}
      aria-labelledby={titelId}
      tabIndex={-1}
      className={handy ? 'vorschau-blatt' : 'vorschau'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="vorschau-kopf">
        <div className="vorschau-kopftext">
          <p className="vorschau-ueber">{inhalt?.ueber ?? ''}</p>
          <h2 id={titelId} className="vorschau-titel">
            {inhalt?.titel || (ziel.art === 'tag' ? 'Alle Einsätze' : ziel.name)}
          </h2>
        </div>
        <div className="vorschau-nav">
          <button type="button" className="vorschau-pfeil" aria-label="Vorheriger Tag" onClick={() => onBlaettern(-1)}>
            ‹
          </button>
          <button type="button" className="vorschau-pfeil" aria-label="Nächster Tag" onClick={() => onBlaettern(1)}>
            ›
          </button>
          <button ref={zuRef} type="button" className="vorschau-zu" aria-label="Vorschau schließen" onClick={() => onSchliessen(true)}>
            ×
          </button>
        </div>
      </div>

      <div className="vorschau-inhalt">
        {!inhalt ? (
          <p className="v-leer" aria-busy="true">…</p>
        ) : (
          <>
            {inhalt.abwesenheiten.map((a, i) => (
              <section key={`a${i}`} className="v-abschnitt" aria-label="Abwesenheit">
                <p className="v-titel">{a.titel}</p>
                {a.unter && <p className="v-unter">{a.unter}</p>}
              </section>
            ))}
            {einsaetze.map((e) => (
              <EinsatzAbschnitt
                key={e.nummer}
                teil={e}
                ruest={ruest?.(e.nummer)}
                baustelleSichtbar={baustelleSichtbar}
                onBearbeiten={jeAbschnitt ? () => einsatz({ datum: tag, projectNumber: e.nummer }) : undefined}
              />
            ))}
            {inhalt.termine.map((t) => (
              <section key={t.termin.id} className="v-abschnitt" aria-label={`Termin: ${t.titel}`}>
                <p className="v-titel">{t.titel}</p>
                <p className="v-unter">{t.unter}</p>
                {t.ohneAnnahme && <p className="v-hinweis">Niemand ist an diesem Tag auf dieser Baustelle eingeteilt.</p>}
                {onTermin && (
                  <div className="v-aktion">
                    {/* Wer Termine nur sieht, bekommt dasselbe Fenster schreibgeschützt (Auftrag 4.4). */}
                    <Button variant="secondary" groesse="klein" onClick={() => termin(t.termin)}>
                      {darfTermine ? 'Termin ändern' : 'Termin ansehen'}
                    </Button>
                  </div>
                )}
              </section>
            ))}
            {inhalt.abwesend.length > 0 && (
              <section className="v-abschnitt" aria-label="Abwesend">
                <p className="v-unter">Abwesend: {inhalt.abwesend.join(', ')}</p>
              </section>
            )}
            {inhalt.frei && <p className="v-leer">{inhalt.frei}</p>}
            {!imMonat && onEinsatz && (
              <p className="v-leer">Geplant wird dieser Tag in seiner Woche — „Zur Woche“.</p>
            )}
          </>
        )}
      </div>

      {(onZurWoche || haupt) && (
      <div className="vorschau-fuss">
        {onZurWoche && (
          <Button variant="secondary" groesse="klein" onClick={zurWoche}>
            Zur Woche
          </Button>
        )}
        {haupt && (
          <Button groesse="klein" onClick={() => einsatz(haupt.start)}>
            {haupt.text}
          </Button>
        )}
      </div>
      )}
    </div>
  );

  if (!handy) return feld;
  return (
    <div className="schleier" onClick={() => onSchliessen(true)}>
      {feld}
    </div>
  );
}

function EinsatzAbschnitt({
  teil,
  ruest,
  baustelleSichtbar,
  onBearbeiten,
}: {
  teil: EinsatzTeil;
  ruest: string | undefined;
  baustelleSichtbar: boolean;
  onBearbeiten?: () => void;
}) {
  return (
    <section className="v-abschnitt" aria-label={`Einsatz ${teil.titel} (${teil.nummer})`}>
      <p className="v-titel">{teil.titel}</p>
      <p className="v-unter">{teil.nummer}</p>
      <dl className="v-liste">
        <Reihe name="Zeit" wert={teil.zeit} />
        <Reihe name="Adresse" wert={teil.adresse === undefined ? '…' : (teil.adresse ?? '–')} />
        <Reihe name={teil.leuteName} wert={teil.leute} />
        {teil.aufgabe && <Reihe name="Aufgabe" wert={teil.aufgabe} />}
        {ruest !== undefined && <Reihe name="Rüstliste" wert={ruest} />}
      </dl>
      {teil.termine.map((t) => (
        <p key={t} className="v-info">
          {t}
        </p>
      ))}
      {teil.fehlen.map((f) => (
        <p key={f} className="v-hinweis">
          {f}
        </p>
      ))}
      {(onBearbeiten || (baustelleSichtbar && teil.projektId)) && (
        <div className="v-aktion">
          {onBearbeiten && (
            <Button variant="secondary" groesse="klein" onClick={onBearbeiten} aria-label={`${teil.titel} (${teil.nummer}) bearbeiten`}>
              Bearbeiten
            </Button>
          )}
          {baustelleSichtbar && teil.projektId && (
            <Link to={`/admin-projects/${teil.projektId}`} className="link-weiter inline-flex min-h-touch items-center">
              Baustelle öffnen
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function Reihe({ name, wert }: { name: string; wert: string }) {
  return (
    <div className="v-reihe">
      <dt className="v-label">{name}</dt>
      <dd className="v-wert">{wert}</dd>
    </div>
  );
}
