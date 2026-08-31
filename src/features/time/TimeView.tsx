import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeOwnEntries, deleteTimeEntry } from '@/lib/db/timeEntries';
import { getUserByUid } from '@/lib/db/users';
import { calcWorkMin, fmtMin, calcOverallSaldo, getISOWeek } from '@/lib/time';
import type { WithId } from '@/lib/db/core';
import type { TimeEntry, AppUser } from '@/types';
import Card from '@/components/Card';
import Metric from '@/components/Metric';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** Wochenschlüssel 'KW n / JJJJ' für ein Datum. */
function weekKey(d: Date): string {
  const { week, year } = getISOWeek(d);
  return `KW ${week} / ${year}`;
}

/**
 * Zeiterfassung — der vertikale Schnitt (Spec §8, Phase 2): Mitarbeiter
 * erfasst -> Firestore -> hier live sichtbar, inkl. portiertem Saldo.
 */
export default function TimeView() {
  const { user } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WithId<TimeEntry> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<TimeEntry> | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getUserByUid(user.companyId, user.uid).then(setProfile).catch(() => undefined);
    const unsub = subscribeOwnEntries(
      user.companyId,
      user.uid,
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  const saldo = useMemo(
    () => (profile ? calcOverallSaldo(profile, entries) : null),
    [profile, entries],
  );

  /** Belegte Tage — Grundlage für die Doppelbuchungs-Warnung im Formular. */
  const existingDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  /**
   * Jüngster Anwesenheitseintrag mit Zeitspanne — Vorlage für „wie zuletzt".
   * Krank- und Urlaubstage taugen nicht als Vorlage, sie tragen keine Zeiten.
   */
  const lastEntry = useMemo(
    () =>
      [...entries]
        .filter((e) => e.status === 'Anwesend' && e.startTime && e.endTime)
        .sort((a, b) => b.date.localeCompare(a.date))[0],
    [entries],
  );

  // Nach Woche gruppieren, neueste zuerst.
  const byWeek = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map<string, WithId<TimeEntry>[]>();
    for (const e of sorted) {
      const key = weekKey(new Date(`${e.date}T00:00:00`));
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [entries]);

  /**
   * Summe der TATSÄCHLICH aktuellen Kalenderwoche. Vorher wurde die neueste
   * Woche mit Einträgen genommen — nach einer buchungsfreien Woche zeigte die
   * Kachel dadurch fremde Zahlen unter dem Label "Diese Woche".
   */
  const thisWeekMin = useMemo(() => {
    const key = weekKey(new Date());
    return entries
      .filter((e) => weekKey(new Date(`${e.date}T00:00:00`)) === key)
      .reduce((sum, e) => sum + calcWorkMin(e), 0);
  }, [entries]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Zeiterfassung" subtitle="Deine gebuchten Zeiten und dein Saldo" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Einträge" icon="clipboard" value={entries.length} />
        <Metric
          label="Saldo"
          icon="chart"
          tone={saldo?.hasConfig ? (saldo.saldoH >= 0 ? 'success' : 'danger') : 'default'}
          value={saldo?.hasConfig ? `${saldo.saldoH > 0 ? '+' : ''}${saldo.saldoH} h` : '—'}
          hint={saldo?.hasConfig ? 'Über-/Unterstunden' : 'Kein Startdatum konfiguriert'}
        />
        <Metric label="Diese Woche" icon="clock" value={fmtMin(thisWeekMin)} />
      </div>

      <Card title={editing ? 'Eintrag bearbeiten' : 'Neuen Eintrag erfassen'}>
        <TimeForm
          key={editing?.id ?? 'new'}
          entry={editing ?? undefined}
          existingDates={existingDates}
          lastEntry={lastEntry}
          onSaved={() => setEditing(null)}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </Card>

      <Card title="Meine Einträge">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : entries.length === 0 ? (
          <EmptyState>Noch keine Zeiteinträge erfasst.</EmptyState>
        ) : (
          <div className="space-y-6">
            {byWeek.map(([week, rows]) => {
              const weekMin = rows.reduce((sum, e) => sum + calcWorkMin(e), 0);
              return (
                <div key={week}>
                  <h3 className="mb-1 flex items-center justify-between text-sm font-semibold text-ink-muted">
                    <span>{week}</span>
                    <span className="font-mono">{fmtMin(weekMin)}</span>
                  </h3>
                  <List>
                    {rows.map((e) => {
                      // Sprach-/Stundeneinträge haben keine Start-/Endzeit -> nicht "undefined–undefined" zeigen.
                      const timeLabel =
                        e.status === 'Anwesend'
                          ? e.startTime && e.endTime
                            ? `${e.startTime}–${e.endTime}`
                            : null
                          : e.status;
                      const subtitle = [timeLabel, e.comment].filter(Boolean).join(' · ');
                      return (
                        <ListRow
                          key={e.id}
                          title={
                            <span>
                              {e.date}
                              {e.customerName && ` · ${e.customerName}`}
                            </span>
                          }
                          subtitle={
                            <>
                              {subtitle}
                              {e.lastEditedBy && (
                                <span className="mt-0.5 block text-xs text-ink-muted">
                                  Bearbeitet von {e.lastEditedBy}
                                </span>
                              )}
                            </>
                          }
                        >
                          {e.source === 'voice' && <Badge tone="info">KI</Badge>}
                          {e.isHelper && <Badge tone="warning">Helfer</Badge>}
                          {e.isEmergency && <Badge tone="danger">Notdienst</Badge>}
                          {e.isNightWork && <Badge tone="info">Nacht</Badge>}
                          <span className="font-mono font-medium text-ink">
                            {fmtMin(calcWorkMin(e))}
                          </span>
                          {/* Verrechnete Einträge sind Grundlage einer
                              verschickten Rechnung und bleiben gesperrt. */}
                          {e.isBilled ? (
                            <Badge tone="gray">verrechnet</Badge>
                          ) : (
                            <>
                              <Button variant="ghost" onClick={() => setEditing(e)}>
                                Bearbeiten
                              </Button>
                              <Button variant="ghost" onClick={() => setToDelete(e)}>
                                Löschen
                              </Button>
                            </>
                          )}
                        </ListRow>
                      );
                    })}
                  </List>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={toDelete ? `Der Eintrag vom ${toDelete.date} wird endgültig entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            if (editing?.id === toDelete.id) setEditing(null);
            await deleteTimeEntry(toDelete.id);
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
