import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Nachricht, Reaktionszeichen } from '@/lib/db/nachrichten';
import { useFokusFalle } from '@/components/fokusFalle';
import { NachrichtLeiste } from './NachrichtLeiste';
import type { Handlung, Moeglichkeiten } from './moeglichkeiten';

/** Abstand zur Blase und zum Rand des Bildschirms. */
const RAND = 8;

/**
 * DIE SCHWEBENDE LEISTE NACH LANGEM DRÜCKEN (E79, 11.11.2026): „auch mobil
 * hätte ich es gerne viel schlanker gelöst.“ Statt eines Fensters von unten
 * mit Text, Reaktionen und einer Liste steht dieselbe Leiste wie am
 * Schreibtisch direkt an der Nachricht — über ihr, wo Platz ist, sonst
 * darunter —, nur mit 44-px-Zielen für den Finger und zweizeilig (oben die
 * Reaktionen, darunter die Handlungen). Ein Tipp daneben, Rollen oder
 * Escape schließt sie. Mit der Tastatur öffnet sie die Eingabetaste an der
 * Nachricht; der Fokus geht hinein und danach zurück.
 */
export default function NachrichtWahl({
  n,
  m,
  ziel,
  onReagieren,
  onHandlung,
  onClose,
}: {
  n: Nachricht;
  m: Moeglichkeiten;
  /** Die Blase, an der die Leiste steht. */
  ziel: HTMLElement;
  onReagieren: (z: Reaktionszeichen, an: boolean) => void;
  onHandlung: (h: Handlung) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<{ links: number; oben: number } | null>(null);
  useFokusFalle(box, true, { hineinHolen: 'behaelter', zurueckGeben: true });

  useLayoutEffect(() => {
    const p = box.current;
    if (!p) return;
    const b = ziel.getBoundingClientRect();
    const breite = p.offsetWidth;
    const hoehe = p.offsetHeight;
    // Am Telefon stehen oben die Kopfleiste und unten die Eingabe fest — dazwischen ist Platz.
    const kopf = document.querySelector('.kopfzeile')?.getBoundingClientRect().bottom ?? 0;
    const eingabe = document.querySelector<HTMLElement>('.eingabe');
    const fuss = eingabe && getComputedStyle(eingabe).position === 'fixed' ? eingabe.getBoundingClientRect().top : window.innerHeight;
    const oberGrenze = Math.max(kopf, 0) + RAND;
    const unterGrenze = fuss - RAND;
    const darueber = b.top - RAND - hoehe;
    const darunter = b.bottom + RAND;
    const oben = darueber >= oberGrenze
      ? darueber
      : darunter + hoehe <= unterGrenze
        ? darunter
        // Eine Blase so hoch wie der Bildschirm: die Leiste oben im freien Teil.
        : Math.max(oberGrenze, Math.min(b.top + RAND, unterGrenze - hoehe));
    const eigene = !!ziel.closest('.nachricht[data-eigene]');
    const links = Math.min(Math.max(eigene ? b.right - breite : b.left, RAND), window.innerWidth - breite - RAND);
    setLage({ links, oben });
  }, [ziel]);

  // Wer rollt, ist woanders: die Leiste ginge sonst mit der Seite weg von ihrer Nachricht.
  useEffect(() => {
    const zu = () => onClose();
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('scroll', zu, { capture: true, passive: true });
    window.addEventListener('resize', zu);
    document.addEventListener('keydown', taste);
    return () => {
      window.removeEventListener('scroll', zu, { capture: true });
      window.removeEventListener('resize', zu);
      document.removeEventListener('keydown', taste);
    };
  }, [onClose]);

  return createPortal(
    <>
      {/* Ein Tipp daneben schließt — ohne Schleier: die Nachricht bleibt zu sehen. */}
      <div className="wahl-fang" aria-hidden="true" onPointerDown={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={box}
        className="wahl-schwebend"
        role="dialog"
        aria-label={`Zur Nachricht von ${n.eigene ? 'dir' : n.vonName}`}
        tabIndex={-1}
        style={lage ? { left: lage.links, top: lage.oben } : { visibility: 'hidden', left: 0, top: 0 }}
      >
        <NachrichtLeiste
          n={n}
          m={m}
          zeilen={2}
          schwebend={false}
          seite="oben"
          gross
          onReagieren={(z, an) => { onReagieren(z, an); onClose(); }}
          onHandlung={(h) => { onClose(); onHandlung(h); }}
        />
      </div>
    </>,
    document.body,
  );
}
