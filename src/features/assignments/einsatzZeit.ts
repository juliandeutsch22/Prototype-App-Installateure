/**
 * Die Uhrzeit eines Einsatzes als Text (Testbericht 30.09.2026, M34):
 * „07:30–12:00“, „ab 07:30“, „bis 12:00“ — oder `null`, dann gilt der
 * ganze Tag und es steht nichts da.
 */
export function einsatzZeit(a: { zeitVon?: string | null; zeitBis?: string | null }): string | null {
  const von = a.zeitVon?.slice(0, 5) || '';
  const bis = a.zeitBis?.slice(0, 5) || '';
  if (von && bis) return `${von}–${bis}`;
  if (von) return `ab ${von}`;
  if (bis) return `bis ${bis}`;
  return null;
}
