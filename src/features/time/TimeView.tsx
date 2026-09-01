import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeOwnEntriesInRange,
  listOwnEntriesSince,
  deleteTimeEntry,
} from '@/lib/db/timeEntries';
import { getUserByUid } from '@/lib/db/users';
import {
  calcWorkMin,
  fmtMin,
  calcOverallSaldo,
  saldoAusBilanzen,
  getISOWeek,
  localDateStr,
  todayStr,
} from '@/lib/time';
import { shouldShowOvertime } from '@/lib/permissions';
import { bilanzMarker, listBilanzen, monatVon, type Monatsbilanz } from '@/lib/db/monatsbilanzen';
import type { WithId } from '@/lib/db/core';
import type { TimeEntry, AppUser } from '@/types';
import Card from '@/components/Card';
import Metric, { MetricRow } from '@/components/Metric';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';

/** Wie viele Monate die Liste zunaechst zurueckreicht. */
const MONATE_JE_SEITE = 3;

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
  /** Die angezeigte Liste — nur das Fenster, nicht die ganze Geschichte. */
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WithId<TimeEntry> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<TimeEntry> | null>(null);
  /** Wie viele Monate zurück die Liste reicht. */
  const [monate, setMonate] = useState(MONATE_JE_SEITE);

  useEffect(() => {
    if (!user) return;
    getUserByUid(user.companyId, user.uid).then(setProfile).catch(() => undefined);
  }, [user]);

  /**
   * Die ANGEZEIGTEN Eintraege: ein Fenster von einigen Monaten, live.
   *
   * Vorher abonnierte diese Ansicht jede Buchung des Mitarbeiters seit
   * Eintritt und hielt sie im Speicher, um die letzten Wochen darzustellen.
   * Nach zehn Jahren sind das rund 2.200 Dokumente in einem dauerhaft
   * offenen Abo, das bei jeder Aenderung nachlaedt.
   */
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const bis = todayStr();
    const ab = new Date();
    ab.setMonth(ab.getMonth() - monate);
    return subscribeOwnEntriesInRange(
      user.companyId,
      user.uid,
      localDateStr(ab),
      bis,
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [user, monate]);

  /**
   * Der Saldo — aus MONATSBILANZEN, wenn sie nachweislich vollständig sind.
   *
   * Er läuft seit dem ersten Arbeitstag und braucht deshalb als einzige Zahl
   * im Programm wirklich jede Buchung. Nach zehn Dienstjahren sind das rund
   * 2.200 Dokumente bei jedem Aufruf. Die Bilanzen verdichten das auf eine
   * Zeile je Monat: 120 statt 2.200.
   *
   * DER RÜCKFALL IST DIE EIGENTLICHE ARBEIT. Eine fehlende Bilanz ist von
   * einem Monat ohne Buchungen nicht zu unterscheiden. Wer sie ungeprüft
   * summiert, bekommt bei lückenhaftem Bestand einen zu niedrigen Saldo —
   * ohne Fehlermeldung, ohne Hinweis, und die Zahl steht auf dem Lohnzettel.
   *
   * Deshalb wird nur gerechnet, wenn der Marker bestätigt, dass die Bilanzen
   * ab dem Eintrittsmonat lückenlos vorliegen. Sonst: der alte, direkte Weg.
   * Langsamer und richtig — in dieser Reihenfolge zu bewerten.
   *
   * Der LAUFENDE Monat kommt in beiden Fällen aus den echten Einträgen. Er
   * ändert sich noch, und der Trigger braucht einen Augenblick; ein Monteur,
   * der gerade gebucht hat und seinen Saldo unverändert sähe, würde zu Recht
   * an der App zweifeln.
   */
  const [saldoEintraege, setSaldoEintraege] = useState<WithId<TimeEntry>[]>([]);
  const [bilanzen, setBilanzen] = useState<Monatsbilanz[] | null>(null);
  const [laufendeEintraege, setLaufendeEintraege] = useState<WithId<TimeEntry>[]>([]);

  useEffect(() => {
    if (!user || !profile?.appStartDate) return;
    let verworfen = false;
    const eintritt = profile.appStartDate;

    (async () => {
      const marker = await bilanzMarker(user.companyId, user.uid).catch(() => null);
      // Der Marker muss den Eintrittsmonat MITABDECKEN. Deckt er erst einen
      // späteren ab, fehlt der Anfang — und damit wäre der Saldo zu niedrig.
      const brauchbar = !!marker && marker.vollstaendigAb <= monatVon(eintritt);

      if (brauchbar) {
        const jetzt = new Date();
        const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
        const [rows, laufend] = await Promise.all([
          listBilanzen(user.companyId, user.uid, monatVon(eintritt)),
          listOwnEntriesSince(user.companyId, user.uid, monatsErster),
        ]);
        if (verworfen) return;
        setBilanzen(rows);
        setLaufendeEintraege(laufend);
        setSaldoEintraege([]);
      } else {
        const rows = await listOwnEntriesSince(user.companyId, user.uid, eintritt);
        if (verworfen) return;
        setBilanzen(null);
        setSaldoEintraege(rows);
      }
    })().catch(() => undefined);

    return () => {
      verworfen = true;
    };
    // `entries` als Ausloeser: nach dem Buchen oder Loeschen muss der Saldo
    // neu gerechnet werden, sonst steht dort bis zum Neuladen der alte Wert.
  }, [user, profile?.appStartDate, entries]);

  const saldo = useMemo(() => {
    if (!profile) return null;
    return bilanzen
      ? saldoAusBilanzen(profile, bilanzen, laufendeEintraege)
      : calcOverallSaldo(profile, saldoEintraege);
  }, [profile, bilanzen, laufendeEintraege, saldoEintraege]);

  /**
   * Belegte Tage aus dem geladenen Fenster — die SOFORTIGE Antwort auf die
   * Doppelbuchungs-Frage. Fuer Tage ausserhalb fragt das Formular gezielt
   * beim Server nach.
   */
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

      <MetricRow>
        <Metric
          label="Einträge"
          value={entries.length}
          hint={`letzte ${monate} Monate`}
        />
        {/* Dieselbe Zahl wie auf dem Dashboard — und deshalb auch mit
            demselben Vorbehalt. Ein Saldo aus Tagen, an denen gar nichts
            gebucht wurde, ist kein Befund über den Mitarbeiter, sondern eine
            Datenlücke; rot dargestellt behauptete er das Gegenteil. */}
        {/*
          Die Saldo-Kachel nur fuer Rollen, die ein Zeitkonto FUEHREN.
          Geschaeftsfuehrung und Projektleitung haben kein Soll/Ist — bei
          ihnen stand dort dauerhaft „—  Kein Startdatum konfiguriert", was
          wie ein Einrichtungsfehler aussieht, den niemand beheben kann.
          Buchen koennen sie trotzdem, etwa fuer einen Notdienst.
        */}
        {shouldShowOvertime(user.role) && (
        <Metric
          label="Saldo"
          tone={
            !saldo?.hasConfig
              ? 'default'
              : saldo.daysWithoutEntry > 0
                ? 'warning'
                : saldo.saldoH >= 0
                  ? 'success'
                  : 'danger'
          }
          value={saldo?.hasConfig ? `${saldo.saldoH > 0 ? '+' : ''}${saldo.saldoH} h` : '—'}
          hint={
            !saldo?.hasConfig
              ? 'Kein Startdatum konfiguriert'
              : saldo.daysWithoutEntry > 0
                ? `${saldo.daysWithoutEntry} Tage ohne Buchung — unvollständig`
                : 'Über-/Unterstunden'
          }
        />
        )}
        <Metric label="Diese Woche" value={fmtMin(thisWeekMin)} />
      </MetricRow>

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
          <SkeletonList rows={5} />
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
                    <span className="tnum">{fmtMin(weekMin)}</span>
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
                                <span className="mt-1 block text-xs text-ink-muted">
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
                          <span className="tnum font-medium text-ink">
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
        {/*
          Nachladen weitet das ZEITFENSTER der Abfrage, statt mehr von einer
          ohnehin vollstaendig geladenen Liste freizugeben. Der Saldo oben
          bleibt davon unberuehrt — er rechnet immer ab Eintritt.
        */}
        {!loading && !error && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setMonate((m) => m + MONATE_JE_SEITE)}>
              Ältere Einträge laden
            </Button>
            <span className="text-sm text-ink-muted">
              Angezeigt werden die letzten {monate} Monate.
            </span>
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
