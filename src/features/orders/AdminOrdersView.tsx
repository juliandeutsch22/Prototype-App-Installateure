import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeAllOrders, updateOrderStatus, deleteOrder, ORDER_STATUS_FLOW } from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import type { MaterialOrder } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { List, ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** Material-Dashboard: Bestellungen abarbeiten, Status weiterschalten. */
export default function AdminOrdersView() {
  const { user } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<MaterialOrder> | null>(null);

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

  async function advance(o: WithId<MaterialOrder>) {
    const idx = ORDER_STATUS_FLOW.indexOf(o.status);
    const next = ORDER_STATUS_FLOW[idx + 1];
    if (!next) return;
    setBusyId(o.id);
    try {
      await updateOrderStatus(o.id, next);
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;
  const openOrders = orders.filter((o) => o.transactionType !== 'return');

  return (
    <div className="space-y-6">
      <PageHeader title="Material-Dashboard" subtitle="Bestellungen bearbeiten und Status weiterschalten" />
      <Card title="Bestellungen">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : openOrders.length === 0 ? (
          <EmptyState>Aktuell keine offenen Bestellungen.</EmptyState>
        ) : (
          <List>
            {openOrders.map((o) => (
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
                    {o.note && ` · ${o.note}`}
                  </>
                }
              >
                <StatusBadge status={o.status} />
                {o.status !== 'Erledigt' && (
                  <Button variant="secondary" loading={busyId === o.id} onClick={() => advance(o)}>
                    → {ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(o.status) + 1]}
                  </Button>
                )}
                <IconButton label="Bestellung löschen" tone="danger" onClick={() => setToDelete(o)}>
                  ✕
                </IconButton>
              </ListRow>
            ))}
          </List>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Bestellung löschen?"
        message={toDelete ? `${toDelete.materialName} ×${toDelete.quantity} wird entfernt.` : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await deleteOrder(toDelete.id);
            toast.success('Bestellung gelöscht');
          }
          setToDelete(null);
        }}
      />
    </div>
  );
}
