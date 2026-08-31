import { useId, useMemo, useState, type ReactNode } from 'react';
import Badge from './Badge';
import Button from './Button';

export interface PickablePerson {
  uid: string;
  name: string;
  /** Zusatz in der Zeile, z. B. die Rolle. */
  hint?: string;
}

interface PersonPickerProps {
  legend: string;
  people: PickablePerson[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Präfix für die Feld-IDs — muss je Verwendung eindeutig sein. */
  idPrefix: string;
  /** Was steht da, wenn niemand zur Auswahl steht. */
  emptyHint?: string;
  /** Zusätzliche Bedienelemente je ausgewählter Person (z. B. „als Helfer"). */
  renderExtra?: (uid: string) => ReactNode;
  /**
   * Ab wie vielen Personen ein Suchfeld erscheint. Bei drei Kollegen wäre es
   * Ballast, bei zwanzig ist die Liste ohne es nicht mehr zu bedienen.
   */
  searchFrom?: number;
}

/**
 * Auswahl von Personen aus einer Liste, die auch bei zwanzig Namen
 * beherrschbar bleibt.
 *
 * Vorher standen alle Mitarbeiter als Kästchen nebeneinander im Formular. Bei
 * drei Monteuren geht das; bei zwanzig entsteht ein Block, in dem man den
 * Gesuchten nicht findet und nach dem Speichern nicht mehr erkennt, wer
 * eigentlich angehakt ist.
 *
 * Drei Dinge lösen das: die Ausgewählten stehen als Pillen ZUERST, die Liste
 * hat eine feste Höhe und scrollt, und ab einer Handvoll Personen gibt es ein
 * Suchfeld. Wer sucht, sieht die Treffer; wer nur prüfen will, wen er gewählt
 * hat, muss dafür nicht scrollen.
 */
export default function PersonPicker({
  legend,
  people,
  selected,
  onChange,
  idPrefix,
  emptyHint = 'Niemand verfügbar.',
  renderExtra,
  searchFrom = 8,
}: PersonPickerProps) {
  const [q, setQ] = useState('');
  const suchId = useId();

  const gewaehlt = useMemo(
    () => selected.map((uid) => people.find((p) => p.uid === uid)).filter(Boolean) as PickablePerson[],
    [selected, people],
  );

  const sichtbar = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter((p) => p.name.toLowerCase().includes(s));
  }, [people, q]);

  function umschalten(uid: string, an: boolean) {
    onChange(an ? [...selected, uid] : selected.filter((x) => x !== uid));
  }

  return (
    <fieldset>
      <legend className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        {legend}
        {selected.length > 0 && <Badge tone="info">{selected.length} ausgewählt</Badge>}
      </legend>

      {people.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">{emptyHint}</p>
      ) : (
        <>
          {/* Die Ausgewählten zuerst und immer sichtbar: sonst muss man durch
              zwanzig Zeilen scrollen, um zu sehen, wen man gewählt hat. */}
          {gewaehlt.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {gewaehlt.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => umschalten(p.uid, false)}
                  aria-label={`${p.name} entfernen`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-info-bg px-2.5 py-1 text-sm font-medium text-brand hover:bg-info-bg/70"
                >
                  {p.name}
                  <span aria-hidden="true" className="text-base leading-none">
                    ×
                  </span>
                </button>
              ))}
              <Button variant="ghost" onClick={() => onChange([])} className="px-2 text-sm">
                Alle entfernen
              </Button>
            </div>
          )}

          {people.length >= searchFrom && (
            <div className="mt-2">
              <label htmlFor={suchId} className="sr-only">
                {legend} durchsuchen
              </label>
              <input
                id={suchId}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name suchen"
                className="min-h-touch w-full rounded border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          )}

          {/* Feste Höhe mit Bildlauf: eine Liste aus zwanzig Namen darf das
              Formular nicht auseinanderreißen. */}
          <div className="mt-2 max-h-64 overflow-y-auto rounded border border-line">
            {sichtbar.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink-muted">
                Kein Name passt zu „{q}".
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {sichtbar.map((p) => {
                  const an = selected.includes(p.uid);
                  const id = `${idPrefix}-${p.uid}`;
                  return (
                    <li key={p.uid} className={an ? 'bg-info-bg/40' : ''}>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3">
                        <label
                          htmlFor={id}
                          className="flex min-h-touch flex-1 cursor-pointer items-center gap-2.5 py-1"
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={an}
                            onChange={(e) => umschalten(p.uid, e.target.checked)}
                            className="h-5 w-5 shrink-0 rounded border-line text-brand focus:ring-brand"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-ink">{p.name}</span>
                            {p.hint && (
                              <span className="block truncate text-xs text-ink-muted">{p.hint}</span>
                            )}
                          </span>
                        </label>
                        {an && renderExtra?.(p.uid)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
