/*
  DER MASSSTAB DER SALDOLINIE (Planlinie B2a): fest je Ansicht, damit zwei
  Zeilen vergleichbar sind, und genannt, damit die Strecke eine Zahl hat. Er
  ist die kleinste dieser Stufen, in die der größte Saldo der Liste passt —
  runde Werte, die man im Kopf teilen kann. Was über 800 Std. hinausgeht,
  endet am Rand; die Zahl daneben steht trotzdem.
*/
const MASSSTAB_STUNDEN = [8, 16, 40, 80, 160, 240, 400, 800] as const;

/** Halbe Breite der Saldolinie in Stunden, für die gezeigten Salden (in Minuten). */
export function saldoMassstab(minuten: Array<number | null | undefined>): number {
  const groesster = Math.max(0, ...minuten.map((m) => Math.abs(m ?? 0)));
  return MASSSTAB_STUNDEN.find((h) => h * 60 >= groesster) ?? MASSSTAB_STUNDEN[MASSSTAB_STUNDEN.length - 1];
}
