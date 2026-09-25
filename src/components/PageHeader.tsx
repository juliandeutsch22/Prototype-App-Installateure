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
 * Das Aussehen steht in `.seitenkopf` und Geschwistern (index.css, am Ende)
 * — je Element eine Klasse.
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
    <div className="seitenkopf">
      <div>
        {/*
          EINE STUFE KLEINER AUF DEM TELEFON. 1,75 rem sind am Schreibtisch
          richtig und auf 390 px zu viel: „Benutzerverwaltung" fuellte dort
          zwei Zeilen, und die Ueberschrift nahm mehr Platz ein als die erste
          Karte darunter. 1,375 rem stehen noch klar ueber allem anderen auf
          der Seite — die naechstkleinere Schrift ist der Fliesstext mit
          1 rem.
        */}
        <h1 className="seitentitel">{title}</h1>
        <div className="seitentitel-strich" aria-hidden="true" />
        {subtitle && <p className="seitenkopf-unter">{subtitle}</p>}
      </div>
      {action && <div className="seitenkopf-aktion">{action}</div>}
    </div>
  );
}
