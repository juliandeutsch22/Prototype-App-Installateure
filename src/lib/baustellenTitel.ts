/**
 * Der Titel einer Baustelle (Testbericht 30.09.2026, G4): die Bezeichnung,
 * wenn es eine gibt, vor dem Kunden — sonst der Kunde allein, wie bisher.
 */
export function baustellenTitel(p: { customerName?: string | null; bezeichnung?: string | null }): string {
  const kunde = p.customerName?.trim() ?? '';
  const name = p.bezeichnung?.trim() ?? '';
  if (!name) return kunde;
  return kunde ? `${name} · ${kunde}` : name;
}
