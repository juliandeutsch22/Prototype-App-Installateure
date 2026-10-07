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

/*
 * WIE BREIT DIE LEISTE IST, hängt an der Zahl der Kennzahlen. Über die
 * ganze Breite gezogen, stünde eine einzelne Zahl als Balken da (U4) und
 * zwei Zahlen je über eine halbe Seite — weit weg von ihrer Beschriftung.
 * So steht jede Kennzahl in derselben Spaltenbreite wie bei vieren.
 */
const BREITE: Record<number, string> = {
  1: 'start-kennzahlen-eine',
  2: 'start-kennzahlen-zwei',
};

/**
 * HÖCHSTENS VIER KENNZAHLEN, JEDE EIN VERWEIS (Regel 4). Sie stehen als
 * Leiste über „Zu erledigen“ und „Heute“ (Linie „Lot“, Protokoll E1).
 */
export default function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte.slice(0, 4);
  if (liste.length === 0) return null;
  const leiste = (
    <div className="kennzahlen">
      {liste.map((k) => (
        <Metric key={k.key} label={k.label} value={k.wert} hint={k.zusatz} to={k.to} tone={k.ton ?? 'default'} />
      ))}
    </div>
  );
  const breite = BREITE[liste.length];
  return breite ? <div className={breite}>{leiste}</div> : leiste;
}
