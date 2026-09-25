import type { ReactNode } from 'react';

/**
 * Reiter INNERHALB einer Seite — Material, Lager, Anforderungen, Urlaub.
 *
 * Anders als `Unterreiter` wechseln diese Reiter keine Route, sondern nur,
 * was auf der Seite steht; deshalb Schaltflächen mit `role="tab"` statt
 * Links. Aussehen wie dort: `.reiterleiste`, `.reiter`, `.reiter-aktiv` in
 * `index.css` („Reiter“) — eine Klasse je Zustand, wörtlich ausgeschrieben.
 */
export function Reiterleiste({ children }: { children: ReactNode }) {
  return (
    <div className="reiterleiste" role="tablist">
      {children}
    </div>
  );
}

export function Reiter({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={aktiv}
      onClick={onClick}
      className={aktiv ? 'reiter-aktiv' : 'reiter'}
    >
      {children}
    </button>
  );
}
