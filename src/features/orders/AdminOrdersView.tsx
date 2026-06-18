import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeAllOrders, updateOrderStatus, deleteOrder, ORDER_STATUS_FLOW } from '@/lib/db/materialOrders';
import type { WithId } from '@/lib/db/core';
import type { MaterialOrder } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

const STATUS_TONE: Record<MaterialOrder['status'], 'gray' | 'amber' | 'blue' | 'green'> = {
  Offen: 'gray',
  'In Bearbeitung': 'amber',
  Abholbereit: 'blue',
  Erledigt: 'green',
};

/** Material-Dashboard: Bestellungen abarbeiten, Status weiterschalten. */
export default function AdminOrdersView() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<WithId<MaterialOrder>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      <h1 className="text-2xl font-bold text-gray-900">Material-Dashboard</h1>
      <Card title="Bestellungen">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : openOrders.length === 0 ? (
          <EmptyState>Keine Bestellungen.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {openOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {o.materialName} <span className="font-mono">×{o.quantity}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {o.userName}
                    {o.projectNumber && ` · ${o.projectNumber}`}
                    {o.note && ` · ${o.note}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  {o.status !== 'Erledigt' && (
                    <Button
                      variant="secondary"
                      loading={busyId === o.id}
                      onClick={() => advance(o)}
                    >
                      → {ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(o.status) + 1]}
                    </Button>
                  )}
                  <button
                    aria-label="Löschen"
                    className="min-h-touch px-2 text-gray-400 hover:text-red-600"
                    onClick={() => void deleteOrder(o.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
