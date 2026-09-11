import { getAustrianHolidayName, localDateStr, todayStr } from '@/lib/time';

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface MonthCalendarProps {
  year: number;
  month: number; // 0-basiert
  /** Ausgewählter Tag 'YYYY-MM-DD' oder null. */
  selected: string | null;
  onSelect: (iso: string) => void;
  /** Monat blättern; delta ist -1 oder +1. */
  onShiftMonth: (delta: number) => void;
  /**
   * Zahl je Tag — im Planungsfall die Anzahl belegter Baustellen. Ein Tag
   * ohne Eintrag steht nicht in der Map.
   */
  marks?: Map<string, number>;
  /**
   * Was die Zahl bedeutet, für die Vorlesehilfe — als Funktion, damit
   * „1 Baustelle geplant" nicht als „1 Baustellen geplant" vorgelesen wird.
   */
  markLabel?: (n: number) => string;
}

/**
 * Monatskalender — die Planungsansicht des Prototyps.
 *
 * Ein Datumsfeld beantwortet die Frage „welcher Tag?", aber nicht die
 * eigentliche Frage der Planung: „wo ist noch nichts eingeteilt?". Erst das
 * Raster zeigt Lücken und Häufungen auf einen Blick — und genau dafür sitzt
 * jemand vor der Einsatzplanung.
 *
 * Jeder Tag ist ein echter Button: mit der Tastatur erreichbar, mit
 * vollständigem Datum beschriftet. Feiertage tragen zusätzlich zur Färbung
 * ihren Namen, denn Farbe allein ist kein Signal.
 */
export default function MonthCalendar({
  year,
  month,
  selected,
  onSelect,
  onShiftMonth,
  marks,
  markLabel = (n) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`,
}: MonthCalendarProps) {
  const today = todayStr();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Montag ist die erste Spalte — getDay() liefert Sonntag als 0.
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(localDateStr(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-2 py-2">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          aria-label="Vorheriger Monat"
          className="min-h-touch min-w-touch rounded text-lg font-bold text-ink-muted hover:bg-surface-2"
        >
          ‹
        </button>
        <span className="font-bold text-ink">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          aria-label="Nächster Monat"
          className="min-h-touch min-w-touch rounded text-lg font-bold text-ink-muted hover:bg-surface-2"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-line bg-surface-2">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-xs font-bold ${i > 4 ? 'text-ink-muted/70' : 'text-ink-muted'}`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((iso, i) => {
          /*
            DIE UNTEREN ECKEN MUESSEN MITRUNDEN.

            Der Rahmen aussen ist `rounded-lg` mit `overflow-hidden` — der
            Browser beschneidet damit alles, was ueber die gerundete Ecke
            hinausragt. Ein eckiges Kaestchen in der Ecke verliert dabei ein
            Stueck seiner Kante, und beim AUSGEWAEHLTEN Tag ist das genau der
            blaue Rahmen: er war unten links sichtbar abgeschnitten. Gemeldet
            aus dem Betrieb, mit Bildschirmfoto.

            15 statt 16 Pixel: der aeussere Rahmen rundet mit 16, ist aber
            1 Pixel breit — beschnitten wird an der INNEREN Kante, und die
            rundet um genau diese Breite kleiner. Nachgemessen im Browser,
            nicht geschaetzt: mit 7 Pixeln stand die Ecke immer noch ueber.
          */
          const ecke =
            i === cells.length - 7
              ? ' rounded-bl-[15px]'
              : i === cells.length - 1
                ? ' rounded-br-[15px]'
                : '';

          if (!iso)
            return <div key={`pad-${i}`} className={`min-h-[3.625rem] bg-surface-2/40${ecke}`} />;

          const day = Number(iso.slice(8));
          const dow = new Date(`${iso}T00:00:00`).getDay();
          const weekend = dow === 0 || dow === 6;
          const holiday = getAustrianHolidayName(new Date(`${iso}T00:00:00`));
          const count = marks?.get(iso) ?? 0;
          const isToday = iso === today;
          const isSelected = iso === selected;
          const past = iso < today;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              title={holiday ?? undefined}
              aria-label={
                `${new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}` +
                (holiday ? `, ${holiday}` : '') +
                (count > 0 ? `, ${markLabel(count)}` : '')
              }
              /*
                `py-2` statt `pt-2`: die Zahl der Einsaetze sass vorher hart
                auf der unteren Kante des Kaestchens. Sie hatte dort auch
                keinen Platz — 8 + 24 + 4 + 18 Pixel sind mehr als die 52, die
                das Kaestchen hoch war, der Punkt wurde also nach unten
                herausgedrueckt. Gemeldet aus dem Betrieb, mit Bildschirmfoto.
              */
              className={`flex min-h-[3.625rem] flex-col items-center gap-0.5 border-b border-r border-line/60 py-2 transition-colors${ecke} ${
                isSelected
                  ? 'bg-info-bg ring-2 ring-inset ring-brand'
                  : holiday
                    ? // Zusätzlich zur Fläche ein Balken oben: die getönte
                      // Fläche allein war neben dem Wochenend-Grau kaum zu
                      // unterscheiden.
                      'bg-warning-bg shadow-[inset_0_3px_0_0_var(--warning)] hover:brightness-95'
                    : weekend
                      ? 'bg-surface-2/60 hover:bg-surface-2'
                      : 'hover:bg-surface-2'
              }`}
            >
              <span
                className={`tnum flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isSelected
                    ? 'bg-brand text-brand-fg'
                    : isToday
                      ? 'bg-brand/20 font-bold text-brand'
                      : // Vergangene Tage ohne Planung treten zurück; wo etwas
                        // geplant war, bleibt der Tag lesbar.
                        past && count === 0
                        ? 'text-ink-muted/60'
                        : 'text-ink'
                }`}
              >
                {day}
              </span>
              {count > 0 && (
                <span
                  className={`tnum inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                    past ? 'bg-line text-ink-muted' : 'bg-accent text-accent-fg'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
