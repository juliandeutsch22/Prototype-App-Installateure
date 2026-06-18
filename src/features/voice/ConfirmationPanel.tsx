import { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { createTimeEntry } from '@/lib/db/timeEntries';
import { createMaterialOrder } from '@/lib/db/materialOrders';
import { createFollowUp } from '@/lib/db/followUps';
import { todayStr } from '@/lib/time';
import { InputField, SelectField, CheckboxField } from '@/components/Field';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import { useToast } from '@/components/Toast';
import { ErrorState } from '@/components/States';
import type { VoiceExtractResponse } from './types';

interface MaterialRow {
  name: string;
  qty: number;
  needsReview: boolean;
}

/**
 * Bestätigungs-UI des Magic-Moments (Spec §9): vorausgefüllte, EDITIERBARE
 * Karten. Unsichere Felder sind markiert; nichts wird ohne expliziten
 * "Bestätigen"-Klick nach Firestore geschrieben.
 */
export default function ConfirmationPanel({
  result,
  onDone,
}: {
  result: VoiceExtractResponse;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const ext = result.extraction;

  // Editierbarer Zustand, vorbefüllt aus der Extraktion.
  const [includeTime, setIncludeTime] = useState(true);
  const [hours, setHours] = useState(String(ext.time.hours || ''));

  const [projectNumber, setProjectNumber] = useState(
    result.projectMatches.length === 1 ? result.projectMatches[0].projectNumber : '',
  );

  const [materials, setMaterials] = useState<MaterialRow[]>(ext.materials);

  const [includeFollowUp, setIncludeFollowUp] = useState(Boolean(ext.followUp.title));
  const [followUpTitle, setFollowUpTitle] = useState(ext.followUp.title);
  const [followUpWeek, setFollowUpWeek] = useState(ext.followUp.dueWeek);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ambiguousProject = result.projectMatches.length > 1 && !projectNumber;

  async function confirm() {
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const customerName =
        result.projectMatches.find((p) => p.projectNumber === projectNumber)?.customerName ?? '';

      const writes: Promise<unknown>[] = [];

      if (includeTime && Number(hours) > 0) {
        writes.push(
          createTimeEntry(user.companyId, {
            date: todayStr(),
            status: 'Anwesend',
            hours: Number(hours),
            projectNumber,
            customerName,
            comment: ext.summary,
            userId: user.uid,
            userName: user.name,
            source: 'voice',
          }),
        );
      }

      for (const m of materials) {
        if (!m.name.trim() || m.qty <= 0) continue;
        writes.push(
          createMaterialOrder(user.companyId, {
            materialId: '',
            materialName: m.name,
            quantity: m.qty,
            projectNumber,
            status: 'Offen',
            transactionType: 'order',
            userId: user.uid,
            userName: user.name,
            source: 'voice',
          }),
        );
      }

      if (includeFollowUp && followUpTitle.trim()) {
        writes.push(
          createFollowUp(user.companyId, {
            title: followUpTitle,
            dueWeek: followUpWeek,
            projectNumber,
            createdFrom: 'voice',
            done: false,
          }),
        );
      }

      await Promise.all(writes);
      toast.success('Gespeichert');
      onDone();
    } catch {
      setError('Das Speichern hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Gesprochener Text — farblich mit den Karten verknüpft (Akzentkante). */}
      <Card className="border-l-4 border-l-accent">
        <p className="text-sm font-medium text-accent">Erkannt</p>
        <p className="mt-1 italic text-ink">„{result.transcript}"</p>
      </Card>

      {/* Projekt-Zuordnung */}
      <Card title="Baustelle">
        {result.projectMatches.length === 0 ? (
          <p className="mb-2 text-sm text-ink-muted">
            Kein eindeutiges Projekt zu „{ext.projectSpokenName || '—'}" gefunden — bitte wählen.
          </p>
        ) : null}
        <SelectField
          id="vproject"
          label={ambiguousProject ? 'Mehrdeutig — bitte wählen' : 'Baustelle'}
          value={projectNumber}
          onChange={(e) => setProjectNumber(e.target.value)}
        >
          <option value="">— keine —</option>
          {result.projectMatches.map((p) => (
            <option key={p.projectNumber} value={p.projectNumber}>
              {p.customerName} ({p.projectNumber})
            </option>
          ))}
        </SelectField>
      </Card>

      {/* Zeit-Karte */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CheckboxField
            id="vincludeTime"
            label={<span className="font-semibold text-ink">Zeit</span>}
            checked={includeTime}
            onChange={(e) => setIncludeTime(e.target.checked)}
          />
          {ext.time.needsReview && <Badge tone="warning">bitte prüfen</Badge>}
        </div>
        {includeTime && (
          <InputField
            id="vhours"
            label="Stunden"
            type="number"
            step="0.25"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        )}
      </Card>

      {/* Material-Karten */}
      <Card title="Material">
        {materials.length === 0 ? (
          <p className="text-sm text-ink-muted">Kein Material erkannt.</p>
        ) : (
          <ul className="space-y-3">
            {materials.map((m, i) => (
              <li key={i} className="flex items-end gap-2">
                <InputField
                  id={`mat-${i}`}
                  label="Bezeichnung"
                  className="flex-1"
                  value={m.name}
                  onChange={(e) =>
                    setMaterials((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <InputField
                  id={`qty-${i}`}
                  label="Menge"
                  type="number"
                  min="0"
                  className="w-24"
                  value={String(m.qty)}
                  onChange={(e) =>
                    setMaterials((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, qty: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
                {m.needsReview && <Badge tone="warning">prüfen</Badge>}
                <IconButton
                  label="Entfernen"
                  tone="danger"
                  onClick={() => setMaterials((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Folgetermin-Karte */}
      <Card>
        <div className="mb-2">
          <CheckboxField
            id="vincludeFollowUp"
            label={<span className="font-semibold text-ink">Folgetermin</span>}
            checked={includeFollowUp}
            onChange={(e) => setIncludeFollowUp(e.target.checked)}
          />
        </div>
        {includeFollowUp && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InputField
              id="futitle"
              label="Titel"
              value={followUpTitle}
              onChange={(e) => setFollowUpTitle(e.target.value)}
            />
            <InputField
              id="fuweek"
              label="Zeitraum"
              value={followUpWeek}
              onChange={(e) => setFollowUpWeek(e.target.value)}
            />
          </div>
        )}
      </Card>

      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={confirm} loading={saving} disabled={ambiguousProject} className="flex-1">
          Bestätigen & speichern
        </Button>
        <Button variant="secondary" onClick={onDone} className="flex-1">
          Verwerfen
        </Button>
      </div>
      {ambiguousProject && (
        <p className="text-sm text-warning">Bitte zuerst die Baustelle eindeutig wählen.</p>
      )}
    </div>
  );
}
