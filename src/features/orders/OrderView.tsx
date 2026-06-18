import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { subscribeMaterials } from '@/lib/db/materials';
import { createMaterialOrder } from '@/lib/db/materialOrders';
import { listActiveProjects } from '@/lib/db/projects';
import type { WithId } from '@/lib/db/core';
import type { Material, Project } from '@/types';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import { List, ListRow } from '@/components/ListRow';
import { InputField, SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';

/** Material bestellen: Katalog -> Warenkorb -> Sammelbestellung (canOrder). */
export default function OrderView() {
  const { user } = useAuth();
  const toast = useToast();
  const [materials, setMaterials] = useState<WithId<Material>[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [projectNumber, setProjectNumber] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    listActiveProjects(user.companyId).then(setProjects).catch(() => undefined);
    const unsub = subscribeMaterials(
      user.companyId,
      (rows) => {
        setMaterials(rows);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  const filtered = useMemo(
    () =>
      materials.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())),
    [materials, search],
  );
  const cartItems = Object.entries(cart).filter(([, q]) => q > 0);

  function setQty(id: string, qty: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));
  }

  async function submit() {
    if (!user || cartItems.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        cartItems.map(([matId, qty]) => {
          const mat = materials.find((m) => m.id === matId);
          return createMaterialOrder(user.companyId, {
            materialId: matId,
            materialName: mat?.name ?? '',
            quantity: qty,
            note,
            projectNumber,
            status: 'Offen',
            transactionType: 'order',
            userId: user.uid,
            userName: user.name,
            source: 'manual',
          });
        }),
      );
      setCart({});
      setNote('');
      toast.success('Bestellung aufgegeben');
    } catch {
      setError('Die Bestellung konnte nicht aufgegeben werden.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Material bestellen" subtitle="Aus dem Katalog wählen und Sammelbestellung aufgeben" />

      <Card title="Bestelldetails">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="oproject"
            label="Baustelle (optional)"
            value={projectNumber}
            onChange={(e) => setProjectNumber(e.target.value)}
          >
            <option value="">— keine —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.projectNumber}>
                {p.customerName} ({p.projectNumber})
              </option>
            ))}
          </SelectField>
          <InputField id="onote" label="Notiz" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Card>

      <Card title="Katalog">
        <InputField
          id="search"
          label="Suche"
          placeholder="Material suchen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-4">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : filtered.length === 0 ? (
            <EmptyState>Kein Material im Katalog.</EmptyState>
          ) : (
            <List>
              {filtered.map((m) => (
                <ListRow
                  key={m.id}
                  title={m.name}
                  subtitle={`${m.category || 'ohne Kategorie'} · Lager: ${m.stock ?? 0}`}
                >
                  <input
                    type="number"
                    min="0"
                    aria-label={`Menge ${m.name}`}
                    className="min-h-touch w-24 rounded border border-line px-3 py-2 text-ink focus:border-brand focus:ring-1 focus:ring-brand"
                    value={cart[m.id] || ''}
                    onChange={(e) => setQty(m.id, Number(e.target.value))}
                  />
                </ListRow>
              ))}
            </List>
          )}
        </div>
      </Card>

      <Card title={`Warenkorb (${cartItems.length})`}>
        {cartItems.length === 0 ? (
          <EmptyState>Noch nichts ausgewählt.</EmptyState>
        ) : (
          <ul className="mb-4 space-y-1">
            {cartItems.map(([id, qty]) => (
              <li key={id} className="flex justify-between text-ink">
                <span>{materials.find((m) => m.id === id)?.name}</span>
                <span className="font-mono">×{qty}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button onClick={submit} loading={saving} disabled={cartItems.length === 0}>
            Bestellung aufgeben
          </Button>
        </div>
      </Card>
    </div>
  );
}
