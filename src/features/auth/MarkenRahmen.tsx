import type { ReactNode } from 'react';
import ProduktMarke from '@/components/ProduktMarke';

/**
 * Der Rahmen der Seiten ohne App-Navigation — Anmeldung, Plattform,
 * Impressum und Datenschutz — nach der Linie (docs/design/linie.md, 8).
 *
 * DIESELBE MARKE WIE IN DER SEITENLEISTE. Bis zum 25.09.2026 trug jede dieser
 * Seiten ihre eigene Fassung: die Anmeldung einen dunklen Kopfstreifen IN der
 * Karte, die Plattform ein dunkles Kästchen über dem Titel, die Rechtsseiten
 * ein Band über die ganze Breite. Jetzt steht das Senklot-Zeichen dort, wo es
 * auch nach der Anmeldung steht: am Telefon in der dunklen Kopfleiste, ab
 * 768 px oben in der dunklen Spalte links — darunter klein, wofür die Seite
 * da ist („Mitarbeiter-Portal“). Rechts davon die helle Fläche mit weißen
 * Karten.
 *
 * Aussehen: `.marken-rahmen` und Geschwister in `index.css`.
 */
export default function MarkenRahmen({
  unter,
  aktion,
  children,
}: {
  /** Die kleine Zeile unter der Marke, wie der Betrieb in der Seitenleiste. */
  unter?: ReactNode;
  /** Ein Weg hinaus, etwa „Zur App“ — am Telefon rechts in der Leiste. */
  aktion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="marken-rahmen">
      <header className="marken-leiste">
        <div className="marken-leiste-marke">
          <ProduktMarke hoehe={30} className="text-white" />
          {unter && <p className="seitenleiste-betrieb">{unter}</p>}
        </div>
        {aktion}
      </header>
      <div className="marken-inhalt">{children}</div>
    </div>
  );
}
