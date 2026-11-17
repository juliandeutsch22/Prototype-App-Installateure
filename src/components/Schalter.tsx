import type { ReactNode } from 'react';

/**
 * DER SCHALTER (U6, Entscheidung E3 vom 15.11.2026; seit E95 vom 17.11.2026
 * für die ganze App): für jedes Ein/Aus einer Einstellung oder Eigenschaft —
 * Module, Meldungen, „Aktiv“, „Darf …“, ein Filter der Ansicht —, ob es
 * sofort wirkt oder erst mit „Speichern“. Das Kästchen (`CheckboxField`)
 * bleibt für Auswahl aus einer Liste, Abhaken und eine Bestätigung; der
 * Wächter `schalterRegel.test.ts` kennt jedes.
 *
 * Vorher stand beides als Kästchen da, bei den Modulen mit „ein“/„aus“
 * daneben. Ob ein Haken schon gilt oder erst mit dem Speichern, sah man ihm
 * nicht an — und wer bei den Meldungen nach einem Speichern-Knopf suchte,
 * fand keinen, weil es keinen braucht.
 *
 * Gestalt wie der Schalter „Dunkle Darstellung“ (dieselbe Schiene, derselbe
 * Griff), mit Häkchen im Griff, wenn er an ist: Lage, Farbe UND Zeichen
 * tragen den Zustand — Farbe allein wäre nicht genug (V10). Die ganze Zeile
 * ist das Ziel; Leertaste und Enter schalten (`button`), die Vorlesehilfe
 * hört „Schalter, an/aus“ (`role="switch"`, `aria-checked`).
 *
 * Wirkt etwas erst nach einer Rückfrage (Modul abschalten), ruft `onChange`
 * die Rückfrage und `an` bleibt, bis bestätigt ist — der Schalter springt
 * nie vor dem Ergebnis um. Während gespeichert wird, ist er gesperrt
 * (`laeuft`), damit kein zweiter Wechsel den ersten überholt.
 */
export default function Schalter({ id, label, beschreibung, an, onChange, gesperrt = false, laeuft = false, labelVerborgen = false, zusatz, 'aria-describedby': beschriebenVon }: {
  id: string;
  label: ReactNode;
  /** Ein Satz darunter: was der Schalter bewirkt. */
  beschreibung?: ReactNode;
  an: boolean;
  onChange: (an: boolean) => void;
  gesperrt?: boolean;
  /** Der Wechsel wird gerade gespeichert. */
  laeuft?: boolean;
  /**
   * Das Etikett nur für die Vorlesehilfe — wo die Zeile drumherum (`ListRow`)
   * den Namen schon groß zeigt, etwa bei den Modulen.
   */
  labelVerborgen?: boolean;
  /** Ein „i“ (`InfoHint`) neben dem Etikett — außerhalb davon, damit es nicht in den Namen des Schalters rutscht. */
  zusatz?: ReactNode;
  /** Ein Satz außerhalb des Schalters, der ihn erklärt (etwa warum er gesperrt ist) — die Vorlesehilfe liest ihn mit. */
  'aria-describedby'?: string;
}) {
  const aus = gesperrt || laeuft;
  return (
    <div className={labelVerborgen ? 'schalter-zeile schalter-allein' : 'schalter-zeile'} data-gesperrt={aus || undefined}>
      <label htmlFor={id} className={labelVerborgen ? 'sr-only' : 'schalter-text'}>
        <span className="schalter-name">{label}</span>
        {beschreibung && <span className="schalter-beschreibung">{beschreibung}</span>}
      </label>
      {zusatz}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={an}
        aria-busy={laeuft || undefined}
        aria-describedby={beschriebenVon}
        disabled={aus}
        className="schalter"
        onClick={() => onChange(!an)}
      >
        <span className="schalter-schiene" aria-hidden="true">
          <span className="schalter-griff">
            {an && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
