/**
 * Welche Rolle die App anzeigt (Testbericht 30.09.2026, G21).
 *
 * Im Supportzugang setzt die App das Profil als „Administrator“ zusammen,
 * damit die Navigation zeigt, was ein Administrator sieht (siehe
 * `AuthContext`). Angezeigt wurde dann auch „Rolle: Administrator“ — für
 * jemanden, der nur lesen darf. Gezeigt wird deshalb, was es ist.
 */
export function rolleAnzeige(
  rolle: string,
  einblick: { stufe?: string | null } | null | undefined,
): string {
  if (!einblick) return rolle;
  return einblick.stufe === 'mitarbeiten' ? 'Support (mitarbeiten)' : 'Support (lesend)';
}
