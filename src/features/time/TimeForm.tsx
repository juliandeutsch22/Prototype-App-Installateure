import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { listActiveProjects } from '@/lib/db/projects';
import {
  createTimeEntry,
  updateTimeEntry,
  findEntryForDate,
  DuplicateEntryError,
} from '@/lib/db/timeEntries';
import { todayStr, getAustrianHolidayName } from '@/lib/time';
import { istAussendienst, canExtendTimeEntry } from '@/lib/permissions';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import Icon from '@/components/Icon';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { writeWithOfflineNotice, queuedMessage } from '@/lib/offlineWrite';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry, Role } from '@/types';

/** Amtliches Praefix des Fuhrparks; im Feld steht nur der Rest. */
const PLATE_PREFIX = 'WZ-';

/**
 * Entfernt ein eingetipptes Praefix wieder. Wer „WZ-12345A" aus der Zwischen-
 * ablage einfuegt, soll nicht „WZ-WZ-12345A" bekommen — und der Bindestrich
 * allein wird ebenso geschluckt.
 */
function stripPlatePrefix(v: string): string {
  return v.toUpperCase().replace(/^\s*W\s*Z\s*-?\s*/, '').replace(/^-/, '');
}

interface Props {
  onSaved: () => void;
  /** Gesetzt = Bearbeiten statt Neuanlage. */
  entry?: WithId<TimeEntry>;
  onCancel?: () => void;
  /**
   * Bereits belegte Tage (YYYY-MM-DD) für die Doppelbuchungs-Warnung.
   *
   * Nur noch eine Abkürzung für Tage, die die aufrufende Ansicht ohnehin
   * geladen hat. Die verlässliche Prüfung fragt beim gewählten Datum direkt
   * nach — siehe `belegt` weiter unten.
   */
  existingDates?: Set<string>;
  /**
   * Rolle des Eintrags-EIGENTÜMERS. Steuert, ob Projekt-/Helferfelder gelten.
   * Beim Bearbeiten fremder Einträge zählt der Eigentümer, nicht der Bearbeiter
   * (Legacy:2629-2637) — sonst verlöre ein Mitarbeiter-Eintrag seine
   * Projektzuordnung, sobald die Buchhaltung ihn korrigiert.
   */
  ownerRole?: Role;
  /**
   * Auswählbare Mitarbeiter. Gesetzt = Buchhaltung/GF erfasst FÜR jemanden;
   * dann bestimmt die Auswahl, wem der Eintrag gehört.
   */
  staff?: AppUser[];
  /**
   * Zuletzt gebuchter Eintrag — Grundlage für „wie zuletzt".
   *
   * Ein Monteur bucht rund 220 Mal im Jahr fast immer dasselbe und tippt
   * dabei jedes Mal Von, Bis, Pause und Baustelle neu. Mit Arbeitshandschuhen
   * am Telefon zählt jeder gesparte Griff.
   */
  lastEntry?: TimeEntry;
}

/** Formular zur manuellen Zeiterfassung (portiert aus der Legacy-Zeitform). */
export default function TimeForm({
  onSaved,
  entry,
  onCancel,
  existingDates,
  ownerRole,
  staff,
  lastEntry,
}: Props) {
  const { user } = useAuth();
  const toast = useToast();
  // Vorbelegung aus dem Einsatzplan ("Zeit erfassen" am geplanten Einsatz).
  // Wichtig vor allem für asHelper: ein vergessener Haken führt zum falschen
  // Stundensatz auf der Rechnung.
  const prefill = (useLocation().state ?? null) as {
    projectNumber?: string;
    asHelper?: boolean;
  } | null;
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
  const [projectNumber, setProjectNumber] = useState(entry?.projectNumber ?? prefill?.projectNumber ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [isHelper, setIsHelper] = useState(entry?.isHelper ?? prefill?.asHelper ?? false);
  const [helperName, setHelperName] = useState(entry?.helperName ?? '');
  // Zuschläge werden bewusst gesetzt, nicht aus der Uhrzeit geraten: ob ein
  // Einsatz als Nachtarbeit oder Notdienst gilt, entscheidet die Vereinbarung
  // mit dem Kunden — nicht der Zeiger auf der Uhr.
  const [isNightWork, setIsNightWork] = useState(entry?.isNightWork ?? false);
  const [isEmergency, setIsEmergency] = useState(entry?.isEmergency ?? false);
  const [vehiclePlate, setVehiclePlate] = useState(stripPlatePrefix(entry?.vehiclePlate ?? ''));
  /** Für wen wird gebucht (nur wenn `staff` gesetzt ist). */
  const [targetUid, setTargetUid] = useState(entry?.userId ?? '');

  const target = staff?.find((u) => u.uid === targetUid);
  // Beim Erfassen für jemand anderen zählt DESSEN Rolle für die
  // Projektfelder — sonst bekäme ein Monteur-Eintrag keine Baustelle.
  const effectiveRole = ownerRole ?? target?.role ?? user?.role;

  /**
   * Die volle Erfassung — Baustelle, Wegzeit, Fahrzeug, Helfer, Zuschläge.
   *
   * Für den Monteur immer: das ist seine tägliche Arbeit. Für alle anderen
   * ist das Formular schlank — Datum, Status, Von-Bis, Pause, Kommentar —
   * denn Verwaltung und Buchhaltung fahren nicht raus, und jedes Feld, das
   * nie ausgefüllt wird, ist eine Fehlerquelle.
   *
   * Geschäftsführung, Projektleitung und Administrator können die vollen
   * Felder DAZUSCHALTEN. Springt jemand von ihnen für einen Notdienst ein,
   * landete der Einsatz vorher ohne Baustelle und ohne Zuschlag in den Daten
   * — er fehlte damit auf der Rechnung und im Budget der Baustelle, ohne dass
   * es jemandem auffiel. Der Administrator wiederum bekam bisher IMMER das
   * volle Formular, weil `isMitarbeiter` ihn als Superuser einschließt.
   */
  const aussendienst = effectiveRole ? istAussendienst(effectiveRole) : false;
  const darfErweitern = effectiveRole ? canExtendTimeEntry(effectiveRole) : false;
  const [erweitert, setErweitert] = useState(
    // Beim Bearbeiten aufklappen, wenn der Eintrag erweiterte Angaben TRÄGT —
    // sonst wären sie unsichtbar und würden beim Speichern stillschweigend
    // gelöscht.
    () =>
      !!entry &&
      !!(entry.projectNumber || entry.isEmergency || entry.isNightWork || entry.isHelper),
  );
  const canHaveProject = aussendienst || (darfErweitern && erweitert);
  const showWorkFields = status === 'Anwesend';

  useEffect(() => {
    if (!user || !canHaveProject) return;
    listActiveProjects(user.companyId)
      .then(setProjects)
      .catch(() => setError('Projekte konnten nicht geladen werden.'));
  }, [user, canHaveProject]);

  // Live-Hinweise zum gewählten Datum (Legacy:2234-2269).
  const holidayName = useMemo(() => getAustrianHolidayName(new Date(`${date}T00:00:00`)), [date]);
  /**
   * Ist der gewählte Tag schon belegt?
   *
   * Vorher galt die Prüfung nur beim Anlegen (`!isEdit`). Damit liess sich
   * ein bestehender Eintrag auf einen Tag schieben, an dem bereits gebucht
   * war — zwei Einträge am selben Tag, Saldo falsch, kein Hinweis. Der
   * eigene, unveränderte Tag zählt dabei natürlich nicht als Konflikt.
   */
  /**
   * Ist am gewaehlten Tag schon gebucht — nachgefragt statt vorgeladen.
   *
   * Vorher bekam das Formular die Menge ALLER belegten Tage uebergeben, und
   * die Ansicht musste dafuer die gesamte Buchungsgeschichte des Mitarbeiters
   * laden. Bei einem Fenster von ein paar Monaten waere die Warnung fuer
   * jeden Tag ausserhalb stillschweigend ausgeblieben: das Formular haette
   * gemeldet „frei", das Speichern waere dann an der serverseitigen Sperre
   * gescheitert — mit einer Fehlermeldung statt einer Vorwarnung.
   *
   * Die gezielte Abfrage kostet ein Dokument und ist unabhaengig davon, wie
   * lange jemand im Betrieb ist. `existingDates` bleibt als sofortige Antwort
   * fuer die Tage, die die Ansicht ohnehin geladen hat.
   */
  const [belegtServer, setBelegtServer] = useState<boolean | null>(null);
  const besitzerUid = targetUid || entry?.userId || user?.uid;
  useEffect(() => {
    if (!user || !besitzerUid || !date) return;
    if (date === entry?.date) {
      setBelegtServer(false);
      return;
    }
    if (existingDates?.has(date)) {
      setBelegtServer(true);
      return;
    }
    let verworfen = false;
    setBelegtServer(null);
    findEntryForDate(user.companyId, besitzerUid, date, entry?.id)
      .then((treffer) => {
        if (!verworfen) setBelegtServer(!!treffer);
      })
      // Faellt die Abfrage aus, bleibt die serverseitige Sperre beim
      // Speichern. Eine ausgebliebene VORwarnung darf das Formular nicht
      // blockieren.
      .catch(() => {
        if (!verworfen) setBelegtServer(false);
      });
    return () => {
      verworfen = true;
    };
  }, [user, besitzerUid, date, entry?.date, entry?.id, existingDates]);

  const alreadyBooked = useMemo(
    () => belegtServer === true && date !== entry?.date,
    [belegtServer, date, entry?.date],
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

    if (entry?.isBilled) {
      setError('Verrechnete Einträge können nicht geändert werden.');
      return;
    }
    if (staff && !isEdit && !targetUid) {
      setError('Bitte einen Mitarbeiter auswählen.');
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
        // Gespeichert wird IMMER mit Praefix, damit Exporte und die
        // Fahrzeugsuche ein einheitliches Format vorfinden.
        vehiclePlate: canHaveProject && vehiclePlate ? PLATE_PREFIX + vehiclePlate : '',
        helperName: canHaveProject ? helperName : '',
        comment,
        isHelper: canHaveProject ? isHelper : false,
        isNightWork: canHaveProject && showWorkFields ? isNightWork : false,
        isEmergency: canHaveProject && showWorkFields ? isEmergency : false,
      };

      if (isEdit) {
        // userId/userName bleiben unangetastet — der Eintrag gehört weiter dem
        // Mitarbeiter, auch wenn die Buchhaltung ihn korrigiert (Legacy:2700-2706).
        const audit =
          entry.userId !== user.uid
            ? { lastEditedBy: user.name, lastEditedByUid: user.uid, lastEditedAt: Date.now() }
            : {};
        const stand = await writeWithOfflineNotice(
          // Geprüft wird gegen die Tage des EIGENTÜMERS, nicht gegen die des
          // Bearbeiters — die Buchhaltung korrigiert fremde Einträge.
          updateTimeEntry(
            entry.id,
            { ...payload, ...audit },
            { companyId: user.companyId, userId: entry.userId },
          ),
        );
        if (stand === 'queued') toast.info(queuedMessage('Änderung übernommen'));
        else toast.success('Eintrag aktualisiert');
      } else {
        // Beim Erfassen für jemand anderen gehört der Eintrag DEM Mitarbeiter,
        // nicht dem Erfassenden — sonst stünde er im falschen Zeitkonto.
        const owner = target ?? { uid: user.uid, name: user.name };
        const stand = await writeWithOfflineNotice(
          createTimeEntry(user.companyId, {
            ...payload,
            userId: owner.uid,
            userName: owner.name,
            source: 'manual',
            ...(target
              ? { lastEditedBy: user.name, lastEditedByUid: user.uid, lastEditedAt: Date.now() }
              : {}),
          }),
        );
        if (stand === 'queued') toast.info(queuedMessage('Zeit gebucht'));
        else toast.success(target ? `Zeit für ${target.name} gebucht` : 'Zeit gebucht');
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

  const billed = !!entry?.isBilled;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Bereits verrechnete Einträge sind die Grundlage einer verschickten
          Rechnung — eine Änderung würde den Beleg nachträglich verfälschen. */}
      {billed && (
        <p className="rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning" role="alert">
          Dieser Eintrag ist mit Rechnung {entry?.invoiceNumber || '—'} verrechnet und kann nicht
          mehr geändert werden. Dafür muss zuerst die Rechnung storniert werden.
        </p>
      )}

      {/* Ein Griff statt sieben: übernimmt Zeiten, Pause und Baustelle vom
          letzten Eintrag. Nur beim Neuanlegen — beim Bearbeiten würde der
          Knopf die zu korrigierenden Werte gerade überschreiben. */}
      {!isEdit && lastEntry && lastEntry.startTime && lastEntry.endTime && (
        <button
          type="button"
          onClick={() => {
            setStatus('Anwesend');
            setStartTime(lastEntry.startTime ?? startTime);
            setEndTime(lastEntry.endTime ?? endTime);
            setBreakDuration(String(lastEntry.breakDuration ?? 30));
            if (canHaveProject) {
              setProjectNumber(lastEntry.projectNumber ?? '');
              setVehiclePlate(stripPlatePrefix(lastEntry.vehiclePlate ?? ''));
              setIsHelper(!!lastEntry.isHelper);
            }
          }}
          className="flex min-h-touch w-full items-center gap-2 rounded border border-dashed border-brand/40 bg-info-bg px-3 py-2 text-left text-sm font-medium text-brand transition hover:border-brand active:scale-[0.99]"
        >
          <Icon name="clock" size={18} className="shrink-0" />
          <span className="min-w-0 truncate">
            Wie zuletzt: {lastEntry.startTime}–{lastEntry.endTime}
            {lastEntry.customerName ? ` · ${lastEntry.customerName}` : ''}
          </span>
        </button>
      )}

      {staff && !isEdit && (
        <SelectField
          id="targetUser"
          label="Mitarbeiter"
          value={targetUid}
          onChange={(e) => setTargetUid(e.target.value)}
          required
        >
          <option value="">— wählen —</option>
          {staff.map((u) => (
            <option key={u.uid} value={u.uid}>{u.name}</option>
          ))}
        </SelectField>
      )}

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

          {/*
            Der Umschalter steht VOR den Feldern, die er ein- und ausblendet,
            und nur dort, wo er etwas bewirkt. Ein Monteur sieht ihn nicht —
            für ihn gibt es nichts umzuschalten.
          */}
          {darfErweitern && !aussendienst && (
            <div className="rounded-sm border border-line bg-surface-2 p-3">
              <CheckboxField
                id="erweitert"
                label="Erweiterte Erfassung (Baustelle, Wegzeit, Fahrzeug, Zuschläge)"
                checked={erweitert}
                onChange={(e) => setErweitert(e.target.checked)}
              />
              <p className="mt-1 text-sm text-ink-muted">
                Für Notdienste und Einsätze auf der Baustelle. Ohne diese Angaben zählt die Zeit
                nicht ins Baustellenbudget und erscheint auf keiner Rechnung.
              </p>
              {/*
                Abschalten an einem Eintrag, der die Angaben TRÄGT, löscht sie
                beim Speichern. Das ist die richtige Folge — aber nicht, wenn
                es unbemerkt passiert: die Baustelle verlöre ihre Stunden und
                die Rechnung eine Position, ohne dass jemand es merkt.
              */}
              {!erweitert && entry && (entry.projectNumber || entry.isEmergency || entry.isNightWork) && (
                <p className="mt-2 rounded-sm border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
                  Dieser Eintrag hat eine Baustelle oder Zuschläge hinterlegt. Speichern ohne
                  erweiterte Erfassung entfernt sie.
                </p>
              )}
            </div>
          )}

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
                {/* „WZ-" fest davor statt als Platzhalter: der Fuhrpark ist
                    in Wiener Neustadt zugelassen, und getippt wurde es bisher
                    mal mit, mal ohne Bindestrich, mal gar nicht. Dieselbe
                    Lösung wie im Prototyp (Zeile 940). */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="vehiclePlate" className="text-sm font-medium text-ink">
                    Fahrzeug (Kennzeichen)
                  </label>
                  <div className="flex">
                    <span
                      aria-hidden
                      className="flex min-h-touch shrink-0 items-center rounded-l border border-r-0 border-line bg-surface-2 px-3 font-medium text-ink-muted"
                    >
                      WZ-
                    </span>
                    <input
                      id="vehiclePlate"
                      className="min-h-touch w-full rounded-r border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand"
                      placeholder="12345A"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(stripPlatePrefix(e.target.value))}
                    />
                  </div>
                </div>
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

          <fieldset className="rounded-sm border border-line bg-surface-2 p-3">
            <legend className="px-1 section-label">Zuschläge</legend>
            <CheckboxField
              id="isNightWork"
              label="Nachtarbeit"
              checked={isNightWork}
              onChange={(e) => setIsNightWork(e.target.checked)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <CheckboxField
                id="isEmergency"
                label="Notdienst / Störungseinsatz"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
              />
              <InfoHint about="Notdienst">
                Nur ankreuzen, wenn der Zuschlag wirklich verrechnet wird. Die Höhe legt die
                Geschäftsführung in den Einstellungen fest.
              </InfoHint>
            </div>
          </fieldset>
        </>
      )}

      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={saving} disabled={alreadyBooked || billed} className="w-full sm:w-auto">
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
