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
 * Kennzahl-Kachel — am Telefon eine Zeile, am Schreibtisch eine Kachel.
 *
 * Gestapelt kostete jede Kachel gut 100 px Höhe. Drei davon füllten am
 * Telefon 340 px, also mehr als ein Drittel des Bildschirms, bevor der
 * eigentliche Inhalt begann: in der Zeiterfassung sah man vor dem Scrollen
 * kaum das Eingabeformular. Quer gelesen — Beschriftung links, Zahl rechts —
 * braucht dieselbe Aussage etwa die Hälfte.
 *
 * Umgesetzt über ein Raster statt über zwei Bauformen: so steht jeder Text
 * genau einmal im Dokument. Zweimal ausgeliefert und je nach Breite
 * ausgeblendet hätte bedeutet, dass eine Vorlesehilfe alles doppelt liest.
 *
 * Der farbige Balken links ist entfallen: er markierte am Ende jede Kachel
 * und hob damit nichts mehr hervor. Der Ton lebt in der Zahl und im Symbol.
 */
export default function Metric({ label, value, hint, icon, tone = 'default' }: MetricProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border border-line bg-surface px-3 py-2.5 sm:items-stretch sm:p-4">
      <p className="section-label col-start-1 row-start-1">{label}</p>

      {/* Zweite Spalte: am Telefon steht dort die Zahl, am Schreibtisch das
          Symbol. Deshalb behält das Raster beide Spalten in beiden Größen —
          teilten sich Beschriftung und Symbol eine Zelle, liefe ein längerer
          Text unter das Symbol. */}
      <p
        className={`tnum col-start-2 row-span-2 row-start-1 self-center whitespace-nowrap text-right text-xl font-extrabold sm:col-span-2 sm:col-start-1 sm:row-span-1 sm:row-start-2 sm:mt-1.5 sm:text-left sm:text-2xl ${valueTone[tone]}`}
      >
        {value}
      </p>

      {hint && (
        <p className="col-start-1 row-start-2 text-xs text-ink-muted sm:col-span-2 sm:row-start-3 sm:mt-1">
          {hint}
        </p>
      )}

      {/* Am Telefon würde das Symbol nur Platz kosten, den die Zahl braucht. */}
      {icon && (
        <span
          className={`hidden sm:col-start-2 sm:row-start-1 sm:flex sm:h-8 sm:w-8 sm:shrink-0 sm:items-center sm:justify-center sm:rounded-full ${iconTone[tone]}`}
        >
          <Icon name={icon} size={18} />
        </span>
      )}
    </div>
  );
}
