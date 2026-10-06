import { InputField, SelectField, FormGrid, CheckboxField } from '@/components/Field';
import InfoHint from '@/components/InfoHint';
import Hinweiszeile from '@/components/Hinweiszeile';
import { todayStr } from '@/lib/time';
import { datumAT as fmtDatum } from '@/lib/datum';
import {
  EINSTUFUNGEN, LEHRZEIT_VORGABE, lehrjahr, lehrzeitEnde, type Einstufung, type FruehereEinstufung,
} from '@/lib/einstufung';
import { lehrbeginnVorEintritt, type BenutzerEntwurf } from './benutzerEntwurf';

/** Übliche Lehrzeiten: zwei bis vier Jahre, halbjährlich. */
const LEHRZEITEN = [24, 30, 36, 42, 48];

const jahreText = (monate: number) =>
  `${String(monate / 12).replace('.5', '½')} Jahre`;

const stufenName = (e: Einstufung | null | '' | undefined) =>
  EINSTUFUNGEN.find((s) => s.wert === e)?.name ?? 'Nicht festgelegt';

/** Der letzte Tag, an dem eine frühere Stufe galt — `bis` zählt nicht mehr dazu. */
function letzterTag(bis: string): string {
  const [y, m, d] = bis.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10);
}

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
  gespeichert,
  eintritt,
}: {
  form: BenutzerEntwurf;
  setForm: (f: BenutzerEntwurf) => void;
  idPrefix: string;
  /** In der Akte: der gespeicherte Stand, für Umstufung und frühere Stufen. */
  gespeichert?: { einstufung?: Einstufung | null; einstufungVerlauf?: FruehereEinstufung[] | null };
  /** Der Eintritt in den Betrieb — für den Hinweis, wenn die Lehre davor begann (Runde 3, G18). */
  eintritt?: string | null;
}) {
  const lehrling = form.einstufung === 'lehrling';
  const bisher = gespeichert?.einstufung ?? null;
  // Die erste Einstufung gilt rückwirkend — es gab davor keine Stufe, die bleiben könnte.
  const umstufung = !!bisher && (form.einstufung || null) !== bisher;
  const verlauf = gespeichert?.einstufungVerlauf ?? [];
  const monate = Number(form.lehrzeitMonate);
  const heute = todayStr();
  // Heute schon einmal umgestuft: für die Tage davor gilt, was der Verlauf festhält.
  const heuteSchon = verlauf.slice(-1)[0];
  const bleibt = heuteSchon && heuteSchon.bis === heute ? heuteSchon.einstufung : bisher;
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
        LEHRBEGINN VOR DEM EINTRITT (Runde 3, G18): wird Lehrzeit aus einem
        anderen Betrieb angerechnet, stimmt das so. Deshalb fragt die Maske
        nur nach und speichert trotzdem.
      */}
      {lehrbeginnVorEintritt(form, eintritt) && (
        <Hinweiszeile>
          <p>
            Der Lehrbeginn liegt vor dem Eintritt ({fmtDatum(eintritt)}). Wird Lehrzeit angerechnet?
            Dann stimmt das so — das Lehrjahr zählt ab dem Lehrbeginn.
          </p>
        </Hinweiszeile>
      )}
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
        Jede Stunde zählt zum Satz ihres Tages.
        <InfoHint about="Umstufung">
          Eine Umstufung gilt ab dem Tag, an dem sie gespeichert wird. Stunden davor behalten den
          Satz der bisherigen Stufe, auch wenn sie noch nicht verrechnet sind — wird ein Lehrling
          nach der Lehrabschlussprüfung Facharbeiter, bleiben seine Lehrlingsstunden beim
          Lehrlingssatz. Ausnahme: Bekommt jemand zum ersten Mal eine Einstufung, gilt sie für
          alle noch nicht verrechneten Stunden; davor gab es keine Stufe. Ein berichtigter
          Lehrbeginn gilt ebenso für alle noch nicht verrechneten Stunden, weil sich das Lehrjahr
          aus dem Tag der Buchung ergibt.
        </InfoHint>
      </p>
      {umstufung && (
        <p className="text-sm text-warning">
          Umstufung von {stufenName(bisher)} auf {stufenName(form.einstufung)}: gilt ab heute
          ({fmtDatum(heute)}). Stunden bis {fmtDatum(letzterTag(heute))} bleiben beim Satz
          {' '}{stufenName(bleibt)}.
        </p>
      )}
      {verlauf.length > 0 && (
        <p className="text-sm text-ink-muted">
          Frühere Einstufung:{' '}
          {verlauf.map((v) => `${stufenName(v.einstufung)} bis ${fmtDatum(letzterTag(v.bis))}`).join(', ')}.
        </p>
      )}
    </div>
  );
}
