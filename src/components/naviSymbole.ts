/*
  DIE MENÜ-SYMBOLE (B9, überarbeitet am 09.11.2026, E72). Je Ziel der
  Navigation, nicht je Symbolname: „Meine Baustellen“ und „Baustellen“ sind
  dasselbe Symbol, „Urlaub“ und „Sonderurlaub“ derselbe Kalender.

  EIN RAHMEN FÜR ALLE. Jedes Symbol füllt das Feld 2,5–13,5 einer 16er-Fläche
  und steht in dessen Mitte; dazu dieselbe Strichstärke. Vorher ragten einzelne
  hinaus oder saßen höher oder tiefer (Einstellungen, Nachkalkulation, Wartung,
  Mitarbeiterübersicht), und die Leiste wirkte, als wären die Symbole
  verschieden groß. `naviSymbole.test.ts` hält den Rahmen fest.

  UNVERWECHSELBAR. Die Baustelle trägt den Kran: das Haus daneben gehört dem
  Kunden, zwei Häuser untereinander las niemand auseinander. Die
  Mitarbeiterübersicht zeigt zwei Personen (das Team), die
  Benutzerverwaltung die eine Person (das Konto). Einstellungen sind Regler.
  Der Start trägt den Grundriss; das Lot fährt selbst durch die Leiste (E39).
  Die großen Skizzen im Seitenkopf bleiben, wie sie sind: dort ist Platz für
  das Haus mit der Achse.
*/
export const SYMBOLE: Record<string, string> = {
  '/': 'M2.5 2.5 H13.5 V13.5 H2.5 Z M2.5 8.5 H6.5 M9 8.5 H13.5 M8 2.5 V5.5',
  '/admin-projects': 'M4.5 13.5 V2.5 M2.5 13.5 H7.5 M2.5 3.5 H13.5 M4.5 6 L7 3.5 M11.5 3.5 V8 M10 8 H13 V10.5 H10 Z',
  '/my-projects': 'M4.5 13.5 V2.5 M2.5 13.5 H7.5 M2.5 3.5 H13.5 M4.5 6 L7 3.5 M11.5 3.5 V8 M10 8 H13 V10.5 H10 Z',
  '/assignments': 'M2.5 3.5 H13.5 V13 H2.5 Z M2.5 6.5 H13.5 M6.2 6.5 V13 M9.8 6.5 V13',
  '/my-schedule': 'M2.5 3.5 H13.5 V13 H2.5 Z M2.5 6.5 H13.5 M6.2 6.5 V13 M9.8 6.5 V13',
  '/worksheets': 'M4 2.5 H10 L12.5 5 V13.5 H4 Z M6 10 C7 8.4 8 11.2 9 9.8 S10.6 9.2 11 10.2',
  '/quotes': 'M3.5 4.5 H10.5 V13.5 H3.5 Z M5.5 2.5 H12.5 V11.5',
  // Das Ablagefach des Auftragseingangs (M02b) — was hereinkommt, bevor es Baustelle oder Angebot wird.
  '/eingaenge': 'M2.5 9 H5.5 L6.5 10.8 H9.5 L10.5 9 H13.5 M2.5 9 L4 3.5 H12 L13.5 9 V13.5 H2.5 Z',
  '/customers': 'M3 13.5 V7.5 L8 3.5 L13 7.5 V13.5 Z M7 13.5 V10 H9 V13.5',
  // Das Haus mit Stockwerken (M02c): die Liegenschaft — mehrere Wohnungen, nicht der eine Kunde.
  '/liegenschaften': 'M3.5 13.5 V3 H10.5 V13.5 M10.5 7 H13 V13.5 M2.5 13.5 H13.5 M5.5 5.5 H6.5 M7.5 5.5 H8.5 M5.5 8 H6.5 M7.5 8 H8.5 M5.5 10.5 H6.5 M7.5 10.5 H8.5',
  '/wartungen': 'M4.5 3.5 Q4.5 2.5 5.5 2.5 H10.5 Q11.5 2.5 11.5 3.5 V10.5 H4.5 Z M8 4.9 A1.6 1.6 0 1 1 7.99 4.9 M6.5 10.5 V13.5 M9.5 10.5 V13.5',
  '/invoices': 'M4 2.5 H12 V13.5 L10.7 12.6 L9.3 13.5 L8 12.6 L6.7 13.5 L5.3 12.6 L4 13.5 Z M6 5.5 H10 M6 8 H10',
  '/costing': 'M8 3 V13 M5.5 13.5 H10.5 M3.5 5 H12.5 M3.5 5 L2.5 8.5 H4.5 Z M12.5 5 L11.5 8.5 H13.5 Z',
  '/time': 'M8 2.5 A5.5 5.5 0 1 1 7.99 2.5 M8 5 V8 L10 9.5',
  '/vacations': 'M2.5 4 H13.5 V13.5 H2.5 Z M2.5 6.8 H13.5 M5.5 2.5 V5 M10.5 2.5 V5 M5.5 10.2 L7.2 11.8 L10.5 8.6',
  '/sonderurlaub': 'M2.5 4 H13.5 V13.5 H2.5 Z M2.5 6.8 H13.5 M5.5 2.5 V5 M10.5 2.5 V5 M5.5 10.2 L7.2 11.8 L10.5 8.6',
  '/accounting': 'M6.5 4 A2 2 0 1 1 6.49 4 M2.5 13.5 C2.5 10.8 4.3 9.5 6.5 9.5 S10.5 10.8 10.5 13.5 M11 2.9 A1.6 1.6 0 1 1 10.99 2.9 M10.6 7.6 C12.3 7.6 13.5 8.6 13.5 11',
  '/nachrichten': 'M2.5 3 H13.5 V10.5 H7 L4.5 13 V10.5 H2.5 Z M5 6 H11 M5 8 H9',
  '/user-mgmt': 'M8 3 A2.6 2.6 0 1 1 7.99 3 M3.2 13.5 C3.2 10.6 5.3 9.2 8 9.2 S12.8 10.6 12.8 13.5',
  '/material': 'M3 13.5 V9.5 Q3 5.5 7 5.5 H13 M11 3.5 L13 5.5 L11 7.5',
  '/anforderungen': 'M2.8 4.6 L3.8 5.6 L5.6 3.6 M7.8 4.6 H13.2 M2.8 9 L3.8 10 L5.6 8 M7.8 9 H13.2 M7.8 13 H13.2',
  '/lager': 'M3 2.5 V13.5 M13 2.5 V13.5 M3 7 H13 M3 11.5 H13 M5 7 V4.6 H8 V7 M9 11.5 V9.4 H11.5 V11.5',
  '/settings': 'M2.5 4.5 H8.5 M11.5 4.5 H13.5 M10 3 A1.5 1.5 0 1 1 9.99 3 M2.5 8 H4 M7 8 H13.5 M5.5 6.5 A1.5 1.5 0 1 1 5.49 6.5 M2.5 11.5 H8.5 M11.5 11.5 H13.5 M10 10 A1.5 1.5 0 1 1 9.99 10',
};
