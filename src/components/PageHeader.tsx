import type { ReactNode } from 'react';

/**
 * Einheitlicher Seitenkopf: gleiche Größe/Hierarchie/Position auf jedem Screen.
 * Optionaler `action`-Slot rechts (z. B. Primäraktion), `subtitle` darunter.
 *
 * Unter der Überschrift steht ein kurzer Strich statt einer Linie über die
 * volle Breite. Er bindet jede Seite an dieselbe Marke, ohne den Kopf in
 * einen Kasten zu sperren — und er ist kurz genug, dass er die Überschrift
 * begleitet statt sie zu unterstreichen.
 *
 * `brand-fixed` und nicht `brand`: der Strich gehört Senklot, nicht dem
 * Betrieb. Sonst stünde er bei einem Kunden mit roter Hausfarbe rot unter
 * jeder Überschrift — genau der Fehlgriff, wegen dem die Reitermarkierung
 * schon einmal aus `--accent` herausgenommen wurde (siehe index.css).
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    /*
      DESIGNLINIE „FASSUNG 3" (docs/design/linie.md § 6/7): Titel 24 px am
      Telefon, 30 px am Schreibtisch, halbfett und nie fett; darunter ein
      Strich von 32 px und EINE Meta-Zeile. Die Hauptaktion steht rechts
      unten bündig mit der Meta-Zeile und rutscht auf schmalen Schirmen
      darunter, statt den Titel zu quetschen (`flex-wrap` in `.seitenkopf`).
    */
    <div className="seitenkopf">
      <div className="min-w-0">
        <h1>{title}</h1>
        <div className="seitenkopf-strich" aria-hidden="true" />
        {subtitle && <p className="seitenkopf-meta">{subtitle}</p>}
      </div>
      {action && <div className="seitenkopf-rechts">{action}</div>}
    </div>
  );
}
