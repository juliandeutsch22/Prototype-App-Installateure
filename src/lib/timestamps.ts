/**
 * Zeitstempel in Millisekunden.
 *
 * WARUM DAS NICHT EINFACH EINE ZAHL IST. Firestore schrieb mit
 * `serverTimestamp()` keinen Zahlenwert, sondern ein Objekt mit `toMillis()`.
 * Postgres liefert einen Zeitstempel als Text, den `pg/felder.ts` in eine
 * Zahl übersetzt — aber Altbestände aus der Firestore-Zeit tragen die alte
 * Form noch. Die Typen der App deklarieren `createdAt?: number`; das ist eine
 * Vereinfachung, die zur
 * Laufzeit nicht stimmt.
 *
 * Der Schaden war unsichtbar und deshalb hartnäckig: `(b.createdAt ?? 0) -
 * (a.createdAt ?? 0)` ergibt mit zwei Timestamp-Objekten NaN. Ein Vergleich,
 * der NaN liefert, sortiert nicht falsch herum — er sortiert gar nicht, und
 * die Reihenfolge bleibt die zufällige aus der Datenbank. „Neueste zuerst"
 * stimmte damit nur, solange die Datenbank ohnehin so lieferte.
 */
export function toMillis(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    // Rohform aus der REST-Schnittstelle oder einem Export.
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return 0;
}

/** Neueste zuerst — als Vergleichsfunktion für `sort`. */
export function byNewest(a: { createdAt?: unknown }, b: { createdAt?: unknown }): number {
  return toMillis(b.createdAt) - toMillis(a.createdAt);
}

/** 'YYYY-MM-DD' eines Zeitstempels, in lokaler Zeit. */
export function dayKey(v: unknown): string {
  const ms = toMillis(v);
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'Mo., 31.08.2026' — Überschrift einer Tagesgruppe. */
export function dayHeading(iso: string): string {
  if (!iso) return 'Ohne Datum';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
