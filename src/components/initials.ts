/**
 * Initialen aus einem Namen: "Max Mustermann" -> "MM", "Petra" -> "PE".
 * Steht bewusst hier und nicht in Avatar.tsx: eine Datei, die neben der
 * Komponente auch eine Funktion exportiert, bricht Fast Refresh im Dev-Server
 * — und der Lint-Lauf der CI lässt keine Warnung durch.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
