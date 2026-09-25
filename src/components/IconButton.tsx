import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // Pflicht: aria-label (kein sichtbarer Text)
  tone?: 'default' | 'danger';
}

/**
 * Quadratischer Icon-Button (z. B. Löschen/Bearbeiten) mit korrektem
 * Touch-Ziel und sichtbarem Press-Feedback. Ersetzt die früher verstreuten
 * Ad-hoc-„✕"-Buttons.
 */
export default function IconButton({
  label,
  tone = 'default',
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const tones = {
    default: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    danger: 'text-ink-muted hover:bg-danger-bg hover:text-danger',
  };
  // `data-icon` ist das Kennzeichen fuer ListRow: Symbolknoepfe bekommen dort
  // NICHT die kompakte Textbehandlung, sonst schruempfte das Symbol mit.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-icon=""
      className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded text-lg transition active:scale-95 ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
