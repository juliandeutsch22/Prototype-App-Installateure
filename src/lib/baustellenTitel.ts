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

/**
 * EINE BAUSTELLE IN EINER AUSWAHL (C3, E91). Zwei Baustellen desselben
 * Kunden unterschied bisher nur die Nummer — „Familie Huber (B-0147)“ und
 * „Familie Huber (B-0152)“. Die Kurzbezeichnung („Bad“, „Heizung“) steht
 * jetzt dabei. Der Kunde bleibt vorn: die Auswahl ist nach ihm sortiert, und
 * seine Baustellen stehen so beisammen.
 *
 * Ein natives Auswahlfeld kennt keine zweite Zeile; die Bezeichnung steht
 * deshalb in derselben, und was das Feld abschneidet, zeigt die Zeile
 * darunter ganz (`auswahl-ganz`).
 */
export function baustelleInAuswahl(
  p: { projectNumber: string; customerName?: string | null; bezeichnung?: string | null },
  nummerVorn = false,
): string {
  const teile = [p.customerName?.trim(), p.bezeichnung?.trim()].filter((t): t is string => !!t);
  if (nummerVorn) return [p.projectNumber, ...teile].join(' · ');
  return teile.length ? `${teile.join(' · ')} (${p.projectNumber})` : p.projectNumber;
}
