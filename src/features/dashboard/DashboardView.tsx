import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { getUserByUid, listUsers } from '@/lib/db/users';
import { listOwnEntriesSince, listEntriesInRange, listEntriesForProjects } from '@/lib/db/timeEntries';
import { listUpcomingAssignments, listAssignmentsForDate } from '@/lib/db/assignments';
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
} from '@/lib/time';
import {
  shouldShowOvertime,
  canProcessOrders,
  isGF,
  canInvoice,
  canEditTime,
  isMitarbeiter,
} from '@/lib/permissions';
import type { Assignment, MaterialOrder, Project } from '@/types';
import Card from '@/components/Card';
import Metric, { MetricRow } from '@/components/Metric';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { AdresseLink, TelefonLink, KontaktZeile } from '@/components/Kontakt';
import { LoadingState } from '@/components/States';
import { byNewest } from '@/lib/timestamps';

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
  projectNumber: string;
  customerName: string;
  pct: number | null;
  over: boolean;
  usedH: number;
  estimatedHours: number;
}

/** Ein Einsatz mit den Stammdaten der Baustelle — Adresse und Nummer zählen im Auto. */
interface EinsatzZeile {
  id: string;
  projectNumber: string;
  customerName: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  asHelper: boolean;
  comment?: string;
}

/** Alle Einsätze eines Tages, nach Baustelle gebündelt — die Sicht der Leitung. */
interface TagesBaustelle {
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

/** Rollen-spezifisches Zuhause mit echten Kennzahlen. */
export default function DashboardView() {
  const { user, company } = useAuth();
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
  const kiAn = useModul('ki');
  const [data, setData] = useState<DashData>({});
  const [laden, setLaden] = useState({ persoenlich: true, betrieblich: true, team: true });
  const fuehrtZeitkonto = user ? shouldShowOvertime(user.role) : false;
  const mgmt = user ? canProcessOrders(user.role) || isGF(user.role) : false;
  const leitung = user ? isGF(user.role) : false;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLaden({ persoenlich: true, betrieblich: true, team: true });

    const reiche = (teil: Partial<DashData>) => {
      if (!cancelled) setData((v) => ({ ...v, ...teil }));
    };

    /** Persoenliches: fehlende Zeiten und die heutigen Einsaetze. */
    const persoenlich = async () => {
      const out: DashData = {};
      if (fuehrtZeitkonto || isMitarbeiter(user.role)) {
        const fenster = new Date();
        fenster.setDate(fenster.getDate() - LUECKEN_TAGE);
        const ab = localDateStr(fenster);

        const [profile, entries, einsaetze] = await Promise.all([
          getUserByUid(user.companyId, user.uid),
          listOwnEntriesSince(user.companyId, user.uid, ab),
          listUpcomingAssignments(user.companyId, user.uid, todayStr(), 20),
        ]);

        if (profile) {
          out.hatEintritt = !!profile.appStartDate;
          out.fehlendeTage = offeneWerktage(profile, entries, fenster, new Date());
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
        if (heutige.length > 0) {
          const projekte = await listProjectsByNumbers(
            user.companyId,
            heutige.map((a) => a.projectNumber),
          );
          out.heuteEigene = heutige.map((a) => {
            const pr = projekte.find((x) => x.projectNumber === a.projectNumber);
            return {
              id: a.id,
              projectNumber: a.projectNumber,
              customerName: pr?.customerName ?? `Baustelle ${a.projectNumber}`,
              address: pr?.address,
              contactName: pr?.contactName,
              contactPhone: pr?.contactPhone,
              asHelper: !!a.asHelper,
              comment: a.comment,
            };
          });
        } else {
          out.heuteEigene = [];
        }
      }
      reiche(out);
      if (!cancelled) setLaden((v) => ({ ...v, persoenlich: false }));
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
          const sum = (st: string) =>
            invoices
              .filter((i) => i.paymentStatus === st)
              .reduce((a, i) => a + (i.totalBrutto ?? 0), 0);
          out.invoiceSums = { open: sum('Offen'), overdue: sum('Überfällig') };
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
                  projectNumber: pr.projectNumber,
                  customerName: pr.customerName,
                  pct: state.pct,
                  over: state.over,
                  usedH: Math.round((fachMin / 60) * 10) / 10,
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
      if (!cancelled) setLaden((v) => ({ ...v, betrieblich: false }));
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
        const zeitkonten = alle.filter((u) => shouldShowOvertime(u.role) && u.active !== false);

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
      if (!cancelled) setLaden((v) => ({ ...v, team: false }));
    };

    void Promise.allSettled([persoenlich(), betrieblich(), team()]);
    return () => {
      cancelled = true;
    };
  }, [user, fuehrtZeitkonto, mgmt, leitung]);

  /**
   * Grundregel gegen ein ueberladenes wie gegen ein leeres Dashboard: jede
   * Karte erscheint nur mit Inhalt. Bleibt nichts uebrig, steht dort eine
   * ruhige Zeile statt einer Wand aus Nullen.
   */
  const nochAmLaden = laden.persoenlich || laden.betrieblich || laden.team;
  const offeneTage = data.fehlendeTage ?? [];
  const nothingToShow =
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Willkommen, ${user.name.split(' ')[0]}`}
        subtitle={`${company?.name ?? 'Installateur-App'} · Rolle: ${user.role}`}
      />

      {/*
        Fehlende Zeiten statt Saldo.

        Der Saldo seit Eintritt steht in der Zeiterfassung, wo man ohnehin auf
        sein Konto schaut. Hier steht, was man TUN kann: die Tage, an denen
        nichts gebucht ist. Die Datumsangaben ausgeschrieben, nicht nur
        gezaehlt — „3 Tage fehlen" zwingt zum Suchen, welche.
      */}
      {/*
        Kein Eintrittsdatum: ausdruecklich sagen statt schweigen. Nur fuer
        Rollen, die ein Zeitkonto FUEHREN — die Geschaeftsfuehrung hat keines
        und braucht den Hinweis nicht.
      */}
      {fuehrtZeitkonto && data.hatEintritt === false && (
        <div className="rounded border border-info/30 bg-info-bg p-4 text-info">
          <p className="font-semibold">Kein Eintrittsdatum hinterlegt</p>
          <p className="mt-1 text-sm">
            Ohne Eintrittsdatum lässt sich nicht sagen, welche Tage fehlen und wie der Saldo
            steht. Die Geschäftsführung kann es in der Benutzerverwaltung nachtragen.
          </p>
        </div>
      )}

      {offeneTage.length > 0 && (
        <div className="rounded border border-warning/30 bg-warning-bg p-4 text-warning" role="alert">
          <p className="font-semibold">
            {offeneTage.length === 1 ? 'Ein Tag ohne Buchung' : `${offeneTage.length} Tage ohne Buchung`}
          </p>
          <p className="mt-1 text-sm">
            {offeneTage.slice(-5).map(fmtTag).join(', ')}
            {offeneTage.length > 5 && ` und ${offeneTage.length - 5} weitere`}.{' '}
            <Link to="/time" className="font-semibold underline">
              Jetzt nachtragen
            </Link>
          </p>
        </div>
      )}

      {kiAn && (
        <Link
          to="/voice"
          className="flex min-h-touch items-center gap-3 rounded-lg bg-brand px-4 py-3 text-brand-fg shadow-sm transition hover:opacity-95 active:scale-[0.99] sm:gap-4"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 sm:h-12 sm:w-12">
            <Icon name="mic" size={22} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">Spracherfassung starten</span>
            <span className="mt-1 hidden text-sm text-brand-fg/80 sm:block">
              15 Sekunden sprechen → Zeit, Material, Folgetermin als bestätigbare Karten
            </span>
          </span>
        </Link>
      )}

      {/*
        Die eigenen Einsaetze von heute — fuer den Monteur die wichtigste
        Information des Tages, deshalb ganz oben. MEHRERE moeglich: wer
        vormittags woanders ist als nachmittags, sah vorher nur die erste
        Baustelle.
      */}
      {data.heuteEigene && data.heuteEigene.length > 0 && (
        <Card
          title={data.heuteEigene.length === 1 ? 'Heute' : `Heute — ${data.heuteEigene.length} Baustellen`}
          action={
            <Link to="/my-schedule" className="text-sm font-semibold text-brand underline">
              Mein Einsatzplan
            </Link>
          }
        >
          <div className="space-y-4">
            {data.heuteEigene.map((e) => (
              <div key={e.id} className="rounded-sm border border-line p-3">
                <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
                  {e.customerName}
                  {e.asHelper && <Badge tone="warning">Helfer</Badge>}
                </p>
                <p className="tnum text-sm text-ink-muted">{e.projectNumber}</p>
                {e.comment && (
                  <p className="mt-2 rounded-sm bg-surface-2 p-2 text-sm text-ink">{e.comment}</p>
                )}
                <KontaktZeile
                  adresse={e.address}
                  nummer={e.contactPhone}
                  name={e.contactName}
                  className="mt-3"
                />
                {/*
                  Der Schein entsteht am Ende genau dieses Einsatzes. Ihn hier
                  anzubieten spart den Umweg ueber einen eigenen Bereich, in
                  dem die Baustelle noch einmal gesucht werden muesste.
                */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/time"
                    state={{ projectNumber: e.projectNumber, asHelper: !!e.asHelper }}
                    className="flex min-h-touch items-center rounded bg-brand px-4 py-2 text-sm font-semibold text-brand-fg"
                  >
                    Zeit erfassen
                  </Link>
                  {scheineAn && (
                    <Link
                      to={`/worksheet?projekt=${encodeURIComponent(e.projectNumber)}`}
                      className="flex min-h-touch items-center rounded border border-line px-4 py-2 text-sm font-semibold text-ink"
                    >
                      Schein schreiben
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/*
        Die heutige Einteilung des Betriebs — die Frage, mit der die Leitung
        in den Tag geht: wer ist wo? Beantwortete die Startseite bisher gar
        nicht.
      */}
      {leitung && data.heuteBetrieb && data.heuteBetrieb.length > 0 && (
        <Card
          title="Heute im Einsatz"
          action={
            <Link to="/assignments" className="text-sm font-semibold text-brand underline">
              Zur Einsatzplanung
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.heuteBetrieb.map((b) => (
              <li key={b.projectNumber} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">
                    {b.customerName}{' '}
                    <span className="tnum text-sm font-normal text-ink-muted">
                      ({b.projectNumber})
                    </span>
                  </span>
                  <Badge tone="info">
                    {b.namen.length} {b.namen.length === 1 ? 'Person' : 'Personen'}
                    {b.helfer > 0 && `, davon ${b.helfer} Helfer`}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{b.namen.join(', ')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm">
                  <AdresseLink adresse={b.address} />
                  <TelefonLink nummer={b.contactPhone} name={b.contactName} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Kennzahlen: jede Kachel nur, wenn sie fuer diese Rolle etwas aussagt. */}
      {(materialAn || rechnungenAn) &&
        (data.ownOpenOrders !== undefined || data.invoiceSums) &&
        ((data.ownOpenOrders ?? 0) > 0 ||
          (data.invoiceSums?.open ?? 0) > 0 ||
          (data.invoiceSums?.overdue ?? 0) > 0) && (
          <MetricRow>
            {data.ownOpenOrders !== undefined && data.ownOpenOrders > 0 && (
              <Metric label="Material" value={data.ownOpenOrders} hint="von dir angefordert" />
            )}
            {data.invoiceSums && data.invoiceSums.overdue > 0 && (
              <Metric label="Überfällig" tone="danger" value={fmtEUR(data.invoiceSums.overdue)} />
            )}
            {data.invoiceSums && data.invoiceSums.open > 0 && (
              <Metric label="Offene Rechnungen" value={fmtEUR(data.invoiceSums.open)} />
            )}
          </MetricRow>
        )}

      {/*
        Alle laufenden Baustellen. Das Radar darunter zeigt, was aus dem Ruder
        laeuft; diese Karte beantwortet die schlichtere Frage „was haben wir
        gerade?", fuer die man bisher in die Verwaltung wechseln musste.
      */}
      {leitung && data.aktiveBaustellen && data.aktiveBaustellen.length > 0 && (
        <Card
          title={`Aktive Baustellen (${data.aktiveBaustellen.length})`}
          action={
            <Link to="/admin-projects" className="text-sm font-semibold text-brand underline">
              Baustellen verwalten
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.aktiveBaustellen.map((pr) => (
              <li key={pr.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">
                    {pr.customerName}{' '}
                    <span className="tnum text-sm font-normal text-ink-muted">
                      ({pr.projectNumber})
                    </span>
                  </span>
                  {pr.estimatedHours ? (
                    <Badge tone="gray">{pr.estimatedHours} h Budget</Badge>
                  ) : null}
                </div>
                {/*
                  Kompakt gehalten: die Karte zeigt ALLE laufenden Baustellen,
                  und bei zwanzig Stueck entscheidet die Zeilenhoehe darueber,
                  ob die Liste noch zu ueberblicken ist. Die Adresse bleibt
                  einzeilig und wird abgeschnitten — sie ist hier der
                  Anfasser zur Karte, nicht der vorzulesende Text.
                */}
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 text-sm">
                  <AdresseLink adresse={pr.address} className="min-w-0 max-w-full [&>span]:truncate" />
                  <TelefonLink nummer={pr.contactPhone} name={pr.contactName} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Projekt-Radar: nur was aus dem Ruder läuft. */}
      {data.projectAlerts && data.projectAlerts.length > 0 && (
        <Card
          title="Baustellen am Limit"
          action={
            <Link to="/accounting" className="text-sm font-semibold text-brand underline">
              Zur Auswertung
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.projectAlerts.map((pr) => (
              <li
                key={pr.projectNumber}
                className="flex min-h-touch items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{pr.customerName}</span>
                  <span className="block text-xs text-ink-muted">
                    {pr.usedH} von {pr.estimatedHours} h · {pr.projectNumber}
                  </span>
                </span>
                <Badge tone={pr.over ? 'danger' : 'warning'}>
                  {pr.over ? 'überschritten' : `${pr.pct} %`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Offene Materialanforderungen — als Liste, weil eine Zahl nicht sagt,
          was der Monteur auf der Baustelle braucht. */}
      {materialAn && data.openOrders && data.openOrders.length > 0 && (
        <Card
          title={`Material angefordert (${data.openOrders.length})`}
          action={
            <Link to="/admin-orders" className="text-sm font-semibold text-brand underline">
              Bearbeiten
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.openOrders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex min-h-touch items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-ink">
                    {o.quantity}× {o.materialName}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {[o.userName, o.projectNumber].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </li>
            ))}
          </ul>
          {data.openOrders.length > 5 && (
            <p className="mt-2 text-sm text-ink-muted">
              und {data.openOrders.length - 5} weitere
            </p>
          )}
        </Card>
      )}

      {/*
        Team: wer hat noch nicht gebucht. Kein Saldo mehr — der beantwortete
        die Frage nicht, die jemand mit dieser Liste vor sich hat, und kostete
        jeden Zeiteintrag des Betriebs.
      */}
      {data.team && data.team.length > 0 && (
        <Card
          title="Team — offene Zeiten"
          action={
            <Link to="/accounting" className="text-sm font-semibold text-brand underline">
              Zur Monatsauswertung
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.team.map((t) => (
              <li key={t.uid} className="flex min-h-touch items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-ink">{t.name}</span>
                {!t.hatKonfig ? (
                  <Badge tone="gray">kein Startdatum</Badge>
                ) : t.fehlendeTage > 0 ? (
                  <Badge tone="warning">
                    {t.fehlendeTage === 1 ? '1 Tag offen' : `${t.fehlendeTage} Tage offen`}
                  </Badge>
                ) : (
                  <Badge tone="success">vollständig</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Geprüft werden die letzten {LUECKEN_TAGE} Tage bis gestern. Der Stundensaldo steht im
            Zeitkonto des Mitarbeiters.
          </p>
        </Card>
      )}

      {nochAmLaden && (
        <Card>
          <LoadingState />
        </Card>
      )}

      {nothingToShow && (
        <Card>
          <p className="text-ink-muted">
            Nichts Offenes. {isMitarbeiter(user.role) ? 'Zeit buchen über die Leiste unten.' : ''}
          </p>
        </Card>
      )}
    </div>
  );
}
