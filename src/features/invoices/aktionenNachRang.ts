import type { RechnungAktion } from './RechnungDetail';

/**
 * DIE HANDLUNGEN EINER RECHNUNG NACH RANG (U4): eine Hauptaktion, höchstens
 * eine zweite, der Rest ins ⋯.
 *
 * - Hauptaktion ist, was als `haupt` markiert ist (Zahlung erfassen, wo Geld
 *   fällig ist oder zurückgeht).
 * - Zweitaktion ist das PDF („PDF laden“) — der häufigste Griff an jeder
 *   Rechnung, auch beim reinen Lesen; fehlt es, die erste übrige Handlung,
 *   die nicht unumkehrbar ist.
 * - Unumkehrbares (`danger`, der Storno) steht immer im ⋯, nie als Knopf.
 */
export function aktionenNachRang(aktionen: RechnungAktion[]): {
  haupt: RechnungAktion | null;
  zweit: RechnungAktion | null;
  weitere: { label: string; onSelect: () => void; danger?: boolean }[];
} {
  const haupt = aktionen.find((a) => a.haupt && !a.danger) ?? null;
  const rest = aktionen.filter((a) => a !== haupt);
  const zweit = rest.find((a) => a.label === 'PDF laden') ?? rest.find((a) => !a.danger) ?? null;
  const weitere = rest.filter((a) => a !== zweit).map((a) => ({ label: a.label, onSelect: a.onSelect, ...(a.danger ? { danger: true } : {}) }));
  return { haupt, zweit, weitere };
}
