import type { AnchorHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { knopfKlassen, type Groesse, type Variant } from './knopf';

type Gestalt = { variant?: Variant; groesse?: Groesse };

/**
 * Ein Link, der wie ein Knopf aussieht — weil er die Rolle eines Knopfs hat
 * („Neuer Schein“ führt auf eine Seite, statt etwas auszulösen). Dieselbe
 * Gestalt wie `Button` (`knopf.ts`): keine eigenen Schatten, keine eigene
 * Skalierung beim Drücken. Mit `to` innerhalb der App, mit `href` nach
 * draußen (Kalender, Karte).
 */
export default function KnopfLink(props: (LinkProps & Gestalt) | (AnchorHTMLAttributes<HTMLAnchorElement> & Gestalt & { href: string })) {
  const { variant = 'primary', groesse = 'normal', className = '', ...rest } = props;
  const klassen = `${knopfKlassen(variant, groesse)} ${className}`;
  if ('to' in rest) return <Link {...(rest as LinkProps)} className={klassen} />;
  return <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={klassen} />;
}
