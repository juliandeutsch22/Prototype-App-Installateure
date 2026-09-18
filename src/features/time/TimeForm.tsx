import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  createTimeEntryOhneEmpfang,
  updateTimeEntryOhneEmpfang,
  eintraegeAmTag,
  DuplicateEntryError,
} from '@/lib/db/timeEntries';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import { todayStr, getAustrianHolidayName, fmtMin } from '@/lib/time';
import { zeitbild, zeitSatz } from './zeitPlausibilitaet';
import { istAussendienst, canExtendTimeEntry } from '@/lib/permissions';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import Icon from '@/components/Icon';
import Button from '@/components/Button';
import { ErrorState } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import { useToast } from '@/components/Toast';
import { vorgemerktMeldung } from '@/lib/sync/ausgangsfach';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry, Role } from '@/types';
import { praefixeVon, ohneKennzeichenVorsatz, mitKennzeichenVorsatz } from '@/lib/praefixe';


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
  /**
   * Vorbelegung von der aufrufenden Ansicht — heute der offene Nachtrag zu
   * einem unterschriebenen Handwerksschein.
   *
   * ALS PROP UND NICHT NUR ÜBER DEN ROUTER, weil das Formular auf DERSELBEN
   * Seite steht wie der Hinweis. Ein Umweg über die Adresszeile bedeutete,
   * die Seite ihrer selbst wegen neu zu laden — und der Monteur verlöre dabei
   * seine Scrollposition und einen bereits halb getippten Eintrag.
   */
  vorbelegung?: {
    date?: string;
    projectNumber?: string;
    startTime?: string;
    endTime?: string;
    breakDuration?: number;
  } | null;
}

/** Formular zur manuellen Zeiterfassung (portiert aus der Legacy-Zeitform). */
export default function TimeForm({
  onSaved,
  entry,
  onCancel,
  ownerRole,
  staff,
  lastEntry,
  vorbelegung,
}: Props) {
  const { user, company } = useAuth();
  const toast = useToast();
  /*
    DER BEZIRKSKENNER KOMMT VOM BETRIEB. Hier stand `WZ-` fest — dreifach:
    als Konstante, als Regel zum Abziehen und als Beschriftung am Feld. Das
    ist der Kenner eines bestimmten Bezirks; ein zweiter Betrieb hätte ihn auf
    jedem Zeiteintrag stehen gehabt, und von dort geht er in den Lohnexport.

    Ohne festgelegten Kenner verschwindet das graue Kästchen vor dem Feld und
    der Monteur tippt das ganze Kennzeichen — das ist der richtige Zustand für
    einen Fuhrpark, der nicht aus einem Bezirk kommt.
  */
  const kennzeichenVorsatz = praefixeVon(company).kennzeichen;
  // Vorbelegung aus dem Einsatzplan ("Zeit erfassen" am geplanten Einsatz).
  // Wichtig vor allem für asHelper: ein vergessener Haken führt zum falschen
  // Stundensatz auf der Rechnung.
  const ausRouter = (useLocation().state ?? null) as {
    projectNumber?: string;
    asHelper?: boolean;
  } | null;
  /*
    Die Vorbelegung der aufrufenden Ansicht geht VOR der aus dem Router: sie
    ist die frischere Absicht. Beim Bearbeiten eines bestehenden Eintrags
    zählt ohnehin nur `entry` — dessen Werte stehen unten überall zuerst.
  */
  const prefill = vorbelegung ?? ausRouter;
  /*
    `asHelper` kommt ausschliesslich aus dem Einsatzplan. Der Nachtrag setzt
    ihn bewusst NICHT: ob jemand als Helfer gearbeitet hat, steht zwar auf dem
    Schein, aber je ZEILE — und der Eintrag deckt den ganzen Tag ab. Ihn hier
    zu raten hiesse, den Stundensatz einer ganzen Buchung aus einer einzelnen
    Zeile abzuleiten.
  */
  const asHelperVorschlag = vorbelegung ? undefined : ausRouter?.asHelper;
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!entry;

  const [date, setDate] = useState(entry?.date ?? vorbelegung?.date ?? todayStr());
  const [status, setStatus] = useState<TimeEntry['status']>(entry?.status ?? 'Anwesend');
  const [startTime, setStartTime] = useState(entry?.startTime || vorbelegung?.startTime || '07:00');
  const [endTime, setEndTime] = useState(entry?.endTime || vorbelegung?.endTime || '16:00');
  const [breakDuration, setBreakDuration] = useState(
    String(entry?.breakDuration ?? vorbelegung?.breakDuration ?? 30),
  );
  const [travelTime, setTravelTime] = useState(String(entry?.travelTime ?? 0));
  const [projectNumber, setProjectNumber] = useState(entry?.projectNumber ?? prefill?.projectNumber ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  const [isHelper, setIsHelper] = useState(entry?.isHelper ?? asHelperVorschlag ?? false);
  const [helperName, setHelperName] = useState(entry?.helperName ?? '');
  // Zuschläge werden bewusst gesetzt, nicht aus der Uhrzeit geraten: ob ein
  // Einsatz als Nachtarbeit oder Notdienst gilt, entscheidet die Vereinbarung
  // mit dem Kunden — nicht der Zeiger auf der Uhr.
  const [isNightWork, setIsNightWork] = useState(entry?.isNightWork ?? false);
  const [isEmergency, setIsEmergency] = useState(entry?.isEmergency ?? false);
  const [vehiclePlate, setVehiclePlate] = useState(() => ohneKennzeichenVorsatz(entry?.vehiclePlate ?? '', kennzeichenVorsatz));
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

  /**
   * Die Baustellen laedt `BaustellenSelect` selbst — samt Lade-, Fehler- und
   * Leerzustand. Hier bleibt nur der DATENSATZ der gewaehlten Baustelle
   * liegen, weil der Kundenname als Kopie in den Zeiteintrag wandert. Ihn
   * meldet die Auswahl mit; eine zweite Abfrage waere derselbe Netzverkehr
   * noch einmal.
   */

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
   * Was steht an diesem Tag schon — und darf die neue Buchung dazu?
   *
   * Vorher war das ein Wahrheitswert: „an dem Tag ist gebucht, also nein."
   * Seit ein Monteur mehrere Baustellen am selben Tag buchen darf, genügt das
   * nicht mehr — ob noch etwas dazu darf, hängt davon ab, WAS dort steht und
   * welche Baustelle gerade gewählt ist.
   *
   * Deshalb werden die Einträge des Tages geladen und der Grund daraus
   * gerechnet. Das hat eine angenehme Nebenwirkung: die Warnung verschwindet
   * in dem Moment, in dem eine andere Baustelle gewählt wird, statt bis zum
   * Speichern stehenzubleiben.
   *
   * Die frühere Abkürzung über `existingDates` ist entfallen. Sie kannte nur
   * DATEN, keine Baustellen, und hätte ab jetzt jeden zweiten Einsatz eines
   * Tages fälschlich als belegt gemeldet.
   */
  const [tagesEintraege, setTagesEintraege] = useState<TimeEntry[] | null>(null);
  /**
   * WEM gehört der Eintrag, den dieses Formular schreiben wird?
   *
   * AUS DEM BETRIEB GEMELDET: „wenn ich in der Mitarbeiterübersicht eine Zeit
   * buchen möchte und noch kein Mitarbeiter ausgewählt ist, steht die Meldung,
   * dass eine Zeit bereits erfasst wurde."
   *
   * Der Rückfall auf den ANGEMELDETEN Benutzer war schuld. Für einen Monteur,
   * der seine eigene Zeit bucht, ist er richtig — dort gibt es keine Auswahl.
   * Erfasst die Buchhaltung dagegen FÜR jemanden (`staff` ist gesetzt) und hat
   * noch niemanden gewählt, prüfte er die Buchungen der BUCHHALTERIN und
   * warnte vor ihren Einträgen. Vor einem Formular, das gleich einem ganz
   * anderen Menschen gehören wird.
   *
   * Ohne Auswahl gibt es schlicht keinen Eigentümer — und damit nichts zu
   * prüfen. Gespeichert werden kann dann ohnehin nicht: die Auswahl ist
   * Pflicht (siehe `submit`).
   */
  const besitzerUid = targetUid || entry?.userId || (staff ? '' : user?.uid);
  useEffect(() => {
    if (!user || !besitzerUid || !date) return;
    let verworfen = false;
    setTagesEintraege(null);
    eintraegeAmTag(user.companyId, besitzerUid, date, entry?.id)
      .then((rows) => {
        if (!verworfen) setTagesEintraege(rows);
      })
      // Faellt die Abfrage aus, bleibt die serverseitige Sperre beim
      // Speichern. Eine ausgebliebene VORwarnung darf das Formular nicht
      // blockieren.
      .catch(() => {
        if (!verworfen) setTagesEintraege([]);
      });
    return () => {
      verworfen = true;
    };
  }, [user, besitzerUid, date, entry?.id]);

  /** Der Grund, warum gerade nicht gespeichert werden kann — oder null. */
  const konflikt = useMemo(
    () =>
      tagesEintraege
        ? buchungKonflikt({ status, projectNumber: canHaveProject ? projectNumber : '' }, tagesEintraege)
        : null,
    [tagesEintraege, status, projectNumber, canHaveProject],
  );

  /**
   * Was aus den drei Feldern gerechnet wird — damit es dasteht, bevor
   * gespeichert wird. Siehe `zeitPlausibilitaet.ts`.
   *
   * Ob die Zahl ÜBERHAUPT gehört, entscheidet allein `showWorkFields` unten in
   * der Maske: bei „Urlaub" gibt es die drei Felder nicht, und eine Zahl über
   * Felder, die niemand sieht, wäre eine Behauptung ins Leere. Dieselbe
   * Bedingung hier zu wiederholen hiesse, sie an zwei Stellen pflegen zu
   * müssen.
   */
  const bild = useMemo(
    () => zeitbild(startTime, endTime, breakDuration),
    [startTime, endTime, breakDuration],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (konflikt) {
      setError(konflikt);
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
        vehiclePlate:
          canHaveProject && vehiclePlate
            ? mitKennzeichenVorsatz(vehiclePlate, kennzeichenVorsatz)
            : '',
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
        // Geprüft wird gegen die Tage des EIGENTÜMERS, nicht gegen die des
        // Bearbeiters — die Buchhaltung korrigiert fremde Einträge.
        const stand = await updateTimeEntryOhneEmpfang(
          entry.id,
          { ...payload, ...audit },
          { companyId: user.companyId, userId: entry.userId },
        );
        if (stand === 'queued') toast.info(vorgemerktMeldung('Änderung übernommen'));
        else toast.success('Eintrag aktualisiert');
      } else {
        // Beim Erfassen für jemand anderen gehört der Eintrag DEM Mitarbeiter,
        // nicht dem Erfassenden — sonst stünde er im falschen Zeitkonto.
        const owner = target ?? { uid: user.uid, name: user.name };
        const stand = await createTimeEntryOhneEmpfang(user.companyId, {
          ...payload,
          userId: owner.uid,
          userName: owner.name,
          source: 'manual',
          ...(target
            ? { lastEditedBy: user.name, lastEditedByUid: user.uid, lastEditedAt: Date.now() }
            : {}),
        });
        if (stand === 'queued') toast.info(vorgemerktMeldung('Zeit gebucht'));
        else toast.success(target ? `Zeit für ${target.name} gebucht` : 'Zeit gebucht');
        setComment('');
      }
      onSaved();
    } catch (err) {
      if (err instanceof DuplicateEntryError) {
        // Den Grund des Servers zeigen, nicht einen eigenen Satz daruebersetzen:
        // die Sperre kennt vier Faelle mit vier verschiedenen Handlungen.
        setError(err.grund);
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
        <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning" role="alert">
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
              setVehiclePlate(
                ohneKennzeichenVorsatz(lastEntry.vehiclePlate ?? '', kennzeichenVorsatz),
              );
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
          pflicht
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
          pflicht
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

      {/*
        DER GRUND STEHT DA, nicht nur die Tatsache. „Für diesen Tag existiert
        bereits ein Eintrag" war richtig, solange je Tag einer erlaubt war —
        jetzt gibt es vier verschiedene Fälle mit vier verschiedenen
        Handlungen, und die Meldung nennt jeweils die eigene.
      */}
      {konflikt && (
        <p
          className="rounded border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-warning"
          role="alert"
        >
          {konflikt}
        </p>
      )}
      {holidayName && (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-info">
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
              pflicht
            />
            <InputField
              id="endTime"
              label="Bis"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              pflicht
            />
            <InputField
              id="break"
              label="Pause (Min.)"
              type="number"
              min="0"
              value={breakDuration}
              onChange={(e) => setBreakDuration(e.target.value)}
              required
              pflicht
            />
          </FormGrid>

          {/*
            DIE GERECHNETE ZAHL, BEVOR GESPEICHERT WIRD.

            Die Maske nahm drei Werte entgegen und sagte nicht, was daraus
            wird. Ein Tippfehler in der Endzeit fiel damit erst in der
            Lohnverrechnung auf — oder gar nicht. Warum genau diese drei
            Faelle einen Satz bekommen, steht in `zeitPlausibilitaet.ts`.
          */}
          {bild && (
            <p
              className={
                bild.befund === 'ok'
                  ? 'text-sm text-ink-muted'
                  : 'rounded border border-warning/30 bg-surface-2 px-3 py-2 text-sm text-warning'
              }
              /*
                Nur der Befund wird angesagt, die normale Zahl nicht: eine
                Vorlesehilfe, die bei jedem Tastendruck im Zeitfeld die
                Arbeitszeit dazwischenruft, macht die Maske unbenutzbar.
              */
              role={bild.befund === 'ok' ? undefined : 'alert'}
            >
              Arbeitszeit: <strong>{fmtMin(bild.minuten)} Std</strong>
              {zeitSatz(bild) && <span className="block">{zeitSatz(bild)}</span>}
            </p>
          )}

          {/*
            Der Umschalter steht VOR den Feldern, die er ein- und ausblendet,
            und nur dort, wo er etwas bewirkt. Ein Monteur sieht ihn nicht —
            für ihn gibt es nichts umzuschalten.
          */}
          {darfErweitern && !aussendienst && (
            <div className="rounded-sm border border-line bg-surface-2 p-3">
              {/*
                Die Beschriftung sagt bereits, WAS dazukommt. Warum man es
                braucht, stand darunter dauerhaft in zwei Zeilen — auf der
                meistgenutzten Maske der App, bei jeder einzelnen Buchung.
                Ab dem zweiten Mal ist das Rauschen; deshalb ins „i".
              */}
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  `min-w-0 flex-1` um die Beschriftung, nicht ohne: gemessen
                  auf 390 px rutschte das „i" sonst auf eine eigene Zeile
                  (102 px statt 74 px), weil die lange Beschriftung als
                  Flex-Element ihre volle Breite beanspruchte.
                */}
                <div className="min-w-0 flex-1">
                  <CheckboxField
                    id="erweitert"
                    label="Erweiterte Erfassung (Baustelle, Wegzeit, Fahrzeug, Zuschläge)"
                    checked={erweitert}
                    onChange={(e) => setErweitert(e.target.checked)}
                  />
                </div>
                <InfoHint about="erweiterte Erfassung">
                  Für Notdienste und Einsätze auf der Baustelle. Ohne diese Angaben zählt die Zeit
                  nicht ins Baustellenbudget und erscheint auf keiner Rechnung.
                </InfoHint>
              </div>
              {/*
                Abschalten an einem Eintrag, der die Angaben TRÄGT, löscht sie
                beim Speichern. Das ist die richtige Folge — aber nicht, wenn
                es unbemerkt passiert: die Baustelle verlöre ihre Stunden und
                die Rechnung eine Position, ohne dass jemand es merkt.
              */}
              {!erweitert && entry && (entry.projectNumber || entry.isEmergency || entry.isNightWork) && (
                <p className="mt-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm text-warning">
                  Dieser Eintrag hat eine Baustelle oder Zuschläge hinterlegt. Speichern ohne
                  erweiterte Erfassung entfernt sie.
                </p>
              )}
            </div>
          )}

          {canHaveProject && user && (
            <>
              {/*
                Dieselbe Auswahl wie ueberall: sie sagt, ob sie laedt, ob es
                schiefging oder ob nichts angelegt ist. Und sie bietet
                abgeschlossene Baustellen an, wenn keine mehr laeuft — eine
                Stunde von letzter Woche wird auch dann noch nachgetragen,
                wenn der Auftrag inzwischen abgeschlossen wurde.
              */}
              <BaustellenSelect
                id="project"
                companyId={user.companyId}
                value={projectNumber}
                onChange={(nr, p) => {
                  setProjectNumber(nr);
                  if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
                }}
                required
              />

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
                    {/*
                      DAS GRAUE KAESTCHEN STEHT NUR DA, WENN ES ETWAS ZU SAGEN
                      HAT. Ohne festgelegten Bezirkskenner waere es ein leeres
                      Feld vor einem Feld — dann traegt das Eingabefeld allein
                      das ganze Kennzeichen, und die Rundung links kommt
                      zurueck.
                    */}
                    {kennzeichenVorsatz && (
                      <span
                        aria-hidden
                        className="flex min-h-touch shrink-0 items-center rounded-l border border-r-0 border-line bg-surface-2 px-3 font-medium text-ink-muted"
                      >
                        {kennzeichenVorsatz}-
                      </span>
                    )}
                    <input
                      id="vehiclePlate"
                      className={`min-h-touch w-full border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand focus:ring-1 focus:ring-brand ${
                        kennzeichenVorsatz ? 'rounded-r' : 'rounded'
                      }`}
                      placeholder={kennzeichenVorsatz ? '12345A' : 'W-12345A'}
                      value={vehiclePlate}
                      onChange={(e) =>
                        setVehiclePlate(ohneKennzeichenVorsatz(e.target.value, kennzeichenVorsatz))}
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
        <Button type="submit" loading={saving} disabled={!!konflikt || billed} className="w-full sm:w-auto">
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
