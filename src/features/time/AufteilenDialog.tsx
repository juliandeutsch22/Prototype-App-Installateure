import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import BaustellenSelect from '@/components/BaustellenSelect';
import { InputField } from '@/components/Field';
import Hinweiszeile from '@/components/Hinweiszeile';
import { listAssignmentsForUserInRange } from '@/lib/db/assignments';
import { listWorkSheetsInRange } from '@/lib/db/workSheets';
import { zeitAufteilen } from '@/lib/db/timeEntries';
import { fmtMin, normProjectNumber } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { TimeEntry } from '@/types';
import { aufteilung, type AufteilZeile } from './aufteilen';

/**
 * DIE BUCHUNG AUF MEHRERE BAUSTELLEN AUFTEILEN (10.10.2026).
 *
 * Der Monteur bucht seinen Tag am Stück und verteilt danach: je weitere
 * Baustelle die Stunden. Vorgeschlagen werden die Baustellen, auf denen er an
 * dem Tag eingeteilt war (Einsatzplan) und für die er an dem Tag einen
 * Handwerksschein geschrieben hat — mit leeren Stunden; eine Zeile ohne
 * Stunden wird nicht gebucht. Die Uhrzeiten, die entstehen, stehen darunter,
 * bevor gespeichert wird.
 */
export default function AufteilenDialog({
  entry,
  companyId,
  open,
  onCancel,
  onDone,
}: {
  entry: WithId<TimeEntry>;
  companyId: string;
  open: boolean;
  onCancel: () => void;
  onDone: (anzahl: number) => void;
}) {
  const [zeilen, setZeilen] = useState<AufteilZeile[]>([{ projectNumber: '', stunden: '' }]);
  /*
    HAT JEMAND SCHON EINGETRAGEN, BLEIBT ES STEHEN. Die Vorschläge kommen aus
    zwei Abfragen; wer schneller wählt, als sie antworten, verlor sonst seine
    Wahl an die Vorschlagsliste (gefunden vom Durchklick-Test).
  */
  const angefasst = useRef(false);

  /*
    VORSCHLÄGE OHNE ZWANG. Scheitert eine der beiden Abfragen, fehlt nur der
    Vorschlag — eine Baustelle lässt sich trotzdem wählen.
  */
  useEffect(() => {
    if (!open) return;
    let verworfen = false;
    const eigene = normProjectNumber(entry.projectNumber);
    Promise.all([
      listAssignmentsForUserInRange(companyId, entry.userId, entry.date, entry.date).catch(() => []),
      listWorkSheetsInRange(companyId, entry.date, entry.date).catch(() => []),
    ]).then(([einsaetze, scheine]) => {
      if (verworfen || angefasst.current) return;
      const nummern: string[] = [];
      const dazu = (nr?: string) => {
        const n = (nr ?? '').trim();
        if (!n || normProjectNumber(n) === eigene || nummern.some((x) => normProjectNumber(x) === normProjectNumber(n))) return;
        nummern.push(n);
      };
      einsaetze.forEach((a) => dazu(a.projectNumber));
      /*
        WESSEN SCHEIN: wer ihn schrieb, oder wer in seinen Zeitzeilen steht —
        das Büro schreibt Scheine auch für Monteure nach (wie
        `offeneNachtraege`, über den Namen).
      */
      const name = (n?: string) => (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ich = name(entry.userName);
      scheine
        .filter((s) => s.status !== 'Verworfen')
        .filter((s) => s.erstelltVonUid === entry.userId || (!!ich && (s.zeiten ?? []).some((z) => name(z.mitarbeiter) === ich)))
        .forEach((s) => dazu(s.projectNumber));
      setZeilen(nummern.length ? nummern.map((projectNumber) => ({ projectNumber, stunden: '' })) : [{ projectNumber: '', stunden: '' }]);
    });
    return () => {
      verworfen = true;
    };
  }, [open, companyId, entry.userId, entry.userName, entry.date, entry.projectNumber]);

  const a = aufteilung(entry, zeilen);
  const setzen = (i: number, teil: Partial<AufteilZeile>) => {
    angefasst.current = true;
    setZeilen((alt) => alt.map((z, k) => (k === i ? { ...z, ...teil } : z)));
  };

  return (
    <ConfirmDialog
      open={open}
      title="Auf mehrere Baustellen aufteilen"
      message={`${entry.startTime}–${entry.endTime}, ${entry.breakDuration ?? 0} Min. Pause — gebucht auf ${entry.projectNumber || 'keine Baustelle'}. Je weitere Baustelle die Stunden angeben; der Rest bleibt auf ${entry.projectNumber || 'der Buchung'}.`}
      confirmLabel="Aufteilen"
      confirmTone="primary"
      onCancel={onCancel}
      onConfirm={async () => {
        if (a.fehler) throw new Error(a.fehler);
        const neu = await zeitAufteilen(entry.id, a.teile);
        onDone(neu.length);
      }}
    >
      <div className="space-y-4">
        {zeilen.map((z, i) => (
          <div key={i} className="space-y-2 border-b border-line pb-3">
            <BaustellenSelect
              id={`aufteilen-baustelle-${i}`}
              label={`Weitere Baustelle ${i + 1}`}
              companyId={companyId}
              meineUid={entry.userId}
              value={z.projectNumber}
              onChange={(nr) => setzen(i, { projectNumber: nr })}
            />
            <div className="flex items-end gap-3">
              <InputField
                id={`aufteilen-stunden-${i}`}
                label="Stunden"
                inputMode="decimal"
                placeholder="z. B. 2,5 oder 2:30"
                value={z.stunden}
                onChange={(e) => setzen(i, { stunden: e.target.value })}
              />
              {zeilen.length > 1 && (
                <button
                  type="button"
                  className="link mb-3"
                  onClick={() => {
                    angefasst.current = true;
                    setZeilen((alt) => alt.filter((_, k) => k !== i));
                  }}
                >
                  Zeile entfernen
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="link"
          onClick={() => {
            angefasst.current = true;
            setZeilen((alt) => [...alt, { projectNumber: '', stunden: '' }]);
          }}
        >
          Weitere Baustelle
        </button>

        {a.plan.length > 1 && (
          <div>
            <p className="text-sm text-ink-muted">So wird gebucht:</p>
            <ul className="mt-1 divide-y divide-line border-y border-line text-sm">
              {a.plan.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span>{p.projectNumber || 'ohne Baustelle'}</span>
                  <span className="tabular-nums text-ink-muted">
                    {p.von}–{p.bis} · {fmtMin(p.minuten)} Std.{i === 0 && entry.breakDuration ? ` · ${entry.breakDuration} Min. Pause` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.fehler && a.teile.length + zeilen.filter((z) => z.stunden.trim()).length > 0 && (
          <Hinweiszeile stufe="warn">
            <p>{a.fehler}</p>
          </Hinweiszeile>
        )}
      </div>
    </ConfirmDialog>
  );
}
