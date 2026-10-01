import type { ReactNode } from 'react';
import Metric from '@/components/Metric';

export interface Kennzahl {
  key: string;
  label: string;
  wert: ReactNode;
  zusatz?: string;
  to: string;
  ton?: 'danger';
}

/**
 * HÖCHSTENS VIER KENNZAHLEN, JEDE EIN VERWEIS (Regel 4). In der schmalen
 * rechten Spalte zwei je Reihe; allein über die ganze Breite nur, wenn die
 * Startseite sonst leer ist (U4: nicht eine einzelne Zahl als Balken).
 */
export default function Kennzahlen({ werte, raster = false }: { werte: Kennzahl[]; raster?: boolean }) {
  const liste = werte.slice(0, 4);
  if (liste.length === 0) return null;
  return (
    <div className={`kennzahlen ${raster ? 'kennzahlen-raster' : ''}`}>
      {liste.map((k) => (
        <Metric key={k.key} label={k.label} value={k.wert} hint={k.zusatz} to={k.to} tone={k.ton ?? 'default'} />
      ))}
    </div>
  );
}
