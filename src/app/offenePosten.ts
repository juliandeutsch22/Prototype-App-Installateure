/**
 * Was gerade offen ist — gehalten für die ganze App, nicht je Ansicht.
 *
 * WARUM EIN MODULZUSTAND UND KEIN KONTEXT. Die Zahlen haben zwei ganz
 * verschiedene Leser: die Hülle zeichnet sie (einmal, in der Navigation), und
 * die Fachansichten STOSSEN SIE AN — wer einen Urlaubsantrag entscheidet,
 * muss das Abzeichen im selben Augenblick herunterzählen sehen. Über einen
 * Kontext hiesse das, drei Ansichten in einen Anbieter zu hängen, den sie
 * sonst nicht brauchen. Hier rufen sie eine Funktion.
 *
 * WANN NEU GELADEN WIRD:
 *
 *   - beim ersten Zeichnen der Hülle,
 *   - bei jedem Seitenwechsel (eine Abfrage, ein Umlauf),
 *   - wenn der Browser-Tab wieder sichtbar wird,
 *   - auf Zuruf, nachdem jemand einen Posten erledigt hat.
 *
 * WAS DAS NICHT IST: eine Live-Anzeige. Entscheidet die Kollegin am anderen
 * Schreibtisch einen Antrag, sieht man es hier erst beim nächsten
 * Seitenwechsel — und nicht in derselben Sekunde. Das ist bewusst so: drei
 * weitere Abonnements über den WebSocket kosten dauerhaft Verbindung und
 * Aufmerksamkeit für eine Zahl, die niemand sekundengenau braucht. Die Lücke
 * steht hier, damit sie niemand für einen Fehler hält.
 */
import { useEffect, useState } from 'react';
import { ladeOffenePosten, type OffenePosten } from '@/lib/db/offenePosten';
import { todayStr } from '@/lib/time';

/** Welche Zahl an welchem Menüpunkt hängt. */
export type PostenArt = keyof OffenePosten;

type Horcher = (posten: OffenePosten | undefined) => void;

let stand: OffenePosten | undefined;
const horcher = new Set<Horcher>();

/**
 * Wie oft schon geladen wurde.
 *
 * GEGEN DIE ÜBERHOLENDE ANTWORT. Wer einen Antrag entscheidet, stösst sofort
 * neu an, während der Lauf vom Seitenwechsel noch unterwegs ist. Träfe der
 * ältere zuletzt ein, stünde die alte Zahl wieder da — und zwar dauerhaft,
 * bis zum nächsten Anstoss. Nur die Antwort auf den jüngsten Lauf zählt.
 */
let lauf = 0;

export function offenePosten(): OffenePosten | undefined {
  return stand;
}

/** Zusehen, wie sich die Zahlen ändern. Gibt das Abmelden zurück. */
export function abonnierePosten(h: Horcher): () => void {
  horcher.add(h);
  return () => { horcher.delete(h); };
}

/**
 * Die Zahlen neu holen.
 *
 * Wirft nicht: ein fehlgeschlagener Abruf liefert `undefined` („nicht
 * bekannt"), und die Navigation zeigt dann kein Abzeichen. Eine Hülle, die an
 * einer Nebenzahl scheitert, nähme den Zugang zu allem anderen mit.
 */
export async function postenNeuLaden(): Promise<void> {
  const meiner = ++lauf;
  const neu = await ladeOffenePosten(todayStr());
  if (meiner !== lauf) return;
  stand = neu;
  for (const h of horcher) h(stand);
}

/**
 * Nur für Prüfungen: alles zurück auf Anfang.
 *
 * Der Zustand lebt im Modul und damit über eine einzelne Prüfung hinaus.
 * Ohne diese Zeile entschiede die Reihenfolge der Prüfungen über ihr
 * Ergebnis.
 */
export function postenZuruecksetzen(): void {
  stand = undefined;
  lauf = 0;
  horcher.clear();
}

/** Die Zahlen für die Navigation — `undefined` heisst „nicht bekannt". */
export function useOffenePosten(): OffenePosten | undefined {
  const [posten, setPosten] = useState(stand);
  useEffect(() => {
    /*
      DER ZUSTAND KANN SICH ZWISCHEN ERSTEM ZEICHNEN UND DIESEM EFFEKT
      GEÄNDERT HABEN — dieselbe Falle wie im Verbindungsband. Ohne diese
      Zeile bliebe die Anzeige in genau dem Fall leer, in dem sie gebraucht
      wird.
    */
    setPosten(stand);
    return abonnierePosten(setPosten);
  }, []);
  return posten;
}
