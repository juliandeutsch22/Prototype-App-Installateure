import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // Pflicht: aria-label (kein sichtbarer Text)
  tone?: 'default' | 'danger';
  /**
   * DER KLEINE PETROL-KREIS (E74, 10.11.2026): die eine Hauptsache einer Zeile
   * oder Steuerleiste, die man oft drückt — „zurück zu heute“, „in die
   * Liste“. Wie Start und Stopp der Karte „Arbeitstag“, nur kleiner (48 px).
   * Höchstens einer je Zeile. Ohne den Schalter bleibt der Symbolknopf
   * schlicht: ohne Rahmen, für Handlungen an einer Sache, die jeder kennt.
   * Den gerahmten Symbolknopf (E72, R8) gibt es nicht mehr — gerahmt wird nur
   * noch eine Gruppe, die mit einem Feld eine Einheit bildet (`MengenWahl`).
   */
  rund?: boolean;
}

/**
 * Symbolknopf (z. B. Löschen/Bearbeiten) mit 48 px Tastfläche und sichtbarem
 * Druck. Der Name kommt als `aria-label` und `title`: für die Vorlesehilfe
 * und als Hinweis beim Darüberfahren (E74).
 */
export default function IconButton({
  label,
  tone = 'default',
  rund = false,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const tones = {
    default: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    danger: 'text-ink-muted hover:bg-danger-bg hover:text-danger',
  };
  const gestalt = rund ? 'symbol-rund' : tones[tone];
  // `data-icon` ist das Kennzeichen fuer ListRow: Symbolknoepfe bekommen dort
  // NICHT die kompakte Textbehandlung, sonst schruempfte das Symbol mit.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-icon=""
      className={`lot-knopf inline-flex min-h-touch min-w-touch items-center justify-center ${rund ? '' : 'rounded '}text-lg ${gestalt} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
