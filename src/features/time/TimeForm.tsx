import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { createTimeEntry, updateTimeEntry, DuplicateEntryError } from '@/lib/db/timeEntries';
import { todayStr, getAustrianHolidayName } from '@/lib/time';
import { isMitarbeiter } from '@/lib/permissions';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import { useToast } from '@/components/Toast';
import type { WithId } from '@/lib/db/core';
import type { Project, TimeEntry, Role } from '@/types';

interface Props {
  onSaved: () => void;
  /** Gesetzt = Bearbeiten statt Neuanlage. */
  entry?: WithId<TimeEntry>;
  onCancel?: () => void;
  /** Bereits belegte Tage (YYYY-MM-DD) für die Doppelbuchungs-Warnung. */
  existingDates?: Set<string>;
  /**
   * Rolle des Eintrags-EIGENTÜMERS. Steuert, ob Projekt-/Helferfelder gelten.
   * Beim Bearbeiten fremder Einträge zählt der Eigentümer, nicht der Bearbeiter
   * (Legacy:2629-2637) — sonst verlöre ein Mitarbeiter-Eintrag seine
   * Projektzuordnung, sobald die Buchhaltung ihn korrigiert.
   */
  ownerRole?: Role;
}

/** Formular zur manuellen Zeiterfassung (portiert aus der Legacy-Zeitform). */
export default function TimeForm({ onSaved, entry, onCancel, existingDates, ownerRole }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!entry;

  const [date, setDate] = useState(entry?.date ?? todayStr());
  const [status, setStatus] = useState<TimeEntry['status']>(entry?.status ?? 'Anwesend');
  const [startTime, setStartTime] = useState(entry?.startTime || '07:00');
  const [endTime, setEndTime] = useState(entry?.endTime || '16:00');
  const [breakDuration, setBreakDuration] = useState(String(entry?.breakDuration ?? 30));
  const [travelTime, setTravelTime] = useState(String(entry?.travelTime ?? 0));
  const [projectNumber, setProjectNumber] = useState(entry?.projectNumber ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [isHelper, setIsHelper] = useState(entry?.isHelper ?? false);
  const [helperName, setHelperName] = useState(entry?.helperName ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(entry?.vehiclePlate ?? '');

  // Projekt-, Fahrzeug- und Helferfelder sind Außendienst-Sache. Verwaltung,
  // Buchhaltung und GF buchen nur Zeit (Legacy:2168-2172).
  const effectiveRole = ownerRole ?? user?.role;
  const canHaveProject = effectiveRole ? isMitarbeiter(effectiveRole) : false;
  const showWorkFields = status === 'Anwesend';

  useEffect(() => {
    if (!user || !canHaveProject) return;
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setError('Projekte konnten nicht geladen werden.'));
  }, [user, canHaveProject]);

  // Live-Hinweise zum gewählten Datum (Legacy:2234-2269).
  const holidayName = useMemo(() => getAustrianHolidayName(new Date(`${date}T00:00:00`)), [date]);
  const alreadyBooked = useMemo(
    () => !isEdit && !!existingDates?.has(date),
    [existingDates, date, isEdit],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (alreadyBooked) {
      setError(
        `Für den ${date} existiert bereits ein Eintrag. Bitte den bestehenden Eintrag unter „Meine Einträge" bearbeiten.`,
      );
      return;
    }

    setSaving(true);
    try {
      const project = projects.find((p) => p.projectNumber === projectNumber);
      const payload = {
        date,
        status,
        startTime: showWorkFields ? startTime : '',
        endTime: showWorkFields ? endTime : '',
        breakDuration: Number(breakDuration) || 0,
        travelTime: Number(travelTime) || 0,
        projectNumber: canHaveProject ? projectNumber : '',
        customerName: canHaveProject ? project?.customerName ?? '' : '',
        vehiclePlate: canHaveProject ? vehiclePlate : '',
        helperName: canHaveProject ? helperName : '',
        comment,
        isHelper: canHaveProject ? isHelper : false,
      };

      if (isEdit) {
        // userId/userName bleiben unangetastet — der Eintrag gehört weiter dem
        // Mitarbeiter, auch wenn die Buchhaltung ihn korrigiert (Legacy:2700-2706).
        const audit =
          entry.userId !== user.uid
            ? { lastEditedBy: user.name, lastEditedByUid: user.uid, lastEditedAt: Date.now() }
            : {};
        await updateTimeEntry(entry.id, { ...payload, ...audit });
        toast.success('Eintrag aktualisiert');
      } else {
        await createTimeEntry(user.companyId, {
          ...payload,
          userId: user.uid,
          userName: user.name,
          source: 'manual',
        });
        toast.success('Zeit gebucht');
        setComment('');
      }
      onSaved();
    } catch (err) {
      if (err instanceof DuplicateEntryError) {
        setError(
          `Für den ${date} existiert bereits ein Eintrag. Bitte den bestehenden Eintrag bearbeiten.`,
        );
      } else {
        setError('Die Zeit konnte nicht gebucht werden. Bitte erneut versuchen.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormGrid>
        <InputField
          id="date"
          label="Datum"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <SelectField
          id="status"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TimeEntry['status'])}
        >
          <option value="Anwesend">Anwesend</option>
          <option value="Krank">Krank</option>
          <option value="Urlaub">Urlaub</option>
        </SelectField>
      </FormGrid>

      {alreadyBooked && (
        <p
          className="rounded border border-warning/30 bg-warning-bg px-3 py-2 text-sm font-medium text-warning"
          role="alert"
        >
          Für diesen Tag existiert bereits ein Eintrag. Bitte den bestehenden bearbeiten.
        </p>
      )}
      {holidayName && (
        <p className="rounded border border-info/30 bg-info-bg px-3 py-2 text-sm text-info">
          Hinweis: {holidayName} — gesetzlicher Feiertag.
        </p>
      )}
      {!showWorkFields && (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
          {status}: Es werden keine Arbeitszeiten erfasst. Der Tag wird als voller
          Solltag gutgeschrieben.
        </p>
      )}

      {showWorkFields && (
        <>
          <FormGrid cols={3}>
            <InputField
              id="startTime"
              label="Von"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
            <InputField
              id="endTime"
              label="Bis"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
            <InputField
              id="break"
              label="Pause (Min.)"
              type="number"
              min="0"
              value={breakDuration}
              onChange={(e) => setBreakDuration(e.target.value)}
              required
            />
          </FormGrid>

          {canHaveProject && (
            <>
              <SelectField
                id="project"
                label="Baustelle"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                required
              >
                <option value="">— bitte wählen —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectNumber}>
                    {p.customerName} ({p.projectNumber})
                  </option>
                ))}
              </SelectField>

              <FormGrid>
                <InputField
                  id="travelTime"
                  label="Wegzeit (Min.)"
                  type="number"
                  min="0"
                  value={travelTime}
                  onChange={(e) => setTravelTime(e.target.value)}
                />
                <InputField
                  id="vehiclePlate"
                  label="Fahrzeug (Kennzeichen)"
                  value={vehiclePlate}
                  placeholder="WZ-..."
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                />
              </FormGrid>
            </>
          )}
        </>
      )}

      <InputField
        id="comment"
        label="Kommentar / Tätigkeiten"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {canHaveProject && showWorkFields && (
        <>
          <CheckboxField
            id="isHelper"
            label="Einsatz als Helfer (zählt nicht zum Projekt-Budget)"
            checked={isHelper}
            onChange={(e) => setIsHelper(e.target.checked)}
          />
          <InputField
            id="helperName"
            label="Name des Helfers (optional)"
            value={helperName}
            onChange={(e) => setHelperName(e.target.value)}
          />
        </>
      )}

      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={saving} disabled={alreadyBooked} className="w-full sm:w-auto">
          {isEdit ? 'Änderungen speichern' : 'Zeit buchen'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="w-full sm:w-auto">
            Abbrechen
          </Button>
        )}
      </div>
    </form>
  );
}
