import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { nachtzeitVon, ueberstundenRegelVon } from '@/lib/lohnregeln';
import { listUsers } from '@/lib/db/users';
import { listAnpassungen } from '@/lib/db/urlaubsanspruch';
import { listProjectsByNumbers } from '@/lib/db/projects';
import {
  subscribeEntriesInRange,
  listEntriesInRange,
  stundenDerBaustellen,
  deleteTimeEntry,
  listUrlaubstage,
} from '@/lib/db/timeEntries';
import {
  calcMonthStats,
  calcCompleteness,
  fmtMin,
  localDateStr,
  offeneWerktage,
  uebertragsRegel,
  tageWort,
  dezemberHalbtage,
  tagesAnteil,
} from '@/lib/time';
import { einstufungText } from '@/lib/einstufung';
import type { WithId } from '@/lib/db/core';
import type { AppUser, Project, TimeEntry, UrlaubsanspruchAnpassung } from '@/types';
import { fuehrtZeitkonto } from '@/lib/permissions';
import Hinweiszeile from '@/components/Hinweiszeile';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import RowMenu from '@/components/RowMenu';
import BottomSheet from '@/components/BottomSheet';
import { Segmente } from '@/components/LotBausteine';
import ExportDialog from './ExportDialog';
import ProjectSummary from './ProjectSummary';
import { fachMinutenJeBaustelle } from '@/features/projects/baustellenLage';
import ArbeitszeitGrenzenKarte from './ArbeitszeitGrenzenKarte';
import { useArbeitszeitGrenzen } from './useArbeitszeitGrenzen';
import type { Grenzfall } from './arbeitszeitGrenzen';
import PersonFenster from './PersonFenster';
import UebersichtListe, { type UebersichtZeile } from './UebersichtListe';
import { TippBereich } from './Streifen';
import {
  montagDerWoche,
  plusTage,
  summeDerTage,
  tageDerWoche,
  tageDesMonats,
  tagesauswertung,
  tagKurz,
} from './tagesauswertung';
import { wochenTitel } from '@/features/assignments/planungKopf';
import TimeForm from '@/features/time/TimeForm';
import { KrankmeldungKarte } from '@/features/vacations/Krankmeldungen';
import ConfirmDialog from '@/components/ConfirmDialog';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ErrorState, EmptyState, SkeletonList, TeilFehler } from '@/components/States';
import {
  buildMonthCsv,
  monthCsvFilename,
  buildUserCsv,
  userCsvFilename,
  buildUserProjectCsv,
  userProjectCsvFilename,
  hoursPdfFilename,
  downloadCsv,
  entriesInRange,
} from './export';
import { datumAT } from '@/lib/datum';

const MONTHS = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** Wie viele Jahre die Auswahl zurückreicht — wie bisher: das laufende und vier davor. */
const JAHRE_ZURUECK = 4;

/** Was im Seitenfenster gerade steht, wenn es nicht die Person ist. */
type Aufgabe =
  | { art: 'erfassen'; uid: string | null; tag: string | null }
  | { art: 'bearbeiten'; eintrag: WithId<TimeEntry> }
  | { art: 'meldung'; id: string };

/**
 * Die erste Woche eines Monats: die mit dem ersten Donnerstag (ISO, wie die
 * Kalenderwoche) — im laufenden Monat die laufende Woche (Auftrag 3.4).
 */
function startWoche(jahr: number, monat: number, heute: string): string {
  if (heute.startsWith(`${jahr}-${String(monat + 1).padStart(2, '0')}`)) return montagDerWoche(heute);
  const erster = localDateStr(new Date(jahr, monat, 1));
  const montag = montagDerWoche(erster);
  return plusTage(montag, 3) < erster ? plusTage(montag, 7) : montag;
}

/**
 * Mitarbeiterübersicht (Buchhaltung/GF/Admin): Monatsauswertung je Mitarbeiter
 * mit Vollständigkeitskontrolle. Da es keinen Freigabe-Workflow gibt, ist die
 * Ampel die eigentliche Kontrollinstanz der Geschäftsführung.
 *
 * SEIT RUNDE 4 (Auftrag 3): eine Zeile je Person mit dem Monat als Streifen
 * und den Summen daneben, oben wer Tage ohne Buchung hat; die Stunden je Tag
 * in der Ansicht „Woche“; alles aus der aufgeklappten Karte im Seitenfenster
 * „Person im Monat“. Gerechnet wird nichts neu — Zahlen aus `calcMonthStats`
 * und der Vollständigkeit, die Tage aus `tagesauswertung`.
 */
export default function AccountingView() {
  const { user, company, einblick } = useAuth();
  /*
    IM SUPPORTZUGANG SIND ZEITBUCHUNGEN VERSCHLOSSEN (Art. 9 DSGVO, in jeder
    Stufe). Gerechnet ergäbe das „11 Tage fehlen, −88:00“ für jeden — ein
    Fehlalarm, der den Support in die Irre führt (Testbericht 30.09.2026,
    M40). Stattdessen steht „nicht einsehbar“.
  */
  const imSupport = !!einblick;
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  /** Die Belegschaft ist da — erst dann prüft die Seite die Arbeitszeitgrenzen (sonst zweimal: leer, dann voll). */
  const [belegschaftDa, setBelegschaftDa] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<WithId<TimeEntry>[]>([]);
  /** Alle Fachminuten der vorkommenden Baustellen; `null` = nicht geladen. */
  const [gesamtFach, setGesamtFach] = useState<Map<string, number> | null>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ein Nebenladevorgang ist ausgefallen — die Auswertung steht trotzdem. */
  const [nebenFehler, setNebenFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  /*
    AUS DER ADRESSE (Startseite, Nachtest 01.10.2026): `?filter=luecken`
    filtert auf „mit Tagen ohne Buchung“, `&monat=JJJJ-MM` wählt den Monat mit
    dem ältesten fehlenden Tag — am Monatsersten liegen die Lücken im Vormonat.
    Seit Runde 4 dasselbe mit `?nur=offen` (die Kennzahl „Tage ohne Buchung“
    setzt es), und `?ansicht=woche` wählt die Woche.
  */
  const [adresse, setAdresse] = useSearchParams();
  const [nurLuecken, setNurLuecken] = useState(adresse.get('filter') === 'luecken' || adresse.get('nur') === 'offen');
  /** Offener Zeitraum-Export für einen Mitarbeiter. */
  const [exportFor, setExportFor] = useState<AppUser | null>(null);
  /*
    DAS SEITENFENSTER. Es zeigt die Person (über die Zeile oder einen Tag
    geöffnet) oder eine Aufgabe: Zeit erfassen, einen Eintrag korrigieren,
    eine Krankmeldung. Eine Aufgabe aus dem Fenster der Person heraus steht
    IM SELBEN Fenster (Auftrag 3.5) und führt danach zur Person zurück.
  */
  const [person, setPerson] = useState<{ uid: string; tag: string | null } | null>(null);
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null);
  const [toDelete, setToDelete] = useState<WithId<TimeEntry> | null>(null);
  /** Die Auswahl von Monat und Jahr, die ein Klick auf den Titel öffnet. */
  const [wahlOffen, setWahlOffen] = useState(false);

  const now = new Date();
  const heute = localDateStr(now);
  const monatAusAdresse = /^(\d{4})-(\d{2})$/.exec(adresse.get('monat') ?? '');
  const [year, setYear] = useState(monatAusAdresse ? Number(monatAusAdresse[1]) : now.getFullYear());
  const [month, setMonth] = useState(monatAusAdresse ? Number(monatAusAdresse[2]) - 1 : now.getMonth());
  /** Der Montag der gezeigten Woche; leer = die Startwoche des Monats. */
  const [wocheAb, setWocheAb] = useState<string | null>(null);
  /* Im Supportzugang gibt es keine Woche — wie keinen Streifen (Auftrag 3.2). */
  const ansicht: 'monat' | 'woche' = !imSupport && adresse.get('ansicht') === 'woche' ? 'woche' : 'monat';
  const montag = wocheAb ?? startWoche(year, month, heute);
  const wochenTage = useMemo(() => tageDerWoche(montag), [montag]);
  /*
    DIE BUCHUNGEN DES JAHRES — und in der Woche über den Jahreswechsel auch
    die Tage davor oder danach. Jede Auswertung filtert ohnehin nach Monat
    bzw. Jahr; die zusätzlichen Tage braucht nur die Woche.
  */
  const ladenVon = ansicht === 'woche' && montag < `${year}-01-01` ? montag : `${year}-01-01`;
  const ladenBis = ansicht === 'woche' && wochenTage[6] > `${year}-12-31` ? wochenTage[6] : `${year}-12-31`;

  useEffect(() => {
    if (!user) return;
    listUsers(user.companyId)
      .then((u) => {
        setUsers(u);
        setBelegschaftDa(true);
      })
      .catch((e) => setError(e.message));
  }, [user]);

  /**
   * Nur die Baustellen, die in den geladenen Buchungen VORKOMMEN.
   *
   * Gebraucht werden hier ausschliesslich Kundenname und Stundenbudget zu den
   * Nummern, die ohnehin schon auf dem Schirm sind. Vorher wurde dafuer der
   * gesamte Baustellenbestand des Betriebs geladen — nach zehn Jahren
   * zweitausend Dokumente, um dreissig Namen nachzuschlagen. Die Menge haengt
   * jetzt am angezeigten Zeitraum, nicht am Alter des Betriebs.
   */
  const projektNummern = useMemo(
    () => [
      ...new Set(
        // Nur das Jahr — die Tage der Woche über den Jahreswechsel brauchen keine Baustellendaten.
        entries.filter((e) => e.date.startsWith(String(year))).map((e) => e.projectNumber).filter(Boolean) as string[],
      ),
    ],
    [entries, year],
  );
  const nummernSchluessel = projektNummern.join('|');
  useEffect(() => {
    if (!user || projektNummern.length === 0) {
      setProjects([]);
      return;
    }
    // Ohne die Stammdaten stehen in der Auswertung nur Baustellennummern.
    listProjectsByNumbers(user.companyId, projektNummern)
      .then(setProjects)
      .catch(() => setNebenFehler('Die Baustellendaten'));
    // Am Inhalt haengen, nicht an der Array-Identitaet: sonst laedt jeder
    // Renderdurchlauf neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummernSchluessel]);

  /**
   * ALLE Stunden der vorkommenden Baustellen — nur für den Budgetstand.
   *
   * WARUM DAS SEIN MUSS. `estimatedHours` ist für den GANZEN Auftrag
   * kalkuliert. Die Auswertung verglich dagegen die Stunden des gewählten
   * Monats damit und meldete „22,5 h / 40 h · 56 %", während dieselbe
   * Baustelle im Dashboard bei „39,5 von 40 h · 99 %" stand — der
   * Unterschied waren die Stunden des Vormonats. Wer hier nachsah, hielt eine
   * ausgereizte Baustelle für halb offen.
   *
   * Dieselbe Funktion wie im Dashboard, damit die beiden Zahlen aus
   * derselben Quelle kommen und nicht wieder auseinanderlaufen können.
   *
   * `null` heißt „nicht geladen" — die Auswertung lässt den Balken dann weg,
   * statt auf die Monatszahl zurückzufallen. Das war ja der Fehler.
   */
  useEffect(() => {
    if (!user || projektNummern.length === 0) {
      setGesamtFach(new Map());
      return;
    }
    let verworfen = false;
    // Die Summen aus der Datenbank, nicht alle Buchungen aller Jahre (Analyse 09.10.2026).
    stundenDerBaustellen(projektNummern)
      .then((stunden) => {
        if (!verworfen) setGesamtFach(fachMinutenJeBaustelle(stunden));
      })
      .catch(() => {
        if (verworfen) return;
        setGesamtFach(null);
        setNebenFehler('Die Gesamtstunden der Baustellen');
      });
    return () => {
      verworfen = true;
    };
    // Am Inhalt haengen, nicht an der Array-Identitaet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nummernSchluessel]);

  // Nur das angezeigte Jahr, nicht die gesamte Betriebsgeschichte. Das Jahr
  // (nicht der Monat) deshalb, weil der Resturlaub die Urlaubstage des ganzen
  // Jahres zählt. In der Woche über den Jahreswechsel reicht es bis an deren Rand.
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return subscribeEntriesInRange(
      user.companyId,
      ladenVon,
      ladenBis,
      (rows) => {
        setEntries(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [user, ladenVon, ladenBis]);

  /*
    DER URLAUBSVERLAUF — eine eigene, schmale Abfrage neben dem Jahr.

    Der Resturlaub hängt seit dem Übertrag nicht mehr nur am angezeigten Jahr:
    was 2026 offen blieb, steht 2027 zur Verfügung. Ohne den Verlauf wäre der
    Übertrag hier immer null — die Mitarbeiteransicht zeigte den richtigen
    Stand und die Lohn-CSV den alten.

    Geholt werden NUR Urlaubstage, serverseitig gefiltert. Den kompletten
    Zeitbestand mehrerer Jahre zu laden wäre um Grössenordnungen mehr, als die
    Frage braucht. Der Zeitraum beginnt am frühesten Startdatum der
    Belegschaft; früher gibt es nichts zu rechnen.
  */
  const [urlaubVerlauf, setUrlaubVerlauf] = useState<WithId<TimeEntry>[]>([]);
  const fruehesterStart = useMemo(
    () => users.map((u) => u.appStartDate).filter((d): d is string => !!d).sort()[0] ?? null,
    [users],
  );

  useEffect(() => {
    if (!user || !fruehesterStart) {
      setUrlaubVerlauf([]);
      return;
    }
    let abgemeldet = false;
    listUrlaubstage(user.companyId, fruehesterStart, `${year}-12-31`)
      .then((rows) => { if (!abgemeldet) setUrlaubVerlauf(rows); })
      // Ein fehlender Verlauf darf die Ansicht nicht kippen: dann rechnet sie
      // ohne Übertrag weiter — zu wenig, aber nicht gar nichts.
      .catch(() => { if (!abgemeldet) setUrlaubVerlauf([]); });
    return () => { abgemeldet = true; };
  }, [user, fruehesterStart, year]);

  /*
    DIE ANPASSUNGEN DES URLAUBSANSPRUCHS (Elternkarenz, unbezahlter Urlaub).
    Ohne sie stünde in Übersicht und Lohn-CSV ein zu hoher Resturlaub —
    deshalb ein sichtbarer Teilfehler, kein stilles Weiterrechnen.
  */
  const [anpassungen, setAnpassungen] = useState<UrlaubsanspruchAnpassung[]>([]);
  useEffect(() => {
    if (!user) return;
    let abgemeldet = false;
    listAnpassungen(user.companyId)
      .then((rows) => { if (!abgemeldet) setAnpassungen(rows); })
      .catch(() => { if (!abgemeldet) setNebenFehler('Die Anpassungen des Urlaubsanspruchs'); });
    return () => { abgemeldet = true; };
  }, [user]);

  const urlaubsRegel = useMemo(() => uebertragsRegel(company), [company]);
  const halbeTage = dezemberHalbtage(company);
  // Nachtzeit und Überstundenmodell des Betriebs (Paket 2c) für die Ausleitung.
  const lohn = { nacht: nachtzeitVon(company), ueberstunden: ueberstundenRegelVon(company) };

  // Deaktivierte Mitarbeiter fallen aus der Auswertung (Legacy:5407).
  const relevant = useMemo(
    () =>
      users
        .filter((u) => fuehrtZeitkonto(u) && u.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  );

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  /*
    DER STAND DER BUCHUNGEN FÜR DIE ARBEITSZEITGRENZEN (Runde 3, G12). Die
    Buchungen hält diese Seite ohnehin live; ändert sich im Monat samt einer
    Woche davor und danach etwas — gebucht, korrigiert, gelöscht, auch von
    einem anderen Gerät —, prüft die Karte neu. Am Inhalt, nicht an der
    Identität des Arrays: jede Meldung der Live-Verbindung ist ein neues.
  */
  const grenzStand = useMemo(() => {
    const ab = new Date(Date.UTC(year, month, 1 - 7)).toISOString().slice(0, 10);
    const bis = new Date(Date.UTC(year, month + 1, 7)).toISOString().slice(0, 10);
    return entries
      .filter((e) => e.date >= ab && e.date <= bis)
      .map((e) => `${e.id}:${e.userId}:${e.date}:${e.status}:${e.startTime ?? ''}-${e.endTime ?? ''}:${e.breakDuration ?? 0}`)
      .sort()
      .join('|');
  }, [entries, year, month]);

  const alleRows = useMemo(
    () =>
      relevant.map((u) => {
        const own = entries.filter((e) => e.userId === u.uid);
        const monthEntries = own.filter((e) => e.date.startsWith(monthPrefix));
        const yearEntries = own.filter((e) => e.date.startsWith(String(year)));
        return {
          user: u,
          monthEntries,
          stats: calcMonthStats(u, monthEntries, yearEntries, year, month, halbeTage, {
            verlauf: urlaubVerlauf
              .filter((e) => e.userId === u.uid)
              .map((e) => ({ von: e.date, tage: tagesAnteil(e.date, halbeTage) })),
            regel: urlaubsRegel,
            anpassungen: anpassungen.filter((a) => a.userId === u.uid),
          }),
          completeness: calcCompleteness(u, monthEntries, year, month),
        };
      }),
    [relevant, entries, monthPrefix, year, month, urlaubVerlauf, urlaubsRegel, halbeTage, anpassungen],
  );

  /**
   * Suche und Filter. Bei zwanzig Monteuren ist die Liste sonst nur noch
   * scrollbar: wer EINEN Mitarbeiter prüfen will, sucht ihn; wer den Monat
   * abschliesst, will die mit Luecken sehen und nicht die anderen achtzehn.
   */
  const luecken = useMemo(
    () => alleRows.filter((r) => r.completeness.missingCount > 0).length,
    [alleRows],
  );
  const offeneTage = useMemo(() => alleRows.reduce((s, r) => s + r.completeness.missingCount, 0), [alleRows]);
  /*
    „GEBUCHT BISHER“ ÜBER ALLE: die Summe derselben Zahlen, die in den Zeilen
    stehen (`stats.istMin`, `stats.sollMin`) — nichts neu gerechnet.
  */
  const summe = useMemo(
    () => alleRows.reduce((s, r) => ({ ist: s.ist + r.stats.istMin, soll: s.soll + r.stats.sollMin }), { ist: 0, soll: 0 }),
    [alleRows],
  );

  /*
    DIE ARBEITSZEITGRENZEN — EINMAL geprüft für die ganze Seite: die Karte,
    der Streifen (`.st-grenze`) und das Seitenfenster lesen
    dieselben Fälle. Im Supportzugang gar nicht (Zeitbuchungen verschlossen).
  */
  const grenzDaten = useArbeitszeitGrenzen({
    companyId: user?.companyId ?? '',
    personen: relevant,
    jahr: year,
    monat: month,
    aktualisiert: loading ? undefined : grenzStand,
    aus: imSupport || !user || !belegschaftDa,
    durchrechnungWochen: company?.durchrechnungWochen,
  });
  const grenzenJePerson = useMemo(() => {
    const m = new Map<string, Grenzfall[]>();
    for (const { person: p, fall } of grenzDaten.stand?.faelle ?? []) m.set(p.uid, [...(m.get(p.uid) ?? []), fall]);
    return m;
  }, [grenzDaten.stand]);

  /** Die eigenen Buchungen je Person — einmal geordnet, nicht je Zeile über alle gefiltert. */
  const eigene = useMemo(() => {
    const m = new Map<string, WithId<TimeEntry>[]>();
    for (const e of entries) {
      const l = m.get(e.userId);
      if (l) l.push(e);
      else m.set(e.userId, [e]);
    }
    return m;
  }, [entries]);

  /** Die Tage des Monats je Person — für den Streifen und das Seitenfenster. */
  const monatsTage = useMemo(() => tageDesMonats(year, month), [year, month]);
  const monatsWerte = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tagesauswertung>>();
    for (const r of alleRows) {
      m.set(
        r.user.uid,
        tagesauswertung({
          user: r.user,
          eintraege: r.monthEntries,
          tage: monatsTage,
          fehlend: r.completeness.missingDates,
          halbeTage,
          heute,
          grenzen: grenzenJePerson.get(r.user.uid),
        }),
      );
    }
    return m;
  }, [alleRows, monatsTage, halbeTage, heute, grenzenJePerson]);

  /*
    DIE WOCHE: dieselbe Tagesauswertung über sieben Tage. Die fehlenden Tage
    kommen aus `offeneWerktage` — derselben Funktion, aus der die
    Vollständigkeit des Monats ihre Tage hat, nur über die Woche.
  */
  const wochenWerte = useMemo(() => {
    const m = new Map<string, ReturnType<typeof tagesauswertung>>();
    if (ansicht !== 'woche') return m;
    const von = new Date(`${wochenTage[0]}T00:00:00`);
    const bis = new Date(`${wochenTage[6]}T00:00:00`);
    for (const u of relevant) {
      const own = (eigene.get(u.uid) ?? []).filter((e) => e.date >= wochenTage[0] && e.date <= wochenTage[6]);
      m.set(
        u.uid,
        tagesauswertung({
          user: u,
          eintraege: own,
          tage: wochenTage,
          fehlend: offeneWerktage(u, own, von, bis),
          halbeTage,
          heute,
          grenzen: grenzenJePerson.get(u.uid),
        }),
      );
    }
    return m;
  }, [ansicht, relevant, eigene, wochenTage, halbeTage, heute, grenzenJePerson]);

  /**
   * Suche und Filter. Bei zwanzig Monteuren ist die Liste sonst nur noch
   * scrollbar: wer EINEN Mitarbeiter prüfen will, sucht ihn; wer den Monat
   * abschliesst, will die mit Luecken sehen und nicht die anderen achtzehn.
   * Die Suche wirkt über alle Personen, beide Gruppen.
   */
  const rows = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return alleRows.filter(
      (r) =>
        (!q || r.user.name.toLowerCase().includes(q)) &&
        (!nurLuecken || r.completeness.missingCount > 0),
    );
  }, [alleRows, suche, nurLuecken]);

  const zeilen = useMemo((): UebersichtZeile[] => {
    const saldoText = (min: number) => `${min > 0 ? '+' : ''}${fmtMin(min)}`;
    return rows.map(({ user: u, stats, completeness }) => {
      const rolle = einstufungText(u, heute) || u.role;
      if (imSupport) {
        return { user: u, status: 'nicht einsehbar', achtung: false, werte: [], offen: 0, gebucht: '', soll: '', saldo: '' };
      }
      if (ansicht === 'woche') {
        const werte = wochenWerte.get(u.uid) ?? [];
        const offen = werte.filter((t) => t.zustand === 'fehlt').length;
        const s = summeDerTage(werte);
        return {
          user: u,
          status: offen > 0 ? `${tageWort(offen)} ${offen === 1 ? 'fehlt' : 'fehlen'}` : rolle,
          achtung: offen > 0,
          werte,
          offen,
          gebucht: fmtMin(s.istMin),
          soll: stats.hasConfig ? fmtMin(s.sollMin) : '—',
          saldo: stats.hasConfig ? saldoText(s.saldoMin) : '—',
        };
      }
      const offen = completeness.missingCount;
      return {
        user: u,
        status:
          offen > 0
            ? `${tageWort(offen)} ohne Buchung`
            : !stats.hasConfig
              ? `${rolle} · kein Eintritt hinterlegt`
              : completeness.status === 'today_only'
                /* „heute offen“ ist keine Lücke, sondern der laufende Tag. */
                ? `${rolle} · heute offen`
                : `${rolle} · vollständig`,
        achtung: offen > 0,
        werte: monatsWerte.get(u.uid) ?? [],
        offen,
        gebucht: fmtMin(stats.istMin),
        soll: fmtMin(stats.sollMin),
        /* Ohne Eintrittsdatum ist der Saldo keine Null, sondern gar keine Aussage. */
        saldo: stats.hasConfig ? saldoText(stats.saldoMin) : '—',
      };
    });
  }, [rows, imSupport, ansicht, wochenWerte, monatsWerte, heute]);

  /* DIE AUSWAHL VON MONAT UND JAHR wie bisher: Jänner bis Dezember, das laufende Jahr und vier davor. */
  const yearOptions = Array.from({ length: JAHRE_ZURUECK + 1 }, (_, i) => now.getFullYear() - i);
  const erstesJahr = now.getFullYear() - JAHRE_ZURUECK;

  function waehleMonat(j: number, m: number) {
    const d = new Date(j, m, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setWocheAb(null);
  }

  /*
    ‹ › BLÄTTERN: im Monat monatsweise, in der Woche wochenweise — über
    Jahresgrenzen, aber nicht aus der Auswahl hinaus (die Jahre der Auswahl
    sind die, die es gibt). In der Woche folgt der Monat dem Donnerstag der
    Woche, wie die Kalenderwoche: die Kennzahlen gehören dann zu ihr.
  */
  const zurueckMoeglich =
    ansicht === 'woche' ? Number(plusTage(montag, -4).slice(0, 4)) >= erstesJahr : year > erstesJahr || month > 0;
  const vorMoeglich =
    ansicht === 'woche' ? Number(plusTage(montag, 10).slice(0, 4)) <= now.getFullYear() : year < now.getFullYear() || month < 11;
  function blaettern(richtung: -1 | 1) {
    if (ansicht === 'woche') {
      const neu = plusTage(montag, 7 * richtung);
      const donnerstag = new Date(`${plusTage(neu, 3)}T00:00:00`);
      setWocheAb(neu);
      setYear(donnerstag.getFullYear());
      setMonth(donnerstag.getMonth());
      return;
    }
    waehleMonat(year, month + richtung);
  }

  /** Die Kennzahl „Tage ohne Buchung“: ein Klick filtert, ein zweiter hebt den Filter auf. */
  function filterUmschalten() {
    const an = !nurLuecken;
    setNurLuecken(an);
    const neu = new URLSearchParams(adresse);
    neu.delete('filter');
    if (an) neu.set('nur', 'offen');
    else neu.delete('nur');
    setAdresse(neu, { replace: true });
  }

  function ansichtWaehlen(a: 'monat' | 'woche') {
    const neu = new URLSearchParams(adresse);
    if (a === 'woche') neu.set('ansicht', 'woche');
    else neu.delete('ansicht');
    setAdresse(neu);
  }

  /*
    ZURÜCK ZUR PERSON. Nach dem Speichern oder Abbrechen einer Aufgabe steht
    wieder die Person im Fenster (sofern es von ihr aus geöffnet wurde) — mit
    den frischen Zahlen, denn die Buchungen kommen live.
  */
  const fensterInhalt = useRef<HTMLDivElement>(null);
  function aufgabeFertig() {
    setAufgabe(null);
  }
  function fensterZu() {
    setAufgabe(null);
    setPerson(null);
  }
  // Wechselt der Inhalt im offenen Fenster, geht der Fokus auf das Fenster selbst — der Knopf, der ihn hatte, ist weg.
  const fensterSchluessel = aufgabe ? `${aufgabe.art}` : person ? `person-${person.uid}` : '';
  useEffect(() => {
    if (!fensterSchluessel) return;
    const dialog = fensterInhalt.current?.closest<HTMLElement>('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }, [fensterSchluessel]);

  function exportMonthCsv() {
    // Bewusst alleRows: der Monatsexport ist ein Abschluss und darf nicht
    // davon abhaengen, was gerade im Suchfeld steht.
    downloadCsv(buildMonthCsv(alleRows, year, month, halbeTage, lohn, entries.filter((e) => e.date.startsWith(monthPrefix))), monthCsvFilename(year, month));
    toast.success('Monats-CSV heruntergeladen');
  }

  function exportUserCsv(u: AppUser) {
    const r = alleRows.find((x) => x.user.uid === u.uid);
    if (!r || r.monthEntries.length === 0) {
      toast.error('Keine Einträge für diesen Monat.');
      return;
    }
    downloadCsv(
      buildUserCsv(u, r.monthEntries, r.stats, year, month, halbeTage, lohn),
      userCsvFilename(u, year, month),
    );
    toast.success(`CSV für ${u.name} heruntergeladen`);
  }

  async function exportPdf(u: AppUser, from: string, to: string) {
    // Frisch aus der Datenbank statt aus der Ansicht: der gewählte Zeitraum
    // kann über das geladene Jahr hinausreichen.
    const range = entriesInRange(
      await listEntriesInRange(user!.companyId, from, to),
      u.uid,
      from,
      to,
    );
    if (range.length === 0) throw new Error('Keine Einträge im gewählten Zeitraum.');
    // Erst hier nachladen: jsPDF wiegt mehrere hundert Kilobyte und wird nur
    // gebraucht, wenn wirklich jemand einen Nachweis erzeugt.
    const { generateHoursPdf } = await import('./hoursPdf');
    const doc = generateHoursPdf({
      company: company ?? ({ id: '', name: 'Firma' } as NonNullable<typeof company>),
      user: u,
      entries: range,
      from,
      to,
    });
    doc.save(hoursPdfFilename(u, from, to));
    toast.success('Stundennachweis erstellt');
  }

  async function exportProjectCsv(u: AppUser, from: string, to: string) {
    const range = entriesInRange(
      await listEntriesInRange(user!.companyId, from, to),
      u.uid,
      from,
      to,
    );
    const withProject = range.filter((e) => e.status === 'Anwesend' && e.projectNumber);
    if (withProject.length === 0) throw new Error('Keine Projekteinträge im gewählten Zeitraum.');
    downloadCsv(buildUserProjectCsv(u, range, from, to), userProjectCsvFilename(u, from, to));
    toast.success('Projektauswertung heruntergeladen');
  }


  if (!user) return null;

  const personZeile = person ? alleRows.find((r) => r.user.uid === person.uid) ?? null : null;
  const monatsName = `${MONTHS[month]} ${year}`;
  const wt = ansicht === 'woche' ? wochenTitel(montag, heute) : null;
  const monatAbstand = (year - now.getFullYear()) * 12 + month - now.getMonth();
  const titel = wt ? wt.titel : monatsName;
  const unterzeile = wt
    ? wt.klein
    : monatAbstand === 0
      ? `Dieser Monat · Stand ${tagKurz(heute)}`
      : monatAbstand === -1
        ? 'Letzter Monat'
        : monatAbstand === 1
          ? 'Nächster Monat'
          : '';

  /* Was das Seitenfenster gerade zeigt — Titel und Name für die Vorlesehilfe. */
  const fensterOffen = !!aufgabe || !!personZeile;
  const fensterLabel =
    aufgabe?.art === 'bearbeiten'
      ? 'Eintrag korrigieren'
      : aufgabe?.art === 'erfassen'
        ? 'Zeit erfassen'
        : aufgabe?.art === 'meldung'
          ? 'Krankmeldung'
          : personZeile
            ? `${personZeile.user.name}, ${monatsName}`
            : '';
  const erfassenFuer = aufgabe?.art === 'erfassen' && aufgabe.uid ? relevant.find((u) => u.uid === aufgabe.uid) ?? null : null;
  const fensterTitel =
    aufgabe?.art === 'bearbeiten'
      ? `Eintrag von ${aufgabe.eintrag.userName ?? 'Mitarbeiter'} korrigieren`
      : aufgabe?.art === 'erfassen'
        ? erfassenFuer
          ? `Zeit für ${erfassenFuer.name} erfassen`
          : 'Zeit für einen Mitarbeiter erfassen'
        : aufgabe?.art === 'meldung'
          ? undefined
          : personZeile?.user.name;

  return (
    // Abstände der Designlinie „Fassung 3": 12 px am Telefon, 20 px am Schreibtisch.
    <TippBereich>
    <div className="space-y-3 lg:space-y-5">
      {/*
        DER SEITENKOPF DER LINIE „LOT“ (Regel 2): „Zeit erfassen“ ist die
        Hauptaktion — am Telefon im Daumenbereich. Die Monats-CSV wird einmal
        im Monat gezogen und steht deshalb im ⋯ der Seite, nicht als zweiter
        Knopf daneben. Im Supportzugang gibt es sie nicht (Zeitbuchungen sind
        dort verschlossen), ebenso wenig ohne eine Zeile.
      */}
      <PageHeader
        ort="Team"
        title="Mitarbeiterübersicht"
        subtitle="Monatsauswertung, Vollständigkeit und Salden"
        hilfe={
          <>
            Eine Zeile je Person: der Monat als Streifen, ein Feld je Tag, daneben gebucht, Soll bisher und
            Saldo. Oben stehen, wer Tage ohne Buchung hat. Ein Klick auf die Zeile oder ein Feld öffnet die
            Person im Seitenfenster mit allen Zahlen, dem Tagesnachweis und „Zeit erfassen“. Die Stunden je
            Tag stehen in der Ansicht „Woche“. Ein Klick auf den Monat oben wählt Monat und Jahr.
            <br />
            <br />
            Die Felder des Streifens: „abwesend“ heißt Urlaub, Krankenstand, Berufsschule, Zeitausgleich
            oder Sonderurlaub; „frei“ Wochenende und Feiertag; umrandete Felder liegen noch vor heute. Ein
            roter Strich unten heißt: an diesem Tag ist eine Arbeitszeitgrenze überschritten — die Fälle
            stehen mit Begründung in der Karte „Arbeitszeitgrenzen“ unter der Liste. Darüberfahren zeigt
            Stunden und Soll des Tages, ein Tipp öffnet ihn. In der Ansicht „Woche“ stehen die Stunden je
            Tag mit Von–Bis, Abwesenheiten als Wort; eine Zelle öffnet den Tag.
          </>
        }
        action={
          <Button variant="primary" onClick={() => setAufgabe({ art: 'erfassen', uid: null, tag: null })}>
            Zeit erfassen
          </Button>
        }
        mehr={
          rows.length > 0 && !imSupport ? (
            <RowMenu about="Mitarbeiterübersicht" items={[{ label: 'Monats-CSV', onSelect: exportMonthCsv }]} />
          ) : undefined
        }
      />

      {nebenFehler && <TeilFehler was={nebenFehler} />}

      {/*
        ZWEI KENNZAHLEN aus vorhandenen Werten (Auftrag 3.2): wer Tage ohne
        Buchung hat (antippen filtert — das war das Kästchen „Nur mit
        fehlenden Tagen“) und die Summe von Ist und Soll aller Personen. Im
        Supportzugang nicht: beide kämen aus verschlossenen Buchungen.

        DIE KENNZAHL „ARBEITSZEITGRENZEN“ IST WEG (Wunsch des Betriebs,
        09.10.2026): sie sprang nur zur Karte weiter unten, die die Fälle mit
        Begründung führt; der Tag steht im Streifen mit rotem Strich.
      */}
      {!imSupport && !loading && !error && alleRows.length > 0 && (
        <div className="ue-kennzahlen">
          <button
            type="button"
            className={nurLuecken ? 'ue-kennzahl-an' : 'ue-kennzahl'}
            aria-pressed={nurLuecken}
            onClick={filterUmschalten}
          >
            <span className="ue-kennzahl-name">Tage ohne Buchung</span>
            <span className="ue-kennzahl-wert">{offeneTage}</span>
            <span className="ue-kennzahl-zusatz">
              {luecken === 0
                ? 'alle vollständig'
                : `bei ${luecken} von ${alleRows.length} ${alleRows.length === 1 ? 'Person' : 'Personen'}`}
              {nurLuecken ? ' · nur diese gezeigt' : ''}
            </span>
          </button>
          <div className="ue-kennzahl-fest">
            <span className="ue-kennzahl-name">Gebucht bisher</span>
            <span className="ue-kennzahl-wert">{fmtMin(summe.ist)}</span>
            <span className="ue-kennzahl-zusatz">von {fmtMin(summe.soll)} Soll · alle Personen</span>
          </div>
        </div>
      )}

      {/* DIE STEUERUNG: links der Zeitraum (Klick auf den Titel wählt Monat und Jahr), rechts Suche und Ansicht. */}
      <div className="ue-steuerung">
        <div className="ue-steuerung-links">
          <button
            type="button"
            className="ue-pfeil"
            onClick={() => blaettern(-1)}
            disabled={!zurueckMoeglich}
            aria-label={ansicht === 'woche' ? 'Vorige Woche' : 'Voriger Monat'}
          >
            ‹
          </button>
          <button
            type="button"
            className="ue-titel"
            aria-expanded={wahlOffen}
            aria-controls="ue-zeitwahl"
            onClick={() => setWahlOffen((o) => !o)}
          >
            <span className="ue-titel-gross">{titel}</span>
            <span className="ue-titel-klein">{unterzeile || 'Monat und Jahr wählen'}</span>
          </button>
          <button
            type="button"
            className="ue-pfeil"
            onClick={() => blaettern(1)}
            disabled={!vorMoeglich}
            aria-label={ansicht === 'woche' ? 'Nächste Woche' : 'Nächster Monat'}
          >
            ›
          </button>
        </div>
        <div className="ue-steuerung-rechts">
          {!imSupport && (
            <input
              id="accsuche"
              className="ue-suche"
              type="search"
              placeholder="Person suchen"
              aria-label="Person suchen"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          )}
          {!imSupport && (
            <Segmente
              name="Ansicht"
              werte={[
                { wert: 'monat', text: 'Monat' },
                { wert: 'woche', text: 'Woche' },
              ]}
              wert={ansicht}
              onChange={ansichtWaehlen}
            />
          )}
        </div>
      </div>
      {wahlOffen && (
        /* Die bisherige Auswahl — unverändert, nur einen Klick weiter (Auftrag 3.2, Zuordnung). */
        <div id="ue-zeitwahl" className="ue-zeitwahl">
          <SelectField id="acc-month" label="Monat" value={String(month)}
            onChange={(e) => waehleMonat(year, Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </SelectField>
          <SelectField id="acc-year" label="Jahr" value={String(year)}
            onChange={(e) => waehleMonat(Number(e.target.value), month)}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </SelectField>
        </div>
      )}

      {imSupport && (
        <Hinweiszeile>
          <p>
            Im Supportzugang sind Zeitbuchungen, Urlaube und Krankenstände nicht einsehbar.
            Soll, Ist, Salden und fehlende Tage stehen deshalb nicht da.
          </p>
        </Hinweiszeile>
      )}

      {loading ? (
        <div className="ue-liste">
          <div className="p-4">
            <SkeletonList rows={4} />
          </div>
        </div>
      ) : error ? (
        <div className="ue-liste">
          <div className="p-4">
            <ErrorState message={error} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="ue-liste">
          <EmptyState>
            {/*
              WARUM DIESE UNTERSCHEIDUNG. „Keine aktiven Mitarbeiter mit
              Zeitkonto" stand hier auch dann, wenn der Betrieb sehr wohl
              Benutzer hat — nur eben keinen, der ein Zeitkonto FÜHRT.
              Die Administration tut das nie, die Geschäftsführung nur, wenn
              es in ihrer Benutzerakte eingeschaltet ist (siehe
              `fuehrtZeitkonto`); ohne das erscheinen sie hier nicht, auch
              nicht mit eigenen Buchungen.

              Aus dem Betrieb gemeldet: die Geschäftsführung bucht eine Zeit
              und liest danach, es gebe keine Mitarbeiter. Die Aussage war
              richtig und trotzdem irreführend — sie klang nach einem Fehler,
              wo eine Erklärung hingehört.
            */}
            {alleRows.length === 0
              ? users.length === 0
                ? 'Noch keine Benutzer angelegt.'
                : 'Kein Konto erscheint in dieser Auswertung. Hier steht, wer ein Zeitkonto führt: Monteure, Verwaltung, Buchhaltung und Projektleiter, die Geschäftsführung nur, wenn es in ihrer Benutzerakte eingeschaltet ist. Der Administrator steht hier nie.'
              : suche
                ? `Kein Mitarbeiter passt zu „${suche}“.`
                : 'Alle Zeitkonten sind vollständig.'}
          </EmptyState>
        </div>
      ) : (
        <UebersichtListe
          ansicht={ansicht}
          tage={ansicht === 'woche' ? wochenTage : monatsTage}
          heute={heute}
          zeilen={zeilen}
          imSupport={imSupport}
          onOeffnen={(uid, tag) => {
            setAufgabe(null);
            setPerson({ uid, tag });
          }}
        />
      )}

      {/*
        DAS SEITENFENSTER: die Person im Monat (Auftrag 3.5) — oder, im selben
        Fenster, Zeit erfassen, einen Eintrag korrigieren, eine Krankmeldung.
        ZEITEN FÜR ANDERE ERFASSEN UND KORRIGIEREN — z. B. wenn ein Monteur
        krank ist oder sich vertippt hat. Die Rules erlauben das für
        Buchhaltung/GF/Administrator.
      */}
      <BottomSheet open={fensterOffen} onClose={fensterZu} label={fensterLabel} auchBreit breit titel={fensterTitel}>
        <div ref={fensterInhalt}>
          {aufgabe?.art === 'erfassen' || aufgabe?.art === 'bearbeiten' ? (
            /* Beim Erfassen ohne existingDates: der Zielmitarbeiter steht erst nach der
               Auswahl fest — die Doppelbuchung fängt createTimeEntry ab. */
            <TimeForm
              key={aufgabe.art === 'bearbeiten' ? aufgabe.eintrag.id : `neu-${aufgabe.uid ?? ''}-${aufgabe.tag ?? ''}`}
              entry={aufgabe.art === 'bearbeiten' ? aufgabe.eintrag : undefined}
              staff={aufgabe.art === 'bearbeiten' ? undefined : relevant}
              /* „Zeit erfassen“ an einem Tag der Person: Person und Tag vorbelegt (R4-0, Frage 3). */
              vorbelegung={
                aufgabe.art === 'erfassen' && aufgabe.uid
                  ? { userId: aufgabe.uid, ...(aufgabe.tag ? { date: aufgabe.tag } : {}) }
                  : undefined
              }
              ownerRole={
                aufgabe.art === 'bearbeiten' ? users.find((u) => u.uid === aufgabe.eintrag.userId)?.role : undefined
              }
              // Für die Rückfrage zum Jugendschutz (Runde 3, M2); beim Erfassen kommt die Person aus `staff`.
              besitzerProfil={
                aufgabe.art === 'bearbeiten' ? users.find((u) => u.uid === aufgabe.eintrag.userId) ?? null : null
              }
              onSaved={aufgabeFertig}
              onCancel={aufgabeFertig}
            />
          ) : aufgabe?.art === 'meldung' ? (
            /* Die Krankmeldung eines Tages; ihre Karte bringt Titel und „Schließen“ selbst mit. */
            <KrankmeldungKarte
              key={aufgabe.id}
              companyId={user.companyId}
              id={aufgabe.id}
              meinName={user.name}
              mitNamen
              buero
              onGeaendert={aufgabeFertig}
              onSchliessen={aufgabeFertig}
            />
          ) : personZeile && imSupport ? (
            <p className="text-sm text-ink-muted">
              Zeitbuchungen, Urlaube und Krankenstände sind im Supportzugang nicht einsehbar.
            </p>
          ) : personZeile ? (
            <PersonFenster
              user={personZeile.user}
              stats={personZeile.stats}
              completeness={personZeile.completeness}
              monthEntries={personZeile.monthEntries}
              monatsWerte={monatsWerte.get(personZeile.user.uid) ?? []}
              jahr={year}
              monat={month}
              monatsName={monatsName}
              halbeTage={halbeTage}
              nacht={nachtzeitVon(company)}
              markiert={person?.tag && person.tag.startsWith(monthPrefix) ? person.tag : null}
              grenzDaten={grenzDaten}
              companyId={user.companyId}
              onErfassen={(tag) => setAufgabe({ art: 'erfassen', uid: personZeile.user.uid, tag })}
              onBearbeiten={(e) => setAufgabe({ art: 'bearbeiten', eintrag: e })}
              onLoeschen={(e) => setToDelete(e)}
              onMeldung={(id) => setAufgabe({ art: 'meldung', id })}
              onKorrigieren={(e) => setAufgabe({ art: 'bearbeiten', eintrag: e })}
              onCsv={() => exportUserCsv(personZeile.user)}
              onBericht={() => setExportFor(personZeile.user)}
            />
          ) : null}
        </div>
      </BottomSheet>

      {/*
        DIE GESETZLICHEN GRENZEN DES MONATS (05.10.2026). Im Supportzugang
        nicht: Zeitbuchungen sind dort verschlossen, und eine Prüfung ohne
        Daten meldete „keine Grenze überschritten“ — eine falsche Entwarnung.
      */}
      {!imSupport && (
        <ArbeitszeitGrenzenKarte
          id="arbeitszeitgrenzen"
          companyId={user.companyId}
          personen={relevant}
          jahr={year}
          monat={month}
          daten={grenzDaten}
          durchrechnungWochen={company?.durchrechnungWochen}
          // Verstoß gegen das KJBG: die Buchung gleich im Seitenfenster öffnen (Runde 3, M3).
          onKorrigieren={(e) => setAufgabe({ art: 'bearbeiten', eintrag: e })}
        />
      )}

      {/* Deckungsbeitrags-Sicht: Ist gegen kalkuliertes Budget je Baustelle. */}
      <ProjectSummary
        entries={entries.filter((e) => e.date.startsWith(monthPrefix))}
        gesamtFach={gesamtFach}
        projects={projects}
        label={monatsName}
        nacht={nachtzeitVon(company)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={
          toDelete
            ? `Der Eintrag von ${toDelete.userName ?? 'Mitarbeiter'} vom ${datumAT(toDelete.date)} wird endgültig entfernt.`
            : ''
        }
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            if (aufgabe?.art === 'bearbeiten' && aufgabe.eintrag.id === toDelete.id) setAufgabe(null);
            await deleteTimeEntry(toDelete.id);
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />

      {exportFor && (
        <ExportDialog
          user={exportFor}
          year={year}
          month={month}
          onClose={() => setExportFor(null)}
          onExportPdf={(from, to) => exportPdf(exportFor, from, to)}
          onExportProjectCsv={(from, to) => exportProjectCsv(exportFor, from, to)}
        />
      )}
    </div>
    </TippBereich>
  );
}
