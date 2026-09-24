import { useCallback, useEffect, useMemo, useState } from 'react';
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
  tageWort,
} from '@/lib/time';
import { tageMitEchterDoppelung } from '@/lib/tagesbuchungen';
import { shouldShowOvertime } from '@/lib/permissions';
import { bilanzMarker, listBilanzen, monatVon, type Monatsbilanz } from '@/lib/db/monatsbilanzen';
import type { WithId } from '@/lib/db/core';
import type { TimeEntry, AppUser, WorkSheet } from '@/types';
import { listOwnWorkSheetsSince } from '@/lib/db/workSheets';
import {
  offeneNachtraege,
  NACHTRAG_TAGE,
} from '@/features/worksheets/zeitNachtrag';
import InfoHint from '@/components/InfoHint';
import Icon from '@/components/Icon';
import Card from '@/components/Card';
import Metric, { MetricRow } from '@/components/Metric';
import { Marke, Warnung } from '@/components/Badge';
import Zeitmarker from './Zeitmarker';
import { zuschlagszeit, hatZuschlaege } from '@/features/accounting/zuschlaege';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import TimeForm from './TimeForm';
import { KrankmeldungKarte } from '@/features/vacations/Krankmeldungen';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import AntragKnopf from '@/features/time/AntragKnopf';
import { datumAT } from '@/lib/datum';

/** Wie viele Monate die Liste zunaechst zurueckreicht. */
const MONATE_JE_SEITE = 3;

/** Wochenschlüssel 'KW n / JJJJ' für ein Datum. */
function weekKey(d: Date): string {
  const { week, year } = getISOWeek(d);
  return `KW ${week} / ${year}`;
}

/**
 * Zeiterfassung — der vertikale Schnitt: Mitarbeiter erfasst -> Datenbank ->
 * hier live sichtbar, inkl. portiertem Saldo.
 */
export default function TimeView() {
  const { user } = useAuth();
  const toast = useToast();
  /** Die angezeigte Liste — nur das Fenster, nicht die ganze Geschichte. */
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  /*
    Die eigenen unterschriebenen Scheine der letzten zwei Wochen — für die
    Frage, wozu noch kein Zeiteintrag existiert. Eng gefasst geholt, weil
    jeder Schein die beiden Unterschriftsbilder mitträgt und damit rund
    70 KB wiegt.
  */
  const [eigeneScheine, setEigeneScheine] = useState<WithId<WorkSheet>[]>([]);
  /** Was aus einem offenen Nachtrag ins Formular übernommen wurde. */
  const [vorbelegung, setVorbelegung] = useState<{
    date: string;
    projectNumber: string;
    startTime?: string;
    endTime?: string;
    breakDuration?: number;
  } | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WithId<TimeEntry> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<TimeEntry> | null>(null);
  /** Die Krankmeldung, die gerade offen ist — von einem Krank-Tag aus. */
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Wie viele Monate zurück die Liste reicht. */
  const [monate, setMonate] = useState(MONATE_JE_SEITE);

  /**
   * Das eigene Stammdatenblatt — Wochenstunden, Arbeitstage, Eintritt.
   *
   * DER FEHLSCHLAG DARF NICHT STUMM SEIN. Vorher stand hier
   * `catch(() => undefined)`: blieb `profile` null, rechnete der Saldo nicht,
   * und die Kachel zeigte „Kein Startdatum konfiguriert" — also einen
   * Einrichtungsfehler, den niemand beheben kann, für ein Netzproblem. Der
   * Monteur sieht dann eine Aussage über seine Stammdaten, wo eine über die
   * Verbindung stehen müsste.
   */
  const [profilFehler, setProfilFehler] = useState(false);
  const profilLaden = useCallback(() => {
    if (!user) return;
    setProfilFehler(false);
    getUserByUid(user.companyId, user.uid)
      .then(setProfile)
      .catch(() => setProfilFehler(true));
  }, [user]);
  useEffect(profilLaden, [profilLaden]);

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
    /*
      AUCH WAS NOCH KOMMT. Eine Krankmeldung bis Freitag, ein genehmigter
      Urlaub im nächsten Monat — beides steht schon im Zeitkonto, und die
      Liste ist der Ort, an dem man es sieht und von dem aus man zur Meldung
      kommt. Bis heute geladen, fehlte beides; der Hinweis in der Maske („in
      der Liste auf Krankmeldung tippen") lief ins Leere. Ein Jahr voraus
      reicht für jeden Urlaub. Der Saldo zählt Künftiges nicht mit.
    */
    const voraus = new Date();
    voraus.setFullYear(voraus.getFullYear() + 1);
    const bis = localDateStr(voraus);
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

  /**
   * Der laufende Monat — aus den Einträgen, die ohnehin schon da sind.
   *
   * AUS DEM BETRIEB GEMELDET: „das Erfassen einer Zeitbuchung hat lange
   * gedauert." Eine der Ursachen stand hier: nach jeder Buchung holte die
   * Ansicht den laufenden Monat ein ZWEITES Mal vom Server, obwohl das
   * Live-Abo oben ihn längst geliefert hatte — das Fenster reicht drei Monate
   * zurück, der laufende Monat liegt also immer darin.
   *
   * Nebenbei stimmt der Saldo damit besser: die zweite Abfrage hatte keine
   * obere Grenze und zählte auch Buchungen in der ZUKUNFT mit, für die noch
   * gar kein Soll besteht. Der Saldo sah dadurch zu gut aus.
   */
  /** Wie viele Einträge bis heute — die kommenden Abwesenheiten zählen hier nicht. */
  const bisHeute = useMemo(() => {
    const heute = todayStr();
    return entries.filter((e) => e.date <= heute).length;
  }, [entries]);

  const laufendeEintraege = useMemo(() => {
    const jetzt = new Date();
    const monatsErster = localDateStr(new Date(jetzt.getFullYear(), jetzt.getMonth(), 1));
    return entries.filter((e) => e.date >= monatsErster);
  }, [entries]);

  /**
   * Woran der Saldo TATSÄCHLICH hängt.
   *
   * `entries` ist bei jeder Meldung der Live-Verbindung ein neues Array —
   * auch dann, wenn sich inhaltlich nichts geändert hat. An der
   * Array-Identität hängend rechnete der Saldo deshalb doppelt, mit zwei
   * vollen Abfragen je Buchung. Unter Firestore kam die Meldung sogar
   * zweimal (Zwischenspeicher, dann Server); der Fehler wäre ohne das
   * genauso da, nur seltener sichtbar.
   */
  const eintraegeSchluessel = useMemo(
    () =>
      entries
        .map((e) => `${e.id}:${e.date}:${e.status}:${e.startTime ?? ''}-${e.endTime ?? ''}:${e.breakDuration ?? 0}`)
        .join('|'),
    [entries],
  );

  /**
   * Die eigenen Scheine der letzten zwei Wochen holen.
   *
   * STILL BEI EINEM FEHLER, und das ist Absicht: der Nachtrag-Hinweis ist
   * eine ZUSATZangabe. Fiele die ganze Zeiterfassung aus, weil diese Abfrage
   * nicht durchkommt, wäre das Verhältnis zwischen Nutzen und Schaden verkehrt
   * herum — gebucht werden muss auch dann.
   */
  useEffect(() => {
    if (!user) return;
    let verworfen = false;
    const ab = new Date();
    ab.setDate(ab.getDate() - NACHTRAG_TAGE);
    listOwnWorkSheetsSince(user.companyId, user.uid, localDateStr(ab))
      .then((rows) => {
        if (!verworfen) setEigeneScheine(rows);
      })
      .catch(() => undefined);
    return () => {
      verworfen = true;
    };
  }, [user]);

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
        const rows = await listBilanzen(user.companyId, user.uid, monatVon(eintritt));
        if (verworfen) return;
        setBilanzen(rows);
        setSaldoEintraege([]);
      } else {
        const rows = await listOwnEntriesSince(user.companyId, user.uid, eintritt);
        if (verworfen) return;
        setBilanzen(null);
        setSaldoEintraege(rows);
      }
      // Auch hier keine Stille: der Saldo ist die Zahl, auf die es dem
      // Monteur ankommt. Steht sie nicht, muss dastehen, warum.
    })().catch(() => setProfilFehler(true));

    return () => {
      verworfen = true;
    };
    // Der INHALT der Einträge als Auslöser, nicht das Array: nach dem Buchen
    // oder Löschen muss der Saldo neu gerechnet werden, nach einem bloßen
    // Schnappschuss ohne Änderung nicht.
  }, [user, profile?.appStartDate, eintraegeSchluessel]);

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

  /**
   * Tage mit MEHR ALS EINEM Eintrag.
   *
   * WARUM DAS SICHTBAR SEIN MUSS. Die Doppelbuchungs-Sperre vor dem Speichern
   * hat eine Frist von drei Sekunden: antwortet der Server nicht rechtzeitig,
   * wird trotzdem gebucht. Das ist der richtige Tausch — eine Zeit, die sich
   * nicht buchen lässt, kostet den Monteur den Nachtrag am Abend. Aber der
   * Preis dafür ist, dass auf einer zähen Verbindung zwei Einträge am selben
   * Tag entstehen KÖNNEN.
   *
   * Bis hierher war die Begründung „ein Duplikat sieht man ja in der
   * Übersicht" schlicht falsch: zwei Einträge am selben Tag sahen aus wie
   * zwei gewöhnliche Zeilen. Der Saldo zählte beide, und niemand hätte einen
   * Anlass gehabt hinzusehen. Genau so entsteht eine falsche Zahl auf dem
   * Lohnzettel.
   */
  /**
   * NICHT MEHR JEDER TAG MIT ZWEI EINTRAEGEN.
   *
   * Diese Warnung zaehlte bisher die Eintraege je Tag. Seit ein Monteur
   * mehrere Baustellen an einem Tag buchen darf, waere das die Mehrzahl
   * seiner normalen Tage — und eine Warnung, die taeglich grundlos
   * erscheint, wird nach einer Woche nicht mehr gelesen, auch dann nicht,
   * wenn sie einmal recht hat.
   *
   * Gemeldet wird deshalb nur noch, was den Saldo wirklich verfaelscht:
   * dieselbe Baustelle zweimal, zwei Eintraege ohne Baustelle, oder ein
   * ganztaegiger Status doppelt (siehe `lib/tagesbuchungen.ts`).
   */
  const doppelteTage = useMemo(() => tageMitEchterDoppelung(entries), [entries]);

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
   * Die eigenen Zuschlagsstunden im angezeigten Fenster.
   *
   * WARUM DAS HIER STEHT. Nacht- und Notdienststunden gehen seit dem
   * 08.09.2026 in die Lohnausleitung ein — der Zuschlag ist ein Anspruch nach
   * Kollektivvertrag. Sichtbar war er damit aber nur, wenn das Büro eine CSV
   * zog: der Mann selbst sah in seinem Zeitkonto nichts davon und konnte
   * nicht prüfen, ob überhaupt gezählt wird, was er gearbeitet hat.
   *
   * GERECHNET WIRD AUS DEN EINTRÄGEN, DIE OHNEHIN DA SIND — kein zusätzliches
   * Feld, keine zweite Abfrage, kein Nachtlauf. Die Kachel gilt damit für
   * genau das Fenster, das die Liste zeigt, und das steht im Beipacktext.
   * Ein gespeicherter Wert liefe irgendwann auseinander; hier kann er das
   * nicht.
   */
  const zuschlag = useMemo(() => zuschlagszeit(entries), [entries]);

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

  /**
   * Unterschriebene Scheine, zu denen noch kein Zeiteintrag existiert.
   *
   * Abgeleitet, nicht gespeichert: der Hinweis verschwindet von selbst,
   * sobald gebucht ist. Ein Feld „noch nachzutragen" müsste jemand setzen
   * und wieder löschen — und stünde eines Tages für etwas, das längst
   * erledigt ist.
   */
  const nachtraege = useMemo(
    // Der NAME entscheidet, nicht wer den Schein geschrieben hat: warum,
    // steht ausführlich in `zeitNachtrag.ts`.
    () => offeneNachtraege(eigeneScheine, entries, todayStr(), user?.name ?? ''),
    [eigeneScheine, entries, user?.name],
  );

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Zeiterfassung" subtitle="Deine gebuchten Zeiten und dein Saldo" />

      {/*
        AM TELEFON STEHT DIE LISTE WEIT UNTEN — unter Saldo und Maske. Wer nur
        nachsehen will, was er gestern gebucht hat, springt hierüber hin
        (Prüflauf 24.09.2026, D8). Am Schreibtisch ist der Weg kurz genug.
      */}
      <button
        type="button"
        onClick={() => document.getElementById('meine-eintraege')?.scrollIntoView({ behavior: 'smooth' })}
        className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand sm:hidden"
      >
        Zu meinen Einträgen
        <Icon name="chevron" size={16} />
      </button>

      {profilFehler && <TeilFehler was="Dein Stammdatenblatt" onRetry={profilLaden} />}

      {/*
        DIESER HINWEIS STEHT ÜBER DEM SALDO, weil genau der falsch ist.
        Ein doppelt gebuchter Tag zählt zweimal in die Stundenbilanz — und
        wandert von dort auf den Lohnzettel. Ein Abzeichen unten in der Liste
        findet nur, wer ohnehin schon sucht.
      */}
      {/*
        OFFENE NACHTRAGUNGEN — unterschriebene Scheine ohne Zeiteintrag.

        Sie stehen GANZ OBEN, noch vor dem Saldo, weil hier zweierlei fehlt:
        Geld und eine gesetzlich vorgeschriebene Aufzeichnung. Die Rechnung
        rechnet ihre Stunden aus den Zeiteinträgen, nicht vom Schein — eine
        nie gebuchte Stunde wird nie verrechnet.
      */}
      {nachtraege.length > 0 && (
        <div
          className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-warning"
          role="alert"
        >
          <p className="flex flex-wrap items-center gap-1">
            <strong>
              {nachtraege.length === 1
                ? 'Ein unterschriebener Schein wartet noch auf deine Zeitbuchung.'
                : `${nachtraege.length} unterschriebene Scheine warten noch auf deine Zeitbuchung.`}
            </strong>
            <InfoHint about="offene Nachtragungen">
              <strong>Warum das hier steht.</strong> Du hast beim Kunden einen Schein
              ausgestellt und die Zeit dort eingetragen — der Kunde hat sie unterschrieben. In
              deinem Zeitkonto ist sie damit aber noch nicht. Die Rechnung an den Kunden rechnet
              ihre Stunden aus der ZEITERFASSUNG, nicht vom Schein; der Schein liefert nur das
              Material.
              <br />
              <br />
              <strong>Vergessen kostet doppelt.</strong> Die Stunde wird nie verrechnet — nicht
              „später korrigiert", sondern nie —, und in deinem Zeitkonto fehlt sie ebenfalls.
              Der Betrieb muss die Arbeitszeit ausserdem aufzeichnen (§ 26 AZG); ein Schein
              erfüllt das nicht.
              <br />
              <br />
              <strong>Warum nicht automatisch gebucht wird.</strong> Der Schein kennt nur die
              Zeit beim Kunden. Er kennt weder deine <strong>Anfahrt</strong> noch das{' '}
              <strong>Fahrzeug (Kennzeichen)</strong>, weder Nacht- oder Notdienstzuschlag noch
              den Rest deines Arbeitstags. Ein automatisch erzeugter Eintrag wäre zu niedrig und
              sähe trotzdem vollständig aus — und niemand sähe je wieder hin.
              <br />
              <br />
              <strong>Was der Knopf tut.</strong> Er öffnet das Formular mit Datum, Baustelle,
              Von, Bis und Pause vom Schein. Ergänzen musst du{' '}
              <strong>Anfahrt, Fahrzeug (Kennzeichen)</strong> und die Haken für Nacht,
              Notdienst und Helfer — unter „Weitere Angaben".
              <br />
              <br />
              <strong>Der Hinweis verschwindet von selbst</strong>, sobald für diesen Tag und
              diese Baustelle ein Eintrag steht. Die Minuten werden nicht verglichen: dein
              Arbeitstag ist regelmässig länger als die Zeit beim Kunden, und das ist richtig
              so. Erinnert wird {NACHTRAG_TAGE} Tage lang — was älter ist, klärt das Büro.
            </InfoHint>
          </p>
          <ul className="mt-2 space-y-2">
            {nachtraege.map((n) => (
              <li key={n.schein.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink">
                  {datumAT(n.schein.datum)} · {n.schein.customerName} · Baustelle{' '}
                  {n.schein.projectNumber} · {fmtMin(n.minuten)} beim Kunden
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    /*
                      Ein laufendes Bearbeiten wird beendet: sonst stünde die
                      Vorbelegung im Formular für einen ANDEREN Eintrag, und
                      der Monteur überschriebe versehentlich eine fremde
                      Buchung mit den Zeiten dieses Scheins.
                    */
                    setEditing(null);
                    setVorbelegung({
                      date: n.schein.datum,
                      projectNumber: n.schein.projectNumber,
                      startTime: n.von,
                      endTime: n.bis,
                      breakDuration: n.pauseMin,
                    });
                  }}
                >
                  Zeit nachtragen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {doppelteTage.size > 0 && (
        <p
          className="rounded border border-line bg-surface-2 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          <strong>
            {doppelteTage.size === 1
              ? 'An einem Tag steht dieselbe Buchung zweimal.'
              : `An ${doppelteTage.size} Tagen steht dieselbe Buchung zweimal.`}
          </strong>{' '}
          Der Saldo zählt beide. Betroffen:{' '}
          {[...doppelteTage].sort().map(datumAT).join(', ')} — bitte unten in der Liste den
          überflüssigen Eintrag löschen. Mehrere Baustellen an einem Tag sind
          dagegen in Ordnung und stehen hier nicht.
        </p>
      )}

      <MetricRow>
        <Metric
          label="Einträge"
          value={bisHeute}
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
          /*
            ZAHLEN IN DIESER APP SCHREIBEN SICH OESTERREICHISCH. Hier stand
            `${saldo.saldoH} h` — die rohe JS-Zahl, also „-1366.75 h" mit
            PUNKT, waehrend zwei Zeilen weiter „8,00 h" und in den Rechnungen
            „€ 22 104,60" steht. Ein Punkt als Dezimaltrennzeichen liest sich
            im Deutschen als Tausenderpunkt und damit als ganz andere Zahl.
          */
          value={
            saldo?.hasConfig
              ? `${saldo.saldoH > 0 ? '+' : ''}${saldo.saldoH.toLocaleString('de-AT', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} h`
              : '—'
          }
          hint={
            !saldo?.hasConfig
              ? 'Kein Startdatum konfiguriert'
              : saldo.daysWithoutEntry > 0
                ? `${tageWort(saldo.daysWithoutEntry)} ohne Buchung — unvollständig`
                : 'Über-/Unterstunden'
          }
        />
        )}
        <Metric label="Diese Woche" value={fmtMin(thisWeekMin)} />
        {/*
          NUR WENN ES WELCHE GIBT. Eine Kachel, die bei den allermeisten
          dauerhaft „0:00" zeigt, nimmt auf dem Telefon die Breite weg, die
          Saldo und Wochensumme brauchen — und sagt nichts.

          Der Wert ist die VEREINIGUNG, nicht die Summe: Nacht und Notdienst
          schliessen einander nicht aus, der Rohrbruch um zwei Uhr früh ist
          beides. Addiert stünde er doppelt da. Die Aufschlüsselung steht im
          Beipacktext, dort auch die Überschneidung.
        */}
        {hatZuschlaege(zuschlag) && (
          <Metric
            label="Zuschlag"
            value={fmtMin(zuschlag.nachtMin + zuschlag.notdienstMin - zuschlag.beidesMin)}
            hint={
              `Nacht ${fmtMin(zuschlag.nachtMin)} · Notdienst ${fmtMin(zuschlag.notdienstMin)}` +
              (zuschlag.beidesMin > 0 ? ` · ${fmtMin(zuschlag.beidesMin)} beides` : '') +
              ` · letzte ${monate} Monate`
            }
          />
        )}
      </MetricRow>

      <Card title={editing ? 'Eintrag bearbeiten' : 'Neuen Eintrag erfassen'}>
        <TimeForm
          /*
            Der Schlüssel trägt die Vorbelegung mit: die Felder werden mit
            `useState` INITIALISIERT, und ein React-Zustand ändert sich nicht,
            weil eine Eigenschaft sich ändert. Ohne den neuen Schlüssel bliebe
            das Formular auf dem alten Stand stehen, und der Klick auf
            „Zeit nachtragen" täte sichtbar nichts.
          */
          key={editing?.id ?? (vorbelegung ? `nachtrag-${vorbelegung.date}-${vorbelegung.projectNumber}` : 'new')}
          entry={editing ?? undefined}
          lastEntry={lastEntry}
          vorbelegung={editing ? null : vorbelegung}
          onSaved={() => {
            setEditing(null);
            // Die Vorbelegung ist verbraucht. Bliebe sie stehen, käme sie
            // beim nächsten Eintrag unbemerkt wieder hoch.
            setVorbelegung(null);
          }}
          onCancel={
            editing
              ? () => setEditing(null)
              : vorbelegung
                ? () => setVorbelegung(null)
                : undefined
          }
        />
      </Card>

      {meldung && (
        <KrankmeldungKarte
          key={meldung}
          companyId={user.companyId}
          id={meldung}
          meinName={user.name}
          mitNamen={false}
          // Die Einträge kommen live nach; die Karte hat ihren Dienst getan.
          onGeaendert={() => setMeldung(null)}
          onSchliessen={() => setMeldung(null)}
        />
      )}

      <Card title="Meine Einträge" id="meine-eintraege">
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
                          : e.status === 'Zeitausgleich' && e.startTime && e.endTime
                            ? `Zeitausgleich ${e.startTime}–${e.endTime}`
                            : e.status;
                      const subtitle = [timeLabel, e.comment].filter(Boolean).join(' · ');
                      return (
                        <ListRow
                          key={e.id}
                          title={
                            <span>
                              {datumAT(e.date)}
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
                          {doppelteTage.has(e.date) && (
                            <Warnung stufe="dringend">doppelt gebucht</Warnung>
                          )}
                          {e.source === 'voice' && <Marke>KI</Marke>}
                          <Zeitmarker eintrag={e} />
                          <span className="tnum font-medium text-ink">
                            {fmtMin(calcWorkMin(e))}
                          </span>
                          {/* Verrechnete Einträge sind Grundlage einer
                              verschickten Rechnung und bleiben gesperrt. */}
                          {e.isBilled ? (
                            <Marke>verrechnet</Marke>
                          ) : e.krankmeldungId ? (
                            // Ein Tag einer Krankmeldung wird nur über sie
                            // geändert — Ende ändern oder löschen.
                            <Button variant="ghost" onClick={() => setMeldung(e.krankmeldungId!)}>
                              Krankmeldung
                            </Button>
                          ) : e.vacationId ? (
                            // Ein Tag aus einem genehmigten Antrag ändert sich
                            // nur über den Antrag.
                            <AntragKnopf eintrag={e} />
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
        message={toDelete ? `Der Eintrag vom ${datumAT(toDelete.date)} wird endgültig entfernt.` : ''}
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
