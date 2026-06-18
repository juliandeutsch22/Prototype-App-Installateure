import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { navForRole } from '@/app/navigation';
import { getUserByUid } from '@/lib/db/users';
import { listOwnEntries } from '@/lib/db/timeEntries';
import { listAssignmentsForUser } from '@/lib/db/assignments';
import { listAllOrders } from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import { listInvoices } from '@/lib/db/invoices';
import { calcOverallSaldo, lastWorkday, todayStr } from '@/lib/time';
import { shouldShowOvertime, canProcessOrders, isGF, canInvoice } from '@/lib/permissions';
import type { AppUser, Assignment, MaterialOrder, TimeEntry } from '@/types';
import Card from '@/components/Card';
import Metric from '@/components/Metric';
import Badge from '@/components/Badge';
import PageHeader from '@/components/PageHeader';

interface DashData {
  saldoH?: number;
  hasSaldoConfig?: boolean;
  todayAssignment?: Assignment;
  missingTime?: boolean;
  ownOpenOrders?: number;
  companyOpenOrders?: number;
  activeProjects?: number;
  openInvoices?: number;
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
        // Fehlende-Zeit-Warnung: kein Eintrag am letzten Werktag
        const lwd = lastWorkday(new Date());
        out.missingTime = !entries.some((e) => e.date === lwd);
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
        const orders = await listAllOrders(user.companyId);
        out.ownOpenOrders = orders.filter(
          (o) => o.userId === user.uid && o.status !== 'Erledigt' && o.transactionType !== 'return',
        ).length;
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

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {data.hasSaldoConfig && (
          <Metric
            label="Überstunden-Saldo"
            tone={(data.saldoH ?? 0) >= 0 ? 'success' : 'danger'}
            value={`${(data.saldoH ?? 0) > 0 ? '+' : ''}${data.saldoH} h`}
          />
        )}
        {data.ownOpenOrders !== undefined && (
          <Metric label="Offene Bestellungen" value={data.ownOpenOrders} hint="von dir" />
        )}
        {data.companyOpenOrders !== undefined && (
          <Metric label="Offene Bestellungen" value={data.companyOpenOrders} />
        )}
        {data.activeProjects !== undefined && (
          <Metric label="Aktive Baustellen" value={data.activeProjects} />
        )}
        {data.openInvoices !== undefined && canInvoice(user.role) && (
          <Metric label="Offene Rechnungen" value={data.openInvoices} />
        )}
      </div>

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

      <Card title="Schnellzugriff">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex min-h-touch items-center justify-center rounded border border-line bg-surface-2 p-4 text-center font-medium text-ink transition hover:border-brand active:scale-[0.98]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Card>

      <Card title="KI-Erfassung">
        <p className="mb-3 text-ink-muted">
          Sprich 15 Sekunden — Zeit, Material und Folgetermin werden automatisch als
          bestätigbare Karten vorbereitet. Nichts wird ohne deine Bestätigung gespeichert.
        </p>
        <Link
          to="/voice"
          className="inline-flex min-h-touch items-center rounded bg-brand px-4 py-2 font-semibold text-brand-fg transition hover:opacity-90 active:scale-[0.98]"
        >
          🎤 Spracherfassung starten
        </Link>
      </Card>
    </div>
  );
}
