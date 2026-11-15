import { useLayoutEffect, useRef } from 'react';
import { DAUER, EASE, kannBewegen } from '@/lib/bewegung';

/**
 * EINE ZAHL, DIE SICH ÄNDERT, ROLLT (Plan 15.11.2026, B6).
 *
 * Zähler und Kennzahlen (Abzeichen der Navigation, Papierkorb, Saldo, die
 * Werte im Schriftfeld) wechselten stumm oder blendeten nur ein — dass sich
 * etwas geändert hat, sah man kaum. Jetzt rollt der alte Wert hinaus und
 * der neue herein: nach oben, wenn die Zahl wächst, nach unten, wenn sie
 * sinkt.
 *
 * WIE: der neue Wert steht sofort im Text (Vorlesehilfe, Suche und Kopieren
 * sehen nur ihn). Ein stummes Abbild des alten liegt für die Bewegung
 * darüber und wird danach entfernt. Nur `transform` und Deckkraft; die
 * Ränder schneidet `clip-path`, ohne die Grundlinie zu verschieben (ein
 * `overflow: hidden` an einem Inline-Block setzte sie an dessen Unterkante).
 * Beim ersten Zeichnen rollt nichts — das ist Laden (B8), keine Änderung.
 */
export default function RollZahl({ wert, von, className }: {
  wert: string | number;
  /**
   * Der Wert vor diesem Zeichnen, wo der Baustein bei jeder Änderung neu
   * eingesetzt wird (ein eigener Schlüssel je Stand) und sich darum selbst
   * nichts merken kann.
   */
  von?: string | number;
  className?: string;
}) {
  const text = String(wert);
  const huelle = useRef<HTMLSpanElement>(null);
  const neu = useRef<HTMLSpanElement>(null);
  const vorher = useRef<string | undefined>(von === undefined ? undefined : String(von));
  useLayoutEffect(() => {
    const alt = vorher.current;
    vorher.current = text;
    const el = huelle.current;
    if (alt === undefined || alt === text || !el || !neu.current || !kannBewegen(el)) return;
    const hoch = zahlAus(text) >= zahlAus(alt);
    for (const g of el.querySelectorAll('[data-rollzahl-alt]')) g.remove();
    const geist = document.createElement('span');
    geist.setAttribute('data-rollzahl-alt', '');
    geist.setAttribute('aria-hidden', 'true');
    geist.className = 'rollzahl-alt';
    geist.textContent = alt;
    el.append(geist);
    const weg = geist.animate(
      [{ transform: 'none', opacity: 1 }, { transform: `translateY(${hoch ? -100 : 100}%)`, opacity: 0 }],
      { duration: DAUER.zustand, easing: EASE, fill: 'forwards' },
    );
    weg.onfinish = () => geist.remove();
    weg.oncancel = () => geist.remove();
    neu.current.animate(
      [{ transform: `translateY(${hoch ? 100 : -100}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: DAUER.zustand, easing: EASE },
    );
  }, [text]);
  return (
    <span ref={huelle} className={className ? `rollzahl ${className}` : 'rollzahl'}>
      <span ref={neu} className="rollzahl-neu">{text}</span>
    </span>
  );
}

/**
 * Die Zahl in einem Anzeigetext — für die Richtung. Österreichische
 * Schreibweise: Punkt trennt Tausender, Komma Dezimalen, „−“ ist minus,
 * „12:30“ sind Stunden und Minuten. Ohne Ziffer: 0.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function zahlAus(text: string): number {
  const t = text.replace(/−/g, '-');
  const uhr = /(-?)\s*(\d+):(\d{2})/.exec(t);
  if (uhr) return (uhr[1] ? -1 : 1) * (Number(uhr[2]) * 60 + Number(uhr[3]));
  const m = /(-?)\s*(\d[\d.\s]*)(,\d+)?/.exec(t);
  if (!m) return 0;
  const ganz = Number(m[2].replace(/[.\s]/g, ''));
  const rest = m[3] ? Number(`0.${m[3].slice(1)}`) : 0;
  return (m[1] ? -1 : 1) * (ganz + rest);
}
