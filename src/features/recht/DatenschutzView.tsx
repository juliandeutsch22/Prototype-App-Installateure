import RechtSeite from './RechtSeite';

/**
 * Datenschutzerklärung der App.
 *
 * WAS DARIN STEHT, WAR AUS DEM CODE ABGELESEN, nicht aus einer Vorlage: welche
 * Daten die App tatsächlich führt, wo sie liegen, wer sie sieht und wann sie
 * verschwinden. Seit 04.11.2026 pflegt der Betreiber den Text in der
 * Plattform (Rechtstexte); Fassung 1 ist der Text, der bis dahin hier stand.
 * Wer die App ändert, prüft, ob die Erklärung noch stimmt — sie steht jetzt
 * nicht mehr neben dem Code, der sie wahr macht.
 *
 * GEDUZT, WIE DIE GANZE APP (offene Punkte A8, entschieden 29.09.2026).
 */
export default function DatenschutzView() {
  return <RechtSeite titel="Datenschutzerklärung" art="datenschutz" />;
}
