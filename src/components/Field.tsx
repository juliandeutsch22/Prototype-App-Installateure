import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

const fieldBase =
  'min-h-touch rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

/** Beschriftetes Eingabefeld — Label ist Pflicht (Barrierearmut). */
export function InputField({ label, id, className = '', ...rest }: InputFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} className={`${fieldBase} ${className}`} {...rest} />
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  children: ReactNode;
}

export function SelectField({ label, id, className = '', children, ...rest }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <select id={id} className={`${fieldBase} ${className}`} {...rest}>
        {children}
      </select>
    </div>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  id: string;
}

/** Checkbox mit großem Touch-Ziel und einheitlichem Label. */
export function CheckboxField({ label, id, className = '', ...rest }: CheckboxFieldProps) {
  return (
    <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-3 text-base text-ink">
      <input id={id} type="checkbox" className={`h-5 w-5 rounded border-line accent-brand focus:ring-brand ${className}`} {...rest} />
      {label}
    </label>
  );
}

/** Responsives Formular-Raster: 1 Spalte mobil, mehrspaltig ab sm. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const map = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' };
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>;
}
