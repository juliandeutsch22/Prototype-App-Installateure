import { createContext, useCallback, useContext, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { artWort, kurzeZeit, streifenMarken, tippText, wochentagKurz, type Tageswert } from './tagesauswertung';

/*
  DIE BAUSTEINE DES MONATS IN DER MITARBEITERÜBERSICHT (Runde 4, Auftrag
  3.3.1, 3.4 und 6): der Streifen (ein Feld je Tag), die Wochenzelle (die
  Stunden lesbar) und der Tooltip. Die Gestaltung steht in
  `src/styles/lot-uebersicht.css`; hier steht, was Bedienung und Vorlesehilfe
  brauchen.
*/

// ── Tooltip ─────────────────────────────────────────────────────────────
/*
  EIN EIGENES ELEMENT, KEIN `title` (Auftrag 3.3.1). Ein `title` erscheint
  erst nach einer Sekunde, lässt sich nicht gestalten und ist am Tablet
  unerreichbar. Der Tipp steht einmal je Seite und wandert mit der Maus; am
  Feld steht derselbe Text als `aria-label`, deshalb ist der Tipp selbst für
  die Vorlesehilfe stumm. Unter 1.200 px blendet ihn das CSS aus — dort öffnet
  der Tipp auf das Feld gleich das Seitenfenster.
*/
interface TippZustand {
  text: string;
  links: number;
  oben: number;
}

const TippContext = createContext<{ zeige: (el: HTMLElement, text: string) => void; weg: () => void }>({
  zeige: () => undefined,
  weg: () => undefined,
});

/** Breite, die der Tipp höchstens braucht (wie `.tipp` im CSS) — für den Abstand zum Rand. */
const TIPP_BREITE = 288;

export function TippBereich({ children }: { children: ReactNode }) {
  const [tipp, setTipp] = useState<TippZustand | null>(null);
  const zeige = useCallback((el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    const mitte = r.left + r.width / 2;
    // Zum Feld zentriert, aber immer 12 px vom Rand des Fensters.
    const links = Math.max(12, Math.min(mitte - TIPP_BREITE / 2, window.innerWidth - TIPP_BREITE - 12));
    setTipp({ text, links, oben: r.bottom + 8 });
  }, []);
  const weg = useCallback(() => setTipp(null), []);
  const wert = useMemo(() => ({ zeige, weg }), [zeige, weg]);
  return (
    <TippContext.Provider value={wert}>
      {children}
      {tipp && (
        <div className="tipp" aria-hidden="true" style={{ left: tipp.links, top: tipp.oben }}>
          {tipp.text}
        </div>
      )}
    </TippContext.Provider>
  );
}

function useTipp() {
  return useContext(TippContext);
}

/*
  PFEILTASTEN IN EINER REIHE (Bedienbarkeit, Auftrag 8). 31 Felder je Person
  wären 31 Tabulatorschritte; bei 25 Personen über 700. Die Reihe ist EIN
  Tabulatorschritt, ← → Pos1 Ende wandern darin — wie in einer Werkzeugleiste.
*/
function pfeilWandern(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const knoepfe = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
  const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const ziel =
    e.key === 'Home' ? 0 : e.key === 'End' ? knoepfe.length - 1 : Math.max(0, Math.min(knoepfe.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
  e.preventDefault();
  knoepfe[ziel]?.focus();
}

/** Der Tag, auf dem eine Reihe beim ersten Tabulatorschritt steht: heute, sonst der erste anklickbare. */
function startTag(werte: readonly Tageswert[], heute: string, klickbar: (t: Tageswert) => boolean): string | null {
  const heuteWert = werte.find((t) => t.tag === heute && klickbar(t));
  return heuteWert?.tag ?? werte.find(klickbar)?.tag ?? null;
}

// ── Streifen ────────────────────────────────────────────────────────────
const STREIFEN_KLASSE: Record<Tageswert['zustand'], string> = {
  ok: 'st-ok',
  grenze: 'st-grenze',
  fehlt: 'st-fehlt',
  weg: 'st-weg',
  frei: 'st-frei',
  zukunft: 'st-zukunft',
};

/** Raster der Spalten: so viele wie der Monat Tage hat. */
function spalten(n: number) {
  return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
}

/**
 * Der Monat einer Person als Streifen: ein Feld je Kalendertag, genau ein
 * Zustand je Feld. Wochenende und Feiertag sind kein Knopf (nichts zu tun);
 * jedes andere Feld öffnet das Seitenfenster mit diesem Tag.
 */
export function Streifen({
  name,
  werte,
  heute,
  onTag,
}: {
  name: string;
  werte: readonly Tageswert[];
  heute: string;
  onTag: (tag: string) => void;
}) {
  const { zeige, weg } = useTipp();
  const klickbar = (t: Tageswert) => t.zustand !== 'frei';
  const [aktiv, setAktiv] = useState<string | null>(null);
  const tabTag = aktiv ?? startTag(werte, heute, klickbar);
  return (
    <div className="streifen" style={spalten(werte.length)} role="group" aria-label={`${name}, Tage des Monats`} onKeyDown={pfeilWandern}>
      {werte.map((t) => {
        if (!klickbar(t)) return <span key={t.tag} className="st-frei" aria-hidden="true" />;
        const text = tippText(t);
        return (
          <button
            key={t.tag}
            type="button"
            className={STREIFEN_KLASSE[t.zustand]}
            aria-label={`${name}, ${text}`}
            tabIndex={t.tag === tabTag ? 0 : -1}
            onClick={(e) => {
              // Die Zeile öffnet das Fenster ohne Tag — das Feld mit.
              e.stopPropagation();
              weg();
              onTag(t.tag);
            }}
            onMouseEnter={(e) => zeige(e.currentTarget, text)}
            onMouseLeave={weg}
            onFocus={(e) => {
              setAktiv(t.tag);
              zeige(e.currentTarget, text);
            }}
            onBlur={weg}
          />
        );
      })}
    </div>
  );
}

/**
 * Die Tageszahlen über dem Streifen — nur als Wegmarken: der Erste, jeder
 * Montag und heute.
 *
 * WARUM NICHT ALLE EINUNDDREISSIG. Ein Feld ist am Schreibtisch rund 16 px
 * breit; zweistellige Zahlen füllen es ganz aus und liefen ab dem Zehnten
 * zu einer Ziffernkette ohne Abstand zusammen („10111213…“, Rückmeldung des
 * Betreibers zu Runde 4). Die Montage gliedern den Monat in Wochen, heute
 * zeigt, wo man steht; den genauen Tag nennt jedes Feld beim Darüberfahren
 * und im Seitenfenster. Die übrigen Zahlen bleiben im DOM, nur unsichtbar,
 * damit jede Marke genau über ihrem Feld steht (Auftrag 3.3.2).
 */
export function StreifenKopf({ tage, heute }: { tage: readonly string[]; heute: string }) {
  const marken = streifenMarken(tage, heute);
  return (
    <div className="streifen" style={spalten(tage.length)} aria-hidden="true">
      {tage.map((d) => (
        <span key={d} className={d === heute ? 'st-kopf-heute' : marken.has(d) ? 'st-kopf-mo' : 'st-kopf'}>
          {Number(d.slice(8))}
        </span>
      ))}
    </div>
  );
}

/*
  Die Klassen ausgeschrieben, nicht zusammengesetzt: Tailwind behält nur
  Bausteine, deren Namen es im Quelltext findet.
*/
const LEGENDE_KLASSE: Record<Tageswert['zustand'], string> = {
  ok: 'leg-ok',
  grenze: 'leg-grenze',
  fehlt: 'leg-fehlt',
  weg: 'leg-weg',
  frei: 'leg-frei',
  zukunft: 'leg-zukunft',
};

/** Ein Feld der Legende und der Musterseite: dieselbe Farbe, kein Knopf. */
export function StreifenFeld({ zustand }: { zustand: Tageswert['zustand'] }) {
  return <span className={LEGENDE_KLASSE[zustand]} aria-hidden="true" />;
}

// ── Woche ───────────────────────────────────────────────────────────────
const ZELLE_KLASSE: Record<Tageswert['zustand'], string> = {
  ok: 'mw-zelle',
  grenze: 'mw-zelle-grenze',
  fehlt: 'mw-zelle-fehlt',
  weg: 'mw-zelle-weg',
  frei: 'mw-zelle-frei',
  zukunft: 'mw-zelle-zukunft',
};

/** Was in der Zelle steht (Auftrag 3.4): Stunden und Von–Bis, „fehlt“, die Art als Wort, „–“, „Feiertag“, „heute“. */
function zellInhalt(t: Tageswert, heute: string): ReactNode {
  switch (t.zustand) {
    case 'ok':
    case 'grenze':
      if (t.istMin === 0 && t.abwesenheit) return <span className="mw-art">{artWort(t.abwesenheit)}</span>;
      return (
        <>
          <span className="mw-std">{kurzeZeit(t.istMin)}</span>
          <span className="mw-von">
            {t.eintraege.length > 1 ? `${t.eintraege.length} Buchungen` : t.zeiten ?? ''}
          </span>
        </>
      );
    case 'fehlt':
      return 'fehlt';
    case 'weg':
      return t.abwesenheit ? <span className="mw-art">{artWort(t.abwesenheit)}</span> : '';
    case 'frei':
      return t.feiertag ? 'Feiertag' : '–';
    case 'zukunft':
      return t.tag === heute ? 'heute' : '';
  }
}

/** Eine Zelle der Woche — anklickbar ausser Wochenende und Feiertag. */
export function WochenZelle({
  name,
  wert,
  heute,
  onTag,
  tabIndex,
  onFokus,
}: {
  name: string;
  wert: Tageswert;
  heute: string;
  onTag: (tag: string) => void;
  tabIndex: number;
  onFokus: () => void;
}) {
  const { zeige, weg } = useTipp();
  if (wert.zustand === 'frei') {
    return (
      <span className="mw-zelle-frei" aria-hidden="true">
        {zellInhalt(wert, heute)}
      </span>
    );
  }
  const text = tippText(wert);
  return (
    <button
      type="button"
      className={ZELLE_KLASSE[wert.zustand]}
      aria-label={`${name}, ${text}`}
      tabIndex={tabIndex}
      onClick={(e) => {
        e.stopPropagation();
        weg();
        onTag(wert.tag);
      }}
      onMouseEnter={(e) => zeige(e.currentTarget, text)}
      onMouseLeave={weg}
      onFocus={(e) => {
        onFokus();
        zeige(e.currentTarget, text);
      }}
      onBlur={weg}
    >
      {zellInhalt(wert, heute)}
    </button>
  );
}

/** Die sieben Zellen einer Person — EIN Tabulatorschritt, ← → wandern. */
export function WochenZellen({
  name,
  werte,
  heute,
  onTag,
}: {
  name: string;
  werte: readonly Tageswert[];
  heute: string;
  onTag: (tag: string) => void;
}) {
  const klickbar = (t: Tageswert) => t.zustand !== 'frei';
  const [aktiv, setAktiv] = useState<string | null>(null);
  const tabTag = aktiv ?? startTag(werte, heute, klickbar);
  return (
    <div className="mw-tage" role="group" aria-label={`${name}, Tage der Woche`} onKeyDown={pfeilWandern}>
      {werte.map((t) => (
        <WochenZelle
          key={t.tag}
          name={name}
          wert={t}
          heute={heute}
          onTag={onTag}
          tabIndex={t.tag === tabTag ? 0 : -1}
          onFokus={() => setAktiv(t.tag)}
        />
      ))}
    </div>
  );
}

/** Der Kopf der Woche: „Mo 05.10.“, heute in Petrol mit Unterstrich. */
export function WochenKopf({ tage, heute }: { tage: readonly string[]; heute: string }) {
  return (
    <div className="mw-tage" aria-hidden="true">
      {tage.map((d) => (
        <span key={d} className={d === heute ? 'mw-kopf-heute' : 'mw-kopf'}>
          {wochentagKurz(d)}
          <br />
          {`${d.slice(8, 10)}.${d.slice(5, 7)}.`}
        </span>
      ))}
    </div>
  );
}
