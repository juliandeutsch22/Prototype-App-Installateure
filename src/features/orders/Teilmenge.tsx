import ZahlFeld from '@/components/ZahlFeld';
import { fmtMenge } from '@/lib/belegLayout';
import { teilwahl } from './teilmengeWahl';

/** Das Mengenfeld mit dem Satz, was mit dem Rest geschieht. */
export function TeilmengeFeld({
  id,
  label,
  wert,
  angefordert,
  einheit,
  rest,
  onChange,
}: {
  id: string;
  label: string;
  wert: string;
  angefordert: number;
  einheit?: string | null;
  /** Was mit dem Rest geschieht — „bleibt abholbereit liegen“ … */
  rest: string;
  onChange: (text: string) => void;
}) {
  const w = teilwahl(wert, angefordert);
  const e = einheit ? ` ${einheit}` : '';
  return (
    <div className="space-y-1">
      <ZahlFeld id={id} label={label} value={wert} onChange={onChange} />
      <p className="text-meta text-ink-muted">
        {w.art === 'teil'
          ? `Der Rest — ${fmtMenge(angefordert - w.menge)}${e} — ${rest}.`
          : w.art === 'fehler'
            ? w.grund
            : `Angefordert: ${fmtMenge(angefordert)}${e}. Weniger eintragen, wenn nur ein Teil geht.`}
      </p>
    </div>
  );
}
