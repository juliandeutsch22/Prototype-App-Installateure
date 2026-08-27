import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import {
  subscribeAllOrders,
  updateOrderStatus,
  deleteOrder,
  ORDER_STATUS_FLOW,
} from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import type { MaterialOrder } from '@/types';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';
import MaterialCatalog from './MaterialCatalog';

type Tab = 'aktiv' | 'retouren' | 'archiv' | 'katalog';

const CONDITION_LABEL: Record<string, string> = {
  neu: 'Neu / OVP',
  gebraucht: 'Gebraucht',
  defekt: 'Defekt',
};

/** Material-Dashboard: Bestellungen abarbeiten, Retouren sichten, Katalog pflegen. */
export default function AdminOrdersView() {
  const { user } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<MaterialOrder> | null>(null);
  const [tab, setTab] = useState<Tab>('aktiv');
  const [projectFilter, setProjectFilter] = useState('');
  /** Bestätigung vor dem Abschluss — dabei wird das Lager reduziert. */
  const [toComplete, setToComplete] = useState<WithId<MaterialOrder> | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAllOrders(
      user.companyId,
      (rows) => {
        setOrders(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  const purchases = useMemo(() => orders.filter((o) => o.transactionType !== 'return'), [orders]);
  const returns = useMemo(() => orders.filter((o) => o.transactionType === 'return'), [orders]);

  const projectOptions = useMemo(
    () => [...new Set(purchases.map((o) => o.projectNumber).filter(Boolean))].sort() as string[],
    [purchases],
  );

  const rows = useMemo(() => {
    const base =
      tab === 'retouren'
        ? returns
        : tab === 'archiv'
          ? purchases.filter((o) => o.status === 'Erledigt')
          : purchases.filter((o) => o.status !== 'Erledigt');
    return projectFilter ? base.filter((o) => o.projectNumber === projectFilter) : base;
  }, [tab, purchases, returns, projectFilter]);

  const activeCount = purchases.filter((o) => o.status !== 'Erledigt').length;

  async function setStatus(o: WithId<MaterialOrder>, next: MaterialOrder['status']) {
    if (next === o.status) return;
    setBusyId(o.id);
    try {
      await updateOrderStatus(o.id, next);
      toast.success(`Status: ${next}`);
    } catch {
      // Ohne diesen Zweig blieb ein fehlgeschlagenes Update unbemerkt: der
      // Status sprang nicht um, der Nutzer sah aber keinerlei Hinweis.
      toast.error('Der Status konnte nicht geändert werden.');
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'aktiv', label: 'Offen', count: activeCount },
    { key: 'retouren', label: 'Retouren', count: returns.length },
    { key: 'archiv', label: 'Erledigt' },
    { key: 'katalog', label: 'Katalog' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material-Dashboard"
        subtitle="Bestellungen bearbeiten, Retouren sichten und den Katalog pflegen"
      />

      {/* Aktiver Reiter mit roter Unterkante — wie die Tabs im Prototyp. */}
      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-touch shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition ${
              tab === t.key
                ? 'border-b-accent font-bold text-brand'
                : 'border-b-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <Badge tone="gray">{t.count}</Badge>}
          </button>
        ))}
      </div>

      {tab === 'katalog' ? (
        <MaterialCatalog />
      ) : (
        <Card
          title={tab === 'retouren' ? 'Retouren' : tab === 'archiv' ? 'Erledigt' : 'Offene Bestellungen'}
          action={
            tab !== 'retouren' && projectOptions.length > 0 ? (
              <SelectField id="ofilter" label="" className="py-1 text-sm" value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">Alle Baustellen</option>
                {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </SelectField>
            ) : undefined
          }
        >
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyState>
              {tab === 'retouren'
                ? 'Keine Retouren erfasst.'
                : tab === 'archiv'
                  ? 'Noch nichts erledigt.'
                  : 'Aktuell keine offenen Bestellungen.'}
            </EmptyState>
          ) : (
            <List>
              {rows.map((o) => (
                <ListRow
                  key={o.id}
                  title={
                    <span>
                      {o.materialName} <span className="font-mono text-ink-muted">×{o.quantity}</span>
                    </span>
                  }
                  subtitle={
                    <>
                      {o.userName}
                      {o.projectNumber && ` · ${o.projectNumber}`}
                      {o.condition && ` · ${CONDITION_LABEL[o.condition] ?? o.condition}`}
                      {o.note && ` · ${o.note}`}
                    </>
                  }
                >
                  {o.transactionType === 'return' ? (
                    <Badge tone="info">Retoure</Badge>
                  ) : (
                    <StatusBadge status={o.status} />
                  )}

                  {/* Freie Statuswahl statt nur "einen Schritt vor": eine
                      versehentlich abgeschlossene Bestellung war sonst nicht
                      mehr zurückzuholen. */}
                  {o.transactionType !== 'return' && (
                    <SelectField
                      id={`st-${o.id}`}
                      label=""
                      className="py-1 text-sm"
                      value={o.status}
                      disabled={busyId === o.id}
                      onChange={(e) => {
                        const next = e.target.value as MaterialOrder['status'];
                        if (next === 'Erledigt') setToComplete(o);
                        else void setStatus(o, next);
                      }}
                    >
                      {ORDER_STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                    </SelectField>
                  )}

                  <IconButton label={`${o.materialName} löschen`} tone="danger" onClick={() => setToDelete(o)}>
                    ✕
                  </IconButton>
                </ListRow>
              ))}
            </List>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!toComplete}
        title="Bestellung abschließen?"
        message={
          toComplete
            ? `„${toComplete.materialName}" ×${toComplete.quantity} wird als erledigt gebucht und vom Lagerbestand abgezogen.`
            : ''
        }
        onCancel={() => setToComplete(null)}
        onConfirm={async () => {
          if (toComplete) await setStatus(toComplete, 'Erledigt');
          setToComplete(null);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eintrag löschen?"
        message={toDelete ? `„${toDelete.materialName}" ×${toDelete.quantity} wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteOrder(toDelete.id);
            toast.success('Eintrag gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
