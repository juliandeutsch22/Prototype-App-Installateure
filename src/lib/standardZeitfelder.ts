/** Feste Spalten behalten ihren Typ und ihre Bedeutung für Budget und Abrechnung. */
export const STANDARD_ZEITFELDER = [
  { id: 'projectNumber', name: 'Baustelle', grund: 'Die Zuordnung steuert Baustellenbudget und Rechnungsvorschlag.' },
  { id: 'travelTime', name: 'Wegzeit', grund: 'Zusätzliche Minuten, getrennt von der Arbeitszeit.' },
  { id: 'vehiclePlate', name: 'Fahrzeug', grund: 'Kennzeichen des verwendeten Fahrzeugs.' },
  { id: 'helperName', name: 'Helfername', grund: 'Name einer begleitenden Person.' },
  { id: 'isHelper', name: 'Einsatz als Helfer', grund: 'Steuert Stundensatz und Budgetzuordnung.' },
  { id: 'isEmergency', name: 'Notdienst', grund: 'Kennzeichnet einen verrechenbaren Notdiensteinsatz.' },
  { id: 'comment', name: 'Kommentar / Tätigkeiten', grund: 'Wird bei aktivem Handwerksschein als Tätigkeit vorgeschlagen.' },
] as const;
export type StandardZeitfeldId = typeof STANDARD_ZEITFELDER[number]['id'];
export type StandardZeitfelder = Partial<Record<StandardZeitfeldId, boolean>>;
export function standardZeitfeldAktiv(felder: StandardZeitfelder | undefined, id: StandardZeitfeldId): boolean {
  return felder?.[id] !== false;
}
/** Ausblenden ist kein Löschauftrag: vorhandene Angaben bleiben beim Speichern erhalten. */
export function standardZeitwerteErhalten<T extends Record<string, unknown>>(neu: T, alt: Record<string, unknown> | undefined, felder: StandardZeitfelder | undefined): T {
  const werte = { ...neu } as Record<string, unknown>;
  for (const { id } of STANDARD_ZEITFELDER) {
    if (!(id in neu)) continue;
    if (id !== 'comment' && alt?.status && neu.status && alt.status !== neu.status) continue;
    if (standardZeitfeldAktiv(felder, id) && !(!standardZeitfeldAktiv(felder, 'projectNumber') && (id === 'isHelper' || id === 'isEmergency'))) continue;
    werte[id] = alt?.[id] ?? (id === 'travelTime' ? 0 : id === 'isHelper' || id === 'isEmergency' ? false : '');
    if (id === 'projectNumber') werte.customerName = alt?.customerName ?? '';
  }
  return werte as T;
}
