import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  createTimeEntryOhneEmpfang,
  updateTimeEntryOhneEmpfang,
  eintraegeAmTag,
  listOwnEntriesInRange,
  DuplicateEntryError,
} from '@/lib/db/timeEntries';
import { getGeburtsdatum } from '@/lib/db/arbeitszeitGrenzen';
import {
  andereVerteilung, grenzfaelleDerBuchung, grenzText, istJugendlich, umfeldDerBuchung, unterrichtAusEingabe,
  type Grenzfall,
} from '@/features/accounting/arbeitszeitGrenzen';
import { buchungKonflikt } from '@/lib/tagesbuchungen';
import { berufsschuleEintragen, krankmeldungSpeichern, urlaubEintragen } from '@/lib/db/abwesenheiten';
import { ergebnisText } from '@/features/vacations/abwesenheitText';
import { todayStr, getAustrianHolidayName, fmtMin, tageWort, tagessollStunden } from '@/lib/time';
import { zeitbild, zeitSatz } from './zeitPlausibilitaet';
import { nachtMinutenIn, nachtzeitText, nachtzeitVon } from '@/lib/lohnregeln';
import { bearbeitungsvermerk } from './bearbeitungsvermerk';
import { istAussendienst, canExtendTimeEntry, canEditTime } from '@/lib/permissions';
import { InputField, SelectField, CheckboxField, FormGrid } from '@/components/Field';
import BaustellenSelect from '@/components/BaustellenSelect';
import Icon from '@/components/Icon';
import Button from '@/components/Button';
import Hinweiszeile from '@/components/Hinweiszeile';
import { eintrittsHinweis } from './eintrittsHinweis';
import Aktionsleiste from '@/components/Aktionsleiste';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/States';
import InfoHint from '@/components/InfoHint';
import { WeitereAngaben } from '@/components/LotBausteine';
import { useToast } from '@/components/Toast';
import { vorgemerktMeldung } from '@/lib/sync/ausgangsfach';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry, Role } from '@/types';
import { praefixeVon, ohneKennzeichenVorsatz, mitKennzeichenVorsatz } from '@/lib/praefixe';
import { grundAus } from '@/lib/fehlerGrund';
import { zahlAlsText } from '@/lib/zahl';
import { mitFrist } from '@/lib/frist';
import { aktiveModule } from '@/lib/module';
import AufteilenDialog from './AufteilenDialog';
import { aufteilenGeht } from './aufteilen';


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
    /**
     * Für wen gebucht wird — nur mit `staff` und nur, wenn die Person dort
     * steht (Mitarbeiterübersicht, „Zeit erfassen“ an einem Tag ohne
     * Buchung, Runde 4). Die Auswahl bleibt änderbar.
     */
    userId?: string;
  } | null;
  /**
   * Das Stammdatenblatt dessen, dem die Buchung gehört — für die Rückfrage
   * zum Jugendschutz (Runde 3, M2): Tagessoll und dessen Verteilung. Bucht
   * das Büro für jemanden, kommt es aus `staff`.
   */
  besitzerProfil?: AppUser | null;
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
  besitzerProfil,
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
    /*
      „Wie zuletzt buchen“ von der Startseite (Nachtest 01.10.2026, Paket B):
      die Zeiten der letzten Buchung. Gebucht wird erst hier, mit Anfahrt,
      Fahrzeug und Zuschlägen, die nur der Monteur kennt.
    */
    startTime?: string;
    endTime?: string;
    breakDuration?: number;
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
  const [aufteilenOffen, setAufteilenOffen] = useState(false);

  const [date, setDate] = useState(entry?.date ?? vorbelegung?.date ?? todayStr());
  const [status, setStatus] = useState<TimeEntry['status']>(entry?.status ?? 'Anwesend');
  /** Zeitausgleich nur für einige Stunden (mit Von/Bis) statt für den ganzen Tag. */
  const [zaStundenweise, setZaStundenweise] = useState(
    entry?.status === 'Zeitausgleich' && !!entry.startTime && !!entry.endTime,
  );
  const ausStart = vorbelegung ? undefined : ausRouter;
  const [startTime, setStartTime] = useState(entry?.startTime || vorbelegung?.startTime || ausStart?.startTime || '07:00');
  const [endTime, setEndTime] = useState(entry?.endTime || vorbelegung?.endTime || ausStart?.endTime || '16:00');
  // Die Nachtzeit des Betriebs (M35) und wie viel der Spanne hineinfällt.
  const nacht = nachtzeitVon(company);
  const nachtImEintrag = nachtMinutenIn(startTime, endTime, nacht);
  const [breakDuration, setBreakDuration] = useState(
    String(entry?.breakDuration ?? vorbelegung?.breakDuration ?? ausStart?.breakDuration ?? 30),
  );
  const [travelTime, setTravelTime] = useState(String(entry?.travelTime ?? 0));
  const [projectNumber, setProjectNumber] = useState(entry?.projectNumber ?? prefill?.projectNumber ?? '');
  const [comment, setComment] = useState(entry?.comment ?? '');
  /** Weicht die Maske bei Zeiten, Pause oder Baustelle von der gespeicherten Buchung ab? Dann noch nicht aufteilen. */
  const aufteilenUngespeichert = !!entry && (
    startTime !== (entry.startTime ?? '') || endTime !== (entry.endTime ?? '')
    || (Number(breakDuration) || 0) !== (Number(entry.breakDuration ?? 0) || 0)
    || projectNumber !== (entry.projectNumber ?? '') || status !== entry.status
  );
  /** Krank bis (einschließlich) — Krank wird als Krankmeldung erfasst. */
  const [krankBis, setKrankBis] = useState(entry?.date ?? vorbelegung?.date ?? todayStr());
  /** Urlaub bis (einschließlich) — das Büro trägt ihn als genehmigten Antrag ein. */
  const [urlaubBis, setUrlaubBis] = useState(entry?.date ?? vorbelegung?.date ?? todayStr());
  const [schuleBis, setSchuleBis] = useState(entry?.date ?? vorbelegung?.date ?? todayStr());
  /** Unterrichtszeit je Schultag (Runde 3, M1) — leer heisst Tagessoll. */
  const [unterricht, setUnterricht] = useState('');
  const [isHelper, setIsHelper] = useState(entry?.isHelper ?? asHelperVorschlag ?? false);
  const [helperName, setHelperName] = useState(entry?.helperName ?? '');
  /*
    NACHTARBEIT ZÄHLT VON SELBST (Runde 3, M4): die Stunden in der Nachtzeit
    des Betriebs, aus Von und Bis. Der Haken ist weg — er wurde vergessen, und
    dann fehlte der Zuschlag in der Lohnliste. Wer eine Buchung bewusst nicht
    als Nachtarbeit zählen will, wählt sie mit Grund ab. Den Notdienst setzt
    weiter der Mensch: ob ein Einsatz einer war, sagt keine Uhr.
  */
  const [nachtAbwahl, setNachtAbwahl] = useState(!!entry?.nachtAbgewaehlt?.trim());
  const [nachtGrund, setNachtGrund] = useState(entry?.nachtAbgewaehlt ?? '');
  const [isEmergency, setIsEmergency] = useState(entry?.isEmergency ?? false);
  /*
    ERST NACH EINER EINGABE WARNEN (Testbericht 30.09.2026, G18). Die Maske
    ist mit heute und 07:00–16:00 vorbelegt; stand für heute schon etwas da —
    etwa gleich nach dem Buchen —, meldete sie „bereits gebucht“, bevor
    jemand etwas eingegeben hatte. Geprüft wird weiter immer: beim Absenden
    steht der Grund als Fehler da.
  */
  const [angefasst, setAngefasst] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState(() => ohneKennzeichenVorsatz(entry?.vehiclePlate ?? '', kennzeichenVorsatz));
  /** Für wen wird gebucht (nur wenn `staff` gesetzt ist). */
  const [targetUid, setTargetUid] = useState(
    entry?.userId ??
      (vorbelegung?.userId && staff?.some((u) => u.uid === vorbelegung.userId) ? vorbelegung.userId : ''),
  );

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
      !!(entry.projectNumber || entry.isEmergency || entry.isHelper),
  );
  const canHaveProject = aussendienst || (darfErweitern && erweitert);
  /*
    WEITERE ANGABEN — Wegzeit, Fahrzeug, Helfername, Zuschläge — stehen beim
    Monteur hinter einer Zeile. Vierzehn Felder bei jeder Buchung schoben
    „Meine Einträge" am Telefon auf 2 000 px hinunter (Prüflauf 24.09.2026,
    D8), und die meisten Tage brauchen keines davon.

    ZUGEKLAPPT HEISST NICHT UNSICHTBAR: was gesetzt ist, steht in der Zeile
    („Fahrzeug WZ-12345A · Nachtarbeit"). Offen startet sie, wenn der Eintrag
    solche Angaben trägt oder der letzte welche trug — wer täglich sein
    Kennzeichen einträgt, soll nicht täglich aufklappen.

    Der Helfer-Haken bleibt draussen: er ändert den Stundensatz auf der
    Rechnung und kommt oft aus dem Einsatzplan vorbelegt.
  */
  /*
    NUR DER ANFANGSZUSTAND: danach klappt der Browser selbst (`<details>` in
    `WeitereAngaben`). Ein neuer Eintrag zum Bearbeiten setzt das Formular
    ohnehin neu auf (Schlüssel in der Zeiterfassung).
  */
  const [weitereOffen] = useState(
    () => hatWeitereAngaben(entry) || (!entry && hatWeitereAngaben(lastEntry)),
  );
  const showWorkFields = status === 'Anwesend';
  /** Trägt dieser Eintrag Von/Bis? Arbeitszeit immer, Zeitausgleich nur stundenweise. */
  const mitZeiten = showWorkFields || (status === 'Zeitausgleich' && zaStundenweise);
  /*
    ZEITAUSGLEICH BUCHT DAS BÜRO — der Monteur BEANTRAGT ihn (Seite Urlaub).
    Direkt gebucht wäre er am Genehmigenden vorbei. Ein bereits gebuchter ZA
    bleibt in der Auswahl, damit er beim Bearbeiten nicht verschwindet.
  */
  const zaWaehlbar =
    (!!user && canEditTime(user.role)) || entry?.status === 'Zeitausgleich';
  /*
    KRANK IST EINE KRANKMELDUNG. Die Zeiterfassung legt sie an (auch über
    mehrere Tage) — so steht sie im Wochenplan und bei den Krankenständen
    des Büros, und nicht nur im Zeitkonto. Ein Tag, der zu einer Meldung
    gehört, wird nur über die Meldung geändert; die Datenbank lässt es
    anders nicht zu. Einen bestehenden Eintrag zu „Krank" umzubauen geht
    deshalb nicht: den Eintrag löschen und neu krank melden.
  */
  const meldungsTag = !!entry?.krankmeldungId;
  const krankWaehlbar = !isEdit || entry?.status === 'Krank';
  const alsKrankmeldung = !isEdit && status === 'Krank';
  /*
    URLAUB IST EIN ANTRAG, wie Krank eine Meldung ist. Der Monteur beantragt
    ihn auf der Seite Urlaub; das Büro trägt ihn hier ein, und daraus wird ein
    genehmigter Antrag — sonst stünde neben den Anträgen ein zweiter
    Resturlaub. Ein Tag aus einem genehmigten Antrag (Urlaub oder
    Zeitausgleich) ändert sich nur über den Antrag; die Datenbank lässt es
    anders nicht zu.
  */
  const antragsTag = !!entry?.vacationId;
  // Einen bestehenden Eintrag zu Urlaub umzubauen geht nicht — wie bei Krank:
  // den Eintrag löschen und den Urlaub eintragen.
  const urlaubWaehlbar =
    (!isEdit && !!user && canEditTime(user.role)) || entry?.status === 'Urlaub';
  const alsUrlaubEintrag = !isEdit && status === 'Urlaub';
  /*
    BERUFSSCHULE NUR FÜR LEHRLINGE (Testbericht 4.1) — für wen gebucht wird,
    entscheidet: bucht das Büro für jemanden, dessen Einstufung, sonst die
    eigene. Eingetragen wird über die Datenbank, auch als Zeitraum
    (Blocklehrgang); einen Berufsschultag baut niemand um, er wird gelöscht
    und neu eingetragen.
  */
  const fuerLehrling = staff ? target?.einstufung === 'lehrling' : user?.einstufung === 'lehrling';
  const schuleWaehlbar = !isEdit && fuerLehrling;
  const alsBerufsschule = !isEdit && status === 'Berufsschule';

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
  // Wem der Tag gehört, entscheidet über Eintritt und Saldo-Start (M7).
  const besitzer = staff?.find((u) => u.uid === besitzerUid) ?? (besitzerUid === user?.uid ? user : null);
  /*
    DAS HELFER-KENNZEICHEN FOLGT BEI HELFER UND LEHRLING DER EINSTUFUNG
    (Entscheidung 03.10.2026). Der eingestufte Helfer hat ohnehin den
    Helfersatz; ohne Kennzeichen zählten seine Stunden aber ins
    Projekt-Budget. Beim Lehrling verdrängte das Kennzeichen den
    Lehrlingssatz (`satzklasse`). Zur Wahl steht es nur noch für die
    Ausnahme: eine Fachkraft, die einen Tag zuarbeitet.
  */
  const helferFest: boolean | null =
    besitzer?.einstufung === 'helfer' ? true : besitzer?.einstufung === 'lehrling' ? false : null;
  // Eine alte Buchung, deren Tag bleibt, lässt auch die Datenbank ändern.
  const vorEintritt = isEdit && entry?.date === date ? null : eintrittsHinweis(besitzer, date);
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
        ? buchungKonflikt(
            {
              status,
              projectNumber: canHaveProject ? projectNumber : '',
              startTime: mitZeiten ? startTime : undefined,
              endTime: mitZeiten ? endTime : undefined,
            },
            tagesEintraege,
          )
        : null,
    [tagesEintraege, status, projectNumber, canHaveProject, mitZeiten, startTime, endTime],
  );

  /*
    JUGENDSCHUTZ VOR DEM SPEICHERN (Runde 3, M2). Für eine 17-Jährige nahm die
    Maske 10:45 Std. ab 5 Uhr ohne ein Wort an; der Verstoss stand erst
    hinterher in der Mitarbeiterübersicht. Jetzt fragt sie vorher nach — bei
    der eigenen Buchung wie beim Büro, das für jemanden bucht. Gesperrt wird
    nicht: die Buchung muss stimmen, auch wenn die Zeit unzulässig war.

    Geprüft wird mit derselben Regel wie in der Mitarbeiterübersicht
    (`grenzfaelleDerBuchung`), darum braucht es die Buchungen ringsum: die
    Woche, den Vortag für die Ruhezeit, den Montag danach für die
    Wochenfreizeit. Geladen wird nur für Jugendliche — für alle anderen
    bleibt es bei der einen Abfrage nach dem Geburtsdatum. Fällt eine Abfrage
    aus, entfällt die Rückfrage; die Buchung geht trotzdem. Wer schneller
    tippt, als die Abfragen antworten, wird beim Speichern abgewartet.
  */
  /** `undefined`: noch nicht geladen — anders als `null`, „keines hinterlegt“. */
  const [geburtsdatum, setGeburtsdatum] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setGeburtsdatum(undefined);
    if (!user || !besitzerUid) return;
    let verworfen = false;
    Promise.resolve()
      .then(() => getGeburtsdatum(user.companyId, besitzerUid))
      .then((d) => { if (!verworfen) setGeburtsdatum(d); })
      .catch(() => { if (!verworfen) setGeburtsdatum(null); });
    return () => {
      verworfen = true;
    };
  }, [user, besitzerUid]);
  const jugendlichAmTag = istJugendlich(geburtsdatum, date);
  const [umfeld, setUmfeld] = useState<WithId<TimeEntry>[] | null>(null);
  useEffect(() => {
    setUmfeld(null);
    if (!user || !besitzerUid || !jugendlichAmTag) return;
    let verworfen = false;
    const { von, bis } = umfeldDerBuchung(date);
    Promise.resolve()
      .then(() => listOwnEntriesInRange(user.companyId, besitzerUid, von, bis))
      .then((rows) => { if (!verworfen) setUmfeld(rows); })
      .catch(() => undefined);
    return () => {
      verworfen = true;
    };
  }, [user, besitzerUid, date, jugendlichAmTag]);
  /** Die Fälle, nach denen vor dem Speichern gefragt wird — offen, solange die Rückfrage steht. */
  const [rueckfrage, setRueckfrage] = useState<Grenzfall[] | null>(null);
  const grenzPerson = target ?? besitzerProfil ?? null;

  async function jugendschutzFaelle(): Promise<Grenzfall[]> {
    if (!user || !besitzerUid || status !== 'Anwesend') return [];
    // Höchstens drei Sekunden, wie die Prüfung auf Doppelbuchung: ohne Netz
    // wird gebucht (und nachgesendet), nicht gewartet.
    const geboren = geburtsdatum !== undefined
      ? geburtsdatum
      : await mitFrist(Promise.resolve().then(() => getGeburtsdatum(user.companyId, besitzerUid)), 3000)
        .catch(() => null);
    if (!istJugendlich(geboren, date)) return [];
    const { von, bis } = umfeldDerBuchung(date);
    const rows = umfeld ?? await mitFrist(
      Promise.resolve().then(() => listOwnEntriesInRange(user.companyId, besitzerUid, von, bis)),
      3000,
    ).catch(() => null);
    if (!rows) return [];
    const andere = rows.filter((e) => e.id !== entry?.id);
    const neu = { date, status: 'Anwesend' as const, startTime, endTime, breakDuration: Number(breakDuration) || 0 };
    return grenzfaelleDerBuchung([...andere, neu], date, {
      geburtsdatum: geboren,
      schultagMin: grenzPerson ? (t) => tagessollStunden(grenzPerson, t) * 60 : undefined,
      andereVerteilung: andereVerteilung(grenzPerson),
    }).filter((f) => f.jugendlich);
  }

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
    () => zeitbild(startTime, endTime, breakDuration, date),
    [startTime, endTime, breakDuration, date],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void absenden(false);
  }

  /** `bestaetigt`: die Rückfrage zum Jugendschutz ist schon beantwortet. */
  async function absenden(bestaetigt: boolean) {
    if (!user) return;
    setError(null);

    if (konflikt) {
      setError(konflikt);
      return;
    }
    if (vorEintritt?.sperrt) {
      setError(vorEintritt.text);
      return;
    }
    if (status === 'Zeitausgleich' && zaStundenweise && !(endTime > startTime)) {
      setError('Beim Zeitausgleich muss „Frei bis“ nach „Frei von“ liegen.');
      return;
    }

    if (entry?.isBilled) {
      setError('Verrechnete Einträge können nicht geändert werden.');
      return;
    }
    if (meldungsTag) {
      setError('Dieser Tag gehört zu einer Krankmeldung — bitte dort das Ende ändern oder die Meldung löschen.');
      return;
    }
    if (antragsTag) {
      setError('Dieser Tag gehört zu einem genehmigten Antrag — er ändert sich nur über den Antrag auf der Seite Urlaub.');
      return;
    }
    if (alsKrankmeldung && krankBis < date) {
      setError('„Krank bis“ liegt vor dem Datum.');
      return;
    }
    if (alsUrlaubEintrag && urlaubBis < date) {
      setError('„Urlaub bis“ liegt vor dem Datum.');
      return;
    }
    if (alsBerufsschule && schuleBis < date) {
      setError('„Berufsschule bis“ liegt vor dem Datum.');
      return;
    }
    const unterrichtGelesen = unterrichtAusEingabe(unterricht);
    if (alsBerufsschule && unterrichtGelesen.fehler) {
      setError(unterrichtGelesen.fehler);
      return;
    }
    if (staff && !isEdit && !targetUid) {
      setError('Bitte einen Mitarbeiter auswählen.');
      return;
    }
    /*
      DIE BAUSTELLE IST PFLICHT, WO ES DAS FELD GIBT — auch dann, wenn das
      Feld selbst nicht prüfen kann (Prüflauf 25.09.2026, P1-07). Bis hierher
      hing das allein am `required` des Auswahlfelds; solange es lädt, ist es
      gesperrt und wird vom Browser übersprungen, und im Fehlerzustand steht
      gar keins da. „Anwesend" ging dann ohne Baustelle durch — Stunden, die
      auf keiner Rechnung auftauchen.
    */
    if (canHaveProject && showWorkFields && !projectNumber) {
      setError('Bitte eine Baustelle wählen.');
      return;
    }

    setSaving(true);
    if (alsUrlaubEintrag) {
      try {
        const r = await urlaubEintragen({
          userId: target?.uid ?? user.uid,
          von: date,
          bis: urlaubBis,
          notiz: comment.trim(),
          name: user.name,
        });
        const tage = tageWort(r.tage);
        const uebersprungen =
          r.uebersprungen > 0 ? `, ${r.uebersprungen} schon gebucht und übersprungen` : '';
        toast.success(
          `${target ? `Urlaub für ${target.name}` : 'Urlaub'} eingetragen — ${tage}${uebersprungen}`,
        );
        setComment('');
        setStatus('Anwesend');
        onSaved();
      } catch (err) {
        setError(
          grundAus(err, 'Der Urlaub konnte nicht eingetragen werden.'),
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (alsBerufsschule) {
      try {
        const r = await berufsschuleEintragen({
          userId: target?.uid ?? null,
          von: date,
          bis: schuleBis,
          notiz: comment.trim(),
          // Leer bleibt der Aufruf, wie er war: es zählt das Tagessoll.
          ...(unterrichtGelesen.min != null ? { unterrichtMin: unterrichtGelesen.min } : {}),
        });
        const uebersprungen =
          r.uebersprungen > 0 ? `, ${r.uebersprungen} schon gebucht und übersprungen` : '';
        toast.success(
          `Berufsschule${target ? ` für ${target.name}` : ''} eingetragen — ${tageWort(r.angelegt)}${uebersprungen}`,
        );
        setComment('');
        setUnterricht('');
        setStatus('Anwesend');
        onSaved();
      } catch (err) {
        setError(grundAus(err, 'Die Berufsschule konnte nicht eingetragen werden.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (alsKrankmeldung) {
      try {
        // Die Meldung gehört dem Mitarbeiter, für den gebucht wird — ohne
        // Auswahl dem Angemeldeten selbst.
        const r = await krankmeldungSpeichern({
          userId: target?.uid ?? null,
          von: date,
          bis: krankBis,
          notiz: comment.trim(),
          melderName: user.name,
        });
        toast.success(
          `${target ? `Krankmeldung für ${target.name}` : 'Krankmeldung'} erfasst — ${ergebnisText(r)}`,
        );
        setComment('');
        // Zurück auf den Normalfall: die Maske steht für die nächste Buchung
        // bereit, nicht für eine zweite Krankmeldung über dieselben Tage.
        setStatus('Anwesend');
        onSaved();
      } catch (err) {
        // Der Grund des Servers zählt: eine Überschneidung nennt die andere
        // Meldung, ein Zeitraum ohne Arbeitstag sagt genau das. Ohne Netz
        // geht eine Krankmeldung nicht — sie legt Tage im Zeitkonto an, und
        // das tut nur der Server.
        setError(
          grundAus(err, 'Die Krankmeldung konnte nicht erfasst werden.'),
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (showWorkFields && mitZeiten && nachtImEintrag > 0 && nachtAbwahl && !nachtGrund.trim()) {
      setError('Warum zählen diese Stunden nicht als Nachtarbeit? Bitte den Grund eintragen.');
      setSaving(false);
      return;
    }
    if (!bestaetigt) {
      const faelle = await jugendschutzFaelle();
      if (faelle.length > 0) {
        setSaving(false);
        setRueckfrage(faelle);
        return;
      }
    }
    try {
      const project = projects.find((p) => p.projectNumber === projectNumber);
      /*
        Der Kundenname wandert als Kopie in den Eintrag. Kennt die Auswahl den
        Datensatz (noch) nicht — „Wie zuletzt" gleich nach dem Öffnen, die
        Liste lädt noch oder ist gekappt —, stand hier ein leerer Name
        (Prüflauf 25.09.2026, P1-07). Dann gilt der Name aus dem Eintrag, von
        dem die Baustelle stammt.
      */
      const kundeAusEintrag = [entry, lastEntry].find(
        (e) => !!e?.projectNumber && e.projectNumber === projectNumber,
      )?.customerName;
      const payload = {
        date,
        status,
        startTime: mitZeiten ? startTime : '',
        endTime: mitZeiten ? endTime : '',
        breakDuration: showWorkFields ? Number(breakDuration) || 0 : 0,
        travelTime: Number(travelTime) || 0,
        projectNumber: canHaveProject ? projectNumber : '',
        customerName: canHaveProject ? project?.customerName ?? kundeAusEintrag ?? '' : '',
        // Gespeichert wird IMMER mit Praefix, damit Exporte und die
        // Fahrzeugsuche ein einheitliches Format vorfinden.
        vehiclePlate:
          canHaveProject && vehiclePlate
            ? mitKennzeichenVorsatz(vehiclePlate, kennzeichenVorsatz)
            : '',
        helperName: canHaveProject ? helperName : '',
        comment,
        isHelper: canHaveProject ? helferFest ?? isHelper : false,
        // Mit Von und Bis setzt die Datenbank das Kennzeichen selbst (M4);
        // ohne sie bleibt es, wie es war.
        isNightWork: showWorkFields && mitZeiten
          ? nachtImEintrag > 0 && !nachtAbwahl
          : entry?.isNightWork ?? false,
        nachtAbgewaehlt: showWorkFields && mitZeiten && nachtImEintrag > 0 && nachtAbwahl
          ? nachtGrund.trim()
          : null,
        isEmergency: canHaveProject && showWorkFields ? isEmergency : false,
      };

      if (isEdit) {
        // userId/userName bleiben unangetastet — der Eintrag gehört weiter dem
        // Mitarbeiter, auch wenn die Buchhaltung ihn korrigiert (Legacy:2700-2706).
        const audit = entry.userId !== user.uid ? bearbeitungsvermerk(user) : {};
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
          ...(target ? bearbeitungsvermerk(user) : {}),
        });
        if (stand === 'queued') toast.info(vorgemerktMeldung('Zeit gebucht'));
        else toast.success(target ? `Zeit für ${target.name} gebucht` : 'Zeit gebucht');
        setComment('');
        /*
          ZUSCHLÄGE GELTEN FÜR EINEN EINSATZ, nicht für den nächsten
          (Testbericht 30.09.2026, G18): der Notdienst blieb nach dem Buchen
          angehakt und wäre mit der nächsten Buchung mitgegangen.
        */
        setNachtAbwahl(false);
        setNachtGrund('');
        setIsEmergency(false);
        setAngefasst(false);
      }
      onSaved();
    } catch (err) {
      if (err instanceof DuplicateEntryError) {
        // Den Grund des Servers zeigen, nicht einen eigenen Satz daruebersetzen:
        // die Sperre kennt vier Faelle mit vier verschiedenen Handlungen.
        setError(err.grund);
      } else {
        setError(grundAus(err, 'Die Zeit konnte nicht gebucht werden.'));
      }
    } finally {
      setSaving(false);
    }
  }

  const weitereWerte = [
    Number(travelTime) > 0 && `Wegzeit ${travelTime} Min.`,
    vehiclePlate && `Fahrzeug ${mitKennzeichenVorsatz(vehiclePlate, kennzeichenVorsatz)}`,
    helperName.trim() && `Helfer ${helperName.trim()}`,
    isEmergency && 'Notdienst',
  ].filter(Boolean) as string[];

  const weitereFelder = (
    <>
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
          <label htmlFor="vehiclePlate" className="text-sm font-normal text-ink">
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
                className="flex min-h-touch shrink-0 items-center rounded-l border border-r-0 border-line bg-surface-2 px-3 font-normal text-ink-muted"
              >
                {kennzeichenVorsatz}-
              </span>
            )}
            <input
              id="vehiclePlate"
              className={`min-h-touch w-full border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-placeholder focus:border-brand focus:ring-1 focus:ring-brand ${
                kennzeichenVorsatz ? 'rounded-r' : 'rounded'
              }`}
              placeholder={kennzeichenVorsatz ? 'z. B. 12345A' : 'z. B. W-12345A'}
              value={vehiclePlate}
              onChange={(e) =>
                setVehiclePlate(ohneKennzeichenVorsatz(e.target.value, kennzeichenVorsatz))}
            />
          </div>
        </div>
      </FormGrid>
      <InputField
        id="helperName"
        label="Name des Helfers (optional)"
        value={helperName}
        onChange={(e) => setHelperName(e.target.value)}
      />

      {/* Eine Gruppe mit Linie oben statt eines getönten Kastens in der Karte. */}
      <fieldset className="border-t border-line pt-2">
        <legend className="pr-2 section-label">Zuschläge</legend>
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
  );

  const billed = !!entry?.isBilled;
  const gesperrt = billed || meldungsTag || antragsTag;

  return (
    <>
    <form onSubmit={handleSubmit} onChange={() => setAngefasst(true)} className="space-y-4">
      {/* Bereits verrechnete Einträge sind die Grundlage einer verschickten
          Rechnung — eine Änderung würde den Beleg nachträglich verfälschen. */}
      {billed && (
        <Hinweiszeile stufe="warn" role="alert">
          <p>
            Dieser Eintrag ist mit Rechnung {entry?.invoiceNumber || '—'} verrechnet und kann nicht
            mehr geändert werden. Dafür muss zuerst die Rechnung storniert werden.
          </p>
        </Hinweiszeile>
      )}
      {meldungsTag && (
        <Hinweiszeile stufe="warn" role="alert">
          <p>
            Dieser Tag gehört zu einer Krankmeldung und wird nur über sie geändert: in der Liste auf
            „Krankmeldung“ tippen und dort das Ende ändern oder die Meldung löschen.
          </p>
        </Hinweiszeile>
      )}
      {antragsTag && (
        <Hinweiszeile stufe="warn" role="alert">
          <p>
            Dieser Tag gehört zu einem genehmigten Antrag und ändert sich nur über ihn: auf der Seite
            Urlaub den Antrag zurücknehmen, beim Betriebsurlaub im Reiter „Betriebsurlaub“.
          </p>
        </Hinweiszeile>
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
          // Weiss mit Haarlinie wie ein Nebenknopf (Designlinie „Fassung 3"):
          // die türkis getönte Fläche war die einzige farbige im Formular.
          className="flex min-h-touch w-full items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-left text-sm font-normal text-ink-deep shadow-sm transition hover:bg-surface-2 active:scale-[0.99]"
        >
          {/* Umbrechen statt abschneiden: der Kundenname ist das, woran man
              den Eintrag wiedererkennt. */}
          <span className="min-w-0">
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
          onChange={(e) => {
            setDate(e.target.value);
            // Das Krank- und das Urlaubsende mitziehen, solange es davor läge.
            if (krankBis < e.target.value) setKrankBis(e.target.value);
            if (urlaubBis < e.target.value) setUrlaubBis(e.target.value);
            if (schuleBis < e.target.value) setSchuleBis(e.target.value);
          }}
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
          {krankWaehlbar && <option value="Krank">Krank</option>}
          {urlaubWaehlbar && <option value="Urlaub">Urlaub</option>}
          {zaWaehlbar && <option value="Zeitausgleich">Zeitausgleich</option>}
          {(schuleWaehlbar || status === 'Berufsschule') && <option value="Berufsschule">Berufsschule</option>}
        </SelectField>
      </FormGrid>

      {/*
        DER GRUND STEHT DA, nicht nur die Tatsache. „Für diesen Tag existiert
        bereits ein Eintrag" war richtig, solange je Tag einer erlaubt war —
        jetzt gibt es vier verschiedene Fälle mit vier verschiedenen
        Handlungen, und die Meldung nennt jeweils die eigene.
      */}
      {konflikt && (angefasst || isEdit) && (
        <Hinweiszeile stufe="warn" role="alert">
          <p>{konflikt}</p>
        </Hinweiszeile>
      )}
      {vorEintritt && (
        <Hinweiszeile stufe="warn" role={vorEintritt.sperrt ? 'alert' : undefined}>
          <p>{vorEintritt.text}</p>
        </Hinweiszeile>
      )}
      {holidayName && (
        <Hinweiszeile>
          <p>Hinweis: {holidayName} — gesetzlicher Feiertag.</p>
        </Hinweiszeile>
      )}
      {/*
        HINWEISE HÖCHSTENS EINE ZEILE (Linie „Lot“, Regel 9): was der Status
        bewirkt, steht in einem Satz; die ganze Erklärung hinter dem „i“ — auf
        der Seite gesammelt unter „Hilfe zu dieser Seite“. Warnungen zum
        aktuellen Eintrag (verrechnet, Krankmeldung, Antrag, Konflikt) stehen
        weiter ganz da: die muss man ohne Tipp sehen.
      */}
      {alsKrankmeldung && (
        <div className="space-y-3 text-sm text-ink-muted">
          <p className="flex flex-wrap items-center gap-x-1">
            Wird als Krankmeldung erfasst; das Ende lässt sich später ändern.
            <InfoHint about="Krankmeldung">
              Die Arbeitstage bis zum Ende stehen als „Krank“ im Zeitkonto, das Büro sieht die
              Meldung. Ist das Ende noch offen, das voraussichtliche eintragen — ändern geht
              später über die Meldung.
            </InfoHint>
          </p>
          <InputField
            id="krankBis"
            label="Krank bis (voraussichtlich)"
            type="date"
            value={krankBis}
            min={date}
            onChange={(e) => setKrankBis(e.target.value)}
            required
            pflicht
          />
        </div>
      )}
      {alsUrlaubEintrag && (
        <div className="space-y-3 text-sm text-ink-muted">
          <p className="flex flex-wrap items-center gap-x-1">
            Wird als genehmigter Urlaub eingetragen; schon gebuchte Tage bleiben.
            <InfoHint about="Urlaub eintragen">
              Die freien Arbeitstage bis zum Ende stehen als „Urlaub“ im Zeitkonto und zählen beim
              Resturlaub. Schon gebuchte Tage bleiben.
            </InfoHint>
          </p>
          <InputField
            id="urlaubBis"
            label="Urlaub bis"
            type="date"
            value={urlaubBis}
            min={date}
            onChange={(e) => setUrlaubBis(e.target.value)}
            required
            pflicht
          />
        </div>
      )}
      {alsBerufsschule && (
        <div className="space-y-3 text-sm text-ink-muted">
          <p className="flex flex-wrap items-center gap-x-1">
            Erfüllt das Tagessoll und geht auf keine Rechnung.
            <InfoHint about="Berufsschule">
              Die Arbeitstage bis zum Ende stehen als „Berufsschule“ im Zeitkonto: sie erfüllen das
              Tagessoll und gehen auf keine Rechnung. Für einen Blocklehrgang das letzte Datum
              eintragen; schon gebuchte Tage bleiben.
            </InfoHint>
          </p>
          <InputField
            id="schuleBis"
            label="Berufsschule bis"
            type="date"
            value={schuleBis}
            min={date}
            onChange={(e) => setSchuleBis(e.target.value)}
            required
            pflicht
          />
          {/*
            DIE UNTERRICHTSZEIT (Runde 3, M1, vorbehaltlich der WKO-Klärung).
            Die Prüfung der Grenzen für Jugendliche setzte den Schultag mit dem
            Tagessoll an — an einem langen Donnerstag ein Verstoss, den es nicht
            gab. Leer bleibt es dabei.
          */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <InputField
                id="unterricht"
                label="Unterricht je Schultag (Std., optional)"
                inputMode="decimal"
                placeholder={
                  grenzPerson ? `leer = Tagessoll, z. B. ${zahlAlsText(Math.round(tagessollStunden(grenzPerson, date) * 100) / 100)}` : 'leer = Tagessoll'
                }
                value={unterricht}
                onChange={(e) => setUnterricht(e.target.value)}
              />
            </div>
            <InfoHint about="Unterricht je Schultag">
              Zählt in der Prüfung der Arbeitszeitgrenzen für Jugendliche statt des Tagessolls — etwa
              „7,5“ oder „7:30“. Leer zählt der Schultag mit dem Tagessoll. Das Zeitkonto rechnet den
              Schultag weiter mit dem Tagessoll. Die Regel ist mit der WKO noch zu klären.
            </InfoHint>
          </div>
        </div>
      )}
      {!showWorkFields && status !== 'Zeitausgleich' && !alsKrankmeldung && !alsUrlaubEintrag && !alsBerufsschule && (
        <p className="text-sm text-ink-muted">
          {status}: keine Arbeitszeit — der Tag wird als voller Solltag gutgeschrieben.
        </p>
      )}
      {status === 'Zeitausgleich' && (
        <div className="space-y-3 text-sm text-ink-muted">
          <p className="flex flex-wrap items-center gap-x-1">
            Das Zeitguthaben sinkt um die freie Zeit{zaStundenweise ? '' : ' — ganzer Tag: um das Tagessoll'}.
            <InfoHint about="Zeitausgleich">
              Beim Zeitausgleich wird keine Arbeitszeit gutgeschrieben — das Zeitguthaben sinkt um die
              freie Zeit, bei einem ganzen Tag um das Tagessoll.
            </InfoHint>
          </p>
          <CheckboxField
            id="zaStundenweise"
            label="Nur einige Stunden"
            checked={zaStundenweise}
            onChange={(e) => setZaStundenweise(e.target.checked)}
          />
          {zaStundenweise && (
            <FormGrid>
              <InputField
                id="zaVon"
                label="Frei von"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                pflicht
              />
              <InputField
                id="zaBis"
                label="Frei bis"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                pflicht
              />
            </FormGrid>
          )}
        </div>
      )}

      {showWorkFields && (
        <>
          {/* Von und Bis nebeneinander, auch am Telefon — sie werden zusammen
              gelesen. Alle drei in einer Reihe erst ab 640 px: auf 375 px
              blieben je Feld 98 px, und das Uhrzeitfeld des Browsers schnitt
              daneben sein Uhrsymbol „07:00" zu „07:0" ab (gemessen). */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3">
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
          </div>

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
                  : // Ein Befund als Hinweiszeile: Dreieck in der Farbe, Satz in Tinte.
                    'hinweiszeile hinweiszeile-warn'
              }
              /*
                Nur der Befund wird angesagt, die normale Zahl nicht: eine
                Vorlesehilfe, die bei jedem Tastendruck im Zeitfeld die
                Arbeitszeit dazwischenruft, macht die Maske unbenutzbar.
              */
              role={bild.befund === 'ok' ? undefined : 'alert'}
            >
              {bild.befund !== 'ok' && <Icon name="warnung" size={16} />}
              <span>
                Arbeitszeit: <strong>{fmtMin(bild.minuten)} Std</strong>
                {zeitSatz(bild) && <span className="block">{zeitSatz(bild)}</span>}
              </span>
            </p>
          )}

          {/*
            NACHTARBEIT OHNE HAKEN (Runde 3, M4). Fällt Zeit in die Nachtzeit,
            steht hier, wie viel davon als Nachtarbeit zählt — in Zeitkonto,
            Lohnliste, Stundennachweis und Rechnung. Abwählen nur mit Grund;
            er steht an der Buchung.
          */}
          {showWorkFields && mitZeiten && nachtImEintrag > 0 && (
            <div className="space-y-2 text-sm">
              <p className="text-ink-muted">
                {nachtAbwahl
                  ? `${fmtMin(nachtImEintrag)} Std. liegen in der Nachtzeit (${nachtzeitText(nacht)}) — abgewählt, sie zählen nicht als Nachtarbeit.`
                  : `${fmtMin(nachtImEintrag)} Std. liegen in der Nachtzeit (${nachtzeitText(nacht)}) und zählen als Nachtarbeit.`}
              </p>
              <CheckboxField
                id="nachtAbwahl"
                label="Nicht als Nachtarbeit zählen"
                checked={nachtAbwahl}
                onChange={(e) => setNachtAbwahl(e.target.checked)}
              />
              {nachtAbwahl && (
                <InputField
                  id="nachtGrund"
                  label="Grund"
                  placeholder="z. B. mit dem Kunden pauschal vereinbart"
                  value={nachtGrund}
                  maxLength={300}
                  onChange={(e) => setNachtGrund(e.target.value)}
                  required
                  pflicht
                />
              )}
            </div>
          )}

          {/*
            Der Umschalter steht VOR den Feldern, die er ein- und ausblendet,
            und nur dort, wo er etwas bewirkt. Ein Monteur sieht ihn nicht —
            für ihn gibt es nichts umzuschalten.
          */}
          {darfErweitern && !aussendienst && (
            <div>
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
              {!erweitert && entry && (entry.projectNumber || entry.isEmergency) && (
                <div className="mt-2">
                  <Hinweiszeile stufe="warn">
                    <p>
                      Dieser Eintrag hat eine Baustelle oder Zuschläge hinterlegt. Speichern ohne
                      erweiterte Erfassung entfernt sie.
                    </p>
                  </Hinweiszeile>
                </div>
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
                meineUid={target?.uid ?? entry?.userId ?? user.uid}
                value={projectNumber}
                onChange={(nr, p) => {
                  setProjectNumber(nr);
                  if (p) setProjects((alt) => (alt.some((x) => x.projectNumber === p.projectNumber) ? alt : [...alt, p]));
                }}
                required
              />
              {/*
                AUFTEILEN (10.10.2026): den Tag am Stück gebucht, danach auf
                die Baustellen verteilt. Geteilt wird die GESPEICHERTE
                Buchung — mit ungespeicherten Änderungen in der Maske wäre
                nicht klar, welcher Stand gilt.
              */}
              {isEdit && entry && status === 'Anwesend' && !aufteilenGeht(entry) && (
                aufteilenUngespeichert ? (
                  <p className="text-sm text-ink-muted">
                    Auf mehrere Baustellen aufteilen geht mit der gespeicherten Buchung — zuerst speichern.
                  </p>
                ) : (
                  <button type="button" className="link" onClick={() => setAufteilenOffen(true)}>
                    Auf mehrere Baustellen aufteilen …
                  </button>
                )
              )}

            </>
          )}
        </>
      )}

      <InputField
        id="comment"
        label={
          status === 'Krank'
            ? 'Anmerkung (freiwillig, keine Diagnose)'
            : /*
                DER KOMMENTAR GEHT AUF DEN KUNDENBELEG (offene Punkte A6): der
                Handwerksschein desselben Tages schlägt ihn als Tätigkeit vor.
                Wer hier „Schlüssel lag nicht da" notiert, soll das wissen.
              */
              status === 'Anwesend' && aktiveModule(company?.modules).has('scheine')
              ? 'Kommentar / Tätigkeiten (wird am Schein vorgeschlagen)'
              : 'Kommentar / Tätigkeiten'
        }
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {canHaveProject && showWorkFields && (
        <>
          {helferFest === null && (
            <CheckboxField
              id="isHelper"
              label="Einsatz als Helfer (zählt nicht zum Projekt-Budget)"
              checked={isHelper}
              onChange={(e) => setIsHelper(e.target.checked)}
            />
          )}
          {aussendienst ? (
            /*
              Der Baustein der Linie (Regel 9). Die Zeile nennt, was darin
              steht — gesetzte Werte, sonst die Felder —, wie im Entwurf
              „Weitere Angaben – …“.
            */
            <WeitereAngaben
              offen={weitereOffen}
              // „optional“ stand vorher als leise Marke daneben; die Zeile der Linie trägt nur Text.
              titel={`Weitere Angaben (optional) – ${
                weitereWerte.length > 0 ? weitereWerte.join(' · ') : 'Wegzeit, Fahrzeug, Helfername, Zuschläge'
              }`}
            >
              {weitereFelder}
            </WeitereAngaben>
          ) : (
            weitereFelder
          )}
        </>
      )}

      {error && <ErrorState message={error} />}

      {/*
        DIE KNÖPFE KLEBEN AM TELEFON UNTEN (Designlinie „Fassung 3"): das
        Formular ist länger als der Bildschirm, und wer „Weitere Angaben"
        aufklappt, soll zum Buchen nicht zurückblättern. Abbrechen links und
        schmal, die Hauptaktion rechts und breit. Erst nach dem Rollen
        (Runde 3, G22): beim Öffnen lag sie über dem Datumsfeld.
      */}
      <Aktionsleiste
        erstNachDemRollen
        links={
          onCancel ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Abbrechen
            </Button>
          ) : undefined
        }
        rechts={
          <Button type="submit" loading={saving} disabled={(!!konflikt && (angefasst || isEdit)) || gesperrt}>
            {isEdit
              ? 'Änderungen speichern'
              : alsKrankmeldung
                ? 'Krank melden'
                : alsUrlaubEintrag
                  ? 'Urlaub eintragen'
                  : alsBerufsschule
                    ? 'Berufsschule eintragen'
                    : 'Zeit buchen'}
          </Button>
        }
      />
    </form>
    {/*
      AUSSERHALB DES FORMULARS: die Knöpfe des Dialogs sind gewöhnliche
      Knöpfe und schickten im Formular dieses gleich noch einmal ab.
    */}
    {entry && user && aufteilenOffen && (
      <AufteilenDialog
        open
        entry={entry}
        companyId={user.companyId}
        onCancel={() => setAufteilenOffen(false)}
        onDone={(anzahl) => {
          setAufteilenOffen(false);
          toast.success(`Aufgeteilt — jetzt ${anzahl + 1} Buchungen an diesem Tag.`);
          onSaved();
        }}
      />
    )}
    <ConfirmDialog
      open={!!rueckfrage}
      title="Grenze für Jugendliche"
      confirmLabel={isEdit ? 'Trotzdem speichern' : 'Trotzdem buchen'}
      confirmTone="primary"
      message={
        besitzerUid && besitzerUid !== user?.uid
          ? `${target?.name ?? grenzPerson?.name ?? entry?.userName ?? 'Die Person'} ist unter 18. Mit dieser Buchung wird eine Grenze des KJBG überschritten. Gespeichert wird trotzdem; die Mitarbeiterübersicht zeigt den Verstoß.`
          : 'Du bist unter 18. Mit dieser Buchung wird eine Grenze des KJBG überschritten. Bitte die Zeiten prüfen; gebucht wird trotzdem, wenn du bestätigst — das Büro sieht den Verstoß.'
      }
      onCancel={() => setRueckfrage(null)}
      onConfirm={async () => {
        setRueckfrage(null);
        await absenden(true);
      }}
    >
      <ul className="space-y-1 text-sm text-ink">
        {(rueckfrage ?? []).map((f) => {
          const { titel, gesetz } = grenzText(f);
          return (
            <li key={`${f.art}-${f.bezug}`}>
              {titel} <span className="text-ink-muted">({gesetz})</span>
            </li>
          );
        })}
      </ul>
    </ConfirmDialog>
    </>
  );
}

/** Trägt ein Eintrag Angaben, die hinter „Weitere Angaben" stehen? */
function hatWeitereAngaben(e?: Partial<TimeEntry>): boolean {
  return !!e && !!(e.travelTime || e.vehiclePlate || e.helperName || e.isEmergency);
}
