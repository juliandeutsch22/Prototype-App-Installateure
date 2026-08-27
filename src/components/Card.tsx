import type { ReactNode } from 'react';

/** Farbstreifen links an der Karte — Signatur-Element der Perl-Oberfläche. */
export type CardAccent = 'brand' | 'accent' | 'warning' | 'success' | 'none';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode; // optionale Aktion rechts neben dem Titel
  footer?: ReactNode;
  accent?: CardAccent;
}

const accentBorder: Record<CardAccent, string> = {
  brand: 'border-l-4 border-l-brand',
  accent: 'border-l-4 border-l-accent',
  warning: 'border-l-4 border-l-warning',
  success: 'border-l-4 border-l-success',
  none: '',
};

export default function Card({
  children,
  className = '',
  title,
  action,
  footer,
  accent = 'none',
}: CardProps) {
  return (
    // hover: ist über future.hoverOnlyWhenSupported auf Zeigergeräte begrenzt,
    // löst auf der Baustelle also keine klebrigen Zustände aus.
    <section
      className={`overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-shadow hover:shadow-lg ${accentBorder[accent]} ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {/* Kartentitel sind im Prototyp klein, fett und versal gesetzt —
              sie ordnen den Inhalt, ohne mit der Seitenüberschrift zu konkurrieren. */}
          <h2 className="section-label">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
    </section>
  );
}
