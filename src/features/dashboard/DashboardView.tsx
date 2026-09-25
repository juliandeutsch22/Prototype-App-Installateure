import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { getUserByUid, listUsers } from '@/lib/db/users';
import { listOwnEntriesSince, listEntriesInRange, listEntriesForProjects } from '@/lib/db/timeEntries';
import { listUpcomingAssignments, listAssignmentsForDate } from '@/lib/db/assignments';
import { listEinsatzMaterialForDate } from '@/lib/db/einsatzMaterial';
import { listOpenOrders, listOwnOpenOrders } from '@/lib/db/materialOrders';
import { listActiveProjects, listProjectsByNumbers } from '@/lib/db/projects';
import { useModul } from '@/lib/useModule';
import { listUnpaidInvoices } from '@/lib/db/invoices';
import {
  localDateStr,
  todayStr,
  offeneWerktage,
  groupProjectHours,
  normProjectNumber,
  calcBudgetState,
  calcMonthStats,
  calcWorkMin,
  fmtStd,
  tageWort,
  getISOWeek,
  fmtStunden,
} from '@/lib/time';
import { getAustrianHolidayName } from '@shared/feiertage';
import { datumAT } from '@/lib/datum';
import {
  fuehrtZeitkonto,
  canProcessOrders,
  isGF,
  canInvoice,
  canEditTime,
  isMitarbeiter,
} from '@/lib/permissions';
import type { Assignment, EinsatzMaterial, MaterialOrder, Project, RuestPosition } from '@/types';
import Card from '@/components/Card';
import Metric, { MetricRow } from '@/components/Metric';
import { Marke, Warnung, Zustand } from '@/components/Badge';
import LaufWarnung from './LaufWarnung';
import MonteurStart, {
  HeuteKarte,
  type LetzteBuchung,
  type NaechsterEinsatz,
  type WochenTag,
} from './MonteurStart';
import StartKopf from './StartKopf';
import { grussZeile } from './gruss';
import WartungHinweis from './WartungHinweis';
import StatusBadge from '@/components/StatusBadge';
import { KontaktZeile } from '@/components/Kontakt';
import { LoadingState, EmptyState } from '@/components/States';
import Meldung from '@/components/Meldung';
import Grenzliste from '@/components/Grenzliste';
import { List, ListRow } from '@/components/ListRow';
import { byNewest } from '@/lib/timestamps';
import { istUeberfaellig, offenerRest } from '@/features/invoices/zahlstand';

/**
 * 'YYYY-MM-DD' -> 'Mo., 01.09.'
 *
 * Ohne Wochentag muesste man nachrechnen, welcher Tag da fehlt. Das Jahr
 * bleibt weg: die Luecken liegen im Fenster der letzten Wochen.
 */
function fmtTag(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

const fmtEUR = (n: number) =>
  `\u20ac ${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(n)}`;

/** Eine Baustelle, deren Stundenbudget knapp wird oder überschritten ist. */
interface ProjectAlert {
  /** Kennung der Baustelle — Ziel der Zeile (Baustellenakte). */
  id: string;
  projectNumber: string;
  customerName: string;
  pct: number | null;
  over: boolean;
  /**
   * Verbrauchte Fachzeit in MINUTEN.
   *
   * Vorher standen hier fertig gerundete Stunden, die roh ausgegeben wurden —
   * JavaScript schreibt sie mit PUNKT. Auf der Startseite stand „39.5 von
   * 40 h", in der Projektauswertung „39,5 h". Formatiert wird jetzt erst beim
   * Anzeigen, mit derselben Funktion wie dort.
   */
  usedMin: number;
  estimatedHours: number;
}

/** Ein Einsatz mit den Stammdaten der Baustelle — Adresse und Nummer zählen im Auto. */
interface EinsatzZeile {
  id: string;
  /**
   * Der Tag des Einsatzes — mitgefuehrt, nicht aus `todayStr()` geholt.
   *
   * Bleibt die App ueber Mitternacht offen, waere „heute" ein anderer Tag
   * als der, zu dem diese Zeile gehoert: der Haken auf der Ruestliste ginge
   * dann an ein Dokument, das es nicht gibt.
   */
  date: string;
  projectNumber: string;
  customerName: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  asHelper: boolean;
  comment?: string;
  billingMode?: Project['billingMode'];
  /**
   * Die Ruestliste dieses Einsatzes — was mitzunehmen ist.
   *
   * Sie haengt am Paar aus Tag und Baustelle, nicht am einzelnen Einsatz:
   * die Kiste steht einmal im Bus, auch wenn drei Leute hinfahren.
   */
  material?: RuestPosition[];
  geladen?: NonNullable<EinsatzMaterial['geladen']>;
}

/** Alle Einsätze eines Tages, nach Baustelle gebündelt — die Sicht der Leitung. */
interface TagesBaustelle {
  /**
   * Kennung der Baustelle, wenn sie unter den laufenden gefunden wurde — das
   * Ziel der Zeile (Baustellenakte). Fehlt sie, bleibt die Zeile ohne Pfeil.
   */
  id?: string;
  projectNumber: string;
  customerName: string;
  address?: string;
  contactPhone?: string;
  contactName?: string;
  namen: string[];
  helfer: number;
}

interface DashData {
  /**
   * Werktage ohne Buchung — statt des Saldos.
   *
   * Der Saldo seit Eintritt braucht als einzige Zahl wirklich alle Buchungen
   * und gehoert deshalb dorthin, wo man ohnehin auf sein Zeitkonto schaut.
   * Auf der Startseite steht die Frage, die man handeln kann: was fehlt noch?
   */
  fehlendeTage?: string[];
  /**
   * Ist ueberhaupt ein Eintritt hinterlegt?
   *
   * Ohne ihn laesst sich nicht sagen, welche Tage fehlen — die Startseite
   * schweigt dann. Fuer eine Rolle ohne Zeitkonto ist das richtig; fuer
   * einen Monteur waere es eine verschluckte Datenluecke, und niemand
   * erfuehre, warum die Warnung ausbleibt.
   */
  hatEintritt?: boolean;
  /** Die heutigen Einsätze — MEHRZAHL, ein Monteur kann an einem Tag auf zwei Baustellen sein. */
  heuteEigene?: EinsatzZeile[];
  ownOpenOrders?: number;
  /**
   * Für den Monteur-Start: die Vorlage für „Wie zuletzt“, die Woche und der
   * Saldo des Monats — alles aus den Buchungen, die hier ohnehin geladen
   * werden, mit denselben Regeln wie in der Zeiterfassung.
   */
  letzte?: LetzteBuchung;
  woche?: { istMin: number; sollMin: number; tage: WochenTag[] };
  monat?: { name: string; saldoMin: number | null };
  /** Die kommenden eigenen Einsätze ab morgen (Monteur-Start). */
  naechste?: NaechsterEinsatz[];
  /** Alle laufenden Baustellen (Leitung). */
  aktiveBaustellen?: Project[];
  /** Die heutige Einteilung des ganzen Betriebs (Leitung). */
  heuteBetrieb?: TagesBaustelle[];
  openOrders?: MaterialOrder[];
  projectAlerts?: ProjectAlert[];
  invoiceSums?: { open: number; overdue: number };
  /** Wer hat noch nicht gebucht — statt Salden. */
  team?: { uid: string; name: string; fehlendeTage: number; hatKonfig: boolean }[];
}

/**
 * Wie weit die Luecken-Pruefung zurueckreicht.
 *
 * Ein Monat plus ein paar Tage: am Monatsersten waere ein reiner
 * Kalendermonat leer und die Luecken des Vormonats verschwaenden genau dann,
 * wenn sie nachgetragen gehoeren. Der Zeitraum ist fest — er waechst nicht
 * mit den Dienstjahren.
 */
const LUECKEN_TAGE = 35;

/**
 * Wie viele Zeilen die Startseite je Karte zeigt.
 *
 * Die Startseite ist eine Rangfolge, keine Übersicht: oben steht, was heute
 * jemanden angeht. Eine Karte, die mit dem Betrieb wächst, verschiebt alles
 * unter ihr aus dem Blick — und zwar genau die kurzen, wichtigen Karten.
 *
 * ZWEI VERSCHIEDENE ZAHLEN, weil die Karten verschiedene Fragen beantworten:
 * die Baustellenliste ist eine Übersicht („was haben wir gerade?") und
 * braucht Substanz; die Budgetwarnungen sind eine Arbeitsliste und sind nach
 * Auslastung sortiert — die schlimmsten stehen oben, der Rest ist Nachlauf.
 */
const BAUSTELLEN_AUF_STARTSEITE = 12;
const WARNUNGEN_AUF_STARTSEITE = 8;

/** Rollen-spezifisches Zuhause mit echten Kennzahlen. */
export default function DashboardView() {
  const { user } = useAuth();
  /**
   * Karten und Verweise nur zeigen, wenn ihr Bereich eingeschaltet ist.
   *
   * Die Startseite ist die Stelle, an der ein abgeschaltetes Modul am
   * ehesten durchschlaegt: sie zieht aus allen Bereichen zusammen. Bliebe die
   * Karte „Material angefordert" stehen, waehrend der Bereich aus ist, fuehrte
   * jeder Verweis darin in eine Sackgasse.
   */
  const scheineAn = useModul('scheine');
  const materialAn = useModul('material');
  const rechnungenAn = useModul('rechnungen');
  const [data, setData] = useState<DashData>({});
  const [laden, setLaden] = useState({ persoenlich: true, betrieblich: true, team: true });
  /*
    WELCHER TEIL NICHT KAM — und dass es überhaupt jemand erfährt.

    Die drei Blöcke liefen über `Promise.allSettled`, dessen Ergebnis
    verworfen wurde. Warf einer, wurde sein `setLaden(false)` nie erreicht:
    der Kreisel blieb für immer stehen, und die Warnungen dieses Blocks —
    fehlende Tage, offene Anforderungen, überfällige Rechnungen — erschienen
    einfach nie. Die Startseite war damit die einzige Ansicht der App ganz
    ohne Fehlerzustand, und ausgerechnet sie sagt, was ansteht.

    Ein ewiger Kreisel behauptet zwar nichts Falsches — `nothingToShow`
    verlangt, dass nichts mehr lädt —, aber er erklärt auch nichts. Und wer
    sich an eine Startseite gewöhnt, die dauernd lädt, sieht auch dann nicht
    hin, wenn sie etwas zu sagen hat.
  */
  const [nichtGeladen, setNichtGeladen] = useState<string[]>([]);
  const mitZeitkonto = user ? fuehrtZeitkonto(user) : false;
  const mgmt = user ? canProcessOrders(user.role) || isGF(user.role) : false;
  const leitung = user ? isGF(user.role) : false;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLaden({ persoenlich: true, betrieblich: true, team: true });
    setNichtGeladen([]);

    const reiche = (teil: Partial<DashData>) => {
      if (!cancelled) setData((v) => ({ ...v, ...teil }));
    };

    /** Persoenliches: fehlende Zeiten und die heutigen Einsaetze. */
    const persoenlich = async () => {
      const out: DashData = {};
      if (mitZeitkonto || isMitarbeiter(user.role)) {
        const fenster = new Date();
        fenster.setDate(fenster.getDate() - LUECKEN_TAGE);
        const ab = localDateStr(fenster);

        const [profile, entries, einsaetze] = await Promise.all([
          getUserByUid(user.companyId, user.uid),
          listOwnEntriesSince(user.companyId, user.uid, ab),
          listUpcomingAssignments(user.companyId, user.uid, todayStr(), 20),
        ]);

        /*
          FEHLENDE TAGE NUR MIT ZEITKONTO. Die Administration landet hier, weil
          sie auch ihre Einsätze sehen soll (`isMitarbeiter` schliesst sie
          ein) — und bekam bisher „25 Tage ohne Buchung“ dazu, obwohl sie kein
          Soll hat (Prüflauf F17). Gefragt wird die frische Zeile, nicht das
          gemerkte Profil: schaltet die Geschäftsführung ihr Zeitkonto um,
          soll die Startseite es beim nächsten Laden wissen.
        */
        if (profile && fuehrtZeitkonto(profile)) {
          out.hatEintritt = !!profile.appStartDate;
          out.fehlendeTage = offeneWerktage(profile, entries, fenster, new Date());
        }

        /*
          MONTEUR-START: Vorlage, Woche, Monat. Dieselben Regeln wie in der
          Zeiterfassung — jüngster Anwesenheitseintrag mit Zeitspanne als
          Vorlage für „Wie zuletzt“, Arbeitszeit der laufenden ISO-Woche,
          Monatssaldo über `calcMonthStats` wie in der Mitarbeiterübersicht.
          Das Fenster reicht 35 Tage zurück und deckt damit den ganzen
          laufenden Monat ab.
        */
        if (user.role === 'Mitarbeiter' && profile) {
          const vorlage = [...entries]
            .filter((e) => e.status === 'Anwesend' && e.startTime && e.endTime)
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          if (vorlage?.startTime && vorlage.endTime) {
            out.letzte = {
              startTime: vorlage.startTime,
              endTime: vorlage.endTime,
              breakDuration: Number(vorlage.breakDuration ?? 0),
              minuten: calcWorkMin(vorlage),
              projectNumber: vorlage.projectNumber,
            };
          }
          const jetzt = new Date();
          const kw = getISOWeek(jetzt);
          const inDieserWoche = (iso: string) => {
            const w = getISOWeek(new Date(`${iso}T00:00:00`));
            return w.week === kw.week && w.year === kw.year;
          };
          const sollMin = Math.round((Number(profile.weeklyTargetHours ?? 40) || 40) * 60);
          /*
            DIE TAGE MO–FR für die Balken — aus denselben Buchungen. Das
            Tagessoll wie in `calcMonthStats`: Wochensoll durch die Zahl der
            Arbeitstage, an freien Tagen null.
          */
          const arbeitstage = profile.workDays?.length ? profile.workDays : [1, 2, 3, 4, 5];
          const montag = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
          montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7));
          const tage: WochenTag[] = [0, 1, 2, 3, 4].map((i) => {
            const d = new Date(montag);
            d.setDate(montag.getDate() + i);
            const datum = localDateStr(d);
            return {
              datum,
              istMin: entries.filter((e) => e.date === datum).reduce((n, e) => n + calcWorkMin(e), 0),
              sollMin: arbeitstage.includes(d.getDay()) ? Math.round(sollMin / arbeitstage.length) : 0,
            };
          });
          out.woche = {
            istMin: entries.filter((e) => inDieserWoche(e.date)).reduce((n, e) => n + calcWorkMin(e), 0),
            sollMin,
            tage,
          };
          const monatsKopf = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;
          const imMonat = entries.filter((e) => e.date.startsWith(monatsKopf));
          const stand = calcMonthStats(profile, imMonat, imMonat, jetzt.getFullYear(), jetzt.getMonth());
          out.monat = {
            name: jetzt.toLocaleDateString('de-AT', { month: 'long' }),
            saldoMin: stand.hasConfig ? stand.saldoMin : null,
          };
        }

        /**
         * ALLE Einsaetze von heute, nicht der erste.
         *
         * Vorher stand hier `assignments.find(...)` — der erste Treffer, der
         * Rest fiel stillschweigend weg. Wer vormittags auf der einen und
         * nachmittags auf der anderen Baustelle ist, sah nur die eine und
         * fuhr im Zweifel die falsche an.
         */
        const heute = todayStr();
        const heutige = einsaetze.filter((a) => a.date === heute);
        /*
          DIE NÄCHSTEN EINSÄTZE des Monteurs — aus derselben Abfrage, und die
          Baustellen dazu über dieselbe Lesefunktion wie in „Mein
          Einsatzplan“, in EINEM Aufruf mit den heutigen.
        */
        const kommende = user.role === 'Mitarbeiter' ? einsaetze.filter((a) => a.date > heute) : [];
        if (heutige.length > 0 || kommende.length > 0) {
          /*
            Die Ruestlisten des Tages dazu — aber nur, wenn das Modul an ist,
            und ohne die Startseite mitzureissen, wenn sie nicht kommen. Wo
            der Monteur heute hin muss, ist die wichtigere Information; sie
            darf nicht daran haengen, dass eine Materialabfrage durchkommt.
          */
          const [projekte, listen] = await Promise.all([
            listProjectsByNumbers(
              user.companyId,
              [...heutige, ...kommende].map((a) => a.projectNumber),
            ),
            materialAn && heutige.length > 0
              ? listEinsatzMaterialForDate(user.companyId, heute).catch(() => [])
              : Promise.resolve([]),
          ]);
          out.heuteEigene = heutige.map((a) => {
            const pr = projekte.find((x) => x.projectNumber === a.projectNumber);
            const liste = listen.find((l) => l.projectNumber === a.projectNumber);
            return {
              material: liste?.positionen,
              geladen: liste?.geladen ?? {},
              id: a.id,
              date: a.date,
              projectNumber: a.projectNumber,
              customerName: pr?.customerName ?? `Baustelle ${a.projectNumber}`,
              address: pr?.address,
              contactName: pr?.contactName,
              contactPhone: pr?.contactPhone,
              asHelper: !!a.asHelper,
              comment: a.comment,
              billingMode: pr?.billingMode,
            };
          });
          out.naechste = kommende.map((a) => {
            const pr = projekte.find((x) => x.projectNumber === a.projectNumber);
            return {
              id: a.id,
              date: a.date,
              projectNumber: a.projectNumber,
              customerName: pr?.customerName,
              address: pr?.address,
              comment: a.comment,
              asHelper: !!a.asHelper,
            };
          });
        } else {
          out.heuteEigene = [];
          out.naechste = [];
        }
      }
      reiche(out);
    };

    /** Betriebliches: Baustellen, heutige Einteilung, Anforderungen, Rechnungen. */
    const betrieblich = async () => {
      const out: DashData = {};
      if (mgmt) {
        const [orders, projects, invoices] = await Promise.all([
          listOpenOrders(user.companyId),
          listActiveProjects(user.companyId),
          canInvoice(user.role) ? listUnpaidInvoices(user.companyId) : Promise.resolve([]),
        ]);

        out.openOrders = orders
          .filter((o) => o.transactionType !== 'return')
          .sort((a, b) => byNewest(a, b));

        if (canInvoice(user.role)) {
          /*
            DER REST, NICHT DER RECHNUNGSBETRAG. Auf der Startseite steht,
            wie viel Geld noch kommen muss; eine Teilzahlung mindert das.
            „Teilbezahlt" zählt dabei zu „offen" — mit dem, was von ihr übrig
            ist. Vorher stand dort die Summe der Bruttobeträge, und die war
            nach jeder Anzahlung zu hoch.
          */
          // Überfällig nach dem ZIEL, nicht nach dem Stand: eine angezahlte
          // Rechnung heisst „Teilbezahlt" und kann trotzdem längst fällig sein.
          const heute = todayStr();
          const sum = (offenNichtUeberfaellig: boolean) =>
            invoices
              .filter((i) => istUeberfaellig(i, heute) !== offenNichtUeberfaellig)
              .reduce((a, i) => a + offenerRest(i), 0);
          out.invoiceSums = { open: sum(true), overdue: sum(false) };
        }

        if (leitung) {
          /**
           * ALLE laufenden Baustellen, nicht nur die auffaelligen.
           *
           * Das Radar zeigt weiterhin, was aus dem Ruder laeuft — aber die
           * Frage „welche Baustellen haben wir gerade?" beantwortete die
           * Startseite bisher gar nicht. Wer sie stellte, musste erst in die
           * Verwaltung wechseln.
           */
          out.aktiveBaustellen = [...projects]
            .filter((pr) => pr.status === 'Aktiv')
            .sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));

          /** Die heutige Einteilung des Betriebs, nach Baustelle gebuendelt. */
          const heute = todayStr();
          const einsaetze = await listAssignmentsForDate(user.companyId, heute);
          const nachBaustelle = new Map<string, Assignment[]>();
          for (const a of einsaetze) {
            const liste = nachBaustelle.get(a.projectNumber) ?? [];
            liste.push(a);
            nachBaustelle.set(a.projectNumber, liste);
          }
          out.heuteBetrieb = [...nachBaustelle.entries()]
            .map(([pn, rows]) => {
              const pr = projects.find((x) => x.projectNumber === pn);
              return {
                id: pr?.id,
                projectNumber: pn,
                customerName: pr?.customerName ?? `Baustelle ${pn}`,
                address: pr?.address,
                contactPhone: pr?.contactPhone,
                contactName: pr?.contactName,
                namen: rows
                  .map((r) => r.userName ?? '')
                  .filter(Boolean)
                  .sort((a, b) => a.localeCompare(b, 'de')),
                helfer: rows.filter((r) => r.asHelper).length,
              };
            })
            .sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));

          // Projekt-Radar: nur die Baustellen MIT Budget, und nur deren
          // Eintraege. Abgeschlossene fallen weg und machen mit der Zeit den
          // Grossteil aus.
          const mitBudget = projects.filter((pr) => (pr.estimatedHours ?? 0) > 0);
          if (mitBudget.length > 0) {
            const allEntries = await listEntriesForProjects(
              user.companyId,
              mitBudget.map((pr) => pr.projectNumber),
            );
            const byProject = groupProjectHours(allEntries);
            out.projectAlerts = mitBudget
              .map((pr) => {
                const hours = byProject.find(
                  (h) => h.projectNumber === normProjectNumber(pr.projectNumber),
                );
                const fachMin = hours?.fachMin ?? 0;
                const state = calcBudgetState(fachMin, pr.estimatedHours);
                return {
                  id: pr.id,
                  projectNumber: pr.projectNumber,
                  customerName: pr.customerName,
                  pct: state.pct,
                  over: state.over,
                  usedMin: fachMin,
                  estimatedHours: pr.estimatedHours ?? 0,
                  tone: state.tone,
                };
              })
              .filter((pr) => pr.tone === 'warning' || pr.tone === 'danger')
              .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
          }
        }
      } else if (isMitarbeiter(user.role)) {
        const orders = await listOwnOpenOrders(user.companyId, user.uid);
        out.ownOpenOrders = orders.filter((o) => o.transactionType !== 'return').length;
      }
      reiche(out);
    };

    /**
     * Team: WER HAT NOCH NICHT GEBUCHT — nicht, wer wie viele Stunden vor
     * oder zurueck liegt.
     *
     * Ein Saldo auf der Startseite war zweimal falsch: er kostete jeden
     * Zeiteintrag des Betriebs, und er beantwortete nicht die Frage, die
     * jemand mit dieser Liste vor sich tatsaechlich hat. Handeln kann man an
     * einer Luecke — die laesst sich nachtragen. An „-3,5 h" nicht.
     *
     * Der Bereich ist fest begrenzt: zwanzig Leute mal fuenfunddreissig Tage
     * sind rund 500 Dokumente, und das bleibt so, auch in zehn Jahren.
     */
    const team = async () => {
      const out: DashData = {};
      if (canEditTime(user.role)) {
        const alle = await listUsers(user.companyId);
        const zeitkonten = alle.filter((u) => fuehrtZeitkonto(u) && u.active !== false);

        const fenster = new Date();
        fenster.setDate(fenster.getDate() - LUECKEN_TAGE);
        const eintraege = await listEntriesInRange(
          user.companyId,
          localDateStr(fenster),
          todayStr(),
        );

        out.team = zeitkonten
          .map((u) => {
            const eigene = eintraege.filter((e) => e.userId === u.uid);
            return {
              uid: u.uid,
              name: u.name,
              fehlendeTage: offeneWerktage(u, eigene, fenster, new Date()).length,
              hatKonfig: !!u.appStartDate,
            };
          })
          // Wer etwas offen hat, steht oben — die Liste ist eine Arbeitsliste.
          .sort((a, b) => b.fehlendeTage - a.fehlendeTage || a.name.localeCompare(b.name, 'de'));
      }
      reiche(out);
    };

    /**
     * Jeder Block für sich, mit Auffang.
     *
     * `allSettled` verschluckte die Ablehnung, und `finally` gab es nicht —
     * beides zusammen ergab den ewigen Kreisel. Jetzt wird der Ladezustand
     * IMMER beendet, und wer nicht kam, sagt es.
     *
     * Die Blöcke bleiben getrennt: fällt die Betriebssicht aus, soll der
     * Monteur trotzdem sehen, wo er heute hin muss.
     */
    const mitAuffang = (
      teil: 'persoenlich' | 'betrieblich' | 'team',
      name: string,
      lauf: () => Promise<void>,
    ) =>
      lauf()
        .catch(() => {
          if (!cancelled) setNichtGeladen((f) => (f.includes(name) ? f : [...f, name]));
        })
        .finally(() => {
          if (!cancelled) setLaden((v) => ({ ...v, [teil]: false }));
        });

    void Promise.allSettled([
      mitAuffang('persoenlich', 'Deine Tage und Einsätze', persoenlich),
      mitAuffang('betrieblich', 'Baustellen, Anforderungen und Rechnungen', betrieblich),
      mitAuffang('team', 'Die Mannschaft', team),
    ]);
    return () => {
      cancelled = true;
    };
  }, [user, mitZeitkonto, mgmt, leitung, materialAn]);

  /**
   * Grundregel gegen ein ueberladenes wie gegen ein leeres Dashboard: jede
   * Karte erscheint nur mit Inhalt. Bleibt nichts uebrig, steht dort eine
   * ruhige Zeile statt einer Wand aus Nullen.
   */
  const nochAmLaden = laden.persoenlich || laden.betrieblich || laden.team;
  const offeneTage = data.fehlendeTage ?? [];
  /** Die Startseite des Monteurs — nur die Rolle selbst, nicht die Administration. */
  const monteur = user?.role === 'Mitarbeiter';
  const nothingToShow =
    !monteur &&
    !nochAmLaden &&
    offeneTage.length === 0 &&
    !data.heuteEigene?.length &&
    !data.aktiveBaustellen?.length &&
    !data.heuteBetrieb?.length &&
    !data.projectAlerts?.length &&
    !data.openOrders?.length &&
    !data.team?.length &&
    !data.ownOpenOrders &&
    !data.invoiceSums?.open &&
    !data.invoiceSums?.overdue;

  if (!user) return null;

  /*
    Einmal gerechnet, dreimal gelesen. Wochentag ausgeschrieben, weil genau
    der die Frage beantwortet, die jemand um 6:50 Uhr im Auto hat — danach
    das Datum so, wie es überall in der App steht: „Freitag, 25.09.2026".
    Bis zum 25.09.2026 stand hier „Freitag, 25. September", die einzige
    Stelle mit ausgeschriebenem Monat.
  */
  const heuteKopf = (() => {
    const d = new Date();
    return {
      datum: `${d.toLocaleDateString('de-AT', { weekday: 'long' })}, ${datumAT(localDateStr(d))}`,
      kw: getISOWeek(d).week,
      feiertag: getAustrianHolidayName(d),
    };
  })();

  return (
    <div className="space-y-6">
      {/*
        DER KOPF: DER TAG KLEIN, DER GRUSS GROSS (docs/design/linie.md 9,
        freigegeben für diesen Durchgang).

        Bis zum 25.09.2026 stand hier das Datum als Titel und darunter „KW ·
        Firma · Rolle: …“. Das Datum bleibt — es ist die billigste Auskunft
        darüber, dass man auf den heutigen Tag schaut und keinen
        zwischengespeicherten Stand (Service Worker) —, jetzt klein über dem
        Titel, mit der Kalenderwoche, nach der im Betrieb geplant und
        bestellt wird, und einem Feiertag, wenn heute einer ist.

        FIRMA UND ROLLE STEHEN HIER NICHT MEHR, weil sie woanders stehen:
        der Betrieb in der Seitenleiste unter „Senklot“ und am Telefon in
        der Kopfleiste (Logo oder Name), Name und Rolle unten in der
        Seitenleiste und am Telefon hinter dem Avatar (Profil). Hier waren
        sie die dritte Nennung derselben Tatsache.
      */}
      <StartKopf
        datum={heuteKopf.datum}
        kw={heuteKopf.kw}
        feiertag={heuteKopf.feiertag}
        titel={grussZeile(new Date(), user.name)}
        band={monteur}
        aktion={
          /* Dieselbe Aktion wie „Zeit erfassen“ am Einsatz und der Eintrag
             „Zeit“ der Leiste — am Schreibtisch als Hauptaktion der Seite. */
          mitZeitkonto || monteur ? (
            <Link to="/time" className="knopf-primaer">
              Zeit buchen
            </Link>
          ) : undefined
        }
      />

      {/*
        DIE NACHTLÄUFE ZUERST, noch vor allem anderen.

        Sie sind das Einzige auf dieser Seite, bei dem der Schaden mit der Zeit
        wächst statt aufzufallen: eine ausgefallene Sicherung merkt man an dem
        Tag, an dem man sie braucht. Steht nichts an, steht hier auch nichts —
        eine dauerhafte grüne Kachel wäre nach zwei Wochen unsichtbar.
      */}
      <LaufWarnung />

      {/*
        KENNZAHLEN OBEN, als Wege dorthin (Design-Durchgang 25.09.2026).
        Jede Kachel nur, wenn sie für diese Rolle etwas aussagt — und jede
        führt in die gefilterte Liste. Vorher standen sie mitten in der Seite,
        unter der Tageseinteilung; die Zahl, die man als Erstes sucht („was
        ist überfällig?"), stand damit als Drittes da.
      */}
      {!monteur &&
        (materialAn || rechnungenAn) &&
        (data.ownOpenOrders !== undefined || data.invoiceSums) &&
        ((data.ownOpenOrders ?? 0) > 0 ||
          (data.invoiceSums?.open ?? 0) > 0 ||
          (data.invoiceSums?.overdue ?? 0) > 0) && (
          <MetricRow>
            {data.ownOpenOrders !== undefined && data.ownOpenOrders > 0 && (
              <Metric
                label="Material"
                value={data.ownOpenOrders}
                hint="von dir angefordert"
                to="/material"
              />
            )}
            {data.invoiceSums && data.invoiceSums.overdue > 0 && (
              <Metric
                label="Überfällig"
                tone="danger"
                value={fmtEUR(data.invoiceSums.overdue)}
                to="/invoices?status=%C3%9Cberf%C3%A4llig"
              />
            )}
            {data.invoiceSums && data.invoiceSums.open > 0 && (
              <Metric label="Offene Rechnungen" value={fmtEUR(data.invoiceSums.open)} to="/invoices" />
            )}
          </MetricRow>
        )}

      {/*
        Direkt nach den Kennzahlen die Wartungen: das Einzige auf dieser
        Seite, das UMSATZ kostet, wenn man es übersieht — und zwar lautlos.
        Der Kunde meldet sich nicht, wenn niemand kommt.
      */}
      <WartungHinweis />

      {/*
        Fehlende Zeiten statt Saldo.

        Der Saldo seit Eintritt steht in der Zeiterfassung, wo man ohnehin auf
        sein Konto schaut. Hier steht, was man TUN kann: die Tage, an denen
        nichts gebucht ist. Die Datumsangaben ausgeschrieben, nicht nur
        gezaehlt — „3 Tage fehlen" zwingt zum Suchen, welche.
      */}
      {/*
        Kein Eintrittsdatum: ausdruecklich sagen statt schweigen. Nur fuer
        alle, die ein Zeitkonto FUEHREN — die Administration hat keines und
        braucht den Hinweis nicht.
      */}
      {!monteur && mitZeitkonto && data.hatEintritt === false && (
        <Meldung ton="info" titel="Kein Eintrittsdatum hinterlegt">
          <p>
            Ohne Eintrittsdatum lässt sich nicht sagen, welche Tage fehlen und wie der Saldo
            steht. Die Geschäftsführung kann es in der Benutzerverwaltung nachtragen.
          </p>
        </Meldung>
      )}

      {/*
        DER MONTEUR HAT SEINE EIGENE STARTSEITE — drei Karten, siehe
        `MonteurStart.tsx`. Tage ohne Buchung, der heutige Einsatz und das
        angeforderte Material stehen dort; hier nicht noch einmal.
      */}
      {monteur && data.heuteEigene !== undefined && (
        <MonteurStart
          einsaetze={data.heuteEigene}
          letzte={data.letzte}
          woche={data.woche}
          monat={data.monat}
          fehlendeTage={offeneTage}
          offeneAnforderungen={data.ownOpenOrders}
          naechste={data.naechste}
          hinweis={
            /* Beim Monteur unter „Heute“ statt darüber: die Heute-Karte ragt
               am Telefon in das Kopfband und muss direkt darauf folgen. */
            data.hatEintritt === false ? (
              <Meldung ton="info" titel="Kein Eintrittsdatum hinterlegt">
                <p>
                  Ohne Eintrittsdatum lässt sich nicht sagen, welche Tage fehlen und wie der Saldo
                  steht. Die Geschäftsführung kann es in der Benutzerverwaltung nachtragen.
                </p>
              </Meldung>
            ) : undefined
          }
          scheineAn={scheineAn}
          materialAn={materialAn}
        />
      )}

      {/*
        TAGE OHNE BUCHUNG ALS ZEILE MIT PFEIL, wie beim Monteur („Offen für
        dich“, Mockup S. 1, 7). Bis zum 25.09.2026 stand hier ein gelber
        Hinweiskasten mit „Jetzt nachtragen“ im Satz; die Zeile ist jetzt
        selbst der Weg in die Zeiterfassung. Die Tage stehen weiter
        ausgeschrieben — gezeigt werden die LETZTEN fünf.
      */}
      {!monteur && offeneTage.length > 0 && (
        <Card title="Offen für dich">
          <List>
            <ListRow
              ziel="/time"
              title={
                offeneTage.length === 1
                  ? 'Ein Tag ohne Buchung'
                  : `${offeneTage.length} Tage ohne Buchung`
              }
              subtitle={
                <>
                  {offeneTage.slice(-5).map(fmtTag).join(', ')}
                  {offeneTage.length > 5 && ` und ${offeneTage.length - 5} weitere`}
                </>
              }
            />
          </List>
        </Card>
      )}

      {/*
        AM SCHREIBTISCH ZWEI SPALTEN (ab 1280 px, `.akte` wie in den Akten und
        im Verhältnis 3 : 2 wie der Monteur-Start, docs/design/linie.md 1):
        links, wo heute gearbeitet wird — die eigenen Einsätze, die Einteilung
        des Betriebs, die laufenden Baustellen —, rechts Stand und Nächstes:
        Baustellen am Limit, Material, Mannschaft. Steht nur auf einer Seite
        etwas, bleibt es eine Spalte über die ganze Breite statt neben einer
        leeren. Am Telefon und Tablet dieselbe Reihenfolge untereinander.
      */}
      {(() => {
        const links = [
          /*
            Die eigenen Einsaetze von heute — fuer den Monteur die wichtigste
            Information des Tages, deshalb ganz oben. MEHRERE moeglich: wer
            vormittags woanders ist als nachmittags, sah vorher nur die erste
            Baustelle.
          */
          !monteur && data.heuteEigene && data.heuteEigene.length > 0 && (
            <HeuteKarte
              key="heute"
              einsaetze={data.heuteEigene}
              scheineAn={scheineAn}
              materialAn={materialAn}
              aktion={
                <Link to="/my-schedule" className="textlink-allein">
                  Mein Einsatzplan
                </Link>
              }
            />
          ),

          /*
            Die heutige Einteilung des Betriebs — die Frage, mit der die
            Leitung in den Tag geht: wer ist wo? Jede Baustelle führt in ihre
            Akte; Adresse und Telefon stehen als Chips darunter, außerhalb
            der Tastfläche der Zeile (ein Link im Link ginge nicht).
          */
          leitung && data.heuteBetrieb && data.heuteBetrieb.length > 0 && (
            <Card
              key="betrieb"
              title="Heute im Einsatz"
              action={
                <Link to="/assignments" className="textlink-allein">
                  Zur Einsatzplanung
                </Link>
              }
            >
              <List>
                {data.heuteBetrieb.map((b) => (
                  <ListRow
                    key={b.projectNumber}
                    ziel={b.id ? `/admin-projects/${b.id}` : undefined}
                    title={b.customerName}
                    subtitle={
                      <>
                        <span>{b.projectNumber}</span> · <span>{b.namen.join(', ')}</span>
                      </>
                    }
                    zustand={
                      <Marke>
                        {b.namen.length} {b.namen.length === 1 ? 'Person' : 'Personen'}
                        {b.helfer > 0 && `, davon ${b.helfer} Helfer`}
                      </Marke>
                    }
                    unten={
                      <KontaktZeile
                        adresse={b.address}
                        nummer={b.contactPhone}
                        name={b.contactName}
                        className="pb-3"
                      />
                    }
                  />
                ))}
              </List>
            </Card>
          ),

          /*
            Alle laufenden Baustellen. Das Radar rechts zeigt, was aus dem
            Ruder laeuft; diese Karte beantwortet die schlichtere Frage „was
            haben wir gerade?", fuer die man bisher in die Verwaltung wechseln
            musste.

            ZWÖLF, nicht fünf: für die Frage „welche Baustellen haben wir
            gerade?" braucht es mehr als einen Ausschnitt. Der Rest steht als
            Zahl da, mit dem Weg dorthin — dasselbe Muster wie bei den offenen
            Anforderungen. Bei achtzig Baustellen stünde sonst die längste und
            harmloseste Liste der Seite vor den kurzen, wichtigen.

            Jede Zeile führt in die Akte der Baustelle. Das Budget steht
            rechts als Marke, Adresse und Telefon als Chips darunter.
          */
          leitung && data.aktiveBaustellen && data.aktiveBaustellen.length > 0 && (
            <Card
              key="baustellen"
              title="Aktive Baustellen" anzahl={data.aktiveBaustellen.length}
              action={
                <Link to="/admin-projects" className="textlink-allein">
                  Baustellen verwalten
                </Link>
              }
            >
              <Grenzliste
                eintraege={data.aktiveBaustellen}
                grenze={BAUSTELLEN_AUF_STARTSEITE}
                mehr={{ to: '/admin-projects' }}
                nachsatz="— alle unter Baustellen."
                zeile={(pr) => (
                  <ListRow
                    key={pr.id}
                    ziel={`/admin-projects/${pr.id}`}
                    title={pr.customerName}
                    subtitle={pr.projectNumber}
                    zustand={
                      pr.estimatedHours ? (
                        <Marke>{fmtStunden(pr.estimatedHours)} h Budget</Marke>
                      ) : undefined
                    }
                    unten={
                      <KontaktZeile
                        adresse={pr.address}
                        nummer={pr.contactPhone}
                        name={pr.contactName}
                        className="pb-3"
                      />
                    }
                  />
                )}
              />
            </Card>
          ),
        ].filter(Boolean);

        const rechts = [
          /*
            Projekt-Radar: nur was aus dem Ruder läuft. Nach Auslastung
            sortiert, die schlimmsten oben — acht davon sind eine
            Arbeitsliste, vierzig eine Tapete, in der die eine untergeht, die
            wirklich brennt. Jede Zeile führt in die Akte der Baustelle.
          */
          data.projectAlerts && data.projectAlerts.length > 0 && (
            <Card
              key="limit"
              title="Baustellen am Limit"
              action={
                <Link to="/accounting" className="textlink-allein">
                  Zur Auswertung
                </Link>
              }
            >
              <Grenzliste
                eintraege={data.projectAlerts}
                grenze={WARNUNGEN_AUF_STARTSEITE}
                mehr={{ to: '/accounting' }}
                nachsatz="— in der Auswertung."
                zeile={(pr) => (
                  <ListRow
                    key={pr.projectNumber}
                    ziel={`/admin-projects/${pr.id}`}
                    title={pr.customerName}
                    subtitle={
                      <>
                        {pr.projectNumber} · {fmtStd(pr.usedMin)} von {fmtStunden(pr.estimatedHours)} h
                      </>
                    }
                    zustand={
                      <Warnung stufe={pr.over ? 'dringend' : 'achtung'}>
                        {pr.over ? 'überschritten' : `${pr.pct} %`}
                      </Warnung>
                    }
                  />
                )}
              />
            </Card>
          ),

          /* Offene Materialanforderungen — als Liste, weil eine Zahl nicht
             sagt, was der Monteur auf der Baustelle braucht. Jede Zeile führt
             in die Anforderungen, wo sie bearbeitet wird. */
          materialAn && data.openOrders && data.openOrders.length > 0 && (
            <Card
              key="material"
              title="Material angefordert" anzahl={data.openOrders.length}
              action={
                <Link to="/material/anforderungen" className="textlink-allein">
                  Bearbeiten
                </Link>
              }
            >
              <Grenzliste
                eintraege={data.openOrders}
                grenze={5}
                mehr={{ to: '/material/anforderungen' }}
                zeile={(o) => (
                  <ListRow
                    key={o.id}
                    ziel="/material/anforderungen"
                    title={
                      <>
                        {o.quantity}× {o.materialName}
                      </>
                    }
                    subtitle={[o.userName, o.projectNumber].filter(Boolean).join(' · ')}
                    zustand={<StatusBadge status={o.status} />}
                  />
                )}
              />
            </Card>
          ),

          /*
            Team: wer hat noch nicht gebucht. Kein Saldo mehr — der
            beantwortete die Frage nicht, die jemand mit dieser Liste vor sich
            hat, und kostete jeden Zeiteintrag des Betriebs. Jede Zeile führt
            in die Mitarbeiterübersicht, wo Lücken und Saldo je Person stehen.
            Der Satz zum Zeitraum steht im Kartenfuß, wie „Weitere … laden“.
          */
          data.team && data.team.length > 0 && (
            <Card
              key="team"
              title="Team — offene Zeiten"
              action={
                <Link to="/accounting" className="textlink-allein">
                  Zur Monatsauswertung
                </Link>
              }
              footer={
                <p className="text-xs text-ink-muted">
                  Geprüft werden die letzten {LUECKEN_TAGE} Tage bis gestern. Der Stundensaldo
                  steht im Zeitkonto des Mitarbeiters.
                </p>
              }
            >
              <List>
                {data.team.map((t) => (
                  <ListRow
                    key={t.uid}
                    ziel="/accounting"
                    title={t.name}
                    zustand={
                      !t.hatKonfig ? (
                        <Marke>kein Startdatum</Marke>
                      ) : t.fehlendeTage > 0 ? (
                        <Warnung>{tageWort(t.fehlendeTage)} offen</Warnung>
                      ) : (
                        <Zustand stand="gut">vollständig</Zustand>
                      )
                    }
                  />
                ))}
              </List>
            </Card>
          ),
        ].filter(Boolean);

        if (links.length === 0 && rechts.length === 0) return null;
        if (links.length === 0 || rechts.length === 0) {
          return <div className="akte-einspaltig">{[...links, ...rechts]}</div>;
        }
        return (
          <div className="akte">
            <div className="akte-links">{links}</div>
            <div className="akte-rechts">{rechts}</div>
          </div>
        );
      })()}

      {nochAmLaden && (
        <Card>
          <LoadingState />
        </Card>
      )}

      {/*
        WAS NICHT KAM, statt eines Kreisels, der nie aufhört.

        Die Meldung steht UNTEN, nach allem, was sehr wohl geladen wurde: der
        Monteur soll zuerst sehen, wo er heute hin muss, und erst danach
        erfahren, dass ein Teil fehlt.

        Der zweite Satz ist der wichtige. Eine Startseite, die weniger zeigt
        als sonst, sieht aus wie ein ruhiger Tag — und genau diesen Schluss
        darf sie hier nicht zulassen.
      */}
      {nichtGeladen.length > 0 && (
        <Meldung ton="warnung" role="status">
          <strong>Nicht geladen: {nichtGeladen.join(' · ')}.</strong> Was hier fehlt, heisst
          nicht, dass nichts ansteht — bitte die Seite neu laden. Die Reiter oben zeigen den
          vollständigen Stand.
        </Meldung>
      )}

      {nothingToShow && (
        <EmptyState>
          Nichts Offenes. {isMitarbeiter(user.role) ? 'Zeit buchen über die Leiste unten.' : ''}
        </EmptyState>
      )}
    </div>
  );
}
