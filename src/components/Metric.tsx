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

const iconTone: Record<Tone, string> = {
  default: 'bg-surface-2 text-ink-muted',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  brand: 'bg-info-bg text-brand',
};

/**
 * Kennzahl-Kachel — bewusst dieselbe ruhige Hülle wie `Card`.
 *
 * Der farbige Balken links ist entfallen: er markierte am Ende jede Kachel
 * und hob damit nichts mehr hervor. Der Ton lebt jetzt in der Zahl und im
 * Symbol, wo er tatsächlich etwas aussagt. Auch der Schatten beim Überfahren
 * ist weg — eine Kennzahl ist keine Schaltfläche.
 */
export default function Metric({ label, value, hint, icon, tone = 'default' }: MetricProps) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
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
      <p className={`tnum mt-1.5 text-2xl font-extrabold ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
