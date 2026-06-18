import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import { createTimeEntry } from '@/lib/db/timeEntries';
import { todayStr } from '@/lib/time';
import { InputField, SelectField } from '@/components/Field';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import type { Project, TimeEntry } from '@/types';

/** Formular zur manuellen Zeiterfassung (portiert aus der Legacy-Zeitform). */
export default function TimeForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayStr());
  const [status, setStatus] = useState<TimeEntry['status']>('Anwesend');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakDuration, setBreakDuration] = useState('30');
  const [projectNumber, setProjectNumber] = useState('');
  const [comment, setComment] = useState('');
  const [isHelper, setIsHelper] = useState(false);

  useEffect(() => {
    if (!user) return;
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setError('Projekte konnten nicht geladen werden.'));
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const project = projects.find((p) => p.projectNumber === projectNumber);
      await createTimeEntry(user.companyId, {
        date,
        status,
        startTime: status === 'Anwesend' ? startTime : '',
        endTime: status === 'Anwesend' ? endTime : '',
        breakDuration: Number(breakDuration) || 0,
        projectNumber,
        customerName: project?.customerName ?? '',
        comment,
        isHelper,
        userId: user.uid,
        userName: user.name,
        source: 'manual',
      });
      onSaved();
      setComment('');
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      {status === 'Anwesend' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            id="startTime"
            label="Von"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <InputField
            id="endTime"
            label="Bis"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
          <InputField
            id="break"
            label="Pause (Min.)"
            type="number"
            min="0"
            value={breakDuration}
            onChange={(e) => setBreakDuration(e.target.value)}
          />
        </div>
      )}

      <SelectField
        id="project"
        label="Baustelle"
        value={projectNumber}
        onChange={(e) => setProjectNumber(e.target.value)}
      >
        <option value="">— keine —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.projectNumber}>
            {p.customerName} ({p.projectNumber})
          </option>
        ))}
      </SelectField>

      <InputField
        id="comment"
        label="Kommentar / Tätigkeiten"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isHelper}
          onChange={(e) => setIsHelper(e.target.checked)}
          className="h-5 w-5"
        />
        Als Helfer verrechnet
      </label>

      {error && <ErrorState message={error} />}

      <Button type="submit" loading={saving} className="w-full sm:w-auto">
        Zeit erfassen
      </Button>
    </form>
  );
}
