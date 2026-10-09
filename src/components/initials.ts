/**
 * Initialen aus einem Namen: "Max Mustermann" -> "MM", "Petra" -> "PE".
 * Steht bewusst hier und nicht in Avatar.tsx: eine Datei, die neben der
 * Komponente auch eine Funktion exportiert, bricht Fast Refresh im Dev-Server
 * — und der Lint-Lauf der CI lässt keine Warnung durch.
 */
export function initialsOf(name: string): string {
  // Ein Zusatz in Klammern ist kein Name: „Test Lehrling (Claude)“ → „TL“, nicht „T(“ (Runde 5, G2).
  const parts = name.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const letztes = [...parts.slice(1)].reverse().find((w) => /^\p{L}/u.test(w)) ?? parts[parts.length - 1];
  return (parts[0][0] + letztes[0]).toUpperCase();
}
