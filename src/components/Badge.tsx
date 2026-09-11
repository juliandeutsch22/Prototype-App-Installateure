import type { ReactNode } from 'react';
import type { Role } from '@/types';

export type Tone = 'gray' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'violet' | 'dark';

const tones: Record<Tone, string> = {
  gray: 'bg-surface-2 text-ink-muted',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  brand: 'bg-brand text-brand-fg',
  // Zwei Töne ohne eigene Rolle im Token-Satz: sie kennzeichnen
  // ausschliesslich die beiden obersten Rollen und müssen sich dafür von
  // Türkis, Grün, Gelb und Rot unterscheiden. Der violette Ton ist ins Kühle
  // gerückt, damit er neben dem neuen Türkis nicht fremd wirkt (10,2:1).
  violet: 'bg-[#e8e6fb] text-[#332a6b]',
  dark: 'bg-ink-deep text-white',
};

/**
 * Pillen-Badge wie im Prototyp: stark gerundet, klein und fett — dadurch
 * lesbar auch neben viel Text, ohne wie ein Button zu wirken.
 */
export default function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`tnum inline-block whitespace-nowrap rounded-pill px-3 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Jede Rolle hat im Prototyp ihre eigene Farbe — Administrator schwarz. */
const roleTone: Record<Role, Tone> = {
  Mitarbeiter: 'info',
  Verwaltung: 'success',
  Buchhaltung: 'warning',
  Projektleiter: 'brand',
  Geschäftsführung: 'violet',
  Administrator: 'dark',
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={roleTone[role]}>{role}</Badge>;
}
