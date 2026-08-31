import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode; // optionale Aktion rechts neben dem Titel
  footer?: ReactNode;
}

/**
 * Ruhige Karte: dünne Linie, flacher Schatten, kompaktes Innenmaß.
 *
 * Der farbige Balken links ist entfallen. Er war als Signatur gedacht,
 * markierte am Ende aber fast jede Karte — und was überall steht, hebt
 * nichts mehr hervor. Übrig blieb eine Oberfläche, die an jeder Kante
 * etwas behauptet. Betont wird jetzt über Inhalt und Badge, nicht über
 * Rahmenschmuck.
 *
 * Auch der Schatten beim Überfahren ist weg: Karten sind hier keine
 * Schaltflächen, sie sollen nicht so tun.
 */
export default function Card({ children, className = '', title, action, footer }: CardProps) {
  return (
    <section className={`overflow-hidden rounded-lg border border-line bg-surface ${className}`}>
      {title && (
        <header
          // Auf schmalen Schirmen untereinander: sonst überlagern breite
          // Aktionen (mehrere Knöpfe) den Titel.
          className="flex flex-col items-start gap-2 border-b border-line px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        >
          {/* Kartentitel sind im Prototyp klein, fett und versal gesetzt —
              sie ordnen den Inhalt, ohne mit der Seitenüberschrift zu konkurrieren. */}
          <h2 className="section-label">{title}</h2>
          {action}
        </header>
      )}
      <div className="px-4 py-3.5">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-2.5">{footer}</footer>}
    </section>
  );
}
