import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: 'default' | 'success' | 'danger' | 'warning';
}

const valueTone = {
  default: 'text-ink',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
};

export default function Metric({ label, value, hint, icon, tone = 'default' }: MetricProps) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-muted">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
