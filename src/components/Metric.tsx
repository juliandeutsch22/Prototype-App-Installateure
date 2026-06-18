import type { ReactNode } from 'react';

interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

export default function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
