import type { Fahrzeug, Lagerort } from '@/types';

/**
 * Lagerorte in der Oberfläche (M04a, E10) — ohne Datenbank, damit sich die
 * Regeln für Anzeige, Reihenfolge und Wahl ohne Ansicht prüfen lassen.
 *
 * DAS HAUPTLAGER IST IN JEDER WAHL DER LEERE WERT (`''`). Die Datenbank
 * versteht „leer“ und die Kennung des Hauptlagers gleich; die Ansicht sendet
 * beim Hauptlager gar keinen Ort — so läuft jeder Weg ohne Ort genau so wie
 * vor den Lagerorten, auch in der Ansicht.
 */
export const HAUPTLAGER = '';

/** Wie das Hauptlager heißt, wenn der Betrieb (noch) keine eigene Bezeichnung hat. */
export const HAUPTLAGER_NAME = 'Hauptlager';

/** Wie ein Ort in Listen und Meldungen heißt. */
export function ortName(o: Pick<Lagerort, 'art' | 'bezeichnung'> | null | undefined): string {
  if (!o) return HAUPTLAGER_NAME;
  return o.art === 'fahrzeug' ? `Fahrzeug ${o.bezeichnung}` : o.bezeichnung;
}

/** Der Name zu einer Wahl (`''` = Hauptlager). */
export function ortNameVon(orte: readonly Lagerort[], wahl: string | null | undefined): string {
  if (!wahl) return ortName(orte.find((o) => o.art === 'haupt'));
  const o = orte.find((x) => x.id === wahl);
  return o ? ortName(o) : 'unbekannter Ort';
}

const RANG: Record<Lagerort['art'], number> = { haupt: 0, lager: 1, fahrzeug: 2 };

/** Hauptlager zuerst, dann die weiteren Lager, dann die Fahrzeuge — je nach Name. */
export function ortReihenfolge<T extends Lagerort>(orte: readonly T[]): T[] {
  return [...orte].sort(
    (a, b) => RANG[a.art] - RANG[b.art] || a.bezeichnung.localeCompare(b.bezeichnung, 'de'),
  );
}

/** Die weiteren Orte, die sich wählen lassen: aktiv, ohne das Hauptlager. */
export function weitereOrte<T extends Lagerort>(orte: readonly T[], art?: 'lager' | 'fahrzeug'): T[] {
  return ortReihenfolge(orte.filter((o) => o.aktiv && o.art !== 'haupt' && (!art || o.art === art)));
}

/** Die Fahrzeuglager der Fahrzeuge, deren Standardfahrer diese Person ist. */
export function eigeneFahrzeugOrte<T extends Lagerort>(
  orte: readonly T[],
  fahrzeuge: readonly Fahrzeug[],
  uid: string,
): T[] {
  const meine = new Set(fahrzeuge.filter((f) => f.aktiv && f.standardfahrerUid === uid).map((f) => f.id));
  return weitereOrte(orte, 'fahrzeug').filter((o) => !!o.fahrzeugId && meine.has(o.fahrzeugId));
}

/**
 * Aus welchen Fahrzeugen beim Abhaken gebucht werden darf — dieselbe Regel
 * wie in `laden_umschalten`: ein Fahrzeug, das ein Eingeteilter oder man
 * selbst fährt, oder ein Poolfahrzeug ohne Standardfahrer; die Leitung aus
 * jedem. Vorgeschlagen wird das eigene Standardfahrzeug, sonst das Hauptlager.
 */
export function abhakOrte(
  orte: readonly Lagerort[],
  fahrzeuge: readonly Fahrzeug[],
  uid: string,
  eingeteilt: readonly string[],
  fuehrung: boolean,
): { orte: Lagerort[]; vorschlag: string } {
  const fahrer = new Map(fahrzeuge.map((f) => [f.id, f.standardfahrerUid ?? null]));
  const erlaubt = weitereOrte(orte, 'fahrzeug').filter((o) => {
    if (fuehrung) return true;
    const wer = o.fahrzeugId ? fahrer.get(o.fahrzeugId) : undefined;
    return wer === null || wer === uid || (!!wer && eingeteilt.includes(wer));
  });
  const eigenes = eigeneFahrzeugOrte(erlaubt, fahrzeuge, uid)[0];
  return { orte: erlaubt, vorschlag: eigenes?.id ?? HAUPTLAGER };
}

/** Ein Fahrzeug, wie es in Listen steht: Kennzeichen, dahinter die Bezeichnung. */
export function fahrzeugText(f: Pick<Fahrzeug, 'kennzeichen' | 'bezeichnung'>): string {
  return f.bezeichnung ? `${f.kennzeichen} · ${f.bezeichnung}` : f.kennzeichen;
}
