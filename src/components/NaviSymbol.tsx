import Icon, { type IconName } from './Icon';

/*
  DIE MENÜ-SYMBOLE DER PLANLINIE (B9): 16-px-Fassungen der Modulskizzen,
  damit Menü und Plankopf zusammengehören — der Start trägt das Lot, die
  Baustellen das Haus mit der Achse, die Rechnungen den Beleg mit gezackter
  Kante. Je Ziel der Navigation, nicht je Symbolname: „Meine Baustellen“ und
  „Baustellen“ sind dasselbe Haus, „Urlaub“ und „Sonderurlaub“ derselbe
  Kalender.
*/
const SYMBOLE: Record<string, string> = {
  '/': 'M8 1.8 V8.6 M8 8.6 L5.6 11.4 L8 14.4 L10.4 11.4 Z',
  '/admin-projects': 'M2.5 13.5 H13.5 M4 13.5 V7.2 L8 4.2 L12 7.2 V13.5 M8 4.2 V9',
  '/my-projects': 'M2.5 13.5 H13.5 M4 13.5 V7.2 L8 4.2 L12 7.2 V13.5 M8 4.2 V9',
  '/assignments': 'M2.5 3.5 H13.5 V13 H2.5 Z M2.5 6.5 H13.5 M6.2 6.5 V13 M9.8 6.5 V13',
  '/my-schedule': 'M2.5 3.5 H13.5 V13 H2.5 Z M2.5 6.5 H13.5 M6.2 6.5 V13 M9.8 6.5 V13',
  '/worksheets': 'M4 2.5 H10 L12.5 5 V13.5 H4 Z M6 10 C7 8.4 8 11.2 9 9.8 S10.6 9.2 11 10.2',
  '/quotes': 'M3.5 4.5 H10.5 V13.5 H3.5 Z M5.5 2.5 H12.5 V11.5',
  '/customers': 'M3 13.5 V7.5 L8 3.5 L13 7.5 V13.5 Z M7 13.5 V10 H9 V13.5',
  '/wartungen': 'M5 3 Q5 2 6 2 H10 Q11 2 11 3 V11 H5 Z M8 4.6 A1.6 1.6 0 1 1 7.99 4.6 M6.5 11 V14 M9.5 11 V14',
  '/invoices': 'M4 2.5 H12 V13.5 L10.7 12.6 L9.3 13.5 L8 12.6 L6.7 13.5 L5.3 12.6 L4 13.5 Z M6 5.5 H10 M6 8 H10',
  '/costing': 'M8 3 V13 M5.5 13.5 H10.5 M2.5 5 H13.5 M2.5 5 L1.5 8.5 H3.5 Z M13.5 5 L12.5 8.5 H14.5 Z',
  '/time': 'M8 2.5 A5.5 5.5 0 1 1 7.99 2.5 M8 5 V8 L10 9.5',
  '/vacations': 'M2.5 4 H13.5 V13.5 H2.5 Z M2.5 6.8 H13.5 M5.5 2.5 V5 M10.5 2.5 V5 M5.5 10.2 L7.2 11.8 L10.5 8.6',
  '/sonderurlaub': 'M2.5 4 H13.5 V13.5 H2.5 Z M2.5 6.8 H13.5 M5.5 2.5 V5 M10.5 2.5 V5 M5.5 10.2 L7.2 11.8 L10.5 8.6',
  '/accounting': 'M3 10.5 C3 6.5 5.3 5 8 5 C10.7 5 13 6.5 13 10.5 Z M1.8 10.5 H14.2 M8 5 V10.5 M4 13.5 H12',
  '/user-mgmt': 'M8 3 A2.6 2.6 0 1 1 7.99 3 M3.2 13.5 C3.2 10.6 5.3 9.2 8 9.2 S12.8 10.6 12.8 13.5',
  '/material': 'M3 13.5 V9.5 Q3 5.5 7 5.5 H13 M11 3.5 L13 5.5 L11 7.5',
  '/anforderungen': 'M2.8 4.6 L3.8 5.6 L5.6 3.6 M7.8 4.6 H13.2 M2.8 9 L3.8 10 L5.6 8 M7.8 9 H13.2 M7.8 13 H13.2',
  '/lager': 'M3 2.5 V13.5 M13 2.5 V13.5 M3 7 H13 M3 11.5 H13 M5 7 V4.6 H8 V7 M9 11.5 V9.4 H11.5 V11.5',
  '/settings': 'M8 3.6 L4.6 13.5 M8 3.6 L11.4 13.5 M5.6 10.4 H10.4 M8 1.6 A1 1 0 1 1 7.99 1.6',
};

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
