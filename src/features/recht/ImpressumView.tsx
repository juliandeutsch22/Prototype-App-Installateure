import RechtSeite from './RechtSeite';

/**
 * Impressum nach § 5 ECG, § 14 UGB und § 25 MedienG — für die App Senklot.
 *
 * Es nennt den BETREIBER der Software, nicht den Installationsbetrieb, der sie
 * benutzt: der steht mit seinen Firmendaten auf seinen eigenen Belegen.
 *
 * Der Text steht seit 04.11.2026 in der Datenbank und wird in der Plattform
 * gepflegt (Rechtstexte); Fassung 1 ist der Text, der bis dahin hier stand.
 */
export default function ImpressumView() {
  return <RechtSeite titel="Impressum" art="impressum" />;
}
