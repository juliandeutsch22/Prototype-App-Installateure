import { CheckboxField, InputField } from '@/components/Field';
import { WEEKDAYS, zahlOderVorgabe, type BenutzerEntwurf } from './benutzerEntwurf';
import { zahlOder } from '@/lib/zahl';
import { DEFAULT_WEEKLY_HOURS } from '@/lib/db/benutzerVorgaben';

/**
 * EIN EIGENES TAGESSOLL JE WOCHENTAG (Testbericht 30.09.2026, M5).
 *
 * Ab Werk aus: dann gilt Wochenstunden durch Arbeitstage, wie bisher. Wer es
 * einschaltet, bekommt je gewähltem Arbeitstag ein Feld, vorbelegt mit dem
 * gleichmässigen Wert — etwa für einen kürzeren Freitag. Die Wochenstunden
 * ergeben sich dann aus der Summe (`alsProfil`).
 */
export default function TagessollFelder({
  form,
  setForm,
}: {
  form: BenutzerEntwurf;
  setForm: (f: BenutzerEntwurf) => void;
}) {
  const an = Object.keys(form.tagessoll).length > 0;
  const tage = WEEKDAYS.filter((d) => form.workDays.includes(d.value));
  const gleichmaessig = () => {
    const woche = zahlOderVorgabe(form.weeklyTargetHours, DEFAULT_WEEKLY_HOURS);
    const je = tage.length ? Math.round((woche / tage.length) * 100) / 100 : 0;
    return String(je).replace('.', ',');
  };
  const summe = tage.reduce(
    (s, d) => s + zahlOder(form.tagessoll[String(d.value)] ?? '', 0),
    0,
  );

  return (
    <div className="mt-3">
      <CheckboxField
        id="tagessoll-an"
        label="Tagessoll je Wochentag festlegen (etwa ein kürzerer Freitag)"
        checked={an}
        onChange={(e) =>
          setForm({
            ...form,
            tagessoll: e.target.checked
              ? Object.fromEntries(tage.map((d) => [String(d.value), gleichmaessig()]))
              : {},
          })
        }
      />
      {an && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tage.map((d) => (
              <InputField
                key={d.value}
                id={`tagessoll-${d.value}`}
                label={`${d.label} (Std.)`}
                inputMode="decimal"
                value={form.tagessoll[String(d.value)] ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tagessoll: { ...form.tagessoll, [String(d.value)]: e.target.value },
                  })
                }
              />
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Wochenstunden aus der Summe: {String(Math.round(summe * 100) / 100).replace('.', ',')} Std.
          </p>
        </>
      )}
    </div>
  );
}
