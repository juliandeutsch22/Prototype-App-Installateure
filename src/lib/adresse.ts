/**
 * Adressen mit Straße, PLZ, Ort und Land (Testbericht 30.09.2026, M12).
 *
 * Die eine Zeile („Gartengasse 12, 2700 Wiener Neustadt“) setzt die
 * Datenbank aus den Teilen zusammen (`app.adresse_zeile`); diese Funktion
 * rechnet dasselbe im Browser, damit die Maske schon vor dem Speichern zeigt,
 * was auf dem Beleg stehen wird.
 */
export interface Adressteile {
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  /** ISO-Code, ohne Angabe „AT“. */
  land?: string | null;
}

/** Die Länder zur Auswahl — Österreich zuerst, dann die Nachbarn. */
export const LAENDER: { code: string; name: string }[] = [
  { code: 'AT', name: 'Österreich' },
  { code: 'DE', name: 'Deutschland' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'IT', name: 'Italien' },
  { code: 'SI', name: 'Slowenien' },
  { code: 'HU', name: 'Ungarn' },
  { code: 'CZ', name: 'Tschechien' },
  { code: 'SK', name: 'Slowakei' },
  { code: 'LI', name: 'Liechtenstein' },
];

/** Der Name des Landes in der Zeile — Österreich steht nicht da. */
export function landName(code?: string | null): string | null {
  const c = (code ?? 'AT').trim().toUpperCase() || 'AT';
  if (c === 'AT') return null;
  return LAENDER.find((l) => l.code === c)?.name ?? c;
}

/** Wie `app.adresse_zeile`: „Straße, PLZ Ort[, Land]“ — leer wird `''`. */
export function adresseZeile(a: Adressteile): string {
  const strasse = a.strasse?.trim() ?? '';
  const plzOrt = [a.plz?.trim(), a.ort?.trim()].filter(Boolean).join(' ');
  return [strasse, plzOrt, landName(a.land)].filter(Boolean).join(', ');
}

/**
 * Wie die PLZ im Land aussieht — eine grobe Prüfung gegen Vertipper, keine
 * Zustellprüfung. Österreich, Schweiz und Liechtenstein vierstellig,
 * Deutschland fünfstellig; sonst 3 bis 10 Zeichen.
 */
export function plzFehler(plz: string | null | undefined, land: string | null | undefined): string | null {
  const p = (plz ?? '').trim();
  if (!p) return null;
  const c = (land ?? 'AT').toUpperCase();
  if (['AT', 'CH', 'LI', 'HU', 'SI'].includes(c) && !/^\d{4}$/.test(p)) return 'Die PLZ hat in diesem Land vier Ziffern.';
  if (c === 'DE' && !/^\d{5}$/.test(p)) return 'Die PLZ hat in Deutschland fünf Ziffern.';
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(p)) return 'Diese PLZ sieht nicht richtig aus.';
  return null;
}
