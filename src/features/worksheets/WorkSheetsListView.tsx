import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Fensteraktionen from '@/components/Fensteraktionen';
import KnopfLink from '@/components/KnopfLink';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  listRecentWorkSheets,
  listWorkSheetsByIds,
  scheinVerrechnung,
  type ScheinVerrechnung,
  scheineNeu,
  scheineGesehen,
  listSignedWorkSheetsInRange,
  listWorkSheetsInRange,
  searchWorkSheets,
  listWorkSheetsForProject,
  getWorkSheet,
  cancelWorkSheet,
  discardWorkSheetDraft,
  deleteWorkSheetDraft,
  restoreWorkSheetDraft,
  wartendeScheine,
  type VorgemerkterSchein,
} from '@/lib/db/workSheets';
import { FACH_GELEERT } from '@/lib/sync/ausgangsfach';
import { buildWorkSheetPdf, shareOrDownloadPdf } from './worksheetPdf';
import { unterschriftOhneBild } from './scheinVollstaendig';
import Fotostreifen from './Fotostreifen';
import Nachladen from '@/components/Nachladen';
import { listEntriesInRange } from '@/lib/db/timeEntries';
import { belegFirma } from '@/lib/db/aussteller';
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
import { Warnung, Zustand } from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import VerbrauchAmSchein from './VerbrauchAmSchein';
import BottomSheet from '@/components/BottomSheet';
import Abschnitt from '@/components/Abschnitt';
import { Listenleiste, MehrAnzeigen, Segmente } from '@/components/LotBausteine';
import PageHeader from '@/components/PageHeader';
import Metric, { MetricRow } from '@/components/Metric';
import { List, ListRow } from '@/components/ListRow';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList } from '@/components/States';
import Hinweiszeile from '@/components/Hinweiszeile';
import { grundAus } from '@/lib/fehlerGrund';
import { datumAT } from '@/lib/datum';
import Adressfilter from '@/components/Adressfilter';
import { scheineAufRechnung, scheineUnverrechnetSeite, scheineUnverrechnetStand } from '@/lib/db/invoices';
import { SCHEIN_FILTER, bekannt } from '@/features/dashboard/start/ziele';
import { AUFFAELLIG_AB_TAGEN, auffaelligBis, unverrechnetZeilen } from './unverrechnet';
import { SCHEIN_STAND } from './scheinStand';
import { schluessel, useGemerkt } from '@/lib/zwischenspeicher';
import { PdfKnopf } from '@/components/Symbolknoepfe';

const STAND = SCHEIN_STAND;

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

/** Eine Zeitbuchung, soweit die Prüfung „Stunden ohne Buchung“ sie braucht. */
type Buchungszeile = Pick<TimeEntry, 'date' | 'status' | 'projectNumber' | 'userName'>;
/** Was die Liste zuletzt geladen hat — für den zweiten Besuch (`useGemerkt`). */
interface ScheinlisteStand {
  scheine: WithId<WorkSheet>[];
  buchungen: Buchungszeile[];
  buchungenStand: { fuer: string; ok: boolean };
  /** Die unverrechneten Scheine über alle (P3), älteste zuerst — so weit geholt (L22). */
  unverrechnet: UnverrechnetGeladen;
}

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
/** Wohin „Ersatzschein anlegen“ führt: ein neuer Schein mit Baustelle, Tag und Verweis (P4). */
function ersatzAdresse(s: Pick<WorkSheet, 'projectNumber' | 'datum'> & { id: string }): string {
  const p = new URLSearchParams({ projekt: s.projectNumber, datum: s.datum, ersetzt: s.id });
  return `/worksheet?${p.toString()}`;
}

/**
 * Was der Storno-Dialog über die Verrechnung sagt (P4). Ein Hinweis, keine
 * Sperre: der Storno korrigiert den Beleg; die Rechnung ist ein eigener Beleg
 * mit eigenem Storno.
 */
function StornoVerrechnung({ lage }: { lage: ScheinVerrechnung | 'fehler' | null }) {
  if (lage === null) return <p className="text-sm text-ink-muted">Verrechnung wird geprüft …</p>;
  if (lage === 'fehler') {
    return (
      <Hinweiszeile stufe="warn">
        <p>Ob dieser Schein schon verrechnet ist, ließ sich nicht prüfen. Vor dem Storno bitte in der Buchhaltung nachfragen.</p>
      </Hinweiszeile>
    );
  }
  if (!lage.verrechnet) return null;
  const welche = lage.rechnungen && lage.rechnungen.length > 0
    ? `auf ${lage.rechnungen.length === 1 ? 'der Rechnung' : 'den Rechnungen'} ${lage.rechnungen.map((r) => `${r.nummer} (${r.zahlung})`).join(', ')}`
    : lage.grund === 'rechnung' ? 'auf einer gültigen Rechnung' : 'in einer schon ausgestellten Rechnung der Baustelle';
  return (
    <Hinweiszeile stufe="warn" offenWeil="Im Fenster vor dem Storno: was der Storno an der Rechnung nicht ändert, muss vor der Bestätigung dastehen (U9)">
      <p>
        <strong>Dieser Schein ist schon verrechnet</strong> — er steht {welche}. Der Storno ändert die Rechnung nicht.
        Ein Ersatzschein übernimmt die Verrechnung und kommt nicht noch einmal auf eine Rechnung. Ändern sich Stunden
        oder Material, die Rechnung stornieren und neu ausstellen — dann wird der Ersatzschein mit verrechnet.
      </p>
    </Hinweiszeile>
  );
}

/*
  `weitere`: was die Datenbank noch hat, aber nicht geholt ist (L22, die
  unverrechneten Scheine). „und N weitere anzeigen“ zählt es mit und holt
  die nächsten, sobald alles Geholte schon zu sehen ist.
*/
function Gruppe<T>({ eintraege, zeile, weitere }: {
  eintraege: T[];
  zeile: (e: T) => ReactNode;
  weitere?: { anzahl: number; laedt: boolean; onMehr: () => void };
}) {
  const [alle, setAlle] = useState(false);
  const gezeigt = alle ? eintraege : eintraege.slice(0, GRUPPE_MAX);
  const ungezeigt = eintraege.length - gezeigt.length;
  return (
    <>
      <List>{gezeigt.map(zeile)}</List>
      <MehrAnzeigen
        anzahl={ungezeigt + (weitere?.anzahl ?? 0)}
        laedt={weitere?.laedt}
        onClick={() => {
          setAlle(true);
          if (ungezeigt === 0) weitere?.onMehr();
        }}
      />
    </>
  );
}

/** Wie viele unverrechnete Scheine die Liste zuerst holt: so viele, wie die Gruppe zeigt (L22). */
const UNVERRECHNET_ERSTE = GRUPPE_MAX;

/** Die geholten unverrechneten Scheine, älteste zuerst, mit dem Stand über alle (L22). */
interface UnverrechnetGeladen {
  stand: { anzahl: number; alt: number };
  scheine: WithId<WorkSheet>[];
  /** Wie viele Köpfe schon geholt sind — dort setzt die nächste Seite an. */
  geholt: number;
}

/**
 * Eine Seite unverrechneter Scheine, ganz (Stunden, Unterschrift), in der
 * Reihenfolge der Datenbank: älteste zuerst. `geholt` zählt die Köpfe, nicht
 * die ganzen Scheine — fehlt einer (eben storniert), verschiebt sich die
 * nächste Seite nicht.
 */
async function unverrechnetHolen(companyId: string, ab: number, anzahl: number) {
  const koepfe = await scheineUnverrechnetSeite(ab, anzahl);
  const voll = await listWorkSheetsByIds(companyId, koepfe.map((k) => k.id));
  const nachId = new Map(voll.map((v) => [v.id, v]));
  return {
    scheine: koepfe.map((k) => nachId.get(k.id)).filter((v): v is WithId<WorkSheet> => !!v),
    geholt: koepfe.length,
  };
}

export default function WorkSheetsListView() {
  const { user, company } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [suchparameter, setSuchparameter] = useSearchParams();
  const markiert = suchparameter.get('markiert');
  /*
    „Nicht verrechnet“ aus der Adresse (Startseite, Nachtest 01.10.2026):
    unterschriebene Scheine auf keiner gültigen Rechnung — dieselbe Rechnung
    wie unter Rechnungen und auf der Startseite, über dieselben jüngsten
    Scheine. „…-alt“: nur die über vier Wochen.
  */
  const adressFilter = bekannt(SCHEIN_FILTER, suchparameter.get('filter'));
  const nurUnverrechnet = adressFilter === 'neu-eingegangen' ? null : adressFilter;
  /** V9: die seit dem letzten Ansehen unterschriebenen Scheine — von der Startseite. */
  const nurNeu = adressFilter === 'neu-eingegangen';
  /*
    DIE ANSICHT STEHT IN DER ADRESSE (Protokoll 7.5), damit „Zurück“ und ein
    Lesezeichen sie wiederherstellen. Kommt jemand mit `markiert` (nach dem
    Unterschreiben, von der Startseite), steht er in „Alle“: der markierte
    Schein ist meist unterschrieben und gehörte sonst in keine offene Gruppe.
  */
  /*
    OB EIN SCHEIN VERRECHNET IST, weiss nur, wer Rechnungen lesen darf —
    dieselben Rollen, denen die Startseite „Nicht verrechnet“ zeigt. Für alle
    anderen gibt es diese Gruppe nicht; die Abfrage bliebe an den Rechten
    hängen und ergäbe ein falsches „alles unverrechnet“.
  */
  const verrechnungSehen = !!user && canInvoice(user.role);
  const mitVerrechnung = !!nurUnverrechnet || verrechnungSehen;
  const darfStornieren = user ? isGF(user.role) : false;
  /*
    DIE PROJEKTLEITUNG BEGINNT BEI „ALLE“ (K4, Entscheidung 18.10.2026):
    sie darf stornieren, sieht aber keine Rechnungen — ihr „Offen“ zeigt nur
    Entwürfe, der unterschriebene Schein stünde zwei Schritte entfernt
    (Segment, Zeile). Aus „Alle“ ist es wieder einer, wie vor dem Umbau.
    Wer nicht stornieren darf oder „Nicht verrechnet“ unter „Offen“ hat,
    bleibt bei „Offen“.
  */
  const startAnsicht: Ansicht = markiert || (darfStornieren && !verrechnungSehen) ? 'alle' : 'offen';
  const ansichtWert = suchparameter.get('ansicht');
  const ansicht: Ansicht = ansichtWert === 'alle' || ansichtWert === 'offen' ? ansichtWert : startAnsicht;
  function ansichtSetzen(neu: Ansicht) {
    const p = new URLSearchParams(suchparameter);
    p.set('ansicht', neu);
    setSuchparameter(p, { replace: true });
  }

  /*
    DER LETZTE STAND (Stufe 3, `lib/zwischenspeicher.ts`): Liste, Buchungen
    des geprüften Zeitraums und Verrechnung stehen beim zweiten Besuch
    sofort da; frisch geholt wird im Hintergrund. Nur beim Aufbau — nach
    einer Aktion oder „Weitere laden“ lädt die Liste wie bisher sichtbar.
  */
  const { anfang, merken } = useGemerkt<ScheinlisteStand>(
    user ? schluessel('scheinliste', user, mitVerrechnung, canEditTime(user.role)) : null,
  );
  const [scheine, setScheine] = useState<WithId<WorkSheet>[]>(() => anfang?.scheine ?? []);
  /*
    WIE WEIT DIE LISTE ZURÜCKREICHT — und hier wiegt jeder Datensatz schwer.

    Ein unterschriebener Schein trägt zwei Unterschriftsbilder als PNG im
    Dokument; nachgemessen sind das rund 70 KB je Schein. Hundert Scheine
    waren damit knapp sieben Megabyte, bei jedem Öffnen dieser Ansicht. Fünfzig
    decken bei einem Fünf-Mann-Betrieb gut einen Monat ab, und wer weiter
    zurück muss, lädt nach — sichtbar, statt es nie zu erfahren.
  */
  // „Nicht verrechnet“ kommt seit P3 aus einer eigenen Abfrage über alle Scheine — die Liste braucht dafür nicht mehr.
  const grenzeAnfang = SCHEINE_JE_SEITE;
  const [grenze, setGrenze] = useState(grenzeAnfang);
  const [loading, setLoading] = useState(() => anfang?.scheine === undefined);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  /** Der Schein im Seitenfenster — seine Kennung, gesucht in allem, was geladen ist. */
  const [offen, setOffen] = useState<string | null>(markiert);
  const [stornoFuer, setStornoFuer] = useState<WithId<WorkSheet> | null>(null);
  /*
    STEHT DER SCHEIN AUF EINER RECHNUNG? (Durchsicht 15.11.2026, P4) — vor
    dem Storno gefragt. Ohne die Frage stornierte die Projektleitung einen
    verrechneten Schein, schrieb einen neuen, und dessen Material kam auf die
    nächste Rechnung ein zweites Mal. `null`: wird geholt; `'fehler'`: nicht
    gekommen — dann sagt es der Dialog, statt Entwarnung zu geben.
  */
  const [stornoLage, setStornoLage] = useState<ScheinVerrechnung | 'fehler' | null>(null);
  useEffect(() => {
    setStornoLage(null);
    if (!stornoFuer) return;
    let weg = false;
    scheinVerrechnung(stornoFuer.id)
      .then((l) => { if (!weg) setStornoLage(l); })
      .catch(() => { if (!weg) setStornoLage('fehler'); });
    return () => { weg = true; };
  }, [stornoFuer]);
  const [stornoGrund, setStornoGrund] = useState('');
  const [verwerfenFuer, setVerwerfenFuer] = useState<WithId<WorkSheet> | null>(null);
  const [loeschenFuer, setLoeschenFuer] = useState<WithId<WorkSheet> | null>(null);
  const [zeigeVerworfene, setZeigeVerworfene] = useState(false);
  const [busy, setBusy] = useState(false);

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
    () => async (stehenLassen = false) => {
      if (!user) return;
      if (!stehenLassen) setLoading(true);
      try {
        const neu = await listRecentWorkSheets(user.companyId, grenze);
        setScheine(neu);
        if (grenze === grenzeAnfang) merken({ scheine: neu });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [user, grenze, grenzeAnfang, merken],
  );

  useEffect(() => {
    // Ein gemerkter Stand bleibt beim Aufbau stehen; mit größerer Grenze lädt die Liste sichtbar.
    void laden(grenze === grenzeAnfang && anfang?.scheine !== undefined);
  }, [laden, grenze, grenzeAnfang, anfang?.scheine]);

  /*
    NOCH NICHT GESENDET (E49, 05.11.2026): Scheine, die auf diesem Gerät
    ohne Empfang gespeichert oder unterschrieben wurden. Der Server kennt sie
    noch nicht, die Liste darunter also auch nicht. Stünden sie nirgends,
    legte der Monteur denselben Schein ein zweites Mal an — zwei
    unterschriebene Belege über dieselbe Arbeit.

    Nach jedem Nachsendelauf wird nachgesehen; ist einer angekommen, steht er
    jetzt auf dem Server, und die Liste holt sich still den neuen Stand.
  */
  const [wartend, setWartend] = useState<VorgemerkterSchein[]>([]);
  const wartendRef = useRef<VorgemerkterSchein[]>([]);
  useEffect(() => {
    let weg = false;
    const nachsehen = () => {
      void wartendeScheine()
        .then((neu) => {
          if (weg) return;
          const angekommen = wartendRef.current.some((v) => !neu.some((n) => n.id === v.id));
          wartendRef.current = neu;
          setWartend(neu);
          if (angekommen) void laden(true);
        })
        .catch(() => undefined);
    };
    nachsehen();
    window.addEventListener(FACH_GELEERT, nachsehen);
    return () => {
      weg = true;
      window.removeEventListener(FACH_GELEERT, nachsehen);
    };
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
  const [buchungen, setBuchungen] = useState<Buchungszeile[]>(() => anfang?.buchungen ?? []);
  const darfZeitenSehen = user ? canEditTime(user.role) : false;
  /*
    FÜR WELCHEN ZEITRAUM DIE BUCHUNGEN GELADEN SIND — und ob überhaupt
    (Analyse 10.10.2026). Vorher prüfte die Karte gegen die noch leere
    Liste, solange sie lud: zuerst „49 Scheine ohne Buchung“ samt Namen der
    Monteure, Sekunden später 31. Scheiterte die Abfrage, blieb der falsche
    Vorwurf sogar stehen. Jetzt prüft sie erst mit den Buchungen genau
    dieses Zeitraums.
  */
  const [buchungenStand, setBuchungenStand] = useState<{ fuer: string; ok: boolean } | null>(
    () => anfang?.buchungenStand ?? null,
  );

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

  const zeitraumSchluessel = zeitraum ? `${zeitraum.von}|${zeitraum.bis}` : '';
  useEffect(() => {
    if (!user || !darfZeitenSehen || !zeitraum) {
      setBuchungen([]);
      return;
    }
    let abgemeldet = false;
    const fuer = `${zeitraum.von}|${zeitraum.bis}`;
    listEntriesInRange(user.companyId, zeitraum.von, zeitraum.bis)
      .then((rows) => {
        if (!abgemeldet) {
          setBuchungen(rows);
          setBuchungenStand({ fuer, ok: true });
          merken({ buchungen: rows, buchungenStand: { fuer, ok: true } });
        }
      })
      /*
        STILL SCHEITERN, ABER NUR HIER. Die Scheinliste ist das, wofür diese
        Seite da ist; sie darf nicht wegen einer Zusatzauswertung mit einer
        Fehlermeldung stehenbleiben. Bleibt die Abfrage aus, sagt die Karte
        das, statt gegen eine leere Liste zu prüfen.
      */
      .catch(() => {
        if (!abgemeldet) setBuchungenStand({ fuer, ok: false });
      });
    return () => {
      abgemeldet = true;
    };
  }, [user, darfZeitenSehen, zeitraum, merken]);

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

  /** Erst mit den Scheinen UND den Buchungen genau dieses Zeitraums ist ein Befund einer. */
  const pruefungBereit = !loading && (!zeitraum || buchungenStand?.fuer === zeitraumSchluessel);
  const pruefungFehler = pruefungBereit && !!zeitraum && buchungenStand?.ok === false;
  /*
    DIE LISTE WARTET BEIM ERSTEN ÖFFNEN AUF DIE PRÜFUNG darüber: kam deren
    Ergebnis später, schob es die ganze Liste nach unten (gemessen 0,5 —
    fünfmal Googles Grenze). Nur beim ersten Mal: „Weiter zurück prüfen“
    lässt die Liste stehen.
  */
  const [erstePruefungDa, setErstePruefungDa] = useState(false);
  useEffect(() => {
    if (pruefungBereit) setErstePruefungDa(true);
  }, [pruefungBereit]);
  const listeZeigen = !darfZeitenSehen || pruefungBereit || erstePruefungDa;

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
  /*
    WELCHE TREFFER UNVERRECHNET SIND — unter dem Filter „nicht verrechnet“
    aus der Adresse (L22). Die Liste dahinter holt nur, was sie zeigt; ob ein
    gefundener Schein offen ist, fragt deshalb die Datenbank zu genau den
    Treffern (`scheine_verrechnet`, derselbe Kern).
  */
  const [trefferUnverrechnet, setTrefferUnverrechnet] = useState<Set<string> | null>(null);
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
      let offen: Set<string> | null = null;
      if (nurUnverrechnet) {
        const unterschrieben = gefunden.filter((s) => s.status === 'Unterschrieben');
        const verrechnet = new Set(await scheineAufRechnung(user.companyId, unterschrieben.map((s) => s.id)));
        offen = new Set(unterschrieben.filter((s) => !verrechnet.has(s.id)).map((s) => s.id));
      }
      setTrefferUnverrechnet(offen);
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

  /*
    DIE UNVERRECHNETEN SCHEINE ÜBER ALLE (Durchsicht 15.11.2026, P3) — nach
    denselben Regeln wie auf der Startseite und unter Rechnungen, älteste
    zuerst. Vorher wurde unter den geladenen gesucht (die 60 jüngsten): ein
    älterer Schein fiel heraus, bevor er „über 4 Wochen“ alt werden konnte.

    ZAHL UND SEITE STATT ALLER SCHEINE (L22, Messung gegen den gewachsenen
    Bestand). Bis dahin kamen alle unverrechneten Kennungen in 20 Seiten
    nacheinander und danach jeder dieser Scheine ganz — bei 9.888 Scheinen
    511 Anfragen und 51 s, bis die Liste der Leitung stand. Jetzt zählt die
    Datenbank (`scheine_unverrechnet_stand`: alle, davon über vier Wochen),
    und geholt werden nur die ältesten, die die Gruppe zeigt; „weitere
    anzeigen“ holt die nächsten. Weil die Liste älteste zuerst steht, sind
    die über vier Wochen immer ihr Anfang — der Filter „…-alt“ blättert in
    derselben Liste.

    Neu gefragt wird, wenn sich die Liste ändert (Storno, Unterschrift,
    Nachladen) — so weit, wie schon geholt war. `null`: noch unbekannt;
    `'fehler'`: nicht gekommen — dann steht das da, nicht „keiner
    unverrechnet“.
  */
  const [unverrechnetDB, setUnverrechnetDB] = useState<UnverrechnetGeladen | 'fehler' | null>(
    () => anfang?.unverrechnet ?? null,
  );
  const geholtBisher = useRef(0);
  geholtBisher.current = unverrechnetDB && unverrechnetDB !== 'fehler' ? unverrechnetDB.geholt : 0;
  const [unverrechnetLaedt, setUnverrechnetLaedt] = useState(false);
  const scheinSchluessel = useMemo(() => scheine.map((x) => `${x.id}:${x.status}`).join('|'), [scheine]);
  useEffect(() => {
    if (!user || !mitVerrechnung) {
      setUnverrechnetDB(null);
      return;
    }
    let weg = false;
    Promise.all([
      scheineUnverrechnetStand(auffaelligBis(todayStr())),
      unverrechnetHolen(user.companyId, 0, Math.max(UNVERRECHNET_ERSTE, geholtBisher.current)),
    ])
      .then(([stand, seite]) => {
        if (weg) return;
        const neu = { stand: { anzahl: stand.anzahl, alt: stand.alt }, scheine: seite.scheine, geholt: seite.geholt };
        setUnverrechnetDB(neu);
        merken({ unverrechnet: neu });
      })
      .catch(() => { if (!weg) setUnverrechnetDB('fehler'); });
    return () => {
      weg = true;
    };
  }, [user, mitVerrechnung, scheinSchluessel, merken]);
  /** Die nächsten unverrechneten Scheine — erst, wenn jemand sie sehen will. */
  async function unverrechnetWeiter() {
    if (!user || !unverrechnetDB || unverrechnetDB === 'fehler') return;
    const bisher = unverrechnetDB;
    setUnverrechnetLaedt(true);
    try {
      const seite = await unverrechnetHolen(user.companyId, bisher.geholt, SCHEINE_JE_SEITE);
      const schon = new Set(bisher.scheine.map((x) => x.id));
      setUnverrechnetDB({
        ...bisher,
        scheine: [...bisher.scheine, ...seite.scheine.filter((x) => !schon.has(x.id))],
        geholt: bisher.geholt + seite.geholt,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUnverrechnetLaedt(false);
    }
  }
  const unverrechnetFehler = unverrechnetDB === 'fehler';
  const unverrechnetGeladen = unverrechnetDB && unverrechnetDB !== 'fehler' ? unverrechnetDB : null;
  const unverrechnetZeilenAlle = useMemo(
    () => (unverrechnetGeladen ? unverrechnetZeilen(unverrechnetGeladen.scheine, todayStr()) : null),
    [unverrechnetGeladen],
  );
  /*
    Die unverrechneten Scheine, ÄLTESTE ZUERST — dieselbe Reihenfolge wie auf
    der Startseite (Regel 7.3: nach Dringlichkeit). Eine Leistung von
    vorgestern ist normal, eine von vor drei Monaten ist ein Befund.
  */
  const unverrechnetAlle = useMemo(() => {
    if (!mitVerrechnung || !unverrechnetZeilenAlle) return null;
    const zeilen = unverrechnetZeilenAlle;
    return (nurUnverrechnet === 'nicht-verrechnet-alt' ? zeilen.filter((z) => z.tage >= AUFFAELLIG_AB_TAGEN) : zeilen)
      .map((z) => z.schein);
  }, [mitVerrechnung, nurUnverrechnet, unverrechnetZeilenAlle]);
  /*
    FÜR DAS SCHRIFTFELD (Planlinie B1): dieselbe Zählung wie die Gruppe
    „Nicht verrechnet“, nur ohne den Filter aus der Adresse — das Feld sagt,
    wie die Liste steht, nicht, was gerade gefiltert ist. Gezählt hat die
    Datenbank über alle (L22), nicht die geholte Seite.
  */
  const unverrechnetStand = mitVerrechnung && unverrechnetGeladen ? unverrechnetGeladen.stand : null;
  /** Wie viele die Gruppe (oder der Filter aus der Adresse) insgesamt hat — und wie viele davon noch nicht geholt sind. */
  const unverrechnetGesamt = unverrechnetStand
    ? (nurUnverrechnet === 'nicht-verrechnet-alt' ? unverrechnetStand.alt : unverrechnetStand.anzahl)
    : null;
  const unverrechnetRest = unverrechnetGesamt !== null && unverrechnetGeladen
    ? Math.max(0, unverrechnetGesamt - unverrechnetGeladen.geholt)
    : 0;
  const unverrechnetMehr = unverrechnetRest > 0
    ? { anzahl: unverrechnetRest, laedt: unverrechnetLaedt, onMehr: () => void unverrechnetWeiter() }
    : undefined;
  /*
    NEU EINGEGANGEN (Durchsicht 15.11.2026, V9): was seit dem letzten Ansehen
    unterschrieben wurde, neueste zuerst. Gezeigt heißt gesehen: danach setzt
    `scheine_gesehen` den Merker — die Zeile auf der Startseite verschwindet.
    `'fehler'`: nicht gekommen; dann steht das da, nicht „nichts Neues“.
  */
  const [neuDB, setNeuDB] = useState<WithId<WorkSheet>[] | 'fehler' | null>(null);
  // Am Betrieb, nicht am Benutzerobjekt: ein zweites Laden nach dem Merken fände nichts mehr.
  const neuBetrieb = user?.companyId;
  useEffect(() => {
    if (!neuBetrieb || !nurNeu) {
      setNeuDB(null);
      return;
    }
    let weg = false;
    scheineNeu()
      .then(async (koepfe) => {
        const voll = await listWorkSheetsByIds(neuBetrieb, koepfe.map((k) => k.id));
        const nachId = new Map(voll.map((v) => [v.id, v]));
        if (weg) return;
        setNeuDB(koepfe.map((k) => nachId.get(k.id)).filter((v): v is WithId<WorkSheet> => !!v));
        // Erst gezeigt, dann gesehen — scheitert das Merken, kommt die Zeile eben noch einmal.
        void scheineGesehen().catch(() => undefined);
      })
      .catch(() => { if (!weg) setNeuDB('fehler'); });
    return () => { weg = true; };
  }, [neuBetrieb, nurNeu]);
  const neuListe = Array.isArray(neuDB) ? neuDB : null;
  const filterFehler = (nurUnverrechnet && unverrechnetFehler) || (nurNeu && neuDB === 'fehler');
  /** Die Liste des Filters aus der Adresse, in ihrer Reihenfolge — oder `null`. */
  const filterListe = nurUnverrechnet ? unverrechnetAlle : nurNeu ? neuListe : null;
  /** Nur für den Filter aus der Adresse: welche Scheine er durchlässt. */
  const unverrechnet = useMemo(
    () => (filterListe ? new Set(filterListe.map((s) => s.id)) : null),
    [filterListe],
  );
  /*
    Für die Treffer vom Server gilt, was die Datenbank zu ihnen sagt — die
    geholte Seite kennt die älteren nicht. „…-alt“: nur die über vier Wochen.
  */
  const trefferErlaubt = useMemo(() => {
    if (!nurUnverrechnet || !trefferUnverrechnet || !treffer) return null;
    const bis = nurUnverrechnet === 'nicht-verrechnet-alt' ? auffaelligBis(todayStr()) : null;
    return new Set(treffer.filter((s) => trefferUnverrechnet.has(s.id) && (!bis || s.datum <= bis)).map((s) => s.id));
  }, [nurUnverrechnet, trefferUnverrechnet, treffer]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    // Unter dem Filter „nicht verrechnet“ älteste zuerst, „neu eingegangen“ neueste zuerst, sonst wie geladen.
    const grundmenge = trefferGelten
      ? (treffer as WithId<WorkSheet>[])
      : unverrechnet && filterListe
        ? filterListe
        : scheine;
    const erlaubt = trefferGelten && trefferErlaubt ? trefferErlaubt : unverrechnet;
    return grundmenge.filter((s) => {
      if (erlaubt && !erlaubt.has(s.id)) return false;
      if (s.status === 'Verworfen' && !zeigeVerworfene) return false;
      // Das Serverergebnis ist bereits die Antwort auf den Begriff; noch
      // einmal danach zu filtern würde einen Treffer wegwerfen, dessen
      // Baustellennummer anders geschrieben ist („PR-2026-042").
      if (!q || trefferGelten) return true;
      return [s.customerName, s.projectNumber, s.datum, s.notizen].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [scheine, treffer, trefferGelten, trefferErlaubt, suche, zeigeVerworfene, unverrechnet, filterListe]);
  /*
    Der Filter „nicht verrechnet“ ohne Suchbegriff zeigt die Liste der
    Datenbank selbst: Zahl über alle und „weitere anzeigen“ holt nach (L22).
    Mit Suchbegriff gilt, was gefunden wurde.
  */
  const filterGanz = !!nurUnverrechnet && !suche.trim() && !trefferGelten;

  /*
    DIE OFFENE ANSICHT — nur ohne Suchbegriff und ohne Filter aus der Adresse.
    Die Suche geht über ALLE Scheine, egal welche Ansicht gewählt ist: wer
    einen bestimmten Schein sucht, soll ihn nicht deshalb nicht finden, weil
    er unterschrieben ist. Solange gesucht wird, stehen die Segmente deshalb
    nicht da — sie würden eine Eingrenzung versprechen, die nicht gilt.
  */
  const offeneAnsicht = ansicht === 'offen' && !suche.trim() && !nurUnverrechnet && !nurNeu;
  const entwuerfe = useMemo(() => scheine.filter((s) => s.status === 'Entwurf'), [scheine]);
  const verworfenListe = useMemo(() => scheine.filter((s) => s.status === 'Verworfen'), [scheine]);

  /*
    EIN SCHEIN AUS DER ADRESSE, DER NICHT UNTER DEN GELADENEN IST. Die
    Baustellenakte verweist mit `?markiert=` auf jeden Schein ihrer Baustelle,
    auch auf einen vom letzten Jahr; die Liste lädt aber nur die jüngsten
    fünfzig. Ohne das Nachschlagen öffnete der Tipp in der Akte nichts. Geholt
    wird genau dieser eine, über die bestehende Abfrage — erst, wenn die Liste
    geladen ist und ihn nicht hat.
  */
  const [nachgeschlagen, setNachgeschlagen] = useState<WithId<WorkSheet> | null>(null);
  const geladenHat = useMemo(
    () => !!offen && [...scheine, ...(tiefeScheine ?? []), ...(treffer ?? [])].some((s) => s.id === offen),
    [offen, scheine, tiefeScheine, treffer],
  );
  useEffect(() => {
    if (!offen || loading || geladenHat || nachgeschlagen?.id === offen) return;
    let weg = false;
    getWorkSheet(offen)
      .then((s) => {
        if (!weg && s) setNachgeschlagen(s);
      })
      // Nicht gefunden oder nicht lesbar: die Liste steht trotzdem da.
      .catch(() => undefined);
    return () => {
      weg = true;
    };
  }, [offen, loading, geladenHat, nachgeschlagen]);

  /** Der Schein im Seitenfenster: aus der Liste, der tiefen Prüfung, der Suche oder nachgeschlagen. */
  const offenerSchein = useMemo(
    () =>
      offen
        ? [...scheine, ...(tiefeScheine ?? []), ...(treffer ?? []), ...(nachgeschlagen ? [nachgeschlagen] : [])].find(
            (s) => s.id === offen,
          ) ?? null
        : null,
    [offen, scheine, tiefeScheine, treffer, nachgeschlagen],
  );

  async function pdfAusgeben(liste: WithId<WorkSheet>) {
    setBusy(true);
    try {
      // Die Liste kennt die Unterschriften ohne Bild — fürs PDF den ganzen Schein.
      const s = unterschriftOhneBild(liste) ? await getWorkSheet(liste.id) : liste;
      if (!s) throw new Error('Schein nicht gefunden');
      // Der ganze Firmensatz, nicht nur der Name: der Beleg soll sagen, an
      // wen der Kunde sich wenden muss — und zwar so, wie er bei der
      // Unterschrift dastand (seit 24.10.2026).
      const firma = company ? await belegFirma(company, s.ausstellerStand) : null;
      const blob = await buildWorkSheetPdf(s, {
        name: firma?.name ?? 'Installateur',
        addressLine: firma?.addressLine,
        contactLine: firma?.contactLine,
        logoUrl: firma?.logoUrl,
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
        ausgewaehlt={offen === s.id}
        title={s.customerName}
        nummer={s.projectNumber}
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
            {s.ersetzt && (
              <span className="mt-1 block text-xs text-ink-muted">Ersatz für einen stornierten Schein</span>
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
          // Das Blatt mit dem Pfeil (E74): am Telefon teilen, am Rechner speichern.
          <PdfKnopf label={`Schein ${s.projectNumber} vom ${datumAT(s.datum)} als PDF teilen oder speichern`} laeuft={busy} onClick={() => pdfAusgeben(s)} />
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
    einem Link (Prüflauf 25.09.2026, P4-12). Seit E72 (09.11.2026) mit
    `KnopfLink`: die von Hand nachgebauten Klassen trugen Schatten, halbfette
    Schrift und Skalierung, die der Zweitknopf „PDF“ daneben nicht hat.
  */
  const weiterbearbeitenLink = (s: WithId<WorkSheet>) => (
    <KnopfLink to={`/worksheet?entwurf=${s.id}`} variant="secondary">
      Weiterbearbeiten
    </KnopfLink>
  );

  /** Steht über der Liste etwas (Fehler, Suchauskunft, verworfene Entwürfe)? */
  const obenEtwas = !!error || !!suche.trim() || verworfene > 0;
  const suchend = !!suche.trim();
  /*
    DER ERSTE BESUCH: geladen werden die jüngsten Scheine ohne Datumsgrenze —
    null heißt, es gibt noch keinen. Dann gibt es nichts zu filtern und nichts
    zu prüfen (die Prüfung „Stunden ohne Buchung“ geht über Scheine); Leiste
    und Prüfkarte kommen mit dem ersten Schein.
  */
  const ersterSchein = !loading && !error && scheine.length === 0 && !suchend && !nurUnverrechnet && !nurNeu;

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
            <KnopfLink to="/worksheet">Neuer Schein</KnopfLink>
          )
        }
        stand={!loading && scheine.length > 0 ? (
          <MetricRow label="Stand der Handwerksscheine">
            <Metric label="Entwürfe" value={entwuerfe.length} hint="noch nicht unterschrieben" />
            {unverrechnetStand && (
              <Metric
                label="Nicht verrechnet"
                value={unverrechnetStand.anzahl}
                tone={unverrechnetStand.alt > 0 ? 'warning' : 'default'}
                hint={unverrechnetStand.alt > 0 ? `davon ${unverrechnetStand.alt} über 4 Wochen` : 'unterschrieben, ohne Rechnung'}
              />
            )}
            {darfZeitenSehen && (
              <Metric
                label="Ohne Buchung"
                value={ohneBuchung.length}
                tone={ohneBuchung.length > 0 ? 'warning' : 'default'}
                hint={ohneBuchung.length === 1 ? 'Schein prüfen' : 'Scheine prüfen'}
                bereit={pruefungBereit && !pruefungFehler}
              />
            )}
          </MetricRow>
        ) : undefined}
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
      {darfZeitenSehen && !ersterSchein && (
        <Card
          title={pruefungBereit && !pruefungFehler ? `Stunden ohne Buchung (${ohneBuchung.length})` : 'Stunden ohne Buchung'}
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
          {!pruefungBereit ? (
            <div className="px-4 pb-3">
              <SkeletonList rows={2} />
            </div>
          ) : pruefungFehler ? (
            <div className="px-4 pb-3 pt-3">
              <Hinweiszeile stufe="warn" role="status" einzelheiten={<p>
                Geprüft wird deshalb nicht — sonst stünde jeder Schein als „ohne Buchung“ da. Bitte die
                Seite neu laden.
              </p>}>
                <p><strong>Die Zeitbuchungen dieses Zeitraums konnten nicht geladen werden.</strong></p>
              </Hinweiszeile>
            </div>
          ) : (<>
          {/*
            KNAPP, WENN NICHTS OFFEN IST (Auftrag 04.11.2026: „das Fenster
            erscheint so unnötig groß“). Bis dahin standen untereinander die
            Prüfbasis, „Weiter zurück prüfen“ mit seinen Knöpfen und ein
            Leerzustand mit eigenem Block — rund 300 px für die Auskunft „nichts
            offen“. Jetzt: das Ergebnis in einer Zeile, darunter worauf es sich
            stützt, und „Weiter zurück prüfen“ daneben (am Handy darunter).
            Die Karte bleibt — sie trägt die Handlung, weiter zurück zu prüfen.
          */}
          <div className="ohne-buchung-kopf">
            <div className="min-w-0">
              {ohneBuchung.length === 0 ? (
                /* Eine Zeile, wenn nichts offen ist (D5, E86) — was genau geprüft wird, sagt die Hilfe. */
                <p className="text-sm text-ink">Alle Stunden gebucht.</p>
              ) : minutenOhneBuchung(ohneBuchung) > 0 && (
                <p className="text-sm text-ink">
                  <strong>{fmtDauer(minutenOhneBuchung(ohneBuchung))}</strong> stehen unterschrieben
                  beim Kunden und in keiner Zeiterfassung.
                </p>
              )}
              {/*
                WORAUF SICH DIE PRÜFUNG STÜTZT, steht sichtbar da — sonst hiesse
                „nichts offen" mal „im letzten Monat" und mal „im letzten Jahr",
                ohne dass es jemand unterscheiden könnte.
              */}
              <p className="mt-1 text-xs text-ink-muted">
                {tiefePruefung
                  ? `Geprüft über die letzten ${tiefePruefung} Tage (${pruefBasis.length} unterschriebene Scheine).`
                  : scheine.length === 1
                    ? 'Geprüft über den einen geladenen Schein dieser Liste.'
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
            </div>

            {/*
              Beschriftung und Knöpfe brechen nur ZWISCHEN einander um, nie
              mitten durch die Reihe: am Telefon stand die Auswahl sonst
              halb neben, halb unter der Beschriftung. `klein` nimmt den
              Knöpfen Polsterung und Schriftgrösse, nicht die Höhe.
            */}
            <div className="ohne-buchung-weiter">
              <span className="whitespace-nowrap text-sm text-ink-muted">Weiter zurück prüfen:</span>
              <span className="flex flex-wrap items-center gap-2">
                {PRUEF_ZEITRAEUME.map((tage) => (
                  <Button
                    key={tage}
                    groesse="klein"
                    variant="secondary"
                    className="pruef-zeitraum"
                    aria-pressed={tiefePruefung === tage}
                    disabled={pruefungLaeuft}
                    onClick={() => void tieferPruefen(tage)}
                  >
                    {tage === 365 ? '1 Jahr' : `${tage} Tage`}
                  </Button>
                ))}
                {pruefungLaeuft && <span className="text-sm text-ink-muted">Wird geprüft …</span>}
              </span>
            </div>
          </div>

          {ohneBuchung.length > 0 && (
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
                  ausgewaehlt={offen === schein.id}
                  pfeil
                  title={
                    <>
                      <span>{schein.customerName}</span>{' '}
                      <span className="ml-2 inline-flex align-middle"><Warnung stufe={tage >= 30 ? 'dringend' : 'achtung'}>{tageWort(tage)}</Warnung></span>
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
          </>)}
        </Card>
      )}

      {!listeZeigen ? (
        <SkeletonList rows={6} />
      ) : (<>
      {adressFilter && (
        <Adressfilter
          text={adressFilter === 'nicht-verrechnet-alt'
            ? 'nicht verrechnet, älter als 4 Wochen'
            : adressFilter === 'neu-eingegangen' ? 'neu eingegangen' : 'unterschrieben, nicht verrechnet'}
          parameter={['filter']}
        />
      )}

      {wartend.length > 0 && (
        <Card
          title={`Noch nicht gesendet (${wartend.length})`}
          hint="Ohne Empfang gespeichert oder unterschrieben. Diese Scheine liegen auf diesem Gerät und gehen von selbst hinaus, sobald wieder Netz da ist — in der Reihenfolge, in der sie entstanden. Ein Entwurf lässt sich bis dahin weiterbearbeiten; ein unterschriebener ist fertig und wartet nur noch."
          buendig
        >
          <List>
            {wartend.map((w) => {
              const bekannt = scheine.find((x) => x.id === w.id);
              const kunde = w.kopf?.customerName ?? bekannt?.customerName ?? 'Handwerksschein';
              const nummer = w.kopf?.projectNumber ?? bekannt?.projectNumber;
              const tag = w.kopf?.datum ?? bekannt?.datum;
              const oeffnen = !w.unterschrieben && darfSchreiben;
              return (
                <ListRow
                  key={w.id}
                  title={kunde}
                  nummer={nummer}
                  zustand={<Zustand stand="laeuft">{w.unterschrieben ? 'Unterschrieben' : 'Entwurf'}</Zustand>}
                  to={oeffnen ? `/worksheet?entwurf=${w.id}` : undefined}
                  pfeil={oeffnen}
                  subtitle={`${tag ? `${datumAT(tag)} · ` : ''}wartet auf Netz`}
                />
              );
            })}
          </List>
        </Card>
      )}

      <Card
        title={
          offeneAnsicht
            ? undefined
            : unverrechnet
              ? `Nicht verrechnet (${filterGanz && unverrechnetGesamt !== null ? unverrechnetGesamt : sichtbar.length})`
              : `Scheine (${scheine.length - verworfene})`
        }
        buendig
      >
        {/*
          SUCHE UND ANSICHT ÜBER DER LISTE (Regel 4, Listenleiste). Beim
          Tippen verschwinden die Reiter; die Suche steht am Handy darüber
          und rutscht deshalb nicht unter dem Finger weg. Der Platzhalter
          nennt, was die Suche findet — auch einen Monat („09.2026“).
        */}
        {!ersterSchein && (
          <Listenleiste
            reiter={!suchend && !adressFilter ? (
              <Segmente name="Ansicht" werte={ANSICHTEN} wert={ansicht} onChange={ansichtSetzen} />
            ) : undefined}
            suche={{ id: 'scheine-suche', wert: suche, onChange: setSuche, platzhalter: 'Kunde, Baustelle oder Monat', name: 'Scheine durchsuchen' }}
          />
        )}
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

        {loading || (adressFilter && !unverrechnet && !filterFehler) ? (
          <div className="px-4 py-4">
            <SkeletonList rows={4} />
          </div>
        ) : filterFehler ? (
          // Nicht gekommen ist nicht „alles verrechnet“ (oder „nichts Neues“) — und nicht „alle Scheine“.
          <p className="leer">
            {nurNeu
              ? 'Die neu eingegangenen Scheine konnten nicht geladen werden. Bitte die Seite neu laden.'
              : 'Ob Scheine verrechnet sind, konnte nicht geladen werden. Bitte die Seite neu laden.'}
          </p>
        ) : offeneAnsicht ? (
          scheine.length === 0 ? (
            /* Nicht geladen ist nicht „noch keiner“: der Fehler oben sagt, was los ist. */
            error ? null : (
              <EmptyState
                zeichnung="schein"
                titel={darfSchreiben ? 'Dein erster Handwerksschein.' : 'Noch kein Handwerksschein erstellt.'}
                aktionImDaumen
                action={darfSchreiben ? <KnopfLink to="/worksheet">Neuer Schein</KnopfLink> : undefined}
              >
                Ein Schein hält Stunden und Material einer Baustelle fest — mit Unterschrift des Kunden vor Ort.
              </EmptyState>
            )
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
                <Abschnitt titel="Nicht verrechnet" anzahl={unverrechnetStand ? unverrechnetStand.anzahl : undefined}>
                  {unverrechnetFehler ? (
                    <p className="leer">Ob Scheine verrechnet sind, konnte nicht geladen werden. Bitte die Seite neu laden.</p>
                  ) : !unverrechnetAlle ? (
                    <div className="px-4 pb-4">
                      <SkeletonList rows={2} />
                    </div>
                  ) : unverrechnetAlle.length > 0 ? (
                    <Gruppe key="unverrechnet" eintraege={unverrechnetAlle} zeile={scheinZeile} weitere={unverrechnetMehr} />
                  ) : (
                    <p className="leer">Kein unterschriebener Schein ist unverrechnet.</p>
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
        ) : sichtbar.length === 0 && error && scheine.length === 0 && !suchend ? (
          null
        ) : sichtbar.length === 0 ? (
          <EmptyState
            zeichnung={unverrechnet ? undefined : scheine.length === 0 ? 'schein' : suchend ? 'suche' : undefined}
            titel={!unverrechnet && scheine.length > 0 && suchend ? 'Keine passenden Scheine.' : undefined}
            action={!unverrechnet && scheine.length > 0 && suchend ? <Button variant="secondary" onClick={() => setSuche('')}>Suche zurücksetzen</Button> : undefined}
          >
            {unverrechnet && nurNeu
              ? 'Seit dem letzten Ansehen ist kein Schein neu eingegangen.'
              : unverrechnet
              ? 'Kein unterschriebener Schein ist unverrechnet.'
              : scheine.length === 0
              ? 'Noch kein Handwerksschein erstellt.'
              : suchend
                ? `Gesucht wurde „${suche.trim()}“ in Kunde, Baustelle und Monat.`
                : 'Kein offener Schein — nur verworfene Entwürfe.'}
          </EmptyState>
        ) : (
          // Der Schlüssel setzt „und N weitere“ zurück, sobald sich die Menge ändert.
          <Gruppe
            key={`${ansicht}|${trefferZu}|${suche.trim()}|${adressFilter ?? ''}`}
            eintraege={sichtbar}
            zeile={scheinZeile}
            weitere={filterGanz ? unverrechnetMehr : undefined}
          />
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
      </>)}

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
                    Für eine Korrektur danach „Ersatzschein anlegen“ — er übernimmt Baustelle, Tag und Material.
                  </p>
                  <StornoVerrechnung lage={stornoLage} />
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
                          const weg = stornoFuer;
                          toast.success('Schein storniert', {
                            label: 'Ersatzschein anlegen',
                            onClick: () => navigate(ersatzAdresse(weg)),
                          });
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
                <>
                {/* M3/F10: was der Schein über das Ausgegebene hinaus trägt, vom Lager abbuchen. */}
                {offenerSchein.status === 'Unterschrieben' && (
                  <VerbrauchAmSchein key={offenerSchein.id} scheinId={offenerSchein.id} />
                )}
                {/*
                  DIE KNÖPFE DES SCHEINS (U4, Durchsicht 15.11.2026): eine
                  gefüllte Hauptaktion je Stand, höchstens eine zweite, das
                  Übrige im ⋯. Vorher standen „PDF · Verwerfen ·
                  Weiterbearbeiten“ gleich laut nebeneinander und „Löschen“
                  darunter. Unumkehrbares — Löschen, Stornieren — steht im ⋯,
                  die Rückfrage danach bleibt.

                  Verwerfen darf, wer auch weiterbearbeiten darf — dieselbe
                  Grenze wie in der Datenbank (`app.schein_schreibt`): die
                  Führung jeden Entwurf, der Monteur seinen eigenen. Das
                  Fenster geht dabei zu: die Rückfrage steht für sich.

                  LÖSCHEN NUR VOR DER UNTERSCHRIFT (Auftrag 04.11.2026): ein
                  Entwurf und ein verworfener Entwurf sind keine Belege; die
                  Datenbank hält die Grenze (`work_sheets_loeschen`). Ein
                  unterschriebener Schein wird storniert, nie gelöscht.

                  DER ERSATZ ZUM STORNO (P4): mit Verweis auf den
                  stornierten Schein; er erbt dessen Verrechnung.
                */}
                {(() => {
                  const s = offenerSchein;
                  const eigen = darfDiesen(s);
                  const pdfKnopf = <Button variant="secondary" loading={busy} onClick={() => pdfAusgeben(s)}>PDF</Button>;
                  const loeschen = eigen && (s.status === 'Entwurf' || s.status === 'Verworfen')
                    ? [{ label: 'Löschen', danger: true, onSelect: () => { setLoeschenFuer(s); setOffen(null); } }] : [];
                  if (eigen && s.status === 'Entwurf') {
                    return <Fensteraktionen about={`Schein ${s.projectNumber}`}
                      haupt={<KnopfLink to={`/worksheet?entwurf=${s.id}`}>Weiterbearbeiten</KnopfLink>}
                      zweit={pdfKnopf}
                      weitere={[{ label: 'Verwerfen', onSelect: () => { setVerwerfenFuer(s); setOffen(null); } }, ...loeschen]} />;
                  }
                  if (eigen && s.status === 'Verworfen') {
                    return <Fensteraktionen about={`Schein ${s.projectNumber}`}
                      haupt={<Button loading={busy} onClick={() => void wiederAufnehmen(s)}>Wieder aufnehmen</Button>}
                      zweit={pdfKnopf}
                      weitere={loeschen} />;
                  }
                  if (darfSchreiben && s.status === 'Storniert') {
                    return <Fensteraktionen about={`Schein ${s.projectNumber}`}
                      haupt={<KnopfLink to={ersatzAdresse(s)}>Ersatzschein anlegen</KnopfLink>}
                      zweit={pdfKnopf} />;
                  }
                  return <Fensteraktionen about={`Schein ${s.projectNumber}`}
                    zweit={pdfKnopf}
                    weitere={darfStornieren && s.status === 'Unterschrieben'
                      ? [{ label: 'Stornieren', danger: true, onSelect: () => setStornoFuer(s) }] : []} />;
                })()}
                </>
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
          const id = verwerfenFuer.id;
          await discardWorkSheetDraft(id, user.name);
          /*
            RÜCKGÄNGIG IN DER MELDUNG (F15): derselbe Weg wie „Wiederherstellen“
            im Papierkorb (M01d) — der Entwurf ist mit Zeiten, Material und
            Fotos wieder in der Arbeitsliste.
          */
          toast.success('Entwurf verworfen', {
            label: 'Rückgängig',
            onClick: () => void restoreWorkSheetDraft(id).then(
              () => { toast.success('Schein wiederhergestellt — wieder ein Entwurf'); void laden(); },
              (e) => toast.error(grundAus(e, 'Rückgängig ging nicht.')),
            ),
          });
          setVerwerfenFuer(null);
          await laden();
        }}
      />

      {/*
        LÖSCHEN IST ENDGÜLTIG — deshalb rot, und die Rückfrage nennt, was mit
        weggeht: Zeiten, Material, Fotos. Wer nur aufräumen will, kann weiter
        verwerfen; das bleibt umkehrbar.
      */}
      <ConfirmDialog
        open={!!loeschenFuer}
        title={loeschenFuer?.status === 'Verworfen' ? 'Verworfenen Entwurf löschen' : 'Entwurf löschen'}
        message={
          loeschenFuer
            ? `${loeschenFuer.customerName}, ${datumAT(loeschenFuer.datum)} · ` +
              `${fmtDauer(loeschenFuer.zeiten.reduce((n, z) => n + z.minuten, 0))} · ` +
              `${loeschenFuer.material.length} Materialposten · ` +
              `${(loeschenFuer.fotos ?? []).length === 1 ? '1 Foto' : `${(loeschenFuer.fotos ?? []).length} Fotos`}. ` +
              'Der Entwurf wird samt Zeiten, Material und Fotos endgültig gelöscht und lässt sich nicht zurückholen.'
            : undefined
        }
        confirmLabel="Endgültig löschen"
        onCancel={() => setLoeschenFuer(null)}
        onConfirm={async () => {
          if (!loeschenFuer) return;
          await deleteWorkSheetDraft(user.companyId, loeschenFuer.id, (loeschenFuer.fotos ?? []).map((f) => f.pfad));
          toast.success('Entwurf gelöscht');
          setLoeschenFuer(null);
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
                {/* OHNE UHRZEIT KEIN PLATZHALTER (14.11.2026): Zeiten dürfen als
                    reine Dauer erfasst sein; „Max · — · 08:30 Std“ las sich wie
                    ein Anzeigefehler. Dann steht nur die Dauer hinter dem Namen. */}
                {z.mitarbeiter}
                {z.helfer ? ' (Helfer)' : ''} · {z.von && z.bis ? `${z.von}–${z.bis} · ` : ''}
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
