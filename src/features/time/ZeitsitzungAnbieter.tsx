import type { ReactNode } from 'react';
import { useModul } from '@/lib/useModule';
import { ZeitsitzungKontext, useZeitsitzungStand } from './zeitsitzungStand';

/**
 * Lädt den Timer einmal für die ganze App (im Layout). Ohne das Modul
 * Zeiterfassung lädt er nichts — dann gibt es weder Karte noch Leiste.
 */
export default function ZeitsitzungAnbieter({ children }: { children: ReactNode }) {
  const zeitAn = useModul('zeiterfassung');
  const stand = useZeitsitzungStand(zeitAn);
  return <ZeitsitzungKontext.Provider value={zeitAn ? stand : null}>{children}</ZeitsitzungKontext.Provider>;
}
