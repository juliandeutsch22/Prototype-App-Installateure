import { aufloesenText, type RuestlisteFrage } from '@/lib/db/ruestlisteFrage';

/**
 * „RÜSTLISTE AUFLÖSEN?“ (Durchsicht 15.11.2026, P2) — die Frage, wenn der
 * letzte Einsatz eines Paares wegfällt und eine Rüstliste daran hängt.
 *
 * Keine Vorauswahl: beides ist alltäglich — der Einsatz fällt aus (dann
 * auflösen, sonst bleibt Material reserviert und eine Anforderung offen),
 * oder gleich wird jemand anderes eingeteilt (dann behalten). Eine geratene
 * Vorauswahl würde mit einem Tipp das Falsche bestätigen.
 */
export default function RuestlisteWahl({
  frage,
  wahl,
  onWahl,
  name,
}: {
  frage: RuestlisteFrage;
  wahl: 'aufloesen' | 'behalten' | null;
  onWahl: (w: 'aufloesen' | 'behalten') => void;
  /** Eindeutig je Stelle, damit zwei offene Fragen sich nicht die Auswahl teilen. */
  name: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-meta text-ink">
        <strong>Rüstliste auflösen?</strong> Nach dem Entfernen ist an diesem Tag niemand mehr auf dieser Baustelle
        eingeteilt.
      </legend>
      <label className="flex min-h-touch cursor-pointer items-start gap-2 text-fliess text-ink">
        <input
          type="radio"
          name={name}
          className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
          checked={wahl === 'aufloesen'}
          onChange={() => onWahl('aufloesen')}
        />
        <span>
          Auflösen
          <span className="block text-meta text-ink-muted">{aufloesenText(frage)}</span>
        </span>
      </label>
      <label className="flex min-h-touch cursor-pointer items-start gap-2 text-fliess text-ink">
        <input
          type="radio"
          name={name}
          className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--accent-deep)]"
          checked={wahl === 'behalten'}
          onChange={() => onWahl('behalten')}
        />
        <span>
          Behalten
          <span className="block text-meta text-ink-muted">
            Die Liste bleibt an diesem Tag stehen, samt Reservierung — für die nächste Einteilung dort.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
