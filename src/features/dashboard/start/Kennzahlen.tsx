import type { ReactNode } from 'react';
import Metric, { MetricRow } from '@/components/Metric';

export interface Kennzahl {
  key: string;
  label: string;
  wert: ReactNode;
  zusatz?: string;
  to: string;
  ton?: 'danger';
  /**
   * Nichts zu tun: keine offene Rechnung, kein unverrechneter Schein, keine
   * Anforderung. Solche Zahlen fallen aus der Zeile — „Überfällig € 0,00“ sagt
   * nichts, was das Fehlen der Angabe nicht auch sagt. Zustände wie Resturlaub,
   * Saldo oder aktive Baustellen tragen das Feld nie: dort ist auch die Null
   * eine Auskunft.
   */
  leer?: boolean;
}

/**
 * DER STAND IN EINER ZEILE (Entscheidung E22, 25.10.2026).
 *
 * Bis hierher standen bis zu vier große Kacheln über „Zu erledigen“. Sie
 * sahen in keiner Rolle und keiner Breite gut aus: oft „€ 0,00“ in großer
 * Schrift, bei einer einzelnen Zahl eine verlorene Kachel, und was dringend
 * war, stand darunter ohnehin noch einmal als Aufgabe. Die Startseite ist
 * zum Handeln da; der Stand ist der Blick nebenbei.
 *
 * Gezeichnet wird mit demselben Baustein wie auf allen anderen Seiten
 * (`MetricRow`, E23); hier kommt nur dazu, dass leere Zahlen ausfallen.
 * Gerechnet wird nach wie vor in `aufbau.ts`.
 */
export default function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte.filter((k) => !k.leer).slice(0, 4);
  if (liste.length === 0) return null;
  return (
    <MetricRow label="Stand">
      {liste.map((k) => (
        <Metric key={k.key} label={k.label} value={k.wert} hint={k.zusatz} to={k.to} tone={k.ton} />
      ))}
    </MetricRow>
  );
}
