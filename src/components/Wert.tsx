import type { ReactNode } from 'react';
import { SkeletonList } from './States';

/**
 * Ein Wert, der von Daten abhängt — erst, wenn seine ganze Grundlage da ist.
 *
 * WARUM (Analyse 10.10.2026). Rechnete eine Seite aus einer Liste, die noch
 * lud, stand ein falscher Wert da, als wäre er echt: „€ 0,00 offen“, ein
 * Saldo von −9.663 Std., „Benutzer (0)“. Eine leere Liste heißt aber nicht
 * „null“, sondern „weiß ich noch nicht“. Solange `bereit` fehlt, steht ein
 * Platzhalter in der Höhe der Zeile; dann erscheint der Wert und blendet
 * kurz ein.
 *
 * DIE FORM GIBT `muster` VOR — ein Text in der Form des späteren Werts,
 * ohne Farbe und nur im Pseudo-Element gesetzt (`.skeleton-text`). So hat der Platzhalter dessen Breite,
 * Höhe und Zeilenumbruch, und nichts daneben verschiebt sich, wenn der Wert
 * kommt.
 */
export function Wert({
  bereit,
  muster = '000',
  children,
}: {
  bereit: boolean;
  muster?: string;
  children: ReactNode;
}) {
  if (!bereit) {
    return (
      <span role="status" aria-busy="true">
        <span className="sr-only">wird geladen</span>
        <span aria-hidden="true" className="skeleton skeleton-text" data-muster={muster} />
      </span>
    );
  }
  return <span className="wert-erscheint">{children}</span>;
}

/**
 * Ein Block, der erst als Ganzes erscheint.
 *
 * Für alles, was aus mehreren Abfragen zusammengesetzt wird oder über
 * späterem Inhalt steht: kam ein Teil früher, schob sich der Rest
 * nachträglich dazwischen (Rechnungen: Mahnlauf über der Liste; Urlaub:
 * offene Anträge über dem Formular). Bis `bereit` steht ein Platzhalter in
 * Listenform; `className` trägt die Abstände, die sonst der umgebende
 * Behälter zwischen den Kindern setzt.
 */
export function Bereit({
  wenn,
  platzhalter,
  className,
  children,
}: {
  wenn: boolean;
  platzhalter?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  if (!wenn) return <>{platzhalter ?? <SkeletonList rows={5} />}</>;
  return <div className={`wert-erscheint ${className ?? ''}`.trim()}>{children}</div>;
}
