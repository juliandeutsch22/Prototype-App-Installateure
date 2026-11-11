import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
 *
 * MIT DEM FINGER NIMMT SIE DEN FOKUS NICHT (11.11.2026, „funktioniert noch
 * nicht verlässlich … komische Sprünge“). War die Tastatur offen, schloss der
 * Fokus in der Leiste sie; die Ansicht änderte die Größe, und die Leiste ging
 * im selben Moment wieder zu. Nach einem Zeichen bekam die Eingabe den Fokus
 * zurück, die Tastatur sprang wieder auf und schob die Seite. Jetzt bleibt
 * der Fokus, wo er war — und die Leiste folgt ihrer Nachricht, wenn Tastatur
 * oder Seite sich bewegen, statt zuzugehen. Sie geht erst, wenn die Nachricht
 * aus dem sichtbaren Teil verschwindet.
 */
export default function NachrichtWahl({
  n,
  m,
  ziel,
  finger,
  onMarkieren,
  onReagieren,
  onHandlung,
  onClose,
}: {
  n: Nachricht;
  m: Moeglichkeiten;
  /** Die Blase, an der die Leiste steht. */
  ziel: HTMLElement;
  /** Mit dem Finger geöffnet (langes Drücken) — sonst mit der Tastatur. */
  finger: boolean;
  /** Nur mit dem Finger: den Text der Nachricht markieren (die Maus markiert ihn direkt). */
  onMarkieren?: () => void;
  onReagieren: (z: Reaktionszeichen, an: boolean) => void;
  onHandlung: (h: Handlung) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<{ links: number; oben: number } | null>(null);
  useFokusFalle(box, !finger, { hineinHolen: 'behaelter', zurueckGeben: true });

  /*
    Wo die Leiste steht: über der Blase, wo Platz ist, sonst darunter. Der
    freie Teil liegt zwischen Kopfleiste und Eingabe (am Telefon stehen beide
    fest) und innerhalb dessen, was die Tastatur übrig lässt (`visualViewport`).
    `false`, wenn die Nachricht beim Folgen ganz aus diesem Teil gewandert
    ist; beim Öffnen ist sie es nie — sie wurde eben gedrückt.
  */
  const messen = useCallback((folgen: boolean): boolean => {
    const p = box.current;
    if (!p || !ziel.isConnected) return false;
    const b = ziel.getBoundingClientRect();
    const breite = p.offsetWidth;
    const hoehe = p.offsetHeight;
    const vv = window.visualViewport;
    const sichtOben = vv ? vv.offsetTop : 0;
    const sichtUnten = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const kopf = document.querySelector('.kopfzeile')?.getBoundingClientRect().bottom ?? 0;
    const eingabe = document.querySelector<HTMLElement>('.eingabe');
    const fuss = eingabe && getComputedStyle(eingabe).position === 'fixed' ? eingabe.getBoundingClientRect().top : window.innerHeight;
    const oberGrenze = Math.max(kopf, sichtOben, 0) + RAND;
    const unterGrenze = Math.min(fuss, sichtUnten) - RAND;
    if (folgen && (b.bottom < oberGrenze || b.top > unterGrenze)) return false;
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
    setLage((alt) => (alt && Math.abs(alt.links - links) < 0.5 && Math.abs(alt.oben - oben) < 0.5 ? alt : { links, oben }));
    return true;
  }, [ziel]);

  useLayoutEffect(() => {
    messen(false);
  }, [messen]);

  // Rollt die Seite oder kommt die Tastatur, folgt die Leiste ihrer Nachricht — einmal je Bild.
  useEffect(() => {
    let bild: number | null = null;
    const folgen = () => {
      if (bild !== null) return;
      bild = window.requestAnimationFrame(() => {
        bild = null;
        if (!messen(true)) onClose();
      });
    };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const vv = window.visualViewport;
    window.addEventListener('scroll', folgen, { capture: true, passive: true });
    window.addEventListener('resize', folgen);
    vv?.addEventListener('resize', folgen);
    vv?.addEventListener('scroll', folgen);
    document.addEventListener('keydown', taste);
    return () => {
      if (bild !== null) window.cancelAnimationFrame(bild);
      window.removeEventListener('scroll', folgen, { capture: true });
      window.removeEventListener('resize', folgen);
      vv?.removeEventListener('resize', folgen);
      vv?.removeEventListener('scroll', folgen);
      document.removeEventListener('keydown', taste);
    };
  }, [messen, onClose]);

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
        // Mit dem Finger nimmt auch ein Tipp auf ein Zeichen den Fokus nicht — sonst ginge dabei die Tastatur zu.
        onMouseDown={finger ? (e) => e.preventDefault() : undefined}
        style={lage ? { left: lage.links, top: lage.oben } : { visibility: 'hidden', left: 0, top: 0 }}
      >
        <NachrichtLeiste
          n={n}
          m={m}
          zeilen={2}
          schwebend={false}
          seite="oben"
          gross
          onMarkieren={onMarkieren ? () => { onClose(); onMarkieren(); } : undefined}
          onReagieren={(z, an) => { onReagieren(z, an); onClose(); }}
          onHandlung={(h) => { onClose(); onHandlung(h); }}
        />
      </div>
    </>,
    document.body,
  );
}
