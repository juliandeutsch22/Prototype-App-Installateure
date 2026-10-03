import { InputField, SelectField, FormGrid, CheckboxField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import { todayStr } from '@/lib/time';
import { datumAT as fmtDatum } from '@/lib/datum';
import {
  EINSTUFUNGEN, LEHRZEIT_VORGABE, lehrjahr, lehrzeitEnde, type Einstufung,
} from '@/lib/einstufung';
import type { BenutzerEntwurf } from './benutzerEntwurf';

/** Übliche Lehrzeiten: zwei bis vier Jahre, halbjährlich. */
const LEHRZEITEN = [24, 30, 36, 42, 48];

const jahreText = (monate: number) =>
  `${String(monate / 12).replace('.5', '½')} Jahre`;

/**
 * EINSTUFUNG AN DER PERSON (Testbericht 30.09.2026, 4.1 Punkt 1).
 *
 * In Anlage und Akte dieselben Felder. Die Einstufung bestimmt den Satz der
 * Stunden — nicht, was jemand sehen und tun darf; das bleibt die Rolle.
 * Beim Lehrling kommen Lehrbeginn und Lehrzeit dazu, und das Lehrjahr steht
 * gleich daneben: so sieht man vor dem Speichern, welcher Satz gilt.
 */
export default function EinstufungFelder({
  form,
  setForm,
  idPrefix,
}: {
  form: BenutzerEntwurf;
  setForm: (f: BenutzerEntwurf) => void;
  idPrefix: string;
}) {
  const lehrling = form.einstufung === 'lehrling';
  const monate = Number(form.lehrzeitMonate);
  const heute = todayStr();
  const vollstaendig = lehrling && !!form.lehrbeginn && monate > 0;

  return (
    <div className="flex flex-col gap-2">
      <FormGrid>
        <SelectField
          id={`${idPrefix}-einstufung`}
          label="Einstufung"
          value={form.einstufung}
          onChange={(e) => {
            const wert = e.target.value as Einstufung | '';
            setForm({
              ...form,
              einstufung: wert,
              // Die Lehrzeit mit dem Üblichen vorbelegen — der Lehrbeginn bleibt leer, den weiss nur das Büro.
              lehrzeitMonate: wert === 'lehrling' && !form.lehrzeitMonate ? String(LEHRZEIT_VORGABE) : form.lehrzeitMonate,
            });
          }}
        >
          <option value="">Nicht festgelegt (zählt wie Facharbeiter)</option>
          {EINSTUFUNGEN.map((s) => (
            <option key={s.wert} value={s.wert}>{s.name}</option>
          ))}
        </SelectField>
        {lehrling && (
          <>
            <InputField
              id={`${idPrefix}-lehrbeginn`}
              label="Lehrbeginn"
              type="date"
              pflicht
              value={form.lehrbeginn}
              onChange={(e) => setForm({ ...form, lehrbeginn: e.target.value })}
            />
            <SelectField
              id={`${idPrefix}-lehrzeit`}
              label="Lehrzeit"
              value={form.lehrzeitMonate}
              onChange={(e) => setForm({ ...form, lehrzeitMonate: e.target.value })}
            >
              {LEHRZEITEN.map((m) => (
                <option key={m} value={String(m)}>{jahreText(m)}</option>
              ))}
            </SelectField>
          </>
        )}
      </FormGrid>
      {/*
        JE PERSON, NICHT JE LEHRJAHR (Entscheidung 03.10.2026): ob die Stunden
        eines Lehrlings ins Budget der Baustelle gehören, hängt an seiner
        Leistung. Die Buchung merkt sich den Stand vom Tag.
      */}
      {lehrling && (
        <div className="flex flex-wrap items-center gap-1">
          <CheckboxField
            id={`${idPrefix}-insbudget`}
            label="Stunden zählen ins Projekt-Budget"
            checked={form.stundenInsBudget}
            onChange={(e) => setForm({ ...form, stundenInsBudget: e.target.checked })}
          />
          <InfoHint about="Stunden im Projekt-Budget">
            Gilt für Buchungen ab dem Umschalten. Bisher gebuchte Stunden bleiben, wie sie gezählt
            wurden. Ohne Haken stehen die Stunden auf der Baustelle als „nicht im Budget“, verrechnet
            werden sie weiter zum Satz des Lehrjahres.
          </InfoHint>
        </div>
      )}
      <p className="text-sm text-ink-muted">
        {vollstaendig ? (
          <>
            Heute im <strong>{lehrjahr(form.lehrbeginn, monate, heute)}. Lehrjahr</strong>
            {' · '}Lehrzeit bis {fmtDatum(lehrzeitEnde(form.lehrbeginn, monate))}.{' '}
          </>
        ) : null}
        Die Einstufung bestimmt den Stundensatz auf Rechnung und Nachkalkulation, nicht die Rechte.
        Sie gilt für neue und für noch nicht verrechnete Stunden; verrechnete bleiben, wie sie sind.
      </p>
    </div>
  );
}
