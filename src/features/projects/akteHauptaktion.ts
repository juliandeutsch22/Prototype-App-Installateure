/**
 * DIE HAUPTAKTION DER BAUSTELLENAKTE FOLGT DEM STAND (B5, E83, 12.11.2026).
 *
 * Eine frisch angelegte Baustelle zeigte „Schein schreiben“ — dabei war dort
 * noch niemand, und der nächste Schritt ist, jemanden einzuteilen. Liegen
 * unterschriebene Scheine, die keine Rechnung trägt, ist der nächste Schritt
 * die Rechnung. Sonst bleibt es, wie es war.
 *
 * Reihenfolge wie im Plan: erst planen, dann abrechnen. Angeboten wird nur,
 * was die Rolle darf; was nicht geladen ist, zählt nicht als „keiner“ — eine
 * Akte, deren Einsätze nicht kamen, ruft nicht „Einsatz planen“.
 */
export type AkteHauptaktion = 'planen' | 'rechnung' | 'schein' | null;

export function akteHauptaktion(q: {
  /** Planung an und die Rolle darf in die Einsatzplanung. */
  darfPlanen: boolean;
  /** Die Rolle darf Rechnungen stellen. */
  darfRechnen: boolean;
  /** Scheine an und die Rolle darf sie schreiben. */
  darfSchein: boolean;
  /** Gibt es einen Einsatz (vorher oder kommend)? `null`: nicht bekannt. */
  hatEinsatz: boolean | null;
  /** Unterschriebene Scheine ohne Rechnung; `null`: nicht bekannt. */
  offeneScheine: number | null;
  /** Abgeschlossen wird nicht mehr geplant. */
  abgeschlossen: boolean;
}): AkteHauptaktion {
  if (q.darfPlanen && !q.abgeschlossen && q.hatEinsatz === false) return 'planen';
  if (q.darfRechnen && (q.offeneScheine ?? 0) > 0) return 'rechnung';
  return q.darfSchein ? 'schein' : null;
}
