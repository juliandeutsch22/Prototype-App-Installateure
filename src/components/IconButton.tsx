import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // Pflicht: aria-label (kein sichtbarer Text)
  tone?: 'default' | 'danger';
  /** Größeres Zeichen — für einzelne Pfeile (‹ ›), die sonst in der Fläche verschwinden. */
  gross?: boolean;
}

/**
 * Quadratischer Icon-Button (z. B. Löschen/Bearbeiten) mit korrektem
 * Touch-Ziel und sichtbarem Press-Feedback. Ersetzt die früher verstreuten
 * Ad-hoc-„✕"-Buttons.
 */
export default function IconButton({
  label,
  tone = 'default',
  gross = false,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const klasse = tone === 'danger' ? 'symbolknopf-gefahr' : gross ? 'symbolknopf-gross' : 'symbolknopf';
  // `data-icon` ist das Kennzeichen fuer ListRow: Symbolknoepfe bekommen dort
  // NICHT die kompakte Textbehandlung, sonst schruempfte das Symbol mit.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-icon=""
      className={className ? `${klasse} ${className}` : klasse}
      {...rest}
    >
      {children}
    </button>
  );
}
