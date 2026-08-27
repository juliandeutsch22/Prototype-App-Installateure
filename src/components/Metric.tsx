import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'brand';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: Tone;
}

const valueTone: Record<Tone, string> = {
  default: 'text-ink',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  brand: 'text-brand',
};

/** Farbstreifen links — im Prototyp trägt jede Kennzahl einen Zustandsstreifen. */
const stripTone: Record<Tone, string> = {
  default: 'border-l-brand',
  success: 'border-l-success',
  danger: 'border-l-accent',
  warning: 'border-l-warning',
  brand: 'border-l-brand',
};

const iconTone: Record<Tone, string> = {
  default: 'bg-surface-2 text-ink-muted',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  brand: 'bg-info-bg text-brand',
};

export default function Metric({ label, value, hint, icon, tone = 'default' }: MetricProps) {
  return (
    <div
      className={`rounded-lg border border-l-4 border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-lg ${stripTone[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="section-label">{label}</p>
        {icon && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconTone[tone]}`}
          >
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-2xl font-extrabold ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
