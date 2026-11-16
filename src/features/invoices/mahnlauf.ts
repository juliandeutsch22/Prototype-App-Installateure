/**
 * Der Mahnlauf: welche Rechnungen jetzt eine Mahnung brauchen, in welcher
 * Stufe und mit welchen Kosten. Die Regel steht seit der Durchsicht vom
 * 15.11.2026 in `shared/forderungen.ts` — dieselbe Fassung rechnet die Edge
 * Function der Startseite (`startseite-forderungen`). Hier nur weitergereicht,
 * mit dem Kopf der App als Vorgabe.
 */
import type { RechnungsKopf } from '@/types';
import type { Mahnlauf as MahnlaufAllgemein, MahnZeile as MahnZeileAllgemein } from '@shared/forderungen';

export { mahnlauf } from '@shared/forderungen';
export type MahnZeile<R extends RechnungsKopf = RechnungsKopf> = MahnZeileAllgemein<R>;
export type Mahnlauf<R extends RechnungsKopf = RechnungsKopf> = MahnlaufAllgemein<R>;
