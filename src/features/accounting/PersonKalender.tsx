import { useState, type KeyboardEvent } from 'react';
import { kurzeZeit, tippText, type Tageswert } from './tagesauswertung';

// Vollständige Namen halten die Kalenderstile auch im bereinigten Produktiv-CSS erreichbar.
const TAG_KLASSE: Record<Tageswert['zustand'], string> = {
  ok: 'pk-tag-ok',
  grenze: 'pk-tag-grenze',
  fehlt: 'pk-tag-fehlt',
  weg: 'pk-tag-weg',
  frei: 'pk-tag-frei',
  zukunft: 'pk-tag-zukunft',
};

/** Derselbe Tagesstand wie in Liste und Streifen, ohne eine zweite Berechnung. */
export default function PersonKalender({ name, werte, ausgewaehlt, onTag }: {
  name: string;
  werte: readonly Tageswert[];
  ausgewaehlt: string | null;
  onTag: (tag: string) => void;
}) {
  const [fokus, setFokus] = useState(ausgewaehlt ?? werte[0]?.tag);
  const erster = werte[0]?.tag;
  const vorlauf = erster ? (new Date(`${erster}T00:00:00`).getDay() + 6) % 7 : 0;
  function wandern(e: KeyboardEvent<HTMLDivElement>) {
    const schritte: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in schritte) && !['Home', 'End'].includes(e.key)) return;
    const knoepfe = Array.from(e.currentTarget.querySelectorAll('button'));
    const index = knoepfe.indexOf(e.target as HTMLButtonElement);
    if (index < 0) return;
    e.preventDefault();
    const ziel = e.key === 'Home' ? 0 : e.key === 'End' ? knoepfe.length - 1 : Math.max(0, Math.min(knoepfe.length - 1, index + schritte[e.key]));
    knoepfe[ziel]?.focus();
  }
  return (
    <div className="pk-monat">
      <div className="pk-wochentage" aria-hidden="true">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="pk-tage" role="group" aria-label={`${name}, Monatskalender`} onKeyDown={wandern}>
        {Array.from({ length: vorlauf }, (_, i) => <span key={`leer-${i}`} aria-hidden="true" />)}
        {werte.map((t) => (
          <button key={t.tag} type="button" className={TAG_KLASSE[t.zustand]}
            aria-label={`${name}, ${tippText(t)}`} aria-pressed={ausgewaehlt === t.tag}
            tabIndex={fokus === t.tag ? 0 : -1} onFocus={() => setFokus(t.tag)} onClick={() => onTag(t.tag)}>
            <span className="pk-datum">{Number(t.tag.slice(8))}</span>
            <span className="pk-wert">{t.zustand === 'fehlt' ? 'fehlt' : t.zustand === 'weg' ? 'abwesend' : t.zustand === 'zukunft' ? 'offen' : t.zustand === 'frei' ? 'frei' : kurzeZeit(t.istMin)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
