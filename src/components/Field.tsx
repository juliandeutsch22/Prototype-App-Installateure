import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
}

/** Beschriftetes Eingabefeld — Label ist Pflicht (Barrierearmut). */
export function InputField({ label, id, className = '', ...rest }: InputFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-touch rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
        {...rest}
      />
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
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        className={`min-h-touch rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
