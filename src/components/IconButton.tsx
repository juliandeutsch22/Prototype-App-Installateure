import type { ButtonHTMLAttributes } from 'react';
import { variants } from './knopf';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // Pflicht: aria-label (kein sichtbarer Text)
  tone?: 'default' | 'danger';
  /**
   * GERAHMT WIE DER ZWEITKNOPF (E72, 09.11.2026, Regel R8): für Steuerknöpfe,
   * die die Hauptbedienung sind — Menge − und +, Blättern ‹ ›. Schlicht
   * standen „−“ und „+“ bei „Material anfordern“ als graue Zeichen ohne
   * Rahmen neben dem Mengenfeld; mit Handschuhen trifft man ein Ziel, das man
   * als Ziel erkennt. Rahmen und Fläche kommen aus `knopf.ts`, damit sie
   * dieselben bleiben wie beim Zweitknopf. Ohne den Schalter bleibt der
   * Symbolknopf schlicht (Entfernen „✕“ in einer Zeile).
   */
  gerahmt?: boolean;
}

/**
 * Quadratischer Icon-Button (z. B. Löschen/Bearbeiten) mit korrektem
 * Touch-Ziel und sichtbarem Press-Feedback. Ersetzt die früher verstreuten
 * Ad-hoc-„✕"-Buttons.
 */
export default function IconButton({
  label,
  tone = 'default',
  gerahmt = false,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const tones = {
    default: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    danger: 'text-ink-muted hover:bg-danger-bg hover:text-danger',
  };
  const gestalt = gerahmt
    ? `${variants.secondary} disabled:cursor-not-allowed disabled:opacity-50`
    : tones[tone];
  // `data-icon` ist das Kennzeichen fuer ListRow: Symbolknoepfe bekommen dort
  // NICHT die kompakte Textbehandlung, sonst schruempfte das Symbol mit.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-icon=""
      className={`lot-knopf inline-flex min-h-touch min-w-touch items-center justify-center rounded text-lg ${gestalt} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
