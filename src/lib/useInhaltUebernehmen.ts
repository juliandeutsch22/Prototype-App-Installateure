import { useEffect, useRef } from 'react';

/**
 * Gespeicherte Werte in ein Formular übernehmen — nur, wenn sich ihr INHALT
 * geändert hat, nicht ihre Identität (Durchsicht 15.11.2026, P10; dasselbe
 * Muster wie P1 im Einsatzformular).
 *
 * WARUM. Nach jedem Speichern lädt eine Einstellungsseite den Betrieb neu
 * (`reloadCompany`), und das liefert immer ein neues Objekt. Jede Karte, die
 * ihre Felder per Effekt an `company` setzte, warf dabei ungespeicherte
 * Eingaben weg — auch wenn eine ganz andere Karte gespeichert hatte. Mit
 * dieser Übernahme setzt eine Karte ihre Felder nur, wenn sich IHRE Werte im
 * Betrieb geändert haben: beim Laden, nach dem eigenen Speichern (dann steht
 * ohnehin das Getippte da), oder wenn jemand anderes sie geändert hat.
 *
 * `werte` sind die gespeicherten Werte dieser Karte, so wie sie die Felder
 * füllen — verglichen wird ihre JSON-Form.
 */
export function useInhaltUebernehmen<T>(werte: T, uebernehmen: (w: T) => void): void {
  const schluessel = JSON.stringify(werte ?? null);
  const zuletzt = useRef<string | null>(null);
  const aktuell = useRef({ werte, uebernehmen });
  aktuell.current = { werte, uebernehmen };
  useEffect(() => {
    if (zuletzt.current === schluessel) return;
    zuletzt.current = schluessel;
    aktuell.current.uebernehmen(aktuell.current.werte);
  }, [schluessel]);
}
