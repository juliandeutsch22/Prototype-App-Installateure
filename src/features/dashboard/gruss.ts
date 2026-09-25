/**
 * Der Gruß nach der Tageszeit: bis 11 Uhr „Guten Morgen“, bis 17 Uhr „Guten
 * Tag“, danach „Guten Abend“. Die Grenzen sind die des Betriebs, nicht die
 * der Uhr — um 6:50 im Auto ist es Morgen, um 16:30 auf der Baustelle noch
 * Tag.
 */
export function gruss(jetzt: Date): string {
  const stunde = jetzt.getHours();
  if (stunde < 11) return 'Guten Morgen';
  if (stunde < 17) return 'Guten Tag';
  return 'Guten Abend';
}

/**
 * Der Vorname aus dem Anzeigenamen — das erste Wort. „Max Mustermann“ wird
 * „Max“; ein Name aus einem Wort bleibt, wie er ist. Ohne Namen kein
 * Komma und keine Lücke.
 */
export function vorname(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** „Guten Morgen, Max“ — oder nur „Guten Morgen“, wenn kein Name da ist. */
export function grussZeile(jetzt: Date, name?: string | null): string {
  const v = vorname(name);
  return v ? `${gruss(jetzt)}, ${v}` : gruss(jetzt);
}
