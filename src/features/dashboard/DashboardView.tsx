import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { getUserByUid } from '@/lib/db/users';
import { listOwnEntries } from '@/lib/db/timeEntries';
import { listAssignmentsForUser } from '@/lib/db/assignments';
import { listAllOrders, listOwnOrders } from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import { listInvoices } from '@/lib/db/invoices';
import {
  calcOverallSaldo,
  lastWorkday,
  todayStr,
  isWeekend,
  isAustrianHoliday,
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
} from '@/lib/permissions';
import { listUsers } from '@/lib/db/users';
import { listAllEntries } from '@/lib/db/timeEntries';
import type { AppUser, Assignment, MaterialOrder, TimeEntry } from '@/types';
import Card from '@/components/Card';
import Metric from '@/components/Metric';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';
import Icon from '@/components/Icon';
import StatusBadge from '@/components/StatusBadge';
import { LoadingState, SkeletonMetrics } from '@/components/States';
import { VOICE_ENABLED } from '@/lib/features';
import { byNewest } from '@/lib/timestamps';

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

interface DashData {
  saldoH?: number;
  hasSaldoConfig?: boolean;
  /** Werktage ohne jede Buchung — macht den Saldo unvollständig. */
  saldoGapDays?: number;
  todayAssignment?: Assignment;
  /** Stammdaten der heutigen Baustelle: Adresse und Telefon zählen im Auto. */
  todayProject?: { customerName: string; address?: string; contactName?: string; contactPhone?: string };
  missingTime?: boolean;
  ownOpenOrders?: number;
  /** Offene Anforderungen als Liste statt als Zahl — eine „7" sagt nicht, was zu tun ist. */
  openOrders?: MaterialOrder[];
  /** Nur Baustellen mit gelber oder roter Ampel. Grün braucht keine Aufmerksamkeit. */
  projectAlerts?: ProjectAlert[];
  /** Beträge statt Anzahl: „3 offene Rechnungen" ist ohne Summe wertlos. */
  invoiceSums?: { open: number; overdue: number };
  /** Salden aller aktiven Mitarbeiter (nur Buchhaltung/GF/Admin). */
  team?: { uid: string; name: string; saldoH: number; hasConfig: boolean; gapDays: number }[];
}

/** Rollen-spezifisches Zuhause mit echten Kennzahlen (portiert aus Legacy-Dashboard). */
export default function DashboardView() {
  const { user, company } = useAuth();
  const [data, setData] = useState<DashData>({});
  /**
   * Welche Bloecke noch unterwegs sind.
   *
   * Das Dashboard zeigte waehrend des Ladens schlicht nichts — keine Kachel,
   * kein Hinweis, im Zweifel „Nichts Offenes". Auf einer langsamen Verbindung
   * sah das aus, als fehle der Saldo, und genau so wurde es auch gemeldet.
   * Ein Ladeplatzhalter sagt: die Zahl kommt noch.
   */
  const [laden, setLaden] = useState({ persoenlich: true, betrieblich: true, team: true });
  const personal = user ? shouldShowOvertime(user.role) : false;
  const mgmt = user ? canProcessOrders(user.role) || isGF(user.role) : false;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLaden({ persoenlich: true, betrieblich: true, team: true });

    /**
     * Ergebnisse einzeln nachreichen, statt am Ende alles auf einmal.
     *
     * Vorher lief die ganze Ladefolge in EINEM await-Block und setzte den
     * Zustand erst danach: das Dashboard blieb leer, bis auch die langsamste
     * Abfrage zurueck war. Wer nur seinen Saldo sehen wollte, wartete auf die
     * Rechnungssummen des Betriebs.
     */
    const reiche = (teil: Partial<DashData>) => {
      if (!cancelled) setData((v) => ({ ...v, ...teil }));
    };

    /**
     * Alle Zeiteintraege — genau EINMAL, auch wenn zwei Auswertungen sie
     * brauchen. Vorher holte die Geschaeftsfuehrung sie doppelt: einmal fuer
     * das Projekt-Radar und einmal fuer die Team-Salden. Bei zwanzig
     * Monteuren ueber mehrere Jahre ist das die teuerste Abfrage der App,
     * und sie lief zweimal nebeneinander.
     */
    let alleEintraege: Promise<TimeEntry[]> | null = null;
    const zeiteintraege = () => {
      alleEintraege ??= listAllEntries(user.companyId);
      return alleEintraege;
    };

    /** Persoenliches: Saldo, heutiger Einsatz, fehlende Zeit. */
    const persoenlich = async () => {
      const out: DashData = {};
      if (personal || user.role === 'Mitarbeiter') {
        const [profile, entries, assignments]: [AppUser | null, TimeEntry[], Assignment[]] =
          await Promise.all([
            getUserByUid(user.companyId, user.uid),
            listOwnEntries(user.companyId, user.uid),
            listAssignmentsForUser(user.companyId, user.uid),
          ]);
        if (profile) {
          const { saldoH, hasConfig, daysWithoutEntry } = calcOverallSaldo(profile, entries);
          out.saldoH = saldoH;
          out.hasSaldoConfig = hasConfig;
          out.saldoGapDays = daysWithoutEntry;
        }
        const today = todayStr();
        out.todayAssignment = assignments.find((a) => a.date === today);
        // Zur Zuweisung die Baustellen-Stammdaten holen: der Monteur sitzt im
        // Auto und braucht Adresse und Telefonnummer, nicht die Projektnummer.
        if (out.todayAssignment) {
          const projects = await listActiveProjects(user.companyId);
          const p = projects.find(
            (x) => x.projectNumber === out.todayAssignment?.projectNumber,
          );
          if (p) {
            out.todayProject = {
              customerName: p.customerName,
              address: p.address,
              contactName: p.contactName,
              contactPhone: p.contactPhone,
            };
          }
        }
        // Fehlende-Zeit-Warnung: kein Eintrag am letzten Werktag. Am Wochenende
        // und an Feiertagen unterdrückt — sonst mahnt die App am Sonntag
        // (Legacy:5776-5780).
        const now = new Date();
        const todayIsOff = isWeekend(now) || isAustrianHoliday(now);
        const lwd = lastWorkday(now);
        out.missingTime = !todayIsOff && !entries.some((e) => e.date === lwd);
      }
      reiche(out);
      if (!cancelled) setLaden((v) => ({ ...v, persoenlich: false }));
    };

    /** Betriebliches: Anforderungen, Rechnungen, Projekt-Radar. */
    const betrieblich = async () => {
      const out: DashData = {};
      if (mgmt) {
        const [orders, projects, invoices] = await Promise.all([
          listAllOrders(user.companyId),
          listActiveProjects(user.companyId),
          canInvoice(user.role) ? listInvoices(user.companyId) : Promise.resolve([]),
        ]);

        // Anforderungen, die auf die Projektleitung warten — als Liste, damit
        // man sieht WAS zu tun ist, nicht nur wie viel.
        out.openOrders = orders
          .filter((o) => o.transactionType !== 'return' && o.status !== 'Erledigt')
          .sort((a, b) => byNewest(a, b));

        if (canInvoice(user.role)) {
          const sum = (s: string) =>
            invoices
              .filter((i) => i.paymentStatus === s)
              .reduce((a, i) => a + (i.totalBrutto ?? 0), 0);
          out.invoiceSums = { open: sum('Offen'), overdue: sum('Überfällig') };
        }

        // Projekt-Radar: nur Baustellen, deren Budget knapp wird oder gerissen
        // ist. Eine grüne Baustelle braucht keinen Platz auf dem Dashboard.
        if (isGF(user.role)) {
          const allEntries = await zeiteintraege();
          const byProject = groupProjectHours(allEntries);
          out.projectAlerts = projects
            .map((p) => {
              const hours = byProject.find(
                (h) => h.projectNumber === normProjectNumber(p.projectNumber),
              );
              const fachMin = hours?.fachMin ?? 0;
              const state = calcBudgetState(fachMin, p.estimatedHours);
              return {
                projectNumber: p.projectNumber,
                customerName: p.customerName,
                pct: state.pct,
                over: state.over,
                usedH: Math.round((fachMin / 60) * 10) / 10,
                estimatedHours: p.estimatedHours ?? 0,
                tone: state.tone,
              };
            })
            .filter((p) => p.tone === 'warning' || p.tone === 'danger')
            .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
        }
      } else if (user.role === 'Mitarbeiter') {
        // Gezielt nur die eigenen Bestellungen: den ganzen Betrieb zu laden,
        // um die eigenen zu zählen, ist unnötig und gibt fremde Daten preis.
        const orders = await listOwnOrders(user.companyId, user.uid);
        out.ownOpenOrders = orders.filter(
          (o) => o.status !== 'Erledigt' && o.transactionType !== 'return',
        ).length;
      }
      reiche(out);
      if (!cancelled) setLaden((v) => ({ ...v, betrieblich: false }));
    };

    /**
     * Team-Salden (Legacy:5388-5465) — der schnellste Zugriff der
     * Geschaeftsfuehrung auf den Stand aller Mitarbeiter. Bewusst zuletzt
     * nachgereicht: das ist die schwerste der drei Auswertungen, und sie darf
     * die beiden anderen nicht aufhalten.
     */
    const team = async () => {
      const out: DashData = {};
      if (canEditTime(user.role)) {
        const [allUsers, allEntries] = await Promise.all([
          listUsers(user.companyId),
          zeiteintraege(),
        ]);
        out.team = allUsers
          .filter((u) => shouldShowOvertime(u.role) && u.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .map((u) => {
            const { saldoH, hasConfig, daysWithoutEntry } = calcOverallSaldo(
              u,
              allEntries.filter((e) => e.userId === u.uid),
            );
            return { uid: u.uid, name: u.name, saldoH, hasConfig, gapDays: daysWithoutEntry };
          });
      }
      reiche(out);
      if (!cancelled) setLaden((v) => ({ ...v, team: false }));
    };

    // Nebeneinander statt nacheinander. Faellt ein Teil aus, stehen die
    // anderen trotzdem da — vorher riss ein Fehler das ganze Dashboard mit.
    void Promise.allSettled([persoenlich(), betrieblich(), team()]);
    return () => {
      cancelled = true;
    };
  }, [user, personal, mgmt]);

  // Grundregel gegen ein überladenes wie gegen ein leeres Dashboard: jede
  // Karte erscheint nur mit Inhalt. Bleibt dann gar nichts übrig, steht dort
  // eine ruhige Zeile statt einer Wand aus Nullen.
  /**
   * Wer ein Zeitkonto fuehrt, bekommt die Saldo-Kachel — unabhaengig davon,
   * ob ein Startdatum hinterlegt ist. `hasSaldoConfig` sagt nur, OB gerechnet
   * werden konnte; es als Sichtbarkeitsschalter zu verwenden war der Fehler.
   */
  const zeigeSaldo = personal;

  // Waehrend noch geladen wird, ist „nichts Offenes" eine Behauptung, die
  // sich gleich als falsch herausstellen kann.
  const nochAmLaden = laden.persoenlich || laden.betrieblich || laden.team;
  const nothingToShow =
    !nochAmLaden &&
    !data.missingTime &&
    !data.todayAssignment &&
    !zeigeSaldo &&
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

      {data.missingTime && (
        <div className="rounded border border-warning/30 bg-warning-bg p-4 text-warning" role="alert">
          <p className="font-semibold">Zeit fehlt</p>
          <p className="mt-1 text-sm">
            Für den letzten Werktag ({lastWorkday(new Date())}) ist nichts gebucht.{' '}
            <Link to="/time" className="font-semibold underline">Jetzt nachtragen</Link>
          </p>
        </div>
      )}

      {/* KI-Erfassung als Primäraktion: mobil kompakter Button, ab sm volle
          Karte. Ausgeblendet, solange die Spracherfassung nicht scharf ist. */}
      {VOICE_ENABLED && (
      <Link
        to="/voice"
        className="flex min-h-touch items-center gap-3 rounded-lg bg-brand px-4 py-3 text-brand-fg shadow-sm transition hover:opacity-95 active:scale-[0.99] sm:gap-4"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 sm:h-12 sm:w-12">
          <Icon name="mic" size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Spracherfassung starten</span>
          <span className="mt-0.5 hidden text-sm text-brand-fg/80 sm:block">
            15 Sekunden sprechen → Zeit, Material, Folgetermin als bestätigbare Karten
          </span>
        </span>
      </Link>
      )}

      {/* Heutiger Einsatz — für den Monteur die wichtigste Information des
          Tages, deshalb ganz oben und mit dem, was im Auto zählt: Adresse
          und eine wählbare Telefonnummer. */}
      {user.role === 'Mitarbeiter' && data.todayAssignment && (
        <Card title="Heute">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
            {data.todayProject?.customerName ?? `Baustelle ${data.todayAssignment.projectNumber}`}
            {data.todayAssignment.asHelper && <Badge tone="warning">Helfer</Badge>}
          </p>
          <p className="text-sm text-ink-muted">{data.todayAssignment.projectNumber}</p>
          {data.todayProject?.address && (
            <p className="mt-2 text-ink">{data.todayProject.address}</p>
          )}
          {data.todayProject?.contactPhone && (
            // tel:-Link statt abgetippter Nummer — ein Griff statt sieben.
            <a
              href={`tel:${data.todayProject.contactPhone.replace(/\s/g, '')}`}
              className="mt-2 inline-flex min-h-touch items-center gap-2 font-semibold text-brand underline"
            >
              {data.todayProject.contactName ?? 'Ansprechpartner'}:{' '}
              {data.todayProject.contactPhone}
            </a>
          )}
          {data.todayAssignment.comment && (
            <p className="mt-2 rounded-sm bg-surface-2 p-2 text-sm text-ink">
              {data.todayAssignment.comment}
            </p>
          )}
        </Card>
      )}

      {/* Kennzahlen. Jede Kachel erscheint nur, wenn sie für diese Rolle
          etwas aussagt — leere Platzhalter machen ein Dashboard unruhig,
          ohne etwas beizutragen. */}
      {/* Solange die Zahlen unterwegs sind, steht dort ein Platzhalter in der
          Hoehe, die der Inhalt gleich einnimmt — nichts springt beim
          Eintreffen, und niemand haelt die Luecke fuer einen Fehler. */}
      {laden.persoenlich && zeigeSaldo && <SkeletonMetrics count={1} />}
      {(!laden.persoenlich || data.ownOpenOrders !== undefined || data.invoiceSums) &&
        (zeigeSaldo || data.ownOpenOrders !== undefined || data.invoiceSums) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {/* Die Kachel erscheint fuer jeden mit Zeitkonto — auch ohne
              hinterlegtes Startdatum. Vorher verschwand sie in dem Fall
              kommentarlos, und der Mitarbeiter sah schlicht keinen Saldo,
              ohne zu erfahren warum. Die Zeiterfassung machte es laengst
              richtig; hier fehlte es. */}
          {zeigeSaldo && (
            <Metric
              label="Saldo"
              icon="clock"
              tone={
                // Ein unvollständiger Saldo wird NICHT rot dargestellt: die
                // Zahl ist dann kein Befund, sondern eine Datenlücke.
                !data.hasSaldoConfig
                  ? 'default'
                  : (data.saldoGapDays ?? 0) > 0
                    ? 'warning'
                    : (data.saldoH ?? 0) >= 0
                      ? 'success'
                      : 'danger'
              }
              value={
                data.hasSaldoConfig
                  ? `${(data.saldoH ?? 0) > 0 ? '+' : ''}${data.saldoH} h`
                  : '—'
              }
              hint={
                !data.hasSaldoConfig
                  ? 'Kein Startdatum hinterlegt'
                  : (data.saldoGapDays ?? 0) > 0
                    ? `${data.saldoGapDays} Tage ohne Buchung — unvollständig`
                    : undefined
              }
            />
          )}
          {data.ownOpenOrders !== undefined && data.ownOpenOrders > 0 && (
            <Metric label="Material" icon="package" value={data.ownOpenOrders} hint="von dir angefordert" />
          )}
          {data.invoiceSums && data.invoiceSums.overdue > 0 && (
            <Metric label="Überfällig" icon="receipt" tone="danger" value={fmtEUR(data.invoiceSums.overdue)} />
          )}
          {data.invoiceSums && data.invoiceSums.open > 0 && (
            <Metric label="Offene Rechnungen" icon="receipt" value={fmtEUR(data.invoiceSums.open)} />
          )}
        </div>
      )}

      {/* Projekt-Radar: nur was aus dem Ruder läuft. Eine grüne Baustelle
          steht hier bewusst nicht — sie braucht keine Entscheidung. */}
      {data.projectAlerts && data.projectAlerts.length > 0 && (
        <Card
          title="Baustellen am Limit"
          action={
            <Link to="/accounting" className="text-sm font-semibold text-brand underline">
              Alle Baustellen
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.projectAlerts.map((p) => (
              <li key={p.projectNumber} className="flex min-h-touch items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{p.customerName}</span>
                  <span className="block text-xs text-ink-muted">
                    {p.usedH} von {p.estimatedHours} h · {p.projectNumber}
                  </span>
                </span>
                <Badge tone={p.over ? 'danger' : 'warning'}>
                  {p.over ? 'überschritten' : `${p.pct} %`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Offene Materialanforderungen — als Liste, weil eine Zahl nicht sagt,
          was der Monteur auf der Baustelle braucht. */}
      {data.openOrders && data.openOrders.length > 0 && (
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

      {/* Team-Salden (Buchhaltung/GF/Admin) */}
      {data.team && data.team.length > 0 && (
        <Card
          title="Team-Salden"
          action={
            <Link to="/accounting" className="text-sm font-semibold text-brand underline">
              Zur Monatsauswertung
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {data.team.map((t) => (
              <li key={t.uid} className="flex min-h-touch items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{t.name}</span>
                  {t.gapDays > 0 && (
                    <span className="block text-xs text-warning">
                      {t.gapDays} Tage ohne Buchung
                    </span>
                  )}
                </span>
                {t.hasConfig ? (
                  <Badge tone={t.gapDays > 0 ? 'warning' : t.saldoH >= 0 ? 'success' : 'danger'}>
                    {t.saldoH > 0 ? '+' : ''}
                    {t.saldoH} h
                  </Badge>
                ) : (
                  <Badge tone="gray">kein Startdatum</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Ist nichts zu tun, sagt das Dashboard das in einer Zeile — statt
          fünf leere Karten zu zeigen. */}
      {nochAmLaden && !zeigeSaldo && (
        <Card>
          <LoadingState />
        </Card>
      )}

      {nothingToShow && (
        <Card>
          <p className="text-ink-muted">
            Nichts Offenes. {user.role === 'Mitarbeiter' ? 'Zeit buchen über die Leiste unten.' : ''}
          </p>
        </Card>
      )}

    </div>
  );
}
