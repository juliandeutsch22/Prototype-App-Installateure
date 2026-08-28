import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { navForRole } from '@/app/navigation';
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

interface DashData {
  saldoH?: number;
  hasSaldoConfig?: boolean;
  todayAssignment?: Assignment;
  missingTime?: boolean;
  ownOpenOrders?: number;
  companyOpenOrders?: number;
  activeProjects?: number;
  openInvoices?: number;
  /** Salden aller aktiven Mitarbeiter (nur Buchhaltung/GF/Admin). */
  team?: { uid: string; name: string; saldoH: number; hasConfig: boolean }[];
}

/** Rollen-spezifisches Zuhause mit echten Kennzahlen (portiert aus Legacy-Dashboard). */
export default function DashboardView() {
  const { user, company } = useAuth();
  const [data, setData] = useState<DashData>({});
  const personal = user ? shouldShowOvertime(user.role) : false;
  const mgmt = user ? canProcessOrders(user.role) || isGF(user.role) : false;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const out: DashData = {};

      if (personal || user.role === 'Mitarbeiter') {
        const [profile, entries, assignments]: [AppUser | null, TimeEntry[], Assignment[]] =
          await Promise.all([
            getUserByUid(user.companyId, user.uid),
            listOwnEntries(user.companyId, user.uid),
            listAssignmentsForUser(user.companyId, user.uid),
          ]);
        if (profile) {
          const { saldoH, hasConfig } = calcOverallSaldo(profile, entries);
          out.saldoH = saldoH;
          out.hasSaldoConfig = hasConfig;
        }
        const today = todayStr();
        out.todayAssignment = assignments.find((a) => a.date === today);
        // Fehlende-Zeit-Warnung: kein Eintrag am letzten Werktag. Am Wochenende
        // und an Feiertagen unterdrückt — sonst mahnt die App am Sonntag
        // (Legacy:5776-5780).
        const now = new Date();
        const todayIsOff = isWeekend(now) || isAustrianHoliday(now);
        const lwd = lastWorkday(now);
        out.missingTime = !todayIsOff && !entries.some((e) => e.date === lwd);
      }

      if (mgmt) {
        const [orders, projects, invoices]: [MaterialOrder[], unknown[], { paymentStatus: string }[]] =
          await Promise.all([
            listAllOrders(user.companyId),
            listActiveProjects(user.companyId),
            canInvoice(user.role) ? listInvoices(user.companyId) : Promise.resolve([]),
          ]);
        out.companyOpenOrders = orders.filter(
          (o) => o.transactionType !== 'return' && o.status !== 'Erledigt',
        ).length;
        out.activeProjects = projects.length;
        out.openInvoices = invoices.filter(
          (i) => i.paymentStatus === 'Offen' || i.paymentStatus === 'Überfällig',
        ).length;
      } else if (user.role === 'Mitarbeiter') {
        // Gezielt nur die eigenen Bestellungen: den ganzen Betrieb zu laden,
        // um die eigenen zu zählen, ist unnötig und gibt fremde Daten preis.
        const orders = await listOwnOrders(user.companyId, user.uid);
        out.ownOpenOrders = orders.filter(
          (o) => o.status !== 'Erledigt' && o.transactionType !== 'return',
        ).length;
      }

      // Team-Salden auf einen Blick (Legacy:5388-5465) — der schnellste
      // Zugriff der Geschäftsführung auf den Stand aller Mitarbeiter.
      if (canEditTime(user.role)) {
        const [allUsers, allEntries] = await Promise.all([
          listUsers(user.companyId),
          listAllEntries(user.companyId),
        ]);
        out.team = allUsers
          .filter((u) => shouldShowOvertime(u.role) && u.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'de'))
          .map((u) => {
            const { saldoH, hasConfig } = calcOverallSaldo(
              u,
              allEntries.filter((e) => e.userId === u.uid),
            );
            return { uid: u.uid, name: u.name, saldoH, hasConfig };
          });
      }

      if (!cancelled) setData(out);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, personal, mgmt]);

  const items = useMemo(() => (user ? navForRole(user.role).filter((i) => i.path !== '/') : []), [user]);
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

      {/* KI-Erfassung als Primäraktion: mobil kompakter Button, ab sm volle Karte */}
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

      {/* Kennzahlen */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Überblick</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.hasSaldoConfig && (
            <Metric
              label="Überstunden-Saldo"
              icon="clock"
              tone={(data.saldoH ?? 0) >= 0 ? 'success' : 'danger'}
              value={`${(data.saldoH ?? 0) > 0 ? '+' : ''}${data.saldoH} h`}
            />
          )}
          {data.ownOpenOrders !== undefined && (
            <Metric label="Offene Bestellungen" icon="package" value={data.ownOpenOrders} hint="von dir" />
          )}
          {data.companyOpenOrders !== undefined && (
            <Metric label="Offene Bestellungen" icon="package" value={data.companyOpenOrders} />
          )}
          {data.activeProjects !== undefined && (
            <Metric label="Aktive Baustellen" icon="building" value={data.activeProjects} />
          )}
          {data.openInvoices !== undefined && canInvoice(user.role) && (
            <Metric label="Offene Rechnungen" icon="receipt" value={data.openInvoices} />
          )}
        </div>
      </section>

      {/* Heutiger Einsatz (Außendienst) */}
      {user.role === 'Mitarbeiter' && (
        <Card title="Heutiger Einsatz">
          {data.todayAssignment ? (
            <div>
              <p className="flex items-center gap-2 font-medium text-ink">
                Baustelle {data.todayAssignment.projectNumber}
                {data.todayAssignment.asHelper && <Badge tone="warning">Helfer</Badge>}
              </p>
              {data.todayAssignment.comment && (
                <p className="mt-0.5 text-sm text-ink-muted">{data.todayAssignment.comment}</p>
              )}
            </div>
          ) : (
            <p className="text-ink-muted">Heute kein Einsatz geplant.</p>
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
                <span className="truncate text-ink">{t.name}</span>
                {t.hasConfig ? (
                  <Badge tone={t.saldoH >= 0 ? 'success' : 'danger'}>
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

      <Card title="Schnellzugriff">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex min-h-touch items-center gap-3 rounded border border-line bg-surface-2 px-4 py-3 font-medium text-ink transition hover:border-brand hover:bg-surface active:scale-[0.98]"
            >
              <Icon name={item.icon} size={20} className="shrink-0 text-ink-muted" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
