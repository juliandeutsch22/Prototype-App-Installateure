import Icon, { type IconName } from './Icon';
import { SYMBOLE } from './naviSymbole';

/**
 * Das Symbol eines Menüziels. Ziele ohne eigene Fassung (selten genutzte
 * Bereiche) behalten ihr bisheriges Symbol, damit keines ohne dasteht.
 */
export default function NaviSymbol({ pfad, ersatz, size }: { pfad: string; ersatz: IconName; size: number }) {
  const d = SYMBOLE[pfad];
  if (!d) return <Icon name={ersatz} size={size} className="shrink-0" />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 navi-symbol"
      aria-hidden="true"
      focusable="false"
      data-symbol={pfad}
    >
      <path d={d} />
    </svg>
  );
}
