import { forwardRef } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import Icon from '@/components/Icon';
import { dauerText, timerBaustelle, timerDauer } from '@/lib/zeitsitzung';
import { useZeitsitzung } from './zeitsitzungStand';

/**
 * DIE TIMER-LEISTE (08.11.2026) — solange ein Arbeitstag läuft, auf jeder
 * Seite außer denen mit der Karte „Arbeitstag“ (Start, Zeiterfassung): die
 * Uhr, die Baustelle bzw. „Pause“, Pause/Weiter und Feierabend. Ein Tipp
 * auf die Uhr führt zur Karte.
 *
 * Am Telefon steht sie fest über der Reiterleiste; das Layout rechnet ihre
 * Höhe in `--reiter-hoehe` ein, so rücken die Leisten, die dort schon
 * kleben (Aktionsleiste, Warenkorb), von selbst darüber. Im Gespräch der
 * Nachrichten steht unten die Eingabe — dort bleibt sie weg. Ab dem Tablet
 * klebt sie unten im Inhalt.
 */
const OHNE = {
  telefon: ['/', '/time', '/nachrichten/:kanal'],
  // Ab dem Tablet steht die Eingabe der Nachrichten im Blatt — dort stört die Leiste nicht.
  breit: ['/', '/time'],
};

const TimerLeiste = forwardRef<HTMLDivElement, { ort: 'telefon' | 'breit' }>(function TimerLeiste({ ort }, ref) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const z = useZeitsitzung();
  const s = z.laeuft;
  const zeigen = !!s && !OHNE[ort].some((muster) => matchPath({ path: muster, end: true }, pathname));
  // Ausgeschrieben, nicht zusammengesetzt: Tailwind behält nur Klassen, die wörtlich im Code stehen.
  const halter = ort === 'telefon' ? 'timer-leiste-halter timer-leiste-telefon' : 'timer-leiste-halter timer-leiste-breit';
  if (!zeigen || !s) return <div ref={ref} className={halter} />;

  const pause = s.stand === 'pause';
  const d = timerDauer(s, z.jetzt);
  const baustelle = timerBaustelle(s);

  return (
    <div ref={ref} className={halter}>
      <div className="timer-leiste" role="region" aria-label="Laufender Arbeitstag" data-stand={pause ? 'pause' : 'laeuft'}>
        <Link to="/" className="timer-leiste-text">
          <span className="arbeitstag-punkt" aria-hidden="true" />
          <span className="timer-leiste-uhr">{dauerText(pause ? d.pauseMs : d.arbeitMs, false)}</span>
          <span className="timer-leiste-was">{pause ? 'Pause' : baustelle || 'Arbeitstag'}</span>
        </Link>
        {pause ? (
          <button type="button" className="rund-knopf rund-knopf-voll rund-knopf-klein" aria-label="Weiterarbeiten" title="Weiterarbeiten" disabled={z.speichert} onClick={() => void z.befehl('weiter', s, baustelle)}>
            <Icon name="play" size={20} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="rund-knopf rund-knopf-klein" aria-label="Pause beginnen" title="Pause beginnen" disabled={z.speichert} onClick={() => void z.befehl('pause', s, baustelle)}>
            <Icon name="pause" size={20} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={pause ? 'rund-knopf rund-knopf-klein' : 'rund-knopf rund-knopf-klein rund-knopf-voll'}
          aria-label="Stoppen und prüfen"
          title="Feierabend: stoppen und prüfen"
          disabled={z.speichert}
          // Nach dem Stopp gleich zu den Abschnitten — gebucht wird erst dort.
          onClick={() => void z.befehl('stop', s, baustelle).then((ok) => { if (ok) navigate('/time'); })}
        >
          <Icon name="stopp" size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

export default TimerLeiste;
