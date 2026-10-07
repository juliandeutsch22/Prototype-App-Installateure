import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listRecentWorkSheets,
  listSignedWorkSheetsInRange,
  listWorkSheetsInRange,
  searchWorkSheets,
  listWorkSheetsForProject,
  cancelWorkSheet,
  discardWorkSheetDraft,
  restoreWorkSheetDraft,
} from '@/lib/db/workSheets';
import { buildWorkSheetPdf, shareOrDownloadPdf } from './worksheetPdf';
import Fotostreifen from './Fotostreifen';
import Nachladen from '@/components/Nachladen';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import {
  scheineOhneBuchung,
  minutenOhneBuchung,
  nochNichtGeprueft,
  OFFEN_AB_TAGEN,
} from './fehlendeZeitbuchung';
import { deuteSuche, suchHinweis } from './scheinSuche';
import { isGF, canWriteWorkSheet, canEditTime, canInvoice } from '@/lib/permissions';
import { fmtDauer, tageWort, todayStr } from '@/lib/time';
import type { TimeEntry, WorkSheet } from '@/types';
import type { WithId } from '@/lib/db/core';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { Warnung, Zustand, type Stand } from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import BottomSheet from '@/components/BottomSheet';
import Abschnitt from '@/components/Abschnitt';
import { MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import Adressfilter from '@/components/Adressfilter';
import { scheineAufRechnung } from '@/lib/db/invoices';
import { SCHEIN_FILTER, bekannt } from '@/features/dashboard/start/ziele';
import { AUFFAELLIG_AB_TAGEN, UNVERRECHNET_BASIS, unverrechneteScheine } from './unverrechnet';

const STAND: Record<WorkSheet['status'], Stand> = {
  Unterschrieben: 'gut',
  Entwurf: 'laeuft',
  // Kein Rot: weder der Storno noch der aufgegebene Entwurf ist ein
  // Zwischenfall. Der eine ist die vorgesehene Korrektur, der andere der
  // Normalfall eines geplatzten Auftrags — beide sind abgeschlossen.
  Storniert: 'ruht',
  Verworfen: 'ruht',
};

/**
 * Die Handwerksscheine des Betriebs.
 *
 * Für das Büro der Beleg zur Rechnung, für die Baustelle der Nachweis. Ein
 * unterschriebener Schein lässt sich hier ansehen und als PDF weitergeben,
 * aber nicht mehr ändern — Korrekturen laufen ausschließlich über einen
 * Storno und einen neuen Schein.
 */
/**
 * Wie viele Handwerksscheine auf einmal geholt werden.
 *
 * Bewusst niedrig: ein unterschriebener Schein wiegt rund 70 KB, weil er die
 * beiden Unterschriftsbilder mitträgt. Die Zahl ist hier keine Frage der
 * Übersicht, sondern der Leitung.
 */
const SCHEINE_JE_SEITE = 50;

/**
 * Wie viele Scheine die tiefe Prüfung höchstens holt.
 *
 * Dieselbe Rechnung wie oben, nur über einen längeren Zeitraum: rund 70 KB je
 * unterschriebenem Schein. Hundertfünfzig sind knapp elf Megabyte — viel für
 * eine Ansicht, vertretbar für einen bewussten Griff am Bürorechner. Wird die
 * Grenze erreicht, sagt die Karte es; sie schneidet nicht still ab.
 */
const PRUEF_GRENZE = 150;

/** Zeiträume, die sich prüfen lassen. */
const PRUEF_ZEITRAEUME = [30, 90, 365];

/**
 * Wie viele Zeilen eine Gruppe zeigt, bevor „und N weitere“ kommt (Linie
 * „Lot“, Regel 4). Fünfzig Scheine untereinander sind am Telefon eine Wand;
 * zwanzig reichen für den Alltag, der Rest ist einen Tipp entfernt.
 */
const GRUPPE_MAX = 20;

/**
 * Die Ansicht der Liste (Regel 4: Arbeitsstand als Standard).
 *
 * „Offen“ ist, woran noch jemand etwas tun muss: Entwürfe, und fürs Büro die
 * unterschriebenen Scheine, die noch auf keiner Rechnung stehen. „Alle“ ist
 * der ganze geladene Bestand, wie die Liste bis zum Umbau stand.
 */
type Ansicht = 'offen' | 'alle';
const ANSICHTEN: readonly { wert: Ansicht; text: string }[] = [
  { wert: 'offen', text: 'Offen' },
  { wert: 'alle', text: 'Alle' },
];

/**
 * Eine Gruppe von Zeilen, nach zwanzig abgeschnitten — sichtbar, mit der Zahl
 * dessen, was noch kommt. Die Scheine sind schon geladen; „und N weitere“
 * zeigt sie nur, es holt nichts nach (das tut „Weitere Scheine laden“).
 */
function Gruppe<T>({ eintraege, zeile }: { eintraege: T[]; zeile: (e: T) => ReactNode }) {
  const [alle, setAlle] = useState(false);
  const gezeigt = alle ? eintraege : eintraege.slice(0, GRUPPE_MAX);
  return (
    <>
      <List>{gezeigt.map(zeile)}</List>
      <MehrAnzeigen anzahl={eintraege.length - gezeigt.length} onClick={() => setAlle(true)} />
    </>
  );
}

export default function WorkSheetsListView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const [suchparameter, setSuchparameter] = useSearchParams();
  const markiert = suchparameter.get('markiert');
  /*
    „Nicht verrechnet“ aus der Adresse (Startseite, Nachtest 01.10.2026):
    unterschriebene Scheine auf keiner gültigen Rechnung — dieselbe Rechnung
    wie unter Rechnungen und auf der Startseite, über dieselben jüngsten
    Scheine. „…-alt“: nur die über vier Wochen.
  */
  const nurUnverrechnet = bekannt(SCHEIN_FILTER, suchparameter.get('filter'));
  /*
    DIE ANSICHT STEHT IN DER ADRESSE (Protokoll 7.5), damit „Zurück“ und ein
    Lesezeichen sie wiederherstellen. Kommt jemand mit `markiert` (nach dem
    Unterschreiben, von der Startseite), steht er in „Alle“: der markierte
    Schein ist meist unterschrieben und gehörte sonst in keine offene Gruppe.
  */
  const ansichtWert = suchparameter.get('ansicht');
  const ansicht: Ansicht =
    ansichtWert === 'alle' || ansichtWert === 'offen' ? ansichtWert : markiert ? 'alle' : 'offen';
  function ansichtSetzen(neu: Ansicht) {
    const p = new URLSearchParams(suchparameter);
    p.set('ansicht', neu);
    setSuchparameter(p, { replace: true });
  }
  /*
    OB EIN SCHEIN VERRECHNET IST, weiss nur, wer Rechnungen lesen darf —
    dieselben Rollen, denen die Startseite „Nicht verrechnet“ zeigt. Für alle
    anderen gibt es diese Gruppe nicht; die Abfrage bliebe an den Rechten
    hängen und ergäbe ein falsches „alles unverrechnet“.
  */
  const verrechnungSehen = !!user && canInvoice(user.role);
  const mitVerrechnung = !!nurUnverrechnet || verrechnungSehen;

  const [scheine, setScheine] = useState<WithId<WorkSheet>[]>([]);
  /*
    WIE WEIT DIE LISTE ZURÜCKREICHT — und hier wiegt jeder Datensatz schwer.

    Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG im
    Dokument; nachgemessen sind das rund 70 KB je Schein. Hundert Scheine
    waren damit knapp sieben Megabyte, bei jedem Öffnen dieser Ansicht. Fünfzig
    decken bei einem Fünf-Mann-Betrieb gut einen Monat ab, und wer weiter
    zurück muss, lädt nach — sichtbar, statt es nie zu erfahren.
  */
  // Mit der Verrechnung über dieselben jüngsten Scheine wie Startseite und Rechnungen (UNVERRECHNET_BASIS).
  const [grenze, setGrenze] = useState(mitVerrechnung ? Math.max(SCHEINE_JE_SEITE, UNVERRECHNET_BASIS) : SCHEINE_JE_SEITE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  /** Der Schein im Seitenfenster — seine Kennung, gesucht in allem, was geladen ist. */
  const [offen, setOffen] = useState<string | null>(markiert);
  const [stornoFuer, setStornoFuer] = useState<WithId<WorkSheet> | null>(null);
  const [stornoGrund, setStornoGrund] = useState('');
  const [verwerfenFuer, setVerwerfenFuer] = useState<WithId<WorkSheet> | null>(null);
  const [zeigeVerworfene, setZeigeVerworfene] = useState(false);
  const [busy, setBusy] = useState(false);

  const darfStornieren = user ? isGF(user.role) : false;
  /**
   * Wer darf einen Entwurf weiterbearbeiten?
   *
   * DIESELBE Prüfung wie die Route dahinter — sonst führte der Knopf für die
   * Buchhaltung und die Verwaltung, die diese Liste ebenfalls sehen, auf eine
   * Seite mit „Kein Zugriff".
   */
  const darfSchreiben = user ? canWriteWorkSheet(user.role) : false;
  /**
   * Und DIESEN einen Schein: die Führung jeden, der Monteur seinen eigenen.
   *
   * Seit dem Prüflauf vom 25.09.2026 (P3-10) steht dieselbe Grenze in der
   * Datenbank (`app.schein_schreibt`). Vorher liess sie jeden im Betrieb an
   * jeden Entwurf, und die Liste bot es entsprechend an.
   */
  const darfDiesen = (s: WorkSheet) =>
    darfSchreiben && !!user && (isGF(user.role) || s.erstelltVonUid === user.uid);

  const laden = useMemo(
    () => async () => {
      if (!user) return;
      setLoading(true);
      try {
        setScheine(await listRecentWorkSheets(user.companyId, grenze));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user, grenze],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  /*
    DIE KOLLEGENZEILE, AN DIE NIEMAND ERINNERT WIRD — nur fürs Büro.

    Der Nachtrag in der Zeiterfassung deckt nur die EIGENEN Zeilen des
    Monteurs ab, und das muss so bleiben: in derselben Tabelle stehen
    Kranken- und Urlaubstage der Kollegen, also Gesundheitsdaten nach Art. 9
    DSGVO. Der Zeilenschutz lässt den Monteur deshalb nur an die
    eigenen Einträge.

    Trägt er auf dem Schein die Zeile eines Kollegen ein, hat sie damit
    niemanden, der an sie erinnert wird: der Monteur sieht fremde Buchungen
    nicht, der Kollege sieht den fremden Schein nicht. Die Stunde steht
    unterschrieben beim Kunden — und wird nie gebucht, also nie verrechnet
    und nie aufgezeichnet.

    GELADEN WIRD NUR FÜR DIE, DIE ES AUCH DÜRFEN. `canEditTime` ist genau
    die Rolle, die fremde Zeiteinträge sehen UND anlegen darf; für alle
    anderen bliebe die Abfrage an den Regeln hängen und produzierte nichts
    als einen Fehler in einer Ansicht, die sie sonst benutzen können.
  */
  const [buchungen, setBuchungen] = useState<
    Array<Pick<TimeEntry, 'date' | 'status' | 'projectNumber' | 'userName'>>
  >([]);
  const darfZeitenSehen = user ? canEditTime(user.role) : false;

  /*
    WIE WEIT DIE PRÜFUNG ZURÜCKREICHT — und warum das eine Wahl ist.

    Zuerst über die Scheine, die die Liste ohnehin geladen hat: das kostet
    keine zusätzliche Abfrage und deckt den Alltag ab. Gerade der ALTE Schein
    ist aber der teure — was vier Monate zurückliegt, bucht niemand mehr von
    selbst nach, und der lag ausserhalb der geladenen fünfzig.

    Weiter zurück wird deshalb auf Anforderung geprüft, nicht bei jedem
    Aufruf. Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG
    im Dokument, rund 70 KB je Stück; ein Jahr wären schnell zwanzig
    Megabyte. Das ist als bewusster Griff des Büros vertretbar, als stiller
    Nebeneffekt beim Öffnen eines Reiters nicht.
  */
  const [tiefePruefung, setTiefePruefung] = useState<number | null>(null);
  const [tiefeScheine, setTiefeScheine] = useState<WithId<WorkSheet>[] | null>(null);
  const [pruefungLaeuft, setPruefungLaeuft] = useState(false);

  /** Die Scheine, über die geprüft wird: die tiefe Prüfung schlägt die Liste. */
  const pruefBasis = tiefeScheine ?? scheine;

  /* Der Zeitraum für die Buchungen folgt der Prüfbasis, nicht dem Kalender:
     ein fester Monat holte entweder zu wenig oder viel zu viel. */
  const zeitraum = useMemo(() => {
    const tage = pruefBasis
      .filter((s) => s.status === 'Unterschrieben')
      .map((s) => s.datum)
      .sort();
    if (tage.length === 0) return null;
    return { von: tage[0], bis: tage[tage.length - 1] };
  }, [pruefBasis]);

  useEffect(() => {
    if (!user || !darfZeitenSehen || !zeitraum) {
      setBuchungen([]);
      return;
    }
    let abgemeldet = false;
    listEntriesInRange(user.companyId, zeitraum.von, zeitraum.bis)
      .then((rows) => {
        if (!abgemeldet) setBuchungen(rows);
      })
      /*
        STILL SCHEITERN, ABER NUR HIER. Die Scheinliste ist das, wofür diese
        Seite da ist; sie darf nicht wegen einer Zusatzauswertung mit einer
        Fehlermeldung stehenbleiben. Bleibt die Abfrage aus, bleibt die Karte
        leer — und die Karte sagt selbst, worauf sie sich stützt.
      */
      .catch(() => undefined);
    return () => {
      abgemeldet = true;
    };
  }, [user, darfZeitenSehen, zeitraum]);

  /** Weiter zurück prüfen — auf Anforderung, mit gewähltem Zeitraum. */
  async function tieferPruefen(tage: number) {
    if (!user) return;
    setPruefungLaeuft(true);
    try {
      const bis = todayStr();
      const von = new Date(Date.parse(`${bis}T00:00:00Z`) - tage * 86_400_000)
        .toISOString()
        .slice(0, 10);
      setTiefeScheine(await listSignedWorkSheetsInRange(user.companyId, von, bis, PRUEF_GRENZE));
      setTiefePruefung(tage);
    } catch {
      // Auch hier still: die Liste darunter bleibt benutzbar. Der Zustand
      // bleibt auf dem alten Stand, statt fälschlich „nichts offen" zu sagen.
      setTiefeScheine(null);
      setTiefePruefung(null);
    } finally {
      setPruefungLaeuft(false);
    }
  }

  const ohneBuchung = useMemo(
    () => (darfZeitenSehen ? scheineOhneBuchung(pruefBasis, buchungen, todayStr()) : []),
    [darfZeitenSehen, pruefBasis, buchungen],
  );

  /** Unterschriebene Scheine der letzten Tage — noch nicht geprüft (H2). */
  const zuJung = useMemo(
    () => (darfZeitenSehen ? nochNichtGeprueft(pruefBasis, todayStr()) : 0),
    [darfZeitenSehen, pruefBasis],
  );

  const verworfene = useMemo(
    () => scheine.filter((s) => s.status === 'Verworfen').length,
    [scheine],
  );

  /**
   * Verworfene bleiben in der Datenbank, aber nicht im Weg.
   *
   * Sie AUCH aus der Ansicht zu nehmen waere das Loeschen durch die
   * Hintertuer: was niemand mehr sehen kann, ist verschwunden. Der Schalter
   * nennt deshalb ihre Zahl — auch eingeklappt sagt die Liste, was sie
   * gerade nicht zeigt.
   */
  /*
    SUCHE ÜBER DEN GELADENEN BESTAND HINAUS.

    Das Feld filterte bis hierher nur die geladenen fünfzig im Browser. Ein
    Schein vom März war damit nicht auffindbar, egal was jemand eintippte —
    und das Feld sagte nichts dazu, es lieferte einfach kein Ergebnis.
    Dieselbe Fehlerform wie beim Buchhaltungs-Export damals: eine leere
    Antwort, die wie ein Befund aussieht.

    Serverseitig gehen Baustellennummer (exakt), Zeitraum und seit 30.09.2026
    auch Kundenname und Notiz (siehe `scheinSuche.ts`).
  */
  const [treffer, setTreffer] = useState<WithId<WorkSheet>[] | null>(null);
  const [trefferZu, setTrefferZu] = useState('');
  const [sucheLaeuft, setSucheLaeuft] = useState(false);
  const absicht = useMemo(() => deuteSuche(suche), [suche]);

  async function serverseitigSuchen() {
    if (!user || !suche.trim()) return;
    setSucheLaeuft(true);
    try {
      const gefunden =
        absicht.art === 'baustelle'
          ? await listWorkSheetsForProject(user.companyId, absicht.nummer, PRUEF_GRENZE)
          : absicht.art === 'zeitraum'
            ? await listWorkSheetsInRange(user.companyId, absicht.von, absicht.bis, PRUEF_GRENZE)
            : await searchWorkSheets(user.companyId, absicht.text, PRUEF_GRENZE);
      setTreffer(gefunden);
      setTrefferZu(suche.trim());
    } catch (e) {
      // Sichtbar, nicht still: wer sucht, wartet auf eine Antwort. „Nichts
      // gefunden" wäre hier die falsche — es wurde gar nicht gesucht.
      setError((e as Error).message);
      setTreffer(null);
    } finally {
      setSucheLaeuft(false);
    }
  }

  /*
    Das Ergebnis gilt für GENAU den Begriff, mit dem es geholt wurde. Tippt
    jemand weiter, ist es veraltet und verschwindet — stehen zu bleiben hiesse,
    Scheine unter einem Suchbegriff zu zeigen, zu dem sie nicht passen.
  */
  const trefferGelten = treffer !== null && trefferZu === suche.trim() && trefferZu !== '';

  /** Welche der geladenen Scheine auf einer gültigen Rechnung stehen — nur mit dem Filter geholt. */
  const [verrechnet, setVerrechnet] = useState<string[] | null>(null);
  const scheinSchluessel = useMemo(() => scheine.map((x) => x.id).join('|'), [scheine]);
  useEffect(() => {
    if (!user || !mitVerrechnung) {
      setVerrechnet(null);
      return;
    }
    let weg = false;
    scheineAufRechnung(user.companyId, scheinSchluessel ? scheinSchluessel.split('|') : [])
      .then((ids) => { if (!weg) setVerrechnet(ids); })
      .catch(() => { if (!weg) setVerrechnet([]); });
    return () => {
      weg = true;
    };
  }, [user, mitVerrechnung, scheinSchluessel]);
  /*
    Die unverrechneten Scheine, ÄLTESTE ZUERST — dieselbe Reihenfolge wie auf
    der Startseite (Regel 7.3: nach Dringlichkeit). Eine Leistung von
    vorgestern ist normal, eine von vor drei Monaten ist ein Befund.
  */
  const unverrechnetAlle = useMemo(() => {
    if (!mitVerrechnung || !verrechnet) return null;
    const zeilen = unverrechneteScheine(scheine, [{ linkedWorkSheets: verrechnet, paymentStatus: 'Offen' }], todayStr());
    return (nurUnverrechnet === 'nicht-verrechnet-alt' ? zeilen.filter((z) => z.tage >= AUFFAELLIG_AB_TAGEN) : zeilen)
      .map((z) => z.schein);
  }, [mitVerrechnung, nurUnverrechnet, verrechnet, scheine]);
  /** Nur für den Filter aus der Adresse: welche Scheine er durchlässt. */
  const unverrechnet = useMemo(
    () => (nurUnverrechnet && unverrechnetAlle ? new Set(unverrechnetAlle.map((s) => s.id)) : null),
    [nurUnverrechnet, unverrechnetAlle],
  );

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    // Unter dem Filter „nicht verrechnet“ älteste zuerst, sonst wie geladen (jüngste zuerst).
    const grundmenge = trefferGelten
      ? (treffer as WithId<WorkSheet>[])
      : unverrechnet && unverrechnetAlle
        ? unverrechnetAlle
        : scheine;
    return grundmenge.filter((s) => {
      if (unverrechnet && !unverrechnet.has(s.id)) return false;
      if (s.status === 'Verworfen' && !zeigeVerworfene) return false;
      // Das Serverergebnis ist bereits die Antwort auf den Begriff; noch
      // einmal danach zu filtern würde einen Treffer wegwerfen, dessen
      // Baustellennummer anders geschrieben ist („PR-2026-042").
      if (!q || trefferGelten) return true;
      return [s.customerName, s.projectNumber, s.datum, s.notizen].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [scheine, treffer, trefferGelten, suche, zeigeVerworfene, unverrechnet, unverrechnetAlle]);

  /*
    DIE OFFENE ANSICHT — nur ohne Suchbegriff und ohne Filter aus der Adresse.
    Die Suche geht über ALLE Scheine, egal welche Ansicht gewählt ist: wer
    einen bestimmten Schein sucht, soll ihn nicht deshalb nicht finden, weil
    er unterschrieben ist. Solange gesucht wird, stehen die Segmente deshalb
    nicht da — sie würden eine Eingrenzung versprechen, die nicht gilt.
  */
  const offeneAnsicht = ansicht === 'offen' && !suche.trim() && !nurUnverrechnet;
  const entwuerfe = useMemo(() => scheine.filter((s) => s.status === 'Entwurf'), [scheine]);
  const verworfenListe = useMemo(() => scheine.filter((s) => s.status === 'Verworfen'), [scheine]);

  /** Der Schein im Seitenfenster: aus der Liste, der tiefen Prüfung oder der Suche. */
  const offenerSchein = useMemo(
    () =>
      offen
        ? [...scheine, ...(tiefeScheine ?? []), ...(treffer ?? [])].find((s) => s.id === offen) ?? null
        : null,
    [offen, scheine, tiefeScheine, treffer],
  );

  async function pdfAusgeben(s: WithId<WorkSheet>) {
    setBusy(true);
    try {
      // Der ganze Firmensatz, nicht nur der Name: der Beleg soll sagen, an
      // wen der Kunde sich wenden muss.
      const blob = await buildWorkSheetPdf(s, {
        name: company?.name ?? 'Installateur',
        addressLine: company?.addressLine,
        contactLine: company?.contactLine,
        logoUrl: company?.logoUrl,
      });
      const art = await shareOrDownloadPdf(
        blob,
        `Handwerksschein_${s.projectNumber}_${s.datum}.pdf`,
      );
      toast.success(art === 'geteilt' ? 'Schein geteilt' : 'PDF gespeichert');
    } catch {
      setError('Das PDF konnte nicht erzeugt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function wiederAufnehmen(s: WithId<WorkSheet>) {
    setBusy(true);
    try {
      await restoreWorkSheetDraft(s.id);
      toast.success('Entwurf wieder aufgenommen');
      await laden();
    } catch (err) {
      setError(grundAus(err, 'Der Entwurf ließ sich nicht zurückholen.'));
    } finally {
      setBusy(false);
    }
  }

  function fensterZu() {
    setOffen(null);
    setStornoFuer(null);
    setStornoGrund('');
  }

  if (!user) return null;

  /*
    DIE ZEILE EINES SCHEINS (Linie „Lot“, Regel 3): die ganze Zeile öffnet
    den Schein im Seitenfenster, rechts steht genau EIN Knopf für den
    häufigsten nächsten Schritt.

    Bis zum Umbau standen hier bis zu vier Knöpfe nebeneinander (Details, PDF,
    Weiterbearbeiten, Verwerfen) und die Einzelheiten klappten zwischen den
    Zeilen auf. Jetzt stehen Einzelheiten und ALLE Aktionen im Fenster; in der
    Zeile bleibt, was man am häufigsten tut: am eigenen Entwurf
    weiterschreiben, einen verworfenen wieder aufnehmen, sonst das PDF.
  */
  const scheinZeile = (s: WithId<WorkSheet>) => {
    const gesamt = s.zeiten.reduce((n, z) => n + z.minuten, 0);
    return (
      <ListRow
        key={s.id}
        wert={fmtDauer(gesamt)}
        zustand={<Zustand stand={STAND[s.status]}>{s.status}</Zustand>}
        onOeffnen={() => setOffen(s.id)}
        title={
          <span>
            {s.customerName}{' '}
            <span className="text-sm font-normal text-ink-muted">
              <span className="nr">({s.projectNumber})</span>
            </span>
          </span>
        }
        subtitle={
          <>
            {datumAT(s.datum)} · {s.abrechnung}
            {s.unterschriften?.kunde && (
              <span className="mt-1 block text-xs text-ink-muted">
                Unterschrieben von {s.unterschriften.kunde.name}
              </span>
            )}
            {s.status === 'Verworfen' && (
              <span className="mt-1 block text-xs text-ink-muted">
                Verworfen
                {s.verworfenVonName ? ` von ${s.verworfenVonName}` : ''} — nicht
                weiterbearbeitet, nicht gelöscht.
              </span>
            )}
            {s.stornoGrund && (
              <span className="mt-1 block text-xs text-danger">
                Storno: {s.stornoGrund}
                {s.storniertVonName ? ` (${s.storniertVonName})` : ''}
              </span>
            )}
          </>
        }
      >
        {darfDiesen(s) && s.status === 'Entwurf' ? (
          weiterbearbeitenLink(s)
        ) : darfDiesen(s) && s.status === 'Verworfen' ? (
          <Button variant="secondary" loading={busy} onClick={() => void wiederAufnehmen(s)}>
            Wieder aufnehmen
          </Button>
        ) : (
          <Button variant="ghost" loading={busy} onClick={() => pdfAusgeben(s)}>
            PDF
          </Button>
        )}
      </ListRow>
    );
  };

  /*
    „Als Entwurf speichern" war bis hierher eine Sackgasse: der Schein landete
    in dieser Liste, und dort gab es nur Aufklappen, PDF und Storno. Wer ihn
    anlegte, um ihn später unterschreiben zu lassen, kam nie wieder hinein und
    musste alles neu tippen — oder legte einen ZWEITEN Beleg über dieselbe
    Arbeit an.

    Ein Link im Aussehen des Zweitknopfs, KEIN Knopf im Link: das waren zwei
    Tab-Stopps für eine Aktion, und die Vorlesehilfe meldete einen Knopf in
    einem Link (Prüflauf 25.09.2026, P4-12). Die Klassen sind die von
    `Button` mit `variant="secondary"`.
  */
  const weiterbearbeitenLink = (s: WithId<WorkSheet>) => (
    <Link
      to={`/worksheet?entwurf=${s.id}`}
      className="inline-flex min-h-touch items-center justify-center gap-2 rounded border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-2 active:scale-[0.98] sm:text-base"
    >
      Weiterbearbeiten
    </Link>
  );

  /** Steht über der Liste etwas (Fehler, Suchauskunft, verworfene Entwürfe)? */
  const obenEtwas = !!error || !!suche.trim() || verworfene > 0;
  const suchend = !!suche.trim();

  return (
    <div className="space-y-4 lg:space-y-5">
      {/*
        DER KNOPF STEHT IM KOPF, wie „Neues Angebot" und „Neue Wartung" —
        am Handy im Daumenbereich (PageHeader). Ein Link und kein Knopf, weil
        er eine andere Seite öffnet.

        Und nur für die, die einen Schein auch schreiben dürfen: Buchhaltung
        und Verwaltung sehen die Liste, landeten mit dem Knopf aber auf
        „Kein Zugriff" (Prüflauf 25.09.2026, P4-04).
      */}
      <PageHeader
        title="Handwerksscheine"
        // In der Liste stehen auch Entwürfe (Analyse 03.10.2026, Paket 1).
        subtitle="Leistungsnachweise der Baustellen, auch Entwürfe"
        hilfe={
          <>
            Für das Büro der Beleg zur Rechnung, für die Baustelle der Nachweis. Ein
            unterschriebener Schein lässt sich ansehen und als PDF weitergeben, aber nicht mehr
            ändern — Korrekturen laufen über einen Storno und einen neuen Schein. „Offen“ zeigt
            die Entwürfe und, wer Rechnungen schreibt, die unterschriebenen Scheine, die noch auf
            keiner Rechnung stehen; „Alle“ den ganzen geladenen Bestand. Ein Tipp auf eine Zeile
            öffnet den Schein mit allen Angaben und Aktionen.
          </>
        }
        action={
          darfSchreiben && (
            <Link
              to="/worksheet"
              className="inline-flex min-h-touch items-center justify-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:opacity-95 active:scale-[0.98] sm:text-base"
            >
              Neuer Schein
            </Link>
          )
        }
      />

      {/*
        NUR FÜRS BÜRO — `canEditTime` ist die Rolle, die fremde Zeiteinträge
        lesen UND anlegen darf. Für alle anderen wäre die Karte eine Liste
        ohne Handhabe.

        SIE STEHT AUCH DA, WENN NICHTS OFFEN IST: sie trägt eine HANDLUNG,
        weiter zurück prüfen. Verschwände sie bei null Befunden, gäbe es keinen
        Weg mehr zu der Prüfung, die den alten — und damit teuren — Schein
        überhaupt erst findet.

        Sie steht ÜBER der Scheinliste, weil sie eine Frist hat: eine Stunde,
        die niemand bucht, wird nie verrechnet und fehlt zugleich in der
        Arbeitszeitaufzeichnung nach § 26 AZG.
      */}
      {darfZeitenSehen && (
        <Card
          title={`Stunden ohne Buchung (${ohneBuchung.length})`}
          hint={
            <>
              <strong>Was hier steht.</strong> Unterschriebene Handwerksscheine, auf denen Zeit
              vermerkt ist, zu der es in der Zeiterfassung keine passende Anwesenheit gibt —
              älteste zuerst, ab {OFFEN_AB_TAGEN} Tagen. Gebucht wird am Ende des Arbeitstags,
              oft erst am Morgen darauf; der Schein von gestern ist deshalb noch kein Befund.
              <br />
              <br />
              <strong>Warum das nicht der Monteur selbst sieht.</strong> Er wird in der
              Zeiterfassung an seine eigenen Scheine erinnert — aber nur an die eigenen Zeilen.
              Fremde Zeiteinträge darf er weder lesen noch schreiben: in derselben Ablage stehen
              Kranken- und Urlaubstage der Kollegen, also Gesundheitsdaten. Trägt er auf dem
              Schein die Zeile eines Kollegen ein, hat sie damit niemanden, der an sie erinnert
              wird — er sieht dessen Buchungen nicht, und der Kollege sieht diesen Schein nicht.
              Genau diese Lücke schließt diese Liste.
              <br />
              <br />
              <strong>Was es kostet.</strong> Die Rechnung nimmt ihre Stunden aus den
              Zeiteinträgen, nicht vom Schein — der Schein liefert nur das Material. Eine
              ungebuchte Stunde wird also nie verrechnet, nicht „später korrigiert“, sondern
              nie. Und sie fehlt in der Arbeitszeitaufzeichnung, die der Betrieb nach § 26 AZG
              zu führen hat: dort stünde ein Tag, an dem der Mann nachweislich beim Kunden war
              und laut Aufzeichnung nicht gearbeitet hat.
              <br />
              <br />
              <strong>„Auf einer anderen Baustelle gebucht“</strong> ist der mildere Fall: die
              Arbeitszeit ist aufgezeichnet, sie hängt nur am falschen Auftrag. Das kommt
              regelmäßig vor, wenn jemand den ganzen Tag auf die Hauptbaustelle bucht und
              zwischendurch bei diesem Kunden war. Zu tun ist es trotzdem — die Zuordnung
              entscheidet, wem die Stunde verrechnet wird.
              <br />
              <br />
              <strong>Verglichen werden Tag und Name, nicht die Minuten.</strong> Sie dürfen
              abweichen: der Schein bestätigt die Zeit beim Kunden, der Eintrag umfasst den
              Arbeitstag samt Anfahrt. Der Name kommt vom Schein, wie ihn der Monteur getippt
              hat; Groß- und Kleinschreibung spielen keine Rolle, eine Abkürzung („F. Huber“)
              findet die Buchung aber nicht. Deshalb steht hier „keine Buchung gefunden“ und
              nicht „nicht gebucht“.
              <br />
              <br />
              <strong>Woher die Daten stammen.</strong> Zunächst aus den unten geladenen
              Scheinen und den Zeiteinträgen desselben Zeitraums — das kostet keine zusätzliche
              Abfrage. Mit „Weiter zurück prüfen“ wird stattdessen gezielt über alle
              unterschriebenen Scheine des gewählten Zeitraums geprüft; darüber steht jedes Mal,
              worauf sich das Ergebnis stützt.
              <br />
              <br />
              <strong>Warum das nicht automatisch passiert.</strong> Ein unterschriebener Schein
              trägt zwei Unterschriftsbilder im Dokument, rund 70 KB je Stück — ein Jahr wären
              schnell zwanzig Megabyte. Als bewusster Griff am Bürorechner ist das in Ordnung,
              als stiller Nebeneffekt beim Öffnen eines Reiters nicht. Aus demselben Grund holt
              die Prüfung höchstens {PRUEF_GRENZE} Scheine; wird die Grenze erreicht, steht es
              da, statt still zu wirken.
            </>
          }
          buendig
        >
          <div className="px-4 pb-1 pt-3">
            {minutenOhneBuchung(ohneBuchung) > 0 && (
              <p className="mb-3 text-sm text-ink">
                <strong>{fmtDauer(minutenOhneBuchung(ohneBuchung))}</strong> stehen unterschrieben
                beim Kunden und in keiner Zeiterfassung.
              </p>
            )}

            {/*
              WORAUF SICH DIE PRÜFUNG STÜTZT, steht sichtbar da — sonst hiesse
              „nichts offen" mal „im letzten Monat" und mal „im letzten Jahr",
              ohne dass es jemand unterscheiden könnte.
            */}
            <p className="mb-3 text-xs text-ink-muted">
              {tiefePruefung
                ? `Geprüft über die letzten ${tiefePruefung} Tage (${pruefBasis.length} unterschriebene Scheine).`
                : `Geprüft über die ${scheine.length} geladenen Scheine dieser Liste.`}
              {tiefeScheine && tiefeScheine.length >= PRUEF_GRENZE && (
                <>
                  {' '}
                  <strong className="text-warning">
                    Die Grenze von {PRUEF_GRENZE} Scheinen ist erreicht — ältere sind nicht dabei.
                  </strong>
                </>
              )}
              {zuJung > 0 &&
                ` ${zuJung === 1 ? 'Ein Schein' : `${zuJung} Scheine`} der letzten ${OFFEN_AB_TAGEN} Tage ${
                  zuJung === 1 ? 'ist' : 'sind'
                } noch nicht dabei — gebucht wird oft erst am Morgen darauf.`}
            </p>

            {/*
              Die Beschriftung steht ÜBER der Reihe, nicht davor: davor gesetzt
              brach die Auswahl am Telefon mitten durch. `klein` nimmt den
              Knöpfen Polsterung und Schriftgrösse, nicht die Höhe.
            */}
            <div className="mb-3">
              <span className="mb-2 block text-sm text-ink-muted">Weiter zurück prüfen:</span>
              <div className="flex flex-wrap items-center gap-2">
                {PRUEF_ZEITRAEUME.map((tage) => (
                  <Button
                    key={tage}
                    groesse="klein"
                    variant={tiefePruefung === tage ? 'primary' : 'secondary'}
                    disabled={pruefungLaeuft}
                    onClick={() => void tieferPruefen(tage)}
                  >
                    {tage === 365 ? '1 Jahr' : `${tage} Tage`}
                  </Button>
                ))}
                {pruefungLaeuft && <span className="text-sm text-ink-muted">Wird geprüft …</span>}
              </div>
            </div>
          </div>

          {ohneBuchung.length === 0 ? (
            <EmptyState>
              Zu jeder Stunde auf den geprüften Scheinen gibt es eine Buchung in der Zeiterfassung.
            </EmptyState>
          ) : (
            /*
              Die Zeile führt zum SCHEIN, nicht direkt in ein Zeitformular: wer
              eine fremde Stunde nachträgt, muss vorher sehen, was auf dem Beleg
              steht — Spanne, Tätigkeit, Helferhaken. Ein leeres Formular
              verleitete zum Schätzen.

              DAS FENSTER ZEIGT AUCH DEN ALTEN SCHEIN. Bis zum Umbau klappte
              „Schein ansehen“ ihn unten in der Liste auf — einen Schein aus der
              tiefen Prüfung, der nicht unter den geladenen stand, also gar nicht.
            */
            <Gruppe
              eintraege={ohneBuchung}
              zeile={({ schein, zeilen, tage }) => (
                <ListRow
                  key={schein.id}
                  onOeffnen={() => setOffen(schein.id)}
                  pfeil
                  title={
                    <>
                      <span>{schein.customerName}</span>
                      <Warnung stufe={tage >= 30 ? 'dringend' : 'achtung'}>{tageWort(tage)}</Warnung>
                    </>
                  }
                  subtitle={
                    <>
                      <span>
                        Baustelle <span className="nr">{schein.projectNumber}</span> · Leistung vom {datumAT(schein.datum)}
                      </span>
                      <span className="mt-1 block">
                        {zeilen.map((z) => (
                          <span key={z.name} className="block text-xs text-ink-muted">
                            {z.name} · {fmtDauer(z.minuten)} ·{' '}
                            {z.art === 'keine'
                              ? 'keine Buchung gefunden'
                              : `gebucht auf ${z.gebuchtAuf?.join(', ')}`}
                          </span>
                        ))}
                      </span>
                    </>
                  }
                />
              )}
            />
          )}
        </Card>
      )}

      {nurUnverrechnet && (
        <Adressfilter
          text={nurUnverrechnet === 'nicht-verrechnet-alt' ? 'nicht verrechnet, älter als 4 Wochen' : 'unterschrieben, nicht verrechnet'}
          parameter={['filter']}
        />
      )}

      {/*
        SUCHE UND ANSICHT ÜBER DER LISTE (Regel 4). Die Suche steht zuerst:
        verschwinden beim Tippen die Segmente, rutscht das Feld nicht unter
        dem Finger weg.
      */}
      <div className="scheine-werkzeug">
        <input
          aria-label="Scheine durchsuchen"
          placeholder="Suchen …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="scheine-suche"
        />
        {!suchend && !nurUnverrechnet && (
          <div className="scheine-ansicht">
            <Segmente name="Ansicht" werte={ANSICHTEN} wert={ansicht} onChange={ansichtSetzen} />
          </div>
        )}
      </div>

      <Card
        title={
          offeneAnsicht
            ? undefined
            : unverrechnet
              ? `Nicht verrechnet (${sichtbar.length})`
              : `Scheine (${scheine.length - verworfene})`
        }
        buendig
      >
        {obenEtwas && (
          <div className="p-4 pb-1">
            {error && <div className="mb-3"><ErrorState message={error} /></div>}

            {/*
              WAS DIE SUCHE GERADE ABDECKT — und was nicht. Ohne diese Zeile
              hiesse „kein Treffer" mal „gibt es nicht" und mal „ist nicht
              geladen", ohne dass es jemand unterscheiden könnte.
            */}
            {suchend && (
              <div className="mb-3">
                {trefferGelten ? (
                  <p className="text-sm text-ink">
                    <strong>{sichtbar.length}</strong>{' '}
                    {sichtbar.length === 1 ? 'Schein' : 'Scheine'} vom Server zu „{trefferZu}".
                    {treffer && treffer.length >= PRUEF_GRENZE && (
                      <span className="text-warning">
                        {' '}
                        Die Grenze von {PRUEF_GRENZE} ist erreicht — ältere sind nicht dabei.
                      </span>
                    )}{' '}
                    <button
                      type="button"
                      className="link-hinweis"
                      onClick={() => {
                        setTreffer(null);
                        setTrefferZu('');
                      }}
                    >
                      Zurück zur Liste
                    </button>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-ink-muted">
                      {sichtbar.length} von {scheine.length} geladenen Scheinen passen. Ältere sind
                      nicht geladen.
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">{suchHinweis(absicht)}</p>
                    <div className="mt-2">
                      <Button
                        variant="secondary"
                        disabled={sucheLaeuft}
                        onClick={() => void serverseitigSuchen()}
                      >
                        {sucheLaeuft ? 'Wird gesucht …' : 'Auf dem Server suchen'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {/*
              Verworfene bleiben in der Datenbank, aber nicht im Weg. Sie AUCH
              aus der Ansicht zu nehmen wäre das Löschen durch die Hintertür;
              der Schalter nennt deshalb ihre Zahl — in jeder Ansicht.
            */}
            {verworfene > 0 && (
              <label className="mb-3 flex min-h-touch items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={zeigeVerworfene}
                  onChange={(e) => setZeigeVerworfene(e.target.checked)}
                  className="checkbox"
                />
                {verworfene} verworfene{verworfene === 1 ? 'r Entwurf' : ' Entwürfe'} anzeigen
              </label>
            )}
          </div>
        )}

        {loading || (nurUnverrechnet && !unverrechnet) ? (
          <div className="px-4 py-4">
            <SkeletonList rows={4} />
          </div>
        ) : offeneAnsicht ? (
          scheine.length === 0 ? (
            <EmptyState>Noch kein Handwerksschein erstellt.</EmptyState>
          ) : (
            <>
              <Abschnitt titel="Entwürfe" anzahl={entwuerfe.length}>
                {entwuerfe.length > 0 ? (
                  <Gruppe key="entwuerfe" eintraege={entwuerfe} zeile={scheinZeile} />
                ) : (
                  <p className="leer">Kein offener Entwurf.</p>
                )}
              </Abschnitt>
              {verrechnungSehen && (
                <Abschnitt titel="Nicht verrechnet" anzahl={unverrechnetAlle ? unverrechnetAlle.length : undefined}>
                  {!unverrechnetAlle ? (
                    <div className="px-4 pb-4">
                      <SkeletonList rows={2} />
                    </div>
                  ) : unverrechnetAlle.length > 0 ? (
                    <Gruppe key="unverrechnet" eintraege={unverrechnetAlle} zeile={scheinZeile} />
                  ) : (
                    <p className="leer">Unter den jüngsten Scheinen ist keiner unverrechnet.</p>
                  )}
                </Abschnitt>
              )}
              {zeigeVerworfene && verworfenListe.length > 0 && (
                <Abschnitt titel="Verworfen" anzahl={verworfenListe.length}>
                  <Gruppe key="verworfen" eintraege={verworfenListe} zeile={scheinZeile} />
                </Abschnitt>
              )}
            </>
          )
        ) : sichtbar.length === 0 ? (
          <EmptyState>
            {unverrechnet
              ? 'Unter den jüngsten Scheinen ist keiner unverrechnet.'
              : scheine.length === 0
              ? 'Noch kein Handwerksschein erstellt.'
              : suchend
                ? `Kein Schein passt zu „${suche}“.`
                : 'Kein offener Schein — nur verworfene Entwürfe.'}
          </EmptyState>
        ) : (
          // Der Schlüssel setzt „und N weitere“ zurück, sobald sich die Menge ändert.
          <Gruppe key={`${ansicht}|${trefferZu}|${suche.trim()}|${nurUnverrechnet ?? ''}`} eintraege={sichtbar} zeile={scheinZeile} />
        )}
        {!loading && (
          <div className="px-4 pb-3 empty:hidden">
            <Nachladen
              geladen={scheine.length}
              grenze={grenze}
              einheit="Scheine"
              laeuft={loading}
              onMehr={() => setGrenze((n) => n + SCHEINE_JE_SEITE)}
            />
          </div>
        )}
      </Card>

      {/*
        DER SCHEIN IM SEITENFENSTER (Regel 8): alle Angaben und alle Aktionen,
        die bis zum Umbau in und unter der Zeile standen — Details, PDF,
        Weiterbearbeiten, Verwerfen, Wieder aufnehmen, Stornieren samt Grund.
        Die Liste bleibt dahinter stehen.
      */}
      <BottomSheet
        open={!!offenerSchein}
        onClose={fensterZu}
        label="Handwerksschein"
        auchBreit
        titel={offenerSchein?.customerName ?? 'Handwerksschein'}
      >
        {offenerSchein && (
          <ScheinEinzelheiten
            schein={offenerSchein}
            onNeuLaden={() => void laden()}
            aktionen={
              stornoFuer?.id === offenerSchein.id ? (
                /*
                  Storno mit Pflichtgrund. Ein unterschriebener Beleg
                  verschwindet nicht und wird nicht überschrieben — er bleibt
                  sichtbar und trägt den Grund. Ein spurlos gelöschter Schein
                  wäre schlimmer als ein falscher.
                */
                <div className="space-y-3 border-t border-line pt-4">
                  <h3 className="text-base font-semibold text-ink-deep">
                    Schein stornieren — {stornoFuer.customerName}, {datumAT(stornoFuer.datum)}
                  </h3>
                  <p className="text-sm text-ink-muted">
                    Der Schein bleibt erhalten und sichtbar, wird aber als storniert gekennzeichnet.
                    Für eine Korrektur ist danach ein neuer Schein zu erstellen.
                  </p>
                  <InputField
                    id="stornogrund"
                    label="Grund (Pflicht)"
                    value={stornoGrund}
                    onChange={(e) => setStornoGrund(e.target.value)}
                    required
                    pflicht
                  />
                  <div className="fuss-aktionen">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStornoFuer(null);
                        setStornoGrund('');
                      }}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      loading={busy}
                      disabled={stornoGrund.trim().length < 3}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await cancelWorkSheet(stornoFuer.id, stornoGrund.trim(), user.name);
                          toast.success('Schein storniert');
                          setStornoFuer(null);
                          setStornoGrund('');
                          await laden();
                        } catch (err) {
                          setError(grundAus(err, 'Der Storno ist fehlgeschlagen.'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Storno bestätigen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="fuss-aktionen">
                  <Button variant="secondary" loading={busy} onClick={() => pdfAusgeben(offenerSchein)}>
                    PDF
                  </Button>
                  {darfDiesen(offenerSchein) && offenerSchein.status === 'Entwurf' && (
                    <>
                      {/*
                        Verwerfen darf, wer auch weiterbearbeiten darf — dieselbe
                        Grenze wie in der Datenbank (`app.schein_schreibt`): die
                        Führung jeden Entwurf, der Monteur seinen eigenen.
                        Das Fenster geht dabei zu: die Rückfrage steht für sich,
                        nicht über einem zweiten Dialog.
                      */}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setVerwerfenFuer(offenerSchein);
                          setOffen(null);
                        }}
                      >
                        Verwerfen
                      </Button>
                      {weiterbearbeitenLink(offenerSchein)}
                    </>
                  )}
                  {darfDiesen(offenerSchein) && offenerSchein.status === 'Verworfen' && (
                    <Button variant="secondary" loading={busy} onClick={() => void wiederAufnehmen(offenerSchein)}>
                      Wieder aufnehmen
                    </Button>
                  )}
                  {darfStornieren && offenerSchein.status === 'Unterschrieben' && (
                    <Button variant="ghost" onClick={() => setStornoFuer(offenerSchein)}>
                      Stornieren
                    </Button>
                  )}
                </div>
              )
            }
          />
        )}
      </BottomSheet>

      {/*
        Die Rückfrage nennt Kunde, Tag und Umfang: in einer Liste
        gleichaussehender Zeilen ist der Fehlgriff die falsche ZEILE, nicht der
        falsche Knopf.

        NICHT ROT, anders als beim Löschen: der Entwurf bleibt unter dem
        Schalter sichtbar und lässt sich zurückholen. Wer sich an Rot für
        Umkehrbares gewöhnt, übersieht es beim Storno.
      */}
      <ConfirmDialog
        open={!!verwerfenFuer}
        title="Entwurf verwerfen"
        message={
          verwerfenFuer
            ? `${verwerfenFuer.customerName}, ${datumAT(verwerfenFuer.datum)} · ` +
              `${fmtDauer(verwerfenFuer.zeiten.reduce((n, z) => n + z.minuten, 0))} · ` +
              `${verwerfenFuer.material.length} Materialposten. Der Entwurf verschwindet aus ` +
              'der Arbeitsliste, bleibt aber erhalten und lässt sich wieder aufnehmen.'
            : undefined
        }
        confirmLabel="Verwerfen"
        confirmTone="primary"
        onCancel={() => setVerwerfenFuer(null)}
        onConfirm={async () => {
          if (!verwerfenFuer) return;
          await discardWorkSheetDraft(verwerfenFuer.id, user.name);
          toast.success('Entwurf verworfen');
          setVerwerfenFuer(null);
          await laden();
        }}
      />
    </div>
  );
}

/**
 * Die Einzelheiten eines Scheins im Seitenfenster — was bis zum Umbau unter
 * der Zeile aufklappte, in derselben Reihenfolge.
 */
function ScheinEinzelheiten({
  schein: s,
  aktionen,
  onNeuLaden,
}: {
  schein: WithId<WorkSheet>;
  aktionen: ReactNode;
  onNeuLaden: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Zustand stand={STAND[s.status]}>{s.status}</Zustand>
          <span className="text-sm text-ink-muted">
            {datumAT(s.datum)} · {s.abrechnung}
          </span>
        </p>
        <p className="text-sm text-ink-muted">
          Baustelle <span className="nr">{s.projectNumber}</span> ·{' '}
          {fmtDauer(s.zeiten.reduce((n, z) => n + z.minuten, 0))}
        </p>
        {s.unterschriften?.kunde && (
          <p className="text-sm text-ink-muted">Unterschrieben von {s.unterschriften.kunde.name}</p>
        )}
        {s.status === 'Verworfen' && (
          <p className="text-sm text-ink-muted">
            Verworfen{s.verworfenVonName ? ` von ${s.verworfenVonName}` : ''} — nicht
            weiterbearbeitet, nicht gelöscht.
          </p>
        )}
        {s.stornoGrund && (
          <p className="text-sm text-danger">
            Storno: {s.stornoGrund}
            {s.storniertVonName ? ` (${s.storniertVonName})` : ''}
          </p>
        )}
      </div>

      {s.zeiten.length > 0 && (
        <div>
          <h3 className="section-label">Zeiten</h3>
          <ul className="mt-1 space-y-1">
            {s.zeiten.map((z, i) => (
              <li key={i} className="text-sm text-ink">
                {z.mitarbeiter}
                {z.helfer ? ' (Helfer)' : ''} · {z.von && z.bis ? `${z.von}–${z.bis}` : '—'} ·{' '}
                {fmtDauer(z.minuten)}
                {z.taetigkeit ? ` · ${z.taetigkeit}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.material.length > 0 && (
        <div>
          <h3 className="section-label">Material</h3>
          <ul className="mt-1 space-y-1">
            {s.material.map((m, i) => (
              <li key={i} className="text-sm text-ink">
                {m.menge}× {m.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.notizen && (
        <div>
          <h3 className="section-label">Anmerkungen</h3>
          <p className="mt-1 text-sm text-ink">{s.notizen}</p>
        </div>
      )}
      {/*
        DIE FOTOS werden erst mit dem Fenster geholt — eine Liste, die beim
        Öffnen zwanzig Bilder nachlädt, ist auf einer Baustelle keine Liste mehr.
      */}
      {s.fotos && s.fotos.length > 0 && (
        <div>
          <h3 className="section-label">Fotos ({s.fotos.length})</h3>
          <Fotostreifen fotos={s.fotos} />
        </div>
      )}
      {/*
        DIE PRÜFSUMME — der eigentliche Manipulationsschutz: mit ihr lässt sich
        belegen, dass ein vorgelegtes PDF genau das ist, was unterschrieben
        wurde. Sie entsteht serverseitig kurz NACH dem Unterschreiben, offline
        erst beim Übertragen; statt die Zeile wegzulassen, sagt sie, dass noch
        etwas aussteht.
      */}
      <div>
        <h3 className="section-label">Prüfsumme</h3>
        {s.inhaltHash ? (
          <p className="mt-1 break-all font-mono text-xs text-ink-muted">{s.inhaltHash}</p>
        ) : s.status === 'Entwurf' ? (
          <p className="mt-1 text-xs text-ink-muted">Entsteht mit der Unterschrift.</p>
        ) : (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            Wird berechnet — bei fehlender Verbindung erst nach der Übertragung.
            <Button variant="ghost" onClick={onNeuLaden}>
              Neu laden
            </Button>
          </p>
        )}
      </div>

      {aktionen}
    </div>
  );
}
