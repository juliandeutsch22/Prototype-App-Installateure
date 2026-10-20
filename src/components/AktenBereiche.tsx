import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

export interface AktenBereich {
  id: string;
  titel: string;
  inhalt: ReactNode;
  /** Alte Lesezeichen bleiben erreichbar, auch wenn der Abschnitt jetzt in einem Reiter liegt. */
  sprungziele?: string[];
}

export default function AktenBereiche({ kennung, bereiche }: { kennung: string; bereiche: AktenBereich[] }) {
  const [adresse, setAdresse] = useSearchParams();
  const { hash } = useLocation();
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);
  const sprung = hash.slice(1);
  const sprungBereich = bereiche.find((b) => b.sprungziele?.includes(sprung));
  const sprungBekannt = !!sprungBereich;
  const aktiv = sprungBereich
    ?? bereiche.find((b) => b.id === adresse.get('bereich')) ?? bereiche[0];

  useEffect(() => {
    if (!sprung || !sprungBekannt) return;
    document.getElementById(sprung)?.scrollIntoView?.({ block: 'start' });
  }, [sprung, sprungBekannt]);

  function waehlen(index: number, fokus = false) {
    const bereich = bereiche[index];
    if (!bereich) return;
    const neu = new URLSearchParams(adresse);
    neu.set('bereich', bereich.id);
    setAdresse(neu, { preventScrollReset: true });
    if (fokus) knoepfe.current[index]?.focus();
  }

  function tastatur(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let ziel: number;
    if (e.key === 'ArrowRight') ziel = (index + 1) % bereiche.length;
    else if (e.key === 'ArrowLeft') ziel = (index + bereiche.length - 1) % bereiche.length;
    else if (e.key === 'Home') ziel = 0;
    else if (e.key === 'End') ziel = bereiche.length - 1;
    else return;
    e.preventDefault();
    waehlen(ziel, true);
  }

  return <>
    <div className="akten-bereiche" role="tablist" aria-label="Bereiche der Akte">
      {bereiche.map((b, i) => <button key={b.id} type="button" role="tab" className="akten-reiter"
        id={`${kennung}-reiter-${b.id}`} aria-controls={`${kennung}-bereich-${b.id}`} aria-selected={b === aktiv}
        tabIndex={b === aktiv ? 0 : -1} ref={(el) => { knoepfe.current[i] = el; }}
        onClick={() => waehlen(i)} onKeyDown={(e) => tastatur(e, i)}>{b.titel}</button>)}
    </div>
    {/* Die Abschnitte bleiben montiert: Aufklappzustände und eigene Formulare gehen beim Wechsel nicht verloren. */}
    {bereiche.map((b) => <div key={b.id} role="tabpanel" className="akten-bereich" hidden={b !== aktiv}
      id={`${kennung}-bereich-${b.id}`} aria-labelledby={`${kennung}-reiter-${b.id}`} tabIndex={0}>{b.inhalt}</div>)}
  </>;
}

export function AktenVerweis({ bereich, children }: { bereich: string; children: ReactNode }) {
  const [adresse] = useSearchParams();
  const neu = new URLSearchParams(adresse);
  neu.set('bereich', bereich);
  return <Link to={{ search: `?${neu}` }} className="link-still akten-verweis">{children}</Link>;
}

export function AktenAngaben({ children }: { children: ReactNode }) {
  return <dl className="akten-angaben">{children}</dl>;
}

export function AktenAngabe({ wort, children, breit = false }: { wort: string; children: ReactNode; breit?: boolean }) {
  return <div className={breit ? 'akten-angabe-breit' : 'akten-angabe'}>
    <dt>{wort}</dt><dd>{children === undefined || children === null || children === '' ? <span className="text-ink-muted">nicht hinterlegt</span> : children}</dd>
  </div>;
}
