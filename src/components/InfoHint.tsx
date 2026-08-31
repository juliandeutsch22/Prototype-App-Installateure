import { useId, useState, type ReactNode } from 'react';

/**
 * Kleines „i"; der Erklärtext kommt erst auf Tipp.
 *
 * Beipacktext stand bisher dauerhaft unter jedem Feld und in jeder Karte.
 * Beim ersten Mal hilfreich, ab dem zweiten Mal Rauschen — und auf 390 px
 * kostete allein die Erklärung der Eilzustellung drei Zeilen, also mehr Platz
 * als das Kästchen, um das es ging. Wer die Antwort kennt, soll sie nicht bei
 * jedem Aufruf wieder wegblättern müssen.
 *
 * Bewusst aufklappend im Fluss statt als schwebende Sprechblase: Karten
 * tragen `overflow-hidden`, eine Blase würde an deren Kante abgeschnitten —
 * genau der Fehler, den wir hier schon einmal hatten. Auf dem Telefon ist ein
 * Kasten, der einen Teil des Formulars verdeckt, ohnehin keine Hilfe, und
 * „überfahren" kann ein Finger einen Tooltip nicht.
 *
 * Drei Bausteine, weil die Umgebung verschieden ist:
 *   InfoHint   — Knopf UND Text, für eine Zeile mit `flex-wrap`
 *   InfoButton — nur der Knopf, wenn der Text woanders stehen muss
 *   InfoPanel  — nur der Text (siehe Card: dort liegt der Knopf im Kopf,
 *                der Text darunter über die volle Breite)
 */

interface InfoButtonProps {
  /** Was erklärt wird — für die Vorlesehilfe, z. B. „Eilzustellung". */
  about: string;
  offen: boolean;
  onToggle: () => void;
  /** id des zugehörigen InfoPanel. */
  controls: string;
}

export function InfoButton({ about, offen, onToggle, controls }: InfoButtonProps) {
  return (
    <button
      type="button"
      // Ein echter <button>, nicht ein <span> mit onClick. Das ist nicht nur
      // Semantik: liegt das „i" einmal innerhalb eines <label>, überspringt
      // der Browser dessen Aktivierung bei Bedienelementen darin — der Tipp
      // auf die Erklärung schaltet dann NICHT zugleich das Kästchen um.
      onClick={() => onToggle()}
      aria-expanded={offen}
      aria-controls={controls}
      aria-label={offen ? `Erklärung zu ${about} schließen` : `Was bedeutet ${about}?`}
      // Das Symbol misst 20 px, die Tastfläche darum 44 px — ohne die
      // negativen Ränder risse das Ziel die Zeilenhöhe auseinander.
      className="-mx-2 -my-3 inline-flex h-11 w-11 shrink-0 items-center justify-center align-middle text-ink-muted hover:text-brand"
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.7rem] font-bold leading-none ${
          offen ? 'border-brand bg-brand text-brand-fg' : 'border-current'
        }`}
      >
        i
      </span>
    </button>
  );
}

export function InfoPanel({
  id,
  className = '',
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={`rounded border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * Knopf und Text zusammen.
 *
 * BEDINGUNG AN DIE AUFRUFSTELLE: der umgebende Behälter muss eine ZEILE mit
 * `flex-wrap` sein. Der Text nimmt per `basis-full` eine eigene Zeile ein —
 * ohne Umbruch quetschte er sich neben die Beschriftung, und in einer
 * Spalten-Flexbox bedeutete `basis-full` volle HÖHE statt voller Breite.
 */
export default function InfoHint({ about, children }: { about: string; children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  return (
    <>
      <InfoButton about={about} offen={offen} onToggle={() => setOffen((o) => !o)} controls={id} />
      {offen && (
        <InfoPanel id={id} className="mt-2 basis-full">
          {children}
        </InfoPanel>
      )}
    </>
  );
}
