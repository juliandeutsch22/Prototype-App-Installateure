/** Expliziter Ansichtswechsel innerhalb eines Bereichs, kein neuer Fachdatensatz. */
export const ANSICHTSWECHSEL = { lotPosition: 'halten' } as const;

export function positionHalten(state: unknown): boolean {
  return typeof state === 'object' && state !== null
    && 'lotPosition' in state && state.lotPosition === 'halten';
}
