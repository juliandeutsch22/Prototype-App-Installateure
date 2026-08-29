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
  violet: 'bg-[#ede9fe] text-[#3b0764]',
  dark: 'bg-[#111827] text-[#f9fafb]',
};

/**
 * Pillen-Badge wie im Prototyp: stark gerundet, klein und fett — dadurch
 * lesbar auch neben viel Text, ohne wie ein Button zu wirken.
 */
export default function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-pill px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}
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
  Geschäftsführung: 'violet',
  Administrator: 'dark',
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={roleTone[role]}>{role}</Badge>;
}
